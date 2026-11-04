# The collision's contour lines over the bake: per hole the Green texture (contrast-stretched per channel for the eye only)
# with red lines every D metres counted up from GreenAreaCenterY, from the collision heights iso-NN.f32.
#   python overlay.py out.png [D] [holes, default 10,9,21,7]
import json, sys
import numpy as np
from PIL import Image, ImageDraw
D = float(sys.argv[2]) if len(sys.argv) > 2 else 3.066 / 30
holes = [int(v) for v in sys.argv[3].split(",")] if len(sys.argv) > 3 else [10, 9, 21, 7]
tiles = []
for h in holes:
    j = json.load(open("green-%02d.json" % h)); p = j["params"]; W, H = j["w"], j["h"]
    a = np.fromfile("green-%02d.rgba" % h, np.uint8).reshape(H, W, 4)
    Y = np.fromfile("iso-%02d.f32" % h, np.float32).reshape(H, W)
    on = a[..., 3] < 8
    rgb = a[..., :3].astype(float)
    lo = np.percentile(rgb[on], 1, axis=0); hi = np.percentile(rgb[on], 99, axis=0)
    img = (np.clip((rgb - lo) / (hi - lo + 1e-9), 0, 1) * 255).astype(np.uint8); img[~on] = 0
    k = np.floor((Y - p["GreenAreaCenterY"]) / D)
    edge = np.zeros((H, W), bool)
    edge[:, 1:] |= (k[:, 1:] != k[:, :-1]) & ~np.isnan(k[:, 1:]) & ~np.isnan(k[:, :-1])
    edge[1:, :] |= (k[1:, :] != k[:-1, :]) & ~np.isnan(k[1:, :]) & ~np.isnan(k[:-1, :])
    img[edge & on] = (255, 0, 0)
    bb = np.argwhere(on); (r0, c0), (r1, c1) = bb.min(0), bb.max(0)
    tiles.append((h, Image.fromarray(img).crop((max(0, c0 - 4), max(0, r0 - 4), min(W, c1 + 4), min(H, r1 + 4)))))
size = 420
S = Image.new("RGB", (size * 2, size * ((len(tiles) + 1) // 2)), (0, 0, 0))
for n, (h, im) in enumerate(tiles):
    im.thumbnail((size, size)); S.paste(im, ((n % 2) * size, (n // 2) * size)); ImageDraw.Draw(S).text(((n % 2) * size + 6, (n // 2) * size + 4), "H%d" % h, fill=(255, 255, 0))
S.save(sys.argv[1])
