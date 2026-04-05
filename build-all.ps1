# Requires Run as Administrator
if (-Not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Attempting to elevate script to Administrator..." -ForegroundColor White -BackgroundColor Blue
    try {
        Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    }
    catch {
        Write-Host "FATAL: Could not elevate to Administrator automatically." -ForegroundColor Red
        Write-Host "Please right-click PowerShell and 'Run as Administrator', then run this script again." -ForegroundColor Yellow
        Read-Host "Press Enter to exit..."
    }
    Exit
}

$workspaceRoot = $PSScriptRoot
if ($null -eq $workspaceRoot -or "" -eq $workspaceRoot) { $workspaceRoot = $PWD }

$desktopDir = Join-Path $workspaceRoot "desktop"
$serviceDir = Join-Path $workspaceRoot "service"
$resourcesDir = Join-Path $desktopDir "resources"
$backendDir = Join-Path $workspaceRoot "backend"

Write-Host "`n=== Focus Agent: Building Standalone Executable ===" -ForegroundColor Cyan

# 0. Cleanup Old Processes to avoid file locks
Write-Host "[0/5] Cleaning harbors..."
npx --yes kill-port 3000 3001 5173 2> $null
tasklist /FI "IMAGENAME eq Focus Agent.exe" 2>$null | FindStr "Focus Agent.exe" > $null
if ($LASTEXITCODE -eq 0) {
    taskkill /F /IM "Focus Agent.exe" /T 2> $null
}

# Helper to exit with pause
function Exit-With-Pause {
    param([string]$message)
    Write-Host "`nERROR: $message" -ForegroundColor Red
    Read-Host "Press Enter to see error details and exit..."
    Exit 1
}

# 1. Compile Native Service
Write-Host "`n[1/5] Compiling Native C# Service..."
Set-Location $serviceDir
.\build.ps1
if ($LASTEXITCODE -ne 0) { Exit-With-Pause "Service compilation failed." }

# 2. Build Web Dashboard (Static Export)
Write-Host "`n[2/5] Building Web Dashboard (Next.js Export)..."
Set-Location (Join-Path $workspaceRoot "web")
npm install
npm run build
if ($LASTEXITCODE -ne 0) { Exit-With-Pause "Web build failed." }

# 3. Compile Backend
Write-Host "`n[3/5] Compiling Backend Server..."
Set-Location $backendDir
npm install
npm run build
npx prisma generate
if ($LASTEXITCODE -ne 0) { Exit-With-Pause "Backend compilation failed." }

# Copy Web Dashboard to Backend for serving
Write-Host "Integrating Web Dashboard into Backend..."
$backendWebDir = Join-Path $backendDir "web"
$backendOutDir = Join-Path $backendWebDir "out"

if (Test-Path $backendWebDir) { Remove-Item -Path $backendWebDir -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $backendOutDir -Force | Out-Null
Copy-Item -Path (Join-Path $workspaceRoot "web/out/*") -Destination $backendOutDir -Recurse -Force

# 4. Prepare Desktop Resources
Write-Host "`n[4/5] Preparing Desktop Resources..."
if (-Not (Test-Path $resourcesDir)) { New-Item -ItemType Directory -Force -Path $resourcesDir | Out-Null }
Copy-Item (Join-Path $serviceDir "DistractionBlocker.exe") (Join-Path $resourcesDir "blocker-engine.exe") -Force

# 5. Build and Pack Electron App
Write-Host "`n[5/5] Building and Packaging Focus Agent..."
Set-Location $desktopDir
npm install
npm run build
npm run dist
if ($LASTEXITCODE -ne 0) { Exit-With-Pause "Packaging failed." }

Write-Host "`n=======================================================" -ForegroundColor Green
Write-Host " Build Complete! Check the 'desktop/release' folder."
Write-Host "======================================================="
Read-Host "Press Enter to exit..."
