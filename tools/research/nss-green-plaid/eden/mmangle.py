# The minimap plaid's own orientation and period, fitted free (no RAM line): a 2-D grid over the angle and the period
# of the model L = a + b cos(k u) + c sin(k u) + d cos(k v) + e sin(k v) on the panel's green pixels.
#   python -P mmangle.py <frame> <ram line deg> [--box x0,y0,x1,y1]
import sys, math, json
import numpy as np
from PIL import Image
f, line = sys.argv[1], float(sys.argv[2])
argv = sys.argv
def opt(n, d): return argv[argv.index(n) + 1] if n in argv else d
x0, y0, x1, y1 = map(int, opt("--box", "1012,236,1267,538").split(","))
pmin, pmax = map(float, opt("--per", "47,52.5").split(","))
im = np.asarray(Image.open(f).convert("RGB")).astype(np.float64)[y0:y1, x0:x1]
r, g, b = im[..., 0], im[..., 1], im[..., 2]
cy = (r < 120) & (g > 170) & (b > 200); dark = im.max(2) < 45; yel = (r > 200) & (g > 140) & (g < 220) & (b < 90)
m = (g > 120) & (g > r + 25) & (g > b + 40) & ~cy & ~dark & ~yel
from scipy import ndimage
m = ndimage.binary_erosion(m, iterations=2)
m[:8, :] = m[-8:, :] = False; m[:, :8] = m[:, -8:] = False
YY, XX = np.mgrid[0:im.shape[0], 0:im.shape[1]]
X, Y, L = XX[m].astype(float), YY[m].astype(float), (im @ [0.299, 0.587, 0.114])[m]
def r2(th, per):
    t = math.radians(th); eu = (math.sin(t), -math.cos(t)); ev = (math.cos(t), math.sin(t))
    u = X * eu[0] + Y * eu[1]; v = X * ev[0] + Y * ev[1]; k = 2 * math.pi / per
    A = np.c_[np.ones_like(u), np.cos(k * u), np.sin(k * u), np.cos(k * v), np.sin(k * v)]
    c, *_ = np.linalg.lstsq(A, L, rcond=None); p = A @ c
    return 1 - ((L - p) ** 2).sum() / ((L - L.mean()) ** 2).sum()
best = (-1, None, None)
for th in np.arange(line - 6, line + 6.001, 0.25):
    for per in np.arange(pmin, pmax, 0.1):
        q = r2(th, per)
        if q > best[0]: best = (q, th, per)
q, th, per = best
for th2 in np.arange(th - 0.3, th + 0.301, 0.02):       # refine
    for per2 in np.arange(per - 0.15, per + 0.151, 0.01):
        q2 = r2(th2, per2)
        if q2 > best[0]: best = (q2, th2, per2)
q, th, per = best
# a square plaid repeats every 90 deg: report the angle nearest the RAM line
print(json.dumps({"frame": f, "ramLine": line, "fitAngle": round(th, 2), "offDeg": round(((th - line + 45) % 90) - 45, 2), "periodPx": round(per, 2), "r2": round(q, 4), "n": int(m.sum())}))
