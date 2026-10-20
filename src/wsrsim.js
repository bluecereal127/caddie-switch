// Wii Sports Resort's golf ball, tick for tick: the port of tools/research/
// wsr-groundsim.py (RPGlfBall::Calc 0x80413b68, the contact routine 0x8041228c
// and the stop rule, from WSR's NTSC-U main.dol; the decode is
// tools/research/wsr-ground-phase.md, the air phase wsr-club-physics.md) on an
// infinite plane of one KCL attribute, flat or tilted along the shot, or on a
// shot line's terrain profile (the solver's elevation, src/model.js), plus the
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

// normalize(a0, a1, a2) into u (a Float64Array(3)); (0, 0, 0) below FLT_MIN,
// where SetLength (0x803edd94) refuses
function unitInto(u, a0, a1, a2) {
  const m = Math.sqrt(a0 * a0 + a1 * a1 + a2 * a2);
  if (m > FLT_MIN) { u[0] = a0 / m; u[1] = a1 / m; u[2] = a2 / m; } else { u[0] = 0; u[1] = 0; u[2] = 0; }
}

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
    // distance, a hit only when > 0 (0x803f0e48 rejects depth <= 0). A hit
    // writes its attribute and normal into `hit` and returns the depth.
    query(x, y, z, r, hit) {
      const depth = r - (x * n[0] + y * n[1] + z * n[2]);
      if (depth <= 0) return 0;
      hit.attr = attr; hit.n0 = n[0]; hit.n1 = n[1]; hit.n2 = n[2];
      return depth;
    },
  };
}

// The ground along a shot line (src/model.js flies the course's terrain on
// it): profile.heightAt(x) = the ground's height in yd, x yd along the shot
// from the ball, relative to the ball's own ground (so heightAt(0) = 0), level
// across the line (the same at every z); profile.surfaceAt(x) = its lie, a
// SURFACE_ATTR key, where null or any other read (water, OB, a bank) is
// fairway, as src/model.js landingSurface. Each contact query is against the
// local tangent plane at the ball's x: through the profile's height there,
// its normal from the slope over x - 1 .. x + 1 yd, its attribute from the
// surface there. WSR queries the KCL's triangles; one plane per tick under
// the ball is the plane runs' model carried along the line. On a flat or
// uniformly tilted profile that plane is plane()'s, so the run is plane()'s
// (tools/test-solver.mjs: within 1e-9 yd of plane(attr, 0) for every club,
// and the 3-degree rows of wsr-ground-phase.md section 8).
function profileGround(profile) {
  const hAt = (x) => profile.heightAt(x);
  return {
    heightAt: (x) => hAt(x / YD) * YD,
    query(x, y, z, r, hit) {
      const xs = x / YD;
      // the normal: norm([-slope, 1, 0]); the signed distance to the plane
      // through (x, h(x)) is (y - h) n.y
      const a = 0 - (hAt(xs + 1) - hAt(xs - 1)) / 2, m = Math.sqrt(a * a + 1 * 1 + 0 * 0);
      const depth = r - (y - hAt(xs) * YD) * (1 / m);
      if (depth <= 0) return 0;
      hit.attr = SURFACE_ATTR[profile.surfaceAt(xs)] ?? SURFACE_ATTR.fairway;
      hit.n0 = a / m; hit.n1 = 1 / m; hit.n2 = 0 / m;
      return depth;
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

// run({ club, q, surface, back, side, slopeDeg, wind, spinStart, maxTicks, profile, ballLift, trace })
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
//   profile   null (the plane above), or { heightAt(x), surfaceAt(x) }: the shot
//             line's ground (profileGround), which replaces surface and slopeDeg
//   ballLift  how far the ball sits above its ground at launch, yd (0; the online
//             platform's upper tier stands above the course); y below is
//             measured from there, and so is the wind's ramp
//   trace     false skips the path (path: null), for the solver's many runs
// -> { carry, stop, apex, roll, lateral, bounces, ticks, reason, path } in yd:
//   carry = x at the first contact, stop = x at rest, roll = stop - carry,
//   lateral = z at rest (+ = right), apex = the highest y before the first
//   contact; path = [x, y, z] every 4 ticks (one 60 Hz frame) from launch to
//   rest, y the ball's rise above where it sat at launch (0 at launch, so it
//   is the height above the launch plane on flat ground). No pin: the
//   pull-back's pin homing is h = 1 (the reference's tables).
//
// The ball's vectors are scalars and the tick is one loop body (Calc, the
// contact routine, the post-tick), so a tick allocates nothing and calls
// little: the solver flies dozens of shots per input change. Each formula
// keeps the Python's operations in its order, so the results are the same to
// the bit (tools/test-solver.mjs holds the reference numbers).
export function run({ club, q, surface = "fairway", back = 0, side = 0, slopeDeg = 0, wind = null, spinStart = 0, maxTicks = 8000, profile = null, ballLift = 0, trace = true }) {
  const c = CLUBS[club];
  if (!c) throw new Error(`unknown club ${club}`);
  const attr = SURFACE_ATTR[surface];
  if (attr == null) throw new Error(`unknown surface ${surface}`);
  const surf = profile ? profileGround(profile) : plane(attr, slopeDeg);
  const W = windOf(wind);
  const { vel, lift } = launch(club, q);
  const y0 = surf.heightAt(0, 0) + ballLift * YD;

  // ---- the ball (RPGlfBall), as the Python's Ball ----
  let px = 0, py = y0 + BALL_R, pz = 0;         // pos
  let vx = vel[0], vy = vel[1], vz = vel[2];    // v
  let cx = vx, cz = vz;                         // ball+0x7c: the velocity entering the last contact (x, z: all the steering reads)
  let s98 = lift, s9c = side, bs = back;
  const ctype = c.type;
  let lifetime = 0;
  // the ring of the last four ticks' contacts: attribute, normal
  const ringA = [0, 0, 0, 0], ringN = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  let ringI = 0;
  let nx = 0, ny = 1, nz = 0, attrMax = 0, attrGround = 0;   // the smoothed normal (nSmooth)
  let steerInit = false, Px = 0, Py = 0, Pz = 0;
  let landed = false, stopCount = 0, active = true, reason = null;
  let vprev = Math.sqrt(vx * vx + vy * vy + vz * vz);
  let qx = px, qy = py, qz = pz;                // ball+0x64 (pos64): the position after Calc, before the contacts
  let firstX = null;                            // x at the first contact
  const u = new Float64Array(3);                // unitInto's result
  const hit = { attr: 0, n0: 0, n1: 1, n2: 0 }; // the surface query's
  const path = trace ? [[0, 0, 0]] : null;
  let bounces = 0, prevInAir = true, apex = 0;

  while (active && lifetime < maxTicks) {
    // ---- the step wrapper 0x80414734: Calc ... ----
    lifetime += 1;
    const frame = lifetime >> 2;
    // 0x804121c4 (no water here); Calc and the contact routine read it before
    // the post-tick moves attrMax
    const air = lifetime < 8 || attrMax === 0;
    // 1. lift, perpendicular to v in the vertical plane
    unitInto(u, -vx * vy, vx * vx + vz * vz, -vy * vz);
    let k = vprev * LIFT_K * s98;
    vx += u[0] * k; vy += u[1] * k; vz += u[2] * k;
    s98 *= LIFT_DECAY;
    if (lifetime > spinStart) {
      // 2. side spin (normalize(vz, 0, -vx) is left of the travel)
      unitInto(u, vz, 0, -vx);
      k = vprev * SIDE_K * s9c;
      vx += u[0] * k; vy += u[1] * k; vz += u[2] * k;
      s9c *= SIDE_DECAY;
      // 3. backspin pull-back / roll steering (0x80413cd0-0x80414084), ground only
      if (!air) {
        if (!steerInit && frame > 30) {
          steerInit = true;
          unitInto(u, cx, 0, cz);
          const f29 = Math.min(bs, 0.9);
          const pw = Math.abs(f29) >= 0.001 ? Math.pow(Math.abs(f29), 1.4427 * -Math.log(0.655)) : 0;   // f29^0.61
          Px = u[0] * (-0.06 * pw); Py = u[1] * (-0.06 * pw); Pz = u[2] * (-0.06 * pw);
        }
        // P is turned into the ground plane at its full length (SetLength), or
        // becomes (0, 0, 0) when the projection is below FLT_MIN
        const pn = Px * nx + Py * ny + Pz * nz;
        const r0 = Px - nx * pn, r1 = Py - ny * pn, r2 = Pz - nz * pn;
        const m = Math.sqrt(r0 * r0 + r1 * r1 + r2 * r2);
        if (m < FLT_MIN) { Px = 0; Py = 0; Pz = 0; }
        else { const s = Math.sqrt(Px * Px + Py * Py + Pz * Pz) / m; Px = r0 * s; Py = r1 * s; Pz = r2 * s; }
        const a = A_TAB[attrGround];
        const w = 0.7 + 0.19 * (1.0 - Math.min(Math.max(a, 0.15), 1.0)) / 0.85;   // lie weight
        Px = Px * w; Py = Py * w; Pz = Pz * w;
        vx += Px * 1.0; vy += Py * 1.0; vz += Pz * 1.0;   // pin homing h = 1 (no pin)
      }
    }
    // 4. wind, in the air only
    if (W && air) {
      const dh = py - y0;
      const f = Math.min(Math.max(0.1 + 0.9 * dh / 300.0, 0.1), 1.0);
      const W0 = W.x * W.mag0 * f, W2 = W.z * W.mag0 * f;
      unitInto(u, vx, 0, vz);
      const along = W0 * u[0] + W2 * u[2];
      const a740 = u[0] * along, a742 = u[2] * along;
      const a680 = W0 - a740, a682 = W2 - a742;
      vx += WIND_K * (WIND_ALONG * a740 + a680);
      vz += WIND_K * (WIND_ALONG * a742 + a682);
    }
    // 5. gravity along -normalize(0.5 n + 0.5 yhat), n the smoothed contact normal
    unitInto(u, 0.5 * nx, 0.5 * ny + 0.5, 0.5 * nz);
    if (u[0] === 0 && u[1] === 0 && u[2] === 0) { u[0] = 0; u[1] = 1; u[2] = 0; }
    vx -= GRAV * u[0]; vy -= GRAV * u[1]; vz -= GRAV * u[2];
    // 6. integrate, drag
    px += vx; py += vy; pz += vz;
    vx *= DRAG; vy *= DRAG; vz *= DRAG;
    // stop rule (0x80414310): this tick's displacement against pos64
    if (!air) {
      const d0 = px - qx, d1 = py - qy, d2 = pz - qz;
      if (d0 * d0 + d1 * d1 + d2 * d2 < STOP_V * STOP_V) stopCount += 1;
      else stopCount = 0;
      if (stopCount > STOP_TICKS) {
        if ((1 << attrMax) & STOP_MASK) { vx = 0; vy = 0; vz = 0; active = false; reason = "rest"; }
        else {
          // on a surface it may not rest on, v := 0.02 normalize(n.x, 0, n.z) and the count restarts
          unitInto(u, nx, 0, nz);
          vx = u[0] * 0.02; vy = 0; vz = u[2] * 0.02; stopCount = 0;
        }
      }
    }
    if (active && lifetime > MAX_LIFE) { vx = 0; vy = 0; vz = 0; active = false; reason = "timeout"; }

    // ---- ... then the contact routine 0x8041228c on the surface ... ----
    // per touching prism the impulse dv = -(1 + B)(v.n)n - min(|t|, A vn) t^
    // (vn = -(v.n) >= 0, t the tangential velocity), the push-out n * depth,
    // and the tick's record in the ring. One surface is one prism a tick; the
    // per-tick min / max accumulators stay, as in the routine (a single
    // contact applies exactly).
    if (active) {
      qx = px; qy = py; qz = pz;
      const depth = surf.query(px, py, pz, BALL_R, hit);
      const at = hit.attr, n0 = hit.n0, n1 = hit.n1, n2 = hit.n2;
      const touched = depth > 0 && ((1 << at) & CONTACT_MASK) !== 0;
      let attrTick = 0;
      let pushMin0 = 0, pushMin1 = 0, pushMin2 = 0, pushMax0 = 0, pushMax1 = 0, pushMax2 = 0;
      let dvMin0 = 0, dvMin1 = 0, dvMin2 = 0, dvMax0 = 0, dvMax1 = 0, dvMax2 = 0;
      if (touched) {
        if (vy < 0.25 && at > attrTick) attrTick = at;
        const pn0 = n0 * depth, pn1 = n1 * depth, pn2 = n2 * depth;
        pushMax0 = Math.max(pushMax0, pn0); pushMax1 = Math.max(pushMax1, pn1); pushMax2 = Math.max(pushMax2, pn2);
        pushMin0 = Math.min(pushMin0, pn0); pushMin1 = Math.min(pushMin1, pn1); pushMin2 = Math.min(pushMin2, pn2);
        const vdn = vx * n0 + vy * n1 + vz * n2, vn = -vdn;
        const vN0 = n0 * vdn, vN1 = n1 * vdn, vN2 = n2 * vdn;
        const t0 = vx - vN0, t1 = vy - vN1, t2 = vz - vN2;
        if (!(vn < 0)) {   // moving away: pushed out, no impulse
          let A = A_TAB[at], B = B_TAB[at];
          // an iron's first contact of the shot on a green or its edge (0x80412774)
          if (!landed && ctype === 1 && (at === 6 || at === 9)) { A = 0.48; B = 0.5; }
          const cap = vn * A, tm = Math.sqrt(t0 * t0 + t1 * t1 + t2 * t2);
          let tc0 = t0, tc1 = t1, tc2 = t2;
          if (tm > cap) { tc0 = t0 * (cap / tm); tc1 = t1 * (cap / tm); tc2 = t2 * (cap / tm); }
          // backspin softens a landing from the air and decays once the steering has started
          if (air && bs > 0) {
            const f = 1.0 - 0.6 * Math.pow(Math.min(Math.max(bs, 0.0), 1.0), Math.log2(1 / 0.6));
            B *= f;
            if (steerInit) bs *= f;
          }
          const dv0 = -(1.0 + B) * vN0 - tc0, dv2 = -(1.0 + B) * vN2 - tc2;
          let dv1 = -(1.0 + B) * vN1 - tc1;
          if (at === 10) dv1 = Math.min(dv1, 0.1);
          dvMax0 = Math.max(dvMax0, dv0); dvMax1 = Math.max(dvMax1, dv1); dvMax2 = Math.max(dvMax2, dv2);
          dvMin0 = Math.min(dvMin0, dv0); dvMin1 = Math.min(dvMin1, dv1); dvMin2 = Math.min(dvMin2, dv2);
          s98 = 0; s9c = 0;   // 0x804128f0: lift and side spin die on every approaching contact
        }
        cx = vx; cz = vz;
        if (firstX == null) firstX = px;
      }
      px += pushMin0 + pushMax0; py += pushMin1 + pushMax1; pz += pushMin2 + pushMax2;
      vx += dvMin0 + dvMax0; vy += dvMin1 + dvMax1; vz += dvMin2 + dvMax2;
      if (touched) landed = true;
      const r = 3 * ringI;
      ringA[ringI] = attrTick;
      if (touched) { ringN[r] = n0; ringN[r + 1] = n1; ringN[r + 2] = n2; } else { ringN[r] = 0; ringN[r + 1] = 1; ringN[r + 2] = 0; }
      ringI = (ringI + 1) % 4;

      // ---- ... then the post-tick 0x804144b8: the speed for next tick's lift
      // and side spin, the largest attribute and the smoothed normal of the
      // last four ticks ----
      vprev = Math.sqrt(vx * vx + vy * vy + vz * vz);
      attrMax = Math.max(ringA[0], ringA[1], ringA[2], ringA[3]);
      const s0 = 0 + ringN[0] + ringN[3] + ringN[6] + ringN[9];
      const s1 = 0 + ringN[1] + ringN[4] + ringN[7] + ringN[10];
      const s2 = 0 + ringN[2] + ringN[5] + ringN[8] + ringN[11];
      if (Math.sqrt(s0 * s0 + s1 * s1 + s2 * s2) > 1e-9) { unitInto(u, s0, s1, s2); nx = u[0]; ny = u[1]; nz = u[2]; }
      else { nx = 0; ny = 1; nz = 0; }
      if (!(lifetime < 8 || attrMax === 0)) attrGround = attrMax;
    }
    const ia = lifetime < 8 || attrMax === 0;
    if (firstX != null && !ia && prevInAir) bounces++;
    if (firstX == null) apex = Math.max(apex, (py - y0 - BALL_R) / YD);
    prevInAir = ia;
    if (path && (lifetime % 4 === 0 || !active)) path.push([px / YD, (py - y0 - BALL_R) / YD, pz / YD]);
  }
  if (active) reason = "ticks";
  const stopX = px / YD;
  const carry = firstX != null ? firstX / YD : stopX;
  return { carry, stop: stopX, apex, roll: stopX - carry, lateral: pz / YD, bounces, ticks: lifetime, reason, path };
}
