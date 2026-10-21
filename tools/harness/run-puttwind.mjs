// Wind on putts. On the Switch the wind does not move a putt on the green
// (player-confirmed); from the fringe it was not known. WSR's wind acts only
// in the air (Calc 0x80414098-0x80414138), but the in-air test also counts
// the first 8 ticks of every shot, putts included (the port: lifetime < 8 ||
// attrMax == 0), when the wind's height ramp is at its 10 % floor, so the
// port gives a putt 0.02-0.04 yd of drift at 30 mph. Here WSR itself: from a
// green or fringe save, putts aimed --off deg left of the cup (so none comes
// near it) at each power, calm and then in 30 mph from the 8 directions and
// 10 mph from 2, each to its real rest; the rests compared bit for bit with
// the calm one, and the first --trace ticks of a calm and a 30 mph crosswind
// putt traced side by side.
//   node tools/harness/run-puttwind.mjs --hole 2 --save h02-green.sav [--powers 0.15,0.3,0.5] [--off 15] [--trace 40] [--instance 0]
import fs from "node:fs";
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { HARNESS } from "./lib/dolphin.mjs";
import { YD } from "./lib/course.mjs";
import { run } from "../lib/wsrsim.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const hole = Number(arg("--hole", 2));
const saveName = arg("--save", `h${String(hole).padStart(2, "0")}-green.sav`);
const powers = arg("--powers", "0.15,0.3,0.5").split(",").map(Number);
const off = (Number(arg("--off", 15)) * Math.PI) / 180;
const nTrace = Number(arg("--trace", 40));
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const spot = saveName.replace(/^h\d\d-|\.sav$/g, "");
const outFile = path.join(HARNESS, arg("--out", `results/puttwind-h${hole}-${spot}.json`));
const save = path.join(SAVES, saveName);
const WINDS = [...[0, 1, 2, 3, 4, 5, 6, 7].map((dir) => ({ dir, speedIdx: 15 })), { dir: 2, speedIdx: 5 }, { dir: 6, speedIdx: 5 }];

const s = new Session({ instance: inst });
await s.start(save);
const st = await s.state();
const B = st.ball.pos, PIN = st.pin;
const heading = Math.atan2(PIN[0] - B[0], PIN[2] - B[2]) + off;   // a larger heading turns left
const dx = Math.sin(heading), dz = Math.cos(heading);
const along = (q) => ((q[0] - B[0]) * dx + (q[2] - B[2]) * dz) / YD, across = (q) => ((q[0] - B[0]) * -dz + (q[2] - B[2]) * dx) / YD;
const expect0 = { pos: B, life: st.ball.life };
console.log(`hole ${hole} ${saveName}: lie ${st.player.lie}, ${(Math.hypot(PIN[0] - B[0], PIN[2] - B[2]) / YD).toFixed(2)} yd from the cup; putts aimed ${(off * 180 / Math.PI).toFixed(0)} deg left of it`);
const results = { kind: "puttwind", hole, save: saveName, lie: st.player.lie, ball: B, heading, putts: [], traces: [] };
const write = () => { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(results, (k, v) => (typeof v === "number" ? +v.toFixed(6) : v))); };
const putt = async (power, wind, trace = false) => {
  await s.load(save, expect0);
  return s.shoot({ power, club: "putter", heading, wind, trace, maxTicks: trace ? nTrace : 9000, untilRest: "real" });
};

for (const power of powers) {
  const calm = (await putt(power, { dir: 0, speedIdx: 0 })).ball.pos;
  const row = { power, calm: { rest: calm, along: along(calm), across: across(calm) }, winds: [] };
  for (const w of WINDS) {
    const r = (await putt(power, w)).ball.pos;
    // the wind relative to the putt: 0 = tail, 90 = toward the right (as the port's)
    const angle = w.dir * Math.PI / 4, wx = Math.sin(angle), wz = Math.cos(angle);
    const rel = (Math.atan2(wx * -dz + wz * dx, wx * dx + wz * dz) * 180) / Math.PI;
    const port = run({ club: "putter", q: power, surface: st.player.lie === 9 ? "fringe" : "green", wind: { mph: 2 * w.speedIdx, deg: rel }, trace: false });
    const port0 = run({ club: "putter", q: power, surface: st.player.lie === 9 ? "fringe" : "green", trace: false });
    row.winds.push({ ...w, mph: 2 * w.speedIdx, relDeg: rel, identical: r.every((v, i) => v === calm[i]), dAlong: along(r) - along(calm), dAcross: across(r) - across(calm),
      portAlong: port.stop - port0.stop, portAcross: port.lateral - port0.lateral });
    const x = row.winds[row.winds.length - 1];
    console.log(`power ${power}, ${x.mph} mph from dir ${w.dir} (${rel.toFixed(0)} deg rel): ${x.identical ? "bit-identical to calm" : `rest moved ${x.dAlong.toFixed(4)} along, ${x.dAcross.toFixed(4)} across`} | port ${x.portAlong.toFixed(4)} / ${x.portAcross.toFixed(4)}`);
  }
  results.putts.push(row); write();
}
// the first ticks, calm against a 30 mph wind from the putt's left
if (nTrace > 0) {
  const left = WINDS.slice(0, 8).map((w) => ({ w, rel: (Math.atan2(Math.sin(w.dir * Math.PI / 4) * -dz + Math.cos(w.dir * Math.PI / 4) * dx, Math.sin(w.dir * Math.PI / 4) * dx + Math.cos(w.dir * Math.PI / 4) * dz) * 180) / Math.PI }))
    .reduce((b, x) => (!b || Math.abs(x.rel - 90) < Math.abs(b.rel - 90) ? x : b), null);
  const a = await putt(powers[0], { dir: 0, speedIdx: 0 }, true), b = await putt(powers[0], left.w, true);
  const first = a.path.findIndex((r, i) => b.path[i] && r.slice(1, 7).some((v, k) => v !== b.path[i][1 + k]));
  results.traces.push({ power: powers[0], wind: left.w, relDeg: left.rel, ticks: Math.min(a.path.length, b.path.length), firstDifferentTick: first < 0 ? null : a.path[first][0],
    calm: a.path.slice(0, 12).map((r) => r.slice(0, 7)), windy: b.path.slice(0, 12).map((r) => r.slice(0, 7)) });
  console.log(`traced ${Math.min(a.path.length, b.path.length)} ticks, calm against ${2 * left.w.speedIdx} mph at ${left.rel.toFixed(0)} deg: ${first < 0 ? "identical on every tick" : `first different at lifetime ${a.path[first][0]}`}`);
  write();
}
await s.stop();
console.log(`wrote ${path.relative(process.cwd(), outFile)}`);
