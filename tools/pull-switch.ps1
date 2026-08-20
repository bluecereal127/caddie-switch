# Pull new captures straight off the Switch over USB (MTP) into captures\inbox.
#
#   Switch: System Settings > Data Management > Manage Screenshots and Videos
#           > Copy to a Computer via USB Connection
#   PC:     npm run pull:usb   (or double-click tools\pull-switch.cmd)
#
# The Switch shows up as an MTP device (no drive letter), so this walks it via
# the Shell COM API. Every image/video not already in captures\inbox or
# captures\imported gets copied, keeping the original timestamped filename
# (which tools\ingest.mjs relies on for ordering).
param(
  [string]$Dest = (Join-Path (Split-Path $PSScriptRoot -Parent) "captures\inbox")
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $Dest | Out-Null
$importedDir = Join-Path (Split-Path $Dest -Parent) "imported"

# names we already have, anywhere under captures\
$have = @{}
foreach ($d in @($Dest, $importedDir)) {
  if (Test-Path $d) {
    Get-ChildItem $d -Recurse -File | ForEach-Object { $have[$_.Name] = $true }
  }
}

$shell = New-Object -ComObject Shell.Application
$computer = $shell.NameSpace(17)  # "This PC"
$device = @($computer.Items()) | Where-Object { $_.IsFolder -and $_.Name -match "Switch" } | Select-Object -First 1
if ($null -eq $device) {
  Write-Host "No Nintendo Switch device visible." -ForegroundColor Yellow
  Write-Host "On the console: System Settings > Data Management > Manage Screenshots and Videos > Copy to a Computer via USB Connection, then re-run."
  exit 1
}
Write-Host "Found device: $($device.Name)"

function Get-MtpMedia($folder) {
  foreach ($item in @($folder.Items())) {
    if ($item.IsFolder) { Get-MtpMedia $item.GetFolder }
    elseif ($item.Name -match "\.(jpg|jpeg|png|mp4)$") { $item }
  }
}

$destNs = $shell.NameSpace((Resolve-Path $Dest).Path)
$media = @(Get-MtpMedia $device.GetFolder)
$new = @($media | Where-Object { -not $have[$_.Name] })
Write-Host "$($media.Count) files on device, $($new.Count) new"

$copied = 0
foreach ($item in $new) {
  $destNs.CopyHere($item, 4 + 16)  # no progress UI, yes-to-all
  $target = Join-Path $Dest $item.Name
  $tries = 0
  while (-not (Test-Path $target) -and $tries -lt 120) { Start-Sleep -Milliseconds 250; $tries++ }
  if (Test-Path $target) { $copied++; Write-Host "  + $($item.Name)" }
  else { Write-Host "  ! timed out waiting for $($item.Name)" -ForegroundColor Yellow }
}
Write-Host "Copied $copied new file(s) to $Dest" -ForegroundColor Green
