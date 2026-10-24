# Datasets client: replace "logged in" gates with the permission each action needs

**Initiatives:** [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) (primary), [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Release:** commit — lib b34ca5e1, not pushed (branch permissions_move) · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Client only. Can land before the
server tasks (it only hides UI), but needs the vocabulary decision from
[permissions-server-source-auth-core.md](./permissions-server-source-auth-core.md) (`create-source`, `create-view`).
Route-level gating (`reqPermissions` actually blocking) is defect A of
[auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md); this task adds
in-component gates so it doesn't depend on that fix.

## Objective

Every write control in the datasets pattern is shown only to users who hold the permission the server will
require. Today most Admin and Version tab controls show for any logged-in user (`user.token`), and some for anyone.

Use `DatasetsContext.isUserAuthed` (pattern) on list/create/settings pages and the `SourcePage`-provided
`isUserAuthed` (pattern ⊕ source, `SourcePage.jsx:144-147`, `:237`) inside a source. Paths below are under
`dms/src/patterns/datasets/`.

## Decisions (owner, 2026-10-23)

- **Lenient, client and server alike** (hub open question 6): no permission set → open. The client rule
  (`utils/auth.js`) already is; the server's strict datasets checks move to the same rule in this task, so the UI
  and `enforce` agree. Anon: as the lenient rule (passes only when nothing at all is set). `${app} Admin` passes on
  both sides (the client's datasets check gains it).
- **`view-source` no-access page waits for task 12** (server read visibility), so reads move in one place.
- **Hidden lifecycle buckets** (Archive etc.) on the list: `view-sources` (anyone who can see the list).
- **`view-source-api`** predates this initiative (2026-06-29): keep it in the catalog, unchecked (reserved).

## Progress 2026-10-23 (built + live-checked)

- [x] **Server rule → lenient** (decision above): `routes/uda/sourceAuth.js` `isUserAuthed` is now the repo's rule
  (`routes/dms/auth.js`, the client's mirror); the strict check survives as `holdsExplicitly`, which the dms.data
  guard uses for anonymous writes (`decideSource({ explicitOnly })`, `dataAuth.js` `holds`: signed in → lenient,
  anon → explicit). Header comments updated. Tests rewritten / re-fixtured: a "nobody's" source is now
  creator-only (`users: { 999999: ['*'] }`), since empty grants mean open. Edge (same on the client today):
  revoking a pattern's ONLY grant with `[]` on a source leaves nothing set, so the source becomes open.
- [x] Client datasets check passes `${app} Admin` (`siteConfig.jsx`, `utils/adminPermissions.js` isAppAdmin), as the server.
- [x] DatasetsList: uploads toggle + Create → `create-source`; Settings → `edit-pattern`; hidden buckets → anyone who
  sees the list (owner: view-sources).
- [x] CreatePage: no `create-source` → themed no-access line (`createPage.theme.js` `noAccess`) instead of the form.
  The file_upload / GIS / internal_table / plugin create flows only render inside it (or behind Admin's Add
  Version), so they inherit the gate.
- [x] SourcePage: page configs may name `reqPermissions`; the tab bar hides pages the user can't use and a direct
  URL shows a "No access" StatePanel. Admin tab: any of update-source / edit-source-permissions / delete-source /
  create-view. Internal Upload + Validate: `edit-source-data` or `update-source` (what the server's DMS
  publish / validate route requires; the list below said create-view / update-source).
- [x] Admin (DAMA + internal): page guard = any of the above (was `user.token`); Advanced Metadata, Rules, Allow
  editing, Tasks → `update-source`; Add Version → `create-view` (DAMA also `update-source`, as authorizePublish).
  Access editor (`edit-source-permissions`), Delete (`delete-source`), change history (`update-source`) already gated.
- [x] Overview Versions: signed exports only with `download-source`; file_upload files stay public (task 6).
- [x] Map legend: symbology auto-save only with `update-source` (it was refused anyway: not a writable column).
- [x] Tasks pages (list, task page): signed-out visitors see "Sign in to see tasks" (task 7: reads need a sign-in).
- Already done earlier: SettingsPage (`edit-pattern`), version.jsx (steps 4 / B-E), Delete Source, schedules
  (task 7), plugin pages (task 9). `view-source` no-access waits for task 12. mapeditor `DataManagerHeader`
  belongs to permissions-remove-auth-levels.
- Tests (server, SQLite): test-source-auth 50, test-uda-auth 28, test-upload-auth 37, test-data-auth 49,
  test-schedule-auth 13, test-datatype-auth 9, test-delete-cascade 16, test-schedules 29, test-upload-pipeline 12;
  data-types integration all green except transcom worker (2, congestion_data shape; worker untouched since
  06-24, unrelated). `npm run build` ✓.

## Gates to change

**List, create, settings, tasks**
- [ ] `pages/DatasetsList/index.jsx:402,404` divider + show-uploads toggle: `user?.authed` → `create-source`
- [ ] `DatasetsList/index.jsx:412` Settings link: `user?.authed` → `edit-pattern`
- [ ] `DatasetsList/index.jsx:415` Add/Create link: `user?.authed` → `create-source`
- [ ] `DatasetsList/index.jsx:456` hidden lifecycle buckets: `user?.authed` → `update-source` at pattern level (or `create-source`)
- [ ] `pages/CreatePage.jsx:89-145` no in-page gate → `create-source` (show a no-access message)
- [ ] `pages/SettingsPage.jsx` (write at `:107`) no gate → `edit-pattern`
- [ ] `pages/Tasks/UdaTasks.jsx`, `UdaTaskPage.jsx`, `UdaTaskList.jsx` no gate → per the read decision in
  [permissions-ds-schedules-and-tasks.md](./permissions-ds-schedules-and-tasks.md)
- [ ] `dataTypes/file_upload/CreatePage.jsx:151` no gate → `create-source`

**SourcePage tabs**
- [ ] `SourcePage.jsx:33-46,175` tab nav shows Admin / Upload / Validate to everyone → Admin: any of `update-source`,
  `edit-source-permissions`, `delete-source`, `create-view`; Upload: `create-view`; Validate: `update-source`
- [ ] `SourcePage.jsx:217-337` no `view-source` check → show no-access when the user lacks `view-source` (after
  [permissions-ds-read-visibility.md](./permissions-ds-read-visibility.md) the server returns nothing anyway)

**Overview** (`dataTypes/default/overview.jsx`, `isAdmin = isUserAuthed(['update-source'])` at `:76`; edits at
`:186,222,267,284,312,334,409` are already right)
- [ ] `:380-404` Versions download links/menu: none → `download-source`

**Admin tab, DAMA** (`dataTypes/default/admin.jsx`, whole page `user.token` at `:241`)
- [ ] `:257` Advanced Metadata link → `update-source`
- [ ] `:267` / `:143-150` Add Version → `create-view`
- [ ] `:268` / `:159-231` Allow editing toggle (`metadata.isEditable`) → `update-source`
- [ ] `:269` / `:79-122` Delete Source → `delete-source`
- [ ] `:279-282` Tasks list → `update-source`
- [ ] `:241` page guard → "any of the above", instead of `user.token`

**Admin tab, internal/DMS** (`dataTypes/internal/pages/admin.jsx`, `user.token` at `:163`)
- [ ] `:180` / `:35-149` AddViewBtn → `create-view`
- [ ] `:181` DeleteDmsSourceBtn (`components/DeleteSource.jsx:113`) → `delete-source`
- [ ] `:185-190` Tasks → `update-source`

**Version page** (`dataTypes/default/version.jsx`)
- [ ] `:158` version-name input, saves as you type → `update-source` (read-only otherwise)
- [ ] `:174` / `:56-80` DMS Clear Data → `delete-source` (or `edit-source-data`)
- [ ] `:175` / `:16-54` DMS Delete Version → `delete-source`

**Map, upload, validate**
- [ ] `gis_dataset/pages/Map/Layer2.jsx:244-271` legend changes auto-save symbology → only when `update-source`
- [ ] `internal/pages/upload.jsx:25-34` Upload tab → `create-view`
- [ ] `internal/pages/validate.jsx:14` (destructures `isUserAuthed`, unused) and `components/ValidateComp.jsx:87,201,562,624`
  re-validate / mass-update → `update-source`
- [ ] `gis_dataset/pages/Create/**` no gate → `create-source` (new) / `create-view` (existing `source_id`)

**Schedules**
- [ ] `dataTypes/schedule/SchedulePage.jsx:357` `canEdit = !!user?.token` → `update-source`
- [ ] `schedule/RunsPage.jsx:295` Rerun → `update-source`

**Plugin pages** (in `data-types/`, root repo; tracked in
[datatype-plugin-route-permissions.md](../../../../../planning/shared/tasks/current/datatype-plugin-route-permissions.md)):
`hazard_loss_pipeline/pages/start_run.jsx:200` (`user?.token`), every `pages/create.jsx` (no gate).

**mapeditor** (app, `src/patterns/mapeditor/SourceLayout.jsx:54-84`): `DataManagerHeader` checks
`user?.authLevel >= 5` on a hard-coded `{}` user and is exported but never used. Delete it (in
[permissions-remove-auth-levels.md](./permissions-remove-auth-levels.md)).

## Notes

- Unused permissions today: `view-source`, `download-source`, `create-view`, `view-source-api`. After this task, all
  but `view-source-api` are checked. Decide whether `view-source-api` stays in the catalog.
- `utils/auth.js` `isUserAuthed` is lenient ("nothing configured → any logged-in user", `:70-72`). New sources get
  `{users:{creator:['*']}, groups:{public:[]}}` (`CreatePage.jsx:101-104`), so they're not "unconfigured". Keep
  the client and server rule identical (core task).

## Testing checklist

- [x] Live (hub Results rows "O client gates", "O lenient rule"): viewer / editor (update-source) / owner on a DAMA
  and an internal source each see exactly their controls; direct URLs show "No access"; the server accepts a
  signed-in write on a no-grants source and refuses it on a creator-only one.
- [x] What a user sees maps to what the server checks for it (each gate uses the server's permission; Upload /
  Validate follow the DMS publish route). Not clicked through for every control: Add Version on the rig's
  `transcom` fixture would call a plugin route the rig doesn't load.
