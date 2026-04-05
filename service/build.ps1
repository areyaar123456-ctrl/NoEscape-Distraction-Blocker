$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$wiaDir = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\WPF"

# 1. Build Main Blocking Engine (Service)
$outEngine = "DistractionBlocker.exe"
& $csc /target:exe /r:System.Web.Extensions.dll /r:System.Core.dll /out:$outEngine *.cs
if ($LASTEXITCODE -eq 0) {
    Write-Host "Build Succeeded: $outEngine"
}

# 2. Build Tab Terminator (Sidecar)
$outTerminator = "TabTerminator.exe"
$terminatorSrc = "..\desktop\src\main\TabTerminator.cs"
$resourcesDir = "..\desktop\resources"
if (!(Test-Path $resourcesDir)) { New-Item -ItemType Directory -Path $resourcesDir -Force }

& $csc /target:exe /r:System.Web.Extensions.dll /r:System.Core.dll /r:"$wiaDir\UIAutomationClient.dll" /r:"$wiaDir\UIAutomationTypes.dll" /out:"$resourcesDir\$outTerminator" $terminatorSrc
if ($LASTEXITCODE -eq 0) {
    Write-Host "Build Succeeded: $resourcesDir\$outTerminator"
}
