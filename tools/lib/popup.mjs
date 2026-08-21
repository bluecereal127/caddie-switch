// Result pop-up readers: power-gauge fill + "NNN yd to go" line + lie title.
// Pop-up anatomy (720p): a vertical bar in the left ~third of the frame —
// yellow dot = the 4.0 top mark, teal = filled from the bottom, dark olive =
// unfilled remainder, white quarter dots. Bar position shifts between shots
// so it's located by color scan, not a fixed ROI.
import { px } from "./image.mjs";

const isTeal = (p) => p[1] > 175 && p[2] > 150 && p[0] < 120 && p[1] - p[0] > 70;
const isYellowDot = (p) => p[0] > 220 && p[1] > 160 && p[1] < 220 && p[2] < 110;
const isDarkBar = (p) => p[0] < 95 && p[1] < 105 && p[2] < 95;

// Locate the bar and measure the locked power. IMPORTANT: after the result
// pop-up appears, the teal fill DRAINS in an animation — the capture catches
// it at an arbitrary height. The YELLOW DOT is the persistent marker of the
// locked swing power (it rides at the true fill level), so power comes from
// the dot's position on the bar, never from the teal.
// Returns { power, x, top, bottom, dotY } or null (no bar/dot found).
export function readPopupGauge(img) {
  const W = img.width, H = img.height;
  const x0 = Math.round(0.06 * W), x1 = Math.round(0.42 * W);
  const y0 = Math.round(0.40 * H), y1 = Math.round(0.95 * H);
  // candidate columns: the bar body is teal and/or dark-olive, but the
  // white quarter dots and the yellow power dot interrupt any contiguous
  // run — score columns by span + density instead
  let best = null;
  for (let x = x0; x <= x1; x += 2) {
    let first = -1, last = -1, count = 0;
    for (let y = y0; y <= y1; y++) {
      const p = px(img, x, y);
      if (isTeal(p) || isDarkBar(p)) { if (first < 0) first = y; last = y; count++; }
    }
    if (first < 0) continue;
    const span = last - first + 1;
    if (span >= 0.28 * H && count >= 0.6 * span && (!best || count > best.count))
      best = { x, first, last, count };
  }
  if (!best) return null;
  const bx = best.x, barTop = best.first, barBottom = best.last;

  // yellow power dot: find its full vertical extent near the bar column and
  // use the centre (it rides at the locked swing power; the teal below it
  // drains in an animation, so teal height is meaningless)
  let dFirst = null, dLast = null;
  for (let y = Math.max(0, barTop - 16); y <= barBottom; y++) {
    let hit = false;
    for (let dx = -12; dx <= 12; dx++) {
      const p = px(img, Math.min(W - 1, Math.max(0, bx + dx)), y);
      if (isYellowDot(p)) { hit = true; break; }
    }
    if (hit) { if (dFirst == null) dFirst = y; dLast = y; }
    else if (dFirst != null) break; // past the dot
  }
  if (dFirst == null || barBottom <= barTop) return null;
  const dotC = (dFirst + dLast) / 2;
  const frac = (barBottom - dotC) / (barBottom - barTop);
  return { power: +(Math.min(1, Math.max(0, frac)) * 4).toFixed(2),
    x: bx, top: barTop, bottom: barBottom, dotY: dotC };
}

// The pop-up title ("Fairway"/"Green"/...) is white text with a TEAL outline
// and glow — a different binarizer from the HUD's dark-outlined text.
export function binarizeTitle(img) {
  const w = img.width, h = img.height;
  const teal = new Uint8Array(w * h), bin = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    if (img.data[j] < 160 && img.data[j + 1] > 170 && img.data[j + 2] > 150) teal[i] = 1;
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4;
      const mn = Math.min(img.data[j], img.data[j + 1], img.data[j + 2]);
      if (mn < 205) continue;
      let edged = false;
      for (let dy = -2; dy <= 2 && !edged; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && teal[ny * w + nx]) { edged = true; break; }
        }
      if (edged) bin[y * w + x] = 1;
    }
  return { bin, width: w, height: h };
}

// full-frame fractional ROIs for the pop-up text
export const POPUP_ROIS = {
  title: [0.33, 0.25, 0.34, 0.11],
  distance: [0.36, 0.40, 0.28, 0.06],
};
