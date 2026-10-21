/**
 * HTTP integration tests for site hosting (src/sites/index.js): several sites'
 * built client files served from one server by request Host, with a stub API
 * route behind them to prove that unmatched hosts still reach the API.
 *
 * Builds a throwaway sites folder in the OS temp dir, so no database is needed.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const { createSitesMiddleware, parseRedirects } = require('../src/sites');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-sites-test-'));

function write(rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// site.json is replaced whole (temp file + rename), the way the deploy tool writes it.
function writeSite(name, config) {
  const file = path.join(root, name, 'site.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(config));
  fs.renameSync(`${file}.tmp`, file);
}

function writeBuild(site, id, label, { redirects } = {}) {
  const dir = `${site}/builds/${id}/client`;
  write(`${dir}/index.html`, `<html>${label}</html>`);
  write(`${dir}/assets/app-abc123.js`, `console.log("${label}")`);
  write(`${dir}/favicon.ico`, 'icon');
  write(`${dir}/deploy-info.json`, JSON.stringify({ build: id }));
  if (redirects) write(`${dir}/_redirects`, redirects);
}

writeBuild('alpha', 'b1', 'alpha b1', {
  redirects: [
    '# comment line',
    'https://old.alpha.test/*  https://www.alpha.test/:splat  301!',
    'https://tsmo.alpha.test/  https://www.alpha.test/tsmo  301!',
    '/legacy  /new-home  302',
    '/favicon.ico  /elsewhere  302',
    '/*  /index.html  200',
  ].join('\n'),
});
writeSite('alpha', { hosts: ['www.alpha.test', 'alpha.test', '*.alpha.test'], live: 'b1' });
writeBuild('beta', 'b1', 'beta b1');
writeSite('beta', { hosts: ['www.beta.test'], live: 'b1' });

const app = express();
app.use(createSitesMiddleware({ sitesDir: root, reloadIntervalMs: 0 }));
app.all('*', (req, res) => res.type('text/plain').send('api'));

let port;

function request(host, urlPath = '/', method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers: { host } }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  port = server.address().port;

  console.log('\nHost lookup');
  await test('exact host serves that site', async () => {
    const r = await request('www.alpha.test');
    assert(r.status === 200 && r.body === '<html>alpha b1</html>', `got ${r.status} ${r.body}`);
  });
  await test('bare domain listed explicitly', async () => {
    assert((await request('alpha.test')).body.includes('alpha b1'), 'alpha.test');
  });
  await test('wildcard matches a subdomain', async () => {
    assert((await request('npmrds.alpha.test')).body.includes('alpha b1'), 'npmrds.alpha.test');
  });
  await test('port and trailing .localhost are ignored', async () => {
    assert((await request('www.alpha.test.localhost:5556')).body.includes('alpha b1'), 'localhost name');
  });
  await test('a second site on the same server', async () => {
    assert((await request('www.beta.test')).body.includes('beta b1'), 'beta');
  });
  await test('an unknown host falls through to the API', async () => {
    const r = await request('dmsserver.example.org', '/graph');
    assert(r.body === 'api', `got ${r.body}`);
  });
  await test('a wildcard does not match the bare domain of another site', async () => {
    assert((await request('beta.test')).body === 'api', 'beta.test is not configured');
  });

  console.log('\nFiles and fallback');
  await test('hashed asset served with an immutable cache header', async () => {
    const r = await request('www.alpha.test', '/assets/app-abc123.js');
    assert(r.status === 200 && r.body.includes('alpha b1'), `got ${r.status}`);
    assert(/immutable/.test(r.headers['cache-control']), `cache-control ${r.headers['cache-control']}`);
  });
  await test('other files revalidate', async () => {
    const r = await request('www.alpha.test', '/deploy-info.json');
    assert(r.status === 200 && r.headers['cache-control'] === 'no-cache', `cache-control ${r.headers['cache-control']}`);
  });
  await test('a deep route gets index.html with no-cache', async () => {
    const r = await request('www.alpha.test', '/some/deep/route?x=1');
    assert(r.status === 200 && r.body.includes('alpha b1'), `got ${r.status}`);
    assert(r.headers['cache-control'] === 'no-cache', `cache-control ${r.headers['cache-control']}`);
  });
  await test('a missing asset is a 404, not HTML', async () => {
    const r = await request('www.alpha.test', '/assets/missing-chunk.js');
    assert(r.status === 404 && !r.body.includes('<html>'), `got ${r.status}`);
  });
  await test('_redirects itself is not served', async () => {
    const r = await request('www.alpha.test', '/_redirects');
    assert(!r.body.includes('https://old.alpha.test'), 'rules leaked');
  });
  await test('HEAD works', async () => {
    const r = await request('www.alpha.test', '/', 'HEAD');
    assert(r.status === 200 && r.body === '', `got ${r.status}`);
  });
  await test('other methods are refused', async () => {
    const r = await request('www.alpha.test', '/', 'POST');
    assert(r.status === 405, `got ${r.status}`);
  });
  await test('security headers on site responses only', async () => {
    const site = await request('www.alpha.test');
    assert(site.headers['x-frame-options'] === 'SAMEORIGIN', 'missing on site');
    assert(site.headers['content-security-policy'] === "frame-ancestors 'self'", 'csp');
    const api = await request('dmsserver.example.org');
    assert(!api.headers['x-frame-options'], 'leaked onto API response');
  });
  await test('encoded ../ cannot read outside the build', async () => {
    const r = await request('www.alpha.test', '/..%2f..%2f..%2fsite.json');
    assert(!r.body.includes('"hosts"'), 'site.json leaked');
  });

  console.log('\nRedirects');
  await test('host rule with splat keeps the path and query', async () => {
    const r = await request('old.alpha.test', '/a/b?x=1');
    assert(r.status === 301 && r.headers.location === 'https://www.alpha.test/a/b?x=1', `got ${r.status} ${r.headers.location}`);
  });
  await test('host rule for the root only', async () => {
    const r = await request('tsmo.alpha.test', '/');
    assert(r.status === 301 && r.headers.location === 'https://www.alpha.test/tsmo', `got ${r.headers.location}`);
    const deep = await request('tsmo.alpha.test', '/auth/login');
    assert(deep.status === 200 && deep.body.includes('alpha b1'), `deep link got ${deep.status}`);
  });
  await test('host rules match on a .localhost name too', async () => {
    const r = await request('old.alpha.test.localhost:5556', '/x');
    assert(r.status === 301 && r.headers.location === 'https://www.alpha.test/x', `got ${r.headers.location}`);
  });
  await test('path rule without ! applies when no file exists', async () => {
    const r = await request('www.alpha.test', '/legacy');
    assert(r.status === 302 && r.headers.location === '/new-home', `got ${r.status} ${r.headers.location}`);
  });
  await test('path rule without ! loses to an existing file', async () => {
    const r = await request('www.alpha.test', '/favicon.ico');
    assert(r.status === 200 && r.body === 'icon', `got ${r.status}`);
  });
  await test('200 rewrites are skipped by the parser', async () => {
    const rules = parseRedirects('/*  /index.html  200\n/a /b 301');
    assert(rules.length === 1 && rules[0].base === '/a', JSON.stringify(rules));
  });

  console.log('\nChanges on disk');
  await test('a new live build is picked up without a restart', async () => {
    writeBuild('alpha', 'b2', 'alpha b2');
    writeSite('alpha', { hosts: ['www.alpha.test', 'alpha.test', '*.alpha.test'], live: 'b2' });
    const r = await request('www.alpha.test');
    assert(r.body.includes('alpha b2'), 'still b1');
    assert(r.headers['x-site-build'] === 'b2', `x-site-build ${r.headers['x-site-build']}`);
  });
  await test('rolling back is the same switch', async () => {
    writeSite('alpha', { hosts: ['www.alpha.test', 'alpha.test', '*.alpha.test'], live: 'b1' });
    assert((await request('www.alpha.test')).body.includes('alpha b1'), 'still b2');
  });
  await test('a missing live build is a 503', async () => {
    writeSite('beta', { hosts: ['www.beta.test'], live: 'nope' });
    assert((await request('www.beta.test')).status === 503, 'expected 503');
  });
  await test('a live build outside the site folder is refused', async () => {
    writeSite('beta', { hosts: ['www.beta.test'], live: '../../alpha/builds/b1' });
    const r = await request('www.beta.test');
    assert(r.status === 503 && !r.body.includes('alpha'), `got ${r.status} ${r.body}`);
    writeSite('beta', { hosts: ['www.beta.test'], live: 'b1' });
  });
  await test('a host claimed by two sites is served by neither', async () => {
    writeBuild('gamma', 'b1', 'gamma b1');
    writeSite('gamma', { hosts: ['www.beta.test'], live: 'b1' });
    assert((await request('www.beta.test')).body === 'api', 'conflict should fall through');
    fs.rmSync(path.join(root, 'gamma'), { recursive: true });
    assert((await request('www.beta.test')).body.includes('beta b1'), 'beta back after gamma removed');
  });
  await test('an unreadable site.json keeps the previous version', async () => {
    fs.writeFileSync(path.join(root, 'beta', 'site.json'), '{ not json');
    assert((await request('www.beta.test')).body.includes('beta b1'), 'beta dropped');
  });
  await test('a new site appears without a restart', async () => {
    writeBuild('delta', 'b1', 'delta b1');
    writeSite('delta', { hosts: ['www.delta.test'], live: 'b1' });
    assert((await request('www.delta.test')).body.includes('delta b1'), 'delta not served');
  });

  console.log('\nNo sites folder');
  await test('a server without the folder passes every request through', async () => {
    const bare = express();
    bare.use(createSitesMiddleware({ sitesDir: path.join(root, 'does-not-exist'), reloadIntervalMs: 0 }));
    bare.all('*', (req, res) => res.send('api'));
    const s = await new Promise(resolve => { const l = bare.listen(0, '127.0.0.1', () => resolve(l)); });
    const savedPort = port;
    port = s.address().port;
    try {
      const r = await request('www.alpha.test', '/');
      assert(r.body === 'api' && !r.headers['x-frame-options'], `got ${r.body}`);
    } finally {
      port = savedPort;
      s.close();
    }
  });

  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

run().catch(err => {
  console.error(err);
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(1);
});
