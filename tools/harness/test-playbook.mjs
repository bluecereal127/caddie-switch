// Offline checks of playbook.mjs and of its use in round-play.mjs (no Dolphin,
// nothing written under tools/harness: the reload checks work on copies in a
// temp directory, --tmp DIR or the OS temp).
// 1. the campaign's files: every solved stroke has its try, the chains hand
//    over exactly, the tees and pins agree with state/saves/pins/index.json;
//    why the playbook returns the REQUESTED heading (repeats of a request
//    against requests for a reached heading); where the pin-power assist can
//    make a replay differ;
// 2. lookups: every solved cup's tee state -> stroke 1 (club, power, heading);
//    every later stroke from the previous rest (round-play's plan made ahead)
//    and from its own start (the ready state) -> that stroke; 2 yd off, the
//    tolerance's edges, unsolved cups (h17-s3...), a set wind, another lie,
//    another pin -> null; the time per lookup;
// 3. reloading when a file changes (mtime and size), is truncated, removed or
//    added, and when the pins index changes;
// 4. round-play.mjs: its exports and playbookStroke (calm / natural / windy);
// --kcl: also the lie round-play's ahead plan reads off the KCL (lieAt) at
//    each later stroke's start against the game's lie there.
//   node tools/harness/test-playbook.mjs [--kcl] [--tmp DIR]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const PB = await import(pathToFileURL(path.join(HERE, "playbook.mjs")).href);
const DEG = Math.PI / 180, YD = 9.144;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const SOLVE = PB.SOLVE_DIR;
const CUPS = JSON.parse(fs.readFileSync(PB.PIN_INDEX, "utf8")).cups;
let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL ${m}`); };
const check = (ok, m) => { if (!ok) fail(m); return ok; };
const head = (m) => console.log(`\n== ${m}`);
const stOf = (pos, pin, lie, wind = { dir: 0, speedIdx: 0 }) => ({ ball: { pos, life: 0, moving: 0 }, pin, player: { lie }, wind });
const pct = (a, b) => `${a}/${b}`;

// ---- 1. the files ----
head("1. the campaign's files");
const results = fs.readdirSync(SOLVE).filter((f) => /^h\d\d-s\d+\.json$/.test(f)).map((f) => ({ cup: f.replace(".json", ""), r: JSON.parse(fs.readFileSync(path.join(SOLVE, f), "utf8")) }));
const solved = results.filter((x) => x.r.solved === true), unsolved = results.filter((x) => x.r.solved !== true);
console.log(`  ${results.length} result files: ${solved.length} solved, unsolved ${unsolved.map((x) => `${x.cup} (${x.r.tries?.length ?? 0} tries)`).join(", ") || "none"}`);
let chains = 0, chainExact = 0, teeExact = 0, toPinMax = 0, inCupMax = 0;
const strokesOf = new Map();
for (const { cup, r } of solved) {
  const c = CUPS[cup];
  if (!check(!!c, `${cup}: not in the pins index`)) continue;
  const rows = r.strokes.map((s) => r.tries.filter((t) => t.k === s.k && t.club === s.club && t.power === s.power && t.heading === s.heading && t.rest[0] === s.rest[0] && t.rest[2] === s.rest[2]));
  rows.forEach((m, i) => check(m.length === 1, `${cup} stroke ${r.strokes[i].k}: ${m.length} tries match it`));
  const st = rows.map((m, i) => ({ ...r.strokes[i], from: m[0]?.from, lie: m[0]?.lie, why: m[0]?.why }));
  strokesOf.set(cup, st);
  if (st[0].from[0] === c.tee.pos[0] && st[0].from[2] === c.tee.pos[2]) teeExact++; else fail(`${cup}: stroke 1 not struck from the index's tee`);
  for (let i = 1; i < st.length; i++) { chains++; if (st[i].from[0] === st[i - 1].rest[0] && st[i].from[2] === st[i - 1].rest[2]) chainExact++; }
  for (const t of r.tries) toPinMax = Math.max(toPinMax, Math.abs(Math.hypot(t.rest[0] - c.pinRam[0], t.rest[2] - c.pinRam[2]) / YD - t.toPin));
  const last = st[st.length - 1];
  check(last.holed, `${cup}: the last stroke is not holed`);
  inCupMax = Math.max(inCupMax, Math.hypot(last.rest[0] - c.pinRam[0], last.rest[2] - c.pinRam[2]));
}
console.log(`  stroke 1 struck from the index's tee: ${pct(teeExact, solved.length)}; chains whose next start is the last rest exactly in x, z: ${pct(chainExact, chains)}`);
console.log(`  every try's toPin against pinRam: max error ${toPinMax.toExponential(1)} yd (pinRam is the pin the campaign played); the holing strokes rest ${inCupMax.toFixed(2)} u from the pin at most (the cup's radius is 1.5)`);
check(chainExact === chains, "a chain does not hand over exactly");

// the heading: a repeated request against a request for a reached heading
let rep = 0, repSame = 0;
const nearBins = [[0, 0.002], [0.002, 0.005], [0.005, 0.01], [0.01, 0.03]].map(([lo, hi]) => ({ lo, hi, n: 0, same: 0 }));
for (const { r } of results) {
  const bySpot = new Map();
  for (const t of r.tries ?? []) { const key = `${t.from[0]},${t.from[2]}`; if (!bySpot.has(key)) bySpot.set(key, []); bySpot.get(key).push({ ...t, req: t.heading + t.aimErrDeg * DEG }); }
  for (const T of bySpot.values()) {
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) if (Math.abs(angDiff(T[i].req, T[j].req)) < 1e-9) { rep++; if (T[i].heading === T[j].heading) repSame++; }
    for (const b of T) {
      // the reached heading of another try (from this spot, by another request) nearest b's request
      let best = null;
      for (const a of T) if (a !== b && Math.abs(angDiff(a.req, b.req)) >= 1e-9) { const d = Math.abs(angDiff(b.req, a.heading)) / DEG; if (!best || d < best.d) best = { d, h: a.heading }; }
      const bin = best && nearBins.find((x) => best.d >= x.lo && best.d < x.hi);
      if (bin) { bin.n++; if (b.heading === best.h) bin.same++; }
    }
  }
}
console.log(`  the same requested heading from the same spot: ${pct(repSame, rep)} pairs reached the identical heading`);
console.log(`  a request near a heading another try reached from that spot: ${nearBins.map((x) => `within ${x.lo}-${x.hi} deg ${pct(x.same, x.n)} reached it`).join("; ")}`);
check(rep > 0 && repSame === rep, "a repeated request reached another heading");

// the assist (wsr-swing-redzone-spin.md 3.5, wsr-harness-decodes.md 1): on a
// partial swing (p2, here the power swung, below the lie's cap) it pulls p2
// toward the aim table's power p_pin when that power's simulated rest along
// the aim is within 300 u (32.8 yd) of the pin, by (1 - w) (p_pin - p2) with
// w = 1 (no pull) once |p2 - p_pin| >= 0.3. The table is built over frames
// at address from a reset (each D-pad turn frame or club change: power 0,
// then 1.0, 0.5, 0.25, 0.75, ...) and frozen at the first A-held frame, so
// p_pin is 0 (the ball unmoved: within reach when the pin is) or 1.0 early
// on, the power resting nearest the pin once complete; and it acts only if
// the state-1 window outlives the launch frame. A stroke is exposed when some
// table power can rest within 32.8 yd of the pin: along its aim, with the
// club's full-power flat stop (src/model.js's WSR numbers; the putter's 20.5
// yd flat roll at power 1.0) as the reach.
const BUNKER_CAP = { driver: 0.25, spoon: 0.25, "3iron": 0.5, "5iron": 0.5, "7iron": 0.5, "9iron": 0.5, wedge: 0.75, putter: 1 };
const capOf = (club, lie) => (club === "putter" ? 1 : lie === 2 ? 0.75 : lie === 3 || lie === 16 ? BUNKER_CAP[club] : 1);
const REACH = { driver: 278.8, spoon: 252.6, "3iron": 211.7, "5iron": 175.6, "7iron": 145.8, "9iron": 109.5, wedge: 60.0, putter: 20.5 };
const R_ASSIST = 300 / YD;
const SET_B = (cup) => { const c = CUPS[cup]; return c.hole === 1 || c.hole === 18 || (c.sets ?? []).includes(1); };
const ex = { full: 0, far: 0, exposed: 0, exposedB: [], early0: 0, early1: 0, assisted: [] };
for (const [cup, st] of strokesOf) for (const s of st) {
  const pin = CUPS[cup].pinRam, cap = capOf(s.club, s.lie);
  const D = Math.hypot(pin[0] - s.from[0], pin[2] - s.from[2]) / YD;
  const th = angDiff(Math.atan2(pin[0] - s.from[0], pin[2] - s.from[2]), s.heading + s.aimErrDeg * DEG);
  const along = D * Math.cos(th), lateral = Math.abs(D * Math.sin(th));
  const floor = s.club === "putter" && s.power < 0.05 && Math.abs(s.gamePower - 0.05) < 1e-6;
  if (Math.abs(s.gamePower - s.power) > 0.001 && !floor) ex.assisted.push(`${cup}.${s.k} ${s.club} ${s.power.toFixed(4)} -> ${s.gamePower.toFixed(4)}`);
  if (s.power >= cap - 1e-9) { ex.full++; continue; }
  const reach = lateral <= R_ASSIST && (D <= R_ASSIST || REACH[s.club] >= along - Math.sqrt(R_ASSIST ** 2 - lateral ** 2));
  if (!reach) { ex.far++; continue; }
  ex.exposed++;
  if (D <= R_ASSIST && s.power < 0.3) ex.early0++;                                                     // an early table's p_pin 0 pulls it
  if (s.power > 0.7 && Math.abs(REACH[s.club] - along) <= R_ASSIST) ex.early1++;                       // an early table's p_pin 1.0 pulls it
  if (SET_B(cup)) ex.exposedB.push(`${cup}.${s.k} ${s.club} ${s.power.toFixed(3)} (${D.toFixed(0)} yd)`);
}
console.log(`  solved strokes the assist cannot touch: ${ex.full} at or above the lie's cap, ${ex.far} partial with no table power resting within 32.8 yd of the pin; exposed: ${ex.exposed} partial strokes (${ex.early0} that an early table's p_pin 0 pulls, ${ex.early1} that its p_pin 1.0 pulls, every one by a complete table's p_pin unless it is the power swung)`);
console.log(`  the campaign launched every solved stroke as swung (within the raw curve's 0.0002; a putt under 0.05 at the putter's floor) but ${ex.assisted.join(", ") || "none"}`);
console.log(`  exposed strokes of the cups a 3-hole round draws (set B, hole 1, hole 18): ${ex.exposedB.length}: ${ex.exposedB.join("; ")}`);

// ---- 2. lookups ----
head("2. lookups");
PB.refresh();   // warm
let ok1 = 0, okK = 0, nK = 0, off2 = 0, off2n = 0, edgeIn = 0, edgeOut = 0, edgeN = 0;
const t0 = performance.now();
for (const { cup } of solved) {
  const c = CUPS[cup], st = strokesOf.get(cup), s1 = st[0];
  const r = PB.lookup(c.hole, stOf(c.tee.pos, c.pinRam, s1.lie));
  const wantHeading = s1.heading + s1.aimErrDeg * DEG;
  if (check(r && r.cup === cup && r.k === 1 && r.club === s1.club && r.power === s1.power && Math.abs(r.heading - wantHeading) < 1e-12 && r.reached === s1.heading && r.why.startsWith(`[playbook ${cup} 1]`), `${cup}: the tee lookup gave ${r ? `${r.cup} ${r.k} ${r.club} ${r.power} ${r.heading}` : "null"}`)) ok1++;
  for (let i = 1; i < st.length; i++) {
    const s = st[i];
    for (const [view, pos] of [["ahead", st[i - 1].rest], ["ready", s.from]]) {
      nK++;
      const q = PB.lookup(c.hole, stOf(pos, c.pinRam, s.lie));
      if (check(q && q.cup === cup && q.k === s.k && q.club === s.club && q.power === s.power && Math.abs(q.heading - (s.heading + s.aimErrDeg * DEG)) < 1e-12, `${cup} stroke ${s.k} (${view}): ${q ? `${q.cup} ${q.k}` : "null"}`)) okK++;
    }
  }
  // 2 yd off in eight directions, from every stroke's start
  for (const s of st) for (let a = 0; a < 8; a++) {
    off2n++;
    const p = [s.from[0] + 2 * YD * Math.sin((a * Math.PI) / 4), s.from[1], s.from[2] + 2 * YD * Math.cos((a * Math.PI) / 4)];
    if (PB.lookup(c.hole, stOf(p, c.pinRam, s.lie)) === null) off2++;
  }
  // the tolerance's edges
  for (const s of st) {
    edgeN++;
    if (PB.lookup(c.hole, stOf([s.from[0] + 0.5 * PB.POS_TOL, s.from[1], s.from[2]], c.pinRam, s.lie))?.k === s.k) edgeIn++;
    if (PB.lookup(c.hole, stOf([s.from[0], s.from[1], s.from[2] - 2 * PB.POS_TOL], c.pinRam, s.lie)) === null) edgeOut++;
  }
}
const tLook = performance.now() - t0;
console.log(`  tee state -> stroke 1 (club, power, requested heading, why): ${pct(ok1, solved.length)}`);
console.log(`  later strokes from the last rest (the plan made ahead) and from their start (at ready): ${pct(okK, nK)}`);
console.log(`  2 yd off the start (8 directions per stroke): null ${pct(off2, off2n)}; ${PB.POS_TOL / 2} u off: found ${pct(edgeIn, edgeN)}; ${2 * PB.POS_TOL} u off: null ${pct(edgeOut, edgeN)}`);
check(ok1 === solved.length && okK === nK && off2 === off2n && edgeIn === edgeN && edgeOut === edgeN, "a lookup above");

// unsolved cups, every cup without a solution, a set wind, another lie, another pin
const noSol = Object.keys(CUPS).filter((cup) => !solved.some((x) => x.cup === cup));
let noSolNull = 0;
for (const cup of noSol) { const c = CUPS[cup]; if (PB.lookup(c.hole, stOf(c.tee.pos, c.pinRam, 15)) === null) noSolNull++; else fail(`${cup} (unsolved) gave a stroke`); }
const h173 = CUPS["h17-s3"];
const r173 = PB.lookup(17, stOf(h173.tee.pos, h173.pinRam, 15));
console.log(`  h17-s3 (unsolved; its tee is the solved s0-s2's tee): ${r173 === null ? "null" : `a stroke (${r173.cup})`}; every index cup without a solution (${noSol.length}: ${noSol.join(" ")}): null ${pct(noSolNull, noSol.length)}`);
check(r173 === null, "h17-s3 gave a stroke");
const c10 = CUPS["h10-s0"], s10 = strokesOf.get("h10-s0")[0];
const windy = PB.lookup(10, stOf(c10.tee.pos, c10.pinRam, 15, { dir: 2, speedIdx: 5 }));
const calmDir = PB.lookup(10, stOf(c10.tee.pos, c10.pinRam, 15, { dir: 6, speedIdx: 0 }));
const noWind = PB.lookup(10, { ...stOf(c10.tee.pos, c10.pinRam, 15), wind: undefined });
const lie2 = PB.lookup(10, stOf(c10.tee.pos, c10.pinRam, 2));
const pinOff = PB.lookup(10, stOf(c10.tee.pos, [c10.pinRam[0] + 2, c10.pinRam[1], c10.pinRam[2]], 15));
const pinNear = PB.lookup(10, stOf(c10.tee.pos, [c10.pinRam[0] + 0.6, c10.pinRam[1], c10.pinRam[2] + 0.6], 15));
const bad = [PB.lookup(10, {}), PB.lookup(10, null), PB.lookup(10, { ball: { pos: c10.tee.pos }, pin: c10.pinRam, player: {} })];
console.log(`  h10-s0's tee: 10 mph wind null ${windy === null}; calm from another direction found ${calmDir?.k === 1}; no wind field found ${noWind?.k === 1}; rough lie null ${lie2 === null}; pin 2 u off null ${pinOff === null}; pin 0.85 u off found ${pinNear?.club === s10.club}; malformed states null ${bad.every((x) => x === null)}`);
check(windy === null && calmDir?.k === 1 && noWind?.k === 1 && lie2 === null && pinOff === null && pinNear?.club === s10.club && bad.every((x) => x === null), "the null cases");

// timing
const nTime = 200, sample = solved.map(({ cup }) => ({ c: CUPS[cup], s: strokesOf.get(cup)[0] }));
let a = performance.now();
for (let i = 0; i < nTime; i++) { const { c, s } = sample[i % sample.length]; PB.lookup(c.hole, stOf(c.tee.pos, c.pinRam, s.lie)); }
const warm = (performance.now() - a) / nTime;
a = performance.now();
for (let i = 0; i < 20 * nTime; i++) { const { c, s } = sample[i % sample.length]; PB.lookup(c.hole, stOf(c.tee.pos, c.pinRam, s.lie), { refresh: false }); }
const bare = (performance.now() - a) / (20 * nTime);
const cold = await (async () => { const fresh = await import(`${pathToFileURL(path.join(HERE, "playbook.mjs")).href}?cold=${Date.now()}`); const b = performance.now(); const c = sample[0].c; fresh.lookup(c.hole, stOf(c.tee.pos, c.pinRam, 15)); return performance.now() - b; })();
console.log(`  time per lookup: ${cold.toFixed(1)} ms cold (reads and parses every file), ${warm.toFixed(2)} ms warm (with the check of every file's mtime), ${(bare * 1000).toFixed(1)} us for the match alone; the ${ok1 + nK + off2n + 2 * edgeN} lookups above ${(tLook / (ok1 + nK + off2n + 2 * edgeN)).toFixed(2)} ms each`);

// ---- 3. reloading ----
head("3. reloading");
const tmpRoot = arg("--tmp", os.tmpdir());
const T = fs.mkdtempSync(path.join(tmpRoot, "playbook-test-"));
try {
  const sd = path.join(T, "solve"), idx = path.join(T, "index.json");
  fs.mkdirSync(sd);
  fs.copyFileSync(PB.PIN_INDEX, idx);
  for (const f of ["h02-s0.json", "h12-s3.json"]) fs.copyFileSync(path.join(SOLVE, f), path.join(sd, f));
  const P2 = PB.createPlaybook({ solveDir: sd, pinIndex: idx });
  const c2 = CUPS["h02-s0"], c12 = CUPS["h12-s3"], s12 = strokesOf.get("h12-s3");
  const tee2 = () => P2.lookup(2, stOf(c2.tee.pos, c2.pinRam, 15));
  const put12 = () => P2.lookup(12, stOf(s12[2].from, c12.pinRam, s12[2].lie));
  const r0 = tee2(), p0 = put12();
  const bump = (file, mut) => { const j = JSON.parse(fs.readFileSync(file, "utf8")); mut(j); fs.writeFileSync(file, JSON.stringify(j, null, 1)); const t = new Date(Date.now() + 5000); fs.utimesSync(file, t, t); };
  // a stroke's power changed (its try with it: they are one record)
  bump(path.join(sd, "h02-s0.json"), (j) => { j.strokes[0].power = 0.5; for (const t of j.tries) if (t.k === 1 && t.heading === j.strokes[0].heading && t.rest[0] === j.strokes[0].rest[0]) t.power = 0.5; });
  const r1 = tee2();
  // truncated mid-write: the last good reading stands
  const good = fs.readFileSync(path.join(sd, "h02-s0.json"), "utf8");
  fs.writeFileSync(path.join(sd, "h02-s0.json"), good.slice(0, good.length >> 1));
  const r2 = tee2();
  // the campaign's own file back (as a rerun of the cup would write it)
  fs.copyFileSync(path.join(SOLVE, "h02-s0.json"), path.join(sd, "h02-s0.json")); fs.utimesSync(path.join(sd, "h02-s0.json"), new Date(Date.now() + 9000), new Date(Date.now() + 9000));
  const r3 = tee2();
  // no longer solved, then removed, then a new file
  bump(path.join(sd, "h12-s3.json"), (j) => { j.solved = false; });
  const p1 = put12();
  fs.unlinkSync(path.join(sd, "h12-s3.json"));
  fs.unlinkSync(path.join(sd, "h02-s0.json"));
  const r4 = tee2();
  fs.copyFileSync(path.join(SOLVE, "h02-s0.json"), path.join(sd, "h02-s0.json"));
  const r5 = tee2();
  // the pins index changed: h02-s0's pin moved 3 u
  bump(idx, (j) => { j.cups["h02-s0"].pinRam = [c2.pinRam[0] + 3, c2.pinRam[1], c2.pinRam[2]]; });
  const r6 = tee2();
  const r7 = P2.lookup(2, stOf(c2.tee.pos, [c2.pinRam[0] + 3, c2.pinRam[1], c2.pinRam[2]], 15));
  const lines = [
    [r0?.power === strokesOf.get("h02-s0")[0].power && p0?.k === 3, `copies read: h02-s0 tee -> ${r0?.club} ${r0?.power}, h12-s3's putt -> stroke ${p0?.k}`],
    [r1?.power === 0.5, `a changed power read again: ${r1?.power}`],
    [r2?.power === 0.5, `a truncated file keeps its last reading: ${r2?.power}`],
    [r3?.power === strokesOf.get("h02-s0")[0].power, `the file rewritten: ${r3?.power}`],
    [p1 === null, `marked unsolved: ${p1 === null ? "null" : "a stroke"}`],
    [r4 === null, `removed: ${r4 === null ? "null" : "a stroke"}`],
    [r5?.cup === "h02-s0", `added: ${r5?.cup ?? "null"}`],
    [r6 === null && r7?.cup === "h02-s0", `the pins index changed: the old pin ${r6 === null ? "null" : "a stroke"}, the new pin ${r7?.cup ?? "null"}`],
  ];
  for (const [ok, m] of lines) console.log(`  ${ok ? "ok" : "FAIL"} ${m}`), ok || failures++;
} finally { fs.rmSync(T, { recursive: true, force: true }); }

// ---- 4. round-play.mjs ----
head("4. round-play.mjs");
const RP = await import(pathToFileURL(path.join(HERE, "round-play.mjs")).href);
const need = ["dpadClub", "dpadAim", "clubNow", "applyWind", "holeRecord", "playHole", "log", "playbookStroke"];
const missing = need.filter((f) => typeof RP[f] !== "function");
const cB = CUPS["h05-s1"], sB = strokesOf.get("h05-s1");
const g1 = await RP.playbookStroke(5, stOf(cB.tee.pos, cB.pinRam, 15), { dir: 0, speedIdx: 0 });
const g2 = await RP.playbookStroke(5, stOf(sB[1].from, cB.pinRam, sB[1].lie), { dir: 0, speedIdx: 0 });
const g3 = await RP.playbookStroke(5, stOf(cB.tee.pos, cB.pinRam, 15), null);
const g4 = await RP.playbookStroke(5, stOf(cB.tee.pos, cB.pinRam, 15), { dir: 4, speedIdx: 6 });
const g5 = await RP.playbookStroke(5, stOf(cB.tee.pos, cB.pinRam, 15, { dir: 4, speedIdx: 6 }), { dir: 0, speedIdx: 0 });
console.log(`  exports: ${missing.length ? `MISSING ${missing.join(", ")}` : need.join(", ")}`);
console.log(`  playbookStroke, h05-s1: calm tee -> ${g1?.pb.club} ${g1?.pb.power} (${g1?.ms} ms); calm, its second stroke's spot -> stroke ${g2?.pb.k}; the game's own wind (windSet null) -> ${g3}; a set 12 mph -> ${g4}; set calm but the game's wind still 12 mph -> ${g5}`);
check(!missing.length && g1?.pb.k === 1 && g2?.pb.k === 2 && g3 === null && g4 === null && g5 === null, "round-play's playbook");

// ---- --kcl: the lie round-play's ahead plan reads at each later start ----
if (process.argv.includes("--kcl")) {
  head("--kcl: the ahead plan's lie (round-play lieAt: the KCL under the rest) against the game's lie");
  const { kcl, groundAt, dropMesh } = await import(pathToFileURL(path.join(HERE, "lib", "course.mjs")).href);
  const LIE = { 10: 6, 11: 6 };
  let n = 0, agree = 0;
  const off = [];
  for (const hole of [...new Set(solved.map(({ cup }) => CUPS[cup].hole))].sort((x, y) => x - y)) {
    const m = await kcl(hole);
    for (const { cup } of solved.filter((x) => CUPS[x.cup].hole === hole)) {
      const st = strokesOf.get(cup);
      for (let i = 1; i < st.length; i++) {
        const g = m ? groundAt(m, st[i - 1].rest[0], st[i - 1].rest[2]) : null;
        const lie = g ? LIE[g.attr] ?? g.attr : 1;
        n++;
        if (lie === st[i].lie) agree++; else off.push(`${cup}.${st[i].k} KCL ${lie}, game ${st[i].lie}`);
      }
    }
    dropMesh(hole);
  }
  console.log(`  agree ${pct(agree, n)}${off.length ? `; the others are matched at ready instead: ${off.join(", ")}` : ""}`);
}

console.log(`\n${failures ? `${failures} FAILED` : "all checks passed"}`);
process.exit(failures ? 1 : 0);
