/**
 * Pattern commands
 *
 * List, show, and dump patterns for a site.
 */

import { makeClient, fetchAll, fetchById, parseData } from '../utils/data.js';
import { output, outputError } from '../utils/output.js';

const PATTERN_ATTRS = ['id', 'app', 'type', 'data'];

/**
 * Resolve a pattern by name or numeric ID
 */
async function resolvePattern(falcor, patternType, nameOrId) {
  if (/^\d+$/.test(String(nameOrId))) {
    const item = await fetchById(falcor, nameOrId, PATTERN_ATTRS);
    if (!item) throw new Error(`Pattern not found: ${nameOrId}`);
    return item;
  }

  // Search by name
  const { items } = await fetchAll(falcor, patternType, PATTERN_ATTRS);
  const match = items.find(p => {
    const d = parseData(p.data);
    return d.name === nameOrId;
  });

  if (!match) throw new Error(`Pattern not found: ${nameOrId}`);
  return match;
}

/**
 * List all patterns
 */
export async function list(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const patternType = `${config.app}+${config.type}|pattern`;

    const { items, total } = await fetchAll(falcor, patternType, PATTERN_ATTRS);

    const result = items.map(p => {
      const d = parseData(p.data);
      return {
        id: p.id,
        name: d.name || '(unnamed)',
        pattern_type: d.pattern_type || '?',
        base_url: d.base_url || '/',
        subdomain: d.subdomain || '*',
      };
    });

    if (options.format === 'summary') {
      output(result, { ...options, mode: 'list' });
    } else {
      output({ items: result, total }, options);
    }
  } catch (error) {
    outputError(error);
  }
}

/**
 * Show pattern details
 */
export async function show(nameOrId, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const patternType = `${config.app}+${config.type}|pattern`;

    const pattern = await resolvePattern(falcor, patternType, nameOrId);
    const d = parseData(pattern.data);

    const result = {
      id: pattern.id,
      name: d.name || '(unnamed)',
      pattern_type: d.pattern_type || '?',
      base_url: d.base_url || '/',
      subdomain: d.subdomain || '*',
      doc_type: d.doc_type || (d.base_url || '').replace(/\//g, ''),
      authPermissions: d.authPermissions || null,
    };

    output(result, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Dump full pattern data as JSON
 */
export async function dump(nameOrId, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const patternType = `${config.app}+${config.type}|pattern`;

    const pattern = await resolvePattern(falcor, patternType, nameOrId);
    pattern.data = parseData(pattern.data);

    output(pattern, options);
  } catch (error) {
    outputError(error);
  }
}

export default { list, show, dump };
