# Give a page's creator full access on it (`newPage` / `duplicate` stamp `authPermissions`)

**Initiatives:** [dms_page_editor_admin](../../../../../planning/initiatives/dms_page_editor_admin.md) · **Status:** next · **Created by:** rdubowsky@albany.edu · **Edited by:** —

**Project:** DMS library · **Topic:** auth · **Started:** 2026-10-02

## Objective

`page.format.js`'s `authPermissions` attribute already describes the intended default: "each page created
gets created with default permissions (if set in pattern), and assign full access (*) to the user who
created it". Core `newPage()` / `duplicate()` (`patterns/page/pages/edit/editFunctions.jsx`) never do
it. Implement it there so every pattern gets per-creator page ownership without theme code.

## Why it's logged

The TransportNY report tools needed exactly this and got it theme-side
(`planning/transportny/tasks/completed/report-edit-button-owner-gate.md`): `CreateReportButton` and Make a
copy build their own page row (`components/CreateReportButton/newReportPage.js`) with
`authPermissions: {users: {<creator>: ['*']}}`, because `newPage()` sets no `authPermissions` and returns
nothing to patch afterwards. The owner chose not to change core for that fix. If core does this, the
theme builder can go back to calling `newPage()`.

## How it works today (for whoever picks this up)

- A page-level `authPermissions` can ADD a user's grant: CMSContext `isUserAuthed(req, pageAuth)`
  (`patterns/page/siteConfig.jsx`) merges it onto the pattern's.
- Reaching `/edit/*` is pattern-only: the route guard (`dms-manager/_auth.js`) and PageEdit's first check
  read only the pattern grants (any of `create-page`/`edit-page`/`edit-page-permissions`/`publish-page`).
  So a creator grant only matters for users who hold at least `create-page` on the pattern.
- The section menu treats a section with no permissions of its own as editable by anyone in the editor
  (`sectionMenu.jsx` `canEditSection = !sectionHasPermissions || …`), so a creator grant doesn't lock
  OTHER pages' sections for a `create-page`-only user. Worth deciding in the same pass.

## Proposed changes

- `newPage()` and `duplicate()`: set `authPermissions` from the pattern's default (if any) plus
  `{users: {[user.id]: ['*']}}`.
- Decide whether `sectionMenu`'s permissive default should fall back to the page-merged
  `canEditPageContent` instead.

## Testing checklist

- [ ] A `create-page`-only user creates a page and can edit + publish it; can't edit someone else's.
- [ ] Patterns without auth set up are unaffected.
