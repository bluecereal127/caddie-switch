// Read every golf pin position straight from the WSR course placement files.
//
//   node tools/wsr-pins.mjs <archives-or-folders...> [--out tools/wsr-pins.json]
//
// Inputs: WSR golf course archives (.carc/.szs/.arc: Yaz0-compressed U8, e.g.
// WS2_glf_course_fc1.carc from the extracted disc), loose .pmp files, or folders
// holding either (searched recursively). Get them from the disc image with
// Dolphin (right-click the game -> Properties -> Filesystem -> extract) or
// `DolphinTool extract -i <game.rvz> -o <dir>`.
//
// Pins are NOT in the KCL collision: each course archive carries a PMP ("Pack
// MaP") object-placement file next to its KCL, holding the player start, every
// possible pin and the trees (Resort2OG README, github.com/kiwi515/Resort2OG).
// PMP layout (big-endian; wiki.tockdom.com/wiki/PMP_(File_Format), Resort2OG
// RPUtlMapData.h / RPUtlMapObject.h): magic "PMPF"; u16 object count at 0x10;
// u32 object-table offset at 0x40; 0x58-byte records: u16 group, u16 id, u32,
// f32[3] position at 0x08, f32[3] scale at 0x14, f32[9] rotation at 0x20, u32 at
// 0x44, u8[16] params at 0x48. Golf objects are group 0x0002: 0x0000 player
// start, 0x0001 hole (pin), 0x000A tee marker; group 0x000B is Frisbee Golf
// (start/goal), which must not be read as pins.
//
// Positions are in KCL units (the mesh frame), so tools/mesh-registration.json
// maps them into the app's 250x304 map frame. WSR's pin index (Caddie,
// github.com/PackProject/Caddie): 0-2 the "B" set, 3-5 the "A" set on holes
// 2-17, 0-2 on hole 1, 0 only on hole 18, 0-5 on the specials. This tool reports
// file order as the index; check it against a known pin before relying on A/B.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const opt = { out: "tools/wsr-pins.json", names: "tools/mesh-holes.json", registration: "tools/mesh-registration.json", truth: "tools/wsr-truth.json" };
const inputs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out") opt.out = args[++i];
  else inputs.push(args[i]);
}

// ---- Yaz0 ----
export function yaz0Decode(buf) {
  if (buf.toString("ascii", 0, 4) !== "Yaz0") return buf;
  const size = buf.readUInt32BE(4), out = Buffer.alloc(size);
  let src = 16, dst = 0;
  while (dst < size) {
    const code = buf[src++];
    for (let bit = 7; bit >= 0 && dst < size; bit--) {
      if (code & (1 << bit)) { out[dst++] = buf[src++]; continue; }
      const b1 = buf[src++], b2 = buf[src++];
      const dist = ((b1 & 0x0f) << 8) | b2;
      let n = b1 >> 4;
      n = n === 0 ? buf[src++] + 0x12 : n + 2;
      let from = dst - dist - 1;
      for (let k = 0; k < n; k++) out[dst++] = out[from++];
    }
  }
  return out;
}

// ---- U8 archive -> [{path, data}] ----
export function u8Files(buf) {
  if (buf.readUInt32BE(0) !== 0x55aa382d) return null;
  const root = buf.readUInt32BE(4);
  const count = buf.readUInt32BE(root + 8);
  const strBase = root + count * 12;
  const name = (off) => { let e = strBase + off; while (buf[e]) e++; return buf.toString("latin1", strBase + off, e); };
  const files = [];
  const walk = (i, end, dir) => {
    while (i < end) {
      const n = root + i * 12, type = buf[n], nameOff = buf.readUInt32BE(n) & 0xffffff;
      const a = buf.readUInt32BE(n + 4), b = buf.readUInt32BE(n + 8), nm = i === 0 ? "" : name(nameOff);
      if (type === 1) { walk(i + 1, b, i === 0 ? dir : dir + nm + "/"); i = b; }
      else { files.push({ path: dir + nm, data: buf.subarray(a, a + b) }); i++; }
    }
  };
  walk(0, count, "");
  return files;
}

// ---- PMP ----
export function pmpObjects(buf) {
  if (buf.toString("ascii", 0, 4) !== "PMPF") return null;
  const n = buf.readUInt16BE(0x10), off = buf.readUInt32BE(0x40);
  // the table offset has been read as absolute and as relative to the 0x80-byte
  // header; take whichever yields sane records
  const sane = (base) => {
    if (base + n * 0x58 > buf.length) return false;
    for (let k = 0; k < Math.min(n, 8); k++) {
      const r = base + k * 0x58, g = buf.readUInt16BE(r);
      const p = [0, 1, 2].map((j) => buf.readFloatBE(r + 8 + j * 4));
      if (g > 0x40 || p.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e6)) return false;
    }
    return true;
  };
  const base = sane(off) ? off : sane(off + 0x80) ? off + 0x80 : null;
  if (base == null) throw new Error(`PMP object table not found (count ${n}, offset 0x${off.toString(16)})`);
  const objs = [];
  for (let k = 0; k < n; k++) {
    const r = base + k * 0x58;
    objs.push({
      index: k, group: buf.readUInt16BE(r), id: buf.readUInt16BE(r + 2),
      pos: [0, 1, 2].map((j) => buf.readFloatBE(r + 8 + j * 4)),
      scale: [0, 1, 2].map((j) => buf.readFloatBE(r + 0x14 + j * 4)),
      params: buf.subarray(r + 0x48, r + 0x58).toString("hex"),
    });
  }
  return { base, objs };
}

// ---- gather PMPs from inputs ----
function collect(p, acc) {
  const st = statSync(p);
  if (st.isDirectory()) { for (const e of readdirSync(p)) collect(join(p, e), acc); return; }
  const raw = readFileSync(p);
  if (raw.toString("ascii", 0, 4) === "PMPF") { acc.push({ from: p, name: basename(p), data: raw }); return; }
  if (!/\.(carc|szs|arc|u8)$/i.test(p) && raw.toString("ascii", 0, 4) !== "Yaz0") return;
  const files = u8Files(yaz0Decode(raw));
  if (!files) return;
  for (const f of files) if (/\.pmp$/i.test(f.path) || f.data.toString("ascii", 0, 4) === "PMPF") acc.push({ from: `${p}:${f.path}`, name: basename(f.path), data: f.data });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (!inputs.length) { console.error("usage: node tools/wsr-pins.mjs <course archives / .pmp files / folders...> [--out tools/wsr-pins.json]"); process.exit(1); }
  const names = JSON.parse(readFileSync(opt.names, "utf8")), reg = JSON.parse(readFileSync(opt.registration, "utf8")).holes;
  const truth = JSON.parse(readFileSync(opt.truth, "utf8")).holes;
  const pmps = [];
  for (const p of inputs) collect(p, pmps);
  const out = { _note: "WSR golf pins, player starts and tee markers decoded from the course PMP files by tools/wsr-pins.mjs; x/y are fractions of the app's 250x304 map, mesh = KCL units.", holes: {} };
  for (const f of pmps) {
    const m = /glf_course_(fc(?:JP)?\d+)\.pmp$/i.exec(f.name);
    const meshId = m ? m[1].replace(/^fcjp/i, "fcJP") : null;
    const hole = meshId ? names[meshId] : null;
    const { base, objs } = pmpObjects(f.data);
    const tally = {}; for (const o of objs) { const k = `${o.group.toString(16)}:${o.id.toString(16)}`; tally[k] = (tally[k] || 0) + 1; }
    console.log(`${f.from}: ${objs.length} objects (table at 0x${base.toString(16)}) ${JSON.stringify(tally)}${hole ? ` -> hole ${hole}` : " (no hole match)"}`);
    if (!hole || !reg[hole]) continue;
    const B = reg[hole].meshToMapFrac;
    const toFrac = (X, Z) => [B[0][0] * X + B[0][1] * Z + B[0][2], B[1][0] * X + B[1][1] * Z + B[1][2]];
    const poly = truth[hole]?.greenPoly ?? [];
    const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const conv = (o) => { const [x, y] = toFrac(o.pos[0], o.pos[2]); return { index: o.index, x: +x.toFixed(4), y: +y.toFixed(4), mesh: o.pos.map((v) => +v.toFixed(2)), params: o.params }; };
    const pins = objs.filter((o) => o.group === 2 && o.id === 1).map((o, k) => ({ pin: k, ...conv(o) })).map((p) => ({ ...p, onGreen: inPoly(p.x, p.y, poly) }));
    out.holes[hole] = {
      meshId, source: f.from, pins,
      starts: objs.filter((o) => o.group === 2 && o.id === 0).map(conv),
      teeMarkers: objs.filter((o) => o.group === 2 && o.id === 0xa).map(conv),
      frisbee: objs.filter((o) => o.group === 0xb).map((o) => ({ id: o.id, ...conv(o) })),
    };
    console.log(`   hole ${hole}: ${pins.length} pins (${pins.filter((p) => p.onGreen).length} on the WSR green), ${out.holes[hole].starts.length} player starts, ${out.holes[hole].teeMarkers.length} tee markers`);
  }
  writeFileSync(opt.out, JSON.stringify(out, null, 1));
  console.log(`wrote ${opt.out} (${Object.keys(out.holes).length} holes)`);
}
