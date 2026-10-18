// Online (Survival Golf) vs local play, from one full capture.
//
// Online frames carry a shot timer at the top centre: a translucent dark pill
// with a white stopwatch icon and the seconds left. Local frames have nothing
// there. The score looks for the icon's ring (white on an annulus of radius
// 15-17 px at 1280x720, centred on (593,59)) with the pill's dimmed background
// just inside it (radius 11-12 px). Clouds and sky can be white, but they are
// not dimmed inside a ring.
//
// The pill pulses: for a moment it is drawn larger about the screen's centre,
// which grows the icon and slides it left. H20-map-W11-D0JT caught it at
// 1.19x (ring at 18.5 px, centre (583,60)); at the fixed radii it scored 0.43,
// and a normal pill scaled 1.2-1.4x scored 0.34-0.39, under the threshold. So
// the ring and gap radii are tried at 1.0-1.4x, and the placement is searched
// over a window wide enough for the slid centre: a 2 px grid, then a 1 px look
// around the winner, since the grid alone lands up to 1.4 px off the centre
// and that costs about 0.07. Normal pills scaled 1.1-1.5x now score
// 0.57-0.72, and 0.47 at 1.6x.
//
// Calibrated on the 563 captures of 2026-08: 194 score 0.59-0.70, every one
// with a visible timer (D0JT 0.70, at 1.2x); the other 369 score 0.00-0.25 and
// none has one (the nearest are tree lines against a bright sky). The
// threshold sits below the middle of the gap on purpose: the pulse is the one
// known way an online frame scores low, and nothing local has come near 0.35.
import { px } from "./image.mjs";

export const ONLINE_MIN_SCORE = 0.35;

// pill scales to try; 1.4 still catches a 1.6x pill
const SCALES = [1, 1.1, 1.2, 1.3, 1.4];

export function timerScore(img) {
  const sx = img.width / 1280, sy = img.height / 720;
  const at = (x, y) => px(img, Math.round(x * sx), Math.round(y * sy));
  const white = (p) => Math.min(p[0], p[1], p[2]) > 215;
  const dim = (p) => Math.max(p[0], p[1], p[2]) < 170;
  const score = (cx, cy, s) => {
    let ring = 0, rn = 0, gap = 0, gn = 0;
    for (let a = 0; a < 48; a++) {
      const t = (a / 48) * 2 * Math.PI, c = Math.cos(t), sn = Math.sin(t);
      for (const r of [15, 16, 17]) { rn++; if (white(at(cx + r * s * c, cy + r * s * sn))) ring++; }
      for (const r of [11, 12]) { gn++; if (dim(at(cx + r * s * c, cy + r * s * sn))) gap++; }
    }
    return (ring / rn) * (gap / gn);
  };
  let best = 0, bx = 0, by = 0, bs = 1;
  for (const s of SCALES) for (let cy = 48; cy <= 68; cy += 2) for (let cx = 566; cx <= 612; cx += 2) {
    const sc = score(cx, cy, s);
    if (sc > best) { best = sc; bx = cx; by = cy; bs = s; }
  }
  if (best) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
    if (dx || dy) best = Math.max(best, score(bx + dx, by + dy, bs));
  return best;
}

export const isOnline = (img) => timerScore(img) >= ONLINE_MIN_SCORE;
