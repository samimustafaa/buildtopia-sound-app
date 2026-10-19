'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');

function parseArchive(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 0, 4) !== 'NXPK') throw new Error('This is not a supported NPK archive.');
  const count = buffer.readUInt32LE(4), index = buffer.readUInt32LE(20);
  if (!count || count > 100000 || index < 24 || index + count * 28 !== buffer.length) throw new Error('The archive index is damaged.');
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    const entry = Array.from({ length: 7 }, (_, j) => buffer.readUInt32LE(index + i * 28 + j * 4));
    const [id, offset, size] = entry;
    if (entries.has(id) || offset < 24 || offset + size > index) throw new Error('The archive contains an invalid resource.');
    entries.set(id, entry);
  }
  return { count, index, entries };
}
function bytes(buffer, entry) { return buffer.subarray(entry[1], entry[1] + entry[2]); }

class SoundEngine {
  constructor(dataDir, userDir, guard) {
    this.dataDir = dataDir; this.userDir = userDir; this.guard = guard;
    this.busy = false; this.loaded = null;
  }
  async load() {
    if (this.loaded) return this.loaded;
    const [manifest, catalog, original] = await Promise.all([
      fs.readFile(path.join(this.dataDir, 'manifest.json'), 'utf8').then(JSON.parse),
      fs.readFile(path.join(this.dataDir, 'catalog.json'), 'utf8').then(JSON.parse),
      fs.readFile(path.join(this.dataDir, 'original.npk'))
    ]);
    if (hash(original) !== manifest.originalSha256) throw new Error('The bundled original archive is damaged. Re-extract the app.');
    const parsed = parseArchive(original);
    if (parsed.count !== manifest.originalCount) throw new Error('The source archive version does not match.');
    this.loaded = { manifest, catalog, original, parsed }; return this.loaded;
  }
  async settings() {
    try { return JSON.parse(await fs.readFile(path.join(this.userDir, 'settings.json'), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return { folder: '', games: {} }; throw new Error('App settings could not be read.'); }
  }
  async saveSettings(value) {
    await fs.mkdir(this.userDir, { recursive: true });
    const temp = path.join(this.userDir, 'settings.json.tmp');
    await fs.writeFile(temp, JSON.stringify(value, null, 2));
    await fs.rename(temp, path.join(this.userDir, 'settings.json'));
  }
  gameId(folder) { return hash(Buffer.from(folder.toLowerCase())).slice(0, 20); }
  async resolveFolder(input) {
    if (typeof input !== 'string' || input.length > 2000 || !input.trim()) throw new Error('Choose your Creative Destruction folder first.');
    let folder = await fs.realpath(input.trim());
    if (path.basename(folder).toLowerCase() === 'res') folder = path.dirname(folder);
    const target = path.join(folder, 'res', 'wwise.npk');
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Choose a game folder containing res\\wwise.npk (not a shortcut).');
    const realTarget = await fs.realpath(target);
    if (path.dirname(realTarget) !== await fs.realpath(path.join(folder, 'res'))) throw new Error('The sound archive must be inside the selected game folder.');
    return { folder, target };
  }
  async inspect(input) {
    const { manifest, parsed, catalog, original } = await this.load();
    const { folder, target } = await this.resolveFolder(input);
    const [current, settings] = await Promise.all([fs.readFile(target), this.settings()]);
    const digest = hash(current), record = settings.games?.[this.gameId(folder)];
    let supported = manifest.knownArchiveHashes.includes(digest) || digest === record?.lastHash;
    let currentParsed;
    if (!supported) {
      try {
        currentParsed = parseArchive(current);
        supported = currentParsed.count === parsed.count && [...parsed.entries].every(([key, entry]) => {
          const actual = currentParsed.entries.get(key); if (!actual) return false;
          if (bytes(current, actual).equals(bytes(original, entry)) && actual.slice(2).every((v, i) => v === entry[i + 2])) return true;
          const patch = manifest.patches[key.toString(16).padStart(8, '0')];
          return patch && actual.slice(2).every((v, i) => v === patch.entry[i + 2]) && hash(bytes(current, actual)) === patch.sha256;
        });
      } catch { supported = false; }
    }
    if (!supported) throw new Error('Unsupported or externally modified sound archive. Restore the original supported Creative Destruction wwise.npk, or a v1–v4 pack from this project. Your file was not changed.');
    if (digest !== '526b3e4e56e18900e50161696005408a1a2c7543f2d536936b9794207b2fa4b0') {
      const info = parseArchive(current);
      if (info.count !== parsed.count || [...parsed.entries.keys()].some(k => !info.entries.has(k))) throw new Error('This archive belongs to an unsupported game build.');
    }
    currentParsed ||= parseArchive(current);
    const detected = catalog.filter(item => item.available && item.resources.length && item.resources.every(id => {
      const e = currentParsed.entries.get(Number.parseInt(id, 16));
      return e && hash(bytes(current, e)) === manifest.patches[id].sha256;
    })).map(item => item.id);
    return { folder, target, hash: digest, original: digest === manifest.originalSha256, selections: detected, lastApplied: record?.lastApplied || null, backedUp: Boolean(record?.backup) };
  }
  normalizeSelections(ids) {
    const catalog = this.loaded.catalog;
    if (!Array.isArray(ids) || ids.length > catalog.length || ids.some(id => typeof id !== 'string')) throw new Error('Invalid sound selection.');
    const chosen = new Set(ids);
    for (const id of chosen) {
      const item = catalog.find(c => c.id === id);
      if (!item?.available) throw new Error('This sound is not available.');
    }
    // Mutable resources shared by two banks are an explicitly linked selection.
    for (const id of chosen) for (const linked of catalog.find(c => c.id === id).linked || []) chosen.add(linked);
    return [...chosen].sort();
  }
  async build(ids) {
    const { manifest, catalog, original, parsed } = await this.load();
    const selected = this.normalizeSelections(ids);
    const resourceIds = new Set(selected.flatMap(id => catalog.find(c => c.id === id).resources));
    if (!resourceIds.size) return { buffer: original, selected, resourceCount: 0 };
    const patches = new Map(); let length = parsed.index;
    for (const id of resourceIds) {
      const info = manifest.patches[id];
      if (!info || !/^[0-9a-f]{8}$/.test(id)) throw new Error('Invalid resource manifest.');
      const data = await fs.readFile(path.join(this.dataDir, 'patches', id + '.bin'));
      if (hash(data) !== info.sha256 || data.length !== info.entry[2]) throw new Error('A bundled sound resource is damaged: ' + id);
      const key = Number.parseInt(id, 16);
      if (!parsed.entries.has(key) || info.entry[0] !== key) throw new Error('This patch does not match the base archive.');
      length = (length + 3) & ~3;
      patches.set(key, { data, entry: [key, length, ...info.entry.slice(2)] }); length += data.length;
    }
    const index = (length + 3) & ~3;
    const result = Buffer.alloc(index + parsed.count * 28);
    original.copy(result, 0, 0, parsed.index);
    let i = 0;
    for (const [key, entry] of parsed.entries) {
      const patch = patches.get(key), next = patch?.entry || entry;
      if (patch) patch.data.copy(result, next[1]);
      next.forEach((value, j) => result.writeUInt32LE(value, index + i * 28 + j * 4)); i++;
    }
    result.writeUInt32LE(index, 20);
    const check = parseArchive(result);
    for (const [key, entry] of check.entries) {
      const expected = patches.get(key)?.data || bytes(original, parsed.entries.get(key));
      if (!bytes(result, entry).equals(expected)) throw new Error('The generated archive did not pass validation.');
    }
    return { buffer: result, selected, resourceCount: patches.size };
  }
  async ensureClosed(folder) {
    const state = await this.guard(folder);
    if (!state || state.state !== 'closed') throw new Error(state?.state === 'running' ? 'Close Creative Destruction before changing sounds.' : 'Unable to verify that the game is closed. Wait and try again.');
  }
  async install(input, ids, progress = () => {}) {
    if (this.busy) throw new Error('A sound update is already running.');
    this.busy = true; let temp;
    try {
      const info = await this.inspect(input);
      await this.ensureClosed(info.folder);
      progress('Building selected sounds…');
      const built = await this.build(ids), digest = hash(built.buffer);
      const settings = await this.settings(); settings.games ||= {};
      const gameId = this.gameId(info.folder); const record = settings.games[gameId] || {};
      const backupDir = path.join(this.userDir, 'backups', gameId);
      await fs.mkdir(backupDir, { recursive: true });
      if (!record.backup) {
        const backup = path.join(backupDir, 'before-soundswap.npk');
        try { await fs.copyFile(info.target, backup, require('node:fs').constants.COPYFILE_EXCL); }
        catch (e) { if (e.code !== 'EEXIST') throw e; }
        const backupHash = hash(await fs.readFile(backup));
        // Preserve a pre-existing backup instead of replacing it on a retry.
        record.backup = backup; record.backupHash = backupHash;
      }
      progress('Checking game status and saving…');
      temp = info.target + '.soundswap-' + crypto.randomUUID() + '.tmp';
      const handle = await fs.open(temp, 'wx');
      try { await handle.writeFile(built.buffer); await handle.sync(); } finally { await handle.close(); }
      if (hash(await fs.readFile(temp)) !== digest) throw new Error('The temporary archive failed its file check.');
      await this.ensureClosed(info.folder);
      if (hash(await fs.readFile(info.target)) !== info.hash) throw new Error('The game archive changed while preparing the update. Nothing was replaced.');
      await fs.rename(temp, info.target); temp = null;
      record.lastHash = digest; record.selected = built.selected; record.lastApplied = new Date().toISOString();
      settings.folder = info.folder; settings.games[gameId] = record;
      try { await this.saveSettings(settings); }
      catch { return { folder: info.folder, selected: built.selected, resources: built.resourceCount, hash: digest, warning: 'Sounds were saved, but preferences could not be recorded. Keep this archive hash: ' + digest }; }
      return { folder: info.folder, selected: built.selected, resources: built.resourceCount, hash: digest };
    } finally {
      if (temp) await fs.unlink(temp).catch(() => {});
      this.busy = false;
    }
  }
}
module.exports = { SoundEngine, parseArchive, bytes, hash };
