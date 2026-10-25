// The online Survival Golf tee platform: where the player's ball starts, from
// what the player tells the app. Pure (no React, no storage, no fetch), so the
// tools test it under Node.
//
// The rule is NSS's own, decoded from its main image (the eden dump's
// nss-golf-x/slots.md and slots.json; verify/slots-verdicts.json confirms
// it): at every hole load the game counts the players N (1-8) and takes the
// occupancy mask MASKS[N - 1] (main 0x2df9b20); bit k is slot k, the bone
// GlfTeeOBJ_(k+1): slots 0-3 on the low tier, 4-7 on the high, at
// platform-local x BONE_X. So 1-4 players all stand on the HIGH tier, 5 = 3
// high + 2 low, 6 = 3 + 3, 7 = 4 + 3, 8 = 4 + 4 (VALID_COUNTS; the low tier
// never holds exactly one). On a tier with an even count a player stands on
// his slot's bone, with an odd count midway between two adjacent bones
// (slots k-1, k on the low tier, k, k+1 on the high), so every group is
// centred: from the player's left as they face the green (descending local
// x) a tier of 1 stands at 0, 2 at +1.15 -1.15, 3 at +2.3 0 -2.3, 4 at +3.45
// +1.15 -1.15 -3.45 m. The BALL is 0.9 m beside the standing spot along
// platform-local x (added before the platform transform): to a right-handed
// player's right (x - 0.9, local +x being the player's LEFT), to a
// left-hander's left (x + 0.9). It rests on its tier's mat, 0.099609 m (low)
// or 1.667969 m (high) above the platform origin (whose y is 0.1 on H3, 0
// elsewhere), at local z +2.0 (low) or -1.5 (high). Which player gets which
// place is a seeded shuffle per hole, so the player says where they stand.
//
// The geometry, per hole: derived.json's `platform` (tools/nss-platform.json
// through tools/build-derived.mjs; src/derivedMerge.js mirrors it whole into
// the hole's state on every load, and the loader never reads it back). Two
// forms are read:
//   exact: `origin` [x, y, z] (NSS metres), `yawDeg` (world = origin +
//     Ry(yaw) * local, Ry = [[cos,0,sin],[0,1,0],[-sin,0,cos]]) and
//     `transform` { a, b, tx, ty } (tools/nss-registration.json: map px =
//     a x - b z + tx, b x + a z + ty), the slots.md function itself, within
//     0.0019 px of slots.json's 5-decimal table;
//   spots: `tiers.low` / `.high`, the 7 standing spots of each tier from the
//     left, each { localX, x, y (map fractions), zYd (the mat, yd above the
//     hole's datum), ... } (what derived.json ships today): the map is the
//     one similarity (a rotation and a scale of local x, z, plus an offset)
//     that the 14 spots lie on, fitted to them, within 0.003 px (the spots'
//     own 5-decimal rounding).
// geometryOf picks the exact form when all three fields are there.
//
// The player's input is the root saved-state key `online` (additive, no
// storage flag; onlineOf sanitises whatever is stored):
//   { on, tier, countHigh, countLow, place, hand }
//   on         an online round: the ball starts on the platform
//   tier       "high" or "low", the tier the player stands on
//   countHigh  how many players stand on the high tier (1-4)
//   countLow   how many on the low tier (0, 2, 3 or 4)
//   place      the player's place from the left on their tier, 1..count
//   hand       "right" or "left", the player's dominant hand (NSS's setting)
// The ball's place depends only on the player's own tier, the count on it,
// the place and the hand (slots.md section 1): a tier count gives the same
// standing spots under every N that seats it (high h under N = h, or 5-8 for
// 3 and 4; low 2 under 5, 3 under 6 and 7, 4 under 8), so the other tier's
// count is only a consistency check. ballOf / startOf place the ball whenever
// the own count is one that tier shows (high 1-4, low 2-4); an input pair NSS
// never seats (2 high + 2 low, say) is kept as entered, and checkOnline flags
// it (pairOk false) without withholding the ball. pairWith moves the other
// tier's count to the nearest NSS seats beside a kept one (the App runs it
// when a count chip is tapped, keeping the tapped tier's count), fixOnline the
// same keeping the player's own tier and count.

export const TIERS = ["high", "low"];
export const HANDS = ["right", "left"];
// the counts each tier can show (the low tier never holds exactly one)
export const HIGH_COUNTS = [1, 2, 3, 4];
export const LOW_COUNTS = [0, 2, 3, 4];
// main 0x2df9b20: the occupancy mask for N = 1..8 players
export const MASKS = [0x20, 0x60, 0x70, 0xf0, 0x76, 0x7e, 0xfe, 0xff];
// GlfTeeOBJ_1..8: slot k's local x (m, + = the player's left facing the green)
export const BONE_X = [-3.45, -1.15, 1.15, 3.45, -3.45, -1.15, 1.15, 3.45];
// each tier's slots, the mat's local y (m, the ray's hit under every ball) and local z
export const TIER = Object.freeze({
  low: Object.freeze({ slots: [0, 1, 2, 3], matY: 0.099609, z: 2.0 }),
  high: Object.freeze({ slots: [4, 5, 6, 7], matY: 1.667969, z: -1.5 }),
});
// the ball beside the standing spot along local x (main 0x2ef29f0 / 0x2ef29fc)
export const HAND_OFFSET_M = Object.freeze({ right: -0.9, left: 0.9 });
// [countHigh, countLow] for N = 1..8 (the masks' bits per tier)
export const VALID_COUNTS = [[1, 0], [2, 0], [3, 0], [4, 0], [3, 2], [3, 3], [4, 3], [4, 4]];
// each tier count -> the counts NSS seats on the other tier beside it (from
// VALID_COUNTS), ascending
export function partnerCounts(tier, count) {
  if (tier === "high") return VALID_COUNTS.filter(([h]) => h === count).map(([, l]) => l);
  if (tier === "low") return VALID_COUNTS.filter(([, l]) => l === count).map(([h]) => h);
  return [];
}
// a player count N that seats `count` on `tier` (any one gives the same
// spots on that tier, slots.md section 1): the high tier's h -> N = h, the
// low tier's 2 / 3 / 4 -> 5 / 6 / 8; null for a count the tier never shows
export function playersFor(tier, count) {
  if (tier === "high") return HIGH_COUNTS.includes(count) ? count : null;
  if (tier === "low") return { 2: 5, 3: 6, 4: 8 }[count] ?? null;
  return null;
}
// the default: off, a full platform of 8, the leftmost place of the high tier
export const ONLINE_DEFAULT = Object.freeze({ on: false, tier: "high", countHigh: 4, countLow: 4, place: 1, hand: "right" });

const YD_M = 0.9144, MAP_W = 250, MAP_H = 304;

// The standing x of each occupied slot on `tier` with N players, from the
// left (descending local x): the game's rule (slots.md section 3).
export function tierStandXs(N, tier) {
  if (!TIER[tier] || !Number.isInteger(N)) return [];
  const mask = MASKS[Math.min(8, Math.max(1, N)) - 1];
  const slots = TIER[tier].slots.filter((s) => (mask >> s) & 1);
  const odd = slots.length % 2 === 1;
  return slots.map((k) => {
    if (!odd) return BONE_X[k];
    const [a, b] = tier === "low" ? [k - 1, k] : [k, k + 1];
    return (BONE_X[a] + BONE_X[b]) / 2;
  }).sort((p, q) => q - p);
}

// NSS's split of N players (1-8) between the tiers; null outside 1-8
export function layoutOf(N) {
  const c = Number.isInteger(N) && N >= 1 && N <= 8 ? VALID_COUNTS[N - 1] : null;
  return c ? { countHigh: c[0], countLow: c[1] } : null;
}

// The stored `online` key -> a sanitised one. Not an object: the default.
// Field by field otherwise: a tier, count or hand outside its set takes the
// default's; place is clamped into 1..the count on the player's tier (1 when
// that tier is empty); a key from before `place` (src/platform.js's first
// form, a 0-based `index`) reads index + 1.
export function onlineOf(v) {
  const d = ONLINE_DEFAULT;
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ...d };
  const tier = TIERS.includes(v.tier) ? v.tier : d.tier;
  const countHigh = HIGH_COUNTS.includes(v.countHigh) ? v.countHigh : d.countHigh;
  const countLow = LOW_COUNTS.includes(v.countLow) ? v.countLow : d.countLow;
  const hand = HANDS.includes(v.hand) ? v.hand : d.hand;
  const mine = tier === "high" ? countHigh : countLow;
  const want = Number.isInteger(v.place) ? v.place : Number.isInteger(v.index) ? v.index + 1 : d.place;
  const place = Math.min(Math.max(1, mine), Math.max(1, want));
  return { on: v.on === true, tier, countHigh, countLow, place, hand };
}

// What the input says to NSS's rule: { ok (the ball can be placed: the
// count on the player's tier is one that tier shows, high 1-4, low 2-4),
// mine (that count), players (playersFor: an N seating it, null when not ok),
// pairOk (the two counts are a pair NSS seats), partners (the other tier's
// counts NSS seats beside mine), total (the two counts' sum), nss (NSS's
// { countHigh, countLow } for that total, null outside 1-8), online
// (sanitised) }. A pair NSS never seats leaves ok as the own count has it.
export function checkOnline(online) {
  const o = onlineOf(online);
  const total = o.countHigh + o.countLow;
  const nss = layoutOf(total);
  const pairOk = VALID_COUNTS.some(([h, l]) => h === o.countHigh && l === o.countLow);
  const mine = o.tier === "high" ? o.countHigh : o.countLow;
  const players = playersFor(o.tier, mine);
  return { ok: players != null, mine, players, pairOk, partners: partnerCounts(o.tier, mine), total, nss, online: o };
}

// The input with `keep`'s count kept (a tier name; the player's own tier
// without one) and the other tier's moved to the nearest count NSS seats
// beside it (ties to the larger): high 1-2 -> low 0; high 3 -> low 0, 2 or
// 3; high 4 -> 0, 3 or 4; low 0 -> the high count as it is; low 2 -> high 3;
// low 3 -> 3 or 4; low 4 -> 4. Tier, place (clamped into the tier), hand and
// on are kept; a pair NSS seats comes back as it was.
export function pairWith(online, keep) {
  const o = onlineOf(online);
  const k = TIERS.includes(keep) ? keep : o.tier;
  const other = k === "high" ? "countLow" : "countHigh";
  const cand = partnerCounts(k, k === "high" ? o.countHigh : o.countLow);
  if (!cand.length) return o;
  const cur = o[other];
  const best = cand.reduce((b, c) => (Math.abs(c - cur) < Math.abs(b - cur) || (Math.abs(c - cur) === Math.abs(b - cur) && c > b) ? c : b), cand[0]);
  return onlineOf({ ...o, [other]: best });
}

// The input moved onto a pair NSS seats, keeping the player's tier and the
// count on it (pairWith); a low tier with nobody on it (countLow 0) first
// takes the fewest low players NSS seats beside the high count (2 beside 3,
// 3 beside 4), else 2 (and the high tier then 3).
export function fixOnline(online) {
  const o = onlineOf(online);
  if (o.tier === "low" && playersFor("low", o.countLow) == null) {
    const lows = partnerCounts("high", o.countHigh).filter((l) => playersFor("low", l) != null);
    return pairWith({ ...o, countLow: lows.length ? lows[0] : 2 }, "low");
  }
  return pairWith(o, o.tier);
}

// a spot's mat height and the ground under it, yd above the datum (NaN /
// null without): derived.json's zYd / groundYd, else nss-platform.json's z / groundZ
export const zOf = (p) => (Number.isFinite(p?.zYd) ? p.zYd : Number.isFinite(p?.z) ? p.z : NaN);
export const groundOf = (p) => (Number.isFinite(p?.groundYd) ? p.groundYd : Number.isFinite(p?.groundZ) ? p.groundZ : null);

// The standing spots of one tier as shipped (from the left), [] without.
export function positionsOf(platform, tier) {
  const list = platform?.tiers?.[tier];
  return Array.isArray(list) ? list : [];
}

// every standing x a spot list can hold, from the left (fromLeft indexes it)
const STANDING_X = [3.45, 2.3, 1.15, 0, -1.15, -2.3, -3.45];
const spotLocalX = (p, i, list) => (Number.isFinite(p?.localX) ? p.localX
  : Number.isInteger(p?.fromLeft) ? STANDING_X[p.fromLeft] ?? NaN : list.length === STANDING_X.length ? STANDING_X[i] : NaN);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const hasExact = (pl) => Array.isArray(pl?.origin) && pl.origin.length === 3 && pl.origin.every(isNum) && isNum(pl.yawDeg)
  && ["a", "b", "tx", "ty"].every((k) => isNum(pl.transform?.[k]));

// The platform's local -> map map, { exact, map(lx, lz) -> { x, y } (map
// fractions), zYd(tier) }, or null when the platform carries neither form
// (see the head of this file). Kept per platform object.
const GEOMETRY = new WeakMap();
export function geometryOf(platform) {
  if (!platform || typeof platform !== "object") return null;
  if (GEOMETRY.has(platform)) return GEOMETRY.get(platform);
  let g = null;
  if (hasExact(platform)) {
    const { origin: [ox, oy, oz], transform: { a, b, tx, ty } } = platform;
    const yaw = (platform.yawDeg * Math.PI) / 180, c = Math.cos(yaw), s = Math.sin(yaw);
    g = {
      exact: true,
      map(lx, lz) {
        const wx = ox + c * lx + s * lz, wz = oz - s * lx + c * lz;
        return { x: (a * wx - b * wz + tx) / MAP_W, y: (b * wx + a * wz + ty) / MAP_H };
      },
      zYd: (tier) => (TIER[tier] ? (oy + TIER[tier].matY) / YD_M : NaN),
    };
  } else {
    // map px as complex numbers: w = P0 + K (lx + i lz), least squares over
    // the shipped spots (local x from the spot, local z its tier's)
    const pts = [], zs = {};
    for (const tier of TIERS) positionsOf(platform, tier).forEach((p, i, list) => {
      const lx = spotLocalX(p, i, list);
      if (isNum(lx) && isNum(p?.x) && isNum(p?.y)) pts.push([lx, TIER[tier].z, p.x * MAP_W, p.y * MAP_H]);
      if (zs[tier] == null && Number.isFinite(zOf(p))) zs[tier] = zOf(p);
    });
    let mzr = 0, mzi = 0, mwr = 0, mwi = 0;
    for (const [zr, zi, wr, wi] of pts) { mzr += zr; mzi += zi; mwr += wr; mwi += wi; }
    const n = pts.length;
    if (n >= 2) {
      mzr /= n; mzi /= n; mwr /= n; mwi /= n;
      let nr = 0, ni = 0, dd = 0;
      for (const [zr, zi, wr, wi] of pts) {
        const ar = zr - mzr, ai = zi - mzi, br = wr - mwr, bi = wi - mwi;
        nr += br * ar + bi * ai; ni += bi * ar - br * ai; dd += ar * ar + ai * ai;
      }
      if (dd > 0) {
        const kr = nr / dd, ki = ni / dd, pr = mwr - (kr * mzr - ki * mzi), pi = mwi - (kr * mzi + ki * mzr);
        g = {
          exact: false,
          map: (lx, lz) => ({ x: (pr + kr * lx - ki * lz) / MAP_W, y: (pi + ki * lx + kr * lz) / MAP_H }),
          // the tier's mat as shipped, else the mat over an origin at the datum
          zYd: (tier) => (TIER[tier] ? zs[tier] ?? TIER[tier].matY / YD_M : NaN),
        };
      }
    }
  }
  GEOMETRY.set(platform, g);
  return g;
}

// The player's ball on the platform: { x, y (map fractions), tier, place,
// count (on the tier), hand, standX (where they stand, local x m), localX,
// localZ (the ball, local m), zYd (the mat under it, yd above the datum),
// groundYd (null: the ground under the ball is the terrain's), exact }, or
// null when the player's tier holds a count it never shows (the low tier
// with nobody on it) or the platform has no geometry. It ignores `on`, so
// the app can show the spot before the round is switched online, and the
// other tier's count (checkOnline's pairOk): the spot is the own tier
// count's under any N that seats it.
export function ballOf(platform, online) {
  const chk = checkOnline(online);
  if (!chk.ok) return null;
  const g = geometryOf(platform);
  if (!g) return null;
  const o = chk.online, xs = tierStandXs(chk.players, o.tier);
  const standX = xs[o.place - 1];
  if (!isNum(standX)) return null;
  const localX = standX + HAND_OFFSET_M[o.hand], localZ = TIER[o.tier].z;
  const p = g.map(localX, localZ);
  if (!isNum(p.x) || !isNum(p.y)) return null;
  return { x: p.x, y: p.y, tier: o.tier, place: o.place, count: xs.length, hand: o.hand, standX, localX, localZ, zYd: g.zYd(o.tier), groundYd: null, exact: g.exact };
}

// The ball's start on a hole: the player's platform ball in an online round
// (ballOf's: the own tier's count one it shows, on a platform with
// geometry), else the local tee;
// null when the hole has neither.
export function startOf(meta, online) {
  const o = onlineOf(online);
  return (o.on ? ballOf(meta?.platform, o) : null) ?? meta?.tee ?? null;
}

// Every ball the platform can hold (each layout NSS makes, tier, place and
// hand), kept per platform object, for onPlatform.
const BALLS = new WeakMap();
function ballsOf(platform) {
  if (!platform || typeof platform !== "object") return [];
  if (BALLS.has(platform)) return BALLS.get(platform);
  const out = [];
  VALID_COUNTS.forEach(([countHigh, countLow]) => {
    for (const tier of TIERS) {
      const n = tier === "high" ? countHigh : countLow;
      for (let place = 1; place <= n; place++) for (const hand of HANDS) {
        const b = ballOf(platform, { tier, countHigh, countLow, place, hand });
        if (b) out.push(b);
      }
    }
  });
  BALLS.set(platform, out);
  return out;
}

// The platform ball the map ball sits exactly on (ballOf's object), or null:
// the exact test (within 1e-6 of the map) App.jsx's ballOn makes, so a ball
// the player has moved, by a tap or a drag, is off the platform. Places that
// put the ball on the same spot (2-of-4 and 1-of-2 on a tier, the same hand)
// give the first of them; their tier and mat are the same.
export function onPlatform(ball, platform) {
  if (!ball || !isNum(ball.x) || !isNum(ball.y)) return null;
  for (const b of ballsOf(platform)) {
    const dx = ball.x - b.x, dy = ball.y - b.y;
    if (Math.sqrt(dx * dx + dy * dy) < 1e-6) return b;
  }
  return null;
}

// The ball's height above the ground under it at a platform spot, yd (the
// solver's ctx.ballLift: its profile heights are against the ground under
// the ball). The ground is the solver's own terrain, heightAt(terrain, x, y)
// (src/terrain.js), so the lift follows whatever terrain ships; without it,
// or with no height there, the spot's own ground (groundOf), else the datum.
// Never below 0; 0 for a spot without a height. `spot` is ballOf's ball or a
// shipped standing spot.
export function slotLift(spot, terrain = null, heightAt = null) {
  const z = zOf(spot);
  if (!Number.isFinite(z)) return 0;
  let g = terrain && typeof heightAt === "function" ? heightAt(terrain, spot.x, spot.y) : null;
  if (!Number.isFinite(g)) g = groundOf(spot) ?? 0;
  return Math.max(0, z - g);
}
