# The two contour ramps side by side (ramps.json from ramp.mjs, run in the same folder): each texel row drawn 3 px tall,
# t = 0 (the top of a green's window, lightest) at the top, with the band edges' t and each band's index.
#   python swatch.py out.jpg
import sys, json
from PIL import Image, ImageDraw
R = json.load(open("ramps.json"))
cols = []
for r in R.values():
    rows = [None] * 256
    for b in r["bands"]:
        for y in range(b["y0"], b["y1"] + 1): rows[y] = tuple(b["c"][:3])
    cols.append((r["texture"], rows, r["bands"]))
W, H = 300, 256 * 3 + 40
S = Image.new("RGB", (W * len(cols), H), (24, 24, 28)); D = ImageDraw.Draw(S)
for k, (name, rows, bands) in enumerate(cols):
    x0 = k * W
    D.text((x0 + 8, 6), name + " (t = 0 at top)", fill=(255, 255, 0))
    for y, c in enumerate(rows): D.rectangle([x0 + 8, 30 + 3 * y, x0 + 120, 30 + 3 * y + 2], fill=c)
    # merge DXT1 edge rows into the band they belong to for the labels: label each run of 4+ rows
    n = 0
    for b in bands:
        if b["rows"] < 4: continue
        n += 1
        D.text((x0 + 128, 30 + 3 * b["y0"] + 3 * b["rows"] // 2 - 6), f"band {n}: t {b['v'][0]:.3f}-{b['v'][1]:.3f}  luma {b['luma']:.0f}", fill=(220, 220, 220))
S.save(sys.argv[1], quality=90)
