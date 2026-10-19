// Sample the minimap's drawing style from the captured hole maps, once, into
// tools/map-style.json, so render-maps.mjs can draw every hole from the WSR
// data (class rasters, registration, PMP trees, tee pad, green box) with no
// capture in the loop. Every number comes from the unedited captures
// (captures/derived/maps/hNN.det.png: the median-stacked minimap with its
// flag, avatar and wind dial still in; those are masked here) read through the
// mesh registration, so each class of the mesh is sampled where the game drew it.
//
//   node tools/map-style.mjs [--maps captures/derived/maps] [--out tools/map-style.json]
//        [--holes 7,16] [--debug <dir>]
//
// What it measures (the prototype's numbers are in the group-M notes; this is
// the same method over all 21 holes):
//   palette     median RGB per class, class eroded 2 px, median over holes.
//               Water comes in two styles: the dark "sea" (H7's coast) and the
//               light aqua inland "pond" (H1/H9/H11's hazards, H12's ponds).
//               Outer ground and water keep a per-hole colour when the hole's
//               differs from the shared median by more than PALETTE_KEEP: the
//               minimap is translucent over the 3-D world and H8's sea tints
//               its ground blue.
//   regions     what the minimap draws over the mesh's dead regions (nodata,
//               floor plane, zone, fall): "sea" | "pond" | "outer" by majority
//               of the pixels' nearest palette colour, "fill" (nearest live
//               class) when nothing wins REGION_MAJORITY of them. Likewise
//               `water` for each enclosed water component (sea or pond) and
//               `beyond` for the frame past the raster, as runs along each
//               raster side (H5's frame is sea past the top, ground past the
//               bottom, where the mesh's own edge says water).
//   stripes     the fairway's mown stripes: direction, period and phase from a
//               periodogram of the high-passed luma, the amplitude from the
//               sinusoid fit, and the amplitude ratio on green, fringe and tee pad.
//   dots        the screen-fixed backdrop dot lattice (period 10 px, centred
//               square): phase and the luma profile by distance from a dot.
//   rough       mottle statistics clear of the tree sprites.
//   sand        rim vs interior, and the up-left vs down-right inner edge.
//   shore       bank bands on the water side of every land/water edge, by
//               distance from land, per water style (and per hole, for cliffs).
//   canopy      radial colour ramps per tree kind (isolated on-course trees),
//               and the sprite radius of every isolated kind-2/3 tree (max luma
//               gradient along 36 rays) fitted as r = a*size + b KCL units.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadImage, savePng } from "./lib/image.mjs";
import { MAP_W as W, MAP_H as H, CLS, CLASS_NAME, LIVE, LAND, loadHole, fracToRaster, deadRegions, waterComponents, beyondSide, components, edt2, luma, median, medianRGB } from "./lib/minimap.mjs";

const args = process.argv.slice(2);
const opt = { maps: "captures/derived/maps", out: "tools/map-style.json", holes: null, debug: null };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--maps") opt.maps = args[++i];
  else if (a === "--out") opt.out = args[++i];
  else if (a === "--holes") opt.holes = args[++i].split(",").map(Number);
  else if (a === "--debug") opt.debug = args[++i];
}
const ROOT = process.cwd();
const HOLES = opt.holes ?? Array.from({ length: 21 }, (_, i) => i + 1);
if (opt.debug) mkdirSync(opt.debug, { recursive: true });

// build-derived's canopy radius rule (KCL units per unit of PMP size), the
// prior for finding each sprite's edge; the refit below replaces it.
const TREE_K0 = { 2: 81, 3: 48, 6: 45 };
const UNITS_PER_YD = 9.144;
// a hole keeps its own outer / water colour when it is this far (RGB distance) from the shared one
const PALETTE_KEEP = 20;
// a dead region takes a backdrop class when this share of its pixels is nearest that class
const REGION_MAJORITY = 0.65;
const DOT_PERIOD = 10;

const idx = (x, y) => y * W + x;

// ---- small raster helpers at map resolution ----
function erode(mask, iters) {
  let m = mask;
  for (let it = 0; it < iters; it++) {
    const o = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = idx(x, y);
      if (m[p] && m[p - 1] && m[p + 1] && m[p - W] && m[p + W]) o[p] = 1;
    }
    m = o;
  }
  return m;
}
function dilate(mask, iters) {
  let m = mask;
  for (let it = 0; it < iters; it++) {
    const o = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!m[idx(x, y)]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) o[idx(xx, yy)] = 1;
      }
    }
    m = o;
  }
  return m;
}
const and = (a, b) => a.map((v, i) => (v && b[i] ? 1 : 0));
const andNot = (a, b) => a.map((v, i) => (v && !b[i] ? 1 : 0));
const count = (m) => m.reduce((s, v) => s + v, 0);
// mean over a k x k window (clamped at the frame edge), via an integral image
function boxMean(f, k) {
  const r = k >> 1, I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += f[idx(x, y)]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1);
    const s = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
    out[idx(x, y)] = s / ((x1 - x0) * (y1 - y0));
  }
  return out;
}
const pixelsOf = (cap, mask) => { const out = []; for (let p = 0; p < W * H; p++) if (mask[p]) out.push([cap.data[p * 4], cap.data[p * 4 + 1], cap.data[p * 4 + 2]]); return out; };
const colorDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const r3 = (v) => (v == null ? null : Array.isArray(v) ? v.map(r3) : typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, u]) => [k, r3(u)])) : typeof v === "number" ? +v.toFixed(3) : v);

// ---- the capture, with everything that is not minimap art masked ----
// HUD colours never occur in the art: the flag's pink, the avatar's yellow
// star, the cyan aim line, the white pole / dial ring, the black cup.
function loadCapture(hole) {
  const cap = loadImage(join(ROOT, opt.maps, `h${hole.nn}.det.png`));
  if (cap.width !== W || cap.height !== H) throw new Error(`h${hole.nn}.det.png is ${cap.width}x${cap.height}, expected ${W}x${H}`);
  const hud = new Uint8Array(W * H), col = new Uint8Array(W * H);
  const wd = hole.reg.map.windDialMasked;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = idx(x, y), r = cap.data[p * 4], g = cap.data[p * 4 + 1], b = cap.data[p * 4 + 2];
    if (wd && x >= wd[1] && x <= wd[3] && y >= wd[2] && y <= wd[4]) hud[p] = 1;
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    if ((r > 180 && b > 100 && g < 140) || (r > 200 && g > 170 && b < 110) || (g > 150 && b > 150 && r < 120) || mn > 200 || mx < 40) col[p] = 1;
  }
  const d = dilate(col, 2);
  for (let p = 0; p < W * H; p++) if (d[p]) hud[p] = 1;
  const L = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) L[p] = luma(cap.data[p * 4], cap.data[p * 4 + 1], cap.data[p * 4 + 2]);
  const b9 = boxMean(L, 9), b7 = boxMean(L, 7);
  const hp9 = L.map((v, i) => v - b9[i]), hp7 = L.map((v, i) => v - b7[i]);
  return { cap, hud, L, hp9, hp7 };
}

// class, dead region and water component per map pixel (nearest raster
// pixel); beyond the raster the class is -1 and `beyond` says which raster
// side and edge index the pixel is past
function classGrid(hole) {
  const { label, regions } = deadRegions(hole.raster);
  const wc = waterComponents(hole.raster);
  const cls = new Int16Array(W * H).fill(-1), reg = new Int32Array(W * H).fill(-1), water = new Int32Array(W * H).fill(-1);
  const beyond = new Array(W * H).fill(null);
  const rw = hole.raster.w, rh = hole.raster.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [c, r] = fracToRaster(hole, (x + 0.5) / W, (y + 0.5) / H);
    const ci = Math.round(c), ri = Math.round(r), p = idx(x, y);
    if (ci < 0 || ri < 0 || ci >= rw || ri >= rh) { beyond[p] = beyondSide(hole.raster, c, r); continue; }
    const q = ri * rw + ci;
    cls[p] = hole.raster.cls[q]; reg[p] = label[q]; water[p] = wc.label[q];
  }
  return { cls, reg, regions, water, waterComps: wc.comps, beyond };
}
const maskOf = (cls, c) => { const m = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) if (cls[p] === c) m[p] = 1; return m; };

// Amplitude and phase of a sinusoid along direction theta (the stripe normal)
// with period P, fitted to values v at integer pixel positions:
// v ~ amp * cos(2 pi ((x cos t + y sin t) - phase) / P).
function sinFit(v, xs, ys, theta, P) {
  const c = Math.cos(theta), s = Math.sin(theta), w = (2 * Math.PI) / P;
  let a = 0, b = 0;
  for (let i = 0; i < v.length; i++) { const p = (xs[i] * c + ys[i] * s) * w; a += v[i] * Math.cos(p); b += v[i] * Math.sin(p); }
  const amp = (2 * Math.hypot(a, b)) / v.length;
  return { amp, phase: (((Math.atan2(b, a) / w) % P) + P) % P };
}
function samples(hp, mask) {
  const v = [], xs = [], ys = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[idx(x, y)]) { v.push(hp[idx(x, y)]); xs.push(x); ys.push(y); }
  return { v, xs, ys };
}
// Luma with each row's mean over the mask removed: the vertical stripe
// survives, the fairway's own shape (brighter than the rough it sits in, so a
// box high-pass leaves its outline as long-period power) does not.
function rowDemeaned(L, mask) {
  const v = [], xs = [], ys = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) if (mask[idx(x, y)]) row.push(x);
    if (row.length < 4) continue;
    const mean = row.reduce((s, x) => s + L[idx(x, y)], 0) / row.length;
    for (const x of row) { v.push(L[idx(x, y)] - mean); xs.push(x); ys.push(y); }
  }
  return { v, xs, ys };
}
// Periodogram of the stripe over period and direction, coarse then refined
// around the peak. Only near-vertical directions (0 = stripes vary along x)
// and periods of 2 px and up are searched: the stripes are vertical where
// the fairway runs straight (they follow the fairway's own direction where
// it bends: H20's S, H3's dogleg, which no single direction fits and the
// renderer draws vertical anyway), their period is per hole (2.3 px on H7,
// 3.0-3.2 on H10/H16/H19, 7 on H1/H2: neither a screen nor a world
// constant), and a period under 2 px is the alias of one above it on a
// 1-px capture (H7's 2.27 reads as 1.79 too), so the resolved side is kept.
const STRIPE_MIN_AMP = 3;
function stripeScan(L, mask) {
  const { v, xs, ys } = rowDemeaned(L, mask);
  let best = { amp: -1 };
  const tryAt = (deg, P) => { const f = sinFit(v, xs, ys, (deg * Math.PI) / 180, P); if (f.amp > best.amp) best = { amp: f.amp, phase: f.phase, deg, P }; };
  for (let deg = -6; deg <= 6.001; deg += 0.5) for (let P = 2.0; P <= 12.0001; P += 0.02) tryAt(deg, P);
  const c = { ...best };
  for (let deg = c.deg - 0.5; deg <= c.deg + 0.501; deg += 0.1) for (let P = c.P - 0.03; P <= c.P + 0.0301; P += 0.002) tryAt(deg, P);
  return { normalDeg: +best.deg.toFixed(2), periodPx: best.P, ampLuma: best.amp, phasePx: best.phase, n: v.length, resolved: best.amp >= STRIPE_MIN_AMP };
}
const std = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length); };

// bilinear luma at continuous pixel-centre coordinates (pixel (x,y) centred at x+0.5, y+0.5)
function lumaAt(L, x, y) {
  const fx = x - 0.5, fy = y - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const g = (xx, yy) => L[idx(Math.min(W - 1, Math.max(0, xx)), Math.min(H - 1, Math.max(0, yy)))];
  return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
}

// ======================= pass 1: per-hole measurements =======================
function sampleHole(hole) {
  const C = loadCapture(hole);
  const { cap, hud, L, hp9, hp7 } = C;
  const { cls, reg, regions, water, waterComps, beyond } = classGrid(hole);
  const rec = { hole: hole.n, meshId: hole.meshId, scale: hole.truth.scale, unitsPerMapPx: hole.unitsPerMapPx };
  const notHud = hud.map((v) => (v ? 0 : 1));
  const treesOn = hole.pins.trees.filter((t) => t.lie === "fairway" || t.lie === "rough");
  const R0 = (t) => (TREE_K0[t.kind] * t.size) / hole.unitsPerMapPx;
  // 1. palette per live class (eroded 2 px; 1 px, then none, for the small classes)
  const pal = {}, palN = {};
  for (const c of LIVE) {
    const m0 = and(maskOf(cls, c), notHud);
    let m = erode(m0, 2);
    if (count(m) < 30) m = erode(m0, 1);
    if (count(m) < 30) m = m0;
    const px = pixelsOf(cap, m);
    if (px.length >= 10) { pal[CLASS_NAME[c]] = medianRGB(px); palN[CLASS_NAME[c]] = px.length; }
  }
  rec.palette = pal; rec.paletteN = palN;
  rec.waterStyle = pal.water ? (luma(...pal.water) > 100 ? "pond" : "sea") : null;
  // 2. dead regions, enclosed water components and the frame beyond the
  //    raster (per raster side and edge index): their pixels, designated in
  //    pass 2 against the shared palette
  rec.regionPixels = {}; rec.waterPixels = {}; rec.beyondPixels = {};
  for (let p = 0; p < W * H; p++) {
    if (hud[p]) continue;
    const rgb = [cap.data[p * 4], cap.data[p * 4 + 1], cap.data[p * 4 + 2]];
    if (cls[p] < 0) {
      const b = beyond[p]; if (!b) continue;
      const key = `${b.side}:${b.index}`;
      (rec.beyondPixels[key] = rec.beyondPixels[key] || []).push(rgb);
      continue;
    }
    if (reg[p] >= 0) (rec.regionPixels[regions[reg[p]].key] = rec.regionPixels[regions[reg[p]].key] || []).push(rgb);
    else if (water[p] >= 0 && !waterComps[water[p]].border) (rec.waterPixels[waterComps[water[p]].key] = rec.waterPixels[waterComps[water[p]].key] || []).push(rgb);
  }
  // 3. fairway stripes
  const fw = erode(and(maskOf(cls, CLS.FAIRWAY), notHud), 2);
  const st = stripeScan(L, fw);
  st.hpStd = std(samples(hp9, fw).v);
  const th = (st.normalDeg * Math.PI) / 180;
  const bright = new Uint8Array(W * H), dark = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) if (fw[p]) { if (hp9[p] > 1) bright[p] = 1; else if (hp9[p] < -1) dark[p] = 1; }
  st.bright = medianRGB(pixelsOf(cap, bright)); st.dark = medianRGB(pixelsOf(cap, dark));
  // the same stripe on the other mown surfaces, and (as a control) the rough
  const ampOn = (m) => { if (count(m) < 20) return null; const s = rowDemeaned(L, m); if (s.v.length < 20) return null; const f = sinFit(s.v, s.xs, s.ys, th, st.periodPx); return { amp: f.amp, phase: f.phase, n: s.v.length }; };
  st.green = ampOn(erode(and(maskOf(cls, CLS.GREEN), notHud), 1));
  st.fringe = ampOn(and(maskOf(cls, CLS.FRINGE), notHud));
  st.rough = ampOn(erode(and(maskOf(cls, CLS.ROUGH), notHud), 2));
  // the tee pad: the fairway island under the WSR start
  const s0 = hole.pins.starts[0];
  const fwAll = maskOf(cls, CLS.FAIRWAY);
  const { label: fwLab } = components(fwAll, W, H);
  const padId = fwLab[idx(Math.min(W - 1, Math.floor(s0.x * W)), Math.min(H - 1, Math.floor(s0.y * H)))];
  const pad = new Uint8Array(W * H);
  if (padId >= 0) for (let p = 0; p < W * H; p++) if (fwLab[p] === padId) pad[p] = 1;
  const padIn = and(erode(pad, 1), notHud);
  st.teePad = ampOn(padIn);
  rec.teePad = { px: count(pad), inner: medianRGB(pixelsOf(cap, count(erode(pad, 2)) > 10 ? and(erode(pad, 2), notHud) : padIn)) };
  // the stripe in world terms: is it a fixed world period? (bright centre at map x = phase, through the registration)
  st.periodUnits = st.periodPx * hole.unitsPerMapPx;
  const M = hole.M;
  st.phaseUnits = ((M[0][0] * ((st.phasePx + 0.5) / W) + M[0][2]) % st.periodUnits + st.periodUnits) % st.periodUnits;
  rec.stripes = st;
  // 4. backdrop dot lattice: fold the 7-px high-pass over the 10x10 cell on the outer ground
  const om = erode(and(maskOf(cls, CLS.OUTER), notHud), 3);
  const fold = (m) => {
    const acc = new Float64Array(100), cnt = new Int32Array(100);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[idx(x, y)]) { acc[(y % 10) * 10 + (x % 10)] += hp7[idx(x, y)]; cnt[(y % 10) * 10 + (x % 10)]++; }
    return acc.map((v, i) => (cnt[i] ? v / cnt[i] : 0));
  };
  const dotMask = count(om) >= 500 ? om : erode(and(maskOf(cls, CLS.WATER), notHud), 3);
  if (count(dotMask) >= 500) {
    const f = fold(dotMask);
    let mi = 0; for (let i = 1; i < 100; i++) if (f[i] < f[mi]) mi = i;
    const iy = (mi / 10) | 0, ix = mi % 10;
    let ws = 0, cx = 0, cy = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const w = Math.max(0, -f[(((iy + dy) % 10) + 10) % 10 * 10 + (((ix + dx) % 10) + 10) % 10]); ws += w; cx += w * dx; cy += w * dy; }
    const dots = { x0: ix + 0.5 + cx / ws, y0: iy + 0.5 + cy / ws, depth: f[mi], on: count(om) >= 500 ? "outer" : "water", profile: {} };
    // luma profile by distance to the nearest lattice dot, 0.5-px bins
    const dist = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let best = 99;
      for (const [px, py] of [[dots.x0, dots.y0], [dots.x0 + 5, dots.y0 + 5]]) {
        const ddx = (((x + 0.5 - px) % 10) + 10) % 10, ddy = (((y + 0.5 - py) % 10) + 10) % 10;
        best = Math.min(best, Math.hypot(Math.min(ddx, 10 - ddx), Math.min(ddy, 10 - ddy)));
      }
      dist[idx(x, y)] = best;
    }
    rec.dotDist = dist;
    for (const [nm, c] of [["outer", CLS.OUTER], ["water", CLS.WATER]]) {
      const m = erode(and(maskOf(cls, c), notHud), 3);
      if (count(m) < 500) continue;
      const acc = new Float64Array(10), cnt = new Int32Array(10);
      for (let p = 0; p < W * H; p++) if (m[p]) { const b = Math.min(9, Math.floor(dist[p] * 2)); acc[b] += hp7[p]; cnt[b]++; }
      dots.profile[nm === "water" ? rec.waterStyle : nm] = Array.from(acc, (v, i) => (cnt[i] ? v / cnt[i] : 0));
    }
    rec.dots = dots;
  }
  // 5. rough mottle, clear of the tree sprites (1.4 R around every on-course tree)
  const treeM = new Uint8Array(W * H);
  for (const t of treesOn) {
    const R = 1.4 * R0(t) + 1, cx = t.x * W, cy = t.y * H;
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, Math.ceil(cy + R)); y++) for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, Math.ceil(cx + R)); x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < R) treeM[idx(x, y)] = 1;
  }
  const rm = andNot(erode(and(maskOf(cls, CLS.ROUGH), notHud), 3), treeM);
  if (count(rm) > 100) {
    const px = pixelsOf(cap, rm);
    const s = samples(hp9, rm);
    let num = 0, d1 = 0, d2 = 0, n1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) { const p = idx(x, y); if (rm[p] && rm[p + 1]) { num += hp9[p] * hp9[p + 1]; d1 += hp9[p] * hp9[p]; d2 += hp9[p + 1] * hp9[p + 1]; n1++; } }
    pal.rough = medianRGB(px); // the base colour clear of the sprites' dark rims
    rec.rough = { hpStd: std(s.v), rgbStd: [0, 1, 2].map((k) => std(px.map((q) => q[k]))), warmStd: std(px.map((q) => q[0] - q[1])), ac1: n1 ? num / Math.sqrt(d1 * d2) : null, n: px.length };
  }
  // 6. sand: 1-px rim vs interior, and which inner edge carries the shade
  const sm = maskOf(cls, CLS.SAND);
  if (count(sm) > 30) {
    const d2 = edt2(sm.map((v) => (v ? 0 : 1)), W, H); // distance from non-sand
    const edge = new Uint8Array(W * H), inner = new Uint8Array(W * H), ul = new Uint8Array(W * H), dr = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = idx(x, y); if (!sm[p] || hud[p]) continue;
      if (d2[p] <= 1) edge[p] = 1; if (d2[p] > 2.25) inner[p] = 1;
      if (!sm[p - W - 1]) ul[p] = 1; if (!sm[p + W + 1]) dr[p] = 1;
    }
    rec.sand = { edge: medianRGB(pixelsOf(cap, edge)), inner: medianRGB(pixelsOf(cap, inner)), upLeft: medianRGB(pixelsOf(cap, ul)), downRight: medianRGB(pixelsOf(cap, dr)), n: count(sm) };
  }
  // 7. tree sprites: the radius of every isolated on-course kind-2/3 tree, for
  //    the refit. The luma profile is averaged over 36 rays first (the sprite
  //    is round, the rough's mottle is not, so averaging cancels the mottle)
  //    and the edge is the steepest rise of that mean profile, searched from
  //    0.45 to 1.6 of the prior radius: a per-ray maximum with a wider window
  //    lands on mottle edges beyond the sprite and reads 0.5-1 px too big.
  rec.trees = [];
  for (const t of treesOn) {
    if (t.kind !== 2 && t.kind !== 3) continue;
    const r0 = R0(t), cx = t.x * W, cy = t.y * H;
    const near = treesOn.some((o) => o !== t && Math.hypot((o.x - t.x) * W, (o.y - t.y) * H) < r0 + R0(o) + 1.5);
    if (near) continue;
    const reach = 1.6 * r0 + 1;
    if (cx - reach < 0 || cy - reach < 0 || cx + reach > W || cy + reach > H) continue;
    let hudHit = false;
    for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach) && !hudHit; y++) for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) if (hud[idx(x, y)] && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < reach) { hudHit = true; break; }
    if (hudHit) continue;
    const rs = []; for (let r = 0.5; r <= reach; r += 0.1) rs.push(r);
    const prof = new Float64Array(rs.length), perRay = [];
    for (let k = 0; k < 36; k++) {
      const a = (k * Math.PI) / 18, one = [];
      for (let i = 0; i < rs.length; i++) { const v = lumaAt(L, cx + rs[i] * Math.cos(a), cy + rs[i] * Math.sin(a)); prof[i] += v / 36; one.push(v); }
      perRay.push(one);
    }
    const edgeOf = (p) => {
      let bi = -1, bg = 0;
      for (let i = Math.max(1, Math.round((0.45 * r0 - 0.5) / 0.1)); i < p.length - 1; i++) { const g = p[i + 1] - p[i - 1]; if (g > bg) { bg = g; bi = i; } }
      return bi > 0 ? rs[bi] : null;
    };
    const rPx = edgeOf(prof);
    if (rPx == null || rPx >= reach - 0.3) continue; // no rise inside the window: not a sprite edge
    const rays = perRay.map(edgeOf).filter((v) => v != null);
    rec.trees.push({ hole: hole.n, kind: t.kind, size: t.size, lie: t.lie, x: t.x, y: t.y, rPx: +rPx.toFixed(2), rUnits: +(rPx * hole.unitsPerMapPx).toFixed(1), r0Px: +r0.toFixed(2), raySpread: +std(rays).toFixed(2) });
  }
  rec._cap = C; rec._cls = cls; rec._reg = reg; rec._regions = regions; rec._water = water; rec._waterComps = waterComps; rec._treeM = treeM; rec._treesOn = treesOn;
  return rec;
}

// ======================= pass 2: shared palette, designations, shore =======================
const holes = {}, recs = [];
for (const n of HOLES) {
  const t0 = Date.now();
  const hole = loadHole(ROOT, n);
  holes[n] = hole;
  const rec = sampleHole(hole);
  recs.push(rec);
  console.log(`H${n} sampled in ${Date.now() - t0} ms: fairway ${rec.palette.fairway} rough ${rec.palette.rough} outer ${rec.palette.outer ?? "-"} water ${rec.palette.water ?? "-"} (${rec.waterStyle ?? "-"}) stripes ${rec.stripes.normalDeg}deg P=${rec.stripes.periodPx.toFixed(3)} amp=${rec.stripes.ampLuma.toFixed(1)} phase=${rec.stripes.phasePx.toFixed(2)} dots=${rec.dots ? `${rec.dots.x0.toFixed(2)},${rec.dots.y0.toFixed(2)} ${rec.dots.depth.toFixed(1)} on ${rec.dots.on}` : "-"} trees ${rec.trees.length}`);
}
const medOver = (list) => (list.length ? [0, 1, 2].map((k) => median(list.map((c) => c[k]))) : null);
const palette = {};
for (const nm of ["fairway", "rough", "sand", "green", "fringe", "outer"]) palette[nm] = medOver(recs.map((r) => r.palette[nm]).filter(Boolean));
palette.sea = medOver(recs.filter((r) => r.waterStyle === "sea").map((r) => r.palette.water));
palette.pond = medOver(recs.filter((r) => r.waterStyle === "pond").map((r) => r.palette.water));
const spread = {};
for (const nm of ["fairway", "rough", "sand", "green", "fringe", "outer"]) spread[nm] = Object.fromEntries(recs.filter((r) => r.palette[nm]).map((r) => [r.hole, +colorDist(r.palette[nm], palette[nm]).toFixed(1)]));
spread.water = Object.fromEntries(recs.filter((r) => r.palette.water).map((r) => [r.hole, +colorDist(r.palette.water, palette[r.waterStyle]).toFixed(1)]));

// designate every dead region by the majority nearest backdrop colour, each
// enclosed water component by its own colour, and the frame beyond the raster
// by runs along each raster side
const backdrop = { sea: palette.sea, pond: palette.pond, outer: palette.outer };
const vote = (px) => {
  const votes = { sea: 0, pond: 0, outer: 0, land: 0 };
  for (const p of px) {
    let best = "land", bd = 1e9;
    for (const [nm, c] of Object.entries({ ...backdrop, fairway: palette.fairway, rough: palette.rough, sand: palette.sand })) { if (!c) continue; const d = colorDist(p, c); if (d < bd) { bd = d; best = nm in backdrop ? nm : "land"; } }
    votes[best]++;
  }
  const win = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
  return { votes, win };
};
// beyond-raster runs: majority per window of this many raster px along a side, windows needing this many capture px
const BEYOND_WINDOW = 16, BEYOND_MIN = 12;
for (const rec of recs) {
  rec.regions = {}; rec.regionVotes = {};
  for (const [key, px] of Object.entries(rec.regionPixels)) {
    if (px.length < 40) continue;
    const { votes, win } = vote(px);
    rec.regionVotes[key] = { n: px.length, median: medianRGB(px), ...votes };
    rec.regions[key] = win !== "land" && votes[win] >= REGION_MAJORITY * px.length ? win : "fill";
  }
  rec.water = {};
  for (const [key, px] of Object.entries(rec.waterPixels)) {
    if (px.length < 40) continue;
    const m = medianRGB(px);
    rec.water[key] = luma(...m) > 100 ? "pond" : "sea";
  }
  // Beyond the raster only sea or outer ground can be drawn, and sea only on
  // a hole that has sea somewhere (the 3-D sky through the translucent
  // minimap reads as sea at H1's top-left corner, and H1's only water is a
  // pond). A run shorter than BEYOND_MIN_RUN windows is noise: it joins its
  // neighbours when they agree, else it goes.
  const hasSea = rec.waterStyle === "sea" || Object.values(rec.regions).includes("sea") || Object.values(rec.water).includes("sea");
  const BEYOND_MIN_RUN = 3;
  const sides = { left: {}, right: {}, top: {}, bottom: {} }, all = [];
  for (const [key, px] of Object.entries(rec.beyondPixels)) {
    const [side, i] = key.split(":"), win = Math.floor(+i / BEYOND_WINDOW);
    (sides[side][win] = sides[side][win] || []).push(...px);
    all.push(...px);
  }
  rec.beyond = {};
  for (const side of Object.keys(sides)) {
    let runs = [];
    for (const win of Object.keys(sides[side]).map(Number).sort((a, b) => a - b)) {
      const px = sides[side][win];
      if (px.length < BEYOND_MIN) continue;
      const { votes, win: cls } = vote(px);
      if ((cls !== "sea" && cls !== "outer") || votes[cls] < 0.5 * px.length || (cls === "sea" && !hasSea)) continue;
      const i0 = win * BEYOND_WINDOW, i1 = i0 + BEYOND_WINDOW, last = runs[runs.length - 1];
      if (last && last[1] === i0 && last[2] === cls) last[1] = i1; else runs.push([i0, i1, cls]);
    }
    for (let k = 0; k < runs.length; k++) {
      if (runs[k][1] - runs[k][0] >= BEYOND_MIN_RUN * BEYOND_WINDOW) continue;
      const prev = runs[k - 1], next = runs[k + 1];
      if (prev && next && prev[2] === next[2] && prev[1] === runs[k][0] && runs[k][1] === next[0]) { prev[1] = next[1]; runs.splice(k, 2); k -= 2; }
      else { runs.splice(k, 1); k--; }
    }
    if (runs.length) rec.beyond[side] = runs;
  }
  if (all.length >= 40) { const { votes, win } = vote(all); rec.beyondDefault = win === "sea" && hasSea ? "sea" : "outer"; rec.beyondVotes = { n: all.length, ...votes }; }
  delete rec.regionPixels; delete rec.waterPixels; delete rec.beyondPixels;
}

// shore bands, per water style: water side by distance from land (median and the
// dark third of each band: the band's median mixes bank with antialiased water),
// and the land side by distance from water. Kept per hole: the bank's width
// varies (H7's coast is brown for 3 px, H17's cliff rims and H8's for 6+).
const SHORE_BANDS = 8;
for (const rec of recs) {
  const hole = holes[rec.hole], { cap, hud } = rec._cap, cls = rec._cls, reg = rec._reg, regions = rec._regions, water = rec._water, waterComps = rec._waterComps;
  // land here excludes sand: a beach meets the water with no bank (the renderer draws none there either)
  const styleAt = (p) => {
    const c = cls[p];
    if (c === CLS.WATER) { const wc = water[p] >= 0 ? waterComps[water[p]] : null; return (wc && !wc.border && rec.water[wc.key]) || rec.waterStyle; }
    if (c === CLS.SAND) return null;
    if (c < 0 || reg[p] < 0) return LAND.has(c) ? "land" : null;
    const d = rec.regions[regions[reg[p]].key];
    return d === "sea" || d === "pond" ? d : d === "outer" ? "land" : null;
  };
  const land = new Uint8Array(W * H), wet = { sea: new Uint8Array(W * H), pond: new Uint8Array(W * H) };
  for (let p = 0; p < W * H; p++) { const s = styleAt(p); if (s === "land") land[p] = 1; else if (s) wet[s][p] = 1; }
  rec.shore = {};
  const dLand = edt2(land, W, H);
  for (const style of ["sea", "pond"]) {
    if (count(wet[style]) < 400) continue; // H12's 108-px water patch has no bank to measure
    const dWet = edt2(wet[style], W, H);
    const bands = [], darkBands = [], landBands = [];
    for (let a = 0; a < SHORE_BANDS; a++) {
      const m = new Uint8Array(W * H);
      for (let p = 0; p < W * H; p++) if (wet[style][p] && !hud[p] && dLand[p] > a * a && dLand[p] <= (a + 1) * (a + 1)) m[p] = 1;
      const px = pixelsOf(cap, m);
      bands.push(medianRGB(px));
      const lv = px.map((q) => luma(...q)).sort((u, v) => u - v), cut = lv[Math.floor(lv.length * 0.3)] ?? 0;
      darkBands.push(medianRGB(px.filter((q) => luma(...q) <= cut)));
    }
    for (let a = 0; a < 3; a++) {
      const m = new Uint8Array(W * H);
      for (let p = 0; p < W * H; p++) if (land[p] && !hud[p] && dWet[p] > a * a && dWet[p] <= (a + 1) * (a + 1)) m[p] = 1;
      landBands.push(medianRGB(pixelsOf(cap, m)));
    }
    rec.shore[style] = { water: bands, waterDark: darkBands, draw: bands.map((c, i) => (c && darkBands[i] ? c.map((v, k) => (v + darkBands[i][k]) / 2) : c)), land: landBands, n: count(wet[style]) };
  }
}

// ======================= canopy radius refit and ramps =======================
const trees = recs.flatMap((r) => r.trees);
const fitLine = (pts) => { // least squares y = a x + b, with R^2
  const n = pts.length; if (n < 3) return null;
  const sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0), sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0), syy = pts.reduce((s, p) => s + p[1] * p[1], 0);
  const a = (n * sxy - sx * sy) / (n * sxx - sx * sx), b = (sy - a * sx) / n;
  const ssTot = syy - (sy * sy) / n, ssRes = pts.reduce((s, p) => s + (p[1] - a * p[0] - b) ** 2, 0);
  return { a, b, r2: 1 - ssRes / ssTot, n };
};
// Three models of the sprite radius, each fitted after dropping the trees
// more than OUTLIER_PX off the previous round's fit (a neighbouring bunker or
// fairway edge inside the window reads as the sprite's edge):
//   origin   r = K * size                  (build-derived's rule)
//   units    r = a * size + b              KCL units: a sprite with a fixed part in the world
//   screen   r_px = a * size / upp + c     a fixed part on screen (an outline, antialiasing)
const OUTLIER_PX = 1.5;
const canopyRadius = { trees, fit: {} };
const upp = (t) => holes[t.hole].unitsPerMapPx;
for (const kind of [2, 3]) {
  let ts = trees.filter((t) => t.kind === kind);
  if (ts.length < 3) continue;
  const all = ts.length;
  let unitsFit;
  for (let round = 0; round < 3; round++) {
    unitsFit = fitLine(ts.map((t) => [t.size, t.rUnits]));
    const keep = ts.filter((t) => Math.abs((t.rUnits - unitsFit.a * t.size - unitsFit.b) / upp(t)) <= OUTLIER_PX);
    if (keep.length === ts.length) break;
    ts = keep;
  }
  for (const t of trees) if (t.kind === kind) t.outlier = !ts.includes(t);
  const K = ts.reduce((s, t) => s + t.rUnits * t.size, 0) / ts.reduce((s, t) => s + t.size * t.size, 0);
  const rmsPx = (f) => Math.sqrt(ts.reduce((s, t) => s + (f(t) - t.rPx) ** 2, 0) / ts.length);
  const pxFit = fitLine(ts.map((t) => [t.size / upp(t), t.rPx]));
  canopyRadius.fit[kind] = {
    n: ts.length, dropped: all - ts.length, holes: [...new Set(ts.map((t) => t.hole))].length, sizes: [Math.min(...ts.map((t) => t.size)), Math.max(...ts.map((t) => t.size))],
    origin: { K: +K.toFixed(2), rmsPx: +rmsPx((t) => (K * t.size) / upp(t)).toFixed(3) },
    units: { a: +unitsFit.a.toFixed(2), b: +unitsFit.b.toFixed(2), r2: +unitsFit.r2.toFixed(4), rmsPx: +rmsPx((t) => (unitsFit.a * t.size + unitsFit.b) / upp(t)).toFixed(3) },
    screen: { a: +pxFit.a.toFixed(2), cPx: +pxFit.b.toFixed(3), r2: +pxFit.r2.toFixed(4), rmsPx: +rmsPx((t) => (pxFit.a * t.size) / upp(t) + pxFit.b).toFixed(3) },
    prior: { K: TREE_K0[kind], rmsPx: +rmsPx((t) => (TREE_K0[kind] * t.size) / upp(t)).toFixed(3), meanResidualPx: +(ts.reduce((s, t) => s + t.rPx - (TREE_K0[kind] * t.size) / upp(t), 0) / ts.length).toFixed(3) },
  };
}
// The radius rule the renderer draws with: r = a * size + b KCL units (+ c px).
// The intercept model only earns its keep when it beats the through-origin
// fit by a clear margin; otherwise the simpler rule stands.
const radiusRule = {};
for (const kind of [2, 3, 6]) {
  const f = canopyRadius.fit[kind];
  if (!f) { radiusRule[kind] = { a: TREE_K0[kind], b: 0, c: 0 }; continue; }
  const gain = (f.origin.rmsPx - f.units.rmsPx) / f.origin.rmsPx;
  radiusRule[kind] = gain > 0.1 ? { a: f.units.a, b: f.units.b, c: 0 } : { a: f.origin.K, b: 0, c: 0 };
}
const treeRadiusPx = (t, hole) => (radiusRule[t.kind].a * t.size + radiusRule[t.kind].b) / hole.unitsPerMapPx + radiusRule[t.kind].c;
// radial colour ramps per kind with the refit radius, pooled over every isolated on-course tree
const ramps = {};
for (const kind of [2, 3, 6]) {
  const bins = Array.from({ length: 13 }, () => []);
  let used = 0;
  for (const rec of recs) {
    const hole = holes[rec.hole], { cap, hud } = rec._cap;
    for (const t of rec._treesOn) {
      if (t.kind !== kind) continue;
      const R = treeRadiusPx(t, hole), cx = t.x * W, cy = t.y * H;
      if (rec._treesOn.some((o) => o !== t && Math.hypot((o.x - t.x) * W, (o.y - t.y) * H) < R + treeRadiusPx(o, hole) + 1.5)) continue;
      const cxi = Math.min(W - 1, Math.floor(cx)), cyi = Math.min(H - 1, Math.floor(cy));
      if (hud[idx(cxi, cyi)]) continue;
      used++;
      for (let y = Math.max(0, Math.floor(cy - 1.3 * R - 1)); y <= Math.min(H - 1, Math.ceil(cy + 1.3 * R + 1)); y++) for (let x = Math.max(0, Math.floor(cx - 1.3 * R - 1)); x <= Math.min(W - 1, Math.ceil(cx + 1.3 * R + 1)); x++) {
        const p = idx(x, y); if (hud[p]) continue;
        const b = Math.floor((Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R) * 10);
        if (b < 13) bins[b].push([cap.data[p * 4], cap.data[p * 4 + 1], cap.data[p * 4 + 2]]);
      }
    }
  }
  if (!used) continue;
  ramps[kind] = { n: used, ramp: bins.map((b) => medianRGB(b)) };
  if (kind === 6) { // fronds are thin: the dark quartile inside 0.9 R is the frond, the light one the pale fill
    const px = bins.slice(0, 9).flat(), lv = px.map((q) => luma(...q)).sort((u, v) => u - v);
    const q1 = lv[Math.floor(lv.length * 0.25)], q3 = lv[Math.floor(lv.length * 0.75)];
    ramps[kind].frond = medianRGB(px.filter((q) => luma(...q) <= q1));
    ramps[kind].light = medianRGB(px.filter((q) => luma(...q) >= q3));
    ramps[kind].heart = ramps[kind].ramp[0];
  }
}

// ======================= aggregate and write =======================
const stripesAll = recs.map((r) => r.stripes).filter((s) => s.resolved);
const ratio = (key) => median(stripesAll.filter((s) => s[key] && s[key].n >= 40).map((s) => s[key].amp / s.ampLuma));
const dotsAll = recs.filter((r) => r.dots).map((r) => r.dots);
const dotProfile = (style) => { const ps = dotsAll.map((d) => d.profile[style]).filter(Boolean); return ps.length ? Array.from({ length: 10 }, (_, i) => median(ps.map((p) => p[i]))) : null; };
const shoreAgg = (style) => {
  const ss = recs.map((r) => r.shore[style]).filter(Boolean);
  if (!ss.length) return null;
  const agg = (key, len) => Array.from({ length: len }, (_, i) => medOver(ss.map((s) => s[key][i]).filter(Boolean)));
  const water = agg("water", SHORE_BANDS), dark = agg("waterDark", SHORE_BANDS);
  return { holes: recs.filter((r) => r.shore[style]).map((r) => r.hole), water, waterDark: dark, draw: water.map((c, i) => c.map((v, k) => (v + dark[i][k]) / 2)), land: agg("land", 3) };
};
// The dot lattice is one centred-square lattice on every hole: (x0, y0) and
// (x0 + 5, y0 + 5) name the same lattice, so each hole's phase is folded onto
// the representative with x0 < 5 before taking the median; holes whose
// backdrop barely shows the dots (|depth| < 3 luma: H12/13/17/18's translucent
// ground) are left out of the median.
const dotPhase = (d) => (d.x0 >= 5 ? { x0: d.x0 - 5, y0: (((d.y0 - 5) % 10) + 10) % 10 } : { x0: d.x0, y0: d.y0 });
const dotsStrong = dotsAll.filter((d) => Math.abs(d.depth) >= 3).map(dotPhase);
const out = {
  _note: "Minimap drawing style sampled by tools/map-style.mjs from captures/derived/maps/hNN.det.png through tools/mesh-registration.json; render-maps.mjs draws every hole from the WSR data with these numbers and no capture. Colours are RGB 0-255; lengths are map px of the 250x304 panel unless named otherwise.",
  generated: new Date().toISOString().slice(0, 10),
  holesSampled: HOLES,
  palette: Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, r3(v)])),
  paletteSpread: spread,
  stripes: {
    normalDeg: median(stripesAll.map((s) => s.normalDeg)),
    periodPx: r3(median(stripesAll.map((s) => s.periodPx))),
    periodUnits: r3(median(stripesAll.map((s) => s.periodUnits))),
    ampLuma: r3(median(stripesAll.map((s) => s.ampLuma))),
    // per-channel share of the luma amplitude, from H16's bright/dark stripe colours (15,16,11) at 16.3 luma
    chan: [0.92, 0.98, 0.67],
    factors: { green: r3(ratio("green")), fringe: r3(ratio("fringe")), teePad: r3(ratio("teePad")), rough: r3(ratio("rough")) },
  },
  dots: { period: DOT_PERIOD, x0: r3(median(dotsStrong.map((d) => d.x0))), y0: r3(median(dotsStrong.map((d) => d.y0))), holes: dotsStrong.length, profile: { outer: r3(dotProfile("outer")), sea: r3(dotProfile("sea")), pond: r3(dotProfile("pond")) } },
  rough: (() => { const rs = recs.filter((r) => r.rough).map((r) => r.rough); return { hpStd: r3(median(rs.map((r) => r.hpStd))), warmStd: r3(median(rs.map((r) => r.warmStd))), ac1: r3(median(rs.map((r) => r.ac1).filter((v) => v != null))), sigmaPx: 0.9, warmSigmaPx: 1.5, warm: [5, 0, -3] }; })(),
  sand: (() => { const ss = recs.filter((r) => r.sand).map((r) => r.sand); return { edge: r3(medOver(ss.map((s) => s.edge).filter(Boolean))), inner: r3(medOver(ss.map((s) => s.inner).filter(Boolean))), upLeft: r3(medOver(ss.map((s) => s.upLeft).filter(Boolean))), downRight: r3(medOver(ss.map((s) => s.downRight).filter(Boolean))) }; })(),
  shore: { sea: r3(shoreAgg("sea")), pond: r3(shoreAgg("pond")) },
  canopy: Object.fromEntries(Object.entries(ramps).map(([k, v]) => [k, r3(v)])),
  canopyRadius: { ...canopyRadius, rule: radiusRule, prior: TREE_K0 },
  holes: {},
};
for (const rec of recs) {
  const h = {
    meshId: rec.meshId, waterStyle: rec.waterStyle, palette: {}, regions: rec.regions, regionVotes: rec.regionVotes, water: rec.water, beyond: rec.beyond, beyondDefault: rec.beyondDefault ?? null, beyondVotes: rec.beyondVotes ?? null,
    stripes: { resolved: rec.stripes.resolved, normalDeg: rec.stripes.normalDeg, periodPx: r3(rec.stripes.periodPx), phasePx: r3(rec.stripes.phasePx), ampLuma: r3(rec.stripes.ampLuma), hpStd: r3(rec.stripes.hpStd), periodUnits: r3(rec.stripes.periodUnits), phaseUnits: r3(rec.stripes.phaseUnits), green: r3(rec.stripes.green?.amp), fringe: r3(rec.stripes.fringe?.amp), teePad: r3(rec.stripes.teePad?.amp), rough: r3(rec.stripes.rough?.amp) },
    teePad: r3(rec.teePad),
    dots: rec.dots ? { ...r3(dotPhase(rec.dots)), depth: r3(rec.dots.depth), on: rec.dots.on } : null,
    rough: r3(rec.rough ?? null), sand: r3(rec.sand ?? null), shore: r3(rec.shore),
    sampled: r3(rec.palette),
  };
  if (rec.palette.outer && colorDist(rec.palette.outer, palette.outer) > PALETTE_KEEP) h.palette.outer = r3(rec.palette.outer);
  if (rec.palette.water && colorDist(rec.palette.water, palette[rec.waterStyle]) > PALETTE_KEEP) h.palette.water = r3(rec.palette.water);
  out.holes[rec.hole] = h;
}
if (!opt.holes) writeFileSync(join(ROOT, opt.out), JSON.stringify(out, null, 1) + "\n");
else console.log("(--holes given: not writing " + opt.out + ")");
// --debug: the capture at 4x with every measured tree ringed (yellow = measured
// radius, white = the rule's, red = dropped as an outlier) and the dead
// regions' designations lettered, for eyeballing the sampling
if (opt.debug) {
  const S = 4;
  for (const rec of recs) {
    const { cap } = rec._cap, hole = holes[rec.hole];
    const img = { width: W * S, height: H * S, data: Buffer.alloc(W * H * S * S * 4) };
    for (let y = 0; y < H * S; y++) for (let x = 0; x < W * S; x++) { const s = (((y / S) | 0) * W + ((x / S) | 0)) * 4, d = (y * W * S + x) * 4; img.data[d] = cap.data[s]; img.data[d + 1] = cap.data[s + 1]; img.data[d + 2] = cap.data[s + 2]; img.data[d + 3] = 255; }
    const ring = (cx, cy, r, col) => { for (let a = 0; a < 360; a += 1) { const x = Math.round(cx * S + r * S * Math.cos((a * Math.PI) / 180)), y = Math.round(cy * S + r * S * Math.sin((a * Math.PI) / 180)); if (x < 0 || y < 0 || x >= W * S || y >= H * S) continue; const d = (y * W * S + x) * 4; img.data[d] = col[0]; img.data[d + 1] = col[1]; img.data[d + 2] = col[2]; } };
    for (const t of rec.trees) { ring(t.x * W, t.y * H, t.rPx, t.outlier ? [255, 40, 40] : [255, 255, 0]); ring(t.x * W, t.y * H, treeRadiusPx(t, hole), [255, 255, 255]); }
    savePng(join(opt.debug, `style-h${hole.nn}.png`), img);
  }
}
console.log(JSON.stringify({ palette: out.palette, stripes: out.stripes, dots: out.dots, rough: out.rough, sand: out.sand, canopyRadius: { fit: out.canopyRadius.fit, rule: out.canopyRadius.rule } }, null, 1));
console.log("regions: " + recs.map((r) => `H${r.hole} ${JSON.stringify(r.regions)} water ${JSON.stringify(r.water)} beyond ${JSON.stringify(r.beyond)} default ${r.beyondDefault}`).join("\n         "));
console.log("per-hole palette kept: " + Object.entries(out.holes).filter(([, h]) => Object.keys(h.palette).length).map(([n, h]) => `H${n} ${JSON.stringify(h.palette)}`).join("; "));
