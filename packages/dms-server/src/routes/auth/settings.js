'use strict';
/**
 * THE ONE FLAG, and the one sentinel.
 *
 *     DMS_AUTH_MODE   what happens to a NO      log (default) | enforce
 *
 * `log` refuses nothing: every decision that would have been a NO is written to the console and the
 * access log (`report.js`). `enforce` makes the same decisions bite. Read per call, not at load, so a
 * test may set it after requiring this module.
 */

const { AsyncLocalStorage } = require('async_hooks');

// A request scope that makes every decision bite whatever the server's mode: a data type registered with
// `{ authMode: 'enforce' }` (plugins installed at run time, dms-plugin-system.md P0 finding 1) runs its routes in
// it, so new plugin code never ships under `log`. It can only tighten: there is no scope that loosens.
const enforceScope = new AsyncLocalStorage();

/** `log` (default) | `enforce`. An unrecognised value is `log` — the safe reading of a typo. */
function authMode() {
    if (enforceScope.getStore() === 'enforce') return 'enforce';
    return String(process.env.DMS_AUTH_MODE || 'log').toLowerCase() === 'enforce' ? 'enforce' : 'log';
}

/** Runs `fn` (and everything it awaits or calls back) with every auth decision enforced. */
function withEnforcedAuth(fn) {
    return enforceScope.run('enforce', fn);
}

/**
 * The sentinel an edit returns when it changes nothing. A VALUE, not configuration: the routes
 * identity-compare it (`toWrite === NO_CHANGE`). A save with no changes is not an update, so it is
 * never judged (owner 2026-10-29).
 */
const NO_CHANGE = Symbol('no change');

module.exports = { authMode, withEnforcedAuth, NO_CHANGE };
