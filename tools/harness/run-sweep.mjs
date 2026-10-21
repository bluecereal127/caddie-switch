// Validation 2a: every club at launch powers 0.25 ... 1.0 from the tee of each
// hole along the game's own default line (the player start's facing, the
// aim player+0x84 at the tee), calm, no spin, the power held (so WSR's
// pin-power assist cannot act). For each shot: WSR's first ground contact
// (carry), apex and rest, read from the look-ahead's records on the real
// ball (tools/harness/lib/shot.mjs) and, for --verify-every shots, the real
// ball's own rest too; and the port (src/wsrsim.js) over the app's line
// (public/terrain), over the KCL triangles along the same line, and flat.
//   node tools/harness/run-sweep.mjs --holes 10,11 [--clubs driver,...] [--powers 0.25,0.5,0.75,1]
//        [--instance 0] [--verify-every 7] [--out results/sweep-h10.json]
import fs from "node:fs";
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { HARNESS, portsFor } from "./lib/dolphin.mjs";
import { YD, appProfile, kclProfile, simOf, kcl, groundAt, ATTR_LIE } from "./lib/course.mjs";
import { run } from "../lib/wsrsim.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const holes = arg("--holes", "10").split(",").map(Number);
const clubs = arg("--clubs", "driver,spoon,3iron,5iron,7iron,9iron,wedge").split(",");
const powers = arg("--powers", "0.25,0.5,0.75,1").split(",").map(Number);
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const verifyEvery = Number(arg("--verify-every", 7));
const outFile = path.join(HARNESS, arg("--out", `results/sweep-h${holes.join("-")}.json`));
// --only "club:q,..." runs just those shots, every one to the real rest
// (the re-check of rows a hazard or a big residual made doubtful)
const only = arg("--only", null)?.split(",").map((x) => { const [c, q] = x.split(":"); return `${c}:${Number(q)}`; });
const allReal = !!only || process.argv.includes("--real");

const s = new Session({ gdbPort: portsFor(inst).gdb, dsuPort: portsFor(inst).dsu });
const results = { kind: "sweep-2a", clubs, powers, holes: {} };
let n = 0;
for (const hole of holes) {
  const save = path.join(SAVES, `h${String(hole).padStart(2, "0")}-tee.sav`);
  if (!fs.existsSync(save)) { console.log(`hole ${hole}: no ${path.basename(save)}`); continue; }
  if (!s.gdb) await s.start(save); else { s.saveFile = save; s.start0 = null; await s.load(save, null).catch(() => {}); await s.waitLoaded(null); }
  const st = await s.state();
  const tee = st.ball.pos, [dx, dz] = st.player.aim;
  const along = (q) => ((q[0] - tee[0]) * dx + (q[2] - tee[2]) * dz) / YD;
  const across = (q) => ((q[0] - tee[0]) * -dz + (q[2] - tee[2]) * dx) / YD;
  const mesh = await kcl(hole);
  const app = await appProfile(hole, tee[0], tee[2], dx, dz);
  const kp = await kclProfile(hole, tee[0], tee[2], dx, dz);
  const H = { hole: st.hole, save: path.basename(save), tee, aim: [dx, dz], pin: st.pin, wind: st.wind, line: { pos: app.pos, bearing: app.bearing }, shots: [] };
  results.holes[hole] = H;
  for (const club of clubs) {
    for (const q of powers) {
      if (only && !only.includes(`${club}:${q}`)) continue;
      await s.load(save, { pos: tee });
      const verify = allReal || (verifyEvery > 0 && n % verifyEvery === 0);
      const t0 = Date.now();
      const shot = await s.shoot({ power: q, club, wind: { dir: 0, speedIdx: 0 }, trace: false, untilRest: verify ? "real" : "predicted" });
      const b = shot.ball;
      const g = mesh ? groundAt(mesh, b.rest[0], b.rest[2], { yMax: b.rest[1] + 1 }) : null;
      const row = {
        club, q, ms: Date.now() - t0,
        launch: { speed: Math.hypot(...shot.handoff.launchVel), angle: (Math.atan2(shot.handoff.launchVel[1], Math.hypot(shot.handoff.launchVel[0], shot.handoff.launchVel[2])) * 180) / Math.PI },
        wsr: {
          carry: along(b.land), carryAcross: across(b.land), landDy: (b.land[1] - tee[1]) / YD, landFrame: b.landFrame,
          stop: along(b.rest), stopAcross: across(b.rest), restDy: (b.rest[1] - tee[1]) / YD, restFrame: b.restFrame,
          apex: (b.apex[1] - tee[1]) / YD, restLie: g ? ATTR_LIE[g.attr] ?? g.attr : null, holed: b.holeFrame >= 0,
        },
      };
      if (verify) {
        row.realRestMatches = b.pos.every((v, i) => v === b.rest[i]);
        // the real ball's own rest (after any penalty placement)
        const gr = mesh ? groundAt(mesh, b.pos[0], b.pos[2], { yMax: b.pos[1] + 1 }) : null;
        row.wsr.realStop = along(b.pos); row.wsr.realStopAcross = across(b.pos); row.wsr.realLie = gr ? ATTR_LIE[gr.attr] ?? gr.attr : null;
      }
      row.wsr.hazard = shot.hazard ?? null;           // 1 water, 2 OB floor, 3 valley (ball+0xbc seen in flight)
      if (shot.placed) row.wsr.placed = { from: along(shot.placed.from), to: along(shot.placed.to) };
      row.wsr.restWater = b.restWater; row.wsr.restAttr = b.restAttr;
      const port = (prof) => { const o = run({ club, q, profile: prof ? simOf(prof) : null, trace: false }); return { carry: o.carry, stop: o.stop, apex: o.apex }; };
      row.portApp = port(app.prof);
      row.portKcl = kp ? port(kp) : null;
      row.portFlat = port(null);
      H.shots.push(row);
      n++;
      console.log(`h${hole} ${club} ${q}: WSR ${row.wsr.carry.toFixed(1)} / ${row.wsr.stop.toFixed(1)} | app ${row.portApp.carry.toFixed(1)} / ${row.portApp.stop.toFixed(1)} | kcl ${row.portKcl?.carry.toFixed(1)} / ${row.portKcl?.stop.toFixed(1)} | flat ${row.portFlat.carry.toFixed(1)} / ${row.portFlat.stop.toFixed(1)}${verify ? ` | real rest ${row.realRestMatches ? "=" : "!="} prediction` : ""} (${(row.ms / 1000).toFixed(1)} s)`);
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, JSON.stringify(results, (k, v) => (typeof v === "number" ? +v.toFixed(4) : v)));
    }
  }
}
await s.stop();
console.log(`wrote ${path.relative(process.cwd(), outFile)} (${n} shots)`);
