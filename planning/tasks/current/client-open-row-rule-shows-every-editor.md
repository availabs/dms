# Client: a row that grants only `public` is "open", so every signed-in member sees every editor on it

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

`utils/auth.js isUserAuthed` (line ~70): *"if user is logged in and auth has not been set up (beyond public
group) → allow"*. A pattern, page or source whose grants name nobody but `public` is treated as OPEN on the
client: any signed-in user, in any group of the project, passes every `reqPermissions` check on it — the page
editor's pane bar, Settings, Pages, Permissions, Publish; the pattern editor's tabs; the datasets Admin tab.
The server's judge has no such rule: it refuses (under `enforce`) or logs a would-deny (under `log`) for the
same user. Under `log` the UI therefore shows editors whose saves the server would refuse once enforced; under
`enforce` the user gets a working-looking editor and a failed save.

**Found 2026-11-07** by `planning/shared/skills/auth-ui-check` (dms-template) on `mitigat-ny-prod`: a scratch
page pattern created with `{ groups: { public: ['view-page'] } }` opened in full edit mode for a user whose only
group is `mitigat-ny-prod Public` (screenshot `scratchpad/mitigat-ny-prod/auth-ui/nogroup/pattern_access_edit_before.png`).
The suite now gives its scratch pattern an `AVAIL: ['*']` grant to step around the rule; real patterns on that
site all name a group, so the rule does not bite there today — it bites the moment an author clears a pattern's
grants, which the Access editor allows.

## Proposed fix

Delete the open-row branch: the default must be inheritance, never permission (`CLAUDE.md`, "Auth is the live
case"). A row with no grants beyond `public` inherits its parent's; a chain that grants nothing refuses. The
Access editor's "the site grants nothing yet: only the site admins group can manage it" hint already states the
intended rule for the site row. Check the two callers that rely on the leniency: `useManagePageGate` (auth
manage pages: "allows any member while the auth pattern grants nothing beyond public") and the admin siteConfig's
`getMenuItems` comment. Both should read the site row's `auth-users` / `auth-groups` after the site sweep
(`auth-grants-on-the-owner-row.md`).

## Testing checklist

- [ ] A signed-in member in no granting group opens `/<pattern>/edit/<slug>` on a public-only pattern: no pane bar.
- [ ] The same user on a pattern that grants them `edit-page`: the pane bar, as before.
- [ ] auth-ui-check `pattern_access` passes with the scratch pattern's `AVAIL` grant removed.
