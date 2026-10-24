// Player 7 (the user, 2026-10-23: "a 7th instance which may both utilize wind
// adjustment to its liking, as well as pin hole location positioning to its
// liking, as well as save states. the goal is to get the lowest score
// possible, see how long it takes to get to -42 or better"): an eighteen-hole
// round from the "Number of Holes" menu, every hole's pin forced to its most
// forgiving perfect route's (results/compete/pin-plan.json), its wind and the
// flag's cloth set for that route (round-play.mjs windPlan), and a savestate at
// every tee: a hole that misses its perfect score (an ace, an eagle on a par 4,
// an albatross) is loaded back and played again with the next documented route
// (routeSkip), up to --tries times, then played out from where the last try
// rests. Rounds go on until one is at --goal (-42) or better. Logs:
// state/perfect/round-N.log; results/perfect/round-N.json; the board
// results/perfect/BOARD.md.
//   node tools/harness/perfect-round.mjs [--instance 7] [--goal -42] [--tries 12] [--x 2560 --y 379 --w 720 --h 436]
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn, execFile, execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
// --tries / --ace-tries: reloads a hole gets (default none: the user, 2026-10-24, "it does not stop on hole 16
// until it holes out": every hole is played again until it is perfect, 16 until its ace drops)
const INST = Number(arg("--instance", 7)), PORT = 8800 + INST, GOAL = Number(arg("--goal", -43)), TRIES = Number(arg("--tries", Infinity));
const WIN = { x: Number(arg("--x", 2560)), y: Number(arg("--y", 379)), w: Number(arg("--w", 720)), h: Number(arg("--h", 436)) };
const PAR = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5 };
const PERFECT = { 3: 1, 4: 2, 5: 2 };
const SD = path.join(HERE, "state", "perfect"), RD = path.join(HERE, "results", "perfect");
fs.mkdirSync(SD, { recursive: true }); fs.mkdirSync(RD, { recursive: true });
const LOGF = path.join(SD, "perfect.log");
const log = (m) => { const l = `[${new Date().toISOString().slice(0, 19).replace("T", " ")}] ${m}`; console.log(l); try { fs.appendFileSync(LOGF, l + "\n"); } catch { /* stdout has it */ } };
process.on("uncaughtException", (e) => log(`error, kept going: ${e?.stack ?? e}`));
process.on("unhandledRejection", (e) => log(`error, kept going: ${e?.stack ?? e}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (op, args = []) => new Promise((resolve, reject) => {
  const req = http.request({ host: "127.0.0.1", port: PORT, method: "POST", path: "/" }, (res) => { let t = ""; res.on("data", (d) => (t += d)); res.on("end", () => resolve({ ok: res.statusCode === 200, text: t })); });
  req.on("error", reject); req.end(JSON.stringify({ op, args }));
});
const run = (args, env, outFile) => new Promise((resolve) => {
  const fd = fs.openSync(outFile, "a");
  const ch = spawn(process.execPath, args, { cwd: ROOT, env, stdio: ["ignore", fd, fd], windowsHide: true });
  ch.on("exit", (code) => { try { fs.closeSync(fd); } catch { /* */ } resolve(code); });
  ch.on("error", () => resolve(-1));
});
const PLAY = pathToFileURL(path.join(HERE, "round-play.mjs")).href;
// the ball, the hole, and whether the player stands ready at a tee (round-start.mjs's READY)
const READY = `try {
  const pm = await gdb.u32(0x806f5468), cfg = await gdb.u32(0x806f5498);
  if (!pm || !cfg || pm < 0x80000000 || cfg < 0x80000000) return JSON.stringify({ menu: true });
  const f = await gdb.readMem(pm + 0x674, 2), tut = (await gdb.readMem(pm + 0x8a8, 1))[0];
  const hole = (await gdb.readMem(cfg + 0xc, 4)).readInt32BE(0) + 1;
  const p = await wsr.pointers(gdb), b = await wsr.readBall(gdb, p.ball, { records: false });
  return JSON.stringify({ hole, pos: b.pos, life: b.life, ready: f[0] === 1 && f[1] === 1 && !tut && b.life === 0 && !b.moving });
} catch (e) { return JSON.stringify({ menu: true }); }`;
const state = async () => { try { return JSON.parse((await post("eval", [READY])).text); } catch { return {}; } };
const pinPlan = () => { try { return JSON.parse(fs.readFileSync(path.join(HERE, "results", "compete", "pin-plan.json"), "utf8")); } catch { return {}; } };
// a par 4's ace (the user: "the lowest score possible"; -42 needs none, -43 one): ace-search.mjs's widest
// window per par 4 (results/ace-search: pin, wind, club, rolling cells), its cells listed here by the 3D
// model round the search's best (0.0005 of power x 0.01 deg), the window's middle first; --ace-tries a hole
const ACE_TRIES = Number(arg("--ace-tries", Infinity)), DEG = Math.PI / 180, YD = 9.144;
const RM = await import(pathToFileURL(path.join(HERE, "round-model.mjs")).href);
const cupsIdx = JSON.parse(fs.readFileSync(path.join(HERE, "state", "saves", "pins", "index.json"), "utf8")).cups;
const holesRule = (p) => p.holed && !!p.cupPass && p.cupPass.h < 0.25 && (!p.flag || (p.flag.vn * 240) / YD <= 3.4);
function acePlan() {
  const out = {};
  let files = []; try { files = fs.readdirSync(path.join(HERE, "results", "ace-search")).filter((f) => /^h\d\d-s\d\.json$/.test(f)); } catch { return out; }
  for (const f of files) { const r = JSON.parse(fs.readFileSync(path.join(HERE, "results", "ace-search", f), "utf8")); for (const w of r.winds) for (const [club, c] of Object.entries(w.clubs)) if (c.roll > 0 && (!out[r.hole] || c.roll > out[r.hole].roll)) out[r.hole] = { hole: r.hole, cup: `h${String(r.hole).padStart(2, "0")}-${r.pin}`, pin: r.pin, wind: w.speedIdx === undefined ? { dir: w.dir, speedIdx: w.mph / 2 } : w, club, roll: c.roll, bars: c.bars, aimDeg: c.aimDeg }; }
  for (const a of Object.values(out)) { a.wind = { dir: a.wind.dir, speedIdx: (a.wind.mph ?? 2 * a.wind.speedIdx) / 2 }; const c = cupsIdx[a.cup]; a.slot = c.slot; a.cells = aceCells(a, c); }
  return out;
}
function aceCells(a, c) {
  const ball = c.tee.pos, pin = c.pinRam, h0 = Math.atan2(pin[0] - ball[0], pin[2] - ball[2]);
  const q0 = a.bars / 4, hA = h0 - a.aimDeg * DEG, wind = { ...a.wind, angle: (a.wind.dir * Math.PI) / 4 };
  const cells = [];
  for (let i = -16; i <= 16; i++) for (let j = -20; j <= 20; j++) { const q = q0 + i * 0.0005, h = hA + j * 0.01 * DEG; if (q > 1 || q < 0.1) continue; if (holesRule(RM.predict({ hole: a.hole, ball, heading: h, club: a.club, power: q, lie: 15, wind, pin }))) cells.push({ q, h }); }
  if (!cells.length) return [];
  const mq = cells.reduce((s, x) => s + x.q, 0) / cells.length, mh = cells.reduce((s, x) => s + x.h, 0) / cells.length;
  return cells.sort((x, y) => Math.hypot((x.q - mq) / 0.0005, (x.h - mh) / (0.01 * DEG)) - Math.hypot((y.q - mq) / 0.0005, (y.h - mh) / (0.01 * DEG)));
}
const ACES = acePlan();
log(`ace windows: ${Object.values(ACES).map((a) => `hole ${a.hole} pin ${a.pin} ${2 * a.wind.speedIdx} mph d${a.wind.dir} ${a.club} (${a.cells.length} cells)`).join("; ") || "none"}`);

async function playRound(n) {
  const env = { ...process.env, HARNESS_INSTANCE: String(INST), HARNESS_KNOW: path.join(SD, "strokes.jsonl") };
  const drvLog = path.join(SD, `round-${n}-driver.log`), playLog = path.join(SD, `round-${n}.log`), out = path.join(RD, `round-${n}.json`);
  const fd = fs.openSync(drvLog, "a");
  const drv = spawn(process.execPath, ["tools/harness/driver.mjs", "--port", String(PORT), "--state", path.join(HERE, "state", "saves", "menu-holes.sav")], { cwd: ROOT, env, stdio: ["ignore", fd, fd], windowsHide: true });
  const t0 = Date.now(), card = {}, tries = {};
  try {
    let pid = null;
    for (let i = 0; i < 90 && !pid; i++) { await sleep(1000); const m = (fs.existsSync(drvLog) ? fs.readFileSync(drvLog, "utf8") : "").match(/driver up: dolphin pid (\d+)/); if (m) pid = Number(m[1]); }
    if (!pid) throw new Error("the driver did not come up");
    const ps = `Add-Type @'\nusing System; using System.Runtime.InteropServices;\npublic class PW { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f); [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SetWindowText(IntPtr h, string s); }\n'@\n$p = Get-Process -Id ${pid}; for ($i = 0; $i -lt 30 -and $p.MainWindowHandle -eq 0; $i++) { Start-Sleep 1; $p.Refresh() }; $p.PriorityClass = 'AboveNormal'; [PW]::SetWindowPos($p.MainWindowHandle, [IntPtr]::Zero, ${WIN.x}, ${WIN.y}, ${WIN.w}, ${WIN.h}, 0x0040) | Out-Null; [PW]::SetWindowText($p.MainWindowHandle, 'Player 7 | pins, wind and savestates | round ${n}') | Out-Null`;
    execFile("powershell", ["-NoProfile", "-Command", ps], { windowsHide: true, timeout: 60000 }, () => {});
    await sleep(4000);
    const PP = pinPlan();
    for (const a of Object.values(ACES)) if (a.cells.length) PP[a.hole] = { ...(PP[a.hole] ?? {}), slot: a.slot, cup: a.cup };   // the ace's pin
    if ((await run(["tools/harness/round-start.mjs", "--port", String(PORT), ...(PP[1] ? ["--pin", String(PP[1].slot)] : [])], env, playLog)) !== 0) throw new Error("round-start failed");
    for (let hole = 1; hole <= 18; hole++) {
      const target = PERFECT[PAR[hole]], forceNext = hole < 18 && PP[hole + 1] ? PP[hole + 1].slot : null;
      // the tee, ready: saved once (slot 1), its ball the spot a load must bring back
      let st = {};
      // (the screens between holes wait for A + B, as round-start.mjs walks them: pressed until the tee is ready)
      for (let i = 0; i < 120 && !(st.ready && st.hole === hole); i++) {
        st = await state();
        if (st.ready && st.hole === hole) break;
        if (st.hole === hole && st.life > 0) break;   // the hole already under way (a call that resumed): no pressing
        await post("hold", ["A", "B"]); await sleep(300); await post("release", ["A", "B"]); await sleep(1500);
      }
      if (st.hole === hole && st.life > 0 && !st.ready) throw new Error(`hole ${hole}: the ball already played before the tee was saved`);
      if (!(st.ready && st.hole === hole)) throw new Error(`hole ${hole}: never ready at the tee`);
      await post("save", ["1"]);
      const tee = st.pos;
      let done = false;
      // a par 4 with an ace window: its cells first, each from the tee saved
      const ace = PAR[hole] === 4 ? ACES[hole] : null;
      for (let k = 0; ace && ace.cells.length && k < ACE_TRIES && !done; k++) {
        if (k > 0) { await post("load", ["1"]); for (let i = 0; i < 40; i++) { const s2 = await state(); if (s2.hole === hole && s2.pos && Math.hypot(s2.pos[0] - tee[0], s2.pos[2] - tee[2]) < 0.01 && s2.life === 0) break; await sleep(500); } }
        const cell = ace.cells[k % ace.cells.length];   // round the window again when every cell has been tried
        const js = `const m = await import("${PLAY}?v=" + Date.now()); return await m.playHole({ gdb, dsu, hole: ${hole}, last: ${hole === 18}, maxStrokes: 1, logFile: ${JSON.stringify(playLog)}, src: "perfect-${n}", label: "Player 7 #${n}", windSet: ${JSON.stringify(ace.wind)}, flagWindSet: ${JSON.stringify(ace.wind)}, firstPlan: ${JSON.stringify({ club: ace.club, power: cell.q, heading: cell.h, why: `[ace window] ${ace.club} ${cell.q.toFixed(4)}, cell ${k + 1} of ${ace.cells.length}` })}, stopUnholed: true, forceNext: ${forceNext ?? "null"} });`;
        let rec = null; try { rec = JSON.parse((await post("eval", [js])).text); } catch { rec = null; }
        if (rec?.strokes?.some((x) => x.holed)) { card[hole] = 1; done = true; tries[hole] = `ace ${k + 1}`; log(`round ${n} hole ${hole}: AN ACE on the par 4, ace try ${k + 1}`); }
        else log(`round ${n} hole ${hole}: ace try ${k + 1} missed${rec?.strokes?.[0]?.toPin != null ? ` (${rec.strokes[0].toPin.toFixed(1)} yd)` : ""}`);
      }
      if (ace && !done) { await post("load", ["1"]); for (let i = 0; i < 40; i++) { const s2 = await state(); if (s2.hole === hole && s2.pos && Math.hypot(s2.pos[0] - tee[0], s2.pos[2] - tee[2]) < 0.01 && s2.life === 0) break; await sleep(500); } }
      for (let k = 0; k <= TRIES && !done; k++) {
        if (k > 0) {
          await post("load", ["1"]);
          let s2 = {};
          for (let i = 0; i < 40; i++) { s2 = await state(); if (s2.hole === hole && s2.pos && Math.hypot(s2.pos[0] - tee[0], s2.pos[2] - tee[2]) < 0.01 && s2.life === 0) break; await sleep(500); }
        }
        const last = Number.isFinite(TRIES) && k === TRIES;   // the last try plays the hole out (never, with no cap)
        const js = `const m = await import("${PLAY}?v=" + Date.now()); return await m.playHole({ gdb, dsu, hole: ${hole}, last: ${hole === 18}, maxStrokes: ${last ? 15 : target}, logFile: ${JSON.stringify(playLog)}, src: "perfect-${n}", label: "Player 7 #${n}", windSet: null, windPlan: "best", routeSkip: ${k}, stopUnholed: ${!last}, forceNext: ${forceNext ?? "null"} });`;
        const r = await post("eval", [js]);
        let rec = null; try { rec = JSON.parse(r.text); } catch { rec = null; }
        const holed = rec?.strokes?.some((x) => x.holed), got = rec?.game?.strokes ?? rec?.strokes?.length ?? 99;
        tries[hole] = k + 1;
        if (holed && got <= target) { card[hole] = got; done = true; }
        else if (last) { card[hole] = rec?.game?.strokes ?? null; done = true; }
        else log(`round ${n} hole ${hole}: try ${k + 1} ${holed ? `holed in ${got}` : `not holed in ${target}`}; loading the tee back`);
      }
      log(`round ${n} hole ${hole}: ${card[hole]} (par ${PAR[hole]}) after ${tries[hole]} ${tries[hole] === 1 ? "try" : "tries"}`);
      fs.writeFileSync(out, JSON.stringify({ n, card, tries, started: new Date(t0).toISOString() }, null, 1));
    }
    const strokes = Object.values(card).reduce((a, b) => a + (b ?? 0), 0);
    return { n, strokes, toPar: strokes - 72, card, tries, min: (Date.now() - t0) / 60000 };
  } finally {
    try { await post("quit"); } catch { /* gone */ }
    for (let i = 0; i < 15 && drv.exitCode == null; i++) await sleep(1000);
    if (drv.exitCode == null) try { execFileSync("taskkill", ["/F", "/T", "/PID", String(drv.pid)], { stdio: "ignore" }); } catch { /* gone */ }
    try { fs.closeSync(fd); } catch { /* */ }
  }
}

const T0 = Date.now();
log(`player 7 on instance ${INST}: pins, wind and savestates; rounds until ${GOAL} or better (up to ${TRIES} reloads a hole)`);
const done = (() => { try { return fs.readdirSync(RD).filter((f) => /^round-\d+\.json$/.test(f)).map((f) => Number(f.match(/\d+/)[0])); } catch { return []; } })();
for (let n = (done.length ? Math.max(...done) : 0) + 1; ; n++) {
  let r;
  try { r = await playRound(n); } catch (e) { log(`round ${n}: ${e.message}`); continue; }
  log(`round ${n}: ${r.strokes} strokes, ${r.toPar} (${Object.values(r.card).join(" ")}) in ${r.min.toFixed(0)} min; reloads ${Object.values(r.tries).reduce((a, b) => a + (Number(String(b).match(/d+/)?.[0] ?? 1) - 1), 0)}`);
  try { fs.writeFileSync(path.join(RD, "BOARD.md"), `# Player 7: pins, wind and savestates\n\nLatest round ${n}: ${r.toPar} (${Object.values(r.card).join(" ")}), ${r.min.toFixed(0)} min, reloads by hole ${JSON.stringify(r.tries)}. Since the start: ${((Date.now() - T0) / 60000).toFixed(0)} min.\n`); } catch { /* next time */ }
  if (r.toPar <= GOAL) { log(`player 7: ${r.toPar} in round ${n}, ${((Date.now() - T0) / 60000).toFixed(0)} min after the start`); break; }
}
