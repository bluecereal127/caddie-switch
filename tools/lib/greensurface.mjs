// Find the putting surface in a PLAIN (non-Terrain) green capture — no
// heightmap partner required.
//
// Why this works: the putting surface is drawn with a grid of squares, and
// measured on real frames it alternates about (130,195,80)/(160,214,90) with
// a period near 8px. The moment you cross the fringe it goes flat —
// (119,178,64), (121,180,66), (118,177,63) all the way out. So the boundary
// is a TEXTURE edge, not a colour edge, which is exactly why colour
// thresholds could never find it: the fringe is roughly fairway-coloured.
// Player-confirmed: a fringe wraps every green with no break, and outside it
// is fairway or rough, never water or OB — so a boundary that runs into dark
// rough or water is wrong by construction.
//
// The fairway's mowing stripes also carry contrast, but they are wide bands:
// inside a 7x7 window a stripe is flat except at its edges, which form thin
// lines that an opening removes. The checker fills the window everywhere.
import { px } from "./image.mjs";

export const isFlagPink = (p) => p[0] > 190 && p[2] > 120 && p[1] < 110 && p[0] - p[1] > 100;

// The wind dial floats to whichever bottom corner avoids the green and its
// arrow turns pink at 20+ mph — the same colour as the flag. Exclude both.
export const inCompass = (x, y, w, h) => {
  const cr = 0.15 * w, ccy = 0.815 * h;
  return (x - 0.132 * w) ** 2 + (y - ccy) ** 2 < cr * cr ||
         (x - 0.832 * w) ** 2 + (y - ccy) ** 2 < cr * cr;
};

// pin base = darkest pixel in a narrow column under the pink cloth
export function findPin(img) {
  const w = img.width, h = img.height;
  let sx = 0, sy = 0, c = 0, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (inCompass(x, y, w, h)) continue;
    if (isFlagPink(px(img, x, y))) { sx += x; sy += y; c++; if (y > maxY) maxY = y; }
  }
  if (c < 4) return null;
  const fx = sx / c;
  let base = null;
  for (let y = Math.round(sy / c); y < Math.min(h, maxY + 16); y++)
    for (let x = Math.max(0, Math.round(fx - 4)); x <= Math.min(w - 1, Math.round(fx + 6)); x++) {
      const p = px(img, x, y);
      if (p[0] < 70 && p[1] < 70 && p[2] < 70) base = { x, y };
    }
  return base ?? { x: Math.round(fx), y: Math.min(h - 1, maxY + 8) };
}

// Everything the game paints ON the green rather than the green itself: the
// pink cloth, the pole, and the cup. Masked per frame so a stack of captures
// taken at different pin positions can cover each other's occlusions.
export function flagCupMask(img) {
  const w = img.width, h = img.height;
  const mask = new Uint8Array(w * h);
  let sx = 0, sy = 0, c = 0, by1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (inCompass(x, y, w, h)) continue;      // the dial's arrow is pink at 20+ mph
    if (!isFlagPink(px(img, x, y))) continue;
    sx += x; sy += y; c++;
    if (y > by1) by1 = y;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) mask[ny * w + nx] = 1;
    }
  }
  if (!c) return { mask, found: false };
  const fx = Math.round(sx / c);
  // pole down to the cup, then every near-black pixel within reach of the
  // base — by radius, not by flood: the aim line bisects the cup
  let poleBottom = by1;
  for (let y = by1; y < Math.min(h, by1 + Math.round(0.09 * h)); y++)
    for (let x = Math.max(0, fx - 5); x <= Math.min(w - 1, fx + 6); x++) {
      const p = px(img, x, y);
      if (Math.max(p[0], p[1], p[2]) < 80 || Math.min(p[0], p[1], p[2]) > 170) { poleBottom = y; break; }
    }
  for (let y = by1; y <= Math.min(h - 1, poleBottom + 2); y++)
    for (let x = Math.max(0, fx - 7); x <= Math.min(w - 1, fx + 8); x++) mask[y * w + x] = 1;
  const R = Math.max(14, Math.round(0.075 * w)), GROW = 3;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dy * dy > R * R) continue;
    const nx = fx + dx, ny = poleBottom + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const p = px(img, nx, ny);
    if (Math.max(p[0], p[1], p[2]) >= 95) continue;
    for (let gy = -GROW; gy <= GROW; gy++) for (let gx = -GROW; gx <= GROW; gx++) {
      const mx2 = nx + gx, my2 = ny + gy;
      if (mx2 >= 0 && my2 >= 0 && mx2 < w && my2 < h) mask[my2 * w + mx2] = 1;
    }
  }
  return { mask, found: true };
}

const morph = (m, w, h, r, op) => {
  if (r <= 0) return m;
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = op === "erode" ? 1 : 0;
    for (let dy = -r; dy <= r; dy++) {
      let done = false;
      for (let dx = -r; dx <= r; dx++) {
        const nx = Math.min(w - 1, Math.max(0, x + dx)), ny = Math.min(h - 1, Math.max(0, y + dy));
        const s = m[ny * w + nx];
        if (op === "erode") { if (!s) { v = 0; done = true; break; } }
        else if (s) { v = 1; done = true; break; }
      }
      if (done) break;
    }
    out[y * w + x] = v;
  }
  return out;
};
const close = (m, w, h, r) => morph(morph(m, w, h, r, "dilate"), w, h, r, "erode");
const open = (m, w, h, r) => morph(morph(m, w, h, r, "erode"), w, h, r, "dilate");

// Measured on real frames (5px window, luma range): the checker is strikingly
// REGULAR — p10..p75 across the surface is 41..44 — while everything outside
// is either much flatter (fairway ~20, fringe lower still) or much rougher
// (trees 65, HUD 97+). So the test is a BAND, not a floor; a plain floor lets
// the fringe through, and then the flood escapes across it into the fairway.
// The flat fringe failing the band is what keeps the surface an island.
// erodeR undoes a systematic outward bleed: at the surface edge the window
// straddles bright checker and flat fringe, so its range spikes and the mask
// grows past the true boundary by roughly the window half-width plus the
// closing radius. Measured as a ring of over-selection in the debug overlays.
// Values chosen by sweeping against the 47 clean Terrain-diff pairs
// (tools/validate-fringe.mjs --sweep), not by eye: mean IoU 0.787.
export const DEFAULTS = { win: 2, texLo: 34, texHi: 70, openR: 1, closeR: 3, erodeR: 3 };

// -> { mask, size, seed, texFrac } or null
export function surfaceMask(plain, opts = {}) {
  const { win, texLo, texHi, openR, closeR, erodeR } = { ...DEFAULTS, ...opts };
  const w = plain.width, h = plain.height, n = w * h;
  const seed = opts.seed ?? findPin(plain);
  if (!seed) return null;

  const lum = new Float32Array(n);
  for (let p = 0, j = 0; p < n; p++, j += 4)
    lum[p] = 0.299 * plain.data[j] + 0.587 * plain.data[j + 1] + 0.114 * plain.data[j + 2];

  // local luma range: high across the checker, flat on fringe/fairway/sand
  const rough = new Uint8Array(n);
  let texCount = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let lo = 1e9, hi = -1e9;
    for (let dy = -win; dy <= win; dy++) for (let dx = -win; dx <= win; dx++) {
      const nx = Math.min(w - 1, Math.max(0, x + dx)), ny = Math.min(h - 1, Math.max(0, y + dy));
      const v = lum[ny * w + nx];
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
    // trees and the HUD are high-contrast too, but they are dark or
    // desaturated; the surface stays a bright green
    const j = (y * w + x) * 4;
    const g = plain.data[j + 1], r = plain.data[j], b = plain.data[j + 2];
    const greenish = g > 120 && g > b + 25 && g >= r - 20;
    const rng = hi - lo;
    if (rng >= texLo && rng <= texHi && greenish && !inCompass(x, y, w, h)) { rough[y * w + x] = 1; texCount++; }
  }

  // thin stripe-edge lines vanish under an opening; the checker survives and
  // then closes into one solid body
  let m = close(open(rough, w, h, openR), w, h, closeR);

  // keep the component holding the pin, walking outward if the pin base
  // itself landed on the cup (which is black, not textured)
  const idx = (x, y) => y * w + x;
  let start = -1;
  for (let rad = 0; rad < 30 && start < 0; rad++)
    for (let dy = -rad; dy <= rad && start < 0; dy++)
      for (let dx = -rad; dx <= rad && start < 0; dx++) {
        const x = seed.x + dx, y = seed.y + dy;
        if (x >= 0 && y >= 0 && x < w && y < h && m[idx(x, y)]) start = idx(x, y);
      }
  if (start < 0) return null;
  const mask = new Uint8Array(n), st = [start];
  mask[start] = 1;
  let size = 0;
  while (st.length) {
    const q = st.pop(); size++;
    const x = q % w, y = (q / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const k = ny * w + nx;
      if (m[k] && !mask[k]) { mask[k] = 1; st.push(k); }
    }
  }

  // fill enclosed holes (the flag, the cup, the legend where it overlaps)
  const bg = new Uint8Array(n), sb = [];
  for (let x = 0; x < w; x++) { sb.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { sb.push(y * w, y * w + w - 1); }
  while (sb.length) {
    const q = sb.pop();
    if (bg[q] || mask[q]) continue;
    bg[q] = 1;
    const x = q % w, y = (q / w) | 0;
    if (x > 0) sb.push(q - 1); if (x < w - 1) sb.push(q + 1);
    if (y > 0) sb.push(q - w); if (y < h - 1) sb.push(q + w);
  }
  for (let i = 0; i < n; i++) if (!bg[i] && !mask[i]) { mask[i] = 1; size++; }

  const tight = erodeR > 0 ? morph(mask, w, h, erodeR, "erode") : mask;
  let tightSize = 0;
  for (let i = 0; i < n; i++) if (tight[i]) tightSize++;
  // if erosion ate the whole thing (tiny green, heavy zoom-out) keep the
  // un-eroded mask rather than returning nothing
  if (tightSize < 400) return { mask, size, seed, texFrac: texCount / n };
  return { mask: tight, size: tightSize, seed, texFrac: texCount / n };
}
