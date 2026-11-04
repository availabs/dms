#!/usr/bin/env node
'use strict';
/**
 * THE SITE SWEEP — put the site's grants on the site ROW, where parentage can reach them.
 *
 *     node sweep-site-grants.js --db <config> --app <app> [--apply] [--verify]
 *
 * ---------------------------------------------------------------------------
 * Why
 *
 * Kind auth's "site grants" are the ADMIN PATTERN row's `authPermissions`, falling back to the auth
 * pattern's while admin grants nothing (`dataAuth.siteGrants`). That row is a SIBLING of what those
 * grants govern — the site row, a tenant, a dmsEnv — not an ancestor of it. Row auth walks
 * `parent_id`, reaches the site row, finds it states nothing, and refuses what kind auth allows.
 *
 * It fails closed, so nothing is exposed; it just means an app cannot be switched to row auth
 * without losing site-level editing. The fix is in the DATA, not the judge: the site row carries
 * the grants, and both implementations then find them the way each already looks.
 *
 * ADDITIVE AND IDEMPOTENT. Merges into the site row's existing grants, never removes, and a second
 * run reports nothing to do. `--verify` exits non-zero while any principal would still lose.
 */
const { loadConfig } = require('../db/config');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { resolveTable } = require('../db/table-resolver');
const { resolveAuthPermissions } = require('../routes/auth/auth');

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

async function main() {
  const o = parseArgs();
  const config = loadConfig(o.db);
  const db = config.type === 'postgres' ? new PostgresAdapter(config) : new SqliteAdapter(config);
  const q = (sql, v) => db.promise(sql, v).then(r => r.rows ?? r);
  const t = resolveTable(o.app, '', config.type, config.splitMode);
  const T = config.type === 'postgres' ? `"${t.schema}"."${t.table}"` : t.table;

  console.log(`\nsite sweep — ${o.verify ? 'VERIFY' : o.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}\n`);

  const patterns = await q(`SELECT id, type, auth, data FROM ${T} WHERE app = $1 AND type LIKE '%:pattern'`, [o.app]);
  const ptOf = (r) => (parse(r.data) || {}).pattern_type;
  const grantsOfPattern = (r) => resolveAuthPermissions((parse(r.data) || {}).authPermissions, '') || {};
  const named = (pt) => patterns.filter(r => ptOf(r) === pt).map(grantsOfPattern);
  const hasAny = (ap) => Object.keys(ap.groups || {}).length || Object.keys(ap.users || {}).length;

  // `siteGrants()`: the admin rows' union, falling back to the auth pattern's while admin is blank.
  const admin = union(named('admin'));
  const want = hasAny(admin) ? admin : union(named('auth'));

  const [site] = await q(`SELECT id, type, auth, data FROM ${T} WHERE app = $1 AND type LIKE '%:site'`, [o.app]);
  if (!site) { console.log('  no :site row for this app — nothing to do.'); await db.end(); return; }

  const col = parse(site.auth) || {};
  const { vocabulary, childRefs, view, ...rest } = col;
  const have = resolveAuthPermissions(rest, '') || {};
  const branch = rest['*'] !== undefined ? '*' : null;

  const adds = [];
  for (const k of ['groups', 'users']) {
    for (const [who, perms] of Object.entries(want[k] || {})) {
      const mine = [].concat((have[k] || {})[who] || []);
      const missing = [].concat(perms || []).filter(p => !mine.includes(p));
      if (missing.length) adds.push({ bucket: k, who, perms: [...new Set([...mine, ...missing])], missing });
    }
  }

  console.log(`  site row                     #${site.id} ${site.type}`);
  console.log(`  site-level grants, today on  ${hasAny(admin) ? 'the admin pattern' : 'the auth pattern'}`);
  console.log(`  principals to carry over     ${adds.length}\n`);
  for (const a of adds) console.log(`   + ${a.bucket}.${a.who} = [${a.perms.join(', ')}]   (adds: ${a.missing.join(', ')})`);

  if (o.verify) {
    const ok = adds.length === 0;
    console.log(ok
      ? '\n  ✓ THE SITE ROW CARRIES EVERY SITE-LEVEL GRANT. Parentage can reach them.'
      : `\n  ✗ ${adds.length} principal(s) still reachable only through the pattern row.`);
    await db.end();
    process.exit(ok ? 0 : 1);
  }
  if (!adds.length) { console.log('\n  Nothing to do.'); await db.end(); return; }
  if (!o.apply) { console.log('\nDRY RUN — nothing was written. Re-run with --apply, then --verify.'); await db.end(); return; }

  const merged = { groups: { ...(have.groups || {}) }, users: { ...(have.users || {}) } };
  for (const a of adds) merged[a.bucket][a.who] = a.perms;
  for (const bucket of ['groups', 'users']) {
    const path = branch ? `{${branch},${bucket}}` : `{${bucket}}`;
    await q(`UPDATE ${T} SET auth = jsonb_set(COALESCE(auth,'{}'::jsonb), $2::text[], $3::jsonb) WHERE id = $1`,
      [site.id, path, JSON.stringify(merged[bucket])]);
  }
  console.log(`\n  wrote ${adds.length} principal(s) onto the site row. Re-run with --verify.`);
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
