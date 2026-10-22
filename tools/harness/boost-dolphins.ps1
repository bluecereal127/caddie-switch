# Keeps the harness's Dolphins at AboveNormal priority, every -Every seconds,
# so the emulators run at full speed and the planners (node, Normal) take the
# CPU they leave (the user, 2026-10-22: "make sure that the dolphin instances
# are running as close to full speed as possible"; with 18 instances on this
# 16-core machine a try took 26 s against 15 s with 6). Only the Dolphins
# whose command line names one of the instances' user dirs (state\user<N>)
# are touched: the user's own Dolphin has none. Stops after -Hours.
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/harness/boost-dolphins.ps1 -Instance 1,2,3 [-Every 30] [-Hours 48]
# -Instance is one comma list ("1,2,3"): under -File a list arrives as a single string
param([string]$Instance, [int]$Every = 30, [double]$Hours = 48)
$dirs = @($Instance -split "[,\s]+" | Where-Object { $_ } | ForEach-Object { "state\user$_ " })
$until = (Get-Date).AddHours($Hours)
while ((Get-Date) -lt $until) {
  Get-CimInstance Win32_Process -Filter "name='Dolphin.exe'" | Where-Object { $cl = $_.CommandLine; $cl -and @($dirs | Where-Object { $cl.Contains($_) }).Count } | ForEach-Object {
    try { $p = Get-Process -Id $_.ProcessId -ErrorAction Stop; if ($p.PriorityClass -ne 'AboveNormal') { $p.PriorityClass = 'AboveNormal' } } catch { }
  }
  Start-Sleep -Seconds $Every
}
