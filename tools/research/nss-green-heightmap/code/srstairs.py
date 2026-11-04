# SR's on-screen colour against true height on three zoomed greens: the screen's R - B (rises steadily with height) in 1 cm
# bins, with red lines every 3.066 / 30 m from GreenAreaCenterY.  python srstairs.py out.png
import json, sys
import numpy as np
from PIL import Image, ImageDraw
D = 3.066 / 30
W, H = 900, 240
rows = []
for h in (12, 3, 5):
    p = json.load(open("green-%02d.json" % h))["params"]; y0, sy = p["GreenAreaCenterY"], p["GreenAreaSizeY"]
    S = np.fromfile("sr-samples-%02d.f32" % h, np.float32).reshape(-1, 5).astype(float)
    u = S[:, 3] - y0; s = S[:, 0] - S[:, 2]
    im = Image.new("RGB", (W, H), (255, 255, 255)); Dr = ImageDraw.Draw(im)
    umax = max(sy, u.max()) * 1.02; lo, hi = np.percentile(s, 0.5), np.percentile(s, 99.5)
    for k in range(int(umax / D) + 1):
        X = 40 + (k * D) / umax * (W - 50); Dr.line([(X, 0), (X, H - 20)], fill=(255, 190, 190))
        if k % 2 == 0: Dr.text((X + 2, H - 18), "%.1f" % (k * D), fill=(200, 0, 0))
    b = np.floor(u / 0.01).astype(int)
    for k in np.unique(b):
        m = b == k
        if m.sum() < 8: continue
        q1, q2, q3 = np.percentile(s[m], [25, 50, 75])
        X = 40 + (k + 0.5) * 0.01 / umax * (W - 50)
        y = lambda v: (H - 25) - (v - lo) / (hi - lo) * (H - 35)
        Dr.line([(X, y(q1)), (X, y(q3))], fill=(190, 190, 190)); Dr.ellipse([X - 1.5, y(q2) - 1.5, X + 1.5, y(q2) + 1.5], fill=(0, 0, 0))
    Dr.text((4, 4), "SR frames, H%d: screen R - B (median, quartiles) against true height above GreenAreaCenterY (m); red every 0.102 m" % h, fill=(0, 0, 0))
    rows.append(im)
S2 = Image.new("RGB", (W, H * len(rows)), (255, 255, 255))
for k, im in enumerate(rows): S2.paste(im, (0, k * H))
S2.save(sys.argv[1])
