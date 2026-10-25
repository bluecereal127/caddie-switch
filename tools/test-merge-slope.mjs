// node tools/test-merge-slope.mjs [repoRoot]
// derived.json's slopeMaxPct (the steepest 9x9 cell's slope in percent, which
// scales the painted grid's levels for the putt model, src/putt.js) arrives
// on every hole as green.slopeMaxPct, equal to tools/nss-truth.json's; it
// always follows derived.json (a stale stored value is replaced, a derived.json
// without it leaves the stored one alone); the player's own data (a marker, a
// pin, an edited grid with green.gridEdited) is untouched by a reload, and a
// reload changes nothing. Wherever the merge writes derived.json's grid (the
// WSR marker behind, a fresh application, an empty grid refilled) it drops
// gridEdited, since the grid is the pipeline's again. The NSS switch: a hole
// stored under WSR's geometry (green.src "wsr-...", the player's painted
// grid) meeting a derived.json of source "nss" takes its scale, green box,
// outline and grid once, drops gridEdited and stores the NSS rev (`rev`
// before `wsrRev`, "nss" without either); the player's later edits survive
// the reloads; a source the merge does not know overwrites nothing.
// derived.json itself ships NSS's geometry: source "nss", rev "nss-" + the
// FNV-1a hash tools/build-derived.mjs takes of [scale, greenBox, greenPoly,
// grid] (no wsrRev), and the scale, green box, outline and slopeMaxPct of
// tools/nss-truth.json exactly.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const { applyDerivedHole } = await import(pathToFileURL(join(root, "src/derivedMerge.js")).href);
const NEW = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes;
const TRUTH = JSON.parse(readFileSync(join(root, "tools/nss-truth.json"), "utf8")).holes;
// build-derived's geomRev, over the truth's own values
const geomRev = (t) => {
  const str = JSON.stringify([t.scale, t.greenBox, t.greenPoly, t.grid]);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return "nss-" + h.toString(16).padStart(8, "0");
};
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
  ok(typeof d.slopeMaxPct === "number" && d.slopeMaxPct === TRUTH[n].slopeMaxPct, `H${n} derived.json slopeMaxPct ${d.slopeMaxPct}, nss-truth.json ${TRUTH[n].slopeMaxPct}`);
  ok(d.source === "nss" && d.rev === geomRev(TRUTH[n]) && !("wsrRev" in d), `H${n} derived.json source ${d.source} rev ${d.rev}${"wsrRev" in d ? ` wsrRev ${d.wsrRev}` : ""}, want "nss" ${geomRev(TRUTH[n])}`);
  ok(d.scale === TRUTH[n].scale && eq(d.greenBox, TRUTH[n].greenBox) && eq(d.greenPoly, TRUTH[n].greenPoly), `H${n} derived.json's scale / green box / outline are not nss-truth.json's`);
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
  // the NSS switch over a hole stored under WSR's geometry with the player's grid
  const bx = d.greenBox, nssBox = { x0: bx.x0 + 0.001, x1: bx.x1 + 0.001, y0: bx.y0 - 0.0005, y1: bx.y1 };
  const nssGrid = d.grid.map((r) => r.map(([x, y]) => [y, x]));
  const nssPoly = d.greenPoly.map(([x, y]) => [x + 0.001, y]);
  const nd = { ...d, source: "nss", rev: `nss-test${n}`, scale: d.scale + 0.001, greenBox: nssBox, greenPoly: nssPoly, grid: nssGrid };
  delete nd.wsrRev;
  const wsrStored = { ...b, green: { ...b.green, src: "wsr-0123abcd" } };
  const s1 = merge(wsrStored, n, nd);
  ok(s1.green.src === nd.rev && eq(s1.green.box, nssBox) && eq(s1.green.poly, nssPoly) && eq(s1.green.grid, nssGrid) && !("gridEdited" in s1.green) && s1.scale === nd.scale,
    `H${n} source "nss" over green.src "wsr-..." did not apply once (src ${s1.green.src}, gridEdited ${s1.green.gridEdited}, scale ${s1.scale})`);
  ok(s1.green.slopeMaxPct === d.slopeMaxPct && eq(s1.markers, b.markers) && eq(s1.pins.filter((p) => typeof p.id === "number"), b.pins.filter((p) => typeof p.id === "number")), `H${n} the NSS switch touched slopeMaxPct, a marker or the player's pin`);
  const s2 = merge({ ...persistLoad(s1), green: { ...s1.green, grid: painted, gridEdited: true } }, n, nd);
  ok(eq(s2.green.grid, painted) && s2.green.gridEdited === true && s2.green.src === nd.rev && eq(s2.green.box, nssBox), `H${n} the NSS geometry applied a second time over the player's grid`);
  ok(eq(persistLoad(merge(persistLoad(s2), n, nd)), persistLoad(s2)), `H${n} a reload after the NSS switch changed the state`);
  ok(merge(wsrStored, n, { ...nd, wsrRev: "wsr-zzzz" }).green.src === nd.rev, `H${n} wsrRev taken before rev`);
  const noRev = { ...nd }; delete noRev.rev;
  ok(merge(wsrStored, n, noRev).green.src === "nss" && merge(wsrStored, n, { ...noRev, wsrRev: "wsr-old" }).green.src === "wsr-old", `H${n} the rev fallbacks`);
  const other = merge(wsrStored, n, { ...nd, source: "captures" });
  ok(other.green.src === "wsr-0123abcd" && eq(other.green.grid, painted) && other.green.gridEdited === true && eq(other.green.box, b.green.box), `H${n} an unknown source overwrote the geometry`);
}
console.log(`slopeMaxPct on 21 holes, ${Math.min(...pcts)}-${Math.max(...pcts)} %`);
console.log(fails ? `${fails} FAILURES` : "all slopeMaxPct merge checks passed");
process.exit(fails ? 1 : 0);
