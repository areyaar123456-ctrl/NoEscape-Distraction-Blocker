# Requires Run as Administrator
if (-Not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warning "Please run this script as Administrator."
    Exit
}

$exePath = Join-Path $PWD "DistractionBlocker.exe"
if (-Not (Test-Path $exePath)) {
    Write-Error "Compile the service first by running build.ps1"
    Exit
}

$serviceName = "DistractionBlockerService"

# Stop and delete if existing
if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
    Stop-Service -Name $serviceName -Force
    sc.exe delete $serviceName
}

# Install as LocalSystem
New-Service -Name $serviceName -BinaryPathName $exePath -DisplayName "Focus Agent Distraction Blocker" -Description "Native background service for protecting focus sessions." -StartupType Automatic

# Start service
Start-Service -Name $serviceName
Write-Host "Service installed and started successfully!"
