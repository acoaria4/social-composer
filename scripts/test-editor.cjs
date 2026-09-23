const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.COMPOSER_URL || 'http://127.0.0.1:8089/');
    await page.waitForFunction(() => !document.querySelector('[data-asset-id="expenses-icon"]').disabled);
    const visible = selector => page.locator(selector).isVisible();
    assert.equal(await visible('#panel-create'), true);
    assert.equal(await visible('#panel-assets'), false);
    await page.locator('#tab-create').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    assert.equal(await visible('#panel-assets'), true);
    assert.equal(await page.locator('#tab-assets').evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Home');
    assert.equal(await visible('#panel-create'), true);

    // A draft survives both navigation paths without replacing its form elements.
    await page.locator('[data-brand="lumen"]').click();
    await page.locator('#lumen-fact-heading').click();
    await page.locator('#lumen-text').fill('A draft worth keeping.');
    await page.locator('#tab-assets').click();
    await page.locator('[data-brand="aura"]').click();
    await page.locator('[data-brand="lumen"]').click();
    await page.locator('#tab-create').click();
    assert.equal(await page.locator('#lumen-text').inputValue(), 'A draft worth keeping.');

    await page.locator('#btn-empty-blank').click();
    await page.waitForFunction(() => !document.querySelector('#btn-save').disabled);
    await page.locator('[data-brand="expenses"]').click();
    await page.locator('#tab-assets').click();
    await page.locator('#panel-assets [data-brand-panel="expenses"] > summary').click();
    await page.locator('[data-asset-id="expenses-icon"]').click();
    assert.equal(await visible('#selection-box'), true);
    // Move and scale through the same canvas pointer interactions used by the editor.
    const canvas = await page.locator('#stage-canvas').boundingBox();
    const selection = await page.locator('#selection-box').boundingBox();
    await page.mouse.move(selection.x + selection.width / 2, selection.y + selection.height / 2);
    await page.mouse.down(); await page.mouse.move(canvas.x + canvas.width * .65, canvas.y + canvas.height * .55, { steps: 5 }); await page.mouse.up();
    const moved = await page.locator('#selection-box').boundingBox();
    assert.notEqual(Math.round(moved.x), Math.round(selection.x));
    const handle = await page.locator('.handle.se').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down(); await page.mouse.move(handle.x + 45, handle.y + 45, { steps: 5 }); await page.mouse.up();
    assert.ok((await page.locator('#selection-box').boundingBox()).width > moved.width);
    await page.locator('#chip-custom-color').click();
    await page.locator('#tint-hex').fill('#ffcc88');
    await page.locator('#tint-insert').click();
    await page.locator('#panel-assets > details:not([data-brand-panel]) > summary').click();
    await page.locator('#custom-asset-input').setInputFiles(path.resolve(__dirname, '../brands/current/lumen-mark.png'));
    await page.waitForFunction(() => document.querySelectorAll('#assets-custom .asset-chip').length === 1);
    await page.locator('#assets-custom .asset-chip').click();
    await page.locator('#btn-grid').click();
    assert.equal(await page.locator('#btn-grid').getAttribute('aria-pressed'), 'false');
    await page.locator('#btn-grid-invert').click();
    assert.equal(await page.locator('#btn-grid-invert').getAttribute('aria-pressed'), 'true');
    await page.locator('#btn-save').click();
    assert.equal(await visible('#pane-created'), true);
    assert.equal(await page.locator('#btn-created-toggle').getAttribute('aria-expanded'), 'true');
    await page.locator('#btn-close-saved').click();
    assert.equal(await visible('#pane-created'), false);
    await page.locator('.more-actions > summary').click();
    await page.locator('#btn-clear').click();
    assert.match(await page.locator('#meta').innerText(), /no marks/);
    await page.locator('#btn-reset').click();
    assert.equal(await visible('#empty-state'), true);
    await page.locator('.more-actions > summary').click();
    await page.locator('#btn-created-toggle').click();
    await page.locator('#assets-created > .asset-chip').click();
    await page.waitForFunction(() => !document.querySelector('#btn-download').disabled);
    assert.match(await page.locator('#meta').innerText(), /3 marks/);
    await page.locator('#btn-close-saved').click();
    await page.locator('#bg-input').setInputFiles(path.resolve(__dirname, '../brands/current/lumen-icon.png'));
    await page.waitForFunction(() => document.querySelector('#meta').textContent.includes('native'));
    await page.locator('#preset-select').selectOption('1080x1080');
    assert.deepEqual(await page.locator('#stage-canvas').evaluate(c => [c.width, c.height]), [1080, 1080]);
    const download = page.waitForEvent('download');
    await page.locator('#btn-download').click();
    assert.match((await download).suggestedFilename(), /\.png$/);

    // A hidden typography error is revealed instead of leaving focus in a closed section.
    await page.locator('[data-brand="aura"]').click();
    await page.locator('#tab-create').click();
    await page.locator('#aura-heading').click();
    assert.equal(await page.locator('#horoscope-typography').getAttribute('open'), null);
    await page.locator('#horoscope-font-size').evaluate(e => { e.value = '99'; });
    await page.locator('#horoscope-create').click();
    assert.equal(await visible('#horoscope-font-size'), true);
    await page.locator('#horoscope-font-size').fill('30');
    await page.locator('#horoscope-typography > summary').click();

    const out = path.resolve(__dirname, '../exports/editor');
    fs.mkdirSync(out, { recursive: true });
    for (const width of [390, 860, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const brand of ['expenses', 'aura', 'lumen', 'glitch']) {
        await page.locator(`[data-brand="${brand}"]`).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${brand} at ${width}px`);
      }
      await page.locator('[data-brand="lumen"]').click();
      await page.locator('#btn-created-toggle').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.locator('#btn-close-saved').click();
      if (width <= 860) {
        await page.locator('#btn-view-preview').click();
        assert.equal(await page.locator('#stage-drop').evaluate(e => e === document.activeElement), true);
      }
      await page.locator('.editor-pane').evaluate(e => { e.scrollTop = 0; });
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(out, `editor-${width}.png`), fullPage: true });
    }
    await page.reload();
    await page.locator('#btn-created-toggle').click();
    await page.locator('#assets-created > .asset-chip').click();
    await page.waitForFunction(() => !document.querySelector('#btn-download').disabled);
    assert.match(await page.locator('#meta').innerText(), /3 marks/);
    assert.deepEqual(errors, []);
    console.log('PASS: editor keyboard navigation, draft retention, asset move/resize/tint/upload, grid, clear, save/restore across reload, PNG export, hidden validation, and responsive layouts.');
  } finally { await browser.close(); }
})();
