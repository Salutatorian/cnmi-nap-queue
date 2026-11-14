$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Install Node.js 22.18 or newer, then run this script again.'
}

$parts = (node -v).TrimStart('v').Split('.')
$major = [int]$parts[0]
$minor = [int]$parts[1]
if ($major -lt 22 -or ($major -eq 22 -and $minor -lt 18)) {
  throw "Node.js 22.18 or newer is required. Found $(node -v)."
}

npm install
npm run build
if (-not (Test-Path 'data\nap.sqlite')) {
  npm run seed
} else {
  Write-Host 'Database already exists. Skipping seed.'
}

Write-Host ''
Write-Host 'Installed. Start the queue with: npm start'
