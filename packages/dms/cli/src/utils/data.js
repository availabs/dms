/**
 * Shared Falcor data helpers for content-aware commands
 *
 * Extracts repeated cache-extraction boilerplate into reusable functions.
 */

import { createFalcorClient } from '../client.js';
import { readFileSync, existsSync } from 'fs';

/**
 * Unwrap a Falcor cache value ($atom, $ref, or plain)
 */
export function unwrapAtom(val) {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  if (val.$type === 'atom') return val.value;
  if (val.$type === 'ref') return val;
  return val;
}

/**
 * Parse the data column (string → object)
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
 * Extract one item from cache by ID
 */
export function extractItem(cache, id, attrs) {
  const item = cache?.dms?.data?.byId?.[id];
  if (!item || (item.$type === 'atom' && item.value === null)) return null;

  const result = {};
  for (const attr of attrs) {
    result[attr] = unwrapAtom(item[attr]);
  }
  return result;
}

/**
 * Extract items from cache byIndex, following $ref pointers
 */
export function extractList(cache, appType, from, to, attrs) {
  const byIndex = cache?.dms?.data?.[appType]?.byIndex || {};
  const items = [];

  for (let i = from; i <= to; i++) {
    const ref = byIndex[i];
    if (ref && ref.$type === 'ref') {
      const itemId = ref.value[3]; // ['dms', 'data', 'byId', id]
      const item = extractItem(cache, itemId, attrs);
      if (item) items.push(item);
    }
  }

  return items;
}

/**
 * Get length from cache for an appType
 */
export function extractLength(cache, appType) {
  const val = cache?.dms?.data?.[appType]?.length;
  return unwrapAtom(val) || 0;
}

/**
 * Fetch all items for an appType
 *
 * @param {Object} falcor - Falcor client
 * @param {string} appType - e.g. "asm+nhomb|pattern"
 * @param {string[]} attrs - Attributes to fetch
 * @param {Object} opts - { limit, offset }
 * @returns {{ items: Object[], total: number }}
 */
export async function fetchAll(falcor, appType, attrs, opts = {}) {
  const limit = opts.limit || 100;
  const offset = opts.offset || 0;

  // Get length
  await falcor.get(['dms', 'data', appType, 'length']);
  const cache = falcor.getCache();
  const total = extractLength(cache, appType);

  if (total === 0) return { items: [], total: 0 };

  const from = offset;
  const to = Math.min(offset + limit - 1, total - 1);

  if (from > to) return { items: [], total };

  // Fetch items by index
  await falcor.get(['dms', 'data', appType, 'byIndex', { from, to }, attrs]);
  const updatedCache = falcor.getCache();

  const items = extractList(updatedCache, appType, from, to, attrs);

  return { items, total };
}

/**
 * Fetch a single item by ID
 */
export async function fetchById(falcor, id, attrs) {
  const numId = parseInt(id, 10);
  await falcor.get(['dms', 'data', 'byId', numId, attrs]);
  const cache = falcor.getCache();
  return extractItem(cache, numId, attrs);
}

/**
 * Batch fetch items by IDs
 */
export async function fetchByIds(falcor, ids, attrs) {
  if (!ids || ids.length === 0) return [];

  const numIds = ids.map(id => parseInt(id, 10));

  // Fetch all at once — Falcor handles arrays in path keys
  await falcor.get(['dms', 'data', 'byId', numIds, attrs]);
  const cache = falcor.getCache();

  return numIds
    .map(id => extractItem(cache, id, attrs))
    .filter(Boolean);
}

/**
 * Resolve an ID-or-slug to a numeric ID
 *
 * If numeric → return as-is. If string → search by url_slug.
 */
export async function resolveIdOrSlug(falcor, appType, idOrSlug) {
  if (/^\d+$/.test(String(idOrSlug))) {
    return parseInt(idOrSlug, 10);
  }

  // Search by url_slug
  const slug = String(idOrSlug);
  const searchFilter = JSON.stringify({
    wildKey: "data ->> 'url_slug'",
    params: slug,
  });

  await falcor.get(
    ['dms', 'data', appType, 'searchOne', [searchFilter], ['id']]
  );

  const cache = falcor.getCache();
  const searchResult = cache?.dms?.data?.[appType]?.searchOne?.[searchFilter];

  if (!searchResult) {
    throw new Error(`No item found with slug: ${slug}`);
  }

  // searchOne returns a $ref to the item
  if (searchResult.$type === 'ref') {
    return searchResult.value[3]; // ['dms', 'data', 'byId', id]
  }

  // Or it may have an id attribute
  const idVal = searchResult?.id;
  if (idVal) {
    return unwrapAtom(idVal);
  }

  throw new Error(`No item found with slug: ${slug}`);
}

/**
 * Resolve the doc_type (page type) from a pattern
 *
 * @param {Object} falcor - Falcor client
 * @param {Object} config - { app, type }
 * @param {string} [patternNameOrId] - Specific pattern to look up
 * @returns {string} - The doc_type string
 */
export async function getPageType(falcor, config, patternNameOrId) {
  const patternType = `${config.app}+${config.type}|pattern`;
  const attrs = ['id', 'data'];

  if (patternNameOrId) {
    // Resolve specific pattern
    if (/^\d+$/.test(String(patternNameOrId))) {
      const pattern = await fetchById(falcor, patternNameOrId, attrs);
      if (!pattern) throw new Error(`Pattern not found: ${patternNameOrId}`);
      const data = parseData(pattern.data);
      return data.doc_type || (data.base_url || '').replace(/\//g, '');
    }

    // Search by name
    const { items } = await fetchAll(falcor, patternType, attrs);
    const match = items.find(p => {
      const d = parseData(p.data);
      return d.name === patternNameOrId;
    });
    if (!match) throw new Error(`Pattern not found: ${patternNameOrId}`);
    const data = parseData(match.data);
    return data.doc_type || (data.base_url || '').replace(/\//g, '');
  }

  // Auto-detect: find first pattern with pattern_type === 'page'
  const { items } = await fetchAll(falcor, patternType, attrs);
  const pagePattern = items.find(p => {
    const d = parseData(p.data);
    return d.pattern_type === 'page';
  });

  if (!pagePattern) {
    throw new Error('No page pattern found. Use --pattern to specify one.');
  }

  const data = parseData(pagePattern.data);
  return data.doc_type || (data.base_url || '').replace(/\//g, '');
}

/**
 * Build a Falcor client from config (convenience)
 */
export function makeClient(config) {
  return createFalcorClient(config.host, config.authToken);
}

/**
 * Resolve the dataset type from a pattern
 *
 * Finds the first pattern with pattern_type === 'datasets' or 'forms',
 * then constructs source and view type strings.
 *
 * @param {Object} falcor - Falcor client
 * @param {Object} config - { app, type }
 * @param {string} [patternNameOrId] - Specific pattern to look up
 * @returns {{ docType: string, sourceType: string, viewType: string }}
 */
export async function getDatasetType(falcor, config, patternNameOrId) {
  const patternType = `${config.app}+${config.type}|pattern`;
  const attrs = ['id', 'data'];

  let data;

  if (patternNameOrId) {
    if (/^\d+$/.test(String(patternNameOrId))) {
      const pattern = await fetchById(falcor, patternNameOrId, attrs);
      if (!pattern) throw new Error(`Pattern not found: ${patternNameOrId}`);
      data = parseData(pattern.data);
    } else {
      const { items } = await fetchAll(falcor, patternType, attrs);
      const match = items.find(p => {
        const d = parseData(p.data);
        return d.name === patternNameOrId;
      });
      if (!match) throw new Error(`Pattern not found: ${patternNameOrId}`);
      data = parseData(match.data);
    }
  } else {
    const { items } = await fetchAll(falcor, patternType, attrs);
    const dsPattern = items.find(p => {
      const d = parseData(p.data);
      return d.pattern_type === 'datasets' || d.pattern_type === 'forms';
    });

    if (!dsPattern) {
      throw new Error('No datasets/forms pattern found. Use --pattern to specify one.');
    }

    data = parseData(dsPattern.data);
  }

  const docType = data.doc_type || (data.base_url || '').replace(/\//g, '');

  return {
    docType,
    sourceType: `${docType}|source`,
    viewType: `${docType}|source|view`,
  };
}

/**
 * Read all data from stdin
 * @returns {Promise<string>}
 */
export function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * Read input as JSON — from file path, stdin ('-'), or inline JSON string
 *
 * @param {string} input - File path, '-' for stdin, or inline JSON
 * @returns {Promise<Object>} Parsed JSON object
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
 * Parse --set key=value pairs into a data object
 * Supports dot-notation for nested keys.
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

    // Try to parse as JSON, otherwise treat as string
    try { value = JSON.parse(value); } catch {}

    // Support nested keys with dot notation
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
