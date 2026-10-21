// Validation 2f: backspin and the red zone, from one tee (calm).
//   A. backspin: irons and wedge at full and 3/4 power with the swing-side
//      backspin s7c in {0, 0.25, 0.5, 1}; the ball gets bs = s7c * P1c at the
//      hand-off (P1c 0.25 / 0.5 / 0.7 / 0.9 / 1.0, wsr-club-physics.md 3), and
//      the port flies run({ back: bs }) over the same KCL line.
//   B. the red zone on a full lie: the raw swing value fed past the 1.1 dead
//      band (game mode: the game computes p1, p2, p3, the power, the red
//      curve's size m at swing+0xc0 and its coin at swing+0xd8, and the hand-
//      off writes the side spin itself); against the decoded formulas
//      (swing-redzone-spin 3.1, 4.2: power stays 1, m = 0.2 + 0.8 min(1,
//      (raw - 1.1) / 0.2)) and the port flown with the game's own side spin.
//   C. the same from rough: the player's lie (player+0xb0, what the club code
//      reads) set to 2 before the shot: cap 0.75, the red real power up to
//      one more bar (power = 0.75 + 0.25 (raw - 1) / 0.3, m = 0.2 + 0.8
//      (raw - 1) / 0.3), and the rough's launch yaw (2 deg for a straight
//      swing, 4.1), measured from the launch velocity.
//   node tools/harness/run-spin.mjs [--save h10-tee-w10.sav] [--hole 10] [--parts A,B,C] [--instance 0]
import fs from "node:fs";
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { HARNESS, portsFor } from "./lib/dolphin.mjs";
import { YD, kclProfile, simOf } from "./lib/course.mjs";
import { PLAYER } from "./lib/wsr.mjs";
import { run, CLUBS } from "../lib/wsrsim.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const hole = Number(arg("--hole", 10));
const save = path.join(SAVES, arg("--save", "h10-tee-w10.sav"));
const parts = arg("--parts", "A,B,C").split(",");
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const outFile = path.join(HARNESS, arg("--out", `results/spin-h${hole}.json`));

const s = new Session({ gdbPort: portsFor(inst).gdb, dsuPort: portsFor(inst).dsu });
await s.start(save);
const st = await s.state();
const tee = st.ball.pos;
const results = { kind: "spin-2f", hole, save: path.basename(save), tee, A: [], B: [], C: [] };
const write = () => { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(results, (k, v) => (typeof v === "number" ? +v.toFixed(5) : v))); };
const calm = { dir: 0, speedIdx: 0 };

// the shot's own launch direction (the lie yaw included) and the port over it
async function portFor(shot, club, q, extra = {}) {
  const lv = shot.handoff.launchVel, m = Math.hypot(lv[0], lv[2]);
  const dx = lv[0] / m, dz = lv[2] / m;
  const kp = await kclProfile(hole, tee[0], tee[2], dx, dz);
  const o = run({ club, q, profile: kp ? simOf(kp) : null, spinStart: shot.handoff.spinStart, trace: true, ...extra });
  const p = o.path.find((r) => r[0] >= o.carry - 1e-9) ?? o.path[o.path.length - 1];
  return { carry: o.carry, stop: o.stop, lateral: o.lateral, carryLateral: p[2], dir: [dx, dz] };
}
function wsrOf(shot, dir) {
  const b = shot.ball, [dx, dz] = dir;
  const along = (q) => ((q[0] - tee[0]) * dx + (q[2] - tee[2]) * dz) / YD, across = (q) => ((q[0] - tee[0]) * -dz + (q[2] - tee[2]) * dx) / YD;
  return { carry: along(b.land), carryAcross: across(b.land), stop: along(b.pos), stopAcross: across(b.pos) };
}

if (parts.includes("A")) {
  for (const club of ["3iron", "7iron", "9iron", "wedge"]) {
    for (const q of [1, 0.75]) {
      for (const s7c of [0, 0.25, 0.5, 1]) {
        await s.load(save, { pos: tee });
        const back = s7c * CLUBS[club].spin;
        const shot = await s.shoot({ power: q, club, wind: calm, back, trace: false, untilRest: "real" });
        const port = await portFor(shot, club, q, { back });
        const row = { club, q, s7c, back, wsr: wsrOf(shot, port.dir), port };
        results.A.push(row); write();
        console.log(`A ${club} ${q} s7c ${s7c} (bs ${back}): WSR ${row.wsr.carry.toFixed(1)} / ${row.wsr.stop.toFixed(1)} | port ${port.carry.toFixed(1)} / ${port.stop.toFixed(1)}`);
      }
    }
  }
}
for (const [part, lie, raws] of [["B", null, [1.12, 1.15, 1.2, 1.25, 1.3]], ["C", 2, [0.9, 1.0, 1.05, 1.15, 1.3]]]) {
  if (!parts.includes(part)) continue;
  for (const club of ["driver", "7iron"]) {
    for (const raw of raws) {
      await s.load(save, { pos: tee });
      if (lie != null) await s.paused(async (gdb) => { const p = await (await import("./lib/wsr.mjs")).pointers(gdb); const b = Buffer.alloc(2); b.writeUInt16BE(lie); await gdb.writeMem(p.player + PLAYER.lie, b); });
      const shot = await s.shoot({ power: 1, raw, club, wind: calm, trace: false, untilRest: "real", powerMode: "game", keepGameSpin: true });
      const sw = shot.swingAtHandoff, h = shot.handoff;
      const port = await portFor(shot, club, sw.power, { side: h.gameSide });
      const yaw = (Math.atan2(h.launchVel[0], h.launchVel[2]) - Math.atan2(st.player.aim[0], st.player.aim[1])) * 180 / Math.PI;
      const capped = lie === 2;
      const expect = capped
        ? { power: raw <= 1 ? null : 0.75 + (0.25 * Math.min(raw - 1, 0.3)) / 0.3, m: raw > 1 ? 0.2 + 0.8 * Math.min(1, (raw - 1) / 0.3) : 0 }
        : { power: 1, m: raw > 1.1 ? 0.2 + 0.8 * Math.min(1, (raw - 1.1) / 0.2) : 0 };
      const row = { club, raw, lie: lie ?? "tee", game: { p1: sw.p1, p2: sw.p2, p3: sw.p3, power: sw.power, m: sw.m, coin: sw.coin, side: h.gameSide, back: h.gameBack, spinStart: h.spinStart, yawDeg: yaw }, expect, wsr: wsrOf(shot, port.dir), port };
      results[part].push(row); write();
      console.log(`${part} ${club} raw ${raw}: game power ${sw.power.toFixed(4)} (expect ${expect.power?.toFixed(4) ?? "curve"}) m ${sw.m.toFixed(3)} (${expect.m.toFixed(3)}) coin ${sw.coin} side ${h.gameSide.toFixed(4)} yaw ${yaw.toFixed(2)} deg | WSR ${row.wsr.carry.toFixed(1)} / ${row.wsr.stop.toFixed(1)} across ${row.wsr.carryAcross.toFixed(1)} / ${row.wsr.stopAcross.toFixed(1)} | port ${port.carry.toFixed(1)} / ${port.stop.toFixed(1)} across ${port.carryLateral.toFixed(1)} / ${port.lateral.toFixed(1)}`);
    }
  }
}
await s.stop();
console.log(`wrote ${path.relative(process.cwd(), outFile)}`);
