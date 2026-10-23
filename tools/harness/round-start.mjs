// From the "Number of Holes" screen (a driver booted on saves/menu-holes.sav)
// to hole 1's tee of a natural 18-hole round, through the game's own menus:
// Eighteen Holes, then A / A+B through the safety notice, the hole card and
// "Shot 1", and minus to quit the swing tutorial, until the game says the
// player stands ready at hole 1's tee (playerManager+0x674 / +0x675 set, the
// tutorial flag +0x8a8 clear, the ball at rest with lifetime 0), as
// make-states.mjs walks to a tee. Only button presses and the pointer.
// With --course (a driver booted on saves/menu-course.sav, "Select Course"):
// that 3-hole course's tile instead, to its first hole's tee.
// With --pin SLOT (and --course): the first hole's pin forced to that WSR slot
// (the user's permission to set the pins, 2026-10-22): the tile's A pressed
// with lib/pins.mjs's force armed (as make-pinstates.mjs's menu route), the
// hole start stopped after choosePin and the slot written over its draw, all
// in one eval (the driver clears the breakpoints after each).
//   node tools/harness/round-start.mjs --port 8815 [--course "Classic A"] [--pin 3]
import http from "node:http";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const port = Number(arg("--port", 8815));
const post = (op, args = []) => new Promise((resolve, reject) => {
  const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/" }, (res) => { let t = ""; res.on("data", (d) => (t += d)); res.on("end", () => resolve(t)); });
  req.on("error", reject); req.end(JSON.stringify({ op, args }));
});
const READY = `try {
  const pm = await gdb.u32(0x806f5468), cfg = await gdb.u32(0x806f5498);
  if (!pm || !cfg || pm < 0x80000000 || cfg < 0x80000000) return JSON.stringify({ menu: true });
  const f = await gdb.readMem(pm + 0x674, 2), tut = (await gdb.readMem(pm + 0x8a8, 1))[0];
  const hole = (await gdb.readMem(cfg + 0xc, 4)).readInt32BE(0) + 1;
  const p = await wsr.pointers(gdb), b = await wsr.readBall(gdb, p.ball, { records: false });
  return JSON.stringify({ hole, tut, ready: f[0] === 1 && f[1] === 1 && !tut && b.life === 0 && !b.moving });
} catch (e) { return JSON.stringify({ menu: true }); }`;

// Eighteen Holes, or a course's tile on "Select Course" (pointer x = (px -
// 418) / 560, y = (190 - py) / 232 on the 834x456 screen; make-states.mjs's
// COURSES)
const COURSES = {
  "Resort A": { tile: [-0.264, 0.237], first: 1 }, "Resort B": { tile: [-0.264, -0.099], first: 4 },
  "Resort C": { tile: [-0.264, -0.444], first: 7 }, "Classic A": { tile: [0.254, 0.237], first: 10 },
  "Classic B": { tile: [0.254, -0.099], first: 13 }, "Classic C": { tile: [0.254, -0.444], first: 16 },
};
const course = arg("--course", null);
// --nine Resort|Classic: Nine Holes (0.004, -0.164 on "Number of Holes"), then that course's tile on its
// "Select Course" (measured on the 834x456 screens, 2026-10-23)
const NINE = { Resort: { tile: [-0.279, -0.185], first: 1 }, Classic: { tile: [0.273, -0.185], first: 10 } };
const nine = arg("--nine", null);
if (nine && !NINE[nine]) { console.log(`no nine-hole course ${nine}`); process.exit(2); }
if (course && !COURSES[course]) { console.log(`no course ${course}`); process.exit(2); }
const first = course ? COURSES[course].first : nine ? NINE[nine].first : 1;
const [px, py] = course ? COURSES[course].tile : nine ? NINE[nine].tile : [0.004, -0.552];
if (nine) { await post("point", ["0.004", "-0.164"]); await post("wait", ["700"]); await post("press", ["A", "200"]); await post("wait", ["2500"]); }
const PIN = arg("--pin", null);
await post("point", [String(px), String(py)]);
await post("wait", ["700"]);
if (PIN != null && course) {
  const pins = new URL("./lib/pins.mjs", import.meta.url).href;
  const r = await post("eval", [`const P = await import(${JSON.stringify(pins)}); await gdb.haltSafe(); await gdb.addBreak(P.FORCE_PC); await gdb.go(); await dsu.tap(0, "Cross", 250); let out; try { out = await P.forceAtStart({ gdb, dsu }, { hole: ${first}, slot: ${Number(PIN)}, menu: true }); } catch (e) { out = { error: String(e.message ?? e) }; } try { await gdb.haltSafe(); } catch { /* the wrapper resumes a halted CPU */ } return JSON.stringify(out);`]);
  console.log(`hole ${first}: the pin forced to slot ${PIN}: ${r}`);
} else {
  await post("press", ["A", "200"]);
  await post("wait", ["3500"]);
}
for (let i = 0; i < 80; i++) {
  const r = JSON.parse(await post("eval", [READY]));
  if (r.ready && r.hole === first) {
    await post("wait", ["1500"]);
    const r2 = JSON.parse(await post("eval", [READY]));
    if (r2.ready && r2.hole === first) { console.log(`at hole ${first}'s tee`); process.exit(0); }
  }
  if (r.tut) await post("press", ["-", "250"]);
  else { await post("hold", ["A", "B"]); await post("wait", ["300"]); await post("release", ["A", "B"]); }
  await post("wait", ["1800"]);
}
console.log(`did not reach hole ${first}'s tee`);
process.exit(1);
