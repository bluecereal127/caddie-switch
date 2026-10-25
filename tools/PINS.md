# Pins and tees

Where every cup and tee is, how Nintendo Switch Sports picks the cup, where
the online platform stands and who stands where on it, and what the captures
showed. Since 2026-10-24 (the user: NSS's data replaces WSR's) the app's pins,
tee and platform are NSS's own, read from the user's NSS 1.5.0 dump: the
course models' bones, the HoleCover packs, GolfFieldMgrParam, the platform
models and the main NSO, plus Eden's RAM, each decode re-derived by an
independent verifier (the git-ignored eden dump,
`tools/harness/state/eden/nss-golf-x/`: REPORT.md sections 3 and 5, pins.md,
platform.md, slots.md, and verify/). WSR's pin spots and how WSR picks among
them follow under "WSR's spots": the playbook's and the Dolphin harness's
reference, no longer the app's.

## NSS's cups

### Where NSS keeps them

Six cups per hole, 126 in all, verified from five independent sources:

- the bones `GolfCourseNNhole0..5` of the course model
  `Model/Fld_GolfCourseNN.bfres.zs`, children of an identity root (on H16
  under `holelocator`), in world metres at the cup bottoms;
- the cup mesh (material `Glf_HoleCup_M`): exactly six clusters of 84
  vertices a hole, each of radius 0.150 m, centred within 0.3 mm of a bone;
- each putting-green mesh (`Glf_Green_M`): seven boundary loops, the outer
  edge plus six 0.15 m holes on the six bones;
- 126 `Object_BGOBJ_GolfCourseNNHoleCoverK` packs, k 0–5 only: each cover's box
  centre within 5.5 mm of its own bone in xz, 0.299–0.338 m above it; the
  cover is a 0.15 m disc of green that plugs a cup not in play;
- the collision meshes: a real cup at each bone (a flat bottom of r
  0.150–0.155 m, 0.30–0.34 m below the green, green all round), the bones on
  the bottoms within 1 mm except H20 k2 (20.8 mm above).

The code formats `GolfCourse%02dhole%d` and spawns covers k = 0..5 with no
skip; for the cup in play it stores (x, y + 0.3, z), where the flag pin
stands. No Banc (placement scene) places a cup, cover, pin or start actor.

`tools/nss-export.mjs` writes them into the committed `tools/nss-pins.json`
(map x, y through `tools/nss-registration.json`; `world`; `surfaceY` /
`surfaceYd`, the green over the cup, the top of HoleCover k, 0.298–0.339 m
above the bone; `mesh`; `difficult`; `ydFromWsrStart` and `ydFromTeeObj`;
`nearestWsr` and `wsr`), and `tools/build-derived.mjs` ships them as
derived.json pins `c0`..`c5`, labelled 1–6, `yd` = floor(flat yards from
GlfTeeOBJ to the cup), `src: "nss"`, `seen`, `difficult`, `wsr`. All 126 are
inside their green outline and on terrain class 6 (tools/test-pins.mjs). The
cups of a hole stand at least 2.06 map px apart (H9 c2 / c4).

### Difficult cups

`Parameter/GolfFieldMgrParam/Default.elsa__parameter__GolfFieldMgrParam.bgyml`,
`HoleParams[i].CupDifficulties`, marks 16 cups (labels = k + 1): H5 5, H6 6,
H7 5, H8 4, H9 3, H14 6, H16 1 and 5, H17 1, H18 4, H19 2 and 6, H20 3 and 5,
H21 1 and 6. The array is absent on holes 1–4, 10–13 and 15. The same file's
pars (4,3,5,3,5,4,4,3,5,4,3,5,3,5,4,4,3,5,4,4,4) match the app's. No field ties
a cup to WSR's A / B sets. The app draws the difficult ones red.

### How NSS picks the cup

Read from the main NSO (verified by a second reading; what the modes mean is
inferred):

1. If a settings byte ([x23+0x34]) is 0, the cup in play is cup 0.
2. Otherwise a candidate list of up to six is built, Fisher–Yates shuffled with
   xorshift128 (j = n·r >> 32) seeded from the round's per-hole seed, and the
   LAST entry becomes the cup in play.
3. The list is all six cups, or filtered through CupDifficulties:
   - mode word 1 (inferred: online play) with a value (inferred: the player's
     rating) under `DifficultCupRatingThreshold` (in no RomFS file; the code's
     fallback is 500): the non-difficult cups only;
   - mode word 0 with a settings bit: a score test (resembling WSR's A / B rule)
     gives only the difficult cups or only the others;
   - an empty list falls through to cup 0 (inferred).

That the cup in play's own cover is switched off is implied (the green mesh
has all six holes open), not traced. The seed's source (whether restarts or
online players share a cup) is open.

### The cups

Per hole: par, then each cup as label (`*` difficult), derived.json's `yd`
(floor of the flat yards from GlfTeeOBJ), its spot in map px of the 250×304
frame, ×n the rounds the captures credit to it, and the nearest WSR spot with
its distance in yd (`= spot` where the cup is that spot, within 0.3 yd).

| Hole | Par | Cups |
|---|---|---|
| 1 | 4 | 1 400 (137.1,57.7) ×2 (M 1.4) · 2 391 (130.2,61.1) (L 5.3) · 3 394 (140.3,61.7) (R 1.3) · 4 383 (132.0,65.4) (L 9.9) · 5 398 (131.6,57.3) ×1 (L 6.0) · 6 384 (138.8,66.3) ×1 (R 8.3) |
| 2 | 3 | 1 152 (118.3,95.6) ×1 (BL 2.7) · 2 160 (129.6,84.4) (BR 5.0) · 3 147 (116.7,100.7) (AL 3.7) · 4 150 (133.6,94.7) ×1 (AR 2.3) · 5 157 (125.1,88.8) (BM 1.6) · 6 157 (116.7,90.6) (BL 5.7) |
| 3 | 5 | 1 523 (150.9,47.7) (BR 3.1) · 2 538 (151.3,41.6) ×1 = BM · 3 529 (148.6,45.4) (AL 3.2) · 4 527 (156.1,46.4) (AR 2.2) · 5 537 (147.2,42.3) ×2 (AL 5.4) · 6 537 (154.7,42.3) (AM 1.1) |
| 4 | 3 | 1 165 (94.6,106.5) (BL 2.2) · 2 159 (101.1,108.9) ×1 (AR 3.5) · 3 170 (90.0,103.4) ×1 (AL 2.7) · 4 175 (94.6,95.7) ×1 (AM 1.6) · 5 168 (103.7,98.4) ×1 (BR 6.3) · 6 161 (106.8,105.0) (BM 3.3) |
| 5 | 5 | 1 563 (149.8,40.8) ×1 (BR 3.4) · 2 559 (144.5,42.0) (BL 1.0) · 3 566 (147.4,39.7) (BM 2.2) · 4 575 (149.8,36.2) ×1 (AR 1.1) · 5* 571 (144.9,37.5) (AL 4.0) · 6 575 (147.4,36.0) (AM 3.1) |
| 6 | 4 | 1 410 (155.0,54.2) (AR 2.3) · 2 407 (148.3,55.0) ×1 (AM 3.5) · 3 412 (146.1,52.2) (BL 5.2) · 4 418 (147.4,49.1) (BL 1.4) · 5 421 (154.1,48.3) (BR 1.5) · 6* 402 (146.7,57.2) (AM 2.5) |
| 7 | 4 | 1 389 (120.7,76.6) (BR 1.6) · 2 386 (113.0,77.3) (AL 3.3) · 3 392 (117.8,75.1) ×1 = AR · 4 399 (114.5,71.2) (AM 3.1) · 5* 393 (112.2,74.0) (AL 7.4) · 6 399 (119.0,71.9) ×1 (BM 4.3) |
| 8 | 3 | 1 164 (126.7,111.6) ×1 (BL 4.5) · 2 153 (133.8,117.3) ×2 (AR 2.0) · 3 157 (130.0,115.5) (AL 5.1) · 4* 166 (131.4,109.8) (AM 1.4) · 5 161 (135.1,112.5) (BR 6.0) · 6 154 (125.7,118.0) ×1 (AL 3.6) |
| 9 | 5 | 1 555 (137.0,44.1) ×1 = BR · 2 557 (131.8,42.6) (BL 1.1) · 3* 570 (132.9,37.7) (AL 2.4) · 4 566 (136.8,39.5) (AR 3.5) · 5 565 (132.3,39.6) ×1 (BM 3.3) · 6 562 (139.0,41.5) ×1 (AR 4.4) |
| 10 | 4 | 1 380 (119.4,48.8) ×2 (BL 2.9) · 2 369 (123.8,54.7) (BM 1.3) · 3 381 (127.5,48.4) ×1 (BR 2.2) · 4 373 (118.7,52.8) ×2 (AL 1.2) · 5 387 (124.6,44.7) ×2 (AR 7.3) · 6 374 (129.8,52.5) ×3 (BR 7.0) |
| 11 | 3 | 1 136 (124.6,102.4) ×1 = BL · 2 136 (132.0,105.2) ×1 (BM 2.2) · 3 135 (137.4,108.9) (BR 4.6) · 4 140 (142.9,105.1) (BR 2.7) · 5 146 (139.2,96.1) ×2 (AR 2.5) · 6 144 (130.7,95.4) ×1 (AM 3.3) |
| 12 | 5 | 1 465 (103.8,47.6) (AL 3.2) · 2 467 (106.8,46.8) (BM 3.4) · 3 461 (106.8,49.9) ×1 (BR 2.5) · 4 457 (103.3,51.4) ×1 (AM 2.9) · 5 464 (108.6,48.3) (BR 2.7) · 6 470 (104.5,45.5) (AR 1.7) |
| 13 | 3 | 1 141 (105.1,89.9) = BL · 2 145 (108.1,85.2) ×1 (AL 1.6) · 3 139 (119.8,90.6) (BR 2.3) · 4 135 (106.4,97.2) (AM 6.3) · 5 132 (114.3,99.1) (AM 3.2) · 6 140 (114.4,89.9) (BM 4.8) |
| 14 | 5 | 1 359 (159.7,41.8) ×1 (BL 2.7) · 2 363 (164.4,39.3) ×1 (AM 2.8) · 3 357 (167.4,42.9) (AR 1.6) · 4 354 (164.8,44.9) ×2 (AR 4.5) · 5 354 (162.2,45.2) (AL 3.4) · 6* 362 (162.2,39.9) (AM 3.9) |
| 15 | 4 | 1 337 (137.5,66.0) (BL 2.9) · 2 344 (143.4,61.4) (AL 2.2) · 3 334 (144.3,66.9) (AR 1.5) · 4 349 (140.7,59.0) ×1 (AL 4.1) · 5 336 (141.6,66.3) ×1 (BR 3.6) · 6 342 (137.6,63.1) (BM 2.4) |
| 16 | 4 | 1* 252 (175.6,99.9) ×1 (BM 2.7) · 2 259 (181.1,97.6) ×1 (AR 1.6) · 3 255 (184.4,102.0) (BR 4.5) · 4 247 (172.0,102.6) = BL · 5* 258 (176.8,96.6) (AM 0.9) · 6 249 (180.1,104.6) ×2 (BR 3.0) |
| 17 | 3 | 1* 216 (142.6,76.0) (BR 2.5) · 2 223 (136.7,68.1) ×2 (BM 2.3) · 3 219 (132.4,71.1) ×1 (BL 3.5) · 4 211 (129.2,77.3) ×1 (BL 4.5) · 5 222 (146.8,71.6) (AR 1.9) · 6 210 (143.9,81.6) (AL 3.5) |
| 18 | 5 | 1 454 (115.8,49.3) ×1 = 1 · 2 458 (118.6,48.1) ×2 (1 6.5) · 3 449 (116.6,51.9) (1 5.7) · 4* 462 (116.2,45.8) (1 7.6) · 5 456 (121.2,49.3) (1 11.5) · 6 461 (120.4,47.0) (1 11.0) |
| 19 | 4 | 1 381 (90.7,43.9) ×1 (1 1.9) · 2* 394 (88.3,36.3) (4 2.7) · 3 388 (85.4,40.8) (3 0.8) · 4 387 (95.8,38.7) ×1 (2 2.2) · 5 378 (95.4,44.2) (5 1.3) · 6* 379 (85.9,46.4) (1 7.0) |
| 20 | 4 | 1 345 (155.6,46.4) (5 1.6) · 2 330 (159.6,56.7) ×1 (2 1.6) · 3* 339 (151.9,50.1) (1 3.4) · 4 340 (160.7,49.7) (3 3.3) · 5* 333 (157.4,54.1) (6 2.3) · 6 340 (164.4,50.1) ×1 (4 2.3) |
| 21 | 4 | 1* 423 (105.5,54.2) (6 2.8) · 2 425 (109.0,52.5) (2 2.8) · 3 439 (109.9,45.2) (4 0.9) · 4 416 (111.5,56.7) ×1 (3 6.5) · 5 433 (108.1,48.6) (1 2.5) · 6* 435 (105.6,47.7) (1 6.7) |

### NSS's cups against WSR's spots

- **Seven coincide** with a WSR spot, within 0.01–0.24 yd (the green surfaces
  within 0.02 m of WSR's pin heights): H3 2 = BM, H7 3 = AR, H9 1 = BR, H11
  1 = BL, H13 1 = BL, H16 4 = BL, H18 1 = WSR's only spot. derived.json marks
  them `wsr: "sN"`. The next nearest cup to any WSR spot is 0.86 yd off (H19 3).
- **The rest are NSS's own**, a median 2.8 yd from the nearest WSR spot (IQR
  1.7–4.0; 15 beyond 6 yd, the furthest H18 5 at 11.5). There is no
  one-to-one pairing: H1 has six cups for WSR's three, H18 six for one, and
  on H3 two cups lie nearest AL and none nearest BL.
- **"NSS reuses WSR's spots" was wrong.** The captures' Switch-only spots and
  candidate are NSS cups: H10 S1 = cup 6 (1.56 yd off the reading), H10 S2 =
  cup 5 (1.53), H18 S1 = cup 2 (1.71), H21 S1 = cup 4 (2.88), and H1's 384 yd
  candidate = cup 6 (0.51). The "shifted spots" (badges 1–4 yd off a WSR
  spot's yardage) were other cups: H3 AL's +4 yd badges are NSS cup 5, 4.4 yd
  longer than AL from the start; H17 BL's +4 is cup 3, 3.9 yd longer.
- WSR's two sets (A, B) have no NSS counterpart; the difficult flag is
  NSS's own (of the 9 difficult cups on holes 2–17, 7 lie nearest a set-A spot,
  not significant).

## Tees

- **Local play tees off EXACTLY at the course bone `GlfTeeOBJ`.** Each hole
  load copies it into every player's start matrix (main 0xd54998..0xd549fc);
  measured in Eden's RAM at 0.00 yd on holes 2–18, the ball teed up 0.1 m
  (all 17 recorded tee shots). On H1 one RAM read put the ball at
  Glf_RotateOBJ, but H1's five local badges (two rounds, cups 5 and 6) fit
  floor(GlfTeeOBJ → cup) at −0.66 / −0.98 yd and miss floor(Glf_RotateOBJ →
  cup) at −2.68 / −3.01, outside the floored window, so H1 is GlfTeeOBJ too
  (tools/test-pins.mjs asserts it). Local frames also offer "Shot Position"
  (ZR) and "Reset Stance", so the ball can be moved before the shot; the
  badge is the authority.
- **The badge.** The "yd to go" badge is the floor of the flat yards from the
  ball to the cup, in the game's own coordinates: of the 65 local tee-frame
  badges of observations nearest one cup, 58 equal floor(GlfTeeOBJ → cup)
  exactly (23 equal floor(WSR start → cup)), five more miss the window by
  0.01–0.06 yd (H3's four at −1.01: cup 5 is 537.01 yd from the tee and they
  read 536; H19 QM09 at −1.06), and the other two are a moved ball and a
  post-shot frame (H8 NCNJ −2.29, H10 3KS8 −7.12). Over the credited local
  badges, 67 of 69 fit from GlfTeeOBJ against 42 from the WSR start.
- **GlfTeeOBJ against the WSR start** (the app's tee until 2026-10-25), yd:
  H1 1.92, H2 0.36, H3 0.73, H4 0.09, H5 0.62, H6 0.31, H7 0.66, H8 0.47, H9
  0.56, H10 0.53, H11 0.49, H12 0.61, H13 0.67, H14 2.55, H15 0.71, H16 0.67,
  H17 0.44, H18 0.43, H19 1.27, H20 1.69, H21 0.70. The ground there is the
  datum (NSS y 0), fairway, on all 21 holes.
- **`Glf_RotateOBJ`**, where the online platform stands, is the hole's origin
  on 19 holes, 2.0–9.1 yd behind the WSR start along the line to the green
  (H10 2.0, H17 9.1); on H1 it is 0.10 yd from the start and on H3 a (0.1,
  0.1, 0.1) placeholder.
- **Tee marks.** Two Banc `TeeMark` actors per hole on 2–21
  (`GolfTeeMarkResort` 2–9, `Classic` 10–18, `Special` 19–21), 6.45–8.41 m
  apart and 2.95–5.92 yd from the tee; H1 has none. Platform mode hides them.
- derived.json ships `tee` = GlfTeeOBJ and `teeNss` `{ rotateObj, teeObj }`
  for audit; course3d's `tee` carries both bones and the WSR start.

## The online Survival Golf platform

Decoded from the platform models and the main NSO (dump platform.md,
slots.md; verify/slots-verdicts.json confirms the rule):

- **The actors.** `Object_BGOBJ_GlfStartObj` (the low tier) and
  `…GlfStartObjHigh` (the high), spawned at the origin and posed by the course
  bone `Glf_RotateOBJ`'s matrix: world = origin + Ry(yaw) · local, the yaw the
  bone's own (`TeeMark` yaw + 180° predicts it only within −1.17 / +0.91°).
  The platform faces down the tee box: its +z is up to 39.3° off the line to
  the green (H12; H14 36.5, H3 23.5, H16 22.8, H20 19.8, within ±16 elsewhere).
- **The slots.** Bones `GlfTeeOBJ_1..4` (low model) and `_5..8` (high), at
  local x −3.45, −1.15, +1.15, +3.45 m, the low ones at y 0.1, z +2.0, the high
  at y 1.668, z −1.5: the high tier is **3.500 m (3.83 yd) behind and 1.568 m
  (1.71 yd, 5.1 ft) above** the low one. Platform-local +x is the player's
  LEFT facing the green, so the bones are R2, R1, L1, L2 from the player's
  right. The captures' "4.0 ± 1 yd" from H11's two tiers was right.
- **Who stands where** depends only on the number of players N, recomputed at
  every hole load: N clamps to 1..8 and indexes the mask table at main
  0x2df9b20 (`20 60 70 f0 76 7e fe ff`), bit k = slot k:

  | N | high tier (from the player's left, m) | low tier |
  |---|---|---|
  | 1 | 0 | — |
  | 2 | +1.15, −1.15 | — |
  | 3 | +2.3, 0, −2.3 | — |
  | 4 | +3.45, +1.15, −1.15, −3.45 | — |
  | 5 | +2.3, 0, −2.3 | +1.15, −1.15 |
  | 6 | +2.3, 0, −2.3 | +2.3, 0, −2.3 |
  | 7 | +3.45, +1.15, −1.15, −3.45 | +2.3, 0, −2.3 |
  | 8 | +3.45, +1.15, −1.15, −3.45 | +3.45, +1.15, −1.15, −3.45 |

  So **1–4 players all stand on the HIGH tier**, the low tier fills from the
  fifth player and never holds exactly one. An even group stands on its slots'
  bones, an odd one midway between adjacent bones, so every group is centred.
  Online the occupied slots are dealt by a seeded Fisher–Yates shuffle per
  hole (the round's per-hole seed), so a player's tier and place change from
  hole to hole; the app takes the player's own (tier, counts, place, hand). A
  player who leaves mid-hole leaves a gap until the next hole.
- **The ball** is 0.9 m beside the standing spot along platform-local x
  (constants at main 0x2ef29f0 / 0x2ef29fc, added before the platform
  transform): to a right-hander's right, a left-hander's left (`IsLefty`, the
  dominant-hand setting); the golfer model stands on the bone side of it. That
  this point is the ball rather than an address anchor is inferred (the body
  is placed from it with the right handedness; the stroke-0 code adds a tee
  lift), not yet seen in RAM. It rests on its tier's mat, **0.099609 m (low)
  or 1.667969 m (high)** above the platform origin: 0.1089 / 1.8241 yd above
  the datum, H3 0.2183 / 1.9335 (its origin stands at y 0.1). The decks'
  0.117 / 1.686 m faces are only their bevelled rim. The stroke-0 code may
  lift the ball 0.05 m more on a tee (not decoded); the live solver tees it up
  0.1 m as on the local tee.
- **The ground under it** is level with the platform origin on 18 holes
  (dipping to −0.054 m on H12 and −0.097 on H18; the H3 origin stands 0.1 m
  above it). No tree, rock, object, barrier, air-OB, water or cup triangle
  touches the platform on any hole. On H1 the outer slots (0, 3, 4, 7) stand
  over ground classed GolfOB; the live solver gives a platform ball lie tee.
- **When it is used.** The platform is posed only in platform mode (a mode
  bit, inferred to be online play); in local play the platform is
  deactivated and every player starts at GlfTeeOBJ. Another mode (a separate
  bit, set by a `NextHole` branch) hides the platform and drops the slot
  points onto the course; which online mode uses it is not decoded, and every
  online capture so far shows the platform.
- **What ships.** `tools/nss-export.mjs` → `tools/nss-platform.json` (per hole
  the pose, the facing, the seven standing positions per tier with each one's
  right- and left-handed ball, mats and the ground under them, the eight slot
  bones). derived.json `platform`: `facingDeg`, `origin`, `yawDeg`,
  `transform`, `tiers.high` / `.low` (the seven stances `{ localX, side |
  between, x, y, zYd, groundYd, ground }`) and `observed` (the online frames'
  median avatar, validation only). src/platform.js places the ball from the
  player's (tier, countHigh, countLow, place, hand) within 0.0019 px of the
  decoder's table; the app's Online card takes them (CLAUDE.md, App.jsx).
- **Against the captures.** `tools/online-rounds.json` holds the tier each of
  the 13 online rounds was judged by eye to be (two judges agreed on all 13;
  9 upper, 4 lower). By the seating rule the four lower-tier rounds had five
  or more players. Every round's badges fit a standing spot of its own tier
  and none of the other's (tools/test-platform.mjs; the nearest miss of the
  other tier 1.11 yd outside the window), H9's lower-tier round included,
  whose avatar had seemed 3.7 yd too far from the cup. The raised tier does
  not shift the minimap marker (the upper rounds' badges match their avatars
  within 2 yd). The capture medians sit about 0.5 m behind the slot line on
  average, within the marker's wander.

## What the captures show

The evidence (unchanged; how build-derived reads it is below):

- **Zoom sightings:** the pin read from a zoomed green capture, placed through
  the green box. A plain+heightmap pair's pin is read from the heightmap; a
  plain frame with no usable heightmap partner is read on its own through the
  fringe. `pinSources` in `captures/derived/greens/hNN.json` names the frame
  each pin came from, and that frame's round is the sighting's round.
- **Tee frames:** each tee frame on its own. The cup is the black ellipse at
  the flag's foot, good to about 2 px. The avatar is the yellow triangle; it
  turns with the aim, so its centroid wanders about 1.5 px. Each frame carries
  its own "yd to go" badge, which is exact (floored flat yards).
- **Rounds:** a hole's frames of any type at the same wind with no 20-minute
  gap between consecutive ones, 69 rounds on the 21 holes. Wind tells rounds
  apart even when they follow each other: a restart keeps the hole's wind, a
  new round draws it again. The time is the EXIF DateTime the console writes
  into each capture, not the ULID in the file name (when the phone received
  the file, 4–6.5 h later, and a batch transfer reorders files).
- **Online play:** online Survival Golf frames carry a shot timer at the top
  centre (`tools/lib/online.mjs`): 194 captures score 0.59–0.70 and the other
  369 score 0.25 or less. Online captures exist for 12 holes (4, 5, 8, 9, 10,
  11, 14, 15, 16, 18, 19 and 20).

What they say, read against NSS's data: 67 pin observations, 65 credited to a
cup within 2.23 px (median 1.08, p90 1.85), one ambiguous (H9's round 1: two
cups within 1 px and no badge) and one unmatched (H19's lone zoom sighting,
4.74 px from every cup). The credited cups and their counts are the ×n of
the table above.

## WSR's spots (history: the playbook and the Dolphin harness)

### Where WSR keeps them

Each course archive (`DATA/files/Stage/Shared2/glf_course_<id>.carc` on the
disc, a Yaz0-compressed U8) holds `WS2_glf_course_<id>.pmp`, a PMP placement
file, next to the `WS2_glf_course_<id>.kcl` collision mesh. Golf objects are
group 0x0002:

- id 0x0000 is the player start;
- id 0x0001 is a pin; its params are an s16 slot followed by an s16 set;
- id 0x000A is the tee marker;
- ids 0x0002, 0x0003 and 0x0006 are the trees (tools/MESHES.md, "WSR's trees").

`tools/wsr-pins.mjs` decodes them, names the hole through
`tools/mesh-holes.json`, maps them into the map frame through
`tools/mesh-registration.json` and checks each pin against the WSR green
outline in `tools/wsr-truth.json` (`onGreen`). Its output `tools/wsr-pins.json`
is committed and still read by tools/nss-export.mjs (the `wsr` audit),
tools/build-playbook.mjs and the Dolphin harness; build-derived no longer
reads it. Rerun it only if the archives, the registration or the WSR truth
change:

    node tools/wsr-pins.mjs <extracted disc folder, archives or .pmp files> --out tools/wsr-pins.json

All 119 pins lie on their WSR green. All 99 on holes 1–17 reproduce the
community yardage sheet, "WSR Golf the Score Behemoth" (holes 1–18,
docs.google.com/spreadsheets/d/1Lk7KTJlykpDCgdfVEBO_kMaos86zg6jL-Qtb4-5pZ2E):
the sheet's values are floor(flat distance from the player start) in yards.
The specials have a sheet of their own
(docs.google.com/spreadsheets/d/1qbBDsyWwAiZUQSQZVYN1zQ450Neg5xiTcjnL_ixuk84),
which lists 17 of their 18 yardages (its hole 21 "B2" cell is empty; the
decoded value there is 425); all 17 match. Its B1–B6 don't follow the PMP
slot order, which is why the playbook numbers the specials by slot.

### How WSR picks the pin

Decoded from `main.dol` (US Rev 1), and checked independently by a second
reading of the disassembly. GlfConfig, GlfMain, RPGlfFieldManager,
RPGlfPlayerManager, choosePin and Sp2::Rand are the Caddie project's names.
`addPinSlot` is ours: Caddie has no name for 0x80406b44, and its own
`GlfConfig::setPin(u32)` is the setter for the chosen slot at +0x38.

1. **Loading the hole.** `GlfConfig` is built fresh for every hole. Its 16-slot
   pin table starts at -1 (empty): `+0x40` holds a pin's ordinal and `+0x80` its
   set. For each pin object the field manager's load calls `addPinSlot(slot,
   ordinal, set)` (0x80406b44).
2. **Choosing the set.** The golf scene's reset calls the chooser 0x803fa3f4
   with the hole's position in the round. Let k be that position plus 1, and s
   each player's score to par over the round's earlier holes.
   - The round's first hole always uses set 1.
   - Rounds of 3 holes or fewer always use set 1 (0x80406164 gives 18 holes
     for the 18-hole mode, 9 for Resort 9 and Classic 9, and 3 for everything
     else: Resort/Classic A–C and Special).
   - Otherwise the set starts at 0. It becomes 1 if the best player's
     s ≥ -k/2, and 2 if the worst player's s < -k/2. If the players straddle
     the line it stays 0, and **set 0 matches every pin**.
3. **Drawing the pin.** The hole-start state (0x803f8dec) unpacks the hole's
   wind, calls `GlfConfig::choosePin(set)` (0x804066e0) and places the flag.
   choosePin takes the floor(count·u)-th matching slot in slot order, u from
   `Sp2::Rand` (an LCG ×0x41C64E6D + 0x3039 XORed with a shift register), so
   every pin in the set is equally likely.

Set 1 is the easier "B" set and set 2 the harder "A" set. For one player, a
hole draws an A pin when s ≤ -(⌊k/2⌋ + 1):

| Hole k of the round | 2–3 | 4–5 | 6–7 | 8–9 | 10–11 | 12–13 | 14–15 | 16–17 |
|---|---|---|---|---|---|---|---|---|
| A pins need | −2 | −3 | −4 | −5 | −6 | −7 | −8 | −9 |

This matches the speedrun community's tables (tendog's thread,
speedrun.com/wsr/forums/0t4mu). 3-hole rounds never show an A pin; the
specials, whose six pins are all set 1, draw from all six. Hole 1 has three
set-1 pins; hole 18 one spot, listed under both sets.

### The spots

Labels: on holes with both sets, the set letter plus L/M/R running west to
east on the minimap (the community's names on 95 of 99 pins; the misses are
ties on H3's B pins and H9's A pins). Hole 1's pins are L/M/R; hole 18's spot
and the specials' are numbered by slot. The yardage is from the WSR start;
map px are in the app's 250×304 frame.

| Hole | Spots |
|---|---|
| 1 | L 395 (132.8,60.3) · R 395 (139.7,62.0) · M 401 (137.7,58.2) |
| 2 | BM 155 (125.2,90.5) · BR 155 (129.6,89.6) · BL 152 (121.0,94.6) · AL 150 (113.3,99.0) · AM 146 (127.9,99.0) · AR 147 (135.3,96.3) |
| 3 | BL 528 (151.3,45.7) · BM 538 (151.4,41.6) · BR 521 (152.0,48.4) · AL 532 (148.6,44.0) · AM 535 (155.0,42.7) · AR 529 (156.3,45.4) |
| 4 | BL 165 (96.6,105.9) · BR 163 (108.3,102.0) · BM 162 (103.7,105.1) · AL 168 (89.9,105.9) · AM 174 (96.1,95.9) · AR 160 (98.1,110.4) |
| 5 | BL 558 (144.9,42.3) · BR 562 (151.0,41.5) · BM 565 (148.2,39.6) · AM 573 (146.2,36.3) · AR 573 (149.8,36.7) · AL 566 (144.9,39.1) |
| 6 | BM 408 (150.3,54.7) · BR 421 (153.3,48.4) · BL 417 (146.9,49.7) · AL 407 (144.4,54.7) · AR 411 (156.1,53.8) · AM 404 (147.8,56.7) |
| 7 | BL 387 (114.8,77.0) · BM 396 (117.8,73.5) · BR 392 (120.6,75.8) · AR 392 (117.8,75.0) · AL 386 (111.4,77.3) · AM 397 (115.3,72.4) |
| 8 | BR 155 (134.7,116.0) · BM 162 (130.4,112.5) · BL 167 (128.6,109.8) · AR 152 (132.8,117.9) · AM 168 (131.4,109.0) · AL 156 (127.2,116.5) |
| 9 | BM 563 (133.1,40.6) · BR 555 (137.0,44.1) · BL 558 (132.2,42.6) · AR 566 (138.1,40.0) · AM 571 (135.5,37.6) · AL 571 (133.8,37.4) |
| 10 | BL 379 (120.6,49.9) · BM 371 (123.9,54.0) · BR 379 (127.3,49.6) · AL 375 (118.8,52.1) · AM 367 (124.6,56.2) · AR 384 (128.0,46.9) |
| 11 | BL 136 (124.6,102.4) · BM 138 (133.7,103.3) · BR 139 (140.0,104.4) · AR 144 (140.1,98.8) · AM 145 (134.4,95.2) · AL 133 (130.8,108.1) |
| 12 | BL 459 (104.9,50.2) · BM 469 (107.9,45.6) · BR 461 (107.9,49.4) · AR 469 (105.3,45.6) · AM 454 (104.1,52.4) · AL 463 (102.5,48.3) |
| 13 | BL 142 (105.2,89.9) · BM 145 (111.9,85.2) · BR 138 (121.6,92.4) · AR 135 (117.3,96.2) · AL 147 (108.1,83.3) · AM 131 (111.9,101.7) |
| 14 | BL 359 (160.3,43.3) · BR 363 (167.4,40.2) · BM 361 (164.3,41.8) · AL 352 (162.3,47.3) · AM 367 (163.3,37.8) · AR 357 (167.5,43.9) |
| 15 | BR 335 (139.8,67.2) · BM 341 (138.5,64.1) · BL 339 (136.0,65.4) · AM 340 (143.4,64.1) · AL 347 (142.5,60.4) · AR 336 (144.9,66.3) |
| 16 | BM 250 (176.5,101.4) · BR 250 (181.9,103.6) · BL 246 (172.0,102.4) · AL 249 (169.8,99.9) · AM 256 (176.4,97.1) · AR 260 (181.2,96.6) |
| 17 | BM 220 (136.8,70.1) · BL 215 (131.1,73.9) · BR 216 (140.5,75.2) · AM 214 (146.3,78.1) · AR 220 (147.7,73.1) · AL 207 (141.1,83.0) |
| 18 | 1 455 (115.8,49.3) |
| 19 | 1 378 (89.9,44.8) · 2 384 (95.2,39.9) · 3 386 (85.7,41.2) · 4 391 (89.8,36.8) · 5 377 (94.6,44.1) · 6 379 (98.2,42.0) |
| 20 | 1 335 (152.3,52.3) · 2 329 (160.7,56.6) · 3 339 (158.5,49.7) · 4 340 (162.9,49.7) · 5 342 (155.7,47.4) · 6 331 (158.5,55.1) |
| 21 | 1 434 (109.0,47.7) · 2 427 (108.6,51.1) · 3 422 (110.3,53.7) · 4 438 (110.3,45.1) · 5 425 (105.2,52.8) · 6 421 (106.9,54.5) |

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
    against 170 from the start, so each mode uses the longest of its own
    badges inside the hole-wide band.
  - The wind dial is masked only in the corner it occupies (`dialCorner`: the
    dial's ring where the panel draws it scores 68–72 of 72 angles on every
    map frame, the other corner 0–17).
  - The avatar triangle can split into a body and a tip; blobs whose boxes lie
    within 3 px are merged, and centroids are at pixel centres.
- `tools/build-derived.mjs` credits the readings to NSS's cups:
  - **Rounds.** Every classified frame of a hole is timed by its EXIF
    DateTime (`tools/lib/exif.mjs`; the ULID is the fallback) and chained per
    wind with a 20-minute gap. A reading is filed under its source frame's
    round.
  - **Readings.** Zoom: one per source frame. Tee frames: cups whose badge
    agrees with the measured avatar-to-cup distance within 2.5 map px at the
    hole's scale (`BADGE_TOL_PX`; the cup is good to 2 px and the avatar
    wanders 1.5 px, while a yard is 0.4–1.1 px: over the 141 tee frames with a
    badge, avatar and cup, 121 pass; the misses are H10's wind-4 sitting's
    tee-frame cup detected 1.5 px off and five OCR misreads). An online
    frame's avatar is the yellow blob nearest the tee within 25 yd.
  - **Observations.** Within a round, one observation per physical pin; a
    tee-frame cup joins the zoom reading it agrees with within 2.5 px
    (`SAME_PIN_PX`).
  - **Crediting a cup.** An observation is credited to the nearest NSS cup
    within 2.5 map px (`CUP_MATCH_PX`), unless the next cup is less than 1 px
    further (`AMBIG_PX`). Then the badges decide: a badge b fits a cup from a
    point P when b − (P to the cup, yd, in NSS metres) lies in (−1.1, 0.1],
    P the local tee (GlfTeeOBJ) for a local frame whose ball is on the tee
    (within 5 yd) and the platform's 14 standing spots for an online one; the
    cup whose badges fit when the other's do not is the one. Otherwise the
    observation goes to `pinAmbiguous`; one beyond 2.5 px of every cup goes to
    `pinUnmatched`. There are no Switch-only spots or `pinCandidates` (NSS has
    exactly six cups).
  - **`seen`** is the number of rounds credited to a cup.
  - **`tee`** is GlfTeeOBJ, **`platform`** NSS's platform
    (tools/nss-platform.json); the online frames only check it.
  - **Diagnostics.** `captures/derived/pin-observations.json` lists every
    observation with its round, wind, whether the round is online, its result
    (a cup id, ambiguous or unmatched) and its readings.
    `captures/derived/tee-frames-used.json` lists the tee frames the pins and
    the platform check used, which `tools/frame-audit.mjs` reads.
    `PIN_DEBUG=<hole>` prints one hole's observations.
- **App:**
  - Pins show their label 1–6; a difficult cup is red (a red number and ring
    on the zoomed green, a red flag ringed at its foot on the hole map); the
    player's own pins are P1, P2…. A tooltip gives "NSS cup N", whether it is
    difficult, the yards from the tee and the rounds seen.
  - The Online card (tier, players on each tier, place from the left, hand)
    puts the ball on the platform; a thin white ring around the ball shows
    while it is on a platform spot.
  - Pipeline pins keep the player's current pin on its cup (`d<hole>-c<k>`);
    a WSR-era current pin moves to the nearest cup (`src/derivedMerge.js`).
