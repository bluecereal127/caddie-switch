# register a screenshot's minimap band mask to the predicted map-frame band raster: screen = k * mapPx + (ox, oy) (north-up panel)
# score = share of the mask's bright / dim pixels whose predicted class agrees with hypothesis H: bright = frac(s) < 0.5 (rot 180) or >= 0.5 (rot 0)
import sys, numpy as np
from PIL import Image
mask_f, cls_f, SC, k0, ox0, oy0 = sys.argv[1], sys.argv[2], int(sys.argv[3]), *map(float, sys.argv[4:7])
crop = tuple(map(int, sys.argv[7].split(","))) if len(sys.argv) > 7 else None
m = np.asarray(Image.open(mask_f).convert("RGB")).astype(int)
br = (m == (170, 230, 110)).all(2); dm = (m == (40, 110, 30)).all(2)
if crop:
    x0, y0, x1, y1 = crop; keep = np.zeros_like(br); keep[y0:y1, x0:x1] = True; br &= keep; dm &= keep
cls = np.fromfile(cls_f, np.uint8).reshape(304 * SC, 250 * SC)
yb, xb = np.nonzero(br); yd, xd = np.nonzero(dm)
def score(k, ox, oy):
    def look(xs, ys):
        mx = ((xs + 0.5 - ox) / k * SC).astype(int); my = ((ys + 0.5 - oy) / k * SC).astype(int)
        ok = (mx >= 0) & (mx < 250 * SC) & (my >= 0) & (my < 304 * SC)
        c = np.zeros(len(xs), np.uint8); c[ok] = cls[my[ok], mx[ok]]; return c
    cb, cd = look(xb, yb), look(xd, yd)
    n = (cb > 0).sum() + (cd > 0).sum()
    rot180 = ((cb == 2).sum() + (cd == 1).sum()) / max(n, 1)   # bright on frac < 0.5
    rot0 = ((cb == 1).sum() + (cd == 2).sum()) / max(n, 1)
    cover = n / (len(xb) + len(xd))
    return rot180, rot0, cover
best = None
for k in np.arange(k0 * 0.9, k0 * 1.1, k0 * 0.005):
    for ox in np.arange(ox0 - 60, ox0 + 60, 3):
        for oy in np.arange(oy0 - 60, oy0 + 60, 3):
            r180, r0, cov = score(k, ox, oy)
            q = max(r180, r0) * cov
            if best is None or q > best[0]: best = (q, k, ox, oy, r180, r0, cov)
q, k, ox, oy, *_ = best
for k2 in np.arange(k - 0.03, k + 0.03, 0.005):
    for ox2 in np.arange(ox - 3, ox + 3, 0.5):
        for oy2 in np.arange(oy - 3, oy + 3, 0.5):
            r180, r0, cov = score(k2, ox2, oy2); q2 = max(r180, r0) * cov
            if q2 > best[0]: best = (q2, k2, ox2, oy2, r180, r0, cov)
q, k, ox, oy, r180, r0, cov = best
print(f"k {k:.3f} screen px per map px, offset ({ox:.1f}, {oy:.1f}); agreement rot180 {r180:.3f}, rot0 {r0:.3f}; mask px on the predicted fairway {cov:.3f}; n bright {len(xb)} dim {len(xd)}")
