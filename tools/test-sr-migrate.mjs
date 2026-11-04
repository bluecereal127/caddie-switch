// node tools/test-sr-migrate.mjs [repoRoot]
// Acceptance for src/srMigrate.js, Switch Sports Resort's 27-hole numbering (the user, 2026-11-04) and the one-time
// move of a stored state onto it (App.jsx's flag srHolesV1), on the committed files:
//  1. the numbering: SR_OF_NSS / NSS_OF_SR inverse of each other (NSS 19, 20, 21 to SR 24, 23, 25; holes 1-18 the same),
//     the six new holes (19, 20, 21, 22, 26, 27) have no NSS number, SR_PARS the 27 pars of tools/nss-pins.json
//  2. the frame change of SR 17 and SR 23 (their own capture squares): FRAME_CHANGE's `to` the shipped registration
//     (tools/nss-registration.json, to the bit), NSS's six cups of holes 17 and 20 (the committed fixtures below, from
//     tools/nss-pins.json at 4aa70b3) through toSrFrame within 0.004 px of the cups the switch ships for SR 17 and SR
//     23, the same through the world with `from` and `to` separately, NSS's green boxes within 0.05 px of the new
//     truth's, srScaleRatio the new yd/px over the old; no other hole's points move
//  3. srMigrate on a synthetic NSS-numbered store: holesMeta re-keyed (the old 19, 20, 21 slots empty, the player's pins
//     and markers kept, a pipeline curPin and the auto markers' ids moved, the blocked rules' hole, the par SR's, an
//     unedited NSS 20 note replaced and an edited one kept), shots', putts' and rounds' hole numbers (and the active
//     round's), a shot's pos of hole 17 or 20 through the frame change, nothing else touched; the input unmodified,
//     the second pass the same object, a store with a hole past 21 only flagged, JSON in and out
//  4. srFrameFix: SR 17's and SR 23's own markers, pins, green box and outline and scale in SR's frame, the auto
//     markers dropped, every other hole the same object
//  5. through src/derivedMerge.js on public/derived.json: a migrated hole 24, 25 and 23 keeps its curPin on the same
//     cup and the player's pin; a stored NSS 17 / 20 pin at an old cup lands on that cup of SR's
//   node tools/test-sr-migrate.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const M = await import(pathToFileURL(join(root, "src/srMigrate.js")).href);
const { applyDerivedHole, isPipelinePin } = await import(pathToFileURL(join(root, "src/derivedMerge.js")).href);
const J = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL:", msg); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (o) => JSON.parse(JSON.stringify(o));
const W = 250, H = 304;
const px = (a, b) => Math.hypot((a[0] - b[0]) * W, (a[1] - b[1]) * H);

// ---- 1. the numbering ----
ok(M.SR_HOLES === 27, `SR_HOLES ${M.SR_HOLES}`);
ok(eq(M.SR_OF_NSS, { 19: 24, 20: 23, 21: 25 }) && eq(M.NSS_OF_SR, { 24: 19, 23: 20, 25: 21 }), "SR_OF_NSS / NSS_OF_SR");
for (const [n, s] of Object.entries(M.SR_OF_NSS)) ok(M.NSS_OF_SR[s] === +n && M.srHoleOf(+n) === s && M.nssHoleOf(s) === +n, `NSS ${n} <-> SR ${s}`);
const mapped = Array.from({ length: 21 }, (_, i) => M.srHoleOf(i + 1));
ok(new Set(mapped).size === 21 && eq(mapped.slice(0, 18), Array.from({ length: 18 }, (_, i) => i + 1)) && eq(mapped.slice(18), [24, 23, 25]), `NSS 1-21 -> SR ${mapped}`);
for (const n of [19, 20, 21, 22, 26, 27]) ok(M.nssHoleOf(n) === null, `SR ${n} is a new hole, no NSS number`);
for (let n = 1; n <= 18; n++) ok(M.nssHoleOf(n) === n && M.srHoleOf(n) === n, `H${n} keeps its number`);
const NP = J("tools/nss-pins.json").holes;
ok(Object.keys(NP).length === 27, `tools/nss-pins.json has ${Object.keys(NP).length} holes, not 27`);
for (let n = 1; n <= 27; n++) ok(M.SR_PARS[n] === NP[n]?.par && [3, 4, 5].includes(M.SR_PARS[n]), `H${n}: SR_PARS ${M.SR_PARS[n]}, tools/nss-pins.json ${NP[n]?.par}`);
ok(eq(Object.values(M.SR_PARS), [4, 3, 5, 3, 5, 4, 4, 3, 5, 4, 3, 5, 3, 5, 4, 4, 3, 5, 4, 3, 5, 3, 5, 4, 4, 3, 5]), "the 27 pars, as the game's hole select lists them");

// ---- 2. the frame change ----
const REG = J("tools/nss-registration.json").holes, TRUTH = J("tools/nss-truth.json").holes;
// NSS's own frame, as the repo held it at 4aa70b3: the six cups' map points of NSS 17 and NSS 20 (SR 23), the green boxes
// and the scales (yd per map px) of nss-truth.json
const OLD = {
  17: { cups: [[0.57021, 0.24988], [0.54698, 0.22399], [0.52978, 0.23377], [0.51671, 0.25441], [0.58726, 0.23557], [0.57564, 0.26852]], box: { x0: 0.485, y0: 0.1944, x1: 0.617, y1: 0.2974 }, scale: 1.139405 },
  23: { cups: [[0.62253, 0.15257], [0.63848, 0.18638], [0.60755, 0.16465], [0.64278, 0.16356], [0.62967, 0.17783], [0.65752, 0.1647]], box: { x0: 0.5884, y0: 0.1374, x1: 0.6735, y1: 0.1999 }, scale: 1.497233 },
};
ok(eq(Object.keys(M.FRAME_CHANGE), ["17", "23"]), `FRAME_CHANGE holes ${Object.keys(M.FRAME_CHANGE)}`);
for (const n of [17, 23]) {
  const f = M.FRAME_CHANGE[n], r = REG[n], to = f.to;
  ok(["a", "b", "tx", "ty"].every((k) => to[k] === r[k]), `H${n}: FRAME_CHANGE.to ${JSON.stringify(to)} is not tools/nss-registration.json's ${JSON.stringify({ a: r.a, b: r.b, tx: r.tx, ty: r.ty })}`);
  let worst = 0, worstWorld = 0;
  const cups = NP[n].cups;
  OLD[n].cups.forEach((c, k) => {
    const got = M.toSrFrame(n, c[0], c[1]), want = [cups[k].x, cups[k].y];
    worst = Math.max(worst, px(got, want));
    // and through the world, the two fits separately: the old fit's inverse of the old point is the cup's world point,
    // the new fit's forward of it the new point
    const [wx, , wz] = cups[k].world, o = f.from, det = o.a * o.a + o.b * o.b, u = c[0] * W - o.tx, v = c[1] * H - o.ty;
    const ox = (o.a * u + o.b * v) / det, oz = (-o.b * u + o.a * v) / det;
    worstWorld = Math.max(worstWorld, Math.hypot(ox - wx, oz - wz) / 0.9144);
    const nx = (to.a * wx - to.b * wz + to.tx) / W, ny = (to.b * wx + to.a * wz + to.ty) / H;
    worst = Math.max(worst, px([nx, ny], want));
  });
  ok(worst <= 0.004, `H${n}: NSS's cups through the frame change land ${worst.toFixed(4)} px from SR's (at most 0.004)`);
  ok(worstWorld <= 0.01, `H${n}: the old fit puts NSS's cup map points ${worstWorld.toFixed(4)} yd from the cups' world points (at most 0.01)`);
  const b = OLD[n].box, [x0, y0] = M.toSrFrame(n, b.x0, b.y0), [x1, y1] = M.toSrFrame(n, b.x1, b.y1), nb = TRUTH[n].greenBox;
  const bd = Math.max(...[[x0, nb.x0, W], [y0, nb.y0, H], [x1, nb.x1, W], [y1, nb.y1, H]].map(([p, q, s]) => Math.abs(p - q) * s));
  ok(bd <= 0.05, `H${n}: NSS's green box through the frame change ${bd.toFixed(3)} px from SR's truth (at most 0.05)`);
  ok(Math.abs(OLD[n].scale * M.srScaleRatio(n) - TRUTH[n].scale) <= 2e-4 * TRUTH[n].scale + 1e-5, `H${n}: scale ${OLD[n].scale} x ${M.srScaleRatio(n).toFixed(5)} = ${(OLD[n].scale * M.srScaleRatio(n)).toFixed(5)}, truth ${TRUTH[n].scale}`);
}
for (let n = 1; n <= 27; n++) if (n !== 17 && n !== 23) ok(eq(M.toSrFrame(n, 0.31, 0.77), [0.31, 0.77]) && M.srScaleRatio(n) === 1, `H${n}: a frame that did not change moved a point`);
console.log(`frames: SR 17 and SR 23 through the world, NSS's cups within the checks above`);

// ---- 3. srMigrate on a synthetic NSS-numbered store ----
const NOTES = { 23: "SR 23's own default note" };
const NSS20_NOTE = "Driver 3.5\u20134.0 up the fairway. Risky line between the tree and rock wall gives a cleaner stroke 2.";
const MINE_PIN = (n) => ({ id: 1700000000100 + n, x: 0.4 + n / 1000, y: 0.2 });
const MINE_MARKER = (n) => ({ id: 1700000000000 + n, x: 0.5 - n / 1000, y: 0.5 });
const hole = (n) => ({
  par: 9, note: `note ${n}`, blocked: [{ id: 10 + n, hole: n, stroke: 1, club: "driver", aim: 2, note: "trees" }],
  markers: [{ id: `t${n}-0`, x: 0.3, y: 0.3, r: 0.02, auto: true }, { id: n * 1000, x: 0.1, y: 0.1, auto: true }, MINE_MARKER(n)],
  scale: 1.5 + n / 100, green: { box: { x0: 0.4, y0: 0.2, x1: 0.5, y1: 0.3 }, poly: [[0.4, 0.2], [0.5, 0.2], [0.5, 0.3]], grid: [[[0, 0]]], src: `nss-${n}` },
  pins: [{ id: `d${n}-c0`, k: 0, x: 0.45, y: 0.25, src: "nss" }, { id: `d${n}-c3`, k: 3, x: 0.46, y: 0.26, src: "nss" }, MINE_PIN(n)], curPin: `d${n}-c3`,
  tee: { x: 0.5, y: 0.9 }, platform: { facingDeg: 12 },
});
const store = () => {
  const holesMeta = {};
  for (let n = 1; n <= 21; n++) holesMeta[n] = hole(n);
  holesMeta[20].note = NSS20_NOTE; holesMeta[19].note = "an edited note"; holesMeta[17].par = 3;
  return {
    clubs: [{ id: "driver" }], greenSpeed: 20.13, mapScale: 3, online: { on: false }, parFixV3: true, mapV5: true, derivedV1: true,
    holesMeta,
    shots: [{ id: 1, hole: 19, stroke: 1 }, { id: 2, hole: 20, stroke: 2, pos: { x: OLD[23].cups[0][0], y: OLD[23].cups[0][1] }, bearing: 10 }, { id: 3, hole: 21 }, { id: 4, hole: 17, pos: { x: OLD[17].cups[2][0], y: OLD[17].cups[2][1] } }, { id: 5, hole: 5, pos: { x: 0.3, y: 0.3 } }, { id: 6, hole: 0 }, { id: 7 }],
    putts: [{ id: 21, hole: 19, bars: 2, rolled: 10 }, { id: 22, hole: 21, bars: 2, rolled: 10 }, { id: 23, hole: 7, bars: 2, rolled: 10 }],
    rounds: [{ id: 31, date: "2026-10-01", scores: { 1: 4, 19: 5, 20: 4, 21: 3 } }, { id: 32, date: "2026-10-02", scores: { 18: 5 } }],
    activeRound: { id: 33, date: "2026-11-03", scores: { 21: 4, 2: 3 } },
  };
};
const before = store(), snapshot = JSON.stringify(before);
const out = M.srMigrate(before, { notes: NOTES });
ok(JSON.stringify(before) === snapshot, "srMigrate modified its input");
ok(out !== before && out.srHolesV1 === true && !("srHolesV1" in before), "the flag");
ok(["clubs", "greenSpeed", "mapScale", "online", "parFixV3", "mapV5", "derivedV1"].every((k) => eq(out[k], before[k])), "the other root keys as stored");
const hm = out.holesMeta;
ok(Object.keys(hm).map(Number).sort((a, b) => a - b).join() === [...Array.from({ length: 18 }, (_, i) => i + 1), 23, 24, 25].join(), `holesMeta keys ${Object.keys(hm)}`);
for (const n of [19, 20, 21, 22, 26, 27]) ok(hm[n] === undefined, `H${n}: the new hole has stored state ${JSON.stringify(hm[n])}`);
for (let n = 1; n <= 18; n++) ok(eq(hm[n], before.holesMeta[n]) && hm[n] === before.holesMeta[n], `H${n}: a hole that keeps its number was touched`);
for (const [from, to] of [[19, 24], [20, 23], [21, 25]]) {
  const h = hm[to], o = before.holesMeta[from], tag = `NSS ${from} -> SR ${to}`;
  ok(h, `${tag}: no hole`); if (!h) continue;
  ok(h.par === M.SR_PARS[to], `${tag}: par ${h.par}, SR's ${M.SR_PARS[to]}`);
  ok(h.blocked.length === 1 && h.blocked[0].hole === to && h.blocked[0].id === o.blocked[0].id && h.blocked[0].club === "driver", `${tag}: blocked ${JSON.stringify(h.blocked)}`);
  ok(h.markers.length === 3 && h.markers[0].id === `t${to}-0` && h.markers[0].auto === true && h.markers[1].id === o.markers[1].id && eq(h.markers[2], MINE_MARKER(from)), `${tag}: markers ${JSON.stringify(h.markers.map((m) => m.id))}`);
  ok(eq(h.pins.map((p) => p.id), [`d${to}-c0`, `d${to}-c3`, MINE_PIN(from).id]) && eq(h.pins[2], MINE_PIN(from)) && h.curPin === `d${to}-c3`, `${tag}: pins ${JSON.stringify(h.pins.map((p) => p.id))} curPin ${h.curPin}`);
  ok(h.scale === o.scale && eq(h.green, o.green) && eq(h.tee, o.tee), `${tag}: scale, green or tee changed (the frame change is srFrameFix's)`);
}
ok(hm[23].note === NOTES[23], `SR 23 note: ${hm[23].note} (an unedited NSS 20 note takes SR 23's)`);
ok(hm[24].note === "an edited note" && hm[25].note === "note 21", "an edited note, and any other, kept");
ok(hm[17].par === 3, "a par on a kept hole is as stored");
{
  const w = M.srMigrate({ holesMeta: { 20: { ...hole(20), note: "mine" }, 5: hole(5) } }, {});
  ok(w.holesMeta[23].note === "mine" && w.holesMeta[23].par === 5, "an edited NSS 20 note kept");
  const wo = M.srMigrate({ holesMeta: { 20: { ...hole(20), note: NSS20_NOTE } } });
  ok(wo.holesMeta[23].note === NSS20_NOTE, "without a notes table the note stays");
}
// shots, putts, rounds
ok(eq(out.shots.map((s) => s.hole), [24, 23, 25, 17, 5, 0, undefined]) && out.shots[6].hole === undefined && !("hole" in out.shots[6]), `shot holes ${JSON.stringify(out.shots.map((s) => s.hole))}`);
ok(eq(out.shots.map((s) => s.id), [1, 2, 3, 4, 5, 6, 7]) && out.shots[1].bearing === 10 && out.shots[0].stroke === 1, "shots otherwise as stored");
{
  const a = out.shots[1].pos, b = out.shots[3].pos, wantA = [NP[23].cups[0].x, NP[23].cups[0].y], wantB = [NP[17].cups[2].x, NP[17].cups[2].y];
  ok(px([a.x, a.y], wantA) <= 0.004, `a shot's pos at NSS 20's c0 -> ${px([a.x, a.y], wantA).toFixed(4)} px from SR 23's c0`);
  ok(px([b.x, b.y], wantB) <= 0.004, `a shot's pos at NSS 17's c2 -> ${px([b.x, b.y], wantB).toFixed(4)} px from SR 17's c2`);
  ok(eq(out.shots[4].pos, { x: 0.3, y: 0.3 }) && out.shots[4] === before.shots[4], "a shot on another hole moved");
}
ok(eq(out.putts.map((p) => p.hole), [24, 25, 7]) && eq(out.putts.map((p) => p.rolled), [10, 10, 10]), `putt holes ${JSON.stringify(out.putts.map((p) => p.hole))}`);
ok(eq(out.rounds[0].scores, { 1: 4, 23: 4, 24: 5, 25: 3 }) && eq(out.rounds[1].scores, { 18: 5 }) && out.rounds[0].date === "2026-10-01", `round scores ${JSON.stringify(out.rounds.map((r) => r.scores))}`);
ok(eq(out.activeRound.scores, { 2: 3, 25: 4 }) && out.activeRound.id === 33, `active round ${JSON.stringify(out.activeRound)}`);
// the second pass, a store already past 21, JSON
ok(M.srMigrate(out, { notes: NOTES }) === out, "a second pass changed the object");
{
  const raced = { holesMeta: { 1: hole(1), 24: hole(24), 23: hole(23) }, shots: [{ id: 1, hole: 24 }] };
  const f = M.srMigrate(raced);
  ok(f.srHolesV1 === true && f.holesMeta === raced.holesMeta && f.shots === raced.shots && !("srHolesV1" in raced), "a store with a hole past 21 is only flagged");
  ok(M.srMigrate(null) === null && M.srMigrate(undefined) === undefined && eq(M.srMigrate({}), { srHolesV1: true }) && eq(M.srMigrate({ shots: "x" }), { shots: "x", srHolesV1: true }), "no store, an empty one, a malformed shots key");
  ok(eq(M.srMigrate({ holesMeta: { 19: null, 20: "x" } }).holesMeta, { 23: "x" }), "a malformed hole is kept, an empty one dropped");
}
ok(eq(JSON.parse(JSON.stringify(out)), out), "the migrated store survives JSON");

// ---- 4. srFrameFix ----
{
  const own = (n, c) => ({ pin: { id: 1700000000200 + n, x: OLD[n].cups[c][0], y: OLD[n].cups[c][1] }, marker: { id: 1700000000300 + n, x: OLD[n].cups[(c + 1) % 6][0], y: OLD[n].cups[(c + 1) % 6][1] } });
  const hm0 = {};
  for (let n = 1; n <= 27; n++) hm0[n] = { par: 4, note: "", blocked: [], markers: [{ id: `t${n}-0`, x: 0.3, y: 0.3, r: 0.02, auto: true }], scale: 1.2, green: { box: { x0: 0.4, y0: 0.2, x1: 0.5, y1: 0.3 }, poly: [[0.4, 0.2]], src: "nss-x" }, pins: [], curPin: null };
  for (const n of [17, 23]) {
    const { pin, marker } = own(n, 1);
    hm0[n] = { ...hm0[n], scale: OLD[n].scale, green: { box: { ...OLD[n].box }, poly: [[OLD[n].box.x0, OLD[n].box.y0], [OLD[n].box.x1, OLD[n].box.y1]], grid: [[[1, 0]]], gridEdited: true, src: "nss-old" },
      markers: [{ id: `t${n}-0`, x: 0.3, y: 0.3, r: 0.02, auto: true }, { id: n * 1000, x: 0.1, y: 0.1, auto: true }, marker],
      pins: [{ id: `d${n}-c1`, k: 1, x: OLD[n].cups[1][0], y: OLD[n].cups[1][1], src: "nss" }, pin], curPin: `d${n}-c1` };
  }
  const snap = JSON.stringify(hm0), fx = M.srFrameFix(hm0);
  ok(JSON.stringify(hm0) === snap && fx !== hm0, "srFrameFix modified its input or returned it");
  for (let n = 1; n <= 27; n++) if (n !== 17 && n !== 23) ok(fx[n] === hm0[n], `H${n}: a hole whose frame did not change came back as another object`);
  for (const n of [17, 23]) {
    const h = fx[n], want = [NP[n].cups[1].x, NP[n].cups[1].y];
    ok(h.markers.length === 1 && h.markers[0].id === 1700000000300 + n && !h.markers.some((m) => m.auto), `H${n}: markers ${JSON.stringify(h.markers.map((m) => m.id))}`);
    const wantM = [NP[n].cups[2].x, NP[n].cups[2].y];
    ok(px([h.markers[0].x, h.markers[0].y], wantM) <= 0.004, `H${n}: the player's marker at NSS's c2 -> ${px([h.markers[0].x, h.markers[0].y], wantM).toFixed(4)} px from SR's c2`);
    ok(h.pins.length === 2 && h.pins.every((p) => px([p.x, p.y], want) <= 0.004) && h.pins[0].id === `d${n}-c1` && h.pins[1].id === 1700000000200 + n && h.curPin === `d${n}-c1`, `H${n}: pins ${JSON.stringify(h.pins)}`);
    ok(h.pins[0].k === 1 && h.pins[0].src === "nss" && h.pins[1].x !== hm0[n].pins[1].x, `H${n}: a pin's other fields`);
    const nb = TRUTH[n].greenBox, g = h.green;
    ok(Math.max(Math.abs(g.box.x0 - nb.x0) * W, Math.abs(g.box.y0 - nb.y0) * H, Math.abs(g.box.x1 - nb.x1) * W, Math.abs(g.box.y1 - nb.y1) * H) <= 0.05, `H${n}: the green box ${JSON.stringify(g.box)} against SR's truth ${JSON.stringify(nb)}`);
    ok(g.poly.length === 2 && eq(g.poly[0], [g.box.x0, g.box.y0]) && eq(g.poly[1], [g.box.x1, g.box.y1]), `H${n}: the outline moved with the box`);
    ok(g.src === "nss-old" && g.gridEdited === true && eq(g.grid, [[[1, 0]]]), `H${n}: the green's marker and grid are derived.json's merge to replace, not this step's`);
    ok(Math.abs(h.scale - TRUTH[n].scale) <= 2e-4 * TRUTH[n].scale + 1e-5, `H${n}: scale ${h.scale}, SR's ${TRUTH[n].scale}`);
  }
  ok(M.srFrameFix(null) === null && M.srFrameFix(undefined) === undefined && eq(M.srFrameFix({}), {}) && eq(M.srFrameFix({ 17: null }), { 17: null }), "no state, an empty one, a missing hole");
  const bare = M.srFrameFix({ 17: { par: 3, markers: undefined, pins: undefined, scale: null, green: undefined } });
  ok(eq(bare[17].markers, []) && eq(bare[17].pins, []) && bare[17].scale === null && bare[17].green === undefined, "a hole with nothing stored");
}

// ---- 5. through derived.json's merge ----
{
  const DER = J("public/derived.json").holes;
  const emptyGreen = () => ({ box: null, grid: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [0, 0])) });
  const merge = (h, n, d) => applyDerivedHole({ ...clone(h), green: { ...clone(h.green ?? emptyGreen()) } }, n, d, { fresh: false });
  let n5 = 0;
  for (const [from, to] of [[19, 24], [20, 23], [21, 25]]) {
    const d = DER[to];
    if (!d?.pins?.length) { console.log(`5. public/derived.json has no pins for SR ${to}: skipped`); continue; }
    const m = M.srFrameFix(M.srMigrate({ holesMeta: { [from]: hole(from) } }).holesMeta)[to];
    const merged = merge(m, to, d);
    const mineP = merged.pins.filter((p) => !isPipelinePin(p)), wantP = MINE_PIN(from), [qx, qy] = M.toSrFrame(to, wantP.x, wantP.y);
    ok(merged.curPin === `d${to}-c3` && merged.pins.filter(isPipelinePin).length === 6 && mineP.length === 1 && mineP[0].id === wantP.id && Math.abs(mineP[0].x - qx) < 1e-12 && Math.abs(mineP[0].y - qy) < 1e-12, `NSS ${from} -> SR ${to}: curPin ${merged.curPin}, ${merged.pins.length} pins, the player's pin ${JSON.stringify(mineP)}`);
    ok(merged.par === M.SR_PARS[to], `SR ${to}: par ${merged.par}`);
    // the player's marker survives (a frame-changed hole's through the frame change), the auto trees are derived.json's
    const mine = merged.markers.filter((q) => !q.auto);
    ok(mine.length === 1 && mine[0].id === MINE_MARKER(from).id, `SR ${to}: the player's marker ${JSON.stringify(mine)}`);
    ok(merged.markers.filter((q) => q.auto).length === (d.trees?.length ?? 0), `SR ${to}: ${merged.markers.filter((q) => q.auto).length} auto markers, derived.json ships ${d.trees?.length}`);
    n5++;
  }
  for (const n of [17, 23]) {
    const d = DER[n], k = 2;
    if (!d?.pins?.length) { console.log(`5. public/derived.json has no pins for SR ${n}: skipped`); continue; }
    const h = { ...hole(n === 23 ? 20 : n), pins: [{ id: 1700000000200 + n, x: OLD[n].cups[k][0], y: OLD[n].cups[k][1] }], curPin: 1700000000200 + n, markers: [], green: { ...emptyGreen(), box: OLD[n].box, src: "nss-old" } };
    const stored = M.srFrameFix(n === 23 ? M.srMigrate({ holesMeta: { 20: h } }).holesMeta : { 17: h })[n];
    const merged = merge(stored, n, d);
    const own = merged.pins.find((p) => p.id === 1700000000200 + n), cup = d.pins.find((p) => p.id === `c${k}`);
    ok(own && cup && px([own.x, own.y], [cup.x, cup.y]) <= 0.004, `SR ${n}: the player's pin at NSS's c${k} is ${own && cup ? px([own.x, own.y], [cup.x, cup.y]).toFixed(4) : "?"} px from SR's cup`);
    ok(merged.curPin === 1700000000200 + n && eq(merged.green.box, d.greenBox) && merged.scale === d.scale && merged.green.src === d.rev, `SR ${n}: derived.json's geometry applies once over the moved green (src ${merged.green.src})`);
    n5++;
  }
  console.log(`5. ${n5} stored holes (SR 17, 23, 24, 25) through the merge on public/derived.json`);
}
// ---- 6. srNeedsMove and srRow (the guard App.jsx gates the pre-sr backup and srFrameFix on; the Log import's renumbering) ----
{
  const nss = store();
  ok(M.srNeedsMove(nss) === true, "srNeedsMove: an NSS-numbered store moves");
  ok(M.srNeedsMove(M.srMigrate(nss, { notes: NOTES })) === false, "srNeedsMove: a migrated (flagged) store does not");
  ok(M.srNeedsMove({ ...nss, srHolesV1: true }) === false, "srNeedsMove: a flagged store does not");
  const raced = { ...nss, holesMeta: { ...nss.holesMeta, 24: hole(24) } };   // (a store this build wrote whose flag a racing write dropped)
  ok(M.srNeedsMove(raced) === false, "srNeedsMove: a flagless store already holding a hole past 21 does not move");
  const flagged = M.srMigrate(raced);
  ok(flagged.srHolesV1 === true && flagged.holesMeta === raced.holesMeta && flagged.shots === raced.shots, "srMigrate only flags such a store, its holes and rows untouched");
  ok(M.srNeedsMove(null) === false && M.srNeedsMove(undefined) === false && M.srNeedsMove("x") === false && M.srNeedsMove({}) === true, "srNeedsMove: nothing does not move; an empty flagless store does (trivially: its rows, if any, need the numbers)");
  // srRow: a shot row's hole and, on 17 / 20, its pos; a putt row's hole only
  const s20 = { id: 2, hole: 20, pos: { x: OLD[23].cups[0][0], y: OLD[23].cups[0][1] }, bearing: 10 }, r20 = M.srRow(s20, true);
  ok(r20.hole === 23 && r20 !== s20 && px([r20.pos.x, r20.pos.y], [NP[23].cups[0].x, NP[23].cups[0].y]) <= 0.004 && r20.bearing === 10 && s20.hole === 20, "srRow: a hole 20 shot row to SR 23, its pos through the frame change");
  const s17 = { id: 4, hole: 17, pos: { x: OLD[17].cups[2][0], y: OLD[17].cups[2][1] } };
  ok(M.srRow(s17, true).hole === 17 && px([M.srRow(s17, true).pos.x, M.srRow(s17, true).pos.y], [NP[17].cups[2].x, NP[17].cups[2].y]) <= 0.004 && M.srRow(s17, false) === s17, "srRow: a hole 17 row keeps its number; its pos moves with posToo only");
  ok(M.srRow({ id: 1, hole: 19 }, true).hole === 24 && M.srRow({ id: 3, hole: 21 }, false).hole === 25 && M.srRow({ id: 8, hole: "20" }, false).hole === 23, "srRow: 19 -> 24, 21 -> 25, a numeric string 20 -> 23");
  const s5 = { id: 5, hole: 5, pos: { x: 0.3, y: 0.3 } }, s0 = { id: 6, hole: 0 }, sn = { id: 7 };
  ok(M.srRow(s5, true) === s5 && M.srRow(s0, true) === s0 && M.srRow(sn, true) === sn && M.srRow(null, true) === null, "srRow: an unmoved row is the same object");
  console.log("6. srNeedsMove and srRow");
}
// ---- 7. srBackupOnce against src/storage.js's semantics (get throws on a missing key) and against a get that gives null ----
{
  const shim = (throwing) => { const m = new Map(); return { m, async get(k) { if (!m.has(k)) { if (throwing) throw new Error("key not found: " + k); return null; } return { key: k, value: m.get(k) }; }, async set(k, v) { m.set(k, v); return { key: k, value: v }; } }; };
  for (const throwing of [true, false]) {
    const st = shim(throwing), tag = throwing ? "a get that throws on a missing key" : "a get that gives null";
    ok(await M.srBackupOnce(st, "k", "{\"old\":1}") === true && st.m.get("k.pre-sr") === "{\"old\":1}", `srBackupOnce writes the copy (${tag})`);
    ok(await M.srBackupOnce(st, "k", "{\"newer\":2}") === false && st.m.get("k.pre-sr") === "{\"old\":1}", `srBackupOnce never writes over an earlier copy (${tag})`);
    ok(await M.srBackupOnce(st, "other", 42) === false && !st.m.has("other.pre-sr"), `srBackupOnce takes only a string (${tag})`);
  }
  const full = { async get() { throw new Error("key not found"); }, async set() { throw new Error("QuotaExceededError"); } };
  ok(await M.srBackupOnce(full, "k", "{}") === false, "srBackupOnce: a quota failure is swallowed");
  ok(await M.srBackupOnce(null, "k", "{}") === false, "srBackupOnce: no storage, no write");
  console.log("7. srBackupOnce written once, never over an earlier copy");
}
console.log(fails ? `${fails} of ${checks} checks FAILED` : `all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
