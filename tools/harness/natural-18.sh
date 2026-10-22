#!/usr/bin/env bash
# One completely natural 18-hole round (the user, 2026-10-22: "one completely
# natural, non-rng-controlled 18 hole round where you try to score as low as
# possible"; "you can start from a menu save state ... just no save states to
# manipulate the holes"): a driver Dolphin booted on "Number of Holes"
# (saves/menu-holes.sav, the one-time walk's menu), Eighteen Holes picked and
# the game's screens walked to hole 1's tee (round-start.mjs), then holes 1-18
# played straight through by round-ctl.mjs -> round-play.mjs: the game's own
# wind and pins, no wind or pin written, no savestate saved or loaded, no
# restart; every stroke the planner's. Its window is placed at X,Y (WxH), not
# kept on top. Logs: state/natural18/round-N.log, results/natural18/round-N.json.
# FRESH=1: a fresh draw and no memory. The menu savestate fixes the game's
# RNG, so a round started from it at once drew round 1's winds, the same as
# seven earlier 18-hole rounds (r2, r3, r5, r6, r9, r12, r13), whose strokes
# the planner remembers. So idle a random 5-90 s on "Number of Holes" first (the
# game runs on; rounds r4, r7, r8 drew other winds from the same state), and
# give the planner an empty memory of its own (HARNESS_KNOW,
# state/natural18/round-N-strokes.jsonl), so no earlier stroke is recalled.
#   bash tools/harness/natural-18.sh [instance 20] [port 8820] [round 1] [x 1700] [y 950] [w 854] [h 480] [fresh 0|1]
set -u
INST=${1:-20}; PORT=${2:-8820}; N=${3:-1}; X=${4:-1700}; Y=${5:-950}; W=${6:-854}; HT=${7:-480}; FRESH=${8:-0}
H="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$H/../.." && pwd)"
mkdir -p "$H/state/natural18" "$H/results/natural18"
LOG="$H/state/natural18/round-$N.log"
CTL="$H/state/natural18/round-$N-ctl.log"
DRV="$H/state/natural18/round-$N-driver.log"
cd "$ROOT"
echo "[$(date -u +%H:%M:%S)] natural 18, round $N: launching on instance $INST" >> "$CTL"
# (the path handed to node in Windows form: a /c/... path resolves to C:\c\...)
KNOWENV=(); if [ "$FRESH" = "1" ]; then KNOWF="$H/state/natural18/round-$N-strokes.jsonl"; : > "$KNOWF"; KNOWENV=(HARNESS_KNOW="$(cygpath -w "$KNOWF")"); fi
env HARNESS_INSTANCE=$INST "${KNOWENV[@]}" node tools/harness/driver.mjs --port "$PORT" --state "$H/state/saves/menu-holes.sav" > "$DRV" 2>&1 &
DRIVER=$!
for i in $(seq 1 60); do grep -q "driver up" "$DRV" 2>/dev/null && break; sleep 2; done
DPID=$(grep -o "dolphin pid [0-9]*" "$DRV" | grep -o "[0-9]*$")
powershell -NoProfile -Command "
Add-Type @'
using System; using System.Runtime.InteropServices;
public class NL { [DllImport(\"user32.dll\")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f); [DllImport(\"user32.dll\", CharSet = CharSet.Unicode)] public static extern bool SetWindowText(IntPtr h, string s); }
'@
\$p = Get-Process -Id $DPID; for (\$i = 0; \$i -lt 30 -and \$p.MainWindowHandle -eq 0; \$i++) { Start-Sleep 1; \$p.Refresh() }
\$p.PriorityClass = 'AboveNormal'
[NL]::SetWindowPos(\$p.MainWindowHandle, [IntPtr]::Zero, $X, $Y, $W, $HT, 0x0040) | Out-Null
[NL]::SetWindowText(\$p.MainWindowHandle, 'Natural 18 (no savestates in play) | round $N') | Out-Null
"
sleep 4
if [ "$FRESH" = "1" ]; then IDLE=$(( (RANDOM % 86) + 5 )); echo "[$(date -u +%H:%M:%S)] fresh draw: idling ${IDLE} s on Number of Holes; the planner's memory: $KNOWF (empty)" >> "$CTL"; HARNESS_DRIVER_PORT=$PORT node tools/harness/drive.mjs wait "$((IDLE * 1000))" >> "$CTL" 2>&1; fi
node tools/harness/round-start.mjs --port "$PORT" >> "$LOG" 2>&1
node tools/harness/round-ctl.mjs --port "$PORT" --from 1 --to 18 --log "state/natural18/round-$N.log" --out "results/natural18/round-$N.json" --label "Natural 18 #$N" >> "$CTL" 2>&1
echo "round $N over" >> "$CTL"
wait $DRIVER
