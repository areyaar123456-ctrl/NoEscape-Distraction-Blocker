# Self-elevate to Administrator and preserve working directory
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    $currentDir = Get-Location
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$currentDir'; & '$PSCommandPath'`"" -Verb RunAs
    exit
}

# Ensure we are in the script's directory even after elevation
Set-Location $PSScriptRoot

Write-Host "================================" -ForegroundColor Cyan
Write-Host "   FOCUS AGENT SYSTEM START    " -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Ensure a clean environment by aggressively killing any processes on our ports
Write-Host "Clearing harbors (Killing old processes on ports 3000, 3001, 5173)..." -ForegroundColor Yellow
npx --yes kill-port 3000 3001 5173

# Start Backend
Write-Host "[1/3] Launching Backend Service..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; ./start-backend.ps1"

# Wait a bit for DB connection
Start-Sleep -Seconds 3

# Start Web (Optional if you just use Desktop)
Write-Host "[2/3] Launching Web Dashboard..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd web; ./start-web.ps1"

# Start Desktop
Write-Host "[3/3] Launching Desktop Focus Agent..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd desktop; ./start-desktop.ps1"

Write-Host ""
Write-Host "All systems are spinning up!" -ForegroundColor Green
Write-Host "Backend: http://localhost:3001"
Write-Host "Web Dashboard: http://localhost:3000"
Write-Host "Desktop Agent: Starting..." 
Write-Host ""
Write-Host "Keep these windows open while using Focus Agent." -ForegroundColor Gray
