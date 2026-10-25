// node tools/test-merge-tree-fields.mjs [repoRoot]
// derived.json's trees carry kind, size (x scale), sy (y scale), z (base
// height in yd above the hole's datum) and col (NSS's own collision for the
// tree, which src/trees.js flies the ball against) for the flight check;
// src/derivedMerge.js mirrors them onto the auto tree markers. Checked on every
// hole: each auto marker has the five fields with derived.json's values (and
// x, y, r, dy, dx, off as before), the player's own marker is untouched, the
// markers as App.jsx's persist stores them (the auto markers without col,
// through JSON) get col back on the next load, a reload and a fresh
// (wholesale) application change nothing, an install whose stored auto markers
// predate the fields gets them on the next load, and a derived.json without
// them (older pipeline) yields markers without the keys, not undefined values.
// The online platform rides the same merge: derived.json's `platform`
// (public/derived.json's once it ships one, else tools/nss-platform.json's
// hole in its place) is mirrored whole into the hole on every load, a fresh
// application or a reload changes nothing, the loader does not keep it, a
// stored teeOnline is deleted, and a derived.json without `platform` (an
// older pipeline's, with its teeOnline) leaves platform null and no teeOnline.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const { applyDerivedHole } = await import(pathToFileURL(join(root, "src/derivedMerge.js")).href);
const NEW = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes;
const emptyGreen = () => ({ box: null, grid: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [0, 0])) });
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL:", msg); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (o) => JSON.parse(JSON.stringify(o));
// what App.jsx keeps from storage on load (tee, platform and teeOnline are dropped)
const persistLoad = (h) => ({ par: h.par, note: h.note, blocked: h.blocked, markers: h.markers, scale: h.scale, green: h.green, pins: h.pins, curPin: h.curPin });
const FIELDS = ["kind", "size", "sy", "z", "col"];
const mine = (n) => ({ id: 1700000000000 + n, x: 0.5, y: 0.5 });
const NSSPL = JSON.parse(readFileSync(join(root, "tools/nss-platform.json"), "utf8")).holes;
const shipsPlatform = Object.values(NEW).every((d) => d.platform);
const platformOf = (n) => NEW[n].platform ?? (({ facingDeg, tiers, slots, centre }) => ({ facingDeg, tiers, slots, centre }))(NSSPL[n]);
let markers = 0, platforms = 0, cols = 0;
for (let n = 1; n <= 21; n++) {
  const d = NEW[n];
  ok(Array.isArray(d.trees) && d.trees.length > 0, `H${n} derived.json ships no trees`);
  ok(d.trees.every((t) => [2, 3, 6].includes(t.kind) && t.size > 0 && t.sy > 0 && Number.isFinite(t.z)), `H${n} a tree lacks kind / size / sy / z or has a bad value`);
  ok(d.trees.every((t) => t.col && Array.isArray(t.col.t) && Array.isArray(t.col.c)), `H${n} a tree lacks col`);
  const base = { par: 4, note: "", blocked: [], markers: [mine(n)], scale: null, green: emptyGreen(), pins: [], curPin: null };
  const a = applyDerivedHole({ ...clone(base), green: emptyGreen() }, n, d, { fresh: false });
  const auto = a.markers.filter((m) => m.auto);
  markers += auto.length;
  ok(auto.length === d.trees.length, `H${n} tree count`);
  ok(auto.every((m, k) => FIELDS.every((f) => m[f] === d.trees[k][f])), `H${n} kind / size / sy / z / col not mirrored`);
  cols += auto.filter((m) => m.col).length;
  // the store as App.jsx's persist writes it (storedHolesMeta: auto markers
  // without col), read back through JSON: the next load puts col back
  const saved = JSON.parse(JSON.stringify({ ...persistLoad(a), markers: a.markers.map((m) => { if (!m.auto) return m; const { col, ...rest } = m; return rest; }) }));
  ok(saved.markers.every((m) => !("col" in m)), `H${n} could not build the stored markers`);
  const sv = applyDerivedHole({ ...saved, green: { ...saved.green } }, n, d, { fresh: false });
  ok(eq(sv.markers, a.markers), `H${n} the stored markers (no col) do not get col back on the next load`);
  ok(auto.every((m, k) => m.id === `t${n}-${k}` && m.x === d.trees[k].x && m.y === d.trees[k].y && m.r === d.trees[k].r && m.dy === d.trees[k].dy && m.dx === d.trees[k].dx && (d.trees[k].off ? m.off === true : !("off" in m))), `H${n} x / y / r / dy / dx / off changed`);
  ok(eq(a.markers.filter((m) => !m.auto), [mine(n)]), `H${n} player's marker touched`);
  // reload, then a wholesale application
  const b = applyDerivedHole({ ...persistLoad(a), green: { ...a.green } }, n, d, { fresh: false });
  ok(eq(a.markers, b.markers), `H${n} reload changed markers`);
  const c = applyDerivedHole({ ...persistLoad(b), green: { ...b.green } }, n, d, { fresh: true });
  ok(eq(b.markers, c.markers), `H${n} fresh application changed markers`);
  // an install that stored auto markers before the fields existed
  const old = { ...persistLoad(a), markers: a.markers.map((m) => (m.auto ? Object.fromEntries(Object.entries(m).filter(([k]) => !FIELDS.includes(k))) : m)) };
  ok(old.markers.every((m) => FIELDS.every((f) => !(f in m))), `H${n} could not build the old markers`);
  const e = applyDerivedHole({ ...clone(old), green: { ...old.green } }, n, d, { fresh: false });
  ok(eq(e.markers, a.markers), `H${n} stored markers without the fields not brought up to date`);
  // a derived.json without the fields: no keys, no undefined
  const bare = { ...d, trees: d.trees.map((t) => Object.fromEntries(Object.entries(t).filter(([k]) => !["size", "sy", "z"].includes(k)))) };
  const f = applyDerivedHole({ ...clone(base), green: emptyGreen() }, n, bare, { fresh: false });
  ok(f.markers.filter((m) => m.auto).every((m, k) => !("size" in m) && !("sy" in m) && !("z" in m) && m.kind === d.trees[k].kind && Object.values(m).every((v) => v !== undefined)), `H${n} a derived.json without size / sy / z gave keys or undefined values`);
  // the platform: mirrored whole, every load; never saved; teeOnline gone
  const pl = platformOf(n), dp = { ...d, platform: pl };
  ok(pl && pl.tiers && ["low", "high"].every((t) => Array.isArray(pl.tiers[t]) && pl.tiers[t].length === 7), `H${n} the platform has not 7 spots per tier`);
  const withOld = { ...clone(base), teeOnline: { x: 0.5, y: 0.86, lower: { x: 0.5, y: 0.86 }, upper: { x: 0.5, y: 0.87 } } };
  const p1 = applyDerivedHole({ ...withOld, green: emptyGreen() }, n, dp, { fresh: false });
  ok(p1.platform === pl && eq(p1.platform, platformOf(n)), `H${n} platform not mirrored whole`);
  ok(!("teeOnline" in p1), `H${n} a stored teeOnline survived`);
  ok(!("platform" in persistLoad(p1)) && !("tee" in persistLoad(p1)), `H${n} the loader keeps platform or tee`);
  const p2 = applyDerivedHole({ ...persistLoad(p1), green: { ...p1.green } }, n, dp, { fresh: false });
  const p3 = applyDerivedHole({ ...persistLoad(p2), green: { ...p2.green } }, n, dp, { fresh: true });
  ok(p2.platform === pl && p3.platform === pl && eq(persistLoad(p1), persistLoad(p2)) && eq(p2.markers, p3.markers), `H${n} a reload or a fresh application changed the platform or the state`);
  // a stale stored platform (say a session's state) gives way to derived.json's
  const stale = applyDerivedHole({ ...persistLoad(p1), green: { ...p1.green }, platform: { facingDeg: 0, tiers: {} } }, n, dp, { fresh: false });
  ok(stale.platform === pl, `H${n} a stale platform kept`);
  // an older derived.json: no platform, a teeOnline
  const older = { ...d, teeOnline: withOld.teeOnline }; delete older.platform;
  const p4 = applyDerivedHole({ ...persistLoad(p1), green: { ...p1.green }, platform: pl }, n, older, { fresh: false });
  ok(p4.platform === null && !("teeOnline" in p4), `H${n} a derived.json without platform: platform ${p4.platform && "kept"}, teeOnline ${"teeOnline" in p4 ? "merged" : "gone"}`);
  platforms++;
}
console.log(`${markers} auto tree markers over 21 holes carry kind, size, sy and z, ${cols} col; col restored from derived.json on a load of the stored markers`);
console.log(`${platforms} holes' platform mirrored whole (${shipsPlatform ? "public/derived.json's" : "tools/nss-platform.json's: derived.json ships none yet"})`);
console.log(fails ? `${fails} FAILURES` : "all tree-field merge checks passed");
process.exit(fails ? 1 : 0);
