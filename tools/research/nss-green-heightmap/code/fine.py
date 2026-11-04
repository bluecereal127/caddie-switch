# The step D (9.5..11 cm, 0.1 mm) and its offset (0.5 mm) per hole by the riser score of lattice.py; the offset
# reported against the window bottom y0 = GreenAreaCenterY and against world y = 0, as a signed fraction of D
# (-0.5..0.5); and the score of the hole's best lattice beside the median D's.
import json
import numpy as np
def load(h):
    j = json.load(open("green-%02d.json" % h)); p = j["params"]; W, H = j["w"], j["h"]
    a = np.fromfile("green-%02d.rgba" % h, np.uint8).reshape(H, W, 4).astype(float)
    Y = np.fromfile("iso-%02d.f32" % h, np.float32).reshape(H, W).astype(float)
    on = (a[..., 3] < 8) & ~np.isnan(Y)
    P = []
    for (sa, sb) in (((slice(None), slice(1, None)), (slice(None), slice(None, -1))), ((slice(1, None), slice(None)), (slice(None, -1), slice(None)))):
        ok = on[sa] & on[sb]
        P.append((Y[sa][ok], Y[sb][ok], np.linalg.norm(a[sa][..., :3] - a[sb][..., :3], axis=-1)[ok]))
    Ya = np.concatenate([q[0] for q in P]); Yb = np.concatenate([q[1] for q in P]); J = np.concatenate([q[2] for q in P])
    if len(J) > 150000:
        s = np.random.default_rng(h).choice(len(J), 150000, replace=False); Ya, Yb, J = Ya[s], Yb[s], J[s]
    return p, Ya, Yb, J
def score(Ya, Yb, J, base, D):
    ka = np.floor((Ya - base) / D); kb = np.floor((Yb - base) / D); c = ka != kb
    return float(J[c].mean() / J[~c].mean()) if c.sum() > 20 and (~c).sum() > 20 else 0.0
rows = {}
for h in range(1, 22):
    p, Ya, Yb, J = load(h)
    y0 = p["GreenAreaCenterY"]
    best = (0, 0, 0)
    for D in np.arange(0.095, 0.1101, 0.0002):
        for ph in np.arange(0, D, 0.001):
            s = score(Ya, Yb, J, y0 + ph, D)
            if s > best[0]: best = (s, D, ph)
    s, D, ph = best
    for D2 in np.arange(D - 0.0003, D + 0.00031, 0.0001):
        for ph2 in np.arange(ph - 0.002, ph + 0.0021, 0.0005):
            s2 = score(Ya, Yb, J, y0 + ph2, D2)
            if s2 > best[0]: best = (s2, D2, ph2)
    s, D, ph = best
    fy0 = ((ph / D + 0.5) % 1) - 0.5                     # offset of the lattice from the green's bottom, in steps
    fw = (((y0 + ph) / D + 0.5) % 1) - 0.5               # offset from world y = 0, in steps
    rows[h] = dict(D=float(D), score=s, offFromBottom=float(fy0 * D), offFromWorld=float(fw * D), relief=p["GreenAreaSizeY"])
    print("H%02d D %.4f m (score %.2f) | lattice offset from the green's bottom %+.4f m (%+.2f step) | from world 0 %+.4f m (%+.2f step)" % (h, D, s, fy0 * D, fy0, fw * D, fw))
Ds = np.array([r["D"] for r in rows.values()]); ob = np.array([r["offFromBottom"] for r in rows.values()])
print("D median %.4f, p10 %.4f, p90 %.4f; offset from the bottom: median %+.4f m, |.| p90 %.4f" % (np.median(Ds), np.percentile(Ds, 10), np.percentile(Ds, 90), np.median(ob), np.percentile(np.abs(ob), 90)))
json.dump(rows, open("fine.json", "w"), indent=1)
