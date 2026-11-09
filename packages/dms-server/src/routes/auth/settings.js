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

/** `log` (default) | `enforce`. An unrecognised value is `log` — the safe reading of a typo. */
function authMode() {
    return String(process.env.DMS_AUTH_MODE || 'log').toLowerCase() === 'enforce' ? 'enforce' : 'log';
}

/**
 * The sentinel an edit returns when it changes nothing. A VALUE, not configuration: the routes
 * identity-compare it (`toWrite === NO_CHANGE`). A save with no changes is not an update, so it is
 * never judged (owner 2026-10-29).
 */
const NO_CHANGE = Symbol('no change');

module.exports = { authMode, NO_CHANGE };
