// Median-stack the full-hole minimap frames into clean hole maps.
//   node tools/extract-maps.mjs
//
// Reads captures/classification.json, groups "map" frames per hole by play
// session (ULID timestamps; pin can move between sessions), stacks the LATEST
// session with >= 2 map frames. The aim line/dots move between frames so the
// per-pixel median erases them; the avatar (tee) and pin flag sit still so
// they survive — which is exactly how tee/flag positions are then measured.
// Scale = badge yardage / tee->flag pixel distance.
//
// Outputs: captures/derived/maps/hNN.png + captures/derived/maps.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage, savePng, px, onionInpaint } from "./lib/image.mjs";
import { panelRect, cropRect } from "./lib/panel.mjs";
import { sessions } from "./lib/ulid.mjs";
import { isOnline } from "./lib/online.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = `${ROOT}/captures/inbox/`;
const OUT = `${ROOT}/captures/derived/maps`;
mkdirSync(OUT, { recursive: true });

const manifest = JSON.parse(readFileSync(`${ROOT}/captures/classification.json`, "utf8"));

// how many tee frames may enter one hole's stack (chosen for aim diversity)
const POOL_MAX = 16;

const medianStack = (crops) => {
  const { width: w, height: h } = crops[0];
  const out = { width: w, height: h, data: Buffer.alloc(w * h * 4, 255) };
  const n = crops.length, vals = new Array(n);
  for (let i = 0; i < w * h * 4; i++) {
    if ((i & 3) === 3) { out.data[i] = 255; continue; }
    for (let k = 0; k < n; k++) vals[k] = crops[k].data[i];
    vals.sort((a, b) => a - b);
    out.data[i] = n & 1 ? vals[n >> 1] : (vals[n / 2 - 1] + vals[n / 2]) >> 1;
  }
  return out;
};

// Darken-stack: per pixel, copy the RGB of the frame with the LOWEST
// luminance (2nd-lowest for larger pools, to dodge dark outliers). The aim
// line/dots and the avatar are always BRIGHTER than the terrain they cover,
// so one clean frame at a pixel is enough to erase them — unlike the median,
// which keeps residue whenever 2 of 3 frames share the overlay.
const darkenStack = (crops, excludeMasks = null) => {
  const { width: w, height: h } = crops[0];
  const out = { width: w, height: h, data: Buffer.alloc(w * h * 4, 255), holes: new Uint8Array(w * h) };
  const n = crops.length;
  const lum = new Array(n), idx = new Array(n);
  for (let p = 0; p < w * h; p++) {
    const j = p * 4;
    let m = 0;
    for (let k = 0; k < n; k++) {
      if (excludeMasks && excludeMasks.masks[k] && excludeMasks.masks[k][p]) continue;
      const d = crops[k].data;
      lum[m] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
      idx[m] = k; m++;
    }
    let srcK;
    if (m === 0) {
      // every frame has an overlay here (all frames share one pin, or the
      // compass corner). Mark it a hole — the caller inpaints flag zones and
      // blits the compass — and lay down the farthest-own-flag frame's pixel
      // as a base underneath.
      out.holes[p] = 1;
      const x = p % w, y = (p / w) | 0;
      let best = 0, bd = -1;
      for (let k = 0; k < n; k++) {
        const f = excludeMasks?.flags?.[k];
        const d = f ? Math.hypot(x - f.x, y - f.y) : 0;
        if (d > bd) { bd = d; best = k; }
      }
      srcK = best;
    } else {
      // darkest (2nd-darkest in big pools) among the clean frames
      const pick = Math.min(m - 1, m >= 5 ? 1 : 0);
      for (let a = 1; a < m; a++) { const key = lum[a], kk = idx[a]; let b = a - 1;
        while (b >= 0 && lum[b] > key) { lum[b + 1] = lum[b]; idx[b + 1] = idx[b]; b--; }
        lum[b + 1] = key; idx[b + 1] = kk; }
      srcK = idx[pick];
    }
    const src = crops[srcK].data;
    out.data[j] = src[j]; out.data[j + 1] = src[j + 1]; out.data[j + 2] = src[j + 2]; out.data[j + 3] = 255;
  }
  return out;
};

// per-frame exclusion mask: that frame's own pin flag (bright pink cluster +
// pole below), its aim line, and its wind compass (whichever corner it sat
// in) — so those regions get sourced from frames where the overlay was
// elsewhere, and so they never count as "motion"
const overlayMask = (crop) => {
  const w = crop.width, h = crop.height;
  const mask = new Uint8Array(w * h);
  let flag = null;
  // Aim line: measured on real frames it is CYAN — samples run (49,239,249),
  // (55,235,255), (63,232,241) — with a white core and the white ball dot.
  // An all-channels-bright test misses it entirely (r is ~50), so match cyan
  // explicitly. Masking this matters more the MORE aims a pool covers: the
  // swept line is grass in most frames and line in a few, which reads as
  // motion and carves a strip out of the fairway (H10). Pale lake water sits
  // near (150,220,215), so the r<120 floor keeps water out of the mask.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = px(crop, x, y);
    const cyan = p[0] < 120 && p[1] > 215 && p[2] > 225;
    const white = Math.min(p[0], p[1], p[2]) > 185 && p[2] > 185;
    if (!cyan && !white && !isPointerYellow(p)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) mask[ny * w + nx] = 1;
    }
  }
  // Flag: the pink cloth's own bbox plus the pole hanging below it, dilated a
  // few px for the antialias halo. A fixed box was used here before; on
  // single-pin holes (where this becomes the inpaint hole) a box that wide
  // straddles green AND backdrop and the fill came out a gray smear.
  // Skip both dial corners: at 24+ mph the wind arrow is PINK, the same pink
  // as the flag, and this scan had no exclusion. On H16's 31 mph frames the
  // "flag" centroid came out as a blend of the real flag (127 px at y~78) and
  // the arrow (~190 px at y~250), landing at y=182 — empty grass. The cup
  // flood then seeded there, the real cup was never masked, and it survived
  // into the composite as the black blob that would not go away.
  const inDial = (x, y) => {
    const cy = CCY * h, rr = 0.16 * w;
    return (x - 0.832 * w) ** 2 + (y - cy) ** 2 < rr * rr ||
           (x - 0.168 * w) ** 2 + (y - cy) ** 2 < rr * rr;
  };
  let sx = 0, sy = 0, c = 0, bx0 = w, bx1 = -1, by0 = h, by1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (!inDial(x, y) && isFlagPink(px(crop, x, y))) {
      sx += x; sy += y; c++;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
  if (c >= 4) {
    flag = { x: sx / c, y: sy / c };
    // pole: dark/white column under the cloth, down to the pin base
    const px0 = Math.max(0, Math.round(flag.x) - 4), px1 = Math.min(w - 1, Math.round(flag.x) + 5);
    let poleBottom = by1;
    for (let y = by1; y < Math.min(h, by1 + 18); y++)
      for (let x = px0; x <= px1; x++) {
        const p = px(crop, x, y);
        const dark = Math.max(p[0], p[1], p[2]) < 80;
        const pale = Math.min(p[0], p[1], p[2]) > 170;
        if (dark || pale) { poleBottom = y; break; }
      }
    const PAD = 3;
    const x0 = Math.max(0, Math.min(bx0, px0) - PAD), x1 = Math.min(w - 1, Math.max(bx1, px1) + PAD);
    const y0 = Math.max(0, by0 - PAD), y1 = Math.min(h - 1, poleBottom + PAD);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mask[y * w + x] = 1;

    // THE CUP. This is why greens kept a black smear that got WORSE with
    // every new pin position: darkenStack keeps the darkest pixel at each
    // position, the cup is the blackest thing on the map, and the cup was
    // never masked — so every pin position a hole has ever seen painted its
    // own cup into the composite, and the blobs unioned. Flood the near-black
    // blob at the pole base (bounded, so it cannot run off into trees or the
    // panel edge) and dilate it past its antialiased rim.
    // Every near-black pixel within reach of the pole base, by RADIUS rather
    // than by connected flood: the cyan aim line runs straight through the
    // cup and bisects it, so a flood seeded on one lobe cannot cross to the
    // other (on H2 it reached 24 of 90 dark pixels and the rest survived as
    // the black blob). Nothing else on a green is this dark, so a plain
    // radius test is both simpler and complete.
    const isCupDark = (p) => Math.max(p[0], p[1], p[2]) < 95;
    const seedY = Math.min(h - 1, poleBottom), seedX = Math.round(flag.x);
    const CUP_R = 17, GROW = 3;
    for (let dy = -CUP_R; dy <= CUP_R; dy++) for (let dx = -CUP_R; dx <= CUP_R; dx++) {
      if (dx * dx + dy * dy > CUP_R * CUP_R) continue;
      const nx = seedX + dx, ny = seedY + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!isCupDark(px(crop, nx, ny))) continue;
      for (let gy = -GROW; gy <= GROW; gy++) for (let gx = -GROW; gx <= GROW; gx++) {
        const mx = nx + gx, my = ny + gy;
        if (mx >= 0 && my >= 0 && mx < w && my < h) mask[my * w + mx] = 1;
      }
    }
  }
  // compass (either corner)
  const r = CR * w, cy = CCY * h;
  for (const cx of [0.168 * w, 0.832 * w]) {
    let ring = 0;
    for (let a = 0; a < 36; a++) {
      const th = (a / 36) * 2 * Math.PI;
      for (let rr = r - 5; rr <= r + 3; rr++) {
        const x = Math.round(cx + rr * Math.cos(th)), y = Math.round(cy + rr * Math.sin(th));
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const p = px(crop, x, y);
        if (Math.min(p[0], p[1], p[2]) > 165) { ring++; break; }
      }
    }
    if (ring < 14) continue;
    for (let y = Math.max(0, cy - r - 4); y <= Math.min(h - 1, cy + r + 30); y++)
      for (let x = Math.max(0, cx - r - 6); x <= Math.min(w - 1, cx + r + 6); x++)
        mask[Math.round(y) * w + Math.round(x)] = 1;
  }
  return { mask, flag };
};

// centroid+extent of pixels matching a predicate, outside the wind dial. The
// dial lives INSIDE the panel, in whichever bottom corner avoids the hole
// (the player's portrait takes the other). Measured on the 361 map frames
// with a wind reading, its arrow is blue up to 11 mph (none at 0), LIME at
// 13-22 and PINK from 24. The lime arrow never passes isPointerYellow (its G
// runs 215-255, the avatar's 160-215; 0 hits in 78 frames), so it cannot be
// taken for the avatar. Two things on the dial can be taken for something
// else: the pink arrow is the flag's pink, and its 177-214 px outsize the
// cloth (87-144 px, median 130); and the orange landing dot at the end of
// the aim line passes isPointerYellow and can sit on the dial (7 frames,
// 9-34 px of it, e.g. H9 KZZM, H14 DDQ0; a centroid over every yellow pixel,
// which is what the stack's tee is, would move the tee tens of px). So the
// dial is always excluded. It was once excluded in the right corner only,
// which left left-dial holes' tees (and so their scales) tens of px off and
// scattered the tee-frame test; both corners were then masked, and dialMask
// below narrows that to the dial's own corner.
const inCompass = (img, x, y) => {
  const cy = 0.822 * img.height, r = 0.14 * img.width;
  return (x - 0.832 * img.width) ** 2 + (y - cy) ** 2 < r * r ||
         (x - 0.168 * img.width) ** 2 + (y - cy) ** 2 < r * r;
};
// The wind dial as the panel draws it: a white ring of radius 0.082w (20.5 px
// at w=250) centred on (0.18w, 0.829h) in the left corner or (0.82w, 0.829h)
// in the right, fitted by brute force to the half pixel on 8 frames of either
// side. findCompassCorner (below; it also places the compass composite and
// must not change) samples radii 22-30 about (0.168w, 0.822h), which only
// grazes this ring: its winning corner scores 26-38 of 72 against a null cut
// of 25, so a small dip would silently bring the two-corner mask back. Scored
// on the ring itself (72 angles, radii r-2..r+2, the same brightness test),
// the dial's corner scores 68-72 on all 362 map frames and 69-71 on the 21
// stacks, the other corner 0-17 (bunker arcs, sand), so a corner is returned
// only at 50+ with a 25-point lead. Returns findCompassCorner's mask centre
// (0.168w / 0.832w) so the two interchange in dialMask.
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
// Mask only the corner the dial is in. Masking both clipped whatever sat near
// the other one: on holes 4, 11 and 14 the avatar stands on that circle's
// edge, so its triangle lost most of its pixels (or all of them) and its
// centroid moved 1-4 px. dialCorner decides; findCompassCorner if it abstains;
// both corners, with a warning, only when neither finds the ring (that
// re-clips those avatars).
const dialMask = (img, what = "frame") => {
  const cx = dialCorner(img) ?? findCompassCorner(img);
  if (cx == null) {
    console.warn(`${what}: wind dial not found, masking both bottom corners`);
    return (x, y) => inCompass(img, x, y);
  }
  const cy = 0.822 * img.height, r = 0.14 * img.width;
  return (x, y) => (x - cx) ** 2 + (y - cy) ** 2 < r * r;
};
const findCluster = (img, pred, masked = (x, y) => inCompass(img, x, y)) => {
  let sx = 0, sy = 0, c = 0, maxY = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      if (masked(x, y)) continue;
      const p = px(img, x, y);
      if (pred(p)) { sx += x; sy += y; c++; if (y > maxY) maxY = y; }
    }
  return c >= 4 ? { x: sx / c, y: sy / c, count: c, maxY } : null;
};
const isFlagPink = (p) => p[0] > 190 && p[2] > 120 && p[1] < 110 && p[0] - p[1] > 100;
// avatar direction pointer (bright yellow-orange triangle at the tee)
const isPointerYellow = (p) => p[0] > 225 && p[1] > 160 && p[1] < 215 && p[2] < 90;

// 4-connected blobs of a predicate outside the dial, largest first
const blobsOf = (img, pred, masked = (x, y) => inCompass(img, x, y)) => {
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
};
// Merge blobs whose bounding boxes lie within `gap` empty pixels of each
// other: n-weighted centroid, summed n, union box; largest first. A merged
// box is rescanned, so a chain of pieces joins up.
const mergeBlobs = (blobs, gap) => {
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
};

// The cup as the minimap draws it: a black ellipse ~15 px wide around the
// pole's foot. The pole's dark outline joins it to the cloth's outline, so
// only rows below the cloth whose dark span is at least 8 px wide (the
// ellipse body) count. Centre in pixel-centre coordinates: measured that
// way, tee-frame cups sit a mean (-0.2, -0.3) px from the WSR pin they show,
// mostly within 2 px, a few up to 3.5 px when the aim line or a shadow
// crosses the ellipse.
const cupCentre = (img, cloth, masked) => {
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
  return c ? { x: +(sx / c).toFixed(1), y: +(sy / c).toFixed(1) } : null;
};

// pin base: darkest pixels in a narrow column below the pink cloth
const pinBase = (img, flag) => {
  let best = null;
  const x0 = Math.max(0, Math.round(flag.x - 4)), x1 = Math.min(img.width - 1, Math.round(flag.x + 6));
  for (let y = Math.round(flag.y); y < Math.min(img.height, flag.maxY + 16); y++)
    for (let x = x0; x <= x1; x++) {
      const p = px(img, x, y);
      if (p[0] < 70 && p[1] < 70 && p[2] < 70) best = { x, y };
    }
  return best ?? { x: flag.x, y: flag.maxY + 8 };
};

// residue check: leftover aim-line pixels (bright cyan dots) in a stacked
// map mean the session's frames shared an aim and the median kept the line
const aimResidue = (img) => {
  let c = 0;
  const cx = 0.832 * img.width, cy = 0.822 * img.height, r = 0.15 * img.width;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) continue; // compass
      const p = px(img, x, y);
      if (p[2] > 235 && p[1] > 210 && p[0] < 150) c++;
    }
  return c;
};

const prev = (() => {
  try { return JSON.parse(readFileSync(`${OUT}/../maps.json`, "utf8")).holes; } catch { return []; }
})();

// Compass policy (user's call): keep the game's own compass baked in. By
// default it's composited crisply from the single-session detection stack;
// the first time a 0-mph tee frame exists for a hole, that frame's compass
// rect is saved to captures/derived/compass0/ and locked in forever (same
// hole + same corner = identical background art, so the rect transplant is
// seamless). The flag is composited from the detection stack the same way,
// so pooled multi-pin stacks can't ghost it.
const CR = 0.108, CCY = 0.822;
function findCompassCorner(img) {
  const w = img.width, h = img.height, r = CR * w, cy = CCY * h;
  const score = (cx) => {
    let s = 0;
    for (let a = 0; a < 72; a++) {
      const th = (a / 72) * 2 * Math.PI;
      for (let rr = r - 5; rr <= r + 3; rr++) {
        const x = Math.round(cx + rr * Math.cos(th)), y = Math.round(cy + rr * Math.sin(th));
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const p = px(img, x, y);
        if (Math.min(p[0], p[1], p[2]) > 165) { s++; break; }
      }
    }
    return s;
  };
  const L = score(0.168 * w), R = score(0.832 * w);
  if (Math.max(L, R) < 25) return null;
  return L >= R ? 0.168 * w : 0.832 * w;
}
const compassRect = (img, cx) => {
  const w = img.width, h = img.height, r = CR * w, cy = CCY * h;
  return { x0: Math.max(0, Math.round(cx - r - 18)), y0: Math.max(0, Math.round(cy - r - 4)),
           x1: Math.min(w - 1, Math.round(cx + r + 18)), y1: Math.min(h - 1, Math.round(cy + r + 30)) };
};
const blitRect = (dst, src, rect, srcRect = null) => {
  const s = srcRect ?? rect;
  for (let y = 0; y <= rect.y1 - rect.y0; y++)
    for (let x = 0; x <= rect.x1 - rect.x0; x++) {
      const di = ((rect.y0 + y) * dst.width + rect.x0 + x) * 4;
      const si = ((s.y0 + y) * src.width + s.x0 + x) * 4;
      dst.data[di] = src.data[si]; dst.data[di + 1] = src.data[si + 1]; dst.data[di + 2] = src.data[si + 2];
    }
};
const C0DIR = `${OUT}/../compass0`;
mkdirSync(C0DIR, { recursive: true });
function lockedCompass(hole) {
  const id = `h${String(hole).padStart(2, "0")}`;
  try {
    const meta = JSON.parse(readFileSync(`${C0DIR}/${id}.json`, "utf8"));
    return { img: loadImage(`${C0DIR}/${id}.png`), rect: meta.rect };
  } catch {}
  // any 0-mph tee frame in the manifest locks this hole's compass now
  const zero = manifest.frames.find((f) => f.hole === hole && f.frameType === "map" && f.windMph === 0);
  if (!zero) return null;
  try {
    const src = loadImage(INBOX + zero.file);
    const crop = cropRect(src, panelRect(src));
    const cx = findCompassCorner(crop);
    if (cx == null) return null;
    const rect = compassRect(crop, cx);
    const tile = { width: rect.x1 - rect.x0 + 1, height: rect.y1 - rect.y0 + 1,
      data: Buffer.alloc((rect.x1 - rect.x0 + 1) * (rect.y1 - rect.y0 + 1) * 4, 255) };
    for (let y = 0; y < tile.height; y++)
      for (let x = 0; x < tile.width; x++) {
        const si = ((rect.y0 + y) * crop.width + rect.x0 + x) * 4, di = (y * tile.width + x) * 4;
        tile.data[di] = crop.data[si]; tile.data[di + 1] = crop.data[si + 1]; tile.data[di + 2] = crop.data[si + 2];
      }
    savePng(`${C0DIR}/${id}.png`, tile);
    writeFileSync(`${C0DIR}/${id}.json`, JSON.stringify({ rect, source: zero.file }));
    console.log(`H${hole}: locked 0-mph compass from ${zero.file}`);
    return { img: tile, rect };
  } catch { return null; }
}

const results = [];
for (let hole = 1; hole <= 21; hole++) {
  const allMaps = manifest.frames.filter((f) => f.hole === hole && f.frameType === "map");
  if (!allMaps.length) { console.log(`H${hole}: no map frames`); continue; }
  // TEE frames only: mid-round address frames also classify as "map" but
  // their avatar sits mid-fairway and their aim is wherever the player was
  // aiming — stacking those corrupts tee detection and can bake aim lines.
  //
  // Tee membership is decided by WHERE THE AVATAR STANDS, not by the badge.
  // The badge is OCR'd and a single misread used to poison the whole hole:
  // it set maxYd, maxYd set the threshold, and the threshold picked the pool.
  // Two real cases from the inbox — a putt reading "33.3 ft to go" came
  // through as "599 yd" on H18 (a 458yd hole), which both admitted a green
  // close-up into the stack and rejected the four genuine 458/459yd tee
  // frames; and H17's "219 yd" read as "819 yd", inflating its scale 3.7x.
  // The avatar's position is geometry, not text, so it cannot misread.
  // VETO green close-ups. When the player putts, the minimap zooms to the
  // green and the avatar pointer is still on screen, so the classifier calls
  // it "map" — but it is not a hole overview and must never join the stack.
  // Measured, the putting surface's grid checker fills the panel very
  // differently: hole overviews run 4.6-5.0% of the panel, real green
  // captures 9.5-10%, and H18's putt 12.7%. 7% splits them cleanly.
  const CHECKER_MAX = 0.07;
  // One decode per frame for the per-frame checks: the panel crop, and
  // whether the frame is online play (the shot timer sits outside the panel,
  // so it is read while the full frame is in hand). The stacks below load
  // their own crops and are untouched.
  const frameCache = new Map();
  const frameOf = (f) => {
    if (!frameCache.has(f.file)) {
      const img = loadImage(INBOX + f.file);
      frameCache.set(f.file, { c: cropRect(img, panelRect(img)), online: isOnline(img) });
    }
    return frameCache.get(f.file);
  };
  const checkerCache = new Map();
  const checkerFrac = (f) => {
    if (checkerCache.has(f.file)) return checkerCache.get(f.file);
    let frac = 0;
    try {
      const c = frameOf(f).c;
      const w = c.width, h = c.height, n = w * h;
      const lum = new Float32Array(n);
      for (let p = 0, j = 0; p < n; p++, j += 4) lum[p] = 0.299 * c.data[j] + 0.587 * c.data[j + 1] + 0.114 * c.data[j + 2];
      let t = 0;
      for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
        let lo = 1e9, hi = -1e9;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const v = lum[(y + dy) * w + x + dx];
          if (v < lo) lo = v; if (v > hi) hi = v;
        }
        const j = (y * w + x) * 4, r = c.data[j], g = c.data[j + 1], b = c.data[j + 2], rng = hi - lo;
        if (rng >= 34 && rng <= 70 && g > 120 && g > b + 25 && g >= r - 20) t++;
      }
      frac = t / n;
    } catch {}
    checkerCache.set(f.file, frac);
    return frac;
  };
  // The threshold has to be RELATIVE to the hole. A fixed 7% wiped out H6,
  // H11 and H19 completely: short holes are framed tighter, so the green
  // legitimately fills much more of their minimap. Within one hole, though, a
  // putting close-up is a stark outlier above the hole's own typical value.
  const fracs = allMaps.map(checkerFrac);
  const medFrac = [...fracs].sort((a, b) => a - b)[(fracs.length - 1) >> 1];
  const cut = Math.max(CHECKER_MAX, 1.8 * medFrac);
  const overviews = allMaps.filter((f) => checkerFrac(f) <= cut);
  const vetoed = allMaps.length - overviews.length;
  if (vetoed) console.log(`H${hole}: ${vetoed} green close-up(s) kept out of the map stack (checker > ${(100 * cut).toFixed(1)}%)`);

  // Robust hole length for the tee threshold. A lone inflated reading used to
  // set it directly: H17's "219 yd" OCR'd as "819" pushed the threshold to
  // 721 and would have thrown out every real tee frame. Drop readings far
  // above the median before taking the max.
  const ydsAll = overviews.map((f) => (f.badge ?? "").match(/^(\d+)\s*yd/))
    .filter(Boolean).map((m) => parseInt(m[1])).filter((v) => Number.isFinite(v) && v > 0);
  const lowerMedian = (a) => { const s = [...a].sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };
  let maxYd = 0;
  if (ydsAll.length) {
    const med = lowerMedian(ydsAll);
    const plausible = ydsAll.filter((v) => v <= 1.6 * med);
    maxYd = plausible.length ? Math.max(...plausible) : med;
  }
  const isTee = (f) => {
    if (/^Stroke 1$/.test(f.badge ?? "")) return true;
    const yd = parseInt(f.badge ?? "");
    return Number.isFinite(yd) && maxYd > 0 && yd >= 0.88 * maxYd;
  };
  const tees = overviews.filter(isTee);
  // Every tee frame on its own: where the avatar stands, where the cup is, the
  // frame's own badge, and whether it is online play. A stack hides that the
  // tee moves: local play tees off from the WSR start, online Survival Golf
  // from a platform up to ~12 yd away (tools/PINS.md). build-derived reads
  // these to count pin sightings and place the online tee.
  //
  // Picked by their own mode, not from `tees`: maxYd mixes local badges with
  // online ones, and the platform can play longer. On H4 it is 186 yd to the
  // WSR start's 170, so the local W13 round ("159 yd to go") fell under
  // 0.88*186 and was never read. A mode's tee length is the longest of its
  // own badges inside the hole-wide band (0.88*maxYd up to maxYd, so H17's
  // "819" stays out), not its own robust max: a mode can hold more mid-round
  // frames than tee frames (H18's online badges are 69, 119, 459, 459, whose
  // lower median would promote the 119-yd frame and drop both 459s). A mode
  // with no badge in the band keeps maxYd, so this only ever admits frames
  // the old rule refused. `tees` and the stacks are untouched, so the map
  // images cannot change.
  const badgeYd = (f) => { const m = (f.badge ?? "").match(/^(\d+)\s*yd/); return m ? parseInt(m[1]) : null; };
  const modeYd = (online) => {
    const own = overviews.filter((f) => frameOf(f).online === online).map(badgeYd)
      .filter((v) => v != null && v >= 0.88 * maxYd && v <= maxYd);
    return own.length ? Math.max(...own) : maxYd;
  };
  const teeYd = { local: modeYd(false), online: modeYd(true) };
  const isTeeFrame = (f) => {
    if (/^Stroke 1$/.test(f.badge ?? "")) return true;
    const yd = badgeYd(f), mx = frameOf(f).online ? teeYd.online : teeYd.local;
    return yd != null && mx > 0 && yd >= 0.88 * mx;
  };
  const teeFrames = overviews.filter(isTeeFrame).map((f) => {
    const { c, online } = frameOf(f);
    const masked = dialMask(c, f.file);
    const cloth = blobsOf(c, isFlagPink, masked)[0];
    // Avatar candidates, largest first; the consumer takes the one at the
    // teeing ground. Pixels at the edge of the isPointerYellow band break
    // 4-connectivity, so the triangle can come out as a body plus a tip (H11
    // QAW2: 37 px + 8 px, 4 px apart) and the tip was what stood nearest the
    // start; the pieces lie within 2 px of each other and nothing else yellow
    // comes within 9 px (the landing dot, 23 px off), so blobs whose boxes
    // are within 3 px are merged. Centroids in pixel-centre coordinates
    // (+0.5), the convention of cupCentre and of the WSR fractions, so
    // avatar-to-cup and avatar-to-start distances mix no conventions: on
    // the 161 local frames the avatar lands a mean (-0.17, -0.16) px from the
    // WSR start (plain indices put it at (-0.67, -0.65)). The triangle turns
    // with the aim, so a single frame's centroid wanders about 1.5 px around
    // the ball.
    const ptrs = mergeBlobs(blobsOf(c, isPointerYellow, masked), 3).filter((b) => b.n >= 6).slice(0, 4)
      .map((b) => ({ x: +(b.x + 0.5).toFixed(1), y: +(b.y + 0.5).toFixed(1), n: b.n }));
    return { file: f.file, yd: badgeYd(f), online, ptrs,
      cup: cloth && cloth.n >= 4 ? cupCentre(c, cloth, masked) : null };
  });
  const candidates = sessions(tees).filter((s) => s.length >= 2).reverse(); // latest first
  let use = null, stacked = null;
  for (const s of candidates) {
    const crops = s.map((f) => { const img = loadImage(INBOX + f.file); return cropRect(img, panelRect(img)); });
    const st = medianStack(crops);
    const res = aimResidue(st);
    if (res < 60) { use = s; stacked = st; break; }
    console.log(`H${hole}: session of ${s.length} rejected (aim residue ${res})`);
  }
  if (!stacked) {
    const old = prev.find((p) => p.hole === hole);
    if (old) { console.log(`H${hole}: keeping previous stack`); results.push({ ...old, teeFrames }); continue; }
    const fallback = sessions(tees.length ? tees : allMaps).pop();
    const crops = fallback.map((f) => { const img = loadImage(INBOX + f.file); return cropRect(img, panelRect(img)); });
    use = fallback; stacked = medianStack(crops);
  }

  const stackMask = dialMask(stacked, `H${hole} stack`);
  const flag = findCluster(stacked, isFlagPink, stackMask);
  const pin = flag ? pinBase(stacked, flag) : null;
  const tee = findCluster(stacked, isPointerYellow, stackMask);

  // IMAGE via darken-stack over a cross-session pool of tee frames —
  // erases aim line/dots and avatar wherever at least one frame is clean.
  // Detection (pin/tee/scale) stays on the single-session median above.
  //
  // The pool is chosen for AIM DIVERSITY, not recency. Both things that make
  // these maps clean — a clean pixel somewhere under every overlay, and the
  // motion signal that separates map art from the 3D world underneath — come
  // from frames whose aim differs. Nine consecutive frames from one session
  // are often nine near-identical views, so take the most recent frame and
  // then greedily add whichever remaining frame looks least like the ones
  // already picked (farthest-point selection on a downsampled signature).
  const poolOf = (frames) => {
    if (frames.length <= POOL_MAX) return frames;
    const sig = frames.map((f) => {
      const img = loadImage(INBOX + f.file), c = cropRect(img, panelRect(img));
      const SW = 32, SH = 39, s = new Float32Array(SW * SH);
      for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
        const sx = Math.floor(x * c.width / SW), sy = Math.floor(y * c.height / SH);
        const j = (sy * c.width + sx) * 4;
        s[y * SW + x] = 0.299 * c.data[j] + 0.587 * c.data[j + 1] + 0.114 * c.data[j + 2];
      }
      return s;
    });
    const dist = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length; };
    const picked = [frames.length - 1];
    while (picked.length < POOL_MAX) {
      let best = -1, bestD = -1;
      for (let i = 0; i < frames.length; i++) {
        if (picked.includes(i)) continue;
        let mn = Infinity;
        for (const k of picked) mn = Math.min(mn, dist(sig[i], sig[k]));
        if (mn > bestD) { bestD = mn; best = i; }
      }
      if (best < 0) break;
      picked.push(best);
    }
    return picked.sort((a, b) => a - b).map((i) => frames[i]);
  };
  const pool = poolOf(tees);
  const poolCrops = (pool.length >= 2 ? pool : use).map((f) => { const img = loadImage(INBOX + f.file); return cropRect(img, panelRect(img)); });
  const overlays = poolCrops.map(overlayMask);
  const image = darkenStack(poolCrops, { masks: overlays.map((o) => o.mask), flags: overlays.map((o) => o.flag) });

  // MOTION MAP: the panel composites the hole's map layer over the LIVE 3D
  // world, and aiming rotates the camera — so across pooled frames the world
  // behind the panel churns while the map layer is pixel-identical. Per-pixel
  // luma range over the pool therefore segments map-art from world far more
  // reliably than any color rule (dark OB rough and water are art and read as
  // static; a bright distant shore is world and reads as moving). Consumed by
  // matte-maps; the aim line and avatar also move, but they sit INSIDE the
  // art and get closed by the enclosed-region fill there.
  {
    const w = image.width, h = image.height;
    const vm = { width: w, height: h, data: Buffer.alloc(w * h * 4, 255) };
    const N = poolCrops.length;
    const L = poolCrops.map((c) => {
      const a = new Float32Array(w * h);
      for (let p = 0, j = 0; p < w * h; p++, j += 4)
        a[p] = 0.299 * c.data[j] + 0.587 * c.data[j + 1] + 0.114 * c.data[j + 2];
      return a;
    });
    // Plain range, no outlier rejection. Dropping "disagreeing" frames was
    // tried and is actively wrong here: when most of the pool shares one aim,
    // the median IS that aim, so the few frames that re-aimed — the only ones
    // carrying any motion signal — are exactly the ones flagged as outliers
    // (H1 lost 2 of 7 that way and went blind). A pool with a genuinely
    // misregistered frame instead reads as mostly-moving, and the hole falls
    // through to the override path.
    for (let p = 0; p < w * h; p++) {
      let lo = 1e9, hi = -1e9, m = 0;
      for (let k = 0; k < N; k++) {
        if (overlays[k].mask[p]) continue;
        const v = L[k][p];
        if (v < lo) lo = v; if (v > hi) hi = v; m++;
      }
      const v = m >= 2 ? Math.min(255, Math.round(hi - lo)) : 0;
      const j = p * 4;
      vm.data[j] = vm.data[j + 1] = vm.data[j + 2] = v;
    }
    savePng(`${OUT}/h${String(hole).padStart(2, "0")}.var.png`, vm);
  }
  // NO flag composite: the app draws pins itself. Where every pooled frame
  // shares one pin, the flag zone has no clean source — inpaint it from the
  // surrounding art; a second-pin upload replaces the fill with real pixels.
  // (A near-black backdrop transform was tried here and reverted — the
  // user prefers the game's native backdrop.)
  // compass: locked 0-mph patch when available, else the detection stack's own
  const corner = findCompassCorner(stacked);
  const locked = lockedCompass(hole);
  const cRect = locked?.rect ?? (corner != null ? compassRect(stacked, corner) : null);
  if (cRect) // compass zone is also all-excluded but gets blitted below — skip it
    for (let y = cRect.y0; y <= cRect.y1; y++)
      for (let x = cRect.x0; x <= cRect.x1; x++) image.holes[y * image.width + x] = 0;
  onionInpaint(image, image.holes);
  if (locked) {
    blitRect(image, locked.img, locked.rect, { x0: 0, y0: 0, x1: locked.img.width - 1, y1: locked.img.height - 1 });
  } else if (corner != null) {
    blitRect(image, stacked, compassRect(stacked, corner));
  }
  savePng(`${OUT}/h${String(hole).padStart(2, "0")}.png`, image);
  // detection copy (median stack, flag intact): the green→map projection in
  // build-derived correlates against the flag/hole darks the display art no
  // longer has — keep them available separately (not shipped; captures/ is
  // gitignored).
  savePng(`${OUT}/h${String(hole).padStart(2, "0")}.det.png`, stacked);
  // Hole length from the TEE frames' badges, cross-checked against geometry.
  // This used to take the first frame in the session carrying any "N yd"
  // badge, which on H18 was a mid-round "119 yd to go" — so a 458yd par 5 was
  // recorded as 119yd and its scale came out 0.546 instead of 2.103.
  // Tee badges still disagree when one is misread (H17 has both "223" and a
  // "219" that OCR'd as "819"), so the tie-break is physical: the panel frames
  // every hole to roughly fill it, so yards/px lands in a narrow band. A
  // candidate implying a scale outside that band is the misread one.
  const SCALE_LO = 0.7, SCALE_HI = 3.2;
  const d = pin && tee ? Math.hypot(pin.x - tee.x, pin.y - tee.y) : null;
  // prefer tee frames' own badges; if every tee frame said only "Stroke 1",
  // fall back to the hole's other overview frames and let the band decide
  const ydsOf = (list) => [...new Set(list
    .map((f) => (f.badge ?? "").match(/^(\d+)\s*yd/))
    .filter(Boolean).map((m) => parseInt(m[1])).filter((v) => Number.isFinite(v) && v > 0))];
  // Prefer the DETECTION SESSION's own badges: scale = yards / (tee->pin px),
  // and the pin px was measured from that session's stack. Pins move between
  // rounds, so a yardage borrowed from a session with the pin elsewhere
  // divides by the wrong distance.
  const teeYds = ydsOf(use).length ? ydsOf(use)
    : (ydsOf(tees).length ? ydsOf(tees) : ydsOf(overviews));
  let yards = null;
  if (teeYds.length) {
    const inBand = d ? teeYds.filter((v) => v / d >= SCALE_LO && v / d <= SCALE_HI) : teeYds;
    const pick = inBand.length ? inBand : teeYds;
    const s = [...pick].sort((a, b) => a - b);
    yards = s[(s.length - 1) >> 1]; // lower median: robust, and prefers the
                                    // smaller of two when a misread inflates
    if (d && inBand.length < teeYds.length)
      console.log(`H${hole}: ignored out-of-band tee badge(s) ${teeYds.filter((v) => !inBand.includes(v)).join(", ")} yd (would imply scale outside ${SCALE_LO}-${SCALE_HI})`);
  }
  const scale = (d && yards) ? +(yards / d).toFixed(3) : null; // yd per stacked-map px
  // record exactly which frames were consumed, so tools/frame-audit.mjs can
  // tell you why any given capture did or did not affect this hole's map
  results.push({ hole, frames: use.map((f) => f.file),
    pool: pool.map((f) => f.file),
    // where each pooled frame's own flag stood: distinct positions are what
    // let the stack source real art under a flag instead of inpainting it
    poolFlags: overlays.map((o) => o.flag ? { x: Math.round(o.flag.x), y: Math.round(o.flag.y) } : null),
    teeCandidates: tees.map((f) => f.file),
    teeFrames,
    mapFramesSeen: allMaps.map((f) => f.file),
    w: stacked.width, h: stacked.height,
    pin, tee: tee ? { x: +tee.x.toFixed(1), y: +tee.y.toFixed(1) } : null, yards, scaleYdPerPx: scale });
  console.log(`H${hole}: stacked ${use.length} frames; pin=${pin ? `${pin.x},${pin.y}` : "?"} tee=${tee ? `${Math.round(tee.x)},${Math.round(tee.y)}` : "?"} yards=${yards ?? "?"} scale=${scale ?? "?"}`);
}
writeFileSync(`${OUT}/../maps.json`, JSON.stringify({ panel: "1001,234..1251,538 @720p", holes: results }, null, 2));
console.log(`wrote ${results.length} stacked maps + maps.json`);
