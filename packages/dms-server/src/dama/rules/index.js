/**
 * DMS source rules (datasets-source-rules.md): table rules an author attaches to a DAMA source on
 * the datasets Rules page, and the server installs on every table behind the source.
 *
 *   listSourceRules(env, sourceId)                 what can be attached, what is, and its status
 *   setSourceRule(env, sourceId, args, enable, user)  attach / edit / remove one rule instance
 *   backfillSourceRule(env, sourceId, key)         bring existing rows into line
 *   ensureSourceRules(db, viewId, known?)          install attached rules a table is missing
 *                                                  (end of publish; the external write path)
 *
 * Attached rules live in `data_manager.sources.metadata.rules` — written only here (updateSource
 * keeps the stored value on a generic metadata write, as it does `authority`):
 *   [{ id, key, params, addedBy, addedAt, updatedAt? }]
 *
 * DAMA + PostgreSQL only, like external row writes. Status is always read from the catalog, so the
 * Rules page shows a trigger someone dropped by hand, or a new version that never got the rules.
 */
const { getEssentials } = require('../../routes/uda/utils');
const { parseJsonish } = require('../../routes/uda/authority');
const { registerRule, getRule, getRules } = require('./registry');
const { introspectTable } = require('./introspect');
const { ruleObjectNames } = require('./sql');

registerRule('auto_number', require('./auto_number'));
registerRule('point_from_lat_lon', require('./point_from_lat_lon'));

const asObject = (value) => {
  const parsed = parseJsonish(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
};
const attachedRules = (metadata) => {
  const rules = asObject(metadata).rules;
  return Array.isArray(rules) ? rules.filter(r => r && r.id && r.key) : [];
};

const runStatement = (q, stmt) =>
  (typeof stmt === 'string' ? q.query(stmt) : q.query(stmt.text, stmt.values || []));

// Tables behind a source that exist. A view row can name a table that was never created (or was
// dropped); those can't hold rows, so rules skip them.
async function sourceTables(q, sourceId) {
  const { rows } = await q.query(
    `SELECT view_id, table_schema, table_name
     FROM data_manager.views
     WHERE source_id = $1 AND table_schema IS NOT NULL AND table_name IS NOT NULL
       AND to_regclass(quote_ident(table_schema) || '.' || quote_ident(table_name)) IS NOT NULL
     ORDER BY view_id`,
    [+sourceId]
  );
  return rows;
}

async function damaDb(env) {
  const { isDms, db } = await getEssentials({ env });
  if (isDms) throw new Error('Rules are only supported for DataManager (DAMA) sources');
  if (db.type !== 'postgres') throw new Error('Rules are only supported on PostgreSQL sources');
  return db;
}

const tableLabel = (info) => `${info.schema}.${info.table}`;

function publicSpec(spec, info) {
  return {
    id: spec.id,
    label: spec.label,
    description: spec.description || '',
    removeNote: spec.removeNote || '',
    params: spec.params,
    defaults: info && spec.normalize ? spec.normalize({ info, params: {} }) : {},
    canBackfill: typeof spec.backfill === 'function',
  };
}

function summarizeTable(info) {
  return {
    schema: info.schema,
    table: info.table,
    pk: info.pk,
    columns: info.columns.map(({ name, udt, kind, notNull, isIdentity, default: def }) =>
      ({ name, udt, kind, notNull, isIdentity, hasDefault: def != null })),
    geometryColumns: info.geometryColumns,
  };
}

async function listSourceRules(env, sourceId) {
  const { isDms, db } = await getEssentials({ env });
  if (isDms || db.type !== 'postgres') {
    return { supported: false, reason: 'Rules are only supported for DataManager (DAMA) sources on PostgreSQL.', available: [], attached: [], tables: [] };
  }
  const { rows } = await db.query(`SELECT metadata FROM data_manager.sources WHERE source_id = $1`, [+sourceId]);
  if (!rows.length) throw new Error(`Source ${sourceId} not found`);

  const tables = await sourceTables(db, sourceId);
  const infos = [];
  for (const t of tables) infos.push(await introspectTable(db, t.table_schema, t.table_name));
  const latest = infos[infos.length - 1] || null;

  const available = Object.values(getRules())
    .filter(spec => !latest || !spec.appliesTo || spec.appliesTo(latest))
    .map(spec => publicSpec(spec, latest));

  const attached = [];
  for (const rule of attachedRules(rows[0].metadata)) {
    const spec = getRule(rule.id);
    const perTable = [];
    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      let status = 'unknown-rule';
      if (spec) {
        try {
          status = await spec.status({ q: db, info, params: rule.params || {}, names: ruleObjectNames(info, rule.key) });
        } catch (e) {
          status = 'error';
        }
      }
      perTable.push({ view_id: tables[i].view_id, table: tableLabel(info), status });
    }
    attached.push({
      ...rule,
      label: spec ? spec.label : rule.id,
      registered: !!spec,
      canBackfill: !!(spec && spec.backfill),
      tables: perTable,
    });
  }

  return {
    supported: true,
    available,
    attached,
    tables: tables.map(t => ({ view_id: t.view_id, table: `${t.table_schema}.${t.table_name}` })),
    latest: latest ? summarizeTable(latest) : null,
  };
}

/**
 * Attach (enable=true) or remove (enable=false) one rule instance.
 *   args: { id, params, replaceKey? }   attach/edit. replaceKey = the instance being edited, when
 *                                       the edit changed its key (e.g. a different target column).
 *   args: { id, key }                   remove.
 * Validates on every table, then runs all the DDL and the metadata write in ONE transaction, with
 * the source row locked — so it all lands, or none of it does.
 */
async function setSourceRule(env, sourceId, args = {}, enable = true, user = null) {
  const { id, params: rawParams = {}, key: keyArg, replaceKey } = args || {};
  const spec = getRule(id);
  if (!spec) throw new Error(`Unknown rule "${id}"`);
  const db = await damaDb(env);

  const tables = await sourceTables(db, sourceId);
  if (!tables.length) throw new Error('This source has no published version yet. Publish one, then add rules.');

  await db.withTransaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT metadata FROM data_manager.sources WHERE source_id = $1 FOR UPDATE`, [+sourceId]);
    if (!rows.length) throw new Error(`Source ${sourceId} not found`);
    const meta = asObject(rows[0].metadata);
    const attached = attachedRules(meta);

    const infos = [];
    for (const t of tables) infos.push(await introspectTable(tx, t.table_schema, t.table_name));
    const latest = infos[infos.length - 1];
    const prefix = (info) => (infos.length > 1 ? `${tableLabel(info)}: ` : '');

    let next;
    if (enable) {
      const params = spec.normalize ? spec.normalize({ info: latest, params: rawParams || {} }) : (rawParams || {});
      const key = spec.key(params);
      for (const info of infos) {
        try {
          spec.validate({ info, params });
        } catch (e) {
          throw new Error(prefix(info) + e.message);
        }
      }

      const previous = attached.find(r => r.key === (replaceKey || key));
      if (replaceKey && replaceKey !== key && previous) {
        const oldSpec = getRule(previous.id);
        if (oldSpec) {
          for (const info of infos) {
            for (const stmt of oldSpec.uninstall({ info, params: previous.params || {}, names: ruleObjectNames(info, previous.key) })) {
              await runStatement(tx, stmt);
            }
          }
        }
      }
      for (const info of infos) {
        for (const stmt of spec.install({ info, params, names: ruleObjectNames(info, key) })) {
          await runStatement(tx, stmt);
        }
      }

      const now = new Date().toISOString();
      const entry = {
        id, key, params,
        addedBy: previous?.addedBy ?? user?.email ?? null,
        addedAt: previous?.addedAt ?? now,
        ...(previous ? { updatedBy: user?.email ?? null, updatedAt: now } : {}),
      };
      next = attached.filter(r => r.key !== key && r.key !== replaceKey).concat([entry]);
    } else {
      const key = keyArg || spec.key(spec.normalize ? spec.normalize({ info: latest, params: rawParams || {} }) : (rawParams || {}));
      const stored = attached.find(r => r.key === key);
      const params = stored?.params || rawParams || {};
      for (const info of infos) {
        for (const stmt of spec.uninstall({ info, params, names: ruleObjectNames(info, key) })) {
          await runStatement(tx, stmt);
        }
      }
      next = attached.filter(r => r.key !== key);
    }

    await tx.query(
      `UPDATE data_manager.sources SET metadata = $1::jsonb WHERE source_id = $2`,
      [JSON.stringify({ ...meta, rules: next }), +sourceId]
    );
  });

  forgetEnsured(db);
  return listSourceRules(env, sourceId);
}

async function backfillSourceRule(env, sourceId, key) {
  const db = await damaDb(env);
  const { rows } = await db.query(`SELECT metadata FROM data_manager.sources WHERE source_id = $1`, [+sourceId]);
  if (!rows.length) throw new Error(`Source ${sourceId} not found`);
  const rule = attachedRules(rows[0].metadata).find(r => r.key === key);
  if (!rule) throw new Error(`No rule "${key}" is attached to this source`);
  const spec = getRule(rule.id);
  if (!spec) throw new Error(`Rule "${rule.id}" is not registered on this server`);
  if (typeof spec.backfill !== 'function') throw new Error(`${spec.label} has nothing to apply to existing rows`);

  const tables = await sourceTables(db, sourceId);
  return db.withTransaction(async (tx) => {
    const results = [];
    for (const t of tables) {
      const info = await introspectTable(tx, t.table_schema, t.table_name);
      try {
        spec.validate({ info, params: rule.params || {} });
      } catch (e) {
        throw new Error(`${tableLabel(info)}: ${e.message}`);
      }
      const { text, values } = spec.backfill({ info, params: rule.params || {} });
      const { rows: counts } = await tx.query(text, values || []);
      results.push({ view_id: t.view_id, table: tableLabel(info), ...(counts[0] || {}) });
    }
    return { key, tables: results };
  });
}

// ------------------------------------------------------------------------------------------------
// ensureSourceRules — keeps a source's rules on every one of its tables. A new version is a new
// table, and publish paths other than gis/csv-publish (plugins, view duplication) create tables
// too, so this runs at the end of the core publish workers AND on the external write path. A
// per-process cache (adapter → view → rules signature) makes the write-path call a map lookup.
// ------------------------------------------------------------------------------------------------
const ensured = new WeakMap();

function forgetEnsured(db) {
  ensured.delete(db);
}

async function ensureSourceRules(db, viewId, known = null) {
  const empty = { installed: [], failed: [] };
  if (!db || db.type !== 'postgres') return empty;

  let view = known;
  if (!view) {
    const { rows } = await db.query(
      `SELECT v.view_id, v.table_schema, v.table_name, s.metadata
       FROM data_manager.views v JOIN data_manager.sources s ON s.source_id = v.source_id
       WHERE v.view_id = $1`,
      [+viewId]
    );
    view = rows[0];
  }
  if (!view || !view.table_schema || !view.table_name) return empty;

  const rules = attachedRules(view.metadata);
  if (!rules.length) return empty;

  const signature = JSON.stringify(rules.map(r => [r.id, r.key, r.params]));
  let cache = ensured.get(db);
  if (!cache) { cache = new Map(); ensured.set(db, cache); }
  if (cache.get(+viewId) === signature) return { ...empty, cached: true };

  const installed = [];
  const failed = [];
  for (const rule of rules) {
    const spec = getRule(rule.id);
    if (!spec) {
      failed.push({ key: rule.key, error: `Rule "${rule.id}" is not registered on this server` });
      continue;
    }
    try {
      await db.withTransaction(async (tx) => {
        const info = await introspectTable(tx, view.table_schema, view.table_name);
        const names = ruleObjectNames(info, rule.key);
        if ((await spec.status({ q: tx, info, params: rule.params || {}, names })) === 'installed') return;
        spec.validate({ info, params: rule.params || {} });
        for (const stmt of spec.install({ info, params: rule.params || {}, names })) await runStatement(tx, stmt);
        installed.push(rule.key);
      });
    } catch (e) {
      failed.push({ key: rule.key, error: e.message });
    }
  }
  if (installed.length) console.log(`[rules] view ${viewId}: installed ${installed.join(', ')}`);
  if (failed.length) console.warn(`[rules] view ${viewId}: could not install ${failed.map(f => `${f.key} (${f.error})`).join('; ')}`);
  if (!failed.length) cache.set(+viewId, signature);
  return { installed, failed };
}

module.exports = {
  registerRule,
  getRule,
  getRules,
  listSourceRules,
  setSourceRule,
  backfillSourceRule,
  ensureSourceRules,
  forgetEnsured,
  attachedRules,
};
