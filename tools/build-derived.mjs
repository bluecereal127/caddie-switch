// Assemble the mapV5 swap artifacts from the extraction outputs:
//   src/maps.js       new base64-JPEG hole maps (median-stacked panels)
//   src/mapxform.js   old->new fractional transforms (for the one-time
//                     migration of stored positions) + new map px size
//   public/derived.json  per-hole scale, green box, quantized 9x9 slope
//                     grid (app convention: unit direction x magnitude
//                     1|2|3), pins in map-fractional coords
//   node tools/build-derived.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import { loadImage, savePng, px, onionInpaint } from "./lib/image.mjs";
import { panelRect, cropRect } from "./lib/panel.mjs";
import { flagCupMask, inCompass } from "./lib/greensurface.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = join(ROOT, "captures", "inbox");
const D = join(ROOT, "captures", "derived");
const mapsMeta = JSON.parse(readFileSync(join(D, "maps.json"), "utf8")).holes;
const register = JSON.parse(readFileSync(join(D, "register.json"), "utf8"));

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

const mapsJs = ["// AUTO-GENERATED by tools/build-derived.mjs from median-stacked captures.",
  "// 250x304 px panels; fractional coordinates as always.", "export const HOLE_MAPS = {"];
const greensJs = ["// AUTO-GENERATED by tools/build-derived.mjs from the zoomed green captures.",
  "// Each is the fused, flag-free putting surface in the green's OWN frame:",
  "// 256x256 covering exactly the green's bounding box, so (0,0)..(1,1) maps",
  "// straight onto derived.json's greenBox and the 9x9 slope grid.",
  "export const GREEN_VIEWS = {"];
const greenMeta = {};
// ---------------------------------------------------------------------------
// GREEN TRANSPLANT
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
      const sx = Math.round(b.x0 + ((gx + 0.5) / GT) * bw);
      const sy = Math.round(b.y0 + ((gy + 0.5) / GT) * bh);
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

function transplantGreen(hole, img, g, box, t) {
  if (!box || !t) return;
  const W = img.width, H = img.height;
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  if (bw < 4 || bh < 4) return;

  // Colour-match the texture to the overview's own green before painting.
  // The zoom captures are lit slightly differently from the overview, and
  // without this the transplant reads as a patch with a visible seam around
  // it. Compare means over the SAME pixels the transplant will cover, then
  // shift the texture by the difference.
  let mr = 0, mg = 0, mb = 0, tr = 0, tg = 0, tb = 0, mn = 0;
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const fu = (x - box.x0) / bw, fv = (y - box.y0) / bh;
    if (g.poly && !pointInPoly(fu, fv, g.poly)) continue;
    const di = (y * W + x) * 4;
    mr += img.data[di]; mg += img.data[di + 1]; mb += img.data[di + 2];
    const tu = Math.min(GT - 1, Math.floor(fu * GT)), tv = Math.min(GT - 1, Math.floor(fv * GT));
    const ti = (tv * GT + tu) * 4;
    tr += t.tex.data[ti]; tg += t.tex.data[ti + 1]; tb += t.tex.data[ti + 2];
    mn++;
  }
  const dR = mn ? (mr - tr) / mn : 0, dG = mn ? (mg - tg) / mn : 0, dB = mn ? (mb - tb) / mn : 0;
  // Average EVERY texel under each map pixel. Striding through the footprint
  // instead (an early version stepped by GT/bw) point-samples a periodic
  // pattern and aliases it: the green's grid checker beat against the stride
  // and came through as visible moire at a scale where the game itself shows
  // a smooth surface.
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const u0 = ((x - box.x0) / (bw + 1)) * GT, v0 = ((y - box.y0) / (bh + 1)) * GT;
    const u1 = ((x + 1 - box.x0) / (bw + 1)) * GT, v1 = ((y + 1 - box.y0) / (bh + 1)) * GT;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let v = Math.floor(v0); v < Math.min(GT, Math.ceil(v1)); v++)
      for (let u = Math.floor(u0); u < Math.min(GT, Math.ceil(u1)); u++) {
        const ti = (v * GT + u) * 4;
        r += t.tex.data[ti]; gg += t.tex.data[ti + 1]; b += t.tex.data[ti + 2]; n++;
      }
    if (!n) continue;
    // inside the green-local polygon only, so bunkers and fringe outside the
    // bbox corners keep the overview's own art
    const fu = (x - box.x0) / bw, fv = (y - box.y0) / bh;
    if (g.poly && !pointInPoly(fu, fv, g.poly)) continue;
    const edge = Math.min(x - box.x0, box.x1 - x, y - box.y0, box.y1 - y);
    const a = edge <= 0 ? 0.5 : 1;
    const di = (y * W + x) * 4;
    const cl = (v) => v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    img.data[di] = cl(a * (r / n + dR) + (1 - a) * img.data[di]);
    img.data[di + 1] = cl(a * (gg / n + dG) + (1 - a) * img.data[di + 1]);
    img.data[di + 2] = cl(a * (b / n + dB) + (1 - a) * img.data[di + 2]);
  }
  console.log(`H${hole}: green transplanted from ${t.sessions} zoom capture(s), ${(100 * t.covered).toFixed(0)}% of the surface seen unobstructed`);
}

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
  const img = loadImage(join(D, "maps", `${id}.png`));
  // projection correlates against the detection stack (flag/hole intact) —
  // the display art has the flag inpainted away, which starves the matcher
  // of its strongest dark landmark on pin-less holes
  let det = img;
  try { det = loadImage(join(D, "maps", `${id}.det.png`)); } catch {}
  const meta = mapsMeta.find((m) => m.hole === hole);
  const g = JSON.parse(readFileSync(join(D, "greens", `${id}.json`), "utf8"));

  // (the maps.js encode used to sit here; it now runs at the end of the loop,
  // after the green box is solved, so the green transplant can paint into the
  // image first)

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
  let greenBox = null, greenPoly = null, pins = [], pinZones = null, greenPins = 0;
  let box = null;
  if (anchor && anchor.r > 0.22) {
    const { k, session, ox, oy } = anchor;
    const W = img.width, H = img.height;
    const proj = (zx, zy) => ({ x: meta.pin.x + ox + (zx - session.pinPx.x) * k,
                                y: meta.pin.y + oy + (zy - session.pinPx.y) * k });
    // project the ANCHOR session's own bbox (its k belongs to its zoom level;
    // other sessions can sit at different zooms)
    const zb = session.bboxPx;
    const c0 = proj(zb.x0, zb.y0), c1 = proj(zb.x1, zb.y1);
    box = { x0: Math.max(0, Math.round(c0.x)), y0: Math.max(0, Math.round(c0.y)),
      x1: Math.min(W - 1, Math.round(c1.x)), y1: Math.min(H - 1, Math.round(c1.y)) };
    greenBox = { x0: +(box.x0 / W).toFixed(4), y0: +(box.y0 / H).toFixed(4),
      x1: +(box.x1 / W).toFixed(4), y1: +(box.y1 / H).toFixed(4) };
    // pins via bbox-normalized coords — zoom-invariant across sessions —
    // then CLUSTERED at the app's own 0.02 radius. Every pair that sees the
    // same flag reports it, so one spot captured six times used to ship as
    // six pins; the app deduped on merge but derived.json lied and the debug
    // overlay was unreadable. Averaging each cluster also sharpens the
    // estimate: more observations of a spot now means a better fix on it,
    // not more clutter.
    // the fused green outline, projected the same way (bbox-normalized ->
    // map fraction). A polygon, not a rectangle: greens are lobed, and the
    // fringe that wraps every green is a real boundary.
    if (g.poly) greenPoly = g.poly.map(([nx, ny]) => [
      +((box.x0 + nx * (box.x1 - box.x0)) / W).toFixed(4),
      +((box.y0 + ny * (box.y1 - box.y0)) / H).toFixed(4)]);
    const raw = g.pins.map((p) => ({
      x: (box.x0 + p.gx * (box.x1 - box.x0)) / W,
      y: (box.y0 + p.gy * (box.y1 - box.y0)) / H }));
    const clusters = [];
    for (const p of raw) {
      const c = clusters.find((q) => Math.hypot(q.x / q.n - p.x, q.y / q.n - p.y) < 0.02);
      if (c) { c.x += p.x; c.y += p.y; c.n++; } else clusters.push({ x: p.x, y: p.y, n: 1 });
    }
    pins = clusters.map((c) => ({ x: +(c.x / c.n).toFixed(4), y: +(c.y / c.n).toFixed(4), n: c.n }));

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
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    greenPins = g.pins.length;
    pinZones = Array.from({ length: zn }, (_, z) => {
      const mem = g.pins.filter((_, i) => lab[i] === z);
      const gx = mem.reduce((s, p) => s + p.gx, 0) / mem.length;
      const gy = mem.reduce((s, p) => s + p.gy, 0) / mem.length;
      // radius in green-local units, and the same in map fractions so the app
      // can draw it without knowing the green's bbox
      const rg = Math.max(...mem.map((p) => Math.hypot(p.gx - gx, p.gy - gy)));
      return {
        x: +((box.x0 + gx * bw) / W).toFixed(4),
        y: +((box.y0 + gy * bh) / H).toFixed(4),
        r: +(Math.max(rg * bw / W, rg * bh / H)).toFixed(4),
        rGreen: +rg.toFixed(3), n: mem.length,
      };
    }).sort((a, b) => b.n - a.n);
    // debug overlay
    const dbg = { width: W, height: H, data: Buffer.from(img.data) };
    const set = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; dbg.data[i] = 30; dbg.data[i + 1] = 120; dbg.data[i + 2] = 255; };
    for (let x = box.x0; x <= box.x1; x++) { set(x, box.y0); set(x, box.y1); }
    for (let y = box.y0; y <= box.y1; y++) { set(box.x0, y); set(box.x1, y); }
    for (const p of pins) { const bx = Math.round(p.x * W), by = Math.round(p.y * H);
      for (let d = -4; d <= 4; d++) { set(bx + d, by); set(bx, by + d); } }
    savePng(join(D, "boxes", `${id}.png`), dbg);
  }
  const zoomAspect = (g.panelBbox.x1 - g.panelBbox.x0) / (g.panelBbox.y1 - g.panelBbox.y0);
  const mapAspect = box ? (box.x1 - box.x0) / (box.y1 - box.y0) : null;
  derived.holes[hole] = { scale: meta.scaleYdPerPx, yards: meta.yards, greenBox, greenPoly,
    grid: quantizeGrid(g.grid), pins, pinZones, pinObservations: greenPins,
    greenView: greenMeta[hole] ?? null,
    tee: meta.tee ? { x: +(meta.tee.x / img.width).toFixed(4), y: +(meta.tee.y / img.height).toFixed(4) } : null };
  console.log(`H${hole}: k=${anchor?.k?.toFixed(2)} r=${anchor?.r?.toFixed(2)} box=${box ? `${box.x0},${box.y0}..${box.x1},${box.y1}` : "MISS"} aspect map=${mapAspect?.toFixed(2) ?? "-"} zoom=${zoomAspect.toFixed(2)} pins=${pins.length}`);

  // Rebuild the overview's green from the zoom captures, then encode. The
  // overview draws the green ~28px across; the zoom captures hold the same
  // surface 3-8x larger, and across pin positions they cover each other's
  // flag occlusions — so the green goes in clean and sharper than the
  // overview ever rendered it.
  // The fused, flag-free green surface. Built once and used twice: painted
  // into the overview when the projection is confident, and shipped whole as
  // the zoomed green view — which needs no projection at all, since it lives
  // in the green's own frame.
  const gtex = greenTexture(g);
  if (gtex) {
    const gj = jpeg.encode({ data: gtex.tex.data, width: GT, height: GT }, 86);
    greensJs.push(`  ${hole}: "data:image/jpeg;base64,${gj.data.toString("base64")}",`);
    const pb = g.panelBbox;
    greenMeta[hole] = {
      aspect: +((pb.x1 - pb.x0) / Math.max(1, pb.y1 - pb.y0)).toFixed(4),
      covered: +gtex.covered.toFixed(3), sessions: gtex.sessions,
    };
    // derived.holes[hole] was written just above, before the texture existed
    derived.holes[hole].greenView = greenMeta[hole];
  }
  // Transplant only when the projection is confident. A weak correlation
  // means the box may be a few pixels off, and painting a whole green into
  // the wrong place is far worse than leaving the overview's own art (which
  // is already cup-free).
  if (box && (anchor?.r ?? 0) >= 0.45) transplantGreen(hole, img, g, box, gtex);
  else if (box) console.log(`H${hole}: green NOT transplanted into the overview — projection correlation only ${anchor?.r?.toFixed(2)} (the zoomed green view is unaffected)`);
  const enc = jpeg.encode({ data: img.data, width: img.width, height: img.height }, 82);
  mapsJs.push(`  ${hole}: "data:image/jpeg;base64,${enc.data.toString("base64")}",`);
  savePng(join(D, "maps", `${id}.final.png`), img);
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
console.log("wrote src/maps.js, src/mapxform.js, public/derived.json");
