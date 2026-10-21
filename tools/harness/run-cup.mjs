// Validation 2d: the cup and the roll on a green. On a green reached by real
// play (a par 3's tee shot planned with the port to stop `--back` yd short of
// the pin; saved as SAVES/hNN-green.sav), putts traced tick by tick, each
// giving WSR's closest approach to the cup centre, the ball's speed there and
// the verdict (the look-ahead's hole-out frame: the game's own cup, an
// analytic pit of radius 1.5 u, depth 3 u, wsr-ground-phase.md 6), against
// the app's src/putt.js: the cup rule (holed when the path comes within
// CUP_R = 0.15 yd of the centre at no more than V_CAP = vFlat(4.4) = 4.07
// yd/s) and the roll (simPutt over the mesh green heights, public/terrain
// gNN.bin through puttField, with the cup taken away, against WSR's rest).
//
// Both greens break (the first grid, aimed straight and right of the cup
// only, holed nothing from 3.7 yd on hole 2, whose putts break 0.6 yd right),
// so the lines are aimed off the break: per speed (the flat-green roll D + e)
// one probe putt on the app's holing line (pass 0) measures WSR's own pass,
// and the rest of the speed's lines are aimed where the app passes at
// o - probe, so WSR passes near o.
//   node tools/harness/run-cup.mjs --hole 11 [--back 6] [--excess 0.5,2,3.5,4.5,5.5]
//        [--offsets -0.22,-0.18,-0.14,-0.1,-0.05,0,0.05,0.1,0.14,0.18,0.22] [--instance 0]
import fs from "node:fs";
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { HARNESS } from "./lib/dolphin.mjs";
import { YD } from "./lib/course.mjs";
import { planStroke, waitStroke } from "./lib/play.mjs";
import { P, closest, greenModel } from "./lib/green.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const hole = Number(arg("--hole", 11));
const back = Number(arg("--back", 6));
const excess = arg("--excess", "0.5,2,3.5,4.5,5.5").split(",").map(Number);
const offsets = arg("--offsets", "-0.22,-0.18,-0.14,-0.1,-0.05,0,0.05,0.1,0.14,0.18,0.22").split(",").map(Number);
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const outFile = path.join(HARNESS, arg("--out", `results/cup-h${hole}.json`));
const tag = String(hole).padStart(2, "0");
const greenSave = path.join(SAVES, `h${tag}-green.sav`);
const TICK_YD_S = 240 / YD;   // 1 u/tick in yd/s

const s = new Session({ instance: inst, log: (m) => console.log(m) });
if (!fs.existsSync(greenSave)) {
  await s.start(path.join(SAVES, `h${tag}-tee.sav`));
  const st = await s.state();
  const plan = await planStroke(hole, { ...st, pin: (() => {
    // aim at a point `back` yd short of the pin on the tee -> pin line
    const [bx, , bz] = st.ball.pos, [px, py, pz] = st.pin, d = Math.hypot(px - bx, pz - bz);
    return [px - ((px - bx) / d) * back * YD, py, pz - ((pz - bz) / d) * back * YD];
  })() });
  const shot = await s.shoot({ power: plan.power, club: plan.club, heading: plan.heading, trace: false, untilRest: "predicted", powerMode: "game" });
  console.log(`tee shot ${plan.club} ${plan.power}: rest ${(Math.hypot(shot.ball.rest[0] - st.pin[0], shot.ball.rest[2] - st.pin[2]) / YD).toFixed(1)} yd from the pin`);
  await waitStroke(s, hole);
  const st2 = await s.state();
  if (st2.player.lie !== 6) { console.log(`the ball is not on the green (lie ${st2.player.lie}); stopping`); await s.stop(); process.exit(1); }
  await s.saveState(path.basename(greenSave));
  console.log(`saved ${path.basename(greenSave)}`);
} else await s.start(greenSave);
if (!s.saveFile.endsWith(path.basename(greenSave))) { s.saveFile = greenSave; s.start0 = null; await s.load(greenSave, null).catch(() => {}); await s.waitLoaded(null); }

const st = await s.state();
const ball = st.ball.pos, pin = st.pin;
const { D, toPin, field, fBall, fCup, toMesh, powerFor, appRoll, aimFor, along, across } = greenModel(hole, ball, pin);

console.log(`hole ${hole} green: ball ${D.toFixed(2)} yd from the cup`);
const results = { kind: "cup-2d", hole, save: path.basename(greenSave), ball, pin, distance: D, cupR: P.CUP_R, vCap: P.V_CAP, putts: [] };
const write = () => { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(results, (k, v) => (typeof v === "number" ? +v.toFixed(5) : v))); };

async function putt(e, angDeg, role, target) {
  await s.load(greenSave, { pos: ball, life: st.ball.life });
  const power = powerFor(D + e), v0 = P.wsrPuttV0(power);
  const shot = await s.shoot({ power, club: "putter", heading: toPin - (angDeg * Math.PI) / 180, trace: true, maxTicks: 3000 });
  // [life, x, y, z, vx, vy, vz, ...] after each tick -> east, north (yd), t (s)
  const pts = shot.path.map((r) => [r[1] / YD, -r[3] / YD, r[0] / 240]);
  const w = closest(pts, pin[0] / YD, -pin[2] / YD);
  const tick = shot.path[Math.min(w.i, shot.path.length - 1)];
  const b = shot.ball;
  const app = appRoll(angDeg, v0);
  const appStop = toMesh(app.r.stop);
  const row = {
    excess: e, role, target, angDeg, power, v0,
    wsr: { holed: b.holeFrame >= 0, holeFrame: b.holeFrame, pass: w.dist, offset: w.offset, speed: Math.hypot(tick[4], tick[6]) * TICK_YD_S,
      rest: [along(b.pos), across(b.pos)], ticks: shot.path.length },
    app: { pass: app.pass.dist, offset: app.pass.offset, speed: app.pass.speed, rest: [along([appStop[0], 0, appStop[1]]), across([appStop[0], 0, appStop[1]])],
      holedByRule: app.pass.dist <= P.CUP_R && app.pass.speed <= P.V_CAP,
      holedSim: P.simPutt(field, fBall, fCup, angDeg, v0 / P.vFlat(D), { trace: false }).holed },
  };
  results.putts.push(row); write();
  console.log(`e ${e} ${role} aim ${angDeg.toFixed(3)} deg: WSR ${row.wsr.holed ? "HOLED" : "missed"}, passes ${row.wsr.offset >= 0 ? "+" : ""}${row.wsr.offset.toFixed(3)} at ${row.wsr.speed.toFixed(2)} yd/s, rests ${row.wsr.rest.map((v) => v.toFixed(2)).join(" / ")} | app passes ${row.app.offset >= 0 ? "+" : ""}${row.app.offset.toFixed(3)} at ${row.app.speed.toFixed(2)} yd/s (${row.app.holedSim ? "holed" : "missed"}), rests ${row.app.rest.map((v) => v.toFixed(2)).join(" / ")}`);
  return row;
}

for (const e of excess) {
  const v0 = P.wsrPuttV0(powerFor(D + e));
  const probe = await putt(e, aimFor(0, v0), "probe", 0);
  // WSR passes the app's holing line at probe.wsr.offset: shift the targets by it
  for (const o of offsets) await putt(e, aimFor(o - probe.wsr.offset, v0), "grid", o);
}
await s.stop();
console.log(`wrote ${path.relative(process.cwd(), outFile)}`);
