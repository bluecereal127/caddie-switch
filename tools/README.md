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

**Then:** `npm run ingest` reads `captures/inbox/` and writes
`captures/rows.json` for the Log-tab importer (after setup below is done).

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
warns on anything unpaired. **Don't capture putts for this pipeline** — the
putter shows no power on the bar (game8-confirmed), so a putt frame would be
misclassified as an address frame and derail the pairing. Putts feed the putt
solver via painted greens, not the shot log.

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
