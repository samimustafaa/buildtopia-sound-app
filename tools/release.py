from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text())['version']
output=root/'release';output.mkdir(exist_ok=True)
installer=output/f'sg0hann-SoundSwap-{version}-Setup.exe'
assert installer.read_bytes()[:2]==b'MZ'
# Older 1.1 update checkers require this ZIP name. It contains just the same installer.
compat=output/f'sg0hann-SoundSwap-{version}-Windows-x64.zip'
with zipfile.ZipFile(compat,'w',zipfile.ZIP_STORED) as z:
 z.write(installer,installer.name)
 z.writestr('START-HERE.txt','Close the app and run Setup.exe. It installs a desktop shortcut and keeps your settings, backups and applied game sounds. You do not need a portable runtime folder. After applying sounds, fully close the app; sounds keep working.\n')
with zipfile.ZipFile(compat) as z:assert z.testzip() is None
(output/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in [installer,compat]))
assert (output/'latest.yml').is_file(), 'Native update manifest is missing'
print(installer)
