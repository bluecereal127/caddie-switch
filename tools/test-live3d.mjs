// Acceptance for the live solver (src/live3d-core.js): NSS's ball (src/nsssim.js)
// on NSS's course (public/course3d v2 through tools/lib/nss3d.mjs):
//  1. with the dump present (tools/harness/state/eden/nss-golf-x/collision), a
//     fresh build of public/course3d is byte-identical to the shipped files, else
//     "skipped";
//  2. per hole, the course the solver flies over holds the shipped triangles
//     exactly (the float32 vertices verbatim, each model attribute as the ball's,
//     the six covers out of the static course, the tree pack, the actor trees);
//     the cull in front of meshGround changes no bit (strokes over the culled and
//     the plain mesh); the local start is NSS's GlfTeeOBJ teed up 0.1 m, within
//     0.05 px of derived.json's teeNss.teeObj, lie tee; platformSpot finds the 14
//     standing spots by fromLeft, localX and side; every platform ball
//     src/platform.js places (each layout NSS makes, tier, place and hand) is
//     where ballAtStart puts it, within 0.01 px, 0.1 m over its tier's mat;
//  3. the 71 strokes recorded in Eden (tools/fixtures/nss-flights) through the
//     solver's own course and NSS's physics: each recorded tee shot starts where
//     the local start puts the ball (1 mm); every stroke the model plays to a rest
//     off the cup (tools/test-nsssim.mjs's set: not a flag, not an actor tree whose
//     collision the dump lacks, not its three documented edge cases) rests within
//     REST_TOL_M of the recording, and the same bits as over the fixture's own
//     triangles; every recorded holed putt holes; the six strokes through actor
//     trees end nearer the recording with nss3d.mjs's tree shapes than without
//     (printed with the rest); the solver's own launch (club, gauge percent,
//     heading) is the recording's to 2e-4;
//  4. solves from the tee to cup c0 on holes 2, 3, 8, 10, 12, 16, 17, 19, 20, 21
//     (11 mph wind toward 45 deg): a rec per club, sorted, finite numbers, each
//     at a whole gauge percent within its club's range, at most MAX_S; from the
//     green (the putter alone) and from the platform on two of them; the same
//     solve twice gives the same result;
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
import { nssCourse, ATTR_OF_MODEL, culledGround, PLATFORM_TIERS } from "./lib/nss3d.mjs";
import { ballOf, VALID_COUNTS, TIERS, HANDS } from "../src/platform.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "public/course3d");
const DUMP = path.join(ROOT, "tools/harness/state/eden/nss-golf-x/collision");
const FIX = path.join(ROOT, "tools/fixtures/nss-flights");
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const hh = (n) => String(n).padStart(2, "0");
const pxOff = (f, x, y) => Math.sqrt(((f[0] - x) * 250) ** 2 + ((f[1] - y) * 304) ** 2);
const REST_TOL_M = 0.1, MAX_S = 3;
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
  ok(N.trees.length === meta.trees.length && N.nActor > 0 && N.trees.every((t) => t.kindFrom === "nss"), `H${hole}: ${N.trees.length} actor trees as their kinds' shapes (${N.nActor} triangles)`);
  ok(Object.values(N.cups).every((c) => c.tris.length === 20 && c.rim.length === 20), `H${hole}: six covers of 20 triangles with a 20-vertex rim`);
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
// tools/test-nsssim.mjs EXCEPT: the strokes the model cannot play to the recorded rest
const EXCEPT = {
  "h01s3-sw": "hit the flagstick (not modelled)",
  "h03s2-sp": "actor", "h07s1-sp": "actor", "h09s2-3i": "actor", "h12s1-sp": "actor", "h14s2-dr": "actor", "h16s4-9i-rough": "actor",
  "h16s2-7i-rough": "a baked canopy whose damping the model ends 3 ticks late",
  "h08s6-sw": "the recorded lip-out (the cup rebuilt from its cover holes it)",
  "h17s1-dr": "a roll-off the game reads the other way (then a bunker landing)",
};
const b64 = (s, T) => { const buf = Buffer.from(s, "base64"); return new T(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)); };
const fixtureGround = (f) => S.meshGround({ verts: b64(f.mesh.verts, Float32Array), tris: b64(f.mesh.tris, Uint32Array), attr: Uint8Array.from(b64(f.mesh.codes, Uint8Array), (c) => S.ATTR_OF_CODE[c] ?? 0) });
const bare = new Map();
const bareCourse = (hole) => { if (!bare.has(hole)) bare.set(hole, nssCourse(metaOf(hole), binOf(hole), { actorTrees: false })); return bare.get(hole); };
const replay = (f, ground, extra = {}) => S.run({
  club: f.club, power: f.power, lie: f.lie, start: f.launch.start, v0: f.launch.v0, hop0: f.launch.hop, side0: f.launch.side, backspin: f.launch.backspin, yRef: f.launch.yRef,
  wind: f.wind.s > 0 ? { s: f.wind.s, dirRad: f.wind.dirRad } : null, cup: { x: f.cup.world[0], y: f.cup.world[1], z: f.cup.world[2] }, ground, stopAtHazard: false, ...extra,
});
{
  const t0 = performance.now();
  let teeN = 0, teeWorst = 0, played = 0, worst = 0, sameBits = 0, holed = 0, launchWorst = 0;
  const notes = [];
  for (const f of strokes) {
    const C = course(f.hole), key = `c${f.cup.k}`;
    ok(Math.sqrt((C.N.cups[key].x - f.cup.world[0]) ** 2 + (C.N.cups[key].z - f.cup.world[2]) ** 2) < 1e-3, `${f.tag}: course3d's ${key} is the recorded cup`);
    // a tee shot starts on the local start
    if (f.stroke === 1) {
      const S0 = L.ballAtStart(C, { start: { kind: "local" } }), d = Math.hypot(S0.pos[0] - f.launch.start[0], S0.pos[1] - f.launch.start[1], S0.pos[2] - f.launch.start[2]);
      teeWorst = Math.max(teeWorst, d); teeN++;
      ok(d < 1e-3, `${f.tag}: the recorded tee shot starts ${(d * 1000).toFixed(2)} mm from the local start`);
    }
    // the solver's own launch: club, the gauge percent, the heading
    {
      const v = f.launch.v0, h = Math.atan2(v[0], -v[2]) * 180 / Math.PI;
      const lv = S.launchVelocity(f.club, (S.pctOf(f.power) + 0.5) / 100, h);
      const e = Math.hypot(lv[0] - v[0], lv[1] - v[1], lv[2] - v[2]) / Math.hypot(...v);
      launchWorst = Math.max(launchWorst, e);
    }
    const r = replay(f, C.N.ground({ cupKey: key }));
    const err = Math.hypot(r.rest[0] - f.rest[0], r.rest[1] - f.rest[1], r.rest[2] - f.rest[2]);
    if (EXCEPT[f.tag] === "actor") {
      const q = replay(f, bareCourse(f.hole).ground({ cupKey: key }));
      const e0 = Math.hypot(q.rest[0] - f.rest[0], q.rest[1] - f.rest[1], q.rest[2] - f.rest[2]);
      ok(err < e0, `${f.tag}: the actor tree's shape brings the rest nearer the recording (${err.toFixed(2)} m against ${e0.toFixed(2)} without)`);
      notes.push(`${f.tag} through an actor tree: rest ${err.toFixed(2)} m off with nss3d.mjs's shapes, ${e0.toFixed(2)} m without (${r.outcome}, recorded ${f.outcome})`);
      continue;
    }
    if (EXCEPT[f.tag]) { notes.push(`${f.tag}: rest ${err.toFixed(2)} m off (${r.outcome}, recorded ${f.outcome}): ${EXCEPT[f.tag]}`); continue; }
    ok(r.outcome === f.outcome, `${f.tag}: ${r.outcome}, recorded ${f.outcome}`);
    if (f.outcome === "holed") {
      holed++;
      const cd = Math.hypot(r.rest[0] - f.cup.world[0], r.rest[2] - f.cup.world[2]);
      ok(r.holed && cd < S.PHYSICS.cup.bottomRadiusM, `${f.tag}: holed, at rest ${cd.toFixed(3)} m from the cup's centre`);
      continue;
    }
    played++; worst = Math.max(worst, err);
    ok(err <= REST_TOL_M, `${f.tag}: rest ${err.toFixed(4)} m from the recording`);
    const q = replay(f, fixtureGround(f));
    const same = q.ticks === r.ticks && q.rest.every((v, i) => Object.is(v, r.rest[i]));
    if (same) sameBits++;
    ok(same, `${f.tag}: the same bits as over the fixture's triangles (${q.rest} against ${r.rest})`);
  }
  ok(played === 44 && holed === 17 && teeN === 17, `3. ${played} strokes played to a rest off the cup, ${holed} holed putts, ${teeN} tee shots`);
  ok(launchWorst < 2e-4, `the solver's launch from (club, gauge percent, heading) against the recorded launches: worst ${launchWorst.toExponential(2)} relative`);
  console.log(`3. the recorded strokes over the live course, ${((performance.now() - t0) / 1000).toFixed(1)} s: ${teeN} tee shots start within ${(teeWorst * 1000).toFixed(3)} mm of the local start; ${played} rests off the cup within ${worst.toFixed(4)} m (${sameBits} the same bits as over the fixture's triangles); ${holed} holed putts all holed; the solver's own launch within ${launchWorst.toExponential(1)} of the recorded`);
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
const sorted = (r) => r.recs.every((x, i) => i === 0 || r.recs[i - 1].holed > x.holed || (r.recs[i - 1].holed === x.holed && r.recs[i - 1].score <= x.score + 1e-9));
let solveMax = 0, greenN = 0, greenIn = 0;
for (const hole of HOLES) {
  const C = course(hole), meta = C.meta;
  const t0 = performance.now();
  const r = L.solveFrom(C, { start: { kind: "local" }, cupKey: "c0", windMph: 11, windDeg: 45 });
  const ms = performance.now() - t0;
  solveMax = Math.max(solveMax, ms);
  ok(r.recs.length === 7 && r.lie === 15 && r.physics === "NSS" && r.cup === "c0" && sorted(r), `H${hole}: a sorted rec per club from the tee`);
  ok(sane(r), `H${hole}: the recs' numbers (whole gauge percents within each club's range, bars = 4 x power, finite)`);
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
      ok(p.lie === 6 && p.recs.length === 1 && p.recs[0].club === "putter" && sane(p) && pm <= MAX_S * 1000, `H${hole}: a putt from ${back} m on the green, ${p.recs[0].pct} % ${p.recs[0].holed ? "holed" : `${p.recs[0].miss.toFixed(2)} yd off`}, ${(pm / 1000).toFixed(2)} s`);
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
console.log(`4. every solve within ${(solveMax / 1000).toFixed(2)} s (at most ${MAX_S}); putts from the green on ${greenN} holes, ${greenIn} holed`);

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
