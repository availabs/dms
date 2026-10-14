# Move the `qa` pattern ("Tickets") out of the library into dms-template

**Initiatives:** [tes_licensing_open_core](../../../../../planning/initiatives/tes_licensing_open_core.md) (primary), [dms_qa_ticketing](../../../../../planning/initiatives/dms_qa_ticketing.md) · **Status:** built · **Release:** commit — library submodule + dms-template together; deploy dms-server + client together · **Created by:** rdubowsky@albany.edu · **Edited by:** —

**Project:** DMS library (+ dms-template, the pattern's new home) · **Topic:** patterns · **Built:** 2026-10-14

**▶ Start here.** Built and verified 2026-10-14. QA lives in dms-template `src/patterns/qa/`, and the library,
the CLI and dms-server hold no QA code. **Left, all for later (owner, 2026-10-14):**
- Delete the four old installs (see [Left](#left)).
- The owner's commit: the library submodule and dms-template **together**.
- The MNY deploy: dms-server and the client **together**, since the server now sends `public` and the client
  reads it.

## Objective

Move the `qa` pattern type, and every piece of QA code the library held, into `dms-template/src/patterns/qa/`.
It registers through the pattern-type registry exactly as the map editor does
([`pluggable-patterns-mapeditor-extraction.md`](./pluggable-patterns-mapeditor-extraction.md)), and no
`pattern_type === 'qa'` branch is left in admin, the page pattern, the site factory, the CLI or the server.

- **Owner direction (2026-10-14).** The map-editor doc had listed `qa` among the core patterns that stay
  in the library. Moving it out matches the `tes_licensing_open_core` outcome line, which licenses the
  "core library and four platform patterns" (page, datasets, admin, auth).
- **Owner (2026-10-14):** keep the new DMS contact points to a minimum; more code inside QA is fine.
- **Owner (2026-10-14):** none of the existing QA data is real, so the four existing installs may break
  and can be deleted.

## What was built

### New generic hooks (documented in [`pattern-registry.md`](../../../documentation/pattern-registry.md) and [`registering-a-pattern-type.md`](../../../skills/registering-a-pattern-type.md) §5b)

| Hook | What reads it | Replaced |
|---|---|---|
| `admin.beforeCreate({ falcor, app, instance, row, siblings }) → { problem } \| { row }` | `editSite.jsx` and the generic `patterns` field editor `components/patternList.jsx` | `qaPreflight` + `data.qa = newInstallQa()` |
| `admin.afterCreate({ falcor, app, siteId, siteInstance, patternId, instance, row, siblings })`, run after the site row's save | `editSite.jsx`. `patternList.jsx` can't: it doesn't know the site row's id, and "finish set-up" covers that | `installQa(…)` |
| `admin.duplicable: false` | `patternList.jsx`, and `patternActions(user, app, site, row, typeAdmin)` (callers pass the type's `admin`, so `utils/adminPermissions.js` stays import-free) | the `isQa` checks |
| `admin.editorTabs: [{ name, path, icon, component }]` | `patternEditor/index.jsx` (tabs), `admin/siteConfig.jsx` (menu) | `qaConfigureTab` and its menu entry |
| `admin.addable` (existing), set to `QA_PATTERN_ENABLED` by QA | the type select, the Add Pattern picker | three `VITE_DMS_QA_PATTERN` filters |
| `onPagePublish({ page, pattern, sitePatterns, type, app, baseUrl, apiLoad, apiUpdate })`, not awaited, a failure logged | `page/pages/edit/editFunctions.jsx` `publish`; `pagesPane.jsx` passes the context from CMSContext, which now carries `pattern` | `qaPatterns` (site factory) and `CMSContext.qaTracking` |
| The CLI's page-publish hook: `.dmsrc` `pagePublishHook` / `DMS_PAGE_PUBLISH_HOOK`, a module whose default export gets `{ falcor, config, pattern, page, helpers }` and returns output keys | `cli/src/commands/page.js` `runPublishHook` | the CLI's import of `qa/tracking.js` |
| The no-access pattern stub carries the row's **`public`** settings, any type | `dms-server/src/routes/dms/dms.route.js` | the server's `qaIntake` |
| 19 named exports on the library entry (`registerWidget`, `PageView`, `AdminContext`, six base themes, …; list in `pattern-registry.md`) | QA's imports | deep relative imports |

Dropped to keep contact points down: a `SettingsPanel` hook (QA's datasets card now shows on Configure only,
not on the Overview) and a `widgets` slot (QA calls the exported `registerWidget` itself).

### QA in dms-template (`src/patterns/qa/`)

- `index.js`, the definition:
  - `addable: QA_PATTERN_ENABLED`, `order: 50`, `duplicable: false`
  - `beforeCreate: qaBeforeCreate` and `afterCreate: qaAfterCreate` (`install.js`)
  - `editorTabs`: the lazy `qa/ConfigureTab`
  - `onPagePublish: trackOnPublish` (`publish.js`)
  - `defaultTheme` (at `theme.qa`)
- Registered with the map editor in `src/patterns/index.js`, which both entries import.
- `tracking.js` gains `pageTracking({ sitePatterns, pattern, type })`. The publish hook and the Report an
  issue widget share it (it replaced `CMSContext.qaTracking`). `cli/onPagePublish.js` is the CLI hook (plain
  Node ESM; it imports only `tracking.js`).
- `intake.js`:
  - `qaIntake(data)` is the server's old logic, unchanged.
  - `publicSettings(data)` rebuilds `public.qaIntake`.
  - `installQa` and Configure's Save write it (the Save rebuilds it at the write, so it never shows as an
    edit), and `reportIssue/report.js` reads it for ungranted users.
- `admin/configureTab.jsx`, `admin/configureTab.theme.js`, `admin/patternSettings.jsx`: QA's admin panels,
  moved out of the admin pattern.
- **Theme keys:**
  - The widget moved `qaReportIssue` → **`qa.reportIssue`**. QA's `defaultTheme` carries it, and the MNY
    theme moved its block.
  - The Configure tab keeps **`admin.qaConfigure`** as its override key, because admin pages take only a
    site theme's `admin` key (`useTheme.js` `getAdminTheme`). Its default now lives in QA, spread under it.
  - Nothing stored overrides either key.
- `tests/`: the QA suite (`npx vitest run src/patterns/qa`).

**Path map (for the archive and older docs):**

| Old (library) | New |
|---|---|
| `packages/dms/src/patterns/qa/` | dms-template `src/patterns/qa/` |
| `patterns/admin/pages/patternEditor/qa/configureTab.jsx` | `src/patterns/qa/admin/configureTab.jsx` |
| `QaPatternSettings` in `patternEditor/default/settings.jsx` | `src/patterns/qa/admin/patternSettings.jsx` |
| `packages/dms/tests/qa*.test.js` + `fixtures/sitemgmtAttributes.json` | `src/patterns/qa/tests/` |

## Verification (2026-10-14)

- **Baselines first** (Phase 0, before any change):
  - library vitest: 962 pass, 5 known reds (`avlGraphThemeDefaults`, 2 in `syncDeltaConvergence`, 2 in
    `userMenus`), none in QA code
  - QA-related tests: 284/284
  - a theme/registry snapshot
  - client and SSR builds
  - A stale root `node_modules` (installed 2026-07-29, missing `maplibre-gl`, `use-immer`, `uuid`,
    `@turf/bbox` and `colorbrewer`) failed both builds. The owner's root `npm install` fixed that.
- **After:**
  - QA suite 236/236; app suite (`src/patterns` + `src/themes`) 731/731; library 733 pass with only the 5
    baseline reds; server `test-pattern-stub.js` 28/28.
  - New tests: the `onPagePublish` registry test, `duplicable` on a fake type, `qaBeforeCreate`,
    `pageTracking`, `intake.js`, and the server's generic `public` stub.
  - Snapshot diff is only the intended one: `qa` gains its hooks, `+theme.qa.reportIssue`,
    `−theme.admin.qaConfigure`, and `−admin.settingsEditor.{cardFooter, qaError, qaLink}`, which moved into
    QA's theme.
  - Builds pass. The main `index` chunk grew by 417 bytes (1,835,674 → 1,836,091 B). The Configure tab is
    now its own lazy 30,950 B chunk.
  - **Gates:**
    - No relative import in `src/patterns/qa/` leaves the folder.
    - The library names QA only in labelled example comments. `"QA"` also appears as a stage name in the
      `stage_progress` column type, which is data, not the pattern.
- **Live on the owner's dev Vite (`qa_test`):**
  - `/qa` renders.
  - Report an issue shows on a covered page, and its lazy form opens.
  - QA rows have no Duplicate.
  - Add Pattern lists Tickets.
  - The Pattern Editor shows Configure, which renders its datasets card.
  - **A fresh install through Add Pattern:** "QA move check", row **251**.
    - `beforeCreate` → `qa: { version: 1, features: [] }`.
    - `afterCreate` → 5 datasets, dmsEnv 42 and admin-only permissions.
    - `public.qaIntake` → tickets and covered-sites refs.
    - The site row lists it.
  - **Track-on-publish, both paths, into install 126:**
    - editor Publish → row 267 (absolute URL)
    - `dms page publish` with `DMS_PAGE_PUBLISH_HOOK` → `qa_tracked`, row 264 (mount path)
    - The scratch pages 262 and 263 were deleted.
- **Not done:**
  - an SSR before/after render comparison
  - filing live as an ungranted user (covered in halves: the server's `public` stub test and the client
    intake tests)

## Left

- **Delete the four old installs (later, owner).** Inventory, read-only, 2026-10-14:

  | Schema | Pattern row | dmsEnv | Notes |
  |---|---|---|---|
  | `dms_mitigat_ny_prod` | 2824062 `prod\|qa:pattern` `QA` | 1676363 (MNY's real datasets env) | live MitigateNY site; site row 566430 |
  | `dms_qa_test` | 126 `qa_test\|qa:pattern` `QA` | 42 | the owner's MNY-look loop (`mnyv1`); holds scratch rows 264, 267 |
  | `dms_qa_test` | 170 `qa_test\|qa2:pattern` `QA2` | 42 | |
  | `dms_qa_test` | 219 `qa_test\|qa_switches:pattern` `QA switches` | 42 | |

  - Each install is the pattern row, 5 sources, 5 views and 5 split tables
    (`data_items__s<source>_v<view>_<slug>_<dataset>`), plus its entry in the site row's `patterns`.
  - For 2824062, take only the QA sources off dmsEnv 1676363 and leave the env.
  - Until they're deleted:
    - The old installs have no `public.qaIntake`, so ungranted users can't file into them until their
      next Configure Save or "finish set-up".
    - MNY's four nav `ReportIssue` entries (566466, 985070, 1300890, 2265530) render nothing once
      2824062 is gone, until a new install covers those pages.
- **Commit:** the library submodule and dms-template together. The owner handles git.
- **Deploy (MNY, later):** dms-server and the client together. CLI publishes on a site with an install need
  `DMS_PAGE_PUBLISH_HOOK=src/patterns/qa/cli/onPagePublish.js` (noted in dms-template `CLAUDE.md`).
- **Optional QA follow-up:** once the old installs are gone, `features.js`'s `LEGACY_FEATURES` fallback
  (for installs from before the switches) can go.
- **Known, not from this move:** a direct load of any Pattern Editor URL (e.g.
  `/list/manage_pattern/251/configure`, or AlphaPage's `/5/overview`) can render blank: the admin nav loses
  Sites/Themes and the editor shows nothing. Moving to another page and back fixes it.
  - Cause: defect 2 of
    [`route-auth-check-judges-placeholder-user.md`](./route-auth-check-judges-placeholder-user.md).
    `EditWrapper` caches the route's render without `user`, so admin's shell
    (`admin/siteConfig.jsx:297,324`) keeps the boot-time placeholder user.
  - The admin case is logged there.

## Decisions on record

1. **Server stub → (c), the row's `public` settings** (owner, 2026-10-14; (b) was also fine).
   - Rejected: (a) leave `qaIntake` in dms-server; (b) a `DMS_PATTERN_STUB_HOOK` env-var module like
     `DMS_PAGE_DELETE_HOOK`.
   - (c) keeps the server generic with no host config. Its one cost, backfilling existing installs, went
     away once the owner said they may break.
2. **CLI → (a), a page-publish hook loaded from config** (owner). Rejected: dropping CLI tracking.
3. **Theme keys under `qa` → yes** (owner). Applied to the widget only; the Configure tab stays on
   `admin.qaConfigure` (see What was built).
4. **Timing → move now, before QA step 2b** (owner). Step 2b continues in `src/patterns/qa/`.

## Progress log

- 2026-10-14 · Filed and scoped from the map-editor move's doc and registry. Phase 0 baselines and the
  read-only DB inventory done. The owner answered Q1–Q4, asked to keep DMS contact points minimal, and said
  existing QA data isn't real.
- 2026-10-14 · Built:
  - generic hooks, with QA's admin code moved into the pattern
  - the export surface
  - the server `public` stub and the CLI hook
  - the move into dms-template, with its tests
  - library and doc cleanup
  - automated and live verification

  Status → built.
- 2026-10-14 · Owner: the direct-load blank Configure page is the pre-existing placeholder-user defect,
  logged in its own task. Deleting the old installs and the MNY deploy are deferred. This doc was condensed
  to the built record.
