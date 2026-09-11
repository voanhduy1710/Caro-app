# PowerShell Deployment & Local Preview Script for Caro App
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " Caro (Gomoku) Web App - Local Deployment Script" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# 1. Check Node.js and npm
Write-Host "[1/3] Checking environment..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js is not installed or not in PATH." -ForegroundColor Red
    Exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: npm is not installed or not in PATH." -ForegroundColor Red
    Exit 1
}

$nodeVersion = node -v
$npmVersion = npm -v
Write-Host "   Node.js version: $nodeVersion" -ForegroundColor Green
Write-Host "   npm version:     $npmVersion" -ForegroundColor Green

# 2. Verify or Install Dependencies
Write-Host "[2/3] Checking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "   node_modules folder missing. Running npm install..." -ForegroundColor Blue
    npm install
} else {
    Write-Host "   node_modules verified." -ForegroundColor Green
}

# 3. Launch Vite Local Dev Server on Port 5175
Write-Host "[3/3] Starting Vite Development Server on Port 5175..." -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   Local App URL:  http://localhost:5175" -ForegroundColor Green
Write-Host "   Multiplayer P2P: Open 2 separate tabs or windows" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan

npm run dev -- --host --port 5175 --strictPort
