// Validation 2b: wind. From one tee along the game's default line, clubs at
// full power in WSR winds of several speeds and all 8 directions (the
// harness writes the hole's wind object: +8 the angle dir * pi/4, dir 0 =
// the air moving +z / south, 2 = +x / east; +0x10 the speed index, 2 mph
// each): carry, rest and sideways drift against the port (src/wsrsim.js
// with its decoded wind: 15 (idx/15)^0.737 with the altitude ramp, crosswind
// at full weight, head/tail at 0.6, in the air only), over the app's line,
// the KCL line and flat.
// --powers adds part-power swings (the drift's dependence on air time; the
// app's model has it linear in bars, src/model.js sidedrift = c mph bars);
// a speed index of 0 runs once, the calm reference.
//   node tools/harness/run-wind.mjs [--hole 10] [--save h10-tee.sav] [--clubs driver,3iron,7iron,wedge]
//        [--speeds 1,3,5,10,15] [--dirs 0,1,2,3,4,5,6,7] [--powers 1] [--instance 0]
import fs from "node:fs";
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { HARNESS } from "./lib/dolphin.mjs";
import { YD, appProfile, kclProfile, simOf } from "./lib/course.mjs";
import { run } from "../lib/wsrsim.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const hole = Number(arg("--hole", 10));
const save = path.join(SAVES, arg("--save", `h${String(hole).padStart(2, "0")}-tee.sav`));
const clubs = arg("--clubs", "driver,3iron,7iron,wedge").split(",");
const speeds = arg("--speeds", "1,3,5,10,15").split(",").map(Number);
const dirs = arg("--dirs", "0,1,2,3,4,5,6,7").split(",").map(Number);
const powers = arg("--powers", "1").split(",").map(Number);
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const outFile = path.join(HARNESS, arg("--out", `results/wind-h${hole}.json`));

const s = new Session({ instance: inst });
await s.start(save);
const st = await s.state();
const tee = st.ball.pos, [dx, dz] = st.player.aim;
const along = (q) => ((q[0] - tee[0]) * dx + (q[2] - tee[2]) * dz) / YD;
const across = (q) => ((q[0] - tee[0]) * -dz + (q[2] - tee[2]) * dx) / YD;
const app = await appProfile(hole, tee[0], tee[2], dx, dz);
const kp = await kclProfile(hole, tee[0], tee[2], dx, dz);
// the WSR wind relative to the shot, for the port: deg 0 = tail, 90 = toward the right
const relDeg = (dir) => { const a = (dir * Math.PI) / 4, wx = Math.sin(a), wz = Math.cos(a); return (Math.atan2(wx * -dz + wz * dx, wx * dx + wz * dz) * 180) / Math.PI; };
const results = { kind: "wind-2b", hole, save: path.basename(save), tee, aim: [dx, dz], line: { pos: app.pos, bearing: app.bearing }, shots: [] };
for (const club of clubs) for (const q of powers) {
  for (const speedIdx of speeds) {
    for (const dir of speedIdx === 0 ? [0] : dirs) {
      await s.load(save, { pos: tee });
      const t0 = Date.now();
      const shot = await s.shoot({ power: q, club, wind: { dir, speedIdx }, trace: false, untilRest: "predicted" });
      const b = shot.ball;
      const wind = { mph: 2 * speedIdx, deg: relDeg(dir) };
      // the port's sideways drift at the carry (its path's z at the first contact) and at rest
      const port = (prof) => { const o = run({ club, q, profile: prof ? simOf(prof) : null, wind, trace: true }); const p = o.path.find((r) => r[0] >= o.carry - 1e-9) ?? o.path[o.path.length - 1]; return { carry: o.carry, stop: o.stop, lateral: o.lateral, carryLateral: p[2], apex: o.apex }; };
      const row = {
        club, q, speedIdx, dir, relDeg: wind.deg, ms: Date.now() - t0, airTicks: b.landFrame >= 0 ? 4 * b.landFrame : null,
        wsr: { carry: along(b.land), carryAcross: across(b.land), stop: along(b.rest), stopAcross: across(b.rest), apex: (b.apex[1] - tee[1]) / YD },
        portApp: port(app.prof), portKcl: kp ? port(kp) : null, portFlat: port(null),
      };
      results.shots.push(row);
      console.log(`${club} ${q} idx ${speedIdx} dir ${dir} (${wind.deg.toFixed(0)} deg): WSR ${row.wsr.carry.toFixed(1)} / ${row.wsr.stop.toFixed(1)} across at carry ${row.wsr.carryAcross.toFixed(2)}, at rest ${row.wsr.stopAcross.toFixed(2)} | kcl ${row.portKcl?.carry.toFixed(1)} / ${row.portKcl?.stop.toFixed(1)} across at carry ${row.portKcl?.carryLateral.toFixed(2)}, at rest ${row.portKcl?.lateral.toFixed(2)} (${(row.ms / 1000).toFixed(1)} s)`);
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, JSON.stringify(results, (k, v) => (typeof v === "number" ? +v.toFixed(4) : v)));
    }
  }
}
await s.stop();
console.log(`wrote ${path.relative(process.cwd(), outFile)} (${results.shots.length} shots)`);
