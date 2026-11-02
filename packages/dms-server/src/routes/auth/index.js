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
 * `DMS_AUTH_IMPL` — `kind` (default) | `row`
 *
 * The default is `kind` (owner, 2026-11-02): kind auth and nothing else, on every surface. Row auth
 * is opt-in and nothing a missing variable can switch on.
 *
 * ⚠ UNDER `kind`, THE ROW-AUTH FLAGS ARE INERT. `DMS_WRITE_GATE=row` and `DMS_UDA_GATE=row` are
 * read INSIDE the row modules, which this switch never loads, so setting them changes nothing.
 * `DMS_ROW_AUTH_MODE=enforce` likewise decides nothing. Two things are lost that the `row` setting
 * gives you even with every mode at its default:
 *
 *   1. the row gate's REPORTING for the nine kinds kind auth never gated on read — site, theme,
 *      tenant, dmsenv, source, view, component, page-edit and split `:data`. Under `kind` those
 *      reads are simply open and nothing says so.
 *   2. `DMS_WRITE_GATE` / `DMS_UDA_GATE` as working switches at all.
 *
 * Because that is easy to set and not notice, `warnInertFlags()` below says so at startup rather
 * than leaving someone to read a would-deny log that will never be written.
 *
 * `DMS_AUTH_IMPL=row` selects the row modules. It still changes no VERDICT on its own: pattern and
 * page fall back to kind auth unless `DMS_ROW_AUTH_MODE=enforce`, and writes forward to kind auth
 * unless `DMS_WRITE_GATE=row`. Choosing an implementation and turning on enforcement stay separate
 * decisions, with separate blast radii.
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
const IMPL = String(process.env.DMS_AUTH_IMPL || 'kind').toLowerCase() === 'row' ? 'row' : 'kind';

/**
 * Say so when a row-auth flag is set but `kind` is selected, because the flag then does nothing and
 * nothing else would ever mention it. Never throws and never changes a verdict — it only tells the
 * truth about the configuration it was handed.
 */
function warnInertFlags() {
  if (IMPL !== 'kind') return;
  const inert = [
    ['DMS_WRITE_GATE', 'row'], ['DMS_UDA_GATE', 'row'], ['DMS_ROW_AUTH_MODE', 'enforce'],
  ].filter(([k, v]) => String(process.env[k] || '').toLowerCase() === v)
   .map(([k, v]) => `${k}=${v}`);
  if (!inert.length) return;
  console.warn(
    `[auth] DMS_AUTH_IMPL=kind, so ${inert.join(', ')} ${inert.length > 1 ? 'are' : 'is'} INERT — ` +
    `read only by the row modules, which this switch does not load. Set DMS_AUTH_IMPL=row to use them.`);
}
warnInertFlags();

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
