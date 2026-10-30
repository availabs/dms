# Permissions: a row with no grants is read-only (read allowed, edit refused)

**Initiatives:** [dms_permissions_move](../../../../../planning/initiatives/dms_permissions_move.md) (primary), [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

## Objective

Owner decision 2026-10-29 (hub [auth-levels-to-permissions.md](./auth-levels-to-permissions.md), "Decisions
2026-10-29", 1): **a row with no grants, and none inherited, can be read by anyone and edited by no one.** It replaces
the 2026-10-23 rule "no permission set → open" for edits; reads stay as they are. It matches amuro's
`server-side-auth-general.md` ("A blank row: allow read, deny edit").

Who can still edit a row with no grants:
- `${app} Admin`, and site `*` holders (decision 4);
- for a pattern row with no grants, site `view-pattern-list` holders (decision 5, kept);
- whoever a grant up the chain names (a page with no grants inherits its pattern's).

## Where the open rule lives today

The rule is one branch of `isUserAuthed`, server `routes/dms/auth.js:45` ("No restrictions … and user is logged in →
allow") and client `packages/dms/src/utils/auth.js:64`. It is used for reads and writes alike, so the change is a
**verb split**, not an edit of that branch:
- read verbs (`view-page`, `view-source`, `view-sources`, `download-source`, …) keep "no grants → open";
- every other verb on a row with no grants is refused.

Callers to switch: `dataAuth.js` (`holds`), `sourceAuth.js` (`decideSource`, `decidePattern` — this also closes
decision 6: `uda.settings.update` lets any signed-in user save a no-grant datasets pattern's settings today, and the
owner chose to let this task fix it rather than a separate `view-pattern-list` check), `readAuth.js`
(reads, unchanged in effect), the plugin helpers (`dama/datatypes/auth.js`), the upload routes, and the client
gates (`utils/auth.js`, `adminPermissions.js`, the datasets gates). `permissions.js` (auth server) has no open rule.

## Plan

Next up (hub "Next work", 2026-10-30). Start with step 4, the audit, before touching `isUserAuthed`.

1. **One list of read verbs**, server and client (mirrored), next to `isUserAuthed`. A verb not on it is an edit.
2. **`isUserAuthed` refuses an edit verb on blank grants**; the read path is untouched. Behind the existing modes:
   under `log`, the old answer stands and the would-deny line says `blank row`.
3. **The exceptions above** stay where they are (`isAppAdmin`, the site `*` escapes, `patternCan`).
4. **Audit first.** Extend `scripts/permissions-access-diff.js`: per app, the rows and sources with no grants up the
   chain, who edited them in the last 30 days (change_log), and the grant that would keep that access. Run it per
   site before any `enforce`.
5. **Client gates** follow the same rule, so a control isn't shown for an edit the server refuses.

## Open

- Pattern types whose rows are written by every member (chat messages, tickets): they need explicit grants (or
  `public` grants) before `enforce`, or their rules in pattern data ([pattern-auth-rules-as-data.md](./pattern-auth-rules-as-data.md)).
- New sources carry a creator grant already; new pages and patterns don't. Decide whether create seeds one.

## Testing checklist

- [ ] Each mode: a blank page, pattern, source, view and data row refuse edits under `enforce`, log under `log`.
- [ ] Reads of the same rows are unchanged.
- [ ] `${app} Admin`, site `*`, and `view-pattern-list` (pattern rows) still edit.
- [ ] A page with no grants under a pattern with grants follows the pattern's.
- [ ] Datasets Settings (`uda.settings.update`) on a no-grant datasets pattern: refused for a signed-in user without
      grants under `enforce`; the page's save control is hidden for them (decision 6).
- [ ] The audit lists every blank row a recent editor touched.
