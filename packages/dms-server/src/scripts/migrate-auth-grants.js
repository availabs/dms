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
 * must be refused before anything is read. There is no --apply yet: the owner reviews the dry run first.
 */
const path = require('path');
const fs = require('fs');
const { Client } = require('pg');
const { resolveAuthPermissions } = require('../routes/auth/auth');

const arg = (name) => {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};
const DMS_DB = arg('dms-db');
const AUTH_DB = arg('auth-db');
const ONLY_APP = arg('app');
const JSON_OUT = arg('json');
if (!DMS_DB || !AUTH_DB) {
  console.error('usage: migrate-auth-grants.js --dms-db=<config> --auth-db=<config> [--app=<app>] [--json=<file>]');
  process.exit(2);
}
if (process.argv.includes('--apply')) {
  console.error('--apply is not built: the owner reviews the dry run first.');
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

const hasGrants = (ap) =>
  Object.keys(ap.groups || {}).some(g => g !== 'public') || Object.keys(ap.users || {}).length > 0;

(async () => {
  const dms = await readOnlyClient(DMS_DB);
  const auth = await readOnlyClient(AUTH_DB);
  console.log(`read-only sessions on ${DMS_DB} and ${AUTH_DB} (write probes refused)\n`);

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
