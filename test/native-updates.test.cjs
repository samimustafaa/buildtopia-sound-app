const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {NativeUpdates}=require('../app/native-updates.cjs');
test('native updater downloads before requesting silent installation and automatic relaunch',async()=>{
 const updater=new EventEmitter(),calls=[];updater.checkForUpdates=async()=>({updateInfo:{version:'1.5.0'}});updater.downloadUpdate=async()=>{calls.push('download');return ['verified.exe'];};updater.quitAndInstall=(silent,reopen)=>calls.push([silent,reopen]);
 const service=new NativeUpdates(updater);assert.throws(()=>service.install(),/verify/);await service.download('1.5.0');service.install();assert.deepEqual(calls,['download',[true,true]]);assert.equal(updater.autoDownload,false);
});
test('download failures and unexpected versions cannot trigger installation',async()=>{
 const updater=new EventEmitter();updater.checkForUpdates=async()=>({updateInfo:{version:'2.0.0'}});const service=new NativeUpdates(updater);await assert.rejects(service.download('1.5.0'),/changed/);assert.throws(()=>service.install(),/verify/);
 updater.checkForUpdates=async()=>({updateInfo:{version:'1.5.0'}});updater.downloadUpdate=async()=>{throw Error('checksum mismatch');};await assert.rejects(service.download('1.5.0'),/checksum/);assert.throws(()=>service.install(),/verify/);
});
