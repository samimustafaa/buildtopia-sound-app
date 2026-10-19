'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
  const dir=path.join(__dirname,'../app/data'), target=path.join(dir,'original.npk');
  const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
  const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
  try{if(sha(await fs.readFile(target))===manifest.originalSha256)return;}catch(e){if(e.code!=='ENOENT')throw e;}
  const parts=path.join(dir,'original.parts'),names=(await fs.readdir(parts)).filter(x=>/^part-\d{3}\.bin$/.test(x)).sort();
  const data=Buffer.concat(await Promise.all(names.map(n=>fs.readFile(path.join(parts,n)))));
  if(sha(data)!==manifest.originalSha256)throw Error('Original archive parts failed SHA-256 validation.');
  const temp=target+'.restore-temp';try{await fs.writeFile(temp,data);await fs.rename(temp,target);}finally{await fs.unlink(temp).catch(()=>{});}
  console.log('Original sound archive verified and prepared.');
})().catch(e=>{console.error(e);process.exitCode=1;});
