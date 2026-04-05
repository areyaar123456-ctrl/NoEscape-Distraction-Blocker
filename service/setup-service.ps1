# --- Automatic Administrator Elevation ---
if (-Not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Attempting to elevate script to Administrator..." -ForegroundColor White -BackgroundColor Blue
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    Exit
}
# --- End of Elevation ---


$serviceName = "DistractionBlockerService"
$installDir = "$env:ProgramFiles\FocusAgentBlocker"
$exeName = "DistractionBlocker.exe"
$targetExe = Join-Path $installDir $exeName
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

Write-Host "======================================"
Write-Host " Focus Agent - Native Service Setup"
Write-Host "======================================"

# 1. Compile the C# Code locally first into a temporary file
$currentWorkspace = $PSScriptRoot
if ($null -eq $currentWorkspace -or "" -eq $currentWorkspace) {
    $currentWorkspace = $PWD
}

$tempExe = Join-Path $currentWorkspace $exeName
Write-Host "`n[1/5] Compiling C# Native Service..."

# Ensure we are in the script's directory so *.cs picks up correctly
Set-Location $currentWorkspace
& $csc /nologo /target:exe /r:System.Web.Extensions.dll /out:$tempExe *.cs

if ($LASTEXITCODE -ne 0 -or !(Test-Path $tempExe)) {
    Write-Host "Compilation failed. Check if *.cs files exist in $currentWorkspace and if the .NET Framework compiler is in the correct path." -ForegroundColor Red
    Read-Host "Press Enter to exit..."
    Exit
}
Write-Host "Compilation successful."

# 2. Stop the existing service if it exists (so we can overwrite the executable)
Write-Host "`n[2/5] Stopping existing service (if running)..."
if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
    Try {
        Stop-Service -Name $serviceName -Force -WarningAction SilentlyContinue
        Write-Host "Service stopped."
        Start-Sleep -Seconds 2 # Give it a moment to release file handles
    }
    Catch {
        Write-Host "Could not stop service. It might be in a locked session, or not running."
    }
}
else {
    Write-Host "Service not currently installed."
}

# 3. Create Installation Directory and Copy Files
Write-Host "`n[3/5] Installing files to $installDir..."
if (-Not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
}

Try {
    Copy-Item -Path $tempExe -Destination $targetExe -Force
    Write-Host "Successfully copied new version."
}
Catch {
    Write-Error "Failed to overwrite $targetExe. Is it currently in a locked session? If so, you MUST wait for the timer to expire or force-restart the PC before updating." -ForegroundColor Red
    Read-Host "Press Enter to exit..."
    Exit
}

# Clean up temporary compilation
Remove-Item -Path $tempExe -Force -ErrorAction SilentlyContinue

# 4. Install/Update the Windows Service
Write-Host "`n[4/5] Registering Windows Service..."
if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
    # It exists, we just updated the exe, but let's make sure the path is correct
    Write-Host "Service already registered, skipping creation. (Binary updated)"
}
else {
    New-Service -Name $serviceName -BinaryPathName $targetExe -DisplayName "Focus Agent Distraction Blocker" -Description "Native background service for protecting focus sessions." -StartupType Automatic | Out-Null
    Write-Host "Service successfully registered."
}

# 5. Start the Service
Write-Host "`n[5/5] Starting Service..."
Try {
    Start-Service -Name $serviceName
    Write-Host "Service is running."
}
Catch {
    Write-Error "Failed to start service."
}

Write-Host "`n======================================"
Write-Host " Setup Complete! Service is now active." -ForegroundColor Green
Write-Host "======================================"
Read-Host "Press Enter to exit..."
