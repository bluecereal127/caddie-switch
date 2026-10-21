// The ball on an address frame's minimap (tools/assemble-shots.mjs): where it
// stands on the hole map, which way the aim line points and where the cup is,
// all in the 250x304 map frame, so a logged shot can be flown over the
// course's terrain (tools/build-derived.mjs, the rows' elevFactor).
//
// The panel shows the whole hole only from the tee and from far out. Closer
// in it zooms and pans: of the 39 address frames behind the shot rows of
// 2026-08-21, 26 show the overview and 13 a larger view, 12 of them 1.22-2.89x
// (H10 from 100 yd at 2.19x, H1 from 80 yd at 2.89x) and one (H10 from 213 yd)
// 5.6x on the green with the ball below the panel. So the frame is registered
// against the hole's capture stack (captures/derived/maps/hNN.png, the
// overview in the map frame by construction, extract-maps.mjs): a
// similarity, frame px = zoom x map px + offset, north-up (the minimap never
// turns). The overview is the identity. A zoomed frame's zoom comes from its
// own badge (the "NNN yd to go" distance from the ball to the cup is that
// many map px x the hole's yd per map px, times the zoom, in the frame), the
// cup's map position from the art around it, searched over the green, and
// both are then refined on the art. On those 13 frames the ball then sits
// 0-3.7 yd further from the cup than its badge says, on the 26 overview
// frames (the identity) 0.4-5.5 yd: their cups read up to 2 px north of the
// pin they show.
//
// The marks are the ones extract-maps.mjs reads on tee frames, with its
// thresholds (kept in step by hand: extract-maps keeps its own copies):
//  - the ball: the yellow pointer triangle at the start of the aim line. Its
//    centroid lands a mean (-0.17, -0.16) px from the WSR start on 161 local
//    tee frames and wanders about 1.5 px round the ball as the aim turns
//    (extract-maps.mjs), so at a zoom that is 1.5 / zoom map px;
//  - the landing dot: the orange disc at the aim line's far end, which passes
//    the pointer's yellow test too. Its white rim tells it apart: of a ring 4-5
//    px out, 46-79 % is white round the rows' 39 dots, 0-4 % round the
//    triangles (their rim is a dark outline; 358 triangles over all 362 map
//    frames), so a blob is the dot at 35 % and the triangle under 25 %;
//  - the cup: the black ellipse under the flag (cupCentre, extract-maps.mjs).
// The aim's bearing is the line from the triangle to the dot (both lie on the
// aim line; they are 30-150 px apart, so 0.4-1.7 degrees for a pixel).
import { px } from "./image.mjs";
import { isFlagPink } from "./greensurface.mjs";

// avatar direction pointer and landing dot (extract-maps.mjs isPointerYellow)
export const isPointerYellow = (p) => p[0] > 225 && p[1] > 160 && p[1] < 215 && p[2] < 90;
// the aim line (extract-maps.mjs overlayMask: (49,239,249) ... (63,232,241); the
// r < 120 floor keeps pale lake water, near (150,220,215), out)
const isAimCyan = (p) => p[0] < 120 && p[1] > 215 && p[2] > 225;

// The wind dial's corner, as extract-maps.mjs dialCorner reads it (the ring of
// radius 0.082w about (0.18w | 0.82w, 0.829h)), or null when neither corner
// leads: then both corners are masked.
const DIAL_CX = [0.18, 0.82], DIAL_CY = 0.829, DIAL_R = 0.082, DIAL_MIN = 50, DIAL_LEAD = 25;
function dialCorner(img) {
  const w = img.width, h = img.height, r = DIAL_R * w, cy = DIAL_CY * h;
  const score = (cx) => {
    let s = 0;
    for (let a = 0; a < 72; a++) {
      const th = (a / 72) * 2 * Math.PI;
      for (let rr = r - 2; rr <= r + 2; rr++) {
        const x = Math.round(cx + rr * Math.cos(th)), y = Math.round(cy + rr * Math.sin(th));
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const p = px(img, x, y);
        if (Math.min(p[0], p[1], p[2]) > 165) { s++; break; }
      }
    }
    return s;
  };
  const [L, R] = DIAL_CX.map((f) => score(f * w));
  if (Math.max(L, R) < DIAL_MIN || Math.abs(L - R) < DIAL_LEAD) return null;
  return L > R ? 0.168 * w : 0.832 * w;
}

// 4-connected blobs of a predicate outside the mask, largest first (extract-maps.mjs blobsOf)
function blobsOf(img, pred, masked) {
  const w = img.width, h = img.height, seen = new Uint8Array(w * h), out = [];
  for (let y0 = 0; y0 < h; y0++) for (let x0 = 0; x0 < w; x0++) {
    if (seen[y0 * w + x0] || masked(x0, y0) || !pred(px(img, x0, y0))) continue;
    const st = [y0 * w + x0]; seen[y0 * w + x0] = 1;
    let sx = 0, sy = 0, c = 0, bx0 = x0, bx1 = x0, by0 = y0, by1 = y0;
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j / w) | 0;
      sx += x; sy += y; c++;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx]) continue;
        if (masked(nx, ny) || !pred(px(img, nx, ny))) continue;
        seen[ny * w + nx] = 1; st.push(ny * w + nx);
      }
    }
    out.push({ x: sx / c, y: sy / c, n: c, x0: bx0, x1: bx1, y0: by0, y1: by1 });
  }
  return out.sort((a, b) => b.n - a.n);
}

// the cup: the black ellipse ~15 px wide round the pole's foot, from the rows
// below the cloth whose dark span is 8 px or wider (extract-maps.mjs cupCentre)
function cupCentre(img, cloth, masked) {
  const isDark = (p) => Math.max(p[0], p[1], p[2]) < 55;
  const b = blobsOf(img, isDark, masked).find((q) => q.y1 > cloth.y1 && q.y1 < cloth.y1 + 34 &&
    q.x1 > cloth.x0 - 14 && q.x0 < cloth.x1 + 14 && q.n >= 6);
  if (!b) return null;
  let sx = 0, sy = 0, c = 0;
  for (let y = Math.max(b.y0, cloth.y1 + 2); y <= b.y1; y++) {
    let lo = -1, hi = -1;
    for (let x = b.x0; x <= b.x1; x++) if (isDark(px(img, x, y))) { if (lo < 0) lo = x; hi = x; }
    if (lo >= 0 && hi - lo + 1 >= 8) { sx += (lo + hi) / 2 + 0.5; sy += y + 0.5; c++; }
  }
  return c ? { x: sx / c, y: sy / c } : null;
}

// the white share of a ring 4-5 px out from a blob's centroid
const RIM_DOT = 0.35, RIM_TRI = 0.25;
function rimWhite(img, b) {
  let s = 0, n = 0;
  for (let a = 0; a < 24; a++) {
    const th = (a / 24) * 2 * Math.PI;
    for (const R of [4, 5]) {
      const x = Math.round(b.x + R * Math.cos(th)), y = Math.round(b.y + R * Math.sin(th));
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      n++;
      if (Math.min(...px(img, x, y)) > 190) s++;
    }
  }
  return n ? s / n : 0;
}

// Merge blobs whose boxes lie within `gap` px (extract-maps.mjs mergeBlobs: a
// triangle at the edge of the yellow band can split into a body and a tip)
function mergeBlobs(blobs, gap) {
  const out = blobs.map((b) => ({ ...b }));
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      if (Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1) - 1 > gap) continue;
      const n = a.n + b.n;
      out[i] = { x: (a.x * a.n + b.x * b.n) / n, y: (a.y * a.n + b.y * b.n) / n, n,
        x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) };
      out.splice(j, 1); j = i;
    }
  return out.sort((a, b) => b.n - a.n);
}

// The marks on a panel crop, in frame px (pixel centres, +0.5): tri (the
// ball), dot (the landing dot), cup, and the aim line's cyan pixels.
// Triangles run 30-55 px over the 362 map frames, dots up to 35 (fewer where
// the line runs off the panel); the other yellow blobs, 11 of them, 6-15 px.
export function addressMarks(panel) {
  const w = panel.width, h = panel.height;
  const dial = dialCorner(panel), cy = 0.822 * h, rr = 0.14 * w;
  const inDial = dial == null
    ? (x, y) => [0.168 * w, 0.832 * w].some((cx) => (x - cx) ** 2 + (y - cy) ** 2 < rr * rr)
    : (x, y) => (x - dial) ** 2 + (y - cy) ** 2 < rr * rr;
  const yellow = mergeBlobs(blobsOf(panel, isPointerYellow, inDial), 3).filter((b) => b.n >= 6)
    .map((b) => ({ ...b, rim: rimWhite(panel, b) }));
  const tri = yellow.find((b) => b.rim < RIM_TRI && b.n >= 20) ?? null;
  const dot = yellow.find((b) => b.rim >= RIM_DOT) ?? null;
  const cloth = blobsOf(panel, isFlagPink, inDial)[0] ?? null;
  const cup = cloth && cloth.n >= 40 ? cupCentre(panel, cloth, inDial) : null;
  const cyan = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!inDial(x, y) && isAimCyan(px(panel, x, y))) cyan.push([x + 0.5, y + 0.5]);
  const c = (b) => (b ? { x: b.x + 0.5, y: b.y + 0.5 } : null);
  return { dial, inDial, tri: c(tri), dot: c(dot), cup, cyan };
}

// ---- registration ----
// Luma box means over an integral image that skips masked pixels: the frame's
// overlays (aim line, dots, pointer, portrait, flag, cup, dial, labels) are
// not map art, nor is the stack's 3D world (its var.png, the luma range over
// the pooled tee frames, above VAR_ART).
const VAR_ART = 40;
function integral(img, use) {
  const w = img.width, h = img.height, W1 = w + 1;
  const I = new Float64Array(W1 * (h + 1)), N = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0, rn = 0;
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4, u = use ? use[y * w + x] : 1;
      row += u * (0.299 * img.data[j] + 0.587 * img.data[j + 1] + 0.114 * img.data[j + 2]); rn += u;
      I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row; N[(y + 1) * W1 + x + 1] = N[y * W1 + x + 1] + rn;
    }
  }
  return { I, N, w, h };
}
// the mean of the unmasked pixels in a box of radius r, null when under half are
function boxMean(ig, x, y, r) {
  const x0 = Math.max(0, Math.round(x - r)), y0 = Math.max(0, Math.round(y - r));
  const x1 = Math.min(ig.w, Math.round(x + r + 1)), y1 = Math.min(ig.h, Math.round(y + r + 1));
  if (x1 <= x0 || y1 <= y0) return null;
  const W1 = ig.w + 1;
  const n = ig.N[y1 * W1 + x1] - ig.N[y0 * W1 + x1] - ig.N[y1 * W1 + x0] + ig.N[y0 * W1 + x0];
  if (!(n > 0.5 * (x1 - x0) * (y1 - y0))) return null;
  return (ig.I[y1 * W1 + x1] - ig.I[y0 * W1 + x1] - ig.I[y1 * W1 + x0] + ig.I[y0 * W1 + x0]) / n;
}

// The capture stack of a hole as the registration reads it: { S, V } are the
// stack and its var.png (null: every pixel counts as art).
export function stackIndex(S, V = null) {
  let use = null;
  if (V) { use = new Uint8Array(S.width * S.height); for (let p = 0; p < use.length; p++) use[p] = V.data[p * 4] < VAR_ART ? 1 : 0; }
  return integral(S, use);
}

// What the frame's overlays cover, as a mask of usable pixels: the aim line,
// white (dots, rims, labels), the yellow marks, the flag, near-black (the cup,
// outlines), each grown 2 px; the dial and the label under it; the portrait
// below the pointer (it sits up to 19 px below and 13 px aside of it).
function frameUse(panel, marks) {
  const w = panel.width, h = panel.height, use = new Uint8Array(w * h).fill(1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = px(panel, x, y);
    if (!(isAimCyan(p) || Math.min(p[0], p[1], p[2]) > 185 || isPointerYellow(p) || isFlagPink(p) || Math.max(p[0], p[1], p[2]) < 40)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h) use[Y * w + X] = 0;
    }
  }
  const r = 0.15 * w, cy = 0.822 * h;
  for (const cx of marks.dial == null ? [0.168 * w, 0.832 * w] : [marks.dial])
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r || (Math.abs(x - cx) < r && y > cy)) use[y * w + x] = 0;
  if (marks.tri)
    for (let y = Math.round(marks.tri.y - 6); y < marks.tri.y + 34; y++)
      for (let x = Math.round(marks.tri.x - 22); x < marks.tri.x + 22; x++)
        if (x >= 0 && y >= 0 && x < w && y < h) use[y * w + x] = 0;
  return use;
}

// Pearson correlation of the frame's art against the stack's under a
// similarity (frame = zoom x map + (tx, ty)): the frame sampled every STEP px,
// each sample a box mean of radius BOX_R map px (BOX_R x zoom in the frame),
// so the two sides average the same ground. The blur keeps the fairway's
// mowing stripes and the green's checker, which alias when rescaled, out of
// the match; the bunkers, trees, water and the course's outline drive it.
const STEP = 3, BOX_R = 2, MIN_SAMPLES = 50;
function corr(fi, si, z, tx, ty) {
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
  for (let v = 2; v < fi.h - 2; v += STEP) for (let u = 2; u < fi.w - 2; u += STEP) {
    const mx = (u - tx) / z, my = (v - ty) / z;
    if (mx < 1 || my < 1 || mx > si.w - 2 || my > si.h - 2) continue;
    const a = boxMean(fi, u, v, BOX_R * z); if (a == null) continue;
    const b = boxMean(si, mx, my, BOX_R); if (b == null) continue;
    sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; n++;
  }
  if (n < MIN_SAMPLES) return -2;
  const cov = sab / n - (sa / n) * (sb / n), va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
  return cov / Math.sqrt(Math.max(va * vb, 1e-9));
}

// Pattern search on (zoom, tx, ty) from a start, steps shrinking: a 7x7x7
// grid at each of zoom 2 / 0.8 / 0.3 %, offset 3 / 1.5 / 0.5 px (moves of up to
// 6 % and 9 px). The best stays the start unless a probe beats it.
function refine(fi, si, s) {
  let cur = { ...s };
  for (const [dz, dt] of [[0.02, 3], [0.008, 1.5], [0.003, 0.5]]) {
    let best = cur;
    for (let kz = -3; kz <= 3; kz++) for (let kx = -3; kx <= 3; kx++) for (let ky = -3; ky <= 3; ky++) {
      const z = cur.z * (1 + (kz * dz) / 3), tx = cur.tx + kx * dt, ty = cur.ty + ky * dt;
      const r = corr(fi, si, z, tx, ty);
      if (r > best.r) best = { z, tx, ty, r };
    }
    cur = best;
  }
  return cur;
}

// The overview is the identity, and a frame whose art matches the stack there
// at OVERVIEW_R or better is one: the rows' 26 overview frames match at
// 0.90-0.99, their 13 zoomed ones at 0.16-0.77. Over all 362 map frames, 328
// match at 0.85 or better. Some overview frames match worse, where the 3D
// world behind the panel differs from the stack's (H8's island, 0.74-0.80 on
// its W17 round), so a frame whose pointer stands as far from its cup as its
// badge says (within BADGE_YD), and whose art matches at OVERVIEW_R_BADGE, is
// one too. The badge also vetoes: of the 147 overview frames with a pointer,
// a cup and a badge read, 139 put the pointer 0-5.5 yd further from the cup
// than the badge says (the cup reads up to 2 px north of its pin), and the
// other 8 are 20-600 yd off: six misread badges (819 for 219 on H17, 586 for
// 536 on H3, 564, 360, 367, 86) and two online frames of H18 whose pointer
// stands on the tee 460 yd out under a badge of 69 and 119. A registration
// is kept at MIN_R: the rows' zoomed frames refine to 0.91-0.99.
const OVERVIEW_R = 0.85, OVERVIEW_R_BADGE = 0.6, BADGE_YD = 12, MIN_R = 0.85;
// the cup's map position is searched over the WSR green box grown by this
// (map px; a pin sits inside the outline, the box holds it)
const GREEN_PAD = 4;
// a frame without the ball: its zoom is searched over [1.1, 6] in 3 % steps
const Z_LO = 1.1, Z_HI = 6, Z_STEP = 1.03;

const bearingOf = (dx, dy) => ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;

// panel (the 250x304 crop) + stack (stackIndex of the hole's capture stack) +
// { scale: yd per map px, green: the green box in map px, badgeYd: the
// frame's "yd to go" } -> { pos, aim, cup, zoom, offset, fit, how } with pos
// and cup in map px (pixel centres), aim in degrees N-up (0 = north,
// clockwise) or null, zoom / offset the similarity, fit its correlation, how
// "overview" / "zoomed" / "zoomed, ball off the panel"; or { pos: null, why }.
export function readAddressMap(panel, stack, { scale, green, badgeYd }) {
  const m = addressMarks(panel);
  const fi = integral(panel, frameUse(panel, m));
  const aimOf = () => (m.tri && m.dot ? bearingOf(m.dot.x - m.tri.x, m.dot.y - m.tri.y) : null);
  const rId = corr(fi, stack, 1, 0, 0);
  // the pointer's distance from the cup at the identity, against the badge
  const dId = m.tri && m.cup && badgeYd > 0 ? Math.hypot(m.tri.x - m.cup.x, m.tri.y - m.cup.y) * scale : null;
  if (rId >= OVERVIEW_R || (dId != null && Math.abs(dId - badgeYd) <= BADGE_YD && rId >= OVERVIEW_R_BADGE)) {
    if (!m.tri) return { pos: null, why: "overview frame without the ball's pointer", fit: +rId.toFixed(3) };
    if (dId != null && Math.abs(dId - badgeYd) > BADGE_YD)
      return { pos: null, why: `overview frame whose pointer stands ${dId.toFixed(0)} yd from the cup under a badge of ${badgeYd} yd`, fit: +rId.toFixed(3) };
    return { pos: m.tri, aim: aimOf(), cup: m.cup, zoom: 1, offset: { x: 0, y: 0 }, fit: +rId.toFixed(3), how: "overview" };
  }
  if (!m.cup) return { pos: null, why: "zoomed frame without the cup", fit: rId };
  if (!(badgeYd > 0)) return { pos: null, why: "zoomed frame without a yd-to-go badge", fit: rId };
  if (!green) return { pos: null, why: "no green box to search the cup over", fit: rId };
  // the cup's map position P over the green; the offset follows from the zoom
  const at = (z, P) => ({ z, tx: m.cup.x - z * P.x, ty: m.cup.y - z * P.y });
  const scan = (zs, stepPx) => {
    let best = null;
    for (const z of zs)
      for (let y = green.y0 - GREEN_PAD; y <= green.y1 + GREEN_PAD; y += stepPx)
        for (let x = green.x0 - GREEN_PAD; x <= green.x1 + GREEN_PAD; x += stepPx) {
          const s = at(z, { x, y }), r = corr(fi, stack, s.z, s.tx, s.ty);
          if (!best || r > best.r) best = { ...s, r };
        }
    return best;
  };
  let best, how;
  if (m.tri) {
    // the badge's distance spans |tri - cup| frame px
    best = scan([(Math.hypot(m.tri.x - m.cup.x, m.tri.y - m.cup.y) * scale) / badgeYd], 1);
    how = "zoomed";
  } else {
    const zs = [];
    for (let z = Z_LO; z <= Z_HI; z *= Z_STEP) zs.push(z);
    best = scan(zs, 2);
    how = "zoomed, ball off the panel";
  }
  best = refine(fi, stack, best);
  if (!(best.r >= MIN_R)) return { pos: null, why: `zoomed frame not registered (art correlation ${best.r.toFixed(2)})`, fit: +best.r.toFixed(3) };
  const toMap = (p) => ({ x: (p.x - best.tx) / best.z, y: (p.y - best.ty) / best.z });
  const cup = toMap(m.cup);
  let pos = null, aim = aimOf();
  if (m.tri) pos = toMap(m.tri);
  else if (m.dot && m.cyan.length >= 8) {
    // The ball is off the panel: it lies on the aim line, which runs from it
    // to the landing dot, badgeYd from the cup. The line's direction is the
    // cyan pixels' principal axis, pointed at the dot.
    const n = m.cyan.length;
    const mx = m.cyan.reduce((s, q) => s + q[0], 0) / n, my = m.cyan.reduce((s, q) => s + q[1], 0) / n;
    let sxx = 0, sxy = 0, syy = 0;
    for (const [x, y] of m.cyan) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let ux = Math.cos(th), uy = Math.sin(th);
    if ((m.dot.x - mx) * ux + (m.dot.y - my) * uy < 0) { ux = -ux; uy = -uy; }
    aim = bearingOf(ux, uy);
    // X(s) = dot - s u (map px), |X - cup| = badgeYd / scale, s > 0
    const d = toMap(m.dot), R = badgeYd / scale, ex = d.x - cup.x, ey = d.y - cup.y;
    const b = ex * ux + ey * uy, c = ex * ex + ey * ey - R * R, disc = b * b - c;
    if (disc >= 0 && b + Math.sqrt(disc) > 0) { const s = b + Math.sqrt(disc); pos = { x: d.x - s * ux, y: d.y - s * uy }; }
  }
  if (!pos) return { pos: null, why: "zoomed frame: the ball is off the panel and the aim line does not place it", fit: +best.r.toFixed(3) };
  return { pos, aim, cup, zoom: +best.z.toFixed(4), offset: { x: +best.tx.toFixed(2), y: +best.ty.toFixed(2) }, fit: +best.r.toFixed(3), how };
}
