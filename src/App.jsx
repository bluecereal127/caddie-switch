import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { HOLE_MAPS } from "./maps.js";
import { GREEN_VIEWS } from "./greens.js";
import { MAP_XFORM_V5 } from "./mapxform.js";
import { applyDerivedHole, isPipelinePin } from "./derivedMerge.js";
import { DEFAULT_CLUBS, GRID_N, emptyGreen, solvePutt, fitClub, solve, stopAt, LANDED, MIN_BARS, SHAPE_LABEL } from "./model.js";
import { loadTerrain, classAt, lieOf, heightAt } from "./terrain.js";
import { treesAlong } from "./trees.js";
import { contourDataUrl } from "./relief.js";
import { MAP_SCALES, mapScaleOf, mapFileUrl, loadMapIndex, preloadImage } from "./mapScale.js";
import { scrollFor } from "./mapView.js";


/* ============================================================
   CADDIE·SWITCH v13 — clickable hole maps + solver + tracker
   Tap map: 1st tap = ball, 2nd = target. Calibrate each hole
   once with a known in-game distance; after that every line
   you draw auto-measures and feeds the solver.
   ============================================================ */

const STORE_KEY = "sss-golf-solver-v2";

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
// v13's hand-placed tree positions (fractional x,y; an audit found 24 of the
// 130 within 6 map px of a real tree). They only seed a fresh install's
// markers (auto: true) until derived.json loads: its trees are WSR's own,
// from the course placement files, with each canopy's radius, and they
// replace every auto marker on every load (derivedMerge.js). The player's
// own markers (no auto) are never touched.
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

const T = {
  turf: "#2E7D46", turfDeep: "#1E5631", turfLight: "#3E9A5C",
  sky: "#CBE9F6", sand: "#EAD9A4", flag: "#E5484D",
  ink: "#14301D", cream: "#F7F9F4", line: "#CFE0D2",
};

const fmtPow = (p) => (Math.round(p * 20) / 20).toFixed(2);
// A rec card's carry / landing / roll line (src/model.js). The roll is
// WSR-shaped; a spinning club landing on a green or fairway shows the range
// from full backspin to none (D4: the spin comes from the swing's stop after
// impact, which the app cannot know). Where the course map shows water, OB
// or a bank at the carry, the card says so (the stop beyond assumes fairway).
// Flown over the terrain (r.elev), it also says how far above or below the
// ball the carry lands (from a yard), and where the ball stops when that is
// a yard or more higher or lower again; a rec no power of its club stops at
// the distance (r.approx) says how far off its closest flight stops.
// fmtRise words the readouts under the distance field too ("… the tee").
const HAZARD_LIE = { water: "water", outer: "out of bounds", wall: "a bank or wall" };
const LANDS = { fairway: "on fairway", rough: "in rough", green: "on the green", fringe: "on the fringe", bunker: "in a bunker" };
const fmtRoll = (v) => (Math.round(v) > 0 ? `+${Math.round(v)}` : Math.round(v) < 0 ? `−${-Math.round(v)}` : "0");
const fmtRise = (dh, ref = "you") => (Math.round(Math.abs(dh)) === 0 ? "" : `${Math.round(Math.abs(dh))} yd ${dh > 0 ? "above" : "below"} ${ref}`);
const recRollLine = (r, dist) => {
  const head = `carry ≈ ${Math.round(r.carry)} yd`;
  if (HAZARD_LIE[r.landsOn]) return `${head} · ⚠ the course map shows ${HAZARD_LIE[r.landsOn]} there`;
  const lands = `lands ${LANDS[r.surface] ?? `on ${r.surface}`}${r.landsOn == null ? " (assumed)" : ""}`;
  const roll = r.rollSpin != null && (r.surface === "green" || r.surface === "fairway")
    ? `rolls ${fmtRoll(r.rollSpin)} … ${fmtRoll(r.roll)} yd (full spin … none)`
    : `rolls ≈ ${Math.round(r.roll)} yd`;
  if (!r.elev) return `${head} · ${lands} · ${roll}`;
  const at = fmtRise(r.dh), stops = Math.abs(r.dhStop - r.dh) >= 1 ? ` · stops ${fmtRise(r.dhStop) || "level with you"}` : "";
  const off = r.stop - dist;
  const miss = r.approx ? ` · no power stops it at ${dist} yd: the closest stops ${Math.round(Math.abs(off))} yd ${off > 0 ? "past" : "short"}` : "";
  return `${head} · ${lands}${at ? `, ${at}` : ""} · ${roll}${stops}${miss}`;
};
// A tree-hit rec's line (src/model.js checkTrees): the tree, how the flight
// meets it, and the best clean rec as the alternative with how it passes that
// tree. The shapes are Wii Sports Resort's, the flight's heights WSR-shaped
// (src/trees.js); a player's own marker is checked as a mid-size broadleaf.
const TREE_INK = "#8a6d1a";
const TREE_HIT = { canopy: "through the canopy", trunk: "into the trunk" };
const ALT_HOW = { over: "clears it (over)", under: "clears it (under)", clear: "passes beside it" };
const recTreeLine = (t) => `🌲 ${t.own ? "your tree marker (as a mid-size broadleaf)" : t.shape} at ~${Math.round(t.at)} yd: ${TREE_HIT[t.kind]}${t.alt ? ` — ${t.alt.club} at ${fmtPow(t.alt.power)} ${ALT_HOW[t.alt.how]}` : " — every club that stops there meets a tree or is blocked"}`;
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
  // the game's bands (blue to 11 mph, lime 12-23, pink 24+; measured on the
  // map captures, see HoleMap's badge) in colours that hold up on the sky disc
  const wcol = speed >= 24 ? "#E5489B" : speed >= 12 ? "#A3C400" : "#3B82C4";
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
// Slope grids hold PHYSICAL downhill vectors (yards: tools/wsr-truth.mjs, and
// simPutt integrates them in yards). Views that stretch the green's box to a
// different shape must convert directions, or arrows skew on non-square greens.
// boxAspect = the green box's true width/height (map px are isotropic).
const MAP_PX_W = 250, MAP_PX_H = 304;
const boxAspect = (b) => (b && b.y1 > b.y0 ? ((b.x1 - b.x0) * MAP_PX_W) / ((b.y1 - b.y0) * MAP_PX_H) : 1);

// Pipeline pins say where they came from (tools/build-derived.mjs): src "wsr"
// is one of WSR's own spots, decoded from the game files (set "A" = the harder
// three, "B" = the easier three, label like "BL"); src "switch" is a spot only
// Switch captures show (label "S1"...). Pins the player adds carry neither and
// are numbered P1, P2... among themselves, so they never collide with the
// specials' 1-6 or shift when a load reorders the list.
const pinLabels = (pins) => {
  let own = 0, pipe = 0;
  return pins.map((p) => (isPipelinePin(p) ? (pipe++, p.label ?? String(pipe)) : `P${++own}`));
};
const pinTitle = (p) => p.src === "switch"
  ? `Switch-only spot (not one of WSR's), seen in ${p.seen ?? 0} of your rounds`
  : p.src === "wsr"
    ? `${p.set === "A" ? "A pin (harder set)" : p.set === "B" ? "B pin (easier set)" : "WSR pin"}${p.yd != null ? ` · ${p.yd} yd from the tee` : ""} · ${p.seen ? `seen in ${p.seen} of your rounds` : "not in your captures yet"}`
    : isPipelinePin(p) ? "spot from your captures" : "your own pin";

function GreenCanvas({ mapSrc, green, mode, onGrid, ball, cup, onTap, path, aimPt }) {
  const [phase, setPhase] = useState(0);
  const dragRef = useRef(null);
  const svgRef = useRef(null);
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 1000), 90);
    return () => clearInterval(id);
  }, []);
  if (!green?.box) return null;
  const { x0, y0, x1, y1 } = green.box;
  const iw = 100 / Math.max(0.02, x1 - x0), ih = 100 / Math.max(0.02, y1 - y0);
  const cell = 100 / GRID_N;
  // measured against the SVG, not the bordered div: the SVG sits inside the
  // div's 3px border, so the div's rect put taps up to 3 CSS px off (1% of
  // the green on a phone), like HoleMap's mapRect
  const toBox = (e, el) => {
    const r = (svgRef.current ?? el).getBoundingClientRect();
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
    const len = Math.hypot(dx, dy); // drag length on screen sets the strength
    // the canvas shows the box as a square; store the physical direction
    const asp = boxAspect(green.box), px = dx * asp, py = dy, plen = Math.hypot(px, py) || 1;
    const g = green.grid.map((row) => row.map((v) => [...v]));
    if (len < 3) g[j][i] = [0, 0];
    else {
      const m = len < 8 ? 1 : len < 15 ? 2 : 3;
      g[j][i] = [(px / plen) * m, (py / plen) * m];
    }
    onGrid && onGrid(g);
  };
  return (
    <div className="relative rounded-xl overflow-hidden select-none touch-none" style={{ border: `3px solid ${T.turfDeep}`, cursor: mode === "view" ? "default" : "crosshair" }}
      onPointerDown={down} onPointerUp={up}>
      <svg ref={svgRef} viewBox="0 0 100 100" className="w-full block" style={{ aspectRatio: "1" }}>
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
          const asp = boxAspect(green.box), qx = sx / asp, qm = Math.hypot(qx, sy) || 1;
          const ux = qx / qm, uy = sy / qm; // physical direction drawn on the square canvas
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

/* ---------------- zoomed green view ----------------
   The putting surface at its own scale: the WSR green rendered from the game
   files (tools/render-maps.mjs; meta.source "render") or, for a hole with no
   render, fused from the zoomed green captures and free of the flag, pole
   and cup. It needs no projection onto the hole map: the image IS the
   green's bounding box plus its margin, so green-local (0,0)..(1,1) lands on
   derived.json's greenBox and on the 9x9 slope grid directly. Pins are
   stored map-fractional, so they convert through the box.
*/
function GreenView({ holeNum, pins = [], curPinId = null, greenBox = null, greenPoly = null, grid = null, meta = null, onPick }) {
  const src = GREEN_VIEWS[holeNum];
  if (!src || !greenBox) return null;
  const bw = greenBox.x1 - greenBox.x0, bh = greenBox.y1 - greenBox.y0;
  if (!(bw > 0) || !(bh > 0)) return null;
  // The image carries padding around the bbox so the whole green is in frame,
  // so bbox-local 0..1 maps to (u + M) / (1 + 2M) of the image.
  const M = meta?.margin ?? 0;
  const place = (u) => ((u + M) / (1 + 2 * M)) * 100;
  const labels = pinLabels(pins);
  const toLocal = (p) => ({ x: place((p.x - greenBox.x0) / bw), y: place((p.y - greenBox.y0) / bh) });
  // green outline in bbox-local units, used to keep slope arrows on the green
  const localPoly = (greenPoly ?? []).map(([x, y]) => [(x - greenBox.x0) / bw, (y - greenBox.y0) / bh]);
  const inGreen = (u, v) => {
    if (localPoly.length < 3) return true;
    let inside = false;
    for (let i = 0, j = localPoly.length - 1; i < localPoly.length; j = i++) {
      const [xi, yi] = localPoly[i], [xj, yj] = localPoly[j];
      if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
    }
    return inside;
  };
  const cells = [];
  if (grid) {
    const N = grid.length;
    for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
      const v = grid[gy]?.[gx];
      if (!v || (!v[0] && !v[1])) continue;
      const u = (gx + 0.5) / N, w = (gy + 0.5) / N;
      if (!inGreen(u, w)) continue; // a cell straddling the edge has slope data but is not puttable
      const mag = Math.hypot(v[0], v[1]) || 1;
      // the 0..100 viewBox is stretched to the green's aspect, so a physical
      // direction (dx, dy) is drawn as (dx / aspect, dy) to look right on screen
      const asp = meta?.aspect || boxAspect(greenBox);
      cells.push({ cx: place(u), cy: place(w), ux: v[0] / mag / asp, uy: v[1] / mag, mag });
    }
  }
  return (
    <div className="rounded-xl border-2 overflow-hidden" style={{ borderColor: T.line, background: "#fff" }}>
      <div className="flex items-center justify-between px-2.5 pt-1.5 pb-1">
        <span className="disp text-[11px] font-bold">Green · hole {holeNum}</span>
        <span className="text-[10px] opacity-60">
          {meta?.source === "render" ? "rendered from the course data"
            : meta ? `${meta.sessions} capture${meta.sessions === 1 ? "" : "s"} · ${Math.round(meta.covered * 100)}% seen` : ""}
        </span>
      </div>
      <div className="relative mx-auto mb-2" style={{ width: "88%", aspectRatio: String(meta?.aspect || 1) }}>
        <img src={src} alt="" className="absolute inset-0 w-full h-full rounded-lg"
          style={{ objectFit: "fill", imageRendering: "auto" }} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          {/* downhill slope arrows, length by magnitude */}
          {cells.map((c, i) => {
            const L = 2.6 + c.mag * 1.9;
            const x2 = c.cx + c.ux * L, y2 = c.cy + c.uy * L;
            return (
              <g key={i} opacity="0.85">
                <line x1={c.cx} y1={c.cy} x2={x2} y2={y2} stroke="#12203A" strokeWidth="0.9" strokeLinecap="round" />
                <circle cx={c.cx} cy={c.cy} r="0.8" fill="#12203A" />
              </g>
            );
          })}
          {pins.map((p, i) => {
            const q = toLocal(p);
            if (q.x < -8 || q.y < -8 || q.x > 108 || q.y > 108) return null;
            const cur = p.id === curPinId;
            const lab = labels[i], two = lab.length > 1;
            return (
              <g key={p.id} transform={`translate(${q.x} ${q.y})`}
                onPointerDown={onPick ? (e) => { e.stopPropagation(); onPick(p.id); } : undefined}
                style={{ cursor: onPick ? "pointer" : "default" }}>
                <title>{pinTitle(p)}</title>
                <circle r={(cur ? 3 : 2.2) + (two ? 0.6 : 0)} fill={cur ? T.flag : "rgba(255,255,255,0.85)"}
                  stroke={T.ink} strokeWidth="0.7" strokeDasharray={p.src === "switch" ? "1.2 0.8" : undefined} />
                <text y={two ? 0.9 : 1.1} textAnchor="middle" fontSize={two ? 2.5 : 3.2} fontWeight="700"
                  fill={cur ? "#fff" : p.set === "A" ? T.flag : T.ink}>{lab}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// The ball is on a spot (the tee star, an online tier) only when it was put
// there exactly: the ⛳ chips copy the spot's own coordinates, so an exact
// match is what they make, and 1e-6 of the map is far under a map px. One
// test for the chips and for HoleMap's ring, so they cannot disagree. The
// old 0.01 reach (2.5 x 3 map px) lit both Online chips at once on 10 of the
// 12 holes with tiers (the tiers are 4 yd apart, 0.0052-0.0152 of the map;
// only H4 and H11 clear 0.01) and From tee as well on H10/H11/H15/H16/H18.
const ballOn = (ball, spot) => !!(ball && spot && Math.hypot(ball.x - spot.x, ball.y - spot.y) < 1e-6);
// The online platform's upper tier stands "a few feet" above the lower (the
// player: upper-tier players see little more than the tops of the lower-tier
// players' heads); unmeasured, so 1 yd. A ball there sits that far above the
// course's ground under it (the terrain has no platform), which the solver
// flies from (ctx.ballLift: +1.3 yd of carry on a full driver, src/model.js);
// the lower tier is taken as the ground itself.
const UPPER_TIER_YD = 1.0;
// the debug contour image's size (src/relief.js): the maps' own 2x of the
// 250x304 frame, so its lines sit on the 2x image's pixels (over a 3x / 4x map
// it stretches over the same box, the frame being the same); 25-65 ms a hole
// in Node, built once per hole and session
const CONTOUR_PX = { w: 500, h: 608 };

// The hole map's image at the mapScale setting (src/mapScale.js): the 2x
// bundle image (HOLE_MAPS) at once, the larger file from public/maps/ once a
// preload of it has loaded, so a slow connection never shows a blank map (a
// first view costs 100-196 KB at 3x, 154-317 KB at 4x). A file once loaded
// shows at once on every later view this session; one whose <img> fails
// (onError) gives 2x for the session. n null (the view is not on screen)
// loads nothing. -> { src, shown (the scale on screen), pending, onError }
const MAP_LOADED = new Map(); // "n:scale" -> its url, loaded this session
const MAP_BROKEN = new Set(); // "n:scale" whose <img> failed
function useHoleMapSrc(n, scale) {
  const key = `${n}:${scale}`;
  const want = n != null && scale > 2 && !MAP_BROKEN.has(key);
  const [, rerender] = useState(0);
  const [missKey, setMissKey] = useState(null); // the key whose load gave no file
  useEffect(() => {
    if (!want || MAP_LOADED.has(key)) return;
    let live = true;
    setMissKey(null);
    loadMapIndex()
      .then((ix) => { const url = mapFileUrl(ix, n, scale); return url ? preloadImage(url).then((ok) => (ok ? url : null)) : null; })
      .then((url) => {
        if (url) MAP_LOADED.set(key, url);
        if (!live) return;
        if (url) rerender((k) => k + 1); else setMissKey(key);
      });
    return () => { live = false; };
  }, [key, want]);
  const url = want ? MAP_LOADED.get(key) ?? null : null;
  return {
    src: url ?? (n != null ? HOLE_MAPS[n] : null),
    shown: url ? scale : 2,
    pending: want && !url && missKey !== key,
    onError: url ? () => { MAP_BROKEN.add(key); rerender((k) => k + 1); } : undefined,
  };
}

/* ---------------- clickable hole map ---------------- */
// mapSrc: the map image (useHoleMapSrc; the 2x bundle image when absent) and
// onMapError its <img>'s fallback. The image is the 250x304 frame at any
// scale, so the overlays, the taps and the markers, all fractional, are the same.
// zoom (the solver's Map chips, mapScale / 2: 3x = 1.5, 4x = 2; 1 = fit, the
// Holes tab's always): above 1 the map is drawn zoom x the panel's width in a
// viewport the size of the fitted map, panned by scrolling (a touch natively,
// a mouse by dragging, a wheel) and placed on the ball by src/mapView.js (the
// target in view, or else the pin in use: the hole's default line). The
// marks keep their fitted size on screen (each drawn at 1 / zoom about its
// spot, so 4x shows more map around a pin, not a pin twice the size) and the
// wind badge stays in the viewport's corner, where the fitted map has it.
function HoleMap({ holeNum, line, onLine, markers, onMarkers, markerMode, aimPreview, cornerMode, onCorner, pins = [], curPinId = null, pinMode = false, onPins, distLabel = null, windBadge = null, teePos = null, teeOnlinePos = null, stopMarker = null, landMarker = null, treeMarker = null, overlaySrc = null, mapSrc = null, onMapError, zoom = 1 }) {
  const imgRef = useRef(null);
  const src = mapSrc ?? HOLE_MAPS[holeNum];
  const pinLabelList = pinLabels(pins);
  const magnified = zoom > 1;
  const k = 1 / zoom; // a mark's scale in the magnified map: its fitted size on screen
  const at = (x, y) => (magnified ? `translate(${x} ${y}) scale(${k})` : `translate(${x} ${y})`);

  const dragMoved = useRef(false);
  const [draggingT, setDraggingT] = useState(false);
  // Taps are measured against the map image, not the bordered div around it:
  // the img and the SVG sit inside its 3px border, so the div's rect put every
  // tap up to 3 CSS px off (over 2 map px on a phone's 330-px map). The rect
  // is the image's own wherever the magnified view is scrolled, so a tap
  // there needs no scroll offset.
  const mapRect = (el) => (imgRef.current ?? el).getBoundingClientRect();
  const fracOf = (e, el) => {
    const r = mapRect(el);
    const pt = e.touches ? e.touches[0] : e;
    return { x: Math.min(1, Math.max(0, (pt.clientX - r.left) / r.width)),
             y: Math.min(1, Math.max(0, (pt.clientY - r.top) / r.height)) };
  };
  // every line the map sets itself (a tap, the target drag) goes through
  // here, so the magnified view can tell them from a line set elsewhere
  const ownLine = useRef(null);
  const setOwnLine = (l) => { ownLine.current = l; onLine(l); };
  // The press is on the target marker: within 0.07 of the fitted map (24 CSS
  // px on a phone's 344-px map). Magnified, it is the handle drawn over the
  // target with the same reach on screen (0.07 / zoom of the map), whose
  // touch-action: none is what keeps a touch there from panning the view:
  // the browser reads it when the touch starts, before any script runs.
  const handleRef = useRef(null);
  const grabbable = !!line.target && !cornerMode && !pinMode && !markerMode;
  const reach = 0.07 * k;
  const onTarget = (e, el) => {
    if (!grabbable) return false;
    if (magnified) return !!handleRef.current && handleRef.current.contains(e.target);
    const f = fracOf(e, el);
    return Math.hypot(f.x - line.target.x, f.y - line.target.y) < reach;
  };
  // grab-and-drag the target marker
  const onDown = (e) => {
    if (!onTarget(e, e.currentTarget)) return;
    const el = e.currentTarget;
    e.preventDefault();
    setDraggingT(true);
    const ball = line.ball;
    const mv = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      dragMoved.current = true;
      setOwnLine({ ball, target: fracOf(ev, el) });
    };
    const up = () => {
      window.removeEventListener("mousemove", mv); window.removeEventListener("touchmove", mv);
      setDraggingT(false);
      setTimeout(() => { dragMoved.current = false; }, 0);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("touchmove", mv, { passive: false });
    window.addEventListener("mouseup", up, { once: true });
    window.addEventListener("touchend", up, { once: true });
  };

  // A mouse drags the magnified map (a touch pans it natively). Past 4 CSS px
  // of movement a press is a pan, captured so it follows the mouse off the
  // map, and its click is swallowed (dragMoved); under that it stays a tap.
  // Not on the target (onDown drags that) nor on the viewport's own
  // scrollbars (the press's target is then the viewport itself). Capturing
  // only once it moves keeps a plain click on the element it was made on.
  const viewRef = useRef(null);
  const pan = useRef(null);
  const [panning, setPanning] = useState(false);
  const panDown = (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || e.target === e.currentTarget || onTarget(e, e.currentTarget)) return;
    const v = e.currentTarget;
    pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: v.scrollLeft, top: v.scrollTop, moved: false };
  };
  const panMove = (e) => {
    const p = pan.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      p.moved = true; dragMoved.current = true; setPanning(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    e.currentTarget.scrollLeft = p.left - dx;
    e.currentTarget.scrollTop = p.top - dy;
  };
  const panEnd = (e) => {
    const p = pan.current;
    if (!p || p.id !== e.pointerId) return;
    pan.current = null;
    if (p.moved) { setPanning(false); setTimeout(() => { dragMoved.current = false; }, 0); }
  };

  // Where the magnified view sits (src/mapView.js scrollFor: on the ball,
  // the target in view when the two fit; with no target drawn, the hole's
  // default line, the ball to the pin in use as App's defaultBearing has it,
  // so a hole opened magnified shows the ball at the bottom margin and the
  // fairway running up the view): placed when the magnification, the hole or
  // the ball changes, when the target is set from outside the map (🎯 Target
  // = pin, the distance field) and when the pin in use changes while no
  // target is drawn (the pins arriving after the map opened, a pin chip),
  // never for the map's own target tap or drag, so the user's panning stays
  // otherwise. A ball the map set itself (a tap) glides to its place, so the
  // eye can follow it; everything else jumps. Before paint, so a view never
  // shows a frame at the map's top-left first.
  const aimPin = pins.find((p) => p.id === curPinId) ?? pins[0] ?? null;
  const placed = useRef(null); // what the view was last placed for
  useLayoutEffect(() => {
    const v = viewRef.current;
    if (!magnified || !v) { placed.current = null; return; }
    const { ball, target } = line;
    const now = { zoom, holeNum, ball: `${ball?.x},${ball?.y}`, target: `${target?.x},${target?.y}`, aim: `${aimPin?.x},${aimPin?.y}` };
    const prev = placed.current, own = line === ownLine.current;
    placed.current = now;
    const sameView = !!prev && prev.zoom === zoom && prev.holeNum === holeNum;
    const ballMoved = !sameView || prev.ball !== now.ball;
    if (!ballMoved && (prev.target === now.target || own) && (target || prev.aim === now.aim)) return;
    const m = v.firstElementChild.getBoundingClientRect();
    const { left, top } = scrollFor({ viewW: v.clientWidth, viewH: v.clientHeight, mapW: m.width, mapH: m.height, ball, target, aim: aimPin && { x: aimPin.x, y: aimPin.y } });
    const glide = sameView && own && prev.ball !== now.ball && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    v.scrollTo({ left, top, behavior: glide ? "smooth" : "auto" });
  });
  // A resize (the phone turned, a desktop window) keeps the view's centre
  // where it was on the map: the map and the view scale with the panel, the
  // scroll offsets in px would not (kept, a phone's 344-px panel widened to
  // a 1280-px window's 406 left H7's tee 16 px below the view). Both axes
  // scale with the client width, which sets the map's and the view's size.
  useEffect(() => {
    const v = viewRef.current;
    if (!magnified || !v || typeof ResizeObserver === "undefined") return;
    let w = v.clientWidth, h = v.clientHeight;
    const ro = new ResizeObserver(() => {
      const nw = v.clientWidth, nh = v.clientHeight;
      if (!w || (nw === w && nh === h)) { w = nw; h = nh; return; }
      const f = nw / w;
      v.scrollLeft = (v.scrollLeft + w / 2) * f - nw / 2;
      v.scrollTop = (v.scrollTop + h / 2) * f - nh / 2;
      w = nw; h = nh;
    });
    ro.observe(v);
    return () => ro.disconnect();
  }, [magnified]);

  const click = (e) => {
    if (dragMoved.current) { dragMoved.current = false; return; }
    const { x: fx, y: fy } = fracOf(e, e.currentTarget);
    if (cornerMode) { onCorner && onCorner(fx, fy); return; }
    if (pinMode) {
      // Hit-test in CSS px with a finger-sized radius: a pin is hit within
      // 11 px of its drawn pole (head to flag top) or the flag cloth's
      // midline, so the head and most of the flag count as "on the pin". The
      // nearest hit pin decides: one of your own is removed; a built-in spot
      // (it comes back with every load) swallows the tap, so no pin ever
      // lands on top of one; no hit adds a pin of your own. The old 1.5/3
      // map-px radii were smaller than the drawn head (3.5 map px), so a tap
      // on a spot added a duplicate 72% of the time. Greens hold 1-8 built-in
      // spots, some only 1.5 map px apart, and their flags cover most of a
      // green at phone size, so a new pin mostly fits only around its edge.
      const r = mapRect(e.currentTarget), ux = r.width / 100 * k, uy = r.height / 100 * k; // CSS px per viewBox unit of a drawn pin (its fitted size when magnified)
      const segDist = (qx, qy, ax, ay, bx, by) => {
        const vx = bx - ax, vy = by - ay;
        const t = Math.max(0, Math.min(1, ((qx - ax) * vx + (qy - ay) * vy) / (vx * vx + vy * vy || 1)));
        return Math.hypot(qx - ax - t * vx, qy - ay - t * vy);
      };
      const hit = pins.map((p) => {
        const qx = (fx - p.x) * r.width, qy = (fy - p.y) * r.height; // the tap, relative to the pin base
        return { p, d: Math.min(segDist(qx, qy, 0, 0, 0, -6 * uy), segDist(qx, qy, 0, -4.5 * uy, 4.5 * ux, -4.5 * uy)) };
      }).filter((h) => h.d <= 11).sort((a, b) => a.d - b.d)[0];
      if (!hit) onPins && onPins([...pins, { id: Date.now(), x: fx, y: fy }]);
      else if (!isPipelinePin(hit.p)) onPins && onPins(pins.filter((p) => p.id !== hit.p.id));
      return;
    }
    if (markerMode) {
      // The nearest of your own markers within 0.06 of the fitted map (a
      // finger's reach; 0.06 / zoom of a magnified one, the same on screen) goes.
      // Failing that, a tap inside the painted canopy of a course tree (auto
      // and on the course) is swallowed: the map shows the tree already, and
      // a marker on it would only cover it. Any other tap adds your marker.
      // The canopy is the disc of radius m.r (a fraction of the map's width)
      // centred m.dx, m.dy (fractions of its width and height; dy negative =
      // north, dx only on the few sprites painted east or west of their
      // trunk) from the trunk at m.x, m.y: the game's sprite stands the
      // canopy north of its trunk by 0.8 of the radius, and the pipeline
      // measures all three on the quad the map paints (build-derived.mjs,
      // TREE_SPRITE). The 0.06 reach (15 x 18 map px) once
      // applied to every pipeline tree as well, 20-100 per hole, the
      // off-course ones (where a ball is out of bounds anyway) included:
      // 20-68% of the map and 34-84% of the playable ground (H9) refused a
      // marker, with no sign why. The on-course canopies alone are 1-13% of
      // the map (5-36% of the playable ground).
      const own = markers.filter((m) => !m.auto)
        .map((m) => ({ m, d: Math.hypot(m.x - fx, m.y - fy) })).filter((o) => o.d < 0.06 * k).sort((a, b) => a.d - b.d)[0];
      if (own) { onMarkers(markers.filter((m) => m.id !== own.m.id)); return; }
      const r = mapRect(e.currentTarget);
      const canopy = markers.some((m) => m.auto && !m.off && m.r > 0
        && Math.hypot((m.x + (m.dx ?? 0) - fx) * r.width, (m.y + (m.dy ?? 0) - fy) * r.height) < m.r * r.width);
      if (!canopy) onMarkers([...markers, { id: Date.now(), x: fx, y: fy }]);
      return;
    }
    if (!line.ball || (line.ball && line.target)) setOwnLine({ ball: { x: fx, y: fy }, target: null });
    else setOwnLine({ ...line, target: { x: fx, y: fy } });
  };

  const px = (p) => ({ x: p.x * 100, y: p.y * 100 });
  const b = line.ball ? px(line.ball) : null;
  const t = line.target ? px(line.target) : null;
  // the ball is on the online platform: on either tier's spot, or on the one
  // spot of a hole whose tiers are unjudged; ballOn, the same test as the ⛳ chips
  const onlineSpots = teeOnlinePos ? (teeOnlinePos.lower && teeOnlinePos.upper ? [teeOnlinePos.lower, teeOnlinePos.upper] : [teeOnlinePos]) : [];
  const onlineTee = onlineSpots.some((p) => ballOn(line.ball, p));

  // the wind badge: in the map's SVG when fitted; magnified, in an SVG of its
  // own over the viewport, at the same place in the view as on the fitted map
  // (the viewport is the fitted map's size), so it never scrolls away (no
  // caller passes one today)
  const windMark = windBadge && (() => {
    // the game's own arrow colours, so the badge can be checked against
    // the minimap at a glance. Measured on the 317 map captures with an
    // arrow: blue up to 11 mph (median RGB 2,251,228), lime from 13 to
    // 22 (228,250,0), pink from 24 (253,107,153); 12 and 23 never seen,
    // so the bands are taken as equal twelfths (floor(mph / 12)).
    const col = windBadge.speed >= 24 ? "#F06BB8" : windBadge.speed >= 12 ? "#E4FA00" : "#5AC8E8";
    return (
      <g transform="translate(86 80)">
        <circle r="10.5" fill="rgba(10,25,16,0.72)" stroke="rgba(255,255,255,0.7)" strokeWidth="0.7" />
        {windBadge.speed > 0 ? (
          <g transform={`rotate(${windBadge.deg})`}>
            <path d="M0,-6.2 L3.1,-1.6 1.35,-1.6 1.35,5.4 -1.35,5.4 -1.35,-1.6 -3.1,-1.6 Z" fill={col} stroke="rgba(0,0,0,0.45)" strokeWidth="0.4" />
          </g>
        ) : (
          <circle r="1.4" fill={col} />
        )}
        <text y="15.6" textAnchor="middle" fontSize="4.6" fontWeight="700" fill="#fff">{windBadge.speed} mph</text>
      </g>
    );
  })();

  // aim preview point: rotate the aim offset (yd → map fraction handled by parent via aimPreview.fx/fy)
  // The map and its layers, the same fitted or magnified: every position is
  // a fraction of the image, so the contour overlay, the line, the stop ring
  // and the landing diamond keep their map spots at any zoom and scroll with it.
  const layers = (
    <>
      <img ref={imgRef} src={src} alt={`Hole ${holeNum} map`} className="w-full block" draggable={false} onError={onMapError} />
      {/* a debug layer between the map and the marks: the Holes tab's contour lines (src/relief.js) */}
      {overlaySrc && <img src={overlaySrc} alt="" className="absolute inset-0 w-full h-full pointer-events-none" draggable={false} />}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {b && t && <line x1={b.x} y1={b.y} x2={t.x} y2={t.y} stroke="#fff" strokeWidth={k} strokeDasharray={`${2.5 * k} ${2 * k}`} />}
        {b && t && distLabel && (
          <g transform={at((b.x + t.x) / 2, (b.y + t.y) / 2)}>
            <rect x="-11" y="-4.5" width="22" height="8" rx="2" fill="rgba(20,48,29,0.85)" />
            <text y="1.8" textAnchor="middle" fontSize="4.6" fontWeight="700" fill="#fff">{distLabel}</text>
          </g>
        )}
        {b && t && aimPreview && (
          <line x1={b.x} y1={b.y} x2={aimPreview.x * 100} y2={aimPreview.y * 100} stroke={T.sand} strokeWidth={k} strokeDasharray={`${1.5 * k} ${1.5 * k}`} />
        )}
        {/* Nothing is drawn over the green: the map is WSR's own minimap art,
            rendered from the game files at 2x (the 3x / 4x renders for the
            Map chips' magnified views),
            its green flat and light like the Switch's overview (the renderer holds WSR's height-contour
            bands at one; the zoomed GreenView keeps them, lighter = higher).
            The SVG checker that used to fill the green's outline was drawn
            when the maps were stacked captures whose 28-px greens averaged
            to flat colour. */}
        {teePos && (
          <g transform={at(teePos.x * 100, teePos.y * 100)}>
            <circle r="3.4" fill="rgba(20,48,29,0.55)" />
            <path d="M0,-2.4 L0.72,-0.74 2.5,-0.74 1.06,0.36 1.6,2.1 0,1.05 -1.6,2.1 -1.06,0.36 -2.5,-0.74 -0.72,-0.74 Z" fill="#FFD447" stroke="#8a6d1a" strokeWidth="0.25" />
          </g>
        )}
        {/* the online (Survival Golf) platform's tiers sit 0.4-2.7 (lower)
            and 0.8-3.9 (upper) viewBox units from the tee star on the 12
            holes that have them, mostly inside the star's 2.5-unit arms (the
            lower tier is within 2 yd of the star on H10 and H11, and level
            with it along the hole but 4.6 yd beside it on H14), so markers
            of their own covered the star. A thin white ring around the ball
            shows only while the ball is on a tier (a ⛳ tier chip is
            active). */}
        {onlineTee && (
          <circle cx={b.x} cy={b.y} r={2.2 * k} fill="none" stroke="#fff" strokeWidth={0.5 * k} />
        )}
        {stopMarker && (
          <g transform={at(stopMarker.x * 100, stopMarker.y * 100)}>
            <circle r="3.2" fill="none" stroke="#fff" strokeWidth="0.9" />
            <circle r="1.2" fill="#fff" />
            <circle r="4.6" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" strokeDasharray="1.4 1.2" />
          </g>
        )}
        {/* the selected rec's first landing (its carry), a sand diamond drawn
            over the stop marker's rings, whose outer one reaches 10-35 yd
            from the stop (0.89-2.51 yd per map px), so a short roll lands
            inside them */}
        {landMarker && (
          <path transform={at(landMarker.x * 100, landMarker.y * 100)} d="M0,-2 L1.7,0 0,2 -1.7,0 Z" fill={T.sand} stroke={T.ink} strokeWidth="0.4" />
        )}
        {/* the selected rec's tree, when its flight goes into the trunk or
            through the canopy (src/trees.js): a ring at the trunk, red over
            white so it reads on a canopy and on the fairway alike */}
        {treeMarker && (
          <g transform={at(treeMarker.x * 100, treeMarker.y * 100)}>
            <circle r="2.6" fill="none" stroke="#fff" strokeWidth="1.4" />
            <circle r="2.6" fill="none" stroke={T.flag} strokeWidth="0.7" />
          </g>
        )}
        {!magnified && windMark}
        {pins.map((p, i) => {
          const cur = p.id === curPinId;
          // during play only the pin in use is drawn; pin-edit mode shows the
          // whole catalog so spots can be picked, added or removed
          if (!cur && !pinMode) return null;
          const lab = pinLabelList[i];
          // Built-in spots sit 0.6-2.4 units apart and a two-letter label is
          // ~4.2 units wide, so in pin-edit mode labelling every spot piled
          // them into one smear; there, only your own pins and the current
          // pin are named and the rest are bare flags. Same marks as the
          // zoomed green and the pin chips: A pins red, Switch-only spots
          // dashed, and a tooltip with the spot's story.
          const named = cur || !isPipelinePin(p);
          const dash = p.src === "switch" ? "0.8 0.6" : undefined;
          return (
            <g key={p.id} transform={at(p.x * 100, p.y * 100)} style={{ pointerEvents: "auto" }}>
              <title>{pinTitle(p)}</title>
              <circle r="1.4" fill={cur ? T.flag : "#fff"} stroke={T.ink} strokeWidth="0.5" strokeDasharray={dash} />
              <line x1="0" y1="0" x2="0" y2="-6" stroke={cur ? T.flag : "#fff"} strokeWidth="1" />
              <path d="M 0 -6 L 4.5 -4.5 L 0 -3 Z" fill={cur || p.set === "A" ? T.flag : "#EAD9A4"} stroke={T.ink} strokeWidth="0.3" strokeDasharray={dash} />
              {named && <text y="-7.5" textAnchor="middle" fontSize="3.4" fontWeight="700" fill="#fff" stroke={T.ink} strokeWidth="0.15">{lab}</text>}
            </g>
          );
        })}
        {/* Your own hazard markers. The course's trees are in the map itself
            (WSR's sprites, rendered from the game files at their placement
            positions), so the pipeline's tree markers (auto, with the
            painted canopy's radius r and offset dy, dx) draw nothing here and
            only serve the tap rule above; the v13 seeds an install may still
            hold until derived.json loads are auto too, and draw nothing. */}
        {markers.filter((m) => !m.auto).map((m) => (
          <g key={m.id} transform={at(m.x * 100, m.y * 100)}>
            <circle r="3.2" fill="#0B3D1E" stroke="#fff" strokeWidth="0.7" />
            <text y="1.5" textAnchor="middle" fontSize="4.5">🌲</text>
          </g>
        ))}
        {b && <circle cx={b.x} cy={b.y} r={1.2 * k} fill="#fff" stroke={T.ink} strokeWidth={0.6 * k} />}
        {t && <g transform={at(t.x, t.y)} style={{ pointerEvents: "auto", cursor: draggingT ? "grabbing" : "grab" }}>
          <circle r="2.8" fill="none" stroke={T.flag} strokeWidth="1.1" />
          <circle r="0.9" fill={T.flag} />
        </g>}
      </svg>
      {/* magnified: the target's grab handle (onTarget), an ellipse of
          reach (0.07 / zoom of the map) about it, over the marks */}
      {magnified && grabbable && (
        <div ref={handleRef} className="absolute rounded-full"
          style={{ left: `${(line.target.x - reach) * 100}%`, top: `${(line.target.y - reach) * 100}%`, width: `${200 * reach}%`, height: `${200 * reach}%`, touchAction: "none", cursor: draggingT ? "grabbing" : "grab" }} />
      )}
    </>
  );
  const frame = { border: `3px solid ${T.turfDeep}`, cursor: draggingT || panning ? "grabbing" : "crosshair" };
  if (!magnified) return (
    <div className="relative rounded-xl overflow-hidden select-none touch-none" style={frame}
      onClick={click} onMouseDown={onDown} onTouchStart={onDown}>
      {layers}
    </div>
  );
  // Magnified: a viewport the fitted map's size (the 250x304 frame's aspect
  // at the panel's width) scrolls the map, zoom x its width. A touch pans it
  // natively (pan-x pan-y, which also keeps the page from pinch-zooming
  // there), and at its edges the page does not scroll on (contain); a mouse
  // drags it (panDown) or wheels it. Thin scrollbars where the system draws
  // them (a desktop's; a phone's overlay ones take no room).
  return (
    <div className="relative rounded-xl overflow-hidden select-none" style={frame}>
      <div ref={viewRef} style={{ aspectRatio: "250 / 304", overflow: "auto", overscrollBehavior: "contain", touchAction: "pan-x pan-y", scrollbarWidth: "thin" }}
        onPointerDown={panDown} onPointerMove={panMove} onPointerUp={panEnd} onPointerCancel={panEnd} onLostPointerCapture={panEnd}>
        <div className="relative" style={{ width: `${zoom * 100}%`, aspectRatio: "250 / 304" }}
          onClick={click} onMouseDown={onDown} onTouchStart={onDown}>
          {layers}
        </div>
      </div>
      {windMark && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">{windMark}</svg>
      )}
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
  // the solver map's magnification (the Map chips): 2 = fit, the whole hole
  // in the panel from the bundle's 2x image; 3 or 4 = the map 1.5x or 2x the
  // panel, panned, from the 3x / 4x render (public/maps/, src/mapScale.js;
  // the names follow the renders). The Holes tab's maps stay fitted and take
  // the same image. Stored at the root of the app state, an additive key (an
  // install without it reads 2).
  const [mapScale, setMapScale] = useState(2);
  const [saveState, setSaveState] = useState("");
  const [openHole, setOpenHole] = useState(null);
  const [holeMarkerEdit, setHoleMarkerEdit] = useState(false);
  const [cornerMode, setCornerMode] = useState(false);
  const [cornerTmp, setCornerTmp] = useState(null);
  const [greenPaint, setGreenPaint] = useState(false);
  const [pinEdit, setPinEdit] = useState(false);
  // Holes -> ⚙: the debug contour overlay (src/relief.js) of the open hole;
  // component state, never stored. contourImg = { hole, url } (url null: no
  // terrain for that hole), each hole's image built once and kept for the session
  const [contours, setContours] = useState(false);
  const [contourImg, setContourImg] = useState(null);
  const contourCache = useRef(new Map());
  const [ioOpen, setIoOpen] = useState(false);
  const [ioText, setIoText] = useState("");
  const [solverPinMode, setSolverPinMode] = useState(false);
  const [putt, setPutt] = useState({ ball: null, cup: null });

  // solver state
  const [hole, setHole] = useState(1);
  const [stroke, setStroke] = useState(1);
  const [dist, setDist] = useState(180);
  const [windSpeed, setWindSpeed] = useState(0);
  const [windDeg, setWindDeg] = useState(0); // N-up canonical: 0 = due north
  const [windMode, setWindMode] = useState("map"); // 'map' (N-up, as minimap shows) | 'shot'
  const [lie, setLie] = useState("tee");
  const [line, setLine] = useState({ ball: null, target: null });
  const [markerMode, setMarkerMode] = useState(false);
  const [selRec, setSelRec] = useState(null); // rec card tapped -> its stop and landing markers on the map
  const [calInput, setCalInput] = useState("");

  const empty = { club: "driver", power: "3.5", lie: "tee", landed: "fairway", windSpeed: "0", windDeg: 0, carry: "", lateral: "", hole: 0, stroke: 1 };
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
        setMapScale(mapScaleOf(d.mapScale));
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
      // derived.json: pipeline output shipped with the deploy (scales, green
      // boxes, slope grids, pins, tees). First time it applies wholesale
      // (derivedV1); afterwards it only fills empty slots, so newer manual
      // edits survive. Holes built from the WSR collision meshes (the truth
      // source) overwrite once more on the first load after that switch
      // (per-hole marker green.src). Pipeline pins mirror derived.json on every load. The rules
      // live in derivedMerge.js.
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
              m[n] = applyDerivedHole(cur, n, dh, { fresh });
            }
            return m;
          });
          // assembled shot rows from the capture pipeline -> auto-Log
          // (deduped by pop-up-frame id; wind is aim-relative, deg 0 = tail)
          if (Array.isArray(der.shots) && der.shots.length) {
            setShots((prevShots) => {
              const have = new Set(prevShots.map((s) => s.id));
              const add = der.shots.filter((r) => r.club && !have.has(r.id)).map((r) => {
                const rad = ((r.windDeg ?? 0) * Math.PI) / 180;
                return { id: r.id, club: r.club, power: r.power, lie: r.lie,
                  ...(LANDED.includes(r.landed) ? { landed: r.landed } : {}),
                  wAlong: (r.windSpeed ?? 0) * Math.cos(rad), wCross: (r.windSpeed ?? 0) * Math.sin(rad),
                  carry: r.ended, lateral: null, hole: r.hole ?? 0, stroke: r.stroke ?? 1,
                  raw: { speed: r.windSpeed ?? 0, deg: r.windDeg ?? 0 } };
              });
              if (!add.length) return prevShots;
              const next = [...add, ...prevShots];
              setClubs((prevClubs) => prevClubs.map((c) => fitClub(c, next)));
              return next;
            });
          }
        }
      } catch {}
    })();
  }, []);

  const persist = async (patch = {}) => {
    const data = { clubs, shots, holesMeta, rounds, activeRound, mapScale, parFixV3: true, mapV4: true, treesV9: true, mapV5: true, derivedV1: true, ...patch };
    try {
      await window.storage.set(STORE_KEY, JSON.stringify(data));
      setSaveState("saved"); setTimeout(() => setSaveState(""), 1500);
    } catch { setSaveState("save failed — kept for this session"); setTimeout(() => setSaveState(""), 2500); }
  };


  /* ---- map geometry ---- */
  const MAP_W = 250, MAP_H = 304; // the hole-map frame in map px (mapV5; the images are rendered at 2x, 500x608, or 3x / 4x by mapScale, and scale to it)
  const geo = useMemo(() => {
    if (!line.ball || !line.target) return null;
    const dx = (line.target.x - line.ball.x) * MAP_W;
    const dy = (line.target.y - line.ball.y) * MAP_H;
    const srcPx = Math.hypot(dx, dy);
    const bearing = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = up/N
    return { srcPx, bearing: ((bearing % 360) + 360) % 360 };
  }, [line]);

  const scale = holesMeta[hole]?.scale ?? null;

  // the map image at the mapScale setting for the solver's hole and the Holes
  // tab's open one, each only while its tab shows; HoleMap and GreenCanvas
  // take the same source
  const solverMap = useHoleMapSrc(tab === "solver" ? hole : null, mapScale);
  const openMap = useHoleMapSrc(tab === "holes" ? openHole : null, mapScale);

  // the solver's hole's terrain (src/terrain.js: the KCL surface class and the
  // ground height from the WSR meshes); null while it loads or when missing,
  // and the solver then assumes every landing is fairway
  const [terrain, setTerrain] = useState(null);
  useEffect(() => {
    let live = true;
    setTerrain(null);
    loadTerrain(hole).then((t) => { if (live) setTerrain(t); });
    return () => { live = false; };
  }, [hole]);
  useEffect(() => {
    if (!contours || openHole == null) return;
    const n = openHole;
    if (contourCache.current.has(n)) { setContourImg({ hole: n, url: contourCache.current.get(n) }); return; }
    let live = true;
    loadTerrain(n).then((t) => {
      const url = t ? contourDataUrl(t, CONTOUR_PX) : null;
      if (url) contourCache.current.set(n, url);
      if (live) setContourImg({ hole: n, url });
    });
    return () => { live = false; };
  }, [contours, openHole]);

  // auto-fill distance whenever a calibrated line is drawn: the line's own
  // length (a lie change refreshes it too). The max-reach clamp below bounds
  // it in the same effect flush, because a new bearing's solve gives a new
  // maxReach in this render. (It used to clamp here against the previous
  // line's maxReach through a ref, and the clamp then overrode it with the
  // new line's: on H17 tapping 120 yd off a 236 yd line left 200 in the field
  // with a 120 yd line drawn, the recs solved for 200.)
  useEffect(() => {
    if (geo && scale) setDist(Math.round(geo.srcPx * scale));
  }, [geo, scale, lie]);

  // the tee box is the default hitting position (derived tee when known)
  useEffect(() => {
    const tee = holesMeta[hole]?.tee ?? null;
    setLine({ ball: tee ? { x: tee.x, y: tee.y } : null, target: null });
    setMarkerMode(false); setPutt({ ball: null, cup: null }); setSelRec(null);
  }, [hole]);  // eslint-disable-line
  useEffect(() => {
    if (lie !== "green" || putt.cup) return;
    const meta = holesMeta[hole];
    const pin = (meta?.pins ?? []).find((p) => p.id === meta?.curPin);
    const box = meta?.green?.box;
    if (!pin || !box) return;
    const gx = (pin.x - box.x0) / (box.x1 - box.x0), gy = (pin.y - box.y0) / (box.y1 - box.y0);
    if (gx >= 0 && gx <= 1 && gy >= 0 && gy <= 1) setPutt((p) => (p.cup ? p : { ...p, cup: { x: gx, y: gy } }));
  }, [lie, hole, holesMeta, putt.cup]);

  // default alignment when no target is drawn: the game's default line ≈
  // ball(tee) → current pin; keeps N-up wind convertible without tapping
  const defaultBearing = useMemo(() => {
    const from = line.ball ?? holesMeta[hole]?.tee ?? null;
    const meta = holesMeta[hole];
    const pin = (meta?.pins ?? []).find((p) => p.id === meta?.curPin) ?? meta?.pins?.[0] ?? null;
    if (!from || !pin) return null;
    const dx = (pin.x - from.x) * MAP_W, dy = (pin.y - from.y) * MAP_H;
    return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  }, [line.ball, holesMeta, hole]);
  // windDeg state is ALWAYS stored N-up absolute; "relative to shot" is just
  // a different view of the same value, so dragging the target (which
  // changes the bearing) correctly changes the effective wind either way.
  const shotBearing = geo?.bearing ?? defaultBearing;
  const relWindDeg = shotBearing != null ? ((windDeg - shotBearing) % 360 + 360) % 360 : windDeg;

  const activeWindRules = useMemo(
    () => (lie === "green" ? [] : matchWindRules(hole, stroke, windSpeed, relWindDeg)),
    [hole, stroke, windSpeed, relWindDeg, lie]
  );
  const blockedRules = useMemo(() => Object.values(holesMeta).flatMap((m) => m.blocked ?? []), [holesMeta]);
  // the lie the course map shows `yd` along the shot line (ball → target, or
  // the default line to the pin), where the solver reads each club's landing
  // surface: the same projection as the stop marker below
  const surfaceAt = useMemo(() => {
    if (!terrain || !scale || !line.ball || shotBearing == null) return null;
    const th = (shotBearing * Math.PI) / 180;
    return (yd) => lieOf(classAt(terrain, line.ball.x + (Math.sin(th) * yd) / scale / MAP_W, line.ball.y - (Math.cos(th) * yd) / scale / MAP_H));
  }, [terrain, scale, line.ball, shotBearing]);
  // the ground's height along the same line, yd above (+) or below (-) the
  // ground under the ball (src/terrain.js; the hole's datum cancels): the
  // solver flies each club over it (src/model.js, "elevation"). null where
  // the terrain has no sample; no function at all while the ball's own spot
  // has none, and the solver keeps the flat shape, as without terrain
  const heightAlong = useMemo(() => {
    if (!terrain || !scale || !line.ball || shotBearing == null) return null;
    const h0 = heightAt(terrain, line.ball.x, line.ball.y);
    if (h0 == null) return null;
    const th = (shotBearing * Math.PI) / 180;
    return (yd) => {
      const h = heightAt(terrain, line.ball.x + (Math.sin(th) * yd) / scale / MAP_W, line.ball.y - (Math.cos(th) * yd) / scale / MAP_H);
      return h == null ? null : h - h0;
    };
  }, [terrain, scale, line.ball, shotBearing]);
  // what the solver reads along the line; ballLift = how far the ball sits
  // above that ground at address, yd: UPPER_TIER_YD on the online platform's
  // upper tier (its ⛳ chip; ballOn, the chips' own test), else 0 (on the
  // course itself, the lower tier included)
  const teeUpper = holesMeta[hole]?.teeOnline?.upper ?? null;
  const ballLift = teeUpper && ballOn(line.ball, teeUpper) ? UPPER_TIER_YD : 0;
  // the hole's trees on the line's frame (src/trees.js treesAlong): the
  // pipeline's trees, on and off the course (WSR collides with every tree it
  // places), with their kind, scales and base height, and your own markers
  // as a mid-size broadleaf on the ground under them; the solver checks
  // every club's flight against them (src/model.js, "trees"). null without
  // terrain, line or scale, or a height under the ball: no check
  const holeMarkers = holesMeta[hole]?.markers;
  const treesOnLine = useMemo(() => {
    if (!terrain || !scale || !line.ball || shotBearing == null) return null;
    return treesAlong(holeMarkers, { ball: line.ball, bearing: shotBearing, scale, groundAt: (x, y) => heightAt(terrain, x, y) });
  }, [terrain, scale, line.ball, shotBearing, holeMarkers]);
  const solveCtx = useMemo(() => ({ surfaceAt, heightAt: heightAlong, ballLift, trees: treesOnLine }), [surfaceAt, heightAlong, ballLift, treesOnLine]);
  // the readouts under the distance field: the ball's height against the tee
  // (the heights' datum is the WSR start, the local tee spot; the ball's lift
  // included) and the target's against the ball, the target being the point
  // dist along the line, where the solver aims to stop (the drawn target
  // unless max reach clamped dist). null without terrain or a height under
  // the ball; target null where the line has none there
  const elevNote = useMemo(() => {
    if (!terrain || !line.ball) return null;
    const hb = heightAt(terrain, line.ball.x, line.ball.y);
    if (hb == null) return null;
    const ht = heightAlong && dist > 0 ? heightAlong(dist) : null;
    return { ball: hb + ballLift, target: ht == null ? null : ht - ballLift };
  }, [terrain, line.ball, heightAlong, dist, ballLift]);
  const { recs, maxReach } = useMemo(
    () => solve(clubs, { dist, windSpeed, relWindDeg, lie, hole, stroke }, blockedRules, solveCtx),
    [clubs, dist, windSpeed, relWindDeg, lie, hole, stroke, blockedRules, solveCtx]
  );
  // drag a rec card's power bar -> power -> implied stop distance (the solver's
  // own f, src/model.js stopAt: the club flown over the terrain along the
  // line, or without terrain its stop curve on the surface that power's carry
  // lands on). The bar's left end is the solver's floor (MIN_BARS of the
  // cap), where its recs start. The rounded distance can still fall where the
  // club has no rec (half the time at the floor's own stop, a hair past the
  // club's top, or inside a jump of f at a surface edge: 280 of 88,494 bar
  // positions on the holes' default lines on the flat curve; over the terrain
  // a jump keeps the closest flight as an approximate rec), and the card then
  // unmounts until the next move: a detached element's rect is all zeros,
  // which would pin frac at 1 and the distance at the cap's stop for the rest
  // of the drag, so the rect is kept from the last move it was mounted
  const dragBar = (e, r) => {
    e.stopPropagation(); e.preventDefault();
    const el = e.currentTarget;
    const wAlongNow = windSpeed * Math.cos((relWindDeg * Math.PI) / 180);
    let rect = el.getBoundingClientRect();
    const apply = (ev) => {
      if (el.isConnected) rect = el.getBoundingClientRect();
      const pt = ev.touches ? ev.touches[0] : ev;
      const frac = Math.min(1, Math.max(MIN_BARS / r.cap, (pt.clientX - rect.left) / rect.width));
      const d = Math.round(stopAt(r.club, frac * r.cap, wAlongNow, solveCtx));
      if (d > 0) setDist(d);
    };
    apply(e);
    const mv = (ev) => { if (ev.cancelable) ev.preventDefault(); apply(ev); };
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("touchmove", mv); };
    window.addEventListener("mousemove", mv);
    window.addEventListener("touchmove", mv, { passive: false });
    window.addEventListener("mouseup", up, { once: true });
    window.addEventListener("touchend", up, { once: true });
  };
  // the distance never exceeds the max reach: a functional update, so the
  // auto-fill of a shorter line queued in the same flush is not overridden.
  // A reach that floors to 0 does not clamp: over the terrain a bank right
  // in front of the ball throws every club's cap flight back behind it and
  // solve reports a reach of 0 (src/model.js), which would otherwise pin the
  // distance at 0 and turn every typed value into 0 (the input below too)
  useEffect(() => {
    if (lie !== "green" && maxReach && Math.floor(maxReach.yd) > 0 && dist > Math.floor(maxReach.yd)) setDist((v) => Math.min(v, Math.floor(maxReach.yd)));
  }, [maxReach, dist, lie]);

  // aim preview on map: rotate best rec's aim offset around the ball
  const bestRec = recs.find((r) => !r.blocked && !r.tree) ?? recs.find((r) => !r.blocked) ?? recs[0] ?? null;
  const aimPreview = useMemo(() => {
    if (!geo || !scale || !bestRec || !line.ball || !line.target) return null;
    const th = (geo.bearing * Math.PI) / 180;
    const offPx = bestRec.aim / scale; // yd → src px, + = right of line
    const ox = Math.cos(th) * offPx, oy = Math.sin(th) * offPx;
    return { x: line.target.x + ox / MAP_W, y: line.target.y + oy / MAP_H };
  }, [geo, scale, bestRec, line]);

  // the selected rec on the minimap, along the drawn line or the default
  // alignment (the in-game-meter mockup): where its ball should STOP (dist,
  // or over the terrain the flight's own stop, which differs when no power of
  // the club stops at dist: r.approx) and where it first LANDS (its carry;
  // over the terrain the flight's, so the marker shows where a drop or a rise
  // moved the landing)
  const recMarks = useMemo(() => {
    if (selRec == null || !scale || !line.ball || shotBearing == null || !(dist > 0)) return null;
    const th = (shotBearing * Math.PI) / 180;
    const at = (yd) => ({ x: line.ball.x + (Math.sin(th) * yd) / scale / MAP_W, y: line.ball.y - (Math.cos(th) * yd) / scale / MAP_H });
    const r = recs[selRec];
    return { stop: at(r?.elev ? r.stop : dist), land: r?.carry > 0 ? at(r.carry) : null };
  }, [selRec, recs, scale, line.ball, shotBearing, dist]);
  const stopPoint = recMarks?.stop ?? null, landPoint = recMarks?.land ?? null;
  // and the trunk of the tree its flight hits, if it does
  const treePoint = useMemo(() => {
    const t = selRec != null ? recs[selRec]?.tree : null;
    const m = t ? (holeMarkers ?? []).find((x) => x.id === t.id) : null;
    return m ? { x: m.x, y: m.y } : null;
  }, [selRec, recs, holeMarkers]);

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
      landed: LANDED.includes(form.landed) ? form.landed : "fairway",
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
        <div className="max-w-[1500px] mx-auto flex items-center justify-between flex-wrap gap-2">
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

      <main className="max-w-[1500px] mx-auto px-5 py-6">
        {saveState && <div className="mb-3 text-xs font-semibold" style={{ color: T.turfDeep }}>{saveState}</div>}

        {/* ================= SOLVER ================= */}
        {tab === "solver" && (
          <div className="grid md:grid-cols-2 xl:grid-cols-[1.15fr_1fr_1.1fr] gap-6">
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

              {/* --- the map (full width for a bigger canvas) --- */}
              <div className="space-y-2">
                {/* the map's magnification (mapScale, stored): fit, or 3x /
                    4x, the map 1.5x / 2x the panel in a pannable view that
                    opens on the ball (HoleMap's zoom), drawn from the 3x / 4x
                    render fetched on a hole's first view (the Holes tab's
                    maps take the same image, fitted; its thumbnails stay
                    2x); the note says when that render is not on screen yet
                    and the 2x image is magnified meanwhile */}
                <div>
                  <div className="flex items-center justify-end gap-1 text-[10px]">
                    {mapScale > 2 && solverMap.shown === 2 && (
                      <span className="opacity-60 mr-1">{solverMap.pending ? `loading ${mapScale}x…` : `no ${mapScale}x render here: 2x`}</span>
                    )}
                    <span className="disp font-bold mr-0.5">Map</span>
                    {MAP_SCALES.map((s) => (
                      <button key={s} onClick={() => { setMapScale(s); persist({ mapScale: s }); }}
                        title={s === 2 ? "the whole hole in the panel" : `the map ${s / 2}x the panel, from its ${s}x render; drag or swipe to pan`}
                        className="font-bold px-2 py-0.5 rounded-full border-2" style={chip(mapScale === s)}>{s === 2 ? "fit" : `${s}x`}</button>
                    ))}
                  </div>
                  {mapScale > 2 && (
                    <div className="text-[10px] text-right opacity-60 mt-0.5">{mapScale / 2}× the fitted map (the {mapScale}x render) · drag or swipe to pan</div>
                  )}
                </div>
                <div>
                  <HoleMap holeNum={hole} line={line} onLine={setLine}
                    mapSrc={solverMap.src} onMapError={solverMap.onError}
                    markers={holesMeta[hole].markers} onMarkers={(m) => setMarkers(hole, m)}
                    markerMode={markerMode} aimPreview={aimPreview}
                    pins={holesMeta[hole].pins} curPinId={holesMeta[hole].curPin}
                    pinMode={false} onPins={(p) => setPins(hole, p)}
                    distLabel={geo ? (scale ? `${Math.round(geo.srcPx * scale)} yd` : "? yd") : null}
                    teePos={holesMeta[hole].tee ?? null}
                    teeOnlinePos={holesMeta[hole].teeOnline ?? null}
                    stopMarker={stopPoint} landMarker={landPoint} treeMarker={treePoint}
                    zoom={mapScale / 2} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border-2 p-2" style={{ borderColor: T.line, background: "#fff" }}>
                    {!line.ball && <span className="font-semibold">Tap the map where your <b>ball</b> is.</span>}
                    {line.ball && !line.target && <span className="font-semibold">Tap your <b>target</b> on the map — or just type the distance to use the game's default line.</span>}
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
                      {holesMeta[hole].pins.map((p, i, all) => {
                        const on = holesMeta[hole].curPin === p.id;
                        const lab = pinLabels(all)[i]; // under 10 pins: recomputing per chip is fine
                        return (
                          <button key={p.id} onClick={() => setCurPin(hole, p.id)} title={pinTitle(p)}
                            className="h-7 px-1 rounded-full border-2 text-[11px] font-bold"
                            style={{ ...chip(on), minWidth: "1.75rem",
                              ...(!on && p.set === "A" ? { color: T.flag } : {}),
                              ...(p.src === "switch" ? { borderStyle: "dashed" } : {}) }}>{lab}</button>
                        );
                      })}
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
                  <div className="flex gap-2">
                    {holesMeta[hole].tee && (
                      <button onClick={() => setLine({ ball: { ...holesMeta[hole].tee }, target: null })}
                        className="flex-1 py-1.5 rounded-xl border-2 font-bold" style={chip(ballOn(line.ball, holesMeta[hole].tee))}>
                        ⛳ From tee
                      </button>
                    )}
                    <button onClick={() => setLine({ ball: holesMeta[hole].tee ? { ...holesMeta[hole].tee } : null, target: null })} className="flex-1 py-1.5 rounded-xl border-2 font-bold" style={chip(false)}>
                      Clear line
                    </button>
                    <button onClick={() => setMarkerMode(!markerMode)} className="flex-1 py-1.5 rounded-xl border-2 font-bold" style={chip(markerMode)}>
                      🌲 {markerMode ? "tap: add / remove" : "Edit trees"}
                    </button>
                  </div>
                  {/* the online platform's two tiers; a single chip while none
                      of the hole's online rounds has a judged tier (x, y only).
                      Two chips to a line (basis = half the row less half the
                      gap), each label kept on one line, a chip that does not
                      fit beside another taking a line of its own: three
                      abreast had 46 px each in the 155-px cell of a 360-px
                      phone and broke every label into three lines. Measured
                      in Chrome (Trebuchet MS bold): "⛳ Lower tier" is 76 px
                      at 11 px and 70 at 10 px, and the half row is 73.5 px at
                      360 (77 at 375), so 10 px pairs the tiers on a 360-px
                      phone. (The "trees shown / hidden" chip that shared this
                      row went with the app's own tree markers: the map shows
                      the game's trees now, and your own markers have the 🌲
                      button above.) */}
                  {holesMeta[hole].teeOnline && (() => {
                    const to = holesMeta[hole].teeOnline;
                    const tiers = to.lower && to.upper ? [["⛳ Lower tier", to.lower], ["⛳ Upper tier", to.upper]] : [["⛳ Online tee", to]];
                    return (
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {tiers.map(([label, p]) => (
                          <button key={label} onClick={() => setLine({ ball: { x: p.x, y: p.y }, target: null })}
                            title="Online Survival Golf tees off from a two-tier platform on every hole: four slots on the lower tier, four on the upper, 4 yd behind and a few feet up. Your slot can shift you up to ~5 yd sideways, so trust the 'yd to go' badge"
                            className="grow basis-[calc(50%-0.25rem)] py-1 rounded-xl border-2 text-[10px] font-bold whitespace-nowrap"
                            style={chip(ballOn(line.ball, p))}>
                            {label}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </section>
            <section className="space-y-3">
              <GreenView holeNum={hole}
                pins={holesMeta[hole].pins} curPinId={holesMeta[hole].curPin}
                greenBox={holesMeta[hole].green?.box ?? null}
                greenPoly={holesMeta[hole].green?.poly ?? null}
                grid={holesMeta[hole].green?.grid ?? null}
                meta={holesMeta[hole].green?.view ?? null}
                onPick={(id) => setCurPin(hole, id)} />
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
                      } else if (line.target && line.ball && scale && v > 0) {
                        // a chosen target defines the line — typing a distance
                        // slides the target along it (From tee resets)
                        const dx = line.target.x - line.ball.x, dy = line.target.y - line.ball.y;
                        const len = Math.hypot(dx * MAP_W, dy * MAP_H);
                        if (len > 1) {
                          const k = (v / scale) / len;
                          setLine((l) => ({ ...l, target: { x: l.ball.x + dx * k, y: l.ball.y + dy * k } }));
                        }
                      }
                      if (lie !== "green" && maxReach && Math.floor(maxReach.yd) > 0) v = Math.min(v, Math.floor(maxReach.yd)); // a reach of 0 does not clamp (the effect above says why)
                      setDist(v);
                    }} />
                  {lie !== "green" && (
                    <div className="text-[11px] mt-1 font-semibold" style={{ minHeight: "2.1em", color: maxReach && dist >= Math.floor(maxReach.yd) ? "#8a6d1a" : undefined, opacity: maxReach && dist >= Math.floor(maxReach.yd) ? 1 : 0.55 }}>
                      {maxReach ? <>max reachable in this wind/lie: {Math.floor(maxReach.yd)} yd ({maxReach.club})</> : "—"}
                    </div>
                  )}
                  {lie !== "green" && elevNote && (
                    <div className="text-[11px] font-semibold opacity-70" title="Heights from the course's terrain (Wii Sports Resort's meshes): the ball against the tee spot, and the target (the distance along your line) against the ball">
                      <div>ball {fmtRise(elevNote.ball, "the tee") || "level with the tee"}</div>
                      {elevNote.target != null && <div>target {fmtRise(elevNote.target) || "level with you"}</div>}
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
                      <GreenCanvas mapSrc={solverMap.src} green={greenNow} mode="putt"
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
                  <WindDial deg={windMode === "map" ? windDeg : relWindDeg}
                    setDeg={(d) => setWindDeg(windMode === "map" ? d : (((shotBearing ?? 0) + d) % 360 + 360) % 360)}
                    speed={windSpeed}
                    topLabel={windMode === "map" ? "N" : "AIM"} bottomLabel={windMode === "map" ? "S" : "YOU"}
                    snap={windMode === "map" ? 45 : 5} />
                  <div className="flex-1">
                    <input type="number" min="0" max="31" step="1" className={inputCls} style={inputStyle} value={windSpeed}
                      onChange={(e) => setWindSpeed(Math.max(0, Math.min(31, Math.round(parseFloat(e.target.value) || 0))))} />
                    <div className="text-xs mt-1 opacity-70">
                      {windMode === "map"
                        ? shotBearing != null ? `Copy the minimap arrow (N-up, snaps to 8). Relative to your ${geo ? "line" : "default line to the pin"}: ${relWindDeg.toFixed(0)}°` : "Copy the minimap arrow (add a pin or draw a line to convert)."
                        : "Arrow = where the wind blows, up = tailwind. Prefer N-up mode — it matches the game's 8 directions exactly."}
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
                  No club stops there from this lie{maxReach ? ` — max ≈ ${Math.round(maxReach.yd)} yd (${maxReach.club}${lie === "bunker" ? ", capped bar" : ""})` : ""}. Shorten the target and plan the extra shot.
                </div>
              )}
              <div className="space-y-3">
                {recs.map((r, i) => {
                  const isBest = i === 0 && !r.blocked && !r.tree;
                  return (
                    <div key={r.club.id} onClick={() => setSelRec(selRec === i ? null : i)}
                      className="rounded-2xl border-2 p-4 relative overflow-hidden cursor-pointer"
                      style={{ borderColor: r.blocked ? T.flag : selRec === i ? T.turfDeep : r.tree ? TREE_INK : isBest ? T.turf : T.line,
                        background: r.blocked ? "#FFF6F6" : selRec === i ? "#F3FAF5" : r.tree ? "#FFFBF0" : "#fff",
                        boxShadow: selRec === i ? `0 0 0 1px ${T.turfDeep}` : undefined }}>
                      {isBest && <div className="absolute top-0 right-0 disp text-[10px] font-bold px-2 py-1 rounded-bl-xl text-white" style={{ background: T.turf }}>BEST</div>}
                      {r.blocked && <div className="absolute top-0 right-0 disp text-[10px] font-bold px-2 py-1 rounded-bl-xl text-white" style={{ background: T.flag }}>🌲 BLOCKED</div>}
                      {r.tree && !r.blocked && <div className="absolute top-0 right-0 disp text-[10px] font-bold px-2 py-1 rounded-bl-xl text-white" style={{ background: TREE_INK }}>🌲 TREE</div>}
                      <div className="disp text-base font-bold">{r.club.name}{selRec === i && <span className="text-[10px] font-semibold ml-2 opacity-60">● stop · ◆ landing{r.tree ? " · ◯ tree" : ""} shown on map</span>}</div>
                      {r.tree && (
                        <div className="text-[11px] font-semibold mt-0.5" style={{ color: TREE_INK }}
                          title="Checked against Wii Sports Resort's tree collision shapes (a trunk and a canopy per tree, from the game's code) along this club's flight; the heights are WSR's, so the Switch may differ">
                          {recTreeLine(r.tree)}
                        </div>
                      )}
                      {r.blocked && (
                        <div className="text-[11px] font-semibold mt-0.5 flex items-center gap-2" style={{ color: T.flag }}>
                          <span>Marked on stroke {r.blocked.stroke}: {r.blocked.note}</span>
                          <button onClick={(e) => { e.stopPropagation(); unblock(hole, r.blocked.id); }}
                            className="px-2 py-0.5 rounded-lg border-2 font-bold" style={{ borderColor: T.flag, color: T.flag, background: "#fff" }}>
                            ✕ unblock
                          </button>
                        </div>
                      )}
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
                      <div className="mt-3 h-3 rounded-full relative" style={{ background: T.sky, cursor: "grab", touchAction: "none" }}
                        onMouseDown={(e) => dragBar(e, r)} onTouchStart={(e) => dragBar(e, r)}
                        onClick={(e) => e.stopPropagation()}
                        title="drag to change the target distance">
                        <div className="h-3 rounded-full pointer-events-none" style={{ width: `${Math.min(100, r.frac * 100)}%`, background: `linear-gradient(90deg, ${T.turfLight}, ${T.turf})` }} />
                        {[25, 50, 75].map((q) => (
                          <div key={q} className="absolute rounded-full pointer-events-none" style={{ left: `${q}%`, top: "50%", width: 5, height: 5, transform: "translate(-50%,-50%)", background: "#fff", boxShadow: "0 0 0 1px rgba(20,48,29,0.35)" }} />
                        ))}
                        <div className="absolute -top-1 h-5 w-0.5 pointer-events-none" style={{ left: `${Math.min(100, r.frac * 100)}%`, background: T.ink }} />
                      </div>
                      <div className="mt-2 text-[11px] font-semibold" style={{ color: HAZARD_LIE[r.landsOn] ? T.flag : T.ink }}>{recRollLine(r, dist)}</div>
                      {r.red && (
                        <div className="mt-1 text-[10px] font-semibold" style={{ color: T.flag }}>
                          ⚠ needs the full bar — past the cap the bar goes red and the ball curves to a RANDOM side (WSR: up to ~35 yd for the driver, ~22 yd for a 7-iron){(lie === "rough" || lie === "bunker") && " (in WSR the red adds up to one bar of power; untested on the Switch)"}
                        </div>
                      )}
                      {(lie === "rough" || lie === "bunker") && (
                        <div className="mt-2 text-[10px] font-semibold" style={{ color: "#8a6d1a" }}>⚠ {lie} lie: shots skew off-line more{lie === "bunker" ? ` — bar capped at ${r.cap} of ${r.club.maxPower}` : " — bar capped at ¾"}</div>
                      )}
                      <div className="mt-2 text-[11px] opacity-60">
                        {r.calibrated > 0 ? `calibrated (${r.calibrated} shots)` : "default numbers — calibrate this club"} · {SHAPE_LABEL}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] opacity-60 mt-3">
                The gold dashed line on the map previews the best shot's wind-corrected aim point. Tree pins you drop are saved to this hole forever, and the solver checks every shot against them as a mid-size tree.
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
                                mapSrc={openMap.src} onMapError={openMap.onError}
                                markers={m.markers} onMarkers={(mk) => setMarkers(n, mk)}
                                markerMode={holeMarkerEdit} aimPreview={null}
                                cornerMode={cornerMode} onCorner={(fx, fy) => handleCorner(n, fx, fy)}
                                pins={m.pins} curPinId={m.curPin}
                                pinMode={pinEdit} onPins={(p) => setPins(n, p)}
                                overlaySrc={contours && contourImg?.hole === n ? contourImg.url : null} />
                              <button onClick={() => { setHoleMarkerEdit(!holeMarkerEdit); setPinEdit(false); }} className="w-full mt-2 py-1.5 rounded-xl border-2 text-xs font-bold" style={chip(holeMarkerEdit)}>
                                🌲 {holeMarkerEdit ? "Tap map to add/remove hazards" : "Edit hazard pins"}
                              </button>
                              <button onClick={() => { setPinEdit(!pinEdit); setHoleMarkerEdit(false); }} className="w-full mt-2 py-1.5 rounded-xl border-2 text-xs font-bold" style={chip(pinEdit)}>
                                📍 {pinEdit ? "Tap map to add/remove pin spots" : "Edit pin locations"}
                              </button>
                              <button onClick={() => { setCornerMode(!cornerMode); setCornerTmp(null); setHoleMarkerEdit(false); }} className="w-full mt-2 py-1.5 rounded-xl border-2 text-xs font-bold" style={chip(cornerMode)}>
                                ⛳ {cornerMode ? (cornerTmp ? "Tap opposite corner of green" : "Tap first corner of green") : m.green?.box ? "Redefine green area" : "Set green corners"}
                              </button>
                              <div className="flex items-center gap-2 mt-2">
                                <button onClick={() => setContours(!contours)} className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border-2" style={chip(contours)}>Contours (debug)</button>
                                <span className="text-[10px] opacity-60">every line 2 yd vs the tee (labelled every 10); for checking the terrain against the real hole{contours && contourImg?.hole === n && !contourImg.url ? " · no terrain for this hole" : ""}</span>
                              </div>
                              {m.green?.box && (
                                <div className="mt-2 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="disp text-xs font-bold">Green slopes</div>
                                    <div className="flex gap-1">
                                      <button onClick={() => setGreenPaint(!greenPaint)} className="text-[10px] font-bold px-2 py-0.5 rounded-full border-2" style={chip(greenPaint)}>{greenPaint ? "painting" : "paint"}</button>
                                      <button onClick={() => setGreen(n, { ...m.green, grid: emptyGreen().grid })} className="text-[10px] font-bold px-2 py-0.5 rounded-full border-2" style={chip(false)}>clear</button>
                                    </div>
                                  </div>
                                  <GreenCanvas mapSrc={openMap.src} green={m.green} mode={greenPaint ? "paint" : "view"}
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
                  <label className="text-xs font-bold">Finished on</label>
                  <select className={inputCls} style={inputStyle} value={form.landed} onChange={(e) => setForm({ ...form, landed: e.target.value })}>
                    {LANDED.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
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
                              ...(LANDED.includes(r.landed) ? { landed: r.landed } : {}),
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
                  <div className="opacity-60 text-[10px]">Copy the box to back up. To import, paste a JSON array — either exported shots, or simple rows like {"{"}"club":"driver","power":4,"lie":"tee","windSpeed":9,"windDeg":180,"ended":242,"hole":10,"stroke":1{"}"} (side optional; "landed":"green" etc. says where it finished, fairway when left out). I can generate these from your screenshots in chat.</div>
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
                        <div className="mono opacity-80">{s.carry} yd{s.landed ? ` → ${s.landed}` : ""}, {s.lateral >= 0 ? "+" : ""}{s.lateral} offline</div>
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
            ["Green box + slopes", (n) => !!holesMeta[n].green?.box && (holesMeta[n].green?.grid ?? []).some((r) => r.some(([x, y]) => x || y)), "AUTO: boundary + slope grid come from Wii Sports Resort's collision meshes (the game files); your zoomed green captures only confirm them. Manual paint in Holes → ⚙ stays available as an override."],
            ["Pins", (n) => (holesMeta[n].pins?.length ?? 0) > 0, "AUTO: WSR's own spots are built in (from the game files). A spot that isn't one of them gets added as S1, S2… once two independent readings agree on it: two rounds, or a zoomed green plus a tee frame (which can be one round)."],
            ["Map scale", (n) => !!holesMeta[n].scale, "AUTO: yards per map pixel from the registration of the WSR meshes to the hole maps; the tee 'yd to go' badges confirm it. (Manual fallback: Solver → tap ball, tap target, type the in-game distance → Set.)"],
            ["Trees", (n) => (holesMeta[n].markers ?? []).some((m) => m.auto && m.r > 0 && !m.off), "AUTO: the map is the game's own minimap, rendered from the Wii Sports Resort course files with every tree where the game plants it, at its size. The app keeps those trees (the ones on the course; a tree out on the outer ground or water, where a ball is out of bounds anyway, doesn't count) so that a tap on a canopy in Edit trees mode adds no marker on top of it. Add your own markers in Holes → ⚙ for anything else that blocks a line."],
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
                <h3 className="disp text-sm font-bold mb-1">Progress (auto-tracked)</h3>
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
                              {done(n) ? <span style={{ color: T.turf }}>●</span> : <span className="opacity-25">○</span>}
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
                  <div>5. Minimap dots = flat-terrain landing points. The solver doesn't assume flat ground: it flies each club over the hole's real terrain along your line (heights from Wii Sports Resort's course meshes), so downhill carries longer and uphill shorter, and the bounce and roll follow the slope. Each rec card says how far above or below you the ball lands, the map marks its landing ◆ beside the stop ●, and under the distance you see the ball's height against the tee and the target's against you.</div>
                  <div>6. Wind arrow colour, measured on the captures: blue through 11 mph, lime from 13 to 22, pink from 24 (12 and 23 mph never came up). The dials here use the same colours, split at 12 and 24.</div>
                  <div>7. Trajectory: driver lowest → spoon → irons rising with number → wedge highest. Low clubs duck under branches; high clubs clear them and feel more wind. The solver flies every club that can stop at your distance past the course's trees, using Wii Sports Resort's own tree collision shapes (each tree a trunk plus a canopy: a ball for the round trees, a cone for the dark pointed ones, a band of fronds for the palms, sized by the tree; your own tree markers count as a mid-size round tree) and the flight's heights from WSR. A shot into a trunk or through a canopy, where the ball drops nearly dead, gets a 🌲 TREE badge, ranks below the clear shots and names the best one that clears that tree: a lofted iron over the canopy, or a driver or spoon under the branches. Tap it to ring the tree on the map. The collision canopy is narrower than the crown the map paints (about 0.7 of it) but centred on the trunk, south of the drawn crown's centre, so a line through a drawn tree's northern edge can be clear while one along its southern edge is not; the trees beyond the course count too (WSR collides with every tree it places). Treat it as WSR's answer until the Switch confirms it.</div>
                  <div>8. Wind comes in exactly 8 directions (N/NE/E/SE/S/SW/W/NW) at integer mph, observed 0–31. The dial snaps to the 8 when set "as on minimap".</div>
                  <div>9. All distances here are STOP distances (carry + roll), and the roll is not a fixed share. In Wii Sports Resort's physics (decoded from the game) the carry grows in step with power but the roll comes from the landing: a flatter, slower landing rolls further, so a driver rolls ~39 yd at 4 bars and ~54 at 1 bar; it rolls ~69 on a green, ~29 in rough and next to nothing in a bunker, and an iron's first bounce on a green is damped. Backspin (irons and wedge, from stopping the swing after impact) can pull a full 9-iron back ~10 yd where it would roll ~10 on without, so the cards show that range. The solver uses WSR's stop-vs-power curve for each club, scaled to your logged distances (WSR-shaped until Switch sweeps calibrate it), and reads where each shot lands from the course map. The minimap dots show flat-ground carry.</div>
                  <div>10. You can physically swing past a capped bar — it goes red and the ball curves to a RANDOM side, more the deeper into the red (WSR: up to ~35 yd for the driver, ~22 yd for a 7-iron). On tee and fairway the red adds no distance; from rough or sand WSR adds up to one more bar (untested on the Switch). The solver never plans on it and flags the recs that need the full bar.</div>
                  <div>11. Putter roll depends on surface: green rolls best, fairway noticeably slower, sand slowest. No source in 20 years reports any per-bar flight penalty from rough/sand — caps are the whole mechanic until your logs say otherwise.</div>
                  <div>12. Backspin strength scales with swing power ("the harder you swing, the stronger the backspin" — official). Capped lies therefore also cap max spin; that alone explains weaker spin from rough/sand.</div>
                  <div>13. Pins are fixed spots, read straight from Wii Sports Resort's course files: H1 has 3, H2–H17 have 6 (B = the easier three, A = the harder three), H18 has 1, the Specials 6 each. In WSR your score picks the set — A once you're more than k/2 under par going into the round's k-th hole (−3 or better before the 4th), never in 3-hole rounds — and a random draw picks the spot within it. Switch Sports reuses these spots (your captures show both sets) and adds a few of its own, labelled S1, S2… Local play tees off from WSR's own tee spot unless you move it (Shot Position). Online Survival Golf tees off from the same two-tier platform on every hole: four slots on the lower tier, four on the upper, which is 4 yd further back and a few feet up. The lower tier is the local tee spot on some holes and up to 8 yd behind it on others (the ⛳ Lower tier / Upper tier chips put the ball on either), and your slot can put you up to ~5 yd to either side. Online captures exist on 12 holes; holes 1, 2, 3, 6, 7, 12, 13, 17 and 21 have none yet, so only the local tee is offered there. The "yd to go" badge is the authority.</div>
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
                    {["Club", "full stop ÷ 4 (a)", "wind % / mph (h)", "drift yd / mph·pow (c)", "traj", "spin", "shots"].map((hd) => (
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
              stop = 4a × S(power ÷ 4, landing) × (1 + h × tailwind-mph) · sidedrift = c × crosswind-mph × power. S is the club's stop-vs-power curve from Wii Sports Resort's physics (decoded from the game; {SHAPE_LABEL} until Switch sweeps calibrate it): S = 1 at 4 bars landing on fairway, so a is the full-power fairway stop ÷ 4; the carry comes off the same curve, and a landing on green, fringe, rough or sand changes the roll. Gauge is 4 bars for every club. Lies cap the usable bar (distance per bar is unchanged below the cap) — fixed values baked in: rough = 3 bars for every club; sand = wedge 3, irons 2, spoon/driver 1; putter uncapped in sand but rolls far less. Distance fits use tee/fairway shots when available, each read through the curve at its power and where it finished; blank sideways entries are skipped by the drift fit.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
