import sys, json, numpy as np
from PIL import Image
for base in sys.argv[1:]:
    h = json.load(open(base + ".json")); a = np.fromfile(base + ".rgba", np.uint8).reshape(h["h"], h["w"], 4)
    Image.fromarray(a, "RGBA").save(base + ".png")
