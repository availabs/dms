'use strict';
/**
 * Result cache for dataset (UDA) queries (planning/tasks/current/uda-result-cache.md).
 *
 * A page asks the same dataset query again and again: inside one load, on the next load, for the next
 * visitor. `cachedQuery` stands where the Postgres query set ran `db.query(sql, values)`:
 *
 *   - identical queries that arrive while one is running wait for that run (in-flight sharing);
 *   - an answer is kept in memory and given again for as long as every table it read is unchanged.
 *
 * It sits below the route's read check (uda.route.js canReadView), so an answer only ever reaches a request
 * that already passed it. Dataset reads are allowed per view, not per row, so the answer holds for anyone.
 *
 * WHAT IS CACHED. A query is kept only when all of these hold:
 *   - the mode is `on` (or `shadow`, which keeps answers to compare but never serves them);
 *   - every table it reads belongs to a source that is NOT editable (`metadata.isEditable`, one flag for
 *     every source: source-editable-flag-everywhere.md). The caller says so with `tables`;
 *   - every table is an ordinary table or materialized view Postgres keeps change counters for;
 *   - the SQL does not read the clock (the `time` filter builds `now()` into it);
 *   - the answer is under the per-entry size limit.
 *
 * FRESHNESS. An entry records a version of each table it read: the table's storage id (`relfilenode`, which
 * a TRUNCATE or rewrite changes) and Postgres's insert / update / delete counters, with the database's
 * counter-reset time (a reset drops everything rather than letting counters climb back to an old value).
 * One probe per database reads the versions of the tables in use, at most once per window. An entry whose
 * versions moved is dropped. This catches writers this server never hears from: pipeline runs, ETL tasks, a
 * person in psql. Postgres publishes the counters up to about a second after a commit, so such a write can
 * go unseen for the window plus a second. Every entry also expires at a maximum age.
 *
 * STORAGE. In this process's memory, behind `createMemoryStore()`'s four methods (get / set / delete /
 * clear, plus `stats`); a store shared between processes would implement the same.
 *
 *   DMS_UDA_CACHE              off (default) | shadow | on
 *   DMS_UDA_CACHE_MB           memory budget, MB                          (256)
 *   DMS_UDA_CACHE_WINDOW_MS    how long a table version is trusted, ms    (5000)
 *   DMS_UDA_CACHE_MAX_AGE_MS   the longest an entry is kept, ms           (600000)
 */

const MAX_ENTRY_CHARS = 2_000_000;
const MAX_TRACKED_TABLES = 2000;

// SQL whose answer depends on when it runs
const VOLATILE = /\b(now|clock_timestamp|statement_timestamp|transaction_timestamp|timeofday|random|gen_random_uuid|nextval)\s*\(|\bcurrent_(date|time|timestamp)\b|\blocaltime(stamp)?\b/i;

// every decimal number in a JSON text at 11 significant digits, for comparing two runs of one query
const roundFloats = (json) => json.replace(/-?\d+\.\d+(?:e[+-]?\d+)?/gi, (n) => Number(n).toPrecision(11));

const numberEnv = (name, fallback) => {
  const v = Number(process.env[name]);
  return process.env[name] !== undefined && Number.isFinite(v) && v >= 0 ? v : fallback;
};

function readSettings() {
  const mode = String(process.env.DMS_UDA_CACHE || 'off').toLowerCase();
  return {
    mode: mode === 'on' || mode === 'shadow' ? mode : 'off',
    maxChars: numberEnv('DMS_UDA_CACHE_MB', 256) * 1024 * 1024,
    windowMs: numberEnv('DMS_UDA_CACHE_WINDOW_MS', 5000),
    maxAgeMs: numberEnv('DMS_UDA_CACHE_MAX_AGE_MS', 10 * 60 * 1000),
  };
}

/** Least-recently-used store under a size budget. Sizes are characters of the stored JSON. */
function createMemoryStore({ maxChars }) {
  const entries = new Map();   // key -> { json, tokens, at }, oldest first
  let chars = 0; let evictions = 0;
  return {
    get(key) {
      const e = entries.get(key);
      if (!e) return undefined;
      entries.delete(key); entries.set(key, e);   // most recently used last
      return e;
    },
    set(key, entry) {
      const old = entries.get(key);
      if (old) { chars -= old.json.length; entries.delete(key); }
      entries.set(key, entry); chars += entry.json.length;
      for (const [k, e] of entries) {
        if (chars <= maxChars) break;
        entries.delete(k); chars -= e.json.length; evictions++;
      }
    },
    delete(key) { const e = entries.get(key); if (e) { chars -= e.json.length; entries.delete(key); } },
    clear() { entries.clear(); chars = 0; },
    stats: () => ({ entries: entries.size, chars, evictions }),
  };
}

function createResultCache(overrides = {}) {
  const settings = { ...readSettings(), ...overrides };
  const now = overrides.now || (() => Date.now());
  const store = overrides.store || createMemoryStore(settings);
  // per database (the adapter object): the tables in use and their versions, and the queries running now
  const dbs = new WeakMap();
  const counts = {
    queries: 0, hits: 0, wouldHits: 0, misses: 0, shared: 0, stored: 0, stale: 0, expired: 0,
    mismatches: 0, floatNoise: 0, probes: 0, probeMs: 0, probeErrors: 0,
    notCached: { editable: 0, noTables: 0, volatile: 0, noCounters: 0, tooBig: 0, notPostgres: 0 },
  };

  const stateOf = (db) => {
    let s = dbs.get(db);
    if (!s) { s = { id: `db${++stateOf.n}`, tables: new Map(), probedAt: 0, probing: null, inflight: new Map() }; dbs.set(db, s); }
    return s;
  };
  stateOf.n = 0;

  /** Reads the version of every table in use on `db`. One at a time per database. */
  function probe(db, s) {
    if (s.probing) return s.probing;
    const names = [...s.tables.keys()];
    const t0 = now();
    s.probing = (async () => {
      const { rows } = await db.query(
        `SELECT q.name, c.relkind, c.relfilenode, st.n_tup_ins, st.n_tup_upd, st.n_tup_del,
                (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()) AS stats_reset
           FROM unnest($1::text[], $2::text[], $3::text[]) AS q(name, table_schema, table_name)
           JOIN pg_namespace n ON n.nspname = q.table_schema
           JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = q.table_name
           LEFT JOIN pg_stat_all_tables st ON st.relid = c.oid`,
        [names, names.map(k => s.tables.get(k).table_schema), names.map(k => s.tables.get(k).table_name)]);
      const seen = new Map(rows.map(r => [r.name, r]));
      for (const name of names) {
        const t = s.tables.get(name); if (!t) continue;
        const r = seen.get(name);
        // an ordinary table or a materialized view, with counters: anything else has no version to trust
        t.version = r && (r.relkind === 'r' || r.relkind === 'm') && r.n_tup_ins != null
          ? `${r.relfilenode}:${r.n_tup_ins}:${r.n_tup_upd}:${r.n_tup_del}:${r.stats_reset ? new Date(r.stats_reset).getTime() : 0}`
          : null;
        t.probed = true;
      }
      s.probedAt = now();
      counts.probes++; counts.probeMs += s.probedAt - t0;
    })().finally(() => { s.probing = null; });
    return s.probing;
  }

  /** The versions of `tables` as one token, or null when one of them has none. Throws when the probe fails. */
  async function tokenFor(db, s, tables) {
    const at = now();
    let needsProbe = at - s.probedAt >= settings.windowMs;
    for (const t of tables) {
      const name = `${t.table_schema}.${t.table_name}`;
      let known = s.tables.get(name);
      if (!known) {
        if (s.tables.size >= MAX_TRACKED_TABLES) {
          // forget the tables not asked about for the longest
          const old = [...s.tables].sort((a, b) => a[1].usedAt - b[1].usedAt).slice(0, MAX_TRACKED_TABLES / 4);
          for (const [k] of old) s.tables.delete(k);
        }
        known = { table_schema: t.table_schema, table_name: t.table_name, version: null, probed: false, usedAt: at };
        s.tables.set(name, known);
        needsProbe = true;
      }
      known.usedAt = at;
    }
    if (needsProbe) await probe(db, s);
    const versions = tables.map(t => s.tables.get(`${t.table_schema}.${t.table_name}`)?.version ?? null);
    return versions.includes(null) ? null : versions.join('|');
  }

  /**
   * `db.query(sql, values)`, shared and cached. Resolves `{ rows }`.
   * `tables`: every table the query reads as [{ table_schema, table_name }], when all of them belong to
   * sources that are not editable; null when the caller can't say so (an editable source, an internal
   * dataset, a join it can't follow), and the answer is then never kept.
   * `why`: when `tables` is null, which `notCached` counter that is (`editable` or `noTables`).
   */
  async function cachedQuery(db, sql, values = [], { tables = null, why = 'noTables' } = {}) {
    if (settings.mode === 'off') return db.query(sql, values);
    counts.queries++;
    const s = stateOf(db);
    const key = `${s.id}\u0000${sql}\u0000${JSON.stringify(values)}`;

    // already running: wait for it. Each caller gets rows of its own, since callers rename keys in place.
    const running = s.inflight.get(key);
    if (running) {
      counts.shared++;
      return { rows: structuredClone((await running).rows) };
    }

    // Registered before the first await, so queries that arrive together find it: the version probe, a hit
    // and the run itself all happen inside.
    const work = (async () => {
      let token = null;
      if (db.type !== 'postgres') counts.notCached.notPostgres++;
      else if (!tables || !tables.length) counts.notCached[why] = (counts.notCached[why] || 0) + 1;
      else if (VOLATILE.test(sql)) counts.notCached.volatile++;
      else {
        try {
          token = await tokenFor(db, s, tables);
          if (token === null) counts.notCached.noCounters++;
        } catch (e) {
          counts.probeErrors++;
          if (counts.probeErrors <= 3) console.warn(`[uda-cache] table versions unreadable, not caching: ${e.message}`);
        }
      }

      let kept = null;
      if (token !== null) {
        const entry = store.get(key);
        if (entry && entry.token !== token) { store.delete(key); counts.stale++; }
        else if (entry && now() - entry.at >= settings.maxAgeMs) { store.delete(key); counts.expired++; }
        else if (entry) {
          if (settings.mode === 'on') { counts.hits++; return { rows: JSON.parse(entry.json) }; }
          counts.wouldHits++; kept = entry;   // shadow: answer from the database, and compare
        }
      }

      const result = await db.query(sql, values);
      if (!kept) counts.misses++;

      if (token !== null) {
        const json = JSON.stringify(result.rows);
        // A float sum over parallel workers is added in a different order each run, so the same query on the
        // same rows differs in its last digits (seen on every FUSION page, 2026-11-25). That is not a stale
        // answer: counted apart, and never reported.
        if (kept && kept.json !== json && roundFloats(kept.json) === roundFloats(json)) counts.floatNoise++;
        else if (kept && kept.json !== json) {
          counts.mismatches++;
          if (counts.mismatches <= 20) {
            // where the two first differ, with a little of each: tells a changed table from a query whose
            // answer varies run to run (a float sum over parallel workers, rows with no total order)
            let i = 0; while (i < json.length && json[i] === kept.json[i]) i++;
            console.warn(`[uda-cache] shadow: a kept answer differs from the database (${tables.map(t => t.table_name).join(', ')}) at ${i}: kept …${kept.json.slice(Math.max(0, i - 30), i + 30)}… now …${json.slice(Math.max(0, i - 30), i + 30)}…`);
          }
        }
        if (json.length > MAX_ENTRY_CHARS) counts.notCached.tooBig++;
        // the version read BEFORE the query ran: a write in between leaves a version that no longer matches
        else if (!kept || kept.json !== json) { store.set(key, { json, token, at: now() }); counts.stored++; }
      }
      return result;
    })();
    s.inflight.set(key, work);
    try { return await work; } finally { s.inflight.delete(key); }
  }

  return {
    cachedQuery,
    mode: () => settings.mode,
    windowMs: () => settings.windowMs,
    clear: () => store.clear(),
    stats: () => ({ mode: settings.mode, windowMs: settings.windowMs, maxAgeMs: settings.maxAgeMs, maxChars: settings.maxChars, ...store.stats(), ...counts, notCached: { ...counts.notCached } }),
  };
}

// the server's one cache; tests build their own with createResultCache
let shared = null;
const resultCache = () => (shared ||= createResultCache());
/** Tests: forget the shared cache so the next use reads the environment again. */
const resetResultCache = () => { shared = null; };

module.exports = { createResultCache, createMemoryStore, resultCache, resetResultCache, VOLATILE };
