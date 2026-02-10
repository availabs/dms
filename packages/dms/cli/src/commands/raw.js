/**
 * Raw data_items access commands
 *
 * Low-level CRUD operations on the data_items table.
 * These work with any app+type combination.
 */

import { merge, cloneDeep } from 'lodash-es';
import { createFalcorClient } from '../client.js';
import { readFileOrJson, fetchById, parseData } from '../utils/data.js';
import { output, outputError } from '../utils/output.js';

/**
 * Get an item by ID
 *
 * @param {string} id - Item ID
 * @param {Object} config - CLI configuration
 * @param {Object} options - Command options
 */
export async function get(id, config, options = {}) {
  try {
    const falcor = createFalcorClient(config.host, config.authToken);

    const attrs = options.attrs
      ? options.attrs.split(',').map(a => a.trim())
      : ['id', 'app', 'type', 'data', 'created_at', 'updated_at'];

    const path = ['dms', 'data', 'byId', parseInt(id, 10), attrs];

    await falcor.get(path);
    const cache = falcor.getCache();

    const item = cache?.dms?.data?.byId?.[id];

    if (!item || item.$type === 'atom' && item.value === null) {
      outputError(`Item not found: ${id}`);
      return;
    }

    // Extract values from cache format
    const result = {};
    for (const attr of attrs) {
      const val = item[attr];
      result[attr] = val?.$type === 'atom' ? val.value : val;
    }

    output(result, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * List items by app+type
 *
 * @param {string} appType - App+type string (e.g., "avail-dms+docs-page")
 * @param {Object} config - CLI configuration
 * @param {Object} options - Command options
 */
export async function list(appType, config, options = {}) {
  try {
    const falcor = createFalcorClient(config.host, config.authToken);

    const limit = parseInt(options.limit, 10) || 20;
    const offset = parseInt(options.offset, 10) || 0;

    // First get the length
    const lengthPath = ['dms', 'data', appType, 'length'];
    await falcor.get(lengthPath);
    const cache = falcor.getCache();

    const lengthVal = cache?.dms?.data?.[appType]?.length;
    const length = lengthVal?.$type === 'atom' ? lengthVal.value : (lengthVal || 0);

    if (length === 0) {
      output([], { ...options, mode: 'list' });
      return;
    }

    // Calculate range
    const from = offset;
    const to = Math.min(offset + limit - 1, length - 1);

    if (from > to) {
      output([], { ...options, mode: 'list' });
      return;
    }

    // Fetch items by index
    const attrs = ['id', 'app', 'type', 'data'];
    const indexPath = ['dms', 'data', appType, 'byIndex', { from, to }, attrs];

    await falcor.get(indexPath);
    const updatedCache = falcor.getCache();

    // Extract items from cache
    const items = [];
    const byIndex = updatedCache?.dms?.data?.[appType]?.byIndex || {};

    for (let i = from; i <= to; i++) {
      const ref = byIndex[i];
      if (ref && ref.$type === 'ref') {
        const itemId = ref.value[3]; // ['dms', 'data', 'byId', id]
        const item = updatedCache?.dms?.data?.byId?.[itemId];

        if (item) {
          const result = {};
          for (const attr of attrs) {
            const val = item[attr];
            result[attr] = val?.$type === 'atom' ? val.value : val;
          }
          items.push(result);
        }
      }
    }

    // Add metadata
    const result = {
      items,
      total: length,
      offset,
      limit,
    };

    if (options.format === 'summary') {
      output(items, { ...options, mode: 'list' });
    } else {
      output(result, options);
    }
  } catch (error) {
    outputError(error);
  }
}

/**
 * Create a new item
 *
 * @param {string} app - App namespace
 * @param {string} type - Type identifier
 * @param {Object} config - CLI configuration
 * @param {Object} options - Command options
 */
export async function create(app, type, config, options = {}) {
  try {
    const falcor = createFalcorClient(config.host, config.authToken);

    let data = {};

    if (options.data) {
      try {
        data = JSON.parse(options.data);
      } catch (e) {
        outputError(`Invalid JSON data: ${e.message}`);
        return;
      }
    }

    const result = await falcor.call(['dms', 'data', 'create'], [app, type, data]);

    // Extract the created item ID from the response
    const byId = result?.json?.dms?.data?.byId || {};
    const createdId = Object.keys(byId)[0];

    if (createdId) {
      output({ id: parseInt(createdId, 10), app, type, data, message: 'Item created' }, options);
    } else {
      output({ message: 'Item created', response: result.json }, options);
    }
  } catch (error) {
    outputError(error);
  }
}

/**
 * Update an item
 *
 * @param {string} id - Item ID
 * @param {Object} config - CLI configuration
 * @param {Object} options - Command options
 */
export async function update(id, config, options = {}) {
  try {
    const falcor = createFalcorClient(config.host, config.authToken);

    let data = {};

    // Handle --data option (full JSON, file path, or stdin)
    if (options.data) {
      try {
        data = await readFileOrJson(options.data);
      } catch (e) {
        outputError(`Invalid JSON data: ${e.message}`);
        return;
      }
    }

    // Handle --set option (key=value pairs)
    if (options.set) {
      const pairs = Array.isArray(options.set) ? options.set : [options.set];
      for (const pair of pairs) {
        const eqIndex = pair.indexOf('=');
        if (eqIndex === -1) {
          outputError(`Invalid --set format: ${pair}. Use key=value`);
          return;
        }
        const key = pair.slice(0, eqIndex);
        let value = pair.slice(eqIndex + 1);

        // Try to parse as JSON, otherwise treat as string
        try {
          value = JSON.parse(value);
        } catch (e) {
          // Keep as string
        }

        // Support nested keys with dot notation
        const keys = key.split('.');
        let current = data;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!current[keys[i]]) current[keys[i]] = {};
          current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
      }
    }

    if (Object.keys(data).length === 0) {
      outputError('No data to update. Use --data or --set');
      return;
    }

    const numId = parseInt(id, 10);

    // When --set is used, do read-modify-write: fetch current data, deep-merge
    // client-side, send complete result. This avoids the server's shallow merge
    // which replaces entire nested objects when you set a deep path.
    // When only --data is used, send as-is (for full replacements/restores).
    if (options.set) {
      const current = await fetchById(falcor, numId, ['id', 'data']);
      const currentData = current ? parseData(current.data) : {};
      data = merge(cloneDeep(currentData), data);
    }

    await falcor.call(['dms', 'data', 'edit'], [numId, data]);

    output({ id: numId, updated: options.set ? Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith('_'))) : data, message: 'Item updated' }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Delete an item
 *
 * @param {string} app - App namespace
 * @param {string} type - Type identifier
 * @param {string} id - Item ID
 * @param {Object} config - CLI configuration
 * @param {Object} options - Command options
 */
export async function remove(app, type, id, config, options = {}) {
  try {
    const falcor = createFalcorClient(config.host, config.authToken);

    await falcor.call(['dms', 'data', 'delete'], [app, type, parseInt(id, 10)]);

    output({ id: parseInt(id, 10), app, type, message: 'Item deleted' }, options);
  } catch (error) {
    outputError(error);
  }
}

export default { get, list, create, update, remove };
