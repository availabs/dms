# Button + pill + table consistency audit — one look per kind, across every pattern

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** next · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** shaunak.sangdod@gmail.com

**Not started — on hold until the datasets + page v6 redesign
([datasets-page-pattern-v6-port.md](./datasets-page-pattern-v6-port.md)) is finished** (owner,
2026-10-07: "once we're done with this").

## Objective

Owner, 2026-10-07: "take a look at all buttons including in admin pages, and all patterns, they
should look the same, and they all should have a pointer cursor. the danger buttons should share the
look, the add / update too. unless it's context based to have them look different. list all the
buttons that we need to change the look of." Extended the same day: "map status pills etc which can
and should share the look." Extended again 2026-10-07 to **tables** (see "Tables" below): "the table
at overview, table and tasks pages are all different looking. do you think it's better to pick one
style for them?" → recorded here; then "make a note to compare site list page table and any other
place tables show up on admin / auth / datasets patterns."

So, in the default (v6) theme:
1. Every **button** of the same kind looks the same in every pattern (admin, page, datasets, auth,
   forms, …), and every clickable control has `cursor-pointer`.
2. Every **status pill / badge / chip** of the same kind looks the same.
3. Every **read-only list table in a card** looks the same (data grids keep their own look).
4. Differences stay only where the context calls for it — and each one is written down with why.

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

## Deliverable 2 — the shared look (after the owner signs off the inventory)

Proposed structure (decide when we get here):
- One set of button + pill class strings for the default theme — e.g. named styles on `UI.Button`
  (`action`, `danger`, `dangerSolid`, `addUpdate`, `ghost`, `icon`) and a `UI.Pill` / status style
  set — and have the pattern themes point at those (or reuse the same constants) instead of each
  page carrying its own copy.
- Project themes: unchanged (legacy) unless they opt in — same rule as the rest of the v6 work.
- `cursor-pointer` on every button style; `disabled:cursor-not-allowed`.

## Testing checklist

- [ ] Table inventory (site list page + admin / auth / datasets tables) reviewed with the owner, each
      table tagged data grid / list table
- [ ] All list tables on one shared style; data grids unchanged

- [ ] Inventory table reviewed + approved by the owner (kinds, exceptions)
- [ ] Every listed element restyled; live walk shows no clickable without `cursor: pointer`
- [ ] Default theme light + dark; MNY / transportny unchanged
- [ ] `npm run build` clean; eslint vs HEAD on touched files
