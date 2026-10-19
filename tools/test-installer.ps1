$ErrorActionPreference = 'Stop'
$version = node -p "require('./package.json').version"
$setup = (Resolve-Path "release/sg0hann-SoundSwap-$version-Setup.exe").Path
function Install-SoundSwap {
  $process = Start-Process -FilePath $setup -ArgumentList '/S' -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
  $entries = @(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Where-Object { $_.DisplayName -like 'sg0hann SoundSwap*' })
  if ($entries.Count -ne 1) { throw "Expected one per-user installation, found $($entries.Count)" }
  $exe = Join-Path $entries[0].InstallLocation 'sg0hann SoundSwap.exe'
  if (!(Test-Path $exe)) { throw 'Installed executable is missing' }
  Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force
  return $exe
}
$first = Install-SoundSwap
$data = Join-Path $env:APPDATA 'sg0hann SoundSwap'
New-Item -ItemType Directory -Force $data | Out-Null
$marker = Join-Path $data 'installer-smoke-marker.txt'
Set-Content $marker 'preserve-settings-and-backups'
$second = Install-SoundSwap
if ($first -ne $second) { throw 'Reinstall created a different installation path' }
if ((Get-Content $marker) -ne 'preserve-settings-and-backups') { throw 'Reinstall removed user data' }
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'sg0hann SoundSwap.lnk'
if (!(Test-Path $desktop)) { throw 'Desktop shortcut is missing' }
Write-Host 'Installer passed: one installation, desktop shortcut, repeat install keeps user data.'
