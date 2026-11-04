# Per hole: the stretch s and shift t that best put the hole's own colour curve onto the ramp pooled from the other 20
# greens: colour(hole at d) ~ ramp(s d + t), d = metres from the window middle. A fixed metric scale gives s = 1, t = 0
# on every hole; a scale normalised to the green's own window would give s = 3.066 / SizeY (1.0 .. 3.8).
import json
import numpy as np
H = {}
for h in range(1, 22):
    p = json.load(open("green-%02d.json" % h))["params"]
    S = np.fromfile("samples-%02d.f32" % h, np.float32).reshape(-1, 7).astype(float)
    H[h] = (p, S[:, :3], S[:, 4] - (p["GreenAreaCenterY"] + p["GreenAreaSizeY"] / 2))
edges = np.arange(-1.6, 1.6001, 0.02); cen = (edges[:-1] + edges[1:]) / 2
def curve(rgb, d, minn):
    b = np.digitize(d, edges) - 1; R = np.full((len(cen), 3), np.nan)
    for i in range(len(cen)):
        m = b == i
        if m.sum() >= minn: R[i] = np.median(rgb[m], axis=0)
    return R
rows = []
for h in range(1, 22):
    rgb = np.concatenate([v[1] for k, v in H.items() if k != h]); d = np.concatenate([v[2] for k, v in H.items() if k != h])
    Rp = curve(rgb, d, 30); ok = ~np.isnan(Rp[:, 0]); c = cen[ok]; C = Rp[ok]
    p, hr, hd = H[h]
    Rh = curve(hr, hd, 15); oh = ~np.isnan(Rh[:, 0]); ch = cen[oh]; Ch = Rh[oh]
    ramp = lambda x: np.stack([np.interp(x, c, C[:, k]) for k in range(3)], -1)
    best = (1e18, 1, 0)
    for s in np.arange(0.5, 4.01, 0.01):
        for t in np.arange(-0.2, 0.2001, 0.01):
            x = s * ch + t
            inside = (x >= c.min()) & (x <= c.max())
            if inside.mean() < 0.9: continue
            e = ((ramp(x[inside]) - Ch[inside]) ** 2).sum(1).mean()
            if e < best[0]: best = (e, s, t)
    e, s, t = best
    rows.append((h, p["GreenAreaSizeY"], s, t, e ** 0.5, 3.066 / p["GreenAreaSizeY"]))
    print("H%02d relief %.2f m: best stretch %.2f, shift %+.2f m, colour rms %.1f levels (normalised would be stretch %.2f)" % (h, p["GreenAreaSizeY"], s, t, e ** 0.5, 3.066 / p["GreenAreaSizeY"]))
R = np.array(rows)
print("stretch median %.3f (min %.2f, max %.2f); shift median %+.3f m (|.| max %.2f)" % (np.median(R[:, 2]), R[:, 2].min(), R[:, 2].max(), np.median(R[:, 3]), np.abs(R[:, 3]).max()))
