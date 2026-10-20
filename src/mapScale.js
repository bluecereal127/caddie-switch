// The hole maps at more than the bundle's 2x. tools/build-map-scales.mjs ships
// them under public/maps/: hNN-3x.jpg (750x912) and hNN-4x.jpg (1000x1216),
// JPEG q78 like src/maps.js, 100-196 / 154-317 KB a hole, and an index.json
// naming each file. The frame is the same 250x304 at every scale, so every
// fractional position (pins, trees, the line, the contour overlay) places the
// same on any of them. The app's `mapScale` setting picks one; the 2x image in
// src/maps.js is the default, what shows while a larger file loads, and the
// fallback for a hole or scale the index lacks.
//
// Pure apart from the two loaders, which take stand-ins for fetch and Image
// so Node can test them (tools/test-mapscale.mjs).

export const MAPS_DIR = "/maps/";
export const MAP_SCALES = [2, 3, 4];
const FRAME_W = 250, FRAME_H = 304; // the map frame in map px (App.jsx MAP_W, MAP_H)

// a stored setting -> 2, 3 or 4; anything else (an install from before the
// setting, which has no key) is the bundle's 2x
export const mapScaleOf = (v) => (MAP_SCALES.includes(v) ? v : 2);

// The URL of hole n's map at `scale` from its index entry's own file name,
// never a guessed path; null for 2x (the bundle's image), a hole or scale the
// index lacks, a file name with a path in it, and an entry that is not the
// 250x304 frame at its scale (every overlay on it would misplace).
export function mapFileUrl(index, hole, scale, base = MAPS_DIR) {
  if (!(scale > 2)) return null;
  const e = index?.holes?.[hole]?.[scale];
  if (!e || typeof e.file !== "string" || !/^[\w.-]+$/.test(e.file)) return null;
  if (e.w !== FRAME_W * scale || e.h !== FRAME_H * scale) return null;
  return base + e.file;
}

// -> Promise of public/maps/index.json's object, or {} when it is missing or
// unreadable (the Vite dev server answers a missing file with index.html,
// which is no JSON). One fetch shared by every caller; a failure is not kept,
// so a later call tries again, as src/terrain.js's loaders do.
const indexes = new Map();
export function loadMapIndex({ base = MAPS_DIR, fetch: fetchImpl = globalThis.fetch } = {}) {
  const url = `${base}index.json`;
  if (!indexes.has(url)) {
    const p = Promise.resolve()
      .then(() => fetchImpl(url))
      .then((res) => (res && res.ok ? res.json() : null))
      .catch(() => null)
      .then((ix) => {
        if (ix && typeof ix === "object" && ix.holes && typeof ix.holes === "object") return ix;
        indexes.delete(url);
        return {};
      });
    indexes.set(url, p);
  }
  return indexes.get(url);
}

// -> Promise of true once the image at url has loaded (an <img> switched to
// it then shows it at once, from the browser's memory cache), false when it
// fails. One load per url shared by every caller; a failure is not kept. The
// Image itself is kept for the session: an image no element refers to is a
// dead entry in the browser's memory cache, which a memory-pressure prune
// drops (routine on a phone), and an <img> switched to its url then fetches
// it again, showing the previous hole's map under the new hole's marks for a
// round trip (measured 2026-10-20 in Chrome: 750 ms of H8's map under H7's
// marks after a simulated critical pressure; with the Image held, no fetch).
const loads = new Map(); // url -> { p, im }
export function preloadImage(url, { Image: Img = globalThis.Image } = {}) {
  if (!loads.has(url)) {
    const held = {};
    held.p = new Promise((resolve) => {
      held.im = new Img();
      held.im.onload = () => resolve(true);
      held.im.onerror = () => resolve(false);
      held.im.src = url;
    }).catch(() => false).then((ok) => { if (!ok) loads.delete(url); return ok; });
    loads.set(url, held);
  }
  return loads.get(url).p;
}
