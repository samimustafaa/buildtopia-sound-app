'use strict';
const {app}=require('electron');
const path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const {NsisUpdater}=require('electron-updater');
const {ElectronAppAdapter}=require('electron-updater/out/ElectronAppAdapter');
const {ElectronHttpExecutor}=require('electron-updater/out/electronHttpExecutor');
const {NativeUpdates}=require('../app/native-updates.cjs');
app.whenReady().then(async()=>{
 const root=path.resolve(__dirname,'../release');
 const version=require('../package.json').version;
 const files=new Map([['/latest.yml',path.join(root,'latest.yml')],[`/sg0hann-SoundSwap-${version}-Setup.exe`,path.join(root,`sg0hann-SoundSwap-${version}-Setup.exe`)]]);
 const server=http.createServer((request,response)=>{
  const file=files.get(new URL(request.url,'http://localhost').pathname);
  if(!file){response.writeHead(404);return response.end();}
  response.setHeader('Content-Length',fs.statSync(file).size);fs.createReadStream(file).pipe(response);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const adapter=new ElectronAppAdapter(app);
 Object.defineProperty(adapter,'version',{value:'1.4.3'});
 Object.defineProperty(adapter,'appUpdateConfigPath',{value:path.join(root,'win-unpacked/resources/app-update.yml')});
 const updater=new NsisUpdater({provider:'generic',url:`http://127.0.0.1:${server.address().port}/`},adapter);
 updater.httpExecutor=new ElectronHttpExecutor(()=>{});
 const controller=new NativeUpdates(updater,{error:e=>{console.error(e);app.exit(1);}});
 const deadline=setTimeout(()=>{console.error('Native update timed out');app.exit(1);},90000);
 await controller.download(version);
 console.log('Native updater downloaded and verified the real installer.');
 clearTimeout(deadline);server.close();controller.install();
}).catch(error=>{console.error(error);app.exit(1);});
