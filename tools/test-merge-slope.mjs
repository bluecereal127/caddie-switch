// node tools/test-merge-slope.mjs [repoRoot]
// derived.json's slopeMaxPct (the steepest 9x9 cell's slope in percent, which
// scales the painted grid's levels for the putt model, src/putt.js) arrives
// on every hole as green.slopeMaxPct, equal to tools/wsr-truth.json's; it
// always follows derived.json (a stale stored value is replaced, a derived.json
// without it leaves the stored one alone); the player's own data (a marker, a
// pin, an edited grid with green.gridEdited) is untouched by a reload, and a
// reload changes nothing. Wherever the merge writes derived.json's grid (the
// WSR marker behind, a fresh application, an empty grid refilled) it drops
// gridEdited, since the grid is the pipeline's again.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const { applyDerivedHole } = await import(pathToFileURL(join(root, "src/derivedMerge.js")).href);
const NEW = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes;
const TRUTH = JSON.parse(readFileSync(join(root, "tools/wsr-truth.json"), "utf8")).holes;
const emptyGreen = () => ({ box: null, grid: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [0, 0])) });
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL:", msg); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (o) => JSON.parse(JSON.stringify(o));
// what App.jsx keeps from storage on load (tee/teeOnline are dropped)
const persistLoad = (h) => ({ par: h.par, note: h.note, blocked: h.blocked, markers: h.markers, scale: h.scale, green: h.green, pins: h.pins, curPin: h.curPin });
const merge = (h, n, d, fresh = false) => applyDerivedHole({ ...clone(h), green: { ...clone(h.green ?? emptyGreen()) } }, n, d, { fresh });
const MINE_MARKER = (n) => ({ id: 1700000000000 + n, x: 0.5, y: 0.5 }), MINE_PIN = (n) => ({ id: 1700000000100 + n, x: 0.46, y: 0.24 });
const painted = Array.from({ length: 9 }, (_, j) => Array.from({ length: 9 }, (_, i) => (i === 4 && j === 4 ? [0, 2] : [1, 0])));
const pcts = [];
for (let n = 1; n <= 21; n++) {
  const d = NEW[n];
  ok(typeof d.slopeMaxPct === "number" && d.slopeMaxPct === TRUTH[n].slopeMaxPct, `H${n} derived.json slopeMaxPct ${d.slopeMaxPct}, wsr-truth.json ${TRUTH[n].slopeMaxPct}`);
  pcts.push(d.slopeMaxPct);
  // a fresh install, then the player's marker, pin and an edited grid
  const base = { par: 4, note: "", blocked: [], markers: [MINE_MARKER(n)], scale: null, green: emptyGreen(), pins: [MINE_PIN(n)], curPin: null };
  const a = persistLoad(merge(base, n, d, true));
  ok(a.green.slopeMaxPct === d.slopeMaxPct, `H${n} slopeMaxPct not mirrored on a fresh install`);
  const mine = { ...a, green: { ...a.green, grid: painted, gridEdited: true } };
  const b = merge(mine, n, d);
  ok(b.green.slopeMaxPct === d.slopeMaxPct, `H${n} slopeMaxPct lost on a reload`);
  ok(eq(b.green.grid, painted) && b.green.gridEdited === true, `H${n} the player's edited grid or its flag touched`);
  ok(b.markers.some((m) => m.id === MINE_MARKER(n).id && m.x === 0.5 && !m.auto), `H${n} the player's marker touched`);
  ok(b.pins.some((p) => p.id === MINE_PIN(n).id && p.x === 0.46), `H${n} the player's pin touched`);
  ok(eq(b.green.box, a.green.box) && b.scale === a.scale && b.green.src === a.green.src, `H${n} green box / scale / marker changed`);
  // idempotent across reloads
  const c = merge(persistLoad(b), n, d);
  ok(eq(persistLoad(b), persistLoad(c)), `H${n} a reload changed the state`);
  // a stale stored value is replaced; a derived.json without the field leaves the stored one alone
  ok(merge({ ...b, green: { ...b.green, slopeMaxPct: 99 } }, n, d).green.slopeMaxPct === d.slopeMaxPct, `H${n} stale slopeMaxPct kept`);
  const bare = { ...d }; delete bare.slopeMaxPct;
  ok(merge(b, n, bare).green.slopeMaxPct === d.slopeMaxPct && !("slopeMaxPct" in merge(base, n, bare, true).green), `H${n} a derived.json without slopeMaxPct`);
  // the merge writing derived's grid drops the flag: the WSR marker behind, a
  // fresh application, an empty grid refilled
  const behind = merge({ ...b, green: { ...b.green, src: "an older rev" } }, n, d);
  ok(eq(behind.green.grid, d.grid) && !("gridEdited" in behind.green), `H${n} WSR marker behind: grid ${eq(behind.green.grid, d.grid) ? "restored" : "kept"}, gridEdited ${behind.green.gridEdited}`);
  const fresh = merge(b, n, d, true);
  ok(eq(fresh.green.grid, d.grid) && !("gridEdited" in fresh.green), `H${n} a fresh application kept gridEdited`);
  const cleared = merge({ ...b, green: { ...b.green, grid: emptyGreen().grid } }, n, d);
  ok(eq(cleared.green.grid, d.grid) && !("gridEdited" in cleared.green), `H${n} an empty edited grid refilled but flagged`);
}
console.log(`slopeMaxPct on 21 holes, ${Math.min(...pcts)}-${Math.max(...pcts)} %`);
console.log(fails ? `${fails} FAILURES` : "all slopeMaxPct merge checks passed");
process.exit(fails ? 1 : 0);
