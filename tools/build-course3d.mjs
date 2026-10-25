// public/course3d/ v2 (GENERATED, committed): the live solver's course
// (src/live3d.worker.js runs the harness's 3D model, tools/harness/lib/
// model3d.mjs, on it) from NSS's own collision meshes (the git-ignored eden
// dump, tools/harness/state/eden/nss-golf-x/collision, read through
// tools/lib/nsscol.mjs), on every hole 1-21:
//   - the field mesh (Fld_GolfCourseNN) with the six HoleCover plugs closing
//     every cup (the cup walls and bottoms, codes 30 and 31, are dropped: the
//     model keeps src/putt.js's measured capture window, so the green runs on
//     over each cup), H3's sea (the separate actor GolfCourse03Water, which
//     its field mesh lacks) when the dump has collision/h03-water.*, and the
//     TreeLeafNN canopies (collision/hNN-leaf.*);
//   - each NSS surface code as a model attribute (ATTR_MAP below: the KCL
//     vocabulary WSR's physics knows, plus 17 sand OB, 18 air OB, 19 trunk,
//     20 leaf, 21 palm leaf); any other code refuses the build;
//   - the trunks, leaves and palm leaves as a separate tree pack (the model
//     sweeps the ball against them, two-sided; model3d.mjs meshTreeHit), the
//     rest as the ground pack (the KCL-style one-sided prisms, 5 u thick);
//     these are the baked trees, nearly all of them the background forest
//     off the course;
//   - NSS's actor trees (the dump's trees.json, source "actor": an
//     Obj_Glf_<kind> bone where the game spawns a tree object with its own
//     collision mesh, which the dump does not hold yet; 444 of them, nearly
//     every tree in play) as WSR's analytic trees at their bones (meta.trees,
//     v1's format in mesh units: x, base, z from the bone, sx sy sz its scale,
//     kind 2 broadleaf / 3 conifer / 6 palm; no palm mesh, so a palm is WSR's
//     trunk capsule and frond slab), with the WSR tree each stands on (within
//     1 map px) for naming; the 36 decor trees (no collision in the game) are
//     left out;
//   - dropped and logged: zero-area triangles, the exact and reversed copies of
//     a triangle (Havok's (a,b,c,b) quads are double-sided cards; the ground
//     keeps the up-facing copy, else the first), down-facing (ny < -0.1)
//     rock / glass / object / barrier faces (buried undersides would push a
//     ball resting above them down through the 5 u slab), and triangles wholly
//     outside the crop box: the map frame, every playable triangle (fairway,
//     rough, bunker, green, fringe, the covers) and the air-OB fence, plus
//     CROP_M on every side (no playable or fence triangle is cut: refused);
//   - the vertices verbatim (NSS metres, float32 as the dump has them): the
//     browser converts them to WSR mesh units in doubles (mesh = 10 nss + O,
//     tools/nss-registration.json), so the course sits in WSR's KCL frame
//     (tools/mesh-registration.json stays valid: the cups land 0.002-0.081 px
//     from their NSS map spots through it), and builds the prisms with
//     model3d.mjs prismFromTri, the same code the harness and the tests run;
//   - per hole the six cups (meta.pins.c0..c5, mesh units at the cover's top:
//     the green surface over the cup) and the difficult ones, the tees (the
//     WSR start, which stays the local tee, and NSS's GlfTeeOBJ and
//     Glf_RotateOBJ for audit), the online platform's seven standing spots per
//     tier (tools/nss-platform.json: the mat the ball sits on, posed through
//     Glf_RotateOBJ), the baked trees for naming a hit on the tree pack
//     (meta.treeInfo: id, family, base), and the registration: the NSS
//     transform (pins.json, INTEGRATION.md D1) in mesh units, the one the
//     cups, the platform and public/terrain share.
// Refused (exit 1) unless --allow-missing: a hole without its TreeLeaf
// canopies (collision/hNN-leaf.*), H3 without its sea (h03-water.*), no
// trees.json or a hole missing from it.
// Files: hNN.bin (little-endian, each part 4-byte aligned: V float32 [nv][3]
// ground vertices, T uint16|uint32 [nt][3], A uint8 [nt]; TV, TT, TA the
// same for the tree pack), hNN.json, index.json (sizes, SHA-1s, the dump's
// SHA-1s). Deterministic: two runs write the same bytes. Rerun when the dump's
// collision, tools/nss-*.json or this mapping changes; then node
// tools/test-course3d.mjs and node tools/test-live3d.mjs.
//   node tools/build-course3d.mjs [--collision <dir>] [--out <dir>] [--trees <trees.json>] [--allow-missing]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadCollision } from "./lib/nsscol.mjs";
import { regOf, mapToNss, nssToMesh, platformToWorld, MAP_W, MAP_H } from "./lib/nssreg.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const DUMP = path.join(HERE, "harness", "state", "eden", "nss-golf-x");
const COLL = path.resolve(arg("--collision", path.join(DUMP, "collision")));
const TREES_FILE = path.resolve(arg("--trees", path.join(DUMP, "trees.json")));
const OUT = path.resolve(arg("--out", path.join(ROOT, "public", "course3d")));
const ALLOW_MISSING = process.argv.includes("--allow-missing");
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const REG = readJson(path.join(HERE, "nss-registration.json"));
const PINS = readJson(path.join(HERE, "nss-pins.json"));
const PLAT = readJson(path.join(HERE, "nss-platform.json"));
const fail = (m) => { console.error(`REFUSED: ${m}`); process.exit(1); };
// a missing input the course needs: refused, or with --allow-missing logged
const missingNotes = [];
const missing = (m) => { if (!ALLOW_MISSING) fail(`${m} (--allow-missing builds without it)`); missingNotes.push(m); };
if (!fs.existsSync(COLL)) fail(`no collision dump at ${COLL} (the eden exporter's output; git-ignored)`);
// the dump's tree decode (trees.json: the actor trees' bones, the baked trees
// for naming a hit); written by Python, whose json may carry bare NaN / Infinity
const TREES_TEXT = fs.existsSync(TREES_FILE) ? fs.readFileSync(TREES_FILE, "utf8") : null;
if (!TREES_TEXT) missing(`no ${path.relative(ROOT, TREES_FILE).replace(/\\/g, "/")}: the actor trees would have no collision`);
const TREES = TREES_TEXT ? JSON.parse(TREES_TEXT.replace(/([:\[,]\s*)-?(?:NaN|Infinity)(?=\s*[,\]}])/g, "$1null")) : null;
// the extras each hole must have: TreeLeaf canopies everywhere, H3's sea
const EXPECT = (hole) => (hole === 3 ? ["leaf", "water"] : ["leaf"]);
// trees.json's family as WSR's tree kind (the analytic shapes, model3d.mjs TREE_SHAPE)
const KIND = { broadleaf: 2, conifer: 3, palm: 6 };

// NSS surface code -> model attribute (INTEGRATION.md 1.2); 30 GolfCupside and
// 31 GolfCup are dropped (every cup is closed by its cover)
const ATTR_MAP = { 5: 1, 6: 2, 7: 3, 8: 7, 10: 4, 18: 6, 24: 9, 32: 12, 34: 12, 40: 12, 44: 12, 36: 17, 39: 18, 37: 19, 25: 20, 43: 21 };
const ATTR_LABEL = { 1: "fairway", 2: "rough", 3: "bunker", 4: "ob", 6: "green", 7: "water", 9: "fringe", 12: "wall", 17: "sand OB", 18: "air OB", 19: "trunk", 20: "leaf", 21: "palm leaf" };
const DROP_CODES = new Set([30, 31]);
const TREE_ATTRS = new Set([19, 20, 21]);
const PLAY_CODES = new Set([5, 6, 7, 18, 24]);
const FENCE_CODE = 39;
const BACKFACE_CODES = new Set([32, 34, 40, 44]);
const BACKFACE_NY = -0.1;
const CROP_M = 50;
const THICK = 5;   // u: the ground's prism thickness (WSR's KCL); the tree pack needs none (model3d.mjs sweeps it)
const COVER_BONE_MM = 4, PIN_PX = 0.1, SLOT_PX = 0.05;
const sha1 = (b) => crypto.createHash("sha1").update(b).digest("hex");
const pad2 = (n) => String(n).padStart(2, "0");
const r4 = (v) => +v.toFixed(4);

// a little-endian file from typed arrays, each 4-byte aligned; their offsets
function pack(parts) {
  let size = 0; const offs = {};
  for (const [k, a] of parts) { size = Math.ceil(size / 4) * 4; offs[k] = size; size += a.byteLength; }
  const buf = Buffer.alloc(size);
  for (const [k, a] of parts) Buffer.from(a.buffer, a.byteOffset, a.byteLength).copy(buf, offs[k]);
  return { buf, offs };
}

// the hole's NSS registration in WSR mesh units: map fraction = m2f * [X, Z, 1]
// (X = 10 x + Ox, Z = 10 z + Oz), and its inverse
function meshReg(reg) {
  const u = reg.unitsPerM, [Ox, Oz] = reg.originMesh, a = reg.a, b = reg.b;
  const m2f = [
    [a / u / MAP_W, -b / u / MAP_W, (reg.tx - (a * Ox - b * Oz) / u) / MAP_W],
    [b / u / MAP_H, a / u / MAP_H, (reg.ty - (b * Ox + a * Oz) / u) / MAP_H],
  ];
  const det = m2f[0][0] * m2f[1][1] - m2f[0][1] * m2f[1][0];
  const i00 = m2f[1][1] / det, i01 = -m2f[0][1] / det, i10 = -m2f[1][0] / det, i11 = m2f[0][0] / det;
  const f2m = [[i00, i01, -(i00 * m2f[0][2] + i01 * m2f[1][2])], [i10, i11, -(i10 * m2f[0][2] + i11 * m2f[1][2])]];
  return { m2f, f2m };
}
const apply = (B, X, Z) => [B[0][0] * X + B[0][1] * Z + B[0][2], B[1][0] * X + B[1][1] * Z + B[1][2]];
const pxOff = (f, x, y) => Math.sqrt(((f[0] - x) * MAP_W) ** 2 + ((f[1] - y) * MAP_H) ** 2);

// the top of the triangles [t0, t1) over (x, z), NSS metres, or null
function topOver(m, t0, t1, x, z) {
  let best = null;
  for (let t = t0; t < t1; t++) {
    const v = [0, 1, 2].map((k) => m.tris[3 * t + k]);
    const ax = m.verts[3 * v[0]], az = m.verts[3 * v[0] + 2], bx = m.verts[3 * v[1]], bz = m.verts[3 * v[1] + 2], cx = m.verts[3 * v[2]], cz = m.verts[3 * v[2] + 2];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (!d) continue;
    const l0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l2 = 1 - l0 - l1;
    if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
    const y = l0 * m.verts[3 * v[0] + 1] + l1 * m.verts[3 * v[1] + 1] + l2 * m.verts[3 * v[2] + 1];
    if (best == null || y > best) best = y;
  }
  return best;
}

fs.mkdirSync(OUT, { recursive: true });
const index = {
  version: 2, src: "nss",
  _note: "NSS's collision meshes for the live solver (tools/build-course3d.mjs; src/live3d-core.js buildCourse reads them): per hole hNN.bin (V/T/A the ground pack, TV/TT/TA the tree pack; vertices in NSS metres, mesh = unitsPerM * nss + O) and hNN.json; WSR's physics (tools/harness/lib/model3d.mjs) on NSS's course",
  unitsPerM: 10, thick: THICK, cropM: CROP_M, attrMap: ATTR_MAP, attrs: ATTR_LABEL, holes: {}, source: {},
};
if (TREES_TEXT) index.source.trees = sha1(TREES_TEXT);
let total = 0;
for (let hole = 1; hole <= 21; hole++) {
  const hh = pad2(hole), reg = regOf(REG, hole), O = [reg.originMesh[0], reg.originMeshY, reg.originMesh[1]], U = reg.unitsPerM;
  const m = loadCollision(COLL, hole, { covers: true, extras: ["leaf", "water"] });
  for (const x of EXPECT(hole)) if (!m.sha1[x]) missing(`H${hole}: no collision/h${hh}-${x}.* (${x === "leaf" ? "its TreeLeaf canopies" : "its sea"})`);
  const partOf = new Array(m.nt);
  for (const p of m.parts) for (let t = p.tri0; t < p.tri1; t++) partOf[t] = p.name.startsWith("cover") ? "cover" : p.name;
  const code = m.surface, V = m.verts, Tr = m.tris;
  // ---- per triangle: attribute, normal, xz box ----
  const nt = m.nt, attr = new Uint8Array(nt), ny = new Float64Array(nt), box = new Float64Array(4 * nt);
  const drop = { cup: 0, zero: 0, crop: 0, backface: 0, dup: 0 }, unknown = {};
  const keep = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    const c = code[t];
    if (DROP_CODES.has(c)) { drop.cup++; continue; }
    const a = ATTR_MAP[c];
    if (a == null) { unknown[c] = (unknown[c] ?? 0) + 1; continue; }
    attr[t] = a;
    const i0 = 3 * Tr[3 * t], i1 = 3 * Tr[3 * t + 1], i2 = 3 * Tr[3 * t + 2];
    const e1x = V[i1] - V[i0], e1y = V[i1 + 1] - V[i0 + 1], e1z = V[i1 + 2] - V[i0 + 2], e2x = V[i2] - V[i0], e2y = V[i2 + 1] - V[i0 + 1], e2z = V[i2 + 2] - V[i0 + 2];
    const nx = e1y * e2z - e1z * e2y, nY = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x, L = Math.sqrt(nx * nx + nY * nY + nz * nz);
    if (!(L > 1e-12)) { drop.zero++; continue; }
    ny[t] = nY / L;
    box[4 * t] = Math.min(V[i0], V[i1], V[i2]); box[4 * t + 1] = Math.max(V[i0], V[i1], V[i2]);
    box[4 * t + 2] = Math.min(V[i0 + 2], V[i1 + 2], V[i2 + 2]); box[4 * t + 3] = Math.max(V[i0 + 2], V[i1 + 2], V[i2 + 2]);
    keep[t] = 1;
  }
  if (Object.keys(unknown).length) fail(`H${hole}: NSS codes with no model attribute: ${JSON.stringify(unknown)}`);
  // ---- the crop box: the map frame, the playable triangles and the air-OB fence, + CROP_M ----
  const cs = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([fx, fy]) => mapToNss(reg, fx, fy));
  const crop = [Math.min(...cs.map((c) => c[0])), Math.max(...cs.map((c) => c[0])), Math.min(...cs.map((c) => c[1])), Math.max(...cs.map((c) => c[1]))];
  const vital = (t) => PLAY_CODES.has(code[t]) || code[t] === FENCE_CODE || partOf[t] === "cover";
  for (let t = 0; t < nt; t++) if (keep[t] && vital(t)) { crop[0] = Math.min(crop[0], box[4 * t]); crop[1] = Math.max(crop[1], box[4 * t + 1]); crop[2] = Math.min(crop[2], box[4 * t + 2]); crop[3] = Math.max(crop[3], box[4 * t + 3]); }
  crop[0] -= CROP_M; crop[1] += CROP_M; crop[2] -= CROP_M; crop[3] += CROP_M;
  const cropByPart = {};
  for (let t = 0; t < nt; t++) {
    if (!keep[t]) continue;
    if (box[4 * t + 1] < crop[0] || box[4 * t] > crop[1] || box[4 * t + 3] < crop[2] || box[4 * t + 2] > crop[3]) {
      if (vital(t)) fail(`H${hole}: playable or fence triangle ${t} outside the crop box`);
      keep[t] = 0; drop.crop++; cropByPart[partOf[t]] = (cropByPart[partOf[t]] ?? 0) + 1;
    }
  }
  // ---- down-facing rock / glass / object / barrier faces ----
  const otherDown = {};
  for (let t = 0; t < nt; t++) {
    if (!keep[t] || !(ny[t] < BACKFACE_NY)) continue;
    if (BACKFACE_CODES.has(code[t])) { keep[t] = 0; drop.backface++; }
    else if (!TREE_ATTRS.has(attr[t])) otherDown[code[t]] = (otherDown[code[t]] ?? 0) + 1;
  }
  // ---- duplicates (the same three positions), per pack: the ground keeps the
  // up-facing copy (then the first), the trees (two-sided) the first ----
  const groups = new Map(), mixed = {};
  const pkey = (i) => `${V[3 * i]},${V[3 * i + 1]},${V[3 * i + 2]}`;
  for (let t = 0; t < nt; t++) {
    if (!keep[t]) continue;
    const k = (TREE_ATTRS.has(attr[t]) ? "T" : "G") + [pkey(Tr[3 * t]), pkey(Tr[3 * t + 1]), pkey(Tr[3 * t + 2])].sort().join("|");
    const g = groups.get(k);
    if (!g) { groups.set(k, t); continue; }
    const tree = TREE_ATTRS.has(attr[t]);
    if (attr[g] !== attr[t]) { const mk = `${code[g]}+${code[t]}`; mixed[mk] = (mixed[mk] ?? 0) + 1; }
    if (!tree && ny[t] > ny[g]) { keep[g] = 0; groups.set(k, t); } else keep[t] = 0;
    drop.dup++;
  }
  // ---- the two packs: vertices compacted in first-use order ----
  const build = (isTree) => {
    const vmap = new Map(), verts = [], idx = [], at = [];
    for (let t = 0; t < nt; t++) {
      if (!keep[t] || TREE_ATTRS.has(attr[t]) !== isTree) continue;
      for (let k = 0; k < 3; k++) {
        const vi = Tr[3 * t + k];
        let j = vmap.get(vi);
        if (j == null) { j = verts.length / 3; vmap.set(vi, j); verts.push(V[3 * vi], V[3 * vi + 1], V[3 * vi + 2]); }
        idx.push(j);
      }
      at.push(attr[t]);
    }
    const nv = verts.length / 3, wide = nv > 65535;
    return { nv, nt: at.length, wide, V: new Float32Array(verts), T: wide ? new Uint32Array(idx) : new Uint16Array(idx), A: new Uint8Array(at) };
  };
  const G = build(false), TP = build(true);
  const { buf, offs } = pack([["V", G.V], ["T", G.T], ["A", G.A], ["TV", TP.V], ["TT", TP.T], ["TA", TP.A]]);
  fs.writeFileSync(path.join(OUT, `h${hh}.bin`), buf);
  const byAttr = {};
  for (const a of [...G.A, ...TP.A]) byAttr[a] = (byAttr[a] ?? 0) + 1;
  if (!byAttr[6]) fail(`H${hole}: no green`);
  // ---- the cups: the cover's top over the bone, mesh units ----
  const { m2f, f2m } = meshReg(reg);
  const cups = PINS.holes[hole].cups;
  if (cups.length !== 6) fail(`H${hole}: ${cups.length} cups`);
  const pins = {}, cupAudit = [];
  for (const c of cups) {
    const cv = m.covers.find((x) => x.k === c.k);
    if (!cv) fail(`H${hole} c${c.k}: no cover`);
    const y = topOver(m, cv.tri0, cv.tri1, c.world[0], c.world[2]);
    if (y == null) fail(`H${hole} c${c.k}: cover ${c.k} is not over the cup bone`);
    const hub = c.cover?.hub ?? cv.centre, dmm = 1000 * Math.sqrt((hub[0] - c.world[0]) ** 2 + (hub[2] - c.world[2]) ** 2);
    if (!(dmm <= COVER_BONE_MM)) fail(`H${hole} c${c.k}: cover ${dmm.toFixed(2)} mm from its bone`);
    const P = nssToMesh(reg, [c.world[0], y, c.world[2]]).map(r4);
    if (Math.abs(P[1] - c.mesh[1]) > 0.01 || Math.abs(P[0] - c.mesh[0]) > 0.01 || Math.abs(P[2] - c.mesh[2]) > 0.01) fail(`H${hole} c${c.k}: mesh ${P} against nss-pins.json's ${c.mesh}`);
    const off = pxOff(apply(m2f, P[0], P[2]), c.x, c.y);
    if (!(off <= PIN_PX)) fail(`H${hole} c${c.k}: ${off.toFixed(3)} px from its map spot`);
    pins[`c${c.k}`] = P;
    cupAudit.push(+off.toFixed(4));
  }
  // ---- tees (audit: the local tee stays the WSR start, INTEGRATION.md D3) ----
  const T0 = PINS.holes[hole].tees, tm = (w) => nssToMesh(reg, w).map(r4);
  const tee = { wsrStart: tm(T0.wsrStart.world), teeObj: tm(T0.teeObj.world), rotateObj: tm(T0.rotateObj.world) };
  // ---- the platform: the seven standing spots per tier, on the mat ----
  const ph = PLAT.holes[hole];
  const tiers = {};
  let slotOff = 0;
  for (const tier of ["low", "high"]) {
    const TI = PLAT.tiers[tier];
    tiers[tier] = ph.tiers[tier].map((p) => {
      const w = platformToWorld(ph.origin, ph.yawDeg, [p.localX, TI.matY, TI.localZ]);
      if (Math.abs(w[0] - p.world[0]) > 6e-4 || Math.abs(w[1] - p.world[1]) > 6e-4 || Math.abs(w[2] - p.world[2]) > 6e-4) fail(`H${hole} ${tier} ${p.fromLeft}: ${w} against nss-platform.json's ${p.world}`);
      const P = nssToMesh(reg, w).map(r4), off = pxOff(apply(m2f, P[0], P[2]), p.x, p.y);
      if (!(off <= SLOT_PX)) fail(`H${hole} ${tier} ${p.fromLeft}: ${off.toFixed(3)} px from nss-platform.json's map spot`);
      slotOff = Math.max(slotOff, off);
      return { fromLeft: p.fromLeft, localX: p.localX, ...(p.side ? { side: p.side } : { between: p.between }), X: P[0], Y: P[1], Z: P[2] };
    });
  }
  const platform = { yawDeg: ph.yawDeg, facingDeg: ph.facingDeg, origin: tm(ph.origin), tiers };
  // ---- the trees: the actor trees as WSR's analytic trees at their bones,
  // the baked ones (their collision in the two packs) for naming a hit ----
  const th = TREES?.holes?.[hh];
  if (TREES && !th) missing(`H${hole}: not in ${path.basename(TREES_FILE)}`);
  const wsrOf = (t) => (t.wsr && t.wsr.distPx <= 1 ? t.wsr.id : null);
  const trees = [], treeInfo = [], tally = { actor: {}, field: 0, none: 0 };
  for (const t of th?.trees ?? []) {
    if (t.source === "none") { tally.none++; continue; }
    if (t.source === "field") {
      const P = nssToMesh(reg, t.base);
      treeInfo.push({ id: t.id, kind: t.family, X: r4(P[0]), Z: r4(P[2]), wsr: wsrOf(t) });
      tally.field++;
      continue;
    }
    if (t.source !== "actor") fail(`H${hole} ${t.id}: tree source ${t.source}`);
    const kind = KIND[t.family], s = t.srt?.scale, w = t.srt?.translate;
    if (!kind) fail(`H${hole} ${t.id}: tree family ${t.family}`);
    if (!(s?.length === 3 && s.every((v) => Number.isFinite(v) && v > 0) && w?.length === 3 && w.every(Number.isFinite))) fail(`H${hole} ${t.id}: actor tree without a bone's scale and translation`);
    const P = nssToMesh(reg, w);
    trees.push({ id: t.id, kind, x: r4(P[0]), base: r4(P[1]), z: r4(P[2]), sx: r4(s[0]), sy: r4(s[1]), sz: r4(s[2]), src: "actor", nss: t.kind, wsr: wsrOf(t) });
    tally.actor[t.family] = (tally.actor[t.family] ?? 0) + 1;
  }
  const meta = {
    version: 2, src: "nss", hole, id: m.meta.shape, O, unitsPerM: U, thick: THICK,
    nv: G.nv, nt: G.nt, idx: G.wide ? "u32" : "u16", ntv: TP.nv, ntt: TP.nt, tidx: TP.wide ? "u32" : "u16", offs, bytes: buf.length,
    grid: [crop[0], crop[1], crop[2], crop[3]].map((v, i) => r4(U * v + (i < 2 ? O[0] : O[2]))),
    counts: { field: m.parts.find((p) => p.name === "field").tri1, covers: m.covers.reduce((s, c) => s + c.tri1 - c.tri0, 0), leaf: m.sha1.leaf ? m.parts.find((p) => p.name === "leaf").tri1 - m.parts.find((p) => p.name === "leaf").tri0 : 0, water: m.sha1.water ? m.parts.find((p) => p.name === "water").tri1 - m.parts.find((p) => p.name === "water").tri0 : 0, dropped: drop, croppedByPart: cropByPart, mixedDuplicates: mixed, downFacingKept: otherDown, byAttr },
    pins, difficult: cups.filter((c) => c.difficult).map((c) => c.k), tee, platform, trees, treeInfo, decorTrees: tally.none,
    reg: { src: "nss", m2f, f2m },
  };
  fs.writeFileSync(path.join(OUT, `h${hh}.json`), JSON.stringify(meta));
  index.holes[hole] = { bin: `h${hh}.bin`, json: `h${hh}.json`, bytes: buf.length, sha1: sha1(buf), tris: G.nt, treeTris: TP.nt, verts: G.nv, treeVerts: TP.nv, actorTrees: trees.length };
  index.source[hole] = m.sha1;
  total += buf.length;
  const fmt = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(`hole ${hole}: ${G.nt} ground + ${TP.nt} tree tris (${G.nv} + ${TP.nv} verts), ${(buf.length / 1024).toFixed(0)} KB; dropped ${fmt(drop)}${Object.keys(cropByPart).length ? ` (crop: ${fmt(cropByPart)})` : ""}${Object.keys(mixed).length ? `; mixed-code duplicates ${fmt(mixed)}` : ""}${Object.keys(otherDown).length ? `; down-facing kept ${fmt(otherDown)}` : ""}; cups ${Math.max(...cupAudit).toFixed(4)} px, platform ${slotOff.toFixed(4)} px; trees: ${trees.length} actor as WSR's shapes (${fmt(tally.actor)}), ${tally.field} baked, ${tally.none} decor left out${m.sha1.leaf ? "" : "; NO leaf canopies"}`);
}
// v1's palm mesh has no place in v2
for (const f of fs.readdirSync(OUT)) if (f === "palm.bin") fs.unlinkSync(path.join(OUT, f));
if (missingNotes.length) index.missing = missingNotes;
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1));
console.log(`21 holes, ${(total / 1024 / 1024).toFixed(1)} MB${missingNotes.length ? `; built WITHOUT (--allow-missing): ${missingNotes.join("; ")}` : ""}`);
