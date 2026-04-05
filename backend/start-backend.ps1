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
    Write-Host "Please install Node.js system-wide to run the backend reliably." -ForegroundColor Red
    Read-Host -Prompt "Press Enter to exit"
    exit 1
}

Write-Host "Starting Focus Agent Backend..." -ForegroundColor Cyan

$env:DATABASE_URL = "postgresql://postgres:Gannahazare100893@127.0.0.1:9519/distraction_blocker"
$tsxPath = "node_modules\tsx\dist\cli.mjs"

if (-Not (Test-Path $tsxPath)) {
    Write-Host "Warning: tsx not found at expected path. Attempting to fall back to npm run dev." -ForegroundColor Yellow
    
    $npmPath = "$env:LOCALAPPDATA\Programs\cursor\resources\app\resources\helpers\npm-cli.js"
    # Actually Cursor doesn't bundle npm like this usually, let's just attempt global npm or fail if no tsx
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        npm run dev
    }
    else {
        Write-Host "ERROR: npm not found in PATH and node_modules is missing. Run 'npm install' first." -ForegroundColor Red
        Read-Host -Prompt "Press Enter to exit"
        exit 1
    }
}
else {
    # We found Node.exe and TSX. Start the backend!
    & $nodeExe $tsxPath watch src/server.ts
}
