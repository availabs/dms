/**
 * Pattern commands.
 *
 * Patterns belong to a site and are reached by following the site
 * row's `data.patterns` refs (see `resolvePattern` in utils/data.js).
 * The pattern's own `type` column carries the slug we need for
 * downstream type assembly — never read `data.doc_type`.
 */

import { makeClient, parseData, resolvePattern } from '../utils/data.js';
import { patternInstance } from '../utils/types.js';
import { output, outputError } from '../utils/output.js';

/**
 * List all patterns under the configured site.
 */
export async function list(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const patternRows = await resolvePattern(falcor, config);

    const result = patternRows.map((p) => {
      const d = parseData(p.data);
      return {
        id: p.id,
        type: p.type,
        data: {
          name: d.name || patternInstance(p) || '(unnamed)',
          pattern_type: d.pattern_type || '?',
          base_url: d.base_url || '/',
          subdomain: d.subdomain || '*',
          dmsEnvId: d.dmsEnvId || null,
        },
      };
    });

    if (options.format === 'summary') {
      output(result, { ...options, mode: 'list' });
    } else {
      output({ items: result, total: result.length }, options);
    }
  } catch (error) {
    outputError(error);
  }
}

/**
 * Show pattern details (resolved by name or id).
 */
export async function show(nameOrId, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolvePattern(falcor, config, nameOrId);
    const d = parseData(pattern.data);

    output({
      id: pattern.id,
      name: d.name || patternInstance(pattern) || '(unnamed)',
      type: pattern.type,
      instance: patternInstance(pattern),
      pattern_type: d.pattern_type || '?',
      base_url: d.base_url || '/',
      subdomain: d.subdomain || '*',
      dmsEnvId: d.dmsEnvId || null,
      authPermissions: d.authPermissions || null,
    }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Dump the full pattern row.
 */
export async function dump(nameOrId, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolvePattern(falcor, config, nameOrId);
    pattern.data = parseData(pattern.data);
    output(pattern, options);
  } catch (error) {
    outputError(error);
  }
}

export default { list, show, dump };
