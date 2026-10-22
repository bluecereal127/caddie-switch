// The aims the D-pad can reach from a cup's tee state, then the model's best
// strokes on exactly those aims, then the game's verdict on them, for a pin
// whose holing strokes are narrower than the D-pad's reach (hole 17 s3, calm,
// 2026-10-22): its rolling stick hits need ~0.005 deg; asked for 166.3634 deg,
// the D-pad reached 166.395 and the ball rested 12.6 yd off.
// 1. Each requested heading in [--from, --to] by --step is aimed from a fresh
//    reload of the tee (dpadAim, no swing) and the heading reached recorded.
// 2. On every distinct reached heading, round-model scans the club's power by
//    --qstep: a stroke the model holes (hole-solve's rules) or that rolls into
//    the stick at --vmax yd/s or less (WSR holed 8 of 9 such at 2.1-3.5 yd/s and
//    h17-s4's at about 3.7-3.9, where the model bounces it out) is a candidate.
// 3. The best candidates are struck in the game, each from a reload, the
//    requested heading the one that reached the candidate's aim.
// Results: results/solve/lattice-hHH-sN.json; an ace also as hole-solve's
// results/solve/hHH-sN.json (calm, edges as the ace's lattice neighbours).
//   node tools/harness/aim-lattice.mjs --instance 20 --hole 17 --cup s3 --club spoon --from 166.0 --to 166.7 --step 0.005 --qlo 0.94 --qhi 1.0 [--qstep 0.0001] [--vmax 3.9] [--tries 12]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Session } from "./lib/session.mjs";
import { shoot } from "./lib/shot.mjs";
import { CLUBS } from "./lib/wsr.mjs";
import { sleep } from "./lib/dsu.mjs";
import * as P from "./lib/pins.mjs";
import * as RP from "./round-play.mjs";
import * as RM from "./round-model.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const inst = Number(arg("--instance", 20)), hole = Number(arg("--hole", NaN)), cupId = arg("--cup", null), club = arg("--club", "spoon");
const FROM = Number(arg("--from", NaN)), TO = Number(arg("--to", NaN)), STEP = Number(arg("--step", 0.005));
const QLO = Number(arg("--qlo", 0.9)), QHI = Number(arg("--qhi", 1.0)), QSTEP = Number(arg("--qstep", 0.0001)), VMAX = Number(arg("--vmax", 3.9)), TRIES = Number(arg("--tries", 12));
const DEG = Math.PI / 180, YD = 9.144, CALM = { dir: 0, speedIdx: 0 };
const CLUB_INDEX = { driver: 0, spoon: 1, "3iron": 2, "5iron": 3, "7iron": 4, "9iron": 5, wedge: 6, putter: 7 };
const cup = P.cupById(hole, cupId), teeFile = P.savePath(P.teeName(cup));
const SOLVE = path.join(HERE, "results", "solve");
const OUT = path.join(SOLVE, `lattice-h${P.hh(hole)}-${cupId}.json`);
const LOGF = path.join(HERE, "state", "solve", `lattice-h${P.hh(hole)}-${cupId}.log`);
const log = (m) => { const l = `[${new Date().toISOString().slice(11, 19)}] ${m}`; console.log(l); fs.appendFileSync(LOGF, l + "\n"); };
const out = { hole, cup: cupId, club, started: new Date().toISOString(), lattice: [], candidates: [], tries: [], ace: null };
const save = () => fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const holes = (p) => p.holed && !!p.cupPass && p.cupPass.h < 0.25 && (!p.flag || (p.flag.vn * 240) / YD <= 3.4);

const s = new Session({ instance: inst, log: (m) => log(`  ${m}`) });
process.on("uncaughtException", async (e) => { log(`FAILED: ${e.stack ?? e}`); out.error = String(e.message ?? e); save(); await s.stop().catch(() => {}); process.exit(1); });
process.on("unhandledRejection", async (e) => { log(`FAILED: ${e?.stack ?? e}`); out.error = String(e?.message ?? e); save(); await s.stop().catch(() => {}); process.exit(1); });

log(`hole ${hole} ${cupId} (${cup.label}), ${club}: aims ${FROM}-${TO} by ${STEP} deg, power ${QLO}-${QHI} by ${QSTEP}; instance ${inst}`);
await s.start(teeFile);
await s.paused(async (gdb) => RP.applyWind(gdb, hole, CALM));
const st0 = await s.state();
await s.saveSlot(1);
const expect = { pos: st0.ball.pos, life: st0.ball.life };
let loaded = true;   // the session sits in slot 1's state
const reload = async () => { if (!loaded) await s.loadSlot(1, expect); loaded = false; };

// 1. the lattice: every requested heading's reach, from the tee's own aim
await RP.dpadClub(s.gdb, s.dsu, CLUB_INDEX[club]);
await s.saveSlot(1);   // the club chosen once: the aim starts from the same state every time
for (let h = FROM; h <= TO + 1e-9; h += STEP) {
  await reload();
  const aim = await RP.dpadAim(s.gdb, s.dsu, h * DEG, {});
  out.lattice.push({ requested: +h.toFixed(4), reached: aim.heading });
  loaded = false;
}
const reach = new Map();
for (const r of out.lattice) { const k = r.reached.toFixed(9); if (!reach.has(k)) reach.set(k, { reached: r.reached, requested: r.requested, n: 0 }); reach.get(k).n++; }
const distinct = [...reach.values()].sort((a, b) => a.reached - b.reached);
log(`lattice: ${out.lattice.length} requests reached ${distinct.length} distinct aims: ${distinct.map((d) => (d.reached / DEG).toFixed(4)).join(", ")}`);
save();

// 2. the model on exactly those aims
const lie = st0.player.lie;
for (const d of distinct) {
  for (let q = QLO; q <= QHI + 1e-9; q += QSTEP) {
    const p = RM.predict({ hole, ball: st0.ball.pos, heading: d.reached, club, power: q, lie, wind: CALM, pin: st0.pin });
    const vn = p.flag ? (p.flag.vn * 240) / YD : null;
    if (holes(p) || (vn != null && vn <= VMAX)) out.candidates.push({ heading: d.reached, requested: d.requested, power: +q.toFixed(5), modelHoles: holes(p), stickVn: vn != null ? +vn.toFixed(3) : null, rest: p.toPin });
  }
}
// the best first: the model's holes, then the stick rolls in WSR's measured holing speeds (2.1-3.5), then the rest by speed
const rank = (c) => (c.modelHoles ? 0 : c.stickVn >= 2.0 && c.stickVn <= 3.6 ? 1 : 2) * 100 + Math.abs((c.stickVn ?? 3) - 3);
out.candidates.sort((a, b) => rank(a) - rank(b));
log(`model: ${out.candidates.length} candidates on the reachable aims (${out.candidates.filter((c) => c.modelHoles).length} the model holes, ${out.candidates.filter((c) => !c.modelHoles).length} rolling into the stick at ${VMAX} yd/s or less)`);
save();

// 3. the game: the best candidates, distinct in power by 0.0005 on each aim
const picks = [];
for (const c of out.candidates) { if (picks.length >= TRIES) break; if (picks.some((p) => p.heading === c.heading && Math.abs(p.power - c.power) < 0.0005)) continue; picks.push(c); }
for (const [i, c] of picks.entries()) {
  await reload();
  await RP.dpadClub(s.gdb, s.dsu, CLUB_INDEX[club]);
  const aim = await RP.dpadAim(s.gdb, s.dsu, c.requested * DEG, {});
  await s.gdb.haltSafe();
  const clubStruck = CLUBS[await RP.clubNow(s.gdb)];
  const shot = await shoot(s.gdb, { dsu: s.dsu, power: c.power, powerMode: "game", holdWindow: false, keepGameSpin: true, trace: false, untilRest: "real", timeoutMs: 300000 });
  await s.gdb.go();
  loaded = false;
  const b = shot.ball, holed = b.holeFrame >= 0, toPin = Math.hypot(b.pos[0] - st0.pin[0], b.pos[2] - st0.pin[2]) / YD;
  const row = { n: i + 1, k: 1, why: `lattice cell ${i + 1}`, from: st0.ball.pos, lie, club: clubStruck, plannedPower: c.power, power: c.power, gamePower: shot.swingAtHandoff?.power ?? c.power, heading: aim.heading, aimErrDeg: aim.err / DEG, rest: b.pos, holed, hazard: shot.hazard ?? 0, toPin, cand: c, aimAsMapped: aim.heading === c.heading };
  out.tries.push(row); save();
  log(`try ${i + 1}: ${clubStruck} ${c.power.toFixed(5)} (game ${row.gamePower.toFixed(5)}) aim ${(aim.heading / DEG).toFixed(4)} deg${row.aimAsMapped ? "" : ` (mapped ${(c.heading / DEG).toFixed(4)})`} [model: ${c.modelHoles ? "holes" : `stick at ${c.stickVn} yd/s, rests ${c.rest?.toFixed(2)} yd`}]: ${holed ? "HOLED" : `rests ${toPin.toFixed(2)} yd from the pin`}`);
  if (holed) { out.ace = row; break; }
}
if (out.ace) {
  try { await sleep(2500); out.screenshot = path.relative(HERE, await P.screenshot(s, `lattice-h${P.hh(hole)}-${cupId}.png`)); } catch { /* no picture */ }
  const PAR3 = true;
  const D = Math.hypot(st0.ball.pos[0] - st0.pin[0], st0.ball.pos[2] - st0.pin[2]) / YD;
  // the edges as the ace's own lattice neighbours that hole: none tried, so the ace's aim alone (0 wide) unless more are tried
  const edges = { v: 2, by: "aim-lattice.mjs", left: { aimDeg: +(out.ace.heading / DEG).toFixed(4), offDeg: 0, power: +out.ace.gamePower.toFixed(4), acrossYd: 0 }, right: { aimDeg: +(out.ace.heading / DEG).toFixed(4), offDeg: 0, power: +out.ace.gamePower.toFixed(4), acrossYd: 0 }, widthDeg: 0, widthYd: 0, note: "a single reachable aim: the D-pad reaches its neighbours only 0.02-0.06 deg away, beyond this stroke's window" };
  const res = { hole, cup: cupId, label: cup.label, sets: cup.sets, par: 3, target: 1, started: out.started, tries: out.tries, solved: true, strokes: [{ k: 1, ...out.ace }], edges, wind: CALM, by: "aim-lattice.mjs", screenshot: out.screenshot ?? null, D };
  fs.writeFileSync(path.join(SOLVE, `h${P.hh(hole)}-${cupId}.json`), JSON.stringify(res, null, 1));
  log(`ACE: ${out.ace.club} ${out.ace.gamePower.toFixed(5)} at ${(out.ace.heading / DEG).toFixed(4)} deg (calm)`);
} else log(`no ace in ${out.tries.length} tries`);
save();
await s.stop().catch(() => {});
process.exit(out.ace ? 0 : 4);
