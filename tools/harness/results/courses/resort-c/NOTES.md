# Resort C (holes 7, 8, 9, par 12)

Played over and over on one harness instance (tools/harness/course-supervisor.mjs), naturally: the game's own wind and pins (3-hole rounds use WSR's set B pins), club and aim by D-pad, the swing simulated through the game's power pipeline, the planner (round-planner.mjs) re-imported for every stroke. Goal: 6 under par (6 strokes). Written by course-notes.mjs after every attempt.

- Attempts finished: 19 (and 1 unfinished); best -4 (#6, 3-2-3); mean -2.05; last five E -2 -2 E E.
- Hole 7 (par 4): best 3, mean 3.84 over 19.
- Hole 8 (par 3): best 2, mean 2.11 over 19.
- Hole 9 (par 5): best 3, mean 4.00 over 19.
- The planner's memory of these holes: 301 strokes from every round and attempt, 24 of them failed lines it no longer tries from their spots.

## What recurs

- Hole 7, assist pulls: #20 stroke 4 (wedge), #14 stroke 3 (wedge), #10 stroke 3 (wedge), #4 stroke 3 (wedge).
- Hole 7, penalties: #19 stroke 2 (3iron), #5 stroke 2 (spoon).
- Hole 7, strokes 15+ yd from the port's flight: #20 stroke 1 (driver), #12 stroke 2 (3iron), #6 stroke 2 (3iron), #5 stroke 1 (driver), #4 stroke 1 (driver), #3 stroke 1 (driver), #2 stroke 1 (driver).
- Hole 7, missed putts: #7 stroke 3 (putter, 15.2 yd), #2 stroke 3 (putter, 11.2 yd).
- Hole 8, strokes 15+ yd from the port's flight: #6 stroke 1 (spoon).
- Hole 8, missed putts: #19 stroke 2 (putter, 7.6 yd), #13 stroke 2 (putter, 6.9 yd).
- Hole 9, strokes 15+ yd from the port's flight: #17 stroke 2 (driver), #16 stroke 3 (3iron), #13 stroke 2 (spoon), #9 stroke 2 (spoon), #6 stroke 2 (driver).
- Hole 9, missed putts: #16 stroke 4 (putter, 27.8 yd), #16 stroke 5 (putter, 3.5 yd), #8 stroke 3 (putter, 15.4 yd).

<!-- lessons -->
## Lessons

From the 12 natural 18-hole rounds before these attempts (round-planner.mjs as it was then: no lie yaw, a 300-candidate cap, no memory):

- Hole 7 (par 4): 12 rounds, -1 ×9, +1 ×3.
  - stroke 1 from the tee (driver): 3 times (round-r11: rested 22 yd from the port's rest; round-r6: rested 22 yd from the port's rest; round-r9: rested 22 yd from the port's rest); the planner no longer tries those lines from those spots.
  - stroke 2 from the sand (3iron): 3 times (round-r11: hazard 1; round-r6: hazard 1; round-r9: hazard 1); the planner no longer tries those lines from those spots.
- Hole 8 (par 3): 12 rounds, -1 ×11, par ×1.
- Hole 9 (par 5): 12 rounds, -2 ×3, -1 ×9.
  - stroke 3 from the rough (7iron): 2 times (round-r10: rested 25 yd from the port's rest; round-r4: rested 20 yd from the port's rest); the planner no longer tries those lines from those spots.

Since 2026-10-22 the planner aims shots from rough and sand 2 deg left of where it wants them to start (WSR's lie yaw, fitted on 86 rough strokes), tries every candidate (no 300 cap), leans 1 yd against rough and 3 against sand when two rests' second shots are about as good, and remembers every stroke: failed lines are skipped from the same spot, and a stroke that repeats an earlier one (same spot, club, power, line and wind) is corrected by what that one did.
<!-- /lessons -->

## Attempts (newest first)

### Attempt 20: 6-2-4 (E), 2026-10-22 05:43 UTC

Hole 7 (par 4): 6 by the game's count (1 penalty).
- 7.1 from the tee, 396.2 yd, wind 28 mph (dir 2): driver 1.00, launched 8.0 deg left of the pin line; planned: fairway, 106.3 yd from the pin. Result: tee, 150.5 yd from the pin; against the port's flight -51.3 yd along, -19.9 across. **miss**: rested 55 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: -2.0 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -5.0 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -10.3 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -16.0 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -19.2 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.2 from the tee, 396.2 yd, wind 28 mph (dir 2): spoon 0.98, launched 3.0 deg left of the pin line; planned: rough, 141.4 yd from the pin. Result: rough, 141.3 yd from the pin; against the port's flight -10.2 yd along, -4.8 across. **avoided**: lines that failed from here before, not tried: -2.0 deg (rested 22 yd from the port's rest, round-r11 h7 k1); 8.0 deg (the game put the ball back where it was hit (out of bounds), resort-c/attempt-20 h7 k1); -5.0 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -10.3 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -16.0 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -19.2 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.3 from the rough, 141.3 yd, wind 28 mph (dir 2): 3iron 0.67, launched 13.0 deg left of the pin line; planned: rough, 18.6 yd from the pin. Result: rough, 18.8 yd from the pin; against the port's flight +9.1 yd along, +5.2 across.
- 7.4 from the rough, 18.8 yd, wind 28 mph (dir 2): wedge 0.18, launched 4.0 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 9.3 yd from the pin; against the port's flight -0.4 yd along, +0.1 across. **assist**: the game launched it at 0.113, not the swung 0.180 (WSR's pin-power assist on a partial swing).
- 7.5 from the green, 9.3 yd, wind 28 mph (dir 2): putter 0.519, aimed -2.325 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 155.7 yd, wind 30 mph (dir 3): 7iron 0.97, launched 13.0 deg left of the pin line; planned: green, 2.3 yd from the pin. Result: green, 2.3 yd from the pin; against the port's flight +0.6 yd along, +6.0 across. **avoided**: lines that failed from here before, not tried: -0.8 deg (rested 42 yd from the port's rest, resort-c/attempt-6 h8 k1).
- 8.2 from the green, 2.3 yd, wind 30 mph (dir 3): putter 0.270, aimed +1.05 deg of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 563.2 yd, wind 20 mph (dir 7): driver 1.00, launched 13.0 deg right of the pin line; planned: fairway, 317.3 yd from the pin. Result: fairway, 317.2 yd from the pin; against the port's flight +7.9 yd along, -6.5 across.
- 9.2 from the fairway, 317.2 yd, wind 20 mph (dir 7): driver 0.73, launched 10.0 deg right of the pin line; planned: rough, 97.7 yd from the pin. Result: rough, 97.6 yd from the pin; against the port's flight -2.4 yd along, -0.3 across.
- 9.3 from the rough, 97.6 yd, wind 20 mph (dir 7): 5iron 0.57, launched 6.0 deg right of the pin line; planned: green, 0.6 yd from the pin. Result: green, 0.7 yd from the pin; against the port's flight +9.8 yd along, +0.7 across.
- 9.4 from the green, 0.7 yd, wind 20 mph (dir 7): putter 0.154, aimed -0.975 deg of the cup. Result: HOLED.

### Attempt 19: 5-3-4 (E), 2026-10-22 05:38 UTC

Hole 7 (par 4): 5 by the game's count (1 penalty).
- 7.1 from the tee, 392.1 yd, wind 22 mph (dir 3): 3iron 0.90, launched 2.0 deg left of the pin line; planned: rough, 167.8 yd from the pin. Result: sand, 162.1 yd from the pin; against the port's flight +5.7 yd along, +0.9 across. **avoided**: lines that failed from here before, not tried: -1.1 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -4.0 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -9.4 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -15.1 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -18.2 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.2 from the sand, 162.1 yd, wind 22 mph (dir 3): 3iron 0.43, launched 20.0 deg right of the pin line; planned: fairway, 67.4 yd from the pin. Result: a penalty drop, 67.5 yd from the pin; against the port's flight +9.9 yd along, -2.5 across. **hazard**: into water (a penalty stroke); the line is not tried again from there.
- 7.3 from the rough, 67.5 yd, wind 22 mph (dir 3): 7iron 0.38, launched 6.0 deg left of the pin line; planned: green, 0.9 yd from the pin. Result: green, 3.4 yd from the pin; against the port's flight +3.7 yd along, +0.0 across.
- 7.4 from the green, 3.4 yd, wind 22 mph (dir 3): putter 0.331, aimed -0.275 deg of the cup. Result: HOLED.

Hole 8 (par 3): 3 by the game's count.
- 8.1 from the tee, 167.6 yd, wind 30 mph (dir 5): 7iron 0.98, launched 10.0 deg right of the pin line; planned: green, 1.6 yd from the pin. Result: fringe, 7.6 yd from the pin; against the port's flight +7.7 yd along, -2.6 across. **avoided**: lines that failed from here before, not tried: -4.0 deg (rested 42 yd from the port's rest, resort-c/attempt-6 h8 k1).
- 8.2 from the fringe, 7.6 yd, wind 30 mph (dir 5): putter 0.335, aimed ? of the cup. Result: green, 0.5 yd from the pin. **putt**: missed from 7.6 yd: rests 0.5 yd from the cup (the read: (the port's putt over the KCL line)).
- 8.3 from the green, 0.5 yd, wind 30 mph (dir 5): putter 0.154, aimed -0.7 deg of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 563.2 yd, wind 24 mph (dir 7): driver 1.00, launched 10.0 deg right of the pin line; planned: fairway, 319.3 yd from the pin. Result: rough, 312.6 yd from the pin; against the port's flight +5.6 yd along, -5.3 across.
- 9.2 from the rough, 312.6 yd, wind 24 mph (dir 7): driver 0.67, launched 16.0 deg right of the pin line; planned: fairway, 111 yd from the pin. Result: fairway, 111.0 yd from the pin; against the port's flight +1.9 yd along, -1.6 across.
- 9.3 from the fairway, 111.0 yd, wind 24 mph (dir 7): 7iron 0.76, launched 10.0 deg right of the pin line; planned: green, 1.4 yd from the pin. Result: green, 1.3 yd from the pin; against the port's flight +4.0 yd along, -1.3 across.
- 9.4 from the green, 1.3 yd, wind 24 mph (dir 7): putter 0.202, aimed +0.15 deg of the cup. Result: HOLED.

### Attempt 18: 4-2-4 (-2), 2026-10-22 05:33 UTC

Hole 7 (par 4): 4 by the game's count.
- 7.1 from the tee, 387.9 yd, wind 30 mph (dir 7): driver 0.76, launched 14.1 deg right of the pin line; planned: rough, 176.3 yd from the pin. Result: rough, 177.6 yd from the pin; against the port's flight -2.9 yd along, -2.6 across. **avoided**: lines that failed from here before, not tried: -2.9 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -5.8 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -11.2 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -16.8 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -20.0 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.2 from the rough, 177.6 yd, wind 30 mph (dir 7): spoon 0.73, launched 13.0 deg right of the pin line; planned: rough, 29.4 yd from the pin. Result: rough, 31.4 yd from the pin; against the port's flight +5.3 yd along, -1.0 across.
- 7.3 from the rough, 31.4 yd, wind 30 mph (dir 7): wedge 0.29, launched 3.0 deg right of the pin line; planned: green, 0.5 yd from the pin. Result: green, 2.9 yd from the pin; against the port's flight -0.7 yd along, +2.8 across.
- 7.4 from the green, 2.9 yd, wind 30 mph (dir 7): putter 0.268, aimed -0.4 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 155.7 yd, wind 28 mph (dir 2): 3iron 0.70, launched 9.3 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 4.6 yd from the pin; against the port's flight -0.2 yd along, +4.3 across. **avoided**: lines that failed from here before, not tried: -0.8 deg (rested 42 yd from the port's rest, resort-c/attempt-6 h8 k1).
- 8.2 from the green, 4.6 yd, wind 28 mph (dir 2): putter 0.380, aimed +3.775 deg of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 563.2 yd, wind 26 mph (dir 1): driver 1.00, launched 4.0 deg right of the pin line; planned: fairway, 310 yd from the pin. Result: fairway, 313.6 yd from the pin; against the port's flight -4.5 yd along, -3.4 across.
- 9.2 from the fairway, 313.6 yd, wind 26 mph (dir 1): driver 0.64, launched 6.0 deg right of the pin line; planned: fairway, 110 yd from the pin. Result: rough, 107.6 yd from the pin; against the port's flight +2.3 yd along, -0.6 across.
- 9.3 from the rough, 107.6 yd, wind 26 mph (dir 1): 5iron 0.70, launched 4.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 1.0 yd from the pin; against the port's flight +0.6 yd along, +1.1 across.
- 9.4 from the green, 1.0 yd, wind 26 mph (dir 1): putter 0.171, aimed -0.125 deg of the cup. Result: HOLED.

### Attempt 17: 4-2-4 (-2), 2026-10-22 05:28 UTC

Hole 7 (par 4): 4 by the game's count.
- 7.1 from the tee, 392.1 yd, wind 30 mph (dir 6): driver 0.82, launched 21.3 deg right of the pin line; planned: fairway, 160.9 yd from the pin. Result: fairway, 160.8 yd from the pin; against the port's flight +7.8 yd along, -4.7 across. **repeat**: planned from resort-c/attempt-6 h7 k1's identical stroke (+7.8 along, -4.8 across the port). **avoided**: lines that failed from here before, not tried: -1.1 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -4.0 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -9.4 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -15.1 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -18.2 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.2 from the fairway, 160.8 yd, wind 30 mph (dir 6): spoon 0.56, launched 2.0 deg right of the pin line; planned: green, 21.7 yd from the pin. Result: rough, 30.3 yd from the pin; against the port's flight +8.2 yd along, -3.1 across. **avoided**: lines that failed from here before, not tried: -5.5 deg (rested 16 yd from the port's rest, resort-c/attempt-12 h7 k2); -10.0 deg (rested 19 yd from the port's rest, resort-c/attempt-6 h7 k2).
- 7.3 from the rough, 30.3 yd, wind 30 mph (dir 6): wedge 0.43, launched 10.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 0.4 yd from the pin; against the port's flight +0.1 yd along, +0.6 across.
- 7.4 from the green, 0.4 yd, wind 30 mph (dir 6): putter 0.147, aimed -0.75 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 162.6 yd, wind 22 mph (dir 7): 3iron 0.78, launched 6.0 deg right of the pin line; planned: green, 2.9 yd from the pin. Result: green, 1.1 yd from the pin; against the port's flight +2.3 yd along, +2.4 across. **avoided**: lines that failed from here before, not tried: -3.1 deg (rested 42 yd from the port's rest, resort-c/attempt-6 h8 k1).
- 8.2 from the green, 1.1 yd, wind 22 mph (dir 7): putter 0.176, aimed -0.125 deg of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 555.8 yd, wind 28 mph (dir 3): driver 0.97, launched 10.0 deg right of the pin line; planned: fairway, 255.1 yd from the pin. Result: fairway, 257.8 yd from the pin; against the port's flight -7.6 yd along, -9.2 across.
- 9.2 from the fairway, 257.8 yd, wind 28 mph (dir 3): driver 0.91, launched 6.0 deg left of the pin line; planned: green, 1.2 yd from the pin. Result: sand, 31.9 yd from the pin; against the port's flight +28.9 yd along, +12.9 across. **miss**: rested 32 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 9.3 from the sand, 31.9 yd, wind 28 mph (dir 3): wedge 0.30, launched 5.0 deg right of the pin line; planned: green, 0.3 yd from the pin. Result: green, 5.0 yd from the pin; against the port's flight -1.4 yd along, -4.6 across.
- 9.4 from the green, 5.0 yd, wind 28 mph (dir 3): putter 0.384, aimed +4.675 deg of the cup. Result: HOLED.

### Attempt 16: 4-2-6 (E), 2026-10-22 05:23 UTC

Hole 7 (par 4): 4 by the game's count.
- 7.1 from the tee, 396.2 yd, wind 28 mph (dir 6): driver 0.82, launched 22.2 deg right of the pin line; planned: fairway, 167.5 yd from the pin. Result: fairway, 167.4 yd from the pin; against the port's flight +8.0 yd along, -4.6 across. **repeat**: planned from resort-c/attempt-14 h7 k1's identical stroke (+8 along, -4.6 across the port). **avoided**: lines that failed from here before, not tried: -2.0 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -5.0 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -10.3 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -16.0 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -19.2 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.2 from the fairway, 167.4 yd, wind 28 mph (dir 6): spoon 0.57, launched 4.0 deg right of the pin line; planned: green, 13.7 yd from the pin. Result: rough, 23.1 yd from the pin; against the port's flight +8.7 yd along, -3.4 across. **avoided**: lines that failed from here before, not tried: -7.5 deg (rested 16 yd from the port's rest, resort-c/attempt-12 h7 k2); -12.0 deg (rested 19 yd from the port's rest, resort-c/attempt-6 h7 k2).
- 7.3 from the rough, 23.1 yd, wind 28 mph (dir 6): wedge 0.28, launched 8.0 deg left of the pin line; planned: green, 0.5 yd from the pin. Result: green, 2.0 yd from the pin; against the port's flight +1.1 yd along, +1.4 across.
- 7.4 from the green, 2.0 yd, wind 28 mph (dir 6): putter 0.256, aimed +1.325 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 162.6 yd, wind 24 mph (dir 4): 5iron 0.76, launched 2.0 deg left of the pin line; planned: green, 0.7 yd from the pin. Result: green, 0.5 yd from the pin; against the port's flight +0.2 yd along, +1.2 across. **repeat**: planned from resort-c/attempt-10 h8 k1's identical stroke (+0.2 along, +1.2 across the port). **avoided**: lines that failed from here before, not tried: -3.1 deg (rested 42 yd from the port's rest, resort-c/attempt-6 h8 k1).
- 8.2 from the green, 0.5 yd, wind 24 mph (dir 4): putter 0.154, aimed +0.375 deg of the cup. Result: HOLED.

Hole 9 (par 5): 6 by the game's count.
- 9.1 from the tee, 555.8 yd, wind 20 mph (dir 5): driver 0.96, launched 11.7 deg right of the pin line; planned: rough, 273.7 yd from the pin. Result: rough, 272.2 yd from the pin; against the port's flight +0.4 yd along, -4.1 across.
- 9.2 from the rough, 272.2 yd, wind 20 mph (dir 5): spoon 0.59, launched 16.0 deg right of the pin line; planned: rough, 89.3 yd from the pin. Result: rough, 89.9 yd from the pin; against the port's flight -2.0 yd along, -1.4 across.
- 9.3 from the rough, 89.9 yd, wind 20 mph (dir 5): 3iron 0.41, launched 1.0 deg right of the pin line; planned: green, 0.6 yd from the pin. Result: fringe, 27.8 yd from the pin; against the port's flight +26.1 yd along, -8.2 across. **miss**: rested 27 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: -9.3 deg (rested 25 yd from the port's rest, round-r10 h9 k3).
- 9.4 from the fringe, 27.8 yd, wind 20 mph (dir 5): putter 1.039, aimed ? of the cup. Result: green, 3.5 yd from the pin. **putt**: missed from 27.8 yd: rests 3.5 yd from the cup (the read: (the port's putt over the KCL line)).
- 9.5 from the green, 3.5 yd, wind 20 mph (dir 5): putter 0.224, aimed -7.2 deg of the cup. Result: green, 0.9 yd from the pin. **putt**: missed from 3.5 yd: rests 0.9 yd from the cup (the read: (WSR's tick over the green's KCL, 1099 ms): aim -7.20 deg right of the cup, putter 0.2240 (holes 0.190-0.258; the app's read -13.10 deg 0.1668)).
- 9.6 from the green, 0.9 yd, wind 20 mph (dir 5): putter 0.174, aimed -2.725 deg of the cup. Result: HOLED.

### Attempt 15: 4-2-4 (-2), 2026-10-22 05:18 UTC

Hole 7 (par 4): 4 by the game's count.
- 7.1 from the tee, 396.2 yd, wind 28 mph (dir 6): driver 0.82, launched 22.3 deg right of the pin line; planned: fairway, 167.9 yd from the pin. Result: fairway, 167.8 yd from the pin; against the port's flight +7.9 yd along, -4.6 across. **repeat**: planned from resort-c/attempt-10 h7 k1's identical stroke (+7.9 along, -4.6 across the port). **avoided**: lines that failed from here before, not tried: -2.0 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -5.0 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -10.3 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -16.0 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -19.2 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.2 from the fairway, 167.8 yd, wind 28 mph (dir 6): 3iron 0.74, launched 4.0 deg right of the pin line; planned: green, 18.1 yd from the pin. Result: rough, 21.5 yd from the pin; against the port's flight +7.3 yd along, +0.1 across. **avoided**: lines that failed from here before, not tried: -7.7 deg (rested 16 yd from the port's rest, resort-c/attempt-12 h7 k2); -12.2 deg (rested 19 yd from the port's rest, resort-c/attempt-6 h7 k2).
- 7.3 from the rough, 21.5 yd, wind 28 mph (dir 6): wedge 0.27, launched 4.0 deg left of the pin line; planned: green, 0.1 yd from the pin. Result: green, 3.5 yd from the pin; against the port's flight -0.1 yd along, +3.3 across.
- 7.4 from the green, 3.5 yd, wind 28 mph (dir 6): putter 0.348, aimed +2.425 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 162.6 yd, wind 24 mph (dir 4): 5iron 0.76, launched 2.0 deg left of the pin line; planned: green, 0.7 yd from the pin. Result: green, 0.5 yd from the pin; against the port's flight +0.2 yd along, +1.2 across. **repeat**: planned from resort-c/attempt-10 h8 k1's identical stroke (+0.2 along, +1.2 across the port). **avoided**: lines that failed from here before, not tried: -3.1 deg (rested 42 yd from the port's rest, resort-c/attempt-6 h8 k1).
- 8.2 from the green, 0.5 yd, wind 24 mph (dir 4): putter 0.154, aimed +0.375 deg of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 555.8 yd, wind 20 mph (dir 5): driver 0.99, launched 11.7 deg right of the pin line; planned: rough, 264.7 yd from the pin. Result: rough, 266.6 yd from the pin; against the port's flight -3.0 yd along, -3.1 across.
- 9.2 from the rough, 266.6 yd, wind 20 mph (dir 5): driver 0.47, launched 13.0 deg right of the pin line; planned: rough, 87.4 yd from the pin. Result: rough, 86.6 yd from the pin; against the port's flight +0.2 yd along, -1.1 across.
- 9.3 from the rough, 86.6 yd, wind 20 mph (dir 5): spoon 0.32, launched 1.0 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 1.4 yd from the pin; against the port's flight -1.8 yd along, -0.0 across. **avoided**: lines that failed from here before, not tried: -7.8 deg (rested 20 yd from the port's rest, round-r4 h9 k3).
- 9.4 from the green, 1.4 yd, wind 20 mph (dir 5): putter 0.231, aimed -0.35 deg of the cup. Result: HOLED.

### Attempt 14: 4-2-4 (-2), 2026-10-22 05:13 UTC

Hole 7 (par 4): 4 by the game's count.
- 7.1 from the tee, 396.2 yd, wind 28 mph (dir 6): driver 0.82, launched 22.2 deg right of the pin line; planned: fairway, 167.6 yd from the pin. Result: fairway, 167.4 yd from the pin; against the port's flight +8.0 yd along, -4.6 across. **repeat**: planned from resort-c/attempt-7 h7 k1's identical stroke (+7.9 along, -4.6 across the port). **avoided**: lines that failed from here before, not tried: -2.0 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -5.0 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -10.3 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -16.0 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -19.2 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.2 from the fairway, 167.4 yd, wind 28 mph (dir 6): spoon 0.56, launched 4.0 deg right of the pin line; planned: green, 11.8 yd from the pin. Result: rough, 18.3 yd from the pin; against the port's flight +5.2 yd along, -4.1 across. **avoided**: lines that failed from here before, not tried: -7.5 deg (rested 16 yd from the port's rest, resort-c/attempt-12 h7 k2); -12.0 deg (rested 19 yd from the port's rest, resort-c/attempt-6 h7 k2).
- 7.3 from the rough, 18.3 yd, wind 28 mph (dir 6): wedge 0.21, launched 8.0 deg left of the pin line; planned: green, 0.4 yd from the pin. Result: green, 8.4 yd from the pin; against the port's flight -0.0 yd along, +0.0 across. **assist**: the game launched it at 0.134, not the swung 0.210 (WSR's pin-power assist on a partial swing).
- 7.4 from the green, 8.4 yd, wind 28 mph (dir 6): putter 0.479, aimed -2.925 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 167.6 yd, wind 24 mph (dir 4): 3iron 0.66, launched 2.0 deg left of the pin line; planned: green, 1.5 yd from the pin. Result: green, 5.6 yd from the pin; against the port's flight +4.6 yd along, +3.5 across. **avoided**: lines that failed from here before, not tried: -4.0 deg (rested 42 yd from the port's rest, resort-c/attempt-6 h8 k1).
- 8.2 from the green, 5.6 yd, wind 24 mph (dir 4): putter 0.367, aimed -0.025 deg of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 563.2 yd, wind 20 mph (dir 5): driver 0.98, launched 13.0 deg right of the pin line; planned: rough, 279.1 yd from the pin. Result: rough, 279.0 yd from the pin; against the port's flight -0.8 yd along, -2.8 across. **repeat**: planned from resort-c/attempt-7 h9 k1's identical stroke (-0.8 along, -2.8 across the port).
- 9.2 from the rough, 279.0 yd, wind 20 mph (dir 5): driver 0.43, launched 13.0 deg right of the pin line; planned: rough, 103 yd from the pin. Result: rough, 102.9 yd from the pin; against the port's flight -0.6 yd along, -0.3 across. **repeat**: planned from resort-c/attempt-10 h9 k2's identical stroke (-0.6 along, -0.3 across the port).
- 9.3 from the rough, 102.9 yd, wind 20 mph (dir 5): 5iron 0.49, launched 4.0 deg right of the pin line; planned: green, 1.8 yd from the pin. Result: green, 7.0 yd from the pin; against the port's flight +5.0 yd along, -1.6 across.
- 9.4 from the green, 7.0 yd, wind 20 mph (dir 5): putter 0.407, aimed -3.425 deg of the cup. Result: HOLED.

### Attempt 13: 3-3-4 (-2), 2026-10-22 05:09 UTC

Hole 7 (par 4): 3 by the game's count.
- 7.1 from the tee, 387.9 yd, wind 24 mph (dir 1): driver 0.77, launched 0.0 deg left of the pin line; planned: rough, 157.7 yd from the pin. Result: rough, 152.6 yd from the pin; against the port's flight +5.2 yd along, +0.7 across. **avoided**: lines that failed from here before, not tried: -2.9 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -5.8 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -11.2 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -16.8 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -20.0 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.2 from the rough, 152.6 yd, wind 24 mph (dir 1): 3iron 0.75, launched 6.0 deg left of the pin line; planned: green, 1.2 yd from the pin. Result: green, 8.5 yd from the pin; against the port's flight +6.9 yd along, +3.2 across.
- 7.3 from the green, 8.5 yd, wind 24 mph (dir 1): putter 0.478, aimed +0.775 deg of the cup. Result: HOLED.

Hole 8 (par 3): 3 by the game's count.
- 8.1 from the tee, 167.6 yd, wind 28 mph (dir 6): 3iron 0.72, launched 10.0 deg right of the pin line; planned: green, 0.5 yd from the pin. Result: fringe, 6.9 yd from the pin; against the port's flight +6.4 yd along, -2.1 across. **avoided**: lines that failed from here before, not tried: -4.0 deg (rested 42 yd from the port's rest, resort-c/attempt-6 h8 k1).
- 8.2 from the fringe, 6.9 yd, wind 28 mph (dir 6): putter 0.297, aimed ? of the cup. Result: green, 0.5 yd from the pin. **putt**: missed from 6.9 yd: rests 0.5 yd from the cup (the read: (the port's putt over the KCL line)).
- 8.3 from the green, 0.5 yd, wind 28 mph (dir 6): putter 0.151, aimed -0.175 deg of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 555.8 yd, wind 22 mph (dir 3): driver 1.00, launched 10.0 deg right of the pin line; planned: fairway, 251.9 yd from the pin. Result: fairway, 248.4 yd from the pin; against the port's flight +0.1 yd along, -7.8 across.
- 9.2 from the fairway, 248.4 yd, wind 22 mph (dir 3): spoon 0.98, launched 6.0 deg left of the pin line; planned: green, 0.6 yd from the pin. Result: sand, 32.5 yd from the pin; against the port's flight +30.8 yd along, +12.1 across. **miss**: rested 33 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 9.3 from the sand, 32.5 yd, wind 22 mph (dir 3): wedge 0.30, launched 5.0 deg right of the pin line; planned: green, 0.3 yd from the pin. Result: green, 5.6 yd from the pin; against the port's flight -3.1 yd along, -4.8 across.
- 9.4 from the green, 5.6 yd, wind 22 mph (dir 3): putter 0.360, aimed +6.55 deg of the cup. Result: HOLED.

### Attempt 12: 3-2-4 (-3), 2026-10-22 05:04 UTC

Hole 7 (par 4): 3 by the game's count.
- 7.1 from the tee, 387.9 yd, wind 30 mph (dir 6): driver 0.82, launched 23.0 deg right of the pin line; planned: fairway, 161.7 yd from the pin. Result: fairway, 161.6 yd from the pin; against the port's flight +7.8 yd along, -4.8 across. **repeat**: planned from resort-c/attempt-6 h7 k1's identical stroke (+7.8 along, -4.8 across the port). **avoided**: lines that failed from here before, not tried: -2.9 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -5.8 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -11.2 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -16.8 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -20.0 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.2 from the fairway, 161.6 yd, wind 30 mph (dir 6): 3iron 0.69, launched 10.0 deg right of the pin line; planned: green, 2.6 yd from the pin. Result: green, 15.8 yd from the pin; against the port's flight +12.8 yd along, -8.8 across. **miss**: rested 16 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: -14.5 deg (rested 19 yd from the port's rest, resort-c/attempt-6 h7 k2).
- 7.3 from the green, 15.8 yd, wind 30 mph (dir 6): putter 0.809, aimed -0.975 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 167.6 yd, wind 22 mph (dir 5): 5iron 0.81, launched 8.0 deg right of the pin line; planned: green, 3.4 yd from the pin. Result: fringe, 8.8 yd from the pin; against the port's flight +7.7 yd along, -1.1 across. **avoided**: lines that failed from here before, not tried: -4.0 deg (rested 42 yd from the port's rest, resort-c/attempt-6 h8 k1).
- 8.2 from the fringe, 8.8 yd, wind 22 mph (dir 5): putter 0.430, aimed ? of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 558.0 yd, wind 28 mph (dir 1): driver 0.96, launched 4.0 deg right of the pin line; planned: fairway, 311.7 yd from the pin. Result: fairway, 316.6 yd from the pin; against the port's flight -5.8 yd along, -3.1 across.
- 9.2 from the fairway, 316.6 yd, wind 28 mph (dir 1): driver 0.73, launched 0.0 deg left of the pin line; planned: rough, 97.7 yd from the pin. Result: rough, 98.6 yd from the pin; against the port's flight -0.9 yd along, +0.2 across.
- 9.3 from the rough, 98.6 yd, wind 28 mph (dir 1): 3iron 0.43, launched 3.0 deg left of the pin line; planned: green, 1.5 yd from the pin. Result: green, 5.8 yd from the pin; against the port's flight +4.8 yd along, +1.2 across.
- 9.4 from the green, 5.8 yd, wind 28 mph (dir 1): putter 0.434, aimed +1.15 deg of the cup. Result: HOLED.

### Attempt 11: 3-2-3 (-4), 2026-10-22 05:00 UTC

Hole 7 (par 4): 3 by the game's count.
- 7.1 from the tee, 396.2 yd, wind 26 mph (dir 3): spoon 0.70, launched 1.0 deg left of the pin line; planned: rough, 168.9 yd from the pin. Result: rough, 167.9 yd from the pin; against the port's flight +0.9 yd along, +0.7 across. **avoided**: lines that failed from here before, not tried: -2.0 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -5.0 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -10.3 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -16.0 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -19.2 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.2 from the rough, 167.9 yd, wind 26 mph (dir 3): 3iron 0.66, launched 6.0 deg left of the pin line; planned: green, 7.5 yd from the pin. Result: green, 6.8 yd from the pin; against the port's flight +11.8 yd along, -2.3 across.
- 7.3 from the green, 6.8 yd, wind 26 mph (dir 3): putter 0.409, aimed -1.025 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 162.6 yd, wind 20 mph (dir 6): 3iron 0.70, launched 8.0 deg right of the pin line; planned: green, 1.9 yd from the pin. Result: green, 6.2 yd from the pin; against the port's flight -5.3 yd along, +3.4 across. **avoided**: lines that failed from here before, not tried: -3.1 deg (rested 42 yd from the port's rest, resort-c/attempt-6 h8 k1).
- 8.2 from the green, 6.2 yd, wind 20 mph (dir 6): putter 0.517, aimed +0.85 deg of the cup. Result: HOLED.

Hole 9 (par 5): 3 by the game's count.
- 9.1 from the tee, 555.8 yd, wind 30 mph (dir 4): driver 0.98, launched 8.6 deg right of the pin line; planned: fairway, 229.7 yd from the pin. Result: rough, 240.9 yd from the pin; against the port's flight -13.4 yd along, -5.2 across.
- 9.2 from the rough, 240.9 yd, wind 30 mph (dir 4): driver 0.74, launched 2.0 deg left of the pin line; planned: green, 21.9 yd from the pin. Result: green, 22.8 yd from the pin; against the port's flight -0.8 yd along, -3.4 across.
- 9.3 from the green, 22.8 yd, wind 30 mph (dir 4): putter 0.953, aimed -12.7 deg of the cup. Result: HOLED.

### Attempt 10: 4-2-4 (-2), 2026-10-22 04:55 UTC

Hole 7 (par 4): 4 by the game's count.
- 7.1 from the tee, 396.2 yd, wind 28 mph (dir 6): driver 0.82, launched 22.3 deg right of the pin line; planned: fairway, 167.9 yd from the pin. Result: fairway, 167.8 yd from the pin; against the port's flight +7.9 yd along, -4.6 across. **repeat**: planned from resort-c/attempt-8 h7 k1's identical stroke (+7.9 along, -4.6 across the port). **avoided**: lines that failed from here before, not tried: -2.0 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -5.0 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -10.3 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -16.0 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -19.2 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.2 from the fairway, 167.8 yd, wind 28 mph (dir 6): spoon 0.56, launched 6.0 deg right of the pin line; planned: green, 7.4 yd from the pin. Result: rough, 18.0 yd from the pin; against the port's flight +11.1 yd along, -2.5 across. **avoided**: lines that failed from here before, not tried: -12.2 deg (rested 19 yd from the port's rest, resort-c/attempt-6 h7 k2).
- 7.3 from the rough, 18.0 yd, wind 28 mph (dir 6): wedge 0.20, launched 10.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 8.4 yd from the pin; against the port's flight -0.3 yd along, -0.8 across. **assist**: the game launched it at 0.126, not the swung 0.200 (WSR's pin-power assist on a partial swing).
- 7.4 from the green, 8.4 yd, wind 28 mph (dir 6): putter 0.452, aimed +0.475 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 162.6 yd, wind 24 mph (dir 4): 5iron 0.76, launched 2.0 deg left of the pin line; planned: green, 0.6 yd from the pin. Result: green, 0.5 yd from the pin; against the port's flight +0.2 yd along, +1.2 across. **avoided**: lines that failed from here before, not tried: -3.1 deg (rested 42 yd from the port's rest, resort-c/attempt-6 h8 k1).
- 8.2 from the green, 0.5 yd, wind 24 mph (dir 4): putter 0.154, aimed +0.375 deg of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 563.2 yd, wind 20 mph (dir 5): driver 0.98, launched 13.0 deg right of the pin line; planned: rough, 279.1 yd from the pin. Result: rough, 279.0 yd from the pin; against the port's flight -0.8 yd along, -2.8 across. **repeat**: planned from resort-c/attempt-7 h9 k1's identical stroke (-0.8 along, -2.8 across the port).
- 9.2 from the rough, 279.0 yd, wind 20 mph (dir 5): driver 0.43, launched 13.0 deg right of the pin line; planned: rough, 102.9 yd from the pin. Result: rough, 103.0 yd from the pin; against the port's flight -0.6 yd along, -0.3 across. **repeat**: planned from resort-c/attempt-7 h9 k2's identical stroke (-0.6 along, -0.3 across the port).
- 9.3 from the rough, 103.0 yd, wind 20 mph (dir 5): 7iron 0.71, launched 5.0 deg right of the pin line; planned: green, 2.1 yd from the pin. Result: green, 11.2 yd from the pin; against the port's flight +8.0 yd along, -6.4 across.
- 9.4 from the green, 11.2 yd, wind 20 mph (dir 5): putter 0.603, aimed -3.975 deg of the cup. Result: HOLED.

### Attempt 9: 3-2-4 (-3), 2026-10-22 04:51 UTC

Hole 7 (par 4): 3 by the game's count.
- 7.1 from the tee, 387.9 yd, wind 22 mph (dir 5): driver 0.78, launched 23.1 deg right of the pin line; planned: fairway, 167.8 yd from the pin. Result: fairway, 158.3 yd from the pin; against the port's flight +9.3 yd along, -4.5 across. **avoided**: lines that failed from here before, not tried: -2.9 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -5.8 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -11.2 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -16.8 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -20.0 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.2 from the fairway, 158.3 yd, wind 22 mph (dir 5): 7iron 0.92, launched 4.0 deg right of the pin line; planned: green, 1.7 yd from the pin. Result: green, 4.0 yd from the pin; against the port's flight +3.3 yd along, +0.8 across.
- 7.3 from the green, 4.0 yd, wind 22 mph (dir 5): putter 0.312, aimed +0.325 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 162.6 yd, wind 30 mph (dir 2): 3iron 0.75, launched 10.0 deg left of the pin line; planned: green, 2.2 yd from the pin. Result: green, 7.3 yd from the pin; against the port's flight +4.2 yd along, +7.4 across. **avoided**: lines that failed from here before, not tried: -3.1 deg (rested 42 yd from the port's rest, resort-c/attempt-6 h8 k1).
- 8.2 from the green, 7.3 yd, wind 30 mph (dir 2): putter 0.397, aimed +4.05 deg of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 555.8 yd, wind 26 mph (dir 3): driver 1.00, launched 8.0 deg right of the pin line; planned: fairway, 244.7 yd from the pin. Result: fairway, 240.0 yd from the pin; against the port's flight +1.6 yd along, -8.0 across.
- 9.2 from the fairway, 240.0 yd, wind 26 mph (dir 3): spoon 0.94, launched 6.0 deg left of the pin line; planned: green, 0.9 yd from the pin. Result: sand, 31.8 yd from the pin; against the port's flight +30.3 yd along, +11.5 across. **miss**: rested 32 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 9.3 from the sand, 31.8 yd, wind 26 mph (dir 3): wedge 0.30, launched 5.0 deg right of the pin line; planned: green, 0.2 yd from the pin. Result: green, 4.9 yd from the pin; against the port's flight -1.2 yd along, -4.7 across.
- 9.4 from the green, 4.9 yd, wind 26 mph (dir 3): putter 0.385, aimed +4.725 deg of the cup. Result: HOLED.

### Attempt 8: 3-2-4 (-3), 2026-10-22 04:47 UTC

Hole 7 (par 4): 3 by the game's count.
- 7.1 from the tee, 387.9 yd, wind 28 mph (dir 6): driver 0.82, launched 23.1 deg right of the pin line; planned: fairway, 162.5 yd from the pin. Result: fairway, 162.4 yd from the pin; against the port's flight +7.9 yd along, -4.6 across. **repeat**: planned from resort-c/attempt-7 h7 k1's identical stroke (+7.9 along, -4.6 across the port). **avoided**: lines that failed from here before, not tried: -2.9 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -5.8 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -11.2 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -16.8 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -20.0 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.2 from the fairway, 162.4 yd, wind 28 mph (dir 6): 3iron 0.68, launched 8.0 deg right of the pin line; planned: green, 1.7 yd from the pin. Result: green, 9.3 yd from the pin; against the port's flight +9.2 yd along, -3.4 across. **avoided**: lines that failed from here before, not tried: -15.1 deg (rested 19 yd from the port's rest, resort-c/attempt-6 h7 k2).
- 7.3 from the green, 9.3 yd, wind 28 mph (dir 6): putter 0.515, aimed -0.225 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 167.6 yd, wind 26 mph (dir 5): 7iron 0.99, launched 8.0 deg right of the pin line; planned: green, 1.2 yd from the pin. Result: green, 6.0 yd from the pin; against the port's flight +6.4 yd along, +0.9 across. **avoided**: lines that failed from here before, not tried: -4.0 deg (rested 42 yd from the port's rest, resort-c/attempt-6 h8 k1).
- 8.2 from the green, 6.0 yd, wind 26 mph (dir 5): putter 0.402, aimed +2.225 deg of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 563.2 yd, wind 20 mph (dir 2): driver 1.00, launched 4.0 deg right of the pin line; planned: fairway, 286 yd from the pin. Result: fairway, 283.4 yd from the pin; against the port's flight +1.6 yd along, -4.3 across.
- 9.2 from the fairway, 283.4 yd, wind 20 mph (dir 2): driver 1.00, launched 8.0 deg left of the pin line; planned: green, 10.5 yd from the pin. Result: fringe, 15.4 yd from the pin; against the port's flight -5.4 yd along, +0.2 across.
- 9.3 from the fringe, 15.4 yd, wind 20 mph (dir 2): putter 0.994, aimed ? of the cup. Result: green, 2.2 yd from the pin. **putt**: missed from 15.4 yd: rests 2.2 yd from the cup (the read: (the port's putt over the KCL line)).
- 9.4 from the green, 2.2 yd, wind 20 mph (dir 2): putter 0.240, aimed +0.725 deg of the cup. Result: HOLED.

### Attempt 7: 4-2-4 (-2), 2026-10-22 04:43 UTC

Hole 7 (par 4): 4 by the game's count.
- 7.1 from the tee, 396.2 yd, wind 28 mph (dir 6): driver 0.82, launched 22.2 deg right of the pin line; planned: fairway, 176.6 yd from the pin. Result: fairway, 167.6 yd from the pin; against the port's flight +7.9 yd along, -4.6 across. **avoided**: lines that failed from here before, not tried: -2.0 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -5.0 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -10.3 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -16.0 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -19.2 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.2 from the fairway, 167.6 yd, wind 28 mph (dir 6): 3iron 0.71, launched 8.0 deg right of the pin line; planned: green, 3.9 yd from the pin. Result: green, 15.2 yd from the pin; against the port's flight +9.2 yd along, -7.3 across. **avoided**: lines that failed from here before, not tried: -12.1 deg (rested 19 yd from the port's rest, resort-c/attempt-6 h7 k2).
- 7.3 from the green, 15.2 yd, wind 28 mph (dir 6): putter 0.829, aimed -3.45 deg of the cup. Result: green, 3.4 yd from the pin. **putt**: missed from 15.2 yd: rests 3.4 yd from the cup (the read: (WSR's tick over the green's KCL, 1444 ms): aim -3.45 deg right of the cup, putter 0.8292 (holes 0.796-0.862; the app's read -3.45 deg 0.8282)).
- 7.4 from the green, 3.4 yd, wind 28 mph (dir 6): putter 0.291, aimed +1.675 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 155.7 yd, wind 24 mph (dir 4): 7iron 0.91, launched 2.0 deg left of the pin line; planned: green, 1.5 yd from the pin. Result: green, 3.5 yd from the pin; against the port's flight -0.5 yd along, +5.0 across. **avoided**: lines that failed from here before, not tried: -0.8 deg (rested 42 yd from the port's rest, resort-c/attempt-6 h8 k1).
- 8.2 from the green, 3.5 yd, wind 24 mph (dir 4): putter 0.347, aimed +2.425 deg of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 563.2 yd, wind 20 mph (dir 5): driver 0.98, launched 13.0 deg right of the pin line; planned: rough, 279.2 yd from the pin. Result: rough, 279.0 yd from the pin; against the port's flight -0.8 yd along, -2.8 across.
- 9.2 from the rough, 279.0 yd, wind 20 mph (dir 5): driver 0.43, launched 13.0 deg right of the pin line; planned: rough, 102.6 yd from the pin. Result: rough, 102.9 yd from the pin; against the port's flight -0.6 yd along, -0.3 across.
- 9.3 from the rough, 102.9 yd, wind 20 mph (dir 5): 7iron 0.60, launched 4.0 deg right of the pin line; planned: green, 0.1 yd from the pin. Result: green, 4.4 yd from the pin; against the port's flight +4.3 yd along, -0.8 across.
- 9.4 from the green, 4.4 yd, wind 20 mph (dir 5): putter 0.336, aimed -1.575 deg of the cup. Result: HOLED.

### Attempt 6: 3-2-3 (-4), 2026-10-22 04:39 UTC

Hole 7 (par 4): 3 by the game's count.
- 7.1 from the tee, 392.1 yd, wind 30 mph (dir 6): driver 0.82, launched 21.3 deg right of the pin line; planned: fairway, 170 yd from the pin. Result: fairway, 161.0 yd from the pin; against the port's flight +7.8 yd along, -4.8 across. **avoided**: lines that failed from here before, not tried: -1.1 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -4.0 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -9.4 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -15.1 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1); -18.2 deg (rested 51 yd from the port's rest, resort-c/attempt-5 h7 k1).
- 7.2 from the fairway, 161.0 yd, wind 30 mph (dir 6): 3iron 0.71, launched 10.0 deg right of the pin line; planned: green, 2.7 yd from the pin. Result: fringe, 20.3 yd from the pin; against the port's flight +17.4 yd along, -6.6 across. **miss**: rested 19 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 7.3 from the fringe, 20.3 yd, wind 30 mph (dir 6): putter 1.075, aimed ? of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 167.6 yd, wind 22 mph (dir 7): spoon 0.51, launched 4.0 deg right of the pin line; planned: green, 1.5 yd from the pin. Result: green, 7.2 yd from the pin; against the port's flight +42.4 yd along, +0.6 across. **miss**: rested 42 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 8.2 from the green, 7.2 yd, wind 22 mph (dir 7): putter 0.450, aimed +2.85 deg of the cup. Result: HOLED.

Hole 9 (par 5): 3 by the game's count.
- 9.1 from the tee, 558.0 yd, wind 28 mph (dir 3): driver 0.97, launched 10.0 deg right of the pin line; planned: fairway, 258.4 yd from the pin. Result: fairway, 257.3 yd from the pin; against the port's flight -3.4 yd along, -9.4 across.
- 9.2 from the fairway, 257.3 yd, wind 28 mph (dir 3): driver 0.84, launched 6.0 deg left of the pin line; planned: green, 0.8 yd from the pin. Result: green, 16.2 yd from the pin; against the port's flight +15.8 yd along, +4.7 across. **miss**: rested 16 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 9.3 from the green, 16.2 yd, wind 28 mph (dir 3): putter 0.806, aimed -1.05 deg of the cup. Result: HOLED.

### Attempt 5: 5-2-4 (-1), 2026-10-22 04:35 UTC

Hole 7 (par 4): 5 by the game's count (1 penalty).
- 7.1 from the tee, 387.9 yd, wind 30 mph (dir 6): driver 0.94, launched 20.0 deg right of the pin line; planned: rough, 134.9 yd from the pin. Result: rough, 182.8 yd from the pin; against the port's flight -48.3 yd along, +16.6 across. **miss**: rested 51 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: -2.9 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -5.8 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -11.2 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1); -16.8 deg (rested 57 yd from the port's rest, resort-c/attempt-4 h7 k1).
- 7.2 from the rough, 182.8 yd, wind 30 mph (dir 6): spoon 0.66, launched 8.0 deg right of the pin line; planned: green, 12.1 yd from the pin. Result: a penalty drop, 69.2 yd from the pin; against the port's flight -63.5 yd along, +7.3 across. **hazard**: into water (a penalty stroke); the line is not tried again from there.
- 7.3 from the rough, 69.2 yd, wind 30 mph (dir 6): 9iron 0.52, launched 10.0 deg right of the pin line; planned: green, 0.8 yd from the pin. Result: green, 4.9 yd from the pin; against the port's flight +3.5 yd along, -2.3 across.
- 7.4 from the green, 4.9 yd, wind 30 mph (dir 6): putter 0.342, aimed +0.35 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 162.6 yd, wind 22 mph (dir 5): 7iron 0.98, launched 8.0 deg right of the pin line; planned: green, 1.4 yd from the pin. Result: green, 5.6 yd from the pin; against the port's flight -2.5 yd along, +3.5 across.
- 8.2 from the green, 5.6 yd, wind 22 mph (dir 5): putter 0.493, aimed +3.225 deg of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 555.8 yd, wind 28 mph (dir 1): driver 1.00, launched 4.0 deg right of the pin line; planned: rough, 305.4 yd from the pin. Result: fairway, 307.6 yd from the pin; against the port's flight -3.3 yd along, -4.1 across.
- 9.2 from the fairway, 307.6 yd, wind 28 mph (dir 1): driver 0.50, launched 6.0 deg right of the pin line; planned: fairway, 117.9 yd from the pin. Result: fairway, 118.2 yd from the pin; against the port's flight -0.6 yd along, -0.7 across.
- 9.3 from the fairway, 118.2 yd, wind 28 mph (dir 1): 5iron 0.84, launched 6.0 deg left of the pin line; planned: green, 1.9 yd from the pin. Result: green, 2.5 yd from the pin; against the port's flight -3.9 yd along, -0.5 across.
- 9.4 from the green, 2.5 yd, wind 28 mph (dir 1): putter 0.289, aimed -1.125 deg of the cup. Result: HOLED.

### Attempt 4: 4-2-4 (-2), 2026-10-22 04:31 UTC

Hole 7 (par 4): 4 by the game's count.
- 7.1 from the tee, 396.2 yd, wind 28 mph (dir 2): driver 0.98, launched 16.0 deg right of the pin line; planned: rough, 173 yd from the pin. Result: rough, 190.3 yd from the pin; against the port's flight -54.5 yd along, -17.4 across. **miss**: rested 57 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: -2.0 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -5.0 deg (rested 28 yd from the port's rest, resort-c/attempt-3 h7 k1); -10.3 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1).
- 7.2 from the rough, 190.3 yd, wind 28 mph (dir 2): spoon 0.70, launched 6.0 deg left of the pin line; planned: green, 5.9 yd from the pin. Result: rough, 17.8 yd from the pin; against the port's flight +11.8 yd along, +0.2 across.
- 7.3 from the rough, 17.8 yd, wind 28 mph (dir 2): wedge 0.16, launched 8.0 deg right of the pin line; planned: green, 0 yd from the pin. Result: green, 9.6 yd from the pin; against the port's flight -0.1 yd along, -0.1 across. **assist**: the game launched it at 0.100, not the swung 0.160 (WSR's pin-power assist on a partial swing).
- 7.4 from the green, 9.6 yd, wind 28 mph (dir 2): putter 0.551, aimed -1.225 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 162.6 yd, wind 30 mph (dir 3): 3iron 0.65, launched 8.0 deg left of the pin line; planned: green, 0.5 yd from the pin. Result: green, 5.6 yd from the pin; against the port's flight -4.8 yd along, +3.1 across.
- 8.2 from the green, 5.6 yd, wind 30 mph (dir 3): putter 0.477, aimed +0.5 deg of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 555.8 yd, wind 20 mph (dir 7): driver 1.00, launched 10.0 deg right of the pin line; planned: fairway, 309.9 yd from the pin. Result: fairway, 303.8 yd from the pin; against the port's flight +4.9 yd along, -5.3 across.
- 9.2 from the fairway, 303.8 yd, wind 20 mph (dir 7): driver 0.72, launched 10.0 deg right of the pin line; planned: rough, 86.3 yd from the pin. Result: rough, 87.9 yd from the pin; against the port's flight -2.0 yd along, -0.4 across.
- 9.3 from the rough, 87.9 yd, wind 20 mph (dir 7): spoon 0.34, launched 2.0 deg right of the pin line; planned: green, 0.5 yd from the pin. Result: green, 1.5 yd from the pin; against the port's flight -1.3 yd along, -0.4 across.
- 9.4 from the green, 1.5 yd, wind 20 mph (dir 7): putter 0.236, aimed -0.55 deg of the cup. Result: HOLED.

### Attempt 3: 3-2-4 (-3), 2026-10-22 04:27 UTC

Hole 7 (par 4): 3 by the game's count.
- 7.1 from the tee, 392.1 yd, wind 24 mph (dir 3): driver 1.00, launched 4.0 deg right of the pin line; planned: fairway, 92.5 yd from the pin. Result: sand, 114.6 yd from the pin; against the port's flight -27.5 yd along, -4.6 across. **miss**: rested 28 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: -1.1 deg (rested 22 yd from the port's rest, round-r11 h7 k1); -9.4 deg (rested 33 yd from the port's rest, resort-c/attempt-2 h7 k1).
- 7.2 from the sand, 114.6 yd, wind 24 mph (dir 3): 3iron 0.45, launched 6.0 deg left of the pin line; planned: green, 11.2 yd from the pin. Result: green, 12.6 yd from the pin; against the port's flight +1.1 yd along, -2.6 across.
- 7.3 from the green, 12.6 yd, wind 24 mph (dir 3): putter 0.753, aimed -2.8 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 162.6 yd, wind 28 mph (dir 2): 3iron 0.75, launched 10.0 deg left of the pin line; planned: green, 2.6 yd from the pin. Result: green, 3.5 yd from the pin; against the port's flight +3.0 yd along, +5.1 across.
- 8.2 from the green, 3.5 yd, wind 28 mph (dir 2): putter 0.265, aimed +2.375 deg of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 558.0 yd, wind 22 mph (dir 4): driver 0.97, launched 10.0 deg right of the pin line; planned: rough, 248.3 yd from the pin. Result: rough, 258.0 yd from the pin; against the port's flight -12.0 yd along, -5.1 across.
- 9.2 from the rough, 258.0 yd, wind 22 mph (dir 4): driver 0.41, launched 10.0 deg right of the pin line; planned: rough, 89.6 yd from the pin. Result: rough, 90.5 yd from the pin; against the port's flight -0.9 yd along, +0.4 across.
- 9.3 from the rough, 90.5 yd, wind 22 mph (dir 4): 9iron 0.74, launched 4.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 3.2 yd from the pin; against the port's flight -3.3 yd along, -0.4 across.
- 9.4 from the green, 3.2 yd, wind 22 mph (dir 4): putter 0.354, aimed -2.125 deg of the cup. Result: HOLED.

### Attempt 2: 4-2-4 (-2), 2026-10-22 04:23 UTC

Hole 7 (par 4): 4 by the game's count.
- 7.1 from the tee, 396.2 yd, wind 26 mph (dir 4): driver 0.96, launched 10.3 deg right of the pin line; planned: fairway, 95.3 yd from the pin. Result: sand, 124.2 yd from the pin; against the port's flight -32.5 yd along, +3.0 across. **miss**: rested 33 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: -2.0 deg (rested 22 yd from the port's rest, round-r11 h7 k1).
- 7.2 from the sand, 124.2 yd, wind 26 mph (dir 4): 3iron 0.45, launched 2.0 deg right of the pin line; planned: fringe, 11.2 yd from the pin. Result: fringe, 11.2 yd from the pin; against the port's flight -0.1 yd along, +0.1 across.
- 7.3 from the fringe, 11.2 yd, wind 26 mph (dir 4): putter 0.513, aimed ? of the cup. Result: green, 0.4 yd from the pin. **putt**: missed from 11.2 yd: rests 0.4 yd from the cup (the read: (the port's putt over the KCL line)).
- 7.4 from the green, 0.4 yd, wind 26 mph (dir 4): putter 0.076, aimed -16.775 deg of the cup. Result: HOLED.

Hole 8 (par 3): 2 by the game's count.
- 8.1 from the tee, 167.6 yd, wind 24 mph (dir 0): 3iron 0.90, launched 2.0 deg right of the pin line; planned: green, 1.3 yd from the pin. Result: green, 2.9 yd from the pin; against the port's flight +2.2 yd along, -1.3 across.
- 8.2 from the green, 2.9 yd, wind 24 mph (dir 0): putter 0.271, aimed +0.55 deg of the cup. Result: HOLED.

Hole 9 (par 5): 4 by the game's count.
- 9.1 from the tee, 558.0 yd, wind 30 mph (dir 2): driver 1.00, launched 0.0 deg right of the pin line; planned: fairway, 283.9 yd from the pin. Result: fairway, 280.1 yd from the pin; against the port's flight +3.5 yd along, -3.0 across.
- 9.2 from the fairway, 280.1 yd, wind 30 mph (dir 2): driver 0.99, launched 6.0 deg left of the pin line; planned: green, 19 yd from the pin. Result: sand, 21.6 yd from the pin; against the port's flight -10.4 yd along, -6.4 across.
- 9.3 from the sand, 21.6 yd, wind 30 mph (dir 2): wedge 0.37, launched 10.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 0.7 yd from the pin; against the port's flight -0.0 yd along, +0.9 across.
- 9.4 from the green, 0.7 yd, wind 30 mph (dir 2): putter 0.173, aimed +0.6 deg of the cup. Result: HOLED.

