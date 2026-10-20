// Contour lines over a hole's terrain (src/terrain.js), a debug view only: the
// Holes tab's "Contours (debug)" chip lays them over the hole map so the
// heights the solver flies (src/model.js, "elevation") can be checked by eye
// against the real hole. A line every CONTOUR_YD yd of height relative to the
// hole's datum (the WSR start, where local play tees off), the ones on every
// LABEL_EVERY-th level darker and labelled with their height, the tee's own
// level (0) dark red, each with a faint light edge on its low side so it
// reads on the dark OB rough and the sea too. Transparent elsewhere and
// wherever the terrain has no data (class 0 or no height: past the raster's
// crop).
//
// contourImage is pure and deterministic (the same terrain and size give the
// same bytes; tools/test-relief.mjs runs it under Node); contourDataUrl wraps
// its buffer into a PNG data URL through a canvas, in the browser only.
import { heightAt, TERRAIN_NODATA } from "./terrain.js";

export const CONTOUR_YD = 2;
export const LABEL_EVERY = 5; // a label on the 10 yd levels: 0, ±10, ±20 ...
const INK = [25, 25, 25, 170], INK_INDEX = [25, 25, 25, 235], INK_ZERO = [150, 20, 20, 235], EDGE = [255, 255, 255, 90], HALO = [255, 255, 255, 200];
// 3x5 digits, rows top to bottom, bit 2 = the left column
const GLYPH = {
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [7, 1, 7, 4, 7], 3: [7, 1, 7, 1, 7], 4: [5, 5, 7, 1, 1],
  5: [7, 4, 7, 1, 7], 6: [7, 4, 7, 5, 7], 7: [7, 1, 1, 1, 1], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 7], "-": [0, 0, 7, 0, 0],
};

// -> { w, h, data: Uint8ClampedArray (RGBA, row-major) } for a w x h image of
// the 250x304 map frame (the default is one pixel per map px; the App asks
// for the maps' own 2x). A pixel samples the height at its centre (heightAt,
// bilinear) and is a line pixel when a 4-neighbour with data lies in a lower
// CONTOUR_YD band: the line sits on the high side of its level, one pixel
// wide (a cliff that drops several bands within a pixel or two draws them as
// one dark band). Labels (font scale = w / 250, at least 1) sit on a level's
// line where it crosses that level alone (none on a cliff's stacked lines)
// and their box fits on data, a third of the width from another label of the
// same level and clear of every other label, found in raster order, so
// mostly at each contour's top.
export function contourImage(t, { w = 250, h = 304, labels = true } = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  if (!t) return { w, h, data };
  const n = w * h, has = new Uint8Array(n), band = new Int32Array(n);
  for (let j = 0; j < h; j++) {
    const y = (j + 0.5) / h, cj = Math.min(t.h - 1, Math.floor(y * t.h));
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5) / w, c = cj * t.w + Math.min(t.w - 1, Math.floor(x * t.w));
      if (t.classes[c] === 0 || t.heights[c] === TERRAIN_NODATA) continue;
      // the pixel's own sample has data, so heightAt weighs it in: never null here
      const z = heightAt(t, x, y);
      if (z == null) continue;
      has[j * w + i] = 1;
      band[j * w + i] = Math.floor(z / CONTOUR_YD);
    }
  }
  // per line pixel crossing one LABEL_EVERY level alone, that level (in bands), else NaN
  const index = new Float64Array(n).fill(NaN), line = new Uint8Array(n);
  const put = (p, [r, g, b, a]) => { data[4 * p] = r; data[4 * p + 1] = g; data[4 * p + 2] = b; data[4 * p + 3] = a; };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const p = j * w + i;
      if (!has[p]) continue;
      let lo = band[p];
      if (i > 0 && has[p - 1] && band[p - 1] < lo) lo = band[p - 1];
      if (i < w - 1 && has[p + 1] && band[p + 1] < lo) lo = band[p + 1];
      if (j > 0 && has[p - w] && band[p - w] < lo) lo = band[p - w];
      if (j < h - 1 && has[p + w] && band[p + w] < lo) lo = band[p + w];
      const b = band[p];
      if (lo === b) continue;
      // the levels crossed are bands lo + 1 ... b
      const k = Math.floor(b / LABEL_EVERY) * LABEL_EVERY;
      if (k > lo && lo === b - 1) index[p] = k;
      line[p] = 1;
      put(p, lo < 0 && b >= 0 ? INK_ZERO : k > lo ? INK_INDEX : INK);
    }
  }
  // the light edge: the lower neighbours of a line pixel that are not lines themselves
  for (let p = 0; p < n; p++) {
    if (!line[p]) continue;
    const i = p % w, b = band[p];
    for (const q of [i > 0 ? p - 1 : -1, i < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (q >= 0 && q < n && has[q] && !line[q] && band[q] < b) put(q, EDGE);
    }
  }
  if (!labels) return { w, h, data };
  const s = Math.max(1, Math.floor(w / 250)), sep = w / 3, placed = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = index[j * w + i];
      if (Number.isNaN(k)) continue;
      const text = String(k * CONTOUR_YD);
      // the box: the glyphs 3s wide, s apart, 5s high, inside a halo of s
      const bw = text.length * 4 * s + s, bh = 7 * s, x0 = i - (bw >> 1), y0 = j - (bh >> 1);
      if (x0 < 0 || y0 < 0 || x0 + bw > w || y0 + bh > h) continue;
      if (placed.some((q) => (q.text === text && Math.hypot(q.i - i, q.j - j) < sep)
        || (x0 < q.x0 + q.bw + s && q.x0 < x0 + bw + s && y0 < q.y0 + q.bh + s && q.y0 < y0 + bh + s))) continue;
      let fits = true;
      for (let v = y0; v < y0 + bh && fits; v++) for (let u = x0; u < x0 + bw; u++) if (!has[v * w + u]) { fits = false; break; }
      if (!fits) continue;
      placed.push({ text, i, j, x0, y0, bw, bh });
      for (let v = y0; v < y0 + bh; v++) for (let u = x0; u < x0 + bw; u++) put(v * w + u, HALO);
      [...text].forEach((ch, m) => {
        const rows = GLYPH[ch], gx = x0 + s + m * 4 * s, gy = y0 + s;
        for (let r = 0; r < 5; r++) for (let col = 0; col < 3; col++) {
          if (!(rows[r] & (4 >> col))) continue;
          for (let dv = 0; dv < s; dv++) for (let du = 0; du < s; du++) put((gy + r * s + dv) * w + gx + col * s + du, k === 0 ? INK_ZERO : INK_INDEX);
        }
      });
    }
  }
  return { w, h, data };
}

// contourImage as a PNG data URL (browser only: null without a DOM or terrain)
export function contourDataUrl(t, opts) {
  if (!t || typeof document === "undefined") return null;
  const { w, h, data } = contourImage(t, opts);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  if (!g) return null;
  g.putImageData(new ImageData(data, w, h), 0, 0);
  return cv.toDataURL("image/png");
}
