// Savestates at the tee of every hole, made by the harness itself from the
// course-select menu state the one-time walk saved (saves/menu-course.sav):
// for each 3-hole course, point at its tile, press A, then walk the screens
// (safety notice, hole card, "Shot 1", "hold the Wii Remote and press A and
// B", the swing tutorial's "Quit Practice" on minus) until memory says the
// player is ready at the tee: playerManager+0x674 and +0x675 set (the shot
// setup, ground-phase 7), the tutorial flag playerManager+0x8a8 clear, the
// real ball at rest with lifetime 0, GlfConfig's hole the course's first.
// Then the next holes of the course: the hole is played out for real
// (lib/play.mjs: approach shots and putts chosen with the port, the ball
// holed by the game's own physics) and the walk repeats to the next tee.
//   node tools/harness/make-states.mjs [--courses "Resort A,Classic B"] [--holes-per-course 3]
import fs from "node:fs";
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { stateSlotPath, HOTKEY_MAP, portsFor } from "./lib/dolphin.mjs";
import { pointers, readBall, PTR } from "./lib/wsr.mjs";
import { sleep } from "./lib/dsu.mjs";
import { playHole } from "./lib/play.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
// course tiles on the select screen, as DSU left-stick positions (measured
// on the 834x456 screenshots: x = (px - 418) / 560, y = (190 - py) / 232)
const COURSES = {
  "Resort A": { tile: [-0.264, 0.237], first: 1 }, "Resort B": { tile: [-0.264, -0.099], first: 4 },
  "Resort C": { tile: [-0.264, -0.444], first: 7 }, "Classic A": { tile: [0.254, 0.237], first: 10 },
  "Classic B": { tile: [0.254, -0.099], first: 13 }, "Classic C": { tile: [0.254, -0.444], first: 16 },
  // The Special course's tile is locked on a new save (it opens after 10
  // golf rounds, a system-wide count in the save). Without editing the save:
  // choose Resort A, and when the golf scene's setup reads the course
  // selection (0x80406954 lwz r31,0x1c(r3), r3 = Sp2::StaticMem [0x806f4e98];
  // fresh rounds only) make it 6, Special: mode 18, holes 19-21, its own
  // wind draw (decoded 2026-10-21, tables 0x806d4e54 / 0x806d4e2c).
  Special: { tile: [-0.264, 0.237], first: 19, special: true },
};
const SETUP_READS_SEL = 0x80406954;
const want = (arg("--courses", null) || Object.keys(COURSES).join(",")).split(",").map((s) => s.trim());
// --from <save> --first <hole>: continue a course from a saved tee instead
// of the menu (the state's own round: its wind and pins carry on)
const fromSave = arg("--from", null), fromHole = Number(arg("--first", 0));
const perCourse = Number(arg("--holes-per-course", 3));
const hk = (name) => Object.entries(HOTKEY_MAP).find(([k]) => k.endsWith(name))[1];

const s = new Session({ gdbPort: Number(arg("--gdb", portsFor().gdb)), dsuPort: Number(arg("--dsu", portsFor().dsu)), log: (m) => console.log(m) });
if (fromSave) await s.start(path.join(SAVES, fromSave));
else await s.start(path.join(SAVES, "menu-course.sav"), { waitBall: false });
let firstCourse = true;

async function readyAt() {
  return s.paused(async (gdb) => {
    try {
      const pm = await gdb.u32(PTR.playerManager), cfg = await gdb.u32(PTR.glfConfig);
      if (!pm || !cfg || pm < 0x80000000 || cfg < 0x80000000) return null;
      const f = await gdb.readMem(pm + 0x674, 2), tut = (await gdb.readMem(pm + 0x8a8, 1))[0];
      const hole = (await gdb.readMem(cfg + 0xc, 4)).readInt32BE(0) + 1;
      const p = await pointers(gdb);
      const b = await readBall(gdb, p.ball);
      return { hole, ready: f[0] === 1 && f[1] === 1 && !tut && b.life === 0 && !b.moving, tut, f674: f[0], f675: f[1] };
    } catch { return null; }
  });
}

// walk the screens to the tee of `hole`
async function walkTo(hole, maxSteps = 60) {
  for (let i = 0; i < maxSteps; i++) {
    const r = await readyAt();
    if (r?.ready && r.hole === hole) { await sleep(1500); const r2 = await readyAt(); if (r2?.ready && r2.hole === hole) return true; }
    // A+B works for every dialog and the "press A and B" calibration; minus
    // quits the tutorial and does nothing at the dialogs
    s.dsu.setButtons(0, ["Cross", "Circle"], true); await sleep(300); s.dsu.setButtons(0, ["Cross", "Circle"], false);
    await sleep(1800);
    if (r?.tut) { await s.dsu.tap(0, "L1", 250); await sleep(1500); }
  }
  return false;
}

async function saveAs(name) {
  const slot = stateSlotPath(3);
  const before = fs.existsSync(slot) ? fs.statSync(slot).mtimeMs : 0;
  for (let a = 0; a < 4; a++) {
    await s.dsu.tap(1, hk("Save State Slot 3"), 200);
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      if (fs.existsSync(slot) && fs.statSync(slot).mtimeMs > before) { await sleep(800); fs.copyFileSync(slot, path.join(SAVES, name)); return; }
    }
  }
  throw new Error(`save ${name} failed`);
}

const made = [], played = [];
for (const name of (fromSave ? ["(from save)"] : want)) {
  const c = fromSave ? { first: fromHole, tile: null } : COURSES[name];
  if (fromSave) {
    // already at the tee of fromHole: play it out and go on
    for (let hole = fromHole; hole < fromHole + perCourse - 1; hole++) {
      const res = await playHole(s, hole, { log: (m) => console.log(m) });
      console.log(`hole ${hole}: holed in ${res.strokes.length}`);
      played.push({ hole, strokes: res.strokes });
      if (!(await walkTo(hole + 1))) { console.log(`did not reach hole ${hole + 1}'s tee`); break; }
      const st = await s.state();
      const file = `h${String(hole + 1).padStart(2, "0")}-tee.sav`;
      await saveAs(file);
      made.push({ hole: hole + 1, file, wind: st.wind, pin: st.pin, tee: st.ball.pos, aim: st.player.aim });
      console.log(`hole ${hole + 1}: saved ${file} (wind dir ${st.wind.dir} idx ${st.wind.speedIdx}, pin ${st.pin.map((v) => v.toFixed(1))})`);
    }
    break;
  }
  // the session booted into the menu; for later courses load it again (a
  // menu state has no ball to check, so the load is given time instead)
  if (!firstCourse) {
    fs.copyFileSync(path.join(SAVES, "menu-course.sav"), stateSlotPath(4));
    await s.dsu.tap(1, hk("Load State Slot 4"), 200);
    await sleep(6000);
  }
  firstCourse = false;
  await sleep(1500);
  s.dsu.setStick(0, "left", ...c.tile);
  await sleep(600);
  if (c.special) { await s.gdb.haltSafe(); await s.gdb.addBreak(SETUP_READS_SEL); await s.gdb.go(); }
  await s.dsu.tap(0, "Cross", 250);
  if (c.special) {
    const { GdbTimeout } = await import("./lib/gdb.mjs");
    let hit = false;
    for (let i = 0; i < 80 && !hit; i++) {
      try {
        const st = await s.gdb.waitStop(3000);
        if (st.pc === SETUP_READS_SEL) {
          const sm = await s.gdb.u32(0x806f4e98);
          await s.gdb.setU32(sm + 0x1c, 6);
          hit = true;
        } else await s.gdb.go();
      } catch (e) {
        if (!(e instanceof GdbTimeout)) throw e;
        await s.gdb.go();
        await s.dsu.tap(0, "Cross", 200);   // any dialog before the scene loads
      }
    }
    await s.gdb.removeBreak(SETUP_READS_SEL);
    await s.gdb.go();
    if (!hit) { console.log("Special: the setup never read the course selection"); continue; }
    console.log("Special: course selection set to 6 at the golf scene's setup");
  }
  await sleep(4000);
  for (let k = 0; k < perCourse; k++) {
    const hole = c.first + k;
    const ok = await walkTo(hole);
    if (!ok) { console.log(`${name}: did not reach hole ${hole}'s tee`); break; }
    const st = await s.state();
    const file = `h${String(hole).padStart(2, "0")}-tee.sav`;
    await saveAs(file);
    made.push({ hole, file, wind: st.wind, pin: st.pin, tee: st.ball.pos, aim: st.player.aim });
    console.log(`hole ${hole}: saved ${file} (wind dir ${st.wind.dir} idx ${st.wind.speedIdx}, pin ${st.pin.map((v) => v.toFixed(1))})`);
    if (k + 1 >= perCourse) break;
    // play the hole out for real (lib/play.mjs): strokes chosen with the
    // port over the KCL, putts until the ball drops; no position is written
    const res = await playHole(s, hole, { log: (m) => console.log(m) });
    console.log(`hole ${hole}: holed in ${res.strokes.length}`);
    played.push({ hole, strokes: res.strokes });
  }
}
fs.writeFileSync(path.join(SAVES, "index.json"), JSON.stringify({ ...(fs.existsSync(path.join(SAVES, "index.json")) ? JSON.parse(fs.readFileSync(path.join(SAVES, "index.json"), "utf8")) : {}), ...Object.fromEntries(made.map((m) => [m.hole, m])) }, null, 1));
fs.writeFileSync(path.join(SAVES, `played-${fromSave ? `from-h${fromHole}` : want.join("-").replace(/\s+/g, "")}.json`), JSON.stringify(played, null, 1));
await s.stop();
