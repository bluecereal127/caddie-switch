// PROTOTYPE — hole-cutout matte + 2x upscale for the stacked maps.
//   node tools/matte-maps.mjs [holes...]
//
// Mirrors the externally-validated order (Cloudinary upscale -> Canva
// background-remove, which beat the reverse): the RGB is lanczos-upscaled
// FIRST, the matte is computed at native res and upscaled bilinearly (which
// gives the soft edge), then the two are combined into an RGBA PNG.
//
// WHAT IS BACKDROP: the panel composites the hole's map layer over the LIVE
// 3D world, and aiming rotates the camera — so across the pooled frames the
// world behind the panel churns while the map layer is pixel-identical.
// extract-maps writes that per-pixel luma range as hNN.var.png and this tool
// mattes on it. Color rules were tried first and are NOT viable: dark OB
// rough and water are art but read as "dim", so every luma/saturation
// threshold either kept the world or ate the rough (H12's panel is ~all art;
// a per-hole Otsu split it down the middle). Motion gets both right.
//
// Outputs (captures/derived/matte-preview/, gitignored):
//   hNN.rgba.png   500x608 transparent cutout
//   hNN.white.png  500x608 composited on white (for eyeballing)
//   hNN.mask.png   250x304 debug: outside=blue tint, dropped islands=red
//   _sheet.png     every hole on white, 7 per row
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage, savePng, px, onionInpaint } from "./lib/image.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAPS = join(ROOT, "captures", "derived", "maps");
const OUT = join(ROOT, "captures", "derived", "matte-preview");
mkdirSync(OUT, { recursive: true });

// ---- tunables ----
const T_VAR = 20;          // luma range over the pool above which a pixel moved
const OPEN_R = 2;          // opening radius on the motion mask (kills aim lines)
const MIN_SEED = 600;      // px; only a moving region this big may seed the world
const GROW_TOL = 17;       // sum-|dRGB| the world may grow across per step
const G_MAX = 10;          // ...and only across SMOOTH pixels: world slabs are
                           // featureless, art carries stripes and outlines
const CLOSE_R = 2;         // closing radius on the finished cutout
const MIN_MOVING = 0.02;   // if less of the panel moved than this, the pool
                           // never changed aim — trust nothing, keep it whole
const FRAME = 3;           // px of panel chrome at the crop edge — always out
const RIM_DILATE = 2;      // px of dark rim reclaimed into the art
const MIN_ISLAND = 300;    // px; smaller detached art islands are dropped
const CORNER_Y = 0.70;     // detached islands below this height fraction...
const CORNER_X = [0.31, 0.69]; // ...and outside this x band are HUD -> drop

const clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : Math.round(v);

// ---- lanczos-3 2x upscale (RGB) ----
const lanczos = (x) => {
  if (x === 0) return 1;
  const ax = Math.abs(x);
  if (ax >= 3) return 0;
  const p = Math.PI * x;
  return 3 * Math.sin(p) * Math.sin(p / 3) / (p * p);
};
function up2(img) {
  const w = img.width, h = img.height, W = w * 2, H = h * 2;
  const tmp = new Float32Array(W * h * 3);
  for (let y = 0; y < h; y++) for (let X = 0; X < W; X++) {
    const sx = (X + 0.5) / 2 - 0.5, i0 = Math.floor(sx) - 2;
    let r = 0, g = 0, b = 0, ws = 0;
    for (let k = 0; k < 6; k++) {
      const xx = Math.min(w - 1, Math.max(0, i0 + k)), wt = lanczos(sx - (i0 + k));
      const j = (y * w + xx) * 4;
      r += wt * img.data[j]; g += wt * img.data[j + 1]; b += wt * img.data[j + 2]; ws += wt;
    }
    const o = (y * W + X) * 3;
    tmp[o] = r / ws; tmp[o + 1] = g / ws; tmp[o + 2] = b / ws;
  }
  const out = { width: W, height: H, data: Buffer.alloc(W * H * 4, 255) };
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const sy = (Y + 0.5) / 2 - 0.5, i0 = Math.floor(sy) - 2;
    let r = 0, g = 0, b = 0, ws = 0;
    for (let k = 0; k < 6; k++) {
      const yy = Math.min(h - 1, Math.max(0, i0 + k)), wt = lanczos(sy - (i0 + k));
      const o = (yy * W + X) * 3;
      r += wt * tmp[o]; g += wt * tmp[o + 1]; b += wt * tmp[o + 2]; ws += wt;
    }
    const j = (Y * W + X) * 4;
    out.data[j] = clamp(r / ws); out.data[j + 1] = clamp(g / ws); out.data[j + 2] = clamp(b / ws);
  }
  return out;
}

function unsharp(img, amount = 0.45) {
  const w = img.width, h = img.height, src = Buffer.from(img.data);
  const K = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    for (let c = 0; c < 3; c++) {
      let s = 0, ki = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++, ki++) {
        const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy));
        s += K[ki] * src[(yy * w + xx) * 4 + c];
      }
      const j = (y * w + x) * 4 + c, v = src[j];
      img.data[j] = clamp(v + amount * (v - s / 16));
    }
}

// ---- HUD (wind dial + "N mph" caption) ----
// Same white-ring corner detection extract-maps uses. The dial is scrubbed
// with a LOCAL median inpaint, not by mirroring the band above it: on H12 the
// dial sits over a lake and a mirror-fill dragged fairway down across the
// water. A local fill keeps whatever the dial was covering the right color.
const CR = 0.108, CCY = 0.822;
function compassCorner(img) {
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
  return L >= R ? "left" : "right";
}
function hudMask(img, side) {
  const w = img.width, h = img.height, n = w * h;
  const r = CR * w, cx = (side === "left" ? 0.168 : 0.832) * w, cy = CCY * h;
  const mask = new Uint8Array(n);
  // the dial: filled disk well beyond the white ring, so the arrow's tip and
  // the dial's drop shadow do not survive as crescents outside the fill
  const R = r + 11;
  for (let y = Math.max(0, Math.round(cy - R)); y <= Math.min(h - 1, Math.round(cy + R)); y++)
    for (let x = Math.max(0, Math.round(cx - R)); x <= Math.min(w - 1, Math.round(cx + R)); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= R * R) mask[y * w + x] = 1;
  // The caption: white glyph pixels in the band under the dial, dilated for
  // their dark outline (a whole-band rect would erase real art around them).
  // "Pale" alone is not enough — a pale cyan lake or tan bunker under the
  // caption gets masked and inpainted over with rough. The glyphs are NEUTRAL
  // white, terrain never is, so require low saturation too.
  const y0 = Math.round(cy + r * 0.6);
  for (let y = y0; y < h; y++)
    for (let x = Math.max(0, Math.round(cx - 0.22 * w)); x <= Math.min(w - 1, Math.round(cx + 0.22 * w)); x++) {
      const p = px(img, x, y);
      const mn = Math.min(p[0], p[1], p[2]), mx = Math.max(p[0], p[1], p[2]);
      if (mn < 150 || mx - mn > 28) continue;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) mask[ny * w + nx] = 1;
      }
    }
  return mask;
}

// square-kernel morphology on a 0/1 mask
function morph(mask, w, h, r, op) {
  if (r <= 0) return mask;
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = op === "erode" ? 1 : 0;
    for (let dy = -r; dy <= r && (op === "erode" ? v : !v); dy++)
      for (let dx = -r; dx <= r; dx++) {
        const nx = Math.min(w - 1, Math.max(0, x + dx)), ny = Math.min(h - 1, Math.max(0, y + dy));
        const m = mask[ny * w + nx];
        if (op === "erode") { if (!m) { v = 0; break; } } else if (m) { v = 1; break; }
      }
    out[y * w + x] = v;
  }
  return out;
}
const open = (m, w, h, r) => morph(morph(m, w, h, r, "erode"), w, h, r, "dilate");
const close = (m, w, h, r) => morph(morph(m, w, h, r, "dilate"), w, h, r, "erode");

function matte(img, motion0) {
  const w = img.width, h = img.height, n = w * h;
  const d = img.data;
  // Open the motion mask first: the aim line and its dots move too, and left
  // in they give the flood a 2px catwalk from the world straight into the
  // middle of the fairway, which carves the line out of the cutout.
  const motion = open(motion0, w, h, OPEN_R);
  // Sobel magnitude, used to keep the colour growth out of textured art
  const lum = new Float32Array(n), grad = new Float32Array(n);
  for (let p = 0, j = 0; p < n; p++, j += 4) lum[p] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    const gx = lum[p - w + 1] + 2 * lum[p + 1] + lum[p + w + 1] - lum[p - w - 1] - 2 * lum[p - 1] - lum[p + w - 1];
    const gy = lum[p + w - 1] + 2 * lum[p + w] + lum[p + w + 1] - lum[p - w - 1] - 2 * lum[p - w] - lum[p - w + 1];
    grad[p] = Math.hypot(gx, gy) / 4;
  }
  let movingPx = 0;
  for (let p = 0; p < n; p++) if (motion[p]) movingPx++;
  const art = new Uint8Array(n).fill(1), dropped = new Uint8Array(n);
  const frac = movingPx / n;
  // The pool never changed aim (or there was only one frame): the world would
  // read as static too, so a cutout here would be a guess. Keep the panel.
  if (frac < MIN_MOVING) return { art, dropped, frac, whole: true };

  // Only a SUBSTANTIAL moving region may seed the world. Stray movers — a
  // couple of aim-line dots clipped by the panel edge, sensor noise — would
  // otherwise open a door for the colour growth below and let it swallow a
  // hole whose map fills the whole panel (H12).
  const bigMover = new Uint8Array(n);
  {
    const seen = new Uint8Array(n);
    for (let p0 = 0; p0 < n; p0++) {
      if (!motion[p0] || seen[p0]) continue;
      const st = [p0], pix = [];
      seen[p0] = 1;
      while (st.length) {
        const q = st.pop(); pix.push(q);
        const x = q % w, y = (q / w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q2 = ny * w + nx;
          if (motion[q2] && !seen[q2]) { seen[q2] = 1; st.push(q2); }
        }
      }
      if (pix.length >= MIN_SEED) for (const p of pix) bigMover[p] = 1;
    }
  }

  // flood the moving world in from a ring just inside the panel's own chrome
  // (that pale rounded-rect band is static art and walls a border flood out)
  const outside = new Uint8Array(n), stack = [];
  const seed = (p) => { if (!outside[p]) { outside[p] = 1; stack.push(p); } };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (x < FRAME || y < FRAME || x >= w - FRAME || y >= h - FRAME) outside[y * w + x] = 1;
  for (let x = FRAME; x < w - FRAME; x++) {
    if (bigMover[FRAME * w + x]) seed(FRAME * w + x);
    if (bigMover[(h - 1 - FRAME) * w + x]) seed((h - 1 - FRAME) * w + x);
  }
  for (let y = FRAME; y < h - FRAME; y++) {
    if (bigMover[y * w + FRAME]) seed(y * w + FRAME);
    if (bigMover[y * w + w - 1 - FRAME]) seed(y * w + w - 1 - FRAME);
  }
  if (!stack.length) return { art, dropped, frac, whole: true };

  // Grow through motion OR local colour continuity. A big flat hillside does
  // move, but nothing is visible moving INSIDE a uniform region, so motion
  // alone leaves rectangular slabs of world standing; continuity sweeps them,
  // and the map's dark rim is a large enough jump to stop it at the cutout.
  while (stack.length) {
    const p = stack.pop(), x = p % w, y = (p / w) | 0, j = p * 4;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (outside[q]) continue;
      const k = q * 4;
      const near = Math.abs(d[j] - d[k]) + Math.abs(d[j + 1] - d[k + 1]) + Math.abs(d[j + 2] - d[k + 2]) <= GROW_TOL;
      if (motion[q] || (near && grad[q] < G_MAX && grad[p] < G_MAX)) { outside[q] = 1; stack.push(q); }
    }
  }

  // keep the biggest static component plus any island big enough and not
  // parked in a HUD corner
  const comp = new Int32Array(n).fill(-1);
  const sizes = [], cents = [];
  for (let p = 0; p < n; p++) {
    if (outside[p] || comp[p] >= 0) continue;
    const id = sizes.length; let size = 0, sx = 0, sy = 0;
    const st = [p]; comp[p] = id;
    while (st.length) {
      const q = st.pop(); size++; sx += q % w; sy += (q / w) | 0;
      const x = q % w, y = (q / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q2 = ny * w + nx;
        if (!outside[q2] && comp[q2] < 0) { comp[q2] = id; st.push(q2); }
      }
    }
    sizes.push(size); cents.push([sx / size / w, sy / size / h]);
  }
  let bestId = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[bestId]) bestId = i;
  const keep = sizes.map((s, i) => {
    if (i === bestId) return true;
    if (s < MIN_ISLAND) return false;
    const [cx, cy] = cents[i];
    return cy < CORNER_Y || (cx > CORNER_X[0] && cx < CORNER_X[1]);
  });
  art.fill(0);
  for (let p = 0; p < n; p++) {
    if (comp[p] < 0) continue;
    if (keep[comp[p]]) art[p] = 1; else dropped[p] = 1;
  }

  // close everything the cutout encloses — the aim line, its dots and the
  // avatar move too, but they are drawn ON the map, so they punch interior
  // holes that must be sealed back up
  const reach = new Uint8Array(n), st2 = [];
  const seed2 = (p) => { if (!art[p] && !reach[p]) { reach[p] = 1; st2.push(p); } };
  for (let x = 0; x < w; x++) { seed2(x); seed2((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed2(y * w); seed2(y * w + w - 1); }
  while (st2.length) {
    const p = st2.pop(), x = p % w, y = (p / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      seed2(ny * w + nx);
    }
  }
  for (let p = 0; p < n; p++) if (!art[p] && !reach[p] && !dropped[p]) art[p] = 1;

  // seal any thin channel the growth still cut into the art
  const closed = close(art, w, h, CLOSE_R);
  for (let p = 0; p < n; p++) if (closed[p] && !dropped[p]) art[p] = 1;

  // reclaim a sliver of the dark rim so the cutout keeps its outline
  for (let it = 0; it < RIM_DILATE; it++) {
    const grow = [];
    for (let p = 0; p < n; p++) {
      if (art[p] || dropped[p]) continue;
      const x = p % w, y = (p / w) | 0;
      let adj = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && art[ny * w + nx]) { adj = true; break; }
      }
      if (adj) grow.push(p);
    }
    for (const p of grow) art[p] = 1;
  }
  return { art, dropped, frac, whole: false };
}

const holes = process.argv.slice(2).map(Number).filter(Boolean);
const list = holes.length ? holes : Array.from({ length: 21 }, (_, i) => i + 1);
const sheet = [];
for (const hole of list) {
  const id = `h${String(hole).padStart(2, "0")}`;
  let img, varImg = null;
  try { img = loadImage(join(MAPS, `${id}.png`)); } catch { continue; }
  try { varImg = loadImage(join(MAPS, `${id}.var.png`)); } catch {}
  const w = img.width, h = img.height, n = w * h;

  // Scrub the HUD before anything else: where the dial sits over the world
  // the matte deletes it anyway, but on holes whose art reaches the panel
  // floor it is welded to the art and no island rule can drop it.
  // (Once this ships the app draws its own N-up wind dial instead.)
  const side = compassCorner(img);
  const hud = side ? hudMask(img, side) : null;
  if (hud) {
    onionInpaint(img, hud);
    // Soften the fill. Whatever the dial covered is genuinely unknown — no
    // frame ever shows it — so the fill is invention either way; the peel's
    // two fronts (pale water on one side, dark rough on the other) otherwise
    // meet in a hard wedge, which reads as a defect. Blurred, it reads as
    // out-of-focus terrain.
    for (let pass = 0; pass < 3; pass++) {
      const src = Buffer.from(img.data);
      for (let p = 0; p < n; p++) {
        if (!hud[p]) continue;
        const x = p % w, y = (p / w) | 0;
        let r0 = 0, g0 = 0, b0 = 0, c = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = (ny * w + nx) * 4;
          r0 += src[k]; g0 += src[k + 1]; b0 += src[k + 2]; c++;
        }
        const j = p * 4;
        img.data[j] = Math.round(r0 / c); img.data[j + 1] = Math.round(g0 / c); img.data[j + 2] = Math.round(b0 / c);
      }
    }
  }

  const motion = new Uint8Array(n);
  if (varImg) for (let p = 0; p < n; p++) motion[p] = varImg.data[p * 4] >= T_VAR ? 1 : 0;
  // the dial's arrow and the caption digits change frame to frame; that churn
  // is HUD, not world, and it would otherwise carve a bite out of the art
  if (hud) for (let p = 0; p < n; p++) if (hud[p]) motion[p] = 0;

  const { art, dropped, frac, whole } = matte(img, motion);

  const dbg = { width: w, height: h, data: Buffer.from(img.data) };
  for (let p = 0, j = 0; p < n; p++, j += 4) {
    if (dropped[p]) { dbg.data[j] = 255; dbg.data[j + 1] = 40; dbg.data[j + 2] = 40; }
    else if (!art[p]) { dbg.data[j] = dbg.data[j] * 0.25; dbg.data[j + 1] = dbg.data[j + 1] * 0.25; dbg.data[j + 2] = Math.min(255, dbg.data[j + 2] * 0.4 + 120); }
  }
  savePng(join(OUT, `${id}.mask.png`), dbg);

  const big = up2(img);
  unsharp(big);
  const W = w * 2, H = h * 2;
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const sx = Math.min(w - 1, Math.max(0, (X + 0.5) / 2 - 0.5));
    const sy = Math.min(h - 1, Math.max(0, (Y + 0.5) / 2 - 0.5));
    const x0 = Math.floor(sx), y0 = Math.floor(sy);
    const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const fx = sx - x0, fy = sy - y0;
    const a = (art[y0 * w + x0] * (1 - fx) + art[y0 * w + x1] * fx) * (1 - fy)
            + (art[y1 * w + x0] * (1 - fx) + art[y1 * w + x1] * fx) * fy;
    big.data[(Y * W + X) * 4 + 3] = clamp(a * 255);
  }
  savePng(join(OUT, `${id}.rgba.png`), big);

  const white = { width: W, height: H, data: Buffer.alloc(W * H * 4, 255) };
  for (let p = 0, j = 0; p < W * H; p++, j += 4) {
    const a = big.data[j + 3] / 255;
    white.data[j] = clamp(big.data[j] * a + 255 * (1 - a));
    white.data[j + 1] = clamp(big.data[j + 1] * a + 255 * (1 - a));
    white.data[j + 2] = clamp(big.data[j + 2] * a + 255 * (1 - a));
  }
  savePng(join(OUT, `${id}.white.png`), white);
  sheet.push({ hole, art, img, w, h });
  const artPx = art.reduce((s, v) => s + v, 0);
  console.log(`H${hole}: art ${(100 * artPx / n).toFixed(1)}%  moving ${(100 * frac).toFixed(1)}%${whole ? "  [pool never re-aimed: kept whole]" : ""}`);
}

// contact sheet: every cutout on white, native res, 7 per row
if (sheet.length > 1) {
  const COLS = 7, CW = sheet[0].w, CH = sheet[0].h;
  const rows = Math.ceil(sheet.length / COLS);
  const S = { width: COLS * CW, height: rows * CH, data: Buffer.alloc(COLS * CW * rows * CH * 4, 255) };
  sheet.forEach((c, i) => {
    const ox = (i % COLS) * CW, oy = ((i / COLS) | 0) * CH;
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
      const p = y * c.w + x, si = p * 4, di = ((oy + y) * S.width + ox + x) * 4;
      const on = c.art[p], edge = x < 1 || y < 1;
      S.data[di] = edge ? 225 : on ? c.img.data[si] : 255;
      S.data[di + 1] = edge ? 225 : on ? c.img.data[si + 1] : 255;
      S.data[di + 2] = edge ? 225 : on ? c.img.data[si + 2] : 255;
    }
  });
  savePng(join(OUT, "_sheet.png"), S);
  console.log(`sheet: ${S.width}x${S.height}`);
}
