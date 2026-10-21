// Validation 2d: the cup. On a green reached by real play (a par 3's tee
// shot planned with the port to stop `--back` yd short of the pin; saved as
// SAVES/hNN-green.sav), putts at speeds that would roll the flat green's
// D + e yd (e = the excess past the cup) and aimed so the straight line
// passes the cup `lat` yd to the side. WSR's verdict: the look-ahead's
// hole-out frame (the game's own cup: an analytic pit of radius 1.5 u, depth
// 3 u, wsr-ground-phase.md 6) and the real rest. The app's: src/putt.js
// simPutt over the mesh green heights (public/terrain gNN.bin, puttField),
// the same launch speed (wsrPuttV0) and aim, its cup CUP_R 0.15 yd and
// capture speed V_CAP = vFlat(4.4) = 4.07 yd/s.
//   node tools/harness/run-cup.mjs --hole 11 [--back 6] [--excess -0.3,0,0.5,1,2,3,4,5,6,8]
//        [--lat 0,0.05,0.1,0.13,0.16,0.2] [--instance 0]
import fs from "node:fs";
import path from "node:path";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Session, SAVES } from "./lib/session.mjs";
import { HARNESS, portsFor } from "./lib/dolphin.mjs";
import { YD, ROOT, DERIVED, meshToMap } from "./lib/course.mjs";
import { planStroke, waitStroke } from "./lib/play.mjs";

const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const P = await imp("src/putt.js");
const { parseGreenHeights } = await imp("src/terrain.js");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const hole = Number(arg("--hole", 11));
const back = Number(arg("--back", 6));
const excess = arg("--excess", "-0.3,0,0.5,1,2,3,4,5,6,8").split(",").map(Number);
const lats = arg("--lat", "0,0.05,0.1,0.13,0.16,0.2").split(",").map(Number);
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const outFile = path.join(HARNESS, arg("--out", `results/cup-h${hole}.json`));
const tag = String(hole).padStart(2, "0");
const greenSave = path.join(SAVES, `h${tag}-green.sav`);

const s = new Session({ gdbPort: portsFor(inst).gdb, dsuPort: portsFor(inst).dsu, log: (m) => console.log(m) });
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
const D = Math.hypot(pin[0] - ball[0], pin[2] - ball[2]) / YD;
const toPin = Math.atan2(pin[0] - ball[0], pin[2] - ball[2]);
// the app's field and the two points in green-box fractions
const d = DERIVED.holes[hole], box = d.greenBox;
const W = (box.x1 - box.x0) * DERIVED.mapW * d.scale, H = (box.y1 - box.y0) * DERIVED.mapH * d.scale;
const field = P.puttField({ green: { box, grid: d.grid, slopeMaxPct: d.slopeMaxPct }, heights: parseGreenHeights(readFileSync(path.join(ROOT, `public/terrain/g${tag}.bin`))), W, H });
const fr = (X, Z) => { const [fx, fy] = meshToMap(hole, X, Z); return { x: (fx - box.x0) / (box.x1 - box.x0), y: (fy - box.y0) / (box.y1 - box.y0) }; };
const fBall = fr(ball[0], ball[2]), fCup = fr(pin[0], pin[2]);
// launch power for a flat roll of r yd: invert wsrPuttV0 (yd/s) against vFlat
const powerFor = (r) => { const v = P.vFlat(r); let lo = 0.001, hi = 2.5; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (P.wsrPuttV0(m) < v) lo = m; else hi = m; } return (lo + hi) / 2; };
console.log(`hole ${hole} green: ball ${D.toFixed(2)} yd from the cup`);
const results = { kind: "cup-2d", hole, save: path.basename(greenSave), ball, pin, distance: D, putts: [] };
for (const e of excess) {
  for (const lat of lats) {
    await s.load(greenSave, { pos: ball, life: st.ball.life });
    const power = powerFor(D + e);
    // + lat: the line passes the cup lat yd to its right: aim right (a smaller heading)
    const dHead = -Math.atan2(lat, D);
    const shot = await s.shoot({ power, club: "putter", heading: toPin + dHead, trace: false, untilRest: "real" });
    const b = shot.ball;
    const app = P.simPutt(field, fBall, fCup, (-dHead * 180) / Math.PI, P.wsrPuttV0(power) / P.vFlat(D), { trace: false });
    const row = { excess: e, lat, power, wsr: { holed: b.holeFrame >= 0, holeFrame: b.holeFrame, rest: b.pos, restFromCup: Math.hypot(b.pos[0] - pin[0], b.pos[2] - pin[2]) / YD, below: b.pos[1] < pin[1] }, app: { holed: app.holed, best: app.best, pass: app.pass } };
    results.putts.push(row);
    console.log(`excess ${e} lat ${lat}: WSR ${row.wsr.holed ? "HOLED" : `missed, rests ${row.wsr.restFromCup.toFixed(2)} yd from the cup`} | app ${app.holed ? "holed" : `missed (closest ${app.pass?.toFixed(3)})`}`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(results, (k, v) => (typeof v === "number" ? +v.toFixed(5) : v)));
  }
}
await s.stop();
