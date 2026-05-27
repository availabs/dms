# Permissions Refinement (Page + Section) — COMPLETED 2026-05-20

## Objective

Consolidate and simplify the DMS three-level permission system (Pattern → Page → Section). Remove unnecessary granularity that added friction for authors without providing useful control.

## Scope

### In

- Remove `edit-page-layout` and `edit-page-params` from page `permissionDomain` (absorbed by `edit-page`)
- Remove `edit-section-permissions` from section `permissionDomain` (section permissions editing is now gated by page-level `edit-page-permissions`)
- Rename `edit-section` → `edit` at section level, keeping `edit-section` as a backward-compat alias in auth checks
- Pages pane in edit toolbar requires `create-page` permission (was ungated)
- Copy/Link pills in section menu: visible to anyone with page-level `edit-page`, not just users with section `edit`
- Move Up / Move Down pills in section menu: require `canEditSection` in addition to `canEditPageLayout`
- Permissions item in section layout menu: requires both `canEditSectionPermissions` (page-level) AND `canEditSection`
- `PublishButton`: use page-level `authPermissions` override (was pattern-level only)
- Edit page (`pages/edit/index.jsx`): redirect logged-in users without edit access to the view page; show existing message for unauthenticated users

### Out

- Section `view` permission (beyond `hideInView` flag) — toggle in section display menu handles it
- `isSectionAuthed` helper — existing `isUserAuthed` with empty permissions returns `true` (no restriction), which is correct behavior
- Any migration of stored permission data — auth checks accept both old and new names

## Permission Model

### Page level

| Permission | Behavior |
|---|---|
| `view-page` | User can view the page |
| `edit-page` | Unlocks edit toolbar (Settings, Data Sources, Section Groups, History). Also enables copy/link on section menu |
| `create-page` | Adds Pages pane to toolbar |
| `edit-page-permissions` | Adds Permissions pane to toolbar + Permissions item in section menu |
| `publish-page` | Shows Discard + Publish buttons |
| `*` | All of the above |

Removed: `edit-page-layout`, `edit-page-params` (absorbed by `edit-page`)

### Section level

| Permission | Behavior |
|---|---|
| `edit` (alias: `edit-section`) | Full section edit menu. Absent = copy/link only (if user has page `edit-page`) |
| `*` | Same as `edit` |

Removed: `edit-section-permissions` (moved to page level)

### Key invariant

No permissions set = open to all. `isUserAuthed` returns `true` when `authPermissions` has no groups/users — no restriction means everyone gets access.

## Files Changed

### `src/dms/packages/dms/src/patterns/page/page.format.js`

- [x] Page `permissionDomain`: removed `edit-page-layout`, `edit-page-params`
- [x] Section `permissionDomain`: removed `edit-section-permissions`, renamed `{label: 'Edit Section', value: 'edit-section'}` → `{label: 'Edit Section', value: 'edit'}`

### `src/dms/packages/dms/src/patterns/page/siteConfig.jsx`

- [x] Edit route `reqPermissions`: removed `edit-page-layout`, `edit-page-params`

### `src/dms/packages/dms/src/patterns/page/pages/edit/editPane/index.jsx`

- [x] Pages pane config: added `reqPermissions: ['create-page']`
- [x] Toolbar visibility check `reqPermissions`: removed `edit-page-params` (was `['edit-page', 'edit-page-params', 'edit-page-permissions']`, now `['edit-page', 'edit-page-permissions']`)

### `src/dms/packages/dms/src/patterns/page/components/sections/section.jsx`

- [x] `SectionEdit` and `SectionView`: added `canEditPageContent = isUserAuthed(['edit-page', 'edit-page-layout'], pageAuthPermissions)` and passed it into `getSectionMenuItems` auth object
- [x] `canEditSection`: updated to `isUserAuthed(['edit', 'edit-section'], sectionAuthPermissions)` (backward-compat alias)

### `src/dms/packages/dms/src/patterns/page/components/sections/sectionMenu.jsx`

- [x] Auth destructure: added `canEditPageContent`
- [x] `canEditSection`: `isUserAuthed(['edit', 'edit-section'], sectionAuthPermissions)` — backward compat
- [x] `canEditPageLayout`: `isUserAuthed(['edit-page', 'edit-page-layout'], pageAuthPermissions)` — backward compat
- [x] `canEditSectionPermissions`: changed from section-level `isUserAuthed(['edit-section-permissions'], sectionAuthPermissions)` → page-level `isUserAuthed(['edit-page-permissions'], pageAuthPermissions)`
- [x] Copy pill: visibility changed from `canEditSection` → `canEditSection || canEditPageContent`
- [x] Link pill: visibility changed from `canEditSection` → `canEditSection || canEditPageContent`
- [x] Move Up pill: added `&& canEditSection` to condition
- [x] Move Down pill: added `&& canEditSection` to condition
- [x] Permissions item `cdn`: changed from `() => canEditSectionPermissions` → `() => canEditSectionPermissions && canEditSection`

### `src/dms/packages/dms/src/patterns/page/components/userMenu.jsx`

- [x] `EditControl` `isUserAuthed` check: removed `edit-page-layout`, `edit-page-params`; now `['create-page', 'edit-page', 'edit-page-permissions', 'publish-page']`

### `src/dms/packages/dms/src/patterns/page/pages/edit/editPane/pagesPane.jsx` (`PublishButton`)

- [x] Added `pageState` to `PageContext` destructure
- [x] Added `pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions)`
- [x] Changed `isUserAuthed(['publish-page'])` → `isUserAuthed(['publish-page'], pageAuthPermissions)` (page-level override now respected)
- [x] Removed stale `console.log('user publish-page', isUserAuthed['publish-page'])` (was a broken bracket property access on a function)

### `src/dms/packages/dms/src/patterns/page/pages/edit/index.jsx`

- [x] Added `Navigate` to react-router imports
- [x] Permission gate: logged-in users without edit access now redirect to `${baseUrl}/${item.url_slug}${search}` (view page); unauthenticated users still see the existing message

## Backward Compatibility

Auth checks accept both old and new permission names:
- `['edit', 'edit-section']` — existing data with `edit-section` still grants access
- `['edit-page', 'edit-page-layout']` — existing data with `edit-page-layout` still grants edit toolbar access
- `canEditSectionPermissions` now checks page-level `edit-page-permissions` — users who previously had section-level `edit-section-permissions` stored will lose access until re-granted at page level (no automated migration)

## Verification Scenarios

| Scenario | Expected |
|---|---|
| Logged-in, only `edit-page` | Toolbar: Settings, Data Sources, Section Groups, History. No Pages, Permissions, Publish. Section menu shows copy/link but not move/edit/permissions |
| Logged-in, `edit-page` + `create-page` | Pages pane appears |
| Logged-in, `edit-page` + `edit-page-permissions` | Permissions pane appears; section Permissions item visible (if also `edit` on section) |
| Logged-in, `edit-page` + `publish-page` | Discard + Publish buttons appear |
| Section with no section permissions | Full section edit menu available to anyone with page `edit-page` |
| Section with `edit` restricted | Users without `edit` see copy/link but not move up/down/edit/permissions |
| Old pattern data with `edit-page-layout` stored | Still gets edit toolbar access via backward-compat alias |
| Old section data with `edit-section` stored | Still gets full section edit via alias |
| Logged-in user visits `/edit/...` without edit access | Redirected to view page |
| Unauthenticated user visits `/edit/...` | Sees permission message |
