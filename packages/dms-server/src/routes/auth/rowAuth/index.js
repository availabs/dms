'use strict';
/**
 * ROW AUTH — the implementation that decides by the ROW's own grants and its PARENT CHAIN.
 *
 * One decision function, `rowAuthGate.verdict()`, reached by three adapters: `createGate` for
 * reads, `assertDataWrite` for writes, and `rowSourceAuth.js` for datasets. Chain resolution is
 * `rowAuth.js` (`createResolver` walks `parent_id`), grant merging `mergeAuth.js`, verb expansion
 * the shared `authVocabulary.js`, which is now the only answer to what a verb confers. It gains no branch
 * when a pattern is added, which is the whole point of it.
 *
 * Exports the same contract as `kindAuth/index.js`, so `../index.js` can hand either to a caller.
 */
const gate = require('./rowAuthGate');
const rowSourceAuth = require('./rowSourceAuth');
const { authMode } = require('../settings');
const kindAuth = require('../kindAuth');
const { getKind } = require('#db/type-utils.js');

/**
 * May this caller read `row`?
 *
 * ⚠ THE `enforce` COUPLING IS DELIBERATE AND LOAD-BEARING — do not "simplify" it away.
 *
 * Kind auth has NO rollout mode: it enforces pattern and page reads ALWAYS. The gate is staged,
 * and under `log` — the default — it allows everything and merely reports. So sending pattern and
 * page here unconditionally would stop enforcing those reads on every deployment not already on
 * `enforce`: a private page becomes readable by anyone. That is a security regression, not a
 * consolidation, and no flag arrangement avoids it.
 *
 *   log       pattern + page → KIND auth, enforced, unchanged
 *   enforce   pattern + page → the gate, i.e. one decision path for every kind
 *
 * Proved equivalent before this landed: `--diff-reads` over a 33,967-row clone of production
 * reports, for pattern and page, 0 TIGHTER and 55 LOOSER — the 55 being `${app} Admin` gaining
 * reads the old page branch never granted, which `verdict` grants by design. Nobody loses access.
 *
 * ⚠ THIS IS THE ONE PLACE ROW AUTH CALLS KIND AUTH ON PURPOSE, and it is a SAFETY fallback rather
 * than a choice of implementation: `log` means "refuse nothing", and refusing nothing on a read
 * path that is already enforced would publish every private page. Selecting an implementation is
 * `../index.js`'s job; this is a floor underneath that choice. It applies while the mode is `log`,
 * on any deployment, for as long as both modes exist.
 */
async function readBlocked(ctx) {
  const { row, kind, user, subdomain, app, controller, cache } = ctx;
  if ((kind === 'pattern' || kind === 'page') && authMode() !== 'enforce') {
    return kindAuth.readBlocked(ctx);
  }
  // EVERY OTHER KIND — site, theme, tenant, dmsenv, source, view, component, page-edit and split
  // `:data` — was guarded on WRITE and open on READ, because kind auth's judge is write-only.
  // A resolver fault must not take the read path down, and under `log` the verdict was never
  // going to be used anyway, so an error falls back to allowing.
  try {
    const appForLookup = app || row.app;
    if (!appForLookup) return false;
    const key = `gate:${appForLookup}:${(user && user.id) ?? 'anon'}:${subdomain}`;
    let g = cache && cache.get(key);
    if (!g) {
      g = gate.createGate({ controller, app: appForLookup, user, subdomain });
      if (cache) cache.set(key, g);
    }
    return !(await g.judgeOne(row, 'read')).allow;
  } catch (e) {
    console.warn(`[row-auth] read gate failed for ${row.type} ${row.id}: ${e.message} — allowing`);
    return false;
  }
}

/**
 * May this caller see the LISTING for `app+type`?
 *
 * Coupled to `enforce` for the same reason `readBlocked` is: the inline rule it replaced gated
 * listings always, while the gate allows everything under `log`.
 */
async function listingBlocked(controller, ctx) {
  if (authMode() !== 'enforce') return kindAuth.listingBlocked(controller, ctx);
  const { app, parentKey, user, subdomain } = ctx;
  const patternRow = await controller.patternRowForPages(app, parentKey);
  // No content pattern → unrestricted, which is what a null from `getPatternAuthPermissions` has
  // always meant here.
  if (!patternRow) return false;
  const g = gate.createGate({ controller, app, user, subdomain });
  return !(await g.judgeOne(patternRow, 'read')).allow;
}

module.exports = {
  IMPL: 'row',
  // writes
  assertDataWrite: gate.assertDataWrite,
  dataAuthMode: gate.dataAuthMode,
  createJudge: gate.createJudge,
  planEdit: gate.planEdit,
  NO_CHANGE: gate.NO_CHANGE,
  // reads
  readBlocked, listingBlocked,
  // the gate's own surface, for callers that judge a row directly
  createGate: gate.createGate, rowAuthMode: gate.rowAuthMode, verdict: gate.verdict,
  isAppAdmin: gate.isAppAdmin, verbsFor: gate.verbsFor, holdsPermission: gate.holdsPermission,
  createRowJudge: gate.createRowJudge,
  VERBS: gate.VERBS,
  // datasets
  rowSourceAuth,
  // the modules themselves, for the differentials and the migration scripts
  rowAuthGate: gate, resolver: require('./rowAuth'), mergeAuth: require('./mergeAuth'),
  parentId: require('./parentId'),
};
