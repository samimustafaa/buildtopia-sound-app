'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const BASE = 'https://github.com/samimustafaa/buildtopia-sound-app/releases';
function parts(v) { const m = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(String(v)); return m && m.slice(1).map(Number).every(Number.isSafeInteger) ? m.slice(1).map(Number) : null; }
function newer(a, b) { a = parts(a); b = parts(b); if (!a || !b) return false; for (let i=0;i<3;i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; }
function parseRelease(r, current) {
  if (!r || r.draft || r.prerelease || !newer(r.tag_name, current)) return { state: 'current', current };
  const version = parts(r.tag_name).join('.');
  if (!Array.isArray(r.assets)) return { state: 'current', current };
  for (const [kind,name] of [['installer',`sg0hann-SoundSwap-${version}-Setup.exe`],['zip',`sg0hann-SoundSwap-${version}-Windows-x64.zip`]]) {
    const download = `${BASE}/download/${r.tag_name}/${name}`;
    const asset=r.assets.find(a => a.name === name && a.state === 'uploaded' && a.browser_download_url === download);
    if (asset) return { state: 'available', current, version, kind, download, digest: asset.digest, size: asset.size, notes: String(r.body || '').slice(0,6000) };
  }
  return { state: 'current', current };
}
class UpdateChecker {
  constructor(current, fetcher = globalThis.fetch, now = Date.now) { this.current=current; this.fetcher=fetcher; this.now=now; this.pending=null; this.cached=null; this.checked=0; }
  async check(force=false) {
    if (this.pending) return this.pending;
    if (!force && this.cached && this.now()-this.checked < 15*60*1000) return this.cached;
    this.pending=this.request().finally(()=>this.pending=null); return this.pending;
  }
  async request() {
    let result;
    try {
      const r=await this.fetcher('https://api.github.com/repos/samimustafaa/buildtopia-sound-app/releases/latest',{headers:{Accept:'application/vnd.github+json','User-Agent':`sg0hann-SoundSwap/${this.current}`},signal:AbortSignal.timeout(12000),redirect:'error'});
      if (r.status===404) result={state:'current',current:this.current};
      else {
        if (!r.ok) throw Error('unavailable');
        const reader=r.body.getReader(), chunks=[]; let size=0;
        try { while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>512*1024) throw Error('oversized'); chunks.push(Buffer.from(value)); } }
        finally { await reader.cancel().catch(()=>{}); }
        result=parseRelease(JSON.parse(Buffer.concat(chunks).toString('utf8')),this.current);
      }
    } catch { result={state:'unavailable',current:this.current,message:'Could not check for updates. Check your connection and try again. Your installed sounds still work.'}; }
    this.cached=result; this.checked=this.now(); return result;
  }
  async download(directory, progress=()=>{}) {
    if(this.downloading) throw Error('An update is already downloading.');
    const release=this.cached;
    if(release?.state!=='available' || release.kind!=='installer') throw Error('No installer update is available.');
    if(!/^sha256:[a-f0-9]{64}$/.test(release.digest || '')) throw Error('This release has no verified checksum. Try again later.');
    if(!Number.isSafeInteger(release.size) || release.size<2 || release.size>500*1024*1024) throw Error('Invalid update size.');
    this.downloading=true; this.ready=null;
    const target=path.join(directory,`SoundSwap-${release.version}-Setup.exe`), temporary=target+'.partial';
    let file;
    try {
      await fs.mkdir(directory,{recursive:true});
      let url=release.download, response;
      for(let i=0;i<6;i++) {
        response=await this.fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(10*60*1000)});
        if(![301,302,303,307,308].includes(response.status)) break;
        const next=new URL(response.headers.get('location'),url);
        if(next.protocol!=='https:' || next.username || next.password || !['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(next.hostname)) throw Error('Untrusted update redirect.');
        await response.body?.cancel(); url=next.href;
      }
      if(!response.ok || !response.body) throw Error('Update download failed. Try again.');
      file=await fs.open(temporary,'w'); const hash=createHash('sha256'); let size=0, first=Buffer.alloc(0);
      for await(const chunk of response.body) {
        const data=Buffer.from(chunk);size+=data.length;
        if(size>release.size) throw Error('Invalid update download size.');
        if(first.length<2)first=Buffer.concat([first,data]).subarray(0,2);
        hash.update(data);await file.writeFile(data);progress(Math.floor(size/release.size*100));
      }
      if(size!==release.size || first.toString()!=='MZ' || hash.digest('hex')!==release.digest.slice(7)) throw Error('Update verification failed. Nothing was installed.');
      await file.sync();await file.close();file=null;await fs.rename(temporary,target);
      this.ready={installer:target,sha256:release.digest.slice(7)};return true;
    } finally {await file?.close();await fs.unlink(temporary).catch(()=>{});this.downloading=false;}
  }

}
module.exports={UpdateChecker,newer,parseRelease,BASE};
