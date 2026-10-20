param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
function Write-UpdateStatus([string]$State, [string]$Message='') {
  $json = @{ state=$State; message=$Message; version=$config.version } | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText($config.status, $json, [System.Text.UTF8Encoding]::new($false))
}
$parentExited = $false
try {
  $stream = [System.IO.File]::OpenRead($config.installer)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try { $hash = [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $algorithm.Dispose() }
  if ($hash -ne $config.sha256) { throw 'Update checksum mismatch. Nothing was installed.' }
  Write-UpdateStatus 'ready'
  $old = Get-Process -Id $config.pid -ErrorAction SilentlyContinue
  if ($old -and !$old.WaitForExit(60000)) { throw 'The app did not close. Update canceled.' }
  if (Test-Path -LiteralPath $config.cancel) { exit 0 }
  $parentExited = $true
  Write-UpdateStatus 'installing'
  # Wait only for Setup, not an app it may start. Keep the same installed path.
  $setup = Start-Process -FilePath $config.installer -ArgumentList '/S' -PassThru
  $setup.WaitForExit()
  if ($setup.ExitCode -ne 0) { throw "Update failed: $($setup.ExitCode)" }
  Write-UpdateStatus 'complete'
  Start-Process -FilePath $config.executable
} catch {
  Write-UpdateStatus 'error' $_.ToString()
  if ($parentExited) { Start-Process -FilePath $config.executable }
  exit 1
}
