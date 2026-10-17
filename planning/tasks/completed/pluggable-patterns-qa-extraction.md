# Move the `qa` pattern ("Tickets") out of the library into dms-template

**Initiatives:** [tes_licensing_open_core](../../../../../planning/initiatives/tes_licensing_open_core.md) (primary), [dms_qa_ticketing](../../../../../planning/initiatives/dms_qa_ticketing.md) · **Status:** done · **Created by:** rdubowsky@albany.edu · **Edited by:** amuro@albany.edu

**Project:** DMS library (+ dms-template, the pattern's new home) · **Topic:** patterns · **Built:** 2026-10-14

**▶ Start here.** Built, verified and committed (2026-10-14). QA lives in dms-template `src/patterns/qa/`, and
the library, CLI and dms-server hold no QA code.
- The data side is done in the prod DB:
  - the old installs are deleted
  - MitigateNY has a fresh install, **2860547** `QA` (`/qa`), with coverage, grants and theme set
- **Deployed (owner, 2026-10-16):** dms-server and the MNY client are deployed, and Tickets 1.0 is in use by
  internal staff. The steps stay in [Deploy](#deploy-for-whoever-deploys-mny).

## Objective

Move the `qa` pattern type, and every piece of QA code the library held, into `dms-template/src/patterns/qa/`.
It registers through the pattern-type registry exactly as the map editor does
([`pluggable-patterns-mapeditor-extraction.md`](../current/pluggable-patterns-mapeditor-extraction.md)), and no
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
| `admin.addable` (existing), `true` for QA (was `QA_PATTERN_ENABLED` until 2026-10-15; see the follow-up below) | the type select, the Add Pattern picker | three `VITE_DMS_QA_PATTERN` filters |
| `onPagePublish({ page, pattern, sitePatterns, type, app, baseUrl, apiLoad, apiUpdate })`, not awaited, a failure logged | `page/pages/edit/editFunctions.jsx` `publish`; `pagesPane.jsx` passes the context from CMSContext, which now carries `pattern` | `qaPatterns` (site factory) and `CMSContext.qaTracking` |
| The CLI's page-publish hook: `.dmsrc` `pagePublishHook` / `DMS_PAGE_PUBLISH_HOOK`, a module whose default export gets `{ falcor, config, pattern, page, helpers }` and returns output keys | `cli/src/commands/page.js` `runPublishHook` | the CLI's import of `qa/tracking.js` |
| The no-access pattern stub carries the row's **`public`** settings, any type | `dms-server/src/routes/dms/dms.route.js` | the server's `qaIntake` |
| 19 named exports on the library entry (`registerWidget`, `PageView`, `AdminContext`, six base themes, …; list in `pattern-registry.md`) | QA's imports | deep relative imports |

Dropped to keep contact points down: a `SettingsPanel` hook (QA's datasets card now shows on Configure only,
not on the Overview) and a `widgets` slot (QA calls the exported `registerWidget` itself).

### QA in dms-template (`src/patterns/qa/`)

- `index.js`, the definition:
  - `addable: true` (was `QA_PATTERN_ENABLED` until 2026-10-15), `order: 50`, `duplicable: false`
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

## Follow-up 2026-10-15: `VITE_DMS_QA_PATTERN` removed (owner)

Owner (amuro@albany.edu, 2026-10-15): "this functionality should entirely by handled by pattern
registration and shouldn't have an env variable to check."

- `src/patterns/qa/index.js`: `admin.addable: true`. `install.js` no longer exports
  `QA_PATTERN_ENABLED`.
- `.env.example` drops the block; `src/dms/documentation/pattern-registry.md` describes `addable: true`.
- **Effect:** every app dms-template builds registers `qa` (`src/patterns/index.js`), so every site's
  Add Pattern picker and pattern Type select now offer **Tickets** to admins. An app that shouldn't
  offer it doesn't register the pattern (per-app pattern selection is still deferred).
- Existing installs were never gated, so 2860547 is unaffected.
- **Not committed.** It ships with the MNY client deploy below, and needs no env var.
- Verified: ESLint on the two files and a production `vite build` (see the test notes in this section).

## Deploy (for whoever deploys MNY)

### Env vars

Every variable below is in `.env.example` with a comment. **dms-server needs no new variable.** The stub's
`public` settings come with the new server code alone. `DMS_EXTRA_DATATYPES` and `DMS_PAGE_DELETE_HOOK` are
unchanged and set by `Dockerfile`.

| Variable | Read by | Needed for the deploy? | Value |
|---|---|---|---|
| ~~`VITE_DMS_QA_PATTERN`~~ | **Removed 2026-10-15** (owner). Registration alone offers Tickets; see the follow-up below. | — | — |
| `DMS_PAGE_PUBLISH_HOOK` | the `dms` CLI only (shell env, or `.dmsrc` `pagePublishHook`); not Vite, not dms-server | **No.** It's for anyone running `dms page publish` on a site with an install | `src/patterns/qa/cli/onPagePublish.js` (relative to the cwd) |

### Steps

1. **dms-server:** deploy the committed `src/dms`. No config change. Afterwards it sends a pattern row's
   `public` settings on no-access stubs, which is what lets users not granted on the install file reports.
2. **Client, devmny:**
   - The root `.env` needs the MNY block: `VITE_DMS_APP=mitigat-ny-prod`, `VITE_DMS_TYPE=prod`,
     `VITE_DMS_PG_ENVS=hazmit_dama`. (No `VITE_DMS_QA_PATTERN` any more: removed 2026-10-15.)
   - Then `npm run build`, then `npm run deploy-devmny`.
3. **Client, prod:** `npm run deploy-mnyprod`. It runs its own build with `VITE_DMS_PRELOAD_THEMES=mnyv1,mny_admin`
   from the same `.env`.
4. **No data step.** Install 2860547 and its settings are already in the prod DB ([State](#state-after-the-build-2026-10-14)).
5. **Checks on devmny.org:**
   - `/qa`, signed in as a ticket handler (`AVAIL` or `mitigat-ny-prod Admin`):
     - a top nav: Logo, Overview, Tickets, user menu
     - the bands fill the white card, as on `/actions/dashboard`
     - "4 sites covered"
   - A covered page (e.g. `/actions/dashboard`), signed in as a user **not** granted on the install:
     - Report an issue shows in the nav
     - file a test report; it appears under `/qa` → Tickets
     - delete it
   - Until this deploy, devmny.org runs the old client against the same DB, so QA there may look broken. The
     owner accepted that (2026-10-14).

## State after the build (2026-10-14)

- **Every write below went through the dms CLI against the local dms-server, which uses the prod DB, with a
  backup first.** The delete procedure, in order:
  1. delete the 5 sources; the server cascade removes their views, split tables and dmsEnv refs
  2. remove the pattern from the site row's `patterns`
  3. delete the pattern row
- **`qa_test`:**
  - Old installs 126 `QA`, 170 `QA2` and 219 `QA switches` are deleted: sources 127–135, 171–179 and
    220–228, then the site row 1 links, then the rows.
  - Backup: `scratchpad/qa_test/old_installs_backup_2026-10-14/`.
  - Its only install is **251 `QA move check`** (`/qa_move_check`), made through Add Pattern; no coverage yet.
- **MitigateNY:**
  - **The old 2824062 is deleted:**
    - sources 2824063/65/67/69/71, after which env 1676363 went from 64 to 59 entries, losing only those 5
    - the site row 566430 link (82 → 81 patterns)
    - the row
    - Backup: `scratchpad/mitigat-ny-prod-prod/old_qa_install_backup_2026-10-14/`, which holds the backups
      for the 2860547 fixes below too.
  - **The new install 2860547 `QA`, `/qa`,** made by the owner through Add Pattern (local client, prod DB):
    - **What Add Pattern created:** `afterCreate` made its 5 datasets in env 1676363 (MNY's datasets env,
      `/cenrep`) and switched change history on. `public.qaIntake` is written.
    - **Coverage** (set by the owner on Configure; the old install's set):

      | Pattern | Short key | Label |
      |---|---|---|
      | 566466 (a *page* pattern named "admin" at `/admin`, not the admin type) | `admin` | admin |
      | 2265530 | `mitigateny_actions` | MitigateNY_actions |
      | 985070 | `mitigateny_2025` | MitigateNY_2025 |
      | 1300890 | `mitigateny_county_template` | MitigateNY_County_Template_V3 |

    - **Grants:** `mitigat-ny-prod Admin` and **`AVAIL`**, both `*`.
      - `AVAIL` was added by CLI. The install grants only `<app> Admin`, and MNY's site grants are user 1,
        `AVAIL` and `DHSES`, so the creator was locked out.
      - This is the queued "Install lockout fix" in [`qa-pattern-type.md`](../current/qa-pattern-type.md) §3.
    - **Switches:** page inventory on (owner, 2026-10-14). 282 pages tracked; the site cards collapse and open to
      their pages. Without it, a site card is only its name and tickets bar, as specced.
    - **Theme:** `mnyv1`, with a **top-nav layout override**: Logo on the left, the install's pages
      (Overview, Tickets) as the menu, the user menu on the right, and no side nav.
      - The Theme tab's Save had written a side-nav layout. It was replaced by CLI to match the old install
        and the actions dashboard.
  - **The look (code):** `src/themes/mny/qa.theme.js` `styles` overrides QA's centred column, so the bands
    fill MNY's content card like the actions dashboard (titles and cards start 32px in).
    - The overridden widths: `BAND_INNER`'s 1200px, the site card's 988px, and the section grid's `centered`
      1020px.
    - QA's defaults are unchanged for other sites.

## Known issues (not from this move)

- **A direct load of a Pattern Editor URL can render blank** (e.g. `/list/manage_pattern/251/configure`): the
  admin nav loses Sites/Themes and the editor shows nothing. Moving to another page and back fixes it.
  - Cause: defect 2 of
    [`route-auth-check-judges-placeholder-user.md`](../current/route-auth-check-judges-placeholder-user.md), where the
    admin case is logged. `EditWrapper` caches the route without `user`.
- **The Theme tab's Save writes a full layout override.** On 2860547 it wrote a side-nav layout. After picking
  a theme for a new install, check the layout.
- **New installs grant only `<app> Admin`.** That's the lockout above.
- **Local only:**
  - After switching `.env` to another app, sign out and back in. `localStorage.userToken` keeps the old app's
    project (JWT `project`), and the server judges groups by it: rows come back as no-access stubs while the
    UI shows the new app's groups. See `skills/traversing-dms-pages.md`.
  - The local dms-server has no `hazmit_dama` DB config, so MNY pages log `Array(3)` exceptions in the browser
    (`Config "hazmit_dama" is missing…` in `scratchpad/npmrds-sub/dms-server.log`). Not QA.
- **Optional QA follow-up:** with every pre-switch install gone, `features.js`'s `LEGACY_FEATURES` fallback can go.

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
- 2026-10-14 · Data cleanup and MNY reinstall, all with backups:
  - The owner had all old installs deleted by CLI (`qa_test`'s three, then MNY's 2824062).
  - The owner made 2860547 through Add Pattern.
  - The lockout recurred; `AVAIL` was added by CLI.
  - The Theme tab's side-nav layout was replaced by a top-nav one.
  - MNY's QA bands were widened to the content card (`src/themes/mny/qa.theme.js`).
  - The env vars are documented in `.env.example` and the Deploy section.
