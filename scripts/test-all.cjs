const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync, execFile } = require('node:child_process');
const { root, browserName, startServer } = require('./test-support.cjs');

const args = process.argv.slice(2);
let syntaxOnly = false;
const selected = [];
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--syntax-only') syntaxOnly = true;
  else if (args[index] === '--suite' && args[index + 1]) {
    const suite = args[++index].replace(/\.cjs$/, '') + '.cjs';
    if (!/^test-[a-z0-9-]+\.cjs$/.test(suite)) throw new Error('Use --suite test-name.cjs.');
    selected.push(suite);
  } else throw new Error(`Unknown test argument: ${args[index]}`);
}

const scripts = path.join(root, 'scripts');
const allSuites = fs.readdirSync(scripts).filter(file => /^test-.*\.cjs$/.test(file) && !['test-all.cjs', 'test-support.cjs'].includes(file)).sort();
for (const file of selected) if (!allSuites.includes(file)) throw new Error(`Test suite does not exist: ${file}`);
const suites = selected.length ? [...new Set(selected)] : allSuites;
const files = ['js', 'scripts'].flatMap(directory => fs.readdirSync(path.join(root, directory)).filter(file => /\.(js|cjs)$/.test(file)).map(file => path.join(root, directory, file)));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message || result.stderr || `Syntax check failed: ${file}`);
    process.exit(1);
  }
}
console.log(`PASS syntax: ${files.length} JavaScript files`);
if (syntaxOnly) process.exit(0);

const browser = browserName();
const output = path.join(root, 'exports', 'checks', browser);
fs.mkdirSync(output, { recursive: true });
const timeout = Number(process.env.COMPOSER_TEST_TIMEOUT_MS || 180000);
if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 900000) throw new Error('COMPOSER_TEST_TIMEOUT_MS must be between 1000 and 900000.');
const results = [];
let activeChild = null;
let interrupted = false;

function stopChild(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, error => { if (error) child.kill('SIGKILL'); });
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  interrupted = true;
  stopChild(activeChild);
});

function runSuite(file, url) {
  return new Promise(resolve => {
    const started = Date.now();
    const logFile = path.join(output, file.replace(/\.cjs$/, '.log'));
    const log = fs.createWriteStream(logFile);
    const child = spawn(process.execPath, [path.join(scripts, file)], {
      cwd: root, env: { ...process.env, COMPOSER_URL: url, COMPOSER_BROWSER: browser },
      windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeChild = child;
    let timedOut = false, failure = null;
    const timer = setTimeout(() => { timedOut = true; stopChild(child); }, timeout);
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    child.once('error', error => { failure = error.message; });
    child.once('close', (code, signal) => {
      clearTimeout(timer); activeChild = null;
      const passed = code === 0 && !failure && !timedOut;
      log.end(() => resolve({ suite: file, passed, exitCode: code, signal, timedOut, error: failure, durationMs: Date.now() - started, log: path.relative(root, logFile).replaceAll(path.sep, '/') }));
    });
  });
}

(async () => {
  const local = process.env.COMPOSER_URL ? null : await startServer();
  const url = process.env.COMPOSER_URL || local.url;
  console.log(`Running ${suites.length} suites serially in ${browser} at ${url}`);
  try {
    for (const suite of suites) {
      if (interrupted) break;
      const result = await runSuite(suite, url);
      results.push(result);
      fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ browser, execution: 'serial', interrupted, suites: results }, null, 2));
      console.log(`${result.passed ? 'PASS' : 'FAIL'} ${suite} (${(result.durationMs / 1000).toFixed(1)}s)`);
      if (!result.passed) {
        const failure = fs.readFileSync(path.join(root, result.log), 'utf8');
        const readable = failure.replace(/(data:image\/[a-z0-9.+-]+(?:;[^,\s]*)?;base64,)([a-z0-9+/=]+)/gi, (_, prefix, data) => `${prefix}[${data.length} encoded characters omitted; see full log]`);
        console.error(readable.slice(-16000));
      }
    }
  } finally {
    if (local) {
      local.server.closeAllConnections();
      await new Promise(resolve => local.server.close(resolve));
    }
  }
  const failures = results.filter(result => !result.passed).length;
  if (interrupted) { console.error('Test run interrupted; active test process stopped.'); process.exitCode = 130; }
  else {
    console.log(`${results.length - failures}/${results.length} suites passed. Evidence: exports/checks/${browser}/results.json`);
    process.exitCode = failures ? 1 : 0;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
