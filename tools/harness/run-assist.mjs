// Validation 2e: WSR's hidden pin-power assist on partial swings
// (tools/research/wsr-swing-redzone-spin.md section 3.5), with and without
// backspin. From an approach spot reached by real play (make-spot.mjs), per
// club: the aim at the pin, calm, the aim table rebuilt (lib/assist.mjs) and
// saved; then partial swings at p2 = p_pin + d, p_pin = the table's pin power,
// in "game" mode (the raw value fed, the game's own p1, p2 and p3), with the
// state-1 window held open as a follow-through holds it (lib/shot.mjs
// holdWindow) and the backspin input s7c written on every window frame. The
// game's final launch power is checked against the decoded formula
// (lib/assist.mjs assistP3), and WSR's carry and rest against the port flown
// at the swung power p2 (what the app models: it has no assist) and at the
// game's final power. One control per club keeps the injected one-frame
// window (the shot fires on frame 1, before the assist can act).
//   node tools/harness/run-assist.mjs --hole 1 --save h01-approach.sav [--clubs 7iron,9iron,3iron]
//        [--offsets -0.28,-0.236,-0.15,-0.08,-0.03,0.03,0.08,0.15,0.236] [--spins 0,1] [--instance 0]
import fs from "node:fs";
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { HARNESS } from "./lib/dolphin.mjs";
import { YD, kclProfile, simOf } from "./lib/course.mjs";
import { pointers } from "./lib/wsr.mjs";
import { setAim, setClub, setWind } from "./lib/shot.mjs";
import { buildAimTable, readAimTable, assistP3 } from "./lib/assist.mjs";
import { run, CLUBS } from "../lib/wsrsim.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const hole = Number(arg("--hole", 1));
const hh = String(hole).padStart(2, "0");
const save = path.join(SAVES, arg("--save", `h${hh}-approach.sav`));
const clubs = arg("--clubs", "7iron,9iron,3iron").split(",");
const offsets = arg("--offsets", "-0.28,-0.236,-0.15,-0.08,-0.03,0.03,0.08,0.15,0.236").split(",").map(Number);
const spins = arg("--spins", "0,1").split(",").map(Number);
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const outFile = path.join(HARNESS, arg("--out", `results/assist-h${hole}.json`));
const calm = { dir: 0, speedIdx: 0 };
const r5 = (v) => +v.toFixed(5);

const s = new Session({ instance: inst });
await s.start(save);
const st0 = await s.state();
const B = st0.ball.pos, PIN = st0.pin;
const heading = Math.atan2(PIN[0] - B[0], PIN[2] - B[2]);
const dx = Math.sin(heading), dz = Math.cos(heading);
const D = Math.hypot(PIN[0] - B[0], PIN[2] - B[2]) / YD;
const kp = await kclProfile(hole, B[0], B[2], dx, dz);
const expect0 = { pos: B, life: st0.ball.life };
console.log(`hole ${hole}: ball ${D.toFixed(1)} yd from the pin, lie ${st0.player.lie}`);
const results = { kind: "assist-2e", hole, save: path.basename(save), ball: B, pin: PIN, distance: D, lie: st0.player.lie, tables: {}, shots: [] };
const write = () => { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(results, (k, v) => (typeof v === "number" ? +v.toFixed(5) : v))); };

const along = (q) => ((q[0] - B[0]) * dx + (q[2] - B[2]) * dz) / YD;
const across = (q) => ((q[0] - B[0]) * -dz + (q[2] - B[2]) * dx) / YD;
const port = (club, q, back, spinStart) => {
  const o = run({ club, q, back, profile: kp ? simOf(kp) : null, spinStart, trace: false });
  return { carry: o.carry, stop: o.stop };
};

for (const club of clubs) {
  await s.load(save, expect0);
  await s.paused(async (gdb) => { const p = await pointers(gdb); await setClub(gdb, p, club); await setAim(gdb, p, heading); await setWind(gdb, p, calm); });
  const table = await buildAimTable(s);
  const pPin = table.bestIdx / 256;
  // the smoothed table as yards to the pin every 8th power, for the report
  results.tables[club] = { pPin, bestYd: table.best / YD, ms: table.ms, smoothYd: table.smooth.filter((_, i) => i % 8 === 0).map((v) => +(v / YD).toFixed(2)) };
  console.log(`${club}: table built in ${(table.ms / 1000).toFixed(0)} s, pin power ${pPin.toFixed(4)} (index ${table.bestIdx}), best ${(table.best / YD).toFixed(1)} yd`);
  write();
  const tableSave = `assist-h${hh}-${club}.sav`;
  await s.saveState(tableSave);
  const P1c = CLUBS[club].spin;
  const plan = [{ d: -0.15, s7c: 0, hold: false }];
  for (const d of offsets) for (const s7c of spins) plan.push({ d, s7c, hold: true });
  for (const { d, s7c, hold } of plan) {
    const p2 = +(pPin + d).toFixed(4);
    if (p2 < 0.05 || p2 > 0.99) continue;
    await s.load(path.join(SAVES, tableSave), expect0);
    const t = await s.paused(async (gdb) => readAimTable(gdb, await pointers(gdb)));
    if (t.progress !== 257 || t.bestIdx !== table.bestIdx) throw new Error(`the reloaded table differs: ${JSON.stringify(t)}`);
    const back = s7c * P1c;
    const shot = await s.shoot({ power: p2, powerMode: "game", holdWindow: hold, s7c: hold ? s7c : undefined, back, side: 0, trace: false, untilRest: "real" });
    const sw = shot.swingAtHandoff, b = shot.ball;
    const pred = assistP3({ p2: sw.p2, pPin, best: table.best, cap: 1, spin: back });
    const row = {
      club, d, p2: sw.p2, s7c, back, hold,
      game: { p3: sw.p3, power: sw.power, s7c: sw.s7c, frames: shot.state1Frames, spinStart: shot.handoff.spinStart, gameBack: shot.handoff.gameBack,
        p3ByFrame: (shot.window ?? []).map((w) => r5(w.p3 ?? NaN)) },
      formula: { f29: pred.f29, p3: hold ? pred.p3 : sw.p2, w: pred.w },
      wsr: { carry: along(b.land), carryAcross: across(b.land), stop: along(b.pos), stopAcross: across(b.pos), toPin: Math.hypot(b.pos[0] - PIN[0], b.pos[2] - PIN[2]) / YD, hazard: shot.hazard },
      portSwung: port(club, sw.p2, back, shot.handoff.spinStart),
      portFinal: port(club, sw.power, back, shot.handoff.spinStart),
    };
    results.shots.push(row); write();
    console.log(`${club} p2 ${sw.p2.toFixed(4)} (d ${d >= 0 ? "+" : ""}${d}) s7c ${s7c}${hold ? "" : " one-frame window"}: game power ${sw.power.toFixed(4)} (formula ${row.formula.p3.toFixed(4)}) in ${shot.state1Frames} frames, spin at tick ${shot.handoff.spinStart} | WSR ${row.wsr.carry.toFixed(1)} / ${row.wsr.stop.toFixed(1)} (${row.wsr.toPin.toFixed(1)} yd from the pin) | port at p2 ${row.portSwung.carry.toFixed(1)} / ${row.portSwung.stop.toFixed(1)}, at the game's power ${row.portFinal.carry.toFixed(1)} / ${row.portFinal.stop.toFixed(1)}`);
  }
}
await s.stop();
console.log(`wrote ${path.relative(process.cwd(), outFile)}`);
