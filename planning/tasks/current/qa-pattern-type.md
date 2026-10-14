# `qa` pattern type ("Tickets"): delivery QA and help desk as a library feature

**Initiatives:** [dms_qa_ticketing](../../../../../planning/initiatives/dms_qa_ticketing.md) (primary), [mny_sow_deliverables](../../../../../planning/initiatives/mny_sow_deliverables.md) · **Status:** doing · **Created by:** rdubowsky@albany.edu · **Edited by:** amuro@albany.edu

The one task doc for the QA pattern: what's built, what's open, and the rules the work follows. Any site adds it
from Add Pattern. It serves two products as switch groups over a shared tickets core: **Delivery QA** (TransportNY's
origin) and **Help desk** (MitigateNY's origin). MitigateNY is the first real install, and TransportNY's control room
is ported later.

- **History** (everything up to 2026-10-08, verbatim): [`qa-pattern-type-archive.md`](./qa-pattern-type-archive.md).
  It holds this doc's earlier text plus two task docs merged in on 2026-10-08: the design-pass implementation and the
  MNY look / collapsible site cards. Both were built and committed.
- **Research** (2026-09-28/29; shaped the design, may be stale): dms-template
  [`research/qa-ticketing-system/`](../../../../../research/qa-ticketing-system/README.md).
- **MitigateNY contract tasks** (owned by other people; this work feeds them):
  [`mny-sow-ticket-system.md`](../../../../../planning/mitigateny/tasks/completed/mny-sow-ticket-system.md),
  [`sow-support-ticket-system-and-office-hours.md`](../../../../../planning/mitigateny/tasks/current/sow-support-ticket-system-and-office-hours.md).
- **Coworker how-to** for placing Report an issue on more MNY sites:
  [`report-an-issue-widget.md`](../../../../../planning/mitigateny/skills/report-an-issue-widget.md).

## ▶ Start here (2026-10-14)

- **Moved (2026-10-14): the QA pattern now lives in dms-template `src/patterns/qa/`**, registered from
  `src/patterns/index.js` like the map editor. The library holds no QA code.
  - Record: [`pluggable-patterns-qa-extraction.md`](./pluggable-patterns-qa-extraction.md).
  - The code map below is updated. Older sections and the archive cite `patterns/qa/…` under the
    library's `packages/dms/src/`; the same files are now under dms-template `src/patterns/qa/`.
  - Two mechanisms changed:
    - The no-access stub carries the row's `public.qaIntake` (written by QA's `intake.js`), no longer a
      server-built `qa.intake`.
    - The widget's theme key is `qa.reportIssue` (was `qaReportIssue`).
  - **The move is not committed yet.** The owner commits the library and dms-template together. Everything before
    it is committed through `73d28b0e`.
  - **Deferred (owner, 2026-10-14): delete the four old installs** (2824062 on MNY prod; `qa_test` 126, 170, 219).
    None of their data is real, and they lack `public.qaIntake`. Fresh test install 251 `QA move check`
    (`/qa_move_check`) was made through the new create hooks. Inventory and steps:
    [`pluggable-patterns-qa-extraction.md`](./pluggable-patterns-qa-extraction.md#left).
- **Nothing deployed for about a week (owner, 2026-10-09).** No QA work is on a deployed host. MitigateNY's rollout
  (Open work §1) waits on a dms-server deploy (the stub's `public` settings + the change-history writer) and a client
  deploy, deferred by the owner on 2026-10-14. Then a fresh install replaces 2824062, and the owner switches its
  theme. The history writer is opt-in per dataset, so the
  server deploy changes nothing until a dataset has a `change_history` setting.
- **Current loop:** the owner is iterating on MNY's QA look locally. The root `.env` points at `qa_test`, and test
  install 126 `QA` is on `mnyv1`.
- **Change-history writer (Open work §4): built, committed, live-checked on `qa_test`.** Install 126 has it on.
  - Open: a Postgres test run (`scratchpad/qa_test/run_change_history_pg.sh`). Needs Docker, which Claude
    sessions can't reach; the owner runs it. Only SQLite has run (16/16).
  - Open: whether to keep Datasets pattern 194 on `qa_test`, added to reach the Admin tab.
  - Logged, not started: [`change-history-growth.md`](./change-history-growth.md) (history tables have no
    retention and no JSON indexes).
- **Built and committed (2026-10-09, `9377c626`): the Overview's Recent activity feed** and history on create,
  Open work §4. Test ticket row 210 is still on `qa_test` for review.
- **§5 is the plan (owner, 2026-10-13):** one pattern type, a shared tickets core, two switch groups (Delivery QA,
  Help desk). Step 1, the switches on Configure, is **built, live-checked and committed** (`4f969c26`, 2026-10-13).
  Scratch install 219 `QA switches` (`/qa_switches` on `qa_test`) goes with the old-install deletion.
- **Step 2a, custom ticket fields: built and live-checked 2026-10-13, committed (`73d28b0e`)** (Configure's "ticket
  fields" card; Details, table, filter chips, the report forms, History and Recent activity). The form's fields
  reach ungranted users through `public.qaIntake` since the move.
- **What's next:** step 2b, editable lists (statuses, outcomes, categories), in `src/patterns/qa/`; then step 3, the
  Help desk switches.

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
- **Stub:** what the server sends in place of a pattern row the user can't read (settings stripped). It carries the
  row's `public` settings; a `qa` row's `public.qaIntake` (`intake.js`) lets ungranted users still file.
- **Switch group:** Delivery QA or Help desk, switched on and off on the install's Configure tab, with a switch per
  feature beneath it. The group's own switch does a preset's job. The shared tickets core has no switch (§5). Not
  a feature flag: those are `.env` settings, e.g. `VITE_DMS_QA_PATTERN`.
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
| Feature switches: Delivery QA group (page inventory, stages, stories) on Configure; card renamed "Tickets" | built, live-checked; committed `4f969c26` | §5 step 1 |

**Where the code is** (dms-template `src/patterns/qa/` since 2026-10-14; library paths under `packages/dms/src/`):
- `src/patterns/qa/`:
  - `index.js`: the pattern-type definition (registry hooks: `admin.beforeCreate`/`afterCreate`/`duplicable`/
    `editorTabs`, `onPagePublish`).
  - `siteConfig.jsx`: routes; registers the `ReportIssue` widget.
  - `pages/`: `index.js` (`buildQaPages`, `findQaPage`), `view.jsx`, `shell.jsx`, `overview.js`, `tickets.js`,
    `ticket.js`, `pageQa.js`, `helpers.js`.
  - `ticketRecord.js`, `datasets.js`, `install.js` (holds the `QA_PATTERN_ENABLED` flag and the create hooks).
  - `tracking.js` (track-on-publish and `pageTracking`; no browser imports), `publish.js` (the editor's
    `onPagePublish`), `cli/onPagePublish.js` (`dms page publish`'s hook, via `DMS_PAGE_PUBLISH_HOOK`), and
    `configure.js`.
  - `intake.js`: `public.qaIntake`, what the no-access stub shows ungranted users.
  - `reportIssue/`: `report.js`, `ReportIssue.jsx`, `ReportIssueForm.jsx`, `ReportIssue.theme.js` (key
    `qa.reportIssue`).
  - Theme: `defaultTheme.js` (mounted at `theme.qa` by the registration), `qa.theme.js`, `withQaTheme.js`.
  - `admin/`: `configureTab.jsx` (+ `.theme.js`; site override key `admin.qaConfigure`, since admin pages take
    only a site theme's `admin` key) and `patternSettings.jsx` (`QaPatternSettings`, the datasets card, now on
    Configure only).
  - `tests/`: the QA suite (`npx vitest run src/patterns/qa`).
- Server: no QA code. `dms.route.js`'s no-access stub carries any pattern row's `public`; the `dms.sourceIdBySlug`
  route. The change-history writer: `routes/dms/changeHistory.js` + `setDataById` in `dms.controller.js`.
- Change history, client side: `patterns/datasets/utils/changeHistory.js`, `components/ChangeHistoryEditor.jsx`.
- CLI: `dms page publish` runs track-on-publish.
- Theming: a site overrides QA through its theme's `qa` key, listing only differences (MNY:
  `src/themes/mny/qa.theme.js`, as `mnyv1.qa`). On QA pages `theme.qa` wins over the site's general keys. The widget
  reads `qa.reportIssue`.
- Tests: dms-template `src/patterns/qa/tests/`, library `sectionGroupCollapsible.test.jsx` and the core-enrichment tests
  (`radioTheme`, `stageProgressTheme`, `structuredTextColumns`, `flowStepNote`, `barGraphTimeAxis`,
  `liveEditSaves`). dms-server: `tests/test-pattern-stub.js`. The full client suite has 3 unrelated failures
  (`avlGraphThemeDefaults` golden, `syncDeltaConvergence` ×2).

## Installs

| Install | Where | State (2026-10-08) |
|---|---|---|
| 126 `QA`, app `qa_test` (test app "QA Ticketing Test") | `/qa`; datasets in environment 42 | Covers AlphaPage and BetaPage (`qa_test`'s own test pages). Tickets #101–108. On `mnyv1` for the MNY look loop (undo: `dms raw update 126 --data '{"theme":{}}'` as `qa_test`; backup `scratchpad/qa_test/backup_126_20261007T143641.json`). AlphaPage (row 5) still has a test nav with the widget. |
| 170 `QA2`, app `qa_test` | `/qa2` | Made 2026-10-06, not in this doc until 2026-10-13. Covers BetaPage. Four datasets (no history). No `features`, so it reads as Delivery QA. |
| 219 `QA switches`, app `qa_test` (scratch, 2026-10-13) | `/qa_switches` | The switches and fields live checks (§5 steps 1, 2a). Covers Pages (pattern 3). All Delivery QA features on (set back by the owner after review). Four fields (requester_type, hours, channel, received). Tickets #101 (row 236), #102 (row 245). Remove when reviewed (§5). |
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
- **Status kinds live in code; an install's statuses are its own settings** (owner, 2026-10-13; this replaced "the
  ticket record's lists live in code"). A site's needs are settings and theme code on top of core, never edits to
  core's lists (§5).
- **Probe gotchas:** pass `--auth scratchpad/npmrds-sub/.dms-auth-token-qa_test` (mint with `mint_token.sh qa_test`).
  A bare `--auth` gets stripped rows, so every install shows "datasets aren't set up yet". The probe can't hard-load
  `/list/...`: load `/qa`, then navigate client-side.

## Open work

### 1. MitigateNY rollout (owner and the MNY coworker)

- [x] Root `npm install` (owner ran it 2026-10-14; both builds pass).
- [ ] Deploy dms-server (the stub's `public` settings, which carry `public.qaIntake`). Without it, county staff not
  granted on the install can't file. The install also needs a Configure Save or "finish set-up" to write
  `public.qaIntake`.
- [ ] Deploy the client with the MNY `.env`: `npm run build`, then `deploy-devmny`, then `deploy-mnyprod`.
  - **Until then:** admin 566466's side rail on the live site shows a 48px blank gap, because the nav rows were
    written before the deploy.
- [ ] Owner, on install 2824062 after the deploy:
  - Configure tab → datasets card → "finish set-up". This switches on change history. It's a prod write, and
    the deployed dms-server must have the history writer (§4).
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

- [ ] **Change-history writer: server-side (owner, 2026-10-08).** Built and committed (`7764dd5c`); only the
  Postgres test run is left. Part 4 of the status-change writes
  (parts 1–3 done; archive part 1, "The status-change writes").
  - **Why server-side, not the earlier `changeLog` column option:**
    - a history row is a create, and `apiUpdate` re-runs the page loader after every create
      (`dms-manager/wrapper.jsx:89-100`);
    - a column option would only record edits made through configured sections. The CLI, agents, Edit mode and
      later author-built pages would each need wiring;
    - the browser's copy of the row can hold a stale old value, and the field save and the history write could
      come apart.

    `dms.change_log` can't be the history either: it stores `data = null` for dataset rows
    (`table-resolver.js:55-58`) and is compacted.
  - **Mechanism.** A dataset's source row carries
    `change_history: {target: {source_id, view_id}, columns: [...] | '*', exclude: [...]}`.
    - `setDataById` (`dms.controller.js`) reads the old row inside its transaction, diffs the listed columns, and
      inserts one history row per changed column into the target dataset, in the same transaction.
    - The history row is `{row_id, source_id, field, old_value, new_value, user_id, user_email, at, via}`.
    - `'*'` means the columns the dataset declares. The native `updated_at`/`created_at` are table columns, never
      in `data`. `exclude` is for data fields that act as stamps (QA: `updated`, `resolved_date`).
    - `via`: the `X-DMS-Via` header (the CLI sends `cli`), else `ui`.
  - **Typing bursts merge on the server, replacing blur-commit (owner, 2026-10-08; reverses 2026-10-01 "text
    fields commit on blur").**
    - Text and textarea columns only: the same person, row and field within **30 s** of the newest history row
      update that row instead of adding one, and remove it if the text ends where it started.
    - Pick-list changes never merge (the response-time proof needs each status time).
    - No client `commitOn`.
  - **Steps:**
    - [x] 1. Server writer + burst merge + CLI header + dms-server tests (2026-10-08):
      - `dms-server/src/routes/dms/changeHistory.js` holds the setting parse, tracks/merges, value text,
        the 30 s window and `via`.
      - `dms.controller.js`:
        - `loadChangeHistory`: cached 60 s; cleared by any source write or a source/view delete. An
          unresolvable history dataset warns and saves without history.
        - `writeChangeHistory`, called in `setDataById`: the old row is read `FOR UPDATE` in the same
          transaction. The burst merge searches the history's newest 200 rows.
      - `index.js` puts `X-DMS-Via` on `reqMeta.via`; the CLI sends `cli` (`cli/src/client.js`).
      - Typed columns that merge = every type but select/multiselect/radio/checkbox/boolean/switch (numbers
        typed in an input merge too). The window slides: each merge restamps `at`.
      - `tests/test-change-history.js`: 15/15 on SQLite (in `npm test`; full suite green). **Postgres not
        run:** this session can't reach Docker. Run `node tests/postgres-docker.js run
        tests/test-change-history.js`.
    - [x] 2. QA (2026-10-08; install 126 switched on through the card's "finish set-up", live):
      - history gains `source_id` (label "Dataset"), after `row_id`;
      - `QA_TRACKED_COLUMNS` (datasets.js): tickets (status, severity, priority, category, assignee, outcome),
        pages (stage), stories (stage);
      - `planQaChangeHistory` / `loadQaChangeHistoryPlan` (install.js), run at the end of `installQa`:
        - sets `change_history` only on a dataset that has none (an admin's choice survives a re-run);
        - appends the history columns an older install lacks;
      - the datasets card (`QaPatternSettings`) shows "finish set-up" when change history isn't on. That's how
        existing installs get it: 126 by us, MNY 2824062 by the owner after deploy;
      - tests: `qaInstall` (+4), `qaTicketRecord` updated.
    - [x] 3. Ticket page History (code 2026-10-08):
      - the placeholder is gone. A title Card ("History · N changes") sits over a `qa_list` Spreadsheet
        (When · Field · Change · By, newest first, 25 a page, "No changes yet"), filtered `row_id = ?id`;
      - both refetch on `ticket_v`, so a rail pill change shows at once. A typed field (assignee) shows on
        reload, since text edits don't publish;
      - `At` is shown as stored (UTC), like the rail's dates;
      - a table rather than the mockup's dot timeline: no Card primitive draws a per-row coloured dot, and the
        table matches the other QA lists;
      - no History sections without a history dataset;
      - tests: `qaTicketPages` (+2, 2 updated). Full client suite 848/851, the same 3 unrelated failures.
    - [x] 4. Datasets source **Admin** tab panel (2026-10-08; live-checked):
      - `patterns/datasets/components/ChangeHistoryEditor.jsx` (+ `.theme.js`, key
        `datasets.changeHistoryEditor`), under Access on internal datasets' Admin tab
        (`dataTypes/internal/pages/admin.jsx`). Needs `update-source`;
      - controls: on/off, chosen/all columns, an except list, and "Writes to" (a link to the target);
      - **no picker (owner, 2026-10-08):**
        - the first save makes the dataset's own "*<dataset> history*" (`ensureHistoryDataset`), or reuses it if
          that name is already a history, and refuses if the name is taken by a non-history;
        - shared histories are set up in code or with the CLI (QA's install);
        - this replaced a first version that read every source in the environment to list history-shaped
          datasets and hid QA's (owner: no server route for it; asked why filter at all);
      - switching off stores `enabled: false` with the target and columns kept. The server skips it
        (`parseChangeHistory`), and switching back on returns to the same history, a shared one included;
      - saves with `dms.data.edit`, not the UDA source-settings route. That route writes the row directly
        (`uda.controller.js` `updateSource`), so the server's cache would stay stale for up to 60 s;
      - `patterns/datasets/utils/changeHistory.js` holds `CHANGE_HISTORY_COLUMNS` (QA's history uses it), draft ⇄
        setting, and `ensureHistoryDataset`. Documented in `patterns/datasets/internal-datasets-overview.md`,
        "Change history";
      - tests: `changeHistorySetting.test.js` (6); dms-server `test-change-history.js` 16/16 (adds
        `enabled: false`). Full client suite 854/857, the same 3 unrelated failures;
      - **Live, 2026-10-08:**
        - Datasets pattern 194 "Datasets" (`/datasets`, environment 42) was added to `qa_test` so the tab is
          reachable (site row backup `scratchpad/qa_test/backup_site_1_20261008T144014.json`). This also turns
          on the QA pages' "+ Add ticket".
        - 127 `qa_tickets`: the panel showed "Writes to QA — Change history" and the six columns. Off → Save →
          on → Save came back to the same target and columns. The stored setting equals the backup
          (`backup_source_127_*.json`).
        - Scratch 195 "History panel test" (one row 197): on + All columns → Save made 198 "History panel test
          history" (view 199, history columns, in environment 42's list) and stored
          `{target 198/199, columns '*'}`. A CLI edit wrote history row 200 (status open → done, via cli).
          195 and 198 were then deleted; the cascade removed their views, tables and environment refs.
        - Probes: `scratchpad/qa_test/probes/change_history_{panel,toggle,create}.mjs`.
    - [x] 5. Live check on install 126 (2026-10-08). The Admin panel half was covered by step 4's live check on
      127 `qa_tickets`, which belongs to install 126. The history half:
      - "finish set-up" on 126's datasets card wrote `change_history` on 127 `qa_tickets`, 129 `qa_pages` and
        131 `qa_stories`, and appended `source_id` to 135 `qa_history` (backup
        `scratchpad/qa_test/backup_history_sources_20261008T134806.jsonl`). The note then cleared.
      - Ticket #102 (row 150), probe `scratchpad/qa_test/probes/history_ticket_edits.mjs`:
        - a Status pick showed in History without a reload ("1 change");
        - three assignee typing saves plus the clear, all within 30 s, made one row;
        - CLI writes (`dms raw update --row-type`) are marked "· CLI";
        - the History rows are 188–192 in `dms_qa_test.data_items__s135_v136_qa_history`. They show the probe's
          edits and the restore to the row's real values: In review, assignee `dev@example.com`.
      - The By column first ran past the panel (710 px of columns in a 646 px panel). Widths are now 620 px and
        everything shows (`history_read.mjs`).
  - **Leftovers from parts 1–3:**
    - swap the `updated` field for native `updated_at`;
    - flush a pending save on `pagehide`. Not a plain listener: falcor sends with XMLHttpRequest, which browsers
      abort while unloading, so it needs a keepalive request in the api layer;
    - stamp dates in the editor's bulk branch.
  - **Growth:** logged separately, [`change-history-growth.md`](./change-history-growth.md) (owner, 2026-10-09).
- [x] **Overview: Recent activity feed (owner, 2026-10-09). Built, live-checked on `qa_test`, committed `9377c626`.**
  Replaced the "planned" placeholder. Reads the change history. Works on any theme; MNY's look is the
  deliverable (owner, live: "looks pretty good").
  - **What it shows** (`pages/overview.js`, `activitySections`): every change to a ticket's tracked fields
    (status, severity, priority, category, assignee, outcome; owner asked for more than status), newest first,
    10 a page, one full-width row each (owner asked for the change itself; this replaced the mockup's two
    columns of one pill + title):
    - `#number  title   Field  (old) → (new)   MM/DD`. The ticket leads, number and title in bold (owner:
      the identifying info must be the most prominent), both linking to the ticket by ROW id, like every QA
      link (owner asked about using the ticket ID: that waits on the serial `ticket_number`, §3). No column
      headers (owner tried the idea, then said to leave it).
    - Values use each field's own pills (status, severity, priority, category, outcome); free text (an
      assignee) and `—` (empty) are plain text through `status_pill`'s new `pillColors['*']` and the
      `qa_plain` pill style.
    - A create shows once, as `Status  Filed → Triage`; its other fields' rows are hidden. That needs the
      history's new `op` ('create' | 'edit', server): an edit from empty (a first assignment) also has an empty
      old value. Rows from before `op` read as edits.
    - Rows use a new card style, `qa_feed` (`qa.theme.js`): a rule under each row, the well on hover.
    - Title row with a live count over the same rows and filters ("3 changes · newest first", "No activity").
    - Data: history rows `field = status` on the tickets dataset, inner-joined to tickets on
      `ds.data->>'row_id' = (t.id)::text` (a calculated join key), kept to the **covered sites** (owner: the
      install covers only AlphaPage, so BetaPage mustn't show).
    - Without a history dataset: a "needs set-up" note pointing at the datasets card.
  - **Filters (owner asked):** Site, Page, Category ("type") and Status chips, as the Tickets page's filter bar
    (`filter_control` chips writing URL page variables `surface`, `page_name`, `category`, `status`). The chips
    sit on a Card over the tickets (plain column names); the list and count filter `t.surface`, `t.page_name`,
    `t.category` and `ds.new_value` (the status changed TO).
    - Site chip: covered sites only, through `excludeOptionValues` (the known but switched-off keys). A
      static `surface` filter on the chips' card narrows Page/Category/Status, but `filter_control` ignores
      filters on its own column (`pruneTreeForControl`).
    - Status chip lists the statuses tickets hold now.
  - **"Filed" needs creates in the history:** the writer ran only on edits (`setDataById`). `createData` now writes
    one row per tracked field with a value, from empty (`old_value = ''`). The feed reads status-from-empty as Filed.
    Tickets filed before the server deploy have no Filed row.
  - **Steps:**
    - [x] 1. Server: history on create (2026-10-09, `9377c626`):
      - `createData` runs `writeChangeHistory` with `created: true` in its transaction: one row per tracked
        column with a value, from `''`; no burst lookup for a new row. The creator's typing within 30 s
        merges into the create's row, as any burst does.
      - **Per call, off by default (owner, 2026-10-09):** `createData` and `setDataById` take
        `{ changeHistory = false }`. Only the Falcor `dms.data.create` / `dms.data.edit` routes pass `true`, so
        the UI and the CLI record as before, and server-side callers (the upload publish loop, workers, page
        duplication) write none unless they ask. Checked every caller: none of the others edits a tracked
        dataset column (the upload validator's `isValid` is never tracked).
      - `tests/test-change-history.js` 21/21 (+ create cases, the default-off check, a create rollback); full
        `npm test` exit 0. Postgres not run (no Docker here).
      - Documented in `patterns/datasets/internal-datasets-overview.md`, "Change history".
    - [x] 2. Overview sections (2026-10-09): `activitySections` in `pages/overview.js`; `qa_feed` card style.
      Tests: `qaOverviewPages` (+5: join and filters, row shape, chips and page variables, covered sites, no
      history), `qaDerivedValues` (+4: the compiled join `ds.data->>'row_id' = (t.id)::text`, inner, and each
      filter on its own table; the joined-sections list). Full client suite 900/903, the same 3 unrelated failures.
    - [x] 3. Live check (2026-10-09), install 126 on `mnyv1`, probe `scratchpad/qa_test/probes/activity_feed.mjs`
      (+ `activity_site_chip.mjs`):
      - test ticket **row 201 "Activity feed check (test ticket)"** filed through the CLI, then In progress →
        Resolved: the list shows `Filed → Triage`, `Triage → In progress`, `In progress → Resolved`, newest first,
        each linking `/qa/ticket?id=201`; the count reads "3 changes";
      - `?status=Resolved` → one row, "1 change";
      - the Site chip offers only AlphaPage;
      - #102's older changes no longer show: it's a BetaPage ticket, and 126 now covers only AlphaPage.
      - Screenshots: `scratchpad/qa_test/probes/activity_feed_crop_v2.png`, `activity_site_chip.png`.
    - [x] 4. All tracked fields, ticket first, bold (2026-10-09, `9377c626`):
      - server: history rows carry `op` ('create' | 'edit'); `CHANGE_HISTORY_COLUMNS` declares it ("Action");
        `test-change-history.js` 22/22 (+ op on creates, edits and a first assignment); full `npm test` exit 0;
      - `status_pill`: `pillColors['*']` styles every value the map doesn't name, ahead of the keyword guesses
        (`ui/columnTypes/statusPill.jsx`; the edit dropdown leaves `*` out). Grep: none of the 54 `pillColors`
        uses in the repo has a `*` key. Test `statusPillDefault.test.jsx`;
      - QA: `ticketFieldLabel` moved to `pages/helpers.js` (the Ticket page's History and the feed share it);
        `OUTCOME_PILL`; `qa_plain` pill; `qaBodyBold` text key;
      - **landmine:** the first try at "Filed" compared `op = 'create'` in a SELECT expression, and the server's
        `sanitizeName` dropped the whole column (empty atom, no error). The feed tests `op = 'edit'` instead,
        and a test fails if any fetched feed column contains a SQL keyword;
      - **bold:** `font-semibold` alone computed to 400: the `.t-*` type classes set their own weight and are
        unlayered. `qaBodyBold` uses `!font-semibold` (computed 600 live; owner confirmed);
      - tests: `qaOverviewPages`, `qaDerivedValues` (the named-table invariant now admits a section's own calc
        expression as a filter, if every table is named), `qaTicketRecord`, `changeHistorySetting`. Full client
        suite 903/906, the same 3 unrelated failures;
      - live, probe `activity_feed.mjs` (+ `activity_bold.mjs`): test ticket **row 210** (filed with priority Next,
        then priority Now, assigned, In progress, severity Major) shows 5 rows: `Severity Minor → Major`,
        `Status Triage → In progress`, `Assignee — → dev@example.com`, `Priority Next → Now`,
        `Status Filed → Triage`. Screenshot `activity_feed_crop_ident.png`.
      - **Row 210 is still on `qa_test`** for review (row 201 was deleted: its create rows predate `op`), now on
        tracked page `alphapage:new_page_2` (it was on an untracked key). Delete with
        `dms raw delete qa_test 'qa_tickets|128:data' 210`.
    - [x] 5. The whole Overview counts only covered sites (owner, 2026-10-09: the header said 7 pages tracked,
      AlphaPage has 3). `coveredKeys(ctx)` in `pages/overview.js` filters the header figures (pages tracked,
      client accepted, open tickets, blockers), the "How delivery works" stage counts and Recent activity on
      `surface`; until the sites load, and with none covered, it's `'(none)'` (no short key can match
      `configure.js` KEY_RE), so nothing counts. Test in `qaOverviewPages`. Full client suite 904/907, the same
      3 unrelated failures.
- Feature switches: moved to §5, step 1 (owner, 2026-10-13).
- [ ] **`dms qa` CLI** (state, tickets, edit, close, enroll; dry run by default). It's also where the per-page
  blocker/major counts come back.
- [ ] **Design mockups** as an install feature: a Design page per tracked page, and the QA ⇄ Design toggle.
- [ ] Group the status menu by kind. This needs option groups in the shared select.

### 5. Next build: one pattern, a shared tickets core, two switch groups (owner, 2026-10-13)

The pattern serves two products: **Delivery QA**, pages moving through stages to client acceptance (TransportNY's
origin), and **Help desk**, requests from a live site's users answered on time (MitigateNY's origin). They're switch
groups on the one `qa` pattern type, not two types. About 80% of what's built is shared, and one install per covered
site is what tells Report an issue where a ticket goes. **MNY's needs don't reshape core's lists or fields:** its
specifics are settings on install 2824062 plus MNY theme code.

| | Built | Planned |
|---|---|---|
| **Shared tickets core** (always on) | Tickets list and Ticket page, statuses with kinds, outcomes, severity, change history, Recent activity, Report an issue and covered sites, Access | custom statuses and fields, serial ticket numbers, signed-out filing, the `dms qa` CLI |
| **Delivery QA** group | Page inventory (track-on-publish), page stages and the "How delivery works" strip, Stories, the Page QA page | Design mockups, client sign-off |
| **Help desk** group | — | staff intake, clocks, requester messages and notifications, a "my requests" view, CSAT |

The Overview is shared and shows whatever is on.

**Step 1: switches. Built and live-checked 2026-10-13, committed (`4f969c26`).**
- **Where:** the install's Configure tab (`/list/manage_pattern/<id>/configure`), which shows a placeholder today.
  **The Add Pattern picker doesn't change** apart from the card's name: "Ticketing / QA" becomes "Tickets"
  (`patterns/index.js`). One card per type, like every type but page (page shows a card per page template).
- **Shape:** each group has its own switch, with a switch per feature beneath it. Switching a group on adds its
  features, so the group switch does a preset's job.
  - **Stored as an allow-list** (chosen 2026-10-13; the owner had no preference): `pattern.qa.features`, an array
    of the features that are on, e.g. `['page_inventory', 'page_stages', 'stories']`, saved by Configure's Save. A
    feature added later stays off on every existing install until someone turns it on. (This replaces the archived
    plan's "a missing switch means on", which made it a deny-list.)
  - **A new install starts with `[]`:** the shared core only. `installQa` writes it.
  - **An install with no `features` at all** (126 and 2824062, made before switches) reads as today's features, the
    Delivery QA set, so nothing changes on them and no prod write is needed. The first Save on Configure writes the
    array.
- **What each Delivery QA switch hides** (from the archived plan, part 1, "Feature switches"):
  - Page inventory: the Page QA page, the Overview's per-site page tables, track-on-publish (both publish paths
    skip the install).
  - Page stages (needs Page inventory): stage pills and tiles, the "How delivery works" strip.
  - Stories (needs Page inventory): Page QA's stories section.
  - The archived list's Tickets and Overview switches go: tickets are the core, and the Overview shows what's on.
- **Help desk group:** shows on Configure once it has its first feature (step 3).
- **Mechanics:** `buildQaPages` drops what's off and the nav follows the page list; a hidden page's URL lands on the
  home page (`findQaPage`'s fallback). A switch whose prerequisite is off is disabled, with the reason. Off hides and
  never deletes. All five datasets are still created up front.
- **Tests:** what each switch removes, the prerequisite rules, the home fallback, track-on-publish's check, a new
  install starting with `[]`, an install without `features` reading as the Delivery QA set.
- **Then, on MNY (a prod write; waits for the owner's go):** Delivery QA off on 2824062 (its first `features`
  write).
- **Built (2026-10-13):**
  - `patterns/qa/features.js` (new): the groups, `installFeatures` / `hasFeature` (an unmet prerequisite or an
    unknown key reads as off), and Configure's `setFeature` (off cascades to what needs it; on waits for the
    prerequisite), `setGroup`, `groupState`, `featureBlocked`, `describeFeatureEdits`.
  - Pages (`pages/index.js` passes `ctx.features`):
    - no page inventory: no Page QA page; the Overview has no page figures, no per-site page table (a site is its
      name beside its tickets bar, not collapsible) and its title is 2/3 wide; the Ticket page's target is text,
      not a Page QA link, and the header has no "open page";
    - no stages: no "How delivery works", no client-accepted figure, no stage bars, no Stage column (pages sort
      by name), no stage meter on the Ticket page; Page QA's rail opens with a plain "Page status" title;
    - no stories: Page QA has no stories.
  - Track-on-publish (`tracking.js`, both publish paths) skips an install without the page inventory.
  - Configure: the switches card replaces the placeholder (group switch with "n of 3 on", a switch per feature,
    disabled with "needs Page inventory"); the save bar names switch changes ("Delivery QA switched off"); the
    pages-tracked figure, the ticket record's page stages and the covered-sites hint follow the switches.
    `saveConfigure` takes `trackPages` (inventory off: no backfill) and `backfillAll` (inventory just switched
    on: every covered site's published pages).
  - New installs: Add Pattern writes `qa: newInstallQa()` (`features: []`) with the row (`editSite.jsx`).
  - The card reads "Tickets" (`patterns/index.js`; default name and URL still "QA").
- **Found and fixed on the way:**
  - **A switch-wiping write.** `installQa` and the datasets card's "finish set-up" both replaced the row's whole
    `qa` key with `{version, datasets}`; re-running set-up would have dropped `features` and turned Delivery QA
    back on. Both now carry the rest of `qa` along.
  - **Static-only Cards vanish over an empty dataset** (`Card.jsx` draws one card per row; the wrapper fetches
    ids even for static cells, `getData.js` ~454). The Overview's crumb, title, no-sites note and "needs set-up"
    note read the pages dataset, so a fresh install with no tracked pages showed none of them. They now read the
    tickets dataset with a hidden `count(*)` (`ONE_ROW`), which always returns one row.
  - **A ticket's page name** (`PAGE_DISP`): the tracked page's live name, then the name the ticket was filed with,
    then the raw key. Refines the derived-values step (`8be023e9`, 2026-10-02, "read live, not the ticket's
    copies"): live still wins; the copy only replaces the raw key when no page matches (normal without a page
    inventory; Report an issue sets it). `page_stage` is still never read. `qaDerivedValues` updated to match.
  - **Configure's save bar never cleared after a Save** that wrote the row: the tab compared its draft with the
    reloaded `value`, which carries a restamped `updated_at`. It now compares with the row as it last saved it
    (`baseline`: the loaded row, then each Save's draft); reset returns to it.
  - **The Edit modal's Add Pattern** (`components/patternList.jsx`, the second `addNewValue`) also creates QA
    installs; it now starts them with `newInstallQa()` too.
  - The shared Switch has no disabled look and no accessible name without `label`; the switches card passes
    `label` and dims a blocked switch through its own theme keys (`featureSwitchBlocked`), with no change to the
    Switch itself.
- **Tests:** `qaFeatures.test.js` (33: the switch logic; what each switch removes from each page; the one-row
  Cards; track-on-publish's skip; `saveConfigure`'s two options; `installQa` keeping `features` through both of
  its writes, with an in-memory falcor). QA suite 203/203. Full client suite 935/940: the 3 known failures plus
  2 in `userMenus.test.js` (`adminNavOptions`), which fail the same with these changes stashed (from the user
  menu editor commit, `4b37b57a`, or later).
- **Live check (2026-10-13), scratch install 219 "QA switches"** (`/qa_switches`, app `qa_test`), probes
  `scratchpad/qa_test/probes/switches_{create,fresh,configure,pages,legacy}.mjs`:
  - Add Pattern shows the "Tickets" card; the new row is `qa.features: []`, and `installQa`'s writes after each
    dataset kept it on the real server (`{"qa":{"version":1,"features":[],"datasets":…}}` in the log).
  - Fresh, nothing on: the Overview's crumb, title (2/3 wide), ticket figures and "No sites covered yet … Its pages
    then show Report an issue." all show; no page figures or stages; `/qa_switches/page?key=…` lands on the
    Overview; Tickets renders.
  - Configure: "0 of 3 on"; Page stages and Stories dimmed with "needs Page inventory". Covering Pages (pattern
    3) saved with no pages added. `dms page publish` of scratch page 231 added no row (inventory off).
  - Delivery QA on: save bar "Delivery QA switched on"; the row stores all three; the Save backfilled the covered
    site's published pages (`pages:page_1`, `pages:switches_test_page`). A CLI publish of scratch page 239 then
    added its row (`qa_tracked` in the CLI output). The save bar cleared after Save (after the `baseline` fix).
  - Page stages off: `['page_inventory','stories']`, "2 of 3 on"; the Overview has no "How delivery works", no
    client-accepted figure, no stage bar or Stage column, "pages · 2 pages", still collapsible; Page QA's rail
    opens with "Page status" and no stage list; the Ticket page keeps "open page" and the Page QA link, no meter.
  - Delivery QA off (from 2 of 3, so the bar lists "Page inventory switched off, Stories switched off"): the
    Overview's Pages card is its name beside its tickets bar, not collapsible, "1 site covered"; the Ticket
    page's target is text, with no "open page"; the Tickets table's Page column reads "Switches test page".
  - Install 126 (no list): Overview unchanged (stages, "pages tracked 3", "client accepted 0", AlphaPage's stage
    bar); Configure shows all four switches on and "All changes saved".
  - **Left on `qa_test` for review:** install 219 (datasets: tickets 220, pages 222, stories 224, covered sites
    226, history 228), ticket rows 236 (#101) and 245 (#102, from the fields check), scratch pages 231 and 239 in
    Pages (pattern 3).
    Site row backup before Add Pattern: `scratchpad/qa_test/backup_site_1_20261013T144810.json`. To remove:
    delete the pattern from `/list` (or `dms raw delete` 219 and drop it from site row 1's `patterns`), delete
    its five datasets in the Datasets admin, and `dms raw delete` pages 231 and 239.

**Step 2: custom statuses and fields (shared core; similar work, owner 2026-10-13). Fields first (owner,
2026-10-13), then the lists. Plans proposed 2026-10-13, awaiting the owner's go.**

**2a. Custom ticket fields (first).**
- **What an admin sees:** a "ticket fields" card on Configure, under the ticket record card. "+ add field"; each
  row has a label, a type, its options (pick one), where it shows (form · details · table · filter), "required on
  the form", a drag handle and remove. The tab's one Save writes it all.
- **Types (v1):** text, long text, number, date, pick one. Not in v1: pick many (filters and history on lists need
  more), yes/no, a person picker, fields that depend on another field, per-group visibility.
- **Where a field lands:**
  - form: Report an issue (after the description; a required one blocks Send) and Page QA's New ticket;
  - details: the Ticket page's Details panel, after Effort, edited in place (pick one as a pill menu like
    Category; date, number and text as inputs);
  - table: a Tickets column, before Updated;
  - filter: a chip on the Tickets filter bar, with its own URL parameter (pick one and text);
  - always: Recent activity and the ticket's History show its changes under its label (tracked by default); the
    Datasets admin and the CLI see the column.
- **Stored:** `qa.fields` on the install row (`[{name, label, type, options, show: {form, details, table,
  filter}, required}]`). Save also appends the column to the tickets dataset's columns and to its change
  history's tracked list. The server's stub for ungranted users carries the form's fields (`qa.intake.fields`), a
  small dms-server change that ships with MNY's deploy.
- **Rules:**
  - the name comes from the label (lowercase, underscores), can't clash with a ticket column or a URL parameter,
    and is fixed once saved (the dataset column carries it); the label can change any time;
  - the type is fixed once any ticket holds a value; options can be added and reordered, and one tickets hold
    can't be removed (it shows "in use");
  - removing a field hides it from the QA pages; the column and its values stay, and adding a field with the same
    name brings them back (as switches: off hides, never deletes);
  - fields are shared core: no switch.
- **MNY's, after (prod writes, the owner's go):** requester type (pick one: county / town / consultant / state),
  hours (number), channel (pick one: form / phone / email / office hours), received (date).
- **Steps:**
  1. `patterns/qa/fields.js`: the model (type → dataset column, the Card column for each place, the form's
     input), the name rules, the in-use checks; tests.
  2. The Configure card and its Save writes (row, tickets columns, history's tracked list); tests.
  3. The pages: Details, table, filter chips, the activity and History labels; tests.
  4. Report an issue and Page QA's New ticket, and the stub's form fields; client and dms-server tests.
  5. Live check on scratch install 219 with MNY's four fields.

- **Built and live-checked (2026-10-13, owner's go), committed (`73d28b0e`):**
  - `patterns/qa/fields.js` (new): types, places, the reserved names (the ticket record's columns and the QA
    pages' URL keys), `installFields`, `fieldColumn`, `fieldErrors`, `describeFieldEdits`, `fieldValuesInUse`,
    `planFieldColumns`, and Configure's row helpers (`settledFields`, `rowName`, `withType`).
  - `install.js` `writeQaFieldColumns`: reads the tickets source fresh and applies `planFieldColumns`; Configure's
    Save runs it before writing the row.
  - Pages (`ctx.fields`): Details rows after Effort (`ticket.js`); table columns before Updated, filter chips,
    their table filters and URL variables (`tickets.js`); History and Recent activity labels
    (`ticketFieldLabel(data, fields)`), and a pick list's values as pills in the feed with the record's own colours
    winning a clash (`overview.js`); Page QA's New ticket asks the form fields (`pageQa.js`; this staff form
    doesn't hold back a required one: the Card's create form has no required check).
  - Report an issue: `intakeFields(install)` (full settings, else the stub's), `missingRequired`, `reportRow`'s
    `fields`/`values`; the form renders text, long text, number and date as inputs and a pick list as a select,
    "(required)" in the label.
  - dms-server `qaIntake`: the stub carries the form's fields, trimmed to name, label, type, options, required.
    `tests/test-pattern-stub.js` 31/31.
  - Configure: the "ticket fields" card, between the ticket record and the covered sites. A new row's name follows
    its label until saved; the options line is kept as typed (`_optionsText`) and settled on Save; the type shows
    "· in use" and can't change once tickets hold values; errors per row block Save; drag to reorder.
  - Tests: `qaFields.test.js` (27). QA suite 230/230; full client suite 962/967 (the same 5 as step 1: 3 known,
    2 `userMenus`); dms-server `npm test` exit 0, `test-pattern-stub.js` 31/31.
  - **Live check** on scratch install 219, probes `scratchpad/qa_test/probes/fields_{configure,ticket,report}.mjs`:
    - Configure: four MNY-style fields added through the card (Requester type: pick one, county / town /
      consultant / state, required, table + filter; Hours: number, not on the form, table; Channel: pick one,
      not on the form, filter; Received: date, table). Save bar "4 unsaved changes · Requester type added, Hours
      added, Channel added, Received added", then "saved". The row holds `qa.fields`; tickets source 220 gained
      `requester_type` (select + options), `hours` (number), `channel` (select), `received` (date), and its
      change history tracks all four.
    - Ticket #101 (row 236), Details: Requester type set through its pill menu, Hours and Received typed; after a
      reload the History reads "Requester type — → county", "Hours — → 2.5", "Received — → 2026-10-12", and
      Recent activity lists the same three under their labels.
    - Tickets: the row shows "county · 2.5 · 10/12/2026"; the Requester type and Channel chips are on the bar;
      `?requester_type=county` lists #101, `?requester_type=town` shows "No tickets match these filters".
    - Report an issue (on pattern 3, given AlphaPage's widget nav for the check and then restored): the form
      asks "Requester type (required)" and "Received", not Hours or Channel; Send stays off until Requester
      type is picked; the report filed ticket #102 (row 245) with `requester_type: county`, `received:
      2026-10-11`, and its create wrote history rows for both. Pattern 3 is back to its backup
      (`scratchpad/qa_test/backup_pattern_3_20261013T153556.json`) with `theme: {}` (it had none).
    - Cosmetic: a long label ("Requester type") wraps to two lines in Details' 30% label column.

**2b. Editable lists (after the fields).** The plan below; the fields' option editor is the piece the lists
reuse.
- **Where it's edited:** the ticket record card on Configure (today read-only, "set in code for now") becomes the
  editor, saved by the tab's one Save.
- **Where it's stored:** on the install row (`qa.statuses` as `[{value, kind}]`, `qa.outcomes`,
  `qa.categories`), mirrored onto the tickets dataset's column options so the Datasets admin and the CLI show the
  same values. A missing list reads as today's (TransportNY's seven statuses, the seven outcomes, the five
  categories), so 126, 170 and 2824062 change nothing. Rejected: the column options as the only copy; the pages
  (built from the row) and the server's stub would each need an extra read of the tickets source.
- **Which lists:** statuses (each with a kind), outcomes, categories. Staying in code: severity (it drives the
  severity weighting, its own colours, the "open by severity" rows and the reporter's wording on the form),
  priority (three fixed colours), page stages (Delivery QA's; they drive the stage colours and roles).
- **Values in use:** a value tickets hold can't be renamed or removed; it shows "in use", as a covered site's
  short key does once used. Adding, reordering and changing a status's kind are free. Renaming in use (a bulk
  update of tickets) is later.
- **What follows the statuses:** open/closed counts and the Open/Closed shortcuts (by kind); the status pills
  (colour by kind; TransportNY's In review keeps its half-filled look); the rail's status menu; resolved-date
  stamping (done and canceled kinds); "Where tickets stand" (a step per triage and active status, then done, then
  waiting); the Recent activity pills.
- **New tickets** start at the install's first triage-kind status (Report an issue, Page QA's New ticket). The
  stub for ungranted users must carry it: add it to `intake.js`'s `public.qaIntake`. Since the 2026-10-14 move
  that needs no server change; the plan before was a server-built `qa.intake.status`.

- [ ] 2a custom ticket fields (above).
- [ ] 2b editable lists (statuses, outcomes, categories).

**Step 3: the Help desk group's first switches.**
- [ ] **Staff intake ("file for someone").** A staff form where the reporter isn't the signed-in user, for requests
  that came in another way.
- [ ] **Clocks (response-time targets).** Standard in every help desk the research surveyed (Zendesk, Freshdesk,
  Jira Service Management, Zammad, osTicket, Help Scout, YouTrack Helpdesk, Linear Business), rare in plain issue
  trackers ([`industry-research.md`](../../../../../research/qa-ticketing-system/industry-research.md) §2 and
  TL;DR #3).
  - **Shape** (research TL;DR #3): start, pause and stop conditions read from the event log against a business
    calendar, never from a status column's current value. YouTrack stores the outcomes as ordinary ticket fields
    so dashboards can query them.
  - **Not on the December path.** The part that couldn't wait, the event log, is the change history, already
    built. A clock computed from it covers every past ticket whenever it lands. Until then, MNY's quarterly script
    computes the on-time number from the history (below).
- Later, only if a decision below needs them: requester messages and notifications (if an acknowledgment must
  reach the requester), a "my requests" view, CSAT, quarter-end snapshots, time entries.

**Before outside users (shared core):** a permission check on reads of internal datasets (reporter emails are
readable through `uda` today) and a guard on `dms.data.create` (Defect E in
[`auth-permission-chain-and-unguarded-writes.md`](./auth-permission-chain-and-unguarded-writes.md)). This is also
what lets the history count as proof. Already queued in §3: a serial `ticket_number`, the install lockout fix,
signed-out filing.

**MitigateNY's settings and theme code** (no core edits; each is a prod write on MitigateNY, so each waits for the
owner's go):
- Switches: Help desk on, Delivery QA off.
- Statuses: New → Acknowledged → Triaged → Resolved → Closed, each with a kind. Outcomes: Fix, Workaround,
  Backlog, Out of scope (all four exist in today's list).
- Fields: requester type (county / town / consultant / state), hours, channel (form / phone / email / office
  hours), `received_at`.
- County = the covered site the ticket came from (owner, 2026-10-13): each county deployment is its own pattern,
  and the Site filter already groups by it. No new column.
  - The one gap: 566466 admin and 2265530 MitigateNY_actions serve every county's subdomain, so their tickets
    group under those patterns. The page's full URL is in each ticket's `env`, so a report can read the county
    from it if that matters.
  - Assumed, not confirmed with DHSES: that the contract's "county" means the county site it came from, not, say,
    the county a consultant on the main site is asking about.
- The acknowledgment clock: start `received_at` (else the filed time), stop when the status leaves New, target 2
  business days (the SOW draft writes ⟨2⟩), the NYS holidays as calendar rows.

**MitigateNY's needs outside the pattern:**
- The DHSES dashboard (open and closed tickets by county, category and age, exportable): authored pages on MNY's
  site over the tickets dataset. Sections already download their data (`dataWrapper/index.jsx` `triggerDownload`).
  Needs the read check above before DHSES users get access.
- The quarterly report queries: scripts in `src/themes/mny/scripts/`, or authored pages. Includes the on-time
  acknowledgment number, read from the change history (when the status first left New, against business days),
  until core clocks exist.
- The Feb–Dec 2026 backfill: a one-time import script in `src/themes/mny/scripts/`. Those tickets have no system
  times; mark them as imported and report them separately.
- Not software: office hours (two 90-minute sessions a month, plus the announcement to counties), the ⟨40⟩ hours a
  month support cap across all support work, change-control records for out-of-scope requests, the DHSES
  walkthrough. Requests taken at office hours are filed through staff intake.

**Open decisions (owner first, then DHSES):**
- What counts as an acknowledgment: a staff status change, or a message the county receives (that needs
  notifications).
- The business-day rule. Suggested: due at the end of the second business day after the day it's received,
  Eastern time, rather than exactly 48 business hours.
- The target itself (⟨2⟩ in the SOW draft).

**Time-sensitive:** history can't be rebuilt after the fact, so the dms-server deploy and "finish set-up" on 2824062
must come before MNY's first real ticket (§1).

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
- [ ] Found building Recent activity (2026-10-09), worked around in QA, not fixed:
  - `status_pill` ignores the cell's justify (it returns the bare Pill; `verdict_dot` wraps itself in the
    cell's className). A right-aligned pill isn't possible; fixing it touches every status pill.
  - A Card can't change its cards-across with its width (`cardsGridSize` is an inline template; compact layout
    covers cells only). An optional `cardsMinWidth` (auto-fill tracks) would do it with today's output unchanged.
  - A Card has no empty-state text (Spreadsheet's `emptyRowText`); QA shows a count line instead.
  - `filter_control`'s option query can't resolve an alias-prefixed name (`t.surface`) under a join
    (`formattedAttributeStr` has no alias handling), and it ignores static filters on its own column.
  - dms-server UDA `sanitizeName` drops a whole SELECT expression that contains a SQL keyword as a word, even
    inside a string literal (`= 'create'`), with no error (also in memory as a known landmine).
- [x] **QA's weight utilities never applied: FIXED 2026-10-09 (owner: "fix it across the board for QA").** Every
  `.t-*` class sets its own font-weight unlayered (`ui/defaultTheme.js` ~150-167), so a `font-medium` beside one
  computed to 400. All nine such strings now use `!font-*`: `qa.theme.js` (`qaBodyStrong`, `qaButton`,
  `qaButtonPrimary`, `qaLink`, the severity pill base, the form's Add button, the table's empty row, one title)
  and `admin/.../qa/configureTab.theme.js` (`patternName`). A note at the top of `qaTextStyles` states the rule.
  Live (`scratchpad/qa_test/probes/qa_weights.mjs`): Overview 10× 600 + 2× 500, Tickets 20× 500, none off.
- [ ] **A ticket on an untracked page key counts in its site's header but shows under no page** (found
  2026-10-09: test ticket #210 had `alphapage:alphapage`; the site bar said 4 open, the pages table showed 3).
  Happens for a renamed slug or a page that was never tracked. Options: an "untracked page" row in the site's
  table, or count only tracked pages' tickets in the bar. Not decided.
- [ ] **A new dataset's first reads race to create its table** (found 2026-10-13, a fresh install's Overview).
  `ensureTable` (`dms-server/src/db/table-resolver.js` ~358) checks its cache, then runs `CREATE TABLE IF NOT
  EXISTS`; the UDA read path calls it (`routes/uda/utils.js` ~200), so several sections reading a never-written
  dataset at once run it together, and Postgres refuses all but one (`duplicate key value violates unique
  constraint "pg_type_typname_nsp_index"`). Those sections show blank until a reload. Fix: share the in-flight
  promise per table, or treat that error as "exists".
- [ ] A plain `Check` icon is missing from the library set. Adding it changes the Spreadsheet's add-row button,
  which shows a fallback shield today.
- [ ] Route auth judges the placeholder user while sign-in loads. QA works around it:
  [`route-auth-check-judges-placeholder-user.md`](./route-auth-check-judges-placeholder-user.md).
- [ ] After a sign-in without a refresh, `/qa` shows "isn't set up yet": the routes keep the signed-out boot's
  pattern stub. Logged, not scheduled: [`routes-keep-pre-login-pattern-stubs.md`](./routes-keep-pre-login-pattern-stubs.md).
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
  - text fields commit on blur (replaced 2026-10-08 by the server's 30 s burst merge);
  - story status gets tracked with the history writer.
- **2026-10-02:**
  - Configure is a tab on the install's own `manage_pattern` page;
  - every pattern type but `admin` and `qa` can be covered;
  - new rows name their pattern by instance;
  - the short key locks once used;
  - one Save for the tab;
  - feature switches come later (replaced 2026-10-13: they come first).
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
- **2026-10-08:**
  - the change history is written by the server, inside the row save, from a `change_history` setting on the
    dataset (not a section column option);
  - `columns: '*'` tracks every declared column, with an `exclude` list;
  - typing bursts merge on the server (30 s), instead of text fields committing on blur;
  - the setting gets a panel on the datasets source Admin tab;
  - the panel offers no existing datasets: a dataset gets its own "*<dataset> history*", shared histories
    are set up in code or with the CLI, and no server route lists history datasets.
- **2026-10-09:**
  - the Overview's Recent activity reads the change history, including "Filed": creates write history rows;
  - each activity row shows the change, old → new status pills, one row per change, full width (replacing the
    first take: the new status as the verb, two across);
  - the activity lists every tracked ticket field, the ticket first and bold; no column headers;
  - history rows record `op` ('create' | 'edit');
  - every Overview figure counts only the install's covered sites;
  - QA's weight utilities get `!` across the board;
  - the activity keeps to the install's covered sites;
  - the feed gets filters (site, page, category, status);
  - history growth gets its own task;
  - the history write is off by default per call (`changeHistory: false`); the Falcor create/edit routes opt in.

- **2026-10-13:**
  - an install defines its own statuses, each mapped to a fixed kind; TransportNY's seven are the default
    (replaces "the ticket record's lists live in code" for statuses);
  - MNY's specifics (its statuses, fields, `received_at`, clock settings) are install settings and MNY theme code
    on top of generic core pieces, not changes to core;
  - no subdomain column: a ticket's county is the covered site it came from, since each county deployment is its
    own pattern;
  - one `qa` pattern type serves Delivery QA and Help desk as two switch groups over a shared tickets core, not two
    pattern types;
  - the Add Pattern picker stays as it is apart from the card's name, "Tickets"; the switches live on the install's
    Configure tab, and a group's switch does a preset's job;
  - the order: switches, then custom statuses and fields, then the Help desk switches.

## Where the history went

Code comments and other docs cite sections of this doc and of the two merged docs. All are in the archive:

| Cited as | Archive |
|---|---|
| this doc, "Design pass", "Phase 1" … "Phase 5", "Phases 6–7", "The status-change writes" | part 1 |
| `qa-design-implementation.md` (incl. "Rules carried in", step 4) | part 2 |
| `qa-mny-look-and-collapsible-sites.md` | part 3 |

> **2026-10-13** (qa_pattern_type_secondary): initiatives set to dms_qa_ticketing, mny_sow_deliverables.
