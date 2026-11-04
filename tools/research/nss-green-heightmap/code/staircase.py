# Colour level against height on four greens: every texel's colour (its first principal component) against its collision
# height above GreenAreaCenterY; red lines every 0.1 m, blue the window size. Clean staircases on H10 and H15; on the steep
# H9 and H21 the single number mixes the hue with the steps (see overlay.py).  python staircase.py out.png
import json, sys
import numpy as np
from PIL import Image, ImageDraw
W, H = 900, 260
rows = []
for h in (10, 15, 9, 21):
    p = json.load(open("green-%02d.json" % h))["params"]; y0, sy = p["GreenAreaCenterY"], p["GreenAreaSizeY"]
    S = np.fromfile("samples-%02d.f32" % h, np.float32).reshape(-1, 7).astype(float)
    rgb = S[:, :3]; c = rgb - rgb.mean(0); w, v = np.linalg.eigh(np.cov(c.T)); s = c @ v[:, -1]
    if np.corrcoef(s, S[:, 4])[0, 1] < 0: s = -s
    u = S[:, 4] - y0
    im = Image.new("RGB", (W, H), (255, 255, 255)); D = ImageDraw.Draw(im)
    umax = max(sy, u.max()) * 1.02
    smin, smax = np.percentile(s, 0.2), np.percentile(s, 99.8)
    for k in range(int(umax / 0.1) + 1):
        X = 40 + (k * 0.1) / umax * (W - 50); D.line([(X, 0), (X, H - 20)], fill=(255, 190, 190)); D.text((X + 2, H - 18), "%.1f" % (k * 0.1), fill=(200, 0, 0))
    X = 40 + sy / umax * (W - 50); D.line([(X, 0), (X, H - 20)], fill=(0, 0, 255))
    for ui, si in zip(u[::3], s[::3]):
        X = 40 + ui / umax * (W - 50); Y = (H - 25) - (si - smin) / (smax - smin) * (H - 35)
        D.point((X, Y), fill=(0, 0, 0))
    D.text((4, 4), "H%d: colour level (vertical) vs height above GreenAreaCenterY (m); red = every 0.1 m, blue = SizeY %.3f" % (h, sy), fill=(0, 0, 0))
    rows.append(im)
S2 = Image.new("RGB", (W, H * len(rows)), (255, 255, 255))
for k, im in enumerate(rows): S2.paste(im, (0, k * H))
S2.save(sys.argv[1])
