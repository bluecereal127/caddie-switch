// The course terrain tools/build-terrain.mjs ships under public/terrain/, from
// the WSR collision meshes: per hole the ground height and the KCL surface
// class on a 125x152 grid over the 250x304 map frame (one sample per 2 map px,
// 1.8-5.0 yd), and a 0.5 yd height grid over the green. Positions in and out
// are map fractions (0-1 of the frame) as everywhere in the app; heights are
// yards above the hole's datum, the WSR player start's height (where local
// play tees off), so a tree's base height `z` (derived.json, on the same
// datum) compares with them directly. Byte layouts: the tool's header.
//
// Parsing and sampling are pure (the tools run them under Node); the loaders
// fetch a hole's file once, cache it, and resolve to null when it is missing
// or malformed, so a caller falls back to whatever it did without terrain.

export const TERRAIN_DIR = "/terrain/";
export const TERRAIN_NODATA = -32768;
const LAYOUT = 1;
// the KCL classes (tools/lib/obj.mjs KCL_GOLF) as the app's lie keys; the tee
// pad is fairway-class. 5 is the dead floor plane under water and OB, 12/13
// walls (no footprint in the rasters, listed for completeness). 0 (past the
// raster's crop), 14 (H1's zone) and 16 (H14's fall boundary) have no lie.
const LIE = { 1: "fairway", 2: "rough", 3: "bunker", 4: "outer", 5: "outer", 6: "green", 7: "water", 9: "fringe", 12: "wall", 13: "wall" };
export const lieOf = (cls) => LIE[cls] ?? null;

const bytesOf = (buf) => (buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
const magic = (dv) => String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));

// hNN.bin -> { hole, w, h, datumY (KCL units), unitYd, heights (Int16Array,
// unitYd above the datum, TERRAIN_NODATA past the raster), classes (Uint8Array) }
export function parseTerrain(buf) {
  const u8 = bytesOf(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.byteLength < 20 || magic(dv) !== "CTRN" || dv.getUint16(4, true) !== LAYOUT) throw new Error("not a terrain file of layout 1");
  const w = dv.getUint16(6, true), h = dv.getUint16(8, true), n = w * h;
  if (u8.byteLength !== 20 + 3 * n) throw new Error(`terrain file is ${u8.byteLength} bytes, ${w}x${h} needs ${20 + 3 * n}`);
  const heights = new Int16Array(n);
  for (let k = 0; k < n; k++) heights[k] = dv.getInt16(20 + 2 * k, true);
  return { hole: dv.getUint16(10, true), w, h, datumY: dv.getFloat32(12, true), unitYd: dv.getFloat32(16, true), heights, classes: u8.slice(20 + 2 * n, 20 + 3 * n) };
}

// Ground height in yd above the datum at map fraction (x, y): bilinear between
// the sample centres, flat over the half sample at the frame's edges; samples
// past the raster drop out of the weights. null outside the frame or with no
// sample around (the outer ground beyond the meshes' crop). Against the mesh
// raster at 42,000 random points on the course (fairway, rough, sand, green,
// fringe): 0.02 yd at the median, 0.05 at the 90th percentile; within a
// sample of a cliff or a bank down to water it reads part way down (the 99th
// percentile 2.4 yd, the worst 20 yd at H7's cliffs; on H8's island the 90th
// percentile is 1.2 yd).
export function heightAt(t, x, y) {
  if (!t || !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return null;
  const u = Math.min(t.w - 1, Math.max(0, x * t.w - 0.5)), v = Math.min(t.h - 1, Math.max(0, y * t.h - 0.5));
  const i0 = Math.min(t.w - 2, Math.floor(u)), j0 = Math.min(t.h - 2, Math.floor(v)), fx = u - i0, fy = v - j0;
  let s = 0, ws = 0;
  for (const [i, j, wt] of [[i0, j0, (1 - fx) * (1 - fy)], [i0 + 1, j0, fx * (1 - fy)], [i0, j0 + 1, (1 - fx) * fy], [i0 + 1, j0 + 1, fx * fy]]) {
    const z = t.heights[j * t.w + i];
    if (z !== TERRAIN_NODATA && wt > 0) { s += z * wt; ws += wt; }
  }
  return ws > 0 ? (s / ws) * t.unitYd : null;
}

// KCL class of the sample whose cell holds (x, y) (0 outside the frame or past the raster).
export function classAt(t, x, y) {
  if (!t || !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return 0;
  const i = Math.min(t.w - 1, Math.floor(x * t.w)), j = Math.min(t.h - 1, Math.floor(y * t.h));
  return t.classes[j * t.w + i];
}

// gNN.bin -> { hole, w, h, box ({x0, y0, x1, y1}, map fractions), stepYd, z0Yd,
// unitYd, data (Int16Array, unitYd above z0Yd), mask (Uint8Array, 1 = inside
// the WSR green outline) }. Node (i, j) sits at box.x0 + i(box.x1 - box.x0)/(w - 1),
// box.y0 + j(box.y1 - box.y0)/(h - 1), stepYd apart; the box is the WSR green
// box plus 0.12 of it on every side, grown to fit the grid.
export function parseGreenHeights(buf) {
  const u8 = bytesOf(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.byteLength < 40 || magic(dv) !== "CGRN" || dv.getUint16(4, true) !== LAYOUT) throw new Error("not a green height file of layout 1");
  const w = dv.getUint16(6, true), h = dv.getUint16(8, true), n = w * h;
  if (u8.byteLength !== 40 + 3 * n) throw new Error(`green height file is ${u8.byteLength} bytes, ${w}x${h} needs ${40 + 3 * n}`);
  const f = (k) => dv.getFloat32(12 + 4 * k, true);
  const data = new Int16Array(n);
  for (let k = 0; k < n; k++) data[k] = dv.getInt16(40 + 2 * k, true);
  return { hole: dv.getUint16(10, true), w, h, box: { x0: f(0), y0: f(1), x1: f(2), y1: f(3) }, stepYd: f(4), z0Yd: f(5), unitYd: f(6), data, mask: u8.slice(40 + 2 * n, 40 + 3 * n) };
}

// Green height in yd above the hole's datum at map fraction (x, y), bilinear
// between the nodes; null outside the grid's box.
export function greenHeightAt(g, x, y) {
  if (!g) return null;
  const u = ((x - g.box.x0) / (g.box.x1 - g.box.x0)) * (g.w - 1), v = ((y - g.box.y0) / (g.box.y1 - g.box.y0)) * (g.h - 1);
  if (!(u >= 0 && u <= g.w - 1 && v >= 0 && v <= g.h - 1)) return null;
  const i0 = Math.min(g.w - 2, Math.floor(u)), j0 = Math.min(g.h - 2, Math.floor(v)), fx = u - i0, fy = v - j0, k = j0 * g.w + i0;
  const d = g.data;
  return g.z0Yd + ((d[k] * (1 - fx) + d[k + 1] * fx) * (1 - fy) + (d[k + g.w] * (1 - fx) + d[k + g.w + 1] * fx) * fy) * g.unitYd;
}

// ---- loaders: one fetch per file, shared by concurrent callers; a failure is
// not cached, so a later call tries again ----
const cache = new Map();
const nn = (hole) => String(hole).padStart(2, "0");
function load(url, parse, fetchImpl) {
  if (!cache.has(url)) {
    const p = Promise.resolve()
      .then(() => fetchImpl(url))
      .then((res) => (res && res.ok ? res.arrayBuffer() : null))
      .then((buf) => (buf ? parse(buf) : null))
      .catch(() => null)
      .then((v) => { if (!v) cache.delete(url); return v; });
    cache.set(url, p);
  }
  return cache.get(url);
}

// -> Promise of parseTerrain's object, or null. `base` and `fetch` are for
// tests (Node reads the files through a fetch stand-in).
export function loadTerrain(hole, { base = TERRAIN_DIR, fetch: fetchImpl = globalThis.fetch } = {}) {
  return load(`${base}h${nn(hole)}.bin`, parseTerrain, fetchImpl);
}

// The one entry point for the green's heights (the putt model):
// -> Promise of { w, h, stepYd, box, z0Yd, unitYd, data, mask } (parseGreenHeights) or null.
export function loadGreenHeights(hole, { base = TERRAIN_DIR, fetch: fetchImpl = globalThis.fetch } = {}) {
  return load(`${base}g${nn(hole)}.bin`, parseGreenHeights, fetchImpl);
}
