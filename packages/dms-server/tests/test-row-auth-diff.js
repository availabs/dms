/**
 * DIFFERENTIAL: the row judge against kind auth's own contract suite.
 *
 * `tests/test-data-auth.js` encodes KIND auth's contract (dataAuth.js) and stays that way — green
 * green on the default implementation, not ours to edit. Running it with `DMS_AUTH_IMPL=row` points it at
 * the row judge instead, where it is NOT a pass/fail gate: row auth deliberately differs, and
 * expecting identical results is a category error.
 *
 * What it IS, and the only mechanical check we have for it: proof that row auth has not silently
 * dropped a protection kind auth had. Every disagreement is pinned in
 * `fixtures/row-auth-expected-diff.json` WITH A WRITTEN REASON, so:
 *
 *   - a disagreement that is not in the fixture FAILS this test — it is a new finding;
 *   - a pinned disagreement that starts passing is REPORTED, never failed, because closing one is
 *     progress and should not break the build. Delete the entry when that happens.
 *
 * Replacing this with a fresh suite that simply asserts what row auth does today would lose exactly
 * the thing it is for: a fresh suite is green by construction and can never tell you something was
 * given up.
 *
 * Run: node tests/test-row-auth-diff.js
 */
const path = require('path');
const { runDifferential } = require('./lib/differential');

runDifferential({
  suite: path.join(__dirname, 'test-data-auth.js'),
  fixturePath: path.join(__dirname, 'fixtures', 'row-auth-expected-diff.json'),
  // `DMS_AUTH_IMPL=row` is the WHOLE experiment. It used to take two variables — this one to load
  // the row modules and `DMS_WRITE_GATE` to make the write surface use them — and setting one
  // without the other produced a harness that compared kind auth with itself and passed green
  // having measured nothing. That reached the tree once (0 pinned, 26 resolved). The second flag
  // was removed on 2026-11-03; there is now no way to half-set it.
  env: { DMS_AUTH_IMPL: 'row' },
  doneRe: /data-auth tests: \d+ passed/,
  title: "kind auth's contract suite, judged by ROW auth",
});
