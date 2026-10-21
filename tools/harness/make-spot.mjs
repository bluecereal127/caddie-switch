// A savestate at a spot on the course reached by real play: from a saved
// stroke (a tee), one shot planned with the port (lib/play.mjs planStroke)
// toward a target point given in map fractions, then the game's own walk to
// the next stroke, saved as SAVES/<out>. The ball is wherever the shot
// stopped (the port puts it within a few yards of the target on most lines);
// nothing is written to its position.
//   node tools/harness/make-spot.mjs --hole 19 --save h19-tee.sav --target 0.6,0.43 --out h19-corner.sav [--instance 0]
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { portsFor } from "./lib/dolphin.mjs";
import { YD, mapToMesh, meshToMap } from "./lib/course.mjs";
import { planStroke, waitStroke } from "./lib/play.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const hole = Number(arg("--hole", 19));
const save = arg("--save", `h${String(hole).padStart(2, "0")}-tee.sav`);
const [tx, ty] = arg("--target", "0.6,0.43").split(",").map(Number);
const out = arg("--out", `h${String(hole).padStart(2, "0")}-spot.sav`);
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));

const s = new Session({ gdbPort: portsFor(inst).gdb, dsuPort: portsFor(inst).dsu, log: (m) => console.log(m) });
await s.start(path.join(SAVES, save));
const st = await s.state();
const [TX, TZ] = mapToMesh(hole, tx, ty);
// calm, so the planned line is the flown one
const plan = await planStroke(hole, { ...st, wind: { ...st.wind, speedIdx: 0 }, pin: [TX, st.pin[1], TZ] });
const shot = await s.shoot({ power: plan.power, club: plan.club, heading: plan.heading, wind: { dir: 0, speedIdx: 0 }, trace: false, untilRest: "real", powerMode: "game" });
const r = shot.ball.pos;
console.log(`${plan.club} ${plan.power} toward (${tx}, ${ty}): rests ${(Math.hypot(r[0] - TX, r[2] - TZ) / YD).toFixed(1)} yd from the target, map (${meshToMap(hole, r[0], r[2]).map((v) => v.toFixed(4)).join(", ")})`);
await waitStroke(s, hole);
const st2 = await s.state();
console.log(`next stroke ready: lie ${st2.player.lie}, ${(Math.hypot(st2.pin[0] - r[0], st2.pin[2] - r[2]) / YD).toFixed(1)} yd from the pin`);
await s.saveState(out);
console.log(`saved ${out}`);
await s.stop();
