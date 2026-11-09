#!/usr/bin/env node
/**
 * Grant migration, auth half (task permissions-grant-migration.md, "What it grants: Auth"). DRY RUN ONLY.
 *
 * Under DMS_AUTH_MODE=log a group's auth level still lets its members manage users and groups
 * (auth/utils/permissions.js levelCounts). Under `enforce` only the auth row's grants count. This lists, for
 * every site's auth row, the grants that keep today's level holders able to do what they do now:
 *
 *   level >= 10 -> `*`                        (task file)
 *   level 5..9  -> `auth-users`, `auth-groups` (every level-gated auth handler needs 5, except
 *                                               /users/byProject, which needs 10)
 *   level < 5   -> nothing (no auth handler counts it)
 *
 * It never removes or narrows a grant. `${app} Admin` and `public` are skipped (the first passes everything
 * by name). It then checks the access log: every "allowed by auth level only" / blank-row line for the site
 * should be covered by the proposed grants, and the ones that aren't are listed.
 *
 *   node src/scripts/migrate-auth-grants.js --dms-db=<config> --auth-db=<config> [--app=<app>] [--json=<file>]
 *
 * <config> is a file in src/db/configs without `.config.json`. Both are required: the default names point at
 * production on some machines. Both sessions are read-only (default_transaction_read_only) and a write probe
 * must be refused before anything is read.
 *
 * Writing the APPROVED grants (owner 2026-11-04; the list and its reasons: planning/tasks/current/
 * permissions-grant-migration-auth-rows.md). Not the proposals above: the conversion is decided per group.
 *
 *   ... --plan                              each approved grant: the row's state, before → after. Writes nothing.
 *   ... --apply --backup-dir=<dir>          writes them, one row at a time, stopping at the first problem.
 *
 * --apply writes through the DMS server (the `dms` CLI, `raw update`, so the change log and sync see it), never
 * through SQL: the DB sessions stay read-only. It needs DMS_HOST (the server that serves --dms-db) and
 * DMS_AUTH_TOKEN in the environment. Per row it: re-reads the row (DB and server must agree: same database),
 * refuses unless its grants are exactly the expected "before" (or already the "after": skipped, so a re-run is
 * a no-op), keeps the row's format (string or object, flat or subdomain-keyed), validates that the result
 * resolves to before + the one grant, saves the row to <dir>, writes, and reads it back from the DB.
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { Client } = require('pg');
const { resolveAuthPermissions } = require('../routes/auth/grants');

// Owner-approved 2026-11-04. `before` = the non-public group keys and the user keys the row's grants must hold
// today; anything else (a grant added since the review, a malformed key) refuses the row.
const APPROVED = [
  { app: 'asm', id: 1676371, group: 'AVAIL', perms: ['*'], before: { groups: [], users: [] } },
  { app: 'avail', id: 1449669, group: 'AVAIL', perms: ['*'], before: { groups: [], users: [] } },
  { app: 'dms-site', id: 1456572, group: 'AVAIL', perms: ['*'], before: { groups: [], users: [] } },
  { app: 'wcdb', id: 1471742, group: 'AVAIL', perms: ['*'], before: { groups: [], users: [] } },
  { app: 'npmrdsv5', id: 1498261, group: 'NYSDOT Admin', perms: ['*'], before: { groups: ['AVAIL'], users: ['175'] } },
];

const parseMaybe = (v) => (typeof v === 'string' ? (v.trim() ? JSON.parse(v) : null) : v);

/** The grants a raw authPermissions value resolves to for the site ('*'), as sorted key lists. */
function grantKeys(raw) {
  const ap = resolveAuthPermissions(parseMaybe(raw), '') || {};
  return {
    groups: Object.keys(ap.groups || {}).filter(g => g !== 'public').sort(),
    users: Object.keys(ap.users || {}).map(String).sort(),
  };
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const asList = (v) => [].concat(v ?? []).filter(Boolean);

/**
 * Where a row stands against one approved grant: 'apply' (exactly `before`), 'done' (exactly `before` plus the
 * group holding exactly `perms`), or 'refuse' with the reason.
 */
function rowState(raw, item) {
  const now = grantKeys(raw);
  const before = { groups: [...item.before.groups].sort(), users: item.before.users.map(String).sort() };
  if (!sameList(now.users, before.users)) {
    return { state: 'refuse', reason: `user grants are [${now.users}], expected [${before.users}]`, now };
  }
  if (sameList(now.groups, before.groups)) return { state: 'apply', now };
  const after = [...before.groups, item.group].sort();
  if (sameList(now.groups, after)) {
    const held = asList((resolveAuthPermissions(parseMaybe(raw), '') || {}).groups?.[item.group]).sort();
    if (sameList(held, [...item.perms].sort())) return { state: 'done', now };
    return { state: 'refuse', reason: `${item.group} already holds [${held}], not [${item.perms}]`, now };
  }
  return { state: 'refuse', reason: `group grants are [${now.groups}], expected [${before.groups}]`, now };
}

/**
 * `raw` with `group: perms` added, in the row's own format: a JSON string stays a string, an object an object;
 * a subdomain-keyed value ({ '*': …, <subdomain>: … }) gets the grant in its '*' entry only (which keeps its
 * own string/object form). A missing value becomes a flat object.
 */
function withGrant(raw, group, perms) {
  const add = (ap) => {
    const o = parseMaybe(ap) || {};
    return { ...o, groups: { ...(parseMaybe(o.groups) || {}), [group]: [...perms] } };
  };
  const keep = (orig, value) => (typeof orig === 'string' ? JSON.stringify(value) : value);
  const parsed = parseMaybe(raw);
  if (parsed && typeof parsed === 'object' && parsed['*'] !== undefined) {
    return keep(raw, { ...parsed, '*': keep(parsed['*'], add(parsed['*'])) });
  }
  return keep(raw, add(parsed));
}

/** Throws unless `next` resolves to exactly `prev`'s grants plus `group: perms`, and every other key is kept. */
function validateGrant(prev, next, group, perms) {
  const p = resolveAuthPermissions(parseMaybe(prev), '') || {};
  const n = resolveAuthPermissions(parseMaybe(next), '') || {};
  const want = { ...p, groups: { ...(p.groups || {}), [group]: [...perms] } };
  const norm = (ap) => JSON.stringify(ap, Object.keys(flatKeys(ap)).sort());
  if (norm(n) !== norm(want)) throw new Error(`validation: result ${JSON.stringify(n)} != expected ${JSON.stringify(want)}`);
  if (typeof prev === 'string' && typeof next !== 'string') throw new Error('validation: format changed (string → object)');
  if (prev && typeof prev === 'object' && typeof next !== 'object') throw new Error('validation: format changed (object → string)');
  const pp = parseMaybe(prev);
  const np = parseMaybe(next);
  if (pp && pp['*'] !== undefined) {
    for (const k of Object.keys(pp)) {
      if (k !== '*' && JSON.stringify(pp[k]) !== JSON.stringify(np[k])) throw new Error(`validation: subdomain entry ${k} changed`);
    }
  }
}
// Every key path in a value, so the comparison above is order-independent.
function flatKeys(v, acc = {}) {
  if (v && typeof v === 'object') for (const k of Object.keys(v)) { acc[k] = 1; flatKeys(v[k], acc); }
  return acc;
}

module.exports = { APPROVED, grantKeys, rowState, withGrant, validateGrant };
if (require.main !== module) return;

const arg = (name) => {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};
const DMS_DB = arg('dms-db');
const AUTH_DB = arg('auth-db');
const ONLY_APP = arg('app');
const JSON_OUT = arg('json');
const PLAN = process.argv.includes('--plan');
const APPLY = process.argv.includes('--apply');
const BACKUP_DIR = arg('backup-dir');
if (!DMS_DB || !AUTH_DB) {
  console.error('usage: migrate-auth-grants.js --dms-db=<config> --auth-db=<config> [--app=<app>] [--json=<file>] [--plan | --apply --backup-dir=<dir>]');
  process.exit(2);
}
if (APPLY && (!BACKUP_DIR || !process.env.DMS_HOST || !process.env.DMS_AUTH_TOKEN)) {
  console.error('--apply needs --backup-dir=<dir> and DMS_HOST + DMS_AUTH_TOKEN in the environment.');
  process.exit(2);
}

const AUTH_USERS = 'auth-users';
const AUTH_GROUPS = 'auth-groups';
const LEVEL_REASON_PREFIX = 'allowed by auth level only';
const BLANK_REASON_PREFIX = 'blank auth row';

function permsForLevel(level) {
  const n = +level || 0;
  if (n >= 10) return ['*'];
  if (n >= 5) return [AUTH_USERS, AUTH_GROUPS];
  return [];
}

async function readOnlyClient(configName) {
  const c = require(path.join(__dirname, '..', 'db', 'configs', `${configName}.config.json`));
  if (c.type && c.type !== 'postgres') throw new Error(`${configName}: only postgres configs are supported`);
  const cl = new Client({
    host: c.host, port: c.port, database: c.database, user: c.user, password: c.password,
    options: '-c default_transaction_read_only=on',
  });
  await cl.connect();
  let wrote = false;
  try { await cl.query('CREATE TEMP TABLE _write_probe (x int)'); wrote = true; } catch (e) { /* refused: good */ }
  if (wrote) { await cl.end(); throw new Error(`${configName}: write probe was NOT refused, stopping`); }
  return cl;
}

/** The auth row `id` of `app` from the DB (per-app schema or legacy table), or null. */
async function readAuthRow(dms, app, id) {
  const { rows: tables } = await dms.query(
    `SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'data_items' AND table_schema LIKE 'dms%' ORDER BY 1`);
  for (const { table_schema } of tables) {
    const { rows } = await dms.query(
      `SELECT id, app, type, data->>'pattern_type' AS pattern_type, data->'authPermissions' AS ap
         FROM ${table_schema}.data_items WHERE id = $1 AND app = $2`, [id, app]);
    if (rows.length) return { ...rows[0], schema: table_schema };
  }
  return null;
}

// The `dms` CLI, against DMS_HOST with DMS_AUTH_TOKEN (both from the environment). Returns parsed stdout.
function dmsCli(args) {
  const out = execFileSync('dms', [...args, '--compact'], { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}
const cliAuthPermissions = (item) => {
  const data = typeof item.data === 'string' ? JSON.parse(item.data) : (item.data || {});
  return data.authPermissions;
};
// Same value and same form (string vs object). Key order is ignored: Postgres jsonb reorders object keys.
const canonical = (v) => {
  // A string is parsed only when it holds a JSON object/array (a stringified authPermissions or '*' entry);
  // leaf strings like "view-page" are values.
  const p = typeof v === 'string' && /^\s*[[{]/.test(v) ? JSON.parse(v) : v;
  if (Array.isArray(p)) return `[${p.map(canonical).join(',')}]`;
  if (p && typeof p === 'object') return `{${Object.keys(p).sort().map(k => `${JSON.stringify(k)}:${canonical(p[k])}`).join(',')}}`;
  return JSON.stringify(p ?? null);
};
const sameValue = (a, b) => canonical(a) === canonical(b) && typeof (a ?? null) === typeof (b ?? null);

/** --plan / --apply over APPROVED. Returns false when a row was refused or a step failed. */
async function approvedRun(dms) {
  const items = APPROVED.filter(i => !ONLY_APP || i.app === ONLY_APP);
  if (APPLY) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`${APPLY ? 'APPLY' : 'PLAN'}: ${items.length} approved grant(s)${APPLY ? ` via ${process.env.DMS_HOST}` : ''}\n`);
  let ok = true;
  for (const item of items) {
    const label = `${item.app} auth row ${item.id}: ${item.group} += [${item.perms}]`;
    const row = await readAuthRow(dms, item.app, item.id);
    if (!row) { console.log(`✗ ${label}\n   row not found in ${DMS_DB}`); ok = false; if (APPLY) break; continue; }
    if (row.pattern_type !== 'auth') { console.log(`✗ ${label}\n   not an auth pattern (${row.pattern_type})`); ok = false; if (APPLY) break; continue; }
    const st = rowState(row.ap, item);
    if (st.state === 'done') { console.log(`= ${label}\n   already applied, skipped`); continue; }
    if (st.state === 'refuse') { console.log(`✗ ${label}\n   refused: ${st.reason}`); ok = false; if (APPLY) break; continue; }
    const next = withGrant(row.ap, item.group, item.perms);
    try { validateGrant(row.ap, next, item.group, item.perms); } catch (e) { console.log(`✗ ${label}\n   ${e.message}`); ok = false; if (APPLY) break; continue; }
    console.log(`${APPLY ? '→' : '·'} ${label}`);
    console.log(`   before (${row.ap == null ? 'missing' : typeof row.ap}): ${typeof row.ap === 'string' ? row.ap : JSON.stringify(row.ap)}`);
    console.log(`   after  (${typeof next}): ${typeof next === 'string' ? next : JSON.stringify(next)}`);
    if (!APPLY) continue;

    try {
      // Same database: the server's copy of the row must be the one we just checked.
      const served = dmsCli(['raw', 'get', String(item.id), '--app', item.app]);
      if (!sameValue(cliAuthPermissions(served), row.ap)) {
        throw new Error(`the server's row differs from ${DMS_DB}'s (is DMS_HOST serving that database?)`);
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backup = path.join(BACKUP_DIR, `${item.app}-${item.id}-${stamp}.json`);
      fs.writeFileSync(backup, JSON.stringify({ server: served, db: row, item }, null, 2));
      const payload = path.join(BACKUP_DIR, `${item.app}-${item.id}-${stamp}.payload.json`);
      fs.writeFileSync(payload, JSON.stringify({ authPermissions: next }));
      dmsCli(['raw', 'update', String(item.id), '--app', item.app, '--data', payload]);
      const after = await readAuthRow(dms, item.app, item.id);
      if (!sameValue(after.ap, next)) throw new Error(`read-back differs: ${JSON.stringify(after.ap)}`);
      console.log(`   ✓ written and read back; backup ${backup}`);
    } catch (e) {
      console.log(`   ✗ ${e.stderr ? String(e.stderr).trim() : e.message}`);
      ok = false; break;
    }
  }
  console.log(`\n${ok ? 'done' : 'stopped'}${APPLY ? '' : ' (plan only, nothing written)'}`);
  return ok;
}

const hasGrants = (ap) =>
  Object.keys(ap.groups || {}).some(g => g !== 'public') || Object.keys(ap.users || {}).length > 0;

(async () => {
  const dms = await readOnlyClient(DMS_DB);
  const auth = await readOnlyClient(AUTH_DB);
  console.log(`read-only sessions on ${DMS_DB} and ${AUTH_DB} (write probes refused)\n`);
  if (PLAN || APPLY) {
    const ok = await approvedRun(dms);
    await dms.end(); await auth.end();
    process.exit(ok ? 0 : 1);
  }

  // Every data_items table: legacy dms.data_items and per-app dms_<app>.data_items.
  const { rows: tables } = await dms.query(
    `SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'data_items' AND table_schema LIKE 'dms%' ORDER BY 1`);
  const authRows = [];
  for (const { table_schema } of tables) {
    const { rows } = await dms.query(
      `SELECT id, app, type, data->'authPermissions' AS ap FROM ${table_schema}.data_items
        WHERE type LIKE '%:pattern' AND data->>'pattern_type' = 'auth' ${ONLY_APP ? 'AND app = $1' : ''}
        ORDER BY app, id`, ONLY_APP ? [ONLY_APP] : []);
    rows.forEach(r => authRows.push({ ...r, schema: table_schema }));
  }

  const { rows: hasLog } = await dms.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'dms' AND table_name = 'access_log'`);

  const report = [];
  for (const row of authRows) {
    const app = row.app;
    const raw = typeof row.ap === 'string' ? JSON.parse(row.ap || 'null') : row.ap;
    const subdomainKeys = raw && raw['*'] !== undefined ? Object.keys(raw).filter(k => k !== '*') : [];
    const ap = resolveAuthPermissions(raw, '');
    const current = { groups: { ...(ap.groups || {}) }, users: { ...(ap.users || {}) } };
    const blankToday = !hasGrants(current);

    const { rows: groups } = await auth.query(
      `SELECT gp.group_name, gp.auth_level, count(ug.user_email)::int AS members
         FROM groups_in_projects gp LEFT JOIN users_in_groups ug ON ug.group_name = gp.group_name
        WHERE gp.project_name = $1 GROUP BY 1, 2 ORDER BY gp.auth_level DESC, 1`, [app]);

    const add = {};
    const skipped = [];
    for (const g of groups) {
      const want = permsForLevel(g.auth_level);
      if (!want.length) continue;
      if (g.group_name === `${app} Admin`) { skipped.push(`${g.group_name} (passes by name)`); continue; }
      if (g.group_name.toLowerCase() === 'public') { skipped.push(`${g.group_name} (public)`); continue; }
      const held = [].concat(current.groups[g.group_name] || []);
      if (held.includes('*')) continue;
      const missing = want.filter(p => !held.includes(p));
      if (missing.length) add[g.group_name] = { level: g.auth_level, members: g.members, held, add: missing };
    }

    // Who the access log says relied on a level (or the blank row) here, and whether the grants cover them.
    let logLines = [];
    const uncovered = [];
    if (hasLog.length) {
      ({ rows: logLines } = await dms.query(
        `SELECT user_email, perms, reason, sum(count)::int AS n, max(last_seen) AS last
           FROM dms.access_log WHERE guard = 'auth' AND app = $1
            AND (reason LIKE $2 OR reason LIKE $3) GROUP BY 1, 2, 3 ORDER BY 1, 2`,
        [app, `${LEVEL_REASON_PREFIX}%`, `${BLANK_REASON_PREFIX}%`]));
      for (const l of logLines) {
        const { rows: mine } = await auth.query(
          `SELECT gp.group_name FROM users_in_groups ug JOIN groups_in_projects gp ON gp.group_name = ug.group_name
            WHERE ug.user_email = $1 AND gp.project_name = $2`, [l.user_email, app]);
        const names = mine.map(m => m.group_name);
        if (names.includes(`${app} Admin`)) continue;
        const after = new Set(names.flatMap(n => [
          ...[].concat(current.groups[n] || []), ...((add[n] && add[n].add) || [])]));
        const needed = String(l.perms || '').replace(/\s*\(by level.*$/, '').split(/\s+or\s+/).filter(Boolean);
        if (!after.has('*') && !needed.some(p => after.has(p))) {
          uncovered.push({ user: l.user_email, perms: l.perms, reason: l.reason, count: l.n, groups: names });
        }
      }
    }

    report.push({
      app, id: row.id, schema: row.schema, blankToday, subdomainKeys,
      current, add, skipped, levelGroups: groups, logLines: logLines.length, uncovered,
    });
  }

  for (const r of report) {
    console.log(`== ${r.app}  auth row ${r.id} (${r.schema})`);
    console.log(`   grants today: ${r.blankToday ? 'none besides public (any signed-in user passes under log)' : JSON.stringify(r.current.groups)}`);
    if (r.subdomainKeys.length) console.log(`   ! subdomain-specific grants also set for: ${r.subdomainKeys.join(', ')} (not handled; '*' only)`);
    const adds = Object.entries(r.add);
    if (!adds.length) console.log('   would add: nothing');
    for (const [g, a] of adds) {
      console.log(`   would add: ${g} (level ${a.level}, ${a.members} members) += ${a.add.join(', ')}${a.held.length ? `  [holds ${a.held.join(', ')}]` : ''}`);
    }
    if (r.skipped.length) console.log(`   skipped: ${r.skipped.join('; ')}`);
    if (r.blankToday && adds.length) console.log('   ! the row has no grants today: adding any ends "any signed-in user passes" at once, even under log');
    console.log(`   access log: ${r.logLines} level / blank-row line(s); uncovered after the grants: ${r.uncovered.length}`);
    for (const u of r.uncovered) console.log(`     - ${u.user}: ${u.perms} x${u.count} [groups: ${u.groups.join(', ') || 'none in project'}]`);
    console.log('');
  }
  const total = report.reduce((n, r) => n + Object.keys(r.add).length, 0);
  console.log(`${report.length} auth row(s); ${total} group grant(s) would be added; ${report.reduce((n, r) => n + r.uncovered.length, 0)} uncovered log line(s). Nothing written.`);

  if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2)); console.log(`report: ${JSON_OUT}`); }
  await dms.end(); await auth.end();
})().catch(e => { console.error(e.message); process.exit(1); });
