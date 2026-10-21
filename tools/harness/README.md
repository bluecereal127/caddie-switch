# The Dolphin harness

Wii Sports Resort (NTSC-U rev 1, RZTE01) running in Dolphin, driven from Node:
shots injected by memory writes at the game's own decision points, the ball
traced or its outcome read from RAM, and every result compared with the app's
port of WSR's golf physics (`src/wsrsim.js`, `src/model.js`, `src/trees.js`,
`src/putt.js`). The comparison tables are in `REPORT.md`; raw results in
`results/`.

Nothing here reads or writes the user's own Dolphin settings
(`%APPDATA%/Dolphin Emulator`), the disc image or its extraction. Dolphin runs
from its own generated user directory under `state/` (gitignored, like
`captures/`), which also holds the savestates, logs, screenshots and raw
traces.

## What it needs

- Dolphin 2609a (`C:\Users\Stephen\Downloads\dolphin-2609a-x64\Dolphin-x64\Dolphin.exe`,
  or `HARNESS_DOLPHIN`): its GDB stub, DSU client, `-u`/`-e`/`-s`/`-b`.
- The disc `C:\Users\Stephen\Desktop\Wii Sports Resort (USA) (En,Fr,Es) (Rev 1).rvz`
  (or `HARNESS_DISC`).
- For the KCL comparisons, the collision meshes in `captures/meshes/wsr-kcl-obj/`
  (gitignored; tools/MESHES.md).
- Node 22. No Python at run time (the disassembly helper used to decode the
  addresses was a capstone script in a session scratch directory).

## How it controls the game

- **GDB stub** (`lib/gdb.mjs`): Dolphin.ini `[General] GDBPort` makes the
  emulated CPU wait at boot for a connection; the client reads and writes
  memory and registers, sets instruction breakpoints, steps, continues and
  breaks. Measured behaviour it handles: a break answers "T05", "", "T05" (the
  stale two are skipped); `c` from a breakpointed PC stops again at once, and
  `s` executes the instruction under a breakpoint, so resuming steps first and
  never lifts the breakpoint (lifting it invalidates the JIT's blocks: 250-280
  ms a frame instead of 61 ms at a per-frame breakpoint).
- **DSU server** (`lib/dsu.mjs`): Dolphin's DSU (cemuhook) client reads a
  virtual controller from it. Slot 0 is mapped onto Wii Remote 1 (buttons,
  the IR pointer on the left stick, the MotionPlus gyro and accelerometer),
  slot 1 onto Dolphin's hotkeys (savestate slots, screenshot, pause, speed
  limit). Dolphin opens one UDP socket per device and keeps whatever pad
  packet arrived last, so each socket gets only the slot it registered.
  `HotkeysRequireFocus = False` and `BackgroundInput = True`, so nothing
  needs window focus and no keystroke is ever sent to a window.
- **Savestates**: a save is booted with `-s`; later loads copy the file into
  slot 4 and press its hotkey, retried until RAM shows the save's ball at
  rest (Dolphin occasionally misses a hotkey press).

## How a shot is injected (`lib/shot.mjs`)

The swing is not reproduced. From a stopped CPU at address:

1. club (`clubManager+0x2c`), aim (`player+0x80` heading, `+0x84/+0x88` the
   unit (sin, cos)), wind (`fieldManager+0x78` -> `+4/+8` angle, `+0xc/+0x10`
   speed index) are written;
2. `player+0x7c` (the swing logic's disable byte) is cleared, B is held until
   the game takes the address reference (`motion+0x60`, 0x804233bc), A is held
   until the game's hold count `playerManager+0x678` passes 20 (WSR swings
   only with A held);
3. at the state-0 trigger test (0x80421254) the harness sets the trigger's
   inputs (follower g >= 0.5, previous g < 0.5, speed > threshold) and the
   game's own transition, launch and flight follow;
4. on every state-1 frame the raw swing value is fed at its source (f1 at
   0x80421314, where `swing+0x88` is stored), inverted through the club's
   own power curve and the lie cap, so the game itself computes p1, p2, p3,
   the launch power `swing+0x98` and the on-screen power bar from it, as from
   a human swing of that strength; in the default "hold" mode the launch
   power and p3 are also rewritten right after the game stores them
   (0x80421368), so WSR's hidden pin-power assist cannot move them (the
   validation runs), while "game" mode leaves the pipeline alone (the
   play-through). (The first runs held only `swing+0x98`: the physics was the
   same, but the bar showed the dummy swing's level, about a third, whatever
   the ball was given.)
5. at the spin hand-off (0x8041489c, before the look-ahead copy) the side
   spin `ball+0x9c` and backspin `ball+0xa0` are written;
6. the ball is traced tick by tick (0x80410cfc runs once per tick after the
   real ball's step) or its outcome is read from the look-ahead records the
   game writes into the real ball (first contact, apex, rest).

Every address is listed with its source in `lib/wsr.mjs` and `lib/shot.mjs`.

## Tools

- `smoke.mjs`: boot, attach, read RAM, screenshot.
- `driver.mjs` + `drive.mjs`: the interactive driver (one long-lived Dolphin,
  commands over a local HTTP port: press, point, screenshot, savestate, peek,
  poke, break-and-report, eval), used once to walk WSR's first-run intro and
  menus to the course-select screen and hole 10's tee.
- `make-states.mjs`: the tee state of every hole, from the course-select
  state (`state/saves/menu-course.sav`).
- `run-h10-irons.mjs`: the first question (hole 10, irons maxed, calm and a
  4 mph headwind), with a determinism check.
- `run-sweep.mjs`: validation 2a.
- `compare-trace.mjs`: one trace against the port.

## The one-time walk (done 2026-10-21)

Boot to the strap screen (A), "New save data" (A), the first-run skydiving
intro (A at the plane, then the "Dive!" button, about 4 minutes of intro),
the title (A+B), the sports menu (Golf), the Golf card (A), 1 player, the
"no Mii" notice (A), a guest Mii (Guest B, Continue), right-handed, OK, then
"Number of Holes" (saved as `menu-holes.sav`) and "Select Course" (saved as
`menu-course.sav`). From there the harness needs no person. The Special
course ("?") is locked on a new save.

## Security note

Dolphin's GDB stub listens on all network interfaces (this build has no
bind-address setting on Windows), so Windows Defender Firewall asks about
Dolphin the first time; the harness only connects from localhost, which
needs no firewall rule. If a rule was allowed, port 55020 (and 55021+ for
extra instances) is reachable from the network while a harness Dolphin
runs; restrict the rule to private networks or delete it in Windows
Defender Firewall's allowed apps if that matters.
