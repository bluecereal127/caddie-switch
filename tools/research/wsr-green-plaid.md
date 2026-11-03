# WSR green plaid: how the checkerboard on the green is painted (2026-11-03)

Read-only research on `C:/Users/Stephen/Downloads/WSR_Extract/DATA/sys/main.dol`
(RZTE01, US Rev 1) and the extracted course archives, verified live in Dolphin
(the harness, instance 1) on holes 2 and 11. Everything here is **Wii Sports
Resort's**; whether Nintendo Switch Sports does the same is the open question
of the last section. Units: 1 u = 0.1 m, 9.144 u/yd (the course frame).

Files beside this note in `wsr-green-plaid/`: `code/` (the disassembly listings,
`dol.py` + `ppcdis.py` (capstone, PowerPC BE), `expected.py` (the matrix from a
cup and a ball), `dump-green.mjs` (the green material per hole)), `dolphin/`
(the RAM records of every rest, `st.py` (a point's texture coords and square)),
`img/` (screenshots, JPEG).

## Summary

The checkerboard ("plaid") on a WSR green is not in the course model's texture
mapping. The game builds a top-down projection itself, **centred on the cup in
play and turned so one set of stripes runs along the ball→cup line**, and writes
it into the green material of both the 3D course and the minimap. It is rebuilt
**at hole start and at the setup of every stroke** (about 3 s after the ball
stops), and at no other time: not during the flight or roll, not while aiming,
not in the Zoom or Terrain views. So between the ball coming to rest and the
next address the pattern turns about the cup to face the ball's new line, and
the ball's place in the pattern jumps (4 of 4 rests).

- A stripe is exactly **1 yd** (one texture repeat = 18.288 u = 2 yd).
- The cup sits at the **centre of the lightest square**.
- At address the ball sits on the **centre line of the stripe that runs to the
  cup**, and each square along that line is 1 yd: counting squares from the ball
  to the cup reads the distance in yards (a built-in putting aid).

## The assets

All 21 course models (`glf_course_<id>.brres`) carry the same green material
`M_Green` (`code/dump-green.mjs`):

| layer | texture | texcoord | effect (camRef, mapMode) | SRT | wrap | role |
|---|---|---|---|---|---|---|
| 0 | `glf_green1` 256² CMPR, 5 mips | position, projection texgen | 0, 2 (projection) | identity | repeat | **the plaid** |
| 1 | `glf_tokosenFix` / `Fix2` (8×256, 12 bands) | vertex uv1 (height) | none | identity | | contour ramp (Terrain view) |
| 2 | `glf_hole1` 64² (black disc) | position, projection | 0, 2 | ×10 | clamp | the cup |
| 3 | `WS2_dgl_goal2` | position, projection | 0, 2 | identity | clamp | Frisbee Golf's target, muted in golf (konst k1 = 0) |
| 4, 5 | `projection_1`, `projection_3` | position, projection | 0, 2 | identity | clamp | runtime render targets (0x804029f0) |

- The effect matrices in the file are identity, so the file alone does not place
  the plaid. The mesh's uv0 (15–160 u per repeat, varying by hole) is never read
  by `M_Green`; `tools/render-maps.mjs` used it as a stand-in (wrong period,
  fixed orientation).
- `glf_green1`'s quadrants: s, t < 0.5 darkest (RGB 76, 175, 30); s, t ≥ 0.5
  lightest (102, 195, 39); the two others about 88, 182, 33. Two sets of
  light/dark stripes crossing, as a mower would leave.
- The minimap model (`glf_map_<id>.brres`) has its own `M_Green`: `glfM_MapGreen1`
  (64², the same 2×2 plaid) set up the same way. It shares the course frame.
- Every `glf_scene_<id>` SCN0 holds an orthographic top-down camera
  `camera1Green_siba` ((0, 100, 0) aimed at the origin, ortho height 25, constant,
  identical on all holes). It is **not** what places the plaid (the code below
  writes the matrix directly); its role is unknown. Nothing in the files animates
  any green: the SRT0 / CLR0 animations touch only water and waves.

## The code (main.dol)

Register bases: r2 = 0x806fe080, r13 = 0x806f8120.

- **0x80402080** (thunk 0x804022bc), `code/L_func1_checker_80402080.txt`:
  1. Looks up "M_Green" (the name via `lwz -0x6800(r13)`) in the course model
     and in the minimap model (0x8021b210; results r30, r31).
  2. Builds `C_MTXLightOrtho` (0x8003f380) with t = X, b = −X, l = X, r = −X,
     scale 1, trans 0.75. X = the float at **0x806f5484 = 18.288**
     (0x41924dd3, set once by the static initialiser 0x8040445c).
  3. Takes v = the unit 2D vector from the ball to the cup. Ball B = player+0x98,
     player = `*(*(0x806f5468)+0x664)`. Cup A = `*(*(course+0x3c)+0x4c)`,
     course = `*(0x806f5480)`. It skips everything when the two coincide.
  4. Builds a view with rows (−vz, 0, vx), (vx, 0, vz), (0, 1, 0) about A,
     concatenates ortho × view, and writes the 3×4 result into
     `[r30+0x4c]` and `[r31+0x4c]` (0x80402190, 0x804021a0). Then it sets the
     flag 0x400 on both.
- **Result.** For a ground point P, with y' = v·(P − A) along ball→cup and
  x' = (−vz, vx)·(P − A) across it:

      s = 0.75 − x'/X,   t = 0.75 + y'/X   (height ignored, q = 1)

  One texture repeat is X = 2 yd, so a stripe is 1 yd. The cup lands at
  (0.75, 0.75), the lightest square's centre. The ball has x' = 0, so s = 0.75.
  `code/expected.py Ax Ay Az Bx By Bz` prints the matrix.
- **When it runs.** Only from 0x803feb88 inside 0x803feb54, when its r4 = 0.
  That happens from 0x803ff268 (hole start) and from 0x803ff170 (the next
  stroke's setup, argument 0; seen live returning to 0x803ff250). A restore
  with a non-zero argument does not re-aim it.
- **The cup disc**: 0x804021d4, once at hole setup. It builds its own LightOrtho
  (X2 = 32.5, trans 0.05 / 0.95) about the cup object and writes it to
  `[M_Green+0x54]` (layer 2).
- **The Terrain view (button 1)**: 0x80401d6c, every frame. `course+0x8c` is
  the toggle and `course+0x90` a fade stepped by 0.08 a frame. It moves the
  colour at material+0x14..0x17 of both M_Green between white and (30, 60, 90).
  That is the konst blending the contour ramp over the plaid: the plaid fades
  out and the bands fade in. It never touches the plaid's matrix.
- Not found: the g3d reader that turns {camRef 0, mapMode 2} plus the effect
  matrix into the GX texture matrix. The screens below show the drawn plaid
  follows the written matrix and not the view camera.

## Live check (Dolphin, 2026-11-03)

Genuine injected shots from the harness's tee saves, breakpoints on the
function, the matrices read from RAM (`dolphin/`). On H2 the course matrix sat at
0x92be5714 and the minimap's at 0x92cf4b34; these are heap addresses and change
by save.

- **X.** 0x806f5484 = 18.288 (0x41924dd3).
- **Calls.** One per stroke, at the next stroke's setup, about 3.0–3.1 s after
  the ball stopped, with the old club still selected and player+0x98 already
  equal to the ball. None during the flight or roll (armed from hand-off to
  rest), none while turning the aim about 140°, none in the Zoom or Terrain
  views.
- **Values.**
  - The matrix at rest is still the tee's: on H2 at the tee, rows
    (−0.0531564, 0, 0.0128206, 20.298891) and (−0.0128206, 0, −0.0531564,
    −39.770199), the tee→cup line at a bearing of 13.56°.
  - `expected.py` reproduces RAM to 1e-6 on all 5 setups seen.
  - The course and minimap matrices were bit-identical at every read.
- **Shift.** From the RAM matrices (`dolphin/st.py`; the offset is the fraction
  of a square from its nearest edge, across / along):

  | rest | ball (x, z) u | at rest | at address | shift |
  |---|---|---|---|---|
  | H2 a | 220.82, −804.17 (due E of the cup) | darkest, 0.50 / 0.29 | mid, 0.50 / 0.36 | yes |
  | H2 b | 173.86, −778.26 (due S) | darkest, 0.16 / 0.26 | mid, 0.50 / 0.34 | yes |
  | H2 c | 171.57, −842.54 | mid, 0.25 / 0.37 | lightest, 0.50 / 0.30 | yes |
  | H11 a | 123.71, −381.54 (line about 32° N of W) | darkest, 0.46 / 0.22 (tee matrix by expected.py) | mid, 0.50 / 0.45 | yes |

  The ball's x and z were identical at rest and at address (y within 0.002 u).
- **On screen** (`img/`):
  - At rest (the roll camera) the plaid runs oblique and the ball sits where
    the RAM puts it (H2 b: near a square's edge).
  - At every address the stripes run along the aim line and the ball is
    mid-stripe (`h02b-address.jpg`).
  - Turning the aim swings the camera but the plaid stays fixed to the ground
    (`h02a-aim-left-centre-right.jpg`).
  - The Terrain view replaces the plaid with the height bands
    (`h02b-terrain.jpg`).
- **The minimap.**
  - From the tee the overview shows no plaid: a yard is 0.4–1.1 map px there,
    so the stripes filter into flat green.
  - At the address the minimap zooms onto the green, stays north-up, and the
    plaid is drawn (`minimap-tee-a-b.jpg`).
  - On H11 it is visibly turned about 30° on the north-up map, along the
    ball→cup line (`h11a-rest-and-minimap.jpg`). That is the on-screen proof
    that the drawn plaid follows the written matrix, not world axes.
  - On H2's putting minimap the period measures 42.5 px a repeat. The cup to
    the player arrow is 63.3 / 113.4 px for the 2.84 / 5.14 yd rests, against
    60.3 / 109.2 predicted for 1-yd stripes. The constant 3–4 px is the arrow's
    centre behind the ball. 1 m stripes would miss by 14 %, growing with
    distance.
  - The roll camera hides the HUD, so the minimap cannot be compared at rest.
- **Not done:** a pin change on one hole (the matrix uses the cup by
  construction).

## Checking the same logic in another game or emulator

The method, as it went here:

1. Find the green material in the model files. Does the plaid's texcoord come
   from UVs, or from position through a texture or effect matrix? An identity
   matrix in the file means the game sets it at runtime.
2. Search the executable for the material's name string and follow its
   references to the function that writes the matrix. An ortho or projection
   builder's constants give the period and the offset; its inputs (cup, ball)
   come from known RAM structures. Its callers tell when it runs.
3. Black-box (the user's test): play balls onto a par 3 green and note where
   each rests within the plaid. Then, at the putter address:
   - Did the pattern shift under the ball?
   - Is the ball centred in a stripe that runs to the cup?
   - Is the cup centred in a square?
   - Is a stripe 1 yd, 1 m or something else? (Measure it against a RAM
     distance.)
   - Does aiming move it?
   - Check the minimap the same way, with one ball→cup line diagonal to north,
     since an axis-aligned line cannot show the turn on a square plaid.

Leads for Nintendo Switch Sports (NSS 1.5.0):

- **Where the minimap plaid lives:** layout `LGlfMiniMap.bflyt`, pane
  `P_MapGreenGrid`, texture `Glf_MiniMapGreen^o` (128², repeat), tex SRT scale
  25 in the file. NSS's 3D green material has not been looked at.
- **What the NSS minimap verifier measured** (`tools/render-nss-maps.py`, header
  lines 27–38; the dump's `verify/maps/plaid-zoom.json`):
  - A tile of 1.98–2.00 m on six holes, against WSR's 2 yd = 1.83 m. If NSS's
    tile also holds two stripes, its stripes are 1 m: NSS would measure the
    plaid in metres where WSR used yards.
  - A phase that is not fixed in the world and differs between frames of one
    hole.
  - On H10, a tile centre on the cup in play across four cups; on the other
    holes, no anchor.

  A plaid re-aimed at every stroke, which a north-up fit cannot follow,
  explains all of it. Refit each frame with its own ball→cup orientation.
- **What would change in the app:** `tools/render-nss-maps.py --plaid-origin`
  (today: the green area's centre, north-up). That is cosmetic; no physics
  depends on it.
