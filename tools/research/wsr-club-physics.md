# WSR club physics: what the disc and main.dol say (group R, 2026-10-18)

Everything below is from `C:/Users/Stephen/Downloads/WSR_Extract/DATA/sys/main.dol` (Wii Sports
Resort, NTSC-U rev 1) unless marked otherwise. It describes the **Wii** game. Nintendo Switch
Sports has its own tuning; the structure (which quantities exist and how they combine) is what
can be carried over, the numbers may not be. The claims are ranked at the end.

## 1. Summary

- There is **no tuning file on the disc**: `Common/GlfScene/common.carc` holds only models,
  textures, a tree KCL and lighting; the layout, effect and message archives hold UI. All club
  and ball tuning is compiled into `main.dol`.
- Each of the 8 clubs owns a **40-word parameter block** (0xa0 bytes): driver `0x806d4f00`,
  spoon `0x806d4fa0`, 3i `0x806d51c0`, 5i `0x806d5260`, 7i `0x806d5300`, 9i `0x806d53a0`,
  sand wedge `0x8067b968`, putter `0x8067ba08`. The RPGlfClub constructors
  (`0x804074a4` woods, `0x80409b38` irons, `0x804075c0` SW, `0x804076bc` PT, built by
  `RPGlfClubManager` ctor `0x80409838`) store the block pointer at club+0x18; 16 virtual
  accessors (`0x80409c70`..`0x80409f60`) read it.
- **Launch**: `q = power^(log2(1/P38))` (P38 = 0.71 driver .. 0.64 wedge, so q ≈ sqrt(power));
  `speed = P00 + q·(P04 − P00)` with P04 = 3.39 / 3.13 / 2.79 / 2.45 / 2.13 / 1.78 / 1.28 units
  per tick (1 unit = 0.1 m, tick = 1/240 s, so the driver leaves at 81 m/s = 182 mph);
  **launch angle P10 = 10 / 11 / 19 / 23 / 24 / 30 / 43 degrees** (driver → wedge, putter 0);
  aerodynamic lift P14·q with P14 = 0.65 / 0.70 / 0.5×4 / 0 (wedge gets no lift).
- A Python port of `RPGlfBall::Calc` (`$S/research/flightsim.py`) reproduces the integer column
  P0c = **240 / 220 / 190 / 160 / 130 / 100 / 55 yd** as the full-power flat carry to within
  0.3 yd for all seven clubs (240.2 / 219.8 / 189.8 / 159.9 / 130.1 / 99.8 / 55.2). Carry is
  **linear in power** to ±2 % (driver: 0.25 → 57 yd, 0.5 → 121, 0.75 → 183, 1.0 → 240).
- **Lies**: rough caps power ×0.75 for every club; bunker ×0.25 (driver, spoon), ×0.5 (irons),
  ×0.75 (wedge), ×1 (putter): exactly the Switch's 3 / 1-2-3 bars. A second per-lie limit
  (bunker 0.5 woods / 0.75 irons / 1.0 wedge; everything else 1.0) bounds what an over-swing can
  add. Launch angle and lift do not change with the lie; bunker backspin uses a smaller factor.
- **Spin**: woods have backspin factor 0 (cannot backspin); irons 0.25 / 0.5 / 0.7 / 0.9, wedge
  1.0 (bunker: 0.2 / 0.35 / 0.5 / 0.6 / 0.7). Side-curve factor 0.5 woods, 0.6 irons and wedge.
- **Wind**: 8 directions at 45° steps, 16 speed indices; magnitude
  `15·(idx/15)^0.737 · clamp(0.1 + 0.9·height/30 m, 0.1, 1)`; crosswind pushes the ball at full
  weight, head/tail wind at 0.6. Simulated full driver in 30 mph: cross drift 30.6 yd, tail
  +22 yd, head −20 yd; in 10 mph: 13.7 / +9.5 / −9 yd (sub-linear in speed).

The CLAUDE.md line "WSR official maxes seed defaults: driver 250, spoon 200, 3i 175, 5i 155,
7i 135, 9i 100, wedge 80" is **not** what WSR's binary holds: WSR's nominal carries are
240/220/190/160/130/100/55 (P0c) and its full-power stop distances on flat fairway (carry + roll)
are 279/253/212/176/146/110/60 (P08, reproduced by `wsr-groundsim.py`; the club recommender uses
the same column). Those 250/200/... numbers are presumably Switch guide values.

## 2. Sources and method

- Disc listing (`$S/research/list-carc.mjs` using the repo's `yaz0Decode`/`u8Files`):
  `Common/GlfScene/common.carc` = `WS2_glf_tree3.kcl`, `Env/*`, `Environment/*`, `G3D/*.brres`
  (avatar, ball, bar, clubs, cup, pins, trees, wind model, ...). `LayoutCommon/GlfScene` =
  `WS2_game_glf.arc` (UI). `Effect/GlfScene` = breff/breft. `US/Message/message.carc` =
  `sports2.bmg` (text; not searched for yardages). No param/ball/club data files.
- DOL scans (`scanfloats.py`, `scanstride.py`): no contiguous or strided run of 7 floats matches
  the published yardages at any scale; the data sits in per-club blocks of mixed ints and floats.
- Code: found via `RPGlfClubManager::sInstance` (r13−0x2c80) stores → `CreateInstance`
  `0x804099fc` → ctor; vtable call-site scans (`vcalls.py`, `vslots.py`); `RPGlfBall::Calc`
  `0x80413b68` (Caddie symbol); `RPGlfSimManager::spSimBall` (r13−0x2c38) → sim shot
  `0x8041490c`; real shot `0x8041210c`. Disassembly listings are in `$S/research/*.txt`.
- `$S` = `C:/Users/Stephen/AppData/Local/Temp/claude/c--Users-Stephen-Desktop-caddie-switch-web-caddie-web/c4363058-c34c-4a67-9f33-dfc0e5ebac83/scratchpad`.

## 3. The club parameter block (40 words, decoded values)

Offsets are into the block. "slot N" = vtable slot (byte offset N×4) of RPGlfClub.

| off  | DR    | SP    | 3I   | 5I   | 7I    | 9I   | SW    | PT    | meaning, and how it is known |
|------|-------|-------|------|------|-------|------|-------|-------|------------------------------|
| 0x00 | 0.02  | 0     | 0    | 0.02 | 0     | 0    | 0.01  | 0.004 | launch speed at power 0 (0x8040a0d4: speed = P00 + q·(P04−P00)) |
| 0x04 | 3.39  | 3.13  | 2.79 | 2.45 | 2.13  | 1.78 | 1.28  | 0.41  | launch speed at power 1, units/tick (0.1 m, 1/240 s) |
| 0x08 | 279   | 253   | 212  | 176  | 146   | 110  | 60    | 20    | int, yards: full-power stop distance on flat fairway (carry + bounces + roll), reproduced by wsr-groundsim.py to 0.4 yd (wsr-ground-phase.md); the recommender also uses it (0x804090ac compares P08×9.144 with the distance to the pin) |
| 0x0c | 240   | 220   | 190  | 160  | 130   | 100  | 55    | 20    | int, yards: nominal full-power carry (0x80409048 returns P0c×9.144 units; used at 0x803fb448, 0x804031b4). Reproduced by simulation |
| 0x10 | 10    | 11    | 19   | 23   | 24    | 30   | 43    | 0     | launch angle, degrees (×0.0174533 at 0x8040a0dc; 0x803ed950 builds (aim.x·cosθ, sinθ, aim.z·cosθ)) |
| 0x14 | 0.65  | 0.70  | 0.5  | 0.5  | 0.5   | 0.5  | 0     | 0     | lift coefficient: ball+0x98 = P14·q (Magnus-like lift in Calc) |
| 0x18 | 0.5   | 0.5   | 0.6  | 0.6  | 0.6   | 0.6  | 0.6   | 0     | side-spin factor: ball+0x9c = swingCurve·P18 (slot 4, 0x80409e30) |
| 0x1c | 0     | 0     | 0.25 | 0.5  | 0.7   | 0.9  | 1     | 0     | backspin factor, normal lies: ball+0xa0 = swingBackspin·P1c (slot 5, 0x80409dfc) |
| 0x20 | 0     | 0     | 0.2  | 0.35 | 0.5   | 0.6  | 0.7   | 0     | backspin factor when the player's lie attr is 3 (bunker) |
| 0x24 | 0.2   | 0.2   | 0.2  | 0.2  | 0.2   | 0.2  | 0.2   | 0     | slot 6 (0x80409d78) lerp low end; consumer not decoded |
| 0x28 | 1     | 1     | 1    | 1    | 1     | 1    | 1     | 0     | slot 6 lerp high end |
| 0x2c | 9.1   | 9.1   | 8.7  | 8.7  | 8.7   | 8.7  | 8.3   | 5.5   | slot 13 getter; read at 0x803fe02c / 0x803fe3ec (UI or camera); not decoded |
| 0x30 | 2     | 2     | 3    | 3    | 3     | 3    | 6     | 0     | slot 14 getter; read at 0x803fe044; not decoded (looks like an id) |
| 0x34 | 0.6   | 0.6   | 0.55 | 0.55 | 0.55  | 0.55 | 0.45  | 0.5   | swing-power curve: value at the middle of the range (slot 7) |
| 0x38 | 0.71  | 0.708 | 0.67 | 0.66 | 0.665 | 0.66 | 0.64  | 0.63  | launch curve: q at power 0.5 (q = power^log2(1/P38)) |
| 0x3c | 0.1   | 0.1   | 0.1  | 0.1  | 0.1   | 0.1  | 0.1   | 0.05  | swing-power curve floor (slot 7) |
| 0x40 | 1.1   | 1.1   | 1.1  | 1.1  | 1.1   | 1.1  | 1.1   | 1     | over-swing start when lie cap = 1 (slot 7) |
| 0x44 | 1.3   | 1.3   | 1.3  | 1.3  | 1.3   | 1.3  | 1.3   | 1.25  | over-swing end (slot 7) |
| 0x48 | 0.75  | 0.75  | 0.75 | 0.75 | 0.75  | 0.75 | 0.75  | 1     | **lie cap, rough** (slot 16, 0x80409cb0, lie attr 2) |
| 0x4c | 1     | 1     | 1    | 1    | 1     | 1    | 1     | 1     | lie factor, rough (slot 17, 0x80409c70) |
| 0x50 | 0.25  | 0.25  | 0.5  | 0.5  | 0.5   | 0.5  | 0.75  | 1     | **lie cap, bunker** (slot 16, lie attr 3) |
| 0x54 | 0.5   | 0.5   | 0.75 | 0.75 | 0.75  | 0.75 | 1     | 1     | lie factor, bunker (slot 17) |
| 0x58 | 1     | 1     | 1    | 1    | 1     | 1    | 1     | 2.5   | lie factor, any other lie (slot 17) |
| 0x5c | 0.037 | 0.037 | 0.041| 0.041| 0.041 | 0.041| 0.045 | 0.15  | slot 15 getter; read in a 12-iteration loop at 0x80416008 (UI); not decoded |
| 0x60 | 1.6   | 1.6   | 2.3  | 2.3  | 2.3   | 2.3  | 2.5   | 2     | slot 9 = curve(power)·P60; called 0x80408eec, 0x804174bc per frame; not decoded (swing animation speed?) |
| 0x64 | 1.3   | 1.3   | 1.8  | 1.8  | 1.8   | 1.8  | 1.5   | 1.5   | slot 10 = curve(power)·P64; not decoded |
| 0x68 | 10    | 10    | 10   | 10   | 10    | 10   | 10    | 5     | no decoded reader |
| 0x6c | 0.5   | 0.5   | 0.5  | 0.5  | 0.5   | 0.5  | 0.5   | 0.1   | no decoded reader |
| 0x70 | 1.5   | 1.5   | 1.5  | 1.5  | 1.5   | 1.5  | 1.5   | 2.7   | no decoded reader |
| 0x74 | 0     | 0     | 0.3  | 0.3  | 0.3   | 0.3  | 1     | 0     | no decoded reader |
| 0x78 | 180   | 180   | 180  | 180  | 180   | 180  | 180   | 20    | no decoded reader |
| 0x7c | 1     | 1     | 1    | 1    | 1     | 1    | 1     | 0     | no decoded reader |
| 0x80 | 0.5   | 0.5   | 0.5  | 0.5  | 0.5   | 0.5  | 0.5   | 0     | no decoded reader |
| 0x84 | 0     | 0     | 0    | 0    | 0     | 0    | 0.5   | 0     | no decoded reader |
| 0x88–0x8c | 0 | 0   | 0    | 0    | 0     | 0    | 0     | 0     | |
| 0x90–0x94 | 1 | 1   | 1    | 1    | 1     | 1    | 1     | 0     | no decoded reader |
| 0x98–0x9c | 0.5 | 0.5 | 0.5 | 0.5 | 0.5   | 0.5  | 0.5   | 0     | no decoded reader |

Club object: +0 vtable (woods `0x806d5040`, irons `0x806d5440`, SW `0x806d5088`, PT
`0x806d50d0`), +4 type (0 WD, 1 IR, 2 SW, 3 PT), +8 club index 0..7, +0xc sub-index, +0x10/+0x14
two 0x50-byte helper objects (per handedness, `0x8040a0a8` picks by player+0x6c), +0x18 block
pointer. Model names at `0x8067baa8`: `WS2_glf_club_WD1/WD3/IR3/IR5/IR7/IR9/SW/PT` (+`_L`/`_R`).
`0x80409c34` would overwrite P00 of the 3i/7i/9i from a table at `0x8067be18` (×0.02) but has no
caller in the text section.

Lie attribute numbers are `RPGlfCollisionModel::ECollision` (Caddie header): 0 none, 1 fairway,
2 rough, 3 bunker, 4 OB, 5 OB2, 6 green, 7 water, 8 wood, 9 green edge, 10 side of cup, 11 cup,
12 rock wall, 13 valley, 14 glass, 15 tee, 16 sand OB. The lie used by the club code is the
current player's `mPrevGndAttr` (player+0xb0).

## 4. Formulas as decoded

### 4.1 Launch (slot 3 = `0x80409e44` → `0x8040a0d4`; callers: real shot `0x8041210c`, sim `0x8041490c`)

```
q      = 0x803ef330(P38, power) = |power| ^ (log2(1/P38))        (sign of power restored; 0 if |power| < 0.001)
speed  = P00 + q * (P04 - P00)                                   units/tick
dir    = (aim.x * cos th, sin th, aim.z * cos th),  th = P10 deg (aim = unit horizontal vector from the avatar angle, 0x803ed8d8)
vel0   = speed * dir
lift0  = P14 * q                                                  -> ball+0x98
```
`0x803ef330` uses fast ln/exp (`0x8013b9b0` = ln with table at `0x806b1b70` and ln2 = 0.693147;
`0x8013b910` = exp) and log2(e) = 1.442695 at r2−0xa54; the curve passes through (0.5, P38).
Because q ≈ power^0.49 and range ∝ speed², carry is linear in power (section 5).

Ball start (`0x80414ebc`): lifetime 0, velocity (0x88) and launch-velocity copy (0x7c), start
position copy (0x64), 0x98 = lift, 0x9c = side-spin, 0xa0 = backspin (both 0 at launch).
`0x80414854` later writes the spin from the finished swing: 0x9c = `0x8041e594(swing)`·P18
(slot 4), 0xa0 = swing+0x7c·P1c (or P20 in a bunker) (slot 5), and 0x58 = the tick at which spin
was applied (spin terms in Calc start after that tick).

### 4.2 Swing power pipeline (function `0x80420d84`, lines `0x80421308`–`0x80421364`)

```
raw   = 0x80422308(swing)                          Wii-Remote derived, not transferable
p1    = curve(raw)  via 0x80407fb4 -> slot 7 (0x80409f60), clamped >= 0:
          raw < 1 : u = (raw - P3c)/(1 - P3c);  p1 = max(P3c, P3c + (1-P3c) * u^(log2(1/P34)))
          raw >= 1: c = (cap >= 1 ? P40 : 1.0);  p1 = max(1, 1 + 0.25 * (raw - c)/(P44 - c))   (max 1.25 at raw 1.3)
cap   = slot 16: 1.0; rough P48 = 0.75; bunker P50 = 0.25 / 0.25 / 0.5 / 0.5 / 0.5 / 0.5 / 0.75 / 1
p2    = 0x8041e794: p1 <= 1 (or putter mode) ? p1 * cap : cap + min(p1 - 1, 0.25)
p3    = 0x8041e664: = p2, except an assist branch (swing+0xe4 flag, GlfConfig+0x28 not 4) that blends toward 0x80407d08(p2) by backspin; it cannot touch a launched shot (swing+0xe4 is set only after launch, wsr-ground-phase.md section 6), so p3 = p2 for every human swing. Shot Assist is a Switch addition with no WSR counterpart.
power = min(p3, slot 17 lie factor): rough P4c = 1.0; bunker P54 = 0.5 woods / 0.75 irons / 1.0 SW,PT; else P58 = 1.0 (putter 2.5)
```
Consequences (WSR): on fairway/tee the launch power never exceeds 1.0, so over-swinging adds no
carry (it only enters the red zone used for curve/wobble elsewhere). From rough a full swing
gives 0.75 and an over-swing can add up to +0.25 (back to 1.0). From sand: woods 0.25 (+ up to
0.25, limited to 0.5), irons 0.5 (limited to 0.75), wedge 0.75 (limited to 1.0). Below the line
the cap is a **multiplier** on the gauge value, not a clamp: a half swing from rough gives
0.375. The gauge draws the capped power on a fixed 16-segments-per-1.0 scale (decoded since, in
wsr-swing-redzone-spin.md section 3), so a bar is worth the same distance on every lie and the
Switch note "distance per bar unchanged below the cap" holds in WSR too; the multiplier only
changes how hard the swing must be to fill a bar. That document also covers the red zone (power
from capped lies, the random-sign curve) and the backspin input.

### 4.3 Ball flight, per tick (`RPGlfBall::Calc` 0x80413b68; 4 ticks per 60 Hz frame: loop at `0x804175b4`, lifetime>>2 at `0x80413bac`)

```
1. lift:      v += Lhat * (|v|_prev * 0.0012 * s98);   s98 *= 0.9985
              Lhat = normalize(-vx*vy, vx^2+vz^2, -vy*vz)   (perpendicular to v, in the vertical plane, upward; 0x803edd4c)
2. side-spin: if lifetime > spinStart: v += Shat * (|v|_prev * 0.001 * s9c);  s9c *= 0.999;  Shat = normalize(vz, 0, -vx)
3. on ground & lifetime > spinStart: backspin pull-back / roll steering (wsr-ground-phase.md section 5)
4. in air (0x804121c4 == 1):  wind, see 4.4
5. gravity:   v += 0.002 * -normalize(0.5*n + 0.5*yhat)     (n = ball+0x70, the normalised sum of the last four ticks' contact normals, yhat when none -> in the air v.y -= 0.002; wsr-ground-phase.md section 4)
6. pos += v;  v *= 0.999
|v|_prev is ball+0x94, set at the end of the previous tick by 0x804144b8.
```
Constants: r2−0x34 = 0.0012, r2−0x30 = 0.9985, r2−0x50 = 0.001, r2−0x2c = 0.999, r2−0x8 = −0.002,
r2−0xc4 = 0.5. Units: 1 unit = 0.1 m (9.144 units/yd); a tick is 1/240 s, so the driver's
3.39 units/tick = 81.4 m/s (182 mph) and g = 0.002 units/tick² = 11.5 m/s².
The ball stops when, on the ground, its displacement over the tick (contact push-out included)
is < 0.0015 u (r2+0) for more than 20 consecutive ticks on a restable surface
(mask 0x1ce5e at r2−0x76c = fairway, rough, bunker, OB, green, green edge, side of cup, cup,
glass, tee, sand OB) or after 0x1c20 = 7200 ticks (30 s); `0x80413b04` zeroes the velocity
(wsr-ground-phase.md section 3.3 has the rule in full).

### 4.4 Wind

- Storage: `Sp2::StaticMem` var 7+hole, packed `(speedIdx << 3) | dir` (Caddie `PackWind`;
  unpack `0x804061a8`: dir = low 3 bits, speed = bits 3..6). `0x803f8dec` passes them to
  `RPGlfFieldManager::SetWind` `0x80401a10` → wind object (field manager +0x78, 0xc0 bytes, ctor
  `0x803ed6bc`) `0x803ed620`: angle = dir × 2π × 0.125 (45° steps) at +4/+8, speed index at +0x10.
- Direction vector (`0x803eda04`): (x, z) = (sin angle, cos angle). dir 0 → +z (minimap south,
  since −z is north), 2 → +x (east): matches Caddie's enum order S, SE, E, NE, N, NW, W, SW.
  Whether the label names where the wind blows from or toward is a display convention not
  checked here; the physics uses the vector as the direction the air moves.
- Magnitude (`0x803ecf10` → `0x803ecdb4`, constants r2−0xb0c..−0xafc):
  `|W| = 15 * (idx/15)^(log2(1/0.6) = 0.737) * clamp(0.1 + 0.9 * dh/300, 0.1, 1.0)` with
  dh = ball height − player ground height (player+0x9c) in units (300 units = 30 m). W = 0 when
  the player stands on green/side-of-cup/cup (attr 6, 10, 11) or player flag +0x8a8 is set.
- Coupling (Calc, `0x80414098`–`0x80414138`): with h = unit horizontal velocity,
  `W_par = h * (W·h)`, `W_perp = W − W_par`: `v.xz += 8e-5 * (0.6 * W_par + W_perp)` per tick.
  Crosswind acts at full weight, head/tail wind at 0.6.
- Speed index → mph: the index runs 0..15 (Caddie `WIND_MAX = 15`); with the even-only 0–30 mph
  display noted in CLAUDE.md that is 2 mph per index. The display conversion was not located in
  the binary.

### 4.5 Landing and bounce (`0x8041228c`, called every tick after Calc) — superseded

> **Superseded by `wsr-ground-phase.md` sections 3–4 (2026-10-19).** What changed: A is a Coulomb
> friction coefficient and the tangential term is an **impulse**, `min(|t|, A·vn)` taken off the
> tangential velocity per contact — not a cap on it (the "scaled down to vn·A" below is a local
> copy that is then subtracted); B is the restitution. Because the routine runs every tick, a roll
> is a stream of micro-bounces whose friction impulse `A·vn*` is the whole rolling resistance, and
> the port reproduces P08 for all seven clubs to 0.4 yd. The tables below are correct as read.

Two 17-entry tables in BSS, filled by `0x80415da4`, indexed by the collision attribute:
```
A (0x807d2b50) = [0.3, 0.4, 0.5, 1.0, 0.7, 1.0, 0.15, 1.0, 1.0, 0.3, 0.001, 0.3, 0.3, 1.0, 0.1, 0.4, 1.0]
B (0x807d2b94) = [0.5, 0.5, 0.4, 0.001, 0.3, 0.001, 0.5, 0.001, 0.001, 0.5, 0.13, 0.5, 0.5, 0.001, 0.5, 0.5, 0.001]
   index: 0 none, 1 fairway, 2 rough, 3 bunker, 4 OB, 5 OB2, 6 green, 7 water, 8 wood, 9 green edge, 10 side of cup, 11 cup, 12 rock wall, 13 valley, 14 glass, 15 tee, 16 sand OB
```
On contact with unit normal n, with vn = −(v·n) the normal impact speed and t the tangential
velocity: t is scaled down to length vn·A[attr] if longer (`0x804127b0`–`0x804127dc`); the
rebound along n is vn·B[attr]·f where `f = 1 − 0.6·clamp(backspin, 0, 1)^0.737`
(`0x804127f0`–`0x8041286c`), and backspin itself is multiplied by f. If the active club is an
iron and the surface is green or green edge, A is replaced by 0.48 and B by 0.5
(`0x80412774`–`0x804127ac`). Water (7) and valley (13) raise the penalty event (`0x80411b6c`).
The "t is scaled down" reading above was from one pass over the routine (832 instructions, not
520): see the note at the top of this section and wsr-ground-phase.md section 3.2 for the
block-by-block listing.

### 4.6 Roll and backspin pull-back (Calc `0x80413cd0`–`0x80414084`) — superseded

> **Superseded by `wsr-ground-phase.md` section 5 (2026-10-19).** What changed: the weight is a
> per-tick **decay** `w = 0.7 + 0.19·(1 − clamp(A, 0.15, 1))/0.85` (fairway 0.834, green 0.89),
> not an interpolation "between 0.19 and 0.7"; the pull-back is rotated into the ground plane at
> constant length, decayed by w and applied as `v += h·P`; and the "8e-5 ground-normal term in the
> air" was the wind coupling of section 4.4 — there is no ground term in the air. The putter's roll
> is section 6 there.

Thirty frames after the spin was applied, while on the ground, the ball gets a steering vector
= −0.06 · min(backspin, 0.9)^0.61 along the original shot direction (rotated by `0x80412ff0`),
projected onto the ground plane. Its weight is interpolated from the lie's A entry between 0.19
and 0.7 (r2−0x20, r2−0x40), then multiplied by a pin-homing factor: 1.3 when the roll heads
within 5° of the pin, falling to 1.0 at 30° (bunker: 1.0). The ball's velocity is then nudged by
that vector. Slope: in the air a ground-normal term of 8e-5 per tick is added (same block as
the wind). The putter's green roll was not decoded.

### 4.7 Club recommender (`0x804090ac`, `0x80408120`)

Putter on green/cup; driver on the tee when `0x804066c0()` ≥ 4 (par); otherwise the club whose
P08 × 9.144 best covers the distance to the pin, skipping woods from a bunker. The distance is
multiplied by 1.1 in rough and 1.3 in a bunker (r2−0x4d8, −0x4d4) before the choice: the game's
own rule of thumb for lie loss.

## 5. Simulation (`$S/research/flightsim.py`, Calc port, flat ground, no wind, no side/backspin)

| club | q(1.0) | speed u/tick | carry yd | apex yd | ticks | s     | P0c | P08 |
|------|--------|--------------|----------|---------|-------|-------|-----|-----|
| DR   | 1.000  | 3.390        | 240.2    | 22.7    | 1133  | 4.72  | 240 | 279 |
| SP   | 1.000  | 3.130        | 219.8    | 22.8    | 1132  | 4.72  | 220 | 253 |
| 3I   | 1.000  | 2.790        | 189.8    | 28.2    | 1150  | 4.79  | 190 | 212 |
| 5I   | 1.000  | 2.450        | 159.9    | 28.4    | 1134  | 4.73  | 160 | 176 |
| 7I   | 1.000  | 2.130        | 130.1    | 22.9    | 1015  | 4.23  | 130 | 146 |
| 9I   | 1.000  | 1.780        |  99.8    | 22.1    |  977  | 4.07  | 100 | 110 |
| SW   | 1.000  | 1.280        |  55.2    | 16.2    |  774  | 3.23  |  55 |  60 |

Carry vs power (driver): 0.25 → 57.4, 0.5 → 120.6, 0.75 → 183.2, 1.0 → 240.2, 1.1 → 261.2,
1.2 → 281.0, 1.3 → 299.7 yd (the last three are unreachable in play, section 4.2). Every club
is within ±2 % of `carry = P0c × power` over 0.25–1.0. Apex at full power is 23 yd (woods),
28 yd (3i/5i), 22–23 yd (7i/9i), 16 yd (wedge): the irons fly highest because their lift (0.5)
survives on a steeper launch; the wedge has no lift and a 43° launch.

Wind, full driver (`sim(..., windspd_idx, dir)`): idx 15 (30 mph): cross drift 30.6 yd,
tail carry 262.1, head 220.2; idx 10 (20 mph): 22.8 / 256.3 / 225.2; idx 5 (10 mph):
13.7 / 249.7 / 231.2; idx 2 (4 mph): 7.0 / 245.0 / 235.6.

## 6. The three questions

1. **Power → distance per club.** Yes: launch speed = P00 + power^log2(1/P38)·(P04 − P00) with
   the P04/P38 columns above; the flight model turns that into a carry that is linear in power,
   carry ≈ P0c·power yd (240/220/190/160/130/100/55 at full power). The swing gauge value first
   goes through the slot-7 curve (through (0.5, P34)), so if the on-screen bar shows the raw
   value, half a bar is 60 % (woods) / 55 % (irons) / 45 % (wedge) of max carry; if it shows the
   curved value it is 50 %. P08 (279/253/212/176/146/110/60) is the full-power stop distance
   (carry + roll) on flat fairway, reproduced by `wsr-groundsim.py` (wsr-ground-phase.md); the
   recommender uses it as its reach.
2. **Elevation per club.** Launch angle P10 = 10°, 11°, 19°, 23°, 24°, 30°, 43° (driver, spoon,
   3i, 5i, 7i, 9i, wedge); putter 0°. Lift P14 = 0.65, 0.70, 0.5, 0.5, 0.5, 0.5, 0. Simulated
   apex 22.7, 22.8, 28.2, 28.4, 22.9, 22.1, 16.2 yd and hang time 4.7, 4.7, 4.8, 4.7, 4.2, 4.1,
   3.2 s at full power.
3. **Rough and bunker.** Only the power changes: rough ×0.75 all clubs; bunker ×0.25 driver and
   spoon, ×0.5 irons, ×0.75 wedge, ×1 putter (P48/P50), with over-swing bounded by P4c/P54/P58.
   Launch angle, speed curve and lift are the same from every lie. Backspin from a bunker uses
   the smaller P20 column (0.2/0.35/0.5/0.6/0.7 instead of 0.25/0.5/0.7/0.9/1.0). On landing,
   rough keeps more tangential speed than fairway (A = 0.5 vs 0.4) but bounces less (B = 0.4 vs
   0.5); a bunker does not bounce at all (B = 0.001).

Also on the way: woods have P1c = P20 = 0, so they cannot backspin (matches the Switch); the
side-curve factor is 0.5 for woods and 0.6 for irons and wedge; wind drift is sub-linear in
wind speed and crosswind weighs 1.67× head/tail wind; the ball runs at 240 physics ticks per
second.

## 7. Not found, not decoded

- No club/ball tuning file on the disc (all archives listed; `sports2.bmg` not text-searched).
- The displayed-yardage strings and the gauge's visual mapping (which of raw/curved/capped power
  the bar shows) were not traced.
- The raw swing power (`0x80422308`, from Wii Remote motion) and the swing-side backspin/curve
  inputs (`swing+0x7c`, `0x8041e594`, writer `0x80420570`): Wii-specific, not decoded.
- Fields 0x24–0x30, 0x5c–0x9c of the club block: readers found for some (slots 6, 9, 10, 13, 14,
  15) but their consumers were not decoded; the rest have no decoded reader.
- `0x8041e664` assist branch and `0x80407d08` (target-derived power).
- Putter/green roll physics and the roll/steering block: decoded since, see
  `wsr-ground-phase.md` (sections 5 and 6; also the cup, the flagstick and the look-ahead).
- The mph-per-index display conversion for wind.

## 8. Confidence

- Block location, layout, club objects, accessor slots: **high** (constructors + vtables read).
- Launch formula, P00/P04/P10/P14/P38 meanings, flight constants, 4 ticks/frame: **high**; the
  simulation reproduces P0c for all seven clubs to < 0.3 yd, which fixes the whole chain.
- Lie caps P48/P50 and factors P4c/P54/P58, the multiply/limit semantics of `0x8041e794` and the
  final `min` at `0x8042134c`: **high**; the `0x8041e664` assist branch: medium.
- Spin factors P18/P1c/P20 and how they reach the ball: **high**; their swing-side magnitudes:
  not known.
- Wind storage, 45° steps, direction vector, altitude ramp, Calc coupling: **high**; mph per
  index: medium (external sources only).
- Landing tables and their reading, roll/pull-back block: superseded by `wsr-ground-phase.md`,
  where both are **high** (independently re-derived 2026-10-19).
- All of it is WSR (Wii). Switch Sports may change any number; the published Switch maxes
  (250/200/175/155/135/100/80) already differ from WSR's 240/220/190/160/130/100/55.

## 9. Files

- `$S/research/club-physics.md` (this report)
- `$S/research/flightsim.py` (Calc port; `python -I flightsim.py 0.5 1.0`)
- `$S/research/ballcalc.txt` (Calc), `ground.txt` (0x8041228c), `clubvt.txt` (club accessors),
  `simmgr.txt` (sim manager), `lietables.txt` (0x80415da4)
- helpers: `disfn.py`, `dumpblocks.py`, `sdaref.py`, `vcalls.py`, `vslots.py`, `callctx.py`,
  `r2vals.py`, `storescan.py`, `findval.py`, `scanfloats.py`, `scanstride.py`, `list-carc.mjs`
- extracted archives: `$S/research/carc/`
