// The wind campaign: every WSR pin solved in every wind WSR can blow, by a
// route a human can replay (the user, 2026-10-22: "our end goal should be to
// get a hole solved for every one on the 32 values for wind and for every one
// of the up to 6 pin locations per hole"; "the goal is for a human to be able
// to replicate these"). Solved = hole-solve.mjs's near rule: the attempt
// stroke (a par 3's tee shot, a par 4's or par 5's second) holes or rests
// within 1 ft, no flag catches. WSR's wind is an integer index of 2 mph (0-15:
// 0-30 mph, even only; the Switch's odd speeds lie between two of them), in 8
// directions: 15 speeds x 8 = 120 winds a pin, plus calm where results/solve's
// calm route does not stand (a par 5's, played to a holed third stroke; a flag
// catch). A job is one pin at one speed in all 8 directions, a hole-solve.mjs
// --winds run (one boot, the tee file reloaded per wind), its results in that
// pin and speed's own file (results/solve-wind/hHH-<id>/iII.json), so jobs on
// one pin at other speeds run side by side. The holes go one at a time in
// --holes order (the user: hole 1, then 10, then every par 3, every par 5, and
// the par 4s left), every instance on the hole until its jobs run out;
// within a hole the speeds go bisected ("start with 0, 16, 32 mph ... then
// 8mph and 24mph ... then 4, 12, 20 and 28 ... then 2, 6, 10, 14, 18, 22, 26,
// 30"; WSR's top is 30, so 30 stands in for 32), then the pins. A wind already
// in its file under the near rule is not played again; a job whose log stalls
// for --stall minutes has its Dolphin and its run stopped (by the instance's
// user dir and the run's pid) and goes back on the queue, at most twice.
// Dolphin's panic dialogs on the campaign's instances are dismissed every 20 s.
// The board: results/solve-wind/BOARD.md. A hole none of whose jobs is queued
// or running is published once (publish-hole.sh: the playbook rebuilt, tested,
// committed and pushed: "update caddie switch for a completed hole whenever
// it is fully finished"; state/wind-campaign/published.json).
//   node tools/harness/wind-campaign.mjs [--instances 1-18] [--holes 1,10,2,...] [--speeds 0,8,15,...] [--max-tries 40]
//     [--left 2560 --top -929 --cols 3 --w 480 --h 426] [--stall 15]
import fs from "node:fs";
import path from "node:path";
import { spawn, execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as P from "./lib/pins.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const range = (t) => t.split(",").flatMap((x) => { const [a, b] = x.split("-").map(Number); return Number.isFinite(b) ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]; });
const INST = range(arg("--instances", "1-18"));
// (2026-10-22, later: holes 1 and 10 again with full-power setups, then the
// par 5s, then the par 4s left; the par 3s, done, have no setup to change)
const HOLES = range(arg("--holes", "1,10,3,5,9,12,14,18,6,7,15,16,2,4,8,11,13,17"));
const SPEEDS = range(arg("--speeds", "0,8,15,4,12,2,6,10,14,1,3,5,7,9,11,13"));
const DIRS = range(arg("--dirs", "0-7"));
const MAX_TRIES = Number(arg("--max-tries", 40)), STALL_MIN = Number(arg("--stall", 15));
const left = Number(arg("--left", 2560)), top = Number(arg("--top", -929)), COLS = Number(arg("--cols", 3));
const W = Number(arg("--w", 480)), H = Number(arg("--h", 426));
const RULE = "near";
// the rule a wind's entry must be played under: a par 4's and 5's "near-max"
// (hole-solve.mjs: the setups at full power first), a par 3's "near"
const ruleOf = (c) => (PAR[c.hole] === 3 ? "near" : "near-max");
const PAR = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5 };
const COURSE = (h) => ["Resort A", "Resort B", "Resort C", "Classic A", "Classic B", "Classic C"][Math.floor((h - 1) / 3)];
const OUTD = path.join(HERE, "results", "solve-wind");
const LOGD = path.join(HERE, "state", "wind-campaign");
fs.mkdirSync(OUTD, { recursive: true }); fs.mkdirSync(LOGD, { recursive: true });
const LOGF = path.join(LOGD, "campaign.log");
const log = (m) => { const l = `[${new Date().toISOString().slice(0, 19).replace("T", " ")}] ${m}`; console.log(l); fs.appendFileSync(LOGF, l + "\n"); };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

// the windows: --cols across, as many rows as the instances need, on the portrait monitor
const WINF = path.join(HERE, "state", "windows.json");
const wins = readJson(WINF) ?? {};
INST.forEach((n, i) => { wins[n] = { x: left + (i % COLS) * W, y: top + Math.floor(i / COLS) * H, w: W, h: H }; });
fs.writeFileSync(WINF, JSON.stringify(wins, null, 1));

const cups = P.cups({}).filter((c) => PAR[c.hole] && HOLES.includes(c.hole) && fs.existsSync(P.savePath(P.teeName(c))));
const sumFile = (c, i) => path.join(OUTD, `h${P.hh(c.hole)}-${c.id}`, `i${String(i).padStart(2, "0")}.json`);
const keyOf = (d, i) => `${d}:${i}`;
const entry = (c, d, i, s = readJson(sumFile(c, i))) => s?.winds?.[keyOf(d, i)];
const done = (c, d, i, s) => entry(c, d, i, s)?.rule === ruleOf(c);
// calm is played where results/solve's calm route does not stand under the near rule
// calm routes a tenth of a bar puts in the sand (flag-sand-risk.mjs) are played again
const CALM_RISK = readJson(path.join(OUTD, "calm-sand-risk.json")) ?? {};
function calmStands(c) {
  if (PAR[c.hole] === 5 || CALM_RISK[P.cupKey(c)]) return false;
  const r = readJson(path.join(HERE, "results", "solve", `h${P.hh(c.hole)}-${c.id}.json`));
  if (!r?.solved) return false;
  const last = r.strokes[r.strokes.length - 1], t = r.tries.find((x) => x.k === last.k && x.gamePower === last.gamePower && x.heading === last.heading);
  if (!last.holed || (t?.how ?? "roll") === "flag") return false;
  // a par 4's tee shot at full power (the lie's cap) or the calm route is played again
  const capOf = (club, lie) => (lie === 2 ? 0.75 : lie === 3 || lie === 16 ? ({ driver: 0.25, spoon: 0.25, wedge: 0.75 }[club] ?? 0.5) : 1);
  return r.strokes.slice(0, -1).every((x) => { const y = r.tries.find((z) => z.k === x.k && z.gamePower === x.gamePower && z.heading === x.heading); return x.gamePower >= capOf(x.club, y?.lie) - 0.0015; });
}
const dirsAt = (c, i) => (i === 0 ? (calmStands(c) ? [] : [0]) : DIRS);
// the queue: per hole, per speed, every pin, its winds not yet played
const queue = [];
for (const h of HOLES) for (const i of SPEEDS) for (const c of cups.filter((x) => x.hole === h)) {
  const s = readJson(sumFile(c, i)), winds = dirsAt(c, i).filter((d) => !done(c, d, i, s));
  if (winds.length) queue.push({ c, speedIdx: i, winds, tries: 0 });
}
const total = cups.reduce((a, c) => a + SPEEDS.reduce((b, i) => b + dirsAt(c, i).length, 0), 0);
log(`the wind campaign (rule ${RULE}: holed or within 1 ft): ${cups.length} pins, holes ${HOLES.join(", ")}; speeds ${SPEEDS.map((i) => 2 * i).join(", ")} mph x ${DIRS.length} directions (calm where results/solve's does not stand) = ${total} winds, ${queue.reduce((a, j) => a + j.winds.length, 0)} to play in ${queue.length} jobs on instances ${INST.join(", ")}; at most ${MAX_TRIES} tries a wind`);

const busy = new Set();      // pin:speed
const running = new Map();   // instance -> { job, child, startedAt }
const busyKey = (j) => `${P.cupKey(j.c)}:${j.speedIdx}`;
const solveLog = (c) => path.join(HERE, "state", "solve", `h${P.hh(c.hole)}-${c.id}.log`);
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };

// the instance's Dolphins (by their user dir) and its hole-solve runs
function instancePids(n) {
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne ${process.pid} -and $_.CommandLine -and (($_.Name -eq 'node.exe' -and $_.CommandLine -match 'hole-solve\\.mjs' -and $_.CommandLine -match '--instance ${n}( |$)') -or ($_.Name -eq 'Dolphin.exe' -and $_.CommandLine.Contains('state\\user${n} '))) } | ForEach-Object { $_.ProcessId }`;
  try { return execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8", windowsHide: true }).split(/\s+/).filter(Boolean).map(Number); } catch { return []; }
}
const killAll = (pids) => { for (const pid of pids) try { execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" }); } catch { /* gone */ } };

// the next job: the queue's order (the current hole first), skipping a pin and speed already running
function nextJob() {
  const k = queue.findIndex((j) => !busy.has(busyKey(j)));
  return k < 0 ? null : queue.splice(k, 1)[0];
}
function start(n) {
  if (P.freeGB() < 6) { log(`only ${P.freeGB().toFixed(1)} GB free: instance ${n} takes no new job`); return false; }
  const job = nextJob();
  if (!job) return false;
  const s = readJson(sumFile(job.c, job.speedIdx));
  job.winds = job.winds.filter((d) => !done(job.c, d, job.speedIdx, s));
  if (!job.winds.length) return start(n);
  busy.add(busyKey(job));
  const w = wins[n], logf = path.join(LOGD, `i${n}.log`);
  const out = fs.openSync(logf, "a");
  const label = `${COURSE(job.c.hole)} H${job.c.hole} ${job.c.label} ${job.speedIdx ? `${2 * job.speedIdx} mph` : "calm"}`;
  const args = ["--max-old-space-size=7000", "tools/harness/hole-solve.mjs", "--instance", String(n), "--hole", String(job.c.hole), "--cup", job.c.id,
    "--winds", job.winds.map((d) => keyOf(d, job.speedIdx)).join(","), "--max-tries", String(MAX_TRIES), "--rule", RULE,
    "--x", String(w.x), "--y", String(w.y), "--w", String(w.w), "--h", String(w.h), "--label", label];
  const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ["ignore", out, out], windowsHide: true });
  const r = { job, child, startedAt: Date.now() };
  running.set(n, r);
  log(`instance ${n}: ${P.cupKey(job.c)} (${job.c.label}, par ${PAR[job.c.hole]}) ${job.speedIdx ? `at ${2 * job.speedIdx} mph, directions ${job.winds.join(",")}` : "calm"}${job.tries ? ` (again, ${job.tries})` : ""}`);
  child.on("exit", (code) => {
    try { fs.closeSync(out); } catch { /* */ }
    running.delete(n);
    busy.delete(busyKey(job));
    const s2 = readJson(sumFile(job.c, job.speedIdx)), rest = job.winds.filter((d) => !done(job.c, d, job.speedIdx, s2));
    const got = job.winds.filter((d) => entry(job.c, d, job.speedIdx, s2)?.solved).length;
    log(`instance ${n}: ${P.cupKey(job.c)} ${job.speedIdx ? `at ${2 * job.speedIdx} mph` : "calm"}: ${got} of ${job.winds.length} solved${rest.length ? `, ${rest.length} unplayed` : ""} (exit ${r.stalled ? "stalled" : code}, ${((Date.now() - r.startedAt) / 60000).toFixed(1)} min)`);
    if (rest.length && job.tries < 2) queue.unshift({ ...job, winds: rest, tries: job.tries + 1 });
    board();
    maybePublish(job.c.hole);
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

// the board: per pin, per speed, the directions solved / played
function board() {
  const rows = [], bySpeed = Object.fromEntries(SPEEDS.map((i) => [i, { solved: 0, played: 0, total: 0 }]));
  let solved = 0, played = 0;
  for (const h of HOLES) for (const c of cups.filter((x) => x.hole === h)) {
    const cells = SPEEDS.map((i) => {
      const s = readJson(sumFile(c, i)), ds = dirsAt(c, i);
      const es = ds.map((d) => entry(c, d, i, s)).filter((e) => e?.rule === ruleOf(c));
      const ok = es.filter((e) => e.solved).length;
      bySpeed[i].solved += ok; bySpeed[i].played += es.length; bySpeed[i].total += ds.length; solved += ok; played += es.length;
      return !ds.length ? "—" : es.length ? `${ok}/${es.length}` : "";
    });
    rows.push(`| ${h} | ${c.id} ${c.label} | ${cells.join(" | ")} |`);
  }
  const md = [
    "# The wind campaign: every pin in every wind", "",
    `${solved} of ${total} winds solved, ${played} played: holed or within 1 ft of the cup with the attempt stroke (a par 3's tee shot, a par 4's or 5's second), no flag catches. Holes in the campaign's order; each cell is the directions solved / played at that speed (— : calm stands from results/solve). Updated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`, "",
    `| Speed | ${SPEEDS.map((i) => (i ? `${2 * i} mph` : "calm")).join(" | ")} |`, `|---|${SPEEDS.map(() => "---").join("|")}|`,
    `| solved / played / all | ${SPEEDS.map((i) => `${bySpeed[i].solved}/${bySpeed[i].played}/${bySpeed[i].total}`).join(" | ")} |`, "",
    `| Hole | Pin | ${SPEEDS.map((i) => (i ? `${2 * i}` : "0")).join(" | ")} |`, `|---|---|${SPEEDS.map(() => "---").join("|")}|`, ...rows, "",
  ].join("\n");
  fs.writeFileSync(path.join(OUTD, "BOARD.md"), md);
}
setInterval(board, 120000).unref();

// a hole with no job queued or running: published once, one at a time
const PUBF = path.join(LOGD, "published.json");
const published = new Set(readJson(PUBF) ?? []);
let publishing = Promise.resolve();
const BASH = "C:/Program Files/Git/bin/bash.exe";
function maybePublish(h) {
  if (published.has(h) || queue.some((j) => j.c.hole === h) || [...running.values()].some((r) => r.job.c.hole === h)) return;
  published.add(h);
  fs.writeFileSync(PUBF, JSON.stringify([...published]));
  publishing = publishing.then(() => new Promise((res) => {
    log(`hole ${h}: no job left; publishing it to Caddie Switch`);
    let out = "";
    const ch = spawn(BASH, ["tools/harness/publish-hole.sh", String(h)], { cwd: ROOT, windowsHide: true });
    ch.stdout.on("data", (d) => (out += d)); ch.stderr.on("data", (d) => (out += d));
    ch.on("exit", (code) => { log(`hole ${h}: publish ${code === 0 ? "done" : `FAILED (exit ${code})`}: ${out.trim().split(/\r?\n/).slice(-1)[0] ?? ""}`); res(); });
    ch.on("error", (e) => { log(`hole ${h}: publish FAILED: ${e.message}`); res(); });
  }));
}
let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  board();
  log(`the wind campaign: done (${queue.length} jobs left)`);
  publishing.then(() => process.exit(0));
}

// the instances free of earlier runs, then a staggered start (boots 20 s apart)
board();
for (const h of HOLES) maybePublish(h);   // the holes finished before this start
for (const n of INST) {
  for (let pids = instancePids(n), said = false; pids.length; pids = instancePids(n)) {
    if (!said) { log(`instance ${n} is busy (pids ${pids.join(", ")}): waiting`); said = true; }
    await new Promise((r) => setTimeout(r, 15000));
  }
  if (!start(n)) break;
  await new Promise((r) => setTimeout(r, 20000));
}
if (!running.size) finish();
