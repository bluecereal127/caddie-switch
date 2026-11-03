# Put the resting ball somewhere else by writing Eden's RAM (the user, 2026-11-03: "for eden, you can manipulate
# memory to make the ball end up where you want it to for testing purposes"). Writes the ball actor's single position
# copies (found at rest on h13: every float3 in the actor equal to the ball outside the two trail histories) and the
# shot object's ground point (the ball 0.05 m lower); the trail histories (+0x7a40.., +0x40630.., stride 0x28) are left.
#   python -P teleport.py <x> <y> <z> [--dry]      (y = the ball's centre: the ground + 0.05)
#   python -P teleport.py --read
import sys, os, json, struct, ctypes as C, ctypes.wintypes as W
TOOLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "tools")
sys.path.insert(0, TOOLS)
import memlib as M, ballwatch as B

COPIES = [0x1c448, 0x38648, 0x38770, 0x3877c, 0x3aca0, 0x3acac, 0x3acb8, 0x3ad70, 0x3ad7c, 0x3d2a0, 0x3d2ac, 0x3d2b8, 0x3fb68]
k32 = C.WinDLL("kernel32", use_last_error=True)
k32.OpenProcess.restype = W.HANDLE; k32.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]
k32.WriteProcessMemory.restype = W.BOOL
k32.WriteProcessMemory.argtypes = [W.HANDLE, C.c_void_p, C.c_void_p, C.c_size_t, C.POINTER(C.c_size_t)]

def writer(pid):
    h = k32.OpenProcess(0x0438, False, pid)   # QUERY_INFORMATION | VM_READ | VM_WRITE | VM_OPERATION
    if not h: raise OSError("OpenProcess (write) failed %d" % C.get_last_error())
    def w(addr, data):
        n = C.c_size_t(0)
        if not k32.WriteProcessMemory(h, C.c_void_p(addr), data, len(data), C.byref(n)) or n.value != len(data):
            raise OSError("WriteProcessMemory %x failed %d" % (addr, C.get_last_error()))
    return w

def main():
    p = M.Proc(B.pid()); c = B.locate(p); act = c["actor_host"]
    cache = json.load(open(os.path.join(TOOLS, "..", "lab", "golfram-cache.json")))
    g = c["arena"] + cache["g"][0]
    def show():
        out = {"%x" % o: [round(v, 5) for v in p.f3(act + o)] for o in COPIES}
        out["shot_g"] = [round(v, 5) for v in struct.unpack("<3f", p.read(g, 12))]
        return out
    if sys.argv[1] == "--read":
        print(json.dumps(show())); return
    x, y, z = map(float, sys.argv[1:4])
    before = p.f3(act + B.POS)
    # the shot object must still hold this ball (golfram's check), else the cached address is stale
    gb = struct.unpack("<3f", p.read(g, 12))
    if "--force" not in sys.argv and (abs(gb[0] - before[0]) > 1e-3 or abs(gb[2] - before[2]) > 1e-3):
        raise SystemExit("the shot object does not hold the ball (%s vs %s): rerun golfram state first" % (gb, before))
    if "--dry" in sys.argv:
        print(json.dumps({"before": before, "to": [x, y, z], "copies": show()})); return
    w = writer(B.pid())
    blob = struct.pack("<3f", x, y, z)
    for o in COPIES: w(act + o, blob)
    w(g, struct.pack("<3f", x, y - 0.05, z))
    print(json.dumps({"before": [round(v, 5) for v in before], "to": [x, y, z], "after": show()}))

if __name__ == "__main__":
    main()
