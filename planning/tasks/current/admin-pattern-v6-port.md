# Admin pattern v6 port — Pattern Editor redesign + access-control fixes

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** doing (was: "Current status (2026-09-22) … State as of 2026-09-23: Pages tab carets + table borders") · **Created by:** ssangdod@albany.edu · **Edited by:** —

**Project:** DMS library (`src/dms` submodule)

This is the dedicated task file for "admin's port," previously tracked only as a deferred bullet in
[`tessera-component-theme-port.md`](./tessera-component-theme-port.md) ("Admin's port — deliberately
deferred... this whole admin thread hasn't been turned into its own task file yet — do that first if
picking it up"). Splitting it out now because the scope has grown large across multiple sessions.

Read this file's "Current status" section first before resuming — it's kept up to date.

## Objective

Bring the admin panel (Sites list, Themes list/edit, and the Pattern Editor's own tabs) up to
tessera_v6, following the `design_system_v6/pages/admin-*.html` mockups, while preserving 100% of
existing functionality (per repeated explicit user direction throughout this effort — every pass below
double-checks feature parity, not just visual match). The admin panel always renders under the
hardcoded `selectedTheme: "default"` (`patterns/admin/siteConfig.jsx`) — confirmed intentional, see
`planning/shared/tasks/completed/tessera-default-theme.md`'s decision record — so this work targets the
one shared tessera-default look, not a per-project reskin.

## Current status (2026-09-22) — read this first before resuming

### Done in earlier sessions (full detail in `tessera-component-theme-port.md`)

- Themes list page (`patterns/admin/pages/themes/list.jsx`) and Theme editor page (`editTheme.jsx`)
  redesigned to v6, including a correction pass matching the real live Sites page (`editSite.jsx`) for
  header/toolbar consistency, and bringing the Pattern Editor's own embedded Theme tab
  (`patternEditor/default/themeEditor.jsx`) up to the same polish.
- Auth pattern's Users/Groups/Profile manage pages fully designed + implemented for the tessera
  default theme (mockups in `design_system_v6/pages/admin-{users,groups,profile}.html`,
  implementation in `patterns/auth/defaultTheme.js`'s `authPages.manage`).
- SideNav icon/hover/active-state work on `manageAuthConfig`'s hardcoded menu array; a `MultiSelect`
  `'accent'` named style for cobra-accented group pills (opt-in, zero blast radius on other
  multiselects).
- Table dark-mode port (`ui/components/table/table.theme.jsx`) + a real sitewide bug fix (`dark:`
  Tailwind classes were inert everywhere because `src/index.css`'s custom-variant only matched the
  `.dark` class, never the `[data-theme="dark"]` attribute `ThemeToggle.jsx` actually sets).

### Done THIS session (2026-09-20) — the bulk of the Pattern Editor work

**1. SideNav restructure — tabs moved into the sidenav, matching the mockups' "the sidenav IS the tab
nav" design:**
- Added a new named `'admin'` style to `ui/components/SideNav.theme.jsx` (mono `t-metaMD` labels,
  left-rule active state, matching `admin-*.html`'s "control room" rail — distinct from the base
  `'default'` style's docs-site rounded-pill look, which is now only used by non-admin surfaces).
  Wired via `sideNavActiveStyle='admin'` on both `patterns/admin/siteConfig.jsx` `<Layout>`s and
  `patterns/auth/siteConfig.jsx`'s `AdminLayout`.
- Fixed real `SideNavItem` bugs found while doing this (`ui/components/SideNav.jsx`):
  - `routeMatch` used to always match everything for a parent header with no own path (e.g. "Auth")
    because `subTos[0]` picked up `undefined` first — rewrote to check the item's own path (exact
    match if it has no `subMenus`, wildcard if it does) OR any submenu path, via `matchPath` +
    `useLocation` instead of `useMatch`.
  - `indicatorIcon`/`indicatorIconOpen` were set to non-existent icon names (`ChevronRight`/
    `ChevronDown` — only the boxed `ChevronDownSquare` variant exists in the registry), silently
    falling back to `Icon.jsx`'s generic placeholder glyph. Fixed to the registered `ArrowRight`/
    `ArrowDown` (visually plain chevrons despite the name).
  - Added `navItem.defaultOpen` support so a submenu group (e.g. "Auth") can start expanded
    regardless of current route.
- `patterns/admin/siteConfig.jsx`'s `patternConfig` wrapper now builds a combined sidenav: the
  existing Sites/Themes/Auth group, plus a `pattern · <name>` label row and the pattern's own tabs
  (`buildPatternMenuItems`). **The data-plumbing wrinkle solved with zero extra fetches**: every route
  node shares the same `EditWrapper` (`dms-manager/wrapper.jsx`), which always passes `dataItems` =
  the full sibling-pattern list regardless of that node's own `action` — so the wrapper parses the
  pattern id out of the wildcard route remainder (`params['*']`) and looks it up in `dataItems`
  directly, no separate `apiLoad` needed.
- Mapping from the 5 mockup-covered sidenav items to existing components: overview→
  `PatternSettingsEditor`, pages→`PatternPagesEditor` (page-type only), access→**merged**
  Permissions+Filters (see below), data/activity→`SourcesTab`/`ActivityTab` (page-type only). Theme,
  Page Templates, Format Manager, and any pattern-defined custom tabs are NOT covered by any mockup —
  relocated into the same sidenav group as plain links, content unredesigned (future work).
- Removed the old top tab-strip (`PatternEditor`'s `Nav` component) from
  `patterns/admin/pages/patternEditor/index.jsx` entirely — the `pages`/`PageComp` resolution logic
  that picks which tab renders is untouched, only the rendered nav JSX is gone.

**2. Overview page redesign** (`default/settings.jsx` + `.theme.js`) — matches
`admin-pattern-overview.html`'s identity/environment/danger-zone card layout, extended (not trimmed)
to keep every pre-existing feature the mockup doesn't show: `LocationsEditor`, `RetiredSubdomainsEditor`,
the Page-only preload-data toggle (folded into the environment card), the Auth-only disable-signup
card, and the Duplicate (live-progress, server-task-polling)/Delete (inline confirm) danger zone.
Save/Reset moved from inside the first field grid into one page-level sticky bar (explicit user fix —
"appears to only serve the first block, but that's not true") that visually covers everything below it.
A "section attributes" card (re-themed JSON editor, same field Format Manager edits) was added then
**removed again** per explicit user direction ("remove section attributes from the overview page") —
Format Manager tab is the only place to edit `additionalSectionAttributes` now, as before this session.

**3. Access page — Permissions + Filters merged onto one page**, per the mockup's own structure
(`admin-pattern-access.html` has both a permissions section and a row-filters section). New
`default/accessEditor.jsx` (`PatternAccessEditor`) just stacks the two fully-independent existing
editors (`PatternPermissionsEditor`, `PatternFilterEditor`) — no shared state, each keeps its own
save/reset. Filters retained 100% of its real functionality (subdomain-keyed groups, add/remove rows,
the "Sync to Pages" long-running server task with live progress + falcor cache invalidation). Filters
removed as its own top-level sidenav item (`buildPatternMenuItems`) and from `patternEditor/index.jsx`'s
`navPages` — confirmed via grep no other code deep-links to the old standalone `.../filters` route.

**4. `ui/components/Permissions.jsx` — theme-registry integration + a real design pass**, since this
shared component (used by this Access page, `patterns/page/pages/edit/editPane/permissionsPane.jsx`,
`patterns/datasets/components/SourceAccessEditor.jsx`, `patterns/page/components/sections/sectionMenu.jsx`)
had ZERO theme-registry wiring before this session — a hardcoded local `permissionsTheme` object with
raw pre-v6 grays, never reading `ThemeContext`. Registered `ui/components/Permissions.theme.js` in
`ui/defaultTheme.js` (flat map, no `styles[]` — component has one look, used the same everywhere) —
all 4 consumers get the v6 upgrade with zero logic changes. Iterated to match the mockup + explicit
user feedback across several rounds:
  - Name + permission-domain-editor sit on one row (was stacked); name column gets `min-w-[25%]` so
    short names ("public") and long ones align to the same left edge across rows.
  - The permission-domain editor itself (the "`* × View Page ×  ⌄`" pills) uses a new borderless
    `MultiSelect` style (`'plain'`) — no ring/border, since the ROW is the visual boundary, not each
    control in it — capped at `max-w-[50%]` (still `flex-1`, so it grows up to that cap, never past it).
  - Remove is now a Trash icon button (`text-pencil hover:text-brick`, matching the mockup) instead of
    a plain "remove" text link.
  - "add user access"/"add group access" are one shared `MultiSelect` style (`'addAccess'` in
    `ui/components/MultiSelect.theme.js`) — a small self-contained bordered pill button
    (`mainWrapper` carries the border, not `inputWrapper`, since `caretWrapper` is a plain sibling not
    an absolutely-positioned overlay — only makes sense together in a `w-fit` shrink-wrapped button),
    pushed to the far right of their header row via a `<span className='flex-1'/>` spacer, with the
    dropdown's own search re-enabled (`searchable={true}`, was `false`) and its `menuWrapper` widened
    to `min-w-[22rem]` (CSS `min-width` beats the smaller inline `width` `MultiSelect.jsx`'s
    `computeMenuStyle` sets from the trigger's own narrow bounding box — fixes the "menu scrolls for
    long emails" complaint without touching that positioning logic). Earlier iteration had two
    differently-colored styles (cobalt for user, neutral for group) — user said the neutral one was
    correct, consolidated to one shared style.

**5. Access-control bugs found and fixed** (`patterns/admin/pages/editSite.jsx`,
`patternEditor/index.jsx`, new `patterns/admin/utils.js` export `hasPatternManageAccess`, new
`render/spa/utils/index.js` export `resolveSubdomainAuthPermissions`):
  - `editSite.jsx`'s `PatternList` showed a "no access" badge for **any** pattern that had ever been
    edited through the current `PatternPermissionsEditor` UI, regardless of what was actually granted.
    Root cause: `PatternPermissionsEditor` saves a **subdomain-keyed** shape
    (`{"<subdomain-or-*>": {groups,users}}`, each value independently JSON-stringified), but the
    access-gate code read `authPermissions` with a naive `parseIfJSON` and treated the RESULT as if it
    were already the flat `{groups,users}` object — so it never found a top-level `.groups`/`.users`
    on any pattern using the real save format, denying everyone but a literal `${app} Admin` group
    member. There's already a correct resolver for this exact shape
    (`resolveSubdomainAuthPermissions`, used when building a real visitor's routes) — it just wasn't
    reused by the admin-side gates. Exported it and built `hasPatternManageAccess(user, isAdmin,
    rawAuthPermissions, subdomain)` (`patterns/admin/utils.js`) as the one shared gate, used by both
    `editSite.jsx`'s per-row check and `patternEditor/index.jsx`'s whole-page check (which had ALSO
    been checking the wrong thing entirely — the generic site-level `authPermissions` from
    `AdminContext` instead of the specific pattern's own).
  - `hasPatternManageAccess` treats "no real grants at all" (either never configured, OR configured
    but genuinely empty groups/users — confirmed as the exact real-world shape on a live production
    pattern via a read-only CLI check) as unrestricted, matching the established convention already
    used elsewhere in this codebase (`patterns/page/pages/{view,edit}/index.jsx`'s
    `!d.authPermissions || isUserAuthed(...)`).
  - `editSite.jsx`'s pattern-name column Link was unconditional — clicking the NAME navigated to the
    edit page even when the Actions column showed "no access" (only the action icons were gated). Now
    gated the same way.
  - **Known, deliberately unfixed**: `themes/list.jsx` and `themes/editTheme.jsx` still call
    `isUserAuthed` directly on the site-level `authPermissions` with the same naive-parse pattern the
    original bug had. Not currently broken (nothing writes the site-level field in the subdomain-keyed
    shape yet) but same latent bug class if that ever changes.
  - **Confirmed via a background research pass**: this behaves identically under SSR (same code path,
    but SSR always renders anonymously — no authenticated user ever reaches these checks there, so the
    fix's real effect is client-side-only, same as before) and for a multi-tenant flow (same
    `PatternList` component either way; a tenant's own admin user is provisioned into a literal
    `"${slug} Admin"` group with old-format `authPermissions`, so they hit the `isAdmin` short-circuit
    before ever touching the fixed code path — no behavior change for tenants either way).

**6. Breadcrumb + container/card fixes:**
  - Replaced `patternEditor/index.jsx`'s old OL/LI + SVG-triangle-separator `Breadcrumbs` component
    (which also had a real bug — its `.map` callback shadowed the outer `page` string param with the
    loop variable of the same name, so the trail's second segment always rendered blank) with a plain
    `admin / <pattern name> / <tab>` trail matching `siteConfig.jsx`'s own `AdminBreadcrumb` exactly.
  - Fixed two related "doesn't match the Sites page" visual bugs: (a) `patternEditor.theme.js`'s
    `content` key carried a leftover `bg-[var(--t-panel)]` — a compensating fix from when this page
    sat inside `SectionGroup`'s outer white card, no longer needed once that outer card was removed
    (see next point) — it just repainted the same unwanted white box one layer down; (b)
    `SectionGroup` (`patterns/admin/siteConfig.jsx`) always wrapped its children in a full white-card
    shell (`bg-panel border rounded-lg shadow`) appropriate for Sites/Themes but NOT for the Pattern
    Editor pages, which build their own per-section cards matching the mockups (no outer page-level
    card at all). Added a `card={false}` prop to `SectionGroup` (new `outerPlain`/`innerPlain` theme
    keys, Sites/Themes usage unaffected) and used it only for `patternConfig`'s wrapper, with
    `padding="p-0"` so the breadcrumb sits flush against the edges like `AdminBreadcrumb` does, moving
    the actual gutter padding into `patternEditorTheme.content` instead (so it applies below the
    breadcrumb, not around it).

All of the above verified live via the established local-only testing convention (see below) after
every change, never against `dmsserver.availabs.org`.

## Local testing convention (reuse this every time)

- `.env.local` (gitignored): `VITE_DMS_APP=shaun-test-app`, `VITE_DMS_TYPE=test`,
  `VITE_API_HOST=http://localhost:3001`. A local `dms-server` (`DMS_DB_ENV=cli-test`) is expected
  already running on port 3001.
- `npx vite --port 5175`.
- Mint a JWT: `POST http://localhost:3001/login` with `{email:'admin@availabs.org',
  password:'test123', project:'shaun-test-app'}`, inject the returned token into a Playwright
  `storageState` JSON's `localStorage.userToken` for origin `http://localhost:5175`.
- `shaun-test-app` (site id 2) permanently has only `main` (id 1, page pattern, `/content`) and `auth`
  (id 3) patterns — no `admin`-type pattern exists by default. To reach `/admin/*` routes, temporarily
  create one (`dms raw create shaun-test-app "test|admin:pattern" --data
  '{"name":"Admin","pattern_type":"admin","base_url":"/admin"}'`) and link it into the site's
  `patterns` array via `dms raw update 2 --data '<FULL json>'` (full replace — see the CLI gotcha
  below), then **unlink it again** (back to just ids 1 and 3) before finishing — the CLI can't delete
  the orphaned row itself ("Authentication required to delete items"), leaving it unlinked is accepted
  practice.
- **CLI gotcha, verified this session**: `dms raw update --data` does NOT fully replace a nested
  object field the way its own docs claim ("shallow merge... at the first nesting level") — omitting a
  previously-set nested key (e.g. `theme.selectedTheme`) leaves the old value in place; only an
  explicit `null` in the payload actually clears it. Verified via repeated fresh `get`s in separate CLI
  invocations, not a response-caching artifact. See memory
  `feedback_dms_raw_update_data_nested_merge.md`.
- Always kill the vite process and remove `.env.local` when done — never leave a stray dev server or
  test fixture link behind.

## Done THIS session (2026-09-20, continued) — Pages tab

`PatternPagesEditor` (`patternEditor/pages/pagesEditor.jsx` + `.theme.js`) was already functionally
rich (lens filters, pages/sections scope toggle, drag reorder, bulk publish, sections panel with
groups, preview/delete modals) and its theme had already been token-ported to `var(--t-*)` on
2026-09-16 — so this pass was a real retheme + one missing-content gap, not a rewrite:

- **Added the header strip the mockup has and the implementation didn't**: an `h1` "Pages" +
  subtitle, plus a 3-cell stat pill (`pages` / `published` / `levels deep`), computed live from
  `pages` state (`pageStats` useMemo — `published` = count where `published !== 'draft'`,
  `levelsDeep` = 1 + max parent-chain depth). New theme keys: `header`, `headerTitleWrap/Row`,
  `headerTitle`, `headerSubtitle`, `statsBar`, `statCell`, `statValue`, `statLabel`.
- **Retheme pass on the toolbar** to the `t-metaXS`/`t-proseSM` + `rounded-md` convention already
  established in `settings.theme.js`/`accessEditor`'s siblings this session (was raw `text-[11px]`
  sizes + `rounded-full` search/buttons, inconsistent with every other ported admin tab).
  `lensChip`/`lensChipActive` split into a plain and a new `lensChipActiveWarn` (amber) variant —
  `queue`/`orphans`/`dupes` lenses now render amber-active, matching the mockup's "to publish"/"no
  access" amber quick-filter chips (previously all active lenses rendered the same cobalt).
- **`PageActionsComp`**: added inline Eye (view, opens `viewUrl` in a new tab) and Pencil (edit)
  icon buttons before the existing "⋯" popup, matching the mockup's icon row — Publish/Discard/
  Duplicate/Delete stay in the popup (menu already covered everything; this is additive, nothing
  removed). `_actions` column `size` bumped 40→96 to fit three controls. New theme key `rowIconBtn`
  (same convention as `Permissions.theme.js`'s `removeBtn`).
- **Real dark-mode bug fixed, same class as the Table fix earlier this session**: the four
  Table column-type view components this tab is the only consumer of
  (`ui/columnTypes/{treeNode,sectionsChip,last_published}.jsx` — `publishState.jsx` checked, needed
  no change) had hardcoded `text-gray-*`/`bg-white`/`bg-gray-100` literals with zero theme wiring —
  unreadable/invisible on a dark panel (page titles, url slugs, child-count badges, the sections
  chip, the "last published" text all affected). Swapped every NEUTRAL color to the matching
  `var(--t-*)` token (`t-ink`/`t-graphite`/`t-pencil`/`t-well`/`t-panel`/`t-rule`). Left the
  semantic status colors (draft=amber, published=emerald, orphan=red, component-type badges)
  as literal Tailwind colors, matching `pagesEditor.theme.js`'s own top-of-file comment that this
  is an intentional, already-reviewed choice for this file.
- **Verified live** on `shaun-test-app` per the convention below: header stats, lens counts, and
  the actions popup all update correctly after adding a page (1→2 pages, "to publish"/"empty"
  counts incrementing, new page's Draft/amber pill + "Never" last-published), confirmed in both
  light and dark mode via Playwright screenshots, zero console errors. Test page cleaned up via
  the live UI's own Delete flow (CLI delete still blocked by the known "Authentication required to
  delete items" limitation — see the testing-convention note below), admin pattern unlinked,
  `.env.local` and scratch scripts removed afterward.
- **Not done in this pass** (scope was retheme + the header gap, not a structural rewrite): the
  sections-panel's own internal typography (still raw `text-[Npx]` sizes, though already on
  `var(--t-*)` color tokens so not a dark-mode bug).
- **User-feedback fixup, same session**: the first pass put `bg-[var(--t-panel)]` on both the new
  `header` and the pre-existing `toolbar`, so with the table's own `bg-panel` card below them the
  page read as three stacked white/panel boxes glued together — flagged live ("filters are in
  white bg, pages title panel too"). Fixed by dropping the panel background from both `header` and
  `toolbar` (they now sit flush on the page background, same as the mockup — only the stats pill
  and the table card keep `bg-panel`). Also split `toolbar` into two rows (`toolbarRow1`/
  `toolbarRow2`) to match the mockup's actual layout: row 1 is search (`flex-1`, was a fixed
  `w-56`) + the primary "+ New Page" button sitting right next to it; row 2 is the lens/quick-filter
  chips + scope toggle + secondary controls (previously all seven of these were crammed into one
  row, which is what made search and the add button land in the wrong visual position — search
  buried mid-row, add-page pushed to the far right past unrelated expand/collapse buttons).
  Re-verified live in both light and dark mode after the fix (see the light/dark screenshot
  checks — no white panel boxes, search+add-page now the prominent top row).
- **Second user-feedback fixup, same session**: even after the above, Pages' `header`/`toolbar`
  still carried their own `px-4 py-3` — a second, DIFFERENT padding layer stacked on top of the
  outer `patternEditor.theme.js` `content` wrapper's `p-5 lg:p-8` gutter that every tab (including
  Overview) already renders inside. Overview's own `header` (`settings.theme.js`) has NO
  horizontal/top padding of its own (`pb-3 mb-1 border-b` only) — it relies entirely on that outer
  gutter, so its title sits flush at the same left edge as the page. Pages' extra `px-4 py-3`
  pushed its title further right/down than Overview's, flagged live ("padding overview uses around
  its title panel is different from pages page"). Fixed by dropping `px-4 py-3` from both `header`
  (now `pb-3 mb-1 border-b`, matching `settings.theme.js` exactly) and `toolbar` (now `pt-3 pb-3`,
  no horizontal padding) — confirmed via screenshot that Pages' "Pages" title and Overview's
  pattern-name title now sit at the identical left edge and vertical offset.
- **Access page titles, same session**: "Permissions" and "Filters" (the two sections
  `PatternAccessEditor` stacks) were still using the small in-card `t-metaSM` lowercase label
  style shared with Overview's minor sub-cards ("identity", "danger zone", etc.) — i.e. Access had
  no page-level heading at all, unlike every other mockup-covered tab. Per explicit request ("make
  permissions and filters titles follow the same theme as pages and overview page's titles"),
  promoted both to the same `t-displayMD`/`text-[var(--t-ink)]` treatment used by Pages' "Pages"
  and Overview's pattern-name title, title-cased ("Permissions"/"Filters", was lowercase
  "permissions"/"row filters") — `permissionsEditor.theme.js`'s and `filterEditor.theme.js`'s own
  independent `cardHeaderLabel` keys (not shared with any other component, so zero blast radius).
  Verified live in both light/dark — reachable at `/<pattern-id>/permissions`, NOT `/access`
  (sidenav label is "Access" but `patternEditor/index.jsx`'s `navPages` entry kept the legacy
  `permissions` path segment — tripped up the first verification attempt, worth remembering for
  next time).
- **Third fixup, same session**: promoting the titles to `t-displayMD` (previous bullet) left them
  sitting on the card's OWN `bg-panel` — the title bar was still the top row of the same bordered
  panel box (this matches what the mockup itself does for "permissions"/"row filters", but not
  what Pages'/Overview's actual page-level titles do, which sit flush with no panel behind them —
  flagged live ("permissions and filters titles have white background, in mockups they don't").
  Fixed by moving each title OUT of the card entirely: `permissionsEditor.jsx`/`filterEditor.jsx`
  now wrap their return in a new `outerWrapper` (`flex flex-col gap-3`) containing a flush `header`/
  `headerTitle` block (no `bg-panel`, no border) followed by the existing `wrapper` card (unchanged
  — `bg-panel border rounded-lg`, now starting directly with the subdomain sections, no header row
  inside it). Removed the now-dead `cardHeader`/`cardHeaderHint` keys (renamed to `header`/
  `headerHint`) and an actually-unused `cardHeaderIcon` key found on `filterEditor.theme.js` while
  making this change. Verified live in both light/dark — titles now flush, cards start clean below
  them.

### Done THIS session (2026-09-21) — Activity tab

`ActivityTab` (`patternEditor/pages/activityTab.jsx` + `.theme.js`) was a plain generic Table (Page/
Action/Who/When columns) with no header, no filters, no grouping — nothing like the mockup's
day-grouped feed. Full redesign, not a retheme:

- **New theme** (`activityTab.theme.js`, fully rewritten): day-grouped feed card (`feedCard`,
  `feedDayHeader`, `feedRow`, `feedAvatar`, `feedActor`, `feedTime`) + action badges using the real
  tessera semantic tokens directly (`badgePublish`→`t-go`, `badgeEdit`→`t-cobalt`, `badgeDiscard`→
  `t-amber`, `badgeDelete`→`t-brick`, `badgeNeutral`→well/graphite for renamed/created/duplicated) —
  unlike `pagesEditor.theme.js`'s deliberately-literal-Tailwind-color badges (a decision specific to
  that file's pre-existing pre-tessera badges), this is new code so it uses the design tokens
  directly, matching the mockup's own `text-go`/`text-cobalt`/etc. classes.
- **`activityTab.jsx`**: replaced the generic `Table` with a hand-rolled feed list (same reasoning as
  `pagesEditor.jsx`'s `SectionsPanel` — the mockup's row shape, avatar + colored badge + title +
  actor + time, doesn't map to tabular columns). Reused `pagesEditorTheme`'s generic `header`/
  `headerTitleWrap/Row`/`headerTitle`/`headerSubtitle`/`statsBar`/`statCell`/`statValue`/`statLabel`
  and `lensChip*`/`lensCount*` keys directly rather than duplicating them (they're generic "page
  title + stat pills" / "quick-filter chip" shapes, not Pages-specific).
  - Header: h1 "Activity" + subtitle ("who changed what, most recent first · last change `<timeAgo>`")
    + 3 stat pills (total changes, publishes, distinct editors) — all computed live from real history
    data, not hardcoded like the mockup's "11 changes · apr".
  - `classifyAction(action)` maps every raw history string to `{label, category, badge}` — category
    is one of `publish`/`edit`/`delete`, badge is the theme key. Everything except `'published
    changes.'` currently classifies as `edit` (discard/rename/duplicate/comment/create/edited-section
    all bucket there) — confirmed via grep that NO code anywhere calls `appendHistoryEntry` with a
    delete-flavored action, so the `delete` category is real and available (matches the "Dupe Slugs 0"
    convention already established for Pages' lenses) but will always read 0 today.
  - Toolbar: quick-filter chips (All/Publishes/Edits/Deletes, real counts) + an actor `UI.Select`
    filter ("Actor: anyone" + every distinct actor email seen in the data) — both wired to actually
    filter the rendered feed, not decorative.
  - Feed: grouped by calendar day (mockup's "apr 28"/"apr 24" bands), each row: avatar circle (actor's
    first initial, always cobalt — tried mirroring the mockup's per-row avatar color to the action
    type but the mockup's own sample rows don't follow a consistent rule for that, so kept the avatar
    tied to the ACTOR consistently and let the already-present colored badge carry the action
    semantics instead), colored action badge, page title (clickable to `/edit/<slug>` when
    resolvable), actor's full email (mockup showed full emails, previous impl truncated at `@` —
    strictly more informative, kept), and clock time.
  - Footer: real `<filtered> of <total> events` count (`pagesEditorTheme.footer`) — dropped the
    mockup's "load older" pagination control, since `loadPageHistory` already loads full history in
    one shot (no real "older" data to page into) and the mockup's own comment admits its timestamps/
    actors are representative filler, not a real pagination contract to replicate.
- **Real bug found and fixed while building this** (`pagesEditor.jsx`'s `publishPage`/`discardPage`/
  `duplicatePage`): each built its own narrow `config.format.attributes` list for `apiUpdate` and none
  included `history`, so `appendHistoryEntry`'s result was written as an inert inline
  `{entries:[...]}` blob instead of being resolved into a real `{id, ref}` pointer at a `page-edit`
  row — this is exactly the root cause memory `project_page_history_duplicated_patterns_bug.md`
  diagnosed on 2026-08-13 from prod data but hadn't yet directly observed a sample of; directly
  reproduced here because Activity tab's `loadPageHistory` reads history exclusively through that ref
  and came back permanently empty. Fixed by adding
  `{ key: 'history', type: 'dms-format', format: \`${app}+${patternInstance}|page-edit\` }` to all
  three functions' attribute lists (the `page-edit` suffix + substitution rule traced through
  `page.format.js`'s default attributes → `initializePatternFormat`/`updateAttributes` in
  `dms-manager/_utils.jsx`). **This is a real, generally-applicable bugfix, not scoped to the Activity
  tab** — it also fixes Pages tab's "Last Published" column, which had silently read "—" forever for
  every page managed exclusively through this bulk panel. Verified live end-to-end: publish/discard/
  duplicate through Pages tab now produce a real `{ref,id}` history pointer, Activity feed and "Last
  Published" both populate correctly. Memory updated to reflect the fix; the memory's second root
  cause (dangling refs on pre-fix-era duplicated patterns in prod) is unrelated data repair, not
  touched by this change.
- Verified live on `shaun-test-app` in both light/dark: header stats, quick-filter counts (incl.
  filtering to just "Publishes"), day grouping, and badge colors (published/created/duplicated) all
  confirmed against real generated activity (page created → published → duplicated), zero console
  errors. Test pages and the temp admin-pattern link cleaned up afterward (three orphaned `page-edit`
  rows left behind from deleted test pages — same "CLI can't delete this, leaving it orphaned is
  accepted practice" precedent as the admin-pattern unlink step below).

### Done THIS session (2026-09-21, continued) — Data tab (`SourcesTab`)

The existing `admin-pattern-data.html` mockup was explicitly aspirational (a "preview — what this
tab becomes" ghost table depicting a rows/size/kind model no code implements, over an empty-state
card for a pattern with no data environment) — not a usable redesign target. Per explicit user
direction ("create a good mock design first... make sure no feature is lost"), did a full feature
inventory of the real `SourcesTab` (`patternEditor/pages/sourcesTab.jsx`) before touching any code:
parallel UDA-sources + page-section-usage loading, Name/Origin/Used-By/Views/Status columns sorted
by usage, status+origin filters, free-text search, an orphan-sources warning banner, a manual
Refresh, and an inline summary string (with a "loading section counts…" secondary-phase badge) —
then designed a NEW mockup around that real feature set (overwriting the old aspirational content;
the old empty-state/ghost-table concept wasn't preserved anywhere since it didn't reflect anything
implementable) and iterated on it live (screenshots, both light/dark) before writing any React:
- Added the header stats strip (sources/active/orphaned) `SourcesTab` never had, matching every
  other tab.
- Two rounds of user-flagged pill-color fixes on the mockup, both carried into the real
  implementation: (1) status pills switched from a CSS-token accent border (`border-go/40`/
  `border-amber/40`, read as a bright glow in dark mode) to literal pastel colors, then (2) further
  simplified to just `text-go bg-goSoft`/`text-amber bg-amberSoft` (no border) so they visually
  match the header's own stat-pill colors, per explicit request; (2) origin (Internal/External)
  collapsed from a bright indigo-50 "Internal" pill + neutral "External" pill into ONE neutral
  style for both — the distinction is the label text, not a status worth its own color.
- Toolbar restructured from one row to two, matching `admin-site.html`'s pattern-list convention
  per explicit request: row 1 is the search box at full width + Refresh; row 2 is the status/origin
  filter dropdowns + the inline summary count string.
- Implementation (`sourcesTab.jsx` + `.theme.js`): `OriginCell`/`StatusCell` simplified to the new
  shared pill classes; render restructured to header + two-row toolbar (reusing
  `pagesEditorTheme`'s `header`/`headerTitleWrap/Row`/`headerTitle`/`headerSubtitle`/`statsBar`/
  `statCell`/`statValue`/`statLabel`/`toolbar`/`toolbarRow1`/`toolbarRow2` — all generic enough to
  reuse directly, no duplication) + the unchanged orphan-banner/table-wrap tail. **Zero business-logic
  changes** — `loadAll`, `getSources`, `sourceRows`/`filteredRows` computation, all filter state, the
  columns array, and the Table itself are untouched; verified via diff review that only `OriginCell`
  and the JSX render tree changed.
- **Real bug found and fixed while verifying live**: `getSources(falcor, envs)` had no `.catch`, so
  a single failed/hung env would reject the whole `Promise.all` and `setLoading(false)` never runs —
  the tab would spin on "Loading sources…" forever with no error surfaced. Added `.catch(() => [])`,
  matching the sibling `apiLoad(...).catch(() => [])` already there.
- **Known, NOT fixed — out of scope, infra not code**: verifying against a fully-populated table
  live was blocked by `shaun-test-app`'s fallback `pgEnv` resolving to `hazmit_dama` (a real
  project's pgEnv, exactly the anti-pattern memory `feedback_test_pgenv_convention.md` warns
  against) whose `uda/hazmit_dama/sources/length` falcor call hangs indefinitely server-side
  (confirmed via a direct `curl` timing out at 15s with zero bytes back — a local dms-server/DB
  connection issue, unrelated to this component or the `.catch()` fix, which only helps rejections,
  not a request that never settles at all). Verified everything else live instead: the header/
  toolbar/filter chrome renders correctly styled in both light and dark with real (zero-count) data,
  zero console errors.

### Done THIS session (2026-09-21, continued) — Pattern Editor's "Theme" tab (`themeEditor.jsx`)

This is the Pattern Editor's embedded theme-override editor — a fully custom, non-mockup-driven
internal tool (base-theme picker + component/example preview pickers + a settings-category sidebar
with generated FieldSet controls + a live `react-frame-component` preview), a sibling implementation
of the already-v6-designed site-level `themes/editTheme.jsx` (per that pair's own comments, "should
look and feel identical" but kept separate since they edit different things — this one a PATTERN's
override layer + `selectedTheme` switch, that one one saved `theme_refs` row outright). Per explicit
request, designed a mockup FIRST (`design_system_v6/pages/admin-pattern-theme.html`, adapting
`admin-theme-edit.html`'s body into the Pattern Editor's own sidenav chrome) before touching code,
inventorying every real feature so none got lost in translation:
- **Root-caused the reported bug** ("preview overlaps with controls") via live DOM measurement
  before designing anything: the real component appends a raw JSON `<pre>` dump of the pattern's
  theme overrides as a THIRD sibling below the sidebar+preview row, inside a `wrapper` fixed to
  `h-[calc(100vh_-_3.5rem)]` with no height cap of its own on the `<pre>` — confirmed live that
  body/sidebar/frameWrapper were all clipped to a ~239px band while the unbounded debug dump
  claimed the rest of the fixed-height box. Root cause has two parts: (a) that `calc()` only ever
  accounted for a bare 3.5rem topnav, which stopped being true once this tab moved into the Pattern
  Editor's own sidenav chrome (behind a breadcrumb bar + `patternEditor.theme.js`'s `content`
  padding) during this week's SideNav restructure — the sibling `editTheme.jsx` never hit this
  because it has no such debug view AND sits directly under a bare topnav, not nested a level
  deeper; (b) the debug view itself has no bound.
- **Mockup fix, carried into the real implementation**: moved the raw-overrides JSON into a
  **Preview / Raw Overrides tab switch** inside the preview pane itself (same fixed box, swapped
  content between a `<Frame>` and a `<pre>`) instead of stacking it below the row — bounded by
  construction, can't compete for layout space again. Switched `wrapper`'s height from the
  viewport-relative `calc()` to `h-full`, inheriting the correct number from the already-correct
  ancestor flex chain (`patternEditor.theme.js`'s `wrapper: h-full flex flex-col` → `content:
  flex-1 flex flex-col`) instead of re-guessing it.
- **Removed the "back" button** per explicit request — this tab is reached via the Pattern
  Editor's own sidenav now, not a standalone flow that needs its own way back (dead `useNavigate`
  import removed too).
- **Every other real feature preserved, none dropped**: base-theme `MultiSelect` (this pattern's
  extra feature over `editTheme.jsx` — lets it switch which registered theme it inherits, editTheme
  edits one theme outright), component + example pickers, settings-category selector, Save/Reset/
  **Full Reset** (also unique to this pattern-level editor — clears ALL override layers, not just
  the open form; brick-toned since more destructive than Reset), the generated `ControlRenderer`
  FieldSet controls, the live iframe preview with its font-injection fix. Controls sidebar
  confirmed staying on the right (`order-2`) per explicit request — the mockup's first draft had
  it on the left, corrected before implementing.
- Verified live in both light/dark: Preview tab shows the live component preview at full height (no
  more squeeze), Raw Overrides tab shows the same JSON scoped cleanly within the same pane, no back
  button, zero console errors.

### Done THIS session (2026-09-21, continued) — title-merged-with-card bug, 5 pages

Flagged live: on Sites list, Themes list, Profile, Users, and Groups, the page title read as
merged into the same white card as the content below it (search/table/etc.), unlike every mockup
(`admin-{site,themes,users,groups,profile}.html`), which always renders the title flush on the page
background with the card starting below it. **This reverses part of an earlier-session decision**
(this file's "Done in earlier sessions" note and `siteConfig.theme.js`'s own comment: "that
treatment is Sites/Themes'" — i.e. Sites/Themes were deliberately kept on the old whole-page
`SectionGroup` card while Pattern Editor pages got `card={false}` — that decision, revisited live,
turned out wrong for the title specifically).

Root cause was the same shape on all 5 pages but lived in two different wrapper mechanisms:
- **Sites (`editSite.jsx`) / Themes (`themes/list.jsx`)**: `siteConfig.jsx`'s `SectionGroup` wraps
  the ENTIRE page (title + content) in one `card` by default. Themes' own `list.jsx` already had a
  local `tableWrapper` card around just its table (so its bug was purely the outer wrapper) — fixed
  by adding `card={false}` to its `SectionGroup` call, no page-level changes needed. Sites'
  `editSite.jsx` had NO local card at all (its `<Table/>` relied entirely on the outer `SectionGroup`
  for its box) — fixed by adding `card={false}` to its `SectionGroup` call too, AND adding a new
  `tableCard` wrapper (`bg-panel border rounded-lg`) around `<Table/>` in both `PatternList` and
  `TenantList` so the table keeps its card now that the outer one is gone.
- **Profile/Users/Groups** (`patterns/auth/pages/{profile,authUsers,authGroups}.jsx`): a parallel
  bug in the auth pattern's own theme, `defaultTheme.js`'s `authPages.manage` — `pageWrapper`/
  `profileWrapper` wrapped BOTH the header row and the content in one card. Fixed by moving
  `headerRow`/`headerOuter` OUTSIDE `pageWrapper` in `authUsers.jsx`/`authGroups.jsx` (now a
  `<>...</>` fragment: flush header, then `pageWrapper` around just `<Table/>`), restyling
  `headerRow`/`headerOuter` to the flush convention (`pb-3 mb-3 border-b`, dropped their own
  `px-4 py-3` + card-internal `border-b`), and giving `profileActions` (the Reset Password band)
  its own `bg-panel` card since `profileWrapper` no longer provides one — `profile.jsx` itself
  needed zero JSX changes, only the theme swap, since its header/actions were already two separate
  sibling divs under one shared wrapper.
- Deliberately left `createSite.jsx` (`NewSite`, still on the default `SectionGroup` card) alone —
  not reported, out of scope for this pass.
- Verified live in both light and dark on all 5 pages, zero console errors.

### Done THIS session (2026-09-21, continued) — excess padding on the same 5 pages, Overview as reference

Follow-up to the title-merged-with-card fix above: flagged live that all 5 pages still had more
inset around the title than Overview, even after the card fix — "the overview page is a good ref of
how much it should be." Root cause, traced live (not guessed): these pages nest their content inside
`<LayoutGroup>` (default `"content"` style: `py-8`, `pl-6 lg:pl-12`, `pr-6 lg:pr-8` — a much bigger
band than Pattern Editor's own `p-5 lg:p-8`), and Sites/Themes ALSO nest a `SectionGroup` inside
that (its own `outer` `p-1.5` + `defaultPadding` `p-4`) — so Sites/Themes were stacking THREE
padding layers where Overview has effectively one.

- Added a new named LayoutGroup style, `"adminContent"` (`ui/components/LayoutGroup.theme.jsx`),
  matching `patternEditor.theme.js`'s own `content` padding (`p-5 lg:p-8`) exactly. Wired it in at
  both consumers: `adminConfig`'s `<LayoutGroup>` call (`siteConfig.jsx`) and the auth pattern's
  `manageLayoutGroupStyle` default (`defaultTheme.js`, was `undefined` → LayoutGroup's own
  "content" default).
- Added `padding="p-0"` to the Sites/Themes `SectionGroup` calls (matching `patternConfig`'s own
  existing `padding="p-0"` precedent), removing the redundant second layer.
- **Real bug hit and fixed while verifying**: dropping `content` style's `max-w-[1200px] mr-auto`
  (the new style doesn't cap width, matching Overview's own uncapped `content`) exposed a
  **pre-existing, unrelated overflow** one level up the tree — `Layout.jsx`'s own childWrapper
  measures ~66px wider than the actual viewport allows (confirmed live: every wrapper in the
  LayoutGroup chain already had `min-w-0`, adding more made no difference — the excess originates
  above LayoutGroup entirely, not fixed here). `content`'s `max-w-[1200px]` was silently absorbing
  that excess; without it, Sites' wide `Table` immediately overflowed the page horizontally
  (`Add pattern` button and the table's `Actions` column rendering off-screen, confirmed via
  `document.documentElement.scrollWidth` 1506px vs a 1440px viewport). Fixed pragmatically by
  keeping `max-w-[1200px]` on the new `adminContent` style too (cheap insurance, doesn't affect the
  padding fix) rather than chasing the real cause into `Layout.jsx` for what was meant to be a
  padding tweak — **`Layout.jsx`'s own ~66px width discrepancy is real and unfixed; flag it if it
  resurfaces elsewhere** (e.g. a future admin page that also wants no width cap).
- Verified live: all 5 pages' titles now measure the exact same left inset as Overview's own title
  (272px from the viewport edge, both at a 1440px viewport width), in both light and dark, with the
  table/toolbar/buttons fully visible (no more off-screen cutoff).

### Done THIS session (2026-09-21, continued) — Users' stats box pushed its title lower than every other page

Flagged live: Users' title sat visibly lower than Sites/Themes/Groups/Profile's. Cause: Users'
`headerRow` puts the title, a spacer, a boxed user/group-count stat pair, and "Add new" all in one
flex row — the stat pair was a bordered two-cell box (`bg-panel border rounded-lg`, each cell with
a big number over a small label) TALLER than the plain title text next to it, so the row's own
height (and the title's vertical centering within it) grew to fit the box. Groups/Profile/Sites/
Themes don't have this per-row stat box, so their rows stay title-height and their titles sit
higher — same content, different row heights.

First fix: replaced the boxed stat pair with plain inline text ("1 user · 2 groups"). **Reverted
per explicit follow-up request** — the user wanted the boxed stats kept (matching Sites' own
`statsStrip` look, "so all the stats look the same") and the alignment fixed a different way: a
blank second line under the title instead, mimicking how Sites' title never has this problem in
the first place — Sites' title always has a REAL second line (`identitySubtitle`, the site's
domain), which already gives its own title block roughly the same height as its boxed stats box,
so its row doesn't grow/re-center the way Users' bare one-line title did.

Final fix: restored `headerStats`/`headerStatsItem`/`headerStatsValue`/`headerStatsLabel` (auth
`defaultTheme.js` + `authUsers.jsx`'s local fallback defaults) to the boxed style, and added a new
`headerSubtitleSpacer` key (`t-metaSM mt-1`, same sizing as `identitySubtitle`) — an empty
`aria-hidden` line (`&nbsp;`, decorative only) rendered under "Users" specifically to hold the same
second-line height Sites gets for free from its real subtitle. Verified live: Users/Groups/Sites'
titles all sit at the identical vertical position (title block top ~91px in a 1440px-viewport
screenshot), in both light and dark, with Users' stats box now visually matching Sites' own.

### Done THIS session (2026-09-21, continued) — same title-vertical-alignment bug on Data + Activity tabs

User asked to check Data (`sourcesTab.jsx`) and Activity (`activityTab.jsx`) tabs for the same
issue just fixed on Users. Measured live (Playwright `getBoundingClientRect` on the `<h1>`): Pages
tab's title sat at `top: 88` (matching Overview), but Data and Activity both sat at `top: 95.75` —
a real, measurable ~8px misalignment, same mechanism as the Users bug (the `headerTitleWrap` block
was shorter than the adjacent `statsBar` box, so the row's `items-center` re-centered the title
lower).

Root cause here was more specific than Users': `sourcesTab.jsx`'s `headerSubtitle` `<p>` was
**unconditionally empty** (`<p className={p.headerSubtitle}></p>`), and `activityTab.jsx`'s only
rendered when `rows.length > 0` (rendered `false`/nothing otherwise) — both collapse to a childless
`<p>`, which per CSS gets zero line-box height instead of the normal line-height a real text node
gives it. Pages tab's own subtitle always has real text, which is why it never showed the bug.

Fix: same "keep the subtitle line's height, don't add visible copy" approach as Users, applied
per-component:
- `sourcesTab.jsx`: `<p className={p.headerSubtitle} aria-hidden="true">&nbsp;</p>` — always
  reserves the line height, never shows text (user explicitly didn't want new explanatory copy
  added here).
- `activityTab.jsx`: keeps its real dynamic content when available, falls back to a non-breaking
  space (not a decorative label) when there's nothing to show yet: `{rows.length > 0 ? \`last
  change ${timeAgo(rows[0].time)}\` : ' '}`.

Also fixed a real, unrelated bug noticed while re-reading `sourcesTab.jsx`'s data-loading effect:
`getSources(falcor, envs)` had no `.catch()` on its own leg of the `Promise.all`, so a single
failed/unreachable env (e.g. a stale pgEnv with no UDA service running) rejected the whole
`Promise.all` and left the tab stuck on "Loading sources…" forever with `setLoading(false)` never
reached. Added `.catch(() => [])` to match the sibling `apiLoad(...).catch(() => [])` already next
to it.

Verified live in both light and dark mode at 1440px viewport: Pages/Data/Activity title `top` now
all measure `88`, identical to Overview, with no visible placeholder/filler text in the subtitle
line for either tab.

### Done THIS session (2026-09-21, continued) — Page Templates + Format Manager mockups

Created the two mockups these tabs were still missing (`design_system_v6/pages/`):
`admin-pattern-templates.html` and `admin-pattern-format.html`. Both follow the established
header shape exactly (`headerTitleWrap` + boxed `statsBar`, `max-w-content` LayoutGroup
sections, `bg-panel border border-rule rounded-lg` table cards) and preserve every existing
feature of `pageTemplateManagerPane.jsx`/`formatManager.jsx` — nothing new invented:

- **Page Templates**: built-in templates (read-only, theme-provided) + user templates
  (delete-only from here, saved from a page's own Settings pane) as two table cards, a
  total/built-in/saved statsBar, mocked with both the plain-row and mid-delete-confirm row
  states visible at once (matching the confirm-inline UX already in the live component).
- **Format Manager**: kept as a raw JSON editor for `additionalSectionAttributes` (not
  redesigned into a friendlier attribute-builder — out of scope for this port pass), themed
  into a panel card with a Save/Cancel row; no statsBar (only one real number, an inline count
  pill next to the title covers it instead, same weight as Overview's `headerTypePill`).
- Verified: JSON/class-string content rendering in ALL CAPS inside a `t-metaSM font-mono`
  textarea is **not a bug** — confirmed against `admin-theme-edit.html`'s own raw-overrides
  textarea, which renders real Tailwind class strings the same way. `_shared.css` uppercases
  `t-meta*` globally; that's this design system's established label/secondary-text convention,
  already shipped on the Theme tab.
- Not yet implemented in code — `pageTemplateManagerPane.jsx`/`.theme.js` and
  `formatManager.jsx` still have the pre-v6 look; implementing them is the next actionable step
  if asked.

### Done THIS session (2026-09-21, continued) — Page Templates tab implemented

Ported `pageTemplateManagerPane.jsx` + `.theme.js` to the `admin-pattern-templates.html` mockup
(both files fully rewritten, not incrementally patched):

- Added the header strip every other tab has (`h1` "Page Templates" + a total/built-in/saved
  `statsBar`, counts computed live from `themeTemplates.length`/`templates.length`) — reused the
  exact `header`/`headerTitleWrap`/`headerTitleRow`/`headerTitle`/`statsBar`/`statCell`/
  `statValue`/`statLabel` class strings from `pagesEditorTheme` (copied, not imported — this file
  has its own local section/table keys the others don't share) so the title lands at the
  identical left edge and vertical offset as Pages/Data/Activity — **verified live**
  (`getBoundingClientRect`): `top: 88` on Pages, Data, Activity, and this tab alike.
- **Per explicit user direction, did NOT carry over the mockup's subtitle copy** ("starting
  points for new pages — built-in, plus any your authors have saved") or its two section-header
  hint spans ("— from the active theme, can't be deleted here" / "— saved from a page's Settings
  pane") — same "no decorative explanatory copy" rule as
  `[[project_admin_pattern_v6_port]]`'s Data/Activity fix. Subtitle line is an `aria-hidden`
  `&nbsp;` spacer (reserves the line-box height so `items-center` doesn't re-center the title
  against the taller statsBar — the same latent bug class fixed on Users/Data/Activity earlier
  this session).
- Removed the tab's own `wrapper: 'p-6'` (the not-yet-fixed double-padding bug this file's
  previous "Not started" note flagged) — now `flex flex-col gap-5`, no padding of its own, relies
  entirely on `patternEditor.theme.js`'s `content` gutter like every other tab.
- **Zero business-logic changes**: both `Table`s (built-in read-only, user delete-with-inline-
  confirm), `loadTemplates`/`del`, and both column arrays are untouched from the pre-v6
  implementation — only the wrapping JSX/theme changed dir. Confirmed via diff review.
- Verified live on `shaun-test-app` (temporary `admin`-pattern fixture, linked then unlinked per
  the testing convention below) in both light and dark at 1440px: header/stats/table cards render
  correctly, zero console errors, title `top` matches Pages/Data/Activity exactly.

### Done THIS session (2026-09-21, continued) — Format Manager mockup redesigned into an attribute builder

The first-pass `admin-pattern-format.html` mockup (and this file's own earlier note) explicitly
kept `additionalSectionAttributes` as a themed raw-JSON textarea, "not redesigned into a friendlier
attribute-builder — out of scope for this port pass." Per explicit user direction ("format is
saves and reads data in... can't be just a blob... take inspiration from the overview page mockup
that includes it"), redesigned it as a real attribute-builder, second full pass on the same file:

- **Data model unchanged**: `additionalSectionAttributes` is still exactly an array of
  `dms-format` attribute descriptors — the same `{key, type, display_name, required, default,
  options?, format?}` shape `page.format.js`'s own `cmsSection.attributes` array uses (confirmed
  by reading it: e.g. `{key:'level', type:'select', options:[{value,label}...]}`,
  `{key:'authPermissions', type:'json', default:[]}`). This pass only changes how an author edits
  that array — one row per attribute instead of one opaque textarea.
- **Took the shape from `admin-pattern-overview.html`'s own "section attributes" card** (still
  present there as a stub/entry-point pointing here — not removed) per explicit direction: header
  row + hint + a "raw json" escape-hatch toggle + an empty-state with example attribute names
  (`hazard`, `county_geoid`) + an "add attribute" button. Built that out into the full tab.
- **New structure**: a `bg-panel border rounded-lg divide-y` list, one row per attribute — a type
  pill (mono, neutral `bg-well` except `select` gets a cobalt accent), `key` (mono) + `display_name`
  + a `required` pill when set, a one-line hint, and Pencil/Trash icon buttons (same convention as
  `Permissions.theme.js`'s `removeBtn`/Page Templates' delete). Clicking edit expands an inline form
  directly below that row (same "raise a form inline under the row" pattern already used elsewhere
  in this port, e.g. Pages tab's sections panel) with key/display-name/type/required fields, plus a
  **type-conditional options sub-editor** (label/value pairs, add/remove) shown only when
  `type: 'select'` — mocked with the `hazard` row expanded (3 options) to show that state alongside
  two collapsed rows (`county_geoid`, `reviewedBy`), matching Page Templates' "show both interaction
  states in one mock" convention.
- **Raw JSON kept, not dropped**: a "raw json" button in the header toggles the whole content area
  to the original themed textarea (hidden `section[data-dms-section="format-raw"]` in the mock) —
  the full-fidelity save path stays available for attribute shapes the builder doesn't model yet
  (e.g. a `dms-format`-type join attribute, which has no first-class row treatment in this pass —
  only text/number/switch/select/json/lexical are covered by the `type` dropdown).
- Verified via local render (`file://` + a scratch Playwright screenshot, not the live app — no
  React code changed this pass) in both light and dark: list, expanded options editor, and
  add-attribute button all render cleanly at 1440px.
- **Not yet implemented in code** — `formatManager.jsx`/no `.theme.js` sibling yet exist for this;
  still the pre-v6 raw-`<textarea>` `MenuItemsEditor`. Implementing the row list + inline editor +
  options sub-editor + raw-json toggle is real, non-trivial state-machine work (not a retheme like
  Page Templates was) — next actionable step if asked.

### Done THIS session (2026-09-21, continued) — Format Manager attribute-builder implemented

`formatManager.jsx` rewritten (new sibling `formatManager.theme.js`, previously none existed) to
match the redesigned mockup — the pre-v6 `MenuItemsEditor` raw-`<textarea>` is gone, replaced with
the real per-attribute row list + inline expand-to-edit form + type-conditional options sub-editor
described above:

- **Data model verified unchanged**: `additionalSectionAttributes` round-trips as the exact same
  `dms-format` attribute-descriptor shape `page.format.js`'s own `cmsSection.attributes` uses —
  confirmed live via `dms raw get` after a real save through the new UI:
  `{"key":"hazard","display_name":"Hazard Type","type":"select","required":false,"options":
  [{"label":"Flood","value":"flood"}]}`. Field edits are applied as partial merges onto each
  attribute object (`{...a, [field]: val}`), not object reconstruction, so any advanced keys a row
  already carries from the raw-JSON era (`default`, `format`, etc.) survive untouched even though
  the builder has no UI field for them yet.
- **State model**: `attributes` is a local working copy (same "local draft until Save" shape
  Overview already uses) plus `editingIndex`/`editSnapshot`/`isNewRow` for the single row currently
  expanded. Only one row can be in edit mode at a time — every other row's edit/delete buttons
  disable (`locked` prop) while one is open, both because the mockup only ever shows one row
  expanded and to sidestep index-shift bugs from deleting/adding while a different row's edit
  session is live. "cancel" restores the pre-edit snapshot (or removes the row entirely if it was
  a freshly-added one never given a key); "done" just closes the form (fields already write
  straight into `attributes` as you type, so there's no separate commit step).
- **Options sub-editor** (`type: 'select'` only): array of `{label, value}`, add/remove, merged the
  same partial-update way.
- **Raw JSON kept as the mockup's escape hatch**: a "raw json" header button swaps the whole content
  area to a themed textarea seeded from the current `attributes` (pretty-printed); "apply" parses and
  replaces `attributes` (invalid JSON shows an inline error, stays in raw view); "cancel" discards
  and returns to the row list. Confirmed round-trips correctly (builder → raw → builder, values
  preserved, keys upper-cased only because `_shared.css` uppercases `t-meta*` display text, not the
  actual JSON — same non-bug precedent noted for the Page Templates/Theme tabs' raw-JSON displays).
- **Save/Reset**: adopted Overview's own sticky dirty-state bar convention verbatim (copied classes,
  not shared — `saveBar`/`saveBarDirty`/`btnReset`/`btnSave` from `settings.theme.js`) rather than the
  mockup's card-level save row, since this tab has the exact same "everything below is a local draft
  until Save" shape Overview does. Save additionally disables when any attribute has an empty `key`
  (`hasInvalidKey` guard) — new, not in the original component, prevents writing a blank-keyed
  attribute descriptor.
- **Verified live end-to-end** on `shaun-test-app` (temp admin-pattern fixture, linked then unlinked
  per convention): added a `select`-type `hazard` attribute with one option through the builder,
  saved, reloaded the page and confirmed it persisted with the correct shape (`dms raw get`); the
  save bar itself doesn't clear to "no unsaved changes" until a reload — pre-existing behavior of
  `apiUpdate`/`EditWrapper` not refreshing the `value` prop in place, unchanged from the original
  component, not a regression from this pass. Delete-confirm inline row (yes/no) and both light/dark
  mode also confirmed, zero console errors throughout. Cleared the test attribute and unlinked the
  fixture afterward.

### Done THIS session (2026-09-22) — ThemeToggle relocated, then "view site" removed entirely

User asked to move the `ThemeToggle` off the sidenav's `bottomMenu` (where it sat next to
`UserMenu` via `Layout.theme.jsx`'s global default) onto "where view site is," then in a fast
follow-up asked to (a) remove "view site" entirely (not just relocate it) and (b) fix
Users/Profile/Groups, which still had the old ThemeToggle+UserMenu sidebar pairing with no toggle
anywhere else — a separate pattern config (`patterns/auth/siteConfig.jsx`'s `AdminLayout`) the
first pass never touched.

- `patterns/admin/siteConfig.jsx` (`adminConfig`) and `patternConfig` — both now override
  `theme.layout.options.sideNav.bottomMenu` to `[{type:"UserMenu"}]` (mirrors the existing
  `theme.logo` mutation precedent in the same function), dropping `ThemeToggle` from the sidebar.
- `patterns/auth/siteConfig.jsx` (`manageAuthConfig`) — same `bottomMenu` override added, so
  Users/Profile/Groups match.
- `ThemeToggle` moved into each pattern's own top breadcrumb bar instead: `AdminBreadcrumb`
  (`patterns/admin/siteConfig.jsx`), `Breadcrumbs` (`patternEditor/index.jsx`), and `AdminLayout`
  (`patterns/auth/siteConfig.jsx`) all render it inside a new `breadcrumbActions` wrapper (flex +
  gap, mirrored across `siteConfig.theme.js`/`patternEditor.theme.js`/`defaultTheme.js`'s
  `authPages.manage`).
- "View site" removed completely per follow-up direction — the `<Link to='/'>` + its `ArrowUpRight`
  icon and the `breadcrumbViewSite` theme key are gone from both admin breadcrumbs (auth's
  `AdminLayout` never had one). Dead `Icon`/`Link` imports/destructures cleaned up where they became
  unused.
- **Then, per explicit follow-up ("use themecontext to get the component")**: `ThemeToggle` was
  being imported directly (`import ThemeToggle from '.../ui/components/ThemeToggle'`) in all three
  consumers — against the codebase's own "always access UI components through `ThemeContext`,
  never via direct imports" convention. Registered `ThemeToggle` on the shared `UI` object
  (`ui/index.js`) and switched all three call sites to `const { ThemeToggle } = useContext(ThemeContext).UI`
  instead (widget-registry's own direct import in `ui/widgets/index.jsx` is unrelated and untouched
  — that's resolving a `{type:"ThemeToggle"}` config entry, not rendering the component inline).
- Verified live at every step (temp admin-pattern fixture, create+link+unlink+delete cycle) on
  Sites, Pattern Editor tabs, Users, Profile, Groups: exactly one toggle button per page, zero
  "view site" text nodes, dark-mode toggling persists across navigation, zero new console errors.

### Done THIS session (2026-09-22, continued) — 7 pages made full width, root-caused a previously-deferred bug

User asked for Overview/Sites/Themes-list/Theme-edit/Profile/Users/Groups to render full width.
These were capped by `LayoutGroup.theme.jsx`'s `adminContent` style's `max-w-[1200px]` — which the
2026-09-21 padding-fix session (see above) had deliberately kept as "cheap insurance" against a
real, unfixed overflow bug rather than chasing the root cause. This session chased it:

- **Root cause**: `ui/components/Layout.jsx`'s `wrapper3` (`flex flex-1 items-start`) has `SideNav`
  and `childWrapper` as its two flex-row children; `childWrapper` had no `min-w-0`. A flex item's
  default `min-width` is `auto` — it won't shrink below its content's intrinsic width, so a wide
  descendant (Sites' patterns `Table`, once it was allowed to ask for 100% width) pushed
  `childWrapper`, and the whole `Layout`, past the viewport instead of fitting inside it. That's
  the "~66px" the deferred-bug memory tracked — not a fixed offset, it scaled with whatever content
  wanted to be that wide.
- **Fix**: added `min-w-0` to `childWrapper` in `ui/components/Layout.theme.jsx`'s default style.
  With the real constraint fixed at the source, removed the `max-w-[1200px]` safety cap from
  `adminContent` entirely (`ui/components/LayoutGroup.theme.jsx`). Also dropped a second,
  independent `max-w-7xl` cap that Sites (`path:""`) and Themes-list (`path:"themes"`) had at their
  own `SectionGroup` level (`patterns/admin/siteConfig.jsx`) — added `maxWidth="w-full"`, matching
  Theme-edit's pre-existing override.
- **Verified live**: no horizontal overflow (`document.documentElement.scrollWidth` vs
  `clientWidth`) on any of the 7 pages at 1440px, populated with real linked patterns (not the
  empty-table case the original bug report used). Also spot-checked a regular non-admin site page
  (`/content`, same global default `Layout` style) — no regression, `min-w-0` only removes an
  artificial floor on shrinking, never forces anything narrower than before.
- Memory `project_layout_childwrapper_width_overflow.md` updated to FIXED with the full trace —
  read that file if this class of overflow resurfaces anywhere else under `Layout`.

## State as of 2026-09-22 (later): shared content width cap

The user reversed the full-width pass: every admin page should use the Pattern Editor Overview's
content cap, `max-w-5xl` (1024px, left-aligned).
- **Sites and Themes list:** `SectionGroup maxWidth` changed from `w-full` to `max-w-5xl`
  (`patterns/admin/siteConfig.jsx`).
- **Every Pattern Editor tab:** a new `contentInner` key (`patternEditor.theme.js`) wraps
  `PageComp` in `patternEditor/index.jsx`.
- **Users/Groups/Profile:** a new `manage.contentWrapper` key (`patterns/auth/defaultTheme.js`)
  wraps `AdminLayout`'s children.
- **Breadcrumb bars stay full width.**
- **Not capped:** ThemeEdit and Create, which the user didn't list.

Verified live on shaun-test-app at 1600px on all 13 pages (Sites, Themes, Users, Groups, Profile,
plus the 8 Pattern Editor tabs). The cap is 1024px wide at x=272 on every page, with no overflow and
no page errors.

## Not started / next steps

1. **MNY admin reskin** — **now planned as its own task: [`admin-theme-per-project.md`](./admin-theme-per-project.md)** (scope decided 2026-09-22: logo only — the auth pattern's theme's `admin.logo` overrides the default for admin + manage pages; colors/fonts stay default). Original note: MNY's own admin surface (`mny_admin`
   theme) still hasn't had its own pass; everything done so far is the shared tessera-default look
   only. Confirmed earlier (`tessera-component-theme-port.md`) that `mny_admin`'s auth-page theming
   is correct via its `{...mny, ...theme, Icons}` shallow-spread inheritance, so MNY's login/signup
   pages are fine — this is specifically about the Sites/Themes/Pattern-Editor admin surface, which
   MNY doesn't override at all today (always renders the shared tessera default, same as every other
   project, by design). Scope this out at the start of that session: which pages/components get an
   MNY-specific look, whether there's an existing MNY mockup or design reference to work from, and
   whether it's a full parallel `mny_admin`-namespaced theme pass or a targeted set of overrides.
2. **Create-site flow** — still not designed (`patterns/admin/pages/createSite.jsx`), per the original
   admin-port blocker list. Still on the default (un-fixed) `SectionGroup` card/padding at its
   `create` route in `siteConfig.jsx` — same padding-stacking bug pattern, not yet touched.
3. Per the standing insulation-pass lesson (`[[feedback_no_concurrent_git_stash_parallel_agents]]`'s
   sibling risk, not the stash issue itself): whenever any of the above lands, check whether any
   project's own admin.theme.js-equivalent silently relies on a key this pass changed. Not checked yet
   for this session's `SideNav.theme.jsx` `'admin'` style or `Permissions.theme.js` — low risk since
   both are net-new keys/styles, not edits to pre-existing shared defaults, but worth a quick sanity
   pass before calling the admin port "done."

## To resume in a future session

Say: **"Continue the admin pattern v6 port — see
`src/dms/planning/tasks/current/admin-pattern-v6-port.md`."** The shared tessera-default admin
surface is now fully ported (all 7 mockup-covered tabs, the ThemeToggle/breadcrumb chrome cleanup,
and the full-width pass are all done) — **next session should pick up item 1, the MNY admin
reskin**, before Create-site.

## State as of 2026-09-23: Pages tab carets + table borders

- `treeNode.jsx` / `sectionsChip.jsx`: carets `▶`/`▼` → `▸`/`▾`. `▶` (U+25B6) renders as an orange color emoji on some platforms, which was the "orange bg" on the expand-page / expand-sections icons. Sections chip hover moved off amber to `--t-rule-strong` / `--t-well`.
- `table.theme.jsx` `below-row` style (used only by the Pages tab): `cell` is horizontal rules only, `border-y-[0.5px]` (stacked rows meet at a 1px seam; was 1px all sides = 2px seams + vertical rules).
- Verified live on shaun-test-app pattern 1 (temp child page + section created and deleted afterward).
- Same treatment extended to the other admin tables: `roomy` style (Sites list, tenants, Users, Groups; used only by admin pages) and a new `rules` style (default density, horizontal rules only) for the Themes list. Verified all 5 tables live: 0 side borders, no errors.
