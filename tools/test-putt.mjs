// node tools/test-putt.mjs [repoRoot]
// Acceptance for the putt model (src/putt.js: Nintendo Switch Sports' roll on
// a green, over the mesh green heights or the painted grid). Runs on the
// committed files alone (public/terrain's green grids, derived.json, the Eden
// recordings' fixture tools/fixtures/nss-flights; no dump, no Python). NSS's
// own numbers are src/nsssim.js (the decoded ball, replayed against Eden's RAM
// by tools/test-nsssim.mjs) and tools/build-nss-shape.mjs's tables
// (src/nssShape.js).
//  a. the constants NSS's (AttrGreen.Friction 1.3 m/s^2 = 1.42 yd/s^2, drag
//     0.0025 a frame = 0.150 /s, GravityPutter 6 m/s^2 = 6.56 yd/s^2, 0.115
//     yd/s^2 of pull a degree); a flat green: the putter at its table's speed
//     at 5-150 % rolls within 0.02 yd of src/nsssim.js's float32 ball and of
//     PUTT_ROLL_YD, and within 0.99-1.04 of the table's design rule
//     (pct / 100 x 20 yd)
//  b. planes tilted along the putt (-10..+10 degrees) at powers 0.2-1.5:
//     within 0.05 yd of src/nsssim.js on the same plane up to 6 degrees and
//     power 1, within 0.4 % of the roll beyond; across a side slope the
//     break, the same either way and within 0.05 yd of nsssim; the slow-ball
//     rule (no slope pull under 0.5 m/s farther than 1 m from the cup): a putt
//     dying across a 4 degree slope breaks less in its last half metre than
//     the same putt with the cup 0.8 m beside where it dies, both as nsssim
//     plays them; a ball stopping up a 15 degree slope stays farther than 1 m
//     from the cup and rolls back within it
//  c. the cup, NSS's (CUP_WINDOW from src/nsssim.js's analytic NSS cup,
//     tools/build-nss-shape.mjs): its ends (0.215 yd at rest, nothing from
//     5.36 yd/s), narrowing with speed, the drop past 2.2 yd/s; every cup
//     approach Eden recorded (the fixture's strokes replayed in src/nsssim.js
//     to where they come within 0.3 m of the cup) on the side of the window
//     the recording ended: 16 holed putts inside, the h05s6 miss, h08s6's
//     lip-out at 2.76 m/s 0.12 m off and h17s1's 12 m/s pass outside; from 10
//     yd, straight putts hole while the cup is reached slower than V_CAP and
//     run past above it; dying putts off the line hole inside the window and
//     miss outside; ball and cup on one spot: holed, the gauge hint finite
//  d. vFlat round trip (D -> v -> D) to 0.01 yd over 1-30 yd, and the sim's
//     flat stop for that launch within 0.02 yd
//  e. solvePutt on a 2 degree side-slope plane holes a 10 yd putt aimed off the
//     cup (uphill), and a straight one on the flat at aim 0
//  f. the source: mesh heights unless the painted grid is edited (gridEdited),
//     the painted levels converted through slopeMaxPct, a height grid's drop
//     outside the mask not read; the putts differ by source as their fields
//     do; H3's shipped grid (NSS's green: its mask holds the two nodes WSR's
//     rasters lost to its water holes, sound) read at the green's own slope
//     there
//  g. the real greens: the steepest gradient over each box; H7 from 10 yd
//     below cup c2 up its fall line, run straight and solved (holed); a 30 yd
//     putt's solve time (under 100 ms); H6 from 20 yd to cup c1, holed
//  h. the gauge: T (NSS's putter table, PUTT_POWER_TABLE) and its inverse,
//     gaugeBars, fitGreenSpeed (the default under 2 flat rows, a fitted speed
//     recovered, non-flat rows ignored); src/model.js re-exports the putt solver
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const P = await imp("src/putt.js");
const M = await imp("src/model.js");
const S = await imp("src/nsssim.js");
const { PUTT_ROLL_YD } = await imp("src/nssShape.js");
const { parseGreenHeights } = await imp("src/terrain.js");
const { DECEL, DRAG, G, puttV0, flatStop, vFlat, V_CAP, CUP_R, simPutt, solvePutt, puttField, gridField, heightField } = P;
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL:", msg); } };
const near = (got, want, tol, what) => ok(Math.abs(got - want) <= tol, `${what}: ${Number(got).toFixed(4)}, expected ${want} ± ${tol}`);
const DEG = Math.PI / 180, MAP_W = 250, MAP_H = 304, YD = 0.9144;

// a plane field in a BOX x BOX yd box: rise per yd `along` toward -y (the
// putts below run up the box), `side` toward +x
const BOX = 400;
const plane = (alongDeg = 0, sideDeg = 0) => {
  const a = Math.tan(alongDeg * DEG), s = Math.tan(sideDeg * DEG);
  return { W: BOX, H: BOX, src: "plane", grad(x, y, o) { o[0] = s; o[1] = -a; } };
};
// a putt from the box's bottom launched up it at v yd/s (the cup far away, or
// `cup` in yd from the start: { x right, y up the box })
const start = { x: 0.5, y: 0.99 }, far = { x: 0.5, y: 0.0 }, FAR = 0.99 * BOX;
const roll = (field, v, cup = null) => {
  const c = cup ? { x: start.x + cup.x / BOX, y: start.y - cup.y / BOX } : far, D = cup ? Math.hypot(cup.x, cup.y) : FAR;
  const ang = cup ? -Math.atan2(cup.x, cup.y) / DEG : 0;   // launched straight up the box whatever the cup's bearing
  const r = simPutt(field, start, c, ang, v / vFlat(D), { trace: false });
  return { ...r, along: (start.y - r.stop[1]) * BOX, side: (r.stop[0] - start.x) * BOX };
};
// the same putt in src/nsssim.js on the same plane: NSS's frame x = the box's
// +x, z = the box's +y (heading 0 = -z = up the box); the cup (when given) acts
// only through its laws (AddGravityHole, the slow-ball rule), its ground holds no hole
const nss = (alongDeg, sideDeg, v, cup = null) => {
  const a = Math.tan(alongDeg * DEG), s = Math.tan(sideDeg * DEG);
  const h = (x, z) => s * x - a * z, n = [-s, 1, a], m = Math.hypot(...n);
  const ground = { heightAt: h, normalAt: () => [n[0] / m, n[1] / m, n[2] / m], attrAt: () => 6 };
  const L = S.PHYSICS.clubs.PT.loftDeg * DEG, sp = v * YD;
  const o = S.run({ club: "PT", v0: [0, sp * Math.sin(L), -sp * Math.cos(L)], lie: "green", start: [0, 0.05 * m, 0], heading: 0, ground: S.heightGround(ground),
    cup: cup ? { x: cup.x * YD, y: h(cup.x * YD, -cup.y * YD) - 0.31, z: -cup.y * YD } : null });
  return { along: -o.rest[2] / YD, side: o.rest[0] / YD, outcome: o.outcome };
};

// ---- a. constants and the flat green ----
{
  near(DECEL, 1.3 / YD, 1e-12, "DECEL (AttrGreen.Friction 1.3 m/s^2 in yd/s^2)");
  near(DRAG, 0.15005, 0.0001, "DRAG (0.0025 a frame, per s)");
  near(G, 6 / YD, 1e-12, "G (GravityPutter 6 m/s^2 in yd/s^2)");
  near(G * Math.sin(DEG), 0.1145, 0.0001, "the pull per degree of slope, yd/s^2");
  let worstNss = 0, worstTab = 0, lo = Infinity, hi = 0;
  const line = [];
  for (let pct = 5; pct <= 150; pct += 5) {
    const v = puttV0(pct / 100), r = roll(plane(), v), o = nss(0, 0, v);
    worstNss = Math.max(worstNss, Math.abs(r.along - o.along)); worstTab = Math.max(worstTab, Math.abs(r.along - PUTT_ROLL_YD[pct - 1]));
    ok(Math.abs(r.along - o.along) <= 0.02 && Math.abs(r.along - PUTT_ROLL_YD[pct - 1]) <= 0.02, `flat ${pct} %: ${r.along.toFixed(3)} yd, nsssim ${o.along.toFixed(3)}, PUTT_ROLL_YD ${PUTT_ROLL_YD[pct - 1]}`);
    if (pct <= 100) { const q = r.along / ((pct / 100) * 20); lo = Math.min(lo, q); hi = Math.max(hi, q); }
    if (pct % 25 === 0) line.push(`${pct}%:${r.along.toFixed(2)}`);
  }
  ok(lo >= 0.99 && hi <= 1.04, `the flat rolls ${lo.toFixed(4)}-${hi.toFixed(4)} x the design rule`);
  console.log(`a. flat rolls ${line.join(" ")} yd; within ${worstNss.toFixed(4)} yd of nsssim, ${worstTab.toFixed(4)} of PUTT_ROLL_YD; ${lo.toFixed(3)}-${hi.toFixed(3)} x pct / 100 x 20 yd`);
}

// ---- b. slopes ----
{
  let worst = 0, worstRel = 0;
  const line = [];
  for (const q of [0.2, 0.5, 1, 1.5]) for (const d of [-10, -6, -4, -2, -1, 1, 2, 4, 6, 10]) {
    const v = puttV0(q), r = roll(plane(d), v), o = nss(d, 0, v), e = Math.abs(r.along - o.along);
    if (Math.abs(d) <= 6 && q <= 1) { worst = Math.max(worst, e); ok(e <= 0.05, `power ${q} on ${d} degrees: ${r.along.toFixed(3)} yd, nsssim ${o.along.toFixed(3)}`); }
    else { worstRel = Math.max(worstRel, e / o.along); ok(e <= 0.004 * o.along, `power ${q} on ${d} degrees: ${r.along.toFixed(3)} yd, nsssim ${o.along.toFixed(3)}`); }
    if (q === 1) line.push(`${d > 0 ? "+" : ""}${d}:${r.along.toFixed(2)}`);
  }
  // across a side slope (rising toward +x), a putt that rolls 15 yd on the flat
  const L = roll(plane(0, 2), vFlat(15)), R = roll(plane(0, -2), vFlat(15)), oL = nss(0, 2, vFlat(15));
  ok(L.side < -0.3 && Math.abs(L.side + R.side) < 1e-9 && Math.abs(L.along - R.along) < 1e-9, `the 2 degree side slope break: ${L.side.toFixed(3)} / ${R.side.toFixed(3)} yd`);
  ok(Math.hypot(L.side - oL.side, L.along - oL.along) <= 0.05, `the side slope against nsssim: ${L.side.toFixed(3)} / ${L.along.toFixed(3)} vs ${oL.side.toFixed(3)} / ${oL.along.toFixed(3)}`);
  // the slow-ball rule: across 4 degrees, a 12 yd putt with the cup far (no pull once
  // under 0.5 m/s) against the cup 0.8 m to the downhill side of where it dies
  const v12 = vFlat(12), farR = roll(plane(0, 4), v12), farO = nss(0, 4, v12);
  const cupNear = { x: farR.side - 0.8 / YD, y: farR.along };
  const nearR = roll(plane(0, 4), v12, cupNear), nearO = nss(0, 4, v12, cupNear);
  ok(Math.hypot(farR.side - farO.side, farR.along - farO.along) <= 0.05 && (nearR.holed || Math.hypot(nearR.side - nearO.side, nearR.along - nearO.along) <= 0.05), `the slow-ball rule against nsssim: far ${farR.side.toFixed(3)} / ${farO.side.toFixed(3)}, near ${nearR.side.toFixed(3)} / ${nearO.side.toFixed(3)}`);
  ok(nearR.side < farR.side - 0.01, `with the cup within 1 m the dying ball should break further down: ${nearR.side.toFixed(3)} vs ${farR.side.toFixed(3)} yd`);
  // a ball stopping up a 15 degree slope: farther than 1 m from the cup it stays,
  // within 1 m it rolls back (the pull, 6 sin 15 = 1.55 m/s^2, beats the friction's 1.3)
  const vUp = puttV0(0.3), upFar = roll(plane(15), vUp), upFarO = nss(15, 0, vUp);
  const upNear = roll(plane(15), vUp, { x: 0.5 / YD, y: upFar.along }), upNearO = nss(15, 0, vUp, { x: 0.5 / YD, y: upFar.along });
  ok(Math.abs(upFar.along - upFarO.along) <= 0.05 && upNear.along < upFar.along - 1 && Math.abs(upNear.along - upNearO.along) <= 0.1, `15 degrees up: stays at ${upFar.along.toFixed(2)} (nsssim ${upFarO.along.toFixed(2)}), with the cup within 1 m rolls back to ${upNear.along.toFixed(2)} (nsssim ${upNearO.along.toFixed(2)})`);
  console.log(`b. power 1.0: ${line.join(" ")} yd; against nsssim within ${worst.toFixed(3)} yd (to 6 degrees, power 1), ${(100 * worstRel).toFixed(2)} % beyond; 15 yd across 2 degrees breaks ${(-L.side).toFixed(2)} yd; across 4 degrees a 12 yd putt dies ${(-farR.side).toFixed(2)} yd down, ${(-nearR.side).toFixed(2)} with the cup 0.8 m below it; 15 degrees up: rests at ${upFar.along.toFixed(2)}, rolls back to ${upNear.along.toFixed(2)} within 1 m of the cup`);
}

// ---- c. the cup ----
{
  const W = P.CUP_WINDOW;
  near(CUP_R, 0.2149, 1e-9, "CUP_R, the window at rest, yd");
  near(V_CAP, 5.3587, 1e-9, "V_CAP, the speed past which nothing drops, yd/s");
  ok(P.cupWindow(V_CAP) === 0 && P.cupWindow(9) === 0 && P.cupWindow(0) === CUP_R, "the window: CUP_R at rest, nothing from V_CAP on");
  ok(W.every(([v, w], i, a) => i === 0 || (v > a[i - 1][0] && w <= a[i - 1][1])), "CUP_WINDOW: rising speeds, a narrowing window");
  ok(P.cupWindow(1.5) > 0.21 && P.cupWindow(2.4) < 0.16 && P.cupWindow(3.5) < 0.11, `the window's drop: ${P.cupWindow(1.5)} / ${P.cupWindow(2.4)} / ${P.cupWindow(3.5)} yd at 1.5 / 2.4 / 3.5 yd/s`);
  // the recorded approaches: each fixture stroke replayed over its own
  // triangles to where its roll first comes within 0.3 m of the cup; the line
  // from there along its velocity passes the centre at d, at a speed slowed by
  // the green's 1.3 m/s^2 over the way to that point
  {
    const FIX = join(root, "tools/fixtures/nss-flights");
    const ix = JSON.parse(readFileSync(join(FIX, "index.json"), "utf8"));
    const b64 = (s, T) => { const buf = Buffer.from(s, "base64"); return new T(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)); };
    const rows = [];
    for (const st of ix.strokes) {
      const f = JSON.parse(readFileSync(join(FIX, `${st.tag}.json`), "utf8"));
      const ground = S.meshGround({ verts: b64(f.mesh.verts, Float32Array), tris: b64(f.mesh.tris, Uint32Array), attr: Uint8Array.from(b64(f.mesh.codes, Uint8Array), (c) => S.ATTR_OF_CODE[c] ?? 0) });
      const cup = { x: f.cup.world[0], y: f.cup.world[1], z: f.cup.world[2] };
      let entry = null;
      S.run({ club: f.club, power: f.power, lie: f.lie, start: f.launch.start, v0: f.launch.v0, hop0: f.launch.hop, side0: f.launch.side, backspin: f.launch.backspin, yRef: f.launch.yRef,
        wind: f.wind.s > 0 ? { s: f.wind.s, dirRad: f.wind.dirRad } : null, cup, ground, stopAtHazard: false,
        onTick: (s) => {
          if (entry || s.mode !== 2) return;
          const dx = s.p[0] - cup.x, dz = s.p[2] - cup.z;
          if (Math.hypot(dx, dz) >= 0.3) return;
          const vh = Math.hypot(s.v[0], s.v[2]), ux = s.v[0] / vh, uz = s.v[2] / vh, t = -(dx * ux + dz * uz);
          entry = { vh, d: Math.abs(dx * uz - dz * ux), vc: Math.sqrt(Math.max(0, vh * vh - 2 * 1.3 * Math.max(0, t))) };
        } });
      if (entry) rows.push({ tag: f.tag, holed: f.outcome === "holed", ...entry });
    }
    const inWin = (r) => r.d / YD <= P.cupWindow(r.vc / YD);
    for (const r of rows) ok(inWin(r) === r.holed, `${r.tag}: recorded ${r.holed ? "holed" : "not holed"}, the line ${(r.d * 100).toFixed(1)} cm off at ${r.vc.toFixed(2)} m/s, window ${(P.cupWindow(r.vc / YD) * YD * 100).toFixed(1)} cm`);
    const holed = rows.filter((r) => r.holed), out = rows.filter((r) => !r.holed);
    ok(holed.length === 17 && out.length === 3 && out.some((r) => r.tag === "h08s6-sw"), `the recorded approaches: ${holed.length} holed, ${out.length} out (${out.map((r) => r.tag).join(", ")})`);
    console.log(`c. the recorded approaches: ${holed.length} holed at ${Math.min(...holed.map((r) => r.vc)).toFixed(2)}-${Math.max(...holed.map((r) => r.vc)).toFixed(2)} m/s, up to ${(Math.max(...holed.map((r) => r.d)) * 100).toFixed(1)} cm off, all inside the window; outside: ${out.map((r) => `${r.tag} ${(r.d * 100).toFixed(1)} cm at ${r.vc.toFixed(2)} m/s (window ${(P.cupWindow(r.vc / YD) * YD * 100).toFixed(1)})`).join(", ")}`);
  }
  const box = { W: 20, H: 20, src: "flat", grad(x, y, o) { o[0] = 0; o[1] = 0; } };
  const ball = { x: 0.5, y: 0.9 };
  const cupAt = (d) => ({ x: 0.5 + d / 20, y: 0.9 - 10 / 20 });
  const line = [];
  // straight from 10 yd: the speed at the cup of a putt that would stop at `stop` yd
  const vAt = (stop) => vFlat(stop - 10);
  for (const stop of [11, 14, 18, 25, 28]) {
    const r = simPutt(box, ball, cupAt(0), 0, vFlat(stop) / vFlat(10));
    ok(r.holed === vAt(stop) < V_CAP, `from 10 yd, a putt that would stop at ${stop} yd (${vAt(stop).toFixed(2)} yd/s at the cup): ${r.holed ? "holed" : "ran past"}`);
    line.push(`${stop}:${r.holed ? "in" : "past"}`);
  }
  for (const [past, d] of [[1, 0.15], [1, 0.2], [1, 0.25], [3, 0.1], [3, 0.16], [3, 0.2]]) {
    const cup = cupAt(d), D = Math.hypot(10, d), want = d <= P.cupWindow(vAt(10 + past));
    // launched straight up the box (the cup d off the line), to stop `past` yd past
    const r = simPutt(box, ball, cup, -Math.atan2(d, 10) / DEG, vFlat(10 + past) / vFlat(D));
    ok(r.holed === want, `${d} yd off the line, to stop ${past} yd past (${vAt(10 + past).toFixed(2)} yd/s, window ${P.cupWindow(vAt(10 + past)).toFixed(3)}): ${r.holed ? "holed" : "missed"} (closest ${r.best.toFixed(3)})`);
    line.push(`${past}:${d}:${r.holed ? "in" : "out"}`);
  }
  const onCup = solvePutt(box, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 });
  ok(onCup.r.holed && onCup.r.D === 0 && Number.isFinite(P.gaugeBars(onCup.r.Dflat)), `ball on the cup: ${onCup.r.holed ? "holed" : "missed"}, D ${onCup.r.D}, bars ${P.gaugeBars(onCup.r.Dflat)}`);
  line.push(`on-cup:${onCup.r.holed ? "in" : "out"}`);
  console.log(`c. CUP_R ${CUP_R} yd, V_CAP ${V_CAP} yd/s (a putt reaching the cup that fast rolls ${flatStop(V_CAP).toFixed(1)} yd past); from 10 yd ${line.join(" ")}`);
}

// ---- d. vFlat ----
{
  let worst = 0, worstSim = 0;
  for (let D = 1; D <= 30; D += 0.5) {
    worst = Math.max(worst, Math.abs(flatStop(vFlat(D)) - D));
    worstSim = Math.max(worstSim, Math.abs(roll(plane(), vFlat(D)).along - D));
  }
  ok(worst <= 0.01, `vFlat round trip off by ${worst}`);
  ok(worstSim <= 0.02, `the sim's flat stop off vFlat's distance by ${worstSim}`);
  console.log(`d. vFlat round trip within ${worst.toExponential(1)} yd over 1-30 yd; the sim's flat stop within ${worstSim.toFixed(4)} yd`);
}

// ---- e. solvePutt ----
{
  const side = { W: 20, H: 20, src: "side", grad(x, y, o) { o[0] = Math.tan(2 * DEG); o[1] = 0; } };
  const ball = { x: 0.5, y: 0.75 }, cup = { x: 0.5, y: 0.25 };
  const t0 = performance.now();
  const s = solvePutt(side, ball, cup);
  const ms = performance.now() - t0;
  ok(s.r.holed && s.a > 0, `a 10 yd putt across 2 degrees (rising to the right) should be holed aimed right: holed ${s.r.holed}, aim ${s.a}`);
  const end = s.r.path[s.r.path.length - 1];
  ok(s.r.path.length > 10 && end[0] === cup.x && end[1] === cup.y && Math.abs(s.r.path[0][1] - ball.y) < 1e-12, "the holed path runs from the ball to the cup in box fractions");
  ok(s.power && s.power.lo < s.power.mid && s.power.mid < s.power.hi && s.power.hi <= P.PUTT_POWER_MAX, `the holing range ${JSON.stringify(s.power)}`);
  const flat = solvePutt({ ...side, grad(x, y, o) { o[0] = 0; o[1] = 0; } }, ball, cup);
  ok(flat.r.holed && Math.abs(flat.a) < 1e-9, `a flat 10 yd putt should be holed straight: aim ${flat.a}`);
  console.log(`e. across 2 degrees: aim ${s.a} degrees (${(10 * Math.tan(s.a * DEG)).toFixed(2)} yd right of the cup) at ${s.p.toFixed(3)} of the flat speed, holing from power ${s.power.lo.toFixed(3)} to ${s.power.hi.toFixed(3)}, ${s.r.holed ? "holed" : `missed by ${s.r.best.toFixed(2)}`}; flat: aim ${flat.a}, ${flat.p.toFixed(3)} (holing ${flat.power.lo.toFixed(3)}-${flat.power.hi.toFixed(3)}); ${ms.toFixed(1)} ms`);
}

// ---- f. the source of the slopes ----
{
  // a synthetic height grid in the parseGreenHeights shape: a plane rising 2
  // degrees toward +x over a 20 x 20 yd green box at 1 yd per map px, the outer
  // 3 nodes outside the mask and holding a 30 yd drop there (as the margins'
  // banks do), and a painted grid all level 3 downhill toward +y
  const sc = 1, bw = 20 / (MAP_W * sc), bh = 20 / (MAP_H * sc);
  const gbox = { x0: 0.4, y0: 0.4, x1: 0.4 + bw, y1: 0.4 + bh };
  const w = 41, h = 41, data = new Int16Array(w * h), mask = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const inside = i >= 3 && i < w - 3 && j >= 3 && j < h - 3;
    mask[j * w + i] = inside ? 1 : 0;
    data[j * w + i] = inside ? Math.round((Math.tan(2 * DEG) * (i * 0.5 - 10)) / 0.001) : -30000;
  }
  const heights = { w, h, box: gbox, stepYd: 0.5, z0Yd: 0, unitYd: 0.001, data, mask };
  const grid = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [0, 3]));
  const green = { box: gbox, grid, slopeMaxPct: 5 };
  const W = 20, H = 20, o = new Float64Array(2);
  const fh = puttField({ green, heights, W, H }), fe = puttField({ green: { ...green, gridEdited: true }, heights, W, H }), fg = puttField({ green, heights: null, W, H });
  ok(fh.src === "heights" && fe.src === "edited" && fg.src === "grid", `sources ${fh.src} / ${fe.src} / ${fg.src}`);
  let worstEdge = 0;
  for (const [x, y] of [[10, 10], [0.2, 10], [19.9, 19.9], [10, 0.1], [1.4, 1.6], [25, -3], [1.5, 10], [1.75, 10.1], [2.1, 9.8]]) { fh.grad(x, y, o); worstEdge = Math.max(worstEdge, Math.abs(o[0] - Math.tan(2 * DEG)), Math.abs(o[1])); }
  ok(worstEdge <= 0.002, `the heights' gradient off the 2 degree plane by ${worstEdge} (the drop outside the mask must not be read)`);
  fe.grad(10, 10, o);
  ok(Math.abs(o[0]) < 1e-12 && Math.abs(o[1] + 0.856 * 0.05) < 1e-12, `the edited grid's level 3 at 5 %: [${o[0]}, ${o[1]}], expected [0, ${-0.856 * 0.05}]`);
  const lv = [1, 2, 3].map((m) => { const f = gridField([[[m, 0]]], 1, 1, 10); f.grad(0.5, 0.5, o); return -o[0]; });
  ok(lv.every((v, k) => Math.abs(v - [0.0304, 0.0595, 0.0856][k]) < 1e-12), `levels 1 / 2 / 3 at 10 % read ${lv.join(" / ")}`);
  gridField(grid, W, H).grad(1, 1, o);
  ok(Math.abs(o[1] + 0.856 * P.SLOPE_MAX_PCT_DEFAULT / 100) < 1e-12, "a grid with no slopeMaxPct reads the default");
  const ball = { x: 0.5, y: 0.9 }, cup = { x: 0.5, y: 0.2 };
  const rh = simPutt(fh, ball, cup, 0, 1), re = simPutt(fe, ball, cup, 0, 1);
  // heights: a side slope rising to +x, so the ball breaks left; the edited
  // grid: the putt runs straight up a slope falling toward +y
  ok(rh.stop[0] < 0.5 - 0.01 && Math.abs(re.stop[0] - 0.5) < 1e-9 && (ball.y - re.stop[1]) * H < (ball.y - rh.stop[1]) * H - 0.5,
    `heights: break ${((rh.stop[0] - 0.5) * W).toFixed(2)} yd, ran ${((ball.y - rh.stop[1]) * H).toFixed(2)}; edited grid: break ${((re.stop[0] - 0.5) * W).toFixed(2)}, ran ${((ball.y - re.stop[1]) * H).toFixed(2)} (uphill)`);
  const se = solvePutt(fe, ball, cup), sh = solvePutt(fh, ball, cup);
  ok(se.r.D === sh.r.D && (se.a !== sh.a || se.p !== sh.p), "the edited grid's solve should differ from the heights'");
  console.log(`f. heights: straight putt breaks ${((rh.stop[0] - 0.5) * W).toFixed(2)} yd, solve aim ${sh.a} at ${sh.p.toFixed(3)}; edited grid (5 % uphill): runs ${((ball.y - re.stop[1]) * H).toFixed(2)} of 14 yd, solve aim ${se.a} at ${se.p.toFixed(3)}`);
  // the shipped H3 grid (public/terrain/g03.bin, ray casts on NSS's green): the
  // two nodes (19, 10) and (20, 10) that WSR's rasters lost to its water holes
  // are sound green here, in the mask, and read the green's own slope; the
  // steepest over the box under 15 %
  {
    const d3 = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes[3];
    const g3 = parseGreenHeights(readFileSync(join(root, "public/terrain/g03.bin")));
    const inMask = g3.mask.reduce((a, v) => a + v, 0);
    ok(g3.mask[10 * g3.w + 19] === 1 && g3.mask[10 * g3.w + 20] === 1, `g03.bin's nodes (19, 10) and (20, 10) not in its mask`);
    const bw3 = (d3.greenBox.x1 - d3.greenBox.x0) * MAP_W * d3.scale, bh3 = (d3.greenBox.y1 - d3.greenBox.y0) * MAP_H * d3.scale, f3 = heightField(g3, d3.greenBox, bw3, bh3);
    const atNode = (i, j) => {
      const fx = g3.box.x0 + (i / (g3.w - 1)) * (g3.box.x1 - g3.box.x0), fy = g3.box.y0 + (j / (g3.h - 1)) * (g3.box.y1 - g3.box.y0);
      f3.grad(((fx - d3.greenBox.x0) / (d3.greenBox.x1 - d3.greenBox.x0)) * bw3, ((fy - d3.greenBox.y0) / (d3.greenBox.y1 - d3.greenBox.y0)) * bh3, o);
      return Math.hypot(o[0], o[1]);
    };
    const rim = [[19, 10], [20, 10], [21, 10]].map(([i, j]) => atNode(i, j));
    ok(rim.every((m) => m < 0.1), `H3 at (19..21, 10) reads ${rim.map((m) => (100 * m).toFixed(1)).join(" / ")} % (expected under 10)`);
    let m3 = 0;
    for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) { f3.grad((i / 59) * bw3, (j / 59) * bh3, o); m3 = Math.max(m3, Math.hypot(o[0], o[1])); }
    ok(m3 < 0.15, `H3's steepest over its box ${(100 * m3).toFixed(1)} % (expected under 15)`);
    console.log(`f. H3 (g03.bin, ${inMask} masked nodes): ${rim.map((m) => (100 * m).toFixed(1)).join(" / ")} % at (19..21, 10), ${(100 * m3).toFixed(1)} % at the steepest over the box`);
  }
}

// ---- g. the real greens; H7, H6 ----
const DERIVED = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes;
// a hole's green as the App reads it, and one of NSS's six cups (its id c0..c5;
// the most-seen one without)
const greenOf = (n, cupId = null) => {
  const d = DERIVED[n], g = parseGreenHeights(readFileSync(join(root, `public/terrain/g${String(n).padStart(2, "0")}.bin`)));
  const box = d.greenBox, W = (box.x1 - box.x0) * MAP_W * d.scale, H = (box.y1 - box.y0) * MAP_H * d.scale;
  const field = puttField({ green: { box, grid: d.grid, slopeMaxPct: d.slopeMaxPct }, heights: g, W, H });
  const pin = (cupId && d.pins.find((p) => p.id === cupId)) || d.pins.reduce((b, p) => ((p.seen ?? 0) > (b.seen ?? 0) ? p : b), d.pins[0]);
  const cup = { x: (pin.x - box.x0) / (box.x1 - box.x0), y: (pin.y - box.y0) / (box.y1 - box.y0) };
  const inMask = (fx, fy) => {
    const mx = box.x0 + fx * (box.x1 - box.x0), my = box.y0 + fy * (box.y1 - box.y0);
    const i = Math.round(((mx - g.box.x0) / (g.box.x1 - g.box.x0)) * (g.w - 1)), j = Math.round(((my - g.box.y0) / (g.box.y1 - g.box.y0)) * (g.h - 1));
    return i >= 0 && j >= 0 && i < g.w && j < g.h && g.mask[j * g.w + i] === 1;
  };
  return { d, g, box, W, H, field, pin, cup, inMask };
};
{
  // no green reads a cliff: the steepest gradient over each green box (a 60 x
  // 60 sampling) under 35 % (the steepest is H19's 32 %, then H21's 31 %)
  const o = new Float64Array(2), steep = [];
  for (let n = 1; n <= 21; n++) {
    const { W, H, field } = greenOf(n);
    let m = 0;
    for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) { field.grad((i / 59) * W, (j / 59) * H, o); m = Math.max(m, Math.hypot(o[0], o[1])); }
    steep.push(m);
    ok(m < 0.35, `H${n}'s green reads a ${(100 * m).toFixed(0)} % slope`);
  }
  console.log(`g. steepest gradient per green box: ${steep.map((m, k) => `H${k + 1} ${(100 * m).toFixed(0)}`).join(" ")} %`);
}
{
  const { W, H, field, pin, cup, inMask } = greenOf(7, "c2");
  ok(field.src === "heights", "H7 reads the mesh heights");
  const o = new Float64Array(2);
  field.grad(cup.x * W, cup.y * H, o);
  const s = Math.hypot(o[0], o[1]);
  // 10 yd down the fall line from the cup: the putt goes up it
  const ball = { x: cup.x - (o[0] / s) * 10 / W, y: cup.y - (o[1] / s) * 10 / H };
  const straight = simPutt(field, ball, cup, 0, 1);
  const t0 = performance.now();
  const sol = solvePutt(field, ball, cup);
  const ms = performance.now() - t0;
  ok(straight.t < 21.7 && sol.r.t < 21.7 && Number.isFinite(sol.r.best) && sol.r.holed, "H7's putt should run, stop and hole once solved");
  const bars = P.gaugeBars(sol.r.Dflat);
  console.log(`g. H7 cup ${pin.id} (seen ${pin.seen}), slope there ${(100 * s).toFixed(1)} %, ball 10 yd down the fall line (${inMask(ball.x, ball.y) ? "on" : "OFF"} the green): straight at the flat speed ${straight.holed ? "holed" : `stops ${(Math.hypot((straight.stop[0] - cup.x) * W, (straight.stop[1] - cup.y) * H)).toFixed(2)} yd from the cup`} (${straight.t.toFixed(1)} s); solved: aim ${sol.a} at ${sol.p.toFixed(3)} of the flat speed (plays as a ${sol.r.Dflat.toFixed(1)} yd flat putt, ${bars.toFixed(2)} bars at ${P.GREEN_SPEED}), ${sol.r.holed ? "holed" : `best ${sol.r.best.toFixed(2)} yd`}, ${ms.toFixed(1)} ms`);
  // a 30 yd putt on the same green: the longest chord through the green from the cup's spot
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
    console.log(`   a 30 yd putt on H7: solve ${times[2].toFixed(1)} ms median of 5 (${times.map((t) => t.toFixed(0)).join(" / ")}), aim ${s30.a} at ${s30.p.toFixed(3)}, ${s30.r.holed ? "holed" : `best ${s30.r.best.toFixed(2)} yd`}`);
  }
}
{
  // H6: 20 yd from cup c1 at bearing 255 degrees (the putt runs at 75), on the mesh heights
  const { W, H, field, pin, cup } = greenOf(6, "c1");
  const ux = Math.sin(255 * DEG), uy = -Math.cos(255 * DEG);
  const s6 = solvePutt(field, { x: cup.x + (ux * 20) / W, y: cup.y + (uy * 20) / H }, cup);
  ok(field.src === "heights" && s6.r.holed, `H6 ${pin.id} from 20 yd at 255 degrees: ${s6.r.holed ? "holed" : `best ${s6.r.best.toFixed(3)} yd`} at aim ${s6.a}, ${s6.p.toFixed(3)}`);
  console.log(`   H6 cup ${pin.id} from 20 yd at 255 degrees: aim ${s6.a} at ${s6.p.toFixed(3)} of the flat speed, ${s6.r.holed ? `holed, power ${s6.power.lo.toFixed(3)}-${s6.power.hi.toFixed(3)}` : `best ${s6.r.best.toFixed(3)} yd`}`);
}

// ---- h. the gauge and the exports ----
{
  near(P.GREEN_SPEED, PUTT_ROLL_YD[99], 0, "GREEN_SPEED, NSS's flat roll at putter power 1.0");
  near(P.puttRoll(1), P.GREEN_SPEED, 1e-12, "T(1)");
  near(P.puttRoll(0.555), (PUTT_ROLL_YD[54] + PUTT_ROLL_YD[55]) / 2, 1e-9, "T(0.555) between the rows");
  ok(P.PUTT_POWER_TABLE.length === 151 && P.PUTT_POWER_TABLE[150][0] === 1.5, "the gauge table runs to PowerOverMaxPT 1.5");
  for (const [p] of P.PUTT_POWER_TABLE) near(P.puttPower(P.puttRoll(p)), p, 1e-12, `T⁻¹(T(${p}))`);
  near(P.gaugeBars(P.GREEN_SPEED), 4, 1e-12, "a full-gauge flat putt at NSS's greenSpeed");
  near(P.gaugeBars(P.puttRoll(0.5)), 2, 1e-12, "a half-gauge flat putt");
  near(P.gaugeBars(18, 18), 4, 1e-12, "a full gauge at greenSpeed 18");
  near(P.gaugeBars(flatStop(puttV0(0.73))), 4 * 0.73, 0.004, "the gauge bars of the putter's own launch at 0.73");
  for (const p of [0.004, 0.2, 0.73, 1.1, 1.5]) near(P.puttPowerOfV0(puttV0(p)), p, 1e-9, `puttV0's inverse at ${p}`);
  ok(P.fitGreenSpeed([]).greenSpeed === P.GREEN_SPEED && P.fitGreenSpeed([{ bars: 2, rolled: 9, flat: true }]).greenSpeed === P.GREEN_SPEED, "under 2 flat rows: the default");
  const gs = 18, rows = [1, 2, 3, 4, 2.5].map((b, k) => ({ id: k, hole: 1, bars: b, rolled: (P.puttRoll(b / 4) / P.GREEN_SPEED) * gs, flat: true }));
  near(P.fitGreenSpeed(rows).greenSpeed, gs, 1e-9, "greenSpeed recovered from flat rows");
  near(P.fitGreenSpeed([...rows, { id: 9, hole: 1, bars: 4, rolled: 40, flat: false }, { id: 10, hole: 1, bars: 4, rolled: 41, flat: false }]).greenSpeed, gs, 1e-9, "non-flat rows ignored");
  ok(Math.abs(P.fitGreenSpeed([{ bars: 4, rolled: 20 }, { bars: 4, rolled: 22 }]).greenSpeed - 21) < 1e-12, "the median of an even count");
  ok(M.simPutt === P.simPutt && M.solvePutt === P.solvePutt && M.CUP_R === CUP_R && M.V_CAP === V_CAP && M.puttField === puttField, "src/model.js re-exports the putt solver");
  ok(!("wsrPuttV0" in P) && !("launchHop" in P) && !("CREEP_DEG" in P), "WSR's putter pieces are gone from src/putt.js");
  console.log(`h. gauge: ${P.GREEN_SPEED} yd = ${P.gaugeBars(P.GREEN_SPEED)} bars, ${P.puttRoll(0.5).toFixed(2)} = ${P.gaugeBars(P.puttRoll(0.5))}; greenSpeed ${gs} recovered from ${rows.length} flat rows`);
}

console.log(fails ? `${fails} FAILURES` : "all putt checks passed");
process.exit(fails ? 1 : 0);
