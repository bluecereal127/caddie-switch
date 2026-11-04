# Rebuild a green from real SR screen colours alone, as on a hole with no mesh. sr-nodecol-NN.f32 (srnodes.mjs) holds the
# screen colour at each height-grid node; the colour -> height ramp (median screen RGB per 1 cm of height from the green's
# middle) comes from the OTHER holes' frames (sr-samples-*.f32, srband.mjs); the surface is relaxed inside the steps as in
# recon.py. Writes est-sr-NN.f32 (node heights in m, NaN unseen) and prints the error against the collision.
import json, os, sys
import numpy as np
from scipy import ndimage as ndi
D = 3.066 / 30
SLACK = float(sys.argv[1]) if len(sys.argv) > 1 else 0.03
ITERS = int(sys.argv[2]) if len(sys.argv) > 2 else 400
BLUR = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
H = {}
for h in range(1, 19):
    f = "sr-samples-%02d.f32" % h
    if not os.path.exists(f) or os.path.getsize(f) == 0: continue
    p = json.load(open("green-%02d.json" % h))["params"]
    S = np.fromfile(f, np.float32).reshape(-1, 5).astype(float)
    H[h] = (S[:, :3], S[:, 3] - (p["GreenAreaCenterY"] + p["GreenAreaSizeY"] / 2))
edges = np.arange(-1.6, 1.6001, 0.01); cen = (edges[:-1] + edges[1:]) / 2
rows = []
for h in sorted(H):
    ro = np.concatenate([v[0] for k, v in H.items() if k != h]); do = np.concatenate([v[1] for k, v in H.items() if k != h])
    b = np.digitize(do, edges) - 1
    R = np.full((len(cen), 3), np.nan)
    for i in range(len(cen)):
        m = b == i
        if m.sum() >= 30: R[i] = np.median(ro[m], axis=0)
    ok = ~np.isnan(R[:, 0]); c = cen[ok]; C = ndi.uniform_filter1d(R[ok], 5, axis=0, mode="nearest")
    nj = json.load(open("nodes-%02d.json" % h)); w, hh = nj["w"], nj["h"]
    N = np.fromfile("nodes-%02d.f32" % h, np.float32).reshape(hh, w, 4).astype(float)
    ytrue, mask = N[..., 2], N[..., 3] > 0
    col = np.fromfile("sr-nodecol-%02d.f32" % h, np.float32).reshape(hh, w, 3).astype(float)
    have = ~np.isnan(col[..., 0])
    est = np.full((hh, w), np.nan)
    px = col[have]
    idx = np.empty(len(px), int)
    for s in range(0, len(px), 4000):
        q = px[s:s + 4000, None, :] - C[None, :, :]
        idx[s:s + 4000] = np.argmin((q * q).sum(2), axis=1)
    est[have] = c[idx]
    # a despeckle first: isolated bad reads (a stray overlay) are median-filtered over the seen nodes
    med = ndi.generic_filter(np.where(have, est, np.nan), np.nanmedian, size=5, mode="nearest")
    est = np.where(have & (np.abs(est - med) > 1.5 * D), med, est)
    lo = est - D / 2 - SLACK; hi = est + D / 2 + SLACK
    zc = np.where(have, est, 0.0); wgt = have.astype(float)
    def blur(v):
        num = ndi.gaussian_filter(v * wgt, BLUR, mode="constant"); den = ndi.gaussian_filter(wgt, BLUR, mode="constant")
        return np.where(den > 1e-6, num / np.maximum(den, 1e-6), 0.0)
    for _ in range(ITERS):
        zc = blur(zc)
        zc = np.where(have, np.clip(zc, lo, hi), 0.0)
    zc = blur(zc)
    np.where(have, zc, np.nan).astype(np.float32).tofile("est-sr-%02d.f32" % h)
    m = mask & have
    e = (zc - ytrue)[m]; e = e - e.mean()
    step = nj["stepYd"] * 0.9144
    gy_t, gx_t = np.gradient(ytrue, step); gy_e, gx_e = np.gradient(zc, step)
    inner = ndi.binary_erosion(m, iterations=2)
    dv = np.hypot(gx_e - gx_t, gy_e - gy_t)[inner]; sl = np.hypot(gx_t, gy_t)[inner]
    rows.append((h, float(np.sqrt((e ** 2).mean())), float(np.sqrt((dv ** 2).mean())), float(np.median(dv)), float(np.median(sl)), m.sum() / max(mask.sum(), 1)))
    print("H%02d coverage %.0f %%: height error RMS %.1f cm | slope error RMS %.2f %% (median %.2f) on a median slope of %.1f %%" % (h, 100 * rows[-1][5], rows[-1][1] * 100, rows[-1][2] * 100, rows[-1][3] * 100, rows[-1][4] * 100))
R = np.array(rows)
print("%d holes: height RMS median %.1f cm (max %.1f); slope error RMS median %.2f %%; node slope error median %.2f %% on a median slope of %.1f %%" % (len(R), np.median(R[:, 1]) * 100, R[:, 1].max() * 100, np.median(R[:, 2]) * 100, np.median(R[:, 3]) * 100, np.median(R[:, 4]) * 100))
