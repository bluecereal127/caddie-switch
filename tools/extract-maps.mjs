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

const results = [];
for (let hole = 1; hole <= 21; hole++) {
  const maps = manifest.frames.filter((f) => f.hole === hole && f.frameType === "map");
  if (!maps.length) { console.log(`H${hole}: no map frames`); continue; }
  const sess = sessions(maps).filter((s) => s.length >= 2);
  const use = sess.length ? sess[sess.length - 1] : sessions(maps).pop();
  const crops = use.map((f) => { const img = loadImage(INBOX + f.file); return cropRect(img, panelRect(img)); });
  const stacked = medianStack(crops);
  savePng(`${OUT}/h${String(hole).padStart(2, "0")}.png`, stacked);

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
