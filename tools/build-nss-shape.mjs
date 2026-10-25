// Build src/nssShape.js: Nintendo Switch Sports' own ball (src/nsssim.js, the
// decoded and Eden-verified NSS 1.5.0 ball) tabled for the solver and the putt
// model, as tools/build-wsr-shape.mjs tabled WSR's:
//
//   node tools/build-nss-shape.mjs [--out src/nssShape.js]
//
// 1. Per club (driver .. wedge) and landing surface (fairway, rough, green,
//    fringe, bunker), the stop and carry of every whole launch percent pct =
//    1 .. 100 (the game's speed is GolfShotVelTable[club][pct], read at
//    (int)(100 * power), flights.md 4; q = pct / 100 = gauge bars / 4), on a
//    level plane of that surface, calm:
//      S[surface][k] = stop(q_k, surface) / stopYd
//      C[k] = carry(q_k) / stopYd          (the air never touches the ground,
//                                           so the carry is the surface's own:
//                                           checked)
//    stopYd = the full-power (pct 100) stop on level fairway, so S(1, fairway)
//    = 1 and a club's `a` (full-power fairway stop / 4) keeps its meaning.
//    The ball starts at rest on the plane (its centre 0.05 m up, P1's contact
//    radius), launched along the club's LoftDeg at the table's speed, as the
//    game launches it (flights.md 4). NSS's stop is NOT monotone in power:
//    where a landing's normal speed crosses FieldResistanceEnableSpeed (4 m/s,
//    with |v_in.y| < 4: the roll switch) the ball takes one bounce more or
//    fewer, and the stop jumps (the driver on fairway: 196.8 yd at pct 67,
//    186.7 at 68, where the second landing stops rolling straight away). The
//    table keeps those steps as the physics gives them (no running maximum:
//    they are the game's, not tick noise); src/model.js's power scan cuts the
//    curve into its rising pieces. The header counts the steps down.
// 2. The putter: the flat-green roll of every putter percent 1 .. 150 (the
//    putter's table runs to PowerOverMaxPT 1.5), from rest on a level green,
//    launched along its 1.14 degree loft (src/putt.js's gauge: PUTT_ROLL_YD).
// 3. The cup: how far off its centre a putt can pass and still drop, against
//    its speed there (src/putt.js CUP_WINDOW), measured with nsssim's
//    analytic NSS cup (cupMesh: the median of the 126 cups of the collision,
//    its rim 0.193 m round on the green, a bevel to the 0.15 m wall, 0.31 m
//    deep; AddGravityHole within 0.3 m; heightGround's route, which plays all
//    23 recorded putts as recorded, tools/test-nsssim.mjs f) on a level green:
//    for each speed v at the centre line (0 .. 6 m/s every 0.1), the ball sent
//    from 2 m short at the launch speed whose no-cup roll passes the centre at
//    v, then offset sideways d (0 .. 0.3 m, 1 mm apart): the window is the
//    holed share of those offsets, as a half-width (a band holed from the
//    centre line out to D reads D; past 2 m/s the cup's 20 walls leave holed
//    islands beyond a miss, which count for their width). A narrowing window
//    (speeds rising, widths falling) is taken as the running minimum; the
//    header says how many entries that lowered and by how much. At v = 0 the
//    ball dies on the centre line at the centre.
// Deterministic (tools/test-solver.mjs runs it twice and compares the bytes
// with the committed file). Rerun after any change to src/nsssim.js or
// tools/nss-physics.json.
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run, PHYSICS, heightGround, M_PER_YD } from "../src/nsssim.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = { out: join(ROOT, "src/nssShape.js") };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--out") opt.out = args[++i];
  else { console.error(`unknown argument ${a}\nusage: node tools/build-nss-shape.mjs [--out src/nssShape.js]`); process.exit(1); }
}
const OUT = resolve(opt.out);
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exit(1); };
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const DEG = Math.PI / 180;
const t0 = Date.now();

// the app's club ids in the game's club order, and the NSS names
const NSS_OF = {};
for (const [k, c] of Object.entries(PHYSICS.clubs)) NSS_OF[c.app] = k;
const CLUB_IDS = ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge"];
for (const id of [...CLUB_IDS, "putter"]) if (!NSS_OF[id]) fail(`tools/nss-physics.json has no club for ${id}`);
// landing surface -> the ball's attribute (src/nsssim.js ATTR)
const SURFACES = ["fairway", "rough", "green", "fringe", "bunker"];
const ATTR_OF = { fairway: 1, rough: 2, green: 6, fringe: 7, bunker: 3 };
const PCTS = Array.from({ length: 100 }, (_, k) => k + 1);
const plane = (attr) => ({ heightAt: () => 0, normalAt: () => [0, 1, 0], attrAt: () => attr });
// the launch along heading 0 (-z), pitched up by the club's loft, at the table's speed
const launch = (club, speed) => {
  const L = PHYSICS.clubs[club].loftDeg * DEG;
  return [0, speed * Math.sin(L), -speed * Math.cos(L)];
};
const START = [0, PHYSICS.ball.contactRadiusM, 0];
let sims = 0;

// ---- 1. the clubs ----
const table = {}, steps = [];
for (const id of CLUB_IDS) {
  const club = NSS_OF[id], speeds = PHYSICS.launchTable[club];
  const rows = {};
  let carry = null, apex = null;
  for (const surface of SURFACES) {
    const g = plane(ATTR_OF[surface]);
    const out = PCTS.map((pct) => {
      const o = run({ club, v0: launch(club, speeds[pct - 1]), lie: "fairway", start: START, heading: 0, ground: g });
      sims++;
      if (o.outcome !== "rest") fail(`${id} pct ${pct} on ${surface}: ended ${o.outcome}`);
      if (Math.abs(o.lateral) > 1e-6) fail(`${id} pct ${pct} on ${surface}: ${o.lateral} m off the line`);
      return o;
    });
    const c = out.map((o) => o.carryYd);
    if (!carry) { carry = c; apex = out.map((o) => o.apex / M_PER_YD); }
    else if (c.some((x, k) => x !== carry[k])) fail(`${id} on ${surface}: the carry differs from the fairway's`);
    rows[surface] = out.map((o) => o.stopYd);
    for (let k = 1; k < 100; k++) if (rows[surface][k] < rows[surface][k - 1]) steps.push({ id, surface, pct: PCTS[k], dip: rows[surface][k - 1] - rows[surface][k] });
  }
  for (let k = 1; k < 100; k++) if (!(carry[k] > carry[k - 1])) fail(`${id}: carry not increasing at pct ${PCTS[k]}`);
  const stopYd = rows.fairway[99];
  const S = {};
  for (const surface of SURFACES) S[surface] = rows[surface].map((yd) => round(yd / stopYd, 5));
  if (S.fairway[99] !== 1) fail(`${id}: S(1, fairway) = ${S.fairway[99]}`);
  const c = PHYSICS.clubs[club];
  table[id] = {
    club, stopYd: round(stopYd, 3), carryYd: round(carry[99], 3), apexYd: round(apex[99], 2), speedMs: speeds[99],
    loftDeg: c.loftDeg, carryMaxYd: c.carryMaxYard, roughRatio: c.roughRatio, bunkerRatio: c.bunkerRatio,
    C: carry.map((yd) => round(yd / stopYd, 5)), S,
  };
}

// ---- 2. the putter's flat roll ----
const PT = NSS_OF.putter, ptSpeeds = PHYSICS.launchTable[PT];
const green = plane(6);
const puttRoll = ptSpeeds.map((v, k) => {
  const o = run({ club: PT, v0: launch(PT, v), lie: "green", start: START, heading: 0, ground: green });
  sims++;
  if (o.outcome !== "rest") fail(`putter pct ${k + 1}: ended ${o.outcome}`);
  return round(o.stopYd, 4);
});
for (let k = 1; k < puttRoll.length; k++) if (!(puttRoll[k] > puttRoll[k - 1])) fail(`putter: the flat roll not increasing at pct ${k + 1}`);
const ruleRatio = puttRoll.slice(0, 100).map((yd, k) => yd / ((k + 1) * 0.2));

// ---- 3. the cup ----
const C = PHYSICS.cup;
const cup = { x: 0, y: -C.depthM, z: 0 };
const gCup = heightGround(green, { cup }), gNo = heightGround(green);
const L = 2;
const roll = (v0, x, ground) => run({ club: PT, v0: [0, 0, -v0], lie: "green", start: [x, START[1], L], heading: 0, ground, cup });
// the no-cup roll's speed where it passes the centre (z = 0), or null if it stops short
function speedAtCentre(v0) {
  let sp = null;
  const o = run({ club: PT, v0: [0, 0, -v0], lie: "green", start: [0, START[1], L], heading: 0, ground: gNo, cup,
    onTick: (s) => { if (sp == null && s.p[2] <= 0) sp = Math.sqrt(s.v[0] * s.v[0] + s.v[2] * s.v[2]); } });
  sims++;
  return { sp, restZ: o.rest[2] };
}
function v0For(vc) {
  let lo = 0, hi = 12;
  for (let i = 0; i < 44; i++) {
    const m = (lo + hi) / 2, r = speedAtCentre(m);
    if (vc === 0 ? r.restZ > 0 : r.sp == null || r.sp < vc) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}
const holes = (v0, d) => { sims++; return roll(v0, d, gCup).outcome === "holed"; };
const SPEEDS = Array.from({ length: 61 }, (_, k) => round(k * 0.1, 1));
const STEP = 0.001, DMAX = 0.3;
const measured = SPEEDS.map((vc) => {
  const v0 = v0For(vc);
  // the holed share of the offsets 0 .. DMAX (the first sample, on the centre line,
  // stands for half a step): a contiguous holed band [0, D] reads D; past 2 m/s the
  // 20 walls leave islands, which count for their width
  let w = 0, edge = 0;
  for (let k = 0; k * STEP <= DMAX + 1e-12; k++) if (holes(v0, k * STEP)) { w += k === 0 ? STEP / 2 : STEP; edge = k * STEP; }
  return { vc, v0, w, edge };
});
let lowered = 0, lowBy = 0, cur = Infinity;
const win = measured.map(({ vc, w }) => {
  if (w > cur) { lowered++; lowBy = Math.max(lowBy, w - cur); w = cur; } else cur = w;
  return [round(vc / M_PER_YD, 4), round(w / M_PER_YD, 4)];
});
// the window ends at the first speed that holes nothing; keep one zero row
const firstZero = win.findIndex(([, w]) => w === 0);
if (firstZero < 0) fail("the cup holes a putt at every speed up to 6 m/s");
const CUP = win.slice(0, firstZero + 1);

// ---- write ----
const fmt = (arr) => `[${arr.join(", ")}]`;
const stepNote = (() => {
  const by = {};
  for (const s of steps) (by[s.id] ??= []).push(s);
  return CLUB_IDS.map((id) => `${id} ${(by[id] ?? []).length} (largest ${round(Math.max(0, ...(by[id] ?? []).map((s) => s.dip)), 1)} yd)`).join(", ");
})();
const Lines = [];
const P = (s) => Lines.push(s);
P("// AUTO-GENERATED by tools/build-nss-shape.mjs from src/nsssim.js (Nintendo Switch");
P("// Sports' ball, decoded and replayed against Eden's RAM); do not edit, rerun the tool.");
P("// NSS_SHAPE: per club the stop and carry of each whole launch percent q = SHAPE_Q");
P("// (pct / 100 = gauge bars / 4; the game reads GolfShotVelTable at (int)(100 power)),");
P("// on a level plane of the landing surface, calm, normalised by the full-power stop on");
P("// level fairway (stopYd):  S[surface][k] = stop(q_k) / stopYd, C[k] = carry(q_k) / stopYd.");
P("// The stop is not monotone in q: where a landing crosses the roll switch (4 m/s) the");
P("// ball takes a bounce more and the stop steps down; kept as the physics gives it.");
P(`// Steps down per club over the 5 surfaces: ${stepNote}.`);
{
  const items = CLUB_IDS.map((id) => `${id} ${table[id].stopYd.toFixed(1)} / ${table[id].carryYd.toFixed(1)}`);
  let line = "// Full-power fairway stop / carry, yd:";
  items.forEach((it, i) => {
    const next = `${line} ${it}${i < items.length - 1 ? "," : "."}`;
    if (next.length > 88) { P(line); line = `// ${it}${i < items.length - 1 ? "," : "."}`; } else line = next;
  });
  P(line);
}
P("// PUTT_ROLL_YD[k]: the putter's flat-green roll at pct k + 1 (1 .. 150), yd; against");
P(`// the table's design rule (pct / 100 x 20 yd, flights.md 4) ${round(Math.min(...ruleRatio), 4)} .. ${round(Math.max(...ruleRatio), 4)} over pct 1 .. 100.`);
P("// CUP_WINDOW: [speed at the centre line yd/s, half-width yd]: a putt whose path passes");
P("// within the half-width of the cup's centre at that speed drops (the analytic NSS cup");
P(`// on a level green, the holed share of offsets 1 mm apart; running minimum: ${lowered} lowered,`);
P(`// by at most ${round(lowBy / M_PER_YD, 4)} yd). Nothing drops from ${CUP[CUP.length - 1][0]} yd/s.`);
P(`export const SHAPE_Q = ${fmt(PCTS.map((p) => p / 100))};`);
P(`export const SHAPE_SURFACES = [${SURFACES.map((x) => JSON.stringify(x)).join(", ")}];`);
P("export const NSS_SHAPE = {");
for (const id of CLUB_IDS) {
  const t = table[id];
  P(`  ${JSON.stringify(id)}: {`);
  P(`    club: ${JSON.stringify(t.club)}, stopYd: ${t.stopYd}, carryYd: ${t.carryYd}, apexYd: ${t.apexYd}, speedMs: ${t.speedMs},`);
  P(`    loftDeg: ${t.loftDeg}, carryMaxYd: ${t.carryMaxYd}, roughRatio: ${t.roughRatio}, bunkerRatio: ${t.bunkerRatio},`);
  P(`    C: ${fmt(t.C)},`);
  P("    S: {");
  for (const surface of SURFACES) P(`      ${surface}: ${fmt(t.S[surface])},`);
  P("    },");
  P("  },");
}
P("};");
P(`export const PUTT_ROLL_YD = ${fmt(puttRoll)};`);
P(`export const CUP_WINDOW = [${CUP.map(([v, w]) => `[${v}, ${w}]`).join(", ")}];`);
writeFileSync(OUT, Lines.join("\n") + "\n");

console.log(`${sims} simulations in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${OUT}`);
for (const id of CLUB_IDS) {
  const t = table[id], at = (arr, pct) => round(arr[pct - 1] * t.stopYd, 1);
  console.log(`  ${id.padEnd(6)} ${t.club} ${t.speedMs} m/s: full stop ${t.stopYd.toFixed(1)} carry ${t.carryYd.toFixed(1)} apex ${t.apexYd}; fairway stop at 1/2/3 bars ${at(t.S.fairway, 25)} / ${at(t.S.fairway, 50)} / ${at(t.S.fairway, 75)}; full power on rough ${at(t.S.rough, 100)}, green ${at(t.S.green, 100)}, fringe ${at(t.S.fringe, 100)}, bunker ${at(t.S.bunker, 100)}`);
}
console.log(`  steps down: ${stepNote}`);
console.log(`  putter: pct 25 / 50 / 100 / 150 roll ${puttRoll[24]} / ${puttRoll[49]} / ${puttRoll[99]} / ${puttRoll[149]} yd (rule ratio ${round(Math.min(...ruleRatio), 4)} .. ${round(Math.max(...ruleRatio), 4)})`);
console.log(`  cup: ${measured.filter((m, k) => k % 5 === 0).map((m) => `${m.vc} m/s ${(m.w * 100).toFixed(1)} cm (to ${(m.edge * 100).toFixed(1)})`).join(", ")}; running minimum lowered ${lowered} by at most ${(lowBy * 100).toFixed(2)} cm; nothing from ${(CUP[CUP.length - 1][0] * M_PER_YD).toFixed(1)} m/s`);
