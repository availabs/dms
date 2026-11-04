/**
 * The row write judge's own contract — routes/dms/rowAuthGate.js `createRowJudge`.
 *
 * This is what ROW auth is supposed to do, asserted positively. Its counterpart is
 * `test-row-auth-diff.js`, which checks what row auth gives up relative to KIND auth; neither
 * replaces the other, and a green run here says nothing about the other.
 *
 * Section 1 is WHAT A CREATE IS JUDGED AGAINST. A create has no row of its own, so it inherits the chain
 * of whatever will contain it — the `parent_id` the client claims, else the container its type
 * names. That makes the claim security-relevant: it chooses the chain the verdict comes from.
 *
 * `validateParentId` already checks a claim, but it runs in `createData`, AFTER the write guard has
 * allowed or refused. Judging an unvalidated claim therefore lets the CALLER PICK THE CHAIN — name
 * any row in the app with loose grants, be judged against it, and the create succeeds even though
 * the claim is then dropped and the row ends up with no parent at all. `parentRowFor` runs the same
 * plausibility check first; these cases pin that.
 *
 * Fixtures only, no database: the judge takes a controller, so a fake one is the whole harness.
 *
 * Run: node tests/test-row-auth-writes.js
 */
const assert = require('assert');
const { createRowJudge } = require('../src/routes/auth/rowAuth/rowAuthGate');
const { getKind } = require('../src/db/type-utils.js');

let pass = 0, fail = 0;
const cases = [];
const t = (name, fn) => cases.push([name, fn]);
const section = (name) => cases.push([name, null]);

const APP = 'myapp';

// Two containers. Nothing above a page mentions `Editors`, so a page may grant them `create`
// (merge rule 3 clamps a child only where an ancestor HAS SPOKEN for that principal — see the
// `the clamp` section at the end, which is why the grants are arranged this way and not another).
// The containers therefore refuse `Editors`, which is what makes a wrongly-accepted claim visible
// as an allow.
const ROWS = {
  1: { id: 1, type: 'prod:site',           auth: { groups: { Admins: ['read'] } } },
  2: { id: 2, type: 'prod|docs:pattern',   parent_id: 1, auth: { groups: { Admins: ['read'] } } },
  3: { id: 3, type: 'docs|page',           parent_id: 2, auth: { groups: { Editors: ['read', 'create'] } } },
  // Deliberately permissive rows — the prizes a claim would reach for. One is in another container,
  // one is the wrong KIND inside this one.
  4: { id: 4, type: 'docs|component',      parent_id: 3, auth: { groups: { public: ['*'] } } },
  6: { id: 6, type: 'prod|other:pattern',  parent_id: 1, auth: { groups: { Admins: ['read'] } } },
  7: { id: 7, type: 'other|page',          parent_id: 6, auth: { groups: { public: ['*'] } } },
};

const controller = {
  authRowsByIds: async (ids) => ids.map((i) => ROWS[i]).filter(Boolean),
  authContainers: async () => [ROWS[1], ROWS[2], ROWS[6]],
  getPatternRows: async () => [],
  // The page pattern declares that a component's owner is a page.
  ownerKindForType: async (_app, type) => (getKind(type) === 'component' ? 'page' : null),
};

const editor = { authed: true, id: 'u1', groups: ['Editors'] };

const create = (claim, { user = editor, type = 'docs|component' } = {}) => {
  const judge = createRowJudge({ app: APP, user, controller });
  const data = claim === undefined ? { title: 'x' } : { title: 'x', parent_id: claim };
  return judge('create', { app: APP, type, data }, data);
};

process.env.DMS_AUTH_MODE = 'enforce';

section('a create is judged against the claimed parent — when the claim is plausible');
t('claiming its real page uses the PAGE chain, which grants create', async () =>
  assert.strictEqual((await create('3')).allow, true));
t('no claim at all falls back to the container, which does not', async () =>
  assert.strictEqual((await create(undefined)).allow, false));

section('an implausible claim must not choose the chain');
t('a row in ANOTHER container is refused, not judged against its public:* grant', async () => {
  const d = await create('7');
  assert.strictEqual(d.allow, false, 'other|page granted public:* — claiming it must not help');
});
t('that same row IS permissive, so the test would pass trivially without the check', async () => {
  // Judged directly, row 7's chain allows anyone. This is the escalation being denied above.
  const judge = createRowJudge({ app: APP, user: { authed: true, id: 'nobody', groups: [] }, controller });
  assert.strictEqual((await judge('edit', ROWS[7], {}, ['title'])).allow, true);
});
t('a sibling COMPONENT is refused — the declared owner kind is page', async () =>
  assert.strictEqual((await create('4')).allow, false));
t('…and it too is permissive, so that refusal is doing work', async () => {
  const judge = createRowJudge({ app: APP, user: { authed: true, id: 'nobody', groups: [] }, controller });
  assert.strictEqual((await judge('edit', ROWS[4], {}, ['title'])).allow, true);
});
t('the SITE row is refused — it is not this type\'s container', async () =>
  assert.strictEqual((await create('1')).allow, false));
t('a claim naming a row that does not exist falls back', async () =>
  assert.strictEqual((await create('999')).allow, false));
t('a junk claim falls back', async () =>
  assert.strictEqual((await create('not-a-number')).allow, false));

section('the fallback is the container, not an error and not an allow');
t('a page create is judged against its pattern', async () => {
  const d = await create(undefined, { type: 'docs|page' });
  assert.strictEqual(d.allow, false, 'docs grants read only');
});
t('a root row with no container is judged against nothing and refused', async () => {
  const d = await create(undefined, { type: 'prod:site' });
  assert.strictEqual(d.allow, false);
});

section('the clamp — why a page-level `create` grant is not always available');
// Merge rule 3: a child may only narrow, and only where an ancestor has spoken for that principal.
// So "claim parent_id so the PAGE's grants govern the create" works only while nothing above the
// page has already spoken for that principal. A pattern granting `Editors: [edit-page]` (read+edit,
// no create) makes a page-level `create` for Editors unreachable — the page cannot widen it back.
// This is a real limit on using the claim to express "may add sections here", not a defect.
t('a pattern silent on the principal lets the page grant create', async () =>
  assert.strictEqual((await create('3')).allow, true));
t('a pattern that has spoken for the principal clamps the page\'s create away', async () => {
  const spoken = { ...ROWS, 2: { ...ROWS[2], auth: { groups: { Editors: ['read', 'edit'] } } } };
  const judge = createRowJudge({
    app: APP, user: editor,
    controller: { ...controller,
      authRowsByIds: async (ids) => ids.map((i) => spoken[i]).filter(Boolean),
      authContainers: async () => [spoken[1], spoken[2], spoken[6]] },
  });
  const data = { title: 'x', parent_id: '3' };
  assert.strictEqual((await judge('create', { app: APP, type: 'docs|component', data }, data)).allow, false);
});

section('the defaults — the hub\'s "strict defaults", which is where most of the kind-auth diff is');
const judgeOf = (user, rows = ROWS) => createRowJudge({
  app: APP, user,
  controller: { ...controller,
    authRowsByIds: async (ids) => ids.map((i) => rows[i]).filter(Boolean),
    authContainers: async () => [rows[1], rows[2], rows[6]] },
});
// A chain nobody has configured: readable, but NOT writable. Kind auth's rule was the opposite for
// a signed-in caller (no permissions set ⇒ open), and that difference is the single largest group
// in the differential.
const BLANK = {
  1: { id: 1, type: 'prod:site' },
  2: { id: 2, type: 'prod|docs:pattern', parent_id: 1 },
  3: { id: 3, type: 'docs|page',         parent_id: 2 },
};
t('an unstated chain refuses an edit, even for a signed-in user', async () =>
  assert.strictEqual((await judgeOf(editor, BLANK)('edit', BLANK[3], {}, ['title'])).allow, false));
t('…and refuses a delete', async () =>
  assert.strictEqual((await judgeOf(editor, BLANK)('delete', BLANK[3], {})).allow, false));
t('…and refuses an anonymous one', async () =>
  assert.strictEqual((await judgeOf(null, BLANK)('edit', BLANK[3], {}, ['title'])).allow, false));
t('an anonymous caller passes only on an EXPLICIT public grant', async () => {
  const pub = { ...BLANK, 3: { ...BLANK[3], auth: { groups: { public: ['read', 'edit'] } } } };
  assert.strictEqual((await judgeOf(null, pub)('edit', pub[3], {}, ['title'])).allow, true);
});

section('the escalation guard — the one key-sensitive rule row auth keeps');
const GRANTS = {
  1: { id: 1, type: 'prod:site' },
  2: { id: 2, type: 'prod|docs:pattern', parent_id: 1 },
  3: { id: 3, type: 'docs|page', parent_id: 2,
       auth: { groups: { Editors: ['read', 'edit'], PermAdmins: ['read', 'edit', 'grant'] } } },
};
for (const key of ['authPermissions', 'auth']) {
  t(`plain edit cannot rewrite \`${key}\``, async () =>
    assert.strictEqual((await judgeOf(editor, GRANTS)('edit', GRANTS[3], { [key]: {} }, [key])).allow, false));
  t(`\`grant\` can rewrite \`${key}\``, async () => {
    const admin = { authed: true, id: 'u2', groups: ['PermAdmins'] };
    assert.strictEqual((await judgeOf(admin, GRANTS)('edit', GRANTS[3], { [key]: {} }, [key])).allow, true);
  });
}
t('an edit that touches a grant key AND an ordinary one needs both verbs', async () => {
  const d = await judgeOf(editor, GRANTS)('edit', GRANTS[3], { title: 'x', auth: {} }, ['title', 'auth']);
  assert.strictEqual(d.allow, false, 'edit alone is not enough once a grant key is in the patch');
});
t('an ordinary edit is unaffected by the guard', async () =>
  assert.strictEqual((await judgeOf(editor, GRANTS)('edit', GRANTS[3], { title: 'x' }, ['title'])).allow, true));

section('verbs — delete is its own, and `edit-page` confers it (approved 2026-10-29)');
t('`edit` does not imply `delete` structurally', async () => {
  const onlyEdit = { ...GRANTS, 3: { ...GRANTS[3], auth: { groups: { Editors: ['read', 'edit'] } } } };
  assert.strictEqual((await judgeOf(editor, onlyEdit)('delete', onlyEdit[3], {})).allow, false);
});
t('a verb confers `delete` only where a vocabulary DECLARES that it does', async () => {
  // `edit-page` used to confer read+edit+delete through `legacyVerbs.js`'s hardcoded table, on any
  // row, declared or not. That table was deleted on 2026-11-03: with nothing in the chain declaring,
  // `edit-page` is a string that confers nothing. The declared path is pinned in the next section.
  const bare = { ...GRANTS, 3: { ...GRANTS[3], auth: { groups: { Editors: ['edit-page'] } } } };
  assert.strictEqual((await judgeOf(editor, bare)('delete', bare[3], {})).allow, false);

  const VOCAB_DELETE = { descendants: [{ value: 'edit-page', implies: ['read', 'edit', 'delete'] }] };
  const declared = {
    ...bare,
    2: { ...bare[2], auth: { ...(bare[2] && bare[2].auth), vocabulary: VOCAB_DELETE } },
  };
  assert.strictEqual((await judgeOf(editor, declared)('delete', declared[3], {})).allow, true);
});

section('a DECLARED vocabulary — the path a migrated app actually takes');
// `authOf` is `expandWithVocabulary(raw, maps)` and nothing else: the declaration is the ONLY
// thing that says what a verb confers (`legacyVerbs.js` deleted 2026-11-03). Every one of the 81
// pattern rows on `rowauth-test` declares, so this is the path production runs. `test-data-auth.js`'s
// fixtures declare nothing, so the differential (test-row-auth-diff.js) exercises the undeclared
// path; this section is the declared-path coverage it cannot give.
const VOCAB = {
  self: [
    { value: 'edit-pattern',             implies: ['read', 'edit'] },
    { value: 'edit-pattern-permissions', implies: ['read', 'edit', 'grant'] },
  ],
  descendants: [
    { value: 'view-page', implies: ['read'] },
    { value: 'edit-page', implies: ['read', 'edit'] },
  ],
};
const declaring = (patternAuth) => ({
  1: { id: 1, type: 'prod:site' },
  2: { id: 2, type: 'prod|docs:pattern', parent_id: 1, auth: { vocabulary: VOCAB, ...patternAuth } },
  3: { id: 3, type: 'docs|page',         parent_id: 2 },
});
const canEdit = async (rows, row) =>
  (await judgeOf(editor, rows)('edit', row, { title: 'x' }, ['title'])).allow;

t('a FLAT `edit-page` grant on the pattern also confers editing the PATTERN — the collapse', async () => {
  const rows = declaring({ groups: { Editors: ['edit-page'] } });
  assert.strictEqual(await canEdit(rows, rows[2]), true, 'the widening, pinned as current behaviour');
  assert.strictEqual(await canEdit(rows, rows[3]), true, 'and it does reach the page, as intended');
});
t('the same grant written SCOPED leaves the pattern row alone', async () => {
  const rows = declaring({ descendants: { groups: { Editors: ['edit-page'] } } });
  assert.strictEqual(await canEdit(rows, rows[2]), false, 'the pattern row is not a descendant of itself');
  assert.strictEqual(await canEdit(rows, rows[3]), true, 'the page still gets it');
});
t('a `self` grant governs the pattern and NOT its pages', async () => {
  const rows = declaring({ self: { groups: { Editors: ['edit-pattern'] } } });
  assert.strictEqual(await canEdit(rows, rows[2]), true);
  assert.strictEqual(await canEdit(rows, rows[3]), false);
});
t('scope is enforced, not decorative: a self verb inside a descendants grant confers nothing', async () => {
  const rows = declaring({ descendants: { groups: { Editors: ['edit-pattern'] } } });
  assert.strictEqual(await canEdit(rows, rows[3]), false, 'edit-pattern is declared under self only');
});
t('a verb this vocabulary omits confers nothing', async () => {
  // `publish-page` is a real verb elsewhere — it just is not in THIS pattern's vocabulary, so under
  // this pattern it means nothing. A pattern's declaration is the whole vocabulary, not an addition
  // to some shared list.
  const rows = declaring({ descendants: { groups: { Editors: ['publish-page'] } } });
  assert.strictEqual(await canEdit(rows, rows[3]), false);
});
t('…and a chain that declares NOTHING confers nothing either — there is no shared list left', async () => {
  // The contrast that used to make the assertion above meaningful ran the other way: `publish-page`
  // was honoured here by `legacyVerbs.js` and refused above by the declaration. Now both refuse,
  // and the difference is gone on purpose — a verb means what the pattern says it means, or nothing.
  const noVocab = {
    1: { id: 1, type: 'prod:site' },
    2: { id: 2, type: 'prod|docs:pattern', parent_id: 1, auth: { groups: { Editors: ['publish-page'] } } },
    3: { id: 3, type: 'docs|page',         parent_id: 2 },
  };
  assert.strictEqual(await canEdit(noVocab, noVocab[3]), false);
});

section('app admin still passes everything');
t('the bootstrap escape survives the claim check', async () => {
  const d = await create('999', { user: { authed: true, id: 'a', groups: [`${APP} Admin`] } });
  assert.strictEqual(d.allow, true);
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
