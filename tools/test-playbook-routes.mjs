// Acceptance for the solver's playbook: src/playbook.js (pinKeyOf, routesFor,
// loadPlaybook through a fetch stand-in) and the committed public/playbook/
// files (tools/build-playbook.mjs): every WSR pin of holes 1-18 with its calm
// route, each route a holed one of at most the hole's target, each stroke
// from the last one's rest, the first from the hole's tee (derived.json's,
// the WSR start the harness's tee states stand on), and the 8 WSR directions'
// bearings 45 deg apart on every hole.
//   node tools/test-playbook-routes.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pinKeyOf, routesFor, loadPlaybook } from "../src/playbook.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "public", "playbook");
const DERIVED = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "derived.json"), "utf8"));
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log(`FAIL ${m}`); } };

// pinKeyOf: the app's pipeline ids only
ok(pinKeyOf(2, "d2-s3") === "s3", "pinKeyOf d2-s3");
ok(pinKeyOf(2, "d12-s3") === null, "pinKeyOf another hole's pin");
ok(pinKeyOf(2, 1712345) === null && pinKeyOf(2, "d2-x1") === null && pinKeyOf(2, null) === null, "pinKeyOf a player's pin, a Switch spot, none");

// routesFor on a synthetic file: dirs 0-7 at 180, 135, ... (WSR's on a north-up map)
const dirs = [180, 135, 90, 45, 0, 315, 270, 225];
const R = (dir, mph) => ({ dir, mph, deg: dir == null ? null : dirs[dir], strokes: [{ club: "7iron", bars: 3, aim: 0, from: [0.5, 0.9], rest: [0.5, 0.3], yd: 150, left: 0, holed: true, how: "roll" }] });
const pb = { hole: 2, par: 3, target: 1, dirs, pins: { s0: { label: "BM", routes: [R(null, 0), R(4, 16), R(4, 14), R(1, 30), R(5, 8)] } } };
let m = routesFor(pb, "s0", { mph: 0, deg: 123 });
ok(m.routes.length === 1 && m.routes[0].mph === 0 && m.exact, "calm");
m = routesFor(pb, "s0", { mph: 16, deg: 10 });
ok(m.dir === 4 && m.routes.length === 1 && m.routes[0].mph === 16 && m.exact, "16 mph toward N: dir 4");
m = routesFor(pb, "s0", { mph: 15, deg: 350 });
ok(m.dir === 4 && m.routes.map((x) => x.mph).join() === "14,16", "15 mph: the 14 and the 16");
m = routesFor(pb, "s0", { mph: 31, deg: 135 });
ok(m.dir === 1 && m.routes.length === 1 && m.routes[0].mph === 30, "31 mph: WSR's 30");
m = routesFor(pb, "s0", { mph: 22, deg: 0 });
ok(m.dir === 4 && !m.exact && m.routes[0].mph === 16, "22 mph north, unsolved: the nearest solved speed in that direction");
m = routesFor(pb, "s0", { mph: 10, deg: 270 });
ok(m.dir === 6 && m.routes.length === 0 && !m.exact, "a direction with nothing solved");
m = routesFor(pb, "s0", { mph: 8, deg: 300 });
ok(m.dir === 5 && m.routes[0].mph === 8, "300 deg is nearest 315: dir 5");
ok(routesFor(pb, "s9", { mph: 0 }).routes.length === 0 && routesFor(null, "s0").routes.length === 0, "an unknown pin, no file");

// loadPlaybook through a fetch stand-in: one fetch per hole, a miss fetched again
const calls = [];
globalThis.fetch = async (u) => { calls.push(u); return u.endsWith("h05.json") ? { ok: false } : { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(ROOT, "public", u), "utf8")) }; };
const a = await loadPlaybook(2), b = await loadPlaybook(2);
ok(a && a === b && calls.filter((u) => u === "/playbook/h02.json").length === 1, "loadPlaybook: one fetch, shared");
ok((await loadPlaybook(5)) === null && (await loadPlaybook(5)) === null && calls.filter((u) => u.endsWith("h05.json")).length === 2, "loadPlaybook: a miss is null and fetched again");
ok((await loadPlaybook(19)) === null && !calls.some((u) => u.endsWith("h19.json")), "loadPlaybook: no file past hole 18");

// the committed files
const index = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
const W = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "wsr-pins.json"), "utf8"));
let routes = 0, windy = 0;
for (let h = 1; h <= 18; h++) {
  const f = JSON.parse(fs.readFileSync(path.join(DIR, `h${String(h).padStart(2, "0")}.json`), "utf8"));
  const tee = DERIVED.holes[h].tee;
  ok(f.hole === h && f.dirs.length === 8, `h${h}: the file`);
  for (let d = 0; d < 8; d++) {
    const gap = (((f.dirs[(d + 1) % 8] - f.dirs[d]) % 360) + 360) % 360;
    ok(Math.abs(gap - 315) < 1, `h${h}: dir ${d + 1} is 45 deg anticlockwise of dir ${d} on the map (${gap})`);
  }
  ok(Math.abs(((f.dirs[0] - 180 + 540) % 360) - 180) < 3, `h${h}: dir 0 blows south on the map (${f.dirs[0]})`);
  const ids = W.holes[h].spots.map((s) => `s${s.slots[0]}`);
  ok(ids.every((id) => f.pins[id]) && Object.keys(f.pins).length === ids.length, `h${h}: every WSR pin`);
  ok(index.holes[h]?.pins === ids.length, `h${h}: the index`);
  for (const [id, p] of Object.entries(f.pins)) {
    ok(p.routes.some((r) => r.mph === 0), `h${h}-${id}: a calm route`);
    for (const r of p.routes) {
      routes++; if (r.mph) windy++;
      const ss = r.strokes, tag = `h${h}-${id} ${r.mph ? `${r.mph} mph dir ${r.dir}` : "calm"}`;
      ok(ss.length >= 1 && ss.length <= f.target && ss[ss.length - 1].holed && ss.slice(0, -1).every((s) => !s.holed), `${tag}: holed in at most ${f.target}`);
      ok(Math.hypot((ss[0].from[0] - tee.x) * 250, (ss[0].from[1] - tee.y) * 304) < 2, `${tag}: from the tee`);
      for (let k = 1; k < ss.length; k++) ok(Math.hypot((ss[k].from[0] - ss[k - 1].rest[0]) * 250, (ss[k].from[1] - ss[k - 1].rest[1]) * 304) < 0.1, `${tag}: stroke ${k + 1} from stroke ${k}'s rest`);
      ok(Math.hypot((ss[ss.length - 1].rest[0] - p.pin[0]) * 250, (ss[ss.length - 1].rest[1] - p.pin[1]) * 304) < 1e-6, `${tag}: the last at the pin`);
      ok(ss.every((s) => s.bars > 0 && s.bars <= (s.club === "putter" ? 10 : 4) && Math.abs(s.aim) < 90 && s.yd > 0), `${tag}: bars (a putter to 2.5 power, past full), aim, yards`);
      ok(r.mph === 0 ? r.dir == null : r.dir >= 0 && r.dir < 8 && r.mph % 2 === 0 && r.mph <= 30 && r.deg === f.dirs[r.dir], `${tag}: the wind`);
    }
  }
}
console.log(`public/playbook: ${routes} routes (${windy} in wind)`);
console.log(fails ? `${fails} of ${checks} checks FAILED` : `all ${checks} checks pass`);
process.exit(fails ? 1 : 0);
