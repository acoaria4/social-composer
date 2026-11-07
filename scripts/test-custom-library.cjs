const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, clickAsset } = require('./test-support.cjs');

const storageKey = 'glitch-social-composer-custom-assets';
const output = path.resolve(__dirname, '../exports/sprint5/custom-library');
const stamp = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="#ee3311"/></svg>';
const stampData = `data:image/svg+xml;base64,${Buffer.from(stamp).toString('base64')}`;
const upload = { name: 'stamp.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(stamp) };

(async () => {
  const browser = await launchBrowser();
  const evidence = {}, errors = [];
  try {
    fs.mkdirSync(output, { recursive: true });
    async function editor(seed) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      if (seed) await context.addInitScript(({ key, assets }) => {
        if (/^https?:$/.test(location.protocol) && localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(assets));
      }, { key: storageKey, assets: seed });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(process.env.COMPOSER_URL);
      await page.waitForFunction(() => !!document.querySelector('[data-asset-id="expenses-icon"]'));
      await page.locator('[data-brand="expenses"]').click();
      await page.locator('#preset-select').selectOption('native');
      await page.locator('#tab-assets').click();
      await page.locator('#panel-assets > details:not([data-brand-panel]) > summary').click();
      return page;
    }
    const stored = page => page.evaluate(key => localStorage.getItem(key), storageKey);
    const entries = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), storageKey);
    const pixels = page => page.locator('#stage-canvas').evaluate(canvas => canvas.toDataURL());
    async function blank(page) {
      await page.locator('#btn-empty-blank').click();
      await page.waitForFunction(() => !document.querySelector('#btn-save').disabled);
    }
    async function failWrites(page) {
      await page.evaluate(key => {
        const real = Storage.prototype.setItem;
        window.restoreCustomWrites = () => { Storage.prototype.setItem = real; };
        Storage.prototype.setItem = function (name, value) {
          if (name === key) throw new DOMException('Storage full', 'QuotaExceededError');
          return real.call(this, name, value);
        };
      }, storageKey);
    }
    async function uploadFinished(page) {
      await page.waitForFunction(() => document.querySelector('#custom-asset-input').value === '');
    }
    async function errorStatus(page) {
      await page.waitForFunction(() => {
        const status = document.querySelector('#custom-status');
        return status && !status.hidden && /could not|couldn.t|unable|not saved|full|unavailable|limit|storage|failed|exceed/i.test(status.textContent);
      });
      assert.equal(await page.locator('#custom-status').getAttribute('role'), 'status');
      const message = await page.locator('#custom-status').innerText();
      assert.doesNotMatch(message, /^Added\b/i);
      return message;
    }

    const failure = await editor();
    await blank(failure);
    const emptyLibrary = await stored(failure), beforeUpload = await pixels(failure);
    await failWrites(failure);
    await failure.locator('#custom-asset-input').setInputFiles(upload);
    const failedUploadMessage = await errorStatus(failure); await uploadFinished(failure);
    assert.equal(await stored(failure), emptyLibrary, 'A failed upload leaves browser storage unchanged');
    assert.equal(await failure.locator('#assets-custom .asset-item').count(), 0, 'A failed durable upload does not add a visible asset');
    assert.equal(await pixels(failure), beforeUpload, 'A failed upload keeps the canvas');
    await failure.locator('#tab-create').click(); await failure.locator('#tab-assets').click();
    assert.equal(await failure.locator('#custom-status').innerText(), failedUploadMessage, 'The error survives tool navigation');
    assert.equal(await failure.locator('#custom-status').isVisible(), true);
    await failure.screenshot({ path: path.join(output, 'upload-failure.png') });
    await failure.evaluate(() => window.restoreCustomWrites());
    await failure.locator('#custom-asset-input').setInputFiles(upload); await uploadFinished(failure);
    await failure.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '[]').length === 1, storageKey);
    assert.equal(await failure.locator('#assets-custom .asset-item').count(), 1);
    assert.match(await failure.locator('#custom-status').innerText(), /added|uploaded|saved/i, 'A successful retry clears the old failure');
    assert.equal(await pixels(failure), beforeUpload);
    evidence.upload = { failedWritePreservesStorage: true, noOptimisticAsset: true, canvasKept: true, persistentMessage: failedUploadMessage, retryAddsOne: true };
    await failure.context().close();

    const seed = Array.from({ length: 12 }, (_, index) => ({ id: `custom-seed-${index}`, label: `Seed ${index}`, dataUrl: stampData }));
    const full = await editor(seed);
    await full.waitForFunction(() => document.querySelectorAll('#assets-custom .asset-item').length === 12);
    await blank(full);
    await clickAsset(full, '#assets-custom .asset-item:first-child > .asset-chip');
    const beforeThirteenth = await stored(full), beforeRemove = await pixels(full);
    await full.locator('#custom-asset-input').setInputFiles(upload);
    const countMessage = await errorStatus(full); await uploadFinished(full);
    assert.match(countMessage, /12|full|limit/i);
    assert.equal(await stored(full), beforeThirteenth, 'A thirteenth upload never evicts a saved asset');
    assert.equal(await full.locator('#assets-custom .asset-item').count(), 12);
    assert.equal((await entries(full))[0].id, seed[0].id);
    assert.equal(await pixels(full), beforeRemove);
    await failWrites(full);
    await full.locator('#assets-custom .asset-item:first-child > .asset-chip-remove').click();
    const removeMessage = await errorStatus(full);
    assert.equal(await stored(full), beforeThirteenth);
    assert.equal(await full.locator('#assets-custom .asset-item').count(), 12);
    assert.equal(await full.locator('#layers-list .layer-row').count(), 1, 'Failed removal keeps its placed image');
    assert.equal(await pixels(full), beforeRemove, 'Failed removal leaves the composition unchanged');
    await full.evaluate(() => window.restoreCustomWrites());
    await full.locator('#assets-custom .asset-item:first-child > .asset-chip-remove').click();
    await full.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '[]').length === 11, storageKey);
    assert.equal(await full.locator('#assets-custom .asset-item').count(), 11);
    assert.match(await full.locator('#custom-status').innerText(), /removed|deleted/i);
    await full.reload();
    await full.waitForFunction(() => document.querySelectorAll('#assets-custom .asset-item').length === 11);
    assert.equal((await entries(full))[0].id, seed[1].id);
    evidence.capacityAndRemoval = { thirteenthRejected: true, countMessage, firstAssetRetained: true, failedRemovalMessage: removeMessage, failedRemovalPreservesCanvas: true, retryAndReloadCount: 11 };
    await full.context().close();

    // A large encoded SVG comment exercises the storage budget with only a 12px image.
    const prefix = 'data:image/svg+xml;base64,', limit = 2 * 1024 * 1024;
    const shell = stamp.replace('</svg>', '<!----></svg>');
    const rawLength = Math.floor((limit - prefix.length - 64) / 4) * 3;
    const padded = stamp.replace('</svg>', `<!--${'x'.repeat(rawLength - Buffer.byteLength(shell))}--></svg>`);
    const paddedData = prefix + Buffer.from(padded).toString('base64');
    assert.ok(paddedData.length < limit && paddedData.length + stampData.length > limit);
    const budget = await editor([{ id: 'custom-budget', label: 'Budget fixture', dataUrl: paddedData }]);
    await budget.waitForFunction(() => document.querySelectorAll('#assets-custom .asset-item').length === 1);
    const beforeBudget = await stored(budget);
    await budget.locator('#custom-asset-input').setInputFiles(upload);
    const budgetMessage = await errorStatus(budget); await uploadFinished(budget);
    assert.match(budgetMessage, /2\s*m|budget|limit|space|exceed/i);
    assert.equal(await stored(budget) === beforeBudget, true, 'The aggregate budget never removes an earlier custom asset');
    assert.equal(await budget.locator('#assets-custom .asset-item').count(), 1);
    assert.equal((await entries(budget))[0].id, 'custom-budget');
    evidence.budget = { encodedCharacters: paddedData.length, message: budgetMessage, earlierAssetRetained: true, countRetained: 1 };
    await budget.context().close();

    assert.deepEqual(errors, [], 'No uncaught page errors');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
    console.log('PASS: transactional custom uploads/removal, durable retries, persistent feedback, no count eviction, and canvas retention.');
    console.log(`Evidence: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
