# Which height lattice do the Green bake's colour steps follow? Per hole, with the collision height Y on every texel
# (iso-NN.f32) and the bake's colour (green-NN.rgba): for neighbour texel pairs on the green (both covered, both
# GolfGreen), the colour jump |dRGB|; a lattice (step D, offset phi: contour heights y0 + phi + k D) predicts a
# contour between a pair when the two heights fall in different steps. Score = the mean colour jump across predicted
# contours / the mean jump between same-step neighbours: a lattice the bake follows scores high (its predicted
# contours sit on the colour risers), a wrong one near 1. Scanned: D 4..25 cm by 1 mm with the best offset (1 mm
# steps), and fixed checks: D = 0.100 from y0 = GreenAreaCenterY (the window bottom), D = 0.100 from world y = 0,
# and the normalised lattice SizeY / N for the best N.
import json
import numpy as np
res = {}
def score(Ya, Yb, J, y0, D, phi):
    ka = np.floor((Ya - y0 - phi) / D); kb = np.floor((Yb - y0 - phi) / D)
    cross = ka != kb
    if cross.sum() < 20 or (~cross).sum() < 20: return 0.0
    return float(J[cross].mean() / J[~cross].mean())
for h in range(1, 22):
    j = json.load(open("green-%02d.json" % h)); p = j["params"]; W, H = j["w"], j["h"]
    a = np.fromfile("green-%02d.rgba" % h, np.uint8).reshape(H, W, 4).astype(float)
    Y = np.fromfile("iso-%02d.f32" % h, np.float32).reshape(H, W).astype(float)
    on = (a[..., 3] < 8) & ~np.isnan(Y)
    pairs = []
    for (sa, sb) in (((slice(None), slice(1, None)), (slice(None), slice(None, -1))), ((slice(1, None), slice(None)), (slice(None, -1), slice(None)))):
        ok = on[sa] & on[sb]
        J = np.linalg.norm(a[sa][..., :3] - a[sb][..., :3], axis=-1)[ok]
        pairs.append((Y[sa][ok], Y[sb][ok], J))
    Ya = np.concatenate([q[0] for q in pairs]); Yb = np.concatenate([q[1] for q in pairs]); J = np.concatenate([q[2] for q in pairs])
    # subsample for speed
    if len(J) > 120000:
        sel = np.random.default_rng(h).choice(len(J), 120000, replace=False); Ya, Yb, J = Ya[sel], Yb[sel], J[sel]
    y0, sy = p["GreenAreaCenterY"], p["GreenAreaSizeY"]
    best = (0, None, None)
    for D in np.arange(0.04, 0.2505, 0.001):
        for phi in np.arange(0, D, 0.002):
            s = score(Ya, Yb, J, y0, D, phi)
            if s > best[0]: best = (s, D, phi)
    # refine the best offset at 1 mm
    s0, D0, p0 = best
    for phi in np.arange(max(0, p0 - 0.004), p0 + 0.004, 0.0005):
        s = score(Ya, Yb, J, y0, D0, phi)
        if s > best[0]: best = (s, D0, phi)
    s_fixed = score(Ya, Yb, J, y0, 0.1, 0.0)
    s_world = score(Ya, Yb, J, 0.0, 0.1, 0.0)
    bestPhi01 = max(np.arange(0, 0.1, 0.0005), key=lambda ph: score(Ya, Yb, J, y0, 0.1, ph))
    Ns = range(3, 61)
    bn = max(Ns, key=lambda N: score(Ya, Yb, J, y0, sy / N, 0.0))
    s_norm = score(Ya, Yb, J, y0, sy / bn, 0.0)
    res[h] = dict(bestScore=best[0], bestD=float(best[1]), bestPhi=float(best[2]), score_0p1_from_y0=s_fixed, score_0p1_from_world0=s_world,
                  bestPhiAt0p1=float(bestPhi01), score_at_bestPhi=score(Ya, Yb, J, y0, 0.1, bestPhi01), normN=int(bn), normStep=sy / bn, score_norm=s_norm, pairs=int(len(J)))
    print("H%02d best D %.3f m offset %.4f (score %.2f) | 0.100 m from the green's bottom: %.2f (best offset %.4f: %.2f) | 0.100 m from world 0: %.2f | normalised SizeY/%d = %.4f m: %.2f"
          % (h, best[1], best[2], best[0], s_fixed, bestPhi01, res[h]["score_at_bestPhi"], s_world, bn, sy / bn, s_norm))
json.dump(res, open("lattice.json", "w"), indent=1)
