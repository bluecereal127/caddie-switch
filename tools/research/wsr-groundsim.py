# Ball simulation ported from WSR NTSC-U main.dol: RPGlfBall::Calc (0x80413b68) + the per-tick
# contact routine (0x8041228c) + the stop rule, on an infinite plane of one attribute (optionally
# tilted), with an optional WSR cup (0x803f07a4) at a given spot.  Extends tools/research/
# wsr-flightsim.py (air phase) with the ground phase; the decode it ports is tools/research/
# wsr-ground-phase.md.  Group T, 2026-10-18; corrected 2026-10-19 after the independent
# re-derivation of the decode (the steering vector is rotated into the ground plane at constant
# length instead of being shortened, the non-restable kick is normalised, a zero-depth query is a
# miss; none of these moves a number on a flat plane).
# Units: 1 unit = 0.1 m (9.144 units/yd); one tick = 1/240 s (4 ticks per 60 Hz frame).
# usage: python -I tools/research/wsr-groundsim.py      from any directory; standard library only.
#   Prints the tables of wsr-ground-phase.md sections 6 and 8: full-power stop distances per
#   club on fairway / rough / green / bunker (the fairway column reproduces the club blocks' P08
#   279/253/212/176/146/110/60 yd to 0.4 yd), the 3-bar table, the backspin-on-green table, the
#   putter's power -> distance and slope tables and a cup-capture sweep.  Import it for run(),
#   table(), Plane, Ball and cup_override() to simulate other shots.
import math, sys
CLUBS = {  # name: (P00, P04 maxspeed, P10 launch deg, P14 lift, P38 half-power q, P08 reach, P0c carry, type)
 'DR': (0.02, 3.39, 10, 0.65, 0.71, 279, 240, 0),
 'SP': (0.00, 3.13, 11, 0.70, 0.708, 253, 220, 0),
 '3I': (0.00, 2.79, 19, 0.50, 0.67, 212, 190, 1),
 '5I': (0.02, 2.45, 23, 0.50, 0.66, 176, 160, 1),
 '7I': (0.00, 2.13, 24, 0.50, 0.665, 146, 130, 1),
 '9I': (0.00, 1.78, 30, 0.50, 0.66, 110, 100, 1),
 'SW': (0.01, 1.28, 43, 0.00, 0.64, 60, 55, 2),
 'PT': (0.004, 0.41, 0, 0.00, 0.63, 20, 20, 3),
}
# per-attribute tables filled by 0x80415da4 (A at 0x807d2b50, B at 0x807d2b94)
A_TAB = [0.3, 0.4, 0.5, 1.0, 0.7, 1.0, 0.15, 1.0, 1.0, 0.3, 0.001, 0.3, 0.3, 1.0, 0.1, 0.4, 1.0]
B_TAB = [0.5, 0.5, 0.4, 0.001, 0.3, 0.001, 0.5, 0.001, 0.001, 0.5, 0.13, 0.5, 0.5, 0.001, 0.5, 0.5, 0.001]
CONTACT_MASK = 0x1de5e   # r2-0x764: attrs the contact routine resolves (adds rock wall 12 to the stop mask)
STOP_MASK = 0x1ce5e      # r2-0x76c: attrs a ball may come to rest on
ATTR = {'fairway': 1, 'rough': 2, 'bunker': 3, 'green': 6, 'fringe': 9, 'tee': 15}
LIFT_K, LIFT_DECAY = 0.0012, 0.9985
SIDE_K, SIDE_DECAY = 0.001, 0.999
GRAV, DRAG = 0.002, 0.999
BALL_R = 0.5             # r2-0xc4: the ball's collision radius
STOP_V, STOP_TICKS = 0.0015, 20
YD = 9.144
CUP_R, CUP_D = 1.5, 3.0  # 0x8040562c -> 0x803f0bdc: cup radius and depth in units
FLT_MIN = 1.17549435e-38  # r2-0xab0: below this length 0x803edd94 (SetLength) refuses to normalise
STEER_ROTATE = True      # False = the earlier plain-projection reading of the steering step (wrong; checks.py compares)

def norm(v):
    m = math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2])
    return [v[0]/m, v[1]/m, v[2]/m] if m > 1.17549435e-38 else [0.0, 0.0, 0.0]
def dot(a, b): return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]
def mag(v): return math.sqrt(dot(v, v))

def launch(club, power):
    P00, P04, ang, P14, P38, _, _, _ = CLUBS[club]
    q = power ** math.log2(1.0 / P38) if power > 0 else 0.0
    speed = P00 + q * (P04 - P00)
    th = math.radians(ang)
    return [math.cos(th) * speed, math.sin(th) * speed, 0.0], P14 * q

class Plane:
    """infinite surface through p0 with unit normal n and one KCL attribute"""
    def __init__(self, attr, slope_deg=0.0, slope_dir=(1.0, 0.0)):
        self.attr = attr
        t = math.radians(slope_deg)
        # normal tilted by t so the surface DROPS along slope_dir (unit xz vector): y = -tan(t) * (p . dir)
        self.n = norm([math.sin(t) * slope_dir[0], math.cos(t), math.sin(t) * slope_dir[1]])
        self.p0 = [0.0, 0.0, 0.0]
    def height_at(self, x, z):   # surface y under (x, z)
        n = self.n
        return self.p0[1] - (n[0] * (x - self.p0[0]) + n[2] * (z - self.p0[2])) / n[1]
    def contacts(self, pos, r, cup=None):
        """sphere-vs-plane like the KCL query 0x803f0c18: depth = r - signed distance, hit if > 0
        (0x803f0e48-0x803f0e50 rejects depth <= 0; a ball never sits at exactly 0 after a tick anyway).
        With a cup (centre cx, cz on the plane) the pin's prism override 0x803f07a4 replaces it."""
        d = dot([pos[i] - self.p0[i] for i in range(3)], self.n)
        depth = r - d
        if depth <= 0: return []
        if cup is not None:
            c = cup_override(pos, r, self.n, cup, depth)
            return [c] if c else []
        return [(self.attr, list(self.n), depth)]

def cup_override(pos, r, n, cup, plane_depth):
    """0x803f07a4: cup of radius CUP_R, depth CUP_D at cup=(cx, cy, cz) (cy = surface height there).
    Returns (attr, normal, depth) or None.  Horizontal plane assumed for the rim geometry."""
    cx, cy, cz = cup
    dx, dz = pos[0] - cx, pos[2] - cz
    rho = math.hypot(dx, dz)
    if rho < 1e-6:                               # over the centre: floor test only
        f2 = r + (cy - CUP_D - pos[1])
        return (11, [0.0, 1.0, 0.0], f2) if f2 >= 0 else None
    ux, uz = dx / rho, dz / rho                  # d-hat, centre -> ball
    rim = [cx + ux * CUP_R, cy, cz + uz * CUP_R] # nearest rim point (surface height there)
    rel = [pos[0] - rim[0], pos[1] - rim[1], pos[2] - rim[2]]
    nd = [-ux, 0.0, -uz]                         # toward the centre
    f4 = dot(rel, n)                             # height above the surface at the rim
    if f4 > r: return None
    f7 = dot(rel, nd)                            # horizontal distance inside the rim (+ = inside)
    if f7 > r:                                   # deep inside: floor
        f2 = r + (cy - CUP_D - pos[1])
        return (11, [0.0, 1.0, 0.0], f2) if f2 >= 0 else None
    if f4 > f7:
        if f4 <= 0: return lip(rel, n, nd, f7, r, plane_depth)
        if dot(n, nd) * f4 <= f7: return rim_edge(rel, r)
        return lip(rel, n, nd, f7, r, plane_depth)
    else:
        if f7 <= 0: return lip(rel, n, nd, f7, r, plane_depth)
        if dot(nd, n) * f7 > f4: return wall(pos, cy, nd, f7, r)
        return rim_edge(rel, r)

def rim_edge(rel, r):
    d2 = dot(rel, rel)
    if d2 >= r * r: return None
    m = math.sqrt(d2)
    nrm = [rel[i] / m for i in range(3)] if m > 1e-9 else [0.0, 1.0, 0.0]
    return (10, nrm, r - m)
def wall(pos, cy, nd, f7, r):
    f30 = r + (cy - CUP_D - pos[1])            # penetration into the floor
    if f30 >= 0:                               # wall/floor corner
        v = [nd[0] * (r - f7), f30, nd[2] * (r - f7)]
        return (11, norm(v), mag(v))
    return (10, [nd[0], 0.0, nd[2]], r - f7)
def lip(rel, n, nd, f7, r, plane_depth):
    f2 = (f7 + r) / r                          # 0 at r outside the rim .. 1 at the rim (negative further out)
    q = math.copysign(abs(f2) ** math.log2(1 / 0.01), f2) if abs(f2) >= 0.001 else 0.0   # 0x803ef330 keeps the sign
    w = min(max(0.5 * q, 0.0), 0.5)            # clamp(0.5 q, 0, 0.5): no tilt beyond 0.5 u outside the rim
    attr = 10 if w > 0.1 else 6
    nrm = norm([n[i] + nd[i] * w for i in range(3)])
    return (attr, nrm, plane_depth)

class Ball:
    def __init__(self, pos, vel, lift, side=0.0, back=0.0, club='DR', spin_start=0, sim_iron_rule=True):
        self.pos = list(pos); self.vel = list(vel); self.v7c = list(vel)
        self.s98 = lift; self.s9c = side; self.bs = back
        self.club = club; self.ctype = CLUBS[club][7]
        self.lifetime = 0; self.spin_start = spin_start
        self.ring = [(0, [0.0, 1.0, 0.0])] * 4; self.ring_i = 0
        self.n_smooth = [0.0, 1.0, 0.0]; self.attr_max = 0; self.attr_ground = 0
        self.steer_init = False; self.P = [0.0, 0.0, 0.0]
        self.landed = False; self.stop_count = 0; self.active = True
        self.vprev = mag(vel); self.pos64 = list(pos); self.water = 0
        self.first_contact = None; self.contact_ticks = 0; self.stop_reason = None
        self.sim_iron_rule = sim_iron_rule
    def in_air(self):   # 0x804121c4
        return (self.lifetime < 8 or self.attr_max == 0) and self.water != 1
    def calc(self, pin=None, slope_n=None):
        v = self.vel
        self.lifetime += 1
        frame = self.lifetime >> 2
        # 1. lift
        L = norm([-v[0] * v[1], v[0] * v[0] + v[2] * v[2], -v[1] * v[2]])
        k = self.vprev * LIFT_K * self.s98
        for i in range(3): v[i] += L[i] * k
        self.s98 *= LIFT_DECAY
        if self.lifetime > self.spin_start:
            # 2. side spin
            S = norm([v[2], 0.0, -v[0]])
            k = self.vprev * SIDE_K * self.s9c
            for i in range(3): v[i] += S[i] * k
            self.s9c *= SIDE_DECAY
            # 3. backspin pull-back / roll steering (0x80413cd0..0x80414084), ground only
            if not self.in_air():
                if not self.steer_init and frame > 30:
                    self.steer_init = True
                    h = norm([self.v7c[0], 0.0, self.v7c[2]])
                    f29 = min(self.bs, 0.9)
                    pw = abs(f29) ** (1.4427 * -math.log(0.655)) if abs(f29) >= 0.001 else 0.0   # f29^0.61
                    self.P = [h[i] * (-0.06 * pw) for i in range(3)]
                # 0x80413d8c-0x80413e14: P is turned into the ground plane at its full length, not shortened:
                # the projection P - n(n.P) is rescaled to |P| by 0x803edd94 (SetLength, f1 = |P| from
                # 0x80413de4), and P becomes 0x807d2650 = (0,0,0) when the projection is below FLT_MIN
                n = self.n_smooth
                pn = dot(self.P, n)
                proj = [self.P[i] - n[i] * pn for i in range(3)]
                m = mag(proj)
                if m < FLT_MIN: self.P = [0.0, 0.0, 0.0]
                elif STEER_ROTATE: self.P = [proj[i] * (mag(self.P) / m) for i in range(3)]
                else: self.P = proj
                a = A_TAB[self.attr_ground]
                w = 0.7 + 0.19 * (1.0 - min(max(a, 0.15), 1.0)) / 0.85        # lie weight
                hfac = 1.0
                if pin is not None and self.bs > 0:
                    d = [pin[0] - self.pos[0], 0.0, pin[2] - self.pos[2]]
                    cr = d[2] * self.P[0] - d[0] * self.P[2]; dt = d[0] * self.P[0] + d[2] * self.P[2]
                    ang = abs(math.degrees(math.atan2(cr, dt))) if (cr or dt) else 0.0
                    hfac = 1.3 - 0.3 * (min(max(ang, 5.0), 30.0) - 5.0) / 25.0  # bunker lie: 1.0 (not modelled)
                self.P = [self.P[i] * w for i in range(3)]
                for i in range(3): v[i] += self.P[i] * hfac
        # 4. wind: not modelled here (air only)
        # 5. gravity along -normalize(0.5 n + 0.5 yhat)
        g = norm([0.5 * self.n_smooth[0], 0.5 * self.n_smooth[1] + 0.5, 0.5 * self.n_smooth[2]])
        if g == [0.0, 0.0, 0.0]: g = [0.0, 1.0, 0.0]
        for i in range(3): v[i] -= GRAV * g[i]
        # 6. integrate, drag
        for i in range(3): self.pos[i] += v[i]
        for i in range(3): v[i] *= DRAG
        # stop rule (0x80414310): displacement this tick vs the start-of-tick copy
        if not self.in_air():
            d = [self.pos[i] - self.pos64[i] for i in range(3)]
            if dot(d, d) < STOP_V * STOP_V: self.stop_count += 1
            else: self.stop_count = 0
            if self.stop_count > STOP_TICKS:
                if (1 << self.attr_max) & STOP_MASK:
                    self.stop('rest'); return
                # 0x804143b4-0x804143e0: v := 0.02 * normalize(n.x, 0, n.z) through 0x803edd94 (zero when the
                # smoothed normal is vertical) and the counter restarts, so the kick fires at most once per 21 ticks
                h = norm([self.n_smooth[0], 0.0, self.n_smooth[2]])
                self.vel = [h[0] * 0.02, 0.0, h[2] * 0.02]; self.stop_count = 0
        if self.lifetime > 0x1c20: self.stop('timeout')
    def stop(self, why):
        self.vel = [0.0, 0.0, 0.0]; self.active = False; self.stop_reason = why
    def contact(self, surf, cup=None):   # 0x8041228c on a plane
        v = self.vel
        hits = surf.contacts(self.pos, BALL_R, cup)
        attr_tick = 0
        push_min = [0.0] * 3; push_max = [0.0] * 3; dv_min = [0.0] * 3; dv_max = [0.0] * 3
        normals = []
        for attr, n, depth in hits:
            if not ((1 << attr) & CONTACT_MASK): continue
            if v[1] < 0.25 and attr > attr_tick: attr_tick = attr
            normals.append(n)
            pn = [n[i] * depth for i in range(3)]
            for i in range(3): push_max[i] = max(push_max[i], pn[i]); push_min[i] = min(push_min[i], pn[i])
            vdn = dot(v, n); vn = -vdn
            v_n = [n[i] * vdn for i in range(3)]
            t = [v[i] - v_n[i] for i in range(3)]
            if vn < 0: continue
            A, B = A_TAB[attr], B_TAB[attr]
            if self.sim_iron_rule and not self.landed and self.ctype == 1 and attr in (6, 9):
                A, B = 0.48, 0.5
            cap = vn * A; tm = mag(t)
            tc = [t[i] * (cap / tm) for i in range(3)] if tm > cap else t
            if self.in_air() and self.bs > 0:
                f = 1.0 - 0.6 * (min(max(self.bs, 0.0), 1.0) ** math.log2(1 / 0.6))
                B *= f
                if self.steer_init: self.bs *= f
            dv = [-(1.0 + B) * v_n[i] - tc[i] for i in range(3)]
            if attr == 10: dv[1] = min(dv[1], 0.1)
            for i in range(3): dv_max[i] = max(dv_max[i], dv[i]); dv_min[i] = min(dv_min[i], dv[i])
            self.s98 = 0.0; self.s9c = 0.0      # 0x804128f0: lift and side spin die on every approaching contact
        if normals:
            self.v7c = list(v)
            if self.first_contact is None: self.first_contact = (self.lifetime, list(self.pos), list(v))
            self.contact_ticks += 1
        for i in range(3): self.pos[i] += push_min[i] + push_max[i]
        for i in range(3): v[i] += dv_min[i] + dv_max[i]
        if normals:
            self.landed = True
            nrm = norm([sum(n[i] for n in normals) for i in range(3)]) if len(normals) > 1 else normals[0]
        else:
            nrm = [0.0, 1.0, 0.0]
        self.ring[self.ring_i] = (attr_tick, nrm); self.ring_i = (self.ring_i + 1) % 4
    def post(self):   # 0x804144b8
        self.vprev = mag(self.vel)
        if self.active:
            self.attr_max = max(a for a, _ in self.ring)
            s = [sum(n[i] for _, n in self.ring) for i in range(3)]
            self.n_smooth = norm(s) if mag(s) > 1e-9 else [0.0, 1.0, 0.0]
        if not self.in_air(): self.attr_ground = self.attr_max
    def step(self, surf, cup=None, pin=None):   # wrapper 0x80414734
        self.calc(pin)
        if not self.active: return
        self.pos64 = list(self.pos)
        self.contact(surf, cup)
        self.post()

def run(club, power, surf, back=0.0, side=0.0, cup=None, pin=None, max_ticks=8000, trace=False, sim_iron_rule=True):
    vel, lift = launch(club, power)
    y0 = surf.height_at(0.0, 0.0)
    b = Ball([0.0, y0 + BALL_R, 0.0], vel, lift, side, back, club, spin_start=0, sim_iron_rule=sim_iron_rule)
    bounces = []    # (tick, x) of contacts that start after >=4 ticks in the air
    apex_after = []  # max height between first contact and second contact
    air_run = 0; cur_apex = None; prev_in_air = True
    path = []
    while b.active and b.lifetime < max_ticks:
        b.step(surf, cup, pin)
        if trace: path.append((b.lifetime, b.pos[0], b.pos[1], b.pos[2], b.vel[0], b.vel[1]))
        ia = b.in_air()
        if b.first_contact and not ia and prev_in_air: bounces.append((b.lifetime, b.pos[0]))
        if b.first_contact and len(bounces) == 1:
            h = b.pos[1] - surf.height_at(b.pos[0], b.pos[2]) - BALL_R
            cur_apex = h if cur_apex is None else max(cur_apex, h)
        prev_in_air = ia
    return b, bounces, cur_apex, path

def table(surface='fairway', power=1.0, back=0.0, clubs=('DR', 'SP', '3I', '5I', '7I', '9I', 'SW'), slope=0.0, sdir=(1.0, 0.0), title=None):
    surf = Plane(ATTR[surface], slope, sdir)
    print(title or ('power %.2f on %s%s' % (power, surface, (' slope %.1f deg' % slope) if slope else '')))
    print('  club  carry_yd  bounce1_h_yd  bounce1_len_yd  n_bounce  stop_yd  roll_yd  P08  ticks  reason')
    rows = {}
    for c in clubs:
        b, bounces, apex, _ = run(c, power, surf, back=back)
        carry = b.first_contact[1][0] / YD if b.first_contact else float('nan')
        stop = b.pos[0] / YD
        b1len = (bounces[1][1] - bounces[0][1]) / YD if len(bounces) > 1 else stop - carry
        rows[c] = (carry, stop)
        print('  %-4s  %7.1f  %11.2f  %13.1f  %8d  %7.1f  %7.1f  %3d  %5d  %s' % (
            c, carry, (apex or 0) / YD, b1len, len(bounces), stop, stop - carry, CLUBS[c][5], b.lifetime, b.stop_reason))
    return rows

if __name__ == '__main__':
    table('fairway', 1.0)
    table('rough', 1.0, title='full power, landing on rough (launched from the same flat plane)')
    table('green', 1.0, title='full power, landing on green (irons: first-contact A = 0.48)')
    table('green', 1.0, title='full power on green, with backspin bs = 1.0 (irons/wedge)', back=1.0, clubs=('3I', '5I', '7I', '9I', 'SW'))
    table('fairway', 0.75, title='3-bar swing (power 0.75) on fairway')
    table('bunker', 1.0, title='full power landing in a bunker')
    print('putter on flat green: power -> stop distance')
    surf = Plane(ATTR['green'])
    print('  power  v0_u/tick  v0_m/s  stop_yd  ticks')
    for p in (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.25, 1.5, 2.0, 2.5):
        b, _, _, _ = run('PT', p, surf)
        v0, _ = launch('PT', p)
        print('  %5.2f  %9.4f  %6.2f  %7.2f  %5d' % (p, v0[0], v0[0] * 24.0, b.pos[0] / YD, b.lifetime))
    print('putter power 1.0 on sloped green (uphill +, downhill -), slope along the putt')
    for s in (-4, -2, -1, 0, 1, 2, 4):
        surf = Plane(ATTR['green'], abs(s), (1.0, 0.0) if s < 0 else (-1.0, 0.0))   # downhill = drops along +x
        b, _, _, _ = run('PT', 1.0, surf)
        print('  slope %+d deg: stop %.2f yd (%d ticks)' % (s, b.pos[0] / YD, b.lifetime))
    print('putter on flat green toward a cup 10 yd away: holed?')
    for p in (0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.9, 1.0):
        surf = Plane(ATTR['green'])
        cup = (10 * YD, 0.0, 0.0)
        b, _, _, _ = run('PT', p, surf, cup=cup)
        holed = b.attr_max in (10, 11) and b.pos[1] < cup[1]
        print('  power %.2f: stop x %.2f yd, y %.3f u, attr %d -> %s' % (p, b.pos[0] / YD, b.pos[1], b.attr_max, 'HOLED' if holed else 'missed/ran past'))
