// Register OLD stored hole maps (src/maps.js, 219x270) onto the NEW stacked
// maps (captures/derived/maps/hNN.png, 250x304) so stored fractional
// positions (tree markers etc.) can migrate precisely in the mapV5 swap.
//   node tools/register-maps.mjs
// Model: newPx = oldPx * s + t per axis (sx, sy, tx, ty), scored by mean
// absolute grayscale difference. Outputs captures/derived/register.json with
// per-hole transforms in FRACTIONAL form plus a match score (lower=better);
// holes with poor scores fall back to plain fractional carry-over.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import { loadImage, toGray } from "./lib/image.mjs";
import { HOLE_MAPS } from "../src/maps.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const grayOf = (img) => ({ g: toGray(img), w: img.width, h: img.height });

function decodeDataUrl(url) {
  const b64 = url.slice(url.indexOf(",") + 1);
  const buf = Buffer.from(b64, "base64");
  const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
  return { width: img.width, height: img.height, data: Buffer.from(img.data) };
}

// score transform: for samples of old pixels, compare to new at mapped pos
function score(oldG, newG, sx, sy, tx, ty) {
  let sum = 0, n = 0;
  for (let y = 4; y < oldG.h - 4; y += 3)
    for (let x = 4; x < oldG.w - 4; x += 3) {
      const nx = Math.round(x * sx + tx), ny = Math.round(y * sy + ty);
      if (nx < 0 || ny < 0 || nx >= newG.w || ny >= newG.h) { sum += 60; n++; continue; }
      sum += Math.abs(oldG.g[y * oldG.w + x] - newG.g[ny * newG.w + nx]); n++;
    }
  return sum / n;
}

const out = {};
for (let hole = 1; hole <= 21; hole++) {
  const oldImg = decodeDataUrl(HOLE_MAPS[hole]);
  const newImg = loadImage(join(ROOT, "captures", "derived", "maps", `h${String(hole).padStart(2, "0")}.png`));
  const oldG = grayOf(oldImg), newG = grayOf(newImg);

  let best = { s: 1e9 };
  const consider = (sx, sy, tx, ty) => {
    const s = score(oldG, newG, sx, sy, tx, ty);
    if (s < best.s) best = { s, sx, sy, tx, ty };
  };
  // coarse
  for (let sx = 0.95; sx <= 1.3; sx += 0.05)
    for (let sy = 0.95; sy <= 1.3; sy += 0.05)
      for (let tx = -24; tx <= 24; tx += 6)
        for (let ty = -24; ty <= 24; ty += 6) consider(sx, sy, tx, ty);
  // fine around best
  const b0 = { ...best };
  for (let sx = b0.sx - 0.05; sx <= b0.sx + 0.05; sx += 0.01)
    for (let sy = b0.sy - 0.05; sy <= b0.sy + 0.05; sy += 0.01)
      for (let tx = b0.tx - 6; tx <= b0.tx + 6; tx += 1.5)
        for (let ty = b0.ty - 6; ty <= b0.ty + 6; ty += 1.5) consider(sx, sy, tx, ty);

  // fractional transform: fNew = (fOld * OW * sx + tx) / NW  etc.
  const good = best.s < 26;
  const fx = good ? { a: (oldImg.width * best.sx) / newImg.width, b: best.tx / newImg.width } : { a: 1, b: 0 };
  const fy = good ? { a: (oldImg.height * best.sy) / newImg.height, b: best.ty / newImg.height } : { a: 1, b: 0 };
  out[hole] = { score: +best.s.toFixed(1), good, fx, fy,
    px: { sx: best.sx, sy: best.sy, tx: best.tx, ty: best.ty } };
  console.log(`H${hole}: score=${best.s.toFixed(1)} ${good ? "OK " : "POOR (identity fallback)"} sx=${best.sx.toFixed(2)} sy=${best.sy.toFixed(2)} t=(${best.tx},${best.ty})`);
}
writeFileSync(join(ROOT, "captures", "derived", "register.json"), JSON.stringify(out, null, 2));
console.log("wrote register.json");
