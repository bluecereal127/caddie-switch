# Make a stroke end where the test wants it (the user, 2026-11-03: memory writes allowed in Eden for testing): wait
# for the ball to leave its rest (mode != 0), then hold its physics state at the target (the position and its two
# copies at +0x3acac / +0x3acb8, u and v zeroed) until the game's stop count makes it rest there (mode 0) or the hold
# time runs out. Everything downstream (the drawn ball, the camera, the next stroke's setup) then comes from a real rest.
#   python -P rollto.py <x> <y> <z> [--hold-ms 1500] [--wait-s 60]
import sys, os, time, json, struct
TOOLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "tools")
sys.path.insert(0, TOOLS); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import memlib as M, ballwatch as B
from teleport import writer

def arg(n, d):
    return float(sys.argv[sys.argv.index(n) + 1]) if n in sys.argv else d

x, y, z = map(float, sys.argv[1:4]); hold = arg("--hold-ms", 1500) / 1000; wait = arg("--wait-s", 60)
p = M.Proc(B.pid()); c = B.locate(p); act = c["actor_host"]; w = writer(B.pid())
mode = lambda: struct.unpack("<i", p.read(act + B.M_OFF + 0x24, 4))[0]
P3 = struct.pack("<3f", x, y, z); Z3 = struct.pack("<3f", 0, 0, 0)
t0 = time.perf_counter()
while mode() == 0:
    if time.perf_counter() - t0 > wait: print(json.dumps({"err": "no launch"})); sys.exit(1)
    time.sleep(0.001)
tl = time.perf_counter(); launch = list(p.f3(act + B.POS)); m0 = mode(); n = 0; modes = {}
while time.perf_counter() - tl < hold:
    for o in (0x3aca0, 0x3acac, 0x3acb8): w(act + o, P3)
    w(act + 0x3ace4, Z3); w(act + 0x3acf0, Z3); n += 1
    m = mode(); modes[m] = modes.get(m, 0) + 1
    if m == 0 and time.perf_counter() - tl > 0.25: break
    time.sleep(0.0005)
time.sleep(0.3)
print(json.dumps({"launchedAt": round(tl - t0, 3), "launchPos": [round(v, 5) for v in launch], "modeAtLaunch": m0, "writes": n,
                  "heldS": round(time.perf_counter() - tl, 3), "modes": modes, "now": [round(v, 5) for v in p.f3(act + B.POS)],
                  "v": [round(v, 5) for v in p.f3(act + 0x3acf0)], "mode": mode()}))
