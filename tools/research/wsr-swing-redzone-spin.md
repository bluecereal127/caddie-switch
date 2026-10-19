# WSR swing: the red zone, backspin, the landing puff and randomness (group U, 2026-10-19)

Everything below is from `C:/Users/Stephen/Downloads/WSR_Extract/DATA/sys/main.dol` (Wii Sports
Resort, NTSC-U rev 1) unless marked otherwise. It describes the **Wii** game. Nintendo Switch
Sports has its own tuning and its own controls: the structure (which quantities exist, what reads
what, what is random) is what can carry over, the numbers may not, and the mapping from the
player's Wii Remote motion to the game's swing values cannot carry over at all (the Switch reads
a Joy-Con or a button). It builds on `tools/research/wsr-club-physics.md` (club blocks, launch,
flight; its addresses and block offsets are assumed here) and `tools/research/wsr-ground-phase.md`
(landing, bounce, roll, backspin pull-back, cup), which it does not redo.

Three decoders worked separately: A (over-swing power and direction), C (backspin and the puff),
D (randomness). The first eight claims of each were then re-derived from the binary by
independent readers: 19 were confirmed and 5 refuted (C1, C2, C5, C7, D3). The corrections are
applied below, and the numbers that depended on a refuted claim were recomputed with the
decoder's own scripts (section 5.6). Claims past the eighth of each decoder were not re-checked;
they are marked **decoder only** where they are used. Each item ends with a status line:
*re-checked* (with the claim id), *corrected* (refuted, correction applied), or *decoder only*.

Units: 1 unit (u) = 0.1 m, 9.144 u/yd; one physics tick = 1/240 s, 4 ticks per 60 Hz frame.
"Frame" below always means a 60 Hz frame (one call of the swing update).
`$S` was the research session's scratch directory; the scripts, listings and verification notes
named under it were not kept in the repository. Re-derive from main.dol with the addresses given.

## 1. Summary

- **What the red zone does to power.** The red is the quarter of power (one bar) above the lie's
  cap. On tee, fairway and every other uncapped lie it adds **nothing**: launch power is clamped
  to 1.0, so a red swing carries no further than a full one. From rough or sand it is **real
  power, exactly up to one more bar**: rough 3 → 4 bars, bunker wedge 3 → 4, irons 2 → 3,
  driver and spoon 1 → 2. The bar draws the capped launch power on a fixed scale, so a bar is
  worth the same distance on every lie. The putter has no red curve; its power runs to 2.5.
- **What the red zone does to direction.** It does not tilt the launch: the ball leaves along the
  aim line. It adds **side-spin**: a curve whose **size** is set by how far into the red the swing
  went (a fixed 20 % of the strongest deliberate curve the moment the bar turns red, rising
  linearly to 100 % at the end of the red), and whose **direction, left or right, is a coin flip**
  drawn once per swing from the game's random number generator. Driver: about 7 yd sideways at
  carry at the edge of the red, 35 yd at full red; 7-iron 4 / 22 yd; wedge 1.5 / 8 yd.
- **Why the exit direction feels uncontrollable.** (1) The side is random and has nothing to do
  with the motion. (2) There is no "slightly red": the curve jumps from 0 to 20 % of a full curve
  as soon as the bar is red. (3) Nothing shows at launch: the spin is attached only when the
  follow-through window closes, 0.30–0.42 s after the ball left, so the ball starts straight and
  then bends. (4) It adds to whatever curve the swing itself put on: same side doubles it, the
  other side cancels it. (5) The swing's power value is recomputed on every frame of that
  window, so the red depth, and with it the curve size, is not fixed at impact. From rough or
  sand there is also a deterministic launch yaw of at least 2° (a lie effect, not the red;
  decoder only).
- **What decides backspin.** Not chance, and not the power directly: the **motion in the 0.3–0.4 s
  after impact**. The game tracks the Wii Remote's swing angle with a slow tracker and a springy
  follower; when the remote stops sharply soon after the ball (the game's own help text: "swing
  with extra wrist snap"), the follower overshoots and that overshoot is the spin (0..1). A full
  follow-through, past about +200° of remote angle, gives none. The **backswing depth caps it**:
  the cap is a ceiling, not a multiplier, so a backswing of about 100° of remote angle allows at
  most about half the spin, about 60° at most a fifth, and none below about 30°. The club
  multiplies the result: 3i 0.25, 5i 0.5, 7i 0.7, 9i 0.9, wedge 1.0 (from a bunker 0.2 / 0.35 /
  0.5 / 0.6 / 0.7); woods and putter 0.
- **Why two identical-looking swings spin very differently.** Same power says almost nothing
  about the spin: power comes from the backswing and the swing speed up to impact, spin from how
  the club stops after it. The spin input is steep: in a model of the Wii input, stopping the
  club within about 40° past the ball gives full spin, at 80° three quarters, at 120° under half,
  at 160° or with a full follow-through none, and a slower downswing into the same stop none at
  all; a swing about 20° off its plane loses about 40 %. Backspin never
  touches the flight (carry, apex and hang time are the same with and without it); it softens the
  first bounce and pulls the ball back during the roll, and that is worth a lot: a full-power
  9-iron onto a green stops at 109 yd with no spin and 90 yd with full spin (10 yd short of where
  it landed); a wedge 72 vs 52 yd. A ball that lands past the pin is pulled back 30 % harder than
  one that lands short of it.
- **What triggers the smoke puff.** In WSR the landing puff is a **surface effect, not a spin
  effect**: `WS2_glf_fairway_bound` / `rough_bound` / `bunker_fall` / `rock_bound`, raised on
  **every** bounce whose normal impact speed is above 0.05 u/tick (1.2 m/s), scaled by that speed,
  and **never on the green**; the code reads no spin. A full-power landing puffs 4 times on
  fairway and 3 in rough; full backspin cuts that to 2 because it softens the bounces. WSR has no
  golf effect named for spin or smoke. The Switch's puff that appears with backspin on fairway
  and green is a Switch change; the most likely places it hooks into WSR's structure are the
  branch of the contact routine that applies the backspin on a landing from the air, or its
  first-contact flag (section 6). Decoder only.
- **Is anything in the shot random?** One random number generator, seeded once at power-on from
  the clock. Inside a shot it decides exactly two things: the **over-swing coin** (only when the
  bar went red) and a **jitter of the default aim line** (−0.17° ± 0.04°, when the line is set for
  a stroke; not when it is set to the hole's tee target, and never on the green; decoder only).
  Wind (per round) and the pin (per hole) are random but drawn before any shot. Launch, flight,
  spin, landing and roll are deterministic functions of the swing values and the wind.
- **Shot Assist** (Switch only, section 8) amounts in this model to: launch yaw error 0, side-spin
  0, power = min(p, cap). It removes both direction terms and the coin, which is why restarts with
  it on can be pixel-identical.

## 2. Sources, method and verification

- Decoder reports and scripts: `$S/research/swing/A/` (`report.md`, `overswing.py`,
  `delayed_spin.py`, annotated listings `ann_80420d84.txt`, `ann_804226fc.txt`,
  `ann_8041e80c.txt`), `$S/research/swing/C/` (`report.md`, `spinmodel.py`, `spinsweep.py`,
  `fn_80420570.txt`, `effrefs2.py`, `dd.py`), `$S/research/swing/D/` (`report.md`, `rngpaths.py`,
  `ballreach.py`, `randmodel.py`, `aimjitter_dist.py`, `windperm.py`, listings `f_*.txt`).
- Re-checks: `$S/research/swing/verify/` (one folder per claim, e.g. `A8/drift_check.py`,
  `C1/emu_c0c.py`, `D4/xref_rand.txt`); verdicts in `$S/fix/U/verdicts-done.json` and the
  workflow's verdict list. Disassembly with `$S/dol/doldis.py` (capstone), SDA bases r2 =
  0x806fe080, r13 = 0x806f8120; Caddie's symbols `$S/caddie/externals_NTSC_U.txt`.
- Recomputations for this document: `$S/research/swing/synth/` (`recompute.py`,
  `recompute_s88.py`, `gate_backswing.py`, `spinsweep_synth.py`, with copies of the decoders' and
  group T's simulators; outputs `*_out.txt`). No repository file was changed.

| claim | subject | re-check |
|---|---|---|
| A1 | gauge curve above raw 1 (slot 7), no upper clamp | confirmed |
| A2 | p2 = cap + min(p1 − 1, 0.25), putter p1·cap | confirmed |
| A3 | launch power = min(p3, lie factor); red is real power from capped lies | confirmed (wording: "factor 1.0" holds for every club but the putter) |
| A4 | putter: p1 = raw, power ≤ 2.5 (1.0 from rough/sand), no curve | confirmed |
| A5 | the red's only physics output besides power is the side-spin offset m | confirmed (+ m keeps its last red value; the red also shortens the window) |
| A6 | side of the red curve = popcount parity of one Sp2::Rand draw | confirmed |
| A7 | side = curve ± m, ball+0x9c = side·P18, positive = left | confirmed |
| A8 | full red bends as much as a full deliberate curve; drift sizes | confirmed (own simulator) |
| C1 | swing+0x7c written only by 0x80420570 in state 1 | **refuted**: the stored value is min(f24, gate), a running max |
| C2 | f24, gate, and their combination | **refuted**: f24 and gate right, combination is min, not product |
| C3 | input X = remote angle, f29X, tracker slew | confirmed (non-putter constants) |
| C4 | follower spring and its damping | confirmed (wording) |
| C5 | the shot fires on the impact frame | **refuted**: one frame later, on the first state-1 frame |
| C6 | state-1 window 18–25 frames, follower reversal, s48 zeroed at 1→2 | confirmed (+ a third exit) |
| C7 | raw power and the backswing-depth term s48 | **refuted**: s48/s50 update in states 0 and 3, not 1 and 2; s50 has a lie term |
| C8 | spin hand-off 0x80414854, never writes the lift | confirmed |
| D1 | Sp2::Rand formula and state | confirmed |
| D2 | seeded once at boot from the time base | confirmed |
| D3 | every golf consumer uses int(u·N) | **refuted**: 9 of 11 sites; the aim jitter uses u as a float, the coin a popcount |
| D4 | the 11 direct Rand call sites in the golf code | confirmed |
| D5 | the coin's code path | confirmed |
| D6 | m is deterministic, clamp(0.2 + 3.2(p3 − cap), 0.2, 1) | confirmed |
| D7 | resets of m and the coin; sign kept for the swing | confirmed |
| D8 | the coin reaches the ball only through 0x8041e594 | confirmed |

## 3. Over-swing: power

### 3.1 The power pipeline in the red

Function `0x80420d84` (the per-frame swing update), state-1 block `0x80421308`–`0x80421364`,
run on **every** frame of state 1, not only at impact:

```
raw   = 0x80422308(swing)              stored at swing+0x88 (0x80421314) every state-1 frame
p1    = 0x80407fb4 -> slot 7 (0x80409f60), then max(0, .):
          raw <  1: u = (raw - P3c)/(1 - P3c);  p1 = max(P3c, P3c + (1 - P3c)*u^log2(1/P34))
          raw >= 1: c = (cap >= 1 ? P40 : 1.0); p1 = max(1, 1 + 0.25*(raw - c)/(P44 - c))     no upper clamp
cap   = slot 16 (0x80409cb0): rough (attr 2) P48, bunker (attr 3) P50, any other lie 1.0
p2    = 0x8041e794: (p1 <= 1 or club type 3 = putter) ? p1*cap : cap + min(p1 - 1, 0.25)
p3    = 0x8041e664: = p2 for a human swing (returns swing+0x90 when swing+0xe4 == 0)
power = min(p3, slot 17 lie factor (0x80409c70 via 0x80407c88))   -> swing+0x98 (0x80421344-0x80421364)
```

Constants: 1.0 at r2−0x480 and r2+0x150; 0.25 at r2−0x474 (slot 7) and r2+0x16c (`0x8041e794`).
P40 = 1.1, P44 = 1.3 for driver..wedge (putter 1.0 / 1.25). The launch reads swing+0x98: the real
shot `0x8041210c` and the per-frame relaunch `0x8041490c` both `lfs f31,0x98(swing)` and pass it
to slot 3 (`0x80409e44`); nothing re-clamps it.

The lie factor equals **cap + 0.25 on every capped (club, lie) pair**, and the excess p2 − cap
never exceeds 0.25, so the factor never cuts it:

| lie | clubs | cap (bars of 4) | lie factor | the red adds | red starts at raw | full red at raw |
|---|---|---|---|---|---|---|
| tee, fairway, fringe, any other | DR–SW | 1.0 (4) | 1.0 (P58) | nothing | 1.1 | 1.3 |
| rough | DR–SW | 0.75 (3) | 1.0 (P4c) | +0.25 (one bar) | 1.0 | 1.3 |
| bunker | DR, SP | 0.25 (1) | 0.5 (P54) | +0.25 | 1.0 | 1.3 |
| bunker | 3i–9i | 0.5 (2) | 0.75 | +0.25 | 1.0 | 1.3 |
| bunker | SW | 0.75 (3) | 1.0 | +0.25 | 1.0 | 1.3 |
| any | putter | 1.0 | 2.5 (1.0 in rough or sand) | no red curve | — | — |

Inside the red on a capped lie the power rises linearly with raw: power = cap + 0.25·(raw −
1.0)/0.3. On a full lie raw 1.0–1.1 is a hidden dead band (p1 stays 1), and raw 1.1–1.3 fills the
red with no power added.

Status: re-checked, confirmed (A1, A2, A3, A4). Confidence high. The lie numbers are the
`ECollision` attributes (2 rough, 3 bunker), consistent with the KCL types and with the Switch's
player-confirmed 3-bar rough and 1/2/3-bar sand caps.

### 3.2 What the gauge shows (decoder only, A10)

The gauge (`0x804226fc` updates, `0x8041e80c` draws) fills 16·a0 of a 20-segment strip, with a0
a smoothed copy of min(p3, 1.25): an intermediate value at swing+0x9c chases that target by steps
of 0.001 + sqrt(0.02·|diff|), and a0 += 0.3·(swing+0x9c − a0) per frame.
So 16 segments = launch power 1.0, four segments per bar, and 16–20 is the red range up to 1.25.
The fill turns red (colour 0xf05028a0 instead of 0x7850ffb4) when a0 reaches the cap: rough from
12/16 to 16/16 (all real power), bunker from 4, 8 or 12 to 8, 12 or 16, full lies from 16 to 20
(no power). The display does not re-scale per lie: it draws the capped launch power, so a bar is
worth the same distance on every lie. This settles the open point in wsr-club-physics.md section
4.2 in the Switch observation's favour: the cap multiplies only how hard one must swing to reach
a given fill, not what a filled bar is worth.

Status: decoder only, not independently re-checked (A10). Confidence medium.

### 3.3 Capped lies make the red easier to reach

The raw value itself depends on the lie (corrected claim C7, re-checked):

```
raw = S + min(E, 2 - 1.95*clamp(S, 0, 1))                      0x80422308
S   = s48 + s50
s50 = max(0, P - s48) + P*(0.75 - 0.5*(cap - 0.25)/0.75)        P = s80*s84; cap from 0x80407cc8 (0x80421f0c)
E   = max(0, s74/s68 - 0.4 (when s68 > 0), 1.25*(s6c - 0.55))
```

So S = max(s48, P) + k·P with k = 0.25 on a full lie, 0.417 in rough, 0.583 for irons in a
bunker and 0.75 for woods in a bunker. The same motion therefore yields a higher raw on a capped
lie, on top of the red starting at raw 1.0 there instead of 1.1. What P (s80·s84) measures was
not decoded, so the size of the effect in real swings is unknown.

Status: formula re-checked (C7 correction). Confidence high for the formula, medium for the
consequence.

### 3.4 The power is not settled at impact

The pipeline above runs on every frame of state 1 (up to 25 frames after impact). Until state 2,
the ball manager re-simulates the real ball from launch every frame with the swing's latest
power and aim (`0x8041490c`; section 4.3), so the shot carries the **last** state-1 frame's
values. During state 1, s48 and s50 are frozen (C7), so only the bonus E can still change; its
accumulators (s68, s6c, s70, s74) are updated only in state 1, and their meaning was not decoded.
E adds at most 0.05 once S ≥ 1, but up to 2 − 1.95·S below that: part of an over-swing can be
completed in the follow-through.

Status: the per-frame recomputation and the replay are re-checked (C7, C8); "the ball carries the
last state-1 frame's values" is decoder only (A13). Confidence medium.

## 4. Over-swing: direction

### 4.1 The launch direction ignores the red

The real shot `0x8041210c` rotates the player's aim (player+0x84) by −`0x8041e570(swing)` through
`0x803ed8d8`; the per-frame relaunch uses the same value. `0x8041e570` = `0x8041e524(curve)` reads
only the player's curve input, the lie and the distance to the pin:

```
yaw = sign(curve) * (lo + (hi - lo) * x^log2(1/b)),   x = clamp((180 - clamp(d, 30, 180))/150 * |curve|, 0, 1)
      rough (attr 2): lo 2 deg, hi 4 deg, b 0.6;  bunker (attr 3): 2 deg, 12 deg, b 0.7;  other lies: 0
      d = horizontal distance to the pin in yd (0x803fc950 to GetPinPos 0x80402bd8, x 0.10936); curve <= 0 counts as negative
```

So the red never changes the start line; from rough or sand there is a **deterministic** yaw of
at least 2° even for a perfectly straight swing (7 yd at 200 yd), up to 4° (rough) or 12° (sand)
close to the pin with a full curve. Which side a negative curve maps to was not resolved.

Status: the red's own outputs (m at swing+0xc0, the coin at +0xd8) reach the ball only through the
side-spin writer, re-checked (A5, D7, D8). That the yaw routine reads no power value, and the yaw
formula itself, are decoder only (A9; decoder D found the same routine and constants
independently, D15). Confidence high for "no red in the yaw", medium for the lie yaw.

### 4.2 The red curve

```
tail of 0x80420d84, every call (0x8042217c-0x804221e4):
  if p3 (swing+0x94) > cap (slot 16):                                   fcmpo at 0x80422188, ble 0x8042218c
      m = swing+0xc0 = clamp(P24 + (P28 - P24)*(p3 - cap)/0.25, P24, P28)   slot 6 0x80409d78; 0.25 at r2-0x5e8
                                                                         P24 0.2, P28 1.0 (putter 0, 0)
      if swing+0xd8 == 0:  r = Sp2::Rand()  (bl at 0x804221cc)
                           swing+0xd8 = popcount(r) odd ? 1 : 2        popcount 0x8013bb10, stw at 0x804221e4
side      = curve + (swing+0xd8 == 1 ? +1 : -1) * m                     0x8041e594 (+-1 at r2+0x150 / +0x154); no clamp, |side| <= 2
curve     = clamp(sign(-v) * (|v|/0.7)^log2(1/0.4), -1, 1)              0x80422c78; v = smoother at swing+0xb4, +4
ball+0x9c = side * P18,  P18 = 0.5 DR/SP, 0.6 3i-SW, 0 putter          0x80414854 -> slot 4 0x80409e30, stfs at 0x80414884
flight, after lifetime > ball+0x58:  v += normalize(vz, 0, -vx) * |v|prev * 0.001 * s9c;  s9c *= 0.999     (Calc 0x80413b68)
```

- In raw terms: m = 0.2 + 0.8·min(1, (raw − 1.1)/0.2) on a full lie, 0.2 + 0.8·min(1, (raw −
  1.0)/0.3) on a capped lie. m reaches 1.0 exactly at the end of the red (p3 − cap = 0.25).
- m and the coin are zeroed on the first state-1 frame (`0x804213c0` / `0x804213c8`) and in the
  swing init `0x8042260c` (`0x804226a0` / `0x804226a4`). The coin is drawn on the first frame
  after that with p3 > cap and kept for the swing. m is written only on red frames, so if p3
  later drops back to the cap the last red value stays.
- The coin uses the global Sp2::Rand stream, so its side depends on how many draws came before
  (section 7), not on the swing.
- Positive side is left of the ball's travel on the north-up map (`normalize(vz, 0, −vx)` is to
  the left for any heading). With no deliberate curve, an odd popcount curves the ball left and
  an even one right. Which way a positive deliberate curve goes for a given avatar hand was not
  resolved.
- The curve input `0x80422c78` is deterministic (its callees are pure leaves; no path to an RNG).

Status: re-checked, confirmed (A5, A6, A7, D5, D6, D7, D8). Confidence high.

### 4.3 Timing: why the curve shows only after the ball has left

```
frame k     state 0 -> 1 (0x80421254-0x804212b8): g < 0.5 on two frames and swing+0x28 > swing+0x2c
            (recent peak remote speed above a decaying threshold); timer, s7c reset, s1c = s18; returns 0
frame k+1   first state-1 frame: the power pipeline runs, 0x80420d84 returns 1 (0x8042137c),
            0x803fcd44 -> 0x803fabb0 calls the real shot 0x8041210c (bl at 0x803fafac):
            ball start 0x80414ebc with side = back = 0, ball+0x16c = swing (0x80415044)
each frame  ball manager 0x80410b78 -> 0x8041490c: replays the shot from launch with the swing's
            latest power and aim, one frame further (copy r13-0x2c38, copied back by 0x8041549c)
end of 1    after ceil(n) state-1 frames, n = clamp(18 + 28*(1.25 - raw), 18, 25)
            (25 at raw <= 1, 18 at raw >= 1.25; r2+0x254/0x258/0x194/0x25c = 18, 7, 25, 1.25),
            or earlier when the follower's velocity (swing+0x10, +8) turns negative (0x8042144c),
            or when the ball is already at the cup (0x80421464-0x804214ec); on 1 -> 2, s48 = 0
state 2     0x8041e650 is true: 0x80414854 writes ball+0x9c (side), +0xa0 (backspin), +0x58 = this
            tick, copies the ball into the look-ahead balls and clears +0x16c
```

So both spins start 72–100 ticks (0.30–0.42 s) after launch; an over-swing (raw > 1) shortens the
window and makes them start up to 28 ticks sooner. The ball flies straight until then.

Status: re-checked (C5 corrected: the shot fires one frame after the 0→1 transition, on the
first state-1 frame; C6, C8; A5 and A8 for the window). Confidence high.

### 4.4 How far the red curve bends

Lateral drift at carry, full power, flat, no wind, no deliberate curve, the spin starting when
the window closes (4·ceil(n) ticks). Full lie (launch power stays 1.0):

| club | m 0.2 (edge of the red) | m 0.4 | m 0.6 | m 1.0 (full red) | full red if the spin acted from launch |
|---|---|---|---|---|---|
| driver | 6.8 yd | 13.9 | 20.9 | 35.3 | 40.8 |
| 3-iron | 6.7 | 13.5 | 20.4 | 34.3 | 39.7 |
| 7-iron | 4.2 | 8.6 | 13.0 | 21.9 | 25.8 |
| wedge | 1.5 | 3.1 | 4.8 | 8.1 | 10.3 |

From rough the curve and the extra power come together (power = 0.75 + (m − 0.2)/3.2):

| club | m 0.2, power 0.75 | m 0.6, power 0.875 | m 1.0, power 1.0 |
|---|---|---|---|
| driver | 4.2 yd (carry 183) | 17.0 (212) | 35.3 (236) |
| 3-iron | 4.2 (144) | 16.6 (166) | 34.3 (185) |
| 7-iron | 2.6 (98) | 10.5 (114) | 21.9 (127) |
| wedge | 0.9 (41) | 3.8 (48) | 8.1 (54) |

- A full deliberate curve (|curve| = 1) bends exactly as much as full red with the same start
  (driver 35.3 yd): same writer, same factor, same delay. A same-side red on top of a full curve
  doubles the bend; an opposite red cancels it.
- Carry shrinks a little with the bend (driver 240.2 → 236.3 yd at full red).
- A one-frame shift of the spin start moves the drift by 0.3 yd or less. A follow-through that
  ends the window early moves the start forward, toward the from-launch column.
- From rough the red is a poor trade: the first half bar of extra power (0.75 → 0.875) costs the
  driver 17 yd of random curve.

Status: the full-lie m 0.4 / 0.6 / 1.0 figures were re-checked with an independent simulator
(A8). The m 0.2 column and the rough table were computed here with the decoder's integrator
(`synth/recompute.py`, the same model). Decoder D's driver figures 8.2 / 24.6 / 40.8 yd (D9) are
the spin-from-launch values. Confidence medium (flat ground, no wind; the window length assumes
no early exit).

### 4.5 The red-bar wobble is display only (decoder only, A11)

`0x804226fc` shakes the bar: amplitude swing+0xc8 = 4·c4^0.737·|sin(phase)|^0.862 (signed), the
phase advancing clamp(0.12 + 0.28·c4, 0.12, 0.40) rad per frame (1.1–3.8 Hz), with c4 += 0.1·((a0
≥ cap ? m : 0) − c4). It runs while a0 ≥ 0.75·cap; entering the red plays sounds 0x5b8 / 0x5b7 and
starts an effect through `0x80407a48` (the effect archive has `WS2_glf_powerbar_dia/dot/frame`
emitters; which one was not traced). The only reader of swing+0xc8 is the gauge drawer
`0x8041e80c`. The wobble moves nothing in the physics.

Whether the wobble's direction shows the coin is **unresolved**: decoder D reads swing+0xd8 at
`0x80422a44` / `0x80422ac4` as the sign of the phase step (D10), but the A6 re-check found those
two reads gated by swing+0xe4, the flag whose branches the brief excluded from decoding, so when
they run for a human swing is not known.

Status: decoder only (A11, D10). Confidence high that it is display only, low on its direction.

### 4.6 Why the direction feels uncontrollable, in WSR terms

1. The side is a fair coin per swing, drawn from a stream that cosmetic draws (avatar gaze
   timers and the like) keep advancing; nothing in the motion influences it.
2. The size has a floor: the moment the bar is red, the curve is already 20 % of the strongest
   deliberate curve (driver about 7 yd); it grows linearly to 100 % (35 yd) at the end of the red.
3. The start line is right and the bend comes 0.3–0.4 s later, so the error is not visible when
   the ball leaves.
4. The red curve adds to the swing's own curve input; the player cannot tell which of the two is
   bending the ball.
5. The red depth is re-evaluated on every frame of the follow-through window (3.4), so the same
   impact can end at different depths.
6. On a full lie all of this comes with no extra distance at all.

## 5. Backspin

### 5.1 Where it is computed

Per 60 Hz frame, `0x803faf3c` → `0x803fcd44` → (`0x803fce70`) `0x80422d70` → the backspin writer
`0x80420570` (bl at `0x80422ee0`, skipped when the player+0x7c flag is set) → then the state machine
`0x80420d84` (bl at `0x80422ef8`). Each link has one caller. swing+0x7c (the swing-side backspin,
s7c) is written only by `0x80420570` at `0x80420c40`, only while swing+0x30 == 1; the only other
stores write 0 (`0x804212b4` at the 0→1 transition, `0x8042258c` in the reset `0x80422510`).

Status: re-checked (C1 for the writer's callers and stores). Confidence high.

### 5.2 The input: the remote's swing angle, a tracker and a follower

Non-putter constants (the putter's path, club type 3, is in brackets):

```
X    = motion+0x14 = unwrap(1.40625 * Atan2FIdx(R[2][0], R[2][2] - R[2][1]))   degrees (1.40625 = 360/256)
       R = the 3x3 at sensor+0x10, the rotation of the quaternion at sensor+0x34; refreshed on every
       sensor sample (listener 0x80424654 -> 0x80424468 -> 0x80424200); unwrapped by one +-360 step
       against the previous value, wrapped into (-450, 450]; left-handers negate three terms (motion+0x61)
       [putter: X is first multiplied by 0.1 + 0.9*clamp((s20 - 2)/6, 0, 1)]
f29X = 0.5 + 0.5*sign(X)*h(|X|/330)            [25]      h(x) = x for x <= 0.8, else 0.8 + 0.2*(1 - e^-((x-0.8)/0.2))  [knee 0.1]  (0x8035ace4)
s18 += clamp(f29X - s18, -0.015, +0.03)        [-0.08, +0.2]    tracker, swing+0x18, starts at 0.5   (0x8042088c-0x804208fc)
s1c  = max(s1c, s18)                                            its peak, swing+0x1c; set to s18 at impact
follower (swing+0x10: +4 g, +8 vel), spring 0x8035d5bc called at 0x80420a18:
       vel += k*(s18 - g) + c*(delta_s18 - vel);  g += vel
       k = 0.01 [0.05];  c = 0.3 + s78*(0.001 - 0.3)   [base 0.5]
s78  = powcurve(0.6, (1 - theta/45) * (1 - |2g - 1|) * min(s88, 1)) = x^0.737    swing+0x78
       theta = atan2(|v.x|, |v|) of sensor+0x80, degrees (x 1.40625, / 45)
```

In the decoder's reading X is the club angle in the swing plane: 0 at address, negative on the
backswing, positive in the follow-through. In the linear part f29X = 0.5 + X/660, so the tracker
can follow the remote at up to 19.8° per frame forward and 9.9° per frame back. The follower is a
slow spring (k = 0.01) that matches the tracker's velocity at rate c; c falls to 0.001 (almost
undamped) only for an on-plane swing (θ → 0), near address (g → 0.5), with raw ≥ 1, and then the
follower overshoots a tracker that stops. The overshoot grows as c drops (0.019 at c = 0.3, 0.062
at 0.12, 0.24 at 0.001 for a 0.25 ramp). Before impact s88 is 0: the reset `0x80422510` zeroes it
at `0x80422598`, and `0x80422d70` runs that reset on every frame while the byte player+0x7c is set
(`0x803fcd44` sets it once the previous shot's ball has passed the apex frame the look-ahead
predicted, ball+0x5c > ball+0x150), while s88 is written only on state-1 frames. This was read
for this document from the listings, not re-checked. So through the backswing and downswing
c = 0.3 and the follower tracks closely; the damping drops only once the first raw value is
stored, one frame after the launch. That switch is what makes the follower overshoot a club that
stops after the ball.

Status: re-checked, confirmed (C3, C4; the putter constants are from those re-checks). In C4,
"k = 0.01 for a human swing" means for any non-putter swing outside one post-launch case (state
2, swing+0xe4 set, follower moving back), which does not affect the spin. Confidence high.

### 5.3 The writer (corrected)

```
only while swing+0x30 == 1 (state 1; 0x80420a1c):
  over = max(0, g - max(0.5, s1c)) * (0.8 - s18)          0.5 at r2+0x168, 0.8 at r2+0x1e0
  r    = clamp(swing+0x88, 0, 1)                           the raw swing power, stored every state-1 frame
  lo   = 0.01*r;  hi = 0.01 + 0.03*r                       r2+0x134, r2+0x170
  u    = (clamp(over, lo, hi) - lo)/(hi - lo)
  f24  = u^log2(1/0.7) = u^0.515                           0x8035af6c with ln 0.7 (r2+0x128); 0 below 0.001
  gate = (clamp(s48, 0.125, 0.75) - 0.125)/0.625            r2+0x230, r2+0x22c
  s7c  = max(s7c, min(f24, gate))                          0x80420c0c-0x80420c40
ball+0xa0 = s7c * P1c   (P20 when the player's lie attribute is 3, bunker)   0x80414854 via slot 5 0x80409dfc
```

The combination at `0x80420c0c`–`0x80420c30` computes max(f24·gate, min(f24, gate)), which for two
values in [0, 1] is **min(f24, gate)**; the store at `0x80420c34`–`0x80420c40` keeps the larger of
that and the old value. The decoder read it as the product. The backswing-depth gate is therefore
a **ceiling** on the spin, not a factor: f24 = 0.8 with gate 0.5 stores 0.5, not 0.4.

In words: during the up to 25 frames after impact the spin is the follower's overshoot above the
highest tracker value so far (or above address), weighted by how far the tracker still is from
0.8. The weight is 0.3 at address, and it is 0 once the tracker reaches 0.8, at X ≈ +198°, so any
swing that follows through past about 200° gets no spin. A weighted overshoot of 0.01 gives
nothing and 0.04 gives full spin at full raw power (0.005 / 0.025 at raw 0.5). WSR's own help
text says the same in plain terms (`sports2.bmg`: "Using an iron or wedge, swing with extra wrist
snap to put backspin on the ball. It can help stop the ball from rolling off the green."; decoder
only, C12).

Status: corrected (C1, C2; the f24 and gate formulas themselves were confirmed). Confidence high.

### 5.4 The backswing-depth gate (corrected)

```
states 0 and 3 only (0x804218e0-0x80421900 skip the block in states 1 and 2):
  s40  = 1 - ((clamp(g, 0.22, 0.5) - 0.22)/0.28)^0.737       0x80420e10-0x80420ee4 (0 in states 1/2); pushed
                                                              into the ring at swing+0x60 every frame
  s54  = clamp(|sensor+0x44|, 0, T)/T,  T = 0.025 + 0.02*(1 - clamp(s48, 0.5, 1))
  N    = int(6 + 19 * s54 * s48^0.515)
  s48 += (0.2 - 0.19*s54) * (max(newest N ring entries, s40) - s48);   s48 = max(s48, s40)
s48 is frozen through state 1 and zeroed at 1 -> 2 (0x80421580)
```

Because s48 ≥ s40 on every frame before impact and the window of N frames covers a fast
downswing, s48 at impact is about the peak s40, i.e. a function of the **lowest point the
follower reached at the top of the backswing**:

| follower at the top, g | ≥ 0.454 | 0.42 | 0.40 | 0.36 | 0.32 | 0.28 | ≤ 0.263 |
|---|---|---|---|---|---|---|---|
| remote angle if g caught up (g = 0.5 − abs(X)/660) | ≤ 31° | 53° | 66° | 92° | 119° | 145° | ≥ 157° |
| gate (spin ceiling) | 0 | 0.15 | 0.25 | 0.44 | 0.65 | 0.89 | 1 |

Running the decoded tracker and spring on linear ramps of X, with the follower damped at c = 0.3
as it is before impact (5.2; `synth/recompute_s88.py`): the gate is set mostly by the depth,
−60° giving 0.11–0.23, −100° 0.43–0.56, −150° 0.80–1.0 and −200° 1.0. The exception is a very
quick backswing: the tracker can fall only 0.015 per frame, so a backswing shorter than about 16
frames (0.27 s) with no pause at the top cannot open the gate whatever its depth (8 frames: 0.21
at −100°, −150° and −200° alike; 1.0 at −150° after a 12-frame pause). A deep backswing, or a
brief pause at its top, opens the gate.

Status: corrected (C7: the states are 0 and 3, not 1 and 2; the s40 formula itself was
confirmed). The table follows from the re-checked formulas; the ramp runs are a model of the
Wii input. Confidence high for the formulas, medium for the ramps. (`synth/gate_backswing.py`
runs the same ramps with the decoder's damping, which lets the follower lag far behind before
impact and makes quick backswings look gate-less; the code's s88 = 0 rules that out.)

### 5.5 "Spin scales with power": what that is in WSR

Nothing multiplies the spin by the power. The power enters three ways, all on the raw (Wii)
side: the gate is s48, the backswing-depth term of raw, and it caps the spin; r = clamp(raw, 0, 1)
narrows the window at low power (less overshoot needed); and min(s88, 1) in s78 damps the
follower more at low power (less overshoot produced). In the model the same motion gives s7c =
0.88 at raw 0.5 against 1.0 at raw 1.0 (0.73 with the decoder's damping; 5.6). The launch power
(after the curve, the lie cap and the lie factor) never enters: **the lie cap does not cap the
spin in WSR**. Only the bunker's own factor column P20 (0.2–0.7 instead of 0.25–1.0) reduces it.
An over-swing adds no spin (r is clamped at 1) and shortens the window from 25 to 18 frames.

Status: follows from the re-checked writer and state machine (C1–C4, C7, C8). That the writer
reads no lie value at all rests on the decoder's listing and the re-checks of its arithmetic.
Confidence medium-high.

### 5.6 What the input model gives (recomputed)

The decoder's model (`C/spinmodel.py`: the tracker, spring, writer and state machine above, fed
linear ramps of X; the impact trigger's speed test is a stand-in, |ΔX| ≥ 10° per frame; s48 is
an input, not derived from the ramp) was rerun three ways (`synth/recompute.py`,
`synth/recompute_s88.py`): **this document's** version, with the corrected min and s88 = 0 until
it is first written, as the code has it (5.2); the corrected min with the decoder's damping (raw
used in s78 in every state); and the decoder's original product. Backswing to −150° over 30
frames and s48 0.75 (gate 1) unless stated:

| swing | gate | s7c, this document | min, decoder's damping | decoder's product |
|---|---|---|---|---|
| stop at the ball (0°) after an 8-frame downswing | 1 | 1.00 | 1.00 | 1.00 |
| stop at 0° after a 5-frame downswing | 1 | 1.00 | 1.00 | 1.00 |
| stop at +40° | 1 | 1.00 | 1.00 | 1.00 |
| stop at +80° | 1 | 0.77 | 0.80 | 0.80 |
| stop at +120° | 1 | 0.42 | 0.48 | 0.48 |
| stop at +160°, +200°, or a follow-through to +300° | 1 | 0 | 0 | 0 |
| stop at 0° after a slow 16-frame downswing | 1 | 0 | 0 | 0 |
| stop at 0°, raw 0.5 | 1 | 0.88 | 0.73 | 0.73 |
| stop at +80°, raw 0.5 | 1 | 0.64 | 0.58 | 0.58 |
| stop at 0°, off plane (θ ≈ 22°) | 1 | 0.59 | 0.43 | 0.43 |
| stop at +80°, off plane | 1 | 0.33 | 0.24 | 0.24 |
| stop at 0°, s48 0.25 / 0.40 / 0.55 / 0.125 | 0.20 / 0.44 / 0.68 / 0 | 0.20 / 0.44 / 0.68 / 0 | same | same |
| stop at +80°, s48 0.40 | 0.44 | 0.44 | 0.44 | 0.35 |
| stop at 0°, raw 0.5, s48 0.40 | 0.44 | 0.44 | 0.44 | 0.32 |
| stop at 0°, off plane, s48 0.40 | 0.44 | 0.44 | 0.43 | 0.19 |
| −60° backswing in 12 frames, 4-frame downswing | 0.15 from the ramp | 0.76 at gate 1, so 0.15 | 0 | 0 |
| −150° backswing in 12 frames | 0.53 from the ramp | 1.00 at gate 1, so 0.53 | 0 | 0 |

- The min correction leaves every result the decoder listed unchanged, because in each one
  factor was 0 or 1; it matters when a partial backswing meets a partial stop (the s48 0.40 rows).
- The damping before impact matters more: with the decoder's damping the follower lags far
  behind on a quick backswing and the stand-in trigger never fires, which is why the decoder's
  "−60° backswing → 0" case read as a gate effect. With s88 = 0 before impact both quick
  backswings reach state 1 and spin, and their gates (computed from the ramps as in 5.4) cap them
  at 0.15 and 0.53. The standard −150° / 30-frame backswing itself gives a gate of 0.92, so the
  gate-1 rows slightly overstate it.
- The profiles illustrate the Wii input; they are not predictions for the Switch.

### 5.7 What the ball gets, and what backspin does

ball+0xa0 at s7c = 1, the landing factor f = 1 − 0.6·bs^0.737 and the pull-back length |P| =
0.06·min(bs, 0.9)^0.61 u/tick (wsr-ground-phase.md section 5):

| club | P1c | P20 (bunker) | bs at s7c = 1 | f | abs(P) u/tick |
|---|---|---|---|---|---|
| 3i | 0.25 | 0.2 | 0.25 | 0.78 | 0.026 |
| 5i | 0.5 | 0.35 | 0.5 | 0.64 | 0.039 |
| 7i | 0.7 | 0.5 | 0.7 | 0.54 | 0.048 |
| 9i | 0.9 | 0.6 | 0.9 | 0.45 | 0.056 |
| wedge | 1.0 | 0.7 | 1.0 | 0.40 | 0.056 |
| woods, putter | 0 | 0 | 0 | 1 | 0 |

**In the air it does nothing.** The lift ball+0x98 = P14·q is set at launch, and the hand-off
`0x80414854` never writes it (re-checked, C8). Calc's lift and side terms read only +0x98 and
+0x9c; backspin is read only in the ground blocks. So carry, apex and hang time are the same with
and without backspin. The decoder's scan of every ball+0xa0 read (C10) is decoder only.

**On the ground** (wsr-ground-phase.md sections 3.2 and 5, not redone here): on a contact after at
least four ticks in the air the restitution is multiplied by f, and bs by f once the steering has
started; from the first ground tick after frame 30 the pull-back P pushes the ball back toward
where it came from, decaying by w per tick (fairway 0.834, green 0.89), and 30 % stronger when it
points within 5° of the pin. Stop distances from group T's port, full power, flat, h = 1, by the
swing-side value s7c (`synth/spinsweep_synth.py`; the s7c axis does not depend on the
correction):

| landing | 3i | 5i | 7i | 9i | wedge |
|---|---|---|---|---|---|
| carry | 189.8 | 159.9 | 130.1 | 99.8 | 55.2 |
| green, s7c 0 | 214.9 | 176.6 | 147.7 | 109.3 | 72.3 |
| green, s7c 0.5 | 206.6 | 167.7 | 136.6 | 98.8 | 58.9 |
| green, s7c 1 | 202.9 | 163.4 | 130.8 | 89.7 | 52.4 |
| fairway, s7c 0 | 211.7 | 175.6 | 145.8 | 109.5 | 60.0 |
| fairway, s7c 1 | 204.8 | 167.4 | 135.8 | 101.2 | 53.8 |

The spread from no spin to full spin is 12–20 yd on a green (19–20 yd for the 9-iron and the
wedge, which finish 10 and 3 yd behind their landing spots) and 6–10 yd on fairway; at 3 bars
(power 0.75) 15–19 yd on a green. Half the input already buys most of the effect (the 9-iron on a
green: 109.3 → 98.8 → 89.7).

Status: factors and hand-off re-checked (C8; block values in wsr-club-physics.md); ground model
re-checked by group T. Confidence high for the mechanism, medium for the tables (flat plane, h =
1, no wind).

### 5.8 Why two shots with the same power can finish far apart

1. Power and spin come from different parts of the swing: power from the backswing depth and the
   swing up to impact (s48, P, E), spin from the stop after impact. The bar fill constrains the
   spin only through the backswing ceiling.
2. The spin input is steep: a weighted overshoot of 0.01 gives nothing and 0.04 everything, and a
   stop a little later in the follow-through, or a little off plane, changes it a lot (5.6).
3. The ground amplifies it: 12–20 yd on a green between none and full (5.7).
4. Where the ball lands relative to the pin changes the pull-back by up to 30 % (pin homing), the
   green's first-contact rule for irons (A = 0.48 instead of 0.15) and the surface's decay w also
   differ between a green and its fringe.
5. Nothing random is involved: no path from the writer, the state machine, the hand-off or the
   contact routine reaches the random number generator (section 7).

## 6. The landing puff (decoder only; dispatch re-checked)

What the code does, from the decoder's listing of the contact routine `0x8041228c` (the block
`0x80412b20`–`0x80412dfc`, which group T's listing of the same routine summarises as "sounds and
particles by attribute, volume ∝ (vn − 0.05)/0.45, frames ≥ 15"):

```
per tick, after the contact loop, for the real ball (a look-ahead ball only on its flagged frame):
  vn = the tick's largest normal impact speed (accumulator at 0x804126e0)
  if vn > 0.05 u/tick (1.2 m/s; r2-0xc8)  and  ball+0xbc != 1 (not in water)  and  ball+0x5c (frames) >= 15:
      I = clamp((vn - 0.05)/0.45, 0, 1)
      attr' = 0x80400a88(kcl, pos, attr)       (a bunker within 2 u of fairway or rough counts as that)
      attr' 1 -> WS2_glf_fairway_bound (0x8067c0d9)     2, 4 -> WS2_glf_rough_bound (0x8067c0ef)
            3, 16 -> WS2_glf_bunker_fall (0x8067c103)   12 -> WS2_glf_rock_bound (0x8067c0c6)
            anything else (6 green, 9 fringe, 15 tee, 10/11 cup, 14 glass) -> no particle
      spawn 0x803f2080(handle, name, &ball+0x4c, &normal, 0.5); emitter setters scaled by I
      (fairway/rough: int(35 + 10I), 5 + 10I, 0.1 + 0.2I, 0.2 + 0.2I; bunker: 0.25 + 0.25I, 0.2 + 0.2I,
      int(3 + 5I), colour (0.8 + 0.2I, 0.6 + 0.2I, 0.2)); started by 0x803f1f74(handle, -1)
```

The four names are referenced once each in the binary, all here, through one split address (lis
0x8068; addi −0x3f90; then +0x56 / +0x69 / +0x7f / +0x93). The same 0.05 / 15-frame / (vn −
0.05)/0.45 rule drives the landing sound in the event `0x80411b6c`. The block reads no spin field.

So in WSR the puff (a) is raised on **every** bounce above 1.2 m/s, not only the first, (b) never
on the green, fringe or tee, (c) has nothing to do with backspin, and (d) grows with impact speed.
Contacts above the threshold per full-power shot, from group T's port (`synth/recompute.py`;
these are contacts, which produce a puff only on the listed surfaces):

| landing | no spin | full spin (s7c = 1) |
|---|---|---|
| fairway, driver | 4 (0.72, 0.32, 0.15, 0.07 u/tick) | — (woods do not spin) |
| fairway, 7i / 9i / wedge | 4 | 2 |
| fairway, 3i | 4 | 3 |
| rough, any club | 3 | 2 (3i: 3) |
| green | 4 contacts, no puff | 2 contacts, no puff |

Backspin lowers the count only because it softens the bounces (B·f). A rolling ball (vn ≈ 0.0013
u/tick) never puffs.

The canopy: passing through a canopy only slows the ball (×0.98 per tick, ×0.94 for palm fronds)
and keeps its spin; a trunk hit zeroes ball+0x98..+0xa0, backspin included
(wsr-tree-collision.md). So in WSR a ball that went through leaves still has its backspin when it
lands.

The golf effect archive (`Effect/GlfScene`, `WS2_effect_glf.breff`) has no emitter named for spin
and none for a green landing; the only smoke-named entry is the texture `ws2n_smoke02`. main.dol
has no golf string with "spin" or "smoke" in it (golf effect names are also built with
`WS2_glf_%s`, so a runtime-built name cannot be excluded from the strings alone).

**The Switch.** A puff that appears only with backspin, on fairway and on the green, is not WSR's
rule. Two places in WSR's contact routine would fit such a trigger, and a Switch test can tell
them apart: the branch that applies the backspin factor (`0x804127e0`–`0x8041286c`: a contact
after at least four ticks in the air with bs > 0, which fires again on later landings from the
air), and the "first contact this shot" flag ball+0x17f (set at `0x80412ae4`, already used by the
irons-on-green rule), which fires once. Both are hypotheses about the Switch.

Status: decoder only (C13–C16), partly re-checked on 2026-10-19: the four names at 0x8067c0c6 /
0x8067c0d9 / 0x8067c0ef / 0x8067c103, a block that branches only on the surface attribute (12, 1,
2, 4, 3, 16, plus the frame and in-water gates), and no load or store of ball+0x98..+0xa8 (lift,
side spin, backspin, pull-back) anywhere in 0x80412b20–0x80412dfc. The contact counts use group T's
re-checked ground model. Confidence high for the names and their single use site, medium for the
exact gate (it agrees with group T's reading of the same block).

## 7. Randomness

### 7.1 The generator

```
Sp2::Rand 0x8025c9b0 (Caddie: Rand__3Sp2Fv), state s0 = 0x806f4e38 (r13-0x32e8), s1 = 0x806f4e3c (r13-0x32e4):
   s0 = s0*0x41c64e6d + 0x3039;   if (s1 & 1) s1 ^= 0x00011020;  s1 >>= 1;   return s0 ^ s1
0x8025c968: the same on a caller-owned two-word state (unnamed in Caddie)
seed 0x8025c9ec: s0 = OSGetTick() (0x8004f250, mftb), s1 = tick + (tick >> 2)
   only caller 0x8022de28 in 0x8022de14, called once from main() 0x8022e3a8 at 0x8022e3c0: once per boot
```

Only Rand's own bodies and the seeder touch the state words; nothing takes their address and no
data word or address pair points at Rand or the seeder. The state starts at zero (.sbss) until
the boot seed.

Status: re-checked, confirmed (D1, D2, D4). Confidence high.

### 7.2 Who draws, and what each draw decides

The direct Sp2::Rand calls in the golf code (0x803ecb5c..0x80425000, bounded by the cycling and
Air Sports modules) are exactly these 11:

| call site | function | how the draw is used | decides |
|---|---|---|---|
| 0x803fd4dc, 0x803fd558, 0x803fd5c0 | 0x803fd458, per player per frame | int(60u) + 120, int(240u) + 240, int(60u) + 60 | avatar gaze countdowns |
| 0x803febc4, 0x803fec08 | 0x803feb54, per-stroke reset | int(300u) | avatar gaze countdowns |
| 0x803feddc | 0x803fed50, aim-line setup | u as a float, u^log2(1/0.95) | default-aim yaw jitter |
| 0x803ff7dc | 0x803ff70c | int(u·N) + a base | a prop animation timer |
| 0x80406748 | choosePin 0x804066e0 | int(u·count) | the pin spot, once per hole (tools/PINS.md) |
| 0x80407070 | 0x80406ffc | int(u·(n − used)) | the wind permutation, once per round |
| 0x80416064 | 0x80415fc0 | int(u·count) | an avatar reaction-animation variant |
| 0x804221cc | the swing update 0x80420d84 | popcount parity of the full word | the over-swing curve side |

u = ((Rand() >> 16) & 0xffff)/65536 in single precision at every site except the coin, and int()
is `__cvt_fp2unsigned` (0x80007730, truncating) at nine of them; the aim jitter keeps u as a float.
Outside the golf range, wrappers the golf code calls also draw: the putting-sound pitch and pan
(0x802bfc94, from 0x803fdf74), idle-animation timing (0x80348720), Mii model creation (0x8027bf84,
own state) and a scene-init object (0x8026ce6c).

Status: the 11 sites and their arithmetic re-checked (D3 corrected, D4); what each decides,
except the coin, is decoder only (D11–D13, D19, D21, D22). Confidence high for the list, medium
for the meanings.

### 7.3 The two draws that touch a shot

- **The over-swing coin** (section 4.2): one draw per swing, only when p3 exceeds the cap. In the
  ported generator it is fair (P(left) = 0.497–0.500 over 200 000 draws for four seeds,
  P(same as the previous swing) = 0.499; decoder only, D23).
- **The aim jitter** (decoder only, D11–D14): when the default aim line is set for a stroke
  (`0x803fed50`), unless its noJitter argument is set or the lie is green, fringe or cup:
  angle += (π/180)·0.2·(1 − 2·u^0.074). The result is one-sided: mean −0.172°, median −0.180°,
  5–95 % from −0.199° to −0.121°, positive only with probability 1e-4. That is a 0.72 yd offset at
  240 yd with about 0.3 yd of spread. The hole-start line to the hole's tee target is set with
  noJitter = 1 (no jitter); a line toward the pin gets it on the tee; the next-stroke setup
  (`0x803feedc` from `0x803f5318`) gets it. Manual aiming is incremental from the jittered angle,
  so the jitter survives into the launch (player+0x84 in `0x8041210c`). Which side of the
  minimap it lands on was not checked.

### 7.4 Everything else is deterministic

- Re-checked: the 11 sites above are the only direct callers in the golf code, nothing reaches
  Rand through a pointer (D4), and the side-spin path (`0x8041e594`, `0x80422c78`, `0x80420c9c`,
  `0x80414854`) reaches no generator or clock read at any call depth up to 10 (D8).
- Decoder only (D16–D18): a whole-binary call-graph search from Calc, the contact routine, the
  spin writer, the ball start, the real and look-ahead launches, the backspin writer, the curve
  input and the wind code finds no Sp2::Rand, no other generator (the MSVC 0x343fd cluster, the
  inlined ANSI and NR generators, MSL rand) and no clock read. The caveat is 2–29 unresolved
  virtual calls per root.
- Wind (decoder only, D19): drawn once per round at the GlfConfig setup (`0x80406920` →
  `0x804061fc` → `0x80406e00`, only on a fresh round) as random permutations, so every 8
  consecutive holes get each direction once; stored in StaticMem var 7+hole and never redrawn.
  This is consistent with the Switch's identical wind on a hole restart.

**Verdict.** In WSR the launch, flight, spin and landing are functions of the swing values and the
wind; the only random terms in a shot are the red-zone curve side and the sub-degree aim jitter.
Because the generator is seeded once at boot and advanced throughout play by cosmetic draws
(avatar gaze timers, animation variants), neither draw would repeat on a replay. The Switch's
pixel-identical restarts were taken with Shot Assist on (no red, so no coin) and, as far as
listed, on tee shots and putts, where WSR's jitter is off or absent; so they agree with WSR's
structure but do not yet show whether Switch Sports kept the coin or the jitter.

Confidence: high that backspin, landing and roll have no random term; high that the red curve's
side is random; medium for the aim jitter's conditions.

## 8. Shot Assist (a Switch addition)

Shot Assist (Options → User Settings → Other; local play only) does not exist in WSR, and nothing
was decoded for it. In the decoded model it amounts to: **launch yaw error 0** (curve input 0, and
no rough/sand lie yaw), **side-spin 0** (curve input 0 and no red, so m = 0 and the coin is never
drawn), and **power = min(p, cap)** (the red quarter above the cap is unreachable). It says
nothing about backspin, which in WSR is the post-impact input, and it would not remove WSR's aim
jitter, which sits on the default aim line before the swing. That is what makes it the control
for every experiment in section 12: it removes the red-zone coin and both direction terms, and
pins the power to an exact bar.

## 9. What is WSR-only and what is structure

Structure that Switch Sports may well keep (each needs a Switch test, section 12):
- The bar shows launch power on a fixed scale; a capped lie caps the fill; the red is a fixed span
  above the cap.
- On a full lie the red adds no distance; on a capped lie it is real power up to one more bar
  (lie factor = cap + one span).
- The red adds side-spin, never a launch-angle change; its size is deterministic in the red depth
  with a floor, its side random; it equals a full deliberate curve at the end of the red.
- Spin is attached when a post-impact window closes, so the ball starts straight and bends later.
- Backspin is decided by the motion after impact, separately from the power, capped by the
  backswing; a per-club factor with woods at 0; it acts only on landing and in the roll.
- Landing effects are named by surface, raised in the contact routine and scaled by impact speed.
- One shared generator; the physics is deterministic.

WSR numbers that the Switch surely changed:
- The red span 0.25, the dead band P40 = 1.1, its end P44 = 1.3, the curve floor and ceiling
  P24/P28 = 0.2/1.0, the side factor P18 = 0.5/0.6, the backspin columns P1c/P20, the window
  18–25 frames, the lie yaw 2/4/12°, the puff gate 0.05 u/tick and 15 frames, the jitter 0.2° /
  0.95.

Wii-only, cannot transfer: the whole motion side, i.e. the remote angle X, 330° and the 0.8 knee,
the slew 0.015/0.03, the spring k and c and the on-plane measure, the window lo/hi, the gate
0.125/0.75 and s40's 0.22/0.5, the raw accumulators (s48, s50, s68–s84), the impact trigger.

Known Switch differences already visible: the puff (spin-gated and on the green on the Switch,
neither in WSR); Shot Assist itself.

## 10. Not found, not decoded, unresolved

- The meaning of the raw accumulators s68, s6c, s70, s74 (the bonus E) and s80, s84 (P), and the
  sensor vectors sensor+0x44, +0x80, +0xd8 (Wii fusion).
- The swing+0xe4 branches (`0x8041e664`, `0x80407d08`), excluded by the brief; whether +0xe4 gates
  the wobble's use of the coin (4.5).
- Which way a positive deliberate curve, or the rough/sand lie yaw, goes for a given avatar hand.
- The names of sounds 0x5b7 / 0x5b8 / 0x5de and of the `0x80407a48` effect; the purpose of
  `0x80408854` (receives min(raw, 1)); a gauge element drawn only when the cap is 1.
- Which emitter setter in the puff is count, lifetime or scale.
- Which minimap side the aim jitter falls on.
- Whether a puff-like effect exists under a runtime-built name (`WS2_glf_%s`).
- The Wii's raw putt range.
- Anything about the Switch's input: how a Joy-Con swing or a button press becomes power,
  curve and backspin is outside WSR.

## 11. Confidence

- Over-swing power pipeline, lie caps and factors, red = real power only from capped lies:
  **high** (re-checked A1–A4).
- The red curve: size formula, coin, side formula, delayed start, equal bend to a full curve:
  **high** (re-checked A5–A8, D5–D8); drift tables **medium** (flat, no wind).
- The gauge draws the capped power on a fixed scale; the wobble is cosmetic: **medium** and
  **high**, decoder only.
- The lie yaw from rough and sand: **medium**, decoder only (two decoders agree).
- Backspin chain (X, tracker, spring, writer, gate as a ceiling, window, hand-off): **high**
  (re-checked C1–C8, with three corrections); profile and gate-ramp tables: **medium** (model of
  the Wii input).
- Backspin does nothing in the air; its landing and roll effects: **high** (C8 plus group T).
- The landing puff's names, gate and surfaces: **high** for the names, the surface dispatch and the
  absence of any spin read (re-checked), **medium** for the exact speed gate (decoder only).
- One generator, seeded at boot; the 11 call sites: **high** (re-checked D1–D4). Physics
  deterministic: **high** for the spin and side-spin path, medium-high overall (decoder-only
  reachability, unresolved virtual calls). Aim jitter: **medium**, decoder only.
- All of it is WSR (Wii).

## 12. Switch experiments that would calibrate or refute each term

Two tools make these clean: **restart determinism** (restarting a hole in local play restarts its
3-hole track with identical wind) and **Shot Assist** as the control (exact power at the lie's
full bar, straight, no red). Log carry as the first bounce on the minimap or the ball-cam, and
stop as the "yd to go" change.

1. **Red on a full lie adds nothing.** Tee shot with the driver: Shot Assist (4 bars) against
   Shot Assist off with the deepest red you can reach, restarting between shots. WSR: same carry
   (240 → 236 yd at full red, the loss from the bend) and 7–35 yd sideways. A longer red carry
   refutes it.
2. **Red from a capped lie is real power, up to one bar.** From rough: Shot Assist (3 bars)
   against red swings. WSR: carry rises from the 3-bar value toward, never past, the 4-bar
   value; at the edge of the red there is a curve but no extra distance. Bunker: wedge 3 → 4,
   irons 2 → 3, woods 1 → 2. If the red adds nothing from rough, the caps are hard as the solver
   assumes.
3. **The red curve's side is random.** Ten or more red swings of similar depth from the same spot
   after restarts. WSR: left and right about equally often (ten on one side has p = 0.002), with
   no link to the swing. A side that follows the swing means the Switch replaced the coin.
4. **The size has a 20 % floor and grows with depth.** Note the red fill at release (gauge
   screenshot) and the lateral miss. WSR: miss ∝ 0.2 + 0.8·(depth into the red); the slightest
   red gives a fifth of the full-red miss (driver 7 vs 35 yd).
5. **The bend starts late.** Ball-cam or minimap trail of a red shot: WSR flies straight for
   0.30–0.42 s and then bends. A bend from the first frame means the spin is applied at launch
   (and the drift is about 16 % larger).
6. **No launch yaw from the red; a lie yaw from rough and sand.** Compare the start line with the
   aim line: red vs non-red on fairway (WSR: no difference), and a straight non-assist swing from
   rough or sand (WSR: at least 2° off, about 7 yd at 200 yd, always to the same side). Shot
   Assist from rough going dead straight means it also removes that term.
7. **Backspin comes from the stop after impact, not from chance.** Shot Assist, same spot after
   restarts, 9-iron or wedge onto a green; vary only the post-impact action: a hard stop right
   after the ball vs a full follow-through. WSR: full vs no spin, about 90 vs 109 yd stop for a
   full 9-iron, first bounce 0.6 vs 3.3 yd high. Then repeat one action several times: identical
   actions should give identical spin. Spin that changes with the same action and the same
   restart points to a random term WSR does not have.
8. **The backswing caps the spin.** Same hard stop after a deep, slow backswing vs a short, quick
   one, at the same club. WSR: the short, quick one gets little or no spin whatever the stop.
9. **Lie cap and spin.** Same club and stop from rough (full swing, 3 bars) and from fairway with
   a full swing; compare the pull-back (stop minus landing spot), not the finish. WSR: the same
   spin from rough as from fairway; less from a bunker (P20 ≈ 0.7·P1c). CLAUDE.md's "capped lies
   also cap spin" would show as a smaller pull-back from rough.
10. **Backspin does nothing in the air.** Same carry and apex with full and no spin (ball-cam
    landing spot). WSR: identical; only the bounce and roll change.
11. **Pin homing.** Two equal-spin shots, one landing just short of the pin and one just past:
    WSR pulls the one past the pin back 30 % harder.
12. **The puff's trigger.** (a) The same landing with and without spin on fairway, rough and
    green: WSR puffs on every bounce above 1.2 m/s on fairway and rough regardless of spin (a
    full drive 4 times on fairway) and never on the green. (b) Count puffs per landing: first
    contact only means a "first contact" trigger (ball+0x17f-like), every landing from the air
    with spin means the backspin-factor branch. (c) Find the spin threshold with partial stops
    (use the pull-back distance as the measure of spin). (d) Bunker and fringe landings. (e) A ball
    that clips a trunk (WSR zeroes its spin) vs one through a canopy (WSR keeps it): no puff after
    a trunk hit if the trigger reads spin.
13. **The aim jitter.** On a second stroke (not a tee shot, not a putt), take the identical shot
    from the identical spot twice after restarts (Shot Assist, same aim ticks). WSR: the default
    line differs by up to about 0.08° (0.3 yd at 240 yd) between restarts, below the minimap's
    pixel but visible in "yd to go". Identical results mean no jitter, or a seed per restart.
14. **The wobble's direction.** Record whether the red bar's shake direction predicts the side
    the ball curves (unresolved in WSR).

## 13. Files

- `$S/research/swing/swing-redzone-spin.md` (this document)
- `$S/research/swing/synth/recompute.py` → `recompute_out.txt`: corrected backspin profiles, the
  gate table, the drift at m = 0.2 and from rough, the puff contact counts
- `$S/research/swing/synth/recompute_s88.py` → `recompute_s88_out.txt`: the profiles with s88 = 0
  before impact (this document's version) and the gate vs backswing depth and duration at c = 0.3
- `$S/research/swing/synth/gate_backswing.py` → `gate_backswing_out.txt`: the same ramps with the
  decoder's damping (superseded, kept for comparison)
- `$S/research/swing/synth/spinsweep_synth.py` → `spinsweep_out.txt`: stop distance by s7c
- copies used: `synth/spinmodel_orig.py` (decoder), `synth/spinmodel_min.py` (min correction),
  `synth/spinmodel_min_s88.py` (min correction and s88 = 0 before impact), `synth/groundsim.py`
  (= `tools/research/wsr-groundsim.py`), `synth/flightsim.py`; run each with `python -I -B` from
  `synth/`
- decoder reports: `$S/research/swing/A/report.md`, `C/report.md`, `D/report.md`; re-checks:
  `$S/research/swing/verify/`, `$S/fix/U/verdicts-done.json`
