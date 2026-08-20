# Netlify Forms autosync — the PC half of the iPhone share-sheet upload path.
#
#   npm run autosync          # visible console loop, polls every 60s
#   ... -Once                 # single poll (for testing)
#   ... -KeepRemote           # don't delete submissions after download
#
# Polls the "captures" form's submissions via the Netlify API, downloads each
# new batch (zip or single images), expands zips, normalizes names, and drops
# everything into captures\inbox. Remote submissions are deleted only after
# every file is verified on disk (disable with -KeepRemote). Processed
# submission ids are remembered in captures\.autosync-state.json.
#
# One-time setup: copy tools\netlify.example.json to tools\netlify.json and
# paste a Personal Access Token (app.netlify.com > User settings >
# Applications > New access token). "site" is only needed if the token can
# see more than one site.
param(
  [int]$IntervalSec = 60,
  [switch]$Once,
  [switch]$KeepRemote
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$root = Split-Path $PSScriptRoot -Parent
$inbox = Join-Path $root "captures\inbox"
$importedDir = Join-Path $root "captures\imported"
$tmpRoot = Join-Path $root "captures\.autosync-tmp"
$statePath = Join-Path $root "captures\.autosync-state.json"
New-Item -ItemType Directory -Force $inbox | Out-Null

$cfgPath = Join-Path $PSScriptRoot "netlify.json"
if (-not (Test-Path $cfgPath)) {
  Write-Host "Missing tools\netlify.json - copy netlify.example.json and paste your token." -ForegroundColor Yellow
  exit 1
}
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
if (-not $cfg.token -or $cfg.token -like "*PASTE*") {
  Write-Host "tools\netlify.json has no real token yet." -ForegroundColor Yellow
  exit 1
}
$H = @{ Authorization = "Bearer $($cfg.token)" }
$api = "https://api.netlify.com/api/v1"

# resolve site once
try { $sites = @(Invoke-RestMethod "$api/sites" -Headers $H) }
catch {
  Write-Host "Netlify API rejected the token or is unreachable: $($_.Exception.Message)" -ForegroundColor Yellow
  exit 1
}
$site = $null
if ($cfg.site) { $site = $sites | Where-Object { $_.name -eq $cfg.site -or $_.custom_domain -eq $cfg.site -or $_.default_domain -eq $cfg.site } | Select-Object -First 1 }
elseif ($sites.Count -eq 1) { $site = $sites[0] }
if ($null -eq $site) {
  Write-Host "Could not pick a site. Sites this token sees:" -ForegroundColor Yellow
  $sites | ForEach-Object { Write-Host "  $($_.name)  ($($_.default_domain))" }
  Write-Host "Set `"site`" in tools\netlify.json to one of those names."
  exit 1
}
Write-Host "Watching form 'captures' on $($site.default_domain) (every ${IntervalSec}s, Ctrl+C to stop)" -ForegroundColor Green

# processed-submission memory
$state = @{}
if (Test-Path $statePath) {
  foreach ($id in @(Get-Content $statePath -Raw | ConvertFrom-Json)) { $state[$id] = $true }
}
function Save-State { Set-Content -Path $statePath -Value (ConvertTo-Json @($state.Keys)) -Encoding utf8 }

function Get-HaveNames {
  $have = @{}
  foreach ($d in @($inbox, $importedDir)) {
    if (Test-Path $d) { Get-ChildItem $d -Recurse -File | ForEach-Object { $have[$_.Name] = $true } }
  }
  $have
}

function Download-File($url, $dest) {
  try { Invoke-WebRequest -Uri $url -Headers $H -OutFile $dest -UseBasicParsing }
  catch { Invoke-WebRequest -Uri "$url`?access_token=$($cfg.token)" -OutFile $dest -UseBasicParsing }
}

function Process-Submission($sub) {
  $stamp = ([DateTime]::Parse($sub.created_at)).ToLocalTime().ToString("yyyyMMddHHmmss")
  $tmp = Join-Path $tmpRoot $sub.id
  New-Item -ItemType Directory -Force $tmp | Out-Null
  $mediaExt = "^\.(jpg|jpeg|png|mp4)$"

  # collect every file-upload field on the submission
  $downloads = @()
  foreach ($p in $sub.data.PSObject.Properties) {
    $v = $p.Value
    if ($v -is [System.Management.Automation.PSCustomObject] -and $v.url) { $downloads += $v }
  }
  if ($downloads.Count -eq 0) { return 0 }

  $staged = @()
  foreach ($d in $downloads) {
    $fn = if ($d.filename) { Split-Path $d.filename -Leaf } else { Split-Path ([Uri]$d.url).LocalPath -Leaf }
    $local = Join-Path $tmp $fn
    Download-File $d.url $local
    if ($d.size -and (Get-Item $local).Length -ne [long]$d.size) { throw "size mismatch downloading $fn" }
    if ($fn -match "\.zip$") {
      $exDir = Join-Path $tmp ("x_" + [IO.Path]::GetFileNameWithoutExtension($fn))
      Expand-Archive -Path $local -DestinationPath $exDir -Force
      $staged += @(Get-ChildItem $exDir -Recurse -File | Where-Object { $_.Extension -match $mediaExt } | Sort-Object Name)
    } elseif ($fn -match $mediaExt.Replace("^\.", "\.")) {
      $staged += (Get-Item $local)
    }
  }

  $have = Get-HaveNames
  $copied = 0; $seq = 0
  foreach ($f in $staged) {
    $name = $f.Name
    if ($name -notmatch "^\d{16}-") { $name = "{0}{1:d2}-{2}" -f $stamp, $seq, $f.Name }
    $seq++
    if ($have[$name] -or $have[$f.Name]) { continue }
    Copy-Item $f.FullName (Join-Path $inbox $name)
    $have[$name] = $true; $copied++
    Write-Host "    + $name"
  }
  Remove-Item -Recurse -Force $tmp
  return $copied
}

while ($true) {
  try {
    $forms = @(Invoke-RestMethod "$api/sites/$($site.id)/forms" -Headers $H)
    $form = $forms | Where-Object { $_.name -eq "captures" } | Select-Object -First 1
    if ($null -eq $form) {
      Write-Host "$(Get-Date -Format HH:mm:ss) form 'captures' not registered yet - deploy the site once with the hidden form in index.html"
    } else {
      $subs = @(Invoke-RestMethod "$api/forms/$($form.id)/submissions" -Headers $H)
      $new = @($subs | Where-Object { -not $state.ContainsKey($_.id) })
      if ($new.Count -gt 0) {
        Write-Host "$(Get-Date -Format HH:mm:ss) $($new.Count) new submission(s)"
        foreach ($sub in $new) {
          try {
            $n = Process-Submission $sub
            Write-Host "  submission $($sub.id): $n file(s) -> captures\inbox"
            if (-not $KeepRemote) {
              Invoke-RestMethod "$api/submissions/$($sub.id)" -Headers $H -Method Delete | Out-Null
            }
            $state[$sub.id] = $true; Save-State
          } catch {
            Write-Host "  submission $($sub.id) failed: $($_.Exception.Message) (kept remote, will retry)" -ForegroundColor Yellow
          }
        }
      } else {
        Write-Host "$(Get-Date -Format HH:mm:ss) nothing new"
      }
    }
  } catch {
    Write-Host "$(Get-Date -Format HH:mm:ss) poll error: $($_.Exception.Message)" -ForegroundColor Yellow
  }
  if ($Once) { break }
  Start-Sleep -Seconds $IntervalSec
}
