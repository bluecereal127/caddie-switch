# The 3D plaid along the ball->cup line at an address (the camera behind the ball, aimed at the cup): the band
# boundaries on the screen column through the ball, fitted with y = yh + K / (s + D) (flat ground) for stripes of width
# w with the cup at a stripe centre (boundaries at s = d - (k + 1/2) w from the ball); the width scanned.
#   python -P persp3d.py <frame> <dist m>
import sys, math, json
import numpy as np
from PIL import Image
from scipy.ndimage import uniform_filter1d
f, d = sys.argv[1], float(sys.argv[2])
im = np.asarray(Image.open(f).convert("RGB")).astype(float)
L = im @ [0.299, 0.587, 0.114]
sub = L[300:700, 560:720]
ys, xs = np.nonzero(sub > 225); by = ys.max(); m = ys > by - 25; bx = int(round(xs[m].mean() + 560)); bcy = ys[m].mean() + 300
dys, dxs = np.nonzero(sub < 40); cy = dys.mean() + 300
col = L[:, bx - 12:bx + 13]
prof = np.nanmedian(np.where(col > 190, np.nan, col), axis=1)
rows = np.arange(int(cy) - 70, int(bcy) - 12)
p = prof[rows].copy()
ok = ~np.isnan(p); p = np.interp(rows, rows[ok], p[ok])
# exclude the cup's own dark pixels +- 8 rows (the hole) by interpolation
cupz = np.abs(rows - cy) <= 8; p[cupz] = np.interp(rows[cupz], rows[~cupz], p[~cupz])
ps = uniform_filter1d(p, 3)
mid = (np.percentile(ps, 85) + np.percentile(ps, 15)) / 2
cross = [rows[i] + (mid - ps[i]) / (ps[i + 1] - ps[i]) for i in range(len(ps) - 1) if (ps[i] - mid) * (ps[i + 1] - mid) < 0]
def fit(w):
    # assign each crossing (top = far) to a boundary s = d - (k + 1/2) w, k = -2.. in screen order (far to near)
    best = None
    for k0 in range(-3, 2):
        s = np.array([d - (k0 + j + 0.5) * w for j in range(len(cross))])
        if (s <= 0.05).any(): continue
        y = np.array(cross)
        for D in np.arange(1.0, 15.0, 0.02):
            A = np.c_[np.ones_like(s), 1 / (s + D)]
            c, *_ = np.linalg.lstsq(A, y, rcond=None); r = y - A @ c
            rms = math.sqrt((r ** 2).mean())
            if best is None or rms < best[0]: best = (rms, k0, D, c, r)
    return best
out = {"frame": f, "ball_px": [bx, round(bcy, 1)], "cup_row": round(cy, 1), "crossings": [round(c, 1) for c in cross]}
res = {}
for w in [0.85, 0.9144, 0.95, 1.0, 1.05, 1.1, 1.2]:
    b = fit(w); res[w] = round(b[0], 2)
    if w in (0.9144, 1.0): out["w%.4f" % w] = {"rms": round(b[0], 2), "k0": b[1], "D": round(b[2], 2), "resid": [round(x, 1) for x in b[4]]}
out["rms_by_width"] = res
# where the fitted 1 m model puts the ball (s = 0) and the cup (s = d)
print(json.dumps(out))
