# Permissions: a row with no grants is read-only (read allowed, edit refused)

**Initiatives:** [dms_permissions_move](../../../../../planning/initiatives/dms_permissions_move.md) (primary), [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** doing · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

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

## Progress

**2026-10-30: step 4 (audit) built.**
- `dms-server/src/scripts/permissions-access-diff.blank.js`: `judgeBlank(write, user, owners)`. **Driven by the
  rules file** (owner 2026-10-30): each write runs through `authRules.js` + `authJudge.js` (the
  `DMS_DATA_AUTH_JUDGE=data` trial) twice, with today's `holds` and with the read-only one (no grants ⇒ explicit
  grants only, `public` counts). The module knows no row kind; the script resolves the rules' eight owner names
  from the loaded rows, as `dataAuth.js` `resolveOwner` does. A third pass with nothing held finds which owners'
  grants are empty, since the interpreter stops at the first rule that allows (site `*` escape, app Admin).
  Kinds with no rule (chat `channel`, …) are counted, not judged (decision 8). change_log keeps no patch, so an
  edit is judged with no keys: the rules' `noChange` set; a page edit is proposed as `edit-page` even if it was a
  publish.
- The open-pattern rule (decision 5) comes from the rules' `ifOwnerBlank` clause (added 10-30), so a no-grant
  pattern's edits by non-`view-pattern-list` holders show as `refused today too`, as `judge()` decides them.
  Blank owners behind that clause are recorded through the interpreter's `env.isBlank` hook.
- `permissions-access-diff.js`: `--days <n>` (default 30); reads every change_log write in the window. New outputs
  `blank-rows.csv` (kind, row, which grants were blank, user, writes, last, outcome: `refused` / `kept (…)` /
  `refused today too`, `row_gone`), `blank-grants.json` (grants.json shape) and a "Blank rows" section in
  `remediation.md`. Deleted rows get no proposed grant.
- Test: `npm run test:blank-audit` (`tests/test-permissions-blank-audit.js`, 7/7, SQL fixtures on `cli-test`).
  `test-data-auth` 51/51 and `test-source-auth` 50/50 unchanged.
- **Next:** run it per prod site where mercury is reachable (needs VPN, as the access-diff baseline):
  `node src/scripts/permissions-access-diff.js --auth auth-sqlite --dms dms-sqlite --app <app>`; then step 1 (one
  read-verb list, server + client).

**2026-11-02: prod audit run; steps 1 and 2 built (server); step 5 deferred (owner).**
- **Prod audit** (VPN), every site in `deploy/targets.json` plus avail, under a read-only Postgres session
  (`PGOPTIONS='-c default_transaction_read_only=on'`; a probe `CREATE TEMP TABLE` was refused first). Output in
  dms-template `scratchpad/permissions-access-diff/2026-11-02/<app>/`. Blank-row result, last 30 days:

  | app | blank-row writes | refused by the rule | kept by |
  |---|---|---|---|
  | mitigat-ny-prod (hazmit_dama) | 648 (502 user × row lines, 7 users) | 0 | site `*` (all) |
  | npmrdsv5 (npmrds2) | 406 lines | 0 | site `*` (AVAIL) |
  | wcdb | 39 lines | 0 | `wcdb Admin` |
  | qa_test | 43 lines | 0 | `qa_test Admin` |
  | landbank, avail | none | 0 | — |

  Not judged (no rule; decision 8): mitigat-ny-prod `symbology` 2. **No recent editor loses a write.**
  mitigat-ny-prod's full matrix runs out of memory even at a 12 GB heap (the `losses` array: users × sources ×
  ops); `--blank-only` (new) skips the matrix. Its access-diff baseline is still unrun: stream `losses` to disk
  to get it.
- **Step 1 + 2** (`routes/dms/auth.js`): `READ_PERMISSIONS` (`view-page`, `view-pattern-list`, `view-source`,
  `view-sources`, `view-source-api`, `download-source`). **Design note:** a request is a read when it names
  ANY read verb. A permission list means "any of", and a blank row grants every read verb, so
  `dms.route.js`'s `PATTERN_READ_PERMISSIONS` (`view-page` or the pattern edit verbs) stays open; "every verb is
  a read" would have closed every blank pattern to readers. `view-as` is not a read.
  - `isUserAuthed` is the new rule: on grants with nothing beyond `public`, a read passes as before, an edit
    needs an explicit grant (`holdsExplicitly`, `public` grants count). `isUserAuthedOpen` is the old rule.
    `blankRowRefusal(opts)` says when only the new rule refuses. `holdsExplicitly` moved here from sourceAuth
    (re-exported).
  - **Modes:** `decideSource` / `decidePattern` / the data judge (`holds`) use the new rule, so `enforce`
    refuses; `legacyAllows` keeps `isUserAuthedOpen`, so `legacy` / `log` give the old answer. Refusals and
    would-deny lines end `; blank row (no grants: edits need an explicit grant)` when the blank-row rule made
    them (the data judge records it per decision).
  - `readAuth.js holdsOnSource` (what a reply carries: full grants, secrets) takes edit verbs and had no mode:
    it uses the new rule only when `DMS_SOURCE_AUTH_MODE=enforce`.
  - **Not switched, on purpose:** the auth server (`auth/utils/permissions.js`) keeps `isUserAuthedOpen`: this
    task lists no auth-server caller, and wcdb / avail's auth rows have no grants (they'd lose user management).
    **Owner call** whether the auth row follows the rule. The audit scripts keep the old rule for "today".
  - Effect worth knowing: a site whose admin and auth rows grant nothing used to give every signed-in user site
    `*` (and through it every page edit); under `enforce` that's closed. All six prod sites have site grants.
- **Step 5 (client gates): deferred** (owner 2026-11-02, "Client later"): client gates keep the old open rule
  until the switch to `enforce`; do step 5 then. (Alternative offered: client follows the server's mode.)
- Tests: `test-data-auth` 53/53 (also with `DMS_DATA_AUTH_JUDGE=data`), `test-source-auth` 53/53; the old
  "no grants → open" tests now assert the new rule, plus: public grant / own grant still open a blank page, log
  line says `blank row`, mixed any-of list is a read, external blank source log vs enforce. Unchanged: read-auth 25,
  uda-auth 28, upload-auth 37, schedule-auth 13, datatype-auth 9, auth-permissions 21, auth-platform 14,
  auth-groups 23, auth-users 26, site-grants 8, blank-audit 7, jwt 8, sync 95, graph, workflow.

## Plan

Next up (hub "Next work", 2026-10-30). Start with step 4, the audit, before touching `isUserAuthed`.

1. ✅ (server, 2026-11-02) **One list of read verbs**, server and client (mirrored), next to `isUserAuthed`. A verb not on it is an edit. Client mirror comes with step 5.
2. ✅ (2026-11-02) **`isUserAuthed` refuses an edit verb on blank grants**; the read path is untouched. Behind the existing modes:
   under `log`, the old answer stands and the would-deny line says `blank row`.
3. **The exceptions above** stay where they are (`isAppAdmin`, the site `*` escapes, `patternCan`).
4. **Audit first.** ✅ Built 2026-10-30 (prod runs pending, see Progress). Extend `scripts/permissions-access-diff.js`:
   per app, the rows and sources with no grants up the chain, who edited them in the last 30 days (change_log), and
   the grant that would keep that access. Run it per site before any `enforce`.
5. ⏸ (deferred to the enforce switch, owner 2026-11-02) **Client gates** follow the same rule, so a control isn't shown for an edit the server refuses.

## Open

- Pattern types whose rows are written by every member (chat messages, tickets): they need explicit grants (or
  `public` grants) before `enforce`, or their rules in pattern data ([pattern-auth-rules-as-data.md](./pattern-auth-rules-as-data.md)).
- New sources carry a creator grant already; new pages and patterns don't. Decide whether create seeds one.

## Testing checklist

- [~] Each mode: a blank page, pattern, source, view and data row refuse edits under `enforce`, log under `log`.
      Unit-tested for page and external source (data-auth, source-auth); pattern / view / data rows and a live rig
      pass still to do.
- [~] Reads of the same rows are unchanged (read-auth 25/25, graph, sync unchanged; live pass to do).
- [ ] `${app} Admin`, site `*`, and `view-pattern-list` (pattern rows) still edit.
- [ ] A page with no grants under a pattern with grants follows the pattern's.
- [ ] Datasets Settings (`uda.settings.update`) on a no-grant datasets pattern: refused for a signed-in user without
      grants under `enforce`; the page's save control is hidden for them (decision 6).
- [x] The audit lists every blank row a recent editor touched (`tests/test-permissions-blank-audit.js`, 7/7).

### Progress 2026-11-02 (later): the auth row follows the rule

Owner: "for auth row, no grants = only admins can edit"; "levels still count if log is on, in enforce they
don't". Built in `dms-server/src/auth/utils/permissions.js` behind a new mode, **`DMS_AUTH_ROW_MODE`**
(`legacy` / `log` default / `enforce`), like the other guards:
- `can()`: `enforce` uses `isUserAuthed` (every auth-row verb is an edit, so a row with no grants passes only
  `${app} Admin`; AVAIL keeps its own platform checks). `log` keeps the old answer and writes
  `[auth-row] would deny …` + an access-log row (guard `auth`). `legacy`: old answer, no line.
- `levelCounts()` (behind `authority().byLevel` and `canOrLevel`): on a row with no grants the level
  fallback doesn't count under `enforce`, counts with a would-deny line under `log`. Rows with grants and
  requests with no usable auth row keep the level fallback in every mode.
- No separate rule or storage: it's the same blank-row rule, `${app} Admin` already passes first.
- Tests: auth-permissions 24, auth-users 27 (old open-row tests pinned to `log`, enforce cases added), green
  under all three modes; auth-groups 23, auth-platform 14, site-grants 8, access-log 12.
- Before the switch: wcdb's and avail's auth rows have no grants, so under `enforce` only their
  `${app} Admin` members manage users. Check their `[auth-row]` would-deny lines first.
