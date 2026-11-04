# Does the bake's colour (raw R, G) follow height in metres from the green's middle (a fixed scale), or the green's
# height as a fraction of its own window (normalised)? Per hole, the median raw R and G in bins of the candidate
# coordinate; across holes, the spread (std of the per-hole medians) per bin, averaged over bins that 4+ holes
# share; the coordinate the holes agree on collapses. Candidates: metres from the window middle (y0 + SizeY / 2),
# from the green's mean height, from the bottom y0; the window fraction (y - y0) / SizeY; and the fraction of a
# fixed 3.066 m window (CommonBase's GreenAreaSizeY) about the middle. Writes hue.json (the pooled curve).
import json
import numpy as np
H = {}
for h in range(1, 22):
    p = json.load(open("green-%02d.json" % h))["params"]
    S = np.fromfile("samples-%02d.f32" % h, np.float32).reshape(-1, 7).astype(float)
    H[h] = (p, S)
def spread(coord, binw, lo, hi):
    edges = np.arange(lo, hi + binw, binw)
    per = {}
    for h, (p, S) in H.items():
        c = coord(p, S)
        b = np.digitize(c, edges)
        for k in np.unique(b):
            m = b == k
            if m.sum() >= 30: per.setdefault(k, []).append(np.median(S[m, :2], axis=0))
    sds = [np.std(np.array(v), axis=0) for k, v in per.items() if len(v) >= 4]
    n = sum(1 for v in per.values() if len(v) >= 4)
    return np.mean(sds, axis=0), n
cands = {
    "metres from the window middle": (lambda p, S: S[:, 4] - (p["GreenAreaCenterY"] + p["GreenAreaSizeY"] / 2), 0.05, -1.6, 1.6),
    "metres from the green's mean height": (lambda p, S: S[:, 4] - S[:, 4].mean(), 0.05, -1.6, 1.6),
    "metres from the bottom (y0)": (lambda p, S: S[:, 4] - p["GreenAreaCenterY"], 0.05, 0, 3.1),
    "fraction of the own window": (lambda p, S: (S[:, 4] - p["GreenAreaCenterY"]) / p["GreenAreaSizeY"], 0.05 / 1.5, 0, 1.0),
    "fraction of a 3.066 m window about the middle": (lambda p, S: (S[:, 4] - (p["GreenAreaCenterY"] + p["GreenAreaSizeY"] / 2)) / 3.066 + 0.5, 0.05 / 3.066, 0, 1.0),
}
for name, (f, w, lo, hi) in cands.items():
    sd, n = spread(f, w, lo, hi)
    print("%-48s across-hole spread R %.1f G %.1f (raw levels; %d shared bins)" % (name, sd[0], sd[1], n))
# the pooled curve against metres from the middle
d_all, rgb_all = [], []
for h, (p, S) in H.items():
    d_all.append(S[:, 4] - (p["GreenAreaCenterY"] + p["GreenAreaSizeY"] / 2)); rgb_all.append(S[:, :3])
d_all = np.concatenate(d_all); rgb_all = np.concatenate(rgb_all)
curve = []
for c in np.arange(-1.55, 1.56, 0.1):
    m = np.abs(d_all - c) < 0.05
    if m.sum() > 50: curve.append([round(float(c), 2)] + [int(v) for v in np.median(rgb_all[m], axis=0)])
print("pooled raw RGB against metres from the green's middle (every 0.1 m):")
print("  " + "  ".join("%+.1f:%d,%d,%d" % tuple(r) for r in curve))
json.dump(curve, open("hue.json", "w"))
