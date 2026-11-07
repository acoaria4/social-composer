const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'exports/sprint3/projects');
const libraryKey = 'glitch-social-composer-created-pics';

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
  let browser;
  const evidence = {}, errors = [];
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    fs.mkdirSync(output, { recursive: true });
    const url = process.env.COMPOSER_URL || local.url;
    async function editor() {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      await page.waitForFunction(() => !document.querySelector('[data-asset-id="expenses-icon"]')?.disabled);
      return page;
    }
    const ready = page => page.waitForFunction(() => !document.querySelector('#btn-save').disabled);
    const pixels = page => page.locator('#stage-canvas').evaluate(canvas => canvas.toDataURL());
    async function more(page, id) {
      if (!await page.locator('.more-actions').evaluate(element => element.open)) await page.locator('.more-actions > summary').click();
      await page.locator(id).click();
    }
    async function exported(page, name) {
      const waiting = page.waitForEvent('download'); await more(page, '#btn-export-project');
      const download = await waiting, target = path.join(output, name); await download.saveAs(target);
      return JSON.parse(fs.readFileSync(target, 'utf8'));
    }
    async function imported(page, project) {
      await page.locator('#project-input').setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
      await page.waitForFunction(() => /Project opened|Project not opened|could not be opened/.test(document.querySelector('#session-status').textContent));
    }

    // Each scenario closes its context before the next one to bound image memory.
    const originalText = 'Small original post.', latestDraft = 'A later unrendered draft.';
    const source = await editor();
    await source.locator('[data-brand="lumen"]').click(); await source.locator('#lumen-fact-heading').click();
    await source.locator('#lumen-text').fill(originalText); await source.locator('#lumen-subject').selectOption('maths');
    await source.locator('#lumen-size').fill('48'); await source.locator('#preset-select').selectOption('1080x1080');
    await source.locator('#lumen-create').click();
    await source.waitForFunction(() => document.querySelector('#lumen-status').textContent.startsWith('Ready:')); await ready(source);
    await source.locator('[data-brand="expenses"]').click(); await source.locator('#tab-assets').click();
    await source.locator('#panel-assets [data-brand-panel="expenses"] > summary').click();
    await source.locator('[data-asset-id="expenses-icon"]').click();
    await source.locator('#custom-asset-input').setInputFiles({ name: 'stamp.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12"><rect width="24" height="12" fill="#00ff00" opacity=".5"/></svg>') });
    await source.waitForFunction(() => document.querySelectorAll('#assets-custom .asset-chip').length === 1);
    await source.locator('#assets-custom').evaluate(element => { element.closest('details').open = true; });
    await source.locator('#assets-custom .asset-chip').click(); await source.locator('#tab-layers').click();
    await source.locator('.layer-row:has(.layer-select[aria-pressed="true"]) .layer-lock').click();
    await source.locator('.layer-row:has(.layer-select[aria-pressed="true"]) .layer-visibility').click();
    await source.locator('#tab-text').click(); await source.locator('#text-add').click();
    await source.locator('#text-content').fill('Editable layer');
    await source.locator('[data-brand="lumen"]').click(); await source.locator('#tab-create').click();
    await source.locator('#lumen-text').fill(latestDraft);
    const beforeImport = await pixels(source), project = await exported(source, 'portable-project.json');
    assert.equal(project.format, 'social-composer-project'); assert.equal(project.version, 1);
    assert.equal(project.composition.templateSource.kind, 'lumen-fact');
    assert.equal(project.composition.templateSource.form.text, originalText, 'Rendered source stays immutable while its draft changes');
    assert.equal(project.forms.lumen.text, latestDraft);
    assert.equal(project.composition.overlays.length, 3); assert.equal(Object.keys(project.composition.assetDataUrls).length, 2);
    assert.ok(project.composition.bgDataUrl.startsWith('data:image/png;base64,'));
    assert.ok(Object.values(project.composition.assetDataUrls).every(value => value.startsWith('data:image/png;base64,')));
    assert.ok(project.composition.overlays.some(layer => layer.hidden && layer.locked));
    await source.context().close();

    const target = await editor(); await imported(target, project); await ready(target);
    assert.equal(await pixels(target), beforeImport, 'Portable import preserves exact preview pixels');
    const roundTrip = await exported(target, 'round-trip.json');
    const layerProperties = layers => layers.map(({ type, text, x, y, width, height, hidden, locked }) => ({ type, text, x, y, width, height, hidden, locked }));
    assert.deepEqual(layerProperties(roundTrip.composition.overlays), layerProperties(project.composition.overlays));
    assert.deepEqual(Object.values(roundTrip.composition.assetLabels).sort(), Object.values(project.composition.assetLabels).sort());
    assert.deepEqual(roundTrip.composition.templateSource, project.composition.templateSource);
    assert.equal(roundTrip.forms.lumen.text, latestDraft, 'Import restores the latest unrendered form draft');
    await more(target, '#btn-restore-template');
    assert.equal(await target.locator('[data-brand="lumen"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await target.locator('#lumen-text').inputValue(), originalText);
    assert.equal(await target.locator('#lumen-subject').inputValue(), 'maths');
    const stable = await pixels(target);
    const invalid = [
      { ...project, version: 999 },
      { ...project, composition: { ...project.composition, bgDataUrl: 'https://example.com/image.png' } },
      { ...project, composition: { ...project.composition, assetDataUrls: {} } },
      { ...project, composition: { ...project.composition, overlays: [{ type: 'text', text: 'Bad', x: 0, y: 0, width: -1, height: 20 }] } },
    ];
    for (const bad of invalid) {
      await imported(target, bad); assert.equal(await pixels(target), stable, 'Invalid import keeps the current canvas');
      assert.match(await target.locator('#session-status').innerText(), /Project not opened/);
    }
    evidence.portableProject = { embeddedImages: 3, exactPixels: true, editableLayers: true, flagsAndLabels: true, immutableTemplateSource: true, latestDraftRestored: true, explicitSourceRestore: true, rejectedFiles: invalid.length };
    await target.context().close();

    const draft = await editor();
    await draft.locator('[data-brand="lumen"]').click(); await draft.locator('#lumen-fact-heading').click();
    await draft.locator('#lumen-text').fill('Draft after reload'); await draft.locator('#lumen-subject').selectOption('biology');
    await draft.locator('#lumen-size').fill('54'); await draft.locator('#preset-select').selectOption('1600x900');
    await draft.reload(); await draft.waitForFunction(() => !!document.querySelector('[data-asset-id="expenses-icon"]'));
    assert.equal(await draft.locator('#lumen-text').inputValue(), 'Draft after reload');
    assert.equal(await draft.locator('#lumen-subject').inputValue(), 'biology'); assert.equal(await draft.locator('#lumen-size').inputValue(), '54');
    assert.equal(await draft.evaluate(() => lumenComposer.getFormat()), '1600x900');
    assert.equal(await draft.locator('#empty-state').isVisible(), true, 'Restoring drafts never generates a canvas');
    evidence.formReload = { text: true, subject: true, size: true, format: true, noAutomaticRender: true };
    await draft.context().close();

    const api = await editor(); let apiCalls = 0;
    const summaries = Array.from({ length: 12 }, (_, index) => `Saved API reading ${index + 1}.`);
    await api.route('https://aura-glitchlabs.fly.dev/**', route => {
      apiCalls++;
      const params = new URL(route.request().url()).searchParams;
      return route.fulfill({ json: { date: params.get('date'), language: params.get('lang'), timezone: 'Asia/Kolkata', disclaimer: 'For reflection only.', readings: ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'].map((sign, index) => ({ sign, summary: summaries[index] })) } });
    });
    await api.locator('[data-brand="aura"]').click(); await api.locator('#aura-heading').click();
    await api.locator('#settings-heading').click(); await api.locator('#horoscope-manual > summary').click();
    await api.locator('#horoscope-language').selectOption('en'); await api.locator('#horoscope-date').fill('2026-11-07');
    await api.locator('#horoscope-readings textarea').first().fill('Unrelated manual draft');
    await api.locator('#horoscope-source').selectOption('api'); await api.locator('#horoscope-create').click();
    await api.waitForFunction(() => document.querySelector('#horoscope-status').textContent.startsWith('Ready:'));
    assert.equal(await api.locator('#horoscope-readings textarea').first().inputValue(), 'Unrelated manual draft', 'API generation preserves the manual draft');
    await api.locator('#btn-save').click();
    await api.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '[]').length === 1, libraryKey);
    await api.locator('#horoscope-source').selectOption('manual');
    const beforeReloadCalls = apiCalls;
    await api.reload(); await api.waitForFunction(() => !!document.querySelector('[data-asset-id="expenses-icon"]'));
    assert.equal(apiCalls, beforeReloadCalls, 'Reloading stored form drafts makes no API call');
    if (!await api.locator('#pane-created').isVisible()) await api.locator('#btn-created-toggle').click();
    await api.locator('#assets-created > .asset-chip').first().click(); await ready(api);
    assert.equal(await api.locator('#horoscope-source').inputValue(), 'manual');
    assert.deepEqual(await api.locator('#horoscope-readings textarea').evaluateAll(fields => fields.map(field => field.value)), summaries, 'Saved API summaries restore as editable manual readings');
    assert.equal(apiCalls, beforeReloadCalls, 'Saved-source restoration never refetches readings');
    await api.locator('#btn-close-saved').click();
    await more(api, '#btn-restore-template');
    assert.equal(await api.locator('[data-brand="aura"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await api.locator('#horoscope-source').inputValue(), 'manual');
    assert.equal(apiCalls, beforeReloadCalls, 'Explicit source navigation does not trigger a brand API check');
    evidence.savedApiSource = { generationPreservesDraft: true, reloadWithoutFetch: true, storedSummariesEditable: true, libraryRestoreWithoutFetch: true, explicitRestoreWithoutFetch: true };
    await api.context().close();
    assert.deepEqual(errors, [], 'No uncaught page errors');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
    console.log('PASS: portable projects, atomic invalid-file rejection, persistent forms, and editable saved template sources.');
    console.log(`Evidence: ${output}`);
  } finally {
    if (browser) await browser.close();
    if (local) await new Promise(resolve => local.server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
