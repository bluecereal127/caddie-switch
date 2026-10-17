# Caddie·Switch — project context for Claude Code

Personal solver/tracker for Nintendo Switch Sports golf (21 holes). Single-page
React app (Vite). No backend; all state in localStorage via `src/storage.js`
(shim over the claude.ai artifact storage API). App.jsx forked from artifact
v13 and now diverges (v14: capture catalog); the web repo is the source of truth.

## Files
- `src/App.jsx` — entire app (~1300 lines): solver, hole maps, greens, rounds, log, clubs, guide, capture catalog.
- `src/main.jsx` — mount point + client-side password gate (SHA-256 vs PASS_HASH; casual deterrence only — change via `node tools/hash-password.mjs <pw>`; deliberately kept out of App.jsx).
- `src/maps.js` — AUTO-GENERATED (tools/build-derived.mjs): 21 hole minimaps as base64 JPEG, 250×304, median-stacked from the user's captures (mapV5; replaced the 219×270 rufusmccoot/chart set). Fractional coordinates everywhere.
- `src/mapxform.js` — AUTO-GENERATED per-hole old→new fractional transforms used once by the mapV5 migration.
- `public/derived.json` — AUTO-GENERATED pipeline output (per-hole scale, green box + outline, quantized 9×9 slope grid, pins, tee). Since 2026-10-16 every hole is built with the WSR truth (`source: "wsr"`): scale, green box/outline and slope grid come from `tools/wsr-truth.json`, pins and the transplanted green are placed through the WSR green box, the tee is the detected marker kept on the WSR pad. App fetches it on load and merges via `src/derivedMerge.js`: first application wholesale (derivedV1), WSR holes overwrite until the hole's marker `green.src` equals derived.json's `wsrRev` (a hash of that hole's WSR geometry, so corrected truth re-applies; kept in the hole's own saved state, so a racing save just re-migrates next load), otherwise fill-empty so manual edits survive; pipeline pins (string ids `d…`) mirror derived.json every load, the player's own pins (numeric ids) are never touched. Regenerate: extract-maps → extract-greens → (wsr-truth, only if the meshes or registration change) → build-derived.
- `src/derivedMerge.js` — the per-hole merge rules above, pure so they can be tested outside the app.
- `tools/wsr-pins.mjs` — decodes WSR pin/start/tee positions from the course archives' PMP files (Yaz0 + U8 + PMP readers) into the map frame; needs the archives extracted from the disc image (see tools/MESHES.md "Pin positions").
- `tools/wsr-truth.mjs` → `tools/wsr-truth.json` — per-hole WSR truth in the app's map frame (scale, green box/outline, tee pad hull, slope grid) from the meshes + registration; committed so build-derived runs without the meshes.
- `src/storage.js` — window.storage shim (async get/set/delete/list over localStorage, key prefix `caddie:`; app data lives under `caddie:sss-golf-solver-v2`).
- `tools/frame-audit.mjs` — read-only: joins every stage's record of what it
  consumed and reports, per capture, which roles it holds (mapPool, mapDetect,
  teeBench, greenPair, shotAddress, shotPopup, labelled) or that it is inert.
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
carry = a · power · (1 + h · tailwind_mph); sidedrift = c · crosswind_mph · power.
Distances are STOP distances (carry + roll). Fits prefer tee/fairway shots; null
sideways entries are skipped. Putt solver: Euler sim over a 9×9 painted slope
grid per green (MU=1.35, SLOPE_G=1.1, capture radius 0.22 yd, max capture speed 2.2).

## Confirmed game mechanics (do not regress these)
- Gauge = 4 bars, linear (a = max/4). WSR official maxes seed defaults: driver 250, spoon 200, 3i 175, 5i 155, 7i 135, 9i 100, wedge 80.
- Lies cap the usable BAR; distance per bar is unchanged below the cap. Rough = 3 bars (all clubs). Sand: wedge 3, irons 2, spoon/driver 1 (player-confirmed, hardcoded in BUNKER_CAPS). Putter uncapped, dead roll in sand.
- Driver & spoon can NEVER backspin. Spin strength scales with swing power (official) → capped lies also cap spin.
- Wind: exactly 8 directions (N/NE/E/SE/S/SW/W/NW), integer mph, observed 0–31 (odd values exist in NSS; WSR was even-only 0–30). Arrow color: blue <10, yellow 10–19, pink 20+. At 0 mph direction is still readable from the pin flag.
- Pins: finite fixed spots per hole. WSR (research 2026-10-17, see tools/MESHES.md): pins live in each course archive's PMP placement file, not the KCL; holes 2-17 have 6 (a "B" set of 3 used when your score is not good enough, an "A" set of 3 when it is; score thresholds per hole in the speedrun guide), H1=3, H18=1, specials 6 picked at random. The player's "well over 2 per hole" in NSS fits it reusing these six. the pipeline accumulates every distinct pin seen in uploaded green captures, uncapped, clustering sightings in green-local space at 0.085 of the green's bbox (repeat sightings agree within 0.07; the old 0.02 map-fraction radius merged distinct spots on small greens).
- Over-swinging a capped bar = red bar + wobble/curve; solver treats caps as hard.
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
built from captures) is adjusted to match it, never the other way round.

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
  the meshes carry no cup or pin data), 7 water, 9 fringe ring, 0x0c walls/tree trunks.
- The meshes are the Wii course and match the Switch art almost everywhere
  (hole 15's apron NE of the green and a hilltop sand strip on 17 differ;
  tools/MESHES.md lists them). src/maps.js is NOT raw game art near greens:
  the flag is painted out and a green texture is transplanted at the app's
  derived green box, which is misplaced on holes 5/7/8/10/14/18 — compare
  against `captures/derived/maps/hNN.png` / `hNN.det.png` before calling a
  mesh/minimap difference real. Registration to the app frame
  (`tools/mesh-registration.json`) is verified to ~1 px on all 21 holes.

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
Import/Export in Log tab takes JSON rows: {club,power,lie,windSpeed,windDeg,ended,side?,hole?,stroke?}.

## Roadmap (agreed phases — user wants everything derived silently from uploads)
**Phase 1 — cataloging sweep** (user capturing; ~6 frames/hole, protocol in tools/README):
glyph templates from real frames → frame classifier (address / popup / tee-map / green-plain / green-heightmap, hole ID from the "Hole N Par N" banner) → auto-tick the capture catalog; median-stack tee frames → new hole maps registered to current fractional coords (re-seed trees from them); zoomed green plain+heightmap diff → green box + pre-painted 9×9 slope grid; pins read from the same zoomed frames (new spots appended as later uploads show them); map scale auto-derived = tee "yd to go" ÷ tee→pin map distance.
**Derived-data bridge** (the app cannot see local files; autosync is the bridge): pipeline writes `public/derived.json` (per-hole: catalog ticks, green box+grid, pins, scale, version stamps) → commit/push → Netlify deploy → app fetches `/derived.json` on load and merges into localStorage; newer manual edit beats older derived value and vice versa.
**Phase 2 — shot model**: 2 captures/shot (address + result pop-up) → Log rows (power from teal gauge fill — Shot Assist keeps the bar straight; popup distance chain gives ended; popup title gives next lie). Club maxes via Shot Assist full swings; wind fits; controlled sweeps via the restart-same-wind trick. Wind-arrow direction templates. Red-overswing detection.
**Phase 3 —** per-hole elevation offsets from fit residuals (holes 8/12/17 first); aim-tick deg/click calibration → aim in clicks; tree clearance table (club×bars vs tree style).

## Conventions
- All positions fractional (0–1) relative to the hole map image.
- Never bump storage keys without migration; flags used so far: parFixV3, mapV4, treesV9, mapV5 (map swap + coordinate transform), derivedV1 (derived.json applied wholesale once). WSR-sourced holes use a per-hole marker instead of a flag (`green.src` = the hole's `wsrRev`, see derivedMerge.js). Additive optional keys (e.g. `captures`, the per-hole screenshot catalog) need no flag.
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
