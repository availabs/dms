/**
 * The auth merge (routes/dms/mergeAuth.js) — the case tables from
 * planning/tasks/current/server-side-auth-general.md (hub).
 *
 * Pure: no database, no fixtures. Run: node tests/test-merge-auth.js
 */
const assert = require('assert');
const { mergeAuthChain, can, isUnstated } = require('../src/routes/auth/rowAuth/mergeAuth');

let pass = 0, fail = 0;
const t = (name, fn) => {
    try { fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};
const G = (o) => ({ groups: o });
const resolve = (...chain) => mergeAuthChain(chain);

const editor = { id: 'u1', authed: true, groups: ['Editors'] };
const admin  = { id: 'u9', authed: true, groups: ['Admins'] };
const member = { id: 'u2', authed: true, groups: ['members'] };
const other  = { id: 'u3', authed: true, groups: ['members'] };
const chanAdmin = { id: 'u4', authed: true, groups: ['chanadmin'] };
const outsider  = { id: 'u7', authed: true, groups: ['Staff'] };
const anon = { id: null, authed: false, groups: [] };

console.log('\nrule 5 — empty is not a denial');
t('a blank chain states nothing', () => assert.ok(isUnstated(resolve({}, {}, {}))));
t('…so the caller applies read-yes/edit-no', () => {
    const m = resolve({}, {}, {});
    assert.strictEqual(can(m, editor, 'edit'), false);
});

console.log('\nrules 1-3 — merge per principal, silence inherits, children only narrow');
t('a child narrows a group wholesale', () => {
    const m = resolve({}, G({ staff: ['read', 'edit'] }), G({ staff: ['read'] }));
    assert.strictEqual(can(m, { id: 'x', groups: ['staff'] }, 'edit'), false);
    assert.strictEqual(can(m, { id: 'x', groups: ['staff'] }, 'read'), true);
});
t('a principal the child does not name keeps its grant', () => {
    const m = resolve({}, G({ staff: ['read'] }), G({ editors: ['read', 'edit'] }));
    assert.strictEqual(can(m, { id: 'x', groups: ['staff'] }, 'read'), true);
});
t('a child cannot widen past a stated ceiling', () => {
    const m = resolve({}, G({ Editors: ['read'] }), G({ Editors: ['read', 'edit'] }));
    assert.strictEqual(can(m, editor, 'edit'), false);
});
t('the FIRST grant in a chain still lands (no ancestor spoke)', () => {
    const m = resolve({}, G({ members: ['read', 'edit'] }));
    assert.strictEqual(can(m, member, 'edit'), true);
});

console.log('\nrule 4 — otherwise closes a set, and clamps public');
const privateChannel = { otherwise: [], groups: { members: ['read'], chanadmin: ['read', 'edit'] } };
t('an outsider cannot read', () => assert.strictEqual(can(resolve({}, G({ members: ['read','edit'], public: ['read'] }), privateChannel), outsider, 'read'), false));
t('a member reads', () => assert.strictEqual(can(resolve({}, G({ members: ['read','edit'] }), privateChannel), member, 'read'), true));
t('a member cannot administer', () => assert.strictEqual(can(resolve({}, G({ members: ['read','edit'] }), privateChannel), member, 'edit'), false));
t('a SEEDED public grant does not punch through otherwise', () => {
    const seeded = { otherwise: [], groups: { public: ['read'], members: ['read'] } };
    const m = resolve({}, G({ members: ['read','edit'], public: ['read'] }), seeded);
    assert.strictEqual(can(m, outsider, 'read'), false);
    assert.strictEqual(can(m, member, 'read'), true);
});
t('an UNNAMED principal is still capped by otherwise', () => {
    // `Staff` is named nowhere, so the channel's `otherwise: []` reaches them.
    const m = resolve({}, G({ members: ['read','edit'] }), privateChannel, {});
    assert.strictEqual(can(m, outsider, 'read'), false);
});
t('a descendant MAY name a principal its ancestors never named', () => {
    // The deliberate trade (mergeAuth.js ceilingFor): without this, `otherwise: []` would make it
    // impossible for any descendant to grant a USER directly — ancestors name groups, not
    // individuals — which breaks "only the author may edit their own message" below.
    // Widening is bounded by needing `grant` on the row to write its auth at all.
    const m = resolve({}, G({ members: ['read','edit'] }), privateChannel, G({ Staff: ['read'] }));
    assert.strictEqual(can(m, outsider, 'read'), true);
});
t('…but a principal an ancestor DID name can still only be narrowed', () => {
    const m = resolve({}, G({ members: ['read'] }), privateChannel, G({ members: ['read','edit'] }));
    assert.strictEqual(can(m, member, 'edit'), false);
});

console.log('\nscope — self vs descendants, split opt-in');
const flat = G({ Editors: ['read', 'edit'] });
t('flat governs this row', () => assert.strictEqual(can(resolve({}, flat), editor, 'edit'), true));
t('flat governs a descendant', () => assert.strictEqual(can(resolve({}, flat, {}), editor, 'edit'), true));
t('flat governs a GRANDchild (3 levels)', () => assert.strictEqual(can(resolve({}, flat, {}, {}), editor, 'edit'), true));
const split = { self: G({ Admins: ['read','edit'] }), descendants: G({ Editors: ['read','edit'] }) };
t('split: editor edits a page', () => assert.strictEqual(can(resolve({}, split, {}), editor, 'edit'), true));
t('split: editor CANNOT edit the pattern row', () => assert.strictEqual(can(resolve({}, split), editor, 'edit'), false));
t('split: admin edits the pattern row', () => assert.strictEqual(can(resolve({}, split), admin, 'edit'), true));
t('split: admin does not reach descendants', () => assert.strictEqual(can(resolve({}, split, {}), admin, 'edit'), false));
t('a page may narrow its own sections mid-chain', () => {
    const lockedPage = { descendants: G({ Editors: ['read'] }) };
    assert.strictEqual(can(resolve({}, split, lockedPage), editor, 'edit'), true,  'the page itself stays editable');
    assert.strictEqual(can(resolve({}, split, lockedPage, {}), editor, 'edit'), false, 'its sections do not');
    assert.strictEqual(can(resolve({}, split, lockedPage, {}), editor, 'read'), true);
});

console.log('\nchat — post vs administer on ONE row');
const channel = {
    self:        { otherwise: [], groups: { chanadmin: ['read','edit'] } },
    descendants: { otherwise: [], groups: { members: ['read','create'], chanadmin: ['read','edit','delete'] } },
};
t('a member may post (create a child)', () => assert.strictEqual(can(resolve({}, channel, {}), member, 'create'), true));
t('a member may not administer the channel', () => assert.strictEqual(can(resolve({}, channel), member, 'edit'), false));
t('an admin administers the channel', () => assert.strictEqual(can(resolve({}, channel), chanAdmin, 'edit'), true));
t('a non-member reads nothing', () => assert.strictEqual(can(resolve({}, channel, {}), outsider, 'read'), false));
t("a message narrowed to its author", () => {
    const msg = G({ members: ['read'], chanadmin: ['read','edit'] });
    msg.users = { u2: ['read','edit'] };
    const m = resolve({}, channel, msg);
    assert.strictEqual(can(m, member, 'edit'), true,  'the author edits their own');
    assert.strictEqual(can(m, other,  'edit'), false, 'another member cannot');
    assert.strictEqual(can(m, other,  'read'), true,  'but still reads it');
});

console.log("\n'*' — all permissions, and it cannot escalate");
t('* grants every structural verb', () => {
    const m = resolve({}, G({ Admins: ['*'] }));
    for (const v of ['read','create','edit','delete','grant']) assert.strictEqual(can(m, admin, v), true, v);
});
t('* flows to descendants', () => assert.strictEqual(can(resolve({}, G({ Admins: ['*'] }), {}, {}), admin, 'delete'), true));
t('* in a CHILD cannot escalate past the parent', () => {
    const m = resolve({}, G({ Editors: ['read'] }), G({ Editors: ['*'] }));
    assert.strictEqual(can(m, editor, 'edit'), false);
    assert.strictEqual(can(m, editor, 'read'), true);
});
t('* is scoped too', () => {
    const s = { self: G({ Admins: ['*'] }), descendants: G({ Editors: ['read'] }) };
    assert.strictEqual(can(resolve({}, s), admin, 'edit'), true);
    assert.strictEqual(can(resolve({}, s, {}), admin, 'edit'), false);
});

console.log('\npattern verbs ride along but are never structural');
t('an unknown verb survives the merge for the client', () => {
    const m = resolve({}, G({ Editors: ['read', 'publish-page'] }));
    assert.strictEqual(can(m, editor, 'publish-page'), true);
    assert.strictEqual(can(m, editor, 'edit'), false, 'and confers no structural access');
});

console.log('\nanonymous callers');
t('anon is in public and gets what public gets', () => {
    assert.strictEqual(can(resolve({}, G({ public: ['read'] })), anon, 'read'), true);
    assert.strictEqual(can(resolve({}, G({ public: ['read'] })), anon, 'edit'), false);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
