/**
 * Pattern duplicate copies each section once per page that lists it (dama/upload/dms-duplicate.js).
 *
 * Until 2026-11-17 it copied each section id once, so two pages sharing a row in the source shared
 * its copy in the duplicate (every county pattern copied from the County Template has the same 6
 * draft sections shared between Lightning, Wind and Tornado), and a page listing another pattern's
 * section kept the reference, so the copy and the source shared that row. Task:
 * planning/tasks/current/pattern-duplicate-shares-sections.md.
 *
 * Runs the real duplicate on a disposable app.
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-pattern-duplicate.js
 *      (Postgres: node tests/postgres-docker.js run tests/test-pattern-duplicate.js)
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
process.env.DMS_DB_ENV = DMS_DB;
process.env.DMS_AUTH_MODE = 'legacy';
const assert = require('assert');
const { createController } = require('../src/routes/dms/dms.controller');
const { duplicatePatternContent } = require('../src/dama/upload/dms-duplicate');
const { resolveTable } = require('../src/db/table-resolver');

let pass = 0, fail = 0;
const t = async (name, fn) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n')}`); }
};

const CHILD_REFS = { page: { sections: 'component', draft_sections: 'component' } };
const asObj = (d) => (typeof d === 'string' ? JSON.parse(d) : (d || {}));

async function run() {
    const { getDb, awaitReady } = require('../src/db');
    const db = getDb(DMS_DB); await awaitReady();
    const controller = createController(DMS_DB);
    const APP = `patterndup_${Date.now()}`;
    const user = { id: 1, email: 'a@x' };
    const create = async (type, data) => String((await controller.createData([APP, type, data], user))[0].id);
    const ref = (inst, id) => ({ id, ref: `${APP}+${inst}|component` });

    await create('prod:site', { name: 'prod' });
    await create('prod|src:pattern', { pattern_type: 'page', childRefs: CHILD_REFS });
    await create('prod|other:pattern', { pattern_type: 'page', childRefs: CHILD_REFS });
    // the duplicate's pattern row, so the stamp knows its childRefs (the client creates it after the copy)
    await create('prod|dup:pattern', { pattern_type: 'page', childRefs: CHILD_REFS });

    const shared = await create('src|component', { title: 'shared by Lightning and Wind' });
    const both = await create('src|component', { title: 'in one page\'s two lists' });
    const dead = await create('src|component', { title: 'listed by no page' });
    const foreign = await create('other|component', { title: 'a section of another pattern' });
    const lightning = await create('src|page', { title: 'Lightning', draft_sections: [ref('src', shared)] });
    const wind = await create('src|page', { title: 'Wind', draft_sections: [ref('src', shared)] });
    const solo = await create('src|page', { title: 'Solo', sections: [ref('src', both)], draft_sections: [ref('src', both)] });
    const borrower = await create('src|page', {
        title: 'Borrower', draft_sections: [ref('other', foreign), { id: '999999999', ref: `${APP}+src|component` }],
    });

    const res = await duplicatePatternContent(controller, { app: APP, oldInstance: 'src', newInstance: 'dup', newApp: APP, userId: 1 }, { log: () => {} });

    const T = resolveTable(APP, '', db.type, 'per-app');
    const rows = await db.promise(`SELECT id, type, data FROM ${T.fullName} WHERE app = $1`, [APP]);
    const byId = new Map(rows.map(r => [String(r.id), { ...r, data: asObj(r.data) }]));
    const dupPages = rows.filter(r => r.type === 'dup|page').map(r => ({ ...asObj(r.data), id: String(r.id) }));  // data carries a numeric id mirror
    const page = (title) => dupPages.find(p => p.title === title);
    const ids = (list) => (list || []).map(e => String(e.id));

    await t('every source page has a copy', async () => assert.strictEqual(dupPages.length, 4));

    await t('no section is listed by two pages of the duplicate', async () => {
        const owners = new Map();
        for (const p of dupPages) for (const id of new Set([...ids(p.sections), ...ids(p.draft_sections)])) {
            owners.set(id, (owners.get(id) || 0) + 1);
        }
        assert.deepStrictEqual([...owners].filter(([, n]) => n > 1), []);
    });

    await t('Lightning and Wind each get their own copy of the section they shared', async () => {
        const [l] = ids(page('Lightning').draft_sections), [w] = ids(page('Wind').draft_sections);
        assert.notStrictEqual(l, w);
        for (const id of [l, w]) {
            assert.strictEqual(byId.get(id).type, 'dup|component');
            assert.strictEqual(byId.get(id).data.title, 'shared by Lightning and Wind');
            assert.notStrictEqual(id, shared);
        }
    });

    await t('one page listing a row in both its lists keeps one copy for both', async () => {
        const p = page('Solo');
        assert.deepStrictEqual(ids(p.sections), ids(p.draft_sections));
        assert.notStrictEqual(ids(p.sections)[0], both);
    });

    await t('another pattern\'s section is copied into the new pattern, with a matching ref', async () => {
        const [e, ghost] = page('Borrower').draft_sections;
        assert.notStrictEqual(String(e.id), foreign);
        assert.strictEqual(byId.get(String(e.id)).type, 'dup|component');
        assert.strictEqual(byId.get(String(e.id)).data.title, 'a section of another pattern');
        assert.strictEqual(e.ref, `${APP}+dup|component`);
        assert.deepStrictEqual(ghost, { id: '999999999', ref: `${APP}+src|component` }, 'an entry naming no row is left as it was');
    });

    await t('each copy belongs to the page that lists it', async () => {
        for (const p of dupPages) for (const id of new Set([...ids(p.sections), ...ids(p.draft_sections)])) {
            if (!byId.has(id)) continue;
            assert.strictEqual(String(byId.get(id).data.parent_id ?? ''), p.id, `section ${id} of ${p.title}`);
        }
    });

    await t('a section no page lists is not copied; the counts say so', async () => {
        const copies = rows.filter(r => r.type === 'dup|component');
        assert.strictEqual(copies.length, 4, 'Lightning, Wind, Solo, Borrower');
        assert.ok(!copies.some(r => asObj(r.data).title === 'listed by no page'));
        assert.strictEqual(res.components, 4);
        assert.strictEqual(res.foreignCopied, 1);
        assert.strictEqual(res.skippedUnreferenced, 1);
    });

    await t('the source pattern and the other pattern are untouched', async () => {
        assert.deepStrictEqual(ids(byId.get(lightning).data.draft_sections), [shared]);
        assert.deepStrictEqual(ids(byId.get(wind).data.draft_sections), [shared]);
        assert.deepStrictEqual(ids(byId.get(solo).data.sections), [both]);
        assert.strictEqual(ids(byId.get(borrower).data.draft_sections)[0], foreign);
        for (const id of [shared, both, dead, foreign]) assert.ok(byId.has(id), `row ${id} still there`);
        assert.strictEqual(byId.get(foreign).type, 'other|component');
    });

    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
