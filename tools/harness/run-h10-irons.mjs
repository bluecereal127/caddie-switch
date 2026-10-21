// The harness's first question (2026-10-21): hole 10 from the tee, the four
// irons at full power, calm and with a 4 mph headwind: carry, first bounce
// and roll in WSR itself, against src/wsrsim.js over public/terrain (the
// app's line), over the KCL triangles, and flat. Also the determinism check:
// the first shot is flown twice from the same state and the two traces must
// agree to the bit.
//   node tools/harness/run-h10-irons.mjs   -> tools/harness/results/h10-irons.json
import fs from "node:fs";
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { STATE, HARNESS } from "./lib/dolphin.mjs";
import { YD, appProfile, kclProfile, simOf, kcl, groundAt } from "./lib/course.mjs";
import { run } from "../lib/wsrsim.mjs";

const HOLE = 10;
const SAVE = path.join(SAVES, "h10-tee-w10.sav");
const CLUBS = ["3iron", "5iron", "7iron", "9iron"];
// WSR wind: StaticMem-style (dir, speed index); index 2 = 4 mph (2 mph per
// index, wsr-club-physics.md 4.4); dir 0 = the air moving +z (south), into
// the face of a shot north up hole 10
const WINDS = { calm: { dir: 0, speedIdx: 0 }, head4: { dir: 0, speedIdx: 2 } };
const RAW = path.join(STATE, "raw");
fs.mkdirSync(RAW, { recursive: true });

function analyse(shot, tee, aim) {
  const P = shot.path;
  const [dx, dz] = aim;
  const along = (r) => ((r[1] - tee[0]) * dx + (r[3] - tee[2]) * dz) / YD;
  const across = (r) => ((r[1] - tee[0]) * -dz + (r[3] - tee[2]) * dx) / YD;
  const first = P.findIndex((r) => r[8] === 1);
  // a bounce = the tick vy turns from falling to rising after a contact
  const bounces = [];
  for (let i = first; i < P.length; i++) if (i === first || (P[i - 1][5] < 0 && P[i][5] > 0.005)) bounces.push(i);
  // first bounce: from the first contact to the second, its peak above the
  // first contact point
  const b1 = bounces[0], b2 = bounces[1];
  let peak = P[b1][2];
  for (let i = b1; i < (b2 ?? P.length); i++) peak = Math.max(peak, P[i][2]);
  let apex = P[0]; for (const r of P) if (r[2] > apex[2]) apex = r;
  const last = P[P.length - 1];
  return {
    carry: along(P[first]), carryAcross: across(P[first]), landDy: (P[first][2] - tee[1]) / YD,
    landVy: P[first][5], landSpeed: Math.hypot(P[first][4], P[first][5], P[first][6]),
    bounce1: { len: b2 != null ? along(P[b2]) - along(P[b1]) : null, height: (peak - P[b1][2]) / YD, upVy: P[b1 + 1]?.[5] },
    contacts: bounces.length,
    rest: along(last), restAcross: across(last), restDy: (last[2] - tee[1]) / YD,
    roll: along(last) - along(P[first]),
    apex: (apex[2] - tee[1]) / YD, ticks: last[0],
  };
}

const s = new Session({ log: (m) => console.log(m) });
await s.start(SAVE);
const st0 = await s.state();
const tee = st0.ball.pos, aim = st0.player.aim;
const mesh = await kcl(HOLE);
const g0 = mesh ? groundAt(mesh, tee[0], tee[2]) : null;
console.log(`hole ${st0.hole}, tee ${tee.map((v) => v.toFixed(2))}, aim ${aim.map((v) => v.toFixed(4))}, ground under the ball ${g0 ? (tee[1] - g0.y).toFixed(3) + " u" : "?"}`);
const app = await appProfile(HOLE, tee[0], tee[2], aim[0], aim[1]);
const kp = await kclProfile(HOLE, tee[0], tee[2], aim[0], aim[1]);
// the wind relative to the shot for the port: deg 0 = tail, 90 = from the left toward the right
const windDeg = (w) => {
  const a = (w.dir * Math.PI) / 4, wx = Math.sin(a), wz = Math.cos(a);
  return (Math.atan2(wx * -aim[1] + wz * aim[0], wx * aim[0] + wz * aim[1]) * 180) / Math.PI;
};
const results = { hole: HOLE, save: path.basename(SAVE), tee, aim, line: { pos: app.pos, bearing: app.bearing }, shots: [], determinism: null };
const port = (club, w, prof) => {
  const wind = w.speedIdx ? { mph: 2 * w.speedIdx, deg: windDeg(w) } : null;
  const o = run({ club, q: 1, profile: prof ? simOf(prof) : null, wind, trace: true });
  // carry / roll / first bounce from the port's path ([x, y, ...] in yd) as for the harness
  return { carry: o.carry, stop: o.stop, roll: o.stop - o.carry, apex: o.apex, bounces: o.bounces, ticks: o.ticks };
};

let firstTrace = null;
for (const club of CLUBS) {
  for (const [wname, w] of Object.entries(WINDS)) {
    await s.load();
    const t0 = Date.now();
    const shot = await s.shoot({ power: 1.0, club, wind: w, trace: true });
    const ms = Date.now() - t0;
    fs.writeFileSync(path.join(RAW, `h10-${club}-${wname}.json`), JSON.stringify({ cols: ["life", "x", "y", "z", "vx", "vy", "vz", "attrMax", "touched", "moving"], ...shot }));
    const a = analyse(shot, tee, aim);
    const row = {
      club, wind: wname, windWsr: w, ms,
      launch: { speed: Math.hypot(...shot.handoff.launchVel), angle: (Math.atan2(shot.handoff.launchVel[1], Math.hypot(shot.handoff.launchVel[0], shot.handoff.launchVel[2])) * 180) / Math.PI },
      wsr: a,
      portApp: port(club, w, app.prof), portKcl: kp ? port(club, w, kp) : null, portFlat: port(club, w, null),
      simMatchesReal: shot.sim ? shot.ball.pos.every((v, i) => v === shot.sim.pos[i]) : null,
    };
    results.shots.push(row);
    console.log(`${club} ${wname}: WSR carry ${a.carry.toFixed(1)} roll ${a.roll.toFixed(1)} rest ${a.rest.toFixed(1)} (bounce1 ${a.bounce1.len?.toFixed(1)} long, ${a.bounce1.height.toFixed(1)} high) | port app ${row.portApp.carry.toFixed(1)} / ${row.portApp.stop.toFixed(1)} | kcl ${row.portKcl?.carry.toFixed(1)} / ${row.portKcl?.stop.toFixed(1)} | ${(ms / 1000).toFixed(0)} s`);
    if (!firstTrace) firstTrace = { club, w, path: shot.path };
  }
}
// determinism: the first shot again from the same state
await s.load();
const again = await s.shoot({ power: 1.0, club: firstTrace.club, wind: firstTrace.w, trace: true });
const same = again.path.length === firstTrace.path.length && again.path.every((r, i) => r.every((v, j) => Object.is(v, firstTrace.path[i][j])));
results.determinism = { club: firstTrace.club, wind: firstTrace.w, ticks: again.path.length, identical: same };
console.log(`determinism: ${firstTrace.club} twice from the same state: ${same ? "bit-identical" : "DIFFERENT"} (${again.path.length} ticks)`);
await s.stop();
fs.mkdirSync(path.join(HARNESS, "results"), { recursive: true });
fs.writeFileSync(path.join(HARNESS, "results", "h10-irons.json"), JSON.stringify(results, (k, v) => (typeof v === "number" ? +v.toFixed(4) : v), 1));
console.log("wrote tools/harness/results/h10-irons.json");
