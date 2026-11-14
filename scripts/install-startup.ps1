$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node = (Get-Command node).Source
$startup = [Environment]::GetFolderPath('Startup')
$command = Join-Path $startup 'CNMI NAP Queue.cmd'

@(
  '@echo off'
  "cd /d `"$project`""
  "`"$node`" --disable-warning=ExperimentalWarning `"$project\server\src\index.ts`""
) | Set-Content -Path $command -Encoding ascii

Write-Host "Startup command written to:"
Write-Host $command
Write-Host 'The queue will start the next time this Windows user signs in.'
Write-Host 'Turn on automatic sign-in if it should come up after the computer boots.'
