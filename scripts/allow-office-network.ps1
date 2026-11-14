$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script from an Administrator PowerShell window.'
}

$names = @('CNMI NAP Queue', 'CNMI NAP Queue Demo')
$existing = Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $names -contains $_.DisplayName }
if ($existing) {
  Write-Host 'The office firewall rule is already there.'
  exit 0
}

New-NetFirewallRule -DisplayName 'CNMI NAP Queue' -Direction Inbound -Protocol TCP -LocalPort 8787 -Action Allow -Profile Private | Out-Null
Write-Host 'Other computers on this private network can open the queue. Public networks stay blocked.'
