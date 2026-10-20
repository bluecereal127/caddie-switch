// Build src/wsrShape.js: WSR's stop-vs-power SHAPE per club and landing
// surface, simulated with the port of WSR's ball physics (src/wsrsim.js, via
// tools/lib/wsrsim.mjs). The app scales it by each club's fitted `a`
// (src/model.js stopOf / carryOf), so the Switch's distances stay fittable
// and only the shape is WSR's.
//
//   node tools/build-wsr-shape.mjs [--out src/wsrShape.js]
//
// Per club (driver .. wedge), landing surface (fairway, rough, green, fringe,
// bunker) and spin (none; full = bs = the club's P1c x q, irons and wedge
// only), on q = 0.05 .. 1.00 in 0.05 steps (q = launch power = gauge bars / 4):
//   S(q) = stop(q, surface, spin) / stop(1, fairway, none)
//   C(q) = carry(q) / stop(1, fairway, none)
// so S(1, fairway, none) = 1 and a club's `a` (full-power fairway stop / 4)
// keeps its meaning. The modelling choices are the reference simulator's
// (tools/research/wsr-groundsim.py tables):
//  - flat ground, one plane per shot carrying the landing's attribute; the
//    ball is launched from that plane too, but only the contacts read the
//    attribute (the air phase never touches the ground), so carry does not
//    depend on the surface (checked below);
//  - a capped lie does not change the launch angle or the lift (true in WSR:
//    the cap multiplies the power, wsr-club-physics.md 4.2), so a 3-bar swing
//    from rough is q = 0.75 like a 3-bar swing from the fairway;
//  - no pin: the backspin pull-back's pin homing is h = 1 (WSR: up to 1.3 when
//    it points at the pin); the spins act from launch (spin_start 0), which
//    the ground phase never notices: the pull-back starts at frame 31 and the
//    landing factor reads only bs;
//  - no wind (the app keeps its fitted h for that);
//  - "full" spin is bs = P1c x q, the most a swing gives at that bar. WSR
//    gives the swing's spin at any power (s7c = 1 is bs = P1c whatever the
//    power, wsr-swing-redzone-spin.md 5.5), but on the Switch spin strength
//    scales with swing power (CLAUDE.md "Confirmed game mechanics", official),
//    which overrides WSR; scaling it linearly with the bar is the plainest
//    reading and an assumption (Switch-shaped) until a sweep measures it. At
//    q = 1 the column is WSR's own. From a bunker lie WSR uses the smaller P20
//    (0.2-0.7), which is not tabled.
// The 240 Hz ticks can make stop(q) ragged; where it dips as q rises the
// table takes the running maximum so the solver's bisection sees a monotone
// curve (the log and the generated header say how many entries and by how
// much). Deterministic: two runs write identical bytes (tools/test-solver.mjs
// checks it). Rerun after any change to src/wsrsim.js.
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run, CLUBS } from "./lib/wsrsim.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = { out: join(ROOT, "src/wsrShape.js") };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--out") opt.out = args[++i];
  else { console.error(`unknown argument ${a}\nusage: node tools/build-wsr-shape.mjs [--out src/wsrShape.js]`); process.exit(1); }
}
const OUT = resolve(opt.out);

const CLUB_IDS = ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge"];
const SURFACES = ["fairway", "rough", "green", "fringe", "bunker"];
const N = 20;
const QS = Array.from({ length: N }, (_, k) => (k + 1) / N);   // 0.05 .. 1
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exit(1); };

const table = {}, fixes = [];
let sims = 0;
for (const id of CLUB_IDS) {
  const c = CLUBS[id];
  const full = run({ club: id, q: 1, surface: "fairway" });
  sims++;
  // the backspin per column at launch power q: none, or full spin scaled with the bar
  const spins = c.spin > 0 ? { none: () => 0, full: (q) => c.spin * q } : { none: () => 0 };
  const carry = QS.map((q) => run({ club: id, q, surface: "fairway" }).carry);
  sims += N;
  for (let k = 1; k < N; k++) if (!(carry[k] > carry[k - 1])) fail(`${id} carry not increasing at q ${QS[k]}`);
  const S = {};
  for (const surface of SURFACES) {
    S[surface] = {};
    for (const [spin, bs] of Object.entries(spins)) {
      const stop = QS.map((q, k) => {
        const o = run({ club: id, q, surface, back: bs(q) });
        sims++;
        if (o.reason !== "rest") fail(`${id} q ${q} ${surface} ${spin}: ended by ${o.reason}`);
        if (o.carry !== carry[k]) fail(`${id} q ${q} ${surface} ${spin}: carry ${o.carry} differs from the fairway's ${carry[k]}`);
        return o.stop;
      });
      let top = -Infinity;
      stop.forEach((yd, k) => {
        if (yd < top) { fixes.push({ id, surface, spin, q: QS[k], dip: top - yd }); stop[k] = top; }
        else top = yd;
      });
      S[surface][spin] = stop.map((yd) => round(yd / full.stop, 5));
    }
  }
  if (S.fairway.none[N - 1] !== 1) fail(`${id}: S(1, fairway, none) = ${S.fairway.none[N - 1]}`);
  table[id] = { stopYd: round(full.stop, 3), carryYd: round(full.carry, 3), C: carry.map((yd) => round(yd / full.stop, 5)), S };
}

const fixNote = fixes.length
  ? `${fixes.length} entr${fixes.length === 1 ? "y" : "ies"} raised to the running maximum, by at most ${round(Math.max(...fixes.map((f) => f.dip)), 3)} yd (${fixes.map((f) => `${f.id} ${f.surface} ${f.spin} q ${f.q}: ${round(f.dip, 3)}`).join("; ")})`
  : "none needed raising to the running maximum";
const fmt = (arr) => `[${arr.join(", ")}]`;
const L = [];
L.push("// AUTO-GENERATED by tools/build-wsr-shape.mjs from src/wsrsim.js (the port of");
L.push("// tools/research/wsr-groundsim.py); do not edit, rerun the tool. WSR's stop and");
L.push("// carry against launch power per club, normalised by the club's full-power stop");
L.push("// on flat fairway (stopYd), on q = SHAPE_Q (gauge bars / 4):");
L.push("//   S[surface][spin][k] = stop(q_k, surface, spin) / stopYd");
L.push("//   C[k] = carry(q_k) / stopYd          (the carry does not depend on the surface)");
L.push("// spin: none, or full = bs = the club's P1c x q (irons and wedge; woods cannot");
L.push("// backspin). The full column's scaling with the bar is Switch-shaped (CLAUDE.md:");
L.push("// spin strength scales with swing power, where WSR gives P1c at any power), an");
L.push("// assumption until a sweep measures it; at q = 1 the column is WSR's own.");
L.push("// Flat ground, one plane per shot with the landing's attribute, launch angle");
L.push("// and lift unchanged by the lie cap (true in WSR), pin homing h = 1, no wind:");
L.push("// the tool's header has the reasons.");
{
  // the full-power numbers, a few clubs per line
  const items = CLUB_IDS.map((id) => `${id} ${table[id].stopYd.toFixed(1)} / ${table[id].carryYd.toFixed(1)}`);
  let line = "// Full-power fairway stop / carry in WSR, yd:";
  items.forEach((it, i) => {
    const next = `${line} ${it}${i < items.length - 1 ? "," : "."}`;
    if (next.length > 88) { L.push(line); line = `// ${it}${i < items.length - 1 ? "," : "."}`; } else line = next;
  });
  L.push(line);
}
L.push(`// Monotone in q: ${fixNote}.`);
L.push(`export const SHAPE_Q = ${fmt(QS)};`);
L.push(`export const SHAPE_SURFACES = [${SURFACES.map((x) => JSON.stringify(x)).join(", ")}];`);
L.push("export const WSR_SHAPE = {");
for (const id of CLUB_IDS) {
  const t = table[id];
  L.push(`  ${JSON.stringify(id)}: {`);
  L.push(`    stopYd: ${t.stopYd}, carryYd: ${t.carryYd},`);
  L.push(`    C: ${fmt(t.C)},`);
  L.push("    S: {");
  for (const surface of SURFACES) {
    L.push(`      ${surface}: {`);
    for (const [spin, arr] of Object.entries(t.S[surface])) L.push(`        ${spin}: ${fmt(arr)},`);
    L.push("      },");
  }
  L.push("    },");
  L.push("  },");
}
L.push("};");
writeFileSync(OUT, L.join("\n") + "\n");

console.log(`${sims} simulations, ${CLUB_IDS.length} clubs x ${SURFACES.length} surfaces x q ${QS[0]}..${QS[N - 1]} -> ${OUT}`);
for (const id of CLUB_IDS) {
  const t = table[id], at = (arr, q) => round(arr[QS.indexOf(q)] * t.stopYd, 1);
  console.log(`  ${id.padEnd(6)} full stop ${t.stopYd.toFixed(1)} carry ${t.carryYd.toFixed(1)}; fairway stop at 1/2/3 bars ${at(t.S.fairway.none, 0.25)} / ${at(t.S.fairway.none, 0.5)} / ${at(t.S.fairway.none, 0.75)}; full power on rough ${at(t.S.rough.none, 1)}, green ${at(t.S.green.none, 1)}${t.S.green.full ? ` (full spin ${at(t.S.green.full, 1)})` : ""}, fringe ${at(t.S.fringe.none, 1)}, bunker ${at(t.S.bunker.none, 1)}`);
}
console.log(`monotone: ${fixNote}`);
