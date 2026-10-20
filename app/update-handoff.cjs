'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {spawn}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
async function launchUpdate({directory,installer,sha256,executable,version}, options={}) {
  if(!/^[a-f0-9]{64}$/.test(sha256))throw Error('The update is not verified.');
  await fs.mkdir(directory,{recursive:true});
  const helper=path.join(directory,'install.ps1'),launcher=path.join(directory,'launch-update.js'),config=path.join(directory,'install.json'),status=path.join(directory,'install-status.json');
  await fs.unlink(status).catch(()=>{});
  // readFile works for packaged ASAR files; the helper runs outside the installation.
  await fs.writeFile(helper,await fs.readFile(path.join(__dirname,'update-install.ps1')));
  await fs.writeFile(launcher,await fs.readFile(path.join(__dirname,'update-launcher.js')));
  const id=randomUUID(),cancel=path.join(directory,'cancel-'+id);
  await fs.writeFile(config,JSON.stringify({id,installer,sha256,executable,version,pid:process.pid,status,cancel}));
  const host=path.join(process.env.SystemRoot || 'C:\\Windows','System32','wscript.exe');
  // The GUI script host starts PowerShell with its own hidden console. Neither
  // process depends on the app's console or lifetime, and readiness is confirmed.
  const child=(options.spawn || spawn)(host,['//B','//Nologo','//E:JScript',launcher,helper,config],{cwd:directory,stdio:'ignore',windowsHide:true,detached:true});
  let failure;
  child.once('error',error=>{failure=error;});
  child.once('exit',code=>{if(code!==0)failure=Error(`Update launcher failed (${code}).`);});
  child.unref();
  const deadline=Date.now()+(options.timeout || 20000);
  try {
  while(Date.now()<deadline) {
    let record;try{record=JSON.parse((await fs.readFile(status,'utf8')).replace(/^\uFEFF/,''));}catch{}
    if(record?.id===id && record.state==='ready')return true;
    if(record?.id===id && record.state==='error')throw Error(record.message || 'The update helper could not start.');
    if(failure)throw failure;
    await delay(150);
  }
  // Parent stays open. A helper that starts late also times out without installing.
  throw Error('The installer could not start. The app is still open; try again.');
  }catch(error){await fs.writeFile(cancel,'cancel').catch(()=>{});child.kill?.();throw error;}
}
module.exports={launchUpdate};
