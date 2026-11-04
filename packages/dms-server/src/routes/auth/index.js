'use strict';
/**
 * THE AUTH SWITCH — one place that decides which authorization implementation this server runs,
 * and the only module the rest of the server should import auth from.
 *
 *     const { assertDataWrite, readBlocked, NO_CHANGE } = require('../auth');
 *
 * Two implementations live side by side under this folder and export the SAME contract:
 *
 *   kindAuth/   decides by ROW KIND — per-kind rules held as DATA (`authRules.js`) and applied by
 *               an interpreter (`authJudge.js`).
 *   rowAuth/    decides by the ROW's own grants and its PARENT CHAIN — one `verdict()` reached by
 *               three adapters, gaining no branch when a pattern is added.
 *
 * BOTH ARE PERMANENT (owner, 2026-11-03: "kind auth is never going to be deleted, we are planning
 * on keeping both for this phase of work"). This is a standing choice, not a migration staging
 * post, and the differentials (`tests/test-row-auth-diff.js`, `tests/test-row-auth-uda-diff.js`)
 * are the standing contract between the two: every disagreement is pinned with a written reason.
 *
 * THE ROOT OF THIS FOLDER IS THE SWITCH PLUS WHAT BOTH SIDES GENUINELY USE, and nothing else:
 *
 *   settings.js        the two flags this server runs with, plus the NO_CHANGE sentinel both sides
 *                      identity-compare (`DMS_AUTH_IMPL` = kind | row, `DMS_AUTH_MODE` = log | enforce)
 *   auth.js            is this caller authed, and what do stored grants resolve to for a subdomain
 *   sourceSnapshot.js  the datasets read snapshot both implementations then decide from
 *   sourceGuards.js    the request plumbing — identity, Express guards, Falcor asserts; decides nothing
 *
 * Verb machinery (`authVocabulary.js`) and the column probe (`rowAuthCaps.js`) live in `rowAuth/`,
 * because they are row auth's: kind auth matches verbs BY NAME and cannot expand anything, and the
 * columns probed are the ones row auth added. `sourceSnapshot.js` imports three of them — it
 * pre-expands for the row gate while it has the rows in hand, which is a caching decision, not
 * shared logic. The note at those requires says why that is safe for kind auth.
 *
 * ---------------------------------------------------------------------------
 * TWO FLAGS, TWO QUESTIONS
 *
 *     DMS_AUTH_IMPL   WHICH rules decide        kind (default) | row
 *     DMS_AUTH_MODE   what happens to a NO      log  (default) | enforce
 *
 * They are orthogonal on purpose, and the useful combination is `row` + `log`: it runs row auth's
 * rules over real traffic and writes out everything they WOULD refuse, without refusing any of it.
 * Both live in `./settings.js`.
 *
 * ⚠ `log` + `kind` IS THE DEFAULT, AND IT ENFORCES NOTHING THAT WAS NOT ALREADY ENFORCED. A fresh
 * server behaves as it did before any of this existed.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS HERE BEFORE (2026-11-03)
 *
 * Eight flags, not two: `DMS_ROW_AUTH_MODE`, `DMS_DATA_AUTH_MODE`, `DMS_READ_AUTH_MODE`,
 * `DMS_SOURCE_AUTH_MODE` and `DMS_AUTH_ROW_MODE` each staged one surface's rollout; `DMS_WRITE_GATE`
 * and `DMS_UDA_GATE` each chose an implementation for one surface; `DMS_DATA_AUTH_JUDGE` chose
 * between two spellings of kind auth's rules. Each was defensible when it was added — a surface
 * should be shippable on its own — and together they made "what is this server enforcing, with
 * which rules?" a question with eight answers, most combinations of which nobody had ever run.
 *
 * The removal cost one real capability, and it is worth stating plainly: a surface can no longer be
 * flipped to `enforce` on its own. Enforcement is now all surfaces or none, per implementation.
 *
 * Two of the old flags were also actively misleading. `DMS_WRITE_GATE=row` and `DMS_UDA_GATE=row`
 * were read INSIDE the row modules, which the switch never loaded under `kind` — so setting them
 * did nothing at all, silently, and a differential once ran green having compared kind auth with
 * itself. That shape of mistake is now unavailable: there is one variable and it is read in one
 * place (`./impl.js`).
 */
const { authImpl } = require('./settings');

// Resolved ONCE, here, because this module has to pick something to re-export. Everywhere else
// reads `isRow()` per call — see ./impl.js for the ordering hazard that makes the difference.
const IMPL = authImpl();
const impl = IMPL === 'row' ? require('./rowAuth') : require('./kindAuth');

module.exports = {
  AUTH_IMPL: IMPL,
  // ---- the contract both implementations answer ----
  assertDataWrite: impl.assertDataWrite,
  dataAuthMode: impl.dataAuthMode,
  createJudge: impl.createJudge,
  planEdit: impl.planEdit,
  readBlocked: impl.readBlocked,
  ...require('./authorize'),                  // authorize — the one question, either call shape
  listingBlocked: impl.listingBlocked,
  // ---- shared, implementation-independent ----
  ...require('./auth'),                       // isUserAuthed, resolveAuthPermissions
  ...require('./settings'),                   // authImpl, authMode, enforcing, NO_CHANGE
  sourceSnapshot: require('./sourceSnapshot'),
  // ---- the selected implementation, and both by name ----
  impl,
  kindAuth: require('./kindAuth'),
  rowAuth: require('./rowAuth'),
};
