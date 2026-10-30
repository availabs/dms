/**
 * The blank-row section of src/scripts/permissions-access-diff.js (task permissions-blank-row-read-only, plan
 * step 4): change_log writes to rows with no grants up the chain are listed, decided under today's rule and the
 * read-only rule, with the grant that keeps the access.
 *
 * Decided with routes/dms/authRules.js through authJudge.js, as DMS_DATA_AUTH_JUDGE=data does.
 * Fixture rows are written with SQL (the script reads tables, not routes), into a fresh app and auth project.
 *
 * Run: DMS_TEST_DB=cli-test node tests/test-permissions-blank-audit.js
 * Never without DMS_TEST_DB: the default DMS config is not a test database.
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { dmsMainTable } = require('../src/routes/uda/utils');

let pass = 0, fail = 0;
const t = async (name, fn) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack}`); }
};

async function run() {
    const { getDb, awaitReady } = require('../src/db');
    getDb(DMS_DB);
    await awaitReady();
    const db = getDb(DMS_DB);

    const APP = `blankaudit_${Date.now()}`;
    const tbl = await dmsMainTable(db, APP, 'per-app');
    const insert = async (type, data) => +(await db.query(
        `INSERT INTO ${tbl} (app, type, data) VALUES ($1, $2, $3) RETURNING id`, [APP, type, JSON.stringify(data)])).rows[0].id;

    // auth: Editors (level 1), Managers (level 5), and `${APP} Admin`
    const by = 'test';
    await db.query(`INSERT INTO projects (name, created_by) VALUES ($1, $2)`, [APP, by]);
    const users = {};
    for (const [who, group, level] of [['editor', 'Editors', 1], ['manager', 'Managers', 5], ['admin', `${APP} Admin`, 10]]) {
        const g = `${APP} ${group}`.replace(`${APP} ${APP}`, APP);
        const email = `${who}@${APP}.test`;
        await db.query(`INSERT INTO groups (name, created_by) VALUES ($1, $2)`, [g, by]);
        await db.query(`INSERT INTO groups_in_projects (project_name, group_name, auth_level, created_by) VALUES ($1, $2, $3, $4)`, [APP, g, level, by]);
        await db.query(`INSERT INTO users (email, password) VALUES ($1, 'x')`, [email]);
        await db.query(`INSERT INTO users_in_groups (user_email, group_name, created_by) VALUES ($1, $2, $3)`, [email, g, by]);
        users[who] = { id: +(await db.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id, group: g };
    }
    const EDITORS = users.editor.group, MANAGERS = users.manager.group;

    // site grants on the admin row: Managers hold `*`
    await insert(`${APP}|admin:pattern`, { pattern_type: 'admin', authPermissions: { groups: { [MANAGERS]: ['*'] } } });
    const docs = await insert(`${APP}|docs:pattern`, { pattern_type: 'page', authPermissions: {} });          // blank
    const guarded = await insert(`${APP}|guarded:pattern`, { pattern_type: 'page',
        authPermissions: { groups: { [EDITORS]: ['edit-page'] } } });
    const other = await insert(`${APP}|other:pattern`, { pattern_type: 'page' });                              // blank
    const page = await insert('docs|page', { title: 'blank page' });
    const guardedPage = await insert('guarded|page', { title: 'guarded page' });
    const src = await insert('env1|counts:source', { name: 'counts' });                                     // blank
    const ds = await insert(`${APP}|data:pattern`, { pattern_type: 'datasets', sources: [{ id: src }] });     // blank

    const clTbl = db.type === 'postgres' ? 'dms.change_log' : 'change_log';
    const log = (itemId, type, action, user, daysAgo = 1) => db.query(
        `INSERT INTO ${clTbl} (item_id, app, type, action, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [itemId, APP, type, action, user, new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 19).replace('T', ' ')]);
    await log(page, 'docs|page', 'U', users.editor.id);
    await log(page, 'docs|page', 'U', users.editor.id);
    await log(page, 'docs|page', 'U', users.manager.id);
    await log(page, 'docs|page', 'U', users.admin.id);
    await log(guardedPage, 'guarded|page', 'U', users.editor.id);
    await log(other, `${APP}|other:pattern`, 'U', users.editor.id);
    await log(docs, `${APP}|docs:pattern`, 'U', users.manager.id);
    await log(501, 'counts|10:data', 'I', users.editor.id);
    await log(77, 'chat|channel', 'I', users.editor.id);
    await log(page, 'docs|page', 'U', users.editor.id, 45);   // outside the window
    void guarded; void ds;

    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'blank-audit-'));
    const { run: audit } = require('../src/scripts/permissions-access-diff');
    const log0 = console.log; console.log = () => {};
    let res;
    try { res = await audit({ auth: DMS_DB, dms: DMS_DB, app: APP, out }); }
    finally { console.log = log0; }
    const rows = res.blank.rows;
    const find = (kind, row, email) => rows.find(r => r.kind === kind && String(r.row) === String(row) && r.user === email);
    const email = (who) => `${who}@${APP}.test`;

    await t('an editor\'s edits of a page with no grants are refused, both in the window', async () => {
        const r = find('page', page, email('editor'));
        assert(r, 'listed');
        assert.strictEqual(r.outcome, 'refused');
        assert.strictEqual(r.writes, 2, 'the 45-day-old write is outside the window');
        assert.strictEqual(r.blank, `pattern:${docs}`);
    });
    await t('site `*` and `${app} Admin` keep their edits', async () => {
        assert.strictEqual(find('page', page, email('manager')).outcome, 'kept (site *)');
        assert.strictEqual(find('page', page, email('admin')).outcome, `kept (${APP} Admin)`);
    });
    await t('a page under a pattern with grants is not a blank-row write', async () => {
        assert(!find('page', guardedPage, email('editor')));
    });
    await t('a no-grant pattern edit without site view-pattern-list is refused today too', async () => {
        const r = find('pattern', other, email('editor'));
        assert.strictEqual(r.outcome, 'refused today too');
        assert.strictEqual(r.blank, `pattern:${other}`);
        assert.strictEqual(find('pattern', docs, email('manager')).outcome, 'kept (site *)');
    });
    await t('data rows of a no-grant source are refused, grant proposed on its datasets pattern', async () => {
        const r = rows.find(x => x.kind === 'data' && x.user === email('editor'));
        assert.strictEqual(r.outcome, 'refused');
        assert.deepStrictEqual(r.fix.principal, { kind: 'group', name: EDITORS });
        assert.strictEqual(r.fix.perm, 'edit-source-data');
    });
    await t('kinds the rules don\'t cover are counted, not judged', async () => {
        assert.strictEqual(res.blank.unjudged.channel, 1);
    });
    await t('blank-grants.json holds the grants that keep the refused writes', async () => {
        const g = JSON.parse(fs.readFileSync(path.join(out, 'blank-grants.json'), 'utf8'));
        assert.deepStrictEqual(g[`pattern:${docs}`], { groups: { [EDITORS]: ['edit-page'] }, users: {} });
        assert.deepStrictEqual(g[`pattern-of:${APP}/${src}`], { groups: { [EDITORS]: ['edit-source-data'] }, users: {} });
        assert.strictEqual(Object.keys(g).length, 2);
        assert(fs.readFileSync(path.join(out, 'remediation.md'), 'utf8').includes('## Blank rows'));
    });

    fs.rmSync(out, { recursive: true, force: true });
    console.log(`\nblank-audit tests: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
