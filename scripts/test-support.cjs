const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const engines = new Set(['chromium', 'firefox', 'webkit']);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function browserName() {
  const name = process.env.COMPOSER_BROWSER || 'chromium';
  if (!engines.has(name)) throw new Error(`Unknown COMPOSER_BROWSER=${name}. Choose chromium, firefox, or webkit.`);
  return name;
}
const isChromium = () => browserName() === 'chromium';

async function startServer({ port = 0 } = {}) {
  const realRoot = await fs.promises.realpath(root);
  const server = http.createServer(async (request, response) => {
    const finish = status => { response.writeHead(status, { 'Cache-Control': 'no-store' }); response.end(); };
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) return finish(403);
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (relative !== 'index.html' && !/^(css|js|assets|brands)\//.test(relative)) return finish(404);
      const type = types[path.extname(relative).toLowerCase()];
      if (!type) return finish(404);
      const file = path.resolve(realRoot, relative);
      if (!file.startsWith(realRoot + path.sep)) return finish(403);
      const resolved = await fs.promises.realpath(file);
      if (!resolved.startsWith(realRoot + path.sep)) return finish(403);
      const target = path.relative(realRoot, resolved).replaceAll(path.sep, '/');
      if (target.split('/').some(part => part.startsWith('.')) || (target !== 'index.html' && !/^(css|js|assets|brands)\//.test(target))) return finish(403);
      const stat = await fs.promises.stat(resolved);
      if (!stat.isFile()) return finish(404);
      response.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      if (request.method === 'HEAD') response.end();
      else fs.createReadStream(resolved).on('error', () => response.destroy()).pipe(response);
    } catch (error) { finish(error instanceof URIError ? 400 : 404); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  server.unref();
  const url = `http://127.0.0.1:${server.address().port}/`;
  if (!process.env.COMPOSER_URL) process.env.COMPOSER_URL = url;
  return { server, url };
}

function installedChrome() {
  if (process.env.CI) return false;
  return [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/opt/google/chrome/chrome',
  ].some(file => file && fs.existsSync(file));
}

async function launchBrowser(options = {}) {
  const name = browserName();
  const playwright = require('playwright');
  const local = process.env.COMPOSER_URL ? null : await startServer();
  const settings = { headless: true, ...options };
  if (name === 'chromium') {
    const channel = process.env.COMPOSER_CHANNEL || (installedChrome() ? 'chrome' : null);
    if (channel) settings.channel = channel;
    if (process.platform === 'win32') settings.args = [...new Set([...(settings.args || []), '--disable-gpu'])];
  }
  if (name === 'firefox' && process.platform === 'win32') settings.firefoxUserPrefs = {
    'gfx.webrender.software': true, 'layers.acceleration.disabled': true, ...settings.firefoxUserPrefs,
  };
  try {
    const browser = await playwright[name].launch(settings);
    if (local) browser.once('disconnected', () => local.server.close());
    return browser;
  } catch (error) {
    if (local) local.server.close();
    throw new Error(`Cannot launch ${name}. Run npm ci and npx playwright install ${name}. ${error.message}`, { cause: error });
  }
}

async function clickAsset(page, selector) {
  const button = page.locator(selector);
  const before = await page.locator('#layers-list .layer-row').count();
  await button.click();
  const element = await button.elementHandle();
  try {
    await page.waitForFunction(({ element, before }) => element.isConnected && !element.disabled && element.getAttribute('aria-busy') !== 'true' && document.querySelectorAll('#layers-list .layer-row').length === before + 1, { element, before });
  } finally { await element?.dispose(); }
}

module.exports = { root, browserName, isChromium, launchBrowser, startServer, clickAsset };

if (require.main === module) {
  if (process.argv[2] !== '--serve') throw new Error('Use npm start to run the local app server.');
  const port = Number(process.env.PORT || 8089);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  startServer({ port }).then(({ server, url }) => {
    server.ref();
    console.log(`Social Composer: ${url} (loopback only)`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
