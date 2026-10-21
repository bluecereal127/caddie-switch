// node tools/test-solver.mjs [repoRoot]
// Acceptance for the stop-distance model: WSR's ball physics ported to
// src/wsrsim.js, its stop-vs-power shape in src/wsrShape.js
// (tools/build-wsr-shape.mjs) and the solver and club fit in src/model.js,
// and for the elevation (the solver flying the terrain along the line).
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
//  c. solve inverts stopOf: p = 1.0 .. 4.0 back within 0.01 bar for every club;
//     the seed clubs are WSR's own (a = stopYd / 4, so k = 1 to the bit): the
//     driver at WSR's 278.798 yd at 4.00, flat and over a level profile; h and
//     c rederived from WSR's wind at full power (src/model.js DEFAULT_CLUBS)
//  d. the landing surface moves the power the right way (green < fairway <
//     rough < bunker for the driver); rollSpin only for the clubs that spin.
//     The power scan: a distance inside the jump at a surface edge gets no rec
//     (the 9-iron onto a green edge, the 7-iron's rough strip, the driver into
//     a green short of a rough sliver); one beyond a bunker is found on the
//     rough past it; a solution whose carry lands on a strip narrower than a
//     scan step is not shipped on the surface around it. Real holes on the
//     App's default line over the committed terrain, with the guide's club
//     numbers the cases were found with: H4 from rough at 210 / 211 yd (the
//     driver's carry onto the fringe), H11 / H13 from rough at 199 yd (the
//     driver on rough). Synthetic holes of random surface strips,
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
//     fairway rows' a once it says where it finished; a row with flatEnded
//     is read as that level-fairway stop
//  g. simPutt / solvePutt (src/putt.js, WSR's roll on a green, re-exported by
//     src/model.js): a fixed grid of putts over painted grids gives the
//     outputs recorded when the model was written (tools/test-putt.mjs is its
//     acceptance; this pins the numbers so a change to them is seen)
//  h. elevation: the port's profile ground (a level profile flies plane(attr,
//     0) to 1e-9 yd for 7 clubs on 5 surfaces, and so does one with a 10 yd
//     drop 0.5 yd behind the ball; a uniform 3-degree one the section 8
//     slope rows within 0.3 yd); the port's scalar tick flies 160
//     recorded runs to the bit; a full driver over a 20 yd step at 150 yd
//     (down: carries over 10 yd further, dh < 0; up: shorter, dh > 0); H21 and
//     H17 on the default line over the committed terrain (the full driver
//     carries further on H21, less on H17); a level profile gives the flat
//     scan's power within 0.01 bar; H21's round trip (a rec's own stop solves
//     back to its power within 0.02 bar); stopAt is the rec's stop, maxReach
//     the top cap flight, ballLift, no terrain heights solve flat (elev
//     false), a distance under a bank gets the closest flight flagged approx;
//     a 7-club solve on H21's line within the 15 ms budget (mean and p90)
//  i. App.jsx, src/model.js and src/putt.js parse with @babel/parser (skipped without it)
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
const { DEFAULT_CLUBS, BUNKER_CAPS, capFor, landingSurface, stopOf, carryOf, landedStop, stopAt, STOP_TOL, solve, fitClub, simPutt, solvePutt } = M;
const { gridField } = await imp("src/putt.js");
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
  // the seed clubs are WSR's own (2026-10-21): a = stopYd / 4, so the
  // solver's k = 4a / stopYd is 1 to the bit and the driver at WSR's
  // full-power stop solves to exactly 4 bars, flat and over a level profile
  for (const cl of DEFAULT_CLUBS) ok((4 * cl.a) / WSR_SHAPE[cl.id].stopYd === 1, `${cl.id}: k = 4a / stopYd = ${(4 * cl.a) / WSR_SHAPE[cl.id].stopYd}, not 1`);
  const sd = WSR_SHAPE.driver.stopYd;
  const r = ask([byId.driver], sd).recs[0];
  ok(r && Math.abs(r.power - 4) < 1e-9, `driver at ${sd} yd: ${r?.power}, expected 4.00`);
  ok(r && Math.abs(r.carry + r.roll - sd) < 1e-9, `driver at ${sd} yd: carry + roll is not the distance`);
  const rl = ask([byId.driver], sd, "fairway", { heightAt: () => 0, surfaceAt: () => "fairway" }).recs[0];
  ok(rl && rl.elev && Math.abs(rl.power - 4) < 0.01 && Math.abs(rl.stop - sd) <= STOP_TOL, `driver at ${sd} yd over a level profile: ${rl ? `${rl.power.toFixed(4)} bars, stop ${rl.stop.toFixed(3)}` : "no rec"}, expected 4.00`);
  console.log(`k = 1: the driver to WSR's ${sd} yd needs ${r?.power.toFixed(4)} bars flat, ${rl?.power.toFixed(4)} over a level profile (stop ${rl?.stop.toFixed(3)})`);
}
console.log(`round trip: 7 clubs x 13 powers, worst ${worstTrip.toExponential(2)} bar`);
// h and c as src/model.js derives them from WSR's own wind at full power on
// level fairway: h = (stop at 10 mph tail - at 10 mph head) / (2 x 10 x calm
// stop), c = drift at 10 mph across / (10 x 4), stored to 5 and 3 decimals
{
  const rows = [];
  for (const cl of DEFAULT_CLUBS) {
    const at = (wind) => run({ club: cl.id, q: 1, wind, trace: false });
    const calm = at(null).stop, h = (at({ mph: 10, deg: 0 }).stop - at({ mph: 10, deg: 180 }).stop) / (2 * 10 * calm), c = at({ mph: 10, deg: 90 }).lateral / (10 * 4);
    ok(Math.abs(cl.h - h) <= 5e-6, `${cl.id}: DEFAULT_CLUBS h ${cl.h}, WSR's wind gives ${h.toFixed(7)}`);
    ok(Math.abs(cl.c - c) <= 5e-4, `${cl.id}: DEFAULT_CLUBS c ${cl.c}, WSR's wind gives ${c.toFixed(5)}`);
    rows.push(`${cl.id} ${h.toFixed(5)} / ${c.toFixed(3)}`);
  }
  console.log(`h / c from WSR's wind: ${rows.join(", ")}`);
}

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
const { parseTerrain, classAt, lieOf, heightAt: terrainHeightAt } = await imp("src/terrain.js");
const DERIVED = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes;
const MAP_W = 250, MAP_H = 304;
// the hole's terrain, its tee and the map fraction yd along the default line
const lineGeo = (n) => {
  const d = DERIVED[n], t = parseTerrain(readFileSync(join(root, `public/terrain/h${String(n).padStart(2, "0")}.bin`)));
  const pin = d.pins.reduce((b, p) => ((p.seen ?? 0) > (b ? b.seen ?? 0 : -1) ? p : b), null) ?? d.pins[0];
  const ball = d.tee, scale = d.scale, dx = (pin.x - ball.x) * MAP_W, dy = (pin.y - ball.y) * MAP_H;
  const th = ((((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) * Math.PI) / 180;
  return { t, ball, at: (yd) => [ball.x + (Math.sin(th) * yd) / scale / MAP_W, ball.y - (Math.cos(th) * yd) / scale / MAP_H] };
};
const lineOf = (n) => { const { t, at } = lineGeo(n); return (yd) => lieOf(classAt(t, ...at(yd))); };
{
  // The cases were found with the seed clubs of their day, the guide's
  // (driver 250 ... wedge 80 yd); they pin the power scan's surface edges, not
  // the clubs, so they keep those a (no wind here, so h and c do not enter)
  const GUIDE_A = { driver: 62.5, spoon: 50, "3iron": 43.75, "5iron": 38.75, "7iron": 33.75, "9iron": 25, wedge: 20 };
  const guideClubs = DEFAULT_CLUBS.map((c) => ({ ...c, a: GUIDE_A[c.id] }));
  const onHole = (n, lie, d) => { const surfaceAt = lineOf(n); return { surfaceAt, o: ask(guideClubs, d, lie, { surfaceAt }) }; };
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
  // a pipeline row's flatEnded (its stop over its elevFactor: the level-
  // fairway stop of the same shot) is what the fit reads, on fairway whatever
  // `landed` says; the logged stop (carry), here as if over a slope that
  // carried it 7 % further onto a green, is then ignored
  const flatRows = rows("fairway").map((r) => ({ ...r, flatEnded: r.carry, carry: r.carry * 1.07, landed: "green", elevFactor: 1.07 }));
  const f4 = check(flatRows, "rows with flatEnded (logged stop 7 % long, `landed` green)");
  const g2 = fitClub({ ...byId["7iron"], h: truth.h }, [flatRows[12]]);
  ok(Math.abs(g2.a - truth.a) < 1e-9, `a row with flatEnded fits a ${g2.a}, not ${truth.a}`);
  console.log(`fit: a ${f1.a.toFixed(4)} / ${f2.a.toFixed(4)} / ${f3.a.toFixed(4)}, h ${f1.h.toFixed(5)} / ${f2.h.toFixed(5)} / ${f3.h.toFixed(5)} (truth ${truth.a}, ${truth.h}); a green row fits ${g1.a.toFixed(4)} with \`landed\`, ${g0.a.toFixed(4)} without; rows read through flatEnded a ${f4.a.toFixed(4)}, h ${f4.h.toFixed(5)}`);
}

// ---- g. the putt solver's recorded numbers ----
// The grids, sizes and spots of the comparison that checked the move out of
// App.jsx (c8d3257), read as painted grids at a steepest slope of 10 %; the
// digest and the spot values were recorded from src/putt.js as B2 wrote it and
// re-recorded when the review's fix pass gave solvePutt its 0.25° aim stage
// (the 216 sims are bit-identical to B2's; 14 of the 24 winners moved onto
// the finer grid, none to a worse cost).
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
    const field = gridField(grid, W, H, 10);
    for (const ang of [-20, 0, 12]) for (const pw of [0.8, 1.0, 1.3]) sims.push({ gname, W, H, ang, pw, r: simPutt(field, ball, cup, ang, pw) });
    solves.push({ gname, W, H, r: solvePutt(field, ball, cup) });
  }
  const json = JSON.stringify({ sims, solves });
  const sha = createHash("sha256").update(json).digest("hex");
  ok(sha === "86b43237bb914456325ec8546710eec60276ff049db7c739f55a8c306b0c822f" && json.length === 457338, `putts differ from the recorded ones (sha256 ${sha}, ${json.length} bytes)`);
  // a few of the recorded numbers, to say which moved if the digest does not match
  const r0 = sims[0].r, r215 = sims[215].r, v7 = solves[7].r;
  ok(r0.best === 4.745372147105579 && r0.endSp === 0.039512072878080305 && r0.path.length === 32, "simPutt case 0 (flat, 18x14, -20 deg, 0.8) differs");
  ok(r215.best === 6.793524673895154 && r215.path.length === 53, "simPutt case 215 (noisy, 25x30, 12 deg, 1.3) differs");
  ok(v7.c === -1.891 && v7.a === -1.75 && v7.p === 1.0899999999999996 && v7.r.holed, "solvePutt case 7 (tilt, 18x14) differs");
  console.log(`putts: ${sims.length} simPutt + ${solves.length} solvePutt runs (${sims.filter((x) => x.r.holed).length} + ${solves.filter((x) => x.r.r.holed).length} holed) ${sha.slice(0, 12)}…, as recorded`);
}

// ---- h. elevation: the solver flies the terrain along the line ----
{
  // h1. the profile ground in the port: a level profile flies plane(attr, 0)
  // (asked within 1e-9 yd; every club at full power on every landing
  // surface), a uniform 3-degree one the 3-degree rows of
  // wsr-ground-phase.md section 8 (within 0.3 yd, and the tilted plane's own
  // runs within 1e-9 yd)
  let worstFlat = 0, worstDrop = 0, worstTilt = 0;
  for (const id of IDS) for (const s of ["fairway", "rough", "green", "fringe", "bunker"]) {
    const a = full(id, s), b = run({ club: id, q: 1, profile: { heightAt: () => 0, surfaceAt: () => s } });
    worstFlat = Math.max(worstFlat, Math.abs(a.stop - b.stop), Math.abs(a.carry - b.carry), Math.abs(a.apex - b.apex));
    ok(a.ticks === b.ticks && a.bounces === b.bounces, `${id} on a level ${s} profile: ${b.ticks} ticks / ${b.bounces} bounces, the plane ${a.ticks} / ${a.bounces}`);
    // the ground behind the ball is not under it: a 10 yd drop 0.5 yd behind
    // (the ball on a cliff top, flat ahead) is the same shot (the plane's
    // slope centred on the ball once read it as a 79-degree tilt and flew
    // every club backwards: a full driver to -98 yd)
    const d = run({ club: id, q: 1, profile: { heightAt: (x) => (x < -0.5 ? -10 : 0), surfaceAt: () => s } });
    worstDrop = Math.max(worstDrop, Math.abs(a.stop - d.stop), Math.abs(a.carry - d.carry), Math.abs(a.apex - d.apex));
  }
  ok(worstFlat <= 1e-9, `a level profile is ${worstFlat} yd off plane(attr, 0)`);
  ok(worstDrop <= 1e-9, `a 10 yd drop 0.5 yd behind the ball is ${worstDrop} yd off plane(attr, 0)`);
  const T3 = Math.tan((3 * Math.PI) / 180), slope3 = (sgn) => ({ heightAt: (x) => sgn * T3 * x, surfaceAt: () => "fairway" });
  const tilt = [];
  for (const [id, down, up] of [["driver", 290.9, 266.7], ["9iron", 115.0, 104.5], ["wedge", 63.5, 57.2]]) {
    const pd = run({ club: id, q: 1, profile: slope3(-1) }), pu = run({ club: id, q: 1, profile: slope3(1) });
    near(pd.stop, down, 0.3, `${id} on a 3-degree downhill profile`);
    near(pu.stop, up, 0.3, `${id} on a 3-degree uphill profile`);
    worstTilt = Math.max(worstTilt, Math.abs(pd.stop - full(id, "fairway", { slopeDeg: -3 }).stop), Math.abs(pu.stop - full(id, "fairway", { slopeDeg: 3 }).stop));
    tilt.push(`${id} ${pd.stop.toFixed(1)} / ${pu.stop.toFixed(1)}`);
  }
  ok(worstTilt <= 1e-9, `a 3-degree profile is ${worstTilt} yd off the tilted plane`);
  console.log(`profile ground: level within ${worstFlat.toExponential(1)} yd of the plane, a 10 yd drop 0.5 yd behind the ball within ${worstDrop.toExponential(1)} (7 clubs x 5 surfaces); 3 degrees down / up ${tilt.join(", ")} yd (wsr-ground-phase.md 290.9 / 266.7, 115.0 / 104.5, 63.5 / 57.2), within ${worstTilt.toExponential(1)} yd of the tilted plane`);

  // h2. the port's tick in scalars flies the committed port's shots to the
  // bit: 160 plane runs of every club and surface with backspin, side spin,
  // slopes, wind and spinStart, their carry, stop, apex, lateral, bounces,
  // ticks, reason and path digested as recorded from src/wsrsim.js at 09a118a
  {
    let s = 20261020;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;   // Park-Miller: exact in doubles
    const CL = [...IDS, "putter"], SURF = ["fairway", "rough", "bunker", "green", "fringe", "tee"], rows = [];
    for (let i = 0; i < 160; i++) {
      const o = { club: CL[i % 8], q: 0.05 + 0.95 * rnd(), surface: SURF[Math.floor(rnd() * 6)] };
      if (rnd() < 0.4) o.back = rnd();
      if (rnd() < 0.3) o.side = rnd() - 0.5;
      if (rnd() < 0.3) o.slopeDeg = (rnd() - 0.5) * 20;
      if (rnd() < 0.3) o.wind = { mph: Math.floor(rnd() * 32), deg: Math.floor(rnd() * 360) };
      if (rnd() < 0.3) o.spinStart = Math.floor(rnd() * 100);
      const r = run(o);
      rows.push([r.carry, r.stop, r.apex, r.lateral, r.bounces, r.ticks, r.reason, r.path]);
    }
    const json = JSON.stringify(rows), sha = createHash("sha256").update(json).digest("hex");
    ok(sha === "81a4f109d5dba8f421f725a0ba8c5eea5d5017f804d6399e74d2fdd4bdac5b54" && json.length === 2175986, `the port's runs differ from the committed port's (sha256 ${sha}, ${json.length} bytes)`);
    ok(rows[0][1] === 210.01056093614878 && rows[0][5] === 2096 && rows[159][5] === 195, "the port's first / last recorded run differs");
  }

  const dr = byId.driver, c7 = byId["7iron"], lvl = (s = "fairway") => ({ heightAt: () => 0, surfaceAt: () => s });
  // h3. a full driver over a 20 yd step at 150 yd (the ball passes 22.4 yd up
  // there): down, it falls further and carries longer; up, it lands on the
  // step's top, short, and dh says which
  const steps = {};
  for (const dz of [-20, 20]) {
    const ctx = { heightAt: (yd) => (yd < 150 ? 0 : dz), surfaceAt: () => "fairway" };
    const r = ask([dr], stopAt(dr, 4, 0, ctx), "tee", ctx).recs[0];
    ok(r && r.elev && Math.abs(r.power - 4) < 0.01, `full driver over a ${dz} yd step: ${r ? r.power.toFixed(3) : "no rec"}, expected 4.00`);
    if (!r) continue;
    steps[dz] = r;
    const gain = r.carry - carryOf(dr, 4);
    if (dz < 0) ok(gain > 10 && r.dh < 0, `20 yd step down: carry ${r.carry.toFixed(1)} (${gain.toFixed(1)} past the level ${carryOf(dr, 4).toFixed(1)}), dh ${r.dh.toFixed(2)}`);
    else ok(gain < 0 && r.dh > 0, `20 yd step up: carry ${r.carry.toFixed(1)} (${gain.toFixed(1)} past the level), dh ${r.dh.toFixed(2)}`);
    near(r.dh, dz, 1e-9, `dh over the ${dz} yd step`);
  }
  if (steps[-20] && steps[20]) console.log(`steps: a full driver carries ${carryOf(dr, 4).toFixed(1)} yd on level ground; over a 20 yd step down at 150 yd ${steps[-20].carry.toFixed(1)} (+${(steps[-20].carry - carryOf(dr, 4)).toFixed(1)}, stops ${steps[-20].stop.toFixed(1)}, dh ${steps[-20].dh.toFixed(0)}), up ${steps[20].carry.toFixed(1)} (${(steps[20].carry - carryOf(dr, 4)).toFixed(1)}, stops ${steps[20].stop.toFixed(1)}, dh +${steps[20].dh.toFixed(0)})`);

  // h4. H21 and H17 on the default line over the committed terrain, built as
  // the App builds ctx (heights relative to the ground under the ball): the
  // full driver lands 49 yd below the tee on H21 and carries further than on
  // level ground, 18 yd above it on H17 and carries less
  const groundOf = (n) => {
    const { t, ball, at } = lineGeo(n), h0 = terrainHeightAt(t, ball.x, ball.y);
    return { surfaceAt: (yd) => lieOf(classAt(t, ...at(yd))), heightAt: (yd) => { const h = terrainHeightAt(t, ...at(yd)); return h == null ? null : h - h0; } };
  };
  const g21 = groundOf(21), g17 = groundOf(17), hole = {};
  for (const [n, ctx] of [[21, g21], [17, g17]]) {
    const r = ask([dr], stopAt(dr, 4, 0, ctx), "tee", ctx).recs[0];
    ok(r && r.elev && Math.abs(r.power - 4) < 0.01, `H${n}: the full driver's rec ${r ? r.power.toFixed(3) : "missing"}, expected 4.00`);
    if (!r) continue;
    hole[n] = r;
    if (n === 21) ok(r.carry > carryOf(dr, 4) && r.dh < 0, `H21: the full driver carries ${r.carry.toFixed(1)} (level ${carryOf(dr, 4).toFixed(1)}), dh ${r.dh.toFixed(1)}`);
    else ok(r.carry < carryOf(dr, 4) && r.dh > 0, `H17: the full driver carries ${r.carry.toFixed(1)} (level ${carryOf(dr, 4).toFixed(1)}), dh ${r.dh.toFixed(1)}`);
  }
  if (hole[21] && hole[17]) console.log(`holes: the full driver carries ${carryOf(dr, 4).toFixed(1)} / stops ${stopOf(dr, 4).toFixed(1)} yd on level ground; on H21's line ${hole[21].carry.toFixed(1)} / ${hole[21].stop.toFixed(1)}, landing ${(-hole[21].dh).toFixed(1)} yd below the tee on ${hole[21].surface}; on H17's ${hole[17].carry.toFixed(1)} / ${hole[17].stop.toFixed(1)}, ${hole[17].dh.toFixed(1)} yd above (stopping ${hole[17].dhStop.toFixed(1)} above)`);

  // h5. a level profile changes nothing: every flat rec comes back at the
  // flat scan's power (within 0.01 bar asked; the shape interpolates the
  // flights between 0.05-q knots, so the flight at the flat power can stop a
  // little off, which the refinement trims) for 7 clubs, 5 landing surfaces,
  // 3 lies and distances 20-258 yd. The profile may add a rec the flat scan
  // has not (a distance within STOP_TOL past the floor's stop): counted
  {
    let n = 0, worst = 0, extra = 0;
    for (const s of ["fairway", "rough", "green", "fringe", "bunker"]) for (const lie of ["tee", "rough", "bunker"]) for (const cl of DEFAULT_CLUBS) for (let d = 20; d <= 260; d += 7) {
      const a = ask([cl], d, lie, { surfaceAt: () => s }).recs[0], b = ask([cl], d, lie, lvl(s)).recs[0];
      ok(a == null || (a.elev === false && b && b.elev === true), `${cl.id} from ${lie} at ${d} yd on ${s}: the level profile ${b ? "flags" : "drops"} the flat rec`);
      if (a && b) { n++; worst = Math.max(worst, Math.abs(a.power - b.power)); }
      else if (b) extra++;
    }
    ok(worst <= 0.01, `a level profile moves a flat rec by ${worst.toFixed(4)} bar`);
    console.log(`level profile: ${n} recs at the flat scan's power (worst ${worst.toExponential(1)} bar); ${extra} more within ${STOP_TOL} yd past a floor`);
  }

  // h6. H21's round trip: every exact rec (7 clubs from the tee at 30-260 yd)
  // solved again at its own stop comes back at its power within 0.02 bar
  {
    let n = 0, worst = 0;
    for (const cl of DEFAULT_CLUBS) for (let d = 30; d <= 260; d += 10) {
      const r = ask([cl], d, "tee", g21).recs[0];
      if (!r || r.approx) continue;
      const r2 = ask([cl], r.stop, "tee", g21).recs[0];
      n++;
      const diff = r2 ? Math.abs(r2.power - r.power) : Infinity;
      worst = Math.max(worst, diff);
      ok(diff <= 0.02, `H21 round trip: ${cl.id} at ${d} yd ${r.power.toFixed(3)} bars stops ${r.stop.toFixed(2)}, which solves to ${r2 ? r2.power.toFixed(3) : "nothing"}`);
    }
    console.log(`H21 round trip: ${n} recs solved again at their own stop, worst ${worst.toFixed(4)} bar`);
  }

  // h7. the rest of the contract: the rec's stop is stopAt's (the rec card's
  // bar maps through it), maxReach is the clubs' top cap flight, a ball 1 yd
  // up carries further and lands 1 yd below itself, no terrain (or a ctx
  // whose heights are all null) solves flat with elev false, and a distance
  // inside a jump (a bank the ball rolls back from) gets the closest flight,
  // flagged approx
  {
    const o = ask(DEFAULT_CLUBS, 180, "tee", g21);
    for (const r of o.recs) ok(Math.abs(stopAt(r.club, r.power, 0, g21) - r.stop) < 1e-9 && Math.abs(r.carry + r.roll - r.stop) < 1e-9, `H21 at 180 yd: ${r.club.id}'s stop ${r.stop} is not stopAt's`);
    const top = Math.max(...DEFAULT_CLUBS.map((cl) => stopAt(cl, capFor(cl, "tee"), 0, g21)));
    ok(o.maxReach && Math.abs(o.maxReach.yd - top) < 1e-9, `H21 maxReach ${o.maxReach?.yd}, the top cap flight ${top}`);
    const up = { ...lvl(), ballLift: 1 }, r0 = ask([dr], stopAt(dr, 4, 0, lvl()), "tee", lvl()).recs[0], r1 = ask([dr], stopAt(dr, 4, 0, up), "tee", up).recs[0];
    ok(r0 && r1 && r1.carry > r0.carry && Math.abs(r1.dh + 1) < 1e-9 && Math.abs(r1.power - 4) < 0.01, `ballLift 1: carry ${r1?.carry} vs ${r0?.carry}, dh ${r1?.dh}`);
    for (const ctx of [{}, { surfaceAt: () => "rough" }, { surfaceAt: () => "rough", heightAt: () => null }]) {
      const x = ask(DEFAULT_CLUBS, 150, "tee", ctx);
      ok(x.recs.length > 0 && x.recs.every((r) => r.elev === false), `no terrain heights (${Object.keys(ctx).join(", ") || "empty ctx"}): recs not flat`);
    }
    const bank = { heightAt: (yd) => (yd < 100 ? 0 : yd < 102 ? (yd - 100) * 5 : 10), surfaceAt: () => "fairway" };
    const b = ask([c7], 102, "tee", bank).recs[0];
    ok(b && b.approx === true && Math.abs(b.stop - 102) > STOP_TOL && Math.abs(stopAt(c7, b.power, 0, bank) - b.stop) < 1e-9, `the 7-iron to 102 yd below a 10 yd bank at 100: ${b ? `${b.power.toFixed(3)} bars stops ${b.stop.toFixed(2)}, approx ${b.approx}` : "no rec"}`);
    console.log(`contract: ballLift 1 yd carries the full driver ${r1 ? (r1.carry - r0.carry).toFixed(2) : "?"} yd further; the 7-iron to 102 yd under a 10 yd bank: ${b ? `the closest flight stops ${b.stop.toFixed(1)} (approx)` : "no rec"}`);
  }

  // h8. the budget: one solve with 7 clubs on H21's line, from the tee at
  // 40-300 yd after a warm-up, under 15 ms (mean and 90th percentile)
  {
    for (let d = 40; d <= 300; d += 20) ask(DEFAULT_CLUBS, d, "tee", g21);
    const ts = [];
    for (let rep = 0; rep < 2; rep++) for (let d = 40; d <= 300; d += 5) { const t0 = performance.now(); ask(DEFAULT_CLUBS, d, "tee", g21); ts.push(performance.now() - t0); }
    ts.sort((a, b) => a - b);
    const mean = ts.reduce((s, x) => s + x, 0) / ts.length, p90 = ts[Math.floor(ts.length * 0.9)];
    ok(mean < 15 && p90 < 15, `a 7-club solve on H21's line takes ${mean.toFixed(2)} ms mean, ${p90.toFixed(2)} ms p90 (budget 15)`);
    console.log(`budget: a 7-club solve on H21's line ${mean.toFixed(2)} ms mean, ${p90.toFixed(2)} p90, ${ts[ts.length - 1].toFixed(2)} max over ${ts.length} solves (budget 15 ms)`);
  }
}

// ---- i. the parser ----
try {
  const { parse } = createRequire(join(root, "package.json"))("@babel/parser");
  for (const f of ["src/App.jsx", "src/model.js", "src/putt.js", "src/wsrsim.js", "src/wsrShape.js"]) {
    try { parse(readFileSync(join(root, f), "utf8"), { sourceType: "module", plugins: ["jsx"] }); }
    catch (e) { ok(false, `${f} does not parse: ${e.message}`); }
  }
  console.log("parse: App.jsx, model.js, putt.js, wsrsim.js, wsrShape.js");
} catch { console.log("parse: skipped (no @babel/parser here)"); }

console.log(fails ? `${fails} FAILURES` : "all solver checks passed");
process.exit(fails ? 1 : 0);
