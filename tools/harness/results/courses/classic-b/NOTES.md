# Classic B (holes 13, 14, 15, par 12)

Played over and over on one harness instance (tools/harness/course-supervisor.mjs), naturally: the game's own wind and pins (3-hole rounds use WSR's set B pins), club and aim by D-pad, the swing simulated through the game's power pipeline, the planner (round-planner.mjs) re-imported for every stroke. Goal: 6 under par (6 strokes). Written by course-notes.mjs after every attempt.

- Attempts finished: 20 (and 1 unfinished); best -4 (#2, 2-3-3); mean -2.9; last five -3 E -4 -3 -4.
- Hole 13 (par 3): best 2, mean 2.10 over 21.
- Hole 14 (par 5): best 3, mean 3.80 over 20.
- Hole 15 (par 4): best 3, mean 3.20 over 20.
- The planner's memory of these holes: 300 strokes from every round and attempt, 28 of them failed lines it no longer tries from their spots.

## What recurs

- Hole 13, strokes 15+ yd from the port's flight: #18 stroke 1 (3iron), #8 stroke 1 (5iron).
- Hole 14, penalties: #18 stroke 2 (3iron).
- Hole 14, strokes 15+ yd from the port's flight: #13 stroke 1 (spoon), #12 stroke 2 (driver), #9 stroke 3 (9iron).
- Hole 15, strokes 15+ yd from the port's flight: #15 stroke 2 (3iron), #12 stroke 2 (9iron), #5 stroke 2 (9iron), #4 stroke 2 (9iron), #2 stroke 2 (spoon).

<!-- lessons -->
## Lessons

From the 12 natural 18-hole rounds before these attempts (round-planner.mjs as it was then: no lie yaw, a 300-candidate cap, no memory):

- Hole 13 (par 3): 12 rounds, -1 ×12.
  - stroke 1 from the tee (5iron): 1 time (round18: rested 16 yd from the port's rest); the planner no longer tries those lines from those spots.
- Hole 14 (par 5): 12 rounds, -2 ×3, -1 ×4, par ×1, +1 ×2, +2 ×1, +3 ×1.
  - stroke 2 from the rough (driver): 3 times (round-r10: hazard 1; round-r11: hazard 1; round-r3: rested 36 yd from the port's rest); the planner no longer tries those lines from those spots.
  - stroke 3 from the rough (driver): 2 times (round-r10: hazard 1; round-r11: hazard 1); the planner no longer tries those lines from those spots.
  - stroke 4 from the rough (driver): 1 time (round-r11: rested 51 yd from the port's rest); the planner no longer tries those lines from those spots.
  - stroke 1 from the tee (driver): 3 times (round-r3: hazard 1; round-r4: rested 43 yd from the port's rest; round-r7: rested 43 yd from the port's rest); the planner no longer tries those lines from those spots.
  - stroke 3 from the fairway (spoon): 1 time (round-r3: rested 43 yd from the port's rest); the planner no longer tries those lines from those spots.
  - stroke 2 from the rough (7iron): 1 time (round-r4: hazard 1); the planner no longer tries those lines from those spots.
- Hole 15 (par 4): 12 rounds, -1 ×12.

Since 2026-10-22 the planner aims shots from rough and sand 2 deg left of where it wants them to start (WSR's lie yaw, fitted on 86 rough strokes), tries every candidate (no 300 cap), leans 1 yd against rough and 3 against sand when two rests' second shots are about as good, and remembers every stroke: failed lines are skipped from the same spot, and a stroke that repeats an earlier one (same spot, club, power, line and wind) is corrected by what that one did.
- 2026-10-22, attempt 3, hole 14: the tee shot (3-iron 1.00, 34 deg left of the pin line, 20 mph wind) stopped in the rough 1.4 yd behind tree t14-46's trunk. Every line at the pin hit that trunk, and the planner's trunk-gap rule (a flat 1 yd margin from the very first point of the path) ruled out every way out as well, so the old fallback (no tree check, no memory) flew the same driver into the trunk five times; the game put the ball back each time (out of bounds, a penalty each). Fixed at 04:31 UTC: the trunk margin grows from 0.2 yd at the ball to 1 yd by 8 yd out; when nothing passes the full rules the planner relaxes the margins in two levels and searches all round the ball before any fallback (from that spot it now chips out with a 5-iron 40 deg left, clear of every tree); a ball the game puts back where it was hit marks that line failed in the memory. Attempts 4 and 5 eagled the hole.
<!-- /lessons -->

## Attempts (newest first)

### Attempt 21: 2-3-3 (-4), 2026-10-22 05:44 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 145.7 yd, wind 14 mph (dir 0): driver 0.39, launched 3.0 deg left of the pin line; planned: green, 9.7 yd from the pin. Result: green, 9.7 yd from the pin; against the port's flight -0.8 yd along, -0.7 across. **avoided**: lines that failed from here before, not tried: -0.4 deg (rested 25 yd from the port's rest, classic-b/attempt-8 h13 k1); -4.5 deg (rested 31 yd from the port's rest, classic-b/attempt-18 h13 k1); -6.9 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 9.7 yd, wind 14 mph (dir 0): putter 0.660, aimed -2.1 deg of the cup. Result: HOLED.

Hole 14 (par 5): 3 by the game's count.
- 14.1 from the tee, 359.4 yd, wind 10 mph (dir 3): 3iron 0.96, launched 33.4 deg left of the pin line; planned: rough, 206.3 yd from the pin. Result: rough, 206.4 yd from the pin; against the port's flight +0.6 yd along, +2.5 across. **avoided**: lines that failed from here before, not tried: 11.1 deg (rested 43 yd from the port's rest, round-r4 h14 k1); 12.6 deg (hazard 1, round-r3 h14 k1); 36.3 deg (rested 43 yd from the port's rest, round-r7 h14 k1); 30.4 deg (rested 18 yd from the port's rest, classic-b/attempt-13 h14 k1).
- 14.2 from the rough, 206.4 yd, wind 10 mph (dir 3): driver 0.75, launched 4.0 deg right of the pin line; planned: fairway, 19.2 yd from the pin. Result: fairway, 19.3 yd from the pin; against the port's flight +4.4 yd along, -0.2 across.
- 14.3 from the fairway, 19.3 yd, wind 10 mph (dir 3): wedge 0.21, launched 3.0 deg left of the pin line; planned: green, 0.1 yd from the pin. Result: HOLED. **holed**: holed from 19 yd off the green.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 339.1 yd, wind 18 mph (dir 6): driver 1.00, launched 6.0 deg left of the pin line; planned: fairway, 95.2 yd from the pin. Result: fairway, 94.2 yd from the pin; against the port's flight -3.7 yd along, +3.0 across.
- 15.2 from the fairway, 94.2 yd, wind 18 mph (dir 6): 9iron 0.99, launched 8.0 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 0.3 yd from the pin; against the port's flight -2.6 yd along, +3.5 across.
- 15.3 from the green, 0.3 yd, wind 18 mph (dir 6): putter 0.150, aimed +0 deg of the cup. Result: HOLED.

### Attempt 20: 2-4-3 (-3), 2026-10-22 05:40 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 145.7 yd, wind 18 mph (dir 6): 5iron 0.79, launched 10.0 deg right of the pin line; planned: green, 1.9 yd from the pin. Result: green, 1.9 yd from the pin; against the port's flight -0.4 yd along, -4.6 across. **avoided**: lines that failed from here before, not tried: -0.4 deg (rested 25 yd from the port's rest, classic-b/attempt-8 h13 k1); -4.5 deg (rested 31 yd from the port's rest, classic-b/attempt-18 h13 k1); -6.9 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 1.9 yd, wind 18 mph (dir 6): putter 0.226, aimed -0.875 deg of the cup. Result: HOLED.

Hole 14 (par 5): 4 by the game's count.
- 14.1 from the tee, 363.6 yd, wind 14 mph (dir 4): 3iron 0.90, launched 35.2 deg left of the pin line; planned: rough, 217.3 yd from the pin. Result: rough, 217.4 yd from the pin; against the port's flight +0.2 yd along, +2.9 across. **avoided**: lines that failed from here before, not tried: 14.4 deg (hazard 1, round-r3 h14 k1); 38.2 deg (rested 43 yd from the port's rest, round-r7 h14 k1); 32.2 deg (rested 18 yd from the port's rest, classic-b/attempt-13 h14 k1).
- 14.2 from the rough, 217.4 yd, wind 14 mph (dir 4): driver 0.75, launched 6.0 deg right of the pin line; planned: bunker, 16.2 yd from the pin. Result: fairway, 13.6 yd from the pin; against the port's flight +4.8 yd along, -2.8 across.
- 14.3 from the fairway, 13.6 yd, wind 14 mph (dir 4): wedge 0.14, launched 8.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 0.2 yd from the pin; against the port's flight -0.0 yd along, +0.4 across.
- 14.4 from the green, 0.2 yd, wind 14 mph (dir 4): putter 0.088, aimed -23.4 deg of the cup. Result: HOLED.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 341.1 yd, wind 10 mph (dir 5): driver 0.88, launched 3.0 deg left of the pin line; planned: rough, 88.1 yd from the pin. Result: rough, 88.1 yd from the pin; against the port's flight -0.6 yd along, +4.0 across.
- 15.2 from the rough, 88.1 yd, wind 10 mph (dir 5): 9iron 0.72, launched 4.0 deg right of the pin line; planned: green, 1.3 yd from the pin. Result: green, 1.3 yd from the pin; against the port's flight +0.9 yd along, +3.8 across.
- 15.3 from the green, 1.3 yd, wind 10 mph (dir 5): putter 0.205, aimed +1.125 deg of the cup. Result: HOLED.

### Attempt 19: 2-3-3 (-4), 2026-10-22 05:36 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 142.6 yd, wind 10 mph (dir 3): 7iron 0.92, launched 6.0 deg left of the pin line; planned: green, 2 yd from the pin. Result: green, 5.7 yd from the pin; against the port's flight +4.3 yd along, -0.5 across. **avoided**: lines that failed from here before, not tried: -3.0 deg (rested 25 yd from the port's rest, classic-b/attempt-8 h13 k1); -7.1 deg (rested 31 yd from the port's rest, classic-b/attempt-18 h13 k1); -9.6 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 5.7 yd, wind 10 mph (dir 3): putter 0.412, aimed -1.375 deg of the cup. Result: HOLED.

Hole 14 (par 5): 3 by the game's count.
- 14.1 from the tee, 359.4 yd, wind 20 mph (dir 0): driver 0.90, launched 33.4 deg left of the pin line; planned: fairway, 222.9 yd from the pin. Result: fairway, 227.4 yd from the pin; against the port's flight +7.5 yd along, -6.9 across. **avoided**: lines that failed from here before, not tried: 11.1 deg (rested 43 yd from the port's rest, round-r4 h14 k1); 12.6 deg (hazard 1, round-r3 h14 k1); 36.3 deg (rested 43 yd from the port's rest, round-r7 h14 k1); 30.4 deg (rested 18 yd from the port's rest, classic-b/attempt-13 h14 k1).
- 14.2 from the fairway, 227.4 yd, wind 20 mph (dir 0): driver 0.94, launched 4.0 deg left of the pin line; planned: green, 4.1 yd from the pin. Result: green, 7.0 yd from the pin; against the port's flight -2.8 yd along, +1.7 across.
- 14.3 from the green, 7.0 yd, wind 20 mph (dir 0): putter 0.434, aimed -2.45 deg of the cup. Result: HOLED.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 335.4 yd, wind 14 mph (dir 5): driver 0.88, launched 6.0 deg left of the pin line; planned: fairway, 87.8 yd from the pin. Result: rough, 83.7 yd from the pin; against the port's flight +2.4 yd along, +3.8 across.
- 15.2 from the rough, 83.7 yd, wind 14 mph (dir 5): 9iron 0.71, launched 8.0 deg right of the pin line; planned: green, 2.2 yd from the pin. Result: green, 6.1 yd from the pin; against the port's flight +3.1 yd along, +2.8 across.
- 15.3 from the green, 6.1 yd, wind 14 mph (dir 5): putter 0.424, aimed +4.375 deg of the cup. Result: HOLED.

### Attempt 18: 3-6-3 (E), 2026-10-22 05:32 UTC

Hole 13 (par 3): 3 by the game's count.
- 13.1 from the tee, 145.7 yd, wind 10 mph (dir 6): 3iron 0.56, launched 4.5 deg right of the pin line; planned: green, 1.6 yd from the pin. Result: sand, 29.9 yd from the pin; against the port's flight -30.5 yd along, +4.9 across. **miss**: rested 31 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: -0.4 deg (rested 25 yd from the port's rest, classic-b/attempt-8 h13 k1); -6.9 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the sand, 29.9 yd, wind 10 mph (dir 6): wedge 0.35, launched 5.0 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 4.6 yd from the pin; against the port's flight -0.1 yd along, -4.4 across.
- 13.3 from the green, 4.6 yd, wind 10 mph (dir 6): putter 0.412, aimed -1.6 deg of the cup. Result: HOLED.

Hole 14 (par 5): 6 by the game's count (1 penalty).
- 14.1 from the tee, 363.6 yd, wind 14 mph (dir 1): 3iron 1.00, launched 35.2 deg left of the pin line; planned: rough, 234.3 yd from the pin. Result: rough, 233.1 yd from the pin; against the port's flight -0.5 yd along, +1.8 across. **avoided**: lines that failed from here before, not tried: 14.4 deg (hazard 1, round-r3 h14 k1); 38.2 deg (rested 43 yd from the port's rest, round-r7 h14 k1); 32.2 deg (rested 18 yd from the port's rest, classic-b/attempt-13 h14 k1).
- 14.2 from the rough, 233.1 yd, wind 14 mph (dir 1): 3iron 0.35, launched 2.0 deg left of the pin line; planned: rough, 146.7 yd from the pin. Result: a penalty drop, 215.2 yd from the pin; against the port's flight +2.7 yd along, +9.4 across. **hazard**: into water (a penalty stroke); the line is not tried again from there.
- 14.3 from the rough, 215.2 yd, wind 14 mph (dir 1): driver 0.75, launched 0.0 deg left of the pin line; planned: bunker, 29.6 yd from the pin. Result: sand, 26.3 yd from the pin; against the port's flight +3.3 yd along, -0.6 across.
- 14.4 from the sand, 26.3 yd, wind 14 mph (dir 1): wedge 0.32, launched 4.0 deg left of the pin line; planned: green, 0.4 yd from the pin. Result: green, 1.6 yd from the pin; against the port's flight +0.2 yd along, -2.0 across.
- 14.5 from the green, 1.6 yd, wind 14 mph (dir 1): putter 0.207, aimed +0.225 deg of the cup. Result: HOLED.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 335.4 yd, wind 18 mph (dir 5): driver 0.86, launched 4.0 deg left of the pin line; planned: rough, 86.2 yd from the pin. Result: rough, 82.9 yd from the pin; against the port's flight +2.1 yd along, +3.4 across.
- 15.2 from the rough, 82.9 yd, wind 18 mph (dir 5): 9iron 0.71, launched 10.0 deg right of the pin line; planned: green, 2.4 yd from the pin. Result: green, 6.2 yd from the pin; against the port's flight +4.1 yd along, +1.3 across.
- 15.3 from the green, 6.2 yd, wind 18 mph (dir 5): putter 0.447, aimed +4.025 deg of the cup. Result: HOLED.

### Attempt 17: 2-4-3 (-3), 2026-10-22 05:28 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 138.1 yd, wind 14 mph (dir 2): 7iron 0.93, launched 7.7 deg left of the pin line; planned: green, 2.8 yd from the pin. Result: green, 4.1 yd from the pin; against the port's flight -6.1 yd along, -2.9 across. **avoided**: lines that failed from here before, not tried: 2.8 deg (rested 25 yd from the port's rest, classic-b/attempt-8 h13 k1); -3.8 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 4.1 yd, wind 14 mph (dir 2): putter 0.349, aimed +1.225 deg of the cup. Result: HOLED.

Hole 14 (par 5): 4 by the game's count.
- 14.1 from the tee, 359.4 yd, wind 12 mph (dir 0): driver 0.90, launched 20.0 deg left of the pin line; planned: rough, 162.4 yd from the pin. Result: rough, 162.5 yd from the pin; against the port's flight +0.1 yd along, -0.5 across. **repeat**: planned from classic-b/attempt-12 h14 k1's identical stroke (+0.1 along, -0.5 across the port). **avoided**: lines that failed from here before, not tried: 11.1 deg (rested 43 yd from the port's rest, round-r4 h14 k1); 12.6 deg (hazard 1, round-r3 h14 k1); 36.3 deg (rested 43 yd from the port's rest, round-r7 h14 k1); 30.4 deg (rested 18 yd from the port's rest, classic-b/attempt-13 h14 k1).
- 14.2 from the rough, 162.5 yd, wind 12 mph (dir 0): spoon 0.65, launched 4.0 deg left of the pin line; planned: green, 6.1 yd from the pin. Result: fairway, 13.1 yd from the pin; against the port's flight +6.3 yd along, -5.3 across. **avoided**: lines that failed from here before, not tried: 1.0 deg (rested 21 yd from the port's rest, classic-b/attempt-12 h14 k2).
- 14.3 from the fairway, 13.1 yd, wind 12 mph (dir 0): wedge 0.11, launched 3.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 2.3 yd from the pin; against the port's flight -0.4 yd along, +2.3 across.
- 14.4 from the green, 2.3 yd, wind 12 mph (dir 0): putter 0.239, aimed +0.175 deg of the cup. Result: HOLED.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 335.4 yd, wind 16 mph (dir 7): driver 0.95, launched 4.0 deg left of the pin line; planned: fairway, 98.5 yd from the pin. Result: fairway, 97.0 yd from the pin; against the port's flight +0.3 yd along, +3.1 across.
- 15.2 from the fairway, 97.0 yd, wind 16 mph (dir 7): spoon 0.35, launched 1.0 deg right of the pin line; planned: green, 1 yd from the pin. Result: green, 2.4 yd from the pin; against the port's flight -0.2 yd along, +1.9 across.
- 15.3 from the green, 2.4 yd, wind 16 mph (dir 7): putter 0.277, aimed -0.05 deg of the cup. Result: HOLED.

### Attempt 16: 2-4-3 (-3), 2026-10-22 05:24 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 142.6 yd, wind 18 mph (dir 6): 7iron 0.98, launched 13.0 deg right of the pin line; planned: green, 1.8 yd from the pin. Result: green, 1.9 yd from the pin; against the port's flight -5.0 yd along, -5.1 across. **repeat**: planned from classic-b/attempt-13 h13 k1's identical stroke (-5 along, -5.1 across the port). **avoided**: lines that failed from here before, not tried: -3.0 deg (rested 25 yd from the port's rest, classic-b/attempt-8 h13 k1); -9.6 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 1.9 yd, wind 18 mph (dir 6): putter 0.208, aimed +0.2 deg of the cup. Result: HOLED.

Hole 14 (par 5): 4 by the game's count.
- 14.1 from the tee, 361.3 yd, wind 14 mph (dir 7): driver 0.88, launched 34.4 deg left of the pin line; planned: rough, 228.2 yd from the pin. Result: sand, 232.8 yd from the pin; against the port's flight -8.1 yd along, -3.2 across. **avoided**: lines that failed from here before, not tried: 12.2 deg (rested 43 yd from the port's rest, round-r4 h14 k1); 13.6 deg (hazard 1, round-r3 h14 k1); 37.4 deg (rested 43 yd from the port's rest, round-r7 h14 k1); 31.4 deg (rested 18 yd from the port's rest, classic-b/attempt-13 h14 k1).
- 14.2 from the sand, 232.8 yd, wind 14 mph (dir 7): 3iron 0.50, launched 3.0 deg left of the pin line; planned: fairway, 115.9 yd from the pin. Result: fairway, 114.9 yd from the pin; against the port's flight +0.7 yd along, +1.9 across.
- 14.3 from the fairway, 114.9 yd, wind 14 mph (dir 7): 7iron 0.92, launched 0.0 deg left of the pin line; planned: green, 0.5 yd from the pin. Result: green, 1.5 yd from the pin; against the port's flight -0.8 yd along, -0.9 across.
- 14.4 from the green, 1.5 yd, wind 14 mph (dir 7): putter 0.208, aimed -0.025 deg of the cup. Result: HOLED.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 339.1 yd, wind 16 mph (dir 4): driver 0.98, launched 13.0 deg left of the pin line; planned: rough, 80.8 yd from the pin. Result: rough, 79.2 yd from the pin; against the port's flight -1.5 yd along, +3.0 across.
- 15.2 from the rough, 79.2 yd, wind 16 mph (dir 4): 9iron 0.61, launched 5.0 deg right of the pin line; planned: green, 0.6 yd from the pin. Result: green, 5.5 yd from the pin; against the port's flight +3.5 yd along, +3.5 across.
- 15.3 from the green, 5.5 yd, wind 16 mph (dir 4): putter 0.488, aimed +2.525 deg of the cup. Result: HOLED.

### Attempt 15: 2-4-4 (-2), 2026-10-22 05:20 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 142.6 yd, wind 20 mph (dir 7): 3iron 0.61, launched 6.0 deg right of the pin line; planned: green, 0.6 yd from the pin. Result: green, 3.9 yd from the pin; against the port's flight +2.9 yd along, -2.3 across. **avoided**: lines that failed from here before, not tried: -3.0 deg (rested 25 yd from the port's rest, classic-b/attempt-8 h13 k1); -9.6 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 3.9 yd, wind 20 mph (dir 7): putter 0.323, aimed -1.125 deg of the cup. Result: HOLED.

Hole 14 (par 5): 4 by the game's count.
- 14.1 from the tee, 363.6 yd, wind 18 mph (dir 2): spoon 0.96, launched 35.2 deg left of the pin line; planned: rough, 203 yd from the pin. Result: rough, 196.6 yd from the pin; against the port's flight +0.8 yd along, +6.7 across. **avoided**: lines that failed from here before, not tried: 14.4 deg (hazard 1, round-r3 h14 k1); 38.2 deg (rested 43 yd from the port's rest, round-r7 h14 k1); 32.2 deg (rested 18 yd from the port's rest, classic-b/attempt-13 h14 k1).
- 14.2 from the rough, 196.6 yd, wind 18 mph (dir 2): spoon 0.73, launched 20.0 deg left of the pin line; planned: rough, 52.9 yd from the pin. Result: rough, 58.2 yd from the pin; against the port's flight -1.9 yd along, -5.1 across. **avoided**: lines that failed from here before, not tried: -3.1 deg (rested 213 yd from the port's rest, classic-b/attempt-3 h14 k2).
- 14.3 from the rough, 58.2 yd, wind 18 mph (dir 2): 9iron 0.36, launched 1.0 deg right of the pin line; planned: green, 0.5 yd from the pin. Result: green, 3.2 yd from the pin; against the port's flight -0.3 yd along, +2.7 across.
- 14.4 from the green, 3.2 yd, wind 18 mph (dir 2): putter 0.267, aimed +0.225 deg of the cup. Result: HOLED.

Hole 15 (par 4): 4 by the game's count.
- 15.1 from the tee, 335.4 yd, wind 16 mph (dir 1): driver 0.94, launched 8.0 deg left of the pin line; planned: rough, 97.3 yd from the pin. Result: rough, 96.0 yd from the pin; against the port's flight +0.8 yd along, +1.7 across.
- 15.2 from the rough, 96.0 yd, wind 16 mph (dir 1): 3iron 0.49, launched 1.0 deg left of the pin line; planned: green, 2.9 yd from the pin. Result: fairway, 23.3 yd from the pin; against the port's flight +22.3 yd along, +8.7 across. **miss**: rested 24 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 15.3 from the fairway, 23.3 yd, wind 16 mph (dir 1): wedge 0.21, launched 6.0 deg right of the pin line; planned: green, 0.1 yd from the pin. Result: green, 2.2 yd from the pin; against the port's flight +0.1 yd along, -2.2 across.
- 15.4 from the green, 2.2 yd, wind 16 mph (dir 1): putter 0.269, aimed -0.025 deg of the cup. Result: HOLED.

### Attempt 14: 2-4-3 (-3), 2026-10-22 05:16 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 145.7 yd, wind 18 mph (dir 6): 5iron 0.77, launched 10.0 deg right of the pin line; planned: green, 3.6 yd from the pin. Result: green, 3.9 yd from the pin; against the port's flight -3.8 yd along, -3.6 across. **avoided**: lines that failed from here before, not tried: -0.4 deg (rested 25 yd from the port's rest, classic-b/attempt-8 h13 k1); -6.9 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 3.9 yd, wind 18 mph (dir 6): putter 0.370, aimed +1.85 deg of the cup. Result: HOLED.

Hole 14 (par 5): 4 by the game's count.
- 14.1 from the tee, 359.4 yd, wind 14 mph (dir 4): spoon 1.00, launched 39.4 deg left of the pin line; planned: fairway, 210.6 yd from the pin. Result: rough, 211.3 yd from the pin; against the port's flight +11.6 yd along, -1.1 across. **avoided**: lines that failed from here before, not tried: 11.1 deg (rested 43 yd from the port's rest, round-r4 h14 k1); 12.6 deg (hazard 1, round-r3 h14 k1); 36.3 deg (rested 43 yd from the port's rest, round-r7 h14 k1); 30.4 deg (rested 18 yd from the port's rest, classic-b/attempt-13 h14 k1).
- 14.2 from the rough, 211.3 yd, wind 14 mph (dir 4): driver 0.75, launched 4.0 deg right of the pin line; planned: green, 4.9 yd from the pin. Result: fairway, 12.9 yd from the pin; against the port's flight -11.8 yd along, +0.7 across.
- 14.3 from the fairway, 12.9 yd, wind 14 mph (dir 4): wedge 0.12, launched 2.0 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 0.6 yd from the pin; against the port's flight -0.1 yd along, -0.3 across.
- 14.4 from the green, 0.6 yd, wind 14 mph (dir 4): putter 0.160, aimed -0.525 deg of the cup. Result: HOLED.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 341.1 yd, wind 10 mph (dir 5): spoon 1.00, launched 5.5 deg left of the pin line; planned: fairway, 93.7 yd from the pin. Result: rough, 91.1 yd from the pin; against the port's flight +1.8 yd along, +2.1 across.
- 15.2 from the rough, 91.1 yd, wind 10 mph (dir 5): 9iron 0.75, launched 4.0 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 0.9 yd from the pin; against the port's flight -0.8 yd along, +3.9 across. **repeat**: planned from classic-b/attempt-6 h15 k2's identical stroke (+0.5 along, +3.5 across the port).
- 15.3 from the green, 0.9 yd, wind 10 mph (dir 5): putter 0.186, aimed -0.65 deg of the cup. Result: HOLED.

### Attempt 13: 2-4-3 (-3), 2026-10-22 05:12 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 142.6 yd, wind 18 mph (dir 6): 7iron 0.98, launched 13.0 deg right of the pin line; planned: green, 4 yd from the pin. Result: green, 1.9 yd from the pin; against the port's flight -5.0 yd along, -5.1 across. **repeat**: planned from classic-b/attempt-6 h13 k1's identical stroke (-2 along, -6.4 across the port). **avoided**: lines that failed from here before, not tried: -3.0 deg (rested 25 yd from the port's rest, classic-b/attempt-8 h13 k1); -9.6 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 1.9 yd, wind 18 mph (dir 6): putter 0.208, aimed +0.2 deg of the cup. Result: HOLED.

Hole 14 (par 5): 4 by the game's count.
- 14.1 from the tee, 363.6 yd, wind 14 mph (dir 7): spoon 0.96, launched 32.2 deg left of the pin line; planned: fairway, 227.3 yd from the pin. Result: rough, 233.9 yd from the pin; against the port's flight -17.6 yd along, -0.8 across. **miss**: rested 18 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: 14.4 deg (hazard 1, round-r3 h14 k1); 38.2 deg (rested 43 yd from the port's rest, round-r7 h14 k1).
- 14.2 from the rough, 233.9 yd, wind 14 mph (dir 7): driver 0.65, launched 8.0 deg left of the pin line; planned: fairway, 57.7 yd from the pin. Result: fairway, 57.1 yd from the pin; against the port's flight +0.1 yd along, +0.6 across.
- 14.3 from the fairway, 57.1 yd, wind 14 mph (dir 7): wedge 0.96, launched 4.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 1.3 yd from the pin; against the port's flight +0.2 yd along, +1.6 across.
- 14.4 from the green, 1.3 yd, wind 14 mph (dir 7): putter 0.191, aimed -0.425 deg of the cup. Result: HOLED.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 341.1 yd, wind 16 mph (dir 4): driver 1.00, launched 14.5 deg left of the pin line; planned: rough, 84.6 yd from the pin. Result: rough, 82.0 yd from the pin; against the port's flight -0.7 yd along, +3.4 across.
- 15.2 from the rough, 82.0 yd, wind 16 mph (dir 4): 9iron 0.62, launched 6.0 deg right of the pin line; planned: green, 0.7 yd from the pin. Result: green, 4.5 yd from the pin; against the port's flight +1.6 yd along, +3.5 across.
- 15.3 from the green, 4.5 yd, wind 16 mph (dir 4): putter 0.427, aimed +3.25 deg of the cup. Result: HOLED.

### Attempt 12: 2-4-4 (-2), 2026-10-22 05:08 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 145.7 yd, wind 20 mph (dir 7): 5iron 0.89, launched 10.0 deg right of the pin line; planned: green, 4.9 yd from the pin. Result: green, 2.5 yd from the pin; against the port's flight -1.9 yd along, -1.6 across. **avoided**: lines that failed from here before, not tried: -0.4 deg (rested 25 yd from the port's rest, classic-b/attempt-8 h13 k1); -6.9 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 2.5 yd, wind 20 mph (dir 7): putter 0.240, aimed +0.2 deg of the cup. Result: HOLED.

Hole 14 (par 5): 4 by the game's count.
- 14.1 from the tee, 359.4 yd, wind 12 mph (dir 0): driver 0.90, launched 20.0 deg left of the pin line; planned: rough, 162.1 yd from the pin. Result: rough, 162.5 yd from the pin; against the port's flight +0.1 yd along, -0.5 across. **avoided**: lines that failed from here before, not tried: 11.1 deg (rested 43 yd from the port's rest, round-r4 h14 k1); 12.6 deg (hazard 1, round-r3 h14 k1); 36.3 deg (rested 43 yd from the port's rest, round-r7 h14 k1).
- 14.2 from the rough, 162.5 yd, wind 12 mph (dir 0): driver 0.59, launched 1.0 deg left of the pin line; planned: green, 1.2 yd from the pin. Result: fairway, 21.0 yd from the pin; against the port's flight +21.0 yd along, +2.3 across. **miss**: rested 21 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 14.3 from the fairway, 21.0 yd, wind 12 mph (dir 0): wedge 0.21, launched 3.0 deg right of the pin line; planned: green, 0.2 yd from the pin. Result: green, 3.3 yd from the pin; against the port's flight -0.6 yd along, -3.1 across.
- 14.4 from the green, 3.3 yd, wind 12 mph (dir 0): putter 0.289, aimed +0.05 deg of the cup. Result: HOLED.

Hole 15 (par 4): 4 by the game's count.
- 15.1 from the tee, 335.4 yd, wind 16 mph (dir 3): driver 0.94, launched 14.9 deg left of the pin line; planned: fairway, 87.8 yd from the pin. Result: rough, 82.7 yd from the pin; against the port's flight +4.5 yd along, +2.8 across.
- 15.2 from the rough, 82.7 yd, wind 16 mph (dir 3): 9iron 0.63, launched 3.0 deg left of the pin line; planned: green, 0.5 yd from the pin. Result: sand, 19.4 yd from the pin; against the port's flight -18.7 yd along, -2.2 across. **miss**: rested 19 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 15.3 from the sand, 19.4 yd, wind 16 mph (dir 3): wedge 0.25, launched 2.0 deg left of the pin line; planned: green, 0.9 yd from the pin. Result: green, 2.3 yd from the pin; against the port's flight +0.3 yd along, +2.1 across.
- 15.4 from the green, 2.3 yd, wind 16 mph (dir 3): putter 0.278, aimed +1.35 deg of the cup. Result: HOLED.

### Attempt 11: 2-3-3 (-4), 2026-10-22 05:04 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 142.6 yd, wind 12 mph (dir 7): 5iron 0.83, launched 6.0 deg right of the pin line; planned: green, 2.5 yd from the pin. Result: green, 5.0 yd from the pin; against the port's flight +6.5 yd along, -3.8 across. **avoided**: lines that failed from here before, not tried: -3.0 deg (rested 25 yd from the port's rest, classic-b/attempt-8 h13 k1); -9.6 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 5.0 yd, wind 12 mph (dir 7): putter 0.379, aimed -1.25 deg of the cup. Result: HOLED.

Hole 14 (par 5): 3 by the game's count.
- 14.1 from the tee, 359.4 yd, wind 18 mph (dir 2): spoon 0.98, launched 33.4 deg left of the pin line; planned: rough, 190.8 yd from the pin. Result: rough, 182.5 yd from the pin; against the port's flight +5.2 yd along, +7.0 across. **avoided**: lines that failed from here before, not tried: 11.1 deg (rested 43 yd from the port's rest, round-r4 h14 k1); 12.6 deg (hazard 1, round-r3 h14 k1); 36.3 deg (rested 43 yd from the port's rest, round-r7 h14 k1).
- 14.2 from the rough, 182.5 yd, wind 18 mph (dir 2): driver 0.57, launched 4.0 deg left of the pin line; planned: green, 0.4 yd from the pin. Result: green, 8.2 yd from the pin; against the port's flight +6.7 yd along, -4.8 across.
- 14.3 from the green, 8.2 yd, wind 18 mph (dir 2): putter 0.395, aimed -2.15 deg of the cup. Result: HOLED.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 339.1 yd, wind 20 mph (dir 5): driver 1.00, launched 10.8 deg left of the pin line; planned: fairway, 92.2 yd from the pin. Result: fairway, 87.6 yd from the pin; against the port's flight +1.7 yd along, +4.3 across.
- 15.2 from the fairway, 87.6 yd, wind 20 mph (dir 5): 3iron 0.31, launched 4.0 deg right of the pin line; planned: green, 0.5 yd from the pin. Result: green, 5.7 yd from the pin; against the port's flight +3.4 yd along, +5.0 across.
- 15.3 from the green, 5.7 yd, wind 20 mph (dir 5): putter 0.488, aimed +1.25 deg of the cup. Result: HOLED.

### Attempt 10: 2-4-3 (-3), 2026-10-22 05:00 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 138.1 yd, wind 12 mph (dir 5): driver 0.36, launched 1.0 deg right of the pin line; planned: green, 1.8 yd from the pin. Result: green, 1.6 yd from the pin; against the port's flight -0.5 yd along, +2.0 across. **avoided**: lines that failed from here before, not tried: 2.8 deg (rested 25 yd from the port's rest, classic-b/attempt-8 h13 k1); -3.8 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 1.6 yd, wind 12 mph (dir 5): putter 0.210, aimed -0.375 deg of the cup. Result: HOLED.

Hole 14 (par 5): 4 by the game's count.
- 14.1 from the tee, 363.6 yd, wind 18 mph (dir 4): driver 0.78, launched 32.2 deg left of the pin line; planned: rough, 199.5 yd from the pin. Result: rough, 189.1 yd from the pin; against the port's flight +6.7 yd along, +8.5 across. **avoided**: lines that failed from here before, not tried: 14.4 deg (hazard 1, round-r3 h14 k1); 38.2 deg (rested 43 yd from the port's rest, round-r7 h14 k1).
- 14.2 from the rough, 189.1 yd, wind 18 mph (dir 4): spoon 0.71, launched 3.0 deg right of the pin line; planned: green, 1.9 yd from the pin. Result: rough, 21.6 yd from the pin; against the port's flight +7.3 yd along, -0.4 across.
- 14.3 from the rough, 21.6 yd, wind 18 mph (dir 4): wedge 0.29, launched 4.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 0.2 yd from the pin; against the port's flight +0.1 yd along, +0.4 across.
- 14.4 from the green, 0.2 yd, wind 18 mph (dir 4): putter 0.094, aimed -21.175 deg of the cup. Result: HOLED.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 341.1 yd, wind 14 mph (dir 0): driver 0.88, launched 5.5 deg left of the pin line; planned: fairway, 113.4 yd from the pin. Result: fairway, 112.2 yd from the pin; against the port's flight +0.5 yd along, +2.5 across.
- 15.2 from the fairway, 112.2 yd, wind 14 mph (dir 0): 7iron 0.87, launched 1.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 3.1 yd from the pin; against the port's flight +0.6 yd along, +2.9 across.
- 15.3 from the green, 3.1 yd, wind 14 mph (dir 0): putter 0.333, aimed +2.275 deg of the cup. Result: HOLED.

### Attempt 9: 2-5-3 (-2), 2026-10-22 04:56 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 142.6 yd, wind 12 mph (dir 5): spoon 0.41, launched 0.0 deg right of the pin line; planned: green, 3.2 yd from the pin. Result: green, 4.3 yd from the pin; against the port's flight +1.8 yd along, -0.8 across. **avoided**: lines that failed from here before, not tried: -3.0 deg (rested 25 yd from the port's rest, classic-b/attempt-8 h13 k1); -9.6 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 4.3 yd, wind 12 mph (dir 5): putter 0.344, aimed -0.45 deg of the cup. Result: HOLED.

Hole 14 (par 5): 5 by the game's count.
- 14.1 from the tee, 361.3 yd, wind 10 mph (dir 2): spoon 0.82, launched 31.4 deg left of the pin line; planned: rough, 208.8 yd from the pin. Result: rough, 207.2 yd from the pin; against the port's flight -1.4 yd along, +2.8 across. **avoided**: lines that failed from here before, not tried: 12.2 deg (rested 43 yd from the port's rest, round-r4 h14 k1); 13.6 deg (hazard 1, round-r3 h14 k1); 37.4 deg (rested 43 yd from the port's rest, round-r7 h14 k1).
- 14.2 from the rough, 207.2 yd, wind 10 mph (dir 2): driver 0.43, launched 8.0 deg left of the pin line; planned: fairway, 63.2 yd from the pin. Result: fairway, 65.6 yd from the pin; against the port's flight +0.0 yd along, -5.9 across.
- 14.3 from the fairway, 65.6 yd, wind 10 mph (dir 2): 9iron 0.50, launched 4.0 deg left of the pin line; planned: green, 0.6 yd from the pin. Result: fairway, 23.1 yd from the pin; against the port's flight -22.3 yd along, -3.4 across. **miss**: rested 23 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 14.4 from the fairway, 23.1 yd, wind 10 mph (dir 2): wedge 0.24, launched 3.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 0.5 yd from the pin; against the port's flight -0.4 yd along, -0.6 across.
- 14.5 from the green, 0.5 yd, wind 10 mph (dir 2): putter 0.158, aimed -0.075 deg of the cup. Result: HOLED.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 339.1 yd, wind 16 mph (dir 3): driver 0.87, launched 8.0 deg left of the pin line; planned: rough, 83 yd from the pin. Result: rough, 85.7 yd from the pin; against the port's flight -3.3 yd along, +1.2 across.
- 15.2 from the rough, 85.7 yd, wind 16 mph (dir 3): 9iron 0.71, launched 6.0 deg left of the pin line; planned: green, 0.4 yd from the pin. Result: green, 5.9 yd from the pin; against the port's flight +4.7 yd along, +3.0 across.
- 15.3 from the green, 5.9 yd, wind 16 mph (dir 3): putter 0.446, aimed +2.2 deg of the cup. Result: HOLED.

### Attempt 8: 3-3-3 (-3), 2026-10-22 04:52 UTC

Hole 13 (par 3): 3 by the game's count.
- 13.1 from the tee, 142.6 yd, wind 14 mph (dir 5): 5iron 0.66, launched 3.0 deg right of the pin line; planned: green, 2 yd from the pin. Result: sand, 24.3 yd from the pin; against the port's flight -24.5 yd along, +3.9 across. **miss**: rested 25 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: -9.6 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the sand, 24.3 yd, wind 14 mph (dir 5): wedge 0.25, launched 3.0 deg right of the pin line; planned: green, 0.2 yd from the pin. Result: green, 0.5 yd from the pin; against the port's flight +0.2 yd along, -0.4 across.
- 13.3 from the green, 0.5 yd, wind 14 mph (dir 5): putter 0.155, aimed -0.825 deg of the cup. Result: HOLED.

Hole 14 (par 5): 3 by the game's count.
- 14.1 from the tee, 359.4 yd, wind 12 mph (dir 4): spoon 0.88, launched 30.4 deg left of the pin line; planned: rough, 189.4 yd from the pin. Result: rough, 180.8 yd from the pin; against the port's flight +2.8 yd along, +8.3 across. **avoided**: lines that failed from here before, not tried: 11.1 deg (rested 43 yd from the port's rest, round-r4 h14 k1); 12.6 deg (hazard 1, round-r3 h14 k1); 36.3 deg (rested 43 yd from the port's rest, round-r7 h14 k1).
- 14.2 from the rough, 180.8 yd, wind 12 mph (dir 4): driver 0.75, launched 2.0 deg right of the pin line; planned: green, 2 yd from the pin. Result: green, 8.4 yd from the pin; against the port's flight +9.4 yd along, -1.5 across.
- 14.3 from the green, 8.4 yd, wind 12 mph (dir 4): putter 0.516, aimed +3.5 deg of the cup. Result: HOLED.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 339.1 yd, wind 16 mph (dir 2): driver 0.86, launched 10.8 deg left of the pin line; planned: fairway, 105.6 yd from the pin. Result: rough, 101.0 yd from the pin; against the port's flight +3.6 yd along, +3.3 across.
- 15.2 from the rough, 101.0 yd, wind 16 mph (dir 2): 7iron 0.67, launched 6.0 deg left of the pin line; planned: green, 1.1 yd from the pin. Result: green, 9.6 yd from the pin; against the port's flight +7.5 yd along, +5.6 across.
- 15.3 from the green, 9.6 yd, wind 16 mph (dir 2): putter 0.588, aimed +3.125 deg of the cup. Result: HOLED.

### Attempt 7: 2-4-3 (-3), 2026-10-22 04:48 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 145.7 yd, wind 20 mph (dir 2): 5iron 0.80, launched 10.0 deg left of the pin line; planned: green, 1.5 yd from the pin. Result: green, 2.4 yd from the pin; against the port's flight +0.8 yd along, -0.9 across. **avoided**: lines that failed from here before, not tried: -6.9 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 2.4 yd, wind 20 mph (dir 2): putter 0.273, aimed -1.125 deg of the cup. Result: HOLED.

Hole 14 (par 5): 4 by the game's count.
- 14.1 from the tee, 363.6 yd, wind 10 mph (dir 7): spoon 0.92, launched 32.2 deg left of the pin line; planned: rough, 225.6 yd from the pin. Result: rough, 226.8 yd from the pin; against the port's flight +5.4 yd along, -3.3 across. **avoided**: lines that failed from here before, not tried: 14.4 deg (hazard 1, round-r3 h14 k1); 38.2 deg (rested 43 yd from the port's rest, round-r7 h14 k1).
- 14.2 from the rough, 226.8 yd, wind 10 mph (dir 7): driver 0.75, launched 6.0 deg left of the pin line; planned: fairway, 32.2 yd from the pin. Result: fairway, 34.9 yd from the pin; against the port's flight -0.4 yd along, -2.9 across.
- 14.3 from the fairway, 34.9 yd, wind 10 mph (dir 7): wedge 0.44, launched 4.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 3.7 yd from the pin; against the port's flight -1.4 yd along, +3.3 across.
- 14.4 from the green, 3.7 yd, wind 10 mph (dir 7): putter 0.292, aimed +0.375 deg of the cup. Result: HOLED.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 339.1 yd, wind 14 mph (dir 0): driver 0.97, launched 4.8 deg left of the pin line; planned: fairway, 98.9 yd from the pin. Result: rough, 98.2 yd from the pin; against the port's flight -0.3 yd along, +3.3 across.
- 15.2 from the rough, 98.2 yd, wind 14 mph (dir 0): 7iron 0.70, launched 1.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 2.5 yd from the pin; against the port's flight +0.6 yd along, +2.4 across.
- 15.3 from the green, 2.5 yd, wind 14 mph (dir 0): putter 0.292, aimed +1.575 deg of the cup. Result: HOLED.

### Attempt 6: 2-4-3 (-3), 2026-10-22 04:44 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 145.7 yd, wind 18 mph (dir 6): 7iron 0.99, launched 10.0 deg right of the pin line; planned: green, 0.5 yd from the pin. Result: green, 6.4 yd from the pin; against the port's flight -2.0 yd along, -6.4 across. **avoided**: lines that failed from here before, not tried: -6.9 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 6.4 yd, wind 18 mph (dir 6): putter 0.513, aimed -1.825 deg of the cup. Result: HOLED.

Hole 14 (par 5): 4 by the game's count.
- 14.1 from the tee, 361.3 yd, wind 14 mph (dir 4): driver 0.78, launched 31.4 deg left of the pin line; planned: rough, 197.2 yd from the pin. Result: rough, 189.4 yd from the pin; against the port's flight +0.3 yd along, +8.5 across. **avoided**: lines that failed from here before, not tried: 12.2 deg (rested 43 yd from the port's rest, round-r4 h14 k1); 13.6 deg (hazard 1, round-r3 h14 k1); 37.4 deg (rested 43 yd from the port's rest, round-r7 h14 k1).
- 14.2 from the rough, 189.4 yd, wind 14 mph (dir 4): driver 0.57, launched 13.0 deg left of the pin line; planned: rough, 45.1 yd from the pin. Result: rough, 50.0 yd from the pin; against the port's flight -1.1 yd along, -4.7 across. **avoided**: lines that failed from here before, not tried: -3.4 deg (rested 213 yd from the port's rest, classic-b/attempt-3 h14 k2).
- 14.3 from the rough, 50.0 yd, wind 14 mph (dir 4): 9iron 0.38, launched 5.0 deg right of the pin line; planned: green, 0.3 yd from the pin. Result: green, 2.4 yd from the pin; against the port's flight +0.3 yd along, +2.6 across.
- 14.4 from the green, 2.4 yd, wind 14 mph (dir 4): putter 0.243, aimed +0.55 deg of the cup. Result: HOLED.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 341.1 yd, wind 10 mph (dir 5): driver 0.88, launched 6.0 deg left of the pin line; planned: fairway, 93 yd from the pin. Result: rough, 90.3 yd from the pin; against the port's flight +0.8 yd along, +4.2 across.
- 15.2 from the rough, 90.3 yd, wind 10 mph (dir 5): 9iron 0.75, launched 6.0 deg right of the pin line; planned: green, 0.6 yd from the pin. Result: green, 3.1 yd from the pin; against the port's flight +0.5 yd along, +3.5 across.
- 15.3 from the green, 3.1 yd, wind 10 mph (dir 5): putter 0.339, aimed +2.275 deg of the cup. Result: HOLED.

### Attempt 5: 2-3-4 (-3), 2026-10-22 04:40 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 138.1 yd, wind 20 mph (dir 6): 7iron 0.96, launched 10.0 deg right of the pin line; planned: green, 1.1 yd from the pin. Result: green, 4.7 yd from the pin; against the port's flight -8.2 yd along, +3.9 across. **repeat**: planned from classic-b/attempt-4 h13 k1's identical stroke (-3.6 along, +0.8 across the port). **avoided**: lines that failed from here before, not tried: -3.8 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 4.7 yd, wind 20 mph (dir 6): putter 0.376, aimed +0.725 deg of the cup. Result: HOLED.

Hole 14 (par 5): 3 by the game's count.
- 14.1 from the tee, 361.3 yd, wind 12 mph (dir 7): spoon 0.96, launched 31.4 deg left of the pin line; planned: fairway, 226.1 yd from the pin. Result: fairway, 226.1 yd from the pin; against the port's flight +1.8 yd along, -7.5 across. **repeat**: planned from classic-b/attempt-4 h14 k1's identical stroke (+1.8 along, -7.5 across the port). **avoided**: lines that failed from here before, not tried: 12.2 deg (rested 43 yd from the port's rest, round-r4 h14 k1); 13.6 deg (hazard 1, round-r3 h14 k1); 37.4 deg (rested 43 yd from the port's rest, round-r7 h14 k1).
- 14.2 from the fairway, 226.1 yd, wind 12 mph (dir 7): spoon 0.99, launched 1.0 deg right of the pin line; planned: green, 2.7 yd from the pin. Result: green, 2.6 yd from the pin; against the port's flight +0.2 yd along, +0.8 across. **repeat**: planned from classic-b/attempt-4 h14 k2's identical stroke (+0.2 along, +0.8 across the port).
- 14.3 from the green, 2.6 yd, wind 12 mph (dir 7): putter 0.247, aimed +0.575 deg of the cup. Result: HOLED.

Hole 15 (par 4): 4 by the game's count.
- 15.1 from the tee, 335.4 yd, wind 18 mph (dir 3): driver 0.90, launched 14.9 deg left of the pin line; planned: fairway, 86.6 yd from the pin. Result: rough, 86.3 yd from the pin; against the port's flight +6.0 yd along, +2.0 across. **repeat**: planned from classic-b/attempt-4 h15 k1's identical stroke (+6.2 along, +1.3 across the port).
- 15.2 from the rough, 86.3 yd, wind 18 mph (dir 3): 9iron 0.66, launched 4.0 deg left of the pin line; planned: green, 0.9 yd from the pin. Result: sand, 19.5 yd from the pin; against the port's flight -18.9 yd along, -2.8 across. **miss**: rested 19 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 15.3 from the sand, 19.5 yd, wind 18 mph (dir 3): wedge 0.25, launched 4.0 deg left of the pin line; planned: green, 1 yd from the pin. Result: green, 1.9 yd from the pin; against the port's flight +0.3 yd along, +2.2 across.
- 15.4 from the green, 1.9 yd, wind 18 mph (dir 3): putter 0.246, aimed +1.25 deg of the cup. Result: HOLED.

### Attempt 4: 2-3-4 (-3), 2026-10-22 04:37 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 138.1 yd, wind 20 mph (dir 6): 7iron 0.95, launched 10.0 deg right of the pin line; planned: green, 1 yd from the pin. Result: green, 4.5 yd from the pin; against the port's flight -3.6 yd along, +0.8 across. **avoided**: lines that failed from here before, not tried: -3.8 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 4.5 yd, wind 20 mph (dir 6): putter 0.372, aimed +0.775 deg of the cup. Result: HOLED.

Hole 14 (par 5): 3 by the game's count.
- 14.1 from the tee, 361.3 yd, wind 12 mph (dir 7): spoon 0.96, launched 31.4 deg left of the pin line; planned: fairway, 219.5 yd from the pin. Result: fairway, 226.1 yd from the pin; against the port's flight +1.8 yd along, -7.5 across. **avoided**: lines that failed from here before, not tried: 12.2 deg (rested 43 yd from the port's rest, round-r4 h14 k1); 13.6 deg (hazard 1, round-r3 h14 k1); 37.4 deg (rested 43 yd from the port's rest, round-r7 h14 k1).
- 14.2 from the fairway, 226.1 yd, wind 12 mph (dir 7): spoon 0.99, launched 1.0 deg right of the pin line; planned: green, 2.4 yd from the pin. Result: green, 2.6 yd from the pin; against the port's flight +0.2 yd along, +0.8 across.
- 14.3 from the green, 2.6 yd, wind 12 mph (dir 7): putter 0.247, aimed +0.575 deg of the cup. Result: HOLED.

Hole 15 (par 4): 4 by the game's count.
- 15.1 from the tee, 335.4 yd, wind 18 mph (dir 3): driver 0.92, launched 16.0 deg left of the pin line; planned: fairway, 93.4 yd from the pin. Result: fairway, 88.2 yd from the pin; against the port's flight +6.2 yd along, +1.3 across.
- 15.2 from the fairway, 88.2 yd, wind 18 mph (dir 3): 9iron 0.67, launched 3.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: sand, 19.5 yd from the pin; against the port's flight -19.1 yd along, -2.4 across. **miss**: rested 19 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 15.3 from the sand, 19.5 yd, wind 18 mph (dir 3): wedge 0.24, launched 3.0 deg left of the pin line; planned: green, 0.4 yd from the pin. Result: green, 1.5 yd from the pin; against the port's flight -1.1 yd along, +1.6 across.
- 15.4 from the green, 1.5 yd, wind 18 mph (dir 3): putter 0.225, aimed -0.425 deg of the cup. Result: HOLED.

### Attempt 3: 2---- (unfinished: found stopped), 2026-10-22 04:34 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 145.7 yd, wind 14 mph (dir 7): 3iron 0.61, launched 4.0 deg right of the pin line; planned: green, 1.1 yd from the pin. Result: green, 4.6 yd from the pin; against the port's flight +0.6 yd along, -3.6 across. **avoided**: lines that failed from here before, not tried: -6.9 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 4.6 yd, wind 14 mph (dir 7): putter 0.407, aimed -2.175 deg of the cup. Result: HOLED.

### Attempt 2: 2-3-3 (-4), 2026-10-22 04:23 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 145.7 yd, wind 10 mph (dir 2): 5iron 0.78, launched 6.0 deg left of the pin line; planned: green, 0.5 yd from the pin. Result: green, 2.4 yd from the pin; against the port's flight -0.2 yd along, -1.9 across. **avoided**: lines that failed from here before, not tried: -6.9 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 2.4 yd, wind 10 mph (dir 2): putter 0.273, aimed -0.875 deg of the cup. Result: HOLED.

Hole 14 (par 5): 3 by the game's count.
- 14.1 from the tee, 363.6 yd, wind 16 mph (dir 3): driver 1.00, launched 41.2 deg left of the pin line; planned: rough, 209 yd from the pin. Result: rough, 209.6 yd from the pin; against the port's flight -0.6 yd along, -0.5 across. **avoided**: lines that failed from here before, not tried: 14.4 deg (hazard 1, round-r3 h14 k1); 38.2 deg (rested 43 yd from the port's rest, round-r7 h14 k1).
- 14.2 from the rough, 209.6 yd, wind 16 mph (dir 3): driver 0.69, launched 0.0 deg right of the pin line; planned: green, 2.8 yd from the pin. Result: green, 7.3 yd from the pin; against the port's flight +10.7 yd along, -0.1 across.
- 14.3 from the green, 7.3 yd, wind 16 mph (dir 3): putter 0.490, aimed -0.1 deg of the cup. Result: HOLED.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 335.4 yd, wind 20 mph (dir 4): driver 0.90, launched 8.9 deg left of the pin line; planned: rough, 73.8 yd from the pin. Result: rough, 70.7 yd from the pin; against the port's flight +2.1 yd along, +2.4 across.
- 15.2 from the rough, 70.7 yd, wind 20 mph (dir 4): spoon 0.23, launched 0.0 deg right of the pin line; planned: green, 0.9 yd from the pin. Result: green, 16.2 yd from the pin; against the port's flight +12.9 yd along, -9.2 across. **miss**: rested 16 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 15.3 from the green, 16.2 yd, wind 20 mph (dir 4): putter 0.803, aimed +0.4 deg of the cup. Result: HOLED.

### Attempt 1: 2-4-3 (-3), 2026-10-22 04:19 UTC

Hole 13 (par 3): 2 by the game's count.
- 13.1 from the tee, 145.7 yd, wind 10 mph (dir 6): 3iron 0.57, launched 4.0 deg right of the pin line; planned: green, 1.8 yd from the pin. Result: green, 3.3 yd from the pin; against the port's flight -1.0 yd along, -2.9 across. **avoided**: lines that failed from here before, not tried: -6.9 deg (rested 16 yd from the port's rest, round18 h13 k1).
- 13.2 from the green, 3.3 yd, wind 10 mph (dir 6): putter 0.322, aimed -1.85 deg of the cup. Result: HOLED.

Hole 14 (par 5): 4 by the game's count.
- 14.1 from the tee, 361.3 yd, wind 14 mph (dir 1): driver 0.86, launched 31.4 deg left of the pin line; planned: rough, 204 yd from the pin. Result: rough, 197.7 yd from the pin; against the port's flight +2.8 yd along, +5.9 across. **avoided**: lines that failed from here before, not tried: 12.2 deg (rested 43 yd from the port's rest, round-r4 h14 k1); 13.6 deg (hazard 1, round-r3 h14 k1); 37.4 deg (rested 43 yd from the port's rest, round-r7 h14 k1).
- 14.2 from the rough, 197.7 yd, wind 14 mph (dir 1): driver 0.75, launched 8.0 deg left of the pin line; planned: green, 11.3 yd from the pin. Result: fairway, 14.0 yd from the pin; against the port's flight +2.9 yd along, -1.9 across.
- 14.3 from the fairway, 14.0 yd, wind 14 mph (dir 1): wedge 0.10, launched 1.0 deg right of the pin line; planned: green, 0.2 yd from the pin. Result: green, 1.6 yd from the pin; against the port's flight -0.3 yd along, +1.4 across.
- 14.4 from the green, 1.6 yd, wind 14 mph (dir 1): putter 0.212, aimed +0.425 deg of the cup. Result: HOLED.

Hole 15 (par 4): 3 by the game's count.
- 15.1 from the tee, 335.4 yd, wind 18 mph (dir 5): spoon 0.96, launched 4.0 deg left of the pin line; planned: fairway, 89.6 yd from the pin. Result: rough, 85.8 yd from the pin; against the port's flight +2.4 yd along, +3.6 across.
- 15.2 from the rough, 85.8 yd, wind 18 mph (dir 5): 9iron 0.74, launched 10.0 deg right of the pin line; planned: green, 2.2 yd from the pin. Result: green, 5.9 yd from the pin; against the port's flight +4.3 yd along, +1.2 across.
- 15.3 from the green, 5.9 yd, wind 18 mph (dir 5): putter 0.435, aimed +3.775 deg of the cup. Result: HOLED.

