// Tries given strokes from a cup's tee state, each from a reload of it: real
// swings, the club and aim set by D-pad, the power through the game's own
// pipeline (hole-solve.mjs's strike). For pins the solver's search has no cell
// on: hole 17's s3 and s4 (2026-10-22). The offline research
// (state/h17-research) found a flag-cloth route on s4 in the hole's own wind,
// and an unmeasured roll into the stick at 3.7-3.9 yd/s in calm.
// --wind keep: the tee state's own wind, the one the hole drew; calm; or
// dir:speedIdx. The first holing stroke stops the list. A par 3's ace then gets
// its edges: one D-pad step (0.03 deg) at a time at the ace's power, a second try
// 0.002 stronger before an aim is called the edge.
// Results: results/solve/try-hHH-sN-TAG.json, every try. An ace also goes to
// results/solve/hHH-sN.json in hole-solve's format, with its wind, the edges
// v 2 (so solve-course.mjs counts it), and a screenshot.
//   node tools/harness/try-cells.mjs --instance 20 --hole 17 --cup s4 --wind keep --tag own-wind --cells driver:0.9866:170.0266,driver:0.988:170.0706 [--x 3280 --y -57 --w 720 --h 436]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Session } from "./lib/session.mjs";
import { shoot } from "./lib/shot.mjs";
import { CLUBS } from "./lib/wsr.mjs";
import { sleep } from "./lib/dsu.mjs";
import * as P from "./lib/pins.mjs";
import * as RP from "./round-play.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const inst = Number(arg("--instance", 20)), hole = Number(arg("--hole", NaN)), cupId = arg("--cup", null);
const WIND = arg("--wind", "keep"), TAG = arg("--tag", WIND.replace(":", "-"));
const WX = Number(arg("--x", 3280)), WY = Number(arg("--y", -57)), WW = Number(arg("--w", 720)), WH = Number(arg("--h", 436));
const DEG = Math.PI / 180, YD = 9.144, EDGE_STEP = 0.03 * DEG;
const CLUB_INDEX = { driver: 0, spoon: 1, "3iron": 2, "5iron": 3, "7iron": 4, "9iron": 5, wedge: 6, putter: 7 };
const PAR = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5 };
const cells = arg("--cells", "").split(",").filter(Boolean).map((t) => { const [club, q, hDeg] = t.split(":"); return { club, power: Number(q), heading: Number(hDeg) * DEG }; });
const cup = P.cupById(hole, cupId);
const teeFile = P.savePath(P.teeName(cup));
if (!cells.length || !fs.existsSync(teeFile)) { console.error("usage: --hole H --cup sN --cells club:power:headingDeg,... (and the cup's tee state must exist)"); process.exit(2); }
const SOLVE = path.join(HERE, "results", "solve");
const OUT = path.join(SOLVE, `try-h${P.hh(hole)}-${cupId}-${TAG}.json`);
const LOGF = path.join(HERE, "state", "solve", `try-h${P.hh(hole)}-${cupId}-${TAG}.log`);
fs.mkdirSync(path.dirname(LOGF), { recursive: true });
const log = (m) => { const l = `[${new Date().toISOString().slice(11, 19)}] ${m}`; console.log(l); fs.appendFileSync(LOGF, l + "\n"); };
const out = { hole, cup: cupId, label: cup.label, wind: null, windArg: WIND, started: new Date().toISOString(), tries: [], ace: null, edges: null };
const save = () => fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

const s = new Session({ instance: inst, log: (m) => log(`  ${m}`) });
process.on("uncaughtException", async (e) => { log(`FAILED: ${e.stack ?? e}`); out.error = String(e.message ?? e); save(); await s.stop().catch(() => {}); process.exit(1); });
process.on("unhandledRejection", async (e) => { log(`FAILED: ${e?.stack ?? e}`); out.error = String(e?.message ?? e); save(); await s.stop().catch(() => {}); process.exit(1); });
function title(t) {
  const pid = s.child?.pid;
  if (!pid) return;
  const ps = `Add-Type @'\nusing System; using System.Runtime.InteropServices;\npublic class TC { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f); [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SetWindowText(IntPtr h, string s); }\n'@\n$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p -and $p.MainWindowHandle -ne 0) { [TC]::SetWindowPos($p.MainWindowHandle, [IntPtr](-1), ${WX}, ${WY}, ${WW}, ${WH}, 0x0040) | Out-Null; [TC]::SetWindowText($p.MainWindowHandle, '${t.replace(/'/g, "")}') | Out-Null }`;
  try { execFileSync("powershell", ["-NoProfile", "-Command", ps], { timeout: 20000, stdio: "ignore" }); } catch { /* the title can wait */ }
}
const status = (m) => title(`H${hole} ${cup.label} (${cupId}) | wind ${WIND} | ${m}`);
async function strike(st, c) {
  const gdb = s.gdb, dsu = s.dsu;
  await RP.dpadClub(gdb, dsu, CLUB_INDEX[c.club]);
  const aim = await RP.dpadAim(gdb, dsu, c.heading, {});
  await gdb.haltSafe();
  const clubStruck = CLUBS[await RP.clubNow(gdb)];
  const shot = await shoot(gdb, { dsu, power: c.power, powerMode: "game", holdWindow: false, keepGameSpin: true, trace: false, untilRest: "real", timeoutMs: 300000 });
  await gdb.go();
  const b = shot.ball;
  return { club: clubStruck, power: c.power, gamePower: shot.swingAtHandoff?.power ?? c.power, heading: aim.heading, aimErrDeg: aim.err / DEG, rest: b.pos, holed: b.holeFrame >= 0, hazard: shot.hazard ?? 0, toPin: Math.hypot(b.pos[0] - st.pin[0], b.pos[2] - st.pin[2]) / YD };
}
let n = 0;
function record(c, r, why) {
  n++;
  out.tries.push({ n, k: 1, why, from: st0.ball.pos, lie: st0.player.lie, plannedPower: c.power, ...r });
  save();
  log(`try ${n} (${why}): ${r.club} ${r.power.toFixed(4)} (game ${r.gamePower.toFixed(4)}) aim ${(r.heading / DEG).toFixed(3)} deg: ${r.holed ? "HOLED" : `rests ${r.toPin.toFixed(2)} yd from the pin${r.hazard ? ` (hazard ${r.hazard})` : ""}`}`);
  return r;
}

log(`hole ${hole} cup ${cupId} (${cup.label}): ${cells.length} cells, wind ${WIND}; instance ${inst}; booting ${path.basename(teeFile)}`);
await s.start(teeFile);
status("booted");
if (WIND === "calm") await s.paused(async (gdb) => RP.applyWind(gdb, hole, { dir: 0, speedIdx: 0 }));
else if (WIND !== "keep") { const [dir, speedIdx] = WIND.split(":").map(Number); await s.paused(async (gdb) => RP.applyWind(gdb, hole, { dir, speedIdx })); }
const st0 = await s.state();
out.wind = { dir: st0.wind.dir, speedIdx: st0.wind.speedIdx };
log(`at the tee: ${(Math.hypot(st0.ball.pos[0] - st0.pin[0], st0.ball.pos[2] - st0.pin[2]) / YD).toFixed(1)} yd to the pin, wind dir ${st0.wind.dir} idx ${st0.wind.speedIdx}`);
await s.saveSlot(1);
const expect = { pos: st0.ball.pos, life: st0.ball.life };
let first = true;
const go = async (c, why) => { if (!first) await s.loadSlot(1, expect); first = false; status(`${why}`); return record(c, await strike(st0, c), why); };
for (const [i, c] of cells.entries()) {
  const r = await go(c, `cell ${i + 1}`);
  if (r.holed) { out.ace = r; break; }
}
if (out.ace) {
  const ace = out.ace;
  log(`ACE: ${ace.club} ${ace.gamePower.toFixed(4)} at ${(ace.heading / DEG).toFixed(3)} deg in wind dir ${out.wind.dir} idx ${out.wind.speedIdx}`);
  try { await sleep(2500); out.screenshot = path.relative(HERE, await P.screenshot(s, `try-h${P.hh(hole)}-${cupId}-${TAG}.png`)); } catch { /* no picture */ }
  save();
  if (PAR[hole] === 3) {
    const edges = { v: 2, by: "try-cells.mjs" };
    for (const [side, dir] of [["left", 1], ["right", -1]]) {
      let last = { heading: ace.heading, power: ace.gamePower };
      for (let k = 1; k <= 40; k++) {
        const h = ace.heading + dir * k * EDGE_STEP;
        let r = await go({ club: ace.club, power: ace.power, heading: h }, `edge ${side} ${k}`);
        if (!r.holed) r = await go({ club: ace.club, power: ace.power + 0.002, heading: h }, `edge ${side} ${k} try 2`);
        if (!r.holed) break;
        last = { heading: r.heading, power: r.gamePower };
      }
      const off = Math.atan2(Math.sin(last.heading - ace.heading), Math.cos(last.heading - ace.heading)) / DEG;
      const D = Math.hypot(st0.ball.pos[0] - st0.pin[0], st0.ball.pos[2] - st0.pin[2]) / YD;
      edges[side] = { aimDeg: +(last.heading / DEG).toFixed(4), offDeg: +off.toFixed(3), power: +last.power.toFixed(4), acrossYd: +(Math.abs(off) * DEG * D).toFixed(2) };
      log(`ace edge ${side}: ${Math.abs(off).toFixed(3)} deg (${edges[side].acrossYd} yd across at the pin)`);
    }
    const D = Math.hypot(st0.ball.pos[0] - st0.pin[0], st0.ball.pos[2] - st0.pin[2]) / YD;
    edges.widthDeg = +(Math.abs(edges.left.offDeg) + Math.abs(edges.right.offDeg)).toFixed(3);
    edges.widthYd = +(edges.widthDeg * DEG * D).toFixed(2);
    out.edges = edges;
    log(`ace window: ${edges.widthDeg} deg wide (${edges.widthYd} yd across at the pin)`);
  }
  save();
  // the cup's result in hole-solve's format, with the wind it was made in
  const res = { hole, cup: cupId, label: cup.label, sets: cup.sets, par: PAR[hole], target: PAR[hole] === 3 ? 1 : null, started: out.started, tries: out.tries, solved: true, strokes: [{ k: 1, ...ace }], edges: out.edges, wind: out.wind, by: `try-cells.mjs (${TAG})`, screenshot: out.screenshot ?? null, ms: Date.now() - Date.parse(out.started) };
  fs.writeFileSync(path.join(SOLVE, `h${P.hh(hole)}-${cupId}.json`), JSON.stringify(res, null, 1));
  status(`ACE (wind ${out.wind.dir}/${out.wind.speedIdx})`);
} else { log(`no ace in ${n} tries`); status("no ace"); }
await s.stop().catch(() => {});
process.exit(out.ace ? 0 : 4);
