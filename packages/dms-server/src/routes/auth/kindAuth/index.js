'use strict';
/**
 * KIND AUTH — the implementation that decides by ROW KIND.
 *
 * Writes are judged by an interpreter (`authJudge.js`) over each kind's rule, held as DATA: the
 * rule stamped on the pattern / site row from the formats (patterns/deriveAuthRules.js), else the
 * built-in copy (`authRules.js`). That is the only judge — the hand-written `switch` it was
 * trialled against was deleted on 2026-11-03 ("we don't want hand written rules"). Plus a read gate
 * that knows exactly two kinds (`kindReadAuth.js`) and the datasets pair (`sourceAuth.js` /
 * `readAuth.js`).
 *
 * The hand-written `switch` over the eleven row kinds that used to live in `dataAuth.js` was
 * removed on 2026-11-03 (owner: "we don't want hand written rules"), after the two were measured
 * identical on 167 cases. Nothing selects between them any more; there is one judge.
 *
 * THE ONLY IMPLEMENTATION, since 2026-11-04 (owner: "kind auth is actually the better solution at
 * this point"). It shared `../index.js` with `rowAuth/` for the preceding weeks, both exporting
 * these same names so that a caller importing from `routes/auth` never learned which side it got.
 *
 * That indirection is KEPT now that only one side remains: it is what stops a route reaching into
 * an implementation by name, which is how every datasets route ended up coupled to this folder in
 * the first place (criterion 5 of row-auth-uda-unify-api.md).
 */
const dataAuth = require('./dataAuth');
const { kindReadBlocked, PATTERN_READ_PERMISSIONS, KIND_READ_KINDS } = require('./kindReadAuth');
const sourceAuth = require('./sourceAuth');
const readAuth = require('./readAuth');
const { isUserAuthed } = require('../auth');

/**
 * May this caller read `row`?
 *
 * ⚠ `pattern` AND `page` AND NOTHING ELSE — site, theme, tenant, dmsenv, source, view, component,
 * page-edit and split `:data` are guarded on WRITE and OPEN ON READ. Returning `false` for them is
 * the honest statement of a real hole, not an oversight. Row auth's gate closed it by judging
 * every kind the same way; that went on 2026-11-04, so closing it now means giving those kinds a
 * read rule here.
 */
const readBlocked = (ctx) => kindReadBlocked(ctx);

/**
 * May this caller see the LISTING for `app+type`? A coarse, pattern-level pre-check: it answers
 * `length: 0` wholesale rather than an authorised count.
 */
async function listingBlocked(controller, { app, type, parentKey, user, subdomain }) {
  const patternAuth = await controller.getPatternAuthPermissions(app, parentKey, subdomain);
  return !isUserAuthed({ user, reqPermissions: ['view-page'], authPermissions: patternAuth || {} });
}

module.exports = {
  IMPL: 'kind',
  // writes
  assertDataWrite: dataAuth.assertDataWrite,
  dataAuthMode: dataAuth.dataAuthMode,
  createJudge: dataAuth.createJudge,
  planEdit: dataAuth.planEdit,
  logWouldDeny: dataAuth.logWouldDeny,
  NO_CHANGE: dataAuth.NO_CHANGE,
  // reads
  readBlocked, listingBlocked, PATTERN_READ_PERMISSIONS, KIND_READ_KINDS,
  // datasets
  sourceAuth, readAuth,
  // the modules themselves, for the differentials and the migration scripts
  dataAuth, kindReadAuth: require('./kindReadAuth'),
};
