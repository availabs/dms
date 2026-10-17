# Button + pill + table consistency audit — one look per kind, across every pattern

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** done · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** shaunak.sangdod@gmail.com, ssangdod@albany.edu

**Started 2026-10-13** (owner: "start the inventory"). One look per kind of control (buttons, pills,
switches, tabs, fields, tables) across every pattern, in the library default theme only.
Review page for the inventory: https://claude.ai/artifact/6v1t9R9v9yXJge6zV4RmVm.

## Closed (2026-10-15)

One look per kind of control in the library default theme: done. Every part is committed on `design-wip` in
both repos (library `ffc7566f` / `7f882951`, root `f09b6b01` / `b461bddd`), then master merged in (library
`a7f4ca41`, root `95be69ce`). Not pushed.

| File | What |
|---|---|
| [ui-control-inventory.md](./ui-control-inventory.md) | Deliverable 1: every button / pill / table found, by kind |
| [ui-control-spec-and-mockups.md](./ui-control-spec-and-mockups.md) | the spec page `ui-controls.html` and the mockup re-skin |
| [ui-control-library-port.md](./ui-control-library-port.md) | the spec in the library default, area by area (admin, auth, datasets, page drawer + section menu) |
| [ui-control-classname-to-activestyle.md](./ui-control-classname-to-activestyle.md) | buttons off `className`, `Button.jsx` locked |
| [ui-control-tables.md](./ui-control-tables.md) | `UI.Table 'list'`, datasets lists onto it, ink grid states |
| [ui-control-fields.md](./ui-control-fields.md) | 32px fields, ink focus, Input / Textarea locked |
| [ui-control-pills.md](./ui-control-pills.md) | Pill kinds, `color` → `activeStyle`, boxed status pills, Pill locked |
| [ui-control-tabs-overlays.md](./ui-control-tabs-overlays.md) | tabs ink, Modal locked, Drawer tokens |

Button, Pill, Input, Textarea and Modal take their look from the theme only (`activeStyle`); a `className` logs a
dev warning (below). Project themes keep their look through `src/themes/_legacy/*`.

**Owner calls on the last open items (2026-10-15):**
- "NaN rows" as the section menu Filters value: fixed (`sectionMenu.jsx`, the value hides until the data has a
  row count).
- Auth manage-page breadcrumb current item: cobalt → ink (`auth/defaultTheme.js`), like admin.
- "Refresh Meta" as small-danger, landbank / avail_site global `:focus-visible` CSS: fine as is.
- Auth user-group chips and the grid's selected-cell outline: ink (MultiSelect `accent`, grid step 4).

**Follow-on work:**
- [ui-raw-html-to-ui-components.md](../completed/ui-raw-html-to-ui-components.md): raw `<button>` / `<input>` /
  … → UI components; also holds the items carried over from this effort ("Carried over" there).
- [ui-primitives-default-theme.md](../completed/ui-primitives-default-theme.md): the UI primitives that still
  hardcode colours.
- [default-theme-color-variant.md](../current/default-theme-color-variant.md): a more colourful default
  (deferred by the owner).

**How to verify (all local; never touch the owner's :5173 dev server, never start dms-server with its default
env, which points at prod):** scratch sqlite dms-server on :3457 (`DMS_DB_ENV=cli-test`), Vite on :5199
(`VITE_API_HOST=http://localhost:3457 VITE_DMS_APP=v6test VITE_DMS_TYPE=main VITE_DMS_PG_ENVS=test_dama`), login
`admin@availabs.org` / `test123` with the token in `localStorage.userToken`; HEAD baseline Vite on :5198 with its
own `cacheDir` for pixel diffs. Test patterns: page `/p` `/p-mny` `/p-tny` `/p-lb`; datasets `/data` `/data-mny`
`/data-tny` `/data-lb`; admin `/list`; auth `/auth/manage/users`.

**Rules that hold (owner):** only the default theme changes; project themes keep their look via
`_legacy/{ui,pages,datasets}.js`; each const stays in its component's own `.theme.js`; no className looks; mockup
first, mirror real edits into the mockups; ink is primary, cobalt only for links in text, activity / running,
logos, pattern-type pills.

## Decisions — answered (owner, 2026-10-13: "ink for P1, yes to P2 and P4, colors are fine for P3")

- **P1 → ink solid.** Primary = `--t-ink` fill, `--t-paper` text. The same ink marks the active filter
  chip and the active segment of segmented controls. No cobalt on controls. Re-confirmed the same
  day after discussing a cobalt primary to match the default logo (owner: "let's continue using ink,
  and for the places i think it needs to be cobalt, we'll change it"). Cobalt primaries are opt-in,
  place by place, only where the owner asks. Record each one here with its location.
- **P2 → yes.** The admin side nav's active row matches the page side nav (well + ink, no cobalt).
- **P3 → keep the colours.** Pattern-type pills keep amber / cobalt / go, in one shape in both
  places (site list + add-pattern picker).
- **P4 → yes.** `UI.Table` gets a named 'list' style (header band, row rules only), which the admin
  and auth lists opt into; datasets list tables use the same look.
- Exceptions not objected to (kept): ~~metadata `btnInline` h42~~ (dropped 2026-10-13, fields go 32px), auth full-width h40 submit, the dark
  edit bar / Publish, amber "overrides inherited" in Permissions, theme-editor preview font.

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

## Deliverable 2 — the shared look (after the owner signs off the inventory)

Proposed structure (decide when we get here):
- One set of button + pill class strings for the default theme — e.g. named styles on `UI.Button`
  (`action`, `danger`, `dangerSolid`, `addUpdate`, `ghost`, `icon`) and a `UI.Pill` / status style
  set — and have the pattern themes point at those (or reuse the same constants) instead of each
  page carrying its own copy.
- Project themes: unchanged (legacy) unless they opt in — same rule as the rest of the v6 work.
- `cursor-pointer` on every button style; `disabled:cursor-not-allowed`.

## Testing checklist

- [x] Table inventory (site list page + admin / auth / datasets tables) reviewed with the owner, each
      table tagged data grid / list table
- [x] All list tables on one shared style; data grids keep their own look (chosen states ink)

- [x] Inventory table reviewed + approved by the owner (kinds, exceptions)
- [x] Every listed element restyled (raw HTML controls continue in ui-raw-html-to-ui-components.md)
- [x] Default theme light + dark; MNY / transportny unchanged (HEAD-baseline pixel diffs per step)
- [x] `npm run build` clean; eslint vs HEAD on touched files

### 2026-10-14 — dev warning for className on locked components (owner: "yes")

`ui/warnLockedClassName.js` (`warnLockedClassName(component, className)`): in development (`import.meta.env.DEV`)
a `className` passed to Button / Pill / Input (+ its Textarea export) / Textarea / Modal logs one
`[dms] <X> ignores className (…)` warning per component + value; production does nothing. Modal now destructures
`className` only to warn. Why: dropping it silently hid two Modal callers whose look was lost. Verified: helper
fires once (deduped) in the browser; a walk of 33 admin / auth / datasets / page routes (default + MNY / TNY / LB)
logs none. Lint ≤ HEAD on all five (the drop-only `no-unused-vars` are gone), build OK.
