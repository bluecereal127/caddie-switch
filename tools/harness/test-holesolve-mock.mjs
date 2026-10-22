// hole-solve.mjs's live path, offline: a copy of it whose Session, strike,
// readyState and screenshot are stand-ins (no Dolphin, no GDB, no DSU, no
// window), whose result and log go to state/flagcells/mock/, and whose "game"
// is the model itself: a stroke flies round-model.mjs's ball with the flag
// cloth (lib/flagcells.mjs flagCatch: a catch holes by its flat estimate,
// else the model's own rest, holed by hole-solve's rolling-in rule), at the
// power and aim struck plus an optional error (the model's error against
// WSR's, made up); the flag's frame in "RAM" is flagFrame(pin, ramWind), the
// hole-start wind unless the case gives another. Each case runs as its own
// process; the checks read its result and log.
//   node tools/harness/test-holesolve-mock.mjs [--src tools/harness/hole-solve.flagtmp.mjs] [--only A,B]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const SRC = path.resolve(ROOT, arg("--src", "tools/harness/hole-solve.mjs"));
const ONLY = arg("--only", null)?.split(",") ?? null;
const DIR = path.join(HERE, "state", "flagcells", "mock");
fs.mkdirSync(DIR, { recursive: true });
const url = (p) => pathToFileURL(p).href;

// ---- the stand-ins ----
const MOCK_MODULE = `
import fs from "node:fs";
import path from "node:path";
import * as RM from ${JSON.stringify(url(path.join(HERE, "round-model.mjs")))};
import * as FC from ${JSON.stringify(url(path.join(HERE, "lib", "flagcells.mjs")))};
import * as FS from ${JSON.stringify(url(path.join(HERE, "lib", "flagstick.mjs")))};
const cfg = JSON.parse(process.env.MOCK_CFG || "{}");
const YD = 9.144, DEG = Math.PI / 180;
const IDX = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(HERE, "state", "saves", "pins", "index.json"))}, "utf8"));
const TEES = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(HERE, "state", "saves", "index.json"))}, "utf8"));
const LIE = { fairway: 1, rough: 2, bunker: 3, green: 6, fringe: 9, tee: 15 };
const clone = (x) => JSON.parse(JSON.stringify(x));
const holes = (p) => p.holed && !!p.cupPass && p.cupPass.h < 0.25 && (!p.flag || (p.flag.vn * 240) / YD <= 3.4);
const W = { st: null, slots: {}, ramWind: null, strikes: 0 };
const gdb = {
  async u32(a) { return (0x80100000 + ((a * 7) & 0xffff0)) >>> 0; },
  async readMem(a, len) {
    const b = Buffer.alloc(len);
    if (len === 0x100) {
      if (cfg.badFrame) return b;
      const F = FS.flagFrame(W.st.pin, W.ramWind);
      const raw = [W.ramWind.speedIdx / 15, 0, ...F.ax, ...F.ay, ...F.az, ...F.origin];
      raw.forEach((v, i) => b.writeFloatBE(v, 0xb8 + 4 * i));
    } else if (len === 12) W.st.pin.forEach((v, i) => b.writeFloatBE(v, 4 * i));
    return b;
  },
  async writeMem() {}, async haltSafe() {}, async halt() {}, async go() {}, async clearBreaks() {},
};
export class MockSession {
  constructor({ instance, log } = {}) { Object.assign(this, { instance: 99, log, child: null, gdb, dsu: null }); }
  async start(file) {
    const m = /h(\\d\\d)-(s\\d)-tee\\.sav$/.exec(file);
    const row = IDX.cups[\`h\${m[1]}-\${m[2]}\`], hole = Number(m[1]);
    const aim = TEES[hole]?.aim ?? [0, -1];
    W.ramWind = cfg.ramWind ?? row.wind;
    W.st = { hole, mode: row.mode, pin: row.pinRam, wind: { angle: 0, speedIdx: 0, dir: 0 }, club: "driver",
      player: { lie: 15, aim, heading: Math.atan2(aim[0], aim[1]) }, ball: { pos: row.tee.pos, life: 0, moving: 0 } };
    return this;
  }
  async stop() {}
  async paused(fn) { return fn(gdb); }
  async state() { return clone(W.st); }
  async saveSlot(k) { W.slots[k] = clone(W.st); return \`slot \${k}\`; }
  async loadSlot(k) { W.st = clone(W.slots[k]); }
}
export const MOCK = {
  // the game: the model with the cloth, at the power and aim struck plus cfg's error
  async strike(st, c) {
    W.strikes++;
    const hole = W.st.hole, lie = st.player.lie, ball = st.ball.pos;
    const gamePower = +c.power.toFixed(4), heading = c.heading;
    const eq = cfg.errPowerSeq ? cfg.errPowerSeq[(W.strikes - 1) % cfg.errPowerSeq.length] : (cfg.errPower ?? 0);
    const q = gamePower + eq, h = heading + (cfg.errHeadingDeg ?? 0) * DEG;
    const f = FC.flagCatch({ hole, ball, heading: h, club: c.club, power: q, lie, pin: st.pin, flagWind: W.ramWind, wind: null });
    const p = f.flagOut ? RM.predict({ hole, ball, heading: h, club: c.club, power: q, lie, wind: null, pin: st.pin }) : f.model;
    let holed, rest;
    if (f.catch) { holed = !!f.holedEst; rest = holed ? st.pin.slice() : f.flat.rest; }
    else { holed = holes(p); rest = holed ? st.pin.slice() : [p.rest[0], p.restY, p.rest[1]]; }
    W.st.ball = { pos: rest, life: (W.st.ball.life ?? 0) + (p.ticks ?? 1000), moving: 0 };
    W.st.player = { ...W.st.player, lie: LIE[p.restLie] ?? 1 };
    return { club: c.club, power: c.power, gamePower, heading, aimErrDeg: 0, rest, holed, hazard: p.hazard ?? 0, toPin: Math.hypot(rest[0] - st.pin[0], rest[2] - st.pin[2]) / YD,
      mock: { first: f.first ?? null, caught: !!f.catch } };
  },
  async readyState() { return clone(W.st); },
  async screenshot() { return ${JSON.stringify(path.join(DIR, "no-screenshot.png"))}; },
};
`;
fs.writeFileSync(path.join(DIR, "mock-session.mjs"), MOCK_MODULE);

// ---- the copy of hole-solve.mjs ----
let src = fs.readFileSync(SRC, "utf8");
const sub = (from, to) => {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`the mock's substitution occurs ${n} times (must be 1): ${String(from).slice(0, 80)}`);
  src = src.replace(from, () => to);
};
const cut = (start) => {                       // a top-level function, from its header to the "}" that closes it
  const i = src.indexOf(start);
  if (i < 0 || src.indexOf(start, i + 1) >= 0) throw new Error(`no single ${start}`);
  const j = src.indexOf("\n}\n", i);
  return src.slice(i, j + 3);
};
sub(`import { Session, SAVES } from "./lib/session.mjs";`, `import { SAVES } from "./lib/session.mjs";\nimport { MockSession as Session, MOCK } from ${JSON.stringify(url(path.join(DIR, "mock-session.mjs")))};`);
src = src.replace(/from "\.\/(lib\/[a-z0-9-]+\.mjs|round-[a-z]+\.mjs)"/g, (_, p) => `from ${JSON.stringify(url(path.join(HERE, p)))}`);
sub("const HERE = path.dirname(fileURLToPath(import.meta.url));", `const HERE = ${JSON.stringify(HERE)};`);
sub('const OUT = path.join(HERE, "results", "solve", `h${P.hh(hole)}-${cupId}.json`);', "const OUT = path.join(process.env.MOCK_DIR, `h${P.hh(hole)}-${cupId}.json`);");
sub('const LOGF = path.join(HERE, "state", "solve", `h${P.hh(hole)}-${cupId}.log`);', "const LOGF = path.join(process.env.MOCK_DIR, `h${P.hh(hole)}-${cupId}.log`);");
sub(cut("async function strike(st, c) {"), "async function strike(st, c) { return MOCK.strike(st, c); }\n");
sub(cut("async function readyState() {"), "async function readyState() { return MOCK.readyState(); }\n");
sub("await P.screenshot(s, ", "await MOCK.screenshot(s, ");
if (/from "\.\//.test(src)) throw new Error("a relative import is left in the mock copy");
const COPY = path.join(DIR, "hsmock.mjs");
fs.writeFileSync(COPY, src);
execFileSync(process.execPath, ["--check", COPY], { stdio: "inherit" });

// ---- the cases ----
const CASES = [
  { id: "A", hole: 17, cup: "s5", cfg: {}, what: "h17-s5, the model is the game: the first flag cell holes; the edges after it" },
  { id: "B", hole: 17, cup: "s5", cfg: { errHeadingDeg: 0.3 }, what: "h17-s5, the game 0.3 deg off the model: every flag cell misses, each tried once, no corrections" },
  { id: "C", hole: 2, cup: "s0", cfg: {}, what: "h02-s0: the rolling ace holes first; the flag never searched" },
  { id: "D", hole: 2, cup: "s0", cfg: { errPowerSeq: [0.05, -0.05] }, what: "h02-s0, the game off the model by +-0.05 of power in turn (nothing holes): the rolling cells over 0.86 with their corrections, then the flag search and its cells, then the rest" },
  { id: "E", hole: 17, cup: "s5", cfg: { ramWind: { angle: Math.PI / 2, speedIdx: 0, dir: 2 } }, what: "h17-s5, RAM's flag frame calm (s 0.5) against index.json's speedIdx 10: RAM's is used" },
  { id: "F", hole: 17, cup: "s5", cfg: { badFrame: true }, what: "h17-s5, the RAM frame unreadable (zeros): index.json's wind stays, the run goes on" },
  { id: "G", hole: 6, cup: "s1", cfg: {}, what: "h06-s1 (par 4): a setup, then the final stroke from the fairway with the flag in" },
];
const results = [];
for (const C of CASES) {
  if (ONLY && !ONLY.includes(C.id)) continue;
  const dir = path.join(DIR, C.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  let code = 0, out = "";
  try { out = execFileSync(process.execPath, ["--max-old-space-size=7000", COPY, "--hole", String(C.hole), "--cup", C.cup], { cwd: ROOT, env: { ...process.env, MOCK_DIR: dir, MOCK_CFG: JSON.stringify(C.cfg) }, encoding: "utf8", maxBuffer: 64 << 20 }); }
  catch (e) { code = e.status; out = String(e.stdout ?? "") + String(e.stderr ?? ""); }
  const ms = Date.now() - t0;
  fs.writeFileSync(path.join(dir, "out.txt"), out);
  const r = (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, `h${String(C.hole).padStart(2, "0")}-${C.cup}.json`), "utf8")); } catch { return null; } })();
  results.push({ ...C, code, ms, r, out });
}

// ---- the checks ----
let fails = 0;
const check = (ok, what) => { console.log(`    ${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails++; };
const lines = (out, re) => out.split(/\r?\n/).filter((l) => re.test(l));
for (const R of results) {
  const { r, out } = R;
  console.log(`\n${R.id}: ${R.what} (exit ${R.code}, ${(R.ms / 1000).toFixed(1)} s)`);
  for (const l of lines(out, /flag|must hole|try \d+|SOLVED|not solved|FAILED|ace window/).slice(0, 14)) console.log(`      ${l.slice(0, 260)}`);
  check(!!r && !r.error && !/FAILED/.test(out), "the run ended without an error");
  if (!r) continue;
  check(r.tries.every((t) => t.how === "roll" || t.how === "flag"), "every try row has how roll | flag");
  const tryLines = lines(out, /^\[[0-9:]+\] try \d+, stroke/);
  check(tryLines.length === r.tries.length && tryLines.every((l) => /\((?:[^()]*), (roll|flag)\):/.test(l)), "every try's log line names its how");
  if (R.id === "A") {
    check(r.solved && r.strokes?.[0]?.how === "flag", "solved in 1 through the flag");
    check(r.tries[0]?.how === "flag" && r.tries[0]?.why === "cell 1" && r.tries[0]?.flag?.route === "bounce", "the first try is flag cell 1, its route recorded");
    check(r.flagFrame?.boot?.diffU < 0.01 && r.flagFrame?.tee?.diffU < 0.01 && /frame in RAM after the calm wind and the tee save matches/.test(out), "the RAM frame matches index.json's wind at the boot and at the tee");
    check(r.edges?.v === 2 && Number.isFinite(r.edges?.widthDeg), "the edges ran (v 2)");
  }
  if (R.id === "B") {
    check(!r.solved, "not solved");
    check(r.tries.length > 0 && r.tries.every((t) => t.how === "flag" && !/correction/.test(t.why)), `every try a flag cell, none corrected (${r.tries.length} tries)`);
    check(r.tries.length <= 6 && new Set(r.tries.map((t) => t.why)).size === r.tries.length, "each flag cell tried once, at most MAX_FLAG_CELLS");
  }
  if (R.id === "C") {
    check(r.solved && r.tries[0].how === "roll" && r.tries[0].why === "cell 1" && r.strokes[0].how === "roll", "solved by the first rolling cell");
    const firstSolved = out.indexOf("SOLVED");
    check(!/\] {3}flag \(/.test(out.slice(0, firstSolved)), "no flag search before the ace (deferred)");
  }
  if (R.id === "D") {
    const cellNo = (t) => Number(/cell (\d+)/.exec(t.why)?.[1]);
    const flagTries = r.tries.filter((t) => t.how === "flag"), rollTries = r.tries.filter((t) => t.how === "roll");
    const fN = flagTries.map(cellNo), lo = Math.min(...fN), hi = Math.max(...fN);
    check(!r.solved, "not solved (nothing holes)");
    check(rollTries.some((t) => /correction/.test(t.why)), "the rolling cells were corrected");
    check(/\] {3}flag \(/.test(out), "the flag search ran");
    check(flagTries.length > 0 && flagTries.every((t) => !/correction/.test(t.why)) && new Set(fN).size === flagTries.length && hi - lo + 1 === flagTries.length, `the flag cells ${lo}-${hi} tried once each, none corrected`);
    check(rollTries.some((t) => cellNo(t) < lo) && rollTries.some((t) => cellNo(t) > hi), "rolling cells before them (scores over 0.86) and after them (the rest)");
    const firstFlag = r.tries.find((t) => t.how === "flag");
    check(!!firstFlag && out.search(/\] {3}flag \(/) > out.indexOf(`try ${firstFlag.n - 1}, stroke`), "the flag search ran only once the order reached it (after the try before the first flag try)");
  }
  if (R.id === "E") {
    check(/DIFFERS/.test(out) && r.flagFrame?.used?.src?.startsWith("RAM"), "the RAM frame differs and is used");
    check(Math.abs((r.flagFrame?.used?.wind?.speedIdx ?? 99) - 0) < 1e-6, "the flag wind used: speedIdx 0");
  }
  if (R.id === "F") {
    check(/does not read as a flag frame/.test(out) && r.flagFrame?.used?.src === "index.json", "the bad frame is reported, index.json's wind kept");
  }
  if (R.id === "G") {
    check(r.tries.some((t) => /setup/.test(t.why)) && r.tries.some((t) => t.k === 2), "a setup, then stroke 2");
  }
}
console.log(`\n${fails ? `${fails} check(s) FAILED` : "all checks passed"}; the copies and outputs in ${path.relative(ROOT, DIR)}`);
process.exit(fails ? 1 : 0);
