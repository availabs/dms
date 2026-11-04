/**
 * DIFFERENTIAL: the row judge against UDA's own contract suite (`tests/test-source-auth.js`).
 *
 * See tests/lib/differential.js for the semantics. `test-source-auth.js` is KIND auth's contract
 * for datasets and stays green at 50/50 on the default flag; this points it at the row judge via
 * `DMS_AUTH_IMPL=row` and holds the difference to a pinned list.
 *
 * Run: node tests/test-row-auth-uda-diff.js
 */
const path = require('path');
const { runDifferential } = require('./lib/differential');

runDifferential({
  suite: path.join(__dirname, 'test-source-auth.js'),
  fixturePath: path.join(__dirname, 'fixtures', 'row-auth-uda-expected-diff.json'),
  // `DMS_AUTH_IMPL` is read per call inside sourceAuth.js (routes/auth/impl.js), so this works —
  // but it is stated anyway, so the harness cannot be neutered the way the write differential was
  // if that dispatch ever moves behind routes/auth's facade.
  env: { DMS_AUTH_IMPL: 'row' },
  doneRe: /source-auth tests: \d+ passed/,
  title: "UDA's contract suite, judged by ROW auth",
});
