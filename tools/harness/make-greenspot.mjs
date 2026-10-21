// Spots around a cup (or on the fringe) reached by real putts from a green
// save, for the cup tests: does the capture window depend on the slope at the
// cup and the side it is approached from, or on the speed alone? Each spot
// is `--dist` yd from the cup: "high" (up the fall line of the KCL triangle
// under the pin: the putt from it runs straight down the slope), "low" (down
// the fall line: an uphill putt), "far" (past the cup along the save's own
// line: across the slope the other way); "fringe" is the nearest fringe band
// along a line clear of the cup, its middle. A spot on the green is putted to
// with the app's 2D roll over the mesh green heights (lib/green.mjs puttTo,
// which stops within ~0.05 yd of WSR's on these greens, run-cup.mjs), its
// path kept 0.35 yd or more from the cup (the target slides sideways in 0.25
// yd steps until it is); the fringe, whose friction the app's green roll does
// not have (A = 0.3 against the green's 0.15), with the port over the KCL
// line. The power is held (no pin assist), and the state is saved as
// SAVES/hNN-<spot>.sav once the next stroke is ready.
//   node tools/harness/make-greenspot.mjs --hole 2 [--spots high,low,far,fringe] [--dist 3.7] [--instance 0]
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { YD, kcl, groundAt, kclProfile, simOf } from "./lib/course.mjs";
import { waitStroke } from "./lib/play.mjs";
import { greenModel } from "./lib/green.mjs";
import { run } from "../lib/wsrsim.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const hole = Number(arg("--hole", 2));
const hh = String(hole).padStart(2, "0");
const spots = arg("--spots", "high,low,far,fringe").split(",");
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const greenSave = path.join(SAVES, `h${hh}-green.sav`);

const s = new Session({ instance: inst, log: (m) => console.log(m) });
await s.start(greenSave);
const st0 = await s.state();
const B = st0.ball.pos, PIN = st0.pin;
const g = greenModel(hole, B, PIN);
const m = await kcl(hole);
const cupTri = groundAt(m, PIN[0], PIN[2]);
const hx = cupTri.n[0] / Math.hypot(cupTri.n[0], cupTri.n[2]), hz = cupTri.n[2] / Math.hypot(cupTri.n[0], cupTri.n[2]);   // downhill
const D = Number(arg("--dist", g.D.toFixed(2)));
console.log(`hole ${hole}: ball ${g.D.toFixed(2)} yd from the cup; the cup's triangle tilts ${(Math.atan2(Math.hypot(cupTri.n[0], cupTri.n[2]), cupTri.n[1]) * 180 / Math.PI).toFixed(2)} deg`);
const expect0 = { pos: B, life: st0.ball.life };
const dirOf = (name) => name === "high" ? [-hx, -hz] : name === "low" ? [hx, hz] : [Math.sin(g.toPin), Math.cos(g.toPin)];

for (const name of spots) {
  await s.load(greenSave, expect0);
  let plan;
  if (name === "fringe") {
    // the nearest fringe band (attr 9) along a line from the ball that keeps
    // 1 yd from the cup: its entry and exit along the KCL line, the middle
    let best = null;
    for (let a = 0; a < 360; a += 5) {
      const h = (a * Math.PI) / 180, dx = Math.sin(h), dz = Math.cos(h);
      const pass = Math.abs((PIN[0] - B[0]) * -dz + (PIN[2] - B[2]) * dx) / YD, ahead = ((PIN[0] - B[0]) * dx + (PIN[2] - B[2]) * dz) / YD;
      if (ahead > 0 && pass < 1) continue;
      let i0 = null, i1 = null;
      for (let yd = 0.5; yd < 25; yd += 0.1) {
        const q = groundAt(m, B[0] + dx * yd * YD, B[2] + dz * yd * YD);
        if (q?.attr === 9 && i0 == null) i0 = yd;
        if (i0 != null && q?.attr !== 9) { i1 = yd; break; }
        if (q && q.attr !== 6 && q.attr !== 9 && i0 == null) break;   // off the green elsewhere first
      }
      if (i0 != null && i1 != null && i1 - i0 > 0.6 && (!best || i0 < best.i0)) best = { h, dx, dz, i0, i1 };
    }
    if (!best) throw new Error("no fringe band within 25 yd on a line clear of the cup");
    const target = (best.i0 + best.i1) / 2;
    const prof = await kclProfile(hole, B[0], B[2], best.dx, best.dz, { step: 0.1 });
    let lo = 0.02, hi = 2.5;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (run({ club: "putter", q: mid, profile: simOf(prof), trace: false }).stop < target) lo = mid; else hi = mid; }
    plan = { heading: best.h, power: (lo + hi) / 2, why: `the fringe band ${best.i0.toFixed(1)}-${best.i1.toFixed(1)} yd out at bearing ${(best.h * 180 / Math.PI).toFixed(0)} deg (mesh), stop at ${target.toFixed(1)}` };
  } else {
    const [ux, uz] = dirOf(name);
    let tgt = null;
    for (const slide of [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1, 1.25, -1.25, 1.5, -1.5]) {
      const TX = PIN[0] + (ux * D + -uz * slide) * YD, TZ = PIN[2] + (uz * D + ux * slide) * YD;
      const p = g.puttTo(TX, TZ);
      if (p.pass >= 0.35 && p.miss < 0.2) { tgt = { TX, TZ, p, slide }; break; }
    }
    if (!tgt) throw new Error(`${name}: no clear putt to a spot ${D} yd from the cup`);
    plan = { heading: g.toPin - (tgt.p.angDeg * Math.PI) / 180, power: tgt.p.power, why: `${D} yd ${name} of the cup (slid ${tgt.slide} yd), the app's roll passes the cup at ${tgt.p.pass.toFixed(2)} yd and stops ${tgt.p.miss.toFixed(3)} yd from the spot` };
  }
  console.log(`${name}: ${plan.why}; putt ${plan.power.toFixed(4)}`);
  const shot = await s.shoot({ power: plan.power, club: "putter", heading: plan.heading, trace: false, untilRest: "real" });
  const b = shot.ball;
  if (b.holeFrame >= 0) { console.log(`${name}: holed; skipped`); continue; }
  await waitStroke(s, hole);
  const st = await s.state();
  const lieOk = name === "fringe" ? st.player.lie === 9 : st.player.lie === 6;
  console.log(`${name}: rests ${(Math.hypot(b.pos[0] - PIN[0], b.pos[2] - PIN[2]) / YD).toFixed(2)} yd from the cup, lie ${st.player.lie}${lieOk ? "" : " (not the lie wanted; not saved)"}`);
  if (lieOk) console.log(`saved ${path.basename(await s.saveState(`h${hh}-${name}.sav`))}`);
}
await s.stop();
