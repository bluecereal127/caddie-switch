# NSS green plaid: how Nintendo Switch Sports paints the checkerboard on the green (2026-11-03)

The NSS counterpart of `wsr-green-plaid.md`, following its last section. Nintendo Switch Sports 1.5.0 in Eden
(Vulkan), local play, one Random 3-hole round; the decodes from the dump's RomFS and main NSO
(`tools/harness/state/eden/nss-romfs/`). NSS units: metres, the hole frame (+x east, +y up, -z toward the minimap's
north); map bearings are north-up and clockwise (hole 13's map is turned 0.1256 deg from the NSS world).

**Status (handoff version):**
- The black-box test is done and verified.
- The asset decode is done. It has not been reviewed yet.
- Still pending:
  - The code decode: which function writes the matrices, its constants and callers, and where it lives in RAM.
  - A live RAM check of the matrices at a rest and at the next address.
  - An Opus review.
- They will be added to this file.

Files beside this note in `nss-green-plaid/`:
- `img/` holds the Eden frames as JPEG.
- `eden/` holds the test's scripts and records:
  - `teeshot.mjs`: plans and plays a stroke.
  - `rollto.py`: the memory-write hold.
  - `mmplaid.py` / `mmangle.py`: the minimap fits.
  - `persp3d.py`: the 3D period.
  - `aimtest.sh`.
  - The stroke records `h13s*.json`.

Working copies and every frame are in `tools/harness/state/eden/lab/plaid/` (git-ignored):
- `eden/`: frames.
- `assets/`: the asset decoder's scripts, dumps and the textures as PNG.
- `BLACKBOX.md`: the full measurement notes.

## Summary

NSS does what WSR does: the game itself lays a top-down projection of the plaid on the green, **centred on the cup in
play and turned so one set of stripes runs along the ball→cup line**, on the 3D green and on the minimap alike. It is
rebuilt at each stroke's setup (between the rest and the next address, for a chip as for a putt), not while the ball
rests and not while aiming. Two things differ from WSR:

- **A stripe is 1 m** (a tile, one light and one dark stripe, is 2.0 m). WSR's is 1 yd.
- **The cup sits at the centre of the darkest square.** WSR's sits on the lightest.

At the address the ball sits mid-stripe in the stripe that runs to the cup, so counting stripes from the ball to the
cup reads the distance in metres. Along the line the ball sits wherever its distance puts it.

## The black-box test (Eden, hole 13, par 3, cup 0, wind 5 m/s)

Each stroke was played through the robot's pieces: the planner, the virtual Joy-Con, the closed-loop aim. Frames
were grabbed every ~0.5 s from the swing to the next address with RAM's ball on each, without pressing A. Strokes 3
and 4 were made to rest at designed spots by a memory write (the user allowed it for tests in Eden): `rollto.py`
holds the ball's physics state from the stroke's launch until the game rests it there (~0.55 s). Writing a ball that
is already at rest moves nothing on screen.

| stroke | how | rest (NSS x, z) | ball→cup line (RAM) | to the cup |
|---|---|---|---|---|
| 1 | tee shot, 5-iron 70 %, planned to stop NE of the cup | (-22.6297, -135.8835) | 225.818 | 5.987 m |
| 2 | putt 33 % at 267.8 (the putter assist pulled it to 0.3057) | (-29.3891, -134.7793) | 141.322 | 3.950 m |
| 3 | putt held at a designed spot | (-30.4419, -128.1581) | 45.000 | 5.000 m = 2.5 tiles |
| 4 | putt held on the fairway | (-35.3561, -138.7536) | 130.000 | 11.000 m (a chip next) |

The game auto-aims every address at the cup (RAM's aim equals the line to 1e-4 deg).

- **At rest vs at the address (3D).**
  - At rest the roll camera faces the stroke's own direction (about 350 for the tee shot, 268 / 300 / 230 for the
    putts). Its stripes follow the PREVIOUS stroke's line: along the view after the tee shot, whose camera faces near
    the tee line 348, and oblique after the putts.
  - After the "Stroke N" banner the address camera looks along the new line, and the stripes run along it.
  - The ball's place moved with the turn. Stroke 1's rest sat inside a light square near its far edge
    (`img/h13-s1-rest.jpg`); at the address it is centred in the dark stripe running to the cup
    (`img/h13-s2-address.jpg`). After stroke 2 the old plaid runs oblique to the roll camera (`img/h13-s2-rest.jpg`).
- **Aiming.** Turned 40 deg either side at three addresses, the aim moves neither the minimap plaid nor the 3D plaid.
  The 3D stripes then run oblique to the turned view (`img/h13-s2-aim-centre-left-right.jpg`).
- **The minimap at the address** (`eden/mmplaid.py`, `eden/mmangle.py`, `img/h13-s4-minimap-fit.jpg`).
  - The ball is where the aim lines of four aim frames cross; the cup is the black disc on the ±40 deg frames, where
    the line doesn't cover it.
  - The scale comes from RAM's distance.
  - Phase 0 is the centre of a light stripe, 0.5 the centre of a dark one (luminance).

  | address | fitted angle (free) | line (RAM) | period | px / m | tile | cup phase (along, across) | ball phase (along, across) |
  |---|---|---|---|---|---|---|---|
  | 2 (5.987 m) | 225.70 | 225.818 | 49.59 px | 24.83 | 1.996 m | 0.497, 0.509 | 0.498, 0.479 |
  | 3 (3.950 m) | 141.38 | 141.322 | 49.51 px | 24.85-24.90 | 1.990-1.996 m | 0.493, 0.484 | 0.510, 0.515 |
  | 4 (5.000 m) | 44.88 | 45.000 | 49.76 px | 24.90 | 1.998 m | 0.490, 0.511 | 0.988, 0.472 |
  | 5 (11 m, chip, mid zoom) | 130.04 | 130.000 | 29.28 px | ~14.7 | ~2.0 m | | |

  - The plaid is turned onto the line, within 0.04-0.12 deg.
  - The tile is 2.0 m.
  - The cup sits at the darkest square's centre, within 0.01 of a period.
  - The ball is centred across, within 0.03 of a period.
  - At 2.5 tiles the ball is on a light stripe's centre along the line (0.988). So the plaid is anchored on the cup,
    not the ball.
  - The putting zoom is the same at every address: 24.85 px/m on a 1280x720 grab.
- **The 3D period** (`eden/persp3d.py`). On the address frames the camera sits on the line. The band edges on the
  screen column through the ball and the cup were fitted with y = yh + K / (s + D), for cup-centred stripes of width w,
  with the cup at s = d and the ball's ground contact at s = 0.
  - The fits give w = 1.008 m (5.000 m, rms 0.73 px), 1.008 m (3.950 m, 0.67 px) and 1.016 m (5.987 m, 1.64 px).
  - The cup's band is dark on every frame. So the 3D plaid is the minimap's: 1 m stripes, the cup on the darkest square.
- **The chip** (`img/h13-s5-chip-address.jpg`). At the fairway address the minimap's green plaid is turned onto the
  130 deg line too (0.04 deg), and the 3D stripes on the green run toward the flag. The setup re-aims it for every
  stroke.

## The assets (the dump's RomFS; decoded by a Sonnet agent, not yet reviewed)

### 3D green: material `Glf_Green_M`

The material is in `Model/Fld_GolfCourseNN.bfres.zs`, on the shape `BGOBJ_GREENnn` and the six cup covers
`BGOBJ_GolfCoursennHoleCover0..5`: 7 FMATs a hole, each with its own parameter block. Its shading model is
`ElsaUberPatch` from `ElsaUber.bfsha`, in `Model/Fld_GolfCourseNN.product.Nin_NX_NVN.sarc.zs`.

- **No UVs reach it.** ElsaUberPatch declares only the attributes `_p0 _n0 _t0`. The mesh's `_u0` (a planar map,
  3.6-4.0 m a UV) and `_u1` (lightmap-like) are never read.
- **The texcoord is a world projection** (the decoder's own SASS read of the compiled vertex shader, 7 of 12
  variations):

      (X, Y, Z) = ShpMtx · position                 (world)
      u = X·Mat[0x20] + Z·Mat[0x28] + Mat[0x30]
      v = X·Mat[0x24] + Z·Mat[0x2c] + Mat[0x34]     (Mat = the gsys_material uniform block)

  Mat+0x20..0x34 is `tex_mtx0`. The fragment shader fetches `Glf_GreenA_Alb / _Nrm / _Rgh` at (u, v). Height is
  ignored, as in WSR. The material's options agree: `sample_texcoord0_mapping 100` means "world X, Z through
  tex_mtx<srt>", used also by the turf paintees and the water. The decoder did not decode the sign modifier bits, so
  the signs are unverified.
- **The file leaves it to the runtime.** `tex_mtx0` is an identity TexSrt (mode 0, scale 1, rotate 0, translate 0) in
  all 147 green and cover FMATs (FMAT parameter offset 516, 24 bytes).
  - As shipped it would give a world-aligned 0.5 m tile.
  - The runtime must set the period, angle and phase: a 2 m tile is a scale of 0.25 UV/m.
  - `user_color` (Mat+0x100, file 0) is also free: the fragment shader ends with
    `rgb = mix(rgb, user_color.rgb, user_color.a)`. It is probably the Terrain view's fade (inferred).
- **The texture** `Glf_GreenA_Alb` (in `Model/ShareTex_BG.bfres.zs`) is 512² BC1 sRGB, a plaid of period 256 texels
  (0.5 UV).
  - The darkest squares' centres sit at UV (0, 0) + 0.5k, the lightest at (0.25, 0.25) + 0.5k.
  - The cup on the darkest square means the cup maps to a UV of 0 (mod 0.5).
  - `_Rgh` carries the same plaid faintly; `_Nrm` none.
- **Not the plaid.**
  - The elsa turf system (`elsa_enable_turf*`, `elsa_turf_*`, `TurfRendererDummy_Paint`) is OFF on the green: every
    turf option is 0.
  - On the turf paintees (`Glf_Rough_M`) the paint is fetched through a world-XZ projection scaled and offset from the
    environment block (set by the turf renderer), with no rotation.
- No parameter file names a plaid, stripe, checker, mowing or period. The decoder searched every BYML / bgyml in the
  RomFS.

### Minimap: pane `P_MapGreenGrid`

The pane is in `Layout/LGlfMiniMap.Nin_NX_NVN.blarc.zs`, `blyt/LGlfMiniMap.bflyt`: 460x460, material 23. Its chain is
RootPane > N_All > S_Scissor > N_MapS > N_MapRT > N_MapGreenRT > N_MapGreenS > P_MapGreenGrid, all translate 0,
rotate 0, scale 1 in the file.

- **Texture maps.**
  - Texture map 0 is `Cmn_Dummy^r`, the green capture at runtime; it gives only the mask, 1 - alpha.
  - Texture map 1 is the plaid `Glf_MiniMapGreen^o`: 128² BC1 sRGB, repeat, exactly one tile. Its lightest square
    is at UV (0, 0) and its darkest centred at (0.5, 0.5), half a tile out of phase with the 3D texture.
- **The shader** `bgsh/Glf_MiniMapGreen.glsl` samples the plaid at `nwTextureCoord1`: the pane's own unit-square
  texcoord through texture SRT 1. It uses no world position and no uniform of its own.
- **Texture SRT 1.**
  - In the file: translate (0, 0), rotate 0, scale (25, 25).
  - `anim/LGlfMiniMap_TypeHoleNum.bflan` animates its scale per hole (frame = hole - 1) to GreenAreaSize / 2 (25,
    22.5, … 15). The pane spans the green capture, so a tile is GreenAreaSize / (GreenAreaSize / 2) = **2 m on every
    hole**, the 1.98-2.00 m the minimap verifier measured.
- **What the runtime sets.** Nothing in the layout rotates or translates the plaid. The turn and the cup-centred phase
  seen in Eden must therefore be written at runtime, most likely into texture SRT 1 (rotating the pane would turn the
  capture's mask with it).

## The code (main NSO): in progress

A Sonnet agent is decoding it, and the live RAM check follows its report. Leads:

- **Minimap.**
  - `L_MiniMap/P_MapGreenGrid` (0x2e089fe) is used at 0x1c1bba4 and 0x1c1c338. At 0x1c1c334..0x1c1c360 the minimap
    layout's init looks the pane up (vtable +0x3a0), passes it to `bl 0x185d840` and keeps the result at
    [this+0x440]: probably the handle the plaid's SRT is written through.
  - Also `N_MapGreenRT` (0x1c1c314), `P_MapGreen` (0x1c1b114), `N_MapGreenS` (0x1c1c2f0).
- **3D.** Look for the writer of `tex_mtx0` (6 floats at Mat+0x20) on the seven green FMATs.
  - Expected for a 2 m tile: rows of length 0.25, one along the ball→cup direction, with the cup mapped to 0 mod 0.5.
  - The material's GPU uniform block (gsys_material, 0x290 bytes) is in guest memory, so the written matrix can be
    read from Eden.
- **Not the writer.** The `Proc*` names (ProcTextureTileChecker, ProcTurfRenderer, ProcTurfPreview, ProcComposeGreen
  at 0xece488..0xece5e0) and the turf renderer (0x1e4e000-0x1e50000) are leads already looked at; the turf is off on
  the green.

## What would change in the app

The change is cosmetic, and no physics depends on it. `tools/render-nss-maps.py --plaid-origin` today puts a tile
centre on the green area's centre, north-up. NSS's own pattern is:

- a 2 m tile;
- the DARKEST square's centre on the cup in play;
- turned onto the line from the ball to the cup.

The minimap's plaid is the same pattern. So a render that wants the game's look for a given ball turns the plaid to
that ball's line and puts the darkest square on the cup. A static overview has no ball: the tee's line (GlfTeeOBJ →
cup) is what the game shows at the tee address.

## Checking it further

- **The live RAM check.** Read the 3D green's `tex_mtx0` (each of the 7 FMATs' uniform blocks) and the minimap
  plaid's SRT. Do it at a rest (the old line) and at the next address (the new one), and against the expected rows
  0.25 · (direction along / across the line) with the cup → 0 (mod 0.5). This confirms the period, the phase and
  when the write happens.
- **A second hole and cup.** Hole 13's cup 0 only, so far.
- **Online.** Not looked at: whether the platform's tee shot or a multi-player green shows the same thing.
