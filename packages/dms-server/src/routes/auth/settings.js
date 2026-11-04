'use strict';
/**
 * THE AUTH LAYER'S SETTINGS — the two flags this server is configured with, in one place.
 *
 *     DMS_AUTH_IMPL   WHICH rules decide        kind (default) | row
 *     DMS_AUTH_MODE   what happens to a NO      log  (default) | enforce
 *
 * They are orthogonal on purpose, and the useful combination is `row` + `log`: it runs row auth's
 * rules over real traffic and writes out everything they WOULD refuse, without refusing any of it.
 * `log` + `kind` is the default, and it enforces nothing that was not already enforced.
 *
 * THERE USED TO BE EIGHT. `DMS_ROW_AUTH_MODE`, `DMS_DATA_AUTH_MODE`, `DMS_READ_AUTH_MODE`,
 * `DMS_SOURCE_AUTH_MODE` and `DMS_AUTH_ROW_MODE` each staged one surface's rollout; `DMS_WRITE_GATE`
 * and `DMS_UDA_GATE` each chose an implementation for one surface; `DMS_DATA_AUTH_JUDGE` chose
 * between two spellings of kind auth's rules. Together they made "what is this server enforcing,
 * with which rules?" a question with eight answers, most combinations of which nobody had run.
 * Removed 2026-11-03, at the cost of one real capability: a surface can no longer be flipped to
 * `enforce` on its own.
 *
 * IT LIVES APART FROM `./index.js` so that a module BELONGING to one implementation can ask what is
 * selected without requiring the switch that requires it. The datasets surfaces do exactly that,
 * and a `require` cycle there once left four names `undefined` with nothing but a Node warning.
 */

// ---- DMS_AUTH_IMPL --------------------------------------------------------------------------

/**
 * `kind` (default) | `row`, READ PER CALL rather than captured at load.
 *
 * Not a micro-optimisation question: a suite that selects an implementation does it by setting the
 * variable at the top of its file, and whether that lands depends on whether anything it required
 * first had already pulled this module in. Reading per call makes that ordering stop mattering. The
 * failure it prevents has happened: a differential ran green having compared kind auth with itself,
 * because the flag was read before the suite set it ("0 pinned, 26 resolved" — see
 * tests/test-row-auth-diff.js).
 *
 * `./index.js` still resolves ONCE, at load, because it has to pick a module to re-export.
 */
const authImpl = () => (String(process.env.DMS_AUTH_IMPL || 'kind').toLowerCase() === 'row' ? 'row' : 'kind');

/** True when row auth is the selected implementation. */
const isRow = () => authImpl() === 'row';

// ---- DMS_AUTH_MODE --------------------------------------------------------------------------

/** `log` (default) | `enforce`. An unrecognised value is `log` — the safe reading of a typo. */
function authMode({ logOnly = false } = {}) {
  const m = String(process.env.DMS_AUTH_MODE || 'log').toLowerCase();
  const mode = m === 'enforce' ? 'enforce' : 'log';
  return logOnly ? 'log' : mode;
}

/** Shorthand for the common `authMode() === 'enforce'` test. */
const enforcing = (opts) => authMode(opts) === 'enforce';

// ---- NOT A SETTING ---------------------------------------------------------------------------
/**
 * The sentinel an edit returns when it changes nothing.
 *
 * It is a VALUE, not configuration, and it sits here only because this is the one file both
 * implementations may read without reaching for each other — which is the whole reason it has to
 * be shared. It is identity-compared by the routes (`toWrite === NO_CHANGE`), so if each side
 * minted its own Symbol the comparison would silently fail for whichever side the route did not
 * import from: a write that should have been skipped would be performed instead. One Symbol, one
 * meaning, whichever implementation is selected.
 *
 * Owner 2026-10-29: a save with no changes is not an update, so it is never judged.
 */
const NO_CHANGE = Symbol('no change');

module.exports = { authImpl, isRow, authMode, enforcing, NO_CHANGE };
