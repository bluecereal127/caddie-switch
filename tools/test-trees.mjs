// node tools/test-trees.mjs [repoRoot]
// Acceptance for the tree check on NSS's trees: a rec's flight against NSS's
// tree collision (src/trees.js treeCheck / treesAlong over tools/nss-trees.json,
// written by tools/nss-trees-export.mjs; src/model.js flightOf and the pass in
// solve). Runs on the committed files alone (no dump, no Python). The flights
// in a, b and d are drawn here (level paths and arcs: x at a constant speed,
// y a parabola, dt = 1/60 s), so the expectations pin the tree geometry and
// NSS's ball-in-tree rules, not the solver's flight model; e flies the solver.
//  a. tools/nss-trees.json: the counts (1,495 decoded, the 36 without
//     collision dropped, the trees beyond the frame left out), ids t<n>-<k> in
//     map order, every field and number; the verifier's corrections: the 49
//     six-sphere crowns on H06 3 / H07 4 / H12 6 / H13 10 / H16 20 / H18 2 /
//     H19 4 (main 5.013 sx at 11.022 sy, satellites 3.377 sx at 8.725 sy,
//     3.507 sx off the axis), H21's 31 TreeLeaf21 pieces dropped (TreeLeaf
//     placed by the gameplay scene on holes 1-20 only); the baked sphere
//     (5.895 sx at 10.112 sy) and cone (3.893 sx, 5.068 to 18.307 sy) per
//     unit; TREE_SHAPES (the templates) within 10 % of the on-course trees'
//     medians; and every one of the 1,257 trees through treesAlong: a level
//     path into its stem hits the trunk, one through its first canopy part's
//     middle passes the canopy (or meets a limb inside it)
//  b. NSS's ball in a tree, on drawn paths (yd; the ball at 40 yd/s unless
//     said otherwise):
//     1. a level path through a leaf sphere of radius 5 (5.06 with the ball):
//        "canopy", kept 0.9925 a tick for the 10.1 yd inside (0.63), lossYd =
//        the air left x (1 - keep)
//     2. at 5 yd/s the 0.5 s leaf timer caps it at 120 ticks (0.406); two
//        overlapping spheres (a satellite crown) set it twice (0.165)
//     3. a rising pass costs more than the horizontal loss alone (its damped
//        climb shortens the flight), a falling one the horizontal loss and the
//        roll at the kept speed squared
//     4. open sheets (palm leaf bands): "canopy" with sheets and p = cover,
//        0.92 for the one tick a crossing takes at speed, 0.92^6 at 5 yd/s
//     5. a trunk on the line is "trunk" (the shot ends there); 0.05 yd clear
//        of it is not; a 0.05 yd limb across the path between two samples is
//        caught (the segment test)
//     6. a limb 2 yd inside a crown: "trunk", the speed kept to it 0.91; 9 yd
//        inside at 20 yd/s the crown has taken more than ON_PATH first:
//        "canopy"; a trunk past a pass that took more than ON_PATH is not
//        reached
//     7. a graze (a pass costing under CLIP_YD) is "over" / "under" with a
//        negative margin; over, under and beside a sphere by 0.94 / 0.94 /
//        1.94; beside a cone's upper part, inside its base radius, "over"
//     8. the templates on the solver's flights: a broadleaf 2.5 on the line
//        at 60 yd meets every rec of a 120 yd solve (alt null), 40 yd off the
//        line none
//  c. treesAlong: the line's frame (s along, l right) for a ball and bearing,
//     a col's parts rotated with it; off-course trees kept, the v13 seeds
//     (auto, no kind) skipped, a marker without col its family's template; a
//     player's marker the median on-course broadleaf on the ground under it;
//     z against the ball's ground; null without a height at the ball
//  d. Hole 7 over the committed terrain from GlfTeeOBJ (local play's tee,
//     tools/nss-pins.json) on a driver-like arc (carry 240, apex 23): the line
//     to each NSS cup, printed; the line into the twin of WSR's t7-18 (the
//     middle tree NOTES[7] plays right of) passes its crown; rotated right in
//     0.25 degree steps the first clean line passes it on the right. H19's
//     corner cut, printed. derived.json's trees, when they carry col, are
//     tools/nss-trees.json's; a merge that drops col is reported
//  e. solve: no ctx.trees, an empty list and trees far off the line give the
//     same recs (tree null); a rec whose own check is a hit carries tree and
//     TREE_PENALTY; the check twice gives the same results; a 7-club solve
//     with the trees on H7's and H19's tee lines within the 40 ms budget
//     (mean and p90), test-solver's: NSS's flight costs about 0.5 ms
//     (src/nsssim.js: float32 ticks, a profile contact every tick) against
//     WSR's port's 0.09, so the 15 ms budget of the WSR solver went with it
//  f. src/trees.js, src/model.js and src/App.jsx parse with @babel/parser
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const { DEFAULT_CLUBS, solve, flightOf, TREE_PENALTY } = await imp("src/model.js");
const { treeCheck, treesAlong, templateCol, TREE_SHAPES, OWN_TREE, BALL_R, LEAF_KEEP, LEAF_MAX_TICKS, PALM_KEEP, TICK_HZ, CLIP_YD, ON_PATH, M_PER_YD } = await imp("src/trees.js");
const { parseTerrain, classAt, lieOf, heightAt } = await imp("src/terrain.js");
const { applyDerivedHole } = await imp("src/derivedMerge.js");
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL:", msg); } };
const f2 = (v) => (v == null ? "-" : v.toFixed(2));
const say = (c) => `${c.kind}${c.tree != null ? ` (${c.tree})` : ""} at ${f2(c.at)} yd, margin ${f2(c.margin)}${c.keep < 1 ? `, keep ${c.keep.toFixed(3)}, ${c.lossYd.toFixed(1)} yd short` : ""}${c.sheets ? `, sheets p ${c.p}` : ""}`;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const MAP_W = 250, MAP_H = 304, DT = 1 / 60;
const NT = JSON.parse(readFileSync(join(root, "tools/nss-trees.json"), "utf8"));
const NP = JSON.parse(readFileSync(join(root, "tools/nss-pins.json"), "utf8")).holes;
const DERIVED = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes;
// the app's markers from tools/nss-trees.json, as derived.json + src/derivedMerge.js give them
// (auto, id t<n>-<k>) once the merge carries col
const markersOf = (n) => NT.holes[n].trees.map(({ nss, id, ...t }) => ({ id, ...t, auto: true }));

// ---- drawn paths ----
// a level path at height y (the ball's rise; its centre is BALL_R above it) from 0 to `to` yd
// at v yd/s, a point every dt
const level = (y, to = 100, v = 40) => { const p = []; for (let x = 0; ; x = Math.min(to, x + v * DT)) { p.push([x, y, 0]); if (x >= to) break; } return p; };
// an arc landing at `carry` yd with its apex `apex` yd up, the ball at v yd/s along, then a
// roll of `roll` yd slowing evenly to rest
function arc({ carry, apex, v = 40, roll = 0 }) {
  const T = carry / v, vy = (4 * apex) / T, g = (8 * apex) / (T * T), p = [];
  for (let t = 0; t < T; t += DT) p.push([v * t, vy * t - (g * t * t) / 2, 0]);
  p.push([carry, 0, 0]);
  if (roll > 0) { const tr = (2 * roll) / v; for (let t = DT; t < tr; t += DT) p.push([carry + v * t - (v * t * t) / (2 * tr), 0, 0]); p.push([carry + roll, 0, 0]); }
  return p;
}
// a synthetic marker on the line from a ball at (0.5, 0.5) on flat ground at bearing 0 (north
// ahead, east right), scale 2 yd/px: s yd ahead, l yd right, its col in yd about it
const SCALE = 2, BALL = { x: 0.5, y: 0.5 };
const mk = (id, s, l, col, extra = {}) => ({ id, x: BALL.x + l / SCALE / MAP_W, y: BALL.y - s / SCALE / MAP_H, auto: true, kind: 2, size: 1, sy: 1, z: 0, col, ...extra });
const along = (markers, bearing = 0) => treesAlong(markers, { ball: BALL, bearing, scale: SCALE, groundAt: () => 0 });
const sph = (u, r, e = 0, s = 0) => ({ type: "spheroid", c: [e, s, u], rh: r, rv: r });
const check = (path, trees, ctx = {}) => treeCheck(path, trees, { k: 1, carry: path[path.length - 1][0], aim: 0, ballZ: 0, ...ctx });
// a level path's height for the ball's centre at h
const at = (h) => h - BALL_R;

// ---- a. tools/nss-trees.json ----
const shipped = Object.values(NT.holes).flatMap((h) => h.trees);
{
  const C = NT.counts;
  ok(C.decoded === 1495 && C.noCollisionDropped === 36 && C.emptyAfterDrops === 0 && C.decoded - C.noCollisionDropped - C.emptyAfterDrops - C.outsideFrame === C.shipped && C.shipped === shipped.length,
    `a. counts ${JSON.stringify(C)} against ${shipped.length} trees`);
  ok(JSON.stringify(NT.rules.treeLeafInPlay) === JSON.stringify(Array.from({ length: 20 }, (_, i) => i + 1)), `a. TreeLeaf in play on ${NT.rules.treeLeafInPlay}`);
  for (let n = 1; n <= 21; n++) {
    const T = NT.holes[n]?.trees ?? [];
    ok(T.length > 0, `a. H${n} ships no trees`);
    ok(T.every((t, k) => t.id === `t${n}-${k}`), `a. H${n} ids are not t${n}-0 ... in order`);
    ok(T.every((t, k) => k === 0 || T[k - 1].y < t.y || (T[k - 1].y === t.y && T[k - 1].x <= t.x)), `a. H${n} trees not in map order`);
    ok(new Set(T.map((t) => t.nss.id)).size === T.length, `a. H${n} an NSS tree twice`);
  }
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  const bad = shipped.filter((t) => !(num(t.x) && num(t.y) && num(t.z) && [2, 3, 6].includes(t.kind) && t.size > 0 && t.sy > 0 && t.r > 0 && (t.off === undefined || t.off === true)
    && Array.isArray(t.col?.t) && Array.isArray(t.col?.c) && (t.col.t.length || t.col.c.length)
    && t.col.t.every((pl) => pl.length >= 8 && pl.length % 4 === 0 && pl.every(num) && pl.every((v, i) => i % 4 !== 3 || v > 0))
    && t.col.c.every((c) => c.c.every(num) && (c.type === "spheroid" ? c.c.length === 3 && c.rh > 0 && c.rv > 0
      : c.type === "cone" ? c.c.length === 2 && c.r0 > 0 && c.u1 > c.u0
      : c.type === "bands" && c.c.length === 2 && c.du > 0 && c.r.length > 0 && c.r.every((r) => r > 0) && c.cover > 0 && c.cover <= 1 && ["palm_leaf", "leaf"].includes(c.mat)))
    && ["actor", "field"].includes(t.nss.source)));
  ok(bad.length === 0, `a. ${bad.length} trees with a bad field: ${bad.slice(0, 3).map((t) => t.id).join(", ")}`);
  // the six-sphere crowns
  const SAT = { 6: 3, 7: 4, 12: 6, 13: 10, 16: 20, 18: 2, 19: 4 };
  const sats = Object.fromEntries(Object.entries(NT.holes).map(([n, h]) => [n, h.trees.filter((t) => t.col.c.length === 6 && t.col.c.every((c) => c.type === "spheroid"))]).filter(([, a]) => a.length));
  ok(JSON.stringify(Object.fromEntries(Object.entries(sats).map(([n, a]) => [n, a.length]))) === JSON.stringify(SAT), `a. six-sphere crowns ${JSON.stringify(Object.fromEntries(Object.entries(sats).map(([n, a]) => [n, a.length])))}`);
  const satErr = [];
  // per unit of scale: the main sphere's radius and height, the satellites' radius, height and
  // distance off the axis; the medians are the verifier's template, every crown within 10 %
  const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
  const satRows = Object.values(sats).flat().map((t) => {
    const m = t.col.c.reduce((b, c) => (c.rh > b.rh ? c : b)), rest = t.col.c.filter((c) => c !== m), Y = M_PER_YD;
    return { id: t.id, main: [(m.rh * Y) / t.size, (m.c[2] * Y) / t.sy], sat: rest.map((c) => [(c.rh * Y) / t.size, (c.c[2] * Y) / t.sy, (Math.hypot(c.c[0] - m.c[0], c.c[1] - m.c[1]) * Y) / t.size]) };
  });
  const TPL = { main: [5.013, 11.022], sat: [3.377, 8.725, 3.507] };
  const satMed = { main: [0, 1].map((i) => med(satRows.map((r) => r.main[i]))), sat: [0, 1, 2].map((i) => med(satRows.flatMap((r) => r.sat.map((q) => q[i])))) };
  for (const k of ["main", "sat"]) satMed[k].forEach((v, i) => { if (!near(v, TPL[k][i], 0.02 * TPL[k][i])) satErr.push(`${k} median ${v.toFixed(3)} vs ${TPL[k][i]}`); });
  for (const r of satRows) if (r.main.some((v, i) => !near(v, TPL.main[i], 0.1 * TPL.main[i])) || r.sat.some((q) => q.some((v, i) => !near(v, TPL.sat[i], 0.1 * TPL.sat[i])))) satErr.push(r.id);
  ok(satErr.length === 0, `a. six-sphere crowns off the verifier's template: ${satErr.slice(0, 6).join("; ")}`);
  // H21's TreeLeaf21 pieces are gone: the 31 trees that lost them keep no closed volume
  const d21 = NT.holes[21].trees.filter((t) => t.nss.dropped), pieces21 = d21.reduce((s, t) => s + t.nss.dropped.length, 0);
  ok(NT.counts.canopyPartsDropped === 31 && pieces21 >= 26 && pieces21 <= 31 && d21.every((t) => t.off && t.nss.dropped.every((s) => /TreeLeaf21/.test(s)) && t.col.c.every((c) => c.type === "bands") && t.col.t.length > 0) && shipped.filter((t) => t.nss.dropped).length === d21.length,
    `a. H21: ${d21.length} trees lost ${pieces21} TreeLeaf21 pieces (of the 31 dropped: the rest are on trees beyond the frame; each off course, keeping its trunk and no closed volume)`);
  // the baked sphere (the median of the field broadleaves with one sphere) and cone (the commonest:
  // the 32-triangle TreeLeaf cone, against H03 / H09 / H14's coarse 8-sided ones and the variants)
  const field = shipped.filter((t) => t.nss.source === "field");
  const one = field.filter((t) => t.kind === 2 && t.col.c.length === 1 && t.col.c[0].type === "spheroid");
  const rh = med(one.map((t) => (t.col.c[0].rh * M_PER_YD) / t.size)), cy = med(one.map((t) => (t.col.c[0].c[2] * M_PER_YD) / t.sy));
  const cones = field.filter((t) => t.kind === 3).flatMap((t) => t.col.c.filter((c) => c.type === "cone").map((c) => [(c.r0 * M_PER_YD) / t.size, (c.u0 * M_PER_YD) / t.sy, (c.u1 * M_PER_YD) / t.sy]));
  const tplCones = cones.filter((c) => near(c[0], 3.893, 0.05) && near(c[1], 5.068, 0.08) && near(c[2], 18.307, 0.08));
  const cr = med(tplCones.map((c) => c[0])), c0 = med(tplCones.map((c) => c[1])), c1 = med(tplCones.map((c) => c[2]));
  ok(near(rh, 5.895, 0.03) && near(cy, 10.112, 0.05) && tplCones.length >= 0.35 * cones.length && near(cr, 3.893, 0.01) && near(c0, 5.068, 0.02) && near(c1, 18.307, 0.02),
    `a. the baked sphere ${rh.toFixed(3)} sx at ${cy.toFixed(3)} sy (5.895, 10.112); ${tplCones.length} of ${cones.length} baked cones the template, r ${cr.toFixed(3)} sx ${c0.toFixed(3)}-${c1.toFixed(3)} sy (3.893, 5.068-18.307)`);
  // the templates against the on-course trees (all actor trees)
  const tm = [];
  for (const k of [2, 3, 6]) {
    const S = TREE_SHAPES[k], A = shipped.filter((t) => t.nss.source === "actor" && t.kind === k);
    const within = (a, b, what) => { if (!(Math.abs(a - b) <= 0.1 * Math.abs(b))) tm.push(`${S.name} ${what} ${a} vs ${b.toFixed(3)}`); };
    within(S.trunk.top, med(A.map((t) => (Math.max(...t.col.t.flatMap((pl) => pl.filter((_, i) => i % 4 === 2))) * M_PER_YD) / t.sy)), "trunk top");
    for (const p of S.canopy) {
      const parts = A.flatMap((t) => t.col.c.filter((c) => c.type === p.type).map((c) => ({ t, c })));
      if (p.type === "spheroid") { within(p.cy, med(parts.map(({ t, c }) => (c.c[2] * M_PER_YD) / t.sy)), "cy"); within(p.rh, med(parts.map(({ t, c }) => (c.rh * M_PER_YD) / t.size)), "rh"); within(p.rv, med(parts.map(({ t, c }) => (c.rv * M_PER_YD) / t.sy)), "rv"); }
      if (p.type === "cone") { within(p.y0, med(parts.map(({ t, c }) => (c.u0 * M_PER_YD) / t.sy)), "y0"); within(p.y1, med(parts.map(({ t, c }) => (c.u1 * M_PER_YD) / t.sy)), "y1"); within(p.r0, med(parts.map(({ t, c }) => (c.r0 * M_PER_YD) / t.size)), "r0"); }
      if (p.type === "bands") {
        within(p.y0, med(parts.map(({ t, c }) => (c.u0 * M_PER_YD) / t.sy)), "bands y0"); within(p.y1, med(parts.map(({ t, c }) => ((c.u0 + c.du * c.r.length) * M_PER_YD) / t.sy)), "bands y1");
        within(Math.max(...p.r), med(parts.map(({ t, c }) => ((Math.max(...c.r) + Math.hypot(c.c[0], c.c[1])) * M_PER_YD) / t.size)), "bands r"); within(p.cover, med(parts.map(({ c }) => c.cover)), "cover");
        // each quarter's widest band (about the trunk)
        p.r.forEach((rq, i) => within(rq, med(parts.map(({ t, c }) => { const n = c.r.length, a = Math.floor((i * n) / p.r.length), b = Math.max(a + 1, Math.floor(((i + 1) * n) / p.r.length)); return ((Math.max(...c.r.slice(a, b)) + Math.hypot(c.c[0], c.c[1])) * M_PER_YD) / t.size; })), `band ${i}`));
      }
    }
  }
  const ownMed = med(shipped.filter((t) => t.nss.source === "actor" && t.kind === 2).map((t) => t.size));
  ok(tm.length === 0 && near(OWN_TREE.sx, ownMed, 0.05), `a. templates off the on-course medians: ${tm.join("; ")}; OWN_TREE ${OWN_TREE.sx} vs ${ownMed}`);
  // every tree through treesAlong: moved 60 yd ahead of a ball on flat ground (z = 0, bearing 0,
  // so a point e east, s south of its placement lands at s' = 60 - s along, l' = e right); then
  // shifted so the stem's base node, or its first canopy part's centre, is on the line at 60 yd
  const miss = [];
  for (const h of Object.values(NT.holes)) for (const t of h.trees) {
    const [tr] = along([{ ...t, x: BALL.x, y: BALL.y - 60 / SCALE / MAP_H, z: 0, auto: true }]);
    const onLine = (e, s) => [{ ...tr, l: tr.l - e, s: tr.s + s }];
    if (t.col.t.length) {
      // a level path 0.5 yd up the stem's first capsule (or half way up a shorter one)
      const st = t.col.t[0], u = st[2] + Math.min(0.5, (st[6] - st[2]) / 2);
      const c = check(level(at(u), 120), onLine(st[0], st[1]));
      if (c.kind !== "trunk") miss.push(`${t.id} stem ${c.kind}`);
    }
    const p0 = t.col.c[0];
    if (p0) {
      // fast (80 yd/s) through the part's middle: a spheroid's centre, a cone a quarter up, the widest band
      const u = p0.type === "spheroid" ? p0.c[2] : p0.type === "cone" ? p0.u0 + 0.25 * (p0.u1 - p0.u0) : p0.u0 + (p0.r.indexOf(Math.max(...p0.r)) + 0.5) * p0.du;
      const c = check(level(at(u), 160, 80), onLine(p0.c[0], p0.c[1]));
      const hasVol = t.col.c.some((q) => q.type !== "bands"), hasSheets = t.col.c.some((q) => q.type === "bands");
      if (!(c.kind === "trunk" || (c.kind === "canopy" && (c.sheets ? hasSheets : hasVol)))) miss.push(`${t.id} ${p0.type} ${c.kind}${c.sheets ? " sheets" : ""}`);
    }
  }
  ok(miss.length === 0, `a. ${miss.length} trees whose stem or canopy a path through it does not meet: ${miss.slice(0, 6).join(", ")}`);
  const fam = (k) => shipped.filter((t) => t.kind === k).length;
  console.log(`nss-trees.json: ${shipped.length} trees (${fam(2)} broadleaf, ${fam(3)} conifer, ${fam(6)} palm; ${shipped.filter((t) => t.off).length} off course, ${shipped.filter((t) => t.nss.source === "actor").length} actor trees), ${NT.counts.noCollisionDropped} without collision dropped, ${NT.counts.outsideFrame} beyond the frame, H21's ${pieces21} TreeLeaf21 pieces dropped from ${d21.length} trees; six-sphere crowns ${JSON.stringify(SAT)}; baked sphere ${rh.toFixed(3)} sx at ${cy.toFixed(3)} sy, cone ${cr.toFixed(3)} sx ${c0.toFixed(3)}-${c1.toFixed(3)} sy (${tplCones.length} of ${cones.length}); satellites main ${satMed.main.map((v) => v.toFixed(3)).join(" sx at ")} sy, ${satMed.sat.map((v) => v.toFixed(3)).join(" / ")}; ${NT.counts.trunkCapsules.shipped} trunk capsules for ${NT.counts.trunkCapsules.decoded} decoded pieces; all ${shipped.length} met through treesAlong`);
}

// ---- b. NSS's ball in a tree, drawn paths ----
// 1. a leaf sphere
{
  const [t] = along([mk("s", 50, 0, { t: [], c: [sph(10, 5)] })]);
  const c = check(level(at(10)), [t]);
  const chord = 2 * (5 + BALL_R), ticks = (chord / 40) * TICK_HZ, keep = Math.pow(LEAF_KEEP, ticks);
  ok(c.kind === "canopy" && !c.sheets && near(c.keep, keep, 0.015) && near(c.at, 50 - 5 - BALL_R, 0.5) && near(c.margin, -(5 + BALL_R), 0.05) && near(c.lossYd, (100 - 55) * (1 - c.keep), 1) && c.passes.length === 1,
    `b1. a level path through a leaf sphere r 5: ${say(c)}; expected canopy, keep ${keep.toFixed(3)}, ${((100 - 55) * (1 - keep)).toFixed(1)} yd short`);
  console.log(`b1. leaf sphere r 5 at 50 yd, the ball at 40 yd/s through its middle: ${say(c)} (${chord.toFixed(1)} yd inside = ${ticks.toFixed(0)} ticks: ${keep.toFixed(3)})`);
}
// 2. the timer
{
  const [t] = along([mk("s", 50, 0, { t: [], c: [sph(10, 5)] })]);
  const c = check(level(at(10), 100, 5), [t]);
  const [t2] = along([mk("s2", 0, 0, { t: [], c: [sph(10, 5, 0, -50), sph(10, 5, 0, -58)] })]);
  const d = check(level(at(10), 100, 5), [t2]);
  const cap = Math.pow(LEAF_KEEP, LEAF_MAX_TICKS);
  ok(c.kind === "canopy" && near(c.keep, cap, 0.002) && d.kind === "canopy" && d.passes.length === 1 && near(d.keep, cap * cap, 0.004),
    `b2. at 5 yd/s: one sphere ${say(c)} (expected ${cap.toFixed(3)}), two overlapping ${say(d)} (expected ${(cap * cap).toFixed(3)})`);
  console.log(`b2. at 5 yd/s the 0.5 s timer: one sphere keeps ${c.keep.toFixed(3)}, a satellite pair ${d.keep.toFixed(3)}`);
}
// 3. rising and falling
{
  const path = arc({ carry: 200, apex: 25, v: 40, roll: 20 }), yAt = (x) => { const i = path.findIndex((p) => p[0] >= x); return path[i][1]; };
  const [up] = along([mk("u", 50, 0, { t: [], c: [sph(yAt(50) + BALL_R, 3)] })]), [down] = along([mk("d", 150, 0, { t: [], c: [sph(yAt(150) + BALL_R, 3)] })]);
  const cu = treeCheck(path, [up], { k: 1, carry: 200, aim: 0, ballZ: 0 }), cd = treeCheck(path, [down], { k: 1, carry: 200, aim: 0, ballZ: 0 });
  const exitU = cu.passes[0]?.out ?? 0, exitD = cd.passes[0]?.out ?? 0;
  const flatU = (200 - exitU) * (1 - cu.keep) + 20 * (1 - cu.keep * cu.keep), flatD = (200 - exitD) * (1 - cd.keep) + 20 * (1 - cd.keep * cd.keep);
  ok(cu.kind === "canopy" && cd.kind === "canopy" && cu.lossYd > flatU + 1 && near(cd.lossYd, flatD, 0.01),
    `b3. rising ${say(cu)} (horizontal alone ${flatU.toFixed(1)}), falling ${say(cd)} (${flatD.toFixed(1)})`);
  console.log(`b3. a 200 yd arc (apex 25) through a leaf sphere r 3: rising at 50 yd ${cu.lossYd.toFixed(1)} yd short (the horizontal loss alone ${flatU.toFixed(1)}), falling at 150 yd ${cd.lossYd.toFixed(1)} (${flatD.toFixed(1)})`);
}
// 4. open sheets
{
  const bands = { type: "bands", c: [0, 0], u0: 8, du: 2, r: [6, 6, 6], mat: "palm_leaf", cover: 0.55 };
  const [t] = along([mk("p", 50, 0, { t: [], c: [bands] }, { kind: 6 })]);
  const c = check(level(at(11)), [t]), d = check(level(at(11), 100, 5), [t]);
  const slowTicks = Math.ceil((2 * 0.056 * TICK_HZ) / (5 * M_PER_YD));
  ok(c.kind === "canopy" && c.sheets && c.p === 0.55 && near(c.keep, PALM_KEEP, 1e-9) && d.kind === "canopy" && near(d.keep, Math.pow(PALM_KEEP, slowTicks), 1e-9) && slowTicks === 6,
    `b4. palm sheets: at 40 yd/s ${say(c)}, at 5 yd/s ${say(d)} (${slowTicks} ticks)`);
  console.log(`b4. palm-leaf sheets: at 40 yd/s ${say(c)}; at 5 yd/s keep ${d.keep.toFixed(3)} (${slowTicks} ticks touching)`);
}
// 5. trunks
{
  const R = 0.5, trunk = { t: [[0, 0, -1, R, 0, 0, 10, R]], c: [] };
  const [t] = along([mk("k", 30, 0, trunk)]), [t1] = along([mk("k", 30, R + BALL_R + 0.05, trunk)]);
  const c = check(level(at(2)), [t]), d = check(level(at(2)), [t1]);
  ok(c.kind === "trunk" && near(c.at, 30 - R - BALL_R, 0.02) && c.margin < 0 && c.keep === 1 && d.kind !== "trunk", `b5. a trunk on the line: ${say(c)}; 0.05 yd clear of it: ${say(d)}`);
  // a thin limb across the line between two samples (they fall every 0.5 yd: 30.0 and 30.5)
  const limb = { t: [[-3, 0, 2, 0.05, 3, 0, 2, 0.05]], c: [] };   // east-west: across a line running north
  const [tl] = along([mk("l", 30.25, 0, limb)]);
  const e = check(level(at(2)), [tl]);
  ok(e.kind === "trunk" && near(e.at, 30.25 - 0.05 - BALL_R, 0.02), `b5. a 0.05 yd limb across the path between two samples: ${say(e)}`);
  console.log(`b5. a trunk r ${R} on the line at 30 yd: ${say(c)}; 0.05 yd clear: ${d.kind}; a 0.05 yd limb across the path at 30.25 yd: ${say(e)}`);
}
// 6. limbs inside a crown, and ON_PATH
{
  // a crown r 5 at 10 yd up with a vertical limb `ahead` yd past its middle along the line
  const crown = (ahead, r = 0.3) => ({ t: [[0, 0, 0, 0.6, 0, 0, 8, 0.6], [0, -ahead, 9, r, 0, -ahead, 11, r]], c: [sph(10, 5)] });
  const [t] = along([mk("c", 50, 0, crown(-3))]);   // the limb 3 yd before the middle: 2 yd inside
  const c = check(level(at(10)), [t]);
  const k2 = Math.pow(LEAF_KEEP, ((2 + BALL_R - 0.3 - BALL_R) / 40) * TICK_HZ);
  ok(c.kind === "trunk" && near(c.at, 47 - 0.3 - BALL_R, 0.05) && near(c.keep, k2, 0.015) && c.keep >= ON_PATH && c.passes.length === 1, `b6. a limb 2 yd inside a crown: ${say(c)} (keep to it ${k2.toFixed(3)})`);
  const [t2] = along([mk("c", 50, 0, crown(4))]);    // 9 yd inside, at 20 yd/s
  const d = check(level(at(10), 100, 20), [t2]);
  ok(d.kind === "canopy" && d.tree === "c", `b6. a limb 9 yd inside at 20 yd/s: ${say(d)} (the crown takes more than ${ON_PATH} before it)`);
  // a heavy pass, then another tree's trunk on the line: not reached
  const [ta, tb] = along([mk("a", 30, 0, { t: [], c: [sph(10, 5)] }), mk("b", 60, 0, { t: [[0, 0, -1, 0.5, 0, 0, 20, 0.5]], c: [] })]);
  const e = check(level(at(10), 100, 10), [ta, tb]);
  ok(e.kind === "canopy" && e.tree === "a" && e.keep < ON_PATH, `b6. a pass that keeps under ${ON_PATH}, then a trunk: ${say(e)}`);
  const f = check(level(at(10), 100, 80), [ta, tb]);
  ok(f.kind === "trunk" && f.tree === "b" && f.passes.length === 1 && f.passes[0].tree === "a", `b6. a pass that keeps over ${ON_PATH}, then a trunk: ${say(f)}`);
  console.log(`b6. a limb 2 yd inside a crown: ${say(c)}; 9 yd inside at 20 yd/s: ${d.kind} (keep ${d.keep.toFixed(3)}); a crown then a trunk at 10 yd/s: ${e.kind} ${e.tree}, at 80 yd/s: ${f.kind} ${f.tree}`);
}
// 7. grazes, over, under, beside; the cone
{
  const [t] = along([mk("g", 98, 0, { t: [], c: [sph(10, 5)] })]);
  const g = check(level(at(14.9)), [t]);   // through the top, 2 yd from the end of the path
  ok(g.kind === "over" && g.margin < 0 && g.lossYd < CLIP_YD && g.passes.length === 1, `b7. a graze: ${say(g)}`);
  const [s] = along([mk("s", 50, 0, { t: [], c: [sph(10, 5)] })]), [sb] = along([mk("s", 50, 7, { t: [], c: [sph(10, 5)] })]);
  const o = check(level(at(16)), [s]), u = check(level(at(4)), [s]), b = check(level(at(10)), [sb]);
  ok(o.kind === "over" && near(o.margin, 1 - BALL_R, 0.01) && u.kind === "under" && near(u.margin, 1 - BALL_R, 0.01) && b.kind === "clear" && near(b.margin, 2 - BALL_R, 0.01),
    `b7. over ${say(o)}, under ${say(u)}, beside ${say(b)}`);
  const cone = { type: "cone", c: [0, 0], u0: 2, u1: 20, r0: 4 };
  const [cn] = along([mk("n", 50, 2, { t: [], c: [cone] }, { kind: 3 })]);
  const q = check(level(at(15)), [cn]), top = 2 + 18 * (1 - 2 / (4 + BALL_R));
  ok(q.kind === "over" && near(q.margin, 15 - top, 0.01), `b7. beside a cone's upper part, inside its base radius: ${say(q)} (expected over by ${(15 - top).toFixed(2)})`);
  console.log(`b7. a graze ${g.lossYd.toFixed(2)} yd short: ${g.kind} by ${f2(g.margin)}; a sphere r 5: over ${f2(o.margin)}, under ${f2(u.margin)}, beside ${f2(b.margin)}; a cone 2 yd off its axis at 15 yd up: ${q.kind} by ${f2(q.margin)}`);
}
// 8. the templates on the solver's flights
const ask = (clubs, dist, ctx = {}) => solve(clubs, { dist, windSpeed: 0, relWindDeg: 0, lie: "tee", hole: 0, stroke: 1 }, [], ctx);
const T = (s, l, kind = 2, sx = 1, sy = sx, id = "t") => ({ id, kind, sx, sy, z: 0, s, l });
{
  const on = ask(DEFAULT_CLUBS, 120, { trees: [T(60, 0, 2, 2.5)] }), off = ask(DEFAULT_CLUBS, 120, { trees: [T(60, 40, 2, 2.5)] });
  ok(on.recs.length > 0 && on.recs.every((r) => r.tree && ["canopy", "trunk"].includes(r.tree.kind) && r.tree.shape === "broadleaf" && r.tree.alt === null) && off.recs.every((r) => r.tree === null),
    `b8. a broadleaf 2.5 at 60 yd: ${on.recs.map((r) => `${r.club.name} ${r.tree ? r.tree.kind : "clean"}`).join(", ")}; 40 yd off the line: ${off.recs.map((r) => (r.tree ? r.tree.kind : "clean")).join(", ")}`);
  console.log(`b8. a template broadleaf 2.5 on the line at 60 yd, a 120 yd solve: ${on.recs.map((r) => `${r.club.name} ${r.power.toFixed(2)} ${r.tree.kind} at ${r.tree.at.toFixed(0)}`).join(", ")}`);
}

// ---- c. treesAlong ----
{
  const scale = 2, ball = { x: 0.5, y: 0.5 }, ground = (x) => 10 + (x - 0.5) * 100;   // rises 1 yd per 0.01 east
  const m = (id, dx, dy, extra = {}) => ({ id, x: 0.5 + dx / MAP_W, y: 0.5 + dy / MAP_H, ...extra });
  const col = { t: [[0, 0, 0, 0.5, 0, 0, 8, 0.5]], c: [sph(10, 5, 10, 0)] };   // the crown 10 yd east of its trunk
  const markers = [
    m("n", 0, -20, { auto: true, kind: 2, size: 2, sy: 2.5, z: 13, col }),   // 20 px north
    m("e", 20, 0, { auto: true, kind: 3, size: 2.3, sy: 2.4, z: 9 }),         // 20 px east, no col
    m("off", 0, -30, { auto: true, kind: 2, size: 2, sy: 2, z: 10, off: true, col }),
    m("seed", 0, -40, { auto: true }),                                         // a v13 seed
    m(7, -10, -10),                                                            // the player's own
  ];
  const at0 = treesAlong(markers, { ball, bearing: 0, scale, groundAt: ground }), at90 = treesAlong(markers, { ball, bearing: 90, scale, groundAt: ground });
  const get = (list, id) => list.find((t) => t.id === id), eq = (a, b) => Math.abs(a - b) < 1e-9;
  ok(at0.length === 4 && get(at0, "off") && !get(at0, "seed"), `c. kept ${at0.map((t) => t.id).join(", ")}, expected n, e, off, 7`);
  ok(eq(get(at0, "n").s, 40) && eq(get(at0, "n").l, 0) && eq(get(at0, "e").s, 0) && eq(get(at0, "e").l, 40), "c. bearing 0: north is ahead, east is right");
  ok(eq(get(at90, "e").s, 40) && eq(get(at90, "e").l, 0) && eq(get(at90, "n").l, -40), "c. bearing 90: east is ahead, north is left");
  const p0 = get(at0, "n").g.parts[0], p90 = get(at90, "n").g.parts[0];
  ok(eq(p0.s, 0) && eq(p0.l, 10) && eq(p90.s, 10) && eq(p90.l, 0) && eq(p0.rh, 5 + BALL_R), `c. the crown 10 yd east: at bearing 0 (${p0.s}, ${p0.l}), at 90 (${p90.s}, ${p90.l})`);
  const tE = get(at0, "e").g, tpl = templateCol(3, 2.3, 2.4);
  ok(tE.parts.length === tpl.c.length && eq(tE.parts[0].r0, tpl.c[0].r0 + BALL_R) && eq(tE.tHi, Math.max(tpl.t[0][2] + tpl.t[0][3], tpl.t[0][6] + tpl.t[0][7]) + BALL_R), "c. a marker without col is its family's template");
  const own = get(at0, 7);
  ok(own.own && own.kind === OWN_TREE.kind && own.sx === OWN_TREE.sx && own.sy === OWN_TREE.sy && eq(own.z, ground(markers[4].x) - 10) && eq(own.s, 20) && eq(own.l, -20), `c. the player's marker: ${JSON.stringify({ ...own, g: undefined })}`);
  ok(eq(get(at0, "n").z, 3) && get(at0, "n").sy === 2.5 && eq(get(at0, "e").z, -1) && get(at0, "e").kind === 3, "c. z against the ball's ground, sy and kind carried");
  ok(treesAlong(markers, { ball, bearing: 0, scale, groundAt: () => null }) === null, "c. no height at the ball: null");
}

// ---- d. hole 7 and hole 19 over the committed terrain ----
const bearingTo = (a, b) => ((Math.atan2((b.x - a.x) * MAP_W, -(b.y - a.y) * MAP_H) * 180) / Math.PI + 360) % 360;
const holeOf = (n) => ({ n, d: DERIVED[n], t: parseTerrain(readFileSync(join(root, `public/terrain/h${String(n).padStart(2, "0")}.bin`))), markers: markersOf(n), tee: NP[n].tees.teeObj });
const lineCtx = ({ d, t, markers }, ball, bearing) => {
  const th = (bearing * Math.PI) / 180, at = (yd) => [ball.x + (Math.sin(th) * yd) / d.scale / MAP_W, ball.y - (Math.cos(th) * yd) / d.scale / MAP_H];
  const h0 = heightAt(t, ball.x, ball.y);
  return { surfaceAt: (yd) => lieOf(classAt(t, ...at(yd))), heightAt: (yd) => { const h = heightAt(t, ...at(yd)); return h == null ? null : h - h0; }, ballLift: 0,
    trees: treesAlong(markers, { ball, bearing, scale: d.scale, groundAt: (x, y) => heightAt(t, x, y) }) };
};
const DRIVE = arc({ carry: 240, apex: 23, v: 40, roll: 25 });
const drive = (ctx) => treeCheck(DRIVE, ctx.trees, { k: 1, carry: 240, aim: 0, ballZ: 0 });
const h7 = holeOf(7);
{
  const { tee } = h7;
  const lines = NP[7].cups.map((c) => { const b = bearingTo(tee, c); return `c${c.k} (${b.toFixed(1)} deg): ${say(drive(lineCtx(h7, tee, b)))}`; });
  const twin = NT.holes[7].trees.find((t) => t.nss.wsr?.id === "t7-18");
  ok(twin && twin.id === "t7-43" && twin.nss.source === "actor" && !twin.off, `d. H7: WSR's t7-18 is NSS's ${twin?.id} (${twin?.nss.kind})`);
  const m = h7.markers.find((x) => x.id === twin.id), b18 = bearingTo(tee, m), s18 = Math.hypot((m.x - tee.x) * MAP_W, (m.y - tee.y) * MAP_H) * h7.d.scale;
  const hit = drive(lineCtx(h7, tee, b18));
  ok(hit.kind === "canopy" && hit.tree === twin.id && hit.at > s18 - 25 && hit.at < s18, `d. H7 the drive into ${twin.id}: ${say(hit)}`);
  let first = null;
  for (let k = 1; k <= 80 && !first; k++) {
    const c = drive(lineCtx(h7, tee, b18 + k * 0.25));
    if (c.kind === "clear" || c.kind === "over" || c.kind === "under") first = { deg: k * 0.25, off: s18 * Math.tan((k * 0.25 * Math.PI) / 180), c };
  }
  ok(first && first.off > 10 && first.off < 25 && first.c.tree === twin.id, `d. H7 the first clean drive right of ${twin.id}: ${first ? `+${first.deg} deg, ${first.off.toFixed(1)} yd, ${say(first.c)}` : "none"}`);
  console.log(`H7 from GlfTeeOBJ, a drive (carry 240, apex 23): ${lines.join("; ")}. Into ${twin.id} (WSR's t7-18, ${twin.nss.kind} ${twin.size}, ${s18.toFixed(0)} yd out at ${b18.toFixed(1)} deg): ${say(hit)}; clean from +${first?.deg} deg, ${first?.off.toFixed(1)} yd right of it (${first ? say(first.c) : ""})`);
  // the solver's own flights on the line to c0, printed
  const c0 = lineCtx(h7, tee, bearingTo(tee, NP[7].cups[0]));
  console.log(`  the solver's flights to c0: ${DEFAULT_CLUBS.map((cl) => { const f = flightOf(cl, 4, 0, c0); return `${cl.name} ${say(treeCheck(f.path, c0.trees, { ...f, aim: 0 }))}`; }).join("; ")}`);
}
const h19 = holeOf(19);
{
  const ball = { x: 0.6, y: 0.43 }, cup = NP[19].cups[0], b = bearingTo(ball, cup), dist = Math.round(Math.hypot((cup.x - ball.x) * MAP_W, (cup.y - ball.y) * MAP_H) * h19.d.scale);
  const ctx = lineCtx(h19, ball, b), o = ask(DEFAULT_CLUBS, dist, ctx);
  console.log(`H19 corner cut: from (${ball.x}, ${ball.y}, ${lieOf(classAt(h19.t, ball.x, ball.y))}) to c0, ${dist} yd: ${o.recs.map((r) => `${r.club.name} ${r.power.toFixed(2)}${r.tree ? ` (${r.tree.kind} ${r.tree.id})` : ""}`).join(", ")}`);
}
// derived.json's trees and the merge
{
  const withCol = Object.values(DERIVED).some((d) => d.trees?.some((t) => t.col));
  if (withCol) {
    const diff = [];
    for (let n = 1; n <= 21; n++) {
      const D = DERIVED[n].trees ?? [], N = NT.holes[n].trees;
      if (D.length !== N.length) { diff.push(`H${n} ${D.length} vs ${N.length}`); continue; }
      N.forEach(({ id, nss, ...t }, k) => { for (const [f, v] of Object.entries(t)) if (JSON.stringify(D[k][f]) !== JSON.stringify(v)) { diff.push(`${id}.${f}`); break; } });
    }
    ok(diff.length === 0, `d. derived.json's trees are not tools/nss-trees.json's: ${diff.slice(0, 6).join(", ")}`);
    const meta = applyDerivedHole({ green: {}, markers: [], pins: [] }, 7, DERIVED[7], { fresh: true });
    const carried = meta.markers.filter((x) => x.auto && x.col).length;
    if (!carried) console.log("NOTE: src/derivedMerge.js does not carry col into the tree markers (TREE_FIELDS): the app checks NSS's trees as their family's template until it does");
    console.log(`derived.json ships NSS's trees with col on all 21 holes; the merge carries col on ${carried} of H7's ${meta.markers.filter((x) => x.auto).length} markers`);
  } else console.log("NOTE: derived.json still ships WSR's trees without col (build-derived wires tools/nss-trees.json); the checks above read tools/nss-trees.json");
}

// ---- e. solve's contract, determinism and the budget ----
// the budget: tools/test-solver.mjs's for NSS's flown solve (h8), 40 ms
const SOLVE_BUDGET_MS = 40;
{
  const strip = (o) => JSON.stringify(o.recs.map((r) => ({ ...r, club: r.club.id })));
  const lvl = { heightAt: () => 0, surfaceAt: () => "fairway" };
  for (const ctx of [lvl, {}]) {
    const base = ask(DEFAULT_CLUBS, 140, ctx), none = ask(DEFAULT_CLUBS, 140, { ...ctx, trees: [] }), far = ask(DEFAULT_CLUBS, 140, { ...ctx, trees: [T(60, 60), T(450, 0)] });
    ok(strip(base) === strip(none) && strip(base) === strip(far) && base.recs.every((r) => r.tree === null), `e. trees absent, empty or far off the line change the recs (${ctx.heightAt ? "level profile" : "flat"})`);
  }
  // each rec's tree against its own check
  const c0 = lineCtx(h7, h7.tee, bearingTo(h7.tee, h7.markers.find((m) => m.id === "t7-43")));
  let checked = 0, bad = [];
  for (let d = 120; d <= 260; d += 20) {
    const o = ask(DEFAULT_CLUBS, d, c0), o0 = ask(DEFAULT_CLUBS, d, { ...c0, trees: null });
    for (const r of o.recs) {
      const f = flightOf(r.club, r.power, 0, c0), c = treeCheck(f.path, c0.trees, { ...f, aim: r.aim }), hitK = c.kind === "canopy" || c.kind === "trunk";
      const r0 = o0.recs.find((x) => x.club.id === r.club.id);
      checked++;
      if (hitK !== !!r.tree || (r.tree && (r.tree.kind !== c.kind || r.tree.id !== c.tree)) || (r0 && Math.abs(r.score - r0.score - (hitK ? TREE_PENALTY : 0)) > 1e-9)) bad.push(`${d} ${r.club.id}`);
    }
  }
  ok(checked > 0 && bad.length === 0, `e. recs whose tree disagrees with their own check: ${bad.join(", ")}`);
  const a = ask(DEFAULT_CLUBS, 200, c0), b = ask(DEFAULT_CLUBS, 200, c0);
  const f = flightOf(DEFAULT_CLUBS[1], 3.3, 0, c0), x = treeCheck(f.path, c0.trees, { ...f, aim: 3 }), y = treeCheck(f.path, c0.trees, { ...f, aim: 3 });
  ok(strip(a) === strip(b) && JSON.stringify(x) === JSON.stringify(y), "e. the check is not deterministic");
  for (const [n, H] of [[7, h7], [19, h19]]) {
    const ctx = lineCtx(H, H.tee, bearingTo(H.tee, NP[n].cups[0]));
    for (let d = 40; d <= 300; d += 20) ask(DEFAULT_CLUBS, d, ctx);
    const ts = [];
    for (let rep = 0; rep < 2; rep++) for (let d = 40; d <= 300; d += 5) { const t0 = performance.now(); ask(DEFAULT_CLUBS, d, ctx); ts.push(performance.now() - t0); }
    ts.sort((p, q) => p - q);
    const mean = ts.reduce((s, v) => s + v, 0) / ts.length, p90 = ts[Math.floor(ts.length * 0.9)];
    ok(mean < SOLVE_BUDGET_MS && p90 < SOLVE_BUDGET_MS, `e. H${n}: a 7-club solve with ${ctx.trees.length} trees takes ${mean.toFixed(2)} ms mean, ${p90.toFixed(2)} p90 (budget ${SOLVE_BUDGET_MS})`);
    console.log(`budget: H${n}'s tee line to c0 with its ${ctx.trees.length} trees, a 7-club solve ${mean.toFixed(2)} ms mean, ${p90.toFixed(2)} p90, ${ts[ts.length - 1].toFixed(2)} max over ${ts.length} (budget ${SOLVE_BUDGET_MS} ms)`);
  }
}

// ---- f. the parser ----
try {
  const { parse } = createRequire(join(root, "package.json"))("@babel/parser");
  for (const f of ["src/trees.js", "src/model.js", "src/App.jsx"]) {
    if (!existsSync(join(root, f))) { ok(false, `${f} missing`); continue; }
    try { parse(readFileSync(join(root, f), "utf8"), { sourceType: "module", plugins: ["jsx"] }); }
    catch (e) { ok(false, `${f} does not parse: ${e.message}`); }
  }
  console.log("parse: trees.js, model.js, App.jsx");
} catch { console.log("parse: skipped (no @babel/parser here)"); }

console.log(fails ? `${fails} FAILURES` : "all tree checks passed");
process.exit(fails ? 1 : 0);
