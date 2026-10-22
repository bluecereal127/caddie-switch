// One 3-hole course's cups solved one after another on one harness instance,
// for the savestate campaign (the user, 2026-10-22: "start utilizing save
// states until you can get an eagle on each par 4, hole in one on the par 3,
// and eagle on par five ... for each of the ~6 pin locations", the par 3s'
// ace edges, "start over with all 6 windows", the windows on the portrait
// monitor). Per hole, the par 3 first, then the par 4, then the par 5: the
// tee states the hole's cups lack are made in one make-pinstates.mjs --tees
// session, then each cup is played by hole-solve.mjs. The instance's
// Dolphins open where state/windows.json puts the instance (lib/dolphin.mjs
// windowFor; solve-campaign.mjs writes it). A cup already solved
// (results/solve/hHH-<id>.json solved, a par 3 with its edges) is skipped,
// so a rerun goes on where the last one stopped; a run that outlives its
// budget has its Dolphin stopped (by the pid hole-solve.mjs records) and
// counts as not solved. The board: results/solve/board-<slug>.json.
//   node tools/harness/solve-course.mjs --course resort-a --instance 15 [--x 2560 --y -929 --w 720 --h 436]
import fs from "node:fs";
import path from "node:path";
import { spawn, execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as P from "./lib/pins.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const COURSES = {
  "resort-a": { name: "Resort A", holes: [1, 2, 3] }, "resort-b": { name: "Resort B", holes: [4, 5, 6] },
  "resort-c": { name: "Resort C", holes: [7, 8, 9] }, "classic-a": { name: "Classic A", holes: [10, 11, 12] },
  "classic-b": { name: "Classic B", holes: [13, 14, 15] }, "classic-c": { name: "Classic C", holes: [16, 17, 18] },
};
const PAR = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5 };
const slug = arg("--course", null), course = COURSES[slug];
const inst = Number(arg("--instance", NaN));
if (!course || !(inst >= 1)) { console.error(`usage: node tools/harness/solve-course.mjs --course ${Object.keys(COURSES).join("|")} --instance N [--x --y --w --h]`); process.exit(2); }
const win = { x: Number(arg("--x", 2560)), y: Number(arg("--y", -929)), w: Number(arg("--w", 720)), h: Number(arg("--h", 436)) };
// minutes a run gets before its Dolphin is stopped: the tee states of a
// hole (a pre state played out first on 12, 14, 17, 18), a par 3 with its
// edges, a par 4's two strokes, a par 5's three
const BUDGET = { tees: 90, 3: 60, 4: 180, 5: 420 };
const SOLVE = path.join(HERE, "results", "solve");
// --holes 14: only those holes of the course (a helper on a free instance; its
// log and board are named after them); --name: the name in the window title
const ONLY = arg("--holes", null)?.split(",").map(Number) ?? null;
const TAG = ONLY ? `${slug}-h${ONLY.join("-")}` : slug, NAME = arg("--name", ONLY ? `${course.name} H${ONLY.join("/")}` : course.name);
const LOGF = path.join(HERE, "state", "solve", `campaign-${TAG}.log`);
const BOARD = path.join(SOLVE, `board-${TAG}.json`);
fs.mkdirSync(SOLVE, { recursive: true });
fs.mkdirSync(path.dirname(LOGF), { recursive: true });
const log = (m) => { const l = `[${new Date().toISOString().slice(11, 19)}] ${m}`; console.log(l); fs.appendFileSync(LOGF, l + "\n"); };

const resultOf = (c) => { try { return JSON.parse(fs.readFileSync(path.join(SOLVE, `h${P.hh(c.hole)}-${c.id}.json`), "utf8")); } catch { return null; } };
// a par 3's ace counts once its edges are the second search's (hole-solve.mjs edges v 2)
const finished = (c, r = resultOf(c)) => !!r?.solved && (PAR[c.hole] !== 3 || r.strokes?.length !== 1 || r.edges?.v === 2);
const hasTee = (c) => fs.existsSync(P.savePath(P.teeName(c)));
// the holes par 3 first, then par 4, then par 5; each hole's cups in slot order
const order = [...course.holes].filter((h) => !ONLY || ONLY.includes(h)).sort((a, b) => PAR[a] - PAR[b] || a - b);
const all = order.flatMap((h) => P.cups({ holes: [h] }));
const board = { course: course.name, slug, instance: inst, window: win, started: new Date().toISOString(), cups: {} };
const saveBoard = () => {
  board.updated = new Date().toISOString();
  board.solved = all.filter((c) => finished(c)).length;
  board.total = all.length;
  fs.writeFileSync(BOARD, JSON.stringify(board, null, 1));
};
function note(c, status, extra = {}) {
  const r = resultOf(c);
  board.cups[P.cupKey(c)] = {
    hole: c.hole, id: c.id, label: c.label, par: PAR[c.hole], target: r?.target ?? null, status,
    strokes: r?.strokes?.map((x) => ({ club: x.club, power: +x.gamePower.toFixed(4), aimDeg: +((x.heading * 180) / Math.PI).toFixed(3) })) ?? null,
    tries: r?.tries?.length ?? 0, min: r?.ms != null ? +(r.ms / 60000).toFixed(1) : null, edges: r?.edges ?? null, ...extra,
  };
  saveBoard();
}

// a child run with its budget: past it, the run's Dolphin (pidOf) and the
// run itself are stopped by pid
function run(args, budgetMin, pidOf = () => null) {
  return new Promise((resolve) => {
    const out = fs.openSync(LOGF, "a");
    const ch = spawn(process.execPath, ["--max-old-space-size=7000", ...args], { cwd: ROOT, stdio: ["ignore", out, out], windowsHide: true });
    let over = false;
    const timer = setTimeout(() => {
      over = true;
      log(`  over its ${budgetMin} min budget: stopping it`);
      const dp = pidOf();
      for (const pid of [dp, ch.pid].filter(Boolean)) try { execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" }); } catch { /* gone */ }
    }, budgetMin * 60000);
    ch.on("exit", (code) => { clearTimeout(timer); try { fs.closeSync(out); } catch { /* */ } resolve(over ? "budget" : code); });
  });
}

// the instance's own processes from a worker that was stopped (its last
// make-pinstates or hole-solve run goes on to its end): this worker waits
function instanceBusy() {
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne ${process.pid} -and $_.CommandLine -and (($_.Name -eq 'node.exe' -and $_.CommandLine -match '(hole-solve|make-pinstates)\\.mjs' -and $_.CommandLine -match '--instance ${inst}( |$)') -or ($_.Name -eq 'Dolphin.exe' -and $_.CommandLine.Contains('state\\user${inst} '))) } | ForEach-Object { $_.ProcessId }`;
  try { return execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8", windowsHide: true }).split(/\s+/).filter(Boolean).map(Number); } catch { return []; }
}
// Dolphin's blocking panic dialogs on this instance, dismissed every 20 s
// (dismiss-warnings.ps1: instance 17 stopped at boot behind "IOS_FS: Failed
// to rename temporary FST file", 2026-10-22)
setInterval(() => {
  execFile("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(HERE, "dismiss-warnings.ps1"), "-Instance", String(inst)], { windowsHide: true, timeout: 15000 }, (err, out) => {
    for (const l of String(out ?? "").split(/\r?\n/)) if (l.trim()) log(`  ${l.trim()}`);
  });
}, 20000).unref();

for (let busy = instanceBusy(), said = ""; busy.length; busy = instanceBusy()) {
  if (busy.join() !== said) { said = busy.join(); log(`instance ${inst} is busy (pids ${said}): waiting for it`); }
  await new Promise((r) => setTimeout(r, 15000));
}
const t0 = Date.now();
log(`${course.name} on instance ${inst}: ${all.length} cups (holes ${order.join(", ")}: par ${order.map((h) => PAR[h]).join(", ")}), ${all.filter((c) => finished(c)).length} already solved; window ${win.x},${win.y} ${win.w}x${win.h}; ${P.freeGB().toFixed(1)} GB free`);
for (const c of all) if (finished(c)) note(c, "solved");
saveBoard();
// pass 1: every cup not finished; pass 2: those a failure, the budget or a
// missing tee state stopped (a search that ran out is deterministic: rerun only
// by a new worker, after a change to the search)
const retry = (c) => ["failed", "over budget", "no tee state", "solved, edges unfinished"].includes(board.cups[P.cupKey(c)]?.status);
for (let pass = 1; pass <= 2; pass++) {
if (pass === 2) {
  const again = all.filter((c) => !finished(c) && retry(c));
  if (!again.length) break;
  log(`pass 2: ${again.map((c) => P.cupKey(c)).join(", ")}`);
}
for (const h of order) {
  const cups = P.cups({ holes: [h] }).filter((c) => !finished(c) && (pass === 1 || retry(c)));
  if (!cups.length) continue;
  const need = cups.filter((c) => !hasTee(c));
  for (let pass = 0; pass < 2 && need.some((c) => !hasTee(c)); pass++) {
    if (P.freeGB() < 6) { log(`only ${P.freeGB().toFixed(1)} GB free: stopping`); process.exit(5); }
    const ids = need.filter((c) => !hasTee(c)).map((c) => c.id);
    log(`hole ${h}: making the tee states of ${ids.join(", ")}${pass ? " (again)" : ""}`);
    const code = await run(["tools/harness/make-pinstates.mjs", "--hole", String(h), "--ids", ids.join(","), "--instance", String(inst), "--tees"], BUDGET.tees);
    log(`hole ${h}: tee states ${need.filter(hasTee).map((c) => c.id).join(", ") || "none"} (make-pinstates ${code})`);
  }
  for (const c of cups) {
    if (!hasTee(c)) { log(`${P.cupKey(c)}: no tee state; skipped`); note(c, "no tee state"); continue; }
    if (P.freeGB() < 6) { log(`only ${P.freeGB().toFixed(1)} GB free: stopping`); process.exit(5); }
    const nSolved = all.filter((x) => finished(x)).length;
    const label = `${NAME} ${nSolved}/${all.length} solved`;
    const startedAt = Date.now();
    log(`${P.cupKey(c)} (${c.label}, par ${PAR[c.hole]}): solving (${label})`);
    note(c, "running");
    const code = await run(["tools/harness/hole-solve.mjs", "--instance", String(inst), "--hole", String(c.hole), "--cup", c.id,
      "--x", String(win.x), "--y", String(win.y), "--w", String(win.w), "--h", String(win.h), "--label", label], BUDGET[PAR[c.hole]],
      () => { const r = resultOf(c); return r && Date.parse(r.started) >= startedAt - 5000 ? r.dolphinPid : null; });
    const r = resultOf(c);
    const status = finished(c, r) ? "solved" : code === "budget" ? "over budget" : r?.error ? "failed" : r?.solved ? "solved, edges unfinished" : "not solved";
    note(c, status, { exit: code });
    log(`${P.cupKey(c)}: ${status}${r?.strokes ? `: ${r.strokes.length} strokes` : ""}${r?.edges ? `; edges ${r.edges.left?.offDeg} / ${r.edges.right?.offDeg} deg${r.edges.widthYd != null ? `, ${r.edges.widthYd} yd wide` : ""}` : ""} (${r?.tries?.length ?? 0} tries, ${((Date.now() - startedAt) / 60000).toFixed(1)} min)`);
  }
}
}
saveBoard();
log(`${course.name} done: ${board.solved} of ${board.total} cups solved in ${((Date.now() - t0) / 3600000).toFixed(1)} h`);
