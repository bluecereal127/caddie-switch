# tools/ — screenshot ingestion pipeline (roadmap item 1)

Turns Switch capture frames into Log-tab import JSON rows:
`{club,power,lie,windSpeed,windDeg,ended,side?,hole?,stroke?}`.

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
   **CaddieAutosync** scheduled task — starts hidden at every logon, restarts
   itself if it dies, and logs to `captures\autosync.log`. (Already installed
   on this machine.) For a visible console instead: `npm run autosync` or
   `tools\autosync.cmd`. Remove the task with
   `Unregister-ScheduledTask -TaskName CaddieAutosync -Confirm:$false`.

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

## Hole cataloging captures (maps, greens, pins — do this sweep FIRST)

One-time per hole, tracked in the app (Guide tab → Capture catalog):

1. **From the tee**: 2–3 frames with the camera fixed and the aim line swung
   left / center / right — median-stacking erases the aim dots and yields the
   new hole map, registered to the existing fractional coords. Make sure at
   least one of them shows the "**NNN yd to go**" badge under the player name
   (it alternates with "Stroke 1") — that number auto-calibrates the hole's
   yards-per-pixel scale.
2. **Zoomed minimap green view, plain** — one frame.
3. **Zoomed minimap green view with the heightmap/Terrain overlay** — one
   frame. Diffing 2 vs 3 traces the green boundary; the shading becomes the
   pre-painted 9×9 slope grid. The pin flag in these frames is how pins get
   cataloged — nothing extra to do.

~6 frames/hole × 21 holes ≈ 130 captures; upload in batches of 10 as you go.
Keep the "Hole N  Par N" banner visible in every frame — it's how the
classifier knows which hole a frame belongs to. On later rounds only NEW pin
locations need a capture. Shot Assist ON keeps the power bar straight in all
frames, which also simplifies gauge reading.

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
correctly. (Putt data mainly serves the putt solver via painted greens, but
the frames don't break pairing.)

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
- Map/green extraction (roadmap items 2–3) will reuse `lib/image.mjs`. Note
  the NSS B-grid is STATIC shading (lighter = higher) — slope will come from
  the luminance gradient of a single grid frame, not dot motion.

Track which captures each hole still needs in the app: Guide tab → Capture
catalog (also per-hole via ⚙ on the Holes tab; 📷 n/m chip on each tile).
