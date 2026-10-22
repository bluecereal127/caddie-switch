#!/usr/bin/env bash
# One natural 18-hole round, start to finish, on its own harness instance:
# a driver Dolphin booted on the "Number of Holes" menu (saves/menu-holes.sav),
# its window placed at X,Y (1024x600) above other windows by round-window.ps1,
# the game's menus walked to hole 1 (round-start.mjs), then the round played
# hole by hole (round-ctl.mjs -> round-play.mjs), logged to state/round-rR.log
# and results/round-rR.json. The driver is left running at the end so the
# final screen stays up.
#   bash tools/harness/round-launch.sh <instance> <port> <round> <x> <y>
set -u
INST=$1; PORT=$2; R=$3; X=$4; Y=$5
H="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$H/../.." && pwd)"
LOG="$H/state/round-r$R.log"
cd "$ROOT"
HARNESS_INSTANCE=$INST node tools/harness/driver.mjs --port "$PORT" --state "$H/state/saves/menu-holes.sav" > "$H/state/round-r$R-driver.log" 2>&1 &
DRIVER=$!
for i in $(seq 1 60); do grep -q "driver up" "$H/state/round-r$R-driver.log" 2>/dev/null && break; sleep 2; done
DPID=$(grep -o "dolphin pid [0-9]*" "$H/state/round-r$R-driver.log" | grep -o "[0-9]*$")
powershell -NoProfile -Command "
Add-Type @'
using System; using System.Runtime.InteropServices;
public class RL { [DllImport(\"user32.dll\")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f); }
'@
\$p = Get-Process -Id $DPID; for (\$i = 0; \$i -lt 30 -and \$p.MainWindowHandle -eq 0; \$i++) { Start-Sleep 1; \$p.Refresh() }
\$p.PriorityClass = 'AboveNormal'
[RL]::SetWindowPos(\$p.MainWindowHandle, [IntPtr](-1), $X, $Y, 1024, 600, 0x0040) | Out-Null
"
sleep 4
node tools/harness/round-start.mjs --port "$PORT" >> "$LOG" 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "$H/round-window.ps1" -Log "$LOG" -Round "$R" -Instance "$INST" > /dev/null 2>&1 &
node tools/harness/round-ctl.mjs --port "$PORT" --log "state/round-r$R.log" --out "results/round-r$R.json" >> "$H/state/round-r$R-ctl.log" 2>&1
echo "round $R over"
wait $DRIVER
