$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

function Test-NodeVersion([string]$exe) {
  $raw = (& $exe -v).TrimStart('v')
  $parts = $raw.Split('.')
  $major = [int]$parts[0]
  $minor = [int]$parts[1]
  return ($major -gt 22) -or ($major -eq 22 -and $minor -ge 18)
}

function Test-ServerUp {
  try {
    $null = Invoke-WebRequest -Uri 'http://127.0.0.1:8787/api/health' -UseBasicParsing -TimeoutSec 2
    return $true
  } catch {
    return $false
  }
}

$portable = Join-Path $root 'tools\node\node.exe'
$nodeExe = $null
$onPath = Get-Command node -ErrorAction SilentlyContinue
if ($onPath -and (Test-NodeVersion $onPath.Source)) {
  $nodeExe = $onPath.Source
} elseif ((Test-Path -LiteralPath $portable) -and (Test-NodeVersion $portable)) {
  $nodeExe = $portable
}

if (-not $nodeExe) {
  $version = 'v24.22.2'
  Write-Host "Downloading Node.js $version. This happens once and needs the internet."
  $zip = Join-Path $env:TEMP "node-$version-win-x64.zip"
  $unpack = Join-Path $env:TEMP "node-$version-unpack"
  Invoke-WebRequest -Uri "https://nodejs.org/dist/$version/node-$version-win-x64.zip" -OutFile $zip -UseBasicParsing
  if (Test-Path -LiteralPath $unpack) { Remove-Item -LiteralPath $unpack -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $unpack
  $dest = Join-Path $root 'tools\node'
  if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
  New-Item -ItemType Directory -Force -Path (Join-Path $root 'tools') | Out-Null
  Move-Item -LiteralPath (Join-Path $unpack "node-$version-win-x64") -Destination $dest
  $nodeExe = Join-Path $dest 'node.exe'
}

$nodeDir = Split-Path -Parent $nodeExe
$env:Path = "$nodeDir;$env:Path"

if (-not (Test-Path -LiteralPath 'node_modules') -or -not (Test-Path -LiteralPath 'client\dist\index.html')) {
  Write-Host 'Setting up the queue for the first time. This can take a few minutes.'
  npm install
  if ($LASTEXITCODE -ne 0) { throw 'Setup could not install the queue.' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Setup could not build the queue.' }
}
if (-not (Test-Path -LiteralPath 'data\nap.sqlite')) {
  npm run seed
  if ($LASTEXITCODE -ne 0) { throw 'Setup could not create the demonstration database.' }
}

if (-not (Test-ServerUp)) {
  $command = "`$env:Path = '$nodeDir;' + `$env:Path; Set-Location -LiteralPath '$root'; npm start"
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $command) | Out-Null
  $started = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if (Test-ServerUp) { $started = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $started) { throw 'The queue did not start. Read the server window for the error.' }
}

$asked = Join-Path $root 'data\office-network.txt'
if (-not (Test-Path -LiteralPath $asked)) {
  $allowed = $false
  try {
    $names = @('CNMI NAP Queue', 'CNMI NAP Queue Demo')
    $existing = Get-NetFirewallRule -ErrorAction Stop | Where-Object { $names -contains $_.DisplayName }
    if ($existing) { $allowed = $true }
  } catch {
    $allowed = $false
  }
  if (-not $allowed) {
    Write-Host 'Windows will ask permission so other office computers can connect. Choose Yes.'
    $allow = Join-Path $PSScriptRoot 'allow-office-network.ps1'
    try {
      $elevated = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$allow`""
      $allowed = $elevated.ExitCode -eq 0
    } catch {
      Write-Host 'Other office computers stay blocked until an administrator allows the private network.'
    }
  }
  New-Item -ItemType Directory -Force -Path (Join-Path $root 'data') | Out-Null
  if ($allowed) { Set-Content -LiteralPath $asked -Value 'allowed' } else { Set-Content -LiteralPath $asked -Value 'skipped' }
}

$tvProfile = Join-Path $env:LOCALAPPDATA 'CNMI-NAP-Queue\tv'
$tvOpen = Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" | Where-Object {
  $_.CommandLine -like "*$tvProfile*" -and $_.CommandLine -notlike '*--type=*'
}
if (-not $tvOpen) {
  & (Join-Path $PSScriptRoot 'open-tv.ps1')
}

Write-Host ''
Write-Host 'This computer is hosting the queue. Leave the server window open.'
Write-Host 'Visitor check-in on this computer: http://127.0.0.1:8787/kiosk'
Write-Host 'Caseworkers do not download the app. They open the Office address from the server window, then /staff/login'
