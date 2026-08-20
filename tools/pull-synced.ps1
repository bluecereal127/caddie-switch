# Sweep Switch captures out of a phone-synced folder into captures\inbox.
#
# Use when captures reach the PC through the phone (Nintendo Switch app ->
# Save -> camera roll -> OneDrive/iCloud/Phone Link auto-sync) instead of USB.
#
#   npm run pull:sync                          # auto-detect common sync dirs
#   powershell -File tools\pull-synced.ps1 -Source "D:\Some\Sync\Folder"
#
# Only takes files that are clearly Switch captures: original timestamped
# name (16 digits + dash), or a JPG/PNG that is exactly 1280x720. Files that
# lost their original name (e.g. iOS renames to IMG_xxxx) get prefixed with
# their file time so tools\ingest.mjs still sorts them chronologically.
param(
  [string]$Source = "",
  [string]$Dest = (Join-Path (Split-Path $PSScriptRoot -Parent) "captures\inbox")
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not $Source) {
  # build the list defensively: Join-Path throws on an empty base under
  # ErrorActionPreference=Stop, and a one-element Where-Object result is a
  # scalar string ($x[0] would index a CHARACTER), hence the @() around it
  $roots = @()
  if ($env:OneDrive) {
    $roots += (Join-Path $env:OneDrive "Pictures\Camera Roll")
    $roots += (Join-Path $env:OneDrive "Pictures\Screenshots")
  }
  $roots += (Join-Path $env:USERPROFILE "Pictures\iCloud Photos\Photos")
  $roots += (Join-Path $env:USERPROFILE "Pictures\Camera Roll")
  $candidates = @($roots | Where-Object { Test-Path $_ })
  if ($candidates.Count -eq 0) {
    Write-Host "No sync folder found automatically - pass one with -Source <path>" -ForegroundColor Yellow
    exit 1
  }
  $Source = $candidates[0]
}
Write-Host "Sweeping: $Source"
New-Item -ItemType Directory -Force $Dest | Out-Null
$importedDir = Join-Path (Split-Path $Dest -Parent) "imported"

$have = @{}      # exact names we already hold
$haveOrig = @{}  # "originalName|size" for files we renamed with a time prefix —
                 # keyed this way because cloud sync can shift LastWriteTime
                 # between runs, which would change the synthesized name
foreach ($d in @($Dest, $importedDir)) {
  if (Test-Path $d) {
    Get-ChildItem $d -Recurse -File | ForEach-Object {
      $have[$_.Name] = $true
      if ($_.Name -match "^\d{16}-(.+)$") { $haveOrig["$($matches[1])|$($_.Length)"] = $true }
    }
  }
}

function Test-SwitchCapture($file) {
  if ($file.Name -match "^\d{16}-") { return $true }
  if ($file.Extension -notmatch "^\.(jpg|jpeg|png)$") { return $false }
  try {
    $img = [System.Drawing.Image]::FromFile($file.FullName)
    $ok = ($img.Width -eq 1280 -and $img.Height -eq 720)
    $img.Dispose()
    return $ok
  } catch { return $false }
}

$copied = 0
$files = Get-ChildItem $Source -Recurse -File | Where-Object { $_.Extension -match "^\.(jpg|jpeg|png|mp4)$" }
foreach ($f in $files) {
  # normalize: keep original Switch names, otherwise prefix file time for sort order
  $name = $f.Name
  if ($name -notmatch "^\d{16}-") { $name = "{0:yyyyMMddHHmmss}00-{1}" -f $f.LastWriteTime, $f.Name }
  if ($have[$f.Name] -or $have[$name] -or $haveOrig["$($f.Name)|$($f.Length)"]) { continue }
  if (-not (Test-SwitchCapture $f)) { continue }
  Copy-Item $f.FullName (Join-Path $Dest $name)
  $have[$name] = $true
  $haveOrig["$($f.Name)|$($f.Length)"] = $true
  $copied++
  Write-Host "  + $name"
}
Write-Host "Copied $copied new capture(s) to $Dest" -ForegroundColor Green
