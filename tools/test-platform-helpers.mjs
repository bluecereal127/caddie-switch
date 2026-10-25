// node tools/test-platform-helpers.mjs [repoRoot]
// src/platform.js, the online platform's helpers, against the committed files
// and, when the eden dump is present, its decode (nss-golf-x/slots.json):
// a. the rule: the masks (one bit per player), tierStandXs for every player
//    count and tier (the even counts on the bones, the odd ones between them,
//    every group centred, from the left), layoutOf = VALID_COUNTS, the tier,
//    mat and hand constants, all against slots.json's own when present;
// b. onlineOf: anything not an object -> the default, field by field
//    otherwise (a tier, count or hand outside its set -> the default's),
//    place clamped into the tier, the first form's 0-based index read,
//    idempotent on 2,000 random keys;
// c. checkOnline / pairWith / fixOnline on every input: ok exactly when the
//    player's own tier holds a count it shows (high 1-4, low 2-4), whatever
//    the other tier's count (slots.md section 1: the place depends only on
//    the own tier, its count, the place and the hand), pairOk exactly on
//    NSS's pairs; partnerCounts / playersFor against VALID_COUNTS and the
//    spots (every N seating a tier count gives the same spots); pairWith
//    keeps the kept tier's count and moves the other to the nearest count
//    NSS seats beside it (the table in src/platform.js); fixOnline always a
//    pair NSS seats with the player's tier, hand and on kept, and the own
//    count unless the own tier was empty;
// d. ballOf on all 21 holes, every (tier, counts, place, hand) NSS makes
//    (72 a hole, 1,512 in all): with the exact geometry (derived.json's
//    platform plus tools/nss-platform.json's origin / yawDeg and
//    tools/nss-registration.json's transform, as derived.json may ship them)
//    within 0.002 px of slots.json's table (and its heightYd within 1e-4 yd),
//    within 0.002 px of tools/nss-platform.json's committed per-spot balls
//    (no dump needed), and derived.json's platform as shipped (the spot fit
//    unless it carries the exact fields) within 0.004 px of slots.json and of
//    the exact form, printed; the places left to right as the player faces
//    the green, the ball 0.9 m to a right-hander's right of where he stands
//    and to a left-hander's left; an input pair NSS never seats -> the ball
//    of the same own tier, count, place and hand (fixOnline's), an empty own
//    tier or a platform with no geometry -> null;
// e. startOf: offline -> the tee, online -> the ball, an empty own tier or
//    no platform -> the tee, neither -> null;
// f. onPlatform: every ball found (its tier and mat), a nudged ball, the tee
//    and the standing spots off it;
// g. slotLift against public/terrain: exactly the mat less the terrain's
//    ground (never below 0), within 0.1 yd of the mat on every ball; the mat
//    itself without terrain; printed per tier.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const P = await imp("src/platform.js");
const { parseTerrain, heightAt } = await imp("src/terrain.js");
const J = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const NSSPL = J("tools/nss-platform.json").holes;
const REG = J("tools/nss-registration.json").holes;
const DERIVED = J("public/derived.json").holes;
const TERRAIN_INDEX = J("public/terrain/index.json");
const SLOTS_FILE = join(root, "tools/harness/state/eden/nss-golf-x/slots.json");
const SLOTS = existsSync(SLOTS_FILE) ? JSON.parse(readFileSync(SLOTS_FILE, "utf8")) : null;
const MAP_W = 250, MAP_H = 304, PX_TOL = 0.002;
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; if (fails <= 60) console.log("FAIL:", msg); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const pxOff = (p, q) => Math.sqrt(((p.x - q.x) * MAP_W) ** 2 + ((p.y - q.y) * MAP_H) ** 2);
const popcount = (m) => { let n = 0; for (; m; m >>= 1) n += m & 1; return n; };

// ---- a. the rule ----
ok(eq(P.MASKS, [0x20, 0x60, 0x70, 0xf0, 0x76, 0x7e, 0xfe, 0xff]), `MASKS ${P.MASKS}`);
ok(P.MASKS.every((m, i) => popcount(m) === i + 1), "a mask does not hold its player count");
ok(eq(P.BONE_X, [-3.45, -1.15, 1.15, 3.45, -3.45, -1.15, 1.15, 3.45]), `BONE_X ${P.BONE_X}`);
ok(P.TIER.low.matY === 0.099609 && P.TIER.high.matY === 1.667969 && P.TIER.low.z === 2 && P.TIER.high.z === -1.5, "tier mats / z");
ok(P.HAND_OFFSET_M.right === -0.9 && P.HAND_OFFSET_M.left === 0.9, "hand offsets");
ok(eq(P.VALID_COUNTS, [[1, 0], [2, 0], [3, 0], [4, 0], [3, 2], [3, 3], [4, 3], [4, 4]]), "VALID_COUNTS");
// the standing x's per count on a tier, from the left (the unit's own table)
const BY_COUNT = { 1: [0], 2: [1.15, -1.15], 3: [2.3, 0, -2.3], 4: [3.45, 1.15, -1.15, -3.45] };
const close = (xs, ys) => xs.length === ys.length && xs.every((x, i) => near(x, ys[i], 1e-12));
for (let N = 1; N <= 8; N++) {
  const lay = P.layoutOf(N);
  ok(eq(lay, { countHigh: P.VALID_COUNTS[N - 1][0], countLow: P.VALID_COUNTS[N - 1][1] }), `layoutOf(${N}) ${JSON.stringify(lay)}`);
  for (const tier of P.TIERS) {
    const xs = P.tierStandXs(N, tier), n = tier === "high" ? lay.countHigh : lay.countLow;
    ok(xs.length === n && (n === 0 || close(xs, BY_COUNT[n])), `${N} players, ${tier}: ${xs}`);
    ok(near(xs.reduce((s, x) => s + x, 0), 0, 1e-12), `${N} players, ${tier}: not centred`);
  }
  ok(lay.countLow !== 1 && (N > 4 || lay.countLow === 0), `${N} players: low tier ${lay.countLow}`);
}
ok(P.layoutOf(0) == null && P.layoutOf(9) == null && P.layoutOf(2.5) == null && eq(P.tierStandXs(3, "mid"), []), "layoutOf / tierStandXs outside the rule");
if (SLOTS) {
  ok(eq(SLOTS.masks.bytes.map((b) => parseInt(b, 16)), P.MASKS), "slots.json masks");
  ok(eq(SLOTS.validCounts, P.VALID_COUNTS), "slots.json validCounts");
  ok(SLOTS.bones.every((b) => b.local[0] === P.BONE_X[b.slot] && b.tier === (b.slot < 4 ? "low" : "high") && b.local[2] === P.TIER[b.tier].z), "slots.json bones");
  ok(SLOTS.heights.matLocalY_m.low === P.TIER.low.matY && SLOTS.heights.matLocalY_m.high === P.TIER.high.matY, "slots.json mats");
  ok(SLOTS.ballOffset.alongLocalX_m.rightHanded === P.HAND_OFFSET_M.right && SLOTS.ballOffset.alongLocalX_m.leftHanded === P.HAND_OFFSET_M.left, "slots.json ball offset");
  for (const [k, xs] of Object.entries(SLOTS.byTierCount)) { const [tier, n] = k.split("-"); ok(close(BY_COUNT[n], xs), `slots.json byTierCount ${k}`); }
  for (let N = 1; N <= 8; N++) for (const tier of P.TIERS) ok(close(P.tierStandXs(N, tier), SLOTS.byCount[N][tier]), `slots.json byCount ${N} ${tier}`);
  console.log("a. the rule matches slots.json (masks, bones, mats, hand offset, 8 player counts)");
} else console.log("a. the eden dump's slots.json is absent: the rule checked against its own table only");

// ---- b. onlineOf ----
const D = P.ONLINE_DEFAULT;
ok(eq(D, { on: false, tier: "high", countHigh: 4, countLow: 4, place: 1, hand: "right" }), `ONLINE_DEFAULT ${JSON.stringify(D)}`);
for (const v of [null, undefined, 0, 5, "x", true, [], [1, 2]]) {
  const o = P.onlineOf(v);
  ok(eq(o, D) && o !== D, `onlineOf(${JSON.stringify(v)}) = ${JSON.stringify(o)}`);
}
const good = { on: true, tier: "low", countHigh: 3, countLow: 2, place: 2, hand: "left" };
ok(eq(P.onlineOf(good), good), "a valid key not kept");
ok(eq(P.onlineOf({ ...good, extra: 1, side: "R2", index: 0 }), good), "extra keys kept, or index over place");
ok(P.onlineOf({ ...good, on: "true" }).on === false && P.onlineOf({ ...good, on: 1 }).on === false, "on is not strictly true");
ok(P.onlineOf({ ...good, tier: "upper" }).tier === "high" && P.onlineOf({ ...good, hand: "Left" }).hand === "right", "a bad tier or hand");
for (const bad of [5, -1, 1.5, "2", null, NaN, 0]) ok(P.onlineOf({ ...good, countHigh: bad }).countHigh === 4, `countHigh ${bad} not the default`);
for (const bad of [1, 5, -1, 2.5, "3", null]) ok(P.onlineOf({ ...good, countLow: bad }).countLow === 4, `countLow ${bad} not the default`);
ok(P.onlineOf({ ...good, countLow: 0 }).countLow === 0 && P.onlineOf({ ...good, countLow: 0 }).place === 1, "an empty low tier");
ok(P.onlineOf({ ...good, place: 7 }).place === 2 && P.onlineOf({ ...good, place: 0 }).place === 1 && P.onlineOf({ ...good, place: 1.5 }).place === 1
  && P.onlineOf({ tier: "high", countHigh: 1, place: 3 }).place === 1, "place not clamped into the tier");
ok(P.onlineOf({ tier: "low", countLow: 4, index: 2 }).place === 3 && P.onlineOf({ tier: "low", countLow: 2, index: 3 }).place === 2, "the first form's index not read");
let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
for (let k = 0; k < 2000; k++) {
  const v = { on: pick([true, false, "yes", undefined]), tier: pick(["low", "high", "x", undefined]), countLow: pick([0, 1, 2, 3, 4, 5, -1, 2.5, undefined]),
    countHigh: pick([0, 1, 2, 3, 4, 7, undefined]), place: pick([0, 1, 2, 3, 4, 5, -2, 0.5, undefined]), hand: pick(["right", "left", "both", undefined]), index: pick([0, 2, undefined]) };
  const o = P.onlineOf(v), n = o.tier === "low" ? o.countLow : o.countHigh;
  ok(eq(P.onlineOf(o), o) && P.TIERS.includes(o.tier) && P.HANDS.includes(o.hand) && P.HIGH_COUNTS.includes(o.countHigh) && P.LOW_COUNTS.includes(o.countLow)
    && Number.isInteger(o.place) && o.place >= 1 && o.place <= Math.max(1, n), `onlineOf(${JSON.stringify(v)}) = ${JSON.stringify(o)}`);
}

// ---- c. checkOnline / pairWith / fixOnline ----
// partnerCounts and playersFor against the pairs, and the spots a tier count
// gives under every N that seats it
const PARTNERS = { high: { 1: [0], 2: [0], 3: [0, 2, 3], 4: [0, 3, 4] }, low: { 0: [1, 2, 3, 4], 2: [3], 3: [3, 4], 4: [4] } };
for (const tier of P.TIERS) for (const n of tier === "high" ? P.HIGH_COUNTS : P.LOW_COUNTS) {
  ok(eq(P.partnerCounts(tier, n), PARTNERS[tier][n]), `partnerCounts(${tier}, ${n}) = ${JSON.stringify(P.partnerCounts(tier, n))}`);
  const Ns = P.VALID_COUNTS.map((c, i) => [c, i + 1]).filter(([c]) => c[tier === "high" ? 0 : 1] === n).map(([, N]) => N);
  const N0 = P.playersFor(tier, n);
  ok(n === 0 ? N0 === null : Ns.includes(N0) && Ns.every((N) => eq(P.tierStandXs(N, tier), P.tierStandXs(N0, tier))) && P.tierStandXs(N0, tier).length === n,
    `playersFor(${tier}, ${n}) = ${N0}: not one of ${JSON.stringify(Ns)} or the spots differ between them`);
}
ok(P.playersFor("low", 1) === null && P.playersFor("high", 0) === null && P.playersFor("mid", 2) === null && eq(P.partnerCounts("mid", 2), []), "playersFor / partnerCounts outside the tiers' counts");
const inputs = [];
for (const tier of P.TIERS) for (const countHigh of P.HIGH_COUNTS) for (const countLow of P.LOW_COUNTS) for (let place = 1; place <= 4; place++) for (const hand of P.HANDS)
  inputs.push({ on: true, tier, countHigh, countLow, place, hand });
const nearestOf = (cand, cur) => cand.reduce((b, c) => (Math.abs(c - cur) < Math.abs(b - cur) || (Math.abs(c - cur) === Math.abs(b - cur) && c > b) ? c : b), cand[0]);
const key = (t) => (t === "high" ? "countHigh" : "countLow"), otherKey = (t) => (t === "high" ? "countLow" : "countHigh");
let nOk = 0, nPair = 0, fixKept = 0, fixEmpty = 0;
for (const v of inputs) {
  const c = P.checkOnline(v), o = P.onlineOf(v);
  const pair = P.VALID_COUNTS.some(([h, l]) => h === o.countHigh && l === o.countLow), mine = o[key(o.tier)];
  const mineOk = o.tier === "high" ? mine >= 1 && mine <= 4 : mine >= 2 && mine <= 4;
  ok(c.ok === mineOk && c.pairOk === pair && c.mine === mine && c.players === P.playersFor(o.tier, mine) && eq(c.partners, P.partnerCounts(o.tier, mine))
    && c.total === o.countHigh + o.countLow && eq(c.nss, P.layoutOf(c.total)) && eq(c.online, o), `checkOnline(${JSON.stringify(v)}) = ${JSON.stringify(c)}`);
  // pairWith, keeping either tier's count
  for (const keep of P.TIERS) {
    const w = P.pairWith(v, keep), cand = P.partnerCounts(keep, o[key(keep)]);
    ok(w[key(keep)] === o[key(keep)] && w[otherKey(keep)] === nearestOf(cand, o[otherKey(keep)]) && P.checkOnline(w).pairOk && w.tier === o.tier && w.hand === o.hand && w.on === o.on
      && (pair ? eq(w, o) : true), `pairWith(${JSON.stringify(v)}, ${keep}) = ${JSON.stringify(w)}`);
  }
  // fixOnline: a pair NSS seats, the tier, hand and on kept, the own count kept unless the tier was empty
  const f = P.fixOnline(v), cf = P.checkOnline(f);
  ok(cf.ok && cf.pairOk && f.tier === o.tier && f.hand === o.hand && f.on === o.on && (pair && mineOk ? eq(f, o) : true)
    && (mineOk ? f[key(o.tier)] === mine && eq(f, P.pairWith(o, o.tier)) : f.tier === "low" && f.countLow === (o.countHigh === 4 ? 3 : 2)),
    `fixOnline(${JSON.stringify(v)}) = ${JSON.stringify(f)}`);
  if (mineOk) fixKept++; else fixEmpty++;
  if (c.ok) nOk++;
  if (pair && c.ok) nPair++;
}
// the examples the fix was asked for (the player's own tier and count kept)
for (const [v, want] of [
  [{ tier: "low", countHigh: 2, countLow: 2 }, [3, 2]], [{ tier: "high", countHigh: 3, countLow: 4 }, [3, 3]],
  [{ tier: "high", countHigh: 2, countLow: 4 }, [2, 0]], [{ tier: "high", countHigh: 4, countLow: 2 }, [4, 3]],
  [{ tier: "low", countHigh: 1, countLow: 3 }, [3, 3]], [{ tier: "low", countHigh: 3, countLow: 4 }, [4, 4]],
]) {
  const f = P.fixOnline({ ...v, place: 1, hand: "right" });
  ok(f.tier === v.tier && f.countHigh === want[0] && f.countLow === want[1], `fixOnline(${JSON.stringify(v)}) = ${f.countHigh} + ${f.countLow}, expected ${want.join(" + ")}`);
}
console.log(`c. ${nOk} of ${inputs.length} inputs place a ball (own tier count shown), ${nPair} of them a pair NSS seats; pairWith on both tiers and fixOnline map the rest onto NSS's pairs (${fixKept} keeping the own count, ${fixEmpty} with an empty own tier)`);

// ---- d-g on every hole ----
const valid = [];
for (const [countHigh, countLow] of P.VALID_COUNTS) for (const tier of P.TIERS) {
  const n = tier === "high" ? countHigh : countLow;
  for (let place = 1; place <= n; place++) for (const hand of P.HANDS) valid.push({ on: true, tier, countHigh, countLow, place, hand });
}
ok(valid.length === 72, `${valid.length} placements a hole, not 72`);
const shippedExact = Object.values(DERIVED).every((d) => P.geometryOf(d.platform)?.exact);
const stats = { slots: 0, nssBall: 0, shipped: 0, shippedVsExact: 0, height: 0, n: 0, nSlots: 0 };
const lifts = { low: [], high: [] };
const nssTerrain = TERRAIN_INDEX.source === "nss";
for (let n = 1; n <= 21; n++) {
  const tag = `H${n}`, dpl = DERIVED[n].platform, npl = NSSPL[n], reg = REG[n];
  const exactPl = { ...dpl, origin: npl.origin, yawDeg: npl.yawDeg, transform: { a: reg.a, b: reg.b, tx: reg.tx, ty: reg.ty } };
  ok(P.geometryOf(exactPl)?.exact === true && P.geometryOf(dpl) && P.geometryOf(npl)?.exact === false, `${tag}: geometryOf forms`);
  const sh = SLOTS?.perHole[String(n).padStart(2, "0")];
  const th = (dpl.facingDeg * Math.PI) / 180, right = [Math.cos(th), Math.sin(th)];
  const toRight = (a, b) => (b.x - a.x) * MAP_W * right[0] + (b.y - a.y) * MAP_H * right[1];
  const t = parseTerrain(readFileSync(join(root, `public/terrain/h${String(n).padStart(2, "0")}.bin`)));
  const zMat = { low: ((n === 3 ? 0.1 : 0) + 0.099609) / 0.9144, high: ((n === 3 ? 0.1 : 0) + 1.667969) / 0.9144 };
  const rows = new Map();
  for (const v of valid) {
    const b = P.ballOf(exactPl, v), bs = P.ballOf(dpl, v), key = `${v.tier} ${v.place}-of-${b?.count} ${v.hand}`;
    ok(b && b.exact && b.tier === v.tier && b.place === v.place && b.hand === v.hand && near(b.localX, b.standX + P.HAND_OFFSET_M[v.hand], 1e-12) && b.localZ === P.TIER[v.tier].z, `${tag} ${JSON.stringify(v)}: ${JSON.stringify(b)}`);
    if (!b || !bs) { ok(false, `${tag} ${key}: no ball`); continue; }
    ok(near(b.zYd, zMat[v.tier], 1e-12) && near(bs.zYd, zMat[v.tier], 1e-4), `${tag} ${key}: mat ${b.zYd} / ${bs.zYd}`);
    // tools/nss-platform.json's committed balls (5 decimals): the stance at standX, its ball for the hand
    const st = npl.tiers[v.tier].find((p) => near(p.localX, b.standX, 1e-9));
    const nb = st?.ball?.[v.hand === "right" ? "rightHanded" : "leftHanded"];
    ok(nb && near(nb.localX, b.localX, 1e-9), `${tag} ${key}: nss-platform.json has no ball at ${b.localX}`);
    if (nb) { const d = pxOff(b, nb); stats.nssBall = Math.max(stats.nssBall, d); ok(d <= PX_TOL, `${tag} ${key}: ${d.toFixed(4)} px from nss-platform.json's ball`); }
    const dv = pxOff(b, bs); stats.shippedVsExact = Math.max(stats.shippedVsExact, dv);
    ok(dv <= (shippedExact ? 1e-9 : 0.003), `${tag} ${key}: derived.json's platform puts the ball ${dv.toFixed(4)} px from the exact one`);
    if (sh) {
      const e = sh[v.tier][`${v.place}-of-${b.count}`]?.[v.hand === "right" ? "rightHanded" : "leftHanded"];
      ok(e && near(sh[v.tier][`${v.place}-of-${b.count}`].slotX, b.standX, 1e-9), `${tag} ${key}: slots.json has no entry`);
      if (e) {
        const d = pxOff(b, e), ds = pxOff(bs, e);
        stats.slots = Math.max(stats.slots, d); stats.shipped = Math.max(stats.shipped, ds); stats.height = Math.max(stats.height, Math.abs(b.zYd - e.heightYd)); stats.nSlots++;
        ok(d <= PX_TOL, `${tag} ${key}: ${d.toFixed(4)} px from slots.json's ball`);
        ok(ds <= (shippedExact ? PX_TOL : 0.004), `${tag} ${key}: derived.json's platform ${ds.toFixed(4)} px from slots.json's ball`);
        ok(Math.abs(b.zYd - e.heightYd) <= 1e-4, `${tag} ${key}: heightYd ${b.zYd} against ${e.heightYd}`);
      }
    }
    stats.n++;
    // the ball against where the player stands: 0.9 m to a right-hander's right, a left-hander's left
    const stand = P.geometryOf(exactPl).map(b.standX, b.localZ);
    const pxPerM = Math.sqrt(reg.a * reg.a + reg.b * reg.b);
    ok(near(pxOff(b, stand), 0.9 * pxPerM, 1e-6) && (v.hand === "right" ? toRight(stand, b) > 0 : toRight(stand, b) < 0), `${tag} ${key}: the ball not 0.9 m to the ${v.hand} of the stance`);
    const rk = `${v.tier} ${b.count} ${v.hand} ${v.countHigh}+${v.countLow}`;
    if (!rows.has(rk)) rows.set(rk, []);
    rows.get(rk)[v.place - 1] = b;
    // e. startOf
    const meta = { tee: DERIVED[n].tee, platform: dpl };
    const s = P.startOf(meta, v);
    ok(s && s.x === bs.x && s.y === bs.y && P.startOf(meta, { ...v, on: false }) === meta.tee, `${tag} ${key}: startOf`);
    // f. onPlatform
    const hit = P.onPlatform({ x: bs.x, y: bs.y }, dpl);
    ok(hit && hit.tier === v.tier && hit.zYd === bs.zYd && hit.x === bs.x && hit.y === bs.y, `${tag} ${key}: onPlatform`);
    ok(P.onPlatform({ x: bs.x + 2e-6, y: bs.y }, dpl) === null && P.onPlatform({ x: bs.x, y: bs.y - 2e-6 }, dpl) === null, `${tag} ${key}: a nudged ball on the platform`);
    // g. slotLift
    const g = heightAt(t, bs.x, bs.y), lift = P.slotLift(bs, t, heightAt);
    ok(g != null && lift === Math.max(0, bs.zYd - g) && Math.abs(lift - bs.zYd) <= 0.1, `${tag} ${key}: lift ${lift} over ground ${g}`);
    ok(P.slotLift(bs) === bs.zYd && P.slotLift(bs, t, () => null) === bs.zYd && P.slotLift(hit, t, heightAt) === lift, `${tag} ${key}: slotLift without terrain`);
    lifts[v.tier].push({ n, lift });
  }
  // the places on a tier run left to right as the player faces the green
  for (const [rk, bs] of rows) ok(bs.length === Number(rk.split(" ")[1]) && bs.every((b, i) => i === 0 || toRight(bs[i - 1], b) > 0.5), `${tag} ${rk}: not left to right as the player faces the green`);
  // an empty own tier, a pair NSS never seats (the own tier's ball all the same), and no geometry
  for (const v of inputs) {
    const c = P.checkOnline(v);
    if (!c.ok) ok(P.ballOf(dpl, v) === null && P.startOf({ tee: DERIVED[n].tee, platform: dpl }, v) === DERIVED[n].tee, `${tag} ${JSON.stringify(v)}: a ball on an empty own tier`);
    else if (!c.pairOk) {
      const b = P.ballOf(dpl, v), bf = P.ballOf(dpl, P.fixOnline(v)), s = P.startOf({ tee: DERIVED[n].tee, platform: dpl }, v);
      ok(b && bf && b.x === bf.x && b.y === bf.y && b.count === c.mine && b.zYd === bf.zYd && s && s.x === b.x && s.y === b.y, `${tag} ${JSON.stringify(v)}: a pair NSS never seats does not place the own tier's ball`);
    }
  }
  const v0 = valid[0];
  ok(P.ballOf(null, v0) === null && P.ballOf({}, v0) === null && P.ballOf({ tiers: { high: dpl.tiers.high.slice(0, 1) } }, v0) === null, `${tag}: a ball without geometry`);
  ok(P.startOf({ tee: DERIVED[n].tee, platform: null }, v0) === DERIVED[n].tee && P.startOf({}, v0) === null && P.startOf(null, null) === null, `${tag}: startOf without a platform or a tee`);
  // the tee and the standing spots are not the ball
  ok(P.onPlatform(DERIVED[n].tee, dpl) === null && P.onPlatform(null, dpl) === null && P.onPlatform({ x: NaN, y: 1 }, dpl) === null && P.onPlatform(P.ballOf(dpl, v0), null) === null, `${tag}: onPlatform off the platform`);
  for (const tier of P.TIERS) for (const p of P.positionsOf(dpl, tier)) ok(P.onPlatform({ x: p.x, y: p.y }, dpl) === null, `${tag}: a standing spot read as a ball`);
  // a spot list without localX is read by fromLeft or its place in the tier
  const bare = { ...dpl, tiers: Object.fromEntries(P.TIERS.map((tr) => [tr, dpl.tiers[tr].map(({ localX, ...p }) => p)])) };
  ok(pxOff(P.ballOf(bare, v0), P.ballOf(dpl, v0)) < 1e-9, `${tag}: spots without localX`);
}
ok(P.slotLift({ x: 0.5, y: 0.5, zYd: 0.1 }, {}, () => 1) === 0 && P.slotLift(null) === 0 && P.slotLift({ x: 0.5, y: 0.5 }) === 0, "slotLift below the ground or without a mat");
ok(P.zOf({ zYd: 1.8, z: 9 }) === 1.8 && P.zOf({ z: 0.1 }) === 0.1 && Number.isNaN(P.zOf({})) && Number.isNaN(P.zOf(null)) && P.groundOf({ groundYd: 0, groundZ: 5 }) === 0 && P.groundOf({ groundZ: 0.5 }) === 0.5 && P.groundOf({ groundYd: null }) === null, "zOf / groundOf");
ok(P.slotLift({ x: 0.5, y: 0.5, zYd: 1.8241, groundYd: 0.5 }) === 1.8241 - 0.5 && P.slotLift({ x: 0.5, y: 0.5, zYd: 1.8241, groundYd: 0.5 }, {}, () => 0.2) === 1.8241 - 0.2, "slotLift on a spot's own ground");
console.log(`d. ${stats.n} balls on 21 holes (exact geometry): ${SLOTS ? `max ${stats.slots.toFixed(4)} px from slots.json's ${stats.nSlots} (heightYd within ${stats.height.toFixed(6)} yd), ` : "slots.json absent, "}max ${stats.nssBall.toFixed(4)} px from tools/nss-platform.json's balls`);
console.log(`d. derived.json's platform as shipped (${shippedExact ? "exact geometry" : "the similarity fitted to its 14 spots: add origin, yawDeg and transform to it for the exact form"}): max ${stats.shippedVsExact.toFixed(4)} px from the exact ball${SLOTS ? `, ${stats.shipped.toFixed(4)} px from slots.json's` : ""}`);
for (const tier of P.TIERS) {
  const l = lifts[tier].map((q) => q.lift), lo = Math.min(...l), hi = Math.max(...l);
  const flat = tier === "low" ? 0.1089 : 1.8241;
  const off = [...new Set(lifts[tier].filter((q) => Math.abs(q.lift - flat) > 0.005 && q.n !== 3).map((q) => `H${q.n}`))];
  console.log(`g. ${tier} tier lift on public/terrain (${nssTerrain ? "NSS" : "WSR"}): ${lo.toFixed(3)}-${hi.toFixed(3)} yd over ${l.length} balls; off the flat-mat value on ${off.join(", ") || "no hole"}`);
}
console.log(fails ? `${fails} FAILURES of ${checks} checks` : `all ${checks} platform-helper checks passed`);
process.exit(fails ? 1 : 0);
