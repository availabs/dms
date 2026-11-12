/**
 * A pattern's declared vocabulary, interpreted by the server — routes/auth/vocabulary.js. The
 * declaration is the only answer to which verb governs which field.
 *
 * Task: planning/tasks/current/row-auth-vocabulary.md.
 *
 * The rules under test:
 *   1. a declared vocabulary is read off the row, from `auth` or from `data`
 *   2. the field claims keep `self` and `descendants` apart
 *   3. a field nobody claims is reported, never silently granted
 *
 * ⚠ THE CHAIN-RESOLUTION HALF OF THIS SUITE WENT WITH ROW AUTH (2026-11-04): `mapsForChain`,
 * `resolve`, `authOf` and `rawAuthOf` were `rowAuth/rowAuth.js`, which only the row gate read.
 * What is left is the vocabulary itself, which kind auth's field rules read through
 * `verbsForFields`, and the column probe both it and the controller need.
 *
 * Run: node tests/test-auth-vocabulary.js
 */
const assert = require('assert');
const { vocabularyOf, fieldMaps, verbsForFields, publicReadOf } = require('../src/routes/auth/vocabulary');

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
t('from data.authVocabulary, the stamp a create leaves', () =>
    assert.deepStrictEqual(vocabularyOf({ data: { authVocabulary: VOCAB } }), VOCAB));
t('from data as a JSON string', () =>
    assert.deepStrictEqual(vocabularyOf({ data: JSON.stringify({ authVocabulary: VOCAB }) }), VOCAB));
t('an `auth` column is not read — it is retired (new-app-auth-setup-and-db-constraints.md, A1b)', () =>
    assert.strictEqual(vocabularyOf({ auth: { groups: { A: ['x'] }, vocabulary: VOCAB }, data: {} }), null));
t('a row that declares nothing', () => assert.strictEqual(vocabularyOf({ id: 1, type: 'x|page' }), null));
t('garbage is null, never an error', () => {
    assert.strictEqual(vocabularyOf({ data: 'not json' }), null);
    assert.strictEqual(vocabularyOf({ data: { authVocabulary: [1, 2] } }), null);
    assert.strictEqual(vocabularyOf(null), null);
});
// `rawAuthOf` stripping `vocabulary` out of the `auth` column, and a vocabulary-only row still
// counting as unstated, were tested here. Both lived in the deleted `rowAuth/` tree (2026-11-04).

section('fieldMaps / verbsForFields — which verbs an edit needs, read from the declaration');
const FIELDS = {
    self: [
        { value: 'edit-pattern', implies: ['read', 'edit'], fields: ['*'] },
        { value: 'edit-pattern-permissions', implies: ['read', 'edit', 'grant'], fields: ['authPermissions'] },
    ],
    descendants: [
        { value: 'edit-page', implies: ['read', 'edit', 'delete'], fields: ['*', 'filters'] },
        { value: 'edit-page-params', implies: ['read', 'edit'], fields: ['filters'] },
        { value: 'publish-page', implies: ['read', 'edit'], fields: ['sections'], when: [{ field: 'published', notValue: 'draft' }] },
        { value: 'view-page', implies: ['read'] },
    ],
};
t('scopes stay apart: a page edit reads descendants, a pattern edit reads self', () => {
    const m = fieldMaps(FIELDS);
    assert.deepStrictEqual(verbsForFields(['title'], m, {}, 'descendants').groups, [['edit-page']]);
    assert.deepStrictEqual(verbsForFields(['title'], m, {}, 'self').groups, [['edit-pattern']]);
});
t('two fields need a verb EACH; two verbs on one field mean EITHER', () => {
    const m = fieldMaps(FIELDS);
    assert.deepStrictEqual(verbsForFields(['title', 'sections'], m, {}, 'descendants').groups, [['edit-page'], ['publish-page']]);
    assert.deepStrictEqual(verbsForFields(['filters'], m, {}, 'descendants').groups, [['edit-page', 'edit-page-params']]);
});
t('a `when` claim applies only when the write says so (published ≠ draft)', () => {
    const m = fieldMaps(FIELDS);
    assert.deepStrictEqual(verbsForFields(['published'], m, { published: 'live' }, 'descendants').groups, [['publish-page']]);
    assert.deepStrictEqual(verbsForFields(['published'], m, { published: 'draft' }, 'descendants').groups, [['edit-page']]);
});
t('a key nobody claims is reported uncovered; no keys at all means any field verb', () => {
    const m = fieldMaps({ descendants: [{ value: 'tune', implies: [], fields: ['knob'] }] });
    assert.deepStrictEqual(verbsForFields(['other'], m, {}, 'descendants'), { groups: [], covered: [] });
    assert.deepStrictEqual(verbsForFields([], fieldMaps(FIELDS), {}, 'descendants').groups, [['edit-page', 'edit-page-params', 'publish-page']]);
});
t('a vocabulary declaring nothing usable is null, so the caller falls back', () => {
    assert.strictEqual(fieldMaps({}), null);
    assert.strictEqual(fieldMaps({ self: 'nope' }), null);
    assert.strictEqual(fieldMaps(null), null);
    assert.deepStrictEqual(verbsForFields(['x'], null), { groups: [], covered: [] });
});
t('publicReadOf reads the declaration off the row', () => {
    assert.strictEqual(publicReadOf({ data: { authVocabulary: { ...VOCAB, publicRead: true } } }), true);
    assert.strictEqual(publicReadOf({ data: { authVocabulary: VOCAB } }), false);
    assert.strictEqual(publicReadOf({ data: { authVocabulary: { ...VOCAB, publicRead: 'yes' } } }), false);
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
