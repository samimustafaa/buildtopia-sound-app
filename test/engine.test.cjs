const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { SoundEngine, parseArchive, bytes, hash } = require('../app/engine.cjs');
const data = path.join(__dirname, '../app/data');
const engine = new SoundEngine(data, '', async () => ({ state: 'closed' }));
let source;
before(async () => { source = await engine.load(); });

test('damaged archive headers and bounds are rejected', () => {
  assert.throws(() => parseArchive(Buffer.alloc(30)), /supported NPK/);
  const b = Buffer.from(source.original); b.writeUInt32LE(0xffffffff, 20);
  assert.throws(() => parseArchive(b), /damaged/);
});
test('empty profile restores exact original bytes', async () => {
  const result = await engine.build([]);
  assert.equal(hash(result.buffer), source.manifest.originalSha256);
  assert.equal(result.resourceCount, 0);
});
test('AK-47 changes only its own bank, metadata and declared packages', async () => {
  const result = await engine.build(['weapon_ak47']);
  const parsed = parseArchive(result.buffer);
  const selected = source.catalog.find(x => x.id === 'weapon_ak47');
  assert(selected.resources.length >= 3);
  const allowed = new Set(selected.resources.map(x => parseInt(x, 16)));
  let changed = 0;
  for (const [key, entry] of parsed.entries) {
    const actual = bytes(result.buffer, entry), original = bytes(source.original, source.parsed.entries.get(key));
    if (!actual.equals(original)) { assert(allowed.has(key)); changed++; }
  }
  assert.equal(changed, allowed.size);
  assert.equal(parsed.count, 389);
});
test('all selectable sounds preserve every resource and the original Init bank', async () => {
  const ids = source.catalog.filter(x => x.available && x.differentAudio).map(x => x.id);
  const result = await engine.build(ids); const parsed = parseArchive(result.buffer);
  assert.equal(parsed.count, 389);
  assert.deepEqual([...parsed.entries.keys()], [...source.parsed.entries.keys()]);
  assert(bytes(result.buffer, parsed.entries.get(0x2da677a3)).equals(bytes(source.original, source.parsed.entries.get(0x2da677a3))));
  assert(result.resourceCount > 40);
  await assert.rejects(() => engine.build(['weapon_m82a3']), /not available/);
});

async function fixture(fn, guard = async () => ({ state: 'closed' })) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'soundswap-test-'));
  const game = path.join(dir, 'Game'); const target = path.join(game, 'res', 'wwise.npk');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(path.join(data, 'original.npk'), target);
  const instance = new SoundEngine(data, path.join(dir, 'UserData'), guard); instance.loaded = source;
  try { await fn({ dir, game, target, instance }); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
test('changing AK to SCAR resets AK, preserves first backup, and restore is exact', async () => {
  await fixture(async ({ game, target, instance }) => {
    await instance.install(game, ['weapon_ak47']);
    let info = await instance.inspect(game); assert.deepEqual(info.selections, ['weapon_ak47']);
    await instance.install(game, ['weapon_scar']);
    const installed = await fs.readFile(target), parsed = parseArchive(installed);
    const ak = 0x8e3d91b2;
    assert(bytes(installed, parsed.entries.get(ak)).equals(bytes(source.original, source.parsed.entries.get(ak))));
    info = await instance.inspect(game); assert.deepEqual(info.selections, ['weapon_scar']);
    await instance.install(game, []);
    assert.equal(hash(await fs.readFile(target)), source.manifest.originalSha256);
    const settings = await instance.settings(); const record = settings.games[instance.gameId(info.folder)];
    assert.equal(hash(await fs.readFile(record.backup)), source.manifest.originalSha256);
  });
});
test('running game prevents writes', async () => {
  await fixture(async ({ game, target, instance }) => {
    await assert.rejects(() => instance.install(game, ['weapon_ak47']), /Close Creative Destruction/);
    assert.equal(hash(await fs.readFile(target)), source.manifest.originalSha256);
  }, async () => ({ state: 'running' }));
});
test('a game starting during the build prevents commit and removes temporary files', async () => {
  let calls = 0;
  await fixture(async ({ game, target, instance }) => {
    await assert.rejects(() => instance.install(game, ['weapon_ak47']), /Close Creative Destruction/);
    assert.equal(hash(await fs.readFile(target)), source.manifest.originalSha256);
    assert.deepEqual(await fs.readdir(path.dirname(target)), ['wwise.npk']);
  }, async () => ({ state: ++calls === 1 ? 'closed' : 'running' }));
});
test('an unknown modified archive is refused without being overwritten', async () => {
  await fixture(async ({ game, target, instance }) => {
    const b = Buffer.from(source.original); b[1000] ^= 0x55; await fs.writeFile(target, b);
    const beforeHash = hash(b);
    await assert.rejects(() => instance.install(game, ['weapon_ak47']), /Unsupported/);
    assert.equal(hash(await fs.readFile(target)), beforeHash);
  });
});
test('a bundle-generated file is recognized even without saved preferences', async () => {
  await fixture(async ({ game, target, instance }) => {
    const result = await engine.build(['weapon_ak47', 'weapon_scar']); await fs.writeFile(target, result.buffer);
    const info = await instance.inspect(game);
    assert.deepEqual(info.selections.sort(), ['weapon_ak47', 'weapon_scar']);
  });
});
test('catalog routes UMP9, Uzi and DTR to the source clips verified by metadata', () => {
  assert.equal(source.catalog.find(x => x.id === 'weapon_tsmg').name, 'UMP9');
  assert.equal(source.catalog.find(x => x.id === 'weapon_smg').name, 'Uzi');
  assert.equal(source.catalog.find(x => x.id === 'weapon_tsg').name, 'DTR');
});
