// How well each shot model predicts where a natural round's strokes come to
// rest: every full shot logged so far (results/round18.json, round 1, and
// results/round-rN.json; putts left out) flown again from its own start,
// heading (the aim the D-pad left, aim.heading = plan.heading - the logged
// aim error), club, launch power (the game's, gamePower), lie and the game's
// wind, by
//   line   the planner's model (round-planner.mjs): src/wsrsim.js run() over
//          lib/course.mjs kclProfile along the heading with windAlong, the rest
//          the stop along the line plus the wind's lateral drift;
//   sim    tools/harness/round-sim.mjs fly() as written (the 3D port over the
//          KCL triangles, never validated before);
//   model  tools/harness/round-model.mjs predict() (round-sim's fixes: the lie
//          yaw, the trees' responses, the first tick's lift, the wind's height
//          ramp, the flagstick, the KCL file itself; its header lists them)
// against the rest the game gave (yd along and across the heading, the rest
// lie, the hazards); and, as a second check, the 588 shots of the 2a sweep
// (results/sweep-*.json: every club at 1-4 bars from all 21 tees, calm), the
// 109 shots of the 2c tree runs (results/trees-*.json) and the eleven WSR
// flights traced tick by tick (state/raw/*.json, from their hand-off).
// Read-only: it prints the tables and, with --json, writes them to that file.
//   node --max-old-space-size=8000 tools/harness/round-eval.mjs [--models line,sim,model]
//        [--parts strokes,sweep,trees,traces,timing] [--json out.json] [--list]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { YD, kcl, groundAt as kclGround, kclProfile, simOf, dropMesh, ATTR_LIE } from "./lib/course.mjs";
import { run } from "../lib/wsrsim.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, "results"), RAW = path.join(HERE, "state", "raw");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const MODELS = arg("--models", "line,sim,model").split(",");
const PARTS = arg("--parts", "strokes,sweep,trees,traces,timing").split(",");
const LIST = process.argv.includes("--list");
const imp = (f) => import(pathToFileURL(path.join(HERE, f)).href);
const Planner = await imp("round-planner.mjs");
const RS = MODELS.includes("sim") ? await imp("round-sim.mjs") : null;
const RM = await imp("round-model.mjs");

// ---- the models ----
const SURF = { 1: "fairway", 2: "rough", 3: "bunker", 6: "green", 9: "fringe", 15: "fairway", 16: "bunker" };
const HAZ_OF_LIE = { water: "water", valley: "valley", outer: "ob", ob: "ob", null: "ob" };
// one vocabulary for the rest lie: the game's lie codes' names
const NORM = { ob: "outer", cupside: "green", cup: "green", sandob: "bunker", ob2: "outer", glass: "water" };
const normLie = (l) => (l == null ? null : NORM[l] ?? l);
// (line) the planner's own computation (round-planner.mjs fullShot)
async function lineModel(hole, s, { calm = false } = {}) {
  const t0 = performance.now();
  const m = await kcl(hole);
  const h = s.heading, dx = Math.sin(h), dz = Math.cos(h), rx = -dz, rz = dx, ball = s.from;
  const prof = await kclProfile(hole, ball[0], ball[2], dx, dz);
  const wind = calm ? null : Planner.windAlong({ wind: { angle: (s.wind.dir * Math.PI) / 4, speedIdx: s.wind.speedIdx } }, dx, dz);
  const o = run({ club: s.club, q: s.q, surface: SURF[s.lie] ?? "fairway", profile: simOf(prof), wind, trace: false });
  const lat = o.lateral ?? 0;
  const x = ball[0] + (dx * o.stop + rx * lat) * YD, z = ball[2] + (dz * o.stop + rz * lat) * YD;
  const g = kclGround(m, x, z);
  const restLie = g ? ATTR_LIE[g.attr] ?? String(g.attr) : null;
  // a hazard: the rest on water, a valley or outer ground, or water / a valley on the line from the carry to the rest
  let hazard = HAZ_OF_LIE[restLie] ?? null;
  if (!hazard) for (let yd = Math.min(o.carry, o.stop); yd <= Math.max(o.carry, o.stop); yd += prof.step) {
    const l = prof.lies[Math.min(prof.n - 1, Math.max(0, prof.i0 + Math.round(yd / prof.step)))];
    if (l === "water" || l === "valley") { hazard = l; break; }
  }
  return { rest: [x, 0, z], carry: o.carry, restLie: normLie(restLie), hazard, holed: false, ms: performance.now() - t0 };
}
// (sim) round-sim.mjs as written: no lie yaw, a tree ends the flight
function simModel(hole, s, { calm = false } = {}) {
  const t0 = performance.now();
  const c = RS.loadCourse(hole);
  const o = RS.fly({ course: c, pos: s.from, heading: s.heading, club: s.club, q: s.q, wind: calm ? null : { angle: (s.wind.dir * Math.PI) / 4, speedIdx: s.wind.speedIdx }, pin: s.pin, flagIn: true, lieAttr: s.lie });
  const hazard = o.outcome === "water" ? "water" : o.outcome === "valley" ? "valley" : o.outcome === "ob" || o.restAttr === 4 ? "ob" : null;
  const carry = RS.alongAcross(s.from, s.heading, o.carry).along;
  return { rest: o.rest, carry, restLie: normLie(o.restLie), hazard, holed: o.outcome === "holed", tree: o.tree?.id ?? null, ms: performance.now() - t0 };
}
// (model) round-model.mjs predict(), as the planner would call it
function newModel(hole, s, { calm = false, spread = false } = {}) {
  const args = { hole, ball: s.from, heading: s.heading, club: s.club, power: s.q, lie: s.lie, wind: calm ? null : s.wind, pin: s.pin };
  const p = spread ? RM.predictSpread(args) : RM.predict(args);
  return { rest: [p.rest[0], p.restY, p.rest[1]], carry: p.carry, restLie: normLie(p.restLie), hazard: p.hazardName, holed: p.holed, tree: p.tree?.id ?? null, spread: p.spread ?? null, ms: p.ms };
}
const FLY = { line: lineModel, sim: simModel, model: newModel };

// ---- statistics ----
const stat = (a) => {
  const v = a.filter((x) => Number.isFinite(x));
  if (!v.length) return null;
  const s = [...v].sort((x, y) => x - y), n = v.length;
  const mean = v.reduce((t, x) => t + x, 0) / n, rms = Math.sqrt(v.reduce((t, x) => t + x * x, 0) / n);
  const worst = v.reduce((w, x) => (Math.abs(x) > Math.abs(w) ? x : w), 0);
  const q = (p) => s[Math.min(n - 1, Math.floor(p * n))];
  return { n, mean, rms, worst, median: q(0.5), p90: q(0.9), p95: q(0.95) };
};
const f1 = (x) => (x == null ? "–" : x.toFixed(1)), f2 = (x) => (x == null ? "–" : x.toFixed(2)), sg = (x) => (x == null ? "–" : `${x >= 0 ? "+" : ""}${x.toFixed(1)}`);
const md = (head, rows) => [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
const out = [];
const say = (s = "") => { out.push(s); console.log(s); };
const json = {};

// ---- the strokes of the natural rounds ----
function loadStrokes() {
  const files = fs.readdirSync(RESULTS).filter((f) => /^round(18|-r\d+)\.json$/.test(f)).sort((a, b) => (a === "round18.json" ? -1 : b === "round18.json" ? 1 : Number(/\d+/.exec(a)) - Number(/\d+/.exec(b))));
  const rows = [];
  for (const f of files) {
    let r;
    try { r = JSON.parse(fs.readFileSync(path.join(RESULTS, f), "utf8")); } catch { continue; }   // a round being written
    const round = f === "round18.json" ? 1 : Number(/round-r(\d+)/.exec(f)[1]);
    for (const [h, H] of Object.entries(r.holes ?? {})) for (const s of H.strokes ?? []) {
      const next = (H.strokes ?? []).find((x) => x.k === s.k + 1);
      if (s.club === "putter" || s.plan?.club === "putter" || [6, 10, 11].includes(s.lie)) continue;
      if (s.gamePower == null || !s.rest || !s.aim) continue;
      rows.push({ round, hole: Number(h), k: s.k, lie: s.lie, from: s.from, heading: s.aim.heading ?? s.plan.heading - (s.aim.errDeg * Math.PI) / 180, club: s.club, q: s.gamePower,
        wind: { dir: s.wind.dir, speedIdx: s.wind.speedIdx }, pin: s.pin, rest: s.rest, hazard: s.hazard ?? 0, holed: !!s.holed, toPin: s.toPin, plan: s.plan,
        nextLie: next && Math.hypot(next.from[0] - s.rest[0], next.from[2] - s.rest[2]) < 1 ? next.lie : null });
    }
  }
  return rows.sort((a, b) => a.hole - b.hole || a.round - b.round || a.k - b.k);
}
const LIE_NAME = { 1: "fairway", 2: "rough", 3: "bunker", 15: "tee", 16: "bunker", 9: "fringe" };
const band = (yd) => (yd < 50 ? "< 50" : yd < 100 ? "50-100" : yd < 150 ? "100-150" : yd < 200 ? "150-200" : yd < 250 ? "200-250" : "250+");
const BANDS = ["< 50", "50-100", "100-150", "150-200", "200-250", "250+"];
const HAZ_NAME = { 0: null, 1: "water", 2: "ob", 3: "valley" };

async function strokes() {
  const rows = loadStrokes();
  say(`## The natural rounds' full shots (${rows.length} strokes, ${new Set(rows.map((r) => r.round)).size} rounds)`);
  say("");
  let cur = null;
  for (const s of rows) {
    if (cur !== s.hole) { if (cur != null) { dropMesh(cur); RM.dropCourse(cur); } cur = s.hole; }
    const m = RM.loadCourse(s.hole);
    const g = RM.groundAt(m, s.rest[0], s.rest[2], { yMax: s.rest[1] + 2 });
    s.actual = { along: RM.alongAcross(s.from, s.heading, s.rest).along, across: RM.alongAcross(s.from, s.heading, s.rest).across,
      // the game's lie for the next stroke from that spot, else the ground under it
      lie: s.holed ? "cup" : s.nextLie != null ? normLie(RM.ATTR_NAME[s.nextLie]) : g ? normLie(RM.ATTR_NAME[g.attr]) : null,
      hazard: HAZ_NAME[s.hazard] ?? (g?.attr === 4 && !s.holed ? "ob" : null) };
    s.pred = {};
    for (const name of MODELS) {
      const p = await FLY[name](s.hole, s, { spread: name === "model" });
      const a = RM.alongAcross(s.from, s.heading, p.rest);
      // a holed ball: no error when the model holes it too, else from its rest to the cup
      const holedOk = s.holed && p.holed;
      const dAlong = holedOk ? 0 : a.along - s.actual.along, dAcross = holedOk ? 0 : a.across - s.actual.across;
      s.pred[name] = { ...p, along: a.along, across: a.across, dAlong, dAcross, d: Math.hypot(dAlong, dAcross) };
    }
  }
  if (cur != null) { dropMesh(cur); RM.dropCourse(cur); }
  // the error rows: strokes the game did not drop (a hazard's rest is the drop spot)
  const clean = rows.filter((s) => !s.actual.hazard);
  const row = (name, set) => {
    const A = stat(set.map((s) => s.pred[name].dAlong)), X = stat(set.map((s) => s.pred[name].dAcross)), D = stat(set.map((s) => s.pred[name].d));
    const lieOk = set.filter((s) => (s.pred[name].holed ? "cup" : s.pred[name].restLie) === s.actual.lie).length;
    return [name, D.n, `${sg(A.mean)} / ${f1(A.rms)}`, `${sg(X.mean)} / ${f1(X.rms)}`, f2(D.median), f2(D.p90), f2(D.p95), f1(D.rms), f1(Math.abs(D.worst)), set.filter((s) => s.pred[name].d > 1).length, set.filter((s) => s.pred[name].d > 3).length, `${lieOk} of ${set.length}`];
  };
  say(`Rest, predicted minus actual (yd along / across the heading; ${clean.length} strokes the game did not drop after a hazard; a holed stroke counts 0 when the model holes it too):`);
  say("");
  say(md(["model", "n", "along mean / rms", "across mean / rms", "total median", "p90", "p95", "rms", "worst", "> 1 yd", "> 3 yd", "rest lie right"], MODELS.map((n) => row(n, clean))));
  say("");
  const compact = (title, groups) => {
    say(`${title} (total error, median / p90 / rms yd):`);
    say("");
    say(md(["", "n", ...MODELS], groups.filter(([, set]) => set.length).map(([k, set]) => [k, set.length, ...MODELS.map((n) => { const D = stat(set.map((s) => s.pred[n].d)); return `${f2(D.median)} / ${f2(D.p90)} / ${f1(D.rms)}`; })])));
    say("");
  };
  compact("By club", ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge"].map((c) => [c, clean.filter((s) => s.club === c)]));
  compact("By distance (the actual rest along the heading)", BANDS.map((b) => [b, clean.filter((s) => band(s.actual.along) === b)]));
  compact("By lie", [1, 15, 2, 3].map((l) => [LIE_NAME[l], clean.filter((s) => s.lie === l || (l === 3 && s.lie === 16))]));
  // hazards: what happened against what each model said
  say("Hazards (water, out of bounds, valley) the game recorded against each model's prediction, over every stroke:");
  say("");
  const kinds = ["water", "ob", "valley", null];
  const hz = MODELS.map((n) => {
    const tp = rows.filter((s) => s.actual.hazard && s.pred[n].hazard === s.actual.hazard).length;
    const fn = rows.filter((s) => s.actual.hazard && s.pred[n].hazard !== s.actual.hazard).length;
    const fp = rows.filter((s) => !s.actual.hazard && s.pred[n].hazard).length;
    return [n, rows.filter((s) => s.actual.hazard).length, tp, fn, fp, rows.filter((s) => s.actual.hazard).map((s) => `r${s.round} h${s.hole} k${s.k} ${s.actual.hazard}: ${s.pred[n].hazard ?? "none"}`).join("; ")];
  });
  say(md(["model", "happened", "predicted", "missed", "false alarms", "each (round, hole, stroke: happened: predicted)"], hz));
  say("");
  const holed = rows.filter((s) => s.holed);
  say(`Holed full shots: ${holed.length} (${holed.map((s) => `r${s.round} h${s.hole} k${s.k} ${s.club}`).join(", ") || "none"}); ` + MODELS.map((n) => `${n} holes ${holed.filter((s) => s.pred[n].holed).length}, false holes ${rows.filter((s) => !s.holed && s.pred[n].holed).length}`).join("; "));
  say("");
  // where the outcome forks: the model's neighbours (power +-0.003, heading +-0.1 deg) scatter
  if (MODELS.includes("model")) {
    const big = clean.filter((s) => s.pred.model.d > 3);
    say(`The stroke's outcome forks where predictSpread's neighbours (power +-0.003, heading +-0.1 deg) scatter: ${[3, 5].map((t) => `spread over ${t} yd on ${clean.filter((s) => s.pred.model.spread > t).length} of ${clean.length} strokes, catching ${big.filter((s) => s.pred.model.spread > t).length} of the ${big.length} the model misses by more than 3 yd`).join("; ")}; the others' total error then: median ${f2(stat(clean.filter((s) => s.pred.model.spread <= 5).map((s) => s.pred.model.d)).median)}, worst ${f1(Math.abs(stat(clean.filter((s) => s.pred.model.spread <= 5).map((s) => s.pred.model.d)).worst))} yd.`);
    say("");
  }
  // the worst strokes of the best model
  const best = MODELS.includes("model") ? "model" : MODELS[MODELS.length - 1];
  const worst = [...clean].sort((a, b) => b.pred[best].d - a.pred[best].d).slice(0, LIST ? clean.length : 12);
  say(`The ${LIST ? "" : "12 "}strokes ${best} misses most (yd):`);
  say("");
  say(md(["round", "hole", "stroke", "lie", "club", "power", "wind", "actual along / across, lie", ...MODELS.map((n) => `${n} along / across, lie (error)`), ...(MODELS.includes("model") ? ["model's spread"] : [])], worst.map((s) => [s.round, s.hole, s.k, LIE_NAME[s.lie] ?? s.lie, s.club, s.q.toFixed(3), `${s.wind.dir}/${s.wind.speedIdx}`, `${f1(s.actual.along)} / ${f1(s.actual.across)} ${s.actual.lie}`, ...MODELS.map((n) => `${f1(s.pred[n].along)} / ${f1(s.pred[n].across)} ${s.pred[n].holed ? "cup" : s.pred[n].restLie}${s.pred[n].tree ? ` (tree ${s.pred[n].tree})` : ""} (${f1(s.pred[n].d)})`), ...(MODELS.includes("model") ? [f1(s.pred.model.spread)] : [])])));
  say("");
  json.strokes = rows.map((s) => ({ round: s.round, hole: s.hole, k: s.k, club: s.club, q: s.q, lie: s.lie, actual: s.actual, pred: Object.fromEntries(MODELS.map((n) => [n, { along: s.pred[n].along, across: s.pred[n].across, d: s.pred[n].d, restLie: s.pred[n].restLie, hazard: s.pred[n].hazard, holed: s.pred[n].holed }])) }));
}

// ---- the 2a sweep: WSR's own carry and rest, calm, from every tee ----
const PLAYABLE = new Set(["fairway", "rough", "green", "fringe", "bunker", "tee"]);
async function sweep() {
  const holes = {};
  for (const f of fs.readdirSync(RESULTS).filter((x) => /^sweep-.*\.json$/.test(x))) for (const [h, H] of Object.entries(JSON.parse(fs.readFileSync(path.join(RESULTS, f), "utf8")).holes)) holes[h] = H;
  const rows = [];
  for (const [h, H] of Object.entries(holes).sort((a, b) => a[0] - b[0])) {
    const hole = Number(h), heading = Math.atan2(H.aim[0], H.aim[1]), c = RM.loadCourse(hole);
    for (const x of H.shots) {
      const s = { from: H.tee, heading, club: x.club, q: x.q, lie: 15, wind: { dir: 0, speedIdx: 0 }, pin: H.pin };
      // report.mjs's clean rule, with its water-over-the-rest test
      const X = H.tee[0] + (H.aim[0] * x.wsr.stop - H.aim[1] * x.wsr.stopAcross) * YD, Z = H.tee[2] + (H.aim[1] * x.wsr.stop + H.aim[0] * x.wsr.stopAcross) * YD;
      const w = RM.groundAt(c, X, Z, { mask: 1 << 7 }), Y = H.tee[1] + x.wsr.restDy * YD;
      const underWater = !!(w && w.y > Y + 0.5);
      const clean = !x.wsr.hazard && !x.wsr.restWater && !underWater && !x.wsr.placed && PLAYABLE.has(x.wsr.restLie ?? "") && x.realRestMatches !== false;
      // no landing and no rest record: the ball sank or left the course before either (the records then hold an earlier shot's)
      const wsrOut = x.wsr.hazard ? HAZ_NAME[x.wsr.hazard] : x.wsr.landFrame < 0 && x.wsr.restFrame < 0 ? "off" : x.wsr.restWater || underWater || x.wsr.restLie === "water" ? "water" : x.wsr.restLie === "outer" ? "ob" : x.wsr.restLie == null ? "off" : null;
      const r = { hole, club: x.club, q: x.q, wsr: x.wsr, clean, wsrOut, pred: {} };
      for (const name of MODELS) {
        const p = await FLY[name](hole, s, { calm: true });
        const a = RM.alongAcross(H.tee, heading, p.rest);
        r.pred[name] = { carry: p.carry, along: a.along, across: a.across, hazard: p.hazard, restLie: p.restLie };
      }
      rows.push(r);
    }
    dropMesh(hole); RM.dropCourse(hole);
  }
  const clean = rows.filter((r) => r.clean);
  say(`## The 2a sweep (${rows.length} WSR shots from the 21 tees, calm; ${clean.length} clean by report.mjs's rule)`);
  say("");
  say("WSR minus each model (yd, mean / rms / worst; the carry where WSR wrote a landing record):");
  say("");
  const cell = (S) => (S ? `${sg(S.mean)} / ${f1(S.rms)} / ${sg(S.worst)}` : "–");
  const tab = (set) => MODELS.map((n) => {
    const C = stat(set.filter((r) => r.wsr.landFrame >= 0).map((r) => r.wsr.carry - r.pred[n].carry));
    const A = stat(set.map((r) => r.wsr.stop - r.pred[n].along)), X = stat(set.map((r) => r.wsr.stopAcross - r.pred[n].across));
    const D = stat(set.map((r) => Math.hypot(r.wsr.stop - r.pred[n].along, r.wsr.stopAcross - r.pred[n].across)));
    return [n, D.n, cell(C), cell(A), cell(X), `${f2(D.median)} / ${f2(D.p90)} / ${f1(D.rms)}`, set.filter((r) => Math.hypot(r.wsr.stop - r.pred[n].along, r.wsr.stopAcross - r.pred[n].across) > 3).length];
  });
  say(md(["model", "n", "carry", "rest along", "rest across", "rest total median / p90 / rms", "> 3 yd"], tab(clean)));
  say("");
  say("By club, rest total (median / p90 / rms yd):");
  say("");
  say(md(["club", "n", ...MODELS], ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge"].map((c) => { const set = clean.filter((r) => r.club === c); return [c, set.length, ...MODELS.map((n) => { const D = stat(set.map((r) => Math.hypot(r.wsr.stop - r.pred[n].along, r.wsr.stopAcross - r.pred[n].across))); return `${f2(D.median)} / ${f2(D.p90)} / ${f1(D.rms)}`; })]; })));
  say("");
  const un = rows.filter((r) => !r.clean);
  const agree = (n) => un.filter((r) => (r.wsrOut === "off" ? !!r.pred[n].hazard : r.wsrOut === r.pred[n].hazard)).length;
  const falseAlarm = (n) => clean.filter((r) => r.pred[n].hazard).length;
  say(`The ${un.length} shots that did not end cleanly (water, outer ground, a valley, off the KCL): the hazard agrees with WSR's on ${MODELS.map((n) => `${n} ${agree(n)}`).join(", ")}; a hazard predicted for a clean shot: ${MODELS.map((n) => `${n} ${falseAlarm(n)}`).join(", ")}.`);
  say("");
  json.sweep = { n: rows.length, clean: clean.length, byModel: Object.fromEntries(MODELS.map((n) => [n, stat(clean.map((r) => Math.hypot(r.wsr.stop - r.pred[n].along, r.wsr.stopAcross - r.pred[n].across)))])) };
}

// ---- the 2c tree runs: WSR's rest distance after a trunk or canopy, calm ----
async function trees() {
  if (!MODELS.includes("model")) return;
  const rows = [];
  for (const f of fs.readdirSync(RESULTS).filter((x) => /^trees-.*\.json$/.test(x))) {
    const T = JSON.parse(fs.readFileSync(path.join(RESULTS, f), "utf8"));
    const c = RM.loadCourse(T.hole), B = T.ball, h0 = Math.atan2(T.tree.mesh[0] - B[0], T.tree.mesh[2] - B[2]);
    for (const x of T.shots) {
      const heading = h0 - x.offset / T.distance;
      const pr = { model: RM.fly({ course: c, pos: B, heading, club: x.club, q: x.q, wind: null, flagIn: false, lieAttr: 1, trace: true }) };
      if (RS && MODELS.includes("sim")) pr.sim = RS.fly({ course: RS.loadCourse(T.hole), pos: B, heading, club: x.club, q: x.q, wind: null, flagIn: false, lieAttr: 1 });
      const kind = (o) => (o.tree ? ((o.tree.code ?? o.tree.code) === 1 ? "trunk" : "canopy") : "none");
      rows.push({ f, contact: x.wsr.contact, rest: x.wsr.rest, pr: Object.fromEntries(Object.entries(pr).map(([n, o]) => [n, { kind: kind(o), rest: Math.hypot(o.rest[0] - B[0], o.rest[2] - B[2]) / YD }])) });
    }
    RM.dropCourse(T.hole);
  }
  const names = Object.keys(rows[0]?.pr ?? {});
  say(`## The 2c tree runs (${rows.length} WSR shots past seven trees, calm)`);
  say("");
  say(md(["model", "WSR's contact verdict agrees", "rest after a canopy: median / p90 / worst (yd)", "after a trunk", "no tree"], names.map((n) => {
    const S = (k) => stat(rows.filter((r) => r.contact === k).map((r) => Math.abs(r.pr[n].rest - r.rest)));
    const fmt = (s) => (s ? `${f2(s.median)} / ${f2(s.p90)} / ${f1(s.worst)} (n ${s.n})` : "–");
    return [n, `${rows.filter((r) => r.pr[n].kind === r.contact).length} of ${rows.length}`, fmt(S("canopy")), fmt(S("trunk")), fmt(S("none"))];
  })));
  say("(sim ends a flight at the tree, so its rest after a contact is the contact point.)");
  say("");
}

// ---- WSR's flights traced tick by tick, continued from their hand-off state ----
async function traces() {
  if (!MODELS.includes("model") || !fs.existsSync(RAW)) return;
  const HOLE = { h01: 1, h07: 7, h10: 10, h13: 13 };
  const TEE_Y = { 10: 194.95 };   // the ball at address on hole 10's tee (the wind's ramp counts from it)
  const lines = [];
  for (const f of fs.readdirSync(RAW).filter((x) => x.endsWith(".json")).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(RAW, f), "utf8"));
    if (!d.handoff || !d.path?.length) continue;
    const hole = HOLE[/h\d\d/.exec(f)?.[0]];
    if (!hole) continue;
    const c = RM.loadCourse(hole), h = d.handoff;
    const o = RM.fly({ course: c, pos: h.pos, heading: Math.atan2(h.launchVel[0], h.launchVel[2]), club: d.club, q: d.power, wind: d.wind, flagIn: false, lieAttr: 15, trace: true, traceEvery: 1, state0: { life: h.life, vel: h.vel, lift: h.lift }, groundY: TEE_Y[hole] });
    const mp = new Map(o.path.map((p) => [p[3], p]));
    let maxErr = 0, land = null;
    for (const r of d.path) { if (r[8] && land == null) land = r[0]; const p = mp.get(r[0]); if (p && land == null) maxErr = Math.max(maxErr, Math.hypot(p[0] - r[1], p[1] - r[2], p[2] - r[3])); }
    const last = d.path[d.path.length - 1], end = o.path[o.path.length - 1];
    const water = o.outcome === "water";
    lines.push([f.replace(".json", ""), d.club, d.power, d.wind?.speedIdx ? `${2 * d.wind.speedIdx} mph` : "calm", maxErr.toFixed(3), water ? "water (both)" : f2(Math.hypot(end[0] - last[1], end[2] - last[3]) / YD), water ? "–" : `${o.ticks} / ${last[0]}`]);
    RM.dropCourse(hole);
  }
  say(`## WSR's own flights traced tick by tick (${lines.length}), round-model.mjs continued from each hand-off state`);
  say("");
  say(md(["trace", "club", "power", "wind", "worst flight error before the landing (u)", "rest error (yd)", "ticks model / WSR"], lines));
  say("");
}

// ---- the planner's budget: predict() per call ----
async function timing() {
  if (!MODELS.includes("model")) return;
  const rows = loadStrokes().slice(0, 200);
  const ms = [];
  let cur = null;
  for (const s of rows) {
    if (cur !== s.hole) { if (cur != null) RM.dropCourse(cur); cur = s.hole; const t0 = performance.now(); RM.loadCourse(s.hole); ms.load ??= []; ms.load.push(performance.now() - t0); }
    for (const dq of [0, -0.02, 0.02]) ms.push(RM.predict({ hole: s.hole, ball: s.from, heading: s.heading, club: s.club, power: Math.max(0.1, s.q + dq), lie: s.lie, wind: s.wind, pin: s.pin }).ms);
  }
  const S = stat(ms), L = stat(ms.load ?? []);
  say(`## Speed: predict() ${S.n} calls, ${f2(S.mean)} ms mean, ${f2(S.p95)} ms p95, ${f1(Math.abs(S.worst))} ms worst (50 candidates: ${(50 * S.mean / 1000).toFixed(2)} s); a hole's course loads in ${f1(L?.mean)} ms (once per hole)`);
  say("");
}

if (PARTS.includes("strokes")) await strokes();
if (PARTS.includes("sweep")) await sweep();
if (PARTS.includes("trees")) await trees();
if (PARTS.includes("traces")) await traces();
if (PARTS.includes("timing")) await timing();
const J = arg("--json", null);
if (J) fs.writeFileSync(J, JSON.stringify({ at: new Date().toISOString(), models: MODELS, tables: out.join("\n"), ...json }, null, 1));
