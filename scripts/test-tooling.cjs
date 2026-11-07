const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { startServer, browserName } = require('./test-support.cjs');

async function generatorSetup(configuredURL) {
  const env = configuredURL ? { COMPOSER_URL: configuredURL } : {};
  const origin = configuredURL || 'http://127.0.0.1:37491/';
  const stopped = new Error('Stop before rendering or writing generated assets');
  const observations = { errors: [], route: null, target: null, closed: false };
  const page = {
    async route(url) { observations.route = url; },
    async goto(url) { observations.target = url; throw stopped; },
  };
  const browser = { async newPage() { return page; }, async close() { observations.closed = true; } };
  const filename = path.join(__dirname, 'build-ui-assets.cjs');
  await vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    __dirname, URL, process: { env, exitCode: 0 },
    console: { error(error) { observations.errors.push(error); } },
    require(name) {
      if (name === './test-support.cjs') return { async launchBrowser() { env.COMPOSER_URL = origin; return browser; } };
      if (name === 'node:fs') return {
        mkdirSync() { assert.fail('Setup regression must stop before writing assets'); },
        writeFileSync() { assert.fail('Setup regression must stop before writing assets'); },
      };
      return require(name);
    },
  }, { filename });
  assert.equal(observations.route, new URL('__ui-asset-builder__.html', origin).href);
  assert.equal(observations.target, observations.route, 'The generator uses the origin provided by browser/server setup');
  assert.equal(observations.closed, true, 'Setup failure still closes the browser');
  assert.deepEqual(observations.errors, [stopped]);
}

(async () => {
  const { server, url } = await startServer();
  const request = (pathname, method = 'GET') => new Promise((resolve, reject) => {
    const message = http.request(new URL(url), { path: pathname, method }, response => {
      const body = [];
      response.on('data', chunk => body.push(chunk));
      response.once('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(body) }));
    });
    message.once('error', reject); message.end();
  });
  try {
    const home = await request('/');
    assert.equal(home.status, 200); assert.match(home.body.toString(), /Social Composer/);
    assert.equal(home.headers['x-content-type-options'], 'nosniff');
    const css = await request('/css/composer.css?test=1', 'HEAD');
    assert.equal(css.status, 200); assert.match(css.headers['content-type'], /text\/css/);
    assert.ok(Number(css.headers['content-length']) > 0); assert.equal(css.body.length, 0);
    for (const pathname of ['/.git/config', '/.env', '/package-lock.json', '/scripts/test-support.cjs', '/exports/private.json', '/assets/%2e%2e/%2e%2e/.git/config', '/assets/%5c..%5c..%5c.git/config', '/assets/%00.png']) {
      const response = await request(pathname);
      assert.ok([403, 404].includes(response.status), `Private or unsafe path was blocked: ${pathname}`);
      assert.equal(response.body.length, 0);
    }
    assert.equal((await request('/', 'POST')).status, 405);
    assert.equal((await request('/%invalid')).status, 400);
    const previous = process.env.COMPOSER_BROWSER;
    try {
      process.env.COMPOSER_BROWSER = 'unknown';
      assert.throws(browserName, /Unknown COMPOSER_BROWSER/);
    } finally {
      if (previous === undefined) delete process.env.COMPOSER_BROWSER;
      else process.env.COMPOSER_BROWSER = previous;
    }
    await generatorSetup();
    await generatorSetup('http://127.0.0.1:33441/social-composer/');
    console.log('PASS: loopback static server, GET/HEAD, private/traversal rejection, browser selection, and asset-builder server setup.');
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
