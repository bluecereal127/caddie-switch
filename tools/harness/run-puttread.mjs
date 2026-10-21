// The putt read in WSR itself: does the robust read (src/putt.js solvePutt:
// of the holing lines, the aim whose holing strengths span the widest range
// of putter power, at the middle of that range) forgive a mis-hit strength
// better than the read the app shipped before it (the softest putt that
// drops, src/putt.js at --base, 534a092)? From a green save, each read is
// putted at its own aim with the power moved by --steps (WSR putter power;
// x4 = gauge bars), held (no assist), calm, and WSR's verdict counted.
//   node tools/harness/run-puttread.mjs --hole 2 --save h02-green.sav [--steps -0.08,-0.06,...,0.08] [--base 534a092] [--instance 0]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { Session, SAVES } from "./lib/session.mjs";
import { HARNESS, STATE } from "./lib/dolphin.mjs";
import { ROOT } from "./lib/course.mjs";
import { P, greenModel } from "./lib/green.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const hole = Number(arg("--hole", 2));
const saveName = arg("--save", `h${String(hole).padStart(2, "0")}-green.sav`);
const steps = arg("--steps", "-0.08,-0.06,-0.04,-0.02,0,0.02,0.04,0.06,0.08").split(",").map(Number);
const base = arg("--base", "534a092");
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const spot = saveName.replace(/^h\d\d-|\.sav$/g, "");
const outFile = path.join(HARNESS, arg("--out", `results/puttread-h${hole}-${spot}.json`));
// the committed read: src/putt.js as it was at --base (git show only reads)
const basePath = path.join(STATE, `putt-${base}.mjs`);
if (!fs.existsSync(basePath)) fs.writeFileSync(basePath, execFileSync("git", ["-C", ROOT, "show", `${base}:src/putt.js`]));
const OLD = await import(pathToFileURL(basePath).href);

const s = new Session({ instance: inst });
await s.start(path.join(SAVES, saveName));
const st = await s.state();
const ball = st.ball.pos, pin = st.pin;
const g = greenModel(hole, ball, pin);
const E = Math.log2(1 / 0.63), YD_S = 240 / 9.144;
const powerOfV0 = (v) => { const u = v / YD_S; return u > 0.004 ? Math.pow((u - 0.004) / 0.406, 1 / E) : 0; };
const vD = P.vFlat(g.D);
// both reads over the same field (the app's mesh heights; puttField's
// interface is unchanged, and each solver runs its own simPutt and cup rule)
const reads = { robust: P.solvePutt(g.field, g.fBall, g.fCup), committed: OLD.solvePutt(g.field, g.fBall, g.fCup) };
console.log(`hole ${hole} ${saveName}: ${g.D.toFixed(2)} yd; robust aim ${reads.robust.a.toFixed(3)} deg power ${powerOfV0(reads.robust.p * vD).toFixed(4)} (holes ${reads.robust.power ? `${reads.robust.power.lo.toFixed(4)}-${reads.robust.power.hi.toFixed(4)}` : "-"} in the model); committed aim ${reads.committed.a.toFixed(3)} deg power ${powerOfV0(reads.committed.p * vD).toFixed(4)}`);
const results = { kind: "puttread", hole, save: saveName, ball, pin, distance: g.D, base, reads: {} };
const write = () => { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(results, (k, v) => (typeof v === "number" ? +v.toFixed(5) : v))); };
for (const [name, rd] of Object.entries(reads)) {
  const q0 = powerOfV0(rd.p * vD);
  const row = { aim: rd.a, power: q0, model: rd.power ?? null, putts: [] };
  results.reads[name] = row;
  for (const dq of steps) {
    const q = q0 + dq;
    // one retry from a fresh load: a halt can land on a moment the stub
    // cannot read the ball (E00), once in 108 putts on hole 20
    let shot;
    for (let attempt = 0; ; attempt++) {
      try {
        await s.load(path.join(SAVES, saveName), { pos: ball, life: st.ball.life });
        shot = await s.shoot({ power: q, club: "putter", heading: g.toPin - (rd.a * Math.PI) / 180, wind: { dir: 0, speedIdx: 0 }, trace: false, untilRest: "real" });
        break;
      } catch (e) {
        if (attempt >= 1) throw e;
        console.log(`  ${e.message}; retrying`);
      }
    }
    const holed = shot.ball.holeFrame >= 0;
    const app = P.simPutt(g.field, g.fBall, g.fCup, rd.a, P.wsrPuttV0(q) / vD, { trace: false }).holed;
    row.putts.push({ dq, q, holed, appHoled: app, rest: g.fromCup(shot.ball.pos) });
    write();
    console.log(`${name} ${dq >= 0 ? "+" : ""}${dq} (${(4 * dq).toFixed(2)} bars): WSR ${holed ? "HOLED" : `missed, ${g.fromCup(shot.ball.pos).toFixed(2)} yd from the cup`} | the model ${app ? "holed" : "missed"}`);
  }
}
await s.stop();
console.log(`wrote ${path.relative(process.cwd(), outFile)}`);
