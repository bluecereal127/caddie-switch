import { useState, useEffect, useRef, useMemo } from "react";
import { HOLE_MAPS } from "./maps.js";
import { MAP_XFORM_V5 } from "./mapxform.js";


/* ============================================================
   CADDIE·SWITCH v13 — clickable hole maps + solver + tracker
   Tap map: 1st tap = ball, 2nd = target. Calibrate each hole
   once with a known in-game distance; after that every line
   you draw auto-measures and feeds the solver.
   ============================================================ */

const STORE_KEY = "sss-golf-solver-v2";

// Defaults from Wii Sports Resort's official club ranges (Driver <250yd, 3W <200,
// 3i <175, 5i <155, 7i <135, 9i <100, Wedge <80). a = max/4 bars.
// LIE MECHANIC (player-verified): lies cap the usable BAR, they don't scale distance.
// Below the cap, every bar flies its normal distance.
//   rough: cap = 3/4 of the bar for every club (official "reduced by a quarter")
//   bunker: driver & spoon capped at 1 bar; every other club capped at 2 bars;
//           putter uncapped but rolls out much less in sand
// So from sand: driver max ≈ 62yd (1 bar) while 3i reaches ≈ 87yd (2 bars).
// Drivers and spoons cannot backspin. Trajectory: driver lowest → wedge highest.
const DEFAULT_CLUBS = [
  { id: "driver", name: "Driver", a: 62.5,  h: 0.008, c: 0.35, spin: false, traj: "low",      maxPower: 4.0, shots: 0 },
  { id: "spoon",  name: "Spoon",  a: 50.0,  h: 0.009, c: 0.40, spin: false, traj: "low-mid",  maxPower: 4.0, shots: 0 },
  { id: "3iron",  name: "3 Iron", a: 43.75, h: 0.009, c: 0.42, spin: true,  traj: "mid",      maxPower: 4.0, shots: 0 },
  { id: "5iron",  name: "5 Iron", a: 38.75, h: 0.010, c: 0.44, spin: true,  traj: "mid",      maxPower: 4.0, shots: 0 },
  { id: "7iron",  name: "7 Iron", a: 33.75, h: 0.010, c: 0.47, spin: true,  traj: "mid-high", maxPower: 4.0, shots: 0 },
  { id: "9iron",  name: "9 Iron", a: 25.0,  h: 0.011, c: 0.50, spin: true,  traj: "high",     maxPower: 4.0, shots: 0 },
  { id: "wedge",  name: "Wedge",  a: 20.0,  h: 0.012, c: 0.55, spin: true,  traj: "highest",  maxPower: 4.0, shots: 0 },
];
// Caps confirmed in-game (fixed; not user-editable): rough = 3 bars for every club;
// sand: wedge 3, all irons 2, spoon & driver 1; putter uncapped (dead roll in sand).
const BUNKER_CAPS = { driver: 1, spoon: 1, "3iron": 2, "5iron": 2, "7iron": 2, "9iron": 2, wedge: 3 };
const capFor = (club, lie) =>
  lie === "bunker" ? (BUNKER_CAPS[club.id] ?? 2) : lie === "rough" ? 3.0 : club.maxPower;
const CLUB_MIGRATE = { "3wood": "spoon", pw: "wedge", sw: "wedge" };

const COURSES = [
  { name: "Resort", holes: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  { name: "Classic", holes: [10, 11, 12, 13, 14, 15, 16, 17, 18] },
  { name: "Special", holes: [19, 20, 21] },
];

// pars confirmed from the in-game hole select screen
const PARS = { 1:4, 2:3, 3:5, 4:3, 5:5, 6:4, 7:4, 8:3, 9:5, 10:4, 11:3, 12:5, 13:3, 14:5, 15:4, 16:4, 17:3, 18:5, 19:4, 20:4, 21:4 };

const NOTES = {
  1:  "Straight hole. Driver 4.00 off tee; 9i ~3.25–3.4 for the eagle look.",
  2:  "Tee often misaligned with pin — re-aim before stroke 1. 5i ~3.0 reaches green. Book: 7i ~3.5 first-bounces just shy of the green for a roll-up.",
  3:  "Driver 4.0 clear of left beach; then driver 4.0 with right curve (3.5 finds the bunker).",
  4:  "5i ~3.7 onto the green.",
  5:  "Straight driver 4.0 finds a bunker — curve left past the trees, or 3.5 straight. Long: 3 shots to green.",
  6:  "Drive 3.7–4.0 as far left as feasible. Stroke 2 is steep downhill to a sloping green: driver ~1.6–2.1 if trees are clear.",
  7:  "Tree hole. Driver 4.0 right of the center tree threads the gaps; then 7i 3.4 / 5i 2.7. Alt: spoon 3.0 to the big fairway, then driver ~3.7–3.8.",
  8:  "Water everywhere + big drop. 5i 3.25–3.4; 3.0 is wet short, 4.0 wet long.",
  9:  "Driver 4.0 slightly left, spoon ~2.3 to the lake's south shore, 7i 3.7 in. Green is on a slope.",
  10: "Straight. Driver 4.00, then 9i 3.5–3.6. In left wind, watch the two left-side fairway bunkers.",
  11: "7i 3.7–3.8 lands the sweetspot between bunker and pin.",
  12: "Left-plateau route: driver 3.8–4.0 (skip if headwind ≥10). Then spoon 3.5–3.7 down over the bunkers. Book: 17 mph headwind is the max for the plateau carry — any more and you undershoot.",
  13: "Tee misaligned — re-aim first. 7i 3.7–3.8 to green. Book: wind bites harder here than you expect.",
  14: "Driver 3.8 (4.0 rolls into rough), then ~3.9 at the green. Tailwind ≥5: diagonal bay cut with 4.0, then 5i 3.5 (3.0 finds bunker). Book: pin-left → club down to spoon on the dogleg; pin-right → send it through the trees to the fairway.",
  15: "Driver 4.0 to the left bank, 9i 3.5 in. The direct river cut is a no even in max tailwind.",
  16: "Driver 3.5 slightly left (4.0 leaves a tree on stroke 2). Shortcut: 4.0 just right of the south bunker → bunker lie but eagle look. Never with headwind ≥5.",
  17: "Driver 4.0 at the hilltop is the only line. Big uphill — plays shorter than the map suggests.",
  18: "Island hop: 4.0 to the SE island's NW edge, then 4.0 to the green island. Tailwind opens the west island; heavy headwind forces the 3-island route. Book: with ≤6 mph headwind, play the left island; expect extra wind effect on stroke 2.",
  19: "Driver 4.0 to mid north bank; stroke 2 can cut the corner through the trees to green.",
  20: "Driver 3.5–4.0 up the fairway. Risky line between the tree and rock wall gives a cleaner stroke 2.",
  21: "Driver 4.0 clears the long downslope; aim slightly right in 5–10 tailwind (bunker). Steep bowl green.",
};

const LIES = { tee: 1.0, fairway: 1.0, rough: 0.85, bunker: 0.7 };
// Tree positions hand-annotated from the overview maps (fractional x,y).
// Seeded once as editable hazard markers — delete any that look wrong.
const TREE_SEEDS = {
  1:[[.36,.10],[.62,.12],[.28,.30],[.70,.30],[.27,.48],[.71,.50],[.33,.68],[.63,.70]],
  2:[[.18,.12],[.30,.08],[.70,.30],[.66,.48],[.75,.50],[.22,.55],[.18,.68],[.68,.65]],
  3:[[.40,.08],[.66,.10],[.75,.22],[.72,.40],[.25,.62],[.70,.72],[.60,.82]],
  4:[[.22,.10],[.15,.20],[.75,.18],[.63,.30],[.72,.55],[.60,.68],[.18,.35]],
  5:[[.35,.08],[.60,.10],[.45,.22],[.58,.20],[.35,.45],[.30,.55],[.65,.50]],
  6:[[.66,.14],[.72,.28],[.70,.45],[.28,.30],[.25,.50],[.55,.38],[.35,.72]],
  7:[[.30,.12],[.52,.30],[.68,.25],[.35,.45],[.50,.55],[.66,.60],[.30,.60],[.55,.78]],
  8:[[.30,.78],[.45,.85],[.60,.80],[.18,.55],[.72,.50]],
  9:[[.28,.15],[.62,.30],[.70,.45],[.30,.65],[.25,.78],[.68,.68]],
  10:[[.38,.12],[.30,.35],[.68,.28],[.66,.55],[.34,.60]],
  11:[[.35,.12],[.25,.30],[.20,.45],[.30,.55],[.35,.68],[.70,.35]],
  12:[[.34,.15],[.62,.18],[.50,.40],[.68,.35]],
  13:[[.35,.15],[.60,.15],[.15,.35],[.15,.55],[.80,.40],[.78,.60],[.30,.80],[.55,.85]],
  14:[[.30,.10],[.60,.35],[.68,.42],[.63,.50],[.25,.40],[.55,.70]],
  15:[[.22,.12],[.35,.10],[.18,.35],[.65,.15],[.62,.72],[.70,.60],[.25,.70]],
  16:[[.28,.12],[.20,.25],[.60,.20],[.42,.38],[.60,.58]],
  17:[[.30,.10],[.20,.35],[.72,.30],[.28,.68],[.40,.78],[.65,.70]],
  18:[[.30,.42],[.72,.30],[.52,.62]],
  19:[[.48,.30],[.55,.35],[.42,.38],[.70,.25],[.25,.30],[.65,.72]],
  20:[[.30,.12],[.22,.28],[.66,.20],[.62,.45],[.28,.50],[.45,.78]],
  21:[[.30,.30],[.28,.50],[.62,.15],[.66,.40],[.45,.75]],
};
const treeSeedMarkers = (n) => (TREE_SEEDS[n] ?? []).map(([x, y], i) => ({ id: n * 1000 + i, x, y, auto: true }));

// Community "hard truths": route feasibility vs wind, from the Switch Sports wiki
// hole strategies + the SwitchSportsGolfCaddy shot book. dir is relative to YOUR
// shot line: tail = pushing you, head = against, crossL/crossR = blowing left/right.
// kind: block = route dead, warn = caution, open = wind unlocks this route.
const WIND_RULES = {
  7:  [{ stroke: 1, dir: "tail", min: 4, kind: "open", text: "Left mini-fairway attempt becomes live — without real tailwind it hits the tree and lands OB." }],
  10: [{ stroke: 1, dir: "crossL", min: 12, kind: "warn", text: "Heavy left-blowing wind puts the two left-half fairway bunkers in play off the tee." }],
  12: [{ stroke: 1, dir: "head", min: 10, max: 16, kind: "warn", text: "Wiki: avoid the plateau route in ≥10 mph headwind." },
       { stroke: 1, dir: "head", min: 17, kind: "block", text: "Book: plateau carry is unreachable at ≥17 mph headwind — play the dogleg." }],
  14: [{ stroke: 1, dir: "tail", min: 5, kind: "open", text: "Bay diagonal cut with driver 4.0 becomes possible; if it lands fairway, 5i 3.5 reaches green." }],
  15: [{ stroke: 0, dir: "any", min: 0, kind: "block", text: "The direct cut over the river is never on — a matter of millimeters even at 31 mph tailwind." }],
  16: [{ stroke: 1, dir: "head", min: 5, kind: "block", text: "The bunker shortcut is guaranteed OB with ≥5 mph headwind." },
       { stroke: 1, dir: "head", max: 4, kind: "open", text: "Shortcut live: driver 4.0 just right of the south bunker → bunker lie but eagle look." }],
  18: [{ stroke: 1, dir: "tail", min: 0, kind: "open", text: "West island narrowly reachable with driver 4.0 — opens shorter clubs on stroke 2." },
       { stroke: 1, dir: "head", max: 6, kind: "open", text: "Book: with ≤6 mph headwind the left island is the play." },
       { stroke: 1, dir: "head", min: 7, kind: "block", text: "Left island is out — take the 3-island route (SE → NE → green)." }],
  21: [{ stroke: 1, dir: "tail", min: 5, max: 10, kind: "warn", text: "Aim slightly right of the default line or the downslope run-out finds the bunker." }],
};

function windDirClass(relDeg) {
  const d = ((relDeg % 360) + 360) % 360;
  if (d <= 45 || d >= 315) return "tail";
  if (d >= 135 && d <= 225) return "head";
  return d < 180 ? "crossR" : "crossL";
}
function matchWindRules(hole, stroke, speed, relDeg) {
  const rules = WIND_RULES[hole] ?? [];
  const cls = windDirClass(relDeg);
  return rules.filter((r) =>
    (r.stroke === 0 || r.stroke === stroke) &&
    (r.dir === "any" || r.dir === cls) &&
    speed >= (r.min ?? 0) && (r.max == null || speed <= r.max)
  );
}

const GRID_N = 9;
const emptyGreen = () => ({ box: null, grid: Array.from({ length: GRID_N }, () => Array.from({ length: GRID_N }, () => [0, 0])) });
const MU = 1.35;        // rolling friction, yd/s^2
const SLOPE_G = 1.1;    // accel per slope unit, yd/s^2
const CUP_R = 0.22;     // capture radius, yd
const CUP_V = 2.2;      // max capture speed, yd/s

function simPutt(grid, Wyd, Hyd, ball, cup, angDeg, pw) {
  const D = Math.hypot((cup.x - ball.x) * Wyd, (cup.y - ball.y) * Hyd);
  const base = Math.atan2((cup.x - ball.x) * Wyd, -((cup.y - ball.y) * Hyd));
  const th = base + (angDeg * Math.PI) / 180;
  const v0 = Math.sqrt(2 * MU * D) * pw;
  let px = ball.x * Wyd, py = ball.y * Hyd;
  let vx = Math.sin(th) * v0, vy = -Math.cos(th) * v0;
  const cx = cup.x * Wyd, cy = cup.y * Hyd;
  const path = [[px / Wyd, py / Hyd]];
  const dt = 0.045;
  let holed = false, best = Infinity;
  for (let i = 0; i < 400; i++) {
    const sp = Math.hypot(vx, vy);
    const d = Math.hypot(px - cx, py - cy);
    if (d < best) best = d;
    if (d < CUP_R && sp < CUP_V) { holed = true; path.push([cx / Wyd, cy / Hyd]); break; }
    if (sp < 0.06) break;
    const gi = Math.min(GRID_N - 1, Math.max(0, Math.floor((px / Wyd) * GRID_N)));
    const gj = Math.min(GRID_N - 1, Math.max(0, Math.floor((py / Hyd) * GRID_N)));
    const [sx, sy] = grid[gj][gi];
    const ax = sx * SLOPE_G - MU * (vx / sp);
    const ay = sy * SLOPE_G - MU * (vy / sp);
    vx += ax * dt; vy += ay * dt; px += vx * dt; py += vy * dt;
    if (i % 4 === 0) path.push([px / Wyd, py / Hyd]);
  }
  path.push([px / Wyd, py / Hyd]);
  return { holed, best, endSp: Math.hypot(vx, vy), path, D };
}

function solvePutt(grid, Wyd, Hyd, ball, cup) {
  const cost = (r, pw) => (r.holed ? -2 + pw * 0.1 : r.best + Math.max(0, r.best - CUP_R) * 0.3);
  let best = null;
  const tryOne = (a, p) => {
    const r = simPutt(grid, Wyd, Hyd, ball, cup, a, p);
    const c = cost(r, p);
    if (!best || c < best.c) best = { c, a, p, r };
  };
  for (let a = -35; a <= 35; a += 5) for (let p = 0.7; p <= 1.55; p += 0.085) tryOne(a, p);
  const { a: a0, p: p0 } = best;
  for (let a = a0 - 4; a <= a0 + 4; a += 1) for (let p = Math.max(0.5, p0 - 0.08); p <= p0 + 0.08; p += 0.02) tryOne(a, p);
  return best;
}


const T = {
  turf: "#2E7D46", turfDeep: "#1E5631", turfLight: "#3E9A5C",
  sky: "#CBE9F6", sand: "#EAD9A4", flag: "#E5484D",
  ink: "#14301D", cream: "#F7F9F4", line: "#CFE0D2",
};

/* ---------------- math ---------------- */
function fitClub(club, shots) {
  const mine = shots.filter((s) => s.club === club.id);
  if (mine.length === 0) return { ...club, shots: 0 };
  const next = { ...club, shots: mine.length };
  const clean = mine.filter((s) => s.lie === "tee" || s.lie === "fairway");
  const pool = clean.length ? clean : mine;
  const xs = [], ys = [];
  pool.forEach((s) => {
    const pe = s.power;
    if (pe > 0 && s.carry > 0) { xs.push(s.wAlong); ys.push(s.carry / pe); }
  });
  if (ys.length >= 1) {
    const n = ys.length;
    const mx = xs.reduce((u, v) => u + v, 0) / n;
    const my = ys.reduce((u, v) => u + v, 0) / n;
    let num = 0, den = 0;
    xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
    if (den > 4 && n >= 3) {
      const B = num / den, A = my - B * mx;
      if (A > 0) { next.a = A; next.h = Math.max(-0.03, Math.min(0.03, B / A)); }
    } else {
      let sum = 0, cnt = 0;
      pool.forEach((s) => {
        const pe = s.power;
        const f = 1 + club.h * s.wAlong;
        if (pe > 0 && f > 0.5) { sum += s.carry / (pe * f); cnt++; }
      });
      if (cnt) next.a = sum / cnt;
    }
  }
  let nu = 0, de = 0;
  pool.forEach((s) => {
    if (s.lateral == null) return;
    const pe = s.power;
    const x = s.wCross * pe;
    if (Math.abs(s.wCross) > 1) { nu += s.lateral * x; de += x * x; }
  });
  if (de > 0) next.c = Math.max(0, Math.min(2, nu / de));
  return next;
}

function solve(clubs, inputs, blockedRules) {
  const { dist, windSpeed, relWindDeg, lie, hole, stroke } = inputs;
  const rad = (relWindDeg * Math.PI) / 180;
  const wAlong = windSpeed * Math.cos(rad);
  const wCross = windSpeed * Math.sin(rad);
  const out = [];
  let maxReach = null;
  clubs.forEach((cl) => {
    const cap = capFor(cl, lie);
    const denom = cl.a * (1 + cl.h * wAlong);
    if (denom <= 0 || cap <= 0) return;
    const reach = denom * cap;
    if (!maxReach || reach > maxReach.yd) maxReach = { yd: reach, club: cl.name };
    const p = dist / denom;
    if (p < 0.4 || p > cap) return;
    const drift = cl.c * wCross * p;
    const aim = -drift;
    const frac = p / cap;
    const rule = hole ? blockedRules.find(
      (r) => r.hole === hole && r.club === cl.id && (r.stroke === 0 || r.stroke === stroke) && Math.abs(r.aim - aim) <= 10
    ) : null;
    let score = Math.abs(frac - 0.8) + (frac > 0.97 ? 0.5 : 0);
    if (rule) score += 10;
    out.push({ club: cl, power: p, drift, aim, frac, cap, score, calibrated: cl.shots, blocked: rule || null });
  });
  return { recs: out.sort((x, y) => x.score - y.score).slice(0, 3), wAlong, wCross, maxReach };
}

const fmtPow = (p) => (Math.round(p * 20) / 20).toFixed(2);
const holeCourse = (n) => COURSES.find((c) => c.holes.includes(n))?.name ?? "";
const scoreName = (d) => d <= -3 ? "Albatross" : d === -2 ? "Eagle" : d === -1 ? "Birdie" : d === 0 ? "Par" : d === 1 ? "Bogey" : d === 2 ? "Dbl bogey" : `+${d}`;
const fmtVs = (d) => (d > 0 ? `+${d}` : d === 0 ? "E" : `${d}`);

/* ---------------- wind dial ---------------- */
function WindDial({ deg, setDeg, speed, topLabel = "PIN", bottomLabel = "YOU", size = "w-36 h-36", snap = 5 }) {
  const ref = useRef(null);
  const drag = (e) => {
    const r = ref.current.getBoundingClientRect();
    const pt = e.touches ? e.touches[0] : e;
    let a = (Math.atan2(pt.clientX - (r.left + r.width / 2), -(pt.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
    setDeg((Math.round((((a % 360) + 360) % 360) / snap) * snap) % 360);
  };
  const onDown = (e) => {
    drag(e);
    const mv = (ev) => drag(ev);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  const len = 8 + Math.min(31, speed) * 0.9;
  const wcol = speed >= 20 ? "#E5489B" : speed >= 10 ? "#E3B341" : "#3B82C4";
  return (
    <svg ref={ref} viewBox="0 0 120 120" className={`${size} select-none touch-none cursor-pointer shrink-0`} onPointerDown={onDown}>
      <circle cx="60" cy="60" r="54" fill={T.sky} stroke={T.ink} strokeWidth="2.5" />
      <circle cx="60" cy="60" r="54" fill="none" stroke="#fff" strokeWidth="1" strokeDasharray="2 6" opacity="0.8" />
      <text x="60" y="16" textAnchor="middle" fontSize="9" fontWeight="700" fill={T.ink}>{topLabel}</text>
      <text x="60" y="112" textAnchor="middle" fontSize="9" fontWeight="700" fill={T.ink}>{bottomLabel}</text>
      <g transform={`rotate(${deg} 60 60)`}>
        <line x1="60" y1={60 + len} x2="60" y2={60 - len} stroke={wcol} strokeWidth="6" strokeLinecap="round" />
        <path d={`M 60 ${60 - len - 10} L 51 ${60 - len + 4} L 69 ${60 - len + 4} Z`} fill={wcol} />
      </g>
      <circle cx="60" cy="60" r="5" fill={T.ink} />
    </svg>
  );
}

/* ---------------- green canvas (grid painter + putt view) ---------------- */
function GreenCanvas({ mapSrc, green, mode, onGrid, ball, cup, onTap, path, aimPt }) {
  const [phase, setPhase] = useState(0);
  const dragRef = useRef(null);
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 1000), 90);
    return () => clearInterval(id);
  }, []);
  if (!green?.box) return null;
  const { x0, y0, x1, y1 } = green.box;
  const iw = 100 / Math.max(0.02, x1 - x0), ih = 100 / Math.max(0.02, y1 - y0);
  const cell = 100 / GRID_N;
  const toBox = (e, el) => {
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const down = (e) => {
    if (mode !== "paint") return;
    dragRef.current = { start: toBox(e, e.currentTarget) };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const up = (e) => {
    if (mode === "putt") { const p = toBox(e, e.currentTarget); onTap && onTap(p.x, p.y); return; }
    if (mode !== "paint" || !dragRef.current) return;
    const end = toBox(e, e.currentTarget);
    const s = dragRef.current.start; dragRef.current = null;
    const i = Math.min(GRID_N - 1, Math.max(0, Math.floor(s.x * GRID_N)));
    const j = Math.min(GRID_N - 1, Math.max(0, Math.floor(s.y * GRID_N)));
    const dx = (end.x - s.x) * 100, dy = (end.y - s.y) * 100;
    const len = Math.hypot(dx, dy);
    const g = green.grid.map((row) => row.map((v) => [...v]));
    if (len < 3) g[j][i] = [0, 0];
    else {
      const m = len < 8 ? 1 : len < 15 ? 2 : 3;
      g[j][i] = [(dx / len) * m, (dy / len) * m];
    }
    onGrid && onGrid(g);
  };
  return (
    <div className="relative rounded-xl overflow-hidden select-none touch-none" style={{ border: `3px solid ${T.turfDeep}`, cursor: mode === "view" ? "default" : "crosshair" }}
      onPointerDown={down} onPointerUp={up}>
      <svg viewBox="0 0 100 100" className="w-full block" style={{ aspectRatio: "1" }}>
        <image href={mapSrc} x={-x0 * iw} y={-y0 * ih} width={iw} height={ih} preserveAspectRatio="none" />
        <rect x="0" y="0" width="100" height="100" fill="rgba(20,48,29,0.08)" />
        {Array.from({ length: GRID_N + 1 }, (_, k) => (
          <g key={k}>
            <line x1={k * cell} y1="0" x2={k * cell} y2="100" stroke="#fff" strokeWidth="0.25" opacity="0.5" />
            <line x1="0" y1={k * cell} x2="100" y2={k * cell} stroke="#fff" strokeWidth="0.25" opacity="0.5" />
          </g>
        ))}
        {green.grid.map((row, j) => row.map(([sx, sy], i) => {
          const m = Math.hypot(sx, sy);
          if (m < 0.5) return null;
          const ux = sx / m, uy = sy / m;
          const cx = (i + 0.5) * cell, cy = (j + 0.5) * cell;
          return [0, 1].map((k) => {
            const t = ((phase * (0.35 + m * 0.3) + k * 5) % 10) / 10 - 0.5;
            return <circle key={`${i}-${j}-${k}`} cx={cx + ux * t * (cell * 0.8)} cy={cy + uy * t * (cell * 0.8)}
              r={0.9 + m * 0.25} fill="#fff" opacity={0.45 + m * 0.15} />;
          });
        }))}
        {path && <polyline points={path.map(([x, y]) => `${x * 100},${y * 100}`).join(" ")} fill="none" stroke={T.sand} strokeWidth="1.1" strokeDasharray="2 1.5" />}
        {aimPt && <g transform={`translate(${aimPt.x * 100} ${aimPt.y * 100})`}>
          <line x1="-2.5" y1="0" x2="2.5" y2="0" stroke={T.sand} strokeWidth="1" />
          <line x1="0" y1="-2.5" x2="0" y2="2.5" stroke={T.sand} strokeWidth="1" />
        </g>}
        {ball && <circle cx={ball.x * 100} cy={ball.y * 100} r="2.2" fill="#fff" stroke={T.ink} strokeWidth="0.7" />}
        {cup && <g transform={`translate(${cup.x * 100} ${cup.y * 100})`}>
          <circle r="1.6" fill={T.ink} />
          <line x1="0" y1="0" x2="0" y2="-7" stroke="#fff" strokeWidth="0.8" />
          <path d="M 0 -7 L 5 -5.2 L 0 -3.4 Z" fill={T.flag} />
        </g>}
      </svg>
    </div>
  );
}

/* ---------------- clickable hole map ---------------- */
function HoleMap({ holeNum, line, onLine, markers, onMarkers, markerMode, aimPreview, cornerMode, onCorner, greenBox, pins = [], curPinId = null, pinMode = false, onPins, distLabel = null }) {
  const imgRef = useRef(null);
  const [dims, setDims] = useState({ w: 113, h: 140 });
  const src = HOLE_MAPS[holeNum];

  const click = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    if (cornerMode) { onCorner && onCorner(fx, fy); return; }
    if (pinMode) {
      const near = pins.find((p) => Math.hypot(p.x - fx, p.y - fy) < 0.05);
      if (near) onPins && onPins(pins.filter((p) => p.id !== near.id));
      else onPins && onPins([...pins, { id: Date.now(), x: fx, y: fy }]);
      return;
    }
    if (markerMode) {
      const near = markers.find((m) => Math.hypot(m.x - fx, m.y - fy) < 0.06);
      if (near) onMarkers(markers.filter((m) => m.id !== near.id));
      else onMarkers([...markers, { id: Date.now(), x: fx, y: fy }]);
      return;
    }
    if (!line.ball || (line.ball && line.target)) onLine({ ball: { x: fx, y: fy }, target: null });
    else onLine({ ...line, target: { x: fx, y: fy } });
  };

  const px = (p) => ({ x: p.x * 100, y: p.y * 100 });
  const b = line.ball ? px(line.ball) : null;
  const t = line.target ? px(line.target) : null;

  // aim preview point: rotate the aim offset (yd → map fraction handled by parent via aimPreview.fx/fy)
  return (
    <div className="relative rounded-xl overflow-hidden select-none" style={{ border: `3px solid ${T.turfDeep}`, cursor: "crosshair" }} onClick={click}>
      <img ref={imgRef} src={src} alt={`Hole ${holeNum} map`} className="w-full block" draggable={false}
        onLoad={(e) => setDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })} />
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {b && t && <line x1={b.x} y1={b.y} x2={t.x} y2={t.y} stroke="#fff" strokeWidth="1" strokeDasharray="2.5 2" />}
        {b && t && distLabel && (
          <g transform={`translate(${(b.x + t.x) / 2} ${(b.y + t.y) / 2})`}>
            <rect x="-11" y="-4.5" width="22" height="8" rx="2" fill="rgba(20,48,29,0.85)" />
            <text y="1.8" textAnchor="middle" fontSize="4.6" fontWeight="700" fill="#fff">{distLabel}</text>
          </g>
        )}
        {b && t && aimPreview && (
          <line x1={b.x} y1={b.y} x2={aimPreview.x * 100} y2={aimPreview.y * 100} stroke={T.sand} strokeWidth="1" strokeDasharray="1.5 1.5" />
        )}
        {greenBox && <rect x={greenBox.x0 * 100} y={greenBox.y0 * 100} width={(greenBox.x1 - greenBox.x0) * 100} height={(greenBox.y1 - greenBox.y0) * 100}
          fill="rgba(234,217,164,0.15)" stroke={T.sand} strokeWidth="0.8" strokeDasharray="2 1.5" />}
        {pins.map((p, i) => {
          const cur = p.id === curPinId;
          return (
            <g key={p.id} transform={`translate(${p.x * 100} ${p.y * 100})`}>
              {cur && <circle r="4" fill="none" stroke="#fff" strokeWidth="0.9" />}
              <circle r="1.4" fill={cur ? T.flag : "#fff"} stroke={T.ink} strokeWidth="0.5" />
              <line x1="0" y1="0" x2="0" y2="-6" stroke={cur ? T.flag : "#fff"} strokeWidth="1" />
              <path d="M 0 -6 L 4.5 -4.5 L 0 -3 Z" fill={cur ? T.flag : "#EAD9A4"} stroke={T.ink} strokeWidth="0.3" />
              <text y="-7.5" textAnchor="middle" fontSize="3.4" fontWeight="700" fill="#fff" stroke={T.ink} strokeWidth="0.15">{i + 1}</text>
            </g>
          );
        })}
        {markers.map((m) => (
          <g key={m.id} transform={`translate(${m.x * 100} ${m.y * 100})`} opacity={m.auto ? 0.85 : 1}>
            <circle r={m.auto ? 2.6 : 3.2} fill="#0B3D1E" stroke="#fff" strokeWidth={m.auto ? 0.4 : 0.7} />
            <text y="1.5" textAnchor="middle" fontSize={m.auto ? 3.8 : 4.5}>🌲</text>
          </g>
        ))}
        {b && <circle cx={b.x} cy={b.y} r="2.6" fill="#fff" stroke={T.ink} strokeWidth="0.8" />}
        {t && <g transform={`translate(${t.x} ${t.y})`}>
          <circle r="2.8" fill="none" stroke={T.flag} strokeWidth="1.1" />
          <circle r="0.9" fill={T.flag} />
        </g>}
      </svg>
    </div>
  );
}

/* ---------------- main app ---------------- */
/* ---- shot data coverage (Phase 2) ----
   The old manual capture catalog is gone: the PC pipeline now detects and
   ingests captures automatically. What still needs deliberate play is the
   club model — shots logged per club and lie. Target: a few full-power
   anchors per cell (bunker caps make driver/spoon from sand a 1-bar shot). */
const COVERAGE_LIES = ["tee", "fairway", "rough", "bunker"]; // the app's lie keys (bunker = sand)
const COVERAGE_GOAL = 3; // logged shots per club+lie before the cell reads "good"

export default function App() {
  const [tab, setTab] = useState("holes");
  const [clubs, setClubs] = useState(DEFAULT_CLUBS);
  const [shots, setShots] = useState([]);
  const [holesMeta, setHolesMeta] = useState(() => {
    const m = {};
    for (let n = 1; n <= 21; n++) m[n] = { par: PARS[n], note: NOTES[n], blocked: [], markers: treeSeedMarkers(n), scale: null, green: emptyGreen(), pins: [], curPin: null };
    return m;
  });
  const [rounds, setRounds] = useState([]);
  const [activeRound, setActiveRound] = useState(null);
  const [saveState, setSaveState] = useState("");
  const [openHole, setOpenHole] = useState(null);
  const [holeMarkerEdit, setHoleMarkerEdit] = useState(false);
  const [cornerMode, setCornerMode] = useState(false);
  const [cornerTmp, setCornerTmp] = useState(null);
  const [greenPaint, setGreenPaint] = useState(false);
  const [pinEdit, setPinEdit] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [ioText, setIoText] = useState("");
  const [solverPinMode, setSolverPinMode] = useState(false);
  const [putt, setPutt] = useState({ ball: null, cup: null });

  // solver state
  const [hole, setHole] = useState(1);
  const [stroke, setStroke] = useState(1);
  const [dist, setDist] = useState(180);
  const [windSpeed, setWindSpeed] = useState(8);
  const [windDeg, setWindDeg] = useState(90);
  const [windMode, setWindMode] = useState("map"); // 'map' (N-up, as minimap shows) | 'shot'
  const [lie, setLie] = useState("tee");
  const [line, setLine] = useState({ ball: null, target: null });
  const [markerMode, setMarkerMode] = useState(false);
  const [calInput, setCalInput] = useState("");

  const empty = { club: "driver", power: "3.5", lie: "tee", windSpeed: "0", windDeg: 0, carry: "", lateral: "", hole: 0, stroke: 1 };
  const [form, setForm] = useState(empty);

  /* ---- load ---- */
  useEffect(() => {
    (async () => {
      let d = null;
      try { const r = await window.storage.get(STORE_KEY); if (r?.value) d = JSON.parse(r.value); } catch {}
      if (d) {
        const loadedShots = (d.shots ?? []).map((s) => ({ ...s, club: CLUB_MIGRATE[s.club] ?? s.club, hole: s.hole ?? 0, stroke: s.stroke ?? 1 }));
        setShots(loadedShots);
        {
          const stored = d.clubs ?? [];
          const merged = DEFAULT_CLUBS.map((def) => { const s0 = stored.find((c) => c.id === def.id); return s0 ? { ...def, ...s0 } : def; });
          setClubs(merged.map((c) => fitClub(c, loadedShots)));
        }
        setHolesMeta((prev) => {
          const merged = { ...prev };
          if (d.holesMeta) for (let n = 1; n <= 21; n++) {
            const old = d.holesMeta[n];
            if (old) merged[n] = {
              par: d.parFixV3 ? old.par : PARS[n],   // one-time par correction from the official screen
              note: old.note ?? NOTES[n],
              blocked: old.blocked ?? [], markers: old.markers ?? [], scale: old.scale ?? null,
              green: old.green ?? emptyGreen(),
              pins: old.pins ?? [], curPin: old.curPin ?? null,
            };
          }
          return merged;
        });
        if (!d.treesV9) setHolesMeta((prev) => {
          const m = { ...prev };
          for (let n = 1; n <= 21; n++) m[n] = { ...m[n], markers: [...(m[n].markers ?? []), ...treeSeedMarkers(n)] };
          return m;
        });
        if (d.rounds) setRounds(d.rounds);
        if (!d.mapV4) setHolesMeta((prev) => {
          const m = { ...prev };
          for (let n = 1; n <= 21; n++) if (m[n]?.scale) m[n] = { ...m[n], scale: m[n].scale / 1.936 };
          return m;
        });
        if (d.activeRound) setActiveRound(d.activeRound);
        // mapV5: maps.js swapped from the 219x270 originals to 250x304
        // median-stacked captures; migrate stored fractional positions with
        // the per-hole registration transforms (fNew = fOld*a + b)
        if (!d.mapV5) setHolesMeta((prev) => {
          const m = { ...prev };
          for (let n = 1; n <= 21; n++) {
            const t = MAP_XFORM_V5[n];
            if (!t || !m[n]) continue;
            const tx = (p) => ({ ...p, x: p.x * t.ax + t.bx, y: p.y * t.ay + t.by });
            m[n] = { ...m[n],
              markers: (m[n].markers ?? []).map(tx),
              pins: (m[n].pins ?? []).map(tx),
              green: m[n].green?.box ? { ...m[n].green, box: {
                x0: m[n].green.box.x0 * t.ax + t.bx, x1: m[n].green.box.x1 * t.ax + t.bx,
                y0: m[n].green.box.y0 * t.ay + t.by, y1: m[n].green.box.y1 * t.ay + t.by } } : m[n].green,
              // old scale was yd per 219-px-map pixel; convert to the new px space
              scale: m[n].scale != null ? m[n].scale * 219 / (250 * t.ax) : null,
            };
          }
          return m;
        });
      }
      // derived.json: capture-pipeline output shipped with the deploy
      // (scales, green boxes, slope grids, pins). First time it applies
      // wholesale (derivedV1); afterwards it only fills empty slots and
      // appends unseen pins, so newer manual edits survive.
      try {
        const res = await fetch("/derived.json");
        if (res.ok) {
          const der = await res.json();
          const fresh = !d?.derivedV1;
          setHolesMeta((prev) => {
            const m = { ...prev };
            for (const [nStr, dh] of Object.entries(der.holes ?? {})) {
              const n = +nStr;
              if (!m[n]) continue;
              const cur = { ...m[n], green: { ...(m[n].green ?? emptyGreen()) } };
              if (dh.scale != null && (fresh || cur.scale == null)) cur.scale = dh.scale;
              if (dh.greenBox && (fresh || !cur.green.box)) cur.green.box = dh.greenBox;
              const gridEmpty = !(cur.green.grid ?? []).some((r) => r.some(([x, y]) => x || y));
              if (dh.grid && (fresh || gridEmpty)) cur.green.grid = dh.grid;
              const pins = [...(cur.pins ?? [])];
              for (const p of dh.pins ?? []) {
                if (!pins.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.02))
                  pins.push({ id: `d${n}-${pins.length}`, x: p.x, y: p.y });
              }
              cur.pins = pins;
              if (!cur.curPin && pins.length) cur.curPin = pins[pins.length - 1].id;
              m[n] = cur;
            }
            return m;
          });
        }
      } catch {}
    })();
  }, []);

  const persist = async (patch = {}) => {
    const data = { clubs, shots, holesMeta, rounds, activeRound, parFixV3: true, mapV4: true, treesV9: true, mapV5: true, derivedV1: true, ...patch };
    try {
      await window.storage.set(STORE_KEY, JSON.stringify(data));
      setSaveState("saved"); setTimeout(() => setSaveState(""), 1500);
    } catch { setSaveState("save failed — kept for this session"); setTimeout(() => setSaveState(""), 2500); }
  };


  /* ---- map geometry ---- */
  const MAP_W = 250, MAP_H = 304; // source px of the hole map images (mapV5 stacked captures)
  const geo = useMemo(() => {
    if (!line.ball || !line.target) return null;
    const dx = (line.target.x - line.ball.x) * MAP_W;
    const dy = (line.target.y - line.ball.y) * MAP_H;
    const srcPx = Math.hypot(dx, dy);
    const bearing = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = up/N
    return { srcPx, bearing: ((bearing % 360) + 360) % 360 };
  }, [line]);

  const scale = holesMeta[hole]?.scale ?? null;

  // auto-fill distance whenever a calibrated line is drawn
  useEffect(() => {
    if (geo && scale) {
      const yd = Math.round(geo.srcPx * scale);
      setDist(lie !== "green" && maxReachRef.current ? Math.min(yd, Math.floor(maxReachRef.current.yd)) : yd);
    }
  }, [geo, scale, lie]);

  useEffect(() => { setLine({ ball: null, target: null }); setMarkerMode(false); setPutt({ ball: null, cup: null }); }, [hole]);
  useEffect(() => {
    if (lie !== "green" || putt.cup) return;
    const meta = holesMeta[hole];
    const pin = (meta?.pins ?? []).find((p) => p.id === meta?.curPin);
    const box = meta?.green?.box;
    if (!pin || !box) return;
    const gx = (pin.x - box.x0) / (box.x1 - box.x0), gy = (pin.y - box.y0) / (box.y1 - box.y0);
    if (gx >= 0 && gx <= 1 && gy >= 0 && gy <= 1) setPutt((p) => (p.cup ? p : { ...p, cup: { x: gx, y: gy } }));
  }, [lie, hole, holesMeta, putt.cup]);

  const relWindDeg = windMode === "map" && geo ? ((windDeg - geo.bearing) % 360 + 360) % 360 : windDeg;

  const activeWindRules = useMemo(
    () => (lie === "green" ? [] : matchWindRules(hole, stroke, windSpeed, relWindDeg)),
    [hole, stroke, windSpeed, relWindDeg, lie]
  );
  const blockedRules = useMemo(() => Object.values(holesMeta).flatMap((m) => m.blocked ?? []), [holesMeta]);
  const maxReachRef = useRef(null);
  const { recs, maxReach } = useMemo(
    () => solve(clubs, { dist, windSpeed, relWindDeg, lie, hole, stroke }, blockedRules),
    [clubs, dist, windSpeed, relWindDeg, lie, hole, stroke, blockedRules]
  );
  useEffect(() => { maxReachRef.current = maxReach; if (lie !== "green" && maxReach && dist > Math.floor(maxReach.yd)) setDist(Math.floor(maxReach.yd)); }, [maxReach, dist, lie]);

  // aim preview on map: rotate best rec's aim offset around the ball
  const bestRec = recs.find((r) => !r.blocked) ?? recs[0] ?? null;
  const aimPreview = useMemo(() => {
    if (!geo || !scale || !bestRec || !line.ball || !line.target) return null;
    const th = (geo.bearing * Math.PI) / 180;
    const offPx = bestRec.aim / scale; // yd → src px, + = right of line
    const ox = Math.cos(th) * offPx, oy = Math.sin(th) * offPx;
    return { x: line.target.x + ox / MAP_W, y: line.target.y + oy / MAP_H };
  }, [geo, scale, bestRec, line]);

  const greenNow = holesMeta[hole]?.green;
  const greenYd = useMemo(() => {
    if (!greenNow?.box) return null;
    const { x0, y0, x1, y1 } = greenNow.box;
    if (scale) return { W: (x1 - x0) * MAP_W * scale, H: (y1 - y0) * MAP_H * scale, assumed: false };
    const W = 18; return { W, H: W * ((y1 - y0) * MAP_H) / ((x1 - x0) * MAP_W), assumed: true };
  }, [greenNow, scale]);
  const puttSol = useMemo(() => {
    if (lie !== "green" || !greenNow?.box || !putt.ball || !putt.cup || !greenYd) return null;
    const s = solvePutt(greenNow.grid, greenYd.W, greenYd.H, putt.ball, putt.cup);
    const D = s.r.D;
    const lateral = D * Math.sin((s.a * Math.PI) / 180);
    const base = Math.atan2((putt.cup.x - putt.ball.x) * greenYd.W, -((putt.cup.y - putt.ball.y) * greenYd.H));
    const th = base + (s.a * Math.PI) / 180;
    const aimPt = { x: putt.ball.x + (Math.sin(th) * D) / greenYd.W, y: putt.ball.y - (Math.cos(th) * D) / greenYd.H };
    return { ...s, D, lateral, aimPt };
  }, [lie, greenNow, putt, greenYd]);
  const setScaleFromInput = () => {
    const yd = parseFloat(calInput);
    if (!geo || !yd || yd <= 0) return;
    const next = { ...holesMeta, [hole]: { ...holesMeta[hole], scale: yd / geo.srcPx } };
    setHolesMeta(next); setCalInput(""); persist({ holesMeta: next });
  };

  /* ---- shared actions (shots, blocked, rounds) ---- */
  const addShot = () => {
    const rad = (form.windDeg * Math.PI) / 180;
    const sp = parseFloat(form.windSpeed) || 0;
    const s = {
      id: Date.now(), club: form.club, power: parseFloat(form.power) || 0, lie: form.lie,
      wAlong: sp * Math.cos(rad), wCross: sp * Math.sin(rad),
      carry: parseFloat(form.carry) || 0, lateral: form.lateral === "" ? null : (parseFloat(form.lateral) || 0),
      hole: Number(form.hole) || 0, stroke: Number(form.stroke) || 1,
      raw: { speed: sp, deg: form.windDeg },
    };
    // gauge is 4 bars max and observed wind tops out at 31 mph — refuse
    // impossible rows instead of silently fitting the model to typos
    if (s.power <= 0 || s.power > 4 || s.carry <= 0 || sp < 0 || sp > 31) return;
    const nextShots = [s, ...shots];
    const nextClubs = clubs.map((c) => fitClub(c, nextShots));
    setShots(nextShots); setClubs(nextClubs);
    setForm({ ...form, carry: "", lateral: "" });
    persist({ shots: nextShots, clubs: nextClubs });
  };
  const removeShot = (id) => {
    const nextShots = shots.filter((s) => s.id !== id);
    const nextClubs = clubs.map((c) => {
      const refit = fitClub(c, nextShots);
      if (refit.shots === 0) { const def = DEFAULT_CLUBS.find((x) => x.id === c.id); return def ? { ...def } : refit; }
      return refit;
    });
    setShots(nextShots); setClubs(nextClubs);
    persist({ shots: nextShots, clubs: nextClubs });
  };
  const markBlocked = (rec) => {
    if (!hole) return;
    const rule = { id: Date.now(), hole, stroke, club: rec.club.id, aim: Math.round(rec.aim), note: "trees / obstruction on this line" };
    const next = { ...holesMeta, [hole]: { ...holesMeta[hole], blocked: [...holesMeta[hole].blocked, rule] } };
    setHolesMeta(next); persist({ holesMeta: next });
  };
  const unblock = (h, id) => {
    const next = { ...holesMeta, [h]: { ...holesMeta[h], blocked: holesMeta[h].blocked.filter((b) => b.id !== id) } };
    setHolesMeta(next); persist({ holesMeta: next });
  };
  const setPar = (h) => {
    const cur = holesMeta[h].par, nxt = cur === 3 ? 4 : cur === 4 ? 5 : 3;
    const next = { ...holesMeta, [h]: { ...holesMeta[h], par: nxt } };
    setHolesMeta(next); persist({ holesMeta: next });
  };
  const setNote = (h, note) => {
    const next = { ...holesMeta, [h]: { ...holesMeta[h], note } };
    setHolesMeta(next); persist({ holesMeta: next });
  };
  const setPins = (h, pins) => {
    const cur = holesMeta[h].curPin;
    const next = { ...holesMeta, [h]: { ...holesMeta[h], pins, curPin: pins.some((p) => p.id === cur) ? cur : (pins[0]?.id ?? null) } };
    setHolesMeta(next); persist({ holesMeta: next });
  };
  const setCurPin = (h, id) => {
    const next = { ...holesMeta, [h]: { ...holesMeta[h], curPin: id } };
    setHolesMeta(next); persist({ holesMeta: next });
  };
  const setGreen = (h, green) => {
    const next = { ...holesMeta, [h]: { ...holesMeta[h], green } };
    setHolesMeta(next); persist({ holesMeta: next });
  };
  const handleCorner = (h, fx, fy) => {
    if (!cornerTmp) { setCornerTmp({ x: fx, y: fy }); return; }
    const box = { x0: Math.min(cornerTmp.x, fx), y0: Math.min(cornerTmp.y, fy), x1: Math.max(cornerTmp.x, fx), y1: Math.max(cornerTmp.y, fy) };
    setGreen(h, { ...(holesMeta[h].green ?? emptyGreen()), box });
    setCornerTmp(null); setCornerMode(false); setGreenPaint(true);
  };
  const setMarkers = (h, markers) => {
    const next = { ...holesMeta, [h]: { ...holesMeta[h], markers } };
    setHolesMeta(next); persist({ holesMeta: next });
  };
  const startRound = () => {
    const r = { id: Date.now(), date: new Date().toISOString().slice(0, 10), scores: {} };
    setActiveRound(r); persist({ activeRound: r });
  };
  const bumpScore = (h, delta) => {
    if (!activeRound) return;
    const val = Math.max(0, (activeRound.scores[h] ?? 0) + delta);
    const scores = { ...activeRound.scores };
    if (val === 0) delete scores[h]; else scores[h] = val;
    const r = { ...activeRound, scores };
    setActiveRound(r); persist({ activeRound: r });
  };
  const finishRound = () => {
    if (!activeRound || Object.keys(activeRound.scores).length === 0) { setActiveRound(null); persist({ activeRound: null }); return; }
    const nextRounds = [activeRound, ...rounds];
    setRounds(nextRounds); setActiveRound(null);
    persist({ rounds: nextRounds, activeRound: null });
  };
  const deleteRound = (id) => {
    const nextRounds = rounds.filter((r) => r.id !== id);
    setRounds(nextRounds); persist({ rounds: nextRounds });
  };

  const holeStats = useMemo(() => {
    const st = {};
    for (let n = 1; n <= 21; n++) {
      const played = rounds.filter((r) => r.scores[n]).map((r) => r.scores[n]);
      st[n] = {
        times: played.length,
        avg: played.length ? played.reduce((a, b) => a + b, 0) / played.length : null,
        best: played.length ? Math.min(...played) : null,
        shots: shots.filter((s) => s.hole === n).length,
      };
    }
    return st;
  }, [rounds, shots]);

  const roundTotal = (r) => {
    const hs = Object.keys(r.scores).map(Number);
    const strokesN = hs.reduce((a, h) => a + r.scores[h], 0);
    const par = hs.reduce((a, h) => a + holesMeta[h].par, 0);
    return { holes: hs.length, strokes: strokesN, vs: strokesN - par };
  };

  const inputCls = "w-full rounded-xl border-2 px-3 py-2 text-sm font-semibold outline-none focus:border-green-700";
  const inputStyle = { borderColor: T.line, color: T.ink, background: "#fff" };
  const chip = (active) => active
    ? { background: T.turf, color: "#fff", borderColor: T.turf }
    : { borderColor: T.line, color: T.ink, background: "#fff" };

  /* ================= render ================= */
  return (
    <div className="min-h-screen" style={{ background: T.cream, color: T.ink, fontFamily: "'Trebuchet MS','Segoe UI',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .disp { font-family:'Fredoka','Trebuchet MS',sans-serif; }
        .mono { font-family:'IBM Plex Mono',monospace; }
      `}</style>

      <header className="px-5 pt-6 pb-4" style={{ background: `linear-gradient(135deg, ${T.turfDeep}, ${T.turf})` }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="disp text-2xl font-bold text-white tracking-tight">Caddie<span style={{ color: T.sand }}>·</span>Switch</div>
            <div className="text-xs text-white/80 mt-0.5">{shots.length} shots · {rounds.length} rounds</div>
          </div>
          <div className="flex gap-1 rounded-full p-1 flex-wrap" style={{ background: "rgba(0,0,0,0.25)" }}>
            {["solver", "holes", "rounds", "log", "clubs", "guide"].map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className="disp px-3.5 py-1.5 rounded-full text-sm font-semibold capitalize"
                style={tab === t ? { background: T.cream, color: T.turfDeep } : { color: "#fff" }}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-6">
        {saveState && <div className="mb-3 text-xs font-semibold" style={{ color: T.turfDeep }}>{saveState}</div>}

        {/* ================= SOLVER ================= */}
        {tab === "solver" && (
          <div className="grid md:grid-cols-2 gap-6">
            <section className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="disp text-sm font-semibold">Hole</label>
                  <select className={inputCls} style={inputStyle} value={hole} onChange={(e) => setHole(Number(e.target.value))}>
                    {COURSES.map((c) => c.holes.map((n) => (
                      <option key={n} value={n}>Hole {n} · {c.name} · Par {holesMeta[n].par}</option>
                    )))}
                  </select>
                </div>
                <div className="w-24">
                  <label className="disp text-sm font-semibold">Stroke</label>
                  <select className={inputCls} style={inputStyle} value={stroke} onChange={(e) => setStroke(Number(e.target.value))}>
                    {[1, 2, 3, 4].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="self-end">
                  <button onClick={() => { setTab("holes"); setOpenHole(null); setLine({ ball: null, target: null }); }}
                    className="disp text-xs font-bold px-3 py-2.5 rounded-xl text-white whitespace-nowrap" style={{ background: T.turf }}>
                    ✓ Hole complete
                  </button>
                </div>
              </div>

              {/* --- the map --- */}
              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-3">
                  <HoleMap holeNum={hole} line={line} onLine={setLine}
                    markers={holesMeta[hole].markers} onMarkers={(m) => setMarkers(hole, m)}
                    markerMode={false} aimPreview={aimPreview}
                    greenBox={holesMeta[hole].green?.box ?? null}
                    pins={holesMeta[hole].pins} curPinId={holesMeta[hole].curPin}
                    pinMode={false} onPins={(p) => setPins(hole, p)}
                    distLabel={geo ? (scale ? `${Math.round(geo.srcPx * scale)} yd` : "? yd") : null} />
                </div>
                <div className="col-span-2 space-y-2 text-xs">
                  <div className="rounded-xl border-2 p-2" style={{ borderColor: T.line, background: "#fff" }}>
                    {!line.ball && <span className="font-semibold">Tap the map where your <b>ball</b> is.</span>}
                    {line.ball && !line.target && <span className="font-semibold">Now tap your <b>target</b> landing spot.</span>}
                    {geo && (
                      <div className="space-y-1">
                        <div className="mono font-bold text-sm">
                          {scale ? `${Math.round(geo.srcPx * scale)} yd` : `${geo.srcPx.toFixed(0)} map-px`}
                        </div>
                        <div className="opacity-70">bearing {geo.bearing.toFixed(0)}° from N</div>
                        {!scale && (
                          <div className="pt-1 font-semibold">Not calibrated yet — type the in-game distance for this line into the Distance field below. That one entry calibrates the whole hole.</div>
                        )}
                        {scale && <div className="opacity-60">auto-filled into solver ↓</div>}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border-2 p-2" style={{ borderColor: T.line, background: "#fff" }}>
                    <div className="disp text-[11px] font-bold mb-1">Today's pin</div>
                    <div className="flex flex-wrap gap-1">
                      {holesMeta[hole].pins.map((p, i) => (
                        <button key={p.id} onClick={() => setCurPin(hole, p.id)}
                          className="w-7 h-7 rounded-full border-2 text-[11px] font-bold"
                          style={chip(holesMeta[hole].curPin === p.id)}>{i + 1}</button>
                      ))}
                      {holesMeta[hole].pins.length === 0 && <span className="text-[10px] opacity-60 self-center">none yet — add via ⚙ on the Holes tab</span>}
                    </div>
                    {holesMeta[hole].curPin != null && line.ball && (
                      <button onClick={() => {
                          const p = holesMeta[hole].pins.find((x) => x.id === holesMeta[hole].curPin);
                          if (p) setLine({ ...line, target: { x: p.x, y: p.y } });
                        }}
                        className="disp w-full mt-1.5 py-1 rounded-lg text-[11px] font-bold text-white" style={{ background: T.turf }}>
                        🎯 Target = pin
                      </button>
                    )}
                  </div>
                  <button onClick={() => setLine({ ball: null, target: null })} className="w-full py-1.5 rounded-xl border-2 font-bold" style={chip(false)}>
                    Clear line
                  </button>
                  {scale && <button onClick={() => { const next = { ...holesMeta, [hole]: { ...holesMeta[hole], scale: null } }; setHolesMeta(next); persist({ holesMeta: next }); }}
                    className="w-full py-1 rounded-xl text-[10px] opacity-60 underline">recalibrate scale</button>}
                </div>
              </div>
              <div className="rounded-xl border-2 px-3 py-2 text-xs" style={{ borderColor: T.sand, background: "#FFFDF4" }}>
                <span className="disp font-bold">Hole {hole} · Par {holesMeta[hole].par}: </span>{holesMeta[hole].note}
              </div>
              {activeWindRules.map((r, i) => (
                <div key={i} className="rounded-xl border-2 px-3 py-2 text-xs font-semibold"
                  style={r.kind === "block" ? { borderColor: T.flag, background: "#FFF3F3", color: "#8C1C1C" }
                       : r.kind === "open" ? { borderColor: T.turf, background: "#F1FAF3", color: T.turfDeep }
                       : { borderColor: T.sand, background: "#FFFBEE", color: "#6B5416" }}>
                  {r.kind === "block" ? "⛔ " : r.kind === "open" ? "🟢 " : "⚠️ "}{r.text}
                </div>
              ))}

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="disp text-sm font-semibold">Distance to target (yd) <span className="opacity-50 font-normal">— where the ball should stop</span></label>
                  <input type="number" className={inputCls} style={inputStyle} value={dist}
                    onChange={(e) => {
                      let v = parseFloat(e.target.value) || 0;
                      if (geo && !scale && v > 0) {
                        const next = { ...holesMeta, [hole]: { ...holesMeta[hole], scale: v / geo.srcPx } };
                        setHolesMeta(next); persist({ holesMeta: next });
                      }
                      if (lie !== "green" && maxReach) v = Math.min(v, Math.floor(maxReach.yd));
                      setDist(v);
                    }} />
                  {lie !== "green" && (
                    <div className="text-[11px] mt-1 font-semibold" style={{ minHeight: "2.1em", color: maxReach && dist >= Math.floor(maxReach.yd) ? "#8a6d1a" : undefined, opacity: maxReach && dist >= Math.floor(maxReach.yd) ? 1 : 0.55 }}>
                      {maxReach ? <>max reachable in this wind/lie: {Math.floor(maxReach.yd)} yd ({maxReach.club}){dist >= Math.floor(maxReach.yd) ? " — field capped; past this is a layup + extra shot" : ""}</> : "—"}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <label className="disp text-sm font-semibold">Lie</label>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {[...Object.keys(LIES), "green"].map((l) => (
                      <button key={l} onClick={() => setLie(l)} className="px-2.5 py-1.5 rounded-full text-[11px] font-bold capitalize border-2" style={chip(lie === l)}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>

              {lie === "green" && (
                <div className="rounded-xl border-2 p-3 space-y-2" style={{ borderColor: T.turf, background: "#fff" }}>
                  <div className="disp text-sm font-bold">Putting — Hole {hole} green</div>
                  {!greenNow?.box && <div className="text-xs">No green captured yet for this hole. Open <b>Holes → Hole {hole} → Set green corners</b>, then copy the in-game B-button grid.</div>}
                  {greenNow?.box && (
                    <>
                      <GreenCanvas mapSrc={HOLE_MAPS[hole]} green={greenNow} mode="putt"
                        ball={putt.ball} cup={putt.cup} path={puttSol?.r.path} aimPt={puttSol?.aimPt}
                        onTap={(x, y) => {
                          if (!putt.ball || (putt.ball && putt.cup)) setPutt({ ball: { x, y }, cup: null });
                          else setPutt({ ...putt, cup: { x, y } });
                        }} />
                      <div className="text-xs opacity-70">
                        {!putt.ball ? "Tap your ball position on the green." : !putt.cup ? "Now tap the cup." : greenYd?.assumed ? "Note: hole not distance-calibrated — assuming an 18 yd green width." : null}
                      </div>
                    </>
                  )}
                </div>
              )}
              {lie !== "green" && <div>
                <div className="flex items-center justify-between">
                  <label className="disp text-sm font-semibold">Wind</label>
                  <div className="flex gap-1 text-[10px]">
                    <button onClick={() => setWindMode("map")} className="px-2 py-0.5 rounded-full border-2 font-bold" style={chip(windMode === "map")}>as on minimap (N-up)</button>
                    <button onClick={() => setWindMode("shot")} className="px-2 py-0.5 rounded-full border-2 font-bold" style={chip(windMode === "shot")}>relative to shot</button>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-1">
                  <WindDial deg={windDeg} setDeg={setWindDeg} speed={windSpeed}
                    topLabel={windMode === "map" ? "N" : "PIN"} bottomLabel={windMode === "map" ? "S" : "YOU"}
                    snap={windMode === "map" ? 45 : 5} />
                  <div className="flex-1">
                    <input type="number" min="0" max="31" step="1" className={inputCls} style={inputStyle} value={windSpeed}
                      onChange={(e) => setWindSpeed(Math.max(0, Math.min(31, Math.round(parseFloat(e.target.value) || 0))))} />
                    <div className="text-xs mt-1 opacity-70">
                      {windMode === "map"
                        ? geo ? `Copy the minimap arrow. Relative to your line: ${relWindDeg.toFixed(0)}°` : "Copy the minimap arrow (draw a line to convert)."
                        : "Arrow = where the wind blows, up = tailwind."}
                    </div>
                  </div>
                </div>
              </div>}
            </section>

            <section>
              {lie === "green" && (
                <div className="mb-4">
                  <h2 className="disp text-lg font-bold mb-2">Putt read</h2>
                  {!puttSol && <div className="rounded-2xl border-2 p-4 text-sm" style={{ borderColor: T.line, background: "#fff" }}>Place ball and cup on the green to get a read.</div>}
                  {puttSol && (
                    <div className="rounded-2xl border-2 p-4" style={{ borderColor: puttSol.r.holed ? T.turf : T.sand, background: "#fff" }}>
                      <div className="disp text-base font-bold">{puttSol.r.holed ? "Makeable line found" : "Best lag line"}</div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="mono text-xl font-semibold">{Math.abs(puttSol.lateral) < 0.15 ? "0" : puttSol.lateral < 0 ? `${(-puttSol.lateral).toFixed(1)}L` : `${puttSol.lateral.toFixed(1)}R`}</div>
                          <div className="text-[10px] uppercase tracking-wide opacity-60">yd aim off cup</div>
                        </div>
                        <div>
                          <div className="mono text-xl font-semibold">{Math.round(puttSol.p * 100)}%</div>
                          <div className="text-[10px] uppercase tracking-wide opacity-60">of flat-putt power</div>
                        </div>
                        <div>
                          <div className="mono text-xl font-semibold">{puttSol.D.toFixed(1)}</div>
                          <div className="text-[10px] uppercase tracking-wide opacity-60">yd to cup</div>
                        </div>
                      </div>
                      <div className="text-[11px] opacity-60 mt-2">
                        Aim at the gold ✛ on the green view — the dashed line is the simulated roll. {!puttSol.r.holed && `Stops ${puttSol.r.best.toFixed(1)} yd from the cup at best.`} Power is relative to a flat putt of the same length.
                      </div>
                    </div>
                  )}
                </div>
              )}
              {lie !== "green" && <>
              <h2 className="disp text-lg font-bold mb-2">Recommended shots</h2>
              {recs.length === 0 && (
                <div className="rounded-2xl border-2 p-4 text-sm" style={{ borderColor: T.line, background: "#fff" }}>
                  No club reaches that distance from this lie{maxReach ? ` — max ≈ ${Math.round(maxReach.yd)} yd (${maxReach.club}${lie === "bunker" ? ", capped bar" : ""})` : ""}. Shorten the target and plan the extra shot.
                </div>
              )}
              <div className="space-y-3">
                {recs.map((r, i) => {
                  const isBest = i === 0 && !r.blocked;
                  return (
                    <div key={r.club.id} className="rounded-2xl border-2 p-4 relative overflow-hidden"
                      style={{ borderColor: r.blocked ? T.flag : isBest ? T.turf : T.line, background: r.blocked ? "#FFF6F6" : "#fff" }}>
                      {isBest && <div className="absolute top-0 right-0 disp text-[10px] font-bold px-2 py-1 rounded-bl-xl text-white" style={{ background: T.turf }}>BEST</div>}
                      {r.blocked && <div className="absolute top-0 right-0 disp text-[10px] font-bold px-2 py-1 rounded-bl-xl text-white" style={{ background: T.flag }}>🌲 BLOCKED</div>}
                      <div className="disp text-base font-bold">{r.club.name}</div>
                      {r.blocked && <div className="text-[11px] font-semibold mt-0.5" style={{ color: T.flag }}>Marked on stroke {r.blocked.stroke}: {r.blocked.note}</div>}
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="mono text-xl font-semibold">{fmtPow(r.power)}</div>
                          <div className="text-[10px] uppercase tracking-wide opacity-60">gauge power</div>
                        </div>
                        <div>
                          <div className="mono text-xl font-semibold">{!isFinite(r.aim) ? "—" : Math.abs(r.aim) < 0.5 ? "0" : `${Math.abs(r.aim).toFixed(0)} ${r.aim < 0 ? "L" : "R"}`}</div>
                          <div className="text-[10px] uppercase tracking-wide opacity-60">{Math.abs(r.aim) < 0.5 ? "aim straight at target" : `yd ${r.aim < 0 ? "left" : "right"} of target`}</div>
                        </div>
                        <div>
                          <div className="mono text-xl font-semibold">{Math.round(r.frac * 100)}%</div>
                          <div className="text-[10px] uppercase tracking-wide opacity-60">{r.cap < r.club.maxPower ? `of ${r.cap}-bar cap` : "of full swing"}</div>
                        </div>
                      </div>
                      <div className="mt-3 h-3 rounded-full relative" style={{ background: T.sky }}>
                        <div className="h-3 rounded-full" style={{ width: `${Math.min(100, r.frac * 100)}%`, background: `linear-gradient(90deg, ${T.turfLight}, ${T.turf})` }} />
                        <div className="absolute -top-1 h-5 w-0.5" style={{ left: `${Math.min(100, r.frac * 100)}%`, background: T.ink }} />
                      </div>
                      {(lie === "rough" || lie === "bunker" || !r.club.spin) && (
                        <div className="mt-2 space-y-0.5">
                          {(lie === "rough" || lie === "bunker") && <div className="text-[10px] font-semibold" style={{ color: "#8a6d1a" }}>⚠ {lie} lie: shots skew off-line more{lie === "bunker" ? ` — bar capped at ${r.cap} of ${r.club.maxPower}` : " — bar capped at ¾"}</div>}
                          {!r.club.spin && <div className="text-[10px] font-semibold" style={{ color: "#8a6d1a" }}>no backspin on {r.club.name} — plan for roll-out</div>}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="text-[11px] opacity-60">
                          {r.calibrated > 0 ? `calibrated (${r.calibrated} shots)` : "default numbers — calibrate this club"}
                        </div>
                        {!r.blocked && (
                          <button onClick={() => markBlocked(r)} className="text-[11px] font-bold px-2 py-1 rounded-lg border-2" style={{ borderColor: T.line }}>
                            🌲 Mark blocked
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] opacity-60 mt-3">
                The gold dashed line on the map previews the best shot's wind-corrected aim point. Tree pins you drop are saved to this hole forever.
              </p>
              </>}
            </section>
          </div>
        )}

        {/* ================= HOLES ================= */}
        {tab === "holes" && (
          <div className="space-y-6">
            <p className="text-xs opacity-70">Tap a hole to expand its map, notes, hazard pins, and history. Tap the par badge to correct par.</p>
            {COURSES.map((c) => (
              <section key={c.name}>
                <h2 className="disp text-lg font-bold mb-2">{c.name}</h2>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {c.holes.map((n) => {
                    const m = holesMeta[n], st = holeStats[n];
                    const open = openHole === n;
                    return (
                      <div key={n} className={`rounded-2xl border-2 p-2 ${open ? "col-span-3 sm:col-span-5" : ""}`} style={{ borderColor: open ? T.turf : T.line, background: "#fff" }}>
                        <div className="cursor-pointer" onClick={() => { setHole(n); setStroke(1); setTab("solver"); }}>
                          {!open && <img src={HOLE_MAPS[n]} alt={`Hole ${n}`} className="w-full rounded-lg" draggable={false} />}
                          <div className="flex items-center justify-between mt-1">
                            <div className="disp font-bold text-sm">H{n}</div>
                            <div className="flex items-center gap-1">
                              {(m.pins?.length ?? 0) > 0 && <span className="mono text-[10px] font-bold" style={{ color: T.turf }} title="pin locations cataloged">📍{m.pins.length}</span>}
                              {m.blocked.length > 0 && <span className="text-[10px] font-bold" style={{ color: T.flag }}>🌲{m.blocked.length}</span>}
                              <button onClick={(e) => { e.stopPropagation(); setOpenHole(open ? null : n); setHoleMarkerEdit(false); setPinEdit(false); }}
                                className="disp text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2" style={chip(open)} title="setup & history">⚙</button>
                              <button onClick={(e) => { e.stopPropagation(); setPar(n); }}
                                className="disp text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: T.turf }}>
                                P{m.par}
                              </button>
                            </div>
                          </div>
                          {!open && st.times > 0 && <div className="mono text-[10px] opacity-70">avg {st.avg.toFixed(1)} · best {st.best}</div>}
                        </div>
                        {open && (
                          <div className="grid md:grid-cols-2 gap-4 mt-2">
                            <div>
                              <HoleMap holeNum={n} line={{ ball: null, target: null }} onLine={() => {}}
                                markers={m.markers} onMarkers={(mk) => setMarkers(n, mk)}
                                markerMode={holeMarkerEdit} aimPreview={null}
                                cornerMode={cornerMode} onCorner={(fx, fy) => handleCorner(n, fx, fy)}
                                greenBox={m.green?.box ?? null}
                                pins={m.pins} curPinId={m.curPin}
                                pinMode={pinEdit} onPins={(p) => setPins(n, p)} />
                              <button onClick={() => { setHoleMarkerEdit(!holeMarkerEdit); setPinEdit(false); }} className="w-full mt-2 py-1.5 rounded-xl border-2 text-xs font-bold" style={chip(holeMarkerEdit)}>
                                🌲 {holeMarkerEdit ? "Tap map to add/remove hazards" : "Edit hazard pins"}
                              </button>
                              <button onClick={() => { setPinEdit(!pinEdit); setHoleMarkerEdit(false); }} className="w-full mt-2 py-1.5 rounded-xl border-2 text-xs font-bold" style={chip(pinEdit)}>
                                📍 {pinEdit ? "Tap map to add/remove pin spots" : "Edit pin locations"}
                              </button>
                              <button onClick={() => { setCornerMode(!cornerMode); setCornerTmp(null); setHoleMarkerEdit(false); }} className="w-full mt-2 py-1.5 rounded-xl border-2 text-xs font-bold" style={chip(cornerMode)}>
                                ⛳ {cornerMode ? (cornerTmp ? "Tap opposite corner of green" : "Tap first corner of green") : m.green?.box ? "Redefine green area" : "Set green corners"}
                              </button>
                              {m.green?.box && (
                                <div className="mt-2 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="disp text-xs font-bold">Green slopes</div>
                                    <div className="flex gap-1">
                                      <button onClick={() => setGreenPaint(!greenPaint)} className="text-[10px] font-bold px-2 py-0.5 rounded-full border-2" style={chip(greenPaint)}>{greenPaint ? "painting" : "paint"}</button>
                                      <button onClick={() => setGreen(n, { ...m.green, grid: emptyGreen().grid })} className="text-[10px] font-bold px-2 py-0.5 rounded-full border-2" style={chip(false)}>clear</button>
                                    </div>
                                  </div>
                                  <GreenCanvas mapSrc={HOLE_MAPS[n]} green={m.green} mode={greenPaint ? "paint" : "view"}
                                    onGrid={(grid) => setGreen(n, { ...m.green, grid })} />
                                  <div className="text-[10px] opacity-60">Open the in-game elevation grid (B on the green) and copy it: drag in a cell in the downhill direction — short drag = gentle, long drag = steep. Tap a cell to clear it.</div>
                                </div>
                              )}
                            </div>
                            <div className="space-y-3">
                              <div className="mono text-[11px] opacity-70">
                                {st.times > 0 ? <>avg {st.avg.toFixed(2)} · best {st.best} ({scoreName(st.best - m.par)}) · played {st.times}×</> : "no rounds yet"}
                                {st.shots > 0 && <> · {st.shots} shots logged</>}
                                {m.scale && <> · map calibrated</>}
                              </div>
                              <textarea className="w-full rounded-xl border-2 p-2 text-xs" style={{ borderColor: T.line }} rows={4}
                                defaultValue={m.note} onBlur={(e) => setNote(n, e.target.value)} />
                              <div>
                                <div className="disp text-xs font-bold mb-1">Blocked lines</div>
                                {m.blocked.length === 0 && <div className="text-[11px] opacity-60">None — mark them from the Solver.</div>}
                                {m.blocked.map((b) => (
                                  <div key={b.id} className="flex items-center justify-between text-[11px] rounded-lg border px-2 py-1 mb-1" style={{ borderColor: T.line }}>
                                    <span>S{b.stroke} · {clubs.find((cl) => cl.id === b.club)?.name ?? b.club} · aim {b.aim >= 0 ? "+" : ""}{b.aim} yd</span>
                                    <button onClick={() => unblock(n, b.id)} className="font-bold px-1" style={{ color: T.flag }}>✕</button>
                                  </div>
                                ))}
                              </div>
                              {WIND_RULES[n] && (
                                <div>
                                  <div className="disp text-xs font-bold mb-1">Wind rules (community)</div>
                                  {WIND_RULES[n].map((r, i) => (
                                    <div key={i} className="text-[11px] rounded-lg border px-2 py-1 mb-1" style={{ borderColor: T.line }}>
                                      <b>{r.dir === "any" ? "always" : `${r.dir}${r.min ? ` ≥${r.min}` : ""}${r.max != null ? ` ≤${r.max}` : ""} mph`}</b> — {r.text}
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div>
                                <div className="disp text-xs font-bold mb-1">Rounds here</div>
                                <div className="flex flex-wrap gap-1">
                                  {rounds.filter((r) => r.scores[n]).map((r) => (
                                    <span key={r.id} className="mono text-[11px] px-2 py-0.5 rounded-full" style={{ background: T.sky }}>
                                      {r.date}: {r.scores[n]} ({fmtVs(r.scores[n] - m.par)})
                                    </span>
                                  ))}
                                  {rounds.filter((r) => r.scores[n]).length === 0 && <span className="text-[11px] opacity-60">—</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* ================= ROUNDS ================= */}
        {tab === "rounds" && (
          <div className="space-y-6">
            {!activeRound ? (
              <button onClick={startRound} className="disp w-full py-3 rounded-2xl text-white font-bold text-sm"
                style={{ background: `linear-gradient(135deg, ${T.turfDeep}, ${T.turf})` }}>
                ⛳ Start a round
              </button>
            ) : (
              <section className="rounded-2xl border-2 p-4" style={{ borderColor: T.turf, background: "#fff" }}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="disp text-lg font-bold">Round in progress — {activeRound.date}</h2>
                  <button onClick={finishRound} className="disp text-xs font-bold px-3 py-1.5 rounded-full text-white" style={{ background: T.turf }}>Finish & save</button>
                </div>
                {COURSES.map((c) => (
                  <div key={c.name} className="mb-2">
                    <div className="disp text-xs font-bold opacity-70 mb-1">{c.name}</div>
                    <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5">
                      {c.holes.map((n) => {
                        const v = activeRound.scores[n] ?? 0;
                        return (
                          <div key={n} className="rounded-xl border-2 p-1 text-center" style={{ borderColor: v ? T.turf : T.line }}>
                            <div className="text-[10px] font-bold opacity-70">H{n}·P{holesMeta[n].par}</div>
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => bumpScore(n, -1)} className="font-bold w-5 rounded" style={{ background: T.sky }}>–</button>
                              <span className="mono text-sm w-5">{v || "·"}</span>
                              <button onClick={() => bumpScore(n, 1)} className="font-bold w-5 rounded text-white" style={{ background: T.turf }}>+</button>
                            </div>
                            {v > 0 && <div className="text-[9px] font-bold" style={{ color: v - holesMeta[n].par < 0 ? T.turf : v - holesMeta[n].par > 0 ? T.flag : T.ink }}>{scoreName(v - holesMeta[n].par)}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {Object.keys(activeRound.scores).length > 0 && (() => {
                  const t = roundTotal(activeRound);
                  return <div className="mono text-sm font-bold mt-1">Running: {t.strokes} strokes over {t.holes} holes ({fmtVs(t.vs)})</div>;
                })()}
              </section>
            )}

            <section>
              <h2 className="disp text-lg font-bold mb-2">Past rounds</h2>
              {rounds.length === 0 && <div className="text-sm opacity-60">No rounds saved yet.</div>}
              <div className="space-y-2">
                {rounds.map((r) => {
                  const t = roundTotal(r);
                  return (
                    <div key={r.id} className="flex items-center justify-between rounded-xl border-2 px-3 py-2 text-sm" style={{ borderColor: T.line, background: "#fff" }}>
                      <div>
                        <span className="font-bold">{r.date}</span>
                        <span className="mono opacity-80"> · {t.holes} holes · {t.strokes} strokes · </span>
                        <span className="mono font-bold" style={{ color: t.vs < 0 ? T.turf : t.vs > 0 ? T.flag : T.ink }}>{fmtVs(t.vs)}</span>
                      </div>
                      <button onClick={() => deleteRound(r.id)} className="font-bold px-2" style={{ color: T.flag }}>✕</button>
                    </div>
                  );
                })}
              </div>
            </section>

            {rounds.length > 1 && (
              <section>
                <h2 className="disp text-lg font-bold mb-2">Hole-by-hole comparison</h2>
                <div className="overflow-x-auto rounded-2xl border-2" style={{ borderColor: T.line, background: "#fff" }}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="disp text-left" style={{ background: T.sky }}>
                        <th className="px-2 py-1.5">Hole</th><th className="px-2 py-1.5">Par</th><th className="px-2 py-1.5">Played</th>
                        <th className="px-2 py-1.5">Avg</th><th className="px-2 py-1.5">Best</th><th className="px-2 py-1.5">Avg vs par</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 21 }, (_, i) => i + 1).filter((n) => holeStats[n].times > 0).map((n) => {
                        const st = holeStats[n], vs = st.avg - holesMeta[n].par;
                        return (
                          <tr key={n} style={{ borderTop: `1px solid ${T.line}` }}>
                            <td className="px-2 py-1 font-bold">H{n} <span className="opacity-50">({holeCourse(n)})</span></td>
                            <td className="mono px-2 py-1">{holesMeta[n].par}</td>
                            <td className="mono px-2 py-1">{st.times}</td>
                            <td className="mono px-2 py-1">{st.avg.toFixed(2)}</td>
                            <td className="mono px-2 py-1">{st.best}</td>
                            <td className="mono px-2 py-1 font-bold" style={{ color: vs < 0 ? T.turf : vs > 0.3 ? T.flag : T.ink }}>{vs >= 0 ? "+" : ""}{vs.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] opacity-60 mt-2">Highest "avg vs par" = the holes costing you the most strokes.</p>
              </section>
            )}
          </div>
        )}

        {/* ================= LOG ================= */}
        {tab === "log" && (
          <div className="grid md:grid-cols-2 gap-6">
            <section className="space-y-3">
              <h2 className="disp text-lg font-bold">Log a shot</h2>
              <div className="rounded-xl border-2 p-2 text-[11px] space-y-1" style={{ borderColor: T.sand, background: "#FFFDF4" }}>
                <div className="disp font-bold text-xs">Fast logging protocol</div>
                <div>1. Aim dead at the pin (or a marker) — never pre-compensate on logged shots.</div>
                <div>2. Note distance-to-pin BEFORE, swing, note it AFTER: <b>Ended = before − after</b>. Works at ANY power as long as the shot flew straight — full bars not required.</div>
                <div>3. <b>Sideways miss</b> = how far right (+) or left (−) of your aim line the ball STOPPED. Only fill it when the minimap makes it obvious; leave blank otherwise — blanks are skipped, they never hurt the fit.</div>
                <div>4. Shots that visibly curved or mis-swung: don't log them.</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold">Hole</label>
                  <select className={inputCls} style={inputStyle} value={form.hole} onChange={(e) => setForm({ ...form, hole: Number(e.target.value) })}>
                    <option value={0}>Practice / none</option>
                    {Array.from({ length: 21 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Hole {n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold">Stroke</label>
                  <select className={inputCls} style={inputStyle} value={form.stroke} onChange={(e) => setForm({ ...form, stroke: Number(e.target.value) })}>
                    {[1, 2, 3, 4].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold">Club</label>
                  <select className={inputCls} style={inputStyle} value={form.club} onChange={(e) => setForm({ ...form, club: e.target.value })}>
                    {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold">Gauge power hit</label>
                  <input type="number" step="0.05" min="0" max="4" className={inputCls} style={inputStyle} value={form.power} onChange={(e) => setForm({ ...form, power: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold">Lie</label>
                  <select className={inputCls} style={inputStyle} value={form.lie} onChange={(e) => setForm({ ...form, lie: e.target.value })}>
                    {Object.keys(LIES).map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold">Wind (mph)</label>
                  <input type="number" min="0" max="31" className={inputCls} style={inputStyle} value={form.windSpeed} onChange={(e) => setForm({ ...form, windSpeed: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold">Ended (yd)</label>
                  <input type="number" className={inputCls} style={inputStyle} value={form.carry} onChange={(e) => setForm({ ...form, carry: e.target.value })} placeholder="where it stopped" />
                </div>
                <div>
                  <label className="text-xs font-bold">Sideways miss (yd, + = right)</label>
                  <input type="number" className={inputCls} style={inputStyle} value={form.lateral} onChange={(e) => setForm({ ...form, lateral: e.target.value })} placeholder="blank = skip" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <WindDial deg={form.windDeg} setDeg={(d) => setForm({ ...form, windDeg: d })} speed={parseFloat(form.windSpeed) || 0} size="w-28 h-28" />
                <div className="text-xs opacity-70">Wind direction relative to your aim line (up = tailwind).</div>
              </div>
              <button onClick={addShot} className="disp w-full py-3 rounded-2xl text-white font-bold text-sm"
                style={{ background: `linear-gradient(135deg, ${T.turfDeep}, ${T.turf})` }}>
                Save shot & recalibrate
              </button>
              <div className="flex gap-2">
                <button onClick={() => { setIoOpen(!ioOpen); setIoText(JSON.stringify(shots)); }} className="flex-1 py-1.5 rounded-xl border-2 text-xs font-bold" style={chip(ioOpen)}>⇅ Import / Export</button>
              </div>
              {ioOpen && (
                <div className="space-y-1">
                  <textarea className="w-full rounded-xl border-2 p-2 mono text-[10px]" style={{ borderColor: T.line }} rows={4}
                    value={ioText} onChange={(e) => setIoText(e.target.value)} />
                  <div className="flex gap-2 text-[11px]">
                    <button onClick={() => {
                        try {
                          const arr = JSON.parse(ioText);
                          if (!Array.isArray(arr)) return;
                          const conv = arr.map((r, i) => {
                            if (r.wAlong != null) return r;
                            const sp = r.windSpeed ?? 0, dg = r.windDeg ?? 0, rad = (dg * Math.PI) / 180;
                            return { id: Date.now() + i, club: r.club, power: +r.power, lie: r.lie ?? "fairway",
                              wAlong: sp * Math.cos(rad), wCross: sp * Math.sin(rad),
                              carry: +(r.ended ?? r.carry ?? 0), lateral: r.side == null && r.lateral == null ? null : +(r.side ?? r.lateral),
                              hole: r.hole ?? 0, stroke: r.stroke ?? 1, raw: { speed: sp, deg: dg } };
                          }).filter((r) => r.club && r.power > 0 && r.carry > 0);
                          const nextShots = [...conv, ...shots.filter((s) => !conv.some((c) => c.id === s.id))];
                          const nextClubs = clubs.map((c) => fitClub(c, nextShots));
                          setShots(nextShots); setClubs(nextClubs); persist({ shots: nextShots, clubs: nextClubs }); setIoOpen(false);
                        } catch {}
                      }} className="flex-1 py-1 rounded-lg border-2 font-bold" style={chip(false)}>Import (replace box first)</button>
                  </div>
                  <div className="opacity-60 text-[10px]">Copy the box to back up. To import, paste a JSON array — either exported shots, or simple rows like {"{"}"club":"driver","power":4,"lie":"tee","windSpeed":9,"windDeg":180,"ended":242,"hole":10,"stroke":1{"}"} (side optional). I can generate these from your screenshots in chat.</div>
                </div>
              )}
            </section>
            <section>
              <h2 className="disp text-lg font-bold mb-2">Shot history</h2>
              {shots.length === 0 && <div className="text-sm opacity-60">Nothing yet. First session: every club at full power in calm wind, then a few in heavy cross- and headwind.</div>}
              <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                {shots.map((s) => {
                  const cl = clubs.find((c) => c.id === s.club);
                  return (
                    <div key={s.id} className="flex items-center justify-between rounded-xl border-2 px-3 py-2 text-xs" style={{ borderColor: T.line, background: "#fff" }}>
                      <div>
                        <span className="font-bold">{cl?.name ?? s.club}</span>
                        <span className="mono"> @ {s.power.toFixed(2)}</span>
                        {s.hole > 0 && <span className="disp font-bold" style={{ color: T.turfDeep }}> · H{s.hole}/S{s.stroke}</span>}
                        <span className="opacity-60"> · {s.lie} · {s.raw?.speed ?? 0}mph/{s.raw?.deg ?? 0}°</span>
                        <div className="mono opacity-80">{s.carry} yd, {s.lateral >= 0 ? "+" : ""}{s.lateral} offline</div>
                      </div>
                      <button onClick={() => removeShot(s.id)} className="font-bold px-2" style={{ color: T.flag }}>✕</button>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* ================= GUIDE ================= */}
        {tab === "guide" && (() => {
          const steps = [
            ["Green box + slopes", (n) => !!holesMeta[n].green?.box && (holesMeta[n].green?.grid ?? []).some((r) => r.some(([x, y]) => x || y)), "AUTO (pipeline): boundary + slope grid extracted from your zoomed green captures. Manual paint in Holes → ⚙ stays available as an override."],
            ["Pins", (n) => (holesMeta[n].pins?.length ?? 0) > 0, "AUTO (pipeline): read from zoomed green captures; new pin spots get appended as later uploads show them."],
            ["Map scale", (n) => !!holesMeta[n].scale, "AUTO (pipeline): tee 'yd to go' ÷ tee→pin distance on the map. (Manual fallback: Solver → tap ball, tap target, type the in-game distance → Set.)"],
            ["Trees", (n) => true, "AUTO (pipeline): re-seeded from the upgraded maps. Spot-check in Holes → ⚙ only if a solver line looks wrong."],
            ["Log shots", (n) => holeStats[n].shots > 0, "Phase 2: two captures per shot (address + result pop-up) — the pipeline turns them into Log rows."],
            ["Play & score", (n) => holeStats[n].times > 0, "Rounds → Start a round → enter strokes as you play. Mark blocked lines from the Solver when a rec hits trees."],
          ];
          return (
            <div className="space-y-5">
              <section className="rounded-2xl border-2 p-4" style={{ borderColor: T.turf, background: "#fff" }}>
                <h2 className="disp text-lg font-bold mb-1">One-time first: calibrate your clubs</h2>
                <p className="text-xs opacity-80">Find a hole with 0–2 mph wind. Hit each club at full power (4.0) from the tee or fairway, aimed dead straight, and log every shot. Then a few full drivers into a strong headwind and a strong crosswind. ~15 shots pins the whole model.</p>
              </section>
              <section>
                <h2 className="disp text-lg font-bold mb-2">Per-hole setup, in order</h2>
                <div className="space-y-2 mb-4">
                  {steps.map(([name, _, how], i) => (
                    <div key={i} className="rounded-xl border-2 px-3 py-2 text-xs" style={{ borderColor: T.line, background: "#fff" }}>
                      <span className="disp font-bold">{i + 1}. {name}</span> — <span className="opacity-80">{how}</span>
                    </div>
                  ))}
                </div>
                <h3 className="disp text-sm font-bold mb-1">Progress (auto-tracked; Trees has no tracker)</h3>
                <div className="overflow-x-auto rounded-2xl border-2" style={{ borderColor: T.line, background: "#fff" }}>
                  <table className="w-full text-[11px]">
                    <thead><tr className="disp text-left" style={{ background: T.sky }}>
                      <th className="px-2 py-1.5">Hole</th>{steps.map(([nm], i) => <th key={i} className="px-1 py-1.5 text-center" title={nm}>{i + 1}</th>)}
                    </tr></thead>
                    <tbody>
                      {Array.from({ length: 21 }, (_, i) => i + 1).map((n) => (
                        <tr key={n} style={{ borderTop: `1px solid ${T.line}` }}>
                          <td className="px-2 py-1 font-bold">H{n}</td>
                          {steps.map(([nm, done], i) => (
                            <td key={i} className="px-1 py-1 text-center">
                              {i === 3 ? <span className="opacity-40">—</span>
                                : done(n) ? <span style={{ color: T.turf }}>●</span> : <span className="opacity-25">○</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section>
                <h2 className="disp text-lg font-bold mb-1">Shot data coverage — club × lie</h2>
                <p className="text-xs opacity-80 mb-2">
                  Auto-tracked from your logged shots. Each cell counts shots of that club from that lie;
                  green at {COVERAGE_GOAL}+. Capture protocol per shot: address frame (wind on screen), then the
                  result pop-up (gauge fill + distance). Shot Assist on = perfectly straight, maxable bars.
                  Sand caps mean driver/spoon from sand are 1-bar shots — they still count.
                </p>
                <div className="overflow-x-auto rounded-2xl border-2 mb-2" style={{ borderColor: T.line, background: "#fff" }}>
                  <table className="w-full text-[11px]">
                    <thead><tr className="disp text-left" style={{ background: T.sky }}>
                      <th className="px-2 py-1.5">Club</th>
                      {COVERAGE_LIES.map((l) => <th key={l} className="px-2 py-1.5 text-center">{l}</th>)}
                      <th className="px-2 py-1.5 text-right">Total</th>
                    </tr></thead>
                    <tbody>
                      {clubs.filter((c) => c.id !== "putter").map((c) => {
                        const counts = COVERAGE_LIES.map((l) => shots.filter((s) => s.club === c.id && s.lie === l).length);
                        return (
                          <tr key={c.id} style={{ borderTop: `1px solid ${T.line}` }}>
                            <td className="px-2 py-1 font-bold">{c.name}</td>
                            {counts.map((cnt, i) => (
                              <td key={i} className="mono px-2 py-1 text-center font-bold"
                                style={{ color: cnt >= COVERAGE_GOAL ? T.turf : cnt > 0 ? "#B8860B" : T.ink,
                                  opacity: cnt === 0 ? 0.3 : 1,
                                  background: cnt >= COVERAGE_GOAL ? "#EDF7EF" : cnt > 0 ? "#FDF6E3" : "transparent" }}>
                                {cnt}
                              </td>
                            ))}
                            <td className="mono px-2 py-1 text-right font-bold">{counts.reduce((a, b) => a + b, 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="text-[11px] opacity-70">
                  Highest-value cells first: full-power tee/fairway anchors for every club (pins the maxes),
                  then maxed rough swings (exact 3.0 bars), then the sand caps (wedge 3.0 / irons 2.0 /
                  driver-spoon 1.0). Wind variety comes free as you play — the fit separates it out.
                </div>
              </section>
              <section className="rounded-2xl border-2 p-4" style={{ borderColor: T.line, background: "#fff" }}>
                <h2 className="disp text-sm font-bold mb-1">Game rules the model encodes</h2>
                <div className="text-[11px] opacity-80 space-y-1">
                  <div>1. Lies cap the usable BAR — they don't scale distance. Below the cap every bar flies normally. Rough caps at ¾ of the bar (all clubs) and skews direction more.</div>
                  <div>2. Bunker caps: driver & spoon = 1 bar, every other club = 2 bars, putter = uncapped but the ball rolls far less in sand. So from sand, irons out-reach the driver and spoon.</div>
                  <div>3. Driver and Spoon cannot backspin; irons/wedge can (stop the swing mid-way; stronger swing = stronger spin; downhill landings can spin the ball away).</div>
                  <div>4. OB / water: +1 stroke, replay from the same spot.</div>
                  <div>5. Minimap dots = flat-terrain landing points; elevation shifts real carry (uphill shorter, downhill longer).</div>
                  <div>6. Wind arrow color: blue = weak, yellow = medium, pink = strongest (the dial here matches).</div>
                  <div>7. Trajectory: driver lowest → spoon → irons rising with number → wedge highest. Low clubs duck under branches; high clubs clear them and feel more wind.</div>
                  <div>8. Wind comes in exactly 8 directions (N/NE/E/SE/S/SW/W/NW) at integer mph, observed 0–31. The dial snaps to the 8 when set "as on minimap".</div>
                  <div>9. All distances here are STOP distances (carry + roll). The game's minimap dots show flat-ground carry; low clubs roll well past their dots, and backspin-capable clubs can stop near them.</div>
                  <div>10. You can physically swing past a capped bar — it goes red and the shot wobbles/curves unpredictably. The solver never plans on it.</div>
                  <div>11. Putter roll depends on surface: green rolls best, fairway noticeably slower, sand slowest. No source in 20 years reports any per-bar flight penalty from rough/sand — caps are the whole mechanic until your logs say otherwise.</div>
                  <div>12. Backspin strength scales with swing power ("the harder you swing, the stronger the backspin" — official). Capped lies therefore also cap max spin; that alone explains weaker spin from rough/sand.</div>
                  <div>13. Pins are a finite set of fixed spots per hole (WSR data: most holes carry two score-based sets — harder "A pins" when you're playing well, easier "B pins" when you're not; H1 has 3, H18 has 1, Specials 6 each). Cataloged pins here map onto those exact spots.</div>
                  <div>14. At 0 mph the wind still HAS a direction — read it off the flag cloth on the pin.</div>
                </div>
              </section>
            </div>
          );
        })()}

        {/* ================= CLUBS ================= */}
        {tab === "clubs" && (
          <section>
            <h2 className="disp text-lg font-bold mb-1">Club model</h2>
            <p className="text-xs opacity-70 mb-3">Fitted coefficients — edit directly if you know better values. Logging shots refits automatically.</p>
            <div className="overflow-x-auto rounded-2xl border-2" style={{ borderColor: T.line, background: "#fff" }}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="disp text-left" style={{ background: T.sky }}>
                    {["Club", "yd / power (a)", "wind % / mph (h)", "drift yd / mph·pow (c)", "traj", "spin", "shots"].map((hd) => (
                      <th key={hd} className="px-3 py-2 font-semibold">{hd}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clubs.map((c, idx) => (
                    <tr key={c.id} style={{ borderTop: `1px solid ${T.line}` }}>
                      <td className="px-3 py-2 font-bold">{c.name}</td>
                      {["a", "h", "c"].map((k) => (
                        <td key={k} className="px-2 py-1">
                          <input type="number" step={k === "h" ? 0.001 : k === "c" ? 0.01 : 0.1}
                            className="mono w-24 rounded-lg border px-2 py-1" style={{ borderColor: T.line }}
                            value={k === "h" ? Number((c[k] * 100).toFixed(2)) : c[k]}
                            onChange={(e) => {
                              let v = parseFloat(e.target.value) || 0;
                              if (k === "h") v = v / 100;
                              const next = clubs.map((x, i) => (i === idx ? { ...x, [k]: v } : x));
                              setClubs(next); persist({ clubs: next });
                            }} />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-[10px] opacity-70">{c.traj}</td>
                      <td className="px-3 py-2">{c.spin ? "✓" : "—"}</td>
                      <td className="mono px-3 py-2">{c.shots}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] opacity-60 mt-3">
              carry = a × power × (1 + h × tailwind-mph) · sidedrift = c × crosswind-mph × power. Gauge is 4 bars for every club. Lies cap the usable bar (distance per bar is unchanged below the cap) — fixed values baked in: rough = 3 bars for every club; sand = wedge 3, irons 2, spoon/driver 1; putter uncapped in sand but rolls far less. Distance fits use tee/fairway shots when available; blank sideways entries are skipped by the drift fit.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
