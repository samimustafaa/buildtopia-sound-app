'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const { SoundEngine } = require('./engine.cjs');
const { UpdateChecker } = require('./updates.cjs');
const run = promisify(execFile);
let win, engine, folder = '', status = { state: 'unknown' }, polling = false;
const pageUrl = pathToFileURL(path.join(__dirname, 'index.html')).href;
async function gameStatus(target) {
  if (!target) return { state: 'disconnected' };
  if (process.platform !== 'win32') return { state: 'unknown', message: 'File changes are supported on Windows only.' };
  try {
    const script = '$ErrorActionPreference="Stop"; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); @(Get-CimInstance Win32_Process | Select-Object Name,ExecutablePath) | ConvertTo-Json -Compress';
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
    const rows = JSON.parse(stdout.replace(/^\uFEFF/, '').trim() || '[]');
    const root = path.resolve(target).toLowerCase() + path.sep;
    const processes = (Array.isArray(rows) ? rows : [rows]).filter(p => {
      const name = String(p.Name || '').toLowerCase();
      if (/launcher|soundswap|crash|update|uninstall/.test(name)) return false;
      const executable = String(p.ExecutablePath || '').toLowerCase();
      if (executable && executable.startsWith(root)) return true;
      return !executable && ['client.exe', 'creativedestruction.exe', 'creative_destruction.exe'].includes(name);
    });
    return processes.length ? { state: 'running', message: 'Close the game: ' + processes.map(p => p.Name).join(', ') } : { state: 'closed' };
  } catch { return { state: 'unknown', message: 'Could not check running processes. Apply is blocked until the game can be checked.' }; }
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== win.webContents || event.senderFrame?.url !== pageUrl) throw new Error('Invalid request.');
    try { return { ok: true, value: await fn(...args) }; }
    catch (e) { return { ok: false, error: e.code === 'EACCES' || e.code === 'EPERM' ? 'Windows denied file access. Close the game and check folder permissions. Your original backup is kept.' : e.message }; }
  });
}
async function images(catalog) {
  const root = path.join(app.getPath('userData'), 'images');
  const result = {};
  for (const item of catalog) {
    for (const extension of ['png', 'jpg', 'webp']) {
      try { const data = await fs.readFile(path.join(root, item.id + '.' + extension)); result[item.id] = 'data:image/' + (extension === 'jpg' ? 'jpeg' : extension) + ';base64,' + data.toString('base64'); break; } catch {}
    }
  }
  return result;
}
app.setName('sg0hann SoundSwap');
if (process.platform === 'win32') app.setAppUserModelId('com.sg0hann.soundswap');
if (process.platform === 'win32' && !app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(async () => {
  const updater = new UpdateChecker(app.getVersion());
  handle('check-updates', async force => updater.check(force === true));
  handle('download-update', async () => updater.open(url => shell.openExternal(url)));
  engine = new SoundEngine(path.join(__dirname, 'data'), app.getPath('userData'), gameStatus);
  win = new BrowserWindow({ width: 1380, height: 930, minWidth: 920, minHeight: 680, backgroundColor: '#11151a', title: 'sg0hann SoundSwap', icon: path.join(__dirname, 'assets/app.png'), autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  handle('bootstrap', async () => {
    const { catalog } = await engine.load(); const settings = await engine.settings();
    let connection = null;
    if (settings.folder) { try { connection = await engine.inspect(settings.folder); folder = connection.folder; } catch {} }
    status = await gameStatus(folder);
    return { catalog, images: await images(catalog), connection, status, version: app.getVersion(), windows: process.platform === 'win32' };
  });
  handle('choose-folder', async () => {
    const result = await dialog.showOpenDialog(win, { title: 'Choose Creative Destruction', defaultPath: folder || 'C:\\Creative Destruction', properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  handle('connect', async input => {
    if (engine.busy) throw new Error('Wait for the current update to finish.');
    const info = await engine.inspect(input); folder = info.folder;
    const settings = await engine.settings(); settings.folder = folder; await engine.saveSettings(settings);
    status = await gameStatus(folder); return { connection: info, status };
  });
  handle('status', async () => {
    if (!polling) { polling = true; try { status = await gameStatus(folder); } finally { polling = false; } }
    return status;
  });
  const progress = text => { if (!win.isDestroyed()) win.webContents.send('progress', text); };
  handle('apply', async ids => engine.install(folder, ids, progress));
  handle('restore', async () => {
    const result = await dialog.showMessageBox(win, { type: 'question', title: 'Restore original sounds', message: 'Restore the original Creative Destruction sounds?', detail: 'This removes all sound selections. Your first-install backup will remain available.', buttons: ['Cancel', 'Restore original'], defaultId: 0, cancelId: 0 });
    return result.response === 1 ? engine.install(folder, [], progress) : null;
  });
  handle('open-backups', async () => {
    const location = path.join(app.getPath('userData'), 'backups'); await fs.mkdir(location, { recursive: true });
    const error = await shell.openPath(location); if (error) throw new Error(error); return true;
  });
  handle('import-image', async id => {
    const { catalog } = await engine.load(); if (!catalog.some(c => c.id === id)) throw new Error('Unknown item.');
    const chosen = await dialog.showOpenDialog(win, { title: 'Choose an image for this item', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], properties: ['openFile'] });
    if (chosen.canceled) return null;
    const file = chosen.filePaths[0], stat = await fs.stat(file);
    if (stat.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
    let ext = path.extname(file).slice(1).toLowerCase(); if (ext === 'jpeg') ext = 'jpg';
    if (!['png', 'jpg', 'webp'].includes(ext)) throw new Error('Use a PNG, JPG or WebP image.');
    const data = await fs.readFile(file), dir = path.join(app.getPath('userData'), 'images'); await fs.mkdir(dir, { recursive: true });
    // Let Chromium validate decoding; the copied file is never executed.
    for (const prior of ['png', 'jpg', 'webp']) await fs.unlink(path.join(dir, id + '.' + prior)).catch(() => {});
    await fs.writeFile(path.join(dir, id + '.' + ext), data);
    return 'data:image/' + (ext === 'jpg' ? 'jpeg' : ext) + ';base64,' + data.toString('base64');
  });
  win.on('close', event => { if (engine.busy) { event.preventDefault(); dialog.showMessageBox(win, { message: 'Please wait for the sound update to finish.' }); } });
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
