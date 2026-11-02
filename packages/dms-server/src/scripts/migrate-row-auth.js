#!/usr/bin/env node
'use strict';

/**
 * Row-auth migration: fill the `auth` and `parent_id` columns.
 *
 * Design: planning/tasks/current/server-side-auth-general.md (hub).
 * Task: planning/tasks/current/row-auth-schema.md.
 *
 * Runs in four passes, because no single source carries the whole tree. They are ORDERED — each
 * reads what the one before it wrote:
 *
 *   1. the DECLARATIONS — `auth.vocabulary` and `auth.childRefs` ← the manifest the client emits.
 *   2. `auth`      ← `data.authPermissions`, where it holds a populated object.
 *   3. `parent_id` ← the DECLARED reference arrays — the attributes a pattern's `childRefs` names
 *                    as holding its rows' children (`page.sections`, `page.draft_sections`, …).
 *   4. `parent_id` ← the TYPE PATH, for every kind no declaration covers:
 *                      a top-level page → its pattern
 *                      a pattern        → the site
 *
 * Between them they are complete, and `parent_id` becomes a pure column follow at runtime.
 *
 * ---------------------------------------------------------------------------
 * `data.parent` is NOT a source, and as of 2026-10-29 is not a field
 *
 * It is a create-time snapshot that paste and move never maintain. Measured against this pass's
 * own output on `rowauth-test`: of 33,342 components, **17,529 (52.6%)** carry a `data.parent`
 * naming a page other than the one whose `sections` actually lists them, and 231 more name a row
 * that no longer exists. Every one of those disagreements is WITHIN one pattern — a duplicated
 * page keeping the original's ids — never across patterns. Earlier revisions of this script read
 * `data.parent`, so an app migrated by one of those needs `--reset-parents` once to discard it.
 *
 * It has since been retired outright — nothing writes it and nothing reads it (see
 * routes/dms/rowAuth.js's header) — so `--drop-data-parent` removes it from the rows that still
 * carry one, once `parent_id` has taken over for them. That pass touches only a kind that is a
 * declared child and not itself an owner, which is what keeps it away from a PAGE's `data.parent`:
 * same name, different field, and that one is the load-bearing nav tree.
 *
 * The page's own array is the edge the product maintains — it covered 33,342 of 33,342 (100%) — and
 * which arrays those are is DECLARED, never known here
 * (`packages/dms/src/patterns/page/page.childRefs.js`). That is the same declaration `createData`
 * validates a claimed `parent_id` against, so the backfill and the write path agree by construction
 * rather than by review, and a new pattern type with a new ownership attribute is backfilled
 * without a line changing here.
 *
 * A declaration is a statement about a KIND, so the declarations are merged app-wide rather than
 * read per pattern instance. That is what reaches rows whose pattern row is gone: 22,790 of the
 * clone's components sit under a deleted pattern, and a per-instance reading would leave every one
 * of them unparented. Where two patterns disagree about one attribute there is no app-wide answer,
 * so it is reported, not guessed.
 *
 * Pass 4 is held OFF the declared child kinds for the same reason. A component with no page is not
 * handed its pattern as a consolation parent — that skips a level of inheritance, which is
 * permissive in the wrong direction. It stays NULL and is listed.
 *
 * ---------------------------------------------------------------------------
 * Pass 3 REPAIRS two things the column cannot express
 *
 * Both are defects the product should never have allowed; copy/paste/duplicate is being swept
 * separately so they cannot recur. Until that lands, a migration that only reported them would
 * leave the column unable to describe the data:
 *
 *   TWO OWNERS → DUPLICATE. A component listed by two pages has two sets of grants above it and
 *     one `parent_id` to hold them. The lowest-id owner keeps the original, every other owner gets
 *     its own copy, and that owner's arrays are repointed at the copy. The pages render exactly
 *     what they rendered before and the copies can now diverge, which is what whoever duplicated
 *     the page believed was already true. Measured: 72 components, 18 of them in live county
 *     patterns where two pages' `draft_sections` named the SAME rows, so editing one edited both.
 *
 *   NO OWNER → DELETE. A component no page lists cannot be rendered, reached or edited, and has no
 *     parent to inherit from. It is a leak from a delete that did not cascade. "No owner" means
 *     named by no reference array at all — a row named by an owner whose claim fails validation is
 *     a different defect and keeps its row.
 *
 * The delete is why **this must not race live editing**: a child is written before its parent's
 * array is, so a component saved seconds ago is legitimately unnamed. Quiesce writes first.
 *
 * ---------------------------------------------------------------------------
 * Ambiguity is REPORTED, never guessed
 *
 * The type path names a parent by NAME, and names collide: `mitigat-ny-prod` has 323 container rows
 * but only 239 distinct instance names — 21 ambiguous, including "admin" naming two separate
 * `prod|admin:pattern` rows. Attaching a row to the wrong parent silently attaches it to the wrong
 * grants, so pass 3 skips every ambiguous name and lists it for a human.
 *
 * ---------------------------------------------------------------------------
 * Usage
 *
 *   node migrate-row-auth.js --db <config> --app <app>              # dry run, the default
 *   node migrate-row-auth.js --db <config> --app <app> --apply
 *   node migrate-row-auth.js --db <config> --app <app> --apply --add-columns
 *   node migrate-row-auth.js --db <config> --app <app> --apply --reset-parents
 *   node migrate-row-auth.js --db <config> --app <app> --apply --drop-data-parent
 *   node migrate-row-auth.js --db <config> --app <app> --verify-parents      # read-only, exits 1 on drift
 *   node migrate-row-auth.js --db <config> --app <app> --audit-writes        # read-only, needs no migration
 *   node migrate-row-auth.js --db <config> --app <app> --diff-reads          # read-only, kind vs row on READS
 *   node migrate-row-auth.js --db <config> --app <app> --apply --add-uniqueness-guard [kind|all]
 *   node migrate-row-auth.js --db <config> --app <app> --sync-vocabulary <manifest.json> [--apply]
 *
 * Dry run by default: it reports what it WOULD write and what it cannot resolve, and changes
 * nothing. Read the ambiguity list before applying.
 */

const { loadConfig } = require('../db/config');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { resolveTable } = require('../db/table-resolver');
const { getInstance, getParent, getKind } = require('../db/type-utils.js');
const { childRefsOf } = require('../routes/auth/rowAuth/authVocabulary');
const { MAX_DEPTH } = require('../routes/auth/rowAuth/rowAuth');
const { isPlausibleParent, refIdsOf, mergeChildRefs, declaredChildKinds,
        planDuplication, repointRefs } = require('../routes/auth/rowAuth/parentId');
const { createResolver, rawAuthOf } = require('../routes/auth/rowAuth/rowAuth');
const { createGate } = require('../routes/auth/rowAuth/rowAuthGate');
const { kindReadBlocked } = require('../routes/auth/kindAuth/kindReadAuth');
const { resolveAuthPermissions } = require('../routes/auth/auth');
const { isUnstated } = require('../routes/auth/rowAuth/mergeAuth');
const { authColumns } = require('../routes/auth/rowAuth/rowAuthCaps');

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { db: null, app: null, apply: false, addColumns: false, guard: null, vocabulary: null, resetParents: false, verify: false, dropDataParent: false, auditWrites: false, diffReads: false };
  for (let i = 0; i < a.length; i++) {
    switch (a[i]) {
      case '--db': o.db = a[++i]; break;
      case '--app': o.app = a[++i]; break;
      case '--apply': o.apply = true; break;
      case '--add-columns': o.addColumns = true; break;
      case '--reset-parents': o.resetParents = true; break;
      case '--drop-data-parent': o.dropDataParent = true; break;
      case '--verify-parents': o.verify = true; break;
      case '--audit-writes': o.auditWrites = true; break;
      case '--diff-reads': o.diffReads = true; break;
      case '--add-pattern-guard':    o.guard = 'pattern'; break;   // kept: the first spelling
      case '--add-uniqueness-guard': o.guard = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : 'all'; break;
      case '--sync-vocabulary': o.vocabulary = a[++i]; break;
      default: console.error(`Unknown argument: ${a[i]}`); process.exit(1);
    }
  }
  if (!o.db) { console.error('Missing --db <config>'); process.exit(1); }
  if (!o.app) { console.error('Missing --app <app>'); process.exit(1); }
  // Verification must never be the thing that changed what it is verifying.
  if (o.diffReads && o.apply) {
    console.error('--diff-reads is read-only and cannot be combined with --apply.');
    process.exit(1);
  }
  if (o.auditWrites && o.apply) {
    console.error('--audit-writes is read-only and cannot be combined with --apply.');
    process.exit(1);
  }
  if (o.verify && o.apply) {
    console.error('--verify-parents is read-only and cannot be combined with --apply.');
    console.error('Run the migration first, then verify in a second pass.');
    process.exit(1);
  }
  return o;
}

/** `getKind` as SQL, so an owner/child scan never has to fetch the whole table. */
const KIND_SQL = `substring(type from '[^|:]+$')`;

const safeJson = (v) => { try { return JSON.parse(v); } catch { return null; } };

/** Key-order-independent serialisation, for comparing a value against one round-tripped through jsonb. */
const canonical = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
};

let verifyDrift = 0;

async function main() {
  const opts = parseArgs();
  const config = loadConfig(opts.db);
  const db = config.type === 'postgres' ? new PostgresAdapter(config) : new SqliteAdapter(config);
  const q = (sql, v) => db.promise(sql, v).then(r => r.rows ?? r);
  const one = async (sql, v) => (await q(sql, v))[0];

  const t = resolveTable(opts.app, '', config.type, config.splitMode);
  const T = config.type === 'postgres' ? `"${t.schema}"."${t.table}"` : t.table;
  const mode = opts.apply ? 'APPLY' : 'DRY RUN';
  console.log(`\nrow-auth migration — ${mode}\n  db=${opts.db}  app=${opts.app}  table=${T}\n`);

  const total = (await one(`SELECT count(*)::int n FROM ${T} WHERE app = $1`, [opts.app])).n;
  if (!total) { console.log('no rows for that app — nothing to do'); await db.end(); return; }
  console.log(`rows: ${total}`);

  // Which columns exist. The backfill passes need them; the uniqueness report does not, so an
  // unmigrated app can still be AUDITED without being touched — which is the normal first step.
  const { rowAuthCaps, _resetCaps } = require('../routes/auth/rowAuth/rowAuthCaps');
  let caps = await rowAuthCaps(db, t.schema, t.table, config.type);
  console.log(`columns: auth=${caps.auth ? 'yes' : 'NO'}  parent_id=${caps.parentId ? 'yes' : 'NO'}`);
  let canBackfill = caps.auth && caps.parentId;
  if (!canBackfill && !opts.addColumns) {
    console.log('  → backfill passes skipped (add them with --apply --add-columns)');
  }

  if (opts.addColumns) {
    if (!opts.apply) console.log('\n(--add-columns ignored without --apply)');
    else {
      await q(`ALTER TABLE ${T} ADD COLUMN IF NOT EXISTS auth jsonb`);
      await q(`ALTER TABLE ${T} ADD COLUMN IF NOT EXISTS parent_id bigint`);
      await q(`CREATE INDEX IF NOT EXISTS ${t.table}_parent_id_idx ON ${T}(parent_id)`);
      // Re-probe: every pass below branches on `caps`, and the probe above ran before the ALTER.
      // Without this, a first run with --add-columns writes the declarations into `data` and the
      // next run moves them to `auth`, leaving a stale copy behind.
      _resetCaps();
      caps = await rowAuthCaps(db, t.schema, t.table, config.type);
      console.log('\ncolumns and index ensured');
    }
  }
  canBackfill = caps.auth && caps.parentId;

  // ---- pass 1: the DECLARATIONS — vocabulary and childRefs ← the manifest  (--sync-vocabulary)
  //
  // First, because the passes below READ it: pass 3 asks the pattern rows which attributes hold
  // children, and a row that has not been synced declares nothing — so every component would fall
  // through to pass 4, which refuses to guess one.
  //
  // Why a pass here and not a write from the admin UI: every pattern row in every app predates the
  // declaration, and a type's vocabulary changes whenever a verb is added in code. This is one
  // idempotent run that can report coverage, and it puts no write in a render path
  // (planning/tasks/current/row-auth-vocabulary.md).
  //
  // The manifest comes from the CLIENT, because that is where the declaration lives and dms-server
  // cannot read the pattern-type registry:
  //
  //     node packages/dms/scripts/emit-auth-vocabulary.mjs > vocab.json
  //
  // Independent of the `auth`/`parent_id` columns — it writes `data`, so an unmigrated app can be
  // reconciled before, after, or without the backfill.
  if (opts.vocabulary) {
    const manifest = JSON.parse(require('fs').readFileSync(opts.vocabulary, 'utf8'));
    const types = Object.keys(manifest);
    console.log(`\n1. pattern vocabulary + childRefs ← ${opts.vocabulary}`);
    console.log(`     manifest declares: ${types.join(', ') || '(nothing)'}`);

    // Where it goes: the `auth` column when the table has one, else `data` — the same chain the
    // grants use (routes/dms/authVocabulary.js `vocabularyOf`). An unmigrated app can still be
    // reconciled; it just lands in `data`, which is where a client write puts it anyway.
    const intoAuth = caps.auth;
    console.log(`     target column: ${intoAuth ? 'auth.{vocabulary,childRefs}' : 'data.{authVocabulary,childRefs} (table unmigrated)'}`);

    const pt = config.type === 'sqlite'
      ? `json_extract(data, '$.pattern_type')`
      : `data->>'pattern_type'`;
    const pick = (key, dataKey) => intoAuth
      ? (config.type === 'sqlite' ? `json_extract(auth, '$.${key}')` : `auth->'${key}'`)
      : (config.type === 'sqlite' ? `json_extract(data, '$.${dataKey}')` : `data->'${dataKey}'`);
    const rows = await q(
      `SELECT id, type, ${pt} AS pattern_type,
              ${pick('vocabulary', 'authVocabulary')} AS cur_vocabulary,
              ${pick('childRefs', 'childRefs')} AS cur_childrefs
         FROM ${T} WHERE app = $1 AND type LIKE '%:pattern'`, [opts.app]);

    let same = 0, undeclared = 0;
    const writes = [];
    const missingTypes = new Map();
    for (const r of rows) {
      const want = manifest[r.pattern_type];
      if (!want) {
        undeclared++;
        missingTypes.set(r.pattern_type || '(none)', (missingTypes.get(r.pattern_type || '(none)') || 0) + 1);
        continue;
      }
      // Compare CANONICALLY. `jsonb` does not preserve object key order — it sorts by key length
      // then bytewise — so a stored `{label, value, implies}` never string-matches the manifest's
      // `{value, label, implies}` and every run would rewrite every row, reporting
      // `already current: 0` forever. The declaration is still the source of truth: any real
      // difference — a verb added, an `implies` corrected, a childRef attribute renamed — is a write.
      const parse = (v) => (typeof v === 'string' ? safeJson(v) : v);
      const curV = parse(r.cur_vocabulary), curC = parse(r.cur_childrefs);
      const okV = curV && canonical(curV) === canonical(want.vocabulary);
      const okC = canonical(curC ?? null) === canonical(want.childRefs ?? null);
      if (okV && okC) { same++; continue; }
      // `drop` covers a type that USED to declare childRefs and no longer does. Without it the
      // key would survive every run while the comparison kept flagging the row, so the pass
      // would never converge.
      writes.push([r.id, JSON.stringify(want.vocabulary),
                   want.childRefs ? JSON.stringify(want.childRefs) : null, curC != null && !want.childRefs]);
    }

    console.log(`     pattern rows                     ${rows.length}`);
    console.log(`     already current                  ${same}`);
    console.log(`     to write                         ${writes.length}`);
    console.log(`     type not in the manifest         ${undeclared}`);
    for (const [type, n] of missingTypes) {
      console.log(`        ${type}  ×${n}   ← declare authVocabulary on this type, or pass --extra`);
    }

    if (opts.apply && writes.length) {
      const set = (col, key, val) => config.type === 'sqlite'
        ? `${col} = json_set(COALESCE(${col}, '{}'), '$.${key}', json(${val}))`
        : `${col} = jsonb_set(COALESCE(${col}, '{}'::jsonb), '{${key}}', ${val}::jsonb)`;
      const col = intoAuth ? 'auth' : 'data';
      const vKey = intoAuth ? 'vocabulary' : 'authVocabulary';
      const drop = config.type === 'sqlite'
        ? `${col} = json_remove(${col}, '$.childRefs')`
        : `${col} = ${col} - 'childRefs'`;
      for (const [id, vocab, childRefs, dropRefs] of writes) {
        await q(`UPDATE ${T} SET ${set(col, vKey, '$2')} WHERE id = $1`, [id, vocab]);
        if (childRefs) await q(`UPDATE ${T} SET ${set(col, 'childRefs', '$2')} WHERE id = $1`, [id, childRefs]);
        else if (dropRefs) await q(`UPDATE ${T} SET ${drop} WHERE id = $1`, [id]);
      }
      console.log(`     wrote ${writes.length} row(s)`);
    }

    const covered = same + (opts.apply ? writes.length : 0);
    const pct = rows.length ? (100 * covered / rows.length).toFixed(1) : '100.0';
    console.log(`\n   vocabulary coverage  ${covered}/${rows.length}  (${pct}%)`);
    if (covered === rows.length && rows.length) {
      console.log('   100% — this app no longer needs legacyVerbs.js. It can be DELETED once every');
      console.log('   app being enforced reports the same.');
    } else {
      console.log('   Below 100%: rows without a vocabulary still fall back to legacyVerbs.js, so the');
      console.log('   shim cannot be deleted yet.');
    }
  }

  // ---- pass 2: auth ← data.authPermissions
  //
  // THE GRANTS ARE STORED IN TWO SHAPES. Most rows hold an object; **8,434 rows of `rowauth-test`
  // hold a JSON STRING** — the same double-encoding `data.parent` had. Until 2026-10-29 this pass
  // tested `jsonb_typeof(...) = 'object'` and skipped every string, leaving 68 rows with an EMPTY
  // `auth` column while `data` held real grants. `rawAuthOf` then short-circuited on the non-null
  // column and reported "nothing stated" — i.e. publicly readable under `enforce`.
  //
  // Found by `--diff-reads`, which is the whole reason that harness exists: no unit test would
  // have produced a row in that shape. `rawAuthOf` was fixed to fall through to `data` when the
  // column names no principal; this makes the column right in the first place.
  const AP_OBJ = `CASE WHEN jsonb_typeof(data->'authPermissions') = 'string'
                       AND data->>'authPermissions' ~ '^\\s*\\{'
                  THEN (data->>'authPermissions')::jsonb
                  ELSE data->'authPermissions' END`;
  const AP_USABLE = `data ? 'authPermissions'
      AND (jsonb_typeof(data->'authPermissions') = 'object'
           OR (jsonb_typeof(data->'authPermissions') = 'string' AND data->>'authPermissions' ~ '^\\s*\\{'))
      AND ${AP_OBJ} <> '{}'::jsonb`;
  if (canBackfill || opts.addColumns) {
  const authable = (await one(
    `SELECT count(*)::int n FROM ${T} WHERE app = $1 AND ${AP_USABLE}`, [opts.app])).n;
  const asString = (await one(
    `SELECT count(*)::int n FROM ${T} WHERE app = $1
       AND jsonb_typeof(data->'authPermissions') = 'string'
       AND data->>'authPermissions' ~ '^\\s*\\{'`, [opts.app])).n;
  if (asString) console.log(`   (${asString} of them store the grants as a JSON string)`);
  console.log(`\n2. auth ← data.authPermissions        ${authable} row(s)`);
  if (opts.apply && authable) {
    // `vocabulary` and `childRefs` share this column with the grants
    // (routes/dms/authVocabulary.js), and pass 1 has just written them. A plain
    // `auth = data->'authPermissions'` wipes them — which it did, silently, until a second run
    // reported `already current: 0` after writing 81 rows. Carry both across, so each pass stays
    // idempotent and the order above is a dependency rather than a requirement.
    await q(`UPDATE ${T} SET auth = ${AP_OBJ}
               || CASE WHEN auth ? 'vocabulary' THEN jsonb_build_object('vocabulary', auth->'vocabulary') ELSE '{}'::jsonb END
               || CASE WHEN auth ? 'childRefs'  THEN jsonb_build_object('childRefs',  auth->'childRefs')  ELSE '{}'::jsonb END
             WHERE app = $1 AND ${AP_USABLE}`, [opts.app]);
  }

  // The batched writer both parent passes use. 500 pairs per statement, which is what kept the
  // 528k-edge production pass inside one connection's statement budget.
  const writeParents = async (pairs) => {
    for (let i = 0; i < pairs.length; i += 500) {
      const chunk = pairs.slice(i, i + 500);
      const values = chunk.map((_, j) => `($${j * 2 + 1}::bigint, $${j * 2 + 2}::bigint)`).join(',');
      await q(`UPDATE ${T} SET parent_id = v.pid FROM (VALUES ${values}) AS v(id, pid) WHERE ${T}.id = v.id`,
        chunk.flat());
    }
  };

  // ---- reset, for an app migrated by a revision that trusted `data.parent`
  if (opts.resetParents) {
    const had = (await one(`SELECT count(*)::int n FROM ${T} WHERE app = $1 AND parent_id IS NOT NULL`, [opts.app])).n;
    console.log(`\n   reset: parent_id ← NULL           ${had} row(s) cleared`);
    console.log(`     --reset-parents discards every stored parent, including any a client wrote,`);
    console.log(`     and lets passes 2 and 3 re-derive the column from scratch.`);
    if (opts.apply) await q(`UPDATE ${T} SET parent_id = NULL WHERE app = $1 AND parent_id IS NOT NULL`, [opts.app]);
  }

  // ---- pass 3: parent_id ← the DECLARED reference arrays
  //
  // See this file's header for why `data.parent` is not a source and why the declarations are
  // merged app-wide. Everything type-shaped below is asked of the SAME functions the write path
  // uses — `childRefsOf`, `refIdsOf`, `isPlausibleParent` — so a row this pass attaches is a row
  // `createData` would have accepted the claim for, and the two cannot drift apart.
  const declRows = await q(
    `SELECT id, type, ${caps.auth ? 'auth' : 'NULL AS auth'}, data->'childRefs' AS dcr
       FROM ${T} WHERE app = $1 AND type LIKE '%:pattern'`, [opts.app]);
  const { byOwnerKind, conflicts } = mergeChildRefs(declRows.map(r => ({
    id: r.id, type: r.type, childRefs: childRefsOf({ auth: r.auth, data: { childRefs: r.dcr } }),
  })));
  const childKinds = declaredChildKinds(byOwnerKind);

  console.log('\n3. parent_id ← declared reference arrays');
  const declared = Object.entries(byOwnerKind);
  if (!declared.length) {
    console.log('     no childRefs declared on any pattern row.');
    console.log('     Run --sync-vocabulary first; without it every component falls to pass 3,');
    console.log('     which will refuse to guess one. (packages/dms/src/patterns/*/**.childRefs.js)');
  }
  for (const [ownerKind, attrs] of declared) {
    console.log(`     ${ownerKind} → ${Object.entries(attrs).map(([a, k]) => `${a}:${k}`).join('  ')}`);
  }
  for (const c of conflicts) {
    console.log(`     ⚠  ${c.ownerKind}.${c.attribute} is declared as both "${c.declared[0]}" and`);
    console.log(`        "${c.declared[1]}" (rows ${c.rows.join(', ')}) — attribute SKIPPED, not guessed`);
  }

  // Claims are collected across every owner before any is resolved, so a child named by two
  // different owners is caught however far apart those owners sort.
  const claims = new Map();           // childId -> ownerId, or CONFLICT
  const CONFLICT = Symbol('conflict');
  const claimDecl = new Map();        // childId -> the ONE declaration object, shared by reference
  const ownerTypes = new Map();       // ownerId -> type, so the resolve loop never queries per child
  let owners = 0, refsRead = 0;

  for (const [ownerKind, attrs] of declared) {
    const attrList = Object.keys(attrs);
    const decls = attrList.map(a => ({ ownerKind, attribute: a, childKind: attrs[a] }));
    const cols = attrList.map((_, i) => `data->($${i + 3}::text) AS a${i}`).join(', ');
    let after = '0';
    for (;;) {
      // Keyset paging: only the declared arrays are selected, never `data`, so a page's 10KB of
      // content never crosses the wire (rowAuth.js, "pass PROJECTED rows, never whole ones").
      const batch = await q(
        `SELECT id, type, ${cols} FROM ${T}
          WHERE app = $1 AND ${KIND_SQL} = $2 AND id > $${attrList.length + 3}::bigint
          ORDER BY id LIMIT 500`,
        [opts.app, ownerKind, ...attrList, after]);
      if (!batch.length) break;
      after = batch[batch.length - 1].id;
      owners += batch.length;
      for (const o of batch) {
        ownerTypes.set(String(o.id), o.type);
        decls.forEach((decl, i) => {
          for (const cid of refIdsOf(o[`a${i}`])) {
            refsRead++;
            const prev = claims.get(cid);
            if (prev === undefined) { claims.set(cid, o.id); claimDecl.set(cid, decl); }
            else if (prev !== CONFLICT && String(prev) !== String(o.id)) claims.set(cid, CONFLICT);
          }
        });
      }
    }
  }

  const resetSim = opts.resetParents && !opts.apply;
  const tally = { set: 0, corrected: 0, already: 0, missing: 0, wrongKind: 0, outside: 0, conflicted: 0, duplicated: 0, orphans: 0 };
  const conflictedIds = [], correctedIds = [], outsideIds = [];
  const contested = new Map();       // childId -> its own row, for the duplication pass below
  const copies = [];                 // [childId, ownerId, newId] — printed below as the audit trail
  const refUpdates = [];
  const resolved = new Set();        // every child pass 2 answers for — written or already right
  const allIds = [...claims.keys()];
  for (let i = 0; i < allIds.length; i += 2000) {
    const ids = allIds.slice(i, i + 2000);
    const kids = await q(
      `SELECT id, type, parent_id FROM ${T} WHERE app = $1 AND id = ANY($2::bigint[])`,
      [opts.app, ids]);
    const found = new Map(kids.map(k => [String(k.id), k]));
    for (const cid of ids) {
      const owner = claims.get(cid);
      const kid = found.get(String(cid));
      if (owner === CONFLICT) {
        tally.conflicted++;
        if (kid) contested.set(cid, kid); else tally.missing++;
        continue;
      }
      if (!kid) { tally.missing++; continue; }
      const decl = claimDecl.get(cid);
      if (getKind(kid.type) !== decl.childKind) { tally.wrongKind++; continue; }
      const ownerType = ownerTypes.get(String(owner));
      if (!isPlausibleParent(kid.type, ownerType, decl.ownerKind)) {
        tally.outside++; if (outsideIds.length < 10) outsideIds.push(`${cid} (${kid.type}) → ${owner} (${ownerType})`);
        continue;
      }
      // On a dry run `--reset-parents` has not happened yet, so the stored value is still the one
      // it would have cleared. Reading it would report a corrected row as "already correct".
      const cur = resetSim ? null : kid.parent_id;
      resolved.add(String(cid));
      if (cur !== null && String(cur) === String(owner)) { tally.already++; continue; }
      if (cur !== null) { tally.corrected++; if (correctedIds.length < 5) correctedIds.push(`${cid}: ${kid.parent_id} → ${owner}`); }
      else tally.set++;
      refUpdates.push([cid, owner]);
    }
  }

  // ---- contested children: one row named by two owners — DUPLICATE, never guess
  //
  // A component listed by two pages has two sets of grants above it and one `parent_id` to hold
  // them, so the column cannot express what the data says. Measured on the clone: 72 components,
  // 18 of them in live county patterns where the `draft_sections` of two different pages reference
  // the SAME rows — a page duplicated by sharing ids instead of cloning them, so editing one
  // section edits both. That is a product defect, not a parentage one; copy/paste/duplicate is
  // being swept separately so it cannot recur.
  //
  // Here it is REPAIRED rather than reported: the lowest-id owner keeps the original, every other
  // owner gets its own copy, and that owner's reference arrays are repointed at the copy. Each row
  // then has exactly one parent, the pages render what they rendered before, and the two copies can
  // diverge the way the author always believed they already could.
  if (contested.size) {
    // The claim scan keeps only a winner per child, so the owners of a contested child are read
    // back here — the set is small, and nothing is held for the 33k rows that are fine.
    const detail = new Map();            // childId -> Map(ownerId -> { ownerKind, attrs:Set })
    for (const [ownerKind, attrs] of declared) {
      const attrList = Object.keys(attrs);
      const cols = attrList.map((_, i) => `data->($${i + 3}::text) AS a${i}`).join(', ');
      let after = '0';
      for (;;) {
        const batch = await q(
          `SELECT id, type, ${cols} FROM ${T}
            WHERE app = $1 AND ${KIND_SQL} = $2 AND id > $${attrList.length + 3}::bigint
            ORDER BY id LIMIT 500`,
          [opts.app, ownerKind, ...attrList, after]);
        if (!batch.length) break;
        after = batch[batch.length - 1].id;
        for (const o of batch) {
          attrList.forEach((attr, i) => {
            for (const cid of refIdsOf(o[`a${i}`])) {
              if (!contested.has(cid)) continue;
              if (!detail.has(cid)) detail.set(cid, new Map());
              const owners = detail.get(cid);
              if (!owners.has(String(o.id))) owners.set(String(o.id), { ownerKind, attrs: new Set() });
              owners.get(String(o.id)).attrs.add(attr);
            }
          });
        }
      }
    }

    const { keepers: keeperOf, copies: plan, rejected } = planDuplication(detail, {
      childType: (cid) => (contested.get(cid) || {}).type,
      ownerType: (oid) => ownerTypes.get(oid),
      byOwnerKind,
    });
    tally.outside += rejected.length;
    // Grouped by the owner that has to be repointed, so an owner holding several contested children
    // is rewritten once.
    const repoint = new Map();           // ownerId -> [{ child, ownerKind, attrs }]
    for (const it of plan) {
      if (!repoint.has(it.owner)) repoint.set(it.owner, []);
      repoint.get(it.owner).push(it);
    }
    // The original stays where it is, under the owner that keeps it.
    for (const [cid, keeper] of keeperOf) {
      const kid = contested.get(cid);
      const cur = resetSim ? null : kid.parent_id;
      resolved.add(String(cid));
      if (cur !== null && String(cur) === String(keeper)) tally.already++;
      else { if (cur !== null) tally.corrected++; else tally.set++; refUpdates.push([cid, keeper]); }
    }

    for (const [oid, items] of repoint) {
      const swaps = new Map();           // oldChildId -> newChildId
      for (const it of items) {
        tally.duplicated++;
        if (!opts.apply) { copies.push([it.child, oid, null]); continue; }
        // A faithful copy: every column but `id`, read off the row itself so this needs no schema
        // knowledge and works on either dialect. `created_at` / `created_by` are kept, because the
        // section's real age is the original's — this run is the record of the split, not the row.
        const src = (await q(`SELECT * FROM ${T} WHERE id = $1::bigint`, [it.child]))[0];
        if (!src) continue;
        const cols = Object.keys(src).filter(c => c !== 'id');
        const vals = cols.map(c => (c === 'parent_id' ? oid : src[c]));
        const [made] = await q(
          `INSERT INTO ${T} (${cols.map(c => `"${c}"`).join(', ')})
           VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, vals);
        swaps.set(String(it.child), String(made.id));
        copies.push([it.child, oid, String(made.id)]);
        // The orphan sweep below reads `claims`, which was built from the arrays as they were
        // BEFORE this repointing. Without this line a copy is named by nobody it can see, and the
        // sweep deletes the row it just made — observed, on all 72 of them.
        claims.set(String(made.id), oid);
        resolved.add(String(made.id));
      }
      if (!opts.apply || !swaps.size) continue;
      // Repoint this owner — and ONLY this owner — at its copies. Element shape is preserved, so a
      // `ref` or any other field the pattern writes alongside the id survives untouched.
      const attrsHere = [...new Set(items.flatMap(i => i.attrs))];
      const row = (await q(
        `SELECT ${attrsHere.map((_, i) => `data->($${i + 2}::text) AS a${i}`).join(', ')}
           FROM ${T} WHERE id = $1::bigint`, [oid, ...attrsHere]))[0];
      for (let i = 0; i < attrsHere.length; i++) {
        const next = repointRefs(row[`a${i}`], swaps);
        if (!next) continue;
        await q(`UPDATE ${T} SET data = jsonb_set(data, ARRAY[$2::text], $3::jsonb) WHERE id = $1::bigint`,
          [oid, attrsHere[i], JSON.stringify(next)]);
      }
    }
    contested.clear();
  }

  console.log(`     owner rows scanned               ${owners}`);
  console.log(`     refs read                        ${refsRead}`);
  console.log(`     parent_id set (was null)         ${tally.set}`);
  console.log(`     parent_id CORRECTED              ${tally.corrected}`);
  console.log(`     already correct                  ${tally.already}`);
  console.log(`     dropped: no such row             ${tally.missing}`);
  console.log(`     dropped: wrong kind              ${tally.wrongKind}`);
  console.log(`     dropped: outside the container   ${tally.outside}`);
  console.log(`     claimed by 2+ owners             ${tally.conflicted}`);
  console.log(`     …${opts.apply ? 'duplicated' : 'would duplicate'} for the extra owner  ${tally.duplicated}`);
  for (const [child, oid, made] of copies.slice(0, 8)) {
    console.log(`        ${opts.apply ? `copied ${child} → ${made}` : `would copy ${child}`} for owner ${oid}`);
  }
  if (copies.length > 8) console.log(`        …and ${copies.length - 8} more`);

  // ---- orphans: a declared child kind that NO owner names
  //
  // A component exists to be rendered by a page. One that no page lists is not reachable, not
  // editable and not renderable — it is a leak from a delete that did not cascade, and leaving it
  // only grows the table and the sync payload. Deleting it is also the only answer that is right
  // for auth: it has no parent, so it inherits nothing, and `parent_id` has no value to hold.
  //
  // "Named by no owner" means named by no reference array at all — not "named but the claim failed
  // validation". A row named by an owner in the wrong container is a different defect and keeps its
  // row; --verify-parents is where that gets listed.
  //
  // THIS RUN MUST NOT RACE LIVE EDITING. A child is created before its parent's array is written,
  // so a component saved seconds ago is legitimately unnamed. Quiesce writes first.
  const ownerKinds = new Set(Object.keys(byOwnerKind));
  const deletable = [...childKinds].filter(k => !ownerKinds.has(k));
  const orphanIds = [];
  if (!declared.length || !owners) {
    // The failure mode worth guarding: no declaration, or a declaration nothing matched, means
    // every child looks unnamed. That must never read as "delete them all".
    if (deletable.length) console.log('     orphan sweep SKIPPED — no owner rows were scanned');
  } else {
    for (const kind of deletable) {
      let after = '0';
      for (;;) {
        const batch = await q(
          `SELECT id FROM ${T} WHERE app = $1 AND ${KIND_SQL} = $2 AND id > $3::bigint
            ORDER BY id LIMIT 2000`, [opts.app, kind, after]);
        if (!batch.length) break;
        after = batch[batch.length - 1].id;
        for (const r of batch) if (!claims.has(String(r.id))) orphanIds.push(String(r.id));
      }
    }
    tally.orphans = orphanIds.length;
    if (opts.apply && orphanIds.length) {
      for (let i = 0; i < orphanIds.length; i += 500) {
        await q(`DELETE FROM ${T} WHERE app = $1 AND id = ANY($2::bigint[])`,
          [opts.app, orphanIds.slice(i, i + 500)]);
      }
    }
  }
  console.log(`     orphaned — named by no owner     ${tally.orphans}${tally.orphans ? (opts.apply ? '  DELETED' : '  (would be deleted)') : ''}`);
  if (orphanIds.length) console.log(`        ${orphanIds.slice(0, 10).join(', ')}${orphanIds.length > 10 ? ', …' : ''}`);
  for (const c of correctedIds) console.log(`        corrected  ${c}`);
  for (const c of outsideIds)   console.log(`        outside    ${c}`);
  if (conflictedIds.length) console.log(`        contested ids: ${conflictedIds.join(', ')}${tally.conflicted > conflictedIds.length ? ', …' : ''}`);
  if (opts.apply && refUpdates.length) await writeParents(refUpdates);

  // ---- pass 4: parent_id ← the type path, for every kind no declaration covers
  const containers = await q(
    `SELECT id, type FROM ${T} WHERE app = $1 AND type LIKE '%:%'`, [opts.app]);
  const byName = new Map();
  for (const r of containers) {
    const n = getInstance(r.type);
    if (!n) continue;
    byName.set(n, (byName.get(n) || []).concat(r));
  }
  const ambiguous = [...byName.entries()].filter(([, v]) => v.length > 1);
  const unique = new Map([...byName.entries()].filter(([, v]) => v.length === 1).map(([k, v]) => [k, v[0]]));

  // Rows pass 3 is about to attach are no longer orphans, so they are excluded here even on a dry
  // run — otherwise a dry run reports a component as type-path material when it is not.

  const orphans = (await q(
    `SELECT id, type FROM ${T} WHERE app = $1${resetSim ? '' : ' AND parent_id IS NULL'}`, [opts.app]))
    .filter(r => !resolved.has(String(r.id)));

  let filled = 0, unresolved = 0, blocked = 0, withheld = 0;
  const withheldKinds = new Map();
  const updates = [];
  for (const row of orphans) {
    // A declared child kind is never handed a type-path parent. The type path names the row's
    // PATTERN, and a component's pattern is one level above its page — attaching it there would
    // inherit the pattern's grants while skipping whatever its page restricts.
    const kind = getKind(row.type);
    if (childKinds.has(kind)) {
      withheld++; withheldKinds.set(kind, (withheldKinds.get(kind) || 0) + 1); continue;
    }
    const seg = getParent(row.type);
    if (!seg) { unresolved++; continue; }
    if (byName.has(seg) && !unique.has(seg)) { blocked++; continue; }   // ambiguous — never guess
    const up = unique.get(seg);
    if (!up || String(up.id) === String(row.id)) { unresolved++; continue; }
    updates.push([row.id, up.id]); filled++;
  }
  console.log(`\n4. parent_id ← the type path          ${filled} row(s)`);
  console.log(`     unresolvable (no parent above)   ${unresolved}`);
  console.log(`     blocked by an ambiguous name     ${blocked}`);
  console.log(`     withheld — a declared child kind ${withheld}`);
  for (const [kind, n] of withheldKinds) {
    console.log(`        ${kind} ×${n}   ← named by an owner, but the claim did not validate. The type`);
    console.log(`        path would attach these one level too high, so they stay NULL: the resolver`);
    console.log(`        truncates, which is safe, and --verify-parents lists them for a human.`);
  }

  if (opts.apply && updates.length) await writeParents(updates);

  // ---- --drop-data-parent: retire the field the column replaced
  //
  // `data.parent` was row auth's third parentage source and was retired on 2026-10-29
  // (routes/dms/rowAuth.js's header). Nothing writes it and nothing reads it any more, but every
  // row that has one keeps it until something removes it — and a dead pointer that 52.6% of the
  // time names the wrong page is exactly the kind of thing a future reader trusts.
  //
  // WHICH ROWS. Only a kind that is a DECLARED CHILD and is NOT ITSELF AN OWNER — the same
  // `deletable` set the orphan sweep uses, for the same reason. This is the whole safety of the
  // pass: on a PAGE row `data.parent` is a completely different field, the nav / URL tree, and it
  // is load-bearing (utils/nav.js, page.format.js's defaultSearch, dms.controller.js's
  // `page_parent`). A page owns components, so it is an ownerKind, so it is never in `deletable`,
  // so the nav tree cannot be reached from here however a pattern declares itself.
  //
  // AND ONLY WHERE `parent_id` IS SET. A row the migration could not resolve keeps its old field:
  // it is worthless, but dropping the only record of a failed migration is worse than keeping it.
  // Re-run after fixing the coverage to catch the stragglers.
  if (opts.dropDataParent) {
    let dropped = 0, kept = 0;
    for (const kind of deletable) {
      const n = (await one(
        `SELECT count(*)::int n FROM ${T}
          WHERE app = $1 AND ${KIND_SQL} = $2 AND data ? 'parent' AND parent_id IS NOT NULL`,
        [opts.app, kind])).n;
      const k = (await one(
        `SELECT count(*)::int n FROM ${T}
          WHERE app = $1 AND ${KIND_SQL} = $2 AND data ? 'parent' AND parent_id IS NULL`,
        [opts.app, kind])).n;
      dropped += n; kept += k;
      if (n || k) console.log(`     ${kind}: ${n} to drop, ${k} kept (parent_id still NULL)`);
      if (opts.apply && n) {
        let after = '0';
        for (;;) {
          const batch = await q(
            `SELECT id FROM ${T}
              WHERE app = $1 AND ${KIND_SQL} = $2 AND data ? 'parent' AND parent_id IS NOT NULL
                AND id > $3::bigint ORDER BY id LIMIT 500`, [opts.app, kind, after]);
          if (!batch.length) break;
          after = batch[batch.length - 1].id;
          await q(`UPDATE ${T} SET data = data - 'parent' WHERE id = ANY($1::bigint[])`,
            [batch.map(r => r.id)]);
        }
      }
    }
    tally.droppedDataParent = dropped;
    console.log(`\n   drop: data.parent                 ${dropped} row(s)${opts.apply ? '' : ' (dry run)'}`);
    if (!deletable.length) {
      console.log('     nothing dropped — no kind is a declared child without also being an owner.');
    }
    if (kept) {
      console.log(`     ${kept} row(s) kept: parent_id is still NULL, so the old field is the only`);
      console.log(`     record left of what they claimed. Fix coverage, then re-run.`);
    }
  }

  // ---- --verify-parents: is the column still honest?
  //
  // The backfill is a one-time event; the client is what has to KEEP `parent_id` true, across three
  // write paths and a sync. This asks the question the backfill cannot: not "what would I write",
  // but "does what is stored still agree with what the data says, and does every chain still reach
  // a root". It writes nothing and exits 1 on any drift, so it can gate a DMS_ROW_AUTH_MODE flip
  // from CI rather than from someone remembering to look.
  //
  // Everything above has already run read-only (--verify-parents refuses --apply), so section A is
  // simply the backfill's own findings read as drift. B and C are the checks a backfill has no
  // reason to make, because they are about rows it would not touch.
  if (opts.verify) {
    console.log('\n5. --verify-parents — read-only\n');
    const A = [
      ['parent_id missing, an array names it', tally.set],
      ['parent_id DISAGREES with the array', tally.corrected],
      ['named, but the claim did not validate', tally.wrongKind + tally.outside + withheld],
      ['named by 2+ owners', tally.conflicted],
      ['named by nobody (orphan)', tally.orphans],
      ['parent_id missing, the type path has one', filled],
      ['blocked by an ambiguous instance name', blocked],
    ];
    console.log('   A. drift from the declared reference arrays');
    for (const [label, n] of A) console.log(`        ${n ? '✗' : '✓'} ${label.padEnd(42)} ${n}`);
    if (tally.corrected) {
      console.log('          A DISAGREEMENT IS A MOVE THE WRITE PATH DID NOT FOLLOW. A section dragged');
      console.log('          between pages is not `_dirty`, so updateDMSAttrs skips it and it keeps the');
      console.log('          old parent — the same mechanism that made `data.parent` 53% wrong.');
    }

    // B. Integrity of the column on its own terms — no declaration involved, so these hold for
    //    every kind, including the ones no pattern declares children for.
    const dangling = (await one(
      `SELECT count(*)::int n FROM ${T} c WHERE c.app = $1 AND c.parent_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM ${T} p WHERE p.id = c.parent_id AND p.app = c.app)`, [opts.app])).n;
    const selfRef = (await one(
      `SELECT count(*)::int n FROM ${T} WHERE app = $1 AND parent_id = id`, [opts.app])).n;
    let implausible = 0; const implausibleEg = [];
    let after = '0';
    for (;;) {
      const batch = await q(
        `SELECT c.id, c.type, p.type AS ptype FROM ${T} c JOIN ${T} p
            ON p.id = c.parent_id AND p.app = c.app
          WHERE c.app = $1 AND c.id > $2::bigint ORDER BY c.id LIMIT 5000`, [opts.app, after]);
      if (!batch.length) break;
      after = batch[batch.length - 1].id;
      for (const r of batch) {
        // No ownerKind here on purpose: this is the structural rule alone, which every row must
        // pass whatever declared it. The declaration-aware check is section A.
        if (!isPlausibleParent(r.type, r.ptype)) {
          implausible++;
          if (implausibleEg.length < 5) implausibleEg.push(`${r.id} (${r.type}) → ${r.ptype}`);
        }
      }
    }
    console.log('\n   B. integrity of the column itself');
    for (const [label, n] of [['parent_id points at no row', dangling],
                              ['parent_id points at the row itself', selfRef],
                              ['parent_id outside the child\'s container', implausible]]) {
      console.log(`        ${n ? '✗' : '✓'} ${label.padEnd(42)} ${n}`);
    }
    for (const e of implausibleEg) console.log(`             ${e}`);

    // C. The census an enforce flip actually rests on. A row that is private only by inheritance
    //    opens up the moment its chain stops short of the row holding the grant, so "reaches a
    //    root" is the number to watch — not "parent_id is set".
    const census = await q(`
      WITH RECURSIVE walk AS (
        SELECT id AS root, id, type, parent_id, 0 AS d FROM ${T} WHERE app = $1
        UNION ALL
        SELECT w.root, p.id, p.type, p.parent_id, w.d + 1 FROM walk w
          JOIN ${T} p ON p.id = w.parent_id AND p.app = $1 WHERE w.d < ${MAX_DEPTH}),
      tops AS (SELECT root, max(d) depth, bool_or(type LIKE '%:site') reaches FROM walk GROUP BY root)
      SELECT substring(r.type from '[^|:]+$') kind, count(*)::int n,
             count(*) FILTER (WHERE t.reaches)::int ok, max(t.depth)::int deep
        FROM tops t JOIN ${T} r ON r.id = t.root AND r.app = $1
       GROUP BY 1 ORDER BY n DESC`, [opts.app]);
    console.log('\n   C. chain census — what an enforce flip rests on');
    console.log('        kind                 rows   reach a root          max depth');
    let short = 0, rows = 0;
    for (const c of census) {
      rows += c.n; short += c.n - c.ok;
      const pct = c.n ? (100 * c.ok / c.n).toFixed(1) : '100.0';
      console.log(`        ${String(c.kind).padEnd(18)} ${String(c.n).padStart(6)}   ${String(c.ok).padStart(6)} (${pct.padStart(5)}%)${c.deep >= MAX_DEPTH ? '   ⚠ depth cap — cycle?' : `        ${c.deep}`}`);
    }
    console.log(`        ${'TOTAL'.padEnd(18)} ${String(rows).padStart(6)}   ${String(rows - short).padStart(6)} (${(rows ? 100 * (rows - short) / rows : 100).toFixed(1).padStart(5)}%)`);

    const drift = A.reduce((a, [, n]) => a + n, 0) + dangling + selfRef + implausible;
    console.log('');
    if (drift) {
      // Findings, not rows: one row can fail two checks at once — a cross-pattern parent both
      // disagrees with the array and fails the structural rule, and both are worth printing.
      console.log(`   DRIFT: ${drift} finding(s). The column does not match the data — do not flip to enforce.`);
      console.log('   Re-run without --verify-parents and with --apply to repair, then verify again.');
    } else if (short) {
      console.log(`   CLEAN, but ${short} row(s) reach no root. Those inherit nothing above the point the`);
      console.log('   chain stops — safe today (ancestors only narrow), and the ceiling on enforce.');
    } else {
      console.log('   CLEAN. Every row agrees with the data and every chain reaches a root.');
    }
    verifyDrift = drift;
  }

  if (ambiguous.length) {
    console.log(`\n⚠  ${ambiguous.length} ambiguous instance name(s) — a human must resolve these.`);
    console.log('   Attaching a row to the wrong parent attaches it to the wrong grants, so pass 3');
    console.log('   skipped every row whose type names one of these:\n');
    for (const [name, rows] of ambiguous.slice(0, 20)) {
      console.log(`     "${name}"`);
      for (const r of rows) console.log(`        ${r.id}  ${r.type}`);
    }
    if (ambiguous.length > 20) console.log(`     …and ${ambiguous.length - 20} more`);
  }

  } // end backfill passes

  // ---- the database-level backstop against the error that caused all this
  //
  // Two rows sharing an instance name gives everything beneath them two possible parents, and the
  // resolver has to guess which grants apply. `createData` refuses new ones (mode-gated); this is
  // the constraint that makes it impossible, including for writes that never go through the app.
  //
  // It covers EVERY container kind, not just patterns. Grants are not a pattern-only thing —
  // measured on `mitigat-ny-prod`: components hold 135,491 real grants, pages 249, patterns 82 and
  // **sources 2**. And a kind that holds none today still sits in the chain: a `:data` row reaches
  // its source through its view, so a duplicate view can attach data to the wrong source's grants.
  //
  // Applied per kind, because each can be cleaned independently and they are in very different
  // states — patterns need 3 pairs resolved, views far more (`form1|version_1:view` exists 28 times).
  const CONTAINER_KINDS = ['pattern', 'source', 'view', 'dmsenv', 'site'];
  if (opts.guard) {
    const kinds = opts.guard === 'all' ? CONTAINER_KINDS : [opts.guard];
    console.log(`\nuniqueness guard — ${kinds.join(', ')}`);
    for (const kind of kinds) {
      const clashes = await q(
        `SELECT type, count(*)::int n, min(id)::text AS a, max(id)::text AS b
           FROM ${T} WHERE app = $1 AND type LIKE $2
          GROUP BY type HAVING count(*) > 1 ORDER BY n DESC`, [opts.app, `%:${kind}`]);
      const idx = `${t.table}_${kind}_type_uniq`;
      if (clashes.length) {
        const rows = clashes.reduce((a, c) => a + c.n, 0);
        console.log(`\n  ⚠  ${kind}: ${clashes.length} duplicate type(s) across ${rows} rows — guard NOT added`);
        for (const c of clashes.slice(0, 8)) console.log(`       ${c.type}  ×${c.n}   (ids include ${c.a}, ${c.b})`);
        if (clashes.length > 8) console.log(`       …and ${clashes.length - 8} more`);
      } else if (!opts.apply) {
        console.log(`  ${kind}: clean — the unique index would be added with --apply`);
      } else {
        await q(`CREATE UNIQUE INDEX IF NOT EXISTS ${idx}
                   ON ${T}(app, type) WHERE type LIKE '%:${kind}'`);
        console.log(`  ${kind}: unique index ${idx} added`);
      }
    }
    console.log('\n  Resolving a duplicate means deciding which row is live, re-pointing anything that');
    console.log("  names the other, and removing it — both may be on the site's pattern list.");
  }

  // ---- --audit-writes: who stops being able to edit, if a write flag is flipped
  //
  // The hub's Phase D asks for this by name: "for a given app, which rows would become uneditable
  // if the flag were turned on, and who holds `edit` today. Run it per site before enabling,
  // because the answer on a site with no grants is 'everyone loses editing'."
  //
  // It is now a measured rule rather than a worry. Kind auth opens a write when nothing is
  // configured (owner, 2026-10-23); row auth refuses it (hub, strict defaults) — 13 of the 26
  // differences in tests/fixtures/row-auth-expected-diff.json are exactly this. So a row whose
  // whole chain states nothing becomes writable by `${app} Admin` and nobody else.
  //
  // READ-ONLY, AND IT NEEDS NO MIGRATION. The question is answerable through the same fallback the
  // resolver already has (`data.authPermissions` when there is no `auth` column), so this is the
  // one part of the programme that can measure PRODUCTION before the cutover touches it.
  //
  // Walks DOWN from the grant-bearing rows rather than up from every row: the seed is small and the
  // stated set is its subtree, which is one scan instead of 321k recursive walks. The up-edge is
  // `parent_id` when set, else the type path — the same sequence `rowAuth.js` follows. Section D
  // re-runs a sample through the REAL resolver, because an audit that can disagree with the thing
  // it is auditing is worse than none.
  if (opts.auditWrites) {
    console.log('\n6. --audit-writes — read-only\n');
    const INST = `substring(type from '([^|]+):[^:]+$')`;      // a container's own name
    const CONT = `substring(type from '^(.+)\\|[^|]+$')`;       // the container a row names
    const auditCols = authColumns(caps, 'postgres').join(', ');

    // THE SEED IS COMPUTED BY THE REAL CODE, not by a predicate written twice.
    //
    // A first version asked SQL for `auth->'groups' <> '{}'` and disagreed with the resolver on 4
    // of 200 sampled rows — because production stores grants in a THIRD shape nobody had written
    // down: keyed by subdomain, with the value a JSON *string*:
    //
    //     {"*": "{\"users\":{\"1\":[\"*\"]},\"groups\":{\"AVAIL\":[\"*\"]}}"}
    //
    // `rawAuthOf` already resolves all of them (routes/dms/rowAuth.js). The SQL predicate is now
    // only a cheap, DELIBERATELY INCLUSIVE filter — "has any auth content at all" — and `rawAuthOf`
    // decides. An inclusive filter can only add candidates, never drop a grant-bearing row.
    const anyAuthSql = caps.auth ? `(auth IS NOT NULL OR data ? 'authPermissions')`
                                 : `(data ? 'authPermissions')`;
    const candidates = await q(
      `SELECT ${auditCols} FROM ${T} WHERE app = $1 AND ${anyAuthSql}`, [opts.app]);
    const seedIds = candidates.filter(r => !isUnstated(rawAuthOf(r, ''))).map(r => String(r.id));
    console.log(`   seed: ${seedIds.length} row(s) state something, of ${candidates.length} carrying any auth at all`);

    const stated = `
      WITH RECURSIVE
        containers AS (
          SELECT DISTINCT ON (${INST}) ${INST} AS inst, id
            FROM ${T} WHERE app = $1 AND ${INST} IS NOT NULL ORDER BY ${INST}, id),
        up AS (
          -- parent_id first, then the type path — the same sequence rowAuth.js follows. On an
          -- UNMIGRATED app there is no column, so the type path is the whole edge, which is
          -- exactly what the resolver falls back to there.
          SELECT r.id, ${caps.parentId ? 'COALESCE(r.parent_id, c.id)' : 'c.id'} AS parent
            FROM ${T} r LEFT JOIN containers c ON c.inst = ${CONT}
           WHERE r.app = $1),
        seed AS (SELECT unnest($2::bigint[]) AS id),
        down AS (
          SELECT id FROM seed
          UNION
          SELECT u.id FROM up u JOIN down d ON u.parent = d.id)
        SELECT id FROM down`;

    const census = await q(`
      WITH s AS (${stated})
      SELECT ${KIND_SQL} kind, count(*)::int n,
             count(*) FILTER (WHERE s.id IS NULL)::int unstated
        FROM ${T} r LEFT JOIN s ON s.id = r.id
       WHERE r.app = $1 GROUP BY 1 ORDER BY 2 DESC`, [opts.app, seedIds]);

    console.log('   A. rows whose chain states NOTHING — writable by `' + opts.app + ' Admin` only');
    console.log('        kind                 rows     would lose writes');
    let tot = 0, lost = 0;
    for (const c of census) {
      tot += c.n; lost += c.unstated;
      const pct = c.n ? (100 * c.unstated / c.n).toFixed(1) : '0.0';
      console.log(`        ${String(c.kind).padEnd(18)} ${String(c.n).padStart(7)}   ${String(c.unstated).padStart(7)} (${pct.padStart(5)}%)`);
    }
    const pctAll = tot ? (100 * lost / tot).toFixed(1) : '0.0';
    console.log(`        ${'TOTAL'.padEnd(18)} ${String(tot).padStart(7)}   ${String(lost).padStart(7)} (${pctAll.padStart(5)}%)`);

    // Principals come from the SEED rows' RESOLVED auth, for the same reason the seed does: a SQL
    // `->'groups'` reads the top-level shape only and silently skips every subdomain-keyed grant.
    const byPrincipal = new Map();
    for (const row of candidates) {
      const a = rawAuthOf(row, '');
      if (!a || isUnstated(a)) continue;
      for (const kind of ['groups', 'users']) {
        for (const who of Object.keys((a[kind] || {}))) {
          const key = `${kind === 'groups' ? 'group' : 'user'}\u0000${who}`;
          byPrincipal.set(key, (byPrincipal.get(key) || 0) + 1);
        }
      }
    }
    const holders = [...byPrincipal.entries()]
      .map(([k, rows]) => { const [kind, principal] = k.split('\u0000'); return { kind, principal, rows }; })
      .sort((a, b) => b.rows - a.rows).slice(0, 20);
    console.log('\n   B. who states anything today — the rows a grant is written ON');
    if (!holders.length) console.log('        (nobody) — every write in this app would need `' + opts.app + ' Admin`');
    for (const h of holders) console.log(`        ${h.kind.padEnd(6)} ${String(h.principal).padEnd(28)} on ${h.rows} row(s)`);

    const recent = await q(`
      WITH s AS (${stated})
      SELECT r.id, r.type, r.data->>'title' title, to_char(r.updated_at, 'YYYY-MM-DD') d
        FROM ${T} r LEFT JOIN s ON s.id = r.id
       WHERE r.app = $1 AND s.id IS NULL
       ORDER BY r.updated_at DESC NULLS LAST LIMIT 15`, [opts.app, seedIds]);
    console.log('\n   C. most recently edited of those — the ones that would be noticed');
    for (const r of recent) {
      console.log(`        ${String(r.d).padEnd(12)} ${String(r.type).padEnd(34)} #${r.id}  ${String(r.title || '').slice(0, 40)}`);
    }

    // D. the integrity check that makes A believable.
    const sample = await q(
      `SELECT ${auditCols} FROM ${T} WHERE app = $1 ORDER BY random() LIMIT 300`, [opts.app]);
    const containerRows = await q(
      `SELECT ${auditCols} FROM ${T} WHERE app = $1 AND ${INST} IS NOT NULL`, [opts.app]);
    const resolver = createResolver({
      loadByIds: async (ids) => ids.length
        ? q(`SELECT ${auditCols} FROM ${T} WHERE app = $1 AND id = ANY($2::bigint[])`, [opts.app, ids])
        : [],
      loadContainers: async () => containerRows,
    });
    const merged = await resolver.resolve(sample);
    const sqlStated = new Set((await q(
      `WITH s AS (${stated}) SELECT id FROM s`, [opts.app, seedIds])).map(r => String(r.id)));
    let agree = 0, disagree = [];
    for (const row of sample) {
      const byResolver = !isUnstated(merged.get(String(row.id)));
      const bySql = sqlStated.has(String(row.id));
      if (byResolver === bySql) agree++;
      else if (disagree.length < 5) disagree.push(`${row.id} (${row.type}) resolver=${byResolver} query=${bySql}`);
    }
    console.log(`\n   D. cross-check — the REAL resolver on ${sample.length} sampled row(s)`);
    console.log(`        ${disagree.length ? '✗' : '✓'} agrees on ${agree}/${sample.length}`);
    for (const d of disagree) console.log(`             ${d}`);

    console.log('\n   Flipping a write gate to `enforce` makes ' + lost + ' of ' + tot + ' row(s) ('
      + pctAll + '%) writable by `' + opts.app + ' Admin` and nobody else.');
    console.log('   The fix for any row in that set is to write its chain a grant — start with C.');
  }

  // ---- --diff-reads: does the resolver decide READS the same way today's rule does?
  //
  // Task 7's gate (row-auth-consolidate.md, "Done when" 1). The `pattern` / `page` branch guards
  // every pattern and page read in production, so it cannot be deleted on the strength of unit
  // tests — only on a verdict diff over a real app's rows, for real shapes of caller.
  //
  // Both rules are called HERE, not reimplemented: `kindReadBlocked` is the route's own branch,
  // extracted verbatim for exactly this purpose, and the gate is the same `createGate` the route
  // builds. A harness that reimplemented either would be measuring itself.
  //
  // READ-ONLY and needs no migration — on an unmigrated app the resolver falls back to `data`.
  if (opts.diffReads) {
    console.log('\n7. --diff-reads — read-only\n');
    const cols = authColumns(caps, 'postgres').join(', ');
    const INST = `substring(type from '([^|]+):[^:]+$')`;

    // The callers worth asking about. The grantee is taken from the app's own data rather than
    // invented: whichever group states the most rows is the one whose loss would be noticed.
    const topGroup = (await q(`
      SELECT g.k AS principal, count(*)::int n FROM ${T},
             LATERAL jsonb_each(COALESCE(${caps.auth ? `auth->'groups',` : ''} data->'authPermissions'->'groups', '{}'::jsonb)) g(k, v)
       WHERE app = $1 AND g.k <> 'public' GROUP BY 1 ORDER BY 2 DESC LIMIT 1`, [opts.app]))[0];
    const CALLERS = [
      ['anonymous',      { authed: false, id: null, groups: [] }],
      ['signed-in',      { authed: true, id: 'diff-reads-nobody', email: 'n@x', groups: [] }],
      ...(topGroup ? [[`grantee (${topGroup.principal})`,
                       { authed: true, id: 'diff-reads-grantee', email: 'g@x', groups: [topGroup.principal] }]] : []),
      ['app admin',      { authed: true, id: 'diff-reads-admin', email: 'a@x', groups: [`${opts.app} Admin`] }],
    ];
    console.log(`   callers: ${CALLERS.map(c => c[0]).join(', ')}`);

    // `getPatternAuthPermissions`, mirrored — including the admin/auth skip, which is load-bearing:
    // a CONTENT pattern can share an instance name with the admin or auth row.
    const patCache = new Map();
    const patternAuthOf = async (app, parentKey) => {
      const key = `${app}:${parentKey}`;
      if (!patCache.has(key)) {
        const rows = await q(
          `SELECT data FROM ${T} WHERE app = $1 AND type LIKE '%|' || $2 || ':pattern' ORDER BY id DESC`,
          [app, parentKey]);
        const parent = rows.map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {})))
          .find(d => d.pattern_type !== 'admin' && d.pattern_type !== 'auth');
        patCache.set(key, parent ? resolveAuthPermissions(parent.authPermissions, '') : null);
      }
      return patCache.get(key);
    };

    const containerRows = await q(`SELECT ${cols} FROM ${T} WHERE app = $1 AND ${INST} IS NOT NULL`, [opts.app]);
    const controllerStub = {
      authRowsByIds: async (ids) => ids.length
        ? q(`SELECT ${cols} FROM ${T} WHERE app = $1 AND id = ANY($2::bigint[])`, [opts.app, ids]) : [],
      authContainers: async () => containerRows,
    };

    // `pattern` and `page` are the only kinds kind-auth decides; everything else it allowed
    // outright, so for those the diff is "what the gate would newly refuse".
    const tally = new Map();   // `${caller}|${kind}` -> {n, agree, tighter, looser, egT:[], egL:[]}
    const bump = (k, f, eg) => {
      const t = tally.get(k) || { n: 0, agree: 0, tighter: 0, looser: 0, egT: [], egL: [] };
      t.n++; t[f]++;
      if (eg && f !== 'agree' && t[f === 'tighter' ? 'egT' : 'egL'].length < 3) {
        t[f === 'tighter' ? 'egT' : 'egL'].push(eg);
      }
      tally.set(k, t);
    };

    for (const [label, user] of CALLERS) {
      // `mode: 'enforce'` is not optional here. The gate's default is `log`, which coerces every
      // verdict to allow and writes a would-deny line — so a harness that did not override it would
      // report zero divergence, loudly, forever. This asks what the rule DECIDES; nothing is
      // enforced, because nothing is being served.
      const gate = createGate({ controller: controllerStub, app: opts.app, user, subdomain: '', mode: 'enforce' });
      let after = '0';
      for (;;) {
        const batch = await q(
          `SELECT ${cols}, data FROM ${T} WHERE app = $1 AND id > $2::bigint ORDER BY id LIMIT 500`,
          [opts.app, after]);
        if (!batch.length) break;
        after = batch[batch.length - 1].id;
        const verdicts = await gate.judge(batch, 'read');
        for (const row of batch) {
          const kind = getKind(row.type);
          const legacyBlocked = await kindReadBlocked({ row, kind, user, subdomain: '', app: opts.app, patternAuthOf });
          const gateBlocked = !(verdicts.get(String(row.id)) || { allow: true }).allow;
          const key = `${label}|${kind}`;
          const eg = `${row.id} (${row.type})`;
          if (legacyBlocked === gateBlocked) bump(key, 'agree');
          else bump(key, gateBlocked ? 'tighter' : 'looser', eg);
        }
      }
    }

    console.log('\n   kind auth vs the gate, per caller and kind');
    console.log('        caller / kind                      rows    agree   TIGHTER    LOOSER');
    let anyLooser = 0, anyTighter = 0;
    for (const [key, t] of [...tally.entries()].sort()) {
      anyLooser += t.looser; anyTighter += t.tighter;
      if (t.tighter === 0 && t.looser === 0) continue;          // print only what differs
      console.log(`        ${key.padEnd(32)} ${String(t.n).padStart(6)} ${String(t.agree).padStart(8)}`
        + ` ${String(t.tighter).padStart(9)} ${String(t.looser).padStart(9)}`);
      for (const e of t.egT) console.log(`             tighter: ${e}`);
      for (const e of t.egL) console.log(`             LOOSER : ${e}`);
    }
    if (!anyTighter && !anyLooser) console.log('        (no divergence on any caller or kind)');

    console.log(`\n   TIGHTER ${anyTighter} — the gate refuses where today's rule allows.`);
    console.log(`   LOOSER  ${anyLooser} — the gate ALLOWS where today's rule refuses.`);
    console.log('   Looser is the direction that matters: every one must be explained before the');
    console.log('   `pattern` / `page` branch is deleted (row-auth-consolidate.md, "Done when" 1).');
  }

  // ---- coverage, the number that gates an `enforce` flip
  if (opts.apply && (canBackfill || opts.addColumns)) {
    // Re-counted: pass 3 both deletes orphans and inserts copies, so the figure taken at the top
    // of the run is no longer the denominator.
    const total = (await one(`SELECT count(*)::int n FROM ${T} WHERE app = $1`, [opts.app])).n;
    const set = (await one(`SELECT count(*)::int n FROM ${T} WHERE app = $1 AND parent_id IS NOT NULL`, [opts.app])).n;
    const res = (await one(
      `SELECT count(*)::int n FROM ${T} c WHERE c.app = $1 AND c.parent_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM ${T} p WHERE p.id = c.parent_id)`, [opts.app])).n;
    const roots = (await one(
      `SELECT count(*)::int n FROM ${T} WHERE app = $1 AND parent_id IS NULL AND type LIKE '%:site'`, [opts.app])).n;
    console.log(`\ncoverage after migration:`);
    console.log(`  parent_id set        ${set}/${total}  (${(100 * set / total).toFixed(1)}%)`);
    console.log(`  …resolves to a row   ${res}/${total}  (${(100 * res / total).toFixed(1)}%)`);
    console.log(`  site rows (roots)    ${roots}`);
    console.log(`\nParent-resolution coverage gates any DMS_ROW_AUTH_MODE=enforce flip for this app:`);
    console.log(`a row private only by inheritance opens up when its parent cannot be resolved.`);
  } else if (!opts.apply && !opts.verify) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply.');
  }

  await db.end();
}

main()
  .then(() => { if (verifyDrift) process.exit(1); })
  .catch(e => { console.error('\nERROR:', e.message); process.exit(1); });
