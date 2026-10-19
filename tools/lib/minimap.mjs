// The hole-map frame, shared by map-style.mjs (samples the minimap's style from
// the captures) and render-maps.mjs (renders the maps from the WSR data): the
// per-hole inputs, the map-fraction -> mesh -> class-raster mapping, the
// bookkeeping of the raster's "dead" regions, and the small raster operations
// both tools need (components, distance transform, blur, seeded noise).
//
// Coordinates: map fractions (0-1 of the 250x304 panel) go through
// mesh-registration.json's mapFracToMesh to mesh units, then through the
// heightmap sidecar's raster origin / unitsPerPixel to a raster pixel. Raster
// pixel (col,row) has its centre at continuous (col, row) here, so bilinear
// lookups need no half-pixel shuffling.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadImage } from "./image.mjs";

export const MAP_W = 250, MAP_H = 304;
export const UNITS_PER_YD = 9.144;

// KCL surface classes as mesh-heightmap.mjs writes them (tools/lib/obj.mjs
// KCL_GOLF), plus 8 = pond: water drawn in the light inland-pond style rather
// than the dark sea style (the renderer's own code, never in a raster).
export const CLS = { NODATA: 0, FAIRWAY: 1, ROUGH: 2, SAND: 3, OUTER: 4, FLOOR: 5, GREEN: 6, WATER: 7, POND: 8, FRINGE: 9, ZONE: 14, FALL: 16 };
export const CLASS_NAME = { 0: "nodata", 1: "fairway", 2: "rough", 3: "sand", 4: "outer", 5: "floor", 6: "green", 7: "water", 8: "pond", 9: "fringe", 14: "zone", 16: "fall" };
// Surfaces the mesh really has. The rest is dead: nodata beyond or inside the
// mesh, the floor plane under water and OB (F0805), H1's special zone, H14's
// fall boundary. What the minimap draws there is a per-hole style fact
// (map-style.json `holes[n].regions`), not a mesh fact.
export const LIVE = new Set([1, 2, 3, 4, 6, 7, 9]);
export const LAND = new Set([1, 2, 3, 4, 6, 9]);
export const WET = new Set([7, 8]);

const jsonCache = new Map();
export function readJson(path) {
  if (!jsonCache.has(path)) jsonCache.set(path, JSON.parse(readFileSync(path, "utf8")));
  return jsonCache.get(path);
}

// Everything about one hole that both tools read. `root` is the repo root.
export function loadHole(root, n, opt = {}) {
  const nn = String(n).padStart(2, "0");
  const heightmaps = opt.heightmaps ?? "captures/meshes/heightmaps-res4";
  const reg = readJson(join(root, opt.registration ?? "tools/mesh-registration.json")).holes[n];
  const side = readJson(join(root, heightmaps, `hole-${nn}.json`));
  const img = loadImage(join(root, heightmaps, `hole-${nn}_classes.png`));
  const w = img.width, h = img.height, cls = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) cls[i] = img.data[i * 4]; // 8-bit grey, the class id is the value
  const r = side.raster;
  return {
    n, nn, meshId: side.meshId, reg, side,
    raster: { w, h, cls, originX: r.originX, originZ: r.originZ, upp: r.unitsPerPixel },
    M: reg.mapFracToMesh,
    unitsPerMapPx: reg.transform.unitsPerMapPx,
    pins: readJson(join(root, opt.pins ?? "tools/wsr-pins.json")).holes[n],
    truth: readJson(join(root, opt.truth ?? "tools/wsr-truth.json")).holes[n],
  };
}

// Map fraction -> continuous raster pixel coordinates (pixel centres at integers).
export function fracToRaster(hole, fx, fy) {
  const M = hole.M, r = hole.raster;
  const x = M[0][0] * fx + M[0][1] * fy + M[0][2], z = M[1][0] * fx + M[1][1] * fy + M[1][2];
  return [(x - r.originX) / r.upp - 0.5, (z - r.originZ) / r.upp - 0.5];
}

// Class under a map pixel (nearest raster pixel); -1 beyond the raster.
export function classAtMapPx(hole, x, y) {
  const [c, r] = fracToRaster(hole, (x + 0.5) / MAP_W, (y + 0.5) / MAP_H);
  const ci = Math.round(c), ri = Math.round(r);
  if (ci < 0 || ri < 0 || ci >= hole.raster.w || ri >= hole.raster.h) return -1;
  return hole.raster.cls[ri * hole.raster.w + ci];
}

// For a point beyond the raster: which raster side it is past (the one it
// overshoots most) and the index along that side of its nearest edge pixel.
// What the minimap draws beyond the mesh is recorded per side as runs of
// these indices (map-style.json `holes[n].beyond`).
export function beyondSide(raster, c, r) {
  const over = [c < 0 ? -c : 0, c > raster.w - 1 ? c - (raster.w - 1) : 0, r < 0 ? -r : 0, r > raster.h - 1 ? r - (raster.h - 1) : 0];
  let k = 0;
  for (let i = 1; i < 4; i++) if (over[i] > over[k]) k = i;
  if (over[k] <= 0) return null;
  const side = ["left", "right", "top", "bottom"][k];
  const idx = k < 2 ? Math.min(raster.h - 1, Math.max(0, Math.round(r))) : Math.min(raster.w - 1, Math.max(0, Math.round(c)));
  return { side, index: idx };
}
export function runLookup(runs, index) {
  if (!runs) return null;
  for (const [i0, i1, v] of runs) if (index >= i0 && index < i1) return v;
  return null;
}

// 4-connected components of a mask. Returns per-pixel labels (-1 outside the
// mask) and per component: pixel count, whether it touches the image border,
// centroid, and the first pixel in raster order (a stable name for it).
export function components(mask, w, h) {
  const label = new Int32Array(w * h).fill(-1), comps = [];
  const stack = new Int32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (!mask[p] || label[p] >= 0) continue;
    const id = comps.length, c = { id, px: 0, border: false, sx: 0, sy: 0, seed: p };
    comps.push(c);
    let sp = 0; stack[sp++] = p; label[p] = id;
    while (sp) {
      const q = stack[--sp], x = q % w, y = (q - x) / w;
      c.px++; c.sx += x; c.sy += y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.border = true;
      if (x > 0 && mask[q - 1] && label[q - 1] < 0) { label[q - 1] = id; stack[sp++] = q - 1; }
      if (x < w - 1 && mask[q + 1] && label[q + 1] < 0) { label[q + 1] = id; stack[sp++] = q + 1; }
      if (y > 0 && mask[q - w] && label[q - w] < 0) { label[q - w] = id; stack[sp++] = q - w; }
      if (y < h - 1 && mask[q + w] && label[q + w] < 0) { label[q + w] = id; stack[sp++] = q + w; }
    }
  }
  for (const c of comps) { c.cx = c.sx / c.px; c.cy = c.sy / c.px; delete c.sx; delete c.sy; }
  return { label, comps };
}

// The raster's dead regions, keyed the way map-style.json designates them:
// "nodata@col,row" for each nodata component, named by its first pixel (the
// ones that reach the raster border are the mesh's outside, which H3 shows
// as sea on one side and ground on another; the enclosed ones are H12's
// ponds, H8's strait, collision gaps), and "floor" / "zone" / "fall" for
// those classes as a whole.
export function deadRegions(raster) {
  const { w, h, cls } = raster;
  const nd = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) nd[i] = cls[i] === CLS.NODATA ? 1 : 0;
  const { label: ndLabel, comps } = components(nd, w, h);
  const regions = [], index = new Map();
  const region = (key, kind, border = false) => {
    if (!index.has(key)) { index.set(key, regions.length); regions.push({ key, kind, px: 0, border }); }
    return index.get(key);
  };
  const compRegion = new Int32Array(comps.length);
  for (const c of comps) compRegion[c.id] = region(`nodata@${c.seed % w},${(c.seed - (c.seed % w)) / w}`, "nodata", c.border);
  const label = new Int32Array(w * h).fill(-1);
  for (let i = 0; i < w * h; i++) {
    const c = cls[i];
    let r = -1;
    if (c === CLS.NODATA) r = compRegion[ndLabel[i]];
    else if (c === CLS.FLOOR) r = region("floor", "floor");
    else if (c === CLS.ZONE) r = region("zone", "zone");
    else if (c === CLS.FALL) r = region("fall", "fall");
    if (r >= 0) { label[i] = r; regions[r].px++; }
  }
  return { label, regions };
}

// The water class's components, keyed "water@col,row" by first pixel. An
// enclosed one (not reaching the raster border) can be an inland pond drawn
// in the light style while the hole's sea is dark (H2 has both).
export function waterComponents(raster) {
  const { w, h, cls } = raster;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = cls[i] === CLS.WATER ? 1 : 0;
  const { label, comps } = components(m, w, h);
  for (const c of comps) c.key = `water@${c.seed % w},${(c.seed - (c.seed % w)) / w}`;
  return { label, comps };
}

// Replace the raster's dead pixels by what the minimap draws there and tag the
// water with its style. `designations` maps dead-region keys to "sea" | "pond"
// | "outer" | "fill"; anything else (or a missing key) means "fill": the
// nearest resolved pixel's class, so a collision gap inside the rough stays
// rough. `waterStyle` ("sea" | "pond") is the hole's water; `waterDesignations`
// overrides it per enclosed water component (keys from waterComponents).
export function resolveRaster(raster, designations, waterStyle, waterDesignations) {
  const { w, h, cls } = raster;
  const out = new Uint8Array(w * h);
  const { label, regions } = deadRegions(raster);
  const code = regions.map((r) => {
    const d = designations?.[r.key];
    return d === "sea" ? CLS.WATER : d === "pond" ? CLS.POND : d === "outer" ? CLS.OUTER : 0;
  });
  const wc = waterComponents(raster);
  const wcode = wc.comps.map((c) => {
    const d = (!c.border && waterDesignations?.[c.key]) || waterStyle;
    return d === "pond" ? CLS.POND : CLS.WATER;
  });
  const fill = new Int32Array(w * h); let qt = 0;
  for (let i = 0; i < w * h; i++) {
    const c = cls[i];
    if (c === CLS.WATER) out[i] = wcode[wc.label[i]];
    else if (LIVE.has(c)) out[i] = c;
    else {
      const v = label[i] >= 0 ? code[label[i]] : 0;
      out[i] = v; if (!v) fill[qt++] = i;
    }
  }
  if (qt) fillNearest(out, w, h);
  return out;
}

// Multi-source BFS: every 0 pixel takes the class of the nearest non-zero one.
export function fillNearest(out, w, h) {
  const q = new Int32Array(w * h); let qh = 0, qn = 0;
  for (let i = 0; i < w * h; i++) if (out[i]) q[qn++] = i;
  if (qn === 0) return out;
  while (qh < qn) {
    const p = q[qh++], x = p % w, y = (p - x) / w, v = out[p];
    if (x > 0 && !out[p - 1]) { out[p - 1] = v; q[qn++] = p - 1; }
    if (x < w - 1 && !out[p + 1]) { out[p + 1] = v; q[qn++] = p + 1; }
    if (y > 0 && !out[p - w]) { out[p - w] = v; q[qn++] = p - w; }
    if (y < h - 1 && !out[p + w]) { out[p + w] = v; q[qn++] = p + w; }
  }
  return out;
}

// Two things in the rasters the minimap does not draw, cleaned in place:
//  - Beaches: the sand keeps going under the water plane, and the max-Y
//    rasteriser then alternates sand, water and slivers of outer ground
//    pixel by pixel in a band BEACH_ZONE px wide along the shoreline (H3's
//    beach; the ground slivers would count as land and get bank bands, the
//    outer strips of sand come loose). Inside that band (sand and water both
//    within BEACH_ZONE) a ground pixel takes the majority of sand / water
//    around it, the sand is closed with the same disc (filling the water
//    slivers between sand pieces out to the beach's true edge), sand or
//    water pixels with both in their 5x5 neighbourhood take the majority of
//    the two, twice over, and enclosed water pockets under BEACH_POCKET_PX
//    ringed by sand become sand.
//  - Sand that touches no course class (fairway, rough, green, fringe) and is
//    small or a sliver (under SAND_KEEP_PX, or filling under SAND_KEEP_FILL of
//    its bounding box): the wedge planes on H17 and H19 and gravel out in the
//    ground or water. The minimap shows nothing there; they take the nearest
//    other class. H3's beach parts that the shoreline cut off stay: they are
//    big and blobby.
const SAND_KEEP_PX = 1000, SAND_KEEP_FILL = 0.3, BEACH_ZONE = 3, BEACH_POCKET_PX = 2000, BEACH_POCKET_RIM = 0.7;
export function cleanRaster(cls, w, h) {
  const isWet = (c) => c === CLS.WATER || c === CLS.POND;
  const disc = [];
  for (let dy = -BEACH_ZONE; dy <= BEACH_ZONE; dy++) for (let dx = -BEACH_ZONE; dx <= BEACH_ZONE; dx++) if (dx * dx + dy * dy <= BEACH_ZONE * BEACH_ZONE) disc.push([dx, dy]);
  // the shoreline band: sand within BEACH_ZONE of water
  const nearSand = new Uint8Array(w * h), nearWet = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cls[y * w + x];
    if (c !== CLS.SAND && !isWet(c)) continue;
    const mark = c === CLS.SAND ? nearSand : nearWet;
    for (const [dx, dy] of disc) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) mark[yy * w + xx] = 1; }
  }
  const zone = new Uint8Array(w * h);
  let zoneN = 0;
  for (let i = 0; i < w * h; i++) if (nearSand[i] && nearWet[i]) { zone[i] = 1; zoneN++; }
  if (zoneN) {
    const majority = (src, x, y, r, both = true) => {
      let sand = 0, wet = 0, wetC = CLS.WATER;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const v = src[yy * w + xx];
        if (v === CLS.SAND) sand++; else if (isWet(v)) { wet++; wetC = v; }
      }
      return (both ? sand && wet : sand || wet) ? (sand >= wet ? CLS.SAND : wetC) : 0;
    };
    // ground slivers in the band take whichever of sand and water surrounds them
    const src0 = Uint8Array.from(cls);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (zone[p] && src0[p] === CLS.OUTER) { const v = majority(src0, x, y, 2, false); if (v) cls[p] = v; }
    }
    // closing of the sand: dilate from every sand pixel, erode within the band
    const dil = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (cls[y * w + x] !== CLS.SAND) continue;
      for (const [dx, dy] of disc) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) dil[yy * w + xx] = 1; }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!zone[p] || !isWet(cls[p])) continue;
      let inside = true;
      for (const [dx, dy] of disc) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h || !dil[yy * w + xx]) { inside = false; break; } }
      if (inside) cls[p] = CLS.SAND;
    }
    // then the pixel-by-pixel alternation
    for (let pass = 0; pass < 2; pass++) {
      const src = Uint8Array.from(cls);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (!zone[p] || (src[p] !== CLS.SAND && !isWet(src[p]))) continue;
        const v = majority(src, x, y, 2); if (v) cls[p] = v;
      }
    }
    // and the water pockets the closing left inside the beach: enclosed water
    // components under BEACH_POCKET_PX whose edge is at least BEACH_POCKET_RIM
    // sand (no pond on these courses sits inside a bunker)
    const wetM = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) wetM[i] = isWet(cls[i]) ? 1 : 0;
    const wc = components(wetM, w, h), rimSand = new Int32Array(wc.comps.length), rimAll = new Int32Array(wc.comps.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!wetM[p]) continue;
      const k = wc.label[p];
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q < 0 || wetM[q]) continue;
        rimAll[k]++; if (cls[q] === CLS.SAND) rimSand[k]++;
      }
    }
    const pocket = wc.comps.map((c) => !c.border && c.px < BEACH_POCKET_PX && rimAll[c.id] > 0 && rimSand[c.id] >= BEACH_POCKET_RIM * rimAll[c.id]);
    for (let i = 0; i < w * h; i++) if (wetM[i] && pocket[wc.label[i]]) cls[i] = CLS.SAND;
  }
  const sandM = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) sandM[i] = cls[i] === CLS.SAND ? 1 : 0;
  const { label, comps } = components(sandM, w, h);
  const onCourse = new Uint8Array(comps.length);
  const bbox = comps.map(() => ({ x0: w, y0: h, x1: -1, y1: -1 }));
  const course = (c) => c === CLS.FAIRWAY || c === CLS.ROUGH || c === CLS.GREEN || c === CLS.FRINGE;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (!sandM[p]) continue;
    const b = bbox[label[p]];
    if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
    if (onCourse[label[p]]) continue;
    if ((x > 0 && course(cls[p - 1])) || (x < w - 1 && course(cls[p + 1])) || (y > 0 && course(cls[p - w])) || (y < h - 1 && course(cls[p + w]))) onCourse[label[p]] = 1;
  }
  const drop = comps.map((c) => !onCourse[c.id] && (c.px < SAND_KEEP_PX || c.px < SAND_KEEP_FILL * (bbox[c.id].x1 - bbox[c.id].x0 + 1) * (bbox[c.id].y1 - bbox[c.id].y0 + 1)));
  let dropped = 0;
  for (let i = 0; i < w * h; i++) if (sandM[i] && drop[label[i]]) { cls[i] = 0; dropped++; }
  if (dropped) fillNearest(cls, w, h);
  return { dropped, components: comps.filter((c) => drop[c.id]).map((c) => ({ px: c.px, cx: c.cx, cy: c.cy })) };
}

// Exact Euclidean distance transform (Felzenszwalb & Huttenlocher): squared
// distance from every pixel to the nearest pixel where src is non-zero.
export function edt2(src, w, h) {
  const INF = 1e20;
  const f = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) f[i] = src[i] ? 0 : INF;
  const n = Math.max(w, h), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), g = new Float64Array(n);
  const dt1 = (len, stride, base) => {
    for (let i = 0; i < len; i++) g[i] = f[base + i * stride];
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((g[q] + q * q) - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((g[q] + q * q) - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + g[v[k]]; }
    for (let i = 0; i < len; i++) f[base + i * stride] = d[i];
  };
  for (let y = 0; y < h; y++) dt1(w, 1, y * w);
  for (let x = 0; x < w; x++) dt1(h, w, x);
  return Float32Array.from(f);
}

// Separable Gaussian blur of a Float32Array field, edges clamped.
export function gaussianBlur(field, w, h, sigma) {
  const rad = Math.max(1, Math.ceil(sigma * 3)), k = new Float32Array(2 * rad + 1);
  let s = 0;
  for (let i = -rad; i <= rad; i++) { k[i + rad] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + rad]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (let i = -rad; i <= rad; i++) { const xx = Math.min(w - 1, Math.max(0, x + i)); a += field[y * w + xx] * k[i + rad]; }
    tmp[y * w + x] = a;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (let i = -rad; i <= rad; i++) { const yy = Math.min(h - 1, Math.max(0, y + i)); a += tmp[yy * w + x] * k[i + rad]; }
    out[y * w + x] = a;
  }
  return out;
}

// Deterministic PRNG (mulberry32) with a Gaussian draw, so a render is
// reproducible pixel for pixel.
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = next(); while (v === 0) v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return { next, gauss };
}

// Ray-casting point-in-polygon; poly = [[x,y], ...].
export function pointInPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

export const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
export const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export const median = (arr) => { if (!arr.length) return null; const a = Float64Array.from(arr).sort(); return a[a.length >> 1]; };
export const medianRGB = (px) => (px.length ? [0, 1, 2].map((k) => median(px.map((p) => p[k]))) : null);
