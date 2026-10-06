# QA pages: implement the design pass

**Initiatives:** [dms_qa_ticketing](../../../../../planning/initiatives/dms_qa_ticketing.md) · **Status:** doing · **Created by:** rdubowsky@albany.edu · **Edited by:** —

Turn the approved mockups into the live QA pages. The design pass itself (decisions, findings, review rounds) is
recorded in [`qa-pattern-type.md`](./qa-pattern-type.md), section "Design pass". This file is the build plan and,
once work starts, its status.

**▶ Start here (2026-10-06).** Steps 1–3 are DONE and committed by the owner (`1667bdad`, 2026-10-06): the five
core enrichments, step 2's tokens + pills, and step 3's **Tickets**, **Ticket**, **Overview** and **Page QA**
pages. The owner then gated the QA type behind `VITE_DMS_QA_PATTERN` (`QA_PATTERN_ENABLED` in `patterns/qa/install.js`;
`3945d00b`). **Step 4 (Configure) BUILT and live-checked 2026-10-06, uncommitted** for the owner; see its
section for what was checked and two things found outside it. Next: the owner's pick (step 5 is phase 6's). Pattern per page: add its named styles to `patterns/qa/qa.theme.js`, use `QT` text keys and
`PANEL*` frames, probe-screenshot light + dark (`scratchpad/qa_test/design-impl/mockshot.mjs` shoots a mockup;
`report_probe.mjs --eval` for live clicks), update the QA tests that pin the old structure. Core files touched (land separately from QA styling): `Card.jsx`,
`card.theme.jsx`, `columnTypes/{radio,stage_progress,kv_chips,comment_thread}.*`, `structuredText.utils.js`,
`columnTypes/index.jsx`, `avl-graph/{BarGraph.jsx,utils/index.js}`, the four theme registrations in
`ui/defaultTheme.js`. QA-only files: `patterns/qa/{qa.theme.js,siteConfig.jsx}`, `patterns/qa/pages/{helpers.js,
view.jsx}`.

## What to build from

- **Mockups (the spec):** `dms-template/src/themes/tessera/design_system_v6/pages/` —
  `qa-overview.html`, `qa-tickets.html`, `qa-ticket.html`, `qa-page.html`, `qa-configure.html`,
  `qa-report-issue.html`. Serve the folder (`python3 -m http.server` in `design_system_v6/`) and open
  `/pages/qa-overview.html`; the dark review bar switches pages, states, skin and the **DMS map**.
- **The map is the conversion key.** Every element carries `data-map` (what it becomes) and `data-map-kind`:
  `reuse` (existing piece, unchanged), `qa` (new QA-only named style), `core` (small library change, step 1),
  `planned` (placeholder only), `host` (the site's own layout, not QA). Class strings on the elements are the values
  the QA-only styles take, **translated**: the mockups use Tailwind-config aliases (`bg-panel`, `text-pencil`,
  `border-rule`, `text-sevBlocker`, `shadow-lift`), the library writes the variable directly
  (`bg-[var(--t-panel)]`, `text-[var(--t-pencil)]`, `border-[var(--t-rule)]`, `text-[var(--qa-sev-blocker)]`,
  `shadow-[var(--t-shadow-lift)]`), as `card.theme.jsx` and `Pill.theme.js` already do. The alias table is the
  `tailwind.config` block at the top of each `qa-*.html`.
- **Tokens:** `pages/_qa.css` section 1 (`--qa-sev-*`, `--qa-kind-*`, `--qa-prio-*`, `--qa-stage-*`,
  `--qa-story-*`, `--qa-tix-*`), each defined from a Tessera base variable.
- **Review artifact** (cover + mockups, owner's copy): https://claude.ai/artifact/DJR2Cx44MEjVj35QtrLW74.
- **Skill:** `skills/transcribing-a-design-card-to-dms.md` for the `/qa` pages (Card sections defined in
  `patterns/qa/pages/*.js`). Configure is a React tab, converted by editing its JSX (step 4).

## Rules carried in (owner)

- **Theme keys are QA-only** unless an existing key is reused with no change. QA styles are named styles that only
  QA sections pick (`cardStyle`, `filterStyle`, `tableStyle`, a column's `activeStyle`, `pillColors`).
- **Tokens: QA-only by default, shared where the look is shared (owner, 2026-10-05).** Keeps the blast radius of QA
  styling small without letting QA drift from the rest of its theme:
  - **QA-only** (`--qa-*` variables, `qa_*` named styles): anything that only means something in QA. Severity,
    status kind, priority, page stage, story status, the tickets bars; QA's card, table, filter and form shapes.
  - **Reuse the existing token or key** wherever a QA element is meant to look the same as a shared one: surfaces,
    text colours, rules and shadows (`--t-*`), the type scale (`textSettings` keys / `.t-*` classes), buttons,
    inputs, the default pill and table looks. A theme edit to that shared token then moves QA with it; a QA copy of
    it would be left behind and the two would stop matching.
  - **No copied literals.** A QA token whose value equals a shared one is defined as `var(--t-…)` (as every
    `--qa-*` in `_qa.css` already is), or isn't created at all. A QA named style references `var(--t-…)` for its
    surface/text/rule and `var(--qa-…)` only for the QA meaning.
  - Where to put them: the `--qa-*` variables go in their own `fonts` entry (`{ type: 'style', id: 'dms-qa-tokens' }`)
    in `ui/defaultTheme.js`, after `dms-default-tokens`, not inside it. Theme `fonts` arrays concatenate across
    themes (`useTheme.js` ~133), so it reaches every site the way `--t-*` does, and a host theme can re-declare
    `--qa-*` in its own block. Dark mode needs no second copy: `ThemeToggle` sets `data-theme` on `<html>`, so
    `:root`'s `var(--t-…)` references resolve against the dark values.
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

### 1. Core enrichments (library, each isolated) — DONE 2026-10-05

Five changes, each with its own consumer grep and test; uncommitted for the owner. Client suite after all five: 758
pass, 3 fail (`avlGraphThemeDefaults`, `syncDeltaConvergence`), the same 3 that fail with the changes stashed.

Who: the implementer, one change at a time, each with its own consumer grep and check.

- [x] **Card `editField` key.** BUILT 2026-10-05: `card.theme.jsx` default style `editField: 'border'`; `Card.jsx`
  `CompWrapper` takes `editFieldClassName` (passed `theme.editField` at its four call sites) and falls back to
  `'border'`. Consumer grep: no theme, page or scratchpad file defined `editField` before, and `getComponentTheme`
  gives every named style `styles[0]`'s keys, so every non-QA Card renders the same class string. Plan text kept: `ui/components/Card.jsx:376` hard-codes `${editMode ? 'border' : ''}` on every edit
  component (Tailwind 4 colours a bare border with the text colour: today's black box). Add a `dataCard` style key
  `editField`, default `'border'`, read there. QA's styles set the borderless look from the mockups
  (`bg-transparent border border-transparent rounded-md px-2 py-1 hover:bg-well focus:…`, plus
  `[field-sizing:content]` on textareas).
- [x] **`radio` column type themable.** BUILT 2026-10-05. New `ui/columnTypes/radio.theme.js` (`radioTheme`,
  registered as `theme.radio` in `ui/defaultTheme.js`); `radio.jsx` reads
  `getComponentTheme(theme, 'radio', activeStyle)`. `styles[0]` holds the old hard-coded classes (plus `listRow` /
  `listCol`, moved out of the markup). Optional keys a named style can add, all absent from the default: `*Checked`,
  `marker` + `markers` (`{value: classes}`), `ordered` (done / upcoming states, `*Done` / `*Upcoming`), `doneTick`,
  `tag` (for the column's `checkedTag` text), `viewAsList` (view mode shows the disabled list instead of the bare
  value). Consumer grep: no theme defined a `radio` key before. Two changes to the default's DOM, same classes and
  look: each option is now a `<label>` wrapping the input and a text `<span>` (was a `<div>` + `<label htmlFor>`), so
  the whole row is clickable; and option ids are scoped per list with `useId` (they were the bare option values, so
  two radio groups on one page shared ids and a label click could hit the other group). Test:
  `tests/radioTheme.test.jsx` (10 cases: default class strings unchanged, unknown style falls back, ordered states,
  markers, tick, tag, view list, unique ids). The full client suite: 727 pass; the 3 failures
  (`avlGraphThemeDefaults`, `syncDeltaConvergence`) fail the same with these changes stashed.
  - Found: there is no plain `Check` icon in the library set, so the radio draws its own tick (as `stage_progress`
    does). Not added to the set because `ui/components/table/index.jsx:255` already asks for `Check` and renders the
    fallback shield on any site whose theme lacks one; adding it would silently change that table. Separate fix.
  Plan text kept: `ui/columnTypes/radio.jsx` uses a local `theme` constant. Read it from
  ThemeContext with named styles selected by the column's `activeStyle`, defaults equal to today's classes, plus an
  optional per-option marker. Unlocks the stage picker (`qa_steps`) and the severity chips (`qa_choice`).
- [x] **`stage_progress` compact variant + theme keys.** BUILT 2026-10-05. New
  `ui/columnTypes/stage_progress.theme.js` (`stageProgressTheme`, registered as `theme.stageProgress`). `styles[0]` is
  empty, so a column with no style picked renders the original node bar byte-for-byte (TransportNY's control room
  and today's Page QA use it). A style with `variant: 'meter'` renders the compact meter from classes: `meter`,
  `segments`, `segment`, `segmentDone`, `segmentCurrent`, `segmentUpcoming`, `segmentColors` (`{stage: classes}`),
  `label`, `count`. The library ships a generic `meter` style on `--t-*` tokens (accent fill, rule track; the
  ticket header's look); QA's ramp (`--qa-stage-*` via `segmentColors`) is a step-2 style. Consumer grep: no theme
  defined `stageProgress`. Test: `tests/stageProgressTheme.test.jsx` (7 cases) against
  `tests/fixtures/stageProgressDotsGolden.json`, the HEAD component's output for the same cases. Plan text kept: Today it renders 20px dots with inline hex. Add a compact
  meter variant (six small segments) and take colours from theme keys / CSS variables so `--qa-stage-*` apply.
- [x] **Small column types** `kv_chips` (the env JSON as label/value chips) and `comment_thread` (the comments JSON
  as a thread). Read-only. BUILT 2026-10-05: `ui/columnTypes/kv_chips.jsx` + `.theme.js` (`theme.kvChips`),
  `comment_thread.jsx` + `.theme.js` (`theme.commentThread`), shared parsers in `structuredText.utils.js`, both
  registered in `columnTypes/index.jsx` and `ui/defaultTheme.js` (new keys; grep found no prior use). Default looks
  are on shared tokens (`--t-*`, `.t-metaSM` / `.t-proseSM`), since chips and a thread aren't QA-specific. Both read
  the JSON the QA fields are meant to hold **and plain text**: TransportNY's live `sitemgmt_tickets` (234 rows, 84
  with env, 195 with comments) hold `env` as `"1528×732 · <user agent>"` and `comments` as notes joined by `" · "`,
  which render as unlabeled chips / text-only comments. JSON comment keys read: author|by|user|email,
  date|at|created|created_at, text|body|comment|message. Column attributes: `emptyText` (both), `dateFormat`
  (comment_thread, a formatFn name, default `datetime`). Test: `tests/structuredTextColumns.test.jsx` (15 cases).
  - Found: the shared `datetime` / `date` formatFn (`dataWrapper/utils/utils.jsx` `formatDate`) prints
    "Invalid Date" for text it can't parse; `comment_thread` only formats parseable dates. The formatFn itself is
    unchanged (separate fix if wanted).
- [x] **BarGraph time axis repeats day labels** (Tickets "Done per day" prints each day twice). Bug fix, separate.
  FIXED 2026-10-05. Cause: for `xAxis.scaleType: 'time'` BarGraph hands `AxisBottom` type `"linear"`, which computes
  no tick values, so d3 ticks a short range every 3/6/12 hours and GraphComponent's day-level `m/dd` formatter
  prints each day several times. A second defect on the same path showed once ticks were day-aligned: a date-only
  `"2026-09-24"` was parsed by `new Date()` as UTC midnight, i.e. 8 pm the evening before in Eastern time, so every
  bar sat 4 hours left of its label. Fix (`avl-graph/utils/index.js` + `BarGraph.jsx`, time scale only):
  `toTimeValue` reads `YYYY-MM-DD` as local midnight; `timeAxisTickValues` returns d3's ticks untouched when their
  labels are already distinct, else keeps the local-midnight ticks (or, with none, the first tick of each label);
  an axis's own `tickValues` still wins. Blast radius: code grep finds `scaleType: 'time'` only in QA `tickets.js`
  and TransportNY's `build_cr_tickets.mjs`; a sweep of all 117 app schemas' component rows finds 14 stored time-axis
  sections, all in `dms_npmrdsv5` (the control room's ticket charts), all of which had the duplicate. Test:
  `tests/barGraphTimeAxis.test.js` (9 cases, pinned to America/New_York). Live (`/qa/tickets`, DOM-measured): Opened
  / day ticks 9/22…9/30 once each, Done / day 9/24…9/28 once each, every bar centre within 1px of its day's tick
  (bars on the 6 opened and 2 resolved dates in `qa_tickets`).
- Later, not in this task: option groups in the shared select (status menu grouped by kind).

### 2. QA tokens and QA-only named styles — tokens + pills DONE 2026-10-05; the rest moves into step 3

Who: the implementer, in the library default theme.

**Where they live (owner, 2026-10-05: keep them out of sites without QA):** `patterns/qa/qa.theme.js` holds the
token CSS and every QA named style per component. **None of it is in the library default theme.** The qa pattern
adds it itself: `siteConfig.jsx` injects the token block (`QA_TOKENS_FONT`, id `dms-qa-tokens`) when it builds an
install's routes, so only a site with a QA install carries `--qa-*`; `pages/view.jsx` wraps the QA pages in a nested
`ThemeContext` whose theme is `withQaTheme(theme)`, which appends the `qa_*` styles to each component's `styles`. A
style the site's theme already defines under the same name wins, so a site can restyle any `qa_*` style. Why not the
default theme (the first build did that, same day): the admin theme editor loads `mergeTheme(defaultTheme, stored)`
and Save writes the **whole merged theme** back to the theme row (`admin/pages/themes/editTheme.jsx` `onSubmit`), so
any theme saved after that would have frozen copies of every `qa_*` style into a site's stored theme; they also
listed in every site's pill style picker. Consequence: the `qa_*` styles don't show in the theme editor at all, even
on a QA site. Restyling them is by token (`--qa-*` / `--t-*`) or a same-name style in the site theme. Showing them in
the editor for QA sites would bring the freeze-on-save problem back, so it waits on the editor saving only what
differs from the default. Every class is written out in full (Tailwind only generates what it finds literally). Test:
`tests/qaDefaultTheme.test.js` (default theme has no `qa_*` style or token block; `withQaTheme` appends, site wins).

**Plan change (2026-10-05):** the card, table, filter, multiselect, radio and stage-meter named styles are built
**with their page in step 3**, each checked against its mockup, instead of all up front. Their key shapes depend on
each component's theme (and the summary card needs per-row colours), so styles written blind would need a second
pass anyway.

- [x] `--qa-*` variables into a `dms-qa-tokens` style entry in `ui/defaultTheme.js` (after `dms-default-tokens`;
  see "Tokens" under Rules), dark values following from the base variables they derive from. DONE: live on
  `/qa/tickets`, `--qa-sev-blocker` = `--t-brick` in light (#CA3214) and dark (#F2665A), no second dark copy.
- [ ] Named styles (values from the mockups' class strings). **Pills DONE:** `qa_sev_{blocker,major,minor,polish,
  feature}` (square tile), `qa_status_{triage,active,review,waiting,done,canceled}` (round marker by kind; In review
  half filled), `qa_prio_{now,next,later}`, `qa_story_{proposed,accepted,verified}`; markers are `::before`, as the
  library's `status_*` pills draw theirs. Live check (DOM-measured, light + dark): every marker 8px in its token
  colour. The rest are built per page in step 3:
  `dataCard`: `qa_header`, `qa_body`, `qa_rail`, `qa_summary`, `qa_form` ·
  `pill`: `qa_sev_*`, `qa_status_*` (by kind), `qa_prio_*`, `qa_story_*` ·
  `multiselect`: `qa_inline` · `filters`: `qa_chips` (after TransportNY's `chip`), `qa_search` ·
  `table`: `qa_list` (incl. its empty row) · `radio`: `qa_steps`, `qa_choice`.
- [ ] `helpers.js`: pill maps point at the `qa_*` pill styles; `STAGE_HEX` gives way to `var(--qa-stage-*)`.
  **Pill maps DONE** (SEV, PRIO, STATUS, STORY; `tests/qaDefaultTheme.test.js` now checks against the merged
  default theme's pill styles). **`STAGE_HEX` stays until step 3:** `stacked_bar` only treats `#`/`rgb`/`hsl` as
  literal colours and looks anything else up in `theme.stackedBar.fills`, so a `var(--qa-stage-*)` would fall to
  `fills.primary` (every Overview segment one colour). The Overview conversion adds `qa_stage_*` entries to
  `stackedBar.fills` (needs `stackedBarDefault` exported from a `.theme.js` so the merge keeps `primary` etc.);
  Page QA's dots go when its rail gets the radio stage picker. The CATEGORY / STAGE / BUILD / DATA / SOURCE pill
  maps move with their pages too.

### 3. Page conversions (`patterns/qa/pages/*.js`) — DONE 2026-10-05

Who: the owner with the transcription skill, or Claude; one page at a time, screenshot against its mockup.

- [x] **Tickets** (`tickets.js`) — CONVERTED 2026-10-05, live-verified on `/qa/tickets` (light + dark, 0 console
  errors). Structure: header band (`qa_header` group) = one Card (crumb · title · "6 tickets · 4 open" · add ticket);
  summary = two fused Cards on `PANEL_TOP` / `PANEL_BOTTOM` (title + flow strip with the Waiting step; figures on a
  six-track grid: resolved figure spanning two rows + bar, open-by-severity key / bar / count rows, found-by
  stacked bar + key rows, rule-divided); two charts (`activeStyle: 'qa_chart'`, `windowDays: 14`, opened bars
  `var(--t-cobalt)`, done bars `var(--qa-tix-done)`); filter bar = one Card (All / Open / Closed link cells as
  `|||` status presets, a `like` title search on page variable `q`, Status / Severity / Source / Site
  `filter_control` chips); table on `qa_list` with reporter dropped, `emptyRowText`. Clicked live: Open → 4 rows
  and the Open segment active, Closed → 2, All → 6, search "chart" → #102, no-match → the empty row, Severity
  chip → Blocker → #102.
  Core additions this page needed (each optional, default = today's output):
  - `flow_step`: `stepNote` (second line) + `stepDashed` (dashed box); golden test against HEAD
    (`tests/flowStepNote.test.jsx`). Its default theme, and `data_bar`'s and `stacked_bar`'s, moved to `.theme.js`
    siblings (no behaviour change) so `withQaTheme` can add fill/dot keys on top of the library's.
  - Card section `activeOnSearchParam`: a `?key=a|||b` link is active when the page holds exactly that set (was a
    raw-string compare that never matched a preset). Sweep: 220 stored MitigateNY sections use the flag, none with
    `|||`, so no existing link changes.
  - Table: `emptyRow` theme key + `display.emptyRowText` (was hard-coded "No data" in slate).
  - BarGraph time axis (same path as the 1e fix): date-only values are daily bins (one day wide);
    `xAxis.windowDays` frames the last N days; the tick count follows `tickDensity` per 100px as on band axes
    (d3's ~10 ticked every day of a two-week frame). TransportNY's ticket charts set `tickDensity: 1.2`, which now
    takes effect on their time axes.
  QA styling added (`qa.theme.js`): text keys (`qaCrumb`, `qaEyebrow`, `qaBody`, …, built from `.t-*` + `--t-*`;
  titles reuse `h4` / `h5`), layout groups `qa_header` / `qa_content` / `qa_content_end`, Card styles `qa_header` /
  `qa_summary` / `qa_filters` (v2 box model), table `qa_list`, multiselect `qa_chip`, graph `qa_chart`, flat
  `filterControlCell` / `flowStep` / `dataBar` / `stackedBar` (QA fill and dot keys), legend-key pills
  `qa_key_sev_*` / `qa_key_source_*`. `withQaTheme` now merges three shapes: named-style arrays, `textSettings`
  keys, flat maps (site keys win; fills/dots add to the library's). Helpers: `group(…, theme)`, `QT` text-key
  map, `PANEL*` frames (panel surface + rule line as tokens, so dark mode works; the old `WHITE_CARD` frames
  stayed white in dark mode).
  Not matched, logged: the table's footer ("6 of 6 tickets" + download link) — the Spreadsheet keeps its top
  download button and shows no count footer; the found-by icons (Sparkle / Wrench / User) dropped, colour keys
  kept; the chips list the values tickets hold, not the full status / severity lists (filter_control reads
  distinct values); a shortcut link replaces the whole query (drops a search or chip); "Resolved / closed"
  truncates and long titles clip at ~1440px wide.
  Plan text kept: header Card with count + add ticket; one summary Card (status strip + a Waiting
  step + resolved / open-by-severity / found-by); compact charts; filter row = All/Open/Closed link cells
  (`activeOnSearchParam` + `cellActive`), a `like` search on title, four chip filters; table on `qa_list`, reporter
  column dropped, empty row. Chart colours: `tickets.js` hard-codes `#3b82f6` / `#10B981`; switch to
  `var(--qa-tix-open)` / `var(--qa-tix-done)` only if the graph sets fills through CSS (a `var()` in an SVG
  presentation attribute may not resolve). Check before switching.
- [x] **Ticket** (`ticket.js`) — CONVERTED 2026-10-05, live-verified on `/qa/ticket?id=149` (#101) and `id=152`
  (#104), light + dark. Header band = four joined Cards (one Card shares column widths across rows, and these
  rows don't line up): crumb + `open page ↗` (the tracked page's `url`) + `all tickets`; badges (number,
  severity, status, priority, who found it); the title at `h4`; target (site / page link, filed-from route, the
  library `meter` stage style with name + "n of 6"). Body (`qa_body`) = eyebrow labels over edit-in-place
  textareas with per-field placeholders, expected | actual and suggested | resolution side by side, rules between
  bands, `kv_chips` for the environment. Rail (`qa_rail`) = label | value rows (88px label column) in four groups,
  pills edited through multiselect `qa_inline`, text fields as real inputs, record rows read-only. Comments =
  `comment_thread` + an "add a comment · planned" marker; History = a dashed `qa_planned` card. Verified live:
  typed "2h" in Effort → persisted across reload → cleared → persisted (DB checked); rail status In progress →
  Resolved stamped `resolved_date` (2026-10-05 19:13) and the header badge refreshed → back to In progress cleared
  it (DB checked; #101 is as it was).
  Found and fixed on the way:
  - **Text fields in a Card never took the edit look.** `TextEdit` / `TextareaEdit` drop the `className` Card
    passes, so a live-edit textarea always drew its own boxed input theme. Core: Card now also passes
    `fieldClassName` = the style's `editField`, **only when a style sets one**, and those two use it as the
    element's class. `card.theme.jsx` no longer sets `editField: 'border'` (Card's code still falls back to
    `'border'`), so no other Card sees the new prop. Checked: no other edit type spreads leftover props to the
    DOM, so the prop can't warn.
  - **Untyped Card columns aren't editable.** A column with no `type` renders Card's `DefaultComp` (a `<div>`), so
    the old rail's "inputs" were bordered divs. The rail's editable fields now say `type: 'text'`.
  - **A card-level `allowEditInView` puts every non-static column in edit mode,** calcs included; the rail's calc
    link and dates set `editable: false` (they'd otherwise render as inputs, and a live save writes every
    editable column).
  - **Card strips spaces from every `formatFn` result** (`Card.jsx`, the generic branch's `.replaceAll(' ', '')`;
    `combine` is exempt), so `formatFn: 'datetime'` prints "09/24/202610:00am" in a Card. Not changed: a sweep
    finds `time` / `datetime` formatFns in stored sections on WCDB (14) and NPMRDS (93), Cards among them, and
    exempting them would change those pages. The rail formats its dates in SQL instead ("09/24/2026 14:00", as
    stored, UTC). Separate fix if wanted.
  - `.t-*` classes are an unlayered style block, so they beat plain Tailwind utilities: `t-metaSM normal-case`
    stays uppercase. QA keys use `!normal-case` / `!tracking-normal`. The QA card `header` key carries no type
    (an inherited uppercase leaked into labels).
  - `resolved_date` stays fetched (`selectOnly`) on the rail: `setDateOnValue` reads it to keep a ticket's first
    close date.
  Not matched, logged: the screenshot uploader keeps the image type's "Upload Image" button (the mockup's drop row
  needs an image-type theme key), and that button is white-on-light in dark mode (library image type); the
  comments count isn't shown (comments can be plain text); `TextareaEdit` spreads leftover column props onto the
  DOM `<textarea>` (React warnings: `customName`, `hideHeader`, … — pre-existing, unchanged since 2026-05-07).
  Plan text kept: one header Card (crumb, badges, title at display size, target + stage meter, open
  page link); body textareas with per-column `placeholder`s, expected | actual side by side; rail rows grouped
  (workflow, links, verification, record), read-only rows `editable: false`, dates `formatFn: 'datetime'`;
  comments via `comment_thread`; history placeholder.
- [x] **Overview** (`overview.js`) — CONVERTED 2026-10-05, live-verified on `/qa/overview` (light + dark, 0 console
  errors). Header band: crumb; title + "2 sites covered · pages join as they're published" | two figure Cards
  (pages: tracked / client accepted; tickets: open / blockers; two datasets, so two boxes, not the mockup's one
  divided strip). "How delivery works": six `flow_step` cells with stage-ramp dots (`qa_stage_*`), live page
  counts and the default wording as `stepNote` ("product · scope the stories" … "you · review and approve"),
  Client Acceptance tinted. Per site: a header fused from two Cards side by side (identity + stage bar | tickets
  bar; `height: 'fill'`, no gutter between them) over a `qa_list` pages table (page, route, the `qa_ramp` stage
  meter with its name, open count or "—", view ↗). "No sites covered yet" state (`sites: []`) and a Recent
  activity `qa_planned` card. The not-set-up placeholder pages now carry the mockup's copy.
  `STAGE_HEX` is out of the Overview: the stage bar segments and dots are `stackedBar.fills` / `flowStep.dots`
  keys (`qa_stage_*`, the `--qa-stage-*` ramp), the tickets bar `qa_tix_done` / `qa_tix_open`.
  Not matched, logged: the stage legend lists zero stages ("0 in QA") — `stacked_bar` keeps zero segments in the
  legend; the mockup's separate role line under each stage is folded into the one-line note; step boxes of
  different text length end at different heights; no "/betapage ↗" site link (covered-site rows carry no base
  URL); no blocker tile beside a page's open count.
  Plan text kept: header figures; "How delivery works" (flow_step cells + caption cells, default
  wording); one group per site (title + stage/ticket `stacked_bar`s + pages table with stage meter and blocker
  tile); "no sites yet" and "not set up" states; recent-activity placeholder.
- [x] **Page QA** (`pageQa.js`) — CONVERTED 2026-10-05, live-verified on `/qa/page?key=alphapage:page_1` (light +
  dark, 0 console errors). Header band: crumb (pattern / site / page) + `open page ↗`; name + description | the
  accent `add ticket` button (`qaButtonPrimary`, click_publish → the modal). Stories: a header Card ("1 of 3
  verified" + a verified / accepted / proposed `stacked_bar`) over a `qa_list` table with story pills edited
  through `qa_inline`. Tickets: header Card (counts + `+ add ticket`) over a `qa_list` table (status editable,
  still stamping `resolved_date`). Rail: the stage as the themable `radio` with the `qa_steps` style (done stages
  filled in their ramp colour with a tick, the current one ringed and tagged "current", upcoming hollow; the list
  shows in view mode too) + "n of 6"; facts (Build / Data on `qa_build_*` / `qa_data_*` pills, dates formatted in
  SQL); work completed. New ticket modal on Card style `qa_form` (boxed fields via `editField` →
  `fieldClassName`, the accent Add button via `formAddButton`) with severity as `radio` · `qa_choice` chips.
  Verified live: stage QA → Dev Acceptance saved and survived a reload, counter followed without one (4 → 5 of 6),
  back to QA (DB checked); the modal opens from the header button and the Major chip checks.
  The stage card refetches on its own `page_v` publish (its counter is a calc; a live save only patches the
  edited field). `STAGE_HEX` and the old select + node-bar pair are gone from this page.
  Gotcha met again: a Card that mixes an aggregate calc (`calc()`'s default `fn: 'exempt'`) with row columns never
  fetches; row-level calcs here pass `fn: undefined`.
  Not matched, logged: the stories and tickets tables keep their header rows; a ticket row doesn't show "Client
  found" under its title.
  Plan text kept: header (crumb with site, description, add ticket, open page); stories with
  "n of 3 verified"; tickets on `qa_list`; rail = stage picker (`radio` · `qa_steps`), facts, work completed; New
  ticket modal on `qa_form` with severity as `radio` · `qa_choice`.

### 4. Configure (React tab) — BUILT and live-checked 2026-10-06, uncommitted

Who: the implementer. Spec: `qa-configure.html` (states: live, datasets missing, unsaved edits). Live page:
`/list/manage_pattern/126/configure` (the `QA` install on `qa_test`). Files: `patterns/admin/pages/patternEditor/qa/
configureTab.jsx` + `configureTab.theme.js` (`admin.qaConfigure`, QA-only), `QaPatternSettings` in
`patternEditor/default/settings.jsx` (the datasets card; the Overview tab shows it too, only for `pattern_type ===
'qa'`), `patterns/qa/configure.js` (pure logic) + `tests/qaConfigure.test.js`.

**What changes on screen** (most visible first):
1. **Covered sites table.** Columns become grip · on · site · label · short key · pages (label now before key).
   - Switched-on sites first, in their Overview order, each with a drag grip (`UI.DndList` from ThemeContext).
     A drop renumbers `sort_order` 1..n over the switched-on rows. The order-number input goes.
   - Switched-off sites below, one line each: name in grey, "not covered", no inputs, no grip. Switching a site on
     moves it to the end of the switched-on group; switching it off moves it down. (Guess, flagged: the
     alternative is rows staying put until Save.)
   - A short key in use: lock icon + the key + "in use" as text, instead of a greyed-out input.
   - Pages: a bordered "every page ▾" / "3 pages ▾" button opens today's picker row. Non-page patterns read
     "all of it" (today "—").
   - An edited field gets an amber outline until saved: a QA-only wrapper class on the field (`UI.Input` has no
     class passthrough, and `settingsEditor` has no such key, despite the mockup's "reuse" note).
   - Covered-sites dataset missing: names the dataset and points at "finish set-up".
2. **Header.** Install name + the `qa` type pill (as the Overview shows it) + three figures on the right: sites
   covered, pages tracked, datasets n/5 ("—" until set up).
3. **Datasets card** (shared with the Overview tab). Badge "all linked" (green) or "N missing" (amber). One row per
   dataset: tick, name, slug (`qa_tickets`), "N rows". Unlinked rows: amber ring + "missing", or "not linked" when
   an interrupted set-up left it behind. Footer: "browse in Datasets ›" when complete, otherwise one sentence and
   "finish set-up". Names stay `QA_DATASETS`' ("Covered sub-sites", "Change history"), not the mockup's shorter ones.
4. **Save bar.** Clean: tick + "All changes saved" (or the last save's "saved · added 1 page from Pages"), no
   buttons. Dirty: "2 unsaved changes · BetaPage's label, Pages switched on" + reset + save. Keeps the Overview's
   shared `saveBar` / `saveBarDirty` keys (the mockup's map says reuse; its drawn band is not adopted). Live check
   whether `sticky top-0` stays visible under the admin top bar; if not, a QA-only key adds the offset.
5. **Ticket record card.** Header pill "set in code for now". Statuses as the Tickets page's chips (the same
   `qa_status_*` styles via `STATUS_PILL`), outcomes as `qa_tag` chips, stages as square ramp markers
   (`STAGE_MARKERS`) joined by ›.
6. **Features placeholder.** Dashed card, "features" + the `qa_planned` tag, five dimmed switch tiles (Tickets,
   Page inventory, Page stages, Stories, Overview). Not clickable.
7. **Layout.** Datasets (5/12) beside ticket record (7/12) on wide screens, stacked on narrow; covered sites and
   features full width.

**Build order** (each piece checked before the next):
- [x] a. No library change. Row counts come from `apiLoad` with the existing `udaLength` action (`format: { app,
  type, env, view_id }`, `filter: { options: '{}' }`; `api/index.js:268-285` invalidates the view's length, then
  reads `['uda', env, 'viewsById', view_id, 'options', '{}', 'length']`), as the dataWrapper's `getLength` does
  (`dataWrapper/getData.js:200`). The local-DB branch (`api/index.js:230`) only takes `list`/`view`/`edit`, so it
  doesn't intercept. Naming, if a helper is ever wanted: the codebase says "length" (falcor `length` paths, the
  `length`/`filteredLength`/`udaLength` actions, `getLength`), never "count". (An earlier draft added
  `countDatasetRows` to `api/datasetRows.js`; dropped 2026-10-06.) Icons: only
  ones the library already registers (`CircleCheck`, `CaretDown`, `ArrowRight`, an existing one for the grip); no
  new library icons (owner, 2026-10-06). Found while checking: a library `Check` would not be additive. The
  Spreadsheet's add-row "Save row" button (`ui/components/table/index.jsx:256`) asks for `Check`, and on themes
  without one (mny, catalyst, tessera, avail, lingua, two_curses) it shows `Icon.jsx`'s fallback shield today.
- [x] a2. (2026-10-06: `datasetRows` in `patterns/qa/datasets.js`, tested with a fake `apiLoad`; the datasets card's
  counts make the `udaLength` call inline, per `packages/dms/CLAUDE.md`'s "no 1–2 line wrappers around `apiLoad`".) **Configure's dataset reads move to `apiLoad`** (owner asked 2026-10-06 where QA code could use `apiLoad`
  instead of falcor). Rows = `udaLength`, then `action: 'uda'` with `filter: { fromIndex, toIndex, options: '{}',
  attributes }` (as `dataWrapper/getData.js:174` does); `dmsDataLoader` invalidates every `uda` request before the
  get (`api/index.js:312`), so it's as fresh as `loadDatasetRows(..., fresh: true)`. A small QA helper wraps the two
  calls. Writes stay on `dmsDataEditor` (deliberate, phase 5: `apiUpdate` revalidates the whole admin loader after
  every create, once per backfilled page).
  **The rest of QA's falcor use: DONE 2026-10-06 (owner: "fix up the apiload stuff").**
  - [x] `qa/pages/view.jsx`: the covered-sites read on every QA page is `datasetRows(apiLoad, …)` (`apiLoad` from
    the route props, the same one PageView gets; kept out of the effect's deps, since the wrapper makes a new one
    every render). Fixes the stale card order: live, a Configure reorder + Save, then `pushState` back to `/qa`,
    shows the new first card (it used to show the old one until a full load); restored the same way.
  - [x] Track-on-publish (`page/pages/edit/editFunctions.jsx`): reads through `datasetRows(apiLoad, …)`;
    `PublishButton` (`editPane/pagesPane.jsx`) passes `PageContext`'s `apiLoad` instead of `CMSContext`'s `falcor`.
    The CLI (`cli/src/commands/page.js`) keeps `loadDatasetRows`, now its only user (noted in `api/datasetRows.js`).
    Live: a scratch page `betapage/publish_probe` (row 167) published from the editor → one pages row
    `betapage:publish_probe` (Proposed, its URL); marked changed and published again → still one row. Scratch page,
    its history row (168; `dms page delete` leaves it) and the pages row (169) deleted; pages dataset = 7 rows again.
  - **`qa/install.js`: left as it is (reverses this list's earlier "against the library rule").** Its direct
    `falcor.call(['dms','data','create'|'edit'])` writes are the repo's provisioning practice:
    `utils/tenantProvisioning.js` makes 16 such calls and the Datasets admin's `sourceCreate.jsx` (whose row shapes
    install.js copies) 3. `dmsDataEditor` would also change behaviour: on a site with sync on, a create with fields
    goes to the local store first (`api/index.js:509`, `isSyncEligible`), while install.js reads each new row straight
    back from the server (`loadItemFresh`). Moving provisioning to the api layer is a repo-wide job, not a QA one.
  - Fine as they are: `getSourceIdsBySlug` and `loadItemFresh` (api-layer functions, no `apiLoad` action for them);
    `qa/siteConfig.jsx`'s `preload(falcor, …)` (the framework's route hook); Configure's writes (`dmsDataEditor`).
  - Tests: QA suites + `pageVariableClearReset` 141/141; full `packages/dms/tests` 780/783 (same 3 unrelated).
- [x] b. (2026-10-06: `export STAGE_MARKERS`; `qaPillClass(name)` beside `QA_TOKENS_FONT`.) QA exports: `STAGE_MARKERS` and a pill-class lookup from `qa.theme.js`. Configure loads the QA tokens
  itself (`loadThemeFonts([QA_TOKENS_FONT])`, as `qa/siteConfig.jsx` does): a hard load of `/list/...` never runs
  the QA pattern's config, so `--qa-*` would be undefined there.
- [x] c. (2026-10-06: `groupEntries`, `switchEntry`, `moveEntry`, `fieldEdited`, `describeEdits`; `qaConfigure.test.js`
  32/32, 10 new incl. the readers.) Pure logic in `configure.js` + tests: `describeEdits` (the save bar's wording), row grouping and
  move/renumber.
- [x] d. Datasets card (`QaPatternSettings`): one row per dataset with its count (`udaLength` through `apiLoad`,
  inline), badge, footer note or Datasets link; `reloadKey` re-counts after a Configure Save.
- [x] e. Configure JSX + `qaConfigure` keys. Grip = the library's `MenuDots` turned upright. The save bar sits in a
  QA-only `saveBarSticky` backing (solid `--t-paper`): the dirty bar's `--t-amber-soft` is 10% amber, so stuck over
  the cards it showed them through it. The datasets card stretches only on Configure (`topDatasets`'s
  `[&>*]:flex-1`); a `h-full` on the card itself stretched it to ~500px on the Overview tab.
- [x] f. Live check (below).

**Verification.** QA unit suites, then full `packages/dms/tests` (expect the same 3 unrelated failures). Live on
`qa_test` in a browser, light and dark (the probe can't hard-load `/list/...`; client-side navigation from `/qa`
works): label edit → amber outline + named save bar; Pages on → row moves, Save adds its pages, then revert through
the UI and delete the added page rows (backup first); drag reorder → the `/qa` Overview card order follows, then
restore; the Overview tab shows the new datasets card. The datasets-missing state: unit-level and a visual check
only, unless a scratch install shows it cheaply.

**Live check, 2026-10-06** (probe `report_probe.mjs --auth scratchpad/npmrds-sub/.dms-auth-token-qa_test`, client-side
navigation from `/qa`; evals in `scratchpad/qa_test/probes/configure_*.mjs`; shots in `scratchpad/qa_test/design-impl/
live-configure-*.png`). Backup first: `scratchpad/qa_test/backup_2026-10-06/` (covered sites 3 rows, pages 7).
- Renders in light and dark: header 2 sites covered / 7 pages tracked / 5/5; datasets 6, 7, 3, 3, 0 rows, all linked;
  status markers take `--qa-kind-*` (cobalt on In progress), stages the ramp; BetaPage and AlphaPage on with keys
  locked "in use", Auth and Pages off on one line; features placeholder. No console errors from the tab.
- BetaPage label edited → "1 unsaved change · BetaPage's label", field amber. Pages switched on → moves to the end of
  the switched-on group, "Pages switched on". Drag AlphaPage above BetaPage (Playwright `dragTo` from the grip) →
  "the order". Save → rows 137/138/139 written, one pages row added (`pages:page_1`, Proposed, as phase 5).
  Reverted through the UI and saved; the added pages row (166) deleted with `dms raw delete` (needs
  `DMS_HOST=http://localhost:3001` and `DMS_AUTH_TOKEN` = the qa_test token). DB = the backup again.
- Order on `/qa`: after a drag + Save, a full load of `/qa` shows AlphaPage's card first; restored → BetaPage first.
- Sticky: scrolled 370px, the bar sits at the top, solid, nothing over it. Reset clears edits without a write.
- Tests: `qaConfigure.test.js` 32/32; QA suites 132/132; full `packages/dms/tests` 780/783, the same 3 unrelated
  failures (`avlGraphThemeDefaults` golden, `syncDeltaConvergence` x2).
- Not checked live: the datasets-missing state (needs an install without datasets), the overlap refusal (needs a
  second install; unit-tested since phase 5).

**Found, not fixed (outside this step):**
- ~~**Moving back to `/qa` inside the app shows the old card order** after a Configure Save~~ FIXED 2026-10-06 (a2:
  `qa/pages/view.jsx` reads through `datasetRows`; it read falcor's cache since phase 4).
- **The Overview tab's own dirty save bar is see-through when stuck** (shared `settingsEditor.saveBarDirty`, 10%
  amber over the cards). Configure has its own backing; the Overview's is a shared-key change, not made.

**Not in this step:** feature switches (placeholder only), an editable ticket record, Report an issue (phase 6).

### 5. Report an issue

Phase 6 of `qa-pattern-type.md`, not this task. `qa-report-issue.html` is its design reference (drawer, questions,
captured context, signed-out fields, sent state, `ReportIssue` widget placed by the theme).

## Verification

- Each converted page: probe screenshot next to its mockup (`report_probe.mjs` with
  `--auth scratchpad/npmrds-sub/.dms-auth-token-qa_test`; mint with `mint_token.sh qa_test`), light and dark.
  The probe does not render `/list/manage_pattern/…` (blank content); check Configure in a browser.
- Each core change: a grep of every consumer, plus a before/after check on one non-QA page that uses it.
- No live page outside QA changes look.
