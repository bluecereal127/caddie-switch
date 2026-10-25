# The actor trees' collision, for the collision dump (git-ignored: tools/harness/state/eden/nss-golf-x/collision), committed
# from the eden exporter of 2026-10-25 (tools/harness/state/eden/tools/nss-actortrees.py, whose hole files this writes
# byte for byte) with one addition, the kind meshes in their own frame, which tools/build-course3d.mjs ships.
#
# NSS's actor trees: every `source: "actor"` tree of nss-golf-x/trees.json is an Obj_Glf_<kind> bone of the field model
# where the game spawns Object_Obj_Glf_<kind>, whose ObjectShape (Pack/Actor/Object_Obj_Glf_<kind>.pack.zs:
# Glf_Mesh_<kind>_Col / Glf_<kind>Mesh_Col, a Phive hknpMeshShape) is the tree's collision: GolfTree 37 (the trunk and
# limbs), GolfLeaf 25 (a broadleaf's closed crown, a conifer's core) and GolfPalmLeaf 43 (open cards: a conifer's
# branches, a palm's fronds), in the actor's own frame. The field mesh and the TreeLeafNN canopies have no collision
# within 3 m of an actor tree (trees.md), so a model without these flies through 444 trees (h03s1 of 2026-10-25: a
# drive that met an actor canopy 5 m up and dropped into the rough came out 31 m long; with them it replays to 0.10 m).
#
# Writes, into --out (default the dump's collision/):
#   hNN-actors.bin + .json   per hole: each actor tree's kind mesh placed by its bone's SRT exactly as nss-trees.py places
#       it, W = float32((V * scale) R^T + translate), R = Rz Ry Rx of the bone's Euler angles (trees.json srt: the scale
#       and translate to 3 decimals, the angles to 6, as the dump's tree decode rounds them), in trees.json's order, the
#       kind's triangles in its primitive order (Havok's (a,b,c,b) quads are double-sided cards: a triangle and its
#       reverse, kept), in the field mesh's layout (verts float32 [V][3], tris uint32 [T][3], surface uint8 [T],
#       material uint8 [T] = 0), so tools/lib/nsscol.mjs loadCollision(..., { extras: ["actors"] }) appends them;
#   objects/<shape>.bin + .json   per kind (10): the kind's mesh in the actor's own frame (every vertex a multiple of
#       1/512 m, exact in float32; material = the shape's Phive material index), the layout tools/lib/nsscol.mjs
#       loadObject reads, which tools/build-course3d.mjs ships once per hole and places with the bone's SRT at load
#       (tools/lib/nss3d.mjs placeActorTree, checked bit for bit against hNN-actors.bin).
# A file whose bytes are already on disk is left untouched (the Eden player reads hNN-actors.* while it plays); a changed
# one is written to a temporary name and renamed over. Deterministic. --check compares with what is on disk and writes
# nothing (exit 1 on a difference).
#
# Reads (read-only): nss-golf-x/trees.json, nss-romfs/romfs/Pack/Actor/Object_Obj_Glf_<kind>.pack.zs, through the eden
# dump's own Phive decoder (tools/harness/state/eden/tools/nss-collision.py, with phive.py and byml.py beside it; not
# committed: they run on the dump machine only). Needs numpy and zstandard.
#   python -P tools/nss-actortrees.py [--holes 1,2,...] [--out <dir>] [--check]
import sys, os, json, math, hashlib, importlib.util
import numpy as np

TOOLS = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(TOOLS)
EDEN = os.path.join(REPO, "tools", "harness", "state", "eden")
X = os.path.join(EDEN, "nss-golf-x")
DECODER = os.path.join(EDEN, "tools", "nss-collision.py")
KINDS = ("HardWoodA", "HardWoodB", "HardWoodC", "HardWoodD", "ConiferTreeA", "ConiferTreeB", "ConiferTreeC",
         "ConiferTreeD", "PalmTreeA", "PalmTreeB")
TREE_CODES = {37, 25, 43}


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def load_decoder():
    if not os.path.exists(DECODER):
        sys.exit(f"REFUSED: no Phive decoder at {DECODER} (the eden dump's tools; this runs on the dump machine only)")
    spec = importlib.util.spec_from_file_location("nsscoll", DECODER)
    nc = importlib.util.module_from_spec(spec); spec.loader.exec_module(nc)
    return nc


# R = Rz Ry Rx (nss-trees.py euler_R, the same arithmetic)
def euler_R(r):
    rx, ry, rz = r[:3]
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]); Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


# the kind's collision mesh from its actor pack (nss-trees.py kind_mesh): one Phive shape
_kcache = {}
def kind_mesh(nc, kind):
    if kind not in _kcache:
        p = os.path.join(EDEN, "nss-romfs", "romfs", "Pack", "Actor", f"Object_Obj_Glf_{kind}.pack.zs")
        shapes, files = nc.pack_shapes(p)
        assert len(shapes) == 1, [s["name"] for s in shapes]
        d = nc.decode(shapes[0])
        _kcache[kind] = dict(V=d["V"], T=d["T"], S=d["TS"], M=d["TM"], shape=shapes[0]["name"], member=shapes[0]["member"],
                             pack=shapes[0]["pack"], packSha1=hashlib.sha1(open(p, "rb").read()).hexdigest())
    return _kcache[kind]


def layout_of(arrays):
    off, layout, parts = 0, {}, []
    for k, a, dt in arrays:
        b = a.tobytes()
        layout[k] = {"offset": off, "bytes": len(b), "dtype": dt, "shape": list(a.shape)}
        off += len(b); parts.append(b)
    return layout, b"".join(parts)


# json as the eden exporter wrote it (json.dump, indent 1, a text-mode file: the platform's line ends)
def json_bytes(obj):
    return json.dumps(obj, indent=1).replace("\n", os.linesep).encode("utf8")


def put(path, data, check, report):
    old = open(path, "rb").read() if os.path.exists(path) else None
    if old == data:
        report["same"] += 1; return
    if check:
        report["differ"].append(path); return
    tmp = path + ".tmp-%d" % os.getpid()
    with open(tmp, "wb") as f: f.write(data)
    os.replace(tmp, path)
    report["written"].append(path)


def main():
    check = "--check" in sys.argv
    out = os.path.abspath(arg("--out", os.path.join(X, "collision")))
    holes = [int(h) for h in arg("--holes").split(",")] if arg("--holes") else range(1, 22)
    nc = load_decoder()
    T = json.load(open(os.path.join(X, "trees.json")))
    os.makedirs(os.path.join(out, "objects"), exist_ok=True)
    report = {"same": 0, "written": [], "differ": []}
    used = set()
    for h in holes:
        H = T["holes"]["%02d" % h]
        Vs, Ts, Ss, n, ids = [], [], [], 0, []
        for t in H["trees"]:
            if t.get("source") != "actor" or not t.get("srt") or not t.get("kind"):
                continue
            km = kind_mesh(nc, t["kind"]); used.add(t["kind"])
            R = euler_R(t["srt"]["rotEulerRad"])
            W = (km["V"] * np.array(t["srt"]["scale"])) @ R.T + np.array(t["srt"]["translate"])
            Vs.append(W.astype(np.float32)); Ts.append((km["T"] + n).astype(np.uint32)); Ss.append(km["S"].astype(np.uint8))
            n += len(W); ids.append(t["id"])
        if not Vs:
            print("h%02d: no actor trees" % h); continue
        V = np.concatenate(Vs); Tr = np.concatenate(Ts); S = np.concatenate(Ss); Mt = np.zeros(len(S), np.uint8)
        layout, blob = layout_of((("verts", V, "float32"), ("tris", Tr, "uint32"), ("surface", S, "uint8"), ("material", Mt, "uint8")))
        base = os.path.join(out, "h%02d-actors" % h)
        codes = {int(c): int((S == c).sum()) for c in np.unique(S)}
        put(base + ".bin", blob, check, report)
        put(base + ".json", json_bytes({"hole": h, "what": "the actor trees (Obj_Glf_<kind> bones) with their kind collision meshes placed by the bone SRT (tools/nss-actortrees.py)",
                                        "trees": ids, "codes": codes, "layout": layout, "binBytes": len(blob), "binSha1": hashlib.sha1(blob).hexdigest()}), check, report)
        print("h%02d: %d actor trees, %d tris %s" % (h, len(ids), len(S), codes))
    # the kind meshes in their own frame (every kind, whichever holes ran)
    for kind in KINDS:
        km = kind_mesh(nc, kind)
        q = np.round(km["V"] * 512)
        assert np.array_equal(q / 512.0, km["V"]) and np.array_equal(km["V"].astype(np.float32).astype(np.float64), km["V"]), kind
        bad = set(np.unique(km["S"]).tolist()) - TREE_CODES
        assert not bad, (kind, bad)
        layout, blob = layout_of((("verts", km["V"].astype(np.float32), "float32"), ("tris", km["T"].astype(np.uint32), "uint32"),
                                  ("surface", km["S"].astype(np.uint8), "uint8"), ("material", km["M"].astype(np.uint8), "uint8")))
        base = os.path.join(out, "objects", km["shape"])
        put(base + ".bin", blob, check, report)
        put(base + ".json", json_bytes({
            "shape": km["shape"], "actor": f"Object_Obj_Glf_{kind}", "kind": kind, "pack": km["pack"], "packSha1": km["packSha1"], "member": km["member"],
            "frame": "actor-local (the shape's own coordinates; the game places it at each Obj_Glf_%s bone of the field model by the bone's SRT)" % kind,
            "what": "an actor tree's collision mesh (tools/nss-actortrees.py): GolfTree 37, GolfLeaf 25, GolfPalmLeaf 43; every vertex a multiple of 1/512 m",
            "counts": {"vertices": int(len(km["V"])), "triangles": int(len(km["T"]))},
            "codes": {int(c): int((km["S"] == c).sum()) for c in np.unique(km["S"])},
            "bounds": {"min": km["V"].min(0).tolist(), "max": km["V"].max(0).tolist()},
            "layout": layout, "binBytes": len(blob), "binSha1": hashlib.sha1(blob).hexdigest()}), check, report)
        print("%s (%s): %d vertices, %d triangles" % (km["shape"], kind, len(km["V"]), len(km["T"])))
    print("%d files already as written%s%s" % (report["same"], "; written: %s" % ", ".join(os.path.relpath(p, out) for p in report["written"]) if report["written"] else "",
                                             "; DIFFER: %s" % ", ".join(os.path.relpath(p, out) for p in report["differ"]) if report["differ"] else ""))
    if report["differ"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
