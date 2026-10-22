/**
 * Permission checks on the dms.data.* writes (defects B/E, auth-permission-chain-and-unguarded-writes.md
 * "B/E design"): edit, create, type.edit, massedit and delete, judged per row kind. Each kind is refused
 * without its permission and allowed with it under `enforce`; `log` allows and logs; `legacy` checks nothing.
 *
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-data-auth.js
 * Never without DMS_TEST_DB: the default DMS config is not a test database.
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
process.env.DMS_DB_ENV = DMS_DB; // sourceAuth reads DMS rows from DMS_DB_ENV
const assert = require('assert');
const { createTestGraph } = require('./graph');
const { dmsMainTable } = require('../src/routes/uda/utils');
const { resolveTable } = require('../src/db/table-resolver');

let pass = 0, fail = 0;
const t = async (name, fn) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack}`); }
};

// Runs fn under DMS_DATA_AUTH_MODE=mode, collecting `[data-auth] would-deny` lines.
async function withMode(mode, fn) {
    const prev = process.env.DMS_DATA_AUTH_MODE;
    const warn = console.warn; const warned = [];
    process.env.DMS_DATA_AUTH_MODE = mode;
    console.warn = (...a) => { const s = a.join(' '); if (s.includes('would-deny')) warned.push(s); else warn(...a); };
    try { return await fn(warned); }
    finally { console.warn = warn; if (prev === undefined) delete process.env.DMS_DATA_AUTH_MODE; else process.env.DMS_DATA_AUTH_MODE = prev; }
}

async function outcome(promise) {
    try {
        const res = await promise;
        const s = JSON.stringify(res || {});
        return s.includes('"$type":"error"') ? s : null;
    } catch (e) {
        return (e && (e.message || JSON.stringify(e))) || 'error';
    }
}
const AUTH_RE = /Sign in|not authorized/i;
const refused = async (promise) => {
    const msg = await outcome(promise);
    assert(msg !== null, 'expected a refusal, the write went through');
    assert(AUTH_RE.test(msg), `refusal should match ${AUTH_RE}, got: ${msg.slice(0, 200)}`);
};
const allowed = async (promise) => {
    const msg = await outcome(promise);
    assert(msg === null, `expected success, got: ${msg && msg.slice(0, 300)}`);
};

async function run() {
    const { getDb, awaitReady } = require('../src/db');
    getDb(DMS_DB);
    await awaitReady();
    const dms = getDb(DMS_DB);

    const APP = `dataauth_${Date.now()}`;
    const tbl = await dmsMainTable(dms, APP, 'per-app');
    // fixtures go through the create route (as the app admin, under legacy): it allocates ids the way
    // the server does
    const insert = (type, data) => withMode('legacy', async () => {
        const res = await call(admin, ['dms', 'data', 'create'], [APP, type, data]);
        return +Object.keys(res.jsonGraph.dms.data.byId)[0];
    });
    const dataOf = async (id) => {
        const { rows } = await dms.query(`SELECT data, updated_by FROM ${tbl} WHERE id = $1`, [id]);
        const d = rows[0] && rows[0].data;
        return { data: typeof d === 'string' ? JSON.parse(d) : d, updated_by: rows[0] && rows[0].updated_by };
    };

    // ---- users
    const u = (id, groups) => ({ authed: true, id, email: `${id}@x`, groups });
    const anon = null;
    const stranger = u(10, []);
    const editor = u(11, ['Editors']);
    const publisher = u(12, ['Publishers']);
    const pageAdmin = u(13, ['PageAdmins']);
    const patEditor = u(14, ['PatEditors']);
    const themer = u(15, ['Themers']);
    const creator = u(16, ['Creators']);
    const dsEditor = u(17, ['DsEditors']);
    const admin = u(18, [`${APP} Admin`]);
    const paramsUser = u(19, ['Params']);
    const graphs = {};
    const as = (user) => graphs[user ? user.id : 'anon'] || (graphs[user ? user.id : 'anon'] = createTestGraph(DMS_DB, { user }));
    const call = (user, path, args) => as(user).callAsync(path, args);
    const edit = (user, id, data, type) => call(user, ['dms', 'data', 'edit'], type ? [APP, id, data, type] : [APP, id, data]);
    const create = (user, type, data = {}) => call(user, ['dms', 'data', 'create'], [APP, type, data]);

    // ---- fixtures
    const siteRow = await insert('site:site', { site_name: 'Site', patterns: [] });
    await insert('site|admin:pattern', {
        pattern_type: 'admin',
        authPermissions: { groups: { Themers: ['manage-themes'], Creators: ['create-pattern'] } },
    });
    const docs = await insert('site|docs:pattern', {
        pattern_type: 'page', name: 'Docs',
        authPermissions: { groups: {
            public: ['view-page'], Editors: ['edit-page'], Publishers: ['edit-page', 'publish-page'],
            PageAdmins: ['edit-page-permissions', 'create-page'], PatEditors: ['edit-pattern'], Params: ['edit-page-params'],
        } },
    });
    const open = await insert('site|open:pattern', { pattern_type: 'page', name: 'Open' });
    const docsPage = await insert('docs|page', { title: 'A page' });
    const docsPage2 = await insert('docs|page', { title: 'Doomed' });
    const openPage = await insert('open|page', { title: 'Open page' });
    const component = await insert('docs|component', { element: {} });
    const viewId = await insert('roads|v1:view', { name: 'v1' });
    const roads = await insert('env1|roads:source', { name: 'roads', type: 'internal_table', views: [{ id: viewId }] });
    const tickets = await insert('env1|tickets:source', {
        name: 'tickets', type: 'internal_table', views: [],
        auth_permissions: { groups: { public: ['edit-source-data'] } },
    });
    const envRow = await insert('site|env1:dmsenv', { sources: [{ id: roads }, { id: tickets }] });
    await insert('site|ds:pattern', {
        pattern_type: 'datasets', dmsEnvId: envRow,
        authPermissions: { groups: { DsEditors: ['update-source', 'edit-source-data', 'create-view', 'create-source'] } },
    });
    const ROAD_ROWS = `roads|${viewId}:data`;
    const TICKET_ROWS = `tickets|1:data`;
    for (const user of [anon, stranger, editor, publisher, pageAdmin, patEditor, themer, creator, dsEditor, admin, paramsUser]) await as(user).ready;

    console.log('\npages and components (enforce):');
    await t('a page edit needs edit-page; signed-out and no-grant users are refused', () => withMode('enforce', async () => {
        await refused(edit(anon, docsPage, { title: 'x' }));
        await refused(edit(stranger, docsPage, { title: 'x' }));
        await allowed(edit(editor, docsPage, { title: 'edited' }));
        assert.strictEqual((await dataOf(docsPage)).data.title, 'edited');
    }));
    await t('publishing (sections / published) needs publish-page', () => withMode('enforce', async () => {
        await refused(edit(editor, docsPage, { sections: [], published: '' }));
        await allowed(edit(publisher, docsPage, { sections: [], published: '', has_changes: false }));
    }));
    await t('a page\'s authPermissions need edit-page-permissions', () => withMode('enforce', async () => {
        await refused(edit(editor, docsPage, { authPermissions: { groups: { Editors: ['*'] } } }));
        await allowed(edit(pageAdmin, docsPage, { authPermissions: { groups: { Editors: ['edit-page'] } } }));
    }));
    await t('a new page needs create-page', () => withMode('enforce', async () => {
        await refused(create(editor, 'docs|page', { title: 'new' }));
        await allowed(create(pageAdmin, 'docs|page', { title: 'new' }));
    }));
    await t('components: edit-page or publish-page', () => withMode('enforce', async () => {
        await refused(edit(stranger, component, { element: { a: 1 } }));
        await allowed(edit(editor, component, { element: { a: 1 } }));
        await allowed(create(publisher, 'docs|component', { element: {} }));
    }));
    await t('a pattern with no grants stays open to signed-in users, never to anon', () => withMode('enforce', async () => {
        await allowed(edit(stranger, openPage, { title: 'x' }));
        await refused(edit(anon, openPage, { title: 'x' }));
        await refused(create(anon, 'open|page', { title: 'x' }));
    }));

    console.log('\npatterns and site rows (enforce):');
    await t('pattern edits need edit-pattern; authPermissions need edit-pattern-permissions', () => withMode('enforce', async () => {
        await allowed(edit(patEditor, docs, { name: 'Docs 2' }));
        await refused(edit(patEditor, docs, { authPermissions: { groups: { PatEditors: ['*'] } } }));
        await refused(edit(editor, docs, { name: 'x' }));
    }));
    await t('an open pattern needs view-pattern-list at the site level', () => withMode('enforce', async () => {
        await refused(edit(stranger, open, { name: 'x' }));
    }));
    await t('a new pattern needs site create-pattern', () => withMode('enforce', async () => {
        await refused(create(editor, 'site|new:pattern', { pattern_type: 'page' }));
        await allowed(create(creator, 'site|new:pattern', { pattern_type: 'page' }));
    }));
    await t('site row: patterns list → create-pattern; other keys → site *', () => withMode('enforce', async () => {
        await allowed(edit(creator, siteRow, { patterns: [{ id: docs }] }));
        await refused(edit(creator, siteRow, { site_name: 'x' }));
        await allowed(edit(admin, siteRow, { site_name: 'Renamed' }));
    }));
    await t('themes need manage-themes', () => withMode('enforce', async () => {
        await refused(create(stranger, 'blue:theme', {}));
        await allowed(create(themer, 'blue:theme', {}));
    }));

    console.log('\nwhole-row saves (only changed keys count; shapes seen in recorded editor requests):');
    await t('site editor saves the whole row with a new patterns list: create-pattern is enough', () => withMode('enforce', async () => {
        const { data } = await dataOf(siteRow);
        await allowed(edit(creator, siteRow, { ...data, id: siteRow, app: APP, type: 'site:site', patterns: [{ id: docs }, { id: open }] }));
        await refused(edit(creator, siteRow, { ...data, site_name: 'changed too' }));
    }));
    await t('site theme_refs need manage-themes', () => withMode('enforce', async () => {
        await allowed(edit(themer, siteRow, { theme_refs: [{ id: 1 }] }));
        await refused(edit(creator, siteRow, { theme_refs: [{ id: 2 }] }));
    }));
    await t('pattern editor saves the row with its unchanged authPermissions: edit-pattern is enough', () => withMode('enforce', async () => {
        const { data } = await dataOf(docs);
        await allowed(edit(patEditor, docs, { ...data, name: 'Docs 3' }));
    }));
    await t('a new page\'s `published: draft` is not a publish', () => withMode('enforce', async () => {
        await allowed(edit(editor, docsPage, { title: 'draft page', published: 'draft', draft_sections: [] }));
    }));
    await t('page-edit (edit history) rows: edit-page or publish-page on the pattern', () => withMode('enforce', async () => {
        await allowed(create(editor, 'docs|page-edit', { entries: [] }));
        await refused(create(stranger, 'docs|page-edit', { entries: [] }));
    }));

    await t('page filters: edit-page-params (the Filters pane) or edit-page; nothing else', () => withMode('enforce', async () => {
        await allowed(edit(paramsUser, docsPage, { filters: [{ searchKey: 'county' }] }));
        await allowed(edit(editor, docsPage, { filters: [] }));
        await refused(edit(paramsUser, docsPage, { title: 'x' }));
    }));
    await t('an edit that changes nothing passes with any of the row\'s edit permissions', () => withMode('enforce', async () => {
        const { data } = await dataOf(docsPage);
        await allowed(edit(pageAdmin, docsPage, { authPermissions: data.authPermissions }));  // edit-page-permissions only
        await refused(edit(stranger, docsPage, { title: data.title }));
    }));

    console.log('\ninternal datasets (enforce):');
    await t('data rows need edit-source-data on their source', () => withMode('enforce', async () => {
        await refused(create(anon, ROAD_ROWS, { a: 1 }));
        await refused(create(stranger, ROAD_ROWS, { a: 1 }));
        await allowed(create(dsEditor, ROAD_ROWS, { a: 1 }));
    }));
    await t('a public edit-source-data grant lets anon add rows', () => withMode('enforce', async () => {
        await allowed(create(anon, TICKET_ROWS, { title: 'broken link' }));
    }));
    await t('source edits: update-source; auth_permissions need edit-source-permissions', () => withMode('enforce', async () => {
        await refused(edit(stranger, roads, { description: 'x' }));
        await allowed(edit(dsEditor, roads, { description: 'roads' }));
        await refused(edit(dsEditor, roads, { auth_permissions: { groups: { DsEditors: ['*'] } } }));
    }));
    await t('a new version needs create-view on the source; a new source needs create-source', () => withMode('enforce', async () => {
        await refused(create(stranger, 'roads|v2:view', { name: 'v2' }));
        await allowed(create(dsEditor, 'roads|v2:view', { name: 'v2' }));
        await refused(create(stranger, 'env1|lakes:source', { name: 'lakes' }));
        await allowed(create(dsEditor, 'env1|lakes:source', { name: 'lakes' }));
    }));
    await t('massedit needs edit-source-data and writes the token user, not the argument', () => withMode('enforce', async () => {
        const res = await create(dsEditor, ROAD_ROWS, { a: '1' });
        const rowId = +Object.keys(res.jsonGraph.dms.data.byId)[0];
        const maps = [{ invalidValue: '1', validValue: '2' }];
        await refused(call(stranger, ['dms', 'data', 'massedit'], [APP, ROAD_ROWS, 'a', maps, 999]));
        await allowed(call(dsEditor, ['dms', 'data', 'massedit'], [APP, ROAD_ROWS, 'a', maps, 999]));
        const { fullName } = resolveTable(APP, ROAD_ROWS, dms.type, 'per-app', roads);
        const { rows } = await dms.query(`SELECT data, updated_by FROM ${fullName} WHERE id = $1`, [rowId]);
        const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
        assert.strictEqual(data.a, '2');
        assert.strictEqual(String(rows[0].updated_by), String(dsEditor.id), 'updated_by is the token user, not 999');
    }));
    await t('Delete Version (internal): needs delete-source; the cascade drops the view from the source', () => withMode('enforce', async () => {
        const doomed = await insert('roads|v9:view', { name: 'v9' });
        await withMode('legacy', () => edit(admin, roads, { views: [{ id: viewId }, { id: doomed }] }));
        await refused(call(dsEditor, ['dms', 'data', 'delete'], [APP, 'roads|v9:view', doomed]));
        await allowed(call(admin, ['dms', 'data', 'delete'], [APP, 'roads|v9:view', doomed]));
        const views = (await dataOf(roads)).data.views.map(v => +v.id);
        assert.deepStrictEqual(views, [viewId], 'the ref is gone');
    }));

    console.log('\nother kinds, type.edit, delete:');
    await t('an unmapped kind needs a sign-in only', () => withMode('enforce', async () => {
        await refused(create(anon, 'x|symbology', {}));
        await allowed(create(stranger, 'x|symbology', {}));
    }));
    await t('type.edit is judged under the old type and the new one', () => withMode('enforce', async () => {
        await refused(call(stranger, ['dms', 'type', 'edit'], [APP, docsPage, 'open|page']));
        // a move is a delete from docs (edit-page) + a create in open: pageAdmin (create-page,
        // edit-page-permissions on docs) can't move a docs page out
        await refused(call(pageAdmin, ['dms', 'type', 'edit'], [APP, docsPage, 'open|page']));
    }));
    await t('a page delete needs edit-page (before: any signed-in user)', () => withMode('enforce', async () => {
        await refused(call(stranger, ['dms', 'data', 'delete'], [APP, 'docs|page', docsPage2]));
        assert((await dataOf(docsPage2)).data, 'refused delete left the page');
        await allowed(call(editor, ['dms', 'data', 'delete'], [APP, 'docs|page', docsPage2]));
    }));
    await t('${app} Admin passes everything', () => withMode('enforce', async () => {
        await allowed(edit(admin, docs, { authPermissions: { groups: {} } }));
        await allowed(create(admin, ROAD_ROWS, { a: 3 }));
    }));

    console.log('\n/sync/push (enforce):');
    {
        const express = require('express');
        const { createSyncRoutes } = require('../src/routes/sync/sync');
        const http = require('http');
        let pushUser = null;
        const server = express().use(express.json())
            .use((req, res, next) => { req.availAuthContext = { user: pushUser }; next(); })
            .use(createSyncRoutes(DMS_DB)).listen(0);
        await new Promise(r => server.once('listening', r));
        const push = (user, body) => { pushUser = user; return new Promise((resolve, reject) => {
            const payload = JSON.stringify(body);
            const req = http.request({ port: server.address().port, path: '/sync/push', method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
                let b = ''; res.on('data', c => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b }));
            });
            req.on('error', reject); req.end(payload);
        }); };
        await t('U on a page: stranger 403, anon 401, editor 200', () => withMode('enforce', async () => {
            assert.strictEqual((await push(stranger, { action: 'U', item: { app: APP, type: 'docs|page', id: docsPage, data: { title: 'sync' } } })).status, 403);
            assert.strictEqual((await push(anon, { action: 'U', item: { app: APP, type: 'docs|page', id: docsPage, data: { title: 'sync' } } })).status, 401);
            assert.strictEqual((await push(editor, { action: 'U', item: { app: APP, type: 'docs|page', id: docsPage, data: { title: 'sync' } } })).status, 200);
        }));
        await t('U judges the stored type, not the one the client names', () => withMode('enforce', async () => {
            // the stranger may edit pages of the open pattern; naming that type doesn't open a docs page
            const r = await push(stranger, { action: 'U', item: { app: APP, type: 'open|page', id: docsPage, data: { title: 'x' } } });
            assert.strictEqual(r.status, 403);
        }));
        await t('I with an existing id is judged as an edit of that row', () => withMode('enforce', async () => {
            const r = await push(stranger, { action: 'I', item: { app: APP, type: 'open|page', id: roads, data: { description: 'x' } } });
            assert.strictEqual(r.status, 403, r.body);
        }));
        await t('I of a new source row needs create-source', () => withMode('enforce', async () => {
            assert.strictEqual((await push(stranger, { action: 'I', item: { app: APP, type: 'env1|rivers:source', data: { name: 'rivers' } } })).status, 403);
            assert.strictEqual((await push(dsEditor, { action: 'I', item: { app: APP, type: 'env1|rivers:source', data: { name: 'rivers' } } })).status, 200);
        }));
        await t('D of a pattern needs delete-pattern', () => withMode('enforce', async () => {
            assert.strictEqual((await push(patEditor, { action: 'D', item: { app: APP, type: 'site|docs:pattern', id: docs } })).status, 403);
            assert.ok((await dataOf(docs)).data, 'the pattern is still there');
        }));
        const rawData = async (id) => {
            const { rows } = await dms.query(`SELECT CAST(data AS TEXT) AS t FROM ${tbl} WHERE id = $1`, [id]);
            return rows[0] && rows[0].t;
        };
        await t('a value that only compares equal (past double precision) is not written', () => withMode('enforce', async () => {
            const made = await push(admin, { action: 'I', item: { app: APP, type: 'docs|page', data: '{"title":"big","sections":[{"id":12345678901234567890}]}' } });
            const bigPage = JSON.parse(made.body).item.id;
            // the editor has edit-page, not publish-page: in JS the two ids are the same double
            const r = await push(editor, { action: 'U', item: { app: APP, type: 'docs|page', id: bigPage,
                data: '{"title":"big 2","sections":[{"id":12345678901234567891}]}' } });
            assert.strictEqual(r.status, 200, r.body);
            const text = await rawData(bigPage);
            assert.match(text, /12345678901234567890/, `sections must be unchanged: ${text}`);
            assert.match(text, /big 2/);
        }));
        await t('sections resent as a JSON string of the same array are a change (publish-page)', () => withMode('enforce', async () => {
            const { data } = await dataOf(docsPage);
            const r = await push(editor, { action: 'U', item: { app: APP, type: 'docs|page', id: docsPage,
                data: { sections: JSON.stringify(data.sections || []) } } });
            assert.strictEqual(r.status, 403, r.body);
        }));
        await t('I onto an existing row replaces it: keys it leaves out are judged as removed', () => withMode('enforce', async () => {
            await withMode('legacy', () => edit(admin, docsPage, { sections: [{ id: 1 }], authPermissions: { groups: { Editors: ['edit-page'] } } }));
            const r = await push(editor, { action: 'I', item: { app: APP, type: 'docs|page', id: docsPage, data: { title: 'wiped' } } });
            assert.strictEqual(r.status, 403, `dropping sections + authPermissions needs publish-page / edit-page-permissions: ${r.body}`);
            const { data } = await dataOf(docsPage);
            assert.deepStrictEqual(data.sections, [{ id: 1 }]);
        }));
        await t('I onto an existing row with every key kept + one changed: allowed, the rest from the stored row', () => withMode('enforce', async () => {
            const { data } = await dataOf(docsPage);
            const r = await push(editor, { action: 'I', item: { app: APP, type: 'docs|page', id: docsPage, data: { ...data, title: 'replaced' } } });
            assert.strictEqual(r.status, 200, r.body);
            const after = (await dataOf(docsPage)).data;
            assert.strictEqual(after.title, 'replaced');
            assert.deepStrictEqual(after.sections, data.sections);
            assert.deepStrictEqual(after.authPermissions, data.authPermissions);
        }));
        await t('echoed row columns (created_at …) are never written into data', () => withMode('enforce', async () => {
            await allowed(edit(editor, docsPage, { title: 'echo', created_at: '2020-01-01', updated_by: 999 }));
            const { data } = await dataOf(docsPage);
            assert.strictEqual(data.created_at, undefined);
            assert.strictEqual(data.updated_by, undefined);
        }));
        await t('D of a view through sync cascades like dms.data.delete (the ref leaves the source)', () => withMode('enforce', async () => {
            const doomed = await insert('roads|v8:view', { name: 'v8' });
            const before = (await dataOf(roads)).data.views;
            await withMode('legacy', () => edit(admin, roads, { views: [...before, { id: doomed }] }));
            assert.strictEqual((await push(dsEditor, { action: 'D', item: { app: APP, type: '', id: doomed } })).status, 403);
            assert.strictEqual((await push(admin, { action: 'D', item: { app: APP, type: '', id: doomed } })).status, 200);
            assert.deepStrictEqual((await dataOf(roads)).data.views.map(v => +v.id), before.map(v => +v.id));
        }));
        server.close();
    }

    console.log('\npattern REST actions (enforce):');
    {
        const { requirePatternAction } = require('../src/dama/upload/auth');
        const controller = as(admin).controller;
        const gate = async (user, opts) => {
            const res = { code: 200, status(c) { this.code = c; return this; }, json() { return this; } };
            const ok = await requirePatternAction({ method: 'POST', url: '/x', headers: {}, availAuthContext: { user } }, res, controller, { app: APP, ...opts });
            return ok ? 200 : res.code;
        };
        await t('duplicate: edit-pattern on the pattern + site create-pattern; anon 401', () => withMode('enforce', async () => {
            const dup = { instance: 'docs', perms: 'edit-pattern', sitePerms: 'create-pattern' };
            assert.strictEqual(await gate(anon, dup), 401);
            assert.strictEqual(await gate(patEditor, dup), 403, 'edit-pattern alone is not enough');
            assert.strictEqual(await gate(creator, dup), 403, 'create-pattern alone is not enough');
            assert.strictEqual(await gate(admin, dup), 200);
        }));
        await t('sync-filters: edit-pattern-permissions on the named pattern', () => withMode('enforce', async () => {
            assert.strictEqual(await gate(patEditor, { id: docs, instance: 'docs', perms: 'edit-pattern-permissions' }), 403);
            assert.strictEqual(await gate(admin, { id: docs, instance: 'docs', perms: 'edit-pattern-permissions' }), 200);
            assert.strictEqual(await gate(admin, { id: docs, instance: 'open', perms: 'edit-pattern-permissions' }), 403, 'id and instance must match');
        }));
        await t('log: a refused pattern action goes through and logs', () => withMode('log', async (warned) => {
            assert.strictEqual(await gate(stranger, { instance: 'docs', perms: 'edit-pattern' }), 200);
            assert.strictEqual(warned.length, 1);
        }));
    }

    console.log('\nmodes:');
    await t('log allows a refused write and logs one would-deny line', () => withMode('log', async (warned) => {
        await allowed(edit(stranger, docsPage, { title: 'by stranger' }));
        assert.strictEqual(warned.length, 1, warned.join('\n'));
        assert.match(warned[0], /\[data-auth\] would-deny edit .* user=10 .*missing edit-page/);
    }));
    await t('log is silent for a granted write', () => withMode('log', async (warned) => {
        await allowed(edit(editor, docsPage, { title: 'ok' }));
        assert.strictEqual(warned.length, 0, warned.join('\n'));
    }));
    await t('legacy checks nothing', () => withMode('legacy', async (warned) => {
        await allowed(create(anon, 'docs|page', { title: 'anon page' }));
        assert.strictEqual(warned.length, 0);
    }));
}

run()
    .catch(e => { fail++; console.log(`  ✗ crashed\n      ${e.stack}`); })
    .then(() => {
        console.log(`\ndata-auth tests: ${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    });
