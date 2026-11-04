# How well do real SR screen pixels read height? Per hole, a ramp (median screen RGB per 1 cm of height from the green's
# middle) from the OTHER holes; every sampled pixel inverted to the nearest ramp colour; the error against the true
# height from the middle: per pixel, and for a 3x3-pixel-area style local mean is left out (raw pixels). Also the error
# after taking out each frame's own median (only differences matter for a putt).
import json, os
import numpy as np
H = {}
for h in range(1, 19):
    f = "sr-samples-%02d.f32" % h
    if not os.path.exists(f) or os.path.getsize(f) == 0: continue
    p = json.load(open("green-%02d.json" % h))["params"]
    S = np.fromfile(f, np.float32).reshape(-1, 5).astype(float)
    H[h] = (S[:, :3], S[:, 3] - (p["GreenAreaCenterY"] + p["GreenAreaSizeY"] / 2), S[:, 4], p["GreenAreaSizeY"])
edges = np.arange(-1.6, 1.6001, 0.01); cen = (edges[:-1] + edges[1:]) / 2
all_e = []
print("hole relief | pixels | height read error, RMS cm | after each frame's median | p90 |error| cm")
for h, (rgb, d, fr, sy) in H.items():
    ro = np.concatenate([v[0] for k, v in H.items() if k != h]); do = np.concatenate([v[1] for k, v in H.items() if k != h])
    b = np.digitize(do, edges) - 1
    R = np.full((len(cen), 3), np.nan)
    for i in range(len(cen)):
        m = b == i
        if m.sum() >= 30: R[i] = np.median(ro[m], axis=0)
    ok = ~np.isnan(R[:, 0]); c, C = cen[ok], R[ok]
    # the ramp only covers the heights the other greens reach; keep the pixels the hole's own height keeps in span
    sel = (d >= c.min()) & (d <= c.max())
    px = rgb[sel]; dd = d[sel]; ff = fr[sel]
    idx = np.empty(len(px), int)
    for s in range(0, len(px), 20000):
        q = px[s:s + 20000, None, :] - C[None, :, :]
        idx[s:s + 20000] = np.argmin((q * q).sum(2), axis=1)
    e = c[idx] - dd
    e2 = e.copy()
    for k in np.unique(ff):
        m = ff == k; e2[m] -= np.median(e[m])
    print("H%02d %.2f m | %d | %.1f | %.1f | %.1f" % (h, sy, len(e), 100 * np.sqrt((e ** 2).mean()), 100 * np.sqrt((e2 ** 2).mean()), 100 * np.percentile(np.abs(e2), 90)))
    all_e.append(e2)
E = np.concatenate(all_e)
print("all pixels: RMS %.1f cm, median |error| %.1f cm, p90 %.1f cm" % (100 * np.sqrt((E ** 2).mean()), 100 * np.median(np.abs(E)), 100 * np.percentile(np.abs(E), 90)))
