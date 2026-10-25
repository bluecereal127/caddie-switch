// node tools/test-merge-pins.mjs [repoRoot]
// The NSS switch of the pins, through src/derivedMerge.js: a hole stored in the
// WSR era (pipeline pins d<n>-s<slot> for WSR's spots and d<n>-x<k> for the
// Switch-only ones, one player pin, the WSR green box) meets a derived.json
// whose pins are NSS's six cups (id c<k>, src "nss"). Checked on every hole:
// - with curPin set to each WSR-era pipeline pin in turn, the merge moves it
//   to the cup nearest that pin on the map (the table below spells out the
//   cases the design lists, H2's and H21's many-to-one among them), whatever
//   the stored green box (a WSR-era pin is not carried through the boxes);
// - the pipeline pins are derived.json's six cups with every field, the
//   WSR-era ones gone, the player's pin untouched, a player curPin kept;
// - curPin null, or a pipeline id whose pin is gone, -> the most-seen cup
//   (the first on a tie: H7's c2 and c5);
// - a second load changes nothing; an NSS curPin keeps its id when the green
//   box moves under it;
// - geometry: source "nss" over a hole stored with green.src "wsr-..."
//   re-applies once and drops gridEdited; platform mirrored whole, teeOnline gone.
// The NSS hole is built from tools/nss-pins.json and nss-platform.json in the
// shape tools/build-derived.mjs ships (pins { id, k, x, y, label, difficult,
// yd, src, wsr, seen }) with the design's most-seen cups as `seen`, on top of
// public/derived.json's hole; when public/derived.json already ships NSS
// cups, every check runs on it too. The WSR-era pins are rebuilt from
// tools/wsr-pins.json and the four Switch-only spots below (the last
// WSR-era derived.json's), so the test does not need that derived.json.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const { applyDerivedHole, isPipelinePin } = await import(pathToFileURL(join(root, "src/derivedMerge.js")).href);
const J = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const DERIVED = J("public/derived.json").holes;
const NSSP = J("tools/nss-pins.json").holes, NSSPL = J("tools/nss-platform.json").holes;
const WSRP = J("tools/wsr-pins.json").holes, WSRT = J("tools/wsr-truth.json").holes;
const MAP_W = 250, MAP_H = 304;
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL:", msg); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (o) => JSON.parse(JSON.stringify(o));
const emptyGreen = () => ({ box: null, grid: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [0, 0])) });
// what App.jsx keeps from storage on load (tee, platform, teeOnline are dropped)
const persistLoad = (h) => ({ par: h.par, note: h.note, blocked: h.blocked, markers: h.markers, scale: h.scale, green: h.green, pins: h.pins, curPin: h.curPin });
const merge = (h, n, d, fresh = false) => applyDerivedHole({ ...clone(h), green: { ...clone(h.green ?? emptyGreen()) } }, n, d, { fresh });
const px = (a, b) => Math.hypot((a.x - b.x) * MAP_W, (a.y - b.y) * MAP_H);

// the WSR era's Switch-only spots (derived.json before the NSS switch)
const SWITCH_SPOTS = {
  10: [{ id: "x0", x: 0.5227, y: 0.1729, label: "S1", yd: 374, seen: 3 }, { id: "x1", x: 0.5018, y: 0.147, label: "S2", yd: 388, seen: 2 }],
  18: [{ id: "x0", x: 0.4773, y: 0.1588, label: "S1", yd: 458, seen: 2 }],
  21: [{ id: "x0", x: 0.4518, y: 0.1862, label: "S1", yd: 415, seen: 1 }],
};
// the design's nearest-cup table (INTEGRATION.md section 3, unit D), and its ties
const TABLE = {
  "d10-x0": "c5", "d10-x1": "c4", "d18-x0": "c1", "d21-x0": "c3", "d11-s0": "c0", "d7-s3": "c2",
  "d3-s1": "c1", "d9-s1": "c0", "d13-s0": "c0", "d16-s2": "c3", "d18-s0": "c0",
  "d2-s0": "c4", "d2-s1": "c4", "d21-s4": "c0", "d21-s5": "c0",
};
// the design's most-seen cup per hole (credited at 2.5 px); H7's c2 ties with c5
const MOST_SEEN = { 1: [0], 2: [0], 3: [4], 4: [1], 5: [0], 6: [1], 7: [2, 5], 8: [1], 9: [0], 10: [5], 11: [4], 12: [2], 13: [1], 14: [3], 15: [3], 16: [5], 17: [1], 18: [1], 19: [0], 20: [1], 21: [3] };

// a WSR-era stored hole: its pipeline pins, the player's pin, WSR's green box, a teeOnline
const MINE_PIN = (n) => ({ id: 1700000000100 + n, x: 0.46, y: 0.24 });
const wsrEraPins = (n) => [
  ...WSRP[n].spots.map((s) => ({ id: `d${n}-s${s.slots[0]}`, x: s.x, y: s.y, label: s.label, set: s.set, yd: s.yd, src: "wsr", seen: 0 })),
  ...(SWITCH_SPOTS[n] ?? []).map((s) => ({ id: `d${n}-${s.id}`, x: s.x, y: s.y, label: s.label, set: null, yd: s.yd, src: "switch", seen: s.seen })),
];
const wsrEraHole = (n, curPin) => ({
  par: 4, note: "", blocked: [], markers: [], scale: WSRT[n].scale,
  green: { ...emptyGreen(), box: WSRT[n].greenBox, poly: WSRT[n].greenPoly, src: "wsr-00000000" },
  pins: [MINE_PIN(n), ...wsrEraPins(n)], curPin,
  teeOnline: { x: 0.5, y: 0.86, lower: { x: 0.5, y: 0.86 }, upper: { x: 0.5, y: 0.87 } },
});
// the NSS hole as tools/build-derived.mjs ships it
const synthHole = (n) => {
  const d = clone(DERIVED[n]);
  delete d.teeOnline; delete d.pinCandidates; delete d.pinZones;
  d.pins = NSSP[n].cups.map((c) => ({ id: `c${c.k}`, k: c.k, x: c.x, y: c.y, label: String(c.k + 1), difficult: c.difficult, yd: Math.floor(c.ydFromWsrStart), src: "nss", wsr: c.wsr, seen: MOST_SEEN[n].includes(c.k) ? 2 : 0 }));
  const p = NSSPL[n];
  d.platform = { facingDeg: p.facingDeg, tiers: p.tiers, slots: p.slots, centre: p.centre };
  return d;
};
const liveNss = Object.values(DERIVED).every((d) => Array.isArray(d.pins) && d.pins.length && d.pins.every((p) => p.src === "nss"));
const sources = [["synth", synthHole]];
if (liveNss) sources.push(["derived.json", (n) => DERIVED[n]]);
else console.log("public/derived.json still ships WSR-era pins: checked on the NSS hole built from tools/nss-pins.json only");

// the stored green box of the carry cases: derived.json's box moved by 0.8 of
// its width east and 0.6 of its height north and grown 1.25x about its centre,
// with a point inside it moved along (pt); the carry through the boxes takes
// pt(p) back to p
const boxXf = (b) => {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, dx = 0.8 * (b.x1 - b.x0), dy = -0.6 * (b.y1 - b.y0);
  const fx = (x) => (x - cx) * 1.25 + cx + dx, fy = (y) => (y - cy) * 1.25 + cy + dy;
  return { box: { x0: fx(b.x0), x1: fx(b.x1), y0: fy(b.y0), y1: fy(b.y1) }, pt: (p) => ({ x: fx(p.x), y: fy(p.y) }) };
};
// that the carry cases bite: how many would land elsewhere with no carry (the
// nearest pin to the stored spot) or with the boxes swapped
const bites = {
  n: { wsr: 0, nss: 0 }, noCarry: { wsr: 0, nss: 0 }, swapped: { wsr: 0, nss: 0 },
  // at: the stored spot, in the stored box sb; nb: derived.json's box
  tally(kind, want, at, sb, nb, pins) {
    const nearestTo = (q) => pins.reduce((b, c) => (!b || px(c, q) < px(b, q) ? c : b), null).id;
    const sw = { x: sb.x0 + ((at.x - nb.x0) / (nb.x1 - nb.x0)) * (sb.x1 - sb.x0), y: sb.y0 + ((at.y - nb.y0) / (nb.y1 - nb.y0)) * (sb.y1 - sb.y0) };
    this.n[kind]++;
    if (nearestTo(at) !== want) this.noCarry[kind]++;
    if (nearestTo(sw) !== want) this.swapped[kind]++;
  },
};

const table = { hit: 0 };
for (const [name, holeOf] of sources) {
  let migrated = 0;
  for (let n = 1; n <= 21; n++) {
    const d = holeOf(n), tag = `${name} H${n}`;
    const cups = d.pins.map((p) => ({ ...p, id: `d${n}-${p.id}` }));
    ok(d.pins.length === 6 && d.pins.every((p, k) => p.id === `c${k}` && p.src === "nss"), `${tag}: the NSS hole does not have the six cups c0..c5`);
    const nearest = (at) => cups.reduce((b, c) => (!b || px(c, at) < px(b, at) ? c : b), null).id;
    const seenMax = Math.max(...cups.map((c) => c.seen ?? 0));
    const mostSeen = cups.find((c) => (c.seen ?? 0) === seenMax).id;
    // curPin on each WSR-era pipeline pin in turn
    for (const p of wsrEraPins(n)) {
      const want = nearest(p);
      const a = merge(wsrEraHole(n, p.id), n, d);
      ok(a.curPin === want, `${tag}: curPin ${p.id} -> ${a.curPin}, the nearest cup is ${want}`);
      if (TABLE[p.id]) { ok(a.curPin === `d${n}-${TABLE[p.id]}`, `${tag}: ${p.id} -> ${a.curPin}, the design's table says ${TABLE[p.id]}`); if (name === "synth") table.hit++; }
      // the stored box does not enter: a box shifted by 1 px (or none) gives the same cup
      const h = wsrEraHole(n, p.id), b0 = h.green.box;
      const shifted = { ...h, green: { ...h.green, box: { x0: b0.x0 - 1 / MAP_W, x1: b0.x1, y0: b0.y0 + 1 / MAP_H, y1: b0.y1 } } };
      ok(merge(shifted, n, d).curPin === want && merge({ ...h, green: { ...h.green, box: null } }, n, d).curPin === want, `${tag}: ${p.id}'s cup depends on the stored green box`);
      // a second load changes nothing
      const b = merge(persistLoad(a), n, d);
      ok(eq(persistLoad(a), persistLoad(b)), `${tag}: a second load after ${p.id} changed the state`);
      migrated++;
    }
    const a = merge(wsrEraHole(n, `d${n}-s0`), n, d);
    // the pipeline pins: derived.json's cups, whole; the WSR-era ones gone; the player's pin kept
    ok(eq(a.pins.filter(isPipelinePin), cups), `${tag}: the pipeline pins are not derived.json's six cups`);
    ok(!a.pins.some((p) => /^d\d+-[sx]\d+$/.test(p.id)), `${tag}: a WSR-era pipeline pin survived`);
    ok(eq(a.pins.filter((p) => !isPipelinePin(p)), [MINE_PIN(n)]), `${tag}: the player's pin touched`);
    ok(merge(wsrEraHole(n, MINE_PIN(n).id), n, d).curPin === MINE_PIN(n).id, `${tag}: a player curPin moved`);
    // no curPin, or one whose pin is gone: the most-seen cup
    ok(merge(wsrEraHole(n, null), n, d).curPin === mostSeen, `${tag}: curPin null -> ${merge(wsrEraHole(n, null), n, d).curPin}, the most-seen cup is ${mostSeen}`);
    const gone = wsrEraHole(n, `d${n}-s9`);
    ok(merge(gone, n, d).curPin === mostSeen, `${tag}: a vanished pipeline curPin -> ${merge(gone, n, d).curPin}, not the most-seen ${mostSeen}`);
    // an NSS curPin keeps its id when the box moves under it (a later truth correction)
    for (const c of cups) {
      const s = { ...persistLoad(a), curPin: c.id };
      const box = d.greenBox, moved = { ...d, source: "nss", rev: `${d.rev ?? "nss"}-moved`, greenBox: { x0: box.x0 + 3 / MAP_W, x1: box.x1 + 3 / MAP_W, y0: box.y0 - 2 / MAP_H, y1: box.y1 - 2 / MAP_H } };
      const m = merge(s, n, moved);
      ok(eq(m.green.box, moved.greenBox) && m.curPin === c.id && merge(s, n, d).curPin === c.id, `${tag}: the NSS curPin ${c.id} moved (box ${eq(m.green.box, moved.greenBox) ? "moved" : "not moved"}, curPin ${m.curPin})`);
    }
    // an NSS curPin whose id derived.json no longer ships (d<n>-c9), stored on
    // cup k's spot in a green box that has since moved and grown: carried
    // through the boxes, it lands on cup k
    {
      const nd = d.source === "nss" ? d : { ...d, source: "nss", rev: `nss-test${n}`, wsrRev: undefined };
      const T = boxXf(nd.greenBox);
      for (const c of cups) {
        const h = { ...persistLoad(a), green: { ...emptyGreen(), box: T.box, poly: nd.greenPoly, src: "nss-stale" },
          pins: [MINE_PIN(n), ...cups.map((q) => ({ ...q, ...T.pt(q) })), { ...c, ...T.pt(c), id: `d${n}-c9`, k: 9, label: "10" }], curPin: `d${n}-c9` };
        const m = merge(h, n, nd);
        ok(m.curPin === c.id && eq(m.green.box, nd.greenBox), `${tag}: the vanished NSS curPin d${n}-c9 on ${c.id}'s spot -> ${m.curPin}`);
        ok(eq(persistLoad(merge(persistLoad(m), n, nd)), persistLoad(m)), `${tag}: a second load after the vanished d${n}-c9 changed the state`);
        if (name === "synth") bites.tally("nss", c.id, T.pt(c), T.box, nd.greenBox, cups);
      }
    }
    // geometry: the NSS geometry applies once over a WSR-era hole, gridEdited drops
    if (d.source === "nss" || name === "synth") {
      const nd = d.source === "nss" ? d : { ...d, source: "nss", rev: `nss-test${n}`, wsrRev: undefined };
      const painted = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [1, 0]));
      const h = wsrEraHole(n, `d${n}-s0`); h.green.grid = painted; h.green.gridEdited = true;
      const g = merge(h, n, nd);
      ok(g.green.src === (nd.rev ?? nd.wsrRev) && eq(g.green.box, nd.greenBox) && eq(g.green.poly, nd.greenPoly) && eq(g.green.grid, nd.grid) && !("gridEdited" in g.green) && g.scale === nd.scale,
        `${tag}: source "nss" over green.src "wsr-..." did not re-apply the geometry (src ${g.green.src}, gridEdited ${g.green.gridEdited})`);
      const again = merge({ ...persistLoad(g), green: { ...g.green, grid: painted, gridEdited: true } }, n, nd);
      ok(eq(again.green.grid, painted) && again.green.gridEdited === true && again.green.src === g.green.src, `${tag}: the NSS geometry applied twice (the player's grid lost)`);
    }
    // platform mirrored whole, teeOnline gone
    ok(a.platform === (d.platform ?? null) && eq(a.platform, d.platform ?? null), `${tag}: platform not mirrored whole`);
    ok(!("teeOnline" in a), `${tag}: teeOnline survived the merge`);
    ok(!("platform" in persistLoad(a)) && !("teeOnline" in persistLoad(a)), `${tag}: the loader keeps platform or teeOnline`);
  }
  console.log(`${name}: ${migrated} WSR-era curPins moved to their nearest NSS cup on 21 holes`);
}
// a WSR-era derived.json (source "wsr", WSR's spots s<slot> and the Switch-only
// x<k>, a new wsrRev) over a hole stored before a truth correction (green.src
// behind) whose green box and pins sit moved and grown together: the curPin is
// carried through the boxes onto the matching spot (the merge before the NSS
// switch, kept for a derived.json from before it)
let wsrCarried = 0;
for (let n = 1; n <= 21; n++) {
  const dw = clone(DERIVED[n]);
  delete dw.rev; delete dw.platform; delete dw.teeNss;
  Object.assign(dw, { source: "wsr", wsrRev: `wsr-test${n}`, scale: WSRT[n].scale, greenBox: WSRT[n].greenBox, greenPoly: WSRT[n].greenPoly,
    pins: wsrEraPins(n).map((p) => ({ ...p, id: p.id.slice(`d${n}-`.length) })) });
  const want = wsrEraPins(n), T = boxXf(dw.greenBox);
  for (const p of want) {
    const h = wsrEraHole(n, p.id);
    h.green.box = T.box;
    h.pins = [MINE_PIN(n), ...want.map((q) => ({ ...q, ...T.pt(q) }))];
    const m = merge(h, n, dw);
    ok(m.curPin === p.id && eq(m.green.box, dw.greenBox) && m.green.src === dw.wsrRev, `WSR-era H${n}: curPin ${p.id} stored in a moved box -> ${m.curPin} (box ${eq(m.green.box, dw.greenBox) ? "applied" : "kept"}, src ${m.green.src})`);
    ok(eq(m.pins.filter(isPipelinePin), want) && eq(m.pins.filter((q) => !isPipelinePin(q)), [MINE_PIN(n)]), `WSR-era H${n}: the pins are not derived.json's spots and the player's pin`);
    ok(eq(persistLoad(merge(persistLoad(m), n, dw)), persistLoad(m)), `WSR-era H${n}: a second load after ${p.id} changed the state`);
    bites.tally("wsr", p.id, T.pt(p), T.box, dw.greenBox, want);
    wsrCarried++;
  }
}
console.log(`WSR-era derived.json: ${wsrCarried} curPins carried through a moved green box onto their spot on 21 holes`);
for (const k of ["wsr", "nss"]) {
  ok(bites.n[k] > 0 && bites.noCarry[k] > bites.n[k] / 2 && bites.swapped[k] > bites.n[k] / 2, `the ${k} carry cases do not bite: ${bites.noCarry[k]} / ${bites.swapped[k]} of ${bites.n[k]} would fail with no carry / the boxes swapped`);
  console.log(`  ${k} carry: of ${bites.n[k]} cases, ${bites.noCarry[k]} would land on another pin with no carry and ${bites.swapped[k]} with the boxes swapped`);
}
ok(table.hit === Object.keys(TABLE).length, `the design's table: ${table.hit} of ${Object.keys(TABLE).length} cases met a stored pin`);
console.log(fails ? `${fails} FAILURES of ${checks} checks` : `all ${checks} pin-merge checks passed`);
process.exit(fails ? 1 : 0);
