// node tools/test-trees.mjs [repoRoot]
// Acceptance for the tree check: a rec's flight against WSR's tree collision
// shapes (src/trees.js treeCheck / treesAlong, src/model.js flightOf and the
// pass in solve). Runs on the committed files alone (no rasters, no Python).
//  a. the shape table against tools/research/wsr-tree-shapes.json (the
//     broadleaf and conifer constants; the palm's approximation from its mesh
//     extents)
//  b. synthetic, flat ground (z = 0), DEFAULT_CLUBS, no wind; every class
//     asserted with the margin it is expected to have (yd):
//     1. a broadleaf sx = sy = 1 at 60 yd on the line (canopy 5.6-16.2 yd up):
//        the full 7-iron passes over it, the full driver through the canopy,
//        flat and over a level profile alike; in solve at 120 yd the driver
//        (1.30 bars, low enough to meet the trunk) and the 3-iron (2.42,
//        the canopy) carry `tree` and +5, and name the 7-iron (over) as the
//        alternative
//     2. a broadleaf sx = sy = 2.5 (canopy bottom 14.2 yd): at 25 yd on the
//        line both the full driver and the full wedge hit its trunk (16.4 yd
//        tall); 3 yd right of the line at 38 yd the driver passes under the
//        canopy and the wedge goes into it. (At 25 yd beside the trunk the
//        wedge passes under too, 0.6 yd below the canopy: the Switch's wedge
//        flies 1.33 times WSR's distance at WSR's heights, so at 25 yd it is
//        13.3 yd up, not yet at its 16.2 yd apex)
//     3. a broadleaf on the line at 10 yd: the full driver (2.0 yd up) hits
//        the trunk
//     4. the tree of 1 moved 8 yd right: clear for the straight 7-iron, still
//        clear with aim = +10 (2.5 yd right at mid-path: 0.2 yd to spare);
//        2 yd right the footprint catches it (the 7-iron over, the driver in)
//     5. a conifer sx = sy = 2.3 at 40 yd, 6.8 yd right of the line: the full
//        5-iron (17.7 yd up) passes the cone beside its upper part, where it
//        is 5.8 yd wide; a broadleaf canopy of the cone's base radius (7.6 yd)
//        centred at the ball's height would catch it
//     6. a palm sx = sy = 1.2 (the approximation: fronds 8.31 sy ... 18.59 sy
//        yd up, reaching 9.2 yd from the trunk; the trunk 0.97 yd in radius
//        to 17.3 yd) at 30 yd, 3 yd right: the full driver passes under
//        the fronds, the full 7-iron into them; a level path 0.2 yd either
//        side of each edge of the band
//  c. treesAlong: the line's frame (s along, l right) for a ball and bearing;
//     off-course trees kept (WSR collides with every tree it places), the
//     v13 seeds (auto, no kind) skipped; a player's marker is a median
//     broadleaf on the ground under it; z against the ball's ground
//  d. Hole 7 over the committed terrain, its tee, its most-seen pin, its
//     trees and scale 2.143: the App's default line (tee to pin) runs along
//     the out-of-bounds edge, no on-course tree within 3 yd of it, and the
//     full driver passes under the off tree t7-25's canopy by 12.4 yd; the
//     full driver
//     aimed through the middle tree NOTES[7] plays right of (t7-18) goes
//     into its canopy at ~198 yd; rotated right in 0.25 degree steps, the
//     first clear line passes 12.8 yd right of that trunk, and the gap holds
//     to t7-15 (solve on both lines agrees). H19's corner cut from the north
//     end of the right fairway: measured, printed, no assertion
//  e. solve: no ctx.trees, an empty list and trees far off the line give the
//     same recs (tree null); the check twice gives the same results; a
//     7-club solve with the trees on H7's and H19's tee lines within the
//     15 ms budget (mean and p90)
//  f. src/trees.js, src/model.js and src/App.jsx parse with @babel/parser
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const { DEFAULT_CLUBS, solve, stopAt, flightOf, TREE_PENALTY } = await imp("src/model.js");
const { treeCheck, treesAlong, TREE_SHAPES, OWN_TREE } = await imp("src/trees.js");
const { YD } = await imp("src/wsrsim.js");
const { parseTerrain, classAt, lieOf, heightAt } = await imp("src/terrain.js");
const { applyDerivedHole } = await imp("src/derivedMerge.js");
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL:", msg); } };
const byId = Object.fromEntries(DEFAULT_CLUBS.map((c) => [c.id, c]));
const f2 = (v) => (v == null ? "—" : v.toFixed(2));
const say = (c) => `${c.kind}${c.tree != null ? ` (${c.tree})` : ""} at ${f2(c.at)} yd, margin ${f2(c.margin)}`;
// a class with its margin: above `min` (clear, over, under) or below `max` (a hit)
const expect = (c, kind, { min, max }, what) => {
  ok(c.kind === kind && (min == null || c.margin > min) && (max == null || c.margin < max), `${what}: ${say(c)}, expected ${kind} with margin ${min != null ? `> ${min}` : `< ${max}`}`);
  return c;
};
// a synthetic tree on the line's frame (z = its base above the ball's ground)
const T = (s, l, kind = 2, sx = 1, sy = sx, id = "t") => ({ id, kind, sx, sy, z: 0, s, l });
const ask = (clubs, dist, ctx = {}) => solve(clubs, { dist, windSpeed: 0, relWindDeg: 0, lie: "tee", hole: 0, stroke: 1 }, [], ctx);
// the class of one club's full (or `bars`) flight against `trees`, as solve checks it
const fly = (club, trees, { bars = 4, aim = 0, ctx = {} } = {}) => {
  const f = flightOf(byId[club], bars, 0, ctx);
  return treeCheck(f.path, trees, { ...f, aim });
};
const level = { heightAt: () => 0, surfaceAt: () => "fairway" };

// ---- a. the shape table ----
{
  const J = JSON.parse(readFileSync(join(root, "tools/research/wsr-tree-shapes.json"), "utf8"));
  const b = J.kinds["2"], c = J.kinds["3"], p = J.kinds["6"];
  ok(J.ballRadius === 0.5, `ball radius ${J.ballRadius}`);
  const B = TREE_SHAPES[2], C = TREE_SHAPES[3], P = TREE_SHAPES[6];
  ok(B.trunk.r === b.trunk.r && B.trunk.top === b.trunk.top && B.canopy.type === b.canopy.type && B.canopy.cy === b.canopy.cy && B.canopy.r === b.canopy.r, "broadleaf constants differ from wsr-tree-shapes.json");
  ok(C.trunk.r === c.trunk.r && C.trunk.top === c.trunk.top && C.canopy.type === c.canopy.type && C.canopy.y0 === c.canopy.y0 && C.canopy.r0 === c.canopy.r0 && C.canopy.y1 === c.canopy.y1, "conifer constants differ from wsr-tree-shapes.json");
  // the palm's approximation from its mesh: trunk 6.7 at the base to 132, fronds 75.9 ... 169.5 up, x -69.6 ... 65.5
  ok(Math.abs(P.trunk.r - p.trunk.r) < 0.5 && P.trunk.top === p.trunk.top && Math.abs(P.canopy.y0 - p.canopy.y0) < 0.5 && Math.abs(P.canopy.y1 - p.canopy.y1) < 0.6 && Math.abs(P.canopy.r - Math.max(-p.canopy.x[0], p.canopy.x[1])) < 0.5, "palm approximation strays from the mesh extents");
  console.log(`shapes: broadleaf trunk ${B.trunk.r}/${B.trunk.top} sphere ${B.canopy.cy}/${B.canopy.r}; conifer trunk ${C.trunk.r}/${C.trunk.top} cone ${C.canopy.y0}-${C.canopy.y1} r ${C.canopy.r0}; palm trunk ${P.trunk.r}/${P.trunk.top} fronds ${P.canopy.y0}-${P.canopy.y1} r ${P.canopy.r} (u at scale 1)`);
}

// ---- b. synthetic, flat ground ----
// 1. the lofted iron over the canopy
{
  const tree = [T(60, 0)];
  const i7 = expect(fly("7iron", tree), "over", { min: 5 }, "1. full 7-iron, broadleaf 1.0 at 60 yd");
  const dr = expect(fly("driver", tree), "canopy", { max: -3.5 }, "1. full driver, broadleaf 1.0 at 60 yd");
  const i7l = fly("7iron", tree, { ctx: level }), drl = fly("driver", tree, { ctx: level });
  ok(i7l.kind === "over" && drl.kind === "canopy" && Math.abs(i7l.margin - i7.margin) < 0.05 && Math.abs(drl.margin - dr.margin) < 0.05, `1. over a level profile: 7-iron ${say(i7l)}, driver ${say(drl)}`);
  const all = ask(DEFAULT_CLUBS, 120, { trees: tree });
  const hit = all.recs.find((r) => r.tree);
  ok(all.recs[0].club.id === "7iron" && !all.recs[0].tree && hit && hit.tree.kind === "canopy" && hit.tree.alt?.club === "7 Iron" && hit.tree.alt.how === "over",
    `1. solve at 120 yd: ${all.recs.map((r) => `${r.club.name} ${r.power.toFixed(2)}${r.tree ? ` ${r.tree.kind}, alt ${r.tree.alt?.club} ${r.tree.alt?.how}` : ""}`).join("; ")}`);
  const two = ask([byId.driver, byId["7iron"]], 120, { trees: tree }), flat = ask([byId.driver, byId["7iron"]], 120);
  const d = two.recs.find((r) => r.club.id === "driver"), d0 = flat.recs.find((r) => r.club.id === "driver");
  ok(two.recs[0].club.id === "7iron" && d.tree && d.tree.id === "t" && d.tree.shape === "broadleaf" && d.tree.alt?.club === "7 Iron" && d.tree.alt.how === "over" && Math.abs(d.score - d0.score - TREE_PENALTY) < 1e-12 && d.power === d0.power,
    `1. solve [driver, 7-iron] at 120 yd: driver ${d.power.toFixed(2)} ${JSON.stringify(d.tree)}, score ${d.score.toFixed(2)} vs ${d0.score.toFixed(2)} without the tree`);
  console.log(`1. broadleaf 1.0 at 60 yd: full 7-iron ${say(i7)}; full driver ${say(dr)}; at 120 yd ${all.recs.map((r) => `${r.club.name} ${r.power.toFixed(2)}${r.tree ? ` ${r.tree.kind} -> ${r.tree.alt?.club} ${r.tree.alt?.how}` : " clean"}`).join(", ")}; the driver at ${d.power.toFixed(2)} bars: ${d.tree.kind} at ${d.tree.at.toFixed(1)} yd`);
}
// 2. driver / spoon under the branches
{
  const onLine = [T(25, 0, 2, 2.5)];
  const a = expect(fly("driver", onLine), "trunk", { max: -1 }, "2. full driver, broadleaf 2.5 on the line at 25 yd");
  const b = expect(fly("wedge", onLine), "trunk", { max: -1 }, "2. full wedge, broadleaf 2.5 on the line at 25 yd");
  const beside = [T(38, 3, 2, 2.5)];
  const c = expect(fly("driver", beside), "under", { min: 5 }, "2. full driver, broadleaf 2.5 at 38 yd, 3 yd right");
  const d = expect(fly("wedge", beside), "canopy", { max: -1.3 }, "2. full wedge, broadleaf 2.5 at 38 yd, 3 yd right");
  const w25 = fly("wedge", [T(25, 3, 2, 2.5)]);
  console.log(`2. broadleaf 2.5 on the line at 25 yd: driver ${say(a)}, wedge ${say(b)}; 3 yd right at 38 yd: driver ${say(c)}, wedge ${say(d)} (at 25 yd 3 yd right the wedge: ${say(w25)})`);
}
// 3. the trunk right in front
{
  const c = expect(fly("driver", [T(10, 0)]), "trunk", { max: -4 }, "3. full driver, broadleaf 1.0 on the line at 10 yd");
  ok(c.at > 9 && c.at < 10, `3. the trunk hit at ${f2(c.at)} yd, expected 9-10`);
  console.log(`3. broadleaf 1.0 at 10 yd: full driver ${say(c)}`);
}
// 4. beside the line
{
  const r8 = [T(60, 8)];
  const a = expect(fly("7iron", r8), "clear", { min: 2.5 }, "4. full 7-iron, broadleaf 1.0 8 yd right");
  const b = fly("7iron", r8, { aim: 10 });
  ok(b.kind === "clear" && b.margin > 0.1 && b.margin < 0.3, `4. aim +10 (2.5 yd right at mid-path): ${say(b)}, expected clear by 0.2 yd`);
  const r2 = [T(60, 2)];
  const c = expect(fly("7iron", r2), "over", { min: 5 }, "4. full 7-iron, broadleaf 1.0 2 yd right");
  const d = expect(fly("driver", r2), "canopy", { max: -3 }, "4. full driver, broadleaf 1.0 2 yd right");
  console.log(`4. broadleaf 1.0 8 yd right: 7-iron ${say(a)}, with aim +10 ${say(b)}; 2 yd right: 7-iron ${say(c)}, driver ${say(d)}`);
}
// 5. the cone narrows with height
{
  const L = 6.8, sx = 2.3;
  const cone = expect(fly("5iron", [T(40, L, 3, sx)]), "over", { min: 4 }, "5. full 5-iron, conifer 2.3 at 40 yd 6.8 yd right");
  // the 5-iron's height at 40 yd, and a broadleaf with the cone's base radius
  // (48 sx' + 0.5 ~ 30 sx) whose sphere is centred there
  const f = flightOf(byId["5iron"], 4, 0), x = 40 / f.k, i = f.path.findIndex((p) => p[0] >= x), [p, q] = [f.path[i - 1], f.path[i]];
  const h = p[1] + ((x - p[0]) / (q[0] - p[0])) * (q[1] - p[1]);
  const coneR = ((30 * sx) / YD) * (170 * sx - h * YD) / (130 * sx);
  const ball = expect(fly("5iron", [T(40, L, 2, (30 * sx) / 48, (h * YD) / 100)]), "canopy", { max: -3 }, "5. full 5-iron, the broadleaf of the cone's radius at its height");
  ok(coneR < L && L < (30 * sx) / YD, `5. the cone at ${h.toFixed(1)} yd is ${coneR.toFixed(2)} yd wide, its base ${((30 * sx) / YD).toFixed(2)}: the tree at ${L} yd should sit between`);
  console.log(`5. conifer 2.3 at 40 yd, ${L} yd right: the 5-iron at ${h.toFixed(1)} yd up, where the cone is ${coneR.toFixed(2)} yd wide (base ${((30 * sx) / YD).toFixed(2)}): ${say(cone)}; the broadleaf of the same radius: ${say(ball)}`);
}
// 6. the palm's approximation
{
  const sy = 1.2, palm = [T(30, 3, 6, sy)];
  const a = expect(fly("driver", palm), "under", { min: 1.5 }, "6. full driver, palm 1.2 at 30 yd 3 yd right");
  const b = expect(fly("7iron", palm), "canopy", { max: -5 }, "6. full 7-iron, palm 1.2 at 30 yd 3 yd right");
  // the band 76 sy ... 170 sy u: a level path (its centre 0.5 u above y) past the trunk
  const lo = (76 * sy) / YD, hi = (170 * sy) / YD, at = (y) => treeCheck([[0, y, 0], [100, y, 0]], [T(50, 3, 6, sy)], { k: 1, carry: 100 });
  const cases = [[lo - 0.25, "under"], [lo + 0.15, "canopy"], [hi - 0.25, "canopy"], [hi + 0.15, "over"]].map(([y, kind]) => ({ y, kind, c: at(y) }));
  ok(Math.abs(lo / sy - 8.31) < 0.01 && Math.abs(hi / sy - 18.59) < 0.01, `6. the fronds' band ${f2(lo / sy)} ... ${f2(hi / sy)} sy yd`);
  for (const { y, kind, c } of cases) ok(c.kind === kind && Math.abs(c.margin) > 0.1 && Math.abs(c.margin) < 0.3, `6. a level path at ${y.toFixed(2)} yd past the palm: ${say(c)}, expected ${kind} by 0.2`);
  console.log(`6. palm 1.2 (fronds ${f2(lo)} ... ${f2(hi)} yd) at 30 yd, 3 yd right: full driver ${say(a)}, full 7-iron ${say(b)}; level paths ${cases.map(({ y, c }) => `${y.toFixed(2)}: ${c.kind}`).join(", ")}`);
}

// ---- c. treesAlong ----
{
  const MAP_W = 250, MAP_H = 304, scale = 2;
  const ball = { x: 0.5, y: 0.5 }, ground = (x, y) => 10 + (x - 0.5) * 100;   // rises 1 yd per 0.01 east
  const mk = (id, dx, dy, extra = {}) => ({ id, x: 0.5 + dx / MAP_W, y: 0.5 + dy / MAP_H, ...extra });
  const markers = [
    mk("n", 0, -20, { auto: true, kind: 2, size: 2, sy: 2.5, z: 13 }),      // 20 px north
    mk("e", 20, 0, { auto: true, kind: 3, size: 2.3, sy: 2.4, z: 9 }),      // 20 px east
    mk("off", 0, -30, { auto: true, kind: 2, size: 2, sy: 2, z: 10, off: true }),
    mk("seed", 0, -40, { auto: true }),                                     // a v13 seed
    mk(7, -10, -10),                                                        // the player's own
  ];
  const at0 = treesAlong(markers, { ball, bearing: 0, scale, groundAt: ground });
  const at90 = treesAlong(markers, { ball, bearing: 90, scale, groundAt: ground });
  const get = (list, id) => list.find((t) => t.id === id);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  ok(at0.length === 4 && get(at0, "off") && !get(at0, "seed"), `c. kept ${at0.map((t) => t.id).join(", ")}, expected n, e, off, 7`);
  ok(near(get(at0, "n").s, 40) && near(get(at0, "n").l, 0) && near(get(at0, "e").s, 0) && near(get(at0, "e").l, 40), "c. bearing 0: north is ahead, east is right");
  ok(near(get(at90, "e").s, 40) && near(get(at90, "e").l, 0) && near(get(at90, "n").l, -40), "c. bearing 90: east is ahead, north is left");
  const own = get(at0, 7);
  ok(own.own && own.kind === OWN_TREE.kind && own.sx === OWN_TREE.sx && own.sy === OWN_TREE.sy && near(own.z, ground(markers[4].x, markers[4].y) - 10) && near(own.s, 20) && near(own.l, -20), `c. the player's marker: ${JSON.stringify(own)}`);
  ok(near(get(at0, "n").z, 3) && get(at0, "n").sy === 2.5 && near(get(at0, "e").z, -1) && get(at0, "e").kind === 3, "c. z against the ball's ground, sy and kind carried");
  ok(treesAlong(markers, { ball, bearing: 0, scale, groundAt: () => null }) === null, "c. no height at the ball: null");
}

// ---- d. hole 7 and hole 19 over the committed terrain ----
const DERIVED = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes;
const MAP_W = 250, MAP_H = 304;
const holeOf = (n) => {
  const d = DERIVED[n], t = parseTerrain(readFileSync(join(root, `public/terrain/h${String(n).padStart(2, "0")}.bin`)));
  const meta = applyDerivedHole({ green: {}, markers: [], pins: [] }, n, d, { fresh: true });
  return { d, t, meta, pin: meta.pins.find((p) => p.id === meta.curPin) };
};
const bearingTo = (a, b) => ((Math.atan2((b.x - a.x) * MAP_W, -(b.y - a.y) * MAP_H) * 180) / Math.PI + 360) % 360;
// the App's ctx for a ball and bearing: surfaceAt, heightAt and the trees
const lineCtx = ({ d, t, meta }, ball, bearing) => {
  const th = (bearing * Math.PI) / 180, at = (yd) => [ball.x + (Math.sin(th) * yd) / d.scale / MAP_W, ball.y - (Math.cos(th) * yd) / d.scale / MAP_H];
  const h0 = heightAt(t, ball.x, ball.y);
  return { surfaceAt: (yd) => lieOf(classAt(t, ...at(yd))), heightAt: (yd) => { const h = heightAt(t, ...at(yd)); return h == null ? null : h - h0; }, ballLift: 0,
    trees: treesAlong(meta.markers, { ball, bearing, scale: d.scale, groundAt: (x, y) => heightAt(t, x, y) }) };
};
const h7 = holeOf(7);
{
  const { d, meta, pin } = h7, tee = d.tee;
  ok(d.scale === 2.143 && pin.id === "d7-s1", `d. H7 scale ${d.scale}, pin ${pin.id}`);
  const b0 = bearingTo(tee, pin), c0 = lineCtx(h7, tee, b0);
  const def = expect(fly("driver", c0.trees, { ctx: c0 }), "under", { min: 10 }, "d. H7's default line, full driver");
  const t23 = c0.trees.find((t) => t.id === "t7-23");
  ok(def.tree === "t7-25" && def.at > 225 && def.at < 240, `d. H7's default line, full driver: ${say(def)}, expected under the off tree t7-25 at ~231 yd`);
  const m18 = meta.markers.find((m) => m.id === "t7-18"), b18 = bearingTo(tee, m18);
  const s18 = Math.hypot((m18.x - tee.x) * MAP_W, (m18.y - tee.y) * MAP_H) * d.scale;
  const c18 = lineCtx(h7, tee, b18);
  const hit = expect(fly("driver", c18.trees, { ctx: c18 }), "canopy", { max: -10 }, "d. H7, the full driver through t7-18");
  ok(hit.tree === "t7-18" && hit.at > 190 && hit.at < 205, `d. H7 through t7-18: hit ${hit.tree} at ${f2(hit.at)}`);
  // rotate right until the full driver is clean; the offset at the tree
  let first = null, until = null;
  for (let k = 1; k <= 60 && !until; k++) {
    const b = b18 + k * 0.25, ctx = lineCtx(h7, tee, b), c = fly("driver", ctx.trees, { ctx });
    const clean = c.kind === "clear" || c.kind === "over" || c.kind === "under";
    if (!first && clean) first = { deg: k * 0.25, off: s18 * Math.tan((k * 0.25 * Math.PI) / 180), c };
    else if (first && !clean) until = { deg: k * 0.25, off: s18 * Math.tan((k * 0.25 * Math.PI) / 180), c };
  }
  ok(first && first.off > 10 && first.off < 15 && first.c.tree === "t7-18", `d. H7 the first clean line right of t7-18: ${first ? `${first.deg} deg, ${first.off.toFixed(1)} yd at the tree, ${say(first.c)}` : "none"}`);
  ok(until && until.c.tree === "t7-15" && until.off > first.off + 8, `d. H7 the gap right of t7-18 closes at ${until ? `${until.off.toFixed(1)} yd (${say(until.c)})` : "never"}`);
  // solve agrees: at the full driver's stop on each line
  const r18 = ask(DEFAULT_CLUBS, Math.floor(stopAt(byId.driver, 4, 0, c18)), c18).recs.find((r) => r.club.id === "driver");
  const bR = b18 + first.deg, cR = lineCtx(h7, tee, bR), rR = ask(DEFAULT_CLUBS, Math.floor(stopAt(byId.driver, 4, 0, cR)), cR).recs.find((r) => r.club.id === "driver");
  ok(r18 && r18.tree?.id === "t7-18" && r18.tree.kind === "canopy" && rR && rR.tree === null, `d. H7 solve: through t7-18 ${r18 ? JSON.stringify(r18.tree) : "no driver rec"}; shifted ${rR ? JSON.stringify(rR.tree) : "no driver rec"}`);
  console.log(`H7: the default line (tee to ${pin.id}, ${b0.toFixed(1)} deg) runs along the OB edge, the nearest on-course tree t7-23 ${(-t23.l).toFixed(1)} yd left of it at ${t23.s.toFixed(0)} yd, under the off tree t7-25's canopy: the full driver ${say(def)}. Through t7-18 (${b18.toFixed(1)} deg, the trunk ${s18.toFixed(0)} yd out, its base ${(-c18.trees.find((t) => t.id === "t7-18").z).toFixed(1)} yd below the tee): ${say(hit)}. Rotated right: clean from +${first.deg} deg, ${first.off.toFixed(1)} yd right of the trunk (${say(first.c)}), until +${until.deg} deg, ${until.off.toFixed(1)} yd (${say(until.c)})`);
}
const h19 = holeOf(19);
{
  const ball = { x: 0.6, y: 0.43 }, pin = h19.pin, b = bearingTo(ball, pin), dist = Math.round(Math.hypot((pin.x - ball.x) * MAP_W, (pin.y - ball.y) * MAP_H) * h19.d.scale);
  const ctx = lineCtx(h19, ball, b), o = ask(DEFAULT_CLUBS, dist, ctx);
  const t53 = ctx.trees.find((t) => t.id === "t19-53");
  const each = DEFAULT_CLUBS.map((cl) => { const r = ask([cl], dist, ctx).recs[0]; if (!r) return null; return `${cl.name} ${r.power.toFixed(2)}: ${say(fly(cl.id, ctx.trees, { bars: r.power, ctx }))}`; }).filter(Boolean);
  console.log(`H19 corner cut: from the right fairway's north end (${ball.x}, ${ball.y}, ${lieOf(classAt(h19.t, ball.x, ball.y))}) to ${pin.id}, ${dist} yd across the river past t19-53 (broadleaf ${t53.sx}, ${t53.s.toFixed(0)} yd out, ${t53.l.toFixed(1)} yd right, its base ${t53.z.toFixed(1)} yd above the ball): ${each.join("; ")}. Recs: ${o.recs.map((r) => `${r.club.name} ${r.power.toFixed(2)}${r.tree ? ` (${r.tree.kind} ${r.tree.id}, alt ${r.tree.alt?.club} ${r.tree.alt?.how})` : ""}`).join(", ")}`);
}

// ---- e. solve's contract, determinism and the budget ----
{
  const strip = (o) => JSON.stringify(o.recs.map((r) => ({ ...r, club: r.club.id })));
  for (const ctx of [level, {}]) {
    const base = ask(DEFAULT_CLUBS, 140, ctx), none = ask(DEFAULT_CLUBS, 140, { ...ctx, trees: [] }), far = ask(DEFAULT_CLUBS, 140, { ...ctx, trees: [T(60, 40), T(400, 0)] });
    ok(strip(base) === strip(none) && strip(base) === strip(far) && base.recs.every((r) => r.tree === null), `e. trees absent, empty or far off the line change the recs (${ctx.heightAt ? "level profile" : "flat"})`);
  }
  const c0 = lineCtx(h7, h7.d.tee, bearingTo(h7.d.tee, h7.meta.markers.find((m) => m.id === "t7-18")));
  const a = ask(DEFAULT_CLUBS, 200, c0), b = ask(DEFAULT_CLUBS, 200, c0);
  const f = flightOf(byId.spoon, 3.3, 0, c0), x = treeCheck(f.path, c0.trees, { ...f, aim: 3 }), y = treeCheck(f.path, c0.trees, { ...f, aim: 3 });
  ok(strip(a) === strip(b) && JSON.stringify(x) === JSON.stringify(y), "e. the check is not deterministic");
  for (const [n, H] of [[7, h7], [19, h19]]) {
    const ctx = lineCtx(H, H.d.tee, bearingTo(H.d.tee, H.pin));
    for (let d = 40; d <= 300; d += 20) ask(DEFAULT_CLUBS, d, ctx);
    const ts = [];
    for (let rep = 0; rep < 2; rep++) for (let d = 40; d <= 300; d += 5) { const t0 = performance.now(); ask(DEFAULT_CLUBS, d, ctx); ts.push(performance.now() - t0); }
    ts.sort((p, q) => p - q);
    const mean = ts.reduce((s, v) => s + v, 0) / ts.length, p90 = ts[Math.floor(ts.length * 0.9)];
    ok(mean < 15 && p90 < 15, `e. H${n}: a 7-club solve with ${ctx.trees.length} trees takes ${mean.toFixed(2)} ms mean, ${p90.toFixed(2)} p90 (budget 15)`);
    console.log(`budget: H${n}'s tee line with its ${ctx.trees.length} trees, a 7-club solve ${mean.toFixed(2)} ms mean, ${p90.toFixed(2)} p90, ${ts[ts.length - 1].toFixed(2)} max over ${ts.length} (budget 15 ms)`);
  }
}

// ---- f. the parser ----
try {
  const { parse } = createRequire(join(root, "package.json"))("@babel/parser");
  for (const f of ["src/trees.js", "src/model.js", "src/App.jsx"]) {
    try { parse(readFileSync(join(root, f), "utf8"), { sourceType: "module", plugins: ["jsx"] }); }
    catch (e) { ok(false, `${f} does not parse: ${e.message}`); }
  }
  console.log("parse: trees.js, model.js, App.jsx");
} catch { console.log("parse: skipped (no @babel/parser here)"); }

console.log(fails ? `${fails} FAILURES` : "all tree checks passed");
process.exit(fails ? 1 : 0);
