const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'exports/storage');
const storageKey = 'glitch-social-composer-created-pics';
const cardsSelector = '#assets-created .asset-chip';

async function startServer() {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
  const server = http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    let target;
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Outside repository');
    } catch { response.writeHead(400).end(); return; }
    fs.stat(target, (error, stat) => {
      if (error || !stat.isFile()) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Content-Length': stat.size });
      if (request.method === 'HEAD') response.end();
      else fs.createReadStream(target).on('error', () => response.destroy()).pipe(response);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

(async () => {
  const local = process.env.COMPOSER_URL ? null : await startServer();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [], evidence = {};
  try {
    fs.mkdirSync(output, { recursive: true });
    const url = process.env.COMPOSER_URL || local.url;
    async function editor() {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      await page.waitForFunction(() => !!document.querySelector('[data-asset-id="expenses-icon"]'));
      return page;
    }
    const stored = page => page.evaluate(key => localStorage.getItem(key), storageKey);
    const entries = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), storageKey);
    async function blank(page) {
      await page.locator('#btn-empty-blank').click();
      await page.waitForFunction(() => !document.querySelector('#btn-save').disabled);
    }
    async function save(page) {
      const count = (await entries(page)).length;
      await page.locator('#btn-save').click();
      await page.waitForFunction(({ key, count }) => JSON.parse(localStorage.getItem(key) || '[]').length === count + 1, { key: storageKey, count });
      assert.match(await page.locator('#created-status').innerText(), /^Saved\b/);
    }
    async function failWrites(page) {
      await page.evaluate(key => {
        window.restoreCreatedWrites = () => { Storage.prototype.setItem = real; };
        const real = Storage.prototype.setItem;
        Storage.prototype.setItem = function (name, value) {
          if (name === key) throw new DOMException('Storage full', 'QuotaExceededError');
          return real.call(this, name, value);
        };
      }, storageKey);
    }
    async function errorStatus(page) {
      const status = page.locator('#created-status');
      await status.waitFor({ state: 'visible' });
      const text = await status.innerText();
      assert.match(text, /could not|couldn.t|unable|not saved|full|unavailable|limit|storage/i);
      assert.doesNotMatch(text, /^Saved[\s:]/i);
      return text;
    }

    // A failed durable write must leave the existing library exactly intact.
    const failure = await editor();
    await blank(failure); await save(failure);
    const original = await stored(failure);
    await failWrites(failure);
    await failure.locator('#btn-save').click();
    const failedSaveMessage = await errorStatus(failure);
    assert.equal(await stored(failure), original);
    assert.equal(await failure.locator(cardsSelector).count(), 1);
    await failure.locator('#tab-assets').click();
    await failure.setViewportSize({ width: 1366, height: 900 });
    assert.equal(await failure.locator('#created-status').innerText(), failedSaveMessage, 'The library error survives redraws and navigation');
    assert.equal(await failure.locator('#created-status').isVisible(), true);
    await failure.screenshot({ path: path.join(output, 'save-failure.png') });
    await failure.reload();
    await failure.waitForFunction(() => document.querySelectorAll('#assets-created .asset-chip').length === 1);
    assert.equal(await stored(failure), original);
    await failure.locator(cardsSelector).first().click();
    await failure.waitForFunction(() => !document.querySelector('#btn-download').disabled);
    assert.deepEqual(await failure.locator('#stage-canvas').evaluate(canvas => [canvas.width, canvas.height]), [1080, 1080]);
    evidence.failedSave = { message: failedSaveMessage, countAfterReload: 1, originalRetained: true, restoredDimensions: [1080, 1080] };
    await failure.close();

    // Reaching the count limit must not remove an older design to make room.
    const full = await editor();
    await blank(full);
    for (let index = 0; index < 12; index++) await save(full);
    const beforeThirteenth = await stored(full);
    const firstId = (await entries(full))[0].id;
    await full.locator('#btn-save').click();
    const countMessage = await errorStatus(full);
    assert.match(countMessage, /12|limit|full/i);
    assert.equal(await stored(full), beforeThirteenth);
    assert.equal(await full.locator(cardsSelector).count(), 12);
    assert.equal((await entries(full))[0].id, firstId);
    await full.screenshot({ path: path.join(output, 'count-limit.png') });

    // Removal is also transactional: a failed write keeps both the card and save.
    await failWrites(full);
    await full.locator('#assets-created .saved-asset-row').first().locator('.asset-chip-remove').click();
    const removeMessage = await errorStatus(full);
    assert.equal(await stored(full), beforeThirteenth);
    assert.equal(await full.locator(cardsSelector).count(), 12);
    await full.evaluate(() => window.restoreCreatedWrites());
    await full.locator('#assets-created .saved-asset-row').first().locator('.asset-chip-remove').click();
    await full.waitForFunction(key => JSON.parse(localStorage.getItem(key)).length === 11, storageKey);
    assert.equal(await full.locator(cardsSelector).count(), 11);
    assert.match(await full.locator('#created-status').innerText(), /removed|deleted/i);
    await full.reload();
    await full.waitForFunction(() => document.querySelectorAll('#assets-created .asset-chip').length === 11);
    assert.equal((await entries(full))[0].id, firstId);
    evidence.capacity = { countMessage, firstIdRetained: true, failedRemoveMessage: removeMessage, countAfterSuccessfulRemovalAndReload: 11 };
    await full.close();

    // High-detail images reach the aggregate library budget before the count limit.
    const budget = await editor();
    const noise = await budget.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
      const context = canvas.getContext('2d'), image = context.createImageData(1024, 1024);
      let seed = 73;
      for (let offset = 0; offset < image.data.length; offset += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        image.data[offset] = seed & 255; image.data[offset + 1] = (seed >>> 8) & 255;
        image.data[offset + 2] = (seed >>> 16) & 255; image.data[offset + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await budget.locator('#bg-input').setInputFiles({ name: 'detail.png', mimeType: 'image/png', buffer: Buffer.from(noise, 'base64') });
    await budget.waitForFunction(() => document.querySelector('#stage-canvas').width === 1024 && !document.querySelector('#btn-save').disabled);
    await save(budget);
    const firstDetailed = await stored(budget);
    await budget.locator('#btn-save').click();
    const budgetMessage = await errorStatus(budget);
    assert.match(budgetMessage, /storage|limit|full|space/i);
    assert.equal(await stored(budget), firstDetailed);
    assert.equal(await budget.locator(cardsSelector).count(), 1);
    assert.equal((await entries(budget)).length, 1);
    await budget.reload();
    await budget.waitForFunction(() => document.querySelectorAll('#assets-created .asset-chip').length === 1);
    assert.equal(await stored(budget), firstDetailed);
    evidence.budget = { message: budgetMessage, originalRetained: true, countAfterReload: 1 };
    await budget.close();

    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
    console.log('PASS: durable save errors, persistent feedback, no silent count/budget eviction, transactional removal, and saved design reload/restore.');
    console.log(`Evidence: ${output}`);
  } finally {
    await browser.close();
    if (local) await new Promise(resolve => local.server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
