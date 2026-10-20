$ErrorActionPreference = 'Stop'
$version = node -p "require('./package.json').version"
$setup = (Resolve-Path "release/sg0hann-SoundSwap-$version-Setup.exe").Path
function Install-SoundSwap {
  $process = Start-Process -FilePath $setup -ArgumentList '/S' -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
  $entries = @(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Where-Object { $_.DisplayName -like 'BuilTopia Sound - sg0hann*' })
  if ($entries.Count -ne 1) { throw "Expected one per-user installation, found $($entries.Count)" }
  $shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'BuilTopia Sound - sg0hann.lnk'
  if (!(Test-Path $shortcut)) { throw 'Desktop shortcut is missing' }
  $shell = New-Object -ComObject WScript.Shell
  $exe = $shell.CreateShortcut($shortcut).TargetPath
  if (!(Test-Path $exe)) { throw 'Installed executable is missing' }
  if ((Get-Item $exe).VersionInfo.ProductName -ne 'BuilTopia Sound - sg0hann') { throw 'The executable still has the old product name.' }
  Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force
  return $exe
}
# Verify a real upgrade from the previous name, preserving executable location.
$legacySetup = Join-Path $env:TEMP 'SoundSwap-1.4.1-Setup.exe'
Invoke-WebRequest -Uri 'https://github.com/samimustafaa/buildtopia-sound-app/releases/download/v1.4.1/sg0hann-SoundSwap-1.4.1-Setup.exe' -OutFile $legacySetup
$legacyInstall = Start-Process -FilePath $legacySetup -ArgumentList '/S' -Wait -PassThru
if ($legacyInstall.ExitCode -ne 0) { throw 'Previous version installation failed.' }
$legacyShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'sg0hann SoundSwap.lnk'
$legacyShell = New-Object -ComObject WScript.Shell
$legacyExe = $legacyShell.CreateShortcut($legacyShortcut).TargetPath
if (!(Test-Path $legacyExe)) { throw 'Previous installed executable is missing.' }
Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $legacyExe } | Stop-Process -Force
$data = Join-Path $env:APPDATA 'sg0hann SoundSwap'
New-Item -ItemType Directory -Force $data | Out-Null
$renameMarker = Join-Path $data 'rename-smoke-marker.txt'
Set-Content $renameMarker 'keep-existing-user-data'
$first = Install-SoundSwap
if ($first -ne $legacyExe) { throw 'Renaming changed the installed executable path and would break update relaunch.' }
if ((Get-Content $renameMarker) -ne 'keep-existing-user-data') { throw 'Renaming removed existing user data.' }
$allEntries = @(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Where-Object { $_.DisplayName -like 'BuilTopia Sound - sg0hann*' -or $_.DisplayName -like 'sg0hann SoundSwap*' })
if ($allEntries.Count -ne 1) { throw 'Renaming created a second app installation.' }
Write-Host 'Rename upgrade passed: same executable path, one installation, existing data preserved.' 
$data = Join-Path $env:APPDATA 'sg0hann SoundSwap'
New-Item -ItemType Directory -Force $data | Out-Null
$marker = Join-Path $data 'installer-smoke-marker.txt'
Set-Content $marker 'preserve-settings-and-backups'
$second = Install-SoundSwap
if ($first -ne $second) { throw 'Reinstall created a different installation path' }
if ((Get-Content $marker) -ne 'preserve-settings-and-backups') { throw 'Reinstall removed user data' }
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'BuilTopia Sound - sg0hann.lnk'
if (!(Test-Path $desktop)) { throw 'Desktop shortcut is missing' }
Write-Host 'Installer passed: one installation, desktop shortcut, repeat install keeps user data.'
# Run the production Node launcher, not PowerShell Start-Process as a substitute.
$updateRoot = Join-Path $env:TEMP 'soundswap-update-smoke'
New-Item -ItemType Directory -Force $updateRoot | Out-Null
$configPath = Join-Path $updateRoot 'handoff.json'
@{ installer=$setup; executable=$second; directory=$updateRoot; version=$version; sha256=(Get-FileHash $setup -Algorithm SHA256).Hash.ToLowerInvariant() } | ConvertTo-Json | Set-Content $configPath
$node = (Get-Command node).Source
$runner = (Resolve-Path 'tools/test-update-handoff.cjs').Path
$parent = Start-Process $node -ArgumentList ('"'+$runner+'"'),('"'+$configPath+'"') -PassThru -WindowStyle Hidden
if (!$parent.WaitForExit(30000)) { throw 'Node update handoff did not confirm readiness.' }
if ($parent.ExitCode -ne 0) { throw 'Production Node update handoff failed.' }
$statusPath=Join-Path $updateRoot 'install-status.json'
$complete=$false
for ($attempt=0; $attempt -lt 180; $attempt++) {
  $status=Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
  if ($status.state -eq 'error') { throw $status.message }
  if ($status.state -eq 'complete') { $complete=$true; break }
  Start-Sleep -Seconds 1
}
if (!$complete) { throw ('Automatic installation did not finish. Last state: '+$status.state) }
$relaunched=$false
for ($attempt=0; $attempt -lt 30; $attempt++) {
  if (@(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $second }).Count -gt 0) { $relaunched=$true; break }
  Start-Sleep -Seconds 1
}
if (!$relaunched) { throw 'Automatic update did not reopen the app.' }
if ((Get-Content $marker) -ne 'preserve-settings-and-backups') { throw 'Update removed user data' }
Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $second } | Stop-Process -Force
Write-Host 'Production Node update passed: readiness confirmed, parent exited, silent installation finished, app reopened, data preserved.'
