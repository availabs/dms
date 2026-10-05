# QA pages: implement the design pass

**Initiatives:** [dms_qa_ticketing](../../../../../planning/initiatives/dms_qa_ticketing.md) · **Status:** next · **Created by:** rdubowsky@albany.edu · **Edited by:** —

Turn the approved mockups into the live QA pages. The design pass itself (decisions, findings, review rounds) is
recorded in [`qa-pattern-type.md`](./qa-pattern-type.md), section "Design pass". This file is the build plan and,
once work starts, its status.

## What to build from

- **Mockups (the spec):** `dms-template/src/themes/tessera/design_system_v6/pages/` —
  `qa-overview.html`, `qa-tickets.html`, `qa-ticket.html`, `qa-page.html`, `qa-configure.html`,
  `qa-report-issue.html`. Serve the folder (`python3 -m http.server` in `design_system_v6/`) and open
  `/pages/qa-overview.html`; the dark review bar switches pages, states, skin and the **DMS map**.
- **The map is the conversion key.** Every element carries `data-map` (what it becomes) and `data-map-kind`:
  `reuse` (existing piece, unchanged), `qa` (new QA-only named style), `core` (small library change, step 1),
  `planned` (placeholder only), `host` (the site's own layout, not QA). Class strings on the elements are the values
  the QA-only styles take.
- **Tokens:** `pages/_qa.css` section 1 (`--qa-sev-*`, `--qa-kind-*`, `--qa-prio-*`, `--qa-stage-*`,
  `--qa-story-*`, `--qa-tix-*`), each defined from a Tessera base variable.
- **Review artifact** (cover + mockups, owner's copy): https://claude.ai/artifact/DJR2Cx44MEjVj35QtrLW74.
- **Skill:** `skills/transcribing-a-design-card-to-dms.md` for the `/qa` pages (Card sections defined in
  `patterns/qa/pages/*.js`). Configure is a React tab, converted by editing its JSX (step 4).

## Rules carried in (owner)

- **Theme keys are QA-only** unless an existing key is reused with no change. QA styles are named styles that only
  QA sections pick (`cardStyle`, `filterStyle`, `tableStyle`, a column's `activeStyle`, `pillColors`).
- **Core changes keep every other site unchanged:** each new key defaults to today's output. Prove it with a
  repo-wide grep of consumers before calling it safe, and land each one on its own (not bundled with QA styling).
- Never edit TransportNY's own files (`src/themes/transportny/`); TransportNY is handled ad hoc.
- The owner commits; leave changes uncommitted. Placeholders (comments box, history, recent activity, feature
  switches) stay placeholders.

## Decisions already made (2026-10-05)

- Style source: Tessera `design_system_v6` (v6.7). Status menu: a flat list with kind markers (grouping by kind
  later). Report button placement: the theme (a `ReportIssue` widget in the nav slots, or a floating option).
  Ideas keep severity Feature for now. The "How delivery works" captions ship as the library's default wording and
  become install-editable later. The `radio` column type gets made themable.

## Steps

### 1. Core enrichments (library, each isolated)

Who: the implementer, one change at a time, each with its own consumer grep and check.

- [ ] **Card `editField` key.** `ui/components/Card.jsx:376` hard-codes `${editMode ? 'border' : ''}` on every edit
  component (Tailwind 4 colours a bare border with the text colour: today's black box). Add a `dataCard` style key
  `editField`, default `'border'`, read there. QA's styles set the borderless look from the mockups
  (`bg-transparent border border-transparent rounded-md px-2 py-1 hover:bg-well focus:…`, plus
  `[field-sizing:content]` on textareas).
- [ ] **`radio` column type themable.** `ui/columnTypes/radio.jsx` uses a local `theme` constant. Read it from
  ThemeContext with named styles selected by the column's `activeStyle`, defaults equal to today's classes, plus an
  optional per-option marker. Unlocks the stage picker (`qa_steps`) and the severity chips (`qa_choice`).
- [ ] **`stage_progress` compact variant + theme keys.** Today it renders 20px dots with inline hex. Add a compact
  meter variant (six small segments) and take colours from theme keys / CSS variables so `--qa-stage-*` apply.
- [ ] **Small column types** `kv_chips` (the env JSON as label/value chips) and `comment_thread` (the comments JSON
  as a thread). Read-only.
- [ ] **BarGraph time axis repeats day labels** (Tickets "Done per day" prints each day twice). Bug fix, separate.
- Later, not in this task: option groups in the shared select (status menu grouped by kind).

### 2. QA tokens and QA-only named styles

Who: the implementer, in the library default theme.

- [ ] `--qa-*` variables into the inline CSS block in `ui/defaultTheme.js` (beside `--t-*`, ~lines 49–160), dark
  values following from the base variables they derive from.
- [ ] Named styles (values from the mockups' class strings):
  `dataCard`: `qa_header`, `qa_body`, `qa_rail`, `qa_summary`, `qa_form` ·
  `pill`: `qa_sev_*`, `qa_status_*` (by kind), `qa_prio_*`, `qa_story_*` ·
  `multiselect`: `qa_inline` · `filters`: `qa_chips` (after TransportNY's `chip`), `qa_search` ·
  `table`: `qa_list` (incl. its empty row) · `radio`: `qa_steps`, `qa_choice`.
- [ ] `helpers.js`: pill maps point at the `qa_*` pill styles; `STAGE_HEX` gives way to `var(--qa-stage-*)`.

### 3. Page conversions (`patterns/qa/pages/*.js`)

Who: the owner with the transcription skill, or Claude; one page at a time, screenshot against its mockup.

- [ ] **Tickets** (`tickets.js`): header Card with count + add ticket; one summary Card (status strip + a Waiting
  step + resolved / open-by-severity / found-by); compact charts; filter row = All/Open/Closed link cells
  (`activeOnSearchParam` + `cellActive`), a `like` search on title, four chip filters; table on `qa_list`, reporter
  column dropped, empty row.
- [ ] **Ticket** (`ticket.js`): one header Card (crumb, badges, title at display size, target + stage meter, open
  page link); body textareas with per-column `placeholder`s, expected | actual side by side; rail rows grouped
  (workflow, links, verification, record), read-only rows `editable: false`, dates `formatFn: 'datetime'`;
  comments via `comment_thread`; history placeholder.
- [ ] **Overview** (`overview.js`): header figures; "How delivery works" (flow_step cells + caption cells, default
  wording); one group per site (title + stage/ticket `stacked_bar`s + pages table with stage meter and blocker
  tile); "no sites yet" and "not set up" states; recent-activity placeholder.
- [ ] **Page QA** (`pageQa.js`): header (crumb with site, description, add ticket, open page); stories with
  "n of 3 verified"; tickets on `qa_list`; rail = stage picker (`radio` · `qa_steps`), facts, work completed; New
  ticket modal on `qa_form` with severity as `radio` · `qa_choice`.

### 4. Configure (React tab)

Who: the implementer. Files: `patterns/admin/pages/patternEditor/qa/configureTab.jsx`, `configureTab.theme.js`
(`admin.qaConfigure`, QA-only), and `QaPatternSettings` in `patternEditor/default/settings.jsx` (datasets card).

- [ ] Covered sites: switched-off rows collapse to one line; a key in use shows as locked text; drag to reorder
  (`UI.DndList`) instead of the order number; "every page" as a picker button.
- [ ] Datasets: one row per dataset with name and row count; missing ones say so, with "finish set-up".
- [ ] Save bar: quiet when saved, names the edits and sticks to the top when dirty.
- [ ] Ticket record: real markers for statuses, outcomes and stages; a dashed "features" placeholder.

### 5. Report an issue

Phase 6 of `qa-pattern-type.md`, not this task. `qa-report-issue.html` is its design reference (drawer, questions,
captured context, signed-out fields, sent state, `ReportIssue` widget placed by the theme).

## Verification

- Each converted page: probe screenshot next to its mockup (`report_probe.mjs` with
  `--auth scratchpad/npmrds-sub/.dms-auth-token-qa_test`; mint with `mint_token.sh qa_test`), light and dark.
  The probe does not render `/list/manage_pattern/…` (blank content); check Configure in a browser.
- Each core change: a grep of every consumer, plus a before/after check on one non-QA page that uses it.
- No live page outside QA changes look.
