/* global process */
/**
 * Format declarations: what the client's pattern registry says about the site's row kinds (auth
 * rules, permission vocabulary, childRefs, attributes), stored per site in dms-server's `formats`
 * table and read by its auth layer (dms-server/src/routes/auth/formats.js).
 *
 * Only dms-server's own `scripts/register-formats.js` writes that table — no client can, this CLI
 * included (owner, 2026-11-06). These commands READ it, to check what a site holds:
 *
 *     node packages/dms/scripts/emit-formats.mjs > formats.json     # the rows a build declares
 *     dms formats diff formats.json                                 # read-only: stored rows vs the file
 *     dms formats list                                              # the stored rows
 */

import { readFileSync } from 'fs';
import { output, outputError } from '../utils/output.js';

const canonical = (v) => JSON.stringify(v ?? null, (k, x) => (x && typeof x === 'object' && !Array.isArray(x))
  ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x);

function readRows(file) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const rows = Array.isArray(parsed) ? parsed : parsed && parsed.formats;
  if (!Array.isArray(rows)) throw new Error(`${file}: expected an array of { type, … } rows (scripts/emit-formats.mjs output)`);
  return rows;
}

async function call(config, method) {
  const url = `${config.host}/dms/formats?dms_app=${encodeURIComponent(config.app)}`;
  const res = await fetch(url, { method, headers: { Accept: 'application/json' } });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(`${method} /dms/formats → ${res.status}: ${data.error || res.statusText}`);
  return data;
}

/** The site's stored rows. */
export async function list(config, options = {}) {
  try {
    const { formats } = await call(config, 'GET');
    if (options.format === 'summary') {
      output(formats.map(r => ({ id: r.type, type: 'format', data: {
        attributes: r.attributes ? r.attributes.length : 0, rules: Object.keys(r.authRules || {}).join(',') || '-',
        vocabulary: r.authVocabulary ? Object.keys(r.authVocabulary).join(',') : '-', childRefs: r.childRefs ? Object.keys(r.childRefs).join(',') : '-',
      } })), { ...options, mode: 'list' });
    } else {
      output({ app: config.app, formats, total: formats.length }, options);
    }
  } catch (error) {
    outputError(error);
  }
}

/** Read-only: how the site's stored rows differ from a file's. Exit code 1 when they do. */
export async function diff(file, config, options = {}) {
  try {
    const want = new Map(readRows(file).map(r => [r.type, r]));
    const { formats } = await call(config, 'GET');
    const have = new Map(formats.map(r => [r.type, r]));
    const keys = ['attributes', 'authVocabulary', 'authRules', 'childRefs'];
    const changed = [], missing = [], extra = [];
    for (const [type, w] of want) {
      const h = have.get(type);
      if (!h) { missing.push(type); continue; }
      const fields = keys.filter(k => canonical(h[k]) !== canonical(w[k]));
      if (fields.length) changed.push({ type, fields });
    }
    for (const type of have.keys()) if (!want.has(type)) extra.push(type);
    const same = want.size - missing.length - changed.length;
    output({ app: config.app, same, changed, missing, extra, clean: !changed.length && !missing.length && !extra.length }, options);
    if (changed.length || missing.length || extra.length) process.exitCode = 1;
  } catch (error) {
    outputError(error);
  }
}
