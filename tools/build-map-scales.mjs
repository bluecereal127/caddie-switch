// Ship the hole maps at 3x and 4x beside the 2x bundle: src/maps.js carries
// each hole's render of WSR's own minimap model at 2x (500x608, base64 JPEG
// q78, tools/build-derived.mjs); this writes the same renders at 3x (750x912)
// and 4x (1000x1216) as plain JPEG files under public/maps/, which the app
// fetches only when its map-resolution setting asks for them. At 3x a 330 CSS
// px map on a 3x phone screen (990 device px) is upscaled 1.32x instead of
// 1.98x, and 4x is about one image px per device px there.
//
//   node tools/build-map-scales.mjs [--scales 3,4] [--render captures/derived/render-{s}x] [--out public/maps]
//        [--q 3:78,4:78] [--check captures/derived/render]
//
// Reads per scale s the directory --render names ({s} = the scale), which
//   node tools/render-maps.mjs --scale s --out captures/derived/render-<s>x --no-green
// writes (the green crops are not wanted here), and its index.json. Only the
// WSR art ships, as in build-derived: an entry whose art is not wsr / model
// (the renderer's cross-check arts write the same file names), whose trees are
// not the model's (the 2x bundle's), or whose map is not the 250x304 frame at
// that scale is refused: left out of public/maps/index.json with a warning,
// its file from an earlier run removed, so the app shows the 2x bundle image
// for that hole. Every file is written only after all are encoded.
//
// --check: each render and the 2x render build-derived ships from
// (captures/derived/render/hNN.png) are box-filtered to the map frame itself,
// 250x304, where every integer scale's px align (a 3x px straddles two 2x
// px), and compared. They are the same art sampled finer, so they agree to
// a fraction of a level (CHECK_MAD); a render left over from before a
// renderer change, or one of another hole, does not, and the log warns.
// Skipped when the 2x render is missing.
//
// Writes public/maps/hNN-3x.jpg, hNN-4x.jpg and index.json
// ({ scales, quality, holes: { n: { "3": { file, w, h, bytes, sha1 }, ... } } }).
// A --scales run of some scales keeps the others' files and entries.
// Deterministic: no timestamps, the same inputs give the same bytes. A JPEG
// does not gzip (the log gives both sizes); Netlify serves the files as they
// are.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import jpeg from "jpeg-js";
import { loadImage } from "./lib/image.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAP_W = 250, MAP_H = 304;
// JPEG quality per scale, q78 like the 2x bundle (build-derived's
// MAP_JPEG_Q). Measured 2026-10-20 over the 21 holes: 3x 2.93 MB at q78
// (100-196 KB per hole), 2.66 MB at q74, 2.42 MB at q70; 4x 4.61 MB at q78
// (154-317 KB), 4.18 MB at q74, 3.79 MB at q70; mean |d| per channel against
// the PNG 2.3 (3x) / 2.0 (4x) at q78, 2.6 / 2.3 at q70. Crops of H7, H9 and H12 at the phone's display size
// (a 330 CSS px map at 3 device px per CSS px, 990 px wide) cannot be told
// apart at q78, q74 or q70, nor from the PNG; the 4x total is under the 8 MB
// that would have called for the lower qualities, so both keep q78.
const JPEG_Q = { 3: 78, 4: 78 };
// The --check warning levels, at the map frame (250x304), per channel 0-255.
// Measured 2026-10-20 on all 21 holes: 3x against 2x a mean absolute
// difference of 0.15-0.19, 4x 0.14-0.19, the largest single difference
// 6-17 and at most 2 of the 76,000 px over 16 (H15 3x; the finer sampling
// moves texture detail and the sprites' alpha-tested edges a little). A
// changed class colour moves the mean; a changed region (H3's SEA_YIELDS
// corner alone is 374 map px) the share of px over CHECK_PX.
const CHECK_MAD = 1, CHECK_PX = 16, CHECK_PX_SHARE = 0.001;

const args = process.argv.slice(2);
const opt = { scales: [3, 4], render: join(ROOT, "captures/derived/render-{s}x"), out: join(ROOT, "public/maps"), q: { ...JPEG_Q }, check: join(ROOT, "captures/derived/render") };
const usage = "usage: node tools/build-map-scales.mjs [--scales 3,4] [--render captures/derived/render-{s}x] [--out public/maps] [--q 3:78,4:78] [--check captures/derived/render]";
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--scales") opt.scales = args[++i].split(",").map(Number);
  else if (a === "--render") opt.render = args[++i];
  else if (a === "--out") opt.out = args[++i];
  else if (a === "--q") for (const kv of args[++i].split(",")) { const [s, q] = kv.split(":").map(Number); opt.q[s] = q; }
  else if (a === "--check") opt.check = args[++i];
  else { console.error(`unknown argument ${a}\n${usage}`); process.exit(1); }
}
for (const s of opt.scales) {
  if (!Number.isInteger(s) || s < 3) { console.error(`--scales: ${s} is not an integer of 3 or more (2x is the bundle in src/maps.js)\n${usage}`); process.exit(1); }
  if (!(opt.q[s] >= 1 && opt.q[s] <= 100)) { console.error(`no JPEG quality for ${s}x (--q ${s}:78)\n${usage}`); process.exit(1); }
}
opt.scales.sort((a, b) => a - b);
const OUT = resolve(opt.out), CHECK = resolve(opt.check);
const rel = (p) => (relative(ROOT, p).startsWith("..") ? p : relative(ROOT, p).replace(/\\/g, "/"));
const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");
const nn = (n) => String(n).padStart(2, "0");

// Area-weighted resample of RGBA to w x h, the box filter the renderer's own
// downsample is: per output px the mean of the input px it covers (a partly
// covered px by the part it covers, should the factor not be an integer).
function boxResample(img, w, h) {
  const taps = (n, N) => Array.from({ length: n }, (_, o) => {
    const f = N / n, a = o * f, b = a + f, t = [];
    for (let i = Math.floor(a); i < Math.min(N, Math.ceil(b)); i++) t.push([i, (Math.min(b, i + 1) - Math.max(a, i)) / f]);
    return t;
  });
  const tx = taps(w, img.width), ty = taps(h, img.height);
  const row = new Float64Array(w * img.height * 3);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < w; x++) for (const [i, k] of tx[x]) for (let c = 0; c < 3; c++) row[(y * w + x) * 3 + c] += img.data[(y * img.width + i) * 4 + c] * k;
  const out = new Float64Array(w * h * 3);
  for (let y = 0; y < h; y++) for (const [j, k] of ty[y]) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) out[(y * w + x) * 3 + c] += row[(j * w + x) * 3 + c] * k;
  return out;
}
// both box-filtered to the map frame: the mean absolute difference per
// channel, the largest, and the share of px whose largest channel differs by
// more than CHECK_PX
function compareAtFrame(img, ref) {
  const a = boxResample(img, MAP_W, MAP_H), b = boxResample(ref, MAP_W, MAP_H), n = MAP_W * MAP_H;
  let sum = 0, big = 0, max = 0;
  for (let p = 0; p < n; p++) {
    let m = 0;
    for (let c = 0; c < 3; c++) { const e = Math.abs(a[p * 3 + c] - b[p * 3 + c]); sum += e; if (e > m) m = e; }
    if (m > CHECK_PX) big++;
    if (m > max) max = m;
  }
  return { mad: sum / (n * 3), max, over: big / n };
}

const holes = {}, refused = [], files = new Map(), keep = new Set();
const tot = {};
// A run of some scales keeps the other scales' entries from the existing
// index.json (as render-maps and build-terrain keep a --holes batch's
// neighbours), each only while its file is there with the SHA-1 recorded.
let prev = {};
try { prev = JSON.parse(readFileSync(join(OUT, "index.json"), "utf8")); } catch {}
const kept = (prev.scales ?? []).filter((s) => !opt.scales.includes(s));
for (const s of kept) for (const [n, byScale] of Object.entries(prev.holes ?? {})) {
  const e = byScale[s], f = e && join(OUT, e.file);
  if (e && existsSync(f) && sha1(readFileSync(f)) === e.sha1) { (holes[n] ??= {})[s] = e; keep.add(e.file); }
}
for (const s of opt.scales) {
  const dir = resolve(opt.render.replace("{s}", s));
  let idx;
  try { idx = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")); }
  catch { console.error(`${rel(dir)}/index.json is missing: render it first with node tools/render-maps.mjs --scale ${s} --out ${rel(dir)} --no-green`); process.exit(1); }
  tot[s] = { n: 0, bytes: 0, gz: 0 };
  for (let n = 1; n <= 21; n++) {
    const e = idx.holes?.[n], png = join(dir, `h${nn(n)}.png`);
    const art = e?.art ?? idx.art, mode = (e?.wsr ?? idx.wsr)?.mode ?? "model", trees = (e?.wsr ?? idx.wsr)?.trees ?? "model";
    let why = null;
    if (!e || !existsSync(png)) why = `no render (${rel(png)}${e ? "" : " / its index.json entry"})`;
    else if (art !== "wsr" || mode !== "model") why = `rendered with --art ${art ?? "unknown"}${art === "wsr" ? ` --wsr ${mode}` : ""} (the cross-check), not the WSR art`;
    else if (trees !== "model") why = `rendered with --trees ${trees}, not the model's sprites the 2x bundle has`;
    else if (e.map?.scale !== s || e.map.width !== MAP_W * s || e.map.height !== MAP_H * s) why = `index.json says ${e.map?.width}x${e.map?.height} at ${e.map?.scale}x, not ${MAP_W * s}x${MAP_H * s} at ${s}x`;
    const img = why ? null : loadImage(png);
    if (img && (img.width !== MAP_W * s || img.height !== MAP_H * s)) why = `the PNG is ${img.width}x${img.height}, not ${MAP_W * s}x${MAP_H * s}`;
    if (why) { refused.push(`H${n} ${s}x: ${why}; rerun node tools/render-maps.mjs --scale ${s} --out ${rel(dir)} --no-green --holes ${n}`); continue; }
    const enc = jpeg.encode({ data: img.data, width: img.width, height: img.height }, opt.q[s]).data;
    const file = `h${nn(n)}-${s}x.jpg`, gz = gzipSync(enc, { level: 9 }).length;
    files.set(file, enc);
    (holes[n] ??= {})[s] = { file, w: img.width, h: img.height, bytes: enc.length, sha1: sha1(enc) };
    tot[s].n++; tot[s].bytes += enc.length; tot[s].gz += gz;
    let check = "";
    const refPng = join(CHECK, `h${nn(n)}.png`);
    if (existsSync(refPng)) {
      const ref = loadImage(refPng);
      if (ref.width === MAP_W * 2 && ref.height === MAP_H * 2) {
        const c = compareAtFrame(img, ref);
        check = `; vs the 2x render at 250x304: mean |d| ${c.mad.toFixed(2)}, max ${c.max.toFixed(0)}, ${Math.round(c.over * MAP_W * MAP_H)} px over ${CHECK_PX}`;
        if (c.mad > CHECK_MAD || c.over > CHECK_PX_SHARE) console.warn(`H${n} ${s}x: it differs from ${rel(refPng)} by ${c.mad.toFixed(2)} per channel and on ${(100 * c.over).toFixed(2)}% of map px by more than ${CHECK_PX} (warning levels ${CHECK_MAD} and ${100 * CHECK_PX_SHARE}%): one of the two renders is stale or of another hole; rerun render-maps for both`);
      }
    }
    console.log(`H${n} ${s}x: ${img.width}x${img.height} -> ${file} ${enc.length} B JPEG q${opt.q[s]} (gzip ${gz} B)${check}`);
  }
}
for (const r of refused) console.warn(r);

// all encoded: write, then drop any hNN-Sx.jpg the index will not list (a
// refused entry's, or a kept scale's whose SHA-1 no longer matches), so the
// directory and its index say the same
mkdirSync(OUT, { recursive: true });
for (const [file, buf] of files) writeFileSync(join(OUT, file), buf);
for (const f of readdirSync(OUT)) if (/^h\d\d-\d+x\.jpg$/.test(f) && !files.has(f) && !keep.has(f)) { rmSync(join(OUT, f)); console.log(`removed ${rel(join(OUT, f))} (not in the index)`); }
const scales = [...opt.scales, ...kept.filter((s) => Object.values(holes).some((h) => h[s]))].sort((a, b) => a - b);
const index = {
  _note: "Hole maps at more than the 2x of the bundle (src/maps.js, 500x608), written by tools/build-map-scales.mjs from the renders of WSR's own minimap model (tools/render-maps.mjs --scale s): the same 250x304 map frame at s px per map px, so every fractional position in derived.json and the app's state places the same on any scale. holes[n][s] = the JPEG (file, relative to this index), its size in px, bytes and SHA-1; a hole or scale missing here has no file, and the app shows the 2x bundle image. quality: the JPEG quality per scale.",
  scales,
  quality: Object.fromEntries(scales.map((s) => [s, opt.scales.includes(s) ? opt.q[s] : prev.quality?.[s]])),
  mapW: MAP_W, mapH: MAP_H,
  holes,
};
writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 1) + "\n");
const kb = (v) => `${(v / 1024).toFixed(0)} KB`;
console.log(`wrote ${rel(OUT)}: ${opt.scales.map((s) => `${s}x ${tot[s].n} of 21 holes, ${kb(tot[s].bytes)} (gzip ${kb(tot[s].gz)}), q${opt.q[s]}`).join("; ")}${refused.length ? `; ${refused.length} refused (above)` : ""}${scales.length > opt.scales.length ? `; ${scales.filter((s) => !opt.scales.includes(s)).map((s) => `${s}x`).join(", ")} kept from index.json` : ""}`);
if (refused.length) process.exitCode = 1;
