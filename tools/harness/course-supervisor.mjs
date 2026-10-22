// Keeps a 3-hole course going on each slot (a harness instance, its driver
// port, its window's place), attempt after attempt, until the course is
// played in the goal (6 under par by default, the user's since 2026-10-22,
// raised from 5): each attempt starts on the
// "Select Course" menu (course-launch.sh: saves/menu-course.sav, the course's
// tile, its first tee) and plays the three holes naturally (round-ctl.mjs ->
// round-play.mjs, the planner re-imported for every stroke). When one ends
// (its controller logs "round over") the game's own count per hole goes into
// results/courses/SLUG/attempts.json and the board (results/courses/
// BOARD.md), the scorecard screenshot is kept (card-N.png, and best.png),
// course-notes.mjs writes the attempt up in results/courses/SLUG/NOTES.md
// (what each stroke did against its plan; the planner's memory, results/
// knowledge/strokes.jsonl, has each stroke already, which is how the next
// attempts make use of it), the driver is told to quit and the next attempt
// starts. A course in the goal stops there, its card left on screen.
// Attempts are started outside this process (PowerShell Start-Process), so
// they outlive it: a restarted supervisor adopts the attempt each slot is
// playing.
//   node tools/harness/course-supervisor.mjs --slots 18:8818:0:0:resort-a,15:8815:0:700:classic-a,... [--goal -6] [--w 853] [--h 510]
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const STATE = path.join(HERE, "state");
// the series: "courses" (the game's own wind) or another, e.g. "calm" with
// --wind 0:0 (the user, 2026-10-22: set the wind, start with none): its own
// results/<phase> and state/<phase>, attempts numbered from 1
const PHASE = process.argv.includes("--phase") ? process.argv[process.argv.indexOf("--phase") + 1] : "courses";
const WIND = process.argv.includes("--wind") ? process.argv[process.argv.indexOf("--wind") + 1] : "";
const CDIR = path.join(HERE, "results", PHASE);
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const goal = Number(arg("--goal", -6)), W = Number(arg("--w", 853)), Hh = Number(arg("--h", 510));
const COURSES = {
  "resort-a": { name: "Resort A", holes: [1, 2, 3] }, "resort-b": { name: "Resort B", holes: [4, 5, 6] }, "resort-c": { name: "Resort C", holes: [7, 8, 9] },
  "classic-a": { name: "Classic A", holes: [10, 11, 12] }, "classic-b": { name: "Classic B", holes: [13, 14, 15] }, "classic-c": { name: "Classic C", holes: [16, 17, 18] },
};
const PAR = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5 };
const slots = arg("--slots", "").split(",").filter(Boolean).map((s) => { const [inst, port, x, y, slug] = s.split(":"); return { inst: Number(inst), port: Number(port), x: Number(x), y: Number(y), slug }; });
for (const s of slots) if (!COURSES[s.slug]) throw new Error(`no course ${s.slug}`);
const SDIR = path.join(STATE, PHASE);
const say = (m) => { const l = `[${new Date().toISOString().slice(11, 19)}] ${m}`; console.log(l); fs.mkdirSync(SDIR, { recursive: true }); fs.appendFileSync(path.join(SDIR, "supervisor.log"), l + "\n"); };
const logOf = (slug, n) => path.join(SDIR, `${slug}-${n}.log`);
const ctlOf = (slug, n) => path.join(SDIR, `${slug}-${n}-ctl.log`);
const outOf = (slug, n) => path.join(CDIR, slug, `attempt-${n}.json`);
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");
const attemptsFile = (slug) => path.join(CDIR, slug, "attempts.json");
const attempts = (slug) => (fs.existsSync(attemptsFile(slug)) ? JSON.parse(fs.readFileSync(attemptsFile(slug), "utf8")) : []);
const lastN = (slug) => { let n = 0; for (const f of fs.existsSync(SDIR) ? fs.readdirSync(SDIR) : []) { const m = new RegExp(`^${slug}-(\\d+)-ctl\\.log$`).exec(f); if (m) n = Math.max(n, Number(m[1])); } return n; };
const post = (port, op, args = []) => new Promise((resolve) => {
  const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/", timeout: 20000 }, (res) => { let t = ""; res.on("data", (d) => (t += d)); res.on("end", () => resolve(t)); });
  req.on("error", (e) => resolve(`error ${e.message}`)); req.on("timeout", () => { req.destroy(); resolve("error timeout"); }); req.end(JSON.stringify({ op, args }));
});
const ps = (cmd) => { try { return execFileSync("powershell", ["-NoProfile", "-Command", cmd], { timeout: 60000 }).toString().trim(); } catch { return ""; } };
const dolphinsOn = (inst) => Number(ps(`(Get-CimInstance Win32_Process -Filter "Name='Dolphin.exe'" | Where-Object { $_.CommandLine -match '\\\\user${inst}[ "]' } | Measure-Object).Count`) || 0);
// every process of one slot's attempt (its launcher, driver, controller, keeper and Dolphin), by command line
function killSlot(s, n) {
  const pat = [`course-launch\\.sh.* ${s.inst} ${s.port} ${s.slug} ${n} `, `driver\\.mjs --port ${s.port} `, `round-ctl\\.mjs --port ${s.port} `, `round-start\\.mjs --port ${s.port} `, `round-window\\.ps1.*-Instance ${s.inst} `, `\\\\user${s.inst}[ "]`].join("|");
  ps(`Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match '${pat}' -and $_.Name -match 'node|bash|powershell|Dolphin' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`);
}
function launch(s) {
  const n = lastN(s.slug) + 1;
  fs.mkdirSync(SDIR, { recursive: true });
  fs.writeFileSync(ctlOf(s.slug, n), `[${new Date().toISOString().slice(11, 19)}] queued by course-supervisor.mjs\n`);
  const bash = "C:\\Program Files\\Git\\bin\\bash.exe", script = path.join(HERE, "course-launch.sh").split(path.sep).join("/");
  const args = [script, s.inst, s.port, s.slug, n, s.x, s.y, W, Hh, PHASE, WIND || "-"].map((a) => `'${a}'`).join(",");
  ps(`Start-Process -WindowStyle Hidden -FilePath '${bash}' -ArgumentList ${args} -WorkingDirectory '${ROOT}'`);
  Object.assign(s, { n, state: "running", since: Date.now() });
  say(`${COURSES[s.slug].name}${PHASE === "courses" ? "" : ` ${PHASE}`} #${n} started on instance ${s.inst}`);
}
// an attempt's card: the game's own count per finished hole
function card(slug, n) {
  const holes = {};
  for (const l of read(logOf(slug, n)).split("\n")) {
    const m = /hole (\d+): \d+ strokes struck, the game counts (\d+)/.exec(l);
    if (m && Number(m[2]) > 0 && COURSES[slug].holes.includes(Number(m[1]))) holes[Number(m[1])] = Number(m[2]);
  }
  return holes;
}
function board() {
  const rows = [], md = ["# 3-hole courses", "", `Each course played over and over by its own harness instance (tools/harness/course-supervisor.mjs), natural play as in the 18-hole rounds; the goal ${goal} (${goal < 0 ? -goal + " under" : goal + " over"} par, ${12 + goal} strokes on a par-12 course). The game's own count per hole.`, "", "| Course | Attempts | Best | Last five | Goal |", "|---|---|---|---|---|"];
  for (const [slug, c] of Object.entries(COURSES)) {
    const a = attempts(slug).filter((x) => x.complete);
    if (!a.length && !slots.some((s) => s.slug === slug)) continue;
    const best = a.length ? a.reduce((b, x) => (x.toPar < b.toPar ? x : b)) : null;
    const fmt = (t) => (t > 0 ? `+${t}` : t === 0 ? "E" : `${t}`);
    rows.push({ slug, attempts: a.length, best: best ? { n: best.n, toPar: best.toPar, holes: best.holes } : null });
    md.push(`| ${c.name} (holes ${c.holes.join(", ")}) | ${a.length} | ${best ? `${fmt(best.toPar)} (#${best.n}: ${c.holes.map((h) => best.holes[h]).join("-")})` : "-"} | ${a.slice(-5).map((x) => fmt(x.toPar)).join(" ")} | ${best && best.toPar <= goal ? "reached" : ""} |`);
  }
  fs.mkdirSync(CDIR, { recursive: true });
  fs.writeFileSync(path.join(CDIR, "board.json"), JSON.stringify({ goal, courses: rows }, null, 1));
  fs.writeFileSync(path.join(CDIR, "BOARD.md"), md.join("\n") + "\n");
}
function finish(s, why) {
  const c = card(s.slug, s.n), hs = COURSES[s.slug].holes, complete = hs.every((h) => c[h]);
  const strokes = hs.reduce((t, h) => t + (c[h] ?? 0), 0), toPar = hs.reduce((t, h) => t + (c[h] ? c[h] - PAR[h] : 0), 0);
  let cardPng = null;
  try {
    const shot = JSON.parse(read(outOf(s.slug, s.n)) || "{}").finalScreenshot;
    if (shot && fs.existsSync(shot)) { cardPng = path.join(CDIR, s.slug, `card-${s.n}.png`); fs.copyFileSync(shot, cardPng); }
  } catch { /* no card */ }
  const list = attempts(s.slug).filter((a) => a.n !== s.n);
  const prevBest = list.filter((a) => a.complete).reduce((b, a) => Math.min(b, a.toPar), Infinity);
  list.push({ n: s.n, instance: s.inst, holes: c, strokes, toPar, complete, why, card: cardPng ? path.relative(HERE, cardPng).split(path.sep).join("/") : null, ended: new Date().toISOString() });
  list.sort((a, b) => a.n - b.n);
  fs.mkdirSync(path.join(CDIR, s.slug), { recursive: true });
  fs.writeFileSync(attemptsFile(s.slug), JSON.stringify(list, null, 1));
  if (complete && cardPng && toPar < prevBest) fs.copyFileSync(cardPng, path.join(CDIR, s.slug, "best.png"));
  board();
  try { execFileSync(process.execPath, ["--max-old-space-size=6000", path.join(HERE, "course-notes.mjs"), "--slug", s.slug, "--n", String(s.n), "--phase", PHASE], { cwd: ROOT, timeout: 300000, stdio: "ignore" }); } catch (e) { say(`notes for ${s.slug} #${s.n} failed: ${e.message.split("\n")[0]}`); }
  const fmt = (t) => (t > 0 ? `+${t}` : t === 0 ? "E" : `${t}`);
  say(`${COURSES[s.slug].name} #${s.n} (instance ${s.inst}) ${complete ? "over" : `ended unfinished (${why})`}: ${hs.map((h) => c[h] ?? "-").join("-")}, ${strokes} strokes, ${fmt(toPar)}${complete && toPar < prevBest ? " (course best)" : ""}`);
  return complete && toPar <= goal;
}

// the slot's last attempt closed (its driver told to quit, then anything of
// it still running stopped), and the next one started
async function next(s) {
  if (s.n) {
    await post(s.port, "quit");
    for (let i = 0; i < 30 && dolphinsOn(s.inst) > 0; i++) await new Promise((r) => setTimeout(r, 1000));
    killSlot(s, s.n);
    for (let i = 0; i < 15 && dolphinsOn(s.inst) > 0; i++) await new Promise((r) => setTimeout(r, 1000));
  }
  launch(s);
}

// adopt what each slot is doing, else record its last attempt and start the next
for (const s of slots) {
  const n = lastN(s.slug), recorded = attempts(s.slug).some((a) => a.n === n);
  if (n && !read(ctlOf(s.slug, n)).includes("round over") && !recorded && dolphinsOn(s.inst) > 0) { Object.assign(s, { n, state: "running", since: Date.now() }); say(`adopted ${COURSES[s.slug].name} #${n} on instance ${s.inst}`); continue; }
  if (n && !recorded) { s.n = n; if (finish(s, read(ctlOf(s.slug, n)).includes("round over") ? "played" : "found stopped")) { s.state = "done"; say(`GOAL: ${COURSES[s.slug].name} in ${goal} or better (#${s.n}); its card stays on screen`); continue; } }
  if (attempts(s.slug).some((a) => a.complete && a.toPar <= goal)) { s.state = "done"; say(`${COURSES[s.slug].name} already in the goal`); continue; }
  s.n = n;
  await next(s);
}
board();
for (;;) {
  for (const s of slots) {
    if (s.state !== "running") continue;
    const ctl = read(ctlOf(s.slug, s.n)), log = logOf(s.slug, s.n);
    const quiet = fs.existsSync(log) ? Date.now() - fs.statSync(log).mtimeMs : Date.now() - s.since;
    let ended = null;
    if (ctl.includes("round over")) ended = "played";
    else if (Date.now() - s.since > 180000 && dolphinsOn(s.inst) === 0) ended = "its Dolphin closed";
    else if (quiet > 12 * 60000) ended = `no log line for ${Math.round(quiet / 60000)} min`;
    if (!ended) continue;
    const inGoal = finish(s, ended);
    if (inGoal) { s.state = "done"; say(`GOAL: ${COURSES[s.slug].name} in ${goal} or better (#${s.n}); its card stays on screen`); continue; }
    await next(s);
  }
  if (slots.every((s) => s.state === "done")) { say("every course in the goal"); process.exit(0); }
  await new Promise((r) => setTimeout(r, 15000));
}
