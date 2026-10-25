// NSS's trees for the 2D tree check (src/trees.js), exported from the git-ignored
// eden dump's tree decode into one small committed file:
//
//   node tools/nss-trees-export.mjs [--src tools/harness/state/eden/nss-golf-x]
//                                   [--romfs tools/harness/state/eden/nss-romfs/romfs]
//                                   [--out tools/nss-trees.json]
//
// Input: <src>/trees.json (tools/harness/state/eden/tools/nss-trees.py: every NSS tree of the
// 21 holes with its collision fitted as primitives in the NSS hole frame, trees.md), read with
// the tree verifier's corrections (<src>/verify/trees/verdicts.json, which override the decode),
// placed through the committed tools/nss-registration.json (the one NSS -> map transform,
// INTEGRATION.md D1), and matched against the committed tools/wsr-pins.json for audit.
//
// What reaches the file (the corrections and decisions):
//   - The 36 trees with no collision anywhere near (`source: "none"`: H17 28, H08 4, H03 3, H15 1,
//     all on OB ground; 10 of them stand where WSR has a tree, H3 n3-1 / n3-10 / n3-60 and H17
//     n17-6 / 7 / 9 / 10 / 12 / 15 / 22: WSR collides there, NSS does not) are dropped.
//   - TreeLeaf canopies only where the hole's gameplay scene places the TreeLeaf actor. The
//     course code (0xd52944) formats only "Work/Banc/Scene/GolfDesign_GolfCourse%02d.bcett.json"
//     (0x2e46157 at 0xd529c4 / 0xd5345c / 0xd57a58), the scene with the gameplay actors (the
//     bot locators, the near-pin objects, the tee marks); GolfDesign_GolfCourseNNHub is a
//     scenery-only scene (balloons, kites, the airship: no gameplay actor). Object_BGOBJ_
//     TreeLeafNN is in GolfDesign_GolfCourseNN for holes 1-20 (H16's only there, H12 has no Hub
//     scene) and Object_BGOBJ_TreeLeaf21 only in GolfDesign_GolfCourse21Hub. DECISION: H21's
//     TreeLeaf21 canopies are absent in play, so its 31 TreeLeaf pieces (all on off-course
//     trees, 26 in the frame) are dropped and those trees keep their trunks (the field mesh,
//     loaded by Field_Fld_GolfCourse21 in the gameplay scene) and any field-mesh frond. Not yet
//     checked in play (an Eden run on H21 would settle it). With --romfs and Python the scenes
//     are decoded again (tools/harness/state/eden/tools/byml.py) and must agree with the table.
//   - The 49 broadleaves on H06 3, H07 4, H12 6, H13 10, H16 20, H18 2, H19 4 carry the 6-sphere
//     satellite canopy (main 5.013 sx at 11.022 sy, five satellites 3.377 sx at 8.725 sy, 3.507 sx
//     off the axis; the verifier's correction of trees.md, which had H13 / H16 only): trees.json
//     already fits each sphere on its own, so all six ship as spheroids (checked: 49 trees, those
//     holes, six leaf spheroids each).
//   - The coarse TreeLeaf meshes of H03 / H09 / H14 (80-triangle spheres, vertex radius 6.05 sx;
//     8-sided 16-triangle cones; H14's 32-triangle bushes) ship as fitted per piece (the
//     verifier's own fits agree within 0.8 mm), the facets 0.2-2.2 m inside the vertex sphere; the
//     7 pieces that are the HardWood actor's leaf blob baked (H03 5, H09 2) ship as their
//     spheroid fit like the 319 actor blobs (maxOut up to 1.92 m, 95.9 % line agreement).
//   - Trunks: the stem as trees.json's 2 m stemSegments (no line the trunk triangles stop is
//     missed by them; the single capsule misses 22-29 % of the lines that meet a broadleaf's
//     trunk triangles, mostly limbs above the fork) and, where the trunk forks (broadleaves, 11
//     palms), its limbs; both simplified to tapered capsules (below) that still hold every
//     original capsule. NSS canopies are pass-through (src/trees.js), so a ball flying through a
//     broadleaf's crown can still meet a limb: the limbs matter here, where in WSR the canopy
//     ended the shot first.
//   - Open sheets (palm fronds and the actor conifers' branch sheets, GolfPalmLeaf; H04's and one
//     H21 palm's GolfLeaf fronds) ship as their 1 m band profile about one centre (each band's
//     radius grown by its centre's offset), not the slab / cone envelope that holds them (the
//     actor conifers' branch-sheet cone runs to 25.9 sy where the sheets end at about 19), with
//     coverXZ, the share of the footprint the sheets cover.
//   - The bushes and the ground-level sheets (trees.json otherLeaf: 213 small leaf spheres, all
//     but one on OB ground, and 70 sheets lying on the ground, 61 over bunkers) belong to no
//     tree and are not exported: the check flies the air and the first yards of the bounce, not
//     the roll through a bunker lip.
//   - A tree ships when some part of its collision comes within TREE_MARGIN (0.02) of the map
//     frame: off-course trees included, since NSS collides with every tree it places.
//
// Per tree (`holes[n].trees[k]`, k = the derived marker index, so id "t<hole>-<k>" as
// src/derivedMerge.js numbers them; ordered by the bone's map y, then x):
//   id      "t<hole>-<k>"
//   x, y    the tree's placement (its bone; a boneless trunk's registered template origin) in map
//           fractions, 5 decimals
//   z       the placement's height, yd above the hole's datum (NSS y 0 = public/terrain's datum)
//   kind    the family as the app's tree markers carry it: 2 broadleaf, 3 conifer, 6 palm
//   size    the bone's x scale; sy its y scale (the templates in src/trees.js scale with them)
//   off     true when OB, sand OB or water is under the trunk (1,027 of 1,495)
//   r       the collision footprint's radius (canopy union, or the trunk's when it has none) as a
//           fraction of the map WIDTH; dx, dy its centre's offset from (x, y) as fractions of the
//           width / height (the collision canopy, centred on its trunk within a metre or two: not
//           a painted minimap sprite)
//   col     the collision in yd about (x, y, z): e = east, s = south (map y), u = up
//           t: [[e, s, u, r, e, s, u, r, ...], ...]   the trunk as polylines of tapered capsules,
//                                                    4 numbers a node (bare radii; the stem
//                                                    first, then the limb chains)
//           c: [{ type: "spheroid", c: [e, s, u], rh, rv }    Leaf volume (vertical axis)
//               { type: "cone", c: [e, s], u0, u1, r0 }       Leaf volume (base radius r0 at u0,
//                                                            apex at u1)
//               { type: "bands", c: [e, s], u0, du, r: [...], mat: "palm_leaf" | "leaf",
//                 cover }                                    open sheets: band i spans
//                                                            u0 + i du .. u0 + (i + 1) du]
//   nss     audit: { id (trees.json's n<hole>-<k>), kind (HardWoodA ... PalmTreeB), source
//           (actor / field), unboned?, noTrunk?, dropped? (what a correction removed),
//           wsr: { id, distPx } (the WSR tree of tools/wsr-pins.json, as build-derived numbers its
//           on-map trees, within 1 map px of the bone) or null }
//
// Deterministic: fixed key order, fixed decimals (map fractions 5, yd 2), the input SHA-1s
// recorded; every number is checked finite and the text parses back to the same object
// before anything is written. Refuses (exit 1): a tree whose bone is missing, a canopy shape
// it does not know, an envelope without its profile or cover, a satellite or no-collision count
// that is not the verifier's, a simplified trunk that leaves a decoded piece more than HOLD_EPS
// out, a gameplay scene that disagrees with the TreeLeaf table, an empty hole.
//
// Trunk simplification: the stem's 2 m segments become a chain of nodes (each node's radius the
// larger of its two segments'); the limbs' 0.5 m links become maximal chains through the nodes
// with one link in and one out. Each chain keeps, from each kept node, the furthest node such that
// the nodes between lie inside the tapered capsule to it grown by at most STEM_TOL / LIMB_TOL (0.1
// / 0.15 m), both ends then grown by that excess: 31,262 decoded pieces become 11,060 capsules
// that hold every one of them (checked at 9 points along each, to 17.6 mm).
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { regOf, nssToMap, pxPerM, M_PER_YD, MAP_W, MAP_H } from "./lib/nssreg.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const opt = {
  src: join(ROOT, "tools/harness/state/eden/nss-golf-x"),
  romfs: join(ROOT, "tools/harness/state/eden/nss-romfs/romfs"),
  out: join(ROOT, "tools/nss-trees.json"),
};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i].replace(/^--/, "");
  if (!(k in opt) || argv[i + 1] == null) { console.error(`usage: node tools/nss-trees-export.mjs [--src dir] [--romfs dir] [--out file]`); process.exit(1); }
  opt[k] = resolve(argv[++i]);
}
const die = (msg) => { console.error(`nss-trees-export: ${msg}`); process.exit(1); };
const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");

const TREE_MARGIN = 0.02;          // build-derived's on-map margin (map fractions)
const KIND = { broadleaf: 2, conifer: 3, palm: 6 };
// holes whose gameplay scene GolfDesign_GolfCourseNN.bcett places Object_BGOBJ_TreeLeafNN
// (decoded 2026-10-25 from the 1.5.0 RomFS; H21's is only in GolfDesign_GolfCourse21Hub)
const TREELEAF_IN_PLAY = new Set(Array.from({ length: 20 }, (_, i) => i + 1));
const STEM_TOL = 0.1, LIMB_TOL = 0.15;   // m: how far a merged capsule may grow past the pieces it holds
const HOLD_EPS = 0.02;                   // m: how far a decoded piece may stand out of the simplified trunk
// the verifier's satellite canopies per hole (verify/trees/verdicts.json)
const SAT6 = { 6: 3, 7: 4, 12: 6, 13: 10, 16: 20, 18: 2, 19: 4 };
const NONE_COUNT = 36;

const treesPath = join(opt.src, "trees.json"), regPath = join(ROOT, "tools/nss-registration.json"), wsrPath = join(ROOT, "tools/wsr-pins.json");
for (const p of [treesPath, regPath, wsrPath]) if (!existsSync(p)) die(`missing ${p}`);
const treesBuf = readFileSync(treesPath), regBuf = readFileSync(regPath), wsrBuf = readFileSync(wsrPath);
const TJ = JSON.parse(treesBuf), REG = JSON.parse(regBuf), WSRP = JSON.parse(wsrBuf).holes;
const verdictsPath = join(opt.src, "verify/trees/verdicts.json");
const verdictsSha1 = existsSync(verdictsPath) ? sha1(readFileSync(verdictsPath)) : null;

// ---- the TreeLeaf placement, checked against the RomFS when it and Python are here ----
{
  const byml = join(ROOT, "tools/harness/state/eden/tools/byml.py");
  if (existsSync(opt.romfs) && existsSync(byml)) {
    const found = new Set(), tmp = mkdtempSync(join(tmpdir(), "nss-trees-"));
    let ran = true;
    for (let n = 1; n <= 21; n++) {
      const nn = String(n).padStart(2, "0"), f = join(opt.romfs, `Banc/GolfDesign_GolfCourse${nn}.bcett.byml.zs`), j = join(tmp, `${nn}.json`);
      if (!existsSync(f)) die(`missing ${f}`);
      const r = spawnSync("python", ["-P", byml, f, "--json", j], { encoding: "utf8" });
      if (r.status !== 0 || !existsSync(j)) { ran = false; break; }
      const actors = JSON.parse(readFileSync(j, "utf8"))?.Actors ?? [];
      if (actors.some((a) => a?.Gyaml === `Work/Actor/Object_BGOBJ_TreeLeaf${nn}.engine__actor__ActorParam.gyml`)) found.add(n);
    }
    rmSync(tmp, { recursive: true, force: true });
    if (ran) {
      const a = [...found].sort((p, q) => p - q).join(","), b = [...TREELEAF_IN_PLAY].join(",");
      if (a !== b) die(`the gameplay scenes place TreeLeaf on holes ${a}, the table says ${b}`);
      console.log(`TreeLeaf placement: GolfDesign_GolfCourseNN places Object_BGOBJ_TreeLeafNN on holes 1-20, not 21 (checked against the RomFS)`);
    } else console.log("TreeLeaf placement: the table (Python could not decode the scenes here)");
  } else console.log("TreeLeaf placement: the table (no RomFS here)");
}

// ---- geometry helpers (NSS metres) ----
const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const len = (p) => Math.sqrt(dot(p, p));
// a node's distance to segment a-b and the segment parameter of its closest point
function toSeg(p, a, b) {
  const ab = sub(b, a), L2 = dot(ab, ab);
  const u = L2 > 0 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / L2)) : 0;
  return { u, d: len(sub(p, [a[0] + u * ab[0], a[1] + u * ab[1], a[2] + u * ab[2]])) };
}
// A chain of nodes { p, r } (r = the radius about p that the capsules through it need)
// simplified to a polyline of tapered capsules: from each kept node the furthest node j
// such that every node between lies within the tapered capsule (radius linear along it)
// grown by at most tol; both ends of that piece then grow by its excess, a kept node
// taking the larger growth of its two pieces, so the polyline holds every node's sphere
// (and so the original capsules, whose radius is at most their end nodes').
function simplifyChain(nodes, tol) {
  const keep = [{ p: nodes[0].p, r: nodes[0].r }];
  let a = 0;
  while (a < nodes.length - 1) {
    let best = a + 1, bestGrow = 0;
    for (let j = a + 2; j < nodes.length; j++) {
      let grow = 0;
      for (let m = a + 1; m < j; m++) {
        const { u, d } = toSeg(nodes[m].p, nodes[a].p, nodes[j].p);
        grow = Math.max(grow, d + nodes[m].r - (nodes[a].r + u * (nodes[j].r - nodes[a].r)));
      }
      if (grow > tol) break;
      best = j; bestGrow = Math.max(0, grow);
    }
    keep[keep.length - 1].r = Math.max(keep[keep.length - 1].r, nodes[a].r + bestGrow);
    keep.push({ p: nodes[best].p, r: nodes[best].r + bestGrow });
    a = best;
  }
  return keep;
}
const key3 = (p) => p.map((v) => Math.round(v * 1000)).join(",");
// the stem's 2 m segments as a node chain (a node's radius: the larger of its two segments')
function stemPolyline(segs) {
  if (!segs?.length) return [];
  const nodes = [{ p: segs[0].p0, r: segs[0].r }];
  for (let i = 0; i < segs.length; i++) {
    const nx = segs[i + 1];
    const p = nx ? segs[i].p1.map((v, c) => (v + nx.p0[c]) / 2) : segs[i].p1;
    // two segments that do not quite meet: the node between them grows to hold both ends
    const gap = nx ? len(sub(segs[i].p1, nx.p0)) / 2 : 0;
    nodes.push({ p, r: Math.max(segs[i].r, nx ? nx.r : 0) + gap });
  }
  return [simplifyChain(nodes, STEM_TOL)];
}
// The limbs: capsules linking the 0.5 m bands' nodes (lower p0 to upper p1), and for a node
// with no link below one vertical capsule over its own band (node -/+ a quarter metre).
// Maximal chains through the nodes with one link in and one out, each simplified; an own-band
// capsule joins the chain that starts at its node as a first node a quarter metre below it,
// with the node grown to hold its top.
function limbPolylines(limbs) {
  if (!limbs?.length) return [];
  const isBand = (l) => Math.abs(l.p0[0] - l.p1[0]) < 1e-6 && Math.abs(l.p0[2] - l.p1[2]) < 1e-6 && l.p1[1] > l.p0[1];
  const mid = (l) => [l.p0[0], (l.p0[1] + l.p1[1]) / 2, l.p0[2]];
  const ins = new Map(), outs = new Map();
  const links = limbs.map((l, i) => ({ ...l, i }));
  for (const l of links) {
    const a = key3(l.p0), b = key3(l.p1);
    if (!outs.has(a)) outs.set(a, []); outs.get(a).push(l.i);
    if (!ins.has(b)) ins.set(b, []); ins.get(b).push(l.i);
  }
  // own-band capsules whose middle is a node some link starts from
  const bandAt = new Map();
  for (const l of links) if (isBand(l) && outs.has(key3(mid(l))) && !ins.has(key3(mid(l)))) bandAt.set(key3(mid(l)), l);
  const through = (k) => (ins.get(k)?.length ?? 0) === 1 && (outs.get(k)?.length ?? 0) === 1;
  const used = new Set([...bandAt.values()].map((l) => l.i)), lines = [];
  for (const l of links) {
    if (used.has(l.i) || through(key3(l.p0))) continue;      // chains start where a node is not a pass-through
    let cur = l.i;
    const chain = [];
    for (;;) {
      used.add(cur); chain.push(limbs[cur]);
      const k = key3(limbs[cur].p1);
      if (!through(k)) break;
      const nx = outs.get(k)[0];
      if (used.has(nx)) break;
      cur = nx;
    }
    const nodes = [{ p: chain[0].p0, r: chain[0].r }];
    chain.forEach((ln, j) => nodes.push({ p: ln.p1, r: Math.max(ln.r, chain[j + 1]?.r ?? 0) }));
    const band = bandAt.get(key3(chain[0].p0));
    if (band) {
      // the band's lower half below the node; its upper half (a quarter metre up the first link)
      // is held by growing the node by the band capsule's radius
      nodes[0].r = Math.max(nodes[0].r, band.r + (band.p1[1] - band.p0[1]) / 2);
      nodes.unshift({ p: band.p0, r: band.r });
      bandAt.delete(key3(chain[0].p0));
    }
    lines.push(simplifyChain(nodes, LIMB_TOL));
  }
  // what no chain took (a band capsule whose chain started elsewhere, a closed loop): as it is
  for (const l of links) if (!used.has(l.i) || [...bandAt.values()].includes(l)) lines.push([{ p: l.p0, r: l.r }, { p: l.p1, r: l.r }]);
  return lines;
}

// ---- rounding and the map frame ----
const r2 = (v) => { const x = Math.round(v * 100) / 100; return Object.is(x, -0) ? 0 : x; };
const r5 = (v) => { const x = Math.round(v * 1e5) / 1e5; return Object.is(x, -0) ? 0 : x; };
// an NSS offset (dx, dz) metres -> (east, south) yd on the map (a rotation: a, b = pxPerM (cos, sin))
const offYd = (reg, dx, dz) => {
  const k = pxPerM(reg) * M_PER_YD;
  return [(reg.a * dx - reg.b * dz) / k, (reg.b * dx + reg.a * dz) / k];
};
const YD = (m) => m / M_PER_YD;

// the WSR trees as build-derived numbers them (its on-map filter), for the audit match
function wsrTreesOf(n) {
  const t = WSRP[String(n)]?.trees ?? [];
  return t.filter((w) => w.x >= -TREE_MARGIN && w.x <= 1 + TREE_MARGIN && w.y >= -TREE_MARGIN && w.y <= 1 + TREE_MARGIN)
    .map((w, k) => ({ id: `t${n}-${k}`, x: w.x, y: w.y }));
}

const holesOut = {};
const totals = { holdWorst: -Infinity, decoded: 0, none: 0, noCollision: 0, outside: 0, shipped: 0, off: 0, canopyDropped: 0, capsulesIn: 0, capsulesOut: 0, sat6: {}, families: { 2: 0, 3: 0, 6: 0 }, wsrMatched: 0 };
for (let n = 1; n <= 21; n++) {
  const hk = String(n).padStart(2, "0"), H = TJ.holes?.[hk];
  if (!H?.trees?.length) die(`trees.json has no trees for hole ${n}`);
  const reg = regOf(REG, n), wsr = wsrTreesOf(n), ydpp = 1 / (pxPerM(reg) * M_PER_YD);
  const rows = [];
  for (const t of H.trees) {
    totals.decoded++;
    if (t.source === "none") { totals.none++; continue; }
    if (!KIND[t.family]) die(`${t.id}: family ${t.family}`);
    const bone = t.srt?.translate;
    if (!Array.isArray(bone) || bone.length !== 3 || !bone.every(Number.isFinite)) die(`${t.id}: no placement`);
    const dropped = [];
    // the canopy parts that collide in play
    const parts = (t.canopy ?? []).filter((c) => {
      if (/^Object_BGOBJ_TreeLeaf\d\d/.test(c.source ?? "") && !TREELEAF_IN_PLAY.has(n)) { dropped.push(`${c.source}: TreeLeaf${hk} is not in the gameplay scene`); totals.canopyDropped++; return false; }
      return true;
    });
    // trunk: the stem's segments and the limbs, simplified (metres, world)
    const lines = t.trunk ? [...stemPolyline(t.trunk.stemSegments), ...limbPolylines(t.trunk.limbs)] : [];
    if (t.trunk && !lines.length) die(`${t.id}: a trunk without stem segments`);
    totals.capsulesIn += (t.trunk?.stemSegments?.length ?? 0) + (t.trunk?.limbs?.length ?? 0);
    totals.capsulesOut += lines.reduce((s, l) => s + l.length - 1, 0);
    // the simplified trunk must hold every decoded piece: 9 points along each original capsule's
    // axis, each with that capsule's radius, inside some tapered capsule (to HOLD_EPS)
    for (const c of [...(t.trunk?.stemSegments ?? []), ...(t.trunk?.limbs ?? [])]) {
      for (let q = 0; q <= 8; q++) {
        const p = c.p0.map((v, i) => v + (q / 8) * (c.p1[i] - v));
        let best = Infinity;
        for (const nodes of lines) for (let i = 0; i + 1 < nodes.length; i++) {
          const { u, d } = toSeg(p, nodes[i].p, nodes[i + 1].p);
          best = Math.min(best, d + c.r - (nodes[i].r + u * (nodes[i + 1].r - nodes[i].r)));
        }
        totals.holdWorst = Math.max(totals.holdWorst, best);
        if (best > HOLD_EPS) die(`${t.id}: the simplified trunk leaves a decoded piece ${best.toFixed(3)} m out`);
      }
    }
    if (!lines.length && !parts.length) { totals.noCollision++; continue; }
    // to yd about the placement
    const rel = (p) => { const [e, s] = offYd(reg, p[0] - bone[0], p[2] - bone[2]); return [e, s, YD(p[1] - bone[1])]; };
    // each polyline flat: e, s, u, r per node
    const colT = lines.map((nodes) => nodes.flatMap((nd) => [...rel(nd.p), YD(nd.r)]));
    const colC = [];
    // horizontal discs of every part (e, s, r) for the footprint
    const discs = [];
    for (const c of parts) {
      const S = c.shape;
      if (S.type === "spheroid" && !S.envelope) {
        const [e, s, u] = rel(S.c);
        colC.push({ type: "spheroid", c: [e, s, u], rh: YD(S.rh), rv: YD(S.rv) });
        discs.push([e, s, YD(S.rh)]);
      } else if (S.type === "cone" && !S.envelope) {
        const [e, s] = offYd(reg, S.cx - bone[0], S.cz - bone[2]);
        colC.push({ type: "cone", c: [e, s], u0: YD(S.y0 - bone[1]), u1: YD(S.y1 - bone[1]), r0: YD(S.r0) });
        discs.push([e, s, YD(S.r0)]);
      } else if ((S.type === "slab" || S.type === "cone") && S.envelope) {
        const prof = c.profile;
        if (!Array.isArray(prof) || prof.length < 1) die(`${t.id}: an envelope without its profile`);
        const [e, s] = offYd(reg, S.cx - bone[0], S.cz - bone[2]);
        // bands of 1 m centred on y_mid; each radius grown by its centre's offset from the common one
        const sorted = [...prof].sort((p, q) => p[0] - q[0]);
        const step = sorted.length > 1 ? sorted[1][0] - sorted[0][0] : 1;
        for (let i = 1; i < sorted.length; i++) if (Math.abs(sorted[i][0] - sorted[i - 1][0] - step) > 1e-6) die(`${t.id}: a profile whose bands are not evenly spaced`);
        const rs = sorted.map(([, cx, cz, r]) => YD(r + Math.sqrt((cx - S.cx) ** 2 + (cz - S.cz) ** 2)));
        const cover = c.fit?.coverXZ;
        if (!(cover > 0 && cover <= 1)) die(`${t.id}: an envelope without coverXZ`);
        colC.push({ type: "bands", c: [e, s], u0: YD(sorted[0][0] - step / 2 - bone[1]), du: YD(step), r: rs, mat: c.material === "leaf" ? "leaf" : "palm_leaf", cover });
        discs.push([e, s, Math.max(...rs)]);
      } else die(`${t.id}: canopy shape ${S.type}${S.envelope ? " (envelope)" : ""}`);
    }
    const trunkDiscs = colT.flatMap((pl) => Array.from({ length: pl.length / 4 }, (_, i) => [pl[4 * i], pl[4 * i + 1], pl[4 * i + 3]]));
    if (!discs.length) discs.push(...trunkDiscs);
    // the footprint: the box of the discs' centre, the radius holding every disc
    let e0 = Infinity, e1 = -Infinity, s0 = Infinity, s1 = -Infinity;
    for (const [e, s, r] of discs) { e0 = Math.min(e0, e - r); e1 = Math.max(e1, e + r); s0 = Math.min(s0, s - r); s1 = Math.max(s1, s + r); }
    const fe = (e0 + e1) / 2, fs = (s0 + s1) / 2;
    let fr = 0;
    for (const [e, s, r] of discs) fr = Math.max(fr, Math.sqrt((e - fe) ** 2 + (s - fs) ** 2) + r);
    for (const [e, s, r] of trunkDiscs) fr = Math.max(fr, Math.sqrt((e - fe) ** 2 + (s - fs) ** 2) + r);
    const pos = nssToMap(reg, bone[0], bone[2]);
    const cx = pos.x + fe / ydpp / MAP_W, cy = pos.y + fs / ydpp / MAP_H, rw = fr / ydpp / MAP_W, rh = fr / ydpp / MAP_H;
    if (cx + rw < -TREE_MARGIN || cx - rw > 1 + TREE_MARGIN || cy + rh < -TREE_MARGIN || cy - rh > 1 + TREE_MARGIN) { totals.outside++; continue; }
    // the audit match: the WSR tree within 1 px of the bone
    let wm = null;
    for (const w of wsr) {
      const d = Math.sqrt(((w.x - pos.x) * MAP_W) ** 2 + ((w.y - pos.y) * MAP_H) ** 2);
      if (d <= 1 && (!wm || d < wm.distPx)) wm = { id: w.id, distPx: d };
    }
    rows.push({ t, pos, bone, dropped, colT, colC, fe, fs, fr, wm, ydpp });
  }
  // the satellites check (on the trees.json input, before any drop)
  const sat = H.trees.filter((t) => (t.canopy?.length ?? 0) === 6 && t.canopy.every((c) => c.shape.type === "spheroid" && c.material === "leaf")).length;
  if (sat !== (SAT6[n] ?? 0)) die(`hole ${n}: ${sat} six-sphere canopies, the verifier counts ${SAT6[n] ?? 0}`);
  if (sat) totals.sat6[n] = sat;
  if (!rows.length) die(`hole ${n}: no tree ships`);
  rows.sort((p, q) => p.pos.y - q.pos.y || p.pos.x - q.pos.x || (p.t.id < q.t.id ? -1 : 1));
  holesOut[String(n)] = {
    trees: rows.map(({ t, pos, bone, dropped, colT, colC, fe, fs, fr, wm, ydpp }, k) => {
      totals.shipped++; totals.families[KIND[t.family]]++;
      if (t.off) totals.off++;
      if (wm) totals.wsrMatched++;
      const dx = r5(fe / ydpp / MAP_W), dy = r5(fs / ydpp / MAP_H);
      const nss = { id: t.id, kind: t.kind, source: t.source };
      if (t.unboned) nss.unboned = true;
      if (t.noTrunk) nss.noTrunk = true;
      if (dropped.length) nss.dropped = dropped;
      nss.wsr = wm ? { id: wm.id, distPx: r2(wm.distPx) } : null;
      return {
        id: `t${n}-${k}`, x: r5(pos.x), y: r5(pos.y), z: r2(YD(bone[1])), kind: KIND[t.family],
        size: r2(t.srt.scale[0]), sy: r2(t.srt.scale[1]), ...(t.off ? { off: true } : {}),
        r: r5(fr / ydpp / MAP_W), ...(dx ? { dx } : {}), ...(dy ? { dy } : {}),
        col: {
          t: colT.map((c) => c.map(r2)),
          c: colC.map((c) => c.type === "spheroid" ? { type: c.type, c: c.c.map(r2), rh: r2(c.rh), rv: r2(c.rv) }
            : c.type === "cone" ? { type: c.type, c: c.c.map(r2), u0: r2(c.u0), u1: r2(c.u1), r0: r2(c.r0) }
            : { type: c.type, c: c.c.map(r2), u0: r2(c.u0), du: r2(c.du), r: c.r.map(r2), mat: c.mat, cover: r2(c.cover) }),
        },
        nss,
      };
    }),
  };
}
if (totals.none !== NONE_COUNT) die(`${totals.none} no-collision trees, the verifier counts ${NONE_COUNT}`);

const out = {
  _note: "NSS's trees for the 2D tree check, from the eden dump's trees.json with the tree verifier's corrections: tools/nss-trees-export.mjs (its header has the rules and the fields). Positions in map fractions through tools/nss-registration.json; col in yd about (x, y, z): e east, s south, u up. src/trees.js reads col; tools/build-derived.mjs ships every field but nss as derived.json trees, in this order (ids t<hole>-<k>).",
  source: { treesJsonSha1: sha1(treesBuf), verdictsSha1, registrationSha1: sha1(regBuf), wsrPinsSha1: sha1(wsrBuf), game: "NSS 1.5.0" },
  rules: { treeLeafInPlay: [...TREELEAF_IN_PLAY], margin: TREE_MARGIN, stemTolM: STEM_TOL, limbTolM: LIMB_TOL, ballRadiusM: TJ._meta?.ballRadiusM ?? 0.056 },
  counts: { decoded: totals.decoded, noCollisionDropped: totals.none, emptyAfterDrops: totals.noCollision, outsideFrame: totals.outside, shipped: totals.shipped, off: totals.off,
    broadleaf: totals.families[2], conifer: totals.families[3], palm: totals.families[6], canopyPartsDropped: totals.canopyDropped, satellites: totals.sat6,
    trunkCapsules: { decoded: totals.capsulesIn, shipped: totals.capsulesOut, worstOutsideM: +totals.holdWorst.toFixed(4) }, wsrWithin1px: totals.wsrMatched },
  holes: holesOut,
};
// every number finite, nothing undefined
(function walk(v, at) {
  if (v === undefined) die(`undefined at ${at}`);
  if (typeof v === "number" && !Number.isFinite(v)) die(`${v} at ${at}`);
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
})(out, "out");
// one tree per line keeps the file diffable
const lines = ["{"];
const top = Object.keys(out).filter((k) => k !== "holes");
for (const k of top) lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(out[k])},`);
lines.push(`  "holes": {`);
const hks = Object.keys(holesOut);
hks.forEach((h, i) => {
  lines.push(`    ${JSON.stringify(h)}: { "trees": [`);
  holesOut[h].trees.forEach((t, j) => lines.push(`      ${JSON.stringify(t)}${j < holesOut[h].trees.length - 1 ? "," : ""}`));
  lines.push(`    ] }${i < hks.length - 1 ? "," : ""}`);
});
lines.push("  }", "}");
const text = lines.join("\n") + "\n";
if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(out)) die("the written text does not parse back to the same object");
writeFileSync(opt.out, text);
console.log(`nss-trees: ${totals.shipped} trees on 21 holes (${totals.families[2]} broadleaf, ${totals.families[3]} conifer, ${totals.families[6]} palm; ${totals.off} off course) of ${totals.decoded} decoded: ${totals.none} without collision dropped, ${totals.noCollision} left without collision by the drops, ${totals.outside} beyond the frame; ${totals.canopyDropped} H21 TreeLeaf pieces dropped; six-sphere canopies ${JSON.stringify(totals.sat6)}; trunk capsules ${totals.capsulesIn} -> ${totals.capsulesOut} (every decoded piece held to ${(totals.holdWorst * 1000).toFixed(1)} mm); ${totals.wsrMatched} within 1 px of a WSR tree; ${(text.length / 1024).toFixed(0)} KB -> ${opt.out}`);
