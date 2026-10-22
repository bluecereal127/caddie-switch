// The putting campaign: every one of WSR's cup locations (tools/wsr-pins.json
// holes[h].spots, lib/pins.mjs cups(): 118) taken through its states and the
// putting battery, over several harness instances at once, by running the
// step tools as child processes:
//   pre      a play-route hole's pre state (SAVES/pins/hHH-pre.sav: the
//            previous hole played out to the state before its holing stroke),
//            made by make-pinstates.mjs together with the first tee state the
//            hole needs; holes 1, 4, 7, 10, 13, 16 and 19 open a course and
//            need none (the menu route);
//   tee      the cup's tee state, its pin slot forced through choosePin's
//            result at hole start (make-pinstates.mjs --ids <cup>);
//   green    its green state by real strokes (make-pingreen.mjs --ids <cup>,
//            which deletes the tee state once the green state is saved);
//   battery  run-pinputts.mjs from the green state over the cup's 21 spots
//            (or --spots), in --parts runs with their own --spots and --out,
//            each on an instance of its own (report.mjs pins merges a cup's
//            files). Every outcome is the game's own, as those tools make it.
//
// Scheduling: one job per instance, never two on one. A free instance takes
// the next step of the first cup in the order (--order hole: the cup list's,
// hole and slot; steep-first: by the slope of the KCL triangle under the
// cup, steepest first) that has one it can start: a cup's steps run in turn,
// its battery parts side by side; a play-route hole's tee states wait for its
// pre state, which one job makes, so the previous hole is played out once.
// Before a launch the campaign checks that nothing else uses the instance
// (its DSU port free, no Dolphin running with its user dir), and leaves a
// cup alone while a step tool it did not start works on it (a pilot, a run
// by hand: read from the process list), so two writers never meet on one
// state or battery file.
//
// Resumable: what is done is read from the outputs, not from the status
// file: a pre state with its SAVES/pins/index.json entry, a tee or green
// state file, and the battery's spots marked done in any results/pins file
// of that cup and green state (run-pinputts.mjs keeps a file's finished
// spots and re-creates an unfinished one by its recorded putt, so a part is
// simply run again). A step whose output exists is skipped. A step that ends
// without its output is tried once more (on another instance when one is
// free); failing again marks the cup failed (a pre state: every cup of the
// hole still needing a tee) and the rest go on. A step that died because
// Windows refused it a file for a moment (another program holding it: errno
// UNKNOWN on open, EBUSY, EPERM, EACCES) is tried again without counting, up
// to 5 times. A failure stays recorded for later runs; --retry-failed clears it.
//
// Disk: no pre, tee or green step starts under --min-gb free (5; a state is
// ~45 MB) and no battery part under 5.2 GB (run-pinputts.mjs itself stops
// before a spot state under 5e9 bytes); steps already running go on.
//
// Stopping: SIGINT (Ctrl+C), SIGBREAK, SIGTERM, SIGHUP or a file
// state/campaign/STOP kills the running steps by the PIDs the campaign
// spawned (taskkill /T: the step tool and the Dolphin it started; a step
// tool's Dolphin dies with it in any case, since Node puts every child it
// spawns into a kill-on-close job object), records them as interrupted (not
// a failure), removes what a killed step left half-written (a state file
// written after the step started and missing from SAVES/pins/index.json, the
// index's temporary file; a battery file that no longer parses is renamed
// *.damaged-<time>) and exits with code 130. A console Ctrl+C reaches the
// step tools too, which die at once (exit 0xC000013A); they are recorded and
// cleaned up the same way. A campaign killed outright leaves its steps
// "running" in status.json; the next run records them as interrupted and
// cleans up after them. state/campaign/DRAIN: no new steps, exit once the
// running ones end.
//
// Logs: one per step under state/campaign/ (hHH-pre.log, hHH-sN-tee.log,
// -green.log, -battery.log or -battery-p<k>.log), every attempt appended
// after a header line with its command; the campaign's own lines (one per
// started and one per finished step) on stdout and in campaign.log. Status:
// state/campaign/status.json, rewritten on every event: per cup its status,
// the step running or next, the instance, every attempt (instance, pid,
// start, end, ms, exit code, result, log, error, the spots it finished), the
// green state and the results files; per pre-state hole the same; the
// running steps; free disk; every run of the campaign.
//
// --project: no Dolphin; the campaign's own scheduler run on a clock against
// the step times measured so far (status.json's finished attempts, the pin
// index's tee, green and pre timings, the battery files' per-spot timings),
// for the selected cups (default all 118) from scratch and for what remains,
// on the --instances count (default 16), at --parts 1 and 3. --dry-run: what
// is done, what is left, and what would start first.
//
//   node tools/harness/campaign.mjs --instances 1-16 [--cups h8s4,h21s3 | --holes 1,2 | --steep 8]
//        [--order hole | steep-first] [--parts 1] [--spots approach,r3-a000,...]
//        [--battery "--trace-deg 8"] [--plans <dir>] [--min-gb 5] [--stall-min 20]
//        [--retry-failed] [--list cups.json] [--dry-run | --project [--slowdown 1]]
// --battery: further run-pinputts.mjs options (--tests, --speeds, --window-spots,
// --trace-deg), the same for every part. --plans: a folder of run-pinputts.mjs
// --plan files, hHH-sN.json for a cup's spot putts to try first (each cup's
// parts get its own, where there is one). --stall-min: a step whose log has
// not grown for that long is killed and counts as a failed try. --list: the
// cups from a JSON list (each must be a WSR spot; lib/pins.mjs's entry is used).
// Exit: 0 every selected cup done, 1 a cup failed or left waiting, 2 usage,
// 130 stopped.
import fs from "node:fs";
import path from "node:path";
import dgram from "node:dgram";
import { spawn, execFile, execFileSync } from "node:child_process";
import { HARNESS, STATE, portsFor, userDir } from "./lib/dolphin.mjs";
import * as P from "./lib/pins.mjs";

const ROOT = path.resolve(HARNESS, "..", "..");
const DIR = path.join(STATE, "campaign");
const STATUS = path.join(DIR, "status.json"), LOCK = path.join(DIR, "campaign.lock"), MAIN_LOG = path.join(DIR, "campaign.log");
const STOP_FILE = path.join(DIR, "STOP"), DRAIN_FILE = path.join(DIR, "DRAIN");
const RESULTS = path.join(HARNESS, "results", "pins"), DEV_RESULTS = path.join(HARNESS, "results", "pins-dev");
const TOOL = { pins: path.join(HARNESS, "make-pinstates.mjs"), green: path.join(HARNESS, "make-pingreen.mjs"), battery: path.join(HARNESS, "run-pinputts.mjs") };
const BATTERY_FLOOR_GB = (5e9 + 2e8) / 2 ** 30;       // run-pinputts.mjs MIN_FREE (5e9 bytes) + 200 MB
const MAX_FAILS = 2;                                  // a step's first try and one retry
// a step that died on Windows refusing a file to it for a moment (another
// program holding it: errno UNKNOWN on open, EBUSY, EPERM, EACCES) is tried
// again without counting, up to TRANSIENT_MAX times
const TRANSIENT = /\b(UNKNOWN: unknown error|EBUSY: resource busy or locked|EPERM: operation not permitted|EACCES: permission denied), (open|rename|copyfile|unlink)\b/;
const TRANSIENT_MAX = 5;
const CTRL_C_EXIT = new Set([3221225786, -1073741510]); // STATUS_CONTROL_C_EXIT: console Ctrl+C, Ctrl+Break, close
// the battery's spots as run-pinputts.mjs names them (its ALL) and its window spots
const RINGS = [[3, [0, 45, 90, 135, 180, 225, 270, 315]], [8, [0, 45, 90, 135, 180, 225, 270, 315]], [15, [0, 90, 180, 270]]];
const ALL_SPOTS = ["approach", ...RINGS.flatMap(([R, as]) => as.map((a) => `r${R}-a${String(a).padStart(3, "0")}`))];
const WINDOW_SPOTS = ["r3-a000", "r3-a090", "r3-a180", "r3-a270"];
// what a fresh step process adds to the pin index's in-process timings (the
// projection's fallback where the campaign has not timed a step itself), and
// a battery run's start before its first spot when none was timed
const NODE_S = 3, BOOT_S = 8, BATTERY_START_S = 25;

// ---- arguments ----

const USAGE = `usage: node tools/harness/campaign.mjs --instances 1-16 [--cups h8s4,h21s3 | --holes 1,2 | --steep 8]
       [--order hole | steep-first] [--parts 1] [--spots approach,r3-a000,...] [--battery "--trace-deg 8"] [--plans <dir>]
       [--min-gb 5] [--stall-min 20] [--retry-failed] [--list cups.json] [--dry-run | --project [--slowdown 1]]`;
const FLAGS = {
  "--instances": 1, "--cups": 1, "--holes": 1, "--steep": 1, "--order": 1, "--parts": 1, "--spots": 1, "--battery": 1, "--plans": 1,
  "--min-gb": 1, "--stall-min": 1, "--list": 1, "--slowdown": 1, "--retry-failed": 0, "--dry-run": 0, "--project": 0, "--help": 0,
};
function usage(why) { if (why) console.error(why); console.error(USAGE); process.exit(2); }
const opt = {};
{
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (!(a[i] in FLAGS)) usage(`unknown argument ${a[i]}`);
    if (FLAGS[a[i]]) { if (i + 1 >= a.length) usage(`${a[i]} needs a value`); opt[a[i]] = a[++i]; } else opt[a[i]] = true;
  }
}
if (opt["--help"]) { console.log(USAGE); process.exit(0); }
const PROJECT = !!opt["--project"], DRY = !!opt["--dry-run"], LIVE = !PROJECT && !DRY;
function ints(s, what, lo, hi) {
  const out = [];
  for (const t of String(s).split(",").map((x) => x.trim()).filter(Boolean)) {
    const m = t.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) usage(`bad ${what} list "${s}"`);
    const a = Number(m[1]), b = m[2] == null ? a : Number(m[2]);
    for (let k = Math.min(a, b); k <= Math.max(a, b); k++) {
      if (k < lo || k > hi) usage(`${what} ${k} is outside ${lo}-${hi}`);
      if (!out.includes(k)) out.push(k);
    }
  }
  if (!out.length) usage(`no ${what} in "${s}"`);
  return out.sort((x, y) => x - y);
}
const num = (name, d, ok) => { const v = opt[name] == null ? d : Number(opt[name]); if (!Number.isFinite(v) || (ok && !ok(v))) usage(`bad ${name} ${opt[name]}`); return v; };
if (LIVE && !opt["--instances"]) usage("--instances is required: the harness instances this campaign may use (e.g. --instances 1-16)");
// user dirs exist for instances 0-18 (state/user, state/user1 ...)
const INSTANCES = opt["--instances"] ? ints(opt["--instances"], "instance", 0, 18) : Array.from({ length: 16 }, (_, i) => i + 1);
const ORDER = opt["--order"] ?? "hole";
if (!["hole", "steep-first"].includes(ORDER)) usage(`--order is hole or steep-first, not ${ORDER}`);
const SPOTS = opt["--spots"] ? opt["--spots"].split(",").map((x) => x.trim()).filter(Boolean) : ALL_SPOTS;
for (const s of SPOTS) if (!ALL_SPOTS.includes(s)) usage(`no spot ${s} (run-pinputts.mjs's spots: ${ALL_SPOTS.join(", ")})`);
const PARTS = num("--parts", 1, (v) => Number.isInteger(v) && v >= 1 && v <= SPOTS.length);
// make-pinstates.mjs and make-pingreen.mjs refuse a state under 5 GB free themselves (lib/pins.mjs checkDisk)
const MIN_GB = Math.max(5, num("--min-gb", 5, (v) => v >= 0));
const STALL_MS = num("--stall-min", 20, (v) => v > 0) * 60000, SLOWDOWN = num("--slowdown", 1, (v) => v > 0);
const BATTERY_ARGS = opt["--battery"] ? opt["--battery"].trim().split(/\s+/).filter(Boolean) : [];
for (const a of BATTERY_ARGS) if (["--hole", "--green", "--id", "--spots", "--quick", "--out", "--fresh", "--instance"].includes(a)) usage(`--battery may not set ${a}: the campaign sets it`);
if (BATTERY_ARGS.includes("--plan")) usage("--battery may not set --plan (a plan is one cup's): --plans <dir> gives each cup its hHH-sN.json there");
// run-pinputts.mjs --plan per cup: <dir>/hHH-sN.json where there is one
const PLANS_DIR = opt["--plans"] ? path.resolve(opt["--plans"]) : null;
if (PLANS_DIR && !fs.existsSync(PLANS_DIR)) usage(`no --plans folder ${PLANS_DIR}`);
const bArg = (n, d) => { const i = BATTERY_ARGS.indexOf(n); return i >= 0 ? BATTERY_ARGS[i + 1] : d; };
const WINDOW_AT = bArg("--window-spots", WINDOW_SPOTS.join(",")).split(",");
const WINDOW_ON = bArg("--tests", "read,roll,window").split(",").includes("window");
const TRACE_DEG = Number(bArg("--trace-deg", 6));
const RETRY_FAILED = !!opt["--retry-failed"];

// ---- the cups ----

const tryCup = (hole, id) => { try { return P.cupById(hole, id); } catch (e) { return usage(e.message); } };
let LIST;
if (opt["--list"]) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(opt["--list"]), "utf8"));
  LIST = (Array.isArray(raw) ? raw : raw.cups ?? []).map((c) => {
    const w = tryCup(c.hole, c.id);
    if (JSON.stringify(w) !== JSON.stringify(c)) console.log(`note: ${P.cupKey(w)} in ${opt["--list"]} differs from lib/pins.mjs's entry, which is used`);
    return w;
  });
} else LIST = P.cups();
let SEL = LIST;
if (opt["--cups"]) {
  const keys = opt["--cups"].split(",").map((x) => x.trim()).filter(Boolean).map((r) => {
    const m = r.match(/^h?(\d{1,2})[-_:]?s(\d{1,2})$/i);
    if (!m) usage(`bad cup "${r}" (h8s4 or h08-s4)`);
    return P.cupKey(tryCup(Number(m[1]), `s${Number(m[2])}`));
  });
  for (const k of keys) if (!LIST.some((c) => P.cupKey(c) === k)) usage(`${k} is not in the cup list`);
  SEL = SEL.filter((c) => keys.includes(P.cupKey(c)));
}
if (opt["--holes"]) { const hs = ints(opt["--holes"], "hole", 1, 21); SEL = SEL.filter((c) => hs.includes(c.hole)); }
if (opt["--steep"] != null) { const d = num("--steep", 0); SEL = SEL.filter((c) => (c.slopeDeg ?? 0) >= d); }
if (!SEL.length) usage("no cup selected");
const RANKED = ORDER === "steep-first"
  ? [...SEL].sort((a, b) => (b.slopeDeg ?? 0) - (a.slopeDeg ?? 0) || a.hole - b.hole || a.slots[0] - b.slots[0])
  : [...SEL];

// the spots split into n parts of about equal work (a window spot counts
// twice: its window test takes about as long as the rest), each in the
// battery's own order
function partition(spots, n) {
  const w = (s) => (WINDOW_ON && WINDOW_AT.includes(s) ? 2 : 1);
  const load = new Array(n).fill(0), out = Array.from({ length: n }, () => []);
  const order = spots.map((s, i) => ({ s, i, w: w(s) })).sort((a, b) => b.w - a.w || a.i - b.i);
  for (const x of order) { let k = 0; for (let j = 1; j < n; j++) if (load[j] < load[k]) k = j; out[k].push(x); load[k] += x.w; }
  return out.filter((p) => p.length).map((p) => p.sort((a, b) => a.i - b.i).map((x) => x.s));
}
const rel = (f) => path.relative(HARNESS, f).replace(/\\/g, "/");
const iso = (t = Date.now()) => new Date(t).toISOString();
const dur = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s` : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`; };
const hh = P.hh;

function cupModel(c, rank) {
  const key = P.cupKey(c), parts = partition(SPOTS, PARTS);
  return {
    c, key, hole: c.hole, id: c.id, rank, route: P.COURSE_FIRST.includes(c.hole) ? "menu" : "play", greenRel: P.greenName(c),
    tee: false, green: false, done: false, spotsDone: new Set(), files: [], conflict: null,
    parts: parts.map((spots, i) => ({
      k: i + 1, spots, job: null, attempts: [],
      out: path.join(RESULTS, parts.length === 1 ? `h${hh(c.hole)}-${c.id}.json` : `h${hh(c.hole)}-${c.id}-p${i + 1}.json`),
    })),
    jobs: new Set(), failed: null, attempts: { tee: [], green: [] },
  };
}
const MODELS = RANKED.map((c, i) => cupModel(c, i + 1));
const HOLES = new Map();
for (const m of MODELS) if (m.route === "play" && !HOLES.has(m.hole)) HOLES.set(m.hole, { hole: m.hole, preDone: false, job: null, attempts: [], failed: null });

// ---- what is done: the outputs ----

let IDX = P.readPinIndex();
const exists = (name) => fs.existsSync(P.savePath(name));
function refreshHole(h) { const e = IDX.pre[h.hole]; h.preDone = !!(e?.file && exists(e.file)); }
// a battery file, parsed once per version (mtime, size)
const rcache = new Map();
function readResult(file) {
  let st;
  try { st = fs.statSync(file); } catch { rcache.delete(file); return null; }
  const c = rcache.get(file);
  if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) return c.r;
  let r;
  try {
    const x = JSON.parse(fs.readFileSync(file, "utf8"));
    r = x.kind !== "pinputts" ? { other: true } : {
      hole: x.hole, id: x.id, green: x.green, ball0: x.ball0, slopeDeg: x.cup?.kcl?.slopeDeg ?? null,
      spots: Object.values(x.spots ?? {}).map((s) => ({ name: s.name, done: !!s.done, usable: !!s.usable, ring: s.ring ?? 0, windowRows: s.window?.length ?? 0, totalS: s.timing?.totalS ?? null })),
    };
  } catch { r = { broken: true }; }
  rcache.set(file, { mtimeMs: st.mtimeMs, size: st.size, r });
  return r;
}
const jsonFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f)) : []);
function refreshCup(m, all = jsonFiles(RESULTS)) {
  m.green = exists(P.greenName(m.c));
  m.tee = m.green || exists(P.teeName(m.c));
  // the battery files of this cup and green state (the ball of the green
  // state as the pin index records it, when it does); a file the campaign
  // would write that run-pinputts.mjs would refuse, or that does not parse
  // while no step of the campaign writes it, blocks the cup's battery
  const ball = IDX.cups[m.key]?.green?.ball?.pos;
  const files = [];
  m.conflict = null;
  for (const f of all) {
    const r = readResult(f), part = m.parts.find((p) => p.out === f);
    if (r?.broken && part && !part.job) { m.conflict = `${rel(f)} does not parse: move it away (or let its writer finish)`; continue; }
    if (!r || r.broken || r.other || r.hole !== m.hole || r.id !== m.id) continue;
    const same = r.green === m.greenRel && (!ball || !r.ball0 || Math.hypot(r.ball0[0] - ball[0], r.ball0[2] - ball[2]) < 1e-3);
    if (same) files.push({ f, r });
    else if (part) m.conflict = `${rel(f)} holds the results of another green state (${r.green}${r.green === m.greenRel ? ", an earlier one" : ""}): run-pinputts.mjs would refuse it; move it away`;
  }
  m.files = files.map((x) => x.f);
  m.spotsDone = new Set(files.flatMap((x) => x.r.spots.filter((s) => s.done).map((s) => s.name)));
  m.done = SPOTS.every((s) => m.spotsDone.has(s));
}
function refreshAll() {
  IDX = P.readPinIndex();
  for (const h of HOLES.values()) refreshHole(h);
  const all = jsonFiles(RESULTS);
  for (const m of MODELS) refreshCup(m, all);
}
const partDone = (m, p) => p.spots.every((s) => m.spotsDone.has(s));
const fails = (atts) => atts.filter((a) => (a.result === "failed" || a.result === "stalled") && a.counted !== false).length;

// ---- the next step: the first cup in the order with a step it can start ----

// a step whose last try failed on this instance goes to another free one
const avoid = (atts, inst, free) => { const a = atts.at(-1); return !!a && (a.result === "failed" || a.result === "stalled") && a.instance === inst && free.length > 1; };
function nextJob(W, inst, free, gate) {
  for (const m of W.models) {
    if (m.failed || m.done || m.conflict || foreignOf(W, m)) continue;
    if (!m.tee) {
      if (m.jobs.size || !gate.stateOK) continue;
      if (m.route === "play") {
        const h = W.holes.get(m.hole);
        if (h.failed) continue;
        if (!h.preDone) { if (h.job || W.foreign?.holes.has(m.hole) || avoid(h.attempts, inst, free)) continue; return { kind: "pre", m, h }; }
      }
      if (avoid(m.attempts.tee, inst, free)) continue;
      return { kind: "tee", m };
    }
    if (!m.green) {
      if (m.jobs.size || !gate.stateOK || avoid(m.attempts.green, inst, free)) continue;
      return { kind: "green", m };
    }
    if (!gate.batteryOK) continue;
    for (const p of m.parts) {
      if (p.job || partDone(m, p) || avoid(p.attempts, inst, free)) continue;
      return { kind: "battery", m, part: p };
    }
  }
  return null;
}
function jobName(j) {
  if (j.kind === "pre") return `h${hh(j.m.hole)} pre (with ${j.m.key}'s tee)`;
  if (j.kind === "battery") return `${j.m.key} battery${j.m.parts.length > 1 ? ` ${j.part.k}/${j.m.parts.length}` : ""}`;
  return `${j.m.key} ${j.kind}`;
}
function commandOf(j, inst) {
  const m = j.m, base = ["--hole", String(m.hole), "--instance", String(inst)];
  if (j.kind === "pre" || j.kind === "tee") return { log: path.join(DIR, j.kind === "pre" ? `h${hh(m.hole)}-pre.log` : `${m.key}-tee.log`), args: [TOOL.pins, ...base, "--ids", m.id] };
  if (j.kind === "green") return { log: path.join(DIR, `${m.key}-green.log`), args: [TOOL.green, ...base, "--ids", m.id] };
  const todo = j.part.spots.filter((s) => !m.spotsDone.has(s));
  const plan = PLANS_DIR ? path.join(PLANS_DIR, `${m.key}.json`) : null;
  return {
    log: path.join(DIR, `${m.key}-battery${m.parts.length > 1 ? `-p${j.part.k}` : ""}.log`),
    args: [TOOL.battery, ...base, "--green", m.greenRel, "--id", m.id, "--spots", todo.join(","), "--out", rel(j.part.out),
      ...(plan && fs.existsSync(plan) ? ["--plan", plan] : []), ...BATTERY_ARGS],
  };
}

// ---- the projection (and the dry run's view) ----

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
function readStatusFile() { try { return JSON.parse(fs.readFileSync(STATUS, "utf8")); } catch { return null; } }
// step times measured so far, in s: the campaign's own finished attempts and
// the pin index's in-process timings plus a fresh process's start (NODE_S)
// and boot (BOOT_S), pooled (an index entry the campaign timed itself is
// left out); the battery per spot from every battery file
function estimates(status) {
  const atts = [];
  for (const [key, c] of Object.entries(status?.cups ?? {})) {
    for (const a of c.steps?.tee?.attempts ?? []) if (a.result === "done" && !a.via) atts.push({ ...a, key, route: c.route });
    for (const a of c.steps?.green?.attempts ?? []) if (a.result === "done") atts.push({ ...a, key });
    for (const p of c.steps?.battery?.parts ?? []) for (const a of p.attempts ?? []) if (a.result === "done" && a.spotS != null) atts.push(a);
  }
  for (const h of Object.values(status?.holes ?? {})) for (const a of h.attempts ?? []) if (a.result === "done") atts.push(a);
  const S = (a) => a.ms / 1000, idx = P.readPinIndex(), of = (k) => atts.filter((a) => a.kind === k);
  const own = { pre: of("pre").map(S), teePlay: of("tee").filter((a) => a.route === "play").map(S), teeMenu: of("tee").filter((a) => a.route === "menu").map(S),
    green: of("green").map(S), start: of("battery").map((a) => S(a) - a.spotS) };
  const timed = { tee: new Set(of("tee").map((a) => a.key)), green: new Set(of("green").map((a) => a.key)), pre: new Set(of("pre").map((a) => a.hole)) };
  const ix = { teePlay: [], teeMenu: [], green: [], pre: [] }, teePlayIn = [];
  for (const [key, e] of Object.entries(idx.cups)) {
    if (e.teeMs?.total) {
      if (e.route !== "menu") teePlayIn.push((e.teeMs.total - (e.teeMs.boot ?? 0)) / 1000);
      // a tee made inside a pre step is part of that step's time
      if (!timed.tee.has(key) && !timed.pre.has(e.hole)) (e.route === "menu" ? ix.teeMenu : ix.teePlay).push(e.teeMs.total / 1000 + NODE_S + (e.teeMs.boot ? 0 : BOOT_S));
    }
    if (e.green?.ms && !timed.green.has(key)) ix.green.push(e.green.ms / 1000 + NODE_S + BOOT_S);
  }
  // a pre step makes the pre state and one tee state
  for (const [h, e] of Object.entries(idx.pre)) if (e.totalMs && !timed.pre.has(Number(h))) ix.pre.push(e.totalMs / 1000 + NODE_S + (mean(teePlayIn) ?? 0));
  const pool = (k) => {
    const v = [...own[k], ...ix[k]];
    return v.length ? { s: mean(v), n: v.length, src: [own[k].length ? `${own[k].length} campaign` : "", ix[k].length ? `${ix[k].length} index` : ""].filter(Boolean).join(" + ") } : null;
  };
  const est = { teePlay: pool("teePlay"), teeMenu: pool("teeMenu"), green: pool("green"), pre: pool("pre"),
    start: own.start.length ? { s: mean(own.start), n: own.start.length, src: `${own.start.length} campaign` } : { s: BATTERY_START_S, n: 0, src: "assumed" } };
  // per spot, by the cup's slope against the trace threshold: a usable spot
  // with and without its window test (the default 3 speeds only), an unusable
  // one, and how often a ring's spot is usable
  const cls = {};
  for (const dir of [RESULTS, DEV_RESULTS]) for (const f of jsonFiles(dir)) {
    const r = readResult(f);
    if (!r?.spots || r.slopeDeg == null) continue;
    const k = r.slopeDeg >= TRACE_DEG ? "traced" : "untraced", c = (cls[k] ??= { spot: [], window: [], unusable: [], ring: {}, cups: new Set() });
    c.cups.add(`${r.hole}|${r.id}|${r.green}`);
    for (const s of r.spots) {
      if (!s.done || s.totalS == null) continue;
      const ring = s.name === "approach" ? "approach" : `r${s.ring}`, q = (c.ring[ring] ??= [0, 0]);
      q[1]++;
      if (!s.usable) { c.unusable.push(s.totalS); continue; }
      q[0]++;
      if (s.windowRows === 0) c.spot.push(s.totalS); else if (s.windowRows === 3) c.window.push(s.totalS);
    }
  }
  for (const c of Object.values(cls)) Object.assign(c, { n: c.spot.length + c.window.length + c.unusable.length, spotS: mean(c.spot), windowS: mean(c.window), unusableS: mean(c.unusable) ?? 0 });
  est.cls = cls;
  return est;
}
function spotS(est, slope, spot) {
  const want = (slope ?? 0) >= TRACE_DEG ? "traced" : "untraced";
  const c = est.cls[want]?.spotS != null ? est.cls[want] : est.cls.traced?.spotS != null ? est.cls.traced : est.cls.untraced;
  if (!c?.spotS) return 300;
  const ring = spot === "approach" ? "approach" : spot.split("-")[0], q = c.ring[ring];
  const pu = q && q[1] ? q[0] / q[1] : 0.9;
  const used = WINDOW_ON && WINDOW_AT.includes(spot) ? c.windowS ?? 2 * c.spotS : c.spotS;
  return pu * used + (1 - pu) * c.unusableS;
}
function jobS(est, j, scratch) {
  if (j.kind === "pre") return est.pre?.s ?? 220;
  if (j.kind === "tee") return (j.m.route === "menu" ? est.teeMenu : est.teePlay)?.s ?? 70;
  if (j.kind === "green") return est.green?.s ?? 160;
  const spots = scratch ? j.part.spots : j.part.spots.filter((s) => !j.m.spotsDone.has(s));
  return est.start.s + spots.reduce((a, s) => a + spotS(est, j.m.c.slopeDeg, s), 0);
}
// the scheduler above on a clock: every job takes its estimate x --slowdown
function simulate(models, est, nInst, { scratch, parts = PARTS }) {
  const ms = models.map((m) => {
    const ps = partition(SPOTS, parts).map((spots, i) => ({ k: i + 1, spots, job: null, attempts: [] }));
    const x = { ...m, parts: ps, jobs: new Set(), failed: null, conflict: null, attempts: { tee: [], green: [] } };
    if (scratch) Object.assign(x, { tee: false, green: false, done: false, spotsDone: new Set() });
    else Object.assign(x, { spotsDone: new Set(m.spotsDone), done: m.done });
    return x;
  });
  const holes = new Map([...new Set(ms.filter((m) => m.route === "play").map((m) => m.hole))].map((h) => [h, { hole: h, preDone: scratch ? false : !!HOLES.get(h)?.preDone, job: null, attempts: [], failed: null }]));
  const W = { models: ms, holes }, gate = { stateOK: true, batteryOK: true }, run = [], busy = { pre: 0, tee: 0, green: 0, battery: 0 };
  let t = 0, steepAt = 0;
  for (;;) {
    const free = [...Array(nInst).keys()].filter((i) => !run.some((r) => r.inst === i));
    for (const i of free) {
      const j = nextJob(W, i, free, gate);
      if (!j) break;
      const d = jobS(est, j, scratch) * SLOWDOWN;
      busy[j.kind] += d;
      j.m.jobs.add(j); if (j.part) j.part.job = j; if (j.h) j.h.job = j;
      run.push({ end: t + d, inst: i, j });
    }
    if (!run.length) break;
    run.sort((a, b) => a.end - b.end);
    const { end, j } = run.shift();
    t = end;
    j.m.jobs.delete(j);
    if (j.kind === "pre") { j.h.job = null; j.h.preDone = true; j.m.tee = true; }
    if (j.kind === "tee") j.m.tee = true;
    if (j.kind === "green") j.m.green = true;
    if (j.kind === "battery") { j.part.job = null; for (const s of j.part.spots) j.m.spotsDone.add(s); }
    j.m.done = SPOTS.every((s) => j.m.spotsDone.has(s));
    if (j.m.done && (j.m.c.slopeDeg ?? 0) >= 8) steepAt = Math.max(steepAt, t);
  }
  const left = ms.filter((m) => !m.done).length;
  return { t, busy, steepAt, steep: ms.filter((m) => (m.c.slopeDeg ?? 0) >= 8).length, left };
}
function projectMain() {
  refreshAll();
  const status = readStatusFile(), est = estimates(status), n = INSTANCES.length;
  const f = (e) => (e ? `${Math.round(e.s)} s (${e.n ? e.src : "assumed"})` : "–");
  console.log(`measured step times: pre ${f(est.pre)}, tee ${f(est.teePlay)} on the play route and ${f(est.teeMenu)} on the menu route, green ${f(est.green)}, battery start ${f(est.start)}`);
  for (const [k, c] of Object.entries(est.cls)) {
    const rings = Object.entries(c.ring).map(([r, q]) => `${r} ${q[0]}/${q[1]}`).join(", ");
    console.log(`battery spots on cups ${k === "traced" ? `of ${TRACE_DEG} deg or more (traced)` : `under ${TRACE_DEG} deg`}: ${c.cups.size} cups, ${c.n} spots; a spot ${Math.round(c.spotS ?? 0)} s, with its window ${c.windowS ? `${Math.round(c.windowS)} s` : "– (none timed)"}, unusable ${Math.round(c.unusableS)} s; usable ${rings}`);
  }
  const done = MODELS.filter((m) => m.done).length;
  console.log(`${MODELS.length} cups (${done} done), order ${ORDER}, ${n} instances, every step x ${SLOWDOWN}:`);
  const h = (s) => (s / 3600).toFixed(1);
  for (const scratch of [true, false]) for (const parts of [...new Set([PARTS, 1, 3])].filter((p) => p <= SPOTS.length)) {
    const r = simulate(MODELS, est, n, { scratch, parts });
    const b = r.busy, total = b.pre + b.tee + b.green + b.battery;
    console.log(`  ${scratch ? "from scratch" : "what remains"}, battery in ${parts} part${parts > 1 ? "s" : ""}: ${h(r.t)} h on ${n} instances (${h(total)} instance-hours: pre ${h(b.pre)}, tee ${h(b.tee)}, green ${h(b.green)}, battery ${h(b.battery)}; ${(100 * total / (r.t * n || 1)).toFixed(0)}% busy)${r.steep ? `; the ${r.steep} cups of 8 deg or more done after ${h(r.steepAt)} h` : ""}`);
  }
}

// ---- the live campaign ----

const RUN = { pid: process.pid, startedAt: iso(), instances: INSTANCES, args: process.argv.slice(2) };
const running = new Map();            // instance -> job
const myPids = new Map();             // pid -> instance, every step this run spawned
let PREV = null, stopping = null, draining = false, consoleBreakAt = 0, wake = null, lastStatusWrite = 0, lastDolphins = null;
const busyWhy = new Map(), busyUntil = new Map();
let gateNote = null;

function say(m) {
  const line = `${P.stamp()} ${m}`;
  console.log(line);
  if (LIVE) try { fs.appendFileSync(MAIN_LOG, `${line}\n`); } catch { /* the log is a copy of stdout */ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function wakeUp() { if (wake) { const w = wake; wake = null; w(); } }
const gateNow = () => { const f = P.freeGB(); return { free: f, stateOK: f >= MIN_GB, batteryOK: f >= BATTERY_FLOOR_GB }; };
// the live world, with the cups other runs hold (refreshed with every process
// list), and the same without them (is anything left at all?)
const W_LIVE = { models: MODELS, holes: HOLES, foreign: { cups: new Map(), holes: new Map() } };
const W_ANY = { models: MODELS, holes: HOLES, foreign: null };
let fillAgainAt = 0, foreignNote = "";

function counts() {
  const c = { cups: MODELS.length, done: 0, failed: 0, running: 0, waiting: 0, spotsDone: 0, spots: MODELS.length * SPOTS.length };
  for (const m of MODELS) {
    if (m.done) c.done++; else if (m.failed) c.failed++; else if (m.jobs.size) c.running++; else c.waiting++;
    c.spotsDone += SPOTS.filter((s) => m.spotsDone.has(s)).length;
  }
  c.steps = running.size;
  return c;
}
function summary() {
  const c = counts();
  return `cups ${c.done}/${c.cups} done${c.failed ? `, ${c.failed} failed` : ""}, spots ${c.spotsDone}/${c.spots}, ${running.size} running, ${P.freeGB().toFixed(1)} GB free`;
}
function stepStatus(atts, done, job) { return job ? "running" : done ? "done" : fails(atts) >= MAX_FAILS ? "failed" : atts.length ? "todo (tried)" : "todo"; }
function nextStepOf(m) {
  if (m.done) return "done";
  if (m.failed) return "failed";
  if (m.conflict) return "blocked";
  if (!m.tee) return m.route === "play" && !HOLES.get(m.hole).preDone ? `pre (hole ${m.hole})` : "tee";
  return m.green ? "battery" : "green";
}
function cupStatus(m) {
  const all = [...m.attempts.tee, ...m.attempts.green, ...m.parts.flatMap((p) => p.attempts)].sort((a, b) => a.start.localeCompare(b.start));
  const sumMs = (atts) => atts.reduce((s, a) => s + (a.via ? 0 : a.ms ?? 0), 0);
  const jobs = [...m.jobs];
  return {
    hole: m.hole, id: m.id, label: m.c.label, slots: m.c.slots, sets: m.c.sets, slopeDeg: m.c.slopeDeg, rank: m.rank, route: m.route,
    status: m.done ? "done" : m.failed ? "failed" : m.conflict ? "blocked" : jobs.length ? "running" : "todo",
    step: jobs.length ? jobs.map((j) => jobName(j).replace(`${m.key} `, "")).join(", ") : nextStepOf(m),
    instance: jobs.length ? jobs.map((j) => j.instance).join(",") : all.at(-1)?.instance ?? null,
    error: m.failed?.error ?? m.conflict ?? null, failedStep: m.failed?.step ?? null, failedAt: m.failed?.at ?? null,
    green: exists(m.greenRel) ? `state/saves/${m.greenRel}` : null, results: m.files.map(rel),
    spots: { done: SPOTS.filter((s) => m.spotsDone.has(s)).length, of: SPOTS.length },
    times: { first: all[0]?.start ?? null, last: all.at(-1)?.end ?? null, teeMs: sumMs(m.attempts.tee), greenMs: sumMs(m.attempts.green), batteryMs: sumMs(m.parts.flatMap((p) => p.attempts)) },
    steps: {
      tee: { status: stepStatus(m.attempts.tee, m.tee, jobs.find((j) => j.kind === "tee" || j.kind === "pre")), attempts: m.attempts.tee },
      green: { status: stepStatus(m.attempts.green, m.green, jobs.find((j) => j.kind === "green")), attempts: m.attempts.green },
      battery: {
        status: m.done ? "done" : jobs.some((j) => j.kind === "battery") ? "running" : "todo",
        parts: m.parts.map((p) => ({ k: p.k, spots: p.spots, out: rel(p.out), done: p.spots.filter((s) => m.spotsDone.has(s)).length, status: stepStatus(p.attempts, partDone(m, p), p.job), attempts: p.attempts })),
      },
    },
  };
}
function writeStatus(state = "running") {
  lastStatusWrite = Date.now();
  const cups = { ...(PREV?.cups ?? {}) }, holes = { ...(PREV?.holes ?? {}) };
  for (const m of MODELS) cups[m.key] = cupStatus(m);
  for (const h of HOLES.values()) holes[h.hole] = {
    route: "play", from: `h${hh(h.hole - 1)}-tee.sav`, pre: h.preDone ? "done" : h.failed ? "failed" : h.job ? "running" : "todo",
    output: h.preDone ? `state/saves/${IDX.pre[h.hole].file}` : null, error: h.failed?.error ?? null, attempts: h.attempts,
  };
  const s = {
    kind: "pins-campaign", version: 1, state, pid: process.pid, startedAt: RUN.startedAt, updatedAt: iso(),
    args: RUN.args, instances: INSTANCES, order: ORDER, parts: PARTS, spots: SPOTS, battery: BATTERY_ARGS, minGB: MIN_GB,
    freeGB: +P.freeGB().toFixed(2), counts: counts(),
    running: [...running.values()].map((j) => ({ step: jobName(j), instance: j.instance, pid: j.att.pid, start: j.att.start, log: j.att.log })),
    holes, cups, runs: [...(PREV?.runs ?? []), { ...RUN, state, endedAt: state === "running" ? null : iso() }],
  };
  const tmp = `${STATUS}.${process.pid}.tmp`, text = JSON.stringify(s, null, 1);
  fs.writeFileSync(tmp, text);
  for (let a = 0; ; a++) {
    try { fs.renameSync(tmp, STATUS); break; } catch (e) {
      // a reader holding the file open without delete sharing: retried, then written in place
      if (a >= 20) { fs.writeFileSync(STATUS, text); try { fs.unlinkSync(tmp); } catch { /* gone */ } break; }
      sleepSync(50);
    }
  }
}

// the error line of this attempt's part of its log: the step tools' own
// "FAILED:" line, else a thrown error's message, else the last line that
// says what went wrong, else the last line
function errorOf(job) {
  try {
    const fd = fs.openSync(job.log, "r");
    try {
      const size = fs.fstatSync(fd).size, from = Math.max(job.logStart, size - 16384), buf = Buffer.alloc(size - from);
      fs.readSync(fd, buf, 0, buf.length, from);
      const lines = buf.toString("utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^at /.test(l)).reverse();
      for (const re of [/FAILED:/, /^\w*Error\b/, /refus|could not|did not|not holed|no green|timed out|stays locked/i]) {
        const hit = lines.find((l) => re.test(l));
        if (hit) return hit.slice(0, 400);
      }
      return (lines[0] ?? "").slice(0, 400);
    } finally { fs.closeSync(fd); }
  } catch { return null; }
}

// what a killed step left half-written: a state it wrote after it started
// (mtime) that SAVES/pins/index.json does not record as made since then, the
// pre step's temporary state, the index's temporary file of the killed
// writer; a battery file that no longer parses is renamed, not removed
function cleanupKilled(att) {
  const t0 = Date.parse(att.start) - 2000, notes = [], x = P.readPinIndex();
  const newer = (f) => { try { return fs.statSync(f).mtimeMs >= t0; } catch { return false; } };
  const made = (s) => !!s && Date.parse(s) >= t0;
  const drop = (name, why) => {
    const f = P.savePath(name);
    if (!fs.existsSync(f) || !newer(f)) return;
    try { fs.unlinkSync(f); notes.push(`removed ${name}: ${why}`); } catch (e) { notes.push(`could not remove ${name}: ${e.message}`); }
  };
  const c = att.id ? { hole: att.hole, id: att.id } : null, e = c ? x.cups[P.cupKey(c)] : null;
  if (att.kind === "pre") {
    if (!made(x.pre[att.hole]?.made)) drop(P.preName(att.hole), "written by the killed step, not in the pin index");
    drop(`pins/tmp-pre-i${att.instance}.sav`, "the killed pre step's temporary state");
  }
  if ((att.kind === "pre" || att.kind === "tee") && c && !(e?.teeFile === P.teeName(c) && made(e.made))) drop(P.teeName(c), "written by the killed step, not in the pin index");
  if (att.kind === "green" && c && !(e?.green?.file === P.greenName(c) && made(e.green.made))) drop(P.greenName(c), "written by the killed step, not in the pin index");
  if (att.kind === "battery" && att.out) {
    const f = path.join(HARNESS, att.out), tmp = `${f}.${att.pid}.tmp`;
    // the killed writer's temporary copy (run-pinputts.mjs writes the file whole and renames it)
    if (att.pid && fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); notes.push(`removed ${rel(tmp)}`); } catch { /* in use */ } }
    if (fs.existsSync(f)) {
      try { JSON.parse(fs.readFileSync(f, "utf8")); } catch {
        const to = `${f}.damaged-${iso().replace(/[:.]/g, "")}`;
        try { fs.renameSync(f, to); notes.push(`${att.out} does not parse: renamed ${rel(to)}`); } catch (er) { notes.push(`${att.out} does not parse and could not be renamed: ${er.message}`); }
      }
    }
  }
  if (att.pid) {
    const t = path.join(P.PINS_DIR, `index.json.${att.pid}.tmp`);
    if (fs.existsSync(t)) { try { fs.unlinkSync(t); notes.push(`removed pins/index.json.${att.pid}.tmp`); } catch { /* in use */ } }
  }
  if (notes.length) { att.cleanup = notes; for (const n of notes) say(`  ${n}`); }
}

// stop one step: its process tree by the PID the campaign spawned, while
// Node still holds the process (so the PID cannot have been reused)
function killTree(job) {
  if (job.child.exitCode != null || job.child.signalCode != null) return;
  try { execFileSync("taskkill", ["/F", "/T", "/PID", String(job.child.pid)], { stdio: "ignore" }); } catch { /* already gone */ }
}
// the Dolphin and node processes (pid, parent, command line), for the
// instance checks, the cups other runs work on and the orphan sweep
function procs() {
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "Get-CimInstance Win32_Process -Filter \"Name='Dolphin.exe' OR Name='node.exe'\" | Select-Object Name,ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress"],
    { encoding: "utf8", timeout: 30000, windowsHide: true, maxBuffer: 16 << 20 }, (err, out) => {
      if (err) return resolve(null);
      try {
        const v = out.trim() ? JSON.parse(out) : [];
        const all = (Array.isArray(v) ? v : [v]).map((d) => ({ name: String(d.Name).toLowerCase(), pid: d.ProcessId, ppid: d.ParentProcessId, cmd: d.CommandLine ?? "" }));
        resolve({ dolphins: all.filter((d) => d.name === "dolphin.exe"), nodes: all.filter((d) => d.name === "node.exe") });
      } catch { resolve(null); }
    });
  });
}
const norm = (s) => s.toLowerCase().replace(/\//g, "\\");
const usesDir = (cmd, n) => { const c = norm(cmd), d = norm(userDir(n)); const i = c.indexOf(d); return i >= 0 && /^($|[\s"])/.test(c.slice(i + d.length)); };
const harnessDir = (cmd) => norm(cmd).includes(norm(path.join(STATE, "user")));
// the cups and holes that step tools this campaign did not start work on
// (a pilot, a run by hand): left to them while they run, so no two writers
// meet on a state or a battery file. A run-pinputts.mjs whose cup cannot be
// told (a played round's green state) holds the whole hole's batteries; a
// make-pinstates.mjs holds its hole's pre state too.
function foreignWork(nodes) {
  const cups = new Map(), holes = new Map();
  for (const p of nodes ?? []) {
    if (myPids.has(p.pid) || p.pid === process.pid) continue;
    const t = p.cmd.match(/(make-pinstates|make-pingreen|run-pinputts)\.mjs/);
    if (!t) continue;
    const a = (n) => { const r = p.cmd.match(new RegExp(`${n}\\s+(?:"([^"]*)"|(\\S+))`)); return r ? r[1] ?? r[2] : null; };
    const hole = Number(a("--hole"));
    if (!(hole >= 1 && hole <= 21)) continue;
    const who = `${t[1]}.mjs pid ${p.pid}`;
    const ids = t[1] === "run-pinputts" ? [a("--id") ?? a("--green")?.match(/-(s\d+)-green\.sav/)?.[1] ?? "*"] : (a("--ids") ?? "all") === "all" ? ["*"] : a("--ids").split(",");
    for (const id of ids) cups.set(`h${hh(hole)}-${id === "*" ? "*" : id.trim()}`, who);
    if (t[1] === "make-pinstates") holes.set(hole, who);
  }
  return { cups, holes };
}
const foreignOf = (W, m) => W.foreign?.cups.get(m.key) ?? W.foreign?.cups.get(`h${hh(m.hole)}-*`) ?? null;
// a Dolphin a step of this run started and that outlived it (none expected:
// the step tool's job object takes it down), by PID and its instance's dir
async function sweepOrphans() {
  const ds = (await procs())?.dolphins;
  for (const d of ds ?? []) {
    const n = myPids.get(d.ppid);
    if (n == null || !usesDir(d.cmd, n) || [...running.values()].some((j) => j.att.pid === d.ppid)) continue;
    try { execFileSync("taskkill", ["/F", "/PID", String(d.pid)], { stdio: "ignore" }); say(`  stopped Dolphin pid ${d.pid}, left by step pid ${d.ppid} on instance ${n}`); } catch { /* gone */ }
  }
}
function udpFree(port) {
  return new Promise((resolve) => {
    const s = dgram.createSocket("udp4");
    s.once("error", () => { try { s.close(); } catch { /* never bound */ } resolve(false); });
    s.bind(port, "127.0.0.1", () => s.close(() => resolve(true)));
  });
}
// the instances something else uses: its DSU port bound (a step tool holds
// it for its whole run) or a Dolphin running with its user dir; and, from
// the same process list, the work of step tools this campaign did not start
async function inUse(cands) {
  const out = new Map();
  for (const n of cands) if (!(await udpFree(portsFor(n).dsu))) out.set(n, `its DSU port ${portsFor(n).dsu} is bound`);
  const ps = await procs();
  if (ps) {
    lastDolphins = ps.dolphins.filter((d) => harnessDir(d.cmd)).length;
    for (const d of ps.dolphins) for (const n of cands) if (!out.has(n) && usesDir(d.cmd, n)) out.set(n, `Dolphin pid ${d.pid} runs with its user dir`);
    W_LIVE.foreign = foreignWork(ps.nodes);
  }
  return out;
}

// a command line as typed at the repository root (run-pinputts.mjs reads --out under tools/harness)
const shown = (args) => `node ${args.map((a) => {
  if (!path.isAbsolute(a)) return a;
  const r = path.relative(ROOT, a);
  return (r.startsWith("..") ? a : r).replace(/\\/g, "/");
}).join(" ")}`;
function launch(j, inst) {
  const { log, args } = commandOf(j, inst), m = j.m;
  const list = j.kind === "pre" ? j.h.attempts : j.kind === "battery" ? j.part.attempts : m.attempts[j.kind];
  const att = {
    n: list.filter((a) => !a.via).length + 1, kind: j.kind, hole: m.hole, id: m.id, part: j.part?.k ?? null, out: j.part ? rel(j.part.out) : undefined,
    instance: inst, pid: null, start: iso(), end: null, ms: null, exit: null, result: "running", log: rel(log), cmd: shown(args),
    concurrent: running.size + 1, harnessDolphins: lastDolphins, freeGB: +P.freeGB().toFixed(2),
    before: j.part ? j.part.spots.filter((s) => m.spotsDone.has(s)) : undefined,
  };
  list.push(att);
  fs.mkdirSync(DIR, { recursive: true });
  const fd = fs.openSync(log, "a");
  let child;
  try {
    const logStart = fs.fstatSync(fd).size;
    fs.writeSync(fd, `\n==== ${att.start} ${jobName(j)}: attempt ${att.n} on instance ${inst}, by campaign pid ${process.pid}\n==== ${att.cmd}\n`);
    child = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, HARNESS_INSTANCE: String(inst) }, stdio: ["ignore", fd, fd], windowsHide: true });
    Object.assign(j, { log, logStart, att, child, instance: inst, startMs: Date.now(), lastSize: -1, lastActive: Date.now() });
  } finally { fs.closeSync(fd); }
  att.pid = child.pid;
  if (child.pid) myPids.set(child.pid, inst);
  j.finished = new Promise((resolve) => {
    let fired = false;
    const end = (code, signal, error) => { if (fired) return; fired = true; try { finish(j, { code, signal, error }); } finally { resolve(); wakeUp(); } };
    child.on("exit", (code, signal) => end(code, signal, null));
    child.on("error", (e) => end(null, null, e));
  });
  running.set(inst, j);
  m.jobs.add(j);
  if (j.part) j.part.job = j;
  if (j.h) j.h.job = j;
  say(`started  ${jobName(j)} on instance ${inst} (try ${att.n}, pid ${child.pid}; log ${att.log})`);
  writeStatus();
}

function failCup(m, step, error) {
  m.failed = { step, error, at: iso() };
  say(`  ${m.key} FAILED at its ${step} step (tried ${MAX_FAILS} times): ${error ?? "no error line"}`);
}
function finish(j, { code, signal, error }) {
  const att = j.att, m = j.m;
  Object.assign(att, { end: iso(), ms: Date.now() - j.startMs, exit: error ? `spawn: ${error.message}` : code ?? signal });
  running.delete(j.instance);
  m.jobs.delete(j);
  if (j.part) j.part.job = null;
  if (j.h) j.h.job = null;
  fillAgainAt = 0;
  if (CTRL_C_EXIT.has(code)) consoleBreakAt = Date.now();
  const refresh = () => {
    IDX = P.readPinIndex();
    if (j.h) refreshHole(j.h);
    const all = jsonFiles(RESULTS);
    for (const x of MODELS) if (x === m || (j.kind === "pre" && x.hole === m.hole)) refreshCup(x, all);
  };
  // killed by the campaign's stop, or by a console Ctrl+C (which every
  // process of the console gets): interrupted, not a failure
  if (j.killed === "stop" || (CTRL_C_EXIT.has(code) && !j.killed)) {
    att.result = "interrupted";
    cleanupKilled(att);
    refresh();
    if (j.part) att.newSpots = j.part.spots.filter((s) => m.spotsDone.has(s) && !att.before.includes(s));
    say(`interrupted ${jobName(j)} on instance ${j.instance} after ${dur(att.ms)}${j.part ? ` (${att.newSpots.length} spots finished in it)` : ""}`);
    writeStatus(stopping ? "stopping" : "running");
    return;
  }
  if (j.killed === "stall") cleanupKilled(att);
  refresh();
  let ok, extra = "";
  if (j.kind === "pre") {
    ok = j.h.preDone;
    if (ok) {
      // the tee state made with it is the cup's tee try
      const t = { ...att, kind: "tee", via: "pre", result: m.tee ? "done" : "failed" };
      if (!m.tee) t.error = errorOf(j);
      m.attempts.tee.push(t);
      extra = `; ${m.key}'s tee ${m.tee ? "made with it" : `FAILED (${t.error})`}`;
      if (!m.tee && fails(m.attempts.tee) >= MAX_FAILS) failCup(m, "tee", t.error);
    }
  } else if (j.kind === "tee") ok = m.tee;
  else if (j.kind === "green") ok = m.green;
  else {
    ok = partDone(m, j.part);
    // the spots this try finished, and their own time in its file (the
    // rest of the try's time is its start: the projection's battery start)
    att.newSpots = j.part.spots.filter((s) => m.spotsDone.has(s) && !att.before.includes(s));
    const r = readResult(j.part.out), t = new Map((r?.spots ?? []).map((s) => [s.name, s.totalS]));
    if (ok && att.newSpots.every((s) => t.get(s) != null)) att.spotS = att.newSpots.reduce((a, s) => a + t.get(s), 0);
    extra = `; ${att.newSpots.length} spots this try, ${j.part.spots.filter((s) => m.spotsDone.has(s)).length}/${j.part.spots.length} of the part`;
  }
  att.result = ok ? "done" : j.killed === "stall" ? "stalled" : "failed";
  if (!ok) att.error = j.killed === "stall" ? `no output for ${STALL_MS / 60000} min; killed` : errorOf(j) ?? `exit ${att.exit}`;
  if (ok && att.exit !== 0) extra += ` (exit ${att.exit})`;
  const list = j.kind === "pre" ? j.h.attempts : j.kind === "battery" ? j.part.attempts : m.attempts[j.kind];
  if (!ok && !j.killed && TRANSIENT.test(att.error ?? "") && list.filter((a) => a.transient).length < TRANSIENT_MAX) Object.assign(att, { transient: true, counted: false });
  say(`finished ${jobName(j)}: ${att.result.toUpperCase()} on instance ${j.instance} in ${dur(att.ms)}${extra}${ok ? "" : `: ${att.error}`} | ${summary()}`);
  if (att.transient) say(`  a file Windows refused to the step for a moment: not counted as a failure, tried again`);
  else if (!ok) {
    if (fails(list) >= MAX_FAILS) {
      if (j.kind === "pre") {
        j.h.failed = { error: att.error, at: iso() };
        for (const x of MODELS) if (x.hole === m.hole && !x.tee && !x.failed) failCup(x, `pre (hole ${m.hole})`, att.error);
      } else failCup(m, j.kind === "battery" ? `battery part ${j.part.k}` : j.kind, att.error);
    } else say(`  ${jobName(j)} gets one more try`);
  }
  if (m.done) say(`  ${m.key} DONE: ${SPOTS.length} spots in ${m.files.map(rel).join(", ")}`);
  writeStatus(stopping ? "stopping" : "running");
}

async function fill() {
  if (stopping || draining || Date.now() - consoleBreakAt < 3000) return;
  const gate = gateNow();
  const note = !gate.stateOK ? `under ${MIN_GB} GB free (${gate.free.toFixed(2)}): no new pre, tee or green steps${gate.batteryOK ? "" : ", nor battery parts"}` : null;
  if (note !== gateNote) { if (note) say(note); else if (gateNote) say(`${gate.free.toFixed(1)} GB free again: state steps resume`); gateNote = note; }
  let cands = INSTANCES.filter((n) => !running.has(n) && !(busyUntil.get(n) > Date.now()));
  // anything to start, the other runs' work aside (the process list says what
  // is theirs, and is read only when something could start)
  if (!cands.length || Date.now() < fillAgainAt || !nextJob(W_ANY, -1, cands, gate)) return;
  const use = await inUse(cands);
  if (stopping || draining) return;
  for (const n of cands) {
    const why = use.get(n);
    if (why) { if (busyWhy.get(n) !== why) say(`instance ${n} is in use (${why}): left alone for now`); busyWhy.set(n, why); busyUntil.set(n, Date.now() + 30000); }
    else if (busyWhy.has(n)) { say(`instance ${n} is free again`); busyWhy.delete(n); }
  }
  const theirs = [...new Set(W_LIVE.foreign.cups.values()), ...W_LIVE.foreign.holes.values()].length
    ? MODELS.filter((m) => !m.done && !m.failed && foreignOf(W_LIVE, m)).map((m) => `${m.key} (${foreignOf(W_LIVE, m)})`) : [];
  const tn = theirs.join(", ");
  if (tn !== foreignNote) { if (tn) say(`left to other runs for now: ${tn}`); else if (foreignNote) say("no cup is worked on by another run any more"); foreignNote = tn; }
  cands = cands.filter((n) => !use.has(n));
  let launched = 0;
  for (const n of cands) {
    const j = nextJob(W_LIVE, n, cands, gate);
    if (!j) break;
    launch(j, n);
    launched++;
  }
  // nothing could start (instances in use, cups held by other runs): the
  // process list again in 30 s, not on every tick
  fillAgainAt = launched || !cands.length ? 0 : Date.now() + 30000;
}

function lockOrExit() {
  fs.mkdirSync(DIR, { recursive: true });
  try {
    const l = JSON.parse(fs.readFileSync(LOCK, "utf8"));
    let alive = false;
    try { process.kill(l.pid, 0); alive = true; } catch (e) { alive = e.code === "EPERM"; }
    if (alive) {
      // a PID Windows has given to another program since: the lock is stale
      let image = "";
      try { image = execFileSync("tasklist", ["/FI", `PID eq ${l.pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" }); } catch { /* none */ }
      if (/node\.exe/i.test(image)) { console.error(`another campaign (pid ${l.pid}, started ${l.startedAt}) holds ${rel(LOCK)}: stop it (state/campaign/STOP) or remove the lock if that process is not a campaign`); process.exit(1); }
    }
    say(`a stale lock of pid ${l.pid} (${l.startedAt}) is taken over`);
  } catch { /* no lock */ }
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, startedAt: RUN.startedAt, instances: INSTANCES }));
}
function unlock() { try { if (JSON.parse(fs.readFileSync(LOCK, "utf8")).pid === process.pid) fs.unlinkSync(LOCK); } catch { /* gone */ } }

// the earlier runs' record: attempts kept, failures kept (unless
// --retry-failed), and steps a dead campaign left "running" interrupted
function restore() {
  PREV = readStatusFile();
  if (!PREV) return;
  // a run that was killed outright never wrote its end
  for (const r of PREV.runs ?? []) if (r.state === "running" || r.state === "stopping") Object.assign(r, { state: "killed", endedAt: r.pid === PREV.pid ? PREV.updatedAt : null, note: "ended without recording it (its last status write is the time)" });
  const fix = (atts) => {
    for (const a of atts) {
      // a transient file error an earlier run counted as a failure
      if (a.result === "failed" && !a.transient && TRANSIENT.test(a.error ?? "") && atts.filter((x) => x.transient).length < TRANSIENT_MAX) Object.assign(a, { transient: true, counted: false });
      if (a.result === "running") {
        const end = a.end ?? PREV.updatedAt;
        Object.assign(a, { result: "interrupted", end, ms: Math.max(0, Date.parse(end) - Date.parse(a.start)) || null, note: `campaign pid ${PREV.pid} ended without recording this step's end (its last status write is the end)` });
        say(`${a.kind} of ${a.id ? `h${hh(a.hole)}-${a.id}` : `hole ${a.hole}`} on instance ${a.instance} was left running by campaign pid ${PREV.pid}: interrupted`);
        cleanupKilled(a);
      }
      if (RETRY_FAILED && (a.result === "failed" || a.result === "stalled")) a.counted = false;
    }
    return atts;
  };
  // a failure stands while the step still has its two counted failures
  for (const h of HOLES.values()) {
    const p = PREV.holes?.[h.hole];
    if (!p) continue;
    h.attempts = fix(p.attempts ?? []);
    if (p.pre === "failed" && !RETRY_FAILED && fails(h.attempts) >= MAX_FAILS) h.failed = { error: p.error, at: null };
  }
  for (const m of MODELS) {
    const p = PREV.cups?.[m.key];
    if (!p) continue;
    m.attempts.tee = fix(p.steps?.tee?.attempts ?? []);
    m.attempts.green = fix(p.steps?.green?.attempts ?? []);
    for (const q of p.steps?.battery?.parts ?? []) {
      const part = m.parts.find((x) => rel(x.out) === q.out);
      const atts = fix(q.attempts ?? []);
      if (part) part.attempts = atts; else (m.attempts.earlierParts ??= []).push({ ...q, attempts: atts });
    }
    const stands = [m.attempts.tee, m.attempts.green, ...m.parts.map((x) => x.attempts)].some((l) => fails(l) >= MAX_FAILS) || !!HOLES.get(m.hole)?.failed;
    if (p.status === "failed" && !RETRY_FAILED && stands) m.failed = { step: p.failedStep, error: p.error, at: p.failedAt };
  }
  // the same for cups outside this run's selection (their record is kept as it is)
  for (const [k, c] of Object.entries(PREV.cups ?? {})) if (!MODELS.some((m) => m.key === k)) {
    for (const a of [...(c.steps?.tee?.attempts ?? []), ...(c.steps?.green?.attempts ?? []), ...(c.steps?.battery?.parts ?? []).flatMap((q) => q.attempts ?? [])]) if (a.result === "running") { a.result = "interrupted"; cleanupKilled(a); }
    if (c.status === "running") c.status = "todo";
  }
}

async function shutdown(why, code = 130) {
  if (stopping) return;
  stopping = why;
  say(`${why}: stopping; ${running.size ? `killing ${[...running.values()].map((j) => `${jobName(j)} (pid ${j.att.pid})`).join(", ")}` : "no step running"}`);
  for (const j of running.values()) { j.killed = "stop"; killTree(j); }
  await Promise.race([Promise.all([...running.values()].map((j) => j.finished)), sleep(30000)]);
  await sweepOrphans();
  writeStatus("interrupted");
  unlock();
  say(`stopped: ${summary()}; rerun the same command to resume`);
  process.exit(code);
}

function printPlan(header) {
  const c = counts();
  const need = (f) => MODELS.filter((m) => !m.done && !m.failed && f(m));
  const holesPre = [...HOLES.values()].filter((h) => !h.preDone && MODELS.some((m) => m.hole === h.hole && !m.tee && !m.done));
  const cups = MODELS.length <= 8 ? `: ${MODELS.map((m) => `${m.key} (${m.c.label}, ${m.c.slopeDeg} deg)`).join(", ")}` : "";
  say(`${header}${MODELS.length} cups${cups}; order ${ORDER}; instances ${INSTANCES.join(", ")}; battery ${SPOTS.length} spots in ${MODELS[0].parts.length} part${MODELS[0].parts.length > 1 ? "s" : ""}${BATTERY_ARGS.length ? ` (${BATTERY_ARGS.join(" ")})` : ""}; ${P.freeGB().toFixed(1)} GB free`);
  say(`  done ${c.done}, failed ${c.failed}; to do: battery ${need((m) => m.green).length} (spots ${c.spots - c.spotsDone} left), green ${need((m) => m.tee && !m.green).length}, tee ${need((m) => !m.tee).length}${holesPre.length ? `, pre states of holes ${holesPre.map((h) => h.hole).join(", ")}` : ""}`);
  for (const m of MODELS) if (m.conflict) say(`  ${m.key} blocked: ${m.conflict}`);
  for (const m of MODELS) if (m.green && !IDX.cups[m.key]?.green) say(`  note: ${m.greenRel} exists but the pin index has no green record of it`);
}

async function liveMain() {
  lockOrExit();
  for (const f of [STOP_FILE, DRAIN_FILE]) if (fs.existsSync(f)) { fs.unlinkSync(f); say(`removed a stale ${rel(f)}`); }
  restore();
  refreshAll();
  RUN.run = (PREV?.runs?.length ?? 0) + 1;
  printPlan(`campaign pid ${process.pid}, run ${RUN.run}: `);
  for (const m of MODELS) if (m.failed) say(`  ${m.key} stays failed (${m.failed.step}: ${m.failed.error}); --retry-failed tries it again`);
  writeStatus();
  for (const sig of ["SIGINT", "SIGBREAK", "SIGTERM", "SIGHUP"]) process.on(sig, () => shutdown(sig));
  process.on("uncaughtException", (e) => { say(`campaign error: ${e.stack ?? e}`); shutdown("campaign error", 1); });
  process.on("unhandledRejection", (e) => { say(`campaign error: ${e?.stack ?? e}`); shutdown("campaign error", 1); });
  try { if (await loop()) return; } catch (e) { say(`campaign error: ${e.stack ?? e}`); return shutdown("campaign error", 1); }
  await sweepOrphans();
  const c = counts();
  const state = c.done === c.cups ? "done" : draining ? "drained" : "stopped";
  writeStatus(state);
  unlock();
  say(`campaign ${state}: ${summary()}`);
  for (const m of MODELS) if (m.failed) say(`  failed: ${m.key} at ${m.failed.step}: ${m.failed.error}`);
  for (const m of MODELS) if (!m.done && !m.failed) say(`  not done: ${m.key} (next: ${nextStepOf(m)}${m.conflict ? `: ${m.conflict}` : ""})`);
  process.exit(c.done === c.cups ? 0 : 1);
}
// the scheduling loop: true when a stop took over (shutdown exits), false
// once nothing is left to start and nothing runs
async function loop() {
  let waitedNote = 0;
  for (;;) {
    if (stopping) return true;
    if (fs.existsSync(STOP_FILE)) { try { fs.unlinkSync(STOP_FILE); } catch { /* gone */ } await shutdown("state/campaign/STOP"); return true; }
    if (!draining && fs.existsSync(DRAIN_FILE)) { try { fs.unlinkSync(DRAIN_FILE); } catch { /* gone */ } draining = true; say("state/campaign/DRAIN: no new steps; exiting once the running ones end"); }
    // a step whose log has not grown for --stall-min
    for (const j of running.values()) {
      let size = 0;
      try { size = fs.statSync(j.log).size; } catch { /* not yet */ }
      if (size !== j.lastSize) { j.lastSize = size; j.lastActive = Date.now(); }
      else if (!j.killed && Date.now() - j.lastActive > STALL_MS) { j.killed = "stall"; say(`${jobName(j)}: its log has not grown for ${STALL_MS / 60000} min; killing pid ${j.att.pid}`); killTree(j); }
    }
    await fill();
    if (stopping) return true;
    if (!running.size) {
      const gate = gateNow(), all = INSTANCES;
      const left = nextJob(W_ANY, -1, all, { stateOK: true, batteryOK: true });
      if (draining || !left) return false;
      if (!nextJob(W_ANY, -1, all, gate)) { say(`waiting for disk space: ${gate.free.toFixed(2)} GB free, nothing running: stopping`); return false; }
      if (Date.now() - waitedNote > 600000) {
        const why = [...[...busyWhy.entries()].map(([n, w]) => `instance ${n}: ${w}`), ...(foreignNote ? [`held by other runs: ${foreignNote}`] : [])];
        say(`waiting (${why.join("; ") || "nothing could start yet"})`);
        waitedNote = Date.now();
      }
    }
    await Promise.race([new Promise((r) => { wake = r; }), sleep(5000)]);
    if (stopping) return true;
    if (Date.now() - lastStatusWrite > 30000) writeStatus();
  }
}

if (PROJECT) projectMain();
else if (DRY) {
  refreshAll();
  printPlan("dry run: ");
  const ps = await procs();
  if (ps) W_LIVE.foreign = foreignWork(ps.nodes);
  const theirs = MODELS.filter((m) => !m.done && foreignOf(W_LIVE, m)).map((m) => `${m.key} (${foreignOf(W_LIVE, m)})`);
  if (theirs.length) console.log(`  left to other runs while they run: ${theirs.join(", ")}`);
  const gate = gateNow(), W = W_LIVE;
  for (const n of INSTANCES) {
    const j = nextJob(W, n, INSTANCES, gate);
    if (!j) break;
    console.log(`  instance ${n}: ${jobName(j)}: ${shown(commandOf(j, n).args)}`);
    j.m.jobs.add(j); if (j.part) j.part.job = j; if (j.h) j.h.job = j;
  }
} else await liveMain();
