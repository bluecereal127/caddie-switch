# SR's on-screen Terrain colours (sr-samples-NN.f32: r, g, b, y, frame) against height, three coordinates: which one do
# the holes agree on? Per hole the median RGB per bin; across holes the spread per bin (std of the per-hole medians,
# averaged over bins that 4+ holes share). Then each hole's top and bottom colour, and the free stretch fit against the
# ramp pooled from the other holes: 1 on a fixed metric scale, 3.066 / SizeY if normalised to the green's own window.
import json, os
import numpy as np
H = {}
for h in range(1, 19):
    f = "sr-samples-%02d.f32" % h
    if not os.path.exists(f) or os.path.getsize(f) == 0: continue
    p = json.load(open("green-%02d.json" % h))["params"]
    S = np.fromfile(f, np.float32).reshape(-1, 5).astype(float)
    H[h] = (p, S)
print("holes", sorted(H))
def spread(coord, binw, lo, hi):
    edges = np.arange(lo, hi + binw, binw); per = {}
    for h, (p, S) in H.items():
        c = coord(p, S); b = np.digitize(c, edges)
        for k in np.unique(b):
            m = b == k
            if m.sum() >= 30: per.setdefault(k, []).append(np.median(S[m, :3], axis=0))
    sds = [np.std(np.array(v), axis=0) for k, v in per.items() if len(v) >= 4]
    return np.mean(sds, axis=0), len(sds)
mid = lambda p: p["GreenAreaCenterY"] + p["GreenAreaSizeY"] / 2
C = {
  "metres from the window middle": (lambda p, S: S[:, 3] - mid(p), 0.05, -1.6, 1.6),
  "metres from the bottom": (lambda p, S: S[:, 3] - p["GreenAreaCenterY"], 0.05, 0, 3.2),
  "fraction of the green's own window": (lambda p, S: (S[:, 3] - p["GreenAreaCenterY"]) / p["GreenAreaSizeY"], 0.05 / 1.5, 0, 1),
}
for name, (f, w, lo, hi) in C.items():
    sd, n = spread(f, w, lo, hi)
    print("%-38s across-hole spread R %.1f G %.1f B %.1f (screen levels; %d shared bins)" % (name, sd[0], sd[1], sd[2], n))
print("per hole: relief | median RGB of the bottom 10 %, the middle, the top 10 % of the window")
for h, (p, S) in H.items():
    u = (S[:, 3] - p["GreenAreaCenterY"]) / p["GreenAreaSizeY"]
    q = lambda m: tuple(int(v) for v in np.median(S[m, :3], axis=0)) if m.sum() > 30 else None
    print("H%02d %.2f m | %s | %s | %s" % (h, p["GreenAreaSizeY"], q(u < 0.1), q((u > 0.45) & (u < 0.55)), q(u > 0.9)))
edges = np.arange(-1.6, 1.6001, 0.02); cen = (edges[:-1] + edges[1:]) / 2
def curve(rgb, d, minn):
    b = np.digitize(d, edges) - 1; R = np.full((len(cen), 3), np.nan)
    for i in range(len(cen)):
        m = b == i
        if m.sum() >= minn: R[i] = np.median(rgb[m], axis=0)
    return R
rows = []
for h, (p, S) in H.items():
    rgb = np.concatenate([v[1][:, :3] for k, v in H.items() if k != h]); d = np.concatenate([v[1][:, 3] - mid(v[0]) for k, v in H.items() if k != h])
    Rp = curve(rgb, d, 30); ok = ~np.isnan(Rp[:, 0]); c, Cc = cen[ok], Rp[ok]
    Rh = curve(S[:, :3], S[:, 3] - mid(p), 20); oh = ~np.isnan(Rh[:, 0]); ch, Ch = cen[oh], Rh[oh]
    ramp = lambda x: np.stack([np.interp(x, c, Cc[:, k]) for k in range(3)], -1)
    best = (1e18, 1, 0)
    for s in np.arange(0.3, 7.01, 0.02):
        for t in np.arange(-0.3, 0.3001, 0.02):
            x = s * ch + t; ins = (x >= c.min()) & (x <= c.max())
            if ins.mean() < 0.9: continue
            e = ((ramp(x[ins]) - Ch[ins]) ** 2).sum(1).mean()
            if e < best[0]: best = (e, s, t)
    rows.append((h, p["GreenAreaSizeY"], best[1], best[2], best[0] ** 0.5))
    print("H%02d relief %.2f m: best stretch %.2f, shift %+.2f m, colour rms %.1f (normalised would be %.2f)" % (h, p["GreenAreaSizeY"], best[1], best[2], best[0] ** 0.5, 3.066 / p["GreenAreaSizeY"]))
R = np.array(rows); print("stretch median %.2f (min %.2f, max %.2f)" % (np.median(R[:, 2]), R[:, 2].min(), R[:, 2].max()))
