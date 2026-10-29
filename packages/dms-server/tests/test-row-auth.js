/**
 * Row auth ancestry (routes/dms/rowAuth.js) — fixtures only, no database.
 *
 * Covers the parent_id → type-path SEQUENCE, dangling ids, truncation, and the fact that
 * `data.parent` is no longer consulted in any of the three encodings the spike found in production
 * (row-auth-chain-spike.md). It was retired on 2026-10-29 — see rowAuth.js's header.
 *
 * Run: node tests/test-row-auth.js
 */
const assert = require('assert');
const { createResolver, authOf, parentIdOf, identityOf } = require('../src/routes/dms/rowAuth');
const { can } = require('../src/routes/dms/mergeAuth');

let pass = 0, fail = 0;
// Cases are COLLECTED and run in order below — `t` must not fire them as it is called, or async
// cases interleave with the sync ones and the exit code is decided before they finish.
const cases = [];
const t = (name, fn) => cases.push([name, fn]);
const section = (name) => cases.push([name, null]);

// --- a miniature app, shaped like mitigat-ny-prod ---------------------------
const ROWS = {
    1: { id: 1, type: 'prod:site',                data: {} },
    2: { id: 2, type: 'prod|county:pattern',      data: { authPermissions: { groups: { Editors: ['read', 'edit'] } } } },
    3: { id: 3, type: 'county|page',                          data: {} },   // no parent → type path
    4: { id: 4, type: 'county|page',      parent_id: 3,       data: {} },
    5: { id: 5, type: 'county|component', parent_id: 4,       data: {} },
    6: { id: 6, type: 'county|component', parent_id: '4',     data: {} },   // pg hands bigint back as text
    7: { id: 7, type: 'county|component', parent_id: 999999,  data: {} },   // dangling → type path
    8: { id: 8, type: 'county|page',      parent_id: 9,       data: {} },   // cycle
    9: { id: 9, type: 'county|page',      parent_id: 8,       data: {} },
};
let loads = 0;
const loadByIds = async (ids) => { loads++; return ids.map(i => ROWS[i]).filter(Boolean); };
const loadContainers = async () => [ROWS[1], ROWS[2]];
const mk = () => createResolver({ loadByIds, loadContainers });
const editor = { id: 'u1', authed: true, groups: ['Editors'] };

section('parentIdOf — the parent_id column, and nothing else');
t('a numeric column', () => assert.strictEqual(parentIdOf(ROWS[4]), '3'));
t('a text column — postgres returns bigint as a string', () => assert.strictEqual(parentIdOf(ROWS[6]), '4'));
t('absent', () => assert.strictEqual(parentIdOf(ROWS[3]), null));
t('an empty string is absent, not a parent named ""', () =>
    assert.strictEqual(parentIdOf({ parent_id: '' }), null));
t('a null column is absent', () => assert.strictEqual(parentIdOf({ parent_id: null }), null));

// The retirement, pinned: a row carrying one of the three production encodings and NO column must
// resolve to null here and fall through to the type path, not to the 52.6%-wrong pointer.
t('data.parent as a jsonb object is ignored', () =>
    assert.strictEqual(parentIdOf({ type: 'county|component', data: { parent: { id: '4', ref: 'x' } } }), null));
t('data.parent as a bare numeric string is ignored', () =>
    assert.strictEqual(parentIdOf({ type: 'county|page', data: { parent: '3' } }), null));
t('data.parent double-encoded as JSON text is ignored', () =>
    assert.strictEqual(parentIdOf({ type: 'county|component', data: { parent: '{"id":"4","ref":"x"}' } }), null));
t('a leftover data.parent cannot override the column', () =>
    assert.strictEqual(parentIdOf({ parent_id: 42, data: { parent: '7' } }), '42'));

section('identityOf — what a parent segment matches');
t('site', () => assert.strictEqual(identityOf(ROWS[1]), 'prod'));
t('pattern', () => assert.strictEqual(identityOf(ROWS[2]), 'county'));
t('a non-container has no identity', () => assert.strictEqual(identityOf(ROWS[5]), null));

section('authOf — the auth column coalesced with data.authPermissions');
t('legacy data.authPermissions is used when no column', () =>
    assert.deepStrictEqual(authOf(ROWS[2]).groups.Editors, ['read', 'edit']));
t('the auth column wins', () =>
    assert.deepStrictEqual(authOf({ auth: { groups: { A: ['read'] } }, data: { authPermissions: { groups: { B: ['edit'] } } } }).groups, { A: ['read'] }));
t('a scoped auth column survives', () => {
    const a = authOf({ auth: { self: { groups: { A: ['edit'] } }, descendants: { groups: { B: ['read'] } } } });
    assert.ok(a.self && a.descendants);
});
t('a JSON string column parses', () =>
    assert.deepStrictEqual(authOf({ auth: '{"groups":{"A":["read"]}}' }).groups, { A: ['read'] }));

section('the SEQUENCE — parent_id, then the type path');
t('a component inherits through its page chain up to the pattern', async () => {
    const res = await mk().resolve([ROWS[5]]);
    assert.strictEqual(can(res.get('5'), editor, 'edit'), true, 'pattern grant reaches the component');
});
t('a numeric and a text parent_id reach the same ancestor', async () => {
    const res = await mk().resolve([ROWS[5], ROWS[6]]);
    assert.strictEqual(can(res.get('6'), editor, 'edit'), true);
});
t('a component with a leftover data.parent and no column goes up the TYPE path', async () => {
    // i.e. to its pattern, skipping the page the dead pointer names. Deliberate: on an unmigrated
    // app the type path is the fallback, and it is the one that does not lie.
    const stale = { id: 55, type: 'county|component', data: { parent: { id: '4', ref: 'x' } } };
    const res = await createResolver({
        loadByIds: async (ids) => ids.map(i => ({ ...ROWS, 55: stale })[i]).filter(Boolean),
        loadContainers,
    }).resolve([stale]);
    assert.strictEqual(can(res.get('55'), editor, 'edit'), true, 'reaches the pattern');
});
t('a page with NO parent id still reaches its pattern by type path', async () => {
    const res = await mk().resolve([ROWS[3]]);
    assert.strictEqual(can(res.get('3'), editor, 'edit'), true);
});
t('a DANGLING parent id falls through to the type path', async () => {
    const res = await mk().resolve([ROWS[7]]);
    assert.strictEqual(can(res.get('7'), editor, 'edit'), true, 'reaches the pattern despite id 999999');
});

section('truncation — a data error must not become an outage');
t('a cycle truncates and still answers', async () => {
    const warn = console.warn; const seen = [];
    console.warn = (m) => seen.push(String(m));
    try {
        const res = await mk().resolve([ROWS[8]]);
        assert.ok(res.get('8'), 'still returns a merged object');
        assert.ok(seen.some(m => m.includes('cycle')), 'and logs the cycle');
    } finally { console.warn = warn; }
});

section('batching — cost is per depth level, not per row');
t('many rows cost the same number of loads as one', async () => {
    const r1 = mk(); loads = 0; await r1.resolve([ROWS[5]]);
    const one = loads;
    const r2 = mk(); loads = 0; await r2.resolve([ROWS[5], ROWS[6], ROWS[7], ROWS[4], ROWS[3]]);
    assert.ok(loads <= one + 1, `expected ~${one} loads for the batch, got ${loads}`);
});

section('create resolves against the PARENT');
t('a would-be child inherits the parent chain', async () => {
    const merged = await mk().resolveForCreate(ROWS[4]);
    assert.strictEqual(can(merged, editor, 'edit'), true);
});
t('no parent → nothing stated', async () => {
    const merged = await mk().resolveForCreate(null);
    assert.strictEqual(can(merged, editor, 'edit'), false);
});

section('capability probes — running on unmigrated schema');
const { rowAuthCaps, authColumns, _resetCaps } = require('../src/routes/dms/rowAuthCaps');
t('postgres: both columns present', async () => {
    _resetCaps();
    const db = { promise: async () => [{ column_name: 'id' }, { column_name: 'auth' }, { column_name: 'parent_id' }] };
    const caps = await rowAuthCaps(db, 'dms_x');
    assert.deepStrictEqual(caps, { auth: true, parentId: true });
    // the pattern vocabulary needs no column of its own — it lives inside `auth`
    assert.deepStrictEqual(authColumns(caps), ['id', 'type', 'parent_id', 'auth']);
    assert.deepStrictEqual(authColumns(caps, 'sqlite'), ['id', 'type', 'parent_id', 'auth']);
});
t('unmigrated: falls back to selecting data', async () => {
    _resetCaps();
    const db = { promise: async () => [{ column_name: 'id' }, { column_name: 'data' }] };
    const caps = await rowAuthCaps(db, 'dms_y');
    assert.deepStrictEqual(caps, { auth: false, parentId: false });
    assert.ok(authColumns(caps).includes('data'));
});
t('sqlite asks pragma_table_info as a SELECT, not a bare PRAGMA', async () => {
    // A bare `PRAGMA` comes back empty through the adapter (it dispatches on the first word), which
    // this probe would read as "unmigrated" for every sqlite app forever. The real round-trip that
    // would have caught it lives in test-auth-vocabulary.js; this only pins the dialect.
    _resetCaps();
    const db = { promise: async (sql) => /pragma_table_info/.test(sql) && /^SELECT/i.test(sql.trim())
        ? [{ name: 'auth' }]
        : (() => { throw new Error(`wrong dialect: ${sql}`); })() };
    const caps = await rowAuthCaps(db, 'main', 'data_items', 'sqlite');
    assert.strictEqual(caps.auth, true);
});
t('a failing probe means unmigrated, never an error', async () => {
    _resetCaps();
    const warn = console.warn; console.warn = () => {};
    try {
        const db = { promise: async () => { throw new Error('no such table'); } };
        assert.deepStrictEqual(await rowAuthCaps(db, 'dms_z'), { auth: false, parentId: false });
    } finally { console.warn = warn; }
});
t('the probe runs once per table', async () => {
    _resetCaps();
    let probes = 0;
    const db = { promise: async () => { probes++; return [{ column_name: 'auth' }]; } };
    await rowAuthCaps(db, 'dms_w'); await rowAuthCaps(db, 'dms_w'); await rowAuthCaps(db, 'dms_w');
    assert.strictEqual(probes, 1);
});

(async () => {
    for (const [name, fn] of cases) {
        if (!fn) { console.log(`\n${name}`); continue; }
        try { await fn(); pass++; console.log(`  ✓ ${name}`); }
        catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
    }
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
})();
