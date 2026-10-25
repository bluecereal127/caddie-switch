// Acceptance for derived.json's online tee platform (tools/build-derived.mjs,
// `platform`, from tools/nss-platform.json), parts 1 and 2 (part 3, the app's
// platform helpers, is tools/test-platform-helpers.mjs):
//   1. on the committed files: every hole ships the platform and no teeOnline;
//      per tier the seven standing spots from the player's left to the right
//      as the player faces the green (localX 3.45 ... -3.45 m: the four slot
//      bones L2, L1, R1, R2 and the midpoints between them), each at
//      nss-platform.json's map point, the midpoints midway, left to right on
//      the map across facingDeg, neighbours 1.15 m apart, the high tier 3.5 m
//      behind the low one along facingDeg, the platform's origin
//      (teeNss.rotateObj, Glf_RotateOBJ) 2.0 m behind the low row and 1.5 m
//      ahead of the high one, zYd the mats (0.0996 / 1.668 m, + the origin's
//      height) above the datum and above the ground under them; the pose
//      itself, origin and yawDeg (nss-platform.json's: Glf_RotateOBJ) with
//      the hole's NSS -> map transform (nss-registration.json's a, b, tx, ty
//      to the bit), from which every standing spot lands within 0.003 px of
//      its shipped point; the low row's centre within 12 yd of the tee
//      (GlfTeeOBJ);
//   2. with the captures (captures/derived/pin-observations.json) and
//      tools/online-rounds.json's 13 judged rounds: a badge is the floor of
//      the flat yards from the ball to the cup, so for each round a standing
//      spot of the judged tier fits its badges (badge - yards in (-1.1, 0.1])
//      and no spot of the other tier does; skipped without the captures.
//   node tools/test-platform.mjs
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const J = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), "utf8"));
const derived = J("public", "derived.json"), D = derived.holes;
const NPL = J("tools", "nss-platform.json"), PL = NPL.holes, NP = J("tools", "nss-pins.json").holes, REG = J("tools", "nss-registration.json").holes;
const W = derived.mapW, H = derived.mapH, YD = 0.9144;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log(`FAIL ${m}`); } };
const STANDING_X = [3.45, 2.3, 1.15, 0, -1.15, -2.3, -3.45];
const SIDES = ["L2", ["L2", "L1"], "L1", ["L1", "R1"], "R1", ["R1", "R2"], "R2"];
const MATS = { low: 0.099609375, high: 1.66796875 };
const BACK_M = 3.5, LOW_Z = 2.0, HIGH_Z = -1.5, TOL = 0.1;
const range = (a) => `${Math.min(...a).toFixed(3)}-${Math.max(...a).toFixed(3)}`;

// 1. the platform per hole
ok(JSON.stringify(NPL.standingX) === JSON.stringify(STANDING_X), `nss-platform.json standingX ${JSON.stringify(NPL.standingX)}`);
for (const tier of ["low", "high"]) ok(NPL.tiers?.[tier]?.matY === MATS[tier], `nss-platform.json's ${tier} mat at ${NPL.tiers?.[tier]?.matY} m, not ${MATS[tier]}`);
const gaps = [], backs = [], lats = [], origLow = [], origHigh = [], fromTee = [], zs = { low: [], high: [] };
let poseOff = 0;
// platform-local z of each tier's row (m): the slot bones' z
const ROW_Z = { low: LOW_Z, high: HIGH_Z };
for (let n = 1; n <= 21; n++) {
  const d = D[n], pf = d?.platform, pl = PL[n], tag = `H${n}`;
  ok(d && !("teeOnline" in d), `${tag}: derived.json still ships teeOnline`);
  ok(pf && Number.isFinite(pf.facingDeg) && pf.facingDeg >= 0 && pf.facingDeg < 360 && pf.facingDeg === pl.facingDeg, `${tag}: facingDeg ${pf?.facingDeg}, nss-platform.json ${pl.facingDeg}`);
  if (!pf?.tiers) continue;
  ok(JSON.stringify(Object.keys(pf)) === JSON.stringify(["facingDeg", "origin", "yawDeg", "transform", "tiers", "observed"]) && JSON.stringify(Object.keys(pf.tiers)) === JSON.stringify(["high", "low"]), `${tag}: platform keys ${Object.keys(pf)} / ${Object.keys(pf.tiers)}`);
  // the pose and the transform, exactly the committed sources'
  const reg = REG[n], tf = pf.transform;
  ok(Array.isArray(pf.origin) && pf.origin.length === 3 && pf.origin.every((v, i) => v === pl.origin[i]) && pf.yawDeg === pl.yawDeg, `${tag}: origin ${JSON.stringify(pf.origin)} yawDeg ${pf.yawDeg}, nss-platform.json ${JSON.stringify(pl.origin)} ${pl.yawDeg}`);
  ok(tf && JSON.stringify(Object.keys(tf)) === JSON.stringify(["a", "b", "tx", "ty"]) && ["a", "b", "tx", "ty"].every((k) => tf[k] === reg[k]), `${tag}: transform ${JSON.stringify(tf)}, nss-registration.json ${JSON.stringify({ a: reg.a, b: reg.b, tx: reg.tx, ty: reg.ty })}`);
  // world = origin + Ry(yaw) * local, Ry = [[c, 0, s], [0, 1, 0], [-s, 0, c]]; map px = a x - b z + tx, b x + a z + ty
  if (tf && Array.isArray(pf.origin)) {
    const yw = (pf.yawDeg * Math.PI) / 180, c = Math.cos(yw), sn = Math.sin(yw), [ox, , oz] = pf.origin;
    for (const tier of ["low", "high"]) (pf.tiers[tier] ?? []).forEach((p, i) => {
      const lx = STANDING_X[i], lz = ROW_Z[tier], wx = ox + c * lx + sn * lz, wz = oz - sn * lx + c * lz;
      const d = Math.hypot(tf.a * wx - tf.b * wz + tf.tx - p.x * W, tf.b * wx + tf.a * wz + tf.ty - p.y * H);
      poseOff = Math.max(poseOff, d);
      ok(d <= 0.003, `${tag} ${tier} spot ${i}: the pose and transform put it ${d.toFixed(4)} px from its shipped point`);
    });
  }
  const f = (pf.facingDeg * Math.PI) / 180, fwd = [Math.sin(f), -Math.cos(f)], right = [Math.cos(f), Math.sin(f)];
  const px = (p) => [p.x * W, p.y * H];
  const along = (a, b, u) => ((px(b)[0] - px(a)[0]) * u[0] + (px(b)[1] - px(a)[1]) * u[1]) * d.scale; // yd from a to b along unit u
  for (const tier of ["low", "high"]) {
    const ps = pf.tiers[tier], src = pl.tiers[tier];
    ok(Array.isArray(ps) && ps.length === 7, `${tag} ${tier}: ${ps?.length} standing spots, not 7`);
    if (ps?.length !== 7) continue;
    const zWant = (MATS[tier] + pl.origin[1]) / YD;
    ps.forEach((p, i) => {
      const s = src[i], at = `${tag} ${tier} spot ${i}`;
      ok(p.localX === STANDING_X[i], `${at}: localX ${p.localX}, want ${STANDING_X[i]}`);
      ok(typeof SIDES[i] === "string" ? p.side === SIDES[i] && !("between" in p) : JSON.stringify(p.between) === JSON.stringify(SIDES[i]) && !("side" in p), `${at}: side ${p.side} / between ${p.between}, want ${SIDES[i]}`);
      ok(p.x === s.x && p.y === s.y, `${at}: ${p.x}, ${p.y}, nss-platform.json ${s.x}, ${s.y}`);
      ok(Math.abs(p.zYd - zWant) < 1e-4 && p.zYd === s.z, `${at}: zYd ${p.zYd}, the mat is ${zWant.toFixed(4)}`);
      ok((p.groundYd === null && p.ground === null) || (Number.isFinite(p.groundYd) && typeof p.ground === "string" && p.groundYd === s.groundZ && p.ground === s.ground), `${at}: ground ${p.groundYd} ${p.ground}`);
      if (p.groundYd != null) ok(p.zYd - p.groundYd >= 0.1, `${at}: the mat ${p.zYd} yd is not above the ground ${p.groundYd}`);
      zs[tier].push(p.zYd);
      if (i % 2 === 1) ok(Math.abs(p.x - (ps[i - 1].x + ps[i + 1].x) / 2) < 2e-5 && Math.abs(p.y - (ps[i - 1].y + ps[i + 1].y) / 2) < 2e-5, `${at}: not midway between spots ${i - 1} and ${i + 1}`);
      if (i > 0) {
        const step = along(ps[i - 1], p, right);
        ok(step > 0, `${at}: not right of spot ${i - 1} across facingDeg (${step.toFixed(3)} yd)`);
        const g = Math.hypot(px(p)[0] - px(ps[i - 1])[0], px(p)[1] - px(ps[i - 1])[1]) * d.scale;
        gaps.push(g);
        ok(Math.abs(g - 1.15 / YD) < 0.05, `${at}: ${g.toFixed(3)} yd from spot ${i - 1}, not 1.15 m = ${(1.15 / YD).toFixed(3)} yd`);
      }
    });
  }
  if (pf.tiers.low.length !== 7 || pf.tiers.high.length !== 7) continue;
  // the high tier behind the low one, the origin between them
  pf.tiers.low.forEach((lo, i) => {
    const hi = pf.tiers.high[i], b = along(lo, hi, fwd), l = along(lo, hi, right);
    backs.push(-b); lats.push(l);
    ok(Math.abs(-b - BACK_M / YD) < 0.06 && Math.abs(l) < 0.06, `${tag} spot ${i}: the high tier ${(-b).toFixed(3)} yd behind the low and ${l.toFixed(3)} across, want ${(BACK_M / YD).toFixed(3)} / 0`);
  });
  const o = d.teeNss?.rotateObj;
  ok(o && o.x === NP[n].tees.rotateObj.x && o.y === NP[n].tees.rotateObj.y, `${tag}: teeNss.rotateObj ${JSON.stringify(o)}`);
  if (o) {
    const cl = pf.tiers.low[3], ch = pf.tiers.high[3];
    origLow.push(along(o, cl, fwd)); origHigh.push(along(o, ch, fwd));
    ok(Math.abs(along(o, cl, fwd) - LOW_Z / YD) < 0.05 && Math.abs(along(o, cl, right)) < 0.05, `${tag}: the low row's centre ${along(o, cl, fwd).toFixed(3)} yd ahead of Glf_RotateOBJ (${along(o, cl, right).toFixed(3)} across), want ${(LOW_Z / YD).toFixed(3)}`);
    ok(Math.abs(along(o, ch, fwd) - HIGH_Z / YD) < 0.05 && Math.abs(along(o, ch, right)) < 0.05, `${tag}: the high row's centre ${along(o, ch, fwd).toFixed(3)} yd ahead of Glf_RotateOBJ, want ${(HIGH_Z / YD).toFixed(3)}`);
  }
  const t = Math.hypot((pf.tiers.low[3].x - d.tee.x) * W, (pf.tiers.low[3].y - d.tee.y) * H) * d.scale;
  fromTee.push(t);
  ok(t <= 12, `${tag}: the low row's centre ${t.toFixed(1)} yd from the tee (GlfTeeOBJ)`);
  const ob = pf.observed;
  ok(ob === null || (Number.isFinite(ob.x) && Number.isFinite(ob.y) && Number.isInteger(ob.n) && ob.n >= 2 && Number.isInteger(ob.rounds) && ob.rounds >= 1), `${tag}: observed ${JSON.stringify(ob)}`);
}
const obsHoles = Object.keys(D).filter((n) => D[n].platform?.observed).map(Number).sort((a, b) => a - b);
const obsGap = obsHoles.map((n) => { const pf = D[n].platform, ob = pf.observed; return Math.min(...[...pf.tiers.low, ...pf.tiers.high].map((p) => Math.hypot((p.x - ob.x) * W, (p.y - ob.y) * H) * D[n].scale)); });
console.log(`1. 21 holes x 2 tiers x 7 standing spots at nss-platform.json's points, left to right across facingDeg; neighbours ${range(gaps)} yd apart (1.15 m = ${(1.15 / YD).toFixed(3)}); high ${range(backs)} yd behind low (3.5 m = ${(BACK_M / YD).toFixed(3)}), ${range(lats)} across; rows ${range(origLow)} / ${range(origHigh)} yd from Glf_RotateOBJ (2.0 / -1.5 m); zYd low ${range(zs.low)}, high ${range(zs.high)}; the low centre ${range(fromTee)} yd from the tee (GlfTeeOBJ); no teeOnline`);
 console.log(`   origin, yawDeg and transform = nss-platform.json's and nss-registration.json's on all 21 holes; through them every standing spot within ${poseOff.toFixed(4)} px of its shipped point`);
console.log(`   observed (the online frames' median avatar) on holes ${obsHoles.join(", ")}: ${range(obsGap)} yd from the nearest standing spot`);

// 2. the judged rounds against the badges
const OBS = join(ROOT, "captures", "derived", "pin-observations.json"), OR = join(ROOT, "tools", "online-rounds.json");
if (!existsSync(OBS) || !existsSync(OR)) console.log("2. captures/derived/pin-observations.json or tools/online-rounds.json absent: the judged rounds skipped");
else {
  const PO = JSON.parse(readFileSync(OBS, "utf8")), rounds = JSON.parse(readFileSync(OR, "utf8")).rounds;
  const flatYd = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2) / YD;
  const fits = (m) => m > -1 - TOL && m <= TOL;
  const offWindow = (m) => (m > TOL ? m - TOL : m <= -1 - TOL ? -1 - TOL - m : 0);
  const rows = [];
  let margin = Infinity;
  for (const r of rounds) {
    const tier = r.tier === "upper" ? "high" : r.tier === "lower" ? "low" : null, other = tier === "high" ? "low" : "high";
    ok(tier, `online-rounds.json: H${r.hole} W${r.wind} tier "${r.tier}"`);
    const os = (PO[r.hole] ?? []).filter((o) => o.online && String(o.wind) === String(r.wind) && /^c\d$/.test(o.result) && o.badges?.length);
    ok(os.length >= 1, `H${r.hole} W${r.wind}: no online observation credited to a cup with a badge`);
    for (const o of os) {
      const cup = NP[r.hole].cups[+o.result.slice(1)].world;
      for (const b of new Set(o.badges)) {
        const m = (t) => PL[r.hole].tiers[t].map((p) => ({ p, m: b - flatYd(p.world, cup) }));
        const mine = m(tier), theirs = m(other);
        const fit = mine.filter((q) => fits(q.m)), wrong = theirs.filter((q) => fits(q.m));
        const near = Math.min(...theirs.map((q) => offWindow(q.m)));
        margin = Math.min(margin, near);
        ok(fit.length > 0, `H${r.hole} W${r.wind} (${r.tier}): badge ${b} to ${o.result} fits no ${tier} spot (badge - yd ${mine.map((q) => q.m.toFixed(2)).join(" ")})`);
        ok(wrong.length === 0, `H${r.hole} W${r.wind} (${r.tier}): badge ${b} to ${o.result} also fits the ${other} tier at ${wrong.map((q) => q.p.side ?? q.p.between.join("|")).join(", ")}`);
        const best = [...mine].sort((p, q) => offWindow(p.m) - offWindow(q.m) || Math.abs(p.m + 0.5) - Math.abs(q.m + 0.5))[0];
        rows.push(`H${r.hole} W${r.wind} ${tier}: ${o.result} badge ${b}, fits ${fit.map((q) => q.p.side ?? q.p.between.join("|")).join(" ") || "none"} (best ${(best.m).toFixed(2)}); the ${other} tier ${near.toFixed(2)} yd off the window`);
      }
    }
  }
  console.log(`2. ${rounds.length} judged online rounds: each badge fits a standing spot of its own tier and none of the other's (the nearest other-tier miss ${margin.toFixed(2)} yd outside the window)`);
  for (const s of rows) console.log(`   ${s}`);
}

console.log(fails ? `${fails} of ${checks} checks FAILED` : `all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
