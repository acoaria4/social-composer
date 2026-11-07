const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'exports/document-safety');
const storageKey = 'glitch-social-composer-created-pics';
const cards = '#assets-created > .asset-chip';

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

const svgFile = (color, size = 120) => ({
  name: `${color.replace('#', '')}.svg`, mimeType: 'image/svg+xml',
  buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="${color}"/></svg>`),
});

(async () => {
  const local = process.env.COMPOSER_URL ? null : await startServer();
  let browser;
  const errors = [], evidence = { races: [], transparency: [], aura: [], stacking: {}, text: [] };
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    fs.mkdirSync(output, { recursive: true });
    const url = process.env.COMPOSER_URL || local.url;
    async function fresh() {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://aura-glitchlabs.fly.dev/**', route => route.abort());
      await page.goto(url);
      await page.waitForFunction(() => !!document.querySelector('[data-asset-id="expenses-icon"]'));
      return page;
    }
    const pixel = (page, x = 10, y = 10) => page.locator('#stage-canvas').evaluate((canvas, point) => [...canvas.getContext('2d').getImageData(point.x, point.y, 1, 1).data], { x, y });
    const dimensions = page => page.locator('#stage-canvas').evaluate(canvas => [canvas.width, canvas.height]);
    const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), storageKey);
    async function settled(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
    async function upload(page, color) {
      await page.locator('#bg-input').setInputFiles(svgFile(color));
      await page.waitForFunction(expected => {
        const canvas = document.querySelector('#stage-canvas');
        if (!canvas.width || !canvas.height) return false;
        const value = [...canvas.getContext('2d').getImageData(10, 10, 1, 1).data];
        return value.join() === expected.join();
      }, color === '#ff0000' ? [255, 0, 0, 255] : color === '#00ff00' ? [0, 255, 0, 255] : [0, 0, 255, 255]);
    }
    async function blank(page) {
      await page.locator('#background-heading').evaluate(summary => { summary.parentElement.open = true; });
      await page.locator('#btn-blank').click();
      await page.waitForFunction(() => !document.querySelector('#btn-save').disabled);
    }
    async function reset(page) {
      await page.locator('.more-actions > summary').click();
      await page.locator('#btn-reset').click();
      assert.equal(await page.locator('#empty-state').isVisible(), true);
    }
    async function save(page) {
      const count = (await saved(page)).length;
      await page.locator('#btn-save').click();
      await page.waitForFunction(({ key, count }) => JSON.parse(localStorage.getItem(key) || '[]').length === count + 1, { key: storageKey, count });
      const entry = (await saved(page)).at(-1);
      await page.locator('#btn-close-saved').click();
      await settled(page);
      return entry;
    }
    async function restoreFirst(page) {
      if (!await page.locator('#pane-created').isVisible()) await page.locator('#btn-created-toggle').click();
      await page.locator(cards).first().click();
    }
    async function deferNextImage(page, prefix) {
      await page.evaluate(prefix => {
        const Native = window.Image, descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        const gate = window.imageGate = { used: false };
        window.Image = function (...args) {
          const image = new Native(...args);
          Object.defineProperty(image, 'src', {
            get() { return descriptor.get.call(image); },
            set(value) {
              if (!gate.used && String(value).startsWith(prefix)) {
                gate.used = true;
                gate.done = new Promise(resolve => {
                  image.addEventListener('load', () => resolve('load'), { once: true });
                  image.addEventListener('error', () => resolve('error'), { once: true });
                });
                gate.release = () => { descriptor.set.call(image, value); return gate.done; };
              } else descriptor.set.call(image, value);
            },
          });
          return image;
        };
      }, prefix);
    }
    async function releaseImage(page) {
      await page.evaluate(async () => { await window.imageGate.release(); });
      await settled(page);
    }

    // Real handlers and decoders run in controlled completion order.
    for (const action of ['new upload', 'clear']) {
      const page = await fresh(); await upload(page, '#00ff00');
      await deferNextImage(page, 'blob:');
      await page.locator('#bg-input').setInputFiles(svgFile('#ff0000'));
      await page.waitForFunction(() => window.imageGate.used);
      if (action === 'new upload') await upload(page, '#0000ff'); else await reset(page);
      await releaseImage(page);
      if (action === 'new upload') assert.deepEqual(await pixel(page), [0, 0, 255, 255]);
      else assert.equal(await page.locator('#empty-state').isVisible(), true);
      evidence.races.push(`Pending upload cannot replace ${action}`); await page.close();
    }
    {
      const page = await fresh(); await upload(page, '#ff0000'); await save(page); await upload(page, '#00ff00');
      await deferNextImage(page, 'data:image/'); await restoreFirst(page);
      await page.waitForFunction(() => window.imageGate.used);
      await page.locator('#btn-close-saved').click(); await upload(page, '#0000ff'); await releaseImage(page);
      assert.deepEqual(await pixel(page), [0, 0, 255, 255]);
      evidence.races.push('Pending saved restore cannot replace newer upload'); await page.close();
    }
    for (const action of ['new upload', 'clear']) {
      const page = await fresh(); await upload(page, '#00ff00'); await deferNextImage(page, 'blob:');
      await page.locator('#background-heading').evaluate(summary => { summary.parentElement.open = true; });
      await page.locator('#btn-blank').click(); await page.waitForFunction(() => window.imageGate.used);
      if (action === 'new upload') await upload(page, '#0000ff'); else await reset(page);
      await releaseImage(page);
      if (action === 'new upload') assert.deepEqual(await pixel(page), [0, 0, 255, 255]);
      else assert.equal(await page.locator('#empty-state').isVisible(), true);
      evidence.races.push(`Pending blank cannot replace ${action}`); await page.close();
    }
    for (const type of ['cover', 'lumen']) for (const action of ['new upload', 'clear']) {
      const page = await fresh(); await upload(page, '#00ff00');
      await page.locator(`[data-brand="${type === 'cover' ? 'aura' : 'lumen'}"]`).click();
      await page.locator(type === 'cover' ? '#aura-heading' : '#lumen-fact-heading').click();
      if (type === 'lumen') await page.locator('#lumen-text').fill('A short test fact.');
      await page.evaluate(type => {
        const owner = type === 'cover' ? AuraHoroscopeTemplate : LumenFactTemplate;
        const key = type === 'cover' ? 'renderCover' : 'render', original = owner[key];
        owner[key] = async function (...args) {
          const blob = await original.apply(this, args);
          await new Promise(resolve => { window.releaseTemplate = resolve; });
          return blob;
        };
      }, type);
      await page.locator(type === 'cover' ? '#horoscope-cover' : '#lumen-create').click();
      await page.waitForFunction(() => typeof window.releaseTemplate === 'function');
      if (action === 'new upload') await upload(page, '#0000ff'); else await reset(page);
      await page.evaluate(() => window.releaseTemplate()); await settled(page);
      if (action === 'new upload') assert.deepEqual(await pixel(page), [0, 0, 255, 255]);
      else assert.equal(await page.locator('#empty-state').isVisible(), true);
      evidence.races.push(`Pending ${type} cannot replace ${action}`); await page.close();
    }

    // Alpha survives Save, reload, restore and the actual downloaded PNG.
    for (const type of ['svg', 'png']) {
      const page = await fresh();
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="8" y="8" width="16" height="16" fill="#ff0000" fill-opacity="0.5"/></svg>';
      const png = type === 'png' ? await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
        const context = canvas.getContext('2d'); context.fillStyle = 'rgba(255,0,0,.5)'; context.fillRect(8, 8, 16, 16);
        return canvas.toDataURL().split(',')[1];
      }) : null;
      await page.locator('#bg-input').setInputFiles({ name: `alpha.${type}`, mimeType: type === 'svg' ? 'image/svg+xml' : 'image/png', buffer: type === 'svg' ? Buffer.from(svg) : Buffer.from(png, 'base64') });
      await page.waitForFunction(() => document.querySelector('#stage-canvas').width === 32);
      const before = { clear: await pixel(page, 0, 0), partial: await pixel(page, 12, 12) };
      const entry = await save(page); assert.doesNotMatch(entry.composition.bgDataUrl, /^data:image\/jpeg/);
      await page.reload(); await page.waitForFunction(() => document.querySelectorAll('#assets-created > .asset-chip').length === 1);
      await restoreFirst(page); await page.waitForFunction(() => document.querySelector('#stage-canvas').width === 32 && !document.querySelector('#btn-download').disabled);
      assert.deepEqual(await pixel(page, 0, 0), before.clear); assert.deepEqual(await pixel(page, 12, 12), before.partial);
      await page.locator('#btn-close-saved').click();
      const pending = page.waitForEvent('download'); await page.locator('#btn-download').click();
      const download = await pending; const stream = await download.createReadStream(); const parts = [];
      for await (const part of stream) parts.push(part);
      const bytes = Buffer.concat(parts); fs.writeFileSync(path.join(output, `transparent-${type}.png`), bytes);
      const exported = await page.evaluate(async data => {
        const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32; const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
        return { clear: [...context.getImageData(0, 0, 1, 1).data], partial: [...context.getImageData(12, 12, 1, 1).data] };
      }, bytes.toString('base64'));
      assert.deepEqual(exported, before); evidence.transparency.push({ type, ...exported }); await page.close();
    }
    {
      const page = await fresh();
      await page.locator('#bg-input').setInputFiles(path.join(root, 'brands/current/lumen-icon.png'));
      await page.waitForFunction(() => document.querySelector('#stage-canvas').width > 1000 && !document.querySelector('#btn-save').disabled);
      if (await page.locator('#btn-grid').getAttribute('aria-pressed') === 'true') await page.locator('#btn-grid').click();
      const alphaPlane = data => page.evaluate(async data => {
        let canvas = document.querySelector('#stage-canvas');
        if (data) {
          const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
          canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          canvas.getContext('2d').drawImage(image, 0, 0);
        }
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const alpha = new Uint8Array(pixels.length / 4);
        let transparent = 0, partial = 0;
        for (let index = 0; index < alpha.length; index++) {
          const value = alpha[index] = pixels[index * 4 + 3];
          if (value === 0) transparent++; else if (value < 255) partial++;
        }
        let binary = '';
        for (let offset = 0; offset < alpha.length; offset += 32768) binary += String.fromCharCode(...alpha.subarray(offset, offset + 32768));
        return { width: canvas.width, height: canvas.height, transparent, partial, bytes: btoa(binary) };
      }, data);
      const before = await alphaPlane();
      assert.ok(before.transparent > 0 && before.partial > 0, 'The large fixture exercises fully transparent and antialiased pixels');
      const entry = await save(page);
      assert.match(entry.composition.bgDataUrl, /^data:image\/webp/, 'The large transparent background uses the compact alpha-preserving fallback');
      await page.reload(); await page.waitForFunction(() => document.querySelectorAll('#assets-created > .asset-chip').length === 1);
      await restoreFirst(page);
      await page.waitForFunction(({ width, height }) => {
        const canvas = document.querySelector('#stage-canvas');
        return canvas.width === width && canvas.height === height && !document.querySelector('#btn-download').disabled;
      }, { width: before.width, height: before.height });
      const restored = await alphaPlane();
      assert.equal(Buffer.from(restored.bytes, 'base64').equals(Buffer.from(before.bytes, 'base64')), true, 'Every alpha sample survives compact save/reload/restore');
      await page.locator('#btn-close-saved').click();
      const pending = page.waitForEvent('download'); await page.locator('#btn-download').click();
      const stream = await (await pending).createReadStream(), parts = [];
      for await (const part of stream) parts.push(part);
      const png = Buffer.concat(parts); fs.writeFileSync(path.join(output, 'large-transparent-export.png'), png);
      const exported = await alphaPlane(png.toString('base64'));
      assert.equal(Buffer.from(exported.bytes, 'base64').equals(Buffer.from(before.bytes, 'base64')), true, 'Every alpha sample survives the final PNG export');
      evidence.transparency.push({
        type: 'large alpha PNG with WebP fallback', width: before.width, height: before.height,
        alphaPixelsCompared: before.width * before.height, transparentPixels: before.transparent, partialAlphaPixels: before.partial,
        restoredAlphaExact: true, exportedAlphaExact: true,
      });
      await page.close();
    }
    {
      const page = await fresh(); await upload(page, '#ff0000'); const entry = await save(page);
      const jpeg = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 120; const context = canvas.getContext('2d'); context.fillStyle = '#ff0000'; context.fillRect(0, 0, 120, 120); return canvas.toDataURL('image/jpeg', .88); });
      entry.composition.bgDataUrl = jpeg;
      await page.evaluate(({ key, entry }) => localStorage.setItem(key, JSON.stringify([entry])), { key: storageKey, entry });
      await page.reload(); await restoreFirst(page); await page.waitForFunction(() => document.querySelector('#stage-canvas').width === 120);
      assert.ok((await pixel(page))[0] >= 253); assert.equal((await pixel(page))[3], 255);
      await page.locator('#btn-close-saved').click(); await page.locator('#preset-select').selectOption('1080x1080');
      assert.deepEqual(await dimensions(page), [1080, 1080]);
      evidence.transparency.push({ legacyJpegRestored: true, uploadedBackgroundRemainsResizable: true }); await page.close();
    }

    // AURA templates keep their supported layout, including older saved designs.
    for (const type of ['cover', 'reading']) {
      const page = await fresh(); await page.locator('[data-brand="aura"]').click(); await page.locator('#aura-heading').click();
      await page.locator(type === 'cover' ? '#horoscope-cover' : '#horoscope-blank').click();
      await page.waitForFunction(() => document.querySelector('#stage-canvas').height === 1920);
      const bitmap = await page.locator('#stage-canvas').evaluate(canvas => canvas.toDataURL());
      await page.locator('#preset-select').evaluate(select => { select.value = '1080x1080'; select.dispatchEvent(new Event('change', { bubbles: true })); });
      assert.deepEqual(await dimensions(page), [1080, 1920]);
      assert.equal(await page.locator('#preset-select').inputValue(), '1080x1920');
      assert.equal(await page.locator('#stage-canvas').evaluate(canvas => canvas.toDataURL()), bitmap);
      assert.equal(await page.locator('#btn-download').isEnabled(), true);
      if (type === 'reading') {
        const entry = await save(page); entry.composition.presetKey = '1080x1080'; entry.composition.templateBrand = null; delete entry.composition.auraPostType;
        await page.evaluate(({ key, entry }) => localStorage.setItem(key, JSON.stringify([entry])), { key: storageKey, entry });
        await page.reload(); await restoreFirst(page); await page.waitForFunction(() => !document.querySelector('#btn-download').disabled);
        assert.deepEqual(await dimensions(page), [1080, 1920]); assert.equal(await page.locator('#preset-select').inputValue(), '1080x1920');
      }
      evidence.aura.push({ type, protectedDimensions: [1080, 1920] }); await page.close();
    }

    // Selection, movement and resizing preserve explicit drawing order.
    {
      const page = await fresh(); await page.locator('#preset-select').selectOption('1080x1080'); await blank(page);
      await page.locator('#tab-assets').click(); await page.locator('#panel-assets [data-brand-panel="expenses"] > summary').click();
      await page.locator('[data-asset-id="expenses-icon"]').click(); await page.locator('[data-asset-id="expenses-wordmark-light"]').click();
      const original = (await save(page)).composition.overlays, order = original.map(item => item.assetId), icon = original[0];
      const box = await page.locator('#stage-canvas').boundingBox(), scale = box.width / 1080;
      const point = { x: box.x + (icon.x + icon.width / 2) * scale, y: box.y + (icon.y + 20) * scale };
      await page.mouse.click(point.x, point.y);
      const selected = (await save(page)).composition.overlays; assert.deepEqual(selected, original);
      const currentBox = await page.locator('#stage-canvas').boundingBox(), currentScale = currentBox.width / 1080;
      const move = { x: currentBox.x + (icon.x + icon.width / 2) * currentScale, y: currentBox.y + (icon.y + 20) * currentScale };
      await page.mouse.move(move.x, move.y); await page.mouse.down(); await page.mouse.move(move.x - 40, move.y, { steps: 3 }); await page.mouse.up();
      const moved = (await save(page)).composition.overlays; assert.deepEqual(moved.map(item => item.assetId), order); assert.notEqual(moved[0].x, original[0].x);
      const handle = await page.locator('#selection-box .se').boundingBox();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2 + 20, handle.y + handle.height / 2 + 20); await page.mouse.up();
      const resized = (await save(page)).composition.overlays; assert.deepEqual(resized.map(item => item.assetId), order); assert.notEqual(resized[0].width, moved[0].width);
      evidence.stacking = { order, selectionPreservedGeometry: true, moveAndResizePreservedOrder: true }; await page.close();
    }

    // Visible text, not just the text-box rectangle, determines safe export.
    {
      const page = await fresh(); await page.locator('#preset-select').selectOption('1080x1080'); await blank(page);
      await page.locator('#tab-text').click(); await page.locator('#text-add').click(); await page.locator('#text-content').fill('W');
      await page.locator('#panel-text .text-style').first().locator('summary').click(); await page.locator('#text-header-size').fill('240');
      await page.locator('#text-position > summary').click(); await page.locator('#text-x').fill('1000'); await page.locator('#text-y').fill('100'); await page.locator('#text-width').fill('48');
      assert.equal(await page.locator('#btn-download').isDisabled(), true);
      assert.match(await page.locator('#text-status').innerText(), /narrow|fit|outside|overflow/i);
      await page.screenshot({ path: path.join(output, 'text-clipping-blocked.png') });
      await page.locator('#text-header-size').fill('18'); assert.equal(await page.locator('#btn-download').isEnabled(), true);
      await page.locator('#text-header-font').selectOption('Noto Sans Tamil'); await page.locator('#text-header-size').fill('240'); await page.locator('#text-content').fill('கி');
      await page.waitForFunction(() => !document.querySelector('#btn-save').disabled);
      assert.equal(await page.locator('#btn-download').isDisabled(), true); assert.equal(await page.locator('#text-content').inputValue(), 'கி');
      await page.locator('#text-x').fill('100'); await page.locator('#text-width').fill('700'); assert.equal(await page.locator('#btn-download').isEnabled(), true);
      evidence.text.push({ latinOversizedCharacterBlocked: true, tamilGraphemeBlockedWithoutSplitting: true, smallerSizeOrWiderBoxRecovers: true }); await page.close();
    }

    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
    console.log('PASS: newest document action wins, transparent save/export, legacy JPEG/AURA restore, fixed AURA layouts, stable stacking, and actual text-bound export checks.');
    console.log(`Evidence: ${output}`);
  } finally { if (browser) await browser.close(); if (local) await new Promise(resolve => local.server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
