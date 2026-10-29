/**
 * Row auth on the READ path (routes/dms/dms.route.js `dataByIdResponse`).
 *
 * `judge()` is write-only and the read gate knows two kinds, so site, theme, tenant, dmsenv, source,
 * view, component, page-edit and split `:data` rows were readable by anyone. This covers the added
 * branch that closes them — and that `pattern` and `page` keep their existing behaviour, including
 * the exemption that keeps auth and admin pattern rows publicly readable.
 *
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-row-auth-reads.js
 * Never without DMS_TEST_DB: the default DMS config is not a test database.
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
process.env.DMS_DB_ENV = DMS_DB;
const assert = require('assert');
const { createTestGraph } = require('./graph');

let pass = 0, fail = 0;
const t = async (name, fn) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n')}`); }
};

/** Run fn under a DMS_ROW_AUTH_MODE, collecting `[row-auth] would-deny` lines. */
async function withMode(mode, fn) {
    const prev = process.env.DMS_ROW_AUTH_MODE;
    const warn = console.warn; const lines = [];
    process.env.DMS_ROW_AUTH_MODE = mode;
    console.warn = (...a) => { const s = a.join(' '); if (s.includes('[row-auth]')) lines.push(s); else warn(...a); };
    try { return await fn(lines); }
    finally { console.warn = warn; if (prev === undefined) delete process.env.DMS_ROW_AUTH_MODE; else process.env.DMS_ROW_AUTH_MODE = prev; }
}

async function run() {
    const { getDb, awaitReady } = require('../src/db');
    getDb(DMS_DB); await awaitReady();

    const APP = `rowauthread_${Date.now()}`;
    const graphs = {};
    const as = (user) => graphs[user ? user.id : 'anon'] || (graphs[user ? user.id : 'anon'] = createTestGraph(DMS_DB, { user }));
    const call = (user, path, args) => as(user).callAsync(path, args);
    const admin = { authed: true, id: 1, email: 'a@x', groups: [`${APP} Admin`] };
    const stranger = { authed: true, id: 10, email: 's@x', groups: [] };

    const insert = (type, data) => withMode('legacy', async () => {
        const res = await call(admin, ['dms', 'data', 'create'], [APP, type, data]);
        return +Object.keys(res.jsonGraph.dms.data.byId)[0];
    });
    // Read one row's `data` back as `user`. The harness answers with `jsonGraph`, and real data
    // arrives boxed as `{ $type: 'atom', value }` — a refusal is the bare string `no-access`.
    const readData = async (user, id) => {
        const res = await as(user).getAsync([['dms', 'data', APP, 'byId', String(id), ['data', 'type']]]);
        return res?.jsonGraph?.dms?.data?.[APP]?.byId?.[String(id)]?.data;
    };
    const refused = (d) => d === 'no-access';

    // ---- fixtures: a site, a locked-down pattern, and rows of kinds nothing used to gate
    await insert('site:site', { site_name: 'Site', patterns: [] });
    const adminPatternId = await insert('site|admin:pattern', { pattern_type: 'admin', name: 'admin' });
    const authPatternId = await insert('site|auth:pattern', { pattern_type: 'auth', name: 'auth' });
    const themeId = await insert('site|theme', { name: 'a theme', authPermissions: { groups: { Themers: ['manage-themes'] } } });
    const openThemeId = await insert('site|theme', { name: 'an unconfigured theme' });

    console.log('\nkinds the read gate never covered');
    await t('a theme with grants is refused under enforce', () => withMode('enforce', async () => {
        assert.ok(refused(await readData(stranger, themeId)), 'expected the no-access sentinel');
    }));
    await t('…and allowed for the app admin', () => withMode('enforce', async () => {
        const d = await readData(admin, themeId);
        assert.ok(!refused(d) && d && d.value && d.value.name === 'a theme', 'admin gets the real row');
    }));
    await t('an UNCONFIGURED theme stays readable (rule 5)', () => withMode('enforce', async () => {
        const d = await readData(stranger, openThemeId);
        assert.ok(!refused(d) && d && d.value, 'a blank chain must stay readable or every unconfigured app breaks');
    }));

    console.log('\nrollout modes');
    await t('legacy leaves it open', () => withMode('legacy', async (lines) => {
        assert.ok(!refused(await readData(stranger, themeId)));
        assert.strictEqual(lines.length, 0);
    }));
    await t('log allows and writes a would-deny line', () => withMode('log', async (lines) => {
        assert.ok(!refused(await readData(stranger, themeId)), 'log must not block');
        assert.ok(lines.some(l => l.includes('would-deny read')), `expected a would-deny, got ${lines.length} lines`);
    }));

    console.log('\nexisting behaviour is untouched');
    await t('an auth pattern stays publicly readable under enforce', () => withMode('enforce', async () => {
        const d = await readData(stranger, authPatternId);
        assert.ok(!refused(d), 'the auth pattern exemption must survive — the login page depends on it');
    }));
    await t('an admin pattern stays publicly readable under enforce', () => withMode('enforce', async () => {
        assert.ok(!refused(await readData(stranger, adminPatternId)));
    }));

    console.log('\nduplicate pattern names');
    await t('a second pattern with the same type is refused under enforce', () => withMode('enforce', async () => {
        let threw = null;
        try { await call(admin, ['dms', 'data', 'create'], [APP, 'site|dupe:pattern', { name: 'one' }]); }
        catch (e) { threw = e; }
        assert.strictEqual(threw, null, 'the first one must succeed');
        try { await call(admin, ['dms', 'data', 'create'], [APP, 'site|dupe:pattern', { name: 'two' }]); }
        catch (e) { threw = e; }
        assert.ok(threw && /already exists/.test(threw.message || JSON.stringify(threw)),
            `expected a refusal, got ${threw && threw.message}`);
    }));
    await t('log warns instead of refusing', () => withMode('log', async (lines) => {
        await call(admin, ['dms', 'data', 'create'], [APP, 'site|dupe2:pattern', { name: 'one' }]);
        await call(admin, ['dms', 'data', 'create'], [APP, 'site|dupe2:pattern', { name: 'two' }]);
        assert.ok(lines.some(l => l.includes('would-deny create') && l.includes('dupe2')),
            'expected a would-deny line');
    }));
    await t('a DIFFERENT pattern name is fine', () => withMode('enforce', async () => {
        await call(admin, ['dms', 'data', 'create'], [APP, 'site|unique_one:pattern', { name: 'a' }]);
        await call(admin, ['dms', 'data', 'create'], [APP, 'site|unique_two:pattern', { name: 'b' }]);
    }));

    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
