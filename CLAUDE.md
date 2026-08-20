# Caddie·Switch — project context for Claude Code

Personal solver/tracker for Nintendo Switch Sports golf (21 holes). Single-page
React app (Vite). No backend; all state in localStorage via `src/storage.js`
(shim over the claude.ai artifact storage API — App.jsx is identical to the
artifact version, v13).

## Files
- `src/App.jsx` — entire app (~1200 lines): solver, hole maps, greens, rounds, log, clubs, guide.
- `src/maps.js` — 21 hole minimaps as base64 JPEG (from rufusmccoot/SwitchSportsGolfCaddy, MIT + slices of the official hole chart). Fractional coordinates everywhere, so images can be swapped for higher-res without losing data.
- `src/storage.js` — window.storage shim (async get/set/delete/list over localStorage, key prefix `caddie:`; app data lives under `caddie:sss-golf-solver-v2`).

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

## Data-entry protocol (why the Log tab looks like it does)
Aim dead at pin on logged shots. Ended = distance-to-pin(before) − (after); valid
at any power if straight. Exact power anchors without gauge-reading: full 4.0
(tee/fairway), maxed rough swing = exact 3.0, maxed sand swings = 3.0 wedge /
2.0 irons / 1.0 driver-spoon. Sideways miss optional; blank = skipped.
Import/Export in Log tab takes JSON rows: {club,power,lie,windSpeed,windDeg,ended,side?,hole?,stroke?}.

## Roadmap (rough priority)
1. Screenshot ingestion: measure gauge fill in pixels → exact power; distance readout OCR; batch → import JSON.
2. Map upgrade from user captures: median-stack 2–3 tee frames with aim line swung L/C/R to remove the line; register to current fractional coords.
3. Greens from captures: diff plain vs B-grid frame → green boundary; TWO grid frames ~0.5–1s apart → dot motion → slope direction/magnitude → pre-paint grid.
4. Aim ticks: calibrate deg/tick (sweep across a calibrated green counting ticks), then output aim in clicks.
5. Tree clearance table (club×bars vs tree style) once empirical data exists; per-hole wind multipliers for holes 13/18 if residuals demand.

## Conventions
- All positions fractional (0–1) relative to the hole map image.
- Never bump storage keys without migration; flags used so far: parFixV3, mapV4, treesV9.
- Validate App.jsx with @babel/parser (jsx plugin) before shipping any edit.
