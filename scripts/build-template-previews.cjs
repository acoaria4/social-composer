const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

// These are real local renderer samples, not live readings or API results.
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(process.env.COMPOSER_URL || 'http://127.0.0.1:8089/');
    const output = path.resolve(__dirname, '../assets/templates');
    fs.mkdirSync(output, { recursive: true });
    for (const kind of ['aura-cover', 'aura-reading', 'lumen-fact']) {
      const data = await page.evaluate(async kind => {
        const aura = AuraHoroscopeTemplate;
        const edition = { date: '2026-11-07', language: 'en', ordered: aura.signs.map(name => ({ name, text: 'Your daily reading appears here.' })) };
        const blob = kind === 'aura-cover' ? await aura.renderCover(edition, aura.palette('saturday'))
          : kind === 'aura-reading' ? await aura.render(edition, aura.neutral)
          : await LumenFactTemplate.render({ text: 'Your fact or explanation goes here.', subject: 'maths', fontSize: 72, format: '1080x1920' });
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas'); canvas.width = 216; canvas.height = 384;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, 216, 384); bitmap.close();
        return canvas.toDataURL('image/webp', .88).split(',')[1];
      }, kind);
      fs.writeFileSync(path.join(output, `${kind}.webp`), Buffer.from(data, 'base64'));
    }
    console.log('Built three local template previews.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
