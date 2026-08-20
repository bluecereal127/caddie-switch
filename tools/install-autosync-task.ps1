# One-time install of the CaddieAutosync scheduled task, so the watcher runs
# by itself: starts hidden at every logon, restarts if it dies, no console to
# babysit. Activity is visible in captures\autosync.log.
#
#   npm run autosync:install     (re-run any time; it updates in place)
#
# Remove with:
#   Unregister-ScheduledTask -TaskName CaddieAutosync -Confirm:$false
$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "autosync.ps1"

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 100 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
  -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName "CaddieAutosync" -Action $action -Trigger $trigger `
  -Settings $settings -Description "Caddie-Switch: pull screenshot uploads from the Netlify form into captures\inbox" `
  -Force | Out-Null
Start-ScheduledTask -TaskName "CaddieAutosync"
$t = Get-ScheduledTask -TaskName "CaddieAutosync"
Write-Host "Task installed (state: $($t.State)). Runs hidden at every logon; log: captures\autosync.log" -ForegroundColor Green
