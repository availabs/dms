#!/usr/bin/env node
'use strict';

/**
 * A dmsEnv belongs to ONE app. Cross-app dmsEnv references are an invalid state.
 *
 * WHY THE RULE, AND WHY IT IS NOT "MAKE CROSS-APP AUTH WORK"
 * ---------------------------------------------------------
 * A UDA env string is `{app}+{instance}` for an INTERNAL (dms) env, and a bare name for an external
 * pgEnv — `isDmsEnv` is literally `env.includes('+')` (routes/uda/readAuth.js:54). **pgEnvs may be
 * cross-app and that is fine**; this script never touches them. Only the `+` form is scoped, because
 * the app prefix is what every auth path resolves the chain against:
 *
 *     const [app] = String(env).split('+');     // rowSourceAuth.mergedAuthForSource
 *
 * So a section naming `otherapp+jurisdictions` is judged against OTHER APP's patterns, grants and
 * vocabulary. Found live on the `rowauth-test` clone: 14,722 of 33,414 components named
 * `mitigat-ny-prod+…`, an app that is unmigrated and has no `authVocabulary` on its datasets
 * pattern. With no vocabulary, `view-page` never expands to the structural verb `read`, so
 * `public: ["view-page"]` conferred NOTHING while `AVAIL: ["*"]` sailed through — a logged-out
 * visitor lost 327 lines of a public county page and no error was raised anywhere.
 * (planning/tasks/current/row-auth-uda.md has the full trace.)
 *
 * The fix is not to teach the resolver to walk into another app. It is to say an app's content may
 * only name that app's envs, and to move the envs so that holds.
 *
 * Usage
 *   node app-scope-dmsenvs.js --db <config> --app <app> --check
 *   node app-scope-dmsenvs.js --db <config> --app <app> --adopt --from <sourceApp>
 *   node app-scope-dmsenvs.js --db <config> --app <app> --adopt --from <sourceApp> --apply
 *
 * `--check` is read-only and exits 1 when the app names a foreign env, so it can guard a cutover.
 * `--adopt` is a DRY RUN unless `--apply` is passed. It never writes to `--from`.
 */

const { getDb } = require('../db');
const { loadConfig } = require('../db/config');
const {
  resolveTable, ensureTable, ensureSequence, getSequenceName,
} = require('../db/table-resolver');

function parseArgs(argv) {
  const o = { db: null, app: null, from: null, check: false, adopt: false, apply: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--db': o.db = argv[++i]; break;
      case '--app': o.app = argv[++i]; break;
      case '--from': o.from = argv[++i]; break;
      case '--check': o.check = true; break;
      case '--adopt': o.adopt = true; break;
      case '--apply': o.apply = true; break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  if (!o.db || !o.app) throw new Error('--db and --app are required');
  if (!o.check && !o.adopt) o.check = true;
  if (o.adopt && !o.from) throw new Error('--adopt needs --from <sourceApp>');
  return o;
}

/** The kinds that constitute the datasets side of an app. Data rows live in split tables. */
const DATASET_KINDS = ["type LIKE '%:dmsenv'", "type LIKE '%:source'", "type LIKE '%:view'"];

const schemaFor = (app, db, splitMode) => resolveTable(app, '', db.type, splitMode).schema;

/**
 * Every `{app}+{instance}` reference in `app`'s rows whose prefix is not `app`.
 *
 * Matched against the row's `data` as TEXT. The references sit at many depths and under several
 * keys (`env`, `srcEnv`, `metaEnv`, `format`, `ref`, `source_id`'s siblings…), some of them inside
 * strings that were themselves JSON-encoded before being stored — a structural walk misses those,
 * and that is exactly how this went unnoticed. Text is the honest level to look at.
 */
async function findForeignEnvs(db, schema, app) {
  // ANCHOR ON THE QUOTES. A bare `([\\w-]+)\\+([\\w-]+)` matches `x+y` anywhere in the text — inside
  // base64 image data, CSS transforms, encoded filter blobs — and reported 60+ "apps" with names
  // like `8`, `name` and `z`. An env reference is always a WHOLE JSON string value, so require the
  // delimiters, allowing the backslash-escaped form that nested-encoded JSON stores.
  const { rows } = await db.query(
    `SELECT m[1] AS ref, count(*)::int AS n
       FROM ${schema}.data_items,
            LATERAL regexp_matches(
              data::text,
              '\\\\?"([a-zA-Z][a-zA-Z0-9_-]*)\\+[a-zA-Z0-9][a-zA-Z0-9_.|:-]*\\\\?"', 'g') AS m
      WHERE m[1] <> $1
      GROUP BY 1 ORDER BY n DESC`, [app]);

  // AND the bare form. An env string is `{app}+{instance}`, but the app half is often stored on its
  // own under an `app` key — `data.app` on a source row, `sourceInfo.app` / `externalSource.app`
  // inside a section's state — and the CLIENT composes the env from it. Matching only `app+` missed
  // 14,508 of these on `rowauth-test` and called the app CLEAN while it still read prod's data.
  // The key may be escaped (\"app\") because section state is JSON encoded inside JSON.
  const { rows: bare } = await db.query(
    `SELECT m[1] AS ref, count(*)::int AS n
       FROM ${schema}.data_items,
            LATERAL regexp_matches(
              data::text, '\\\\?"app\\\\?"\\s*:\\s*\\\\?"([A-Za-z0-9_-]+)\\\\?"', 'g') AS m
      WHERE m[1] <> $1
      GROUP BY 1 ORDER BY n DESC`, [app]);

  const total = new Map(rows.map(r => [r.ref, r.n]));
  for (const b of bare) total.set(b.ref, (total.get(b.ref) || 0) + b.n);
  return [...total].map(([ref, n]) => ({ ref, n })).sort((a, b) => b.n - a.n);
}

async function rowsNaming(db, schema, foreignApp) {
  const { rows } = await db.query(
    `SELECT CASE WHEN type LIKE '%|component' THEN 'component'
                 WHEN type LIKE '%|page'      THEN 'page'
                 WHEN type LIKE '%:pattern'   THEN 'pattern'
                 ELSE 'other' END AS kind, count(*)::int AS n
       FROM ${schema}.data_items WHERE data::text LIKE $1
      GROUP BY 1 ORDER BY n DESC`, [`%${foreignApp}+%`]);
  return rows;
}

async function check(db, opts, splitMode) {
  const schema = schemaFor(opts.app, db, splitMode);
  console.log(`\ncross-app env check — ${opts.app}  (${schema})\n`);
  const foreign = await findForeignEnvs(db, schema, opts.app);
  if (!foreign.length) {
    console.log('  CLEAN — every `app+instance` reference names this app.\n');
    return 0;
  }
  console.log('  INVALID — this app names envs belonging to other apps:\n');
  for (const f of foreign) {
    console.log(`    ${f.ref.padEnd(24)} ${f.n} reference(s)`);
    for (const r of await rowsNaming(db, schema, f.ref)) {
      console.log(`        on ${String(r.n).padStart(6)} ${r.kind} row(s)`);
    }
  }
  console.log(`\n  Repair:  --adopt --from ${foreign[0].ref} --apply\n`);
  return 1;
}

async function adopt(db, opts, splitMode) {
  const target = schemaFor(opts.app, db, splitMode);
  const source = schemaFor(opts.from, db, splitMode);
  const write = opts.apply;
  console.log(`\nadopt dmsEnvs — ${opts.from} (${source})  →  ${opts.app} (${target})`);
  console.log(write ? '  *** APPLYING ***\n' : '  DRY RUN — nothing will be written\n');

  // ---- 1. the dmsenv / source / view rows -------------------------------------------------
  const { rows: owned } = await db.query(
    `SELECT id, type FROM ${source}.data_items WHERE ${DATASET_KINDS.join(' OR ')} ORDER BY id`, []);
  const { rows: already } = await db.query(
    `SELECT id FROM ${target}.data_items WHERE ${DATASET_KINDS.join(' OR ')}`, []);
  const have = new Set(already.map(r => String(r.id)));
  const todo = owned.filter(r => !have.has(String(r.id)));
  const byKind = {};
  for (const r of owned) {
    const k = r.type.replace(/^.*:/, '');
    byKind[k] = (byKind[k] || 0) + 1;
  }
  console.log('1. dataset rows to copy (ids preserved, so every existing reference still resolves)');
  for (const [k, n] of Object.entries(byKind)) console.log(`     ${k.padEnd(8)} ${n}`);
  console.log(`     already present in ${opts.app}: ${owned.length - todo.length};  to copy: ${todo.length}`);

  if (write && todo.length) {
    // `auth` / `parent_id` are deliberately left NULL — run migrate-row-auth.js afterwards so the
    // backfill treats them exactly like the app's own rows rather than importing a half state.
    await db.query(
      `INSERT INTO ${target}.data_items (id, app, type, data, created_at, created_by, updated_at, updated_by)
       SELECT id, $1, type, data, created_at, created_by, updated_at, updated_by
         FROM ${source}.data_items
        WHERE (${DATASET_KINDS.join(' OR ')})
          AND id NOT IN (SELECT id FROM ${target}.data_items)`, [opts.app]);
  }

  // ---- 2. the split tables ------------------------------------------------------------------
  const { rows: tbls } = await db.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = $1 AND table_name LIKE 'data_items\\_\\_%' ORDER BY 1`, [source]);
  const counts = [];
  for (const t of tbls) {
    const { rows } = await db.query(`SELECT count(*)::int n FROM ${source}."${t.table_name}"`, []);
    if (rows[0].n) counts.push([t.table_name, rows[0].n]);
  }
  const totalRows = counts.reduce((a, [, n]) => a + n, 0);
  console.log(`\n2. split data tables: ${tbls.length} found, ${counts.length} non-empty, ${totalRows} row(s)`);
  console.log('     (on postgres the app lives in the SCHEMA, not the table name, so names carry over as-is)');

  const seqName = getSequenceName(opts.app, db.type, splitMode);
  let copied = 0;
  for (const [name, n] of counts) {
    const { rows: exists } = await db.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`, [target, name]);
    if (exists.length) { console.log(`     skip (already there) ${name}`); continue; }
    if (write) {
      await ensureSequence(db, opts.app, db.type, splitMode);
      await ensureTable(db, target, name, db.type, seqName);
      await db.query(
        `INSERT INTO ${target}."${name}" (id, app, type, data, created_at, created_by, updated_at, updated_by)
         SELECT id, $1, type, data, created_at, created_by, updated_at, updated_by FROM ${source}."${name}"`,
        [opts.app]);
    }
    copied++;
  }
  console.log(`     ${write ? 'copied' : 'would copy'} ${copied} table(s)`);

  // ---- 3. rewrite the references ------------------------------------------------------------
  const { rows: refRows } = await db.query(
    `SELECT count(*)::int n FROM ${target}.data_items WHERE data::text LIKE $1`, [`%${opts.from}%`]);
  console.log(`\n3. rewrite "${opts.from}+" → "${opts.app}+" in ${opts.app}'s rows`);
  console.log(`     rows naming it in either form: ${refRows[0].n}`);
  console.log('     every one is a self-reference in a copy of this app\'s own content, so the');
  console.log('     prefix is replaced wholesale — an app naming another app is the invalid state');
  console.log('     this script exists to remove, whether the reference is an env or a content key.');
  // Two forms, and missing the second is what left the clone still reading prod. `{app}+{instance}`
  // is the composed env; a lone `"app": "{app}"` is the half the client composes it FROM. Only the
  // `app` KEY is rewritten, never a bare occurrence elsewhere, so a title or a sentence naming the
  // other app is left alone.
  const APP_KEY = '(\\\\?"app\\\\?"\\s*:\\s*\\\\?")' + opts.from + '(\\\\?")';
  if (write) {
    await db.query(
      `UPDATE ${target}.data_items
          SET data = regexp_replace(replace(data::text, $1, $2), $4, '\\1' || $5 || '\\2', 'g')::jsonb
        WHERE data::text LIKE $3 OR data::text LIKE $6`,
      [`${opts.from}+`, `${opts.app}+`, `%${opts.from}+%`, APP_KEY, opts.app, `%${opts.from}%`]);
    for (const [name] of counts) {
      await db.query(
        `UPDATE ${target}."${name}"
            SET data = regexp_replace(replace(data::text, $1, $2), $4, '\\1' || $5 || '\\2', 'g')::jsonb
          WHERE data::text LIKE $3 OR data::text LIKE $6`,
        [`${opts.from}+`, `${opts.app}+`, `%${opts.from}+%`, APP_KEY, opts.app, `%${opts.from}%`]).catch(() => {});
    }
  }

  if (!write) { console.log('\nDRY RUN — nothing was written. Re-run with --apply.\n'); return 0; }
  console.log('\nDone. Next: re-run migrate-row-auth.js (--apply) so the copied rows get');
  console.log('`auth` / `parent_id`, then --sync-vocabulary, then --check here to confirm CLEAN.\n');
  return 0;
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  const db = getDb(opts.db);
  let splitMode;
  try { splitMode = loadConfig(opts.db).splitMode; } catch { /* fall through */ }
  splitMode = splitMode || process.env.DMS_SPLIT_MODE || 'legacy';
  const code = opts.adopt ? await adopt(db, opts, splitMode) : await check(db, opts, splitMode);
  process.exit(code);
})().catch((e) => { console.error(e.message); process.exit(2); });
