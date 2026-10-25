// Acceptance for the live solver (src/live3d-core.js): NSS's ball (src/nsssim.js)
// on NSS's course (public/course3d v2 through tools/lib/nss3d.mjs):
//  1. with the dump present (tools/harness/state/eden/nss-golf-x/collision), a
//     fresh build of public/course3d is byte-identical to the shipped files, else
//     "skipped";
//  2. per hole, the course the solver flies over holds the shipped triangles
//     exactly (the float32 vertices verbatim, each model attribute as the ball's,
//     the six covers out of the static course, every cup's own walls and bottom in,
//     the tree pack, the actor trees from their kinds' meshes);
//     the cull in front of meshGround changes no bit (strokes over the culled and
//     the plain mesh); the local start is NSS's GlfTeeOBJ teed up 0.1 m, within
//     0.05 px of derived.json's teeNss.teeObj, lie tee; platformSpot finds the 14
//     standing spots by fromLeft, localX and side; every platform ball
//     src/platform.js places (each layout NSS makes, tier, place and hand) is
//     where ballAtStart puts it, within 0.01 px, 0.1 m over its tier's mat;
//  3. the 71 strokes recorded in Eden (tools/fixtures/nss-flights) and the RAM
//     player's two round-1 drives through actor trees (RPLAY below, from
//     tools/harness/state/eden/rplay.jsonl) through the solver's own course and
//     NSS's physics, the flagstick in for every stroke but a putt from the green (as
//     tools/test-nsssim.mjs replays them): each recorded tee shot starts where the
//     local start puts the ball (1 mm); with the dump, every one of the 73 the same
//     bits as over the dump's own collision (tools/lib/nsscol.mjs with the TreeLeaf
//     canopies, H3's sea and the actor trees, the cup in play's cover out); every
//     stroke the model plays to a rest off the cup (tools/test-nsssim.mjs's set: not
//     its three documented edge cases) rests within REST_TOL_M of the recording, and
//     the same bits as over the fixture's own triangles when they hold all it met (not
//     an actor tree's); every recorded holed putt holes; h08s6's lip-out lips out; the
//     eight strokes through actor trees (TREE_STROKES) rest within TREE_TOL_M of the
//     recording wherever the dump's replay does (r1-h16s1, whose rough bounce after
//     the canopy the model misses, over the dump too, excepted without the dump), and
//     nearer it than on the course without them; the solver's own launch (club, gauge
//     percent, heading) is the recording's to 2e-4;
//  4. solves from the tee to cup c0 on holes 2, 3, 8, 10, 12, 16, 17, 19, 20, 21
//     (11 mph wind toward 45 deg): a rec per club, sorted (holed for sure first: a
//     stroke that meets the flagstick is sure only if it holes with the flag out too),
//     finite numbers, each at a whole gauge percent within its club's range, a rec
//     that met the flagstick saying so (uncertain, with the stroke as if the flag were
//     out), at most MAX_S; from the green (the putter alone, the flag out) and from
//     the platform on two of them; the same solve twice gives the same result;
//  and prints (does not assert) on every hole the same driver / 7-iron / wedge
//  full tee strokes toward c0 by NSS's ball on NSS's course and by WSR's ball on
//  WSR's (tools/harness/round-model.mjs, the disc's KCL, when the extracted disc
//  is there): carry and rest, and their differences.
//   node tools/test-live3d.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as L from "../src/live3d-core.js";
import * as S from "../src/nsssim.js";
import { nssCourse, ATTR_OF_MODEL, culledGround, PLATFORM_TIERS, placeActorTree } from "./lib/nss3d.mjs";
import { ballOf, VALID_COUNTS, TIERS, HANDS } from "../src/platform.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "public/course3d");
const DUMP = path.join(ROOT, "tools/harness/state/eden/nss-golf-x/collision");
const FIX = path.join(ROOT, "tools/fixtures/nss-flights");
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const hh = (n) => String(n).padStart(2, "0");
const pxOff = (f, x, y) => Math.sqrt(((f[0] - x) * 250) ** 2 + ((f[1] - y) * 304) ** 2);
const REST_TOL_M = 0.1, TREE_TOL_M = 0.3, MAX_S = 3;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log(`FAIL ${m}`); } };
const idx = read(path.join(DIR, "index.json"));
ok(idx.version === 2, `public/course3d is v2 (${idx.version})`);

// ---- 1. a fresh build, byte for byte ----
if (fs.existsSync(DUMP)) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "course3d-"));
  const t0 = performance.now();
  execFileSync(process.execPath, [path.join(ROOT, "tools/build-course3d.mjs"), "--out", tmp], { stdio: "pipe" });
  const files = fs.readdirSync(DIR).sort(), fresh = fs.readdirSync(tmp).sort();
  const same = files.length === fresh.length && files.every((f, i) => f === fresh[i] && fs.readFileSync(path.join(DIR, f)).equals(fs.readFileSync(path.join(tmp, f))));
  ok(same, `a fresh build is byte-identical to public/course3d (${fresh.length} files, ${files.length} shipped)`);
  console.log(`1. fresh build: ${fresh.length} files in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${same ? "byte-identical" : "DIFFERENT"}`);
  fs.rmSync(tmp, { recursive: true, force: true });
} else console.log(`1. fresh build: skipped (no dump at ${path.relative(ROOT, DUMP)})`);

const metaOf = (hole) => read(path.join(DIR, `h${hh(hole)}.json`));
const binOf = (hole) => ab(path.join(DIR, `h${hh(hole)}.bin`));
const courses = new Map();
const course = (hole) => { if (!courses.has(hole)) courses.set(hole, L.buildCourse(metaOf(hole), binOf(hole))); return courses.get(hole); };
const DERIVED = read(path.join(ROOT, "public/derived.json"));

// ---- 2. the course, the starts ----
let teeMax = 0, platMax = 0, platN = 0, buildMs = 0;
for (let hole = 1; hole <= 21; hole++) {
  const meta = metaOf(hole), bin = binOf(hole);
  const t0 = performance.now();
  const C = L.buildCourse(meta, bin);
  buildMs += performance.now() - t0;
  courses.set(hole, C);
  const { N } = C, { verts, tris, attr } = N.arrays;
  // the shipped triangles, verbatim: the ground pack less the covers, then the tree pack
  const o = meta.offs, ix = (k, t, n) => (t === "u32" ? new Uint32Array(bin, o[k], n) : new Uint16Array(bin, o[k], n));
  const packs = [[new Float32Array(bin, o.V, 3 * meta.nv), ix("T", meta.idx, 3 * meta.nt), new Uint8Array(bin, o.A, meta.nt), meta.nt], [new Float32Array(bin, o.TV, 3 * meta.ntv), ix("TT", meta.tidx, 3 * meta.ntt), new Uint8Array(bin, o.TA, meta.ntt), meta.ntt]];
  const covers = new Set(Object.values(N.cups).flatMap((c) => c.tris));
  let j = 0, same = true;
  packs.forEach(([V, T, A, n], p) => {
    for (let t = 0; t < n && same; t++) {
      if (p === 0 && covers.has(t)) continue;
      for (let k = 0; k < 3; k++) { const a = 3 * T[3 * t + k], b = 3 * tris[3 * j + k]; same &&= verts[b] === V[a] && verts[b + 1] === V[a + 1] && verts[b + 2] === V[a + 2]; }
      same &&= attr[j] === ATTR_OF_MODEL[A[t]];
      j++;
    }
  });
  ok(same && covers.size === 120 && N.nGround === meta.nt - 120 && N.nBaked === meta.ntt && j === N.nGround + N.nBaked, `H${hole}: the course holds the shipped triangles verbatim (${N.nGround} ground, the 120 cover triangles apart; ${N.nBaked} tree pack)`);
  // the actor trees: each its kind's triangles, placed (nss3d.mjs placeActorTree), after the tree pack
  {
    const KV = new Float32Array(bin, o.KV, 3 * meta.nkv), KT = new Uint16Array(bin, o.KT, 3 * meta.nkt), KA = new Uint8Array(bin, o.KA, meta.nkt);
    let t0 = N.nGround + N.nBaked, same = N.trees.length === meta.trees.length;
    for (const t of meta.trees) {
      if (!same) break;
      const k = meta.kinds[t.k], W = placeActorTree(KV.subarray(3 * k.v0, 3 * (k.v0 + k.nv)), t.S, t.R, t.T);
      for (let j = 0; j < k.nt && same; j++, t0++) {
        for (let q = 0; q < 3; q++) { const a = 3 * tris[3 * t0 + q], b = 3 * (KT[3 * (k.t0 + j) + q] - k.v0); same &&= verts[a] === W[b] && verts[a + 1] === W[b + 1] && verts[a + 2] === W[b + 2]; }
        same &&= attr[t0] === ATTR_OF_MODEL[KA[k.t0 + j]];
      }
    }
    ok(same && t0 === attr.length && N.nActor === meta.trees.reduce((s, t) => s + meta.kinds[t.k].nt, 0), `H${hole}: ${N.trees.length} actor trees, their kinds' meshes placed (${N.nActor} triangles, the course's last)`);
  }
  ok(Object.values(N.cups).every((c) => c.tris.length === 20 && c.own >= 100) && [...attr.subarray(0, N.nGround)].filter((a) => a === S.ATTR.cup).length === 120, `H${hole}: six covers of 20 triangles, every cup's own walls and bottom (${Object.values(N.cups).map((c) => c.own).join(" ")} triangles) in the course`);
  // the cull changes no bit: strokes over the culled course and over the plain mesh
  {
    const S0 = L.ballAtStart(C, { start: { kind: "local" } }), pin = N.cups.c0;
    const h = Math.atan2(pin.x - S0.pos[0], -(pin.z - S0.pos[2])) * 180 / Math.PI;
    const plain = S.meshGround({ verts, tris, attr }, { cell: 4 });
    let bits = true;
    for (const [club, power] of [["driver", 1], ["7iron", 0.8], ["wedge", 0.5]]) {
      const run = (ground) => S.run({ club, power, lie: "tee", start: S0.pos, heading: h, ground, stopAtHazard: false });
      const a = run(culledGround(plain, verts, tris, attr.length)), b = run(plain);
      bits &&= a.ticks === b.ticks && a.rest.every((v, i) => Object.is(v, b.rest[i])) && a.outcome === b.outcome;
    }
    ok(bits, `H${hole}: the culled ground flies three tee strokes to the same bits as the plain mesh`);
  }
  // the local start: GlfTeeOBJ, teed up
  {
    const S0 = L.ballAtStart(C, { start: { kind: "local" } }), t = DERIVED.holes?.[hole]?.teeNss?.teeObj;
    const off = t ? pxOff(S0.from.map, t.x, t.y) : Infinity, T = N.nssOf(meta.tee.teeObj), g = N.topGround(T[0], T[2]);
    teeMax = Math.max(teeMax, off);
    ok(S0.lie.model === 15 && S0.from.kind === "local" && off <= 0.05 && S0.pos[0] === T[0] && S0.pos[2] === T[2] && Math.abs(S0.pos[1] - g.y - 0.1) < 1e-12, `H${hole}: the local start is GlfTeeOBJ teed up 0.1 m (${off.toFixed(4)} px from derived.json's teeNss.teeObj), lie ${S0.lie.model}`);
  }
  // platformSpot: the same spot by fromLeft, by localX and by side
  {
    let sameSpot = true, n = 0;
    for (const tier of ["low", "high"]) for (const s of meta.platform.tiers[tier]) {
      sameSpot &&= L.platformSpot(meta, { kind: "platform", tier, fromLeft: s.fromLeft }) === s && L.platformSpot(meta, { kind: "platform", tier, localX: s.localX }) === s;
      if (s.side) { sameSpot &&= L.platformSpot(meta, { kind: "platform", tier, side: s.side }) === s; n++; }
    }
    ok(sameSpot && n === 8 && L.platformSpot(meta, { kind: "platform", tier: "low", localX: 0.5 }) === null && L.platformSpot(meta, { kind: "platform", tier: "mid", fromLeft: 0 }) === null, `H${hole}: platformSpot finds the 14 spots by fromLeft, localX and (${n}) by side, and nothing for a spot or tier that is not there`);
  }
  // every platform ball the app places (src/platform.js on derived.json's platform)
  {
    const P = DERIVED.holes?.[hole]?.platform;
    let worst = 0, mat = true, n = 0;
    for (const [countHigh, countLow] of VALID_COUNTS) for (const tier of TIERS) {
      const count = tier === "high" ? countHigh : countLow;
      for (let place = 1; place <= count; place++) for (const hand of HANDS) {
        const b = ballOf(P, { tier, countHigh, countLow, place, hand });
        if (!b) { worst = Infinity; continue; }
        const B = L.ballAtStart(C, { ball: b, start: { kind: "platform", tier, hand, ballLocalX: b.localX } });
        worst = Math.max(worst, pxOff(B.from.map, b.x, b.y));
        mat &&= B.lie.model === 15 && Math.abs(B.pos[1] - (N.platformOrigin[1] + PLATFORM_TIERS[tier].matY + 0.1)) < 1e-9;
        // the same ball from a standing spot and the hand
        const s = meta.platform.tiers[tier].find((q) => Math.abs(q.localX - b.standX) < 1e-9);
        const B2 = L.ballAtStart(C, { start: { kind: "platform", tier, localX: s.localX, hand } });
        mat &&= Math.abs(B2.pos[0] - B.pos[0]) < 1e-9 && Math.abs(B2.pos[2] - B.pos[2]) < 1e-9;
        n++;
      }
    }
    platMax = Math.max(platMax, worst); platN += n;
    ok(worst <= 0.01 && mat, `H${hole}: the ${n} platform balls src/platform.js places, within ${worst.toFixed(4)} px, 0.1 m over their mats`);
  }
}
console.log(`2. 21 courses built in ${(buildMs / 1000).toFixed(1)} s; local starts within ${teeMax.toFixed(4)} px of derived.json's GlfTeeOBJ; ${platN} platform balls within ${platMax.toFixed(4)} px of src/platform.js's`);

// ---- 3. the recorded strokes ----
const fixIndex = read(path.join(FIX, "index.json"));
const strokes = fixIndex.strokes.map((s) => read(path.join(FIX, `${s.tag}.json`)));
ok(strokes.length === 71, `${strokes.length} recorded strokes`);
// the RAM player's round-1 drives through actor trees (tools/harness/state/eden/rplay.jsonl, 2026-10-25: the shot
// record as it logged it; r1-h16s1's launch from its RAM recording lab/rplay/r1-h16s1-WD1.npz, r1-h03s1's from the
// log alone, its recording overwritten by round 2's): the launch, the wind object, the cup and the recorded rest
const RPLAY = [
  { tag: "r1-h03s1-dr", hole: 3, stroke: 1, club: "WD1", power: 1, lie: "tee", launch: { start: [-2.2799, 0.1, -4.7721], v0: [-17.15412, 10.49677, -53.97514], hop: 3, side: 0, backspin: 0, yRef: 0.1 }, wind: { s: 5, dirRad: 1.5707963705062866 }, cup: { k: 0, world: [4.8362, -8.2015, -483.8305] }, rest: [-54.52108, -17.89741, -229.05116], outcome: "rest", why: "an actor canopy 5 m up, then the rough" },
  { tag: "r1-h16s1-dr", hole: 16, stroke: 1, club: "WD1", power: 0.9732730984687805, lie: "tee", launch: { start: [0.07569579780101776, 0.10000000149011612, -4.031298637390137], v0: [1.5897585153579712, 10.314537048339844, -55.6295280456543], hop: 3, side: 0, backspin: 0, yRef: 0.10000000149011612 }, wind: { s: 14, dirRad: 2.356194496154785 }, cup: { k: 0, world: [88.4857, 9.643, -217.8012] }, rest: [33.04526138305664, 6.860371112823486, -239.15760803222656], outcome: "rest", why: "through a canopy, then one rough bounce at (28.83, 7.45, -223.4) the model plays 11 m short (the bounce, not the tree)" },
];
// tools/test-nsssim.mjs's EXCEPT: the strokes whose rest the model cannot reach, over the dump as over this course
const EXCEPT = {
  "h01s3-sw": "met the flag's cloth: the kick's seed is the contact point's x to a float32 ulp, which the push-out at the rim leaves 1.7 mm off",
  "h08s6-sw": "the recorded lip-out (played as a lip-out, checked below)",
  "h17s1-dr": "a roll-off where the game counts the face the ball leaves for one more tick, then a bunker landing",
};
// the strokes through an actor tree (an Obj_Glf_* kind mesh): the fixture's triangles do not hold it
const TREE_STROKES = ["h03s2-sp", "h07s1-sp", "h09s2-3i", "h12s1-sp", "h14s2-dr", "h16s4-9i-rough", "r1-h03s1-dr", "r1-h16s1-dr"];
const TREE_KNOWN_OFF = { "r1-h16s1-dr": RPLAY[1].why };
const b64 = (s, T) => { const buf = Buffer.from(s, "base64"); return new T(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)); };
const fixtureGround = (f) => S.meshGround({ verts: b64(f.mesh.verts, Float32Array), tris: b64(f.mesh.tris, Uint32Array), attr: Uint8Array.from(b64(f.mesh.codes, Uint8Array), (c) => S.ATTR_OF_CODE[c] ?? 0) });
const bare = new Map();
const bareCourse = (hole) => { if (!bare.has(hole)) bare.set(hole, nssCourse(metaOf(hole), binOf(hole), { actorTrees: false })); return bare.get(hole); };
// the dump's own collision, as tools/test-nsssim.mjs builds it (the cup in play's cover out)
const nsscol = fs.existsSync(path.join(DUMP, "h01-actors.json")) ? await import("./lib/nsscol.mjs") : null;
const dumpGrounds = new Map();
function dumpGround(f) {
  const key = `${f.hole}:${f.cup.k}`;
  if (!dumpGrounds.has(key)) {
    const m = nsscol.loadCollision(DUMP, f.hole, { covers: true, extras: ["leaf", "water", "actors"] });
    const cov = m.covers.find((c) => c.k === f.cup.k);
    dumpGrounds.set(key, S.meshGround({ verts: m.verts, tris: m.tris, attr: Uint8Array.from(m.surface, (c) => S.ATTR_OF_CODE[c] ?? 0) }, { skip: (t) => t >= cov.tri0 && t < cov.tri1 }));
  }
  return dumpGrounds.get(key);
}
const replay = (f, ground, extra = {}) => S.run({
  club: f.club, power: f.power, lie: f.lie, start: f.launch.start, v0: f.launch.v0, hop0: f.launch.hop, side0: f.launch.side, backspin: f.launch.backspin, yRef: f.launch.yRef,
  wind: f.wind.s > 0 ? { s: f.wind.s, dirRad: f.wind.dirRad } : null, cup: { x: f.cup.world[0], y: f.cup.world[1], z: f.cup.world[2] }, ground, stopAtHazard: false,
  // the flagstick in, the cloth along the wind object's angle, for every stroke but a putt from the green
  flag: S.flagInPlay(f.club, f.lie) ? { windDirRad: f.wind.dirRad } : null, ...extra,
});
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const sameRun = (a, b) => a.ticks === b.ticks && a.outcome === b.outcome && a.rest.every((v, i) => Object.is(v, b.rest[i]));
{
  const t0 = performance.now();
  let teeN = 0, teeWorst = 0, played = 0, worst = 0, sameBits = 0, fixtureN = 0, holed = 0, launchWorst = 0, dumpSame = 0, dumpN = 0;
  const notes = [], treeRows = [];
  for (const f of [...strokes, ...RPLAY]) {
    const C = course(f.hole), key = `c${f.cup.k}`, q = C.N.cups[key];
    ok(Math.hypot(q.x - f.cup.world[0], q.y - f.cup.world[1], q.z - f.cup.world[2]) < 2e-4, `${f.tag}: course3d's ${key} (its bone) is the recorded cup`);
    // a tee shot starts on the local start
    if (f.stroke === 1) {
      const S0 = L.ballAtStart(C, { start: { kind: "local" } }), d = dist(S0.pos, f.launch.start);
      teeWorst = Math.max(teeWorst, d); teeN++;
      ok(d < 1e-3, `${f.tag}: the recorded tee shot starts ${(d * 1000).toFixed(2)} mm from the local start`);
    }
    // the solver's own launch: club, the gauge percent, the heading
    {
      const v = f.launch.v0, h = Math.atan2(v[0], -v[2]) * 180 / Math.PI;
      const lv = S.launchVelocity(f.club, (S.pctOf(f.power) + 0.5) / 100, h);
      launchWorst = Math.max(launchWorst, Math.hypot(lv[0] - v[0], lv[1] - v[1], lv[2] - v[2]) / Math.hypot(...v));
    }
    const r = replay(f, C.N.ground({ cupKey: key }));
    const err = dist(r.rest, f.rest);
    // with the dump: the same bits as over the dump's own collision
    let dErr = null;
    if (nsscol) {
      const d = replay(f, dumpGround(f));
      dErr = dist(d.rest, f.rest); dumpN++;
      const same = sameRun(d, r);
      if (same) dumpSame++;
      ok(same, `${f.tag}: the same bits as over the dump's collision (${r.rest} in ${r.ticks} ticks, the dump's ${d.rest} in ${d.ticks})`);
    }
    if (TREE_STROKES.includes(f.tag)) {
      const e0 = dist(replay(f, bareCourse(f.hole).ground({ cupKey: key })).rest, f.rest);
      const asDump = dErr != null ? dErr <= TREE_TOL_M : !TREE_KNOWN_OFF[f.tag];
      if (asDump) ok(err <= TREE_TOL_M, `${f.tag} (an actor tree): rest ${err.toFixed(4)} m from the recording (at most ${TREE_TOL_M}${dErr != null ? `, the dump's replay ${dErr.toFixed(4)}` : ""})`);
      ok(err < e0, `${f.tag}: the actor trees bring the rest nearer the recording (${err.toFixed(4)} m against ${e0.toFixed(2)} m without them)`);
      treeRows.push(`${f.tag} ${err.toFixed(4)} m (${dErr != null ? `the dump's ${dErr.toFixed(4)}; ` : ""}${e0.toFixed(2)} m without the actor trees)${TREE_KNOWN_OFF[f.tag] && !(err <= TREE_TOL_M) ? `: ${TREE_KNOWN_OFF[f.tag]}` : ""}`);
      if (f.fixture === false || !f.mesh) continue;
    }
    if (f.tag === "h08s6-sw") ok(r.outcome === "rest" && !r.holed && err < 0.1, `h08s6-sw: the recorded lip-out plays as ${r.outcome} ${err.toFixed(3)} m from its rest`);
    if (EXCEPT[f.tag]) { notes.push(`${f.tag}: rest ${err.toFixed(2)} m off (${r.outcome}, recorded ${f.outcome}): ${EXCEPT[f.tag]}`); continue; }
    if (!f.mesh) continue;
    ok(r.outcome === f.outcome, `${f.tag}: ${r.outcome}, recorded ${f.outcome}`);
    if (f.outcome === "holed") {
      holed++;
      const cd = Math.hypot(r.rest[0] - f.cup.world[0], r.rest[2] - f.cup.world[2]);
      ok(r.holed && cd < S.PHYSICS.cup.bottomRadiusM, `${f.tag}: holed, at rest ${cd.toFixed(3)} m from the cup's centre`);
      continue;
    }
    played++; worst = Math.max(worst, err);
    ok(err <= REST_TOL_M, `${f.tag}: rest ${err.toFixed(4)} m from the recording`);
    if (TREE_STROKES.includes(f.tag)) continue;
    const fx = replay(f, fixtureGround(f));
    fixtureN++;
    if (sameRun(fx, r)) sameBits++;
    ok(sameRun(fx, r), `${f.tag}: the same bits as over the fixture's triangles (${fx.rest} against ${r.rest})`);
  }
  ok(played === 51 && holed === 17 && teeN === 19, `3. ${played} strokes played to a rest off the cup, ${holed} holed putts, ${teeN} tee shots`);
  ok(launchWorst < 2e-4, `the solver's launch from (club, gauge percent, heading) against the recorded launches: worst ${launchWorst.toExponential(2)} relative`);
  console.log(`3. the recorded strokes over the live course, ${((performance.now() - t0) / 1000).toFixed(1)} s: ${teeN} tee shots start within ${(teeWorst * 1000).toFixed(3)} mm of the local start; ${nsscol ? `${dumpSame} of ${dumpN} the same bits as over the dump's own collision; ` : "the dump is not here: not compared with it; "}${played} rests off the cup within ${worst.toFixed(4)} m (${sameBits} of ${fixtureN} the same bits as over the fixture's triangles); ${holed} holed putts all holed; the solver's own launch within ${launchWorst.toExponential(1)} of the recorded`);
  console.log(`   the strokes through actor trees: ${treeRows.join("; ")}`);
  for (const n of notes) console.log(`   ${n}`);
}

// ---- 4. solves ----
const HOLES = [2, 3, 8, 10, 12, 16, 17, 19, 20, 21];
const lim = (club) => [Math.round(100 * S.PHYSICS.clubs[S.clubOf(club)].powerMin), club === "putter" ? 150 : 100];
const sane = (r) => r.recs.every((x) => {
  const [lo, hi] = lim(x.club);
  return Number.isInteger(x.pct) && x.pct >= lo && x.pct <= hi && Math.abs(x.bars - 4 * x.power) < 1e-12 && S.pctOf(x.power) === Math.min(x.pct, 150)
    && Number.isFinite(x.miss) && Number.isFinite(x.carry) && Number.isFinite(x.aimOffTarget) && x.rest.every(Number.isFinite) && x.aimTo.every(Number.isFinite) && typeof x.restLie === "string";
});
// best first: holed for sure (holed with the flag out too), then by score; a rec is sure only if holed, and a rec
// that met no part of the flagstick is sure exactly when it is holed
const sorted = (r) => r.recs.every((x, i) => (i === 0 || r.recs[i - 1].sure > x.sure || (r.recs[i - 1].sure === x.sure && r.recs[i - 1].score <= x.score + 1e-9)) && (!x.sure || x.holed) && (x.flag || x.sure === x.holed));
let solveMax = 0, greenN = 0, greenIn = 0, flagRecs = 0, flagMatters = 0;
for (const hole of HOLES) {
  const C = course(hole), meta = C.meta;
  const t0 = performance.now();
  const r = L.solveFrom(C, { start: { kind: "local" }, cupKey: "c0", windMph: 11, windDeg: 45 });
  const ms = performance.now() - t0;
  solveMax = Math.max(solveMax, ms);
  ok(r.recs.length === 7 && r.lie === 15 && r.physics === "NSS" && r.cup === "c0" && sorted(r), `H${hole}: a sorted rec per club from the tee`);
  ok(sane(r), `H${hole}: the recs' numbers (whole gauge percents within each club's range, bars = 4 x power, finite)`);
  const flagged = r.recs.flatMap((x) => [x, x.full].filter(Boolean)).filter((x) => x.flag);
  ok(flagged.every((x) => x.flag.uncertain === true && ["pole", "cloth"].includes(x.flag.part) && typeof x.flag.matters === "boolean" && typeof x.flag.noFlag?.holed === "boolean" && (x.flag.ties > 0) === !!x.flag.otherFace && (!x.sure || x.flag.noFlag.holed)), `H${hole}: the ${flagged.length} recs that met the flagstick report it, uncertain, with the stroke as if the flag were out`);
  flagRecs += flagged.length; flagMatters += flagged.filter((x) => x.flag.matters).length;
  ok(ms <= MAX_S * 1000, `H${hole}: the tee solve in ${(ms / 1000).toFixed(2)} s (at most ${MAX_S})`);
  const b = r.recs[0];
  console.log(`H${hole} from the tee (${r.D.toFixed(0)} yd to c0): best ${b.club} ${b.pct} % (${b.bars.toFixed(2)} bars), ${b.aimOffFlag.toFixed(2)} deg off the flag, ${b.holed ? "HOLED" : `${b.miss.toFixed(1)} yd from the pin`} (${b.restLie}${b.safe ? "" : ", sand or water near"}${b.tree ? `, met the ${b.tree.part} of ${b.tree.id}` : ""}); ${(ms / 1000).toFixed(2)} s`);
  // from the green: 8 m short of c0 on its line from the tee
  {
    const cup = C.N.cups.c0, T = C.N.nssOf(meta.tee.teeObj), dx = T[0] - cup.x, dz = T[2] - cup.z, l = Math.hypot(dx, dz);
    for (const back of [8, 6, 4, 10, 12]) {
      const [fx, fy] = L.toMap(meta, 10 * (cup.x + (back * dx) / l) + meta.O[0], 10 * (cup.z + (back * dz) / l) + meta.O[2]);
      const g = L.groundAt(C, 10 * (cup.x + (back * dx) / l) + meta.O[0], 10 * (cup.z + (back * dz) / l) + meta.O[2]);
      if (g?.attr !== 6) continue;
      const t1 = performance.now(), p = L.solveFrom(C, { ball: { x: fx, y: fy }, cupKey: "c0" }), pm = performance.now() - t1;
      solveMax = Math.max(solveMax, pm);
      ok(p.lie === 6 && p.recs.length === 1 && p.recs[0].club === "putter" && sane(p) && p.recs[0].flag === null && p.recs[0].sure === p.recs[0].holed && pm <= MAX_S * 1000, `H${hole}: a putt from ${back} m on the green (the flag out), ${p.recs[0].pct} % ${p.recs[0].holed ? "holed" : `${p.recs[0].miss.toFixed(2)} yd off`}, ${(pm / 1000).toFixed(2)} s`);
      greenN++; if (p.recs[0].holed) greenIn++;
      break;
    }
  }
}
// from the platform (the app's ball: src/platform.js), and the same solve twice
for (const [hole, tier] of [[10, "high"], [19, "low"]]) {
  const C = course(hole), P = DERIVED.holes[hole].platform;
  const online = { tier, countHigh: tier === "high" ? 4 : 3, countLow: tier === "high" ? 0 : 3, place: 2, hand: "right" }, b = ballOf(P, online);
  const args = { ball: b, start: { kind: "platform", tier, hand: "right", ballLocalX: b.localX }, cupKey: "c2", windMph: 9, windDeg: 200 };
  const t0 = performance.now(), r = L.solveFrom(C, args), ms = performance.now() - t0;
  solveMax = Math.max(solveMax, ms);
  ok(r.recs.length === 7 && r.lie === 15 && r.from.kind === "platform" && sorted(r) && sane(r) && ms <= MAX_S * 1000, `H${hole} from the ${tier} tier: ${r.recs.length} sorted recs, lie ${r.lie}, ${(ms / 1000).toFixed(2)} s`);
  const again = L.solveFrom(C, args);
  ok(JSON.stringify(again) === JSON.stringify(r), `H${hole} from the ${tier} tier: the same solve twice, the same result`);
  console.log(`H${hole} from the ${tier} tier (${r.D.toFixed(0)} yd to c2): best ${r.recs[0].club} ${r.recs[0].pct} %, ${r.recs[0].holed ? "HOLED" : `${r.recs[0].miss.toFixed(1)} yd off`} (${r.recs[0].restLie}); ${(ms / 1000).toFixed(2)} s`);
}
ok(greenN >= 8, `putts solved from the green on ${greenN} of ${HOLES.length} holes (a green point 4-12 m short of c0)`);
console.log(`4. every solve within ${(solveMax / 1000).toFixed(2)} s (at most ${MAX_S}); putts from the green on ${greenN} holes, ${greenIn} holed; ${flagRecs} tee recs met the flagstick (${flagMatters} where the flag out, the other pole face or the cloth's kick would end it otherwise)`);

// ---- the same tee strokes by NSS's ball on NSS's course and WSR's on WSR's (printed only) ----
let RM = null;
try { RM = await import(pathToFileURL(path.join(ROOT, "tools/harness/round-model.mjs")).href); if (RM.courseSource(2).src !== "kcl") RM = null; } catch { RM = null; }
if (RM) {
  const WSRP = read(path.join(ROOT, "tools/wsr-pins.json"));
  console.log("full tee strokes toward c0, NSS's ball on NSS's course against WSR's ball on WSR's (carry yd and its difference; rest; the two rests apart, yd):");
  for (let hole = 1; hole <= 21; hole++) {
    const C = course(hole), meta = C.meta, S0 = L.ballAtStart(C, { start: { kind: "local" } }), pin = C.N.cups.c0;
    const h = Math.atan2(pin.x - S0.pos[0], -(pin.z - S0.pos[2])) * 180 / Math.PI;
    const st = WSRP.holes[hole].starts[0].mesh, wc = RM.loadCourse(hole), wg = RM.groundAt(wc, st[0], st[2], { yMax: st[1] + 20 });
    const wball = [st[0], wg.y + 0.5, st[2]], pinMesh = meta.pins.c0, wh = Math.atan2(pinMesh[0] - wball[0], pinMesh[2] - wball[2]);
    const row = [`H${hole}`];
    for (const club of ["driver", "7iron", "wedge"]) {
      const a = L.shot(C, { pos: S0.pos, lie: S0.lie, club, pct: 100, heading: h, cupKey: "c0" });
      const w = RM.predict({ hole, course: wc, ball: wball, heading: wh, club, power: 1, lie: 15, pin: pinMesh });
      const am = C.N.meshOf(a.rest), dRest = Math.hypot(am[0] - w.rest[0], am[2] - w.rest[1]) / L.YD;
      row.push(`${club} carry ${a.carryYd.toFixed(1)} (${(a.carryYd - w.carry >= 0 ? "+" : "") + (a.carryYd - w.carry).toFixed(1)}) rest ${a.restLie} ${dRest.toFixed(1)} yd from WSR's (${w.restLie})`);
    }
    console.log(`  ${row.join("; ")}`);
    RM.dropCourse(hole);
  }
} else console.log("NSS against WSR: skipped (no extracted disc for round-model.mjs)");

console.log(fails ? `${fails} of ${checks} checks FAILED` : `all ${checks} checks pass`);
process.exit(fails ? 1 : 0);
