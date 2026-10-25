// Acceptance for derived.json's pins and tees (tools/build-derived.mjs, the Pins
// block), on the committed files:
//   1. every hole has exactly NSS's six cups, c0..c5, labelled 1..6, src "nss",
//      at tools/nss-pins.json's map points, `difficult` on exactly the 16 cups
//      the game's CupDifficulties lists, `wsr` on exactly the 7 that coincide
//      with a WSR spot (each within 0.3 yd of it), yd = the floor of the flat
//      yards from the tee (GlfTeeOBJ) to the cup, and no Switch-only pin,
//      pinCandidates, pinZones or teeOnline left;
//   2. every cup inside the hole's green outline and, over public/terrain, on
//      the green (class 6);
//   3. the tee is NSS's GlfTeeOBJ, where local play tees off (hole 1 too), and
//      teeNss NSS's two tee bones (GlfTeeOBJ = the tee, and Glf_RotateOBJ);
//   4. with the captures (captures/derived/pin-observations.json), each cup's
//      `seen` is the number of rounds credited to it, every credited
//      observation within 2.5 px of its cup, an ambiguous one a near tie, an
//      unmatched one beyond every cup, and the badge rule (floor of the yards
//      from GlfTeeOBJ) printed over the local badges; hole 1's local badges
//      (the hole whose single Eden read put the ball at Glf_RotateOBJ) all fit
//      floor(GlfTeeOBJ -> cup) and none floor(Glf_RotateOBJ -> cup); skipped
//      without them.
//   node tools/test-pins.mjs
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTerrain, classAt } from "../src/terrain.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const J = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), "utf8"));
const derived = J("public", "derived.json"), D = derived.holes;
const NP = J("tools", "nss-pins.json").holes, WP = J("tools", "wsr-pins.json").holes;
const W = derived.mapW, H = derived.mapH, YD = 0.9144;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log(`FAIL ${m}`); } };

// the game's CupDifficulties (GolfFieldMgrParam HoleParams[hole-1]) and the
// cups that coincide with a WSR spot, from the decode (INTEGRATION.md 1.2)
const DIFFICULT = { 5: [4], 6: [5], 7: [4], 8: [3], 9: [2], 14: [5], 16: [0, 4], 17: [0], 18: [3], 19: [1, 5], 20: [2, 4], 21: [0, 5] };
const ON_WSR = { 3: { 1: "s1" }, 7: { 2: "s3" }, 9: { 0: "s1" }, 11: { 0: "s0" }, 13: { 0: "s0" }, 16: { 3: "s2" }, 18: { 0: "s0" } };
const CUP_MATCH_PX = 2.5, AMBIG_PX = 1;
const flatYd = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2) / YD;
const pxTo = (a, b) => Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// 1. the cups
let nDiff = 0, nWsr = 0, ydGap = 0, wsrGap = 0;
for (let n = 1; n <= 21; n++) {
  const d = D[n], np = NP[n];
  ok(d && Array.isArray(d.pins), `H${n}: no pins in derived.json`);
  if (!d?.pins) continue;
  for (const k of ["pinCandidates", "pinZones", "teeOnline"]) ok(!(k in d), `H${n}: derived.json still ships ${k}`);
  ok(Array.isArray(d.pinAmbiguous) && Array.isArray(d.pinUnmatched), `H${n}: pinAmbiguous / pinUnmatched missing`);
  ok(d.pins.length === 6, `H${n}: ${d.pins.length} pins, not 6`);
  ok(new Set(d.pins.map((p) => p.label)).size === d.pins.length, `H${n}: labels not unique`);
  ok(!d.pins.some((p) => p.src === "switch"), `H${n}: a Switch-only pin`);
  d.pins.forEach((p, k) => {
    const c = np.cups[k], tag = `H${n} ${p.id}`;
    ok(p.id === `c${k}` && p.k === k && p.label === String(k + 1) && p.src === "nss", `${tag}: id ${p.id} k ${p.k} label ${p.label} src ${p.src}, want c${k} ${k} "${k + 1}" "nss"`);
    ok(Math.abs(p.x - c.x) <= 1e-4 && Math.abs(p.y - c.y) <= 1e-4, `${tag}: at ${p.x}, ${p.y}, tools/nss-pins.json ${c.x}, ${c.y}`);
    const diff = (DIFFICULT[n] ?? []).includes(k);
    ok(p.difficult === diff && c.difficult === diff, `${tag}: difficult ${p.difficult} (nss-pins.json ${c.difficult}), the game's CupDifficulties says ${diff}`);
    nDiff += p.difficult ? 1 : 0;
    const w = ON_WSR[n]?.[k] ?? null;
    ok(p.wsr === w && (c.wsr ?? null) === w, `${tag}: wsr ${p.wsr} (nss-pins.json ${c.wsr}), want ${w}`);
    if (p.wsr) {
      nWsr++;
      const sp = WP[n].spots.find((s) => `s${s.slots[0]}` === p.wsr);
      const g = sp ? pxTo(p, sp) * d.scale : Infinity;
      wsrGap = Math.max(wsrGap, g);
      ok(g <= 0.3, `${tag}: ${g.toFixed(2)} yd from WSR spot ${p.wsr}, not within 0.3`);
    }
    // yd: the floor of the flat yards from the tee, GlfTeeOBJ, in NSS metres
    // (the floor of a value within 0.005 yd of an integer may go either way)
    const exact = flatYd(np.tees.teeObj.world, c.world);
    ok(Number.isInteger(p.yd) && (p.yd === Math.floor(exact) || (Math.abs(exact - Math.round(exact)) < 0.005 && Math.abs(p.yd - exact) < 1.005)), `${tag}: yd ${p.yd}, floor of ${exact.toFixed(3)} from GlfTeeOBJ`);
    // and the map frame agrees, at the hole's scale
    const viaMap = pxTo(d.tee, p) * d.scale;
    ydGap = Math.max(ydGap, Math.abs(viaMap - exact));
    ok(Math.abs(viaMap - exact) < 1.5, `${tag}: ${viaMap.toFixed(2)} yd from the tee on the map at ${d.scale} yd/px, ${exact.toFixed(2)} in NSS metres`);
    ok(Number.isInteger(p.seen) && p.seen >= 0, `${tag}: seen ${p.seen}`);
  });
  // the cups stand apart (no two one spot)
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) ok(pxTo(d.pins[a], d.pins[b]) >= 2, `H${n}: c${a} and c${b} ${pxTo(d.pins[a], d.pins[b]).toFixed(2)} px apart`);
}
ok(nDiff === 16, `${nDiff} difficult cups, not 16`);
ok(nWsr === 7, `${nWsr} cups on a WSR spot, not 7`);
console.log(`1. 21 holes x 6 NSS cups c0..c5 (labels 1-6, src nss) at nss-pins.json's points; difficult ${nDiff}, on a WSR spot ${nWsr} (<= ${wsrGap.toFixed(2)} yd from it); yd = floor(GlfTeeOBJ -> cup) in NSS metres, the map frame within ${ydGap.toFixed(2)} yd of it; no pinCandidates, pinZones, teeOnline or Switch-only pin`);

// 2. on the green
let onGreen = 0, inOutline = 0, terrains = 0;
for (let n = 1; n <= 21; n++) {
  const d = D[n];
  for (const p of d.pins) { const i = inPoly(p.x, p.y, d.greenPoly); inOutline += i ? 1 : 0; ok(i, `H${n} ${p.id}: outside the green outline`); }
  const f = join(ROOT, "public", "terrain", `h${String(n).padStart(2, "0")}.bin`);
  if (!existsSync(f)) { console.log(`   H${n}: no public/terrain file, the class check skipped`); continue; }
  const t = parseTerrain(readFileSync(f));
  terrains++;
  for (const p of d.pins) { const c = classAt(t, p.x, p.y); onGreen += c === 6 ? 1 : 0; ok(c === 6, `H${n} ${p.id}: terrain class ${c} under the cup, not 6 (green)`); }
}
console.log(`2. cups inside the green outline: ${inOutline} of 126; on terrain class 6 (green): ${onGreen} of ${terrains * 6} (${terrains} terrain files)`);

// 3. the tee (GlfTeeOBJ) and NSS's tee bones
let teeGapYd = [], teeMapYd = 0;
for (let n = 1; n <= 21; n++) {
  const d = D[n], st = WP[n].starts[0], t = NP[n].tees;
  ok(d.tee && Object.keys(d.tee).length === 2 && d.tee.x === t.teeObj.x && d.tee.y === t.teeObj.y, `H${n}: tee ${JSON.stringify(d.tee)}, GlfTeeOBJ is ${t.teeObj.x}, ${t.teeObj.y}`);
  ok(d.teeNss && d.teeNss.rotateObj.x === t.rotateObj.x && d.teeNss.rotateObj.y === t.rotateObj.y && d.teeNss.teeObj.x === t.teeObj.x && d.teeNss.teeObj.y === t.teeObj.y,
    `H${n}: teeNss ${JSON.stringify(d.teeNss)} is not nss-pins.json's rotateObj / teeObj`);
  // the map point and the bone agree: the WSR start (tools/wsr-pins.json, on
  // the map and in NSS metres) to the tee, both ways, at the hole's scale
  const gap = flatYd(t.wsrStart.world, t.teeObj.world), viaMap = pxTo(st, d.tee) * d.scale;
  teeGapYd.push(gap); teeMapYd = Math.max(teeMapYd, Math.abs(viaMap - gap));
  ok(Math.abs(viaMap - gap) < 0.05, `H${n}: the tee ${viaMap.toFixed(3)} yd from the WSR start on the map, ${gap.toFixed(3)} in NSS metres`);
}
console.log(`3. tee = GlfTeeOBJ on all 21 holes, ${Math.min(...teeGapYd).toFixed(2)}-${Math.max(...teeGapYd).toFixed(2)} yd from the WSR start (the map frame within ${teeMapYd.toFixed(3)} yd of NSS metres); teeNss = Glf_RotateOBJ and GlfTeeOBJ`);

// 4. the crediting, against the captures
const OBS = join(ROOT, "captures", "derived", "pin-observations.json");
if (!existsSync(OBS)) console.log("4. captures/derived/pin-observations.json absent: the crediting checks skipped");
else {
  const PO = JSON.parse(readFileSync(OBS, "utf8"));
  const tally = { credited: 0, ambiguous: 0, unmatched: 0 }, mostSeen = [], h1 = [];
  let maxPx = 0, local = 0, fitTee = 0, fitStart = 0, tieBroken = 0;
  for (let n = 1; n <= 21; n++) {
    const d = D[n], obs = PO[n] ?? [], np = NP[n];
    const at = (o) => ({ x: o.at[0] / W, y: o.at[1] / H });
    for (const p of d.pins) {
      const rounds = new Set(obs.filter((o) => o.result === p.id).map((o) => o.round));
      ok(p.seen === rounds.size, `H${n} ${p.id}: seen ${p.seen}, ${rounds.size} round(s) credited in pin-observations.json`);
    }
    let amb = 0, unm = 0;
    for (const o of obs) {
      const ds = d.pins.map((p) => ({ p, d: pxTo(at(o), p) })).sort((a, b) => a.d - b.d);
      const cup = d.pins.find((p) => p.id === o.result);
      if (cup) {
        tally.credited++;
        const dd = pxTo(at(o), cup);
        maxPx = Math.max(maxPx, dd);
        // pin-observations.json rounds `at` to 0.1 px
        ok(dd <= CUP_MATCH_PX + 0.08, `H${n} round ${o.round}: credited to ${cup.id} ${dd.toFixed(2)} px away`);
        if (o.tie) { tieBroken++; ok(o.tie.includes(cup.id), `H${n} round ${o.round}: a tie ${o.tie} credited to ${cup.id}`); }
        else ok(cup === ds[0].p, `H${n} round ${o.round}: credited to ${cup.id}, the nearest cup is ${ds[0].p.id}`);
        if (!o.online) {
          const c = np.cups[cup.k];
          for (const b of o.badges ?? []) {
            const m = (P) => b - flatYd(P, c.world);
            local++; const mt = m(np.tees.teeObj.world), ms = m(np.tees.wsrStart.world);
            fitTee += mt > -1.1 && mt <= 0.1 ? 1 : 0; fitStart += ms > -1.1 && ms <= 0.1 ? 1 : 0;
            if (n === 1) {
              // the H1 decision: the badge fits from GlfTeeOBJ, not from Glf_RotateOBJ
              const mr = m(np.tees.rotateObj.world);
              h1.push(`${cup.id} ${b} yd: GlfTeeOBJ ${mt.toFixed(2)}, Glf_RotateOBJ ${mr.toFixed(2)}`);
              ok(mt > -1.1 && mt <= 0.1 && !(mr > -1.1 && mr <= 0.1), `H1 round ${o.round}: badge ${b} to ${cup.id} is ${mt.toFixed(2)} yd off floor(GlfTeeOBJ -> cup), ${mr.toFixed(2)} off floor(Glf_RotateOBJ -> cup)`);
            }
          }
        }
      } else if (/^ambiguous /.test(o.result)) {
        tally.ambiguous++; amb++;
        ok(o.tie?.length === 2 && ds[1].d - ds[0].d < AMBIG_PX + 0.15, `H${n} round ${o.round}: ambiguous but the next cup is ${(ds[1].d - ds[0].d).toFixed(2)} px further`);
      } else if (/^unmatched/.test(o.result)) {
        tally.unmatched++; unm++;
        ok(ds[0].d > CUP_MATCH_PX - 0.08, `H${n} round ${o.round}: unmatched but ${ds[0].d.toFixed(2)} px from ${ds[0].p.id}`);
      } else ok(false, `H${n} round ${o.round}: result "${o.result}"`);
    }
    ok(amb === d.pinAmbiguous.length && unm === d.pinUnmatched.length, `H${n}: ${amb} ambiguous / ${unm} unmatched observations, derived.json lists ${d.pinAmbiguous.length} / ${d.pinUnmatched.length}`);
    for (const a of d.pinAmbiguous) ok(a.cups?.length === 2 && a.cups.every((id) => d.pins.some((p) => p.id === id)), `H${n}: pinAmbiguous ${JSON.stringify(a)}`);
    for (const u of d.pinUnmatched) ok(d.pins.some((p) => p.id === u.nearest) && u.px > CUP_MATCH_PX, `H${n}: pinUnmatched ${JSON.stringify(u)}`);
    const top = d.pins.reduce((b, p) => ((p.seen ?? 0) > (b.seen ?? 0) ? p : b), d.pins[0]);
    mostSeen.push(`H${n} ${top.id}${top.seen ? "" : " (none seen)"}`);
  }
  console.log(`4. ${tally.credited + tally.ambiguous + tally.unmatched} observations: ${tally.credited} credited (within ${maxPx.toFixed(2)} px of their cup; ${tieBroken} near tie(s) the badges split), ${tally.ambiguous} ambiguous, ${tally.unmatched} unmatched; seen = the credited rounds on every cup`);
  console.log(`   local badges of credited cups: ${fitTee} of ${local} fit floor(GlfTeeOBJ -> cup) (+-0.1 yd), ${fitStart} floor(WSR start -> cup)`);
  ok(h1.length >= 2, `H1: ${h1.length} local badges credited to a cup, the tee decision needs some`);
  console.log(`   H1's local badges (badge - yd, the window (-1.1, 0.1]): ${h1.join("; ")}`);
  console.log(`   most-seen cup (the default line): ${mostSeen.join(", ")}`);
}

console.log(fails ? `${fails} of ${checks} checks FAILED` : `all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
