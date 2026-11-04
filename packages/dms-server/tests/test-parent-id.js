/**
 * `parent_id` on the way in — routes/dms/parentId.js.
 *
 * The client states a new row's parent; the server validates it. The type system cannot derive it
 * (pages carry no instance name, so nothing names one in a child's type), and a client that could
 * name ANY parent could inherit any parent's grants.
 *
 * Run: node tests/test-parent-id.js
 */
const assert = require('assert');
const { isPlausibleParent, takeParentId, validateParentId,
    refIdsOf, mergeChildRefs, declaredChildKinds,
    planDuplication, repointRefs, stampChildren,
    planRemovedChildren, sweepRemovedChildren, sweepAllChildren } = require('../src/routes/dms/parentId');
const { ownerKindOf, childRefsOf } = require('../src/routes/auth/authVocabulary');

let pass = 0, fail = 0;
const cases = [];
const t = (name, fn) => cases.push([name, fn]);
const section = (name) => cases.push([name, null]);

const CHILD_REFS = { page: { sections: 'component', draft_sections: 'component', history: 'page-edit' } };

section('isPlausibleParent — structural, names no kind');
t('a page may name its pattern (the named container)', () =>
    assert.strictEqual(isPlausibleParent('chenango|page', 'prod|chenango:pattern'), true));
t('a component may name a page in the same pattern (a sibling kind)', () =>
    assert.strictEqual(isPlausibleParent('chenango|component', 'chenango|page'), true));
t('a page-edit may name a page', () =>
    assert.strictEqual(isPlausibleParent('chenango|page-edit', 'chenango|page'), true));
t('a pattern may name the site', () =>
    assert.strictEqual(isPlausibleParent('prod|chenango:pattern', 'prod:site'), true));
t('REFUSES a page in another pattern — the escalation this exists to stop', () =>
    assert.strictEqual(isPlausibleParent('chenango|component', 'wyoming|page'), false));
t('REFUSES another pattern entirely', () =>
    assert.strictEqual(isPlausibleParent('chenango|page', 'prod|wyoming:pattern'), false));
t('a root row names no container', () =>
    assert.strictEqual(isPlausibleParent('prod:site', 'anything|page'), false));

section('…and with a declared owner, the NEAREST parent is required');
t('a component must name its page, NOT its pattern', () => {
    const owner = ownerKindOf(CHILD_REFS, 'component');
    assert.strictEqual(owner, 'page');
    assert.strictEqual(isPlausibleParent('chenango|component', 'chenango|page', owner), true);
    // structurally valid — the pattern IS in the component's type path — but it skips a level of
    // inheritance, so a restricted page would stop restricting its own sections.
    assert.strictEqual(isPlausibleParent('chenango|component', 'prod|chenango:pattern', owner), false);
});
t('a page-edit must name its page', () =>
    assert.strictEqual(isPlausibleParent('chenango|page-edit', 'prod|chenango:pattern', 'page'), false));
t('a kind nothing owns keeps the structural rule', () => {
    assert.strictEqual(ownerKindOf(CHILD_REFS, 'page'), null);
    assert.strictEqual(isPlausibleParent('chenango|page', 'prod|chenango:pattern', null), true);
});

section('takeParentId — lifted out of data, never stored twice');
t('removes the key and returns the id', () => {
    const { data, claimed } = takeParentId({ title: 'x', parent_id: 42 });
    assert.deepStrictEqual(data, { title: 'x' });
    assert.strictEqual(claimed, '42');
});
t('parses a JSON string payload', () => {
    const { data, claimed } = takeParentId(JSON.stringify({ title: 'x', parent_id: '7' }));
    assert.deepStrictEqual(data, { title: 'x' });
    assert.strictEqual(claimed, '7');
});
t('absent, null and non-numeric all mean "no claim"', () => {
    assert.strictEqual(takeParentId({ title: 'x' }).claimed, null);
    assert.strictEqual(takeParentId({ parent_id: null }).claimed, null);
    assert.strictEqual(takeParentId({ parent_id: 'abc' }).claimed, null);
    assert.strictEqual(takeParentId({ parent_id: '1; DROP TABLE' }).claimed, null);
});
t('leaves data untouched when there is no claim', () =>
    assert.deepStrictEqual(takeParentId({ title: 'x' }).data, { title: 'x' }));

section('validateParentId — drops, never throws');
const quiet = (fn) => async () => { const w = console.warn; console.warn = () => {}; try { await fn(); } finally { console.warn = w; } };
t('accepts a valid parent', async () => assert.strictEqual(
    await validateParentId('5', { app: 'a', type: 'chenango|component', ownerKind: 'page',
        loadType: async () => ({ app: 'a', type: 'chenango|page' }) }), '5'));
t('a parent that does not exist is dropped, not thrown', quiet(async () => assert.strictEqual(
    await validateParentId('5', { app: 'a', type: 'chenango|component', loadType: async () => null }), null)));
t('a parent in another APP is dropped', quiet(async () => assert.strictEqual(
    await validateParentId('5', { app: 'a', type: 'chenango|component',
        loadType: async () => ({ app: 'other', type: 'chenango|page' }) }), null)));
t('a parent in another PATTERN is dropped', quiet(async () => assert.strictEqual(
    await validateParentId('5', { app: 'a', type: 'chenango|component',
        loadType: async () => ({ app: 'a', type: 'wyoming|page' }) }), null)));
t('the pattern, when a page is the declared owner, is dropped', quiet(async () => assert.strictEqual(
    await validateParentId('5', { app: 'a', type: 'chenango|component', ownerKind: 'page',
        loadType: async () => ({ app: 'a', type: 'prod|chenango:pattern' }) }), null)));
t('a failing lookup is dropped, not thrown', quiet(async () => assert.strictEqual(
    await validateParentId('5', { app: 'a', type: 'chenango|component',
        loadType: async () => { throw new Error('db down'); } }), null)));

section('childRefsOf — the declaration reaches the server by the same chain as the vocabulary');
t('from the auth column', () =>
    assert.deepStrictEqual(childRefsOf({ auth: { childRefs: CHILD_REFS } }), CHILD_REFS));
t('from data on an unmigrated row', () =>
    assert.deepStrictEqual(childRefsOf({ data: { childRefs: CHILD_REFS } }), CHILD_REFS));
t('absent is null, and the structural rule stands alone', () =>
    assert.strictEqual(childRefsOf({ auth: { groups: {} } }), null));

section('refIdsOf — reading a declared reference array');
t('the production encoding: objects carrying id and ref', () =>
    assert.deepStrictEqual(refIdsOf([{ id: '2231673', ref: 'mitigat-ny-prod+x|component' }, { id: '2231674' }]),
        ['2231673', '2231674']));
t('`ref` is IGNORED — it names the app the row was written under', () =>
    // Every element on the rowauth-test clone still says `mitigat-ny-prod+…`. Trusting it would
    // have dropped all 33,342 components; the id is checked against the table instead.
    assert.deepStrictEqual(refIdsOf([{ id: '7', ref: 'some-other-app+whatever' }]), ['7']));
t('bare ids are accepted', () => assert.deepStrictEqual(refIdsOf(['12', 13]), ['12', '13']));
t('a JSON string parses', () => assert.deepStrictEqual(refIdsOf('[{"id":"9"}]'), ['9']));
t('junk elements are skipped, not thrown on', () =>
    assert.deepStrictEqual(refIdsOf([null, {}, { id: '' }, { id: 'abc' }, { id: '4' }]), ['4']));
t('nothing is empty', () => {
    assert.deepStrictEqual(refIdsOf(null), []);
    assert.deepStrictEqual(refIdsOf(undefined), []);
    assert.deepStrictEqual(refIdsOf(''), []);
    assert.deepStrictEqual(refIdsOf({}), [], 'an object with no id names nothing');
    assert.deepStrictEqual(refIdsOf('abc'), [], 'a non-numeric string is not an id');
});
// A reference attribute may be SINGLE-valued. `updateDMSAttrs` stores one as a bare `{ref, id}`
// object (its `Array.isArray(...) ? refs : refs?.[0]` branch), and the datasets pattern points at
// its env with a bare number (`dmsEnvId`). Both name a row, so both are reference attributes; only
// the arity differs. Changed 2026-10-29 — before it, a scalar childRef stamped nothing.
t('a single id names one row', () => {
    assert.deepStrictEqual(refIdsOf(1676363), ['1676363']);
    assert.deepStrictEqual(refIdsOf('1676363'), ['1676363']);
});
t('a single {id, ref} object names one row', () =>
    assert.deepStrictEqual(refIdsOf({ id: '1', ref: 'app+type' }), ['1']));

section('mergeChildRefs — one map per KIND, merged across every pattern in the app');
const decl = (id, childRefs) => ({ id, type: `prod|p${id}:pattern`, childRefs });
t('agreeing patterns merge into one declaration', () => {
    const { byOwnerKind, conflicts } = mergeChildRefs([decl(1, CHILD_REFS), decl(2, CHILD_REFS)]);
    assert.deepStrictEqual(byOwnerKind, CHILD_REFS);
    assert.deepStrictEqual(conflicts, []);
});
t('a kind declared by ONE pattern still covers rows whose pattern row is gone', () => {
    // 22,790 of the clone's 33,342 components sit under a deleted pattern. Reading the declaration
    // per instance would leave every one of them unparented; this is why it is merged by kind.
    const { byOwnerKind } = mergeChildRefs([decl(1, CHILD_REFS)]);
    assert.strictEqual(byOwnerKind.page.sections, 'component');
});
t('patterns that disagree about one attribute: it is DROPPED and reported', () => {
    const { byOwnerKind, conflicts } = mergeChildRefs([
        decl(1, { page: { sections: 'component', history: 'page-edit' } }),
        decl(2, { page: { sections: 'widget', history: 'page-edit' } }),
    ]);
    assert.strictEqual(byOwnerKind.page.sections, undefined, 'no app-wide answer — never guessed');
    assert.strictEqual(byOwnerKind.page.history, 'page-edit', 'the attributes that agree survive');
    assert.strictEqual(conflicts.length, 1);
    assert.deepStrictEqual(conflicts[0].rows, [1, 2], 'the report names both rows');
});
t('undeclared and malformed rows contribute nothing', () =>
    assert.deepStrictEqual(mergeChildRefs([decl(1, null), decl(2, []), decl(3, { page: 'nope' }),
        { id: 4 }, null]).byOwnerKind, {}));

section('declaredChildKinds — the kinds the type path must NOT guess for');
t('component and page-edit are withheld from pass 4', () => {
    const kinds = declaredChildKinds(mergeChildRefs([decl(1, CHILD_REFS)]).byOwnerKind);
    assert.ok(kinds.has('component'), 'a component with no page stays NULL rather than taking its pattern');
    assert.ok(kinds.has('page-edit'));
});
t('a page is NOT withheld — its pattern IS its parent, and the type path names it', () =>
    assert.strictEqual(declaredChildKinds(mergeChildRefs([decl(1, CHILD_REFS)]).byOwnerKind).has('page'), false));
t('nothing declared withholds nothing', () =>
    assert.strictEqual(declaredChildKinds({}).size, 0));

section('planDuplication — two owners, one column: duplicate rather than guess');
// `mitigateny_chenango` pages 2546068 (Wind) and 2546044 (Lightning) list the SAME component rows
// in `draft_sections` — a page duplicated by sharing ids instead of cloning them, so editing one
// section edited both. 72 such components on the clone.
const LIGHTNING = '2546044', WIND = '2546068', SECTION = '2547037';
const TYPES = { [SECTION]: 'chenango|component', [LIGHTNING]: 'chenango|page', [WIND]: 'chenango|page',
    other: 'wyoming|page', pat: 'prod|chenango:pattern' };
const ctx = { childType: (c) => TYPES[c], ownerType: (o) => TYPES[o], byOwnerKind: CHILD_REFS };
const twoOwners = () => new Map([[SECTION, new Map([
    [WIND,      { ownerKind: 'page', attrs: ['draft_sections'] }],
    [LIGHTNING, { ownerKind: 'page', attrs: ['draft_sections'] }],
])]]);

t('the LOWEST-id owner keeps the original, the other gets a copy', () => {
    const { keepers, copies } = planDuplication(twoOwners(), ctx);
    assert.strictEqual(keepers.get(SECTION), LIGHTNING);
    assert.deepStrictEqual(copies, [{ child: SECTION, owner: WIND, ownerKind: 'page', attrs: ['draft_sections'] }]);
});
t('the choice is STABLE — insertion order must not decide it, or a second run duplicates again', () => {
    const reversed = new Map([[SECTION, new Map([
        [LIGHTNING, { ownerKind: 'page', attrs: ['draft_sections'] }],
        [WIND,      { ownerKind: 'page', attrs: ['draft_sections'] }],
    ])]]);
    assert.strictEqual(planDuplication(reversed, ctx).keepers.get(SECTION), LIGHTNING);
});
t('ids are compared as NUMBERS, not strings', () => {
    const T2 = { c: 'chenango|component', 9: 'chenango|page', 100: 'chenango|page' };
    const { keepers } = planDuplication(
        new Map([['c', new Map([['100', { ownerKind: 'page', attrs: ['sections'] }],
                                ['9',   { ownerKind: 'page', attrs: ['sections'] }]])]]),
        { childType: (c) => T2[c], ownerType: (o) => T2[o], byOwnerKind: CHILD_REFS });
    assert.strictEqual(keepers.get('c'), '9', '"100" sorts before "9" as text');
});
t('an owner in another pattern is not a parent and earns no copy', () => {
    const { keepers, copies } = planDuplication(new Map([[SECTION, new Map([
        [LIGHTNING, { ownerKind: 'page', attrs: ['sections'] }],
        ['other',   { ownerKind: 'page', attrs: ['sections'] }],
    ])]]), ctx);
    assert.strictEqual(keepers.get(SECTION), LIGHTNING);
    assert.deepStrictEqual(copies, [], 'the cross-pattern claim is dropped, not cloned');
});
t('one valid owner after the check → no copy at all', () => {
    const { copies, rejected } = planDuplication(new Map([[SECTION, new Map([
        [LIGHTNING, { ownerKind: 'page', attrs: ['sections'] }],
        ['pat',     { ownerKind: 'page', attrs: ['sections'] }],   // a pattern is not a page
    ])]]), ctx);
    assert.deepStrictEqual(copies, []);
    assert.deepStrictEqual(rejected, []);
});
t('no valid owner at all is REJECTED, never duplicated', () => {
    const { keepers, copies, rejected } = planDuplication(new Map([[SECTION, new Map([
        ['other', { ownerKind: 'page', attrs: ['sections'] }],
    ])]]), ctx);
    assert.strictEqual(keepers.size, 0);
    assert.deepStrictEqual(copies, []);
    assert.deepStrictEqual(rejected, [SECTION]);
});
t('attrs may be a Set — the migration keeps one, and a Set has no .some()', () => {
    const asSet = new Map([[SECTION, new Map([
        [WIND,      { ownerKind: 'page', attrs: new Set(['draft_sections']) }],
        [LIGHTNING, { ownerKind: 'page', attrs: new Set(['draft_sections']) }],
    ])]]);
    const { keepers, copies } = planDuplication(asSet, ctx);
    assert.strictEqual(keepers.get(SECTION), LIGHTNING);
    assert.deepStrictEqual(copies[0].attrs, ['draft_sections'], 'and it comes back as an array');
});
t('three owners → two copies', () => {
    const three = new Map([[SECTION, new Map([
        [WIND,      { ownerKind: 'page', attrs: ['sections'] }],
        ['2546099', { ownerKind: 'page', attrs: ['sections'] }],
        [LIGHTNING, { ownerKind: 'page', attrs: ['sections'] }],
    ])]]);
    const { copies } = planDuplication(three, { ...ctx, ownerType: (o) => TYPES[o] || 'chenango|page' });
    assert.deepStrictEqual(copies.map(c => c.owner), [WIND, '2546099']);
});

section('repointRefs — the owner that got a copy now names the copy');
t('replaces the id and KEEPS the rest of the element', () =>
    assert.deepStrictEqual(
        repointRefs([{ id: '1', ref: 'app+t' }, { id: '2', ref: 'app+t' }], new Map([['1', '900']])),
        [{ id: '900', ref: 'app+t' }, { id: '2', ref: 'app+t' }]));
t('order is preserved — it is the page rendering order', () =>
    assert.deepStrictEqual(
        repointRefs([{ id: '3' }, { id: '1' }, { id: '2' }], new Map([['1', '900'], ['2', '901']]))
            .map(e => e.id),
        ['3', '900', '901']));
t('bare ids too', () =>
    assert.deepStrictEqual(repointRefs(['1', '2'], new Map([['2', '9']])), ['1', '9']));
t('nothing to swap returns null, so no write is issued', () => {
    assert.strictEqual(repointRefs([{ id: '5' }], new Map([['1', '9']])), null);
    assert.strictEqual(repointRefs([{ id: '5' }], new Map()), null);
    assert.strictEqual(repointRefs(null, new Map([['1', '9']])), null);
});
t('a JSON string parses', () =>
    assert.deepStrictEqual(repointRefs('[{"id":"1"}]', new Map([['1', '9']])), [{ id: '9' }]));

section('stampChildren — the parent names its children (the inverse of the check)');
// A recording executor: these cases are about WHICH statement is issued, which is where the
// security bound lives. The round trip is covered end to end in test-parent-stamp.js.
const recorder = () => { const q = []; return { q, promise: async (sql, params) => (q.push({ sql, params }), []) }; };
const stamp = async (over = {}) => {
    const tx = recorder();
    const n = await stampChildren(tx, {
        table: 't', app: 'a', id: '100', type: 'chenango|page',
        data: { sections: [{ id: '1' }, { id: '2' }] }, childRefs: CHILD_REFS, ...over,
    });
    return { tx, n };
};

t('one statement per NAMED attribute', async () => {
    const { tx } = await stamp();
    assert.strictEqual(tx.q.length, 1, 'draft_sections and history are absent from this write');
});
// TWO type params, not one. `{parent}:{instance}|{kind}` lets the instance be omitted, so a child
// kind is either `chenango|component` (page, component, page-edit) or `prod|test_env:dmsenv`
// (dmsenv, source, view, pattern). An exact `=` matched only the first, so a declaration naming an
// INSTANCED child kind stamped nothing at all — silently, since a statement matching no rows is not
// an error. Found 2026-10-29 by tests/test-row-auth-uda.js.
//
// The bound on capture is unchanged: both forms pin the CONTAINER and the KIND. Relaxing to a bare
// kind match would let a page capture a component in ANOTHER pattern by putting its id in
// `sections`, handing it that page's grants — that is still impossible.
t('the predicate pins container AND kind, in both type shapes', async () => {
    const { tx } = await stamp();
    assert.ok(/type = \$5 OR type LIKE \$6 ESCAPE/.test(tx.q[0].sql), tx.q[0].sql);  // $3,$4 are ids
    assert.deepStrictEqual(tx.q[0].params.slice(-2), ['chenango|component', 'chenango|%:component']);
    assert.ok(!/LIKE '%/.test(tx.q[0].sql), 'the only wildcard is the instance segment');
    assert.deepStrictEqual(tx.q[0].params.slice(0, 4), ['100', 'a', '1', '2']);
});
t('it never clears — only rows whose parent differs are touched', async () => {
    const { tx } = await stamp();
    assert.ok(/parent_id IS NULL OR parent_id <> \$1/.test(tx.q[0].sql), tx.q[0].sql);
    assert.ok(!/SET parent_id = NULL/.test(tx.q[0].sql));
});
t('an attribute absent from the patch is not touched', async () => {
    const { tx } = await stamp({ data: { title: 'renamed' } });
    assert.strictEqual(tx.q.length, 0, 'a title-only edit must not rewrite every section');
});
t('two named attributes, two statements', async () => {
    const { tx } = await stamp({ data: { sections: [{ id: '1' }], draft_sections: [{ id: '2' }] } });
    assert.strictEqual(tx.q.length, 2);
});
t('a row whose kind owns nothing issues no statement', async () => {
    const { tx, n } = await stamp({ type: 'chenango|component' });
    assert.strictEqual(tx.q.length, 0);
    assert.strictEqual(n, 0);
});
t('no declaration, no statement', async () => {
    const { tx } = await stamp({ childRefs: null });
    assert.strictEqual(tx.q.length, 0);
});
t('a root row (no container) is skipped', async () => {
    const { tx } = await stamp({ type: 'prod:site' });
    assert.strictEqual(tx.q.length, 0);
});
t('junk ids are dropped and duplicates collapse', async () => {
    const { tx } = await stamp({ data: { sections: [{ id: '1' }, { id: '1' }, { id: 'x' }, null] } });
    assert.deepStrictEqual(tx.q[0].params.slice(2, -2), ['1']);
});
t('a JSON-string payload parses', async () => {
    const { tx } = await stamp({ data: JSON.stringify({ sections: [{ id: '7' }] }) });
    assert.deepStrictEqual(tx.q[0].params.slice(2, -2), ['7']);
});
t('over 500 children chunks, so no statement grows unbounded', async () => {
    const many = Array.from({ length: 1201 }, (_, i) => ({ id: String(i + 1) }));
    const { tx } = await stamp({ data: { sections: many } });
    assert.strictEqual(tx.q.length, 3);
    assert.strictEqual(tx.q[0].params.length, 504, '100, app, 500 ids, 2 type params');
});

section('planRemovedChildren — a DIFFERENCE, never "nothing names it"');
const plan = (before, after, type = 'chenango|page') =>
    planRemovedChildren(before, after, { type, childRefs: CHILD_REFS });

t('an id the new arrays no longer name is a removal', () =>
    assert.deepStrictEqual(
        plan({ sections: [{ id: '1' }, { id: '2' }] }, { sections: [{ id: '1' }] }),
        [{ childKind: 'component', ids: ['2'] }]));
t('a row that MOVED between two attributes of the same kind is NOT a removal', () =>
    assert.deepStrictEqual(
        plan({ draft_sections: [{ id: '9' }], sections: [] }, { draft_sections: [], sections: [{ id: '9' }] }),
        []));
t('publish: the previous published set is removed, the draft set is not', () => {
    const before = { sections: [{ id: '10' }, { id: '11' }], draft_sections: [{ id: '20' }, { id: '21' }] };
    const after  = { sections: [{ id: '30' }, { id: '31' }], draft_sections: [{ id: '20' }, { id: '21' }] };
    assert.deepStrictEqual(plan(before, after), [{ childKind: 'component', ids: ['10', '11'] }]);
});
t('emptying an array removes everything it held', () =>
    assert.deepStrictEqual(plan({ sections: [{ id: '5' }] }, { sections: [] }),
        [{ childKind: 'component', ids: ['5'] }]));
t('an attribute the merged row still carries removes nothing', () =>
    assert.deepStrictEqual(plan({ sections: [{ id: '1' }] }, { sections: [{ id: '1' }], title: 'new' }), []));
t('kinds are kept apart — a page-edit id never cancels a component id', () => {
    const out = plan({ sections: [{ id: '1' }], history: [{ id: '1' }] },
                     { sections: [{ id: '1' }], history: [] });
    assert.deepStrictEqual(out, [{ childKind: 'page-edit', ids: ['1'] }]);
});
t('an unparseable AFTER means "cannot tell", never "everything went"', () =>
    assert.deepStrictEqual(plan({ sections: [{ id: '1' }] }, 'not json at all'), []));
t('a null AFTER is a deletion of the owner: everything it named is removed', () =>
    assert.deepStrictEqual(plan({ sections: [{ id: '1' }] }, null),
        [{ childKind: 'component', ids: ['1'] }]));
t('a kind that owns nothing plans nothing', () =>
    assert.deepStrictEqual(plan({ sections: [{ id: '1' }] }, {}, 'chenango|component'), []));
t('JSON-string states parse', () =>
    assert.deepStrictEqual(
        plan(JSON.stringify({ sections: [{ id: '1' }] }), JSON.stringify({ sections: [] })),
        [{ childKind: 'component', ids: ['1'] }]));

section('sweepRemovedChildren — the statement it builds');
const sweep = async (over = {}) => {
    const tx = recorder();
    const res = await sweepRemovedChildren(tx, {
        table: 'T', app: 'myapp', id: '100', type: 'chenango|page',
        removed: [{ childKind: 'component', ids: ['1', '2'] }], mode: 'delete', ...over,
    });
    return { tx, res };
};
t('delete mode issues a DELETE', async () => {
    const { tx } = await sweep();
    assert.ok(/^DELETE FROM T/.test(tx.q[0].sql.trim()));
});
t('log mode issues a SELECT and deletes nothing', async () => {
    const { tx } = await sweep({ mode: 'log' });
    assert.strictEqual(tx.q.length, 1);
    assert.ok(/^SELECT id FROM T/.test(tx.q[0].sql.trim()), tx.q[0].sql);
    assert.ok(!/DELETE/.test(tx.q[0].sql));
});
t('off mode issues nothing at all', async () => {
    const { tx, res } = await sweep({ mode: 'off' });
    assert.strictEqual(tx.q.length, 0);
    assert.strictEqual(res.swept, 0);
});
t('parent_id = the owner is in the predicate — the safety bound', async () => {
    const { tx } = await sweep();
    assert.ok(/parent_id = \$2/.test(tx.q[0].sql), tx.q[0].sql);
    assert.strictEqual(tx.q[0].params[1], '100');
});
t('the predicate pins container AND kind, in both type shapes', async () => {
    const { tx } = await sweep();
    assert.deepStrictEqual(tx.q[0].params.slice(-2), ['chenango|component', 'chenango|%:component']);
    assert.ok(!/LIKE '%/.test(tx.q[0].sql), 'the only wildcard is the instance segment');
});
t('nothing removed, nothing issued', async () => {
    const { tx } = await sweep({ removed: [] });
    assert.strictEqual(tx.q.length, 0);
});
t('a root row (no container) is skipped', async () => {
    const { tx } = await sweep({ type: 'prod:site' });
    assert.strictEqual(tx.q.length, 0);
});
t('over 500 removals chunks', async () => {
    const ids = Array.from({ length: 1201 }, (_, i) => String(i + 1));
    const { tx } = await sweep({ removed: [{ childKind: 'component', ids }] });
    assert.strictEqual(tx.q.length, 3);
    assert.strictEqual(tx.q[0].params.length, 504, 'app, owner, 500 ids, 2 type params');
});

section('sweepAllChildren — when the owner itself is deleted');
const sweepAll = async (over = {}) => {
    const tx = recorder();
    const res = await sweepAllChildren(tx, {
        table: 'T', app: 'myapp', id: '100', type: 'chenango|page',
        childRefs: CHILD_REFS, mode: 'delete', ...over,
    });
    return { tx, res };
};
t('one statement, bounded by parent_id and the DECLARED child types', async () => {
    const { tx } = await sweepAll();
    assert.strictEqual(tx.q.length, 1);
    assert.ok(/parent_id = \$2/.test(tx.q[0].sql));
    assert.deepStrictEqual(tx.q[0].params.slice(2).sort(),
        ['chenango|%:component', 'chenango|%:page-edit', 'chenango|component', 'chenango|page-edit']);
});
t('it does not need the owner\'s arrays — a row the arrays lost is still swept', async () => {
    const { tx } = await sweepAll();
    assert.ok(!/sections/.test(tx.q[0].sql));
});
t('log mode selects', async () => {
    const { tx } = await sweepAll({ mode: 'log' });
    assert.ok(/^SELECT id FROM T/.test(tx.q[0].sql.trim()));
});
t('off mode issues nothing', async () => {
    const { tx } = await sweepAll({ mode: 'off' });
    assert.strictEqual(tx.q.length, 0);
});
t('a kind that owns nothing issues nothing', async () => {
    const { tx } = await sweepAll({ type: 'chenango|component' });
    assert.strictEqual(tx.q.length, 0);
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
