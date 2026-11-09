#!/usr/bin/env node
/**
 * Backfill `view-pattern` beside every pattern-row grant of `view-page`.
 *
 *     node backfill-view-pattern.js --db <config> --app <app> [--apply]
 *
 * WHY. `view-page` used to mean two different things: "view a page" on a page pattern, and "read
 * the pattern row" everywhere else (dms-server kindReadAuth.js `PATTERN_READ_PERMISSIONS`). Phase 2
 * of planning/tasks/current/permission-domain-single-source.md gave the second meaning its own
 * verb, `view-pattern`, declared in the shared `admin+pattern` domain.
 *
 * WHY A BACKFILL AND NOT A RENAME. Every stored grant sits under the scope-wildcard `*`, which
 * satisfies `self` and `descendants` alike — there are no scope-split grants in the wild yet. So on
 * a page pattern the SAME `view-page` entry is doing both jobs: letting a group see the pages AND
 * earning them the read on the pattern row. Rewrite it to `view-pattern` and every page on the site
 * stops rendering; leave it alone and the pattern row stops loading once `kindReadAuth.js` drops
 * its dual-accept. So this ADDS, and removes nothing.
 *
 * `kindReadAuth.js` accepts both verbs until this has run everywhere; only then does `view-page`
 * leave the pattern-row read set.
 *
 * SCOPES. `*` and `self` and a flat (unscoped) object grant the pattern row. `descendants` does
 * NOT — there `view-page` means a page, and adding `view-pattern` would be noise. Skipped.
 *
 * Dry run unless `--apply`.
 */
const { getDb, awaitReady, loadConfig } = require('../db');
const { resolveTable } = require('../db/table-resolver');

const VIEW_PAGE = 'view-page';
const VIEW_PATTERN = 'view-pattern';
// Keys of an `auth` column that are DECLARATIONS, not grants (routes/dms/authVocabulary.js).
const DECLARATIONS = new Set(['vocabulary', 'childRefs', 'view', 'publicRead']);
// Scopes whose grants are read when judging the PATTERN ROW itself.
const SELF_SCOPES = new Set(['*', 'self']);

function parseMaybe(v) {
  if (typeof v !== 'string') return { value: v, wasString: false };
  try { return { value: JSON.parse(v), wasString: true }; } catch { return { value: null, wasString: true }; }
}

/** Add VIEW_PATTERN beside VIEW_PAGE in one `{users,groups,otherwise}` object. Returns [obj, n]. */
function addToGrants(grants) {
  if (!grants || typeof grants !== 'object' || Array.isArray(grants)) return [grants, 0];
  let n = 0;
  const out = { ...grants };
  for (const kind of ['users', 'groups']) {
    if (!out[kind] || typeof out[kind] !== 'object') continue;
    const bucket = {};
    for (const [who, perms] of Object.entries(out[kind])) {
      const list = Array.isArray(perms) ? perms : (perms ? [perms] : []);
      if (list.includes(VIEW_PAGE) && !list.includes(VIEW_PATTERN)) { bucket[who] = [...list, VIEW_PATTERN]; n++; }
      else bucket[who] = perms;
    }
    out[kind] = bucket;
  }
  return [out, n];
}

/** Walk a whole `auth` column or `data.authPermissions` object. Returns [obj, n]. */
function addToContainer(container) {
  if (!container || typeof container !== 'object' || Array.isArray(container)) return [container, 0];
  // A flat, unscoped object: the grants are right here.
  if (container.users || container.groups || container.otherwise !== undefined) return addToGrants(container);
  let n = 0;
  const out = { ...container };
  for (const [scope, raw] of Object.entries(container)) {
    if (DECLARATIONS.has(scope) || !SELF_SCOPES.has(scope)) continue;
    const { value, wasString } = parseMaybe(raw);
    if (!value) continue;
    const [next, added] = addToGrants(value);
    if (!added) continue;
    n += added;
    out[scope] = wasString ? JSON.stringify(next) : next;
  }
  return [out, n];
}

async function main() {
  const a = process.argv.slice(2);
  const o = { apply: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
    else if (a[i] === '--apply') o.apply = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  if (!o.db || !o.app) { console.error('--db and --app are required'); process.exit(1); }

  const db = getDb(o.db); await awaitReady();
  const config = loadConfig(o.db);
  const splitMode = config.splitMode || process.env.DMS_SPLIT_MODE || 'legacy';
  const t = resolveTable(o.app, '', db.type, splitMode);
  const T = db.type === 'postgres' ? `"${t.schema}"."${t.table}"` : `"${t.table}"`;

  console.log(`backfill view-pattern — ${o.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}  table=${T}\n`);

  const { rows } = await db.query(
    `SELECT id, data->>'pattern_type' AS pattern_type, auth, data->'authPermissions' AS ap
       FROM ${T} WHERE app = $1 AND type LIKE '%:pattern'`, [o.app]);

  let touchedRows = 0, grantsAdded = 0;
  const byType = new Map();
  for (const r of rows) {
    const [nextAuth, nAuth] = addToContainer(typeof r.auth === 'string' ? parseMaybe(r.auth).value : r.auth);
    const [nextAp, nAp] = addToContainer(typeof r.ap === 'string' ? parseMaybe(r.ap).value : r.ap);
    if (!nAuth && !nAp) continue;
    touchedRows++; grantsAdded += nAuth + nAp;
    byType.set(r.pattern_type || '(none)', (byType.get(r.pattern_type || '(none)') || 0) + 1);
    if (o.apply) {
      if (nAuth) await db.query(`UPDATE ${T} SET auth = $2 WHERE id = $1`, [r.id, JSON.stringify(nextAuth)]);
      if (nAp) {
        await db.query(
          `UPDATE ${T} SET data = jsonb_set(data, '{authPermissions}', $2::jsonb) WHERE id = $1`,
          [r.id, JSON.stringify(nextAp)]);
      }
    }
  }

  console.log(`  pattern rows                 ${rows.length}`);
  console.log(`  rows needing the backfill    ${touchedRows}`);
  console.log(`  grants gaining view-pattern  ${grantsAdded}`);
  for (const [type, n] of [...byType].sort()) console.log(`     ${type.padEnd(12)} ${n} row(s)`);
  if (!o.apply) console.log('\nDRY RUN — nothing was written. Re-run with --apply.');
  else console.log(`\nwrote ${touchedRows} row(s)`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
