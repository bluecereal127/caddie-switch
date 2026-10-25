// Ship the course terrain to the app: per hole, the ground height and the
// surface class on a grid over the 250x304 map frame, and a fine height grid
// over the green. The source is NSS's own collision (the Switch game's
// Fld_GolfCourseNN field meshes, as the eden exporter dumps them; the user's
// rule since 2026-10-24: NSS data replaces WSR data), read by vertical ray
// casts. The dump is git-ignored (on the dump machine only), so the output is
// committed.
//
//   node tools/build-terrain.mjs [--collision tools/harness/state/eden/nss-golf-x/collision]
//        [--truth tools/nss-truth.json] [--registration tools/nss-registration.json]
//        [--pins tools/nss-pins.json] [--out public/terrain] [--holes 7,16]
//        [--allow-missing water]
//
// Reads per hole collision/hNN.json + hNN.bin (the field) and hNN-covers.bin
// (the six HoleCover plugs, which close the cups) through tools/lib/nsscol.mjs,
// and on H3 hNN-water.json + .bin (Object_BGOBJ_GolfCourse03Water: H3's sea is
// its own actor, not in the field mesh). Without that file the build refuses
// (exit 1, nothing written): H3's sea floor, sand OB, would stand where the
// water is. --allow-missing water builds it so on purpose, and index.json then
// lists the actor under the hole's `missing`. tools/nss-truth.json
// (green box, yd per map px), tools/nss-registration.json (map fraction <->
// NSS metres, tools/lib/nssreg.mjs; originMeshY, the datum in WSR's KCL units)
// and tools/nss-pins.json (the WSR start's mesh height, for the index's audit
// field). Writes public/terrain/hNN.bin, gNN.bin and index.json; the app reads
// them through src/terrain.js. Rerun when the dump's collision, the
// registration or tools/nss-truth.json change. A --holes batch merges its
// entries into the existing index.json; every file is written only after all
// holes are built. Deterministic: doubles over the dump's float32 vertices,
// the rays' ties broken by triangle index (nsscol topGround), fixed rounding.
//
// The datum: NSS y 0, the height of the WSR player start (the ground ray there
// reads 0.000 m fairway on all 21 holes, as at Glf_RotateOBJ and GlfTeeOBJ),
// where local play tees off. In WSR's KCL units it is the registration's
// originMeshY, the header's datumY, so a tree's base height `z` (derived.json,
// on the WSR start's height) compares with these heights directly.
//
// hNN.bin, little-endian, 20-byte header then two arrays, row-major from the
// map's top-left (row 0 = the north edge, column 0 = the west edge):
//   0  "CTRN"   4  u16 layout version (1)   6  u16 w   8  u16 h   10 u16 hole
//   12 f32 datumY: NSS y 0 (the WSR start's height) in KCL units (0.1 m)
//   16 f32 yd per height unit (0.1)
//   20 int16[w*h] ground height in 0.1 yd above the datum; -32768 = no data
//      (no ground under the sample: past the end of NSS's field mesh)
//   20 + 2wh  uint8[w*h] surface class (CLASS_NAMES; 0 = no ground)
// gNN.bin, 40-byte header:
//   0  "CGRN"   4  u16 version (1)   6  u16 w   8  u16 h   10 u16 hole
//   12 f32 box x0, y0, x1, y1 (map fractions; node (i, j) sits at
//      x0 + i(x1 - x0)/(w - 1), y0 + j(y1 - y0)/(h - 1), stepYd apart)
//   28 f32 stepYd (0.5)   32 f32 z0Yd: the green's mean height above the datum
//   36 f32 yd per height unit (0.001)
//   40 int16[w*h] height above z0Yd   40 + 2wh  uint8[w*h] 1 = the node's
//      ray lands on the green
// The headers hold NUL bytes on purpose: git (core.autocrlf on this repo)
// takes a file with no NUL in its first 8000 bytes for text. The files are
// not compressed; the log gives their raw and gzipped sizes.
//
// The classes keep the KCL vocabulary the app has always read (src/terrain.js
// lieOf), plus 17 for NSS's sand OB: GolfFairway 5 -> 1, GolfRough 6 -> 2,
// GolfBunker 7 -> 3, GolfOB 10 -> 4, GolfGreen 18 (and the covers) -> 6,
// GolfWaterhazard 8 -> 7, GolfGreenEdge 24 -> 9, GolfRock 32 -> 12 (a wall:
// banks, cliffs, the rocks along the water), GolfSandOB 36 -> 17 (the
// Switch's beaches, which are out of bounds where WSR's were sand). A ray
// lands on the topmost of those ground codes (nsscol GROUND_CODES) and
// passes through the rest: leaves, palm leaves, trunks, the cups' walls and
// bottoms (closed by their covers), glass, objects, barriers and the air OB
// volumes, none of which the 2D terrain carries.
//
// The grid: one sample per GRID_PX map px, the sample's cell the map px
// square it covers, its centre at ((i + 0.5)/w, (j + 0.5)/h). Height: the ray
// at the centre (at a cliff it reads the exact top or foot, not a blend).
// Class: the majority of SUB x SUB rays over the cell (at its (s + 0.5)/SUB
// points); a ray that finds no ground does not vote, ties take the centre
// ray's class when it is one of them (else the lowest tied id), and a cell
// none of whose rays finds ground is 0 (classVote, exported for
// tools/test-terrain.mjs; importing this file builds nothing).
//
// The green: heights at GREEN_STEP_YD over nss-truth's green box plus
// GREEN_MARGIN of it on every side (the app's green view, build-derived's
// GT_MARGIN), grown by under half a step so the grid fits it exactly, each
// node the ray at it, in GREEN_UNIT_YD above the green's mean (over the
// mask). The mask: the nodes whose ray lands on the green (GolfGreen, or a
// cover where a cup is). The covers matter: without them a ray over a cup
// reads its bottom 0.30 m down, a 60 %+ spike in src/putt.js's gradient. A
// masked node whose topmost hit among the ground codes and the cup's
// (GolfCupside 30, GolfCup 31) is the cup is a cup its cover does not close:
// the build refuses it (exit 1). The unit is 0.001 yd, not 0.01: a step of
// 0.01 yd over the 0.5 yd spacing is a 2% slope, against the few percent of a
// typical green cell; 0.001 yd is 0.2%, about the collision's own vertex grid
// (1/512 m = 0.002 yd).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { loadCollision, gridIndex, topGround, GROUND_CODES } from "./lib/nsscol.mjs";
import { regOf, mapToNss, MAP_W, MAP_H, M_PER_YD } from "./lib/nssreg.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// the run's options and inputs, set by main()
let opt, TRUTH, REGJ, PINS;

const LAYOUT = 1;
// one sample per 2 map px: 125x152, a cell 1.8-5.0 yd across (0.89-2.51 yd
// per map px), 57 KB per hole
const GRID_PX = 2, GW = MAP_W / GRID_PX, GH = MAP_H / GRID_PX;
const SUB = 4; // class rays per cell side
const Z_UNIT_YD = 0.1, NODATA = -32768;
const GREEN_MARGIN = 0.12, GREEN_STEP_YD = 0.5, GREEN_UNIT_YD = 0.001;
const HEADER = 20, GREEN_HEADER = 40;
const KCL_UNITS_PER_M = 10;
const CROP_M = 10; // triangles kept: those within 10 m of the frame (and the green grid's box)
// NSS surface code -> terrain class (the header)
const CLASS_OF = { 5: 1, 6: 2, 7: 3, 8: 7, 10: 4, 18: 6, 24: 9, 32: 12, 36: 17 };
const NCLS = 18; // class ids 0-17
const CLASS_NAMES = {
  0: "no ground (past the end of NSS's field mesh)",
  1: "fairway (GolfFairway 5; the tee pads)",
  2: "rough (GolfRough 6)",
  3: "bunker (GolfBunker 7)",
  4: "outer ground (GolfOB 10: OB terrain)",
  6: "green (GolfGreen 18, with the HoleCovers that close the cups)",
  7: "water (GolfWaterhazard 8; on H3 the separate actor Object_BGOBJ_GolfCourse03Water)",
  9: "fringe (GolfGreenEdge 24)",
  12: "wall (GolfRock 32: banks, cliffs and the rocks along the water)",
  17: "sand OB (GolfSandOB 36: the Switch's beaches, out of bounds)",
};
for (const c of GROUND_CODES) if (CLASS_OF[c] == null) throw new Error(`NSS ground code ${c} has no terrain class`);
const CUP_CODES = new Set([30, 31]);
const RAY_CODES = new Set([...GROUND_CODES, ...CUP_CODES]);
// separate collision actors a hole's ground includes (loadCollision extras)
const EXTRAS = { 3: ["water"] };
const EXTRA_ACTOR = { water: "Object_BGOBJ_GolfCourse03Water, H3's sea: without it the field mesh's sea floor, sand OB, stands where the water is" };

// A cell's class from its rays' votes: votes[c] = the rays that landed on
// class c (c >= 1; a ray that finds no ground does not vote, and votes[0] is
// not read), centre = the centre ray's class (-1 when it found no ground).
// The majority; a tie goes to the centre ray's class when it is one of the
// tied, else to the lowest tied id; 0 when no ray found ground.
// -> { cls, tied }
export function classVote(votes, centre = -1) {
  let best = 1;
  for (let c = 1; c < votes.length; c++) if (votes[c] > votes[best]) best = c;
  if (!(votes[best] > 0)) return { cls: 0, tied: false };
  let tied = false;
  for (let c = 1; c < votes.length; c++) if (c !== best && votes[c] === votes[best]) tied = true;
  if (tied && centre >= 1 && votes[centre] === votes[best]) best = centre;
  return { cls: best, tied };
}

// the triangles of `mesh` whose xz box meets [x0, x1] x [z0, z1], in order
// (so the rays' ties by triangle index fall as on the whole mesh), with the
// vertices they use, in order of first use
function crop(mesh, x0, z0, x1, z1) {
  const { verts: V, tris: T, surface: S } = mesh;
  const keep = [];
  for (let t = 0; t < mesh.nt; t++) {
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    if (Math.max(V[a], V[b], V[c]) < x0 || Math.min(V[a], V[b], V[c]) > x1 || Math.max(V[a + 2], V[b + 2], V[c + 2]) < z0 || Math.min(V[a + 2], V[b + 2], V[c + 2]) > z1) continue;
    keep.push(t);
  }
  const remap = new Int32Array(mesh.nv).fill(-1), vlist = [];
  const tris = new Uint32Array(keep.length * 3), surface = new Uint8Array(keep.length);
  keep.forEach((t, k) => {
    for (let c = 0; c < 3; c++) {
      const vi = T[t * 3 + c];
      if (remap[vi] < 0) { remap[vi] = vlist.length; vlist.push(vi); }
      tris[k * 3 + c] = remap[vi];
    }
    surface[k] = S[t];
  });
  const verts = new Float32Array(vlist.length * 3);
  vlist.forEach((vi, k) => { verts[k * 3] = V[vi * 3]; verts[k * 3 + 1] = V[vi * 3 + 1]; verts[k * 3 + 2] = V[vi * 3 + 2]; });
  return { nv: vlist.length, nt: keep.length, verts, tris, surface };
}

function buildHole(n) {
  const reg = regOf(REGJ, n), t = TRUTH[n], tees = PINS[n]?.tees;
  if (!t?.greenBox || !t.scale) throw new Error(`H${n}: no green box or scale in tools/nss-truth.json`);
  if (!tees?.wsrStart?.mesh) throw new Error(`H${n}: no WSR start in tools/nss-pins.json`);
  const extras = EXTRAS[n] ?? [];
  const full = loadCollision(opt.collision, n, { covers: true, extras });
  const files = (list) => list.map((m) => `h${String(n).padStart(2, "0")}-${m}.json / .bin (${EXTRA_ACTOR[m] ?? m})`).join(", ");
  const refused = full.missing.filter((m) => !opt.allowMissing.has(m));
  if (refused.length) throw new Error(`H${n}: ${files(refused)} not in the dump (${opt.collision}). Export it, or pass --allow-missing ${refused.join(",")} to build without it`);
  if (full.missing.length) console.warn(`H${n}: ${files(full.missing)} not in the dump: built without it (--allow-missing), index.json lists it under missing`);
  const datumY = reg.originMeshY;

  // ---- the green grid's box (nss-truth's green box + margin, fitted to the step) ----
  const b = t.greenBox, sc = t.scale; // yd per map px
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  let gx0 = b.x0 - GREEN_MARGIN * bw, gx1 = b.x1 + GREEN_MARGIN * bw, gy0 = b.y0 - GREEN_MARGIN * bh, gy1 = b.y1 + GREEN_MARGIN * bh;
  const wYd = (gx1 - gx0) * MAP_W * sc, hYd = (gy1 - gy0) * MAP_H * sc;
  const gw = Math.ceil(wYd / GREEN_STEP_YD - 1e-9) + 1, gh = Math.ceil(hYd / GREEN_STEP_YD - 1e-9) + 1;
  const growX = ((gw - 1) * GREEN_STEP_YD - wYd) / 2 / (MAP_W * sc), growY = ((gh - 1) * GREEN_STEP_YD - hYd) / 2 / (MAP_H * sc);
  gx0 -= growX; gx1 += growX; gy0 -= growY; gy1 += growY;

  // ---- the triangles in reach, indexed ----
  let cx0 = Infinity, cz0 = Infinity, cx1 = -Infinity, cz1 = -Infinity;
  for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1], [gx0, gy0], [gx1, gy0], [gx0, gy1], [gx1, gy1]]) {
    const [x, z] = mapToNss(reg, fx, fy);
    cx0 = Math.min(cx0, x); cx1 = Math.max(cx1, x); cz0 = Math.min(cz0, z); cz1 = Math.max(cz1, z);
  }
  const mesh = crop(full, cx0 - CROP_M, cz0 - CROP_M, cx1 + CROP_M, cz1 + CROP_M);
  const idx = gridIndex(mesh, 4, { codes: RAY_CODES });
  const ground = (fx, fy) => { const [x, z] = mapToNss(reg, fx, fy); return topGround(idx, x, z, GROUND_CODES); };

  // ---- the map-frame grid ----
  const heights = new Int16Array(GW * GH), classes = new Uint8Array(GW * GH);
  const votes = new Int32Array(NCLS);
  let ties = 0, partial = 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i;
    const hc = ground((i + 0.5) / GW, (j + 0.5) / GH);
    heights[k] = hc ? Math.max(-32767, Math.min(32767, Math.round(hc.y / M_PER_YD / Z_UNIT_YD))) : NODATA;
    votes.fill(0);
    let hits = 0;
    for (let sy = 0; sy < SUB; sy++) for (let sx = 0; sx < SUB; sx++) {
      const h = ground((i + (sx + 0.5) / SUB) / GW, (j + (sy + 0.5) / SUB) / GH);
      if (h) { votes[CLASS_OF[h.code]]++; hits++; }
    }
    if (hits && hits < SUB * SUB) partial++;
    const v = classVote(votes, hc ? CLASS_OF[hc.code] : -1);
    if (v.tied) ties++;
    classes[k] = v.cls;
  }

  // ---- the green ----
  const gYd = new Float64Array(gw * gh), mask = new Uint8Array(gw * gh);
  const openCups = [];
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const fx = gx0 + (i / (gw - 1)) * (gx1 - gx0), fy = gy0 + (j / (gh - 1)) * (gy1 - gy0), k = j * gw + i;
    const [x, z] = mapToNss(reg, fx, fy);
    const hit = topGround(idx, x, z, GROUND_CODES);
    if (!hit) throw new Error(`H${n}: no ground under the green grid at ${fx.toFixed(4)}, ${fy.toFixed(4)}`);
    gYd[k] = hit.y / M_PER_YD;
    if (hit.code !== 18) continue;
    mask[k] = 1;
    const top = topGround(idx, x, z, RAY_CODES);
    if (CUP_CODES.has(top.code)) openCups.push(`(${i}, ${j}) at ${fx.toFixed(5)}, ${fy.toFixed(5)}: code ${top.code} ${(top.y - hit.y).toFixed(4)} m over the green`);
  }
  if (openCups.length) throw new Error(`H${n}: ${openCups.length} green node(s) whose ray meets a cup its cover does not close: ${openCups.join("; ")}`);
  let sum = 0, inside = 0;
  for (let k = 0; k < gw * gh; k++) if (mask[k]) { sum += gYd[k]; inside++; }
  if (!inside) throw new Error(`H${n}: no green node lands on the green`);
  const z0Yd = +(sum / inside).toFixed(4);
  const gData = new Int16Array(gw * gh);
  let clamped = 0, lo = Infinity, hi = -Infinity;
  for (let k = 0; k < gw * gh; k++) {
    const u = Math.round((gYd[k] - z0Yd) / GREEN_UNIT_YD);
    if (u < -32767 || u > 32767) clamped++;
    gData[k] = Math.max(-32767, Math.min(32767, u));
    lo = Math.min(lo, gYd[k] - z0Yd); hi = Math.max(hi, gYd[k] - z0Yd);
  }
  if (clamped) console.warn(`H${n}: ${clamped} green-grid samples lie more than 32.767 yd from the green's mean and were clamped`);

  // ---- files ----
  const tb = Buffer.alloc(HEADER + GW * GH * 3);
  tb.write("CTRN", 0, "latin1"); tb.writeUInt16LE(LAYOUT, 4); tb.writeUInt16LE(GW, 6); tb.writeUInt16LE(GH, 8); tb.writeUInt16LE(n, 10);
  tb.writeFloatLE(datumY, 12); tb.writeFloatLE(Z_UNIT_YD, 16);
  for (let k = 0; k < GW * GH; k++) tb.writeInt16LE(heights[k], HEADER + 2 * k);
  Buffer.from(classes.buffer).copy(tb, HEADER + 2 * GW * GH);
  const gb = Buffer.alloc(GREEN_HEADER + gw * gh * 3);
  gb.write("CGRN", 0, "latin1"); gb.writeUInt16LE(LAYOUT, 4); gb.writeUInt16LE(gw, 6); gb.writeUInt16LE(gh, 8); gb.writeUInt16LE(n, 10);
  [gx0, gy0, gx1, gy1, GREEN_STEP_YD, z0Yd, GREEN_UNIT_YD].forEach((v, k) => gb.writeFloatLE(v, 12 + 4 * k));
  for (let k = 0; k < gw * gh; k++) gb.writeInt16LE(gData[k], GREEN_HEADER + 2 * k);
  Buffer.from(mask.buffer).copy(gb, GREEN_HEADER + 2 * gw * gh);

  const nn = String(n).padStart(2, "0"), sha1 = (buf) => createHash("sha1").update(buf).digest("hex");
  const tally = {};
  for (const c of classes) tally[c] = (tally[c] || 0) + 1;
  const noHeight = heights.reduce((s, v) => s + (v === NODATA), 0);
  const entry = {
    file: `h${nn}.bin`, meshId: full.meta.shape, datumY: +datumY.toFixed(2), datumYd: +(datumY / KCL_UNITS_PER_M / M_PER_YD).toFixed(4),
    datumWsrMeshY: tees.wsrStart.mesh[1], bytes: tb.length, sha1: sha1(tb),
    collisionSha1: full.sha1, ...(full.missing.length ? { missing: full.missing } : {}),
    classes: tally, noHeight,
    green: { file: `g${nn}.bin`, w: gw, h: gh, box: { x0: +gx0.toFixed(6), y0: +gy0.toFixed(6), x1: +gx1.toFixed(6), y1: +gy1.toFixed(6) }, stepYd: GREEN_STEP_YD, z0Yd, unitYd: GREEN_UNIT_YD, inside, rangeYd: [+lo.toFixed(3), +hi.toFixed(3)], bytes: gb.length, sha1: sha1(gb) },
  };
  let zmin = Infinity, zmax = -Infinity;
  for (const v of heights) if (v !== NODATA) { zmin = Math.min(zmin, v); zmax = Math.max(zmax, v); }
  console.log(`H${n} ${full.meta.shape}${extras.length ? ` + ${extras.filter((e) => !full.missing.includes(e)).join(", ") || "(none)"}` : ""}: ${mesh.nt} of ${full.nt} tris in reach; datum ${datumY} u (${entry.datumYd} yd); ${GW}x${GH} samples, ${noHeight} with no ground; classes ${Object.entries(tally).map(([c, k]) => `${c}:${k}`).join(" ")} (${ties} ties, ${partial} cells part off the mesh); heights ${(zmin * Z_UNIT_YD).toFixed(1)}..${(zmax * Z_UNIT_YD).toFixed(1)} yd; green ${gw}x${gh} at ${GREEN_STEP_YD} yd (${inside} on the green), mean ${z0Yd} yd, box ${lo.toFixed(2)}..${hi.toFixed(2)} yd round it`);
  return { n, entry, tb, gb };
}

function main() {
  const args = process.argv.slice(2);
  opt = {
    collision: join(ROOT, "tools/harness/state/eden/nss-golf-x/collision"),
    truth: join(ROOT, "tools/nss-truth.json"),
    registration: join(ROOT, "tools/nss-registration.json"),
    pins: join(ROOT, "tools/nss-pins.json"),
    out: join(ROOT, "public/terrain"),
    holes: null,
    allowMissing: new Set(),
  };
  const USAGE = "usage: node tools/build-terrain.mjs [--collision dir] [--truth tools/nss-truth.json] [--registration tools/nss-registration.json] [--pins tools/nss-pins.json] [--out public/terrain] [--holes 7,16] [--allow-missing water]";
  const extraNames = new Set(Object.values(EXTRAS).flat());
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--collision") opt.collision = resolve(args[++i]);
    else if (a === "--truth") opt.truth = resolve(args[++i]);
    else if (a === "--registration") opt.registration = resolve(args[++i]);
    else if (a === "--pins") opt.pins = resolve(args[++i]);
    else if (a === "--out") opt.out = resolve(args[++i]);
    else if (a === "--holes") opt.holes = args[++i].split(",").map(Number);
    else if (a === "--allow-missing") for (const m of (args[++i] ?? "").split(",")) {
      if (!extraNames.has(m)) { console.error(`--allow-missing: one of ${[...extraNames].join(", ")}, not "${m}"\n${USAGE}`); process.exit(1); }
      opt.allowMissing.add(m);
    }
    else { console.error(`unknown argument ${a}\n${USAGE}`); process.exit(1); }
  }
  const HOLES = opt.holes ?? Array.from({ length: 21 }, (_, i) => i + 1);
  if (HOLES.some((n) => !(Number.isInteger(n) && n >= 1 && n <= 21))) { console.error(`--holes: 1-21 only\n${USAGE}`); process.exit(1); }
  const OUT = opt.out;
  const readJson = (q) => JSON.parse(readFileSync(q, "utf8"));
  TRUTH = readJson(opt.truth).holes; REGJ = readJson(opt.registration); PINS = readJson(opt.pins).holes;

  // every file is written only after every hole has built
  let built;
  try { built = HOLES.map(buildHole); } catch (e) { console.error(`REFUSED: ${e.message}`); process.exit(1); }
  mkdirSync(OUT, { recursive: true });
  let prev = {};
  if (opt.holes) try { prev = JSON.parse(readFileSync(join(OUT, "index.json"), "utf8")).holes ?? {}; } catch {}
  const holes = { ...prev };
  let raw = 0, gz = 0, rawG = 0, gzG = 0;
  for (const { n, entry, tb, gb } of built) {
    writeFileSync(join(OUT, entry.file), tb); writeFileSync(join(OUT, entry.green.file), gb);
    holes[n] = entry;
    raw += tb.length; gz += gzipSync(tb, { level: 9 }).length; rawG += gb.length; gzG += gzipSync(gb, { level: 9 }).length;
  }
  const sorted = {};
  for (const k of Object.keys(holes).map(Number).sort((a, b) => a - b)) sorted[k] = holes[k];
  const index = {
    _note: "Course terrain for the app, written by tools/build-terrain.mjs from NSS's own collision (the Switch game's Fld_GolfCourseNN field meshes with the six HoleCovers closing the cups, and on H3 the separate sea actor Object_BGOBJ_GolfCourse03Water) by vertical ray casts through tools/nss-registration.json; read by src/terrain.js. hNN.bin: the ground height and surface class on a w x h grid over the 250x304 map frame (sample (i, j) = the map px square [2i, 2i+2) x [2j, 2j+2), its centre at ((i+0.5)/w, (j+0.5)/h)): the height the ray at the centre lands on, in ydPerUnit above the hole's datum (NSS y 0 = the WSR player start's height; datumY = it in WSR's KCL units, 0.1 m, datumYd in yd), nodata where no ground lies under it; the class the majority of 4x4 rays over the cell (classNames: the KCL vocabulary plus 17, sand OB; codeToClass maps the NSS surface codes). gNN.bin: heights over nss-truth.json's green box + margin at stepYd, in unitYd above z0Yd (the green's mean height above the datum), with a mask of the nodes whose ray lands on the green. Byte layouts in the tool's header; both files repeat their own sizes, datum, box and units in a header. classes: per-hole sample counts by class; noHeight: samples with no ground; collisionSha1: the dump files read; datumWsrMeshY: the WSR start's height in KCL units (tools/nss-pins.json), against datumY; missing (only on a build run with --allow-missing): the separate collision actors the hole was built without.",
    source: "nss",
    version: LAYOUT, w: GW, h: GH, mapPxPerSample: GRID_PX, classRaysPerSample: SUB * SUB, ydPerUnit: Z_UNIT_YD, nodata: NODATA, headerBytes: HEADER,
    classNames: CLASS_NAMES, codeToClass: CLASS_OF,
    green: { stepYd: GREEN_STEP_YD, margin: GREEN_MARGIN, unitYd: GREEN_UNIT_YD, headerBytes: GREEN_HEADER },
    holes: sorted,
  };
  writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 1) + "\n");
  const kb = (v) => `${(v / 1024).toFixed(0)} KB`;
  console.log(`wrote ${relative(ROOT, OUT).startsWith("..") ? OUT : relative(ROOT, OUT)}: ${built.length} hole(s)${opt.holes ? ` (${Object.keys(holes).length} in index.json)` : ""}; terrain ${kb(raw)} raw / ${kb(gz)} gzip, greens ${kb(rawG)} raw / ${kb(gzG)} gzip`);
}

// run as a script (node tools/build-terrain.mjs ...), not when imported for classVote
const self = fileURLToPath(import.meta.url), argv1 = process.argv[1] ? resolve(process.argv[1]) : "";
if (process.platform === "win32" ? argv1.toLowerCase() === self.toLowerCase() : argv1 === self) main();
