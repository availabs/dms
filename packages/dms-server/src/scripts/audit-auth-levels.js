#!/usr/bin/env node
'use strict';
/**
 * WHAT THE LEVEL LADDER STILL DECIDES — read-only, and the prerequisite for removing it.
 *
 *     node audit-auth-levels.js --auth-db <config> --db <config> --app <app> --project <name>
 *     …same, plus --apply   writes the group grants the report names onto the app's auth PATTERN
 *                           row, in the DMS database. Never the auth database.
 *
 * ---------------------------------------------------------------------------
 * Why
 *
 * User and group management has TWO authorities. One is grants on the app's auth pattern row, which
 * `can()` reads. The other is an integer `auth_level` on the user's groups, which
 * `authority().byLevel` reads — a ladder with its own thresholds, answering a question grants also
 * answer, and able to allow what grants refuse.
 *
 * Deleting the ladder is not a code change first; it is a DATA change. Each level has to become a
 * grant, or someone loses access silently. This reports, per user, where the two answers differ —
 * exactly the shape `sweep-source-grants.js --verify` reports for sources.
 *
 * ⚠ READ-ONLY AND IT STAYS THAT WAY. The auth database is shared by every app on the deployment;
 * a write here is not scoped to one site. It only SELECTs.
 */
const { loadConfig } = require('../db/config');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { resolveTable } = require('../db/table-resolver');
const { authUser, can, AUTH_USERS, AUTH_GROUPS } = require('../auth/utils/permissions');
const { resolveAuthPermissions } = require('../routes/auth/grants');

/**
 * THE SITES WHERE A LEVEL ALONE AUTHORISES — read off the handlers, route by route.
 *
 * Only `if (!a.byPermission && !a.byLevel) throw` counts here: there the level is the whole
 * authority, so removing it removes access. Routes that pass `minLevel: Infinity` have already
 * switched the level off, and the ones that compare levels PAIRWISE (`myLevel >= auth_level`, per
 * project — user.js listUsers/listGroups, group.js:154, message.js:131) are a different rule that
 * is not a threshold at all; they are listed in the task file and removed with the rest, but a
 * grant cannot stand in for them one-for-one.
 *
 * An earlier version of this list said `AUTH_USERS` at 5 meant "manage users" and invented a
 * `VIEW_AS` rule at 10 that no route has. Corrected 2026-11-03 against src/auth/handlers/*.js.
 */
const LEVEL_RULES = [
  { perm: AUTH_USERS,  minLevel: 5,  what: 'reject invites / delete join requests (auth.js:283, :297)' },
  { perm: AUTH_USERS,  minLevel: 10, what: 'list the project\'s users (user.js:142)' },
  { perm: AUTH_GROUPS, minLevel: 5,  what: 'add a group to the project (group.js:193)' },
];

function parseArgs() {
  const a = process.argv.slice(2); const o = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--auth-db') o.authDb = a[++i];
    else if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
    else if (a[i] === '--project') o.project = a[++i];
    else if (a[i] === '--apply') o.apply = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  for (const k of ['authDb', 'db', 'app']) if (!o[k]) { console.error('--auth-db, --db and --app are required'); process.exit(1); }
  o.project = o.project || o.app;
  return o;
}

const open = (name) => { const c = loadConfig(name); return c.type === 'postgres' ? new PostgresAdapter(c) : new SqliteAdapter(c); };
const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };

async function main() {
  const o = parseArgs();
  const authDb = open(o.authDb);
  const dmsDb = open(o.db);
  const cfg = loadConfig(o.db);
  const q = (db, sql, v) => db.promise(sql, v).then(r => r.rows ?? r);
  const t = resolveTable(o.app, '', cfg.type, cfg.splitMode);
  const T = cfg.type === 'postgres' ? `"${t.schema}"."${t.table}"` : t.table;

  console.log(`\nauth levels vs grants — READ ONLY`);
  console.log(`  auth-db=${o.authDb}  db=${o.db}  app=${o.app}  project=${o.project}\n`);

  // The app's auth pattern row IS the scope `can()` judges against.
  const rows = await q(dmsDb, `SELECT id, type, auth, data FROM ${T} WHERE app = $1 AND type LIKE '%:pattern'`, [o.app]);
  const authRow = rows.find(r => (parse(r.data) || {}).pattern_type === 'auth');
  if (!authRow) { console.log('  this app has no auth pattern row — the ladder is the only authority here.'); await dmsDb.end(); await authDb.end(); return; }
  const col = parse(authRow.auth) || {};
  const { vocabulary, childRefs, view, ...rest } = col;
  let grants = resolveAuthPermissions(rest, '') || {};
  if (!Object.keys(grants.groups || {}).length && !Object.keys(grants.users || {}).length) {
    grants = resolveAuthPermissions((parse(authRow.data) || {}).authPermissions, '') || {};
  }
  const scope = { app: o.app, grants, id: authRow.id };
  console.log(`  auth pattern row             #${authRow.id}`);
  console.log(`  principals it grants         ${Object.keys(grants.groups || {}).length} group(s), ${Object.keys(grants.users || {}).length} user(s)\n`);

  // Every user with a group in this project, and the highest level any of those groups carries.
  // Mirrors `auth/utils/queries.js getUserGroups`, widened from one user to the whole project.
  const members = await q(authDb, `
    SELECT uig.user_email AS email, uig.group_name, COALESCE(gip.auth_level, 0) AS auth_level
      FROM users_in_groups AS uig
      INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     WHERE gip.project_name = $1`, [o.project]);

  const byUser = new Map();
  for (const m of members) {
    const u = byUser.get(m.email) || { email: m.email, groups: [], level: 0 };
    u.groups.push(m.group_name);
    u.level = Math.max(u.level, +m.auth_level || 0);
    byUser.set(m.email, u);
  }
  console.log(`  users in the project         ${byUser.size}\n`);

  const losers = [];
  for (const u of byUser.values()) {
    const user = authUser({ email: u.email }, u.groups);
    for (const rule of LEVEL_RULES) {
      const byLevel = u.level >= rule.minLevel;
      const byGrant = can(user, rule.perm, scope);
      if (byLevel && !byGrant) losers.push({ ...u, ...rule, });
    }
  }

  // THE FIX, per GROUP rather than per user: grants are written to groups, and a level is carried
  // by a group's `auth_level` in the project. One grant per (group, verb) closes every user the
  // group covers.
  const byGroup = new Map();
  for (const m of members) {
    const lvl = +m.auth_level || 0;
    for (const rule of LEVEL_RULES) {
      if (lvl < rule.minLevel) continue;
      const g = byGroup.get(m.group_name) || new Set();
      g.add(rule.perm); byGroup.set(m.group_name, g);
    }
  }
  const needed = [];
  for (const [group, perms] of byGroup) {
    const have = [].concat((grants.groups || {})[group] || []);
    const missing = [...perms].filter(p => !have.includes(p) && !have.includes('*'));
    if (missing.length) needed.push({ group, have, missing });
  }

  console.log(`WHO LOSES SOMETHING IF THE LEVEL LADDER IS REMOVED: ${losers.length}`);
  for (const l of losers.slice(0, 40)) {
    console.log(`   ${l.email}  level ${l.level}  groups [${l.groups.join(', ')}]`);
    console.log(`      would lose: ${l.perm} (${l.what}) — needs a grant on the auth pattern row`);
  }
  if (losers.length > 40) console.log(`   … and ${losers.length - 40} more`);
  if (!losers.length) {
    console.log('   NOBODY. Every level answer is already matched by a grant, so the ladder can be');
    console.log('   removed for this app with no change in access.');
  }

  console.log(`\nGROUPS THAT NEED A GRANT ON THE AUTH PATTERN ROW: ${needed.length}`);
  for (const n of needed) console.log(`   ${n.group}  + [${n.missing.join(', ')}]${n.have.length ? `  (has: ${n.have.join(', ')})` : ''}`);

  if (!o.apply || !needed.length) {
    if (o.apply) console.log('\n  Nothing to write.');
    else if (needed.length) console.log('\n  Re-run with --apply to write them (the DMS row only — never the auth database).');
    await dmsDb.end(); await authDb.end();
    return;
  }

  // ⚠ THE WRITE GOES TO THE DMS DATABASE, to this app's auth PATTERN row. The auth database is
  // shared by every app on the deployment and this script never writes to it.
  const merged = { groups: { ...(grants.groups || {}) }, users: { ...(grants.users || {}) } };
  for (const n of needed) merged.groups[n.group] = [...new Set([...n.have, ...n.missing])];
  // ⚠ SUBDOMAIN-KEYED, AND THE BRANCH MAY BE A JSON STRING. `resolveAuthPermissions` parses it
  // transparently, so the read is fine — but `jsonb_set` into a path UNDER a string value writes
  // nothing and reports success. This script did exactly that on its first run: 32 groups
  // "written", and the re-run reported the same 32 still needed. Preserve the encoding the row
  // already uses; other readers expect what is there. Same scar as convert-grant-vocabulary.js.
  const branch = rest['*'] !== undefined ? '*' : null;
  const encoded = branch !== null && typeof rest[branch] === 'string';
  if (encoded) {
    const whole = { ...(typeof rest[branch] === 'string' ? JSON.parse(rest[branch]) : rest[branch]), ...merged };
    await q(dmsDb, `UPDATE ${T} SET auth = jsonb_set(COALESCE(auth,'{}'::jsonb), $2::text[], to_jsonb($3::text)) WHERE id = $1`,
      [authRow.id, `{${branch}}`, JSON.stringify(whole)]);
  } else {
    for (const bucket of ['groups', 'users']) {
      const path = branch ? `{${branch},${bucket}}` : `{${bucket}}`;
      await q(dmsDb, `UPDATE ${T} SET auth = jsonb_set(COALESCE(auth,'{}'::jsonb), $2::text[], $3::jsonb) WHERE id = $1`,
        [authRow.id, path, JSON.stringify(merged[bucket])]);
    }
  }
  console.log(`\n  wrote ${needed.length} group grant(s) onto auth pattern row #${authRow.id}. Re-run to verify.`);
  await dmsDb.end(); await authDb.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
