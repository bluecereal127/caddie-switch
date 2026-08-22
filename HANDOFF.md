# HANDOFF — remaining work queue (2026-08-21)

Read CLAUDE.md first (mechanics, conventions, pipeline map). This file is the
work queue if a session/model handoff happens mid-stream. Auto-push policy is
standing: verify (babel parse App.jsx + `npm run build`) → commit → push
(Netlify deploys main). The PC scheduled task "CaddieAutosync" runs the whole
capture pipeline; after editing autosync.ps1 restart it (Stop/Start-ScheduledTask).

## Badge OCR is NOT trustworthy — never let one reading drive a hole
Three failures found 2026-08-21 when five holes of new captures landed, all
from the same root cause (a single OCR'd badge steering hole-level state):
- A putt reading "33.3 ft to go" came through as "599 yd" on H18 (a 458yd
  hole). That inflated maxYd, which raised the tee threshold to 527, which
  admitted the putting CLOSE-UP into the map stack and rejected the four
  genuine 458/459yd tee frames. H18's recorded length became 119yd and its
  scale 0.546 instead of 2.103.
- H17's "219 yd" read as "819 yd" — scale 4.345 instead of 1.163, wrong by
  3.7x, and wrong since long before this batch.
- H15's scale went 1.816 -> 5.097 the same way.
Defences now in place, keep them:
1. checkerFrac veto: when the player putts, the minimap zooms to the green
   and the avatar is still on screen, so the classifier calls it "map". The
   grid checker separates them — hole overviews ran 4.6-5.0% of the panel,
   real green captures 9.5-10%, H18's putt 12.7%. The cut is RELATIVE per
   hole (max(7%, 1.8x that hole's median)): a fixed 7% wiped out H6, H11 and
   H19 entirely, because short holes are framed tighter and their green
   legitimately fills more of the panel.
2. Hole length: drop readings above 1.6x the median before taking the max,
   then pick the candidate whose implied scale lands in 0.7-3.2 yd/px. The
   panel frames every hole to roughly fill it, so that band is physical.
3. Take the yardage from the DETECTION SESSION's own frames — pins move
   between rounds, and scale = yards / (tee->pin px) needs both from the
   same pin.
4. findCluster excludes BOTH bottom corners now. The dial floats to whichever
   corner avoids the hole and its arrow is yellow at 10-19 mph, the same
   colour as the avatar pointer, so on left-dial holes the arrow was being
   detected AS the avatar.
An avatar-position tee test was tried and rejected: the pointer orbits the
ball as aim turns, and the orbit is wider in px on short (zoomed-in) holes,
so no single tolerance worked — H11's own Stroke-1 frames scattered 14.7px.

## CAPTURE WORKLIST — run the tool, don't guess
`node tools/capture-plan.mjs [--table]` reads what the pipeline actually
derived and ranks what to shoot next. Re-run it after every upload batch; it
is the source of truth for this section. Four independent needs:
- AIM   tee frames whose aims DIFFER (the world under the panel only churns
        when the camera turns, and that churn is the matte's whole signal)
- FLAG  tee frames from a round with the pin somewhere new (only then can the
        stack show real art under the flag instead of an inpaint)
- PIN   green captures at a new pin position (the flag hides the surface it
        stands on; only a different pin reveals it)
- ZOOM  another green pair, plain + Terrain back to back, to fuse against
As of 2026-08-21: H1 H9 H10 H14 H16 need nothing. Worst are H15 H19 H6 H13
H12 H21 H5 H20 (all four needs). H11 needs AIM only; H8 needs PIN only.

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
- Greens: EVERY plain/heightmap frame in a session pairs now (it used to take
  s.find() of each kind and drop the rest — 11 dead frames on one H10
  session). Zoom-mismatch guard rejects pairs whose diff blows up past 42% of
  the panel. Outlines FUSE across pairs (a flag only ever subtracts green, so
  union fills the notch it bit) and are traced to a ≤44-pt polygon shipped as
  greenPoly; the app draws it instead of the old rectangle. Heights fuse by
  cell weight. Pins cluster at 0.02 and average, so repeat sightings sharpen
  a pin instead of duplicating it. Plain-only frames contribute via the
  FRINGE detector (tools/lib/greensurface.mjs): the surface's grid checker
  gives a regular local luma range while the fringe is flat, so the boundary
  is a texture edge needing no heightmap — mean IoU 0.787 vs the diff masks,
  gated on bbox-normalized shape agreement (NOT area: zoom varies).
- Shots: address+popup pairs → importable Log rows w/ bearing (40 rows, 34
  importable).
- Frame accounting: `node tools/frame-audit.mjs` says which stage consumes
  each capture, or that it is inert. Currently 47 inert of 369.
- Solver UX: 1500px shell, 3-col solver on xl; tee-default draggable target,
  windDeg N-up canonical, draggable rec bars, trees hide toggle, ball dot
  r=1.5. Pins: only the SELECTED pin draws during play (the whole catalog
  shows only in pin-edit mode) — the show/hide-pins toggle is gone.

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

HARD REQUIREMENT (user, 2026-08-21): the cutout must KEEP water and the
out-of-bounds dark rough. They are hole art, not backdrop.

How it works, and what was learned tuning it:
- Backdrop = the LIVE 3D WORLD the panel is composited over, and aiming
  rotates the camera, so across pooled frames the world churns while the map
  layer is pixel-identical. extract-maps writes that per-pixel luma range to
  captures/derived/maps/hNN.var.png and the matte segments on MOTION.
- Colour rules were tried first and are dead ends — recorded so nobody
  retries them: dark OB rough and water are art but read as "dim", so every
  luma/saturation threshold either keeps the world or eats the rough. Even
  per-hole Otsu on (luma − 90·sat) fails: H12's panel is ~all art and Otsu
  must split something, so it halved the hole.
- Motion alone leaves rectangular slabs: nothing is visible moving INSIDE a
  uniform hillside (aperture problem). Fixed by growing the world through
  colour continuity (≤17 sum-|dRGB|) but ONLY across smooth pixels
  (Sobel < 10) — art carries stripes and outlines, world slabs are
  featureless, so the growth stops at the cutout.
- Seeds are gated: only moving components ≥600px may seed the world. Stray
  movers (aim dots clipped by the panel edge) otherwise open a door for the
  growth to swallow a hole whose map fills the panel.
- Opening (r=2) on the motion mask first: the aim line and dots move too and
  give the flood a 2px catwalk into the fairway, carving the line out.
- Flood from a ring inset FRAME=3px: the crop's outer pixels are the panel's
  pale chrome, which walls a border flood out entirely (symptom: 98% "art").
- If <2% of the panel moved, the pool never re-aimed and a cutout would be a
  guess — the panel is kept whole (H12, correctly: it IS all art).
- HUD: dial disk (r+11) + NEUTRAL-white caption glyphs are onion-inpainted
  then blurred. The caption test must require low saturation — "pale" alone
  masked H12's pale cyan lake and filled it with rough (this was the
  bottom-right artifact the user spotted). Whatever the dial covered is
  genuinely unknown (no frame ever shows it), so the fill is invention;
  blurred it reads as out-of-focus terrain instead of a hard wedge.
- DEAD END, do not retry: dropping "outlier" frames before measuring motion.
  When most of the pool shares one aim the median IS that aim, so the few
  re-aimed frames — the only ones carrying signal — get flagged. H1 lost 2 of
  7 and went blind.
- RESULT: rough/water now retained. Stragglers for the override path: H8
  (fragments; its pool has a misregistered frame → ~80% "moving"), H19 and
  H21 (one world slab each survives), plus small edge nibbles.

### The capture lever (tell the user before they grind captures)
Quality here is driven by AIM DIVERSITY at the tee, not frame count. Every
distinct aim rotates the camera, so more of the world underneath churns and
the motion signal sharpens; frames that share an aim add nothing. Two knobs
now support that:
- extract-maps POOL_MAX = 16 (was a flat `slice(-9)` of the most recent).
  Frames are chosen by farthest-point selection on a downsampled signature,
  so the pool is the most VISUALLY DIFFERENT 16, not the newest 16.
- overlayMask also masks each frame's aim line and avatar (+2px). This is
  load-bearing once aims vary: the swept line is grass in most frames and
  line in a few, which reads as motion and carved a strip out of H10's
  fairway. MEASURED: the aim line is CYAN — (49,239,249), (55,235,255) — so
  the test is r<120 && g>215 && b>225, plus a white test for its core and the
  ball dot. An all-channels-bright test misses it completely (r is ~50); that
  bug shipped briefly. Pale lake water is ~(150,220,215), which the r<120
  floor excludes.

### Frame-eligibility facts (measured 2026-08-21, don't re-derive)
- Two TEE frames of the same hole are ~94% pixel-identical (H1): the map
  layer registers exactly, only the 3D world and the overlays differ. This is
  what makes motion segmentation work.
- A tee frame vs a MID-ROUND frame of the same hole is ~5% identical: the
  minimap re-frames (zoom/pan) as you advance up the hole. Mid-round frames
  are therefore unusable in the stack and in the motion map — the existing
  tee-only filter is correct and must stay. 56 of the 215 map frames in the
  inbox are mid-round and are excluded for this reason, not by oversight.
- Framing follows POSITION, not club. Club selection at the tee only changes
  the aim line's length, so clubbing down (wedge) is safe and mildly helpful.
- Stroke-1 frame counts per hole (2026-08-21): H10=12, H12=7, H11=6, H9=5,
  most others 2-4. H12 has 7 tee frames that are near-identical — plenty of
  frames, no aim variety — which is exactly why it reads ~0% motion.
Self-correcting: a hole whose panel is genuinely all art (H12) keeps reading
~0% motion no matter how much the aim varies, and stays whole — while a hole
that does have world behind it starts cutting as soon as varied frames land.
What aim rotation CANNOT recover: the terrain under the wind dial. It is
occluded in every frame, so that fill stays invented (inpaint + blur).
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
