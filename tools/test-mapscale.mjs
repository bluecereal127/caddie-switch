// node tools/test-mapscale.mjs [repoRoot]
// Acceptance for the map-scale setting's reader (src/mapScale.js) against the
// committed public/maps (tools/build-map-scales.mjs):
//  1. mapScaleOf: 2, 3 and 4 kept, anything else (no key, a string, 5) is 2
//  2. index.json: NSS's art (art "nss", from tools/render-nss-maps.py's
//     renders; the WSR model's renders shipped until 2026-10-25), scales
//     [3, 4] in the 250x304 frame; every hole 1-21 has an entry at both, and
//     mapFileUrl gives /maps/<its file> for each
//  3. each file: on disk, the entry's bytes and SHA-1, a JPEG whose own
//     header (SOF) is the entry's w x h = 250s x 304s, the aspect of the 2x
//     bundle image (src/maps.js, 500x608), so a fractional position places
//     the same on all three; no hNN-Sx.jpg the index does not list
//  4. mapFileUrl refuses: 2x, a hole or scale the index lacks, an entry off
//     the frame, a file name with a path, no index
//  5. the loaders through stand-ins: loadMapIndex fetches once and shares it,
//     a missing file, a non-JSON body (the Vite dev server's index.html) and
//     a failed fetch give {} and are fetched again next time; preloadImage
//     loads a url once, a failure gives false and is tried again
//  6. when captures/derived/render-nss/index.json is there (git-ignored: the
//     renders exist only where the NSS RomFS is): every hole rendered as art
//     nss with the 2 m plaid at 2x, 3x and 4x in the frame, its green crop on
//     tools/nss-truth.json's greenBox exactly with margin 0.12 (the contract
//     tools/build-derived.mjs reads src/maps.js and src/greens.js through),
//     and the shipped 3x/4x files the JPEGs of those renders' sizes
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const M = await import(pathToFileURL(join(root, "src/mapScale.js")).href);
const DIR = join(root, "public/maps");
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL:", msg); } };

// a JPEG's size from its first SOF marker (baseline or progressive)
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  for (let p = 2; p + 9 < buf.length;) {
    if (buf[p] !== 0xff) return null;
    const m = buf[p + 1], len = buf.readUInt16BE(p + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(p + 7), h: buf.readUInt16BE(p + 5) };
    p += 2 + len;
  }
  return null;
}

// 1
ok([2, 3, 4].every((s) => M.mapScaleOf(s) === s), "mapScaleOf keeps 2, 3, 4");
ok([undefined, null, "3", 5, 1, 0, NaN, {}].every((v) => M.mapScaleOf(v) === 2), "mapScaleOf: anything else is 2");

// 2, 3
const index = JSON.parse(readFileSync(join(DIR, "index.json"), "utf8"));
ok(JSON.stringify(index.scales) === "[3,4]" && index.mapW === 250 && index.mapH === 304, `index: scales ${JSON.stringify(index.scales)}, frame ${index.mapW}x${index.mapH}`);
ok(index.art === "nss" && /render-nss-maps\.py/.test(index._note ?? ""), `index: art ${index.art}, not NSS's minimap (tools/render-nss-maps.py)`);
ok(index.quality?.[3] === 78 && index.quality?.[4] === 78, `index: JPEG quality ${JSON.stringify(index.quality)}, not q78 at both`);
const { HOLE_MAPS } = await import(pathToFileURL(join(root, "src/maps.js")).href);
const listed = new Set();
let n2x = 0, bytes = { 3: 0, 4: 0 };
for (let n = 1; n <= 21; n++) {
  const b2 = jpegSize(Buffer.from(HOLE_MAPS[n].split(",")[1], "base64"));
  ok(b2 && b2.w === 500 && b2.h === 608, `H${n} 2x bundle image is ${b2?.w}x${b2?.h}, not 500x608`);
  if (b2?.w === 500) n2x++;
  for (const s of [3, 4]) {
    const e = index.holes?.[n]?.[s];
    const url = M.mapFileUrl(index, n, s);
    ok(e && url === `/maps/${e.file}`, `H${n} ${s}x: mapFileUrl ${url}, entry ${e?.file}`);
    if (!e) continue;
    listed.add(e.file);
    let buf = null;
    try { buf = readFileSync(join(DIR, e.file)); } catch { ok(false, `H${n} ${s}x: ${e.file} missing`); continue; }
    bytes[s] += buf.length;
    ok(buf.length === e.bytes, `H${n} ${s}x: ${buf.length} bytes, index says ${e.bytes}`);
    ok(createHash("sha1").update(buf).digest("hex") === e.sha1, `H${n} ${s}x: SHA-1 differs from the index`);
    const d = jpegSize(buf);
    ok(d && d.w === e.w && d.h === e.h && d.w === 250 * s && d.h === 304 * s, `H${n} ${s}x: JPEG ${d?.w}x${d?.h}, entry ${e.w}x${e.h}, frame ${250 * s}x${304 * s}`);
    // the same aspect as the 2x image to the pixel: w/h = 500/608 exactly
    ok(d && b2 && d.w * b2.h === d.h * b2.w, `H${n} ${s}x: aspect differs from the 2x image`);
  }
}
const orphans = readdirSync(DIR).filter((f) => /^h\d\d-\dx\.jpg$/.test(f) && !listed.has(f));
ok(!orphans.length, `files the index does not list: ${orphans.join(", ")}`);
console.log(`maps: ${listed.size} files listed for 21 holes x [3, 4], ${n2x} 2x bundle images at 500x608; 3x ${bytes[3]} B, 4x ${bytes[4]} B`);

// 4
const e3 = index.holes[7][3];
ok(M.mapFileUrl(index, 7, 2) === null, "2x is the bundle's image, no file");
ok(M.mapFileUrl(index, 22, 3) === null && M.mapFileUrl(index, 7, 5) === null, "a hole or scale the index lacks");
ok(M.mapFileUrl({ holes: { 7: { 3: { ...e3, w: 500 } } } }, 7, 3) === null && M.mapFileUrl({ holes: { 7: { 3: { ...e3, h: 900 } } } }, 7, 3) === null, "an entry off the frame at its scale");
ok(["../h07-3x.jpg", "/h07-3x.jpg", "https://x/h07-3x.jpg", "", null].every((file) => M.mapFileUrl({ holes: { 7: { 3: { ...e3, file } } } }, 7, 3) === null), "a file name with a path, or none");
ok(M.mapFileUrl(null, 7, 3) === null && M.mapFileUrl({}, 7, 3) === null && M.mapFileUrl({ holes: {} }, 7, 3) === null, "no index, or an empty one");
ok(M.mapFileUrl(index, 7, 4, "/x/") === `/x/${index.holes[7][4].file}`, "base");

// 5
{
  const calls = [];
  const fetchFs = async (url) => {
    calls.push(url);
    if (url === "/t/index.json") return { ok: true, json: async () => JSON.parse(readFileSync(join(DIR, "index.json"), "utf8")) };
    if (url === "/html/index.json") return { ok: true, json: async () => JSON.parse("<!doctype html><html></html>") };
    return { ok: false, json: async () => ({}) };
  };
  const [a, b] = await Promise.all([M.loadMapIndex({ base: "/t/", fetch: fetchFs }), M.loadMapIndex({ base: "/t/", fetch: fetchFs })]);
  const c = await M.loadMapIndex({ base: "/t/", fetch: fetchFs });
  ok(a === b && b === c && a.holes?.[21]?.[4] && calls.filter((u) => u === "/t/index.json").length === 1, "loadMapIndex fetches once and shares it");
  for (const base of ["/none/", "/html/"]) {
    const x = await M.loadMapIndex({ base, fetch: fetchFs }), y = await M.loadMapIndex({ base, fetch: fetchFs });
    ok(JSON.stringify(x) === "{}" && JSON.stringify(y) === "{}" && calls.filter((u) => u === `${base}index.json`).length === 2, `${base}: {} and fetched again`);
    ok(M.mapFileUrl(x, 7, 3) === null, `${base}: no file from an empty index`);
  }
  ok(JSON.stringify(await M.loadMapIndex({ base: "/off/", fetch: async () => { throw new Error("offline"); } })) === "{}", "a failed fetch gives {}");

  const made = [];
  class FakeImage { set src(u) { made.push(u); this._s = u; queueMicrotask(() => (u.includes("bad") ? this.onerror?.() : this.onload?.())); } get src() { return this._s; } }
  const opt = { Image: FakeImage };
  const [p, q] = await Promise.all([M.preloadImage("/maps/h07-3x.jpg", opt), M.preloadImage("/maps/h07-3x.jpg", opt)]);
  ok(p === true && q === true && (await M.preloadImage("/maps/h07-3x.jpg", opt)) === true && made.filter((u) => u === "/maps/h07-3x.jpg").length === 1, "preloadImage loads a url once and shares it");
  ok((await M.preloadImage("/maps/bad.jpg", opt)) === false && (await M.preloadImage("/maps/bad.jpg", opt)) === false && made.filter((u) => u === "/maps/bad.jpg").length === 2, "a failed load gives false and is tried again");
  ok((await M.preloadImage("/maps/h08-3x.jpg", { Image: class { constructor() { throw new Error("no Image"); } } })) === false, "no Image constructor gives false");
}

// 6
{
  let rix = null;
  try { rix = JSON.parse(readFileSync(join(root, "captures/derived/render-nss/index.json"), "utf8")); } catch {}
  if (!rix) console.log("render-nss: captures/derived/render-nss/index.json not here (git-ignored), step 6 skipped");
  else {
    const truth = JSON.parse(readFileSync(join(root, "tools/nss-truth.json"), "utf8")).holes;
    let good = 0;
    for (let n = 1; n <= 21; n++) {
      const e = rix.holes?.[n], before = fails;
      ok(e?.art === "nss" && e?.plaid?.tileM === 2, `render-nss H${n}: art ${e?.art}, plaid tile ${e?.plaid?.tileM} m (want nss, 2 m)`);
      for (const s of [2, 3, 4]) {
        const m = e?.maps?.[s];
        ok(m && m.scale === s && m.width === 250 * s && m.height === 304 * s && m.file === (s === 2 ? `h${String(n).padStart(2, "0")}.png` : `h${String(n).padStart(2, "0")}-${s}x.png`), `render-nss H${n} ${s}x: ${JSON.stringify(m)}`);
        if (s > 2 && m) ok(index.holes?.[n]?.[s]?.w === m.width && index.holes[n][s].h === m.height, `H${n} ${s}x: the shipped JPEG is not the render's size`);
      }
      ok(e?.map?.file === e?.maps?.[2]?.file, `render-nss H${n}: map is not maps[2]`);
      const g = e?.green, tb = truth[n]?.greenBox;
      ok(g && tb && ["x0", "y0", "x1", "y1"].every((k) => g.box?.[k] === tb[k]) && g.margin === 0.12, `render-nss H${n}: green box ${JSON.stringify(g?.box)} margin ${g?.margin}, nss-truth ${JSON.stringify(tb)}`);
      ok(g && Math.abs(g.aspect - ((tb.x1 - tb.x0) * 250) / ((tb.y1 - tb.y0) * 304)) < 1e-4 && Math.abs(g.width / g.height - g.aspect) < 0.02, `render-nss H${n}: green aspect ${g?.aspect}, ${g?.width}x${g?.height}`);
      if (fails === before) good++;
    }
    console.log(`render-nss: ${good} of 21 holes art nss, 2 m plaid, 2x/3x/4x in the frame, green crop on nss-truth's box`);
  }
}

console.log(fails ? `${fails} FAILURES` : "all map-scale checks passed");
process.exit(fails ? 1 : 0);
