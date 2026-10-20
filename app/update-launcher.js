// Windows Script Host (JScript): start an independent, hidden PowerShell helper.
var shell = WScript.CreateObject('WScript.Shell');
function quoted(value) { return '"' + value + '"'; }
var powershell = shell.ExpandEnvironmentStrings('%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
var command = quoted(powershell) + ' -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ' + quoted(WScript.Arguments.Item(0)) + ' -ConfigPath ' + quoted(WScript.Arguments.Item(1));
shell.Run(command, 0, false);
