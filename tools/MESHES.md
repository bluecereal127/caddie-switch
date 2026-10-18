# Course geometry from the WSR collision meshes

Nintendo Switch Sports golf reuses the 21 Wii Sports Resort holes, and the WSR
collision meshes (KCL) are the exact surfaces the ball physics runs on. The 21
files `WS2_glf_course_<id>.kcl.obj` (exported with Wiimm's SZS Tools 2.42a,
`wszst`) live in `captures/meshes/wsr-kcl-obj/` (gitignored, user-supplied).
`tools/mesh-inspect.mjs` reports their geometry; `tools/mesh-heightmap.mjs`
turns them into 16-bit RAW heightmaps + PNG previews + per-pixel surface maps.

## What the meshes are

- Plain triangles (`f a b c`), no normals/UVs, CRLF line endings, 2.5k–9.5k
  triangles and 6k–21k vertices each (vertices are duplicated along seams).
  `f 0 0 0` lines are placeholders the exporter leaves for dropped degenerate
  faces; the parser skips any face with an out-of-range index.
- **Y-up; X/Z is the ground plane.** `-Z` is "up" on the in-game minimap (the
  green end) and `+X` is right, same handedness as the minimap.
- **1 unit = 0.1 m, i.e. 9.144 units per yard.** Established from the tee-pad to
  green-centre distances: every hole lands within 20 yd of the game's own
  tee-to-pin yardage (the residual is the pin's offset from the green centre).
  Heights use the same unit, so slopes decode true.
- Each file is one hole plus its surroundings; most contain giant filler
  triangles (ocean / floor planes up to ±19 000 units) that must be cropped away.

## Collision-type semantics (wszst group names carry the raw KCL flag)

| group (type) | golf meaning | notes |
|---|---|---|
| `offroad_01_F0101` (1) | **fairway** | also the **tee pad**: a small (130–270 u) perfectly flat island of type 1 ringed by rough at the far end. In 4 files (fcJP13/14/7/9) type 1 also holds giant far-away wedge planes. |
| `offroad_02_F0102` (2) | **rough** | surrounds the fairway |
| `offroad_03_F0103` (3) | **sand** | bunkers, but also beaches (H3) and river gravel (H15) |
| `offroad_04_F0104` (4) | **outer ground** | the hole's wider terrain: deep rough / OB hills |
| `offroad_05_F0805` (5) | **floor plane** | flat dead plane under water and OB (y = −10…−800); never visible, dropped from heightmaps |
| `fast_06_F0106` (6) | **green** | dense grid of ~15 u cells, 230–370 u across; no cup or pin data (pins live in the course PMP file) |
| `fast_07_F0107` (7) | **water surface** | ponds, rivers, the ocean |
| `item_09_F0109` (9) | **fringe** | ring ~12 u wide around the green (matches the player-confirmed fringe) |
| `wall_0c_F010c` (12) | **walls** | banks, cliffs and retaining walls, mostly along the water: on 14 of the 18 holes that have them 76–100% of the wall triangles stand within 32 u of a water surface (the lattice along the lake and the playable landmass's coasts in `hole-07_preview.png`), and H3's split between its coast and the outer-ground boundary. On the other three they follow the edge of the terrain instead: H12's the drop at its outer-ground boundary (2% near its pond), H13's the cliff faces around its island, 8–9 m down from the rim, whose mesh has no water surface at all (the floor plane stands in for the sea), and H20's ring the whole course as rock walls rising 24–45 m above it. H6, H10 and H16 have none. No tree trunks: the meshes hold no trees at all, which are PMP objects (see "Trees") |
| `wall_0d_F080d` (13) | invisible wall | H13 only, 12 triangles spanning the hole |
| `item_0e_F010e` (14) | special zone | H1 only: the 6-triangle pale hexagon near the tee that the minimap also shows |
| `fall_10_F0110` (16) | fall boundary | H14 only |

## Mesh → hole mapping (`tools/mesh-holes.json`)

Front nine are the "fcJP" files (Famicom Golf JP-course holes), back nine the
"fc" files (NES Golf US-course holes), specials fcJP2/19/14 — WSR built its
course from the two NES Golf layouts. Confirmed three ways: tee→green distance
vs yardage (table), the app's 36 catalogued pins all project inside the right
mesh green, and visual matching of the previews against the 21 minimaps (one
matcher plus two adversarial verifiers per mesh, zero refutations). The visual
pass is what separates the two ~570 yd par 5s, which yardage cannot: H5 has
the island green across a strait (fcJP7), H9 the inland lake below its green
(fcJP3).

| hole | mesh | tee→green centre | game yd | | hole | mesh | tee→green centre | game yd |
|---|---|---|---|---|---|---|---|---|
| 1 | fcJP11 | 399 | 398 | | 12 | fc8 | 466 | 457 |
| 2 | fcJP6 | 159 | 152 | | 13 | fc14 | 144 | 145 |
| 3 | fcJP12 | 533 | 536 | | 14 | fc5 | 364 | 355 |
| 4 | fcJP16 | 174 | 186 | | 15 | fc16 | 345 | 355 |
| 5 | fcJP7 | 574 | 564 | | 16 | fc12 | 257 | 259 |
| 6 | fcJP10 | 420 | 407 | | 17 | fc9 | 224 | 219 |
| 7 | fcJP9 | 401 | 399 | | 18 | fc13 | 460 | 459 |
| 8 | fcJP13 | 166 | 161 | | 19 | fcJP2 | 391 | 389 |
| 9 | fcJP3 | 571 | 569 | | 20 | fcJP19 | 343 | 347 |
| 10 | fc1 | 379 | 360 | | 21 | fcJP14 | 436 | 416 |
| 11 | fc3 | 143 | 148 | | | | | |

## Tools

    node tools/mesh-inspect.mjs captures/meshes/wsr-kcl-obj/*.obj --out <dir> [--px 800] [--json report.json] [--raw] [--loop-types 1,3,6,7]

Per mesh: group table (type, triangles, plan area, height range, flatness),
boundary loops of selected groups (small gaps in the ground show up as tiny
loops; they are not under the trees, see "Quirks")
and a hillshaded semantic-colour preview (`--raw` colours by raw KCL type).

    node tools/mesh-heightmap.mjs captures/meshes/wsr-kcl-obj/*.obj --out captures/meshes/heightmaps-res4 \
         --res 4 --names tools/mesh-holes.json --derived public/derived.json

Per hole it writes (`--names` turns mesh ids into `hole-NN`):

- `hole-NN_<W>x<H>.raw` — headerless **uint16 little-endian** heightmap, row-major,
  column = +X, row = +Z (row 0 is the green/north edge). Dimensions are in the
  filename and the sidecar; the usual "RAW 16-bit" import in Unity/UE/World
  Machine/Blender reads it (`--square 1025` / `2049` pads to a square if a tool
  insists on 2ⁿ+1).
- `hole-NN_height16.png` — the same values as a lossless 16-bit greyscale PNG.
- `hole-NN_preview.png` — 8-bit hillshaded preview in semantic colours (fairway,
  rough, sand, outer ground, green, fringe, water, walls drawn as edges).
- `hole-NN_classes.png` — 8-bit map whose pixel value is the KCL type of the
  topmost surface (legend above; 0 = nodata). This is the per-pixel lie map.
- `hole-NN.json` — georeferencing (`originX/originZ`, `unitsPerPixel`, pixel-centre
  formula), the height encoding (`y = encodeMinY + value/65535 * (encodeMaxY − encodeMinY)`,
  per hole unless `--yrange MIN MAX` fixes one scale for all), nodata/fill
  counts, per-group stats, the green (centre, size, height range),
  the tee pad (centre, size, height, distance to green in units and yards) and —
  with `--derived` — a first-cut registration of the app's minimap frame
  (`fracToMesh`, the app's pins in mesh units, tee residual).

Rasterization rules: every surface type is drawn and the topmost wins per pixel
(bridges over water come out as the bridge). Walls are skipped (no footprint).
Giant filler triangles (> 1e5 u² in plan) are skipped unless they are water or
the floor plane, which define the water level. Floor-plane pixels are nodata.
Nodata is filled from the nearest real pixel (`--no-fill` keeps it at value 0)
and flagged as class 0, so consumers can mask it; holes 13, 15 and 20 are the
nodata-heavy ones because their meshes stop just outside the rough. The default
crop (`--crop core`) is the bounding box of fairway + rough + sand + green +
fringe plus `--pad 600` units; `--crop all` keeps every non-giant surface.

## Registration to the app's map frame (`tools/mesh-registration.json`)

    node tools/mesh-register.mjs --heightmaps captures/meshes/heightmaps-res4 --out captures/meshes/registration \
         --json tools/mesh-registration.json [--holes 3,11] [--classify-only]

Fits, per hole, a similarity transform (scale, rotation, translation) between
the 250x304 minimap panel in `src/maps.js` (fractional coords, the frame every
app position lives in) and mesh units. The minimap is classified by
hue/saturation/value into fairway (+ the hex-patterned green, same colour),
rough, outer ground, sand, water (deep and pale lake); the mesh side is the
`_classes.png` raster from mesh-heightmap.mjs. Nothing from the app's derived
green (box, polygon, pins) steers the fit, because it is misplaced on six
holes and src/maps.js has a green texture transplanted at that same box (see
below); its offset from the mesh green is only reported. Masked out: the wind dial,
found per hole as the bbox of near-white pixels (its ring and "NN mph" text)
in whichever bottom corner has them, since the dial floats to the left
corner on 11 holes and the right on 10, and the panel's top border line.
Pixels the classifier cannot name (brown cliff and bank bands, tee mats, UI
glyphs) are don't-care, because the mesh puts water under cliff faces (walls
have no footprint) and penalising them would bias the fit. The score is a
weighted sum of per-class IoUs (grass 1, sand 1, water 1, rough 0.5, outer
0.3), seeded from the app's green centre and yardage scale
(or the grass-extent ratio on holes 11/14 that have no scale), coarse grid at
half resolution, then a pattern search at full resolution over the full
3^4−1 stencil of joint moves: rotation about the green pivot has to be paired
with a shift to move the tee end, which a one-parameter-at-a-time search
cannot do (~25 s per hole).

The JSON holds `mapFracToMesh` / `meshToMapFrac` 2x3 matrices per hole, the
fitted yd/px, per-class IoUs, the masked dial box, and diagnostics (tee
residual against the app's marker, `appGreenOffsetPx` between the centres of
the app's green box and the mesh green, app pins inside the mesh green).
Results: rotation within 0.25° on every hole (the minimaps are axis-aligned
renders of the course), fitted yd/px within 3% of the app's own on 15 of the
19 holes that have one, tee residual 0.7–7.6 px (median 2.6; the large ones
on holes 2 and 17 are the app's marker sitting at the top edge of the drawn
tee box), grass IoU 0.61–0.94. Per-hole `_compare.png` images (minimap | mesh classes
warped into the map frame | edge overlay) land in `captures/meshes/registration/`.
`--other penalize|water|ignore` picks the scoring rule for unclassifiable map
pixels; `water` (default) and `penalize` score the same against the
verification below, while `ignore` lets the mesh grow into cliff bands (hole
13 scaled 2% too large).

**Verification (2026-10-15).** 21 independent judges, one per hole, each
measuring the compare images with their own scripts, rated every hole
aligned with residuals under 1 px. Adversarial checks with two lenses per hole
(water/sand, fairway/rough/green) found no transform error. 37 of the 42
found nothing over 3 px beyond drawn cliff or bank bands and tree canopies;
the 5 that flagged a gap (holes 8, 10, 13, 15, 17) each reported that no
shift, scale or rotation could close it, and the recheck below traces four of
them to the edited minimaps. Those checks measured the first fit; the fit
committed here was re-scored against the judges' measurements and has the
same mean error (0.64 px) with the worst hole down from 1.73 to 1.03 px (it
removes hole 7's 0.75° rotation, hole 18's green-island offset and hole 21's
1% scale error, the defects the judges had measured). It differs from the
first fit by at most 4 px anywhere in the frame (hole 7) and under 2 px on
most holes.

**The minimaps in src/maps.js are edited, so check disagreements near greens
against the unedited stacks.** extract-maps.mjs paints the flag out of every
stacked map (onion inpainting), and build-derived.mjs then transplants a green
texture fused from the zoom captures at the app's derived green box
(`transplantGreen`). `captures/derived/maps/hNN.png` is the stack before the
transplant, `hNN.det.png` a single-session stack with the flag still drawn,
`hNN.final.png` what ships. Five apparent mesh/minimap differences, all at or
beside greens, were rechecked this way:
- Not course differences: hole 10's green (the shipped map shows the
  transplanted disc ~5 px east, at the app's own misplaced green box; the
  unedited stack's putting surface and the real cup in the flag stack sit
  inside the mesh green), hole 1's greenside bunker (the flag painted out its
  east lobe; raw frames match the mesh within 0.3 px), and the greenside
  bunkers on holes 13 and 17 (the disputed spots are under the flag cloth in
  every capture, 80–100% covered, so the minimap there is paint-out fill).
- Real, in unedited game art away from the flag: hole 15's fairway apron NE
  of the green runs ~6.5 px further in the mesh than the Switch fairway, which
  paints that band as rough. Hole 17's mesh also has a sand strip on the right
  landmass's NE hilltop that the Switch minimap draws as plain ground.
- Holes 8, 15 and 17 have small holes in the collision ground (water or nodata
  showing through) that no capture shows; hole 8's was checked against all 20
  raw tee frames.

**Errors in the app's own data that the mesh exposes** (corrected 2026-10-16,
see the next section):
- The map scale (yd/px) from a single yardage reading is off by ~5% on hole 5,
  9% on hole 8 and 7% on hole 10; two judges confirmed the fitted scale
  independently, one against the in-game yardage badge on hole 18.
- The capture-derived green box, polygon and pins are misplaced on holes 5, 7,
  8, 10, 14 and 18, by ~5 px on hole 10 and up to ~22 px on hole 8; the
  transplanted green in src/maps.js follows the box, so the shipped minimap
  draws those greens in the wrong place too. `appGreenOffsetPx` measures box
  centres, so a few px can come from size alone: hole 12's 5 px is the app's
  box covering only the west part of the mesh green, with its pin on the real
  cup. Hole 18's root cause: `pinBase()` in
  tools/extract-maps.mjs searches for the flag pole only from 4 px left to
  6 px right of the pink cloth's centroid and keeps the last dark pixel, but
  on that hole the flag flies 7–10 px downwind of its pole, so the search
  lands on the cup's rim.

## The WSR truth applied to the app's data (2026-10-16)

The user's rule: when in doubt, the WSR data is the truth and derived data
adjusts to it. `node tools/wsr-truth.mjs` writes `tools/wsr-truth.json`
(committed; needs the meshes only when they or the registration change) and
`tools/build-derived.mjs` uses it for every hole:

- **Scale**: the registration's yd/px. Fixes holes 5/8/10 and fills 11/14,
  which never had one.
- **Green box and outline**: the mesh green (type 6) outline mapped into the
  map frame. The zoom captures' green outlines match it in normalized shape
  (IoU 0.86–0.98 on 20 holes, aspect within 3%), so the capture data that
  lives in the green's own frame (pins, pin zones, zoomed green texture)
  carries over through the WSR box.
- **Pins**: the zoom sightings projected through the WSR box, clustered in
  green-local space at 0.085 of the green. Checked against the real cup in each
  hole's flag stack (`hNN.det.png`, no projection involved): mean distance
  3.69 px before, 1.61 px after, with holes 7/8/10/14/18 down from 5–14 px to
  ~1 px. The old 0.02 map-fraction clustering merged distinct spots 3–6 px
  apart on holes 3/5/14/18. Readings from cropped (zoom-mismatched) pairings
  are dropped: on hole 10 they shipped as two phantom spots. Since 2026-10-17
  the shipped pins are WSR's own spots from the course PMP files plus
  Switch-only spots that two independent readings agree on (two rounds, or a
  zoomed green plus a tee frame, which can be one round); these sightings
  only count toward them (tools/PINS.md).
- **Slope grid**: built from the mesh green's heights with the capture
  convention (downhill, normalized to the green's own steepest cell, levels
  1–3) but true physical spacing; `gridPct` keeps absolute percent slopes for
  calibrating the putt model later. Direction agreement with the capture grids
  is 0.85–0.97 on 9 holes, weaker on the flattest greens (holes 1/10/12, where
  relative shading is noise), and opposite on holes 2 and 14.
- **Transplanted green** in src/maps.js: painted at the WSR box on all 21 holes
  (holes 5, 6 and 8 never had a confident enough projection before).
- **Tee**: the WSR pad says where the teeing ground is, not where the ball
  sits on it. All 19 detected markers lie on their WSR pads and match the
  in-game yardage better than the pad centre (mean error 3.7 vs 5.6 yd; the
  ball sits a median 3.8 yd toward the green), so the marker is kept while it
  is on the pad and snapped onto it otherwise. Holes 11 and 14 have no marker
  and get the pad centre moved forward by that median. Superseded 2026-10-17:
  the tee is now the WSR player start from the PMP file, which is where local
  play tees off. The markers that sat 6-10 yd off it came from stacks of
  online Survival Golf frames: the upper tier of the two-tiered online tee
  platform, which ships as `teeOnline` with both tiers (tools/PINS.md). The
  pad rule above remains only as the fallback without `tools/wsr-pins.json`.

The app picks this up through `src/derivedMerge.js`: WSR-sourced scale, green box,
outline and grid overwrite the stored values until the hole's marker `green.src`
equals the hole's `wsrRev` (a hash of its WSR geometry, so a corrected truth
re-applies while unchanged holes keep manual edits), and pipeline pins mirror derived.json on every load while
the player's own pins stay untouched.

## Pin positions (decoded 2026-10-17)

The meshes hold no pins. WSR stores them in each course archive's PMP ("Pack
MaP") placement file, next to the KCL: the archive (Yaz0-compressed U8,
`glf_course_<id>.carc`) holds `WS2_glf_course_<id>.kcl` and
`WS2_glf_course_<id>.pmp`. Pins are PMP objects group 0x0002 / id 0x0001;
0x0000 is the player start, 0x000A the tee marker, and group 0x000B holds
Frisbee Golf's start/goal (not pins). Sources: Resort2OG
(github.com/kiwi515/Resort2OG), wiki.tockdom.com/wiki/PMP_(File_Format),
Caddie (github.com/PackProject/Caddie), the original Wii Sports notes
(github.com/kiwi515/ogws_info), whose course order fc1, fc3, fc8, fc14, fc5,
fc16, fc12, fc9, fc13 matches our holes 10-18.

    node tools/wsr-pins.mjs <course archives / .pmp files / extracted folders> [--out tools/wsr-pins.json]

decodes every pin, start and tee marker, maps them through the registration
and checks each pin against the WSR green. Run on the user's disc
(`DolphinTool extract -i <rvz> -o <dir>`; the archives are under
`DATA/files/Stage/Shared2/`), it found all 21 holes. Every pin lies on its WSR
green, and all 99 pins on holes 1-17 reproduce the community yardage sheet as
floor(start-to-pin yards). The output `tools/wsr-pins.json` is committed.

How WSR picks the pin is now read from `main.dol` itself (choosePin, the set
chooser and the slot table), and agrees with the speedrun community's
thresholds. That, the per-hole spot table, and what Switch Sports does
differently are in tools/PINS.md: both sets seen, a few extra spots, and the
online Survival Golf tee platform, two tiers 4 yd apart with the lower one on
the start or up to 8 yd behind it, shipped on all 12 holes with online
captures (holes 1, 2, 3, 6, 7, 12, 13, 17 and 21 have none yet).

## Trees (decoded 2026-10-18)

The meshes hold no trees either: their type-12 walls are banks, cliffs and
retaining walls, along the water on most holes and at the edge of the terrain
on H12, H13 and H20 (the type table above). The trees are objects in the same
PMP placement files as the pins, group 0x0002 with ids 2, 3 and 6 (960 + 409
+ 171 over the 21 holes; H16 has 101 id-2 objects and nothing else, H17 and
H18 only id 2). `tools/wsr-pins.mjs` writes them as `trees` (x, y in the map
frame, `kind` = the id, `size` = the object's x scale) and
`tools/build-derived.mjs` ships the ones on the map, with a canopy radius, as
derived.json `trees`; the app mirrors them into its tree markers on every
load (`src/derivedMerge.js`), replacing the v13 hand-placed seeds, of which
only 24 of 130 were within 6 px of a real tree. Holes 1, 2, 9, 11 and 12 also
carry 166 objects of ids 4, 5 and 7 (48, 33, 42, 24 and 19), each 0–26 u from
a tree of ids 2, 3 or 6 — 0 u on H11 and H12, under 13 u (0.6 px) on H1 and
H9, up to 26 u (3.0 px at 8.8 u/px) on H2 — with exactly that tree's scale on
164 of the 166 (two on H1 differ by 0.1–0.3): companions of those trees, not
trees of their own, and not read.

Overlaid on the minimaps the positions sit at the centres of the drawn
canopies (checked on H7, H16 and H19 by drawing them over the hole maps). The three
ids are three sprites: id 2 is the round broadleaf canopy with a light
highlight at the centre and a darker rim (the common tree), id 3 a dark dense
crown with no highlight (conifer-like), id 6 a palm whose fronds draw as a
thin star with no solid canopy. Their scale is uniform in x and z on 1533 of
the 1540 (y equals x on 1174 and is within ±12% of it on 1477; the extremes
are −33% and +52%), so `size` is the footprint scale, and the drawn
canopy scales with it in world units, not screen px: the sprite edge
(strongest colour gradient along 36 rays from the centre, median over rays,
trees with no neighbour in reach and a ray spread under 1.5 px) sits at

- **kind 2: r = 81 × size KCL units** — 42 trees on 18 holes, sizes 0.7–2.5;
  r = 84.8·size − 6.8 u, R² 0.98, rms 6.5 u; through the origin 81.0 (rms
  0.37 px); the same fit in px has a −0.2 px intercept, so no constant term.
  Per hole that is 3.96 px per unit of scale on H7 (19.6 u/px) but 5.25–5.44
  on H16/H19 (13.7–14.6 u/px), which is what rules out a fixed-size sprite.
- **kind 3: r = 48 × size** — 48 trees on 11 holes, sizes 0.85–3.0; R² 0.94,
  rms 0.48 px (median r/size 47.9, IQR 45.2–49.7).
- **kind 6: r = 45 × size, by eye** — the fronds give no edge to fit (the
  detector caught two palms at 61); 9–11 px across at size 2.4–2.5 on H7's
  19.6 u/px map.

In map px that is K·size / (scale·9.144) with the hole's yd/px; derived.json
carries r as a fraction of the map width. 1,272 of the 1,540 trees ship
(20–100 per hole, a 0.02 margin outside the frame), many of them in the
outer ground where the minimap draws no canopy at all.

**The ground under each tree (`lie`, 2026-10-18).** `tools/wsr-pins.mjs`
samples the class raster (`hole-NN_classes.png`, 4 u/px; trees and rasters
share the mesh frame, so no registration is involved) at every trunk and
writes it as `lie`: fairway, rough, sand, green, fringe, outer (type-4
ground, the type-5 floor plane, and anything beyond the raster's crop, which
already reaches 600 u past the last course surface), water, other (zone,
fall). A nodata pixel would take the surface most of the 1–2 px ring around
it shows, and nothing within reach is outer; neither case occurs. Over the
1,540: rough 454, fairway 6, outer 1,080 (896 on the rasters, 184 beyond
their crops); no tree stands on sand, green, fringe or water. Per kind: 2
outer 631 / rough 329; 3 outer 333 / rough 73 / fairway 3; 6 outer 116 /
rough 52 / fairway 3. Per hole, outer / rough (/ fairway): H1 46/11, H2
48/14, H3 79/22, H4 25/15, H5 57/20/4, H6 51/32, H7 38/30/1, H8 46/19, H9
36/31/1, H10 75/33, H11 72/22, H12 77/9, H13 49/17, H14 48/38, H15 68/27, H16
68/33, H17 53/15, H18 41/19, H19 66/18, H20 0/21, H21 37/8. The rasters are
gitignored, so a run of wsr-pins.mjs without them keeps each tree's lie from
the committed file (the tree at the same x, y, kind and size) and says so.

`build-derived` ships `off: true` on a tree whose lie is outer or water: the
course does not reach there, the minimap draws no canopy and a ball is out
of bounds already, so the app draws it as a faint disc with no glyph (drawn
like the course trees they buried the map on H16, H1 and H7), and the Guide's
Trees step counts on-course trees only. The lie itself stays out of
derived.json. Of the 1,272 shipped trees 458 are on the course and 814 off;
per hole on/off: H1 11/37, H2 14/22, H3 22/64, H4 15/13, H5 24/56, H6
32/47, H7 31/36, H8 19/12, H9 32/34, H10 33/64, H11 22/39, H12 9/64, H13
17/27, H14 38/46, H15 27/47, H16 33/67, H17 14/24, H18 19/41, H19 18/40, H20
20/0, H21 8/34.

## Quirks worth knowing

- fcJP12 (H3) and fcJP6 (H2) carry extra type-6 quads sitting on the floor plane
  under water; the green finder ignores them by taking the loop with most vertices.
- fcJP13/14/7/9 have huge type-1 wedge planes far outside the hole; the
  `> 1e5 u²` rule drops them, which is why nodata appears beyond the island on H8.
- The ground mesh has small (60–80 u) square gaps in fairway/rough, once read
  as trunk footprints. They are not: sampling the class rasters at the PMP
  tree positions (4 u/px) finds fairway or rough under 459 of the 460 trees
  that fairway/rough surrounds (the one exception, on H18, has outer ground
  under it), and the type-12 walls run along the water edges and the edge of
  the terrain (the type table), not around trunks. The meshes carry no tree
  collision at all.
- There are no cups in the meshes. The "15×15 cup gaps" once reported on six
  greens were artefacts: the OBJ export stores shared corners with ~0.001 u of
  noise (e.g. -46.876 / -46.875), and rounding vertices to a 0.05 grid split
  such pairs into fake holes. tools/lib/obj.mjs now welds vertices within
  0.01 u. What remains are one fringe-type cell inside hole 4's green and one
  water-type cell inside hole 8's.

## Where to take it next

1. (done) Registration mesh → minimap, and the WSR truth applied to scale,
   greens, pins, slope grids and tees. Next: publish a low-res height + class
   raster per hole in the map frame under `public/` for the app to fetch like
   `derived.json`, so the solver can read elevation and lies.
2. Calibrate the putt model to absolute slopes (`gridPct`): the 9×9 levels are
   still per-green relative, so a level-3 cell means "this green's steepest",
   not a fixed gradient.
3. Per-hole elevation offsets for the shot model (holes 8/12/17 first) from the
   tee/landing-zone heights in the sidecars (tee to green centre: up to 51 m
   down on H21, 20 m up on H17). Online rounds add the tee platform's tier:
   the upper tier is a few feet above the lower one, about 1-2 yd of carry
   from the drop, small next to the terrain.
