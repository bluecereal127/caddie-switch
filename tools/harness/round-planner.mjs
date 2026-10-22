// A candidate stroke planner for the natural WSR rounds: a drop-in for
// round-planner.mjs (the same exports, the same plan() shape; round-play.mjs
// re-imports the planner before every stroke). It reads only the state the
// caller passes (the ball, the pin, the lie, the wind the game drew) and the
// course's own geometry; nothing here touches the game.
//
// Every stroke is judged by WSR's own ball (round-model.mjs fly(): the tick
// over the course's KCL prisms, the trees, the flagstick, water, valleys and
// out of bounds; replayed against 443 logged strokes it puts the rest a median
// 0.02 yd from the game's), and the stroke chosen is the one with the fewest
// expected strokes to hole out, not the one that rests nearest the pin:
// - in reach of the pin (any club can rest there) it searches, per club, the
//   launch that HOLES: a centre launch whose ball, with the cup taken away,
//   comes to rest just past the pin, then a grid of aims and powers round it
//   flown with the cup and the flagstick, then a fine grid round the holing
//   region's best point, whose holed share under the D-pad's aim error (the
//   logged residual: uniform within +-0.031 deg) and the model's own error
//   (0.03 yd across, 0.08 yd along) is the chance to hole; a miss is worth
//   the putt (or chip) it leaves;
// - out of reach (or when a holing approach is poor) it scores a fan of
//   clubs, powers and lines by where they rest: on what, how far from the
//   pin, and the next stroke's power cap there (rough 3 bars, a bunker 1-2),
//   through a value table of the expected strokes from a lie and a distance;
//   the best few distinct rests are then valued by a reduced holing search
//   from each (two shots ahead), and the winners' neighbours (power +-0.003
//   of the cap, aim +-0.1 deg) are flown so a rest at an edge (a lip, a bank,
//   the rough line, a canopy) is valued by where its neighbours go too;
// - within SHORT_YD of the pin and on the fringe the same holing search runs
//   with the chipping clubs (and the putter from the fringe), each candidate
//   also scored as the pin-power assist would pull it (round-short.mjs's
//   measured rule: PI_ASSIST of the strokes, the aim table's young states);
// - on the green: round-short.mjs shortPlan (WSR's tick over the green's KCL,
//   both launches: as swung and as the assist pulls), else the current
//   planner's KCL read, else lib/play.mjs.
// Every power is within the game's own range (the floor 0.1 of the lie's cap,
// the putter's 0.05, to the cap): a pin nearer than the softest legal stroke
// rests is played with that stroke.
// The rough and bunker launch yaw (2 deg right of the aim) is the model's own
// (round-model.mjs lieYaw): `heading` is the aim to set by D-pad.
// Measured offline (2026-10-22) from the 1,308 distinct starting spots of the
// logged strokes (rounds 1-13, the 3-hole course attempts): planning median
// 1.9 s off the green (max 4.9 s), 1.0 s on it (max 4.8 s). Flown by the same
// model and valued the same way, its strokes leave 1.43 expected strokes from a
// par-3 tee (the old plans' 2.04), 1.39 from 40-240 yd (2.10), 1.05 for chips
// (1.98), the model's holing chance 0.59, 0.64 and 0.95: the model's verdict,
// untested by a deliberate hole-out in play.
//   plan(hole, st) -> { club, power, heading, expect, why }
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { YD, kcl, groundAt as kclGround, kclProfile, simOf } from "./lib/course.mjs";
import { greenModel, P } from "./lib/green.mjs";
import { planStroke } from "./lib/play.mjs";
import { run } from "../lib/wsrsim.mjs";
import { packGreen, fastPutt } from "./lib/kclputt.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEG = Math.PI / 180;
const deg = (r) => r / DEG;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

// the planning budget (ms) and the short game's reach (yd)
export const BUDGET_MS = 6500;
export const SHORT_YD = 40;
// the putter from the fairway, rough or sand: off until a round has shown
// the D-pad reaches it there (round-play.mjs's club change throws, and the
// hole call with it, when it cannot)
export const PUTTER_OFF_GREEN = false;

export const CLUB_INDEX = { driver: 0, spoon: 1, "3iron": 2, "5iron": 3, "7iron": 4, "9iron": 5, wedge: 6, putter: 7 };
const BY_LOFT = ["wedge", "9iron", "7iron", "5iron", "3iron", "spoon", "driver"];
const BUNKER_CAP = { driver: 0.25, spoon: 0.25, "3iron": 0.5, "5iron": 0.5, "7iron": 0.5, "9iron": 0.5, wedge: 0.75, putter: 1 };
export const capOf = (club, lie) => (club === "putter" ? 1 : lie === 2 ? 0.75 : lie === 3 || lie === 16 ? BUNKER_CAP[club] : 1);
const isBunker = (lie) => lie === 3 || lie === 16;
const SURF = { 1: "fairway", 2: "rough", 3: "bunker", 6: "green", 9: "fringe", 15: "fairway", 16: "bunker" };

// ---- what round-play.mjs and the tools use of the planner (as round-planner.mjs) ----
export const LIE_YAW = { 2: 2 * DEG, 3: 2 * DEG };
export const launchOf = (aim, lie) => aim - (LIE_YAW[lie] ?? 0);
// the game's wind relative to a heading, for src/wsrsim.js run(): mph, deg 0 = tail, 90 = toward the right
export function windAlong(st, dx, dz) {
  if (!st.wind.speedIdx) return null;
  const a = st.wind.angle, wx = Math.sin(a), wz = Math.cos(a);
  return { mph: 2 * st.wind.speedIdx, deg: deg(Math.atan2(wx * -dz + wz * dx, wx * dx + wz * dz)) };
}
// water, out of bounds or a valley within r yd of (x, z) on the OBJ mesh m, or no ground (as before)
const HAZ = new Set([4, 5, 7, 13]);
export function nearHazard(m, x, z, r) {
  for (const f of [1, 0.5]) for (let a = 0; a < 8; a++) {
    const t = (a * Math.PI) / 4, g = kclGround(m, x + Math.sin(t) * r * f * YD, z + Math.cos(t) * r * f * YD);
    if (!g || HAZ.has(g.attr)) return true;
  }
  return false;
}
// HARNESS_KNOW: another memory file (natural-18.sh's fresh rounds start from an
// empty one, so no stroke of an earlier round in the same wind is recalled)
export const KNOW = process.env.HARNESS_KNOW ? path.resolve(process.env.HARNESS_KNOW) : path.join(HERE, "results", "knowledge", "strokes.jsonl");
let known = { mtime: -1, rows: [] };
export function knowledge() {
  try {
    const t = fs.statSync(KNOW).mtimeMs;
    if (t !== known.mtime) {
      // a later row of the same stroke replaces the earlier one (round-play.mjs
      // marks a stroke failed when the game put the ball back where it was hit),
      // as round-planner.mjs reads them
      const bySrc = new Map();
      let i = 0;
      for (const l of fs.readFileSync(KNOW, "utf8").split("\n")) { if (!l) continue; try { const r = JSON.parse(l); bySrc.set(r.src ?? `row ${i++}`, r); } catch { /* a torn line */ } }
      known = { mtime: t, rows: [...bySrc.values()] };
    }
  } catch { known = { mtime: -1, rows: [] }; }
  return known.rows;
}
// the line model's flight of a stroke along its launch line (the knowledge rows' pred, as before)
export async function predictAlong(hole, from, lie, wind, club, q, launch) {
  const dx = Math.sin(launch), dz = Math.cos(launch), prof = await kclProfile(hole, from[0], from[2], dx, dz);
  if (!prof) return null;
  const o = run({ club, q, surface: SURF[lie] ?? "fairway", profile: simOf(prof), wind: windAlong({ wind }, dx, dz), trace: false });
  return { carry: +o.carry.toFixed(2), stop: +o.stop.toFixed(2), lateral: +(o.lateral ?? 0).toFixed(2) };
}
export function knowRow({ src, at, hole, k, lie, from, pin, wind, club, q, aim, pred, rest, hazard = 0, placed = null, holed = false }) {
  const launch = club === "putter" ? aim : launchOf(aim, lie);
  const end = hazard && placed ? placed.from : rest;
  let fail = null;
  if (hazard) fail = `hazard ${hazard}`;
  else if (pred && !holed && club !== "putter") {
    const dx = Math.sin(launch), dz = Math.cos(launch);
    const px = from[0] + (dx * pred.stop - dz * pred.lateral) * YD, pz = from[2] + (dz * pred.stop + dx * pred.lateral) * YD;
    const miss = Math.hypot(end[0] - px, end[2] - pz) / YD;
    if (miss >= 15) fail = `rested ${miss.toFixed(0)} yd from the port's rest`;
  }
  return { src, at, hole, k, lie, from, pin, wind: { dir: wind.dir, speedIdx: wind.speedIdx }, club, q, aim, launch, pred, end, rest, hazard, holed, fail };
}
export function appendKnow(row) { fs.mkdirSync(path.dirname(KNOW), { recursive: true }); fs.appendFileSync(KNOW, JSON.stringify(row) + "\n"); }

// ---- the models, imported afresh when their files change (round-play.mjs
// re-imports only the planner; a static import would freeze them for the
// rest of a running round). A replaced round-model.mjs has its courses
// dropped first, so the old copy holds no meshes.
async function fresh(file, key) {
  const t = fs.statSync(file).mtimeMs, g = (globalThis.__plannerCandidateMods ??= {});
  if (g[key] && g[key].t === t) return g[key].mod;
  const mod = await import(`${pathToFileURL(file).href}?v=${t}`);
  if (g[key]?.mod?.dropCourse) for (let h = 1; h <= 21; h++) g[key].mod.dropCourse(h);
  g[key] = { t, mod };
  return mod;
}
const RM_FILE = path.join(HERE, "round-model.mjs"), RS_FILE = path.join(HERE, "round-short.mjs");
export const models = async () => ({ RM: await fresh(RM_FILE, "rm"), RS: await fresh(RS_FILE, "rs") });

// ---- what a rest is worth: the expected strokes still to play from it ----
// Every chance below is the model's own times RELY(d): its rest is the game's
// to a median 0.02 yd, but 5 % of the logged strokes forked by 0.5 yd and more,
// a longer stroke more often; RELY(d) of what the model holes is taken to hole
export const RELY = (D) => clamp(1 - 0.0012 * D, 0.6, 1);
// and less from the lies the model was checked on least: 109 logged strokes
// from rough, 7 from sand (round-eval.mjs), against 327 from tee and fairway
export const LIE_RELY = { rough: 0.96, bunker: 0.88 };
const lieName = (lie) => (lie === 2 ? "rough" : lie === 3 || lie === 16 ? "bunker" : lie === 9 ? "fringe" : "fairway");
// A putt's chance by distance: round-short.mjs shortPlan's (it holes 224 of the
// 227 logged green putts; in play the old read holed 215, its misses the
// assist's pulls, steep greens and lip-outs), the same basis as off the green
const PUTT_P = [[0, 0.995], [4, 0.995], [10, 0.98], [20, 0.93], [30, 0.8], [40, 0.6], [60, 0.4], [100, 0.3]];
export function puttRate(d) { return Math.max(0.3, knot(PUTT_P, d)) * RELY(d); }
// The holing chance of a stroke from d yd off the green: the holing search
// below (holingPlan, four clubs) run from the 421 distinct off-green spots of
// the logged rounds and 3-hole course attempts (2026-10-22), the model's mean
// chance per band times RELY(d), smoothed. The model's own means: fairway and
// tee 0.90 to 20 yd (the assist's 10 % pull is the miss), 0.97 at 20-70, 0.96 at
// 70-100, 0.91 at 100-130, 0.83 at 130-160, 0.76 at 160-190, then 0.06 at
// 190-220 (hole 17's green, which the logged tee shots ran off by 8-35 yd, is
// 10 of those 12) and 0.05-0.13 at 220-290; rough 0.91-1.0 to 70, 0.78-0.82 at
// 70-130, 0.58 at 130-160, 0.17-0.24 at 160-220 (the 3-bar cap); sand 0.9-1.0
// to 40, 0.07 at 100-130; fringe 0.99-1.0 to 40. [d, P] knots, linear between, 0
// past the last
export const HOLE_P = {
  fairway: [[0, 0.88], [15, 0.88], [30, 0.93], [55, 0.91], [85, 0.86], [115, 0.78], [145, 0.69], [175, 0.6], [205, 0.28], [235, 0.08], [270, 0.07], [290, 0]],
  rough: [[0, 0.88], [15, 0.88], [30, 0.9], [55, 0.86], [85, 0.72], [115, 0.68], [145, 0.48], [175, 0.2], [205, 0.12], [225, 0]],
  bunker: [[0, 0.86], [15, 0.88], [30, 0.9], [55, 0.8], [80, 0.4], [115, 0.05], [130, 0]],
  fringe: [[0, 0.95], [10, 0.95], [20, 0.93], [40, 0.88], [60, 0.75], [80, 0]],
};
const REACH = { fairway: 300, rough: 225, bunker: 130, fringe: 80 };
// a full stroke's advance from each lie when the pin is out of reach (yd)
const ADVANCE = { fairway: 265, rough: 195, bunker: 95 };
const knot = (K, d) => {
  if (d <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) if (d <= K[i][0]) { const [a, pa] = K[i - 1], [b, pb] = K[i]; return pa + ((pb - pa) * (d - a)) / (b - a); }
  return 0;
};
// a miss's leave: a tap-in from close, a longer putt or a chip from further out
// (the calibration's misses: about 1.06 at 100 yd, 1.2 at 200, 1.25 at 235)
const missLeave = (d) => { const x = Math.min(d, 300); return 1.01 + 0.0001 * x + 0.000004 * x * x; };
// the better of going for the pin from here and a stroke to the best spot a
// full stroke from this lie can reach (the table's sweet spot, 40 yd short, or
// as near it as the stroke's advance allows), a little worse than a holing
// approach from there
export function offValue(d, lie = "fairway", depth = 0) {
  const inReach = d <= (REACH[lie] ?? REACH.fairway);
  const p = inReach ? knot(HOLE_P[lie] ?? HOLE_P.fairway, d) * (LIE_RELY[lie] ?? 1) : 0;
  const go = inReach ? 1 + (1 - p) * missLeave(d) : Infinity;
  if (d <= 70) return go;
  if (depth >= 4) return Number.isFinite(go) ? go : 2.4 + 0.004 * d;
  const leave = clamp(40, Math.max(0, d - (ADVANCE[lie] ?? ADVANCE.fairway)), d);
  return Math.min(go, 1.04 + offValue(leave, "fairway", depth + 1));
}
const GREEN = new Set([6, 10, 11]);
const LIE_NAME = { 1: "fairway", 2: "rough", 3: "bunker", 6: "green", 9: "fringe", 10: "green", 11: "green", 15: "tee", 16: "bunker" };
// a rest at d yd from the pin on KCL attribute attr
export function posValue(d, attr) {
  if (GREEN.has(attr)) return 1 + (1 - puttRate(d));
  if (attr === 9) return offValue(d, "fringe");
  if (attr === 1 || attr === 15) return offValue(d, "fairway");
  if (attr === 2) return offValue(d, "rough");
  if (attr === 3 || attr === 16) return offValue(d, "bunker");
  return 3.5;   // a wall, outer ground, water, a valley, nothing: a lost ball's worth
}

// ---- the engine: one stroke by round-model.mjs fly() ----
function makeCtx(RM, hole, st, deadline) {
  const c = RM.loadCourse(hole);
  const ball = st.ball.pos, pin = st.pin;
  const lie = st.player.lie === 10 || st.player.lie === 11 ? 6 : st.player.lie;
  const D = Math.hypot(pin[0] - ball[0], pin[2] - ball[2]) / YD, toPin = Math.atan2(pin[0] - ball[0], pin[2] - ball[2]);
  const wind = st.wind?.speedIdx > 0 ? { angle: st.wind.angle ?? (st.wind.dir * Math.PI) / 4, speedIdx: st.wind.speedIdx, dir: st.wind.dir } : null;
  const aim = st.player.aim ? Math.atan2(st.player.aim[0], st.player.aim[1]) : toPin;
  return { RM, c, hole, ball, pin, lie, D, toPin, gameAim: aim, onGreen: lie === 6, wind, yaw: RM.lieYaw(lie), deadline, sims: 0, st };
}
// a context for the next stroke from a rest (two shots ahead)
function restCtx(ctx, o) {
  const lie = o.restAttr === 10 || o.restAttr === 11 ? 6 : o.restAttr;
  const ball = o.rest, pin = ctx.pin;
  const D = Math.hypot(pin[0] - ball[0], pin[2] - ball[2]) / YD, toPin = Math.atan2(pin[0] - ball[0], pin[2] - ball[2]);
  return { ...ctx, ball, lie, D, toPin, gameAim: toPin, onGreen: lie === 6, yaw: ctx.RM.lieYaw(lie), depth: (ctx.depth ?? 0) + 1, sims: 0, failRows: undefined };
}
function fly(ctx, club, h, q, cup = true, extra = {}) {
  ctx.sims++;
  return ctx.RM.fly({ course: ctx.c, pos: ctx.ball, heading: h, yaw: extra.yaw ?? ctx.yaw, club, q, wind: ctx.onGreen ? null : ctx.wind, pin: ctx.pin, flagIn: cup && !ctx.onGreen, holeOut: cup, lieAttr: ctx.lie, trace: !!extra.trace, traceEvery: extra.traceEvery ?? 4 });
}
// a point's distance along and across (+ right) the line from the ball at bearing dir (yd)
function rel(ctx, p, dir = ctx.toPin) {
  const dx = p[0] - ctx.ball[0], dz = p[2] - ctx.ball[2];
  return { a: (dx * Math.sin(dir) + dz * Math.cos(dir)) / YD, x: (dx * -Math.cos(dir) + dz * Math.sin(dir)) / YD };
}
const pinDist = (ctx, p) => Math.hypot(p[0] - ctx.pin[0], p[2] - ctx.pin[2]) / YD;
// the expected strokes after a stroke that ended as o (0 when holed)
function outValue(ctx, o) {
  if (o.outcome === "holed") return 0;
  if (o.hazard) {
    // a penalty stroke and the next from the drop (the last ground under the
    // ball that was not water or a wall; out of bounds without one: the ball's spot)
    const at = o.drop ?? ctx.ball;
    const g = ctx.RM.groundAt(ctx.c, at[0], at[2], { yMax: at[1] + 5 });
    const attr = g && ![4, 5, 7, 12, 13].includes(g.attr) ? g.attr : 1;
    return 1 + posValue(pinDist(ctx, at), attr) + 0.1;
  }
  if (o.outcome !== "rest") return 3.5;
  return posValue(pinDist(ctx, o.rest), o.restAttr);
}
// a stroke struck earlier from within 2 yd, with the same club, power (0.02),
// launch line (0.6 deg) and wind, that went into a hazard or that the game put
// back where it was hit (out of bounds the model did not see: round-play.mjs
// marks the row's fail so); the game is deterministic
const lostBefore = (r) => !!r.hazard || /put the ball back/.test(r.fail ?? "");
function failedBefore(ctx, club, h, q) {
  const launch = h + ctx.yaw;
  ctx.failRows ??= knowledge().filter((r) => r.hole === ctx.hole && lostBefore(r) && r.from && Math.hypot(r.from[0] - ctx.ball[0], r.from[2] - ctx.ball[2]) / YD <= 2);
  for (const r of ctx.failRows) {
    if (r.club !== club) continue;
    if (Math.abs(r.q - q) > 0.02 || Math.abs(angDiff(r.launch, launch)) > 0.6 * DEG) continue;
    if (r.wind?.dir !== ctx.wind?.dir && (r.wind?.speedIdx ?? 0) + (ctx.wind?.speedIdx ?? 0) > 0) continue;
    if ((r.wind?.speedIdx ?? 0) !== (ctx.wind?.speedIdx ?? 0)) continue;
    return r.src;
  }
  return null;
}

// ---- the pin-power assist (round-short.mjs's rule, flown by round-model.mjs) ----
// PI_ASSIST of the swings keep the state-1 window open past its first frame,
// and the assist then pulls the launch power toward the aim table's best
// power; the table freezes TABLE_FRAMES after the last D-pad turn frame
const PI_ASSIST = { putter: 0.34, other: 0.1 };
const TABLE_FRAMES = [5, 8.5];
const TABLE_ORDER = [0, 256, 128, 64, 192, 32, 96, 160, 224, 16, 48, 80, 112, 144, 176, 208, 240];
const TAPS = [1, 5, 15, 30, 45, 51, 45, 30, 15, 5, 1].map((x) => x / 243);
function tableBest(res) {
  const keys = [...res.keys()].sort((a, b) => a - b), a = new Float64Array(257);
  for (let i = 0; i <= 256; i++) {
    let lo = null, hi = null;
    for (const k of keys) { if (k <= i) lo = k; if (k >= i && hi == null) hi = k; }
    if (lo == null) a[i] = res.get(hi);
    else if (hi == null || hi === lo) a[i] = res.get(lo);
    else a[i] = res.get(lo) + ((res.get(hi) - res.get(lo)) * (i - lo)) / (hi - lo);
  }
  let runS = -1, best = null;
  for (let i = 0; i <= 257; i++) {
    if (i <= 256 && a[i] === 0) { if (runS < 0) runS = i; continue; }
    if (runS >= 0) { const len = i - runS; if (!best || len > best.len) best = { len, idx: Math.floor((runS + i - 1) / 2) }; runS = -1; }
  }
  if (best) return { pPin: best.idx / 256, best: 0 };
  let bi = 0, bv = Infinity;
  for (let i = 0; i <= 256; i++) {
    let s = 0;
    for (let t = -5; t <= 5; t++) s += TAPS[t + 5] * a[clamp(i + t, 0, 256)];
    if (s < bv) { bv = s; bi = i; }
  }
  return { pPin: bi / 256, best: bv };
}
// the table states the swing can find along aim h, weighted by their share of TABLE_FRAMES
function tableWeights(ctx, club, h) {
  const [F0, F1] = TABLE_FRAMES, res = new Map(), out = [];
  let ticks = 0, prev = null;
  for (const k of TABLE_ORDER) {
    // the table's balls fly along the aim itself (no lie yaw), with the cup
    const o = fly(ctx, club, h, k / 256, true, { yaw: 0 });
    ticks += o.ticks;
    let v;
    if (o.outcome === "holed") v = 0;
    else {
      const attr = o.hazard ? 7 : o.restAttr;
      v = Math.hypot(o.rest[0] - ctx.pin[0], o.rest[2] - ctx.pin[2]) * (o.hazard || attr === 4 ? 2 : attr === 2 ? 1.1 : isBunker(attr) ? 1.3 : 1);
    }
    res.set(k, v);
    const st = { from: ticks / 160, ...tableBest(res) };
    if (prev) prev.to = st.from;
    out.push(st);
    prev = st;
    if (st.from > F1) break;
  }
  prev.to = Infinity;
  const w = [];
  for (const s of out) { const x = (Math.min(s.to, F1) - Math.max(s.from, F0)) / (F1 - F0); if (x > 1e-9) w.push({ w: x, pPin: s.pPin, best: s.best }); }
  return w.length ? w : [{ w: 1, pPin: 0, best: null }];
}
// round-short.mjs assistedPower: a swing under the cap whose table rests
// within 300 u of the pin is pulled toward the table's power
function assistedPower(ctx, p2, club, pPin, best) {
  const cap = capOf(club, ctx.lie), mult = ctx.lie === 2 ? 1.1 : isBunker(ctx.lie) ? 1.3 : 1;
  const b = best ?? ctx.D * YD * mult;
  if (p2 >= cap || !(b < 300)) return p2;
  const d = Math.abs(p2 - pPin);
  let w = clamp(0.5 + 0.5 * (d < 0.001 ? 0 : Math.pow(d / 0.3, Math.log2(1000))), 0.5, 1);
  if (b === 0) w = Math.min(w, clamp(0.01 + 0.99 * (d < 0.001 ? 0 : Math.pow(d / 0.05, Math.log2(20))), 0.01, 1));
  return Math.max(0, p2 + (1 - w) * cap * (pPin - p2));
}
// can the assist reach this stroke at all? (a young table resting within 300 u: the
// ball itself within 32.8 yd, or a swing within 0.3 of full power)
const assistMayAct = (ctx, club, q) => ctx.D * YD * (ctx.lie === 2 ? 1.1 : isBunker(ctx.lie) ? 1.3 : 1) < 300 || q > capOf(club, ctx.lie) - 0.3;

// ---- the holing search ----
// the powers a club can be launched at from the lie: the game's own floor to the
// cap (lib/shot.mjs rawFor: p1 = max(P3c, ...), P3c 0.1 of the cap, the putter's
// 0.05, so a plan under it would fire at the floor; round-short.mjs's p3c * cap)
function powerRange(ctx, club) {
  if (club === "putter") return { lo: 0.05, hi: 1.8 };
  const cap = capOf(club, ctx.lie);
  return { lo: 0.1 * cap, hi: cap };
}
// the power whose rest, with no cup, lies dT along the pin line at aim h:
// a scan (or a narrow one round `near`), the bracket whose ends rest nearest
// the line, bisected; when even the softest legal stroke rests past the target
// (the pin nearer than it reaches), that stroke. -> { q, a, x, o } or { reach }
function powerFor(ctx, club, h, dT, R, near = null) {
  const qs = near != null ? [0.94, 0.97, 1, 1.03, 1.06].map((f) => clamp(near * f, R.lo, R.hi)) : Array.from({ length: 14 }, (_, k) => R.lo + ((R.hi - R.lo) * k) / 13);
  const S = [];
  for (const q of qs) { if (S.length && Math.abs(S[S.length - 1].q - q) < 1e-9) continue; const o = fly(ctx, club, h, q, false), r = rel(ctx, o.rest); S.push({ q, a: o.hazard ? r.a : r.a, x: r.x, o }); }
  let best = null;
  for (let k = 0; k + 1 < S.length; k++) {
    const A = S[k], B = S[k + 1];
    if ((A.a - dT) * (B.a - dT) > 0) continue;
    const sc = Math.abs(A.x) + Math.abs(B.x) + (A.o.hazard || B.o.hazard ? 60 : 0);
    if (!best || sc < best.sc) best = { A, B, sc };
  }
  if (!best) {
    if (near != null) return powerFor(ctx, club, h, dT, R, null);
    // the pin nearer than the softest legal stroke rests: that stroke (the grid round it tells its worth)
    const soft = S.reduce((b, s) => (s.q < b.q ? s : b));
    if (soft.a > dT && !soft.o.hazard) return soft;
    return { reach: Math.max(...S.map((s) => s.a)) };
  }
  let { A, B } = best;
  for (let i = 0; i < 8; i++) {
    const m = (A.q + B.q) / 2, o = fly(ctx, club, h, m, false), r = rel(ctx, o.rest), M = { q: m, a: r.a, x: r.x, o };
    if ((M.a - dT) * (A.a - dT) <= 0) B = M; else A = M;
  }
  return Math.abs(A.a - dT) <= Math.abs(B.a - dT) ? A : B;
}
// the centre launch: its rest (no cup) `past` yd beyond the pin on the line
// to it; the aim turned by the rest's offset, the power bisected again, then
// a Newton step on a local Jacobian; also the rest's slope against power
function centreOf(ctx, club, past) {
  const R = powerRange(ctx, club), dT = ctx.D + past;
  let h = ctx.toPin - ctx.yaw, pf = null;
  for (let it = 0; it < 5; it++) {
    pf = powerFor(ctx, club, h, dT, R, pf?.q ?? null);
    if (pf.q == null) return it === 0 ? { reach: pf.reach } : null;
    if (Math.abs(pf.x) < 0.06) break;
    h += pf.x / Math.max(3, pf.a);
  }
  let q = pf.q, e = { a: pf.a - dT, x: pf.x };
  const dh = (0.15 / Math.max(5, ctx.D)), dq = 0.004 * (R.hi - R.lo);
  let slope = null;
  for (let it = 0; it < 2; it++) {
    const oh = fly(ctx, club, h + dh, q, false), oq = fly(ctx, club, h, Math.min(R.hi, q + dq), false);
    const rh = rel(ctx, oh.rest), rq = rel(ctx, oq.rest), dqq = Math.min(R.hi, q + dq) - q;
    if (!(dqq > 0)) break;
    const J = [[(rh.a - dT - e.a) / dh, (rq.a - dT - e.a) / dqq], [(rh.x - e.x) / dh, (rq.x - e.x) / dqq]];
    slope = J[0][1];
    if (Math.abs(e.a) < 0.05 && Math.abs(e.x) < 0.04) break;
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (!(Math.abs(det) > 1e-9)) break;
    const sh = clamp(-(J[1][1] * e.a - J[0][1] * e.x) / det, -0.3 * DEG, 0.3 * DEG), sq = clamp(-(-J[1][0] * e.a + J[0][0] * e.x) / det, -0.03, 0.03);
    const o = fly(ctx, club, h + sh, clamp(q + sq, R.lo, R.hi), false), r = rel(ctx, o.rest);
    const e2 = { a: r.a - dT, x: r.x };
    if (Math.hypot(e2.a, e2.x) < Math.hypot(e.a, e.x)) { h += sh; q = clamp(q + sq, R.lo, R.hi); e = e2; } else break;
  }
  return { h, q, miss: Math.hypot(e.a, e.x), slope };
}
// the aim error's weights over fine-grid heading steps of `step` rad: the
// D-pad's residual (uniform within +-0.031 deg) and the model's own 0.03 yd across
const Phi = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp((-x * x) / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x >= 0 ? 1 - p : p; };
function aimKernel(D, step, n) {
  const a = 0.031 * DEG, s = Math.max(1e-6, 0.03 / Math.max(1, D));
  const dens = (e) => (Phi((e + a) / s) - Phi((e - a) / s)) / (2 * a);
  const w = [];
  for (let u = -n; u <= n; u++) { let t = 0; for (let k = -2; k <= 2; k++) t += dens((u + k / 5) * step); w.push(t); }
  const S = w.reduce((x, y) => x + y, 0);
  return w.map((x) => x / S);
}
// along: the model's 0.08 yd, over steps of `stepYd`
function alongKernel(stepYd, n) {
  const s = 0.08 / stepYd, w = [];
  for (let v = -n; v <= n; v++) w.push(Math.exp((-v * v) / (2 * s * s)));
  const S = w.reduce((x, y) => x + y, 0);
  return w.map((x) => x / S);
}
// the stroke's expected strokes over a fine grid round (h0, q0): the shift of
// the kernel's centre within +-1 step that holes most -> { h, q, P, E, missV }
// (q kept inside the club's range: a shift past the floor or the cap reports it)
function fineEval(ctx, club, h0, q0, slope, { nu = 4, nw = 2, stepDeg = 0.0125, stepYd = 0.12 } = {}) {
  const R = powerRange(ctx, club), dh = stepDeg * DEG, dq = stepYd / slope;
  const cell = new Map();
  const at = (u, w) => {
    const k = `${u},${w}`;
    if (!cell.has(k)) {
      const q = q0 + w * dq;
      if (q < R.lo - 1e-9 || q > R.hi + 1e-9) cell.set(k, null);
      else { const o = fly(ctx, club, h0 + u * dh, q, true); cell.set(k, { holed: o.outcome === "holed", v: outValue(ctx, o), o }); }
    }
    return cell.get(k);
  };
  const Wh = aimKernel(ctx.D, dh, nu), Wq = alongKernel(stepYd, nw);
  let best = null;
  for (const [su, sw] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
    let E = 0, Pw = 0, W = 0, mv = 0, mw = 0;
    for (let u = -nu; u <= nu; u++) for (let w = -nw; w <= nw; w++) {
      const r = at(u + su, w + sw), wt = Wh[u + nu] * Wq[w + nw];
      if (!r) continue;
      W += wt;
      if (r.holed) { E += wt; Pw += wt; } else { E += wt * (1 + r.v); mv += wt * r.v; mw += wt; }
    }
    if (!(W > 0)) continue;
    const res = { h: h0 + su * dh, q: clamp(q0 + sw * dq, R.lo, R.hi), P: Pw / W, E: E / W, missV: mw > 0 ? mv / mw : 0, n: cell.size };
    if (!best || res.E < best.E - 1e-9) best = res;
    // only shift toward a better centre when the centre itself misses
    if (su === 0 && sw === 0 && res.P > 0.999) break;
  }
  return best;
}
// When no rest lies near the pin (a cup on a slope the ball rolls off, a
// tiered green), the launch whose path passes the cup closest while slow
// enough to drop: a grid of aims (+-3 yd at the pin) and powers (+-12 %)
// round the centre, flown with the cup's pass recorded but no capture
function passCentre(ctx, club, cen) {
  const R = powerRange(ctx, club), dh = 0.5 / Math.max(5, ctx.D);
  let best = null;
  for (let i = -6; i <= 6; i++) for (let j = -5; j <= 5; j++) {
    const h = cen.h + i * dh, q = clamp(cen.q * (1 + 0.024 * j), R.lo, R.hi);
    const o = fly(ctx, club, h, q, false);
    const cp = o.cupPass;
    const J = cp ? cp.d + 0.4 * Math.max(0, cp.v - 3) : 5 + pinDist(ctx, o.rest);
    if (!best || J < best.J) best = { h, q, J, cp };
  }
  return best;
}
// one club's best holing launch -> { club, h, q, P, E, ... } or null
function holeClub(ctx, club, { reduced = false } = {}) {
  const past = club === "putter" ? 0.3 : 0.5;
  let cen = centreOf(ctx, club, past);
  if (!cen || cen.q == null) return null;
  const R = powerRange(ctx, club);
  if (cen.miss > 1 && !reduced) {
    const pc = passCentre(ctx, club, cen);
    if (pc && pc.J < 1) cen = { ...cen, h: pc.h, q: pc.q, miss: pc.J, viaPass: true };
  }
  const slope = cen.slope > 10 && cen.slope < 4000 ? cen.slope : club === "putter" ? 25 : 150;
  const NI = reduced ? 9 : 13, NJ = reduced ? 9 : 14, latYd = reduced ? 0.09 : 0.07, alongYd = reduced ? 0.5 : 0.35, j0 = reduced ? 3 : 5;
  const dh = latYd / Math.max(1, ctx.D), dq = alongYd / slope, i0 = (NI - 1) / 2;
  const cells = [];
  let holed = 0;
  for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++) {
    if (Date.now() > ctx.deadline && cells.length > 20) break;
    const h = cen.h + (i - i0) * dh, q = cen.q + (j - j0) * dq;
    if (q < R.lo - 1e-9 || q > R.hi + 1e-9) continue;
    const o = fly(ctx, club, h, q, true), H = o.outcome === "holed";
    if (H) holed++;
    cells.push({ i, j, h, q, holed: H, v: H ? 0 : outValue(ctx, o) });
  }
  if (!cells.length) return null;
  // the fine grid's centre: the holed cell with the most holed neighbours
  // (ties to the grid's centre), else the cell with the best value
  let pick;
  if (holed) {
    const key = new Map(cells.map((c) => [`${c.i},${c.j}`, c]));
    let bs = -1;
    for (const c of cells) {
      if (!c.holed) continue;
      let n = 0;
      for (let di = -1; di <= 1; di++) for (let dj = -2; dj <= 2; dj++) if (key.get(`${c.i + di},${c.j + dj}`)?.holed) n++;
      const s = n - 0.01 * (Math.abs(c.i - i0) + Math.abs(c.j - j0));
      if (s > bs) { bs = s; pick = c; }
    }
  } else pick = cells.reduce((b, c) => (c.v < b.v ? c : b));
  if (Date.now() > ctx.deadline && reduced) return trusted(ctx, { club, h: pick.h, q: pick.q, P: holed ? 0.5 : 0, E: holed ? 1 + 0.5 * missLeave(ctx.D) : 1 + pick.v, missV: holed ? missLeave(ctx.D) : pick.v, grid: { holed, n: cells.length }, cen, rough: true });
  const f = fineEval(ctx, club, pick.h, pick.q, slope, reduced ? { nu: 2, nw: 1, stepDeg: 0.025, stepYd: 0.2 } : {});
  if (!f) return null;
  const r = trusted(ctx, { club, ...f, grid: { holed, n: cells.length, dhDeg: +deg(dh).toFixed(4), dqYd: alongYd }, cen: { miss: +cen.miss.toFixed(2), slope: +slope.toFixed(0), viaPass: !!cen.viaPass } });
  return reduced ? r : edgeProbe(ctx, r);
}
// The model's own chance discounted by RELY(D) (above): the share it cannot
// vouch for leaves the miss's putt (a holing approach's miss is mostly a tap-in)
function trusted(ctx, r) {
  if (!(r.P > 0)) return { ...r, Pmodel: 0 };
  const rho = RELY(ctx.D) * (LIE_RELY[lieName(ctx.lie)] ?? 1), miss = r.missV > 0 ? r.missV : missLeave(ctx.D);
  return { ...r, Pmodel: r.P, P: rho * r.P, E: 1 + rho * (1 - r.P) * miss + (1 - rho) * missLeave(ctx.D) };
}
// the launch's neighbours at the model's forking scale (power +-0.003 of the cap,
// aim +-0.1 deg): a hazard among them costs its share
function edgeProbe(ctx, r) {
  const R = powerRange(ctx, r.club), cap = R.hi;
  let pen = 0;
  const hz = [];
  for (const [dh, dq] of [[0.1, 0], [-0.1, 0], [0, 0.003], [0, -0.003]]) {
    const o = fly(ctx, r.club, r.h + dh * DEG, clamp(r.q + dq * cap, R.lo, R.hi), true);
    if (o.hazard) { pen += 0.1 * Math.max(0, 1 + outValue(ctx, o) - r.E); hz.push(o.hazard); }
  }
  return pen ? { ...r, E: r.E + pen, edge: hz } : r;
}
// water, out of bounds or a valley within r yd of (x, z) (eight points round it and four nearer)
function hazardNear(ctx, p, r) {
  for (const f of [1, 0.5]) for (let a = 0; a < 8; a += f === 1 ? 1 : 2) {
    const t = (a * Math.PI) / 4, g = ctx.RM.groundAt(ctx.c, p[0] + Math.sin(t) * r * f * YD, p[2] + Math.cos(t) * r * f * YD, { yMax: p[1] + 40 });
    if (!g || g.attr === 4 || g.attr === 5 || g.attr === 7 || g.attr === 13) return true;
  }
  return false;
}
// the assist's share of a candidate: the pulled launches flown at the table's states
function withAssist(ctx, r) {
  if (!r || !assistMayAct(ctx, r.club, r.q)) return r;
  const pi = r.club === "putter" ? PI_ASSIST.putter : PI_ASSIST.other;
  // at the cap the assist never pulls (assistedPower: p2 >= cap): nothing to fly
  if (r.q >= capOf(r.club, ctx.lie) - 1e-9) return { ...r, assist: { pi, moved: false } };
  let Epull = 0, Ppull = 0, moved = false, qa = r.q;
  for (const t of tableWeights(ctx, r.club, r.h)) {
    const q3 = assistedPower(ctx, r.q, r.club, t.pPin, t.best);
    if (Math.abs(q3 - r.q) < 1e-6) { Epull += t.w * r.E; Ppull += t.w * r.P; continue; }
    moved = true; qa = q3;
    const o = fly(ctx, r.club, r.h, q3, true), H = o.outcome === "holed";
    Epull += t.w * (H ? 1 : 1 + outValue(ctx, o)); Ppull += t.w * (H ? 1 : 0);
  }
  if (!moved) return { ...r, assist: { pi, moved: false } };
  return { ...r, Eswung: r.E, Pswung: r.P, E: (1 - pi) * r.E + pi * Epull, P: (1 - pi) * r.P + pi * Ppull, assist: { pi, moved: true, power: +qa.toFixed(4), E: +Epull.toFixed(3) } };
}
function holingClubs(ctx) {
  if (ctx.lie === 9) return ["putter", "wedge", "9iron", "7iron"];
  const short = ctx.D <= SHORT_YD;
  let clubs = isBunker(ctx.lie) ? ["wedge", "9iron", "7iron", "5iron", "3iron"] : BY_LOFT.slice();
  if (short) clubs = clubs.filter((c) => ["wedge", "9iron", "7iron", "5iron"].includes(c));
  if (short && PUTTER_OFF_GREEN && !isBunker(ctx.lie)) clubs.unshift("putter");
  return clubs;
}
// the holing search over the clubs that reach, natural club first (the most
// lofted whose full stroke rests past the pin), then the longer ones, then
// the more lofted (which cannot reach and drop out cheaply)
function holingPlan(ctx, { maxClubs = 4, reduced = false } = {}) {
  const clubs = holingClubs(ctx);
  const res = [];
  let tried = 0;
  for (const club of clubs) {
    if (tried >= maxClubs || (Date.now() > ctx.deadline && res.length)) break;
    const r = holeClub(ctx, club, { reduced });
    if (!r) continue;
    tried++;
    res.push(reduced && !assistMayAct(ctx, r.club, r.q) ? r : withAssist(ctx, r));
  }
  res.sort((a, b) => a.E - b.E);
  return res;
}

// ---- the long search: where a stroke comes to rest, and what that is worth ----
const LEVELS = { driver: [1, 0.94, 0.88, 0.8, 0.7, 0.6, 0.5], spoon: [1, 0.9, 0.8, 0.7], "3iron": [1, 0.85, 0.7], "5iron": [1, 0.8, 0.6], "7iron": [1, 0.75], "9iron": [1, 0.7], wedge: [1, 0.6] };
const FAN = [0, 3, -3, 6, -6, 10, -10, 15, -15, 20, -20, 26, -26];
// doglegs: the logged tee lines ran up to 39 deg off the pin line (hole 12's
// 35-39 right, hole 14's 31-32 left); the long clubs also go out along these
const FAN_WIDE = [33, -33, 40, -40, 48, -48];
const WIDE_LEVELS = { driver: [1, 0.88, 0.76], spoon: [1, 0.85], "3iron": [1, 0.8], "5iron": [1] };
// the fan: every club at a few powers along lines round the pin line and the
// game's own line; wide: lines all round the ball (when the fan finds nothing playable)
function longCands(ctx, { wide = false } = {}) {
  const clubs = isBunker(ctx.lie) ? ["3iron", "5iron", "7iron", "9iron", "wedge"] : ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge"];
  const heads = wide ? Array.from({ length: 36 }, (_, k) => ctx.toPin + k * 10 * DEG) : FAN.map((d) => ctx.toPin + d * DEG);
  // the game's own line (the hole's suggested aim: a dogleg's fairway) and round it
  if (!wide) for (const d of [0, 4, -4, 8, -8]) { const h = ctx.gameAim + d * DEG; if (!heads.some((x) => Math.abs(angDiff(x, h)) < 1.5 * DEG)) heads.push(h); }
  const out = [];
  for (const club of clubs) for (const f of wide ? [1, 0.7] : LEVELS[club]) for (const h of heads) out.push({ club, h, q: f * capOf(club, ctx.lie) });
  if (!wide && ctx.D > 150) for (const club of clubs) for (const f of WIDE_LEVELS[club] ?? []) for (const d of FAN_WIDE) out.push({ club, h: ctx.toPin + d * DEG, q: f * capOf(club, ctx.lie) });
  return out;
}
// a fan candidate's value; one that holes only on its own nominal line counts as a
// tap-in (the holing search, which weighs the aim's error, is the one that claims holes)
function evalCand(ctx, c) {
  const o = fly(ctx, c.club, c.h, c.q, true);
  let V = o.outcome === "holed" ? 1.01 : outValue(ctx, o);
  const fb = failedBefore(ctx, c.club, c.h, c.q);
  if (fb) V += 2;
  return { ...c, o, V, E: 1 + V, failed: fb };
}
// the value two shots ahead of a rest: the reduced holing search from it
// (one or two clubs), else its table value
function restValue(ctx, o) {
  // a nominal flight that holes is a tap-in here too (evalCand): the holing
  // search, which weighs the aim's error, is the one that claims holes
  if (o.outcome === "holed") return { V: 1.01 };
  if (o.hazard || o.outcome !== "rest") return { V: outValue(ctx, o) };
  const attr = o.restAttr, d = pinDist(ctx, o.rest);
  if (GREEN.has(attr) || ![1, 2, 3, 9, 15, 16].includes(attr)) return { V: outValue(ctx, o) };
  const table = outValue(ctx, o);
  const sub = restCtx(ctx, o);
  if (d > (REACH[LIE_NAME[attr] === "tee" ? "fairway" : LIE_NAME[attr]] ?? 265)) return { V: table };
  const r = holingPlan(sub, { maxClubs: 2, reduced: true });
  ctx.sims += sub.sims;
  if (!r.length) return { V: table, sub: "none" };
  // a reduced search finds a holing region less often than the full one: the
  // table bounds its pessimism
  return { V: Math.min(r[0].E, table + 0.15), sub: { club: r[0].club, P: +r[0].P.toFixed(2), E: +r[0].E.toFixed(3) } };
}
const o0hazard = (c) => !!c.o.hazard || c.o.outcome !== "rest";
function longPlan(ctx, { keep = 5, wide = false } = {}) {
  const cands = [];
  for (const c of longCands(ctx, { wide })) {
    if (Date.now() > ctx.deadline && cands.length > 30) break;
    cands.push(evalCand(ctx, c));
  }
  if (!cands.length) return [];
  cands.sort((a, b) => a.E - b.E);
  // refine round the best distinct rests: aim +-1 and +-2 deg, power +-0.03 / 0.06 of the cap
  const distinct = (list, n, yd) => {
    const out = [];
    for (const c of list) { if (out.length >= n) break; if (out.some((p) => Math.hypot(p.o.rest[0] - c.o.rest[0], p.o.rest[2] - c.o.rest[2]) / YD < yd)) continue; out.push(c); }
    return out;
  };
  for (const c of distinct(cands, 6, 6)) {
    if (Date.now() > ctx.deadline) break;
    const cap = capOf(c.club, ctx.lie);
    for (const [dh, dq] of [[1, 0], [-1, 0], [2, 0], [-2, 0], [0, 0.03], [0, -0.03], [0, 0.06], [0, -0.06]]) {
      const q = c.q + dq * cap;
      if (q > cap + 1e-9 || q < 0.1 * cap) continue;
      cands.push(evalCand(ctx, { club: c.club, h: c.h + dh * DEG, q }));
    }
  }
  cands.sort((a, b) => a.E - b.E);
  // two shots ahead for the best distinct rests
  const top = distinct(cands, keep, 5);
  for (const c of top) {
    if (Date.now() > ctx.deadline) break;
    const rv = restValue(ctx, c.o);
    c.V1 = rv.V; c.sub = rv.sub; c.E1 = 1 + rv.V + (c.failed ? 2 : 0);
  }
  // past the deadline the rest keep their table values
  for (const c of top) c.E1 ??= c.E + 0.05;
  // the neighbours of the best three: a rest at an edge is worth what its neighbours make of it
  const ranked = top.filter((c) => c.E1 != null).sort((a, b) => a.E1 - b.E1);
  for (const c of ranked.slice(0, 3)) {
    if (Date.now() > ctx.deadline + 600) break;
    const cap = capOf(c.club, ctx.lie);
    let dv = 0;
    const nb = [];
    for (const [dh, dq] of [[0.1, 0], [-0.1, 0], [0, 0.003], [0, -0.003]]) {
      const q = clamp(c.q + dq * cap, 0.02, cap);
      const o = fly(ctx, c.club, c.h + dh * DEG, q, true);
      const v = outValue(ctx, o);
      nb.push({ restLie: o.outcome === "holed" ? "cup" : o.hazard ? "hazard" : LIE_NAME[o.restAttr] ?? o.restAttr, d: +(Math.hypot(o.rest[0] - c.o.rest[0], o.rest[2] - c.o.rest[2]) / YD).toFixed(1) });
      dv += 0.1 * Math.max(0, v - c.V);
    }
    // a rest within a few yards of water, out of bounds or a valley: the
    // model's rare forks (5 of 443 logged strokes by 3 yd and more) find it
    const near = !o0hazard(c) && hazardNear(ctx, c.o.rest, 2.5 + 0.005 * Math.min(300, ctx.D));
    c.Erob = c.E1 + dv + (near ? 0.12 : 0);
    c.nb = nb;
    if (near) c.nearHazard = true;
  }
  for (const c of ranked) c.Efinal = c.Erob ?? c.E1 + 0.05;
  ranked.sort((a, b) => a.Efinal - b.Efinal);
  return ranked.length ? ranked : cands.slice(0, 1).map((c) => ({ ...c, Efinal: c.E }));
}

// ---- the green: shortPlan, else the KCL read of round-planner.mjs ----
const E_ = Math.log2(1 / 0.63), YD_S = 240 / 9.144;
const powerOfV0 = (v) => { const u = v / YD_S; return u > 0.004 ? Math.pow((u - 0.004) / 0.406, 1 / E_) : 0; };
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
  const top = await portRead(hole, st, g, a0, q0);
  if (top) return { club: "putter", power: top.mid, heading: g.toPin - top.a * DEG, expect: { src: "kcl-port", distance: +g.D.toFixed(2), aimDeg: +top.a.toFixed(3), holes: [+top.lo.toFixed(4), +top.hi.toFixed(4)] }, why: `putt ${g.D.toFixed(2)} yd (the KCL port's read): aim ${top.a >= 0 ? "+" : ""}${top.a.toFixed(2)} deg right of the cup, putter ${top.mid.toFixed(4)} (holes ${top.lo.toFixed(3)}-${top.hi.toFixed(3)})` };
  if (!rd) return null;
  return { club: "putter", power: q0, heading: g.toPin - a0 * DEG, expect: { src: "app", distance: +g.D.toFixed(2), aimDeg: +a0.toFixed(3) }, why: `putt ${g.D.toFixed(2)} yd: the app's read, aim ${a0 >= 0 ? "+" : ""}${a0.toFixed(2)} deg right of the cup, putter ${q0.toFixed(4)}` };
}

// ---- the plan ----
const pct = (x) => `${Math.round(100 * x)}%`;
function holingOut(ctx, r, ms, others) {
  const off = deg(angDiff(ctx.toPin, r.h));
  const o = fly(ctx, r.club, r.h, r.q, true), rr = rel(ctx, o.rest, r.h);
  const restLie = o.outcome === "holed" ? "cup" : o.hazard ? (o.hazard === 1 ? "water" : o.hazard === 2 ? "ob" : "valley") : LIE_NAME[o.restAttr] ?? String(o.restAttr);
  return {
    club: r.club, power: r.q, heading: r.h,
    expect: { src: "candidate:holing", D: +ctx.D.toFixed(2), holeP: +r.P.toFixed(3), E: +r.E.toFixed(3), aimDeg: +off.toFixed(3), restLie, toPin: +(o.outcome === "holed" ? 0 : pinDist(ctx, o.rest)).toFixed(2), carry: +rel(ctx, o.carry, r.h).a.toFixed(1), stop: +rr.a.toFixed(1), lateral: +rr.x.toFixed(2), assist: r.assist, grid: r.grid, others, sims: ctx.sims, ms },
    why: `${r.club} ${r.q.toFixed(4)} aimed ${off >= 0 ? "+" : ""}${off.toFixed(2)} deg right of the pin${ctx.yaw ? " (the lie's 2 deg yaw included)" : ""}, ${ctx.D.toFixed(1)} yd: holes ${pct(r.P)} under the aim's error (WSR's ball over the KCL, cup and flagstick in; ${r.grid?.holed ?? 0} of ${r.grid?.n ?? 0} grid launches hole)${o.outcome === "holed" ? "" : `, the centre rests ${pinDist(ctx, o.rest).toFixed(2)} yd away on ${restLie}`}${r.assist?.moved ? `; ${pct(r.assist.pi)} chance the assist pulls it to ${r.assist.power}` : ""}; ${r.E.toFixed(2)} strokes to hole out${others.length ? ` (${others.map((x) => `${x.club} ${x.E}`).join(", ")})` : ""}; ${ctx.sims} flights, ${ms} ms`,
  };
}
function longOut(ctx, c, ms, others) {
  const off = deg(angDiff(ctx.toPin, c.h));
  const o = c.o, rr = rel(ctx, o.rest, c.h);
  const restLie = o.outcome === "holed" ? "cup" : o.hazard ? (o.hazard === 1 ? "water" : o.hazard === 2 ? "ob" : "valley") : LIE_NAME[o.restAttr] ?? String(o.restAttr);
  const toPin = o.outcome === "holed" ? 0 : pinDist(ctx, o.rest);
  return {
    club: c.club, power: c.q, heading: c.h,
    expect: { src: "candidate:long", D: +ctx.D.toFixed(2), E: +c.Efinal.toFixed(3), restLie, toPin: +toPin.toFixed(1), carry: +rel(ctx, o.carry, c.h).a.toFixed(1), stop: +rr.a.toFixed(1), lateral: +rr.x.toFixed(1), next: c.sub, tree: o.tree ? { id: o.tree.id, code: o.tree.code } : undefined, neighbours: c.nb, others, sims: ctx.sims, ms },
    why: `${c.club} ${c.q.toFixed(3)} ${off >= 0 ? "+" : ""}${off.toFixed(1)} deg right of the pin line${ctx.yaw ? " (the lie's 2 deg yaw included)" : ""}: rests ${rr.a.toFixed(1)} yd out, ${rr.x >= 0 ? "+" : ""}${rr.x.toFixed(1)} across, on ${restLie}, ${toPin.toFixed(1)} yd from the pin${o.tree ? ` (meets tree ${o.tree.id})` : ""}; ${c.sub?.club ? `two shots ahead the ${c.sub.club} holes ${pct(c.sub.P)} from there, ` : ""}${c.Efinal.toFixed(2)} strokes to hole out${c.nb ? `, neighbours ${c.nb.map((n) => `${n.restLie} ${n.d}`).join("/")}` : ""}${others.length ? ` (${others.map((x) => `${x.club} ${x.E}`).join(", ")})` : ""}; ${ctx.sims} flights, ${ms} ms`,
  };
}
async function fullPlan(hole, st, deadline) {
  const t0 = Date.now();
  const { RM } = await models();
  const ctx = makeCtx(RM, hole, st, deadline);
  // the holing search when the pin is in reach (its clubs drop out cheaply when they cannot reach)
  const inReach = ctx.D <= (ctx.lie === 2 ? REACH.rough : isBunker(ctx.lie) ? REACH.bunker : REACH.fairway) + 15;
  let hp = [];
  if (inReach) {
    const save = ctx.deadline;
    // keep time for the long search when the approach is long
    if (ctx.D > 150 || isBunker(ctx.lie)) ctx.deadline = t0 + 0.55 * (deadline - t0);
    hp = holingPlan(ctx, { maxClubs: 4 });
    ctx.deadline = save;
  }
  const bestHole = hp[0] ?? null;
  // the long search, unless a holing approach is clearly the best there is
  let lp = [];
  if (!bestHole || bestHole.E > 1.45 || ctx.D > 150) lp = ctx.D > SHORT_YD || !bestHole ? longPlan(ctx) : [];
  // nothing playable along the fan (every rest a hazard or lost): lines all round the ball
  if ((!lp.length || lp[0].Efinal > 4.2) && (!bestHole || bestHole.E > 4.2)) {
    const save = ctx.deadline;
    ctx.deadline = Math.max(ctx.deadline, Date.now() + 2500);
    const w = longPlan(ctx, { wide: true });
    ctx.deadline = save;
    if (w.length && (!lp.length || w[0].Efinal < lp[0].Efinal)) lp = w.map((c) => ({ ...c, wide: true }));
  }
  const ms = () => Date.now() - t0;
  const bestLong = lp[0] ?? null;
  if (bestHole && (!bestLong || bestHole.E <= bestLong.Efinal)) return holingOut(ctx, bestHole, ms(), [...hp.slice(1).map((r) => ({ club: r.club, E: +r.E.toFixed(2), P: +r.P.toFixed(2) })), ...(bestLong ? [{ club: `${bestLong.club} (long)`, E: +bestLong.Efinal.toFixed(2) }] : [])]);
  if (bestLong) return longOut(ctx, bestLong, ms(), [...lp.slice(1, 4).map((c) => ({ club: c.club, E: +c.Efinal.toFixed(2) })), ...(bestHole ? [{ club: `${bestHole.club} (holing)`, E: +bestHole.E.toFixed(2) }] : [])]);
  return null;
}

export async function plan(hole, st) {
  const t0 = Date.now(), deadline = t0 + BUDGET_MS;
  const lie = st.player.lie;
  const notes = [];
  if (lie === 6 || lie === 10 || lie === 11) {
    try {
      const { RS } = await models();
      const sp = await RS.shortPlan(hole, st, { budgetMs: 4500 });
      if (sp) return { ...sp, expect: { ...sp.expect, src: "candidate:shortPlan" }, why: `${sp.why} (round-short.mjs shortPlan)` };
      notes.push("shortPlan found no putt");
    } catch (e) { notes.push(`shortPlan failed: ${e.message}`); }
    try {
      const p = await greenPutt(hole, st);
      if (p) return { ...p, why: `${p.why}${notes.length ? ` [${notes.join("; ")}]` : ""}` };
    } catch (e) { notes.push(`the KCL read failed: ${e.message}`); }
  } else {
    try {
      const p = await fullPlan(hole, st, deadline);
      if (p) return p;
      notes.push("no stroke found");
    } catch (e) { notes.push(`the search failed: ${e.message}`); }
  }
  const f = await planStroke(hole, lie === 9 ? { ...st, wind: { ...st.wind, speedIdx: 0 } } : st);
  return { ...f, why: `${f.why} (lib/play.mjs; ${notes.join("; ")})` };
}

// for the offline evaluation
export const _internals = { makeCtx, restCtx, fly, rel, outValue, holingPlan, holeClub, withAssist, longPlan, longCands, restValue, centreOf, fineEval, aimKernel, tableWeights, assistedPower, assistMayAct, PI_ASSIST, REACH };
