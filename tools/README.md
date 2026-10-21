# tools/ — screenshot ingestion pipeline (roadmap item 1)

Turns Switch capture frames into Log-tab import JSON rows:
`{club,power,lie,windSpeed,windDeg,ended,side?,hole?,stroke?}`.

Course geometry from the Wii Sports Resort collision meshes (16-bit heightmaps,
surface-class maps, mesh→hole mapping, unit scale), the hole maps rendered
from WSR's own minimap model (`render-maps.mjs`) and the terrain shipped to
the app (`build-terrain.mjs` → `public/terrain/`: ground height and surface
class per hole, fine green heights) are a separate track: see
[MESHES.md](MESHES.md) (`mesh-inspect.mjs`, `mesh-heightmap.mjs`, `mesh-holes.json`).
The order for the app's data is extract-maps → extract-greens → (wsr-truth /
wsr-pins, then build-terrain, when the meshes, archives, registration or
map-style.json's regions change) → render-maps → build-derived.
`node tools/test-terrain.mjs` checks the terrain files.

The hole maps at 3x and 4x (`build-map-scales.mjs` → `public/maps/`) sit
beside the 2x maps that src/maps.js bundles, and come right after
render-maps: render the two scales into their own directories
(`node tools/render-maps.mjs --scale 3 --out captures/derived/render-3x --no-green`,
likewise `--scale 4` into `render-4x`; about 5 and 8 s per hole against 2.5
at 2x), then `node tools/build-map-scales.mjs` encodes them as JPEG q78
(`hNN-3x.jpg` 750×912, `hNN-4x.jpg` 1000×1216; 2.9 and 4.6 MB for the 21
holes) with an `index.json` (size, bytes, SHA-1 per hole and scale) that the
app reads only when its map-resolution setting asks for more than 2x. Like
build-derived it ships only the WSR art (`--art wsr --wsr model`), and it
box-filters each render and the 2x one to the 250×304 frame to warn about a
scale left stale by a renderer change, so rerun all three scales whenever
render-maps' inputs change. `--scales 3` refreshes one scale and keeps the
other's files.

Pure Node (pngjs + jpeg-js, no native deps). PNG and JPG both work — Switch
album transfers arrive as JPG, capture cards usually give PNG.

## Getting captures onto the PC (fewest clicks)

Captures land in `captures/inbox/` (gitignored). After ingesting a batch,
move the files to `captures/imported/` — both pull scripts skip anything
whose filename is already in either folder, so re-runs never duplicate.

**Bulk after a session — USB (recommended).** Plug the Switch into the PC,
console: System Settings → Data Management → Manage Screenshots and Videos →
Copy to a Computer via USB Connection, then on the PC:

    npm run pull:usb        # or double-click tools\pull-switch.cmd

Walks the MTP device, copies everything new, keeps original timestamped
filenames (which ingest sorting depends on). No size limits, no phone.

**Trickle via phone.** Switch → share to the Nintendo Switch app → Save (to
camera roll) → any auto-sync to the PC (OneDrive camera upload, iCloud for
Windows, Phone Link), then:

    npm run pull:sync       # add -Source <dir> for a non-standard folder

Sweeps the synced folder but only takes files that are provably Switch
captures (original `16digits-` name, or exactly 1280×720) so personal photos
are never touched. Files the phone renamed get a file-time prefix so
chronological ordering survives.

**Fully wireless — iPhone share sheet → edge function → autosync.** One-time
setup:

1. Nothing to deploy by hand: `netlify/edge-functions/upload.js` ships with
   the site and answers `POST /` (and `POST /api/upload`), writing every
   uploaded file into the `captures` blob store.
2. Netlify token: app.netlify.com → User settings → Applications → New access
   token. Copy `tools/netlify.example.json` → `tools/netlify.json` (gitignored)
   and paste it. Set `"site"` only if the token sees multiple sites.
3. Build the iOS Shortcut (once, ~2 minutes):
   - Shortcuts app → + → name it **Caddie Upload** → tap the (i) info panel →
     enable **Show in Share Sheet**. The first card must read
     "Receive **Images** … from **Share Sheet**" — if it says "from
     **Nowhere**", share-sheet input is off and the zip will be EMPTY.
     Trim the accepted types to Images.
   - Action 1: **Make Archive** — input *Shortcut Input*, format *.zip*.
   - Action 2: **Get Contents of URL** —
     URL `https://caddie-switch.netlify.app/`, Method **POST**,
     Request Body **Form**, with one field:
     - `batch` (**File** type) = tap the value → *Select Variable* → the
       **Archive** from action 1

     A leftover `form-name` (Text) = `captures` field is harmless — the edge
     function ignores non-file fields — so an existing Shortcut needs no edit.
   - Action 3 (optional): **Show Notification** — "captures uploaded".

   ### NETLIFY FORMS IS GONE — DO NOT BRING IT BACK

   Forms bills **per submission**. The original design posted one submission
   per photo, which quietly ran up ~195 submissions and **$19** in the
   Jul–Aug 2026 cycle. Two things now make that impossible:

   - `index.html` declares **no form at all**. Netlify registers forms by
     parsing deployed HTML, so there is nothing to meter. Adding any
     `data-netlify` form back to `index.html` re-arms the meter silently.
   - The edge function **always answers a POST itself** and never calls
     `context.next()` on one. Falling through is what would have handed the
     request to Forms, so every error path returns a Response instead.

   Edge invocations and Blobs are effectively free at this scale, so batch
   size no longer has any billing consequence — one share of 50 photos and
   50 shares of one photo cost the same. (Keep batches under ~7 MB anyway:
   that is a hard Netlify request limit, not a cost concern.)

   Optional lockdown: the endpoint is public, so anyone who finds the URL can
   write to the blob store. Set an `UPLOAD_TOKEN` env var on the Netlify site
   and add a matching `token` (Text) field to the Shortcut; unset (the
   default) leaves it open, exactly as it behaves today.

4. PC side is automatic: `npm run autosync:install` registers the
   **CaddieAutosync** scheduled task — starts at every logon in a VISIBLE
   console titled "Caddie autosync" (deliberate: an invisible poller is one
   you forget is running once the project winds down), restarts itself if it
   dies, and logs to `captures\autosync.log`. (Already installed on this
   machine.) Don't close that window — it IS the watcher; closing it stops
   uploads until the next logon. Restart it by hand with
   `Start-ScheduledTask -TaskName CaddieAutosync`. Remove it with
   `Unregister-ScheduledTask -TaskName CaddieAutosync -Confirm:$false`.

   It triggers on LOGON, not boot, and runs as your interactive user — so
   after a reboot it is not watching until you actually sign in. Editing
   `autosync.ps1` does NOT affect the running process; restart the task to
   load changes (stop, then start).

Per session after that: Photos → select the screenshots → Share → **Caddie
Upload** — that's the only manual step; within a minute the background task
downloads the batch, unzips it into `captures/inbox/` (names normalized for
chronological ingest order), and deletes the blob once every byte is verified
locally. Keep a batch under ~7 MB (~12 screenshots) — Netlify rejects requests
over 8 MB; just share in two rounds if bigger. If a batch never arrives, check
`captures\autosync.log`. The autosync loop no longer polls Netlify Forms;
`npm run autosync -- -Once -Forms` runs the legacy Forms drain once, kept only
for stragglers that predate the switch.

**Then:** `npm run ingest` reads `captures/inbox/` and writes
`captures/rows.json` for the Log-tab importer (after setup below is done).

## Hole cataloging captures (pins, tees, scale — the maps themselves are rendered)

The hole maps and green views no longer come from captures: since 2026-10-18
they are rendered from WSR's own minimap model (`render-maps.mjs`, MESHES.md
"Rendered minimaps"), and the green box, outline, slope grid, pins, tee and
trees come from the WSR meshes and placement files. Captures supply what WSR
cannot, and this is what to take, tracked in the app (Guide tab):

1. **From the tee**: a frame showing the "**NNN yd to go**" badge under the
   player name (it alternates with "Stroke 1"). The badge confirms the hole's
   yards-per-pixel scale and is what credits a pin reading to a spot; the
   frame's avatar places the online tee platform's tier (online rounds) and
   its cup is a pin reading of its own. The map image is not built from it
   any more (the stacks under captures/derived/maps are kept for comparison).
2. **Zoomed minimap green view, plain** — one frame.
3. **Zoomed minimap green view with the heightmap/Terrain overlay** — one
   frame. The pin flag in these frames is how pins get cataloged — nothing
   extra to do; the green outline and shading only confirm the WSR data.

Keep the "Hole N  Par N" banner visible in every frame — it's how the
classifier knows which hole a frame belongs to. WSR's own pin spots are built
in (tools/PINS.md), so a round needs captures only when the flag stands
somewhere new: a tee frame showing the "yd to go" badge plus the two zoomed
green frames. A spot that isn't one of WSR's ships on two independent
readings: two rounds, or a zoomed green plus a tee frame (which can be one
round). Hole 1's 384 yd spot has one round of tee frames and is waiting for a
zoomed green or a second round. A new online round also needs its tier judged
into tools/online-rounds.json. Shot Assist ON keeps the power bar straight in
all frames, which also simplifies gauge reading.

## How to capture (per shot, 2 presses of the capture button)

Play with **Shot Assist ON** (Options → User Settings → Other, local play):
perfectly straight swings + maxable bars = clean calibration data.

1. **Address frame** — after aiming, before starting the swing. Must show:
   distance-to-pin number, wind speed + arrow.
2. **Result frame** — when the post-shot pop-up appears (ball stopped). The
   gauge holds its locked fill until the ball stops, so this frame has BOTH
   the final gauge fill and, ideally, the pop-up's distance-to-hole — which
   would give `ended` per shot directly (hole-outs included). If the gauge
   turns out to be gone/faded by pop-up time on real captures, fall back to
   snapping right after the swing instead; `ended` then comes from
   consecutive address distances.

Aiming: use the game's suggested line when it points at the flag (typical
approaches) — fully repeatable with Shot Assist. `ended = before − after` is
only exact when the line points at the pin; on doglegs tick the aim onto the
flag (1–2 ticks of error is negligible, <0.1%) or leave `ended` blank.

Keep strict A,B,A,B order; the pipeline pairs address→result by gauge fill and
warns on anything unpaired. Putts included: the putter bar shows no fill
during the stroke but displays the final fill once the putt is made
(player-confirmed), so a result frame taken after the putt classifies
correctly. (The pipeline makes no row from a putt: assemble-shots skips a
result on the green as "putt", so the frames don't break pairing. The putt
read runs on the mesh green heights, the painted grid only once you edit it;
what a putt capture can give the model is a flat putt's gauge fill and yards
rolled ("yd to go" before minus after), logged by hand in the putting panel's
"Log a flat putt", which fits greenSpeed.)

## Shot rows (assemble-shots → build-derived → the app's Log)

`node tools/assemble-shots.mjs` walks the classified frames in time order and
writes `captures/derived/shots.json`: one row per result pop-up, paired with
the last address frame before it. Fields:

- `id` (the pop-up's ULID), `popupFile`, `addrFile`, `hole`, `stroke`,
  `club` (the app's ids: driver, spoon, 3iron … 9iron, wedge), `power` (the
  pop-up's gauge, bars), `lie` (the previous pop-up's title; stroke 1 = tee),
  `landed` (this pop-up's title: fairway / rough / bunker / green, when read),
  `ended` (yd to go before − after), `windSpeed`;
- `pos` — the ball on the address frame's minimap, map fractions
  (`tools/lib/addressmap.mjs`). The panel shows the whole hole from the tee
  and from far out, but zooms and pans closer in (1.2–2.9× on the frames so
  far, 5.6× once with the ball below the panel), so each address frame is
  registered against the hole's capture stack (`captures/derived/maps/hNN.png`
  and its `.var.png`, from extract-maps): zoom from the "yd to go" badge, the
  cup's spot searched over the green, both refined on the map art. An
  overview read whose pointer stands more than 12 yd off the badge's distance
  from the cup gives no position (a misread badge, or another pointer on the
  map). `spot` records how (`how`, `zoom`, `offset`, `fit`, the cup in map
  px); a row without a position has `posWhy` instead;
- `bearing` (deg N-up) and `bearingFrom`: the aim line (pointer triangle →
  landing dot) when it can be the swing's, else the line to the frame's cup.
  An aim line that passes the cup further than the ball finished from it
  (plus 0.6 yd per mph per bar of wind drift and 5 yd) was not the swing's;
  the row is flagged `aimNotTheSwing`;
- `windDeg`, relative to the shot (0 = tail, 90 = toward the right): the
  minimap dial's north-up arrow (exactly 8 directions) less `bearing`, so to
  the degree; the aim-relative puck arrow (read to 45°, and it can flip end
  for end: flagged `windArrowsDisagree`) only when the dial has no arrow or
  there is no bearing.

`tools/shot-exclusions.json` (hand-kept, `rows`: id → reason) lists rows that
must not reach the app; assemble-shots drops them (the reason goes to the
skip log). Add a row there, not by deleting it in the app: a deleted pipeline
row comes back from derived.json on the next load.

`node tools/build-derived.mjs` ships the importable rows in derived.json's
`shots` (less `flags`, `spot`, `importable`) and, for each row with a
position, flies it with WSR's ball (src/wsrsim.js) over the hole's terrain
(public/terrain) along `bearing`, as the solver flies a club
(src/model.js `lineProfile` / `simProfile` at k = 1), at the row's power and
wind: `elevFactor` = that stop over the same shot's on level fairway, and
`flatEnded` = ended / elevFactor, the level-fairway stop the app's club fit
reads. A row whose frame gave neither an aim nor a cup takes the line to the
hole's most-seen pin (`bearingFrom: "pin"`); a row without an elevFactor says
why (`elevWhy`). The exclusions ship as `excludedShots`, and the app deletes
stored rows with those ids. `node tools/test-rows.mjs` checks all of it on
the committed files.

## One-time setup order

```
node tools/inspect.mjs <any-capture>            # 1. tune ROIs
node tools/calibrate-gauge.mjs <empty> <full>   # 2. gauge color model
node tools/learn-digits.mjs <cap> distance 187  # 3. teach digits (few frames,
node tools/learn-digits.mjs <cap> windSpeed 12  #    cover all ten 0-9 glyphs)
node tools/ingest.mjs <folder> --out rows.json  # 4. batch runs
```

1. **ROIs** (`roi.json`) — ROI = *region of interest*, the fixed pixel box
   where one HUD element lives (gauge, distance number, wind readout). Since
   the HUD never moves, each reader only ever looks inside its box. Copy
   `roi.example.json` → `roi.json`. Run
   `inspect.mjs` on a capture; it writes each ROI crop and an `_overlay.png`
   with the boxes drawn on the frame into `tools/_inspect/`. Nudge the
   fractional rects until each crop tightly frames its HUD element. The
   example values are guesses — expect to move them.
2. **Gauge calibration**: needs one frame with the gauge empty and one with a
   full maxed 4.0 tee/fairway swing. The script self-checks (should read ~0
   and ~4) and warns if the ROI is misaligned. Power is then measured as
   contiguous fill fraction × 4 (gauge is 4 linear bars per CLAUDE.md).
3. **Digit templates**: the game font is fixed, so nearest-template matching
   replaces OCR. Feed a few frames whose numbers you can vouch for; segment
   count must match the truth string or it aborts (fix the ROI first).

## Output review

`ingest.mjs` emits rows with `club`, `lie`, `windDeg` as `null` — those aren't
machine-read yet — plus `_frames`/`_distBefore`/`_lowConfidence` helper fields.
Fill in the nulls, sanity-check anything `_lowConfidence`, delete the
`_`-prefixed fields, then paste the array into the Log tab importer. (The app
silently drops rows with null club/power, so unfilled rows can't corrupt data.)

## Not built yet (needs real captures first)

- **Result-popup distance ROI**: if the pop-up shows distance-to-hole, `ended`
  comes straight from each shot's result frame instead of consecutive
  address frames — first real capture will confirm.
- **Wind direction**: 8 arrow orientations → template match, same machinery as
  digits. Also needs the camera-vs-shot-line convention pinned down so
  `windDeg` means "relative to shot line, 0 = tailwind" like the importer expects.
- **Club + lie detection** from the HUD club selector.
- **Red overswing / capped-bar detection** on the gauge (rough/sand caps).
- Map/green extraction was built and then superseded: the maps and green
  views are rendered from the WSR course data (MESHES.md) and the slope grids
  come from the mesh heights; the capture stacks and the zoom frames' shading
  (STATIC, lighter = higher) only confirm them.

What each hole still lacks shows in the app's Guide tab: "Per-hole setup,
in order" lists the steps (green box + slopes, pins, map scale, trees, logged
shots, rounds played) and its Progress table ticks them per hole from the
data the pipeline shipped in derived.json and from your own log; the manual
capture catalog and its 📷 chips are gone.
