# Quick Development Build (Compilation Only)
# Use this to quickly rebuild C# sidecars and Electron main process.

$workspaceRoot = $PSScriptRoot
if ($null -eq $workspaceRoot -or "" -eq $workspaceRoot) { $workspaceRoot = $PWD }

$desktopDir = Join-Path $workspaceRoot "desktop"
$serviceDir = Join-Path $workspaceRoot "service"
$resourcesDir = Join-Path $desktopDir "resources"

Write-Host "`n=== Focus Agent: Fast Dev Build [SAFE-TAB v3.1] ===" -ForegroundColor Cyan

# 0. Cleanup Locks
Write-Host "[1/3] Releasing file locks..."
taskkill /F /IM TabTerminator.exe /T 2> $null
taskkill /F /IM "Focus Agent.exe" /T 2> $null

# 1. Rebuild Native C# Components (Service & Sidecar)
Write-Host "`n[2/3] Rebuilding Native C# Core..."
Set-Location $serviceDir
powershell -ExecutionPolicy Bypass -File .\build.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Host "FATAL: Native build failed." -ForegroundColor Red
    Exit 1
}

# 2. Rebuild Electron Main Process (Main.ts -> Main.js)
Write-Host "`n[3/3] Rebuilding Electron Main Entry..."
Set-Location $desktopDir
npm run build:main
if ($LASTEXITCODE -ne 0) {
    Write-Host "FATAL: Electron main compilation failed." -ForegroundColor Red
    Exit 1
}

# 3. Synchronize Resources
Write-Host "`n[SNC] Syncing resources folder..."
if (!(Test-Path $resourcesDir)) { New-Item -ItemType Directory -Path $resourcesDir -Force }
Copy-Item (Join-Path $serviceDir "DistractionBlocker.exe") (Join-Path $resourcesDir "blocker-engine.exe") -Force

Write-Host "`n=======================================================" -ForegroundColor Green
Write-Host " Dev Build Complete! (Bypassed backend/web export)"
Write-Host " You can now run 'npm run dev' in the desktop folder."
Write-Host "======================================================="
Set-Location $workspaceRoot
