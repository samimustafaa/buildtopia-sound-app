from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text())['version']
dist=root/'dist/sg0hann SoundSwap-win32-x64'
assert (dist/'sg0hann SoundSwap.exe').read_bytes()[:2]==b'MZ'
(dist/'README.md').write_bytes((root/'README.md').read_bytes())
(dist/'START-HERE.txt').write_text('Extract the ENTIRE ZIP. Open sg0hann SoundSwap.exe.\nClose the game, Browse to Creative Destruction, select sounds, then Apply.\n\nAFTER APPLYING YOU CAN FULLY CLOSE SOUNDSWAP.\nSounds stay installed and work without this app running.\n\nUpdates: download the new ZIP, close SoundSwap, and extract the entire update into a new folder. Your game sounds stay in place. Updates are not installed automatically.\nSee README.md for details.\n',encoding='utf-8')
output=root/'release';output.mkdir(exist_ok=True)
target=output/f'sg0hann-SoundSwap-{version}-Windows-x64.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=3) as z:
 for p in sorted(dist.rglob('*')):
  if p.is_file():z.write(p,str(Path('sg0hann-SoundSwap')/p.relative_to(dist)))
with zipfile.ZipFile(target) as z:assert z.testzip() is None
(output/'SHA256SUMS.txt').write_text(hashlib.sha256(target.read_bytes()).hexdigest()+'  '+target.name+'\n')
print(target)
