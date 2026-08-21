// PROTOTYPE — hole-cutout matte + 2x upscale for the stacked maps.
//   node tools/matte-maps.mjs [holes...]
//
// Mirrors the externally-validated order (Cloudinary upscale -> Canva
// background-remove, which beat the reverse): the RGB is lanczos-upscaled
// FIRST, the matte is computed on the sharp native-res image and upscaled
// bilinearly (giving the soft edge), then combined into an RGBA PNG.
//
// Matte idea: neither brightness nor saturation separates art from backdrop
// on its own, and no global threshold fits every hole:
//   H12/H8  backdrop L~72 S~0.55  vs art L~150 S~0.50   (luma splits it)
//   H20/H21 backdrop L~60 S~0.80  vs art L~130 S~0.55   (saturation splits it)
// The invariant is that the backdrop is the DIMMED live world — darker, and
// more saturated because the dimming overlay crushes one channel toward zero
// — while the minimap art is a bright pastel palette. So score both together
// (score = luma - W*sat) and threshold it per hole with Otsu: whichever cue
// carries the separation on that hole, the score inherits it. A border flood
// over low-score pixels leaves the cutout; the compass and "N mph" text are
// bright detached islands and get dropped by the island rules.
//
// Outputs (captures/derived/matte-preview/, gitignored):
//   hNN.rgba.png   500x608 transparent cutout
//   hNN.white.png  500x608 composited on white (for eyeballing)
//   hNN.mask.png   250x304 debug: outside=blue tint, dropped islands=red
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage, savePng, px, onionInpaint } from "./lib/image.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAPS = join(ROOT, "captures", "derived", "maps");
const OUT = join(ROOT, "captures", "derived", "matte-preview");
mkdirSync(OUT, { recursive: true });

// ---- tunables ----
const SAT_W = 90;          // weight of saturation in the art/backdrop score
const T_BIAS = -4;         // nudge off the Otsu split (negative = keep more art)
const FRAME = 3;           // px of panel chrome at the crop edge — always out
const RIM_DILATE = 2;      // px of dark rim reclaimed into the art
const MIN_ISLAND = 300;    // px; smaller detached art islands are dropped
const CORNER_Y = 0.70;     // detached islands below this height fraction...
const CORNER_X = [0.31, 0.69]; // ...and outside this x band are HUD -> drop

const clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
const lumaAt = (d, j) => 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];

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

function unsharp(img, amount = 0.5) {
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

// same white-ring score extract-maps uses to find the compass corner. The
// rect below also swallows the "N mph" caption, which sits directly under the
// dial — it runs to the panel floor.
const CR = 0.108, CCY = 0.822;
const hudRect = (img, side) => {
  const w = img.width, h = img.height, r = CR * w, cy = CCY * h;
  const cx = (side === "left" ? 0.168 : 0.832) * w;
  return { x0: Math.max(0, Math.round(cx - r - 20)), y0: Math.max(0, Math.round(cy - r - 6)),
           x1: Math.min(w - 1, Math.round(cx + r + 20)), y1: h - 1 };
};
// Fill a rect by mirroring the band directly above it. An onion inpaint over
// a rect this big smears into flat streaks; the HUD always sits on the panel
// floor, so the art above it is the same terrain and reflects in seamlessly.
const reflectFill = (img, r) => {
  const w = img.width, d = img.data;
  for (let y = r.y0; y <= r.y1; y++) {
    const sy = Math.max(0, 2 * r.y0 - 2 - y);
    for (let x = r.x0; x <= r.x1; x++) {
      const di = (y * w + x) * 4, si = (sy * w + x) * 4;
      d[di] = d[si]; d[di + 1] = d[si + 1]; d[di + 2] = d[si + 2];
    }
  }
};

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

function matte(img) {
  const w = img.width, h = img.height, n = w * h, d = img.data;
  const score = new Float32Array(n);
  for (let p = 0, j = 0; p < n; p++, j += 4) {
    const mx = Math.max(d[j], d[j + 1], d[j + 2]), mn = Math.min(d[j], d[j + 1], d[j + 2]);
    score[p] = lumaAt(d, j) - SAT_W * (mx ? (mx - mn) / mx : 0);
  }
  // Otsu over the interior only — the pale chrome frame is a fat outlier mode
  // that would drag the split up and eat the darker half of the art
  const inner = [];
  for (let y = FRAME; y < h - FRAME; y++) for (let x = FRAME; x < w - FRAME; x++) inner.push(score[y * w + x]);
  const lo = Math.min(...inner), hi = Math.max(...inner), span = Math.max(1, hi - lo);
  const hist = new Array(256).fill(0);
  for (const v of inner) hist[Math.min(255, Math.max(0, Math.round(255 * (v - lo) / span)))]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = -1, tBin = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = inner.length - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) { best = between; tBin = t; }
  }
  const thresh = lo + (tBin / 255) * span + T_BIAS;
  const dim = (p) => score[p] < thresh;

  // The crop's outermost pixels are the panel's own rounded-rect chrome — a
  // pale low-saturation band that reads as "art" and walls the flood out of
  // the picture entirely. Force it outside and seed from the ring just inside.
  const outside = new Uint8Array(n), stack = [];
  const seed = (p) => { if (!outside[p]) { outside[p] = 1; stack.push(p); } };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (x < FRAME || y < FRAME || x >= w - FRAME || y >= h - FRAME) outside[y * w + x] = 1;
  for (let x = FRAME; x < w - FRAME; x++) {
    if (dim(FRAME * w + x)) seed(FRAME * w + x);
    if (dim((h - 1 - FRAME) * w + x)) seed((h - 1 - FRAME) * w + x);
  }
  for (let y = FRAME; y < h - FRAME; y++) {
    if (dim(y * w + FRAME)) seed(y * w + FRAME);
    if (dim(y * w + w - 1 - FRAME)) seed(y * w + w - 1 - FRAME);
  }
  while (stack.length) {
    const p = stack.pop(), x = p % w, y = (p / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (!outside[q] && dim(q)) { outside[q] = 1; stack.push(q); }
    }
  }

  // candidate art = not outside; keep the biggest component and any island
  // that is big enough and not parked in a HUD corner
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
  const art = new Uint8Array(n), dropped = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    if (comp[p] < 0) continue;
    if (keep[comp[p]]) art[p] = 1; else dropped[p] = 1;
  }

  // enclosed non-art (rim shadows the flood never reached, pond interiors)
  // becomes art; anything border-reachable stays out
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
  return { art, outside, dropped, thresh };
}

const holes = process.argv.slice(2).map(Number).filter(Boolean);
const list = holes.length ? holes : Array.from({ length: 21 }, (_, i) => i + 1);
const sheet = [];
for (const hole of list) {
  const id = `h${String(hole).padStart(2, "0")}`;
  let img;
  try { img = loadImage(join(MAPS, `${id}.png`)); } catch { continue; }
  const w = img.width, h = img.height;

  // Strip the HUD first. Where the dial sits over the backdrop the matte
  // would delete it anyway, but on holes whose art reaches the corner (H13)
  // it is welded to the main component and no island rule can drop it — so
  // inpaint the whole dial+caption rect before anything else looks at pixels.
  // (Once this ships, the app draws its own N-up wind dial instead.)
  const side = compassCorner(img);
  if (side) reflectFill(img, hudRect(img, side));

  const { art, dropped, thresh } = matte(img);

  // debug view: outside tinted blue, dropped islands red
  const dbg = { width: w, height: h, data: Buffer.from(img.data) };
  for (let p = 0, j = 0; p < w * h; p++, j += 4) {
    if (dropped[p]) { dbg.data[j] = 255; dbg.data[j + 1] = 40; dbg.data[j + 2] = 40; }
    else if (!art[p]) { dbg.data[j] = dbg.data[j] * 0.25; dbg.data[j + 1] = dbg.data[j + 1] * 0.25; dbg.data[j + 2] = Math.min(255, dbg.data[j + 2] * 0.4 + 120); }
  }
  savePng(join(OUT, `${id}.mask.png`), dbg);

  // upscale RGB, bilinear-upscale the mask into a feathered alpha
  const big = up2(img);
  unsharp(big, 0.45);
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
  console.log(`H${hole}: art ${(100 * artPx / (w * h)).toFixed(1)}% of panel (t=${thresh.toFixed(0)})`);
}

// contact sheet: every cutout on white, native res, 7 per row — one image to
// eyeball the whole set for stragglers
if (sheet.length > 1) {
  const COLS = 7, CW = sheet[0].w, CH = sheet[0].h;
  const rows = Math.ceil(sheet.length / COLS);
  const S = { width: COLS * CW, height: rows * CH, data: Buffer.alloc(COLS * CW * rows * CH * 4, 255) };
  for (let i = 0; i < S.data.length; i += 4) S.data[i + 3] = 255;
  sheet.forEach((c, i) => {
    const ox = (i % COLS) * CW, oy = ((i / COLS) | 0) * CH;
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
      const p = y * c.w + x, si = p * 4, di = ((oy + y) * S.width + ox + x) * 4;
      const on = c.art[p];
      // 1px gutter grid so neighbouring holes stay visually separate
      const edge = x < 1 || y < 1;
      S.data[di] = edge ? 225 : on ? c.img.data[si] : 255;
      S.data[di + 1] = edge ? 225 : on ? c.img.data[si + 1] : 255;
      S.data[di + 2] = edge ? 225 : on ? c.img.data[si + 2] : 255;
    }
  });
  savePng(join(OUT, "_sheet.png"), S);
  console.log(`sheet: ${S.width}x${S.height}`);
}
