const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'exports/sprint4/workspace');

async function startServer() {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
  const server = http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    let file;
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (file !== root && !file.startsWith(root + path.sep)) throw new Error('Outside repository');
    } catch { response.writeHead(400).end(); return; }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': stat.size });
      if (request.method === 'HEAD') response.end();
      else fs.createReadStream(file).on('error', () => response.destroy()).pipe(response);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

(async () => {
  const local = process.env.COMPOSER_URL ? null : await startServer();
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: process.platform === 'win32' ? ['--disable-gpu'] : [] });
  const errors = [], evidence = {};
  fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    let apiCalls = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://aura-glitchlabs.fly.dev/**', route => { apiCalls++; return route.abort(); });
    await page.goto(process.env.COMPOSER_URL || local.url);
    await page.waitForFunction(() => !document.querySelector('[data-asset-id="expenses-icon"]')?.disabled);
    const visible = selector => page.locator(selector).isVisible();
    const active = selector => page.locator(selector).evaluate(node => node === document.activeElement);
    const ready = () => page.waitForFunction(() => !document.querySelector('#btn-save').disabled);

    const panes = await Promise.all(['.editor-pane', '.stage-wrap', '.inspector-pane'].map(selector => page.locator(selector).boundingBox()));
    assert.ok(panes.every(Boolean), 'All three desktop panes are visible');
    assert.ok(panes[0].x + panes[0].width <= panes[1].x + 1, 'Templates precede the canvas');
    assert.ok(panes[1].x + panes[1].width <= panes[2].x + 1, 'Inspector follows the canvas');
    assert.ok(panes[1].width > panes[0].width && panes[1].width > panes[2].width, 'The canvas receives the largest column');
    const theme = await page.evaluate(() => {
      const color = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number);
      return { color, before: getComputedStyle(document.body, '::before').backgroundImage, after: getComputedStyle(document.body, '::after').backgroundImage };
    });
    assert.ok(Math.max(...theme.color) < 24 && Math.max(...theme.color) - Math.min(...theme.color) <= 5, 'The workspace background is neutral matte black');
    assert.equal(theme.before, 'none'); assert.equal(theme.after, 'none');
    evidence.desktop = { threePanes: true, canvasLargest: true, neutralMatteBlack: true, noBackgroundEffects: true };

    await page.locator('#tab-create').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await active('#tab-assets'), true); assert.equal(await visible('#panel-assets'), true);
    await page.locator('#tab-text').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await active('#tab-layers'), true);
    assert.equal(await visible('#panel-assets'), true, 'Inspector keyboard navigation does not switch the left pane');
    await page.locator('#tab-assets').focus(); await page.keyboard.press('Home');
    assert.equal(await visible('#panel-create'), true);
    assert.equal(await visible('#panel-layers'), true, 'Left navigation does not hide the inspector');
    evidence.keyboard = { independentTablists: true, arrowKeys: true, home: true };

    const icons = await page.locator('.brand-picker button img').evaluateAll(images => images.map(image => ({ loaded: image.complete && image.naturalWidth > 0, alt: image.alt, size: image.getBoundingClientRect().width })));
    assert.equal(icons.length, 4);
    assert.ok(icons.every(icon => icon.loaded && icon.alt === '' && icon.size === 20), 'Every selector brand has its local mini icon without duplicating its accessible name');
    await page.locator('[data-brand="lumen"]').click();
    await page.locator('#preset-select').selectOption('1080x1080');
    await page.locator('[data-brand="aura"]').click();
    assert.equal(await page.locator('#preset-select').inputValue(), '1080x1920', 'AURA starts at 9:16');
    assert.equal(await page.locator('#template-gallery [data-template="lumen-fact"]').isVisible(), false, 'Lumen does not appear under AURA');
    assert.equal(await page.locator('#template-gallery .template-card:visible').count(), 2);
    await page.locator('#btn-empty-blank').click(); await ready();
    assert.deepEqual(await page.locator('#stage-canvas').evaluate(canvas => [canvas.width, canvas.height]), [1080, 1920], 'An AURA blank uses its default Story format');
    await page.locator('[data-brand="lumen"]').click();
    assert.equal(await page.locator('#preset-select').inputValue(), '1080x1080', 'AURA defaults do not change Lumen’s staged format');
    await page.locator('.more-actions > summary').click(); await page.locator('#btn-reset').click(); await page.locator('.more-actions > summary').click();
    await page.locator('#preset-select').selectOption('1080x1920');
    assert.equal(await page.locator('#template-gallery .template-card:visible').count(), 1);
    assert.equal(await page.locator('#template-gallery [data-template="aura-cover"]').isVisible(), false);
    evidence.brandLibrary = { brandIcons: true, filteredTemplates: true, auraDefaultStory: true, independentLumenFormat: true };
    await page.locator('#template-gallery [data-template="lumen-fact"]').click();
    await page.locator('#lumen-text').fill('A draft that stays with its template.');
    await page.locator('[data-brand="aura"]').click();
    await page.locator('#template-gallery [data-template="aura-cover"]').click();
    assert.equal(await page.locator('#horoscope-cover').evaluate(button => button.classList.contains('btn-primary')), true, 'The chosen cover template promotes its own creation action');
    assert.equal(await page.locator('[data-brand="aura"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await visible('#empty-state'), true, 'Choosing a template opens its settings without rendering');
    await page.locator('#template-gallery [data-template="aura-reading"]').click();
    await page.locator('[data-brand="lumen"]').click();
    await page.locator('#template-gallery [data-template="lumen-fact"]').click();
    assert.equal(await page.locator('#lumen-text').inputValue(), 'A draft that stays with its template.');
    assert.equal(apiCalls, 0, 'Choosing local templates never fetches readings');
    await page.locator('[data-brand="aura"]').click();
    await page.locator('#template-gallery [data-template="aura-cover"]').click();
    await page.locator('#horoscope-source').selectOption('api');
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));
    const existingApiCalls = apiCalls;
    await page.locator('#template-gallery [data-template="aura-reading"]').click();
    await page.locator('#template-gallery [data-template="aura-cover"]').click();
    assert.equal(apiCalls, existingApiCalls, 'Template navigation does not probe the API even when the stored source is API');
    await page.locator('#horoscope-source').selectOption('manual');
    evidence.templates = { cardsOpenSettings: true, noAutomaticRender: true, draftPreserved: true, noAPIRequests: true };

    await page.locator('#btn-empty-blank').click(); await ready();
    assert.match(await page.locator('#document-title').innerText(), /canvas|blank|untitled/i);
    await page.locator('#tab-text').click(); await page.locator('#text-add').click();
    await page.locator('#text-content').fill('Contextual text\nBody');
    const textBox = await page.locator('#selection-box').boundingBox();
    await page.locator('[data-brand="expenses"]').click(); await page.locator('#tab-assets').click();
    await page.locator('#panel-assets [data-brand-panel="expenses"] > summary').click();
    await page.locator('[data-asset-id="expenses-icon"]').click();
    assert.equal(await visible('#panel-layers'), true, 'Image selection opens layer geometry');
    await page.mouse.click(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
    assert.equal(await visible('#panel-text'), true, 'Selecting existing canvas text opens its inspector');
    assert.equal(await page.locator('#text-content').inputValue(), 'Contextual text\nBody');
    evidence.inspector = { imageGeometry: true, textContext: true, documentIdentity: true };

    await page.locator('#btn-save').click();
    assert.equal(await visible('#pane-created'), true);
    const saved = page.locator('#assets-created .saved-asset-row').first();
    assert.equal(await saved.locator('button button').count(), 0);
    assert.equal(await saved.locator(':scope > button').count(), 2, 'Restore and Remove are sibling native buttons');
    const remove = await saved.locator('.asset-chip-remove').boundingBox();
    assert.ok(remove.width >= 44 && remove.height >= 44, 'Saved Remove retains a full touch target');
    await page.locator('#btn-close-saved').focus(); await page.keyboard.press('Escape');
    assert.equal(await visible('#pane-created'), false); assert.equal(await active('#btn-created-toggle'), true);
    evidence.savedDrawer = { siblingControls: true, noNestedButtons: true, touchTarget: true, escapeCloses: true, focusRestored: true };

    await page.locator('#custom-asset-input').setInputFiles({ name: 'stamp.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="#eeeeee"/></svg>') });
    await page.waitForFunction(() => document.querySelectorAll('#assets-custom .asset-item').length === 1);
    await page.locator('#assets-custom').evaluate(node => { node.closest('details').open = true; });
    const custom = page.locator('#assets-custom .asset-item').first();
    assert.equal(await custom.locator('button button').count(), 0);
    assert.equal(await custom.locator(':scope > button').count(), 2);
    const customRemove = await custom.locator('.asset-chip-remove').boundingBox();
    assert.ok(customRemove.width >= 44 && customRemove.height >= 44);
    evidence.customAssets = { siblingControls: true, touchTarget: true };
    await page.screenshot({ path: path.join(output, 'workspace-1440.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#btn-mode-edit').click();
    assert.equal(await page.locator('body').getAttribute('data-workspace-view'), 'edit');
    assert.equal(await visible('.editor-pane'), true); assert.equal(await visible('.inspector-pane'), true);
    assert.equal(await visible('#stage-drop'), false, 'Artwork stays in Preview mode while canvas setup remains available in Edit');
    assert.equal(await visible('#preset-select'), true, 'Canvas format remains reachable while editing template inputs');
    assert.equal(await visible('.more-actions'), true, 'Project actions remain reachable in Edit mode');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'workspace-edit-390.png'), fullPage: true });
    await page.locator('#btn-mode-preview').click();
    assert.equal(await page.locator('body').getAttribute('data-workspace-view'), 'preview');
    assert.equal(await visible('.stage-wrap'), true); assert.equal(await visible('.editor-pane'), false); assert.equal(await visible('.inspector-pane'), false);
    const actions = await page.locator('#btn-mode-edit, #btn-mode-preview, #btn-download').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { width: r.width, height: r.height, top: r.top, bottom: r.bottom }; }));
    assert.ok(actions.every(action => action.width >= 44 && action.height >= 44 && action.top >= 0 && action.bottom <= 844), 'Mobile switching and export remain reachable with full touch targets');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(output, 'workspace-preview-390.png') });
    await page.locator('#btn-mode-edit').click(); await page.locator('#btn-view-preview').click();
    assert.equal(await active('#stage-drop'), true, 'The existing preview shortcut focuses the canvas');
    await page.locator('#btn-mode-edit').click();
    await page.locator('#tab-create').click();
    await page.locator('[data-brand="lumen"]').click();
    await page.locator('#template-gallery [data-template="lumen-fact"]').click();
    await page.locator('#preset-select').selectOption('1080x1080');
    await page.locator('#lumen-create').click();
    await page.waitForFunction(() => document.querySelector('#document-title').textContent === 'Lumen · Fact post');
    assert.deepEqual(await page.locator('#stage-canvas').evaluate(canvas => [canvas.width, canvas.height]), [1080, 1080], 'Lumen format can be authored in mobile Edit mode');
    await page.locator('#btn-mode-preview').click();
    await page.locator('#canvas-settings > summary').click();
    await page.locator('.more-actions > summary').click();
    await page.locator('#btn-restore-template').click();
    assert.equal(await page.locator('body').getAttribute('data-workspace-view'), 'edit', 'Loading source inputs reveals the mobile form');
    assert.equal(await active('#lumen-fact-heading'), true);
    await page.locator('.skip-link').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('body').getAttribute('data-workspace-view'), 'preview', 'Keyboard skip navigation reveals the hidden mobile canvas');
    assert.equal(await active('#stage-drop'), true);
    evidence.mobile = { width: 390, editPreviewModes: true, toolsAndCanvasSeparated: true, noOverflow: true, exportReachable: true, touchTargets: true, previewFocus: true };
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#tab-create').click();
    await page.locator('[data-brand="aura"]').click();
    assert.equal(await page.locator('#preset-select').inputValue(), '1080x1080', 'Selecting AURA keeps an existing square canvas and its displayed size intact');
    assert.deepEqual(await page.locator('#stage-canvas').evaluate(canvas => [canvas.width, canvas.height]), [1080, 1080]);
    await page.locator('#template-gallery [data-template="aura-cover"]').click();
    await page.locator('#horoscope-date').fill('2026-11-07');
    await page.locator('#horoscope-language').selectOption('en');
    await page.locator('#horoscope-cover').click();
    await page.waitForFunction(() => document.querySelector('#document-title').textContent.includes('Daily cover'));
    await page.locator('#aura-heading').click(); await page.locator('#tab-layers').click();
    await page.locator('.editor-pane').evaluate(pane => { pane.scrollTop = 0; });
    await page.screenshot({ path: path.join(output, 'workspace-aura-1440.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#btn-mode-preview').click();
    const mobileBounds = await page.evaluate(() => ({ stage: document.querySelector('#stage-drop').getBoundingClientRect().bottom, switch: document.querySelector('.workspace-mode').getBoundingClientRect().top, switchBottom: document.querySelector('.workspace-mode').getBoundingClientRect().bottom }));
    assert.ok(mobileBounds.stage <= mobileBounds.switch && mobileBounds.switchBottom <= 844, 'The full portrait preview and mode switch fit inside the mobile viewport');
    await page.screenshot({ path: path.join(output, 'workspace-aura-preview-390.png') });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
    console.log('PASS: matte three-pane workspace, independent navigation, template drafts, contextual inspector, accessible drawers, and mobile Edit/Preview.');
    console.log(`Evidence: ${output}`);
  } finally {
    await browser.close();
    if (local) await new Promise(resolve => local.server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
