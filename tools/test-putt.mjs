// node tools/test-putt.mjs [repoRoot]
// Acceptance for the putt model (src/putt.js: WSR's roll on a green, decision
// D3, over the mesh green heights or the painted grid). Runs on the committed
// files alone (public/terrain's green grids, derived.json; no rasters, no
// Python). WSR's own numbers are tools/research/wsr-ground-phase.md section 6
// and its tick-exact port, src/wsrsim.js run (the putter on a plane).
//  a. the constants from WSR's (1.26 yd/s² friction, 0.240/s drag, 12.6 yd/s²
//     gravity, 0.110 yd/s² of pull per degree); a flat green: launched at WSR's
//     v0 for power 0.1 .. 2.5 the stops within 3 % of the decode's 1.8 .. 48.1
//     yd and within 0.1 yd of the port's
//  b. a plane tilted 1 / 2 / 4 / 6° along a power-1.0 putt: the decode's 21.4 /
//     22.5 / 25.0 / 28.2 down and 19.6 / 18.8 / 17.2 / 15.7 up within 0.4 yd;
//     against the port at powers 0.2-2.5 on -10..+10° within 0.1 yd (the
//     launch hop); a 20 yd putt across a 2° side slope breaks, by the same
//     amount either way
//  c. the cup from 10 yd: putts that would stop at 12 and 14 yd are holed,
//     16.4 and 18 run past; at dying speed (to stop 1 yd past) 0.10 and 0.137
//     yd off the centre line holed, 0.17 and 0.22 missed; V_CAP = vFlat(4.4);
//     ball and cup on one spot: holed, the gauge hint finite
//  d. vFlat round trip (D -> v -> D) to 0.01 yd over 1-40 yd, and the sim's
//     flat stop for that launch within 0.02 yd
//  e. solvePutt on a 2° side-slope plane holes a 10 yd putt aimed off the cup
//     (uphill), and a straight one on the flat at aim 0
//  f. the source: mesh heights unless the painted grid is edited (gridEdited),
//     the painted levels converted through slopeMaxPct, a height grid's KCL pit
//     outside the mask not read; the putts differ by source as their fields do
//  g. H7 (derived.json + public/terrain/g07.bin): a 10 yd putt from the
//     most-seen pin's downhill side, solved and run straight (no assertion
//     beyond "runs and stops"); a 30 yd putt's solve time (well under 100 ms);
//     H6 pin BL from 20 yd at bearing 255°, holed: one of the 7 of 1,877 putts
//     of 15-30 yd through every pin that the 1° aim stage read as a lag line
//  h. the gauge: T and its inverse, gaugeBars, fitGreenSpeed (the default
//     under 2 flat rows, a fitted speed recovered, non-flat rows ignored);
//     src/model.js re-exports the putt solver
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const P = await imp("src/putt.js");
const M = await imp("src/model.js");
const { parseGreenHeights } = await imp("src/terrain.js");
const { run } = await imp("src/wsrsim.js");
const { DECEL, DRAG, G, wsrPuttV0, flatStop, vFlat, V_CAP, CUP_R, simPutt, solvePutt, puttField, gridField, heightField, launchHop } = P;
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL:", msg); } };
const near = (got, want, tol, what) => ok(Math.abs(got - want) <= tol, `${what}: ${got.toFixed(4)}, expected ${want} ± ${tol}`);
const DEG = Math.PI / 180, MAP_W = 250, MAP_H = 304;

// a plane field in a BOX x BOX yd box: rise per yd `along` toward -y (the
// putts below run up the box), `side` toward +x
const BOX = 400;
const plane = (alongDeg = 0, sideDeg = 0) => {
  const a = Math.tan(alongDeg * DEG), s = Math.tan(sideDeg * DEG);
  return { W: BOX, H: BOX, src: "plane", grad(x, y, o) { o[0] = s; o[1] = -a; } };
};
// a putt from the box's bottom launched up it at v yd/s (the cup far away)
const start = { x: 0.5, y: 0.99 }, far = { x: 0.5, y: 0.0 }, FAR = 0.99 * BOX;
const roll = (field, v) => {
  const r = simPutt(field, start, far, 0, v / vFlat(FAR));
  return { ...r, along: (start.y - r.stop[1]) * BOX, side: (r.stop[0] - start.x) * BOX };
};

// ---- a. constants and the flat green ----
near(DECEL, 1.259, 0.001, "DECEL (0.0002 u/tick² in yd/s²)");
near(DRAG, 0.2401, 0.0001, "DRAG (0.999 per tick, per s)");
near(G, 12.598, 0.001, "G (0.002 u/tick² in yd/s²)");
near(G * Math.sin(0.5 * DEG), 0.110, 0.001, "the pull per degree of slope, yd/s²");
const POWERS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.25, 1.5, 2.0, 2.5];
const DECODE = [1.8, 3.8, 6.0, 8.1, 10.2, 12.3, 14.4, 16.4, 18.5, 20.5, 25.4, 30.1, 39.3, 48.1];
{
  const worst = { rel: 0, port: 0 }, line = [];
  POWERS.forEach((p, k) => {
    const r = roll(plane(), wsrPuttV0(p));
    const port = run({ club: "putter", q: p, surface: "green", trace: false }).stop;
    const rel = Math.abs(r.along - DECODE[k]) / DECODE[k];
    ok(rel <= 0.03, `flat power ${p}: ${r.along.toFixed(2)} yd, the decode's ${DECODE[k]} (${(100 * rel).toFixed(1)} %)`);
    ok(Math.abs(r.along - port) <= 0.1, `flat power ${p}: ${r.along.toFixed(3)} yd, the port's ${port.toFixed(3)}`);
    worst.rel = Math.max(worst.rel, rel); worst.port = Math.max(worst.port, Math.abs(r.along - port));
    line.push(`${p}:${r.along.toFixed(2)}`);
  });
  console.log(`a. flat stops ${line.join(" ")} yd; worst ${(100 * worst.rel).toFixed(1)} % off the decode (its 1-dp rounding), ${worst.port.toFixed(3)} yd off the port`);
}

// ---- b. slopes ----
{
  const v1 = wsrPuttV0(1);
  const want = { [-1]: 21.4, [-2]: 22.5, [-4]: 25.0, [-6]: 28.2, 1: 19.6, 2: 18.8, 4: 17.2, 6: 15.7 };
  const line = [];
  for (const [d, w] of Object.entries(want)) {
    const r = roll(plane(+d), v1);
    near(r.along, w, 0.4, `power 1.0 on ${d > 0 ? "+" : ""}${d}°`);
    line.push(`${d > 0 ? "+" : ""}${d}°:${r.along.toFixed(2)}`);
  }
  let worst = 0;
  for (const q of [0.2, 0.5, 1, 1.5, 2.5]) for (const d of [-10, -8, -6, -4, -2, -1, 1, 2, 4, 6, 8, 10]) {
    const port = run({ club: "putter", q, surface: "green", slopeDeg: d, trace: false }).stop;
    const r = roll(plane(d), wsrPuttV0(q));
    worst = Math.max(worst, Math.abs(r.along - port));
    ok(Math.abs(r.along - port) <= 0.1, `power ${q} on ${d}°: ${r.along.toFixed(3)} yd, the port's ${port.toFixed(3)}`);
  }
  // without the launch hop the steep ones miss: the putt at 6° with launchHop
  // switched off (its fraction undone on the launch speed)
  const noHop = (d) => roll(plane(d), v1 / (1 + launchHop(Math.tan(d * DEG)))).along;
  const n6d = noHop(-6), n6u = noHop(6);
  ok(n6d < 27.6 && n6u > 16.3, `without the launch hop 6° down / up should miss WSR's 28.21 / 15.73 by ~0.7 yd (${n6d.toFixed(2)} / ${n6u.toFixed(2)})`);
  ok(launchHop(0) === 0 && launchHop(Math.tan(-5 * DEG)) > 0 && launchHop(Math.tan(5 * DEG)) < 0, "launchHop: 0 on the flat, a gain downhill, a loss uphill");
  // across a 2° side slope (rising toward +x), a putt that rolls 20 yd on the flat
  const L = roll(plane(0, 2), vFlat(20)), R = roll(plane(0, -2), vFlat(20));
  ok(L.side < -0.5 && Math.abs(L.side + R.side) < 1e-9 && Math.abs(L.along - R.along) < 1e-9, `the 2° side slope break: ${L.side.toFixed(3)} / ${R.side.toFixed(3)} yd`);
  console.log(`b. power 1.0: ${line.join(" ")} yd; against the port over ±10° at powers 0.2-2.5 within ${worst.toFixed(3)} yd (no hop: 6° down ${n6d.toFixed(2)}, up ${n6u.toFixed(2)}); a 20 yd putt across 2° breaks ${(-L.side).toFixed(2)} yd downhill and runs ${L.along.toFixed(2)} yd`);
}

// ---- c. the cup ----
{
  near(V_CAP, 4.07, 0.01, "V_CAP = vFlat(4.4), yd/s");
  ok(flatStop(4.7) > 4.4 && flatStop(4.7) < 6, `the decode's 4.7 yd/s rim speed rolls ${flatStop(4.7).toFixed(2)} yd, inside its 4.4-6 yd band`);
  const box = { W: 20, H: 20, src: "flat", grad(x, y, o) { o[0] = 0; o[1] = 0; } };
  const ball = { x: 0.5, y: 0.9 };
  const cupAt = (d) => ({ x: 0.5 + d / 20, y: 0.9 - 10 / 20 });
  const line = [];
  for (const [stop, holed] of [[12, true], [14, true], [16.4, false], [18, false]]) {
    const r = simPutt(box, ball, cupAt(0), 0, vFlat(stop) / vFlat(10));
    ok(r.holed === holed, `from 10 yd, a putt that would stop at ${stop} yd: ${r.holed ? "holed" : "ran past"}`);
    line.push(`${stop}:${r.holed ? "in" : "past"}`);
  }
  for (const [d, holed] of [[0.10, true], [0.137, true], [0.17, false], [0.22, false]]) {
    const cup = cupAt(d), D = Math.hypot(10, d);
    // launched straight up the box (the cup d off the line), to stop 1 yd past
    const r = simPutt(box, ball, cup, -Math.atan2(d, 10) / DEG, vFlat(11) / vFlat(D));
    ok(r.holed === holed, `${d} yd off the line at dying speed: ${r.holed ? "holed" : "missed"} (closest ${r.best.toFixed(3)})`);
    line.push(`${d}:${r.holed ? "in" : "out"}`);
  }
  // ball and cup put down on one spot (D = 0 launches at 0): at rest within CUP_R is in, and the gauge hint stays finite
  const onCup = solvePutt(box, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 });
  ok(onCup.r.holed && onCup.r.D === 0 && Number.isFinite(P.gaugeBars(onCup.r.Dflat)), `ball on the cup: ${onCup.r.holed ? "holed" : "missed"}, D ${onCup.r.D}, bars ${P.gaugeBars(onCup.r.Dflat)}`);
  line.push(`on-cup:${onCup.r.holed ? "in" : "out"}`);
  console.log(`c. V_CAP ${V_CAP.toFixed(3)} yd/s (4.7 yd/s would roll ${flatStop(4.7).toFixed(2)} yd); from 10 yd ${line.join(" ")}`);
}

// ---- d. vFlat ----
{
  let worst = 0, worstSim = 0;
  for (let D = 1; D <= 40; D += 0.5) {
    worst = Math.max(worst, Math.abs(flatStop(vFlat(D)) - D));
    worstSim = Math.max(worstSim, Math.abs(roll(plane(), vFlat(D)).along - D));
  }
  ok(worst <= 0.01, `vFlat round trip off by ${worst}`);
  ok(worstSim <= 0.02, `the sim's flat stop off vFlat's distance by ${worstSim}`);
  console.log(`d. vFlat round trip within ${worst.toExponential(1)} yd over 1-40 yd; the sim's flat stop within ${worstSim.toFixed(4)} yd`);
}

// ---- e. solvePutt ----
{
  const side = { W: 20, H: 20, src: "side", grad(x, y, o) { o[0] = Math.tan(2 * DEG); o[1] = 0; } };
  const ball = { x: 0.5, y: 0.75 }, cup = { x: 0.5, y: 0.25 };
  const t0 = performance.now();
  const s = solvePutt(side, ball, cup);
  const ms = performance.now() - t0;
  ok(s.r.holed && s.a > 0, `a 10 yd putt across 2° (rising to the right) should be holed aimed right: holed ${s.r.holed}, aim ${s.a}°`);
  const end = s.r.path[s.r.path.length - 1];
  ok(s.r.path.length > 10 && end[0] === cup.x && end[1] === cup.y && Math.abs(s.r.path[0][1] - ball.y) < 1e-12, "the holed path runs from the ball to the cup in box fractions");
  const flat = solvePutt({ ...side, grad(x, y, o) { o[0] = 0; o[1] = 0; } }, ball, cup);
  ok(flat.r.holed && flat.a === 0, `a flat 10 yd putt should be holed straight: aim ${flat.a}°`);
  console.log(`e. across 2°: aim ${s.a}° (${(10 * Math.tan(s.a * DEG)).toFixed(2)} yd right of the cup) at ${s.p.toFixed(3)} of the flat speed, ${s.r.holed ? "holed" : `missed by ${s.r.best.toFixed(2)}`}; flat: aim ${flat.a}°, ${flat.p.toFixed(3)}; ${ms.toFixed(1)} ms`);
}

// ---- f. the source of the slopes ----
{
  // a synthetic height grid in the parseGreenHeights shape: a plane rising 2°
  // toward +x over a 20 x 20 yd green box at 1 yd per map px, the outer 3 nodes
  // outside the mask and holding a 30 yd pit there (as KCL holes in the
  // margins do), and a painted grid all level 3 downhill toward +y
  const sc = 1, bw = 20 / (MAP_W * sc), bh = 20 / (MAP_H * sc);
  const gbox = { x0: 0.4, y0: 0.4, x1: 0.4 + bw, y1: 0.4 + bh };
  const w = 41, h = 41, data = new Int16Array(w * h), mask = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const inside = i >= 3 && i < w - 3 && j >= 3 && j < h - 3;
    mask[j * w + i] = inside ? 1 : 0;
    data[j * w + i] = inside ? Math.round((Math.tan(2 * DEG) * (i * 0.5 - 10)) / 0.001) : -30000;
  }
  // and one node inside the outline beside the pit reading 0.6 yd low, as the
  // raster's bilinear samples bleed into H3's water holes
  data[20 * w + 3] -= 600;
  const heights = { w, h, box: gbox, stepYd: 0.5, z0Yd: 0, unitYd: 0.001, data, mask };
  const grid = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [0, 3]));
  const green = { box: gbox, grid, slopeMaxPct: 5 };
  const W = 20, H = 20, o = new Float64Array(2);
  const fh = puttField({ green, heights, W, H }), fe = puttField({ green: { ...green, gridEdited: true }, heights, W, H }), fg = puttField({ green, heights: null, W, H });
  ok(fh.src === "heights" && fe.src === "edited" && fg.src === "grid", `sources ${fh.src} / ${fe.src} / ${fg.src}`);
  let worstEdge = 0;
  for (const [x, y] of [[10, 10], [0.2, 10], [19.9, 19.9], [10, 0.1], [1.4, 1.6], [25, -3], [1.5, 10], [1.75, 10.1], [2.1, 9.8]]) { fh.grad(x, y, o); worstEdge = Math.max(worstEdge, Math.abs(o[0] - Math.tan(2 * DEG)), Math.abs(o[1])); }
  // within the data's own resolution: 0.001 yd over a 0.5 yd step is 0.002 of slope
  ok(worstEdge <= 0.002, `the heights' gradient off the 2° plane by ${worstEdge} (the pit outside the mask, and the node bled into it, must not be read)`);
  fe.grad(10, 10, o);
  ok(Math.abs(o[0]) < 1e-12 && Math.abs(o[1] + 0.856 * 0.05) < 1e-12, `the edited grid's level 3 at 5 %: [${o[0]}, ${o[1]}], expected [0, ${-0.856 * 0.05}]`);
  const lv = [1, 2, 3].map((m) => { const f = gridField([[[m, 0]]], 1, 1, 10); f.grad(0.5, 0.5, o); return -o[0]; });
  ok(lv.every((v, k) => Math.abs(v - [0.0304, 0.0595, 0.0856][k]) < 1e-12), `levels 1 / 2 / 3 at 10 % read ${lv.join(" / ")}`);
  gridField(grid, W, H).grad(1, 1, o);
  ok(Math.abs(o[1] + 0.856 * P.SLOPE_MAX_PCT_DEFAULT / 100) < 1e-12, "a grid with no slopeMaxPct reads the default");
  const ball = { x: 0.5, y: 0.9 }, cup = { x: 0.5, y: 0.2 };
  const rh = simPutt(fh, ball, cup, 0, 1), re = simPutt(fe, ball, cup, 0, 1);
  // heights: a side slope rising to +x, so the ball breaks left; the edited
  // grid: the putt runs straight down a slope falling toward +y... uphill here
  ok(rh.stop[0] < 0.5 - 0.01 && Math.abs(re.stop[0] - 0.5) < 1e-9 && (ball.y - re.stop[1]) * H < (ball.y - rh.stop[1]) * H - 0.5,
    `heights: break ${((rh.stop[0] - 0.5) * W).toFixed(2)} yd, ran ${((ball.y - rh.stop[1]) * H).toFixed(2)}; edited grid: break ${((re.stop[0] - 0.5) * W).toFixed(2)}, ran ${((ball.y - re.stop[1]) * H).toFixed(2)} (uphill)`);
  const se = solvePutt(fe, ball, cup), sh = solvePutt(fh, ball, cup);
  ok(se.r.D === sh.r.D && (se.a !== sh.a || se.p !== sh.p), "the edited grid's solve should differ from the heights'");
  console.log(`f. heights: straight putt breaks ${((rh.stop[0] - 0.5) * W).toFixed(2)} yd, solve aim ${sh.a}° at ${sh.p.toFixed(3)}; edited grid (5 % uphill): runs ${((ball.y - re.stop[1]) * H).toFixed(2)} of 14 yd, solve aim ${se.a}° at ${se.p.toFixed(3)}`);
}

// ---- g. the real greens; H7 ----
{
  // no green reads a cliff: the steepest gradient over each green box (a 60 x
  // 60 sampling) under 35 % (the steepest is H21's 30 %; H3's read 136 % before
  // the nodes bled into its water holes were dropped)
  const all = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes, o = new Float64Array(2), steep = [];
  for (let n = 1; n <= 21; n++) {
    const d = all[n], g = parseGreenHeights(readFileSync(join(root, `public/terrain/g${String(n).padStart(2, "0")}.bin`)));
    const W = (d.greenBox.x1 - d.greenBox.x0) * MAP_W * d.scale, H = (d.greenBox.y1 - d.greenBox.y0) * MAP_H * d.scale;
    const f = heightField(g, d.greenBox, W, H);
    let m = 0;
    for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) { f.grad((i / 59) * W, (j / 59) * H, o); m = Math.max(m, Math.hypot(o[0], o[1])); }
    steep.push(m);
    ok(m < 0.35, `H${n}'s green reads a ${(100 * m).toFixed(0)} % slope`);
  }
  console.log(`g. steepest gradient per green box: ${steep.map((m, k) => `H${k + 1} ${(100 * m).toFixed(0)}`).join(" ")} %`);
}
{
  const n = 7, d = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes[n];
  const g = parseGreenHeights(readFileSync(join(root, `public/terrain/g${String(n).padStart(2, "0")}.bin`)));
  const box = d.greenBox, W = (box.x1 - box.x0) * MAP_W * d.scale, H = (box.y1 - box.y0) * MAP_H * d.scale;
  const green = { box, grid: d.grid, slopeMaxPct: d.slopeMaxPct };
  const field = puttField({ green, heights: g, W, H });
  ok(field.src === "heights", "H7 reads the mesh heights");
  const pin = d.pins.reduce((b, p) => ((p.seen ?? 0) > (b.seen ?? 0) ? p : b), d.pins[0]);
  const cup = { x: (pin.x - box.x0) / (box.x1 - box.x0), y: (pin.y - box.y0) / (box.y1 - box.y0) };
  const o = new Float64Array(2);
  field.grad(cup.x * W, cup.y * H, o);
  const s = Math.hypot(o[0], o[1]);
  // 10 yd down the fall line from the cup: the putt goes up it
  const ball = { x: cup.x - (o[0] / s) * 10 / W, y: cup.y - (o[1] / s) * 10 / H };
  const inMask = (fx, fy) => {
    const mx = box.x0 + fx * (box.x1 - box.x0), my = box.y0 + fy * (box.y1 - box.y0);
    const i = Math.round(((mx - g.box.x0) / (g.box.x1 - g.box.x0)) * (g.w - 1)), j = Math.round(((my - g.box.y0) / (g.box.y1 - g.box.y0)) * (g.h - 1));
    return i >= 0 && j >= 0 && i < g.w && j < g.h && g.mask[j * g.w + i] === 1;
  };
  const straight = simPutt(field, ball, cup, 0, 1);
  const t0 = performance.now();
  const sol = solvePutt(field, ball, cup);
  const ms = performance.now() - t0;
  ok(straight.t < 20 && sol.r.t < 20 && Number.isFinite(sol.r.best), "H7 putts should run and stop");
  const bars = P.gaugeBars(sol.r.Dflat);
  console.log(`g. H7 pin ${pin.label} (seen ${pin.seen}), slope there ${(100 * s).toFixed(1)} %, ball 10 yd down the fall line (${inMask(ball.x, ball.y) ? "on" : "OFF"} the green): straight at the flat speed stops ${(Math.hypot((straight.stop[0] - cup.x) * W, (straight.stop[1] - cup.y) * H)).toFixed(2)} yd from the cup (${straight.holed ? "holed" : `${((straight.stop[1] - cup.y) * o[1] / s * H + (straight.stop[0] - cup.x) * o[0] / s * W).toFixed(2)} yd past it up the line`}, ${straight.t.toFixed(1)} s); solved: aim ${sol.a}° at ${sol.p.toFixed(3)} of the flat speed (plays as a ${sol.r.Dflat.toFixed(1)} yd flat putt, ${bars.toFixed(2)} bars at 20.5), ${sol.r.holed ? "holed" : `best ${sol.r.best.toFixed(2)} yd`}, ${ms.toFixed(1)} ms`);
  // a 30 yd putt on the same green: the longest chord through the green from the pin's spot
  let pair = null;
  for (let a = 0; a < 360 && !pair; a += 5) {
    const ux = Math.sin(a * DEG), uy = -Math.cos(a * DEG);
    for (let t = 0; t <= 30 && !pair; t += 1) {
      const b = { x: cup.x - (ux * t) / W, y: cup.y - (uy * t) / H }, c = { x: b.x + (ux * 30) / W, y: b.y + (uy * 30) / H };
      if ([0, 0.25, 0.5, 0.75, 1].every((f) => inMask(b.x + (c.x - b.x) * f, b.y + (c.y - b.y) * f))) pair = [b, c];
    }
  }
  ok(!!pair, "H7 should hold a 30 yd putt");
  if (pair) {
    const times = [];
    let s30 = null;
    for (let k = 0; k < 5; k++) { const t = performance.now(); s30 = solvePutt(field, pair[0], pair[1]); times.push(performance.now() - t); }
    times.sort((a, b) => a - b);
    ok(times[2] < 100, `a 30 yd solve takes ${times[2].toFixed(1)} ms (median of 5)`);
    console.log(`   a 30 yd putt on H7: solve ${times[2].toFixed(1)} ms median of 5 (${times.map((t) => t.toFixed(0)).join(" / ")}), aim ${s30.a}° at ${s30.p.toFixed(3)}, ${s30.r.holed ? "holed" : `best ${s30.r.best.toFixed(2)} yd`}`);
  }
  // the 0.25° aim stage: H6 pin BL, the ball 20 yd from the cup at bearing 255° (the putt runs at 255°), on the
  // mesh heights; the 1° stage alone read it as a lag line at 0.165 yd (aim 0°, 1.275), 0.25° holes it
  {
    const d6 = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes[6], g6 = parseGreenHeights(readFileSync(join(root, "public/terrain/g06.bin")));
    const b6 = d6.greenBox, W6 = (b6.x1 - b6.x0) * MAP_W * d6.scale, H6 = (b6.y1 - b6.y0) * MAP_H * d6.scale;
    const f6 = puttField({ green: { box: b6, grid: d6.grid, slopeMaxPct: d6.slopeMaxPct }, heights: g6, W: W6, H: H6 });
    const p6 = d6.pins.find((p) => p.label === "BL");
    const c6 = { x: (p6.x - b6.x0) / (b6.x1 - b6.x0), y: (p6.y - b6.y0) / (b6.y1 - b6.y0) };
    const ux = Math.sin(255 * DEG), uy = -Math.cos(255 * DEG);
    const s6 = solvePutt(f6, { x: c6.x - (ux * 20) / W6, y: c6.y - (uy * 20) / H6 }, c6);
    ok(f6.src === "heights" && s6.r.holed && s6.a % 1 !== 0, `H6 BL from 20 yd at 255°: ${s6.r.holed ? "holed" : `best ${s6.r.best.toFixed(3)} yd`} at aim ${s6.a}°, ${s6.p.toFixed(3)}`);
    console.log(`   H6 pin BL from 20 yd at 255°: aim ${s6.a}° at ${s6.p.toFixed(3)} of the flat speed, ${s6.r.holed ? "holed" : `best ${s6.r.best.toFixed(3)} yd`}`);
  }
}

// ---- h. the gauge and the exports ----
{
  near(P.puttRoll(1), 20.5, 1e-12, "T(1)");
  near(P.puttRoll(0.55), 11.25, 1e-9, "T(0.55) between the rows");
  for (const [p] of P.PUTT_POWER_TABLE) near(P.puttPower(P.puttRoll(p)), p, 1e-12, `T⁻¹(T(${p}))`);
  near(P.gaugeBars(20.5), 4, 1e-12, "a 20.5 yd flat putt at greenSpeed 20.5");
  near(P.gaugeBars(10.2), 2, 1e-12, "a 10.2 yd flat putt at greenSpeed 20.5");
  near(P.gaugeBars(18, 18), 4, 1e-12, "a full gauge at greenSpeed 18");
  ok(P.fitGreenSpeed([]).greenSpeed === 20.5 && P.fitGreenSpeed([{ bars: 2, rolled: 9, flat: true }]).greenSpeed === 20.5, "under 2 flat rows: the default");
  const gs = 18, rows = [1, 2, 3, 4, 2.5].map((b, k) => ({ id: k, hole: 1, bars: b, rolled: (P.puttRoll(b / 4) / 20.5) * gs, flat: true }));
  near(P.fitGreenSpeed(rows).greenSpeed, gs, 1e-9, "greenSpeed recovered from flat rows");
  near(P.fitGreenSpeed([...rows, { id: 9, hole: 1, bars: 4, rolled: 40, flat: false }, { id: 10, hole: 1, bars: 4, rolled: 41, flat: false }]).greenSpeed, gs, 1e-9, "non-flat rows ignored");
  ok(P.fitGreenSpeed([{ bars: 4, rolled: 20 }, { bars: 4, rolled: 22 }]).greenSpeed === 21, "the median of an even count");
  ok(M.simPutt === P.simPutt && M.solvePutt === P.solvePutt && M.CUP_R === CUP_R && M.puttField === puttField, "src/model.js re-exports the putt solver");
  ok(!("MU" in M) && !("SLOPE_G" in M) && !("CUP_V" in M), "the old putt constants are gone from src/model.js");
  console.log(`h. gauge: 20.5 yd = ${P.gaugeBars(20.5)} bars, 10.2 = ${P.gaugeBars(10.2)}; greenSpeed ${gs} recovered from ${rows.length} flat rows`);
}

console.log(fails ? `${fails} FAILURES` : "all putt checks passed");
process.exit(fails ? 1 : 0);
