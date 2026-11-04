'use strict';
/**
 * THE AUTH LAYER'S SETTINGS — the one flag this server is configured with.
 *
 *     DMS_AUTH_MODE   what happens to a NO      log  (default) | enforce
 *
 * `log` is the default, and it refuses nothing: every decision that would have been a NO is written
 * to the console and the access log instead. `enforce` makes the same decisions bite.
 *
 * THERE USED TO BE NINE. `DMS_ROW_AUTH_MODE`, `DMS_DATA_AUTH_MODE`, `DMS_READ_AUTH_MODE`,
 * `DMS_SOURCE_AUTH_MODE` and `DMS_AUTH_ROW_MODE` each staged one surface's rollout; `DMS_WRITE_GATE`
 * and `DMS_UDA_GATE` each chose an implementation for one surface; `DMS_DATA_AUTH_JUDGE` chose
 * between two spellings of kind auth's rules. Eight went on 2026-11-03, at the cost of one real
 * capability: a surface can no longer be flipped to `enforce` on its own.
 *
 * `DMS_AUTH_IMPL` (`kind` | `row`) was the ninth, and it went on 2026-11-04 with row auth itself —
 * see `./index.js`. There is one set of rules now, so there is nothing to select between.
 *
 * IT LIVES APART FROM `./index.js` so that a module belonging to the implementation can ask what
 * the mode is without requiring the index that requires it. The datasets surfaces do exactly that,
 * and a `require` cycle there once left four names `undefined` with nothing but a Node warning.
 */

// ---- DMS_AUTH_MODE --------------------------------------------------------------------------

/**
 * `log` (default) | `enforce`. An unrecognised value is `log` — the safe reading of a typo.
 *
 * READ PER CALL rather than captured at load: a suite that selects a mode does it by setting the
 * variable at the top of its file, and whether that lands used to depend on whether anything it
 * required first had already pulled this module in.
 */
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
 * It is a VALUE, not configuration. It is identity-compared by the routes (`toWrite === NO_CHANGE`)
 * and it sits here, rather than in `kindAuth/`, because that comparison must not depend on which
 * module a route imported it from.
 *
 * Owner 2026-10-29: a save with no changes is not an update, so it is never judged.
 */
const NO_CHANGE = Symbol('no change');

module.exports = { authMode, enforcing, NO_CHANGE };
