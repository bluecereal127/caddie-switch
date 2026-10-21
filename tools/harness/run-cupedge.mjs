// Validation 2d, the cup's edge: WSR's capture window, found by bisection.
// On a green save (run-cup.mjs makes them), per speed (the flat-green roll
// D + e, so the ball reaches the cup at about vFlat(e)), a putt on the app's
// holing line, then on each side of the cup the pass offset is bisected
// between a holed and a missed putt, --steps times (0.2 / 2^5 = 0.006 yd at
// 5), aiming through the app's roll: run-cup.mjs's traced putts passed the
// cup where the app's roll did, within 0.005 yd. Untraced: WSR's verdict is
// the look-ahead's hole-out frame (ball+0x144), its pass the look-ahead's
// closest approach (ball+0x120, a distance from the cup centre), and the
// speed there the app's (within 0.1 yd/s rms of WSR's traced speeds below
// 4 yd/s, run-cup.mjs).
// --speeds v1,v2,... instead of --excess: the speeds at the cup to test, each
// turned into the excess whose app roll on the holing line reaches the cup at
// it (so spots putting up, down and across a slope are compared at the same
// speed at the cup); --save another green state (make-greenspot.mjs).
//   node tools/harness/run-cupedge.mjs --hole 2 [--excess 0.15,0.5,1,1.5,2.5,3,4,4.25,4.75 | --speeds 1,2,3]
//        [--save h02-green.sav] [--steps 5] [--instance 0]
import fs from "node:fs";
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { HARNESS } from "./lib/dolphin.mjs";
import { P, greenModel } from "./lib/green.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const hole = Number(arg("--hole", 2));
const speeds = arg("--speeds", null)?.split(",").map(Number) ?? null;
let excess = arg("--excess", "0.15,0.5,1,1.5,2.5,3,4,4.25,4.75").split(",").map(Number);
const steps = Number(arg("--steps", 5));
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const saveName = arg("--save", `h${String(hole).padStart(2, "0")}-green.sav`);
const greenSave = path.join(SAVES, saveName);
const spot = saveName.replace(/^h\d\d-|\.sav$/g, "");
const outFile = path.join(HARNESS, arg("--out", spot === "green" ? `results/cupedge-h${hole}.json` : `results/cupedge-h${hole}-${spot}.json`));

const s = new Session({ instance: inst, log: (m) => console.log(m) });
await s.start(greenSave);
const st = await s.state();
const ball = st.ball.pos, pin = st.pin;
const g = greenModel(hole, ball, pin);
console.log(`hole ${hole} green (${saveName}): ball ${g.D.toFixed(2)} yd from the cup`);
if (speeds) {
  // the excess whose app roll on the holing line reaches the cup at speed v
  const speedAt = (e) => { const v0 = P.wsrPuttV0(g.powerFor(g.D + e)); return g.appRoll(g.aimFor(0, v0), v0).pass.speed; };
  excess = speeds.map((v) => { let lo = 0, hi = 8; for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (speedAt(mid) < v) lo = mid; else hi = mid; } return +((lo + hi) / 2).toFixed(4); });
  console.log(`speeds ${speeds.join(", ")} yd/s at the cup: excess ${excess.join(", ")} yd`);
}
const results = { kind: "cupedge-2d", hole, save: path.basename(greenSave), spot, ball, pin, distance: g.D, steps, edges: [] };
const write = () => { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(results, (k, v) => (typeof v === "number" ? +v.toFixed(5) : v))); };

async function putt(power, v0, o) {
  const ang = g.aimFor(o, v0);
  await s.load(greenSave, { pos: ball, life: st.ball.life });
  // calm: the round's wind would be the save's (holes 2 and 11 were calm rounds)
  const shot = await s.shoot({ power, club: "putter", heading: g.toPin - (ang * Math.PI) / 180, wind: { dir: 0, speedIdx: 0 }, trace: false, untilRest: "real" });
  const b = shot.ball, app = g.appRoll(ang, v0).pass;
  return { o, ang, holed: b.holeFrame >= 0, pass: g.fromCup(b.close), appPass: app.dist, appSpeed: app.speed };
}

for (const e of excess) {
  const power = g.powerFor(g.D + e), v0 = P.wsrPuttV0(power);
  const centre = await putt(power, v0, 0);
  const row = { excess: e, power, speed: centre.appSpeed, centre, sides: {} };
  console.log(`e ${e}: the cup at ${centre.appSpeed.toFixed(2)} yd/s (the app's roll); on the line ${centre.holed ? "HOLED" : `missed, passes ${centre.pass.toFixed(3)}`}`);
  // WSR's line against the app's at this speed: two putts the app's roll
  // passes 0.25 yd right and left of the cup, beyond the rim funnel's reach
  // (2.0 u = 0.219 yd, wsr-ground-phase.md 6), whose look-ahead closest
  // approach is the line's own: the shift (+ = WSR passes right of the app)
  const dR = await putt(power, v0, 0.25), dL = await putt(power, v0, -0.25);
  row.shift = { right: dR.pass - 0.25, left: 0.25 - dL.pass, mean: ((dR.pass - 0.25) + (0.25 - dL.pass)) / 2 };
  console.log(`  WSR's line against the app's: ${row.shift.right >= 0 ? "+" : ""}${row.shift.right.toFixed(4)} (right) / ${row.shift.left >= 0 ? "+" : ""}${row.shift.left.toFixed(4)} (left)`);
  if (centre.holed) {
    for (const [side, sgn] of [["right", 1], ["left", -1]]) {
      let lo = 0, hi = 0.2 * sgn, loP = centre, hiP = null;
      const putts = [];
      for (let k = 0; k < steps; k++) {
        const r = await putt(power, v0, (lo + hi) / 2);
        putts.push(r);
        if (r.holed) { lo = r.o; loP = r; } else { hi = r.o; hiP = r; }
      }
      row.sides[side] = { holedTo: Math.abs(lo), missedFrom: Math.abs(hi), holedPass: loP.pass, missedPass: hiP?.pass ?? null, putts };
      console.log(`  ${side}: holed to ${Math.abs(lo).toFixed(3)} (WSR's pass ${loP.pass.toFixed(3)}), missed from ${Math.abs(hi).toFixed(3)}${hiP ? ` (${hiP.pass.toFixed(3)})` : ""}`);
    }
  }
  results.edges.push(row); write();
}
await s.stop();
console.log(`wrote ${path.relative(process.cwd(), outFile)}`);
