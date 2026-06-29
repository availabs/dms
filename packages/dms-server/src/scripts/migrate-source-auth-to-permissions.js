#!/usr/bin/env node
/**
 * Migrate legacy numeric `statistics.auth` → new string `authPermissions` for DAMA sources.
 *
 * Part of the datasets-permissions-model task. Translates each source's per-user/per-group numeric
 * access level (`statistics.auth = { users:{id:lvl}, groups:{name:lvl} }`, scale
 * VIEW1/DOWNLOAD2/EDIT3/ADMIN5/SUPER10) into the new string-permission model
 * (`data_manager.sources."authPermissions" = { users:{id:[perm…]}, groups:{name:[perm…]} }`).
 *
 *   node src/scripts/migrate-source-auth-to-permissions.js [pgEnv=npmrds2]            # DRY RUN
 *   node src/scripts/migrate-source-auth-to-permissions.js [pgEnv=npmrds2] --commit   # writes
 *
 * Reusable across pgEnvs — pass any DAMA pgEnv that has a `<pgEnv>.config.json`.
 *
 * Decisions (planning/tasks/current/datasets-permissions-model.md):
 *  - cumulative level → perms (below).
 *  - group case normalized: `Public` → `public` (union on collision).
 *  - the anonymous `public` group is CAPPED at `download-source` (a public `*`/admin expands to
 *    view+download, never edit/delete).
 *  - sources with NO public grant get `public: []` so the pattern's `public:[view-source]` baseline
 *    can't make a previously-private source public.
 *
 * Idempotent: source of truth is `statistics.auth` (left intact for the server cutover); re-running
 * recomputes the same `authPermissions`. Dry run writes NOTHING.
 */
const { getDb, awaitReady } = require('../db');

const PG_ENV = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'npmrds2';
const COMMIT = process.argv.includes('--commit');

const LEVELS = [
    { lvl: 1,  add: ['view-source'] },
    { lvl: 2,  add: ['download-source'] },
    { lvl: 3,  add: ['update-source', 'create-view', 'manage-downloads'] },
    { lvl: 5,  add: ['delete-source', 'view-source-api'] },
    { lvl: 10, add: ['*'] },
];
const PUBLIC_CAP = new Set(['view-source', 'download-source']); // public may never exceed this

function permsForLevel(level) {
    const n = parseInt(level, 10);
    if (!Number.isFinite(n)) return { perms: [], bad: true };
    if (n >= 10) return { perms: ['*'] };
    const perms = [];
    for (const { lvl, add } of LEVELS) if (lvl !== 10 && n >= lvl) perms.push(...add);
    return { perms };
}
const isPublic = (name) => String(name).toLowerCase() === 'public';

function migrateAuth(auth) {
    const out = { groups: {}, users: {} };
    const notes = { cappedPublic: false, revokedPublic: false, badLevels: [] };
    const addGrant = (bucket, key, level) => {
        const { perms, bad } = permsForLevel(level);
        if (bad) { notes.badLevels.push(`${bucket}:${key}=${level}`); return; }
        let finalPerms = perms;
        let finalKey = key;
        if (bucket === 'groups' && isPublic(key)) {
            finalKey = 'public';
            const effective = perms.includes('*') ? [...PUBLIC_CAP] : perms;
            const capped = effective.filter(p => PUBLIC_CAP.has(p));
            if (perms.includes('*') || capped.length !== perms.length) notes.cappedPublic = true;
            finalPerms = capped;
        }
        const prev = out[bucket][finalKey] || [];
        out[bucket][finalKey] = [...new Set([...prev, ...finalPerms])];
    };
    for (const [k, v] of Object.entries(auth?.users || {})) addGrant('users', k, v);
    for (const [k, v] of Object.entries(auth?.groups || {})) addGrant('groups', k, v);

    // preserve old privacy: no public grant → explicit revoke so the pattern baseline can't expose it
    const hadPublic = Object.keys(auth?.groups || {}).some(k => isPublic(k));
    if (!hadPublic) { out.groups.public = []; notes.revokedPublic = true; }
    return { authPermissions: out, notes };
}

async function main() {
    const db = getDb(PG_ENV);
    await awaitReady(PG_ENV);
    const q = (sql, params) => db.query(sql, params).then(r => r.rows);

    console.log(`\n=== migrate source auth → authPermissions · pgEnv=${PG_ENV} · ${COMMIT ? 'COMMIT (writes)' : 'DRY RUN (no writes)'} ===\n`);

    const rows = await q(`
        SELECT source_id, name, statistics->'auth' AS auth
        FROM data_manager.sources
        WHERE statistics ? 'auth' AND coalesce(statistics->'auth','{}'::jsonb) <> '{}'::jsonb
        ORDER BY source_id
    `);
    console.log(`sources with legacy auth: ${rows.length}`);

    const capped = [], revoked = [], bad = [];
    const plans = rows.map(r => {
        const { authPermissions, notes } = migrateAuth(r.auth);
        if (notes.cappedPublic) capped.push(r.source_id);
        if (notes.revokedPublic) revoked.push(r.source_id);
        if (notes.badLevels.length) bad.push({ source_id: r.source_id, badLevels: notes.badLevels });
        return { source_id: r.source_id, name: r.name, authPermissions };
    });

    console.log('\n-- sample (first 8) --');
    plans.slice(0, 8).forEach(p =>
        console.log(`#${p.source_id} ${String(p.name).slice(0, 38).padEnd(38)} → ${JSON.stringify(p.authPermissions)}`));
    console.log(`\npublic capped on ${capped.length} source(s): ${capped.join(', ') || '(none)'}`);
    console.log(`public revoked (kept private — no old public grant) on ${revoked.length} source(s)`);
    if (bad.length) console.log('non-numeric levels (skipped grants):', JSON.stringify(bad));

    if (!COMMIT) {
        console.log('\nDRY RUN — nothing written. Re-run with --commit to apply.\n');
        return;
    }

    // column names must be snake_case — drop any earlier mis-named camelCase column, then add the
    // canonical snake_case one. (DROP is safe: auth_permissions is repopulated from statistics.auth.)
    await q(`ALTER TABLE data_manager.sources DROP COLUMN IF EXISTS "authPermissions"`);
    await q(`ALTER TABLE data_manager.sources ADD COLUMN IF NOT EXISTS auth_permissions jsonb DEFAULT '{}'::jsonb`);
    let n = 0;
    for (const p of plans) {
        await q(`UPDATE data_manager.sources SET auth_permissions = $1::jsonb WHERE source_id = $2`,
            [JSON.stringify(p.authPermissions), p.source_id]);
        n++;
    }
    console.log(`\nCOMMIT done — wrote auth_permissions on ${n} source(s). statistics.auth left intact.\n`);
}

main().then(() => process.exit(0)).catch(e => { console.error('MIGRATION ERROR:', e.message); process.exit(1); });
