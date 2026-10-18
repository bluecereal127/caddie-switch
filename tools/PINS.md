# Pins and tees

Where every pin and tee is, how Wii Sports Resort picks a pin, and what Switch
Sports does differently. WSR facts come from its own files (course PMPs and
`main.dol`, US Rev 1). Switch facts come from the player's captures; no Switch
code was read.

## Where WSR keeps them

Each course archive (`DATA/files/Stage/Shared2/glf_course_<id>.carc` on the
disc, a Yaz0-compressed U8) holds `WS2_glf_course_<id>.pmp`, a PMP placement
file, next to the `WS2_glf_course_<id>.kcl` collision mesh. Golf objects are
group 0x0002:

- id 0x0000 is the player start;
- id 0x0001 is a pin; its params are an s16 slot followed by an s16 set;
- id 0x000A is the tee marker.

`tools/wsr-pins.mjs` decodes them, names the hole through
`tools/mesh-holes.json`, maps them into the map frame through
`tools/mesh-registration.json` and checks each pin against the WSR green
outline in `tools/wsr-truth.json` (`onGreen`). Its output `tools/wsr-pins.json`
is committed. Rerun it only if the archives, the registration or the WSR truth
change:

    node tools/wsr-pins.mjs <extracted disc folder, archives or .pmp files> --out tools/wsr-pins.json

All 119 pins lie on their WSR green. All 99 on holes 1–17 reproduce the
community yardage sheet, "WSR Golf the Score Behemoth" (holes 1–18,
docs.google.com/spreadsheets/d/1Lk7KTJlykpDCgdfVEBO_kMaos86zg6jL-Qtb4-5pZ2E):
hole by hole, the decoded yardages are the sheet's (rechecked 2026-10-18 from
its CSV export). The sheet's values are floor(flat distance from the player
start) in yards, and the errors are all in [0, 1). The specials have a sheet
of their own
(docs.google.com/spreadsheets/d/1qbBDsyWwAiZUQSQZVYN1zQ450Neg5xiTcjnL_ixuk84),
which lists 17 of their 18 yardages (its hole 21 "B2" cell is empty; the
decoded value there is 425); all 17 match. Its B1–B6 don't follow the PMP
slot order, which is why the app numbers the specials by slot.

## How WSR picks the pin

Decoded from `main.dol` (US Rev 1), and checked independently by a second
reading of the disassembly. GlfConfig, GlfMain, RPGlfFieldManager,
RPGlfPlayerManager, choosePin and Sp2::Rand are the Caddie project's names.
`addPinSlot` is ours: Caddie has no name for 0x80406b44, and its own
`GlfConfig::setPin(u32)` is the setter for the chosen slot at +0x38.

1. **Loading the hole.** `GlfConfig` is built fresh for every hole. Its 16-slot
   pin table starts at -1 (empty): `+0x40` holds a pin's ordinal and `+0x80` its
   set.
   - The field manager's load (0x80403f44 → 0x80402b70) walks the PMP with
     0x80402834.
   - For each pin object it calls `addPinSlot(slot, ordinal, set)` (0x80406b44),
     with the params' first s16 as the slot and the second as the set.
2. **Choosing the set.** The golf scene's reset (0x803ecac8 → GlfMain 0x80417738
   → 0x803fbd50 → 0x803fa83c) runs before the per-frame sequence. It calls the
   chooser 0x803fa3f4 with the hole's position in the round, which is the
   current hole minus the round's first hole (0x80405f1c). Let k be that
   position plus 1, and s each player's score to par over the round's earlier
   holes (0x80406034).
   - The round's first hole always uses set 1.
   - Rounds of 3 holes or fewer always use set 1. 0x80406164 gives 18 holes
     for the 18-hole mode, 9 for Resort 9 and Classic 9, and 3 for everything
     else: Resort/Classic A–C and Special.
   - Otherwise the set starts at 0. It becomes 1 if the best player's
     s ≥ -k/2, and 2 if the worst player's s < -k/2. If the players straddle
     the line it stays 0, and **set 0 matches every pin**.
   - The honour order is re-sorted at the same time; that is why the function
     recurses.
3. **Drawing the pin.** The hole-start state (0x803f8dec):
   - unpacks the hole's wind from StaticMem (slot hole + 7: direction = low
     3 bits, speed = bits 3–6) and hands it to the field manager;
   - calls `GlfConfig::choosePin(set)` (0x804066e0);
   - places the flag (0x80403ca0).

   choosePin counts the filled slots whose set matches and computes
   u = ((Sp2::Rand() >> 16) & 0xffff) / 65536. It takes the floor(count·u)-th
   match in slot order, so every pin in the set is equally likely (to 1 part in
   65536). `Sp2::Rand` (0x8025c9b0) is an LCG (×0x41C64E6D + 0x3039) XORed with
   a shift register.

Set 1 is the easier "B" set and set 2 the harder "A" set. For one player, a
hole draws an A pin when s ≤ -(⌊k/2⌋ + 1):

| Hole k of the round | 2–3 | 4–5 | 6–7 | 8–9 | 10–11 | 12–13 | 14–15 | 16–17 |
|---|---|---|---|---|---|---|---|---|
| A pins need | −2 | −3 | −4 | −5 | −6 | −7 | −8 | −9 |

This matches the speedrun community's tables (tendog's thread,
speedrun.com/wsr/forums/0t4mu), including Classic 9, where hole 10 is k = 1
and so always B. Two consequences follow:

- 3-hole rounds never show an A pin.
- The specials, whose six pins are all set 1, draw from all six.

Hole 1 has three set-1 pins. Hole 18 has one spot, listed under both sets.

## The spots

Labels: on holes with both sets, the set letter plus L/M/R running west to
east on the minimap. That reproduces the community's names (the Score
Behemoth sheet above) on 95 of 99 pins; the misses are ties:

- hole 3: the two B pins in slots 0 and 1 are 0.1 px apart in x, so the sort
  can't separate them (they come out with the sheet's names swapped: BL 528
  and BM 538 here, BL 538 and BM 528 in the sheet);
- hole 9: the community names were matched to slots by yardage, and the A pins
  in slots 4 and 5 both read 571 yd, so that match was a guess.

Hole 1 has one set, so its pins are L/M/R only. Hole 18's spot and the
specials' are numbered by slot. S1, S2… are Switch-only spots (below).

The yardage is from the WSR start. Map px are in the app's 250×304 frame. ×n
counts the rounds in which the player's captures show the spot.

| Hole | Spots |
|---|---|
| 1 | L 395 (132.8,60.3) ×1 · R 395 (139.7,62.0) · M 401 (137.7,58.2) ×2 |
| 2 | BM 155 (125.2,90.5) · BR 155 (129.6,89.6) · BL 152 (121.0,94.6) ×1 · AL 150 (113.3,99.0) · AM 146 (127.9,99.0) · AR 147 (135.3,96.3) ×1 |
| 3 | BL 528 (151.3,45.7) · BM 538 (151.4,41.6) ×1 · BR 521 (152.0,48.4) · AL 532 (148.6,44.0) ×2 · AM 535 (155.0,42.7) · AR 529 (156.3,45.4) |
| 4 | BL 165 (96.6,105.9) · BR 163 (108.3,102.0) ×1 · BM 162 (103.7,105.1) · AL 168 (89.9,105.9) ×1 · AM 174 (96.1,95.9) ×1 · AR 160 (98.1,110.4) ×1 |
| 5 | BL 558 (144.9,42.3) · BR 562 (151.0,41.5) ×1 · BM 565 (148.2,39.6) · AM 573 (146.2,36.3) · AR 573 (149.8,36.7) ×1 · AL 566 (144.9,39.1) |
| 6 | BM 408 (150.3,54.7) · BR 421 (153.3,48.4) · BL 417 (146.9,49.7) · AL 407 (144.4,54.7) · AR 411 (156.1,53.8) · AM 404 (147.8,56.7) |
| 7 | BL 387 (114.8,77.0) · BM 396 (117.8,73.5) ×1 · BR 392 (120.6,75.8) · AR 392 (117.8,75.0) · AL 386 (111.4,77.3) · AM 397 (115.3,72.4) |
| 8 | BR 155 (134.7,116.0) · BM 162 (130.4,112.5) · BL 167 (128.6,109.8) ×1 · AR 152 (132.8,117.9) · AM 168 (131.4,109.0) · AL 156 (127.2,116.5) ×1 |
| 9 | BM 563 (133.1,40.6) ×1 · BR 555 (137.0,44.1) ×1 · BL 558 (132.2,42.6) · AR 566 (138.1,40.0) ×1 · AM 571 (135.5,37.6) · AL 571 (133.8,37.4) |
| 10 | BL 379 (120.6,49.9) ×2 · BM 371 (123.9,54.0) · BR 379 (127.3,49.6) · AL 375 (118.8,52.1) ×2 · AM 367 (124.6,56.2) · AR 384 (128.0,46.9) · S1 374 (130.7,52.6) ×3 · S2 388 (125.5,44.7) ×2 |
| 11 | BL 136 (124.6,102.4) ×1 · BM 138 (133.7,103.3) · BR 139 (140.0,104.4) · AR 144 (140.1,98.8) ×2 · AM 145 (134.4,95.2) ×1 · AL 133 (130.8,108.1) |
| 12 | BL 459 (104.9,50.2) · BM 469 (107.9,45.6) · BR 461 (107.9,49.4) ×1 · AR 469 (105.3,45.6) · AM 454 (104.1,52.4) · AL 463 (102.5,48.3) |
| 13 | BL 142 (105.2,89.9) · BM 145 (111.9,85.2) · BR 138 (121.6,92.4) · AR 135 (117.3,96.2) · AL 147 (108.1,83.3) · AM 131 (111.9,101.7) |
| 14 | BL 359 (160.3,43.3) ×1 · BR 363 (167.4,40.2) · BM 361 (164.3,41.8) · AL 352 (162.3,47.3) · AM 367 (163.3,37.8) · AR 357 (167.5,43.9) ×1 |
| 15 | BR 335 (139.8,67.2) · BM 341 (138.5,64.1) · BL 339 (136.0,65.4) · AM 340 (143.4,64.1) · AL 347 (142.5,60.4) ×1 · AR 336 (144.9,66.3) |
| 16 | BM 250 (176.5,101.4) · BR 250 (181.9,103.6) ×2 · BL 246 (172.0,102.4) · AL 249 (169.8,99.9) · AM 256 (176.4,97.1) · AR 260 (181.2,96.6) ×1 |
| 17 | BM 220 (136.8,70.1) ×2 · BL 215 (131.1,73.9) ×2 · BR 216 (140.5,75.2) · AM 214 (146.3,78.1) · AR 220 (147.7,73.1) · AL 207 (141.1,83.0) |
| 18 | 1 455 (115.8,49.3) ×1 · S1 458 (119.3,48.3) ×2 |
| 19 | 1 378 (89.9,44.8) · 2 384 (95.2,39.9) ×1 · 3 386 (85.7,41.2) · 4 391 (89.8,36.8) · 5 377 (94.6,44.1) · 6 379 (98.2,42.0) |
| 20 | 1 335 (152.3,52.3) · 2 329 (160.7,56.6) ×1 · 3 339 (158.5,49.7) · 4 340 (162.9,49.7) ×1 · 5 342 (155.7,47.4) · 6 331 (158.5,55.1) |
| 21 | 1 434 (109.0,47.7) · 2 427 (108.6,51.1) · 3 422 (110.3,53.7) · 4 438 (110.3,45.1) · 5 425 (105.2,52.8) · 6 421 (106.9,54.5) · S1 415 (112.9,56.6) ×1 |

## What Switch Sports does (from the captures, 2026-10-18)

### The evidence

- **Zoom sightings:** the pin read from a zoomed green capture, placed through
  the WSR green box. A plain+heightmap pair's pin is read from the heightmap;
  a plain frame with no usable heightmap partner is read on its own through
  the fringe. `pinSources` in `captures/derived/greens/hNN.json` names the
  frame each pin came from, and that frame's round is the sighting's round (a
  pair's plain can belong to another round: H1's W6 plain was paired with a
  W9 heightmap taken 15 min earlier).
- **Tee frames:** each tee frame on its own. The cup is the black ellipse at
  the flag's foot, good to about 2 px. The avatar is the yellow triangle; it
  turns with the aim, so its centroid wanders about 1.5 px. Each frame carries
  its own "yd to go" badge, which is exact (NSS floors flat yards like WSR).
- **Rounds:** a hole's frames of any type at the same wind with no 20-minute
  gap between consecutive ones, 69 rounds on the 21 holes. Wind tells rounds
  apart even when they follow each other: a restart keeps the hole's wind, a
  new round draws it again. The time is the EXIF DateTime the console writes
  into each capture. The ULID in a capture's file name is not it: that is when
  the phone received the file, 4 h to 6.5 h later (240–390 min over the 563
  captures), and a batch transfer reorders files (H11's 409K and Y55H were
  captured in the same minute, EXIF 00:23 both; their ULIDs are 35 min
  apart).
- **Online play:** online Survival Golf frames carry a shot timer at the top
  centre (`tools/lib/online.mjs`). 194 captures score 0.59–0.70 and the other
  369 score 0.25 or less. Samples from both sides of the gap were checked by
  eye: every high scorer shows the timer, and no low scorer does. Online
  captures exist for 12 holes (4, 5, 8, 9, 10, 11, 14, 15, 16, 18, 19 and 20);
  holes 1, 2, 3, 6, 7, 12, 13, 17 and 21 have none.

### Pins

- **NSS reuses WSR's spots.** 38 observations with a zoom reading are credited
  to a WSR spot, a median 1.6 px (2.6 yd) from it, at most 5.1 yd.
- **Some spots are shifted.** On local frames whose cup is clearly one spot,
  the badge reads WSR's start-to-pin yardage exactly for some spots (H2 BL,
  H3 BM, H9 BR, H11 BL, H12 BR, H14 BL) and 1–4 yd off for others from the
  same tee:
  ±1 (H5 BR +1, H20 spot 2 +1, H4 AR −1, H16 AR −1, H16 BR −1), ±2 (H4 AL +2,
  H19 spot 2 +2, H10 AL −2), ±3 (H1 L +3, H7 BM +3, H17 BM +3, H8 BL −3,
  H14 AR −3) and +4 (H3 AL in two rounds, H17 BL). So NSS places some spots
  up to 4 yd from WSR's; WSR's position is kept (the truth rule).
- **Both sets appear.** A pins are credited on 11 holes (2, 3, 4, 5, 8, 9, 10,
  11, 14, 15, 16), 8 of them in local play. WSR never shows an A pin in a
  3-hole round. If the local rounds were 3-hole tracks, NSS picks differently;
  the captures can't say how.
- **Some readings can't be told apart.** 14 observations tie between two
  spots (the second is less than 1 px further than the first). 8 of them have
  local badges, but none fits one spot within 2 yd while missing the other by
  5 (H13 reads 145 against BM 145 and AL 147; H14's W15 round reads 363
  against BR 363 and AM 367). None is credited; all are listed in
  `pinAmbiguous`. They include H6 BM/AM, H7 AR/BM, H12 AM/BL and H13 BM/AL.
  A tee-only reading 5.5–7 yd from a spot (the band) would also land here;
  the only one, H3's W4 round, is credited through the W2 round's AL reading
  (below), so no band entry ships.
- **NSS adds spots of its own.** A spot ships when two independent readings
  agree: two rounds, or a zoomed green plus a tee frame (which can be one
  round).
  - H10 S1 (3 rounds) and S2 (2 rounds), 8.1 and 6.1 yd from the nearest WSR
    spot.
  - H18 S1 (2 rounds), about 8 yd east of WSR's only spot. Its 458 yd badges
    fit it.
  - H21 S1 (1 round: a zoom sighting plus a tee frame), 7.7 yd from WSR
    spot 3. The tee frame reads 416 yd, which fits this spot (415 from the
    start) rather than spot 3 (422); its measured avatar-to-cup distance is
    419.9 yd, 3.9 yd (2.0 px) off the badge, inside the 2.5 px check below.
- **Two candidates wait for a second reading** (`pinCandidates`):
  - **H1 (139.0,66.5):** one round of tee frames reading 384 yd, 11 yd short
    of every WSR pin. It is very likely real; a zoomed green capture the next
    time it comes up would place it.
  - **H19 (96.8,34.0):** one zoom sighting, contradicted by its own round's tee
    frame, which shows WSR spot 2.

### Tees

- **Local play tees off from the WSR player start by default.** Local avatars
  stand a median 1.8 yd and at most 4.8 yd from it (not counting H10's
  post-shot frames, below), and local badges match WSR's start-to-pin
  yardages within the shifts above. Local frames also offer "Shot Position"
  (ZR) and "Reset Stance", so the ball can be moved before the shot; the badge
  is the authority.
- **Online Survival Golf tees off from a platform.** Several players stand on
  a white-railed platform under the shot timer. The platform sits 4.6–11.9 yd
  from the WSR start on 10 of the 12 holes with online captures:

| Hole | WSR start (px) | Online tee (px) | Apart | Plays | Frames / rounds |
|---|---|---|---|---|---|
| 4 | 169.4,242.0 | 175.8,251.1 | 11.9 yd | +11.8 yd | 3 / 1 |
| 5 | 126.1,265.1 | 127.5,269.6 | 11.7 yd | +10.9 yd | 8 / 1 |
| 8 | 144.6,206.4 | 143.5,211.8 | 9.4 yd | +8.8 yd | 7 / 1 |
| 9 | 104.8,263.4 | 105.5,266.8 | 8.6 yd | +8.1 yd | 7 / 1 |
| 14 | 179.0,267.2 | 181.9,267.0 | 4.6 yd | 0.0 yd | 5 / 1 |
| 15 | 149.7,254.9 | 148.5,258.2 | 6.3 yd | +5.8 yd | 9 / 1 |
| 16 | 111.3,255.9 | 109.0,260.1 | 7.1 yd | +7.1 yd | 11 / 1 |
| 18 | 83.2,259.6 | 81.5,261.5 | 5.5 yd | +4.7 yd | 6 / 1 |
| 19 | 158.3,271.4 | 160.9,276.6 | 9.4 yd | +9.3 yd | 8 / 1 |
| 20 | 146.0,276.2 | 147.9,282.5 | 9.9 yd | +9.3 yd | 11 / 1 |

"Plays" is how much longer it is to the green's centre. The online tee is the
raw median of the frames' avatars; no badge corrects it. H14's platform sits
beside the start, not behind it.

- **Where the online tee isn't shipped.** On holes 10 and 11 the online
  avatars stand a median 1.9 and 2.8 yd from the WSR start (0.8–6.0 yd per
  frame), which the WSR start already covers. On holes 1, 2, 3, 6, 7, 12, 13,
  17 and 21 there are no online captures yet, so the app offers only the local
  tee there.
- **Each row is one round.** A player's place on the platform varies within a
  round by about 4–6 yd (per frame, H5's avatars stand 7.1–12.9 yd from the
  start, H8's 6.7–11.4, H9's 5.0–10.5), so each shipped position is a median
  over frames. H11 is the only hole with two online rounds: their avatars
  stand a median 3.1 and 5.0 yd from the start. So the badge is the
  authority.
- **H10's frames 6–8 yd ahead of the tee are not a tee.** They are local
  frames taken after a short first shot, reading 365–367 yd with the address
  frames showing various clubs, between 374 yd tee frames of the same
  sitting.
- **The earlier "moved tees" reading.** On holes 4, 5, 8, 15, 16, 19 and 20 the
  Switch seemed to have moved the tee. That came from map stacks built from
  online frames.

### Still unknown

- **NSS's pin rule**, and whether online and local rounds differ in it.
- **H9:** the online avatars stand 5–10 yd behind the start (median 8.6 yd,
  the shipped tee, which plays 8 yd longer to the green), but the badge, 569,
  is only 3 yd longer than WSR's start-to-AR yardage of 566.
- **H3:** two rounds (W2 on 08-20 and W4 on 08-21) read 536 yd with the cup at
  the same place (1 px apart), 4.0 and 5.8 yd from AL. The W2 round's zoom
  sighting is AL by position, so both are credited to AL; but the badge is
  4 yd longer than AL's 532, so either NSS's AL is shifted or this is a spot
  of its own.

## How the pipeline uses this

- `tools/extract-greens.mjs` reads a pin from every plain+heightmap pair (from
  the heightmap) and from every plain frame its fringe path accepts, and
  records the frame each came from in `pinSources`, so a sighting's round is
  judged by the frame it was read from.
- `tools/extract-maps.mjs` records `teeFrames` per hole in `maps.json`. Each
  entry has the frame's badge, whether it is online (`tools/lib/online.mjs`),
  its four largest yellow blobs and its cup centre.
  - Tee frames are picked per mode. The badge threshold is 0.88 of the hole's
    tee length, but the online platform can play longer: on H4 it is 186 yd
    against 170 from the start, so a local round reading 159 yd fell under
    0.88 × 186. Each mode now uses the longest of its own badges inside the
    hole-wide band, which admits H4's W13 round and drops nothing.
  - The wind dial is masked only in the corner it occupies. `dialCorner`
    scores the dial's ring where the panel draws it (radius 0.082 of the
    panel width, centred 0.18 or 0.82 across at 0.829 down): the dial's
    corner scores 68–72 of 72 angles on every map frame, the other corner
    0–17. Masking both corners clipped the avatar on holes 4, 11 and 14.
  - The avatar triangle can split into a body and a tip (H11 QAW2: 37 + 8
    px); blobs whose boxes lie within 3 px are merged, and centroids are at
    pixel centres, so the local avatars land a mean (−0.2, −0.2) px from the
    WSR start over 161 frames.
  - build-derived takes the yellow blob nearest the WSR start as the avatar.
- `tools/build-derived.mjs` builds pins and tees as follows.
  - **Rounds.** Every classified frame of a hole is timed by its EXIF
    DateTime (`tools/lib/exif.mjs`; the ULID is the fallback for a capture
    without one) and chained per wind with a 20-minute gap. A reading is
    filed under its source frame's round; a reading whose frame is not
    classified under the hole is dropped and logged.
  - **Readings.** Zoom: one per source frame (`pinSources[i].from`; a
    heightmap paired twice is read once; cropped pairings only when a hole
    has nothing else). Tee frames: cups whose badge agrees with the measured
    avatar-to-cup distance within 2.5 map px at the hole's scale. The
    tolerance is in px because the error is: the cup is good to 2 px and the
    avatar wanders 1.5 px, while a yard is 0.4–1.1 px. Over the 141 tee
    frames with a badge, avatar and cup, the misses run to 2.1 px, then come
    15 frames at 2.7–3.1 px, all from H10's wind-4 sitting, whose tee-frame
    cup is detected 1.5–2 px north of S1's zoom position (the badge is 2.4 yd
    off that position and 5.1 yd off the cup), and 5 OCR misreads at 8 px
    and more; 121 frames pass. A fixed 3 yd was 1.2–1.5 px on the long
    holes and failed 9 sound frames (H8 ×3, H9 ×4, H12, H21's A6KE).
  - **Observations.** Within a round, one observation per physical pin. A
    tee-frame cup joins the zoom reading it agrees with (within 2.5 px).
  - **Crediting a WSR spot.** An observation is credited to the nearest WSR
    spot within 5.5 yd, unless the next spot is less than 1 px further. Then
    the badges of the local frames whose avatar is within 5 yd of the start
    decide, against each spot's decoded WSR yardage: one spot must fit
    within 2 yd and the other miss by 5 (H9's W20 round: 565 against BM 563
    and AL 571). Otherwise the observation goes to `pinAmbiguous`.
  - **The band.** A tee-only observation beyond 5.5 yd of every spot but not
    7 yd and 3 px clear of them cannot start a Switch-only spot. It takes the
    spot of another round's credited observation within 2.5 px of it (H3's
    W4 round, 1 px from the W2 round's AL reading), else joins a Switch-only
    spot within 5.5 yd, else goes to `pinAmbiguous` with that one spot.
  - **Switch-only spots.** Unmatched observations merge across rounds within
    5.5 yd. A spot ships as S1… once two independent readings agree (two
    rounds, or a zoom capture and a tee frame); otherwise it goes to
    `pinCandidates`. S-numbers follow first sighting, so a spot keeps its
    number when later rounds change which one is seen most.
  - **`seen`** is the number of rounds.
  - **`tee`** is the WSR start. **`teeOnline`** is the median avatar of the
    online tee frames (at least 2), shipped when at least 4 yd from the
    start, with `n` frames and `sessions` rounds. The badge does not correct
    it: NSS keeps some spots a few yards from WSR's, so sliding the avatar to
    the badge distance from a WSR spot moved the tee by the spot's offset
    (H9: 8.6 yd raw, 3.5 yd slid, and the tee was withheld).
  - **Diagnostics.** `captures/derived/pin-observations.json` lists every
    observation with its round (numbered over all the hole's rounds, so the
    numbers skip where a round produced no reading), wind, whether the round
    is online, its outcome and its readings (zoom readings by the frame the
    pin was read from). `captures/derived/tee-frames-used.json` lists the tee
    frames the pins and the online tee used, which `tools/frame-audit.mjs`
    reads. `PIN_DEBUG=<hole>` prints one hole's observations.
- **App:**
  - Pins show their label; in pin-edit mode only the player's own pins and
    the current pin are named, the rest are bare flags. A pins have a red
    cloth, Switch-only spots are dashed, and the player's own pins are P1,
    P2…. A tooltip (with a pointer) gives the set, the yardage and the rounds
    seen, on the hole map, the zoomed green and the pin chips.
  - "⛳ Online tee" puts the ball on the online tee, and a thin white ring
    around the ball shows while it is there.
  - Pipeline pins keep the player's current pin on the nearest new spot when
    they change (`src/derivedMerge.js`).
