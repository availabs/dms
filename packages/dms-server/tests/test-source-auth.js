/**
 * Unit tests for per-source permission enforcement (datasets-permissions-model · P4).
 * Pure-logic matrix (no DB) for mergeAuthPermissions + the STRICT server isUserAuthed.
 * Run: node tests/test-source-auth.js
 */
const assert = require('assert');
const { mergeAuthPermissions, isUserAuthed } = require('../src/routes/uda/sourceAuth');

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log(`  ✓ ${name}`); } catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); } };

const anon = {};                                              // not logged in (server adds 'public')
const editor = { authed: true, id: 7, groups: ['NYSDOT'] };
const avail = { authed: true, id: 1, groups: ['AVAIL'] };
const stranger = { authed: true, id: 99, groups: ['Rando'] };

// pattern ⊕ source effective check
const can = (reqPermissions, { user = {}, pattern = {}, source }) =>
    isUserAuthed({ user, reqPermissions, authPermissions: mergeAuthPermissions(pattern, source) });

console.log('mergeAuthPermissions (pattern ⊕ source):');
const pat = { groups: { public: ['view-source'], NYSDOT: ['view-source', 'download-source'] }, users: {} };
t('no override → base', () => assert.deepStrictEqual(mergeAuthPermissions(pat, undefined), pat));
t('source ADDS a group', () => assert.deepStrictEqual(mergeAuthPermissions(pat, { groups: { AVAIL: ['*'] } }).groups.AVAIL, ['*']));
t('source REPLACES a group', () => assert.deepStrictEqual(mergeAuthPermissions(pat, { groups: { NYSDOT: ['*'] } }).groups.NYSDOT, ['*']));
t('source [] DISABLES a group', () => assert.strictEqual(mergeAuthPermissions(pat, { groups: { NYSDOT: [] } }).groups.NYSDOT, undefined));
t('user [] disables / non-empty sets', () => {
    const base = { groups: {}, users: { 5: ['*'] } };
    assert.strictEqual(mergeAuthPermissions(base, { users: { 5: [] } }).users[5], undefined);
    assert.deepStrictEqual(mergeAuthPermissions(base, { users: { 9: ['view-source'] } }).users[9], ['view-source']);
});

console.log('isUserAuthed — STRICT server semantics:');
t('no required perms → allow', () => assert.strictEqual(isUserAuthed({ user: anon, reqPermissions: [], authPermissions: {} }), true));
t('empty/unconfigured → DENY (no "unconfigured ⇒ allow")', () => {
    assert.strictEqual(isUserAuthed({ user: anon, reqPermissions: ['view-source'], authPermissions: {} }), false);
    assert.strictEqual(isUserAuthed({ user: avail, reqPermissions: ['view-source'], authPermissions: { groups: {}, users: {} } }), false);
});
t('logged-in + only-public → DENY beyond public (no client escape hatch)', () => {
    const ap = { groups: { public: ['view-source'] }, users: {} };
    assert.strictEqual(isUserAuthed({ user: editor, reqPermissions: ['update-source'], authPermissions: ap }), false);
    assert.strictEqual(isUserAuthed({ user: editor, reqPermissions: ['view-source'], authPermissions: ap }), true);
});
t('* grants everything', () => assert.strictEqual(isUserAuthed({ user: avail, reqPermissions: ['delete-source'], authPermissions: { groups: { AVAIL: ['*'] } } }), true));
t('user-specific grant', () => assert.strictEqual(isUserAuthed({ user: editor, reqPermissions: ['update-source'], authPermissions: { groups: {}, users: { 7: ['update-source'] } } }), true));

console.log('pattern ⊕ source matrix (migrated source: AVAIL/NYSDOT admin, public capped):');
const pattern = { groups: { public: ['view-source'] }, users: {} };
const source = {
    groups: {
        AVAIL: ['*'],
        NYSDOT: ['view-source', 'download-source', 'update-source', 'create-view', 'manage-downloads'],
        public: ['view-source', 'download-source'],
    },
    users: { 1: ['*'] },
};
t('anon: view✓ download✓ update✗ delete✗', () => {
    assert.strictEqual(can(['view-source'], { user: anon, pattern, source }), true);
    assert.strictEqual(can(['download-source'], { user: anon, pattern, source }), true);
    assert.strictEqual(can(['update-source'], { user: anon, pattern, source }), false);
    assert.strictEqual(can(['delete-source'], { user: anon, pattern, source }), false);
});
t('editor (NYSDOT): update✓ create-view✓ delete✗', () => {
    assert.strictEqual(can(['update-source'], { user: editor, pattern, source }), true);
    assert.strictEqual(can(['create-view'], { user: editor, pattern, source }), true);
    assert.strictEqual(can(['delete-source'], { user: editor, pattern, source }), false);
});
t('AVAIL (*) + user-1 (*): everything✓', () => {
    assert.strictEqual(can(['delete-source'], { user: avail, pattern, source }), true);
    assert.strictEqual(can(['edit-source-permissions'], { user: { authed: true, id: 1, groups: [] }, pattern, source }), true);
});
t('stranger: only public perms (view/download), not update', () => {
    assert.strictEqual(can(['view-source'], { user: stranger, pattern, source }), true);
    assert.strictEqual(can(['update-source'], { user: stranger, pattern, source }), false);
});
t('source [] revokes an inherited pattern grant', () => {
    const p = { groups: { public: ['view-source'], NYSDOT: ['update-source'] }, users: {} };
    const s = { groups: { NYSDOT: [] }, users: {} };
    assert.strictEqual(can(['update-source'], { user: editor, pattern: p, source: s }), false);
});
t('private source (public:[]) hides from anon', () => {
    const s = { groups: { public: [], AVAIL: ['*'] }, users: {} };
    assert.strictEqual(can(['view-source'], { user: anon, pattern, source: s }), false);
    assert.strictEqual(can(['view-source'], { user: avail, pattern, source: s }), true);
});

console.log(`\nsource-auth tests: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
