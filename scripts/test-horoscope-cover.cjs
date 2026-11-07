const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'exports/aura-cover-final');
const storageKey = 'glitch-social-composer-created-pics';

// This small read-only server keeps the test self-contained, including on Windows.
async function startServer() {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
  const server = http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    let target;
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('Outside repository');
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
  try {
    fs.mkdirSync(output, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let apiCalls = 0;
    const apiResponse = url => {
      const query = new URL(url).searchParams;
      return {
        date: query.get('date'), language: query.get('lang'), timezone: 'Asia/Kolkata', disclaimer: 'Illustrative test readings.',
        readings: ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'].map(sign => ({ sign, summary: 'Be well.' })),
      };
    };
    await page.route('https://aura-glitchlabs.fly.dev/**', route => { apiCalls++; return route.fulfill({ json: apiResponse(route.request().url()) }); });
    await page.goto(process.env.COMPOSER_URL || local.url, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.querySelector('[data-asset-id="expenses-icon"]')?.disabled);
    await page.locator('[data-brand="aura"]').click();
    await page.locator('#aura-heading').click();
    await page.locator('#settings-heading').click();
    const canvas = () => page.locator('#stage-canvas').evaluate(element => element.toDataURL());
    const downloadName = async () => {
      const pending = page.waitForEvent('download');
      await page.locator('#btn-download').click();
      return (await pending).suggestedFilename();
    };
    const cover = async () => {
      await page.locator('#horoscope-cover').click();
      await page.waitForFunction(() => document.querySelector('#horoscope-status').textContent.startsWith('Cover ready:'));
    };
    const configure = async (date, language = 'ta', theme = 'daily') => {
      await page.locator('#horoscope-date').fill(date);
      await page.locator('#horoscope-date').dispatchEvent('change');
      await page.locator('#horoscope-language').selectOption(language);
      await page.locator('#horoscope-theme').selectOption(theme);
    };

    await configure('2026-11-07');
    assert.deepEqual(await page.locator('#horoscope-readings textarea').evaluateAll(inputs => inputs.map(input => input.value)), Array(12).fill(''));
    // Cover creation must not depend on the unrelated reading typography fields.
    await page.locator('#horoscope-font-size').evaluate(input => { input.value = '99'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await cover();
    assert.equal(apiCalls, 0, 'A manual cover does not request horoscope readings');
    assert.deepEqual(await page.locator('#stage-canvas').evaluate(element => [element.width, element.height]), [1080, 1920]);
    assert.equal(await downloadName(), 'aura-daily-cover-2026-11-07-1080x1920.png');
    await page.locator('#horoscope-font-size').evaluate(input => { input.value = '30'; input.dispatchEvent(new Event('input', { bubbles: true })); });

    const layouts = await page.evaluate(async () => {
      const template = window.AuraHoroscopeTemplate;
      const calls = [];
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
        const metrics = this.measureText(text);
        calls.push({ text, font: this.font, left: x - metrics.actualBoundingBoxLeft, right: x + metrics.actualBoundingBoxRight, top: y - metrics.actualBoundingBoxAscent, bottom: y + metrics.actualBoundingBoxDescent });
        return original.call(this, text, x, y, ...rest);
      };
      const results = [];
      try {
        const keys = ['none', ...template.keys];
        for (const language of ['ta', 'en']) for (const key of keys) {
          const index = template.keys.indexOf(key);
          const date = key === 'none' ? '2026-11-07' : `2026-11-0${index + 1}`;
          calls.length = 0;
          const blob = await template.renderCover({ date, language }, template.palette(key, date));
          const records = [...calls];
          const bitmap = await createImageBitmap(blob);
          const item = { date, language, key, calls: records, width: bitmap.width, height: bitmap.height };
          if (language === 'ta' && ['sunday', 'wednesday', 'saturday'].includes(key)) {
            const image = document.createElement('canvas'); image.width = bitmap.width; image.height = bitmap.height;
            image.getContext('2d').drawImage(bitmap, 0, 0); item.png = image.toDataURL();
          }
          bitmap.close(); results.push(item);
        }
        for (const [date, language] of [['2026-09-30', 'en'], ['2026-02-28', 'ta']]) {
          calls.length = 0;
          const blob = await template.renderCover({ date, language }, template.palette('daily', date));
          const bitmap = await createImageBitmap(blob);
          results.push({ date, language, key: 'long-date', calls: [...calls], width: bitmap.width, height: bitmap.height }); bitmap.close();
        }
      } finally { CanvasRenderingContext2D.prototype.fillText = original; }
      return results;
    });
    assert.equal(layouts.length, 18);
    for (const item of layouts) {
      assert.deepEqual([item.width, item.height], [1080, 1920]);
      assert.equal(item.calls.length, 5, `${item.key}/${item.language}: two title lines and three date lines`);
      const [firstTitle, secondTitle, ...date] = item.calls;
      assert.ok(firstTitle.top < 400 && secondTitle.bottom < 580, 'The title is moved into the upper part of the cover');
      for (const line of item.calls) {
        assert.ok(Math.abs((line.left + line.right) / 2 - 540) < 0.1, `${item.key}/${item.language}: visible text is horizontally centered: ${line.text}`);
        assert.ok(line.left >= 180 && line.right <= 900 && line.top >= 0 && line.bottom < 1636, 'Cover text remains within the artwork');
      }
      const top = Math.min(...date.map(line => line.top)), bottom = Math.max(...date.map(line => line.bottom));
      assert.ok(Math.abs((top + bottom) / 2 - 1020) < 0.1, `${item.key}/${item.language}: complete date group is vertically centered`);
      assert.ok(top > 840 && bottom < 1200, 'The date group fits comfortably inside the wheel opening');
      assert.ok(date[0].bottom < date[1].top && date[1].bottom < date[2].top, 'The date lines have clear separation');
      if (item.png) fs.writeFileSync(path.join(output, `cover-${item.key}-${item.date}.png`), Buffer.from(item.png.split(',')[1], 'base64'));
    }
    fs.writeFileSync(path.join(output, 'text-bounds.json'), JSON.stringify(layouts.map(({ png, ...item }) => item), null, 2));

    const invalid = await page.evaluate(async () => {
      const failures = [];
      for (const options of [{}, { date: '2026-02-30' }, { date: 'not-a-date' }, { date: '2026-11-07', language: 'fr' }]) {
        try { await AuraHoroscopeTemplate.renderCover(options); failures.push(false); } catch { failures.push(true); }
      }
      return failures;
    });
    assert.deepEqual(invalid, [true, true, true, true]);

    // A settings change and a brand change both invalidate a render in flight.
    for (const change of ['settings', 'brand']) {
      const before = await canvas();
      await page.evaluate(() => {
        window.originalCoverRender = AuraHoroscopeTemplate.renderCover;
        AuraHoroscopeTemplate.renderCover = async (...args) => {
          const blob = await originalCoverRender(...args);
          await new Promise(resolve => { window.releaseCoverRender = resolve; });
          return blob;
        };
      });
      await page.locator('#horoscope-cover').click();
      await page.waitForFunction(() => typeof window.releaseCoverRender === 'function');
      if (change === 'settings') await page.locator('#horoscope-theme').selectOption('wednesday');
      else await page.locator('[data-brand="lumen"]').click();
      await page.evaluate(async () => {
        releaseCoverRender(); AuraHoroscopeTemplate.renderCover = originalCoverRender;
        delete window.releaseCoverRender;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      assert.equal(await canvas(), before, `${change} changes prevent a stale cover from committing`);
      assert.equal(await page.locator('#horoscope-cover').isEnabled(), true);
      if (change === 'brand') await page.locator('[data-brand="aura"]').click();
    }

    // A cover click cancels an older API creation, including a late API response.
    await configure('2026-11-07');
    await page.locator('#horoscope-source').selectOption('api');
    await page.waitForFunction(() => document.querySelector('#horoscope-api-status').dataset.state === 'working');
    await page.unroute('https://aura-glitchlabs.fly.dev/**');
    let releaseApi, reportStarted;
    const gate = new Promise(resolve => { releaseApi = resolve; });
    const started = new Promise(resolve => { reportStarted = resolve; });
    await page.route('https://aura-glitchlabs.fly.dev/**', async route => {
      apiCalls++; reportStarted(); await gate;
      await route.fulfill({ json: apiResponse(route.request().url()) }).catch(() => {});
    });
    await page.locator('#horoscope-create').click(); await started;
    const callsBeforeCover = apiCalls;
    await cover();
    assert.equal(apiCalls, callsBeforeCover, 'The cover action itself does not fetch the API');
    const coverAfterApi = await canvas(); releaseApi();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await canvas(), coverAfterApi, 'Late readings do not replace a newer cover');
    assert.equal(await page.locator('#horoscope-context').innerText(), '');
    await page.locator('#horoscope-source').selectOption('manual');

    await page.locator('#btn-save').click();
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).at(-1), storageKey);
    assert.equal(saved.composition.auraPostType, 'cover');
    assert.equal(saved.composition.postDate, '2026-11-07');
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#assets-created > .asset-chip').length > 0);
    await page.locator('#assets-created > .asset-chip').first().click();
    await page.waitForFunction(() => !document.querySelector('#btn-download').disabled);
    assert.equal(await downloadName(), 'aura-daily-cover-2026-11-07-1080x1920.png');
    await page.locator('#btn-close-saved').click();

    // Existing saved designs with no cover marker preserve the horoscope filename.
    await page.evaluate(key => {
      const entries = JSON.parse(localStorage.getItem(key)); delete entries.at(-1).composition.auraPostType;
      localStorage.setItem(key, JSON.stringify(entries));
    }, storageKey);
    await page.reload();
    await page.locator('#btn-created-toggle').click();
    await page.locator('#assets-created > .asset-chip').first().click();
    await page.waitForFunction(() => !document.querySelector('#btn-download').disabled);
    assert.equal(await downloadName(), 'aura-daily-horoscope-2026-11-07-1080x1920.png');
    await page.locator('#btn-close-saved').click();
    await page.locator('[data-brand="aura"]').click();
    await page.locator('#aura-heading').click();
    await page.locator('#settings-heading').click();
    await configure('2026-11-07'); await cover();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('#horoscope-cover').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'mobile-editor.png') });

    const preview = await page.evaluate(async () => {
      const keys = ['sunday', 'wednesday', 'saturday'], dates = ['2026-11-01', '2026-11-04', '2026-11-07'];
      const board = document.createElement('canvas'); board.width = 1240; board.height = 820;
      const context = board.getContext('2d'); context.fillStyle = '#f1efeb'; context.fillRect(0, 0, board.width, board.height);
      await document.fonts.load('600 24px "DM Sans"');
      context.fillStyle = '#302d2a'; context.font = '600 24px "DM Sans"';
      const labels = ['Sunday · warm gold', 'Wednesday · sage', 'Saturday · lavender'];
      for (let index = 0; index < keys.length; index++) {
        const blob = await AuraHoroscopeTemplate.renderCover({ date: dates[index], language: 'ta' }, AuraHoroscopeTemplate.palette(keys[index], dates[index]));
        const bitmap = await createImageBitmap(blob), x = 32 + index * 408;
        context.fillText(labels[index], x, 39); context.drawImage(bitmap, x, 65, 360, 640); bitmap.close();
      }
      return board.toDataURL();
    });
    fs.writeFileSync(path.join(output, 'cover-day-colors.png'), Buffer.from(preview.split(',')[1], 'base64'));
    assert.deepEqual(errors, []);
    console.log('PASS: 18 localized cover layouts, visible date centering, upper title placement, empty-draft creation, no cover API requests, stale settings/brand/API cancellation, PNG names, cover save/reload, legacy saves, and mobile width.');
    console.log(`Review renders: ${output}`);
  } finally {
    await browser.close();
    if (local) await new Promise(resolve => local.server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
