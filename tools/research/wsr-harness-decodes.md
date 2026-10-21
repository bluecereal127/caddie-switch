# WSR decodes for the Dolphin harness (2026-10-21)

What tools/harness needed beyond the earlier decodes (wsr-swing-redzone-spin.md,
wsr-ground-phase.md, wsr-club-physics.md): the aim table behind the hidden
pin-power assist, choosePin and the pin's derivation, the state-1 window's exits
and how to hold it, the spin hand-off's order, and how courses and holes are
selected. Read statically from main.dol (NTSC-U rev 1, RZTE01); the items the
harness relies on were then checked in the running game through Dolphin's GDB
stub (section 5 lists which, with the numbers). SDA bases r2 = 0x806fe080,
r13 = 0x806f8120. KCL units: 9.144 per yd.

Notation: cm = u32 [0x806f54a0] (RPGlfClubManager), pm = u32 [0x806f5468]
(RPGlfPlayerManager), player = u32 [pm + 0x664], cfg = u32 [0x806f5498]
(GlfConfig), SM = u32 [0x806f4e98] (Sp2::StaticMem), fieldMgr = u32
[0x806f5480]. Holes are 0-based in the code (hole 19 of the app is k = 18).

## 1. The aim table behind the pin-power assist

wsr-swing-redzone-spin.md 3.5 decodes the assist (0x80407d08, 0x8041e664):
on a partial swing p2 is pulled toward the power whose simulated landing is
nearest the pin, aim+0x1880 / 256, when that landing is within 300 u. The
"aim" object is the club manager itself: the caller at 0x803fadd0 passes
r3 = [r13 - 0x2c80] and 0x80407d08 receives the same object.

| cm offset | type | meaning |
|---|---|---|
| +0x2c | s32 | club index, read live at every sim launch |
| +0x34 + 4p | f32 | the sim result for power p/256, p = 0..256 |
| +0x438 | f32* | -> cm+0x854 |
| +0x43c + 4p | f32 | the smoothed result, recomputed on every builder call |
| +0x840 .. +0xc6b | f32[267] | the raw array, raw[p] at +0x854 + 4p, 5 padding entries each side |
| +0xc6c + 4k | s32 | the order the powers are simulated in (bisection: 0, 256, 128, 64, 192, 32, ...; odd p last), built once by the constructor 0x80409838 -> 0x80408008 |
| +0x1070 + 4p / +0x1474 + 4p | s32 | the lower / upper computed neighbour of p (-9999 = adjacent) |
| +0x1878 | s32 | progress: -9999 = reset; k = sims completed; **257 = complete** |
| +0x187c | f32 | the best smoothed distance; 9999 = none |
| +0x1880 | s32 | the best power index (0..256) |
| +0x1884 | RPGlfBall* | the table's own sim ball (not spSimBall) |

Nothing records which club, aim, wind, ball or pin the table was built for.

The builder 0x8040854c, called once per frame from 0x803fadd4:
- at +0x1878 = -9999 it sets 0 and launches power order[0];
- while +0x1878 <= 256 it loops up to 160 times (`cmpwi r29,0xa0` at
  0x804085f4), each iteration one tick of the sim ball (0x80408120 ->
  0x80414734): 160 ball ticks a frame, not 160 powers;
- a finished sim increments +0x1878 and launches order[+0x1878] in the same
  frame, and fills the entries between it and its computed neighbours by
  linear interpolation (the p = 256 sim fills raw[1..255]);
- on every call, finished or not, it re-pads the array, smooths it with 11
  taps (1, 5, 15, 30, 45, 51, 45, 30, 15, 5, 1) / 243 (entries exactly 0,
  holed, stay 0), sets +0x187c = 9999, +0x1880 = 0 and searches the minimum;
  if powers hole out, +0x1880 is the middle of the longest holed run
  (0x80407a9c).

A sim (0x80408490): power order[k] / 256 through club slot 3 (0x80409e44)
with &player+0x84, the live aim without the rough or sand lie yaw; the sim
ball is copied from the real ball (0x804156ac) and launched with side = back
= 0 (0x80414ff0). Its result (0x80408120): the horizontal distance from its
rest to the pin; in water the drop point (0x80411df8) or the player position,
OB or valley the player position, both x 2; resting in rough x 1.1, in a
bunker x 1.3; holed 0; a flagstick hit (ball+0x62) adds 0.1 P08 9.144 u.

It runs only while pm+0x674 != 0, pm+0x675 != 0, player+0xbc == 0.0f and
pm+0x8a8 == 0. player+0xbc is the A-hold blend (+0.167 a frame while A is
held, 0x803fcc5c, -0.167 after release), so the table freezes at the end of
the first A-held frame; the real shot clears pm+0x674 / 0x675 (0x803fafc0),
so it stays frozen through state 1. A swing started early reads whatever
partial table exists.

Resets (0x804087ec) come only from the heading setter 0x803fd0bc (the D-pad
turn 0x803fcf28 calls it every frame of turning; it writes player+0x80,
+0x84 / +0x88, +0x8c = -aim.z, +0x90 = aim.x), the aim-line setter 0x803fed50
(hole start 0x803ff268, next stroke 0x803fef1c, tutorial end 0x803feedc) and
the D-pad club change 0x804092f0 (refused on lies 6, 10, 11; it also resets
the swing tracker and follower, 0x80423000, and the camera, 0x80407bec).
Wind writes, ball and pin moves and direct writes of the club or aim do not
reset it.

The D-pad turn 0x803fcf28 (called once a frame from 0x803fac54 with f1 = 0,
r4 / r5 the two direction bits of the remote's state +0x18) accelerates:
player+0x94, the turn rate, moves 0.00035 rad (0.020 deg) a frame toward the
held direction (back to 0 on release or reversal), capped at 0.02 rad (1.146 deg) a
frame, and the heading setter gets heading + rate. A tap held N frames turns
0.00035 N (N + 1) / 2 rad: 0.02 deg for one frame, 0.30 for five, 1.10 for
ten, the cap reached after 57 frames. So WSR's aim has no fixed tick; the
Switch's aim step is a separate measurement.

A build takes the sims' total ticks / 160 frames: by the port's tick counts
(flat, calm) 2,720 / 2,610 / 2,370 / 2,190 / 2,030 / 1,820 / 1,470 frames for
fairway landings, driver to wedge, and 1,260 for the putter on a green; green
landings 2,200 (wedge) to 3,970 (driver); at most 11,565 (the 7,200-tick cap
per sim).

Recipe (lib/assist.mjs buildAimTable): with the CPU stopped write the club
(cm+0x2c), the aim (player+0x80 / +0x84 / +0x88) and the wind, then s32
cm+0x1878 = 0xffffd8f1 (-9999); run with A and B released and the D-pad
untouched (player+0xbc decays to 0 six frames after an A release) until
cm+0x1878 == 257; then address and swing as usual. The assist acts only if
+0x187c < 300.0 and p2 < cap; its target power is +0x1880 / 256. A savestate
after the build keeps the table (the harness saves one per club and spot).
For a controlled test +0x1880 and +0x187c can be written any time after the
first A-held frame: 0x80407d08 reads only those two, p2 and the cap.

## 2. The pin: choosePin and the cup

The hole-start state 0x803f8dec runs once per hole: the wind is unpacked
(0x804061a8 -> SetWind), r4 = pm+0x694 (the pin set; 0 = any), `bl 0x804066e0`
(choosePin) at 0x803f8e5c, then `bl 0x80403ca0(fieldMgr)` at 0x803f8e64.

choosePin (r30 = cfg, r31 = set) sets cfg+0x38 = -1 (0x804066fc), counts the
slots s = 0..15 with cfg+0x40 + 4s != -1 and (cfg+0x80 + 4s == set or set ==
0) into r28, draws Sp2::Rand (0x80406748), j = floor(count u) in r3 at
0x804067a4, and at the j-th matching slot stores it: 0x804067e4 `stw
r6,0x38(r30)`, the only nonzero writer of cfg+0x38 (the others: -1 at
0x804066fc, 0 in the constructor 0x80406c50). The slot tables come from
addPinSlot 0x80406b44, called by the PMP walker: cfg+0x40 + 4 slot = the
pin's PMP ordinal, cfg+0x80 + 4 slot = its set; the slot is the pin's first
s16 parameter (tools/wsr-pins.json `slot`).

Forcing a slot (the draw is consumed either way): break at 0x803f8e60 and
write s32 cfg+0x38 = s, after checking cfg+0x40 + 4s != -1; or within the
drawn set break at 0x804067a4 and set r3 = j (0 <= j < r28); or break at
0x804067e4 and set r6 = s.

What 0x80403ca0 derives from it (the only reader of cfg+0x38 found):
- the start, fieldMgr+0x48 = *(fieldMgr+0x44) + 0x54 cfg[0x100 + 0x80 s + 4
  cfg[0x3c]] with cfg+0x3c = 0; on all 21 holes one start serves every slot,
  so forcing a slot does not move the tee;
- the pin, fieldMgr+0x3c = *(fieldMgr+0x38) + 0xf8 cfg[0x40 + 4s] (one 0xf8
  object per PMP pin, all placed at load); GetPinPos 0x80402bd8 =
  *(*(fieldMgr+0x3c) + 0x4c), read at use time by every physics reader;
- the cup: 0x80405818(*(fieldMgr+0x54), *(pin+0x4c)) copies the pin position
  into *(cup+0x4c) and tail-calls 0x8040562c, a KCL query (KCL = *(0x806f5478))
  that on the green snaps the cup's y to the surface, builds *(cup+0x98) and
  calls 0x803f0bdc: KCL+0x68 = the green prism, KCL+0x6c .. +0x74 = the cup
  centre, +0x78 = 1.5, +0x7c = 3.0 (no green hit: 0x803f0bd0 sets KCL+0x68 =
  0, no cup); *(cup+0x9c) = the cup position; 0x804021d4 draws the hole decal.

Moving the pin in a started hole (not used by the harness, untested): point
fieldMgr+0x3c at another PMP pin (or overwrite pin+0x30 .. +0x38), then re-run
0x80405818 with r3 = *(fieldMgr+0x54), r4 = pin+0x30 (the sphere query applies
the cup only to contacts with the prism at KCL+0x68, compared at 0x803f11cc,
so a stale prism means no working cup), copy the cup's snapped y into
pin+0x34 (the hole-out test compares the ball's y with the pin's), and reset
the aim table.

## 3. The state-1 window, and the spin hand-off

Within a frame (0x80422d70) the writer 0x80420570 runs first (it stores
swing+0x14 = g at 0x8042091c and runs the follower spring 0x8035d5bc at
0x80420a18: vel += k (s18 - g) + c (ds18 - vel); g += vel; the follower is
*(swing+0x10), +4 = g, +8 = vel), then the state machine 0x80420d84.

Each state-1 frame (block 0x80421308): the power pipeline, p2 -> swing+0x90
(0x80421334), p3 = 0x8041e664 (reads p2 and s7c = swing+0x7c from memory),
power = min(p3, lie factor) -> swing+0x98 (0x80421364); the timer swing+0x34
+= 1 (0x80421370), the shot firing on the frame it was 0; n = clamp(18 + 28
(1.25 - raw), 18, 25), raw from swing+0x88.

| exit | address | condition (exact compare) |
|---|---|---|
| timer | fcmpo at 0x8042143c, `cror eq,gt,eq` | (float) timer >= n: on frame ceil(n), 25 for raw <= 1.0 |
| follower | 0x8042144c - 0x80421460 | vel < 0.0, strict (0.0, -0.0 and NaN do not exit) |
| cup | 0x80421464 - 0x804214ec | ball+0x60 != 0, ball y < pin y and dx^2 + dz^2 < 2.25 (strict); never on frame 1 |

After the tests (0x804214f0), for timer <= 3, vel = max(vel, timer (0.005 +
0.015 min(raw, 1)) / 3). On exit (0x80421564) state = 2, timer = 0, s48 = 0.
While A is held in states 0 / 3, 0x80422f14 - 0x80422f9c keeps g <= 0.5 and
vel = -min(vel, 0.005).

An injected trigger leaves the follower settling onto the resting remote
with a slightly negative velocity, so the window closes after one frame: the
shot fires on that frame (p3 = p2 there) and the assist, which acts only on
the later frames (swing+0xe4 set by 0x804224b4 after the real shot), never
runs. A follow-through keeps the velocity up. To hold the window to its
timer (lib/shot.mjs holdWindow): break at 0x80421338 (after the p2 store and
this frame's spring, before p3) with r27 == swing, and write f32 0 to
follower+8 when it is negative (and at the trigger). s7c written there is
what p3 reads. The ball then flies with the last frame's power (the manager
relaunches it from launch on every state-1 frame, 0x8041490c), and the spins
attach at tick 4 ceil(n).

The hand-off 0x80414854 (on the last state-1 frame, from the ball manager):
0x80414884 stores ball+0x9c (side), 0x80414898 ball+0xa0 (backspin),
0x80414890 loads the lifetime ball+0x54 into r0 and **0x804148a0 stores it
to ball+0x58** (the spin tick; the spins act from the tick after it, Calc's
lifetime > ball+0x58), then the ball is copied into the look-ahead balls
(0x804156ac, spSimBall [0x806f54e8] and [0x806f54f4]) and +0x16c is cleared.
A stop at 0x8041489c, where the harness writes the spins, therefore sees the
previous shot's ball+0x58; the tick is ball+0x54 there.

## 4. Courses, holes and the Special tile

The Special "?" tile is locked by the system-wide golf save, not by the Mii:
it unlocks once 10 golf rounds have been played. Every hole jump goes through
two StaticMem words: the course selection SM+0x1c and the next-hole variable
var1 at SM+0xc4. Kiwi515's Caddie mod independently jumps holes by writing
var1 and reloading the golf scene.

The course page builds tiles 0..6 = Resort A, B, C, Classic A, B, C, Special
(3-hole category; 9-hole 7, 8; 18-hole 9) through 0x8032176c; a tile's state
comes from the save (0x80261f5c: u32 [common + 0xec + 0x50 game + 4 stage];
0 normal, 1 NEW, 2 locked "?", 3 hidden; a locked tile only plays the locked
reaction, 0x8031b04c - 0x8031b088). Golf's save index is 19 (0x80310840 ->
0x80276a5c(0, 10, 2)); common = [[[0x806f4cc0] + 0x28] + 8] + 0x10; golf's
stage states are u32 at common + 0x6dc, the Special tile at common + 0x6f4;
the rule (0x8066b1c8: initial state 2, type 0 = the game's play count at
common + 0x4d94, threshold 10) is applied in the post-game sequence
(0x80278a90: 0x80299a2c increments, 0x80299734 -> 0x80298814 unlocks).
Writing u32 [common + 0x6f4] = 1 before the page is built unlocks it, as a
real save edit; the harness does not, it uses recipe A.

The decide handler stores the stage index at 0x8031185c (`stw r3,0x1c(r31)`,
r31 = SM); Special is 6, which the golf scene turns into mode 18, first hole
18, holes 18-20, wind speed index 0-15, set-1 pins.

StaticMem bank-0 variable v is at SM + 0xc0 + 4v ("is set" byte SM + 0x35 +
v): var0 = mode, var1 = the next hole, var 7 + h = hole h's wind direction
(bits 0-2) and speed index (3-6) and the players' strokes (7-10, 11-14, 15-18,
19-22). The "is set" bytes clear when the scene changes to another scene, or
when byte SM+0xbd0 is set (0x8026a33c from the scene creator 0x8022f534); a
golf reload keeps them.

GlfConfig is built once per hole (0x803ecb44 -> 0x804177f4 -> 0x80406dcc:
constructor 0x80406c50, +8 = 0, +0xc = 21; setup 0x80406920; [0x806f5498]
written at 0x80406dec, 0 between holes). The setup's first hole of a round
(var0 not set) reads sel = SM+0x1c at 0x80406954, mode = 0x806d4e54[sel]
(10, 11, 12, 14, 15, 16, 18, 9, 13, 17) and hole = 0x806d4e2c[sel] (0, 3, 6,
9, 12, 15, 18, 0, 9, 0), and sets var0 = mode, var1 = hole + 1, draws the wind
(0x804061fc) and clears the strokes (0x80406514); a later hole takes mode =
var0, hole = var1 mod 21, var1 = hole + 1 and reloads the strokes. The course
archive is [0x806d4b38 + 0x24 hole] formatted into "glf_course_%s.carc"
(0x80417888), the names in tools/mesh-holes.json's order; par from the same
table. At hole-out 0x803f7730 calls 0x8040664c (strokes into cfg+0x1c30 and
var 7 + h; returns 0x80406554, "another hole follows", true while the hole
is below the mode's last hole, table 0x806d4ec8: mode 9 -> 8, 10 -> 2, 11 ->
5, 12 -> 8, 13 -> 17, 14 -> 11, 15 -> 14, 16 -> 17, 17 -> 17, 18 -> 20; a
mode outside 9..18 always reports another hole), and on true reloads the golf
scene after 60 frames (0x803f78c8 / 0x803f78dc).

Recipes:
- **A. Special from the menu, no save edit** (tools/harness/make-states.mjs):
  pick any 3-hole course and write u32 SM+0x1c = 6 before 0x80406954 reads it
  (the harness breaks at 0x80406954); or break at 0x8031185c and set r3 = 6.
- **B. Hole k at its tee as a round's first hole**: the course containing k
  as in A, and if k is not its first hole, break at 0x80417820 (GlfConfig
  exists, the archive name not yet built) and write cfg+0xc = k and SM+0xc4 =
  k + 1.
- **C. A jump at hole-out**: break at 0x803f7778 and write SM+0xc4 = k (at a
  round's last hole also r3 = 1, so the scene reloads).
- **D. Pin and wind**: the wind at 0x803f8e4c (r4 = direction 0-7, r5 = speed
  index 0-15) or var 7 + k's low 7 bits beforehand; the pin as in section 2.

Constraints: k must be at least the mode's first hole (the pin-set chooser
0x803fa3f4 otherwise recurses k - first deep, from 0x80405f1c, and crashes);
k <= 20; the wind draw (0x80406e00) gives direction 0 and speed index 15 to
every hole outside the mode's range (mode 9: holes 0-8, speed 0-10; 10: 0-2,
0-5; 11: 3-5, 5-10; 12: 6-8, 10-15; 13: 9-17, 0-10; 14: 9-11, 0-5; 15: 12-14,
5-10; 16: 15-17, 10-15; 17: 0-17, 0-10; 18: 18-20, 0-15); skipped holes score
0 strokes (the totals go under par, and 9- and 18-hole rounds then draw set-2
pins); the swing tutorial (0x803fa370) appears only on the mode's first hole
and stroke 1.

The harness reaches every tee by recipe A plus genuine play (the ball holed
out by injected shots), not B or C: a played-through round keeps the
strokes, the pin sets and the wind as the game draws them.

## 5. What the harness checked live

- Section 4 A: make-states.mjs reached Special (holes 19-21) by writing
  SM+0x1c = 6 at 0x80406954, and played every hole of the three courses
  through to its next tee.
- Section 3, the hand-off order: the first 2f run read ball+0x58 = 0 at
  0x8041489c on every shot, as the listing says it must.
- Section 3, the window: held at 0x80421338, it ran ceil(n) frames on all 20
  red-zone swings of results/spin-h10-red.json (raw 0.9-1.3: 25, 24, 22, 21,
  20, 18 frames as the formula gives) and the spin tick was 4 x the frames on
  every one; 25 frames on every held partial swing of results/assist-h1.json.
  Unheld, the window's length depends on the follower's state at the trigger:
  1 frame on one session's hole 10 shots, 12 on another's, 14 on the 2e
  control (so a "game"-mode partial swing can be assisted unheld too).
- Section 1, the table and the assist: from a reset the table rebuilt to 257
  in 140-157 s a club (7-iron, 9-iron, 3-iron from 109.5 yd on hole 1), and
  over 49 partial swings with the window held the game's launch power was the
  decoded formula (wsr-swing-redzone-spin.md 3.5) to the float, once the
  holing window was added: with a simulated power holing out (the table's
  best = 0), 0x80409a30 (r3 = the holed flag, f1 = |p2 - p_pin|) returns the
  smaller of clamp(0.5 + 0.5 (d / 0.3)^log2(1000), 0.5, 1) and clamp(0.01 +
  0.99 (d / 0.05)^log2(20), 0.01, 1) (0x803ef330 is x^log2(1/k), 0 below
  0.001), so within 0.05 of the holing run the swing is pulled up to 99 % into
  it (results/assist-h1.json; tools/harness/lib/assist.mjs assistP3).
- Section 2 is not used by the harness (the rounds' own pins).
