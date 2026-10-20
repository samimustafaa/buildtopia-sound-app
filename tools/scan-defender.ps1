$ErrorActionPreference='Stop'
$platform=Get-ChildItem "$env:ProgramData\Microsoft\Windows Defender\Platform" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
$scanner=if($platform){Join-Path $platform.FullName 'MpCmdRun.exe'}else{Join-Path $env:ProgramFiles 'Windows Defender\MpCmdRun.exe'}
if (!(Test-Path $scanner)) { throw 'Microsoft Defender scanner is unavailable. Release publication is blocked.' }
$report=Join-Path (Resolve-Path 'release').Path 'DEFENDER-SCAN.txt'
"Scan date (UTC): $([DateTime]::UtcNow.ToString('o'))" | Set-Content $report
& $scanner -SignatureUpdate 2>&1 | Tee-Object -FilePath $report -Append
if ($LASTEXITCODE -ne 0) { throw 'Defender signature update failed. Release publication is blocked.' }
$version=node -p "require('./package.json').version"
foreach($target in @("release/sg0hann-SoundSwap-$version-Setup.exe",'release/win-unpacked')) {
  "Target: $target" | Tee-Object -FilePath $report -Append
  # Microsoft documents that this custom report-only mode ignores file exclusions.
  # It does not disable Defender protection or add exclusions.
  & $scanner -Scan -ScanType 3 -File (Resolve-Path $target).Path -DisableRemediation 2>&1 | Tee-Object -FilePath $report -Append
  if ($LASTEXITCODE -ne 0) { throw "Defender detected a threat or could not scan $target. Release publication is blocked." }
}
'No threats detected in these artifacts by this scan. This is not a guarantee against all detections.' | Tee-Object -FilePath $report -Append
