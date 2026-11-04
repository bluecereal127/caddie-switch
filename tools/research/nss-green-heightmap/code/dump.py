# Per NSS hole: GolfMiniMapCaptureParam (CommonBase overlaid with the hole's file), the Green capture texture decoded
# (RGBA, as the renderer decodes it) -> green-NN.rgba + green-NN.json {w, h, params}; prints the parameter table.
import importlib.util, json, os, sys
import numpy as np
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../.."))
spec = importlib.util.spec_from_file_location("rnm", os.path.join(REPO, "tools/render-nss-maps.py"))
rnm = importlib.util.module_from_spec(spec); spec.loader.exec_module(rnm)
romfs = os.path.join(REPO, "tools/harness/state/eden/nss-romfs/romfs")
d = os.path.join(romfs, "Parameter", "GolfMiniMapCaptureParam")
base = rnm.byml_load(open(os.path.join(d, "CommonBase.elsa__scene__GolfMiniMapCaptureParam.bgyml"), "rb").read())
print("CommonBase:", json.dumps(base, default=str)[:2000])
print("files:", sorted(os.listdir(d))[:30])
for h in range(1, 22):
    own = rnm.byml_load(open(os.path.join(d, "Field_Fld_GolfCourse%02d.elsa__scene__GolfMiniMapCaptureParam.bgyml" % h), "rb").read())
    p = rnm.capture_params(romfs, h)
    texs = rnm.load_textures(romfs, h)
    info, g = texs["Green"]
    g.tofile("green-%02d.rgba" % h)
    json.dump({"w": int(g.shape[1]), "h": int(g.shape[0]), "params": p, "own": own, "info": {k: v for k, v in info.items() if isinstance(v, (int, float, str))}}, open("green-%02d.json" % h, "w"), default=str)
    print("H%02d own %s" % (h, json.dumps({k: v for k, v in own.items() if k != "$parent"}, default=str)), "| Green", g.shape, info.get("format", ""))
