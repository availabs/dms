'use strict';
/**
 * KIND AUTH — the implementation that decides by ROW KIND.
 *
 * One `switch` over the row kinds, each with hand-written rules (`dataAuth.js` `judge()`), plus a
 * read gate that knows exactly two kinds (`kindReadAuth.js`) and the datasets pair
 * (`sourceAuth.js` / `readAuth.js`). `authRules.js` + `authJudge.js` are a SUB-MODE of this side,
 * not a third implementation: `dataAuth.js` selects them with `DMS_DATA_AUTH_JUDGE=data`, which
 * swaps the hand-written switch for a pure interpreter over declared rules. Both answer as kind
 * auth; only the way the rules are written differs.
 *
 * This index is the contract `../index.js` switches on. `rowAuth/index.js` exports the same names
 * with the same signatures, so a caller importing from `routes/auth` never learns which side it got.
 */
const dataAuth = require('./dataAuth');
const { kindReadBlocked, PATTERN_READ_PERMISSIONS, KIND_READ_KINDS } = require('./kindReadAuth');
const sourceAuth = require('./sourceAuth');
const readAuth = require('./readAuth');
const { isUserAuthed } = require('../auth');

/**
 * May this caller read `row`?
 *
 * Kind auth gates `pattern` and `page` and nothing else — every other kind is open on read, which
 * is the hole row auth exists to close. Returning `false` for them is the honest statement of that,
 * not an oversight.
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
