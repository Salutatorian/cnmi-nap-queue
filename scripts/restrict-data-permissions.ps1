$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$data = Join-Path $project 'data'

Write-Host 'This limits the data folder to the current user and SYSTEM.'
Write-Host 'Other Windows accounts may lose access to the database and logs.'
$answer = Read-Host 'Type YES to continue'
if ($answer -ne 'YES') {
  Write-Host 'Left the folder permissions unchanged.'
  exit 0
}

icacls $data /inheritance:r
icacls $data /grant:r "${env:USERNAME}:(OI)(CI)F"
icacls $data /grant:r "SYSTEM:(OI)(CI)F"
Write-Host 'Updated permissions on the data folder.'
