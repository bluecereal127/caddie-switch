// The plaid's black-box test (2026-11-03): a shot onto the green chosen so the ball->cup line runs diagonal to north
// (the minimap is north-up; a square plaid turned onto an axis-aligned line would not show the turn), played for real
// through the robot's pieces (tools-r6/rsolve.mjs flyFrom, tools/rswing.mjs, ramd), then frames grabbed through the
// flight, the rest and the next address WITHOUT pressing A, each with its time and RAM's ball.
//   node teeshot.mjs plan [--clubs IR7,IR5,IR9] [--min 3] [--max 10] [--tol 10]   -> candidates, best first
//   node teeshot.mjs go <club> <pct> <bearing> [--tag t1] [--secs 30]              -> the shot and its frames
import fs from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
const ROOT = "C:/Users/Stephen/Desktop/caddie-switch-web/caddie-web", E = `${ROOT}/tools/harness/state/eden`, HOST = "http://127.0.0.1:8899";
const OUT = `${E}/lab/plaid/eden`;
const imp = (p) => import(pathToFileURL(p).href);
const S = await imp(`${E}/tools-r6/rsolve.mjs`);
const SW = await imp(`${E}/tools/rswing.mjs`);
const { ramClient } = await imp(`${E}/tools/ramclient.mjs`);
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (p, body) => fetch(`${HOST}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json()).catch(() => null);
const D = 180 / Math.PI, GREEN = 6;
const RD = ramClient();
const R = await RD.call("state", { hole: "auto" }, { timeoutMs: 180000 });
const h = R.hole, cup = R.cup, ball = R.ball;
const lineOf = (p) => S.bearingOf(h, Math.atan2(cup.world[0] - p[0], -(cup.world[2] - p[2])) * D);
const diagErr = (b) => Math.abs((((b % 90) + 90) % 90) - 45);
console.log(`hole ${h}, cup ${cup.k} at (${cup.world.map((v) => v.toFixed(3)).join(", ")}), ${cup.dist_m.toFixed(2)} m; ball (${ball.map((v) => v.toFixed(3)).join(", ")}), lie ${R.lie.name}, wind ${R.wind.s_mps} m/s toward ${R.wind.angle_deg} deg`);

async function plan() {
  const clubs = arg("--clubs", "IR7,IR5,IR9").split(","), dMin = Number(arg("--min", 3)), dMax = Number(arg("--max", 10)), tol = Number(arg("--tol", 10));
  const lie = R.last_shot.power === 0 && R.lie.name !== "green" ? 13 : R.lie.attr;   // stroke 1: the tee
  console.log(`lie ${lie}`);
  const h0 = Math.atan2(cup.world[0] - ball[0], -(cup.world[2] - ball[2])) * D;
  const shots = [];
  const pmin = Number(arg("--pmin", 40)), pmax = Number(arg("--pmax", 100)), amax = Number(arg("--amax", 14)), astep = Number(arg("--astep", 0.5));
  const want = arg("--want", null) != null ? Number(arg("--want")) : null;   // a wanted line bearing (else any diagonal)
  for (const c of clubs) for (let pct = pmin; pct <= pmax; pct++) for (let a = -amax; a <= amax; a += astep) shots.push([c, (pct + 0.5) / 100 > 1 && c !== "PT" ? 1 : (pct + 0.5) / 100, h0 + a]);
  const t0 = Date.now();
  const out = await S.flyFrom({ hole: h, cup, lie, wind: R.wind, start: ball }, shots);
  console.log(`${shots.length} flights in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const key = (s) => `${s[0]}|${Math.round(s[1] * 100)}|${s[2].toFixed(2)}`;
  const at = new Map(shots.map((s, i) => [key(s), out[i]]));
  const ok = (o) => o && o.restAttr === GREEN && !o.holed && !o.flag;
  const cand = [];
  shots.forEach((s, i) => {
    const o = out[i]; if (!ok(o)) return;
    const d = Math.hypot(o.rest[0] - cup.world[0], o.rest[2] - cup.world[2]); if (d < dMin || d > dMax) return;
    const b = lineOf(o.rest), e = want != null ? Math.abs(((b - want + 540) % 360) - 180) : diagErr(b); if (e > tol) return;
    // robust: the percent and half-degree neighbours rest on the green too, the line still diagonal within tol + 8
    const nb = [[0, -1, 0], [0, 1, 0], [0, 0, -astep], [0, 0, astep]].map(([, dp, da]) => at.get(key([s[0], s[0] === "PT" ? s[1] + dp / 100 : Math.min(1, s[1] + dp / 100), s[2] + da])));
    if (!nb.every((n) => n == null || (ok(n) && (want != null ? Math.abs(((lineOf(n.rest) - want + 540) % 360) - 180) : diagErr(lineOf(n.rest))) <= tol + 8))) return;
    const offCup = Math.abs(((S.bearingOf(h, s[2]) - lineOf(ball) + 540) % 360) - 180); if (offCup < Number(arg("--offmin", 0))) return;
    cand.push({ club: s[0], offCup: +offCup.toFixed(1), pct: Math.round(s[1] * 100 - 0.5), power: s[1], heading: +s[2].toFixed(3), bearing: +S.bearingOf(h, s[2]).toFixed(3), rest: o.rest.map((v) => +v.toFixed(3)), toCupM: +d.toFixed(2), line: +b.toFixed(1), diagErr: +e.toFixed(1) });
  });
  cand.sort((a, b) => a.diagErr - b.diagErr || Math.abs(a.toCupM - 6) - Math.abs(b.toCupM - 6));
  console.log(`${cand.length} candidates; best:`);
  for (const c of cand.slice(0, 15)) console.log(JSON.stringify(c));
  fs.writeFileSync(join(OUT, `plan-h${h}.json`), JSON.stringify({ hole: h, cup, ball, wind: R.wind, lie, cand }, null, 1));
}

async function go() {
  const [club, pctS, bearingS] = process.argv.slice(3, 6), pct = Number(pctS), bearing = Number(bearingS), tag = arg("--tag", "t1"), secs = Number(arg("--secs", 30));
  const power = club === "PT" ? (pct + 0.5) / 100 : Math.min(1, (pct + 0.5) / 100);
  const log = [];
  const note = (m) => { const l = `[${new Date().toISOString().slice(11, 23)}] ${m}`; console.log(l); log.push(l); };
  note(`go: ${club} pct ${pct} (power ${power}) bearing ${bearing}`);
  // the stance: the address pose held 3 s, then X (the gauge comes up)
  await post("/motion", { accel: [0, 0, -1], gyro: [0, 0, 0] }); await sleep(3200); await post("/tap?b=Triangle&ms=200"); await sleep(1200);
  if (R.club !== club) { const c = await RD.call("club", { hole: h, want: club }); note(`club ${JSON.stringify(c)}`); }
  const a = await RD.call("fset", { hole: h, deg: bearing, tol: 0.02 }); note(`aim ${JSON.stringify(a).slice(0, 200)}`);
  const st = JSON.parse(fs.readFileSync(`${E}/rplay-state.json`, "utf8"));
  // a putt: practice putts dial the stroke until RAM reads the percent's middle (rplay's way); a full swing: the cap; else
  // the robot's no-practice prediction
  const raw = arg("--raw", null);
  const d = raw ? { sw: { back: Number(raw.split(",")[0]), peak: Number(raw.split(",")[1]) }, exact: "raw" } : club === "PT" ? await SW.dial(power, 1, true, 0.005, st, note) : power >= 1 - 1e-9 ? { sw: { back: 168, dur: 0.65 }, exact: "cap" } : SW.predictSw(power, 1, st);
  note(`swing ${JSON.stringify(d.sw)} (${d.exact})`);
  const npz = join(OUT, `${tag}-flight.npz`);
  const W = spawn("python", ["-P", `${E}/tools/ballwatch.py`, "watch", npz, "45"], { stdio: ["ignore", "pipe", "pipe"] });
  let wout = ""; W.stdout.on("data", (x) => (wout += x)); W.stderr.on("data", (x) => (wout += x));
  // --to x,y,z: the stroke is held at that spot from its launch until it rests there (rollto.py, a memory write)
  const to = arg("--to", null);
  let RT = null, rtout = "";
  if (to) { RT = spawn("python", ["-P", `${OUT}/rollto.py`, ...to.split(","), "--hold-ms", "1500", "--wait-s", "90"], { stdio: ["ignore", "pipe", "pipe"] }); RT.stdout.on("data", (x) => (rtout += x)); RT.stderr.on("data", (x) => (rtout += x)); }
  await sleep(900);
  const t0 = Date.now();
  const swingDone = SW.swing(d.sw, true, { settled: false }).then(() => post("/motion", { accel: [0, 0, -1], gyro: [0, 0, 0] }));
  // frames from the swing on: every ~0.5 s, each with RAM's ball (the rest read: position, velocity, mode)
  const frames = [];
  let restAt = null;
  for (let k = 0; Date.now() - t0 < secs * 1000; k++) {
    const t = Date.now() - t0, name = `${tag}-f${String(k).padStart(3, "0")}`;
    const f = `${OUT}/${name}.png`;
    const g = await fetch(`${HOST}/grab?out=${encodeURIComponent(f.replace(/\//g, "\\"))}`).then((x) => x.json()).catch(() => null);
    let r = null; try { r = await RD.call("rest", { hole: h }, { timeoutMs: 5000 }); } catch { /* */ }
    const still = r && r.mode === 0 && r.v.every((x) => x === 0);
    if (still && restAt == null && frames.some((q) => q.mode != null && q.mode !== 0)) { restAt = t; note(`ball at rest at ${t} ms: (${r.ball.map((v) => v.toFixed(4)).join(", ")}), lie ${r.lie?.name}`); }
    frames.push({ name, t, ok: !!g?.out, ball: r?.ball ?? null, v: r?.v ?? null, mode: r?.mode ?? null, lie: r?.lie?.name ?? null });
    await sleep(350);
  }
  await swingDone;
  if (RT) { await new Promise((r) => (RT.exitCode != null ? r() : RT.on("exit", r))); note(`rollto: ${rtout.trim().slice(-400)}`); }
  const after = await RD.call("state", { hole: h }, { timeoutMs: 60000 }).catch((e) => ({ err: String(e) }));
  note(`after: ${JSON.stringify(after).slice(0, 400)}`);
  fs.writeFileSync(join(OUT, `${tag}.json`), JSON.stringify({ hole: h, cup, before: R, shot: { club, pct, power, bearing, sw: d.sw }, restAt, frames, after, watch: wout.trim().slice(-300), log }, null, 1));
}

try { if (process.argv[2] === "plan") await plan(); else if (process.argv[2] === "go") await go(); else console.log("plan | go"); }
finally { RD.close(); S.stop(); }
process.exit(0);
