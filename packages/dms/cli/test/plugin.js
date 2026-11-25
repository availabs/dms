/**
 * `dms plugin validate` / `dms plugin pack` (src/commands/plugin.js), offline: a temp package folder.
 * Task: src/dms/planning/tasks/current/dms-plugin-system.md
 *
 * Run: node test/plugin.js   (npm run test:plugin)
 */
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const here = path.dirname(fileURLToPath(import.meta.url));
const DMS = path.resolve(here, '../bin/dms.js');
let passed = 0, failed = 0;
const check = (name, cond, extra = '') => { if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name} ${extra}`); } };
const run = (...args) => {
  try { return { code: 0, out: JSON.parse(execFileSync('node', ['--no-warnings', DMS, 'plugin', ...args], { encoding: 'utf8' })) }; }
  catch (e) { return { code: e.status, out: (() => { try { return JSON.parse(e.stdout); } catch { return e.stdout; } })() }; }
};

const dir = mkdtempSync(path.join(os.tmpdir(), 'dms-plugin-'));
const write = (rel, content) => { mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); writeFileSync(path.join(dir, rel), content); };
const pkg = {
  name: '@availabs/dms-plugin-hello', version: '1.2.3', private: true, type: 'module',
  files: ['dist/', 'README.md'],
  dms: { api: '^1.0', activation: 'opt-in', contributes: { patterns: ['hello'] }, entries: { client: './dist/client.js', server: './dist/server.cjs' } },
};
write('package.json', JSON.stringify(pkg));
write('dist/client.js', 'export default { name: "hello" }\n');
write('dist/server.cjs', 'module.exports = {}\n');
write('README.md', '# hello\n');
write('src/secret.js', 'not in files\n');
write('.env', 'SECRET=1\n');

console.log('\nvalidate');
check('a valid package', run('validate', dir).out.ok === true);
check('the name comes from the package name', run('validate', dir).out.name === 'hello');

console.log('\npack');
const r = run('pack', dir);
check('writes index.json', r.code === 0 && r.out.ok === true, JSON.stringify(r.out));
const index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8'));
const paths = index.files.map(f => f.path);
check('lists package.json and the `files` entries only', JSON.stringify(paths) === JSON.stringify(['README.md', 'dist/client.js', 'dist/server.cjs', 'package.json']), JSON.stringify(paths));
check('no hidden or unlisted file', !paths.includes('.env') && !paths.includes('src/secret.js'));
const client = index.files.find(f => f.path === 'dist/client.js');
check('size and sha512 match the file', client.size === 33 && client.sha512 === createHash('sha512').update(readFileSync(path.join(dir, 'dist/client.js'))).digest('hex'));
check('entries are normalized paths among the files', index.entries.client === 'dist/client.js' && paths.includes(index.entries.server));
check('the manifest fields are carried', index.name === 'hello' && index.version === '1.2.3' && index.api === '^1.0' && index.activation === 'opt-in');
check('a second pack does not list the previous index', !paths.includes('index.json') && !run('pack', dir).out.errors);
write('package.json', JSON.stringify({ ...pkg, dms: { ...pkg.dms, settings: { properties: { station: { type: 'string' } } } } }));
run('pack', dir);
check('the settings schema is carried into index.json', JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8')).settings?.properties?.station?.type === 'string');
write('package.json', JSON.stringify({ ...pkg, dms: { ...pkg.dms, settings: { properties: { station: { type: 'date' } } } } }));
check('a bad settings schema is refused', /settings\.properties\.station\.type/.test(JSON.stringify(run('pack', dir).out)));
write('package.json', JSON.stringify(pkg));

console.log('\nrefusals');
write('package.json', JSON.stringify({ ...pkg, dms: { ...pkg.dms, entries: { client: './dist/missing.js' } } }));
const missing = run('validate', dir);
check('an entry that does not exist', missing.code === 1 && /does not exist/.test(JSON.stringify(missing.out)));
write('package.json', JSON.stringify({ ...pkg, dms: { ...pkg.dms, api: '^9.0' } }));
check('an API this host lacks', /does not accept/.test(JSON.stringify(run('pack', dir).out)));
write('package.json', JSON.stringify({ ...pkg, files: ['../outside'] }));
const outside = run('pack', dir);
check('a files entry outside the package, refused cleanly', outside.code === 1 && outside.out.ok === false && /not inside the package/.test(JSON.stringify(outside.out)));

rmSync(dir, { recursive: true, force: true });

// ---- build: needs the host app's Vite and React, found from the package folder upward (dms-template) ----------
console.log('\nbuild');
const bdir = mkdtempSync(path.join(here, '.tmp-build-'));
const bwrite = (rel, content) => { mkdirSync(path.dirname(path.join(bdir, rel)), { recursive: true }); writeFileSync(path.join(bdir, rel), content); };
// the host app: the nearest folder above this one whose node_modules has Vite (dms-template); the CLI's own
// node_modules has a React of its own, which a plugin must not be built against
let hostDir = here;
while (hostDir !== path.dirname(hostDir) && !existsSync(path.join(hostDir, 'node_modules', 'vite', 'package.json'))) hostDir = path.dirname(hostDir);
const req = createRequire(path.join(hostDir, 'package.json'));
let hostReact = existsSync(path.join(hostDir, 'node_modules', 'vite', 'package.json'));
try { req.resolve('react'); } catch { hostReact = false; }
if (!hostReact) {
  console.log('  (no host app above this folder: Vite or React not found; build checks skipped)');
} else {
  const bpkg = {
    name: '@availabs/dms-plugin-hello', version: '1.0.0', private: true, type: 'module', files: ['dist'],
    dms: { api: '^1.0', activation: 'opt-in', source: 'plugin.jsx', contributes: { patterns: ['hello'] },
      entries: { client: 'dist/plugin.js', ssr: 'dist/plugin.js', classes: 'dist/classes.txt' } },
  };
  bwrite('package.json', JSON.stringify(bpkg));
  bwrite('plugin.jsx', [
    "import React, { useState, useContext } from 'react'",
    "import { useLocation } from 'react-router'",
    'let Ctx = null',
    "function Hello() { const [n] = useState(3); const { theme } = useContext(Ctx) || {}; const loc = useLocation();",
    "  return <div className=\"p-6 text-lg\">theme {theme?.name} path {loc.pathname} n {n}</div> }",
    "export default { name: 'hello', version: '1.0.0', api: '^1.0', activation: 'opt-in',",
    '  register(host) { Ctx = host.contexts.ThemeContext; host.registerPatternTypes({ hello: { Hello } }) } }',
  ].join('\n'));
  const built = run('build', bdir, '--host', hostDir);
  check('builds', built.code === 0 && built.out.ok === true && built.out.entry === 'dist/plugin.js', JSON.stringify(built.out));
  const code = readFileSync(path.join(bdir, 'dist/plugin.js'), 'utf8');
  check('React and the router are read from the host, not bundled', code.includes('__DMS_PLUGIN_PEERS__') && code.length < 4000 && !/react\.production|ReactCurrentDispatcher|__SECRET_INTERNALS/.test(code), `${code.length} bytes`);
  check('only the peer names it uses are kept', /useState/.test(code) && !/useTransition|createPortal/.test(code));
  check('its class names are written', /\bp-6\b/.test(readFileSync(path.join(bdir, 'dist/classes.txt'), 'utf8')));

  // the built file runs on the host's React: hooks and contexts are the host's (a second React would throw)
  const React = req('react');
  globalThis.__DMS_PLUGIN_PEERS__ = { react: React, 'react-dom': req('react-dom'), 'react/jsx-runtime': req('react/jsx-runtime'), 'react-router': req('react-router') };
  const mod = await import(pathToFileURL(path.join(bdir, 'dist/plugin.js')).href);
  const got = {};
  const ThemeContext = React.createContext(null);
  mod.default.register({ contexts: { ThemeContext }, registerPatternTypes: (m) => Object.assign(got, m) });
  const { renderToString } = req('react-dom/server');
  const { MemoryRouter } = req('react-router');
  const html = renderToString(React.createElement(MemoryRouter, { initialEntries: ['/x/y'] },
    React.createElement(ThemeContext.Provider, { value: { theme: { name: 'host-theme' } } }, React.createElement(got.hello.Hello))));
  check('it renders on the host\'s React, reading the host\'s context and router', /theme <!-- -->host-theme<!-- --> path <!-- -->\/x\/y<!-- --> n <!-- -->3/.test(html), html);
  delete globalThis.__DMS_PLUGIN_PEERS__;

  bwrite('plugin.jsx', "import { createRoot } from 'react-dom/client'\nexport default { name: 'hello', version: '1.0.0', api: '^1.0', register() { createRoot } }\n");
  const own = run('build', bdir, '--host', hostDir);
  check('importing an unshared React module (react-dom/client) is refused', own.code === 1 && /not shared with plugins/.test(JSON.stringify(own.out)), JSON.stringify(own.out).slice(0, 300));
  bwrite('package.json', JSON.stringify({ ...bpkg, dms: { ...bpkg.dms, source: 'missing.jsx' } }));
  check('a missing source is refused', run('build', bdir, '--host', hostDir).code === 1);
}
rmSync(bdir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
