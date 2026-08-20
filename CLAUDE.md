# Caddie·Switch — project context for Claude Code

Personal solver/tracker for Nintendo Switch Sports golf (21 holes). Single-page
React app (Vite). No backend; all state in localStorage via `src/storage.js`
(shim over the claude.ai artifact storage API). App.jsx forked from artifact
v13 and now diverges (v14: capture catalog); the web repo is the source of truth.

## Files
- `src/App.jsx` — entire app (~1300 lines): solver, hole maps, greens, rounds, log, clubs, guide, capture catalog.
- `src/main.jsx` — mount point + client-side password gate (SHA-256 vs PASS_HASH; casual deterrence only — change via `node tools/hash-password.mjs <pw>`; deliberately kept out of App.jsx).
- `src/maps.js` — 21 hole minimaps as base64 JPEG (from rufusmccoot/SwitchSportsGolfCaddy, MIT + slices of the official hole chart). Fractional coordinates everywhere, so images can be swapped for higher-res without losing data.
- `src/storage.js` — window.storage shim (async get/set/delete/list over localStorage, key prefix `caddie:`; app data lives under `caddie:sss-golf-solver-v2`).
- `tools/` — screenshot ingestion pipeline (pure Node; see tools/README.md). Scaffolded + verified on synthetic frames; ROIs/gauge cal/digit templates await first real captures.
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
- Pins: finite fixed spots per hole. WSR data: most holes have score-gated sets (harder "A pins" on good score, easier "B" on bad); H1=3 pins, H18=1, Specials 6. NSS assumed similar.
- Over-swinging a capped bar = red bar + wobble/curve; solver treats caps as hard.
- Minimap meter dots = flat-terrain carry; elevation shifts real distance (notably holes 8, 12, 17).
- Community wind-route rules encoded in WIND_RULES (H7/10/12/14/15/16/18/21).
- Shot Assist (Options → User Settings → Other; local play only) locks the swing perfectly straight AND allows maxing the bars — player-confirmed. It's the calibration tool.
- Restarting a hole (local play) restarts its 3-hole track with IDENTICAL wind. Outcomes are deterministic: same club/power/aim/wind → pixel-identical ball position (player-confirmed with driver, 9i, and putter across restarts).
- Green B-grid is a STATIC shaded overlay — lighter = higher, darker = lower (game8 guide + player confirmation). No flowing dots/motion, unlike some other golf games.
- Putter bar shows no fill during the backstroke but displays the final fill once the putt is made (player-confirmed) — post-stroke capture frames work for putts too.

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
- Never bump storage keys without migration; flags used so far: parFixV3, mapV4, treesV9. Additive optional keys (e.g. `captures`, the per-hole screenshot catalog) need no flag.
- Validate App.jsx with @babel/parser (jsx plugin) before shipping any edit.
