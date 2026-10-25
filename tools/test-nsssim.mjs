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
//   h. the cup and the bounce's special cases: a roll's Cupside bounce off a wall and a
//      bevel and its v.y cap, Cupside beyond 0.5 m of the active cup, holed at the first Cup
//      contact (stopAtCup), a shot's bevel contact in its first two ground ticks bouncing by
//      Green's law with the Cupside cap (synthetic; with the dump r1 h10s2 from its RAM sample,
//      to the bit);
//   i. with the dump: the putter assist (tools/fixtures/nss-putt-assist.json): round 2's ghost
//      balls holed or not as the game's, every assisted putt's holing run against the game's
//      holeLo..holeHi;
//   j. the flagstick (tools/fixtures/nss-pole-contacts.json): the shape, the cloth's kick against
//      h01s3's recorded bounce, and with the dump h01s3's cloth hit and fall, the 16 recorded pole
//      contacts from the state before to the one after, pinHigh, the round-1 strokes with pole
//      play from their launches; the rules on a flat green;
//   k. the wind at 8-15 m/s (tools/fixtures/nss-wind-high.json: 17 strokes of the RAM player's
//      rounds, every airborne sample from the launch alone), the HUD's mph table, the canopy
//      counter on one leaf sheet;
//   g. determinism: the same run twice gives the same bits, and a digest of the
//      synthetic runs is the recorded one.
// Non-putter strokes are replayed with the flagstick in (run's flag, flagInPlay), the actor
// trees' canopies (collision/hNN-actors, tools/harness/state/eden/tools/nss-actortrees.py) in
// the dump's ground.
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
  "h01s3-sw": "met the flag's cloth: the hit and the fall are the game's (section j), but the kick's seed is the contact point's x to a float32 ulp, which the push-out at the rim leaves 1.7 mm off, so the kick and the rest differ",
  "h08s6-sw": "rolled into the cup and out again (the recorded lip-out, played as a lip-out, checked below): the far bevel's bounce turns the 2 mm the ball is off when it reaches it into 0.07 m",
  "h17s1-dr": "a roll-off where the game counts the face the ball leaves for one more tick (it does on 27 of the 57 such ticks of the recordings, alike in every measured way), then the bunker landing turns 7 mm into 1.3 m",
};
// the strokes through an actor tree's canopy (Obj_Glf_*: the meshes tools/harness/state/eden/tools/nss-actortrees.py
// places by their bone SRT, collision/hNN-actors): played to their rest over the dump with them; the fixture's
// triangles have no actor meshes, so the fixture's bits are not compared, and without the dump they are not played
const ACTORS = {
  "h03s2-sp": "Obj_Glf_HardWoodB n3-26", "h07s1-sp": "Obj_Glf_HardWoodB n7-44", "h09s2-3i": "Obj_Glf_ConiferTreeD n9-35 (canopy and palm fronds)",
  "h12s1-sp": "Obj_Glf_HardWoodA n12-52", "h14s2-dr": "Obj_Glf_HardWoodA n14-27", "h16s4-9i-rough": "Obj_Glf_HardWoodC n16-28",
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
  // the contact record's masks (0xd395b0 / 0xd39a44: not 0x3f9901; 0xd396ec: 0x2cd208) and the flag's shape
  const bits = (a) => a.reduce((m, x) => m | (1 << x), 0);
  ok(bits(S.PHYSICS.ground.groundTickAttrs) === (~0x3f9901 & 0x3fffff) && bits(S.PHYSICS.ground.zeroSpinAttrs) === 0x2cd208, "the ground-tick and spin-zeroing attribute masks");
  ok(S.PHYSICS.flag.verts512.length === 33 && S.PHYSICS.flag.tris.length === 40 && S.PHYSICS.flag.source.shapeSha1 === "f2badbd1ab9888501e8065f52e6e0e9a9bbfa67d", "the flagstick's shape (BGOBJ_GlfPin_Anim_col)");
  log(`a. constants: PHYSICS = tools/nss-physics.json (${Object.keys(file.attrs).length} attributes, ${Object.keys(file.clubs).length} clubs, ${Object.values(file.launchTable).reduce((s, r) => s + r.length, 0)} launch speeds)`);
}

// ---- the fixture ----
const index = JSON.parse(readFileSync(join(FIX, "index.json"), "utf8"));
const strokes = index.strokes.map((s) => JSON.parse(readFileSync(join(FIX, s.tag + ".json"), "utf8")));
ok(strokes.length === 71, `${strokes.length} fixture strokes`);
for (const tag of [...Object.keys(EXCEPT), ...Object.keys(ACTORS)]) ok(strokes.some((f) => f.tag === tag), `EXCEPT / ACTORS names ${tag}, not a fixture stroke`);

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
    const m = nsscol.loadCollision(DUMP, f.hole, { covers: true, extras: ["leaf", "water", "actors"] });
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
  // the flagstick in, the cloth along the wind object's angle, for every stroke but a putt from the green
  flag: S.flagInPlay(f.club, f.lie) ? { windDirRad: f.wind.dirRad } : null,
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
    if (!EXCEPT[f.tag] && !ACTORS[f.tag]) ok(same, `${f.tag}: the fixture's triangles replay to ${q.rest} (${q.ticks} ticks), the dump's to ${r.rest} (${r.ticks})`);
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
  if (f.tag === "h08s6-sw") ok(r.outcome === "rest" && !r.holed && restErr < 0.1, `h08s6-sw: the recorded lip-out plays as ${r.outcome} ${restErr.toFixed(3)} m from its rest`);
  if (EXCEPT[f.tag] || (ACTORS[f.tag] && !useDump)) continue;
  ok(r.outcome === f.outcome, `${f.tag}: outcome ${r.outcome}, recorded ${f.outcome}`);
  if (f.outcome === "holed") ok(cupDist < S.PHYSICS.cup.bottomRadiusM && r.rest[1] < f.cup.world[1] + 0.1, `${f.tag}: holed but at rest ${cupDist.toFixed(3)} m from the cup's centre, ${(r.rest[1] - f.cup.world[1]).toFixed(3)} m above its bottom`);
  else ok(restErr <= REST_TOL_M, `${f.tag}: rest ${restErr.toFixed(4)} m off (${r.outcome}, recorded ${f.outcome})`);
}
const ms = Date.now() - t0;
// the holed putts come to rest in the cup where the recordings did (a roll's one contact a tick, its Cupside bounce)
if (!ONLY) {
  const inCup = rows.filter((r) => r.want === "holed" && r.tag.endsWith("-pt") && !EXCEPT[r.tag]);
  const close = inCup.filter((r) => r.restErr < 0.005).length;
  ok(close >= 12, `the holed putts at rest in the cup within 5 mm of the recorded rest: ${close} of ${inCup.length}`);
}
const fit = rows.filter((r) => r.airFit), played = rows.filter((r) => !EXCEPT[r.tag] && (useDump || !ACTORS[r.tag]));
const notHoled = played.filter((r) => r.want !== "holed"), holed = played.filter((r) => r.want === "holed");
if (!ONLY) {
  log(`c. replays over ${useDump ? "the dump's collision (tools/lib/nsscol.mjs)" : "the fixture's triangles"}: ${rows.length} strokes in ${ms} ms${useDump ? `; the fixture's triangles give the same bits on ${sameAsFixture} of ${rows.length}` : ""}`);
  log(`   the flight, ${fit.length} end-to-end fits: worst ${(Math.max(...fit.map((r) => r.airErr)) * 1000).toFixed(4)} mm, median ${(median(fit.map((r) => r.airErr)) * 1000).toFixed(4)} mm`);
  log(`   the rest, ${notHoled.length} strokes played to the end: worst ${Math.max(...notHoled.map((r) => r.restErr)).toFixed(4)} m, median ${median(notHoled.map((r) => r.restErr)).toFixed(4)} m; ${holed.length} holed: all holed, at rest ${Math.max(...holed.map((r) => r.cupDist)).toFixed(3)} m or less from the cup's centre (${holed.filter((r) => r.restErr <= REST_TOL_M).length} within ${REST_TOL_M} m of the recorded rest)`);
  for (const [tag, why] of Object.entries(EXCEPT)) { const r = rows.find((q) => q.tag === tag); if (r) log(`   except ${tag}: rest ${r.restErr.toFixed(3)} m off (${r.outcome}, recorded ${r.want}): ${why}`); }
  if (useDump) log(`   through the actor trees' canopies (${Object.keys(ACTORS).join(", ")}): rests ${Object.keys(ACTORS).map((t) => rows.find((q) => q.tag === t)?.restErr.toFixed(4)).join(" / ")} m off`);
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

// ---- h. the cup and the bounce's special cases (0xd3f910) ----
const F32 = Math.fround;
// the bounce's law in float32: v = RH vt - RV vn about n, v.y capped at CupsideReflectionMaxVelY when asked
const lawOf = (vin, n, rh, rv, cap = true) => {
  const N = n.map(F32), Vi = vin.map(F32);
  const d = F32(F32(F32(Vi[0] * N[0]) + F32(Vi[1] * N[1])) + F32(Vi[2] * N[2])), vn = N.map((x) => F32(d * x));
  const v = Vi.map((x, i) => F32(F32(F32(rh) * F32(x - vn[i])) - F32(F32(rv) * vn[i])));
  if (cap && v[1] > S.PHYSICS.ground.cupsideReflectionMaxVelY) v[1] = F32(S.PHYSICS.ground.cupsideReflectionMaxVelY);
  return v;
};
const AT = S.PHYSICS.attrs, CAP = S.PHYSICS.ground.cupsideReflectionMaxVelY;
if (!ONLY) {
  const quad = (verts, tris, attr, a, b, c, d, at) => { const i = verts.length / 3; verts.push(...a, ...b, ...c, ...d); tris.push(i, i + 1, i + 2, i, i + 2, i + 3); attr.push(at, at); };
  // a green floor at y = 0 and, at z = -0.5, a Cupside wall (vertical, facing +z) or a 45-degree Cupside bevel
  const course = (kind) => {
    const verts = [], tris = [], attr = [];
    quad(verts, tris, attr, [-2, 0, 2], [2, 0, 2], [2, 0, -2], [-2, 0, -2], S.ATTR.green);
    if (kind === "wall") quad(verts, tris, attr, [-1, -0.5, -0.5], [1, -0.5, -0.5], [1, 0.5, -0.5], [-1, 0.5, -0.5], S.ATTR.cupside);
    else quad(verts, tris, attr, [-1, 0, -0.5], [1, 0, -0.5], [1, 1, -1.5], [-1, 1, -1.5], S.ATTR.cupside);
    return S.meshGround({ verts: new Float64Array(verts), tris: new Uint32Array(tris), attr: new Uint8Array(attr) });
  };
  const roll = (kind, speed, cup) => {
    let at = null, vin = null;
    const r = S.run({ club: "PT", start: [0, S.BALL_R, 0], v0: [0, 0, -speed], ground: course(kind), cup,
      onMove: (m) => { if (at == null) vin = m.vin; }, onTick: (t) => { if (at == null && t.a4 === S.ATTR.cupside) at = { tick: t.tick, v: t.v, vin }; } });
    return { r, at };
  };
  const near = { x: 0, y: -0.31, z: -0.45 }, far = { x: 0, y: -0.31, z: -1.5 };
  // a roll meeting Cupside bounces (0xd3ab74..0xd3ab8c): off the wall the normal part turns back at ReflectionV
  // 0.13 and the tangential is kept at 0.999 (a slide would stop it dead)
  const w = roll("wall", 3, near);
  const RVc = AT[S.ATTR.cupside].reflectionV;
  ok(w.at && Math.abs(w.at.v[2] - RVc * Math.abs(w.at.vin[2])) < 0.01, `a roll into a Cupside wall bounces back at ${RVc} of its normal speed: v.z ${w.at?.v[2].toFixed(4)} from ${w.at?.vin[2].toFixed(4)}`);
  // up the bevel: v.y = 0.999 vt.y - 0.13 vn.y, at most CupsideReflectionMaxVelY
  const b3 = roll("bevel", 3, near), b4 = roll("bevel", 4.5, near);
  ok(b3.at && b3.at.v[1] > 1 && b3.at.v[1] < CAP - 0.05, `a 3 m/s roll up a 45-degree Cupside bevel leaves at v.y ${b3.at?.v[1].toFixed(3)} (under the cap)`);
  ok(b4.at && b4.at.v[1] <= CAP && b4.at.v[1] > CAP - 0.1, `a 4.5 m/s roll up it is capped: v.y ${b4.at?.v[1].toFixed(3)} (cap ${CAP}, less one tick's gravity)`);
  // Cupside farther than cupsideReachM (0.5 m) from the active cup (a plugged cup's wall) is no contact
  const thru = roll("wall", 3, far);
  ok(!thru.at && thru.r.rest[2] < -0.6, `a Cupside wall 1 m from the cup is no contact: rest z ${thru.r.rest[2].toFixed(2)}`);
  synth.push(w.r, b3.r, b4.r, thru.r);
  // holed = a tick's contact is Cup: a putt onto a Cup floor holes at that tick; stopAtCup ends the run there
  {
    const verts = [], tris = [], attr = [];
    quad(verts, tris, attr, [-2, 0, 2], [2, 0, 2], [2, 0, -1], [-2, 0, -1], S.ATTR.green);
    quad(verts, tris, attr, [-2, 0, -1], [2, 0, -1], [2, 0, -3], [-2, 0, -3], S.ATTR.cup);
    const g = S.meshGround({ verts: new Float64Array(verts), tris: new Uint32Array(tris), attr: new Uint8Array(attr) });
    const a = S.run({ club: "PT", start: [0, S.BALL_R, 0], v0: [0, 0, -2], ground: g, cup: { x: 0, y: -0.31, z: -1.2 } });
    const s = S.run({ club: "PT", start: [0, S.BALL_R, 0], v0: [0, 0, -2], ground: g, cup: { x: 0, y: -0.31, z: -1.2 }, stopAtCup: true });
    ok(a.holed && a.holedTick > 0 && s.holed && s.ticks === a.holedTick && s.ticks < a.ticks, `holed at the first Cup contact (tick ${a.holedTick}); stopAtCup ends the run there (${s.ticks} of ${a.ticks} ticks)`);
    synth.push(a, s);
  }
  // a shot's contact with the cup's bevel (Cupside near the cup facing up) in the stroke's first two ground ticks
  // bounces with Green's coefficients, the cap still Cupside's (M+0x108); with no cup, as Cupside
  {
    const u = [0.501, 0.706, -0.501].map((x, i, a) => x / Math.hypot(...a));
    const vin = [-6.290, -11.195, 5.334], start = [0, 1, 0], o = start.map((x, i) => x - (S.BALL_R + 0.01) * u[i]);
    const t1 = [u[1], -u[0], 0].map((x) => x / Math.hypot(u[1], u[0])), t2 = [u[1] * t1[2] - u[2] * t1[1], u[2] * t1[0] - u[0] * t1[2], u[0] * t1[1] - u[1] * t1[0]];
    const P = (a, b) => o.map((x, i) => x + 5 * (a * t1[i] + b * t2[i]));
    const tri = S.meshGround({ verts: new Float64Array([...P(-1, -1), ...P(1, -1), ...P(0, 1)]), tris: new Uint32Array([0, 1, 2]), attr: new Uint8Array([S.ATTR.cupside]) });
    const bounce = (cup) => { let v = null; S.run({ club: "IR7", start, v0: vin, ground: tri, cup, maxTicks: 1, onTick: (t) => { v = t.v; } }); return v; };
    const g = bounce({ x: 0, y: 0, z: 0 }), c = bounce(null);
    const dn = vin[0] * u[0] + vin[1] * u[1] + vin[2] * u[2];
    const want = (rh, rv) => { const v = vin.map((x, i) => rh * (x - dn * u[i]) - rv * dn * u[i]); v[1] = Math.min(v[1], CAP); return v; };
    const wg = want(AT[S.ATTR.green].reflectionH, AT[S.ATTR.green].reflectionV), wc = want(AT[S.ATTR.cupside].reflectionH, AT[S.ATTR.cupside].reflectionV);
    ok(g && Math.hypot(g[0] - wg[0], g[1] - wg[1], g[2] - wg[2]) < 2e-3 && g[1] === F32(CAP), `a shot's first contact on the cup's bevel bounces as the green, capped: (${g?.map((x) => x.toFixed(3))})`);
    ok(c && Math.hypot(c[0] - wc[0], c[1] - wc[1], c[2] - wc[2]) < 2e-3, `with no cup the same contact bounces as Cupside: (${c?.map((x) => x.toFixed(3))})`);
  }
  // the analytic cup on a flat green: a ball skimming in lands on the far bevel (n.y 0.70); at the stroke's first
  // ground tick it leaves by Green's law with the Cupside cap (Green's raw v.y 2.40), from the third by Cupside's
  {
    const cup = { x: 0, y: -S.PHYSICS.cup.depthM, z: 0 };
    for (const [gc, a, name] of [[0, AT[6], "Green"], [3, AT[9], "Cupside"]]) {
      const at = new Map();
      const r = S.run({ club: "IR7", start: [0.25, 0.15, 0], v0: [-6, -1, 0], hop0: 0, ground: flat(6), cup, contacts: true, resume: { groundCount: gc }, maxTicks: 40, onTick: (t) => at.set(t.tick, t.v) });
      const c = r.contacts[0], v = c && at.get(c.tick), want = c && lawOf(c.vin, c.n, a.reflectionH, a.reflectionV);
      ok(c && c.attr === S.ATTR.cupside && c.n[1] > 0.1 && v.every((x, i) => x === want[i]), `the cup's bevel at the stroke's ground tick ${gc + 1}: v ${v}, ${name}'s law with the cap ${want}`);
      synth.push(r);
    }
  }
  // r1 h10s2 (2026-10-25, lab/rplay/r1-h10s2-IR7.npz): off the flagstick onto cup 0's bevel; from its RAM sample at
  // frame 222 the game's velocity 4 ticks later, to the bit (Green's 0.5 / 0.37 and the cap; Cupside's own law
  // left it at (1.475, -0.396, -2.430))
  if (useDump) {
    const f = { hole: 10, cup: { k: 0 } };
    let last = null;
    const r = S.run({ club: "IR7", start: [-5.2814154624938965, -5.579188823699951, -350.14080810546875], v0: [-6.292360305786133, -11.128562927246094, 5.335305213928223],
      hop0: 0.7215791344642639, yRef: -9.716035842895508, cup: { x: -5.2336, y: -5.9605, z: -350.2411 }, ground: dumpGround(f), maxTicks: 4, contacts: true, onTick: (t) => { last = t; } });
    const want = [2.831516981124878, 1.8495265245437622, -3.309194326400757];
    ok(r.contacts.length === 1 && r.contacts[0].attr === S.ATTR.cupside && last.v.every((x, i) => x === want[i]), `r1 h10s2's bevel landing: v ${last.v}, the game's ${want}`);
  }
  log(`h. the cup: a roll's Cupside bounce (v.z ${w.at?.v[2].toFixed(3)} off a wall at 3 m/s; v.y ${b3.at?.v[1].toFixed(3)} / ${b4.at?.v[1].toFixed(3)} up a bevel at 3 / 4.5 m/s, cap ${CAP}); Cupside 1 m from the cup no contact; holed at the first Cup contact; a shot's bevel contact in its first two ground ticks by Green's law with the cap${useDump ? " (r1 h10s2 from RAM to the bit)" : ""}`);
}

// ---- i. the cup against the game's own putter assist (with the dump; tools/fixtures/nss-putt-assist.json): every
// ghost ball the assist's search ran in round 2 (RAM: each trial's launch, holed or not) replayed from its launch,
// and every assisted putt's run of holing percents on its line against the game's holeLo..holeHi
const ASSIST = join(ROOT, "tools/fixtures/nss-putt-assist.json");
if (!ONLY && useDump && existsSync(ASSIST)) {
  const X = JSON.parse(readFileSync(ASSIST, "utf8"));
  const cupOf = (c) => ({ x: c[0], y: c[1], z: c[2] });
  const gOf = (hole, k) => dumpGround({ hole, cup: { k } });
  let n = 0, agree = 0;
  for (const g of X.ghosts) {
    const r = S.run({ club: "PT", power: g.trial, lie: "green", start: g.start, v0: g.v0, cup: cupOf(g.cup), ground: gOf(g.hole, g.cupK), stopAtCup: true });
    n++; if (r.holed === g.holed) agree++;
  }
  ok(n >= 99 && agree >= 0.85 * n, `the putter assist's ghost balls: ${agree} of ${n} holed or not as the game's`);
  const rows = [];
  let worstLo = 0, worstHi = 0, sum = 0;
  for (const p of X.putts) {
    const heading = Math.atan2(p.v0[0], -p.v0[2]) * 180 / Math.PI, held = new Set();
    for (let q = Math.max(1, p.holeLo - 6); q <= Math.min(100, p.holeHi + 8); q++) {
      const r = S.run({ club: "PT", power: q / 100 + 0.005, lie: "green", start: p.start, heading, cup: cupOf(p.cup), ground: gOf(p.hole, p.cupK), stopAtCup: true });
      if (r.holed) held.add(q);
    }
    const mid = Math.round((p.holeLo + p.holeHi) / 2);
    let a = mid, b = mid;
    if (held.has(mid)) { while (held.has(a - 1)) a--; while (held.has(b + 1)) b++; } else a = b = NaN;
    worstLo = Math.max(worstLo, Math.abs(a - p.holeLo)); worstHi = Math.max(worstHi, Math.abs(b - p.holeHi)); sum += Math.abs(a - p.holeLo) + Math.abs(b - p.holeHi);
    rows.push(`${p.tag} ${p.holeLo}-${p.holeHi}/${a}-${b}`);
  }
  ok(rows.length >= 15 && worstLo <= 1 && worstHi <= 4, `the assisted putts' holing runs (game/model pct): ${rows.join(", ")}`);
  log(`i. the putter assist: ${agree} of ${n} ghost balls holed or not as the game's; the ${rows.length} assisted putts' holing runs (game/model pct) ${rows.join(", ")}: the low ends within ${worstLo}, the high within ${worstHi} (sum ${sum})`);
}

// ---- j. the flagstick (flagMesh, flagKick, run's flag; tools/fixtures/nss-pole-contacts.json) ----
const POLE = join(ROOT, "tools/fixtures/nss-pole-contacts.json");
if (!ONLY) {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // the shape: the decagonal pole from the bone to 3.0098 m within 0.0274 m of the axis, the cloth's free edge
  // 1.0078 m downwind along (sin a, cos a)
  {
    const a = 1.2, m = S.flagMesh({ x: 10, y: -5, z: 20 }, { windDirRad: a });
    ok(m.attr.length === 40 && m.attr.filter((x) => x === S.ATTR.flag).length === 2 && m.attr.filter((x) => x === S.ATTR.pin).length === 38, `flagMesh: ${m.attr.length} triangles`);
    const rel = []; for (let i = 0; i < m.verts.length; i += 3) rel.push([m.verts[i] - 10, m.verts[i + 1] + 5, m.verts[i + 2] - 20]);
    const pole = rel.filter((p) => Math.hypot(p[0], p[2]) < 0.03), cloth = rel.filter((p) => Math.hypot(p[0], p[2]) > 0.5);
    ok(Math.max(...pole.map((p) => Math.hypot(p[0], p[2]))) < 0.0274 && Math.max(...pole.map((p) => p[1])) < 3.0098 + 1e-9 && Math.min(...pole.map((p) => p[1])) === 0, "the pole: within 0.0274 m of the axis, from the bone to 3.0098 m");
    ok(cloth.length === 2 && cloth.every((p) => Math.abs(p[0] - 1.0078125 * Math.sin(a)) < 1e-9 && Math.abs(p[2] - 1.0078125 * Math.cos(a)) < 1e-9), "the cloth's free edge 1.0078 m downwind, along (sin a, cos a)");
    ok(S.flagInPlay("PT", "green") === false && S.flagInPlay("PT", "fringe") === true && S.flagInPlay("SW", "green") === true && S.flagInPlay("WD1", "tee") === true, "flagInPlay: out for a putt from the green only");
  }
  // the kick: h01s3's first green contact after the cloth (RAM: the contact point M+0x6c, the normal M+0x78, vin
  // M+0x90, the bounce's v): seed 88183192, 16.982 deg, 1.2615 m/s; the cup's bone is known to 0.1 mm, so 5e-4 m/s
  {
    const cp = [88.18318939208984, -20.948341369628906, -357.9530334472656], cup = { x: 88.017, z: -357.9762 };
    const n = [0.0198361836373806, 0.9995430707931519, -0.022808030247688293], vin = [0.13320501148700714, -8.313202857971191, -0.025255542248487473];
    const game = [-1.0358731746673584, 3.0664780139923096, 0.0207129567861557];
    const k = S.flagKick(cp[0], cp[2], cup);
    ok(k.seed === 88183192 && Math.abs(k.angDeg - 16.982197) < 1e-5 && Math.abs(k.speed - 1.2614808) < 1e-6, `flagKick: seed ${k.seed}, ${k.angDeg} deg, ${k.speed} m/s`);
    const b = lawOf(vin, n, AT[6].reflectionH, AT[6].reflectionV, false), v = [F32(b[0] + k.x), b[1], F32(b[2] + k.z)];
    ok(dist(v, game) < 5e-4, `h01s3's flag kick on its Green bounce: ${v} vs the game's ${game}`);
    ok(S.flagKick(-5.2, -350, { x: -5.23, z: -350.2 }).seed === 0, "a negative contact x seeds 0 (fcvtzu)");
    let lo = Infinity, hi = -Infinity, slo = Infinity, shi = -Infinity;
    for (let i = 0; i < 2000; i++) { const q = S.flagKick(1 + i * 0.0137, 0, { x: 0, z: 5 }); lo = Math.min(lo, q.angDeg); hi = Math.max(hi, q.angDeg); slo = Math.min(slo, q.speed); shi = Math.max(shi, q.speed); }
    ok(lo >= -20 && hi < 20 && hi - lo > 39 && slo >= 0.5 && shi < 2.5 && shi - slo > 1.9, `the kick's range over 2000 contact points: ${lo.toFixed(2)}..${hi.toFixed(2)} deg, ${slo.toFixed(3)}..${shi.toFixed(3)} m/s`);
    log(`j. the flagstick: flagMesh's decagonal pole and cloth; flagKick on h01s3's contact point: seed ${k.seed}, ${k.angDeg.toFixed(3)} deg, ${k.speed.toFixed(4)} m/s, the recorded bounce to ${dist(v, game).toExponential(1)} m/s`);
  }
  // h01s3 (fixture): the cloth hit at the recorded tick and spot, the fall to the green within 0.2 mm
  if (useDump) {
    const f = strokes.find((q) => q.tag === "h01s3-sw");
    const r = replay(f, dumpGround(f));
    ok(r.flagHit && Math.abs(r.flagHit.tick - f.firstContact.tick) <= 1 && dist(r.flagHit.pos, f.firstContact.pos) < 1e-4, `h01s3: the cloth hit at tick ${r.flagHit?.tick} ${r.flagHit?.pos}, recorded ${f.firstContact.tick} ${f.firstContact.pos}`);
    const by = new Map(r.path.map((p) => [p[0], p]));
    let worst = 0, n = 0;
    for (const [tk, , , , x, y, z] of f.path) if (tk > r.flagHit.tick && tk < 619) { const p = by.get(tk); worst = Math.max(worst, Math.hypot(p[1] - x, p[2] - y, p[3] - z)); n++; }
    ok(n >= 2 && worst < 2e-4, `h01s3: the fall after the cloth, ${n} recorded samples, worst ${(worst * 1000).toFixed(3)} mm`);
    ok(r.pinHigh === true && r.flagKick && r.flagKick.tick >= 619 && r.flagKick.tick <= 621, `h01s3: pinHigh ${r.pinHigh}, the kick at the first green contact (tick ${r.flagKick?.tick})`);
    log(`   h01s3: the cloth hit at tick ${r.flagHit.tick} (recorded ${f.firstContact.tick}), the fall within ${(worst * 1000).toFixed(3)} mm of ${n} samples, the kick at tick ${r.flagKick?.tick} (seed ${r.flagKick?.seed}, the game's 88183192: the rim's push-out leaves the contact point off), rest ${dist(r.rest, f.rest).toFixed(2)} m off, ${r.outcome}`);
  }
  // every recorded pole contact (15 from Eden's RAM + h08s1's 4-decimal state) from the state before it to the first
  // after: the velocity within 3 mm/s on 14 of the 16 (the two misses edge ties), the shot contacts placed within
  // 2 mm, every one closer with the flag than without, and M+0x102 (pinHigh) as recorded
  if (useDump && existsSync(POLE)) {
    const PC = JSON.parse(readFileSync(POLE, "utf8"));
    const gOf = (c) => dumpGround({ hole: c.hole, cup: { k: c.k } });
    const rows = [], bad = [];
    let vOk = 0, ph = 0;
    for (const c of [...PC.contacts, PC.h08]) {
      const cup = { x: c.cup[0], y: c.cup[1], z: c.cup[2] };
      const go = (flag) => {
        let st = null;
        S.run({ club: c.mode === 2 ? "PT" : c.club, start: c.start, v0: c.v0, hop0: c.hop, backspin: c.backspin, yRef: c.yRef, cup, ground: gOf(c),
          wind: c.mode === 1 && c.windS > 0 ? { s: c.windS, dirRad: c.windDirRad } : null, flag: flag ? { windDirRad: c.windDirRad } : null,
          resume: { groundCount: c.groundCount }, maxTicks: c.t1 - c.t0, stopAtHazard: false, onTick: (q) => { if (q.tick === c.t1 - c.t0) st = q; } });
        return st;
      };
      const w = go(true), wo = go(false);
      const tol = c.decimals ? 2e-4 : 0;
      const dv = dist(w.v, c.v1), dp = dist(w.p, c.pos1), dvo = dist(wo.v, c.v1);
      if (dv < 3e-3 + 10 * tol) vOk++; else bad.push(`${c.tag}@${c.t0}`);
      ok(dv < dvo, `${c.tag} ${c.t0}: with the flag the velocity ${dv.toFixed(4)} m/s off, without it ${dvo.toFixed(4)}`);
      rows.push(`${c.tag}@${c.t0} ${(dp * 1000).toFixed(2)} mm ${(dv * 1000).toFixed(1)} mm/s`);
      if (["h10s2-IR7", "h12s2-IR3"].includes(c.tag) && c.mode === 1 && c.t0 !== 886) ok(dp < 2e-3 && dv < 3e-3, `${c.tag} ${c.t0}: a shot meeting the pole placed ${(dp * 1000).toFixed(2)} mm off`);
      if (c !== PC.h08) {
        const r = S.run({ club: c.mode === 2 ? "SW" : c.club, start: c.start, v0: c.v0, hop0: c.hop, yRef: c.yRef, cup, ground: gOf(c), flag: { windDirRad: c.windDirRad }, resume: { groundCount: c.groundCount, pinHigh: c.pinHigh0 }, maxTicks: c.t1 - c.t0, stopAtHazard: false });
        if (r.pinHigh === c.pinHigh1) ph++;
      }
    }
    ok(vOk >= 14 && bad.every((b) => ["h01s3-sw@642", "h08s1-WD3@1488"].includes(b)), `the pole contacts: ${vOk} of ${PC.contacts.length + 1} within 3 mm/s (off: ${bad.join(", ")})`);
    ok(ph === PC.contacts.length, `pinHigh as recorded on ${ph} of ${PC.contacts.length}`);
    log(`   ${PC.contacts.length + 1} pole contacts from the recorded state before to the one after: the velocity within 3 mm/s on ${vOk} (off, edge ties: ${bad.join(", ") || "none"}); pinHigh as recorded on ${ph}\n     ${rows.join("; ")}`);
    // the round-1 strokes with pole play, from their launch records: h10s2-IR7 (pole, rim, pole), h12s2-IR3 (the pole
    // 0.77 m up), h08s1-WD3 (1.71 m up, with the other edge face: poleTie high), each with an edge tie whose other
    // face misses by metres; h06s2-IR7 (passed 0.109 m from the axis) untouched
    const want = { "h10s2-IR7": 0.05, "h12s2-IR3": 0.01, "h06s2-IR7": 0.02, "h08s1-WD3": 0.01 };
    const out = [];
    for (const s of PC.strokes) {
      const cup = { x: s.cup[0], y: s.cup[1], z: s.cup[2] };
      const go = (flag, poleTie) => S.run({ club: s.club, power: s.power, lie: s.lie, start: s.start, v0: s.v0, hop0: s.hop0, yRef: s.yRef, wind: s.wind.s > 0 ? s.wind : null, cup, ground: gOf(s), flag: flag ? { windDirRad: s.wind.dirRad } : null, poleTie, stopAtHazard: false, contacts: true });
      const r = go(true, s.poleTie), q = go(false), alt = go(true, s.poleTie === "low" ? "high" : "low");
      const e = dist(r.rest, s.rest), eq = dist(q.rest, s.rest), ea = dist(alt.rest, s.rest);
      const pins = r.contacts.filter((c) => c.attr === S.ATTR.pin).length;
      ok(e <= want[s.tag], `${s.tag}: rest ${e.toFixed(4)} m off with the flag, tie ${s.poleTie} (without the flag ${eq.toFixed(3)})`);
      if (s.tag === "h06s2-IR7") ok(pins === 0, `h06s2: ${pins} pole contacts`);
      else ok(r.poleTies.length > 0 && ea > 0.5, `${s.tag}: an edge tie (ticks ${r.poleTies}), the other face ${ea.toFixed(2)} m off`);
      out.push(`${s.tag} ${e.toFixed(4)} m (tie ${s.poleTie}; the other face ${ea.toFixed(2)} m, no flag ${eq.toFixed(2)} m)`);
    }
    log(`   round 1 from the launches, rest off the recorded: ${out.join("; ")}`);
  }
  // the rules in isolation: a chip at the pole 1 m up bounces back (none without the flag); through the cloth the
  // ball drops dead and is kicked toward the cup at its first green contact
  {
    const cup = { x: 0, y: -0.31, z: -2 };
    const shot = (flag) => S.run({ club: "SW", start: [0, 1.0, 0], v0: [0, 0, -6], hop0: 0, cup, ground: flat(6), flag: flag ? { windDirRad: 0 } : null, maxTicks: 200, contacts: true });
    const a = shot(true), b = shot(false);
    ok(a.contacts.some((c) => c.attr === S.ATTR.pin) && a.rest[2] > -2 && b.rest[2] < -2.5 && a.pinHigh === true, `a chip at the pole: with the flag rest z ${a.rest[2].toFixed(2)} (pinHigh ${a.pinHigh}), without ${b.rest[2].toFixed(2)}`);
    const c = S.run({ club: "SW", start: [0.5, 2.19, -1], v0: [0, 0, -8], hop0: 0, cup, ground: flat(6), flag: { windDirRad: Math.PI / 2 }, maxTicks: 2000, contacts: true });
    ok(c.flagHit && Math.abs(c.flagHit.pos[2] - cup.z) < 0.05 && c.flagKick, `the cloth: hit at ${c.flagHit?.pos}, kick ${c.flagKick?.speed}`);
    synth.push(a, b, c);
  }
}

// ---- k. the wind at 8-15 m/s and the HUD's mph (tools/fixtures/nss-wind-high.json: 17 strokes of the RAM player's
// rounds, every airborne sample from the launch record alone), and the canopy counter on one leaf sheet ----
const WIND = join(ROOT, "tools/fixtures/nss-wind-high.json");
if (!ONLY && existsSync(WIND)) {
  const Wf = JSON.parse(readFileSync(WIND, "utf8"));
  const none = { contacts: () => [], pass: () => [] };
  const fly = (f, wind) => {
    const at = new Map();
    S.run({ club: f.club, start: f.launch.start, v0: f.launch.v0, hop0: f.launch.hop, yRef: f.launch.yRef, wind, ground: none,
      cup: { x: f.cup[0], y: f.cup[1], z: f.cup[2] }, maxTicks: f.air.at(-1)[0], onTick: (t) => at.set(t.tick, t.p) });
    return (t, x, y, z) => { const p = at.get(t); return Math.hypot(p[0] - x, p[1] - y, p[2] - z); };
  };
  let worst = 0, samples = 0, weakest = Infinity;
  const speeds = new Set();
  for (const f of Wf.strokes) {
    const w = { s: f.wind.s, dirRad: f.wind.dirRad };
    const e = fly(f, w), e98 = fly(f, { ...w, s: 0.98 * w.s });
    let m = 0, m98 = 0;
    for (const [t, x, y, z] of f.air) { m = Math.max(m, e(t, x, y, z)); m98 = Math.max(m98, e98(t, x, y, z)); samples++; }
    ok(m < AIR_TOL_M, `${f.tag} (round ${f.round}, s ${f.wind.s}): the flight ${(m * 1000).toFixed(3)} mm from RAM`);
    worst = Math.max(worst, m); weakest = Math.min(weakest, m98); speeds.add(f.wind.s);
  }
  ok(weakest > 0.01, `|W| = 0.98 s: the closest flight ${(weakest * 1000).toFixed(1)} mm from RAM (the samples resolve the law)`);
  // the HUD: a table, one value per whole s
  ok(S.HUD_MPH.length === 16 && S.HUD_MPH.every((m, s) => s === 0 || m > S.HUD_MPH[s - 1] + 1), "HUD_MPH: 16 values, 2 or 3 mph apart");
  for (let s = 0; s <= 15; s++) ok(S.windSpeedFromHud(S.hudMphOf(s)) === s, `windSpeedFromHud(hudMphOf(${s})) = ${S.windSpeedFromHud(S.hudMphOf(s))}`);
  for (let s = 1; s <= 15; s++) ok(S.windSpeedFromHud(Math.round(s * 2.237 * 100) / 100) === s, `windSpeedFromHud(${(s * 2.237).toFixed(2)}): the RAM reader's mph_hud`);
  // RAM's s against the HUD's own text (Eden's address frames, lab/rplay/frames, rounds 2 and 3; flights.md 5.9)
  for (const [s, mph] of [[1, 2], [2, 4], [3, 6], [4, 9], [5, 11], [6, 13], [7, 15], [8, 17], [9, 20], [10, 22], [15, 33]]) ok(S.hudMphOf(s) === mph, `hudMphOf(${s}) = ${S.hudMphOf(s)}, the HUD showed ${mph}`);
  const K = F32(2.237);
  for (const d of [0.0521, 0.08, 0.1039]) ok(S.HUD_MPH.every((m, s) => Math.floor(F32(F32(s) * K) + d) === m), `the table is floor(2.237 s + ${d})`);
  ok(!S.HUD_MPH.every((m, s) => Math.floor(F32(F32(s) * K)) === m) && !S.HUD_MPH.every((m, s) => Math.floor(2.25 * s) === m), "the table is not floor(2.237 s) or floor(2.25 s)");
  ok(S.windSpeedFromHud(0) === 0 && S.windSpeedFromHud(1) === 1 && S.windSpeedFromHud(8) === 4 && S.windSpeedFromHud(18) === 8 && S.windSpeedFromHud(27) === 12 && S.windSpeedFromHud(40) === 15, "windSpeedFromHud off the table: the nearest s");
  const w17 = S.windFromHud(17, 90), w0 = S.windFromHud(0, 90);
  ok(w17 && Math.abs(w17.x - 8) < 1e-12 && Math.abs(w17.z) < 1e-12 && w0 === null, `windFromHud(17 mph toward 90) = ${JSON.stringify(w17)}: s 8 east; calm null`);
  // the canopy counter: a leaf sheet at y = 10, a ball through it at 9 m/s touching it on 4 consecutive ticks:
  // counted on the 1st and 3rd (the stored normal is the last tick's only), so the timer is set again on the 3rd
  // and the damping (the horizontal speed x (1 - 0.03 / 4) a tick) lasts from the first tick to 120 past the 3rd
  {
    const verts = new Float32Array([-50, 10, -50, 50, 10, -50, 50, 10, 50, -50, 10, 50, -500, -60, -500, 500, -60, -500, 500, -60, 500, -500, -60, 500]);
    const tris = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6]);
    const ground = S.meshGround({ verts, tris, attr: Uint8Array.from([S.ATTR.leaf, S.ATTR.leaf, S.ATTR.fairway, S.ATTR.fairway]) });
    const touch = [], hs = [];
    S.run({ club: "WD1", start: [0, 10.3, 0], v0: [0, -9, -20], hop0: 0, yRef: 0, ground, maxTicks: 260,
      onTick: (t) => { if (t.a8 === S.ATTR.leaf) touch.push(t.tick); hs.push([t.tick, Math.hypot(t.v[0], t.v[2])]); } });
    const damped = []; for (let i = 1; i < hs.length; i++) if (hs[i][1] / hs[i - 1][1] < 0.996) damped.push(hs[i][0]);
    const lastSet = touch.filter((t, i) => i % 2 === 0).at(-1);
    ok(touch.length === 4 && damped[0] === touch[0] && damped.at(-1) === lastSet + 120 && damped.length === lastSet + 121 - touch[0],
      `one leaf sheet touched on ticks ${touch.join(", ")}: damped ${damped[0]}..${damped.at(-1)}, the game's rule ${touch[0]}..${lastSet + 120}`);
  }
  log(`k. the wind at ${[...speeds].sort((a, b) => a - b).join(", ")} m/s: ${Wf.strokes.length} strokes, ${samples} airborne samples within ${(worst * 1000).toFixed(3)} mm of RAM; |W| = 0.98 s misses each by >= ${(weakest * 1000).toFixed(1)} mm; the HUD ${S.HUD_MPH.join(" ")} mph for s 0..15; the canopy counter on one sheet as the game's`);
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
  const DIGEST = "34243677f6591fef";
  ok(digest === DIGEST, `the synthetic runs' digest ${digest}, recorded ${DIGEST}`);
  log(`g. determinism: one replay twice the same bits; the ${synth.length} synthetic runs' digest ${digest}`);
}

log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nall ${passed} checks passed`);
process.exit(failed ? 1 : 0);
