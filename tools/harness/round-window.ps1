# Keeps a natural round's Dolphin window in view: every 30 seconds it is put
# back on top of every other window (where the user moved it, without taking
# focus), and every second its title becomes the round's progress, read from
# the round's log (round-play.mjs): the hole being played and the score to par
# as the game counted it over the finished holes. For a 3-hole course attempt
# (-Label, -Holes 3) also the course's best finished attempt so far, read from
# its attempts.json (-Best, course-supervisor.mjs writes it as each attempt
# ends), e.g. "Resort A #3 | Hole 2 (2/3) | Score -1 (thru 1) | Best -4 (3-2-3, #1)".
#   powershell -File tools/harness/round-window.ps1 [-Log tools/harness/state/round18.log] [-Round 1] [-Instance 18]
#     [-Label "Classic A #3" -Holes 3 -Best tools/harness/results/courses/classic-a/attempts.json]
#     [-DolphinPid N]   (that Dolphin's window only, instead of the first one found for the instance)
param(
  [string]$Log = "$PSScriptRoot\state\round18.log",
  [int]$Round = 1,
  [int]$Instance = 18,
  [string]$Label = "",
  [int]$Holes = 18,
  [string]$Best = "",
  [int]$DolphinPid = 0,
  [switch]$Once   # print the title once and exit (a check; the window is not touched)
)
Add-Type @"
using System; using System.Runtime.InteropServices;
public class RoundWin {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SetWindowText(IntPtr h, string s);
}
"@
# the 18-hole course's pars (src/App.jsx PARS)
$par = @{ 1=4; 2=3; 3=5; 4=3; 5=5; 6=4; 7=4; 8=3; 9=5; 10=4; 11=3; 12=5; 13=3; 14=5; 15=4; 16=4; 17=3; 18=5 }
$TOPMOST = [IntPtr](-1)
$FLAGS = 0x1 -bor 0x2 -bor 0x10 -bor 0x40   # no size, no move, no activate, show
$procId = if ($DolphinPid) { $DolphinPid } else { $null }

# the course's best finished attempt (lowest score to par, the earliest of
# equals) as " | Best -4 (3-2-3, #1)", re-read only when attempts.json changes;
# a read that fails (the supervisor writing it) keeps the last text
$bestCache = @{ t = $null; text = "" }
function BestText {
  if (-not $Best) { return "" }
  try {
    if (-not (Test-Path $Best)) { return " | Best: none yet" }
    $t = (Get-Item $Best).LastWriteTimeUtc
    if ($t -ne $bestCache.t) {
      $arr = Get-Content -Raw $Best | ConvertFrom-Json
      $done = @($arr) | Where-Object { $_.complete -eq $true }
      if (-not $done) { $bestCache.text = " | Best: none yet" }
      else {
        $b = $done | Sort-Object @{ e = { [int]$_.toPar } }, @{ e = { [int]$_.n } } | Select-Object -First 1
        $hs = ($b.holes.PSObject.Properties | Sort-Object { [int]$_.Name } | ForEach-Object { $_.Value }) -join "-"
        $tp = [int]$b.toPar
        $s = if ($tp -eq 0) { "E" } elseif ($tp -gt 0) { "+$tp" } else { "$tp" }
        $bestCache.text = " | Best $s ($hs, #$($b.n))"
      }
      $bestCache.t = $t
    }
  } catch { }
  return $bestCache.text
}

function Find-Round {
  $p = Get-CimInstance Win32_Process -Filter "Name = 'Dolphin.exe'" | Where-Object { $_.CommandLine -match "\\user$Instance " -or $_.CommandLine -match "\\user$Instance`"" -or $_.CommandLine -match "\\user$Instance$" }
  if ($p) { return @($p)[0].ProcessId } else { return $null }
}

function Title {
  $name = if ($Label) { $Label } else { "Round $Round" }
  if (-not (Test-Path $Log)) { return "$name | starting$(BestText)" }
  $lines = Get-Content $Log
  $start = $null; $hole = 0; $counts = @{}; $done = $false
  foreach ($l in $lines) {
    if ($l -match '^\[(\d\d):(\d\d):(\d\d)\] hole (\d+): start') {
      if (-not $start -and [int]$Matches[4] -eq 1) { $start = [datetime]::UtcNow.Date.AddHours([int]$Matches[1]).AddMinutes([int]$Matches[2]).AddSeconds([int]$Matches[3]) }
      $hole = [Math]::Max($hole, [int]$Matches[4])
    } elseif ($l -match 'hole (\d+): \d+ strokes struck, the game counts (\d+)') {
      if ([int]$Matches[2] -gt 0) { $counts[[int]$Matches[1]] = [int]$Matches[2] }
    }
  }
  $toPar = 0
  foreach ($h in $counts.Keys) { $toPar += $counts[$h] - $par[$h] }
  $score = if ($toPar -eq 0) { "E" } elseif ($toPar -gt 0) { "+$toPar" } else { "$toPar" }
  $el = if ($start) { [datetime]::UtcNow - $start } else { [timespan]::Zero }
  if ($el.TotalSeconds -lt 0) { $el = $el.Add([timespan]::FromDays(1)) }
  $elapsed = if ($el.TotalHours -ge 1) { "{0}:{1:mm\:ss}" -f [int][Math]::Floor($el.TotalHours), $el } else { "{0:mm\:ss}" -f $el }
  if ($counts.Count -ge $Holes) { return "$name FINAL | Score $score$(BestText)" }
  $shown = [Math]::Max(1, $hole)
  if ($Label) { return "$Label | Hole $shown ($([Math]::Min($Holes, $counts.Count + 1))/$Holes) | Score $score (thru $($counts.Count))$(BestText)" }
  return "Hole $shown/18 | Score $score (thru $($counts.Count)) | Round $Round"
}

if ($Once) { Title; exit 0 }

$tick = 0
while ($true) {
  try {
    # bound to the first Dolphin found for this round (or the one -DolphinPid
    # names): when it closes the round is over, and the next round's Dolphin on
    # the same instance has a keeper of its own (two keepers on one window
    # raced their titles)
    if (-not $procId) { $procId = Find-Round; $tick = 0 }
    elseif (-not (Get-Process -Id $procId -ErrorAction SilentlyContinue)) { exit 0 }
    if ($procId) {
      $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
      if ($p -and $p.MainWindowHandle -ne 0) {
        if ($tick % 30 -eq 0) { [RoundWin]::SetWindowPos($p.MainWindowHandle, $TOPMOST, 0, 0, 0, 0, $FLAGS) | Out-Null }
        # a new title only when it changes (the hole or the score), and again
        # every 30 s in case Dolphin set its own: four windows retitled every
        # second kept Windows Explorer (the taskbar) busy on 10 of 32 cores
        $t = Title
        if ($t -ne $lastTitle -or $tick % 30 -eq 0) { [RoundWin]::SetWindowText($p.MainWindowHandle, $t) | Out-Null; $lastTitle = $t }
      }
    }
  } catch { }
  $tick++
  Start-Sleep -Seconds 1
}
