#!/usr/bin/env node
/**
 * Grant one or more groups `*` (full control) on EVERY source of a DAMA pgEnv, by merging into each
 * source's `auth_permissions.groups` (existing grants — public, other groups/users — are preserved).
 *
 *   node src/scripts/grant-groups-star-on-sources.js <pgEnv> <Group1,Group2> [--commit]
 *
 * e.g.  node src/scripts/grant-groups-star-on-sources.js npmrds2 AVAIL,NYSDOT --commit
 *
 * Dry-run by default. Idempotent (only writes rows that aren't already `['*']` for the group).
 *
 * NOTE: this bakes a deployment-wide admin grant into every source row because server enforcement is
 * currently source-level. The conceptually-cleaner home for "applies to all sources" is the datasets
 * PATTERN's authPermissions; once server-side pattern⊕source enforcement lands, prefer that + drop
 * these per-source copies. New sources created after this runs won't get the grant automatically —
 * re-run, or set it pattern-level.
 */
const { getDb, awaitReady } = require('../db');

const PG_ENV = process.argv[2];
const GROUPS = (process.argv[3] || '').split(',').map(s => s.trim()).filter(Boolean);
const COMMIT = process.argv.includes('--commit');

async function main() {
    if (!PG_ENV || !GROUPS.length) {
        console.error('usage: node src/scripts/grant-groups-star-on-sources.js <pgEnv> <Group1,Group2> [--commit]');
        process.exit(1);
    }
    const db = getDb(PG_ENV);
    await awaitReady(PG_ENV);
    const q = (sql, p) => db.query(sql, p).then(r => r.rows);

    console.log(`\n=== grant ${GROUPS.join(', ')} = ['*'] on all sources · pgEnv=${PG_ENV} · ${COMMIT ? 'COMMIT' : 'DRY RUN'} ===\n`);

    const rows = await q(`SELECT source_id, coalesce(auth_permissions, '{}'::jsonb) AS ap FROM data_manager.sources ORDER BY source_id`);

    let changed = 0;
    const plans = rows.map(r => {
        const ap = typeof r.ap === 'string' ? JSON.parse(r.ap || '{}') : (r.ap || {});
        ap.groups = ap.groups || {};
        let touched = false;
        for (const g of GROUPS) {
            if (JSON.stringify(ap.groups[g]) !== JSON.stringify(['*'])) { ap.groups[g] = ['*']; touched = true; }
        }
        if (touched) changed++;
        return { source_id: r.source_id, ap, touched };
    });

    console.log(`sources: ${rows.length}; will set ${GROUPS.join('/')} = ['*'] on ${changed} (others already have it)`);

    if (!COMMIT) {
        console.log('\nDRY RUN — nothing written. Re-run with --commit to apply.\n');
        return;
    }
    for (const p of plans.filter(p => p.touched)) {
        await q(`UPDATE data_manager.sources SET auth_permissions = $1::jsonb WHERE source_id = $2`,
            [JSON.stringify(p.ap), p.source_id]);
    }
    console.log(`\nCOMMIT done — updated ${changed} source(s).\n`);
}

main().then(() => process.exit(0)).catch(e => { console.error('ERROR:', e.message); process.exit(1); });
