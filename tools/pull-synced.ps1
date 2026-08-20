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
  $candidates = @(
    (Join-Path $env:OneDrive "Pictures\Camera Roll"),
    (Join-Path $env:OneDrive "Pictures\Screenshots"),
    (Join-Path $env:USERPROFILE "Pictures\iCloud Photos\Photos"),
    (Join-Path $env:USERPROFILE "Pictures\Camera Roll")
  ) | Where-Object { $_ -and (Test-Path $_) }
  if ($candidates.Count -eq 0) {
    Write-Host "No sync folder found automatically - pass one with -Source <path>" -ForegroundColor Yellow
    exit 1
  }
  $Source = $candidates[0]
}
Write-Host "Sweeping: $Source"
New-Item -ItemType Directory -Force $Dest | Out-Null
$importedDir = Join-Path (Split-Path $Dest -Parent) "imported"

$have = @{}
foreach ($d in @($Dest, $importedDir)) {
  if (Test-Path $d) {
    Get-ChildItem $d -Recurse -File | ForEach-Object { $have[$_.Name] = $true }
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
  if ($have[$f.Name] -or $have[$name]) { continue }
  if (-not (Test-SwitchCapture $f)) { continue }
  Copy-Item $f.FullName (Join-Path $Dest $name)
  $have[$name] = $true
  $copied++
  Write-Host "  + $name"
}
Write-Host "Copied $copied new capture(s) to $Dest" -ForegroundColor Green
