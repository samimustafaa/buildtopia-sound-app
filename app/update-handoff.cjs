'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {spawn}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
async function launchUpdate({directory,installer,sha256,executable,version}, options={}) {
  if(!/^[a-f0-9]{64}$/.test(sha256))throw Error('The update is not verified.');
  await fs.mkdir(directory,{recursive:true});
  const helper=path.join(directory,'install.ps1'),config=path.join(directory,'install.json'),status=path.join(directory,'install-status.json');
  await fs.unlink(status).catch(()=>{});
  // readFile works for packaged ASAR files; the helper runs outside the installation.
  await fs.writeFile(helper,await fs.readFile(path.join(__dirname,'update-install.ps1')));
  const cancel=path.join(directory,'cancel-'+randomUUID());
  await fs.writeFile(config,JSON.stringify({installer,sha256,executable,version,pid:process.pid,status,cancel}));
  const powershell=path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  // A detached console process can die before PowerShell runs the script. Hide its
  // console normally, close inherited streams and unref it so it survives app exit.
  const child=(options.spawn || spawn)(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-ConfigPath',config],{cwd:directory,stdio:'ignore',windowsHide:true,detached:false});
  let failure;
  child.once('error',error=>{failure=error;});
  child.once('exit',code=>{failure=Error(`Update helper exited before starting (${code}).`);});
  child.unref();
  const deadline=Date.now()+(options.timeout || 20000);
  try {
  while(Date.now()<deadline) {
    let record;try{record=JSON.parse((await fs.readFile(status,'utf8')).replace(/^\uFEFF/,''));}catch{}
    if(record?.state==='ready')return true;
    if(record?.state==='error')throw Error(record.message || 'The update helper could not start.');
    if(failure)throw failure;
    await delay(150);
  }
  // Parent stays open. A helper that starts late also times out without installing.
  throw Error('The installer could not start. The app is still open; try again.');
  }catch(error){await fs.writeFile(cancel,'cancel').catch(()=>{});child.kill?.();throw error;}
}
module.exports={launchUpdate};
