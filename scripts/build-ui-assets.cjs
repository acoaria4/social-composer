const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser } = require('./test-support.cjs');

// UI-only derivatives. Canvas artwork and exports keep the full-resolution PNGs.
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'assets/ui');
const brands = ['expenses', 'aura', 'lumen', 'glitchlabs'];
const variants = ['icon', 'mark', 'wordmark-light', 'wordmark-dark', 'lockup-light', 'lockup-dark'];
const settings = { thumbnailEdge: 192, brandEdge: 64, faviconEdge: 32, webpQuality: .9 };

(async () => {
  let browser;
  try {
    browser = await launchBrowser();
    const baseURL = new URL(process.env.COMPOSER_URL || 'http://127.0.0.1:8089/');
    if (!['http:', 'https:'].includes(baseURL.protocol)) throw new Error('COMPOSER_URL must be an HTTP URL for the served repository.');
    const page = await browser.newPage();
    // Give the canvas the source images' origin without loading the app and its
    // unrelated assets. This intercepted page never becomes a repository file.
    const builderURL = new URL('__ui-asset-builder__.html', baseURL).href;
    await page.route(builderURL, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>UI asset builder</title>' }));
    await page.goto(builderURL);
    fs.mkdirSync(output, { recursive: true });
    const manifest = {
      format: 'social-composer-ui-assets', version: 1,
      generator: { ...settings, browser: browser.version() },
      renditions: {}, brandIcons: {}, favicon: null,
    };
    let sourcePixels = 0;

    for (const brand of brands) {
      for (const variant of variants) {
        const basename = `${brand}-${variant}`;
        const source = `brands/current/${basename}.png`;
        const sourceBytes = fs.statSync(path.join(root, source)).size;
        const targets = [{ kind: 'thumbnail', filename: `${basename}.webp`, edge: settings.thumbnailEdge, type: 'image/webp' }];
        if (variant === 'icon') targets.push({ kind: 'brand', filename: `${brand}-brand.webp`, edge: settings.brandEdge, type: 'image/webp' });
        if (brand === 'glitchlabs' && variant === 'icon') targets.push({ kind: 'favicon', filename: 'favicon.png', edge: settings.faviconEdge, type: 'image/png' });

        const rendered = await page.evaluate(async ({ url, targets, quality }) => {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Image request failed: HTTP ${response.status}`);
          const bitmap = await createImageBitmap(await response.blob());
          const canvas = document.createElement('canvas');
          try {
            const results = [];
            for (const target of targets) {
              const scale = Math.min(1, target.edge / Math.max(bitmap.width, bitmap.height));
              canvas.width = Math.max(1, Math.round(bitmap.width * scale));
              canvas.height = Math.max(1, Math.round(bitmap.height * scale));
              const context = canvas.getContext('2d', { willReadFrequently: true });
              context.imageSmoothingEnabled = true;
              context.imageSmoothingQuality = 'high';
              context.clearRect(0, 0, canvas.width, canvas.height);
              context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
              const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
              let transparent = false;
              for (let alpha = 3; alpha < pixels.length; alpha += 4) if (pixels[alpha] < 255) { transparent = true; break; }
              const data = canvas.toDataURL(target.type, quality);
              if (!data.startsWith(`data:${target.type};base64,`)) throw new Error(`This browser cannot encode ${target.type}.`);
              results.push({ kind: target.kind, filename: target.filename, width: canvas.width, height: canvas.height, transparent, base64: data.split(',')[1] });
            }
            return { width: bitmap.width, height: bitmap.height, results };
          } finally {
            bitmap.close();
            canvas.width = canvas.height = 0;
          }
        }, { url: new URL(source, baseURL).href, targets, quality: settings.webpQuality });

        sourcePixels += rendered.width * rendered.height;
        for (const result of rendered.results) {
          const bytes = Buffer.from(result.base64, 'base64');
          fs.writeFileSync(path.join(output, result.filename), bytes);
          const entry = {
            src: `assets/ui/${result.filename}`, width: result.width, height: result.height,
            bytes: bytes.length, transparent: result.transparent,
            source, sourceBytes, sourceWidth: rendered.width, sourceHeight: rendered.height,
          };
          if (result.kind === 'thumbnail') manifest.renditions[source] = entry;
          else if (result.kind === 'brand') manifest.brandIcons[brand] = entry;
          else manifest.favicon = entry;
        }
      }
    }

    const thumbnails = Object.values(manifest.renditions);
    const brandIcons = Object.values(manifest.brandIcons);
    const all = [...thumbnails, ...brandIcons, manifest.favicon];
    const sum = (entries, key) => entries.reduce((total, entry) => total + entry[key], 0);
    manifest.totals = {
      sourceFiles: thumbnails.length, sourceBytes: sum(thumbnails, 'sourceBytes'), sourceDecodedBytes: sourcePixels * 4,
      thumbnailFiles: thumbnails.length, thumbnailBytes: sum(thumbnails, 'bytes'),
      brandFiles: brandIcons.length, brandBytes: sum(brandIcons, 'bytes'), faviconBytes: manifest.favicon.bytes,
      generatedFiles: all.length, generatedBytes: sum(all, 'bytes'),
      generatedDecodedBytes: all.reduce((total, entry) => total + entry.width * entry.height * 4, 0),
    };
    fs.writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Built ${all.length} UI renditions: ${manifest.totals.sourceBytes} source bytes → ${manifest.totals.generatedBytes} UI bytes.`);
  } finally { if (browser) await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
