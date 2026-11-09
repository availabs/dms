#!/usr/bin/env node
'use strict';
/**
 * THE SITE SWEEP — put the site's grants on the site ROW, where the walk reads them.
 *
 *     node sweep-site-grants.js --db <config> --app <app> [--apply] [--verify]
 *
 * ---------------------------------------------------------------------------
 * Why
 *
 * Rule 3 (planning/tasks/current/auth-grants-on-the-owner-row.md): a verb is granted on the row that
 * owns its subject, and site-level verbs — `view-pattern-list`, `create-pattern`, `delete-pattern`,
 * `manage-themes`, `manage-tenants`, and the auth verbs `auth-users`, `auth-groups`, `view-as` (users and
 * groups are not rows, so the site is their subject) — live on the SITE row.
 *
 * Until 2026-11-05 they lived on the site's ADMIN pattern row (falling back to the AUTH pattern's) and
 * the auth verbs on the AUTH pattern row: children of the site, which the walk reached by looking DOWN
 * (`owners.js siteGrants`) and the auth handlers by a client-named `authPatternId`. Both reach-arounds
 * are deleted; the server reads the site row and nothing else. A site that has not been swept keeps
 * working under `DMS_AUTH_MODE=log` (a blank site row lets signed-in users through with a would-deny
 * line), and loses site-level editing under `enforce`.
 *
 * ADDITIVE AND IDEMPOTENT. The union of the admin and auth pattern rows' grants is merged into the site
 * row's `data.authPermissions` (where every client write lands and `grantsOf` reads first); nothing is
 * removed from any row. A second run reports nothing to do. `--verify` exits non-zero while any
 * principal would still lose a verb.
 */
const { loadConfig } = require('../db/config');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { resolveTable } = require('../db/table-resolver');
const { resolveAuthPermissions } = require('../routes/auth/grants');

function parseArgs() {
  const a = process.argv.slice(2); const o = { apply: false, verify: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
    else if (a[i] === '--apply') o.apply = true;
    else if (a[i] === '--verify') o.verify = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  if (!o.db || !o.app) { console.error('--db and --app are required'); process.exit(1); }
  return o;
}

const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };

/** Per principal, the union of every list. */
function union(list) {
  const out = { groups: {}, users: {} };
  for (const ap of list) for (const k of ['groups', 'users']) {
    for (const [who, perms] of Object.entries((ap && ap[k]) || {})) {
      out[k][who] = [...new Set([...(out[k][who] || []), ...[].concat(perms || [])])];
    }
  }
  return out;
}

/** The site row's own grants as `grantsOf` reads them: `data` first, the `auth` column when data names no one. */
function siteOwn(site) {
  const data = parse(site.data) || {};
  const fromData = resolveAuthPermissions(data.authPermissions, '') || {};
  if (Object.keys(fromData.groups || {}).length || Object.keys(fromData.users || {}).length) return fromData;
  const { vocabulary, childRefs, view, ...col } = parse(site.auth) || {};
  return resolveAuthPermissions(col, '') || {};
}

async function main() {
  const o = parseArgs();
  const config = loadConfig(o.db);
  const db = config.type === 'postgres' ? new PostgresAdapter(config) : new SqliteAdapter(config);
  const q = (sql, v) => db.promise(sql, v).then(r => r.rows ?? r);
  const t = resolveTable(o.app, '', config.type, config.splitMode);
  const T = config.type === 'postgres' ? `"${t.schema}"."${t.table}"` : t.table;

  console.log(`\nsite sweep — ${o.verify ? 'VERIFY' : o.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}\n`);

  // `auth` is a migrated column some tables lack: select everything and read it when present.
  const patterns = await q(`SELECT * FROM ${T} WHERE app = $1 AND type LIKE '%:pattern'`, [o.app]);
  const ptOf = (r) => (parse(r.data) || {}).pattern_type;
  const grantsOfPattern = (r) => resolveAuthPermissions((parse(r.data) || {}).authPermissions, '') || {};
  const rowsOf = (pt) => patterns.filter(r => ptOf(r) === pt);
  const want = union([...rowsOf('admin'), ...rowsOf('auth')].map(grantsOfPattern));

  const [site] = await q(`SELECT * FROM ${T} WHERE app = $1 AND type LIKE '%:site'`, [o.app]);
  if (!site) { console.log('  no :site row for this app — nothing to do.'); await db.end(); return; }
  const have = siteOwn(site);

  const adds = [];
  for (const k of ['groups', 'users']) {
    for (const [who, perms] of Object.entries(want[k] || {})) {
      const mine = [].concat((have[k] || {})[who] || []);
      const missing = [].concat(perms || []).filter(p => !mine.includes(p));
      if (missing.length) adds.push({ bucket: k, who, perms: [...new Set([...mine, ...missing])], missing });
    }
  }

  console.log(`  site row                     #${site.id} ${site.type}`);
  console.log(`  from                         admin rows: ${rowsOf('admin').map(r => `#${r.id}`).join(', ') || 'none'}; auth rows: ${rowsOf('auth').map(r => `#${r.id}`).join(', ') || 'none'}`);
  console.log(`  principals to carry over     ${adds.length}\n`);
  for (const a of adds) console.log(`   + ${a.bucket}.${a.who} = [${a.perms.join(', ')}]   (adds: ${a.missing.join(', ')})`);

  if (o.verify) {
    const ok = adds.length === 0;
    console.log(ok
      ? '\n  ✓ THE SITE ROW CARRIES EVERY SITE-LEVEL GRANT.'
      : `\n  ✗ ${adds.length} principal(s) still reachable only through a pattern row.`);
    await db.end();
    process.exit(ok ? 0 : 1);
  }
  if (!adds.length) { console.log('\n  Nothing to do.'); await db.end(); return; }
  if (!o.apply) { console.log('\nDRY RUN — nothing was written. Re-run with --apply, then --verify.'); await db.end(); return; }

  // Written as a flat grant into `data.authPermissions`. A site row whose data holds a per-subdomain
  // grant (`'*'` key) is left for the operator: the per-subdomain shape is not merged blind.
  const data = parse(site.data) || {};
  const stored = parse(data.authPermissions);
  if (stored && stored['*'] !== undefined) {
    console.log('\n  ✗ the site row holds per-subdomain grants in data.authPermissions; merge by hand.');
    await db.end(); process.exit(1);
  }
  const merged = { groups: { ...(have.groups || {}) }, users: { ...(have.users || {}) } };
  for (const a of adds) merged[a.bucket][a.who] = a.perms;
  const set = config.type === 'postgres'
    ? `data = jsonb_set(COALESCE(data, '{}'::jsonb), '{authPermissions}', $2::jsonb)`
    : `data = json_set(COALESCE(data, '{}'), '$.authPermissions', json($2))`;
  await q(`UPDATE ${T} SET ${set} WHERE id = $1`, [site.id, JSON.stringify(merged)]);
  console.log(`\n  wrote ${adds.length} principal(s) onto the site row. Re-run with --verify.`);
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
