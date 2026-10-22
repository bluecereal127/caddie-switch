// The stroke planner of a natural WSR round (tools/harness/round-play.mjs
// imports it afresh before every stroke, so it can be improved while the
// round goes on). It only reads the state the caller passes; nothing here
// touches the game. Everything it knows is what a player sees (the ball, the
// pin, the lie, the wind the game drew) plus the course's own geometry (the
// KCL triangles, the trees), the port of WSR's ball (src/wsrsim.js) and what
// the harness's own earlier strokes showed (results/knowledge/strokes.jsonl:
// each stroke's plan against where the ball went; round-play.mjs adds every
// stroke it plays).
// - Full shots: launch lines round the line to the pin and round the game's
//   own line, every club the lie allows at powers 0.10 to its cap in 0.02
//   steps (the best refined to 0.01), each flown by the port over the KCL
//   profile of its line WITH the game's wind (run({ wind }), WSR's wind law,
//   which the harness found the port to follow to 0.3 yd at every power);
//   the rest point is the stop along the line plus the wind's lateral drift.
//   From rough or sand the ball leaves 2 deg right of the aim (LIE_YAW), so
//   the aim is the launch line turned back by it. A candidate must come to
//   rest on fairway, tee, green, fringe, rough or bunker with no hazard on
//   the line from its carry to its stop, its landing and rest kept clear of
//   water, out of bounds and valleys by a margin; it is scored by how far it
//   rests from the pin plus a lie penalty (rough 4, bunker 12, fringe 0.5)
//   and a little for less lofted clubs. When it cannot finish near the pin,
//   six distinct rests are valued by the best second shot from each (a
//   coarse search refined round its best), plus 1 yd for a rest in rough and
//   3 in sand, and tried first in that order. The candidates are then flown
//   again, traced, through the app's tree check (src/trees.js) and a trunk
//   gap; the first that clears every tree by 2 yd is taken, else the first by
//   1, else by 0. Every candidate is tried (hole 14's second stroke of rounds
//   10 and 11 found its first clear shot at #511 of 3,880, past an old cap of
//   300). Nothing clear: the same search over launch lines all round the ball.
// - What earlier strokes showed: a line that put a ball into a tree or a
//   hazard, or 15 yd and more from where the port said, from within 4 yd of
//   this ball is not tried again (rounds 10 and 11 hit hole 14's trees from
//   the same spot twice running); a candidate that repeats an earlier stroke
//   (same hole and lie, ball within 1.5 yd, club, power within 0.006, launch
//   line within 0.3 deg, the same wind) is moved by that stroke's miss of its
//   own port prediction (the game is deterministic: identical strokes rest
//   alike). The match was 3 yd / 0.03 / 1.5 deg until 2026-10-22: 0.03 of
//   power is 6-9 yd of a driver, and the "repeats" it found landed on other
//   ground (over the course attempts the corrected strokes missed their plans
//   by 9.1 yd on Resort C and 7.1 on Classic B, against 5.9 and 3.9).
// - On the green: the strength-forgiving read made with WSR's tick over the
//   green's KCL triangles (lib/kclputt.mjs), searched round the app's read
//   (src/putt.js solvePutt), which stands if the port finds no holing line.
// - On the fringe: lib/play.mjs planStroke's putt over the KCL line.
//
// CANDIDATE (2026-10-22, not live): the same planner with WSR's ball flown in
// 3D over the hole's own KCL triangles (lib/kclshot.mjs shot3d: run()'s tick
// over the triangles round the ball, cross-slopes, banks and walls included;
// against the harness's real strokes it rests a median 0.19 yd from the game,
// p90 1.6, where the 2D port above misses by 3.4 / 14). Where it pays:
// - the 2D scan still generates the candidates, but its roll check lets a
//   roll cross out-of-bounds ground (KCL 4, "outer") or a wall (12): WSR
//   bounces and rolls on outer ground and only a ball RESTING there is out of
//   bounds (FINDINGS.md; rounds 2 and 3 landed hole 12's drive on the forest
//   floor and it rested on the island fairway). Such a candidate (`rel`) is
//   only ever taken on its 3D flight. Water, valleys and no ground still reject.
// - the first N3D_FIRST candidates in ranking order are flown again in 3D,
//   and so is every candidate the later steps reach (the two-shot picks, the
//   tree loop) up to N3D_MAX flights a search: the 3D flight replaces its
//   carry, stop, drift, rest, rest lie and yd from the pin; a 3D hazard
//   (water, valley, a rest on outer ground or below the course) or a rest off
//   the legal lies rejects it; a repeat of an earlier stroke is moved by that
//   stroke's miss of ITS 3D flight. A candidate the budget leaves unflown is
//   judged as before (2D, the strict roll check).
// - the hazard margins on a 3D flight: its landing (the first contact) keeps
//   the margin from water, valleys and no ground but not from outer ground
//   (it bounces there); its rest keeps the full margin (outer ground too).
// - the two-shot picks value the 3D rests; the tree check and the trunk gap
//   read the 3D path.
// - a 3D candidate is taken only when it is robust: flown at q -+0.01 and the
//   launch -+1 deg it still rests on a legal lie with no hazard, and its first
//   contact is not within SEAM_YD of an outer-ground seam (the model's one
//   known knife edge: hole 12's q 1.00 drive landing on the island's lip).
// - predictAlong adds the 3D flight to `pred` (pred.k3d), and knowRow marks a
//   stroke failed when it rests 15 yd from THAT (the model the plan was made
//   with); rows without pred.k3d are judged against the 2D port as before.
// plan(hole, st, { k3d: false }) is the live planner, unchanged.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { YD, kcl, groundAt, kclProfile, simOf, ATTR_LIE } from "./lib/course.mjs";
import { shot3dSync } from "./lib/kclshot.mjs";
import { lineTrees, appTreeCheck } from "./lib/apptrees.mjs";
import { greenModel, P } from "./lib/green.mjs";
import { planStroke } from "./lib/play.mjs";
import { run } from "../lib/wsrsim.mjs";
import { packGreen, fastPutt } from "./lib/kclputt.mjs";
import * as RM from "./round-model.mjs";

// WSR's own trees, flagstick and out of bounds, the last word on a candidate
// before it is taken: round-model.mjs predict() (WSR's tick over the disc's own
// KCL and placement files, trees by their collision shapes; a median 0.02 yd
// from where 443 logged strokes rested). A candidate it puts into water, out
// of bounds or a valley, onto a lie that is not in play, into a tree that
// moves its rest 4 yd or more, or 8 yd and more from the 3D rest, is not taken
// (Classic C #20's hole 16 drive came down out of bounds off t16-94's canopy,
// which the app's tree check passed by 8.4 yd; round-model put it 109.6 yd from
// the pin, where it rested). If round-model cannot run, nothing is vetoed.
function rmVeto(hole, ball, c, yaw, st) {
  try {
    const p = RM.predict({ hole, ball, heading: c.line.h + yaw, club: c.club, power: c.q, lie: st.player.lie, wind: { dir: st.wind.dir, speedIdx: st.wind.speedIdx, angle: st.wind.angle }, pin: st.pin });
    if (p.holed) return null;
    const tree = p.tree ? ` (${p.tree.code === 1 ? "the trunk" : "the canopy"} of ${p.tree.id})` : "";
    if (p.hazard) return `${p.hazardName || "a hazard"}${tree}`;
    if (!(p.restLie in PEN)) return `rests on ${p.restLie}${tree}`;
    const d = Math.hypot(p.rest[0] - c.rest[0], p.rest[1] - c.rest[1]) / YD;
    if (p.tree && d >= 4) return `rests ${d.toFixed(0)} yd from the 3D rest${tree}`;
    if (d >= 8) return `rests ${d.toFixed(0)} yd from the 3D rest`;
    return null;
  } catch { return null; }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLUBS_BY_LOFT = ["wedge", "9iron", "7iron", "5iron", "3iron", "spoon", "driver"];
export const CLUB_INDEX = { driver: 0, spoon: 1, "3iron": 2, "5iron": 3, "7iron": 4, "9iron": 5, wedge: 6, putter: 7 };
const BUNKER_CAP = { driver: 0.25, spoon: 0.25, "3iron": 0.5, "5iron": 0.5, "7iron": 0.5, "9iron": 0.5, wedge: 0.75 };
const capOf = (club, lie) => (lie === 2 ? 0.75 : lie === 3 || lie === 16 ? BUNKER_CAP[club] : 1.0);
const SURF = { 1: "fairway", 2: "rough", 3: "bunker", 6: "green", 9: "fringe", 15: "fairway", 16: "bunker" };
const LIE_OF_ATTR = { 1: "fairway", 2: "rough", 3: "bunker", 6: "green", 9: "fringe", 10: "green", 11: "green", 15: "tee" };
const PEN = { fairway: 0, tee: 0, green: 0, fringe: 0.5, rough: 4, bunker: 12 };
// the second-shot ranking's lean against approaching from rough or sand (yd)
const LIE_TIE = { rough: 1, bunker: 3 };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const DEG = Math.PI / 180;

// From rough or sand a straight swing leaves 2 deg off the aim: WSR's lie yaw
// (wsr-swing-redzone-spin.md 4.1: exactly 2.000 deg for a straight swing or
// from 180 yd and more; which side was left open there). The natural rounds
// give the side: their 86 rough strokes flown again by the port along the aim
// turned 2 deg right (the heading less 2 deg) miss where the ball rested by
// 2.5 yd at the median, against 5.9 along the aim; the six from sand 1.1
// against 3.8; fairway strokes fit best along the aim (2.2). The search works
// in launch lines and aims each one at the launch line plus the yaw.
export const LIE_YAW = { 2: 2 * DEG, 3: 2 * DEG };
export const launchOf = (aim, lie) => aim - (LIE_YAW[lie] ?? 0);

// water, out of bounds or a valley within r yd of (x, z), or no ground at
// all: the port flies a level-across line, so a ball that drifts in the wind
// or rolls off a bank sideways can find a lake beside the line (rounds 3 and
// 4 on hole 14 both did); landings and rests keep a margin from them
const HAZ = new Set([4, 5, 7, 13]);
// a 3D flight's landing: outer ground is not a hazard to bounce on
const HAZ_LAND = new Set([5, 7, 13]);
export function nearHazard(m, x, z, r, haz = HAZ) {
  for (const f of [1, 0.5]) for (let a = 0; a < 8; a++) {
    const t = (a * Math.PI) / 4, g = groundAt(m, x + Math.sin(t) * r * f * YD, z + Math.cos(t) * r * f * YD);
    if (!g || haz.has(g.attr)) return true;
  }
  return false;
}
const marginYd = (yd) => 2 + 0.025 * yd;

// the 3D flight's budget per search (fullShot): the first N3D_FIRST in the
// ranking, then lazily whatever the picks and the tree loop reach, up to
// N3D_MAX in all (a count, not a clock, so a plan does not depend on the
// machine's load); the robustness flights (4 a taken candidate) come on top
export const N3D_FIRST = 150, N3D_MAX = 600;
export const ROBUST = { dq: 0.01, dh: 1 * (Math.PI / 180) };
export const SEAM_YD = 1;
export const USE_3D = process.env.PLANNER_3D !== "0";

// the least gap (yd) between the ball's path and a trunk, less the margin the
// path's own error needs at that point of it: none at the ball, growing to
// 1 yd by 8 yd out (0.2 + 0.1 yd a yard), plus 1.5 % of the distance along
// (k scales it: 0.5 for the relaxed search). The app's tree check
// (src/trees.js treeCheck) weighs a canopy's clearance, not the trunk's
// sideways gap, and checks the flight and 5 yd of the bounce only; rounds 2
// and 3 both put hole 16's second stroke into tree t16-4's trunk on a path it
// passed "under by 2.4 yd", 0.5 yd from the trunk. Over the whole path (the
// roll too), wherever the ball is within a trunk's height. (The margin was a
// flat 1 yd + 1.5 % of the tree's distance until Classic B #3's hole 14: its
// ball came to rest 1.4 yd behind t14-46's trunk, every path then failed at
// its very first point, even those leaving the tree behind, and the old
// fallback hit the trunk five times running.)
const TRUNK = { 2: { r: 6, top: 60 }, 3: { r: 4.4, top: 70 }, 6: { r: 7, top: 132 } };
const trunkNeed = (a) => Math.min(1, 0.2 + 0.1 * Math.max(0, a)) + 0.015 * Math.max(0, a);
function trunkGap(trees, o, k = 1) {
  let worst = Infinity;
  for (const t of trees ?? []) {
    const T = TRUNK[t.kind];
    if (!T) continue;
    const r = (T.r * t.sx + 0.5) / YD, top = (T.top * t.sy) / YD;
    for (const p of o.path ?? []) {
      const [a, y, lat = 0] = p, hb = y - (t.z ?? 0);
      if (hb < -r || hb > top + r || Math.abs(a - t.s) > r + 6) continue;
      const gap = Math.hypot(a - t.s, lat - t.l) - r - k * trunkNeed(a);
      if (gap < worst) worst = gap;
    }
  }
  return worst;
}
// a candidate's landing and rest, each with its margin (times k), clear of hazards
function clearOf(m, ball, c, k = 1) {
  const { dx, dz } = c.line, lat = c.o.lateral ?? 0, f = c.o.stop > 0 ? Math.min(1, c.o.carry / c.o.stop) : 1;
  const lx = ball[0] + (dx * c.o.carry - dz * lat * f) * YD, lz = ball[2] + (dz * c.o.carry + dx * lat * f) * YD;
  return !nearHazard(m, lx, lz, k * marginYd(c.o.carry)) && !nearHazard(m, c.rest[0], c.rest[1], k * marginYd(c.o.stop));
}
// the same for a candidate flown in 3D: its own first contact (no margin from
// outer ground there: WSR bounces on it) and its 3D rest (the full margin)
function clear3d(m, c, k = 1) {
  const L = c.first3;
  return !(L && nearHazard(m, L[0], L[2], k * marginYd(c.o.carry), HAZ_LAND)) && !nearHazard(m, c.rest[0], c.rest[1], k * marginYd(c.o.stop));
}
const clr = (m, ball, c, k = 1) => (c.k3d ? clear3d(m, c, k) : clearOf(m, ball, c, k));
const deg = (r) => (r * 180) / Math.PI;

// the game's wind relative to a heading, for run(): mph (WSR: 2 per speed
// index), deg 0 = a tailwind, 90 = toward the right (the air moving along
// (sin a, cos a) in x east / z south, fieldManager+0x78)
export function windAlong(st, dx, dz) {
  if (!st.wind.speedIdx) return null;
  const a = st.wind.angle, wx = Math.sin(a), wz = Math.cos(a);
  return { mph: 2 * st.wind.speedIdx, deg: deg(Math.atan2(wx * -dz + wz * dx, wx * dx + wz * dz)) };
}

// What the harness's earlier strokes showed (results/knowledge/strokes.jsonl,
// one stroke a line: hole, the ball, lie, club, game power q, the launch line
// `launch` (the aim less the lie yaw), wind, the port's prediction along the
// launch line `pred` { stop, lateral } and where the ball went: `end`, the
// rest or, for a hazard, the spot the game took it from; `fail` when it went
// into a hazard or a tree or rested 15 yd and more from the prediction).
export const KNOW = path.join(HERE, "results", "knowledge", "strokes.jsonl");
let known = { mtime: -1, rows: [] };
export function knowledge() {
  try {
    const t = fs.statSync(KNOW).mtimeMs;
    if (t !== known.mtime) {
      // a later row of the same stroke replaces the earlier one (round-play.mjs
      // marks a stroke failed when the game put the ball back where it was hit)
      const bySrc = new Map();
      let i = 0;
      for (const l of fs.readFileSync(KNOW, "utf8").split("\n")) { if (!l) continue; try { const r = JSON.parse(l); bySrc.set(r.src ?? `row ${i++}`, r); } catch { /* a torn line */ } }
      known = { mtime: t, rows: [...bySrc.values()] };
    }
  } catch { known = { mtime: -1, rows: [] }; }
  return known.rows;
}
const near = (a, b, yd) => Math.hypot(a[0] - b[0], a[2] - b[2]) / YD < yd;
// the port's flight of a stroke along its launch line, at the power the game
// launched it with (a knowledge row's pred)
export async function predictAlong(hole, from, lie, wind, club, q, launch) {
  const dx = Math.sin(launch), dz = Math.cos(launch), prof = await kclProfile(hole, from[0], from[2], dx, dz);
  if (!prof) return null;
  const o = run({ club, q, surface: SURF[lie] ?? "fairway", profile: simOf(prof), wind: windAlong({ wind }, dx, dz), trace: false });
  const pred = { carry: +o.carry.toFixed(2), stop: +o.stop.toFixed(2), lateral: +(o.lateral ?? 0).toFixed(2) };
  // the 3D flight too (additive: old readers see the 2D fields unchanged)
  if (USE_3D) {
    const m = await kcl(hole);
    if (m) {
      const s = shot3dSync(m, { from, launch, club, q, lie, wind: windAlong({ wind }, dx, dz) });
      pred.k3d = { carry: +s.carry.toFixed(2), stop: +s.stop.toFixed(2), lateral: +(s.lateral ?? 0).toFixed(2), hazard: s.hazard, restLie: ATTR_LIE[s.restAttr] ?? s.restAttr };
    }
  }
  return pred;
}
// a played stroke as a knowledge row (wind = { dir, speedIdx, angle })
export function knowRow({ src, at, hole, k, lie, from, pin, wind, club, q, aim, pred, rest, hazard = 0, placed = null, holed = false }) {
  const launch = club === "putter" ? aim : launchOf(aim, lie);
  const end = hazard && placed ? placed.from : rest;
  let fail = null;
  if (hazard) fail = `hazard ${hazard}`;
  else if (pred && !holed && club !== "putter") {
    // against the 3D flight when the row has one (the model the plan used)
    const P = pred.k3d && !pred.k3d.hazard ? pred.k3d : pred;
    const dx = Math.sin(launch), dz = Math.cos(launch);
    const px = from[0] + (dx * P.stop - dz * P.lateral) * YD, pz = from[2] + (dz * P.stop + dx * P.lateral) * YD;
    const miss = Math.hypot(end[0] - px, end[2] - pz) / YD;
    if (miss >= 15) fail = `rested ${miss.toFixed(0)} yd from the port's rest`;
  }
  return { src, at, hole, k, lie, from, pin, wind: { dir: wind.dir, speedIdx: wind.speedIdx }, club, q, aim, launch, pred, end, rest, hazard, holed, fail };
}
export function appendKnow(row) { fs.mkdirSync(path.dirname(KNOW), { recursive: true }); fs.appendFileSync(KNOW, JSON.stringify(row) + "\n"); }
// the lines that failed from about here
function failedLines(hole, ball) {
  return knowledge().filter((r) => r.hole === hole && r.fail && r.club !== "putter" && near(r.from, ball, 4)).map((r) => ({ h: r.launch, why: r.fail, club: r.club, src: r.src }));
}
// an earlier stroke this candidate repeats, with its miss of the port in its
// own launch frame (along, across); q is the power the game launched with
// and pred the port's flight at it
function repeatOf(hole, ball, c, st) {
  let best = null;
  for (const r of knowledge()) {
    if (r.hole !== hole || r.fail || r.club !== c.club || !r.pred || !r.end || r.hazard || r.lie !== st.player.lie) continue;
    if (Math.abs(r.q - c.q) > 0.006 || Math.abs(angDiff(r.launch, c.line.h)) > 0.3 * DEG || !near(r.from, ball, 1.5)) continue;
    if (r.wind?.dir !== st.wind.dir || r.wind?.speedIdx !== st.wind.speedIdx) continue;
    const e = Math.abs(r.q - c.q) / 0.006 + Math.abs(angDiff(r.launch, c.line.h)) / (0.3 * DEG) + Math.hypot(r.from[0] - ball[0], r.from[2] - ball[2]) / (1.5 * YD);
    if (best && e >= best.e) continue;
    const dx = Math.sin(r.launch), dz = Math.cos(r.launch), ex = r.end[0] - r.from[0], ez = r.end[2] - r.from[2];
    best = { e, src: r.src, row: r, along: (ex * dx + ez * dz) / YD - r.pred.stop, across: (ex * -dz + ez * dx) / YD - r.pred.lateral };
  }
  return best;
}
// an earlier stroke's miss of its own 3D flight (along, across its launch
// line, yd), flown again from the row; cached by the row
const rep3 = new Map();
function repeat3dOf(m, r) {
  const key = `${r.src}|${r.at}`;
  if (rep3.has(key)) return rep3.get(key);
  const dx = Math.sin(r.launch), dz = Math.cos(r.launch);
  const s = shot3dSync(m, { from: r.from, launch: r.launch, club: r.club, q: r.q, lie: r.lie, wind: windAlong({ wind: { ...r.wind, angle: (r.wind.dir * Math.PI) / 4 } }, dx, dz) });
  const ex = r.end[0] - s.rest[0], ez = r.end[2] - s.rest[2];
  const v = { along: (ex * dx + ez * dz) / YD, across: (ex * -dz + ez * dx) / YD, hazard3d: s.hazard };
  rep3.set(key, v);
  return v;
}

async function fullShot(hole, st, target, { wide = false, k3d = USE_3D } = {}) {
  const ball = st.ball.pos, lie = st.player.lie, surface = SURF[lie] ?? "fairway";
  const m = await kcl(hole);
  const clubs = lie === 3 || lie === 16 ? CLUBS_BY_LOFT.slice(0, 5) : CLUBS_BY_LOFT;
  const yaw = LIE_YAW[lie] ?? 0;
  const toT = Math.atan2(target[0] - ball[0], target[2] - ball[2]), game = launchOf(Math.atan2(st.player.aim[0], st.player.aim[1]), lie);
  const heads = [];
  if (wide) for (let d = 0; d < 360; d += 10) heads.push(toT + d * DEG);
  else {
    for (const d of [0, 1, -1, 2, -2, 3, -3, 4, -4, 6, -6, 8, -8, 10, -10, 13, -13, 16, -16, 20, -20]) heads.push(toT + d * DEG);
    for (const d of [0, 3, -3, 6, -6]) heads.push(game + d * DEG);
  }
  const failed = failedLines(hole, ball);
  const avoided = new Set();
  let cands = [];
  const seen = [];
  const stats = { n2d: 0, rel: 0, n3d: 0, rej3d: 0, robustFlights: 0, notRobust: 0 };
  for (const h of heads) {
    if (seen.some((s) => Math.abs(angDiff(s, h)) < 0.25 * DEG)) continue;
    seen.push(h);
    const f = failed.find((r) => Math.abs(angDiff(r.h, h)) < 2.5 * DEG);
    if (f) { avoided.add(`${deg(angDiff(f.h, toT)).toFixed(1)} deg (${f.why}, ${f.src})`); continue; }
    const dx = Math.sin(h), dz = Math.cos(h), rx = -dz, rz = dx;
    const prof = await kclProfile(hole, ball[0], ball[2], dx, dz);
    if (!prof) continue;
    const at = (yd) => prof.lies[Math.min(prof.n - 1, Math.max(0, prof.i0 + Math.round(yd / prof.step)))];
    const line = { h, dx, dz, prof, at, sim: simOf(prof), wind: windAlong(st, dx, dz), trees: null };
    for (const [ci, club] of clubs.entries()) {
      for (let k = Math.round(Math.min(capOf(club, lie), 1) * 100); k >= 10; k -= wide ? 4 : 2) {
        const q = k / 100, o = run({ club, q, surface, profile: line.sim, wind: line.wind, trace: false });
        stats.n2d++;
        const lat = o.lateral ?? 0;
        const sx = ball[0] + (dx * o.stop + rx * lat) * YD, sz = ball[2] + (dz * o.stop + rz * lat) * YD;
        const g = groundAt(m, sx, sz);
        const restLie = g ? LIE_OF_ATTR[g.attr] : null;
        if (!(restLie in PEN)) continue;
        // the roll from the carry to the stop: no water, valley or missing
        // ground; with the 3D flight to judge it, outer ground and walls only
        // mark the candidate `rel` (taken on its 3D flight alone)
        let bad = false, rel = false;
        for (let yd = Math.min(o.carry, o.stop); yd <= Math.max(o.carry, o.stop) + 1e-9 && !bad; yd += prof.step) {
          const l = at(yd);
          if (l in PEN || l === "tee") continue;
          if (k3d && (l === "outer" || l === "wall")) rel = true;
          else bad = true;
        }
        if (bad) continue;
        if (rel) stats.rel++;
        const yd = Math.hypot(sx - target[0], sz - target[2]) / YD;
        cands.push({ line, club, q, o, restLie, rest: [sx, sz], yd, extra: 0.3 * ci, score: yd + PEN[restLie] + 0.3 * ci, rel });
      }
    }
  }
  cands.sort((a, b) => a.score - b.score);
  // the coarse scan steps 0.02; the best few are refined to 0.01 either side
  const refine = [];
  for (const c of cands.slice(0, 10)) {
    for (const dq of [-0.01, 0.01]) {
      const q = +(c.q + dq).toFixed(2), cap = Math.min(capOf(c.club, lie), 1);
      if (q < 0.1 || q > cap + 1e-9) continue;
      const o = run({ club: c.club, q, surface, profile: c.line.sim, wind: c.line.wind, trace: false });
      const lat = o.lateral ?? 0, { dx, dz } = c.line;
      const sx = ball[0] + (dx * o.stop - dz * lat) * YD, sz = ball[2] + (dz * o.stop + dx * lat) * YD;
      const g = groundAt(m, sx, sz), restLie = g ? LIE_OF_ATTR[g.attr] : null;
      if (!(restLie in PEN)) continue;
      const yd = Math.hypot(sx - target[0], sz - target[2]) / YD;
      refine.push({ ...c, q, o, restLie, rest: [sx, sz], yd, score: yd + PEN[restLie] + c.extra });
    }
  }
  cands.push(...refine);
  // a candidate that repeats an earlier stroke rests where that one did,
  // relative to the port (the port's prediction moved by that stroke's miss)
  for (const c of cands) {
    const r = repeatOf(hole, ball, c, st);
    if (!r) continue;
    const { dx, dz } = c.line, sx = c.rest[0] + (dx * r.along - dz * r.across) * YD, sz = c.rest[1] + (dz * r.along + dx * r.across) * YD;
    const g = groundAt(m, sx, sz), restLie = g ? LIE_OF_ATTR[g.attr] : null;
    c.repeat = r;
    if (!(restLie in PEN)) { c.score = Infinity; continue; }
    c.rest = [sx, sz]; c.restLie = restLie; c.yd = Math.hypot(sx - target[0], sz - target[2]) / YD; c.score = c.yd + PEN[restLie] + c.extra;
  }
  cands = cands.filter((c) => c.score < Infinity);
  cands.sort((a, b) => a.score - b.score);

  // the 3D flight of a candidate (once): its carry, stop, drift, rest, rest
  // lie and yd from the pin replace the 2D port's; a hazard or a rest off the
  // legal lies sets its score to Infinity
  const fly3d = (c) => {
    if (c.k3d) return c.score < Infinity;
    if (stats.n3d >= N3D_MAX) return false;
    stats.n3d++;
    const s = shot3dSync(m, { from: ball, launch: c.line.h, club: c.club, q: c.q, lie, wind: c.line.wind });
    c.k3d = true; c.o2 = c.o; c.lie2 = c.restLie; c.yd2 = c.yd;
    c.o = { carry: s.carry, stop: s.stop, lateral: s.lateral ?? 0 };
    c.first3 = s.first ?? s.rest;
    c.hazard3 = s.hazard;
    if (s.hazard) { c.score = Infinity; stats.rej3d++; return false; }
    let rest = [s.rest[0], s.rest[2]], restLie = LIE_OF_ATTR[s.restAttr];
    if (c.repeat) {
      const r3 = repeat3dOf(m, c.repeat.row), { dx, dz } = c.line;
      rest = [rest[0] + (dx * r3.along - dz * r3.across) * YD, rest[1] + (dz * r3.along + dx * r3.across) * YD];
      const g = groundAt(m, rest[0], rest[1]);
      restLie = g ? LIE_OF_ATTR[g.attr] : null;
      c.repeat = { ...c.repeat, along: r3.along, across: r3.across, k3d: true };
    }
    if (!(restLie in PEN)) { c.score = Infinity; stats.rej3d++; return false; }
    c.rest = rest; c.restLie = restLie; c.yd = Math.hypot(rest[0] - target[0], rest[1] - target[2]) / YD;
    c.score = c.yd + PEN[restLie] + c.extra;
    return true;
  };
  // a 3D candidate is taken only when its neighbours (q -+0.01, the launch
  // -+1 deg) rest on a legal lie too and its first contact is clear of an
  // outer-ground seam; a repeat of an earlier stroke needs neither (the game
  // is deterministic and that stroke rested legally). null = robust
  const cap0 = (club) => Math.min(capOf(club, lie), 1);
  const robust = (c) => {
    if (!c.k3d || c.repeat) return null;
    if (c.robust !== undefined) return c.robust;
    let why = null;
    for (const [dq, dh] of [[-ROBUST.dq, 0], [ROBUST.dq, 0], [0, ROBUST.dh], [0, -ROBUST.dh]]) {
      const q = +(c.q + dq).toFixed(4), h = c.line.h + dh;
      if (q < 0.1 - 1e-9 || q > cap0(c.club) + 1e-9) continue;
      stats.robustFlights++;
      const s = shot3dSync(m, { from: ball, launch: h, club: c.club, q, lie, wind: dh ? windAlong(st, Math.sin(h), Math.cos(h)) : c.line.wind });
      const l = LIE_OF_ATTR[s.restAttr];
      if (s.hazard || !(l in PEN)) { why = `at ${dq ? `q ${q.toFixed(2)}` : `${dh > 0 ? "+" : ""}${deg(dh).toFixed(0)} deg`} it ${s.hazard === 1 ? "finds water" : s.hazard === 3 ? "finds a valley" : s.hazard === 2 ? "is out of bounds" : `rests on ${ATTR_LIE[s.restAttr] ?? s.restAttr}`}`; break; }
    }
    if (!why && c.first3) {
      let out = false, legal = false;
      for (const f of [1, 0.5]) for (let a = 0; a < 8; a++) {
        const t = (a * Math.PI) / 4, g = groundAt(m, c.first3[0] + Math.sin(t) * SEAM_YD * f * YD, c.first3[2] + Math.cos(t) * SEAM_YD * f * YD);
        if (!g) continue;
        if (g.attr === 4) out = true; else if (LIE_OF_ATTR[g.attr] in PEN) legal = true;
      }
      if (out && legal) why = `it lands within ${SEAM_YD} yd of an out-of-bounds seam`;
    }
    if (why) stats.notRobust++;
    c.robust = why;
    return why;
  };
  // the first N3D_FIRST in the ranking flown in 3D, then ranked again; a
  // candidate only the relaxed roll check let in is dropped unless flown
  if (k3d) {
    for (let i = 0, n = 0; i < cands.length && n < N3D_FIRST; i++) { n++; fly3d(cands[i]); }
    cands = cands.filter((c) => c.score < Infinity);
    cands.sort((a, b) => a.score - b.score);
  }
  // fly a candidate the ranking reaches (lazily, within N3D_MAX); false: skip it
  // (its 3D flight rejects it, or it is `rel` and the budget is spent)
  const ready = (c) => !k3d || (c.k3d ? c.score < Infinity : fly3d(c) || (!c.k3d && !c.rel));
  // two shots ahead when this one cannot finish near the pin: the next
  // stroke's lie caps its power (rough 3 bars, a bunker 1-2), so a rest a
  // little further from the pin on the fairway can leave a better second shot
  // than one nearer in the rough (the user's example: round 4's hole 5). Six
  // distinct rests (8 yd apart) from the top of the one-shot ranking are
  // valued by the best second shot from each (secondValue), plus LIE_TIE for
  // a rest in rough or sand (a second shot's value differs by grid luck by a
  // yard or two, and rounds 10 and 11 left hole 10's drive in the rough for
  // 0.9 against 1.2 from the fairway), and tried first in that order.
  if (cands.length && cands[0].yd > 25) {
    const picks = [];
    for (const c of cands) {
      if (picks.length >= 6) break;
      if (!ready(c)) continue;
      if (!clr(m, ball, c)) continue;
      if (picks.some((p) => Math.hypot(p.rest[0] - c.rest[0], p.rest[1] - c.rest[1]) / YD < 8)) continue;
      picks.push(c);
    }
    for (const c of picks) c.v2 = await secondValue(hole, m, c.rest, c.restLie, st, target);
    const v = (c) => c.v2 + (LIE_TIE[c.restLie] ?? 0);
    picks.sort((a, b) => v(a) - v(b));
    cands = [...picks, ...cands.filter((c) => !picks.includes(c) && c.score < Infinity)];
  }
  // the first candidate whose flight clears every tree by 2 yd under the full
  // rules (hazard margins, trunk gap); else the first by 1 yd, else by 0
  // (level 0). Only when no candidate passes the full rules: the first under
  // relaxed ones, the hazard margins and the trunk gap's margin halved (level
  // 1), else the first whose path meets no trunk or canopy at all (level 2):
  // a ball tucked behind a tree gets out sideways or back rather than into it.
  // A candidate the ranking reaches unflown is flown in 3D first; if its 3D
  // score falls behind the next one's it goes back into the ranking there.
  const by = { 1: null, 0: null, r1: null, r2: null };
  const vetoed = [];
  const done = (b, level) => { const p = planOf(b.c, b.tc, toT, yaw, avoided, wide, level, stats); if (vetoed.length) { p.why += `; set aside by WSR's own trees and bounds (round-model.mjs): ${vetoed.slice(0, 3).join("; ")}${vetoed.length > 3 ? ` and ${vetoed.length - 3} more` : ""}`; p.expect.vetoed = vetoed.length; } return p; };
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (k3d && !c.k3d) {
      const was = c.score;
      if (!ready(c)) continue;
      if (c.k3d && c.score > was + 1e-9) {
        let j = i + 1;
        while (j < cands.length && cands[j].score <= c.score) j++;
        if (j > i + 1) { cands.splice(j, 0, c); cands.splice(i, 1); i--; continue; }
      }
    }
    const full = clr(m, ball, c), half = full || clr(m, ball, c, 0.5);
    if (!full && (by[1] || by[0] || by.r1 || (!half && by.r2))) continue;
    const o = c.k3d
      ? shot3dSync(m, { from: ball, launch: c.line.h, club: c.club, q: c.q, lie, wind: c.line.wind, trace: true })
      : run({ club: c.club, q: c.q, surface, profile: c.line.sim, wind: c.line.wind, trace: true });
    c.line.trees ??= lineTrees(hole, ball, c.line.dx, c.line.dz);
    const tc = appTreeCheck(c.line.trees, o);
    if (tc.kind === "trunk" || tc.kind === "canopy") continue;
    const mg = tc.margin ?? Infinity;
    const level = full && mg >= 0 && trunkGap(c.line.trees, o) >= 0 ? 0 : half && trunkGap(c.line.trees, o, 0.5) >= 0 ? 1 : 2;
    // the slot it would fill must still be open before it is worth the robustness flights
    const slot = level === 0 ? (mg >= 2 ? "take" : mg >= 1 ? 1 : 0) : level === 1 ? "r1" : "r2";
    if (slot !== "take" && by[slot]) continue;
    if (robust(c)) continue;
    const veto = rmVeto(hole, ball, c, yaw, st);
    if (veto) { vetoed.push(`${c.club} ${c.q.toFixed(2)} ${deg(angDiff(c.line.h, toT)).toFixed(1)} deg: ${veto}`); continue; }
    if (slot === "take") return done({ c, tc }, 0);
    by[slot] = { c, tc };
  }
  if (by[1] ?? by[0]) return done(by[1] ?? by[0], 0);
  if (by.r1) return done(by.r1, 1);
  if (by.r2) return done(by.r2, 2);
  return null;
}

function planOf(c, tc, toT, yaw, avoided, wide, level = 0, stats = null) {
  const off = deg(angDiff(c.line.h, toT));
  const r1 = (v) => +v.toFixed(1);
  return {
    level, club: c.club, power: c.q, heading: c.line.h + yaw, launch: c.line.h,
    expect: {
      carry: r1(c.o.carry), stop: r1(c.o.stop), lateral: r1(c.o.lateral ?? 0), restLie: c.restLie, toPin: r1(c.yd),
      model: c.k3d ? "kcl3d" : "port2d",
      port2d: c.k3d ? { carry: r1(c.o2.carry), stop: r1(c.o2.stop), lateral: r1(c.o2.lateral ?? 0), restLie: c.lie2, toPin: r1(c.yd2), rel: !!c.rel } : undefined,
      repeat: c.repeat ? { src: c.repeat.src, along: r1(c.repeat.along), across: r1(c.repeat.across), k3d: !!c.repeat.k3d } : undefined,
      search: stats ?? undefined,
    },
    why: `${c.club} ${c.q.toFixed(2)} ${off >= 0 ? "+" : ""}${off.toFixed(1)} deg off the pin line${yaw ? ` (aimed ${deg(yaw).toFixed(1)} deg left of that: the lie's launch yaw)` : ""}${wide ? " (from the search all round the ball)" : ""}${level === 1 ? " (relaxed: hazard and trunk margins halved, nothing passed the full ones)" : level === 2 ? " (escape: the only paths clear of every trunk and canopy break the margins)" : ""}, wind ${c.line.wind ? `${c.line.wind.mph} mph at ${c.line.wind.deg.toFixed(0)} deg` : "calm"}: ${c.k3d ? "3D over the KCL" : "the 2D port"} carry ${c.o.carry.toFixed(1)}, rest ${c.o.stop.toFixed(1)} yd, drift ${(c.o.lateral ?? 0).toFixed(1)}, on ${c.restLie}, ${c.yd.toFixed(1)} yd from the pin${c.k3d ? ` (2D: rest ${c.o2.stop.toFixed(1)} on ${c.lie2}${c.rel ? ", its roll crossing outer ground or a wall" : ""})` : ""}${c.repeat ? ` (as ${c.repeat.src} rested: ${c.repeat.along >= 0 ? "+" : ""}${c.repeat.along.toFixed(1)} along, ${c.repeat.across >= 0 ? "+" : ""}${c.repeat.across.toFixed(1)} across the ${c.repeat.k3d ? "3D flight" : "port"})` : ""}${c.v2 != null ? `, the best second shot from there ${c.v2.toFixed(1)}` : ""}; trees ${tc.kind}${tc.margin != null ? ` by ${tc.margin.toFixed(1)} yd` : ""}${avoided.size ? `; lines that failed from here before, not tried: ${[...avoided].join("; ")}` : ""}`,
  };
}

// the best a second stroke can do from a rest: the distance from the pin it
// can finish at (plus half its lie penalty), with that rest's lie cap, over a
// coarse search (launch lines 0, +-3, +-6 deg round the pin line, powers every
// 0.05 from the cap), refined round its best (lines +-0.5 to +-2 deg, powers
// +-0.04 every 0.01); on the green or fringe a putt's share of the distance
const LIE_CODE = { fairway: 1, tee: 1, rough: 2, bunker: 3, green: 6, fringe: 9 };
async function secondValue(hole, m, rest, restLie, st, target) {
  const yd0 = Math.hypot(rest[0] - target[0], rest[1] - target[2]) / YD;
  if (restLie === "green") return 0.05 * yd0 + 0.5;
  if (restLie === "fringe") return 0.08 * yd0 + 1;
  const lie = LIE_CODE[restLie] ?? 1, surface = SURF[lie] ?? "fairway";
  const clubs = lie === 3 ? CLUBS_BY_LOFT.slice(0, 5) : CLUBS_BY_LOFT;
  const toT = Math.atan2(target[0] - rest[0], target[2] - rest[1]);
  const lines = new Map();
  const lineAt = async (h) => {
    const key = h.toFixed(5);
    if (!lines.has(key)) {
      const dx = Math.sin(h), dz = Math.cos(h), prof = await kclProfile(hole, rest[0], rest[1], dx, dz);
      lines.set(key, prof ? { dx, dz, prof, sim: simOf(prof), wind: windAlong(st, dx, dz), at: (yd) => prof.lies[Math.min(prof.n - 1, Math.max(0, prof.i0 + Math.round(yd / prof.step)))] } : null);
    }
    return lines.get(key);
  };
  const valueOf = (L, club, q) => {
    const o = run({ club, q, surface, profile: L.sim, wind: L.wind, trace: false });
    const lat = o.lateral ?? 0;
    const sx = rest[0] + (L.dx * o.stop - L.dz * lat) * YD, sz = rest[1] + (L.dz * o.stop + L.dx * lat) * YD;
    const g = groundAt(m, sx, sz), l2 = g ? LIE_OF_ATTR[g.attr] : null;
    if (!(l2 in PEN)) return Infinity;
    if (nearHazard(m, sx, sz, marginYd(o.stop))) return Infinity;
    for (let yd = Math.min(o.carry, o.stop); yd <= Math.max(o.carry, o.stop) + 1e-9; yd += L.prof.step) { const l = L.at(yd); if (!(l in PEN) && l !== "tee") return Infinity; }
    return Math.hypot(sx - target[0], sz - target[2]) / YD + 0.5 * PEN[l2];
  };
  let best = { v: Infinity };
  for (const d of [0, 3, -3, 6, -6]) {
    const h = toT + d * DEG, L = await lineAt(h);
    if (!L) continue;
    for (const club of clubs) for (let k = Math.round(Math.min(capOf(club, lie), 1) * 100); k >= 12; k -= 5) {
      const v = valueOf(L, club, k / 100);
      if (v < best.v) best = { v, h, club, k };
    }
  }
  if (best.v === Infinity) return yd0;
  const top = { ...best };
  for (const dd of [-2, -1, -0.5, 0, 0.5, 1, 2]) {
    const h = top.h + dd * DEG, L = await lineAt(h);
    if (!L) continue;
    for (let dk = -4; dk <= 4; dk++) {
      const k = top.k + dk;
      if (k < 10 || k > Math.round(Math.min(capOf(top.club, lie), 1) * 100)) continue;
      const v = valueOf(L, top.club, k / 100);
      if (v < best.v) best = { v, h, club: top.club, k };
    }
  }
  return best.v;
}

// WSR putter power for a launch speed (yd/s): the inverse of wsrPuttV0 (run-puttread.mjs)
const E = Math.log2(1 / 0.63), YD_S = 240 / 9.144;
const powerOfV0 = (v) => { const u = v / YD_S; return u > 0.004 ? Math.pow((u - 0.004) / 0.406, 1 / E) : 0; };

// The read on the green, made with WSR's own tick over the green's KCL
// triangles (lib/kclputt.mjs: in WSR, its strength-forgiving read holed its
// own putt from 56 of 58 steep spots, the app's 39): of the aims within 6 deg
// of the app's read (src/putt.js solvePutt), the one whose holing putter
// powers span the widest run, at its middle; aims every 0.25 deg and powers
// every 0.01 first, the best three refined to 0.05 deg and 0.002. The app's
// read stands when the port finds no holing line.
const U = 240 / YD;
async function portRead(hole, st, gm, a0, q0) {
  const g = packGreen(await kcl(hole), st.pin[0], st.pin[2], 40 * YD), cup = [st.pin[0], st.pin[2]];
  const holes = (a, q) => q >= 0.02 && fastPutt(g, st.ball.pos, gm.toPin - a * DEG, P.wsrPuttV0(q) / U, 7200, cup, P.cupWindow).holed;
  const runAt = (a, lo, hi, dq) => {
    let best = null, cur = null;
    for (let q = lo; q <= hi + 1e-9; q += dq) {
      if (holes(a, q)) { if (!cur) cur = { lo: q, hi: q }; else cur.hi = q; if (!best || cur.hi - cur.lo > best.hi - best.lo) best = { ...cur }; }
      else cur = null;
    }
    return best ? { a, lo: best.lo, hi: best.hi, w: best.hi - best.lo, mid: (best.lo + best.hi) / 2 } : null;
  };
  const tops = [];
  for (let a = a0 - 6; a <= a0 + 6 + 1e-9; a += 0.25) { const r = runAt(a, Math.max(0.02, q0 - 0.35), q0 + 0.35, 0.01); if (r) tops.push(r); }
  tops.sort((x, y) => y.w - x.w);
  let top = tops[0] ?? null;
  for (const t of tops.slice(0, 3)) for (let a = t.a - 0.25; a <= t.a + 0.25 + 1e-9; a += 0.05) {
    const r = runAt(a, Math.max(0.02, t.lo - 0.03), t.hi + 0.03, 0.002);
    if (r && (!top || r.w > top.w)) top = r;
  }
  return top;
}

async function greenPutt(hole, st) {
  const g = greenModel(hole, st.ball.pos, st.pin);
  const rd = P.solvePutt(g.field, g.fBall, g.fCup);
  const a0 = rd ? rd.a : 0, q0 = rd ? powerOfV0(rd.p * P.vFlat(g.D)) : powerOfV0(P.vFlat(g.D + 0.5));
  const t0 = Date.now();
  const top = await portRead(hole, st, g, a0, q0);
  const ms = Date.now() - t0;
  if (top) {
    return {
      club: "putter", power: top.mid, heading: g.toPin - top.a * DEG,
      expect: { distance: +g.D.toFixed(2), aimDeg: +top.a.toFixed(3), holes: [+top.lo.toFixed(4), +top.hi.toFixed(4)], src: "kcl-port", app: { aimDeg: +a0.toFixed(3), power: +q0.toFixed(4) } },
      why: `putt ${g.D.toFixed(2)} yd (WSR's tick over the green's KCL, ${ms} ms): aim ${top.a >= 0 ? "+" : ""}${top.a.toFixed(2)} deg right of the cup, putter ${top.mid.toFixed(4)} (holes ${top.lo.toFixed(3)}-${top.hi.toFixed(3)}; the app's read ${a0.toFixed(2)} deg ${q0.toFixed(4)})`,
    };
  }
  if (!rd) return null;
  return {
    club: "putter", power: q0, heading: g.toPin - a0 * DEG,
    expect: { distance: +g.D.toFixed(2), aimDeg: +a0.toFixed(3), holes: rd.power ? [+powerOfV0(rd.power.lo * P.vFlat(g.D)).toFixed(4), +powerOfV0(rd.power.hi * P.vFlat(g.D)).toFixed(4)] : null, src: "app" },
    why: `putt ${g.D.toFixed(2)} yd: the KCL port found no holing line within 6 deg (${ms} ms); the app's read, aim ${a0 >= 0 ? "+" : ""}${a0.toFixed(2)} deg right of the cup, putter ${q0.toFixed(4)}`,
  };
}

// The short game first: round-short.mjs (an earlier workflow's planner; putts
// on the green, putts and chips from the fringe, chips from within 40 yd of
// the pin). Every candidate is flown by WSR's ball in 3D over the hole's KCL
// (fastPutt for the putter: the game's verdict on 239 of 240 logged putts, 13
// of 13 from the fringe, where the straight port putt below holed 1 of 13) and
// scored both as swung and as the hidden assist would pull it; the putter gets
// its whole range, up to 2.5 from the green, fringe or fairway, the red
// included (the user, 2026-10-22: "you may experiment with redlining when
// putting ... putting is guaranteed to go straight"; seven putts in the red
// before, 1.04-1.40, six holed). Re-imported when its file changes; the paths
// below when it has nothing or fails.
let shortMod = { mtime: -1, mod: null };
async function shortPlanner() {
  const f = path.join(HERE, "round-short.mjs"), t = fs.statSync(f).mtimeMs;
  if (t !== shortMod.mtime) shortMod = { mtime: t, mod: await import(`${pathToFileURL(f).href}?v=${t}`) };
  return shortMod.mod;
}

export async function plan(hole, st, { k3d = USE_3D } = {}) {
  try {
    const S = await shortPlanner();
    const sp = await S.shortPlan(hole, st);
    if (sp) return { ...sp, why: `${sp.why} [round-short.mjs]` };
  } catch (e) { /* the full planner below */ }
  const lie = st.player.lie;
  if (lie === 6 || lie === 10 || lie === 11) {
    const p = await greenPutt(hole, st);
    if (p) return p;
  }
  if (lie === 6 || lie === 9 || lie === 10 || lie === 11) {
    const p = await planStroke(hole, { ...st, wind: { ...st.wind, speedIdx: 0 } });
    return { ...p, why: `${p.why} (the port's putt over the KCL line)` };
  }
  // round the pin's and the game's lines first; all round the ball when
  // nothing there passes the full rules; a relaxed level of either only when
  // neither has a stroke under the full rules (the nearer search first)
  const a = await fullShot(hole, st, st.pin, { k3d });
  if (a && a.level === 0) return a;
  const b = await fullShot(hole, st, st.pin, { wide: true, k3d });
  if (b && b.level === 0) return b;
  const r = [a, b].filter(Boolean).sort((x, y) => x.level - y.level)[0];
  if (r) return r;
  const f = await planStroke(hole, st);
  return { ...f, why: `${f.why} (lib/play.mjs: no searched stroke clear of every trunk and canopy, all round the ball either)` };
}
