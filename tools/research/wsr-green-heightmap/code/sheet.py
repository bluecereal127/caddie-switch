# tile the per-green renders into one labelled sheet (7 x 3), each cell padded to the largest
import sys, json, numpy as np
from PIL import Image, ImageDraw
meta = json.load(open("out/greens-meta.json"))
ims = []
for h in sorted(meta, key=int):
    j = json.load(open(f"out/g{int(h):02d}.json")); a = np.fromfile(f"out/g{int(h):02d}.rgba", np.uint8).reshape(j["h"], j["w"], 4)
    ims.append((h, Image.fromarray(a, "RGBA").convert("RGB")))
cw = max(i.size[0] for _, i in ims); ch = max(i.size[1] for _, i in ims) + 34
cols = 7; rows = (len(ims) + cols - 1) // cols
S = Image.new("RGB", (cols * cw, rows * ch), (20, 20, 24)); D = ImageDraw.Draw(S)
for k, (h, im) in enumerate(ims):
    x = (k % cols) * cw; y = (k // cols) * ch
    S.paste(im, (x + (cw - im.size[0]) // 2, y + 30 + (ch - 34 - im.size[1]) // 2))
    m = meta[h]
    D.text((x + 6, y + 3), f"H{h}  {m['bands']} bands  {round(m['mPerBand']*100)} cm/band", fill=(255, 255, 0))
    D.text((x + 6, y + 16), f"relief {m['reliefM']} m  spans {m['bandsSpanned']}", fill=(200, 200, 200))
S.save(sys.argv[1], quality=88)
print(S.size)
