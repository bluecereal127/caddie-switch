# WSR ground phase: bounce, roll-out, putting and the cup (group T, 2026-10-18; verified 2026-10-19)

What this is: the decode of Wii Sports Resort golf's **ground phase** — the ball from its first
contact to rest: the per-tick contact impulse, bounce and roll-out, the backspin pull-back, the
putter, the cup, the flagstick, and the game's own look-ahead and aim lines. Everything below is
from `C:/Users/Stephen/Downloads/WSR_Extract/DATA/sys/main.dol` (Wii Sports Resort, NTSC-U rev 1),
read with `$S/research/ground/gdis.py`; the listings are in `$S/research/ground/*.txt`. It
extends `tools/research/wsr-club-physics.md` (the air phase, whose addresses, club blocks and
constants are assumed here; its sections 4.5 and 4.6 are superseded by sections 3–5 below) and
`tools/research/wsr-tree-collision.md` (the step wrapper and the shared object response). The
tick-exact port is `tools/research/wsr-groundsim.py`.

On 2026-10-19 the report's eight key claims (the contact impulse, inAir, the spin steering, the
cup, the putter, the simulator, the aim guide, gravity/drag/stop) were independently re-derived
from the binary (listings in `$S/research/ground/verify/`): six confirmed with precision notes,
two corrected — the steering vector is **rotated** into the ground plane at constant length, not
shortened (section 5), and `0x803fb370` is the **putting line**, not a per-club aim guide
(section 7). Both corrections and every precision note are applied below; the simulator was
corrected and rerun (no table moved, section 8).

It describes the **Wii** game; Switch Sports keeps the structure at best. Units: 1 unit = 0.1 m,
9.144 u/yd; one tick = 1/240 s, so 1 u/tick = 24 m/s = 26.2 yd/s and 1 u/tick² = 5760 m/s².
`$S` = `C:/Users/Stephen/AppData/Local/Temp/claude/c--Users-Stephen-Desktop-caddie-switch-web-caddie-web/c4363058-c34c-4a67-9f33-dfc0e5ebac83/scratchpad`.

## 1. Summary

- The contact routine `0x8041228c` (832 instructions) runs on **every tick** (the only call is
  the step wrapper `0x80414734` at `0x80414830`, after Calc and the tree check). It does a KCL
  sphere query of radius 0.5 u around the ball and, for each touching triangle whose attribute
  is in the mask 0x1de5e, applies an **impulse**, not a cap: with `vn = −(v·n)` the approach
  speed and `t` the tangential velocity, `v += −(1+B)·v_n − min(|t|, A·vn)·t̂` and
  `pos += n·depth`. A is a **Coulomb friction coefficient** (tangential speed lost per unit of
  normal approach speed), B the restitution. The earlier reading "t is capped at vn·A"
  described the local copy that is then subtracted (`0x804128b0`), which is what made rolling
  look impossible.
- A rolling ball is a stream of micro-bounces: gravity gives it `vn* = 0.002·0.999/(1+0.999·B)`
  ≈ 0.00133 u/tick per tick on B = 0.5 surfaces, the rebound `B·vn*` dies within the same tick,
  and the friction impulse `A·vn*` is a constant deceleration: fairway 0.000533 u/tick² (3.07
  m/s², 3.4 yd/s²), rough 0.000714 (4.1 m/s²), green 0.000200 (1.15 m/s², 1.26 yd/s²), fringe
  0.000400, bunker 0.0020 (11.5 m/s²); plus the linear drag `v *= 0.999` (0.24/s) that also acts
  in the air. There is no separate rolling-resistance code.
- Slope enters only through gravity's direction `−normalize(0.5·n + 0.5·ŷ)` (n = the smoothed
  contact normal): on a slope of θ the downhill pull is `0.002·sin(θ/2)`, about 59 % of a real
  `g·sinθ` (0.10 m/s² per degree) and the normal load `0.002·cos(θ/2)`. A resting ball starts to
  roll only above ~12° on a green, ~30° on fairway (simulated 15° / 33°).
- Backspin: at a bounce from the air the restitution is multiplied by `f = 1 − 0.6·bs^0.737`
  and `bs *= f` afterwards; from the first ground tick after frame 30 the ball is pushed by a
  pull-back vector `P = −0.06·min(bs, 0.9)^0.61 · ĥ` (ĥ = the horizontal direction of the last
  contact's incoming velocity) every ground tick. Each tick P is first turned into the ground
  plane **at its full length** (the projection is rescaled, not shortened), then decays by
  `w = 0.7 + 0.19·(1 − A)/0.85` (fairway 0.834, green 0.89, rough 0.81, bunker 0.70) and is
  applied scaled by a pin-homing factor 1.3 → 1.0 as the pull-back's direction is 5° → 30° off
  the pin. Total impulse `h·|P|·w/(1−w)`: up to 0.28 u/tick (6.7 m/s) backwards on fairway at
  bs = 0.9.
- **Validation**: the tick-exact port (`wsr-groundsim.py`, section 8) launched at full power on
  a flat fairway stops at **278.8 / 252.6 / 211.7 / 175.6 / 145.8 / 109.5 / 60.0 yd** against
  the club blocks' P08 column **279 / 253 / 212 / 176 / 146 / 110 / 60** (max error 0.4 yd),
  and a power-1.0 putt rolls 20.5 yd against the putter's P0c = P08 = 20. P08 is therefore
  WSR's own full-power stop distance on flat fairway, and the whole ground model is pinned the
  same way P0c pinned the air phase.
- The cup is not in the course KCL: at round start `0x8040562c` attaches an analytic cup
  (radius **1.5 u**, depth **3.0 u**) to the green triangle under the pin; the sphere query
  resolves rim, wall, floor and a lip "funnel" against it (`0x803f07a4`). A ball is holed when
  it rests on attr 10/11 with its centre below the pin object's y (`0x80411aec`). Simulated: a
  putt that would run ≤ ~4.4 yd past the hole drops, ≥ ~6 yd past lips out (centre-line entry
  speed ≤ 0.17–0.20 u/tick = 4.0–4.8 m/s); the capture half-width at low speed is 1.25–1.5 u
  (0.14–0.16 yd). With the flagstick in (player not on the green) a 2.8 u box around the pin
  kills 90 % of tangential speed and drags the ball onto the stick.
- The look-ahead at `0x80414a94` is a full copy of the shot (same Calc, contact, trees, wind,
  mesh, spin once applied) run ahead of the real ball for the camera, the crowd and player
  reactions, a player flag and the hole-out sound cue; it draws nothing. WSR draws two aim
  lines: on the green the **putting line** (`0x803fb370`): 33 points from the player along the
  aim, always 20 yd long (the putter's P0c; 0.625 yd steps), draped on the terrain by a raycast
  and drawn as a line strip, built only when the lie is green / side of cup / cup, where the club
  is forced to the putter; on every other lie the aim line is a **model** (`0x80402fcc`)
  stretched along the aim to P0c × 9.144 u of the selected club — the nominal full-power
  **carry**, flat, with no wind, lie cap, elevation, power or roll in it: that is the
  "flat-terrain carry" line.

## 2. Sources and method

- `0x8041228c` (contact routine, 832 instructions to the `blr` at `0x80412f88`,
  `landing-full.txt`); `0x80413b68` (`RPGlfBall::Calc`, `calc-full.txt`); the wrapper
  `0x80414734`, in-air test `0x804121c4`, stop `0x80413b04`, post-tick `0x804144b8`, event
  `0x80411b6c`, sounds `0x804118b0`, attribute remap `0x80400a88` (`helpers1.txt`,
  `helpers3.txt`); the KCL sphere query `0x803f0738` / `0x803f0644` / `0x803f0c18`
  (`kclquery.txt`, `kclquery-tail.txt`) and the cup override `0x803f07a4` (`cupquery.txt`);
  cup placement `0x8040562c` → `0x803f0bdc`; flagstick `0x80413020` / `0x80413350` →
  `0x803ff8ec` / `0x803ffe30`; the look-ahead `0x80414a94` and its callers `0x8041490c`,
  `0x80414a08`, `0x80414a44`, the per-frame driver `0x80410b78` and the frame update
  `0x80417364` / `0x804175b4`; the putting line `0x803fb370`, its gate `0x803fa918` and its
  renderer `0x803fab24`; the aim model `0x80402fcc` / `0x804031b4`; the vector helpers
  `0x803edd94` (SetLength: `dst = src·f1/|src|`, or dst untouched and 0 returned when |src| <
  FLT_MIN at r2−0xab0) and `0x803ede10` (normalise); consumers of the look-ahead (`0x803f5b30`,
  `0x803f6020`, `0x8040b400`, `0x8040c9a4`, `0x80414410`, the camera functions in section 7).
- Helpers: `gdis.py` (annotated disassembly, decodes `fcmpo`), `findstore.py` (lis/addi
  references to BSS), `scanoff.py` (readers of a struct field). SDA constants were read with
  their values; `0x807d2680` is the static (0, 1, 0) and `0x807d2650` (0, 0, 0)
  (`0x803ede7c` initialiser).
- Simulation: `tools/research/wsr-groundsim.py` (the scratch original
  `$S/research/ground/groundsim.py`, tables in `tables.txt`), `checks.py` (`checks.txt`).
- Verification (2026-10-19): eight claims re-derived by independent readers from the same
  binary with their own tooling (doldis/capstone), listings under `$S/research/ground/verify/`
  (`impulse/`, `inair/`, `cup/`, `gravity/`, `aimguide/`, `sim/`). The two corrections are in
  sections 5 and 7; the precision notes are folded into sections 3, 4, 6 and 8.
- The course KCL rips (`captures/meshes/wsr-kcl-obj/*.obj`) have groups for attrs 1–7, 9, 12,
  13, 14, 16 only: no 8, 10, 11, 15 — consistent with the runtime cup.

## 3. Item 1: when the contact routine applies, and what vn is

### 3.1 Call graph and arguments

`0x80414734(ball, flag, outPtr)` = `Calc(ball, flag)` → tree check `0x804138a0` → (unless the
mode at `0x803fa8d4()+4` is 5 or 8, or the current player's lie `player+0xb0` is green / side of
cup / cup) the two flagstick tests `0x80413020` and `0x80413350` → `ball+0x64 = pos`
(`0x80414804`–`0x8041482c`) → `0x8041228c(ball, 0, flag, outPtr)` → `0x804144b8(ball)`.
The real ball's tick loop `0x80410cbc` (four calls per 60 Hz frame from `0x804175b4`) passes
flag = 0, outPtr = 0; the look-ahead passes flag = "last requested frame" and a byte for
"hit a rock wall"; the club recommender (`0x8040816c`) steps its trial balls through the same
wrapper. Inside `0x8041228c`, `r16` (flag) only gates sounds, particles and the penalty event
for sim balls (`ball+0x50 != 0`); `r17` (outPtr) only receives the wall-hit bit. Nothing about
the physics depends on them.

### 3.2 The routine (`0x8041228c`), block by block

```
8041231c–80412398  six vec3 accumulators on the stack zeroed: 0xf0/0xfc (min/max normal),
                   0xd8/0xe4 (min/max push-out n·depth), 0xc0/0xcc (min/max Δv); 0x38/0x3c = 0
804123ac–804123b0  KCL sphere begin: 0x803f0738(kcl = r13-0x2ca8, &pos (+0x4c), f1 = 0.5)   r2-0xc4
804123d0           r21 = contact mask r2-0x764 = 0x1de5e: attrs 1 2 3 4 6 9 10 11 12 14 15 16
804123dc–80412404  f22 = 1.0, f23 = -0.6, f24 = 0.1, f31 = 0.25, f29 = -1 (r2-0xe0, -0x98, -0xd0, -0xb0, -0xa8)
80412418–80412434  loop: 0x803f0644(kcl, &depth, &normal, &attr, 1) → next overlapping prism
                   (depth = radius − plane distance, rejected when ≤ 0, so n·depth is the outward push-out)
80412438–80412460  attr 0: skip. attr not in mask: 7 water → event 7 (+0xbc = 1, splash);
                   13 valley → event 13 (+0xbc = 3); 5 OB2, 8 wood: fall through (no contact)
804124e8–80412504  contact count r19++; if v.y < 0.25: r18 = max(r18, attr)   (the tick's attribute)
80412508–8041254c  rock walls (12) on one named course: if n.y < sin(63°) → n.y *= 0.25, renormalise
80412550–80412624  rock wall + outPtr: wall-hit bit when the velocity along the normal is large
80412628–80412644  0xfc = max(0xfc, n), 0xf0 = min(0xf0, n)         (component-wise, 0x8013c050/090)
80412648–80412680  0xe4 = max(0xe4, n·depth), 0xd8 = min(0xd8, n·depth)   push-out accumulators
                   (before the vn test below: receding contacts are pushed out too)
80412684–804126d8  dot = v·n; 0xa4 = n·dot (v_n); 0x98 = v − v_n (t); f26 = vn = −dot
804126dc           if vn < 0 (moving away): next prism — no impulse, but the push-out stays
804126e0–80412700  0x38 = max(0x38, vn)                     (impact speed for sounds/effects)
80412704–80412754  0x80 += (n × t)·vn ; f28 += vn ; f27 = max vn     (spin-axis visual only)
80412758–8041276c  A = A[attr] (0x807d2b50), B = B[attr] (0x807d2b94)
80412774–804127ac  if ball+0x17f == 0 (no contact yet this shot) and the club type is 1 (iron:
                   3i–9i; the wedge is type 2) and attr is 6 or 9: A = 0.48 (r2-0xa0), B = 0.5
                   (the B write is a no-op: B[6] = B[9] = 0.5 already)
804127b0–804127dc  cap = vn·A; if |t| > cap: t_c = t·cap/|t| else t_c = t     (local copy 0x98;
                   the ball's own tangential velocity is never capped)
804127e0–8041286c  if inAir(ball) and bs = ball+0xa0 > 0: f = 1 + (-0.6)·clamp(bs,0,1)^(log2(1/0.6) = 0.737)
                   B *= f; if ball+0xa4 (steering started): bs *= f
                   (inside the per-prism loop: with several contacting prisms bs decays once per prism)
80412870–80412894  0xb0 = v_n · (−(1 + B))
80412898–804128ac  attr 10 (side of cup): 0xb0.y = min(0xb0.y, 0.1)
804128b0–804128d8  0xb0 −= t_c                               ← the friction impulse
804128dc–804128ec  0xcc = max(0xcc, 0xb0), 0xc0 = min(0xc0, 0xb0)
804128f0–804128f4  ball+0x98 (lift) = 0, ball+0x9c (side spin) = 0     ← both die on contact
804128fc–80412918  after the loop: if r19 > 0: ball+0x7c = v (velocity before the impulse)
8041291c–804129ac  pos += 0xd8 + 0xe4 ;  v += 0xc0 + 0xcc
804129b0–80412a44  spin axis +0x1d4 blends toward 0x80 (visual)
80412a48–80412a7c  if +0xbc == 1 (in water): v.xz *= 0.96, v.y *= 0.97
80412a80–80412ae0  contact normal for the record: single → n; several → normalize(min + max)
80412ae4–80412b1c  ball+0x17f = 1; attr' = 0x80400a88(kcl, pos, r18); event 0x80411b6c(attr', vn_max)
80412b20–80412de4  sounds and particles by attribute (volume ∝ (vn − 0.05)/0.45, frames ≥ 15)
80412de8–80412df8  no contact this tick: record normal = (0, 1, 0)
80412dfc–80412e34  if +0xbc == 0 and pos.y < kcl.minY (field+0x1c) − 100: stop, attr 4 (OB)
80412e38–80412e7c  ring entry *(ball+0xc4)[ball+0xcc] = {attr r18, normal}: a heap array of four
                   16-byte entries (the ball ctor 0x80415c68 allocates it and sets the modulus
                   ball+0xc8 = 4); +0xcc = (+0xcc + 1) mod ball+0xc8
80412e8c–80412f18  if +0xbc == 0: raycast under the ball (0x803ef61c): attr-5 under it → +0xbc = 2;
                   if the top surface is not water/wall: ball+0xd0 = ground point (drop spot);
                   else +0xc0++ (ticks in water/valley/OB2)
```
Per contact the velocity change is therefore

```
Δv = −(1 + B)·(v·n)·n − min(|t|, A·vn)·t̂          vn = −(v·n) ≥ 0, t = v − (v·n)n
v' = B·vn·n + (|t| − A·vn)⁺·t̂
```
The per-prism Δv is not applied directly: the tick's velocity change is the sum of the
component-wise maximum and the component-wise minimum over the tick's prisms, so a single
contact is applied exactly and two contacts with the same sign apply only the larger.

### 3.3 The quantities

- **vn** is the normal component of the ball's velocity at the moment of the query, i.e. after
  this tick's Calc (gravity, integration and the 0.999 drag already applied). It is per tick: a
  descending driver has vn ≈ 0.7 u/tick; a rolling ball has vn = the gravity it gained since the
  last push-out.
- **No minimum rebound, no "stick"**: the rebound is `B·vn` whatever vn is. A rolling ball is
  pushed out to the surface every tick, rebounds by `B·vn`, loses 0.002 to gravity before the
  next query and arrives with `vn_{k+1} = 0.999·(0.002 − B·vn_k)`, whose fixed point is
  `vn* = 0.002·0.999/(1 + 0.999·B)` = 0.001332 (B = 0.5), 0.001428 (B = 0.4), 0.001996 (B =
  0.001). The simulator measures v.y = +0.000666 after every contact on fairway, i.e. exactly
  B·vn*. The hop is 1e-4 u high; the ball never leaves the 0.5 u query radius.
- **Friction impulse per tick on the ground** = `A·vn*`: fairway/tee 0.000533, rough 0.000714,
  green 0.000200, fringe 0.000400, bunker 0.00200 u/tick². This is the whole rolling
  resistance (section 4).
- **in air** (`0x804121c4`): `(lifetime < 8 || ball+0xb4 == 0) && ball+0xbc != 1`, where
  `ball+0xb4` is the maximum attribute over the last four ticks' ring entries (`0x804144b8`,
  recomputed only while the ball moves, `ball+0x60 != 0`; a stopped ball keeps its last value).
  A tick records attr 0 when nothing in the mask touched the sphere or the ball was rising
  faster than 0.25 u/tick. So "in air" means four consecutive ticks without contact; the first
  contact after a flight (and only that one) sees `inAir == 1`, which is what gates the
  backspin factor f. On the first eight ticks after launch the ball is in the air whatever it
  touches. Nine callers consume the same predicate (the contact routine's backspin gate, Calc's
  wind, steering and stop blocks, the look-ahead, the camera and reactions).
- **Bookkeeping**: `ball+0x64` = position after Calc, before the contact routine (used by the
  stop rule); `ball+0x7c` = velocity entering the contact routine on contact ticks (the
  steering block reads its direction); `ball+0x70` = normalised sum of the four ring normals =
  the smoothed ground normal that gravity and the steering projection use; `ball+0xb6` = the
  attribute while on the ground (read by the steering weight); `ball+0x17f` = "has touched
  something this shot" (gates the iron-on-green rule); `ball+0xa4`/`+0xa8` = steering started /
  the pull-back vector; `ball+0xb8` = stop counter. Between shots the player code writes
  `ball+0xb4`/`+0xb6` from its lie and the resets pre-fill the ring; none of that changes the
  in-flight definitions.
- **Stop rule** (`0x80414310`–`0x804143e0`, inside Calc): on the ground, if the displacement
  since `ball+0x64` is < 0.0015 u for more than 20 consecutive ticks and `ball+0xb4` is in
  0x1ce5e, the ball stops (`0x80413b04`: v = 0, spin axis = 0, `+0x60` = 0); on a non-restable
  surface its velocity is instead **replaced**: `v := 0.02·normalize(n.x, 0, n.z)`
  (`0x804143b4`–`0x804143e0` through `0x803edd94`; zero when the smoothed normal is vertical)
  and the counter restarts, so the kick fires at most once per 21 ticks. Lifetime > 7200 ticks
  also stops it. `0x80413b04` refuses to stop any ball while the current ball still has its
  swing attached (`+0x16c`).
- Contacts with `vn < 0` still push the ball out of the surface (the accumulators at 0xd8/0xe4
  are updated before the test) but change no velocity.
- Water (7) and valley (13) are not contacts: the ball keeps falling (with the 0.96/0.97 drag)
  until it is 100 u below the course minimum, then stops as OB; the penalty event fires once.
  OB2 (5) and wood (8) prisms are ignored entirely (attr 5 is the dead floor plane).
- `0x80400a88`: a ball recorded on a bunker (3) within 2.0 u of a fairway or rough prism is
  reported as lying on that instead (for the lie of the next shot and the landing sound).

## 4. Item 2: rolling deceleration and slope

```
per tick on the ground (attr a, smoothed normal n, slope θ between n and ŷ):
  normal load     g_n = 0.002·cos(θ/2)          (gravity along −normalize(0.5n + 0.5ŷ))
  downhill pull   g_t = 0.002·sin(θ/2)          along the slope's fall line
  steady vn*      = 0.999·g_n / (1 + 0.999·B[a])
  Coulomb loss    |Δv_t| = A[a]·vn*             (speed-independent, opposite to motion)
  drag            v *= 0.999                     (also in the air; the only per-tick drag on v —
                                                  the 0.9985 / 0.999 in the lift and side-spin
                                                  blocks decay the spin scalars ball+0x98/+0x9c,
                                                  0.998 the visual spin axis +0x1d4)
  wind            none (Calc applies it only when inAir)
```
Flat-surface numbers (checks.txt A; measured decelerations from 0.3 u/tick agree with
`A·vn* + 0.001·v` within 3 %):

| surface (attr) | A | B | vn* u/tick | A·vn* u/tick² | m/s² | yd/s² | roll from 0.3 u/tick (7.2 m/s) |
|---|---|---|---|---|---|---|---|
| fairway (1), tee (15) | 0.4 | 0.5 | 0.001332 | 0.000533 | 3.07 | 3.36 | 6.8 yd |
| rough (2) | 0.5 | 0.4 | 0.001428 | 0.000714 | 4.11 | 4.50 | 5.4 yd |
| green (6) | 0.15 | 0.5 | 0.001332 | 0.000200 | 1.15 | 1.26 | 12.8 yd |
| fringe (9) | 0.3 | 0.5 | 0.001332 | 0.000400 | 2.30 | 2.52 | 8.3 yd |
| bunker (3), sand OB (16) | 1.0 | 0.001 | 0.001996 | 0.00200 | 11.5 | 12.6 | 2.3 yd |
| side of cup (10) | 0.001 | 0.13 | — | ~0 | — | — | — |
| cup (11) | 0.3 | 0.5 | 0.001332 | 0.000400 | — | — | — |

The linear drag adds `0.001·v` per tick = 0.24 s⁻¹ (2.4 m/s² at 10 m/s), so at putting speeds
the two terms are comparable; at 7 m/s on fairway the Coulomb term is 3.1 m/s² and the drag
1.7 m/s².

Slope (`0x8041413c`–`0x80414198`): the "2:1 mix" is confirmed on the ground; it is a bisector,
so the pull is `0.002·sin(θ/2)`: 1.75e-5 u/tick² per degree = **0.10 m/s² = 0.110 yd/s² per
degree** (a real ball: 0.171 m/s² per degree). A resting ball moves when `tan(θ/2) >
A·0.999/(1 + 0.999·B)`: green 11.4°, fairway 29.8°, rough 39.3°, bunker never; the simulator,
with the stop rule's 0.0015 u/tick creep threshold, needs 15° / 33° / 42°. For a moving ball
the pull simply adds: a 20.5 yd flat putt becomes 21.4 / 22.5 / 25.0 / 28.2 yd down 1 / 2 / 4 /
6° and 19.6 / 18.8 / 17.2 / 15.7 yd up (checks.txt D), i.e. ±4.5 % per degree near zero.

Bounces (full power on fairway, groundsim): first bounce 3.2 yd high / 24 yd long (driver),
4.0 / 17 (3i), 3.3 / 9 (9i), 2.8 / 5 (wedge); seven distinct bounces before the roll; on rough
2.1 yd high (B = 0.4); in a bunker none (B = 0.001: the ball stops within 3 yd). The height is
`(B·vn·f)²/(2·0.002)` with the landing vn.

## 5. Item 3: the backspin pull-back and roll steering (Calc `0x80413cd0`–`0x80414084`)

Runs every tick when `lifetime > ball+0x58` (the tick the swing's spin was applied,
`0x80414854`) and `!inAir`. Constants: r2-0xd4 = 0.9, r2-0x28 = 0.655, r2-0x24 = −0.06,
r2-0x40 = 0.7, r2-0x20 = 0.19, r2-0x1c = 57.2958, r2+8 = 2π/256, r2-0x18 = 30, r2-0x7c = 5,
r2-0x14 = 1.3, r2-0x10 = −0.3.

```
init (once, when ball+0xa4 == 0 and frame = lifetime>>2 > 30):
    P = ball+0xa8 = −0.06 · min(bs, 0.9)^(1.4427·(−ln 0.655) = 0.61) · normalize(v7c.x, 0, v7c.z)
    (v7c = ball+0x7c = the incoming velocity of the last contact; bs = ball+0xa0; 0 if bs < 0.001)
every ground tick:
    P_proj = P − n(n·P)                           n = ball+0x70 (the smoothed ground normal)
    if |P_proj| ≥ FLT_MIN: P ← P_proj · |P| / |P_proj|    (0x80413de4 |P|; 0x80413df4 SetLength 0x803edd94:
                                                   P is ROTATED into the ground plane, its length kept)
    else:                  P ← 0                  (0x80413e14: the fallback vector 0x807d2650 is (0, 0, 0))
    w = 0.7 + 0.19·(1 − clamp(A[ball+0xb6], 0.15, 1.0))/0.85     fairway 0.834, rough 0.812, green 0.89, bunker 0.70
    φ = |angle between P and (pin − pos)| in degrees          (0x80402bd8 GetPinPos, atan2 at 0x80414474)
    h = 1.3 − 0.3·(clamp(φ, 5, 30) − 5)/25                     (1.0 when the player's lie attr is 3, bunker)
    P ← P·w ;  v += h·P
```
The projection step keeps |P|: the earlier reading "P ← P − n(n·P)" as the whole step was wrong
by 1/cos(angle between P and the ground plane), which is non-zero only on the tick P is created
on a slope and whenever the smoothed normal changes; on a flat surface the two are identical. In
the simulator the difference is ≤ 0.05 yd even for a full-backspin 9i onto a 10° green
(checks.txt I), so no table in this report moved. The exponents are exactly −log2(c): 0.73697
for f and 0.61043 for P, so pow(0.5) returns the constant itself (0.6 and 0.655); the weight w
comes from one of two identical code blocks chosen by the sign of v·P.

Because P shrinks geometrically the total impulse is `h·|P|·w/(1 − w)`: 5.0·h·|P| on fairway,
8.1 on green, 4.3 in rough, 2.3 in a bunker, with |P| = 0.06·bs^0.61 (0.056 u/tick at bs =
0.9), i.e. up to 0.28·h u/tick on fairway and 0.46·h on a green, opposite to the direction the
ball arrived from. "Homing" means the pull-back is 30 % stronger when it points at the pin
(the ball ran past) and normal when it points away. The pull is applied over the ground ticks
only; the first ground tick after a bounce from the air is the second contact tick (the landing
tick itself is still "in air"), so a chip that lands before frame 30 starts pulling at frame 31
wherever it is. In the contact routine the backspin also softens every landing from the air
(`B·f`) and decays (`bs·f`) once the steering has started. The two earlier readings "weight
between 0.19 and 0.7" and "8e-5 ground-normal term in the air" (wsr-club-physics.md 4.6) were
wrong: the weight is 0.7 + 0.19·t and the 8e-5 block is only the wind.

Simulated roll-out (yd) at full power, pin-homing h = 1 (groundsim, tables.txt):

| landing | 3i | 5i | 7i | 9i | SW |
|---|---|---|---|---|---|
| fairway, bs 0 | +21.9 | +15.7 | +15.7 | +9.7 | +4.8 |
| fairway, bs 0.5 | +11.5 | +7.4 | +7.4 | +3.6 | +0.5 |
| fairway, bs 1.0 | +6.9 | +4.1 | +4.0 | +1.3 | −1.4 |
| green, bs 0 (irons: A = 0.48 on first contact) | +25.0 | +16.7 | +17.6 | +9.5 | +17.1 |
| green, bs 1.0 | +2.7 | −3.1 | −2.6 | −10.0 | −2.7 |

The swing-side magnitude of bs (`swing+0x7c`·P1c, Wii motion) is still unknown; the tables
bracket it.

## 6. Item 4: the putter, the green and the cup

**Power pipeline** (`0x80421308`–`0x80421364`, `0x8041e794`): the "putter mode" is the club
type test `r4 == 3` in `0x8041e794`: for the putter `p2 = p1·cap` always (no over-swing split).
The putter's slot-7 curve is linear (P34 = 0.5, P3c = 0.05, P40 = 1, P44 = 1.25 give `p1 =
max(0.05, raw)`) and its caps are 1.0 on every lie, so `power = clamp(raw, 0.05, 2.5)` on
fairway, green and fringe and `clamp(raw, 0.05, 1.0)` from rough or sand (P4c = P54 = 1, P58 =
2.5). Where the Wii's raw putt value tops out is motion-side and not in the binary. The p3 stage
`0x8041e664` has a putter-specific assist path, but it cannot touch the launched power:
`swing+0xe4` is set only after the launch, so it only alters the post-launch recomputation of
`swing+0x98` that the look-ahead reads.

**Launch**: P10 = 0 (horizontal), lift 0, spin 0, `v0 = 0.004 + 0.406·power^0.6666` u/tick (the
exponent is log2(1/0.63); 0.26 u/tick = 6.2 m/s at power 0.5; 0.41 = 9.8 m/s at 1.0; 0.75 =
18 m/s at 2.5). The ball starts in contact and rolls from tick 1 under the green's `A·vn* =
0.0002` plus drag.

**Stop distance on a flat green** (groundsim): power 0.1 → 1.8 yd, 0.2 → 3.8, 0.3 → 6.0, 0.4 →
8.1, 0.5 → 10.2, 0.6 → 12.3, 0.7 → 14.4, 0.8 → 16.4, 0.9 → 18.5, **1.0 → 20.5**, 1.25 → 25.4,
1.5 → 30.1, 2.0 → 39.3, 2.5 → 48.1 (≈ 20.5·power, slightly concave). The putter's P0c = P08
= 20 confirms the green constants. Slope along the putt: section 4. The app's `MU = 1.35` and
`SLOPE_G = 1.1` correspond in WSR to a constant deceleration of 1.26 yd/s² (1.15 m/s²) plus a
0.24 s⁻¹ linear drag, and a downhill pull of 0.110 yd/s² per degree of slope (= 0.087 of the
constant deceleration per degree); whatever units the app's grid levels are in, the ratio
pull/friction ≈ 0.087 per degree is the number to match.

**The cup** (`0x8040562c`, called when the pin is placed; `0x803f0bdc(kcl, pinPos, f1 = 1.5,
f2 = 3.0)`, r2-0x5f8 / r2-0x5ec; `0x8040561c` returns the 1.5): the green prism under the pin
(found by a raycast whose hit test uses R + r = 2.0) is remembered in the collision model
(kcl+0x68) with the cup centre (+0x6c..+0x74), radius R = **1.5 u (0.164 yd, 15 cm)** and
depth D = **3.0 u**; the ball radius is r = 0.5 u. When the sphere query hits that prism on its
face-contact path (the edge/corner paths skip it) with the ball's flag it calls `0x803f07a4`,
which with ρ = horizontal distance of the ball centre from the cup centre, ρ_in = R − ρ and h
= the centre's height above the surface at the nearest rim point returns, every case only when
h < r (above that the ball over the mouth is in free fall):
- ρ ≤ R − r = 1.0 u (ρ_in ≥ r): only the floor at cup.y − D is tested (attr 11, normal up);
- 1.0 < ρ ≤ 1.5 u with the centre at or above the surface (h ≥ 0): the nearest rim point is a
  sphere contact of radius r (attr 10, normal from the rim point to the ball centre), made only
  when |pos − rim| ≤ r: the ball rolls down the edge;
- the centre below the surface (h < 0) inside the rim: the vertical wall (attr 10, normal
  toward the axis, depth r − ρ_in) or, when the floor is reached too, the wall/floor corner
  (attr 11, the normalised sum of the two penetrations);
- ρ > 1.5 u (outside the rim, any h < r): the plain green contact with its normal tilted
  toward the cup by `clamp(0.5·((ρ_in + r)/r)^6.64, 0, 0.5)` — a funnel that is zero beyond
  ρ = 2.0 u and only matters within ~0.1 u of the rim; attr 10 when the tilt exceeds 0.1,
  else 6.
Contact constants for the cup: A[10] = 0.001, B[10] = 0.13 and the rebound's upward component
is capped at 0.1 u/tick (`0x80412898`); A[11] = 0.3, B[11] = 0.5. **Holed** (`0x80411aec`,
`IsHoleOut 0x80411b5c`): the ball's recorded attribute (`ball+0xb4`) is 10 or 11 and its centre
is below the pin object's own y (`*(fieldMgr+0x3c)+0x4c`, the placement file's pin height,
which should coincide with the green surface; the cup object's copy is the one `0x8040562c`
raycast-adjusts). The hole-out sound cue is scheduled 5 frames before the look-ahead's predicted
hole-out frame (`0x80414410`).

Simulated capture (checks.txt E, F; the lip funnel's sign-restoring pow was ported exactly):
- straight at the cup, speed at the lip 0.016–0.168 u/tick (0.4–4.0 m/s, 0.4–4.4 yd/s): holed;
  0.202 u/tick (4.8 m/s, 5.3 yd/s) and above: hops the far rim and runs on. From a 10 yd
  distance: putts that would have stopped at 10.2–14.4 yd (≤ 4.4 yd past) drop, 16.4 yd (6.4
  yd past) and longer lip out. So WSR's **maximum capture speed ≈ 0.18 u/tick ≈ 4.3 m/s ≈ 4.7
  yd/s** at the rim (the discrete 240 Hz geometry makes the boundary ragged between 0.17 and
  0.20);
- lateral offset at ~1 m/s: holed up to **1.25 u (0.137 yd)** off the centre line, missed at
  1.5 u (0.164 yd): the effective capture half-width is between R − r = 1.0 u and R = 1.5 u.
For comparison the app uses capture radius 0.22 yd = 2.0 u exactly R + r (the outer reach of
the lip funnel; WSR's effective radius is 0.14–0.16 yd) and max capture speed 2.2 (if yd/s,
half of WSR's 4.4–5.3; if m/s, half of 4.0–4.8).

**Flagstick** (only when the player's lie is not green / side of cup / cup, i.e. the flag is
in, and the mode is not 5 or 8): `0x80413350` sweeps the tick's path in four quarter-steps
against a vertical capsule at the pin (`0x803ffe30`: radius 0.1 u + ball 0.5, half-height 30 u)
and on a hit moves the ball back to the first touching sub-step and bounces it through the
shared object response `0x80413648(ball, n, 1, depth, 0.7, e)` (tree doc: normal reversed ×e,
tangential ≤ 0.7·|v_n|, spin zeroed) with `e = clamp(0.299·sign·|1 − 2·vn|^1.737 + 0.001,
0.001, 0.3)`: 0.3 for a touch, 0.001 (dead) for vn ≥ 0.5 u/tick. `0x80413020` tests a box in
the pin object's frame (`0x803ff8ec`: |x|, |z| ≤ 2.8 u, |y| ≤ 2 u about the pin base) and, when
the ball is inside and approaching, replaces its velocity by the normal component capped at
0.5·depth plus 10 % of the tangential plus 0.0117 u/tick toward the pin axis (`CalcDeltaXZ`
returns pin − ball), damps falls (v.y < −0.15 → ×0.95; the one place besides the 0.999 drag
and water that scales v, and it is a pin collision, not a drag), plays the pin "wobble"
(`0x8040136c`, 0.035) and zeroes lift, side spin and backspin. A shot that reaches the
flagstick therefore stops at it and is drawn into the cup. Nothing of this exists when putting
from the green.

## 7. Item 5: the look-ahead and the aim lines

`0x80414a94(ball, targetFrame, lastFlag)` steps `RPGlfSimManager::spSimBall` (r13-0x2c38, one
of four 0x1e0-byte `RPGlfBall`s allocated at `0x80414ddc`; `ball+0x50 != 0` marks it as a sim
ball) through the **same wrapper** `0x80414734` (`0x80414af0`) — Calc, tree check, flagstick,
contacts, wind (the wind getter keys on the current player's lie, not on the ball), the real
collision model with the cup — copying after every tick the sim position into `ball+0xf0` and
recording: first ground contact (`+0xfc`, frame `+0x13c`; "not inAir" after a flight), highest
point (`+0x12c`, `+0x150`), closest approach to the pin (`+0x120`, `+0x14c`), a rock-wall hit
(`+0x108`, `+0x140`), the hole-out frame (`+0x144`, attr 11) and, when the sim ball stops
(`+0x60 == 0`), the rest position (`+0x114`), frame (`+0x148`), attribute (`+0x154`) and
water state (`+0x158`). A sim ball in water/valley is cut off 120 frames later (`0x80414b3c`,
0x78). The loop ends when the sim ball stops or reaches `targetFrame` (−1 = run to the end).

Who runs it: every 60 Hz frame `0x80410b78` (from the frame update `0x80417364`, after the four
ticks) calls, for the current ball, `0x8041490c` while the swing is still attached (`+0x16c`):
that relaunches the sim ball from the swing's current power and aim (no spin yet) and runs it
to one frame ahead of the real ball, then, once `0x8041e650(swing)` says the swing is final,
`0x80414854` writes the spin into the real ball, **copies the real ball into the sim ball**
(`0x804156ac`) and detaches the swing; from then on `0x80414a08` advances the sim ball 60
frames per real frame until it has stopped. So a few frames into the flight the game knows the
landing point, apex, closest approach and rest position of the actual shot, bounces and roll
included. Its readers (every load of `ball+0xfc..+0x15c` across the text section was checked):
the camera (`0x8040a46c`, `0x8040b400` closest approach vs the pin, `0x8040b68c`, `0x8040c514`,
`0x8040c9a4` landing and stop frames, `0x8040cb8c`, `0x8040d318`, `0x8040d53c`,
`0x8040eb3c`/`0x8040ee98`), crowd/player reactions (`0x803f5b30`, `0x803f6020`, e.g. "will stop
within 6 u of the pin within 60 frames"), a player flag (`0x803fcd44` copies the apex frame
`+0x150` to `player+0x7c`), the hole-out sound cue (Calc `0x80414410`), the sim copy/reset
(`0x8041532c`, `0x804156ac`) and the recommender's per-club evaluation (`0x8040816c` runs balls
through the same wrapper). The layout code that shows the HUD reads pane pointers, not these
fields: the look-ahead is not a landing marker.

WSR draws two aim lines, and neither is a per-club guide of the kind first described here:

- **The putting line** `0x803fb370` (called per frame from `0x804173d4` in the frame update
  `0x80417364`; `r27` = `r13-0x2cb8` = `RPGlfPlayerManager`, current player = `manager+0x664`).
  Its point loop runs only while `manager+0x674` is set (shot setup `0x803fb59c` sets it, the
  real launch `0x803fafc0` clears it) **and** `0x803fa918(manager)` holds: the player's lie
  `player+0xb0` (the KCL attribute under the ball, remapped by `0x80400a88`; 15 = tee) is 6, 10
  or 11 = green / side of cup / cup, `player+0xbc == 0` and `manager+0x675` is set by the
  sequence state machine. The same lie test skips the flagstick in the wrapper, forces the
  putter at shot setup (`0x804090ac`: lies 6/9/10/11 → club index 7) and refuses club changes
  (`0x804092f0`), so inside the gate `0x80409048()` = P0c × 9.144 u is always the **putter's
  20 × 9.144 = 182.88 u = 20 yd**, step L/32 (`L × 0.25 × 0.125`) = 5.715 u = **0.625 yd**.
  Point 0 is the player position (`+0x98/+0x9c/+0xa0`); points k = 1..32 add
  `(aim.x, ·, aim.z)·L/32` (aim = the unit (sin, cos) pair at `player+0x84/+0x88` from the
  heading `player+0x80`) and take y from a vertical raycast (`0x803ef61c`, the highest surface
  above `kcl+0x1c`) plus the ball radius 0.5 (`0x80412200`), or the previous point's y when
  the ray misses. The 33 vec3s live at `manager+0x714` (zeroed with count 0x21 at
  `0x803fbf30`) and `0x803fab24`, under the identical gate, draws them as a 33-vertex
  `GX_LINESTRIP` (`0x801a6e00`, primitive 0xB0; called from the draw dispatcher `0x8040499c`).
  So this is the putt's 20 yd guide line on the green, and nothing else: it never exists for
  the driver, and "7.5 yd steps" never happen.
- **The aim model** `0x80402fcc` (per frame from `0x80403440` ← `0x8041760c`, `r3` =
  `r13-0x2ca0` = the field manager; `0x804031b4` is the only other caller of `0x80409048`). It
  builds a 3×3 from the aim (`0x803f2c8c`: rows (z, 0, −x), (0, 1, 0), (x, 0, z)), transposes
  it into a Mtx34 with the player position as translation (`0x804030a8`–`0x80403104`), scales
  its aim column by `L/2000` (`0x806fd9d0` = 2000: the model is authored 2000 u long) and sets
  it on the model at `obj+0xa8` (`0x8023e47c` → `model+0x48`), on **every lie**; `0x80403388`
  hides the models when `0x80402e5c` says the player is not aiming (`player+0xbc != 0`,
  `manager+0x8a8`, replay/menu flags, `obj+0x98 == 0`). So the aim line on the fairway is
  exactly **P0c × 9.144 u long for the selected club** (the putter's 20 yd on the green): the
  nominal full-power carry, flat, with no wind, lie cap, elevation, power or roll in it. That
  is WSR's "flat-terrain carry" line; where the Switch's per-bar dots come from was not
  traceable here, but WSR's design is "the aim line is P0c long", consistent with the app's
  "minimap meter dots = flat-terrain carry" if NSS kept it and divides it per bar.

## 8. Item 6: the simulator and its tables

`tools/research/wsr-groundsim.py` (run `python -I tools/research/wsr-groundsim.py` from any
directory; the scratch original is `$S/research/ground/groundsim.py`, with `checks.py` for the
extra tables) ports Calc's lift, side spin, steering (with the 2026-10-19 rotation step), gravity,
integration, drag and stop rule (with the normalised kick), the contact routine on an infinite
plane of one attribute (optionally tilted; a zero-depth query is a miss, as in `0x803f0e48`),
the four-entry ring buffer / inAir / smoothed normal, the iron-on-green rule, the backspin
factor and the cup override. Not ported: wind (available in wsr-flightsim.py; it never acts on
the ground), trees, the flagstick, the water/valley states, the visual spin axis, the
multi-prism min/max combination (one plane = one contact; the max + min of one Δv is that Δv),
the bunker lie's h = 1.0, and the pin's prism boundary (the cup override is applied everywhere,
which is equivalent since it returns the plain contact beyond 0.5 u outside the rim).
`STEER_ROTATE = False` reproduces the earlier plain-projection reading for comparison
(checks.txt I: ≤ 0.05 yd apart even on a 10° green with bs = 1.0, identical on a flat plane).

Decoded (high): every constant and formula above except where marked; the verification found no
silent fudge factor — every number in the script traces to a pool literal, a club-block field or
a table fill, and its air phase matches wsr-flightsim.py's ground crossing to 2e-13 u. Modelling
choices: the surface is a single flat (or uniformly tilted) plane; the initial smoothed normal
is ŷ; the swing-side backspin value is an input (0, 0.5, 1.0 shown); the pin-homing factor h is
1.0 in the tables (no pin) — real shots get up to 1.3; power is the launch power p (0–1) exactly
as in wsr-flightsim.py, "3 bars" = p = 0.75 and "2 bars" = 0.5 by the WSR multiplier reading.

Full power, flat fairway (carry = first contact; roll = stop − carry); unchanged by the
2026-10-19 corrections (bs = 0, flat plane):

| club | carry yd | bounce 1 h / len yd | bounces | stop yd | roll yd | P08 |
|---|---|---|---|---|---|---|
| DR | 240.2 | 3.2 / 24.4 | 7 | **278.8** | 38.6 | 279 |
| SP | 219.8 | 3.2 / 21.7 | 7 | **252.6** | 32.8 | 253 |
| 3I | 189.8 | 4.0 / 17.2 | 7 | **211.7** | 21.9 | 212 |
| 5I | 159.9 | 4.0 / 13.4 | 7 | **175.6** | 15.7 | 176 |
| 7I | 130.1 | 3.4 / 12.8 | 7 | **145.8** | 15.7 | 146 |
| 9I | 99.8 | 3.3 / 8.8 | 7 | **109.5** | 9.7 | 110 |
| SW | 55.2 | 2.8 / 4.8 | 7 | **60.0** | 4.8 | 60 |

Same launch, other landing surfaces (stop / roll, yd): rough DR 269.2 / 28.9, SP 243.8 / 24.0,
3I 204.4 / 14.6, 5I 169.6 / 9.7, 7I 140.1 / 10.0, 9I 105.2 / 5.5, SW 57.5 / 2.3 (first bounce
2.1 yd high); green DR 309.3 / 69.1, SP 281.1 / 61.3, 3I 214.9 / 25.0, 5I 176.6 / 16.7, 7I
147.7 / 17.6, 9I 109.3 / 9.5, SW 72.3 / 17.1 (irons get A = 0.48 on the first contact; without
it 3I/7I/9I would run to 236.9 / 166.8 / 126.6); bunker: no bounce, DR 243.1, SP 221.4, irons
and wedge +0.0.

Power 0.75 (3 bars), fairway: DR 183.2 → 233.0 (roll 49.8), SP 167.4 → 210.4 (43.0), 3I
143.9 → 171.1 (27.2), 5I 121.1 → 140.8 (19.7), 7I 98.0 → 116.5 (18.5), 9I 75.4 → 86.8 (11.4),
SW 41.0 → 45.8 (4.9). Power 0.5: DR 120.6 → 178.8 (58.2), 9I 49.7 → 61.5. Power 0.25: DR
57.4 → 111.6 (54.2), 9I 23.5 → 32.8. Driver stop vs power: 69 / 112 / 149 / 179 / 208 / 233 /
257 / 279 yd at 1/8 steps — the roll-out **grows** as power drops (flatter descent, smaller
friction impulse), so stop distance is far from proportional to power even though carry is.

Slope 3° down along the shot (fairway, full power): DR 290.9, 9I 115.0, SW 63.5; 3° up: DR
266.7, 9I 104.5, SW 57.2 (carry moves with the ground height, roll 34 vs 48 yd for the driver).

Putter: section 6 (flat and sloped; cup capture).

## 9. Not found, not decoded

- The swing-side backspin magnitude (`swing+0x7c`) and the putter's raw range: Wii motion.
- How the Switch's per-bar minimap dots relate to WSR's aim line (WSR draws one P0c-long model
  and a 20 yd putting line; it has no per-bar marks).
- `0x803f17ac` / `0x803f05ac` (the KCL's prism search setup) and the KCL thickness check
  (kcl+0x14) — irrelevant on a plane.
- The rock-wall special case's course name (`0x80406b60` vs the string at `0x8067b7ee+0x4f`).
- The visual spin axis (`ball+0x1d4`) and the sim-ball copy details (`0x804156ac`, `0x8041549c`).
- The per-attr particle/sound tables beyond the ids listed.

## 10. Confidence

- Contact routine structure, impulse formula, A/B meaning, push-out, inAir, ring buffer, stop
  rule, lift/side-spin kill: **high** (full read, independently re-derived 2026-10-19, and the
  simulator reproduces P08 for all seven clubs to 0.4 yd and the putter's 20 yd).
- Rolling deceleration and slope formulas: **high** (follow from the above; measured in the sim).
- Backspin factor f and the steering block (init, the rotation into the ground plane with its
  rescale, w, h with its angle convention and the bunker branch, decay): **high** (re-derived;
  the rescale was the one correction); magnitude of bs: unknown.
- Cup geometry and contact cases: **high** (placement constants read, override decoded and
  re-derived); capture numbers: **medium** (simulated with a flat green and the override applied
  everywhere; the real pin prism is one 15 u cell).
- Flagstick capsule and box: **medium** (shapes and constants read; the response's exact
  numbers partly from the tree doc).
- Look-ahead: **high** (what it computes and who reads it). Aim lines: **high** for the putting
  line's gate, length and renderer and for the aim model's length (corrected 2026-10-19; the
  earlier "32 points of P0c for every club" was wrong).
- All of it is WSR. Switch Sports: the structure (impulse friction + restitution, bisector
  gravity, bounces that depend on descent angle, cup as a pit, flagstick) is what may carry
  over; every number must be fitted.

## 11. Switch measurements that would calibrate or refute each term

(Restart-determinism gives identical wind; Shot Assist gives exact power; log carry = the
first bounce seen on the minimap or the ball-cam, and stop = the "yd to go" delta.)

1. **Roll-out per club, full power, flat fairway landing**: WSR predicts stop − carry = 39 / 33
   / 22 / 16 / 16 / 10 / 5 yd (DR..SW), 16 % of carry for the driver down to 9 % for the wedge.
   A constant roll fraction, or roll that grows with carry, would mean the Switch dropped the
   descent-angle dependence (friction ∝ vn).
2. **Driver stop vs power, 1/2/3/4 bars, fairway**: WSR 112 / 179 / 233 / 279 yd (roll 54 / 58
   / 50 / 39). If the Switch's stop distances are proportional to bars, its ground model is
   not WSR's; if the 1-bar drive runs 50+ yd, it is.
3. **Same shot onto different surfaces** (holes where a club lands on fairway, rough or green):
   WSR driver roll 39 (fairway) / 29 (rough) / 69 (green); 9i roll 10 / 5.5 / 9.5; wedge 5 / 2 /
   17. Rough is the test of A = 0.5 vs 0.4, the green of A = 0.15 and the iron-only first-bounce
   rule (irons on green 25 / 17 / 10 yd for 3i / 7i / 9i, woods 60–70).
4. **Bunker landing**: WSR has no bounce and ≤ 3 yd of roll for every club.
5. **Backspin**: 9i full power onto a green with maximum backspin vs none: WSR −10 vs +9.5 yd
   (h = 1; up to 1.3× stronger when the ball rolled past the pin); first-bounce height drops
   from 3.3 to 0.6 yd. Check also whether a ball that passes the pin spins back further than one
   that stops short (the homing factor).
6. **First-bounce height and length** (ball-cam): driver 3.2 yd high / 24 yd long on fairway,
   2.1 / 18 on rough — the direct measure of B.
7. **Putting, flat green**: stop distance vs putter power: WSR 20.5 yd at power 1.0, linear in
   power; a 7-m/s putt rolls 12.8 yd (green) vs 6.8 (fairway) vs 8.3 (fringe): the ratio is
   A_green / A_fairway = 0.375.
8. **Slope**: a 20 yd putt up/down 1–2° changes by ±0.9 / ±2 yd (4.5 % per degree); a ball
   resting on a green slope should sit still up to ~12–15°. Across-slope break follows the
   same 0.110 yd/s² per degree.
9. **Cup**: putts rolling dead-centre with an excess of 2, 4, 5, 6, 8 yd past the hole: WSR drops
   those ≤ ~4.4 yd past and lips out ≥ ~6 yd past; off-centre by 0.1 / 0.14 / 0.17 / 0.22 yd at
   dying speed: WSR holes up to 0.137 yd and misses at 0.164. These two sweeps fix the app's
   0.22 yd / 2.2 directly.
10. **Flagstick**: chips from off the green that hit the pin: WSR stops them at the stick and
    pulls them in; putts cannot hit it (removed on the green). If the Switch keeps the flag in
    during putts or lets balls bounce off the stick, that rule differs.
11. **Wind on the ground**: a strong tailwind should not change roll-out at all (WSR applies
    wind only while airborne ≥ 4 ticks); compare roll on calm vs 20+ mph tailwind days with the
    same carry.
12. **Aim line length**: on the Switch, measure the aim line's (or its last dot's) distance from
    the ball against the club's full-power carry on a flat lie; in WSR it is exactly P0c, with
    no wind, lie or elevation in it, and 20 yd for every putt.
