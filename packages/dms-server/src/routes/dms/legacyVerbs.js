'use strict';

/**
 * TRANSITIONAL: what today's permission vocabulary confers structurally.
 *
 * The model is that a pattern declares its own vocabulary and what each verb implies
 * (`authVocabulary` on the pattern row — hub, "Where `implies` is applied"). This file is the
 * compatibility shim for grants written BEFORE any pattern declares one, and it is the only place
 * in the server that names a pattern's verbs. It is data, in one place, and it is meant to be
 * deleted once every pattern declares its own.
 *
 * ---------------------------------------------------------------------------
 * Why it has to exist, measured
 *
 * Judging a migrated clone of `mitigat-ny-prod` with no mapping: of 40 sampled pattern rows, reads
 * were allowed on exactly the **28 that carry no grants at all** (unstated ⇒ readable, rule 5) and
 * refused on all **12 that do** — because their grants say `view-page`, `edit-page`,
 * `view-pattern-list`, and none of those is a structural verb. Enforcing without this would deny
 * reads precisely where someone had bothered to configure access. It fails closed, which is the
 * safe direction, but it is not a usable state.
 *
 * ---------------------------------------------------------------------------
 * Scope
 *
 * Legacy grants are FLAT — one object that governs the row and its descendants alike (today
 * `patternCan` reads it for `edit-pattern` and the page gate reads the same object for pages). So a
 * legacy verb maps to structural verbs without a scope, and the flat object keeps meaning both.
 * `self` / `descendants` only ever appear on grants written after a pattern declares a vocabulary.
 */

/** Pattern verb → the structural verbs it confers. Anything absent confers nothing. */
const LEGACY_IMPLIES = Object.freeze({
  // reads
  'view':               ['read'],      // bare, on section rows (patterns/page/page.format.js)
  'view-page':          ['read'],
  'view-pattern-list':  ['read'],
  'view-sources':       ['read'],
  'view-source':        ['read'],

  // writes
  'edit':               ['edit'],      // bare, on section rows
  // `delete` as well as `edit`: kind auth requires exactly `edit-page` to delete a page
  // (dataAuth.js, `op === 'delete'` on the page branch), and that is shipped behaviour. Approved
  // 2026-10-29. No `create` — see row-auth-dms-writes.md, "what a create is judged against".
  'edit-page':          ['read', 'edit', 'delete'],
  'edit-pattern':       ['read', 'edit'],
  'update-source':      ['read', 'edit'],
  // What the kind gate asks for on a `:data` row write (dataAuth.js, `case 'data'`) and what
  // `metadata.isEditable` is being replaced by (row-auth-uda.md). Absent from this table until
  // 2026-10-29, which made every grant written with it inert under row auth.
  'edit-source-data':   ['read', 'edit'],
  'manage-themes':      ['read', 'edit'],
  'manage-tenants':     ['read', 'edit'],
  'publish-page':       ['read', 'edit'],
  'edit-page-params':   ['read', 'edit'],

  // creates — governed against the PARENT, which is why they are their own verb
  'create-page':        ['read', 'create'],
  'create-pattern':     ['read', 'create'],
  'create-view':        ['read', 'create'],
  'create-source':      ['read', 'create'],

  // deletes
  'delete-pattern':     ['read', 'delete'],
  'delete-source':      ['read', 'delete'],

  // the escalation guard: writing the grants themselves
  'edit-page-permissions':    ['read', 'edit', 'grant'],
  'edit-pattern-permissions': ['read', 'edit', 'grant'],
  'edit-source-permissions':  ['read', 'edit', 'grant'],

  // deliberately absent — UI capabilities with no row behind them, which is the whole reason the
  // server vocabulary is five and not twenty-one:
  //   download-source, view-source-api, manage-downloads, view-as, auth-users, auth-groups
});

/**
 * Expand one principal's granted verbs with whatever they confer structurally.
 *
 * Additive and idempotent: the original strings are kept so the CLIENT can still check its own
 * vocabulary, and a grant that already names structural verbs is unchanged. `'*'` is left alone —
 * it already means every verb, and expanding it would freeze today's list into the data.
 */
function expandLegacy(perms, implies = LEGACY_IMPLIES) {
  const list = Array.isArray(perms) ? perms : (perms ? [perms] : []);
  if (list.includes('*')) return list;
  const out = new Set(list);
  for (const p of list) for (const s of (implies[p] || [])) out.add(s);
  return [...out];
}

/** Expand every principal in a resolved `{groups, users, otherwise}` object. */
function expandAuth(auth, implies = LEGACY_IMPLIES) {
  if (!auth || typeof auth !== 'object') return auth;
  if (auth.self || auth.descendants) {
    const out = {};
    if (auth.self) out.self = expandAuth(auth.self, implies);
    if (auth.descendants) out.descendants = expandAuth(auth.descendants, implies);
    return out;
  }
  const out = {};
  for (const kind of ['groups', 'users']) {
    if (!auth[kind]) continue;
    out[kind] = {};
    for (const [who, perms] of Object.entries(auth[kind])) out[kind][who] = expandLegacy(perms, implies);
  }
  if (auth.otherwise !== undefined) out.otherwise = expandLegacy(auth.otherwise, implies);
  return out;
}

module.exports = { LEGACY_IMPLIES, expandLegacy, expandAuth };
