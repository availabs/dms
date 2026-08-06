/**
 * Raw data_items access commands.
 *
 * Low-level CRUD against any `{app}+{type}` pair. All `byId` paths are
 * scoped to `config.app` because dms-server runs in per-app split mode
 * (each app has its own table — `dms_{app}.data_items` on Postgres).
 */

import { merge, cloneDeep } from 'lodash-es';
import {
  makeClient, fetchById, fetchAll, parseData, parseSetPairs, readFileOrJson,
} from '../utils/data.js';
import { output, outputError } from '../utils/output.js';

const ATTRS = ['id', 'app', 'type', 'data', 'created_at', 'updated_at'];

/**
 * Get an item by ID (within the current `config.app`).
 */
export async function get(id, config, options = {}) {
  try {
    if (!config.app) {
      outputError('raw get requires --app (or DMS_APP / .dmsrc)');
      return;
    }

    const falcor = makeClient(config);
    const attrs = options.attrs
      ? options.attrs.split(',').map((a) => a.trim())
      : ATTRS;

    const item = await fetchById(falcor, config.app, id, attrs);
    if (!item) {
      outputError(`Item not found: ${id}`);
      return;
    }

    // Dataset (`:data`) rows live in per-type split tables, and the `byId` route
    // is app-namespaced only — with no type it cannot know which table to read,
    // so it returns a row of nulls rather than an error. Don't hand the caller
    // that silently: it reads as "the row exists but is empty", which is a
    // materially different and wrong conclusion. Point at the command that CAN
    // read them (`dataset query`, which goes through the UDA routes).
    if (Object.values(item).every((v) => v === null || v === undefined)) {
      outputError(
        `Row ${id} came back empty (every attribute null).\n`
        + `  Either it does not exist, or it is a dataset (\`:data\`) row — those live in per-type\n`
        + `  split tables that \`raw get\` cannot address (the byId route is app-namespaced, with no\n`
        + `  type to route on). For dataset rows use:\n`
        + `    dms dataset query <source-id-or-name> --view <view-id> --filter id=${id}`
      );
      return;
    }

    output(item, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * List items by `{app}+{type}` key.
 *
 * Accepts either the bare type (`nhomb:site`, `datasets|page`) — in
 * which case `config.app` is prepended — or the full `app+type` form.
 */
export async function list(appOrType, config, options = {}) {
  try {
    const appType = appOrType.includes('+') ? appOrType : `${config.app}+${appOrType}`;

    const falcor = makeClient(config);
    const limit = parseInt(options.limit, 10) || 20;
    const offset = parseInt(options.offset, 10) || 0;

    const { items, total } = await fetchAll(
      falcor, appType,
      ['id', 'app', 'type', 'data'],
      { limit, offset }
    );

    if (options.format === 'summary') {
      output(items, { ...options, mode: 'list' });
    } else {
      output({ items, total, offset, limit }, options);
    }
  } catch (error) {
    outputError(error);
  }
}

/**
 * Create a new item.
 */
export async function create(app, type, config, options = {}) {
  try {
    const falcor = makeClient(config);

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

    // Modern create response references the new row under `dms.data.{app}.byId`.
    const byApp = result?.json?.dms?.data?.[app]?.byId
      || result?.json?.dms?.data?.byId
      || {};
    const createdId = Object.keys(byApp)[0];

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
 * Update an item. `--set k=v` does a read-modify-write deep merge;
 * `--data` sends the JSON as-is for full replacement.
 */
export async function update(id, config, options = {}) {
  try {
    if (!config.app) {
      outputError('raw update requires --app (or DMS_APP / .dmsrc)');
      return;
    }

    const falcor = makeClient(config);

    let data = {};
    if (options.data) {
      try {
        data = await readFileOrJson(options.data);
      } catch (e) {
        outputError(`Invalid JSON data: ${e.message}`);
        return;
      }
    }

    if (options.set) {
      const setPairs = parseSetPairs(options.set);
      data = { ...data, ...setPairs };
    }

    if (Object.keys(data).length === 0) {
      outputError('No data to update. Use --data or --set');
      return;
    }

    const numId = parseInt(id, 10);

    if (options.set) {
      const current = await fetchById(falcor, config.app, numId, ['id', 'data']);
      const currentData = current ? parseData(current.data) : {};
      data = merge(cloneDeep(currentData), data);
    }

    // dms.data.edit resolves the split table for a dataset (`:data`-suffixed
    // type) row only when a 4th `type` arg is given (dms.controller.js's
    // setDataById: `if (type && app) { resolve split table } else { main table }`).
    // Without it, an update against a split row's id silently no-ops — the
    // main data_items table has no row with that id to match. --row-type lets
    // the caller supply that type (distinct from the global --type/site-type
    // flag, which is unrelated).
    const editArgs = options.rowType
      ? [config.app, numId, data, options.rowType]
      : [config.app, numId, data];
    await falcor.call(['dms', 'data', 'edit'], editArgs);

    output({ id: numId, updated: data, message: 'Item updated' }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Delete an item.
 */
export async function remove(app, type, id, config, options = {}) {
  try {
    const falcor = makeClient(config);
    await falcor.call(['dms', 'data', 'delete'], [app, type, parseInt(id, 10)]);
    output({ id: parseInt(id, 10), app, type, message: 'Item deleted' }, options);
  } catch (error) {
    outputError(error);
  }
}

export default { get, list, create, update, remove };
