// Wii Sports Resort's golf ball, tick for tick: the port of tools/research/
// wsr-groundsim.py (RPGlfBall::Calc 0x80413b68, the contact routine 0x8041228c
// and the stop rule, from WSR's NTSC-U main.dol; the decode is
// tools/research/wsr-ground-phase.md, the air phase wsr-club-physics.md) on an
// infinite plane of one KCL attribute, flat or tilted along the shot, plus the
// in-air wind of tools/research/wsr-flightsim.py as an option. No cup, flagstick,
// trees or water: the putt model and the tree check own those. It is WSR's
// physics, not the Switch's: the app takes its SHAPE (how stop and carry
// depend on power and the landing surface, src/wsrShape.js) and scales it by
// the clubs fitted from logged shots (src/model.js).
//
// Pure ES module with no Node or DOM API, so the app and the tools share this
// one copy (tools/lib/wsrsim.mjs re-exports it). The arithmetic follows the
// Python line for line, in the same order: on 93 reference runs (every club
// and surface, spin, slopes, the power sweep, the putter) the two gave the
// same carry, stop, apex and tick count to the last bit, and on 120 random
// ones (club, power, surface, spin, slope) within 4e-14 yd with the same
// ticks and bounces (tools/test-solver.mjs holds the reference numbers).
//
// Frame: +x along the shot, +y up, +z to the RIGHT of the shot; 1 unit = 0.1 m
// (9.144 units/yd), one tick = 1/240 s (4 ticks per 60 Hz frame).

export const YD = 9.144;
const DEG = Math.PI / 180;

// The club blocks (wsr-club-physics.md section 3), by the app's club ids; the
// Python's names are DR SP 3I 5I 7I 9I SW PT. p00 / p04 launch speed (u/tick)
// at power 0 / 1, angle = P10 launch deg, lift = P14, p38 = q at power 0.5
// (q = power^log2(1/p38)), p08 = WSR's full-power stop on flat fairway (yd),
// p0c its nominal carry (yd), type 0 wood / 1 iron / 2 wedge / 3 putter,
// spin = P1c (the ball's backspin at the strongest swing, bs = s7c * P1c;
// woods and putter 0), spinBunker = P20 (the same from a bunker lie), curve =
// P18 (side-spin factor).
export const CLUBS = {
  driver:  { p00: 0.02,  p04: 3.39, angle: 10, lift: 0.65, p38: 0.71,  p08: 279, p0c: 240, type: 0, spin: 0,    spinBunker: 0,    curve: 0.5 },
  spoon:   { p00: 0.00,  p04: 3.13, angle: 11, lift: 0.70, p38: 0.708, p08: 253, p0c: 220, type: 0, spin: 0,    spinBunker: 0,    curve: 0.5 },
  "3iron": { p00: 0.00,  p04: 2.79, angle: 19, lift: 0.50, p38: 0.67,  p08: 212, p0c: 190, type: 1, spin: 0.25, spinBunker: 0.2,  curve: 0.6 },
  "5iron": { p00: 0.02,  p04: 2.45, angle: 23, lift: 0.50, p38: 0.66,  p08: 176, p0c: 160, type: 1, spin: 0.5,  spinBunker: 0.35, curve: 0.6 },
  "7iron": { p00: 0.00,  p04: 2.13, angle: 24, lift: 0.50, p38: 0.665, p08: 146, p0c: 130, type: 1, spin: 0.7,  spinBunker: 0.5,  curve: 0.6 },
  "9iron": { p00: 0.00,  p04: 1.78, angle: 30, lift: 0.50, p38: 0.66,  p08: 110, p0c: 100, type: 1, spin: 0.9,  spinBunker: 0.6,  curve: 0.6 },
  wedge:   { p00: 0.01,  p04: 1.28, angle: 43, lift: 0.00, p38: 0.64,  p08: 60,  p0c: 55,  type: 2, spin: 1.0,  spinBunker: 0.7,  curve: 0.6 },
  putter:  { p00: 0.004, p04: 0.41, angle: 0,  lift: 0.00, p38: 0.63,  p08: 20,  p0c: 20,  type: 3, spin: 0,    spinBunker: 0,    curve: 0 },
};

// KCL attributes a shot can land on (ECollision: 1 fairway, 2 rough, 3 bunker,
// 6 green, 9 green edge = fringe, 15 tee)
export const SURFACE_ATTR = { fairway: 1, rough: 2, bunker: 3, green: 6, fringe: 9, tee: 15 };

// per-attribute contact tables filled by 0x80415da4: A = Coulomb friction
// (tangential speed lost per unit of normal approach speed), B = restitution
const A_TAB = [0.3, 0.4, 0.5, 1.0, 0.7, 1.0, 0.15, 1.0, 1.0, 0.3, 0.001, 0.3, 0.3, 1.0, 0.1, 0.4, 1.0];
const B_TAB = [0.5, 0.5, 0.4, 0.001, 0.3, 0.001, 0.5, 0.001, 0.001, 0.5, 0.13, 0.5, 0.5, 0.001, 0.5, 0.5, 0.001];
const CONTACT_MASK = 0x1de5e;   // attrs the contact routine resolves
const STOP_MASK = 0x1ce5e;      // attrs a ball may come to rest on
const LIFT_K = 0.0012, LIFT_DECAY = 0.9985;
const SIDE_K = 0.001, SIDE_DECAY = 0.999;
const GRAV = 0.002, DRAG = 0.999;
const BALL_R = 0.5;             // the ball's collision radius, units
const STOP_V = 0.0015, STOP_TICKS = 20;
const MAX_LIFE = 0x1c20;        // 7200 ticks = 30 s
const WIND_K = 8e-5, WIND_ALONG = 0.6;   // head/tail wind acts at 0.6 of a crosswind
const FLT_MIN = 1.17549435e-38; // below this length SetLength (0x803edd94) refuses to normalise

const norm = (v) => {
  const m = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return m > FLT_MIN ? [v[0] / m, v[1] / m, v[2] / m] : [0, 0, 0];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mag = (v) => Math.sqrt(dot(v, v));

// Launch (slot 3 -> 0x8040a0d4) at launch power q (0-1; the gauge's bars / 4):
// the speed curve s = q^log2(1/p38), speed = p00 + s(p04 - p00) along the
// club's launch angle, lift P14 * s.
export function launch(club, q) {
  const c = CLUBS[club];
  if (!c) throw new Error(`unknown club ${club}`);
  const s = q > 0 ? Math.pow(q, Math.log2(1.0 / c.p38)) : 0;
  const speed = c.p00 + s * (c.p04 - c.p00);
  const th = c.angle * DEG;
  return { vel: [Math.cos(th) * speed, Math.sin(th) * speed, 0], lift: c.lift * s };
}

// One plane through the origin with a single attribute. slopeDeg > 0 rises
// along the shot (uphill), < 0 falls (downhill), as in the Python's putter
// table (the Python's Plane with slope_dir (1, 0) falls along +x).
function plane(attr, slopeDeg) {
  const t = Math.abs(slopeDeg) * DEG;
  const dir = slopeDeg > 0 ? -1 : 1;
  const n = norm([Math.sin(t) * dir, Math.cos(t), Math.sin(t) * 0]);
  return {
    attr, n,
    heightAt: (x, z) => 0 - (n[0] * x + n[2] * z) / n[1],
    // sphere vs plane like the KCL query 0x803f0c18: depth = r - signed
    // distance, a hit only when > 0 (0x803f0e48 rejects depth <= 0)
    contacts(pos, r) {
      const depth = r - dot(pos, n);
      return depth <= 0 ? [] : [[attr, n.slice(), depth]];
    },
  };
}

// Wind (0x803ecdb4, Calc 0x80414098-0x80414138), in the air only:
// |W| = 15 (idx/15)^log2(1/0.6) * clamp(0.1 + 0.9 dh/300, 0.1, 1) with dh the
// ball's height over the ground the player stands on (here the launch point's;
// the ball's centre starts BALL_R above it, where wsr-flightsim.py starts it
// at 0, a 0.0015 difference in the ramp); v.xz += 8e-5 (0.6 W_along + W_cross).
// `wind` = { mph, deg }: deg is where the air moves relative to the shot
// (0 = tailwind, 90 = toward the right, the app's relWindDeg), mph -> WSR's
// speed index at 2 mph per index (its even-only 0-30 display; the Switch's odd
// values give fractional indices).
function windOf(wind) {
  if (!wind || !(wind.mph > 0)) return null;
  const idx = wind.mph / 2;
  const r = (wind.deg ?? 0) * DEG;
  return { x: Math.cos(r), z: Math.sin(r), mag0: 15.0 * Math.pow(idx / 15.0, Math.log2(1 / 0.6)) };
}

// run({ club, q, surface, back, side, slopeDeg, wind, spinStart, maxTicks })
//   club      an id of CLUBS
//   q         launch power 0-1 (= gauge bars / 4; the Python's `power`)
//   surface   the plane's attribute: fairway | rough | bunker | green | fringe | tee
//   back      the ball's backspin bs (0 .. the club's spin = P1c at the strongest swing)
//   side      the ball's side spin s9c (+ curves LEFT; a full deliberate curve or the
//             full red = the club's curve factor P18)
//   slopeDeg  the plane's tilt along the shot, + uphill / - downhill
//   wind      null, or { mph, deg } (above); acts only while the ball is in the air
//   spinStart the tick after which side spin and the backspin pull-back act (0, as
//             the reference; the real game attaches them 72-100 ticks after launch)
// -> { carry, stop, apex, roll, lateral, bounces, ticks, reason, path } in yd:
//   carry = x at the first contact, stop = x at rest, roll = stop - carry,
//   lateral = z at rest (+ = right), apex = the highest y before the first
//   contact; path = [x, y, z] every 4 ticks (one 60 Hz frame) from launch to
//   rest, y the ball's rise above where it sat at launch (0 at launch, so it
//   is the height above the launch plane on flat ground). No pin: the
//   pull-back's pin homing is h = 1 (the reference's tables).
export function run({ club, q, surface = "fairway", back = 0, side = 0, slopeDeg = 0, wind = null, spinStart = 0, maxTicks = 8000 }) {
  const c = CLUBS[club];
  if (!c) throw new Error(`unknown club ${club}`);
  const attr = SURFACE_ATTR[surface];
  if (attr == null) throw new Error(`unknown surface ${surface}`);
  const surf = plane(attr, slopeDeg);
  const W = windOf(wind);
  const { vel, lift } = launch(club, q);
  const y0 = surf.heightAt(0, 0);

  // ---- the ball (RPGlfBall), as the Python's Ball ----
  const pos = [0, y0 + BALL_R, 0];
  let v = vel.slice();
  let v7c = vel.slice();             // ball+0x7c: the velocity entering the last contact
  let s98 = lift, s9c = side, bs = back;
  const ctype = c.type;
  let lifetime = 0;
  let ring = [[0, [0, 1, 0]], [0, [0, 1, 0]], [0, [0, 1, 0]], [0, [0, 1, 0]]], ringI = 0;
  let nSmooth = [0, 1, 0], attrMax = 0, attrGround = 0;
  let steerInit = false, P = [0, 0, 0];
  let landed = false, stopCount = 0, active = true, reason = null;
  let vprev = mag(vel), pos64 = pos.slice();
  let firstContact = null;
  const inAir = () => lifetime < 8 || attrMax === 0;   // 0x804121c4 (no water on a plane)
  const stop = (why) => { v = [0, 0, 0]; active = false; reason = why; };

  function calc() {
    lifetime += 1;
    const frame = lifetime >> 2;
    // 1. lift, perpendicular to v in the vertical plane
    const L = norm([-v[0] * v[1], v[0] * v[0] + v[2] * v[2], -v[1] * v[2]]);
    let k = vprev * LIFT_K * s98;
    for (let i = 0; i < 3; i++) v[i] += L[i] * k;
    s98 *= LIFT_DECAY;
    if (lifetime > spinStart) {
      // 2. side spin (normalize(vz, 0, -vx) is left of the travel)
      const S = norm([v[2], 0, -v[0]]);
      k = vprev * SIDE_K * s9c;
      for (let i = 0; i < 3; i++) v[i] += S[i] * k;
      s9c *= SIDE_DECAY;
      // 3. backspin pull-back / roll steering (0x80413cd0-0x80414084), ground only
      if (!inAir()) {
        if (!steerInit && frame > 30) {
          steerInit = true;
          const h = norm([v7c[0], 0, v7c[2]]);
          const f29 = Math.min(bs, 0.9);
          const pw = Math.abs(f29) >= 0.001 ? Math.pow(Math.abs(f29), 1.4427 * -Math.log(0.655)) : 0;   // f29^0.61
          P = [h[0] * (-0.06 * pw), h[1] * (-0.06 * pw), h[2] * (-0.06 * pw)];
        }
        // P is turned into the ground plane at its full length (SetLength), or
        // becomes (0, 0, 0) when the projection is below FLT_MIN
        const n = nSmooth;
        const pn = dot(P, n);
        const proj = [P[0] - n[0] * pn, P[1] - n[1] * pn, P[2] - n[2] * pn];
        const m = mag(proj);
        if (m < FLT_MIN) P = [0, 0, 0];
        else { const s = mag(P) / m; P = [proj[0] * s, proj[1] * s, proj[2] * s]; }
        const a = A_TAB[attrGround];
        const w = 0.7 + 0.19 * (1.0 - Math.min(Math.max(a, 0.15), 1.0)) / 0.85;   // lie weight
        P = [P[0] * w, P[1] * w, P[2] * w];
        for (let i = 0; i < 3; i++) v[i] += P[i] * 1.0;   // pin homing h = 1 (no pin)
      }
    }
    // 4. wind, in the air only
    if (W && inAir()) {
      const dh = pos[1] - y0;
      const f = Math.min(Math.max(0.1 + 0.9 * dh / 300.0, 0.1), 1.0);
      const Wv = [W.x * W.mag0 * f, 0, W.z * W.mag0 * f];
      const hd = norm([v[0], 0, v[2]]);
      const along = Wv[0] * hd[0] + Wv[2] * hd[2];
      const a74 = [hd[0] * along, 0, hd[2] * along];
      const a68 = [Wv[0] - a74[0], 0, Wv[2] - a74[2]];
      v[0] += WIND_K * (WIND_ALONG * a74[0] + a68[0]);
      v[2] += WIND_K * (WIND_ALONG * a74[2] + a68[2]);
    }
    // 5. gravity along -normalize(0.5 n + 0.5 yhat), n the smoothed contact normal
    let g = norm([0.5 * nSmooth[0], 0.5 * nSmooth[1] + 0.5, 0.5 * nSmooth[2]]);
    if (g[0] === 0 && g[1] === 0 && g[2] === 0) g = [0, 1, 0];
    for (let i = 0; i < 3; i++) v[i] -= GRAV * g[i];
    // 6. integrate, drag
    for (let i = 0; i < 3; i++) pos[i] += v[i];
    for (let i = 0; i < 3; i++) v[i] *= DRAG;
    // stop rule (0x80414310): this tick's displacement against the start-of-tick copy
    if (!inAir()) {
      const d = [pos[0] - pos64[0], pos[1] - pos64[1], pos[2] - pos64[2]];
      if (dot(d, d) < STOP_V * STOP_V) stopCount += 1;
      else stopCount = 0;
      if (stopCount > STOP_TICKS) {
        if ((1 << attrMax) & STOP_MASK) { stop("rest"); return; }
        // on a surface it may not rest on, v := 0.02 normalize(n.x, 0, n.z) and the count restarts
        const h = norm([nSmooth[0], 0, nSmooth[2]]);
        v = [h[0] * 0.02, 0, h[2] * 0.02]; stopCount = 0;
      }
    }
    if (lifetime > MAX_LIFE) stop("timeout");
  }

  // the contact routine 0x8041228c on the plane: per touching prism the impulse
  // dv = -(1 + B)(v.n)n - min(|t|, A vn) t^ (vn = -(v.n) >= 0, t the tangential
  // velocity), the push-out n * depth, and the tick's record in the ring
  function contact() {
    const hits = surf.contacts(pos, BALL_R);
    let attrTick = 0;
    const pushMin = [0, 0, 0], pushMax = [0, 0, 0], dvMin = [0, 0, 0], dvMax = [0, 0, 0];
    const normals = [];
    for (const [at, n, depth] of hits) {
      if (!((1 << at) & CONTACT_MASK)) continue;
      if (v[1] < 0.25 && at > attrTick) attrTick = at;
      normals.push(n);
      const pn = [n[0] * depth, n[1] * depth, n[2] * depth];
      for (let i = 0; i < 3; i++) { pushMax[i] = Math.max(pushMax[i], pn[i]); pushMin[i] = Math.min(pushMin[i], pn[i]); }
      const vdn = dot(v, n), vn = -vdn;
      const vN = [n[0] * vdn, n[1] * vdn, n[2] * vdn];
      const t = [v[0] - vN[0], v[1] - vN[1], v[2] - vN[2]];
      if (vn < 0) continue;   // moving away: pushed out, no impulse
      let A = A_TAB[at], B = B_TAB[at];
      // an iron's first contact of the shot on a green or its edge (0x80412774)
      if (!landed && ctype === 1 && (at === 6 || at === 9)) { A = 0.48; B = 0.5; }
      const cap = vn * A, tm = mag(t);
      const tc = tm > cap ? [t[0] * (cap / tm), t[1] * (cap / tm), t[2] * (cap / tm)] : t;
      // backspin softens a landing from the air and decays once the steering has started
      if (inAir() && bs > 0) {
        const f = 1.0 - 0.6 * Math.pow(Math.min(Math.max(bs, 0.0), 1.0), Math.log2(1 / 0.6));
        B *= f;
        if (steerInit) bs *= f;
      }
      const dv = [-(1.0 + B) * vN[0] - tc[0], -(1.0 + B) * vN[1] - tc[1], -(1.0 + B) * vN[2] - tc[2]];
      if (at === 10) dv[1] = Math.min(dv[1], 0.1);
      for (let i = 0; i < 3; i++) { dvMax[i] = Math.max(dvMax[i], dv[i]); dvMin[i] = Math.min(dvMin[i], dv[i]); }
      s98 = 0; s9c = 0;   // 0x804128f0: lift and side spin die on every approaching contact
    }
    if (normals.length) {
      v7c = v.slice();
      if (firstContact == null) firstContact = { tick: lifetime, pos: pos.slice(), vel: v.slice() };
    }
    for (let i = 0; i < 3; i++) pos[i] += pushMin[i] + pushMax[i];
    for (let i = 0; i < 3; i++) v[i] += dvMin[i] + dvMax[i];
    let nrm;
    if (normals.length) {
      landed = true;
      nrm = normals.length > 1 ? norm([0, 1, 2].map((i) => normals.reduce((s, n) => s + n[i], 0))) : normals[0];
    } else nrm = [0, 1, 0];
    ring[ringI] = [attrTick, nrm]; ringI = (ringI + 1) % 4;
  }

  // 0x804144b8: the speed for next tick's lift and side spin, the largest
  // attribute and the smoothed normal of the last four ticks
  function post() {
    vprev = mag(v);
    if (active) {
      attrMax = Math.max(ring[0][0], ring[1][0], ring[2][0], ring[3][0]);
      const s = [0, 1, 2].map((i) => 0 + ring[0][1][i] + ring[1][1][i] + ring[2][1][i] + ring[3][1][i]);
      nSmooth = mag(s) > 1e-9 ? norm(s) : [0, 1, 0];
    }
    if (!inAir()) attrGround = attrMax;
  }

  const path = [[0, 0, 0]];
  let bounces = 0, prevInAir = true, apex = 0;
  const rise = () => (pos[1] - y0 - BALL_R) / YD;
  while (active && lifetime < maxTicks) {
    // the step wrapper 0x80414734: Calc, then the contacts, then the post-tick
    calc();
    if (active) { pos64 = pos.slice(); contact(); post(); }
    const ia = inAir();
    if (firstContact && !ia && prevInAir) bounces++;
    if (!firstContact) apex = Math.max(apex, rise());
    prevInAir = ia;
    if (lifetime % 4 === 0 || !active) path.push([pos[0] / YD, rise(), pos[2] / YD]);
  }
  if (active) reason = "ticks";
  const stopX = pos[0] / YD;
  const carry = firstContact ? firstContact.pos[0] / YD : stopX;
  return { carry, stop: stopX, apex, roll: stopX - carry, lateral: pos[2] / YD, bounces, ticks: lifetime, reason, path };
}
