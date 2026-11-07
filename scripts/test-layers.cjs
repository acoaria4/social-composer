const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, startServer, clickAsset } = require('./test-support.cjs');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'exports/sprint3/layers');

(async () => {
  const local = process.env.COMPOSER_URL ? null : await startServer();
  const browser = await launchBrowser();
  const errors = [], evidence = {};
  fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.COMPOSER_URL || local.url);
    await page.waitForFunction(() => !document.querySelector('[data-asset-id="expenses-icon"]')?.disabled);
    await page.locator('#btn-empty-blank').click();
    await page.waitForFunction(() => !document.querySelector('#btn-save').disabled);
    if (await page.locator('#btn-grid').getAttribute('aria-pressed') === 'true') await page.locator('#btn-grid').click();
    const blank = await page.locator('#stage-canvas').evaluate(canvas => canvas.toDataURL());
    const values = () => page.locator('.layer-geometry input').evaluateAll(inputs => inputs.map(input => Number(input.value)));
    const names = () => page.locator('.layer-name').allTextContents();
    const selectedRow = () => page.locator('.layer-row:has(.layer-select[aria-pressed="true"])');
    async function more(id) {
      if (!await page.locator('.more-actions').evaluate(node => node.open)) await page.locator('.more-actions > summary').click();
      await page.locator(id).click();
    }
    async function downloadPixels(filename) {
      const event = page.waitForEvent('download');
      await page.locator('#btn-download').click();
      const download = await event;
      const target = path.join(output, filename);
      await download.saveAs(target);
      const dataUrl = `data:image/png;base64,${fs.readFileSync(target).toString('base64')}`;
      return page.evaluate(async source => {
        const image = new Image(); image.src = source; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        canvas.getContext('2d').drawImage(image, 0, 0); return canvas.toDataURL();
      }, dataUrl);
    }
    await page.locator('#tab-assets').click();
    await page.locator('#panel-assets [data-brand-panel="expenses"] > summary').click();
    await clickAsset(page, '[data-asset-id="expenses-icon"]');
    await page.locator('#tab-layers').click();
    assert.equal(await page.locator('.layer-row').count(), 1);
    assert.equal(await page.locator('#panel-layers button button').count(), 0, 'Layer controls are separate native buttons');
    await selectedRow().locator('.layer-select').focus();
    const original = await values();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    let geometry = await values();
    assert.deepEqual(geometry.slice(0, 2), [original[0] + 1, original[1] + 10]);
    assert.equal(await selectedRow().locator('.layer-select').evaluate(node => node === document.activeElement), true, 'Nudging preserves keyboard focus');
    await page.locator('#btn-undo').click();
    assert.deepEqual((await values()).slice(0, 2), [original[0] + 1, original[1]]);
    await page.locator('#btn-undo').click();
    assert.deepEqual(await values(), original);
    await page.locator('#layer-width').fill('240');
    await page.locator('#layer-height').focus();
    geometry = await values();
    assert.equal(geometry[2], 240);
    assert.equal(geometry[3], Math.round(240 * original[3] / original[2]));
    await page.locator('#layer-height').fill('180');
    await selectedRow().locator('.layer-select').focus();
    geometry = await values();
    assert.equal(geometry[2], Math.round(180 * 240 / Math.round(240 * original[3] / original[2])));
    assert.equal(geometry[3], 180);
    evidence.geometry = { keyboardNudge: true, shiftNudge: true, keyboardFocusStable: true, numericAspectRatio: true, undo: true };

    const beforeLock = await values();
    await selectedRow().locator('.layer-lock').click();
    assert.equal(await page.locator('#layer-x').isDisabled(), true);
    for (const id of ['layer-width', 'layer-height', 'layer-delete', 'layer-duplicate', 'layer-forward', 'layer-backward']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
    await selectedRow().locator('.layer-select').focus();
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Delete');
    assert.equal(await page.locator('.layer-row').count(), 1);
    assert.deepEqual(await values(), beforeLock);
    const box = await page.locator('#selection-box').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30); await page.mouse.up();
    assert.deepEqual(await values(), beforeLock, 'Locked layers do not drag');
    const priorPreset = await page.locator('#preset-select').inputValue();
    await page.locator('#preset-select').selectOption(priorPreset === '1080x1080' ? '1080x1350' : '1080x1080');
    assert.deepEqual(await values(), beforeLock, 'Canvas resizing preserves locked geometry');
    await page.locator('#preset-select').selectOption(priorPreset);
    assert.deepEqual(await values(), beforeLock);
    await selectedRow().locator('.layer-visibility').click();
    assert.equal(await page.locator('#selection-box').isVisible(), false);
    assert.equal(await page.locator('#stage-canvas').evaluate(canvas => canvas.toDataURL()), blank, 'Hidden image disappears from canvas');
    assert.equal(await downloadPixels('hidden.png'), blank, 'Hidden image is omitted from exported PNG');
    await selectedRow().locator('.layer-visibility').click();
    assert.notEqual(await downloadPixels('visible.png'), blank);
    await selectedRow().locator('.layer-lock').click();
    evidence.locksAndVisibility = { numericControlsDisabled: true, keyboardAndPointerGuarded: true, hiddenPreview: true, hiddenPNG: true, explicitUnlock: true };

    await page.locator('#tab-text').click(); await page.locator('#text-add').click();
    await page.locator('#text-content').fill('Layer title\nText body');
    await page.locator('#tab-layers').click();
    const textId = await selectedRow().getAttribute('data-layer-id');
    assert.deepEqual(await names(), ['Layer title', 'App icon']);
    assert.equal(await page.locator('#layer-height').getAttribute('readonly'), '');
    const textGeometry = await values();
    await page.locator('#layer-duplicate').click();
    assert.equal(await page.locator('.layer-row').count(), 3);
    assert.deepEqual((await values()).slice(0, 2), [textGeometry[0] + 24, textGeometry[1] + 24]);
    await page.locator('#btn-undo').click();
    assert.equal(await page.locator('.layer-row').count(), 2);
    await page.locator('#btn-redo').click();
    assert.equal(await page.locator('.layer-row').count(), 3);
    await page.locator('#layer-delete').click();
    assert.equal(await page.locator('.layer-row').count(), 2);
    const originalOrder = await page.locator('.layer-row').evaluateAll(rows => rows.map(row => row.dataset.layerId));
    await page.locator(`[data-layer-id="${textId}"] .layer-select`).focus(); await page.keyboard.press('Enter');
    await page.locator('#layer-backward').click();
    assert.deepEqual(await page.locator('.layer-row').evaluateAll(rows => rows.map(row => row.dataset.layerId)), originalOrder.slice().reverse());
    await page.locator('#btn-undo').click();
    assert.deepEqual(await page.locator('.layer-row').evaluateAll(rows => rows.map(row => row.dataset.layerId)), originalOrder);
    await page.locator(`[data-layer-id="${textId}"] .layer-select`).click();
    await selectedRow().locator('.layer-lock').click();
    await selectedRow().locator('.layer-visibility').click();
    await page.locator('#tab-text').click();
    assert.equal(await page.locator('#text-content').isDisabled(), true);
    assert.equal(await page.locator('#text-header-size').isDisabled(), true);
    assert.equal(await page.locator('#text-delete').isDisabled(), true);
    await page.locator('#tab-layers').click();
    evidence.mixedLayers = { textHeightReadonly: true, duplicateOffset: true, duplicateUndoRedo: true, keyboardSelection: true, explicitOrder: true, textLockGuard: true };

    await page.locator('#btn-save').click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('glitch-social-composer-created-pics')).at(-1));
    assert.equal(stored.composition.overlays[1].hidden, true);
    assert.equal(stored.composition.overlays[1].locked, true);
    assert.equal(stored.composition.assetLabels['expenses-icon'], 'App icon');
    await page.locator('#btn-close-saved').click();
    await more('#btn-reset');
    if (await page.locator('.more-actions').evaluate(node => node.open)) await page.locator('.more-actions > summary').click();
    await page.locator('#btn-created-toggle').click();
    await page.locator('#assets-created .asset-chip').last().click();
    await page.waitForFunction(() => document.querySelectorAll('.layer-row').length === 2);
    await page.locator('#btn-close-saved').click();
    await page.locator('#tab-layers').click();
    assert.deepEqual(await names(), ['Layer title', 'App icon']);
    const textRow = page.locator('.layer-row').filter({ has: page.locator('.layer-name', { hasText: 'Layer title' }) });
    assert.equal(await textRow.locator('.layer-lock').getAttribute('aria-pressed'), 'true');
    assert.equal(await textRow.locator('.layer-visibility').getAttribute('aria-pressed'), 'false');
    await textRow.locator('.layer-select').click();
    await more('#btn-clear');
    assert.equal(await page.locator('.layer-row').count(), 1, 'Bulk remove keeps locked text');
    await page.locator('#btn-undo').click();
    evidence.persistence = { labels: true, hiddenAndLocked: true, stackOrder: true, bulkRemoveKeepsLocks: true };

    // Drag movement snaps even while grid guides are hidden, and stays exact when snapping is disabled.
    if (await page.locator('.more-actions').evaluate(node => node.open)) await page.locator('.more-actions > summary').click();
    await page.locator('.layer-row').filter({ has: page.locator('.layer-name', { hasText: 'App icon' }) }).locator('.layer-select').click();
    if (await page.locator('#btn-snap').getAttribute('aria-pressed') === 'false') await page.locator('#btn-snap').click();
    assert.equal(await page.locator('#btn-grid').getAttribute('aria-pressed'), 'false');
    await page.locator('#layer-x').fill('301'); await page.locator('#layer-y').fill('301');
    async function drag(dx, dy) {
      const selected = await page.locator('#selection-box').boundingBox();
      const canvas = await page.locator('#stage-canvas').boundingBox();
      const dimensions = await page.locator('#stage-canvas').evaluate(node => [node.width, node.height]);
      await page.evaluate(() => {
        window.dragProbe = {};
        const record = event => { window.dragProbe[event.type === 'pointerdown' ? 'from' : 'to'] = [event.clientX, event.clientY]; };
        window.addEventListener('pointerdown', record, true); window.addEventListener('pointermove', record, true);
        window.stopDragProbe = () => { window.removeEventListener('pointerdown', record, true); window.removeEventListener('pointermove', record, true); };
      });
      await page.mouse.move(selected.x + selected.width / 2, selected.y + selected.height / 2); await page.mouse.down();
      await page.mouse.move(selected.x + selected.width / 2 + dx * canvas.width / dimensions[0], selected.y + selected.height / 2 + dy * canvas.height / dimensions[1], { steps: 3 }); await page.mouse.up();
      const actual = await page.evaluate(() => { window.stopDragProbe(); return window.dragProbe; });
      return actual.to.map((value, axis) => Math.round((value - actual.from[axis]) * dimensions[0] / canvas.width));
    }
    await drag(23, 17);
    const snapped = await values(); assert.equal(snapped[0] % 72, 0); assert.equal(snapped[1] % 72, 0);
    await page.locator('#btn-snap').click(); await page.locator('#btn-grid').click();
    await page.locator('#layer-x').fill('301'); await page.locator('#layer-y').fill('301');
    const pointerDelta = await drag(23, 17);
    assert.deepEqual((await values()).slice(0, 2), pointerDelta.map(delta => 301 + delta), 'Unsnapped movement matches the actual pointer coordinates, including native CSS-pixel rounding');
    assert.equal(await page.locator('#btn-grid').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#btn-snap').getAttribute('aria-pressed'), 'false');
    evidence.gridAndSnap = { hiddenGridStillSnaps: true, visibleGridWithoutSnapping: true, exactMovement: true };

    if (await page.locator('#pane-created').isVisible()) await page.locator('#btn-close-saved').click();
    await page.screenshot({ path: path.join(output, 'layers-1440.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#btn-mode-edit').click();
    await page.locator('#tab-layers').scrollIntoViewIfNeeded();
    await page.locator('.layer-select').first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.layer-select').first().getAttribute('aria-pressed'), 'true');
    await page.screenshot({ path: path.join(output, 'layers-390.png'), fullPage: true });
    const widths = await page.evaluate(() => ({ body: document.documentElement.scrollWidth, viewport: innerWidth, buttons: [...document.querySelectorAll('#panel-layers button')].map(node => node.getBoundingClientRect().height) }));
    assert.ok(widths.body <= widths.viewport, '390px page has no horizontal overflow');
    assert.ok(widths.buttons.every(height => height >= 44), 'Layer controls retain 44px targets');
    evidence.mobile = { width: 390, noPageOverflow: true, keyboardSelection: true, targetSize: true };
    assert.deepEqual(errors, [], 'No uncaught page errors');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
    console.log('PASS: keyboard layers, geometry, locks, preview/PNG visibility, order, duplication, undo, save/restore, independent snapping, and 390px controls.');
    console.log(`Evidence: ${output}`);
  } finally {
    await browser.close();
    if (local) await new Promise(resolve => local.server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
