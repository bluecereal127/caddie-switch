// Acceptance for public/course3d v2 (tools/build-course3d.mjs: NSS's collision for
// the live solver) and for the course tools/lib/nss3d.mjs makes of it for NSS's
// ball (src/nsssim.js), on the committed files: the index (21 holes, sizes,
// SHA-1s), the attributes (every one mapped, no cup walls or bottoms left: each cup
// is closed by its cover), the six cups (the green at the pin's height under each,
// within 0.1 px of tools/nss-pins.json's map spot through the shipped registration,
// and of derived.json's; the cup in play opened: a ball dropped into it is holed,
// one dropped onto another cup rests on its cover), the difficult cups, the online
// platform's seven spots per tier (within 0.05 px of tools/nss-platform.json's, L2
// left of R2 facing the green, high = low + 3.5 m back and 1.568 m up) and its
// decks (the dump's collision objects, when the dump is there; a ball on each
// tier rests on its mat), H3's sea, the TreeLeaf canopies on every hole, the actor
// trees (nss3d.mjs's shapes at NSS's bones; their templates the per-kind medians of
// the dump's trees.json when it is there), and the trees in play: of the on-course
// trees of derived.json 20-230 yd from the tee (the NSS tree within 1 map px of it)
// that a 3-iron toward them at one of five powers reaches (passes within 15 m of,
// before the stroke ends: not OB first, nor short), at least 80 % are met there (a
// trunk, a canopy or fronds within 15 m); then synthetic courses for the surfaces (crossing air OB is OB, a rest on
// sand OB is OB, water is water, a trunk stops a putt and drops a flight at it, a
// leaf volume and a palm-leaf card damp a flight, a rest on rock is out of play
// for the solver, the putter past full power), and a solve from each tier.
//   node tools/test-course3d.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as L from "../src/live3d-core.js";
import * as S from "../src/nsssim.js";
import { KIND_TEMPLATES, PLATFORM_DECKS, ATTR_OF_MODEL } from "./lib/nss3d.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "public/course3d");
const DUMP = path.join(ROOT, "tools/harness/state/eden/nss-golf-x");
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const NSSP = read(path.join(ROOT, "tools/nss-pins.json")), NSSPL = read(path.join(ROOT, "tools/nss-platform.json"));
const DERIVED = read(path.join(ROOT, "public/derived.json"));
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log(`FAIL ${m}`); } };
const okp = (c, m) => { ok(c, m); if (c) console.log(`ok ${m}`); };
const hh = (n) => String(n).padStart(2, "0");
const pxOff = (f, x, y) => Math.sqrt(((f[0] - x) * 250) ** 2 + ((f[1] - y) * 304) ** 2);
const GROUND_ATTRS = new Set([1, 2, 3, 4, 6, 7, 9, 12, 17, 18]), TREE_ATTRS = new Set([19, 20, 21]);
const NSS_MAPPED = [5, 6, 7, 8, 10, 18, 24, 25, 32, 34, 36, 37, 39, 40, 43, 44];

// ---- the index ----
const idx = read(path.join(DIR, "index.json"));
ok(idx.version === 2 && idx.src === "nss", `index: version ${idx.version}, src ${idx.src}`);
ok(Object.keys(idx.holes).length === 21 && Array.from({ length: 21 }, (_, i) => idx.holes[i + 1]).every(Boolean), `index: ${Object.keys(idx.holes).length} holes`);
ok(NSS_MAPPED.every((c) => idx.attrMap[c] != null) && idx.attrMap[30] == null && idx.attrMap[31] == null, "index: every NSS code mapped, the cup walls (30) and bottoms (31) not");
ok(Object.values(idx.attrMap).every((a) => ATTR_OF_MODEL[a] != null), "every model attribute has the ball's attribute (nss3d.mjs ATTR_OF_MODEL)");
ok(!fs.existsSync(path.join(DIR, "palm.bin")), "no v1 palm.bin left");
ok(idx.source?.trees && !idx.missing, `index: built from trees.json (${idx.source?.trees ?? "none"}) with nothing missing${idx.missing ? ` (missing: ${idx.missing.join("; ")})` : ""}`);
const stats = [], treeRows = [];
let pinMax = 0, derivedMax = 0, derivedHoles = 0, slotMax = 0, groundMax = 0, tAll = 0;
let treeAimed = 0, treeReached = 0, treeMet = 0, treeNoNss = 0, actorAll = 0, cupsOpen = 0, coversShut = 0;
const KINDS = new Set([2, 3, 6]);
const courses = {};
for (let hole = 1; hole <= 21; hole++) {
  const e = idx.holes[hole], binF = path.join(DIR, e.bin), meta = read(path.join(DIR, e.json));
  const buf = fs.readFileSync(binF);
  ok(buf.length === e.bytes && crypto.createHash("sha1").update(buf).digest("hex") === e.sha1, `H${hole}: bin size / SHA-1 as index.json lists`);
  ok(meta.version === 2 && meta.hole === hole && meta.bytes === buf.length && meta.nt === e.tris && meta.ntt === e.treeTris, `H${hole}: json agrees with the index`);
  const o = meta.offs, A = new Uint8Array(ab(binF), o.A, meta.nt), TA = new Uint8Array(ab(binF), o.TA, meta.ntt);
  const byAttr = {};
  for (const a of A) byAttr[a] = (byAttr[a] ?? 0) + 1;
  for (const a of TA) byAttr[a] = (byAttr[a] ?? 0) + 1;
  ok([...A].every((a) => GROUND_ATTRS.has(a)) && [...TA].every((a) => TREE_ATTRS.has(a)), `H${hole}: ground attrs ${Object.keys(byAttr).filter((a) => !TREE_ATTRS.has(+a))}, tree attrs ${Object.keys(byAttr).filter((a) => TREE_ATTRS.has(+a))}`);
  ok(byAttr[6] > 0 && byAttr[19] > 0, `H${hole}: green and trunks present`);
  ok(idx.source[hole]?.leaf && byAttr[20] > 0 && meta.counts.leaf > 0, `H${hole}: its TreeLeaf canopies (${byAttr[20] ?? 0} leaf triangles kept of ${meta.counts.leaf})`);
  // the actor trees: NSS kinds with a bone's position and scale
  const ids = new Set(meta.trees.map((t) => t.id));
  ok(meta.trees.length > 0 && ids.size === meta.trees.length && meta.trees.every((t) => KINDS.has(t.kind) && t.src === "actor" && KIND_TEMPLATES[t.nss] && [t.x, t.base, t.z].every(Number.isFinite) && [t.sx, t.sy, t.sz].every((s) => Number.isFinite(s) && s > 0)), `H${hole}: ${meta.trees.length} actor trees, each an NSS kind nss3d.mjs has a shape for, with a bone's position and scale`);
  actorAll += meta.trees.length;
  const t0 = performance.now();
  const C = L.buildCourse(meta, ab(binF));
  const ms = performance.now() - t0;
  tAll += ms;
  courses[hole] = C;
  const { N } = C;
  ok(N.nGround + N.nCover === meta.nt && N.nBaked === meta.ntt && N.trees.length === meta.trees.length, `H${hole}: every triangle in the course (${N.nGround} + ${N.nCover} covers of ${meta.nt}, ${N.nBaked}/${meta.ntt} tree pack, ${N.trees.length} actor trees in ${N.nActor} triangles)`);
  if (hole === 3) ok(idx.source[3]?.water && N.arrays.attr.some((a) => a === S.ATTR.water), "H3: its sea (GolfCourse03Water) is in the course");
  // ---- the trees in play: 3-irons toward each on-course tree; a tree the strokes
  // reach (one passes within 15 m of it before it ends: not OB first, nor short) ----
  {
    const S0 = L.ballAtStart(C, { start: { kind: "local" } });
    const nss = [...meta.trees.map((t) => [t.x, t.z]), ...meta.treeInfo.map((t) => [t.X, t.Z])].map(([X, Z]) => ({ x: (X - meta.O[0]) / 10, z: (Z - meta.O[2]) / 10, f: L.toMap(meta, X, Z) }));
    let hn = 0, hm = 0, hr = 0;
    for (const tr of (DERIVED.holes?.[hole]?.trees ?? []).filter((t) => !t.off)) {
      let s = null, bd = 1;
      for (const q of nss) { const d = pxOff(q.f, tr.x, tr.y); if (d <= bd) { bd = d; s = q; } }
      if (!s) { const [X, Z] = L.toMesh(meta, tr.x, tr.y); const dd = Math.hypot((X - meta.O[0]) / 10 - S0.pos[0], (Z - meta.O[2]) / 10 - S0.pos[2]) / 0.9144; if (dd >= 20 && dd <= 230) treeNoNss++; continue; }
      const dist = Math.hypot(s.x - S0.pos[0], s.z - S0.pos[2]) / 0.9144;
      if (dist < 20 || dist > 230) continue;
      const h = Math.atan2(s.x - S0.pos[0], -(s.z - S0.pos[2])) * 180 / Math.PI;
      let met = false, reached = false;
      for (const pct of [20, 40, 60, 80, 100]) {
        const p = L.shot(C, { pos: S0.pos, lie: S0.lie, club: "3iron", pct, heading: h, trace: 2 });
        if (p.met && Math.hypot(p.met.at[0] - s.x, p.met.at[2] - s.z) <= 15) { met = reached = true; break; }
        reached ||= p.path.some((q) => Math.hypot(q[1] - s.x, q[3] - s.z) <= 15);
      }
      hn++; if (reached) hr++; if (met) hm++;
    }
    treeAimed += hn; treeReached += hr; treeMet += hm;
    treeRows.push(`H${hole} ${hm}/${hr}${hn > hr ? ` (${hn - hr} not reached)` : ""}`);
  }
  // ---- the cups ----
  const cups = NSSP.holes[hole].cups;
  ok(Object.keys(meta.pins).sort().join() === "c0,c1,c2,c3,c4,c5", `H${hole}: pins ${Object.keys(meta.pins)}`);
  const dpins = DERIVED.holes?.[hole]?.pins ?? [], nssDerived = dpins.some((p) => p.src === "nss");
  if (nssDerived) derivedHoles++;
  for (const c of cups) {
    const P = meta.pins[`c${c.k}`], g = L.groundAt(C, P[0], P[2]);
    groundMax = Math.max(groundMax, g ? Math.abs(g.y - P[1]) : Infinity);
    ok(g && g.attr === 6 && Math.abs(g.y - P[1]) <= 0.1, `H${hole} c${c.k}: ground under the pin ${g ? `attr ${g.attr} at ${(g.y - P[1]).toFixed(3)} u` : "none"}`);
    const off = pxOff(L.toMap(meta, P[0], P[2]), c.x, c.y);
    pinMax = Math.max(pinMax, off);
    ok(off <= 0.1, `H${hole} c${c.k}: ${off.toFixed(3)} px from nss-pins.json's spot`);
    if (nssDerived) {
      const d = dpins.find((p) => p.id === `c${c.k}`);
      const dOff = d ? pxOff(L.toMap(meta, P[0], P[2]), d.x, d.y) : Infinity;
      derivedMax = Math.max(derivedMax, dOff);
      ok(dOff <= 0.1, `H${hole} c${c.k}: ${dOff.toFixed(3)} px from derived.json's cup`);
    }
    // the cup in play is open, the others closed: a ball dropped 2 cm over the cup's
    // centre at 3 m/s holes with cup k in play, rests on the cover with another in play
    const q = N.cups[`c${c.k}`], other = `c${(c.k + 1) % 6}`;
    const drop = (key) => S.run({ club: "PT", start: [q.x, q.top + 0.02 + S.BALL_R, q.z], v0: [0, -3, 0], ground: N.ground({ cupKey: key }), cup: key ? { x: N.cups[key].x, y: N.cups[key].y, z: N.cups[key].z } : null });
    const inn = drop(`c${c.k}`), shut = drop(other);
    if (inn.holed) cupsOpen++;
    if (!shut.holed && shut.outcome === "rest" && shut.restAttr === S.ATTR.green && Math.abs(shut.rest[1] - q.top - S.BALL_R) < 0.02) coversShut++;
    ok(inn.holed && !shut.holed && shut.restAttr === S.ATTR.green, `H${hole} c${c.k}: in play a ball dropped into it is ${inn.outcome}; with ${other} in play it rests on the cover (${shut.outcome} on ${S.ATTR_NAME[shut.restAttr]}, ${(shut.rest[1] - q.top).toFixed(3)} m up)`);
  }
  ok(JSON.stringify(meta.difficult) === JSON.stringify(cups.filter((c) => c.difficult).map((c) => c.k)) && Object.values(N.cups).every((q) => q.difficult === meta.difficult.includes(q.k)), `H${hole}: difficult ${meta.difficult}`);
  // ---- the platform ----
  const P = meta.platform, ph = NSSPL.holes[hole];
  ok(P?.tiers?.low?.length === 7 && P.tiers.high?.length === 7, `H${hole}: seven spots per tier`);
  const hFace = L.meshHeading(meta, P.facingDeg), fx = Math.sin(hFace), fz = Math.cos(hFace);
  for (const tier of ["low", "high"]) for (const s of P.tiers[tier]) {
    const ref = ph.tiers[tier].find((p) => p.fromLeft === s.fromLeft), off = pxOff(L.toMap(meta, s.X, s.Z), ref.x, ref.y);
    slotMax = Math.max(slotMax, off);
    ok(off <= 0.05, `H${hole} ${tier} ${s.fromLeft}: ${off.toFixed(3)} px from nss-platform.json's`);
    ok(Math.abs((s.Y - meta.O[1]) / 10 - (ph.origin[1] + NSSPL.tiers[tier].matY)) < 1e-3, `H${hole} ${tier} ${s.fromLeft}: on the mat (${((s.Y - meta.O[1]) / 10).toFixed(4)} m)`);
  }
  const across = (s) => (s.X * -fz + s.Z * fx) / L.YD, along = (s) => (s.X * fx + s.Z * fz) / L.YD;
  for (const tier of ["low", "high"]) {
    const t = P.tiers[tier], R2 = t.find((s) => s.side === "R2"), L2 = t.find((s) => s.side === "L2");
    ok(across(R2) > across(L2) && t.every((s, i) => i === 0 || across(s) > across(t[i - 1])), `H${hole} ${tier}: L2 … R2 run left to right facing the green`);
  }
  for (let i = 0; i < 7; i++) {
    const lo = P.tiers.low[i], hi = P.tiers.high[i];
    const back = (along(lo) - along(hi)) * L.YD / 10, up = (hi.Y - lo.Y) / 10, side = Math.abs(across(lo) - across(hi)) * L.YD / 10;
    ok(Math.abs(back - 3.5) < 0.01 && Math.abs(up - 1.568) < 0.002 && side < 0.01, `H${hole} spot ${i}: high ${back.toFixed(4)} m back, ${up.toFixed(4)} m up, ${side.toFixed(4)} m aside of low`);
  }
  // the ball on each tier, let go, settles on its mat (the deck, GolfObject), 0.05 m up
  for (const tier of ["low", "high"]) {
    const B = L.ballAtStart(C, { start: { kind: "platform", tier, fromLeft: 3, hand: "right" } });
    const p = S.run({ club: "PT", start: B.pos, v0: [0, 0, 0], ground: N.ground({ platform: true }) });
    const mat = N.platformOrigin[1] + (tier === "low" ? 51 : 854) / 512;
    ok(p.outcome === "rest" && p.restAttr === S.ATTR.object && Math.abs(p.rest[1] - mat - S.BALL_R) < 0.002 && Math.abs(B.pos[1] - mat - 0.1) < 1e-9, `H${hole} ${tier}: the ball teed up 0.1 m over its mat settles on it (${S.ATTR_NAME[p.restAttr]}, ${(p.rest[1] - mat).toFixed(4)} m up)`);
  }
  stats.push(`H${hole} ${(e.bytes / 1024).toFixed(0)} KB ${meta.nt}+${meta.ntt} tris ${ms.toFixed(0)} ms`);
}
console.log(`cups: ground at the pin within ${groundMax.toFixed(4)} u, map ${pinMax.toFixed(4)} px from nss-pins.json${derivedHoles ? `, ${derivedMax.toFixed(4)} px from derived.json's (${derivedHoles} holes)` : "; derived.json still carries WSR's pins: its comparison skipped"}; the cup in play holes a dropped ball on ${cupsOpen} of 126, the cover of another stops it on ${coversShut}; platform ${slotMax.toFixed(4)} px`);
console.log(`built 21 courses in ${(tAll / 1000).toFixed(1)} s: ${stats.join("; ")}`);
okp(treeReached >= 180 && treeMet >= 0.8 * treeReached, `trees in play: ${treeMet} of the ${treeReached} on-course trees 20-230 yd from the tee that a 3-iron toward them reaches at one of five powers meet it there (${(100 * treeMet / treeReached).toFixed(1)} %, at least 80 %; the misses pass a stem or a crown by a metre or two between the sampled powers; ${treeAimed - treeReached} of the ${treeAimed} aimed at are past OB or out of its reach; ${actorAll} actor trees on the 21 holes; ${treeNoNss} of derived.json's trees that far out have no NSS tree within 1 px, not flown): ${treeRows.join(", ")}`);

// ---- the dump: the actor trees' templates and the platform's decks ----
const TREES_JSON = path.join(DUMP, "trees.json"), OBJECTS = path.join(DUMP, "collision/objects");
if (fs.existsSync(TREES_JSON)) {
  const T = JSON.parse(fs.readFileSync(TREES_JSON, "utf8").replace(/([:\[,]\s*)-?(?:NaN|Infinity)(?=\s*[,\]}])/g, "$1null"));
  const med = (a) => { const s = [...a].filter(Number.isFinite).sort((p, q) => p - q); return s[(s.length - 1) >> 1]; };
  let worst = 0, n = 0, bad = [];
  for (const [kind, tpl] of Object.entries(KIND_TEMPLATES)) {
    const trees = Object.values(T.holes).flatMap((h) => h.trees).filter((t) => t.source === "actor" && t.kind === kind);
    const rows = { p0: [], p1: [], r: [], a: [], b: [], c: [], cover: [], lo: [], hi: [] }, bins = {};
    for (const t of trees) {
      const s = t.srt.scale, w = t.srt.translate, cap = t.trunk.capsule;
      rows.p0.push((cap.p0[1] - w[1]) / s[1]); rows.p1.push((cap.p1[1] - w[1]) / s[1]); rows.r.push(cap.r / s[0]);
      for (const c of t.canopy) {
        const sh = c.shape;
        if (c.material === "leaf" && sh.type === "spheroid") { rows.a.push((sh.c[1] - w[1]) / s[1]); rows.b.push(sh.rh / s[0]); rows.c.push(sh.rv / s[1]); }
        if (c.material === "leaf" && sh.type === "cone") { rows.a.push((sh.y0 - w[1]) / s[1]); rows.b.push((sh.y1 - w[1]) / s[1]); rows.c.push(sh.r0 / s[0]); }
        if (c.material === "palm_leaf" && c.profile) {
          rows.cover.push(c.fit?.coverXZ);
          const ys = c.profile.map((p) => (p[0] - w[1]) / s[1]);
          rows.lo.push(Math.min(...ys) - 0.5 / s[1]); rows.hi.push(Math.max(...ys) + 0.5 / s[1]);
          for (const [ym, , , r] of c.profile) (bins[Math.round((ym - w[1]) / s[1])] ??= []).push(r / s[0]);
        }
      }
    }
    const cmp = (want, got, tol, what) => { const d = Math.abs(want - got); n++; worst = Math.max(worst, d / tol); if (!(d <= tol)) bad.push(`${kind} ${what} ${want} against ${got}`); };
    cmp(tpl.trunk[0], med(rows.p0), 6e-4, "trunk y0"); cmp(tpl.trunk[1], med(rows.p1), 6e-4, "trunk y1"); cmp(tpl.trunk[2], med(rows.r), 6e-4, "trunk r");
    const leaf = tpl.leaf?.spheroid ?? tpl.leaf?.cone;
    if (leaf) { cmp(leaf[0], med(rows.a), 6e-4, "leaf 0"); cmp(leaf[1], med(rows.b), 6e-4, "leaf 1"); cmp(leaf[2], med(rows.c), 6e-4, "leaf 2"); }
    if (tpl.palm?.lathe) {
      const lat = tpl.palm.lathe, y0 = med(rows.lo), y1 = med(rows.hi);
      cmp(lat[0][0], y0, 1.1e-3, "sheets' foot"); cmp(lat[lat.length - 1][0], y1, 1.1e-3, "sheets' top"); cmp(tpl.palm.cover, med(rows.cover), 1.1e-3, "cover");
      for (const [y, r] of lat.slice(1, -1)) cmp(r, med(bins[y]), 1.1e-3, `sheets at ${y}`);
      ok(lat.length - 2 === Object.keys(bins).map(Number).filter((k) => k > y0 && k < y1).length, `${kind}: a lathe ring per 1-unit band of the sheets`);
    }
  }
  ok(!bad.length, `the actor trees' templates are trees.json's per-kind medians (${n} values, worst ${worst.toFixed(2)} of the rounding${bad.length ? `; ${bad.join("; ")}` : ""})`);
  console.log(`actor tree templates: ${n} values against trees.json, the worst at ${worst.toFixed(2)} of its rounding`);
} else console.log("actor tree templates against trees.json: skipped (no dump)");
if (fs.existsSync(OBJECTS)) {
  const { loadObject } = await import("./lib/nsscol.mjs");
  for (const [name, part] of [["BGOBJ_GlfStartObj", PLATFORM_DECKS.low], ["BGOBJ_GlfStartObjHigh", PLATFORM_DECKS.high]]) {
    const o = loadObject(path.join(DUMP, "collision"), name);
    ok(o.surface.every((c) => c === 40) && part.v.length === o.verts.length && part.v.every((v, i) => v / 512 === o.verts[i]) && part.t.length === o.tris.length && part.t.every((v, i) => v === o.tris[i]), `${name}: nss3d.mjs's deck is the dump's (${o.nv} vertices, ${o.nt} GolfObject triangles)`);
  }
} else console.log("platform decks against the dump: skipped (no dump)");

// ---- synthetic courses: the surfaces ----
// a course3d v2 hole from triangles [[a, b, c, attr]] (NSS metres; attr course3d's),
// no cups, no platform; the map spans +-250 m about the origin
function fake(hole, ground, trees = []) {
  const pack = (list) => {
    const V = new Float32Array(9 * list.length), T = new Uint32Array(3 * list.length), A = new Uint8Array(list.length);
    list.forEach(([a, b, c, at], i) => { V.set([...a, ...b, ...c], 9 * i); T.set([3 * i, 3 * i + 1, 3 * i + 2], 3 * i); A[i] = at; });
    return { V, T, A, n: list.length };
  };
  const G = pack(ground), TP = pack(trees), parts = [["V", G.V], ["T", G.T], ["A", G.A], ["TV", TP.V], ["TT", TP.T], ["TA", TP.A]];
  let size = 0; const offs = {};
  for (const [k, a] of parts) { size = Math.ceil(size / 4) * 4; offs[k] = size; size += a.byteLength; }
  const bin = new ArrayBuffer(size);
  for (const [k, a] of parts) new Uint8Array(bin, offs[k], a.byteLength).set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  const meta = {
    version: 2, src: "synthetic", hole, id: "synthetic", O: [0, 0, 0], unitsPerM: 10, nv: 3 * G.n, nt: G.n, idx: "u32", ntv: 3 * TP.n, ntt: TP.n, tidx: "u32", offs,
    pins: {}, difficult: [], tee: { teeObj: [0, 0, 0] }, platform: null, trees: [], treeInfo: [],
    reg: { m2f: [[1 / 5000, 0, 0.5], [0, 1 / 5000, 0.5]], f2m: [[5000, 0, -2500], [0, 5000, -2500]] },
  };
  return L.buildCourse(meta, bin);
}
const YDM = 0.9144;
// a level plane of one attribute (z toward -: the green's way)
const plane = (attr, y = 0, x0 = -150, x1 = 150, z0 = -600, z1 = 50) => [[[x0, y, z1], [x1, y, z1], [x1, y, z0], attr], [[x0, y, z1], [x1, y, z0], [x0, y, z0], attr]];
// a vertical quad across the line at z, from y0 to y1, x0..x1
const wall = (attr, z, y0, y1, x0 = -50, x1 = 50) => [[[x0, y0, z], [x1, y0, z], [x1, y1, z], attr], [[x0, y0, z], [x1, y1, z], [x0, y1, z], attr]];
// a closed box, its faces outward
const box = (attr, [x0, y0, z0], [x1, y1, z1]) => {
  const q = (a, b, c, d) => [[a, b, c, attr], [a, c, d, attr]];
  return [
    ...q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]), ...q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]),
    ...q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]), ...q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]),
    ...q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]), ...q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]),
  ];
};
const tee = (C) => L.ballAtStart(C, { start: { kind: "local" } });
const fly = (C, club, pct, extra = {}) => { const S0 = tee(C); return L.shot(C, { pos: S0.pos, lie: S0.lie, club, pct, heading: 0, ...extra }); };
const free = fake(900, plane(1));
// air OB: a fence 100 yd out
{
  const p = fly(fake(901, [...plane(1), ...wall(18, -100 * YDM, -5, 100)]), "driver", 100), q = fly(free, "driver", 100);
  okp(p.outcome === "OB" && p.hazard?.kind === "OB" && q.outcome === "rest", `air OB: a driver through the fence is ${p.outcome} (at ${(-p.end[2] / YDM).toFixed(0)} yd; ${q.outcome} without it, carry ${q.carryYd.toFixed(0)} yd)`);
}
// sand OB and water: a rest on sand OB is OB; a ball into water is water
{
  const p = fly(fake(902, [...plane(1, 0, -150, 150, -10, 50), ...plane(17, 0, -150, 150, -600, -10)]), "wedge", 60);
  const w = fly(fake(903, [...plane(1, 0, -150, 150, -10, 50), ...plane(7, 0, -150, 150, -600, -10), ...plane(1, -2)]), "wedge", 60);
  okp(p.outcome === "OB" && p.restLie === "sand OB" && w.outcome === "water", `sand OB: a wedge's rest on it is ${p.outcome} (${p.restLie}); into water: ${w.outcome}`);
}
// a trunk (the tree pack's 19) 8 yd out: a putt into it stops at it; a wall of trunk 40 yd out drops a 7-iron there
{
  const z = -8 * YDM, trunk = box(19, [-0.4, -1, z - 0.4], [0.4, 3, z + 0.4]), green = fake(910, plane(6));
  const p = fly(fake(904, plane(6), trunk), "putter", 100), q = fly(green, "putter", 100);
  const r = fly(fake(905, plane(1), wall(19, -40 * YDM, -1, 60)), "7iron", 100), r0 = fly(free, "7iron", 100);
  okp(q.stopYd > 10 && p.stopYd < 8 && p.met?.part === "trunk" && r.stopYd < 41 && r.met?.part === "trunk" && r0.stopYd > 130, `a trunk: a full putt on a green into one 8 yd out stops at ${p.stopYd.toFixed(1)} yd (${q.stopYd.toFixed(1)} without); a 7-iron into a trunk wall 40 yd out drops at ${r.stopYd.toFixed(1)} yd (${r0.stopYd.toFixed(0)} without)`);
}
// a leaf volume (20) across the flight 40-60 yd out, and a palm-leaf card (21) 40 yd out
{
  const leaf = box(20, [-50, 0, -60 * YDM], [50, 60, -40 * YDM]);
  const p = fly(fake(906, plane(1), leaf), "7iron", 100), q = fly(free, "7iron", 100);
  const c = fly(fake(907, plane(1), wall(21, -40 * YDM, 0, 60)), "7iron", 100);
  okp(p.met?.part === "canopy" && p.carryYd < q.carryYd - 10 && c.met?.part === "fronds" && c.carryYd < q.carryYd - 3 && c.carryYd > p.carryYd, `a canopy: a 7-iron through a leaf volume carries ${p.carryYd.toFixed(1)} yd, through a palm-leaf card ${c.carryYd.toFixed(1)}, through neither ${q.carryYd.toFixed(1)}`);
}
// rock (course3d's wall, 12): a rest on it is out of play for the solver
{
  const C = fake(908, [...plane(1), ...plane(12, 0.02, -15, 15, -70 * YDM, -40 * YDM)]);
  const r = L.solveFrom(C, { ball: { x: 0.5, y: 0.5 }, target: { x: 0.5, y: 0.5 - (55 * YDM * 10) / 5000 }, clubs: ["wedge", "9iron", "7iron"] });
  const rock = r.recs.filter((x) => x.restLie === "rock");
  const any = fly(C, "wedge", 100);
  okp(r.recs.length === 3 && r.recs.every((x) => x.restLie !== "rock" ? x.score < 1000 : x.score >= 1000) && r.recs[0].restLie === "fairway" && r.recs[0].score < 1000, `rock: solving for a target on a rock slab, every rec at rest on rock scores out of play (${rock.length} of ${r.recs.length}), the best rests on ${r.recs[0].restLie} ${r.recs[0].miss.toFixed(1)} yd off (a full wedge: ${any.restLie})`);
}
// the putter past full power: 150 % rolls farther than 100 %
{
  const C = fake(909, plane(6));
  const a = fly(C, "putter", 100), b = fly(C, "putter", 150);
  okp(b.stopYd > a.stopYd * 1.2 && b.power === 1.5, `the putter past full power: ${b.stopYd.toFixed(1)} yd at 150 % against ${a.stopYd.toFixed(1)} at 100 %`);
}

// ---- a solve from each tier (hole 1, its first cup) ----
for (const start of [{ kind: "platform", tier: "low", fromLeft: 3 }, { kind: "platform", tier: "high", side: "R2", hand: "left" }]) {
  const C = courses[1];
  const t0 = performance.now(), r = L.solveFrom(C, { start, cupKey: "c0", windMph: 9, windDeg: 200 }), ms = performance.now() - t0;
  const s = L.platformSpot(C.meta, start);
  ok(r.recs.length === 7 && r.lie === 15 && r.from.kind === "platform" && r.recs.every((x) => Number.isFinite(x.miss) && x.rest.every(Number.isFinite)), `H1 from the ${start.tier} tier: ${r.recs.length} recs, lie ${r.lie}`);
  console.log(`H1 from the ${start.tier} tier (${s.side ?? s.between.join("/")}, ${start.hand ?? "right"}-handed, the ball ${r.from.localX.toFixed(2)} m local x, ${r.D.toFixed(0)} yd): best ${r.recs[0].club} ${r.recs[0].pct} % (${r.recs[0].bars.toFixed(2)} bars), ${r.recs[0].miss.toFixed(1)} yd from the pin (${r.recs[0].restLie}); ${(ms / 1000).toFixed(2)} s`);
}
console.log(fails ? `${fails} of ${checks} checks FAILED` : `all ${checks} checks pass`);
process.exit(fails ? 1 : 0);
