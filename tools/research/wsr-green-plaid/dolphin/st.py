# st.py: texture coords (s,t) of a point under a 3x4 matrix; the 2x2 tile's square, offsets within it
import sys, json, math
def st(M, P):
    return [sum(M[r][c] * P[c] for c in range(3)) + M[r][3] for r in range(2)]
SHADE = {(0, 0): "darkest (TL)", (1, 0): "mid (TR)", (0, 1): "mid (BL)", (1, 1): "lightest (BR)"}
def where(M, P):
    s, t = st(M, P)
    fs, ft = s - math.floor(s), t - math.floor(t)
    qs, qt = int(fs >= 0.5), int(ft >= 0.5)
    us, ut = (fs - 0.5 * qs) / 0.5, (ft - 0.5 * qt) / 0.5   # 0..1 across the square
    return dict(s=round(s, 4), t=round(t, 4), frac=(round(fs, 3), round(ft, 3)), square=SHADE[(qs, qt)],
                across=(round(us, 2), round(ut, 2)), edge=(round(min(us, 1 - us), 2), round(min(ut, 1 - ut), 2)))
if __name__ == "__main__":
    M = json.loads(sys.argv[1]); P = json.loads(sys.argv[2])
    print(where(M, P))
