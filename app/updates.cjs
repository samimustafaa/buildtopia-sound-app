'use strict';
const BASE = 'https://github.com/samimustafaa/buildtopia-sound-app/releases';
function parts(v) { const m = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(String(v)); return m && m.slice(1).map(Number).every(Number.isSafeInteger) ? m.slice(1).map(Number) : null; }
function newer(a, b) { a = parts(a); b = parts(b); if (!a || !b) return false; for (let i=0;i<3;i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; }
function parseRelease(r, current) {
  if (!r || r.draft || r.prerelease || !newer(r.tag_name, current)) return { state: 'current', current };
  const version = parts(r.tag_name).join('.');
  if (!Array.isArray(r.assets)) return { state: 'current', current };
  for (const [kind,name] of [['installer',`sg0hann-SoundSwap-${version}-Setup.exe`],['zip',`sg0hann-SoundSwap-${version}-Windows-x64.zip`]]) {
    const download = `${BASE}/download/${r.tag_name}/${name}`;
    if (r.assets.some(a => a.name === name && a.state === 'uploaded' && a.browser_download_url === download)) return { state: 'available', current, version, kind, download, notes: String(r.body || '').slice(0,6000) };
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
  async open(openExternal) { if(this.cached?.state!=='available') throw Error('Check for an available update first.'); await openExternal(this.cached.download); return true; }
}
module.exports={UpdateChecker,newer,parseRelease,BASE};
