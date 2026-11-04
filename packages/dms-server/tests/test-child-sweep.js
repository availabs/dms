/**
 * Deleting the children a write DROPPED — routes/dms/parentId.js `sweepRemovedChildren` /
 * `sweepAllChildren`, wired into setDataById, dms.data.delete and /sync/push.
 *
 * Task: planning/tasks/current/row-auth-parentage.md, "Remaining" 4.
 *
 * WHY. A page's `sections` / `draft_sections` holds POINTERS at component rows. `publish()` mints a
 * fresh set of rows for `sections` on every publish and drops the previous set from the array,
 * which until now simply left them in the table. Measured on `mitigat-ny-prod` 2026-10-29: **5,925
 * unreachable component rows**, every one an abandoned published generation (all 5,925 shared a
 * trackingId with a live section, none carried `is_draft`), all in one pattern, accumulated over
 * eight days — one section had **244** abandoned generations. Removing a section and deleting a
 * page leaked the same way.
 *
 * THE RULE. A set DIFFERENCE between the owner's arrays before and after the write, never "rows
 * nothing names" — children are created BEFORE their parent's array is written, so sweeping
 * unreferenced rows would delete sections as they are typed. Bounded by `parent_id = <owner>` and
 * the exact declared child type.
 *
 * Goes through the real Falcor routes on a disposable per-app sqlite table: the rule is unit-tested
 * in test-parent-id.js, so what is at risk here is the wiring.
 *
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-child-sweep.js
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

    const APP = `childsweep_${Date.now()}`;
    const admin = { authed: true, id: 1, email: 'a@x', groups: [`${APP} Admin`] };
    const graph = createTestGraph(DMS_DB, { user: admin });
    process.env.DMS_AUTH_MODE = 'legacy';
    process.env.DMS_CHILD_SWEEP_MODE = 'delete';

    const create = async (type, data) => {
        const res = await graph.callAsync(['dms', 'data', 'create'], [APP, type, data]);
        return String(Object.keys(res.jsonGraph.dms.data.byId)[0]);
    };
    const edit = (id, data, type) => graph.callAsync(['dms', 'data', 'edit'], [APP, id, data, type]);

    await create('prod:site', { name: 'prod' });
    const T = resolveTable(APP, '', 'sqlite', 'per-app');
    for (const col of ['auth TEXT', 'parent_id BIGINT']) {
        try { await db.promise(`ALTER TABLE ${T.fullName} ADD COLUMN ${col}`); }
        catch (e) { if (!/duplicate column/i.test(e.message)) console.log('[alter]', e.message); }
    }
    require('../src/routes/dms/rowAuthCaps')._resetCaps();

    const alive = async (id) =>
        (await db.promise(`SELECT id FROM ${T.fullName} WHERE id = $1`, [id])).length === 1;
    const parentOf = async (id) =>
        String((await db.promise(`SELECT parent_id FROM ${T.fullName} WHERE id = $1`, [id]))[0]?.parent_id ?? '');

    await create('prod|widgets:pattern', { pattern_type: 'page', childRefs: CHILD_REFS });
    await create('prod|other:pattern',   { pattern_type: 'page', childRefs: CHILD_REFS });
    const ref = (id) => ({ id, ref: `${APP}+widgets|component` });

    section('1. publish — the measured mechanism');
    {
        const d1 = await create('widgets|component', { title: 'draft one' });
        const p1 = await create('widgets|component', { title: 'published gen 1' });
        const page = await create('widgets|page', { title: 'P', draft_sections: [ref(d1)], sections: [ref(p1)] });
        await t('both generations are stamped to the page', async () => {
            assert.strictEqual(await parentOf(d1), page);
            assert.strictEqual(await parentOf(p1), page);
        });

        const p2 = await create('widgets|component', { title: 'published gen 2' });
        await edit(page, { sections: [ref(p2)] }, 'widgets|page');
        await t('publishing again deletes the previous published generation', async () =>
            assert.strictEqual(await alive(p1), false));
        await t('…and leaves the draft set alone', async () =>
            assert.strictEqual(await alive(d1), true));
        await t('…and the new generation is stamped', async () =>
            assert.strictEqual(await parentOf(p2), page));
    }

    section('2. the difference, not "unreferenced"');
    {
        const a = await create('widgets|component', { title: 'a' });
        const page = await create('widgets|page', { title: 'Q', draft_sections: [ref(a)] });
        const fresh = await create('widgets|component', { title: 'typed, not yet in the array' });
        await edit(page, { title: 'Q renamed' }, 'widgets|page');
        await t('a child created but not yet listed is never swept — the race', async () =>
            assert.strictEqual(await alive(fresh), true));
        await t('a title-only edit sweeps nothing', async () =>
            assert.strictEqual(await alive(a), true));

        await edit(page, { draft_sections: [], sections: [ref(a)] }, 'widgets|page');
        await t('a section MOVED from draft to published is not a removal', async () =>
            assert.strictEqual(await alive(a), true));

        await edit(page, { sections: [] }, 'widgets|page');
        await t('…and is deleted once no array of the page names it', async () =>
            assert.strictEqual(await alive(a), false));
    }

    section('3. the bounds');
    {
        const mine = await create('widgets|component', { title: 'mine' });
        const theirs = await create('widgets|component', { title: 'theirs' });
        const unstamped = await create('widgets|component', { title: 'never claimed' });
        const pageA = await create('widgets|page', { title: 'A', draft_sections: [ref(mine)] });
        const pageB = await create('widgets|page', { title: 'B', draft_sections: [ref(theirs)] });

        // THE ONE DANGEROUS INTERACTION, pinned here rather than left to be discovered.
        //
        // `stampChildren` RE-HOMES a row that already belongs to someone else — its predicate is
        // `parent_id IS NULL OR parent_id <> $1`, deliberately, because re-asserting from the
        // owner's own array on every save is what keeps the column honest and lets a save repair
        // drift. In healthy data nothing exercises that branch: there is no cross-page section
        // move, and paste/duplicate/template all mint new rows.
        //
        // It fires on exactly one shape — a component listed by TWO pages — which is corrupt data,
        // and is what `--verify-parents` reports as "named by 2+ owners" and the migration repairs
        // by duplicating the row. Whichever page saves last takes ownership, and then THAT page
        // dropping the section deletes a row the other page still lists.
        //
        // So `DMS_CHILD_SWEEP_MODE=delete` is gated on `--verify-parents` reporting zero
        // multi-owner rows for the app, the same way `DMS_AUTH_MODE=enforce` is gated on
        // coverage. `log` does not have this exposure, which is why it is the default.
        await edit(pageA, { draft_sections: [ref(mine), ref(theirs), ref(unstamped)] }, 'widgets|page');
        await t('a page that lists another page\'s row TAKES it — drift repair, by design', async () =>
            assert.strictEqual(await parentOf(theirs), pageA));
        await edit(pageA, { draft_sections: [] }, 'widgets|page');
        await t('…so dropping it deletes it, which is why delete mode needs a clean verify',
            async () => assert.strictEqual(await alive(theirs), false));
        await t('its own child goes too', async () => assert.strictEqual(await alive(mine), false));
        await t('and one it claimed from nobody', async () =>
            assert.strictEqual(await alive(unstamped), false));

        const stranger = await create('other|component', { title: 'another pattern' });
        const pageC = await create('widgets|page', { title: 'C', draft_sections: [{ id: stranger, ref: `${APP}+other|component` }] });
        await edit(pageC, { draft_sections: [] }, 'widgets|page');
        await t('a row in another PATTERN is never swept', async () =>
            assert.strictEqual(await alive(stranger), true));
    }

    section('4. deleting the owner');
    {
        const s1 = await create('widgets|component', { title: 's1' });
        const s2 = await create('widgets|component', { title: 's2' });
        const other = await create('widgets|component', { title: 'another page\'s' });
        const page = await create('widgets|page', { title: 'D', draft_sections: [ref(s1)], sections: [ref(s2)] });
        const keeper = await create('widgets|page', { title: 'E', draft_sections: [ref(other)] });

        await graph.callAsync(['dms', 'data', 'delete'], [APP, 'widgets|page', page]);
        await t('deleting a page deletes the sections it parented, both arrays', async () => {
            assert.strictEqual(await alive(s1), false);
            assert.strictEqual(await alive(s2), false);
        });
        await t('…and nothing of the page next to it', async () => {
            assert.strictEqual(await alive(other), true);
            assert.strictEqual(await alive(keeper), true);
        });
    }

    section('5. an UNSTAMPED row escapes the sweep — why the backfill is part of the rollout');
    {
        const old = await create('widgets|component', { title: 'published before the migration' });
        const page = await create('widgets|page', { title: 'H', sections: [ref(old)] });
        // A row that predates `--add-columns`: it exists, a page lists it, and nothing has stamped
        // it. Adding the column alone produces exactly this state for every row already in the
        // table.
        await db.promise(`UPDATE ${T.fullName} SET parent_id = NULL WHERE id = $1`, [old]);

        const fresh = await create('widgets|component', { title: 'published after' });
        await edit(page, { sections: [ref(fresh)] }, 'widgets|page');
        await t('a dropped row with parent_id NULL is NOT swept — `parent_id = owner` never matches',
            async () => assert.strictEqual(await alive(old), true));
        await t('…while the row that replaced it is stamped, so the NEXT drop does sweep it',
            async () => assert.strictEqual(await parentOf(fresh), page));

        const fresher = await create('widgets|component', { title: 'and again' });
        await edit(page, { sections: [ref(fresher)] }, 'widgets|page');
        await t('…which it does', async () => assert.strictEqual(await alive(fresh), false));
    }

    section('6. mode — log is the default and deletes nothing');
    {
        process.env.DMS_CHILD_SWEEP_MODE = 'log';
        const a = await create('widgets|component', { title: 'log mode' });
        const page = await create('widgets|page', { title: 'F', draft_sections: [ref(a)] });
        await edit(page, { draft_sections: [] }, 'widgets|page');
        await t('log mode leaves the dropped row in place', async () =>
            assert.strictEqual(await alive(a), true));

        process.env.DMS_CHILD_SWEEP_MODE = 'off';
        const b = await create('widgets|component', { title: 'off mode' });
        await edit(page, { draft_sections: [ref(b)] }, 'widgets|page');
        await edit(page, { draft_sections: [] }, 'widgets|page');
        await t('off mode too', async () => assert.strictEqual(await alive(b), true));
        process.env.DMS_CHILD_SWEEP_MODE = 'delete';
    }

    section('7. an unmigrated table sweeps nothing');
    {
        const APP2 = `childsweep_nocols_${Date.now()}`;
        const g2 = createTestGraph(DMS_DB, { user: { ...admin, groups: [`${APP2} Admin`] } });
        const mk = async (type, data) => {
            const res = await g2.callAsync(['dms', 'data', 'create'], [APP2, type, data]);
            return String(Object.keys(res.jsonGraph.dms.data.byId)[0]);
        };
        await mk('prod:site', { name: 'prod' });
        await mk('prod|widgets:pattern', { pattern_type: 'page', childRefs: CHILD_REFS });
        const T2 = resolveTable(APP2, '', 'sqlite', 'per-app');
        const c = await mk('widgets|component', { title: 'no columns here' });
        const page = await mk('widgets|page', { title: 'G', draft_sections: [{ id: c, ref: `${APP2}+widgets|component` }] });
        await g2.callAsync(['dms', 'data', 'edit'], [APP2, page, { draft_sections: [] }, 'widgets|page']);
        await t('no parent_id column, no sweep', async () =>
            assert.strictEqual((await db.promise(`SELECT id FROM ${T2.fullName} WHERE id = $1`, [c])).length, 1));
    }

    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
