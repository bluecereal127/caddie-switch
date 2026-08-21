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
import { loadImage, savePng, px } from "./lib/image.mjs";
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

  // IMAGE from a cross-session pool (up to 9 newest tee frames): sessions
  // aim differently, so pooling scrubs aim-line/avatar ghosts that a single
  // 3-frame session can leave (2/3 agreement keeps a pixel). Flags may
  // differ per round and blur out — fine, the app draws pins itself.
  // Detection (pin/tee/scale) stays on the single-session stack above.
  let image = stacked;
  const pool = tees.slice(-9);
  if (pool.length >= 5) {
    const poolCrops = pool.map((f) => { const img = loadImage(INBOX + f.file); return cropRect(img, panelRect(img)); });
    const pooled = medianStack(poolCrops);
    if (aimResidue(pooled) < 60) image = pooled;
  }
  savePng(`${OUT}/h${String(hole).padStart(2, "0")}.png`, image);

  const flag = findCluster(stacked, isFlagPink);
  const pin = flag ? pinBase(stacked, flag) : null;
  const tee = findCluster(stacked, isPointerYellow);
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
