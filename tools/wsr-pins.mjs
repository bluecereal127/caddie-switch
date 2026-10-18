// Read every golf pin position straight from the WSR course placement files.
//
//   node tools/wsr-pins.mjs <archives-or-folders...> [--out tools/wsr-pins.json]
//        [--rasters captures/meshes/heightmaps-res4]
//
// Inputs: WSR golf course archives (.carc/.szs/.arc: Yaz0-compressed U8, e.g.
// glf_course_fc1.carc under DATA/files/Stage/Shared2/ of the extracted disc,
// which holds WS2_glf_course_fc1.kcl and WS2_glf_course_fc1.pmp), loose .pmp
// files, or folders holding either (searched recursively). Get them from the
// disc image with Dolphin (right-click the game -> Properties -> Filesystem ->
// extract) or `DolphinTool extract -i <game.rvz> -o <dir>`. It also reads
// tools/mesh-holes.json (mesh id -> hole), tools/mesh-registration.json (mesh
// units -> map frame) and tools/wsr-truth.json (the WSR green outline, for
// each pin's onGreen check).
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
// The trees are group 0x0002 too, ids 0x0002 (the round broadleaf canopy, 960
// over the 21 holes), 0x0003 (a dark dense crown, 409) and 0x0006 (a palm,
// 171); the KCL meshes hold none (their type-12 walls are banks, cliffs and
// retaining walls along the water and the edge of the terrain). Overlaid on
// the minimaps they sit at the centres of the drawn canopies, and the x scale
// (x = z on 1533 of the 1540; y is within +-12% of x on 1477, the extremes
// -33% and +52%) sets the canopy's size (tools/MESHES.md, "Trees"). Holes 1,
// 2, 9, 11 and 12 pair 166 of their trees with a companion object of id 4, 5
// or 7 at the same spot (0-26 units off: 0 on H11 and H12, under 13 u = 0.6 px
// on H1 and H9, up to 26 u = 3 px on H2) with the tree's exact scale on 164 of
// them; those are not trees of their own and are not read.
//
// Each tree also carries the ground under its trunk, `lie`, read off the
// per-hole class rasters tools/mesh-heightmap.mjs writes
// (captures/meshes/heightmaps-res4/hole-NN_classes.png: 8-bit, pixel = KCL
// type of the top surface, 4 u/px, with hole-NN.json for the origin; another
// folder with --rasters). Trees and rasters share the mesh frame, so the
// sample needs no registration. Values: fairway, rough, sand, green, fringe,
// outer (type-4 ground, and the type-5 floor plane under water and OB),
// water, other (the zone and fall types). A tree beyond the raster's crop,
// which already reaches 600 u past the last course surface, is outer by
// construction; a nodata pixel (a gap in the ground mesh) takes the surface
// most of the ring 1-2 px around it shows, and nothing within reach is the
// void beyond the meshes, outer as well. Read 2026-10-18 over the 1540:
// fairway 6, rough 454, outer 896 on the rasters + 184 beyond their crops;
// no tree stands on sand, green, fringe or water, none on a nodata pixel.
// The rasters are gitignored (rips the user supplies), so without them a
// tree keeps the lie of the tree at the same spot (x, y, kind, size) in the
// existing output file, and the log says how many lies came from the
// rasters, from that file, or are missing.
//
// Positions are in KCL units (the mesh frame), so tools/mesh-registration.json
// maps them into the app's 250x304 map frame.
//
// A pin's params hold s16 slot then s16 set. Read from the US Rev 1 main.dol:
// while loading the PMP, RPGlfFieldManager's walker (0x80402834, reached via
// 0x80402b70 from the field manager's load 0x80403f44) calls 0x80406b44 for
// each pin, which we call GlfConfig::addPinSlot(slot, pinOrdinal, set): it
// fills a 16-slot table (GlfConfig+0x40 ordinal, +0x80 set; -1 = empty).
// (Caddie's own GlfConfig::setPin(u32) is a different thing: it writes the
// chosen slot at +0x38, as choosePin does.) At each hole start,
// after the hole's wind is unpacked, GlfConfig::choosePin(set) (0x804066e0)
// counts the slots whose set matches (set 0 matches every slot) and draws
// floor(count * ((Sp2::Rand() >> 16) & 0xffff) / 65536): uniform within the
// set. The set comes from RPGlfPlayerManager (0x803fa3f4), with k the hole's
// 1-based position in the round and s each player's score to par over the
// round's earlier holes:
//   - set 1 on the round's first hole, and always in rounds of 3 holes or
//     fewer (Resort/Classic A-C, Special);
//   - otherwise set 1 if the best player's s >= -k/2, set 2 if the worst
//     player's s < -k/2, else set 0, which means any of the hole's pins.
// Single player: set 2 ("A", the harder pins) once s <= -(floor(k/2) + 1).
// Set 1 is "B", the easier set. Holes 2-17 put slots 0-2 in set 1 and 3-5 in
// set 2; hole 1 has three set-1 pins, hole 18 one spot listed under both sets,
// the specials six set-1 pins.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { loadImage } from "./lib/image.mjs";

// KCL units per yard (1 unit = 0.1 m); WSR shows floor(flat distance) in yards
const UNITS_PER_YD = 9.144;
// a tree's lie by the KCL type under its trunk (tools/lib/obj.mjs KCL_GOLF);
// types the course has no word for (zone, fall) are "other"
const LIE_OF = { 1: "fairway", 2: "rough", 3: "sand", 4: "outer", 5: "outer", 6: "green", 7: "water", 9: "fringe" };

const args = process.argv.slice(2);
const opt = { out: "tools/wsr-pins.json", names: "tools/mesh-holes.json", registration: "tools/mesh-registration.json", truth: "tools/wsr-truth.json", rasters: "captures/meshes/heightmaps-res4" };
const inputs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out") opt.out = args[++i];
  else if (args[i] === "--rasters") opt.rasters = args[++i];
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

// ---- pin params -> slot / set / label ----
// params bytes 0-1 = s16 slot, 2-3 = s16 set (see the header)
export const pinSlot = (o) => Buffer.from(o.params, "hex").readInt16BE(0);
export const pinSet = (o) => Buffer.from(o.params, "hex").readInt16BE(2);

// One entry per distinct spot (hole 18 lists its only spot under both sets).
// Labels: set letter (B = set 1, A = set 2) plus L/M/R west to east on the
// minimap within the set, which reproduces the community's names on 95 of 99
// pins of holes 1-17. The two misses are ties: hole 3's B pins in slots 0
// and 1 sit 0.1 px apart in x, so the sort can't separate them; on hole 9 the
// community names were matched to slots by yardage, and the A pins in slots 4
// and 5 both read 571 yd, so that match was a guess. Hole 1 has one set, so no
// letter. Hole 18's single spot and the specials' six are numbered by slot.
export function pinSpots(pins) {
  const spots = [];
  for (const p of pins) {
    const s = spots.find((q) => Math.hypot(q.mesh[0] - p.mesh[0], q.mesh[2] - p.mesh[2]) < 0.5);
    if (s) { s.slots.push(p.slot); if (!s.sets.includes(p.set)) s.sets.push(p.set); }
    else spots.push({ ...p, slots: [p.slot], sets: [p.set] });
  }
  const setsUsed = [...new Set(spots.flatMap((s) => s.sets))];
  const lettered = setsUsed.length > 1 && spots.every((s) => s.sets.length === 1);
  for (const set of setsUsed) {
    const g = spots.filter((s) => s.sets.length === 1 && s.sets[0] === set).sort((a, b) => a.x - b.x);
    const names = g.length === 3 ? ["L", "M", "R"] : null;
    g.forEach((s, i) => { s.label = names ? (lettered ? (set === 2 ? "A" : "B") : "") + names[i] : String(s.slots[0] + 1); });
  }
  for (const s of spots) if (!s.label) s.label = String(s.slots[0] + 1);
  // A/B only means something on a hole that has both sets
  return spots.map(({ pin, index, params, slot, set, ...s }) => ({ ...s, set: lettered ? (s.sets[0] === 2 ? "A" : "B") : null }));
}

// ---- the ground under a tree: the hole's class raster ----
// null without the raster (the rips are not in the repo). at(X, Z) is the lie
// at a mesh position; see the header for the rules.
function classRaster(hole) {
  const tag = join(opt.rasters, `hole-${String(hole).padStart(2, "0")}`);
  let r, img;
  try { r = JSON.parse(readFileSync(`${tag}.json`, "utf8")).raster; img = loadImage(`${tag}_classes.png`); } catch { return null; }
  // 8-bit greyscale, decoded to RGBA: the type is the red byte
  const cls = (c, row) => (c < 0 || row < 0 || c >= img.width || row >= img.height ? -1 : img.data[(row * img.width + c) * 4]);
  const at = (X, Z) => {
    const c = Math.floor((X - r.originX) / r.unitsPerPixel);
    const row = Math.floor((r.rowAxis === "-Z" ? r.extentZ[1] - Z : Z - r.originZ) / r.unitsPerPixel);
    let k = cls(c, row);
    if (k < 0) return "outer"; // beyond the crop: 600 u past the last course surface
    for (let d = 1; d <= 2 && !k; d++) { // nodata: what most of the ring around it is
      const n = {};
      for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        const v = Math.max(Math.abs(dx), Math.abs(dy)) === d ? cls(c + dx, row + dy) : 0;
        if (v > 0) n[v] = (n[v] || 0) + 1;
      }
      k = +(Object.keys(n).sort((a, b) => n[b] - n[a])[0] ?? 0);
    }
    return k ? LIE_OF[k] ?? "other" : "outer"; // nothing within reach: the void beyond the meshes
  };
  return { at };
}

// ---- gather PMPs from inputs ----
function collect(p, acc) {
  const st = statSync(p);
  if (st.isDirectory()) { for (const e of readdirSync(p)) collect(join(p, e), acc); return; }
  const raw = readFileSync(p);
  if (raw.toString("ascii", 0, 4) === "PMPF") { acc.push({ from: basename(p), name: basename(p), data: raw }); return; }
  if (!/\.(carc|szs|arc|u8)$/i.test(p) && raw.toString("ascii", 0, 4) !== "Yaz0") return;
  const files = u8Files(yaz0Decode(raw));
  if (!files) return;
  // record names only: the output is committed, absolute paths are personal
  for (const f of files) if (/\.pmp$/i.test(f.path) || f.data.toString("ascii", 0, 4) === "PMPF") acc.push({ from: `${basename(p)}:${f.path}`, name: basename(f.path), data: f.data });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (!inputs.length) { console.error("usage: node tools/wsr-pins.mjs <course archives / .pmp files / folders...> [--out tools/wsr-pins.json]"); process.exit(1); }
  const names = JSON.parse(readFileSync(opt.names, "utf8")), reg = JSON.parse(readFileSync(opt.registration, "utf8")).holes;
  const truth = JSON.parse(readFileSync(opt.truth, "utf8")).holes;
  // the previous output: the lies it holds stand in for the rasters when they are missing
  let prev = null;
  try { prev = JSON.parse(readFileSync(opt.out, "utf8")).holes; } catch {}
  const prevLie = (hole, t) => prev?.[hole]?.trees?.find((q) => q.x === t.x && q.y === t.y && q.kind === t.kind && q.size === t.size)?.lie;
  const lieFrom = { raster: 0, file: 0, none: 0 }, lieTally = {};
  const pmps = [];
  for (const p of inputs) collect(p, pmps);
  const out = { _note: "WSR golf pins, player starts, tee markers and trees decoded from the course PMP files by tools/wsr-pins.mjs; x/y are fractions of the app's 250x304 map, mesh = KCL units, yd = floor of the flat distance from the player start (what WSR shows). spots = distinct pin positions with labels; set B = 1 (easier), A = 2. trees = every tree object, also outside the map frame: kind = PMP id (2 round canopy, 3 dark crown, 6 palm), size = its x scale (the drawn canopy scales with it, see tools/MESHES.md), lie = the KCL surface under the trunk from the mesh class rasters (fairway, rough, sand, green, fringe, outer = type-4 ground / the floor plane / beyond the raster, water, other); missing when neither the rasters nor a previous file had it.", holes: {} };
  for (const f of pmps) {
    const m = /glf_course_(fc(?:JP)?\d+)\.pmp$/i.exec(f.name);
    const meshId = m ? m[1].replace(/^fcjp/i, "fcJP") : null;
    const hole = meshId ? names[meshId] : null;
    // an extracted disc tree holds each PMP twice (inside the archive and as
    // wszst's loose copy); the first one read wins
    if (hole && out.holes[hole]) continue;
    const { base, objs } = pmpObjects(f.data);
    const tally = {}; for (const o of objs) { const k = `${o.group.toString(16)}:${o.id.toString(16)}`; tally[k] = (tally[k] || 0) + 1; }
    console.log(`${f.from}: ${objs.length} objects (table at 0x${base.toString(16)}) ${JSON.stringify(tally)}${hole ? ` -> hole ${hole}` : " (no hole match)"}`);
    if (!hole || !reg[hole]) continue;
    const B = reg[hole].meshToMapFrac;
    const toFrac = (X, Z) => [B[0][0] * X + B[0][1] * Z + B[0][2], B[1][0] * X + B[1][1] * Z + B[1][2]];
    const poly = truth[hole]?.greenPoly ?? [];
    const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const conv = (o) => { const [x, y] = toFrac(o.pos[0], o.pos[2]); return { index: o.index, x: +x.toFixed(4), y: +y.toFixed(4), mesh: o.pos.map((v) => +v.toFixed(2)), params: o.params }; };
    const starts = objs.filter((o) => o.group === 2 && o.id === 0).map(conv);
    const st = starts[0]?.mesh;
    const pins = objs.filter((o) => o.group === 2 && o.id === 1).map((o, k) => ({ pin: k, ...conv(o), slot: pinSlot(o), set: pinSet(o) }))
      .map((p) => ({ ...p, onGreen: inPoly(p.x, p.y, poly),
        yd: st ? Math.floor(Math.hypot(p.mesh[0] - st[0], p.mesh[2] - st[2]) / UNITS_PER_YD) : null }));
    // every tree, in and out of the frame (build-derived keeps the ones on the
    // map), with the ground under it from the class raster, else from the
    // previous file
    const ras = classRaster(hole), from = { raster: 0, file: 0, none: 0 }, hist = {};
    const trees = objs.filter((o) => o.group === 2 && (o.id === 2 || o.id === 3 || o.id === 6))
      .map((o) => {
        const [x, y] = toFrac(o.pos[0], o.pos[2]);
        const t = { x: +x.toFixed(4), y: +y.toFixed(4), kind: o.id, size: +o.scale[0].toFixed(3) };
        const lie = ras ? ras.at(o.pos[0], o.pos[2]) : prevLie(hole, t);
        from[ras ? "raster" : lie ? "file" : "none"]++;
        if (lie) { hist[lie] = (hist[lie] || 0) + 1; (lieTally[o.id] ??= {})[lie] = (lieTally[o.id][lie] || 0) + 1; }
        return lie ? { ...t, lie } : t;
      });
    for (const k in from) lieFrom[k] += from[k];
    out.holes[hole] = {
      meshId, source: f.from, pins, spots: pinSpots(pins), starts,
      teeMarkers: objs.filter((o) => o.group === 2 && o.id === 0xa).map(conv),
      frisbee: objs.filter((o) => o.group === 0xb).map((o) => ({ id: o.id, ...conv(o) })),
      trees,
    };
    const treeTally = [2, 3, 6].map((k) => `${trees.filter((t) => t.kind === k).length} of kind ${k}`).join(", ");
    const lieNote = `lie ${Object.entries(hist).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n}`).join(", ") || "none"} (${ras ? "from the raster" : from.file ? "from the previous file" : "no raster, no previous file"})`;
    console.log(`   hole ${hole}: ${pins.length} pins (${pins.filter((p) => p.onGreen).length} on the WSR green) at ${out.holes[hole].spots.length} spots [${out.holes[hole].spots.map((s) => `${s.label} ${s.yd}yd`).join(", ")}], ${starts.length} player starts, ${out.holes[hole].teeMarkers.length} tee markers, ${trees.length} trees (${treeTally}; ${trees.filter((t) => t.x >= 0 && t.x <= 1 && t.y >= 0 && t.y <= 1).length} on the map; ${lieNote})`);
  }
  writeFileSync(opt.out, JSON.stringify(out, null, 1));
  const lieLine = Object.entries(lieTally).map(([k, h]) => `kind ${k}: ${Object.entries(h).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n}`).join(", ")}`).join("; ");
  console.log(`tree lies: ${lieFrom.raster} from the class rasters, ${lieFrom.file} from the previous ${opt.out}, ${lieFrom.none} missing${lieLine ? ` (${lieLine})` : ""}`);
  console.log(`wrote ${opt.out} (${Object.keys(out.holes).length} holes)`);
}
