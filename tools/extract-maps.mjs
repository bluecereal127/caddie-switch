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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = `${ROOT}/captures/inbox/`;
const OUT = `${ROOT}/captures/derived/maps`;
mkdirSync(OUT, { recursive: true });

const manifest = JSON.parse(readFileSync(`${ROOT}/captures/classification.json`, "utf8"));

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
// pole below) and its wind compass (whichever corner it sat in) — so those
// regions get sourced from frames where the overlay was elsewhere
const overlayMask = (crop) => {
  const w = crop.width, h = crop.height;
  const mask = new Uint8Array(w * h);
  let flag = null;
  // Flag: the pink cloth's own bbox plus the pole hanging below it, dilated a
  // few px for the antialias halo. A fixed box was used here before; on
  // single-pin holes (where this becomes the inpaint hole) a box that wide
  // straddles green AND backdrop and the fill came out a gray smear.
  let sx = 0, sy = 0, c = 0, bx0 = w, bx1 = -1, by0 = h, by1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (isFlagPink(px(crop, x, y))) {
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

// centroid+extent of pixels matching a predicate. The wind compass lives
// INSIDE the panel (bottom-right in map mode) and its arrow is yellow at
// 10-19 mph and pink at 20+ — the exact colors of the tee pointer and the
// flag — so that region is always excluded.
const inCompass = (img, x, y) => {
  const cx = 0.832 * img.width, cy = 0.822 * img.height, r = 0.14 * img.width;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r;
};
const findCluster = (img, pred) => {
  let sx = 0, sy = 0, c = 0, maxY = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      if (inCompass(img, x, y)) continue;
      const p = px(img, x, y);
      if (pred(p)) { sx += x; sy += y; c++; if (y > maxY) maxY = y; }
    }
  return c >= 4 ? { x: sx / c, y: sy / c, count: c, maxY } : null;
};
const isFlagPink = (p) => p[0] > 190 && p[2] > 120 && p[1] < 110 && p[0] - p[1] > 100;
// avatar direction pointer (bright yellow-orange triangle at the tee)
const isPointerYellow = (p) => p[0] > 225 && p[1] > 160 && p[1] < 215 && p[2] < 90;

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
  // Tee = badge "Stroke 1" or a yardage near the hole's full length.
  const maxYd = Math.max(...allMaps.map((f) => (f.badge?.match(/^(\d+) yd/) ?? [])[1] ?? 0).map(Number));
  const isTee = (f) => {
    if (!f.badge) return false;
    if (/^Stroke 1$/.test(f.badge)) return true;
    const yd = parseInt(f.badge);
    return Number.isFinite(yd) && maxYd > 0 && yd >= 0.88 * maxYd;
  };
  const tees = allMaps.filter(isTee);
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
    if (old) { console.log(`H${hole}: keeping previous stack`); results.push(old); continue; }
    const fallback = sessions(tees.length ? tees : allMaps).pop();
    const crops = fallback.map((f) => { const img = loadImage(INBOX + f.file); return cropRect(img, panelRect(img)); });
    use = fallback; stacked = medianStack(crops);
  }

  const flag = findCluster(stacked, isFlagPink);
  const pin = flag ? pinBase(stacked, flag) : null;
  const tee = findCluster(stacked, isPointerYellow);

  // IMAGE via darken-stack over a cross-session pool of tee frames —
  // erases aim line/dots and avatar wherever at least one frame is clean.
  // Detection (pin/tee/scale) stays on the single-session median above.
  const pool = tees.slice(-9);
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
  // badge yardage from any frame in the SAME session (map or green frames)
  const sameSession = manifest.frames.filter((f) => f.hole === hole);
  const inSess = sessions(sameSession).find((s) => s.some((f) => f.file === use[0].file)) ?? [];
  const ydFrame = inSess.find((f) => f.badge && /\d+\s*yd/.test(f.badge));
  const yards = ydFrame ? parseInt(ydFrame.badge) : null;
  let scale = null;
  if (pin && tee && yards) {
    const d = Math.hypot(pin.x - tee.x, pin.y - tee.y);
    scale = +(yards / d).toFixed(3); // yd per stacked-map pixel
  }
  results.push({ hole, frames: use.map((f) => f.file), w: stacked.width, h: stacked.height,
    pin, tee: tee ? { x: +tee.x.toFixed(1), y: +tee.y.toFixed(1) } : null, yards, scaleYdPerPx: scale });
  console.log(`H${hole}: stacked ${use.length} frames; pin=${pin ? `${pin.x},${pin.y}` : "?"} tee=${tee ? `${Math.round(tee.x)},${Math.round(tee.y)}` : "?"} yards=${yards ?? "?"} scale=${scale ?? "?"}`);
}
writeFileSync(`${OUT}/../maps.json`, JSON.stringify({ panel: "1001,234..1251,538 @720p", holes: results }, null, 2));
console.log(`wrote ${results.length} stacked maps + maps.json`);
