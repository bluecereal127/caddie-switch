# contact sheet: python -I sheet.py out.png cols scale name1 name2 ...  (names without .png, in this folder)
import sys, os
from PIL import Image, ImageDraw
out, cols, sc = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]); names = sys.argv[4:]
here = os.path.dirname(os.path.abspath(__file__))
ims = [Image.open(os.path.join(here, n + ".png")).convert("RGB") for n in names]
w, h = int(ims[0].width * sc), int(ims[0].height * sc)
rows = (len(ims) + cols - 1) // cols
S = Image.new("RGB", (cols * w, rows * (h + 16)), "black"); d = ImageDraw.Draw(S)
for i, (n, im) in enumerate(zip(names, ims)):
    x, y = (i % cols) * w, (i // cols) * (h + 16)
    S.paste(im.resize((w, h), Image.LANCZOS), (x, y + 16)); d.text((x + 4, y + 2), n, fill="white")
S.save(out)
