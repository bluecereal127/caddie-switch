// One traced shot with everything the harness can read, for diagnosing an
// odd sweep row: node tools/harness/diag-shot.mjs --save h01-tee.sav --club driver --q 0.25 [--instance 1]
import fs from "node:fs";
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { STATE } from "./lib/dolphin.mjs";
import { YD, kcl, groundAt, ATTR_LIE } from "./lib/course.mjs";
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const save = path.join(SAVES, arg("--save", "h01-tee.sav"));
const hole = Number(arg("--hole", path.basename(save).slice(1, 3)));
const s = new Session({ instance: inst });
await s.start(save);
const st = await s.state();
const tee = st.ball.pos, [dx, dz] = st.player.aim;
const shot = await s.shoot({ power: Number(arg("--q", 0.25)), club: arg("--club", "driver"), trace: true, wind: { dir: 0, speedIdx: 0 }, treeWatch: "all" });
console.log("tree contacts:", JSON.stringify((shot.treeContacts ?? []).slice(0, 6).map((c) => ({ life: c.life, code: c.code, along: +(((c.pos[0] - st.ball.pos[0]) * st.player.aim[0] + (c.pos[2] - st.ball.pos[2]) * st.player.aim[1]) / 9.144).toFixed(1), h: +((c.pos[1] - st.ball.pos[1]) / 9.144).toFixed(1) }))), (shot.treeContacts ?? []).length);
const mesh = await kcl(hole);
const along = (q) => ((q[0] - tee[0]) * dx + (q[2] - tee[2]) * dz) / YD;
const rows = shot.path;
// every 40 ticks plus contacts: along, height vs tee, ground under, attr
const out = [];
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (i % 40 && !(i > 0 && rows[i - 1][8] !== r[8]) && i !== rows.length - 1) continue;
  const g = groundAt(mesh, r[1], r[3], { yMax: r[2] + 2 });
  out.push(`${r[0]}: along ${along([r[1], r[2], r[3]]).toFixed(1)} h ${((r[2] - tee[1]) / YD).toFixed(1)} ground ${g ? ((g.y - tee[1]) / YD).toFixed(1) + " " + (ATTR_LIE[g.attr] ?? g.attr) : "none"} v ${Math.hypot(r[4], r[5], r[6]).toFixed(3)} attrMax ${r[7]} moving ${r[9]}`);
}
console.log(out.join("\n"));
console.log("records:", JSON.stringify({ land: shot.ball.land.map((v) => +v.toFixed(1)), rest: shot.ball.rest.map((v) => +v.toFixed(1)), landFrame: shot.ball.landFrame, restFrame: shot.ball.restFrame, restAttr: shot.ball.restAttr, restWater: shot.ball.restWater, water: shot.ball.water, drop: shot.ball.dropSpot.map((v) => +v.toFixed(1)), realPos: shot.ball.pos.map((v) => +v.toFixed(1)) }));
fs.writeFileSync(path.join(STATE, "raw", `diag-${path.basename(save, ".sav")}-${arg("--club", "driver")}-${arg("--q", 0.25)}.json`), JSON.stringify(shot));
await s.stop();
