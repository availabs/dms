/**
 * migrate-auth-grants.js --plan / --apply: the pure parts (where a row stands, adding a grant in the row's own
 * format, validation). No database. The write path itself is exercised against a Postgres rig (task file).
 *
 * Run: node tests/test-migrate-auth-grants.js
 */
const assert = require('assert');
const { APPROVED, rowState, withGrant, validateGrant } = require('../src/scripts/migrate-auth-grants');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};
const blank = { app: 'x', id: 1, group: 'AVAIL', perms: ['*'], before: { groups: [], users: [] } };
const npm = { app: 'y', id: 2, group: 'NYSDOT Admin', perms: ['*'], before: { groups: ['AVAIL'], users: ['175'] } };

console.log('rowState');
t('missing / empty / public-only rows are blank → apply', () => {
  for (const raw of [null, undefined, '', '{}', {}, { groups: { public: ['view-page'] } },
    JSON.stringify({ groups: { public: ['view-page'] }, users: {} })]) {
    assert.strictEqual(rowState(raw, blank).state, 'apply', JSON.stringify(raw));
  }
});
t('exact expected before → apply (npmrdsv5 shape)', () => {
  assert.strictEqual(rowState({ groups: { AVAIL: ['*'] }, users: { 175: ['*'] } }, npm).state, 'apply');
});
t('already applied → done (re-run is a no-op)', () => {
  assert.strictEqual(rowState({ groups: { AVAIL: ['*'], 'NYSDOT Admin': ['*'] }, users: { 175: ['*'] } }, npm).state, 'done');
  assert.strictEqual(rowState(JSON.stringify({ groups: { AVAIL: ['*'] } }), blank).state, 'done');
});
t('group present with other perms → refuse', () => {
  const r = rowState({ groups: { AVAIL: ['auth-users'] } }, blank);
  assert.strictEqual(r.state, 'refuse'); assert.match(r.reason, /already holds/);
});
t('an unexpected group (e.g. malformed "undefined Admin") → refuse', () => {
  const r = rowState({ groups: { 'undefined Admin': ['*'] } }, blank);
  assert.strictEqual(r.state, 'refuse'); assert.match(r.reason, /undefined Admin/);
});
t('an unexpected user grant → refuse', () => {
  assert.strictEqual(rowState({ groups: { AVAIL: ['*'] }, users: { 175: ['*'], 9: ['*'] } }, npm).state, 'refuse');
  assert.strictEqual(rowState({ groups: { AVAIL: ['*'] }, users: {} }, npm).state, 'refuse');
});
t('subdomain-keyed rows are judged on their * entry', () => {
  assert.strictEqual(rowState({ '*': { groups: {} }, songs: { groups: { X: ['*'] } } }, blank).state, 'apply');
  assert.strictEqual(rowState({ '*': JSON.stringify({ groups: { Y: ['*'] } }) }, blank).state, 'refuse');
});

console.log('withGrant keeps the format');
t('string stays string, other keys kept', () => {
  const prev = JSON.stringify({ groups: { public: ['view-page'] }, users: {} });
  const next = withGrant(prev, 'AVAIL', ['*']);
  assert.strictEqual(typeof next, 'string');
  assert.deepStrictEqual(JSON.parse(next), { groups: { public: ['view-page'], AVAIL: ['*'] }, users: {} });
  validateGrant(prev, next, 'AVAIL', ['*']);
});
t('object stays object, users kept', () => {
  const prev = { groups: { AVAIL: ['*'] }, users: { 175: ['*'] } };
  const next = withGrant(prev, 'NYSDOT Admin', ['*']);
  assert.strictEqual(typeof next, 'object');
  assert.deepStrictEqual(next, { groups: { AVAIL: ['*'], 'NYSDOT Admin': ['*'] }, users: { 175: ['*'] } });
  assert.deepStrictEqual(prev, { groups: { AVAIL: ['*'] }, users: { 175: ['*'] } }, 'input not mutated');
  validateGrant(prev, next, 'NYSDOT Admin', ['*']);
});
t('missing value → flat object with the grant', () => {
  for (const prev of [null, undefined]) {
    const next = withGrant(prev, 'AVAIL', ['*']);
    assert.deepStrictEqual(next, { groups: { AVAIL: ['*'] } });
    validateGrant(prev, next, 'AVAIL', ['*']);
  }
});
t('subdomain-keyed: grant goes in * only, * keeps its own form, other subdomains untouched', () => {
  const prev = { '*': JSON.stringify({ groups: {} }), songs: { groups: { X: ['view-page'] } } };
  const next = withGrant(prev, 'AVAIL', ['*']);
  assert.strictEqual(typeof next['*'], 'string');
  assert.deepStrictEqual(JSON.parse(next['*']), { groups: { AVAIL: ['*'] } });
  assert.deepStrictEqual(next.songs, prev.songs);
  validateGrant(prev, next, 'AVAIL', ['*']);
});

console.log('validateGrant catches');
t('a dropped grant', () => {
  assert.throws(() => validateGrant({ groups: { A: ['*'] } }, { groups: { AVAIL: ['*'] } }, 'AVAIL', ['*']), /validation/);
});
t('a format change', () => {
  assert.throws(() => validateGrant('{"groups":{}}', { groups: { AVAIL: ['*'] } }, 'AVAIL', ['*']), /format changed/);
});
t('a changed subdomain entry', () => {
  const prev = { '*': { groups: {} }, songs: { groups: { X: ['a'] } } };
  const next = { '*': { groups: { AVAIL: ['*'] } }, songs: { groups: { X: ['b'] } } };
  assert.throws(() => validateGrant(prev, next, 'AVAIL', ['*']), /songs changed/);
});

console.log('APPROVED');
t('is the 5 owner-approved grants', () => {
  assert.deepStrictEqual(APPROVED.map(i => `${i.app}/${i.id}/${i.group}/${i.perms}`), [
    'asm/1676371/AVAIL/*', 'avail/1449669/AVAIL/*', 'dms-site/1456572/AVAIL/*', 'wcdb/1471742/AVAIL/*',
    'npmrdsv5/1498261/NYSDOT Admin/*',
  ]);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
