// Keeps natural 18-hole rounds going, one per slot (a harness instance, its
// driver port and its window's place), until one scores the goal: when a
// slot's round ends (its controller logs "round over"), the round's score as
// the game counted it goes into results/rounds.json, the slot's driver is told
// to quit (its Dolphin closes), and the next round number starts there
// (round-launch.sh: menu-holes.sav, Eighteen Holes, hole 1). Every round plays
// with the planner as it is at each stroke (round-planner.mjs is re-imported
// before every stroke), so improvements reach the next strokes everywhere.
//   node tools/harness/round-supervisor.mjs --slots 15:8815:10:10:2,16:8816:10:790:3,... --goal -30
// (instance:port:x:y:the round it is playing now)
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const STATE = path.join(HERE, "state");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const goal = Number(arg("--goal", -30));
const slots = arg("--slots", "").split(",").filter(Boolean).map((s) => { const [inst, port, x, y, round] = s.split(":").map(Number); return { inst, port, x, y, round }; });
const PAR = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5 };
const BOARD = path.join(HERE, "results", "rounds.json");
const CARDS = path.join(HERE, "results", "scorecards");
const outOf = (r) => path.join(HERE, "results", r === 1 ? "round18.json" : `round-r${r}.json`);
const board = fs.existsSync(BOARD) ? JSON.parse(fs.readFileSync(BOARD, "utf8")) : { goal, rounds: [] };
const save = () => { fs.mkdirSync(path.dirname(BOARD), { recursive: true }); fs.writeFileSync(BOARD, JSON.stringify(board, null, 1)); };
const say = (m) => { const l = `[${new Date().toISOString().slice(11, 19)}] ${m}`; console.log(l); fs.appendFileSync(path.join(STATE, "round-supervisor.log"), l + "\n"); };
const logOf = (r) => path.join(STATE, r === 1 ? "round18.log" : `round-r${r}.log`);
const ctlOf = (r) => path.join(STATE, r === 1 ? "round18-ctl.log" : `round-r${r}-ctl.log`);

// a round's card from its log: the game's own count per finished hole
function card(r) {
  const holes = {};
  if (!fs.existsSync(logOf(r))) return holes;
  for (const l of fs.readFileSync(logOf(r), "utf8").split("\n")) {
    const m = /hole (\d+): \d+ strokes struck, the game counts (\d+)/.exec(l);
    if (m && Number(m[2]) > 0) holes[Number(m[1])] = Number(m[2]);
  }
  return holes;
}
const over = (r) => fs.existsSync(ctlOf(r)) && fs.readFileSync(ctlOf(r), "utf8").includes("round over");
const post = (port, op, args = []) => new Promise((resolve) => {
  const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/" }, (res) => { let t = ""; res.on("data", (d) => (t += d)); res.on("end", () => resolve(t)); });
  req.on("error", (e) => resolve(`error ${e.message}`)); req.end(JSON.stringify({ op, args }));
});
const dolphinsOn = (inst) => {
  try { return Number(execFileSync("powershell", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "Name='Dolphin.exe'" | Where-Object { $_.CommandLine -match '\\\\user${inst}[ "]' } | Measure-Object).Count`]).toString().trim()); } catch { return 0; }
};
let next = Math.max(...slots.map((s) => s.round), ...board.rounds.map((r) => r.round), 0) + 1;

say(`supervising ${slots.length} slots, goal ${goal}; next round ${next}`);
for (;;) {
  for (const s of slots) {
    if (!over(s.round)) continue;
    const c = card(s.round), holes = Object.keys(c).map(Number);
    const strokes = holes.reduce((t, h) => t + c[h], 0), toPar = holes.reduce((t, h) => t + c[h] - PAR[h], 0);
    if (!board.rounds.some((r) => r.round === s.round)) {
      // the game's own scorecard: the controller's last screenshot of the round
      let cardPng = null;
      try {
        const shot = JSON.parse(fs.readFileSync(outOf(s.round), "utf8")).finalScreenshot;
        if (shot && fs.existsSync(shot)) { fs.mkdirSync(CARDS, { recursive: true }); cardPng = path.join(CARDS, `round-r${s.round}.png`); fs.copyFileSync(shot, cardPng); }
      } catch { /* no card */ }
      board.rounds.push({ round: s.round, instance: s.inst, holes: c, strokes, toPar, card: cardPng ? path.relative(HERE, cardPng) : null, ended: new Date().toISOString() });
      board.rounds.sort((a, b) => a.toPar - b.toPar);
      if (board.rounds[0].round === s.round && cardPng && holes.length === 18) { fs.copyFileSync(cardPng, path.join(CARDS, "best.png")); board.best = { round: s.round, toPar, card: "results/scorecards/best.png" }; }
      save();
      say(`round ${s.round} (instance ${s.inst}) over: ${strokes} strokes, ${toPar > 0 ? "+" : ""}${toPar} (best so far ${board.rounds[0].toPar} by round ${board.rounds[0].round})`);
      if (toPar <= goal && holes.length === 18) { say(`GOAL REACHED: round ${s.round} at ${toPar}`); process.exit(0); }
    }
    // the next round on this slot: close the old Dolphin, start anew
    await post(s.port, "quit");
    for (let i = 0; i < 30 && dolphinsOn(s.inst) > 0; i++) await new Promise((r) => setTimeout(r, 1000));
    const r = next++;
    const child = spawn("bash", [path.join(HERE, "round-launch.sh"), String(s.inst), String(s.port), String(r), String(s.x), String(s.y)], { cwd: ROOT, detached: true, stdio: "ignore" });
    child.unref();
    say(`round ${r} started on instance ${s.inst}`);
    s.round = r;
  }
  await new Promise((r) => setTimeout(r, 20000));
}
