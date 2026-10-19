const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '../app');
const server = http.createServer(async (req, res) => {
  const local = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!local.startsWith(root + path.sep) && local !== root) { res.writeHead(403); res.end(); return; }
  const file = local === root ? path.join(root, 'index.html') : local;
  try {
    const data = await fs.readFile(file); const ext = path.extname(file);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.ogg': 'audio/ogg', '.png': 'image/png' })[ext] || 'application/octet-stream'); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1380, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url); await page.waitForSelector('.sound-card');
  assert(await page.locator('#apply').isDisabled());
  await page.locator('[data-toggle="weapon_ak47"]').check();
  assert.equal(await page.locator('#selected-count').textContent(), '1 sound selected');
  assert(await page.locator('#apply').isDisabled());
  await page.screenshot({ path: path.join(__dirname, '../screenshots/interface-preview.png') });
  await page.addInitScript(() => {
    window.__calls = []; window.__running = false;
    window.soundSwap = {
      bootstrap: async () => ({ ok: true, value: { catalog: await fetch('data/catalog.json').then(r => r.json()), images: {}, connection: null, status: { state: 'disconnected' }, version: '1.1.0', windows: true } }),
      chooseFolder: async () => ({ ok: true, value: 'C:\\Creative Destruction' }),
      connect: async folder => ({ ok: true, value: { connection: { folder, selections: [], original: true }, status: { state: 'closed' } } }),
      status: async () => ({ ok: true, value: { state: window.__running ? 'running' : 'closed' } }),
      apply: async ids => { window.__calls.push(ids); return { ok: true, value: { selected: ids, resources: ids.length * 3 } }; },
      restore: async () => ({ ok: true, value: { selected: [], resources: 0 } }),
      checkUpdates: async () => ({ ok: true, value: window.__available ? { state: 'available', current: '1.1.0', version: '1.2.0', notes: '<script>unsafe</script> Test release' } : { state: 'current', current: '1.1.0' } }),
      downloadUpdate: async () => { window.__downloads = (window.__downloads || 0) + 1; return { ok: true, value: true }; },
      onProgress: () => {}, openBackups: async () => ({ ok: true, value: true })
    };
  });
  await page.reload(); await page.waitForSelector('.sound-card');
  await page.locator('#browse').click();
  await page.waitForFunction(() => document.querySelector('#game-state').textContent.includes('Game closed'));
  for (const id of ['weapon_ak47', 'weapon_scar', 'weapon_xm8', 'weapon_tsg']) await page.locator(`[data-toggle="${id}"]`).check();
  assert.equal(await page.locator('#selected-count').textContent(), '4 sounds selected');
  assert(await page.locator('#apply').isEnabled());
  await page.locator('#library').evaluate(e => e.scrollTop = 0);
  const twelfth = await page.locator('.sound-card').nth(11).boundingBox();
  const footer = await page.locator('footer').boundingBox();
  assert(twelfth.y + twelfth.height <= footer.y + 2, 'The first 12 compact cards should fit above the footer: ' + JSON.stringify({twelfth,footer}));
  await page.screenshot({ path: path.join(__dirname, '../screenshots/app-dark-amber.png'), animations: 'disabled' });
  await page.locator('#apply').click();
  await page.waitForFunction(() => document.querySelector('#progress-overlay').hidden);
  assert.equal(await page.evaluate(() => window.__calls.length), 1);
  assert(await page.locator('#apply').isDisabled());
  assert((await page.locator('#connection-note').textContent()).includes('fully close SoundSwap'));
  await page.locator('#search').fill('AK-47'); assert.equal(await page.locator('.sound-card').count(), 1);
  await page.locator('#search').fill('');
  await page.locator('[data-page="vehicles"]').click();
  assert((await page.locator('.sound-card').count()) >= 10);
  await page.locator('[data-page="traps"]').click();
  assert((await page.locator('.sound-card').count()) >= 10);
  await page.locator('[data-page="settings"]').click();
  assert(await page.locator('#settings').isVisible());
  await page.locator('#check-updates').click();
  await page.waitForFunction(() => document.querySelector('#update-status').textContent.includes('up to date'));
  await page.evaluate(() => window.__available = true);
  await page.locator('#check-updates').click();
  await page.waitForSelector('#update-dialog[open]');
  assert((await page.locator('#update-notes').textContent()).includes('<script>unsafe</script>'));
  assert.equal(await page.locator('#update-notes script').count(), 0);
  await page.locator('#update-later').click();
  await page.locator('#check-updates').click();
  await page.waitForSelector('#update-dialog[open]');
  await page.locator('#update-download').click();
  assert.equal(await page.evaluate(() => window.__downloads), 1);
  await page.locator('[data-page="weapons"]').click();
  await page.locator('[data-preview="weapon_ak47"]').click();
  await page.waitForFunction(() => document.querySelector('#audio').currentTime > 0);
  await page.locator('[data-preview="weapon_ak47"]').click();
  await page.locator('[data-toggle="weapon_ak47"]').uncheck();
  await page.evaluate(() => window.__running = true);
  await page.waitForFunction(() => document.querySelector('#game-state').textContent.includes('Game running'), { timeout: 10000 });
  assert(await page.locator('#apply').isDisabled());
  await page.evaluate(() => window.__running = false);
  await page.waitForFunction(() => document.querySelector('#game-state').textContent.includes('Game closed'), { timeout: 10000 });
  await page.locator('#restore').click();
  await page.waitForFunction(() => document.querySelector('#selected-count').textContent.startsWith('0 sounds'));
  assert(await page.locator('#restore').isDisabled());
  await page.setViewportSize({ width: 940, height: 720 });
  await page.locator('#library').evaluate(e => e.scrollTop = 0);
  await page.screenshot({ path: path.join(__dirname, '../screenshots/compact-window.png'), animations: 'disabled' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.addInitScript(() => { window.__available = true; });
  await page.reload();
  await page.waitForSelector('#update-dialog[open]');
  assert((await page.locator('#update-version').textContent()).includes('1.2.0'));
  await page.locator('#update-later').click();
  assert.deepEqual(errors, []);
  console.log('UI checks passed: preview safety, folder selection, per-item toggles, apply, search, categories, tabs, real audio playback, running-game block, restore, compact layout, automatic update popup, manual checks, dismissal and download.');
  await browser.close(); server.close();
})().catch(e => { console.error(e); server.close(); process.exit(1); });
