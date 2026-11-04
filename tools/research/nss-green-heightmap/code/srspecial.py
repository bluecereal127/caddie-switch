# Do the Special greens' colours sit on the shared ramp, and do their heights centre on zero? Ramp: SR's screen colours
# against metres from the green's middle, pooled over the 16 known holes. Per frame (unclipped blobs only): each pixel's
# distance to the nearest ramp colour; the read heights' 2nd and 98th percentiles. Known holes run the same way as a check.
import json, os
import numpy as np
H = {}
for h in range(1, 19):
    f = "sr-samples-%02d.f32" % h
    if not os.path.exists(f) or os.path.getsize(f) == 0: continue
    p = json.load(open("green-%02d.json" % h))["params"]
    S = np.fromfile(f, np.float32).reshape(-1, 5).astype(float)
    H[h] = (S[:, :3], S[:, 3] - (p["GreenAreaCenterY"] + p["GreenAreaSizeY"] / 2), S[:, 4], p["GreenAreaSizeY"])
rgb = np.concatenate([v[0] for v in H.values()]); d = np.concatenate([v[1] for v in H.values()])
edges = np.arange(-1.6, 1.6001, 0.01); cen = (edges[:-1] + edges[1:]) / 2
b = np.digitize(d, edges) - 1
R = np.full((len(cen), 3), np.nan)
for i in range(len(cen)):
    m = b == i
    if m.sum() >= 30: R[i] = np.median(rgb[m], axis=0)
ok = ~np.isnan(R[:, 0]); c, C = cen[ok], R[ok]
print("ramp spans %.2f .. %.2f m" % (c.min(), c.max()))
print("screen RGB every 0.5 m from the middle:", "  ".join("%+.1f: %d,%d,%d" % (x, *np.interp(x, c, C[:, 0]).round()[None], np.interp(x, c, C[:, 1]).round(), np.interp(x, c, C[:, 2]).round()) for x in (-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5) if c.min() <= x <= c.max()))
def read(px):
    px = np.asarray(px, float).reshape(-1, 3)
    idx = np.empty(len(px), int); dist = np.empty(len(px))
    for s in range(0, len(px), 8000):
        q = ((px[s:s + 8000, None, :] - C[None, :, :]) ** 2).sum(2)
        idx[s:s + 8000] = q.argmin(1); dist[s:s + 8000] = np.sqrt(q.min(1))
    return c[idx], dist
print("known holes (check), per hole: read p2 / p98, centre, read relief vs true window")
for h, (cr, dd, fr, sy) in H.items():
    e, dist = read(cr[::4])
    lo, hi = np.percentile(e, [2, 98])
    print("  H%02d read %+.2f .. %+.2f m, centre %+.2f, relief %.2f (window %.2f), colour distance median %.1f" % (h, lo, hi, (lo + hi) / 2, hi - lo, sy, np.median(dist)))
S = json.load(open("sr-special.json"))
print("Special greens: per hole over its unclipped frames")
for h, a in S.items():
    rows = []
    for r in a:
        if any(r["clipped"].values()): continue
        e, dist = read(r["px"])
        lo, hi = np.percentile(e, [2, 98])
        rows.append((lo, hi, (lo + hi) / 2, hi - lo, np.median(dist), r["n"]))
    if not rows: print("  hole %s: every frame clipped" % h); continue
    A = np.array(rows)
    print("  hole %s: %d frames, read %+.2f .. %+.2f m, centre %+.2f (frames %+.2f .. %+.2f), relief %.2f m, colour distance median %.1f" % (h, len(A), np.median(A[:, 0]), np.median(A[:, 1]), np.median(A[:, 2]), A[:, 2].min(), A[:, 2].max(), np.median(A[:, 3]), np.median(A[:, 4])))
