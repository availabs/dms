/**
 * Dataset commands
 *
 * List, show, views, dump, and query dataset sources.
 */

import {
  makeClient, fetchAll, fetchById, fetchByIds,
  getDatasetType, parseData,
  extractList, extractLength,
} from '../utils/data.js';
import { output, outputError } from '../utils/output.js';

/**
 * Resolve a dataset source by ID or name
 *
 * Numeric → ID lookup, string → search by data->>'name'.
 */
async function resolveSource(falcor, sourceType, idOrName) {
  const appSourceType = sourceType;

  if (/^\d+$/.test(String(idOrName))) {
    return parseInt(idOrName, 10);
  }

  // Search by name
  const name = String(idOrName);
  const searchFilter = JSON.stringify({
    wildKey: "data ->> 'name'",
    params: name,
  });

  await falcor.get(
    ['dms', 'data', appSourceType, 'searchOne', [searchFilter], ['id']]
  );

  const cache = falcor.getCache();
  const searchResult = cache?.dms?.data?.[appSourceType]?.searchOne?.[searchFilter];

  if (!searchResult) {
    throw new Error(`No dataset source found with name: ${name}`);
  }

  if (searchResult.$type === 'ref') {
    return searchResult.value[3];
  }

  const idVal = searchResult?.id;
  if (idVal) {
    return typeof idVal === 'object' && idVal.$type === 'atom' ? idVal.value : idVal;
  }

  throw new Error(`No dataset source found with name: ${name}`);
}

/**
 * List dataset sources
 */
export async function list(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const { docType, sourceType } = await getDatasetType(falcor, config, options.pattern);
    const appSourceType = `${config.app}+${sourceType}`;

    const limit = parseInt(options.limit, 10) || 50;
    const offset = parseInt(options.offset, 10) || 0;

    const { items, total } = await fetchAll(
      falcor, appSourceType,
      ['id', 'app', 'type', 'data'],
      { limit, offset }
    );

    const sources = items.map(s => {
      const d = parseData(s.data);
      return {
        id: s.id,
        name: d.name || '(unnamed)',
        doc_type: d.doc_type || docType,
        categories: d.categories || [],
        views_count: (d.views || []).length,
      };
    });

    if (options.format === 'summary') {
      output(sources, { ...options, mode: 'list' });
    } else {
      output({ items: sources, total }, options);
    }
  } catch (error) {
    outputError(error);
  }
}

/**
 * Show dataset source details
 */
export async function show(idOrName, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const { sourceType } = await getDatasetType(falcor, config, options.pattern);
    const appSourceType = `${config.app}+${sourceType}`;

    const id = await resolveSource(falcor, appSourceType, idOrName);
    const source = await fetchById(falcor, id, ['id', 'app', 'type', 'data', 'created_at', 'updated_at']);

    if (!source) {
      outputError(`Dataset source not found: ${idOrName}`);
      return;
    }

    const d = parseData(source.data);

    const result = {
      id: source.id,
      name: d.name || '(unnamed)',
      doc_type: d.doc_type || '',
      categories: d.categories || [],
      views: (d.views || []).length,
      metadata: d.metadata || {},
      created_at: source.created_at,
      updated_at: source.updated_at,
    };

    output(result, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * List views for a dataset source
 */
export async function views(idOrName, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const { sourceType, viewType } = await getDatasetType(falcor, config, options.pattern);
    const appSourceType = `${config.app}+${sourceType}`;

    const id = await resolveSource(falcor, appSourceType, idOrName);
    const source = await fetchById(falcor, id, ['id', 'data']);

    if (!source) {
      outputError(`Dataset source not found: ${idOrName}`);
      return;
    }

    const d = parseData(source.data);
    const viewRefs = d.views || [];

    if (viewRefs.length === 0) {
      output([], { ...options, mode: 'list' });
      return;
    }

    const viewIds = viewRefs
      .map(v => (typeof v === 'object' ? v.id : v))
      .filter(Boolean);

    const viewItems = await fetchByIds(falcor, viewIds, ['id', 'app', 'type', 'data']);

    const result = viewItems.map(v => {
      const vd = parseData(v.data);
      return {
        id: v.id,
        name: vd.name || '(unnamed)',
        view_type: vd.view_type || vd.type || '?',
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
 * Dump dataset data rows (the actual data items for a source's doc_type)
 */
export async function dump(sourceId, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const { sourceType } = await getDatasetType(falcor, config, options.pattern);
    const appSourceType = `${config.app}+${sourceType}`;

    const id = await resolveSource(falcor, appSourceType, sourceId);
    const source = await fetchById(falcor, id, ['id', 'data']);

    if (!source) {
      outputError(`Dataset source not found: ${sourceId}`);
      return;
    }

    const d = parseData(source.data);
    const docType = d.doc_type;

    if (!docType) {
      outputError('Source has no doc_type — cannot determine data items type');
      return;
    }

    const dataType = `${config.app}+${docType}`;
    const limit = parseInt(options.limit, 10) || 100;
    const offset = parseInt(options.offset, 10) || 0;

    const { items, total } = await fetchAll(
      falcor, dataType,
      ['id', 'app', 'type', 'data'],
      { limit, offset }
    );

    const rows = items.map(item => ({
      id: item.id,
      data: parseData(item.data),
    }));

    output({ items: rows, total, source_id: id, doc_type: docType }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Query dataset data rows with filters and ordering
 *
 * Uses the Falcor `options` path for filtered queries.
 * --filter col=val (repeatable) → filter object
 * --order col:asc|desc → orderBy object
 */
export async function query(sourceId, config, options = {}) {
  try {
    const falcor = makeClient(config);
    const { sourceType } = await getDatasetType(falcor, config, options.pattern);
    const appSourceType = `${config.app}+${sourceType}`;

    const id = await resolveSource(falcor, appSourceType, sourceId);
    const source = await fetchById(falcor, id, ['id', 'data']);

    if (!source) {
      outputError(`Dataset source not found: ${sourceId}`);
      return;
    }

    const d = parseData(source.data);
    const docType = d.doc_type;

    if (!docType) {
      outputError('Source has no doc_type — cannot determine data items type');
      return;
    }

    const dataType = `${config.app}+${docType}`;
    const limit = parseInt(options.limit, 10) || 100;
    const offset = parseInt(options.offset, 10) || 0;

    // Build filter object from --filter col=val pairs
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

    // Build orderBy from --order col:asc|desc
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

    const optionsKey = JSON.stringify(optionsObj);

    // Fetch filtered length
    await falcor.get(['dms', 'data', dataType, 'options', [optionsKey], 'length']);
    const cache = falcor.getCache();
    const total = cache?.dms?.data?.[dataType]?.options?.[optionsKey]?.length;
    const totalVal = (total && total.$type === 'atom') ? total.value : (total || 0);

    if (totalVal === 0) {
      output({ items: [], total: 0, filter: optionsObj }, options);
      return;
    }

    const from = offset;
    const to = Math.min(offset + limit - 1, totalVal - 1);

    if (from > to) {
      output({ items: [], total: totalVal, filter: optionsObj }, options);
      return;
    }

    // Fetch filtered items
    const attrs = ['id', 'data'];
    await falcor.get(['dms', 'data', dataType, 'options', [optionsKey], 'byIndex', { from, to }, attrs]);
    const updatedCache = falcor.getCache();

    // Extract items from the options byIndex path
    const byIndex = updatedCache?.dms?.data?.[dataType]?.options?.[optionsKey]?.byIndex || {};
    const items = [];

    for (let i = from; i <= to; i++) {
      const entry = byIndex[i];
      if (entry) {
        const row = {};
        for (const attr of attrs) {
          const val = entry[attr];
          row[attr] = (val && val.$type === 'atom') ? val.value : val;
        }
        if (row.id) {
          row.data = parseData(row.data);
          items.push(row);
        }
      }
    }

    output({ items, total: totalVal, filter: optionsObj }, options);
  } catch (error) {
    outputError(error);
  }
}

export default { list, show, views, dump, query };
