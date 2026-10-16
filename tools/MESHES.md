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
| `fast_06_F0106` (6) | **green** | dense mesh, 230–370 u across; some greens contain a 15×15 u square gap = the **cup** |
| `fast_07_F0107` (7) | **water surface** | ponds, rivers, the ocean |
| `item_09_F0109` (9) | **fringe** | ring ~12 u wide around the green (matches the player-confirmed fringe) |
| `wall_0c_F010c` (12) | **walls** | tree trunks (cylinders over 60–80 u square holes in the ground), cliffs, fences |
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
boundary loops of selected groups (cups and tree holes show up as tiny loops)
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
  rough, sand, outer ground, green, fringe, water, trunks drawn as rings).
- `hole-NN_classes.png` — 8-bit map whose pixel value is the KCL type of the
  topmost surface (legend above; 0 = nodata). This is the per-pixel lie map.
- `hole-NN.json` — georeferencing (`originX/originZ`, `unitsPerPixel`, pixel-centre
  formula), the height encoding (`y = encodeMinY + value/65535 * (encodeMaxY − encodeMinY)`,
  per hole unless `--yrange MIN MAX` fixes one scale for all), nodata/fill
  counts, per-group stats, the green (centre, size, height range, cup squares),
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
rough, outer ground, sand, water (deep and pale lake), with the wind dial
masked out and the app's `greenPoly` painted in as the green class; the mesh
side is the `_classes.png` raster from mesh-heightmap.mjs. The score is a
weighted sum of per-class IoUs (grass 1, sand 1, water 1, rough 0.5, outer 0.3,
app-green 0.25), seeded from the app's green centre and yardage scale (or the
grass-extent ratio on holes 11/14 that have no scale), coarse grid at half
resolution then pattern search at full resolution (~20 s per hole).

The JSON holds `mapFracToMesh` / `meshToMapFrac` 2x3 matrices per hole, the
fitted yd/px, per-class IoUs, and diagnostics (tee residual, app pins inside
the mesh green). Results: rotation within ±1° on every hole, fitted yd/px
within 3% of the app's own on 15 of 19 holes with a scale, tee residual 0.6–8
px, grass IoU 0.61–0.93. Where the two disagree the mesh wins: the app's
scale on holes 8 and 10 (and probably 5) is off by 5–9%, and the app's
capture-derived green polygon is misplaced by ~10 px on holes 7 and 18 and
~22 px on hole 8 (the mesh green sits on the minimap's visible putting
surface in all three). Per-hole `_compare.png` images (minimap | mesh classes
warped into the map frame | edge overlay) land in `captures/meshes/registration/`.

## Quirks worth knowing

- fcJP12 (H3) and fcJP6 (H2) carry extra type-6 quads sitting on the floor plane
  under water; the green finder ignores them by taking the loop with most vertices.
- fcJP13/14/7/9 have huge type-1 wedge planes far outside the hole; the
  `> 1e5 u²` rule drops them, which is why nodata appears beyond the island on H8.
- Tree trunks are not solid in the ground mesh: each leaves a 60–80 u square gap
  in fairway/rough, so the surface under a trunk comes from the outer ground.
- Only some greens have the cup gap (H4 ×2, H5, H8, H12, H13); for the others
  the pin spots come from the app's own capture catalogue.

## Where to take it next

1. (done: `mesh-register.mjs`) Registration mesh → minimap. Next: publish a
   low-res height + class raster per hole in the map frame under `public/`
   for the app to fetch like `derived.json`, and let the mesh correct the
   app's scale on holes 8/10 and its green polygons on holes 7/8/18.
2. Green slopes for the putt solver straight from the mesh (sample the green at
   1 u/px) instead of the hand-painted 9×9 grid.
3. Per-hole elevation offsets for the shot model (holes 8/12/17 first) from the
   tee/landing-zone heights in the sidecars.
