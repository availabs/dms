#!/usr/bin/env node
'use strict';
/**
 * THE DATASETS SWEEP — put a datasets pattern's grants on the ENV row it manages, where the walk reads them.
 *
 *     node sweep-datasets-grants.js --db <config> --app <app> [--apply] [--verify]
 *
 * ---------------------------------------------------------------------------
 * Why
 *
 * A source's type is `{env}|{name}:source`: the env is its parent, the datasets pattern is nowhere in
 * its ancestry — the pattern only POINTS at the env (`data.dmsEnvId`). Until 2026-11-05 the rules
 * named a position, `patterns:datasets`, that the walk resolved by knowing that pattern type's
 * attributes (`owners.js patternsOver`), so the pattern's grants reached the sources anyway. Rule 2
 * (planning/tasks/current/auth-grants-on-the-owner-row.md) retired the position: a rule's owners are
 * resolved by walking the row's parents and nothing else. The grants move to the env row.
 *
 * What moves, per datasets pattern with a `dmsEnvId`:
 *   - every grant on the pattern row → the env row's `data.authPermissions` (flat, both scopes);
 *   - `edit-pattern-permissions` holders also get `edit-source-permissions` on the env, since editing
 *     the env's grants is now gated by that verb on the env (admin.format.js dmsenv rule).
 * `view-sources`, `view-pattern`, `edit-pattern`, `edit-pattern-permissions` stay on the pattern too:
 * they govern the pattern row and its routes, which is where they belong.
 *
 * A datasets pattern with no env (a legacy `data.sources` list) is reported and skipped: give it an env
 * first (`migrate-to-dmsenv.js`). A pgEnv's `:dmsenv` row (`data.pgEnv`) is reached the same way, through
 * the pattern that names it, so external sources are covered by the same sweep.
 *
 * ADDITIVE AND IDEMPOTENT. Nothing is removed from any row; a second run reports nothing to do.
 * `--verify` exits non-zero while any principal would still lose a verb.
 */
const { loadConfig } = require('../db/config');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { resolveTable } = require('../db/table-resolver');
const { resolveAuthPermissions, scopeOf } = require('../routes/auth/grants');

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

/** A pattern's grants as the walk lent them: the descendants scope, resolved for the default subdomain. */
function lent(pattern) {
  const ap = scopeOf(resolveAuthPermissions((parse(pattern.data) || {}).authPermissions, ''), 'descendants') || {};
  const out = union([ap]);
  // editing the env's grants needs edit-source-permissions ON the env
  for (const k of ['groups', 'users']) for (const [who, perms] of Object.entries(out[k])) {
    if (perms.includes('edit-pattern-permissions') && !perms.includes('edit-source-permissions')) perms.push('edit-source-permissions');
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

  console.log(`\ndatasets sweep — ${o.verify ? 'VERIFY' : o.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}\n`);

  const rows = await q(`SELECT id, type, data FROM ${T} WHERE app = $1 AND (type LIKE '%:pattern' OR type LIKE '%:dmsenv')`, [o.app]);
  const byId = new Map(rows.map(r => [String(r.id), r]));
  const patterns = rows.filter(r => r.type.endsWith(':pattern') && (parse(r.data) || {}).pattern_type === 'datasets');

  const plan = [];   // { env, pattern, adds: [{ bucket, who, perms, missing }] }
  const skipped = [];
  for (const p of patterns) {
    const data = parse(p.data) || {};
    const env = data.dmsEnvId != null ? byId.get(String(data.dmsEnvId)) : null;
    if (!env || !env.type.endsWith(':dmsenv')) { skipped.push(p); continue; }
    const want = lent(p);
    const envData = parse(env.data) || {};
    const have = resolveAuthPermissions(envData.authPermissions, '') || {};
    const adds = [];
    for (const k of ['groups', 'users']) {
      for (const [who, perms] of Object.entries(want[k] || {})) {
        const mine = [].concat((have[k] || {})[who] || []);
        const missing = perms.filter(x => !mine.includes(x));
        if (missing.length) adds.push({ bucket: k, who, perms: [...new Set([...mine, ...missing])], missing });
      }
    }
    if (adds.length) plan.push({ env, pattern: p, adds });
  }

  for (const p of skipped) console.log(`  ! pattern #${p.id} ${p.type} names no env (legacy sources list): run migrate-to-dmsenv.js first`);
  console.log(`  datasets patterns            ${patterns.length}`);
  console.log(`  env rows to update           ${plan.length}\n`);
  for (const { env, pattern, adds } of plan) {
    console.log(`  env #${env.id} ${env.type}   ← pattern #${pattern.id}`);
    for (const a of adds) console.log(`   + ${a.bucket}.${a.who} = [${a.perms.join(', ')}]   (adds: ${a.missing.join(', ')})`);
  }

  if (o.verify) {
    const ok = plan.length === 0 && skipped.length === 0;
    console.log(ok
      ? '\n  ✓ EVERY ENV ROW CARRIES ITS PATTERN\'S GRANTS.'
      : `\n  ✗ ${plan.length} env row(s) still short, ${skipped.length} pattern(s) with no env.`);
    await db.end();
    process.exit(ok ? 0 : 1);
  }
  if (!plan.length) { console.log('\n  Nothing to do.'); await db.end(); return; }
  if (!o.apply) { console.log('\nDRY RUN — nothing was written. Re-run with --apply, then --verify.'); await db.end(); return; }

  const set = config.type === 'postgres'
    ? `data = jsonb_set(COALESCE(data, '{}'::jsonb), '{authPermissions}', $2::jsonb)`
    : `data = json_set(COALESCE(data, '{}'), '$.authPermissions', json($2))`;
  // Several patterns may point at one env: merge all of them before writing it once.
  const merged = new Map();
  for (const { env, adds } of plan) {
    const envData = parse(env.data) || {};
    const stored = parse(envData.authPermissions);
    if (stored && stored['*'] !== undefined) {
      console.log(`\n  ✗ env #${env.id} holds per-subdomain grants in data.authPermissions; merge by hand.`);
      await db.end(); process.exit(1);
    }
    const cur = merged.get(env.id) || union([resolveAuthPermissions(envData.authPermissions, '') || {}]);
    for (const a of adds) cur[a.bucket][a.who] = [...new Set([...(cur[a.bucket][a.who] || []), ...a.perms])];
    merged.set(env.id, cur);
  }
  for (const [id, ap] of merged) await q(`UPDATE ${T} SET ${set} WHERE id = $1`, [id, JSON.stringify(ap)]);
  console.log(`\n  wrote ${merged.size} env row(s). Re-run with --verify.`);
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
