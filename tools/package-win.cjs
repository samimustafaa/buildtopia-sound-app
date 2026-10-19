'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {packager}=require('@electron/packager');
(async()=>{
  const root=path.resolve(__dirname,'..'),stage=await fs.mkdtemp(path.join(os.tmpdir(),'soundswap-source-'));
  try{
    await fs.copyFile(path.join(root,'package.json'),path.join(stage,'package.json'));
    await fs.cp(path.join(root,'app'),path.join(stage,'app'),{recursive:true,filter:p=>!path.basename(p).startsWith('.')&&path.basename(p)!=='original.parts'});
    const output=await packager({dir:stage,name:'sg0hann SoundSwap',platform:'win32',arch:'x64',out:path.join(root,'dist'),overwrite:true,asar:true,prune:false,electronVersion:require('../package.json').devDependencies.electron,icon:path.join(root,'app/assets/app.ico'),appCopyright:'sg0hann',win32metadata:{CompanyName:'sg0hann',ProductName:'sg0hann SoundSwap',FileDescription:'sg0hann SoundSwap',InternalName:'sg0hann SoundSwap'}});
    console.log(output);
  }finally{await fs.rm(stage,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
