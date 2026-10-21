// Item 3 (optional): a whole-hole plan and how forgiving it is. From each
// hole's tee state (the round's own pin and wind), the strokes lib/play.mjs
// plans (the port over the KCL toward the pin; out of reach, the longest club
// at its cap along the game's line; putts until the ball drops) are played
// for real. At each of the first --strokes strokes the same shot is also
// flown from the same state with the power moved by +-0.05 bar (+-0.0125 of
// full power) and the aim by +-0.3 and +-1.1 deg (a 5- and a 10-frame D-pad
// tap: WSR's turn accelerates, tools/research/wsr-harness-decodes.md section
// 1, so it has no fixed aim tick), each to its real rest, and the rests'
// distances to the pin are tabulated. Tables only: nothing in the app reads
// them.
//   node tools/harness/run-plan.mjs --holes 1,7,10 [--strokes 2] [--instance 0]
import fs from "node:fs";
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { HARNESS } from "./lib/dolphin.mjs";
import { YD } from "./lib/course.mjs";
import { planStroke, waitStroke } from "./lib/play.mjs";
import { ATTR } from "./lib/wsr.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const holes = arg("--holes", "1").split(",").map(Number);
const nPert = Number(arg("--strokes", 2));
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const outFile = path.join(HARNESS, arg("--out", `results/plan-h${holes.join("-")}.json`));
const BAR = 0.0125, TAP5 = (0.3 * Math.PI) / 180, TAP10 = (1.1 * Math.PI) / 180;
// heading: a larger heading turns the aim left (aim = (sin h, cos h), x east, z south)
const VARIANTS = [
  { name: "+0.05 bar", dp: BAR, dh: 0 }, { name: "-0.05 bar", dp: -BAR, dh: 0 },
  { name: "0.3 deg right", dp: 0, dh: -TAP5 }, { name: "0.3 deg left", dp: 0, dh: TAP5 },
  { name: "1.1 deg right", dp: 0, dh: -TAP10 }, { name: "1.1 deg left", dp: 0, dh: TAP10 },
];

const results = { kind: "plan-3", holes: {} };
const write = () => { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(results, (k, v) => (typeof v === "number" ? +v.toFixed(4) : v))); };
const outcome = (shot, pin) => {
  const b = shot.ball;
  return { rest: b.pos, toPin: b.holeFrame >= 0 ? 0 : Math.hypot(b.pos[0] - pin[0], b.pos[2] - pin[2]) / YD, holed: b.holeFrame >= 0,
    hazard: shot.hazard || 0, placed: !!shot.placed, restLie: ATTR[b.restAttr] ?? b.restAttr };
};

for (const hole of holes) {
  const hh = String(hole).padStart(2, "0");
  const s = new Session({ instance: inst, log: (m) => console.log(m) });
  await s.start(path.join(SAVES, `h${hh}-tee.sav`));
  const H = { strokes: [] };
  results.holes[hole] = H;
  for (let k = 1; k <= 12; k++) {
    if (k > 1) {
      const w = await waitStroke(s, hole);
      if (w.moved) break;
    }
    const st = await s.state();
    const plan = await planStroke(hole, st);
    const row = { k, plan: { club: plan.club, power: plan.power, heading: plan.heading, why: plan.why }, from: st.ball.pos, lie: ATTR[st.player.lie] ?? st.player.lie, toPinBefore: Math.hypot(st.ball.pos[0] - st.pin[0], st.ball.pos[2] - st.pin[2]) / YD, variants: [] };
    const shootPlan = (dp, dh) => s.shoot({ power: Math.max(0.02, plan.power + dp), club: plan.club, heading: plan.heading + dh, trace: false, untilRest: "real" });
    if (k <= nPert) {
      const save = `plan-h${hh}-s${k}.sav`;
      await s.saveState(save);
      const expect = { pos: st.ball.pos, life: st.ball.life };
      for (const v of VARIANTS) {
        await s.load(path.join(SAVES, save), expect);
        const o = outcome(await shootPlan(v.dp, v.dh), st.pin);
        row.variants.push({ ...v, ...o });
        console.log(`hole ${hole} stroke ${k} ${plan.club} ${plan.power.toFixed(3)} ${v.name}: ${o.holed ? "HOLED" : `${o.toPin.toFixed(1)} yd from the pin`}${o.hazard ? ` (hazard ${o.hazard})` : ""}, ${o.restLie}`);
      }
      await s.load(path.join(SAVES, save), expect);
    }
    const base = outcome(await shootPlan(0, 0), st.pin);
    row.base = base;
    H.strokes.push(row); write();
    console.log(`hole ${hole} stroke ${k}: ${plan.why}: ${plan.club} ${plan.power.toFixed(3)} -> ${base.holed ? "HOLED" : `${base.toPin.toFixed(1)} yd from the pin, ${base.restLie}`}`);
    if (base.holed) break;
  }
  H.strokesToHole = H.strokes.length;
  write();
  await s.stop();
}
console.log(`wrote ${path.relative(process.cwd(), outFile)}`);
