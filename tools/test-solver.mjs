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
//     rough < bunker for the driver); rollSpin only for the clubs that spin
//  e. caps: rough 3 bars, bunker per BUNKER_CAPS; `red` from cap - 0.1 up only
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
const { DEFAULT_CLUBS, BUNKER_CAPS, stopOf, carryOf, solve, fitClub, simPutt, solvePutt } = M;
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL:", msg); } };
const near = (got, want, tol, what) => ok(Math.abs(got - want) <= tol, `${what}: ${got.toFixed(3)}, expected ${want} ± ${tol}`);
const IDS = ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge"];
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
  ok(!!t.S.fairway.full === CLUBS[id].spin > 0, `${id}: a full-spin column exactly when the club can backspin`);
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
for (const id of IDS.filter((id) => CLUBS[id].spin > 0)) {
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
    ok(x && (x.rollSpin != null) === (CLUBS[cl.id].spin > 0), `${cl.id}: rollSpin ${x?.rollSpin} for a club that ${CLUBS[cl.id].spin > 0 ? "spins" : "cannot spin"}`);
    if (x && x.rollSpin != null) ok(x.rollSpin < x.roll, `${cl.id}: full spin does not shorten the roll`);
  }
  // the second read wins: fairway's carry lands on green, the green solve's carry back on fairway
  const edge = carryOf(byId["9iron"], 3.6);
  const x = ask([byId["9iron"]], stopOf(byId["9iron"], 3.6), "fairway", { surfaceAt: (yd) => (yd >= edge - 0.5 ? "green" : "fairway") }).recs[0];
  ok(!x || x.surface === "fairway", `two reads that disagree: the second should win (got ${x?.surface})`);
}

// ---- e. caps and red ----
for (const cl of DEFAULT_CLUBS) {
  for (const [lie, cap] of [["rough", 3], ["bunker", BUNKER_CAPS[cl.id]], ["fairway", 4]]) {
    let maxP = 0;
    for (let d = 10; d <= 320; d += 5) for (const r of ask([cl], d, lie).recs) maxP = Math.max(maxP, r.power);
    ok(maxP <= cap + 1e-9, `${cl.id} from ${lie}: power ${maxP.toFixed(3)} above the ${cap}-bar cap`);
    const hi = ask([cl], stopOf(cl, cap - 0.05), lie).recs[0], lo = ask([cl], stopOf(cl, cap - 0.2), lie).recs[0];
    ok(hi && hi.red === true, `${cl.id} from ${lie}: ${cap - 0.05} bars not flagged red`);
    ok(lo && lo.red === false, `${cl.id} from ${lie}: ${cap - 0.2} bars flagged red`);
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
