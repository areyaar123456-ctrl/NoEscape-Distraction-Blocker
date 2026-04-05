$paths = "HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
"HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
"HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"

$apps = Get-ItemProperty $paths -ErrorAction SilentlyContinue |
Where-Object { $_.DisplayName -and $_.DisplayIcon -match '\.exe' } |
Select-Object DisplayName, DisplayIcon

$apps | Select-Object -First 20 | ConvertTo-Json
