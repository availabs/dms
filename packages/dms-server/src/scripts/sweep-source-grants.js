#!/usr/bin/env node
'use strict';
/**
 * THE GRANT SWEEP — make a source's own grants say what its datasets pattern currently lends it.
 *
 *     node sweep-source-grants.js --db <config> --app <app> [--apply] [--verify]
 *
 * ---------------------------------------------------------------------------
 * Why
 *
 * A source's type is `{env}|{name}:source`. The datasets PATTERN is nowhere in that path, so it is
 * not an ancestor and has no business lending grants to it — the decision recorded as
 * `no-pattern-lending` (row-auth-uda-unify-api.md Phase 2, owner 2026-11-02). The WRITE path
 * already stopped lending. The READ path has not: `sourceSnapshot.loadInternal` still unions the
 * grants of every datasets pattern that LISTS a source into `patternAP`, and `decideFromRow`
 * merges it.
 *
 * Cutting that is a one-line change. Doing it without this sweep first takes access away from
 * whoever was relying on the lend, silently, on a read path. So: write the lent grants onto the
 * sources themselves, and then cutting the lend changes no verdict at all. That is the whole
 * contract, and `--verify` is how it is checked rather than asserted.
 *
 * ---------------------------------------------------------------------------
 * What it writes, and what it refuses to write
 *
 * ONLY WHERE A VERDICT WOULD OTHERWISE CHANGE. A diff of grant OBJECTS massively overstates the
 * work — on `rowauth-test` it flags 64 of 71 sources — because most of what a pattern lends is
 * already true without it: a source stating NO grants is readable by everyone under rule 5
 * (`isUnstated`), so the `public: [view-page, …]` half of a lend confers nothing it did not
 * already have. Judging instead, the same 64 sources lose only EDIT verbs, and only for the
 * principals holding `*` on the pattern.
 *
 * ⚠ BUT WRITING ANYTHING MAKES THE SOURCE *STATED*, AND THAT IS ITSELF A CHANGE. Rule 5 says an
 * unstated chain is readable by everyone (`isUnstated`); the moment one grant is written, the row
 * is judged by its grants instead, and anyone who was reading it only through rule 5 stops. On
 * `rowauth-test` that would have taken public reads off 63 sources — a bigger regression than the
 * one being prevented, caused by the fix rather than found by it.
 *
 * So the unit is THE SOURCE, not the principal: a source that needs any write gets the pattern's
 * ENTIRE grant object copied, every principal the pattern names, verbatim. Nobody gains anything —
 * it is what the pattern already confers on that source today — and the row's post-write verdicts
 * are identical to its pre-write ones for everyone, which is the contract. A per-principal write
 * would satisfy the principals it tested and quietly break the rest.
 *
 * ADDITIVE AND IDEMPOTENT. It merges into each principal's existing list, never removes, never
 * touches a source that loses nothing, and a second run reports zero.
 *
 * ---------------------------------------------------------------------------
 * Internal sources only
 *
 * `data_items` rows of kind `:source`. External sources (a pgEnv's `data_manager.sources`) are NOT
 * swept here, for a reason rather than an omission: their lend comes from the pattern the REQUEST
 * names, not from a pattern that lists them, so there is no per-source answer to compute — and a
 * DAMA pgEnv is shared with production, where a write changes a live site. The external half of
 * the sweep is an explicit, named list (row-auth-uda.md: `hazmit_dama` #1515 / #12453 / #13824 and
 * all of `wcdb-dama` but #14), and `grant-public-read-sources.js` is the shape that handles it.
 */
const { loadConfig } = require('../db/config');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { resolveTable } = require('../db/table-resolver');
const { resolveAuthPermissions } = require('../routes/auth/auth');
const { snapshot, clearReadSnapshots } = require('../routes/auth/sourceSnapshot');
const { readsRow, holdsAny } = require('../routes/auth/rowAuth/rowSourceAuth');
const { mergeAuthChain } = require('../routes/auth/rowAuth/mergeAuth');

// The datasets verbs a principal can hold on a source. `download-source` is in the list precisely
// because it confers no row access — if the sweep ever reported it lost, that would be news.
const VERBS = ['update-source', 'edit-source-data', 'create-view', 'delete-source',
               'edit-source-permissions', 'download-source'];

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

/**
 * A row's effective grants, and WHERE THIS SCRIPT WILL WRITE THEM.
 *
 * Those are not the same place, and conflating them cost a whole run: of 64 sources swept on the
 * first attempt, 1 took. Grants are READ from the `auth` column when it states a principal, else
 * from `data` — but a source row keeps its `data` grants under `auth_permissions`, not
 * `authPermissions`, and a source that states nothing has NEITHER key. Defaulting to the page
 * spelling wrote 63 rows into `data.authPermissions`, which no reader of a source consults. The
 * write reported success and changed nothing anybody reads.
 *
 * So this always writes the `auth` COLUMN. It is the system of record — `ownAuthOf` and
 * `rawAuthOf` both read it first and fall back to `data` only when it names no principal — so a
 * write there is effective whatever `data` happens to hold, and it needs no guess about spelling.
 *
 * ⚠ SUBDOMAIN-KEYED COLUMNS still decide the path: `resolveAuthPermissions` returns
 * `parsed[subdomain] ?? parsed['*']` when a `'*'` key is present, so the grants live inside that
 * branch and a top-level write is ignored. And that branch may be a JSON STRING, into which
 * `jsonb_set` writes silently nothing. Both are `convert-grant-vocabulary.js`'s scars, kept here.
 */
const grantsOf = (r, subdomain = '') => {
  const a = typeof r.auth === 'string' ? JSON.parse(r.auth || 'null') : r.auth;
  const col = a && typeof a === 'object' && !Array.isArray(a) ? a : null;
  const branch = col && col['*'] !== undefined
    ? (col[subdomain] !== undefined ? subdomain : '*')
    : null;
  const encoded = branch !== null && typeof col[branch] === 'string';

  if (col) {
    const { vocabulary, childRefs, view, ...rest } = col;
    const res = resolveAuthPermissions(rest, subdomain) || {};
    if (res.groups || res.users) return { grants: res, key: branch, encoded };
  }
  // The column states nothing: read what the row actually has, write the column anyway.
  const d = (typeof r.data === 'string' ? JSON.parse(r.data || 'null') : r.data) || {};
  const raw = d.auth_permissions !== undefined ? d.auth_permissions : d.authPermissions;
  return { grants: resolveAuthPermissions(raw, subdomain) || {}, key: branch, encoded };
};

/** Everyone named by either object, plus the anonymous caller. `public` is a group, not a session. */
const principalsOf = (...aps) => {
  const groups = new Set(), users = new Set();
  for (const ap of aps) {
    for (const g of Object.keys((ap && ap.groups) || {})) groups.add(g);
    for (const u of Object.keys((ap && ap.users) || {})) users.add(u);
  }
  return [
    { label: 'anon', bucket: null, who: null, user: null },
    ...[...groups].map(g => ({ label: `groups.${g}`, bucket: 'groups', who: g,
                              user: { authed: g !== 'public', id: null, groups: [g] } })),
    ...[...users].map(u => ({ label: `users.${u}`, bucket: 'users', who: u,
                              user: { authed: true, id: u, groups: [] } })),
  ];
};

/** What `p` can do on this source WITH the pattern's lend, and what it could do without it. */
function lostBy(p, pat, own, app, maps) {
  const lost = [];
  if (readsRow(pat, own, p.user, app).allow && !readsRow({}, own, p.user, app).allow) lost.push('read');
  for (const v of VERBS) {
    const withLend = holdsAny(mergeAuthChain([pat, own]), p.user, app, [v], maps).allow;
    const without  = holdsAny(mergeAuthChain([{}, own]),  p.user, app, [v], maps).allow;
    if (withLend && !without) lost.push(v);
  }
  return lost;
}

async function main() {
  const o = parseArgs();
  const config = loadConfig(o.db);
  const db = config.type === 'postgres' ? new PostgresAdapter(config) : new SqliteAdapter(config);
  const q = (sql, v) => db.promise(sql, v).then(r => r.rows ?? r);
  const t = resolveTable(o.app, '', config.type, config.splitMode);
  const T = config.type === 'postgres' ? `"${t.schema}"."${t.table}"` : t.table;

  const mode = o.verify ? 'VERIFY' : o.apply ? 'APPLY' : 'DRY RUN';
  console.log(`\ngrant sweep — ${mode}`);
  console.log(`  db=${o.db}  app=${o.app}  table=${T}\n`);

  clearReadSnapshots();
  const snap = await snapshot(`${o.app}+sweep`, '');
  const rows = await q(`SELECT id, type, auth, data FROM ${T} WHERE app = $1 AND type LIKE '%:source'`, [o.app]);
  const byId = new Map(rows.map(r => [String(r.id), r]));

  const writes = [];                 // { id, type, col, key, encoded, grants, adds }
  const tally = new Map();           // "verb / principal" -> count
  let orphan = 0, untouched = 0;

  for (const [id, s] of snap.sources) {
    const row = byId.get(String(id));
    if (!row) continue;
    if (s.orphan) { orphan++; continue; }
    const pat = s.patternAP || {}, own = s.ap || {};
    // 1. does ANY principal lose a verdict? That is what decides whether this source is touched.
    const losers = [];
    for (const p of principalsOf(pat, own)) {
      if (!p.bucket) continue;                               // anon holds nothing to copy
      const lost = lostBy(p, pat, own, o.app, s.maps);
      if (!lost.length) continue;
      for (const l of lost) tally.set(`${l} / ${p.label}`, (tally.get(`${l} / ${p.label}`) || 0) + 1);
      losers.push({ label: p.label, lost });
    }
    if (!losers.length) { untouched++; continue; }
    // 2. if so, copy EVERY principal the pattern names — see the header. Writing only the losers
    //    would make the row stated and strip rule-5 reads from everyone else it lends to.
    const adds = [];
    for (const bucket of ['groups', 'users']) {
      for (const [who, perms] of Object.entries(pat[bucket] || {})) {
        const lent = [].concat(perms || []);
        if (!lent.length) continue;
        const l = losers.find(x => x.label === `${bucket}.${who}`);
        adds.push({ bucket, who, perms: lent, lost: l ? l.lost : ['— carried so rule 5 is not lost'] });
      }
    }
    if (!adds.length) { untouched++; continue; }
    const g = grantsOf(row);
    writes.push({ id: row.id, type: row.type, ...g, adds });
  }

  console.log(`  sources                        ${snap.sources.size}`);
  console.log(`  in no datasets pattern         ${orphan}`);
  console.log(`  lose nothing when the lend goes ${untouched}`);
  console.log(`  NEED A GRANT WRITTEN           ${writes.length}\n`);

  if (tally.size) {
    console.log('  what would be lost, and on how many sources:');
    for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(5)} × ${k}`);
    console.log();
  }

  if (o.verify) {
    const ok = writes.length === 0;
    console.log(ok
      ? '  ✓ CUTTING THE LEND CHANGES NO VERDICT ON THIS APP. The sweep is complete.'
      : `  ✗ ${writes.length} source(s) still rely on a lent grant — run without --verify to see them, then --apply.`);
    await db.end();
    process.exit(ok ? 0 : 1);
  }

  for (const w of writes.slice(0, 20)) {
    console.log(`   #${w.id} ${w.type}  → auth${w.key ? `.${w.key}` : ''}${w.encoded ? ' (json string)' : ''}`);
    for (const a of w.adds) console.log(`      + ${a.bucket}.${a.who} = [${a.perms.join(', ')}]   (keeps: ${a.lost.join(', ')})`);
  }
  if (writes.length > 20) console.log(`   … and ${writes.length - 20} more`);

  if (!o.apply) { console.log('\nDRY RUN — nothing was written. Re-run with --apply, then --verify.'); await db.end(); return; }

  for (const w of writes) {
    // Merge into the principal's existing list; never remove, never reorder what is there.
    const merged = { groups: { ...(w.grants.groups || {}) }, users: { ...(w.grants.users || {}) } };
    for (const a of w.adds) {
      const have = [].concat(merged[a.bucket][a.who] || []);
      merged[a.bucket][a.who] = [...new Set([...have, ...a.perms])];
    }
    if (w.encoded) {
      // The whole branch is a JSON string — replace it with a string of the merged object.
      await q(`UPDATE ${T} SET auth = jsonb_set(COALESCE(auth,'{}'::jsonb), $2::text[], to_jsonb($3::text)) WHERE id = $1`,
        [w.id, `{${w.key}}`, JSON.stringify(merged)]);
    } else {
      // Per BUCKET, so `vocabulary` / `childRefs` beside the grants survive the write.
      for (const bucket of ['groups', 'users']) {
        const path = w.key ? `{${w.key},${bucket}}` : `{${bucket}}`;
        await q(`UPDATE ${T} SET auth = jsonb_set(COALESCE(auth,'{}'::jsonb), $2::text[], $3::jsonb) WHERE id = $1`,
          [w.id, path, JSON.stringify(merged[bucket])]);
      }
    }
  }
  console.log(`\n  wrote grants on ${writes.length} source(s). Re-run with --verify.`);
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
