const {test}=require('node:test'),assert=require('node:assert/strict');
const {UpdateChecker,newer,parseRelease,BASE}=require('../app/updates.cjs');
function release(){const name='sg0hann-SoundSwap-1.2.0-Windows-x64.zip';return{tag_name:'v1.2.0',draft:false,prerelease:false,body:'Test release',assets:[{name,state:'uploaded',browser_download_url:`${BASE}/download/v1.2.0/${name}`}]};}
test('stable versions are compared numerically',()=>{assert(newer('v1.10.0','1.9.0'));for(const v of ['1.1.0','1.0.0','v1.2.0-beta','garbage'])assert(!newer(v,'1.1.0'));});
test('only complete stable releases with trusted assets are offered',()=>{assert.equal(parseRelease(release(),'1.1.0').state,'available');for(const change of [{draft:true},{prerelease:true},{assets:[]},{tag_name:'../../evil'}])assert.equal(parseRelease({...release(),...change},'1.1.0').state,'current');const bad=release();bad.assets[0].browser_download_url='https://evil.example/app.exe';assert.equal(parseRelease(bad,'1.1.0').state,'current');});
test('automatic checks cache and deduplicate, manual checks retry',async()=>{let calls=0;const c=new UpdateChecker('1.1.0',async()=>{calls++;return new Response(JSON.stringify(release()));});await Promise.all([c.check(),c.check()]);assert.equal(calls,1);await c.check();assert.equal(calls,1);await c.check(true);assert.equal(calls,2);});
test('offline and invalid responses leave the app usable',async()=>{for(const f of [async()=>{throw Error('offline')},async()=>new Response('{'),async()=>new Response('',{status:403}),async()=>new Response('a'.repeat(513*1024))]){const c=new UpdateChecker('1.1.0',f);assert.equal((await c.check()).state,'unavailable');await assert.rejects(c.download('/unused'));}assert.equal((await new UpdateChecker('1.1.0',async()=>new Response('',{status:404})).check()).state,'current');});
test('new releases prefer the single installer and preserve ZIP fallback for older releases',()=>{
 const r=release(),name='sg0hann-SoundSwap-1.2.0-Setup.exe';r.assets.push({name,state:'uploaded',browser_download_url:`${BASE}/download/v1.2.0/${name}`});
 const update=parseRelease(r,'1.1.0');assert.equal(update.kind,'installer');assert(update.download.endsWith('-Setup.exe'));
 r.assets[1].browser_download_url='https://evil.example/setup.exe';assert.equal(parseRelease(r,'1.1.0').kind,'zip');
});

const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
test('installer downloads verify bytes, size and SHA256 before becoming ready',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'update-test-'));
 const bytes=Buffer.from('MZtest-installer'),digest='sha256:'+createHash('sha256').update(bytes).digest('hex');
 try{
  const c=new UpdateChecker('1.3.0',async()=>new Response(bytes));
  c.cached={state:'available',kind:'installer',version:'1.4.0',download:BASE+'/download/v1.4.0/sg0hann-SoundSwap-1.4.0-Setup.exe',size:bytes.length,digest};
  const progress=[];await c.download(dir,n=>progress.push(n));assert.deepEqual(await fs.readFile(c.ready.installer),bytes);assert.equal(progress.at(-1),100);
  for(const change of [{digest:'sha256:'+'0'.repeat(64)},{size:bytes.length-1},{digest:undefined}]){
   c.cached={...c.cached,...change};await assert.rejects(c.download(dir));assert.equal(c.downloading,false);
  }
  assert(!(await fs.readdir(dir)).some(x=>x.endsWith('.partial')));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('untrusted download redirects cannot run an installer',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'update-test-'));
 try{const c=new UpdateChecker('1.3.0',async()=>new Response(null,{status:302,headers:{location:'https://evil.example/setup.exe'}}));c.cached={state:'available',kind:'installer',version:'1.4.0',download:BASE+'/download/v1.4.0/setup.exe',size:10,digest:'sha256:'+'0'.repeat(64)};await assert.rejects(c.download(dir),/Untrusted/);assert.equal(c.ready,null);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
