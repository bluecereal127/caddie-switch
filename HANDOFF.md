# HANDOFF — remaining work queue (2026-08-21)

Read CLAUDE.md first (mechanics, conventions, pipeline map). This file is the
work queue if a session/model handoff happens mid-stream. Auto-push policy is
standing: verify (babel parse App.jsx + `npm run build`) → commit → push
(Netlify deploys main). The PC scheduled task "CaddieAutosync" runs the whole
capture pipeline; after editing autosync.ps1 restart it (Stop/Start-ScheduledTask).

## State as of commit 9318035 (all DONE, deployed)
- Capture transport: edge function → blobs → autosync → classify (template
  OCR, 113/113 validated) → extract-maps/greens → assemble-shots →
  build-derived → auto-commit+push. Zero manual steps.
- Maps: darken-stack over ≤9 pooled tee frames with per-frame flag/compass
  exclusion; near-black backdrop; compass = game's own, LOCKED per hole from
  the first 0-mph tee frame (captures/derived/compass0/, H1/H6/H10/H17
  locked; user farms 0-mph frames for the rest — lock is automatic).
  Baked pin flags are NOT composited anymore: they scrub out once a hole has
  frames from ≥2 pin positions; until then the old flag lingers (accepted).
- Greens: boundary + fused (all uncropped sessions, weighted) height field →
  9×9 grid; pins accumulate; zoom-aware.
- Shots: address+popup pairing → rows (power from gauge dot, ended from
  distance chain, lie from prev popup title, club OCR fuzzy, wind speed +
  aim-relative direction from top-right arrow, per-shot map BEARING =
  panel-compass(N-rel) − top-right(aim-rel)); rows ride derived.json →
  app auto-Log + club refit. 34 importable rows live.
- Solver UX (this commit): tee default + draggable target (grab cursors),
  typed distance slides an existing target / default line otherwise, windDeg
  stored N-up canonical (rel-to-shot is a view), full-width map, tree
  add/remove toggle, rec power bar draggable with quarter dots.

## QUEUE (user-approved, in order)

### 1. Minimap upscaling (crispness at the new larger canvas)
- In tools/build-derived.mjs, before JPEG-encoding maps.js entries: upscale
  each 250×304 map 2× (bilinear) + unsharp mask, encode q≈80.
- Do NOT touch MAP_W/MAP_H in App.jsx (stay 250×304 — they define the
  coordinate space; scale values are yd per 250-space px; fractional coords
  are image-resolution-independent).
- Bundle grows ~4×maps (~2MB total) — acceptable.

### 2. Lie classification from the minimap + editable masks
- New tools/extract-lies.mjs: classify each FINAL map image pixel →
  downsample ×4 → grid ~63×76, codes: 0 OB/unknown, 1 fairway, 2 rough,
  3 bunker, 4 green, 5 water, 6 backdrop(black).
  Heuristics (calibrate on real maps): green = inside derived greenBox;
  bunker r>195&&g>175&&b<175&&r−b>40; water b>g&&b>110&&b−r>25; backdrop =
  the near-black we painted; fairway vs rough vs OB by green-channel bands —
  user gave fairway stripes ≈ rgb(138,200,79)/(126,187,74); rough darker;
  OB darkest green. Write debug color overlay PNGs for visual verification.
- derived.json: holes[n].lieGrid (base64 of code bytes) + gridW/H.
- App: on target set/drag, look up code (overrides first) → auto-set lie
  (codes 1/2/3/4; leave lie unchanged for 0/5/6).
- Editable masks: holesMeta[n].lieOver = { "gx,gy": code } painted in a
  Holes ⚙ "🎨 Lie mask" canvas editor (tap cycles code); persists like other
  holesMeta data. Overrides beat lieGrid at lookup.
- Wire extract-lies into autosync's Invoke-Pipeline chain + build-derived.

### 3. Ball-position tracking + lateral drift (bearing column)
- assemble-shots: per session/hole walk, pos₀ = tee (maps.json, map px);
  for each row with bearing+scale: afterPx = after/scale; solve
  |pos + t·u − pin| = afterPx for t (positive root; u from bearing);
  pos ← pos + t·u; attach row.pos (fractional) + row.travelYd (t·scale).
  KNOWN GAP: uses maps.json pin (latest stack's); rows from other-pin
  rounds drift — later: pick session's pin from derived pins by badge yd.
- Lateral drift v1: two-circle intersection — consecutive rows give
  |posₖ−pin|=afterₖ and next address bearing; ambiguity (left/right root)
  resolves by comparing successive shots. Windy rows are where drift
  matters (c-coefficient fitting).
- Surface positions in the app later (shot dots on the hole map).

### 4. Open items (smaller / background)
- Nonlinear power→distance: driver @1 bar went 110yd vs linear 62 —
  when more partial-power rows exist, upgrade fitClub (piecewise or
  quadratic in power); revisit solver's p = dist/denom inversion.
- 6 unimportable rows lack address frames (club unknown) — could be
  labeled once by vision agents and imported.
- H1's 3rd pin (384yd round) uncataloged — needs that round's green pair.
- Rough/Bunker/OB popup titles have no glyph templates yet (only
  Fairway/Green seen); first labeled examples auto-learn via
  learn-templates (labels.json path).
- Wind badge idea (rejected as map overlay) — dial below map is canonical.
- If Netlify build minutes ever pinch: debounce auto-pushes.

## Validation habits (keep)
- After any extract change: rebuild, view 2–3 maps/greens as images.
- After assembler changes: check cap anchors still read 3.01/2.01/0.99 and
  stroke-1 bearings ≈ tee→pin geometry.
- classify.mjs --test N against captures/labels.json + manifest truth.
