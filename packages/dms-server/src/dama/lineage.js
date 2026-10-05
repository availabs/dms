/**
 * DaMa view lineage (dama-parent-child-etl-support.md, G1).
 *
 * Lineage lives on VIEWS. A source is only metadata about its views: one view of a source can be
 * built from entirely different sources than another view of the same source (DLS 858's views 1647
 * and 2398 share 2 of their 6 input sources). So every link is stored on a view:
 *
 *   - `views.view_dependencies`     the exact input views this view was built from;
 *   - `views.metadata.produced_by`  `{view_id, output?, stage?}`, the run view that produced it
 *                                   (one view of a pipeline's parent source per run).
 *
 * A run view's outputs are DERIVED (the views whose `produced_by.view_id` names it) and never
 * stored a second time. Source-level lineage is a roll-up computed here on read. Nothing in this
 * module writes a source.
 */

const { getDb } = require('../db');

const viewsTable = (db) => (db.type === 'postgres' ? 'data_manager.views' : 'views');
const sourcesTable = (db) => (db.type === 'postgres' ? 'data_manager.sources' : 'sources');

const toIds = (ids) => [...new Set((ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0))];

// SQLite returns JSON columns (and json_extract of an object) as text; Postgres returns objects.
function parseJsonish(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

/**
 * `view_dependencies` as an array of ids. Postgres: INTEGER[]. SQLite: text, either JSON (`[1,2]`,
 * what the adapter writes for an array) or a Postgres array literal (`{1,2}`) from a copied env.
 */
function parseDependencies(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return toIds(value);
  if (typeof value === 'string') {
    const t = value.trim();
    if (t.startsWith('[')) {
      const parsed = parseJsonish(t);
      return Array.isArray(parsed) ? toIds(parsed) : [];
    }
    if (t.startsWith('{')) return toIds(t.slice(1, -1).split(','));
  }
  return [];
}

/** Validate and normalize a `produced_by` record. Returns null for null/undefined; throws on a bad shape. */
function normalizeProducedBy(producedBy) {
  if (producedBy == null) return null;
  if (typeof producedBy !== 'object' || Array.isArray(producedBy)) {
    throw new Error('produced_by must be an object {view_id, output?, stage?}');
  }
  const viewId = Number(producedBy.view_id);
  if (!Number.isInteger(viewId) || viewId <= 0) {
    throw new Error('produced_by.view_id must be the id of the run view that produced this view');
  }
  const out = { view_id: viewId };
  for (const key of ['output', 'stage']) {
    if (producedBy[key] == null) continue;
    if (typeof producedBy[key] !== 'string' || !producedBy[key].trim()) {
      throw new Error(`produced_by.${key} must be a non-empty string`);
    }
    out[key] = producedBy[key].trim();
  }
  return out;
}

// The `produced_by` object of a view row, selected as a column (PG jsonb / SQLite text).
const producedBySelect = (db, alias = 'v') => (db.type === 'postgres'
  ? `${alias}.metadata->'produced_by' AS produced_by`
  : `json_extract(${alias}.metadata, '$.produced_by') AS produced_by`);

// Match views whose produced_by.view_id is one of $1 (an array of ids).
const producedByIn = (db, alias = 'v') => (db.type === 'postgres'
  ? `${alias}.metadata->'produced_by'->>'view_id' = ANY($1)`
  : `CAST(json_extract(${alias}.metadata, '$.produced_by.view_id') AS INTEGER) = ANY($1)`);

// Postgres compares the text of produced_by.view_id; SQLite casts it, so it takes numbers.
const producedByParam = (db, ids) => (db.type === 'postgres' ? ids.map(String) : ids);

/** Refuse ids that name no view, so the server never records a link to a ghost. */
async function assertViewsExist(db, ids, what) {
  const wanted = toIds(ids);
  if (!wanted.length) return;
  const { rows } = await db.query(
    `SELECT view_id FROM ${viewsTable(db)} WHERE view_id = ANY($1)`, [wanted]);
  const found = new Set(rows.map(r => +r.view_id));
  const missing = wanted.filter(id => !found.has(id));
  if (missing.length) throw new Error(`${what}: view(s) ${missing.join(', ')} do not exist`);
}

/** id → {view_id, source_id, source_name, source_type, version} for the given view ids. */
async function describeViews(db, ids) {
  const wanted = toIds(ids);
  if (!wanted.length) return new Map();
  const { rows } = await db.query(`
    SELECT v.view_id, v.source_id, v.version, s.name AS source_name, s.type AS source_type
    FROM ${viewsTable(db)} v LEFT JOIN ${sourcesTable(db)} s ON s.source_id = v.source_id
    WHERE v.view_id = ANY($1)`, [wanted]);
  return new Map(rows.map(r => [+r.view_id, {
    view_id: +r.view_id, source_id: +r.source_id, source_name: r.source_name ?? null,
    source_type: r.source_type ?? null, version: r.version ?? null,
  }]));
}

/** The views produced by the given run views: [{run_view_id, view_id, source_id, …, output, stage}]. */
async function outputsOf(db, runViewIds) {
  const ids = toIds(runViewIds);
  if (!ids.length) return [];
  const { rows } = await db.query(`
    SELECT v.view_id, v.source_id, v.version, v.end_date, v._created_timestamp AS created,
           s.name AS source_name, s.type AS source_type, ${producedBySelect(db)}
    FROM ${viewsTable(db)} v LEFT JOIN ${sourcesTable(db)} s ON s.source_id = v.source_id
    WHERE ${producedByIn(db)}
    ORDER BY v.view_id`, [producedByParam(db, ids)]);
  return rows.map(r => {
    const pb = parseJsonish(r.produced_by) || {};
    return {
      run_view_id: +pb.view_id, view_id: +r.view_id, source_id: +r.source_id,
      source_name: r.source_name ?? null, source_type: r.source_type ?? null,
      version: r.version ?? null, end_date: r.end_date ?? null, created: r.created ?? null,
      output: pb.output ?? null, stage: pb.stage ?? null,
    };
  });
}

/**
 * Lineage of each view: what it was built from, which run view produced it, and (for a run view)
 * the views it produced. Returns Map(view_id → {view_id, source_id, inputs, produced_by, outputs});
 * unknown ids are absent. An input or producer that no longer exists is listed with `missing: true`.
 */
async function getViewLineage(pgEnv, viewIds, { db = getDb(pgEnv) } = {}) {
  const ids = toIds(viewIds);
  const result = new Map();
  if (!ids.length) return result;

  const { rows } = await db.query(`
    SELECT v.view_id, v.source_id, v.view_dependencies, ${producedBySelect(db)}
    FROM ${viewsTable(db)} v WHERE v.view_id = ANY($1)`, [ids]);

  const deps = new Map(rows.map(r => [+r.view_id, parseDependencies(r.view_dependencies)]));
  const producedBy = new Map(rows.map(r => {
    const pb = parseJsonish(r.produced_by);
    return [+r.view_id, pb && Number.isFinite(+pb.view_id) ? pb : null];
  }));
  const described = await describeViews(db, [
    ...[...deps.values()].flat(),
    ...[...producedBy.values()].filter(Boolean).map(pb => +pb.view_id),
  ]);
  const outputs = await outputsOf(db, ids);

  const describe = (id) => described.get(+id) || { view_id: +id, missing: true };
  for (const r of rows) {
    const id = +r.view_id;
    const pb = producedBy.get(id);
    result.set(id, {
      view_id: id,
      source_id: +r.source_id,
      inputs: deps.get(id).map(describe),
      produced_by: pb ? { ...describe(pb.view_id), output: pb.output ?? null, stage: pb.stage ?? null } : null,
      outputs: outputs.filter(o => o.run_view_id === id).map(({ run_view_id, ...o }) => o),
    });
  }
  return result;
}

const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

/**
 * The source roll-up, computed from its views on every read and never stored. Per view: its input
 * view and source ids, its producer, how many views it produced, and whether its input SOURCES
 * differ from the previous view that has inputs (`inputs_changed`, with what was added/removed).
 * Plus the union of input sources, the union of produced sources, and every referenced source's
 * name. Returns Map(source_id → roll-up).
 */
async function getSourceLineage(pgEnv, sourceIds, { db = getDb(pgEnv) } = {}) {
  const ids = toIds(sourceIds);
  const result = new Map();
  if (!ids.length) return result;

  const { rows } = await db.query(`
    SELECT v.view_id, v.source_id, v.version, v.view_dependencies, ${producedBySelect(db)}
    FROM ${viewsTable(db)} v WHERE v.source_id = ANY($1) ORDER BY v.view_id`, [ids]);

  const allInputIds = rows.flatMap(r => parseDependencies(r.view_dependencies));
  const producerIds = rows.map(r => parseJsonish(r.produced_by)?.view_id).filter(Boolean);
  const described = await describeViews(db, [...allInputIds, ...producerIds]);
  const outputs = await outputsOf(db, rows.map(r => r.view_id));

  const names = {};
  const remember = (d) => { if (d?.source_id && !(d.source_id in names)) names[d.source_id] = d.source_name ?? null; };
  described.forEach(remember);
  outputs.forEach(remember);

  for (const sourceId of ids) {
    const views = [];
    let previous = null; // input source ids of the previous view that had inputs
    for (const r of rows.filter(row => +row.source_id === sourceId)) {
      const inputViewIds = parseDependencies(r.view_dependencies);
      const inputSourceIds = [...new Set(inputViewIds.map(id => described.get(id)?.source_id).filter(Boolean))].sort((a, b) => a - b);
      const pb = parseJsonish(r.produced_by);
      const producer = pb && Number.isFinite(+pb.view_id) ? (described.get(+pb.view_id) || { view_id: +pb.view_id, missing: true }) : null;
      const entry = {
        view_id: +r.view_id,
        version: r.version ?? null,
        input_view_ids: inputViewIds,
        input_source_ids: inputSourceIds,
        produced_by: producer ? { ...producer, output: pb.output ?? null, stage: pb.stage ?? null } : null,
        output_count: outputs.filter(o => o.run_view_id === +r.view_id).length,
        inputs_changed: false,
      };
      if (inputSourceIds.length) {
        if (previous && !sameSet(previous, inputSourceIds)) {
          entry.inputs_changed = true;
          entry.inputs_added = inputSourceIds.filter(id => !previous.includes(id));
          entry.inputs_removed = previous.filter(id => !inputSourceIds.includes(id));
        }
        previous = inputSourceIds;
      }
      views.push(entry);
    }
    const ownViewIds = new Set(views.map(v => v.view_id));
    const produced = outputs.filter(o => ownViewIds.has(o.run_view_id));
    result.set(sourceId, {
      source_id: sourceId,
      views,
      input_source_ids: [...new Set(views.flatMap(v => v.input_source_ids))].sort((a, b) => a - b),
      produced_source_ids: [...new Set(produced.map(o => o.source_id))].sort((a, b) => a - b),
      source_names: names,
    });
  }
  return result;
}

module.exports = {
  parseDependencies,
  normalizeProducedBy,
  assertViewsExist,
  describeViews,
  outputsOf,
  getViewLineage,
  getSourceLineage,
};
