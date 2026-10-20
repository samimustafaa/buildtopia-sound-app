const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events');
const {launchUpdate}=require('../app/update-handoff.cjs');
async function fixture(fn){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'handoff-'));try{await fn({directory,installer:path.join(directory,'setup.exe'),executable:path.join(directory,'app.exe'),version:'1.4.3',sha256:'a'.repeat(64)});}finally{await fs.rm(directory,{recursive:true,force:true});}}
test('handoff waits for explicit helper readiness using the independent Windows GUI host',()=>fixture(async config=>{
 let called=false,unref=false;
 const result=launchUpdate(config,{spawn:(exe,args,options)=>{
  called=true;assert(exe.endsWith('wscript.exe'));assert.equal(options.detached,true);assert.equal(options.windowsHide,true);assert.equal(options.stdio,'ignore');
  const child=new EventEmitter();child.unref=()=>unref=true;
  setTimeout(()=>fs.writeFile(path.join(config.directory,'install-status.json'),JSON.stringify({state:'ready'})),30);
  return child;
 }});
 await result;assert(called&&unref);const written=JSON.parse(await fs.readFile(path.join(config.directory,'install.json'),'utf8'));assert.equal(written.pid,process.pid);assert.equal(written.sha256,config.sha256);
}));
test('helper startup failure and timeout reject instead of quitting the app',()=>fixture(async config=>{
 await assert.rejects(launchUpdate(config,{spawn:()=>{const c=new EventEmitter();c.unref=()=>{};setTimeout(()=>c.emit('error',Error('blocked')),10);return c;}}),/blocked/);
 await assert.rejects(launchUpdate(config,{timeout:100,spawn:()=>{const c=new EventEmitter();c.unref=()=>{};return c;}}),/still open/);
}));
