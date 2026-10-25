// Assemble the app's shipped course data from the pipeline outputs:
//   src/maps.js       base64-JPEG hole maps: the renders of NSS's own minimap
//                     (tools/render-nss-maps.py, captures/derived/render-nss/
//                     hNN.png, the 250x304 frame at 2x); a hole with no render
//                     ships its median-stacked captures as before
//   src/greens.js     the zoomed green views: the renderer's green crops, or
//                     the capture-fused texture where there is no crop
//   src/mapxform.js   old->new fractional transforms (for the one-time
//                     migration of stored positions) + new map px size
//   public/derived.json  per-hole scale, green box, quantized 9x9 slope
//                     grid (app convention: unit direction x magnitude
//                     1|2|3) from NSS's collision (tools/nss-truth.json,
//                     source "nss", rev "nss-<hash>"), pins (NSS's six cups),
//                     the tee (NSS's GlfTeeOBJ), the online platform and the
//                     trees (NSS's, tools/nss-trees.json) in map-fractional
//                     coords; the importable shot rows, each flown over its
//                     hole's terrain (elevFactor, flatEnded), and excludedShots
// Every source of course data is NSS's own (the Switch game's files, through
// tools/nss-export.mjs, nss-truth.mjs, nss-trees-export.mjs and
// render-nss-maps.py); none of them may be missing: a silent fallback to WSR's
// would flip the stored pin ids, the green geometry's rev and the tree ids on
// every build. WSR's data no longer enters derived.json.
//   node tools/build-derived.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import { loadImage, savePng, px, onionInpaint } from "./lib/image.mjs";
import { panelRect, cropRect } from "./lib/panel.mjs";
import { flagCupMask, inCompass } from "./lib/greensurface.mjs";
import { fileMs } from "./lib/ulid.mjs";
import { exifMs } from "./lib/exif.mjs";
import { parseTerrain, heightAt as terrainHeightAt, classAt, lieOf } from "../src/terrain.js";
import { lineProfile, elevFlight } from "../src/model.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = join(ROOT, "captures", "inbox");
const D = join(ROOT, "captures", "derived");
const mapsMeta = JSON.parse(readFileSync(join(D, "maps.json"), "utf8")).holes;
const register = JSON.parse(readFileSync(join(D, "register.json"), "utf8"));
// The rendered hole maps and green crops (tools/render-nss-maps.py: NSS's own
// minimap, the baked textures of Model/MiniMap_Field_Fld_GolfCourseNN with the
// game's minimap shaders and the green's 2 m plaid, placed through
// tools/nss-registration.json into the 250x304 frame at 2x, 3x and 4x, and
// each NSS green box plus its margin at the box's true aspect). A hole that
// has them ships them; one that does not falls back to its median-stacked
// captures and the fused zoom texture, and the log says so. index.json is
// read to check that a render is NSS's art with the 2 m plaid (an earlier
// render with the GreenAreaSize / 25 tile, or another art written here by an
// explicit --out, ships the capture stack instead) and that a crop on disk
// was rendered for the green box the truth now has.
const RENDER = join(D, "render-nss");
let renderIdx = {};
try { renderIdx = JSON.parse(readFileSync(join(RENDER, "index.json"), "utf8")); } catch {}
const renderIndex = renderIdx.holes ?? {};
const RENDER_ART = "nss", RENDER_PLAID_M = 2;
// JPEG quality of the shipped renders. A map at 2x has four times the pixels
// of the stack it replaces, so a 500x608 frame of WSR's dense textures ran
// 62-108 KB at q82 against ~18 KB for a 250x304 stack; at q78 (55-96 KB per
// hole) crops encoded at q78, q80 and q82, shown at 2x of the render, could
// not be told apart, the quantisation hiding in the textures' own noise.
// NSS's baked minimap is smoother and runs about half that at the same
// quality (tools/build-map-scales.mjs's 3x / 4x sets, q78 too). The green
// crops keep q82, as they did for WSR's renders.
const MAP_JPEG_Q = 78, GREEN_JPEG_Q = 82;
let mapBytes = 0, greenBytes = 0, mapsFromRender = 0, greensFromRender = 0;
// NSS collision-mesh truth (tools/nss-truth.json, written by tools/nss-truth.mjs
// from the Switch game's field meshes through tools/nss-registration.json):
// per hole the scale (yd per map px), the green box and outline (NSS's
// GolfGreen triangles) and the 9x9 slope grid with slopeMaxPct. The user's
// rule: NSS's own data is the truth and derived data adjusts to it, so the
// NSS green box replaces the capture projection (outline, pin sightings and
// the transplanted green all follow it) and the NSS scale and slope grid
// replace the capture ones. Required: without it the build stops (a fallback
// to WSR's geometry would flip every hole's rev, and the app would re-apply
// the other geometry on each flip).
let TRUTH = null;
try { TRUTH = JSON.parse(readFileSync(join(ROOT, "tools", "nss-truth.json"), "utf8")).holes; }
catch (e) { console.error(`tools/nss-truth.json: ${e.message}. It is required (rerun node tools/nss-truth.mjs); nothing written.`); process.exit(1); }
{
  const box = (b) => b && ["x0", "y0", "x1", "y1"].every((k) => Number.isFinite(b[k])) && b.x1 > b.x0 && b.y1 > b.y0;
  const bad = [];
  for (let hole = 1; hole <= 21; hole++) {
    const t = TRUTH?.[hole];
    if (!t || !(t.scale > 0) || !box(t.greenBox) || !Array.isArray(t.greenPoly) || t.greenPoly.length < 3
      || !Array.isArray(t.grid) || t.grid.length !== 9 || !t.grid.every((r) => Array.isArray(r) && r.length === 9) || !Number.isFinite(t.slopeMaxPct))
      bad.push(`H${hole}: ${t ? "malformed (scale, greenBox, greenPoly, the 9x9 grid, slopeMaxPct)" : "missing"}`);
  }
  if (bad.length) { console.error(`tools/nss-truth.json refused (rerun node tools/nss-truth.mjs); nothing written:\n  ${bad.join("\n  ")}`); process.exit(1); }
}

const isFlagPink = (p) => p[0] > 190 && p[2] > 120 && p[1] < 110 && p[0] - p[1] > 100;
const colorDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Project the zoom-view green bbox onto the map. Both views render the same
// art north-up and both contain the pin, so the only unknown is the zoom
// factor k (mapPx = pinMap + (zoomPx - pinZoom) * k). Estimate k by
// normalized correlation between the zoom crop and the map around the pin.
// integral image for fast box-blurred grayscale sampling — blurring kills
// the checker/stripe textures (which alias when rescaled and decorrelate the
// two views) so the macro features (bunkers, fringe, water) drive the match
function integralGray(img) {
  const w = img.width, h = img.height;
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const p = px(img, x, y);
      row += 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
      I[(y + 1) * (w + 1) + (x + 1)] = I[y * (w + 1) + (x + 1)] + row;
    }
  }
  return { I, w, h };
}
function boxMean(ig, x, y, r) {
  const x0 = Math.max(0, Math.round(x - r)), y0 = Math.max(0, Math.round(y - r));
  const x1 = Math.min(ig.w, Math.round(x + r + 1)), y1 = Math.min(ig.h, Math.round(y + r + 1));
  if (x1 <= x0 || y1 <= y0) return 0;
  const W = ig.w + 1;
  const s = ig.I[y1 * W + x1] - ig.I[y0 * W + x1] - ig.I[y1 * W + x0] + ig.I[y0 * W + x0];
  return s / ((x1 - x0) * (y1 - y0));
}
function projectGreenBox(mapImg, zoomImg, pinMap, pinZoom, zbox, kLo = 0.1, kHi = 0.5) {
  const zig = integralGray(zoomImg), mig = integralGray(mapImg);
  // sample zoom pixels in the bbox extended 25% (fringe/bunkers give signal)
  const mx = 0.25 * (zbox.x1 - zbox.x0), my = 0.25 * (zbox.y1 - zbox.y0);
  const sx0 = Math.max(0, zbox.x0 - mx), sx1 = Math.min(zoomImg.width - 1, zbox.x1 + mx);
  const sy0 = Math.max(0, zbox.y0 - my), sy1 = Math.min(zoomImg.height - 1, zbox.y1 + my);
  // search k plus a small anchor-offset (pin pole-base detection can be a
  // few px off between the two views)
  let bestK = null, bestR = -2, bestOx = 0, bestOy = 0;
  for (let k = kLo; k <= kHi; k += 0.01) {
    const zr = Math.max(4, 2.5 / k), mr = Math.max(2, zr * k); // matched blur footprints
    for (let oy = -4; oy <= 4; oy += 2)
      for (let ox = -4; ox <= 4; ox += 2) {
        let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
        for (let y = sy0; y <= sy1; y += 4)
          for (let x = sx0; x <= sx1; x += 4) {
            const a = boxMean(zig, x, y, zr);
            const b = boxMean(mig, pinMap.x + ox + (x - pinZoom.x) * k, pinMap.y + oy + (y - pinZoom.y) * k, mr);
            sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; n++;
          }
        const cov = sab / n - (sa / n) * (sb / n);
        const va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
        const r = cov / Math.sqrt(Math.max(va * vb, 1e-9));
        if (r > bestR) { bestR = r; bestK = k; bestOx = ox; bestOy = oy; }
      }
  }
  const k = bestK;
  const box = {
    x0: Math.round(pinMap.x + bestOx + (zbox.x0 - pinZoom.x) * k),
    y0: Math.round(pinMap.y + bestOy + (zbox.y0 - pinZoom.y) * k),
    x1: Math.round(pinMap.x + bestOx + (zbox.x1 - pinZoom.x) * k),
    y1: Math.round(pinMap.y + bestOy + (zbox.y1 - pinZoom.y) * k),
  };
  box.x0 = Math.max(0, box.x0); box.y0 = Math.max(0, box.y0);
  box.x1 = Math.min(mapImg.width - 1, box.x1); box.y1 = Math.min(mapImg.height - 1, box.y1);
  return { box, k, r: bestR, ox: bestOx, oy: bestOy };
}

// (kept for reference; superseded by projectGreenBox)
function greenBoxOnMap(img, pin) {
  const w = img.width, h = img.height;
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = px(img, x, y);
    g[y * w + x] = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
  }
  // local contrast in a 5x5 window
  const hf = new Float32Array(w * h);
  for (let y = 2; y < h - 3; y++) for (let x = 2; x < w - 3; x++) {
    let s = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const i = (y + dy) * w + (x + dx);
      s += Math.abs(g[i] - g[i + 1]) + Math.abs(g[i] - g[i + w]);
    }
    hf[y * w + x] = s / 25;
  }
  let bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (hf[i] > 9) bin[i] = 1;
  // flag area counts as green (it interrupts the checker)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = px(img, x, y);
    if (isFlagPink(p) || (Math.hypot(x - pin.x, y - pin.y) < 5)) bin[y * w + x] = 1;
  }
  const erode = (src) => {
    const out = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (src[i] && src[i - 1] && src[i + 1] && src[i - w] && src[i + w]) out[i] = 1;
    }
    return out;
  };
  const dilate = (src) => {
    const out = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (src[i] || src[i - 1] || src[i + 1] || src[i - w] || src[i + w]) out[i] = 1;
    }
    return out;
  };
  bin = dilate(erode(erode(bin)));
  // component containing (or nearest within 12px of) the pin
  const seen = new Uint8Array(w * h);
  const compOf = (sx, sy) => {
    const q = [sy * w + sx]; seen[sy * w + sx] = 1;
    const pts = [];
    while (q.length) {
      const j = q.pop(); pts.push(j);
      const jx = j % w, jy = (j / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = jx + dx, ny = jy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (bin[k] && !seen[k]) { seen[k] = 1; q.push(k); }
      }
    }
    return pts;
  };
  let pts = null;
  outer: for (let r = 0; r <= 12; r++)
    for (let a = 0; a < 24; a++) {
      const x = Math.round(pin.x + r * Math.cos((a / 24) * 2 * Math.PI));
      const y = Math.round(pin.y + r * Math.sin((a / 24) * 2 * Math.PI));
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (bin[y * w + x] && !seen[y * w + x]) { pts = compOf(x, y); break outer; }
    }
  if (!pts || pts.length < 150) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const j of pts) { const jx = j % w, jy = (j / w) | 0;
    if (jx < x0) x0 = jx; if (jx > x1) x1 = jx; if (jy < y0) y0 = jy; if (jy > y1) y1 = jy; }
  // compensate the double-erode shrink
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1);
  x1 = Math.min(w - 1, x1 + 1); y1 = Math.min(h - 1, y1 + 1);
  return { x0, y0, x1, y1, area: pts.length };
}

// quantize a normalized slope grid to the app's paint convention:
// unit direction * magnitude 1|2|3 (0 stays empty)
function quantizeGrid(grid) {
  return grid.map((row) => row.map(([dx, dy]) => {
    const m = Math.hypot(dx, dy);
    if (m < 0.12) return [0, 0];
    const lvl = m < 0.45 ? 1 : m < 0.75 ? 2 : 3;
    return [+((dx / m) * lvl).toFixed(2), +((dy / m) * lvl).toFixed(2)];
  }));
}

const mapsJs = ["// AUTO-GENERATED by tools/build-derived.mjs: the hole maps, NSS's own minimap",
  "// rendered from the Switch game's files by tools/render-nss-maps.py (500x608 =",
  "// the 250x304 map frame at 2x; a hole with no render ships its median-stacked",
  "// captures at 250x304). Fractional coordinates as always.", "export const HOLE_MAPS = {"];
const greensJs = ["// AUTO-GENERATED by tools/build-derived.mjs: each green, NSS's own minimap green",
  "// (tools/render-nss-maps.py, the Terrain view: the map, the plaid and the height",
  "// bands) in the green's OWN frame: the NSS green box (tools/nss-truth.json)",
  "// plus 12% of it on every side, at the box's true aspect, so box-local (u, v)",
  "// sits at (u + 0.12) / 1.24 of the image (derived.json's greenView carries",
  "// aspect and margin). A hole with no render crop ships the fused, flag-free",
  "// zoom-capture texture instead (256x256, the same margin).",
  "export const GREEN_VIEWS = {"];
const greenMeta = {};
// ---------------------------------------------------------------------------
// GREEN TRANSPLANT (the fallback for a hole with no render, since 2026-10-18;
// the render draws the game's own green)
// The hole overview renders the green about 28px across; the zoomed green
// captures render the same surface 3-8x larger (the projection solves k at
// 0.12-0.37). So rather than patching the overview's green in place, rebuild
// it from the zoom captures and paint it back down.
//
// Every zoom capture is masked for its own flag, pole and cup, then sampled
// into a shared green-local grid — the same bbox-normalized frame the outline
// and height fusion already use, which is what makes captures at different
// zooms and pin positions comparable. Where one capture's flag hides the
// surface, another capture taken at a different pin supplies it. Only cells
// no capture ever saw get inpainted.
const GT = 256;
// The texture covers the green's bbox PLUS this fraction of it on every side.
// Sampling the bbox exactly puts the green hard against all four edges, so
// its outermost lobes and the fringe around them get cut off; the margin
// leaves the whole surface visible with a little context around it.
const GT_MARGIN = 0.12;
// dial + its "N mph" caption, in either bottom corner
const inHud = (x, y, w, h) =>
  y > 0.66 * h && (Math.abs(x - 0.168 * w) < 0.23 * w || Math.abs(x - 0.832 * w) < 0.23 * w);
function greenTexture(g) {
  const sum = new Float64Array(GT * GT * 3), cnt = new Uint16Array(GT * GT);
  let used = 0;
  // Sharpest capture first, and each texel takes the FIRST capture that saw
  // it unobstructed rather than the average of all of them. Averaging across
  // captures at different zooms superimposes slightly misaligned copies of
  // the grid checker and washes it out — H10 fused 12 captures into a nearly
  // flat green. Priority order keeps one capture's crispness and uses the
  // others only to fill what its flag was standing on.
  const ordered = [...(g.sessions ?? [])]
    .filter((s) => !s.cropped)
    .sort((a, b) => ((b.bboxPx.x1 - b.bboxPx.x0) * (b.bboxPx.y1 - b.bboxPx.y0))
                  - ((a.bboxPx.x1 - a.bboxPx.x0) * (a.bboxPx.y1 - a.bboxPx.y0)));
  const pool = ordered.length ? ordered : (g.sessions ?? []);
  for (const s of pool) {
    let img;
    try { img = cropRect(loadImage(join(INBOX, s.plain)), panelRect(loadImage(join(INBOX, s.plain)))); } catch { continue; }
    const b = s.bboxPx, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    if (bw < 8 || bh < 8) continue;
    const { mask } = flagCupMask(img);
    used++;
    for (let gy = 0; gy < GT; gy++) for (let gx = 0; gx < GT; gx++) {
      if (cnt[gy * GT + gx]) continue; // a sharper capture already saw this
      // texture space runs from -MARGIN to 1+MARGIN in bbox units
      const fu = ((gx + 0.5) / GT) * (1 + 2 * GT_MARGIN) - GT_MARGIN;
      const fv = ((gy + 0.5) / GT) * (1 + 2 * GT_MARGIN) - GT_MARGIN;
      const sx = Math.round(b.x0 + fu * bw);
      const sy = Math.round(b.y0 + fv * bh);
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
      if (mask[sy * img.width + sx]) continue;
      // The wind dial sits at the bottom of the zoom panel and overlaps the
      // green bbox on some holes, so its ring and "N mph" caption were being
      // sampled straight into the texture (a visible watermark on H10). The
      // shared inCompass disk covers the dial but not the caption beneath it,
      // so use a taller box here. The dial keeps to one corner per hole, so
      // whatever it covers is never seen and gets inpainted like any other
      // permanently occluded patch.
      if (inHud(sx, sy, img.width, img.height)) continue;
      const si = (sy * img.width + sx) * 4, di = (gy * GT + gx) * 3;
      sum[di] += img.data[si]; sum[di + 1] += img.data[si + 1]; sum[di + 2] += img.data[si + 2];
      cnt[gy * GT + gx]++;
    }
  }
  if (!used) return null;
  const tex = { width: GT, height: GT, data: Buffer.alloc(GT * GT * 4, 255) };
  const holes = new Uint8Array(GT * GT);
  for (let p = 0; p < GT * GT; p++) {
    const j = p * 4, d = p * 3;
    if (!cnt[p]) { holes[p] = 1; continue; }
    tex.data[j] = Math.round(sum[d] / cnt[p]);
    tex.data[j + 1] = Math.round(sum[d + 1] / cnt[p]);
    tex.data[j + 2] = Math.round(sum[d + 2] / cnt[p]);
  }
  onionInpaint(tex, holes);
  // Soften what had to be invented. On a hole with a single capture the whole
  // flag footprint is unknown, and the onion peel fills it in radial spokes
  // that read as streaks across the putting surface. Blurred, it reads as
  // out-of-focus turf — which is honest, since nothing ever saw it.
  for (let pass = 0; pass < 3; pass++) {
    const src = Buffer.from(tex.data);
    for (let p = 0; p < GT * GT; p++) {
      if (!holes[p]) continue;
      const x = p % GT, y = (p / GT) | 0;
      let r = 0, g2 = 0, b = 0, c = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GT || ny >= GT) continue;
        const k = (ny * GT + nx) * 4;
        r += src[k]; g2 += src[k + 1]; b += src[k + 2]; c++;
      }
      const j = p * 4;
      tex.data[j] = Math.round(r / c); tex.data[j + 1] = Math.round(g2 / c); tex.data[j + 2] = Math.round(b / c);
    }
  }
  const covered = 1 - holes.reduce((a, b) => a + b, 0) / (GT * GT);
  return { tex, sessions: used, covered };
}

// Paint the fused zoom texture into the overview over box (map px, may be
// float). The texture covers the green's bbox PLUS GT_MARGIN of it on every
// side, so box fraction c lives at texture coordinate (c + M) / (1 + 2M);
// mapping the box onto the whole texture (as this did until 2026-10) painted
// every green at 81% of its size with fringe texels inside the outline.
// poly is the green outline in box-normalized coords (the truth's outline).
// The texture must also look like the overview there: below
// MIN_TRANSPLANT_R normalized correlation the overview keeps its own art. The
// check runs over the texture's whole footprint (box plus margin), where the
// fringe edge and bunkers give it structure; the putting surface alone is too
// uniform at overview scale to correlate.
const MIN_TRANSPLANT_R = 0.45;
function transplantGreen(hole, img, box, poly, t) {
  if (!box || !t) return { done: false, r: null };
  const W = img.width, H = img.height, M = GT_MARGIN;
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  if (bw < 4 || bh < 4) return { done: false, r: null };
  const tc = (c) => ((c + M) / (1 + 2 * M)) * GT; // box fraction -> texel coordinate
  const xa = Math.max(0, Math.floor(box.x0 - M * bw)), xb = Math.min(W - 1, Math.ceil(box.x1 + M * bw) - 1);
  const ya = Math.max(0, Math.floor(box.y0 - M * bh)), yb = Math.min(H - 1, Math.ceil(box.y1 + M * bh) - 1);
  // Average EVERY texel under each map pixel. Striding through the footprint
  // instead point-samples the green's grid checker and aliases it into moire.
  const cells = [];
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const fu = (x + 0.5 - box.x0) / bw, fv = (y + 0.5 - box.y0) / bh;
    const paint = fu >= 0 && fu <= 1 && fv >= 0 && fv <= 1 && (!poly || pointInPoly(fu, fv, poly));
    const u0 = tc((x - box.x0) / bw), u1 = tc((x + 1 - box.x0) / bw);
    const v0 = tc((y - box.y0) / bh), v1 = tc((y + 1 - box.y0) / bh);
    let r = 0, gg = 0, b = 0, n = 0;
    for (let v = Math.max(0, Math.floor(v0)); v < Math.min(GT, Math.ceil(v1)); v++)
      for (let u = Math.max(0, Math.floor(u0)); u < Math.min(GT, Math.ceil(u1)); u++) {
        const ti = (v * GT + u) * 4;
        r += t.tex.data[ti]; gg += t.tex.data[ti + 1]; b += t.tex.data[ti + 2]; n++;
      }
    if (!n) continue;
    const edge = Math.min(x + 0.5 - box.x0, box.x1 - x - 0.5, y + 0.5 - box.y0, box.y1 - y - 0.5);
    cells.push({ di: (y * W + x) * 4, r: r / n, g: gg / n, b: b / n, a: edge < 0.5 ? 0.5 : 1, paint });
  }
  if (cells.length < 9) return { done: false, r: null };
  // agreement check (luma NCC) and colour match over the same pixels: the zoom
  // captures are lit slightly differently, so shift the texture by the mean
  // difference or the transplant reads as a patch with a seam
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  let sm = 0, st = 0, dR = 0, dG = 0, dB = 0, np = 0;
  for (const c of cells) {
    const d = img.data; sm += lum(d[c.di], d[c.di + 1], d[c.di + 2]); st += lum(c.r, c.g, c.b);
    if (c.paint) { dR += d[c.di] - c.r; dG += d[c.di + 1] - c.g; dB += d[c.di + 2] - c.b; np++; }
  }
  const n = cells.length; sm /= n; st /= n;
  if (np < 9) return { done: false, r: null };
  dR /= np; dG /= np; dB /= np; // colour match over the painted pixels only
  let num = 0, vm = 0, vt = 0;
  for (const c of cells) { const d = img.data; const a = lum(d[c.di], d[c.di + 1], d[c.di + 2]) - sm, q = lum(c.r, c.g, c.b) - st; num += a * q; vm += a * a; vt += q * q; }
  const ncc = vm > 0 && vt > 0 ? num / Math.sqrt(vm * vt) : 0;
  if (ncc < MIN_TRANSPLANT_R) {
    console.log(`H${hole}: green NOT transplanted — the zoom texture correlates only ${ncc.toFixed(2)} with the overview at the box (the overview keeps its own art; the zoomed green view is unaffected)`);
    return { done: false, r: ncc };
  }
  const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  for (const c of cells) {
    if (!c.paint) continue;
    const d = img.data;
    d[c.di] = cl(c.a * (c.r + dR) + (1 - c.a) * d[c.di]);
    d[c.di + 1] = cl(c.a * (c.g + dG) + (1 - c.a) * d[c.di + 1]);
    d[c.di + 2] = cl(c.a * (c.b + dB) + (1 - c.a) * d[c.di + 2]);
  }
  console.log(`H${hole}: green transplanted from ${t.sessions} zoom capture(s), ${(100 * t.covered).toFixed(0)}% of the surface seen unobstructed, texture/overview r=${ncc.toFixed(2)}`);
  return { done: true, r: ncc };
}

// Content revision of a hole's geometry (FNV-1a over scale, box, outline,
// grid), prefixed with its source: "nss-<hex>". The app re-applies the
// geometry whenever it changes (src/derivedMerge.js, green.src against rev),
// so a corrected truth reaches stored state while unchanged holes keep manual
// edits; the prefix makes the switch from WSR's geometry ("wsr-<hex>", the
// old wsrRev) re-apply once on every hole even where the hash would agree.
function geomRev(wt, source) {
  const s = JSON.stringify([wt.scale, wt.greenBox, wt.greenPoly, wt.grid]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${source}-${h.toString(16).padStart(8, "0")}`;
}
const MAP_W = 250, MAP_H = 304;
console.log(`NSS truth: ${Object.keys(TRUTH).length} holes (tools/nss-truth.json)`);

// The pins are NSS's own cups (tools/nss-pins.json, written by
// tools/nss-export.mjs from the Switch game's files): six per hole, the cup
// bones GolfCourseNNholeK of the course model, k = 0..5, through the hole's
// NSS -> map transform (tools/nss-registration.json). They ship as c0..c5,
// labelled 1..6, with `difficult` (the game's CupDifficulties: it leaves those
// cups out of some draws), yd = the floor of the flat yards from the tee
// (GlfTeeOBJ, below; the floor is what the game's own "yd to go" badge reads
// from it), `wsr` = the WSR spot id a cup coincides with (within 0.3 yd; 7 of
// the 126) and seen = the rounds the Switch captures show it in. There are no
// Switch-only spots: the four that shipped and H1's candidate were NSS cups.
//
// The tee is NSS's course bone GlfTeeOBJ (nss-pins.json tees.teeObj), where
// local play tees off. The game copies that bone into every player's start
// matrix in local play (main 0xd548d4 looks it up, 0xd549ac..0xd549fc copies
// it: the eden dump's REPORT.md, "Placement"), and in Eden the ball at address
// sits on it to 0.00 yd on holes 2-18. Hole 1 was read once in Eden at
// Glf_RotateOBJ (there 0.10 yd from the WSR start, 2.02 yd from GlfTeeOBJ);
// it ships GlfTeeOBJ too, decided on better evidence: the same code path
// serves every hole, and H1's five local tee badges (two rounds, cups c4 and
// c5, 398 and 384 yd) fit floor(GlfTeeOBJ -> cup), at -0.66 / -0.98 yd, and
// miss floor(Glf_RotateOBJ -> cup), at -2.68 / -3.01 (the WSR start -2.58 /
// -2.90), outside a floored badge's (-1, 0] window; over the 21 holes 67 of
// the 69 local badges of credited cups fit floor(GlfTeeOBJ -> cup) within
// 0.1 yd, 42 floor(WSR start -> cup) (tools/test-pins.mjs 4). GlfTeeOBJ stands
// 0.09-2.55 yd from the WSR start, the tee until this build (H14 2.55, H1
// 1.92, H20 1.69, H19 1.27). teeNss ships NSS's two tee bones for audit:
// GlfTeeOBJ (= tee) and Glf_RotateOBJ, where the online platform stands.
//
// The online Survival Golf platform is NSS's own too (tools/nss-platform.json):
// two tiers posed at Glf_RotateOBJ, each with the seven spots a player's ball
// can stand on (the four slot bones and the three midpoints an odd group
// stands on), shipped as `platform` with the pose itself (origin, yawDeg: the
// bone's) and the hole's NSS -> map transform (tools/nss-registration.json's
// a, b, tx, ty at full precision), from which src/platform.js places the ball
// by the decoded rule exactly instead of fitting the 5-decimal spots.
// None of these files may be missing or malformed: a silent fallback to WSR's
// spots would flip every stored pin id (s<slot> <-> c<k>) on each build.
const nssFile = (name, by) => {
  try { return JSON.parse(readFileSync(join(ROOT, "tools", name), "utf8")).holes; }
  catch (e) { console.error(`tools/${name}: ${e.message}. It is required (rerun node ${by}); nothing written.`); process.exit(1); }
};
const NSSP = nssFile("nss-pins.json", "tools/nss-export.mjs"), NSSPL = nssFile("nss-platform.json", "tools/nss-export.mjs");
const NSSREG = nssFile("nss-registration.json", "tools/nss-export.mjs");
// the standing spots of a tier, from the player's left to the right facing
// the green (platform-local x, metres: +x is the player's left)
const STANDING_X = [3.45, 2.3, 1.15, 0, -1.15, -2.3, -3.45];
{
  const bad = [];
  const fin = (v) => typeof v === "number" && Number.isFinite(v);
  const pt = (p) => p && fin(p.x) && fin(p.y) && Array.isArray(p.world) && p.world.length === 3 && p.world.every(fin);
  for (let hole = 1; hole <= 21; hole++) {
    const np = NSSP?.[hole], pl = NSSPL?.[hole], reg = NSSREG?.[hole], cups = np?.cups;
    if (!["a", "b", "tx", "ty"].every((k) => fin(reg?.[k])) || !(reg.a ** 2 + reg.b ** 2 > 0)) bad.push(`H${hole}: no NSS -> map transform (a, b, tx, ty) in tools/nss-registration.json`);
    if (!Array.isArray(cups) || cups.length !== 6) { bad.push(`H${hole}: ${Array.isArray(cups) ? cups.length : "no"} cups in tools/nss-pins.json, not six`); continue; }
    cups.forEach((c, k) => { if (c.k !== k || !pt(c) || !fin(c.ydFromTeeObj) || typeof c.difficult !== "boolean") bad.push(`H${hole} cup ${k}: malformed (k ${c.k})`); });
    if (!pt(np.tees?.rotateObj) || !pt(np.tees?.teeObj)) bad.push(`H${hole}: tools/nss-pins.json lacks the tee bones (rotateObj, teeObj)`);
    if (!fin(pl?.facingDeg) || !fin(pl?.yawDeg) || !Array.isArray(pl?.origin) || pl.origin.length !== 3 || !pl.origin.every(fin)) bad.push(`H${hole}: tools/nss-platform.json lacks facingDeg, yawDeg or origin`);
    for (const tier of ["low", "high"]) {
      const ps = pl?.tiers?.[tier];
      if (!Array.isArray(ps) || ps.length !== STANDING_X.length) { bad.push(`H${hole} ${tier} tier: ${Array.isArray(ps) ? ps.length : "no"} standing spots in tools/nss-platform.json, not ${STANDING_X.length}`); continue; }
      ps.forEach((p, i) => { if (p.fromLeft !== i || p.localX !== STANDING_X[i] || !pt(p) || !fin(p.z) || !(p.side || p.between?.length === 2)) bad.push(`H${hole} ${tier} spot ${i}: malformed (fromLeft ${p.fromLeft}, localX ${p.localX})`); });
    }
  }
  if (bad.length) { console.error(`tools/nss-pins.json / nss-platform.json / nss-registration.json refused (rerun node tools/nss-export.mjs); nothing written:\n  ${bad.join("\n  ")}`); process.exit(1); }
}
// The trees are NSS's own (tools/nss-trees.json: tools/nss-trees-export.mjs
// from the eden dump's tree decode, with the tree verifier's corrections):
// every tree some part of whose collision comes within 0.02 of the map frame,
// off-course ones included (NSS collides with every tree it places), in the
// file's order, which is the app's marker order (src/derivedMerge.js numbers
// the markers t<hole>-<k>; the file's own id says the same, which is checked
// and not shipped). Per tree: x, y = its placement (map fractions); z = the
// placement's height in yd above the hole's datum (NSS y 0, public/terrain's
// datum); kind = the family (2 broadleaf, 3 conifer, 6 palm); size / sy = the
// bone's x / y scale (the family templates of src/trees.js scale with them,
// for a tree read without its col); off = OB, sand OB or water under the
// trunk (the app's Edit-trees tap rule and the Guide's count skip it); r =
// the collision footprint's radius as a fraction of the map WIDTH, dx / dy =
// its centre's offset from (x, y) as fractions of the width / height (only
// where the export gives one; the collision canopy, about where NSS's minimap
// paints the tree); col = the collision itself in yd about (x, y, z), trunk
// capsules and leaf volumes, which src/trees.js flies the ball against. The
// decode's own record (nss: its tree id, kind, source and WSR match) stays
// out.
const TREES = nssFile("nss-trees.json", "tools/nss-trees-export.mjs");
{
  const bad = [];
  const fin = (v) => typeof v === "number" && Number.isFinite(v);
  for (let hole = 1; hole <= 21; hole++) {
    const ts = TREES?.[hole]?.trees;
    if (!Array.isArray(ts) || !ts.length) { bad.push(`H${hole}: no trees in tools/nss-trees.json`); continue; }
    ts.forEach((t, k) => {
      if (t.id !== `t${hole}-${k}` || ![t.x, t.y, t.z, t.size, t.sy, t.r].every(fin) || ![2, 3, 6].includes(t.kind) || !(t.size > 0 && t.sy > 0 && t.r > 0)
        || (t.off !== undefined && t.off !== true) || (t.dx !== undefined && !fin(t.dx)) || (t.dy !== undefined && !fin(t.dy))
        || !t.col || !Array.isArray(t.col.t) || !Array.isArray(t.col.c)) bad.push(`H${hole} tree ${k}: malformed (id ${t.id})`);
    });
  }
  if (bad.length) { console.error(`tools/nss-trees.json refused (rerun node tools/nss-trees-export.mjs); nothing written:\n  ${bad.slice(0, 20).join("\n  ")}${bad.length > 20 ? `\n  ... ${bad.length - 20} more` : ""}`); process.exit(1); }
}
// Capture time and wind of every classified frame, and from them the rounds
// played on each hole. The time is the EXIF DateTime the console writes into
// each capture (tools/lib/exif.mjs). The ULID in the original file name is
// not it: that is when the phone received the file, 4 h (time zone) to 6.5 h
// later (ULID - EXIF = 240.0-389.6 min over the 563 captures, median 240.1),
// and a batch transfer reverses and interleaves its files (H11's 409K and
// Y55H show consecutive seconds of one shot clock, 85 and 84, EXIF 00:23:38
// both, ULIDs 35 min apart). The ULID is the fallback only for a capture with
// no EXIF time.
// A "session" is one round on the hole: the hole's frames, of any type, at
// the same wind with no 20-minute gap between consecutive ones. Wind tells
// rounds apart even when they follow each other closely: a restart keeps the
// hole's wind, a new round draws it again. Every frame of the hole takes
// part, not only the ones that become readings: H10's wind-4 sitting (37
// frames over 44 min, restart sweeps 2-10 min apart) yields 3 accepted
// readings 26 min apart, which chained on their own as two rounds.
const SESSION_GAP_MS = 20 * 60000;
const FRAMES = new Map(); // file -> { hole, ms, wind ("?" when unread) }
const ROUNDS = new Map(); // hole -> Map(file -> round index, numbered by first capture)
let classified = [];
try { classified = JSON.parse(readFileSync(join(ROOT, "captures", "classification.json"), "utf8")).frames; } catch {}
{
  let noExif = 0;
  for (const f of classified) {
    let ms = null;
    try { ms = exifMs(join(INBOX, f.file)); } catch {}
    if (ms == null) { ms = fileMs(f.originalFile ?? f.file) ?? 0; noExif++; }
    FRAMES.set(f.file, { hole: f.hole, ms, wind: f.windMph ?? "?" });
  }
  const byHole = {};
  for (const [file, f] of FRAMES) if (f.hole != null) (byHole[f.hole] ??= []).push({ file, ...f });
  let nRounds = 0;
  for (const [hole, fs] of Object.entries(byHole)) {
    const rounds = new Map(), last = new Map(); // wind -> { round, ms }
    let n = 0;
    for (const f of fs.sort((a, b) => a.ms - b.ms)) {
      const prev = last.get(f.wind);
      const round = prev && f.ms - prev.ms <= SESSION_GAP_MS ? prev.round : n++;
      last.set(f.wind, { round, ms: f.ms });
      rounds.set(f.file, round);
    }
    ROUNDS.set(+hole, rounds);
    nRounds += n;
  }
  if (classified.length) console.log(`rounds: ${classified.length} classified frames, ${noExif} without an EXIF time (ULID fallback); ${nRounds} round(s) on ${Object.keys(byHole).length} holes`);
}
const msOf = (file) => FRAMES.get(file)?.ms ?? 0;
const windOf = (file) => FRAMES.get(file)?.wind ?? "?";
// a frame's round on a hole (undefined when it is not a classified frame of
// that hole), and the number of distinct rounds among some frames of the hole
const roundOf = (hole, file) => ROUNDS.get(hole)?.get(file);
const roundsOf = (hole, files) => new Set(files.map((f) => roundOf(hole, f)).filter((r) => r != null)).size;
// A reading within this many map px of an NSS cup is that cup: 66 of the 67
// observations of the captures sit within 2.23 px of one (median 1.08, p90
// 1.85), the cups of a hole stand at least 2.06 px apart (H9 c2/c4), and the
// one reading beyond is H19's lone zoom sighting, 4.74 px from every cup
// (pinUnmatched). The radius is in px, where the reading error lives (the
// flag base on a zoomed green, the cup on a tee frame), not in yards.
const CUP_MATCH_PX = 2.5;
// ...unless the next cup is less than this much further (px): then it is
// ambiguous, and only the badges decide (below). Two observations come
// within it on NSS's green boxes, H9's round 1 (ambiguous: no badge) and
// H18's round 1 (its badges pick c1); on WSR's boxes H9's round 2 did too.
const AMBIG_PX = 1;
// The badge rule. The game's "yd to go" badge is the floor of the flat yards
// from the ball to the cup, in its own coordinates: of the 65 local tee-frame
// badges of the observations that stand nearest one cup, 58 equal
// floor(GlfTeeOBJ -> cup) exactly (23 equal floor(WSR start -> cup)); five
// more miss that window by 0.01-0.06 yd (H3's four at -1.01, H19 QM09 at
// -1.06), and the other two are a moved ball and a post-shot frame (H8 NCNJ
// -2.29, H10 3KS8 -7.12). Every
// one of the 13 judged online rounds fits a standing spot of its own tier
// (H8's best at -1.02). So a badge b fits a cup from a point P when b - (P to
// the cup, yd) lies in (-1 - BADGE_TOL_YD, BADGE_TOL_YD], the points being the
// local tee (GlfTeeOBJ) for a local frame and the platform's 14 standing spots
// for an online one, all in NSS metres (tools/nss-pins.json, nss-platform.json
// world). In a tie the cup whose badges fit, when the other's do not, is the
// one; otherwise the observation is ambiguous. (Until the local tee point was
// decided a local badge could fit from the WSR start too; dropping it changes
// no observation's outcome.)
const BADGE_TOL_YD = 0.1;
const NSS_YD = 0.9144; // m per yd
const flatYdNss = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2) / NSS_YD;
const badgeFits = (badge, from, cup) => from.some((P) => { const m = badge - flatYdNss(P, cup); return m > -1 - BADGE_TOL_YD && m <= BADGE_TOL_YD; });
// A tee frame's cup counts only when its own badge agrees with the measured
// avatar-to-cup distance, which rejects misdetected cups and avatars. The
// tolerance is in map px, where the error lives: the avatar centroid turns
// with the aim (~1.5 px) and the cup is good to ~2 px, while a yard is only
// 0.4-1.1 px (0.89-2.51 yd/px across the holes). Over the 141 tee frames with
// a badge, avatar and cup, |badge - measured| in px: 55 under 0.5, 35 to 1,
// 20 to 1.5, 9 to 2, 2 to 2.5 (the largest sound miss is 2.14 px, H8 NCNJ),
// then nothing until 2.74 px: 15 frames at 2.7-3.1 px, all from H10's wind-4
// sitting (374-yd tee frames and 365-367-yd post-shot frames), where the
// tee-frame cup is detected at (130.5,50.5), 1.5 px north of the round's
// zoom reading of S1 and 2.1 px from the shipped S1, and the badge sits
// nearer the zoom position (2.4 yd off it, 5.1 yd off the cup): cup
// detection errors, not badge errors. Then 5 OCR misreads at 8 px and more
// (360 for 380, 564 for 584, 367 for 387, 586 for 536, 819 for 219). 2.5 px
// sits in the gap. A fixed 3 yd was 1.2-1.5 px on the long holes and failed
// 9 of the sound frames (H8 x3, H9 x4, H12 14DM, H21 A6KE, whose 416 badge
// fits the spot once shipped as Switch-only at 415, an NSS cup, against WSR
// spot 3 at 422): 112 of
// the 141 frames passed it, 121 pass 2.5 px, and no frame that passed 3 yd
// fails.
const BADGE_TOL_PX = 2.5;
// In a badge tie-break only local frames whose ball is on the tee count (and
// online ones, from the platform). On-tee avatars sat up to 4.8 yd from the
// WSR start on long holes (3 px at H14's 1.6 yd/px, 1.2-1.8 px on
// H3/H9/H12/H20 at 2.1-2.5 yd/px); the post-shot frames the tee-frame filter
// also admits (H10's 365-367 yd restart frames) stand 6.0-8.3 yd out, and
// their badge is a distance from the ball, not the tee. Measured from
// GlfTeeOBJ (0.09-2.55 yd from the start) the same frames pass and fail.
const AT_START_YD = 5;
// Readings of one pin within one session: a tee cup joins a zoom reading
// within this distance (they disagree by up to 2.3 px), and zoom readings of
// one pin agree within it.
const SAME_PIN_PX = 2.5;
// The online tee platform is NSS's (tools/nss-platform.json); the frames only
// check it. An online frame's avatar is the yellow blob nearest the tee
// (GlfTeeOBJ), if within TEE_REACH_YD of it: the observed round medians
// stood 0-12 yd from the WSR start (H10 0.3 yd toward the green, H4 11.8 yd
// behind), and the same blobs are picked from the tee.
// tools/online-rounds.json (the tier each online round was judged to be, by
// eye) is test data for tools/test-platform.mjs, not read here.
const TEE_REACH_YD = 25;
const median = (a) => { const s = [...a].sort((p, q) => p - q), m = s.length >> 1; return s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2; };
const teeFramesUsed = {}; // file -> roles, for tools/frame-audit.mjs
const pinObservations = {}; // hole -> every pin observation and what it was credited to

const pointInPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
};

const xform = {};
const derived = { version: 1, mapW: 250, mapH: 304, holes: {} };
mkdirSync(join(D, "boxes"), { recursive: true });

for (let hole = 1; hole <= 21; hole++) {
  const id = `h${String(hole).padStart(2, "0")}`;
  // the hole's render and green crop (tools/render-nss-maps.py), when it has
  // them: the files its index.json entry names (the 2x map, maps["2"], and
  // the green crop; a bare file name only), else the renderer's own names
  const rIdx = renderIndex[hole];
  const fileOr = (f, dflt) => (typeof f === "string" && /^[\w.-]+$/.test(f) && !f.startsWith(".") ? f : dflt);
  const mapFile = fileOr(rIdx?.maps?.["2"]?.file ?? rIdx?.map?.file, `${id}.png`), greenFile = fileOr(rIdx?.green?.file, `${id}-green.png`);
  let renderMap = existsSync(join(RENDER, mapFile)) ? join(RENDER, mapFile) : null;
  let renderGreen = existsSync(join(RENDER, greenFile)) ? join(RENDER, greenFile) : null;
  // Only NSS's art with the 2 m plaid ships (the index.json entry's art "nss"
  // and plaid.tileM 2, else the file level's art). A render from before the
  // plaid fix (a GreenAreaSize / 25 m tile), another art an explicit --out
  // wrote here, or a map that is not the frame at 2x ships the hole's capture
  // stack instead, and the summary count says so.
  const renderArt = rIdx?.art ?? renderIdx.art, plaidM = rIdx?.plaid?.tileM ?? null;
  const renderImg = renderMap ? loadImage(renderMap) : null;
  const renderWhy = !(renderMap || renderGreen) ? null
    : renderArt !== RENDER_ART ? `is art ${renderArt ?? "unknown"}, not NSS's (${RENDER_ART})`
    : plaidM !== RENDER_PLAID_M ? `was rendered with a ${plaidM ?? "unrecorded"} m plaid tile, not ${RENDER_PLAID_M} m (before the plaid fix)`
    : renderImg && (renderImg.width !== 2 * MAP_W || renderImg.height !== 2 * MAP_H) ? `is ${renderImg.width}x${renderImg.height}, not the ${MAP_W}x${MAP_H} frame at 2x`
    : null;
  if (renderWhy) {
    console.warn(`H${hole}: captures/derived/render-nss/${mapFile} ${renderWhy}; using the capture stack instead; rerun python -P tools/render-nss-maps.py --holes ${hole}`);
    renderMap = renderGreen = null;
  }
  // The median-stacked captures: the shipped map only for a hole with no
  // render (loaded at the end of the loop, where the green is transplanted
  // into it), while the detection stack (flag and cup intact) anchors the
  // capture green-box projection on every hole, since that box ships as
  // captureGreenBox beside the NSS one. The projection correlates against
  // the detection stack because the display stack has the flag inpainted
  // away, which starves the matcher of its strongest dark landmark on
  // pin-less holes.
  const stack = () => loadImage(join(D, "maps", `${id}.png`));
  let det;
  try { det = loadImage(join(D, "maps", `${id}.det.png`)); } catch { det = stack(); }
  const meta = mapsMeta.find((m) => m.hole === hole);
  const g = JSON.parse(readFileSync(join(D, "greens", `${id}.json`), "utf8"));

  // migration transform (fractional)
  const r = register[hole];
  xform[hole] = { ax: r.fx.a, bx: r.fx.b, ay: r.fy.a, by: r.fy.b };

  // green box on map: pin-anchored projection of the zoom bbox; when the pin
  // moved between sessions, the session whose pin matches the map's pin wins
  // the correlation.
  // search only physically plausible k: zoom yd/px is ~0.28-0.48 across
  // holes, so k ≈ that / map yd/px — long holes zoom the map out, pushing
  // k down
  const kLo = meta.scaleYdPerPx ? Math.max(0.08, 0.25 / meta.scaleYdPerPx) : 0.1;
  const kHi = meta.scaleYdPerPx ? Math.min(0.55, 0.55 / meta.scaleYdPerPx) : 0.5;
  // anchor on uncropped sessions only — a green cut off by the panel edge
  // has an unreliable bbox and weaker correlation
  const anchorPool = g.sessions.filter((s) => !s.cropped);
  let anchor = null;
  for (const s of (anchorPool.length ? anchorPool : g.sessions)) {
    const zimg = loadImage(join(INBOX, s.plain));
    const zoom = cropRect(zimg, panelRect(zimg));
    const pr = projectGreenBox(det, zoom, meta.pin, s.pinPx, s.bboxPx, kLo, kHi);
    if (!anchor || pr.r > anchor.r) anchor = { ...pr, session: s };
  }
  let greenBox = null, greenPoly = null, sightings = [], greenPins = 0;
  let box = null, captureBox = null;
  const W = det.width, H = det.height; // the 250x304 map frame
  if (anchor && anchor.r > 0.22) {
    const { k, session, ox, oy } = anchor;
    const proj = (zx, zy) => ({ x: meta.pin.x + ox + (zx - session.pinPx.x) * k,
                                y: meta.pin.y + oy + (zy - session.pinPx.y) * k });
    // project the ANCHOR session's own bbox (its k belongs to its zoom level;
    // other sessions can sit at different zooms)
    const zb = session.bboxPx;
    const c0 = proj(zb.x0, zb.y0), c1 = proj(zb.x1, zb.y1);
    captureBox = { x0: Math.max(0, Math.round(c0.x)), y0: Math.max(0, Math.round(c0.y)),
      x1: Math.min(W - 1, Math.round(c1.x)), y1: Math.min(H - 1, Math.round(c1.y)) };
  }
  const wt = TRUTH[hole];
  // projection box in map px: the NSS green's bbox (float; the capture
  // projection ships beside it as captureGreenBox). The zoom captures' green
  // outlines match the game's in normalized shape (IoU 0.86-0.98 against
  // WSR's, which NSS's own match to 0.968-0.992), so bbox-normalized readings
  // carry over through it.
  const pb = { x0: wt.greenBox.x0 * W, y0: wt.greenBox.y0 * H, x1: wt.greenBox.x1 * W, y1: wt.greenBox.y1 * H };
  {
    // integer box for the pixel loops (transplant, debug overlay)
    box = { x0: Math.max(0, Math.round(pb.x0)), y0: Math.max(0, Math.round(pb.y0)),
      x1: Math.min(W - 1, Math.round(pb.x1)), y1: Math.min(H - 1, Math.round(pb.y1)) };
    greenBox = wt.greenBox;
    // the pin sightings via bbox-normalized coords — zoom-invariant across
    // sessions — then CLUSTERED (radius below), for the debug overlay only:
    // the pins that ship are NSS's cups (the Pins block below), which the
    // sightings are credited to one by one. Every pair that sees the same flag
    // reports it, so one spot captured six times would draw six crosses.
    // the green outline: NSS's (a polygon, not a rectangle: greens are lobed,
    // and the fringe that wraps every green is a real boundary)
    greenPoly = wt.greenPoly;
    // Cluster in GREEN-LOCAL space at 0.085 of the green's bbox. Repeat
    // sightings of one spot agree within 0.07 there (all holes so far), the
    // next-closest pairs sit 0.10+ apart, and distinct spots on the small
    // greens 0.25+. The old radius (0.02 of the MAP, ~5 px) merged pairs 3-6 px
    // apart on holes 3, 5, 14 and 18 into one averaged position that matched
    // neither; each flag-stack cup sits on one of the raw sightings instead.
    const PIN_T = 0.085;
    const clusters = [];
    // pins[i] belongs to sessions[i] (extract-greens.mjs). A cropped session's
    // bbox is cut off by the panel edge, so its bbox-normalized pin is wrong:
    // on H10 two cropped re-pairings of frames already read uncropped landed
    // 0.11-0.12 away and shipped as phantom spots. The anchor and texture paths
    // already skip cropped sessions; keep cropped readings only for a hole that
    // has nothing else.
    const okPins = g.pins.filter((_, i) => !g.sessions?.[i]?.cropped);
    for (const p of (okPins.length ? okPins : g.pins)) {
      const c = clusters.find((q) => Math.hypot(q.gx / q.n - p.gx, q.gy / q.n - p.gy) < PIN_T);
      if (c) { c.gx += p.gx; c.gy += p.gy; c.n++; } else clusters.push({ gx: p.gx, gy: p.gy, n: 1 });
    }
    sightings = clusters.map((c) => ({
      x: +((pb.x0 + (c.gx / c.n) * (pb.x1 - pb.x0)) / W).toFixed(4),
      y: +((pb.y0 + (c.gy / c.n) * (pb.y1 - pb.y0)) / H).toFixed(4), n: c.n }));
    // (the pin zones, clusters of the sightings in green-local space, are gone
    // with the capture-built pins: a hole's pins are its six NSS cups)
    greenPins = g.pins.length;
    // debug overlay
    const dbg = { width: W, height: H, data: Buffer.from(det.data) };
    const set = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; dbg.data[i] = 30; dbg.data[i + 1] = 120; dbg.data[i + 2] = 255; };
    for (let x = box.x0; x <= box.x1; x++) { set(x, box.y0); set(x, box.y1); }
    for (let y = box.y0; y <= box.y1; y++) { set(box.x0, y); set(box.x1, y); }
    for (const p of sightings) { const bx = Math.round(p.x * W), by = Math.round(p.y * H);
      for (let d = -4; d <= 4; d++) { set(bx + d, by); set(bx, by + d); } }
    savePng(join(D, "boxes", `${id}.png`), dbg);
  }
  const zoomAspect = (g.panelBbox.x1 - g.panelBbox.x0) / (g.panelBbox.y1 - g.panelBbox.y0);
  const mapAspect = box ? (box.x1 - box.x0) / (box.y1 - box.y0) : null;
  // ---- pins: NSS's six cups (truth), credited with the Switch readings; the
  // tee; the online platform (NSS's own) ----
  const np = NSSP[hole], npl = NSSPL[hole], reg = NSSREG[hole];
  // the cups, and beside them what the crediting needs (world: NSS metres);
  // yd from the tee, GlfTeeOBJ (nss-pins.json ydFromTeeObj, the flat yards in
  // NSS metres)
  const spots = np.cups.map((c) => ({ id: `c${c.k}`, k: c.k, x: c.x, y: c.y, label: String(c.k + 1), difficult: c.difficult,
    yd: Math.floor(c.ydFromTeeObj), src: "nss", wsr: c.wsr ?? null, world: c.world, sessions: new Set() }));
  // The tee: NSS's GlfTeeOBJ, where local play tees off (the head of the Pins
  // block above; H1 included), at nss-pins.json's map point. teeNss: NSS's two
  // tee bones for audit, GlfTeeOBJ (= tee) and Glf_RotateOBJ, where the online
  // platform stands.
  const tee = { x: np.tees.teeObj.x, y: np.tees.teeObj.y }, teeNote = " tee = GlfTeeOBJ";
  const teeNss = { rotateObj: { x: np.tees.rotateObj.x, y: np.tees.rotateObj.y }, teeObj: { x: np.tees.teeObj.x, y: np.tees.teeObj.y } };
  // where a badge is measured from (NSS metres): the local tee for a local
  // frame, the platform's standing spots for an online one
  const LOCAL_FROM = [np.tees.teeObj.world];
  const PLATFORM_FROM = ["low", "high"].flatMap((t) => npl.tiers[t].map((p) => p.world));
  // The online Survival Golf platform, NSS's own: two tiers, the high one
  // 3.5 m behind the low and 1.568 m up, posed at the course bone
  // Glf_RotateOBJ with that bone's own yaw. Per tier the seven spots a ball
  // can stand on, from the player's left to the right as the player faces the
  // green: localX = the platform-local x in metres (+x is the player's left),
  // the four slot bones (side L2, L1, R1, R2) and the three midpoints between
  // them (between: the two sides), where an odd group stands; x, y = map
  // fractions through the hole's NSS transform; zYd = the mat the ball stands
  // on and groundYd = NSS's ground under it, both in yd above the datum (NSS
  // y 0, the WSR start's height, which is public/terrain's datum), ground =
  // that ground's NSS surface (GolfOB under H1's outer spots); facingDeg = the
  // bearing (deg N-up) the platform faces. The pose itself rides along so the
  // app can place any ball on the platform exactly (src/platform.js, the
  // decoded seating rule and the ball 0.9 m beside the stance): origin = the
  // Glf_RotateOBJ bone in NSS metres [x, y, z] (y 0.1 on H3, 0 elsewhere),
  // yawDeg = its Euler Y (world = origin + Ry(yaw) * local), transform = the
  // hole's NSS -> map transform { a, b, tx, ty } (map px = a x - b z + tx,
  // b x + a z + ty; tools/nss-registration.json at full precision, the one
  // transform of the cups, the tee and the spots). observed = the online tee
  // frames' median avatar (validation only).
  const standing = (p) => ({ localX: p.localX, ...(p.side ? { side: p.side } : { between: p.between }), x: p.x, y: p.y, zYd: p.z,
    groundYd: p.groundZ ?? null, ground: p.ground ?? null });
  const platform = { facingDeg: npl.facingDeg, origin: [...npl.origin], yawDeg: npl.yawDeg, transform: { a: reg.a, b: reg.b, tx: reg.tx, ty: reg.ty },
    tiers: { high: npl.tiers.high.map(standing), low: npl.tiers.low.map(standing) }, observed: null };
  const sideOf = (p) => p.side ?? p.between.join("|");
  const pinAmbiguous = [], pinUnmatched = [], ties = [];
  let onlineNote = ", no online frames";
  {
    const sc = wt.scale; // yd per map px
    const pxTo = (a, b) => Math.hypot((a.x - b.x) * W, (a.y - b.y) * H); // fractions in, map px out
    const yd = (a, b) => pxTo(a, b) * sc;
    const toMap = (p) => ({ x: (pb.x0 + p.gx * (pb.x1 - pb.x0)) / W, y: (pb.y0 + p.gy * (pb.y1 - pb.y0)) / H });
    // the avatar: of a frame's yellow blobs, the one nearest the tee, if it is
    // within reach of the teeing ground at all
    const avatarOf = (f) => {
      const near = (f.ptrs ?? []).map((q) => ({ x: q.x / W, y: q.y / H })).sort((a, b) => yd(a, tee) - yd(b, tee))[0];
      return near && yd(near, tee) <= TEE_REACH_YD ? near : null;
    };
    // a round with an online tee frame was played online (Survival Golf)
    const onlineRounds = new Set((meta.teeFrames ?? []).filter((f) => f.online).map((f) => roundOf(hole, f.file)));

    // Readings, each filed under the round of its source frame. Zoom: one per
    // source frame (pinSources[i].from: the heightmap of a pair, which is
    // where extract-greens reads the pin, or the plain frame of a fringe-only
    // reading; a heightmap paired twice is read once), cropped pairings only
    // if a hole has nothing else (a fringe-only reading has no pairing and
    // counts as uncropped). Tee frames: a cup whose own badge agrees with the
    // measured avatar-to-cup distance within BADGE_TOL_PX (in yd at this
    // hole's scale). A reading with no source frame, or
    // whose frame is not a classified frame of this hole, is dropped and
    // logged rather than given a round of its own.
    const readings = [];
    const srcOf = (i) => g.pinSources?.[i]?.from ?? g.sessions?.[i]?.hmap ?? g.sessions?.[i]?.plain ?? null;
    const okIdx = g.pins.map((_, i) => i).filter((i) => !g.sessions?.[i]?.cropped);
    const srcSeen = new Set();
    for (const i of (okIdx.length ? okIdx : g.pins.map((_, k) => k))) {
      const file = srcOf(i), round = file ? roundOf(hole, file) : undefined;
      if (file && srcSeen.has(file)) continue;
      if (file) srcSeen.add(file);
      if (round == null) { console.log(`H${hole}: zoom reading ${i} dropped: ${file ? `${file} is not a classified frame of this hole` : "no source frame"}`); continue; }
      readings.push({ kind: "zoom", round, ms: msOf(file), ...toMap(g.pins[i]), file });
    }
    for (const f of meta.teeFrames ?? []) {
      const p = avatarOf(f);
      if (!p || !f.cup || f.yd == null) continue;
      const c = { x: f.cup.x / W, y: f.cup.y / H };
      if (Math.abs(f.yd - yd(p, c)) > BADGE_TOL_PX * sc) continue;
      const round = roundOf(hole, f.file);
      if (round == null) { console.log(`H${hole}: tee frame ${f.file} dropped: not a classified frame of this hole`); continue; }
      readings.push({ kind: "tee", round, ms: msOf(f.file), ...c, file: f.file, badge: f.yd, online: !!f.online, p });
    }
    // Within each round the observations: one per physical pin. Zoom readings
    // place it; a tee cup from the same round joins the zoom observation it
    // agrees with (one pin, two views), otherwise tee cups form observations
    // of their own.
    readings.sort((a, b) => a.ms - b.ms);
    const obs = [];
    for (const s of [...new Set(readings.map((r) => r.round))].sort((a, b) => a - b)) {
      const rs = readings.filter((r) => r.round === s), mine = [];
      for (const r of rs.filter((q) => q.kind === "zoom")) {
        const o = mine.find((q) => pxTo(q, r) <= SAME_PIN_PX);
        if (o) { o.zoom.push(r); o.x = o.zoom.reduce((t, q) => t + q.x, 0) / o.zoom.length; o.y = o.zoom.reduce((t, q) => t + q.y, 0) / o.zoom.length; }
        else mine.push({ round: s, x: r.x, y: r.y, zoom: [r], tee: [] });
      }
      for (const r of rs.filter((q) => q.kind === "tee")) {
        const zo = mine.filter((q) => q.zoom.length).map((q) => ({ q, d: pxTo(q, r) })).sort((a, b) => a.d - b.d)[0];
        if (zo && zo.d <= SAME_PIN_PX) { zo.q.tee.push(r); continue; }
        const to = mine.find((q) => !q.zoom.length && pxTo(q, r) <= SAME_PIN_PX);
        if (to) { to.tee.push(r); to.x = median(to.tee.map((q) => q.x)); to.y = median(to.tee.map((q) => q.y)); }
        else mine.push({ round: s, x: r.x, y: r.y, zoom: [], tee: [r] });
      }
      obs.push(...mine);
    }
    // Which cup each observation shows: the nearest within CUP_MATCH_PX,
    // unless the next one is about as close; then the badges decide (the
    // badge rule: a cup whose badges fit from the local tee or the platform,
    // when the other's do not), and otherwise nobody is credited
    // (pinAmbiguous). An observation beyond every cup credits none
    // (pinUnmatched).
    const seenBy = (o) => [...(o.zoom.length ? ["zoom"] : []), ...(o.tee.length ? ["tee"] : [])];
    const credit = (o, q) => { o.result = q.id; q.sessions.add(o.round); for (const r of o.tee) (teeFramesUsed[r.file] ??= []).push(`pin ${q.id}`); };
    for (const o of obs) {
      const ds = spots.map((q) => ({ q, d: pxTo(o, q) })).sort((a, b) => a.d - b.d);
      if (ds[0].d > CUP_MATCH_PX) {
        o.result = `unmatched, ${ds[0].d.toFixed(2)} px from ${ds[0].q.id}`;
        pinUnmatched.push({ x: +o.x.toFixed(4), y: +o.y.toFixed(4), nearest: ds[0].q.id, px: +ds[0].d.toFixed(2), seenBy: seenBy(o), badges: [...new Set(o.tee.map((r) => r.badge))] });
        continue;
      }
      let pick = ds[0].q;
      if (ds[1].d - ds[0].d < AMBIG_PX) {
        const loc = o.tee.filter((r) => !r.online && yd(r.p, tee) <= AT_START_YD), onl = o.tee.filter((r) => r.online);
        const fit = (q) => loc.filter((r) => badgeFits(r.badge, LOCAL_FROM, q.world)).length + onl.filter((r) => badgeFits(r.badge, PLATFORM_FROM, q.world)).length;
        const f0 = fit(ds[0].q), f1 = fit(ds[1].q);
        pick = f0 && !f1 ? ds[0].q : f1 && !f0 ? ds[1].q : null;
        o.tie = [ds[0].q.id, ds[1].q.id];
        if (!pick) { o.result = `ambiguous ${ds[0].q.id}/${ds[1].q.id}`; pinAmbiguous.push({ x: +o.x.toFixed(4), y: +o.y.toFixed(4), cups: o.tie }); continue; }
        ties.push(`${pick.id} over ${pick === ds[0].q ? ds[1].q.id : ds[0].q.id}`);
      }
      credit(o, pick);
    }
    pinObservations[hole] = obs.map((o) => {
      const rs = [...o.zoom, ...o.tee];
      return { round: o.round, wind: windOf(rs[0].file), at: [+(o.x * W).toFixed(1), +(o.y * H).toFixed(1)],
        online: onlineRounds.has(o.round), result: o.result ?? "?", ...(o.tie ? { tie: o.tie } : {}),
        readings: rs.map((r) => `${r.kind} ${r.file}${r.badge != null ? ` ${r.badge}yd` : ""}`), badges: o.tee.map((r) => r.badge) };
    });

    // The online frames check the platform: per round the median avatar
    // (each frame's avatar nearest the tee, as above) against the nearest
    // standing spot of each tier, printed; the hole's median over all its
    // online frames ships as platform.observed. The avatar marker wanders
    // 1-2 px with the aim, about the spacing of the spots, so the tier a round
    // was played from is tools/test-platform.mjs's to check, from the badges.
    const online = (meta.teeFrames ?? []).filter((f) => f.online).map((f) => ({ f, p: avatarOf(f) })).filter((q) => q.p);
    if (online.length >= 2) {
      const byRound = new Map();
      for (const q of online) { const r = roundOf(hole, q.f.file); byRound.set(r, [...(byRound.get(r) ?? []), q]); }
      platform.observed = { x: +median(online.map(({ p }) => p.x)).toFixed(4), y: +median(online.map(({ p }) => p.y)).toFixed(4),
        n: online.length, rounds: roundsOf(hole, online.map(({ f }) => f.file)) };
      for (const { f } of online) (teeFramesUsed[f.file] ??= []).push("online tee");
      const nearest = (m, t) => platform.tiers[t].map((p) => ({ p, d: yd(m, p) })).sort((a, b) => a.d - b.d)[0];
      onlineNote = `, online platform: ${[...byRound.values()].map((qs) => {
        const m = { x: median(qs.map(({ p }) => p.x)), y: median(qs.map(({ p }) => p.y)) }, lo = nearest(m, "low"), hi = nearest(m, "high");
        return `W${windOf(qs[0].f.file)} ${qs.length} fr, median avatar ${lo.d.toFixed(1)} yd from low ${sideOf(lo.p)}, ${hi.d.toFixed(1)} from high ${sideOf(hi.p)}`;
      }).join("; ")}`;
    } else if (online.length) onlineNote = ", 1 online frame only";
    if (process.env.PIN_DEBUG === String(hole)) for (const o of obs)
      console.log(`  round ${o.round} @ ${(o.x * W).toFixed(1)},${(o.y * H).toFixed(1)}: ${[...o.zoom, ...o.tee].map((r) => `${r.kind} ${r.file}${r.badge ? ` ${r.badge}yd` : ""}${r.online ? " online" : ""}`).join(" | ")} -> ${o.result}`);
  }
  const pins = spots.map((s) => ({ id: s.id, k: s.k, x: s.x, y: s.y, label: s.label, difficult: s.difficult, yd: s.yd, src: s.src, seen: s.sessions.size, wsr: s.wsr }));
  const seenNss = pins.filter((s) => s.seen).map((s) => `${s.id}x${s.seen}`).join(" ");
  console.log(`H${hole}: pins = 6 NSS cups (${pins.filter((s) => s.difficult).map((s) => s.id).join(" ") || "none"} difficult; ${pins.filter((s) => s.wsr).map((s) => `${s.id}=${s.wsr}`).join(" ") || "none"} on a WSR spot; rounds on Switch: ${seenNss || "none"})` +
    `${ties.length ? `; ties the badges decide: ${ties.join(", ")}` : ""}${pinAmbiguous.length ? `; ambiguous: ${pinAmbiguous.map((a) => a.cups.join("/")).join(", ")}` : ""}` +
    `${pinUnmatched.length ? `; unmatched: ${pinUnmatched.map((u) => `${u.px} px from ${u.nearest}`).join(", ")}` : ""}; tee = GlfTeeOBJ${onlineNote}`);
  // ---- trees: NSS's own (tools/nss-trees.json, the fields listed where it
  // is loaded), in the file's order, without its id and decode record ----
  const trees = TREES[hole].trees.map((t) => ({ x: t.x, y: t.y, z: t.z, kind: t.kind, size: t.size, sy: t.sy, ...(t.off ? { off: true } : {}),
    r: t.r, ...(t.dx !== undefined ? { dx: t.dx } : {}), ...(t.dy !== undefined ? { dy: t.dy } : {}), col: t.col }));
  {
    const off = trees.filter((t) => t.off).length, zs = trees.map((t) => t.z);
    const kinds = [2, 3, 6].map((k) => `${trees.filter((t) => t.kind === k).length} of kind ${k}`).join(", ");
    const caps = trees.reduce((n, t) => n + t.col.t.reduce((m, l) => m + l.length / 4, 0), 0), leaf = trees.reduce((n, t) => n + t.col.c.length, 0);
    console.log(`H${hole}: trees = ${trees.length} NSS trees (${kinds}), ${trees.length - off} on the course, ${off} off; footprint r ${Math.min(...trees.map((t) => t.r * W)).toFixed(1)}-${Math.max(...trees.map((t) => t.r * W)).toFixed(1)} px; base z ${Math.min(...zs).toFixed(1)} to ${Math.max(...zs).toFixed(1)} yd; collision: ${caps} trunk nodes, ${leaf} canopy parts`);
  }
  derived.holes[hole] = { scale: wt.scale, yards: meta.yards, greenBox, greenPoly,
    // slopeMaxPct: the steepest 9x9 cell's slope in percent (nss-truth.json),
    // the scale of the quantized grid's levels, which the app's putt model
    // needs to read a painted grid as absolute slopes (src/putt.js gridField)
    grid: quantizeGrid(wt.grid), slopeMaxPct: wt.slopeMaxPct,
    // pins: the six NSS cups; pinAmbiguous / pinUnmatched: the observations
    // credited to none (a near tie the badges cannot split, or beyond every
    // cup); pinObservations: the zoom pin readings of the hole; tee: NSS's
    // GlfTeeOBJ, teeNss: NSS's tee bones (audit only); platform: the online
    // tee platform (it replaced teeOnline); trees: NSS's
    pins, pinAmbiguous, pinUnmatched, pinObservations: greenPins,
    greenView: greenMeta[hole] ?? null, tee, teeNss, platform, trees,
    // source "nss": the geometry (scale, green box, outline, grid) is NSS's
    // collision; rev: its revision (geomRev), which the app's merge re-applies
    // the geometry on (it replaced wsrRev); captureGreenBox: the capture
    // projection, for comparison
    source: "nss", rev: geomRev(wt, "nss"), captureGreenBox: captureBox ? { x0: +(captureBox.x0 / W).toFixed(4), y0: +(captureBox.y0 / H).toFixed(4),
      x1: +(captureBox.x1 / W).toFixed(4), y1: +(captureBox.y1 / H).toFixed(4) } : null };
  console.log(`H${hole}: k=${anchor?.k?.toFixed(2)} r=${anchor?.r?.toFixed(2)} box=${box.x0},${box.y0}..${box.x1},${box.y1} (NSS; capture box ${captureBox ? `${captureBox.x0},${captureBox.y0}..${captureBox.x1},${captureBox.y1}` : "MISS"}) aspect map=${mapAspect?.toFixed(2) ?? "-"} zoom=${zoomAspect.toFixed(2)} pins=${pins.length}${teeNote}`);

  // The images the app ships. The hole map is the render of NSS's own minimap
  // (the 250x304 frame at 2x, so a phone shows it sharp) and the zoomed green
  // view is the renderer's crop of the NSS green box plus GT_MARGIN of it on
  // every side at the box's true aspect, the frame the app's GreenView places
  // pins in. Without a render the hole ships what it did before 2026-10-18:
  // the median-stacked captures with the fused zoom texture transplanted into
  // the green, and that texture as the green view. The texture is the fused,
  // flag-free surface from the zoom captures, which hold the green 3-8x
  // larger than the overview and cover each other's flag occlusions across
  // pin positions; it is built only when something needs it.
  const gtex = renderMap && renderGreen ? null : greenTexture(g);
  let greenNote = "green view: NONE (no render crop and no zoom captures)";
  if (renderGreen) {
    const gimg = loadImage(renderGreen);
    const gj = jpeg.encode({ data: gimg.data, width: gimg.width, height: gimg.height }, GREEN_JPEG_Q);
    greensJs.push(`  ${hole}: "data:image/jpeg;base64,${gj.data.toString("base64")}",`);
    greenBytes += gj.data.length; greensFromRender++;
    // the crop's aspect is the NSS box's, width over height in map px, as the
    // renderer computes it. index.json records the box the crop was rendered
    // for: it must be the truth's box exactly (tools/nss-truth.json greenBox;
    // a registration correction translates the box and leaves the aspect
    // alone, and the app would then place pins and slope arrows at the new
    // box's coordinates on the old image)
    const ri = renderIndex[hole]?.green;
    const aspect = +(((wt.greenBox.x1 - wt.greenBox.x0) * W) / ((wt.greenBox.y1 - wt.greenBox.y0) * H)).toFixed(4);
    const sameBox = (a, b) => !!a && !!b && ["x0", "y0", "x1", "y1"].every((k) => a[k] === b[k]);
    const stale = !ri || ri.margin !== GT_MARGIN || !sameBox(ri.box, wt.greenBox);
    const want = `green box ${JSON.stringify(wt.greenBox)} (margin ${GT_MARGIN})`;
    if (stale) console.warn(ri
      ? `H${hole}: ${greenFile} was rendered for green box ${JSON.stringify(ri.box)} (${ri.width}x${ri.height}, aspect ${ri.aspect}, margin ${ri.margin}) but the truth now gives ${want}; rerun python -P tools/render-nss-maps.py --holes ${hole}`
      : `H${hole}: ${greenFile} has no index.json entry, so nothing says it was rendered for the truth's ${want}; rerun python -P tools/render-nss-maps.py --holes ${hole}`);
    greenMeta[hole] = { aspect, margin: GT_MARGIN, source: "render" };
    greenNote = `green view: render crop ${gimg.width}x${gimg.height} -> ${gj.data.length} B JPEG q${GREEN_JPEG_Q}`;
  } else if (gtex) {
    const gj = jpeg.encode({ data: gtex.tex.data, width: GT, height: GT }, 86);
    greensJs.push(`  ${hole}: "data:image/jpeg;base64,${gj.data.toString("base64")}",`);
    greenBytes += gj.data.length;
    const pb = g.panelBbox;
    greenMeta[hole] = {
      aspect: +((pb.x1 - pb.x0) / Math.max(1, pb.y1 - pb.y0)).toFixed(4),
      // how much bbox-relative padding the image carries on each side, so the
      // app can place pins and slope arrows inside it
      margin: GT_MARGIN,
      covered: +gtex.covered.toFixed(3), sessions: gtex.sessions, source: "captures",
    };
    greenNote = `green view: NO render crop, fused from ${gtex.sessions} zoom capture(s), ${(100 * gtex.covered).toFixed(0)}% seen -> ${gj.data.length} B JPEG q86`;
  }
  // derived.holes[hole] was written just above, before the view existed
  derived.holes[hole].greenView = greenMeta[hole] ?? null;
  let enc, mapNote;
  if (renderMap) {
    const rimg = renderImg;
    enc = jpeg.encode({ data: rimg.data, width: rimg.width, height: rimg.height }, MAP_JPEG_Q);
    mapsFromRender++;
    mapNote = `map: render ${rimg.width}x${rimg.height} -> ${enc.data.length} B JPEG q${MAP_JPEG_Q}`;
    // what ships is the render, so a .final.png left by an earlier stack-based
    // run would only mislead
    rmSync(join(D, "maps", `${id}.final.png`), { force: true });
  } else {
    // Rebuild the overview's green from the zoom captures, then encode. The
    // overview draws the green ~28px across; the texture goes in clean and
    // sharper than the overview ever rendered it.
    // Transplant only when the projection is confident. A weak correlation
    // means the box may be a few pixels off, and painting a whole green into
    // the wrong place is far worse than leaving the overview's own art (which
    // is already cup-free).
    // With the NSS box the placement is known, not estimated; transplantGreen
    // still checks the texture against the overview before painting. The
    // outline mask is the NSS outline (box-normalized).
    const img = stack();
    const mask = wt.greenPoly.map(([x, y]) => [(x * W - pb.x0) / (pb.x1 - pb.x0), (y * H - pb.y0) / (pb.y1 - pb.y0)]);
    transplantGreen(hole, img, pb, mask, gtex);
    enc = jpeg.encode({ data: img.data, width: img.width, height: img.height }, 82);
    savePng(join(D, "maps", `${id}.final.png`), img);
    mapNote = `map: NO render, median-stacked captures ${img.width}x${img.height} -> ${enc.data.length} B JPEG q82`;
  }
  mapsJs.push(`  ${hole}: "data:image/jpeg;base64,${enc.data.toString("base64")}",`);
  mapBytes += enc.data.length;
  console.log(`H${hole}: ${mapNote}; ${greenNote}`);
}
mapsJs.push("};", "");
writeFileSync(join(ROOT, "src", "maps.js"), mapsJs.join("\n"));
greensJs.push("};", "");
writeFileSync(join(ROOT, "src", "greens.js"), greensJs.join("\n"));
writeFileSync(join(ROOT, "src", "mapxform.js"),
  `// AUTO-GENERATED by tools/build-derived.mjs — old(219x270)->new(250x304)\n// fractional transforms for the one-time mapV5 migration.\nexport const MAP_XFORM_V5 = ${JSON.stringify(xform)};\n`);
// Assembled shot rows (tools/assemble-shots.mjs) ride along for the app's
// auto-Log, importable ones only, less tools/shot-exclusions.json's (whose
// ids ship as excludedShots, so the app deletes its stored copies). A row
// with a position (pos: the ball on its address frame's minimap) is flown
// over its hole's terrain along its bearing as the solver flies a club
// (src/model.js lineProfile / elevFlight: Nintendo Switch Sports' ball,
// src/nsssim.js, at k = 1, from the row's lie; heights and surfaces from
// public/terrain through src/terrain.js, exactly as the App's solver context
// reads them): elevFactor = NSS's stop over that profile at the row's power
// and wind, the landing surfaces read from the terrain, over the same shot
// on level fairway, and flatEnded = ended /
// elevFactor, the stop the shot would have had on level fairway, which the
// club fit reads (src/model.js fitClub). A row whose frame gave neither an
// aim nor a cup takes the line to the hole's most-seen pin (bearingFrom
// "pin"); a row without elevFactor says why (elevWhy).
const EXCLUSIONS = join(ROOT, "tools", "shot-exclusions.json");
const excludedShots = existsSync(EXCLUSIONS) ? Object.keys(JSON.parse(readFileSync(EXCLUSIONS, "utf8")).rows ?? {}).sort() : [];
// the irons' ids in rows assembled before 2026-10-21
const SHOT_CLUB = { "3i": "3iron", "5i": "5iron", "7i": "7iron", "9i": "9iron" };
const terrains = new Map();
const terrainOf = (hole) => {
  if (!terrains.has(hole)) {
    const p = join(ROOT, "public", "terrain", `h${String(hole).padStart(2, "0")}.bin`);
    terrains.set(hole, existsSync(p) ? parseTerrain(readFileSync(p)) : null);
  }
  return terrains.get(hole);
};
function flyShot(r) {
  if (!r.pos) return { elevWhy: r.posWhy ?? "no position" };
  const dh = derived.holes[r.hole], sc = dh?.scale, club = SHOT_CLUB[r.club] ?? r.club;
  const W = derived.mapW, H = derived.mapH, out = {};
  let bearing = r.bearing;
  if (bearing == null) {
    const pin = [...(dh?.pins ?? [])].sort((a, b) => (b.seen ?? 0) - (a.seen ?? 0))[0];
    if (!pin) return { elevWhy: "no bearing: the frame showed no aim or cup and the hole has no pin" };
    bearing = +(((Math.atan2((pin.x - r.pos.x) * W, -(pin.y - r.pos.y) * H) * 180) / Math.PI + 360) % 360).toFixed(1);
    Object.assign(out, { bearing, bearingFrom: "pin" });
  }
  const t = terrainOf(r.hole);
  if (!t || !(sc > 0)) return { ...out, elevWhy: `no terrain or scale for hole ${r.hole}` };
  const h0 = terrainHeightAt(t, r.pos.x, r.pos.y);
  if (h0 == null) return { ...out, elevWhy: "no terrain height under the ball" };
  const th = (bearing * Math.PI) / 180;
  const at = (yd) => [r.pos.x + (Math.sin(th) * yd) / sc / W, r.pos.y - (Math.cos(th) * yd) / sc / H];
  const prof = lineProfile({
    surfaceAt: (yd) => lieOf(classAt(t, ...at(yd))),
    heightAt: (yd) => { const h = terrainHeightAt(t, ...at(yd)); return h == null ? null : h - h0; },
  });
  if (!prof) return { ...out, elevWhy: "no terrain along the line" };
  const f = elevFlight({ club, power: r.power, lie: r.lie, windSpeed: r.windSpeed ?? 0, windDeg: r.windDeg ?? 0, prof });
  if (!f) return { ...out, elevWhy: `${r.club} is not one of NSS's clubs` };
  const { over, level } = f;
  if (!(over > 0 && level > 0)) return { ...out, elevWhy: `NSS's ball stops at ${over.toFixed(1)} yd over the terrain` };
  const elevFactor = +(over / level).toFixed(4);
  return { ...out, elevFactor, flatEnded: +(r.ended / elevFactor).toFixed(1) };
}
// Without captures/derived/shots.json the Log ships empty (a warning); with
// it, a row that cannot be read or flown (a physics or API mismatch) fails the
// build, so an empty or stale Log never ships silently.
const SHOTS = join(D, "shots.json");
if (!existsSync(SHOTS)) { console.warn(`shot rows not attached: no ${SHOTS}`); derived.shots = []; }
else {
  try {
    const shots = JSON.parse(readFileSync(SHOTS, "utf8"));
    const drop = new Set(excludedShots);
    derived.shots = shots.rows.filter((r) => r.importable && !drop.has(r.id))
      .map(({ flags, importable, spot, posWhy, ...r }) => ({ ...r, ...flyShot({ ...r, posWhy }) }));
  } catch (e) {
    console.error(`shot rows not attached: ${e.stack ?? e.message}; derived.json not written`);
    process.exit(1);
  }
  const flown = derived.shots.filter((r) => r.elevFactor != null);
  console.log(`attached ${derived.shots.length} importable shot rows, ${flown.length} flown over the terrain with NSS's ball${flown.length ? ` (elevFactor ${Math.min(...flown.map((r) => r.elevFactor))}-${Math.max(...flown.map((r) => r.elevFactor))})` : ""}; ${excludedShots.length} ids in excludedShots`);
}
derived.excludedShots = excludedShots;

mkdirSync(join(ROOT, "public"), { recursive: true });
writeFileSync(join(ROOT, "public", "derived.json"), JSON.stringify(derived));
// which tee frames the pins and the online tee actually used (tools/frame-audit.mjs),
// and every pin observation with its outcome (tools/PINS.md)
writeFileSync(join(D, "tee-frames-used.json"), JSON.stringify(teeFramesUsed, null, 1));
writeFileSync(join(D, "pin-observations.json"), JSON.stringify(pinObservations, null, 1));
console.log(`wrote src/maps.js (${mapsFromRender} of 21 maps from the renders, ${(mapBytes / 1024).toFixed(0)} KB of JPEG), src/greens.js (${greensFromRender} of ${Object.keys(greenMeta).length} green views from the render crops, ${(greenBytes / 1024).toFixed(0)} KB), src/mapxform.js, public/derived.json`);
