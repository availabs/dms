#!/usr/bin/env node
/**
 * Grant `view-source` to the anonymous `public` group on named DAMA sources.
 *
 *     node grant-public-read-sources.js --pg-env <env> --sources 101,102 [--apply]
 *     node grant-public-read-sources.js --pg-env <env> --from-file ids.txt [--apply]
 *
 * WHY THIS EXISTS. A DAMA source is PRIVATE BY DEFAULT: `createDamaSource` writes
 * `{ users: { <creator>: ['*'] }, groups: { public: [] } }` (dama/upload/metadata.js), and
 * `src/dama/CLAUDE.md` states the consequence — "a public page charting one goes blank under
 * `enforce` unless the source grants `public: ['view-source']`". That is the policy, not a bug, so
 * the remedy is a deliberate per-source grant rather than a change to how reads are judged.
 *
 * On `hazmit_dama` at the time of writing, 0 of 13,390 sources granted the public anything: 10,372
 * carried `AVAIL: ['*']` alone and 2,988 an explicit `public: []`. Under `enforce` an anonymous
 * visitor can read none of them.
 *
 * ⚠ A DAMA pgEnv IS SHARED WITH PRODUCTION. `hazmit_dama` is the live database behind MitigateNY —
 * it is not namespaced per app the way `data_items` is, so a write here changes the production
 * site. This script therefore takes an EXPLICIT source list; it has no "--all" and never will.
 *
 * ADDITIVE AND NARROW. It adds `view-source` to `groups.public` and touches nothing else — not
 * `download-source` (reading in the system and downloading the file are deliberately different
 * things), not any other principal, and it never removes a grant. A source that already grants the
 * public something is reported and left alone, because an existing public list is a decision
 * someone made.
 *
 * Dry run unless `--apply`.
 */
const { getDb, awaitReady } = require('../db');
const { readFileSync } = require('node:fs');

const READ = 'view-source';

async function main() {
  const a = process.argv.slice(2);
  const o = { apply: false, sources: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--pg-env') o.env = a[++i];
    else if (a[i] === '--sources') o.sources.push(...String(a[++i]).split(',').map(s => +s.trim()).filter(Boolean));
    else if (a[i] === '--from-file') {
      o.sources.push(...readFileSync(a[++i], 'utf8').split(/\s+/).map(s => +s.trim()).filter(Boolean));
    }
    else if (a[i] === '--apply') o.apply = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  if (!o.env) { console.error('--pg-env is required'); process.exit(1); }
  if (!o.sources.length) { console.error('name the sources: --sources or --from-file (there is no --all)'); process.exit(1); }

  const ids = [...new Set(o.sources)];
  const db = getDb(o.env); await awaitReady();
  console.log(`grant public ${READ} — ${o.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`  pgEnv=${o.env}  sources named=${ids.length}\n`);

  const { rows } = await db.query(
    `SELECT source_id, name, auth_permissions AS ap FROM data_manager.sources WHERE source_id = ANY($1)`,
    [ids]);
  const found = new Set(rows.map(r => +r.source_id));
  const missing = ids.filter(id => !found.has(id));

  let toWrite = 0, already = 0;
  for (const r of rows) {
    const ap = (typeof r.ap === 'string' ? JSON.parse(r.ap || '{}') : r.ap) || {};
    const groups = { ...(ap.groups || {}) };
    const pub = Array.isArray(groups.public) ? groups.public : [];
    if (pub.includes(READ) || pub.includes('*')) { already++; continue; }
    if (pub.length) {
      // Someone chose this list. Adding to it is still additive, but say so loudly.
      console.log(`  ! ${String(r.source_id).padStart(7)}  ${r.name} — public already holds [${pub.join(', ')}]`);
    }
    toWrite++;
    if (o.apply) {
      const next = { ...ap, groups: { ...groups, public: [...pub, READ] } };
      await db.query(`UPDATE data_manager.sources SET auth_permissions = $2 WHERE source_id = $1`,
        [r.source_id, JSON.stringify(next)]);
    }
  }

  console.log(`\n  sources found                ${rows.length}`);
  console.log(`  already readable by public   ${already}`);
  console.log(`  ${o.apply ? 'granted' : 'would grant'} public ${READ}    ${toWrite}`);
  if (missing.length) console.log(`  named but not in this pgEnv  ${missing.length}  (${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', …' : ''})`);
  if (!o.apply) console.log('\nDRY RUN — nothing was written. Re-run with --apply.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
