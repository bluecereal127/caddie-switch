// The competition (the user, 2026-10-23: "have 6 instances compete to see
// which can be the first to shoot 20 under par without any wind modifications
// or save states used on the course"): two players per race play natural
// rounds back to back until one of them shoots the race's goal: the Resort
// nine and the Classic nine at -20, eighteen holes at -40. Every round is as
// natural as natural-18.sh's fresh ones: booted on the "Number of Holes" menu
// (saves/menu-holes.sav; the menu savestate is the only one), a random 5-90 s
// idle there so the game's draw is new, the game's own menus to the first tee
// (round-start.mjs, --nine for a nine), then every hole straight through
// (round-ctl.mjs -> round-play.mjs): the game's own wind and pins, nothing
// written into the game, no savestate, no restart; every stroke the
// planner's. Each player keeps its own memory of its strokes across its
// rounds (HARNESS_KNOW: state/compete/<player>/strokes.jsonl, empty at its
// first round). The first round at the goal wins its race: its scorecard is
// kept (results/compete/<race>-winner.png) and both players of the race stop.
// Windows on the portrait monitor, two across and a race to a row; the board:
// results/compete/BOARD.md; the log: state/compete/compete.log.
//   node tools/harness/compete.mjs [--races resort9,classic9,eighteen]
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn, execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const PAR = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5 };
const RACES = {
  resort9: { name: "Resort nine", nine: "Resort", from: 1, to: 9, goal: -20, row: 0 },
  classic9: { name: "Classic nine", nine: "Classic", from: 10, to: 18, goal: -20, row: 1 },
  eighteen: { name: "Eighteen holes", nine: null, from: 1, to: 18, goal: -40, row: 2 },
};
const want = (arg("--races", null) ?? Object.keys(RACES).join(",")).split(",");
const SLOTS = [];
let inst = 1;
for (const [race, R] of Object.entries(RACES)) for (const k of [1, 2]) {
  const n = inst++;
  if (want.includes(race)) SLOTS.push({ slug: `${race}-${k}`, race, R, name: `${R.name} · player ${k}`, inst: n, port: 8800 + n, x: 2560 + (k - 1) * 720, y: -929 + R.row * 436, w: 720, h: 436 });
}
const SD = path.join(HERE, "state", "compete"), RD = path.join(HERE, "results", "compete");
fs.mkdirSync(SD, { recursive: true }); fs.mkdirSync(RD, { recursive: true });
const LOGF = path.join(SD, "compete.log");
const log = (m) => { const l = `[${new Date().toISOString().slice(0, 19).replace("T", " ")}] ${m}`; console.log(l); try { fs.appendFileSync(LOGF, l + "\n"); } catch { /* the line is on stdout */ } };
process.on("uncaughtException", (e) => log(`error, kept going: ${e?.stack ?? e}`));
process.on("unhandledRejection", (e) => log(`error, kept going: ${e?.stack ?? e}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

const post = (port, op, args = []) => new Promise((resolve, reject) => {
  const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/" }, (res) => { let t = ""; res.on("data", (d) => (t += d)); res.on("end", () => resolve(t)); });
  req.on("error", reject); req.end(JSON.stringify({ op, args }));
});
const run = (args, env, outFile) => new Promise((resolve) => {
  const fd = fs.openSync(outFile, "a");
  const ch = spawn(process.execPath, args, { cwd: ROOT, env, stdio: ["ignore", fd, fd], windowsHide: true });
  ch.on("exit", (code) => { try { fs.closeSync(fd); } catch { /* */ } resolve(code); });
  ch.on("error", () => resolve(-1));
});
const killTree = (pid) => { try { execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" }); } catch { /* gone */ } };
function place(pid, s, title) {
  const ps = `Add-Type @'\nusing System; using System.Runtime.InteropServices;\npublic class CW { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f); [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SetWindowText(IntPtr h, string s); }\n'@\n$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; for ($i = 0; $p -and $i -lt 30 -and $p.MainWindowHandle -eq 0; $i++) { Start-Sleep 1; $p.Refresh() }; if ($p) { $p.PriorityClass = 'AboveNormal'; [CW]::SetWindowPos($p.MainWindowHandle, [IntPtr]::Zero, ${s.x}, ${s.y}, ${s.w}, ${s.h}, 0x0040) | Out-Null; [CW]::SetWindowText($p.MainWindowHandle, '${title.replace(/'/g, "")}') | Out-Null }`;
  execFile("powershell", ["-NoProfile", "-Command", ps], { windowsHide: true, timeout: 60000 }, () => {});
}

const state = Object.fromEntries(SLOTS.map((s) => [s.slug, { rounds: [], best: null, current: null }]));
const raceDone = {};
function board() {
  const lines = ["# The competition", "", `Natural rounds (the game's own wind and pins, no savestate after the menu), two players a race, the first round at the goal wins. Updated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`, ""];
  for (const [race, R] of Object.entries(RACES)) {
    if (!want.includes(race)) continue;
    lines.push(`## ${R.name} (goal ${R.goal})${raceDone[race] ? ` — won by ${raceDone[race].name}, round ${raceDone[race].n}: ${raceDone[race].toPar}` : ""}`, "");
    for (const s of SLOTS.filter((x) => x.race === race)) {
      const st = state[s.slug];
      lines.push(`- ${s.name} (instance ${s.inst}): ${st.rounds.length} rounds, best ${st.best ?? "—"}; ${st.rounds.map((r) => r.toPar ?? "x").join(", ") || "none yet"}`);
    }
    lines.push("");
  }
  try { fs.writeFileSync(path.join(RD, "BOARD.md"), lines.join("\n")); } catch { /* the next board */ }
}

async function playRound(s, n) {
  const dir = path.join(SD, s.slug); fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(RD, s.slug), { recursive: true });
  const know = path.join(dir, "strokes.jsonl"); if (!fs.existsSync(know)) fs.writeFileSync(know, "");
  const env = { ...process.env, HARNESS_INSTANCE: String(s.inst), HARNESS_KNOW: know };
  const drvLog = path.join(dir, `round-${n}-driver.log`), ctlLog = path.join(dir, `round-${n}-ctl.log`);
  const playLog = `state/compete/${s.slug}/round-${n}.log`, out = `results/compete/${s.slug}/round-${n}.json`;
  const fd = fs.openSync(drvLog, "a");
  const drv = spawn(process.execPath, ["tools/harness/driver.mjs", "--port", String(s.port), "--state", path.join(HERE, "state", "saves", "menu-holes.sav")], { cwd: ROOT, env, stdio: ["ignore", fd, fd], windowsHide: true });
  state[s.slug].current = drv;
  try {
    let pid = null;
    for (let i = 0; i < 90 && !pid; i++) { await sleep(1000); const m = (fs.existsSync(drvLog) ? fs.readFileSync(drvLog, "utf8") : "").match(/driver up: dolphin pid (\d+)/); if (m) pid = Number(m[1]); }
    if (!pid) throw new Error("the driver did not come up");
    const st = state[s.slug];
    place(pid, s, `${s.name} | round ${n} | best ${st.best ?? "-"} | goal ${s.R.goal}`);
    await sleep(4000);
    const idle = Math.round(5 + Math.random() * 85);
    fs.appendFileSync(ctlLog, `[${new Date().toISOString().slice(11, 19)}] ${s.name} round ${n}: idling ${idle} s on Number of Holes (a new draw)\n`);
    await post(s.port, "wait", [String(idle * 1000)]);
    const startCode = await run(["tools/harness/round-start.mjs", "--port", String(s.port), ...(s.R.nine ? ["--nine", s.R.nine] : [])], env, path.join(HERE, playLog));
    if (startCode !== 0) throw new Error(`round-start exit ${startCode}`);
    await run(["tools/harness/round-ctl.mjs", "--port", String(s.port), "--from", String(s.R.from), "--to", String(s.R.to), "--log", playLog, "--out", out, "--label", `${s.name} #${n}`], env, ctlLog);
    const r = readJson(path.join(HERE, out));
    let strokes = 0, par = 0, complete = true;
    for (let h = s.R.from; h <= s.R.to; h++) { const x = r?.holes?.[h]; const k = x?.game?.strokes ?? x?.strokes?.length; if (!k) { complete = false; break; } strokes += k; par += PAR[h]; }
    const res = { n, complete, strokes: complete ? strokes : null, toPar: complete ? strokes - par : null, card: r ? Object.fromEntries(Object.entries(r.holes ?? {}).map(([h, x]) => [h, x?.game?.strokes ?? x?.strokes?.length])) : null };
    if (complete && res.toPar <= s.R.goal && !raceDone[s.race]) {
      await sleep(8000);
      const shot = (await post(s.port, "shot")).match(/shot : (.*\.png)/)?.[1]?.trim();
      if (shot && fs.existsSync(shot)) fs.copyFileSync(shot, path.join(RD, `${s.race}-winner.png`));
    }
    return res;
  } finally {
    try { await post(s.port, "quit"); } catch { /* gone */ }
    for (let i = 0; i < 15 && drv.exitCode == null; i++) await sleep(1000);
    if (drv.exitCode == null) killTree(drv.pid);
    try { fs.closeSync(fd); } catch { /* */ }
    state[s.slug].current = null;
  }
}

async function player(s) {
  await sleep(SLOTS.indexOf(s) * 20000);   // boots 20 s apart
  for (let n = 1; !raceDone[s.race]; n++) {
    log(`${s.name}: round ${n}`);
    let r;
    try { r = await playRound(s, n); } catch (e) { r = { n, complete: false, error: e.message }; }
    if (raceDone[s.race]) break;
    const st = state[s.slug];
    st.rounds.push(r);
    if (r.complete && (st.best == null || r.toPar < st.best)) st.best = r.toPar;
    log(`${s.name}: round ${n} ${r.complete ? `${r.strokes} strokes, ${r.toPar} (${Object.values(r.card ?? {}).join(" ")})` : `incomplete${r.error ? ` (${r.error})` : ""}`}; best ${st.best ?? "-"}`);
    if (r.complete && r.toPar <= s.R.goal) {
      raceDone[s.race] = { name: s.name, n, toPar: r.toPar };
      log(`${s.R.name}: WON by ${s.name} in round ${n} at ${r.toPar}`);
      for (const o of SLOTS.filter((x) => x.race === s.race && x !== s)) if (state[o.slug].current) killTree(state[o.slug].current.pid);
    }
    board();
  }
}

log(`the competition: ${SLOTS.map((s) => `${s.name} on instance ${s.inst}`).join("; ")}`);
board();
await Promise.all(SLOTS.map(player));
board();
log("the competition: every race won");
