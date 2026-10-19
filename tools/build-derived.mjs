// Assemble the app's shipped course data from the pipeline outputs:
//   src/maps.js       base64-JPEG hole maps: the renders of WSR's own minimap
//                     (tools/render-maps.mjs, captures/derived/render/hNN.png,
//                     the 250x304 frame at 2x); a hole with no render ships
//                     its median-stacked captures as before
//   src/greens.js     the zoomed green views: the renderer's green crops, or
//                     the capture-fused texture where there is no crop
//   src/mapxform.js   old->new fractional transforms (for the one-time
//                     migration of stored positions) + new map px size
//   public/derived.json  per-hole scale, green box, quantized 9x9 slope
//                     grid (app convention: unit direction x magnitude
//                     1|2|3), pins, tees and trees in map-fractional coords
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = join(ROOT, "captures", "inbox");
const D = join(ROOT, "captures", "derived");
const mapsMeta = JSON.parse(readFileSync(join(D, "maps.json"), "utf8")).holes;
const register = JSON.parse(readFileSync(join(D, "register.json"), "utf8"));
// The rendered hole maps and green crops (tools/render-maps.mjs: WSR's own
// minimap model, textures and tree sprites from the course archives,
// rasterised into the 250x304 frame at 2x, and each WSR green box plus its
// margin at the box's true aspect). A hole that has them ships them; one
// that does not falls back to its median-stacked captures and the fused zoom
// texture, and the log says so. index.json is read only to check that a crop
// on disk was rendered for the green box the truth now has.
const RENDER = join(D, "render");
let renderIndex = {};
try { renderIndex = JSON.parse(readFileSync(join(RENDER, "index.json"), "utf8")).holes ?? {}; } catch {}
// JPEG quality of the shipped renders. A map at 2x has four times the pixels
// of the stack it replaces and WSR's textures are dense (the mottled rough and
// the OB pattern cover most of a frame), so a 500x608 frame runs 62-108 KB at
// q82 against ~18 KB for a 250x304 stack: src/maps.js would be 2.33 MB of
// base64 at q82. At q78 it is 2.08 MB (55-96 KB per hole), and crops of H7
// encoded at q78, q80 and q82, shown at 2x of the render, cannot be told
// apart; the quantisation hides in the textures' own noise. The green crops
// (250-290 px) total 244 KB at q82, under the 288 KB the fused capture
// textures took at q86, so they keep q82.
const MAP_JPEG_Q = 78, GREEN_JPEG_Q = 82;
let mapBytes = 0, greenBytes = 0, mapsFromRender = 0, greensFromRender = 0;
// WSR collision-mesh truth (tools/wsr-truth.json, written by tools/wsr-truth.mjs).
// The user's rule: when in doubt the WSR data is the truth and derived data
// adjusts to it. Where a hole has it, the WSR green box replaces the capture
// projection (so outline, pin sightings, pin zones and the transplanted green
// all follow it) and the WSR scale and slope grid replace the capture ones.
// With tools/wsr-pins.json as well, pins are WSR's own spots and the tee is
// the WSR player start (see WSRP below). Without the files, or for a hole they
// lack, the capture data is used as before: pins are the sighting clusters and
// the tee is the detected marker kept on the WSR tee pad.
let WSR = null;
try { WSR = JSON.parse(readFileSync(join(ROOT, "tools", "wsr-truth.json"), "utf8")).holes; } catch {}

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

const mapsJs = ["// AUTO-GENERATED by tools/build-derived.mjs: the hole maps rendered from the",
  "// WSR course data by tools/render-maps.mjs (500x608 = the 250x304 map frame",
  "// at 2x; a hole with no render ships its median-stacked captures at 250x304).",
  "// Fractional coordinates as always.", "export const HOLE_MAPS = {"];
const greensJs = ["// AUTO-GENERATED by tools/build-derived.mjs: each green rendered from the WSR",
  "// course data (tools/render-maps.mjs) in the green's OWN frame: the WSR green",
  "// box plus 12% of it on every side, at the box's true aspect, so box-local",
  "// (u, v) sits at (u + 0.12) / 1.24 of the image (derived.json's greenView",
  "// carries aspect and margin). A hole with no render crop ships the fused,",
  "// flag-free zoom-capture texture instead (256x256, the same margin).",
  "export const GREEN_VIEWS = {"];
const greenMeta = {};
// ---------------------------------------------------------------------------
// GREEN TRANSPLANT (the fallback for a hole with no render, since 2026-10-18;
// the render draws WSR's own green)
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
// poly is the green outline in box-normalized coords (the WSR outline when
// known). The texture must also look like the overview there: below
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

// Content revision of a hole's WSR geometry (FNV-1a over scale, box, outline,
// grid). The app re-applies WSR values whenever it changes, so a corrected
// truth reaches stored state while unchanged holes keep manual edits.
function wsrRev(wt) {
  const s = JSON.stringify([wt.scale, wt.greenBox, wt.greenPoly, wt.grid]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return "wsr-" + h.toString(16).padStart(8, "0");
}

// nearest point of a polygon (map px) to (x, y); returns (x, y) if inside
function snapIntoPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  if (inside) return [x, y, false];
  let best = null;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L2));
    const qx = ax + t * (bx - ax), qy = ay + t * (by - ay), d = Math.hypot(x - qx, y - qy);
    if (!best || d < best.d) best = { d, qx, qy };
  }
  return [best.qx, best.qy, true];
}

// Where the ball sits on the WSR tee pad: the detected markers all lie on their
// pads and match the in-game yardage better than the pad centre does, sitting
// a few yards toward the green. The median of that offset places the ball on
// holes with no detected marker.
const MAP_W = 250, MAP_H = 304;
const teeAxis = (wt) => {
  const ux = (wt.greenCentre[0] - wt.tee.x) * MAP_W, uy = (wt.greenCentre[1] - wt.tee.y) * MAP_H;
  const L = Math.hypot(ux, uy) || 1;
  return [ux / L, uy / L];
};
let TEE_FORWARD_YD = 0;
if (WSR) {
  const offs = [];
  for (let hole = 1; hole <= 21; hole++) {
    const wt = WSR[hole], meta = mapsMeta.find((m) => m.hole === hole);
    if (!wt?.tee || !meta?.tee) continue;
    const [ex, ey] = teeAxis(wt);
    const dx = meta.tee.x - wt.tee.x * MAP_W, dy = meta.tee.y - wt.tee.y * MAP_H;
    offs.push((dx * ex + dy * ey) * wt.scale);
  }
  offs.sort((a, b) => a - b);
  if (offs.length) TEE_FORWARD_YD = offs[Math.floor(offs.length / 2)];
  console.log(`WSR truth: ${Object.keys(WSR).length} holes; detected tee sits a median ${TEE_FORWARD_YD.toFixed(2)} yd toward the green from the pad centre (${offs.length} holes)`);
}

// WSR's own pin spots and player starts (tools/wsr-pins.json, decoded from the
// course PMP files by tools/wsr-pins.mjs) are the truth for where pins and the
// tee are (tools/PINS.md). NSS reuses WSR's spots, both sets, and adds a few of
// its own. Local play tees off from the WSR start; online Survival Golf from a
// two-tiered platform whose lower tier stands 0-8 yd behind it (the Tees
// block below). derived.json gets every WSR spot with the number of rounds it
// was seen in, the Switch-only spots that two independent readings agree on,
// tee = the WSR start and teeOnline = the platform's two tiers, placed from
// the online tee frames.
let WSRP = null;
try { WSRP = JSON.parse(readFileSync(join(ROOT, "tools", "wsr-pins.json"), "utf8")).holes; } catch {}
// Trees are WSR's own too (wsr-pins.json `trees`: the PMP tree objects, kind =
// the PMP id, size = the object's x scale), replacing the v13 hand-placed
// seeds (24 of 130 within 6 px of a real tree). The hole map shows them as
// the game draws them: tools/render-maps.mjs paints the glf_tree sprite quads
// from the course archives (tools/wsr-map), so the app draws no marker of its
// own over them and `r` only says how far the painted canopy reaches, for
// the tap rule. Measured on the quads and the sprite textures (2026-10-18):
// a quad is 160 KCL units wide per unit of size (160.0 on all 31 of H7's and
// all 33 of H16's quads matched to their PMP trees; p10-p90 151-172 over the
// 460), the PMP position is the trunk base at 0.812 of the quad from its
// north edge, and the alpha-tested canopy (a >= 128, the material's test)
// reaches a median 0.422 / 0.395 / 0.387 of the quad from its own centre
// along 36 rays (kind 2 broadleaf / 3 conifer / 6 palm; the widest row spans
// 0.414 / 0.445 / 0.383), that centre at 0.477 / 0.469 / 0.477 of the quad
// from the north edge. So the painted canopy is a disc of 68 / 63 / 62 units
// per unit of size whose centre stands 54 / 55 / 54 units NORTH of the trunk,
// checked by drawing the discs over the renders of H7, H16 and H19 (a
// trunk-centred disc covers only the canopy's southern half). The Switch's
// own sprites, fitted on the captures before the renders (81 / 48 / 45 units,
// centred on the trunk), are not what the app shows any more. In map px that
// is K * size / (scale * 9.144), with scale the hole's yd/px.
const TREE_CANOPY_UNITS = { 2: 68, 3: 63, 6: 62 };
const TREE_CANOPY_UP = { 2: 54, 3: 55, 6: 54 };
const UNITS_PER_YD = 9.144;
// a tree this far outside the frame (fraction) still ships: its canopy reaches in
const TREE_MARGIN = 0.02;
// A tree on one of these lies (wsr-pins.json `lie`: the KCL surface under the
// trunk, read off the mesh class rasters) ships with off: true. The course
// does not reach there, the minimap draws no canopy and a ball is out of
// bounds already, so the app's Edit-trees tap rule and the Guide's count skip
// it (the app draws no marker for pipeline trees since the map is rendered
// with WSR's own sprites; when it did, the off ones drawn like the course
// trees buried the map: H16 has 68 of its 101 trees on the outer ground, H1
// 46 of 57). The lie itself stays out of derived.json: the app only needs
// on or off, and it would add 1,272 strings to the file.
const TREE_OFF_LIES = new Set(["outer", "water"]);
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
// A reading within this many yards of a WSR spot is that spot: the zoom
// readings credited to one land up to 5.09 yd from it (H7 BM; median 2.7 yd),
// and the nearest reading that matches none is H10 S2's wind-11 reading at
// 5.59 yd (3.13 px) from AR, whose round reads 387 yd badges, S2's distance
// (AR is 384). The margin is 0.1 yd each side of 5.5: a registration shift
// of half a pixel on H10 would move that round from S2 to AR.
const PIN_MATCH_YD = 5.5;
// ...unless the next spot is less than this much further (px): then it is
// ambiguous, and only a local badge that fits one spot and is well off the
// other decides. NSS puts some spots up to ~3 yd from WSR's (local badges read
// 0 yd off on some spots and +-2-3 on others from the same tee), hence the
// wide margin.
const AMBIG_PX = 1, BADGE_FIT_YD = 2, BADGE_MISS_YD = 5;
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
// supports the Switch-only spot at 415 against WSR spot 3 at 422): 112 of
// the 141 frames passed it, 121 pass 2.5 px, and no frame that passed 3 yd
// fails.
const BADGE_TOL_PX = 2.5;
// In a badge tie-break only local frames whose ball is on the start count,
// against each spot's decoded WSR yardage (exact, where the floor of the
// map-frame distance gives 251 for H16 BR, decoded 250). On-start avatars
// sit up to 4.8 yd from the start on long holes (3 px at H14's 1.6 yd/px,
// 1.2-1.8 px on H3/H9/H12/H20 at 2.1-2.5 yd/px); the post-shot frames the
// tee-frame filter also admits (H10's 365-367 yd restart frames) stand
// 6.0-8.3 yd out, and their badge is a distance from the ball, not the start.
const AT_START_YD = 5;
// Readings of one pin within one session: a tee cup joins a zoom reading
// within this distance (they disagree by up to 2.3 px), and zoom readings of
// one pin agree within it.
const SAME_PIN_PX = 2.5;
// Tee-frame cups are coarser than zoom sightings (mostly within 2 px of the
// spot, a few 3.5 px), so a spot only they show must sit clear of every WSR
// spot by both measures.
const TEE_ONLY_MIN_YD = 7, TEE_ONLY_MIN_PX = 3;
// A Switch-only spot ships on two independent readings: two sessions, or a
// zoom capture and a tee frame. One reading alone is doubt, and the WSR data
// wins doubt; it goes to pinCandidates. Hole 19's lone zoom sighting is the
// case in point: 6 px off any spot, while its own session's tee frame shows
// WSR pin 2.
const SWITCH_SPOT_MIN_READINGS = 2;
// The online tee platform. tools/online-rounds.json says which tier of it
// the player stood on in each online round (a hole at one wind), judged from
// the frames by eye, and holds the offset between the tiers; without the
// file the observed median still ships, with no tiers (the Tees block below
// has the model). An online frame's avatar is the yellow blob nearest the
// WSR start, if within TEE_REACH_YD of it: the observed round medians stand
// 0-12 yd from the start (H10 0.3 yd toward the green, H4 11.8 yd behind).
let ONLINE_ROUNDS = null;
try { ONLINE_ROUNDS = JSON.parse(readFileSync(join(ROOT, "tools", "online-rounds.json"), "utf8")); } catch {}
const TIER_OFFSET_YD = ONLINE_ROUNDS?.tierOffsetYd ?? 4;
// The file keys a round by hole + wind only (no date) and the first entry
// wins: two entries for one hole + wind, or a second online round at a wind
// the file judges once (another day, perhaps from the other tier), would hand
// the same tier to both rounds, 4 yd wrong for one of them. Both cases warn
// (the per-hole one in the Tees block) rather than pass silently.
const tierEntries = (hole, wind) => ONLINE_ROUNDS?.rounds?.filter((r) => r.hole === hole && String(r.wind) === String(wind)) ?? [];
const tierOf = (hole, wind) => tierEntries(hole, wind)[0]?.tier ?? null;
for (const r of ONLINE_ROUNDS?.rounds ?? []) {
  const same = tierEntries(r.hole, r.wind);
  if (same.length > 1 && same[0] === r) console.warn(`tools/online-rounds.json: ${same.length} entries for hole ${r.hole} at wind ${r.wind} (${same.map((q) => q.tier).join(", ")}); the first one is used`);
}
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
  // the hole's render and green crop (tools/render-maps.mjs), when it has them
  const renderMap = existsSync(join(RENDER, `${id}.png`)) ? join(RENDER, `${id}.png`) : null;
  const renderGreen = existsSync(join(RENDER, `${id}-green.png`)) ? join(RENDER, `${id}-green.png`) : null;
  // The median-stacked captures: the shipped map only for a hole with no
  // render (loaded at the end of the loop, where the green is transplanted
  // into it), while the detection stack (flag and cup intact) anchors the
  // capture green-box projection on every hole, since that box ships as
  // captureGreenBox beside the WSR one. The projection correlates against
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
  let greenBox = null, greenPoly = null, pins = [], pinZones = null, greenPins = 0, pinCandidates = [];
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
  const wt = WSR?.[hole] ?? null;
  // projection box in map px: the WSR green's bbox (float) when known, else the
  // capture projection. The zoom captures' green outlines match the WSR
  // outlines in normalized shape (IoU 0.86-0.98, aspect within 3%), so
  // bbox-normalized pins and outline carry over through either box.
  const pb = wt ? { x0: wt.greenBox.x0 * W, y0: wt.greenBox.y0 * H, x1: wt.greenBox.x1 * W, y1: wt.greenBox.y1 * H } : captureBox;
  if (pb) {
    // integer box for the pixel loops (transplant, debug overlay)
    box = wt ? { x0: Math.max(0, Math.round(pb.x0)), y0: Math.max(0, Math.round(pb.y0)),
      x1: Math.min(W - 1, Math.round(pb.x1)), y1: Math.min(H - 1, Math.round(pb.y1)) } : captureBox;
    greenBox = wt ? wt.greenBox : { x0: +(pb.x0 / W).toFixed(4), y0: +(pb.y0 / H).toFixed(4),
      x1: +(pb.x1 / W).toFixed(4), y1: +(pb.y1 / H).toFixed(4) };
    // pins via bbox-normalized coords — zoom-invariant across sessions —
    // then CLUSTERED (radius below). Every pair that sees the same flag
    // reports it, so one spot captured six times used to ship as six pins; the app deduped on merge but derived.json lied and the debug
    // overlay was unreadable. Averaging each cluster also sharpens the
    // estimate: more observations of a spot now means a better fix on it,
    // not more clutter.
    // the fused green outline, projected the same way (bbox-normalized ->
    // map fraction). A polygon, not a rectangle: greens are lobed, and the
    // fringe that wraps every green is a real boundary.
    if (wt) greenPoly = wt.greenPoly;
    else if (g.poly) greenPoly = g.poly.map(([nx, ny]) => [
      +((pb.x0 + nx * (pb.x1 - pb.x0)) / W).toFixed(4),
      +((pb.y0 + ny * (pb.y1 - pb.y0)) / H).toFixed(4)]);
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
    pins = clusters.map((c) => ({
      x: +((pb.x0 + (c.gx / c.n) * (pb.x1 - pb.x0)) / W).toFixed(4),
      y: +((pb.y0 + (c.gy / c.n) * (pb.y1 - pb.y0)) / H).toFixed(4), n: c.n }));

    // PIN ZONES. Clustered in GREEN-LOCAL space (fraction of the green's own
    // bbox), which is the frame the game presumably picks spots in and is
    // comparable across holes and zoom levels. Cluster count is stable across
    // a wide threshold range — H1 holds at 2 zones from 0.02 to 0.30, H14 and
    // H16 at 3 — which is what discrete spawn vicinities look like rather than
    // a uniform scatter. 0.12 sits inside that plateau for every hole so far.
    const ZONE_T = 0.12;
    const lab = new Array(g.pins.length).fill(-1);
    let zn = 0;
    for (let i = 0; i < g.pins.length; i++) {
      if (lab[i] >= 0) continue;
      lab[i] = zn;
      const st = [i];
      while (st.length) {
        const a = st.pop();
        for (let j = 0; j < g.pins.length; j++) {
          if (lab[j] >= 0) continue;
          if (Math.hypot(g.pins[a].gx - g.pins[j].gx, g.pins[a].gy - g.pins[j].gy) <= ZONE_T) { lab[j] = zn; st.push(j); }
        }
      }
      zn++;
    }
    const bw = pb.x1 - pb.x0, bh = pb.y1 - pb.y0;
    greenPins = g.pins.length;
    pinZones = Array.from({ length: zn }, (_, z) => {
      const mem = g.pins.filter((_, i) => lab[i] === z);
      const gx = mem.reduce((s, p) => s + p.gx, 0) / mem.length;
      const gy = mem.reduce((s, p) => s + p.gy, 0) / mem.length;
      // radius in green-local units, and the same in map fractions so the app
      // can draw it without knowing the green's bbox
      const rg = Math.max(...mem.map((p) => Math.hypot(p.gx - gx, p.gy - gy)));
      return {
        x: +((pb.x0 + gx * bw) / W).toFixed(4),
        y: +((pb.y0 + gy * bh) / H).toFixed(4),
        r: +(Math.max(rg * bw / W, rg * bh / H)).toFixed(4),
        rGreen: +rg.toFixed(3), n: mem.length,
      };
    }).sort((a, b) => b.n - a.n);
    // debug overlay
    const dbg = { width: W, height: H, data: Buffer.from(det.data) };
    const set = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; dbg.data[i] = 30; dbg.data[i + 1] = 120; dbg.data[i + 2] = 255; };
    for (let x = box.x0; x <= box.x1; x++) { set(x, box.y0); set(x, box.y1); }
    for (let y = box.y0; y <= box.y1; y++) { set(box.x0, y); set(box.x1, y); }
    for (const p of pins) { const bx = Math.round(p.x * W), by = Math.round(p.y * H);
      for (let d = -4; d <= 4; d++) { set(bx + d, by); set(bx, by + d); } }
    savePng(join(D, "boxes", `${id}.png`), dbg);
  }
  const zoomAspect = (g.panelBbox.x1 - g.panelBbox.x0) / (g.panelBbox.y1 - g.panelBbox.y0);
  const mapAspect = box ? (box.x1 - box.x0) / (box.y1 - box.y0) : null;
  // tee (see TEE_FORWARD_YD): the detected marker while it is on the WSR pad,
  // snapped onto the pad if it is not; no marker -> pad centre moved forward
  let tee = meta.tee ? { x: +(meta.tee.x / W).toFixed(4), y: +(meta.tee.y / H).toFixed(4) } : null, teeNote = "";
  if (wt?.tee) {
    if (meta.tee) {
      const [sx, sy, moved] = snapIntoPoly(meta.tee.x, meta.tee.y, wt.teePad.map(([x, y]) => [x * W, y * H]));
      if (moved) { tee = { x: +(sx / W).toFixed(4), y: +(sy / H).toFixed(4) }; teeNote = " tee snapped onto WSR pad"; }
    } else {
      const [ex, ey] = teeAxis(wt), d = TEE_FORWARD_YD / wt.scale;
      tee = { x: +((wt.tee.x * W + ex * d) / W).toFixed(4), y: +((wt.tee.y * H + ey * d) / H).toFixed(4) };
      teeNote = " tee from WSR pad";
    }
  }
  // ---- pins and tees from WSR's placement file (truth) + Switch readings ----
  let teeOnline = null, pinAmbiguous = [];
  const wp = WSRP?.[hole] ?? null;
  // (a wsr-pins.json from before the spots were decoded has pins and starts
  // but no spots: the capture pins and tee above stand then)
  if (wp && wt && pb && wp.starts?.length && Array.isArray(wp.spots)) {
    const sc = wt.scale; // yd per map px
    const pxTo = (a, b) => Math.hypot((a.x - b.x) * W, (a.y - b.y) * H); // fractions in, map px out
    const yd = (a, b) => pxTo(a, b) * sc;
    const start = { x: wp.starts[0].x, y: wp.starts[0].y };
    const spots = wp.spots.map((s) => ({ id: `s${s.slots[0]}`, x: s.x, y: s.y, label: s.label, set: s.set, yd: s.yd, src: "wsr", sessions: new Set() }));
    const toMap = (p) => ({ x: (pb.x0 + p.gx * (pb.x1 - pb.x0)) / W, y: (pb.y0 + p.gy * (pb.y1 - pb.y0)) / H });
    // the avatar: of a frame's yellow blobs, the one nearest the WSR start, if
    // it is within reach of the teeing ground at all
    const avatarOf = (f) => {
      const near = (f.ptrs ?? []).map((q) => ({ x: q.x / W, y: q.y / H })).sort((a, b) => yd(a, start) - yd(b, start))[0];
      return near && yd(near, start) <= TEE_REACH_YD ? near : null;
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
    // Which spot each observation shows: the nearest WSR spot within reach,
    // unless the next one is about as close; then the badges of the local tee
    // frames whose ball is on the start decide, against each spot's own WSR
    // yardage, if they clearly fit one and miss the other (local play tees
    // off from the WSR start), and otherwise nobody is credited.
    const credit = (o, q) => { o.result = q.label; o.spot = q; q.sessions.add(o.round); for (const r of o.tee) (teeFramesUsed[r.file] ??= []).push(`pin ${q.label}`); };
    const unmatched = [], band = [];
    for (const o of obs) {
      const ds = spots.map((q) => ({ q, d: pxTo(o, q) })).sort((a, b) => a.d - b.d);
      const teeOnly = !o.zoom.length;
      if (!ds.length || ds[0].d * sc > PIN_MATCH_YD) {
        // tee cups alone, out of reach of a WSR spot but not clear of it: they
        // may repeat another round's credited reading or join a Switch-only
        // spot below, but cannot start one
        if (teeOnly && ds.some((q) => q.d * sc < TEE_ONLY_MIN_YD || q.d < TEE_ONLY_MIN_PX)) band.push({ o, near: ds[0].q });
        else unmatched.push(o);
        continue;
      }
      let pick = ds[0].q;
      if (ds[1] && ds[1].d - ds[0].d < AMBIG_PX) {
        const loc = o.tee.filter((r) => !r.online && yd(r.p, start) <= AT_START_YD);
        const miss = (q) => loc.length ? median(loc.map((r) => Math.abs(r.badge - q.yd))) : Infinity;
        const m0 = miss(ds[0].q), m1 = miss(ds[1].q);
        pick = m0 <= BADGE_FIT_YD && m1 >= BADGE_MISS_YD ? ds[0].q : m1 <= BADGE_FIT_YD && m0 >= BADGE_MISS_YD ? ds[1].q : null;
        if (!pick) { o.result = `ambiguous ${ds[0].q.label}/${ds[1].q.label}`; pinAmbiguous.push({ x: +o.x.toFixed(4), y: +o.y.toFixed(4), spots: [ds[0].q.label, ds[1].q.label] }); continue; }
      }
      credit(o, pick);
    }
    // Spots WSR doesn't have: unmatched observations, merged across rounds.
    // They ship on two independent readings (two rounds, or a zoom capture
    // and a tee frame); the rest are doubt and go to pinCandidates.
    const groups = [];
    const place = (gr) => {
      const z = gr.obs.filter((q) => q.zoom.length), from = z.length ? z : gr.obs;
      const mean = (a) => a.reduce((t, v) => t + v, 0) / a.length;
      gr.x = (z.length ? mean : median)(from.map((q) => q.x));
      gr.y = (z.length ? mean : median)(from.map((q) => q.y));
    };
    for (const o of unmatched) {
      const gr = groups.find((q) => yd(q, o) <= PIN_MATCH_YD);
      if (gr) { gr.obs.push(o); place(gr); } else groups.push({ x: o.x, y: o.y, obs: [o] });
    }
    // The band: a tee cup within SAME_PIN_PX of where another round's reading
    // was credited to a WSR spot shows that spot (H3's wind-4 round read 536
    // yd with its cup on the very pixel of the wind-2 round's AL reading, 5.8
    // yd from AL, and used to ship as a one-spot ambiguity); otherwise it
    // joins a Switch-only spot in reach, or is left ambiguous.
    const credited = obs.filter((q) => q.spot);
    for (const { o, near } of band) {
      const same = credited.filter((q) => q.round !== o.round && pxTo(q, o) <= SAME_PIN_PX).sort((a, b) => pxTo(a, o) - pxTo(b, o))[0];
      const gr = groups.map((q) => ({ q, d: yd(q, o) })).sort((a, b) => a.d - b.d)[0];
      if (same) credit(o, same.spot);
      else if (gr && gr.d <= PIN_MATCH_YD) gr.q.obs.push(o); // joins without moving it: tee cups are coarse
      else { o.result = `ambiguous, ${(pxTo(o, near) * sc).toFixed(1)} yd from ${near.label}`; pinAmbiguous.push({ x: +o.x.toFixed(4), y: +o.y.toFixed(4), spots: [near.label] }); }
    }
    const readingsOf = (gr) => new Set(gr.obs.flatMap((o) => [...(o.zoom.length ? [`${o.round}:zoom`] : []), ...(o.tee.length ? [`${o.round}:tee`] : [])])).size;
    const sessionsOf = (gr) => new Set(gr.obs.map((o) => o.round)).size;
    // Switch-only spots are numbered by first sighting, so a spot keeps its
    // S-number when later rounds change which one is seen most (ranked by
    // rounds seen, H10's S1 and S2 would swap as soon as S2 overtook S1, under
    // the player's chosen pin)
    const firstMs = (gr) => Math.min(...gr.obs.flatMap((o) => [...o.zoom, ...o.tee].map((r) => r.ms)));
    const kept = groups.filter((gr) => readingsOf(gr) >= SWITCH_SPOT_MIN_READINGS)
      .sort((a, b) => firstMs(a) - firstMs(b) || a.x - b.x);
    const doubt = groups.filter((gr) => readingsOf(gr) < SWITCH_SPOT_MIN_READINGS);
    kept.forEach((gr, k) => { for (const o of gr.obs) { o.result = `S${k + 1}`; for (const r of o.tee) (teeFramesUsed[r.file] ??= []).push(`pin S${k + 1}`); } });
    for (const gr of doubt) for (const o of gr.obs) o.result = "candidate (one reading)";
    pinObservations[hole] = obs.map((o) => {
      const rs = [...o.zoom, ...o.tee];
      return { round: o.round, wind: windOf(rs[0].file), at: [+(o.x * W).toFixed(1), +(o.y * H).toFixed(1)],
        online: onlineRounds.has(o.round), result: o.result ?? "?",
        readings: rs.map((r) => `${r.kind} ${r.file}${r.badge != null ? ` ${r.badge}yd` : ""}`) };
    });
    pins = [...spots.map(({ sessions, ...s }) => ({ ...s, seen: sessions.size })),
      ...kept.map((gr, k) => ({ id: `x${k}`, x: +gr.x.toFixed(4), y: +gr.y.toFixed(4), label: `S${k + 1}`, set: null,
        yd: Math.floor(yd(start, gr)), src: "switch", seen: sessionsOf(gr) }))];
    pinCandidates = doubt.map((gr) => ({ x: +gr.x.toFixed(4), y: +gr.y.toFixed(4), sessions: sessionsOf(gr),
      seenBy: [...new Set(gr.obs.flatMap((o) => [...(o.zoom.length ? ["zoom"] : []), ...(o.tee.length ? ["tee"] : [])]))],
      badges: [...new Set(gr.obs.flatMap((o) => o.tee.map((r) => r.badge)))] }));

    // Tees. Local play tees off from the WSR start. Online Survival Golf
    // tees off from a two-tiered platform, the same object on every hole
    // (player-confirmed): four slots on the lower tier, four on the upper,
    // which is directly behind the lower one and raised a few feet, so a
    // slot's upper position is its lower one moved back by one constant.
    // The tier of each online round is judged from its frames by eye
    // (tools/online-rounds.json: on the upper tier other players' heads show
    // cut off by the deck edge in front; on the lower one the glass-faced
    // upper deck and its stairs rise behind or beside the player). The
    // offset between the tiers comes from H11, the one hole captured from
    // both: its W6 (upper) round's median avatar stands 4.02 yd further from
    // the green than its W0 (lower) round's, so tierOffsetYd = 4.0, +-1 yd
    // (the avatar marker wanders ~1.5 px with the aim, 1.3 yd on H11). The
    // offset runs along the tee -> green-centre axis (teeAxis: from the WSR
    // tee-pad centre, where the start sits, to the green centre; the two
    // directions differ by at most 0.64 deg, on H4, which moves the 4 yd
    // offset by under 0.05 yd), away from the green. On a dogleg the platform faces the fairway, not
    // the green centre, so that axis can be some degrees off: 20 deg moves
    // the 4 yd offset by about 1.4 yd sideways, within the slot scatter.
    // Per round, the median avatar (each frame's avatar nearest the start, as
    // above) is where the player's tier stood; the lower tier is that point
    // moved TIER_OFFSET_YD toward the green when the round was upper, else
    // the point itself; the hole's lower tier is the mean over its judged
    // rounds (H11 has two, which agree by construction of the offset) and
    // its upper tier sits TIER_OFFSET_YD behind that. x, y stay the observed
    // median over all the hole's online frames. The badge corrects none of
    // it: it is the distance to the pin, and NSS keeps some spots 2-4 yd from
    // WSR's position, so sliding the avatar to the badge distance from the
    // WSR spot moved the tee by the spot's offset (H9's online avatars stand
    // a median 8.6 yd from the start; slid, 3.5 yd, and the tee was
    // withheld). Every hole with 2+ online frames ships: the lower tier sits
    // within 2 yd of the start on H10 and H11 (and 4.6 yd beside it on H14)
    // while the upper tier is 4 yd behind it, so no distance-from-the-start
    // rule applies.
    tee = { x: +start.x.toFixed(4), y: +start.y.toFixed(4) };
    teeNote = " tee = WSR start";
    const online = (meta.teeFrames ?? []).filter((f) => f.online).map((f) => ({ f, p: avatarOf(f) })).filter((q) => q.p);
    let onlineNote = online.length >= 2 ? "" : online.length ? ", 1 online frame only" : ", no online frames";
    if (online.length >= 2) {
      const at = { x: median(online.map(({ p }) => p.x)), y: median(online.map(({ p }) => p.y)) };
      const [ex, ey] = teeAxis(wt); // unit vector toward the green, in map px
      // yd behind the start (+ = away from the green) and across the axis (+ = left, seen from the tee)
      const along = (p) => -(((p.x - start.x) * W) * ex + ((p.y - start.y) * H) * ey) * sc;
      const lateral = (p) => (((p.x - start.x) * W) * ey - ((p.y - start.y) * H) * ex) * sc;
      const back = (p, d) => ({ x: p.x - (ex * d / sc) / W, y: p.y - (ey * d / sc) / H }); // p moved d yd away from the green
      const byRound = new Map();
      for (const q of online) { const r = roundOf(hole, q.f.file); byRound.set(r, [...(byRound.get(r) ?? []), q]); }
      const rounds = [...byRound.values()].map((qs) => {
        const m = { x: median(qs.map(({ p }) => p.x)), y: median(qs.map(({ p }) => p.y)) }, wind = windOf(qs[0].f.file), tier = tierOf(hole, wind);
        return { wind, tier, n: qs.length, m, lower: tier === "upper" ? back(m, -TIER_OFFSET_YD) : tier === "lower" ? m : null };
      });
      for (const wind of new Set(rounds.map((q) => String(q.wind)))) {
        const n = rounds.filter((q) => String(q.wind) === wind).length, judged = tierEntries(hole, wind).length;
        if (judged && n > judged) console.warn(`H${hole}: ${n} online rounds at wind ${wind} mph but tools/online-rounds.json judges ${judged}; all ${n} take its tier (${tierOf(hole, wind)}) - judge the new round, it may be the other tier`);
      }
      const judged = rounds.filter((q) => q.lower);
      const mean = (a) => a.reduce((t, v) => t + v, 0) / a.length;
      const lower = judged.length ? { x: mean(judged.map((q) => q.lower.x)), y: mean(judged.map((q) => q.lower.y)) } : null;
      const upper = lower && back(lower, TIER_OFFSET_YD);
      const frac = (p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4) });
      teeOnline = { ...frac(at), n: online.length, rounds: roundsOf(hole, online.map(({ f }) => f.file)),
        seen: [...new Set(judged.map((q) => q.tier))].sort(), ...(lower ? { lower: frac(lower), upper: frac(upper) } : {}) };
      for (const { f } of online) (teeFramesUsed[f.file] ??= []).push("online tee");
      onlineNote = `, online platform: ${rounds.map((q) => `W${q.wind} ${q.tier ?? "tier?"} ${q.n} fr at ${along(q.m).toFixed(1)} along / ${lateral(q.m).toFixed(1)} lateral`).join("; ")}` +
        (lower ? ` -> lower ${along(lower).toFixed(1)}, upper ${along(upper).toFixed(1)} yd behind the start` : " -> no judged tier, tiers not shipped");
    }
    if (process.env.PIN_DEBUG === String(hole)) for (const o of obs)
      console.log(`  round ${o.round} @ ${(o.x * W).toFixed(1)},${(o.y * H).toFixed(1)}: ${[...o.zoom, ...o.tee].map((r) => `${r.kind} ${r.file}${r.badge ? ` ${r.badge}yd` : ""}${r.online ? " online" : ""}`).join(" | ")}`);
    const seenWsr = pins.filter((s) => s.src === "wsr" && s.seen).map((s) => `${s.label}x${s.seen}`).join(" ");
    const fmt = (list) => list.map((gr) => `${(gr.x * W).toFixed(1)},${(gr.y * H).toFixed(1)} ${sessionsOf(gr)} round(s)`).join("; ");
    console.log(`H${hole}: pins = ${spots.length} WSR spot(s) (rounds on Switch: ${seenWsr || "none"})${kept.length ? ` + ${kept.length} Switch-only (${fmt(kept)})` : ""}${doubt.length ? `; one reading only, left out: ${fmt(doubt)}` : ""}${pinAmbiguous.length ? `; ambiguous: ${pinAmbiguous.map((a) => a.spots.join("/")).join(", ")}` : ""}; tee = WSR start${onlineNote}`);
  }
  // ---- trees from WSR's placement file: the ones on the map, x, y = the
  // trunk, with the painted canopy's radius r as a fraction of the map WIDTH
  // and its centre's offset dy from the trunk as a fraction of the map HEIGHT
  // (negative = north; the app's tap rule tests the disc at y + dy) ----
  let trees = null;
  if (Array.isArray(wp?.trees) && wt?.scale) {
    const unitsPerPx = wt.scale * UNITS_PER_YD;
    trees = wp.trees.filter((t) => t.x >= -TREE_MARGIN && t.x <= 1 + TREE_MARGIN && t.y >= -TREE_MARGIN && t.y <= 1 + TREE_MARGIN)
      .map((t) => ({ x: +t.x.toFixed(4), y: +t.y.toFixed(4), r: +(((TREE_CANOPY_UNITS[t.kind] ?? TREE_CANOPY_UNITS[2]) * t.size) / unitsPerPx / W).toFixed(4),
        dy: +(-((TREE_CANOPY_UP[t.kind] ?? TREE_CANOPY_UP[2]) * t.size) / unitsPerPx / H).toFixed(4), kind: t.kind,
        ...(TREE_OFF_LIES.has(t.lie) ? { off: true } : {}) }));
    const off = trees.filter((t) => t.off).length;
    console.log(`H${hole}: trees = ${trees.length} on the map of ${wp.trees.length} in the PMP (${[2, 3, 6].map((k) => `${trees.filter((t) => t.kind === k).length} of kind ${k}`).join(", ")}), ${trees.length - off} on the course, ${off} off (outer ground or water under the trunk), canopy r ${Math.min(...trees.map((t) => t.r * W)).toFixed(1)}-${Math.max(...trees.map((t) => t.r * W)).toFixed(1)} px, centred ${Math.min(...trees.map((t) => -t.dy * H)).toFixed(1)}-${Math.max(...trees.map((t) => -t.dy * H)).toFixed(1)} px north of the trunk`);
  }
  derived.holes[hole] = { scale: wt ? wt.scale : meta.scaleYdPerPx, yards: meta.yards, greenBox, greenPoly,
    grid: quantizeGrid(wt ? wt.grid : g.grid), pins, pinCandidates, pinAmbiguous, pinZones, pinObservations: greenPins,
    greenView: greenMeta[hole] ?? null, tee, teeOnline, trees,
    ...(wt ? { source: "wsr", wsrRev: wsrRev(wt), captureGreenBox: captureBox ? { x0: +(captureBox.x0 / W).toFixed(4), y0: +(captureBox.y0 / H).toFixed(4),
      x1: +(captureBox.x1 / W).toFixed(4), y1: +(captureBox.y1 / H).toFixed(4) } : null } : {}) };
  console.log(`H${hole}: k=${anchor?.k?.toFixed(2)} r=${anchor?.r?.toFixed(2)} box=${box ? `${box.x0},${box.y0}..${box.x1},${box.y1}` : "MISS"}${wt ? ` (WSR; capture box ${captureBox ? `${captureBox.x0},${captureBox.y0}..${captureBox.x1},${captureBox.y1}` : "MISS"})` : ""} aspect map=${mapAspect?.toFixed(2) ?? "-"} zoom=${zoomAspect.toFixed(2)} pins=${pins.length}${teeNote}`);

  // The images the app ships. The hole map is the render of WSR's own minimap
  // (the 250x304 frame at 2x, so a phone shows it sharp) and the zoomed green
  // view is the renderer's crop of the WSR green box plus GT_MARGIN of it on
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
    // the crop's aspect is the WSR box's, width over height in map px, as the
    // renderer computes it. index.json records the box the crop was rendered
    // for: it must be the truth's box exactly (a registration correction
    // translates the box and leaves the aspect alone, and the app would then
    // place pins and slope arrows at the new box's coordinates on the old
    // image); the aspect stands in only for a hole with no truth
    const aspect = wt ? +(((wt.greenBox.x1 - wt.greenBox.x0) * W) / ((wt.greenBox.y1 - wt.greenBox.y0) * H)).toFixed(4) : +(gimg.width / gimg.height).toFixed(4);
    const ri = renderIndex[hole]?.green;
    const sameBox = (a, b) => !!a && !!b && ["x0", "y0", "x1", "y1"].every((k) => a[k] === b[k]);
    const stale = !ri || ri.margin !== GT_MARGIN || (wt ? !sameBox(ri.box, wt.greenBox) : ri.aspect !== aspect);
    const want = `${wt ? `green box ${JSON.stringify(wt.greenBox)}` : `aspect ${aspect}`} (margin ${GT_MARGIN})`;
    if (stale) console.warn(ri
      ? `H${hole}: ${id}-green.png was rendered for green box ${JSON.stringify(ri.box)} (aspect ${ri.aspect}, margin ${ri.margin}) but the truth now gives ${want}; rerun tools/render-maps.mjs`
      : `H${hole}: ${id}-green.png has no index.json entry, so nothing says it was rendered for the truth's ${want}; rerun tools/render-maps.mjs`);
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
    const rimg = loadImage(renderMap);
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
    // With the WSR box the placement is known, not estimated; the capture box
    // still needs a confident projection. Either way transplantGreen checks the
    // texture against the overview before painting. The outline mask is the WSR
    // outline (box-normalized) when known, else the fused capture outline.
    const img = stack();
    if (pb && (wt || (anchor?.r ?? 0) >= 0.45)) {
      const mask = wt ? wt.greenPoly.map(([x, y]) => [(x * W - pb.x0) / (pb.x1 - pb.x0), (y * H - pb.y0) / (pb.y1 - pb.y0)]) : g.poly ?? null;
      transplantGreen(hole, img, pb, mask, gtex);
    }
    else if (box) console.log(`H${hole}: green NOT transplanted into the overview — projection correlation only ${anchor?.r?.toFixed(2)} (the zoomed green view is unaffected)`);
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
// assembled shot rows (tools/assemble-shots.mjs) ride along for the app's
// auto-Log — importable ones only
try {
  const shots = JSON.parse(readFileSync(join(D, "shots.json"), "utf8"));
  derived.shots = shots.rows.filter((r) => r.importable).map(({ flags, importable, ...r }) => r);
  console.log(`attached ${derived.shots.length} importable shot rows`);
} catch { derived.shots = []; }

mkdirSync(join(ROOT, "public"), { recursive: true });
writeFileSync(join(ROOT, "public", "derived.json"), JSON.stringify(derived));
// which tee frames the pins and the online tee actually used (tools/frame-audit.mjs),
// and every pin observation with its outcome (tools/PINS.md)
writeFileSync(join(D, "tee-frames-used.json"), JSON.stringify(teeFramesUsed, null, 1));
writeFileSync(join(D, "pin-observations.json"), JSON.stringify(pinObservations, null, 1));
console.log(`wrote src/maps.js (${mapsFromRender} of 21 maps from the renders, ${(mapBytes / 1024).toFixed(0)} KB of JPEG), src/greens.js (${greensFromRender} of ${Object.keys(greenMeta).length} green views from the render crops, ${(greenBytes / 1024).toFixed(0)} KB), src/mapxform.js, public/derived.json`);
