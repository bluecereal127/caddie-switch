// public/playbook/ (GENERATED, committed): the routes the Dolphin harness
// solved for every WSR pin, per hole, for the app's solver ("Can we now update
// the website so that our recommendations reflect these known best
// approaches?", 2026-10-22). Each route is a hole played in WSR itself from a
// savestate of the pin's tee (tools/harness/hole-solve.mjs) by the near rule
// (the user: a route a human can replay): the attempt stroke, a par 3's tee
// shot or a par 4's or 5's second, holes or rests within 1 ft of the cup
// (`near`, a tap-in), no flag catches. The windy ones and the calm ones the
// near rule replayed come from tools/harness/results/solve-wind/hHH-<id>/
// iII.json (tools/harness/wind-campaign.mjs: every pin in WSR's winds, 8
// directions x 2-30 mph in steps of 2, and calm as i00's "0:0"); the other
// calm ones from tools/harness/results/solve (the first campaign: holed, an
// ace or an eagle in 2), and where neither stands yet, the first campaign's
// calm route as `legacy` (a par 5 holed in 3, a catch in the flag), which the
// app labels; and a par 5's `fallback` where no route comes within 1 ft in 2
// (3 strokes, the third holed or within 1 ft). Per stroke: the club, the bars
// (4 x the launch power the game read), the aim off the line from the ball to
// the pin in degrees (+ right), the ball before and its rest after in map
// fractions (tools/mesh-registration.json meshToMapFrac), the yards to the pin
// before and after (to the hundredth), and how the last one finished (holed:
// roll, flag, hop; or `near`, at rest within 1 ft).
// A wind is kept as WSR holds it (dir 0-7, mph) and as the minimap shows it
// (the bearing it blows toward, deg N-up, through the hole's registration), so
// the app matches the solver's wind dial against it.
//   node tools/build-playbook.mjs
// writes public/playbook/hNN.json for holes 1-18, and for each of the Special course's 19-21 once every pin
// of it has a calm route, and public/playbook/index.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, "public", "playbook");
const SOLVE = path.join(HERE, "harness", "results", "solve");
const SWEEP = path.join(HERE, "harness", "results", "solve-wind");
const PINS = JSON.parse(fs.readFileSync(path.join(HERE, "wsr-pins.json"), "utf8"));
const REG = JSON.parse(fs.readFileSync(path.join(HERE, "mesh-registration.json"), "utf8"));
const DERIVED = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "derived.json"), "utf8"));
const MAP_W = 250, MAP_H = 304, YD = 9.144, R2D = 180 / Math.PI;
const NEAR_YD = 1 / 3;
// holes 19-21: the Special course, all par 4 (the game's own banners, "Hole 20: Par 4", "Hole 21: Par 4",
// and its "Par" call on hole 19 holed in 4; 2026-10-24)
const PAR = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5, 19: 4, 20: 4, 21: 4 };
const hh = (n) => String(n).padStart(2, "0");
const r4 = (v) => Math.round(v * 1e4) / 1e4, r2 = (v) => Math.round(v * 100) / 100, r1 = (v) => Math.round(v * 10) / 10;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
// each hole's tee aim (the game's own on the tee; flag-sand-risk.mjs) and the
// calm routes a tenth of a bar puts in the sand
const TEE_AIM = readJson(path.join(HERE, "harness", "results", "tee-aims.json")) ?? {};
const CALM_RISK = readJson(path.join(HERE, "harness", "results", "solve-wind", "calm-sand-risk.json")) ?? {};

let bad = 0;
// a Special hole is built once every WSR pin has a calm entry under the near rule (solved or a fallback)
function specialReady(hole) {
  return PINS.holes[hole].spots.every((sp) => {
    const s = readJson(path.join(SWEEP, `h${hh(hole)}-s${sp.slots[0]}`, "i00.json"));
    return Object.values(s?.winds ?? {}).some((e) => /^near/.test(e.rule) && e.speedIdx === 0 && (e.solved || e.fallback));
  });
}
const fail = (m) => { console.error(`  ${m}`); bad++; };
fs.mkdirSync(OUT, { recursive: true });
const index = { version: 1, source: "the Dolphin harness: each route played in WSR itself, from a savestate of the pin's tee", mapW: MAP_W, mapH: MAP_H, holes: {} };
// holes 19-21 (the Special course) only once every pin has its calm route; until then they are left out
const PENDING = [];
for (let hole = 1; hole <= 21; hole++) {
  if (hole >= 19 && !specialReady(hole)) { PENDING.push(hole); continue; }
  const B = REG.holes[hole]?.meshToMapFrac;
  if (!B) { fail(`hole ${hole}: no registration`); continue; }
  const toMap = (m) => [r4(B[0][0] * m[0] + B[0][1] * m[2] + B[0][2]), r4(B[1][0] * m[0] + B[1][1] * m[2] + B[1][2])];
  // the bearing (deg N-up) a mesh direction (x, z) has on the map
  const bearingOf = (vx, vz) => {
    const px = MAP_W * (B[0][0] * vx + B[0][1] * vz), py = MAP_H * (B[1][0] * vx + B[1][1] * vz);
    return ((Math.atan2(px, -py) * R2D) % 360 + 360) % 360;
  };
  // WSR's wind dir d moves the air along (sin, cos)(d x 45 deg) in (x, z)
  const dirs = Array.from({ length: 8 }, (_, d) => r1(bearingOf(Math.sin((d * Math.PI) / 4), Math.cos((d * Math.PI) / 4))));
  const par = PAR[hole], target = par === 3 ? 1 : 2;
  const dPins = DERIVED.holes[hole]?.pins ?? [];
  const pins = {};
  let nRoutes = 0;
  for (const sp of PINS.holes[hole].spots) {
    const id = `s${sp.slots[0]}`;
    const pin = sp.mesh;
    const pinMap = toMap(pin);
    const dp = dPins.find((p) => p.id === id);
    if (!dp) fail(`h${hh(hole)}-${id}: not among derived.json's pins`);
    else if (Math.hypot(dp.x - pinMap[0], dp.y - pinMap[1]) > 0.004) fail(`h${hh(hole)}-${id}: the pin maps to ${pinMap} but derived.json has ${dp.x}, ${dp.y}`);
    const stroke = (s) => {
      const h0 = Math.atan2(pin[0] - s.from[0], pin[2] - s.from[2]);
      const toPin = Math.hypot(s.from[0] - pin[0], s.from[2] - pin[2]) / YD;
      const left = s.holed ? 0 : Math.hypot(s.rest[0] - pin[0], s.rest[2] - pin[2]) / YD;
      // the aim line: the swing's heading from the ball, as long as the shot went
      // (its rest, or the pin when holed), so the map shows the aim beside the path
      const end = s.holed ? pin : s.rest, len = Math.hypot(end[0] - s.from[0], end[2] - s.from[2]);
      const aimTo = toMap([s.from[0] + Math.sin(s.heading) * len, 0, s.from[2] + Math.cos(s.heading) * len]);
      return {
        aimTo,
        // the aim against the game's own at the address (+ right; the tee's from
        // tee-aims.json when the stroke has none): keepAim, no D-pad at all
        ...(() => { const a0 = s.aim0 ?? (s.k === 1 ? TEE_AIM[hole]?.heading : null); if (a0 == null) return {}; const d = -angDiff(s.heading, a0); return Math.abs(d) < 0.0006 ? { keepAim: true, aimGame: 0 } : { aimGame: r2(d * R2D) }; })(),
        ...(s.sandRisk ? { sandRisk: true } : {}),
        // at the lie's full power (4.00 bars from the tee or fairway, 3.00 in the rough, a bunker's cap): a swing a human maxes
        ...(s.club !== "putter" && s.gamePower >= (s.lie === 2 ? 0.75 : s.lie === 3 || s.lie === 16 ? ({ driver: 0.25, spoon: 0.25, wedge: 0.75 }[s.club] ?? 0.5) : 1) - 0.0015 ? { max: true } : {}),
        club: s.club, bars: r2(4 * s.gamePower), aim: r2(-angDiff(s.heading, h0) * R2D), heading: r1(bearingOf(Math.sin(s.heading), Math.cos(s.heading))),
        from: toMap(s.from), rest: s.holed ? pinMap : toMap(s.rest), yd: r1(toPin), left: r2(left),
        ...(s.holed ? { holed: true, how: s.how ?? "roll" } : left <= NEAR_YD + 1e-6 ? { near: true } : {}),
      };
    };
    const routes = [];
    // a route: at most n strokes (the target; a legacy calm one 3), the last
    // holed or (unless only a holed one will do) at rest within the tap-in
    const lastOk = (x, nearOk) => x.holed || (nearOk && Math.hypot(x.rest[0] - pin[0], x.rest[2] - pin[2]) / YD <= NEAR_YD + 1e-6);
    const check = (tag, ss, n = target, nearOk = true) => {
      if (!ss?.length || ss.length > n || !lastOk(ss[ss.length - 1], nearOk) || ss.slice(0, -1).some((s) => s.holed)) { fail(`h${hh(hole)}-${id} ${tag}: not a route of at most ${n} ending ${nearOk ? "holed or within 1 ft" : "holed"}`); return false; }
      if (ss.some((s) => !s.from)) { fail(`h${hh(hole)}-${id} ${tag}: a stroke without its spot`); return false; }
      for (let k = 1; k < ss.length; k++) if (Math.hypot(ss[k].from[0] - ss[k - 1].rest[0], ss[k].from[2] - ss[k - 1].rest[2]) > 0.5) { fail(`h${hh(hole)}-${id} ${tag}: stroke ${k + 1} not from stroke ${k}'s rest`); return false; }
      return true;
    };
    // the sweep's entries under the near rule, every speed's file (i00 = calm)
    const dir = path.join(SWEEP, `h${hh(hole)}-${id}`);
    const entries = (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^i\d\d\.json$/.test(f)) : [])
      .flatMap((f) => Object.values(readJson(path.join(dir, f))?.winds ?? {})).filter((e) => /^near/.test(e.rule))   // "near", or "near-max" (full-power setups first)
      .sort((a, b) => a.speedIdx - b.speedIdx || a.dir - b.dir);
    // calm: the near rule's own, else the first campaign's when it stands (holed
    // within the target, not off the flag), else that one as legacy
    const calmNear = entries.find((e) => e.speedIdx === 0 && (e.solved || e.fallback));
    const calm = readJson(path.join(SOLVE, `h${hh(hole)}-${id}.json`));
    if (calmNear?.solved) {
      if (check("calm (near)", calmNear.strokes)) routes.push({ dir: null, mph: 0, deg: null, strokes: calmNear.strokes.map(stroke) });
    } else if (calmNear) {
      if (check("calm (fallback)", calmNear.fallback.strokes, 3)) routes.push({ dir: null, mph: 0, deg: null, fallback: true, strokes: calmNear.fallback.strokes.map(stroke) });
    } else if (calm?.solved) {
      const risk = CALM_RISK[`h${hh(hole)}-${id}`] ?? [];
      let ss = calm.strokes.map((x) => { const t = calm.tries.find((y) => y.k === x.k && y.gamePower === x.gamePower && y.heading === x.heading); return { ...x, from: t?.from, lie: x.lie ?? t?.lie, how: x.how ?? t?.how, ...(risk.includes(x.k) ? { sandRisk: true } : {}) }; });
      // cut at its first finish within 1 ft (h12-s4: the second shot 0.23 yd from the cup, then a putt): the tap-in the near rule asks for
      const k = ss.findIndex((x) => lastOk(x, true));
      if (k >= 0 && k < ss.length - 1) ss = ss.slice(0, k + 1);
      const flag = ss[ss.length - 1].how === "flag", stands = ss.length <= target && !flag;
      if (check(stands ? "calm" : "calm (legacy)", ss, stands ? target : 3))
        routes.push({ dir: null, mph: 0, deg: null, strokes: ss.map(stroke), ...(stands ? {} : { legacy: flag ? "a catch in the flag" : `holed in ${ss.length}` }), ...(calm.edges?.widthYd != null ? { aceWindowYd: calm.edges.widthYd } : {}) });
    } else fail(`h${hh(hole)}-${id}: no calm solution`);
    for (const e of entries) {
      if (e.speedIdx === 0) continue;
      if (e.solved) { if (check(`wind ${e.dir}/${e.mph}`, e.strokes)) routes.push({ dir: e.dir, mph: e.mph, deg: dirs[e.dir], strokes: e.strokes.map(stroke) }); }
      else if (e.fallback) { if (check(`wind ${e.dir}/${e.mph} (fallback)`, e.fallback.strokes, 3)) routes.push({ dir: e.dir, mph: e.mph, deg: dirs[e.dir], fallback: true, strokes: e.fallback.strokes.map(stroke) }); }
    }
    const unsolved = entries.filter((e) => !e.solved && !e.fallback && e.speedIdx > 0).map((e) => [e.dir, e.mph]);
    pins[id] = { label: sp.label, set: sp.set, pin: pinMap, routes, ...(unsolved.length ? { unsolved } : {}) };
    nRoutes += routes.length;
  }
  const file = { hole, par, target, dirs, pins };
  fs.writeFileSync(path.join(OUT, `h${hh(hole)}.json`), JSON.stringify(file));
  index.holes[hole] = { par, target, pins: Object.keys(pins).length, routes: nRoutes, winds: Object.fromEntries(Object.entries(pins).map(([id, p]) => [id, p.routes.length])) };
  console.log(`hole ${hole}: ${Object.keys(pins).length} pins, ${nRoutes} routes (${Object.values(pins).map((p) => p.routes.length).join(", ")})`);
}
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1));
if (PENDING.length) console.log(`holes ${PENDING.join(", ")}: left out until every pin has a calm route`);
if (bad) { console.error(`${bad} problems`); process.exit(1); }
