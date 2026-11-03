# WSR fairway stripes: how the mowing stripes on the fairway are painted (2026-11-03)

Read-only research on the extracted course archives
(`C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2`) and
`main.dol` (RZTE01, US Rev 1), verified live in Dolphin (the harness, instance
1) on holes 1 and 6. It follows `wsr-green-plaid.md`, the green's checkerboard.
Everything here is **Wii Sports Resort's**. Units: 1 u = 0.1 m, the course
frame (+x east, −z north on the minimap).

Files beside this note in `wsr-fairway-stripes/`:
- `code/`: the asset readers, the RAM diff, the screen masks and the minimap
  registration (each script's header says what it does), and the Dolphin
  experiment server (`server.mjs`, `prelude.js`, `edits.js`, `c.mjs`).
- `assets/`: what the readers print.
- `dolphin/`: the RAM diffs and the measurements.
- `img/`: screenshots and renders (JPEG).

## Summary

The fairway is the opposite of the green. Its stripes are **baked into the
course model** and **nothing at runtime touches them**.

- **The pattern.** A 64×8 texture, `glf_fairway_line1`, is half black and half
  white along s. The fairway mesh maps it through its own second UV set (uv1),
  which the artists laid out per hole along each fairway. So the stripes run
  **lengthwise and bend with the fairway** (H3, H6, H14, H20: `img/predicted-bands.jpg`).
- **The width.** It is the hole's UV scale, not a unit. Fairways have a median
  stripe of **5.4 m** (2.96–7.01 m by hole). The small fairway patches (H2, H8,
  H11, H13, H17, H21) run 3.0–4.0 m, and the tee pads (M_Fairway too) about
  **2.7 m** (1.8–3.3).
- **The tees.** On all 19 tees checked, the ball sits mid-stripe in the
  flat-grey band (below), within about 0.4 m of its centre line.
- **Nothing moves.** `main.dol` has no "M_Fairway" string. The fairway's
  stripe layers, UVs and textures stay byte-identical to the disk file in RAM:
  at hole start, in flight, at rest and at the next address (H1), and at H6's
  tee. The stripes cannot shift between strokes the way the green's plaid does.
- **The 3D colour.** A white texel shows the lit vertex colour. A black texel
  shows a **flat grey 160/255 that no light reaches**. So which band looks
  lighter depends on the lighting, and the contrast is a few levels:
  - At H1's address the lit band is lighter on 80 % of the fairway (median +2.9 levels).
  - At H6's tee it is darker on 80 % (median −3.7).
- **The minimap.** It uses the same stripe UVs with its own texture
  `glfM_MapLine1`, **turned 180°**. Its bright stripe (+20 levels) therefore
  falls on the 3D course's flat-grey band, and its dim stripe (+5) on the lit
  band. Checked on screen: 99.4 % of H1's zoomed minimap and 95.2 % of H6's
  overview follow this phase, against 0.6 % / 4.8 % for the unflipped one.

## The assets

The material `M_Fairway` is identical on all 21 holes, in the course model and
in the minimap model: the same textures by SHA-1, SRTs, TEV program and
registers (`assets/census.txt`). Only the meshes differ: their UVs and their
vertex colours.

**Course model** (`glf_course_<id>.brres`), 5 layers, 5 TEV stages
(`assets/m_fairway-h01.txt`):

| layer | texture | texcoord | SRT | role |
|---|---|---|---|---|
| 0 | `glf_fairway1` 512² CMPR, 5 mips | uv0 | identity | the grass |
| 1 | `glf_fairway_line1` 64×8 I4 | **uv1** | identity | **the stripes** (s < 0.5 black, s ≥ 0.5 white; constant in t) |
| 2 | `glf_JimenGara2` 128² | uv0 | ×0.03, −43°, (2.1, −0.2) | a ground mottle, about 148 m a repeat |
| 3, 4 | `projection_1`, `projection_2` | position, projection | identity in the file | runtime render targets (below) |

- The TEV program, `out = d + lerp(a, b; c)` (`code/census.mjs` prints it):
  0. `L = lerp(c0, ras; line)`: a white texel gives the rasterised colour, a
     black one c0 = (160, 160, 160).
  1. `lerp(c1, grass; L) = grass·L + (10, 40, 50)/255·(1 − L)`: the grass
     scaled by L, with a dark teal floor.
  2. `× 2 · JimenGara2`.
  3. and 4. `× (1 − projection)` each, toward k3 = black.
- `ras` is lit (`assets/light-channels-h01.txt`):
  - Channel 0 is the vertex colour × the scene's lights (lighting on, lightSet 0). The file's ambient register is 0; the light set may supply one.
  - The vertex colours are greyscale baked shading, per-hole medians 161–229 of 255 (`assets/vertex-colours.txt`).
  - So the white-texel band carries the shading and the sun, and the black-texel band is flat.
- uv0, the grass, is a world-aligned planar tile (`assets/uv-fit.txt`):
  4.44 m a repeat on 12 holes, 3.0 m (H10, H14) to 5.7 m (H15) on the others.
  H4's is not quite planar.
- uv1, the stripes, is not planar. Over the 21 holes the stripe direction
  turns more than 20° from the hole's mean on 0–93 % of the fairway area
  (H14 93 %, H20 82 %, H16 68 %, H6 64 %). The straight holes (H1, H2, H10,
  H13, H17) turn on 0 %. H10's uv1 is exactly planar (a single 123 u repeat,
  angles within 0.1°). See `assets/widths.txt`.

**Minimap model** (`glf_map_<id>.brres`), 2 layers:
- `colour = glfM_MapFairway1 + (20/255) · glfM_MapLine1'`, unlit (lighting
  off, lightSet −1; stage 0 ignores the vertex colour).
- `glfM_MapLine1` is the same split at 68 and 255, so +5.3 and +20 levels.
- Its SRT turns it 180°, s → 1 − s. The bright half lands where the course's
  texture is black.
- The minimap mesh's uv1 statistics equal the course's on 15 holes and
  differ slightly on H1, H5, H7, H8, H16 and H21 (`assets/uv-fit.txt`; at H1's
  tee the two meshes read s fractions 0.249 and 0.277).
- `tools/render-maps.mjs` already draws the minimap's stripes from this layer
  (stage 1, "+ c0 × layer 2").

Nothing in the files animates the fairway: the SRT0 animations of all 21 holes
touch only `M_Sea`, `M_XNamiuchi`, `M_River`, `M_Lake`, `M_RSnami` and the
`mt_ze_w_nami` waves, and there is no CLR0.

## The code

- **No lookup.** `main.dol` holds no "M_Fairway" and no fairway texture name
  (`assets/dol-strings.txt`). The only material name the search finds is
  "M_Green", twice: golf at 0x8067b648 and Frisbee Golf at 0x80664910. The
  fairway strings it does hold, `WS2_glf_fairway_shot` and
  `WS2_glf_fairway_bound`, look like effect names.
- **What changes in RAM against the disk file**, on all ground materials alike
  (`dolphin/ram-vs-disk-h01.txt`, `-h06.txt`):
  - the g3d load-time binding: the texture-setup display list (+0x40–0xe0),
    the texture object pointers (+0x420…) and the objects' vertex-array
    pointers;
  - konst k3's alpha set to 80 (TEV-colour list +0x59e: BP 0xe6 0x800000 →
    0x850000). M_Fairway uses only k3's colour (black), never its alpha;
  - the projection layers' effect blocks, rewritten as camRef −1, mapMode 5
    with the game's own matrices.

  The stripe layers 0–2, their SRTs and effect blocks, c0 / c1, the UV arrays
  and the textures equal the file.
- **The projection layers**, written every frame and identical on every ground
  material (`dolphin/projections-h01.txt`):
  - Both are parallel projections along one direction, (0.55, −0.71, −0.44):
    light 45° above the horizon, from the south-west.
  - Layer 3 (`projection_1`) is a 2.2 m patch that follows the player. With
    the ball at rest 174 yd away it was still at the tee (within 1 m of the
    tee's spot); at the next address it was beside the ball. That fits the
    Mii's shadow.
  - Layer 4 (`projection_2`) is a 500 m patch, re-centred as the view changes:
    about 140 m ahead of the tee at the tee, about 27 m from the cup at the address.
  - Neither image was decoded. Both darken the ground (× (1 − texel)), so they
    are shadows of something; layer 4's caster is not identified.

## Live check (Dolphin, 2026-11-03)

Genuine injected shots from the harness's tee saves. The whole course and
minimap BRRES were read from RAM (course at 0x92be2f20, minimap at
0x92cf80a0 on H1; heap addresses that change by save) and diffed against the
disk files and against each other (`code/diff.mjs`).

- **A stroke (H1).** A driver at 0.67 from the tee came to rest on the fairway
  174 yd from the pin (`dolphin/h01a-play.json`). The BRRES were dumped at the
  tee, at the hand-off (in flight), at rest, 3 s later and at the next address.
  - Between any two of them only these changed (`dolphin/stroke-h01.txt`):
    - the projection layers' matrices;
    - the water's SRT;
    - M_Green's plaid matrix at the address, on the course and the minimap,
      as `wsr-green-plaid.md` decodes.
  - M_Fairway's stripe layers, the UVs and every texture were byte-identical
    throughout. H6's tee matched its disk file the same way.
- **The texture is the stripes.**
  - With the CPU halted, `glf_fairway_line1`'s 256 bytes were overwritten in
    RAM: first all 0xFF, then all 0x00, then the original back. Dolphin re-hashes
    textures (`SafeTextureCacheColorSamples = 0`).
  - Either fill removes the stripes from the 3D view
    (`img/h01-address-edits.jpg`), and the restore brings them back.
  - Comparing each pixel of the normal frame with the two filled frames
    sorts the screen into the two bands (`img/h01-address-mask.jpg`,
    `img/h06-tee-mask.jpg`; `code/mask.py`).
- **The phase on the ground.**
  - The mesh puts the H1 ball at rest at uv1 s = 2.9728: in the white-texel
    band, 0.33 m from its east edge, the band running 5.6 m west
    (`dolphin/ball-bands.txt`). On screen the ball is in that band, with the
    edge just to its right.
  - At H6's tee the mesh puts the ball mid-band in the black-texel band
    (13.25 / 13.5 u to the edges). On screen the ball is centred in the middle
    stripe of the pad.
- **The minimap.**
  - `glfM_MapLine1` was filled the same way (all 0x44, all 0xFF) and the
    panel's band mask registered against the minimap mesh's predicted bands
    (`code/cls.mjs`, `code/reg.py`: screen = k · map px + offset, north-up).
  - H1's address (zoomed): k = 5.64; 99.4 % of the mask's pixels agree with
    the 180° phase, 0.6 % with the unturned one.
  - H6's tee (overview): k = 2.50, 95.2 % against 4.8 %. The S-bend's curved
    stripes are reproduced (`img/minimap-overlays.jpg`: the predicted band
    edges in magenta over both panels). The 2.50 overview scale blurs the
    stripe edges, which costs the missing few per cent.
  - The fitted positions put the H1 ball at the player arrow.
- **Lighting.** Over the 3D band masks, the lit band minus the flat band:
  - H1's address: median +2.9 levels (5–95 %: −5.4 to +8.4), lighter on 80 % of pixels;
  - H6's tee: median −3.7 (−13.1 to +8.6), lighter on 19.5 %.

  On H6's tee the minimap therefore shows the same light/dark as the 3D view.
  On H1's fairway it shows the opposite.

## Comparison with the green

| | green (`wsr-green-plaid.md`) | fairway |
|---|---|---|
| mapping | a top-down projection the code builds | the mesh's uv1, authored per hole |
| when it changes | at hole start and at each stroke's setup | never |
| orientation | one stripe set along ball → cup | lengthwise, along the fairway's own bends |
| width | exactly 1 yd | 5.4 m median, 3.0–7.0 m by hole; tee pads about 2.7 m |
| anchor | the cup at the centre of the lightest square | the tee in the middle of a flat-grey band |
| minimap | the same matrix, bit-identical | the same UVs, the texture turned 180° |

So a fairway stripe tells you nothing about distance or line. Its edges are
fixed in the world for the whole hole and could serve as landmarks.

## Checking the same in another game or emulator

1. Find the fairway material. Does the stripe layer read a UV set or position
   (a projection)? Is its matrix identity in the file, and does the
   executable reference the material by name?
2. Diff the loaded model in RAM against the file, at hole start and around a
   stroke. A runtime-placed pattern shows up as a written matrix; a baked one
   never moves.
3. Overwrite the stripe texture in RAM (all white, all black) and screenshot.
   The difference proves the asset, and the per-pixel compare gives the bands
   on screen. Check the ball's band against the mesh's prediction at its
   position.
4. Do the same on the minimap and register it. A square or 180° turn of the
   texture only shows as a phase flip, so score both phases.

For Nintendo Switch Sports: its minimap art is a baked capture texture
(`tools/render-nss-maps.py`, MiniMap BC3), so the minimap's fairway stripes
are in that image. The 3D field model's fairway material has not been looked at.
