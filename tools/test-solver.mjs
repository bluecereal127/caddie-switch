// node tools/test-solver.mjs [repoRoot]
// Acceptance for the stop-distance model: WSR's ball physics ported to
// src/wsrsim.js, its stop-vs-power shape in src/wsrShape.js
// (tools/build-wsr-shape.mjs) and the solver and club fit in src/model.js.
// Runs on the committed files alone (no rasters, no Python).
//  a. the port against tools/research/wsr-groundsim.py's numbers (its tables in
//     wsr-ground-phase.md sections 4-8 and wsr-swing-redzone-spin.md 4.4 / 5.7):
//     full-power stops and carries per club on fairway (P08 / P0c), rough, green
//     and bunker, the driver's stop at 1/8 .. 8/8 power, the backspin table,
//     the 3-degree slopes, the putter, the red curve and wsr-flightsim.py's wind
//  b. the shape: monotone in q, S(1, fairway, none) = 1, the driver's 1/2/3-bar
//     stops, the 9-iron's full-spin green stop short of its carry; the full
//     spin column (bs = P1c x q) WSR's own at q = 1 and below it between the
//     no-spin stop and WSR's constant spin (bs = P1c); and the generator
//     writing the committed file byte for byte, twice
//  c. solve inverts stopOf: p = 1.0 .. 4.0 back within 0.01 bar for every club,
//     the driver at 250 yd at 4.00
//  d. the landing surface moves the power the right way (green < fairway <
//     rough < bunker for the driver); rollSpin only for the clubs that spin.
//     The power scan: a distance inside the jump at a surface edge gets no rec
//     (the 9-iron onto a green edge, the 7-iron's rough strip, the driver into
//     a green short of a rough sliver); one beyond a bunker is found on the
//     rough past it; a solution whose carry lands on a strip narrower than a
//     scan step is not shipped on the surface around it. Real holes on the
//     App's default line over the committed terrain: H4 from rough at 210 /
//     211 yd (the driver's carry onto the fringe), H11 / H13 from rough at
//     199 yd (the driver on rough). Synthetic holes of random surface strips,
//     1,000 distances over ten with strips 2-25 yd wide and 300 over three with
//     strips down to 0.2 yd: every rec stops within 0.01 yd of the distance on
//     the surface read at its own carry, and only for a club whose 0.001-bar
//     trace reaches the distance; on the wide-strip holes every club whose
//     trace reaches it gets a rec with the best score of the trace's
//     solutions, and maxReach is the traces' top. The time of one solve with
//     7 clubs (under 10 ms)
//  e. caps: rough 3 bars, bunker per BUNKER_CAPS; `red` from cap - 0.1 up only
//     (probed 0.001 bar either side of the threshold)
//  f. fitClub recovers a and h from rows made by stopOf at 2-4 bars and
//     -10..10 mph tailwind, with and without `landed`; a green row fits the
//     fairway rows' a once it says where it finished
//  g. simPutt / solvePutt moved out of App.jsx unchanged: a fixed grid of putts
//     gives the outputs recorded from App.jsx before the move
//  h. App.jsx and src/model.js parse with @babel/parser (skipped without it)
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const { run, CLUBS } = await imp("tools/lib/wsrsim.mjs");
const { WSR_SHAPE, SHAPE_Q, SHAPE_SURFACES } = await imp("src/wsrShape.js");
const M = await imp("src/model.js");
const { DEFAULT_CLUBS, BUNKER_CAPS, capFor, landingSurface, stopOf, carryOf, landedStop, solve, fitClub, simPutt, solvePutt } = M;
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL:", msg); } };
const near = (got, want, tol, what) => ok(Math.abs(got - want) <= tol, `${what}: ${got.toFixed(3)}, expected ${want} ± ${tol}`);
const IDS = ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge"];
// which clubs backspin, stated apart from the code under test: the irons and
// the wedge; the driver and spoon never (CLAUDE.md), WSR's P1c = 0 for the woods
const SPINS = new Set(["3iron", "5iron", "7iron", "9iron", "wedge"]);
const byId = Object.fromEntries(DEFAULT_CLUBS.map((c) => [c.id, c]));
const full = (club, surface = "fairway", extra = {}) => run({ club, q: 1, surface, ...extra });

// ---- a. the port ----
// wsr-ground-phase.md section 8: full power on flat ground (stop; carry)
const ROWS = {
  fairway: [278.8, 252.6, 211.7, 175.6, 145.8, 109.5, 60.0],
  rough:   [269.2, 243.8, 204.4, 169.6, 140.1, 105.2, 57.5],
  green:   [309.3, 281.1, 214.9, 176.6, 147.7, 109.3, 72.3],   // irons: A = 0.48 on the first contact
  bunker:  [243.1, 221.4, 189.8, 159.9, 130.1, 99.8, 55.2],    // irons and wedge: no roll (+0.0)
};
const CARRY = [240.2, 219.8, 189.8, 159.9, 130.1, 99.8, 55.2];
IDS.forEach((id, k) => {
  const f = full(id);
  near(f.stop, ROWS.fairway[k], 0.05, `${id} full-power fairway stop`);
  // within 0.5 yd of P08 (wsr-ground-phase.md: the 9-iron's 109.503, the others within 0.4)
  near(f.stop, CLUBS[id].p08, 0.5, `${id} full-power fairway stop against the club block's P08`);
  near(f.carry, CARRY[k], 0.05, `${id} full-power carry`);
  near(f.carry, CLUBS[id].p0c, 0.3, `${id} full-power carry against P0c`);
  for (const s of ["rough", "green", "bunker"]) near(full(id, s).stop, ROWS[s][k], 0.3, `${id} full power landing on ${s}`);
});
// the driver at 1/8 .. 8/8 power: the simulator's values, and the rounded
// list in wsr-ground-phase.md section 8 (whose 3/8 and 5/8 entries read 149
// and 208 until 2026-10-20; the simulator gives 147.34 and 207.13)
const DRQ = [68.53, 111.59, 147.34, 178.8, 207.13, 233.0, 256.79, 278.8];
const DRQ_DOC = [69, 112, 147, 179, 207, 233, 257, 279];
DRQ.forEach((want, k) => {
  const stop = run({ club: "driver", q: (k + 1) / 8, surface: "fairway" }).stop;
  near(stop, want, 0.05, `driver stop at ${k + 1}/8 power`);
  near(stop, DRQ_DOC[k], 0.6, `driver stop at ${k + 1}/8 power against the doc`);
});
// wsr-swing-redzone-spin.md 5.7: stop by s7c 0 / 1, i.e. bs = 0 / the club's P1c
const SPIN = {
  green:   { none: [214.9, 176.6, 147.7, 109.3, 72.3], full: [202.9, 163.4, 130.8, 89.7, 52.4] },
  fairway: { none: [211.7, 175.6, 145.8, 109.5, 60.0], full: [204.8, 167.4, 135.8, 101.2, 53.8] },
};
for (const [s, rows] of Object.entries(SPIN)) IDS.slice(2).forEach((id, k) => {
  near(full(id, s).stop, rows.none[k], 0.3, `${id} on ${s}, no spin`);
  near(full(id, s, { back: CLUBS[id].spin }).stop, rows.full[k], 0.3, `${id} on ${s}, full spin (bs ${CLUBS[id].spin})`);
});
// 3 degrees down / up along the shot
for (const [id, down, up] of [["driver", 290.9, 266.7], ["9iron", 115.0, 104.5], ["wedge", 63.5, 57.2]]) {
  near(full(id, "fairway", { slopeDeg: -3 }).stop, down, 0.3, `${id} 3 deg downhill`);
  near(full(id, "fairway", { slopeDeg: 3 }).stop, up, 0.3, `${id} 3 deg uphill`);
}
// the putter (section 6: power 1.0 rolls 20.5 yd on a flat green, P0c = P08 = 20)
near(run({ club: "putter", q: 1, surface: "green" }).stop, 20.46, 0.05, "putter at power 1.0 on a flat green");
// the red curve (wsr-swing-redzone-spin.md 4.4): side spin = P18 (full red),
// attached when the follow-through window closes (tick 72); drift at carry
const lateralAtCarry = (o) => {
  for (let i = 1; i < o.path.length; i++) if (o.path[i][0] >= o.carry) {
    const a = o.path[i - 1], b = o.path[i], f = (o.carry - a[0]) / (b[0] - a[0]);
    return a[2] + f * (b[2] - a[2]);
  }
  return o.lateral;
};
for (const [id, want] of [["driver", 35.3], ["3iron", 34.3], ["7iron", 21.9], ["wedge", 8.1]]) {
  const o = full(id, "fairway", { side: CLUBS[id].curve, spinStart: 72 });
  near(-lateralAtCarry(o), want, 0.2, `${id} full-red curve at carry (positive side = left)`);
}
// wsr-flightsim.py's wind (30 mph = index 15, the driver at full power): tail
// carry 262.1, head 220.2, cross drift 30.6 at carry. The port measures the
// ramp's height from the ground under the player, where flightsim starts the
// ball's centre (0.5 u lower), hence the looser drift tolerance.
near(full("driver", "fairway", { wind: { mph: 30, deg: 0 } }).carry, 262.1, 0.1, "driver carry, 30 mph tailwind");
near(full("driver", "fairway", { wind: { mph: 30, deg: 180 } }).carry, 220.2, 0.1, "driver carry, 30 mph headwind");
near(lateralAtCarry(full("driver", "fairway", { wind: { mph: 30, deg: 90 } })), 30.6, 0.3, "driver drift at carry, 30 mph crosswind (to the right)");
const w0 = full("driver", "fairway", { wind: { mph: 30, deg: 0 } });
console.log(`port: full-power fairway stops ${IDS.map((id) => full(id).stop.toFixed(1)).join(" / ")} yd; driver at 1/8..8/8 ${DRQ.map((_, k) => run({ club: "driver", q: (k + 1) / 8 }).stop.toFixed(1)).join(" / ")}; 30 mph tailwind carry ${w0.carry.toFixed(1)}, rolling ${w0.roll.toFixed(1)} (no wind on the ground)`);

// ---- b. the shape ----
let entries = 0;
for (const id of IDS) {
  const t = WSR_SHAPE[id];
  ok(t && t.C.length === SHAPE_Q.length, `${id}: no shape table`);
  ok(t.S.fairway.none[SHAPE_Q.length - 1] === 1, `${id}: S(1, fairway, none) = ${t.S.fairway.none.at(-1)}, not 1`);
  ok(stopOf({ ...byId[id] }, 4) === 4 * byId[id].a, `${id}: the 4-bar fairway stop is not exactly 4a`);
  ok(t.C.every((v, k) => k === 0 || v > t.C[k - 1]), `${id}: carry not increasing in q`);
  for (const s of SHAPE_SURFACES) for (const [spin, row] of Object.entries(t.S[s])) {
    entries += row.length;
    ok(row.every((v, k) => k === 0 || v >= row[k - 1]), `${id} ${s} ${spin}: stop not monotone in q`);
    ok(row.length === SHAPE_Q.length, `${id} ${s} ${spin}: ${row.length} entries`);
  }
  ok(!!t.S.fairway.full === SPINS.has(id), `${id}: a full-spin column exactly when the club can backspin`);
  ok((CLUBS[id].spin > 0) === SPINS.has(id), `${id}: CLUBS.spin ${CLUBS[id].spin} disagrees with which clubs can backspin`);
  ok(!!byId[id].spin === SPINS.has(id), `${id}: DEFAULT_CLUBS.spin ${byId[id].spin} disagrees with which clubs can backspin`);
}
const dS = WSR_SHAPE.driver, qi = (q) => SHAPE_Q.indexOf(q);
near(dS.S.fairway.none[qi(0.25)] * 278.8, 112, 1, "driver S(0.25) x 278.8");
near(dS.S.fairway.none[qi(0.5)] * 278.8, 179, 1, "driver S(0.5) x 278.8");
near(dS.S.fairway.none[qi(0.75)] * 278.8, 233, 1, "driver S(0.75) x 278.8");
const nine = WSR_SHAPE["9iron"];
ok(nine.S.green.full[qi(1)] < nine.C[qi(1)], `9-iron full spin onto a green stops short of its carry (S ${nine.S.green.full[qi(1)]} vs C ${nine.C[qi(1)]})`);
// The full-spin column scales the spin with the bar (bs = P1c x q; the
// Switch's spin strength scales with swing power, where WSR gives P1c at any
// power): at q = 1 it is WSR's own, below it the stop lies between the no-spin
// one and WSR's constant spin. Between bs 0.9 and 1 only the landing factor
// changes (the pull-back caps bs at 0.9), and the wedge's livelier landing
// then ends up to 0.04 yd short of the constant-spin stop, hence the 0.05.
let between = 0;
for (const id of IDS.filter((id) => SPINS.has(id))) {
  const t = WSR_SHAPE[id];
  for (const s of SHAPE_SURFACES) SHAPE_Q.forEach((q, k) => {
    const yd = (col) => t.S[s][col][k] * t.stopYd;
    const constant = run({ club: id, q, surface: s, back: CLUBS[id].spin }).stop;
    if (q === 1) near(yd("full"), constant, 0.002, `${id} on ${s}: the full-spin column at q = 1 is not WSR's own`);
    else {
      between++;
      ok(yd("full") <= yd("none") + 0.002 && yd("full") >= constant - 0.05, `${id} on ${s} at q ${q}: full spin ${yd("full").toFixed(2)} not between WSR's constant spin ${constant.toFixed(2)} and none ${yd("none").toFixed(2)}`);
    }
  });
}
{
  // the 9-iron onto a green: at 0.4 bars WSR's constant spin brought it back
  // behind the player (-1.1 yd); with the spin scaled to the bar it stops 11.4
  const k = (q) => qi(q), yd = (col, q) => nine.S.green[col][k(q)] * nine.stopYd;
  const c01 = run({ club: "9iron", q: 0.1, surface: "green", back: CLUBS["9iron"].spin }).stop;
  near(c01, -1.1, 0.1, "9-iron onto a green at 0.4 bars with WSR's constant spin");
  near(yd("full", 0.1), 11.4, 0.1, "9-iron onto a green at 0.4 bars, full spin scaled to the bar");
  near(yd("full", 0.4), 43.1, 0.1, "9-iron onto a green at 1.6 bars, full spin scaled to the bar");
  near(yd("full", 0.75), 73.5, 0.1, "9-iron onto a green at 3 bars, full spin scaled to the bar");
  console.log(`spin: ${between} full-spin entries below q = 1 between none and WSR's constant spin; 9-iron onto a green at 0.4 / 1.6 / 3 / 4 bars stops ${[0.1, 0.4, 0.75, 1].map((q) => yd("full", q).toFixed(1)).join(" / ")} (constant spin ${c01.toFixed(1)} / ${[0.4, 0.75, 1].map((q) => run({ club: "9iron", q, surface: "green", back: CLUBS["9iron"].spin }).stop.toFixed(1)).join(" / ")}, none ${[0.1, 0.4, 0.75, 1].map((q) => yd("none", q).toFixed(1)).join(" / ")})`);
}
{
  const committed = readFileSync(join(root, "src/wsrShape.js"), "utf8").replace(/\r\n/g, "\n");
  const dir = mkdtempSync(join(tmpdir(), "wsrshape-"));
  try {
    const outs = [0, 1].map((k) => {
      const out = join(dir, `shape${k}.js`);
      execFileSync(process.execPath, [join(root, "tools/build-wsr-shape.mjs"), "--out", out], { cwd: root, stdio: "pipe" });
      return readFileSync(out, "utf8");
    });
    ok(outs[0] === outs[1], "tools/build-wsr-shape.mjs: two runs differ");
    ok(outs[0] === committed, "tools/build-wsr-shape.mjs does not reproduce the committed src/wsrShape.js");
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(`shape: ${IDS.length} clubs, ${entries} stop entries, all monotone; driver 1/2/3/4 bars ${[0.25, 0.5, 0.75, 1].map((q) => (dS.S.fairway.none[qi(q)] * dS.stopYd).toFixed(1)).join(" / ")} yd in WSR; generator deterministic`);

// ---- c. the round trip ----
const ask = (clubs, dist, lie = "fairway", ctx = {}, wind = {}) =>
  solve(clubs, { dist, windSpeed: wind.speed ?? 0, relWindDeg: wind.deg ?? 0, lie, hole: 0, stroke: 1 }, [], ctx);
let worstTrip = 0;
for (const cl of DEFAULT_CLUBS) for (let p = 1; p <= 4; p += 0.25) {
  const { recs } = ask([cl], stopOf(cl, p));
  ok(recs.length === 1, `${cl.id} at ${p} bars: no rec`);
  if (recs[0]) { worstTrip = Math.max(worstTrip, Math.abs(recs[0].power - p)); near(recs[0].power, p, 0.01, `${cl.id} round trip at ${p} bars`); }
}
{
  const r = ask([byId.driver], 250).recs[0];
  ok(r && Math.abs(r.power - 4) < 1e-9, `driver at 250 yd: ${r?.power}, expected 4.00`);
  ok(r && Math.abs(r.carry + r.roll - 250) < 1e-9, "driver at 250 yd: carry + roll is not the distance");
}
console.log(`round trip: 7 clubs x 13 powers, worst ${worstTrip.toExponential(2)} bar`);

// ---- d. surfaces ----
{
  const dr = byId.driver, at = (s) => ask([dr], 200, "fairway", { surfaceAt: () => s }).recs[0];
  const [g, f, r, b] = ["green", "fairway", "rough", "bunker"].map(at);
  ok(g && f && r && b, "driver at 200 yd: a surface left no rec");
  if (g && f && r && b) {
    ok(g.power < f.power && f.power < r.power && r.power < b.power, `driver at 200 yd: powers green ${g.power.toFixed(3)} / fairway ${f.power.toFixed(3)} / rough ${r.power.toFixed(3)} / bunker ${b.power.toFixed(3)} not in that order`);
    ok([g, f, r, b].every((x, k) => x.surface === ["green", "fairway", "rough", "bunker"][k]), "rec.surface is not the surface read");
    console.log(`surfaces: the driver to 200 yd needs ${[g, f, r, b].map((x) => `${x.power.toFixed(2)} bars on ${x.surface} (carry ${x.carry.toFixed(0)}, roll ${x.roll.toFixed(0)})`).join(", ")}`);
  }
  // water, OB, walls, null and no callback all roll as fairway
  for (const s of ["water", "outer", "wall", null, undefined]) {
    const x = ask([dr], 200, "fairway", { surfaceAt: () => s }).recs[0];
    ok(x && x.surface === "fairway" && Math.abs(x.power - f.power) < 1e-12, `a landing read of ${s} does not solve as fairway`);
  }
  ok(Math.abs(ask([dr], 200).recs[0].power - f.power) < 1e-12, "no surfaceAt does not solve as fairway");
  for (const cl of DEFAULT_CLUBS) {
    const x = ask([cl], stopOf(cl, 3), "fairway", { surfaceAt: () => "green" }).recs[0];
    ok(x && (x.rollSpin != null) === SPINS.has(cl.id), `${cl.id}: rollSpin ${x?.rollSpin} for a club that ${SPINS.has(cl.id) ? "spins" : "cannot spin"}`);
    if (x && x.rollSpin != null) ok(x.rollSpin < x.roll, `${cl.id}: full spin does not shorten the roll`);
  }
  // The power scan cuts each club's f(p) = stop on the surface p's own carry
  // lands on into runs of one surface; a distance inside the jump at an edge
  // has no solution. The 9-iron to its 3.6-bar fairway stop with green from
  // 0.5 yd short of that carry: the fairway run ends short of the distance and
  // the green run starts past it, so no rec
  {
    const c9 = byId["9iron"], edge = carryOf(c9, 3.6), d9 = stopOf(c9, 3.6);
    const x = ask([c9], d9, "fairway", { surfaceAt: (yd) => (yd >= edge - 0.5 ? "green" : "fairway") }).recs[0];
    ok(!x, `a distance inside the jump onto a green got a rec (${x?.power.toFixed(3)} bars on ${x?.surface})`);
  }
  // the 7-iron to its 3.9-bar fairway stop with rough under that carry: the
  // fairway run ends short, the rough strip stops 5 yd short and the fairway
  // beyond it starts past the distance, so no rec. The driver over a bunker
  // onto rough: the bunker run stops short and the rough run past it reaches
  // the distance at 3.57 bars, landing on rough, so it is found
  {
    const c7 = byId["7iron"], d7 = stopOf(c7, 3.9), lo = carryOf(c7, 3.9) - 1, hi = (carryOf(c7, 3.9) + carryOf(c7, 4)) / 2;
    const strip = ask([c7], d7, "fairway", { surfaceAt: (yd) => (yd >= lo && yd < hi ? "rough" : "fairway") }).recs[0];
    ok(!strip, `the 7-iron's rough strip: a rec inside the jump (${strip?.power.toFixed(2)} bars on ${strip?.surface})`);
    const dr = byId.driver, pr = 3.57, dR = stopOf(dr, pr, "rough"), cf = carryOf(dr, ask([dr], dR).recs[0].power);
    ok(stopOf(dr, 4, "bunker") < dR, "the driver-over-a-bunker case: the bunker run should stop short of the distance");
    const past = ask([dr], dR, "tee", { surfaceAt: (yd) => (yd <= cf + 0.5 ? "bunker" : "rough") }).recs[0];
    ok(past && past.surface === "rough" && Math.abs(past.power - pr) < 0.01, `the driver over a bunker onto rough: ${past ? `${past.power.toFixed(3)} bars on ${past.surface}` : "no rec"}, expected ${pr} on rough`);
  }
  // a green strip 0.3 yd wide, narrower than one 0.02-bar step of the
  // driver's carry (1.1 yd), between two fairway samples and under the carry
  // of the fairway solution (2.51 bars, off the scan's grid): that solution
  // lands on the green, where it would roll long, so it must not ship as a
  // fairway rec; cut around it, no run reaches the distance: no rec
  {
    const dr = byId.driver, c0 = carryOf(dr, 2.51), d0 = stopOf(dr, 2.51);
    const hidden = (yd) => (Math.abs(yd - c0) <= 0.15 ? "green" : "fairway");
    ok(hidden(carryOf(dr, 2.5)) === "fairway" && hidden(carryOf(dr, 2.52)) === "fairway", "the hidden-strip case: the scan's samples either side should read fairway");
    const x = ask([dr], d0, "tee", { surfaceAt: hidden }).recs[0];
    ok(!x, `a fairway solution whose carry lands on a hidden green strip shipped (${x?.power.toFixed(3)} bars on ${x?.surface}, carry reads ${x ? hidden(x.carry) : ""})`);
  }
  // the driver from rough to 1 yd under its cap's rough stop, with bunker,
  // green and rough under rising carries: the rough run up to the cap holds
  // the solution. With green up to 0.1 yd short of the cap's carry, the rough
  // sliver there starts past the distance and the green run before it too: a
  // true jump, no rec
  {
    const dr = byId.driver, d = stopOf(dr, 3, "rough") - 1;
    const cF = carryOf(dr, ask([dr], d, "rough").recs[0].power), cG = carryOf(dr, ask([dr], d, "rough", { surfaceAt: () => "green" }).recs[0].power), cCap = carryOf(dr, 3);
    const bands = (yd) => (yd < (cG + cF) / 2 ? "bunker" : yd < (cF + cCap) / 2 ? "green" : "rough");
    const r = ask([dr], d, "rough", { surfaceAt: bands }).recs[0];
    ok(r && r.surface === "rough" && Math.abs(stopOf(dr, r.power, "rough") - d) < 0.01 && bands(r.carry) === "rough", `the driver from rough at 1 yd under its reach: ${r ? `${r.power.toFixed(3)} bars on ${r.surface}` : "no rec"}, expected the rough run's`);
    const gap = ask([dr], d, "rough", { surfaceAt: (yd) => (yd >= cCap - 0.1 ? "rough" : yd < (cG + cF) / 2 ? "bunker" : "green") }).recs[0];
    ok(!gap, `the green-then-rough-sliver jump got a rec (${gap?.power.toFixed(3)} bars on ${gap?.surface})`);
  }
}

// ---- d, real holes: the App's default line (the derived tee to the
// pipeline pin seen most, as src/derivedMerge.js picks curPin) over the
// committed terrain, read through src/terrain.js, no wind ----
const { parseTerrain, classAt, lieOf } = await imp("src/terrain.js");
const DERIVED = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes;
const MAP_W = 250, MAP_H = 304;
const lineOf = (n) => {
  const d = DERIVED[n], t = parseTerrain(readFileSync(join(root, `public/terrain/h${String(n).padStart(2, "0")}.bin`)));
  const pin = d.pins.reduce((b, p) => ((p.seen ?? 0) > (b ? b.seen ?? 0 : -1) ? p : b), null) ?? d.pins[0];
  const ball = d.tee, scale = d.scale, dx = (pin.x - ball.x) * MAP_W, dy = (pin.y - ball.y) * MAP_H;
  const th = ((((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) * Math.PI) / 180;
  return (yd) => lieOf(classAt(t, ball.x + (Math.sin(th) * yd) / scale / MAP_W, ball.y - (Math.cos(th) * yd) / scale / MAP_H));
};
{
  const onHole = (n, lie, d) => { const surfaceAt = lineOf(n); return { surfaceAt, o: ask(DEFAULT_CLUBS, d, lie, { surfaceAt }) }; };
  const list = (o) => o.recs.map((r) => `${r.club.name} ${r.power.toFixed(3)} on ${r.surface}`).join("; ") || "no rec";
  // H4 from rough at 210 / 211 yd: the driver's carry lands on the fringe at
  // 2.82-2.85 bars, a crossing the two-pass read never looked at
  for (const d of [210, 211]) {
    const { surfaceAt, o } = onHole(4, "rough", d);
    const fr = o.recs.find((r) => r.surface === "fringe");
    ok(fr && fr.club.id === "driver" && Math.abs(landedStop(fr.club, fr.power, 0, surfaceAt) - d) <= 0.01 && landingSurface(surfaceAt(fr.carry)) === "fringe", `H4 from rough at ${d} yd: ${list(o)}, expected the driver on the fringe`);
  }
  // H11 and H13 from rough at 199 yd: the driver on rough (the review's
  // cases, where the old chain ended on a surface that could not reach)
  for (const n of [11, 13]) {
    const { surfaceAt, o } = onHole(n, "rough", 199);
    const dr = o.recs.find((r) => r.club.id === "driver");
    ok(dr && dr.surface === "rough" && landingSurface(surfaceAt(dr.carry)) === "rough" && Math.abs(landedStop(dr.club, dr.power, 0, surfaceAt) - 199) <= 0.01, `H${n} from rough at 199 yd: ${list(o)}, expected the driver on rough`);
  }
  const h4 = onHole(4, "rough", 210).o.recs.find((r) => r.surface === "fringe"), h11 = onHole(11, "rough", 199).o.recs.find((r) => r.club.id === "driver");
  console.log(`holes: H4 from rough at 210 yd ${h4 ? `driver ${h4.power.toFixed(3)} bars, carry ${h4.carry.toFixed(1)} onto the fringe` : "no rec"}; H11 from rough at 199 yd ${h11 ? `driver ${h11.power.toFixed(3)} bars, carry ${h11.carry.toFixed(1)} on ${h11.surface}` : "no rec"}`);
}

// ---- d, synthetic holes: random strips of every surface (and water / OB /
// no read, which roll as fairway) along the line, 1,000 random distances from
// random lies over ten holes whose strips are 2-25 yd wide (wider than a
// 0.02-bar step of any club's carry, 0.3-1.2 yd) and 300 more over three
// holes with strips down to 0.2 yd, which a step can jump. Each club's f is
// traced apart from the solver on a 0.001-bar grid, in runs of one surface.
// Every rec, on every hole: within 0.01 yd of the distance, on the surface
// read at its own carry, on a club whose trace reaches the distance. On the
// wide-strip holes also: every club whose trace reaches the distance (by
// 0.1 yd inside a run; the solver cuts its runs within 0.001 bar of an edge,
// up to 0.05 yd of the driver's stop) gets a rec, and that rec's score is the
// best of the trace's solutions (the scan misses none); maxReach is the
// traces' top. ----
{
  let seed = 4242;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // Park-Miller: exact in doubles
  const KINDS = ["fairway", "rough", "green", "fringe", "bunker", "water", "outer", null];
  const LIES = ["tee", "rough", "bunker"];
  const scoreOf = (p, cap) => Math.abs(p / cap - 0.8) + (p / cap > 0.97 ? 0.5 : 0);
  const tally = { wide: { recs: 0, found: 0, empty: 0 }, narrow: { recs: 0, found: 0, missed: 0, empty: 0 } };
  let worst = 0, ms = 0, calls = 0;
  const hole = (minW, nDist, kind) => {
    const strips = [];
    for (let yd = 0; yd < 360; ) {
      const w = minW < 1 && rnd() < 0.4 ? minW + (1 - minW) * rnd() : 2 + 23 * rnd();
      strips.push({ from: yd, to: yd + w, s: KINDS[Math.floor(rnd() * KINDS.length)] }); yd += w;
    }
    const surfaceAt = (yd) => (strips.find((x) => yd >= x.from && yd < x.to) ?? { s: null }).s;
    // per lie and club, the trace's runs: { pa, pb, fa, fb, pts } with f rising from fa to fb
    const trace = {};
    for (const lie of LIES) {
      trace[lie] = {};
      for (const cl of DEFAULT_CLUBS) {
        const cap = capFor(cl, lie), runs = [];
        for (let k = 0; ; k++) {
          const p = Math.min(cap, 0.4 + k * 0.001), s = landingSurface(surfaceAt(carryOf(cl, p))), f = landedStop(cl, p, 0, surfaceAt);
          const last = runs[runs.length - 1];
          if (last && last.s === s) { last.pb = p; last.fb = f; last.pts.push([p, f]); } else runs.push({ s, pa: p, pb: p, fa: f, fb: f, pts: [[p, f]] });
          if (p >= cap) break;
        }
        trace[lie][cl.id] = { cap, runs };
      }
    }
    const reaching = (t, d, margin) => t.runs.filter((r) => r.fa + margin <= d && d <= r.fb - margin);
    // a trace run's power for d, linear between its samples
    const powerIn = (r, d) => {
      const i = r.pts.findIndex(([, f]) => f >= d);
      if (i <= 0) return r.pts[Math.max(0, i)][0];
      const [p0, f0] = r.pts[i - 1], [p1, f1] = r.pts[i];
      return f1 > f0 ? p0 + ((d - f0) / (f1 - f0)) * (p1 - p0) : p1;
    };
    const T = tally[kind];
    for (let k = 0; k < nDist; k++) {
      const lie = LIES[Math.floor(rnd() * LIES.length)], d = 15 + 285 * rnd();
      const t0 = performance.now();
      const o = ask(DEFAULT_CLUBS, d, lie, { surfaceAt });
      ms += performance.now() - t0; calls++;
      if (!o.recs.length) T.empty++;
      for (const r of o.recs) {
        T.recs++;
        const err = Math.abs(landedStop(r.club, r.power, 0, surfaceAt) - d);
        worst = Math.max(worst, err);
        ok(err <= 0.01, `strips (${kind}): ${r.club.id} from ${lie} at ${d.toFixed(2)} yd stops ${err.toFixed(4)} yd off`);
        ok(landingSurface(surfaceAt(r.carry)) === r.surface && landingSurface(r.landsOn) === r.surface, `strips (${kind}): ${r.club.id} from ${lie} at ${d.toFixed(2)} yd solved on ${r.surface}, its carry reads ${surfaceAt(r.carry)}`);
        ok(reaching(trace[lie][r.club.id], d, -0.05).length > 0, `strips (${kind}): ${r.club.id} from ${lie} at ${d.toFixed(2)} yd has a rec where its curve never reaches the distance`);
      }
      for (const cl of DEFAULT_CLUBS) {
        const t = trace[lie][cl.id], sols = reaching(t, d, 0.1);
        if (!sols.length) continue;
        const best = Math.min(...sols.map((r) => scoreOf(powerIn(r, d), t.cap)));
        const one = ask([cl], d, lie, { surfaceAt }).recs[0];
        if (kind === "wide") {
          ok(one && Math.abs(landedStop(cl, one.power, 0, surfaceAt) - d) <= 0.01, `strips (wide): ${cl.id} from ${lie} at ${d.toFixed(2)} yd reaches the distance on its curve but gets no rec`);
          ok(one && one.score <= best + 0.005, `strips (wide): ${cl.id} from ${lie} at ${d.toFixed(2)} yd: rec score ${one?.score.toFixed(4)}, the trace has a solution scoring ${best.toFixed(4)}`);
        }
        if (one && one.score <= best + 0.005) T.found++; else if (kind === "narrow") T.missed++;
      }
    }
    if (kind === "wide") for (const lie of LIES) {
      const top = Math.max(...DEFAULT_CLUBS.flatMap((cl) => trace[lie][cl.id].runs.map((r) => r.fb)));
      const mr = ask(DEFAULT_CLUBS, 100, lie, { surfaceAt }).maxReach.yd;
      ok(Math.abs(mr - top) <= 0.2, `strips (wide): maxReach from ${lie} ${mr.toFixed(2)} yd, the traced curves top at ${top.toFixed(2)}`);
    }
  };
  for (let h = 0; h < 10; h++) hole(2, 100, "wide");
  for (let h = 0; h < 3; h++) hole(0.2, 100, "narrow");
  ok(ms / calls < 10, `solve with 7 clubs takes ${(ms / calls).toFixed(2)} ms`);
  const { wide: A, narrow: B } = tally;
  console.log(`strips: 10 holes x 100 distances (strips 2-25 yd): ${A.recs} recs, ${A.found} single-club bests found, ${A.empty} empty panels; 3 x 100 with strips down to 0.2 yd: ${B.recs} recs, ${B.found} bests found, ${B.missed} missed (a strip inside one step), ${B.empty} empty; every rec within ${worst.toExponential(2)} yd on its own carry's surface; solve with 7 clubs ${(ms / calls).toFixed(3)} ms per call`);
}

// ---- e. caps and red ----
for (const cl of DEFAULT_CLUBS) {
  for (const [lie, cap] of [["rough", 3], ["bunker", BUNKER_CAPS[cl.id]], ["fairway", 4]]) {
    let maxP = 0;
    for (let d = 10; d <= 320; d += 5) for (const r of ask([cl], d, lie).recs) maxP = Math.max(maxP, r.power);
    ok(maxP <= cap + 1e-9, `${cl.id} from ${lie}: power ${maxP.toFixed(3)} above the ${cap}-bar cap`);
    // the threshold itself, a hair either side: the round trip lands within
    // 5.5e-5 bar of the asked power, so 0.001 clears it on both sides
    const hi = ask([cl], stopOf(cl, cap - 0.1 + 0.001), lie).recs[0], lo = ask([cl], stopOf(cl, cap - 0.1 - 0.001), lie).recs[0];
    ok(hi && hi.red === true, `${cl.id} from ${lie}: ${cap - 0.099} bars not flagged red`);
    ok(lo && lo.red === false, `${cl.id} from ${lie}: ${cap - 0.101} bars flagged red`);
    ok(ask([cl], stopOf(cl, cap) + 1, lie).recs.length === 0, `${cl.id} from ${lie}: a distance past the cap still gets a rec`);
  }
}

// ---- f. the fit ----
{
  const POW = [2, 2.5, 3, 3.5, 4], WIND = [-10, -5, 0, 5, 10];
  const truth = { ...byId["7iron"], a: 31.2, h: 0.0137 };
  const rows = (landed, keep = true) => POW.flatMap((p) => WIND.map((w) => ({
    id: `${landed}-${p}-${w}`, club: truth.id, power: p, lie: "fairway", wAlong: w, wCross: 0, lateral: null,
    carry: stopOf(truth, p, landed, 0, w), ...(keep ? { landed } : {}),
  })));
  const check = (shots, what) => {
    const f = fitClub({ ...byId["7iron"] }, shots);
    ok(Math.abs(f.a / truth.a - 1) <= 0.01, `${what}: a ${f.a.toFixed(3)}, expected ${truth.a} within 1 %`);
    ok(Math.abs(f.h - truth.h) <= 0.001, `${what}: h ${f.h.toFixed(5)}, expected ${truth.h} within 0.001`);
    return f;
  };
  const f1 = check(rows("fairway", false), "fairway rows without `landed`");
  const f2 = check(rows("fairway"), "fairway rows with `landed`");
  const f3 = check([...rows("fairway"), ...rows("green").slice(0, 8), ...rows("rough").slice(0, 8)], "fairway, green and rough rows with `landed`");
  // one green row on its own (the mean branch, h held): the same a as the fairway rows
  const one = rows("green")[12];   // 3 bars, no wind
  const g1 = fitClub({ ...byId["7iron"], h: truth.h }, [one]);
  ok(Math.abs(g1.a - truth.a) < 1e-9, `a green row with \`landed\` fits a ${g1.a}, not the fairway rows' ${truth.a}`);
  const g0 = fitClub({ ...byId["7iron"], h: truth.h }, [{ ...one, landed: undefined }]);
  ok(g0.a > truth.a * 1.01, "the same green row without `landed` should fit a longer a (it rolled further than fairway)");
  console.log(`fit: a ${f1.a.toFixed(4)} / ${f2.a.toFixed(4)} / ${f3.a.toFixed(4)}, h ${f1.h.toFixed(5)} / ${f2.h.toFixed(5)} / ${f3.h.toFixed(5)} (truth ${truth.a}, ${truth.h}); a green row fits ${g1.a.toFixed(4)} with \`landed\`, ${g0.a.toFixed(4)} without`);
}

// ---- g. the putt solver moved unchanged ----
// The grid and the digest were recorded with the GRID_N .. solvePutt block of
// App.jsx at c8d3257, before the move (B2 replaces the putt physics and
// retires this comparison).
{
  const N = 9;
  const cells = (f) => Array.from({ length: N }, (_, j) => Array.from({ length: N }, (_, i) => f(i, j)));
  let s = 20261019;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;   // Park-Miller: exact in doubles
  const grids = { flat: cells(() => [0, 0]), tilt: cells(() => [0.6, -0.3]), bowl: cells((i, j) => [(4 - i) / 5, (4 - j) / 5]), noisy: cells(() => [rnd(), rnd()]) };
  const dims = [[18, 14], [25, 30]];
  const spots = [[{ x: 0.2, y: 0.8 }, { x: 0.7, y: 0.3 }], [{ x: 0.5, y: 0.9 }, { x: 0.5, y: 0.2 }], [{ x: 0.85, y: 0.15 }, { x: 0.3, y: 0.6 }]];
  const sims = [], solves = [];
  for (const [gname, grid] of Object.entries(grids)) for (const [W, H] of dims) for (const [ball, cup] of spots) {
    for (const ang of [-20, 0, 12]) for (const pw of [0.8, 1.0, 1.3]) sims.push({ gname, W, H, ang, pw, r: simPutt(grid, W, H, ball, cup, ang, pw) });
    solves.push({ gname, W, H, r: solvePutt(grid, W, H, ball, cup) });
  }
  const json = JSON.stringify({ sims, solves });
  const sha = createHash("sha256").update(json).digest("hex");
  ok(sha === "3b7cf90ae1704923ef01e629832f3dfee925ab1bc43fee250928dc32c5660cf9" && json.length === 351937, `putts differ from App.jsx before the move (sha256 ${sha}, ${json.length} bytes)`);
  // a few of the recorded numbers, to say which moved if the digest does not match
  const r0 = sims[0].r, r215 = sims[215].r, v7 = solves[7].r;
  ok(r0.best === 5.251195960870796 && r0.endSp === 0.0039695615079207245 && r0.path.length === 21, "simPutt case 0 (flat, 18x14, -20 deg, 0.8) differs");
  ok(r215.best === 3.654559369936762 && r215.path.length === 72, "simPutt case 215 (noisy, 25x30, 12 deg, 1.3) differs");
  ok(v7.c === -1.9105 && v7.a === -19 && v7.p === 0.8949999999999999 && v7.r.holed, "solvePutt case 7 (tilt, 18x14) differs");
  console.log(`putts: ${sims.length} simPutt + ${solves.length} solvePutt runs (${sims.filter((x) => x.r.holed).length} + ${solves.filter((x) => x.r.r.holed).length} holed) ${sha.slice(0, 12)}…, as recorded before the move`);
}

// ---- h. the parser ----
try {
  const { parse } = createRequire(join(root, "package.json"))("@babel/parser");
  for (const f of ["src/App.jsx", "src/model.js", "src/wsrsim.js", "src/wsrShape.js"]) {
    try { parse(readFileSync(join(root, f), "utf8"), { sourceType: "module", plugins: ["jsx"] }); }
    catch (e) { ok(false, `${f} does not parse: ${e.message}`); }
  }
  console.log("parse: App.jsx, model.js, wsrsim.js, wsrShape.js");
} catch { console.log("parse: skipped (no @babel/parser here)"); }

console.log(fails ? `${fails} FAILURES` : "all solver checks passed");
process.exit(fails ? 1 : 0);
