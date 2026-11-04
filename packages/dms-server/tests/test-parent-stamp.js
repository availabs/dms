/**
 * `parent_id` stamped from the PARENT's own write — routes/dms/parentId.js `stampChildren`,
 * wired into createData, setDataById and /sync/push.
 *
 * Task: planning/tasks/current/row-auth-parentage.md, "Remaining" 1 and 2.
 *
 * The child-side claim (test-parent-id.js) can only fire when the parent already exists. Two cases
 * it cannot reach, and this covers:
 *
 *   1. ORDER. A page created with its sections in one call writes the children FIRST, so their
 *      ids can go into the page's array — there is no page id to claim yet.
 *   2. MOVE. A section that is only re-arranged is not `_dirty`, so it is never re-sent and never
 *      renews its claim. The page that now lists it is being saved, though.
 *
 * Goes through the real Falcor routes on a disposable per-app sqlite table, because the bug being
 * guarded is in the wiring, not in the pure rule.
 *
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-parent-stamp.js
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
process.env.DMS_DB_ENV = DMS_DB;
const assert = require('assert');
const { createTestGraph } = require('./graph');
const { resolveTable } = require('../src/db/table-resolver');

let pass = 0, fail = 0;
const t = async (name, fn) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n')}`); }
};
const section = (name) => console.log(`\n${name}`);

const CHILD_REFS = { page: { sections: 'component', draft_sections: 'component' } };

async function run() {
    const { getDb, awaitReady } = require('../src/db');
    const db = getDb(DMS_DB); await awaitReady();

    const APP = `parentstamp_${Date.now()}`;
    const admin = { authed: true, id: 1, email: 'a@x', groups: [`${APP} Admin`] };
    const graph = createTestGraph(DMS_DB, { user: admin });
    process.env.DMS_AUTH_MODE = 'legacy';

    const create = async (type, data) => {
        const res = await graph.callAsync(['dms', 'data', 'create'], [APP, type, data]);
        return String(Object.keys(res.jsonGraph.dms.data.byId)[0]);
    };
    const edit = (id, data, type) => graph.callAsync(['dms', 'data', 'edit'], [APP, id, data, type]);

    // The site row also creates the app's table, so the columns can be added before anything that
    // reads them. `parent_id` is not in create_dms.sql — it arrives via migrate-row-auth.js
    // --add-columns, which is what this reproduces.
    await create('prod:site', { name: 'prod' });
    const T = resolveTable(APP, '', 'sqlite', 'per-app');
    for (const col of ['auth TEXT', 'parent_id BIGINT']) {
        try { await db.promise(`ALTER TABLE ${T.fullName} ADD COLUMN ${col}`); }
        catch (e) { if (!/duplicate column/i.test(e.message)) console.log('[alter]', e.message); }
    }
    require('../src/routes/auth/rowAuth/rowAuthCaps')._resetCaps();

    const parentOf = async (id) =>
        String((await db.promise(`SELECT parent_id FROM ${T.fullName} WHERE id = $1`, [id]))[0]?.parent_id ?? '');

    // The declaration the server reads — on the pattern row, because dms-server cannot read formats.
    await create('prod|widgets:pattern', { pattern_type: 'page', childRefs: CHILD_REFS });
    await create('prod|other:pattern',   { pattern_type: 'page', childRefs: CHILD_REFS });

    const ref = (id) => ({ id, ref: `${APP}+widgets|component` });

    section('1. ORDER — a page created with its sections in one call');
    const c1 = await create('widgets|component', { title: 'one' });
    const c2 = await create('widgets|component', { title: 'two' });
    const c3 = await create('widgets|component', { title: 'three' });
    const foreign = await create('other|component', { title: 'not yours' });
    await t('children written before the page have no parent yet', async () => {
        assert.strictEqual(await parentOf(c1), '', 'nothing to claim — this is the gap');
    });

    const pageA = await create('widgets|page', {
        title: 'A', sections: [ref(c1), ref(c2), ref(c3)],
    });
    await t('the create stamps every section it names', async () => {
        for (const c of [c1, c2, c3]) assert.strictEqual(await parentOf(c), pageA, `component ${c}`);
    });

    section('2. The predicate is the container rule, computed');
    const pageX = await create('widgets|page', {
        title: 'X', sections: [ref(foreign), { id: '999999999', ref: `${APP}+widgets|component` }],
    });
    await t('a component in ANOTHER pattern is not captured', async () =>
        assert.strictEqual(await parentOf(foreign), '', 'cross-pattern capture is the escalation this stops'));
    await t('an id with no row is ignored, and the page still writes', async () =>
        assert.ok(pageX, 'no error'));

    section('3. MOVE — a section that is not _dirty still follows its page');
    const pageB = await create('widgets|page', { title: 'B', sections: [] });
    await edit(pageB, { sections: [ref(c1)] }, 'widgets|page');
    await t('the receiving page claims it on ITS save', async () =>
        assert.strictEqual(await parentOf(c1), pageB));
    await t('the sections left behind are untouched', async () => {
        assert.strictEqual(await parentOf(c2), pageA);
        assert.strictEqual(await parentOf(c3), pageA);
    });

    section('4. Only a write that NAMES children does any work');
    await edit(pageA, { title: 'A renamed' }, 'widgets|page');
    await t('a title-only edit does not re-stamp — c1 stays with B', async () =>
        assert.strictEqual(await parentOf(c1), pageB,
            'setDataById merges, so stamping from the merged row would drag c1 back to A'));

    section('5. Removal is NOT a clear — that is the reconciler\'s job');
    await edit(pageA, { sections: [ref(c2)] }, 'widgets|page');
    await t('a section dropped from the array keeps its parent', async () =>
        assert.strictEqual(await parentOf(c3), pageA,
            'clearing would need the previous array, and a momentary omission would orphan it'));

    section('6. A pattern that declares nothing stamps nothing');
    await create('prod|plain:pattern', { pattern_type: 'page' });
    const p1 = await create('plain|component', { title: 'p' });
    await create('plain|page', { title: 'P', sections: [{ id: p1, ref: `${APP}+plain|component` }] });
    await t('no declaration, no stamp — the structural rule alone never guesses', async () =>
        assert.strictEqual(await parentOf(p1), ''));

    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
