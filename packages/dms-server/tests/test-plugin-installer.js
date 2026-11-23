/**
 * Fetching and storing a plugin release (src/plugins/installer.js; dms-plugin-system.md P2, design §3).
 *
 * A local HTTP server serves a release (index.json + files). Covers: refused without a signature verifier;
 * installed when it verifies (every listed file, nothing else, the index and a release marker); the same release
 * again is a no-op; a tampered or oversized file, a file off the index's origin, an invalid index, or another
 * release under the same version are refused and leave no version folder.
 * No database.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert');
const { installRelease } = require('../src/plugins/installer');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

const files = {
  'package.json': Buffer.from(JSON.stringify({ name: '@availabs/dms-plugin-hello', version: '1.0.0' })),
  'dist/client.js': Buffer.from('export default { name: "hello" }\n'),
  'dist/server.cjs': Buffer.from('module.exports = {}\n'),
};
const indexFor = (over = {}, fileOver = {}) => ({
  name: 'hello', version: '1.0.0', api: '^1.0', activation: 'opt-in',
  contributes: { patterns: ['hello'] },
  entries: { client: 'dist/client.js', server: 'dist/server.cjs' },
  permissions: {},
  files: Object.entries(files).map(([p, b]) => ({ path: p, size: b.length, sha512: crypto.createHash('sha512').update(b).digest('hex'), ...(fileOver[p] || {}) })),
  ...over,
});

let routes = {};
const server = http.createServer((req, res) => {
  const body = routes[req.url];
  if (!body) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Length', body.length);
  res.end(body);
});

async function run() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const serve = (prefix, index, contents = files) => {
    routes[`${prefix}/index.json`] = Buffer.from(JSON.stringify(index));
    for (const [p, b] of Object.entries(contents)) routes[`${prefix}/${p}`] = b;
    return `${base}${prefix}/index.json`;
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugins-'));
  const yes = async () => true;
  const versionDir = path.join(dir, 'hello', '1.0.0');

  console.log('\nplugin installer');
  const url = serve('/r1', indexFor());
  await t('refused without a signature verifier', async () => {
    const prev = process.env.DMS_PLUGIN_ALLOW_UNSIGNED; delete process.env.DMS_PLUGIN_ALLOW_UNSIGNED;
    try { await assert.rejects(() => installRelease({ url, dir }), /no signature verifier/); }
    finally { if (prev !== undefined) process.env.DMS_PLUGIN_ALLOW_UNSIGNED = prev; }
    assert(!fs.existsSync(versionDir));
  });
  await t('refused when the signature does not verify', async () => {
    await assert.rejects(() => installRelease({ url, dir, verifySignature: async () => false }), /did not verify/);
  });
  await t('installed when it verifies: every listed file, the index, a marker, nothing else', async () => {
    let seen = null;
    const r = await installRelease({ url, dir, verifySignature: async (a) => { seen = a; return true; } });
    assert.strictEqual(r.already, false);
    assert(seen && seen.indexUrl === url && Buffer.isBuffer(seen.indexBytes), 'the verifier gets the index bytes');
    const listed = (d, pre = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? listed(path.join(d, e.name), `${pre}${e.name}/`) : [`${pre}${e.name}`]);
    assert.deepStrictEqual(listed(versionDir).sort(), ['.dms-release.json', 'dist/client.js', 'dist/server.cjs', 'index.json', 'package.json']);
    assert.strictEqual(fs.readFileSync(path.join(versionDir, 'dist/client.js'), 'utf8'), files['dist/client.js'].toString());
  });
  await t('the same release again is a no-op', async () => {
    const r = await installRelease({ url, dir, verifySignature: yes });
    assert.strictEqual(r.already, true);
  });
  await t('another release under the same version is refused (versions are immutable)', async () => {
    const other = serve('/r2', indexFor({ permissions: { egress: ['example.org'] } }));
    await assert.rejects(() => installRelease({ url: other, dir, verifySignature: yes }), /immutable/);
  });

  const v2 = (over, fileOver, contents) => serve(`/v${Math.random().toString(36).slice(2, 8)}`, indexFor({ version: over.version, ...over }, fileOver), contents);
  const leftNothing = (version) => assert(!fs.existsSync(path.join(dir, 'hello', version)), `no ${version} folder`)
    || assert(!fs.readdirSync(path.join(dir, 'hello')).some(n => n.startsWith(`.${version}-`)), 'no temp folder left');
  await t('a tampered file is refused, and nothing is left', async () => {
    const u = v2({ version: '2.0.0' }, {}, { ...files, 'dist/client.js': Buffer.from('export default { name: "evil" }\n') });
    await assert.rejects(() => installRelease({ url: u, dir, verifySignature: yes }), /sha512|bytes/);
    leftNothing('2.0.0');
  });
  await t('a file bigger than the index says is refused', async () => {
    const u = v2({ version: '2.0.1' }, {}, { ...files, 'dist/server.cjs': Buffer.concat([files['dist/server.cjs'], Buffer.from('// more\n')]) });
    await assert.rejects(() => installRelease({ url: u, dir, verifySignature: yes }), /more than|bytes/);
    leftNothing('2.0.1');
  });
  await t('a file off the index\'s origin is refused', async () => {
    const idx = indexFor({ version: '2.0.2' });
    idx.files.push({ path: 'http://example.invalid/x.js', size: 1, sha512: 'a'.repeat(128) });
    const u = serve('/off', idx);
    await assert.rejects(() => installRelease({ url: u, dir, verifySignature: yes }), /not beside the index|not a path inside/);
    leftNothing('2.0.2');
  });
  await t('an invalid index is refused before any download', async () => {
    const u = serve('/bad', { name: 'hello', version: '3.0.0', api: '^1.0', contributes: { patterns: ['hello'] }, entries: { client: 'x.js' } });
    await assert.rejects(() => installRelease({ url: u, dir, verifySignature: yes }), /not a valid release/);
  });
  await t('only http(s)', async () => {
    await assert.rejects(() => installRelease({ url: 'file:///etc/passwd', dir, verifySignature: yes }), /only http/);
  });

  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
