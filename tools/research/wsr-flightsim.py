# Flight simulation ported from RPGlfBall::Calc (0x80413b68, WSR NTSC-U main.dol) air phase.
# Units: map units (1 unit = 0.1 m, 9.144 units/yd), one tick = one Calc call.
# usage: python -I flightsim.py [power ...]
import math, sys
CLUBS = {  # name: (P00, P04 maxspeed, P10 launch deg, P14 lift, P38 half-power q, P08, P0c)
 'DR': (0.02, 3.39, 10, 0.65, 0.71, 279, 240),
 'SP': (0.00, 3.13, 11, 0.70, 0.708, 253, 220),
 '3I': (0.00, 2.79, 19, 0.50, 0.67, 212, 190),
 '5I': (0.02, 2.45, 23, 0.50, 0.66, 176, 160),
 '7I': (0.00, 2.13, 24, 0.50, 0.665, 146, 130),
 '9I': (0.00, 1.78, 30, 0.50, 0.66, 110, 100),
 'SW': (0.01, 1.28, 43, 0.00, 0.64, 60, 55),
}
LIFT_K, LIFT_DECAY = 0.0012, 0.9985   # r2-0x34, r2-0x30
SIDE_K, SIDE_DECAY = 0.001, 0.999     # r2-0x50, r2-0x2c
GRAV, DRAG = 0.002, 0.999             # r2-0x8 (as -0.002 along blended normal), r2-0x2c
WIND_K, WIND_ALONG = 8e-5, 0.6        # r2-0xc, r2-0x9c
YD = 9.144
def norm(v):
    m = math.sqrt(v[0]**2 + v[1]**2 + v[2]**2)
    return (v[0]/m, v[1]/m, v[2]/m) if m > 1.17549435e-38 else (0.0, 0.0, 0.0)
def sim(club, power, side=0.0, wind=(0.0, 0.0), windspd_idx=0, h0=0.0):
    P00, P04, ang, P14, P38, _, _ = CLUBS[club]
    q = power ** math.log2(1.0 / P38) if power > 0 else 0.0
    speed = P00 + q * (P04 - P00)
    th = math.radians(ang)
    vel = [math.cos(th) * speed, math.sin(th) * speed, 0.0]
    s98 = P14 * q; s9c = side
    pos = [0.0, h0, 0.0]
    spd = math.sqrt(sum(c * c for c in vel))
    apex = 0.0; t = 0
    # wind vector per 0x803ecdb4: 15*(idx/15)^log2(1/0.6) * clamp(0.1+0.9*dh/300, 0.1, 1) * dir
    wmag0 = 15.0 * ((windspd_idx / 15.0) ** math.log2(1 / 0.6)) if windspd_idx > 0 else 0.0
    while True:
        t += 1
        # lift: perpendicular to v in the vertical plane, upward
        L = norm((-vel[0] * vel[1], vel[0]**2 + vel[2]**2, -vel[1] * vel[2]))
        k = spd * LIFT_K * s98
        vel = [vel[i] + L[i] * k for i in range(3)]; s98 *= LIFT_DECAY
        # sidespin (lifetime > spin-start frame; 0 here)
        Sd = norm((vel[2], 0.0, -vel[0]))
        k = spd * SIDE_K * s9c
        vel = [vel[i] + Sd[i] * k for i in range(3)]; s9c *= SIDE_DECAY
        # wind (in air)
        if wmag0:
            dh = pos[1] - h0
            f = min(max(0.1 + 0.9 * dh / 300.0, 0.1), 1.0)
            W = (wind[0] * wmag0 * f, 0.0, wind[1] * wmag0 * f)
            hdir = norm((vel[0], 0.0, vel[2]))
            along = W[0] * hdir[0] + W[2] * hdir[2]
            a74 = (hdir[0] * along, 0.0, hdir[2] * along)
            a68 = (W[0] - a74[0], 0.0, W[2] - a74[2])
            vel[0] += WIND_K * (WIND_ALONG * a74[0] + a68[0])
            vel[2] += WIND_K * (WIND_ALONG * a74[2] + a68[2])
        # gravity
        vel[1] -= GRAV
        # integrate, drag
        pos = [pos[i] + vel[i] for i in range(3)]
        vel = [c * DRAG for c in vel]
        spd = math.sqrt(sum(c * c for c in vel))
        apex = max(apex, pos[1] - h0)
        if pos[1] < h0 and vel[1] < 0: break
        if t > 20000: break
    return pos[0] / YD, pos[2] / YD, apex / YD, t, speed, q
if __name__ == '__main__':
    powers = [float(x) for x in sys.argv[1:]] or [1.0]
    for p in powers:
        print('power %.3f' % p)
        print('  club   q      speed  carry_yd  apex_yd  ticks   P08  P0c')
        for c in CLUBS:
            x, z, apex, t, speed, q = sim(c, p)
            print('  %-4s  %.3f  %.3f  %7.1f  %6.1f  %5d   %3d  %3d' % (c, q, speed, x, apex, t, CLUBS[c][5], CLUBS[c][6]))
    print('wind test: driver full power, 30 mph (idx 15) cross / tail / head')
    for name, w in (('cross', (0, 1)), ('tail', (1, 0)), ('head', (-1, 0))):
        x, z, apex, t, speed, q = sim('DR', 1.0, wind=w, windspd_idx=15)
        print('  %-5s carry %.1f yd  drift %.1f yd' % (name, x, z))
    for idx in (2, 5, 10, 15):
        x, z, apex, t, speed, q = sim('DR', 1.0, wind=(0, 1), windspd_idx=idx)
        x2, z2, _, _, _, _ = sim('DR', 1.0, wind=(1, 0), windspd_idx=idx)
        x3, z3, _, _, _, _ = sim('DR', 1.0, wind=(-1, 0), windspd_idx=idx)
        print('  idx %2d (%2d mph): cross drift %.1f yd; tail carry %.1f; head carry %.1f' % (idx, 2 * idx, z, x2, x3))
