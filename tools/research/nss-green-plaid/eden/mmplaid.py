# The minimap plaid on an address frame, measured (2026-11-03): the cup (the black disc), the ball (where the aim lines
# of several frames at one ball cross, or the pointer), the scale (RAM's ball->cup distance over their pixels), then the
# plaid's period and phase in the frame turned onto the ball->cup line.
#   python -P mmplaid.py <frame> [--aims f1,f2,...] --dist M --line DEG [--out prefix]
# DEG is the ball->cup bearing (north-up, clockwise), M the flat ball->cup distance in metres (RAM).
import sys, json, math, argparse
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("frame"); ap.add_argument("--aims", default=""); ap.add_argument("--dist", type=float, required=True)
ap.add_argument("--line", type=float, required=True); ap.add_argument("--box", default="1012,236,1267,538")
ap.add_argument("--ball", default=""); ap.add_argument("--out", default="")
a = ap.parse_args()
x0, y0, x1, y1 = map(int, a.box.split(","))

def load(f):
    im = np.asarray(Image.open(f).convert("RGB")).astype(np.float64)
    return im[y0:y1, x0:x1]

def cyan(im):
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    return (r < 120) & (g > 170) & (b > 200)

def fitline(m):
    ys, xs = np.nonzero(m); P = np.c_[xs, ys].astype(float); c = P.mean(0)
    u, s, vt = np.linalg.svd(P - c); d = vt[0]
    return c, d, len(xs)

im = load(a.frame)
# the cup: the darkest blob (max channel < 45), its centroid
dark = im.max(2) < 45
from scipy import ndimage
lab, nl = ndimage.label(dark)
sizes = ndimage.sum(dark, lab, range(1, nl + 1))
big = 1 + int(np.argmax(sizes))
ys, xs = np.nonzero(lab == big)
cup = np.array([xs.mean(), ys.mean()]); r_cup = math.sqrt(len(xs) / math.pi)
# the ball: the aim lines' crossing (least squares over every frame's line), else --ball "x,y"
lines = []
for f in [a.frame] + [s for s in a.aims.split(",") if s]:
    c, d, n = fitline(cyan(load(f))); lines.append((c, d, n, f))
if a.ball:
    ball = np.array([float(v) for v in a.ball.split(",")]) - [x0, y0]
else:
    A = []; bb = []
    for c, d, n, f in lines:
        nrm = np.array([-d[1], d[0]]); A.append(nrm); bb.append(nrm @ c)
    ball = np.linalg.lstsq(np.array(A), np.array(bb), rcond=None)[0]
# the pointer (yellow) for reference
r, g, b = im[..., 0], im[..., 1], im[..., 2]
yel = (r > 200) & (g > 140) & (g < 220) & (b < 90)
ys2, xs2 = np.nonzero(yel); ptr = np.array([xs2.mean(), ys2.mean()]) if len(xs2) else None
dpx = float(np.hypot(*(cup - ball))); pxm = dpx / a.dist
ang_img = math.degrees(math.atan2(cup[0] - ball[0], -(cup[1] - ball[1]))) % 360   # bearing on the north-up panel
# the frame turned onto the line: u along ball->cup (metres from the cup, + toward the cup's far side), v across (+ right
# of the line looking from the ball to the cup), both from the cup
t = math.radians(a.line)
eu = np.array([math.sin(t), -math.cos(t)])      # image (x right, y down) unit along the bearing
ev = np.array([math.cos(t), math.sin(t)])       # 90 deg clockwise of it: the right of the line
H, W = im.shape[:2]
YY, XX = np.mgrid[0:H, 0:W]
P = np.stack([XX - cup[0], YY - cup[1]], -1)
U = (P @ eu) / pxm; V = (P @ ev) / pxm
lum = im @ [0.299, 0.587, 0.114]
# the plaid's pixels: green, not the line, the dots, the cup, the pointer or the avatar; away from the panel's corners
gr = (g > 120) & (g > r + 25) & (g > b + 40) & ~cyan(im) & ~dark & ~yel
avatar_ok = np.hypot(XX - ball[0], YY - ball[1]) > 30 * (pxm / 25.0)
m = gr & avatar_ok
m[:6, :] = m[-6:, :] = False; m[:, :6] = m[:, -6:] = False
u, v, L = U[m], V[m], lum[m]

def fit(per):
    k = 2 * math.pi / per
    X = np.c_[np.ones_like(u), np.cos(k * u), np.sin(k * u), np.cos(k * v), np.sin(k * v)]
    c, res, *_ = np.linalg.lstsq(X, L, rcond=None)
    pred = X @ c; r2 = 1 - ((L - pred) ** 2).sum() / ((L - L.mean()) ** 2).sum()
    return r2, c

best = max(((fit(p)[0], p) for p in np.arange(0.8, 4.0, 0.002)), key=lambda z: z[0])
per = best[1]
r2, c = fit(per)
k = 2 * math.pi / per
# the phase: the lightest stripe's centre along u (the light along-u stripes) and along v
ph_u = math.atan2(c[2], c[1]); ph_v = math.atan2(c[4], c[3])
u_light = (ph_u / k) % per      # u where cos(k u - ph_u) = 1: the brightest across-stripe centre (stripes across the line)
v_light = (ph_v / k) % per
amp_u, amp_v = math.hypot(c[1], c[2]), math.hypot(c[3], c[4])
ballU = float((ball - cup) @ eu / pxm); ballV = float((ball - cup) @ ev / pxm)
def frac(x):   # where x falls in the period, from the brightest centre: 0 = a light stripe's centre, 0.5 = a dark one's
    return ((x - 0) % per) / per
res = {
    "frame": a.frame, "cup_px": [round(cup[0] + x0, 2), round(cup[1] + y0, 2)], "cup_r_px": round(r_cup, 2),
    "ball_px": [round(ball[0] + x0, 2), round(ball[1] + y0, 2)], "pointer_px": None if ptr is None else [round(ptr[0] + x0, 2), round(ptr[1] + y0, 2)],
    "lines": [{"f": f.split("/")[-1], "n": int(n), "dir_deg": round(math.degrees(math.atan2(d[0], -d[1])) % 180, 2)} for c_, d, n, f in lines],
    "ball_cup_px": round(dpx, 2), "px_per_m": round(pxm, 3), "line_on_panel_deg": round(ang_img, 2), "line_ram_deg": a.line,
    "period_m": round(per, 4), "period_px": round(per * pxm, 2), "r2": round(r2, 4), "amp_along": round(amp_u, 2), "amp_across": round(amp_v, 2),
    # the stripes ACROSS the line (constant u) and ALONG it (constant v): where their light centres fall from the cup
    "u_light_from_cup_m": round(u_light, 4), "v_light_from_cup_m": round(v_light, 4),
    "cup_phase": {"along": round(((0 - u_light) % per) / per, 4), "across": round(((0 - v_light) % per) / per, 4)},
    "ball_uv_m": [round(ballU, 4), round(ballV, 4)],
    "ball_phase": {"along": round(((ballU - u_light) % per) / per, 4), "across": round(((ballV - v_light) % per) / per, 4)},
    "n_px": int(m.sum()),
}
print(json.dumps(res, indent=1))
if a.out:
    # the panel with the fitted model drawn as the light-stripe centre lines
    vis = Image.fromarray(np.clip(im, 0, 255).astype(np.uint8)).resize((W * 3, H * 3), Image.NEAREST)
    from PIL import ImageDraw
    d = ImageDraw.Draw(vis)
    for kk in range(-12, 13):
        for (e1, e2, off) in [(eu, ev, u_light), (ev, eu, v_light)]:
            p0 = cup + e1 * (off + kk * per) * pxm
            A_ = p0 - e2 * 400; B_ = p0 + e2 * 400
            d.line([tuple(A_ * 3), tuple(B_ * 3)], fill=(255, 0, 0), width=1)
    d.ellipse([ (cup[0]-3)*3, (cup[1]-3)*3, (cup[0]+3)*3, (cup[1]+3)*3 ], outline=(255,255,0))
    d.ellipse([ (ball[0]-3)*3, (ball[1]-3)*3, (ball[0]+3)*3, (ball[1]+3)*3 ], outline=(255,0,255))
    vis.save(a.out + ".png")
