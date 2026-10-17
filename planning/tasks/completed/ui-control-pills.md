# UI controls — pills: four named kinds, className callers swapped, Pill locked

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** done · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** ssangdod@albany.edu

Part of [ui-control-consistency-audit.md](./ui-control-consistency-audit.md), the hub. Owner 2026-10-14: other UI
elements must look the same before [ui-raw-html-to-ui-components.md](../completed/ui-raw-html-to-ui-components.md); run in
parallel agents ("go ahead, run multiple agents to parallel work on next steps").

## Objective

Spec ui-controls.html (inventory "Pills"): `UI.Pill` named kinds status / marker / tag / count (r4 mono, tones go / brick / amber / well; no hardcoded red / emerald / rose / slate); swap the ~10 `className` callers to `activeStyle`; then lock Pill like Button.

Rules: only the default theme changes; project themes keep their look via `src/themes/_legacy/ui.js` (verify
with the HEAD-baseline pixel diff on MNY / TNY v2 / landbank); no className looks (activeStyle only); mirror
real changes into `design_system_v6/scripts/`.

## Progress

### 2026-10-14 — agent D (parallel run): kinds, tokens, lock — done, uncommitted

**Callers.** No caller passes `className` to `UI.Pill` (the "~10" from the 10/13 count was a regex hit on
`text={<Icon className=…/>}` inside Pill props). Every caller picks its look by name, via `activeStyle`
(statusPill, priorityTier) or the legacy `color` alias (page editor: ColumnManager, ComplexFilters,
ColumnControls, AddFormula/AddCalculated, Card.config, section.jsx, ActionBtn's pre-v6 branch). So nothing
to swap; the lock only closes the `...rest` hole (a `className` in rest used to override the theme class).

**Changes**
- `ui/components/Pill.theme.js` (default theme only):
  - `gray` (Expand / Collapse All beside the column-manager toolbar) → the small action look, like `blue` /
    `green`; `red` → the small danger look, like `orange` (were hardcoded gray-400 text / red-500 tint).
    Shared consts `SMALL_ACTION` / `SMALL_DANGER`; the unused `BASE` removed.
  - dotted `status_good / warn / bad / na` (status_pill column type) → token tones go / amber / brick /
    graphite-pencil (were emerald / amber / rose / slate). Shape unchanged.
  - Appended the spec kinds (from `controls.py` STATUS / MARKER / COUNT / TAG / TAG_SUB): `status`,
    `status_go`, `status_amber`, `status_brick`, `status_cobalt` (running), `marker`, `count`, `tag`,
    `tag_sub`. Stored indices before them don't move. A removable tag puts its own × in `text`.
  - `docs` gained examples of the kinds (theme-editor preview).
- `src/themes/_legacy/ui.js` `pill`: pre-v6 `gray`, `red`, `status_good/warn/bad/na` frozen verbatim (a
  theme's own same-named style, e.g. MNY's status_*, still wins). The new kind names are NOT listed, so on a
  project theme they'd render the library look — no caller uses them yet.
- `ui/components/Pill.jsx`: LOCKED — `className` is destructured and dropped; look = `theme.pill[activeStyle ?? color]`.

**Verified**
- Resolved classes, every registered theme (21) + default, in the browser via Vite module imports
  (`agentD/pills.mjs`, :5199 vs HEAD :5198): every pre-existing pill name identical on every project theme
  (incl. MNY status_* / tier_*); only the new names added. Default: gray / red / status_* changed as intended.
- Visual (classes injected into a default-theme page, real app CSS): HEAD vs new light vs new dark — kinds
  match the spec, dark OK.
- Build OK (scratch outDir). eslint = HEAD on Pill.theme.js and _legacy/ui.js; Pill.jsx only `react/prop-types`
  (+1 for the dropped `className` param; the package doesn't follow prop-types — Button / Switch precedent).
- Not done live: the section-menu Columns page (where gray / blue / orange render). The old `menu16.mjs`
  walker's selectors are stale (the menu's Edit is a `<button title="Edit">` now) and the walk is flaky on
  cold loads; the resolved-class check covers it.

**Open questions**
- `color` is still the alias the page-editor callers use (~40 call sites). Rename them to `activeStyle` for
  consistency with Button? (Behaviour identical; touches many page-section files other agents may edit.)
- Should the dotted `status_*` (status_pill column type) become the r4 `status_*` chip kind in the default
  theme? Kept dotted (authored content); only recoloured.

**Later (pattern-tied pills that are plain spans, not UI.Pill)** — candidates to move onto the kinds:
admin `editSite` typePill (P3 tones), `formatManager` typePill / requiredPill / countPill, `userMenuEditor`
scopePill, `pagesEditor` levelPill, `settings` / `qa/configureTab` headerTypePill; datasets `overview`
adminPill / catPill / catSubPill, `DatasetsList` categoryPill / subCategoryPill, `SettingsPage` nsPill,
`UdaTaskPage` statusBadge (+ uploads StatusCell), sourcesTab origin / statusOrphaned; auth `ViewAsBar` groupPill.

### 2026-10-14 (later) — owner: "pills: rename them"; "status_pill show me side by side"

**`color` → `activeStyle` (done).** Every `UI.Pill` call now passes `activeStyle` (same values) and `Pill.jsx`
no longer reads `color` (`getComponentTheme(theme, 'pill', activeStyle)`). Sites: page pattern
`Card.config.jsx` (9), `section.jsx` (2), `ColumnManager.jsx` (10), `ComplexFilters.jsx` (6),
`ColumnControls.jsx` (3), `AddCalculatedColumn.jsx`, both `AddFormulaColumn.jsx`, `section_components.jsx`
`ActionBtn` (its own `color` prop now feeds Pill's `activeStyle`), the commented-out uses in `pagesPane.jsx` /
`sectionMenu.jsx`, `Pill.theme.js` `docs`; app side `src/patterns/mapeditor/.../JoinQueryBuilder.jsx`
(`ManagerActionPill` keeps its own `color` prop → `activeStyle`). `src/themes` callers already used
`activeStyle` (TNY components). No app-side blocker. Theme comments that say "legacy color-prop names"
(landbank, avail_site, fusion) describe style NAMES, still valid.
Verified: class resolution on all 22 themes unchanged vs the previous run; eslint = HEAD on all 14 files
(prop-types aside); build OK; live: TNY section menu (ActionBtn → Pill action row + "Hidden from View"
Pill) pixel-identical to HEAD.

**status_pill comparison (decided 2026-10-14: boxed, see below).** `<session scratchpad>/agentD/
status_pill_compare_light.png` and `_dark.png` (script `status_compare.mjs`): dotted (`status_good / warn /
bad / na`, new token tones) vs boxed status kind (`status_go / amber / brick / status`), labels Good /
Warning / Bad / N/A, in a `UI.Table 'list'` row and in Card cells (header + value), real library classes
resolved from the merged default theme on a live default-theme page. Card cell is a close mock (header
drawn as the Card default's mono label), not a live Card section.

### 2026-10-14 — owner: status_pill → boxed chips (main session)

- Owner: "the boxed chips in the default theme." `Pill.theme.js` default `status_good` / `status_warn` /
  `status_bad` / `status_na` now use the boxed status kind (go / amber / brick / well soft, r4 mono 10). The
  `status_pill` column type is unchanged (it still picks those names). Project themes keep their dotted styles
  (frozen in `_legacy/ui.js` `pill`; MNY's own `status_*` win). The `DOT` const is gone from the library file.

### 2026-10-15 — closed

All done and committed (library `ffc7566f`). Pattern-drawn pills (admin type / count pills, datasets
category / status badges, the auth group chip) moving onto `UI.Pill` kinds are tracked in
[ui-raw-html-to-ui-components.md](../completed/ui-raw-html-to-ui-components.md).
