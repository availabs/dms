'use strict';
/**
 * KIND AUTH — the implementation that decides by ROW KIND.
 *
 * Per-kind rules, held as DATA in `authRules.js` and applied by `authJudge.js`, a pure interpreter
 * (`dataAuth.js` wires the two together and resolves which grants govern each kind). Plus a read
 * gate that knows exactly two kinds (`kindReadAuth.js`) and the datasets pair (`sourceAuth.js` /
 * `readAuth.js`).
 *
 * The hand-written `switch` over the eleven row kinds that used to live in `dataAuth.js` was
 * removed on 2026-11-03 (owner: "we don't want hand written rules"), after the two were measured
 * identical on 167 cases. Nothing selects between them any more; there is one judge.
 *
 * NOT A TRANSITIONAL SIDE. Kind auth is a permanent provider (owner, 2026-11-03: "kind auth is
 * never going to be deleted — we are planning on keeping both for this phase of work"), so this
 * index is a standing contract rather than a staging post.
 *
 * It is the contract `../index.js` switches on. `rowAuth/index.js` exports the same names with the
 * same signatures, so a caller importing from `routes/auth` never learns which side it got.
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
