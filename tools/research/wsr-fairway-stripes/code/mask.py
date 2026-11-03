# band mask from three screenshots of one view: normal (N), line texture all white (Wt), all black (Bk).
# per pixel: dW = |N - Wt|, dB = |N - Bk|; W band where N == Wt and Wt != Bk; B band where N == Bk and Wt != Bk.
# writes <out>-mask.png (W band light green, B band dark green, equal grey, other red) and <out>-diff.png (Wt - Bk luminance, signed, 128 = 0)
import sys, numpy as np
from PIL import Image
n, w, b, out = sys.argv[1:5]
N, Wt, Bk = [np.asarray(Image.open(f).convert("RGB")).astype(np.int32) for f in (n, w, b)]
lum = lambda a: a @ np.array([299, 587, 114]) / 1000
dWB = np.abs(Wt - Bk).sum(2); dW = np.abs(N - Wt).sum(2); dB = np.abs(N - Bk).sum(2)
m = np.zeros(N.shape, np.uint8); m[:] = (90, 90, 90)
live = dWB > 6
isW = live & (dW <= 3) ; isB = live & (dB <= 3)
m[isW] = (170, 230, 110); m[isB] = (40, 110, 30); m[live & ~isW & ~isB] = (220, 40, 40)
Image.fromarray(m).save(out + "-mask.png")
d = np.clip(128 + 2 * (lum(Wt) - lum(Bk)), 0, 255).astype(np.uint8)
Image.fromarray(d).save(out + "-diff.png")
print("live px", int(live.sum()), "W", int(isW.sum()), "B", int(isB.sum()), "neither", int((live & ~isW & ~isB).sum()))
dl = (lum(Wt) - lum(Bk))[live]
print("W-B luminance over live px: p5 %.1f p50 %.1f p95 %.1f; share W lighter %.3f" % (*np.percentile(dl, [5, 50, 95]), (dl > 0).mean()))
