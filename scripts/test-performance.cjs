const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, clickAsset, browserName } = require('./test-support.cjs');
const output = path.resolve(__dirname, '../exports/performance', browserName());
const icon = '[data-asset-id="expenses-icon"]';
const mark = '[data-asset-id="expenses-mark"]';
const layers = page => page.locator('#layers-list .layer-row').count();
const pixels = page => page.locator('#stage-canvas').evaluate(canvas => canvas.toDataURL());
const pngSize = file => { const bytes = fs.readFileSync(path.resolve(__dirname, '..', file)); return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]; };

(async () => {
  const browser = await launchBrowser();
  const evidence = {}, errors = [];
  fs.mkdirSync(output, { recursive: true });
  try {
    async function fresh() {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(() => {
        window.perfCounts = { captures: 0, draws: 0 };
        const draw = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function (...args) {
          if (this.canvas.id === 'stage-canvas') window.perfCounts.draws++;
          return draw.apply(this, args);
        };
        let model, assets;
        Object.defineProperty(window, 'ComposerDocumentModel', { configurable: true, get: () => model, set(value) {
          const create = value.create;
          value.create = (...args) => { const result = create(...args), capture = result.capture; result.capture = () => { window.perfCounts.captures++; return capture(); }; return result; };
          model = value;
        } });
        Object.defineProperty(window, 'ComposerAssetStore', { configurable: true, get: () => assets, set(value) {
          const create = value.create;
          value.create = (...args) => { const result = create(...args); window.assetStats = result.stats; return result; };
          assets = value;
        } });
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(process.env.COMPOSER_URL);
      await page.waitForFunction(() => !!document.querySelector('[data-asset-id="expenses-icon"]'));
      return page;
    }
    async function blank(page) { await page.locator('[data-brand="expenses"]').click(); await page.locator('#preset-select').selectOption('native'); await page.locator('#btn-empty-blank').click(); await page.waitForFunction(() => !document.querySelector('#btn-save').disabled); }
    async function assets(page) { await page.locator('[data-brand="expenses"]').click(); await page.locator('#tab-assets').click(); await page.locator('#panel-assets [data-brand-panel="expenses"]').evaluate(details => { details.open = true; }); }
    async function more(page, button) { if (!await page.locator('.more-actions').evaluate(details => details.open)) await page.locator('.more-actions > summary').click(); await page.locator(button).click(); }
    async function closeMore(page) { await page.locator('.more-actions').evaluate(details => { details.open = false; }); }
    async function project(page) {
      const event = page.waitForEvent('download'); await more(page, '#btn-export-project');
      const file = path.join(output, 'portable.json'); await (await event).saveAs(file); await closeMore(page);
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    const bitmapSize = (page, source) => page.evaluate(async data => { const image = new Image(); image.src = data; await image.decode(); return [image.naturalWidth, image.naturalHeight]; }, source);
    async function gate(page, basename) {
      let release;
      const pattern = `**/brands/current/${basename}.png`;
      await page.route(pattern, route => new Promise(resolve => { release = async () => { await route.continue(); resolve(); }; }));
      return { wait: () => page.waitForFunction(() => document.querySelector('[aria-busy="true"]') !== null), release: async () => { assert.equal(typeof release, 'function', 'The original image request was gated'); await release(); await page.unroute(pattern); } };
    }

    const page = await fresh();
    await page.waitForLoadState('networkidle');
    const startup = await page.evaluate(() => { const entries = performance.getEntriesByType('resource'); return { bytes: entries.reduce((sum, entry) => sum + entry.decodedBodySize, 0), originals: entries.filter(entry => new URL(entry.name).pathname.includes('/brands/current/')).map(entry => new URL(entry.name).pathname) }; });
    assert.deepEqual(startup.originals, [], 'Startup never fetches full-resolution brand artwork');
    assert.ok(startup.bytes > 0 && startup.bytes < 1500000, 'Startup resource body budget stays below 1.5 MB');
    await blank(page); await assets(page); await page.waitForLoadState('networkidle');
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname.includes('/brands/current/')).length), 0, 'Browsing thumbnails does not fetch original artwork');
    await clickAsset(page, icon);
    const originalRequests = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname.includes('/brands/current/')).map(entry => new URL(entry.name).pathname));
    assert.deepEqual(originalRequests, ['/brands/current/expenses-icon.png']);
    const saved = await project(page);
    assert.deepEqual(await bitmapSize(page, saved.composition.assetDataUrls['expenses-icon']), pngSize('brands/current/expenses-icon.png'), 'Projects embed the original resolution, not the UI thumbnail');
    evidence.loading = { ...startup, originalLoadedOnlyOnInsert: true, fullResolutionProject: true };

    const selection = await page.locator('#selection-box').boundingBox();
    const originalPixels = await pixels(page);
    await page.mouse.move(selection.x + selection.width / 2, selection.y + selection.height / 2); await page.mouse.down();
    const burst = await page.locator('#stage-canvas').evaluate(async (canvas, origin) => {
      window.perfCounts.captures = window.perfCounts.draws = 0;
      for (let index = 1; index <= 100; index++) canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, buttons: 1, clientX: origin.x + index, clientY: origin.y + 20 }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { ...window.perfCounts };
    }, { x: selection.x + selection.width / 2, y: selection.y + selection.height / 2 });
    await page.mouse.up();
    assert.equal(burst.captures, 1, 'A pointer burst captures one immutable document snapshot');
    assert.ok(burst.draws <= 2, 'A pointer burst paints at most one background and one layer');
    await page.locator('#btn-undo').click(); assert.equal(await pixels(page), originalPixels);
    const selected = await page.locator('#selection-box').boundingBox();
    await page.mouse.move(selected.x + selected.width / 2, selected.y + selected.height / 2); await page.mouse.down();
    await page.locator('#stage-canvas').evaluate(canvas => {
      const r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, buttons: 1, clientX: r.left + r.width * .7, clientY: r.top + r.height * .7 }));
      document.querySelector('#stage-drop').dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'z', ctrlKey: true }));
    });
    await page.mouse.up();
    assert.equal(await layers(page), 1, 'Undo during a pending frame preserves the layer');
    assert.equal(await pixels(page), originalPixels, 'Undo during a pending frame reverts the drag');
    evidence.interaction = { pointerEvents: 100, captures: burst.captures, drawCalls: burst.draws, pendingFrameUndo: true };
    await page.context().close();

    const race = await fresh(); await blank(race); await assets(race);
    const delayed = await gate(race, 'expenses-icon');
    await race.locator(icon).click(); await delayed.wait();
    await race.locator('#bg-input').setInputFiles({ name: 'blue.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="blue"/></svg>') });
    await race.waitForFunction(() => document.querySelector('#stage-canvas').getContext('2d').getImageData(1, 1, 1, 1).data[2] === 255);
    await delayed.release(); await race.waitForFunction(() => !document.querySelector('[data-asset-id="expenses-icon"]').disabled);
    assert.equal(await layers(race), 0); assert.equal((await race.evaluate(() => assetStats())).loaded, 0);
    let fail = true;
    const retrySelector = '[data-asset-id="expenses-wordmark-light"]';
    await race.route('**/brands/current/expenses-wordmark-light.png', route => { if (fail) { fail = false; return route.abort(); } return route.continue(); });
    await race.locator(retrySelector).click(); await race.waitForFunction(() => !document.querySelector('[data-asset-id="expenses-wordmark-light"]').disabled);
    assert.equal(fail, false, 'The failed original request was actually intercepted, rather than reused from the browser image cache');
    assert.match(await race.locator('#session-status').innerText(), /retry/i); assert.equal(await layers(race), 0);
    await clickAsset(race, retrySelector); await race.unroute('**/brands/current/expenses-wordmark-light.png');
    evidence.asyncAssets = { staleInsertCanceled: true, unusedImagePruned: true, failedLoadRetry: true };

    const portable = await project(race);
    for (let index = 0; index < 4; index++) {
      await race.locator('#project-input').setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(portable)) });
      await race.waitForFunction(() => document.querySelector('#session-status').textContent.startsWith('Project opened'));
      assert.equal((await race.evaluate(() => assetStats())).loaded, 1, 'Replacing a project frees unused image registry entries');
    }
    const beforeClear = await pixels(race); await more(race, '#btn-reset'); await closeMore(race);
    assert.equal((await race.evaluate(() => assetStats())).loaded, 0);
    await race.locator('#btn-undo').click(); assert.equal(await pixels(race), beforeClear);
    assert.equal((await race.evaluate(() => assetStats())).loaded, 1, 'Undo retains only the restored document image in the active registry');
    await race.locator('#btn-redo').click();
    assert.equal((await race.evaluate(() => assetStats())).loaded, 0, 'Redoing Clear releases the active image registry immediately');
    assert.equal(await race.locator('#empty-state').isVisible(), true);
    await race.locator('#btn-undo').click();
    assert.equal((await race.evaluate(() => assetStats())).loaded, 1);
    assert.ok(await pixels(race) === beforeClear, 'A second Undo restores the exact artwork after registry pruning');
    evidence.cache = { repeatedImports: 4, loadedImagesAfterEachImport: 1, clearReleasesRegistry: true, undoRetainsExactPixels: true, undoRedoPrunesRegistry: true };

    await assets(race);
    const tintGate = await gate(race, 'expenses-mark');
    await race.locator('#chip-custom-color').click(); await tintGate.wait();
    assert.equal(await race.locator('#chip-custom-color').isDisabled(), true, 'A second tint click is unavailable while its source is loading');
    assert.equal(await layers(race), 1);
    await tintGate.release(); await race.waitForFunction(() => !document.querySelector('#tint-insert').disabled);
    await race.locator('#tint-insert').click();
    const tint = await project(race);
    assert.deepEqual(await bitmapSize(race, tint.composition.assetDataUrls['expenses-custom-color']), pngSize('brands/current/expenses-mark.png'));
    assert.ok(Math.max(...await race.locator('#chip-custom-color img').evaluate(image => [image.naturalWidth, image.naturalHeight])) <= 192);
    await race.locator('#tab-layers').click();
    await race.locator('.layer-row .layer-select').last().click();
    await race.locator('#layer-delete').click();
    await race.locator('#btn-save').click();
    assert.equal(await race.locator('#document-status').innerText(), 'Saved locally', 'The tint-only design fits the existing browser library budget');
    await race.locator('#btn-close-saved').click();
    await race.locator('[data-brand="lumen"]').click(); await race.locator('[data-brand="expenses"]').click();
    await race.locator('#chip-custom-color').click(); await race.waitForFunction(() => !document.querySelector('#tint-insert').disabled);
    assert.equal(await race.locator('#document-status').innerText(), 'Saved locally', 'Reopening an unchanged tint does not add a history entry');
    evidence.tint = { loadingGuard: true, smallUIPreview: true, fullResolutionSource: true, reopeningKeepsSavedState: true };
    await race.context().close();

    const palette = await fresh(); await blank(palette); await assets(palette);
    await palette.locator('#chip-custom-color').click();
    await palette.waitForFunction(() => !document.querySelector('#tint-insert').disabled);
    const colorA = '#224466', colorB = '#cc7744';
    await palette.locator('#tint-hex').fill(colorA);
    const previewA = await palette.locator('#chip-custom-color img').getAttribute('src');
    await palette.locator('#tint-insert').click();
    const baselineTint = await project(palette);
    const originalA = baselineTint.composition.assetDataUrls['expenses-custom-color'];
    assert.equal(baselineTint.composition.tintHex, colorA);
    await palette.locator('#btn-undo').click();
    assert.equal(await layers(palette), 0, 'The palette history case begins without a tint layer');
    // Palette-only changes have no canvas history until a document edit uses
    // them. Two canvas-size edits capture A and B without retaining a tint layer.
    await palette.locator('#tint-hex').fill(colorA);
    await palette.locator('#preset-select').focus();
    await palette.locator('#preset-select').selectOption('1080x1350');
    await palette.locator('#tint-hex').fill(colorB);
    assert.notEqual(await palette.locator('#chip-custom-color img').getAttribute('src'), previewA);
    await palette.locator('#preset-select').focus();
    await palette.locator('#preset-select').selectOption('1080x1920');
    await palette.locator('#btn-undo').click();
    assert.equal(await layers(palette), 0);
    assert.equal((await palette.locator('#tint-hex').inputValue()).toLowerCase(), colorA);
    assert.ok(await palette.locator('#chip-custom-color img').getAttribute('src') === previewA, 'Undo restores the original palette preview even when its snapshot has no tint image');
    await palette.locator('#tint-insert').click();
    const restoredTint = await project(palette);
    assert.equal(restoredTint.composition.tintHex, colorA);
    assert.ok(restoredTint.composition.assetDataUrls['expenses-custom-color'] === originalA, 'Inserting after palette Undo uses the original full-resolution color, not the stale cached color');
    assert.deepEqual(await bitmapSize(palette, restoredTint.composition.assetDataUrls['expenses-custom-color']), pngSize('brands/current/expenses-mark.png'));
    evidence.tint.paletteUndoRestoresPreviewAndOriginal = true;
    await palette.context().close();

    const canceled = await fresh(); await blank(canceled); await assets(canceled);
    await canceled.locator('#custom-asset-input').setInputFiles({ name: 'temporary.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="white"/></svg>') });
    await canceled.waitForFunction(() => document.querySelector('#assets-custom .asset-chip'));
    await canceled.locator('#assets-custom').evaluate(node => { node.closest('details').open = true; });
    const queued = await gate(canceled, 'expenses-icon');
    await canceled.locator(icon).click(); await queued.wait();
    await canceled.locator('#assets-custom .asset-chip').click();
    await canceled.locator('#assets-custom .asset-chip-remove').click();
    await queued.release(); await canceled.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
    assert.equal(await layers(canceled), 1, 'A removed custom asset cannot be resurrected by a queued insert');
    const clearing = await gate(canceled, 'expenses-mark');
    await canceled.locator(mark).click(); await clearing.wait();
    await more(canceled, '#btn-clear'); await closeMore(canceled);
    await clearing.release(); await canceled.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
    assert.equal(await layers(canceled), 0, 'Remove assets cancels an earlier pending insert');
    assert.equal((await canceled.evaluate(() => assetStats())).loaded, 0);
    evidence.asyncAssets.removedCustomInsertCanceled = true;
    evidence.asyncAssets.clearCancelsPendingInsert = true;
    await canceled.evaluate(() => {
      const background = document.querySelector('#stage-canvas').toDataURL();
      localStorage.setItem('glitch-social-composer-created-pics', JSON.stringify([{ id: 'legacy-tint', label: 'Legacy tint', thumbDataUrl: background, width: 1080, height: 1080, createdAt: 1,
        composition: { bgDataUrl: background, presetKey: '1080x1080', tintHex: '#112233', assetDataUrls: {}, overlays: [{ assetId: 'expenses-custom-color', x: 100, y: 100, width: 200, height: 200 }] } }]));
    });
    await canceled.reload(); await canceled.waitForFunction(() => !!document.querySelector('#assets-created .asset-chip'));
    if (!await canceled.locator('#pane-created').isVisible()) await canceled.locator('#btn-created-toggle').click();
    await canceled.locator('#assets-created .asset-chip').click();
    await canceled.waitForFunction(() => document.querySelector('#meta').textContent.startsWith('Restored'));
    assert.equal(await layers(canceled), 1, 'Older generated-tint saves rebuild their image on demand');
    await canceled.locator('#btn-close-saved').click();
    const legacy = await project(canceled);
    assert.equal(legacy.composition.tintHex, '#112233');
    assert.deepEqual(await bitmapSize(canceled, legacy.composition.assetDataUrls['expenses-custom-color']), pngSize('brands/current/expenses-mark.png'));
    evidence.tint.legacyGeneratedTintRestored = true;
    await canceled.context().close();
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
    console.log('PASS: startup budget, on-demand originals, frame coalescing, snapshot reuse, lazy-load races/retry, cache pruning, and original-resolution exports.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
