param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
try {
  $old = Get-Process -Id $config.pid -ErrorAction SilentlyContinue
  if ($old) { $old.WaitForExit() }
  $hash = (Get-FileHash -LiteralPath $config.installer -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $config.sha256) { throw 'Update checksum mismatch.' }
  $setup = Start-Process -FilePath $config.installer -ArgumentList '/S' -PassThru -Wait
  if ($setup.ExitCode -ne 0) { throw "Update failed: $($setup.ExitCode)" }
  Start-Process -FilePath $config.executable
} catch {
  $_.ToString() | Set-Content -LiteralPath ($ConfigPath + '.error.txt')
  Start-Process -FilePath $config.executable
}
