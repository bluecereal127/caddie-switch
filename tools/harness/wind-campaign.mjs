// The wind campaign: every WSR pin solved to its target (ace, eagle, the
// albatross on 14) in every wind WSR can blow (the user, 2026-10-22: "our end
// goal should be to get a hole solved for every one on the 32 values for wind
// and for every one of the up to 6 pin locations per hole"). WSR's wind is an
// integer index of 2 mph (0-15: 0-30 mph, even only; the Switch's odd speeds
// lie between two of them), in 8 directions: 15 speeds x 8 = 120 winds a pin,
// calm being results/solve. One supervisor, one worker per instance: a job is
// one pin at one speed in all 8 directions, a hole-solve.mjs --winds run (one
// boot, the tee file reloaded per wind). The speeds go in --speeds order, the
// range bisected (the user: "start with 0, 16, 32 mph ... then 8mph and 24mph
// ... then 4, 12, 20 and 28 ... then 2, 6, 10, 14, 18, 22, 26, 30"; WSR's top
// is 30, so 30 stands in for 32 in the first round): 16, 30; 8, 24; 4, 12, 20,
// 28; 2, 6, ... 26 mph, so every pin has a speed before any pin has the next. A pin runs on one instance at a time (its summary file is
// hole-solve's). A wind already in results/solve-wind/hHH-<id>.json is not
// played again; a job whose log stalls for --stall minutes has its Dolphin
// and its run stopped (by the instance's user dir and the run's pid) and goes
// back on the queue, at most twice. Dolphin's panic dialogs on the campaign's
// instances are dismissed every 20 s. The board: results/solve-wind/BOARD.md.
//   node tools/harness/wind-campaign.mjs [--instances 1-18] [--speeds 4,7,...] [--holes 2,4] [--max-tries 40]
//     [--left 2560 --top -929 --cols 3 --w 480 --h 426] [--stall 15]
import fs from "node:fs";
import path from "node:path";
import { spawn, execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as P from "./lib/pins.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const range = (t) => t.split(",").flatMap((x) => { const [a, b] = x.split("-").map(Number); return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]; });
const INST = range(arg("--instances", "1-18"));
const SPEEDS = range(arg("--speeds", "8,15,4,12,2,6,10,14,1,3,5,7,9,11,13"));
const DIRS = range(arg("--dirs", "0-7"));
const HOLES = arg("--holes", null) ? range(arg("--holes")) : null;
const MAX_TRIES = Number(arg("--max-tries", 40)), STALL_MIN = Number(arg("--stall", 15));
const left = Number(arg("--left", 2560)), top = Number(arg("--top", -929)), COLS = Number(arg("--cols", 3));
const W = Number(arg("--w", 480)), H = Number(arg("--h", 426));
const PAR = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5 };
const COURSE = (h) => ["Resort A", "Resort B", "Resort C", "Classic A", "Classic B", "Classic C"][Math.floor((h - 1) / 3)];
const OUTD = path.join(HERE, "results", "solve-wind");
const LOGD = path.join(HERE, "state", "wind-campaign");
fs.mkdirSync(OUTD, { recursive: true }); fs.mkdirSync(LOGD, { recursive: true });
const LOGF = path.join(LOGD, "campaign.log");
const log = (m) => { const l = `[${new Date().toISOString().slice(0, 19).replace("T", " ")}] ${m}`; console.log(l); fs.appendFileSync(LOGF, l + "\n"); };

// the windows: --cols across, as many rows as the instances need, on the portrait monitor
const WINF = path.join(HERE, "state", "windows.json");
let wins = {};
try { wins = JSON.parse(fs.readFileSync(WINF, "utf8")); } catch { /* new */ }
INST.forEach((n, i) => { wins[n] = { x: left + (i % COLS) * W, y: top + Math.floor(i / COLS) * H, w: W, h: H }; });
fs.writeFileSync(WINF, JSON.stringify(wins, null, 1));

const cups = P.cups({}).filter((c) => PAR[c.hole] && (!HOLES || HOLES.includes(c.hole)) && fs.existsSync(P.savePath(P.teeName(c))));
const sumOf = (c) => { try { return JSON.parse(fs.readFileSync(path.join(OUTD, `h${P.hh(c.hole)}-${c.id}.json`), "utf8")); } catch { return null; } };
const keyOf = (d, i) => `${d}:${i}`;
const done = (c, d, i, s = sumOf(c)) => !!s?.winds?.[keyOf(d, i)];
// the queue: per speed, every pin, its winds not yet played
const queue = [];
for (const i of SPEEDS) for (const c of cups) {
  const s = sumOf(c), winds = DIRS.filter((d) => !done(c, d, i, s));
  if (winds.length) queue.push({ c, speedIdx: i, winds, tries: 0 });
}
const total = cups.length * SPEEDS.length * DIRS.length;
log(`the wind campaign: ${cups.length} pins x ${SPEEDS.length} speeds (${SPEEDS.map((i) => 2 * i).join(", ")} mph) x ${DIRS.length} directions = ${total} winds, ${queue.reduce((a, j) => a + j.winds.length, 0)} to play in ${queue.length} jobs on instances ${INST.join(", ")}; at most ${MAX_TRIES} tries a wind`);

const busyCups = new Set();
const running = new Map();   // instance -> { job, child, startedAt, logf }
const solveLog = (c) => path.join(HERE, "state", "solve", `h${P.hh(c.hole)}-${c.id}.log`);
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };

// the instance's Dolphins (by their user dir) and its hole-solve runs
function instancePids(n) {
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne ${process.pid} -and $_.CommandLine -and (($_.Name -eq 'node.exe' -and $_.CommandLine -match 'hole-solve\\.mjs' -and $_.CommandLine -match '--instance ${n}( |$)') -or ($_.Name -eq 'Dolphin.exe' -and $_.CommandLine.Contains('state\\user${n} '))) } | ForEach-Object { $_.ProcessId }`;
  try { return execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8", windowsHide: true }).split(/\s+/).filter(Boolean).map(Number); } catch { return []; }
}
const killAll = (pids) => { for (const pid of pids) try { execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" }); } catch { /* gone */ } };

function nextJob() {
  const k = queue.findIndex((j) => !busyCups.has(P.cupKey(j.c)));
  return k < 0 ? null : queue.splice(k, 1)[0];
}
function start(n) {
  if (P.freeGB() < 6) { log(`only ${P.freeGB().toFixed(1)} GB free: instance ${n} takes no new job`); return false; }
  const job = nextJob();
  if (!job) return false;
  const s = sumOf(job.c);
  job.winds = job.winds.filter((d) => !done(job.c, d, job.speedIdx, s));
  if (!job.winds.length) return start(n);
  busyCups.add(P.cupKey(job.c));
  const w = wins[n], logf = path.join(LOGD, `i${n}.log`);
  const out = fs.openSync(logf, "a");
  const label = `${COURSE(job.c.hole)} H${job.c.hole} ${2 * job.speedIdx} mph`;
  const args = ["--max-old-space-size=7000", "tools/harness/hole-solve.mjs", "--instance", String(n), "--hole", String(job.c.hole), "--cup", job.c.id,
    "--winds", job.winds.map((d) => keyOf(d, job.speedIdx)).join(","), "--max-tries", String(MAX_TRIES),
    "--x", String(w.x), "--y", String(w.y), "--w", String(w.w), "--h", String(w.h), "--label", label];
  const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ["ignore", out, out], windowsHide: true });
  const r = { job, child, startedAt: Date.now(), out };
  running.set(n, r);
  log(`instance ${n}: ${P.cupKey(job.c)} (${job.c.label}, par ${PAR[job.c.hole]}) at ${2 * job.speedIdx} mph, directions ${job.winds.join(",")}${job.tries ? ` (again, ${job.tries})` : ""}`);
  child.on("exit", (code) => {
    try { fs.closeSync(out); } catch { /* */ }
    running.delete(n);
    busyCups.delete(P.cupKey(job.c));
    const s2 = sumOf(job.c), left = job.winds.filter((d) => !done(job.c, d, job.speedIdx, s2));
    const got = job.winds.filter((d) => s2?.winds?.[keyOf(d, job.speedIdx)]?.solved).length;
    log(`instance ${n}: ${P.cupKey(job.c)} at ${2 * job.speedIdx} mph: ${got} of ${job.winds.length} solved${left.length ? `, ${left.length} unplayed` : ""} (exit ${r.stalled ? "stalled" : code}, ${((Date.now() - r.startedAt) / 60000).toFixed(1)} min)`);
    if (left.length && job.tries < 2) queue.unshift({ ...job, winds: left, tries: job.tries + 1 });
    board();
    setTimeout(() => { if (!start(n) && !running.size) finish(); }, 3000);
  });
  return true;
}

// the stall watchdog: a run's per-pin log not written for STALL_MIN minutes
setInterval(() => {
  for (const [n, r] of running) {
    const last = Math.max(r.startedAt, mtime(solveLog(r.job.c)));
    if (Date.now() - last > STALL_MIN * 60000 && !r.stalled) {
      r.stalled = true;
      log(`instance ${n}: ${P.cupKey(r.job.c)} silent for ${STALL_MIN} min: stopping it`);
      killAll([...instancePids(n), r.child.pid]);
    }
  }
}, 60000).unref();
// Dolphin's panic dialogs on the campaign's instances
setInterval(() => {
  execFile("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(HERE, "dismiss-warnings.ps1"), "-Instance", INST.join(",")], { windowsHide: true, timeout: 30000 }, (err, out) => {
    for (const l of String(out ?? "").split(/\r?\n/)) if (l.trim()) log(`  ${l.trim()}`);
  });
}, 20000).unref();

// the board: per pin, per speed, the directions solved
function board() {
  const rows = [], bySpeed = Object.fromEntries(SPEEDS.map((i) => [i, { solved: 0, played: 0 }]));
  let solved = 0, played = 0;
  for (const c of cups) {
    const s = sumOf(c);
    const cells = SPEEDS.map((i) => {
      const es = DIRS.map((d) => s?.winds?.[keyOf(d, i)]).filter(Boolean);
      const ok = es.filter((e) => e.solved).length;
      bySpeed[i].solved += ok; bySpeed[i].played += es.length; solved += ok; played += es.length;
      return es.length ? `${ok}/${es.length}` : "";
    });
    rows.push(`| ${c.hole} | ${c.id} ${c.label} | ${cells.join(" | ")} |`);
  }
  const md = [
    "# The wind campaign: every pin in every wind", "",
    `${solved} of ${total} winds solved, ${played} played (${cups.length} pins x ${SPEEDS.length} speeds x ${DIRS.length} directions; calm is results/solve). Each cell: the directions solved / played at that speed. Updated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`, "",
    `| Speed | ${SPEEDS.map((i) => `${2 * i} mph`).join(" | ")} |`, `|---|${SPEEDS.map(() => "---").join("|")}|`,
    `| solved / played | ${SPEEDS.map((i) => `${bySpeed[i].solved}/${bySpeed[i].played}`).join(" | ")} |`, "",
    `| Hole | Pin | ${SPEEDS.map((i) => `${2 * i}`).join(" | ")} |`, `|---|---|${SPEEDS.map(() => "---").join("|")}|`, ...rows, "",
  ].join("\n");
  fs.writeFileSync(path.join(OUTD, "BOARD.md"), md);
}
setInterval(board, 120000).unref();

let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  board();
  log(`the wind campaign: done (${queue.length} jobs left)`);
  process.exit(0);
}

// the instances free of earlier runs, then a staggered start (boots 20 s apart)
board();
for (const n of INST) {
  for (let pids = instancePids(n), said = false; pids.length; pids = instancePids(n)) {
    if (!said) { log(`instance ${n} is busy (pids ${pids.join(", ")}): waiting`); said = true; }
    await new Promise((r) => setTimeout(r, 15000));
  }
  if (!start(n)) break;
  await new Promise((r) => setTimeout(r, 20000));
}
if (!running.size) finish();
