/**
 * The `formats` table as the auth layer's declaration of record (routes/auth/formats.js;
 * planning/tasks/current/format-declarations-server-side.md):
 *
 *   - upsertFormats is idempotent and the payload is the whole set (a left-out key is removed);
 *     malformed payloads are refused before anything is written
 *   - a declared rule governs over the stamp on a row and over the built-in copy; a stamp still
 *     answers for a kind the table says nothing about
 *   - a pattern row reads its type's vocabulary (`<type>+pattern`); a site-level container its own
 *   - childRefsForType reads the type's `child_refs` over the row's stamp
 *   - GET /dms/formats is open and names the site; there is no write route: only
 *     scripts/register-formats.js writes (dry run by default, --apply, idempotent, whole-set)
 *
 * Run: DMS_TEST_DB=cli-test node tests/test-formats.js   (SQLite)
 */
const assert = require('assert');
const express = require('express');
const os = require('os');
const { join } = require('path');
const { mkdtempSync } = require('fs');

const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
process.env.DMS_DB_ENV = DMS_DB;
process.env.DMS_AUTH_MODE = 'enforce';

const { getDb, awaitReady } = require('../src/db');
const { dmsMainTable } = require('../src/routes/uda/utils');
const { createController } = require('../src/routes/dms/dms.controller');
const AUTH = require('../src/routes/auth');
const owners = require('../src/routes/auth/owners');
const formats = require('../src/routes/auth/formats');
const { execFileSync } = require('child_process');
const { writeFileSync } = require('fs');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 4).join('\n      ')}`); }
};

const APP = `formats_${Date.now()}`;
const admin = { id: 1, email: 'admin@x', groups: [`${APP} Admin`] };
const star = { id: 2, email: 'star@x', groups: ['Owners'] };
const editor = { id: 3, email: 'ed@x', groups: ['Editors'] };
const nobody = { id: 4, email: 'no@x', groups: [] };

const PAGE_RULE = { owner: ['ancestor:pattern', 'self'], escape: { owner: 'site', perms: ['*'] }, ops: { read: { anyOf: [{ blank: true }, { perms: ['view-page'] }] }, edit: { default: ['edit-page'] }, create: ['create-page'], delete: ['edit-page'] } };
const declaration = (pageEdit = ['edit-page']) => [
  { type: 'dms-site+page', attributes: [{ key: 'title', type: 'text' }],
    authRules: { page: { ...PAGE_RULE, ops: { ...PAGE_RULE.ops, edit: { default: pageEdit } } } } },
  // the verbs in `pageEdit` claim every field (`*`); publish-page claims `published` besides
  { type: 'page+pattern', authVocabulary: { self: [{ value: 'edit-pattern', implies: [] }], descendants: [...pageEdit.map(value => ({ value, implies: [], fields: ['*'] })), { value: 'publish-page', implies: [], fields: ['published'] }] },
    childRefs: { page: { sections: 'component' } } },
  { type: 'admin+site', authVocabulary: { self: [{ value: 'manage-themes', implies: [], fields: ['themes'] }], descendants: [] },
    authRules: { site: { owner: 'site', ops: { edit: { byKey: { themes: ['manage-themes'] }, default: ['*'] } } } } },
];

async function main() {
  const dms = getDb(DMS_DB);
  await awaitReady(dms);
  const tbl = await dmsMainTable(dms, APP, 'per-app');
  for (const col of [`auth ${dms.type === 'postgres' ? 'jsonb' : 'TEXT'}`, 'parent_id INTEGER']) {
    try { await dms.query(`ALTER TABLE ${tbl} ADD COLUMN ${col}`); } catch { /* already there */ }
  }
  const ctrl = createController(DMS_DB);
  const insert = async (type, data) => (await ctrl.createData([APP, type, data], null))[0];
  const site = await insert('prod:site', { site_name: 'prod', authPermissions: { groups: { Owners: ['*'], Editors: ['view-pattern-list'], Themers: ['manage-themes'] }, users: {} } });
  const docs = await insert('prod|docs:pattern', { pattern_type: 'page', name: 'docs', authPermissions: { groups: { Editors: ['publish-page'] }, users: {} },
    // a stamp that DISAGREES with what the table will say: edit needs publish-page here
    authRules: { page: { ...PAGE_RULE, ops: { ...PAGE_RULE.ops, edit: { default: ['publish-page'] } } } },
    childRefs: { page: { old_sections: 'widget' } } });
  const page = await insert('docs|page', { title: 'p', published: 'draft' });
  const fresh = () => { owners.clearSnapshots(); formats.clearFormats(); };
  const can = (user, row, verb, fields) => AUTH.authorize({ row: { ...row, app: APP }, verb, fields, user }).then(d => d.allow);
  // the snapshot holds container rows only; a page is wrapped on the way in, as authorize does
  const subject = async (row) => owners.snapshotFor({ row: { ...row, app: APP }, fresh: true });
  const ruleFrom = async (row) => { const { snap, row: r } = await subject(row); return owners.ruleFor(snap, r); };
  const mapsOf = async (row) => { const { snap, row: r } = await subject(row); return owners.mapsFor(snap, r); };

  console.log('upsertFormats:');
  await t('empty table: the stamp governs (edit needs publish-page), built-in otherwise', async () => {
    fresh();
    assert.deepStrictEqual((await formats.formatsFor(APP)).rules, {});
    assert.strictEqual(await can(editor, page, 'edit', ['title']), true);      // Editors hold publish-page on docs
    assert.strictEqual(await can(nobody, page, 'edit', ['title']), false);
    assert.strictEqual((await ruleFrom(page)).from, 'stamped');
    assert.strictEqual((await ruleFrom(site)).from, 'built-in');
  });
  await t('a push writes every row once; the same push again writes nothing', async () => {
    const r1 = await formats.upsertFormats(APP, declaration());
    assert.deepStrictEqual([r1.written.sort(), r1.removed, r1.same], [['admin+site', 'dms-site+page', 'page+pattern'], [], 0]);
    const r2 = await formats.upsertFormats(APP, declaration());
    assert.deepStrictEqual([r2.written, r2.removed, r2.same], [[], [], 3]);
    const reversed = (o) => Object.fromEntries(Object.entries(o).reverse().map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? reversed(v) : v]));
    const r3 = await formats.upsertFormats(APP, declaration().map(r => ({ ...r, authRules: r.authRules && reversed(r.authRules) })));
    assert.strictEqual(r3.written.length, 0, 'key order is not a change');
    const listed = await formats.listFormats(APP);
    assert.deepStrictEqual(listed.map(r => r.type), ['admin+site', 'dms-site+page', 'page+pattern']);
    assert.deepStrictEqual(listed[1].attributes, [{ key: 'title', type: 'text' }]);
    assert.deepStrictEqual(listed[2].childRefs, { page: { sections: 'component' } });
  });
  await t('a site\'s rows live in its own table (per-app split mode); legacy mode resolves to the shared one', async () => {
    const { resolveFormatsTable } = require('../src/db/table-resolver');
    const mine = resolveFormatsTable(APP, dms.type, 'per-app').fullName;
    assert.strictEqual(mine, dms.type === 'postgres' ? `dms_${APP}.formats` : `formats__${APP}`);
    assert.strictEqual(resolveFormatsTable(APP, 'postgres', 'legacy').fullName, 'dms.formats');
    assert.strictEqual(resolveFormatsTable(APP, 'sqlite', 'legacy').fullName, 'formats');
    const count = async (table) => Number((await dms.query(`SELECT COUNT(*) AS n FROM ${table} WHERE app = $1`, [APP])).rows[0].n);
    assert.strictEqual(await count(mine), 3, 'the push above landed in the site\'s table');
    assert.strictEqual(await count(dms.type === 'postgres' ? 'dms.formats' : 'formats'), 0, 'nothing in the shared table');
    // another site's registration makes another table and leaves this one alone
    const OTHER = `${APP}_b`;
    await formats.upsertFormats(OTHER, [{ type: 'dms-site+page', authRules: { page: PAGE_RULE } }]);
    assert.strictEqual(Number((await dms.query(`SELECT COUNT(*) AS n FROM ${resolveFormatsTable(OTHER, dms.type, 'per-app').fullName}`)).rows[0].n), 1);
    assert.strictEqual(await count(mine), 3);
    assert.deepStrictEqual((await formats.listFormats(OTHER)).map(r => r.type), ['dms-site+page']);
    // the Falcor `dms.format` read (`<site>+<format key>`) reads the site's table
    const rows = await ctrl.getFormat([`${APP}+dms-site+page`, `${OTHER}+dms-site+page`, `${APP}+page+pattern`]);
    assert.deepStrictEqual(rows.map(r => `${r.app}+${r.type}`).sort(), [`${APP}+dms-site+page`, `${APP}+page+pattern`, `${OTHER}+dms-site+page`]);
    await formats.upsertFormats(OTHER, []);
  });
  await t('the declared rule governs over the stamp; the stamp answers for an undeclared kind', async () => {
    fresh();
    assert.strictEqual((await ruleFrom(page)).from, 'formats');
    assert.strictEqual((await ruleFrom(site)).from, 'formats');
    assert.strictEqual((await ruleFrom(docs)).from, 'built-in');   // `pattern` is not in the push
    assert.strictEqual(await can(editor, page, 'edit', ['title']), false, 'edit now needs edit-page, which Editors lack');
    assert.strictEqual(await can(star, page, 'edit', ['title']), true);
    assert.strictEqual(await can(editor, page, 'edit', ['published']), true, 'publish-page claims `published` in the pushed vocabulary');
  });
  await t('the pattern row reads its type\'s vocabulary; the site row its own format\'s', async () => {
    const m = await mapsOf(docs);
    assert.deepStrictEqual([m.scope, Object.keys(m.maps.fields.self)], ['self', []]);
    assert.deepStrictEqual(m.maps.fields.descendants.published, ['publish-page']);
    const s = await mapsOf(site);
    assert.deepStrictEqual([s.scope, s.maps.fields.self.themes], ['self', ['manage-themes']]);
    const themer = { id: 5, email: 't@x', groups: ['Themers'] };
    assert.strictEqual(await can(editor, site, 'edit', ['themes']), false);
    assert.strictEqual(await can(themer, site, 'edit', ['themes']), true, 'manage-themes claims `themes` in the pushed site vocabulary');
    assert.strictEqual(await can(themer, site, 'edit', ['site_name']), false, 'everything else on the site row needs *');
    assert.strictEqual(await can(star, site, 'edit', ['site_name']), true);
  });
  await t('the owner of a child kind comes from the type\'s declaration, the stamp when the type has no row', async () => {
    // declared: page owns `component` through `sections`; stamped: page owns `widget` through `old_sections`
    assert.deepStrictEqual([await ctrl.ownerKindForType(APP, 'docs|component'), await ctrl.ownerKindForType(APP, 'docs|widget')], ['page', null]);
    await formats.upsertFormats(APP, declaration().filter(r => r.type !== 'page+pattern'));
    fresh();
    assert.deepStrictEqual([await ctrl.ownerKindForType(APP, 'docs|component'), await ctrl.ownerKindForType(APP, 'docs|widget')], [null, 'page']);
    await formats.upsertFormats(APP, declaration());
    fresh();
  });
  await t('a push is the whole set: a key left out is removed', async () => {
    const r = await formats.upsertFormats(APP, declaration().slice(0, 2));
    assert.deepStrictEqual([r.written, r.removed, r.same], [[], ['admin+site'], 2]);
    const r2 = await formats.upsertFormats(APP, declaration(['edit-page', 'publish-page']));
    assert.deepStrictEqual(r2.written.sort(), ['admin+site', 'dms-site+page', 'page+pattern']);
    fresh();
    assert.strictEqual(await can(editor, page, 'edit', ['title']), true);
  });
  await t('malformed payloads are refused before anything is written', async () => {
    const before = await formats.listFormats(APP);
    for (const bad of [null, 'x', [{ type: 'nokey' }], [{ type: 'a+b' }, { type: 'a+b' }], [{ type: 'a+b', authRules: { x: { owner: 'self' } } }],
      [{ type: 'a+b', attributes: 'text' }], [{ type: 'a+b', authRules: [] }]]) {
      await assert.rejects(formats.upsertFormats(APP, bad), /^Error: formats:/, JSON.stringify(bad));
    }
    await assert.rejects(formats.upsertFormats('bad app!', []), /site name/);
    assert.deepStrictEqual(await formats.listFormats(APP), before);
  });
  await t('two rows ruling one kind: the first is read, a disagreement is warned', async () => {
    const warned = [];
    const orig = console.warn; console.warn = (m) => warned.push(String(m));
    try {
      await formats.upsertFormats(APP, [...declaration(), { type: 'other+page', authRules: { page: { ...PAGE_RULE, ops: { '*': ['x'] } } } }]);
      fresh();
      assert.deepStrictEqual((await ruleFrom(page)).rule.ops.edit, { default: ['edit-page'] });
      assert.ok(warned.some(m => /ruled twice/.test(m)), warned.join('\n'));
    } finally { console.warn = orig; await formats.upsertFormats(APP, declaration()); fresh(); }
  });

  console.log('GET /dms/formats and scripts/register-formats.js:');
  const server = express();
  server.use(express.json());
  formats.registerFormatRoutes(server);
  const listener = await new Promise(r => { const l = server.listen(0, () => r(l)); });
  const base = `http://127.0.0.1:${listener.address().port}`;
  await t('GET is open and needs the site named; there is no POST', async () => {
    assert.strictEqual((await fetch(base + '/dms/formats')).status, 400);
    const res = await fetch(`${base}/dms/formats?dms_app=${APP}`);
    const body = await res.json();
    assert.deepStrictEqual([res.status, body.app, body.formats.map(f => f.type)], [200, APP, ['admin+site', 'dms-site+page', 'page+pattern']]);
    const post = await fetch(`${base}/dms/formats?dms_app=${APP}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ formats: [] }) });
    assert.strictEqual(post.status, 404);
  });
  listener.close();

  const script = join(__dirname, '../src/scripts/register-formats.js');
  const dir = mkdtempSync(join(os.tmpdir(), 'formats-'));
  const run = (...args) => execFileSync(process.execPath, [script, '--db', DMS_DB, '--app', APP, ...args], { encoding: 'utf8', env: { ...process.env, DMS_DB_ENV: DMS_DB } });
  await t('the script: dry run reports and writes nothing; --apply writes; a second apply writes nothing', async () => {
    const file = join(dir, 'formats.json');
    writeFileSync(file, JSON.stringify(declaration(['edit-page', 'z'])));
    const dry = run('--file', file);
    assert.ok(/DRY RUN/.test(dry) && /to write\s+2/.test(dry) && /~ dms-site\+page/.test(dry) && /dry run — re-run with --apply/.test(dry), dry);
    assert.deepStrictEqual((await formats.listFormats(APP)).find(r => r.type === 'dms-site+page').authRules.page.ops.edit, { default: ['edit-page'] }, 'nothing written');
    const applied = run('--file', file, '--apply');
    assert.ok(/APPLY/.test(applied) && /wrote 2, removed 0, unchanged 1/.test(applied), applied);
    assert.deepStrictEqual((await formats.listFormats(APP)).find(r => r.type === 'dms-site+page').authRules.page.ops.edit, { default: ['edit-page', 'z'] });
    const again = run('--file', file, '--apply');
    assert.ok(/wrote 0, removed 0, unchanged 3/.test(again), again);
    writeFileSync(file, JSON.stringify(declaration().slice(0, 2)));
    const pruned = run('--file', file, '--apply');
    assert.ok(/- admin\+site/.test(pruned) && /wrote 2, removed 1, unchanged 0/.test(pruned), pruned);
    assert.deepStrictEqual((await formats.listFormats(APP)).map(r => r.type), ['dms-site+page', 'page+pattern']);
    await formats.upsertFormats(APP, declaration());
  });
  await t('the script without --file runs the client emitter and registers the real declarations', async () => {
    const out = run('--apply');
    assert.ok(/wrote \d+, removed 0, unchanged 0|wrote \d+/.test(out), out);
    const types = (await formats.listFormats(APP)).map(r => r.type);
    for (const k of ['admin+site', 'admin+dmsenv', 'datasets+source', 'dms-site+page', 'page+pattern', 'datasets+pattern']) assert.ok(types.includes(k), k);
    const page = (await formats.listFormats(APP)).find(r => r.type === 'page+pattern');
    assert.deepStrictEqual(Object.keys(page.childRefs), ['page']);
    assert.ok(/already current\s+\d+\n  to write\s+0\n  to remove\s+0/.test(run()), 'a dry run after is clean');
  });

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
