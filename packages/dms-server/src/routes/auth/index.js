'use strict';
/**
 * THE AUTH LAYER — the only module the rest of the server should import authorization from.
 *
 *     const { assertDataWrite, readBlocked, NO_CHANGE } = require('../auth');
 *
 * ONE IMPLEMENTATION, `kindAuth/`. Writes are judged by an interpreter (`authJudge.js`) over each
 * row kind's rule, held as DATA: the rule stamped on the pattern / site row from the formats
 * (patterns/deriveAuthRules.js), else the built-in copy (`authRules.js`). There is no second judge
 * and no hand-written `switch` — both were deleted on 2026-11-03.
 *
 * WHAT ELSE IS IN THIS FOLDER, and why each file is not in `kindAuth/`:
 *
 *   settings.js        `DMS_AUTH_MODE` (log | enforce), plus the `NO_CHANGE` sentinel the routes
 *                      identity-compare. A module inside the implementation may read it without
 *                      requiring the index that requires it.
 *   auth.js            is this caller authed, and what do stored grants resolve to for a subdomain
 *   authorize.js       `authorize({ row | env+sourceId | env+viewId, verb })` — the one question
 *   authVocabulary.js  `permissionDomain` → verbs → `implies` expansion → `verbsForFields`. The
 *                      machinery behind a declared vocabulary, read by the judge and by the
 *                      controller (`childRefsOf`, `ownerKindOf`).
 *   sourceSnapshot.js  the datasets read snapshot, cached per env
 *   sourceAncestry.js  a pgEnv's `:dmsenv` row — where an external source's vocabulary is declared
 *   sourceReads.js     the mode, logging and redaction around a datasets read decision
 *   sourceGuards.js    the source / pattern authorize pair, and the view lookup they need
 *   requestUser.js     request identity and the Express / Falcor guards; decides nothing
 *
 * ---------------------------------------------------------------------------
 * ONE FLAG, ONE QUESTION
 *
 *     DMS_AUTH_MODE   what happens to a NO      log (default) | enforce
 *
 * ⚠ `log` IS THE DEFAULT, AND IT ENFORCES NOTHING THAT WAS NOT ALREADY ENFORCED. A fresh server
 * behaves as it did before any of this existed.
 *
 * ---------------------------------------------------------------------------
 * ROW AUTH, AND WHY IT IS GONE (2026-11-04)
 *
 * A second implementation lived beside this one under `rowAuth/`: it ignored row kind entirely and
 * decided by the row's own grants merged up its `parent_id` chain, reaching one `verdict()` through
 * three adapters. `DMS_AUTH_IMPL` chose between the two and a pair of differentials held them to
 * agreement, every disagreement pinned with a written reason.
 *
 * Owner, 2026-11-04: *"kind auth is actually the better solution at this point and [row auth is]
 * just making the shared code more complicated."* The cost was real and it was paid by code that
 * belonged to neither side: `sourceSnapshot.js` carried TWO resolved grant objects per source
 * because the two providers could not share a representation, every datasets entry point dispatched
 * on a flag before it could decide anything, and the chain resolver plus its merge — 572 lines —
 * existed solely to produce the object only row auth read.
 *
 * WHAT SURVIVED IT, because it was never row auth's: `authVocabulary.js` (the declared vocabulary,
 * which kind auth's field rules read through `verbsForFields`), `../dms/parentId.js` (stamping
 * `parent_id` and the cascade delete that rides on it) and `../dms/rowAuthCaps.js` (the probe for
 * the `auth` and `parent_id` columns, which are still where grants and containment are stored).
 * Those columns remain the system of record; only the second judge over them is gone.
 */
const kindAuth = require('./kindAuth');

module.exports = {
  // ---- the implementation ----
  assertDataWrite: kindAuth.assertDataWrite,
  dataAuthMode: kindAuth.dataAuthMode,
  createJudge: kindAuth.createJudge,
  planEdit: kindAuth.planEdit,
  readBlocked: kindAuth.readBlocked,
  listingBlocked: kindAuth.listingBlocked,
  ...require('./authorize'),                  // authorize — the one question, either call shape
  // ---- shared ----
  ...require('./auth'),                       // isUserAuthed, resolveAuthPermissions
  ...require('./settings'),                   // authMode, enforcing, NO_CHANGE
  sourceSnapshot: require('./sourceSnapshot'),
  kindAuth,
};
