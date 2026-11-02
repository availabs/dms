'use strict';
/**
 * The sentinel an edit returns when it changes nothing.
 *
 * Shared by both implementations ON PURPOSE. It is identity-compared by the routes
 * (`toWrite === NO_CHANGE`), so if each side minted its own Symbol the comparison would silently
 * fail for whichever side the route did not import from — a write that should have been skipped
 * would be performed instead. One Symbol, one meaning, whichever implementation is selected.
 *
 * Owner 2026-10-29: a save with no changes is not an update, so it is never judged.
 */
module.exports = { NO_CHANGE: Symbol('no change') };
