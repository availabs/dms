'use strict';

/**
 * KIND auth for READS — the `pattern` and `page` branches lifted out of `dms.route.js`, verbatim.
 *
 * Task: planning/tasks/current/row-auth-consolidate.md (task 7), Phase 0.
 *
 * **This is a pure extraction. Nothing here decides differently than the inline code it replaced.**
 * The point is to make the old rule CALLABLE: it only ever existed inside a Falcor route handler,
 * so nothing could compare it with the resolver, and "prove equivalence before deleting it" was
 * impossible to even attempt. `migrate-row-auth.js --diff-reads` calls both.
 *
 * It joins `dataAuth.js` (kind writes) and `uda/sourceAuth.js` (kind datasets) as a module whose
 * whole purpose is to be deleted — by task 7's Phase 2, once the diff is clean.
 *
 * ---------------------------------------------------------------------------
 * What it carries that the resolver does not
 *
 *   1. The **auth/admin exemption** — a `pattern_type` NAME check, which `src/dms/CLAUDE.md`
 *      forbids and no third pattern can opt into. Phase 1 replaces it with a declared capability.
 *   2. The **pattern vocabulary**: a pattern row is readable by anyone holding any of
 *      `PATTERN_READ_PERMISSIONS`, not just `view-page`, so a user granted only `edit-pattern` can
 *      open it in the Pattern Editor.
 *   3. The **page merge**: pattern ⊕ page, where a page entry REPLACES the pattern's for that
 *      principal. Note this is a two-level spread with no clamp — `mergeAuth.js` rule 3 would
 *      additionally stop a page WIDENING what the pattern gave a principal. That difference is
 *      expected to show up in `--diff-reads`, and it is the resolver being stricter.
 */

const { isUserAuthed, resolveAuthPermissions } = require('./auth');
const { getParent } = require('#db/type-utils.js');

/**
 * A pattern row is readable by anyone who may read it OR administer it.
 *
 * `view-pattern` is the pattern-row read verb (admin.format.js's shared `admin+pattern` domain).
 * `view-page` is accepted ALONGSIDE it during the migration and must not be removed until stored
 * grants are backfilled: every grant on rowauth-test sits under the wildcard scope `*`, which
 * satisfies self and descendants alike, so the 172 `view-page` grants on page patterns are what
 * earns the pattern-row read today. Dropping it before the backfill stops every page loading.
 *
 * `delete-pattern` is NOT here. It moved to the site format (owner, 2026-10-30) and a site-level
 * verb is not a way to earn a read on a pattern row.
 */
const PATTERN_READ_PERMISSIONS = ['view-pattern', 'view-page', 'edit-pattern', 'edit-pattern-permissions'];

/**
 * Today's read verdict for a `pattern` or `page` row. Returns `true` when the read is BLOCKED.
 *
 * `patternAuthOf(app, parentKey)` is supplied by the caller so the route keeps its per-response
 * cache and the harness can supply its own loader.
 *
 * Any other kind returns `false` — unchanged: before the row-auth gate, nothing else was gated on
 * read at all.
 */
async function kindReadBlocked({ row, kind, user, subdomain = '', app, patternAuthOf }) {
  if (kind === 'pattern') {
    // Auth patterns (login page) are always publicly accessible. So is the
    // site's admin pattern row (`{instance}|admin:pattern`): it only holds
    // routing/branding config (base_url, subdomain, theme, authPermissions)
    // that the no-access stub already returns, and hiding it only
    // stubs it in anonymous boots, which stops the client caching its site
    // snapshot (persistSiteSnapshot). Access to the admin PANEL is decided
    // client-side by the site-level permissions, not by this read.
    // ⚠ Never store anything secret on an auth or admin pattern row — it
    // is readable by everyone.
    // NB: this does NOT extend to pages — getPatternAuthPermissions
    // (dms.controller.js) still only exempts auth.
    const pattern_type = row.data?.pattern_type || row?.pattern_type;
    if (pattern_type === 'auth' || pattern_type === 'admin') return false;
    const authPermissions = resolveAuthPermissions(row.data?.authPermissions || row?.authPermissions, subdomain);
    // The admin panel's pattern-level permissions also load the pattern
    // row (not its pages): a user granted only edit-pattern must be able
    // to open it in the Pattern Editor. Page reads below stay
    // view-page-only, so admin permissions never expose page content.
    // (dms planning/tasks/completed/admin-granular-permissions.md)
    return !isUserAuthed({ user, reqPermissions: PATTERN_READ_PERMISSIONS, authPermissions });
  }

  if (kind === 'page') {
    // Merge pattern-level and page-level authPermissions.
    // Pattern sets the base; page-level entries override per group/user key.
    // getPatternAuthPermissions returns null for auth patterns (unrestricted).
    const appForLookup = app || row.app;
    if (!appForLookup) return false;
    const patternAuth = await patternAuthOf(appForLookup, getParent(row.type));
    const pageAuth = resolveAuthPermissions(row.data?.authPermissions || row?.authPermissions, subdomain);
    const mergedAuth = {
      groups: { ...(patternAuth?.groups || {}), ...(pageAuth?.groups || {}) },
      users:  { ...(patternAuth?.users  || {}), ...(pageAuth?.users  || {}) },
    };
    return !isUserAuthed({ user, reqPermissions: ['view-page'], authPermissions: mergedAuth });
  }

  return false;
}

/** Which kinds this module decides. Everything else was ungated on read before the gate existed. */
const KIND_READ_KINDS = Object.freeze(['pattern', 'page']);

module.exports = { kindReadBlocked, PATTERN_READ_PERMISSIONS, KIND_READ_KINDS };
