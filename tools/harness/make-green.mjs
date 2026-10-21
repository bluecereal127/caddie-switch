// A green state for the cup tests on any hole: from the hole's tee save
// (the round's own pin), strokes planned with lib/play.mjs (out of reach, the
// longest club at its cap along the game's line; in reach, the approach aimed
// --back yd short of the pin on the line from the ball; on the fringe, a putt
// to that point), calm, the power held, played for real until the ball rests
// on the green (lie 6), then saved as SAVES/hNN-green.sav. run-cup.mjs makes
// its par 3 greens itself; this is for the others (hole 20's pin 4 sits on an
// 8.1 degree slope, against hole 2's 3.95 and hole 11's 1.2).
//   node tools/harness/make-green.mjs --hole 20 [--back 4] [--instance 0]
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { YD } from "./lib/course.mjs";
import { planStroke, waitStroke } from "./lib/play.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const hole = Number(arg("--hole", 20));
const back = Number(arg("--back", 4));
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const hh = String(hole).padStart(2, "0");

const s = new Session({ instance: inst, log: (m) => console.log(m) });
await s.start(path.join(SAVES, `h${hh}-tee.sav`));
for (let k = 1; k <= 6; k++) {
  if (k > 1) { const w = await waitStroke(s, hole); if (w.moved) throw new Error("the hole ended before the ball rested on the green"); }
  const st = await s.state();
  const [bx, , bz] = st.ball.pos, [px, py, pz] = st.pin, d = Math.hypot(px - bx, pz - bz);
  if (st.player.lie === 6) {
    console.log(`on the green, ${(d / YD).toFixed(2)} yd from the cup`);
    console.log(`saved ${path.basename(await s.saveState(`h${hh}-green.sav`))}`);
    break;
  }
  // aim `back` yd short of the pin (never past the ball)
  const b = Math.min(back * YD, d * 0.5);
  const target = [px - ((px - bx) / d) * b, py, pz - ((pz - bz) / d) * b];
  const plan = await planStroke(hole, { ...st, wind: { ...st.wind, speedIdx: 0 }, pin: target });
  const shot = await s.shoot({ power: plan.power, club: plan.club, heading: plan.heading, wind: { dir: 0, speedIdx: 0 }, trace: false, untilRest: "real" });
  const r = shot.ball.pos;
  console.log(`stroke ${k}: ${plan.why}: ${plan.club} ${plan.power.toFixed(3)} -> ${(Math.hypot(r[0] - px, r[2] - pz) / YD).toFixed(1)} yd from the pin${shot.ball.holeFrame >= 0 ? " (HOLED: rerun with a larger --back)" : ""}`);
  if (shot.ball.holeFrame >= 0) break;
}
await s.stop();
