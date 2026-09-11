param(
    [switch]$SkipDeploy
)

# clean_restart.ps1
# Dedicated clean restart script for Caro App (Isolated strictly to Port 5175)

Write-Host "=== Caro App Clean Restart Script (Port 5175 Isolated) ===" -ForegroundColor Cyan

# Step 1: Clear process on Port 5175 ONLY
Write-Host "`n[1/2] Clearing process on port 5175..." -ForegroundColor Yellow
$pids = netstat -ano | Select-String ":5175\s" | ForEach-Object {
    if ($_ -match '\s+(\d+)$') { $Matches[1] }
} | Select-Object -Unique

if ($pids) {
    $pids | ForEach-Object {
        try {
            Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
            Write-Host "  Killed process on port 5175 (PID: $_)" -ForegroundColor Green
        } catch {}
    }
} else {
    Write-Host "  Port 5175 is already free." -ForegroundColor Gray
}

# Step 2: Verify Port 5175 is free
Write-Host "`n[2/2] Verifying port 5175 release..." -ForegroundColor Yellow
$deadline = (Get-Date).AddSeconds(5)
do {
    $listener = Get-NetTCPConnection -LocalPort 5175 -State Listen -ErrorAction SilentlyContinue
    if (-not $listener) { break }
    Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $deadline)

if ($listener) {
    Write-Host "  Warning: Port 5175 is still in use." -ForegroundColor Amber
} else {
    Write-Host "  Port 5175 is confirmed free." -ForegroundColor Green
}

Write-Host "`n=== Cleanup Complete ===" -ForegroundColor Cyan

if ($SkipDeploy) {
    Write-Host "Skipped deploy_local.ps1 because -SkipDeploy parameter was provided." -ForegroundColor White
    return
}

# Auto-start deploy_local.ps1
Write-Host "`nStarting deploy_local.ps1..." -ForegroundColor Cyan
& "$PSScriptRoot\deploy_local.ps1"
