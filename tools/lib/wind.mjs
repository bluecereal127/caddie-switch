// Wind arrow direction from the TOP-RIGHT circle on address frames.
// Player-confirmed: this arrow is relative to the PLAYER'S AIM, so its
// direction maps straight to the Log's windDeg (up = tailwind = 0°,
// right = 90°, down = headwind = 180°, ...). Arrow color follows wind
// tier (cyan <10, yellow 10-19, pink 20+); the circle interior is grass,
// so each tier needs a tight color gate.
import { px } from "./image.mjs";

export const DIRS = [
  ["up", 0], ["up-right", 45], ["right", 90], ["down-right", 135],
  ["down", 180], ["down-left", 225], ["left", 270], ["up-left", 315],
];

// The arrow lies in PERSPECTIVE on a small bright-green grass puck in the
// upper part of the wind circle. Anatomy discovered from real crops:
//   1. find the puck (saturated green disk) — its ellipse gives both the
//      arrow's location and the vertical foreshortening factor
//   2. arrow pixels = saturated non-green, non-white/dark pixels inside the
//      (padded) puck ellipse
//   3. un-squash y by the ellipse aspect, take the principal axis, and pick
//      the END whose perpendicular spread is smaller — that's the pointed
//      head (the tail is fat)
// Returns { dir, deg, count } or null (0 mph draws no arrow).
export function readWindArrow(img) {
  const W = img.width, H = img.height;
  // The grass puck holding the arrow is a FIXED HUD element (measured from
  // real 720p crops): centre (1119, 67), radii 38x29 — no detection needed.
  const s = W / 1280;
  const cx = 1126 * s, cy = 76 * (H / 720), rx = 36 * s, ry = 28 * (H / 720);
  const squash = ry / rx; // the arrow lies in perspective on the puck

  // inside the puck only grass + arrow exist: arrow = anything not
  // green-dominant and not deep shadow
  const isArrowPx = (p) => {
    const mx_ = Math.max(p[0], p[1], p[2]);
    if (mx_ < 80) return false; // outline/shadow
    if (p[1] > p[0] && p[1] > p[2] && p[1] - Math.max(p[0], p[2]) > 28) return false; // puck grass
    return true;
  };
  const pts = [];
  for (let y = Math.round(cy - ry); y <= cy + ry; y++)
    for (let x = Math.round(cx - rx); x <= cx + rx; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const ex = (x - cx) / rx, ey = (y - cy) / ry;
      if (ex * ex + ey * ey > 1) continue;
      if (isArrowPx(px(img, x, y))) pts.push([x, (y - cy) / squash + cy]); // un-squash
    }
  if (pts.length < 40) return null;
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x; my += y; }
  mx /= pts.length; my /= pts.length;
  // principal axis via covariance
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pts) { const dx = x - mx, dy = y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(theta), uy = Math.sin(theta);
  // head = the end near the WIDEST cross-section: the chevron barbs are the
  // arrow's widest point and sit close to the tip (the tail shaft is narrow)
  const proj = pts.map(([x, y]) => ({ t: (x - mx) * ux + (y - my) * uy, s: -(x - mx) * uy + (y - my) * ux }));
  let tMin = 1e9, tMax = -1e9;
  for (const p of proj) { if (p.t < tMin) tMin = p.t; if (p.t > tMax) tMax = p.t; }
  const BINS = 10, bins = Array.from({ length: BINS }, () => []);
  for (const p of proj) {
    const b = Math.min(BINS - 1, Math.max(0, Math.floor(((p.t - tMin) / (tMax - tMin)) * BINS)));
    bins[b].push(Math.abs(p.s));
  }
  // robust per-bin width: 85th percentile, thin bins ignored — a single
  // stray rim pixel must not decide the head end
  const width = bins.map((b) => {
    if (b.length < 5) return 0;
    b.sort((x, y) => x - y);
    return b[Math.floor(0.85 * (b.length - 1))];
  });
  let wBin = 0;
  for (let b = 1; b < BINS; b++) if (width[b] > width[wBin]) wBin = b;
  // barbs mid-profile => the head is the tapering side (smaller extreme
  // width). Barbs at an extreme => the chevron tip is clipped by the puck
  // edge and the head is on the barb side itself.
  let sign;
  if (wBin >= 2 && wBin <= BINS - 3) {
    const loW = width[bins.findIndex((b) => b.length >= 5)];
    let hiIdx = BINS - 1; while (hiIdx > 0 && bins[hiIdx].length < 5) hiIdx--;
    sign = width[hiIdx] < loW ? 1 : -1;
  } else {
    sign = wBin >= BINS / 2 ? 1 : -1;
  }
  const ang = Math.atan2(sign * ux, -(sign * uy)) * 180 / Math.PI; // 0=up, cw
  // calibrated class centres measured from labeled frames (the 3D renders
  // sit a few degrees off the ideal 45° steps)
  const CENTERS = [["up", 0, 0], ["up-right", 45, 36], ["right", 90, 94], ["down-right", 135, 137],
    ["down", 180, 175], ["down-left", 225, -141 + 360], ["left", 270, -81 + 360], ["up-left", 315, -58 + 360]];
  const a360 = ((ang % 360) + 360) % 360;
  let bestC = null;
  for (const [name, deg, c] of CENTERS) {
    let d = Math.abs(a360 - c) % 360; if (d > 180) d = 360 - d;
    if (!bestC || d < bestC.d) bestC = { name, deg, d };
  }
  return { dir: bestC.name, deg: bestC.deg, count: pts.length, rawAng: +ang.toFixed(1) };
}
