# WSR green height map: how the Terrain view colours the green (2026-11-03)

Read-only research on Wii Sports Resort's game files: the extracted course
archives (`C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2`) and
`main.dol` (RZTE01, US Rev 1). There was no new Dolphin run. One cross-check
uses RAM dumps taken earlier the same day for `wsr-fairway-stripes.md`. It
follows `wsr-green-plaid.md` (the checkerboard) and `wsr-fairway-stripes.md`.
Units: 1 u = 0.1 m, the course frame.

The Terrain view is the green colouring the **1** button toggles: bands from
light (high) to dark (low), with a "High / Low" legend on the HUD
(`wsr-green-plaid/img/h02b-terrain.jpg`).

Files beside this note in `wsr-green-heightmap/`:
- `code/`: the asset readers, the code listings and `dol-constants.py` (each
  script's header says what it does).
- `assets/`: what they print.
- `img/`: `greens-ramp.jpg`, the 21 greens drawn in their bands with the cups;
  `ramps.jpg`, the two ramps.

## The answers

**Are the colours height compared with the fairway?** No.
- The colour is a property of the green mesh alone: each green vertex carries
  its own ramp coordinate.
- Neither the fairway's nor the fringe's height enters it, and neither surface
  is banded (only `M_Green` has the ramp layer).
- So a band says nothing about whether the green sits above or below the
  ground around it.

**Are they relative to the range of heights on the green?** Yes, on 15 of the
21 holes exactly.
- The ramp runs from the green's highest vertex (lightest band, t = 0) to its
  lowest (darkest band, t = 1), linearly in height.
- The ramp has 12 bands, or 14 on the holes with the second ramp. So **one
  band is that green's relief / 12 (or 14)**: 7 cm (H13) to 22 cm (H6).
- The same colour is a different height on every hole, and a band step is a
  different height difference on every hole.
- On the other six holes the scale is wider than the green, so its colours use
  only part of the ramp:
  - H10 and H14: a fixed 10 cm a band.
  - H1, H2, H12, H18: windows of 0.98–1.44 m, 8–12 cm a band. H1's 0.51 m green
    spans only 5.8 of its 12 bands.

**Are they relative to the cup?** No.
- The ramp coordinate is baked into the mesh, and nothing at runtime moves it:
  no code touches the ramp layer's transform, and RAM matches the file.
- So all six cups of a hole share one colouring. The 118 cup spots of the 21
  greens sit on every band from 1 to 14.
- Contrast the plaid, which the game re-centres on the cup in play at every
  stroke.

**Caveat: the bands are not always exact.**
- The render green is the collision green (vertex heights equal the KCL to
  0.1 mm at the 90th percentile on every hole), but some greens were reshaped
  after their ramp coordinates were made.
- On H4, H9 and H20, 37–43 % of the green is drawn one band off its true
  height, and up to 2.7 bands (about 0.6 m) at the worst spot on H9.
- H3, H5, H6 and H13 are off on 9–17 % of the green. The rest are within a
  fraction of a band.

## How it is drawn

**The material** (`assets/m_green-h01.txt`). `M_Green` is identical on all 21
holes, in the course model and the minimap model, apart from which ramp texture
it names (`assets/m_green-census.txt`).
- Layer 1 is the ramp. It is read through texcoord 1, which is the mesh's uv
  set 1 (texgen source row 6), with an identity SRT and no effect matrix.
  - Wrap is repeat in s and clamp in t, so a t outside 0–1 shows the end band.
  - It is filtered linearly, so a band edge blends over about one texel row
    (1/256 of t).
- The 3D course's TEV, in order:
  - stage 0: `2 · lerp(c0, plaid; lit vertex colour)`, the plaid lit, with
    c0 = (10, 0, 10);
  - stage 1: `lerp(ramp, stage 0; k2)`;
  - stage 2: the alpha × the cup disc (`glf_hole1`: alpha 0 inside the disc,
    255 outside), which the material's alpha test (final alpha ≥ 64) uses to
    cut the cup out of the green;
  - stages 3 and 4: Frisbee Golf's target, muted by k1 = 0;
  - stages 5 and 6: the projected shadows.
- **k2 is the switch.**
  - The file stores k2 = (30, 60, 90).
  - The game sets it to white in normal play, where stage 1 passes the plaid
    unchanged.
  - In the Terrain view k2 = (30, 60, 90) / 255, so the pixel is the ramp
    colour × (0.88, 0.76, 0.65) per R, G, B plus the lit plaid × (0.12, 0.24,
    0.35).
  - The bands themselves are unlit. Only the faint plaid in them carries
    lighting.
- The minimap's `M_Green`:
  - stage 0: the plaid tile (`glfM_MapGreen1`), unlit;
  - stage 1: the same `lerp(ramp, plaid; k2)` on the same uv set 1.

**The ramps** (`assets/ramps.txt`, `img/ramps.jpg`). Both are 8 × 256 texels,
every column identical, light at t = 0 and dark at t = 1.

- `glf_tokosenFix`: C4 with an RGB565 palette, **12 flat bands** of 21–22
  rows.

  | band | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|
  | RGB | 173,239,156 | 148,227,115 | 107,223,99 | 66,210,90 | 49,182,90 | 41,162,99 | 25,138,99 | 8,117,90 | 16,97,58 | 8,81,33 | 16,65,16 | 25,53,8 |
  | luma | 210 | 191 | 174 | 153 | 132 | 119 | 100 | 81 | 68 | 54 | 45 | 40 |

- `glf_tokosenFix2`: CMPR, **14 bands** of about 18.3 rows.
  - These are the same 12 colours plus a paler mint (210, 245, 202) above and
    a darker green (16, 36, 8) below.
  - DXT1 blocks leave 1–3-row transition runs at the band edges, which fall at
    rows 18, 37, 56, 74, 92, 110, 128, 146, 164, 182, 200, 219 and 238.
- The course models use Fix2 on H3, H5, H6, H8, H9, H13, H15, H16, H19 and
  H21, and Fix on the other 11.
- The minimap models do the same except on H3, whose minimap keeps the
  12-band Fix. H3's minimap bands are therefore 14 cm where its 3D bands are
  12 cm.

**The ramp coordinate** (`assets/uv1-vs-height.txt`, `assets/window.txt`):
- **t is a linear function of the vertex height alone.** Adding x and z to the
  fit does not help.
- On 15 holes the t = 0 and t = 1 heights are the green's own top and bottom.
- s is just as exact a linear function of one horizontal axis (x on some holes,
  z on others) and runs 0 → 1 across the green's width.
- Together these are the signature of a planar UV projection from the side,
  fitted to the green's bounding box when the course was made. This is an
  inference about the authoring; the files only show the result.
- The six exceptions look like greens edited after that projection:
  - H1 and H2: the window keeps the green's centre height, as if the green were
    squashed vertically about it (to 0.48 and 0.80 of the window).
  - H12 and H18: the tops match and the low end was raised.
  - H10 and H14: a projector exactly 12 u (1.2 m) tall, so 10 cm a band. H14's
    bottom sits on the green's lowest point.
- **The misdrawn patches** come from vertices moved after the mapping: their t
  no longer matches their height (`assets/cups-and-kcl.txt`, "KCL − height the
  band stands for").
  - In `img/greens-ramp.jpg` the white lines are the band edges the true height
    would give. They sit on the colour edges except where the bake is off.
  - H9's worst vertex is drawn 0.60 m higher than it is; H20's 0.48 m lower.

| hole | ramp | cm a band | green relief (m) | bands the green spans | window | its cups on bands | green drawn a band off |
|---|---|---|---|---|---|---|---|
| H1 | 12 bands | 8.8 | 0.51 | 5.8 | wider: centred on the green | 7, 8, 9 | 0.7 % |
| H2 | 12 bands | 12.0 | 1.15 | 9.6 | wider: centred on the green | 11, 10, 10, 5, 8, 7 | 1.0 % |
| H3 | 14 (minimap 12) | 12.1 | 1.71 | 14 | = the green | 11, 6, 13, 6, 4, 8 | 11.3 % |
| H4 | 12 bands | 11.4 | 1.45 | 12 | = the green | 8, 11, 11, 8, 1, 5 | 39.4 % |
| H5 | 14 bands | 20.4 | 2.88 | 14 | = the green | 11, 7, 8, 2, 4, 5 | 9.2 % |
| H6 | 14 bands | 22.4 | 3.01 | 14 | = the green | 7, 9, 4, 5, 10, 4 | 14.5 % |
| H7 | 12 bands | 8.2 | 0.98 | 12 | = the green | 12, 8, 1, 7, 9, 5 | 2.4 % |
| H8 | 14 bands | 14.0 | 1.95 | 14 | = the green | 11, 7, 7, 9, 3, 3 | 5.2 % |
| H9 | 14 bands | 21.8 | 2.85 | 14 | = the green | 8, 14, 7, 5, 1, 3 | 37.5 % |
| H10 | 12 bands | 10.0 | 1.01 | 10.1 | fixed 1.2 m | 7, 8, 5, 8, 9, 2 | 0.2 % |
| H11 | 12 bands | 9.4 | 1.12 | 12 | = the green | 12, 10, 10, 6, 5, 10 | 0.0 % |
| H12 | 12 bands | 9.1 | 0.90 | 9.9 | wider: top at the green | 6, 5, 8, 2, 6, 3 | 0.2 % |
| H13 | 14 bands | 7.2 | 0.99 | 14 | = the green | 14, 8, 1, 5, 8, 11 | 16.6 % |
| H14 | 12 bands | 10.0 | 0.93 | 9.3 | fixed 1.2 m, bottom at the green | 12, 11, 11, 11, 7, 9 | 0.2 % |
| H15 | 14 bands | 11.0 | 1.54 | 14 | = the green | 11, 6, 5, 6, 1, 10 | 0.0 % |
| H16 | 14 bands | 10.1 | 1.42 | 14 | = the green | 11, 5, 14, 12, 7, 2 | 0.7 % |
| H17 | 12 bands | 9.0 | 1.07 | 12 | = the green | 11, 12, 5, 1, 5, 3 | 0.1 % |
| H18 | 12 bands | 8.2 | 0.80 | 9.9 | wider: top at the green | 1 | 6.8 % |
| H19 | 14 bands | 19.4 | 2.72 | 14 | = the green | 10, 4, 11, 4, 7, 7 | 1.5 % |
| H20 | 12 bands | 19.8 | 2.10 | 12.4 | = the green | 11, 12, 7, 4, 5, 10 | 43.2 % |
| H21 | 14 bands | 17.5 | 2.43 | 13.9 | = the green | 13, 14, 13, 10, 6, 7 | 0.1 % |

Bands are counted from the lightest. The cups are WSR's PMP pin spots
(`tools/wsr-pins.json`): three on H1, one on H18, six elsewhere. On H9, H20 and
H21 the baked t runs slightly past 0–1 and is clamped.

## The code

- **Button 1.** The player update tests bit 0x200 of the newly pressed buttons
  (WPAD's 1) at 0x803fac64. That is skipped in the tutorial and in two swing
  states (5 and 8). It then calls 0x80401ed0
  (`code/L_803fac30_button1.txt`).
- **The toggle, 0x80401ed0** (`code/L_80401ed0_terrainToggle.txt`):
  - It flips `course+0x8c` and plays a sound pair (0x5b3 / 0x5b4 on, 0x5b5 /
    0x5b6 off).
  - When the ball's lie is the green or the cup (lie 6, 10 or 11), it copies
    the state to a HUD flag. That is presumably the legend; the HUD side is not
    traced.
  - 0x80401eb8 switches it off, and 0x80403b90 resets it (flag 0, fade 0).
- **The fade, 0x80401d6c, every frame** (listing in
  `wsr-green-plaid/code/L_80401d6c_slopeFade.txt`; constants in
  `assets/dol-constants.txt`):
  - `course+0x90` steps by 0.08 toward 1 (on) or 0 (off), clamped. That takes
    13 frames, about 0.2 s.
  - Each channel of k2 becomes `(int)(255 + f · (c − 255))`, with c = (30, 60,
    90) from 0x806fd974 and alpha 255.
  - 0x80401d0c then writes it into the course model's and the minimap's
    `M_Green` (`code/L_80401d0c_setGreenK2.txt`): it looks the material up by
    name and stores the colour at +0x14 of the record the lookup returns, with
    the record's flags |= 0x30. In RAM that is konst k2 in the material's
    TEV-colour list.
- **Nothing moves the ramp.**
  - Only four routines look "M_Green" up: the k2 setter, the plaid
    (0x80402080), the cup disc (0x804021d4) and the course setup (0x80403614).
  - The setup prepares layers 0 and 2 only, the two the game later rewrites,
    through 0x802583b0 (`code/L_80403800_setupCourseGreen.txt`,
    `code/L_80403b10_setupMapGreen_reset.txt`). None writes layer 1 or the UVs.
- **RAM cross-check** (`assets/ram-check.txt`): the H1 dumps (tee, in flight,
  at rest, at the next address) and H6 (tee), course and minimap, compared with
  the files.
  - Layer 1's SRT, its effect matrix, the ramp's texels and its palette equal
    the file.
  - Only the effect block's "identity" flag byte clears at load (1 → 0).
  - k2 was white in every dump (none was taken in the Terrain view).
  - No uv array differed anywhere (`wsr-fairway-stripes/dolphin/`).

## Reading heights from the colours

- **Within one green:** the height difference between two points is the number
  of band edges between them × the hole's cm a band (the table). On most holes
  that is the green's relief / 12 or / 14.
- **Lighter is always higher, but only relative.**
  - The lightest band on a green is that green's top, not a fixed height.
  - On H1, H2, H10, H12, H14 and H18 the green never reaches some end bands.
  - Do not compare colours between holes.
- **Trust:** treat the bands on H4, H9 and H20 as rough (up to a band off over a
  third of the green, worse in spots). H3, H5, H6 and H13 are off in patches.
  The others hold to a fraction of a band.
- **Resolution:** the green mesh is a regular grid of 1.5 m squares (1.2 m on
  H10), and t is interpolated linearly inside each triangle. So a band edge is
  straight within each 1.5 m triangle: the bands are contours only as fine as
  that grid.
- **The minimap** shows the same bands, except on H3 (12 bands there, 14 in
  3D, so 14 cm a band instead of 12).

## Not done

- A live check: toggle 1 in Dolphin on a few greens and compare the screen's
  band edges with `img/greens-ramp.jpg`. H9 and H20 would show the misdrawn
  patches.
- The HUD's "High / Low" legend: its texture and the flag's reader.
- Nintendo Switch Sports: its zoomed green bakes the height bands into a
  capture texture (`tools/render-nss-maps.py`, the Green texture), so the
  colour-to-height rule there is a separate question.
