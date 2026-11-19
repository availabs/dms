/**
 * The orphan sweep — routes/dms/orphanSweep.js, scripts/sweep-orphans.js
 * (planning/tasks/current/orphan-sweeper.md).
 *
 * A per-app SQLite fixture with one row for every rule and every reason to keep a row. The plan must
 * name exactly the unreachable rows; the apply must delete exactly those, back them up first, and
 * write nothing to change_log.
 *
 * Run: node tests/test-orphan-sweep.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { SqliteAdapter } = require('../src/db/adapters/sqlite');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-sweep-'));
process.env.DMS_DELETE_BACKUP_DIR = path.join(tmp, 'backups');
const { planSweep, applySweep } = require('../src/routes/dms/orphanSweep');

const OLD = '2026-01-01 00:00:00';
const config = { type: 'sqlite', splitMode: 'per-app' };
let pass = 0, fail = 0;

function table(name) {
  return `CREATE TABLE ${name} (id INTEGER PRIMARY KEY, app TEXT NOT NULL, type TEXT NOT NULL, data TEXT,
    created_at TEXT DEFAULT (datetime('now')), created_by INTEGER, updated_at TEXT DEFAULT (datetime('now')), updated_by INTEGER)`;
}

async function fixture() {
  const db = new SqliteAdapter({ filename: path.join(tmp, `db-${Date.now()}-${Math.random()}.sqlite`) });
  await db.query(table('data_items__tapp'));
  await db.query(table('data_items__other'));
  await db.query(table('data_items__tapp__s5_v6_ds'));
  await db.query(`CREATE TABLE formats__tapp (id INTEGER PRIMARY KEY, app TEXT, type TEXT, attributes TEXT, auth_vocabulary TEXT, auth_rules TEXT, child_refs TEXT)`);
  await db.query(`CREATE TABLE change_log (revision INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER, app TEXT, type TEXT, action TEXT,
    data TEXT, created_at TEXT, created_by INTEGER, ip TEXT, user_agent TEXT, auth_state TEXT)`);
  await db.query(`INSERT INTO formats__tapp (app, type, child_refs) VALUES ('tapp', 'page+pattern', $1)`,
    [JSON.stringify({ page: { sections: 'component', draft_sections: 'component', history: 'page-edit' } })]);

  const rows = [
    [1, 'prod:site', { patterns: [{ id: '10', ref: 'tapp+prod|docs:pattern' }] }],
    [10, 'prod|docs:pattern', {}],
    [11, 'prod|docs:pattern', {}],                                   // unlisted twin of 10 → duplicate
    [12, 'prod|old:pattern', {}],                                    // unlisted, alone
    [120, 'old|page', { sections: [{ id: '121' }], history: { id: '122' } }],
    [121, 'old|component', {}],
    [122, 'old|page-edit', {}],
    [100, 'docs|page', { sections: [{ id: '101', ref: 'tapp+docs|component' }], draft_sections: [{ id: '102' }],
      history: { id: '103', ref: 'tapp+docs|page-edit' }, index: 200 }],   // `index: 200` is not a reference
    [107, 'docs|page', { sections: ['101'] }],
    [101, 'docs|component', { element: { 'element-data': JSON.stringify({ symbologies: { 400: { id: 400, name: 'Roads' } } }) } }],
    [102, 'docs|component', {}],
    [103, 'docs|page-edit', {}],                                     // single-ref history: live
    [104, 'docs|component', {}],                                     // nobody lists it
    [105, 'docs|component', {}, 'now'],                              // nobody lists it, but just made
    [106, 'docs|page-edit', {}],                                     // nobody names it
    [108, 'docs|component', {}],                                     // only the dead page 200 lists it
    [200, 'gone|page', { sections: [{ id: '201' }, { id: '108' }] }],
    [201, 'gone|component', {}],
    [202, 'gone|page', { sections: [{ id: '203' }] }],               // a dataset row names it → kept
    [203, 'gone|component', {}],
    [300, 'ce715e6c-32be-4d22-9a1a-70f4fe630bfd', { draft_sections: [{ id: '109' }] }],   // a legacy page
    [109, 'docs|component', {}],                                     // listed only by the legacy page → kept
    // Not page content (no childRefs names `symbology`): held unless other_kinds is asked for.
    [400, 'mapstyles|symbology', {}],                                // its pattern is gone; a live section names it
                                                                     // only inside element-data (JSON as text)
    [401, 'mapstyles|symbology', {}],                                // its pattern is gone, nothing names it
    [13, 'prod|maps:pattern', {}],                                   // unlisted, alone, holds a symbology
    [410, 'maps|symbology', {}],
  ];
  for (const [id, type, data, when] of rows) {
    const ts = when === 'now' ? new Date().toISOString().replace('T', ' ').slice(0, 19) : OLD;
    await db.query(`INSERT INTO data_items__tapp (id, app, type, data, created_at, updated_at) VALUES ($1, 'tapp', $2, $3, $4, $4)`,
      [id, type, JSON.stringify(data), ts]);
  }
  await db.query(`INSERT INTO data_items__tapp__s5_v6_ds (id, app, type, data, created_at, updated_at) VALUES (1, 'tapp', 'ds|6:data', $1, $2, $2)`,
    [JSON.stringify({ page_id: '202' }), OLD]);
  // Another app naming 200 and 12 without a ref to tapp: ids are per app, so this is not a reference.
  await db.query(`INSERT INTO data_items__other (id, app, type, data, created_at, updated_at) VALUES (1, 'other', 'x|page', $1, $2, $2)`,
    [JSON.stringify({ parent: '200', link: { id: '12' } }), OLD]);
  return db;
}

const ids = (a) => Object.values(a.ids).flat().map(Number).sort((x, y) => x - y);

async function run(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`); }
}

(async () => {
  console.log('orphan sweep');

  await run('plan names exactly the unreachable rows', async () => {
    const db = await fixture();
    const plan = await planSweep(db, { config, apps: ['tapp'] });
    const a = plan.apps[0];
    assert.deepStrictEqual(ids(a), [11, 12, 104, 106, 108, 120, 121, 122, 200, 201]);
    assert.deepStrictEqual(a.ids.unlisted_patterns.map(Number).sort((x, y) => x - y), [11, 12]);
    assert.deepStrictEqual(a.duplicates.map(d => Number(d.id)), [11]);
    assert.deepStrictEqual(a.blocked.map(b => Number(b.id)), [202]);
    assert.strictEqual(a.blocked[0].by[0].table, 'data_items__tapp__s5_v6_ds');
    // held, not taken: the two orphaned symbologies, and the unlisted pattern that still holds one
    assert.deepStrictEqual(a.held.map(h => `${h.rows} ${h.type}`).sort(), ['1 prod|maps:pattern', '2 mapstyles|symbology']);
    db.end();
  });

  await run('other_kinds is opt-in: asked for, it takes them (a referenced one stays)', async () => {
    const db = await fixture();
    const plan = await planSweep(db, { config, apps: ['tapp'], only: ['unlisted_patterns', 'dead_containers', 'unlisted_children', 'other_kinds'] });
    const a = plan.apps[0];
    assert.deepStrictEqual(ids(a), [11, 12, 13, 104, 106, 108, 120, 121, 122, 200, 201, 401, 410]);
    // the held pattern goes with what it holds, in the same category
    assert.deepStrictEqual(a.ids.other_kinds.map(Number).sort((x, y) => x - y), [13, 401, 410]);
    assert.deepStrictEqual(a.blocked.map(b => Number(b.id)).sort((x, y) => x - y), [202, 400]);
    assert.strictEqual(Number(a.blocked.find(b => Number(b.id) === 400).by[0].id), 101);   // named inside element-data
    assert.strictEqual(a.held.length, 0);
    const out = await applySweep(db, plan, { config });
    assert.strictEqual(out.results[0].deleted, 13);
    db.end();
  });

  await run('parents narrows the plan to one container (a pattern\'s Storage tab)', async () => {
    const db = await fixture();
    const plan = await planSweep(db, { config, apps: ['tapp'], parents: ['gone'], usage: true });
    const a = plan.apps[0];
    assert.deepStrictEqual(ids(a), [200, 201]);
    assert.ok(a.groups.every(g => g.parent === 'gone' && g.bytes > 0));
    assert.strictEqual(a.bytes, a.groups.reduce((s, g) => s + g.bytes, 0));
    assert.ok(a.usage.find(u => u.type === 'gone|page' && u.rows === 2));
    // the held map styles: only the pattern and its rows, with only other_kinds asked for
    const held = await planSweep(db, { config, apps: ['tapp'], parents: ['maps'], only: ['other_kinds'] });
    assert.deepStrictEqual(ids(held.apps[0]), [13, 410]);
    const out = await applySweep(db, held, { config, expect: { tapp: { other_kinds: 2 } } });
    assert.strictEqual(out.results[0].deleted, 2);
    await assert.rejects(applySweep(db, plan, { config, expect: { tapp: { dead_containers: 5 } } }), /expected 5/);
    db.end();
  });

  await run('a narrowed plan is the full plan cut to its scope (it searches only what it would delete)', async () => {
    const db = await fixture();
    const full = (await planSweep(db, { config, apps: ['tapp'] })).apps[0];
    const typeOf = new Map((await db.query('SELECT id, type FROM data_items__tapp')).rows.map(r => [String(r.id), r.type]));
    const cut = (only, keep) => Object.entries(full.ids).filter(([c]) => only.includes(c)).flatMap(([, l]) => l)
      .filter(id => keep(typeOf.get(id))).map(Number).sort((x, y) => x - y);
    const kindOf = (t) => t.split('|').pop().split(':').pop();
    const parentOf = (t) => (t.includes('|') ? t.split('|')[0] : '');
    const scopes = [
      // sections only: 203 hangs on page 202, which only a dataset row names, so it must stay
      [{ kinds: ['component'], only: ['unlisted_children'] }, (t) => kindOf(t) === 'component'],
      [{ parents: ['docs'], only: ['unlisted_children'] }, (t) => parentOf(t) === 'docs'],
      [{ parents: ['gone'], only: ['dead_containers', 'unlisted_children'] }, (t) => parentOf(t) === 'gone'],
      [{ only: ['unlisted_patterns'] }, () => true],
      [{ parents: ['old'] }, (t) => parentOf(t) === 'old' || t === 'prod|old:pattern'],
    ];
    for (const [opts, keep] of scopes) {
      const only = opts.only || ['unlisted_children', 'dead_containers', 'unlisted_patterns'];
      const a = (await planSweep(db, { config, apps: ['tapp'], ...opts })).apps[0];
      assert.deepStrictEqual(ids(a), cut(only, keep), JSON.stringify(opts));
    }
    db.end();
  });

  await run('a sections-only plan does no database-wide search', async () => {
    const db = await fixture();
    const lines = [];
    // docs' history entries hang on no page with no pattern (its section 108 does: page 200 lists it)
    const a = (await planSweep(db, { config, apps: ['tapp'], parents: ['docs'], kinds: ['page-edit'], only: ['unlisted_children'], log: (m) => lines.push(m) })).apps[0];
    assert.deepStrictEqual(ids(a), [106]);
    assert.ok(!lines.some(l => /searching the whole database/.test(l)), lines.join('\n'));
    // docs' sections do: that plan searches
    lines.length = 0;
    const b = (await planSweep(db, { config, apps: ['tapp'], parents: ['docs'], kinds: ['component'], only: ['unlisted_children'], log: (m) => lines.push(m) })).apps[0];
    assert.deepStrictEqual(ids(b), [104, 108]);
    assert.ok(lines.some(l => /searching the whole database/.test(l)));
    db.end();
  });

  await run('a skipped candidate that turns out kept is read: what it names is kept too', async () => {
    const db = await fixture();
    // 210 and 211 are pages with no pattern; a dataset row names 210, and 210 names 211
    await db.query(`INSERT INTO data_items__tapp (id, app, type, data, created_at, updated_at) VALUES (210, 'tapp', 'gone|page', $1, $2, $2), (211, 'tapp', 'gone|page', '{}', $2, $2)`,
      [JSON.stringify({ link: { id: '211' } }), OLD]);
    await db.query(`INSERT INTO data_items__tapp__s5_v6_ds (id, app, type, data, created_at, updated_at) VALUES (2, 'tapp', 'ds|6:data', $1, $2, $2)`,
      [JSON.stringify({ page_id: '210' }), OLD]);
    const a = (await planSweep(db, { config, apps: ['tapp'] })).apps[0];
    assert.deepStrictEqual(a.blocked.map(b => Number(b.id)).sort((x, y) => x - y), [202, 210, 211]);
    assert.strictEqual(Number(a.blocked.find(b => Number(b.id) === 211).by[0].id), 210);
    assert.deepStrictEqual(ids(a), [11, 12, 104, 106, 108, 120, 121, 122, 200, 201]);
    db.end();
  });

  await run('quick: no search; page and pattern rows are taken as kept and counted as unchecked', async () => {
    const db = await fixture();
    const lines = [];
    const a = (await planSweep(db, { config, apps: ['tapp'], quick: true, log: (m) => lines.push(m) })).apps[0];
    assert.deepStrictEqual(ids(a), [104, 106]);
    assert.strictEqual(a.quick, true);
    assert.strictEqual(a.unchecked, 5);                  // 11, 12, 120, 200, 202
    assert.ok(!lines.some(l => /searching/.test(l)));
    db.end();
  });

  await run('min-age 0 takes the recent row too', async () => {
    const db = await fixture();
    const plan = await planSweep(db, { config, apps: ['tapp'], minAgeHours: 0 });
    assert.ok(ids(plan.apps[0]).includes(105));
    db.end();
  });

  await run('--only limits the categories', async () => {
    const db = await fixture();
    const plan = await planSweep(db, { config, apps: ['tapp'], only: ['unlisted_patterns'] });
    assert.deepStrictEqual(ids(plan.apps[0]), [11, 12]);
    db.end();
  });

  await run('apply deletes the plan, backs it up, writes no change_log', async () => {
    const db = await fixture();
    const plan = await planSweep(db, { config, apps: ['tapp'] });
    const out = await applySweep(db, plan, { config });
    const left = (await db.query(`SELECT id FROM data_items__tapp ORDER BY id`)).rows.map(r => Number(r.id));
    assert.deepStrictEqual(left, [1, 10, 13, 100, 101, 102, 103, 105, 107, 109, 202, 203, 300, 400, 401, 410]);
    const log = (await db.query(`SELECT item_id, action, user_agent FROM change_log`)).rows;
    assert.strictEqual(log.length, 0);
    const lines = zlib.gunzipSync(fs.readFileSync(out.backup)).toString().trim().split('\n').map(JSON.parse);
    assert.strictEqual(lines[0].kind, 'header');
    assert.deepStrictEqual(lines.filter(l => l.kind === 'row').map(l => Number(l.row.id)).sort((x, y) => x - y),
      [11, 12, 104, 106, 108, 120, 121, 122, 200, 201]);
    const again = await planSweep(db, { config, apps: ['tapp'] });
    assert.strictEqual(again.apps[0].total, 0);
    db.end();
  });

  await run('a row listed again after the plan is kept', async () => {
    const db = await fixture();
    const plan = await planSweep(db, { config, apps: ['tapp'] });
    await db.query(`UPDATE data_items__tapp SET data = $1 WHERE id = 107`, [JSON.stringify({ sections: ['101', '104'] })]);
    const out = await applySweep(db, plan, { config });
    assert.strictEqual(out.results[0].keptSincePlan, 1);
    assert.strictEqual((await db.query(`SELECT id FROM data_items__tapp WHERE id = 104`)).rows.length, 1);
    db.end();
  });

  await run('expect mismatch refuses and deletes nothing', async () => {
    const db = await fixture();
    const plan = await planSweep(db, { config, apps: ['tapp'] });
    await assert.rejects(() => applySweep(db, plan, { config, expect: { tapp: { unlisted_children: 1 } } }), /expected 1/);
    assert.strictEqual((await db.query(`SELECT COUNT(*) AS n FROM data_items__tapp`)).rows[0].n, 26);
    db.end();
  });

  await run('no childRefs anywhere: children are not judged', async () => {
    const db = await fixture();
    await db.query(`DELETE FROM formats__tapp`);
    const plan = await planSweep(db, { config, apps: ['tapp'] });
    const a = plan.apps[0];
    assert.strictEqual(a.counts.unlisted_children, 0);
    assert.ok(a.notes.some(n => /no childRefs/.test(n)));
    db.end();
  });

  await run('no site lists patterns: patterns are not judged', async () => {
    const db = await fixture();
    await db.query(`UPDATE data_items__tapp SET data = '{}' WHERE id = 1`);
    const plan = await planSweep(db, { config, apps: ['tapp'] });
    assert.strictEqual(plan.apps[0].counts.unlisted_patterns, 0);
    db.end();
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
