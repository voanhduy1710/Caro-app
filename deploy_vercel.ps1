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
