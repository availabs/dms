/**
 * Shared Falcor data helpers for content-aware commands.
 *
 * The CLI talks to dms-server via Falcor over `POST /graph`. Modern
 * dms-server runs in per-app split mode — every `data_items` row lives
 * in `dms_{app}.data_items` (Postgres) or `data_items__{app}` (SQLite),
 * and the Falcor cache is namespaced as `dms.data.{app}.byId.{id}`.
 *
 * All `byId` fetches in this file route through the app-namespaced path.
 * The CLI takes `--app` (or `DMS_APP` / `.dmsrc`); commands pass it down
 * via `config.app` so each helper can build the correct cache path.
 *
 * Type resolution lives in `./types.js`. This file is purely
 * cache-extraction + Falcor-call boilerplate.
 */

import { createFalcorClient } from '../client.js';
import { readFileSync, existsSync } from 'fs';
import { siteTypeFor } from './types.js';

/**
 * Unwrap a Falcor cache value ($atom, $ref, or plain).
 */
export function unwrapAtom(val) {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  if (val.$type === 'atom') return val.value;
  if (val.$type === 'ref') return val;
  return val;
}

/**
 * Parse the `data` column. The server returns it as either a parsed
 * object (Postgres jsonb auto-parses) or a JSON string (older code path).
 */
export function parseData(data) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data || {};
}

/**
 * Extract one item from the cache by ID, scoped to an app namespace.
 */
export function extractItem(cache, id, attrs, app) {
  const item = cache?.dms?.data?.[app]?.byId?.[id];
  if (!item || (item.$type === 'atom' && item.value === null)) return null;

  const result = {};
  for (const attr of attrs) {
    result[attr] = unwrapAtom(item[attr]);
  }
  return result;
}

/**
 * Extract items from cache `byIndex`, following `$ref` pointers into
 * `dms.data.{app}.byId.{id}`. Refs always carry the app segment in
 * modern split-mode databases — we trust that and read it from the ref.
 */
export function extractList(cache, appType, from, to, attrs) {
  const byIndex = cache?.dms?.data?.[appType]?.byIndex || {};
  const items = [];

  for (let i = from; i <= to; i++) {
    const ref = byIndex[i];
    if (ref && ref.$type === 'ref') {
      // ref.value is ['dms', 'data', app, 'byId', id]
      const refApp = ref.value[2];
      const itemId = ref.value[ref.value.length - 1];
      const item = extractItem(cache, itemId, attrs, refApp);
      if (item) items.push(item);
    }
  }

  return items;
}

/**
 * Get length from cache for an appType key (`{app}+{type}`).
 */
export function extractLength(cache, appType) {
  const val = cache?.dms?.data?.[appType]?.length;
  return unwrapAtom(val) || 0;
}

/**
 * Fetch all items for an `{app}+{type}` key. The key is the global
 * cache name (`asm+nhomb:site`, `asm+datasets|page`, …). Refs from
 * the byIndex carry the app for byId resolution.
 *
 * @param {Object} falcor
 * @param {string} appType  e.g. "asm+datasets|page"
 * @param {string[]} attrs
 * @param {Object} [opts]   { limit, offset }
 */
export async function fetchAll(falcor, appType, attrs, opts = {}) {
  const limit = opts.limit || 100;
  const offset = opts.offset || 0;

  await falcor.get(['dms', 'data', appType, 'length']);
  const cache = falcor.getCache();
  const total = extractLength(cache, appType);

  if (total === 0) return { items: [], total: 0 };

  const from = offset;
  const to = Math.min(offset + limit - 1, total - 1);
  if (from > to) return { items: [], total };

  await falcor.get(['dms', 'data', appType, 'byIndex', { from, to }, attrs]);
  const items = extractList(falcor.getCache(), appType, from, to, attrs);
  return { items, total };
}

/**
 * Fetch a single item by ID under the given app.
 *
 * @param {Object} falcor
 * @param {string} app
 * @param {number|string} id
 * @param {string[]} attrs
 */
export async function fetchById(falcor, app, id, attrs) {
  if (!app) throw new Error('fetchById requires an app');
  const numId = parseInt(id, 10);
  await falcor.get(['dms', 'data', app, 'byId', numId, attrs]);
  return extractItem(falcor.getCache(), numId, attrs, app);
}

/**
 * Batch fetch items by IDs under the given app. Falcor handles the
 * array path key — one round-trip per call.
 */
export async function fetchByIds(falcor, app, ids, attrs) {
  if (!app) throw new Error('fetchByIds requires an app');
  if (!ids || ids.length === 0) return [];

  const numIds = ids.map((id) => parseInt(id, 10));
  await falcor.get(['dms', 'data', app, 'byId', numIds, attrs]);
  const cache = falcor.getCache();

  return numIds.map((id) => extractItem(cache, id, attrs, app)).filter(Boolean);
}

/**
 * Resolve an ID-or-slug to a numeric ID via `searchOne` on `data->>'url_slug'`.
 * Numeric strings are returned as integers without a server round-trip.
 *
 * `appType` is the global Falcor key under which `searchOne` is registered
 * (e.g. `asm+datasets|page`).
 */
export async function resolveIdOrSlug(falcor, appType, idOrSlug) {
  if (/^\d+$/.test(String(idOrSlug))) {
    return parseInt(idOrSlug, 10);
  }

  const slug = String(idOrSlug);
  const searchFilter = JSON.stringify({
    wildKey: "data ->> 'url_slug'",
    params: slug,
  });

  await falcor.get(['dms', 'data', appType, 'searchOne', [searchFilter], ['id']]);

  const cache = falcor.getCache();
  const searchResult = cache?.dms?.data?.[appType]?.searchOne?.[searchFilter];

  if (!searchResult) {
    throw new Error(`No item found with slug: ${slug}`);
  }

  if (searchResult.$type === 'ref') {
    return searchResult.value[searchResult.value.length - 1];
  }

  const idVal = searchResult?.id;
  if (idVal) return unwrapAtom(idVal);

  throw new Error(`No item found with slug: ${slug}`);
}

/**
 * Resolve a pattern row by name or numeric ID.
 *
 * Patterns under a site `{app}+{siteType}` are stored as type
 * `{siteInstance}|{patternInstance}:pattern`. The Falcor key for the
 * full pattern list is `{app}+{siteInstance}|%:pattern` — but the
 * server doesn't expose a wildcard list under that key. Instead we
 * fetch the site row and follow its `data.patterns` refs (always
 * present and authoritative on modern data).
 *
 * The returned row carries the actual `type` column; downstream callers
 * use `patternInstance(row)`, `pageTypeFor(row)`, etc.
 *
 * @param {Object} falcor
 * @param {Object} config         { app, type }
 * @param {string} [nameOrId]     Pattern name (matches data.name) or numeric id
 * @returns {Promise<Object>} the pattern row { id, app, type, data }
 */
export async function resolvePattern(falcor, config, nameOrId) {
  if (!config?.app) throw new Error('resolvePattern requires config.app');

  const siteType = siteTypeFor(config.type);
  const siteAppType = `${config.app}+${siteType}`;

  const { items } = await fetchAll(falcor, siteAppType, ['id', 'data'], { limit: 1 });
  if (items.length === 0) {
    throw new Error(`No site found for ${siteAppType}`);
  }

  const siteData = parseData(items[0].data);
  const patternRefs = siteData.patterns || [];
  const patternIds = patternRefs
    .map((ref) => (typeof ref === 'object' ? ref.id : ref))
    .filter(Boolean)
    .map((id) => parseInt(id, 10));

  const patterns = await fetchByIds(falcor, config.app, patternIds, [
    'id', 'app', 'type', 'data',
  ]);

  if (!nameOrId) {
    return patterns;
  }

  if (/^\d+$/.test(String(nameOrId))) {
    const numId = parseInt(nameOrId, 10);
    const match = patterns.find((p) => parseInt(p.id, 10) === numId);
    if (!match) throw new Error(`Pattern not found: ${nameOrId}`);
    return match;
  }

  const match = patterns.find((p) => parseData(p.data).name === nameOrId);
  if (!match) throw new Error(`Pattern not found: ${nameOrId}`);
  return match;
}

/**
 * Pick a pattern by `pattern_type` filter (e.g. `'page'`, `'datasets'`,
 * `'forms'`). Used by commands that want to default to "the page
 * pattern" / "the datasets pattern" when the user didn't pass --pattern.
 */
export async function findPatternByKind(falcor, config, kinds) {
  const wanted = Array.isArray(kinds) ? kinds : [kinds];
  const all = await resolvePattern(falcor, config);
  const match = all.find((p) => wanted.includes(parseData(p.data).pattern_type));
  if (!match) {
    throw new Error(
      `No pattern of type ${wanted.join('/')} found. Use --pattern to specify one.`
    );
  }
  return match;
}

/**
 * Convenience: build a Falcor client from CLI config.
 */
export function makeClient(config) {
  return createFalcorClient(config.host, config.authToken);
}

/**
 * Read all data from stdin.
 */
export function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * Read input as JSON — from file path, stdin (`-`), or inline JSON string.
 */
export async function readFileOrJson(input) {
  if (input === '-') {
    const text = await readStdin();
    return JSON.parse(text);
  }

  if (existsSync(input)) {
    const text = readFileSync(input, 'utf-8');
    return JSON.parse(text);
  }

  return JSON.parse(input);
}

/**
 * Parse `--set key=value` pairs (repeatable) into a nested object.
 * Dot-notation in keys → nested keys.
 */
export function parseSetPairs(setPairs) {
  if (!setPairs) return {};
  const pairs = Array.isArray(setPairs) ? setPairs : [setPairs];
  const data = {};

  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(`Invalid --set format: ${pair}. Use key=value`);
    }
    const key = pair.slice(0, eqIndex);
    let value = pair.slice(eqIndex + 1);

    try { value = JSON.parse(value); } catch {}

    const keys = key.split('.');
    let current = data;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }

  return data;
}
