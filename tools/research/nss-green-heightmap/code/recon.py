# Rebuild each NSS green's height field from its Green bake alone, as if the hole's mesh were unknown.
# Leave-one-out: the colour -> height ramp (median raw RGB per 1 cm of height from the green's middle) comes from the
# OTHER 20 greens. At each height-grid node (0.5 yd) the median colour of the covered texels within 0.3 m reads as the
# ramp's height; the surface is then relaxed inside the treads: blur, and hold each node within HALF of its reading's
# tread plus SLACK (a projection-onto-constraints loop), since a flat tread hides any slope inside its 10.22 cm.
# Writes est-NN.f32 (node heights in m, NaN off the bake) and prints the error against the collision: the RMS height
# error after removing the mean, the slope error (RMS of the gradient's vector difference, %) beside the RMS slope.
import json, sys
import numpy as np
from scipy import ndimage as ndi
D = 3.066 / 30
SLACK = float(sys.argv[1]) if len(sys.argv) > 1 else 0.02
ITERS = int(sys.argv[2]) if len(sys.argv) > 2 else 400
BLUR = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0   # nodes
H = {}
for h in range(1, 22):
    p = json.load(open("green-%02d.json" % h))["params"]
    S = np.fromfile("samples-%02d.f32" % h, np.float32).reshape(-1, 7).astype(float)
    H[h] = (p, S[:, :3], S[:, 4] - (p["GreenAreaCenterY"] + p["GreenAreaSizeY"] / 2))
edges = np.arange(-1.6, 1.6001, 0.01); centres = (edges[:-1] + edges[1:]) / 2
def ramp_without(h):
    rgb = np.concatenate([v[1] for k, v in H.items() if k != h]); d = np.concatenate([v[2] for k, v in H.items() if k != h])
    b = np.digitize(d, edges) - 1
    R = np.full((len(centres), 3), np.nan)
    for i in range(len(centres)):
        m = b == i
        if m.sum() >= 40: R[i] = np.median(rgb[m], axis=0)
    ok = ~np.isnan(R[:, 0])
    # smooth along the curve (the pooled treads of different phases) and keep the covered span
    c = centres[ok]; C = R[ok]
    C = ndi.uniform_filter1d(C, 5, axis=0, mode="nearest")
    return c, C
rows = []
for h in range(1, 22):
    j = json.load(open("green-%02d.json" % h)); p = j["params"]; W, Hh = j["w"], j["h"]
    a = np.fromfile("green-%02d.rgba" % h, np.uint8).reshape(Hh, W, 4)
    nj = json.load(open("nodes-%02d.json" % h)); w, hh = nj["w"], nj["h"]
    N = np.fromfile("nodes-%02d.f32" % h, np.float32).reshape(hh, w, 4).astype(float)
    x, z, ytrue, mask = N[..., 0], N[..., 1], N[..., 2], N[..., 3] > 0
    c, C = ramp_without(h)
    x0 = p["GreenAreaCenterX"] - p["GreenAreaSizeX"] / 2; z0 = p["GreenAreaCenterZ"] - p["GreenAreaSizeZ"] / 2
    ppm = W / p["GreenAreaSizeX"]; r = max(1, int(round(0.3 * ppm)))
    cov = a[..., 3] < 8
    est = np.full((hh, w), np.nan)
    for jj in range(hh):
        for ii in range(w):
            tu = int((x[jj, ii] - x0) * ppm); tv = int((z[jj, ii] - z0) * ppm)
            if tu < 0 or tv < 0 or tu >= W or tv >= Hh: continue
            sl = (slice(max(0, tv - r), tv + r + 1), slice(max(0, tu - r), tu + r + 1))
            m = cov[sl]
            if m.sum() < 3: continue
            col = np.median(a[sl][..., :3][m].astype(float), axis=0)
            est[jj, ii] = c[np.argmin(((C - col) ** 2 * np.array([1.0, 1.0, 0.25])).sum(1))]
    have = ~np.isnan(est)
    lo = est - D / 2 - SLACK; hi = est + D / 2 + SLACK
    zc = np.where(have, est, 0.0); wgt = have.astype(float)
    def blur(v):
        num = ndi.gaussian_filter(v * wgt, BLUR, mode="constant"); den = ndi.gaussian_filter(wgt, BLUR, mode="constant")
        return np.where(den > 1e-6, num / np.maximum(den, 1e-6), 0.0)
    for _ in range(ITERS):
        zc = blur(zc)
        zc = np.where(have, np.clip(zc, lo, hi), 0.0)
    zc = blur(zc)
    out = np.where(have, zc, np.nan).astype(np.float32); out.tofile("est-%02d.f32" % h)
    # error against the collision over the mask
    m = mask & have
    e = (zc - ytrue)[m]; e = e - e.mean()
    step = nj["stepYd"] * 0.9144
    gy_t, gx_t = np.gradient(ytrue, step); gy_e, gx_e = np.gradient(zc, step)
    inner = ndi.binary_erosion(m, iterations=2)
    dv = np.hypot(gx_e - gx_t, gy_e - gy_t)[inner]; sl = np.hypot(gx_t, gy_t)[inner]
    rows.append((h, float(np.sqrt((e ** 2).mean())), float(np.sqrt((dv ** 2).mean())), float(np.sqrt((sl ** 2).mean())), float(np.median(dv)), float(np.median(sl))))
    print("H%02d nodes %d: height error RMS %.1f cm | slope error RMS %.2f %% (median %.2f) on an RMS slope of %.1f %% (median %.1f)" % (h, m.sum(), rows[-1][1] * 100, rows[-1][2] * 100, rows[-1][4] * 100, rows[-1][3] * 100, rows[-1][5] * 100))
R = np.array(rows)
print("all greens: height RMS median %.1f cm (max %.1f); slope error RMS median %.2f %% (max %.2f); median node slope error %.2f %% on a median slope of %.1f %%" % (np.median(R[:, 1]) * 100, R[:, 1].max() * 100, np.median(R[:, 2]) * 100, R[:, 2].max() * 100, np.median(R[:, 4]) * 100, np.median(R[:, 5]) * 100))
