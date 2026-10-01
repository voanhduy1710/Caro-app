# ==============================================================================
# PowerShell Vercel Deployment Script for Caro (Gomoku) Web App
# ==============================================================================
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  🚀 Caro (Gomoku) Web App - Vercel Production Deploy Script  " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Check Node.js and npm
Write-Host "`n[1/4] Checking environment & Node.js..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Error: Node.js is not installed or not in PATH." -ForegroundColor Red
    Exit 1
}
$nodeVersion = node -v
Write-Host "   ✅ Node.js Version: $nodeVersion" -ForegroundColor Green

# 2. Extract Vercel Access Token from environment, .env, or .mcp.json
$vercelToken = $env:VERCEL_ACCESS_TOKEN
if (-not $vercelToken) {
    $vercelToken = $env:VERCEL_TOKEN
}

# Try loading from .env if not in environment
if (-not $vercelToken -and (Test-Path ".env")) {
    $envLines = Get-Content ".env"
    foreach ($line in $envLines) {
        $trimmed = $line.Trim()
        if ($trimmed -match "^(VERCEL_ACCESS_TOKEN|VERCEL_TOKEN)\s*=\s*(.+)$") {
            $vercelToken = $matches[2].Trim().Trim('"').Trim("'")
            break
        }
    }
}

# Try loading from .mcp.json as fallback
if (-not $vercelToken -and (Test-Path ".mcp.json")) {
    try {
        $mcpContent = Get-Content ".mcp.json" -Raw | ConvertFrom-Json
        if ($mcpContent.mcpServers.vercel.env.VERCEL_TOKEN) {
            $vercelToken = $mcpContent.mcpServers.vercel.env.VERCEL_TOKEN
        }
    } catch {
        # ignore parse error
    }
}

if (-not $vercelToken) {
    Write-Host "❌ Error: Vercel token not found." -ForegroundColor Red
    Write-Host "   Please ensure VERCEL_ACCESS_TOKEN is set in .env or `$env:VERCEL_TOKEN is set." -ForegroundColor Yellow
    Exit 1
}

$env:VERCEL_TOKEN = $vercelToken

# Verify Vercel User
$whoamiRaw = npx -y vercel whoami --token $vercelToken 2>&1
$whoami = ($whoamiRaw | Where-Object { $_ -notmatch 'telemetry' -and $_ -notmatch 'Worker' -and $_ -notmatch 'NOTE' } | Select-Object -Last 1).Trim()
Write-Host "   ✅ Authenticated Vercel User: $whoami" -ForegroundColor Green

# Vite substitutes VITE_* values during the remote Vercel build. The .env file
# is intentionally excluded from uploads, so the project must hold these two
# public Supabase client settings itself. Syncing them here prevents a deploy
# that works locally but ships a bundle where all account actions are disabled.
if (-not (Test-Path ".env")) {
    Write-Host "❌ Error: .env is required to configure the production Supabase client." -ForegroundColor Red
    Exit 1
}

function Get-DotEnvValue([string]$name) {
    $line = Get-Content ".env" | Where-Object { $_ -match ("^{0}=(.+)$" -f [regex]::Escape($name)) } | Select-Object -First 1
    if (-not $line) { return $null }
    return ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
}

Write-Host "   ⏳ Syncing required production environment variables..." -ForegroundColor Blue
foreach ($name in @("VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY")) {
    $value = Get-DotEnvValue $name
    if (-not $value) {
        Write-Host "❌ Error: $name is missing from .env." -ForegroundColor Red
        Exit 1
    }
    # These are browser client values, not server secrets: Vite must expose
    # them in the app bundle. --force keeps the Vercel project in sync when
    # the Supabase project/key changes.
    $env:CARO_VERCEL_ENV_VALUE = $value
    npx -y vercel env add $name production --force --type config --value $env:CARO_VERCEL_ENV_VALUE --yes --token $vercelToken | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Remove-Item Env:CARO_VERCEL_ENV_VALUE -ErrorAction SilentlyContinue
        Write-Host "❌ Error: Could not sync $name to Vercel." -ForegroundColor Red
        Exit 1
    }
}
Remove-Item Env:CARO_VERCEL_ENV_VALUE -ErrorAction SilentlyContinue
Write-Host "   ✅ Production Supabase configuration synced." -ForegroundColor Green

# Optional: Cloudflare TURN key used by /api/turn so players behind a VPN
# (Cloudflare 1.1.1.1 / WARP) or strict NAT can still connect. These are server
# secrets, so they are stored encrypted and never prefixed with VITE_.
$turnKeyId = Get-DotEnvValue "CLOUDFLARE_TURN_KEY_ID"
$turnToken = Get-DotEnvValue "CLOUDFLARE_TURN_API_TOKEN"
if ($turnKeyId -and $turnToken) {
    foreach ($pair in @(@("CLOUDFLARE_TURN_KEY_ID", $turnKeyId), @("CLOUDFLARE_TURN_API_TOKEN", $turnToken))) {
        $env:CARO_VERCEL_ENV_VALUE = $pair[1]
        npx -y vercel env add $pair[0] production --force --sensitive --value $env:CARO_VERCEL_ENV_VALUE --yes --token $vercelToken | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Host "   ⚠️ Could not sync $($pair[0]) to Vercel." -ForegroundColor Yellow }
    }
    Remove-Item Env:CARO_VERCEL_ENV_VALUE -ErrorAction SilentlyContinue
    Write-Host "   ✅ Cloudflare TURN credentials synced." -ForegroundColor Green
} else {
    Write-Host "   ⚠️ CLOUDFLARE_TURN_KEY_ID / CLOUDFLARE_TURN_API_TOKEN not in .env: players on VPNs may fail to connect." -ForegroundColor Yellow
}

# 3. Check & Install Dependencies and Test Production Build
Write-Host "`n[2/4] Verifying node_modules..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "   ⏳ Installing dependencies via npm install..." -ForegroundColor Blue
    npm install
} else {
    Write-Host "   ✅ node_modules verified." -ForegroundColor Green
}

Write-Host "`n[3/4] Running production build check (npm run build)..." -ForegroundColor Yellow
$buildOutput = npm run build 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed! Fix compilation errors before deploying:" -ForegroundColor Red
    Write-Host $buildOutput -ForegroundColor Red
    Exit 1
} else {
    Write-Host "   ✅ Build successful! dist/ output verified." -ForegroundColor Green
}

# 4. Deploy Production Build to Vercel Account
Write-Host "`n[4/4] Deploying to Production on Vercel account ($whoami)..." -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan

npx -y vercel --prod --name caro-app --yes --token $vercelToken

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "🎉 Vercel Production Deployment Completed!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
