# `qa` pattern type: ticketing / delivery QA as a library feature

**Initiatives:** [dms_qa_ticketing](../../../../../planning/initiatives/dms_qa_ticketing.md) (primary), [mny_sow_deliverables](../../../../../planning/initiatives/mny_sow_deliverables.md), [tny_control_room_qa](../../../../../planning/initiatives/tny_control_room_qa.md) · **Status:** doing · **Created by:** rdubowsky@albany.edu · **Edited by:** —

The one task doc for the QA pattern: what's built, what's open, and the rules the work follows. Any site adds
ticketing and delivery QA from Add Pattern. MitigateNY is the first real install, and TransportNY's control room is
ported later.

- **History** (everything up to 2026-10-08, verbatim): [`qa-pattern-type-archive.md`](./qa-pattern-type-archive.md).
  It holds this doc's earlier text plus two task docs merged in on 2026-10-08: the design-pass implementation and the
  MNY look / collapsible site cards. Both were built and committed.
- **Research** (2026-09-28/29; shaped the design, may be stale): dms-template
  [`research/qa-ticketing-system/`](../../../../../research/qa-ticketing-system/README.md).
- **MitigateNY contract tasks** (owned by other people; this work feeds them):
  [`mny-sow-ticket-system.md`](../../../../../planning/mitigateny/tasks/current/mny-sow-ticket-system.md),
  [`sow-support-ticket-system-and-office-hours.md`](../../../../../planning/mitigateny/tasks/current/sow-support-ticket-system-and-office-hours.md).
- **Coworker how-to** for placing Report an issue on more MNY sites:
  [`report-an-issue-widget.md`](../../../../../planning/mitigateny/skills/report-an-issue-widget.md).

## ▶ Start here (2026-10-08)

- **All QA code is committed and pushed:** library through `a6d36282`, dms-template through `1cc7561d`.
- **Waiting on deploys:** MitigateNY's rollout (Open work §1) waits on a dms-server deploy and a client deploy. Then
  the owner switches the MNY install's theme.
- **Current loop:** the owner is iterating on MNY's QA look locally. The root `.env` points at `qa_test`, and test
  install 126 `QA` is on `mnyv1`.
- **What's next:** the owner picks from Open work. If MitigateNY's December v1.0 (D5.2) sets the order, the
  critical path is §5: the change-history writer plus MNY's missing fields and statuses. The response-time proof,
  the DHSES dashboard and the quarterly numbers all read from those.

## Glossary

- **Install:** one `qa` pattern row. It has its own URL, users and five datasets: tickets, pages, stories, covered
  sites (`qa_patterns`) and change history. A site can have several installs.
- **Covered site:** a pattern an install covers, set on the install's Configure tab. Its pages are tracked, and its
  pages show Report an issue. Each covered-sites row has a **short key**; a page's key is `<short key>:<slug>`.
- **Tracked page:** a row in the install's pages dataset. It's added when a covered page is first published
  (track-on-publish), or by Configure's backfill when a site is switched on.
- **Ticket record:** the fixed lists in code (`patterns/qa/ticketRecord.js`): status kinds (triage, active,
  waiting, done, canceled), TransportNY's seven default statuses, closed outcomes, page stages. The DB holds only
  each ticket's values.
- **Stub:** what the server sends in place of a pattern row the user can't read (settings stripped). For a `qa`
  row it also carries `qa.intake`, so ungranted users can still file.
- **Report an issue:** the `ReportIssue` nav widget and its form. A theme places it in a nav slot. It shows only to
  signed-in users on covered pages.

## What's built

| Piece | State | Commit |
|---|---|---|
| Skeleton type: Add Pattern card, code-defined pages, no editor | done | `4919d419` |
| Ticket record + install step (5 datasets, resumable) | done | `3392cb9b` |
| Tickets and Ticket pages | done | `3e27b5d2` |
| Overview and Page QA pages | done | `2450f728` |
| Status-change writes, parts 1–3 (per-row live-edit saves, `resolved_date` stamping on live pages, refresh after a pick) | done | `0cdba46b` |
| Derived values (live open counts, a ticket's page name and stage) + track-on-publish (editor and CLI) | done | `8be023e9` |
| Configure tab on `/list/manage_pattern/<id>/configure` | done | `d590c66f`, redesigned `5f853620` |
| Design pass: core enrichments, QA tokens and styles, all four pages restyled | done | `1667bdad`, `e72145df` |
| Opt-in flag: `VITE_DMS_QA_PATTERN=1` shows QA in Add Pattern (existing installs always render) | done | `3945d00b` |
| Report an issue widget + server intake stub | built; MNY deploy pending | `c309c77f` |
| Collapsible section groups (generic) + Overview site cards start collapsed | done | `eec8278c` |
| QA theme as a `qa` key (page/datasets model) + MNY's QA look | built; MNY switch pending | `a6d36282`, `1cc7561d` |

**Where the code is** (library paths under `packages/dms/src/` unless noted):
- `patterns/qa/`:
  - `siteConfig.jsx`: routes; registers the `ReportIssue` widget.
  - `pages/`: `index.js` (`buildQaPages`, `findQaPage`), `view.jsx`, `shell.jsx`, `overview.js`, `tickets.js`,
    `ticket.js`, `pageQa.js`, `helpers.js`.
  - `ticketRecord.js`, `datasets.js`, `install.js` (holds the `QA_PATTERN_ENABLED` flag).
  - `tracking.js` (track-on-publish; no browser imports, so the CLI uses it too) and `configure.js`.
  - `reportIssue/`: `report.js`, `ReportIssue.jsx`, `ReportIssueForm.jsx`, `ReportIssue.theme.js`.
  - Theme: `defaultTheme.js` (registered as `qa` in `ui/defaultTheme.js`), `qa.theme.js`, `withQaTheme.js`.
- Admin: `patterns/admin/pages/patternEditor/qa/configureTab.jsx` (+ `.theme.js`, key `admin.qaConfigure`), and
  `QaPatternSettings` (the datasets card) in `patternEditor/default/settings.jsx`.
- Server: `dms-server/src/routes/dms/dms.route.js`: the `qa` stub's `qaIntake`, and the `dms.sourceIdBySlug` route.
- CLI: `dms page publish` runs track-on-publish.
- Theming: a site overrides QA through its theme's `qa` key, listing only differences (MNY:
  `src/themes/mny/qa.theme.js`, as `mnyv1.qa`). On QA pages `theme.qa` wins over the site's general keys. The widget
  reads `qaReportIssue`.
- Tests: `packages/dms/tests/qa*.test.js`, `sectionGroupCollapsible.test.jsx` and the core-enrichment tests
  (`radioTheme`, `stageProgressTheme`, `structuredTextColumns`, `flowStepNote`, `barGraphTimeAxis`,
  `liveEditSaves`). dms-server: `tests/test-pattern-stub.js`. The full client suite has 3 unrelated failures
  (`avlGraphThemeDefaults` golden, `syncDeltaConvergence` ×2).

## Installs

| Install | Where | State (2026-10-08) |
|---|---|---|
| 126 `QA`, app `qa_test` (test app "QA Ticketing Test") | `/qa`; datasets in environment 42 | Covers AlphaPage and BetaPage (`qa_test`'s own test pages). Tickets #101–108. On `mnyv1` for the MNY look loop (undo: `dms raw update 126 --data '{"theme":{}}'` as `qa_test`; backup `scratchpad/qa_test/backup_126_20261007T143641.json`). AlphaPage (row 5) still has a test nav with the widget. |
| 2824062 `QA`, MitigateNY (`dms_mitigat_ny_prod`) | `/qa`, main site only; datasets in dmsEnv 1676363 `test_meta_forms_env` | Covers 566466 admin, 2265530 MitigateNY_actions, 985070 MitigateNY_2025 and 1300890 MitigateNY_County_Template_V3 (281 pages tracked). Access: `AVAIL`, user 1, `mitigat-ny-prod Admin`; the owner removed `DHSES` on 2026-10-07. Theme: `default` until the rollout. The four patterns' nav rows already carry the widget (written 2026-10-07; backups stamped `20261007T100659`). |

## Rules the work follows (owner)

- **The owner commits and pushes.** Leave changes uncommitted.
- **No MitigateNY prod DB writes** (install settings, nav rows, coverage rows) until the owner says to start that
  part. A go for one write doesn't cover the next. devmny.org and mitigateny.org share the database.
- **Generic in the library, values in the site theme.** MNY is the first real install: build for its needs, but keep
  mechanisms in the library and MNY's colours, fonts and card look in `src/themes/mny/`.
- **Never edit TransportNY's own files** (`src/themes/transportny/`). Shared-library fixes that change TransportNY's
  pages are fine when they're fixes.
- **Match repo precedent** (how do admin and the page pattern do it?). No invented ids, routes or not-found pages.
- **Test data isn't TransportNY-like.** Seed from `qa_test`'s own pages, with `example.com` people.
- **Tokens: QA-only by default, shared where the look is shared.** `--qa-*` and `qa_*` only for QA meaning
  (severity, status kind, stage). Surfaces, text, rules, buttons and inputs reuse `--t-*` and existing keys. No
  copied literals. (This is "Rules carried in", cited in `qa.theme.js`; the full text is in the archive, part 2.)
- **Core changes default to today's output.** Prove it with a repo-wide grep of consumers, and land each one
  separately from QA styling.
- **The ticket record's lists live in code**, not the DB.
- **Probe gotchas:** pass `--auth scratchpad/npmrds-sub/.dms-auth-token-qa_test` (mint with `mint_token.sh qa_test`).
  A bare `--auth` gets stripped rows, so every install shows "datasets aren't set up yet". The probe can't hard-load
  `/list/...`: load `/qa`, then navigate client-side.

## Open work

### 1. MitigateNY rollout (owner and the MNY coworker)

- [ ] Root `npm install`. `maplibre-gl` is missing from the root `node_modules`, so `vite build` fails.
- [ ] Deploy dms-server (the `qa.intake` stub). Without it, county staff not granted on the install can't file.
- [ ] Deploy the client with the MNY `.env`: `npm run build`, then `deploy-devmny`, then `deploy-mnyprod`.
  - **Until then:** admin 566466's side rail on the live site shows a 48px blank gap, because the nav rows were
    written before the deploy.
- [ ] Owner, on install 2824062 after the deploy:
  - Theme tab → `mnyv1` → Save.
  - Change the nav's `topNav.rightMenu` to `[UserMenu]`. The stored `{type: "Search"}` names no widget and renders
    an empty spacer.
- [ ] Coworker: propagate to county patterns. Each needs a nav entry (`src/themes/mny/scripts/report_issue_nav.mjs`)
  and a covered-sites row on Configure. **Who adds the coverage rows isn't agreed yet** (open decision on the
  initiative).

### 2. MNY look: leftovers

- [ ] Editor check: the Section Groups pane's Collapsible and Starts Collapsed switches save and survive a drag.
- [ ] The Ticket page logs 14 React unknown-prop warnings (`customName`, `allowEditInView`, …). Card and
  `TextareaEdit` pass column props to DOM elements (library).
- [ ] MNY's search pill is cramped in the top nav (deferred 2026-10-07). Likely fix: an MNY `pages.searchButton`
  override with `shrink-0` and a gap.
- [ ] `{type: "Search"}` (should be `SearchButton`) in `src/themes/mny/theme.js:221` and on 1592725 Chemung2025,
  1603896 planning-guide and 2043199 sullivan.
- Left as-is (owner, 2026-10-07): the 18 page errors on MNY's `/qa` (uncaught 4-item arrays). They're MNY-install
  only, predate this work and don't affect the render.

### 3. Queued follow-ups (owner, 2026-10-07; none started)

- [ ] **A real serial `ticket_number`**, assigned server-side. Today the form takes max+1 from #101, which can race.
- [ ] **Install lockout fix.** `installQa` grants only `<app> Admin` (`install.js:157-159`). A site without that
  group (MitigateNY) locks everyone out, and the pattern editor refuses a stub, so the Access tab can't fix it. Fix:
  also grant the installing user `*`, and/or start from the site Admin pattern's grants. Add a test for a site
  without the group. (MNY's install was repaired by hand: `scratchpad/mitigat-ny-prod-prod/fix_qa_install_access.py`.)
- [ ] **Configure site list:** a search box like `/list`'s (`editSite.jsx:216,499,543`), pattern IDs in the row or on
  hover, and no truncation of long keys and labels.
- [ ] **Report an issue inside the user menu** instead of a nav icon. Move the coverage check into a shared hook, add
  a user-menu item when the page is covered, and render the lazy form outside the dropdown (like `DeleteModal`,
  `userMenu.jsx:385-391`). This touches the shared `userMenu.jsx`, and removing the four nav entries is a prod write.
- [ ] **Signed-out filing.** The intake stub exists. Still needed:
  - a create guard on `dms.data.create`, which is unguarded today (Defect E in
    [`auth-permission-chain-and-unguarded-writes.md`](./auth-permission-chain-and-unguarded-writes.md));
  - a `create-row` grant on the tickets source;
  - an "allow signed-out reports" switch on the install;
  - a honeypot field and a per-IP rate limit.

### 4. Deferred core work

- [ ] **Change-history writer.** The history dataset exists, but nothing writes to it yet. Also covers
  commit-on-blur for text fields, and tracking story status. Plan: an opt-in `changeLog` column option writing
  `{row_id, field, old_value, new_value, user_id, user_email, at, via}`, through one helper the CLI reuses. That's
  part 4 of the status-change writes; parts 1–3 are done. Archive part 1, "The status-change writes".
  - **Leftovers from parts 1–3:**
    - swap the `updated` field for native `updated_at`;
    - flush a pending save on `pagehide`;
    - stamp dates in the editor's bulk branch.
- [ ] **Feature switches** (Tickets, Page inventory, Page stages, Stories, Overview). The plan is written: archive
  part 1, "Phases 6–7", "Feature switches". Configure shows a placeholder.
- [ ] **`dms qa` CLI** (state, tickets, edit, close, enroll; dry run by default). It's also where the per-page
  blocker/major counts come back.
- [ ] **Design mockups** as an install feature: a Design page per tracked page, and the QA ⇄ Design toggle.
- [ ] Group the status menu by kind. This needs option groups in the shared select.

### 5. MitigateNY contract (D5.2 / D8.6.2: v1.0 live with a DHSES walkthrough, Dec 2026; backfill, Jan 2027)

The ticket record compared with the contract's asks (the asks are listed in the two MNY tasks linked above):
- **Fields:** has `priority`, `category`, `assignee`, `effort`. Missing: **county**, **requester type** (county /
  town / consultant / state), **hours** (unless `effort` serves).
- **Workflow:** the contract asks for new → acknowledged → triaged → resolved → closed. The record uses TransportNY's
  seven statuses, so this needs install-named statuses (a roadmap item) or an MNY status set. The dispositions (fix,
  workaround, backlog, out of scope) are already in the outcomes.
- **Acknowledged within 2 business days, provable from timestamps:** needs the change-history writer (§4) plus a
  response-time clock.
- **Also needed:**
  - staff intake (requests that came in by phone, email or office hours);
  - a DHSES dashboard by county, category and age, exportable;
  - the queries for the quarterly reports;
  - the Feb–Dec 2026 backfill.
- **Security before external users:**
  - reads of DMS internal datasets have no permission check, so reporter emails can be read through `uda`;
  - `dms.data.create` is unguarded (Defect E).

### 6. TransportNY (lower priority since 2026-10-06; no contract)

- [ ] **Phase 7, rehearsal:** copy TransportNY's QA data into an install on `qa_test` through the CLI, with new ids:
  - keep each old id in `legacy_id`;
  - rewrite the 19 `duplicate_of` links;
  - seed the change history from existing dates.
- [ ] **Phase 8, the port:** TransportNY's own task, under `planning/transportny/`, when it starts. Its look becomes a
  theme-level `qa` override. The old control room (`sitemgmt` 2184885) is hidden, not deleted.

### 7. Later roadmap

From [`plan-history.md`](../../../../../research/qa-ticketing-system/plan-history.md), the feature roadmap's
section 2:
- **New features:** support-desk fields, install-named statuses, reopen and merge, screenshots from the button,
  attachments on every host, client sign-off.
- **Add-ons:** board, response-time clocks, staff intake, notifications, quarter-end snapshots, activity feed, email
  intake. Each one reads the change history.
- **Then:** a throwaway DB per app run, then agents working tickets.

### 8. Library leftovers found along the way

- [ ] The Section Groups pane's drag rebuild drops `modalSize` and `railHost`, plus any field not in its list
  (`sectionGroupsPane.jsx` ~267, ~315).
- [ ] The Overview tab's dirty save bar is see-through when stuck (shared `settingsEditor.saveBarDirty`).
- [ ] Card's default `value` class beats `valueFontStyle`'s size, so QA uses the `stat_value` column type instead.
  Fixing it changes every default-theme Card.
- [ ] Card strips spaces from `formatFn` output (`datetime` prints "09/24/202610:00am"). Fixing it changes stored
  WCDB and NPMRDS sections.
- [ ] Under a DMS join, `mapFilterGroupCols` could map an unlisted `alias.col` itself. Today a hidden column is the
  workaround.
- [ ] A plain `Check` icon is missing from the library set. Adding it changes the Spreadsheet's add-row button,
  which shows a fallback shield today.
- [ ] Route auth judges the placeholder user while sign-in loads. QA works around it:
  [`route-auth-check-judges-placeholder-user.md`](./route-auth-check-judges-placeholder-user.md).
- Not checked live: Configure's datasets-missing state and its overlap refusal (both unit-tested).

## Decisions on record

Dated owner decisions that still hold. The reasoning is in the archive.

- **2026-09-28:**
  - a `qa` pattern type with its pages in code;
  - QA pages work like admin's (nobody edits them);
  - upgrades overwrite;
  - no publish step.
- **2026-09-30:**
  - QA routes pick their own page, like admin's, so the shared matcher is unchanged;
  - an unknown URL shows the install's home page;
  - no edit pencil;
  - installs share the site's data environment;
  - dataset names are unique per install (`<install>_<key>`);
  - the Overview reads its site list from the covered-sites dataset;
  - the Overview is the home page.
- **2026-10-01:**
  - status writes go through the library fix (option (b)), not a QA-owned control;
  - Resolved → Closed keeps the first resolved date;
  - text fields commit on blur;
  - story status gets tracked with the history writer.
- **2026-10-02:**
  - Configure is a tab on the install's own `manage_pattern` page;
  - every pattern type but `admin` and `qa` can be covered;
  - new rows name their pattern by instance;
  - the short key locks once used;
  - one Save for the tab;
  - feature switches come later.
- **2026-10-05:**
  - design source is Tessera `design_system_v6`;
  - the status menu is a flat list;
  - Report an issue is placed by the theme (a nav-slot widget; floating is a widget option);
  - ideas keep severity Feature;
  - the "How delivery works" captions ship as the library default.
- **2026-10-06:**
  - MitigateNY first; TransportNY drops in priority.
- **2026-10-07:**
  - county staff file through the server stub (option (b), "no real security concern");
  - v1 is signed-in only;
  - the confirmation shows no ticket number;
  - the QA theme follows the page/datasets model;
  - site cards start collapsed;
  - the header menu is QA's own pages, with no Search;
  - Overview site tables show 10 rows.

## Where the history went

Code comments and other docs cite sections of this doc and of the two merged docs. All are in the archive:

| Cited as | Archive |
|---|---|
| this doc, "Design pass", "Phase 1" … "Phase 5", "Phases 6–7", "The status-change writes" | part 1 |
| `qa-design-implementation.md` (incl. "Rules carried in", step 4) | part 2 |
| `qa-mny-look-and-collapsible-sites.md` | part 3 |
