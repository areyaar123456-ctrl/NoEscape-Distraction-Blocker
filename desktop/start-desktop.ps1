$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$cursorNode = "$env:LOCALAPPDATA\Programs\cursor\resources\app\resources\helpers\node.exe"
$systemNode = Get-Command node.exe -ErrorAction SilentlyContinue

$nodeExe = $null

if ($systemNode) {
    Write-Host "Found system Node.js: $($systemNode.Source)" -ForegroundColor Green
    $nodeExe = $systemNode.Source
}
elseif (Test-Path $cursorNode) {
    Write-Host "Found Cursor bundled Node.js: $cursorNode" -ForegroundColor Yellow
    $nodeExe = $cursorNode
}
else {
    Write-Host "CRITICAL ERROR: Could not find any Node.js installation." -ForegroundColor Red
    Read-Host -Prompt "Press Enter to exit"
    exit 1
}

Write-Host "Starting NoEscape Desktop App (Development Mode)..." -ForegroundColor Cyan

# 0. Build main & preload processes to ensure IPC bridge is available
Write-Host "Building system processes..." -ForegroundColor Yellow
npm run build:main

# 1. Clean potentially locked cache from standard user profile
$appData = [System.Environment]::GetFolderPath('ApplicationData')
$cachePath = Join-Path $appData "desktop"
if (Test-Path $cachePath) {
    Write-Host "Cleaning application cache to prevent permission clashing..." -ForegroundColor Gray
    Remove-Item -Path $cachePath -Recurse -Force -ErrorAction SilentlyContinue
}

# 2. Run Vite for the renderer in a separate process
Write-Host "Launching Vite Dev Server..." -ForegroundColor Yellow
$viteProcess = Start-Process powershell -ArgumentList "-Command", "npm run dev" -PassThru -WindowStyle Hidden

# 3. Wait for Vite to be ready (approx) or just start Electron
Write-Host "Launching Electron shell (Run as Administrator required)..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Start Electron
npm start -- --admin

# Cleanup
Write-Host "Shutting down..." -ForegroundColor Gray
Stop-Process -Id $viteProcess.Id -Force -ErrorAction SilentlyContinue
