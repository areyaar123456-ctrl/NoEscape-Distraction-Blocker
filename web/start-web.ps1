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

Write-Host "Starting NoEscape Web Dashboard..." -ForegroundColor Cyan

# We need npm to run 'next dev'
$npmPath = Get-Command npm -ErrorAction SilentlyContinue
if (-Not $npmPath) {
    # If no global npm, try to find where node is and look for npm-cli.js nearby
    # This is a fallback but usually npm is in the same path as node
    Write-Host "ERROR: npm not found in PATH. Please install Node.js (LTS) system-wide." -ForegroundColor Red
    Read-Host -Prompt "Press Enter to exit"
    exit 1
}

npm run dev
