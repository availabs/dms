# UI controls — the inventory (Deliverable 1, 2026-10-13)

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** done · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** shaunak.sangdod@gmail.com, ssangdod@albany.edu

Part of [ui-control-consistency-audit.md](./ui-control-consistency-audit.md). Reference record; the hub has the
current status.

## Deliverable 1 — the inventory (do this first, change nothing)

A table of every button and every pill-like element, before any restyle, for the owner to review:

| Pattern · page | Element (label) | File · theme key | Kind | Current look | Cursor | Proposed kind / change |
|---|---|---|---|---|---|---|

**Button kinds** (proposed; confirm with the owner):
- **action** — neutral, the normal "do this" button (Advanced Metadata, Add Version, Create Download,
  Cache PM Tiles…). Reference: datasets admin `actionBtn`.
- **add / update** — outlined, no fill, ink text (metadata editor `btnInline`, owner 2026-10-07:
  "styled as action buttons like delete and removes are").
- **danger** — outlined brick (Delete Source, remove column, Clear Data…). Reference: datasets admin
  `buttonRed`.
- **danger solid** — the confirm inside a destructive modal (Delete, remove primary key…).
- **primary / confirm** — the one main action in a modal / form. Note the owner's "no blue accent"
  direction on the metadata page (2026-10-07); the page-3 Add Version modal still uses cobalt
  primary — decide one rule.
- **ghost / link** — text-only (toggle all, mark authoritative…, clear metadata…).
- **icon** — icon-only (expand toggle, remove ×, edit pencil).
- **segmented** — UI.ButtonSelect 'segmented'.

**Pill kinds** (proposed): status (task done / error / running / queued — `datasets.udaTaskPage`
status keys), state badge (authoritative / undecided / latest / current — `sourceOverview`
`verAuthBadge` / `verUndecidedChip` / `verCurrentBadge`), tag (category pills, option tags,
permission pills — MultiSelect 'permissions'), marker (IDX / PK, ADMIN, PROPOSED, type chips in the
catalog), count chip.

**Table kinds** (proposed 2026-10-07; confirm with the owner):
- **data grid**: the Table tab / page-section spreadsheet (`UI.Table` + DataWrapper). It has
  resizable columns, sorting, editing and many columns. It keeps its own look: the cell borders say
  "you can work with this".
- **list table**: a short, read-only list of rows inside a card (Overview columns, task lists, task
  events, uploads). One shared style. Proposal: a well-shaded header row with `t-metaXS` labels, as on
  Overview; px-4 padding; row rules + hover; **no zebra stripes** (stripes help across wide grids, and
  these lists are narrow); `overflow-x-auto` wrapper + a `min-w` so phones scroll (the Overview
  fix, 2026-10-07). Define it once (shared constants, or a named `UI.Table` / list-table style) and
  point every list table at it.

**Tables already known to differ** (datasets v6 port, 2026-10-07):
- Overview columns: `sourceOverview` `table` / `theadRow` / `th` / `tr` / `trAlt`. Well header,
  px-4, zebra.
- Task list + Admin Tasks card: `udaTaskList` via `components/TaskTable.jsx`. Plain header, px-3,
  hover, no stripes.
- Task events: `udaTaskPage` table keys (TaskTable, `striped`). Plain header, zebra.
- Uploads list + one upload's events: `uploads` `tableHeaderRow` / `tableRow`. A div / `dl` grid,
  not a `<table>`. Well header, px-4.
- Table tab: `UI.Table` (data grid). Leave as is.

**Still to compare (owner, 2026-10-07):**
- the admin pattern's **site list page** (`/list`) table;
- every other table in the **admin**, **auth** and **datasets** patterns. Grep `<table`, `UI.Table` /
  `Table data=`, `grid-cols-` row lists and `*.theme.js` keys named `*table*` / `*thead*` / `*th*` /
  `*tr*` / `*Row*`. Expected hits include admin users / groups / pattern lists, auth user & group
  management, the datasets schedule / runs pages, version downloads, validate results, and the
  catalog's list view. Add each one to the inventory with its kind (data grid or list table).

### How to find them

- `grep` every `<button`, `<Button`, `UI.Button`, `Link … className=` and FieldSet `type: 'Button'`
  under `packages/dms/src/{patterns,ui}`; plus the `*.theme.js` keys named `*Btn*`, `*button*`,
  `*Pill*`, `*Badge*`, `*Chip*`, `*Tag*`, `status*`.
- Live: walk each pattern on the local scratch setup and query
  `document.querySelectorAll('button,a[role=button],[role=switch],[class*=rounded-full]')` with
  computed `cursor`, `background`, `border`, `color`; flag `cursor: auto/default` on clickables.
- `UI.Button` with `themeOptions` (hardcoded blue/red/gray maps in `Button.jsx`) — every use is a
  candidate.

### Already known (from the datasets v6 port, 2026-10-06/07)

- Datasets admin: `actionBtn` (neutral) / `buttonRed` (outlined brick) — the approved reference pair.
- Datasets metadata: `btn`, `btnPrimary` (neutral, medium), `btnDanger`, `btnDangerSolid`,
  `btnInline*` (42px, beside inputs), `addFieldBtn` — local keys that duplicate the pair above.
- Datasets version / ExternalVersionControls: own ACTION / DANGER / DANGER_SOLID constants.
- Datasets source admin Add Version modal: cobalt primary (`addVersionBtn`).
- `UI.DeleteModal` (ui/components/DeleteModal.theme.js): its own cancel / solid-brick pair.
- ExternalVersionControls "Toggle All" used `Button themeOptions` (blue) — moved to `toggleAllBtn`.
- Pills: task status (`udaTaskPage`), authority / undecided / latest (`sourceOverview`), IDX / PK
  (`metadataComp.pkBadge`, neutral), ADMIN pill (`sourceOverview.adminPill`), category pills
  (`sourceOverview.catPill` / `datasetsList`), option tags (`metadataComp.optionTag`), permission
  pills (MultiSelect 'permissions').

### Deliverable 1 result: the inventory (2026-10-13)

**Nothing was changed.** This is what the default (v6) theme renders today, grouped by kind, with a proposal per
kind and the decisions that need the owner.

### How it was gathered

- **Live walk** of the default theme on the scratch server (light, 1440px): 74 page states across
  admin (site list, create, themes, every pattern-editor tab), auth (users, groups, profile, login,
  signup, forgot), datasets (catalog ×3 views, settings, create, tasks, task, source overview /
  table / admin / version / metadata for DAMA, internal and GIS sources, uploads, not-found) and
  page (view, edit, all six drawer panes, new-page picker, search, link page), plus the modals
  (delete source, add version, create download, delete version, delete pattern, add pattern, add
  user). For every button, button-like link, clickable element, pill and table it records the
  computed background, text colour, border, radius, height, padding, font and cursor. The colours
  are mapped back to their v6 tokens.
- **Code map:** each class string is traced to the file and theme key it comes from.
- Counts: 429 buttons in **95 distinct looks**, 115 button-like links (10 looks), 89 pills (**27
  looks**), and 500 clickable non-buttons (40 looks: nav rows, selects, sortable headers, cards).
  **67 buttons have no pointer cursor.**
- Not covered live: the section menu (the walker couldn't open it; it's specified against its
  mockup in [ui-primitives-default-theme.md](../completed/ui-primitives-default-theme.md)), the forms pattern
  (no forms pattern on the test site), the schedule / runs pages (no schedule source) and dark
  mode. Tooling: `src/themes/tessera/design_system_v6/scripts/inventory/` (walker + analyser; see its README) for the re-check after
  Deliverable 2.

### Cross-cutting findings

1. **Copies, not shared styles.** The solid blue primary button is pasted into **16** theme files,
   the solid brick button into 8, the `rounded-full px-2 py-0.5` pill into 11 and the `rounded
   px-1.5 py-0.5` pill into 9. Each copy has drifted a little (height, font, weight), which is most
   of the 95 looks. Two pages even borrow keys from other screens' theme files (the site list's
   filter chips use the user-menu editor's `scopePill` and the format manager's `countPill`).
2. **Two type stacks on buttons.** Buttons that use the type classes (`t-proseSM`) render in IBM
   Plex Sans 14px. Buttons with plain `text-sm` render in Public Sans. So the same kind of button
   changes typeface between admin / auth (Public Sans) and datasets / page (IBM Plex Sans).
3. **The accent rule is split.** Datasets and page dropped the blue accent (owner, 2026-10-07 /
   page 14), but admin and auth still use cobalt for every primary button, every active
   filter chip, the admin side nav's active row, the auth group chips and pagination.
4. **Hardcoded (non-token) colours** still render on the default theme: `UI.Switch` (indigo /
   gray), the version page's **Delete version** button + its modal (red-50 / red-700 / gray-500;
   upstream's 10/09 addition), and the Table tab's **Action / Columns / More** controls (gray-900,
   ring-gray-300).
5. **Admin pages render a lighter body weight** (300) than every other pattern (400), so the same
   icon button looks thinner there.

### Buttons

Heights in px; "cursor ✗" = renders the default arrow.

#### A. Primary (the one main action): 8 implementations

| Where | Label(s) | File · key | Look today | Cursor |
|---|---|---|---|---|
| admin site list, themes | Add pattern, add theme | `admin/pages/themes/list.theme.js` `addButton` | cobalt solid, h40, Public Sans 14 | ✗ |
| admin format manager / pages | save, save changes, + New Page | `formatManager.theme.js` `btnSave` (+ copies) | cobalt solid, h34, Plex 14 | ✓ |
| admin user menu editor | add link | `userMenuEditor.theme.js` `addBtn` | cobalt solid, h30 | ✓ |
| auth users / groups | Add new | `auth/defaultTheme.js` `headerAction` | cobalt solid, h32, Public Sans | ✗ |
| auth add-user modal | Add | `auth/defaultTheme.js` | cobalt solid, h42 | ✗ |
| auth login / signup / reset | sign in, sign up, reset | `auth/defaultTheme.js` `actionButton` | cobalt solid, h42, full width, Public Sans 16 | ✓ |
| `UI.Button` default | Save, add, create, Add / Remove Style | `ui/components/Button.theme.jsx` `button` | cobalt solid, h36–42, Public Sans 14 | ✓ |
| datasets catalog | new source | `datasetsList.theme.js` `newBtn` | cobalt solid, h32, Plex 14 | ✓ |
| datasets overview | Download (version row), add (promote) | `sourceOverview.theme.js` `verDownloadBtn` / `promoBtn` | cobalt solid, h32, 12.5 / 14 | ✓ |

**Proposal:** one primary: h32 (h40 only for auth's full-width form submit), Plex 14 medium,
`cursor-pointer`. **Decision P1:** what fills it. Cobalt everywhere (undo the no-accent rule
for primaries), **ink solid** (dark fill, no hue; my recommendation, matching the no-accent
direction), or neutral outlined like datasets' action buttons (no visible "main" action at all).

#### B. Action (neutral, outlined): reference = datasets admin `actionBtn`

| Where | Label(s) | File · key | Look today |
|---|---|---|---|
| datasets admin / version / validate / errors | Add Version, Advanced Metadata, Create Download, Cache PM Tiles, Re-Validate, Back to data sources | `dataTypes/default/admin.theme.js` `actionBtn` (+ copy in `errorPage.theme.js` `BTN`) | panel, 1px rule, h32, Plex 14 ink |
| datasets source header | Set Default Columns, Settings | `sourcePage.theme.js` `headerActionBtn` | same but 12.5px graphite |
| page drawer (pages, history) | + page, Comment | `editPanes.theme.js` `BTN` | rule-**strong** border, 12.5 medium |
| admin format manager | add attribute | `formatManager.theme.js` `addBtn` | rule-strong, h36, medium |
| admin pattern overview | duplicate | `settings.theme.js` `btnDuplicate` | graphite text, h36, cursor ✗ |
| admin format manager | reset | `formatManager.theme.js` `btnReset` | graphite text, h36 |
| auth profile | Reset Password | `auth/defaultTheme.js` `headerAction` | rule-strong, h34, Public Sans |
| `UI.DeleteModal` | Cancel | `DeleteModal.theme.js` `cancelButton` | matches the reference |
| admin delete-pattern modal | Cancel | `editSite.theme.js` `btnSecondary` | **well fill, no border, r8**, cursor ✗ |
| version delete modal | Cancel | `sourceOverview.theme.js` `verDeleteCancel` | gray-500 text link (non-token), cursor ✗ |

**Proposal:** all → the reference (h32, Plex 14). Context exception kept: datasets metadata
`btnInline` (h42, so it lines up with the 42px input it sits beside; owner 2026-10-07).

#### C. Danger, outlined (a destructive action that opens a confirm)

| Where | Label(s) | File · key | Look today |
|---|---|---|---|
| datasets admin / version | Delete Source, Delete Version, Clear Data, Delete Download | `admin.theme.js` `buttonRed` | brick outline, h32 (reference) |
| admin pattern overview | delete pattern… | `userMenuEditor.theme.js` / settings copy | brick outline, h36, medium, cursor ✗ |
| datasets version (upstream) | Delete version | `sourceOverview.theme.js` `verDeleteBtn` | red-50 fill / red-700 text / red-200 border, Public Sans semibold, cursor ✗ |
| admin theme editor | FULL RESET | `themeEditor.theme.js` `btnFullReset` | brick-**soft fill**, mono 10 uppercase, h27 |

**Proposal:** all → the reference. FULL RESET sits in a toolbar of small mono buttons. Either
keep it small (a "danger" variant of the small toolbar button, D below) or make it a reference
danger button.

#### D. Danger, solid (the confirm inside a destructive modal)

| Where | File · key | Look today |
|---|---|---|
| `UI.DeleteModal` Delete | `DeleteModal.theme.js` | brick solid, h32, r6, Plex medium (reference) |
| admin delete-pattern modal Delete | `editSite.theme.js` `btnDanger` | brick solid, **r8, Public Sans 400**, cursor ✗ |
| version delete modal Delete version | `sourceOverview.theme.js` | **red-700** (non-token), cursor ✗ |

**Proposal:** all → `UI.DeleteModal`'s pair. The admin delete-pattern modal and the version delete
modal are hand-built modals that could just use `UI.DeleteModal`.

#### E. Text / link buttons: three typographies, four colours

| Label(s) | File · key | Look today |
|---|---|---|
| MARK AUTHORITATIVE…, RETURN TO SANDBOX | `sourceOverview.theme.js` `verAuthLink` / `demoteBtn` | mono 10 uppercase, pencil |
| CLEAR ALL FILTERS | `filterEditor.theme.js` `clearAllBtn` | mono 10 uppercase, pencil → brick hover |
| TOGGLE ALL | `ExternalVersionControls.theme.js` `toggleAllBtn` | mono 10 uppercase, graphite |
| + add location, + add retired subdomain | `settings.theme.js` `listAddBtn` | prose 14, **cobalt** |
| add filter / remove all filters | `editPanes.theme.js` `filterAddBtn` / `filterClear` | prose 12.5 graphite (hover well) / pencil |
| + Add Group | `sectionGroupsPane.theme.js` `addGroupBtn` | prose 12.5 graphite, hover panel |
| inherited grant actions | `Permissions.theme.js` `inheritedAction` / `…Quiet` | prose 12.5 **amber** / graphite dotted underline |
| page name in activity feed | `activityTab.theme.js` `activityPageLink` | prose 14 medium ink, hover cobalt |

**Proposal:** two kinds only. **Meta link** (mono uppercase, pencil → ink; destructive ones →
brick on hover) for small actions beside metadata, and **prose link** (Plex 12.5, graphite →
ink) for "add another" rows. Drop cobalt. Amber stays only where it means "overrides inherited"
(Permissions); that's a contextual exception.

#### F. Small toolbar buttons (mono, outlined): 6 copies, 2 heights

`RAW JSON`, `+ ADD SUBDOMAIN` (formatManager `rawToggleBtn`, h23 / h27); auth `VIEW AS`,
`RESET PASSWORD` (same key reused, **cursor ✗**); pages editor `EXPAND ALL`, `REFRESH`
(`ghostBtn`, panel fill + hover well); drawer `SORT: NAME` (`editPanes` `filterChip`, cursor ✗);
`SYNC TO PAGES` (`filterEditor` `syncBtn`, **cobalt** outline).
**Proposal:** one small button: h24, mono 10 uppercase, rule border, panel fill, hover
rule-strong. SYNC TO PAGES loses cobalt.

#### G. Filter / lens chips (rounded-full, toggle a filter)

| Where | File · key | Inactive / active | Cursor |
|---|---|---|---|
| admin site list type filter (ALL 10, PAGE 4 …) | borrowed `userMenuEditor` `scopePill` + `formatManager` `countPill` | outlined / **cobalt-soft** | ✗ |
| admin pages + activity lenses (EDITS 1, ORPHANS 0 …) | `pagesEditor.theme.js` `lensChip` / `lensChipActive` | outlined / cobalt-soft (+1px taller) | ✓ |
| datasets settings categories (Hazards 7 …) | `settingsPage.theme.js` `categoryButton` | panel, **prose** 12.5, with a remove × | ✓ |
| user menu editor (DIVIDER …) | `userMenuEditor` `scopePill` | outlined mono | ✓ |

**Proposal:** one chip: outlined mono, active = **ink** fill (decision P1 applies), pointer. The
settings category button is an editable token (it carries a ×) rather than a filter, so it joins
pill kind 3 (tags).

#### H. Segmented controls: 5 implementations, 3 looks

`UI.ButtonSelect` (history: all / comments / publishes; prose 12.5, h28, active = panel + lift),
pages editor `scopeSeg` (PAGES / SECTIONS; mono 10, h21), theme editor `frameTab*` (PREVIEW / RAW
OVERRIDES; mono, active = **well** + lift), user menu editor `segment*` (Default menu / own menu;
prose 12.5, h27), catalog view switch (grid / cards / table; icon, active = **ink solid**).
**Proposal:** all → `UI.ButtonSelect` 'segmented' (active = panel + lift). The catalog icon switch
keeps its icons but uses the same active style.

#### I. Icon buttons: 3 sizes, bordered vs not, 5 without a cursor

Bordered 32: theme toggle, catalog toolbar (sort, show all, settings link), user-menu edit / view.
Borderless 28: overview `editBtn` (pencil), admin site-list row actions (duplicate / delete,
**cursor ✗**), pages-editor `rowIconBtn` (**cursor ✗**). Borderless 24: Permissions `removeBtn`,
Drawer close (**cursor ✗**), auth modal Close (**cursor ✗**), navigable-menu trigger. Text glyphs
instead of icons: pages editor `⋯` and tree `▸`.
**Proposal:** two sizes. **Toolbar icon** (32, bordered) for page / toolbar actions, and **row
icon** (28, borderless, hover well; destructive → brick hover) for row and card actions. Every
one gets a pointer. The glyphs become registered icons.

#### J. Switch: hardcoded, 2 sizes seen

`UI.Switch`: indigo-600 on / gray-200 off (non-token), h16 (settings "Hide …", Allow editing) and
h24 (access "Record changes"). Already scoped in ui-primitives-default-theme.md. **Proposal:** ink
on / well off, tokens; sizes stay.

#### K. Selection cards ("pick one"): 2 looks

Datasets create type cards (`createPage.theme.js` `typeCard`: panel, selected = ink border +
lift) vs page-template picker and add-pattern picker cards (well fill, hover panel; selection
shown differently). **Proposal:** one card: panel, hover rule-strong, selected = ink border + lift.

#### Context-specific, keep as is

- Edit-bar buttons and **Publish** (dark board bar; its own palette by design).
- Nav rows (side nav, in-page rail, admin side nav). But the **admin side nav's active row is
  cobalt-soft** while the page side nav uses well + ink: **decision P2**, align admin with page?
- Tabs (`UI.Tabs`, source tabs).
- Search trigger in the side nav; select triggers (`UI.Select` / MultiSelect).

### Pills

| Kind | Where | File · key | Look today |
|---|---|---|---|
| **1. Pattern type** | admin site list (ADMIN, AUTH, PAGE, DATASETS) | `editSite.theme.js` `typePill` | rounded-full, mono 10, amber / cobalt / go soft |
| | add-pattern picker cards | `AddPatternPicker.theme.js` `optTag` | **r4, Public Sans 9px semibold**, go / cobalt / dashed |
| **2. Status** | task status (DONE, ERROR, QUEUED) | `UdaTaskPage.theme.js` `statusBadge` | r4, mono 10, go / brick / well soft |
| | page status (PUBLISHED / draft) | `editPanes.theme.js` `statusPublished` / `statusDraft` | PUBLISHED r4; draft **rounded-full** |
| | activity feed (Published) | `ui/columnTypes/activity_action_badge.jsx` | **rounded-full, Public Sans 11 semibold** |
| | data sources (ORPHANED) | `sourcesTab.theme.js` `statusOrphaned` | rounded-full, mono **600** |
| | settings (REQUIRED, DEPRECATED) | `settingsPage.theme.js` `lcRequired` / `legacyBadge` | r4 mono, brick / amber soft |
| | overview authority (UNDECIDED, LATEST) | `sourceOverview.theme.js` | amber soft r4 / outlined r4 |
| **3. Tag / token** | categories on overview + catalog | `sourceOverview.theme.js` `catPill` / `catSubPill` | well r4 / outlined r4, prose 12.5 |
| | multiselect tokens (permissions *, View Page) | `MultiSelect.theme.js` `tokenWrapper` | well **rounded-full**, prose 12.5 |
| | auth user's groups (v6test Admin) | `MultiSelect` inline (auth) | **cobalt-soft + cobalt-line border, rounded-full, mono 12** |
| | datasets settings categories | `settingsPage.theme.js` `categoryButton` | panel rounded-full prose, with × |
| **4. Marker** | catalog type (CSV, INTERNAL), LATEST | `editPanes` `filterChip` (borrowed) | outlined r4 mono 10 |
| | data sources origin (INTERNAL / EXTERNAL) | `sourcesTab.theme.js` `origin` | **well fill, mono 600**: same meaning as the catalog's outlined INTERNAL |
| | IDX / PK | `metadataComp` `pkBadge` | panel outlined r4, px4 |
| | group theme (CONTENT), kbd `/`, scope (SCOPE THIS PATTERN) | `editPanes` `groupTheme`, search, `editSite` `noAccessBadge` | outlined r4 mono, pencil |
| **5. Count** | tree node count, user-menu count | `treeNode.jsx` inline, `userMenuEditor` `count` | well rounded-full Public Sans 600 / outlined rounded-full mono |
| **6. Avatar** | activity feed initial | `activityTab.theme.js` `feedAvatar` | cobalt solid circle |

**Proposal:** one shape per kind.
- **Status:** r4, mono 10 uppercase, weight 500, tone = go / brick / amber / well.
- **Markers:** outlined r4 mono, pencil / graphite.
- **Tags:** prose 12.5, well r4; removable tokens add a ×; no cobalt.
- **Counts:** outlined rounded-full mono.

Pattern type (kind 1) stays rounded-full but with the same tones in both places. **Decision P3:**
do the pattern types keep three colours (amber / cobalt / go) or go neutral?

### Tables

| Where | Built with | Header | Body | Kind |
|---|---|---|---|---|
| datasets Table tab, internal Validate | `UI.Table` | sortable mono headers, cell grid | data grid | **data grid** (keep) |
| admin site list, themes, pattern Pages, pattern Data, page templates; auth users, groups | `UI.Table` | well band, column filters / sort | cell grid lines | **read-only lists drawn as a data grid** |
| datasets task list, admin Tasks card, task events | `<table>` (`TaskTable`) | no band, px-3, pencil mono 10 (weight 400) | rows, no stripes | list |
| datasets overview Columns | `<table>` (`sourceOverview` `th`…) | well band, px-4, mono 10 (weight 500) | **zebra**, mono 13 names | list |
| datasets catalog table view | `<table>` (`datasetsList`) | well band, **sticky**, px-3 | rows | list |
| datasets uploads list + upload events | div grid (`uploads`) | well band, px-4 | rows | list |

**Proposal:**
- **One list-table style:** well header band, mono 10 / 500 pencil labels, px-4, row rules + hover,
  no zebra, an `overflow-x-auto` wrapper with a `min-w`. Every `<table>` list and the uploads grid
  point at it.
- **Admin / auth lists stay on `UI.Table`.** They use its column filters and sorting. **Decision
  P4:** give `UI.Table` a named **'list' style** (no cell grid lines, the list-table header) that
  these screens opt into, so they read as the same lists as datasets.
- **Pre-existing, found 10/13:** `UI.Table`'s sticky header uses `bg-[var(--t-panel)]` on every
  theme, and the table's minimum width overflows the TNY layout. Fix both in the same pass.

### Cursor: buttons that render the default arrow

Admin: Add pattern, add theme, site-list filter chips (ALL / PAGE / DATASETS / AUTH / ADMIN),
SORT: NAME, row Duplicate / Delete, duplicate, delete pattern…, Edit page (pages editor),
delete-pattern modal Cancel / Delete. Auth: Add new, VIEW AS, RESET PASSWORD, add-user modal
Add / Close. Datasets: version-page Delete version and its modal's Cancel / Delete version.
Page: drawer Close panel. (67 instances in total, 24 distinct controls.) Every proposed style above
carries `cursor-pointer` + `disabled:cursor-not-allowed`, which fixes all of them.

### Decisions for the owner

- **P1:** primary fill: cobalt, **ink solid** (recommended), or neutral outlined. The answer also
  sets the active colour of filter chips (G) and segmented controls (H).
- **P2:** admin side nav active row: cobalt-soft today. Align it with the page side nav (well +
  ink)?
- **P3:** pattern-type pills: keep three colours or go neutral?
- **P4:** admin / auth lists: a 'list' style on `UI.Table`, so they match the datasets lists?
- **Exceptions to confirm:**
  - metadata `btnInline` at h42 (beside inputs);
  - auth's full-width h40 submit;
  - the dark edit bar / Publish;
  - amber for "overrides inherited" in Permissions;
  - the theme editor's preview using the edited theme's font (Geist).
