// The savestate campaign's solutions as a playbook for natural rounds in no
// wind. hole-solve.mjs played every WSR cup of holes 1-18 from its tee state,
// calm, to its target (aces, eagles, hole 14's albatross), every stroke a real
// swing through the game's pipeline, and wrote the strokes that made it to
// results/solve/hHH-sN.json. The game is deterministic (the same club, power,
// aim and wind from the same spot rest alike), so a natural round whose ball
// stands on one of those strokes' spots, with that cup's pin, the same lie
// and no wind, can play that stroke again. round-play.mjs asks here before
// the planner when the course's wind is set calm.
//
//   lookup(hole, st) -> null | { club, power, heading, k, cup, why, ... }
//
// The match (every condition, else null):
// - no wind: st.wind.speedIdx 0 (the solutions were played calm);
// - the pin: st.pin within PIN_TOL = 1 u (horizontally) of a solved cup's pin
//   (state/saves/pins/index.json cups[cup].pinRam, the pin the campaign
//   measured every try's toPin against; a hole's cups stand 30 u apart at
//   the least, H7 s1 and s3);
// - the ball: st.ball.pos within POS_TOL of the spot one of the solution's
//   strokes was struck from, in x and z (y not compared: the ball settles by
//   up to 0.042 u between its rest and the next stroke's address);
// - the lie: st.player.lie equal to the game's lie at that stroke (15 on a tee).
// POS_TOL = 0.05 u (5 mm): an exact replay puts the ball on the solve's spot
// to the bit (the campaign's 89 stroke-to-stroke handovers: every next start
// equals the last rest in x and z exactly; float32 resolves 0.00024 u at the
// course's 2,000 u), while any different swing moves its rest far more (one
// frame of D-pad turn, 0.00035 rad, moves a 50 yd rest 0.16 u; 0.001 of a
// 9-iron's power about 1 u). So the playbook plays only true replays, and a
// ball anywhere else goes to the planner.
//
// What it returns, per stroke of a solution:
// - club: the club the game struck (hole-solve's clubNow after the D-pad);
// - power: what hole-solve passed to shoot() (not gamePower, the game's
//   launch power: the pipeline turns the same power into the same launch);
// - heading: the heading hole-solve REQUESTED of round-play's dpadAim, the
//   reached heading plus aimErrDeg (aim.err = target - reached). dpadAim is a
//   closed loop of counted D-pad holds that stops anywhere within 0.0005 rad
//   (0.029 deg) of its target, or after 12 passes: the target decides every
//   pass (the remaining turn, the frames held, when it stops), so the same
//   target from the same default aim replays the same holds and reaches the
//   same float. In the campaign 276 of 276 pairs of tries that repeated a
//   requested heading from one spot reached the identical heading, while of
//   83 requests lying within 0.01 deg of a heading another try had reached
//   from the same spot, 17 ended on another heading (12 of the 46 within
//   0.002 deg): asking for the reached heading does not reproduce it
//   (tools/harness/test-playbook.mjs prints both). It is kept in `reached`.
// Extra fields: reached, gamePower, aimErrDeg, of (the solution's strokes),
// target, par, holed, rest, toPin (after the stroke, yd), file, offYd, and
// expect (for the round's row and course-notes.mjs: restLie, toPin, aimDeg,
// distance, and playbook: the cup, the stroke and what it did).
//
// The files are re-read when they change (mtime and size, checked on every
// lookup: a readdir and ~110 stats), as round-play re-imports the planner; a
// file that does not parse (a write in progress) keeps its last good reading
// and is read again on the next lookup. Only results with solved true count.
//
// createPlaybook({ solveDir, pinIndex }) makes another instance over other
// files (tools/harness/test-playbook.mjs tests the reloading on copies).
//
// Off the solved stroke (2026-10-22). The live rounds' first strokes: the
// D-pad reached aims 0.008-0.035 deg off the solve's (the game's starting aim
// and the press timing differ from the solve's run) with the same launch
// power; two par 3 aces still holed (h13-s1, h04-s1: windows 0.2-0.3 yd
// wide), three tee shots (h16-s2, h01-s1, h07-s1) rested 0.05-0.18 yd from
// the solve's rest, so their second strokes no longer matched POS_TOL and fell
// to the planner, which does not search for a hole. Two answers, both flying
// round-model.mjs's ball (WSR's over the disc's KCL, 0.02 yd median error;
// imported on first use: the very module instance round-planner.mjs loaded,
// so its courses are shared) in calm wind with the pin:
//   adjustPower(hole, st, pb, reachedHeading) -> Promise<{ power, launch, why, ms, kept? }>
//     the power for the aim the D-pad actually reached, from st's ball and lie.
//     power is what to pass shoot() (the launch power through the solved
//     stroke's own pair of power swung and launched); launch the model's.
//     - A holing stroke (pb.holed): launch powers round the plan's (+-0.02 by
//       0.0005, inside the lie's cap and the game's floor: putter 0.05, other
//       clubs 0.1 x cap) at the reached heading; the middle of the longest run
//       that holes by holes() (hole-solve.mjs's rule: the ball rolling into the
//       cup, no flagstick hit faster than 3.4 yd/s; ties to the run nearest the
//       plan's power), else the power whose no-cup rest is nearest the pin. An
//       exact plan first asks whether the model holes the solve's own stroke at
//       the solve's own aim (98 of the 103 solved holing strokes): where it does
//       not, the game's power sits off the model's run by some offset, which is
//       carried over to the reached aim's run (that run nearest the model's own
//       at the solve's aim); with no model run there at all the solve's power
//       is kept.
//     - A setup stroke: the power whose no-cup rest at the reached heading is
//       nearest the solve's rest, as the model's own replay of the solve's
//       stroke puts it (its rest from the solve's spot, so the model's local
//       error cancels; the game's rest itself when that replay rests over
//       SETUP_REPLAY_YD from it), hazards last; launch powers every 0.002
//       within 0.02 of the plan's, then every 0.0005 round the best.
//   lookupNear(hole, st, { tolYd = 3, budgetMs }) -> Promise<null | lookup()'s shape + near>
//     for a ball lookup() does not place (call it when lookup returns null): the
//     nearest solved stroke whose start lies within tolYd of the ball, and
//     within NEAR_REL of that stroke's own distance to the pin (a translated
//     stroke is a fair seed only while the shift is small against the stroke),
//     with the same pin and a lie of the same kind (green; rough; bunker; or
//     any full lie: tee, fairway, fringe), in no wind, and a plan from the ball:
//     - a holing stroke: the solved stroke translated (the stroke from here
//       whose no-cup rest is that stroke's own, Gauss-Newton on power and aim),
//       then the grid round it, power +-0.015 by 0.0005 and aim +-0.4 deg by
//       0.01, holing by holes(); the most robust holing cell as hole-solve's
//       holingCells counts it (the share of its 5x5 neighbours that hole), ties
//       to the cell whose neighbouring aims (+-0.03 deg, the D-pad's reach)
//       hold runs, then the longer run, the cell nearer its run's middle, the
//       cell nearer the grid's centre. The grid is flown out from every holing
//       cell to all its 5x5 neighbours: first the translated stroke's own
//       region (from the centre, else the 7 x 7 cells round it), then from
//       every third cell of the grid (the same answer as the full grid for
//       every holing region those cells meet, in about a thousand flights
//       instead of 4,941); a budget cut short ranks the cells whose
//       neighbourhoods were flown whole first. None holes: null.
//     - a setup stroke: the stroke from here whose no-cup rest is nearest the
//       solve's rest of that stroke (the model's replay of it, as above;
//       Gauss-Newton, then a 9 x 9 grid of 0.0005 x 0.01 deg round it, rests
//       on the next solved stroke's kind of lie and out of hazards first); null
//       when it rests further than tolYd from it.
//     why starts "[playbook-near hHH-sN k]"; near = { id, yd, from, lie, kind,
//     launch, ... }; reached = the requested heading and gamePower = the planned
//     launch (round-play.mjs adjusts the power once the D-pad has aimed). The
//     answer is kept for the spot (NEAR_MEMO_TOL), so the ready state finds the
//     plan made ahead. The searches yield to the event loop every 40 ms (the
//     driver's DSU stream must keep flowing: Dolphin marks a pad disconnected
//     after a few seconds without data) and stop at budgetMs.
//   holes(p), capOf(club, lie), floorOf(club, lie): the rule and the ranges.
//   node tools/harness/test-playbook-robust.mjs checks them offline.
//   node tools/harness/playbook.mjs   (prints what it holds)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SOLVE_DIR = path.join(HERE, "results", "solve");
export const PIN_INDEX = path.join(HERE, "state", "saves", "pins", "index.json");
export const PIN_TOL = 1;
export const POS_TOL = 0.05;
const DEG = Math.PI / 180, YD = 9.144;
const FILE_RE = /^h(\d\d)-(s\d+)\.json$/;
const LIE_NAME = { 1: "fairway", 2: "rough", 3: "sand", 6: "green", 9: "fringe", 10: "green", 11: "green", 15: "tee", 16: "sand" };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const xz = (p) => Array.isArray(p) && p.length >= 3 && Number.isFinite(p[0]) && Number.isFinite(p[2]);
// a solution's wind (null: calm) against the game's: calm alike in any direction, else the same direction and speed
const calmW = (w) => !w || !(w.speedIdx > 0);
export const windEq = (a, b) => (calmW(a) ? calmW(b) : !calmW(b) && a.dir === b.dir && a.speedIdx === b.speedIdx);
const windOfSol = (w) => (calmW(w) ? null : { dir: w.dir, speedIdx: w.speedIdx });

// one result file -> its solution, or { error }
function solutionOf(r, file, pins) {
  const m = FILE_RE.exec(path.basename(file));
  const cup = `h${m[1]}-${m[2]}`;
  if (!r || r.solved !== true) return { unsolved: true };
  if (!Array.isArray(r.strokes) || !r.strokes.length) return { error: `${cup}: solved, but no strokes` };
  const c = pins[cup];
  if (!c || !xz(c.pinRam)) return { error: `${cup}: no pin in the pins index` };
  const tries = Array.isArray(r.tries) ? r.tries : [];
  const strokes = [];
  for (const s of r.strokes) {
    // the stroke's own try: the same stroke number, club, power, aim and rest
    // (a stroke row is { k, ...the try's result }; the try adds from and lie)
    const t = tries.find((x) => x.k === s.k && x.club === s.club && x.power === s.power && x.heading === s.heading && xz(x.rest) && xz(s.rest) && x.rest[0] === s.rest[0] && x.rest[2] === s.rest[2]);
    const from = s.from ?? t?.from, lie = s.lie ?? t?.lie;
    if (!xz(from) || lie == null) return { error: `${cup}: stroke ${s.k} has no try with its start and lie` };
    if (!Number.isFinite(s.power) || !Number.isFinite(s.heading) || !Number.isFinite(s.aimErrDeg ?? 0)) return { error: `${cup}: stroke ${s.k} lacks its power or aim` };
    strokes.push({
      k: s.k, club: s.club, power: s.power, requested: s.heading + (s.aimErrDeg ?? 0) * DEG, reached: s.heading, aimErrDeg: s.aimErrDeg ?? 0,
      gamePower: s.gamePower ?? null, from, lie, rest: s.rest, holed: !!s.holed, hazard: s.hazard ?? 0, toPin: s.toPin ?? null, n: t?.n ?? null, why: t?.why ?? null,
    });
  }
  strokes.sort((a, b) => a.k - b.k);
  if (!strokes[strokes.length - 1].holed) return { error: `${cup}: solved, but its last stroke is not holed` };
  // the wind it was played in (results/solve: calm; hole-solve's sweep: its wind), and the flag's (the
  // calm solves kept each tee state's own cloth, the cup's index.json wind; the sweep wrote the cloth for its wind)
  const wind = windOfSol(r.wind);
  return { cup, hole: Number(m[1]), id: m[2], label: r.label ?? c.label, sets: r.sets ?? c.sets, par: r.par ?? null, target: r.target ?? null, pin: c.pinRam, file, strokes,
    wind, flagWind: wind ?? c.wind ?? null, src: wind ? "solve-wind" : "solve" };
}

// ---- the solutions in wind (the chosen-wind rounds, round-play.mjs windPlan) ----
// the wind campaign's per-wind solves (hole-solve.mjs --winds: state/solve-wind/hHH-<id>/dD-iI.json,
// each with its tries) and the holes natural rounds holed in the game's own wind (results/natural18,
// compete, wind, courses: a round file with no set wind; each stroke from the last one's rest, exactly)
export const WIND_DIR = path.join(HERE, "state", "solve-wind");
export const ROUND_DIRS = ["natural18", "compete", "wind", "courses"].map((d) => path.join(HERE, "results", d));
function walkJson(dir, out = []) { let es = []; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; } for (const e of es) { const p = path.join(dir, e.name); if (e.isDirectory()) walkJson(p, out); else if (e.name.endsWith(".json")) out.push(p); } return out; }
function extraSolutions(pins) {
  const out = [];
  let dirs = [];
  try { dirs = fs.readdirSync(WIND_DIR).filter((d) => /^h\d\d-s\d+$/.test(d)); } catch { /* none */ }
  for (const d of dirs) for (const f of fs.readdirSync(path.join(WIND_DIR, d)).filter((x) => /^d\d-i\d+\.json$/.test(x))) {
    let r; try { r = JSON.parse(fs.readFileSync(path.join(WIND_DIR, d, f), "utf8")); } catch { continue; }
    const sol = solutionOf(r, path.join(WIND_DIR, d, `${d}.json`), pins);
    if (sol.cup) { sol.file = path.join(WIND_DIR, d, f); out.push(sol); }
  }
  for (const file of ROUND_DIRS.flatMap((d) => walkJson(d))) {
    let r; try { r = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    if (!r || r.wind != null || !r.holes || typeof r.holes !== "object") continue;   // a set wind: its cloth is not the wind's
    for (const [h, x] of Object.entries(r.holes)) {
      const ss = x?.strokes;
      if (!Array.isArray(ss) || !ss.length || !ss[ss.length - 1].holed || ss.some((s) => !xz(s.from) || !s.aim || !Number.isFinite(s.aim.heading) || s.hazard)) continue;   // ('placed' also marks a fast flight's 60 u poll jump: the chain check below catches a real drop)
      const w = ss[0].wind;
      if (!w || ss.some((s) => !windEq(windOfSol(s.wind), windOfSol(w)))) continue;
      let chain = true;
      for (let k = 1; k < ss.length; k++) if (!xz(ss[k - 1].rest) || Math.hypot(ss[k].from[0] - ss[k - 1].rest[0], ss[k].from[2] - ss[k - 1].rest[2]) > POS_TOL) chain = false;
      if (!chain) continue;
      const pin = ss[0].pin;
      const cup = Object.keys(pins).find((k) => k.startsWith(`h${String(h).padStart(2, "0")}-`) && xz(pins[k].pinRam) && xz(pin) && Math.hypot(pins[k].pinRam[0] - pin[0], pins[k].pinRam[2] - pin[2]) <= PIN_TOL);
      if (!cup) continue;
      const c = pins[cup], wind = windOfSol(w);
      out.push({ cup, hole: Number(h), id: cup.slice(4), label: c.label, sets: c.sets, par: null, target: ss.length, pin: c.pinRam, file, src: "round", wind, flagWind: { dir: w.dir ?? 0, speedIdx: w.speedIdx ?? 0 },   // the cloth as that round's hole began (calm too: its yaw)
        strokes: ss.map((s) => ({ k: s.k, club: s.club, power: Number.isFinite(s.plan?.power) ? s.plan.power : s.gamePower, requested: s.aim.heading + (s.aim.errDeg ?? 0) * DEG, reached: s.aim.heading, aimErrDeg: s.aim.errDeg ?? 0,
          gamePower: s.gamePower ?? null, from: s.from, lie: s.lie, rest: s.rest, holed: !!s.holed, hazard: s.hazard ?? 0, toPin: s.toPin ?? null, n: null, why: "a natural round" })) });
    }
  }
  return out;
}

export function createPlaybook({ solveDir = SOLVE_DIR, pinIndex = PIN_INDEX } = {}) {
  const files = new Map();   // name -> { mtimeMs, size, sol | null }
  let pins = { mtimeMs: -1, size: -1, cups: {} };
  let byHole = new Map(), errors = [], refreshes = 0, lastRefreshMs = 0;
  // lookupNear's answers per spot, dropped whenever the solutions change (gen)
  let gen = 0;
  const memo = [];

  let extra = [], extraAt = 0;
  function rebuild() {
    byHole = new Map(); errors = [];
    gen++; memo.length = 0;
    if (Date.now() - extraAt > 600000 || !extraAt) { try { extra = extraSolutions(pins.cups); } catch (e) { errors.push(`the solutions in wind: ${e.message}`); } extraAt = Date.now(); }
    for (const sol of extra) { if (!byHole.has(sol.hole)) byHole.set(sol.hole, []); byHole.get(sol.hole).push(sol); }
    for (const [name, f] of files) {
      if (!f.raw) continue;
      const sol = solutionOf(f.raw, path.join(solveDir, name), pins.cups);
      f.sol = sol.cup ? sol : null;
      if (sol.error) errors.push(sol.error);
      if (sol.cup) { if (!byHole.has(sol.hole)) byHole.set(sol.hole, []); byHole.get(sol.hole).push(sol); }
    }
  }
  // the files on disk against the ones read: new, changed or gone
  function refresh() {
    const t0 = performance.now();
    let changed = false;
    try {
      const st = fs.statSync(pinIndex);
      if (st.mtimeMs !== pins.mtimeMs || st.size !== pins.size) {
        try { pins = { mtimeMs: st.mtimeMs, size: st.size, cups: JSON.parse(fs.readFileSync(pinIndex, "utf8")).cups ?? {} }; changed = true; }
        catch { /* a write in progress: the last good reading stands, read again next time */ }
      }
    } catch { if (pins.mtimeMs !== -1) { pins = { mtimeMs: -1, size: -1, cups: {} }; changed = true; } }
    let names = [];
    try { names = fs.readdirSync(solveDir).filter((n) => FILE_RE.test(n)); } catch { names = []; }
    const seen = new Set(names);
    for (const name of [...files.keys()]) if (!seen.has(name)) { files.delete(name); changed = true; }
    for (const name of names) {
      let st;
      try { st = fs.statSync(path.join(solveDir, name)); } catch { continue; }
      const f = files.get(name);
      if (f && f.mtimeMs === st.mtimeMs && f.size === st.size) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(solveDir, name), "utf8"));
        // only what a stroke needs is kept
        const keep = { solved: raw.solved, label: raw.label, sets: raw.sets, par: raw.par, target: raw.target, strokes: raw.strokes,
          tries: Array.isArray(raw.tries) && Array.isArray(raw.strokes) ? raw.tries.filter((t) => raw.strokes.some((s) => s.k === t.k && s.heading === t.heading && s.power === t.power)) : [] };
        files.set(name, { mtimeMs: st.mtimeMs, size: st.size, raw: keep, sol: null });
        changed = true;
      } catch { /* not parsed (being written): keep the last reading, try again next time */ }
    }
    if (changed || Date.now() - extraAt > 600000) rebuild();
    refreshes++;
    lastRefreshMs = performance.now() - t0;
    return changed;
  }

  // the stroke to play from st, or null
  function lookup(hole, st, { posTol = POS_TOL, pinTol = PIN_TOL, refresh: doRefresh = true } = {}) {
    const ball = st?.ball?.pos, pin = st?.pin, lie = st?.player?.lie;
    if (!xz(ball) || !xz(pin) || lie == null) return null;
    if (doRefresh || !refreshes) refresh();
    let best = null;
    for (const sol of byHole.get(Number(hole)) ?? []) {
      if (Math.hypot(sol.pin[0] - pin[0], sol.pin[2] - pin[2]) > pinTol) continue;
      if (!windEq(sol.wind, st.wind)) continue;
      for (const s of sol.strokes) {
        if (s.lie !== lie) continue;
        const d = Math.hypot(s.from[0] - ball[0], s.from[2] - ball[2]);
        if (d <= posTol && (!best || d < best.d)) best = { sol, s, d };
      }
    }
    return best ? planOf(best.sol, best.s, best.d) : null;
  }

  // the plan from a ball near a solved stroke's start (lookupNear above), kept
  // per spot until the solutions change
  async function lookupNear(hole, st, { tolYd = NEAR_TOL_YD, pinTol = PIN_TOL, refresh: doRefresh = true, budgetMs = NEAR_BUDGET_MS } = {}) {
    const t0 = performance.now();
    const ball = st?.ball?.pos, pin = st?.pin, lie = st?.player?.lie;
    if (!xz(ball) || !xz(pin) || lie == null) return null;
    if (doRefresh || !refreshes) refresh();
    hole = Number(hole);
    const cands = [];
    for (const sol of byHole.get(hole) ?? []) {
      if (Math.hypot(sol.pin[0] - pin[0], sol.pin[2] - pin[2]) > pinTol) continue;
      if (!windEq(sol.wind, st.wind)) continue;
      for (const s of sol.strokes) {
        if (lieClass(s.lie) !== lieClass(lie)) continue;
        const d = Math.hypot(s.from[0] - ball[0], s.from[2] - ball[2]);
        const reach = Math.hypot(sol.pin[0] - s.from[0], sol.pin[2] - s.from[2]);
        if (d <= Math.min(tolYd * YD, NEAR_REL * reach)) cands.push({ sol, s, d });
      }
    }
    if (!cands.length) return null;
    const m = memo.find((x) => x.gen === gen && x.hole === hole && x.lie === lie && x.tolYd === tolYd && Math.hypot(x.pin[0] - pin[0], x.pin[2] - pin[2]) < 0.01 && Math.hypot(x.ball[0] - ball[0], x.ball[2] - ball[2]) <= NEAR_MEMO_TOL);
    if (m) return m.plan;
    cands.sort((a, b) => a.d - b.d);
    const RM = await model();
    const deadline = t0 + budgetMs;
    let plan = null;
    for (const c of cands) {
      const r = c.s.holed ? await nearHoling(RM, hole, st, c, deadline) : await nearSetup(RM, hole, st, c, deadline, tolYd);
      if (r) { plan = nearPlanOf(c.sol, c.s, c.d, r, st, performance.now() - t0); break; }
      if (performance.now() > deadline) break;
    }
    memo.unshift({ gen, hole, lie, tolYd, pin: [pin[0], pin[1], pin[2]], ball: [ball[0], ball[1], ball[2]], plan });
    if (memo.length > 24) memo.length = 24;
    return plan;
  }

  // the wind a chosen-wind round sets for the hole (round-play.mjs windPlan): of the solutions for
  // the drawn pin whose first stroke is struck from this ball and lie, the fewest strokes; on a tie a
  // savestate solve before a natural round's hole, then calm before a wind
  // (equal stroke counts: the route whose final stroke the model holes over the most cells first,
  // results/compete/route-robust.json; skip: the n-th route instead, for a retry from a savestate)
  let robustAt = 0, robustT = {};
  const robustOf = (sol) => { if (Date.now() - robustAt > 600000) { try { robustT = JSON.parse(fs.readFileSync(path.join(HERE, "results", "compete", "route-robust.json"), "utf8")); } catch { robustT = {}; } robustAt = Date.now(); } return robustT[`${path.relative(HERE, sol.file).split(path.sep).join("/")}#${sol.cup}`]?.cells ?? -1; };
  function chooseWind(hole, st, { posTol = POS_TOL, pinTol = PIN_TOL, skip = 0 } = {}) {
    const ball = st?.ball?.pos, pin = st?.pin, lie = st?.player?.lie;
    if (!xz(ball) || !xz(pin)) return null;
    if (!refreshes) refresh(); else refresh();
    const rank = { "solve-wind": 0, solve: 0, round: 1 };
    const all = [];
    for (const sol of byHole.get(Number(hole)) ?? []) {
      if (Math.hypot(sol.pin[0] - pin[0], sol.pin[2] - pin[2]) > pinTol) continue;
      const s1 = sol.strokes[0];
      if (!s1 || s1.lie !== lie || Math.hypot(s1.from[0] - ball[0], s1.from[2] - ball[2]) > posTol) continue;
      all.push({ sol, key: [sol.strokes.length, -robustOf(sol), rank[sol.src] ?? 2, sol.wind ? 1 : 0] });
    }
    if (!all.length) return null;
    all.sort((a, b) => { for (let i = 0; i < 4; i++) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i]; return 0; });
    const best = all[Math.min(skip, all.length - 1)];
    const n = [...(byHole.get(Number(hole)) ?? [])].filter((x) => Math.hypot(x.pin[0] - pin[0], x.pin[2] - pin[2]) <= pinTol && x.strokes.length === best.sol.strokes.length).length;
    return { wind: best.sol.wind, flagWind: best.sol.flagWind, cup: best.sol.cup, strokes: best.sol.strokes.length, src: best.sol.src, file: best.sol.file, alike: n, cells: -best.key[1], of: all.length };
  }
  return {
    lookup, refresh, lookupNear, adjustPower, chooseWind,
    solutions: () => { if (!refreshes) refresh(); return [...byHole.values()].flat().sort((a, b) => a.cup.localeCompare(b.cup)); },
    stats: () => { if (!refreshes) refresh(); return { files: files.size, solved: [...byHole.values()].reduce((t, l) => t + l.length, 0), strokes: [...byHole.values()].flat().reduce((t, x) => t + x.strokes.length, 0), errors: [...errors], refreshes, lastRefreshMs }; },
  };
}

// the plan round-play.mjs plays: the planner's shape ({ club, power, heading, expect, why })
function planOf(sol, s, d) {
  const n = sol.strokes.length, next = sol.strokes.find((x) => x.k === s.k + 1);
  const toCup = Math.atan2(sol.pin[0] - s.from[0], sol.pin[2] - s.from[2]);
  const distance = Math.hypot(sol.pin[0] - s.from[0], sol.pin[2] - s.from[2]) / YD;
  const right = angDiff(toCup, s.requested) / DEG;   // + = right of the cup, as the planner's aimDeg
  const outcome = s.holed ? "holed" : `rested ${s.toPin != null ? s.toPin.toFixed(1) : "?"} yd from the pin${next ? ` on the ${LIE_NAME[next.lie] ?? `lie ${next.lie}`}` : ""}`;
  const why = `[playbook ${sol.cup} ${s.k}] ${s.club} ${s.power.toFixed(4)}, aim ${(s.requested / DEG).toFixed(4)} deg (${Math.abs(right).toFixed(2)} deg ${right >= 0 ? "right" : "left"} of the pin line), ${distance.toFixed(1)} yd: stroke ${s.k} of ${n} of the calm-wind solution (target ${sol.target ?? "?"}, par ${sol.par ?? "?"}; results/solve/${sol.cup}.json); there the game launched ${s.gamePower != null ? s.gamePower.toFixed(4) : "?"}, the D-pad reached ${(s.reached / DEG).toFixed(4)} deg, and it ${outcome}`;
  return {
    club: s.club, power: s.power, heading: s.requested, k: s.k, cup: sol.cup, why,
    reached: s.reached, gamePower: s.gamePower, aimErrDeg: s.aimErrDeg, of: n, target: sol.target, par: sol.par,
    holed: s.holed, rest: s.rest, toPin: s.toPin, offYd: d / YD, file: `results/solve/${sol.cup}.json`,
    // the solved stroke itself (adjustPower's replay of it)
    solve: { from: s.from, lie: s.lie, power: s.power, gamePower: s.gamePower, reached: s.reached, requested: s.requested, rest: s.rest, pin: sol.pin, wind: sol.wind ?? CALM },
    expect: {
      src: "playbook", restLie: s.holed ? "cup" : next ? LIE_NAME[next.lie] ?? `lie ${next.lie}` : "?", toPin: s.holed ? 0 : s.toPin != null ? +s.toPin.toFixed(1) : null,
      aimDeg: +right.toFixed(3), distance: +distance.toFixed(2),
      playbook: { cup: sol.cup, k: s.k, of: n, target: sol.target, power: s.power, gamePower: s.gamePower, heading: s.requested, reached: s.reached, holed: s.holed, rest: s.rest },
    },
  };
}

// ---- off the solved stroke: round-model.mjs (adjustPower, lookupNear) ----
export const NEAR_TOL_YD = 3;
export const NEAR_REL = 0.1;            // and within a tenth of the solved stroke's own distance to the pin
export const NEAR_BUDGET_MS = 6000;
const NEAR_MEMO_TOL = 0.05;             // u: the same spot (the ready ball keeps its rest's x and z)
const NEAR_DQ = 0.015, NEAR_SQ = 0.0005, NEAR_DA = 0.4, NEAR_SA = 0.01;   // the holing grid: power, aim (deg)
const ADJ_SPAN = 0.02, ADJ_STEP = 0.0005;
const SETUP_REPLAY_YD = 1;
const CALM = { dir: 0, speedIdx: 0 };
const BUNKER_CAP = { driver: 0.25, spoon: 0.25, "3iron": 0.5, "5iron": 0.5, "7iron": 0.5, "9iron": 0.5, wedge: 0.75, putter: 1 };
// the launch power's range: the lie's cap (the putter's 2.5, 1.0 in rough or
// sand: the lie factor) and the game's floor
export const capOf = (club, lie) => (club === "putter" ? (lie === 2 || lie === 3 || lie === 16 ? 1 : 2.5) : lie === 2 ? 0.75 : lie === 3 || lie === 16 ? BUNKER_CAP[club] ?? 1 : 1);
export const floorOf = (club, lie) => (club === "putter" ? 0.05 : 0.1 * capOf(club, lie));
// hole-solve.mjs's rule for a model hole the game repeats: the ball rolling
// into the cup (its centre under 0.25 u above the cup's level as it crosses
// the window), no flagstick hit faster than 3.4 yd/s
export const holes = (p) => p.holed && !!p.cupPass && p.cupPass.h < 0.25 && (!p.flag || (p.flag.vn * 240) / YD <= 3.4);
const lieClass = (lie) => (lie === 6 || lie === 10 || lie === 11 ? "green" : lie === 2 ? "rough" : lie === 3 || lie === 16 ? "bunker" : "full");
const restClass = (p) => (p.hazard ? "hazard" : p.restLie === "green" ? "green" : p.restLie === "rough" ? "rough" : p.restLie === "bunker" ? "bunker" : p.restLie === "fairway" || p.restLie === "fringe" || p.restLie === "tee" ? "full" : String(p.restLie));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// round-model.mjs, on first use (round-planner.mjs imports the same URL, so a
// round's driver has it loaded, courses and all); a failed import is tried again
let RMP = null;
export function model() { return (RMP ??= import("./round-model.mjs").catch((e) => { RMP = null; throw e; })); }
// a yield to the event loop every `every` ms of flying
const ticker = (every = 40) => { let last = performance.now(); return async () => { if (performance.now() - last >= every) { await new Promise((r) => setImmediate(r)); last = performance.now(); } }; };

// the power to pass shoot() (powerMode "game") for launch power q: the solved
// stroke's own pair carries the raw curve's offset (0 to +0.0002 on every
// club's partial swings in the campaign), or a ratio where the pair lies far
// apart (h12's putts from one green launched at about half the power swung)
function shootFor(q, sv) {
  const p = sv?.power, g = sv?.gamePower;
  if (!Number.isFinite(p) || !Number.isFinite(g) || !(g > 0)) return q;
  return Math.abs(g - p) <= 0.002 ? q - (g - p) : q * (p / g);
}
function powersRound(q0, span, step, lo, cap) {
  const n = Math.round(span / step), qs = [];
  for (let i = -n; i <= n; i++) { const q = q0 + i * step; if (q >= lo - 1e-9 && q <= cap + 1e-9) qs.push(clamp(q, lo, cap)); }
  return qs;
}
// the runs of consecutive holing powers: { a, b (indices into qs), lo, hi, n, mid }
function runsOf(qs, ok) {
  const runs = [];
  for (let i = 0; i < qs.length; i++) {
    if (!ok[i]) continue;
    let j = i;
    while (j + 1 < qs.length && ok[j + 1]) j++;
    runs.push({ a: i, b: j, lo: qs[i], hi: qs[j], n: j - i + 1, mid: (qs[i] + qs[j]) / 2 });
    i = j;
  }
  return runs;
}
// a run's middle among the powers flown (an even run's midpoint was not: the
// model's holing powers are not convex between two flown ones, h06-s0's
// 0.3505-0.3520 misses at 0.35125), of an even run's two the one nearer `toward`
const midFlown = (r, qs, toward) => {
  const c0 = qs[r.a + Math.floor((r.n - 1) / 2)], c1 = qs[r.a + Math.ceil((r.n - 1) / 2)];
  return Math.abs(c0 - toward) <= Math.abs(c1 - toward) ? c0 : c1;
};
// the reached aim's run is the solve's aim's own (for carrying an offset over)
// when it lies within this much launch power of it
const SAME_RUN_Q = 0.004;
const gapTo = (r, q) => (q < r.lo ? r.lo - q : q > r.hi ? q - r.hi : 0);
const longest = (runs, q) => runs.reduce((b, r) => (!b || r.n > b.n || (r.n === b.n && Math.abs(r.mid - q) < Math.abs(b.mid - q)) ? r : b), null);
const nearestRun = (runs, q) => runs.reduce((b, r) => (!b || gapTo(r, q) < gapTo(b, q) || (gapTo(r, q) === gapTo(b, q) && r.n > b.n) ? r : b), null);
const fmtRun = (r) => (r.n === 1 ? r.lo.toFixed(4) : `${r.lo.toFixed(4)}-${r.hi.toFixed(4)} (${r.n})`);

// does the model hole the solved stroke at its own aim from its own spot, and
// where are its holing runs there (kept per stroke)
const replays = new Map();
async function replayRuns(RM, hole, club, sv, pin, tick) {
  const key = [hole, club, sv.lie, sv.from[0], sv.from[1], sv.from[2], sv.gamePower, sv.reached, pin[0], pin[1], pin[2]].join(",");
  if (replays.has(key)) return replays.get(key);
  const qs = powersRound(sv.gamePower, ADJ_SPAN, ADJ_STEP, floorOf(club, sv.lie), capOf(club, sv.lie)), ok = [];
  for (const q of qs) { ok.push(holes(RM.predict({ hole, ball: sv.from, heading: sv.reached, club, power: q, lie: sv.lie, wind: sv.wind ?? CALM, pin }))); await tick(); }
  const at = RM.predict({ hole, ball: sv.from, heading: sv.reached, club, power: sv.gamePower, lie: sv.lie, wind: sv.wind ?? CALM, pin });
  const R = { holes: holes(at), runs: runsOf(qs, ok) };
  if (replays.size >= 64) replays.clear();
  replays.set(key, R);
  return R;
}
// the setup's target: the model's own rest of the solved stroke from its spot
// (its error there cancels), else the game's rest
async function setupTarget(RM, hole, club, sv, rest) {
  if (!xz(rest)) return null;
  const game = [rest[0], rest[2]];
  if (!xz(sv?.from) || !Number.isFinite(sv.gamePower) || !Number.isFinite(sv.reached)) return { xz: game, src: "game", offYd: null };
  const p = RM.predict({ hole, ball: sv.from, heading: sv.reached, club, power: sv.gamePower, lie: sv.lie, wind: sv.wind ?? CALM, pin: null });
  const offYd = Math.hypot(p.rest[0] - game[0], p.rest[1] - game[1]) / YD;
  return offYd <= SETUP_REPLAY_YD ? { xz: [p.rest[0], p.rest[1]], src: "model", offYd } : { xz: game, src: "game", offYd };
}

// The power for the aim the D-pad reached (see the header)
export async function adjustPower(hole, st, pb, reachedHeading, { span = ADJ_SPAN, step = ADJ_STEP } = {}) {
  const t0 = performance.now();
  const done = (o) => ({ ...o, ms: Math.round(performance.now() - t0) });
  if (!pb || !Number.isFinite(pb.power)) return done({ power: pb?.power ?? null, launch: null, kept: true, why: "no plan to adjust" });
  const q0 = pb.near?.launch ?? pb.gamePower ?? pb.power;
  const keep = (why) => done({ power: pb.power, launch: q0, kept: true, why });
  const ball = st?.ball?.pos, pin = st?.pin, lie = st?.player?.lie;
  if (!xz(ball) || !xz(pin) || lie == null || !Number.isFinite(reachedHeading)) return keep("no ball, pin, lie or reached heading: the plan's power");
  hole = Number(hole);
  const RM = await model();
  const club = pb.club, cap = capOf(club, lie), lo = floorOf(club, lie);
  const sv = pb.solve ?? { from: ball, lie, power: pb.power, gamePower: pb.gamePower ?? pb.power, reached: pb.reached, rest: pb.rest, pin };
  const tick = ticker();
  const fly = (q, cup) => RM.predict({ hole, ball, heading: reachedHeading, club, power: q, lie, wind: sv.wind ?? CALM, pin: cup ? pin : null });
  const qs = powersRound(q0, span, step, lo, cap);
  if (!qs.length) return keep(`the plan's launch ${q0.toFixed(4)} lies outside the lie's range ${lo.toFixed(3)}-${cap}: the plan's power`);
  const offDeg = angDiff(reachedHeading, pb.reached ?? pb.heading) / DEG;
  const give = (q, why, extra = {}) => done({ power: shootFor(q, sv), launch: q, why: `${why}; the D-pad reached ${offDeg >= 0 ? "+" : ""}${offDeg.toFixed(4)} deg from the plan's aim`, ...extra });
  if (pb.holed) {
    const ok = [];
    for (const q of qs) { ok.push(holes(fly(q, true))); await tick(); }
    const runs = runsOf(qs, ok);
    // an exact plan: does the model hole the solve's own stroke at its own aim?
    let shift = 0, anchor = null, rel = "";
    if (!pb.near && xz(sv.from) && Number.isFinite(sv.gamePower) && Number.isFinite(sv.reached)) {
      const R = await replayRuns(RM, hole, club, sv, xz(sv.pin) ? sv.pin : pin, tick);
      if (!R.holes) {
        if (!R.runs.length) return keep(`the model holes no launch power within ${span} of the solve's ${sv.gamePower.toFixed(4)} at the solve's own aim, where the game holed it: the solve's power kept`);
        const r0 = nearestRun(R.runs, sv.gamePower);
        anchor = r0.mid; shift = sv.gamePower - r0.mid;
        rel = `; at the solve's own aim the model holes ${fmtRun(r0)}, not the game's ${sv.gamePower.toFixed(4)}: that offset (${shift >= 0 ? "+" : ""}${shift.toFixed(4)}) carried over`;
      }
    }
    if (runs.length) {
      const same = anchor != null ? nearestRun(runs, anchor) : null;
      if (same && gapTo(same, anchor) <= SAME_RUN_Q) {
        const q = clamp(same.mid + shift, lo, cap);
        return give(q, `launch ${q.toFixed(4)}: the model holes ${fmtRun(same)} at the aim reached (runs ${runs.map(fmtRun).join(", ")})${rel}`, { runs: runs.map((x) => [x.lo, x.hi]), shift });
      }
      if (same) rel += `, but no run at the aim reached lies within ${SAME_RUN_Q} of that one (the nearest ${fmtRun(same)}): the model's own longest run instead`;
      const r = longest(runs, q0), q = midFlown(r, qs, q0);
      return give(q, `launch ${q.toFixed(4)}: the model holes ${fmtRun(r)} at the aim reached (runs ${runs.map(fmtRun).join(", ")})${rel}`, { runs: runs.map((x) => [x.lo, x.hi]) });
    }
    let best = null;
    for (const q of qs) { const p = fly(q, false); const d = Math.hypot(p.rest[0] - pin[0], p.rest[1] - pin[2]) / YD; if (!best || d < best.d) best = { q, d }; await tick(); }
    return give(best.q, `launch ${best.q.toFixed(4)}: no power within ${span} of ${q0.toFixed(4)} holes at the aim reached; this one rests nearest the pin without the cup, ${best.d.toFixed(2)} yd${rel}`, { runs: [] });
  }
  // a setup stroke: every 0.002 of launch power, then every 0.0005 round the
  // best (its rest moves smoothly with the power but where it forks; 29
  // flights where 81 found the same rests)
  const T = pb.near?.target ? { xz: pb.near.target, src: pb.near.targetSrc ?? "model", offYd: pb.near.replayOffYd ?? null } : await setupTarget(RM, hole, club, sv, pb.rest);
  if (!T) return keep("no rest to aim the setup at: the plan's power");
  const at = (q) => { const p = fly(q, false), d = Math.hypot(p.rest[0] - T.xz[0], p.rest[1] - T.xz[1]); return { q, d, sc: d + (p.hazard ? 1e9 : 0), p }; };
  let best = null;
  for (const q of powersRound(q0, span, Math.max(step, 0.002), lo, cap)) { const r = at(q); if (!best || r.sc < best.sc) best = r; await tick(); }
  for (const q of powersRound(best.q, Math.max(step, 0.002), step, lo, cap)) { if (q === best.q || Math.abs(q - q0) > span + 1e-9) continue; const r = at(q); if (r.sc < best.sc) best = r; await tick(); }
  const src = T.src === "game" ? `the game's rest (the model's replay rests ${T.offYd != null ? T.offYd.toFixed(2) : "?"} yd from it)` : `the solve's rest as the model's replay of the solve's stroke puts it${T.offYd != null ? ` (${T.offYd.toFixed(3)} yd from the game's)` : ""}`;
  return give(best.q, `launch ${best.q.toFixed(4)}: its no-cup rest at the aim reached lies ${(best.d / YD).toFixed(3)} yd from ${src}, on the ${best.p.restLie}${best.p.hazard ? " (a hazard: none of the powers stays out of one)" : ""}`, { restYd: best.d / YD });
}

// Gauss-Newton on (power, aim): the stroke whose no-cup rest is T ([x, z])
async function matchRest(flyNC, q, h, T, lo, cap, tick, iters = 5) {
  const DQ = 0.002, DH = 0.02 * DEG;
  const err = (p) => Math.hypot(p.rest[0] - T[0], p.rest[1] - T[1]);
  let p = flyNC(q, h), flown = 1;
  let best = { q, h, p, e: err(p) };
  for (let it = 0; it < iters && best.e > 0.02; it++) {
    const dq = q + DQ <= cap ? DQ : -DQ;
    const pq = flyNC(q + dq, h), ph = flyNC(q, h + DH);
    flown += 2;
    const J00 = (pq.rest[0] - p.rest[0]) / dq, J01 = (ph.rest[0] - p.rest[0]) / DH, J10 = (pq.rest[1] - p.rest[1]) / dq, J11 = (ph.rest[1] - p.rest[1]) / DH;
    const det = J00 * J11 - J01 * J10;
    if (!(Math.abs(det) > 1e-12)) break;
    const e0 = T[0] - p.rest[0], e1 = T[1] - p.rest[1];
    const sq = clamp((J11 * e0 - J01 * e1) / det, -0.03, 0.03), sh = clamp((-J10 * e0 + J00 * e1) / det, -0.5 * DEG, 0.5 * DEG);
    const q2 = clamp(q + sq, lo, cap), h2 = h + sh, p2 = flyNC(q2, h2);
    flown++;
    await tick();
    if (err(p2) >= best.e) break;
    q = q2; h = h2; p = p2; best = { q, h, p, e: err(p) };
  }
  return { ...best, flown, eYd: best.e / YD };
}

// lookupNear, a holing stroke: the most robust holing cell round the
// translated stroke (see the header)
async function nearHoling(RM, hole, st, { s }, deadline) {
  const tick = ticker();
  const ball = st.ball.pos, lie = st.player.lie, pin = st.pin, club = s.club;
  const cap = capOf(club, lie), lo = floorOf(club, lie), gp = s.gamePower ?? s.power;
  const fly = (q, h, cup) => RM.predict({ hole, ball, heading: h, club, power: q, lie, wind: st.wind?.speedIdx > 0 ? st.wind : CALM, pin: cup ? pin : null });
  const T0p = RM.predict({ hole, ball: s.from, heading: s.reached, club, power: gp, lie: s.lie, wind: st.wind?.speedIdx > 0 ? st.wind : CALM, pin: null });
  const T0 = [T0p.rest[0], T0p.rest[1]];
  const h0 = s.reached + angDiff(Math.atan2(T0[0] - ball[0], T0[1] - ball[2]), Math.atan2(T0[0] - s.from[0], T0[1] - s.from[2]));
  const m = await matchRest((q, h) => fly(q, h, false), clamp(gp, lo, cap), h0, T0, lo, cap, tick);
  const NQ = Math.round(NEAR_DQ / NEAR_SQ), NA = Math.round(NEAR_DA / NEAR_SA), W = 2 * NA + 1, SQ = NEAR_SQ, SA = NEAR_SA * DEG;
  // -1 not flown, 0 misses, 1 holes, 2 outside the lie's power range
  const val = new Int8Array((2 * NQ + 1) * W).fill(-1);
  const id = (i, j) => (i + NQ) * W + (j + NA);
  let flown = 0, truncated = false;
  const cell = (i, j) => {
    const k = id(i, j);
    if (val[k] >= 0) return val[k];
    const q = m.q + i * SQ;
    if (q < lo - 1e-9 || q > cap + 1e-9) return (val[k] = 2);
    flown++;
    return (val[k] = holes(fly(q, m.h + j * SA, true)) ? 1 : 0);
  };
  // out from every holing cell queued to all its 5x5 neighbours, breadth
  // first (rings round the seeds: a budget that runs out leaves the cells
  // nearest them with their neighbourhoods flown)
  const queue = [];
  let qh = 0;
  const flood = async () => {
    while (qh < queue.length && !truncated) {
      const i = queue[qh++], j = queue[qh++];
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
        const ii = i + a, jj = j + b;
        if (ii < -NQ || ii > NQ || jj < -NA || jj > NA || val[id(ii, jj)] >= 0) continue;
        if (cell(ii, jj) === 1) queue.push(ii, jj);
      }
      await tick();
      if (performance.now() > deadline) truncated = true;
    }
  };
  // the translated stroke's own holing region first and whole (seeded by the
  // centre, else by the 7 x 7 cells round it), so a budget that runs out
  // later still leaves it ranked on complete neighbourhoods; then every third
  // cell of the grid for the other regions
  if (cell(0, 0) === 1) queue.push(0, 0);
  else for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (val[id(i, j)] < 0 && cell(i, j) === 1) queue.push(i, j);
  await flood();
  for (let i = -NQ; i <= NQ && !truncated; i += 3) for (let j = -NA; j <= NA; j += 3) {
    if (val[id(i, j)] < 0 && cell(i, j) === 1) queue.push(i, j);
    await tick();
    if (performance.now() > deadline) { truncated = true; break; }
  }
  await flood();
  // the holing cells, their runs along the power per aim, their robustness
  const colRuns = new Map();
  let nHoling = 0;
  for (let j = -NA; j <= NA; j++) {
    const rs = [];
    for (let i = -NQ; i <= NQ; i++) {
      if (val[id(i, j)] !== 1) continue;
      let e = i;
      while (e + 1 <= NQ && val[id(e + 1, j)] === 1) e++;
      rs.push({ a: i, b: e });
      nHoling += e - i + 1;
      i = e;
    }
    if (rs.length) colRuns.set(j, rs);
  }
  if (!nHoling) return null;
  const cover = (j) => { let n = 0; for (let dj = -3; dj <= 3; dj++) if ((colRuns.get(j + dj) ?? []).some((r) => r.b - r.a + 1 >= 2)) n++; return n; };
  // a cell whose 5x5 neighbourhood was flown whole first (only a budget cut
  // short leaves one that was not, and its share counts what was flown)
  const better = (c, b) => {
    if (c.complete !== b.complete) return c.complete;
    if (Math.abs(c.robust - b.robust) > 1e-9) return c.robust > b.robust;
    if (c.cover !== b.cover) return c.cover > b.cover;
    if (c.runN !== b.runN) return c.runN > b.runN;
    if (c.fromMid !== b.fromMid) return c.fromMid < b.fromMid;
    return c.dist < b.dist;
  };
  let best = null;
  for (const [j, rs] of colRuns) for (const run of rs) for (let i = run.a; i <= run.b; i++) {
    let nh = 0, nm = 0, unflown = 0;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const ii = i + a, jj = j + b;
      if (ii < -NQ || ii > NQ || jj < -NA || jj > NA) continue;
      const v = val[id(ii, jj)];
      if (v === 0 || v === 1) { nm++; if (v === 1) nh++; } else if (v === -1) unflown++;
    }
    const c = { i, j, complete: unflown === 0, robust: nh / Math.max(1, nm), cover: cover(j), runN: run.b - run.a + 1, fromMid: Math.abs(i - (run.a + run.b) / 2), dist: (i / NQ) ** 2 + (j / NA) ** 2, run };
    if (!best || better(c, best)) best = c;
  }
  const q = m.q + best.i * SQ, h = m.h + best.j * SA;
  return {
    kind: "hole", club, launch: q, heading: h,
    cell: { robust: best.robust, complete: best.complete, cover: best.cover, runN: best.runN, run: [m.q + best.run.a * SQ, m.q + best.run.b * SQ], i: best.i, j: best.j },
    center: { launch: m.q, heading: m.h, restOffYd: m.eYd }, holing: nHoling, flown: flown + m.flown + 1, truncated,
  };
}

// lookupNear, a setup stroke: the stroke from here whose no-cup rest is
// nearest the solved stroke's rest (see the header)
async function nearSetup(RM, hole, st, { sol, s }, deadline, tolYd) {
  const tick = ticker();
  const ball = st.ball.pos, lie = st.player.lie, pin = st.pin, club = s.club;
  const cap = capOf(club, lie), lo = floorOf(club, lie), gp = s.gamePower ?? s.power;
  const fly = (q, h) => RM.predict({ hole, ball, heading: h, club, power: q, lie, wind: st.wind?.speedIdx > 0 ? st.wind : CALM, pin: null });
  const T = await setupTarget(RM, hole, club, { from: s.from, lie: s.lie, gamePower: gp, reached: s.reached, wind: sol.wind ?? CALM }, s.rest);
  if (!T) return null;
  const h0 = s.reached + angDiff(Math.atan2(T.xz[0] - ball[0], T.xz[1] - ball[2]), Math.atan2(T.xz[0] - s.from[0], T.xz[1] - s.from[2]));
  const m = await matchRest(fly, clamp(gp, lo, cap), h0, T.xz, lo, cap, tick);
  const next = sol.strokes.find((x) => x.k === s.k + 1);
  const want = next ? lieClass(next.lie) : null;
  let best = null, flown = 0;
  for (let i = -4; i <= 4; i++) {
    for (let j = -4; j <= 4; j++) {
      const q = m.q + i * 0.0005;
      if (q < lo - 1e-9 || q > cap + 1e-9) continue;
      const h = m.h + j * 0.01 * DEG, p = fly(clamp(q, lo, cap), h);
      flown++;
      const e = Math.hypot(p.rest[0] - T.xz[0], p.rest[1] - T.xz[1]);
      const lieOk = !want || restClass(p) === want;
      const sc = e / YD + (p.hazard ? 1e9 : 0) + (lieOk ? 0 : 1e6);
      if (!best || sc < best.sc) best = { q: clamp(q, lo, cap), h, p, e, sc, lieOk };
      await tick();
    }
    if (performance.now() > deadline) break;
  }
  if (!best || best.p.hazard || best.e / YD > tolYd) return null;
  return {
    kind: "setup", club, launch: best.q, heading: best.h, target: T.xz, targetSrc: T.src, replayOffYd: T.offYd,
    restOffYd: best.e / YD, restLie: best.p.restLie, lieOk: best.lieOk, toPinYd: Math.hypot(best.p.rest[0] - pin[0], best.p.rest[1] - pin[2]) / YD,
    center: { launch: m.q, heading: m.h, restOffYd: m.eYd }, flown: flown + m.flown + 1,
  };
}

// lookupNear's plan: lookup()'s shape, the plan from the ball itself
let nearSeq = 0;
function nearPlanOf(sol, s, d, r, st, ms) {
  const ball = st.ball.pos, pin = st.pin, n = sol.strokes.length, next = sol.strokes.find((x) => x.k === s.k + 1);
  const gp = s.gamePower ?? s.power;
  const toCup = Math.atan2(pin[0] - ball[0], pin[2] - ball[2]);
  const distance = Math.hypot(pin[0] - ball[0], pin[2] - ball[2]) / YD;
  const right = angDiff(toCup, r.heading) / DEG;
  const power = shootFor(r.launch, s);
  const yd = d / YD;
  const what = r.kind === "hole"
    ? `round-model's most robust holing cell round that stroke from here: ${Math.round(100 * r.cell.robust)}% of its 5x5 neighbours hole, ${r.cell.cover} of the 7 aims within 0.03 deg hold a run, its run ${r.cell.run[0].toFixed(4)}-${r.cell.run[1].toFixed(4)} (${r.cell.runN}); ${r.holing} holing cells, ${r.flown} flights${r.truncated ? " (cut short by the time budget)" : ""}`
    : `round-model's stroke from here whose no-cup rest lies ${r.restOffYd.toFixed(3)} yd from that stroke's rest (${r.targetSrc === "model" ? "as the model's replay of it puts it" : "the game's: the model's replay rests elsewhere"}), on the ${r.restLie}${r.lieOk ? "" : ` (the solve's next stroke was from the ${next ? LIE_NAME[next.lie] ?? next.lie : "?"})`}, ${r.toPinYd.toFixed(1)} yd from the pin; ${r.flown} flights`;
  const why = `[playbook-near ${sol.cup} ${s.k}] ${s.club} ${power.toFixed(4)}, aim ${(r.heading / DEG).toFixed(4)} deg (${Math.abs(right).toFixed(2)} deg ${right >= 0 ? "right" : "left"} of the pin line), ${distance.toFixed(1)} yd: the ball ${yd.toFixed(2)} yd from the start of stroke ${s.k} of ${n} of the calm-wind solution (target ${sol.target ?? "?"}, par ${sol.par ?? "?"}; results/solve/${sol.cup}.json: ${s.club} ${gp.toFixed(4)} at ${(s.reached / DEG).toFixed(4)} deg, ${s.holed ? "holed" : `rested ${s.toPin != null ? s.toPin.toFixed(1) : "?"} yd from the pin`}); ${what}; ${Math.round(ms)} ms`;
  const restLie = s.holed ? "cup" : r.restLie ?? (next ? LIE_NAME[next.lie] ?? `lie ${next.lie}` : "?");
  const near = { id: `${sol.cup}.${s.k}#${++nearSeq}`, yd, from: [ball[0], ball[1], ball[2]], lie: st.player.lie, kind: r.kind, launch: r.launch, heading: r.heading, ms: Math.round(ms), flown: r.flown, center: r.center };
  if (r.kind === "hole") Object.assign(near, { cell: r.cell, holing: r.holing, truncated: r.truncated });
  else Object.assign(near, { target: r.target, targetSrc: r.targetSrc, replayOffYd: r.replayOffYd, restOffYd: r.restOffYd, restLie: r.restLie, lieOk: r.lieOk });
  return {
    club: s.club, power, heading: r.heading, k: s.k, cup: sol.cup, why,
    reached: r.heading, gamePower: r.launch, aimErrDeg: 0, of: n, target: sol.target, par: sol.par,
    holed: s.holed, rest: s.rest, toPin: s.holed ? s.toPin : r.toPinYd, offYd: yd, file: `results/solve/${sol.cup}.json`,
    solve: { from: s.from, lie: s.lie, power: s.power, gamePower: s.gamePower, reached: s.reached, requested: s.requested, rest: s.rest, pin: sol.pin, wind: sol.wind ?? CALM },
    near,
    expect: {
      src: "playbook-near", restLie, toPin: s.holed ? 0 : +r.toPinYd.toFixed(1), aimDeg: +right.toFixed(3), distance: +distance.toFixed(2),
      playbook: { cup: sol.cup, k: s.k, of: n, target: sol.target, power, gamePower: r.launch, heading: r.heading, reached: r.heading, holed: s.holed, rest: s.rest, near: { yd: +yd.toFixed(3), kind: r.kind, solvePower: s.power, solveGamePower: s.gamePower, solveReached: s.reached } },
    },
  };
}

// the playbook over the campaign's own files
const main = createPlaybook();
export const lookup = (hole, st, opts) => main.lookup(hole, st, opts);
export const lookupNear = (hole, st, opts) => main.lookupNear(hole, st, opts);
export const chooseWind = (hole, st, opts) => main.chooseWind(hole, st, opts);
export const refresh = () => main.refresh();
export const solutions = () => main.solutions();
export const stats = () => main.stats();

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const s = stats();
  console.log(`playbook: ${s.solved} solved cups (${s.strokes} strokes) of ${s.files} result files in ${path.relative(process.cwd(), SOLVE_DIR) || SOLVE_DIR}${s.errors.length ? `; skipped: ${s.errors.join("; ")}` : ""}`);
  for (const sol of solutions()) console.log(`  ${sol.cup} (${sol.label}, target ${sol.target}): ${sol.strokes.map((x) => `${x.club} ${x.power.toFixed(4)} at ${(x.requested / DEG).toFixed(3)} deg from lie ${x.lie}`).join(", then ")}`);
}
