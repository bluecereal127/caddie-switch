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
import { loadImage, savePng, px } from "./lib/image.mjs";
import { panelRect, cropRect } from "./lib/panel.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
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
const xform = {};
const derived = { version: 1, mapW: 250, mapH: 304, holes: {} };
mkdirSync(join(D, "boxes"), { recursive: true });

for (let hole = 1; hole <= 21; hole++) {
  const id = `h${String(hole).padStart(2, "0")}`;
  const img = loadImage(join(D, "maps", `${id}.png`));
  const meta = mapsMeta.find((m) => m.hole === hole);
  const g = JSON.parse(readFileSync(join(D, "greens", `${id}.json`), "utf8"));

  // maps.js entry
  const enc = jpeg.encode({ data: img.data, width: img.width, height: img.height }, 82);
  mapsJs.push(`  ${hole}: "data:image/jpeg;base64,${enc.data.toString("base64")}",`);

  // migration transform (fractional)
  const r = register[hole];
  xform[hole] = { ax: r.fx.a, bx: r.fx.b, ay: r.fy.a, by: r.fy.b };

  // green box on map: pin-anchored projection of the zoom bbox; when the pin
  // moved between sessions, the session whose pin matches the map's pin wins
  // the correlation.
  const INBOX = join(ROOT, "captures", "inbox");
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
    const pr = projectGreenBox(img, zoom, meta.pin, s.pinPx, s.bboxPx, kLo, kHi);
    if (!anchor || pr.r > anchor.r) anchor = { ...pr, session: s };
  }
  let greenBox = null, pins = [];
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
    // pins via bbox-normalized coords — zoom-invariant across sessions
    pins = g.pins.map((p) => ({
      x: +((box.x0 + p.gx * (box.x1 - box.x0)) / W).toFixed(4),
      y: +((box.y0 + p.gy * (box.y1 - box.y0)) / H).toFixed(4) }));
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
  derived.holes[hole] = { scale: meta.scaleYdPerPx, yards: meta.yards, greenBox,
    grid: quantizeGrid(g.grid), pins,
    tee: meta.tee ? { x: +(meta.tee.x / img.width).toFixed(4), y: +(meta.tee.y / img.height).toFixed(4) } : null };
  console.log(`H${hole}: k=${anchor?.k?.toFixed(2)} r=${anchor?.r?.toFixed(2)} box=${box ? `${box.x0},${box.y0}..${box.x1},${box.y1}` : "MISS"} aspect map=${mapAspect?.toFixed(2) ?? "-"} zoom=${zoomAspect.toFixed(2)} pins=${pins.length}`);
}
mapsJs.push("};", "");
writeFileSync(join(ROOT, "src", "maps.js"), mapsJs.join("\n"));
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
