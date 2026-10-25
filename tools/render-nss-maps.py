# Render NSS's own hole minimaps into the app's 250x304 map frame: the NSS counterpart of tools/render-maps.mjs
# (which renders WSR's minimap model), committed from the minimap agent's decode (2026-10-24) with the minimap
# verifier's corrections (2026-10-25): the green plaid's tile is 2 m on every hole, and the off-course backdrop
# constants are derived by this script (--derive-backdrop) into tools/nss-map-backdrop.json instead of hard-coded.
#
# What NSS draws (NSS 1.5.0 RomFS):
#  * Model/MiniMap_Field_Fld_GolfCourseNN.bfres.zs holds no model, only an external textures.bntx with three
#    textures the game baked with its top-down capture (Parameter/GolfMiniMapCaptureParam: CommonBase overlaid with
#    Field_Fld_GolfCourseNN):
#      MiniMap  BC3 UNORM, round(AreaSize * PixelPerMeter) texels square (4078..4104) over AreaCenter +- AreaSize/2;
#      Green    BC3 UNORM, round(GreenAreaSize * GreenPixelPerMeter) (461..512) over GreenAreaCenter +- size/2: the
#               green alone with its height bands (lighter = higher), what the zoomed green's Terrain view shows;
#      WaterMap RGBA8, a pond mask, not drawn.
#    The texels are linear colour premultiplied by coverage, A = 1 - coverage (0 on the course, 229 / 240 on the sea
#    and OB tints, 51 on the 80 % OB regions of H12 / H13 / H17 / H18, 255 where nothing was captured). The trees are
#    IN the MiniMap texture (the capture rendered the tree models), so they are NSS's own, where NSS put them.
#  * Layout/LGlfMiniMap.Nin_NX_NVN.blarc.zs, blyt/LGlfMiniMap.bflyt: P_Map (material 9, user shader Glf_MiniMap,
#    __CUS_Vec3_0 = (1, 1, 1.2), HSB multipliers) draws MiniMap over P_bg (material 12: Cmn_AllWhite mixed to black
#    at alpha 200/255) over the live 3D view. Over it N_MapGreenS holds P_MapGreenGrid (material 23, user shader
#    Glf_MiniMapGreen: texture 0 the Green capture through SubGraph_Sub_SquareAspectUv, its 1 - alpha the mask;
#    texture 1 the plaid Glf_MiniMapGreen^o, BC1 sRGB, 128 texels, repeat wrap, layout tex SRT scale 25) and
#    P_MapGreen (Glf_MiniMap on Green, Vec3 (1, 1, 1.25)), the Terrain view's height bands.
#    bgsh/Glf_MiniMap.glsl is transcribed in shade(): its pow(1/2.2) .. pow(2.2) around the HSB step leaves the output
#    in linear light, written to an sRGB target, so on the course (A = 0) the display is sRGB(1.2^2.2 * texel); the
#    verifier's colour check puts it at a mean of 4.0-5.7 levels from the Switch capture stacks (the next best display
#    transform 10.1-14.1).
#  * The plaid (verifier, verify/maps/plaid-zoom.json): the Switch's zoomed green frames registered on MiniMap measure
#    a tile of 1.98-2.00 m on H1, H3 (GreenAreaSize 50), H9 (40), H12 (35), H17 (45) and H18 (30), not the layout's
#    25 tiles across GreenAreaSize (1.2-2.0 m): the game sets the plaid's scale at runtime to GreenAreaSize / 2 tiles,
#    which is 25 on the CommonBase's 50 m. Its phase is not fixed in the world: fitted (period 2 m, the frames
#    registered as the verifier did) on 25 zoomed frames of 14 holes, the phase at the green area's centre differs
#    between frames of one hole (H10: 0.05-0.58 of a tile over six frames with SNR 40-68; two frames of one view agree
#    to 0.03). On H10 a tile centre (the texture's dark square) sits on the cup in play to 0.18 of a tile in x and 0.07
#    in z across four cups, but on the other holes neither the cup, the green area's centre or corner, the map area's
#    corner, the world origin nor the view centre holds it, so the frames do not give the game's anchor. The overview's
#    plaid therefore puts a tile centre on the green area's centre (--plaid-origin centre, the default) or on NSS cup k
#    (--plaid-origin cup0 .. cup5): the period and orientation are the game's, the phase a choice. At 2x a tile is
#    1.0-2.3 px, at 4x 2.0-4.6 px. The green crop's Terrain view covers the plaid with P_MapGreen's bands.
#  * Off the course the pane is translucent (alpha 0.088 at A 240, 0.153 at A 229, 0.848 at A 51, 0 at A 255) over
#    the dimmed live 3D view, which no file holds. --backdrop world (the default) stands in flat colours for it, one
#    for OB ground (green-tinted texels), one for sea (blue-tinted: B > 0.8 G), one where nothing was captured
#    (A >= 254), read from tools/nss-map-backdrop.json, which --derive-backdrop writes (the one input sampled from
#    Switch captures, and only off the course); --backdrop pane draws the pane's own colour as if opaque (no Switch
#    input at all), --backdrop black the pane over black.
#  * The screen-fixed Ptn_dot lattice, the flag, cup, avatar, aim line, dots and wind dial are HUD, not map art, and
#    are not drawn (as render-maps.mjs draws none).
#  * Placement: texel (i, j) covers world x in x0 + [i, i+1] * AreaSizeX / N, z in z0 + [j, j+1] * AreaSizeZ / N
#    (x0 = AreaCenterX - AreaSizeX / 2, row 0 = the -z edge, the green end); world -> frame is
#    tools/nss-registration.json's holes[n] (px = a x - b z + tx, py = b x + a z + ty). Each output pixel is the mean
#    of k x k bilinear samples of the raw texels (k = ceil(texels per output px) + 1), shaded after filtering as the
#    GPU does (the filtered fetch, then the fragment shader), composited in linear light, sRGB encoded.
#
# Inputs: the NSS RomFS (git-ignored; --romfs, default tools/harness/state/eden/nss-romfs/romfs), and the committed
# tools/nss-registration.json (the transform), tools/nss-truth.json (the green box, the NSS collision's GolfGreen
# triangles), tools/nss-map-backdrop.json (the world backdrop) and tools/nss-pins.json (the cups, the tee).
# --compare (default on) and --derive-backdrop also read the capture stacks captures/derived/maps/hNN.png
# (git-ignored); --compare is skipped for a hole without one.
#
# Outputs (never the WSR renders' folders): <out>/hNN.png (2x, 500x608), hNN-3x.png (750x912), hNN-4x.png
# (1000x1216), hNN-green.png (the green box + 0.12 of it on every side, render-maps.mjs's sizing: max(4,
# ceil(256 / the longer side in map px)) px per map px, at the box's own aspect), and index.json (format in the
# _note it writes; tools/build-map-scales.mjs reads holes[n].maps[s], tools/build-derived.mjs holes[n].map and
# holes[n].green). A --holes batch keeps the other holes' entries. Deterministic: no timestamps; the same RomFS,
# committed inputs and options give the same PNG bytes (the comparison block also depends on the stacks).
#
#   python -P tools/render-nss-maps.py [--holes 1,7] [--scales 2,3,4] [--out captures/derived/render-nss]
#        [--romfs <dir>] [--backdrop world|pane|black] [--green-view height|grid] [--plaid-origin centre|cupK]
#        [--no-grid] [--no-green] [--no-compare] [--ss K] [--jobs N]
#   python -P tools/render-nss-maps.py --derive-backdrop [--holes ...]    (writes tools/nss-map-backdrop.json)
#
# Needs numpy, Pillow, zstandard and texture2ddecoder; scipy for --compare and --derive-backdrop. About 40 s a hole
# for the three scales, the green and the comparison; --jobs N renders N holes at once (each worker holds one
# hole's 4096^2 texture, ~0.5 GB).
import os, sys, json, math, time, struct, hashlib, argparse
import numpy as np
from PIL import Image

TOOLS = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(TOOLS)
DEFAULT_ROMFS = os.path.join(REPO, "tools", "harness", "state", "eden", "nss-romfs", "romfs")
CAPS = os.path.join(REPO, "captures", "derived", "maps")
DEFAULT_OUT = os.path.join(REPO, "captures", "derived", "render-nss")
BACKDROP_JSON = os.path.join(TOOLS, "nss-map-backdrop.json")
FORBIDDEN_OUT = [os.path.join(REPO, "captures", "derived", d) for d in ("render", "render-3x", "render-4x", "maps")] + [os.path.join(REPO, "public"), os.path.join(REPO, "src")]
MAP_W, MAP_H = 250, 304
GREEN_MARGIN = 0.12  # build-derived's GT_MARGIN / render-maps.mjs GREEN_MARGIN
GREEN_SCALE, GREEN_MIN = 4, 256  # render-maps.mjs --green-scale / --green-min defaults
MAP_VEC3, GREEN_VEC3 = (1.0, 1.0, 1.2), (1.0, 1.0, 1.25)  # P_Map / P_MapGreen __CUS_Vec3_0
PLAID_TILE_M = 2.0  # the plaid's period in the world (verifier: 1.98-2.00 m measured on six holes)
HOLES = list(range(1, 22))

# ---------------------------------------------------------------- containers: zstd, BYML, SARC, BFRES -> BNTX
def unzs(d):
    if d[:4] == b"\x28\xb5\x2f\xfd":
        import zstandard
        return zstandard.ZstdDecompressor().decompress(d, max_output_size=1 << 31)
    return d

def byml_load(data):
    """A BYML (v2-v7, either endian) to plain Python values."""
    data = unzs(data)
    if data[:2] == b"YB": E = "<"
    elif data[:2] == b"BY": E = ">"
    else: raise ValueError("not BYML: %r" % data[:4])
    _, keys_off, strs_off, root_off = struct.unpack(E + "HIII", data[2:16])
    u24 = lambda o: int.from_bytes(data[o:o + 3], "little" if E == "<" else "big")
    u32 = lambda o: struct.unpack(E + "I", data[o:o + 4])[0]
    def strtab(off):
        if not off: return []
        n = u24(off + 1)
        return [data[off + u32(off + 4 + 4 * i): data.index(b"\0", off + u32(off + 4 + 4 * i))].decode("utf8") for i in range(n)]
    keys, strs = strtab(keys_off), strtab(strs_off)
    def value(t, raw):
        if t == 0xA0: return strs[raw]
        if t == 0xD0: return bool(raw)
        if t == 0xD1: return struct.unpack(E + "i", struct.pack(E + "I", raw))[0]
        if t == 0xD2: return struct.unpack(E + "f", struct.pack(E + "I", raw))[0]
        if t == 0xD3: return raw
        if t == 0xD4: return struct.unpack(E + "q", data[raw:raw + 8])[0]
        if t == 0xD5: return struct.unpack(E + "Q", data[raw:raw + 8])[0]
        if t == 0xD6: return struct.unpack(E + "d", data[raw:raw + 8])[0]
        if t == 0xFF: return None
        if t in (0xC0, 0xC1): return node(raw)
        raise ValueError("BYML type %#x" % t)
    def node(off):
        t = data[off]; n = u24(off + 1)
        if t == 0xC0:
            types = data[off + 4: off + 4 + n]; vals = off + 4 + ((n + 3) & ~3)
            return [value(types[i], u32(vals + 4 * i)) for i in range(n)]
        if t == 0xC1:
            out = {}
            for i in range(n):
                e = off + 4 + 8 * i; out[keys[u24(e)]] = value(data[e + 3], u32(e + 4))
            return out
        raise ValueError("BYML node %#x" % t)
    return node(root_off) if root_off else None

def sarc_files(raw):
    """{name: bytes} of a SARC archive."""
    raw = unzs(raw)
    assert raw[:4] == b"SARC"
    doff = struct.unpack_from("<I", raw, 0x0C)[0]
    n = struct.unpack_from("<H", raw, 0x1A)[0]
    names = 0x20 + 16 * n + 8
    out = {}
    for i in range(n):
        _, attr, s, e = struct.unpack_from("<IIII", raw, 0x20 + 16 * i)
        o = names + (attr & 0xFFFF) * 4
        out[raw[o:raw.index(b"\0", o)].decode()] = raw[doff + s: doff + e]
    return out

BNTX_FORMATS = {  # BNTX format (u32 at BRTI+0x1C) -> (kind, block bytes, block w, block h)
    0x0B01: ("rgba8", 4, 1, 1), 0x0B06: ("rgba8", 4, 1, 1), 0x0C01: ("bgra8", 4, 1, 1), 0x0C06: ("bgra8", 4, 1, 1),
    0x1A01: ("bc1", 8, 4, 4), 0x1A06: ("bc1", 8, 4, 4), 0x1C01: ("bc3", 16, 4, 4), 0x1C06: ("bc3", 16, 4, 4),
    0x1D01: ("bc4", 8, 4, 4), 0x1D02: ("bc4", 8, 4, 4), 0x1E01: ("bc5", 16, 4, 4), 0x1E02: ("bc5", 16, 4, 4),
    0x2001: ("bc7", 16, 4, 4), 0x2006: ("bc7", 16, 4, 4),
}

def bntx_of(data):
    """The BNTX inside a BFRES (its external files; NX BFRES v9/v10: array at 0xB8, count at 0xEC), or the blob."""
    data = unzs(data)
    if data[:4] == b"BNTX": return data
    assert data[:4] == b"FRES", data[:4]
    arr = struct.unpack_from("<Q", data, 0xB8)[0]; n = struct.unpack_from("<H", data, 0xEC)[0]
    for i in range(n):
        off, size = struct.unpack_from("<QQ", data, arr + 16 * i)
        if data[off:off + 4] == b"BNTX": return data[off:off + size]
    raise ValueError("no BNTX external file")

def bntx_textures(b):
    assert b[:4] == b"BNTX" and b[0x20:0x24] == b"NX  "
    n = struct.unpack_from("<I", b, 0x24)[0]; arr = struct.unpack_from("<Q", b, 0x28)[0]
    out = []
    for i in range(n):
        o = struct.unpack_from("<Q", b, arr + 8 * i)[0]; assert b[o:o + 4] == b"BRTI"
        mips = struct.unpack_from("<H", b, o + 0x16)[0]
        fmt, = struct.unpack_from("<I", b, o + 0x1C)
        w, h, _, _, bh = struct.unpack_from("<IIIII", b, o + 0x24)
        no = struct.unpack_from("<Q", b, o + 0x60)[0]; ln = struct.unpack_from("<H", b, no)[0]
        mo = list(struct.unpack_from("<%dQ" % mips, b, struct.unpack_from("<Q", b, o + 0x70)[0]))
        out.append({"name": b[no + 2:no + 2 + ln].decode("utf8"), "fmt": fmt, "w": w, "h": h, "mips": mips, "bhLog2": bh, "mipOffsets": mo})
    return out

def _deswizzle(raw, wb, hb, bpp, bh_gobs):
    """Tegra X1 block linear -> linear, in elements (BCn blocks or pixels) of bpp bytes."""
    gobs_w = (wb * bpp + 63) // 64
    y = np.arange(hb, dtype=np.int64)[:, None]; x = np.arange(wb, dtype=np.int64)[None, :] * bpp
    gob = ((y // (8 * bh_gobs)) * 512 * bh_gobs * gobs_w + (x // 64) * 512 * bh_gobs + ((y % (8 * bh_gobs)) // 8) * 512)
    addr = gob + ((x % 64) // 32) * 256 + ((y % 8) // 2) * 64 + ((x % 32) // 16) * 32 + (y % 2) * 16 + (x % 16)
    src = np.frombuffer(raw, dtype=np.uint8)
    need = int(addr.max()) + bpp
    if need > src.size: src = np.concatenate([src, np.zeros(need - src.size, np.uint8)])
    return src[addr.reshape(-1, 1) + np.arange(bpp, dtype=np.int64)[None, :]].reshape(-1).tobytes()

def bntx_decode(b, t):
    """Mip 0 of texture t as HxWx4 uint8 RGBA (sRGB formats come back as their stored sRGB values)."""
    kind, bpp, bw, bhp = BNTX_FORMATS[t["fmt"]]
    wb, hb = (t["w"] + bw - 1) // bw, (t["h"] + bhp - 1) // bhp
    bh_gobs = 1 << t["bhLog2"]
    gobs_w = (wb * bpp + 63) // 64; rows = 8 * bh_gobs; hpad = (hb + rows - 1) // rows * rows
    lin = _deswizzle(b[t["mipOffsets"][0]: t["mipOffsets"][0] + gobs_w * 64 * hpad], wb, hb, bpp, bh_gobs)
    if kind in ("rgba8", "bgra8"):
        a = np.frombuffer(lin, np.uint8).reshape(t["h"], t["w"], 4).copy()
        return a[:, :, [2, 1, 0, 3]] if kind == "bgra8" else a
    import texture2ddecoder as td
    f = {"bc1": td.decode_bc1, "bc3": td.decode_bc3, "bc4": td.decode_bc4, "bc5": td.decode_bc5, "bc7": td.decode_bc7}[kind]
    bgra = np.frombuffer(f(lin, wb * 4, hb * 4), np.uint8).reshape(hb * 4, wb * 4, 4)
    return bgra[:t["h"], :t["w"], [2, 1, 0, 3]].copy()

# ---------------------------------------------------------------- NSS inputs
def capture_params(romfs, hole):
    """GolfMiniMapCaptureParam for a hole: CommonBase overlaid with Field_Fld_GolfCourseNN (its $parent)."""
    d = os.path.join(romfs, "Parameter", "GolfMiniMapCaptureParam")
    base = byml_load(open(os.path.join(d, "CommonBase.elsa__scene__GolfMiniMapCaptureParam.bgyml"), "rb").read())
    own = byml_load(open(os.path.join(d, "Field_Fld_GolfCourse%02d.elsa__scene__GolfMiniMapCaptureParam.bgyml" % hole), "rb").read())
    p = dict(base); p.update({k: v for k, v in own.items() if k != "$parent"})
    for k in ("AreaCenterX", "AreaCenterZ", "GreenAreaCenterX", "GreenAreaCenterY", "GreenAreaCenterZ"): p.setdefault(k, 0.0)
    return p

def minimap_file(romfs, hole):
    return os.path.join(romfs, "Model", "MiniMap_Field_Fld_GolfCourse%02d.bfres.zs" % hole)

def load_textures(romfs, hole):
    """{name: (info, RGBA uint8 HxWx4)} of the hole's minimap BNTX."""
    b = bntx_of(open(minimap_file(romfs, hole), "rb").read())
    return {t["name"]: (t, bntx_decode(b, t)) for t in bntx_textures(b)}

def load_plaid(romfs):
    """Glf_MiniMapGreen^o (BC1 sRGB, 128 x 128) from the layout archive, as float RGBA 0..255 (sRGB)."""
    files = sarc_files(open(os.path.join(romfs, "Layout", "LGlfMiniMap.Nin_NX_NVN.blarc.zs"), "rb").read())
    b = files["timg/__Combined.bntx"]
    t = [t for t in bntx_textures(b) if t["name"] == "Glf_MiniMapGreen^o"][0]
    return bntx_decode(b, t).astype(np.float64)

def read_json(path):
    with open(path, encoding="utf8") as f: return json.load(f)

class Area:
    """A capture texture's world footprint: x0, z0 (its -x / -z corner), sizes, texel counts."""
    def __init__(self, cx, cz, sx, sz, nx, nz):
        self.cx, self.cz = cx, cz
        self.x0, self.z0, self.sx, self.sz, self.nx, self.nz = cx - sx / 2, cz - sz / 2, sx, sz, nx, nz
    def texel(self, x, z):  # continuous texel index (centres at integers)
        return (x - self.x0) / self.sx * self.nx - 0.5, (z - self.z0) / self.sz * self.nz - 0.5

def map_area(p, tex): return Area(p["AreaCenterX"], p["AreaCenterZ"], p["AreaSizeX"], p["AreaSizeZ"], tex.shape[1], tex.shape[0])
def green_area(p, tex): return Area(p["GreenAreaCenterX"], p["GreenAreaCenterZ"], p["GreenAreaSizeX"], p["GreenAreaSizeZ"], tex.shape[1], tex.shape[0])

class Frame:
    """NSS world (x, z) <-> the 250x304 map frame px: px = a x - b z + tx, py = b x + a z + ty."""
    def __init__(self, t): self.a, self.b, self.tx, self.ty = t["a"], t["b"], t["tx"], t["ty"]
    def to_px(self, x, z): return self.a * x - self.b * z + self.tx, self.b * x + self.a * z + self.ty
    def to_world(self, px, py):
        u, v = px - self.tx, py - self.ty; d = self.a * self.a + self.b * self.b
        return (self.a * u + self.b * v) / d, (-self.b * u + self.a * v) / d

# ---------------------------------------------------------------- sampling
def bilinear(tex, tu, tv):
    """tex HxWxC uint8, tu/tv texel coords (centres at integers), clamp to edge -> float32 (..., C)."""
    H, W = tex.shape[:2]
    tu = np.clip(tu, 0, W - 1); tv = np.clip(tv, 0, H - 1)
    i0 = np.floor(tu).astype(np.int32); j0 = np.floor(tv).astype(np.int32)
    i1 = np.minimum(i0 + 1, W - 1); j1 = np.minimum(j0 + 1, H - 1)
    fu = (tu - i0).astype(np.float32)[..., None]; fv = (tv - j0).astype(np.float32)[..., None]
    t00 = tex[j0, i0].astype(np.float32); t10 = tex[j0, i1].astype(np.float32)
    t01 = tex[j1, i0].astype(np.float32); t11 = tex[j1, i1].astype(np.float32)
    return (t00 * (1 - fu) + t10 * fu) * (1 - fv) + (t01 * (1 - fu) + t11 * fu) * fv

def bilinear_wrap(tex, tu, tv):
    """Bilinear fetch with repeat wrapping (the plaid's wrap mode 5): tex HxWxC float, texel coords centred on ints."""
    H, W = tex.shape[:2]
    i0 = np.floor(tu).astype(np.int64); j0 = np.floor(tv).astype(np.int64)
    fu = (tu - i0)[..., None]; fv = (tv - j0)[..., None]
    i0 %= W; j0 %= H; i1 = (i0 + 1) % W; j1 = (j0 + 1) % H
    return (tex[j0, i0] * (1 - fu) + tex[j0, i1] * fu) * (1 - fv) + (tex[j1, i0] * (1 - fu) + tex[j1, i1] * fu) * fv

def sample_grid(box, W, H, k, r0, r1, u0=0, u1=None):
    """Frame px (PX, PY) of the k x k sub-samples of output rows r0..r1, columns u0..u1 of a W x H render of box."""
    fx0, fy0, fx1, fy1 = box
    u1 = W if u1 is None else u1
    sub = (np.arange(k, dtype=np.float64) + 0.5) / k
    us = (np.arange(u0, u1, dtype=np.float64)[:, None] + sub[None, :]).reshape(-1)
    vs = (np.arange(r0, r1, dtype=np.float64)[:, None] + sub[None, :]).reshape(-1)
    return np.meshgrid(fx0 + us * (fx1 - fx0) / W, fy0 + vs * (fy1 - fy0) / H)

def resample(tex, area, frame, box, W, H, k, rows=32):
    """Area mean of tex over each output pixel of the frame rect box = (fx0, fy0, fx1, fy1) split into W x H, each
    the mean of k x k bilinear samples (the GPU's filtered fetch before the shader). float32 HxWxC in 0..255."""
    out = np.zeros((H, W, tex.shape[2]), np.float32)
    for r0 in range(0, H, rows):
        r1 = min(H, r0 + rows)
        PX, PY = sample_grid(box, W, H, k, r0, r1)
        tu, tv = area.texel(*frame.to_world(PX, PY))
        out[r0:r1] = bilinear(tex, tu, tv).reshape(r1 - r0, k, W, k, -1).mean(axis=(1, 3))
    return out

def supersample(area, frame, scale_px_per_map_px):
    """k: ceil(texels per output pixel) + 1."""
    m_per_map_px = 1.0 / math.hypot(frame.a, frame.b)
    return int(math.ceil(m_per_map_px / scale_px_per_map_px / (area.sx / area.nx))) + 1

# ---------------------------------------------------------------- Glf_MiniMap.glsl, per pixel on the filtered texel
def rgb_to_hsb(c):
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    s1 = g >= b  # step(c.b, c.g)
    px = np.where(s1, g, b); py = np.where(s1, b, g); pz = np.where(s1, 0.0, -1.0); pw = np.where(s1, -1.0 / 3.0, 2.0 / 3.0)
    s2 = r >= px  # step(p.x, c.r)
    qx = np.where(s2, r, px); qy = py; qz = np.where(s2, pz, pw); qw = np.where(s2, px, r)
    d = qx - np.minimum(qw, qy); e = 1.0e-10
    return np.stack([np.abs(qz + (qw - qy) / (6.0 * d + e)), d / (qx + e), qx], -1)

def hsb_to_rgb(c):
    h, s, v = c[..., 0:1], c[..., 1:2], c[..., 2:3]
    rgb = np.clip(np.abs(np.mod(h * 6.0 + np.array([0.0, 4.0, 2.0]), 6.0) - 3.0) - 1.0, 0.0, 1.0)
    return v * (1.0 + (rgb - 1.0) * s)

def shade(tex255, vec3=MAP_VEC3):
    """The P_Map / P_MapGreen fragment: filtered texel (0..255 RGBA) -> (linear rgb, alpha), before the black/white
    mix (black (0,0,0,0), white (1,1,1,1): the identity) and the framebuffer blend."""
    t = np.clip(tex255.astype(np.float64) / 255.0, 0.0, 1.0)
    inv = 1.0 - t[..., 3]                                       # SubtractFrom1(tex.a)
    m = np.minimum(t[..., :3], inv[..., None])                  # Min(tex.rgb, inv)
    k = np.clip(inv - 0.2 - inv * -0.2, 0.0, 1.0)[..., None]    # Clamp01((inv + -0.2) - inv * -0.2)
    c1 = m * 1.6 + (m - m * 1.6) * k                            # Mix(m * 1.6, m, k)
    c2 = np.power(np.maximum(hsb_to_rgb(rgb_to_hsb(np.power(m, 1.0 / 2.2)) * np.array(vec3)), 0.0), 2.2)
    rgb = c1 + (c2 - c1) * k                                    # Mix(c1, c2, k) * vColor.a (1)
    a1 = np.clip(inv * 1.5, 0.0, 1.0)
    return rgb, a1 + (inv - a1) * k[..., 0]                     # Mix(Clamp01(inv * 1.5), inv, k)

def srgb_encode(lin):
    lin = np.clip(lin, 0.0, 1.0)
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)

def srgb_decode(s):
    s = np.clip(s, 0.0, 1.0)
    return np.where(s <= 0.04045, s / 12.92, np.power((s + 0.055) / 1.055, 2.4))

def to8(lin):
    if not np.isfinite(lin).all(): raise ValueError("non-finite colour in a render (%d px)" % int((~np.isfinite(lin)).sum()))
    return (srgb_encode(lin) * 255 + 0.5).astype(np.uint8)

# ---------------------------------------------------------------- layers
def kinds(raw):
    """The off-course stand-in each filtered texel takes: 'void' (nothing captured, A >= 254), 'sea' (B > 0.8 G), 'ob'."""
    void = raw[..., 3] >= 254
    sea = (raw[..., 2] > raw[..., 1] * 0.8) & ~void
    return void, sea, ~void & ~sea

def backdrop(raw, mode, world):
    """Linear RGB under the pane (after P_bg) per pixel."""
    if mode in ("pane", "black"): return np.zeros(raw.shape[:2] + (3,))
    void, sea, _ = kinds(raw)
    B = np.where(sea[..., None], np.array(world["sea"]), np.array(world["ob"]))
    return np.where(void[..., None], np.array(world["void"]), B)

def compose(raw, mode, world, vec3=MAP_VEC3):
    """P_Map over the backdrop: linear RGB (H, W, 3) and the pane's alpha."""
    rgb, al = shade(raw, vec3)
    if mode == "pane": return np.clip(rgb, 0, 1), al
    a = al[..., None]
    return np.clip(a * rgb + (1 - a) * backdrop(raw, mode, world), 0, 1), al

def grid_layer(plaid_lin, gt, ga, origin, frame, box, W, H, k, rows=32):
    """P_MapGreenGrid as src-alpha blending lays it down. Per k x k sample: inv = 1 - Green.a (the Green capture
    sampled through its own area; 0 outside it), rgb = plaid * inv, alpha = inv (HSB x (1, 1, 1) is the identity;
    the shader's pow(1/2.2) / pow(2.2) cancel); the plaid repeats every PLAID_TILE_M metres, world-locked, with a
    tile centre (texture coordinate 0.5) at origin = (x, z). Returns the pixel means of alpha * rgb (H, W, 3) and
    of alpha (H, W); only pixels over the Green area are evaluated."""
    n = plaid_lin.shape[0]
    fx0, fy0, fx1, fy1 = box
    pts = [frame.to_px(x, z) for x in (ga.x0, ga.x0 + ga.sx) for z in (ga.z0, ga.z0 + ga.sz)]
    u0 = max(0, int(math.floor((min(q[0] for q in pts) - fx0) / (fx1 - fx0) * W)) - 1); u1 = min(W, int(math.ceil((max(q[0] for q in pts) - fx0) / (fx1 - fx0) * W)) + 1)
    v0 = max(0, int(math.floor((min(q[1] for q in pts) - fy0) / (fy1 - fy0) * H)) - 1); v1 = min(H, int(math.ceil((max(q[1] for q in pts) - fy0) / (fy1 - fy0) * H)) + 1)
    pre = np.zeros((H, W, 3)); alp = np.zeros((H, W))
    if u0 >= u1 or v0 >= v1: return pre, alp
    for r0 in range(v0, v1, rows):
        r1 = min(v1, r0 + rows)
        PX, PY = sample_grid(box, W, H, k, r0, r1, u0, u1)
        x, z = frame.to_world(PX, PY)
        tu, tv = ga.texel(x, z)
        inv = 1.0 - np.clip(bilinear(gt[..., 3:4], tu, tv)[..., 0] / 255.0, 0, 1)
        inv = np.where((x < ga.x0) | (x > ga.x0 + ga.sx) | (z < ga.z0) | (z > ga.z0 + ga.sz), 0.0, inv)
        # texture coordinate in tiles: 0.5 at the origin; texel centres at (i + 0.5) / n
        g = bilinear_wrap(plaid_lin, (0.5 + (x - origin[0]) / PLAID_TILE_M) * n - 0.5, (0.5 + (z - origin[1]) / PLAID_TILE_M) * n - 0.5)
        a = inv[..., None]
        pre[r0:r1, u0:u1] = (a * a * g).reshape(r1 - r0, k, u1 - u0, k, 3).mean(axis=(1, 3))
        alp[r0:r1, u0:u1] = inv.reshape(r1 - r0, k, u1 - u0, k).mean(axis=(1, 3))
    return pre, alp

def over(lin, pre, alp): return np.clip(pre + (1 - alp[..., None]) * lin, 0, 1)

# ---------------------------------------------------------------- comparison with the capture stacks
def box1x(img8, s):
    a = img8.astype(np.float64); H, W = a.shape[0] // s, a.shape[1] // s
    return a[:H * s, :W * s].reshape(H, s, W, s, -1).mean(axis=(1, 3))

def hud_mask(cap):
    """The Switch HUD over the map window in a capture stack: the wind dial and its 'NN mph' label (a bright white
    cluster in the lower half) and the window's top strip, found from the stack's own near-white pixels."""
    from scipy import ndimage
    white = (cap.min(-1) >= 205) & (cap.max(-1) - cap.min(-1) <= 40)
    m = np.zeros(cap.shape[:2], bool); m[:6, :] = True
    lab, _ = ndimage.label(ndimage.binary_dilation(white, iterations=4))
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        ys, xs = sl
        if ys.start < MAP_H * 0.55 or (lab[sl] == i).sum() < 60: continue
        boxes.append((ys.start, ys.stop, xs.start, xs.stop))
    if boxes:
        y0 = min(b[0] for b in boxes); y1 = max(b[1] for b in boxes); x0 = min(b[2] for b in boxes); x1 = max(b[3] for b in boxes)
        m[max(0, y0 - 6):min(MAP_H, y1 + 6), max(0, x0 - 6):min(MAP_W, x1 + 6)] = True
    return m

def describe(diff, course, cupmask, hud, teemask, thr=30):
    """Where the render and the stack differ, HUD left out: 8-connected regions (>= 6 px) of mean |diff| > thr at
    1x, largest first, each labelled by what is under it."""
    from scipy import ndimage
    lab, _ = ndimage.label((diff > thr) & ~hud, structure=np.ones((3, 3)))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        r = lab[sl] == i; area = int(r.sum())
        if area < 6: continue
        ys, xs = sl
        sub = lambda mk: float(mk[sl][r].mean())
        kind = ("green/flag" if sub(cupmask) > 0.3 else "tee/avatar" if sub(teemask) > 0.3 else "course" if sub(course) > 0.6 else "course edge" if sub(course) > 0.15
                else "frame edge" if (xs.start == 0 or xs.stop == MAP_W or ys.stop == MAP_H) and min(xs.stop - xs.start, ys.stop - ys.start) <= 3 else "off course")
        out.append({"px": area, "x": [xs.start, xs.stop], "y": [ys.start, ys.stop], "meanDiff": round(float(diff[sl][r].mean()), 1), "where": kind})
    out.sort(key=lambda o: (-o["px"], o["y"][0], o["x"][0]))
    tot = {}
    for o in out: tot[o["where"]] = tot.get(o["where"], 0) + o["px"]
    return {"thr": thr, "pxByWhere": tot, "hudPxOver": int(((diff > thr) & hud).sum()), "regions": out[:8]}

def fidelity(img8, s, cap, al1, gbox, hud, tee):
    r = box1x(img8, s)[..., :3]; c = cap[..., :3].astype(np.float64)
    d = np.abs(r - c); dm = d.mean(-1)
    course = al1 >= 0.99
    yy, xx = np.mgrid[0:MAP_H, 0:MAP_W]
    gx0, gy0, gx1, gy1 = gbox["x0"] * MAP_W, gbox["y0"] * MAP_H, gbox["x1"] * MAP_W, gbox["y1"] * MAP_H
    cupmask = (xx >= gx0 - 3) & (xx <= gx1 + 3) & (yy >= gy0 - 6) & (yy <= gy1 + 3)
    gmask = (xx + 0.5 >= gx0) & (xx + 0.5 <= gx1) & (yy + 0.5 >= gy0) & (yy + 0.5 <= gy1)
    teemask = np.zeros_like(course) if tee is None else (xx - tee[0]) ** 2 + (yy - tee[1]) ** 2 <= 10 ** 2
    nh = ~hud
    mad = lambda mk: None if mk.sum() == 0 else [round(float(v), 2) for v in d[mk].mean(0)]
    bias = lambda mk: None if mk.sum() == 0 else [round(float(v), 2) for v in (r - c)[mk].mean(0)]
    return {"mad": mad(np.ones_like(course)), "madNoHud": mad(nh), "madCourse": mad(course & nh), "biasCourse": bias(course & nh),
            "madOff": mad(~course & nh), "madGreen": mad(gmask & nh), "greenPx": int((gmask & nh).sum()),
            "px": {"all": MAP_W * MAP_H, "hud": int(hud.sum()), "course": int((course & nh).sum()), "off": int((~course & nh).sum())},
            "differs": describe(dm, course, cupmask, hud, teemask)}

def best_shift(img4, cap, al1, hud):
    """Registration check on the 4x render: the course-interior MAD for the render moved by (dx, dy) map px, -1.5..+1.5
    in 1/4 px steps (+ = right / down), over the whole course and its top / bottom / left / right thirds (a scale error
    would move the thirds apart: scaleY, scaleX = the shift difference over the thirds' spacing)."""
    c = cap[..., :3].astype(np.float64)
    mk = (al1 >= 0.99) & ~hud
    mk[:3, :] = mk[-3:, :] = False; mk[:, :3] = mk[:, -3:] = False
    ys, xs = np.nonzero(mk)
    y0, y1 = np.percentile(ys, [33, 67]); x0, x1 = np.percentile(xs, [33, 67])
    yy, xx = np.mgrid[0:MAP_H, 0:MAP_W]
    parts = {"all": mk, "top": mk & (yy < y0), "bottom": mk & (yy > y1), "left": mk & (xx < x0), "right": mk & (xx > x1)}
    base = img4.astype(np.float64); scores = {}
    for dy in range(-6, 7):
        for dx in range(-6, 7):
            scores[(dx, dy)] = np.abs(box1x(np.roll(np.roll(base, dy, 0), dx, 1), 4)[..., :3] - c).mean(-1)
    res = {}
    for kname, m in parts.items():
        b = min(sorted(scores), key=lambda s: scores[s][m].mean())
        res[kname] = {"dx": b[0] / 4, "dy": b[1] / 4, "at": [round(float(xx[m].mean()), 1), round(float(yy[m].mean()), 1)]}
    out = {"mad0": round(float(scores[(0, 0)][mk].mean()), 2), "madBest": round(float(min(v[mk].mean() for v in scores.values())), 2),
           "dx": res["all"]["dx"], "dy": res["all"]["dy"], "parts": {kname: v for kname, v in res.items() if kname != "all"}}
    out["scaleY"] = round((res["bottom"]["dy"] - res["top"]["dy"]) / (res["bottom"]["at"][1] - res["top"]["at"][1]), 4)
    out["scaleX"] = round((res["right"]["dx"] - res["left"]["dx"]) / (res["right"]["at"][0] - res["left"]["at"][0]), 4)
    return out

# ---------------------------------------------------------------- one hole
def sha1(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for blk in iter(lambda: f.read(1 << 20), b""): h.update(blk)
    return h.hexdigest()

def plaid_origin(spec, p, cups):
    """The world (x, z) the plaid centres a tile on: the green area's centre, or NSS cup k."""
    if spec == "centre": return (p["GreenAreaCenterX"], p["GreenAreaCenterZ"]), "the green area's centre (GreenAreaCenter)"
    k = int(spec[3:]); c = [c for c in cups if c["k"] == k][0]
    return (c["world"][0], c["world"][2]), "NSS cup %d" % k

def render_hole(job):
    h, o = job["hole"], job["opt"]
    t0 = time.time()
    nn = "%02d" % h
    romfs, out = o["romfs"], o["out"]
    reg = read_json(os.path.join(TOOLS, "nss-registration.json"))["holes"][str(h)]
    truth = read_json(os.path.join(TOOLS, "nss-truth.json"))["holes"][str(h)]
    pins = read_json(os.path.join(TOOLS, "nss-pins.json"))["holes"][str(h)]
    world = read_json(BACKDROP_JSON)["world"] if o["backdrop"] == "world" else None
    p = capture_params(romfs, h)
    texs = load_textures(romfs, h)
    mm = texs["MiniMap"][1]; area = map_area(p, mm)
    gt = texs["Green"][1]; ga = green_area(p, gt)
    frame = Frame(reg)
    plaid_lin = srgb_decode(load_plaid(romfs)[..., :3] / 255.0)  # the sRGB fetch decodes before filtering
    origin, origin_what = plaid_origin(o["plaid_origin"], p, pins["cups"])
    gbox = truth["greenBox"]
    entry = {"art": "nss", "backdrop": o["backdrop"], "overviewGrid": not o["no_grid"],
             "plaid": {"tileM": PLAID_TILE_M, "origin": [round(origin[0], 4), round(origin[1], 4)], "originIs": origin_what},
             "source": {"file": "Model/MiniMap_Field_Fld_GolfCourse%s.bfres.zs" % nn, "sha1": sha1(minimap_file(romfs, h)),
                        "textures": {kk: {"w": v[0]["w"], "h": v[0]["h"], "fmt": "%#06x" % v[0]["fmt"]} for kk, v in sorted(texs.items())}},
             "area": {"center": [p["AreaCenterX"], p["AreaCenterZ"]], "size": [p["AreaSizeX"], p["AreaSizeZ"]], "pixelPerMeter": round(p["PixelPerMeter"], 4),
                      "green": {"center": [p["GreenAreaCenterX"], p["GreenAreaCenterZ"]], "size": [p["GreenAreaSizeX"], p["GreenAreaSizeZ"]], "pixelPerMeter": round(p["GreenPixelPerMeter"], 4)}},
             "transform": {kk: reg[kk] for kk in ("a", "b", "tx", "ty")}}
    cap = None
    if not o["no_compare"] and os.path.exists(os.path.join(CAPS, "h%s.png" % nn)):
        cap = np.array(Image.open(os.path.join(CAPS, "h%s.png" % nn)).convert("RGB"))
    al1 = hud = None
    if cap is not None:
        _, al1 = shade(resample(mm, area, frame, (0, 0, MAP_W, MAP_H), MAP_W, MAP_H, supersample(area, frame, 1)))
        hud = hud_mask(cap)
    tee = pins.get("tees", {}).get("teeObj")
    tee_px = (tee["x"] * MAP_W, tee["y"] * MAP_H) if tee else None
    maps, fid = {}, {}
    for s in o["scales"]:
        k = o["ss"] or supersample(area, frame, s)
        fn = "h%s.png" % nn if s == 2 else "h%s-%dx.png" % (nn, s)
        box = (0, 0, MAP_W, MAP_H)
        lin, _ = compose(resample(mm, area, frame, box, MAP_W * s, MAP_H * s, k), o["backdrop"], world)
        if not o["no_grid"]:  # the overview shows P_MapGreenGrid's plaid on the green (the capture stacks have it)
            lin = over(lin, *grid_layer(plaid_lin, gt, ga, origin, frame, box, MAP_W * s, MAP_H * s, k))
        img = to8(lin)
        Image.fromarray(img, "RGB").save(os.path.join(out, fn), optimize=True)
        maps[str(s)] = {"file": fn, "width": MAP_W * s, "height": MAP_H * s, "scale": s, "ss": k}
        if cap is not None:
            fid[str(s)] = fidelity(img, s, cap, al1, gbox, hud, tee_px)
            if s == 4: entry["registration4x"] = best_shift(img, cap, al1, hud)
    entry["map"] = maps["2"] if "2" in maps else maps[str(o["scales"][0])]
    entry["maps"] = maps
    if cap is not None: entry["fidelity"] = fid
    if not o["no_green"]:
        b = gbox; bw = (b["x1"] - b["x0"]) * MAP_W; bh = (b["y1"] - b["y0"]) * MAP_H
        cw, ch = bw * (1 + 2 * GREEN_MARGIN), bh * (1 + 2 * GREEN_MARGIN)
        gs = max(GREEN_SCALE, math.ceil(GREEN_MIN / max(cw, ch)))
        W, H = round(cw * gs), round(ch * gs)
        fb = (b["x0"] - GREEN_MARGIN * (b["x1"] - b["x0"]), b["y0"] - GREEN_MARGIN * (b["y1"] - b["y0"]),
              b["x1"] + GREEN_MARGIN * (b["x1"] - b["x0"]), b["y1"] + GREEN_MARGIN * (b["y1"] - b["y0"]))
        box = (fb[0] * MAP_W, fb[1] * MAP_H, fb[2] * MAP_W, fb[3] * MAP_H)
        sx = W / (box[2] - box[0])  # output px per map px
        # the zoomed green as the layout stacks it: P_Map, P_MapGreenGrid, then (Terrain view) P_MapGreen's bands
        lin, _ = compose(resample(mm, area, frame, box, W, H, supersample(area, frame, sx)), o["backdrop"], world)
        kg = supersample(ga, frame, sx)
        lin = over(lin, *grid_layer(plaid_lin, gt, ga, origin, frame, box, W, H, kg))
        if o["green_view"] == "height":
            grgb, gal = shade(resample(gt, ga, frame, box, W, H, kg), GREEN_VEC3)
            a = np.clip(gal, 0, 1)[..., None]
            lin = np.clip(a * np.clip(grgb, 0, 1) + (1 - a) * lin, 0, 1)
        fn = "h%s-green.png" % nn
        Image.fromarray(to8(lin), "RGB").save(os.path.join(out, fn), optimize=True)
        entry["green"] = {"file": fn, "width": W, "height": H, "aspect": round(bw / bh, 4), "margin": GREEN_MARGIN, "pxPerMapPx": gs,
                          "box": {kk: b[kk] for kk in ("x0", "y0", "x1", "y1")}, "boxSource": "tools/nss-truth.json greenBox (NSS collision GolfGreen)",
                          "view": o["green_view"], "frame": {"x0": round(fb[0], 4), "y0": round(fb[1], 4), "x1": round(fb[2], 4), "y1": round(fb[3], 4)}}
    msg = "H%d: %s in %.1f s" % (h, ", ".join("%s %dx%d (ss %d)" % (m["file"], m["width"], m["height"], m["ss"]) for m in maps.values()), time.time() - t0)
    if "2" in fid:
        f = fid["2"]; msg += "; 2x vs the capture stack: all %s, course %s, off %s, green %s" % (f["mad"], f["madCourse"], f["madOff"], f["madGreen"])
    return h, entry, msg

# ---------------------------------------------------------------- the world backdrop's derivation
def derive_hole(job):
    """Per pixel of the hole's off-course pane (alpha < 0.99), outside the HUD, the inversion of the composite
    est = (capture - alpha * pane) / (1 - alpha) (linear light), its weight 1 - alpha (the backdrop's share of the
    pixel), and its kind."""
    h, romfs = job["hole"], job["opt"]["romfs"]
    nn = "%02d" % h
    path = os.path.join(CAPS, "h%s.png" % nn)
    if not os.path.exists(path): return h, None
    reg = read_json(os.path.join(TOOLS, "nss-registration.json"))["holes"][str(h)]
    p = capture_params(romfs, h); texs = load_textures(romfs, h)
    mm = texs["MiniMap"][1]; area = map_area(p, mm); frame = Frame(reg)
    raw = resample(mm, area, frame, (0, 0, MAP_W, MAP_H), MAP_W, MAP_H, supersample(area, frame, 1)).astype(np.float64)
    rgb, al = shade(raw); rgb = np.clip(rgb, 0, 1)
    cap8 = np.array(Image.open(path).convert("RGB")); cl = srgb_decode(cap8 / 255.0)
    off = (al < 0.99) & ~hud_mask(cap8)
    off[:, :1] = off[:, -1:] = False; off[-1:, :] = False  # the window's border px
    a = al[..., None]; est = (cl - a * rgb) / np.maximum(1 - a, 1e-3)
    void, sea, ob = kinds(raw)
    rows = {}
    for kname, m in (("void", off & void), ("sea", off & sea), ("ob", off & ob)):
        if m.any(): rows[kname] = (est[m].astype(np.float64), (1 - al[m]).astype(np.float64))
    return h, rows

def weighted_median(v, w):
    """Per column of v (N, 3), the weighted median (the smallest value whose cumulative weight reaches half)."""
    out = []
    for c in range(v.shape[1]):
        o = np.argsort(v[:, c], kind="stable"); cw = np.cumsum(w[o])
        out.append(float(v[o, c][np.searchsorted(cw, 0.5 * cw[-1])]))
    return out

def derive_backdrop(results, min_px=200):
    """Each kind's stand-in: the weighted median, weights 1 - alpha, of the per-pixel inversion pooled over every hole
    with at least min_px px of that kind. It minimises the summed |capture - composite| over those px (the residual of
    a pixel is (1 - alpha) * |est - B|), so the px where the backdrop shows most decide, and the A-51 px of the 80 %
    OB regions (the backdrop 15 % of the pixel, its inversion's noise x 6.6) count a sixth as much."""
    pooled, per = {}, {}
    for h, rows in sorted(results.items()):
        if not rows: continue
        per[str(h)] = {}
        for kname, (v, w) in sorted(rows.items()):
            per[str(h)][kname] = {"px": int(len(w)), "weight": round(float(w.sum()), 1), "wmedian": [round(x, 4) for x in weighted_median(v, w)]}
            if len(w) >= min_px: pooled.setdefault(kname, []).append((v, w, h))
    world, used = {}, {}
    for kname in ("ob", "sea", "void"):
        if kname not in pooled: continue
        v = np.concatenate([q[0] for q in pooled[kname]]); w = np.concatenate([q[1] for q in pooled[kname]])
        world[kname] = [round(x, 4) for x in weighted_median(v, w)]
        used[kname] = {"holes": [q[2] for q in pooled[kname]], "px": int(len(w))}
    for kname in ("sea", "void"):
        if kname not in world: world[kname] = world["ob"]; used[kname] = {"holes": [], "px": 0, "fallback": "ob"}
    return world, used, per

# ---------------------------------------------------------------- main
def run_jobs(fn, jobs, n):
    if n <= 1 or len(jobs) <= 1:
        for j in jobs: yield fn(j)
        return
    from concurrent.futures import ProcessPoolExecutor
    with ProcessPoolExecutor(max_workers=n) as ex:
        for r in ex.map(fn, jobs): yield r

INDEX_NOTE = ("Written by tools/render-nss-maps.py: NSS's own minimap, the baked capture textures of "
    "Model/MiniMap_Field_Fld_GolfCourseNN.bfres.zs (NSS 1.5.0 RomFS) drawn with LGlfMiniMap.bflyt's P_Map / P_MapGreen "
    "shader (Glf_MiniMap.glsl), P_MapGreenGrid's plaid on the green (Glf_MiniMapGreen.glsl; a 2 m tile with a tile "
    "centre on `plaid.origin`, the game centring one on the cup in play), placed by tools/nss-registration.json. "
    "holes[n]: art 'nss'; maps[s] = { file, width, height, scale, ss }, the 250x304 map frame at s px per map px (s 2, "
    "3, 4: hNN.png, hNN-3x.png, hNN-4x.png), ss the supersamples per axis; map = maps['2']; green = { file, width, "
    "height, aspect, margin, pxPerMapPx, box, frame, view }: the crop of tools/nss-truth.json's greenBox (box, map "
    "fractions, exactly the truth's) plus margin of it on every side at the box's aspect (width / height in map px), "
    "bbox-local (u, v) at ((u + margin) / (1 + 2 margin)) of the image, as render-maps.mjs; view height = the Terrain "
    "view (map, plaid, height bands), grid = the plain plaid view. backdrop: what stands in for the live 3D view under "
    "the translucent off-course pane (world = tools/nss-map-backdrop.json's flat stand-ins, derived from the capture "
    "stacks by --derive-backdrop, off course only). fidelity (when captures/derived/maps/hNN.png exists): each render "
    "box-filtered to 250x304 against it, mean |diff| per channel (0..255); madCourse where the pane is opaque (the "
    "course), madOff elsewhere, both without the HUD (wind dial, top strip); differs = regions over `thr` outside the "
    "HUD; registration4x = the shift (map px, + right / down) that best fits the 4x render to the stack.")

def main():
    ap = argparse.ArgumentParser(description="Render NSS's own hole minimaps into the 250x304 map frame.")
    ap.add_argument("--holes", default=",".join(str(i) for i in HOLES))
    ap.add_argument("--scales", default="2,3,4")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--romfs", default=DEFAULT_ROMFS)
    ap.add_argument("--backdrop", default="world", choices=["world", "pane", "black"])
    ap.add_argument("--green-view", default="height", choices=["height", "grid"])
    ap.add_argument("--plaid-origin", default="centre", choices=["centre"] + ["cup%d" % k for k in range(6)])
    ap.add_argument("--no-green", action="store_true")
    ap.add_argument("--no-grid", action="store_true", help="leave P_MapGreenGrid's plaid off the overview")
    ap.add_argument("--no-compare", action="store_true")
    ap.add_argument("--ss", type=int, default=0, help="supersamples per axis (0 = auto)")
    ap.add_argument("--jobs", type=int, default=1, help="holes rendered at once")
    ap.add_argument("--derive-backdrop", action="store_true", help="derive the world backdrop from the capture stacks into tools/nss-map-backdrop.json, then stop")
    o = ap.parse_args()
    holes = sorted({int(x) for x in o.holes.split(",") if x})
    if not holes or any(h not in HOLES for h in holes): sys.exit("--holes: 1..21")
    if not os.path.isdir(o.romfs): sys.exit("no NSS RomFS at %s (--romfs <dir>: the dump's romfs, with Model/ Parameter/ Layout/)" % o.romfs)
    opt = {"romfs": os.path.abspath(o.romfs), "backdrop": o.backdrop, "green_view": o.green_view, "plaid_origin": o.plaid_origin,
           "no_green": o.no_green, "no_grid": o.no_grid, "no_compare": o.no_compare, "ss": o.ss}

    if o.derive_backdrop:
        t0 = time.time()
        res = dict(run_jobs(derive_hole, [{"hole": h, "opt": opt} for h in holes], o.jobs))
        missing = [h for h, r in res.items() if r is None]
        world, used, per = derive_backdrop(res)
        doc = {"_note": "The flat stand-ins tools/render-nss-maps.py --backdrop world composites the off-course minimap pane "
                        "over (linear RGB, after P_bg's dimming): NSS draws the pane translucent over the live 3D view, which "
                        "no file holds. Derived by `python -P tools/render-nss-maps.py --derive-backdrop` from the capture "
                        "stacks captures/derived/maps/hNN.png (median Switch tee frames): per off-course px (pane alpha < "
                        "0.99, outside the HUD and the window's border), est = (stack - alpha * pane) / (1 - alpha) in "
                        "linear light, sorted into ob / sea (filtered texel B > 0.8 G) / void (texel A >= 254); each "
                        "kind's value is the weighted median of est, weights 1 - alpha, pooled over the holes with at "
                        "least 200 px of it (perHole lists every hole's own), which minimises the summed |stack - "
                        "composite| over those px. A kind no hole has enough of falls back to ob.",
               "world": world, "used": used, "perHole": per, "holesWithoutStack": missing}
        with open(BACKDROP_JSON, "w", encoding="utf8", newline="\n") as f: f.write(json.dumps(doc, indent=1) + "\n")
        print("wrote %s in %.1f s: %s%s" % (os.path.relpath(BACKDROP_JSON, REPO).replace(os.sep, "/"), time.time() - t0,
              ", ".join("%s %s (%d holes, %d px)" % (k, world[k], len(used[k]["holes"]), used[k]["px"]) for k in ("ob", "sea", "void")),
              "; no stack for H%s" % ",".join(map(str, missing)) if missing else ""))
        return

    scales = sorted({int(s) for s in o.scales.split(",") if s})
    if not scales or any(s < 2 for s in scales): sys.exit("--scales: integers of 2 or more")
    out = os.path.abspath(o.out)
    for f in FORBIDDEN_OUT:
        f = os.path.normcase(os.path.abspath(f))
        if os.path.normcase(out) == f or os.path.normcase(out).startswith(f + os.sep): sys.exit("refusing to write into %s (the shipped / WSR renders)" % f)
    if o.backdrop == "world" and not os.path.exists(BACKDROP_JSON): sys.exit("no %s: run --derive-backdrop first" % BACKDROP_JSON)
    os.makedirs(out, exist_ok=True)
    opt.update({"out": out, "scales": scales})
    idx_path = os.path.join(out, "index.json")
    prev = {}
    try: prev = read_json(idx_path).get("holes", {})
    except Exception: prev = {}
    if not isinstance(prev, dict): prev = {}
    index = {"_note": INDEX_NOTE, "art": "nss", "renderer": "tools/render-nss-maps.py", "backdrop": o.backdrop, "greenView": o.green_view,
             "overviewGrid": not o.no_grid, "plaidTileM": PLAID_TILE_M, "plaidOrigin": o.plaid_origin, "scales": scales,
             "shader": {"map": "Glf_MiniMap Vec3 (1, 1, 1.2)", "green": "Glf_MiniMap Vec3 (1, 1, 1.25)" if o.green_view == "height" else "Glf_MiniMapGreen plaid"},
             "world": read_json(BACKDROP_JSON)["world"] if o.backdrop == "world" else None,
             "holes": {}}
    done = dict(prev)
    def write_index():
        index["holes"] = {str(h): done[str(h)] for h in sorted(int(k) for k in done)}
        with open(idx_path, "w", encoding="utf8", newline="\n") as f: f.write(json.dumps(index, indent=1) + "\n")
    for h, entry, msg in run_jobs(render_hole, [{"hole": h, "opt": opt} for h in holes], o.jobs):
        done[str(h)] = entry
        print(msg, flush=True)
        write_index()
    write_index()

if __name__ == "__main__":
    main()
