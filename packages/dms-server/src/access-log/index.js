'use strict';

/**
 * Access log: every distinct permission refusal the guards make, counted (owner 2026-10-27, "option 1").
 *
 * The guards (`[source-auth]`, `[data-auth]`, `[read-auth]`, the upload routes) used to report their would-deny
 * lines only to the server console. Each now also calls `record()`:
 *   - `log` mode → outcome `would-deny` (allowed, but the rule would refuse it);
 *   - `enforce`  → outcome `refused`.
 * record() only counts in memory, keyed by (app, guard, outcome, kind, target, perms, principal). The counts are
 * written once a minute (and before every read of the log) as one upsert per distinct key, so a busy route
 * denied 10,000 times adds one row with a count, not 10,000 writes. The table lives in the DMS db next to
 * change_log (`dms.access_log` / `access_log`, created by sql/dms/change_log*.sql and migrate_dms_core*.sql).
 * The writes are plain SQL on the DMS adapter: they never pass the dms.data guards, never land in change_log
 * and are never broadcast over sync.
 *
 * Read: `GET /dms-admin/:app/access-log`, for `${app} Admin` and the platform group (`AVAIL`) only; a site's page
 * lists only rows of its own app. A row's app is the row's own (data / auth guards), the source's
 * (`app+instance` envs), else the datasets pattern the request names (`dms_pattern` / `X-DMS-Pattern`), for
 * signed-out reads and route calls too. A request that names none (an external pgEnv read or a signed-out call
 * from a client that sends no pattern) can't be attributed: it is stored with app '' and listed under `_none`,
 * for `AVAIL` only.
 *
 * Retention: rows not seen for DMS_ACCESS_LOG_DAYS (default 90) are deleted, at most once a day, on a flush.
 * DMS_ACCESS_LOG=off turns recording off. Outside the server (scripts, tests without a db) nothing is written.
 *
 * Task: planning/tasks/current/permissions-access-log.md (library planning).
 */

const FLUSH_MS = 60 * 1000;
const MAX_PENDING = 20000;       // distinct keys held before an early flush
const PRUNE_MS = 24 * 60 * 60 * 1000;
const NO_APP = '_none';

let pending = new Map();
let timer = null;
let flushing = null;
let lastPrune = 0;
let dbOverride = null;           // tests
// Writes start only once the server registered the route (registerAccessLogRoutes) or a test handed a db
// (_reset). Anything else that loads a guard (a script, a test) only counts in memory: the local fallback
// config `dms-sqlite` can point at a production database, and getDb would run its init and migrations.
let active = false;

const enabled = () => String(process.env.DMS_ACCESS_LOG || 'on').toLowerCase() !== 'off';

function getDmsDb() {
    if (dbOverride) return dbOverride;
    const { getDb } = require('../db');
    return getDb(process.env.DMS_DB_ENV || 'dms-sqlite');
}

const tableOf = (db) => (db.type === 'postgres' ? 'dms.access_log' : 'access_log');

/** The app a source env belongs to: `app+instance` (internal), else the client-named pattern's app. */
function appOf(env, patternRef) {
    if (typeof env === 'string' && env.includes('+')) return env.split('+')[0];
    return (patternRef && patternRef.app) || '';
}

const asText = (v) => (v == null ? '' : String(v));

/**
 * Count one refusal. `entry`: { app, guard: source|data|read|upload|file, outcome: would-deny|refused,
 * kind, target, perms (array or string), user, reason }. Never throws.
 */
function record(entry) {
    try {
        if (!enabled() || !entry) return;
        const user = entry.user || null;
        const userId = user && Number.isInteger(+user.id) && user.id != null ? +user.id : null;
        const row = {
            app: asText(entry.app),
            guard: asText(entry.guard),
            outcome: entry.outcome === 'refused' ? 'refused' : 'would-deny',
            kind: asText(entry.kind),
            target: asText(entry.target).slice(0, 500),
            perms: [].concat(entry.perms || []).join(','),
            principal: user ? asText(user.id ?? user.email) || 'unknown' : 'anon',
            user_id: userId,
            user_email: user && user.email ? String(user.email) : null,
            groups: ((user && user.groups) || []).join('|'),
            reason: asText(entry.reason).slice(0, 1000),
        };
        const key = [row.app, row.guard, row.outcome, row.kind, row.target, row.perms, row.principal].join('\u0001');
        const now = new Date().toISOString();
        const cur = pending.get(key);
        if (cur) { cur.count++; cur.last_seen = now; cur.reason = row.reason; cur.groups = row.groups; }
        else pending.set(key, { ...row, count: 1, first_seen: now, last_seen: now });
        if (!active) { if (pending.size > MAX_PENDING) pending.clear(); return; }
        if (pending.size >= MAX_PENDING) flush().catch(() => {});
        else if (!timer) {
            timer = setInterval(() => { flush().catch(() => {}); }, FLUSH_MS);
            if (timer.unref) timer.unref();
        }
    } catch (e) {
        console.warn(`[access-log] record failed: ${e.message}`);
    }
}

const COLS = ['app', 'guard', 'outcome', 'kind', 'target', 'perms', 'principal', 'user_id', 'user_email', 'groups',
    'reason', 'count', 'first_seen', 'last_seen'];

/** Write the pending counts (one upsert per distinct key). Concurrent calls share one flush. */
function flush() {
    if (flushing) return flushing;
    if (!active || !pending.size) return Promise.resolve(0);
    const batch = [...pending.values()];
    pending = new Map();
    flushing = (async () => {
        const db = getDmsDb();
        const tbl = tableOf(db);
        try {
            for (let i = 0; i < batch.length; i += 200) {
                const chunk = batch.slice(i, i + 200);
                const params = [];
                const values = chunk.map(r => `(${COLS.map(c => { params.push(r[c]); return `$${params.length}`; }).join(', ')})`);
                await db.query(
                    `INSERT INTO ${tbl} AS a (${COLS.join(', ')})
                     VALUES ${values.join(',\n')}
                     ON CONFLICT (app, guard, outcome, kind, target, perms, principal) DO UPDATE SET
                         count = a.count + EXCLUDED.count,
                         last_seen = EXCLUDED.last_seen,
                         reason = EXCLUDED.reason,
                         groups = EXCLUDED.groups,
                         user_email = COALESCE(EXCLUDED.user_email, a.user_email)`,
                    params);
            }
            if (Date.now() - lastPrune > PRUNE_MS) {
                lastPrune = Date.now();
                const days = Math.max(1, +process.env.DMS_ACCESS_LOG_DAYS || 90);
                await db.query(`DELETE FROM ${tbl} WHERE last_seen < $1`,
                    [new Date(Date.now() - days * 86400000).toISOString()]);
            }
            return batch.length;
        } catch (e) {
            // keep the counts for the next flush (merged into whatever arrived meanwhile)
            for (const r of batch) {
                const key = [r.app, r.guard, r.outcome, r.kind, r.target, r.perms, r.principal].join('\u0001');
                const cur = pending.get(key);
                if (cur) { cur.count += r.count; cur.first_seen = r.first_seen; }
                else pending.set(key, r);
            }
            console.warn(`[access-log] flush failed (${batch.length} kept for the next one): ${e.message}`);
            return 0;
        } finally {
            flushing = null;
        }
    })();
    return flushing;
}

/**
 * Rows of the log, newest first. `filters`: { app (required; NO_APP for rows with none), guard, outcome,
 * principal, user (matches email or principal), target (substring), since (ISO), limit, offset }.
 */
async function query(filters = {}) {
    await flush();
    const db = getDmsDb();
    const tbl = tableOf(db);
    // The WHERE for the filters; `withOutcome` false leaves the outcome out (the summary counts both).
    const build = (withOutcome) => {
        const where = ['app = $1'];
        const params = [filters.app === NO_APP ? '' : asText(filters.app)];
        const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
        if (filters.guard) add('guard = ?', String(filters.guard));
        if (withOutcome && filters.outcome) add('outcome = ?', String(filters.outcome));
        if (filters.principal) add('principal = ?', String(filters.principal));
        if (filters.user) {
            params.push(`%${String(filters.user).toLowerCase()}%`, String(filters.user));
            where.push(`(LOWER(COALESCE(user_email, '')) LIKE $${params.length - 1} OR principal = $${params.length})`);
        }
        if (filters.target) add('LOWER(target) LIKE ?', `%${String(filters.target).toLowerCase()}%`);
        if (filters.kind) add('kind = ?', String(filters.kind));
        if (filters.since) add('last_seen >= ?', String(filters.since));
        return { where: where.join(' AND '), params };
    };
    const { where, params } = build(true);
    const limit = Math.min(Math.max(+filters.limit || 200, 1), 1000);
    const offset = Math.max(+filters.offset || 0, 0);
    const { rows: [{ total }] } = await db.query(`SELECT count(1) AS total FROM ${tbl} WHERE ${where}`, params);
    const { rows } = await db.query(
        `SELECT id, app, guard, outcome, kind, target, perms, principal, user_id, user_email, groups, reason, count,
                first_seen, last_seen
         FROM ${tbl} WHERE ${where}
         ORDER BY last_seen DESC, id DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params);
    // Header counts for the page, over the same filters but both outcomes: times refused by outcome, and
    // the distinct principals (users; `anon` counts as one).
    const all = build(false);
    const { rows: byOutcome } = await db.query(
        `SELECT outcome, SUM(count) AS times FROM ${tbl} WHERE ${all.where} GROUP BY outcome`, all.params);
    const { rows: [{ users }] } = await db.query(
        `SELECT count(DISTINCT principal) AS users FROM ${tbl} WHERE ${all.where}`, all.params);
    const times = (o) => +(byOutcome.find(r => r.outcome === o)?.times || 0);
    return {
        total: +total, limit, offset,
        summary: { wouldDeny: times('would-deny'), refused: times('refused'), users: +users },
        rows: rows.map(r => ({ ...r, count: +r.count })),
    };
}

/**
 * GET /dms-admin/:app/access-log — `${app} Admin` or `AVAIL` (platform) only. Query string: the filters of
 * `query()`. `:app` = `_none` lists the rows with no app, for `AVAIL` only.
 */
// `authDb`: the auth adapter (tests); otherwise getDb(authDbEnv).
function registerAccessLogRoutes(app, { authDbEnv = process.env.DMS_AUTH_DB_ENV || 'auth-sqlite', authDb = null } = {}) {
    const { isAppAdmin } = require('../routes/auth/kindAuth/sourceAuth');
    const { isPlatformAdmin } = require('../auth/utils/permissions');
    active = true;
    app.get('/dms-admin/:app/access-log', async (req, res) => {
        try {
            const user = req.availAuthContext && req.availAuthContext.user;
            if (!user) return res.status(401).json({ error: 'authentication required' });
            const target = req.params.app;
            const platform = await isPlatformAdmin(authDb || require('../db').getDb(authDbEnv), user.email);
            if (!platform && (target === NO_APP || !isAppAdmin(user, target))) {
                return res.status(403).json({ error: `requires ${target === NO_APP ? 'AVAIL' : `${target} Admin`} membership` });
            }
            res.json(await query({ ...req.query, app: target }));
        } catch (e) {
            console.error('[access-log]', e.message);
            res.status(500).json({ error: e.message });
        }
    });
}

// tests
function _reset({ db = null } = {}) {
    pending = new Map();
    if (timer) { clearInterval(timer); timer = null; }
    flushing = null;
    lastPrune = 0;
    dbOverride = db;
    active = !!db;
}
const _pending = () => pending;

module.exports = { record, flush, query, appOf, registerAccessLogRoutes, NO_APP, _reset, _pending };
