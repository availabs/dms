/**
 * Pattern duplicate: a ref moves only when its id does (dama/upload/dms-duplicate.js).
 *
 * Regression for a corruption found on 2026-10-28 while duplicating `mitigat-ny-prod`'s `admin`
 * pattern. The remap rewrote the `ref` unconditionally, so an entry pointing at a row in ANOTHER
 * pattern — whose id is correctly left alone — came out claiming a type it does not point at.
 * 1,081 of 2,248 clones were corrupted, and the originals were fine, so every earlier use of
 * Duplicate did the same.
 *
 * A sibling `remapParentRef` did the same to each component's `data.parent` and was covered here
 * too. That field was retired on 2026-10-29 (rowAuth.js's header): a cloned component's containment
 * now comes from `stampChildren` firing on the cloned page's section list, so there is nothing left
 * to remap. `test-parent-stamp.js` covers the stamp.
 *
 * Run: node tests/test-duplicate-refs.js
 */
const assert = require('assert');
const { remapSectionRefs } = require('../src/dama/upload/dms-duplicate');

let pass = 0, fail = 0;
const t = (name, fn) => {
    try { fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

const APP = 'myapp', NEW = 'new_inst';
const secMap = { '10': 110, '11': 111 };        // only these two were cloned

console.log('\nsection lists');
t('a cloned section gets the new id AND the new ref', () => {
    const [e] = remapSectionRefs([{ id: '10', ref: 'myapp+old_inst|component' }], secMap, APP, NEW);
    assert.strictEqual(e.id, 110);
    assert.strictEqual(e.ref, 'myapp+new_inst|component');
});
t('a section from ANOTHER pattern keeps BOTH its id and its ref', () => {
    const foreign = { id: '99', ref: 'myapp+other_pattern|component' };
    const [e] = remapSectionRefs([foreign], secMap, APP, NEW);
    assert.strictEqual(e.id, '99', 'id must not move');
    assert.strictEqual(e.ref, 'myapp+other_pattern|component', 'ref must not move either');
});
t('other entry fields survive', () => {
    const [e] = remapSectionRefs([{ id: '11', ref: 'x', size: '1/2' }], secMap, APP, NEW);
    assert.strictEqual(e.size, '1/2');
});
t('a non-array is passed through', () => assert.strictEqual(remapSectionRefs(null, secMap, APP, NEW), null));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
