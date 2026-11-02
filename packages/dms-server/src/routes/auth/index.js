'use strict';
/**
 * THE AUTH SWITCH — one place that decides which authorization implementation this server runs,
 * and the only module the rest of the server should import auth from.
 *
 *     const { assertDataWrite, readBlocked, NO_CHANGE } = require('../auth');
 *
 * Two implementations live side by side under this folder and export the SAME contract:
 *
 *   kindAuth/   decides by ROW KIND — a switch over the kinds, each with hand-written rules.
 *               `authRules.js` + `authJudge.js` are a sub-mode of it (`DMS_DATA_AUTH_JUDGE=data`),
 *               which swaps the switch for an interpreter over declared rules.
 *   rowAuth/    decides by the ROW's own grants and its PARENT CHAIN — one `verdict()` reached by
 *               three adapters, gaining no branch when a pattern is added.
 *
 * THE ROOT OF THIS FOLDER IS THE SWITCH PLUS WHAT BOTH SIDES GENUINELY USE, and nothing else:
 *
 *   auth.js            is this caller authed, and what do stored grants resolve to for a subdomain
 *   noChange.js        the sentinel for an edit that changes nothing — ONE Symbol, both sides
 *   sourceSnapshot.js  the datasets read snapshot both implementations then decide from
 *
 * Verb machinery (`authVocabulary.js`, `legacyVerbs.js`, `expandLevel.js`) and the column probe
 * (`rowAuthCaps.js`) live in `rowAuth/`, because they are row auth's: kind auth's `isUserAuthed`
 * matches verbs by NAME and cannot expand anything, and the columns probed are the ones row auth
 * added. `sourceSnapshot.js` imports three of them — it pre-expands for the row gate while it has
 * the rows in hand, which is a caching decision, not shared logic. The note at those requires says
 * why that is safe for kind auth.
 *
 * ---------------------------------------------------------------------------
 * `DMS_AUTH_IMPL` — `row` (default) | `kind`
 *
 * ⚠ THE DEFAULT IS `row` BECAUSE THAT IS WHAT THIS BRANCH ALREADY DOES, not because row auth is
 * switched on. `rowAuth/index.js` reproduces the previous dispatch exactly — pattern and page fall
 * back to kind auth unless `DMS_ROW_AUTH_MODE=enforce`, and writes forward to kind auth unless
 * `DMS_WRITE_GATE=row` — so selecting it changes no verdict under default modes. What it preserves
 * is the row gate's REPORTING for the nine kinds kind auth never gated on read (site, theme,
 * tenant, dmsenv, source, view, component, page-edit, split `:data`): under `log` those are judged
 * and a would-deny line is written. Defaulting to `kind` would silently stop that, which is the
 * one thing a refactor of this file must not do.
 *
 * `DMS_AUTH_IMPL=kind` is the honest opposite: kind auth and nothing else, on every surface.
 *
 * ⚠ THIS SWITCH DOES NOT, BY ITSELF, ENFORCE ANYTHING. Each implementation keeps its own rollout
 * mode, and selecting `row` while those modes sit at their defaults changes no verdict:
 *
 *   DMS_ROW_AUTH_MODE    legacy | log (default) | enforce   — row-auth reads
 *   DMS_DATA_AUTH_MODE   legacy | log (default) | enforce   — writes, either side
 *   DMS_WRITE_GATE       kind (default) | row               — which judge writes use
 *   DMS_UDA_GATE         kind (default) | row               — which judge datasets use
 *   DMS_SOURCE_AUTH_MODE / DMS_READ_AUTH_MODE                — the datasets surfaces
 *
 * Those predate this switch and still work; `DMS_AUTH_IMPL` chooses which MODULES answer, not how
 * strictly they answer. The two axes are deliberately separate — picking an implementation and
 * turning on enforcement are different decisions with different blast radii, and the programme
 * (planning/tasks/current/row-auth-consolidate.md) stages them apart on purpose.
 *
 * Task 7 Phase 4 deletes `kindAuth/` and this switch with it, leaving `rowAuth/` as the only
 * decision module. Until then, both are here and which one runs is stated rather than implied.
 */
const IMPL = String(process.env.DMS_AUTH_IMPL || 'row').toLowerCase() === 'kind' ? 'kind' : 'row';

const impl = IMPL === 'row' ? require('./rowAuth') : require('./kindAuth');

module.exports = {
  AUTH_IMPL: IMPL,
  // ---- the contract both implementations answer ----
  assertDataWrite: impl.assertDataWrite,
  dataAuthMode: impl.dataAuthMode,
  createJudge: impl.createJudge,
  planEdit: impl.planEdit,
  readBlocked: impl.readBlocked,
  listingBlocked: impl.listingBlocked,
  // ---- shared, implementation-independent ----
  ...require('./auth'),                       // isUserAuthed, resolveAuthPermissions
  ...require('./noChange'),                   // NO_CHANGE — one Symbol, both sides
  sourceSnapshot: require('./sourceSnapshot'),
  // ---- the selected implementation, and both by name ----
  impl,
  kindAuth: require('./kindAuth'),
  rowAuth: require('./rowAuth'),
};
