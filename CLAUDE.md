# Caddie·Switch — project context for Claude Code

Personal solver/tracker for Nintendo Switch Sports golf (21 holes). Single-page
React app (Vite). No backend; all state in localStorage via `src/storage.js`
(shim over the claude.ai artifact storage API). App.jsx forked from artifact
v13 and now diverges (v14: capture catalog); the web repo is the source of truth.

## Files
- `src/App.jsx` — the app (~1910 lines): solver tab, hole maps, greens, rounds, log, clubs, guide (per-hole setup steps with an auto-tracked progress table, and shot-data coverage; the manual capture catalog is gone). The shot model itself is `src/model.js`.
- `src/model.js` — the shot model, pure so the tools run it: DEFAULT_CLUBS, the lie caps (BUNKER_CAPS, capFor), `stopOf` / `carryOf` (the WSR shape × the fitted club, "Model" below), `solve` (per club: landing surface, power, carry, roll, the spin range, `red`), `fitClub`, and the putt solver (simPutt, solvePutt and their constants), all moved out of App.jsx on 2026-10-20.
- `src/wsrsim.js` — WSR's ball, tick for tick: the port of tools/research/wsr-groundsim.py (lift, side spin, the backspin pull-back, gravity along the bisector, drag, the contact impulse with the A / B tables, the iron-on-green first contact, the four-tick ring, the stop rule) on a flat or tilted plane of one surface, plus wsr-flightsim.py's in-air wind as an option; `run({ club, q, surface, back, side, slopeDeg, wind, spinStart })` → `{ carry, stop, apex, roll, lateral, bounces, ticks, path }` in yd. Pure (no Node or DOM); `tools/lib/wsrsim.mjs` re-exports it for the tools. No cup, trees or water.
- `tools/build-wsr-shape.mjs` → `src/wsrShape.js` (AUTO-GENERATED, committed) — WSR's stop and carry against launch power per club, landing surface (fairway, rough, green, fringe, bunker) and spin (none; full = bs = the club's P1c × q, irons and wedge) on q = 0.05 … 1.00, normalised by the club's full-power fairway stop (1,347 simulations, 0.8 s, deterministic; every stop row monotone in q, none needed the running-maximum fix). Rerun after any change to src/wsrsim.js.
- `tools/test-solver.mjs` — acceptance for the three files above: the port against the reference simulator's tables (stops, carries, surfaces, power sweep, spin, slopes, putter, red curve, wind), the shape, solve's round trip, surfaces, caps and `red`, fitClub on synthetic rows, the putt solver unchanged by the move, and the generator's determinism.
- `src/main.jsx` — mount point + client-side password gate (SHA-256 vs PASS_HASH; casual deterrence only — change via `node tools/hash-password.mjs <pw>`; deliberately kept out of App.jsx).
- `src/maps.js` — AUTO-GENERATED (tools/build-derived.mjs): 21 hole minimaps as base64 JPEG (q78), since 2026-10-18 the renders of WSR's own minimap from `captures/derived/render/hNN.png` (tools/render-maps.mjs): the 250×304 map frame at 2× (500×608), flat backdrop, no compass, flag, avatar or aim line, WSR's tree sprites painted at their placement positions. The frame is the mapV5 frame (which replaced the 219×270 rufusmccoot/chart set), so no migration; fractional coordinates everywhere. A hole with no render falls back to its median-stacked captures (250×304) with the zoom texture transplanted into the green, as before, and the build log says so.
- `src/greens.js` — AUTO-GENERATED (tools/build-derived.mjs): the zoomed green view per hole, the renderer's `hNN-green.png` (the WSR green box plus 0.12 of it on every side, at the box's true aspect, q82; derived.json `greenView` = `{ aspect, margin: 0.12, source: "render" }`), falling back to the capture-fused 256×256 texture (`source: "captures"`, with `covered` and `sessions`, which the app's caption shows).
- `src/mapxform.js` — AUTO-GENERATED per-hole old→new fractional transforms used once by the mapV5 migration.
- `public/derived.json` — AUTO-GENERATED pipeline output (per-hole scale, green box + outline, quantized 9×9 slope grid, pins, tee, teeOnline, trees). Since 2026-10-16 every hole is built with the WSR truth (`source: "wsr"`): scale, green box/outline and slope grid come from `tools/wsr-truth.json` (the green transplant, now only the fallback for a hole with no render, is placed through the WSR green box). Since 2026-10-17 (tools/PINS.md):
  - pins are every WSR spot from `tools/wsr-pins.json` (`src: "wsr"`, with `set` A/B, `label`, `yd` and `seen` = rounds), plus Switch-only spots that two independent readings agree on (`src: "switch"`, S1… numbered by first sighting; two rounds, or a zoomed green plus a tee frame). Single readings go to `pinCandidates`; readings tied between two spots, and tee-only readings 5.5–7 yd from a spot that no other round's reading explains, go to `pinAmbiguous`;
  - `tee` is the WSR player start, where local play tees off by default;
  - `teeOnline` is the online Survival Golf tee platform: `lower` and `upper` tier positions (the upper 4.0 yd behind the lower along the tee → green-centre axis, whose direction build-derived takes from the WSR tee-pad centre, within 0.64° of the start's own; placed from the online tee frames' median avatar per round and `tools/online-rounds.json`'s tier for that round, no badge correction), `seen` (the tiers the captures were judged to be), `n` frames, `rounds`, and `x`, `y` = the observed median avatar (the old field, kept). Shipped on all 12 holes with online captures (4, 5, 8, 9, 10, 11, 14, 15, 16, 18, 19, 20); a hole none of whose online rounds has a judged tier would ship `x`, `y` only. Holes 1, 2, 3, 6, 7, 12, 13, 17 and 21 have no online captures yet.
  - `trees` (since 2026-10-18) are WSR's own trees from `tools/wsr-pins.json`, the ones on the map (a 0.02 margin): `kind` = the PMP id (2 round canopy, 3 dark crown, 6 palm), `x`, `y` = the trunk, `r` = the painted canopy's radius as a fraction of the map WIDTH, `dy` = its centre's offset from the trunk as a fraction of the map HEIGHT (negative = north) and, on a sprite painted at least 0.5 px east or west of its trunk, `dx` as a fraction of the WIDTH (57 trees, most of them the textures' own 0.5–0.9 px asymmetry; three sprites stand 2.6–4.6 px off their trunks: H1 k28, H20 k6, H19 k15). Since 2026-10-19 all three are measured on the quad the renderer paints for the tree (tools/wsr-map/hNN.json through the registration, the canopy's reach and centre read off the sprite textures; 458 of the 458 on-course trees match a quad, 456 within 0.7 px); the off trees, and a tree with no quad within 5 px, fall back to the object's scale through the sprite rule (a 160-unit quad per unit of scale: r = 68 / 63 / 62 units per unit of scale for kinds 2 / 3 / 6, the centre 54 / 55 / 54 units north of the trunk, through the hole's yd/px; tools/MESHES.md "Trees"). The rendered map shows the sprites themselves, so the app draws no marker for these trees; they feed its tap rule (a tap on a painted canopy in Edit trees mode adds no marker). 1,272 of the 1,540 trees ship (20–100 per hole). A tree with WSR's outer ground or water under its trunk (`lie` in tools/wsr-pins.json, read off the mesh class rasters; the lie itself is not shipped) carries `off: true`: the course does not reach there, the minimap draws no canopy and a ball is out of bounds already. 458 of the 1,272 are on the course, 814 off (H16 33 on / 67 off, H12 9/64, H20 20/0); the tap rule skips off trees, and the Guide's Trees step counts on-course trees only. Since 2026-10-19 every tree also carries `size` (the PMP x scale), `sy` (the y scale) and `z`, its base height in yd above the hole's datum (the WSR start's height, the datum of public/terrain): the PMP object's own height (wsr-pins.json `meshY`), where WSR's tree collision shapes stand (tools/research/wsr-tree-collision.md: radii scale with x, heights with y), which is not always the ground (13 of the 460 on-course trees sit more than a yard below it, 2 above, up to 4.5 yd on H7).

  App fetches it on load and merges via `src/derivedMerge.js`:
  - first application wholesale (derivedV1);
  - WSR holes overwrite until the hole's marker `green.src` equals derived.json's `wsrRev` (a hash of that hole's WSR geometry, so corrected truth re-applies; kept in the hole's own saved state, so a racing save just re-migrates next load), otherwise fill-empty so manual edits survive;
  - pipeline pins (string ids `d<hole>-s<slot>` / `d<hole>-x<k>`) mirror derived.json every load, and the player's own pins (numeric ids, labelled P1…) are never touched;
  - tee and teeOnline always follow derived.json;
  - tree markers with `auto: true` (ids `t<hole>-<k>`, with `r`, and `dy`, `dx`, `kind`, `size`, `sy` and `z` when derived.json has them, and `off: true` on a tree beyond the course) mirror derived.json's `trees` every load; the player's own markers (no `auto`) are never touched; a derived.json without `trees` leaves the markers alone (old installs keep the v13 seeds, which are `auto` too, until trees ship).

  Regenerate: extract-maps → extract-greens → (wsr-truth / wsr-pins only if the meshes, archives or registration change, then build-terrain, which reads both and map-style.json's `regions`, when any of those or map-style.json change) → render-maps (only if the renderer, tools/wsr-map, the registration, the truth or map-style.json change; about 3 s per hole, and a `--holes` batch merges its entries into `index.json`) → build-derived. Re-registering (`tools/mesh-register.mjs`, only after a mesh re-rip or a new stack) fits the capture stacks `captures/derived/maps/hNN.png`, its default `--maps`; never `src/maps.js`, which is rendered through that registration and is refused (500×608); a `--holes` batch merges its holes into the existing `--json` file.
- `tools/render-maps.mjs` → `captures/derived/render/` (gitignored: `hNN.png` 500×608, `hNN-green.png`, `index.json`) — renders each hole map from the WSR data alone. By default (`--art wsr --wsr model --trees model`) WSR's own minimap model (`glf_map_<id>.brres`: the KCL ground by class with WSR's own edits, per-class IoU 1.000 against the class rasters on 8 holes; on the others the model paints OB over KCL water at the map edges of H3, H5, H7 and H21, sand over the water plane on H3's and H19's beaches, fairway over a KCL sand cell on H4 and OB over a KCL pond and rough on H12, the regions in tools/MESHES.md "Rendered minimaps") rasterised top-down into the map frame through `tools/mesh-registration.json` with its textures and GX TEV programs evaluated, plus one alpha-tested sprite quad per on-course tree from the `glf_tree` model; beyond the model the border class continues flat (sea or outer ground) by `tools/map-style.json`'s per-hole `beyond` rules. On H3 alone (`SEA_YIELDS`) the model's sea plane yields where a sample is outer ground both by that word and by the KCL raster's own (edge) pixel: its bottom-right corner, KCL outer ground the model's OB object does not reach, OB rough on the Switch; the same tests would put OB where the Switch shows sea on H5 (29 map px) and H18 (165), so they stay off there. The overview holds the green's height-contour ramp (WSR's own lighter = higher shading, read through the model's uv set 1) at one flat band, luma 170–173 against the capture stacks' 158–169, because the Switch's overview green is flat; the green crop (`hNN-green.png`, src/greens.js) keeps the ramp. H14's five M_Iwa rock cones in the lake (40 triangles, 2–4 map px each, which the Switch does not draw) are dropped; every other M_Iwa component is a bank or cliff of 108+ triangles. `--art switch` is the capture-sampled style (`tools/map-style.mjs` → `tools/map-style.json`) over the class rasters, kept as the cross-check: it and `--wsr raster` write to `captures/derived/render-switch` / `render-raster` by default, never over the shipped renders, each `index.json` entry records its art, and build-derived ships the capture stack (with a warning) for a hole whose render is not the WSR art; a value outside the documented sets of `--art/--wsr/--trees` exits 1. Needs the gitignored class rasters (`captures/meshes/heightmaps-res4`). Known approximations, not bugs: the green's height-contour texgen matrix and the XLU objects' alpha are runtime state the files do not carry.
- `tools/wsr-map/` (committed, 2.1 MB) — WSR's minimap textures, the three tree sprites and per-hole model geometry (`hNN.json` + `hNN.bin`, `library.json`) extracted from the course archives by `node tools/render-maps.mjs --extract <WSR_Extract>/DATA/files/Stage/Shared2` (the `glf_course_<id>.carc` archives as DolphinTool extracts them from the disc, read through tools/wsr-pins.mjs's Yaz0 + U8 readers, or the `glf_course_<id>.d/` folders that Wiimm's `wszst extract glf_course_*.carc` unpacks beside them, read first when present; `--holes` limits the extract and then leaves `library.json` alone); `tools/lib/brres.mjs` reads BRRES/MDL0, `tools/lib/minimap.mjs` holds what the renderer and map-style share (hole loading, class rasters, the rules past the raster's edge).
- `tools/lib/online.mjs` — tells online Survival Golf captures from local play by the shot timer's stopwatch icon, tried at 1.0–1.4× because the pill pulses (194 of 563 captures are online and score 0.59–0.70; the rest 0.25 or less). extract-maps flags each tee frame with it.
- `tools/lib/exif.mjs` — the capture time the console writes into each JPEG's EXIF (DateTime). The ULID in a capture's name is when the phone received it, 4–6.5 h later, and a batch transfer reorders files; build-derived groups frames into rounds by the EXIF time.
- `src/derivedMerge.js` — the per-hole merge rules above, pure so they can be tested outside the app.
- `tools/wsr-pins.mjs` → `tools/wsr-pins.json` — every WSR pin (slot, set, label, yardage), player start, tee marker and tree (`trees`: kind = PMP id 2/3/6, size = the object's x scale, `sy` = its y scale, `meshY` = its height in KCL units, the trunk base its collision shapes stand on, `lie` = the KCL surface under the trunk — fairway, rough, sand, green, fringe, outer, water, other — in and out of the frame; the KCL meshes hold no trees), decoded from the course archives' PMP files (Yaz0 + U8 + PMP readers) into the map frame; committed. Rerun only with the archives extracted from the disc image (`DATA/files/Stage/Shared2/glf_course_<id>.carc`); it also reads `tools/mesh-holes.json`, `tools/mesh-registration.json`, `tools/wsr-truth.json` and, for the lies, the gitignored class rasters in `captures/meshes/heightmaps-res4/` (without them each tree keeps the lie the committed file has for its spot, and the log says how many came from where). The selection logic read from main.dol, the per-hole spot table and what NSS does differently are in `tools/PINS.md`.
- `tools/wsr-truth.mjs` → `tools/wsr-truth.json` — per-hole WSR truth in the app's map frame (scale, green box/outline, tee pad hull, slope grid) from the meshes + registration; committed so build-derived runs without the meshes.
- `tools/build-terrain.mjs` → `public/terrain/` (committed, since the rasters are gitignored; 1,169 + 415 KB raw, 230 + 208 KB gzipped) — per hole `hNN.bin`: the ground height (int16, 0.1 yd above the hole's datum, the WSR player start's height; `datumY` in KCL units in index.json) and the KCL class on a 125×152 grid over the map frame (one sample per 2 map px; no height and class 0 past the raster's crop), and `gNN.bin`: the green's heights every 0.5 yd over the WSR green box + 0.12 (int16, 0.001 yd above the green's mean) with the outline as a mask; `index.json` the layouts, datums, sizes and SHA-1s. Read from the class and height rasters (`captures/meshes/heightmaps-res4`) through the registration; the raster's nodata takes what map-style.json says the minimap draws there and its 1–2 px rasterising cracks are closed, but the KCL class stays where WSR's own minimap model draws another (tools/test-terrain.mjs lists the spots). Rerun when the meshes, the registration or map-style.json's `regions` change (wsr-truth's triggers plus the style: the nodata designations are capture-sampled, so a map-style.mjs rerun after new stacks needs a terrain rebuild, or tools/test-terrain.mjs's determinism step fails); `tools/test-terrain.mjs` checks the files (and rebuilds twice, byte-identical, when the rasters are there).
- `src/terrain.js` — the app's reader for public/terrain: `loadTerrain(hole)` (one fetch per hole, cached; null when missing), `heightAt(t, x, y)` (yd above the datum, bilinear), `classAt(t, x, y)`, `lieOf(class)` (fairway, rough, bunker, green, fringe, water, outer, wall, else null), `loadGreenHeights(hole)` → `{ w, h, stepYd, box, z0Yd, unitYd, data, mask }` and `greenHeightAt(g, x, y)`. Parsing and sampling are pure; App.jsx loads the solver's hole and reads each shot's landing surface with `classAt` / `lieOf` along the shot line (the tree and putt builds will use the heights).
- `tools/test-terrain.mjs`, `tools/test-merge-tree-fields.mjs` — acceptance for the terrain files and for the tree fields' merge (kind, size, sy, z on every auto marker; idempotent).
- `tools/online-rounds.json` — which tier of the online Survival Golf tee platform the player stood on in each of the 13 online rounds (a round = hole + wind; judged by eye from the frames, two judges agreed on all 13) and the tier offset, 4.0 yd (H11, the one hole captured from both tiers). build-derived reads it to ship both tiers as `teeOnline`; without it only the observed median ships. Hand-written: a new online round needs its tier added here.
- `src/storage.js` — window.storage shim (async get/set/delete/list over localStorage, key prefix `caddie:`; app data lives under `caddie:sss-golf-solver-v2`).
- `tools/frame-audit.mjs` — read-only: joins every stage's record of what it
  consumed and reports, per capture, which roles it holds (mapPool, mapDetect,
  teeBench, teeFrame, greenPair, shotAddress, shotPopup, labelled) or that it is inert.
  Run it before concluding a frame is unused; `--list` names them, `--json`
  writes captures/derived/frame-audit.json.
- `tools/` — screenshot ingestion pipeline (pure Node; see tools/README.md). Scaffolded + verified on synthetic frames; ROIs/gauge cal/digit templates await first real captures.
- `tools/mesh-inspect.mjs`, `tools/mesh-heightmap.mjs`, `tools/mesh-register.mjs`,
  `tools/lib/obj.mjs`, `tools/mesh-holes.json`, `tools/mesh-registration.json` —
  WSR collision-mesh track (see tools/MESHES.md): geometry reports, 16-bit RAW
  heightmaps + previews + per-pixel surface-class maps, mesh→hole mapping, and
  the per-hole similarity transform between mesh units and the app's 250×304
  map frame (`mapFracToMesh` / `meshToMapFrac`). Inputs
  `captures/meshes/wsr-kcl-obj/*.obj` and outputs `captures/meshes/heightmaps-res4/`,
  `captures/meshes/registration/` are gitignored (user-supplied rips, ~100 MB of
  rasters); regenerate with the commands in MESHES.md.
- Capture platform: user plays on a Switch 2, but NSS is a backward-compat Switch 1 title, so album captures are 1280×720 (Switch 2 games capture 1920×1080; no setting changes this — Nintendo support a_id 68408). All measured ROIs assume 720p frames; rects are fractional anyway.

## Model
stop = 4a · (1 + h · tailwind_mph) · S(bars/4, landing surface, spin);
carry = 4a · (1 + h · tailwind_mph) · C(bars/4); sidedrift = c · crosswind_mph · bars
(src/model.js `stopOf`, `carryOf`). Distances are STOP distances (carry + roll).
- The shape S, C is WSR's (decision D2, 2026-10-20): src/wsrsim.js ports
  tools/research/wsr-groundsim.py tick for tick (identical to it on all 93
  reference runs), and tools/build-wsr-shape.mjs runs it per club, landing
  surface (fairway, rough, green, fringe, bunker) and spin (none, full) into
  src/wsrShape.js, normalised by the club's full-power fairway stop: S(1,
  fairway, none) = 1, so `a` keeps its meaning (the 4-bar fairway stop ÷ 4) and
  the stored clubs needed no migration. Carry is linear in power, the stop is
  not: the roll comes from the landing (a Coulomb friction impulse and a
  restitution per surface), and a flatter, slower landing rolls further. WSR's
  driver stops at 112 / 179 / 233 / 279 yd on 1 / 2 / 3 / 4 bars (roll 54 / 58 /
  50 / 39); full-power roll DR→SW 39 / 33 / 22 / 16 / 16 / 10 / 5 yd; the driver
  rolls 39 on fairway, 29 in rough, 69 on a green; an iron's first contact on a
  green uses A = 0.48 (3i / 7i / 9i roll 25 / 18 / 10); a bunker landing does not
  bounce and at full power rolls ≤ 3 yd (a flatter part-power landing slides
  further: the driver up to 17 yd at 1.2 bars, irons ≤ 4). The table's choices:
  flat ground, one plane per shot with the landing's surface, launch angle and
  lift unchanged by the lie cap (true in WSR), pin homing h = 1, no wind.
- Fitted (Switch): a, h and c per club from the logged shots, each row read
  through the shape at its power and its optional `landed` (the lie it
  finished on; fairway when absent). WSR's: the shape only, labelled "WSR-shaped
  roll" on the rec cards until Switch sweeps (driver at 1–4 bars; one iron onto
  fairway, rough and green) calibrate it. Wind stays a multiplier on the whole
  stop: WSR's wind acts only in the air, but the logs cannot separate carry
  from roll yet (the sim's wind is ported, the solver does not use it).
- Landing surface: the App reads the KCL class at the carry along the shot line
  from public/terrain (`ctx.surfaceAt`) in two passes (solve as fairway and
  read where that carry lands; solve on that surface and read again; when the
  reads disagree the second wins, unread). Water, OB, walls and a missing
  terrain roll as fairway; the card names water, OB or a bank at the carry.
- Backspin (D4) is a motion input the app cannot know: irons and wedge show the
  roll on green and fairway landings as a range from full spin to none. Full
  spin is bs = P1c × q (lead's amendment, 2026-10-20): WSR gives the swing's
  spin at any power, but on the Switch spin strength scales with swing power
  (Confirmed game mechanics, which override WSR), and scaling it linearly with
  the bar is an assumption (Switch-shaped) until a sweep measures it; at q = 1
  the column is WSR's own. In WSR's yards a full-spin 9-iron onto a green
  stops at 89.7 on 4 bars (WSR's own), 73.5 on 3 (WSR's constant spin: 69.4)
  and 43.1 on 1.6 (35.2).
- The solver inverts the monotone stop curve by bisection to 0.005 bar inside
  [0.4, cap]; caps stay hard, and `red` (power ≥ cap − 0.1) warns that past the
  cap the bar goes red and the ball curves to a random side. Fits prefer
  tee/fairway shots; null sideways entries are skipped. WSR's hidden pin-power
  assist on PARTIAL swings (wsr-swing-redzone-spin.md §3.5) may bias part-power
  approach rows near the pin (the data-entry caution below); full swings never.
- Not in the model yet: elevation (Phase 3; `ctx` is where the landing's height
  goes), trees, over-swing power, Shot Assist.
Putt solver (src/model.js): Euler sim over a 9×9 painted slope grid per green
(MU=1.35, SLOPE_G=1.1, capture radius 0.22 yd, max capture speed 2.2).

## Confirmed game mechanics (do not regress these)
- Gauge = 4 bars, linear (a = max/4). The seed defaults (driver 250, spoon 200, 3i 175, 5i 155, 7i 135, 9i 100, wedge 80) are Switch guide numbers. WSR's own binary (decoded 2026-10-18, tools/research/wsr-club-physics.md) carries 240/220/190/160/130/100/55 yd at full power on a flat lie, launch angles 10/11/19/23/24/30/43°, carry linear in power to ±2%, rough = ×0.75 power for every club, bunker ×0.25 woods / ×0.5 irons / ×0.75 wedge (the Switch's 3 and 1-2-3 bars), woods cannot backspin; the flight code is ported in tools/research/wsr-flightsim.py and reproduces those carries to 0.3 yd. The structure carries over to the Switch; the numbers must be fitted from logged shots.
- Lies cap the usable BAR; distance per bar is unchanged below the cap. Rough = 3 bars (all clubs). Sand: wedge 3, irons 2, spoon/driver 1 (player-confirmed, hardcoded in BUNKER_CAPS). Putter uncapped, dead roll in sand.
- Driver & spoon can NEVER backspin. Spin strength scales with swing power (official) → capped lies also cap spin.
- Wind: exactly 8 directions (N/NE/E/SE/S/SW/W/NW), integer mph, observed 0–31 (odd values exist in NSS; WSR was even-only 0–30). Arrow colour, measured on the 317 map captures with an arrow: blue through 11 mph, lime at 13–22, pink from 24; 12 and 23 mph were never captured, so the edges lie between 11 and 13 and between 22 and 24 (the app's dials split at 12 and 24). At 0 mph the dial shows no arrow; direction is still readable from the pin flag.
- Pins (tools/PINS.md): WSR's spots are decoded from its course PMP files. Holes 2–17 have 6 (set 1 = "B", the easier 3; set 2 = "A", the harder 3), H1 has 3, H18 one spot listed under both sets, the specials 6. WSR's choosePin (main.dol, decoded) draws uniformly within a set. The set is B on a round's first hole and in every round of ≤ 3 holes; otherwise A when every player is below −k/2 going into the round's k-th hole, B when none is, and any pin when they straddle. NSS reuses WSR's spots: local badges read WSR's start-to-pin yardage exactly on some spots and 1–4 yd off on others (+4 on H3 AL and H17 BL), and it shows A pins on 11 holes, 8 of them in local play. So it doesn't keep WSR's 3-hole rule, or those weren't 3-hole rounds. It also adds spots of its own: H10 ×2, H18 and H21 confirmed (H21's on one round: a zoom sighting plus a tee frame whose 416 yd badge fits it, 415, not WSR spot 3 at 422); candidates are H1 (one round of tee frames reading 384 yd, 11 yd short of every WSR pin) and one zoom sighting on H19. A reading within 5.5 yd of a WSR spot is that spot, unless the next spot is within 1 px of being as close; then only local badges taken from the start decide (fit one spot within 2 yd, miss the other by 5), else `pinAmbiguous`.
- Online Survival Golf tees off from the same two-tiered platform on every hole (player-confirmed): up to four players stand on the lower tier and four on the upper; the upper tier is directly behind the lower one and raised at least a few feet (upper-tier players see little more than the tops of the lower-tier players' heads). The platform is one rigid object, so a slot's upper-tier position is its lower-tier position offset by the same constant on every hole.
- Tees (from captures, 2026-10-18; tools/PINS.md): local play tees off from the WSR player start by default; local frames also offer "Shot Position" and "Reset Stance", so the ball can be moved, and the "yd to go" badge is the authority. Local badges match WSR's yardages within the shifts above. Online: the tier of each of the 13 online rounds is judged from its frames (`tools/online-rounds.json`; 9 upper, 4 lower), and H11, captured from both tiers, gives the tier offset: 4.0 yd (±1) along the tee → green-centre axis (direction from the WSR tee-pad centre, ≤0.64° off the start's). NSS places the lower tier on the local tee on holes 10, 11, 14, 18 and 15 (within 2 yd) and 3–8 yd behind it on 4, 5, 8, 9, 16, 19 and 20, with the upper tier 4 yd further back, so the observed medians run 0–12 yd from the start. The slots put the player up to ±5 yd across the axis; within a round the marker wanders 1–2 px (1 yd on H11, 4–5 yd on H5/H9 at 2.5 yd/px). The raised tier doesn't shift the minimap marker: the upper-tier rounds' badges match their measured avatar-to-cup distances within 2 yd, seven of the nine within 1.2 (the exceptions H18 +1.7, H8 +2.0). Unexplained: H9's lower-tier round measures 3.7 yd further from the cup than its badge. Holes 1, 2, 3, 6, 7, 12, 13, 17 and 21 have no online captures yet. The old "Switch moved the tee" reading came from map stacks of online frames (the upper tier). H10's frames 6–8 yd ahead of the tee are post-shot frames, not a tee.
- Over-swinging (the red past the lie's cap) curves the ball to a RANDOM side on every swing
  (player-confirmed 2026-10-19; WSR draws the side from its RNG once per swing, and the curve's
  size grows from 20% to 100% of a full deliberate curve across the red, attaching only after the
  follow-through: tools/research/wsr-swing-redzone-spin.md). The bar's wobble is display only.
  Shot Assist makes the red unreachable. In WSR the red adds no power on tee/fairway and up to one
  bar from rough/sand; untested on the Switch, so the solver treats caps as hard.
- Minimap meter dots = flat-terrain carry; elevation shifts real distance (notably holes 8, 12, 17).
- Community wind-route rules encoded in WIND_RULES (H7/10/12/14/15/16/18/21).
- Shot Assist (Options → User Settings → Other; local play only) locks the swing perfectly straight AND allows maxing the bars — player-confirmed. It's the calibration tool.
- Restarting a hole (local play) restarts its 3-hole track with IDENTICAL wind. Outcomes are deterministic: same club/power/aim/wind → pixel-identical ball position (player-confirmed with driver, 9i, and putter across restarts).
- Every green is ringed by a FRINGE (player-confirmed): a band roughly the
  colour of fairway but distinct, wrapping the entire green without a break.
  Outside it is fairway or rough — never water, never OB dark rough. The
  fringe's inner edge is therefore a true polygon boundary for the green
  (the grid-squared, lighter surface inside it), and a far better mask than
  any bounding box. Terrain view recolours only the green itself, not the
  fringe, so the fringe survives in both plain and heightmap frames.
- Greens are drawn with a visible GRID of squares on the putting surface —
  a known-scale lattice, so it doubles as a registration cue when aligning
  green captures taken at different zoom levels.
- Green B-grid is a STATIC shaded overlay — lighter = higher, darker = lower (game8 guide + player confirmation). No flowing dots/motion, unlike some other golf games.
- Putter bar shows no fill during the backstroke but displays the final fill once the putt is made (player-confirmed) — post-stroke capture frames work for putts too.
- All in-game distance readouts ("NNN yd to go", distance-to-pin) are FLAT level-ground distances — elevation never enters them (player-confirmed). They live in the same plane as the minimap, so map-scale calibration (yards ÷ map pixels) is exact on every hole; elevation only shifts actual carry.
- Each green's height field NEVER changes (player-confirmed) — every heightmap capture of a hole describes the same terrain, so frames fuse across sessions/zooms (kills noise, fills legend-occluded cells).
- Wind indicators (player-confirmed): the minimap is always true-north-up, so its wind arrow is NORTH-relative; the top-right circle arrow is relative to the PLAYER'S AIM — i.e. it directly reads shot-relative wind direction (arrow up = tailwind).

## Truth source (user's rule, 2026-10-15)
When in doubt, the data extracted from the WSR collision meshes is the truth.
Derived/calculated data (scale, green box/outline, pins, tee, slopes, anything
built from captures) is adjusted to match it, never the other way round. The
same holds for WSR's placement files (pins, player start). A Switch-only pin
spot ships only when two independent readings agree (two rounds, or a zoomed
green plus a tee frame); a single reading is doubt and goes to
`pinCandidates`. The online tee platform doesn't conflict with WSR data (WSR
has no online mode), so its two tiers ship from the online frames themselves.

## Course geometry (WSR collision meshes — see tools/MESHES.md, do not re-derive)
- 21 KCL→OBJ meshes, one per hole, Y-up, X/Z ground, -Z = minimap "up"
  (green end), +X = right, same handedness as the minimap. **1 unit = 0.1 m
  (9.144 units/yd)** — confirmed by tee-pad→green distances on all 21 holes and
  by all 36 catalogued pins projecting inside the right mesh green.
- Mesh→hole map is in `tools/mesh-holes.json`: front nine = fcJP files, back
  nine = fc files, specials fcJP2/19/14 (WSR built its course from the two NES
  Golf layouts).
- KCL types: 1 fairway (+ the flat tee pad), 2 rough, 3 sand (bunkers, beaches,
  river gravel), 4 outer ground, 5 floor plane (dead), 6 green (a grid of ~15-unit cells;
  the meshes carry no cup or pin data, which live in the PMP files), 7 water, 9 fringe ring, 0x0c walls (banks, cliffs and retaining walls: along the water on 14 of the 18 holes that have them, H3's split between its coast and the outer-ground boundary, while H12's follow the drop at the edge of its terrain, H13's are the cliff faces around its island, whose mesh has no water surface at all, and H20's ring the whole course as rock walls; H6, H10 and H16 have none; never tree trunks — the trees are PMP objects too, decoded by tools/wsr-pins.mjs).
- The meshes are the Wii course and match the Switch minimap art everywhere
  that matters (re-measured 2026-10-18/19 against the capture stacks: the
  differences found are an undrawn sand cell in H4's fairway, rough / water
  cells drawn OB on H6 and H12, the KCL sea plane under the drawn OB at four
  map edges (H3, H5, H7, H21) and the H17 sand sliver, all drawn the same way
  by the Switch and by WSR's own minimap; the earlier "hole 15 apron" claim
  was wrong; tools/MESHES.md lists them with the numbers). Since 2026-10-18
  src/maps.js IS the mesh frame: WSR's own minimap model (the KCL ground by
  class) rendered through `tools/mesh-registration.json`, so the map and the
  meshes agree to the pixel except where WSR's own model reclassifies KCL
  ground (the regions in tools/MESHES.md "Rendered minimaps"; a terrain built
  from the class rasters, as B4 does, says sand / water / rough there while
  the map shows fairway / OB / sea) and in the backdrop beyond the model,
  which tools/map-style.json's `beyond` rules fill. The capture stacks (`captures/derived/maps/hNN.png` /
  `hNN.det.png`, gitignored) remain the Switch's own art for comparison:
  `hNN.png` has the flag painted out, `hNN.det.png` keeps the flag, cup,
  avatar and wind dial, and `hNN.final.png` (written only for a hole shipped
  from its stack) has a transplanted green. Registration to the app frame
  is verified to ~1 px on all 21 holes and is fitted against `hNN.png`.

## Data-entry protocol (why the Log tab looks like it does)
Ended = distance-to-pin(before) − (after); valid at any power if straight, but
ONLY when the aim line points at the pin (angular error θ inflates ended by
~(1−cosθ): negligible under ~2°, ruinous on dogleg default lines). Standard
protocol: Shot Assist ON + the game's suggested line when it points at the
flag (typical approaches); on doglegs either tick the aim onto the flag (a
tick or two off is fine) or skip hand-entering ended — captures stay usable
once map-position measurement lands. Exact power anchors without
gauge-reading: full 4.0 (tee/fairway), maxed rough swing = exact 3.0, maxed
sand swings = 3.0 wedge / 2.0 irons / 1.0 driver-spoon; with Shot Assist all
max swings are trivially exact. Restart-determinism enables controlled
sweeps: restart the track → same wind → test club after club from identical
positions. Sideways miss optional; blank = skipped.
Caution for partial-power rows (2026-10-19): WSR has a hidden pin-power assist on
PARTIAL swings whose aim can land within ~33 yd of the pin (the launch power is
pulled halfway toward the power that lands nearest the pin, up to 0.107 of full
power; backspin switches it off; tools/research/wsr-swing-redzone-spin.md §3.5).
Whether the Switch kept it is an open test (that document's §12 item 10), so
until it is ruled out, partial-power calibration sweeps should land well clear
of the pin (> 33 yd); full swings are never affected.
Import/Export in Log tab takes JSON rows: {club,power,lie,windSpeed,windDeg,ended,side?,hole?,stroke?,landed?} (landed: fairway / rough / green / fringe / bunker, where the ball finished; the form's "Finished on").

## Roadmap (agreed phases — user wants everything derived silently from uploads)
**Phase 1 — cataloging sweep (done, and superseded by the WSR data on 2026-10-16/17):** the capture pipeline still does what it was built for — glyph templates from real frames → frame classifier (address / popup / tee-map / green-plain / green-heightmap, hole ID from the "Hole N Par N" banner; the capture catalog it once ticked is gone, and the Guide tracks each hole from derived.json) → median-stack tee frames → the capture stacks under captures/derived/maps (the comparison art: since 2026-10-18 the shipped hole maps and green views are rendered from WSR's own minimap model, tools/render-maps.mjs) — but the geometry no longer comes from the captures: scale, green box/outline and the 9×9 slope grid come from the WSR collision meshes (tools/wsr-truth.json), pins, the tee and the trees from WSR's placement files (tools/wsr-pins.json). The captures confirm them (zoomed green outlines match the mesh greens; tee "yd to go" badges match the registration's yd/px and WSR's start-to-pin yardages) and supply what WSR cannot: the Switch-only pin spots, the online tee platform's tiers (a tee frame serves its badge, cup and avatar, no longer the map image), and the shot logs (Phase 2).
**Derived-data bridge** (the app cannot see local files; autosync is the bridge): pipeline writes `public/derived.json` (per-hole: green box+grid, pins, scale, version stamps) → commit/push → Netlify deploy → app fetches `/derived.json` on load and merges into localStorage; newer manual edit beats older derived value and vice versa.
**Phase 2 — shot model**: 2 captures/shot (address + result pop-up) → Log rows (power from teal gauge fill — Shot Assist keeps the bar straight; popup distance chain gives ended; popup title gives next lie). Club maxes via Shot Assist full swings; wind fits; controlled sweeps via the restart-same-wind trick. Wind-arrow direction templates. Red-overswing detection.
**Phase 3 —** per-hole elevation offsets from fit residuals (holes 8/12/17 first; the mesh heightmaps, which public/terrain now ships per hole, put the tee up to 51 m above the green on H21 and 20 m below it on H17, so online rounds from the platform's upper tier, a few feet up ≈ 1–2 yd of carry, are a small extra term on top); aim-tick deg/click calibration → aim in clicks; tree clearance table (club×bars vs tree style).

## Conventions
- All positions fractional (0–1) relative to the hole map image.
- Never bump storage keys without migration; flags used so far: parFixV3, mapV4, treesV9, mapV5 (map swap + coordinate transform), derivedV1 (derived.json applied wholesale once). WSR-sourced holes use a per-hole marker instead of a flag (`green.src` = the hole's `wsrRev`, see derivedMerge.js); pipeline pins and tree markers (`auto: true`) mirror derived.json on every load, so replacing the v13 tree seeds needed none. Additive optional keys (e.g. `captures`, the per-hole screenshot catalog) need no flag.
- Validate App.jsx with @babel/parser (jsx plugin) before shipping any edit.
- NEVER add a Netlify Form (`data-netlify`) to `index.html`. Netlify registers
  forms by parsing deployed HTML and bills **per submission** — the original
  one-submission-per-photo upload path cost $19 in the Jul–Aug 2026 cycle.
  Capture uploads go through `netlify/edge-functions/upload.js`, which answers
  every POST itself and never calls `context.next()` on one (falling through is
  what would reach Forms). Edge invocations + Blobs are effectively free, so
  upload batch size has no billing consequence.
  Its `config.method` MUST stay `"POST"`: without it the function is invoked
  on every page load, so an upload-path crash serves Netlify's "edge function
  has crashed" page to anyone browsing the site (this happened 2026-08-29).
