# NSS and Sports Resort green height map: the Terrain colours are a fixed scale (2026-11-03)

The question from `wsr-green-heightmap.md`: WSR stretches its colour ramp over each
green's own height range, so its colours hide how steep a green is. Does Nintendo
Switch Sports do the same, and could a putt be solved from the Terrain colours on a
hole with no mesh (Sports Resort's Special holes)?

Sources: the NSS RomFS (each hole's baked `Green` capture texture and
`GolfMiniMapCaptureParam`), the dump's collision, and real Sports Resort ("SR")
Terrain-view frames the live advisor kept (`lab/live/greenzoom/`, `lab/live/greens-sr/`
under `tools/harness/state/eden/`, git-ignored). No emulator was run. Units are metres,
NSS's world.

Files beside this note in `nss-green-heightmap/`:
- `code/`: the scripts (run order below).
- `assets/`: what they print.
- `img/`: `collapse.jpg` (the key evidence), `contours-over-bake.jpg`,
  `contours-steep-crops.jpg`, `staircase.jpg`, `sr-colour-vs-height.jpg`.

## The answers

**The colours are a fixed scale, not a per-green one.** One shared ramp runs through
all 21 NSS greens: a colour means the same height above or below that green's middle
on every hole.
- Pooled across holes, colour against metres from the middle collapses onto one curve:
  the holes differ by 1.9 / 3.5 raw levels (red / green). Against the fraction of each
  green's own range they differ by 7.5 / 9.1, and measured from the bottom by 7.9 / 11.9
  (`img/collapse.jpg`, `assets/collapse-test.txt`).
- Fitting each green a free stretch against the ramp from the other 20 gives a median
  of 1.00 (0.90–1.03). A per-green scale would need 1.0–6.0
  (`assets/stretch-per-green.txt`).

**It comes in steps of about 10 cm.** The bake is flat treads of 0.102 m, the capture's
default window divided by 30 (3.066 / 30 = 0.1022 m is what the numbers fit; the rule
itself is not in the files). The ten cleanest greens measure 0.1008–0.1035 m. Their
steps start at `GreenAreaCenterY` (at or just below the green's lowest point) within
±1.3 cm, and not at any fixed world height (`assets/step-per-green.txt`,
`img/contours-over-bake.jpg`).

**Sports Resort's real screen follows the same scale.** On 16 of the 18 holes it shares
with NSS, 148 Terrain frames registered to the green's outline give:
- every green's middle the same screen colour, about (60, 253, 107);
- a spread across holes of 4.0 / 1.7 / 1.6 levels (R / G / B) in metres from the middle,
  against 16.0 / 10.2 / 8.7 as a fraction of each green's range;
- a fitted stretch of 1.00 (0.86–1.04) (`assets/sr-collapse-and-stretch.txt`).

SR's palette is not NSS's (orange at the top of its legend, not yellow), but the scale
is the same. Raw screen pixels read height with a median error of 2.1 cm and 5.5 cm at
the 90th percentile, using a ramp from the other holes
(`assets/sr-pixel-height-read.txt`).

**The Special greens fit the same rule, as far as can be tested without a mesh.** Their
colours lie on the same curve (median 2.4–4.1 levels off it; known holes 2.2–3.6) and
read heights centred near zero (−0.06 to +0.17 m), as each green's middle should
(`assets/sr-special-greens.txt`). Read reliefs:

| hole | 19 | 20 | 21 | 26 | 27 |
|---|---|---|---|---|---|
| relief from colour (m) | 0.99 | 0.95 | 2.01 | 2.43+ | 2.39+ |

These are the 2nd to 98th percentile of the read, which runs about 10 % under the true
relief on the known holes. Holes 26 and 27 reach the ramp's measured top, so theirs are
lower bounds. Hole 22's frames were all clipped by the panel.

**What the colours do not give:** absolute elevation. The zero is each green's own
middle, so a colour says nothing about the green against the fairway, or one green
against another. Nor is anything tied to the cup: it is one baked picture per hole.
A putt only needs height differences on the green, and those the colours give in metres.

**So a putt can be solved from the colours alone, approximately.** Results in the next
section.

## Solving putts from the colours

Each putt was solved by `src/putt.js` on a height grid rebuilt from colours only, with
the ramp learned from the *other* holes, as on a hole with no mesh. That stroke was then
rolled on the true green (collision heights, the app's NSS putt model). Putts: 3–22 yd
from the six cups on each green, only ones a read of the true green holes.

Holed, as a share of the putts on each row (1,342 putts on the 16 greens with SR frames):

| putt | read from real SR screens | its aim holes at some strength | read from the clean bake | slope scale wrong 2× | no read |
|---|---|---|---|---|---|
| 3 yd | 92 % | 95 % | 99 % | 81–91 % | 41 % |
| 6 yd | 66 % | 81 % | 87 % | 43–47 % | 18 % |
| 10 yd | 45 % | 70 % | 69 % | 27–31 % | 12 % |
| 15 yd | 34 % | 59 % | 50 % | 13–17 % | 5 % |
| 22 yd | 24 % | 48 % | 48 % | 7–10 % | 3 % |
| all | 54 % | 72 % | 72 % | 36–41 % | 17 % |

The screen column is the one that applies to a hole with no files: only the screen exists
there. By green it runs from 36 % (H5) to 73 % (H1); H5, H14 and H18 are the weakest, with
outlier patches in the rebuilt surface. The read's aim is a median 0.50° from the true
read's (90th percentile 2.3°). The clean bake on all 21 greens holes 69 % of 1,772 putts
(`assets/putt-test-screen.txt`, `assets/putt-test-bake.txt`).

- The "read" columns are the stroke exactly as solved. "Its aim holes" means some strength
  holes on that aim (the game's putter assist can supply the strength where it applies; on
  SR's greens that is untested).
- "Slope scale wrong 2×" is the true green's exact shape with every slope halved or
  doubled: the cost of a wrong vertical scale, which a per-green ramp like WSR's leaves you
  guessing.
- The rebuilt surfaces: from the bake 4.5 cm RMS height error (median of 21 greens, worst
  H21 21.5 cm) and a slope error of 1.6 % (median node) on a 6.4 % median slope; from real
  screens 7.4 cm (worst H5 22.9 cm) and 2.2 % on 6.0 %, with outlier patches
  (`assets/recon-from-bake.txt`, `assets/recon-from-screen.txt`).

Limits of the test:
- The screen test registered frames on the known green outline. A Special hole has no
  outline; the scale must come from the 2 m plaid tile or the badge's feet, and the ball
  and cup from the panel.
- It fused up to 14 frames a hole. Holes with few or low-zoom frames did worse.
- Ball and cup positions were exact here; a real read adds their error.
- Long putts stay hard: a step hides up to 10 cm, and a small slope error builds up over
  a long roll.
- The rebuild is deliberately simple (a median per node, then relaxing inside the steps).
  A better one, and frames taken at the highest zoom, should raise the screen column.

## How NSS draws it

- `Model/MiniMap_Field_Fld_GolfCourseNN.bfres.zs` holds a BC3 texture `Green`, 461–512
  texels square over `GreenAreaCenter` ± `GreenAreaSize` / 2: the green alone, with the
  height colours baked in by the capture step. The layout's `P_MapGreen` (shader
  `Glf_MiniMap`) draws it in the Terrain view; `tools/render-nss-maps.py` transcribes that.
- `GolfMiniMapCaptureParam` gives each hole `GreenAreaCenterY` and `GreenAreaSizeY`. The
  first is not a centre: it sits at or just below the green's lowest collision point
  (within 1 cm on 11 holes, up to 9 cm below on the rest). The second is at or above the
  green's relief (within 1.4 cm on 11 holes, up to 27.5 cm above on H20). They look
  measured from the slightly larger visual mesh. CommonBase's default size is 3.066 m
  (`assets/capture-window.txt`).
- The ramp's zero is `GreenAreaCenterY` + `GreenAreaSizeY` / 2 (fitted shifts: median
  −0.01 m, at most 0.09 m). The steps count up from `GreenAreaCenterY` instead, so a
  green's treads sit at its own phase on the shared ramp.

| metres from the green's middle | −1.4 | −1.0 | −0.5 | 0 | +0.5 | +1.0 | +1.4 |
|---|---|---|---|---|---|---|---|
| raw bake RGB | 5, 22, 21 | 5, 35, 24 | 5, 64, 24 | 8, 101, 24 | 35, 108, 18 | 74, 111, 19 | 98, 114, 30 |
| SR screen RGB | | 53, 179, 191 | 53, 224, 164 | 61, 253, 107 | 231, 254, 92 | 255, 241, 97 | |

- H11 and H13 run about 8 raw levels brighter than the rest at the same height.
- On a screen the treads blur: they show faintly at high zoom (H12) and the colour reads
  as a near-continuous ramp otherwise (`img/sr-colour-vs-height.jpg`). The colour itself
  carries the scale, so the steps are not needed.

## Against WSR

| | WSR (`wsr-green-heightmap.md`) | NSS and SR |
|---|---|---|
| how it is stored | a ramp texture on a per-vertex UV | a baked picture per hole |
| scale | stretched over each green's range: 7–22 cm a band | fixed: one ramp in metres, 0.102 m steps |
| zero | the green's top and bottom | the green's middle |
| readable from colour alone | shape only | shape and slope |
| comparing colours between greens | meaningless | same height from that green's middle |

## What this means for the Special holes

`lab/live/ROBUSTNESS.md` ("Putting on the Special holes", 2026-10-26) planned this and
named the open question: whether the Terrain bands are absolute. They are, so its step 3
(learning the band step from the player's own putts) is no longer needed for the scale.
What remains is the reader:
- the panel's scale from the plaid tile or the badge;
- ball and cup in the panel;
- the screen colours through the ramp, the surface rebuilt inside the steps, then
  `solvePutt` on that local field.

The ramp is measured from ±1.3 m on screen; a steeper green would need its ends extended.

## Run order

In a scratch folder, with the dump and frames on this machine:
1. `python -P code/dump.py`: the capture parameters and Green textures.
2. `node code/sample.mjs 2`; `node code/iso.mjs 1 2 … 21`: colour and collision height per
   texel.
3. `python -P code/hue.py`, `stretch.py`, `lattice.py`, `fine.py`, `collapse.py out.png`,
   `staircase.py out.png`, `overlay.py out.png`: the scale and step tests and figures.
4. `node code/nodes.mjs`; `python -P code/recon.py`; `node code/putt-test.mjs 3`: the bake's
   putt test.
5. `node code/srband.mjs 14`; `python -P code/srhue.py`, `srread.py`, `srstairs.py out.png`:
   SR's scale test.
6. `node code/srnodes.mjs 14`; `python -P code/srrecon.py`;
   `node code/putt-test.mjs 3 est-sr putt-test-sr.json`: SR's putt test.
7. `node code/srspecial.mjs`; `python -P code/srspecial.py`: the Special greens.

## Not done

- The screen reader for a Special hole end to end (no known outline).
- A real putt on a Special green read this way.
- What sets the ramp's exact end colours past ±1.3 m on screen.
