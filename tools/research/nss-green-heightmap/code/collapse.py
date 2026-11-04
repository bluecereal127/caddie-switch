# The evidence figure: each NSS green's bake colour (raw red + green, which rises steadily along the ramp) against its
# collision height, two ways: metres from the green's middle (left: the 21 curves fall on one line, a fixed metric
# scale) and the fraction of the green's own height range (right: they fan out, so the colour is not normalised).
#   python collapse.py out.png   (samples-NN.f32 and green-NN.json in the working folder)
import json, sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
SURFACE, INK, INK2, GRID, OTHER = "#fcfcfb", "#0b0b0b", "#52514e", "#e6e5e0", "#b5b4ad"
HI = {1: "#2a78d6", 9: "#eb6834"}
curves = {}
for h in range(1, 22):
    p = json.load(open("green-%02d.json" % h))["params"]
    S = np.fromfile("samples-%02d.f32" % h, np.float32).reshape(-1, 7).astype(float)
    y0, sy = p["GreenAreaCenterY"], p["GreenAreaSizeY"]
    lvl = S[:, 0] + S[:, 1]
    d = S[:, 4] - (y0 + sy / 2); u = (S[:, 4] - y0) / sy
    def binned(x, w, lo, hi):
        e = np.arange(lo, hi + w, w); b = np.digitize(x, e); X, Y = [], []
        for k in np.unique(b):
            m = b == k
            if m.sum() >= 15: X.append(x[m].mean()); Y.append(np.median(lvl[m]))
        return np.array(X), np.array(Y)
    curves[h] = (binned(d, 0.02, -1.7, 1.7), binned(u, 0.025, -0.05, 1.05), sy)
fig, ax = plt.subplots(1, 2, figsize=(11.2, 4.7), sharey=True, facecolor=SURFACE)
for a in ax:
    a.set_facecolor(SURFACE); a.grid(True, color=GRID, linewidth=0.8); a.set_axisbelow(True)
    for s in ("top", "right"): a.spines[s].set_visible(False)
    for s in ("left", "bottom"): a.spines[s].set_color(GRID)
    a.tick_params(colors=INK2, labelsize=10, length=0)
for h, (A, B, sy) in curves.items():
    if h in HI: continue
    ax[0].plot(*A, color=OTHER, linewidth=1.1); ax[1].plot(*B, color=OTHER, linewidth=1.1)
for h, c in HI.items():
    A, B, sy = curves[h]
    ax[0].plot(*A, color=c, linewidth=2.2); ax[1].plot(*B, color=c, linewidth=2.2)
ax[0].set_title("Against metres from the green's middle: one shared curve", loc="left", color=INK, fontsize=12, pad=10)
ax[1].set_title("Against the fraction of each green's own range: they fan out", loc="left", color=INK, fontsize=12, pad=10)
ax[0].set_xlabel("height above the green's middle (m)", color=INK2, fontsize=10.5)
ax[1].set_xlabel("height as a fraction of the green's own range", color=INK2, fontsize=10.5)
ax[0].set_ylabel("bake colour (raw red + green)", color=INK2, fontsize=10.5)
A1, B1, s1 = curves[1]; A9, B9, s9 = curves[9]
ax[0].annotate("H1, 0.51 m of relief", xy=(A1[0][-1], A1[1][-1]), xytext=(-0.55, 170), color=INK, fontsize=10, arrowprops=dict(arrowstyle="-", color=INK2, linewidth=0.8))
ax[0].annotate("H9, 2.88 m of relief", xy=(1.1, np.interp(1.1, *A9)), xytext=(0.35, 225), color=INK, fontsize=10, arrowprops=dict(arrowstyle="-", color=INK2, linewidth=0.8))
ax[1].annotate("H1", xy=(0.92, np.interp(0.92, *B1)), xytext=(0.8, 150), color=INK, fontsize=10, arrowprops=dict(arrowstyle="-", color=INK2, linewidth=0.8))
ax[1].annotate("H9", xy=(0.86, np.interp(0.86, *B9)), xytext=(0.72, 212), color=INK, fontsize=10, arrowprops=dict(arrowstyle="-", color=INK2, linewidth=0.8))
from matplotlib.lines import Line2D
fig.legend(handles=[Line2D([], [], color=HI[1], linewidth=2.2, label="H1 (flattest)"), Line2D([], [], color=HI[9], linewidth=2.2, label="H9 (among the steepest)"), Line2D([], [], color=OTHER, linewidth=1.1, label="the other 19 greens")],
           loc="lower center", ncol=3, frameon=False, fontsize=10, labelcolor=INK2)
fig.tight_layout(rect=(0, 0.07, 1, 1))
fig.savefig(sys.argv[1], dpi=130, facecolor=SURFACE)
