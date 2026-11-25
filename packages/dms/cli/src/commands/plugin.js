/* global process */
/**
 * Plugin packages (planning/tasks/current/dms-plugin-system.md): check one, and write its release index.
 *
 *     dms plugin validate <dir>        # the package.json `dms` key, and that its entries exist
 *     dms plugin pack <dir> [--out f]  # write index.json: the manifest plus every file's size and sha512
 *     dms plugin build <dir>           # build the browser/SSR entry from `dms.source` into `dms.entries.client`
 *
 * A release is that index.json plus the files it names (owner's decision D3); the server's installer will download
 * exactly those files and check each against its digest. Offline: no server, no network. The rules are dms-server's
 * (src/plugins/index.js validateManifest), so the CLI and the installer can't disagree.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { output } from '../utils/output.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { validateManifest, safeRelative } = require(path.resolve(here, '../../../../dms-server/src/plugins/index.js'));

const IGNORE = new Set(['node_modules', '.git', '.DS_Store', 'index.json', 'index.json.sigstore']);

function readPackage(dir) {
  const file = path.join(dir, 'package.json');
  if (!existsSync(file)) throw new Error(`${dir}: no package.json`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

// The plugin's name: dms.name, else the package name without its scope and `dms-plugin-` prefix.
const pluginName = (pkg) => pkg.dms?.name || String(pkg.name || '').replace(/^@[^/]+\//, '').replace(/^dms-plugin-/, '').replace(/-/g, '_');

// The package's files: npm's `files` list when it has one (folders included whole), else everything but
// node_modules, VCS folders, hidden files and a previous index.
function packageFiles(dir, pkg) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(dir, rel);
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const name of readdirSync(abs).sort()) {
        if (IGNORE.has(name) || name.startsWith('.')) continue;
        walk(rel ? `${rel}/${name}` : name);
      }
    } else if (st.isFile()) out.push(rel);
  };
  if (Array.isArray(pkg.files) && pkg.files.length) {
    for (const f of ['package.json', ...pkg.files]) {
      const rel = f.replace(/^\.\//, '').replace(/\/$/, '');
      if (!safeRelative(rel)) throw new Error(`files: "${f}" is not inside the package`);
      if (existsSync(path.join(dir, rel))) walk(rel);
    }
  } else walk('');
  return [...new Set(out)].sort();
}

/** Problems with a plugin package folder; empty when it is valid. */
export function checkPackage(dir) {
  const pkg = readPackage(dir);
  const errors = validateManifest(pkg);
  for (const [k, v] of Object.entries(pkg.dms?.entries || {})) {
    if (typeof v === 'string' && safeRelative(v) && !existsSync(path.join(dir, v))) errors.push(`entries.${k}: "${v}" does not exist`);
  }
  return errors;
}

/** The release index of a plugin package folder. */
export function buildIndex(dir) {
  const pkg = readPackage(dir);
  const { api, activation, contributes, entries, permissions, settings } = pkg.dms || {};
  const files = packageFiles(dir, pkg).map((rel) => {
    const buf = readFileSync(path.join(dir, rel));
    return { path: rel, size: buf.length, sha512: createHash('sha512').update(buf).digest('hex') };
  });
  const norm = (p) => (typeof p === 'string' ? p.replace(/^\.\//, '') : p);
  const index = {
    name: pluginName(pkg),
    version: pkg.version,
    api,
    ...(activation ? { activation } : {}),
    contributes: contributes || {},
    entries: Object.fromEntries(Object.entries(entries || {}).map(([k, v]) => [k, norm(v)])),
    permissions: permissions || {},
    ...(settings ? { settings } : {}),
    files,
  };
  return index;
}

export async function validate(dir, options = {}) {
  const errors = checkPackage(dir);
  if (errors.length) {
    output({ ok: false, dir, errors }, options);
    process.exitCode = 1;
    return;
  }
  const pkg = readPackage(dir);
  output({ ok: true, dir, name: pluginName(pkg), version: pkg.version }, options);
}

export async function pack(dir, options = {}) {
  const errors = checkPackage(dir);
  let index = null;
  if (!errors.length) {
    try { index = buildIndex(dir); } catch (e) { errors.push(e.message); }
  }
  const releaseErrors = index ? validateManifest(index, { release: true }) : [];
  if (errors.length || releaseErrors.length) {
    output({ ok: false, dir, errors: [...errors, ...releaseErrors] }, options);
    process.exitCode = 1;
    return;
  }
  const out = options.out || path.join(dir, 'index.json');
  writeFileSync(out, JSON.stringify(index, null, 2) + '\n');
  output({ ok: true, wrote: out, name: index.name, version: index.version, files: index.files.length,
    bytes: index.files.reduce((n, f) => n + f.size, 0) }, options);
}

// ---- build ------------------------------------------------------------------------------------------------------
//
// A plugin shares the host's React, react-dom, JSX runtime and router (one React per page, the host's contexts): the
// build maps those imports to shim modules that read the host's copies from `globalThis.__DMS_PLUGIN_PEERS__`, which
// the library sets before it loads a plugin (packages/dms/src/plugins/peers.js; dms-plugin-system.md P2 "plugins
// reach the host's React through a global"). Everything else the plugin imports is bundled. The library itself is
// not shared: the plugin API comes through `register(host)` and `host.contexts`.
//
// Vite and the peers are resolved from the host app's folder (`--host`, default the plugin's own folder upward), so a
// plugin builds against the app that hosts it (dms-template) with the app's exact React; the shims' named exports are
// that React's. A plugin folder that resolves some other copy first (another package's node_modules) needs --host.

export const PEERS = ['react', 'react-dom', 'react/jsx-runtime', 'react-router'];
const PEERS_GLOBAL = '__DMS_PLUGIN_PEERS__';
const IDENT = /^[A-Za-z_$][\w$]*$/;

/** The named exports of a peer as the host resolves it (from the plugin's folder). */
export function peerExportNames(dir, spec) {
  const req = createRequire(path.join(path.resolve(dir), 'package.json'));
  return Object.keys(req(spec)).filter(n => n !== 'default' && n !== '__esModule' && IDENT.test(n)).sort();
}

/** The shim module for a peer: its default and named exports, read from the host's global at load time. */
export function peerShim(spec, names) {
  return `const m = globalThis[${JSON.stringify(PEERS_GLOBAL)}]?.[${JSON.stringify(spec)}];\n`
    + `if (!m) throw new Error(${JSON.stringify(`DMS plugin: the host did not share "${spec}" (plugins/peers.js)`)});\n`
    + `export default (m.default ?? m);\n`
    // one const per name (not a destructuring), so the build drops the names a plugin doesn't use
    + names.map(n => `export const ${n} = m.${n};\n`).join('');
}

// imports of React or the router that are NOT shared would bundle a second copy: refused
const unsharedReact = (id) => /^(react|react-dom|react-router)(\/|$)/.test(id) && !PEERS.includes(id);

async function importFrom(dir, pkgName) {
  const req = createRequire(path.join(path.resolve(dir), 'package.json'));
  const pkgJson = req.resolve(`${pkgName}/package.json`);
  const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'));
  const exp = pkg.exports?.['.'];
  const rel = typeof exp === 'string' ? exp : (exp?.import?.default || exp?.import || exp?.default || pkg.module || pkg.main);
  return import(pathToFileURL(path.join(path.dirname(pkgJson), rel)).href);
}

export async function buildPlugin(dir, { quiet = true, host = null } = {}) {
  const root = path.resolve(dir);
  const from = host ? path.resolve(host) : root;
  const pkg = readPackage(root);
  const source = pkg.dms?.source;
  const out = pkg.dms?.entries?.client;
  if (typeof source !== 'string' || !safeRelative(source) || !existsSync(path.join(root, source))) {
    throw new Error('dms.source: the plugin\'s source entry (e.g. "plugin.jsx"), a file in the package');
  }
  if (typeof out !== 'string' || !safeRelative(out) || !/\.m?js$/.test(out)) {
    throw new Error('dms.entries.client: where the build writes the entry (e.g. "dist/plugin.js")');
  }
  const { build } = await importFrom(from, 'vite');
  let react = null;
  try { react = (await importFrom(from, '@vitejs/plugin-react')).default; } catch { /* JSX through esbuild */ }
  const shims = Object.fromEntries(PEERS.map(spec => [spec, peerShim(spec, peerExportNames(from, spec))]));
  const outDir = path.join(root, path.dirname(out));
  await build({
    configFile: false,
    root,
    logLevel: quiet ? 'warn' : 'info',
    publicDir: false,
    mode: 'production',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'dms-plugin-peers',
        enforce: 'pre',
        resolveId(id) {
          if (PEERS.includes(id)) return `\0dms-peer:${id}`;
          if (unsharedReact(id)) this.error(`"${id}" is not shared with plugins (only ${PEERS.join(', ')}): a plugin can't bundle its own React or router`);
          return null;
        },
        load(id) {
          return id.startsWith('\0dms-peer:') ? shims[id.slice('\0dms-peer:'.length)] : null;
        },
      },
      ...(react ? [react({ jsxRuntime: 'automatic' })] : []),
    ],
    esbuild: { jsx: 'automatic' },
    build: {
      outDir,
      emptyOutDir: false,
      minify: true,
      sourcemap: false,
      lib: { entry: path.join(root, source), formats: ['es'], fileName: () => path.basename(out) },
      // a peer's properties are plain values (no getters), so unused reads can go
      rollupOptions: { output: { inlineDynamicImports: true }, treeshake: { propertyReadSideEffects: false } },
    },
  });
  // the class names the plugin uses, for the per-site CSS (D5): its source files' Tailwind candidates
  let classes = null;
  const classesOut = pkg.dms?.entries?.classes;
  if (typeof classesOut === 'string' && safeRelative(classesOut)) {
    try {
      const oxideMod = await importFrom(from, '@tailwindcss/oxide');
      const oxide = oxideMod.default || oxideMod;
      const files = packageFiles(root, { files: [] }).filter(f => /\.(m?jsx?|tsx?)$/.test(f) && !f.startsWith(path.dirname(out) + '/'));
      const found = new Set();
      for (const f of files) {
        for (const c of new oxide.Scanner({ sources: [] }).scanFiles([{ content: readFileSync(path.join(root, f), 'utf8'), extension: path.extname(f).slice(1) }])) found.add(c);
      }
      classes = [...found].sort();
      writeFileSync(path.join(root, classesOut), classes.join('\n') + '\n');
    } catch (e) {
      if (!quiet) console.warn(`classes: not written (${e.message})`);
    }
  }
  const built = readFileSync(path.join(root, out));
  return { name: pluginName(pkg), version: pkg.version, entry: out, bytes: built.length, classes: classes ? classes.length : null };
}

export async function buildCmd(dir, options = {}) {
  try {
    const r = await buildPlugin(dir, { host: options.host });
    output({ ok: true, ...r }, options);
  } catch (e) {
    output({ ok: false, dir, error: e.message }, options);
    process.exitCode = 1;
  }
}
