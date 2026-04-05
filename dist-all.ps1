# Focus Agent: Production Distribution Script
# This builds EVERYTHING and packages it into a single installer (.exe)

$workspaceRoot = $PSScriptRoot
if ($null -eq $workspaceRoot -or "" -eq $workspaceRoot) { $workspaceRoot = $PWD }

$desktopDir = Join-Path $workspaceRoot "desktop"
$serviceDir = Join-Path $workspaceRoot "service"
$resourcesDir = Join-Path $desktopDir "resources"

Write-Host "`n=== Focus Agent: Building Professional Distribution ===`n" -ForegroundColor Cyan

# 0. Cleanup
Write-Host "[0/4] Cleaning previous builds..."
Remove-Item -Path (Join-Path $desktopDir "release") -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $desktopDir "dist") -Recurse -ErrorAction SilentlyContinue

# 1. Build Native C# Logic (Core Enforcement & Tab Terminator)
Write-Host "[1/4] Rebuilding NATIVE local engines..."
Set-Location $serviceDir
powershell -ExecutionPolicy Bypass -File .\build.ps1
if ($LASTEXITCODE -ne 0) { Write-Host "Native Build Failed!" -ForegroundColor Red; Exit 1 }

# 2. Sync Resources
Write-Host "[2/4] Syncing native binaries to resources..."
if (!(Test-Path $resourcesDir)) { New-Item -ItemType Directory -Path $resourcesDir -Force }
Copy-Item (Join-Path $serviceDir "DistractionBlocker.exe") (Join-Path $resourcesDir "blocker-engine.exe") -Force
# TabTerminator.exe is already placed by service/build.ps1

# 3. Compile Electron & Web UI
Write-Host "[3/4] Compiling UI and Main Process..."
Set-Location $desktopDir
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "UI Build Failed!" -ForegroundColor Red; Exit 1 }

# 4. Create Installer (.exe)
Write-Host "[4/4] Generating NSIS Installer..."
npm run dist
if ($LASTEXITCODE -ne 0) { Write-Host "Packaging Failed!" -ForegroundColor Red; Exit 1 }

Write-Host "`n=======================================================" -ForegroundColor Green
Write-Host " SUCCESS! Distribution Executable Created."
Write-Host " Location: $desktopDir\release\Focus Agent Setup X.X.X.exe"
Write-Host "======================================================="
Set-Location $workspaceRoot
