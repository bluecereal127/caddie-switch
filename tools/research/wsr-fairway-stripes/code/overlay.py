# predicted band edges (map model uv1, frac(s) = 0 / 0.5 crossings) drawn over a minimap screenshot through the fitted registration
# screen = k * mapPx + (ox, oy); usage: overlay.py shot.png cls.bin SC k ox oy x0,y0,x1,y1 out.jpg [scale]
import sys, numpy as np
from PIL import Image
shot, clsf, SC, k, ox, oy, crop, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), *map(float, sys.argv[4:7]), sys.argv[7], sys.argv[8]
up = int(sys.argv[9]) if len(sys.argv) > 9 else 2
x0, y0, x1, y1 = map(int, crop.split(","))
im = Image.open(shot).convert("RGB").crop((x0, y0, x1, y1)).resize(((x1 - x0) * up, (y1 - y0) * up), Image.NEAREST)
a = np.asarray(im).copy()
cls = np.fromfile(clsf, np.uint8).reshape(304 * SC, 250 * SC)
H, W = a.shape[:2]
ys, xs = np.mgrid[0:H, 0:W]
sx = x0 + (xs + 0.5) / up; sy = y0 + (ys + 0.5) / up
mx = ((sx - ox) / k * SC).astype(int); my = ((sy - oy) / k * SC).astype(int)
ok = (mx >= 0) & (mx < 250 * SC) & (my >= 0) & (my < 304 * SC)
c = np.zeros((H, W), np.uint8); c[ok] = cls[my[ok], mx[ok]]
edge = np.zeros((H, W), bool)
edge[:, 1:] |= (c[:, 1:] != c[:, :-1]) & (c[:, 1:] > 0) & (c[:, :-1] > 0)
edge[1:, :] |= (c[1:, :] != c[:-1, :]) & (c[1:, :] > 0) & (c[:-1, :] > 0)
a[edge] = (255, 40, 200)
Image.fromarray(a).save(out, quality=90)
