#!/usr/bin/env node
'use strict';
/**
 * What the legacy-verb shim was still rescuing, row by row — and the conversion that makes it zero.
 *
 *     node convert-grant-vocabulary.js --db <config> --app <app> [--apply]
 *
 * THE SHIM WAS THE LAST BACKWARDS-COMPATIBILITY IN THE AUTH PATH, and it is GONE from the server
 * as of 2026-11-03 (`routes/auth/rowAuth/legacyVerbs.js`, deleted — row-auth-uda-unify-api.md
 * Phase 1a). A grant names verbs (`view-page`, `update-source`); a decision asks a structural
 * question (`read`, `edit`, …). The bridge is now the vocabulary the row's chain DECLARES, and
 * nothing else: an undeclared verb confers no structural verb at all.
 *
 * THIS SCRIPT IS THEREFORE THE PRE-FLIGHT FOR EVERY APP THAT HAS NOT BEEN CONVERTED — production
 * above all. It carries its own frozen copy of what the shim used to confer (`LEGACY_IMPLIES`
 * below) so it can still answer the question after the shim itself is gone. Run it against an app
 * BEFORE that app runs this server.
 *
 * Owner, 2026-11-02: *"in cases where the old vocabulary reaches the decider it should be treated
 * as null, falling back to the default settings. It shouldn't try to be backwards compatible."*
 *
 * So this does not translate old verbs into new ones — there is no mapping to write. It measures
 * which principals LOSE a structural verb when the shim stops rescuing them, which is the only
 * question that decides whether the shim can go, and it names the rows to fix.
 *
 * READ IT AS: "now that the shim is gone, here is exactly who loses what on this app."
 *
 *   DECLARED      the verb is in the vocabulary the row's chain declares. Unaffected.
 *   SHIM-ONLY     undeclared, but the shim used to confer something. THIS is what its removal costs.
 *   INERT         undeclared and not in the shim either. Confers nothing today; nothing changes.
 *
 * A principal only LOSES access if every verb it holds is SHIM-ONLY or INERT. One declared verb
 * carrying the same structural verb is enough to keep it, which is why the row counts above
 * overstate the damage and the per-principal check below is the one that matters.
 *
 * ⚠ `--apply` strips INERT verbs — they confer nothing under any reading, so removing them is a
 * tidy-up, not a decision. It NEVER rewrites a SHIM-ONLY verb into a declared one: that would be
 * reinterpreting stored data, which is the owner's call and is reported, not performed.
 */
const { loadConfig } = require('../db/config');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { resolveTable, resolveFormatsTable } = require('../db/table-resolver');
const { getKind, getParent, getInstance } = require('../db/type-utils');
const { vocabularyOf } = require('../routes/auth/vocabulary');

/**
 * `{ self, descendants, flat }` → `{ [verb]: implies[] }` from a declared vocabulary. The server no
 * longer reads `implies` (the judge matches verbs by name since 2026-11-04, so vocabulary.js dropped
 * this map); it lives on here because this report still asks the historical question — which
 * STRUCTURAL verb a grant used to confer — beside the one that matters now: is the verb declared.
 */
function impliesMaps(vocabulary) {
  const maps = { self: {}, descendants: {}, flat: {} };
  for (const scope of ['self', 'descendants']) {
    for (const e of (Array.isArray(vocabulary[scope]) ? vocabulary[scope] : [])) {
      if (!e || typeof e.value !== 'string') continue;
      const implies = [...new Set([].concat(e.implies || []))];
      maps[scope][e.value] = implies;
      maps.flat[e.value] = [...new Set([...(maps.flat[e.value] || []), ...implies])];
    }
  }
  return maps;
}
const { resolveAuthPermissions } = require('../routes/auth/grants');

const STRUCTURAL = ['read', 'create', 'edit', 'delete', 'grant'];

/**
 * WHAT THE SHIM USED TO CONFER — a frozen historical copy.
 *
 * `routes/auth/rowAuth/legacyVerbs.js` was deleted on 2026-11-03, once `rowauth-test` reported
 * 100% vocabulary coverage and this script reported zero losers for it. The table lives on HERE,
 * and only here, because this script's whole job is to answer "what does deleting it cost?" for an
 * app that has NOT been converted yet — production above all. It is data about the past, so it is
 * frozen: nothing adds a verb to it, and no running code reads it.
 */
const LEGACY_IMPLIES = Object.freeze({
  // reads
  'view':               ['read'],
  'view-page':          ['read'],
  'view-pattern':       ['read'],
  'view-pattern-list':  ['read'],
  'view-sources':       ['read'],
  'view-source':        ['read'],

  // writes
  'edit':               ['edit'],
  'edit-page':          ['read', 'edit', 'delete'],
  'edit-pattern':       ['read', 'edit'],
  'update-source':      ['read', 'edit'],
  'edit-source-data':   ['read', 'edit'],
  'manage-themes':      ['read', 'edit'],
  'manage-tenants':     ['read', 'edit'],
  'publish-page':       ['read', 'edit'],
  'edit-page-params':   ['read', 'edit'],

  // creates — governed against the PARENT, which is why they are their own verb
  'create-page':        ['read', 'create'],
  'create-pattern':     ['read', 'create'],
  'create-view':        ['read', 'create'],
  'create-source':      ['read', 'create'],

  // deletes
  'delete-pattern':     ['read', 'delete'],
  'delete-source':      ['read', 'delete'],

  // the escalation guard: writing the grants themselves
  'edit-page-permissions':    ['read', 'edit', 'grant'],
  'edit-pattern-permissions': ['read', 'edit', 'grant'],
  'edit-source-permissions':  ['read', 'edit', 'grant'],

  // deliberately absent — UI capabilities with no row behind them:
  //   download-source, view-source-api, manage-downloads, view-as, auth-users, auth-groups
});


function parseArgs() {
  const a = process.argv.slice(2); const o = { apply: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
    else if (a[i] === '--apply') o.apply = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  if (!o.db || !o.app) { console.error('--db and --app are required'); process.exit(1); }
  return o;
}

/**
 * A row's grants AND where they came from, because a strip has to write back to the place it read
 * from. Reading `auth` and writing `data` leaves the row exactly as it was and reports success —
 * which this script did on its first run, caught only because a second run reported the same work
 * still outstanding. Idempotence is the test that finds it.
 */
const grantsOf = (r, subdomain = '') => {
  const a = r.auth && typeof r.auth === 'object' ? r.auth : null;
  if (a) {
    const { vocabulary, childRefs, view, ...rest } = a;
    const res = resolveAuthPermissions(rest, subdomain) || {};
    if (res.groups || res.users) {
      // ⚠ SUBDOMAIN-KEYED COLUMNS. `resolveAuthPermissions` returns `parsed[subdomain] ?? parsed['*']`
      // when a `'*'` key is present, so the grants live INSIDE that branch and any top-level
      // `groups`/`users` are ignored. Writing to the top level therefore changes nothing and
      // reports success — which this script did until a second run kept reporting the same work.
      const branch = rest['*'] !== undefined
        ? (rest[subdomain] !== undefined ? subdomain : '*')
        : null;
      // ⚠ AND THE BRANCH MAY BE A JSON *STRING*. Thousands of rows double-encode their grants
      // (`migrate-row-auth.js` pass 2 documents 3,194 on this app alone). `resolveAuthPermissions`
      // parses transparently, but `jsonb_set` into a path under a string value silently does
      // nothing — a write that reports success and changes not one byte. Preserve the encoding
      // the row already uses rather than normalising it; other readers expect what is there.
      const encoded = branch !== null
        ? typeof rest[branch] === 'string'
        : false;
      return { grants: res, col: 'auth', key: branch, encoded };
    }
  }
  const d = r.data || {};
  if (d.authPermissions !== undefined) {
    return { grants: resolveAuthPermissions(d.authPermissions, subdomain) || {}, col: 'data', key: 'authPermissions' };
  }
  return { grants: resolveAuthPermissions(d.auth_permissions, subdomain) || {}, col: 'data', key: 'auth_permissions' };
};

/** What a verb confers under the chain's declared vocabulary (null when undeclared). */
const declaredImplies = (maps, verb) => {
  if (!maps) return null;
  for (const scope of ['self', 'descendants', 'flat']) {
    const m = maps[scope] || {};
    if (m[verb]) return m[verb];
  }
  return null;
};

async function main() {
  const o = parseArgs();
  const config = loadConfig(o.db);
  const db = config.type === 'postgres' ? new PostgresAdapter(config) : new SqliteAdapter(config);
  const q = (sql, v) => db.promise(sql, v).then(r => r.rows ?? r);
  const t = resolveTable(o.app, '', config.type, config.splitMode);
  const T = config.type === 'postgres' ? `"${t.schema}"."${t.table}"` : t.table;

  console.log(`\nconvert grant vocabulary — ${o.apply ? 'APPLY (strips INERT verbs)' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}\n`);

  // The legacy `parent_id` / `auth` columns exist on databases that ran migrate-row-auth.js
  // (`rowauth-test`), not on production (dms3, 2026-11-07): read them only where they are.
  const cols = new Set((config.type === 'postgres'
    ? await q(`SELECT column_name AS name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`, [t.schema, t.table])
    : await q(`PRAGMA table_info(${t.table})`)).map(c => c.name));
  const optional = ['parent_id', 'auth'].filter(c => cols.has(c));
  // Only the keys this report reads: the whole `data` of a 337k-row site (pages, sections) does not fit in
  // the heap (2026-11-07, mitigat-ny-prod).
  const DATA_KEYS = ['authPermissions', 'auth_permissions', 'pattern_type', 'authVocabulary'];
  const dataExpr = config.type === 'postgres'
    ? `jsonb_strip_nulls(jsonb_build_object(${DATA_KEYS.map(k => `'${k}', data->'${k}'`).join(', ')}))`
    : `json_object(${DATA_KEYS.map(k => `'${k}', json_extract(data, '$.${k}')`).join(', ')})`;
  const rows = await q(`SELECT id, type${optional.map(c => `, ${c}`).join('')}, ${dataExpr} AS data FROM ${T} WHERE app = $1`, [o.app]);
  for (const r of rows) if (typeof r.data === 'string') { try { r.data = JSON.parse(r.data); } catch { r.data = {}; } }
  const byId = new Map(rows.map(r => [String(r.id), r]));
  // The declared vocabularies, as the server reads them (routes/auth/formats.js index): by format key
  // for a pattern row (`<pattern_type>+pattern`), by row kind otherwise; the stamp on the row answers
  // for a kind the table says nothing about.
  const fByKey = new Map(), fByKind = new Map();
  try {
    const f = resolveFormatsTable(o.app, config.type, config.splitMode);
    const F = config.type === 'postgres' ? `"${f.schema}"."${f.table}"` : f.table;
    for (const r of await q(`SELECT type, auth_vocabulary FROM ${F} WHERE app = $1`, [o.app])) {
      const v = typeof r.auth_vocabulary === 'string' ? JSON.parse(r.auth_vocabulary) : r.auth_vocabulary;
      if (!v) continue;
      fByKey.set(r.type, v);
      const kind = r.type.slice(r.type.indexOf('+') + 1);
      if (kind !== 'pattern' && !fByKind.has(kind)) fByKind.set(kind, v);
    }
  } catch (e) { if (!/no such table|does not exist/i.test(e.message)) throw e; }
  console.log(`  declared formats: ${fByKey.size} key(s) in the formats table${fByKey.size ? '' : ' (none registered: only stamped rows declare a vocabulary)'}`);
  const vocabAt = (r) => {
    const kind = getKind(r.type);
    const f = kind === 'pattern' ? fByKey.get(`${(r.data || {}).pattern_type}+pattern`) : fByKind.get(kind);
    return f || vocabularyOf({ auth: r.auth, data: r.data });
  };
  // The parent: `parent_id` where stamped, else the container the type path names (owners.js parentOf).
  const byInstance = new Map();
  for (const r of rows) { const i = getInstance(r.type); if (i) byInstance.set(i, [...(byInstance.get(i) || []), r]); }
  const siteRow = rows.find(r => getKind(r.type) === 'site') || null;
  const parentOf = (r) => {
    if (r.parent_id != null && byId.has(String(r.parent_id))) return byId.get(String(r.parent_id));
    const pk = getParent(r.type);
    if (!pk) return getKind(r.type) === 'site' ? null : siteRow;
    return (byInstance.get(pk) || []).find(x => x !== r && getKind(x.type) !== getKind(r.type)) || null;
  };
  const mapsFor = (r) => {
    let cur = r;
    for (let d = 0; cur && d < 8; d++) {
      const v = vocabAt(cur);
      if (v) return impliesMaps(v);
      cur = parentOf(cur);
    }
    return null;
  };

  const verbStat = new Map();           // verb -> { declared, shimOnly, inert }
  const losers = [];                    // principals that lose a structural verb
  const inertWrites = new Map();        // row id -> cleaned grants
  let withGrants = 0;

  for (const r of rows) {
    const { grants: g, col, key, encoded } = grantsOf(r);
    const maps = mapsFor(r);
    let touched = false;
    const cleaned = { ...g };
    let any = false;

    for (const bucket of ['groups', 'users']) {
      if (!g[bucket]) continue;
      cleaned[bucket] = { ...g[bucket] };
      for (const [who, raw] of Object.entries(g[bucket])) {
        const verbs = [].concat(raw || []);
        if (!verbs.length) continue;
        any = true;
        if (verbs.includes('*')) continue;             // `*` is everything, under any vocabulary

        const keep = [], nowHas = new Set(), thenHas = new Set();
        for (const v of verbs) {
          const dec = declaredImplies(maps, v);
          const leg = LEGACY_IMPLIES[v];
          const cls = dec ? 'declared' : (leg ? 'shimOnly' : 'inert');
          const s = verbStat.get(v) || { declared: 0, shimOnly: 0, inert: 0 };
          s[cls]++; verbStat.set(v, s);
          // today = declared wins, else the shim;   after = declared only
          (dec || leg || []).forEach(x => nowHas.add(x));
          (dec || []).forEach(x => thenHas.add(x));
          if (cls === 'inert') touched = true; else keep.push(v);
        }
        const lost = STRUCTURAL.filter(x => nowHas.has(x) && !thenHas.has(x));
        if (lost.length) losers.push({ id: r.id, type: r.type, bucket, who, verbs, lost });
        if (keep.length !== verbs.length) cleaned[bucket][who] = keep;
      }
    }
    if (any) withGrants++;
    if (touched) inertWrites.set(r.id, { cleaned, col, key, encoded });
  }

  console.log(`rows ${rows.length}   with grants ${withGrants}\n`);
  console.log('verb                          declared   shim-only   inert');
  for (const [v, s] of [...verbStat].sort((a, b) => (b[1].declared + b[1].shimOnly + b[1].inert) - (a[1].declared + a[1].shimOnly + a[1].inert))) {
    console.log(`  ${v.padEnd(28)}${String(s.declared).padStart(8)}${String(s.shimOnly).padStart(12)}${String(s.inert).padStart(8)}`);
  }

  console.log(`\nWHO LOSES A STRUCTURAL VERB NOW THAT THE LEGACY SHIM IS GONE: ${losers.length}`);
  for (const l of losers.slice(0, 40)) {
    console.log(`   #${l.id} ${l.type}`);
    console.log(`      ${l.bucket}.${l.who}  holds [${l.verbs.join(', ')}]  loses [${l.lost.join(', ')}]`);
  }
  if (losers.length > 40) console.log(`   … and ${losers.length - 40} more`);
  if (!losers.length) {
    console.log('   NOBODY. Every principal keeps every structural verb through a DECLARED verb,');
    console.log('   so this app can run the shim-free server with no change in access.');
  }

  console.log(`\nINERT verbs to strip (confer nothing under any reading): ${inertWrites.size} row(s)`);
  for (const [id, w] of inertWrites) console.log(`   #${id}  col=${w.col}  branch=${w.key ?? '(top level)'}`);
  if (!o.apply) { console.log('\nDRY RUN — nothing was written. Re-run with --apply to strip INERT verbs.'); await db.end(); return; }

  for (const [id, w] of inertWrites) {
    // Back to the column it was READ from. The `auth` column holds the grants at its top level
    // (beside `vocabulary` / `childRefs`), so a strip there merges the cleaned buckets rather than
    // replacing the object and dropping the declarations with it.
    if (w.col === 'auth') {
      if (w.encoded) {
        // The whole branch is a JSON string: replace it with a string of the cleaned object.
        await q(`UPDATE ${T} SET auth = jsonb_set(COALESCE(auth,'{}'::jsonb), $2::text[], to_jsonb($3::text)) WHERE id = $1`,
          [id, `{${w.key}}`, JSON.stringify(w.cleaned)]);
      } else {
        // Into the resolved BRANCH when the column is subdomain-keyed, else the top level.
        for (const bucket of ['groups', 'users']) {
          if (!w.cleaned[bucket]) continue;
          const path = w.key ? `{${w.key},${bucket}}` : `{${bucket}}`;
          await q(`UPDATE ${T} SET auth = jsonb_set(COALESCE(auth,'{}'::jsonb), $2::text[], $3::jsonb) WHERE id = $1`,
            [id, path, JSON.stringify(w.cleaned[bucket])]);
        }
      }
    } else {
      await q(`UPDATE ${T} SET data = jsonb_set(COALESCE(data,'{}'::jsonb), $2::text[], $3::jsonb) WHERE id = $1`,
        [id, `{${w.key}}`, JSON.stringify(w.cleaned)]);
    }
  }
  console.log(`  stripped INERT verbs on ${inertWrites.size} row(s).`);
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
