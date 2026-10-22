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
- Node 22. No Python at run time.

## How it controls the game

- **GDB stub** (`lib/gdb.mjs`): Dolphin.ini `[General] GDBPort` makes the
  emulated CPU wait at boot for a connection; the client reads and writes
  memory and registers, sets instruction breakpoints, steps, continues and
  breaks. Measured behaviour it handles: a break answers "T05", "", "T05" (the
  stale two are skipped); `c` from a breakpointed PC stops again at once, and
  `s` executes the instruction under a breakpoint, so resuming steps first and
  never lifts the breakpoint (lifting it invalidates the JIT's blocks: 250-280
  ms a frame instead of 61 ms at a per-frame breakpoint). An asynchronous
  halt can land in an exception handler with translation off (MSR IR/DR
  clear), where memory reads fail with E00; `haltSafe` steps until MSR & 0x30
  is set again.
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
  rest at the save's position with the save's lifetime (the lifetime is not
  reset between strokes, so position and lifetime together recognise a save).
- **Instances** (`lib/dolphin.mjs`): every run script takes `--instance N`
  (default `HARNESS_INSTANCE`, else 0): its own user dir (`state/user`,
  `state/user1` ...), GDB port 47020 + N and DSU port 46020 + N. The ports sit
  below Windows' ephemeral range: fixed ports inside it (55022, 55028) were
  taken by other programs' client sockets and Dolphin's stub failed to bind.
  Several instances run side by side (each Dolphin under 1 GB).

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
   a human swing of that strength. In the default "hold" mode the launch
   power and p3 are also rewritten right after the game stores them
   (0x80421368), so WSR's hidden pin-power assist cannot move them (every
   validation run except 2e, and the play-through); "game" mode leaves the
   pipeline alone (make-spot, the cup's tee shot, 2e, the red zone). `raw`
   feeds a raw value directly (the red
   zone: past 1.1 on a full lie, past 1.0 on a capped one);
5. `holdWindow` keeps the state-1 window open to its timer, ceil(n) frames,
   n = clamp(18 + 28 (1.25 - raw), 18, 25), as a follow-through does: at
   0x80421338 the follower's velocity is kept from going negative (the
   injected trigger leaves it settling onto the resting remote, so unheld the
   window often closes after one frame, before the assist can act). `s7c`
   writes the swing's backspin input there, before p3 reads it
   (tools/research/wsr-harness-decodes.md section 3);
6. at the spin hand-off (0x8041489c, before the look-ahead copy) the side
   spin `ball+0x9c` and backspin `ball+0xa0` are written (or the game's own
   kept, `keepGameSpin`); the spin tick the game stores one instruction later
   (0x804148a0) is the lifetime there, which is what `handoff.spinStart`
   reports;
7. the ball is traced tick by tick (0x80410cfc runs once per tick after the
   real ball's step), with the game's own tree check watched near a tree
   (0x804138d4, `treeWatch`), or its outcome is read from the look-ahead
   records the game writes into the real ball (first contact, apex, rest,
   closest approach, hole-out, the rest's attribute and water flag), polling
   the real ball's water state (`ball+0xbc`: 1 water, 2 OB floor, 3 valley)
   and position jumps (a penalty drop) on the way.

Every address is listed with its source in `lib/wsr.mjs`, `lib/shot.mjs` and
`lib/assist.mjs`; the decodes made for the harness are in
`tools/research/wsr-harness-decodes.md`.

Determinism: the same savestate and the same injected values give a
bit-identical flight, whatever the trigger's timing (section 1 of REPORT.md).

## Reaching every tee (`make-states.mjs`, `lib/play.mjs`)

Every hole's tee state is reached by genuine play: from the course-select
state the harness picks the course, then plays each hole out with injected
shots planned by the port (`lib/play.mjs planStroke`: a putt, an approach
aimed off by the port's own wind drift, or a layup at the lie's cap along the
game's aim) and putts until the ball drops (the game's own hole-out, read from
its records; no position is ever written). The Special course (holes 19-21)
is locked on a new save; `make-states.mjs` picks Resort A and makes the
setup's course read (0x80406954) return 6 (wsr-harness-decodes.md section 4).
`make-spot.mjs` makes a mid-hole state the same way, one real stroke toward a
map point.

## Tools

- `smoke.mjs`, `probe-gdb.mjs`: boot, attach, read RAM, screenshot.
- `driver.mjs` + `drive.mjs`: the interactive driver (one long-lived Dolphin,
  commands over a local HTTP port: press, point, screenshot, savestate, peek,
  poke, break-and-report, eval), used once to walk WSR's first-run intro and
  menus to the course-select screen.
- `make-states.mjs`: the tee state of every hole by play-through.
- `make-spot.mjs`: a state anywhere on a hole by one real stroke.
- `run-h10-irons.mjs` (+ `report-h10.mjs`, `compare-trace.mjs`): the first
  question, hole 10's irons maxed, with the determinism check.
- `run-sweep.mjs`: 2a, every club at powers 0.25-1.0 from every tee along the
  default line.
- `run-wind.mjs`: 2b, wind in 8 directions at 2-30 mph; `--powers` adds
  part-power swings.
- `run-trees.mjs`: 2c, lines past one tree at several offsets and clubs
  (`--toward pin` or a map point adds that line).
- `make-green.mjs`: a green state on any hole, by real strokes from its tee.
- `make-greenspot.mjs`: spots round a cup (up and down its fall line, the far
  side) and on the fringe, by real putts from a green state.
- `run-cup.mjs`: 2d, traced putts past the cup on both sides of the break.
- `run-cupedge.mjs`: 2d, the cup's holed / missed edge bisected on both sides
  at given speeds (`--speeds`), WSR's own line measured beside it.
- `run-puttwind.mjs`: wind on putts, from the green and from the fringe.
- `run-puttread.mjs`: the app's putt read in WSR, each read putted at its aim
  with the strength moved up and down, against the read at a base commit.
- `make-pinstates.mjs`: a tee state per WSR cup location (`lib/pins.mjs`:
  the 118 spots of `tools/wsr-pins.json`), the pin slot written over
  choosePin's result at hole start (wsr-harness-decodes.md section 2), the
  game deriving the pin, the cup and the tee from it; a course's first hole
  from the course-select state, any other by replaying the previous hole's
  holing stroke from its pre state (`SAVES/pins/hHH-pre.sav`, played out
  once); the pin, the cup prism and the tee checked against WSR's data;
  `--green` plays on to the green state.
- `make-pingreen.mjs`: a forced cup's green state by real strokes from its
  tee state (`lib/pins.mjs searchPlan`: the port's flight over the KCL, no OB
  or water on the roll, the app's tree check clear), then the tee state
  deleted.
- `run-pinputts.mjs`: the putting battery at one cup (REPORT.md 5.4): real
  putts to spots 3, 8 and 15 yd round the cup, and from each the app's read
  with the strength moved by up to 0.08 of putter power, six putts that miss
  on purpose, the capture window at 1, 2 and 3 yd/s on the 3 yd spots;
  resumable per spot; `--spots` and `--out` split a cup over instances,
  `--plan` gives putts to try first for spots the app's roll cannot plan.
- `campaign.mjs`: every WSR cup (or `--cups h8s4,h21s3`, `--holes`, `--steep
  8`) through pre state, tee state, green state and battery over
  `--instances 1-16`, one step per instance at a time, a hole's pre state
  before its tee states, `--order steep-first`, the battery in `--parts`
  (`--battery` adds run-pinputts options, `--plans <dir>` a cup's `--plan`);
  an instance in use and a cup another run's step tools work on are left
  alone; resumable from the outputs, one retry per step, no state step under
  5 GB free, a log per step and `status.json` under `state/campaign/`; Ctrl+C or
  a file `state/campaign/STOP` stops its own steps by PID (`DRAIN` lets them
  finish); `--dry-run` shows what would start, `--project` the wall time from
  the step times measured so far.
- `run-assist.mjs`: 2e, partial swings around the aim table's pin power,
  with and without backspin.
- `run-spin.mjs`: 2f, backspin, and the red zone on a full and a rough lie.
- `run-plan.mjs`: 3, every hole played out with each of its first two strokes
  also flown at +-0.05 bar and +-0.3 / 1.1 deg.
- `diag-shot.mjs`: one traced shot with every tree contact, to `state/raw`.
- `report.mjs [sweep|wind|windpower|trees|cup|cupedge|cupwindow|puttread|assist|spin|plan|puttwind|pins]`:
  one REPORT.md table set from `results/*.json`, the port flown again from
  each row's inputs; `--write` fills every one between its markers in
  REPORT.md, `pins --write` (any section name before `--write`) only that
  one. `pins` reads `results/pins/*.json` (`--dir results/pins-dev` another
  folder), merging the files of one cup and green state, the app's side
  flown again with `src/putt.js` as it stands; `--detail` adds a row per
  spot.

## The one-time walk (done 2026-10-21)

Boot to the strap screen (A), "New save data" (A), the first-run skydiving
intro (A at the plane, then the "Dive!" button, about 4 minutes of intro),
the title (A+B), the sports menu (Golf), the Golf card (A), 1 player, the
"no Mii" notice (A), a guest Mii (Guest B, Continue), right-handed, OK, then
"Number of Holes" (saved as `menu-holes.sav`) and "Select Course" (saved as
`menu-course.sav`). From there the harness needs no person.

## Security note

Dolphin's GDB stub listens on all network interfaces (this build has no
bind-address setting on Windows), so Windows Defender Firewall asks about
Dolphin the first time; the harness only connects from localhost, which
needs no firewall rule. If a rule was allowed, ports 47020 and up are
reachable from the network while a harness Dolphin runs; restrict the rule
to private networks or delete it in Windows Defender Firewall's allowed apps
if that matters.
