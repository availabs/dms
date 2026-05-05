/**
 * Dataset commands.
 *
 * Sources are owned by a dmsEnv (the pattern's `data.dmsEnvId`
 * references a dmsEnv row whose `data.sources` list is authoritative).
 * Source rows are typed `{dmsEnvInstance}|{slug}:source`. Views are
 * `{sourceInstance}|{slug}:view`. Data rows live in split tables under
 * `{sourceInstance}|{viewId}:data` — the `:data` suffix is what
 * triggers split-table routing on the server.
 */

import {
  makeClient, fetchAll, fetchById, fetchByIds, resolvePattern, findPatternByKind,
  parseData,
} from '../utils/data.js';
import { sourceInstance, viewDataTypeFor } from '../utils/types.js';
import { output, outputError } from '../utils/output.js';

/**
 * Resolve the datasets/forms pattern (defaults to the first one if no flag).
 */
async function resolveDatasetPattern(falcor, config, patternFlag) {
  if (patternFlag) {
    return await resolvePattern(falcor, config, patternFlag);
  }
  return await findPatternByKind(falcor, config, ['datasets', 'forms']);
}

/**
 * Read the dmsEnv referenced by the pattern's `dmsEnvId` and return
 * its source rows.
 */
async function loadSourcesViaDmsEnv(falcor, config, pattern) {
  const d = parseData(pattern.data);
  const dmsEnvId = d.dmsEnvId;
  if (!dmsEnvId) {
    throw new Error(
      `Pattern '${d.name || pattern.id}' has no dmsEnvId — sources cannot be resolved.`
    );
  }

  const [envRow] = await fetchByIds(falcor, config.app, [dmsEnvId], [
    'id', 'app', 'type', 'data',
  ]);
  if (!envRow) throw new Error(`dmsEnv row ${dmsEnvId} not found`);

  const envData = parseData(envRow.data);
  const sourceIds = (envData.sources || [])
    .map((s) => (typeof s === 'object' ? s.id : s))
    .filter(Boolean);

  if (sourceIds.length === 0) {
    return { dmsEnv: envRow, sources: [] };
  }

  const sources = await fetchByIds(falcor, config.app, sourceIds, [
    'id', 'app', 'type', 'data',
  ]);
  return { dmsEnv: envRow, sources };
}

/**
 * Resolve a source by id or by data.name within the configured dmsEnv.
 */
async function resolveSource(falcor, config, sources, idOrName) {
  if (/^\d+$/.test(String(idOrName))) {
    const numId = parseInt(idOrName, 10);
    const match = sources.find((s) => parseInt(s.id, 10) === numId);
    if (!match) {
      // Fall back to a direct fetch in case the source isn't registered
      // on the dmsEnv we picked but the user knows the id.
      const fetched = await fetchById(falcor, config.app, numId, [
        'id', 'app', 'type', 'data',
      ]);
      if (!fetched) throw new Error(`Source not found: ${idOrName}`);
      return fetched;
    }
    return match;
  }

  const name = String(idOrName);
  const match = sources.find((s) => parseData(s.data).name === name);
  if (!match) throw new Error(`No dataset source found with name: ${name}`);
  return match;
}

/**
 * List dataset sources.
 */
export async function list(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolveDatasetPattern(falcor, config, options.pattern);
    const { dmsEnv, sources } = await loadSourcesViaDmsEnv(falcor, config, pattern);

    const result = sources.map((s) => {
      const d = parseData(s.data);
      return {
        id: s.id,
        type: s.type,
        data: {
          name: d.name || sourceInstance(s) || '(unnamed)',
          instance: sourceInstance(s),
          categories: d.categories || [],
          views_count: (d.views || []).length,
        },
      };
    });

    if (options.format === 'summary') {
      output(result, { ...options, mode: 'list' });
    } else {
      output({
        items: result,
        total: result.length,
        dmsEnv: { id: dmsEnv.id, type: dmsEnv.type },
      }, options);
    }
  } catch (error) {
    outputError(error);
  }
}

/**
 * Show source details.
 */
export async function show(idOrName, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolveDatasetPattern(falcor, config, options.pattern);
    const { sources } = await loadSourcesViaDmsEnv(falcor, config, pattern);
    const source = await resolveSource(falcor, config, sources, idOrName);

    const d = parseData(source.data);

    output({
      id: source.id,
      name: d.name || sourceInstance(source) || '(unnamed)',
      type: source.type,
      instance: sourceInstance(source),
      categories: d.categories || [],
      views: (d.views || []).length,
      metadata: d.metadata || {},
      created_at: source.created_at,
      updated_at: source.updated_at,
    }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * List views for a dataset source.
 */
export async function views(idOrName, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolveDatasetPattern(falcor, config, options.pattern);
    const { sources } = await loadSourcesViaDmsEnv(falcor, config, pattern);
    const source = await resolveSource(falcor, config, sources, idOrName);

    const d = parseData(source.data);
    const viewRefs = d.views || [];

    if (viewRefs.length === 0) {
      output([], { ...options, mode: 'list' });
      return;
    }

    const viewIds = viewRefs
      .map((v) => (typeof v === 'object' ? v.id : v))
      .filter(Boolean);

    const viewItems = await fetchByIds(falcor, config.app, viewIds, [
      'id', 'app', 'type', 'data',
    ]);

    const result = viewItems.map((v) => {
      const vd = parseData(v.data);
      return {
        id: v.id,
        type: v.type,
        data: {
          name: vd.name || '(unnamed)',
          view_type: vd.view_type || vd.type || '?',
        },
      };
    });

    if (options.format === 'summary') {
      output(result, { ...options, mode: 'list' });
    } else {
      output(result, options);
    }
  } catch (error) {
    outputError(error);
  }
}

/**
 * Pick the view ID to dump/query.
 *
 * Precedence: --view <id> > latest in source.data.views > first.
 * Returns null if the source has no views.
 */
function pickViewId(sourceRow, viewFlag) {
  if (viewFlag) return parseInt(viewFlag, 10);
  const sd = parseData(sourceRow.data);
  const refs = (sd.views || []).map((v) => (typeof v === 'object' ? v.id : v)).filter(Boolean);
  if (refs.length === 0) return null;
  // Most recent first — refs are usually appended in chronological order.
  return parseInt(refs[refs.length - 1], 10);
}

/**
 * Run a hydrating fetch through the `options` Falcor route. Split-table
 * rows aren't resolved by the bare `byIndex → ref → byId` path (the
 * server's getDataById only reads the per-app main table); the
 * `options` route inlines attribute values directly so it works for
 * both regular and split tables.
 *
 * @param {Object} falcor
 * @param {string} dataAppType  e.g. "asm+songs|1066384:data"
 * @param {Object} optionsObj   { filter, orderBy } — pass {} for "no filter"
 * @param {{limit, offset, attrs}} opts
 * @returns {Promise<{items, total, optionsObj}>}
 */
async function fetchRowsViaOptions(falcor, dataAppType, optionsObj, opts) {
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;
  const attrs = opts.attrs || ['id', 'data'];
  const optionsKey = JSON.stringify(optionsObj);

  await falcor.get(['dms', 'data', dataAppType, 'options', [optionsKey], 'length']);
  const cache = falcor.getCache();
  const lengthVal = cache?.dms?.data?.[dataAppType]?.options?.[optionsKey]?.length;
  const total = (lengthVal && lengthVal.$type === 'atom') ? lengthVal.value : (lengthVal || 0);

  if (total === 0) return { items: [], total, optionsObj };

  const from = offset;
  const to = Math.min(offset + limit - 1, total - 1);
  if (from > to) return { items: [], total, optionsObj };

  await falcor.get(['dms', 'data', dataAppType, 'options', [optionsKey], 'byIndex', { from, to }, attrs]);
  const updatedCache = falcor.getCache();
  const byIndex = updatedCache?.dms?.data?.[dataAppType]?.options?.[optionsKey]?.byIndex || {};

  const items = [];
  for (let i = from; i <= to; i++) {
    const entry = byIndex[i];
    if (!entry) continue;
    const row = {};
    for (const attr of attrs) {
      const val = entry[attr];
      row[attr] = (val && val.$type === 'atom') ? val.value : val;
    }
    if (row.id) {
      if ('data' in row) row.data = parseData(row.data);
      items.push(row);
    }
  }

  return { items, total, optionsObj };
}

/**
 * Dump data rows for a source view.
 */
export async function dump(sourceIdOrName, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolveDatasetPattern(falcor, config, options.pattern);
    const { sources } = await loadSourcesViaDmsEnv(falcor, config, pattern);
    const source = await resolveSource(falcor, config, sources, sourceIdOrName);

    const viewId = pickViewId(source, options.view);
    if (!viewId) {
      outputError(`Source ${source.id} has no views — nothing to dump.`);
      return;
    }

    const dataType = viewDataTypeFor(source, viewId);
    const dataAppType = `${config.app}+${dataType}`;

    const limit = parseInt(options.limit, 10) || 100;
    const offset = parseInt(options.offset, 10) || 0;

    const { items, total } = await fetchRowsViaOptions(
      falcor, dataAppType, {}, { limit, offset, attrs: ['id', 'data'] }
    );

    output({
      items,
      total,
      source_id: source.id,
      view_id: viewId,
      type: dataType,
    }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Query data rows with filters and ordering.
 */
export async function query(sourceIdOrName, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const pattern = await resolveDatasetPattern(falcor, config, options.pattern);
    const { sources } = await loadSourcesViaDmsEnv(falcor, config, pattern);
    const source = await resolveSource(falcor, config, sources, sourceIdOrName);

    const viewId = pickViewId(source, options.view);
    if (!viewId) {
      outputError(`Source ${source.id} has no views — nothing to query.`);
      return;
    }

    const dataType = viewDataTypeFor(source, viewId);
    const dataAppType = `${config.app}+${dataType}`;

    const limit = parseInt(options.limit, 10) || 100;
    const offset = parseInt(options.offset, 10) || 0;

    const filterObj = {};
    if (options.filter) {
      const filters = Array.isArray(options.filter) ? options.filter : [options.filter];
      for (const f of filters) {
        const eqIndex = f.indexOf('=');
        if (eqIndex === -1) {
          outputError(`Invalid --filter format: ${f}. Use col=val`);
          return;
        }
        const col = f.slice(0, eqIndex);
        const val = f.slice(eqIndex + 1);
        const key = `data->>'${col}'`;
        if (!filterObj[key]) filterObj[key] = [];
        filterObj[key].push(val);
      }
    }

    const orderBy = {};
    if (options.order) {
      const parts = options.order.split(':');
      const col = parts[0];
      const dir = (parts[1] || 'asc').toLowerCase();
      orderBy[`data->>'${col}'`] = dir;
    }

    const optionsObj = {};
    if (Object.keys(filterObj).length > 0) optionsObj.filter = filterObj;
    if (Object.keys(orderBy).length > 0) optionsObj.orderBy = orderBy;

    const { items, total } = await fetchRowsViaOptions(
      falcor, dataAppType, optionsObj, { limit, offset, attrs: ['id', 'data'] }
    );

    output({
      items,
      total,
      source_id: source.id,
      view_id: viewId,
      filter: optionsObj,
    }, options);
  } catch (error) {
    outputError(error);
  }
}

export default { list, show, views, dump, query };
