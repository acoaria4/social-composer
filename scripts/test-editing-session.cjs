const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'exports/sprint3/editing-session');

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
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const evidence = {}, errors = [];
  try {
    fs.mkdirSync(output, { recursive: true });
    const url = process.env.COMPOSER_URL || local.url;
    async function editor(init) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      if (init) await context.addInitScript(init);
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      await page.waitForFunction(() => !document.querySelector('[data-asset-id="expenses-icon"]')?.disabled);
      return page;
    }
    const ready = page => page.waitForFunction(() => !document.querySelector('#btn-save').disabled);
    async function blank(page) { await page.locator('#btn-empty-blank').click(); await ready(page); }
    async function addText(page, value) {
      await page.locator('#tab-text').click();
      await page.locator('#text-add').click();
      if (value) await page.locator('#text-content').pressSequentially(value);
    }
    const pixels = page => page.locator('#stage-canvas').evaluate(canvas => canvas.toDataURL());
    async function more(page, id) {
      if (!await page.locator('.more-actions').evaluate(e => e.open)) await page.locator('.more-actions > summary').click();
      await page.locator(id).click();
    }
    const waitDraft = page => page.waitForFunction(() => document.querySelector('#session-status').textContent === 'Recovery draft saved in this browser.');

    const typing = await editor();
    const collapsedGroup = await typing.evaluate(() => {
      let value = 'baseline';
      const history = ComposerSession.createHistory({ capture: () => ({ key: value }), apply: snapshot => { value = snapshot.key; } });
      value = 'added layer'; history.record();
      value = 'typed text'; history.record('typing');
      value = 'added layer'; history.record('typing');
      value = 'typed again'; history.record('typing');
      history.undo(); const first = value;
      history.undo(); return [first, value];
    });
    assert.deepEqual(collapsedGroup, ['added layer', 'baseline'], 'Returning a grouped edit to its baseline must preserve the preceding action');
    evidence.collapsedGroupPreservesPreviousAction = true;
    const budgetedHistory = await typing.evaluate(() => {
      let value = '0', bytes = 1;
      const history = ComposerSession.createHistory({ capture: () => ({ key: value, bytes }), apply: snapshot => { value = snapshot.key; }, maxBytes: 3, measure: entries => entries.reduce((sum, entry) => sum + entry.bytes, 0) });
      for (const key of ['1', '2', '3']) { value = key; history.record(); }
      history.undo(); const recent = value;
      history.undo(); const older = value;
      const pruned = !history.undo();
      value = 'new'; history.record();
      value = 'typed'; history.record('typing');
      value = 'grown'; bytes = 10; history.record('typing');
      history.undo();
      return { recent, older, pruned, coalescedPrevious: value, onlyRecentUndo: !history.undo() };
    });
    assert.deepEqual(budgetedHistory, { recent: '2', older: '1', pruned: true, coalescedPrevious: 'new', onlyRecentUndo: true }, 'Resource limits prune old images while preserving the latest action and undo');
    evidence.historyResourceBudget = true;
    assert.equal(await typing.locator('#btn-undo').isDisabled(), true);
    await blank(typing);
    assert.equal(await typing.locator('#document-status').innerText(), 'Unsaved changes');
    await addText(typing, 'One grouped edit');
    await typing.locator('#btn-undo').click();
    assert.equal(await typing.locator('#text-content').inputValue(), '', 'One undo removes the entire uninterrupted typing action');
    await typing.locator('#btn-redo').click();
    assert.equal(await typing.locator('#text-content').inputValue(), 'One grouped edit', 'Redo refreshes the textarea for the same selected layer');
    await typing.locator('#text-content').focus();
    await typing.locator('#text-content').press('End');
    await typing.locator('#text-content').pressSequentially(' after blur');
    await typing.locator('#btn-undo').click();
    assert.equal(await typing.locator('#text-content').inputValue(), 'One grouped edit', 'A new focus session is a separate undo action');
    await typing.locator('#stage-drop').focus();
    await typing.keyboard.press('Control+Shift+z');
    assert.equal(await typing.locator('#text-content').inputValue(), 'One grouped edit after blur');
    await typing.keyboard.press('Control+z');
    assert.equal(await typing.locator('#text-content').inputValue(), 'One grouped edit');
    await typing.locator('#text-content').fill('A new branch');
    await typing.locator('#stage-drop').focus();
    assert.equal(await typing.locator('#btn-redo').isDisabled(), true, 'Editing after undo discards the old redo branch');
    await typing.locator('#btn-save').click();
    assert.equal(await typing.locator('#document-status').innerText(), 'Saved locally');
    await typing.locator('#text-content').fill('Changed since save');
    await typing.locator('#btn-undo').click();
    assert.equal(await typing.locator('#document-status').innerText(), 'Saved locally', 'Undo back to the saved document restores its save status');
    await typing.locator('#btn-redo').click();
    assert.equal(await typing.locator('#document-status').innerText(), 'Unsaved changes');
    await typing.locator('#btn-undo').click();
    assert.equal(await typing.locator('#document-status').innerText(), 'Saved locally');
    await typing.locator('#assets-created .asset-chip-remove').click({ force: true });
    assert.equal(await typing.locator('#document-status').innerText(), 'Unsaved changes', 'Deleting the associated saved design clears the saved status');
    evidence.typing = { grouped: true, textareaUpdated: true, focusSeparatesActions: true, keyboardUndoRedo: true, redoBranchTruncated: true, savedStatusFollowsDocument: true, removedSaveClearsStatus: true };
    await typing.context().close();

    const pointer = await editor();
    await blank(pointer);
    await pointer.locator('#tab-assets').click();
    await pointer.locator('#panel-assets [data-brand-panel="expenses"] > summary').click();
    await pointer.locator('[data-asset-id="expenses-icon"]').click();
    await pointer.locator('#tab-layers').click();
    const original = await pointer.locator('#layer-x').inputValue();
    const selection = await pointer.locator('#selection-box').boundingBox();
    await pointer.mouse.move(selection.x + selection.width / 2, selection.y + selection.height / 2);
    await pointer.mouse.down();
    await pointer.mouse.move(selection.x + selection.width / 2 + 130, selection.y + selection.height / 2 + 50, { steps: 12 });
    await pointer.mouse.up();
    const moved = await pointer.locator('#layer-x').inputValue();
    assert.notEqual(moved, original);
    await pointer.locator('#btn-undo').click();
    assert.equal(await pointer.locator('#layer-x').inputValue(), original, 'All pointermove frames form one undo action');
    await pointer.locator('#btn-redo').click();
    assert.equal(await pointer.locator('#layer-x').inputValue(), moved);
    await more(pointer, '#btn-clear');
    assert.equal(await pointer.locator('#layers-list > li').count(), 0);
    await pointer.locator('#btn-undo').click();
    assert.equal(await pointer.locator('#layers-list > li').count(), 1);
    await more(pointer, '#btn-reset');
    assert.equal(await pointer.locator('#empty-state').isVisible(), true);
    await pointer.locator('#btn-undo').click();
    await ready(pointer);
    assert.equal(await pointer.locator('#layers-list > li').count(), 1);
    const beforeUpload = await pixels(pointer);
    await pointer.locator('#bg-input').setInputFiles(path.join(root, 'brands/current/lumen-icon.png'));
    await pointer.waitForFunction(() => document.querySelector('#meta').textContent.includes('no marks'));
    await pointer.locator('#btn-undo').click();
    await ready(pointer);
    assert.equal(await pixels(pointer), beforeUpload, 'Undo restores the image and editable layers after background replacement');
    evidence.documentActions = { pointerGrouped: true, clearUndo: true, resetUndo: true, backgroundUndoExact: true };
    await pointer.context().close();

    const recovery = await editor();
    await blank(recovery); await addText(recovery, 'Recover this editable text');
    await recovery.locator('#stage-drop').focus();
    const beforeReload = await pixels(recovery);
    await waitDraft(recovery);
    await recovery.reload();
    await recovery.locator('#recovery-banner').waitFor({ state: 'visible' });
    assert.equal(await recovery.locator('#empty-state').isVisible(), true, 'A previous draft is offered, never applied without a choice');
    await recovery.locator('#btn-recover-draft').click();
    await ready(recovery);
    assert.equal(await recovery.locator('#recovery-banner').isVisible(), false);
    assert.equal(await pixels(recovery), beforeReload, 'Recovery retains background and text rendering exactly');
    await recovery.locator('#tab-text').click();
    await recovery.locator('#text-selection').selectOption({ index: 1 });
    assert.equal(await recovery.locator('#text-content').inputValue(), 'Recover this editable text');
    await recovery.locator('#text-content').fill('Recovered and edited');
    await recovery.locator('#stage-drop').focus();
    await waitDraft(recovery);
    await recovery.reload();
    await recovery.locator('#recovery-banner').waitFor({ state: 'visible' });
    await recovery.locator('#btn-discard-draft').click();
    await recovery.waitForFunction(() => document.querySelector('#session-status').textContent.includes('discarded'));
    await recovery.reload();
    await recovery.waitForFunction(() => !!document.querySelector('[data-asset-id="expenses-icon"]'));
    assert.equal(await recovery.evaluate(() => window.ComposerSession.readRecovery()), null, 'Discard deletes the IndexedDB draft');
    assert.equal(await recovery.locator('#recovery-banner').isVisible(), false);
    evidence.recovery = { optIn: true, exactPixels: true, textEditable: true, discardDurable: true };
    await blank(recovery); await addText(recovery, 'Older pending draft');
    await recovery.locator('#stage-drop').focus(); await waitDraft(recovery);
    await recovery.reload(); await recovery.locator('#recovery-banner').waitFor({ state: 'visible' });
    await recovery.evaluate(() => {
      const Native = window.Image, descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      window.recoveryGate = { used: false };
      window.Image = function (...args) {
        const image = new Native(...args);
        Object.defineProperty(image, 'src', {
          get() { return descriptor.get.call(image); },
          set(value) {
            if (!window.recoveryGate.used && String(value).startsWith('data:image/')) {
              window.recoveryGate.used = true;
              window.recoveryGate.release = () => new Promise(resolve => {
                image.addEventListener('load', resolve, { once: true });
                image.addEventListener('error', resolve, { once: true });
                descriptor.set.call(image, value);
              });
            } else descriptor.set.call(image, value);
          },
        });
        return image;
      };
    });
    await recovery.locator('#btn-recover-draft').click();
    await recovery.waitForFunction(() => window.recoveryGate.used);
    await blank(recovery);
    await recovery.evaluate(async () => { await window.recoveryGate.release(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    assert.equal(await recovery.locator('#recovery-banner').isVisible(), false, 'A stale recovery completion must not resurrect the previous draft banner');
    await addText(recovery, 'Newest canvas'); await recovery.locator('#stage-drop').focus(); await waitDraft(recovery);
    const latestDraft = await recovery.evaluate(() => ComposerSession.readRecovery());
    assert.equal(latestDraft.composition.overlays[0].text, 'Newest canvas', 'Recovery keeps saving the newer document after a canceled restore');
    evidence.recovery.newerCanvasCancelsPendingRecovery = true;
    await recovery.context().close();

    const unavailable = await editor(() => Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('Disabled', 'SecurityError'); } }));
    await unavailable.waitForFunction(() => document.querySelector('#session-status').textContent.includes('Recovery is unavailable'));
    await blank(unavailable); await addText(unavailable, 'Still editable');
    await unavailable.waitForFunction(() => document.querySelector('#session-status').textContent.includes('Recovery is unavailable'));
    assert.match(await unavailable.locator('#session-status').innerText(), /Export a project/);
    assert.equal(await unavailable.locator('#btn-download').isEnabled(), true);
    await unavailable.locator('#btn-undo').click();
    assert.equal(await unavailable.locator('#text-content').inputValue(), '');
    evidence.unavailableRecovery = { feedback: true, editingAndUndoRemainUsable: true, pngExportAvailable: true };
    await unavailable.context().close();

    assert.deepEqual(errors, [], 'No uncaught page errors');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
    console.log('PASS: grouped editing, undo/redo and branching, save status, document replacement, opt-in recovery, discard, and unavailable recovery.');
    console.log(`Evidence: ${output}`);
  } finally {
    await browser.close();
    if (local) await new Promise(resolve => local.server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
