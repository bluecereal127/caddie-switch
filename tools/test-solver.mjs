// node tools/test-solver.mjs [repoRoot]
// Acceptance for the stop-distance model on Nintendo Switch Sports' own ball:
// src/nsssim.js (decoded, replayed against Eden's RAM by tools/test-nsssim.mjs),
// its stop-vs-power table src/nssShape.js (tools/build-nss-shape.mjs) and the
// solver and club fit in src/model.js, the wind and the elevation (the solver
// flying NSS's ball along the line). Runs on the committed files alone (no
// dump, no Python).
//  a. the table against flights.md section 6 (the decoded laws on a level
//     plane, calm: full and half power on fairway and green, every club but
//     the wedge, whose RAM speed 25.6 m/s is not flights.md's predicted 25.8)
//     and against the launch table's design rule (pct / 100 x CarryMaxYard);
//     the lofts and the lie caps NSS's (RoughRatio 0.75, BunkerRatio 0.25 /
//     0.5 / 0.75)
//  b. the shape: S(1, fairway) = 1, the 4-bar fairway stop exactly 4a, the
//     carry rising, the carry the same on every surface; the floor: the stop,
//     the carry and the launch are the table's at the whole percent the game
//     reads ((int)(100 power) in float32), one value over each percent's
//     window, and a rec's power (the middle of its window, the cap at the
//     cap's) launches its percent; NSS's steps down (a bounce more where a
//     landing crosses the roll switch): every one on fairway is one more
//     bounce in the flight itself; the generator writes the committed file
//     byte for byte, twice
//  c. the round trip: a percent's stop solves to that percent where the
//     distance has one solution (exactly its stop), else to the best-scored
//     solution of an independent percent-by-percent trace (runs that do not
//     fall on one surface, the percent nearest the distance on each run that
//     reaches it within STOP_TOL); the seed clubs are NSS's own (a = stopYd /
//     4: k = 1 to the bit, h = c = 0, CarryMaxYard and LoftDeg carried): the
//     driver at NSS's 265.6 yd at 4.00 flat and over a level profile
//  d. surfaces: each landing surface's rec is the trace's on that surface;
//     water, OB, walls and no read solve as fairway; no spin range (rollSpin
//     null). The percent scan: a distance inside the jump up onto a green gets
//     no rec; inside NSS's step down (a bounce more) the solution either side
//     is found and the better scored taken; a green strip under one percent's
//     carry and no other's turns that percent's landing green. Real holes: the
//     App's default line over the committed terrain on every hole, from the
//     tee and from rough, every 5 yd: every rec on the surface its carry
//     reads, the trace's best percent. Synthetic holes of random strips (1,000
//     distances over ten with strips 2-25 yd wide, 300 over three down to 0.2
//     yd) against the percent trace: every rec on its carry's surface, the
//     trace's best percent for its club, every club the trace has a solution
//     for gets one, and maxReach is the traces' top. One calm solve with 7
//     clubs under 10 ms
//  e. caps: rough 3 bars, bunker per BUNKER_CAPS; `red` exactly from cap - 0.1
//     (the first percent whose power reaches it red, the one below not);
//     nothing past the reach
//  f. fitClub recovers a and h (the residual over NSS's wind) from rows made
//     by NSS's flights at 2-4 bars in -10..10 mph along, with and without
//     `landed`; c the sideways residual; a row with flatEnded is read as that
//     level-fairway stop
//  g. simPutt / solvePutt (src/putt.js, NSS's roll on a green, re-exported by
//     src/model.js): a fixed grid of putts over painted grids gives the
//     outputs recorded when the NSS model was written (tools/test-putt.mjs is
//     its acceptance; this pins the numbers so a change to them is seen)
//  h. wind and elevation: the dial's mph as NSS's s (the HUD table's inverse);
//     a tailwind takes less power, a crosswind aims against its drift, the
//     flown rec stops as near the distance as a percent gets (elev false
//     without heights); a level
//     profile flies the plane, a 10 yd drop behind the ball changes nothing,
//     a 3-degree profile flies the tilted plane; a digest of 40 solver flights;
//     a full driver over a 20 yd step (down: carries over 10 yd further, dh <
//     0; up: shorter, dh > 0); H21 and H17 on the default line over the
//     committed terrain (H21 carries further and lands below, H17 less and
//     above); a level profile gives the table's percent; H21's round trip
//     (its own percent, or one stopping within STOP_TOL of it); stopAt is the
//     rec's stop (with the solve's
//     wind), maxReach the top cap flight, ballLift, no heights in calm solves
//     flat, a bank gets the closest flight flagged approx; a 7-club solve on
//     H21's line within the budget
//  i. App.jsx, src/model.js, src/putt.js, src/nsssim.js and src/nssShape.js
//     parse with @babel/parser (skipped without it)
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const S = await imp("src/nsssim.js");
const { NSS_SHAPE, SHAPE_Q, SHAPE_SURFACES } = await imp("src/nssShape.js");
const M = await imp("src/model.js");
const { DEFAULT_CLUBS, BUNKER_CAPS, capFor, landingSurface, stopOf, carryOf, landedStop, stopAt, STOP_TOL, pctOfBars, barsOfPct, solve, fitClub, simPutt, solvePutt, simProfile, lineProfile, windS, windOf, launchV0 } = M;
const { gridField } = await imp("src/putt.js");
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL:", msg); } };
const near = (got, want, tol, what) => ok(Math.abs(got - want) <= tol, `${what}: ${Number(got).toFixed(3)}, expected ${want} ± ${tol}`);
const IDS = ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge"];
const byId = Object.fromEntries(DEFAULT_CLUBS.map((c) => [c.id, c]));
const YD = S.M_PER_YD, DEG = Math.PI / 180;
const ask = (clubs, dist, lie = "fairway", ctx = {}, wind = {}) =>
  solve(clubs, { dist, windSpeed: wind.speed ?? 0, relWindDeg: wind.deg ?? 0, lie, hole: 0, stroke: 1 }, [], ctx);
// NSS's ball on a level plane of one attribute, from rest, at a whole percent
const plane = (attr) => ({ heightAt: () => 0, normalAt: () => [0, 1, 0], attrAt: () => attr });
// the game's percent for a power in bars ((int)(100 power) in float32, src/nsssim.js
// pctOf) and a percent as a rec reports it: the middle of its window, the cap at the cap's
const pctOfB = (bars) => Math.min(100, S.pctOf(bars / 4));
const barsOfK = (k, cap) => (k >= pctOfB(cap) ? cap : (4 * (k + 0.5)) / 100);
// The percent trace, apart from the solver: a club's percents from the solver's
// floor (0.4 bars) to the cap, each on the surface its own carry reads
// (fairway without surfaceAt), cut into runs that do not fall on one surface;
// a distance's solutions: on each run reaching it (within STOP_TOL past its
// ends) the percent stopping nearest it (the lower on a tie)
const pctRuns = (cl, cap, surfaceAt = null) => {
  const runs = [];
  let cur = null;
  for (let k = pctOfB(0.4); k <= pctOfB(cap); k++) {
    const p = barsOfK(k, cap), carry = carryOf(cl, p), sf = landingSurface(surfaceAt ? surfaceAt(carry) : null), r = { k, p, carry, s: sf, stop: stopOf(cl, p, sf) };
    if (cur && cur[0].s === sf && r.stop >= cur[cur.length - 1].stop) cur.push(r); else runs.push((cur = [r]));
  }
  return runs;
};
const solutionsIn = (runs, d) => runs.filter((run) => run[0].stop - STOP_TOL <= d && d <= run[run.length - 1].stop + STOP_TOL)
  .map((run) => run.reduce((m, r) => (Math.abs(r.stop - d) < Math.abs(m.stop - d) ? r : m)));
const solutionsOf = (cl, d, cap = 4, surfaceAt = null) => solutionsIn(pctRuns(cl, cap, surfaceAt), d);
const scoreOf = (p, cap) => Math.abs(p / cap - 0.8) + (p / cap > 0.97 ? 0.5 : 0);
const bestOf = (sols, cap) => sols.reduce((b, x) => (!b || scoreOf(x.p, cap) < scoreOf(b.p, cap) || (scoreOf(x.p, cap) === scoreOf(b.p, cap) && x.p < b.p) ? x : b), null);
const flyPct = (id, pct, attr = 1) => {
  const t = NSS_SHAPE[id], v = S.PHYSICS.launchTable[t.club][pct - 1], L = t.loftDeg * DEG;
  return S.run({ club: t.club, v0: [0, v * Math.sin(L), -v * Math.cos(L)], lie: "fairway", start: [0, 0.05, 0], heading: 0, ground: plane(attr) });
};

// ---- a. the table against flights.md section 6 ----
{
  // flights.md 6 / flights/flat-ground.json: carry, fairway stop, green stop at pct 100 and 50
  const DOC = {
    driver: { 100: [240.3, 265.6, 262.3], 50: [120.3, 154.9, 158.4] }, spoon: { 100: [220.4, 244.7, 241.5], 50: [110.3, 142.0, 145.2] },
    "3iron": { 100: [190.5, 218.3, 214.6], 50: [95.1, 114.4, 112.2] }, "5iron": { 100: [160.5, 184.8, 181.5], 50: [80.0, 96.5, 94.6] },
    "7iron": { 100: [130.2, 151.7, 148.9], 50: [65.4, 79.7, 78.1] }, "9iron": { 100: [100.4, 117.5, 115.2], 50: [50.3, 61.3, 60.0] },
  };
  // flat-ground.json's speeds (m/s): where the RAM's table has the same speed the
  // table's entry is checked, else NSS's ball is flown at the doc's speed
  const FLAT = { WD1: { 100: 57.6, 50: 40.6 }, WD3: { 100: 54.4, 50: 38.2 }, IR3: { 100: 54.2, 50: 36.3 }, IR5: { 100: 48.3, 50: 32.3 }, IR7: { 100: 42.5, 50: 28.7 }, IR9: { 100: 36.1, 50: 24.3 } };
  const line = [], flownAt = [];
  for (const [id, rows] of Object.entries(DOC)) {
    const t = NSS_SHAPE[id], L = t.loftDeg * DEG;
    for (const [pct, [c, f, g]] of Object.entries(rows)) {
      const k = +pct - 1, docV = FLAT[t.club][pct], ramV = S.PHYSICS.launchTable[t.club][k];
      let got;
      if (docV === ramV) got = [t.C[k] * t.stopYd, t.S.fairway[k] * t.stopYd, t.S.green[k] * t.stopYd];
      else {
        const fly = (attr) => S.run({ club: t.club, v0: [0, docV * Math.sin(L), -docV * Math.cos(L)], lie: "fairway", start: [0, 0.05, 0], heading: 0, ground: plane(attr) });
        const a = fly(1), b = fly(6);
        got = [a.carryYd, a.stopYd, b.stopYd];
        flownAt.push(`${id} ${pct} % (RAM ${ramV}, doc ${docV} m/s)`);
      }
      near(got[0], c, 0.15, `${id} at ${pct} %: carry`);
      near(got[1], f, 0.15, `${id} at ${pct} %: stop on fairway`);
      near(got[2], g, 0.15, `${id} at ${pct} %: stop on green`);
    }
    line.push(`${id} ${(t.C[99] * t.stopYd).toFixed(1)} / ${t.stopYd.toFixed(1)}`);
  }
  // the design rule: the table's speeds carry about pct / 100 x CarryMaxYard
  // (verdicts.json: 0.99-1.035 on the measured entries; the predicted ones
  // differ by a step), at 10-100 %
  let lo = Infinity, hi = 0;
  const rule = [];
  for (const id of IDS) {
    const t = NSS_SHAPE[id];
    ok(t.carryMaxYd === S.PHYSICS.clubs[t.club].carryMaxYard && t.loftDeg === S.PHYSICS.clubs[t.club].loftDeg, `${id}: CarryMaxYard / LoftDeg not NSS's`);
    let l = Infinity, h = 0;
    for (let pct = 10; pct <= 100; pct++) { const r = (t.C[pct - 1] * t.stopYd) / ((pct / 100) * t.carryMaxYd); l = Math.min(l, r); h = Math.max(h, r); }
    lo = Math.min(lo, l); hi = Math.max(hi, h); rule.push(`${id} ${l.toFixed(3)}-${h.toFixed(3)}`);
  }
  ok(lo >= 0.98 && hi <= 1.07, `the table's carries ${lo.toFixed(4)}-${hi.toFixed(4)} x pct / 100 x CarryMaxYard`);
  // the lie caps, NSS's ratios x 4
  for (const id of IDS) {
    const c = S.PHYSICS.clubs[NSS_SHAPE[id].club];
    ok(capFor(byId[id], "rough") === 4 * c.roughRatio && capFor(byId[id], "rough") === 3, `${id}: rough cap ${capFor(byId[id], "rough")}`);
    ok(capFor(byId[id], "bunker") === 4 * c.bunkerRatio && BUNKER_CAPS[id] === 4 * c.bunkerRatio, `${id}: bunker cap ${capFor(byId[id], "bunker")}`);
  }
  ok(BUNKER_CAPS.driver === 1 && BUNKER_CAPS.spoon === 1 && BUNKER_CAPS["3iron"] === 2 && BUNKER_CAPS["9iron"] === 2 && BUNKER_CAPS.wedge === 3, `BUNKER_CAPS ${JSON.stringify(BUNKER_CAPS)}`);
  console.log(`table: full-power carry / fairway stop ${line.join(", ")} yd; flown at the doc's speed: ${flownAt.join(", ")}; carries x the design rule ${rule.join(", ")}`);
}

// ---- b. the shape ----
{
  let entries = 0, steps = 0, stepsBounce = 0;
  const stepList = [];
  for (const id of IDS) {
    const t = NSS_SHAPE[id];
    ok(t && t.C.length === SHAPE_Q.length && SHAPE_Q.length === 100 && SHAPE_Q[0] === 0.01 && SHAPE_Q[99] === 1, `${id}: no 100-knot table`);
    ok(t.S.fairway[99] === 1, `${id}: S(1, fairway) = ${t.S.fairway[99]}, not 1`);
    ok(stopOf({ ...byId[id] }, 4) === 4 * byId[id].a, `${id}: the 4-bar fairway stop is not exactly 4a`);
    ok(t.C.every((v, k) => k === 0 || v > t.C[k - 1]), `${id}: carry not increasing in q`);
    for (const s of SHAPE_SURFACES) { entries += t.S[s].length; ok(t.S[s].length === 100, `${id} ${s}: ${t.S[s].length} entries`); }
    // every step down on fairway is a bounce more in the flight itself
    for (let k = 1; k < 100; k++) if (t.S.fairway[k] < t.S.fairway[k - 1]) {
      steps++;
      const a = flyPct(id, k), b = flyPct(id, k + 1);
      if (b.bounces > a.bounces) stepsBounce++;
      stepList.push(`${id} ${k}->${k + 1} %: ${a.stopYd.toFixed(1)} -> ${b.stopYd.toFixed(1)} yd, bounces ${a.bounces} -> ${b.bounces}`);
    }
    // the carry is the surface's own (the air never touches it)
    const g = flyPct(id, 73, 6), f = flyPct(id, 73, 1);
    ok(g.carryYd === f.carryYd, `${id}: the carry at 73 % differs on green`);
  }
  ok(steps > 0 && stepsBounce === steps, `fairway steps down: ${stepsBounce} of ${steps} are a bounce more`);
  const dS = NSS_SHAPE.driver;
  // the floor: one stop, carry and launch over each percent's window (the game
  // reads the table at (int)(100 power)), the next percent's from its edge, and a
  // rec's power (barsOfPct) launches its own percent
  {
    let windows = 0;
    for (const id of IDS) {
      const cl = byId[id], t = NSS_SHAPE[id], tb = S.PHYSICS.launchTable[t.club];
      for (let k = 1; k <= 100; k++) {
        // (the window's low edge a hair in: the game's float32 reads 0.53 and 0.59 as 52 and 58 %)
        const lo = (4 * (k + 0.001)) / 100, mid = barsOfPct(k, 4), hiB = (4 * (k + 0.999)) / 100, sk = 4 * cl.a * t.S.fairway[k - 1], ck = 4 * cl.a * t.C[k - 1];
        const same = [lo, mid, hiB].filter((b) => b <= 4).every((b) => stopOf(cl, b) === sk && carryOf(cl, b) === ck && pctOfBars(b) === k && -launchV0(id, b / 4)[2] === tb[k - 1] * Math.cos(t.loftDeg * DEG));
        ok(same, `${id} at ${k} %: the stop, carry or launch is not the table's over the window`);
        ok(pctOfBars(mid) === k && (k === 100 ? mid === 4 : Math.abs(mid - (4 * (k + 0.5)) / 100) < 1e-15), `${id}: barsOfPct(${k}) = ${mid} does not launch ${k} %`);
        if (same) windows++;
      }
      for (const cap of [3, 2, 1]) ok(barsOfPct(pctOfBars(cap), cap) === cap, `barsOfPct at the ${cap}-bar cap's percent is not the cap`);
    }
    ok(stopOf(byId.driver, 2.41) === stopOf(byId.driver, 2.43) && stopOf(byId.driver, 2.44) > stopOf(byId.driver, 2.43), "the driver's 60 % window: one stop, the next from 2.44 bars");
    console.log(`floor: ${windows} percent windows (7 clubs x 100) one stop, carry and launch from edge to edge; barsOfPct launches its percent`);
  }
  near(dS.S.fairway[24] * dS.stopYd, 89.1, 0.1, "driver at 1 bar on fairway");
  near(dS.S.fairway[49] * dS.stopYd, 154.8, 0.1, "driver at 2 bars on fairway");
  near(dS.S.fairway[74] * dS.stopYd, 203.7, 0.1, "driver at 3 bars on fairway");
  {
    const committed = readFileSync(join(root, "src/nssShape.js"), "utf8").replace(/\r\n/g, "\n");
    const dir = mkdtempSync(join(tmpdir(), "nssshape-"));
    try {
      const outs = [0, 1].map((k) => {
        const out = join(dir, `shape${k}.js`);
        execFileSync(process.execPath, [join(root, "tools/build-nss-shape.mjs"), "--out", out], { cwd: root, stdio: "pipe" });
        return readFileSync(out, "utf8");
      });
      ok(outs[0] === outs[1], "tools/build-nss-shape.mjs: two runs differ");
      ok(outs[0] === committed, "tools/build-nss-shape.mjs does not reproduce the committed src/nssShape.js");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  console.log(`shape: ${IDS.length} clubs, ${entries} stop entries; ${steps} steps down on fairway, each a bounce more (${stepList.join("; ")}); driver 1/2/3/4 bars ${[24, 49, 74, 99].map((k) => (dS.S.fairway[k] * dS.stopYd).toFixed(1)).join(" / ")} yd; generator deterministic`);
}

// ---- c. the round trip ----
// a percent's stop (fairway, calm) solves to that percent where the trace has
// one solution there, else to the trace's best scored
{
  let unique = 0, many = 0;
  for (const cl of DEFAULT_CLUBS) for (let p = 1; p <= 4; p += 0.25) {
    const k = pctOfB(p), d = stopOf(cl, p), { recs } = ask([cl], d);
    const sols = solutionsOf(cl, d);
    ok(recs.length === 1, `${cl.id} at ${p} bars: no rec`);
    const r = recs[0];
    if (!r) continue;
    ok(r.pct === pctOfBars(r.power) && r.power === barsOfPct(r.pct, 4) && Math.abs(r.carry + r.roll - stopOf(cl, r.power)) < 1e-9, `${cl.id} at ${p} bars: the rec's power ${r.power} is not its percent ${r.pct}'s, or its stop not that percent's`);
    if (sols.length === 1) { unique++; ok(r.pct === k && Math.abs(r.carry + r.roll - d) < 1e-9, `${cl.id} round trip at ${p} bars (${k} %): ${r.pct} %`); }
    else {
      many++;
      const best = bestOf(sols, 4);
      ok(r.pct === best.k, `${cl.id} at ${p} bars (${sols.length} solutions ${sols.map((x) => `${x.k} %`).join(" / ")}): ${r.pct} %, not the best scored ${best.k} %`);
    }
  }
  // the seeds are NSS's own: k = 4a / stopYd is 1 to the bit, h = c = 0
  for (const cl of DEFAULT_CLUBS) {
    const t = NSS_SHAPE[cl.id];
    ok((4 * cl.a) / t.stopYd === 1, `${cl.id}: k = 4a / stopYd = ${(4 * cl.a) / t.stopYd}, not 1`);
    ok(cl.h === 0 && cl.c === 0 && cl.carryMaxYd === t.carryMaxYd && cl.loftDeg === t.loftDeg && cl.maxPower === 4, `${cl.id}: seed h ${cl.h}, c ${cl.c}, carryMaxYd ${cl.carryMaxYd}, loftDeg ${cl.loftDeg}`);
  }
  ok(!byId.driver.spin && !byId.spoon.spin && IDS.slice(2).every((id) => byId[id].spin), "woods cannot backspin, irons and the wedge can");
  const sd = NSS_SHAPE.driver.stopYd;
  const r = ask([byId.driver], sd).recs[0];
  ok(r && Math.abs(r.power - 4) < 1e-9 && Math.abs(r.carry + r.roll - sd) < 1e-9 && r.elev === false && r.stop == null, `driver at ${sd} yd: ${r?.power}, expected 4.00 flat`);
  const rl = ask([byId.driver], sd, "fairway", { heightAt: () => 0, surfaceAt: () => "fairway" }).recs[0];
  ok(rl && rl.elev && Math.abs(rl.power - 4) < 0.01 && Math.abs(rl.stop - sd) <= STOP_TOL, `driver at ${sd} yd over a level profile: ${rl ? `${rl.power.toFixed(4)} bars, stop ${rl.stop.toFixed(3)}` : "no rec"}, expected 4.00`);
  console.log(`round trip: 7 clubs x 13 powers: ${unique} with one solution, each its own percent and stop; ${many} with more (a step down between, or a run's end within STOP_TOL), the best scored taken; k = 1: the driver to NSS's ${sd} yd needs ${r?.power.toFixed(4)} bars flat, ${rl?.power.toFixed(4)} over a level profile (stop ${rl?.stop.toFixed(3)})`);
}

// ---- d. surfaces ----
{
  const dr = byId.driver, at = (s) => ask([dr], 200, "fairway", { surfaceAt: () => s }).recs[0];
  const out = {};
  for (const s of ["green", "fairway", "rough", "fringe", "bunker"]) {
    const x = at(s), b = bestOf(solutionsOf(dr, 200, 4, () => s), 4);
    ok(x && x.surface === s && b && x.pct === b.k && Math.abs(stopOf(dr, x.power, s) - 200) <= 3, `driver at 200 yd on ${s}: ${x ? `${x.pct} % on ${x.surface}, stops ${stopOf(dr, x.power, s).toFixed(2)}` : "no rec"}, the trace ${b ? `${b.k} %` : "none"}`);
    out[s] = x;
  }
  // full power: the green's bounce takes more pace than the fairway's (ReflectionH 0.5 / 0.6), rough's and the bunker's far more
  const sf = (s) => stopOf(dr, 4, s);
  ok(sf("fringe") > sf("fairway") && sf("fairway") > sf("green") && sf("green") > sf("rough") && sf("rough") > sf("bunker"), `driver full-power stops fringe ${sf("fringe").toFixed(1)} / fairway ${sf("fairway").toFixed(1)} / green ${sf("green").toFixed(1)} / rough ${sf("rough").toFixed(1)} / bunker ${sf("bunker").toFixed(1)} not in that order`);
  console.log(`surfaces: the driver to 200 yd needs ${Object.values(out).filter(Boolean).map((x) => `${x.power.toFixed(2)} bars (${x.pct} %) on ${x.surface} (carry ${x.carry.toFixed(0)}, roll ${x.roll.toFixed(0)}, stops ${(x.carry + x.roll).toFixed(1)})`).join(", ")}`);
  const f = out.fairway;
  for (const s of ["water", "outer", "wall", null, undefined]) {
    const x = ask([dr], 200, "fairway", { surfaceAt: () => s }).recs[0];
    ok(x && x.surface === "fairway" && Math.abs(x.power - f.power) < 1e-12, `a landing read of ${s} does not solve as fairway`);
  }
  ok(Math.abs(ask([dr], 200).recs[0].power - f.power) < 1e-12, "no surfaceAt does not solve as fairway");
  for (const cl of DEFAULT_CLUBS) {
    const x = ask([cl], stopOf(cl, 3), "fairway", { surfaceAt: () => "green" }).recs[0];
    ok(x && x.rollSpin === null, `${cl.id}: rollSpin ${x?.rollSpin} (NSS's swing backspin is not decoded: no range)`);
  }
  // A distance inside the jump up onto a green: the driver at 2 bars rolls further
  // onto a green than on fairway; with green from 0.5 yd short of that carry the
  // fairway run ends short of the fairway stop and the green run starts past it
  {
    const p = 2, edge = carryOf(dr, p) - 0.5, d = stopOf(dr, p);
    ok(stopOf(dr, p, "green") > d + 1, "the driver at 2 bars should roll further on a green");
    const x = ask([dr], d, "fairway", { surfaceAt: (yd) => (yd >= edge ? "green" : "fairway") }).recs[0];
    ok(!x, `a distance inside the jump onto a green got a rec (${x?.power.toFixed(3)} bars on ${x?.surface})`);
  }
  // NSS's step down (the driver from 67 to 68 %: a bounce more): a distance just
  // under the step's top has a solution on each rising piece, either side; the
  // solver takes the one nearer 80 % of the bar
  {
    const top = stopOf(dr, 2.68), bottom = stopOf(dr, 2.72), d = (top + bottom) / 2;
    ok(top > bottom + 5, `the driver's step at 67-68 %: ${top.toFixed(1)} -> ${bottom.toFixed(1)}`);
    const sols = solutionsOf(dr, d);
    const x = ask([dr], d).recs[0];
    ok(sols.length === 2 && x && x.pct === sols[1].k && x.pct === bestOf(sols, 4).k, `inside the driver's step at ${d.toFixed(1)} yd: solutions ${sols.map((s) => `${s.k} %`).join(" / ")}, rec ${x?.pct} %`);
    console.log(`step: the driver's 67 % stops ${top.toFixed(1)}, 68 % ${bottom.toFixed(1)} (a bounce more); ${d.toFixed(1)} yd solves at ${sols.map((s) => `${s.k} % (${s.p.toFixed(2)} bars, stops ${s.stop.toFixed(1)})`).join(" or ")}, the rec ${x?.pct} %`);
  }
  // a green strip 0.3 yd wide under the carry of the driver's 62 % and no
  // other percent's: 62 % lands on the green, where it would roll further, so
  // it must not ship as a fairway rec at the fairway stop of 62 %
  {
    const p0 = barsOfK(62, 4), c0 = carryOf(dr, p0), d0 = stopOf(dr, p0);
    const hidden = (yd) => (Math.abs(yd - c0) <= 0.15 ? "green" : "fairway");
    ok(hidden(carryOf(dr, barsOfK(61, 4))) === "fairway" && hidden(carryOf(dr, barsOfK(63, 4))) === "fairway", "the hidden-strip case: the neighbouring percents' carries should read fairway");
    const x = ask([dr], d0, "tee", { surfaceAt: hidden }).recs[0];
    ok(!x || (hidden(x.carry) === x.surface && !(x.pct === 62 && x.surface === "fairway")), `a fairway solution whose carry lands on a hidden green strip shipped (${x?.pct} % on ${x?.surface}, carry reads ${x ? hidden(x.carry) : ""})`);
  }
}

// ---- d, real holes: the App's default line (the derived tee to the
// pipeline pin seen most, as src/derivedMerge.js picks curPin) over the
// committed terrain, read through src/terrain.js ----
const { parseTerrain, classAt, lieOf, heightAt: terrainHeightAt } = await imp("src/terrain.js");
const DERIVED = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes;
const MAP_W = 250, MAP_H = 304;
const lineGeo = (n) => {
  const d = DERIVED[n], t = parseTerrain(readFileSync(join(root, `public/terrain/h${String(n).padStart(2, "0")}.bin`)));
  const pin = d.pins.reduce((b, p) => ((p.seen ?? 0) > (b ? b.seen ?? 0 : -1) ? p : b), null) ?? d.pins[0];
  const ball = d.tee, scale = d.scale, dx = (pin.x - ball.x) * MAP_W, dy = (pin.y - ball.y) * MAP_H;
  const th = ((((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) * Math.PI) / 180;
  return { t, ball, pin, at: (yd) => [ball.x + (Math.sin(th) * yd) / scale / MAP_W, ball.y - (Math.cos(th) * yd) / scale / MAP_H] };
};
const lineOf = (n) => { const { t, at } = lineGeo(n); return (yd) => lieOf(classAt(t, ...at(yd))); };
{
  let recs = 0, edges = 0, worst = 0;
  const seen = {};
  for (let n = 1; n <= 21; n++) {
    const surfaceAt = lineOf(n);
    for (const lie of ["tee", "rough"]) for (let d = 30; d <= 270; d += 5) {
      for (const r of ask(DEFAULT_CLUBS, d, lie, { surfaceAt }).recs) {
        recs++;
        const read = landingSurface(surfaceAt(r.carry)), best = bestOf(solutionsOf(r.club, d, capFor(r.club, lie), surfaceAt), capFor(r.club, lie));
        const stop = landedStop(r.club, r.power, 0, surfaceAt);
        worst = Math.max(worst, Math.abs(stop - d));
        ok(read === r.surface && best && r.pct === best.k && Math.abs(stop - r.carry - r.roll) < 1e-9, `H${n} from ${lie} at ${d} yd: ${r.club.id} ${r.pct} % on ${r.surface}, its carry reads ${read}, stops ${stop.toFixed(3)}; the trace ${best ? `${best.k} %` : "none"}`);
        if (r.surface !== "fairway") { edges++; seen[r.surface] = (seen[r.surface] ?? 0) + 1; }
      }
    }
  }
  console.log(`holes: the default lines of all 21 holes from the tee and rough at 30-270 yd: ${recs} recs on the surface their carry reads, the trace's percent, stopping within ${worst.toFixed(2)} yd of the distance; ${edges} off fairway (${Object.entries(seen).map(([s, k]) => `${s} ${k}`).join(", ")})`);
}

// ---- d, synthetic holes: random strips of every surface (and water / OB /
// no read, which roll as fairway) along the line, 1,000 random distances from
// random lies over ten holes whose strips are 2-25 yd wide and 300 more over
// three holes with strips down to 0.2 yd, narrower than a percent's step of
// the carry. Each club's percents are traced apart from the solver (pctRuns).
// Every rec: on the surface read at its own carry, the trace's best-scored
// solution for its club; every club with a solution in the trace gets that
// rec; maxReach is the traces' top. ----
{
  let seed = 4242;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // Park-Miller: exact in doubles
  const KINDS = ["fairway", "rough", "green", "fringe", "bunker", "water", "outer", null];
  const LIES = ["tee", "rough", "bunker"];
  const tally = { wide: { recs: 0, found: 0, empty: 0 }, narrow: { recs: 0, found: 0, empty: 0 } };
  let worst = 0, ms = 0, calls = 0;
  const hole = (minW, nDist, kind) => {
    const strips = [];
    for (let yd = 0; yd < 360; ) {
      const w = minW < 1 && rnd() < 0.4 ? minW + (1 - minW) * rnd() : 2 + 23 * rnd();
      strips.push({ from: yd, to: yd + w, s: KINDS[Math.floor(rnd() * KINDS.length)] }); yd += w;
    }
    const surfaceAt = (yd) => (strips.find((x) => yd >= x.from && yd < x.to) ?? { s: null }).s;
    const trace = {};
    for (const lie of LIES) {
      trace[lie] = {};
      for (const cl of DEFAULT_CLUBS) { const cap = capFor(cl, lie); trace[lie][cl.id] = { cap, runs: pctRuns(cl, cap, surfaceAt) }; }
    }
    const T = tally[kind];
    for (let k = 0; k < nDist; k++) {
      const lie = LIES[Math.floor(rnd() * LIES.length)], d = 15 + 250 * rnd();
      const t0 = performance.now();
      const o = ask(DEFAULT_CLUBS, d, lie, { surfaceAt });
      ms += performance.now() - t0; calls++;
      if (!o.recs.length) T.empty++;
      for (const r of o.recs) {
        T.recs++;
        const t = trace[lie][r.club.id], best = bestOf(solutionsIn(t.runs, d), t.cap);
        worst = Math.max(worst, Math.abs(landedStop(r.club, r.power, 0, surfaceAt) - d));
        ok(landingSurface(surfaceAt(r.carry)) === r.surface && landingSurface(r.landsOn) === r.surface, `strips (${kind}): ${r.club.id} from ${lie} at ${d.toFixed(2)} yd solved on ${r.surface}, its carry reads ${surfaceAt(r.carry)}`);
        ok(best && r.pct === best.k, `strips (${kind}): ${r.club.id} from ${lie} at ${d.toFixed(2)} yd: ${r.pct} %, the trace's best ${best ? `${best.k} %` : "none"}`);
      }
      for (const cl of DEFAULT_CLUBS) {
        const t = trace[lie][cl.id], best = bestOf(solutionsIn(t.runs, d), t.cap);
        if (!best) continue;
        const one = ask([cl], d, lie, { surfaceAt }).recs[0];
        ok(one && one.pct === best.k, `strips (${kind}): ${cl.id} from ${lie} at ${d.toFixed(2)} yd: the trace's best is ${best.k} %, the solver's ${one ? `${one.pct} %` : "none"}`);
        if (one && one.pct === best.k) T.found++;
      }
    }
    for (const lie of LIES) {
      const top = Math.max(...DEFAULT_CLUBS.flatMap((cl) => trace[lie][cl.id].runs.map((r) => r[r.length - 1].stop)));
      const mr = ask(DEFAULT_CLUBS, 100, lie, { surfaceAt }).maxReach.yd;
      ok(Math.abs(mr - top) < 1e-9, `strips (${kind}): maxReach from ${lie} ${mr.toFixed(2)} yd, the traced percents top at ${top.toFixed(2)}`);
    }
  };
  for (let h = 0; h < 10; h++) hole(2, 100, "wide");
  for (let h = 0; h < 3; h++) hole(0.2, 100, "narrow");
  ok(ms / calls < 10, `a calm solve with 7 clubs takes ${(ms / calls).toFixed(2)} ms`);
  const { wide: A, narrow: B } = tally;
  console.log(`strips: 10 holes x 100 distances (strips 2-25 yd): ${A.recs} recs, ${A.found} single-club bests found, ${A.empty} empty panels; 3 x 100 with strips down to 0.2 yd: ${B.recs} recs, ${B.found} bests found, ${B.empty} empty; every rec the trace's percent on its own carry's surface, within ${worst.toFixed(2)} yd of the distance; a calm solve with 7 clubs ${(ms / calls).toFixed(3)} ms per call`);
}

// ---- e. caps and red ----
for (const cl of DEFAULT_CLUBS) {
  for (const [lie, cap] of [["rough", 3], ["bunker", BUNKER_CAPS[cl.id]], ["fairway", 4]]) {
    let maxP = 0, redOk = true;
    for (let d = 10; d <= 280; d += 5) for (const r of ask([cl], d, lie).recs) { maxP = Math.max(maxP, r.power); if (r.red !== (r.power >= cap - 0.1)) redOk = false; }
    ok(maxP <= cap + 1e-9, `${cl.id} from ${lie}: power ${maxP.toFixed(3)} above the ${cap}-bar cap`);
    ok(redOk, `${cl.id} from ${lie}: red not exactly power >= cap - 0.1`);
    // the threshold itself: the first percent whose power reaches cap - 0.1 and
    // the one below, where the distance has one solution there
    let kr = pctOfB(0.4);
    while (barsOfK(kr, cap) < cap - 0.1) kr++;
    for (const [k, want] of [[kr, true], [kr - 1, false]]) {
      const p = barsOfK(k, cap), d = stopOf(cl, p), sols = solutionsOf(cl, d, cap);
      if (sols.length !== 1) continue;
      const r = ask([cl], d, lie).recs[0];
      ok(r && r.pct === k && r.red === want, `${cl.id} from ${lie}: ${k} % (${p.toFixed(3)} bars) ${want ? "not " : ""}flagged red`);
    }
    const reach = ask([cl], 10, lie).maxReach.yd;
    ok(ask([cl], reach + 1, lie).recs.length === 0, `${cl.id} from ${lie}: a distance past the reach still gets a rec`);
  }
}

// ---- f. the fit ----
{
  const POW = [2, 2.5, 3, 3.5, 4], WIND = [-10, -5, 0, 5, 10];
  const id = "7iron", seedC = byId[id], truth = { ...seedC, a: seedC.a * 0.97, h: 0.004 };
  // NSS's ball at power p in w mph along the line on a level line of `landed`
  const nssStop = (p, w, landed) => stopAt({ ...seedC }, p, w, { wind: { speed: Math.abs(w), deg: w < 0 ? 180 : 0 }, surfaceAt: () => landed });
  const rows = (landed, keep = true) => POW.flatMap((p) => WIND.map((w) => ({
    id: `${landed}-${p}-${w}`, club: id, power: p, lie: "fairway", wAlong: w, wCross: 0, lateral: null,
    carry: ((4 * truth.a) / NSS_SHAPE[id].stopYd) * (1 + truth.h * w) * nssStop(p, w, landed), ...(keep ? { landed } : {}),
  })));
  const check = (shots, what) => {
    const f = fitClub({ ...seedC }, shots);
    ok(Math.abs(f.a / truth.a - 1) <= 0.005, `${what}: a ${f.a.toFixed(3)}, expected ${truth.a.toFixed(3)} within 0.5 %`);
    ok(Math.abs(f.h - truth.h) <= 0.0005, `${what}: h ${f.h.toFixed(5)}, expected ${truth.h} within 0.0005`);
    return f;
  };
  const f1 = check(rows("fairway", false), "fairway rows without `landed`");
  const f2 = check(rows("fairway"), "fairway rows with `landed`");
  const f3 = check([...rows("fairway"), ...rows("green").slice(0, 8), ...rows("rough").slice(0, 8)], "fairway, green and rough rows with `landed`");
  // one green row on its own (the mean branch, h held): the same a as the fairway rows
  const one = rows("green")[12];   // 3 bars, no wind
  const g1 = fitClub({ ...seedC, h: truth.h }, [one]);
  ok(Math.abs(g1.a - truth.a) < 1e-9, `a green row with \`landed\` fits a ${g1.a}, not ${truth.a}`);
  // at 3 bars the 7-iron rolls less on a green than on fairway: read as fairway, the row fits a shorter a
  const g0 = fitClub({ ...seedC, h: truth.h }, [{ ...one, landed: undefined }]);
  ok(g0.a < truth.a * 0.995, `the same green row without \`landed\` should fit a shorter a (${g0.a.toFixed(3)} vs ${truth.a.toFixed(3)})`);
  // a pipeline row's flatEnded (its stop over its elevFactor) is what the fit
  // reads, on fairway whatever `landed` says
  const flatRows = rows("fairway").map((r) => ({ ...r, flatEnded: r.carry, carry: r.carry * 1.07, landed: "green", elevFactor: 1.07 }));
  const f4 = check(flatRows, "rows with flatEnded (logged stop 7 % long, `landed` green)");
  // c: the sideways miss beyond NSS's own drift, per mph across per bar
  const crossRows = POW.flatMap((p) => [-10, 10].map((w) => {
    const ctx = { wind: { speed: 10, deg: w < 0 ? 270 : 90 }, surfaceAt: () => "fairway" };
    const f = M.flightOf({ ...seedC }, p, 0, ctx), lat = f.path[f.path.length - 1][2];
    return { id: `x${p}${w}`, club: id, power: p, lie: "fairway", wAlong: 0, wCross: w, carry: stopAt({ ...seedC }, p, 0, ctx), lateral: lat + 0.2 * w * p };
  }));
  const fc = fitClub({ ...seedC }, crossRows);
  near(fc.c, 0.2, 0.01, "c: a 0.2 yd per mph per bar residual drift over NSS's");
  console.log(`fit: a ${f1.a.toFixed(4)} / ${f2.a.toFixed(4)} / ${f3.a.toFixed(4)}, h ${f1.h.toFixed(5)} / ${f2.h.toFixed(5)} / ${f3.h.toFixed(5)} (truth ${truth.a.toFixed(4)}, ${truth.h}); a green row fits ${g1.a.toFixed(4)} with \`landed\`, ${g0.a.toFixed(4)} without; rows read through flatEnded a ${f4.a.toFixed(4)}, h ${f4.h.toFixed(5)}; c ${fc.c.toFixed(4)} from ${crossRows.length} crosswind rows`);
}

// ---- g. the putt solver's recorded numbers ----
// The grids, sizes and spots of the comparison that checked the move out of
// App.jsx (c8d3257), read as painted grids at a steepest slope of 10 %; the
// digest and the spot values recorded from src/putt.js when NSS's roll
// replaced WSR's (2026-10-25).
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
  // (the cup window src/nssShape.js holds: narrower since src/nsssim.js's cup decodes of 2026-10-25;
  // the putter's launch at its whole percent, and the read's aim window, since the same day; the read's runs
  // stepped in whole percents, its widening out to ±35° and the middle of its widest aims, also that day: the 24
  // solves read the same percents, 23 the same aim (one 0.01° apart) and 23 the same aim window (one end 0.1° apart))
  const REC = { sha: "1f457037253618ad2d7ea70b6d254c784a993d4aad5e24286afaaed7814d342a", len: 485087 };
  ok(sha === REC.sha && json.length === REC.len, `putts differ from the recorded ones (sha256 ${sha}, ${json.length} bytes)`);
  console.log(`putts: ${sims.length} simPutt + ${solves.length} solvePutt runs (${sims.filter((x) => x.r.holed).length} + ${solves.filter((x) => x.r.r.holed).length} holed) ${sha.slice(0, 12)}…, ${json.length} bytes`);
}

// ---- h. wind and elevation ----
{
  // h0. the wind: the dial's mph read as NSS's s (nsssim's HUD_MPH: RAM's s against the HUD's text)
  for (const [mph, s] of [[0, 0], [2, 1], [4, 2], [6, 3], [9, 4], [11, 5], [13, 6], [15, 7], [17, 8], [20, 9], [22, 10], [24, 11], [26, 12], [29, 13], [31, 14], [33, 15]]) ok(windS(mph) === s, `windS(${mph}) = ${windS(mph)}, expected ${s}`);
  ok(windS(8) === 4 && windS(18) === 8 && windS(27) === 12, `windS off the HUD's values: the nearest whole s (8 -> ${windS(8)}, 18 -> ${windS(18)}, 27 -> ${windS(27)})`);
  const w = windOf(11, 90);
  ok(w.s === 5 && Math.abs(w.vec.x - 5) < 1e-12 && Math.abs(w.vec.z) < 1e-12 && Math.abs(w.cross - 11) < 1e-12, `windOf(11 mph, 90): ${JSON.stringify(w)}`);
  const dr = byId.driver, calm = ask([dr], 220, "tee").recs[0];
  const tail = ask([dr], 220, "tee", {}, { speed: 13, deg: 0 }).recs[0], head = ask([dr], 220, "tee", {}, { speed: 13, deg: 180 }).recs[0];
  const right = ask([dr], 220, "tee", {}, { speed: 13, deg: 90 }).recs[0], left = ask([dr], 220, "tee", {}, { speed: 13, deg: 270 }).recs[0];
  ok(calm && tail && head && right && left, "the driver to 220 yd: a wind left no rec");
  if (calm && tail && head && right && left) {
    ok(tail.power < calm.power && calm.power < head.power, `the driver to 220 yd: tail ${tail.power.toFixed(3)} / calm ${calm.power.toFixed(3)} / head ${head.power.toFixed(3)} bars`);
    ok(right.aim < -1 && left.aim > 1 && Math.abs(right.aim + left.aim) < 0.05, `crosswind aims: right ${right.aim.toFixed(2)}, left ${left.aim.toFixed(2)} yd`);
    ok([tail, head, right, left].every((r) => r.elev === false && Math.abs(r.stop - 220) <= 3 && !r.approx), `windy recs without heights: flown, elev false, stopping within a percent of the distance (${[tail, head, right, left].map((r) => r.stop.toFixed(2)).join(" / ")})`);
    // stopAt with the solve's wind is the rec's stop (the rec card's bar)
    const ctxW = {}, rw = ask([dr], 220, "tee", ctxW, { speed: 13, deg: 90 }).recs[0];
    ok(Math.abs(stopAt(dr, rw.power, 0, ctxW) - rw.stop) < 1e-9, "stopAt with the last solve's wind is not the windy rec's stop");
    console.log(`wind: the driver to 220 yd from the tee: ${calm.power.toFixed(3)} bars calm, ${tail.power.toFixed(3)} in a 13 mph tail (s 6), ${head.power.toFixed(3)} head; 13 mph across aims ${(-right.aim).toFixed(1)} yd into it; full power 10 mph: tail ${stopAt(dr, 4, 10, { wind: { speed: 10, deg: 0 } }).toFixed(1)}, head ${stopAt(dr, 4, -10, { wind: { speed: 10, deg: 180 } }).toFixed(1)}, calm ${stopOf(dr, 4).toFixed(1)} yd`);
  }

  // h1. the profile ground: a level profile flies the plane (every club at full
  // power on every landing surface, to the bit), a 10 yd drop 0.5 yd behind the
  // ball changes nothing, a uniform 3-degree profile flies the tilted plane
  const ATTR = { fairway: 1, rough: 2, green: 6, fringe: 7, bunker: 3 };
  let worstFlat = 0, worstDrop = 0, worstTilt = 0;
  const flyProf = (id, prof) => { const t = NSS_SHAPE[id], v = S.PHYSICS.launchTable[t.club][99], L = t.loftDeg * DEG; return S.run({ club: t.club, v0: [0, v * Math.sin(L), -v * Math.cos(L)], lie: "fairway", start: [0, 0.05, 0], heading: 0, ...prof }); };
  for (const id of IDS) for (const s of ["fairway", "rough", "green", "fringe", "bunker"]) {
    const a = flyProf(id, { ground: plane(ATTR[s]) });
    const lp = lineProfile({ heightAt: () => 0, surfaceAt: () => s }), b = flyProf(id, { profile: simProfile(lp, 1) });
    worstFlat = Math.max(worstFlat, Math.abs(a.stop - b.stop), Math.abs(a.carry - b.carry), Math.abs(a.apex - b.apex));
    ok(a.ticks === b.ticks && a.bounces === b.bounces, `${id} on a level ${s} profile: ${b.ticks} ticks / ${b.bounces} bounces, the plane ${a.ticks} / ${a.bounces}`);
    const dp = lineProfile({ heightAt: (yd) => (yd < -0.5 ? -10 : 0), surfaceAt: () => s }), d = flyProf(id, { profile: simProfile(dp, 1) });
    worstDrop = Math.max(worstDrop, Math.abs(a.stop - d.stop), Math.abs(a.carry - d.carry));
  }
  ok(worstFlat === 0, `a level profile is ${worstFlat} m off the plane`);
  ok(worstDrop === 0, `a 10 yd drop 0.5 yd behind the ball is ${worstDrop} m off the plane`);
  const T3 = Math.tan(3 * DEG), tilt = [];
  for (const id of ["driver", "9iron", "wedge"]) {
    const res = [];
    for (const sgn of [-1, 1]) {
      const pp = lineProfile({ heightAt: (yd) => sgn * T3 * yd, surfaceAt: () => "fairway" }), a = flyProf(id, { profile: simProfile(pp, 1) });
      const n = [0, 1, sgn * T3], m = Math.hypot(...n);
      const b = flyProf(id, { ground: { heightAt: (x, z) => -sgn * T3 * z, normalAt: () => [0, 1 / m, (sgn * T3) / m], attrAt: () => 1 } });
      worstTilt = Math.max(worstTilt, Math.abs(a.stop - b.stop));
      res.push(a.stopYd.toFixed(1));
    }
    tilt.push(`${id} ${res.join(" / ")}`);
  }
  ok(worstTilt <= 0.01, `a 3-degree profile is ${worstTilt} m off the tilted plane`);
  console.log(`profile ground: level and a 10 yd drop behind the ball fly the plane to the bit (7 clubs x 5 surfaces); 3 degrees down / up ${tilt.join(", ")} yd, within ${worstTilt.toExponential(1)} m of the tilted plane`);

  // h2. a digest of 40 solver flights (random clubs, powers, lies, winds and
  // slopes, traced): the flight a rec stands on, as recorded
  {
    let s = 20261025;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const rows = [];
    for (let i = 0; i < 40; i++) {
      const cl = DEFAULT_CLUBS[i % 7], bars = 0.4 + 3.6 * rnd(), slope = (rnd() - 0.5) * 0.2, lie = ["tee", "fairway", "rough"][Math.floor(rnd() * 3)];
      const ctx = { heightAt: (yd) => slope * yd, surfaceAt: (yd) => (yd % 40 < 30 ? "fairway" : "rough"), wind: { speed: Math.floor(rnd() * 32), deg: Math.floor(rnd() * 360) }, lie };
      const f = M.flightOf(cl, bars, 0, ctx);
      rows.push([stopAt(cl, bars, 0, ctx), f.carry, f.k, f.path.length, f.path[f.path.length - 1]]);
    }
    const json = JSON.stringify(rows), sha = createHash("sha256").update(json).digest("hex");
    // (the HUD's wind as nsssim's table since 2026-10-25: a dial value off it reads as the nearest whole s, not mph / 2.25;
    // the launch at the whole percent the game reads, not between two, since the same day)
    const REC = { sha: "59d147928a41049478112cd0152af29a0b78ce4bff4650d281ec040feb5cc8a1", len: 4141 };
    ok(sha === REC.sha && json.length === REC.len, `the solver's flights differ from the recorded ones (sha256 ${sha}, ${json.length} bytes)`);
    console.log(`flights: 40 solver flights ${sha.slice(0, 12)}…, ${json.length} bytes`);
  }

  const c7 = byId["7iron"], lvl = (s = "fairway") => ({ heightAt: () => 0, surfaceAt: () => s });
  // h3. a full driver over a 20 yd step at 150 yd: down, it falls further and
  // carries longer; up, it lands on the step's top, short, and dh says which
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
  // full driver lands far below the tee on H21 and carries further than on
  // level ground, above it on H17 and carries less
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

  // h5. a level profile changes nothing in calm air: every flat rec comes back
  // at the table's percent (the flight at a percent is the table's entry, to
  // its 5 decimals), for 7 clubs, 5 landing surfaces, 3 lies and distances
  // 20-258 yd; where it does not (a percent of a like stop across a step
  // down, the refinement starting from the table's) the flown percent stops no
  // farther from the distance than the table's by more than 0.01 yd. The
  // profile may add a rec the table has not (a distance within STOP_TOL past a
  // floor or a step's foot): counted
  {
    let n = 0, same = 0, moved = 0, worse = 0, extra = 0;
    for (const s of ["fairway", "rough", "green", "fringe", "bunker"]) for (const lie of ["fairway", "rough", "bunker"]) for (const cl of DEFAULT_CLUBS) for (let d = 20; d <= 260; d += 7) {
      const a = ask([cl], d, lie, { surfaceAt: () => s }).recs[0], b = ask([cl], d, lie, lvl(s)).recs[0];
      ok(a == null || (a.elev === false && b && b.elev === true), `${cl.id} from ${lie} at ${d} yd on ${s}: the level profile ${b ? "flags" : "drops"} the flat rec`);
      if (a && b) {
        n++;
        if (a.pct === b.pct) same++;
        else {
          moved++;
          const ea = Math.abs(stopOf(cl, a.power, s) - d), eb = Math.abs(stopOf(cl, b.power, s) - d);
          if (eb > ea + 0.01) { worse++; ok(false, `${cl.id} from ${lie} at ${d} yd on ${s}: the level profile's ${b.pct} % stops ${eb.toFixed(3)} off, the table's ${a.pct} % ${ea.toFixed(3)}`); }
        }
      } else if (b) extra++;
    }
    console.log(`level profile: ${same} of ${n} recs at the table's percent, ${moved} at another no farther off (${worse} worse); ${extra} more within ${STOP_TOL} yd past a floor or a step's foot`);
  }

  // h6. H21's round trip: every exact rec (7 clubs from the tee at 30-260 yd)
  // solved again at its own stop comes back at its percent, or at one whose
  // flight stops within STOP_TOL of it (the terrain's stop need not rise
  // percent by percent)
  {
    let n = 0, same = 0, worst = 0;
    for (const cl of DEFAULT_CLUBS) for (let d = 30; d <= 260; d += 10) {
      const r = ask([cl], d, "tee", g21).recs[0];
      if (!r || r.approx) continue;
      const r2 = ask([cl], r.stop, "tee", g21).recs[0];
      n++;
      if (r2 && r2.pct === r.pct) { same++; ok(r2.stop === r.stop, `H21 round trip: ${cl.id} at ${r.pct} % flies differently`); continue; }
      const off = r2 ? Math.abs(r2.stop - r.stop) : Infinity;
      worst = Math.max(worst, off);
      ok(off <= STOP_TOL, `H21 round trip: ${cl.id} at ${d} yd ${r.pct} % stops ${r.stop.toFixed(2)}, which solves to ${r2 ? `${r2.pct} % stopping ${r2.stop.toFixed(2)}` : "nothing"}`);
    }
    console.log(`H21 round trip: ${n} recs solved again at their own stop, ${same} at their own percent, the rest stopping within ${worst.toFixed(3)} yd of it`);
  }

  // h7. the rest of the contract: the rec's stop is stopAt's (the rec card's
  // bar maps through it), maxReach is the clubs' top cap flight, a ball 1 yd
  // up carries further and lands 1 yd below itself, no heights in calm air
  // solve on the table (elev false, no stop), and a distance inside a jump (a
  // bank the ball rolls back from) gets the closest flight, flagged approx
  {
    const o = ask(DEFAULT_CLUBS, 180, "tee", g21);
    for (const r of o.recs) ok(Math.abs(stopAt(r.club, r.power, 0, g21) - r.stop) < 1e-9 && Math.abs(r.carry + r.roll - r.stop) < 1e-9, `H21 at 180 yd: ${r.club.id}'s stop ${r.stop} is not stopAt's`);
    const top = Math.max(...DEFAULT_CLUBS.map((cl) => stopAt(cl, capFor(cl, "tee"), 0, g21)));
    ok(o.maxReach && Math.abs(o.maxReach.yd - top) < 1e-9, `H21 maxReach ${o.maxReach?.yd}, the top cap flight ${top}`);
    const up = { ...lvl(), ballLift: 1 }, base = lvl();
    const r0 = ask([dr], stopAt(dr, 4, 0, base), "fairway", base).recs[0], r1 = ask([dr], stopAt(dr, 4, 0, up), "fairway", up).recs[0];
    ok(r0 && r1 && r1.carry > r0.carry && Math.abs(r1.dh + 1) < 1e-9 && Math.abs(r1.power - 4) < 0.01, `ballLift 1: carry ${r1?.carry} vs ${r0?.carry}, dh ${r1?.dh}`);
    for (const ctx of [{}, { surfaceAt: () => "rough" }, { surfaceAt: () => "rough", heightAt: () => null }]) {
      const x = ask(DEFAULT_CLUBS, 150, "tee", ctx);
      ok(x.recs.length > 0 && x.recs.every((r) => r.elev === false && r.stop == null), `no terrain heights in calm air (${Object.keys(ctx).join(", ") || "empty ctx"}): recs not from the table`);
    }
    const bank = { heightAt: (yd) => (yd < 100 ? 0 : yd < 102 ? (yd - 100) * 5 : 10), surfaceAt: () => "fairway" };
    const b = ask([c7], 102, "tee", bank).recs[0];
    ok(b && b.approx === true && Math.abs(b.stop - 102) > STOP_TOL && Math.abs(stopAt(c7, b.power, 0, bank) - b.stop) < 1e-9, `the 7-iron to 102 yd below a 10 yd bank at 100: ${b ? `${b.power.toFixed(3)} bars stops ${b.stop.toFixed(2)}, approx ${b.approx}` : "no rec"}`);
    console.log(`contract: ballLift 1 yd carries the full driver ${r1 ? (r1.carry - r0.carry).toFixed(2) : "?"} yd further; the 7-iron to 102 yd under a 10 yd bank: ${b ? `the closest flight stops ${b.stop.toFixed(1)} (approx)` : "no rec"}`);
  }

  // h8. the budget: one solve with 7 clubs on H21's line, from the tee at
  // 40-300 yd after a warm-up, calm and in a 13 mph crosswind. NSS's flight
  // costs about 0.5 ms (src/nsssim.js: float32 ticks, a profile contact every
  // tick) against WSR's port's 0.09, so the budget is 40 ms (mean and p90)
  {
    const BUDGET = 40;
    const time = (wind) => {
      for (let d = 40; d <= 300; d += 20) ask(DEFAULT_CLUBS, d, "tee", g21, wind);
      const ts = [];
      for (let rep = 0; rep < 2; rep++) for (let d = 40; d <= 300; d += 5) { const t0 = performance.now(); ask(DEFAULT_CLUBS, d, "tee", g21, wind); ts.push(performance.now() - t0); }
      ts.sort((a, b) => a - b);
      return { mean: ts.reduce((s, x) => s + x, 0) / ts.length, p90: ts[Math.floor(ts.length * 0.9)], max: ts[ts.length - 1], n: ts.length };
    };
    const c = time({}), w = time({ speed: 13, deg: 90 });
    ok(c.mean < BUDGET && c.p90 < BUDGET && w.mean < BUDGET && w.p90 < BUDGET, `a 7-club solve on H21's line takes ${c.mean.toFixed(2)} / ${w.mean.toFixed(2)} ms mean, ${c.p90.toFixed(2)} / ${w.p90.toFixed(2)} p90 (calm / wind; budget ${BUDGET})`);
    console.log(`budget: a 7-club solve on H21's line ${c.mean.toFixed(2)} ms mean, ${c.p90.toFixed(2)} p90, ${c.max.toFixed(2)} max calm; ${w.mean.toFixed(2)} / ${w.p90.toFixed(2)} / ${w.max.toFixed(2)} in a 13 mph crosswind, over ${c.n} solves each (budget ${BUDGET} ms)`);
  }
}

// ---- i. the parser ----
try {
  const { parse } = createRequire(join(root, "package.json"))("@babel/parser");
  for (const f of ["src/App.jsx", "src/model.js", "src/putt.js", "src/nsssim.js", "src/nssShape.js"]) {
    try { parse(readFileSync(join(root, f), "utf8"), { sourceType: "module", plugins: ["jsx"] }); }
    catch (e) { ok(false, `${f} does not parse: ${e.message}`); }
  }
  console.log("parse: App.jsx, model.js, putt.js, nsssim.js, nssShape.js");
} catch { console.log("parse: skipped (no @babel/parser here)"); }

console.log(fails ? `${fails} FAILURES` : "all solver checks passed");
process.exit(fails ? 1 : 0);
