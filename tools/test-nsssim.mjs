// Acceptance for src/nsssim.js (NSS's golf ball) against the 71 strokes recorded in
// Eden's RAM (tools/fixtures/nss-flights, written by tools/nss-physics-export.mjs):
//
//   node tools/test-nsssim.mjs [--fixture-mesh] [--verbose] [--only <tag>]
//
//   a. the constants: src/nsssim.js's PHYSICS block is tools/nss-physics.json; the
//      surface table and the code -> attribute map as the recordings saw them;
//   b. the launch: the table key (int)(100.0f * power), every recorded launch speed and
//      elevation from (club, power, heading) alone, the lies' caps;
//   c. every stroke replayed from its recorded launch (the shot record: start,
//      velocity, hop, backspin; the wind) over NSS's collision: the dump's own meshes
//      through tools/lib/nsscol.mjs when tools/harness/state/eden/nss-golf-x is here
//      (then the fixture's own triangles too, which must give the same bits), else (or
//      with --fixture-mesh) the fixture's triangles alone, the ones the recorded ball came
//      near. Checked: the flight within AIR_TOL_M at every kept sample before the first
//      contact on the 46 strokes the verifiers fit end to end (their flight from the shot
//      record lands on the last airborne sample, verify/flights/launch.json, with
//      AddGravityHole acting in flight, verdicts.json); the first contact's tick and
//      surface; the rest within REST_TOL_M and the outcome on every stroke the model can
//      play to the end (EXCEPT below says why the others cannot); a holed stroke holed,
//      at rest in the cup;
//   d. the backspin chips: the pull-back's |P| at the switch to the roll (verdicts.json:
//      2.2399 h04s3, 4.9604 h18s3) and the bounce's backspin factor;
//   e. synthetic runs: the flat-ground carries and stops of flights.md section 6 (the
//      decoded laws on a level plane), a level profile = the flat height field, the
//      analytic cup (holes a slow putt, not a fast one), the wind's sign, water and OB
//      on a height field, the bunker's cap on the launch, a decimated trace;
//   f. the height-field route, with the dump: every recorded putt over a height field
//      read off the mesh with the analytic cup (heightGround + cupMesh, the way a terrain
//      grid drives the engine): the recorded outcome, the rest in the cup or within
//      HEIGHT_TOL_M;
//   g. determinism: the same run twice gives the same bits, and a digest of the
//      synthetic runs is the recorded one.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as S from "../src/nsssim.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const VERBOSE = argv.includes("--verbose");
const ONLY = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const DUMP = join(ROOT, "tools/harness/state/eden/nss-golf-x/collision");
const useDump = !argv.includes("--fixture-mesh") && existsSync(join(DUMP, "h01.json"));
const FIX = join(ROOT, "tools/fixtures/nss-flights");
const AIR_TOL_M = 1e-3, REST_TOL_M = 0.05;
// the strokes whose rest the model cannot reach, and why (measured here: the replay's
// rest is printed)
const EXCEPT = {
  "h01s3-sw": "hit the flagstick (the flag zeroes the ball's velocity, then a random deflection: the flag is not modelled)",
  "h03s2-sp": "an actor tree's canopy (Obj_Glf_HardWoodB n3-26: its collision mesh is not in the dump)",
  "h07s1-sp": "an actor tree's canopy (Obj_Glf_HardWoodB n7-44: not in the dump)",
  "h09s2-3i": "an actor tree's canopy and palm fronds (Obj_Glf_ConiferTreeD n9-35: not in the dump)",
  "h12s1-sp": "an actor tree's canopy (Obj_Glf_HardWoodA n12-52: not in the dump)",
  "h14s2-dr": "an actor tree's canopy (Obj_Glf_HardWoodA n14-27: not in the dump)",
  "h16s4-9i-rough": "an actor tree's canopy (Obj_Glf_HardWoodC n16-28: not in the dump)",
  "h16s2-7i-rough": "a baked canopy (n16-32): damped as the game to 0.05 mm, but the damping stops 3 ticks late (the leaf counter's faces are not fully decoded), and the ball finishes OB 4 m off",
  "h08s6-sw": "rolled into the cup and out again (the recorded lip-out): the cup's 20 walls turn the 2 mm the ball is off when it reaches them into 0.2 m",
  "h17s1-dr": "a roll-off where the game counts the face the ball leaves for one more tick (it does on 27 of the 57 such ticks of the recordings, alike in every measured way), then the bunker landing turns 7 mm into 1.3 m",
};

let failed = 0, passed = 0;
const ok = (cond, msg) => { if (cond) passed++; else { failed++; console.log("FAIL:", msg); } };
const log = (...a) => console.log(...a);
const median = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[(s.length - 1) >> 1] : NaN; };

// ---- a. the constants ----
{
  const file = JSON.parse(readFileSync(join(ROOT, "tools/nss-physics.json"), "utf8"));
  ok(JSON.stringify(file) === JSON.stringify(S.PHYSICS), "src/nsssim.js's PHYSICS block differs from tools/nss-physics.json (rerun node tools/nss-physics-export.mjs)");
  ok(S.DT === Math.fround(1 / 60) / 4, `dt ${S.DT}`);
  const A = S.PHYSICS.attrs;
  const want = { 1: [0.6, 0.37, 3.5], 2: [0.53, 0.32, 7], 3: [0.27, 0.1, 10], 5: [0.4, 0.24, 8], 6: [0.5, 0.37, 1.3], 7: [0.6, 0.37, 2.6], 11: [0.5, 0.5, 0.5], 14: [0.4, 0.1, 7] };
  const f32 = Math.fround;
  for (const [a, [rh, rv, fr]] of Object.entries(want)) ok(f32(A[a].reflectionH) === f32(rh) && f32(A[a].reflectionV) === f32(rv) && f32(A[a].friction) === f32(fr), `attr ${a} ${A[a].name}: ${A[a].reflectionH} ${A[a].reflectionV} ${A[a].friction}`);
  const codes = { 5: 1, 6: 2, 7: 3, 8: 4, 10: 5, 18: 6, 24: 7, 25: 8, 30: 9, 31: 10, 32: 11, 36: 14, 37: 15, 38: 16, 39: 17, 42: 19, 43: 20, 44: 21 };
  for (const [c, a] of Object.entries(codes)) ok(S.ATTR_OF_CODE[c] === a, `code ${c} -> attr ${S.ATTR_OF_CODE[c]}, the recordings say ${a}`);
  ok(JSON.stringify(S.PHYSICS.passAttrs) === "[4,8,16,17,20]", "pass-through attributes");
  ok(S.PHYSICS.air.hopDecayTick === new Float32Array(new Uint32Array([0x3f7fe7ec]).buffer)[0], "hop decay = RAM ball+0xe0");
  log(`a. constants: PHYSICS = tools/nss-physics.json (${Object.keys(file.attrs).length} attributes, ${Object.keys(file.clubs).length} clubs, ${Object.values(file.launchTable).reduce((s, r) => s + r.length, 0)} launch speeds)`);
}

// ---- the fixture ----
const index = JSON.parse(readFileSync(join(FIX, "index.json"), "utf8"));
const strokes = index.strokes.map((s) => JSON.parse(readFileSync(join(FIX, s.tag + ".json"), "utf8")));
ok(strokes.length === 71, `${strokes.length} fixture strokes`);
for (const tag of Object.keys(EXCEPT)) ok(strokes.some((f) => f.tag === tag), `EXCEPT names ${tag}, not a fixture stroke`);

// ---- b. the launch ----
{
  ok(S.pctOf(0.13) === 13 && S.pctOf(0.137) === 13 && S.pctOf(0.999) === 99 && S.pctOf(1) === 100 && S.pctOf(0) === 1 && S.pctOf(2) === 150, "pctOf: 0.13 13, 0.137 13, 0.999 99, 1 100, 0 1, 2 150");
  let worst = 0, worstEl = 0, worstV = 0;
  for (const f of strokes) {
    const v = f.launch.v0, sp = Math.hypot(...v);
    const want = S.launchSpeed(f.club, f.power);
    worst = Math.max(worst, Math.abs(sp - want) / want);
    worstEl = Math.max(worstEl, Math.abs(Math.atan2(v[1], Math.hypot(v[0], v[2])) * 180 / Math.PI - S.PHYSICS.clubs[f.club].loftDeg));
    ok(S.pctOf(f.power) === f.pct, `${f.tag}: pct ${S.pctOf(f.power)} vs ${f.pct}`);
    const lv = S.launchVelocity(f.club, f.power, Math.atan2(v[0], -v[2]) * 180 / Math.PI);
    worstV = Math.max(worstV, Math.hypot(lv[0] - v[0], lv[1] - v[1], lv[2] - v[2]) / sp);
  }
  ok(worst < 2e-4, `the recorded launch speeds against the table: worst relative ${worst}`);
  ok(worstEl < 0.01, `the recorded elevations against LoftDeg: worst ${worstEl} deg`);
  ok(worstV < 2e-4, `launchVelocity against the recorded launches: worst relative ${worstV}`);
  ok(S.capFor("driver", "rough") === Math.fround(0.75) && S.capFor("WD1", "bunker") === Math.fround(0.25) && S.capFor("IR5", "bunker") === Math.fround(0.5) && S.capFor("SW", "bunker") === Math.fround(0.75) && S.capFor("IR7", "fairway") === 1, "the lies' caps");
  for (const [c, row] of Object.entries(S.PHYSICS.launchTable)) ok(row.length === 150 && row.every((x, i) => i === 0 || x >= row[i - 1]), `launch table ${c}`);
  log(`b. launch: the 71 recorded speeds = GolfShotVelTable to ${worst.toExponential(1)} relative, elevations = LoftDeg to ${worstEl.toFixed(4)} deg, launchVelocity to ${worstV.toExponential(1)}`);
}

// ---- grounds ----
const nsscol = useDump ? await import("./lib/nsscol.mjs") : null;
const b64 = (s, T) => { const buf = Buffer.from(s, "base64"); return new T(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)); };
const fixtureGround = (f) => S.meshGround({ verts: b64(f.mesh.verts, Float32Array), tris: b64(f.mesh.tris, Uint32Array), attr: Uint8Array.from(b64(f.mesh.codes, Uint8Array), (c) => S.ATTR_OF_CODE[c] ?? 0) });
const dumpGrounds = new Map();
function dumpGround(f) {
  const key = `${f.hole}:${f.cup.k}`;
  if (!dumpGrounds.has(key)) {
    const m = nsscol.loadCollision(DUMP, f.hole, { covers: true, extras: ["leaf", "water"] });
    const attr = Uint8Array.from(m.surface, (c) => S.ATTR_OF_CODE[c] ?? 0);
    const cov = m.covers.find((c) => c.k === f.cup.k);
    dumpGrounds.set(key, S.meshGround({ verts: m.verts, tris: m.tris, attr }, { skip: (t) => t >= cov.tri0 && t < cov.tri1 }));
  }
  return dumpGrounds.get(key);
}
const replay = (f, ground, extra = {}) => S.run({
  club: f.club, power: f.power, lie: f.lie, start: f.launch.start, v0: f.launch.v0, hop0: f.launch.hop, side0: f.launch.side, backspin: f.launch.backspin, yRef: f.launch.yRef,
  wind: f.wind.s > 0 ? { s: f.wind.s, dirRad: f.wind.dirRad } : null,
  cup: { x: f.cup.world[0], y: f.cup.world[1], z: f.cup.world[2] },
  ground, trace: true, stopAtHazard: false, ...extra,
});

// ---- c. the replays ----
const t0 = Date.now();
const rows = [];
let sameAsFixture = 0;
for (const f of strokes) {
  if (ONLY && f.tag !== ONLY) continue;
  const r = replay(f, useDump ? dumpGround(f) : fixtureGround(f));
  if (useDump) {
    // the fixture's triangles are all a replay that follows the recorded path touches:
    // the same bits (an EXCEPT stroke may leave that path, and the fixture with it)
    const q = replay(f, fixtureGround(f), { trace: false });
    const same = q.ticks === r.ticks && q.rest.every((x, i) => x === r.rest[i]) && q.outcome === r.outcome;
    if (!EXCEPT[f.tag]) ok(same, `${f.tag}: the fixture's triangles replay to ${q.rest} (${q.ticks} ticks), the dump's to ${r.rest} (${r.ticks})`);
    if (same) sameAsFixture++;
  }
  const byTick = new Map(r.path.map((p) => [p[0], p]));
  let airErr = 0;
  for (const [tk, x, y, z] of f.air) {
    const p = byTick.get(tk - f.launch.tick0);
    airErr = Math.max(airErr, p ? Math.hypot(p[1] - x, p[2] - y, p[3] - z) : Infinity);
  }
  const restErr = Math.hypot(r.rest[0] - f.rest[0], r.rest[1] - f.rest[1], r.rest[2] - f.rest[2]);
  const cupDist = Math.hypot(r.rest[0] - f.cup.world[0], r.rest[2] - f.cup.world[2]);
  const fc = f.firstContact, rfc = r.firstContact;
  const row = { tag: f.tag, airFit: f.verifier.airFitEndToEnd, airErr, airN: f.air.length, restErr, outcome: r.outcome, want: f.outcome, cupDist, ticks: r.ticks, wantTicks: f.restTick - f.launch.tick0, fc: rfc?.tick, wantFc: fc ? fc.tick - f.launch.tick0 : null, bounces: r.bounces };
  rows.push(row);
  if (VERBOSE || ONLY) log(`${f.tag.padEnd(16)} air ${String(f.air.length).padStart(3)} ${(airErr * 1000).toFixed(4)} mm  first contact ${rfc?.tick} (${row.wantFc})  rest ${restErr.toFixed(4)} m  ${r.outcome} (${f.outcome})  ticks ${r.ticks} (${row.wantTicks})${EXCEPT[f.tag] ? "  [except]" : ""}`);
  if (f.verifier.airFitEndToEnd) {
    ok(airErr <= AIR_TOL_M, `${f.tag}: the flight ${(airErr * 1000).toFixed(3)} mm off (${f.air.length} samples)`);
    // the first contact: the recorded sample that first shows it comes at most 4 ticks
    // after it, or is read in the middle of that tick (its frame counter one tick behind)
    if (fc && rfc && ![8, 16, 20].includes(fc.vol)) {
      ok(rfc.tick <= row.wantFc + 1 && rfc.tick > row.wantFc - 4, `${f.tag}: first contact at tick ${rfc.tick}, the recording shows it at ${row.wantFc}`);
      ok(rfc.attr === fc.attr, `${f.tag}: first contact on ${S.ATTR_NAME[rfc.attr]}, the recording's on ${S.ATTR_NAME[fc.attr]}`);
    }
  }
  if (EXCEPT[f.tag]) continue;
  ok(r.outcome === f.outcome, `${f.tag}: outcome ${r.outcome}, recorded ${f.outcome}`);
  if (f.outcome === "holed") ok(cupDist < S.PHYSICS.cup.bottomRadiusM && r.rest[1] < f.cup.world[1] + 0.1, `${f.tag}: holed but at rest ${cupDist.toFixed(3)} m from the cup's centre, ${(r.rest[1] - f.cup.world[1]).toFixed(3)} m above its bottom`);
  else ok(restErr <= REST_TOL_M, `${f.tag}: rest ${restErr.toFixed(4)} m off (${r.outcome}, recorded ${f.outcome})`);
}
const ms = Date.now() - t0;
const fit = rows.filter((r) => r.airFit), played = rows.filter((r) => !EXCEPT[r.tag]);
const notHoled = played.filter((r) => r.want !== "holed"), holed = played.filter((r) => r.want === "holed");
if (!ONLY) {
  log(`c. replays over ${useDump ? "the dump's collision (tools/lib/nsscol.mjs)" : "the fixture's triangles"}: ${rows.length} strokes in ${ms} ms${useDump ? `; the fixture's triangles give the same bits on ${sameAsFixture} of ${rows.length}` : ""}`);
  log(`   the flight, ${fit.length} end-to-end fits: worst ${(Math.max(...fit.map((r) => r.airErr)) * 1000).toFixed(4)} mm, median ${(median(fit.map((r) => r.airErr)) * 1000).toFixed(4)} mm`);
  log(`   the rest, ${notHoled.length} strokes played to the end: worst ${Math.max(...notHoled.map((r) => r.restErr)).toFixed(4)} m, median ${median(notHoled.map((r) => r.restErr)).toFixed(4)} m; ${holed.length} holed: all holed, at rest ${Math.max(...holed.map((r) => r.cupDist)).toFixed(3)} m or less from the cup's centre (${holed.filter((r) => r.restErr <= REST_TOL_M).length} within ${REST_TOL_M} m of the recorded rest)`);
  for (const [tag, why] of Object.entries(EXCEPT)) { const r = rows.find((q) => q.tag === tag); if (r) log(`   except ${tag}: rest ${r.restErr.toFixed(3)} m off (${r.outcome}, recorded ${r.want}): ${why}`); }
}

// ---- d. the backspin chips ----
// verdicts.json backspin_pullback / misc.json backspin: P as the game stored it at the
// switch to the roll
if (!ONLY) {
  for (const [tag, want] of [["h04s3-sw", [-1.3855, 0, 1.7599]], ["h18s3-sw", [-1.5124, 0, -4.7242]]]) {
    const f = strokes.find((q) => q.tag === tag);
    const r = replay(f, useDump ? dumpGround(f) : fixtureGround(f), { trace: false });
    const P = r.pullBack, d = P ? Math.hypot(P[0] - want[0], P[1] - want[1], P[2] - want[2]) : Infinity;
    ok(d < 2e-3, `${tag}: the pull-back at the switch ${P}, recorded ${want}`);
    log(`d. ${tag}: backspin ${f.launch.backspin}: the pull-back stored at the switch to the roll (tick ${r.rollTick}) |P| ${P ? Math.hypot(...P).toFixed(4) : "-"} (recorded ${Math.hypot(...want).toFixed(4)}), ${(d * 1000).toFixed(2)} mm/s apart`);
  }
  const k = (b) => 1 + (S.PHYSICS.backspin.reflectionMin - 1) * b * Math.pow(b, Math.log2(1 / S.PHYSICS.backspin.reflectionBias));
  ok(Math.abs(0.37 * k(0.0325) - 0.36962) < 2e-5 && Math.abs(0.37 * k(0.0966) - 0.36744) < 2e-5, "the bounce's backspin factor (RV 0.36962 at b 0.0325, 0.36744 at 0.0966)");
}

// ---- e. synthetic runs ----
const flat = (attr) => ({ heightAt: () => 0, normalAt: () => [0, 1, 0], attrAt: () => attr });
const synth = [];
if (!ONLY) {
  // flights.md section 6 (tools/nssflat.py: the decoded laws on a level plane, calm, at
  // the launch speeds launchfit.py predicted for pct 100, m/s; the table read later holds
  // the same but SW's 25.6): carry / stop on fairway, yd
  const FLAT = { WD1: [57.6, 240.3, 265.6], WD3: [54.4, 220.4, 244.7], IR3: [54.2, 190.5, 218.3], IR5: [48.3, 160.5, 184.8], IR7: [42.5, 130.2, 151.7], IR9: [36.1, 100.4, 117.5], SW: [25.8, 56.0, 67.0] };
  const out = [];
  for (const [club, [speed, carry, stop]] of Object.entries(FLAT)) {
    const L = S.PHYSICS.clubs[club].loftDeg * Math.PI / 180;
    const r = S.run({ club, v0: [0, speed * Math.sin(L), -speed * Math.cos(L)], lie: "fairway", start: [0, S.BALL_R, 0], ground: flat(1) });
    synth.push(r);
    out.push(`${club} ${r.carryYd.toFixed(1)}/${r.stopYd.toFixed(1)}`);
    ok(Math.abs(r.carryYd - carry) < 0.6 && Math.abs(r.stopYd - stop) < 1.0, `${club} on flat fairway: carry ${r.carryYd.toFixed(2)} yd (flights.md ${carry}), stop ${r.stopYd.toFixed(2)} (${stop})`);
    ok(r.outcome === "rest" && r.restAttr === 1 && Math.abs(r.lateral) < 1e-6, `${club} on flat fairway: ${r.outcome} on ${r.restAttr}, lateral ${r.lateral}`);
  }
  log(`e. flat fairway, full power, calm (carry/stop yd): ${out.join(", ")}`);
  // a level profile flies as the flat height field
  const a = S.run({ club: "IR7", power: 0.8, start: [5, S.BALL_R, -3], heading: 30, ground: flat(1) });
  const b = S.run({ club: "IR7", power: 0.8, start: [5, S.BALL_R, -3], heading: 30, profile: { heightAt: () => 0, attrAt: () => 1 } });
  ok(a.ticks === b.ticks && a.rest.every((x, i) => Math.abs(x - b.rest[i]) < 1e-9), `a level profile: rest ${b.rest} vs the flat field's ${a.rest}`);
  synth.push(a, b);
  // the analytic cup on a flat green, 3 m out: a putt at its centre holes at the speeds the
  // recorded putts entered at (1.1-2.5 m/s) and runs over it at 6.5
  const cup = { x: 0, y: -S.PHYSICS.cup.depthM, z: -3 };
  const green = flat(6);
  const putt = (speed) => S.run({ club: "PT", start: [0, S.BALL_R, 0], v0: [0, 0, -speed], ground: green, cup });
  const short = putt(2.6), slow = putt(3.2), firm = putt(3.9), fast = putt(7.0);
  synth.push(short, slow, firm, fast);
  ok(short.outcome === "rest" && short.rest[2] > -3 + S.PHYSICS.cup.rimRadiusM, `the analytic cup: a putt short of it ${short.outcome} at z ${short.rest[2].toFixed(3)}`);
  ok(slow.outcome === "holed" && firm.outcome === "holed", `the analytic cup: putts entering it at about 1.5 / 2.6 m/s: ${slow.outcome} / ${firm.outcome}`);
  ok(fast.outcome !== "holed" && fast.rest[2] < -3.5, `the analytic cup: a putt crossing it at about 6.5 m/s: ${fast.outcome} at z ${fast.rest[2].toFixed(2)}`);
  // the wind: a tail wind carries farther, a head wind shorter, a wind from the left drifts right
  const calm = S.run({ club: "WD1", power: 1, start: [0, S.BALL_R, 0], heading: 0, ground: flat(1) });
  const tail = S.run({ club: "WD1", power: 1, start: [0, S.BALL_R, 0], heading: 0, ground: flat(1), wind: { x: 0, z: -5 } });
  const head = S.run({ club: "WD1", power: 1, start: [0, S.BALL_R, 0], heading: 0, ground: flat(1), wind: { x: 0, z: 5 } });
  const cross = S.run({ club: "WD1", power: 1, start: [0, S.BALL_R, 0], heading: 0, ground: flat(1), wind: { x: 5, z: 0 } });
  synth.push(calm, tail, head, cross);
  ok(tail.carry > calm.carry + 5 && head.carry < calm.carry - 5 && cross.lateral > 5, `the wind (5 m/s): carry tail ${tail.carryYd.toFixed(1)} / calm ${calm.carryYd.toFixed(1)} / head ${head.carryYd.toFixed(1)} yd, crosswind drift ${cross.lateral.toFixed(1)} m right`);
  log(`   level profile = flat field; analytic cup (putts of 2.6 / 3.2 / 3.9 / 7.0 m/s from 3 m): ${short.outcome} / ${slow.outcome} / ${firm.outcome} / ${fast.outcome}; wind 5 m/s: tail ${tail.carryYd.toFixed(1)}, calm ${calm.carryYd.toFixed(1)}, head ${head.carryYd.toFixed(1)} yd carry, cross ${cross.lateral.toFixed(2)} m`);
  // hazards on a height field: water 200 m out (the run stops where it enters), OB 230 m
  // out (it rests there); the bunker's cap on the launch; a decimated trace
  const field = (far, attr) => ({ heightAt: () => 0, normalAt: () => [0, 1, 0], attrAt: (x, z) => (z < -far ? attr : 1) });
  const wet = S.run({ club: "WD1", power: 1, start: [0, S.BALL_R, 0], heading: 0, ground: field(200, S.ATTR.water) });
  const out_ = S.run({ club: "WD1", power: 1, start: [0, S.BALL_R, 0], heading: 0, ground: field(230, S.ATTR.ob) });
  const sand = S.run({ club: "WD1", power: 1, lie: "bunker", start: [0, S.BALL_R, 0], heading: 0, ground: flat(3), trace: 16 });
  synth.push(wet, out_, sand);
  ok(wet.outcome === "water" && wet.hazard && Math.abs(wet.hazard.pos[2] + 219.7) < 1 && wet.hazard.pos[1] < S.BALL_R + 0.01, `water 200 m out: ${wet.outcome} entering at z ${wet.hazard?.pos[2].toFixed(2)} (the flat run lands at -219.7)`);
  ok(out_.outcome === "OB" && out_.restAttr === S.ATTR.ob, `OB 230 m out: ${out_.outcome} at rest on ${S.ATTR_NAME[out_.restAttr]}`);
  ok(sand.pct === 25 && sand.power === Math.fround(0.25) && Math.abs(Math.hypot(...sand.v0) - S.PHYSICS.launchTable.WD1[24]) < 1e-9, `the driver from a bunker: power ${sand.power}, pct ${sand.pct}, speed ${Math.hypot(...sand.v0)} (the table's Power25 ${S.PHYSICS.launchTable.WD1[24]})`);
  ok(sand.path.every((p, i) => i === 0 || p[0] % 16 === 0 || i === sand.path.length - 1), "trace: 16 keeps every 16th tick and the rest");
  log(`   water 200 m out: ${wet.outcome} at z ${wet.hazard?.pos[2].toFixed(1)}; OB 230 m out: ${out_.outcome}; the driver from sand: pct ${sand.pct}, carry ${sand.carryYd.toFixed(1)} yd`);
}

// ---- f. the height-field route (with the dump): every recorded putt over a height field
// read off the mesh (the top ground's face under each point, as public/terrain samples
// it) with the analytic cup cut into it at the active cup: the outcome, and the rest
// (in the cup, or within HEIGHT_TOL_M)
const HEIGHT_TOL_M = 0.06;
if (!ONLY && useDump) {
  let n = 0, worst = 0;
  const idx = new Map();
  for (const f of strokes.filter((q) => q.club === "PT")) {
    if (!idx.has(f.hole)) {
      const m = nsscol.loadCollision(DUMP, f.hole, { covers: true });
      idx.set(f.hole, { m, g: nsscol.gridIndex(m, 4, { codes: nsscol.GROUND_CODES }) });
    }
    const { m, g } = idx.get(f.hole);
    const up = (t) => {
      const V = m.verts, Tr = m.tris, a = Tr[t * 3] * 3, b = Tr[t * 3 + 1] * 3, c = Tr[t * 3 + 2] * 3;
      const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], wx = V[c] - V[a], wy = V[c + 1] - V[a + 1], wz = V[c + 2] - V[a + 2];
      const n = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
      return n[1] < 0 ? n.map((x) => -x) : n;
    };
    const field = {
      heightAt: (x, z) => nsscol.topGround(g, x, z)?.y ?? null,
      normalAt: (x, z) => { const h = nsscol.topGround(g, x, z); return h ? up(h.tri) : [0, 1, 0]; },
      attrAt: (x, z) => S.ATTR_OF_CODE[nsscol.topGround(g, x, z)?.code] ?? 1,
    };
    const r = replay(f, field, { trace: false });
    const err = Math.hypot(r.rest[0] - f.rest[0], r.rest[1] - f.rest[1], r.rest[2] - f.rest[2]);
    const cupDist = Math.hypot(r.rest[0] - f.cup.world[0], r.rest[2] - f.cup.world[2]);
    ok(r.outcome === f.outcome, `${f.tag} over the height field: ${r.outcome}, recorded ${f.outcome}`);
    if (f.outcome === "holed") ok(cupDist < S.PHYSICS.cup.bottomRadiusM, `${f.tag} over the height field: holed ${cupDist.toFixed(3)} m from the cup's centre`);
    else { ok(err <= HEIGHT_TOL_M, `${f.tag} over the height field: rest ${err.toFixed(3)} m off`); worst = Math.max(worst, err); }
    n++;
  }
  log(`f. the ${n} putts over a height field read off the mesh with the analytic cup: every outcome the recorded one; the rests off the cup within ${worst.toFixed(3)} m`);
}

// ---- g. determinism ----
if (!ONLY) {
  const f = strokes.find((q) => q.tag === "h03s1-dr");
  const g = useDump ? dumpGround(f) : fixtureGround(f);
  const x = replay(f, g), y = replay(f, g);
  ok(x.path.length === y.path.length && x.path.every((p, i) => p.every((v, j) => Object.is(v, y.path[i][j]))), "the same replay twice: the same path, bit for bit");
  const h = createHash("sha256");
  for (const r of synth) h.update(JSON.stringify([r.ticks, r.rest, r.carry, r.stop, r.outcome, r.bounces, r.rollTick]));
  const digest = h.digest("hex").slice(0, 16);
  const DIGEST = "c5f1c7906e50e63e";
  ok(digest === DIGEST, `the synthetic runs' digest ${digest}, recorded ${DIGEST}`);
  log(`g. determinism: one replay twice the same bits; the ${synth.length} synthetic runs' digest ${digest}`);
}

log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nall ${passed} checks passed`);
process.exit(failed ? 1 : 0);
