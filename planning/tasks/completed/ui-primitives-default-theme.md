# Theme the unthemed UI primitives — v6 for the default theme, legacy for everyone else

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** done · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** shaunak.sangdod@gmail.com, ssangdod@albany.edu

## Closed (2026-10-17)

Every primitive in scope now takes its look from the theme — v6 in the library default, the pre-v6 look frozen for
project themes in `src/themes/_legacy/ui.js`: Switch, Textarea, Button, Pill, the section menu (UI controls effort), and
on 2026-10-17 Colorpicker (`colorPicker`) and CardColumnPicker (`cardColumnPicker`), to the owner-approved spec on
`design_system_v6/pages/ui-controls.html` (#color-picker, #column-picker). `List` / `DraggableList`: out of scope (owner).
Pagination / Card: their remaining hardcoded classes were in commented-out code / moved by the raw-HTML task.

2026-10-17 details: every class string in both components (layout included) is a theme key; swatch / swatchOn are the
spec's swatch; ColorPickerFlat's inline border + shadow became (legacy) classes — the inline shadow had hidden the
selected ring, so project themes keep no ring. The section-menu mockup's border colour now shows the hex read-only
(owner). Fixed on the way: the full picker positioned its cursors in px against a width the padded square never had
(cursor drawn outside, drag maxed at ~81% saturation) — now % of the measured area.

**State 2026-10-15:** the datasets + page v6 redesign it waited for is finished, and the UI controls effort
([ui-control-consistency-audit.md](../completed/ui-control-consistency-audit.md)) did part of this task:
`Switch` (themed, `_legacy/ui.js` freeze), `Textarea` (locked, `styles[]`), `Button` (`themeOptions` gone, locked),
the section menu (`navigableMenu` tokens, plain value) and `Pill` (named kinds). `Pagination`'s only grays are in
commented-out code; `Card`'s one hardcoded `<label>` is in
[ui-raw-html-to-ui-components.md](../completed/ui-raw-html-to-ui-components.md). **Left: `Colorpicker`, `CardColumnPicker`.**
Owner 2026-10-16: `List` and `DraggableList` are not being styled (out of scope).

## Objective

A handful of shared UI primitives (`packages/dms/src/ui/components/`) never got a theme: their
colours and chrome are hardcoded in the JSX, so every site renders them the same, the default (v6)
theme included. The most visible is `UI.Switch` — indigo / gray-200 on every v6 page (e.g. the
datasets metadata editor's Index / Required / Primary key switches).

Give each of them a theme so **the library default gets the v6 look**, while **every other theme
keeps rendering exactly what it renders today** ("legacy") until that project designs its own UI
component themes (owner, 2026-10-07: "start with just doing the default theme and have other themes
use the legacy stuff until they build their own ui component themes").

## Scope

Unthemed — no `ThemeContext` read at all (audit 2026-10-07):

| Component | Hardcoded today | Notes |
|---|---|---|
| `Switch.jsx` | track `bg-indigo-600` / `bg-gray-200`, white knob | `Switch.theme.js` exists but holds only `docs`; not registered in `ui/defaultTheme.js`. Sizes (xs / small / medium pill, dot, translate) are structural — they stay in code. transportny v2 already declares a `switch` theme object nothing reads (`themev2.js`, `switch: switchTheme`) — check its keys against whatever key names we pick. |
| `List.jsx` | ~9 palette classes | out of scope (owner 2026-10-16) |
| `Colorpicker.jsx` | ~3 | |
| `DraggableList.jsx` | ~3 | out of scope (owner 2026-10-16) |
| `CardColumnPicker.jsx` | ~21 | |

Partly themed — reads the theme but still has hardcoded classes:

| Component | Hardcoded today |
|---|---|
| `Textarea.jsx` | ~21 palette classes |
| `Button.jsx` | `themeOptions` colour / size maps (`primary`, `danger`, `cancel`, `transparent`) |
| `Pagination.jsx` | ~2 |
| `Card.jsx` | ~3 |

Already themed but not matching the v6 mockups — **added 2026-10-08** (owner, reviewing page 14
of datasets-page-pattern-v6-port.md: "if these changes will be taken care of in the ui components
theming, it's okay"). Spec: `design_system_v6/pages/page-edit.html` + `page-section-menu.html`
(`scripts/page_edit.py` `section_menu()` / `pill()`, `scripts/section_menu.py`):

| Component | Live (default theme) | Mockup |
|---|---|---|
| `navigableMenu/theme.jsx` — rows | `menuItem` `px-3 py-2 text-sm`, `gap-2` icon↔label | `px-2.5 py-1.5 rounded t-proseSM`, `gap-2.5`; row icon `text-pencil` |
| `navigableMenu/theme.jsx` — value (`showValue`) | `valueWrapper` = mono chip with `bg-well` + border | plain `t-metaXS text-pencil`, no background/border, before the chevron |
| `navigableMenu/theme.jsx` — header / breadcrumbs | `menuTitle`, `breadcrumb*` = `text-gray-900`, `hover:text-blue-500`, `text-gray-500/300` | tokens, no blue (ink / pencil) |
| `Pill.jsx` — the section menu's action row (copy link / copy / paste / move / refresh / edit, back / home, save / cancel) | `color="blue" / "orange" / "green"` chips (blue-500/15 etc.) | `w-7 h-7 rounded-md` square icon buttons: plain = graphite, hover ink + well; save = the primary action (no blue — ink/chalk per the no-accent rule); cancel = amber; "copied" = go |

Icon SIZE in that action row is already done (`pages.section.menuActionIcon`, 16px — page 14), and
the missing glyphs (submenu chevron etc.) are registered. Note for this task: NavigableMenu's default
was moved to tokens in Phase A, so check how project themes are insulated before changing its
`styles[0]` (they may already inherit the Phase-A values); Pill's colour map is used well beyond the
section menu — prefer a named style / new keys the section menu opts into over changing `blue`.

Out of scope: components already themed in tessera-component-theme-port.md Phase A (except the
NavigableMenu / Pill rows above); brand-specific
looks for any project (each project builds its own later — see "Later" below).

## Started early (2026-10-08)

`src/themes/_legacy/ui.js` exists now (SideNav only — the page-pattern port needed the child-page
nav fixed; see datasets-page-pattern-v6-port.md page 16). It is applied in `src/themes/index.js`
(`withLegacyUi`) rather than per theme file — extend `legacyUi` there for the components below.

## Current state

- Themed primitives follow `Foo.jsx` + `Foo.theme.js` (`options.activeStyle` + `styles[]`), are
  registered in `ui/defaultTheme.js`, and read
  `{ ...fooTheme.styles[0], ...getComponentTheme(themeFromContext, 'foo', activeStyle) }`.
- `mergeTheme` (`ui/useTheme.js`) deep-merges `styles[0]` and matches named styles **by name**
  (`mergeComponentStyles`), so a project theme's own styles never collide with library ones.
- No project theme sets keys for these components today, so the moment a key is registered with v6
  values, **every** site would pick them up. That's why the legacy layer below is needed.
- Precedent for "default gets v6, others keep their look": `src/themes/_legacy/datasets.js`
  (`legacyDatasets` + `withLegacyDatasets(own)`, wired into all 18 registered project themes).

## Proposed changes

1. **Per component:** move the hardcoded classes into `Foo.theme.js` as named keys,
   `styles[0]` = the v6 look (tessera tokens — `var(--t-*)`, `.t-*` type classes); register in
   `ui/defaultTheme.js`; the component reads the theme the canonical way (see
   `src/dms/packages/dms/CLAUDE.md` "Theming — no Tailwind in markup").
2. **Legacy layer:** new `src/themes/_legacy/ui.js` holding today's hardcoded values verbatim, per
   component key, plus a `withLegacyUi(theme)` helper that fills in only the keys a theme doesn't set
   itself (top-level component keys, not under `datasets`). Wire it into every registered project
   theme (same 18 as `withLegacyDatasets`). Result: default theme = v6, every project = unchanged.
3. **Later (not this task):** a project that wants its own look sets the component keys in its own
   theme file — they win over the legacy fill-in. MNY + transportny could share one file
   (e.g. `src/themes/_shared/nys_ui.js`) — owner said they can look the same; palette undecided.

## Files requiring changes

- `src/dms/packages/dms/src/ui/components/{Switch,Colorpicker,CardColumnPicker,Textarea,Button,Pagination,Card,Pill}.jsx`, `navigableMenu/{index,theme}.jsx`
- `src/dms/packages/dms/src/patterns/page/components/sections/sectionMenu.jsx` (action-row Pills → opt-in style)
- matching `*.theme.js` siblings (new or extended)
- `src/dms/packages/dms/src/ui/defaultTheme.js` — register the new keys
- `src/themes/_legacy/ui.js` (new) + every registered project theme file (wrap with `withLegacyUi`)
- TransportNY vendored copy (`transportNY/src/dms_themes/`): copy `_legacy/ui.js` along with the
  theme on the next sync (same note as `_legacy/datasets.js`)
- `src/themes/tessera/design_system_v6/` — mockup / component catalog entries for any primitive
  without a v6 design yet (Switch is drawn in the datasets mockups' `switch()` helper)

## Testing checklist

- [x] Each component: default theme renders the v6 look, light + dark — Colorpicker + CardColumnPicker match ui-controls.html#color-picker / #column-picker (2026-10-17)
- [x] Each component: MNY, transportny (v1 + v2), wcdb, avail, landbank, fusion, tessera render
      exactly as before (screenshot compare against HEAD)
      — 2026-10-17: `scratchpad/prim-check` HEAD vs working tree, 13 project themes × light/dark, every element's rect +
      computed bg / border / radius / shadow: identical except the full picker's cursor (bug fix) and ±2px font-timing jitter
- [x] Switch states: on / off, all three sizes, light + dark — match `ui-controls.html#switch` (2026-10-16). Disabled dimmed to 40% (2026-10-16); project themes unchanged.
- [x] Section menu (edit + not-editing + a submenu) matches page-edit.html / page-section-menu.html in the default theme; MNY / TNY menus unchanged — done in the UI controls effort (see the resume block; not re-checked 2026-10-17)
- [x] `npm run build` clean (2026-10-17 ✓; its 10 css warnings are pre-existing Catalyst `has-[…]` classes); eslint on touched files: parse / undefined / unused only
- [x] Local check only (scratch sqlite server + second Vite; never the 5173 dev server or prod)

## Follow-up 2026-10-17 — Lexical colour picker swatches (lib dfa45794 / root bf81d923)
Owner: "lexical also has color picker that doesn't show swatches." Regression from this task's commit (04459385): the
v6 `swatch` style is a grid cell with no width of its own, and Lexical's `editor/ui/ColorPicker.tsx` (toolbar text /
background colour) still laid swatches out in its own `flex flex-wrap` row → 0px wide. It now reads its swatch row and
swatch styles from the shared `colorPicker` theme (default = the 8-column grid; project themes = the frozen flex row,
the same string Lexical had). Checked in the editor (`scratchpad/lex-toolbar2`, session `lexcolor.mjs`): default 15
swatches at 18×24 in the grid; MNY / TNY v2 16×16 as before, light + dark, no errors.
Left as is (pre-existing, not part of the regression): Lexical's saturation square renders flat (its arbitrary-value
multi-gradient class compiles to nothing under Tailwind v4 — the main picker sets it inline), its cursor uses the old
px-vs-width maths, and the grid sits flush under the hex field.
