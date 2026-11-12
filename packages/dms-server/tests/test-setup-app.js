/**
 * `scripts/setup-app.js` — the `parent_id` and `auth` columns are moved into `data` and dropped,
 * stored `data.parent_id` values are held to the create-time check, and the uniqueness guard is
 * opt-in and never added over duplicates.
 *
 * Task: planning/tasks/current/new-app-auth-setup-and-db-constraints.md (A1, A1b, A2).
 *
 * On a disposable per-app table made the way an app migrated by `migrate-row-auth.js` looks:
 * created by the controller, then given the two columns and values in them by direct SQL.
 *
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-setup-app.js
 *      node tests/postgres-docker.js run tests/test-setup-app.js      (the Postgres statements)
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
process.env.DMS_DB_ENV = DMS_DB;
const assert = require('assert');
const { resolveTable } = require('../src/db/table-resolver');
const { setupApp, planAuthMove } = require('../src/scripts/setup-app');

let pass = 0, fail = 0;
const t = async (name, fn) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n')}`); }
};
const section = (name) => console.log(`\n${name}`);
const VOCAB = { self: [{ value: 'tune', implies: ['read'] }] };
const quiet = () => {};

async function run() {
    section('planAuthMove — what one auth column value changes in data');
    await t('grants move only where data names no one', () => {
        const g = { groups: { Staff: ['*'] }, users: {} };
        assert.deepStrictEqual(planAuthMove({ type: 's:site', auth: g, data: {} }).patch, { authPermissions: g });
        assert.deepStrictEqual(planAuthMove({ type: 's:site', auth: JSON.stringify(g), data: '{"site_name":"x"}' }).patch, { authPermissions: g });
    });
    await t('a source keeps its grants under auth_permissions', () => {
        const g = { groups: { Staff: ['*'] } };
        assert.deepStrictEqual(planAuthMove({ type: 'e|s:source', auth: g, data: {} }).patch, { auth_permissions: g });
    });
    await t('data that already names someone wins: the column was dead, and is reported', () => {
        const p = planAuthMove({ type: 's|p:pattern', auth: { groups: { A: ['x'] } }, data: { authPermissions: { groups: { B: ['y'] }, users: {} } } });
        assert.strictEqual(p.patch, null);
        assert.strictEqual(p.dead, true);
    });
    await t('…and identical grants are neither moved nor reported', () => {
        const g = { groups: { A: ['x'] }, users: {} };
        const p = planAuthMove({ type: 's|p:pattern', auth: g, data: { authPermissions: { users: {}, groups: { A: ['x'] } } } });
        assert.deepStrictEqual([p.patch, p.dead], [null, false]);
    });
    await t('data grants stored as a JSON string or per subdomain also count as naming someone', () => {
        const col = { groups: { A: ['x'] } };
        assert.strictEqual(planAuthMove({ type: 's|p:pattern', auth: col, data: { authPermissions: '{"groups":{"B":["y"]}}' } }).patch, null);
        assert.strictEqual(planAuthMove({ type: 's|p:pattern', auth: col, data: { authPermissions: { '*': { groups: {} } } } }).patch, null);
    });
    await t('`view` goes into the grants, beside what is there', () => {
        const p = planAuthMove({ type: 'e|s:source', auth: { view: false }, data: { auth_permissions: { users: { 1: ['*'] }, groups: {} } } });
        assert.deepStrictEqual(p.patch, { auth_permissions: { users: { 1: ['*'] }, groups: {}, view: false } });
        assert.deepStrictEqual(planAuthMove({ type: 'e|s:source', auth: { view: false }, data: {} }).patch, { auth_permissions: { view: false } });
    });
    await t('`view` over a shape that cannot be merged by rule blocks, and writes nothing for it', () => {
        const p = planAuthMove({ type: 'e|s:source', auth: { view: false }, data: { auth_permissions: '{"users":{"1":["*"]}}' } });
        assert.strictEqual(p.patch, null);
        assert.ok(/view/.test(p.blocked));
    });
    await t('the declarations move to the stamp keys, the column\'s value winning', () => {
        const p = planAuthMove({ type: 's|p:pattern', auth: { vocabulary: VOCAB, childRefs: { page: { sections: 'component' } } },
            data: { authVocabulary: { self: [] } } });
        assert.deepStrictEqual(p.patch, { authVocabulary: VOCAB, childRefs: { page: { sections: 'component' } } });
    });
    await t('nothing in the column, nothing to do', () => {
        assert.deepStrictEqual(planAuthMove({ type: 'x|page', auth: null, data: {} }), { patch: null, dead: false, blocked: null });
        assert.deepStrictEqual(planAuthMove({ type: 'x|page', auth: '{}', data: {} }), { patch: null, dead: false, blocked: null });
    });

    section('an app migrated by the old script: columns moved, verified, dropped');
    const { getDb, awaitReady } = require('../src/db');
    const db = getDb(DMS_DB); await awaitReady();
    const APP = `setupapp_${Date.now()}`;
    const ctl = require('../src/routes/dms/dms.controller').createController(DMS_DB);
    const ins = async (type, data) => String((await ctl.createData([APP, type, data], null))[0].id);
    const pg = db.type === 'postgres';
    const T = resolveTable(APP, '', db.type, 'per-app');
    const colsOfTable = async (tbl) => (pg
        ? await db.promise(`SELECT column_name AS name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`, [tbl.schema, tbl.table])
        : await db.promise(`SELECT name FROM pragma_table_info($1)`, [tbl.table])).map(r => r.name);
    const hasIndex = async (name) => (pg
        ? await db.promise(`SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = $2`, [T.schema, name])
        : await db.promise(`SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = $1`, [name])).length > 0;
    const AUTH_COL = pg ? 'auth jsonb' : 'auth TEXT';
    const dataOf = async (id) => { const d = (await db.promise(`SELECT data FROM ${T.fullName} WHERE id = $1`, [id]))[0].data; return typeof d === 'string' ? JSON.parse(d) : d; };
    const colsOf = () => colsOfTable(T);
    const run1 = (over = {}) => setupApp(db, { app: APP, splitMode: 'per-app', log: quiet, ...over });

    const site = await ins('prod:site', { site_name: 'prod' });
    const docs = await ins('prod|docs:pattern', { pattern_type: 'page', authPermissions: { groups: { Editors: ['edit-page'] }, users: {} } });
    const other = await ins('prod|other:pattern', { pattern_type: 'page' });
    const src = await ins('env|roads:source', { name: 'roads', auth_permissions: { users: { 1: ['*'] }, groups: {} } });
    const page = await ins('docs|page', { title: 'P' });
    const otherPage = await ins('other|page', { title: 'Q' });
    const moved = await ins('docs|component', { title: 'column only' });
    const stale = await ins('docs|component', { title: 'data says something else' });
    const good = await ins('docs|component', { title: 'already right', parent_id: page });
    const foreign = await ins('docs|component', { title: 'points into another pattern' });
    const ghost = await ins('docs|component', { title: 'points at nothing' });

    // the old shape: both columns, the index, and values the server wrote into them
    await db.promise(`ALTER TABLE ${T.fullName} ADD COLUMN ${AUTH_COL}`);
    await db.promise(`ALTER TABLE ${T.fullName} ADD COLUMN parent_id BIGINT`);
    await db.promise(`CREATE INDEX "${T.table}_parent_id_idx" ON ${T.fullName}(parent_id)`);
    const setCol = (id, col, v) => db.promise(`UPDATE ${T.fullName} SET ${col} = $1 WHERE id = $2`, [v, id]);
    const setKey = (id, v) => db.promise(pg
        ? `UPDATE ${T.fullName} SET data = jsonb_set(data, '{parent_id}', to_jsonb($1::bigint)) WHERE id = $2`
        : `UPDATE ${T.fullName} SET data = json_set(data, '$.parent_id', CAST($1 AS INTEGER)) WHERE id = $2`, [v, id]);
    await setCol(moved, 'parent_id', page);
    await setCol(stale, 'parent_id', page); await setKey(stale, +otherPage);       // an unchecked echo from an old edit
    await setCol(good, 'parent_id', page);
    await setKey(foreign, +otherPage);                                             // no column: only the unchecked key
    await setKey(ghost, 999999999);
    await setCol(site, 'auth', JSON.stringify({ groups: { [`${APP} Admin`]: ['*'] }, users: {}, vocabulary: VOCAB }));
    await setCol(docs, 'auth', JSON.stringify({ groups: { Nobody: ['*'] }, users: {} }));      // data names Editors: dead
    await setCol(src, 'auth', JSON.stringify({ view: false }));

    const dry = await run1();
    await t('a dry run reports and writes nothing', async () => {
        assert.deepStrictEqual(dry.columns, { parent_id: true, auth: true });
        assert.strictEqual(dry.parentIdMoved, 2, 'the row that lacks it and the row that disagrees');
        assert.strictEqual(dry.authMoved, 2, 'the site row and the source');
        assert.strictEqual(dry.authDead, 1);
        assert.deepStrictEqual(dry.dropped, []);
        assert.ok((await colsOf()).includes('auth') && (await colsOf()).includes('parent_id'));
        assert.strictEqual((await dataOf(moved)).parent_id, undefined);
        assert.strictEqual((await dataOf(site)).authPermissions, undefined);
        assert.strictEqual((await dataOf(ghost)).parent_id, 999999999);
    });
    await t('…and names the stored parents that fail the check', async () => {
        const bad = Object.fromEntries(dry.invalidParents.map(r => [r.id, r.why]));
        // `stale` is judged on what the column will make it, not on the echo it carries today
        assert.ok(/outside its container/.test(bad[foreign]), bad[foreign]);
        assert.strictEqual(bad[ghost], 'names no row');
        assert.strictEqual(bad[good], undefined);
        assert.strictEqual(bad[stale], undefined);
        assert.strictEqual(bad[moved], undefined);
    });

    const applied = await run1({ apply: true });
    await t('apply moves parentage into data — the column winning over an unchecked echo', async () => {
        assert.strictEqual((await dataOf(moved)).parent_id, +page);
        assert.strictEqual((await dataOf(stale)).parent_id, +page);
        assert.strictEqual((await dataOf(good)).parent_id, +page);
    });
    await t('…the grants the server read from the column, and the declarations', async () => {
        const s = await dataOf(site);
        assert.deepStrictEqual(s.authPermissions, { groups: { [`${APP} Admin`]: ['*'] }, users: {} });
        assert.deepStrictEqual(s.authVocabulary, VOCAB);
        assert.strictEqual(s.site_name, 'prod', 'the rest of the row is untouched');
    });
    await t('…`view` into the source\'s grants', async () =>
        assert.deepStrictEqual((await dataOf(src)).auth_permissions, { users: { 1: ['*'] }, groups: {}, view: false }));
    await t('…and leaves alone the row whose column grants were never read', async () =>
        assert.deepStrictEqual((await dataOf(docs)).authPermissions, { groups: { Editors: ['edit-page'] }, users: {} }));
    await t('both columns and the index are gone', async () => {
        assert.deepStrictEqual(applied.dropped, ['parent_id', 'auth']);
        const cols = await colsOf();
        assert.ok(!cols.includes('auth') && !cols.includes('parent_id'), cols.join(','));
        assert.strictEqual(await hasIndex(`${T.table}_parent_id_idx`), false);
    });
    await t('stored parents that fail the check are removed; the valid ones stay', async () => {
        assert.strictEqual((await dataOf(foreign)).parent_id, undefined);
        assert.strictEqual((await dataOf(ghost)).parent_id, undefined);
        assert.strictEqual((await dataOf(foreign)).title, 'points into another pattern');
        assert.strictEqual((await dataOf(good)).parent_id, +page);
    });
    await t('the server keeps writing to the table it left', async () => {
        const c = await ins('docs|component', { title: 'after', parent_id: page });
        assert.strictEqual((await dataOf(c)).parent_id, +page);
    });
    const again = await run1({ apply: true });
    await t('a second run has nothing to do', async () => {
        assert.deepStrictEqual(again.columns, { parent_id: false, auth: false });
        assert.deepStrictEqual([again.parentIdMoved, again.authMoved, again.invalidParents.length, again.dropped.length], [0, 0, 0, 0]);
    });

    section('a row that cannot be moved by rule keeps the auth column');
    {
        const APP2 = `setupapp_blocked_${Date.now()}`;
        const T2 = resolveTable(APP2, '', db.type, 'per-app');
        const s2 = String((await ctl.createData([APP2, 'env|dams:source', { name: 'dams' }], null))[0].id);
        await db.promise(`ALTER TABLE ${T2.fullName} ADD COLUMN ${AUTH_COL}`);
        // grants stored as a JSON STRING, the shape old client code wrote
        await db.promise(pg
            ? `UPDATE ${T2.fullName} SET auth = $1::jsonb, data = jsonb_set(data, '{auth_permissions}', to_jsonb($2::text)) WHERE id = $3`
            : `UPDATE ${T2.fullName} SET auth = $1, data = json_set(data, '$.auth_permissions', $2) WHERE id = $3`,
            [JSON.stringify({ view: false }), '{"users":{"1":["*"]}}', s2]);
        const r = await setupApp(db, { app: APP2, splitMode: 'per-app', apply: true, log: quiet });
        await t('it is listed, and the column stays', async () => {
            assert.deepStrictEqual(r.authBlocked.map(b => b.id), [s2]);
            assert.deepStrictEqual(r.dropped, []);
            assert.ok((await colsOfTable(T2)).includes('auth'));
        });
    }

    section('the uniqueness guard is opt-in, and never added over duplicates');
    await t('without the flag nothing is added', async () => assert.strictEqual(again.guard.pattern, 'clean, no guard'));
    await db.promise(`INSERT INTO ${T.fullName}(id, app, type, data) VALUES ($1, $2, $3, '{}')`, [+ghost + 100000, APP, 'env|roads:source']);
    const guarded = await run1({ apply: true, guard: 'all' });
    await t('a kind with duplicates is listed and left unguarded; the clean kinds are guarded', async () => {
        assert.ok(/1 duplicate type\(s\) — guard NOT added/.test(guarded.guard.source), guarded.guard.source);
        assert.strictEqual(guarded.guard.pattern, 'guard added');
        assert.strictEqual(guarded.guard.site, 'guard added');
    });
    await t('the database then refuses a second pattern of the same type', async () => {
        await assert.rejects(db.promise(`INSERT INTO ${T.fullName}(id, app, type, data) VALUES ($1, $2, $3, '{}')`, [+ghost + 100001, APP, 'prod|docs:pattern']), /UNIQUE|unique|duplicate key/);
    });
    await t('…and says so on the next run', async () => assert.strictEqual((await run1()).guard.pattern, 'guarded'));

    section('an app with no table');
    await t('nothing to set up, nothing created', async () => {
        const r = await setupApp(db, { app: `setupapp_none_${Date.now()}`, splitMode: 'per-app', apply: true, log: quiet });
        assert.deepStrictEqual(r.dropped, []);
    });

    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
