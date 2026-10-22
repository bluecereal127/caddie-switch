// Offline checks of playbook.mjs's adjustPower and lookupNear (no Dolphin,
// nothing written: the solve files, the pins index and the live rounds'
// attempt files are only read; round-model.mjs flies every stroke).
// 1. adjustPower at perturbed aims: every solved cup's holing stroke, its
//    reached aim moved by +-0.01, +-0.02, +-0.035 deg (the live rounds' D-pad
//    reached 0.008-0.035 deg off the solve's): does the model hole the solve's
//    launch power there (unadjusted) and adjustPower's (adjusted)? Then every
//    setup stroke so: its no-cup rest's distance from the solve's rest (as the
//    model's replay of the solve's stroke puts it), unadjusted and adjusted.
// 2. lookupNear on the live rounds' own cases (results/playbook/<slug>/
//    attempt-N.json: a playbook stroke whose next stroke no longer matched
//    POS_TOL, so that stroke fell to the planner): the plan for that next
//    stroke from the ball where it really lay, whether the model holes it as
//    planned and after a D-pad miss of +-0.01 to +-0.029 deg corrected by
//    adjustPower, against what the planner's stroke did in the game. The three
//    named cases (h16-s2, h01-s1, h07-s1) first; a named case with no attempt
//    row is made from the solve's stroke-1 rest moved by the logged amount
//    (0.05 / 0.177 / 0.10 yd) in eight directions, the ball's y from the KCL.
// 3. lookupNear's contract: null in wind, for another pin, another kind of
//    lie, a ball beyond its tolerance; the answer kept for the spot (the ready
//    state finds the plan made ahead: same id, at once); budgets cut short
//    (150 / 400 / 900 ms: still a plan the model holes, ranked on a cell whose
//    neighbourhood was flown whole); the fields round-play.mjs reads; lookup()'s
//    plan unchanged but its added solve fields; adjustPower without a state or
//    a plan keeps the plan's power.
// --sweep: also every solved later stroke's start moved 0.05 and 0.18 yd in
//    four directions (each kind of stroke: does the model hole a holing
//    plan, how near the solve's rest a setup plan comes).
//   node tools/harness/test-playbook-robust.mjs [--pb FILE] [--only REGEX] [--sweep] [--quick]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const PBFILE = path.resolve(arg("--pb", path.join(HERE, "playbook.mjs")));
const ONLY = arg("--only", null) ? new RegExp(arg("--only", null)) : null;
const QUICK = process.argv.includes("--quick"), SWEEP = process.argv.includes("--sweep");
const PB = await import(pathToFileURL(PBFILE).href);
const RM = await PB.model();
const DEG = Math.PI / 180, YD = 9.144, CALM = { dir: 0, speedIdx: 0 };
const holes = PB.holes;
let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL ${m}`); };
const check = (ok, m) => { if (!ok) fail(m); return ok; };
const head = (m) => console.log(`\n== ${m}`);
const stOf = (pos, pin, lie, wind = CALM) => ({ ball: { pos, life: 0, moving: 0 }, pin, player: { lie }, wind });
const fly = (hole, ball, heading, club, power, lie, pin) => RM.predict({ hole, ball, heading, club, power, lie, wind: CALM, pin });
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (a, b) => `${a}/${b}`;
console.log(`playbook: ${path.relative(process.cwd(), PBFILE) || PBFILE}`);

const sols = PB.solutions().filter((s) => !ONLY || ONLY.test(s.cup));
const st0 = PB.stats();
console.log(`${st0.solved} solved cups, ${st0.strokes} strokes${ONLY ? `; ${sols.length} by --only` : ""}`);

// ---- 1. adjustPower at perturbed aims ----
head("1. adjustPower: the aim the D-pad reached moved off the solve's");
const DELTAS = QUICK ? [-0.035, 0.035] : [-0.035, -0.02, -0.01, 0.01, 0.02, 0.035];
const per = new Map(DELTAS.map((d) => [d, { n: 0, un: 0, adj: 0 }]));
const adjMs = [], lostByAdj = [], gainedByAdj = [], stillMiss = [];
let nHole = 0, modelHolesSolve = 0, exactOk = 0, changed = 0, kept = 0;
for (const sol of sols) {
  const s = sol.strokes[sol.strokes.length - 1];
  const st = stOf(s.from, sol.pin, s.lie);
  const pb = PB.lookup(sol.hole, st);
  nHole++;
  if (!check(pb && pb.cup === sol.cup && pb.k === s.k && pb.holed, `${sol.cup}: the exact lookup of its holing stroke gave ${pb ? `${pb.cup} ${pb.k}` : "null"}`)) continue;
  exactOk++;
  const gp = s.gamePower ?? s.power;
  if (holes(fly(sol.hole, s.from, s.reached, s.club, gp, s.lie, sol.pin))) modelHolesSolve++;
  for (const dd of DELTAS) {
    const hr = s.reached + dd * DEG;
    const un = holes(fly(sol.hole, s.from, hr, s.club, gp, s.lie, sol.pin));
    const a = await PB.adjustPower(sol.hole, st, pb, hr);
    adjMs.push(a.ms);
    const ad = Number.isFinite(a.launch) && holes(fly(sol.hole, s.from, hr, s.club, a.launch, s.lie, sol.pin));
    if (a.kept) kept++; else if (a.launch !== gp) changed++;
    const c = per.get(dd);
    c.n++; if (un) c.un++; if (ad) c.adj++;
    const tag = `${sol.cup} ${s.club} ${dd >= 0 ? "+" : ""}${dd}`;
    if (un && !ad) lostByAdj.push(`${tag}: ${gp.toFixed(4)} holes, adjusted ${a.launch?.toFixed(4)} misses (${a.why})`);
    if (!un && ad) gainedByAdj.push(`${tag}: ${gp.toFixed(4)} -> ${a.launch.toFixed(4)}`);
    if (!ad) stillMiss.push(`${tag}: ${a.why}`);
    // the power passed to shoot() carries the solve's own offset
    check(Number.isFinite(a.power) && Math.abs((a.power - s.power) - ((a.launch ?? gp) - gp) * (Math.abs(gp - s.power) <= 0.002 ? 1 : s.power / gp)) < 1e-9, `${tag}: shoot power ${a.power} for launch ${a.launch}`);
  }
}
const tot = [...per.values()].reduce((t, c) => ({ n: t.n + c.n, un: t.un + c.un, adj: t.adj + c.adj }), { n: 0, un: 0, adj: 0 });
console.log(`  ${pct(exactOk, nHole)} holing strokes found by lookup at their own start; the model holes ${pct(modelHolesSolve, exactOk)} of them as the solve struck them`);
for (const [dd, c] of per) console.log(`  aim ${dd >= 0 ? "+" : ""}${dd.toFixed(3)} deg: the solve's power still holes ${pct(c.un, c.n)}, adjustPower's ${pct(c.adj, c.n)}`);
console.log(`  all: unadjusted ${pct(tot.un, tot.n)} hole, adjusted ${pct(tot.adj, tot.n)}; adjustPower changed the launch power on ${changed}, kept the solve's on ${kept} (the model holes nothing near it at the solve's own aim)`);
console.log(`  adjustPower time: mean ${mean(adjMs).toFixed(0)} ms, p90 ${q(adjMs, 0.9)} ms, max ${Math.max(...adjMs)} ms (a course's first flight loads it, 20-400 ms)`);
if (gainedByAdj.length) console.log(`  holed only adjusted (${gainedByAdj.length}): ${gainedByAdj.slice(0, 12).join("; ")}${gainedByAdj.length > 12 ? " ..." : ""}`);
if (lostByAdj.length) console.log(`  holed only unadjusted (${lostByAdj.length}):\n    ${lostByAdj.join("\n    ")}`);
if (stillMiss.length) console.log(`  missing adjusted too (${stillMiss.length}):\n    ${stillMiss.slice(0, 20).join("\n    ")}${stillMiss.length > 20 ? "\n    ..." : ""}`);
check(tot.adj >= tot.un, `adjusted ${tot.adj} < unadjusted ${tot.un}`);
check(q(adjMs, 0.9) < 1000, `adjustPower's p90 ${q(adjMs, 0.9)} ms`);

// setups
const setupRows = [];
for (const sol of sols) for (const s of sol.strokes.filter((x) => !x.holed)) {
  const st = stOf(s.from, sol.pin, s.lie);
  const pb = PB.lookup(sol.hole, st);
  if (!check(pb && pb.k === s.k && !pb.holed, `${sol.cup} setup ${s.k}: lookup gave ${pb ? pb.k : "null"}`)) continue;
  const gp = s.gamePower ?? s.power;
  const T = fly(sol.hole, s.from, s.reached, s.club, gp, s.lie, null).rest;   // the model's replay of the solve's stroke
  const game = [s.rest[0], s.rest[2]];
  const replayOff = Math.hypot(T[0] - game[0], T[1] - game[1]) / YD;
  const tgt = replayOff <= 1 ? T : game;
  for (const dd of QUICK ? [0.035] : [-0.035, 0.035]) {
    const hr = s.reached + dd * DEG;
    const r0 = fly(sol.hole, s.from, hr, s.club, gp, s.lie, null).rest;
    const a = await PB.adjustPower(sol.hole, st, pb, hr);
    const r1 = fly(sol.hole, s.from, hr, s.club, a.launch, s.lie, null).rest;
    const d0 = Math.hypot(r0[0] - tgt[0], r0[1] - tgt[1]) / YD, d1 = Math.hypot(r1[0] - tgt[0], r1[1] - tgt[1]) / YD;
    setupRows.push({ cup: sol.cup, k: s.k, club: s.club, dd, d0, d1, ms: a.ms, dq: a.launch - gp, replayOff });
  }
}
if (setupRows.length) {
  console.log(`  setups (${setupRows.length} at +-0.035 deg): the no-cup rest from the solve's rest (the model's replay), unadjusted median ${q(setupRows.map((r) => r.d0), 0.5).toFixed(3)} yd / max ${Math.max(...setupRows.map((r) => r.d0)).toFixed(3)}, adjusted median ${q(setupRows.map((r) => r.d1), 0.5).toFixed(3)} / max ${Math.max(...setupRows.map((r) => r.d1)).toFixed(3)}; the launch power moved ${q(setupRows.map((r) => Math.abs(r.dq)), 0.5).toFixed(4)} median, ${Math.max(...setupRows.map((r) => Math.abs(r.dq))).toFixed(4)} max; ${mean(setupRows.map((r) => r.ms)).toFixed(0)} ms mean`);
  const worse = setupRows.filter((r) => r.d1 > r.d0 + 1e-6);
  console.log(`  the model's replay of the solve's setup rests ${q(setupRows.map((r) => r.replayOff), 0.5).toFixed(3)} yd from the game's rest median, ${Math.max(...setupRows.map((r) => r.replayOff)).toFixed(2)} max; adjusted further from the target than unadjusted: ${worse.length}${worse.length ? ` (${worse.map((r) => `${r.cup}.${r.k} ${r.d0.toFixed(3)} -> ${r.d1.toFixed(3)}`).join(", ")})` : ""}`);
  check(!worse.length, "an adjusted setup rests further from its target");
}

// ---- 2. lookupNear on the live rounds' cases ----
head("2. lookupNear: the live rounds' strokes after a playbook stroke that moved off the solve's rest");
const NAMED = { "h16-s2": 0.461 / YD, "h01-s1": 1.62 / YD, "h07-s1": 0.922 / YD };
const cases = [];
const PLAYDIR = path.join(HERE, "results", "playbook");
if (fs.existsSync(PLAYDIR)) for (const slug of fs.readdirSync(PLAYDIR)) {
  const dir = path.join(PLAYDIR, slug);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir).filter((x) => /^attempt-\d+\.json$/.test(x)).sort()) {
    let r;
    try { r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }   // a round still writing it
    for (const [h, rec] of Object.entries(r.holes ?? {})) {
      const rows = rec.strokes ?? [];
      for (let i = 0; i + 1 < rows.length; i++) {
        const a = rows[i], b = rows[i + 1];
        // a setup played from the playbook whose next stroke fell to the planner
        // (a holing stroke that missed has no solved stroke after it)
        if (!a.playbook || a.playbook.holed || a.holed || b.playbook) continue;
        if (b.wind && b.wind.speedIdx !== 0) continue;
        const key = `${a.playbook.cup}.${a.playbook.k + 1}@${b.from[0].toFixed(3)},${b.from[2].toFixed(3)},${b.lie}`;
        const same = cases.find((c) => c.key === key);
        if (same) { same.also.push(`${slug}/${f}`); if (b.holed) same.game.holedAlso++; continue; }
        cases.push({ key, also: [], src: `${slug}/${f}`, hole: Number(h), cup: a.playbook.cup, k: a.playbook.k + 1, from: b.from, lie: b.lie, pin: b.pin, wind: b.wind, restOffU: a.playbook.restOffU, game: { club: b.club, holed: b.holed, holedAlso: 0, after: b.after, why: b.plan?.why } });
      }
    }
  }
}
// a named case with no attempt row: the solve's stroke-1 rest moved by the logged amount
for (const [cup, yd] of Object.entries(NAMED)) {
  if (cases.some((c) => c.cup === cup)) continue;
  const sol = PB.solutions().find((x) => x.cup === cup);
  if (!sol) continue;
  const s1 = sol.strokes[0], s2 = sol.strokes[1];
  const course = RM.loadCourse(sol.hole);
  for (let a = 0; a < 8; a++) {
    const x = s1.rest[0] + yd * YD * Math.sin((a * Math.PI) / 4), z = s1.rest[2] + yd * YD * Math.cos((a * Math.PI) / 4);
    const g = RM.groundAt(course, x, z);
    cases.push({ src: `synthetic (the solve's rest + ${yd.toFixed(3)} yd at ${45 * a} deg)`, hole: sol.hole, cup, k: 2, from: [x, g ? g.y + 0.5 : s2.from[1], z], lie: s2.lie, pin: sol.pin, wind: CALM, restOffU: yd * YD, game: null });
  }
}
cases.sort((a, b) => (b.cup in NAMED) - (a.cup in NAMED) || a.cup.localeCompare(b.cup));
const nearMs = [], dpadRows = [];
let nearN = 0, nearPlans = 0, nearHoles = 0, namedPlans = 0, namedN = 0;
for (const c of cases) {
  if (ONLY && !ONLY.test(c.cup)) continue;
  const st = stOf(c.from, c.pin, c.lie, c.wind ?? CALM);
  const sol = PB.solutions().find((x) => x.cup === c.cup), s = sol?.strokes.find((x) => x.k === c.k);
  if (!sol || !s) { console.log(`  ${c.cup} ${c.k} (${c.src}): no such solved stroke`); continue; }
  nearN++;
  const named = c.cup in NAMED;
  if (named) namedN++;
  const exact = PB.lookup(c.hole, st);
  const dYd = Math.hypot(c.from[0] - s.from[0], c.from[2] - s.from[2]) / YD;
  const t = performance.now();
  const pl = await PB.lookupNear(c.hole, st);
  const ms = performance.now() - t;
  nearMs.push(ms);
  const gameTxt = c.game ? `; in the game the planner's ${c.game.club} ${c.game.holed ? "HOLED" : `rested ${c.game.after} yd from the pin`}${c.also?.length ? ` (the same spot in ${c.also.length} more attempt${c.also.length > 1 ? "s" : ""}, holed in ${c.game.holedAlso})` : ""}` : "";
  console.log(`  ${named ? "*" : " "} ${c.cup} stroke ${c.k} (${c.src}): the ball ${dYd.toFixed(3)} yd from the solve's start, lie ${c.lie}${exact ? ` (lookup found ${exact.cup} ${exact.k}!)` : ""}${gameTxt}`);
  if (!pl) { console.log(`      lookupNear: null (${ms.toFixed(0)} ms)`); continue; }
  nearPlans++;
  if (named) namedPlans++;
  console.log(`      ${pl.why}`);
  if (pl.holed) {
    const p = fly(c.hole, c.from, pl.heading, pl.club, pl.gamePower, c.lie, c.pin);
    const ok = holes(p);
    if (ok) nearHoles++;
    // the D-pad's reach: within 0.029 deg of the request, then adjustPower
    const ds = [-0.029, -0.02, -0.01, 0.01, 0.02, 0.029];
    let dn = 0, un = 0;
    for (const dd of ds) {
      const hr = pl.heading + dd * DEG;
      const a = await PB.adjustPower(c.hole, st, pl, hr);
      if (holes(fly(c.hole, c.from, hr, pl.club, a.launch, c.lie, c.pin))) dn++;
      if (holes(fly(c.hole, c.from, hr, pl.club, pl.gamePower, c.lie, c.pin))) un++;
    }
    dpadRows.push({ cup: c.cup, dn, un, n: ds.length });
    console.log(`      the model ${ok ? "HOLES" : "MISSES"} it as planned (cupPass ${p.cupPass ? `d ${p.cupPass.d.toFixed(3)} yd at ${p.cupPass.v.toFixed(2)} yd/s, h ${p.cupPass.h.toFixed(2)} u` : "none"}); the D-pad off by +-0.01..0.029 deg: ${pct(dn, ds.length)} hole adjusted, ${pct(un, ds.length)} at the planned power; ${ms.toFixed(0)} ms`);
  } else {
    const p = fly(c.hole, c.from, pl.heading, pl.club, pl.gamePower, c.lie, null);
    const T = pl.near.target;
    console.log(`      a setup: the model rests ${(Math.hypot(p.rest[0] - T[0], p.rest[1] - T[1]) / YD).toFixed(3)} yd from the solve's rest (${p.restLie}); ${ms.toFixed(0)} ms`);
  }
  // the ready state: the plan made ahead is found again (the ball settles: y only)
  const t2 = performance.now();
  const again = await PB.lookupNear(c.hole, stOf([c.from[0], c.from[1] - 0.003, c.from[2]], c.pin, c.lie, c.wind ?? CALM));
  check(again === pl || (again && again.near?.id === pl.near.id), `${c.cup} ${c.k}: the ready state's lookupNear gave another plan`);
  if (nearPlans === 1) console.log(`      (the same spot at ready: the same plan in ${(performance.now() - t2).toFixed(2)} ms)`);
}
console.log(`  ${nearN} cases: a plan for ${nearPlans} (the named three's: ${pct(namedPlans, namedN)}), the model holes ${nearHoles} of the holing plans as planned; lookupNear ${mean(nearMs).toFixed(0)} ms mean, ${Math.max(...nearMs, 0).toFixed(0)} ms max`);
if (dpadRows.length) console.log(`  after a D-pad miss of +-0.01..0.029 deg: adjusted ${pct(dpadRows.reduce((t, r) => t + r.dn, 0), dpadRows.reduce((t, r) => t + r.n, 0))} hole, at the planned power ${pct(dpadRows.reduce((t, r) => t + r.un, 0), dpadRows.reduce((t, r) => t + r.n, 0))}`);
check(namedN === 0 || namedPlans === namedN, "a named case without a plan");
check(Math.max(...nearMs, 0) < PB.NEAR_BUDGET_MS + 500, `lookupNear took ${Math.max(...nearMs, 0).toFixed(0)} ms`);

// ---- 3. lookupNear's contract ----
head("3. lookupNear: the null cases and the fields round-play reads");
{
  const sol = PB.solutions().find((x) => x.cup === "h01-s1") ?? PB.solutions().find((x) => x.strokes.length >= 2);
  const s2 = sol.strokes[1];
  const off = (u, a = 0) => [s2.from[0] + u * Math.sin(a), s2.from[1], s2.from[2] + u * Math.cos(a)];
  const base = stOf(off(1.0), sol.pin, s2.lie);
  const pl = await PB.lookupNear(sol.hole, base);
  const windy = await PB.lookupNear(sol.hole, stOf(off(1.0), sol.pin, s2.lie, { dir: 2, speedIdx: 5 }));
  const otherPin = await PB.lookupNear(sol.hole, stOf(off(1.0), [sol.pin[0] + 3, sol.pin[1], sol.pin[2]], s2.lie));
  const otherLie = await PB.lookupNear(sol.hole, stOf(off(1.0), sol.pin, s2.lie === 2 ? 1 : 2));
  const far = await PB.lookupNear(sol.hole, stOf(off(3.2 * YD), sol.pin, s2.lie));
  const bad = [await PB.lookupNear(sol.hole, {}), await PB.lookupNear(sol.hole, null), await PB.lookupNear(sol.hole, { ball: { pos: s2.from }, pin: sol.pin, player: {} })];
  const t = performance.now();
  const memoHit = await PB.lookupNear(sol.hole, stOf([s2.from[0] + Math.sin(0) * 1.0 + 0.03, s2.from[1] + 0.01, s2.from[2] + 1.0], sol.pin, s2.lie));
  const tMemo = performance.now() - t;
  const moved = await PB.lookupNear(sol.hole, stOf(off(1.0 + 0.06), sol.pin, s2.lie));
  // a budget cut short (the ready state's, on a busy machine): a plan still,
  // ranked on the cells whose neighbourhoods were flown whole, that the model holes
  const starved = [];
  for (const [k, ms] of [[0, 150], [1, 400], [2, 900]]) {
    const p = await PB.lookupNear(sol.hole, stOf(off(0.6 + 0.2 * k, 1.1), sol.pin, s2.lie), { budgetMs: ms });
    const ok = p && p.holed ? holes(fly(sol.hole, p.near.from, p.heading, p.club, p.gamePower, s2.lie, sol.pin)) : null;
    starved.push({ ms, plan: !!p, ok, complete: p?.near?.cell?.complete ?? null, truncated: p?.near?.truncated ?? null, took: p?.near?.ms ?? null, robust: p?.near?.cell?.robust ?? null });
  }
  console.log(`  budgets cut short: ${starved.map((x) => `${x.ms} ms -> ${x.plan ? `a plan in ${x.took} ms${x.truncated ? " (cut short)" : ""}, ${Math.round(100 * x.robust)}% robust on ${x.complete ? "a whole" : "a PART"} neighbourhood, the model ${x.ok ? "holes" : "MISSES"} it` : "null"}`).join("; ")}`);
  check(starved.every((x) => !x.plan || (x.ok && x.complete)), "a budget cut short gave a plan the model misses, or ranked on a part neighbourhood");
  console.log(`  ${sol.cup} stroke 2, 1 u off: ${pl ? `${pl.club} ${pl.power.toFixed(4)} (${pl.near.ms} ms)` : "null"}; 10 mph wind null ${windy === null}; another pin null ${otherPin === null}; another kind of lie null ${otherLie === null}; 3.2 yd off null ${far === null}; malformed null ${bad.every((x) => x === null)}`);
  console.log(`  the same spot again (0.03 u over, y settled): ${memoHit === pl ? "the same plan" : "ANOTHER plan"} in ${tMemo.toFixed(2)} ms; 0.06 u further: ${moved && moved !== pl ? "planned again" : moved === pl ? "the same plan (WRONG)" : "null"}`);
  check(pl && windy === null && otherPin === null && otherLie === null && far === null && bad.every((x) => x === null), "lookupNear's null cases");
  check(memoHit === pl && moved !== pl, "lookupNear's memo");
  const need = ["club", "power", "heading", "reached", "gamePower", "holed", "rest", "k", "cup", "of", "why", "expect", "near", "solve"];
  const miss = need.filter((f) => pl?.[f] === undefined);
  check(pl && !miss.length && pl.why.startsWith(`[playbook-near ${sol.cup} 2]`) && pl.expect.src === "playbook-near" && pl.reached === pl.heading && Number.isFinite(pl.near.yd) && typeof pl.near.id === "string", `the plan's fields: missing ${miss.join(", ")}`);
  // the exact lookup is unchanged where it matched, and carries the solved stroke
  const ex = PB.lookup(sol.hole, stOf(s2.from, sol.pin, s2.lie));
  check(ex && ex.k === 2 && ex.solve && ex.solve.gamePower === s2.gamePower && ex.solve.reached === s2.reached && !ex.near, "lookup()'s plan and its solve fields");
  // adjustPower with the plan's own reach changes nothing in effect
  const a0 = await PB.adjustPower(sol.hole, stOf(s2.from, sol.pin, s2.lie), ex, ex.reached);
  console.log(`  adjustPower at the solve's own aim: launch ${a0.launch?.toFixed(5)} against the solve's ${s2.gamePower.toFixed(5)} (${a0.ms} ms): ${a0.why}`);
  const a1 = await PB.adjustPower(sol.hole, null, ex, ex.reached), a2 = await PB.adjustPower(sol.hole, stOf(s2.from, sol.pin, s2.lie), null, 1);
  check(a1.kept && a1.power === ex.power && a2.kept, "adjustPower without a state or a plan keeps the plan's power");
}

// ---- --sweep ----
if (SWEEP) {
  head("--sweep: every solved later stroke's start moved 0.05 and 0.18 yd in four directions");
  const rows = [];
  for (const sol of sols) for (const s of sol.strokes.filter((x) => x.k > 1)) {
    const course = RM.loadCourse(sol.hole);
    for (const yd of [0.05, 0.18]) for (let a = 0; a < 4; a++) {
      const x = s.from[0] + yd * YD * Math.sin((a * Math.PI) / 2 + 0.3), z = s.from[2] + yd * YD * Math.cos((a * Math.PI) / 2 + 0.3);
      const g = RM.groundAt(course, x, z);
      const ball = [x, g ? g.y + 0.5 : s.from[1], z];
      const st = stOf(ball, sol.pin, s.lie);
      const t = performance.now();
      const pl = await PB.lookupNear(sol.hole, st);
      const ms = performance.now() - t;
      let ok = null, restYd = null;
      if (pl && pl.holed) ok = holes(fly(sol.hole, ball, pl.heading, pl.club, pl.gamePower, s.lie, sol.pin));
      else if (pl) { const p = fly(sol.hole, ball, pl.heading, pl.club, pl.gamePower, s.lie, null); restYd = Math.hypot(p.rest[0] - pl.near.target[0], p.rest[1] - pl.near.target[1]) / YD; }
      rows.push({ cup: sol.cup, k: s.k, holed: s.holed, yd, plan: !!pl, ok, restYd, ms });
    }
  }
  const hRows = rows.filter((r) => r.holed), sRows = rows.filter((r) => !r.holed);
  console.log(`  holing strokes: ${hRows.length} starts, a plan for ${hRows.filter((r) => r.plan).length}, the model holes ${hRows.filter((r) => r.ok).length} (0.05 yd: ${hRows.filter((r) => r.yd === 0.05 && r.ok).length}/${hRows.filter((r) => r.yd === 0.05).length}, 0.18 yd: ${hRows.filter((r) => r.yd === 0.18 && r.ok).length}/${hRows.filter((r) => r.yd === 0.18).length}); ${mean(hRows.map((r) => r.ms)).toFixed(0)} ms mean, ${Math.max(...hRows.map((r) => r.ms), 0).toFixed(0)} max`);
  if (sRows.length) console.log(`  setup strokes: ${sRows.length} starts, a plan for ${sRows.filter((r) => r.plan).length}, resting ${q(sRows.filter((r) => r.plan).map((r) => r.restYd), 0.5).toFixed(3)} yd median / ${Math.max(...sRows.filter((r) => r.plan).map((r) => r.restYd), 0).toFixed(3)} max from the solve's rest; ${mean(sRows.map((r) => r.ms)).toFixed(0)} ms mean`);
  const none = hRows.filter((r) => !r.plan || !r.ok);
  if (none.length) console.log(`  holing starts without a model hole: ${none.map((r) => `${r.cup}.${r.k}@${r.yd}`).join(", ")}`);
}

console.log(`\n${failures ? `${failures} FAILED` : "all checks passed"}`);
process.exit(failures ? 1 : 0);
