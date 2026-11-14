$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

try {
  $null = Invoke-WebRequest -Uri 'http://127.0.0.1:8787/api/health' -UseBasicParsing -TimeoutSec 3
} catch {
  throw 'Start the queue first with scripts\start.ps1, then run this script again.'
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NapTvWindow {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int X, int Y, int cx, int cy, uint flags);
}
"@

$screens = [System.Windows.Forms.Screen]::AllScreens
$tv = $screens | Where-Object { -not $_.Primary } | Select-Object -First 1
if (-not $tv) {
  Write-Host 'Only one display is connected. Plug the HDMI cable into the TV, choose Extend these displays in Windows, then run this script again.'
  Write-Host 'Opening the waiting room on this screen for now.'
  $tv = [System.Windows.Forms.Screen]::PrimaryScreen
}

$bounds = $tv.Bounds
$edge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path -LiteralPath $edge)) {
  $edge = Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'
}
if (-not (Test-Path -LiteralPath $edge)) {
  throw 'Microsoft Edge was not found.'
}

$profile = Join-Path $env:LOCALAPPDATA 'CNMI-NAP-Queue\tv'
New-Item -ItemType Directory -Force -Path $profile | Out-Null

$arguments = @(
  "--user-data-dir=$profile",
  '--no-first-run',
  '--disable-sync',
  '--disable-extensions',
  '--no-default-browser-check',
  "--window-position=$($bounds.X),$($bounds.Y)",
  "--window-size=$($bounds.Width),$($bounds.Height)",
  '--app=http://127.0.0.1:8787/tv'
)

$process = Start-Process -FilePath $edge -ArgumentList $arguments -PassThru
$handle = [IntPtr]::Zero
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  Start-Sleep -Milliseconds 250
  $process.Refresh()
  if ($process.MainWindowHandle -ne [IntPtr]::Zero) {
    $handle = $process.MainWindowHandle
    break
  }
}

if ($handle -ne [IntPtr]::Zero) {
  [NapTvWindow]::SetWindowPos($handle, [IntPtr]::Zero, $bounds.X, $bounds.Y, $bounds.Width, $bounds.Height, 0x0040) | Out-Null
}

Write-Host "Waiting room is on the display at $($bounds.X), $($bounds.Y) ($($bounds.Width) x $($bounds.Height))."
Write-Host 'Click Enable audio once on that TV. Alt+F4 closes the waiting-room window.'
