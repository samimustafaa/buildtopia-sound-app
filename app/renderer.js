'use strict';
const $ = id => document.getElementById(id);
const state = { catalog: [], images: {}, page: 'weapons', filter: 'All', query: '', selected: new Set(), applied: new Set(), connection: null, status: { state: 'disconnected' }, busy: false, updating: false, windows: true };
const api = window.soundSwap;
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let toastTimer;
function toast(text, error = false) { $('toast').textContent = text; $('toast').classList.toggle('error', error); $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, error ? 11000 : 5000); }
function info(title, text) { $('dialog-heading').textContent = title; $('dialog-text').textContent = text; $('info-dialog').showModal(); }
async function invoke(method, ...args) {
  if (!api) throw new Error('This is the interface preview. Open the Windows app to connect a game folder and apply sounds.');
  const result = await api[method](...args); if (!result.ok) throw new Error(result.error || 'The operation did not finish.'); return result.value;
}
function isDirty() { return state.connection?.removedExtras || state.selected.size !== state.applied.size || [...state.selected].some(id => !state.applied.has(id)); }
function filtered() { return state.catalog.filter(item => item.section === state.page && (state.filter === 'All' || item.category === state.filter) && `${item.name} ${item.id} ${item.category}`.toLowerCase().includes(state.query)); }
function selectable(item) { return item.available && item.differentAudio; }
function updateFooter() {
  $('selected-count').textContent = `${state.selected.size} sound${state.selected.size === 1 ? '' : 's'} selected`;
  const connected = Boolean(state.connection);
  $('dirty-state').textContent = !api ? 'Interface preview · no game files can be changed' : !connected ? 'Choose a folder to get started' : state.busy ? 'Saving your selected sounds…' : isDirty() ? 'Unsaved selection changes' : 'Selection matches the installed profile';
  $('apply').disabled = state.busy || !connected || state.status.state !== 'closed' || !state.windows || !isDirty();
  $('restore').disabled = state.busy || !connected || state.status.state !== 'closed' || !state.windows || (state.connection.original && !state.applied.size);
  $('browse').disabled = state.busy; $('connect').disabled = state.busy;
  $('folder').disabled = state.busy;
}
function updateStatus() {
  const labels = { disconnected: 'Choose game folder', unknown: 'Status unavailable', running: 'Game running', closed: 'Game closed' };
  const key = state.status.state;
  $('game-state').className = 'game-state ' + key;
  $('game-state').lastElementChild.textContent = labels[key] || 'Status unavailable';
  $('game-state').title = state.status.message || '';
  updateFooter();
}
function renderFilters() {
  const categories = ['All', ...new Set(state.catalog.filter(x => x.section === state.page).map(x => x.category))];
  $('filters').innerHTML = categories.map(category => `<button class="${state.filter === category ? 'active' : ''}" data-filter="${escapeHtml(category)}" aria-pressed="${state.filter === category}">${escapeHtml(category)}</button>`).join('');
}
function renderCards() {
  const items = filtered();
  $('result-count').textContent = `${items.length} of ${state.catalog.filter(x => x.section === state.page).length} sounds`;
  document.querySelector('.list-head').hidden = !items.length;
  $('empty').hidden = Boolean(items.length); $('cards').hidden = !items.length;
  $('cards').innerHTML = items.map(item => {
    const selected = state.selected.has(item.id), disabled = !selectable(item) || state.busy;
    const label = !item.available ? 'Unavailable' : !item.differentAudio ? 'Same audio' : selected ? 'BuildTopia' : 'Original';
    const status = !item.available ? 'No source bank' : !item.differentAudio ? 'Identical audio' : item.tested ? 'Tested' : 'Not tested';
    const custom = state.images[item.id];
    let art;
    if (custom) art = '<div class="card-art custom"><img alt="" data-custom-image="' + item.id + '"></div>';
    else if (item.gameImages?.length) art = '<div class="card-art game-art">' + item.gameImages.map((image, index) => { const [x,y,right,bottom] = image.bounds; const cell = 110 / item.gameImages.length, scale = Math.min((cell-8)/(right-x), 34/(bottom-y)); return `<span class="game-image-cell" style="width:${cell}px"><img src="${escapeHtml(image.src)}" alt="${escapeHtml(item.name)} game artwork" style="width:${image.size[0]*scale}px;height:${image.size[1]*scale}px;left:${(cell-(right-x)*scale)/2-x*scale}px;top:${(44-(bottom-y)*scale)/2-y*scale}px"></span>`; }).join('') + '</div>';
    else art = `<div class="card-art placeholder-icon" aria-hidden="true"><svg><use href="#i-${item.section === 'vehicles' ? 'car' : item.section === 'traps' ? 'trap' : 'weapon'}"/></svg></div>`;
    return `<article class="sound-card ${selected ? 'selected' : ''} ${!item.available ? 'unavailable' : ''}" data-id="${item.id}" title="${escapeHtml(item.note || 'Right-click to change image')}">${art}<div class="sound-details"><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(item.category)}<span class="detail-dot">·</span><span class="test-status ${item.tested ? 'tested' : ''}">${status}</span></p></div><div class="sound-actions"><label class="card-toggle"><input type="checkbox" data-toggle="${item.id}" aria-label="Use BuildTopia sound for ${escapeHtml(item.name)}" ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${label}</span></label>${item.note ? `<button class="item-info" data-info="${item.id}" aria-label="Details for ${escapeHtml(item.name)}"><svg><use href="#i-info"/></svg></button>` : '<span class="info-spacer"></span>'}</div></article>`;
  }).join('');
  document.querySelectorAll('[data-custom-image]').forEach(img => { img.src = state.images[img.dataset.customImage]; img.onerror = () => { img.style.display = 'none'; }; });
  updateFooter();
}
function setSelected(id, checked) {
  const queue = [id], seen = new Set();
  while (queue.length) {
    const current = queue.shift(); if (seen.has(current)) continue; seen.add(current);
    const item = state.catalog.find(x => x.id === current); if (!item || !selectable(item)) continue;
    if (checked) state.selected.add(current); else state.selected.delete(current);
    queue.push(...item.linked);
  }
}
function setPage(page) {
  if (state.busy) return;
  state.page = page; state.filter = 'All'; state.query = ''; $('search').value = '';
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  $('library').hidden = page === 'settings'; $('settings').hidden = page !== 'settings';
  if (page !== 'settings') {
    $('page-heading').textContent = page === 'weapons' ? 'Weapons' : page === 'vehicles' ? 'Vehicles' : 'Traps';
    $('search').placeholder = `Search ${page}…`; renderFilters(); renderCards(); $('library').scrollTop = 0;
  }
}
async function connect(folder) {
  try {
    $('connect').disabled = true;
    const result = await invoke('connect', folder);
    state.connection = result.connection; state.status = result.status;
    state.selected = new Set(result.connection.selections.filter(id => selectable(state.catalog.find(x => x.id === id) || {})));
    state.applied = new Set(state.selected); $('folder').value = result.connection.folder;
    $('connection-note').textContent = result.connection.original ? 'Connected · original supported sound archive detected.' : 'Connected · existing sound pack detected. Apply your selection to keep only the sounds you choose.';
    updateStatus(); renderCards(); toast('Game folder connected.');
  } catch (e) {
    // A failed manual path must not leave a previous connection active behind it.
    state.connection = null; state.status = { state: 'disconnected' }; updateStatus();
    $('connection-note').textContent = 'Folder not connected. Choose a supported game installation.'; toast(e.message, true);
  } finally { updateFooter(); }
}
async function install(restore = false) {
  if (state.busy) return;
  state.busy = true; $('progress-overlay').hidden = false; $('progress-label').textContent = restore ? 'Restoring original sounds…' : 'Building selected sounds…'; renderCards();
  try {
    const result = await invoke(restore ? 'restore' : 'apply', [...state.selected]);
    if (result) {
      state.selected = new Set(result.selected); state.applied = new Set(result.selected);
      state.connection.removedExtras = false; state.connection.original = result.resources === 0; state.connection.backedUp = true;
      toast(result.warning || (restore || result.resources === 0 ? 'Original Creative Destruction sounds restored.' : `Applied ${state.selected.size} selected sounds. You can fully close BuilTopia Sound and launch the game. Sounds stay installed.`), Boolean(result.warning));
      $('connection-note').textContent = `Connected · ${result.resources} sound resources installed · backup kept. You can fully close BuilTopia Sound; sounds stay installed.`;
    }
  } catch (e) { toast(e.message, true); }
  finally { state.busy = false; $('progress-overlay').hidden = true; renderCards(); updateFooter(); showPendingUpdate(); }
}
document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => setPage(button.dataset.page)));
$('filters').addEventListener('click', e => { const button = e.target.closest('[data-filter]'); if (!button) return; state.filter = button.dataset.filter; renderFilters(); renderCards(); });
$('search').addEventListener('input', e => { state.query = e.target.value.toLowerCase().trim(); renderCards(); });
$('reset-search').addEventListener('click', () => { state.query = ''; state.filter = 'All'; $('search').value = ''; renderFilters(); renderCards(); });
$('cards').addEventListener('change', e => { const id = e.target.dataset.toggle; if (!id || state.busy) return; setSelected(id, e.target.checked); renderCards(); });
$('cards').addEventListener('click', async e => {
  const information = e.target.closest('[data-info]');
  if (information) { const item = state.catalog.find(x => x.id === information.dataset.info); info(item.name, item.note); return; }
});
$('cards').addEventListener('contextmenu', async e => {
  const card = e.target.closest('[data-id]'); if (!card || state.busy) return; e.preventDefault();
  try { const image = await invoke('importImage', card.dataset.id); if (image) { state.images[card.dataset.id] = image; renderCards(); toast('Item image updated.'); } } catch (error) { toast(error.message, true); }
});
$('select-visible').addEventListener('click', () => { if (state.busy) return; filtered().filter(selectable).forEach(item => setSelected(item.id, true)); renderCards(); });
$('clear-visible').addEventListener('click', () => { if (state.busy) return; filtered().forEach(item => setSelected(item.id, false)); renderCards(); });
$('browse').addEventListener('click', async () => { try { const folder = await invoke('chooseFolder'); if (folder) await connect(folder); } catch (e) { toast(e.message, true); } });
$('connect').addEventListener('click', () => connect($('folder').value));
$('folder').addEventListener('keydown', e => { if (e.key === 'Enter') connect($('folder').value); });
$('folder').addEventListener('input', () => { if (state.connection && $('folder').value !== state.connection.folder) { state.connection = null; state.status = { state: 'disconnected' }; updateStatus(); } });
$('apply').addEventListener('click', () => install(false)); $('restore').addEventListener('click', () => install(true));
$('open-backups').addEventListener('click', async () => { try { await invoke('openBackups'); } catch (e) { toast(e.message, true); } });
$('dialog-close').addEventListener('click', () => $('info-dialog').close());
async function boot() {
  try {
    let result;
    if (api) result = await invoke('bootstrap');
    else result = { catalog: await fetch('data/catalog.json').then(r => r.json()), images: {}, status: { state: 'disconnected' }, connection: null, windows: false };
    state.catalog = result.catalog.filter(item => item.section === 'weapons');
    state.images = result.images; state.status = result.status; state.connection = result.connection; state.windows = result.windows;
    if (result.connection) { $('folder').value = result.connection.folder; state.selected = new Set(result.connection.selections.filter(id => selectable(state.catalog.find(x => x.id === id) || {}))); state.applied = new Set(state.selected); $('connection-note').textContent = 'Connected · your installed sound profile is loaded.'; }
    renderFilters(); renderCards(); updateStatus();
    if (!api) $('connection-note').textContent = 'Interface preview only. The Windows app connects to your real game folder.';
    if (api && !result.windows) toast('This build can preview the interface here. Applying sounds requires Windows.');
    if (api?.checkUpdates) { setTimeout(() => checkUpdates(false), 2000); setInterval(() => checkUpdates(false), 4*60*60*1000); }
    api?.onProgress(text => $('progress-label').textContent = text);
    if (api) setInterval(async () => { if (document.hidden || state.busy || !state.connection) return; try { state.status = await invoke('status'); updateStatus(); } catch { state.status = { state: 'unknown' }; updateStatus(); } }, 6000);
  } catch (e) { $('result-count').textContent = 'Sound library could not be loaded.'; toast(e.message, true); }
}
let updateChecking=false, pendingUpdate=null, promptedVersion=null;
function showPendingUpdate() {
  if(!pendingUpdate || state.busy || $('info-dialog').open || $('update-dialog').open) return;
  const r=pendingUpdate; pendingUpdate=null; promptedVersion=r.version;
  $('update-version').textContent=`Version ${r.version} is available. You have ${r.current}.`;
  $('update-instructions').textContent = 'Downloads here, updates this installation, then restarts BuilTopia Sound. Your sounds and settings stay saved.';
  $('update-download').textContent = 'Update & restart';
  $('update-notes').textContent=r.notes || 'A new release is ready to download.';
  $('update-dialog').showModal();
}
async function checkUpdates(manual=false) {
  if(!api?.checkUpdates || updateChecking) return;
  updateChecking=true; $('check-updates').disabled=true;
  if(manual) $('update-status').textContent='Checking for updates…';
  try {
    const r=await invoke('checkUpdates',manual);
    if(r.state==='available') { $('update-status').textContent=`Version ${r.version} is available.`; if(manual || promptedVersion!==r.version) {pendingUpdate=r;showPendingUpdate();} }
    else if(r.state==='current') { $('update-status').textContent=`You’re up to date · v${r.current}`; if(manual) toast('You’re using the latest available version.'); }
    else { $('update-status').textContent=r.message; if(manual) toast(r.message,true); }
  } catch(e) { if(manual) toast(e.message,true); }
  finally { updateChecking=false; $('check-updates').disabled=false; }
}
$('check-updates').addEventListener('click',()=>checkUpdates(true));
$('update-later').addEventListener('click',()=>$('update-dialog').close());
$('update-dialog').addEventListener('cancel',e=>{if(state.updating)e.preventDefault();});
$('update-download').addEventListener('click',async()=>{
  if(state.busy || state.updating)return;
  state.updating=true; $('update-download').disabled=true; $('update-later').disabled=true;
  try { $('update-instructions').textContent='Downloading update…'; await invoke('downloadUpdate'); $('update-instructions').textContent='Installing update. The app will reopen automatically.'; }
  catch(e){state.updating=false; $('update-download').disabled=false; $('update-later').disabled=false; $('update-instructions').textContent=e.message;}
});
api?.onUpdateFailed?.(message=>{state.updating=false;$('update-download').disabled=false;$('update-later').disabled=false;$('update-instructions').textContent=message;});
api?.onUpdateStage?.(stage=>{$('update-instructions').textContent=stage;});
api?.onUpdateProgress?.(percent=>{$('update-instructions').textContent=`Downloading update… ${percent}%`;});
for(const id of ['info-dialog','update-dialog']) $(id).addEventListener('close',showPendingUpdate);
window.addEventListener('focus',()=>checkUpdates(false));
boot();
