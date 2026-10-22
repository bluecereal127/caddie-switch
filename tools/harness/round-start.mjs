// From the "Number of Holes" screen (a driver booted on saves/menu-holes.sav)
// to hole 1's tee of a natural 18-hole round, through the game's own menus:
// Eighteen Holes, then A / A+B through the safety notice, the hole card and
// "Shot 1", and minus to quit the swing tutorial, until the game says the
// player stands ready at hole 1's tee (playerManager+0x674 / +0x675 set, the
// tutorial flag +0x8a8 clear, the ball at rest with lifetime 0), as
// make-states.mjs walks to a tee. Only button presses and the pointer.
// With --course (a driver booted on saves/menu-course.sav, "Select Course"):
// that 3-hole course's tile instead, to its first hole's tee.
//   node tools/harness/round-start.mjs --port 8815 [--course "Classic A"]
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
if (course && !COURSES[course]) { console.log(`no course ${course}`); process.exit(2); }
const first = course ? COURSES[course].first : 1;
const [px, py] = course ? COURSES[course].tile : [0.004, -0.552];
await post("point", [String(px), String(py)]);
await post("wait", ["700"]);
await post("press", ["A", "200"]);
await post("wait", ["3500"]);
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
