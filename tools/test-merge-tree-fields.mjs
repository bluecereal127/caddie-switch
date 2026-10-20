// node tools/test-merge-tree-fields.mjs [repoRoot]
// derived.json's trees carry kind, size (x scale), sy (y scale) and z (base
// height in yd above the hole's datum) for the flight check; src/derivedMerge.js
// mirrors them onto the auto tree markers. Checked on every hole: each auto
// marker has the four fields with derived.json's values (and x, y, r, dy, dx,
// off as before), the player's own marker is untouched, a reload and a fresh
// (wholesale) application change nothing, an install whose stored auto markers
// predate the fields gets them on the next load, and a derived.json without
// them (older pipeline) yields markers without the keys, not undefined values.
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
// what App.jsx keeps from storage on load (tee/teeAlt are dropped)
const persistLoad = (h) => ({ par: h.par, note: h.note, blocked: h.blocked, markers: h.markers, scale: h.scale, green: h.green, pins: h.pins, curPin: h.curPin });
const FIELDS = ["kind", "size", "sy", "z"];
const mine = (n) => ({ id: 1700000000000 + n, x: 0.5, y: 0.5 });
let markers = 0;
for (let n = 1; n <= 21; n++) {
  const d = NEW[n];
  ok(Array.isArray(d.trees) && d.trees.length > 0, `H${n} derived.json ships no trees`);
  ok(d.trees.every((t) => [2, 3, 6].includes(t.kind) && t.size > 0 && t.sy > 0 && Number.isFinite(t.z)), `H${n} a tree lacks kind / size / sy / z or has a bad value`);
  const base = { par: 4, note: "", blocked: [], markers: [mine(n)], scale: null, green: emptyGreen(), pins: [], curPin: null };
  const a = applyDerivedHole({ ...clone(base), green: emptyGreen() }, n, d, { fresh: false });
  const auto = a.markers.filter((m) => m.auto);
  markers += auto.length;
  ok(auto.length === d.trees.length, `H${n} tree count`);
  ok(auto.every((m, k) => FIELDS.every((f) => m[f] === d.trees[k][f])), `H${n} kind / size / sy / z not mirrored`);
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
}
console.log(`${markers} auto tree markers over 21 holes carry kind, size, sy and z`);
console.log(fails ? `${fails} FAILURES` : "all tree-field merge checks passed");
process.exit(fails ? 1 : 0);
