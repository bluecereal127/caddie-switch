# HANDOFF — remaining work queue (2026-08-21)

Read CLAUDE.md first (mechanics, conventions, pipeline map). This file is the
work queue if a session/model handoff happens mid-stream. Auto-push policy is
standing: verify (babel parse App.jsx + `npm run build`) → commit → push
(Netlify deploys main). The PC scheduled task "CaddieAutosync" runs the whole
capture pipeline; after editing autosync.ps1 restart it (Stop/Start-ScheduledTask).

## State (as of the wide-layout commit e616989 + this session)
- Capture transport: edge function → blobs → autosync → classify (template
  OCR, 113/113 validated) → extract-maps/greens → assemble-shots →
  build-derived → auto-commit+push. Zero manual steps.
- Maps: darken-stack over ≤9 pooled tee frames, per-frame flag/compass
  exclusion, NATIVE backdrop (black transform reverted — do not reintroduce).
  Compass = game's own, locked per hole from first 0-mph tee frame
  (captures/derived/compass0/). Baked pin flags: now ONION-INPAINTED out
  wherever every pooled frame shares one pin (see below); real art replaces
  the inpaint automatically once a 2nd-pin session exists.
- Greens: boundary + fused multi-session height field → 9×9 grid; pins
  accumulate. Shots: address+popup pairs → importable Log rows w/ bearing.
- Solver UX: 1500px shell, 3-col solver on xl; tee-default draggable target,
  windDeg N-up canonical, draggable rec bars, pins/trees hide toggles,
  ball dot r=1.5.

## NEW DIRECTION — map art pass (user-validated 2026-08-21)
User A/B-tested externally on one map JPEG:
  Cloudinary AI upscale → Canva background-remove  = WINNER (crisp, clean cutout)
  (bg-remove first, then upscale = worse: matte edges amplified, halo streaks)
Order matters: UPSCALE FIRST, THEN REMOVE BACKDROP. Goal look: hole cutout
floating on the page (no dimmed-game-world backdrop, no baked compass).
Consequences once backdrop is stripped:
- The baked game compass goes away WITH the backdrop → app draws its OWN
  compass/wind indicator (SVG, N-up, shows solver windDeg) → the 0-mph
  compass0 farming/lock-in becomes obsolete (keep code until then).
- Prereq: flags must be scrubbed BEFORE any upscale pass (done — inpaint).
- Lie classifier (queue item 2) gets simpler: backdrop = alpha 0, not teal.

### Step A — flag inpaint (DONE this session)
extract-maps darkenStack: all-frames-excluded pixels (single-pin flag zone)
are onion-peel inpainted from surrounding art (+ light blur over the fill)
instead of sourcing the farthest-flag frame (which baked the flag). Flags are
gone from all 21 maps NOW; multi-pin uploads still overwrite with real art.

### Step B — matte + upscale in-pipeline (PROTOTYPED, awaiting user sign-off)
tools/matte-maps.mjs — standalone preview tool, writes to
captures/derived/matte-preview/ (hNN.rgba.png transparent 500×608,
hNN.white.png on white, hNN.mask.png debug, _sheet.png all-21 contact sheet).
NOT wired into the pipeline; nothing shipped yet (black-backdrop lesson).
How it works, and what was learned tuning it:
- HUD first: the dial+caption rect (compass corner detection shared with
  extract-maps) is replaced by a MIRROR of the band above it. Needed because
  on holes whose art reaches the panel floor (H13) the HUD is welded to the
  art component and no island rule can drop it. Onion-inpainting that rect
  instead left flat streaks — reflection keeps the grass texture.
- Art/backdrop split: NO global threshold works. Measured
    H12/H8  backdrop L~72 S~0.55 vs art L~150 S~0.50  (luma separates)
    H20/H21 backdrop L~60 S~0.80 vs art L~130 S~0.55  (saturation separates)
  Backdrop is the dimmed live world: darker AND more saturated (the dim
  overlay crushes one channel toward 0, pushing saturation UP). So
  score = luma − 90·sat, then per-hole Otsu (T_BIAS −4). Per-hole thresholds
  land anywhere from 4 to 77 — that spread is why globals failed.
- Flood from a ring inset FRAME=3 px: the crop's outer pixels are the panel's
  own pale chrome, which walls a border flood out of the image entirely
  (symptom: 98% "art", everything hole-filled).
- Then: components → keep largest + islands ≥300px not in a HUD corner →
  fill enclosed non-art → dilate 2px to reclaim the dark rim → 2× lanczos
  upscale + unsharp 0.45 → bilinear alpha (soft edge).
- RESULT 17/21 clean. Stragglers: H8 (bright lake-shore terraces kept),
  H18 (fragments), H17 (backdrop ridge strands), H13 (keeps its dark plateau
  — arguably correct art — and the mirror patch is faintly visible); minor
  water-colored leaks on H4/H15.
- Premium-art option (user liked the Cloudinary AI result): support
  captures/derived/maps-override/hNN.png — if present, build-derived uses it
  as the hole's art (geometry/pins still from stacks). Hand-feed the external
  upscale+cutout for stragglers once; restacks won't clobber it.
- When shipping: maps.js must switch base64 JPEG → PNG/WebP data URLs (alpha),
  check bundle size (~2MB at 2× with alpha; else composite on card cream
  #FFFDF4), keep MAP_W/MAP_H = 250×304 in App.jsx (coordinate space is
  unchanged — only image resolution doubles), add the app's own SVG compass
  to HoleMap, then retire compass0 farming.

## QUEUE (after the art pass)

### 2. Lie classification from the minimap + editable masks
- New tools/extract-lies.mjs: classify each FINAL map image pixel →
  downsample ×4 → grid ~63×76, codes: 0 OB/unknown, 1 fairway, 2 rough,
  3 bunker, 4 green, 5 water, 6 backdrop (post-matte: alpha=0).
  Heuristics (calibrate on real maps): green = inside derived greenBox;
  bunker r>195&&g>175&&b<175&&r−b>40; water b>g&&b>110&&b−r>25; fairway vs
  rough vs OB by green-channel bands — fairway stripes ≈ rgb(138,200,79)/
  (126,187,74); rough darker; OB darkest. Debug overlay PNGs for review.
- derived.json: holes[n].lieGrid (base64 code bytes) + gridW/H.
- App: on target set/drag, look up code (overrides first) → auto-set lie
  (codes 1/2/3/4; leave lie unchanged for 0/5/6).
- Editable masks: holesMeta[n].lieOver = { "gx,gy": code } via Holes ⚙
  "🎨 Lie mask" canvas editor (tap cycles code). Overrides beat lieGrid.
- Wire extract-lies into autosync's Invoke-Pipeline chain + build-derived.

### 3. Ball-position tracking + lateral drift (bearing column)
- assemble-shots: per session/hole walk, pos₀ = tee (maps.json, map px);
  for each row with bearing+scale: afterPx = after/scale; solve
  |pos + t·u − pin| = afterPx for t (positive root; u from bearing);
  pos ← pos + t·u; attach row.pos (fractional) + row.travelYd (t·scale).
  KNOWN GAP: uses maps.json pin (latest stack's); rows from other-pin
  rounds drift — later: pick session's pin from derived pins by badge yd.
- Lateral drift v1: two-circle intersection — consecutive rows give
  |posₖ−pin|=afterₖ and next address bearing; ambiguity resolves by
  comparing successive shots. Windy rows are where drift matters.
- Surface positions in the app later (shot dots on the hole map).

### 4. Open items (smaller / background)
- Nonlinear power→distance: driver @1 bar went 110yd vs linear 62 —
  upgrade fitClub (piecewise/quadratic) once more partial-power rows exist;
  revisit solver's p = dist/denom inversion.
- 6 unimportable rows lack address frames (club unknown) — label once.
- H1's 3rd pin (384yd round) uncataloged — needs that round's green pair.
- Rough/Bunker/OB popup titles have no glyph templates yet; first labeled
  examples auto-learn via learn-templates (labels.json path).
- If Netlify build minutes ever pinch: debounce auto-pushes.

## Validation habits (keep)
- After any extract change: rebuild, view 2–3 maps/greens as images.
- After assembler changes: check cap anchors still read 3.01/2.01/0.99 and
  stroke-1 bearings ≈ tee→pin geometry.
- classify.mjs --test N against captures/labels.json + manifest truth.
