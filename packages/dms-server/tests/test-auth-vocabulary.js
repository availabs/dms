/**
 * A pattern's declared vocabulary, interpreted by the server — routes/dms/authVocabulary.js and the
 * resolver path that prefers it over the transitional `legacyVerbs.js` shim.
 *
 * Task: planning/tasks/current/row-auth-vocabulary.md.
 *
 * The three rules under test are the hub's:
 *   1. a declared vocabulary WINS over the shim, so a pattern that has declared is already free of it
 *   2. the map applied to an inherited grant belongs to the pattern in the chain of the row being
 *      JUDGED, not the row the grant sits on
 *   3. an undeclared verb confers nothing — same as a missing map, and it fails closed
 *
 * Run: node tests/test-auth-vocabulary.js
 */
const assert = require('assert');
const { vocabularyOf, impliesMaps, expandWithVocabulary } = require('../src/routes/dms/authVocabulary');
const { createResolver, authOf, mapsForChain } = require('../src/routes/dms/rowAuth');
const { can } = require('../src/routes/dms/mergeAuth');

let pass = 0, fail = 0;
const cases = [];
const t = (name, fn) => cases.push([name, fn]);
const section = (name) => cases.push([name, null]);

// A pattern type that shares NO verb with legacyVerbs.js, so every assertion below distinguishes
// "the declaration was read" from "the shim happened to know this word".
const VOCAB = {
    self: [
        { value: 'tune-widget',  label: 'Tune Widget',  implies: ['read', 'edit'] },
        { value: 'bless-widget', label: 'Bless Widget', implies: ['read', 'edit', 'grant'] },
    ],
    descendants: [
        { value: 'peek-gizmo',   label: 'Peek Gizmo',   implies: ['read'] },
        { value: 'forge-gizmo',  label: 'Forge Gizmo',  implies: ['read', 'create'] },
        { value: 'ponder-gizmo', label: 'Ponder Gizmo', implies: [] },     // real verb, no row behind it
    ],
};

section('vocabularyOf — the row carries the declaration');
t('from the auth column, beside the grants', () =>
    assert.deepStrictEqual(vocabularyOf({ auth: { groups: { A: ['x'] }, vocabulary: VOCAB } }), VOCAB));
t('…and the auth column wins over data', () =>
    assert.deepStrictEqual(vocabularyOf({ auth: { vocabulary: VOCAB }, data: { authVocabulary: { self: [] } } }), VOCAB));
t('from a SUBDOMAIN-KEYED auth column — read before the subdomain pick drops siblings', () =>
    assert.deepStrictEqual(vocabularyOf({ auth: { '*': { groups: {} }, sub: { groups: {} }, vocabulary: VOCAB } }), VOCAB));
t('from data.authVocabulary on an unmigrated row', () =>
    assert.deepStrictEqual(vocabularyOf({ data: { authVocabulary: VOCAB } }), VOCAB));
t('from a JSON string auth column (sqlite returns text)', () =>
    assert.deepStrictEqual(vocabularyOf({ auth: JSON.stringify({ vocabulary: VOCAB }) }), VOCAB));
t('from data as a JSON string', () =>
    assert.deepStrictEqual(vocabularyOf({ data: JSON.stringify({ authVocabulary: VOCAB }) }), VOCAB));
t('a row that declares nothing', () => assert.strictEqual(vocabularyOf({ id: 1, type: 'x|page' }), null));
t('garbage is null, never an error', () => {
    assert.strictEqual(vocabularyOf({ auth: 'not json' }), null);
    assert.strictEqual(vocabularyOf({ auth: { vocabulary: [1, 2] } }), null);
    assert.strictEqual(vocabularyOf(null), null);
});
t('a vocabulary in the auth column is NOT read as a grant', () => {
    // `vocabulary` sits beside `groups`/`users`; rawAuthOf must strip it, or a chain could be
    // judged against a principal literally named "vocabulary".
    const ra = require('../src/routes/dms/rowAuth').rawAuthOf;
    assert.deepStrictEqual(ra({ auth: { groups: { A: ['x'] }, vocabulary: VOCAB } }), { groups: { A: ['x'] } });
});
t('a row with ONLY a vocabulary is still unstated — it must not clamp its descendants', () => {
    const { isUnstated } = require('../src/routes/dms/mergeAuth');
    const ra = require('../src/routes/dms/rowAuth').rawAuthOf;
    assert.strictEqual(isUnstated(ra({ auth: { vocabulary: VOCAB } })), true);
});

section('impliesMaps — three maps, and the flat one is the union');
t('self and descendants stay separate', () => {
    const m = impliesMaps(VOCAB);
    assert.deepStrictEqual(m.self['tune-widget'], ['read', 'edit']);
    assert.strictEqual(m.self['peek-gizmo'], undefined);
    assert.deepStrictEqual(m.descendants['peek-gizmo'], ['read']);
    assert.strictEqual(m.descendants['tune-widget'], undefined);
});
t('flat is both, because a flat grant has always meant both', () => {
    const m = impliesMaps(VOCAB);
    assert.deepStrictEqual(m.flat['tune-widget'], ['read', 'edit']);
    assert.deepStrictEqual(m.flat['peek-gizmo'], ['read']);
});
t('a vocabulary declaring nothing usable is null, so the caller falls back', () => {
    assert.strictEqual(impliesMaps({}), null);
    assert.strictEqual(impliesMaps({ self: 'nope' }), null);
    assert.strictEqual(impliesMaps(null), null);
});

section('expandWithVocabulary — scope is enforced, not decorative');
t('a flat grant expands against the union', () => {
    const out = expandWithVocabulary({ groups: { A: ['peek-gizmo'], B: ['tune-widget'] } }, impliesMaps(VOCAB));
    assert.deepStrictEqual(out.groups.A, ['peek-gizmo', 'read']);
    assert.deepStrictEqual(out.groups.B, ['tune-widget', 'read', 'edit']);
});
t('a descendants-only verb confers NOTHING inside a self grant', () => {
    const out = expandWithVocabulary({ self: { groups: { A: ['peek-gizmo'] } } }, impliesMaps(VOCAB));
    assert.deepStrictEqual(out.self.groups.A, ['peek-gizmo']);          // no `read` added
});
t('…and the same verb under descendants does confer', () => {
    const out = expandWithVocabulary({ descendants: { groups: { A: ['peek-gizmo'] } } }, impliesMaps(VOCAB));
    assert.deepStrictEqual(out.descendants.groups.A, ['peek-gizmo', 'read']);
});
t('an UNDECLARED verb confers nothing (rule 3)', () => {
    const out = expandWithVocabulary({ groups: { A: ['invent-a-verb'] } }, impliesMaps(VOCAB));
    assert.deepStrictEqual(out.groups.A, ['invent-a-verb']);
});
t('a declared verb with implies: [] confers nothing, and that is a DECISION not a gap', () => {
    const out = expandWithVocabulary({ groups: { A: ['ponder-gizmo'] } }, impliesMaps(VOCAB));
    assert.deepStrictEqual(out.groups.A, ['ponder-gizmo']);
});
t('`*` is left alone — expanding it would freeze today\'s verb list into the data', () => {
    const out = expandWithVocabulary({ groups: { A: ['*'] } }, impliesMaps(VOCAB));
    assert.deepStrictEqual(out.groups.A, ['*']);
});
t('`otherwise` expands too', () => {
    const out = expandWithVocabulary({ groups: {}, otherwise: ['peek-gizmo'] }, impliesMaps(VOCAB));
    assert.deepStrictEqual(out.otherwise, ['peek-gizmo', 'read']);
});
t('no maps → untouched, never an error', () =>
    assert.deepStrictEqual(expandWithVocabulary({ groups: { A: ['peek-gizmo'] } }, null).groups.A, ['peek-gizmo']));

// --- the resolver path -----------------------------------------------------
//   1 site → 2 pattern (declares VOCAB) → 3 page → 4 component
//   5 pattern (declares NOTHING) → 6 page
const ROWS = {
    1: { id: 1, type: 'prod:site', data: {} },
    2: { id: 2, type: 'prod|widgets:pattern', parent_id: 1,
         data: { authVocabulary: VOCAB, authPermissions: { groups: { Crew: ['peek-gizmo'] } } } },
    3: { id: 3, type: 'widgets|page', parent_id: 2, data: {} },
    4: { id: 4, type: 'widgets|component', parent_id: 3, data: {} },
    5: { id: 5, type: 'prod|legacy:pattern', parent_id: 1,
         data: { authPermissions: { groups: { Crew: ['view-page'] } } } },
    6: { id: 6, type: 'legacy|page', parent_id: 5, data: {} },
};
const loadByIds = async (ids) => ids.map(i => ROWS[i]).filter(Boolean);
const loadContainers = async () => [ROWS[1], ROWS[2], ROWS[5]];
const mk = () => createResolver({ loadByIds, loadContainers });
const crew = { id: 'u1', authed: true, groups: ['Crew'] };

section('mapsForChain — the NEAREST declaring ancestor wins (rule 2)');
t('a chain with one declaring pattern', () => {
    const maps = mapsForChain([ROWS[4], ROWS[3], ROWS[2], ROWS[1]]);
    assert.ok(maps && maps.flat['peek-gizmo']);
});
t('nearest beats higher', () => {
    const near = { id: 9, type: 'x|page', data: { authVocabulary: {
        descendants: [{ value: 'peek-gizmo', implies: ['read', 'edit'] }] } } };
    const maps = mapsForChain([near, ROWS[2], ROWS[1]]);
    assert.deepStrictEqual(maps.flat['peek-gizmo'], ['read', 'edit']);   // the near one, not VOCAB's
});
t('nothing declared → null, and the caller uses the shim', () =>
    assert.strictEqual(mapsForChain([ROWS[6], ROWS[5], ROWS[1]]), null));

section('resolve — the declaration beats the shim (rule 1)');
t('an inherited grant is read in the JUDGED row\'s vocabulary', async () => {
    const merged = await mk().resolve([ROWS[4]]);
    // `peek-gizmo` is a word legacyVerbs.js has never heard of; the component can read only
    // because the pattern in ITS chain declared what the word confers.
    assert.strictEqual(can(merged.get('4'), crew, 'read'), true);
});
t('…and confers nothing it did not declare', async () => {
    const merged = await mk().resolve([ROWS[4]]);
    assert.strictEqual(can(merged.get('4'), crew, 'edit'), false);
    assert.strictEqual(can(merged.get('4'), crew, 'delete'), false);
});
t('an undeclared pattern still falls back to the shim', async () => {
    const merged = await mk().resolve([ROWS[6]]);
    assert.strictEqual(can(merged.get('6'), crew, 'read'), true);        // view-page, via legacyVerbs
});
t('the shim does NOT leak into a chain that declared', async () => {
    // `view-page` means nothing in VOCAB, so a grant using it confers nothing under this pattern —
    // which is the point: the pattern's own declaration is the whole vocabulary, not an addition.
    const rows = { ...ROWS, 2: { ...ROWS[2], data: { authVocabulary: VOCAB,
        authPermissions: { groups: { Crew: ['view-page'] } } } } };
    const r = createResolver({
        loadByIds: async (ids) => ids.map(i => rows[i]).filter(Boolean),
        loadContainers: async () => [rows[1], rows[2], rows[5]],
    });
    const merged = await r.resolve([rows[4]]);
    assert.strictEqual(can(merged.get('4'), crew, 'read'), false);
});
t('removing authVocabulary leaves no structural access, not an error (done-when 2)', async () => {
    const rows = { ...ROWS, 2: { ...ROWS[2], data: { authPermissions: { groups: { Crew: ['peek-gizmo'] } } } } };
    const r = createResolver({
        loadByIds: async (ids) => ids.map(i => rows[i]).filter(Boolean),
        loadContainers: async () => [rows[1], rows[2], rows[5]],
    });
    const merged = await r.resolve([rows[4]]);
    assert.strictEqual(can(merged.get('4'), crew, 'read'), false);       // refused, not thrown
});
t('resolveForCreate uses the chain\'s vocabulary too', async () => {
    const forged = { id: 2, type: 'prod|widgets:pattern', parent_id: 1,
        data: { authVocabulary: VOCAB, authPermissions: { groups: { Crew: ['forge-gizmo'] } } } };
    const r = createResolver({
        loadByIds: async (ids) => ids.map(i => ({ ...ROWS, 2: forged })[i]).filter(Boolean),
        loadContainers: async () => [ROWS[1], forged],
    });
    const merged = await r.resolveForCreate(forged);
    assert.strictEqual(can(merged, crew, 'create'), true);
});

section('authOf — the shim is still the default for an undeclared row');
t('no maps given → legacy expansion', () =>
    assert.deepStrictEqual(authOf(ROWS[5]).groups.Crew, ['view-page', 'read']));
t('maps given → the declaration, and legacy words mean nothing', () =>
    assert.deepStrictEqual(authOf(ROWS[5], '', impliesMaps(VOCAB)).groups.Crew, ['view-page']));

section('the capability probe, against a REAL sqlite database');
t('a migrated sqlite table reports its columns — and the projection carries the vocabulary in `auth`', async () => {
    // Regression. The probe used to issue a bare `PRAGMA table_info(...)`, which the sqlite adapter
    // dispatches with `.run()` rather than `.all()` and so returns NOTHING — every sqlite app read
    // as unmigrated, the projection never engaged, and a stamped vocabulary was only ever found via
    // the `data` fallback. A mocked probe cannot catch that; only a real database can.
    const os = require('os'), path = require('path'), fs = require('fs');
    const { SqliteAdapter } = require('../src/db/adapters/sqlite');
    const { rowAuthCaps, authColumns, _resetCaps } = require('../src/routes/dms/rowAuthCaps');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'row-auth-')), 'probe.sqlite');
    const db = new SqliteAdapter({ type: 'sqlite', role: 'dms', filename: file });
    try {
        await db.promise(`CREATE TABLE probe_items (id INTEGER PRIMARY KEY, type TEXT, data TEXT)`);
        _resetCaps();
        assert.deepStrictEqual(await rowAuthCaps(db, 'main', 'probe_items', 'sqlite'),
            { auth: false, parentId: false });

        await db.promise(`ALTER TABLE probe_items ADD COLUMN auth TEXT`);
        await db.promise(`ALTER TABLE probe_items ADD COLUMN parent_id BIGINT`);
        _resetCaps();
        const caps = await rowAuthCaps(db, 'main', 'probe_items', 'sqlite');
        assert.deepStrictEqual(caps, { auth: true, parentId: true });

        // …and the projection it yields carries the vocabulary without an extra column,
        // because it lives inside `auth`
        await db.promise(`INSERT INTO probe_items (type, auth) VALUES ($1, $2)`,
            ['prod|w:pattern', JSON.stringify({ groups: {}, vocabulary: VOCAB })]);
        const cols = authColumns(caps, 'sqlite');
        assert.ok(!cols.some(c => /auth_vocabulary/.test(c)), 'no separate vocabulary column');
        const rows = await db.promise(`SELECT ${cols.join(', ')} FROM probe_items`);
        assert.ok(!('data' in rows[0]), 'a migrated projection must not select data');
        assert.deepStrictEqual(vocabularyOf(rows[0]), VOCAB);
    } finally {
        await db.end();
        fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
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
