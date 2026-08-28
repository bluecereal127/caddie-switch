# Caddie autosync — the PC half of the iPhone share-sheet upload path.
#
#   npm run autosync          # visible console loop, polls every 60s
#   ... -Once                 # single poll (for testing)
#   ... -KeepRemote           # don't delete after download
#   ... -Forms                # ALSO drain the legacy Netlify Forms inbox
#
# Drains the "captures" BLOB STORE that netlify/edge-functions/upload.js
# writes into: downloads each new upload (zip or single images), expands zips,
# normalizes names, drops everything into captures\inbox, then deletes the
# blob. Netlify Forms is NOT polled by default — that transport was metered
# per submission and cost real money, index.html no longer declares the form,
# and nothing new can arrive through it. -Forms re-enables the old drain for
# stragglers only.
#
# One-time setup: copy tools\netlify.example.json to tools\netlify.json and
# paste a Personal Access Token (app.netlify.com > User settings >
# Applications > New access token). "site" is only needed if the token can
# see more than one site.
param(
  [int]$IntervalSec = 60,
  [switch]$Once,
  [switch]$KeepRemote,
  [switch]$Forms
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$root = Split-Path $PSScriptRoot -Parent
$inbox = Join-Path $root "captures\inbox"
$importedDir = Join-Path $root "captures\imported"
$tmpRoot = Join-Path $root "captures\.autosync-tmp"
$statePath = Join-Path $root "captures\.autosync-state.json"
New-Item -ItemType Directory -Force $inbox | Out-Null

try { $Host.UI.RawUI.WindowTitle = "Caddie autosync" } catch {}

# disable console QuickEdit so an accidental click inside the window can't
# select text and freeze the loop (the classic "it stopped because I clicked
# it" trap); Ctrl+C still stops it deliberately
try {
  $sig = '[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int h); [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h, out uint m); [DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr h, uint m);'
  $k = Add-Type -MemberDefinition $sig -Name ConMode -Namespace Win32 -PassThru
  $hIn = $k::GetStdHandle(-10); $mode = [uint32]0
  if ($k::GetConsoleMode($hIn, [ref]$mode)) {
    $k::SetConsoleMode($hIn, ($mode -band (-bnot [uint32]0x40)) -bor [uint32]0x80) | Out-Null
  }
} catch {}

# console + captures\autosync.log (also survives the window being closed;
# trimmed when it passes ~1 MB)
$logPath = Join-Path $root "captures\autosync.log"
function Log($msg, $color) {
  if ($color) { Write-Host $msg -ForegroundColor $color } else { Write-Host $msg }
  try {
    if ((Test-Path $logPath) -and (Get-Item $logPath).Length -gt 1MB) {
      $tail = Get-Content $logPath -Tail 200
      Set-Content -Path $logPath -Value $tail -Encoding utf8
    }
    Add-Content -Path $logPath -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" -Encoding utf8
  } catch {}
}

$cfgPath = Join-Path $PSScriptRoot "netlify.json"
if (-not (Test-Path $cfgPath)) {
  Log "Missing tools\netlify.json - copy netlify.example.json and paste your token." "Yellow"
  exit 1
}
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
if (-not $cfg.token -or $cfg.token -like "*PASTE*") {
  Log "tools\netlify.json has no real token yet." "Yellow"
  exit 1
}
$H = @{ Authorization = "Bearer $($cfg.token)" }
$api = "https://api.netlify.com/api/v1"

# single-instance lock — two pollers collide on tmp files and double-download
$mutex = New-Object System.Threading.Mutex($false, "CaddieAutosyncMutex")
if (-not $mutex.WaitOne(0)) {
  Log "another autosync instance is already running - exiting" "Yellow"
  exit 0
}

# resolve site once. NOTE: PS 5.1 Invoke-RestMethod emits a JSON array as ONE
# object, so @(IRM ...) double-wraps and Where-Object never filters — the
# ForEach-Object re-emission forces real enumeration. Same below.
try { $sites = @((Invoke-RestMethod "$api/sites" -Headers $H) | ForEach-Object { $_ }) }
catch {
  Log "Netlify API rejected the token or is unreachable: $($_.Exception.Message)" "Yellow"
  exit 1
}
$site = $null
if ($cfg.site) { $site = $sites | Where-Object { $_.name -eq $cfg.site -or $_.custom_domain -eq $cfg.site -or $_.default_domain -eq $cfg.site } | Select-Object -First 1 }
elseif ($sites.Count -eq 1) { $site = $sites[0] }
if ($null -eq $site) {
  Log "Could not pick a site. Sites this token sees:" "Yellow"
  $sites | ForEach-Object { Log "  $($_.name)  ($($_.default_domain))" }
  Log "Set `"site`" in tools\netlify.json to one of those names."
  exit 1
}
Log "Draining capture uploads from $($site.default_domain) blob store (every ${IntervalSec}s)" "Green"

# processed-submission memory
$state = @{}
if (Test-Path $statePath) {
  foreach ($id in @((Get-Content $statePath -Raw | ConvertFrom-Json) | ForEach-Object { $_ })) { $state[$id] = $true }
}
function Save-State { Set-Content -Path $statePath -Value (ConvertTo-Json @($state.Keys)) -Encoding utf8 }

# dedupe index: names AND content hashes. iOS gives every share of the same
# photo a fresh UUID suffix, so a re-shared batch has all-new filenames —
# only the content hash catches those.
function Get-HaveIndex {
  $names = @{}; $hashes = @{}
  foreach ($d in @($inbox, $importedDir)) {
    if (Test-Path $d) {
      Get-ChildItem $d -Recurse -File | ForEach-Object {
        $names[$_.Name] = $true
        $hashes[(Get-FileHash $_.FullName -Algorithm MD5).Hash] = $true
      }
    }
  }
  @{ names = $names; hashes = $hashes }
}

# After new files land: classify them (template OCR, no agents), and if any
# catalog frames (map/green/heightmap) were recognized, rebuild the derived
# data and push — Netlify redeploys, the app picks it up on next load.
function Invoke-Pipeline {
  try {
    $out = & node (Join-Path $PSScriptRoot "classify.mjs") | Out-String
    foreach ($line in ($out -split "`n")) { if ($line.Trim()) { Log ("  " + $line.Trim()) } }
    if ($out -match "CLASSIFIED catalog=(\d+) other=(\d+)") {
      $n = [int]$matches[1] + [int]$matches[2]   # pop-ups count too: they carry shots
      if ($n -gt 0) {
        Log "pipeline: $n new frame(s) - rebuilding derived data"
        & node (Join-Path $PSScriptRoot "extract-maps.mjs") | Out-Null
        & node (Join-Path $PSScriptRoot "extract-greens.mjs") | Out-Null
        & node (Join-Path $PSScriptRoot "assemble-shots.mjs") | Out-Null
        & node (Join-Path $PSScriptRoot "build-derived.mjs") | Out-Null
        $changed = git -C $root status --porcelain -- src/maps.js src/mapxform.js public/derived.json
        if ($changed) {
          git -C $root add src/maps.js src/mapxform.js public/derived.json | Out-Null
          git -C $root commit -m "Auto: derived data refresh from new captures" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" | Out-Null
          git -C $root push origin main | Out-Null
          Log "pipeline: pushed derived-data refresh (site redeploying)" "Green"
        } else { Log "pipeline: no derived-data changes" }
      }
    }
  } catch { Log "pipeline error: $($_.Exception.Message)" "Yellow" }
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

  $copied = Ingest-Staged $staged $stamp
  Remove-Item -Recurse -Force $tmp
  return $copied
}

# Shared ingest: canonicalize names, dedupe by name + content hash, copy to
# the inbox. The Switch app names photos "YYYYMMDD-<ULID>"; iOS appends a
# fresh UUID per share — canonicalizing to the stable stem gives
# chronological sort order (ULIDs are time-ordered) AND name-level dedupe
# across re-shares.
function Ingest-Staged($staged, $stamp) {
  $have = Get-HaveIndex
  $copied = 0; $seq = 0
  foreach ($f in $staged) {
    $name = $f.Name
    if ($name -match "(\d{8}-[0-9A-HJKMNP-TV-Z]{26})") { $name = $matches[1] + $f.Extension.ToLower() }
    elseif ($name -notmatch "^\d{16}-") { $name = "{0}{1:d2}-{2}" -f $stamp, $seq, $f.Name }
    $seq++
    if ($have.names[$name] -or $have.names[$f.Name]) { continue }
    $hash = (Get-FileHash $f.FullName -Algorithm MD5).Hash
    if ($have.hashes[$hash]) { continue }
    Copy-Item $f.FullName (Join-Path $inbox $name)
    $have.names[$name] = $true; $have.hashes[$hash] = $true; $copied++
    Log "    + $name"
  }
  return $copied
}

# Drain the "captures" blob store filled by the edge function (uploads now
# bypass Netlify Forms entirely so nothing is metered). Blob keys look like
# "<ms>-<rand>-<originalName>"; download, unzip if needed, ingest, delete.
function Sync-Blobs {
  $copied = 0
  try {
    $list = Invoke-RestMethod "$api/blobs/$($site.id)/site:captures" -Headers $H
    $keys = @($list.blobs | Where-Object { $_ } | ForEach-Object { $_.key })
    if (-not $keys.Count) { return 0 }
    Log "$($keys.Count) blob upload(s)"
    $mediaExt = "^\.(jpg|jpeg|png|mp4)$"
    foreach ($k in $keys) {
      try {
        $tmp = Join-Path $tmpRoot ("blob_" + [Guid]::NewGuid().ToString("n"))
        New-Item -ItemType Directory -Force $tmp | Out-Null
        $fn = ($k -replace "^\d+-\d+-", "")
        if (-not $fn) { $fn = $k }
        $local = Join-Path $tmp $fn
        Invoke-WebRequest -Uri "$api/blobs/$($site.id)/site:captures/$k" -Headers $H -OutFile $local -UseBasicParsing
        $staged = @()
        if ($fn -match "\.zip$") {
          $exDir = Join-Path $tmp "x"
          Expand-Archive -Path $local -DestinationPath $exDir -Force
          $staged = @(Get-ChildItem $exDir -Recurse -File | Where-Object { $_.Extension -match $mediaExt } | Sort-Object Name)
        } elseif ((Get-Item $local).Extension -match $mediaExt) {
          $staged = @(Get-Item $local)
        }
        $stamp = (Get-Date).ToString("yyyyMMddHHmmss")
        $n = Ingest-Staged $staged $stamp
        $copied += $n
        Invoke-RestMethod "$api/blobs/$($site.id)/site:captures/$k" -Headers $H -Method Delete | Out-Null
        Remove-Item -Recurse -Force $tmp
      } catch {
        Log "  blob $k failed: $($_.Exception.Message) (kept, will retry)" "Yellow"
      }
    }
  } catch {
    Log "blob poll error: $($_.Exception.Message)" "Yellow"
  }
  return $copied
}

# LEGACY (opt-in with -Forms): drain the old Netlify Forms "captures" form.
# Uploads have not used Forms since 2026-08-20 and index.html no longer
# declares the form, so nothing new can ever arrive here — every submission
# was metered and billed, which is exactly why the transport moved to the
# edge function + blob store. Kept only to rescue stragglers that were
# already sitting in the account when the switch happened.
function Sync-Forms {
  $copied = 0
  $forms = @((Invoke-RestMethod "$api/sites/$($site.id)/forms" -Headers $H) | ForEach-Object { $_ })
  $form = $forms | Where-Object { $_.name -eq "captures" } | Select-Object -First 1
  if ($null -eq $form) {
    Log "no 'captures' form registered - correct: uploads use the edge function now, nothing to drain"
  } else {
    $subs = @((Invoke-RestMethod "$api/forms/$($form.id)/submissions" -Headers $H) | ForEach-Object { $_ })
    $new = @($subs | Where-Object { -not $state.ContainsKey($_.id) })
    if ($new.Count -gt 0) {
      Log "$($new.Count) new submission(s)"
      foreach ($sub in $new) {
        try {
          $n = Process-Submission $sub
          $copied += $n
          Log "  submission $($sub.id): $n file(s) -> captures\inbox"
          if (-not $KeepRemote) {
            Invoke-RestMethod "$api/submissions/$($sub.id)" -Headers $H -Method Delete | Out-Null
          }
          $state[$sub.id] = $true; Save-State
        } catch {
          Log "  submission $($sub.id) failed: $($_.Exception.Message) (kept remote, will retry)" "Yellow"
        }
      }
    }
    # Akismet quarantines rapid scripted posts (it once ate 82 of them
    # silently). Rescue anything in spam that looks like a capture upload:
    # honeypot empty + at least one file field. Marking ham moves it to the
    # verified list, which the NEXT poll ingests normally.
    $spam = @((Invoke-RestMethod "$api/forms/$($form.id)/submissions?state=spam&per_page=100" -Headers $H) | ForEach-Object { $_ })
    $rescued = 0
    foreach ($s in $spam) {
      $hasFile = $false
      foreach ($p in $s.data.PSObject.Properties) {
        if ($p.Value -is [System.Management.Automation.PSCustomObject] -and $p.Value.url) { $hasFile = $true }
      }
      if ($hasFile -and -not $s.data.'bot-field') {
        try { Invoke-RestMethod "$api/submissions/$($s.id)/ham" -Headers $H -Method Put | Out-Null; $rescued++ }
        catch { Log "  ham-rescue failed for $($s.id): $($_.Exception.Message)" "Yellow" }
      }
    }
    if ($rescued -gt 0) { Log "rescued $rescued submission(s) from the spam folder" }
  }
  return $copied
}

while ($true) {
  $cycleCopied = 0
  try {
    if ($Forms) { $cycleCopied += Sync-Forms }
    # the upload path: the edge function's blob store (never metered)
    $cycleCopied += Sync-Blobs
    if ($cycleCopied -gt 0) { Invoke-Pipeline }
    else { Write-Host "$(Get-Date -Format HH:mm:ss) nothing new" }  # console only
  } catch {
    Log "poll error: $($_.Exception.Message)" "Yellow"
  }
  if ($Once) { break }
  Start-Sleep -Seconds $IntervalSec
}
