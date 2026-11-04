/**
 * A pattern's declared vocabulary, interpreted by the server — routes/auth/authVocabulary.js. Since
 * 2026-11-03 the declaration is the ONLY answer to what a verb confers: the transitional
 * `legacyVerbs.js` shim that used to answer for undeclared rows is deleted.
 *
 * Task: planning/tasks/current/row-auth-vocabulary.md.
 *
 * The rules under test:
 *   1. a declared vocabulary is read off the row, from `auth` or from `data`
 *   2. `implies` expansion keeps `self` and `descendants` apart, and `flat` is their union
 *   3. an undeclared verb confers nothing — same as a missing map, and it fails closed
 *
 * ⚠ THE CHAIN-RESOLUTION HALF OF THIS SUITE WENT WITH ROW AUTH (2026-11-04): `mapsForChain`,
 * `resolve`, `authOf` and `rawAuthOf` were `rowAuth/rowAuth.js`, which only the row gate read.
 * What is left is the vocabulary itself, which kind auth's field rules read through
 * `verbsForFields`, and the column probe both it and the controller need.
 *
 * Run: node tests/test-auth-vocabulary.js
 */
const assert = require('assert');
const { vocabularyOf, impliesMaps, expandWithVocabulary } = require('../src/routes/auth/authVocabulary');

let pass = 0, fail = 0;
const cases = [];
const t = (name, fn) => cases.push([name, fn]);
const section = (name) => cases.push([name, null]);

// A pattern type whose verbs are its own invention, so every assertion below distinguishes
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
// `rawAuthOf` stripping `vocabulary` out of the `auth` column, and a vocabulary-only row still
// counting as unstated, were tested here. Both lived in the deleted `rowAuth/` tree (2026-11-04).

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
