# Card row span + theme-registered column types + WCDB DJ portrait card

## Status

In progress — task created 2026-05-05. See [research/card-design-controls.md](../../research/card-design-controls.md) for the proposals this task implements (P1 + P2 + P3, plus a WCDB-theme proof of concept).

- Phase 1 (P1 — `cardRowSpan` + `rowHeight`): code changes landed (2026-05-05). Production build passes. Runtime verified by user — used row span to reformat the now-playing card. **Label cleanup also landed: per-column "Span" relabelled to "Col Span" in the Card menu** (state key `cardSpan` unchanged).
- Phase 2 (P2 — open the column-type registry): code changes landed (2026-05-05). Production build passes. Runtime UI verification pending.
- Phase 3 (P3 — `cardHints` chrome opt-out): code changes landed (2026-05-05). Production build passes. Runtime UI verification pending — needs a theme-registered banner column type to exercise (lands in Phase 4).
- Phase 4 (WCDB DJ portrait card PoC): code changes landed (2026-05-05). Production build passes. Theme registers `portrait_banner` type with full `cardHints` (`fullBleed`, `spanFullColumns`, `height: 200`, `defaultHideHeader`); THEMING_GUIDE.md has a new "Theme-registered column types" section. Runtime UI verification pending — needs a Card section bound to a real source with `type: 'portrait_banner'` set on a column.

## Backwards compatibility invariant — do not violate

**Every change in this task is purely additive. No card that already exists in any database must render or behave differently after this task ships.** Specifically:

- A card whose state has no `cardRowSpan` on any column and no `rowHeight` on display must produce **byte-identical** DOM and styles to the pre-task version.
- A column whose `type` resolves to a built-in (`text`, `multiselect`, `lexical`, `dms-format`, etc.) must not pick up any new `cardHints` behavior — built-ins ship without hints, and the absence of hints is a no-op code path.
- A theme that does not declare `theme.columnTypes` must boot with exactly the same registry as before.
- A column added via the existing `CardColumnPicker` flow whose type has no `cardHints.defaultHideHeader` must default to the same field shape as before (`hideHeader=false` unless the user sets it).
- Spreadsheet must render identically — no new control in `inHeader`, no visual change to row height, no read of `cardRowSpan`.
- Phase 4 (WCDB DJ portrait card) is opt-in via theme + section configuration; sites running on `default`/`catalyst`/`mny`/`avail` themes are untouched.

**Concrete implementation rules to enforce this:**

1. `gridRow` style is only set when `compactView=false` AND the column has an explicit `cardRowSpan`. Don't write `span 1` when the user hasn't asked for it — let CSS auto-flow keep its default.
2. `gridAutoRows` is only set on the sub-grid when `display.rowHeight` has a value OR when at least one visible column has `cardRowSpan > 1`. Otherwise omit the property entirely so existing cards keep their default `auto` rows.
3. `cardHints` lookup uses `?.cardHints || {}` and every behavior key is gated by an explicit truthy check — e.g. `if (hints.fullBleed)` — so an entry without hints flows through the original code path unchanged.
4. `theme.columnTypes` registration is gated by `if (theme.columnTypes)` — themes without the key never call `registerColumnType`.
5. The default export of `ui/columnTypes/index.jsx` keeps the same object identity and the same set of pre-existing keys; we only mutate by adding *new* keys, never by removing or rebinding existing ones.
6. No control's `defaultValue` changes — `cardRowSpan` defaults to undefined (not `1`), `rowHeight` defaults to undefined.

Each phase's checklist includes an explicit "no change for existing cards" verification step.

## Objective

Give the `Card` page-section enough design control to faithfully reproduce two recurring WCDB design-system patterns:

1. **Album-cover-spans-rows** — a column that occupies multiple rows of the inner sub-grid alongside text columns. Needs row span in cell mode.
2. **DJ portrait card** — a tile with a banner across the top (computed gradient + overlaid initials), a corner-pinned "SINCE 2021" pill, and stacked text below. Needs (a) a column-type registry that themes can extend, (b) a way for a column type to opt out of the field chrome (full-bleed, fixed height, etc.).

The task closes both via three layered changes (P1, P2, P3 from the research doc) plus a final phase that ships the DJ portrait card as the proof of concept against the existing `wcdb` theme.

## Scope

### In scope

- **P1.** `cardRowSpan` per-column control in cell mode (`compactView=false`); row-span styling on the sub-grid; admin "Row Height" knob at the display level so users can pin row sizing.
- **P2.** Open `ui/columnTypes` registry; auto-register `theme.columnTypes` in `patterns/page/siteConfig.jsx`; admin column-type pickers list theme-registered types.
- **P3.** `cardHints` metadata on column-type definitions; `Card.jsx` consults hints to skip/adjust the field chrome (full-bleed, span-full, fixed height, default hideHeader).
- **P4.** WCDB theme ships a `portrait_banner` column type and a worked example DJ portrait card section showing the full design-system pattern.

### Out of scope

- Card-level layout slots (banner / overlay / body) — research doc P4. Defer until a second design needs it.
- Spreadsheet *use* of `cardRowSpan` — Spreadsheet's table layout is fixed-row; row span is meaningless there. We **do** keep Spreadsheet's copy/paste-format compatible (see Spreadsheet parity below).
- Server-side or API changes — pure client.
- Replacing `isImg` — the existing image controls keep working unchanged. New custom column types are an additional path.
- Generic per-row conditional theming (e.g. "live show" red-border treatment on schedule cells).

## Decisions captured during planning

| Question | Decision |
|---|---|
| Spreadsheet parity for `cardRowSpan` | Keep copy/paste compatible — copy/paste shape includes `cardRowSpan` so format round-trips between Card and Spreadsheet without losing the field. Spreadsheet does **not** show the control in `inHeader` and ignores `cardRowSpan` at render time. |
| Default sub-grid row sizing | Set a sensible default (`gridAutoRows: minmax(0, auto)`). Also expose a display-level "Row Height" knob for users who want predictable row sizing. |
| Column-type registration channel | `theme.columnTypes` only (declarative). No imperative `registerColumnType()` API in this task. |
| Where auto-registration lives | `patterns/page/siteConfig.jsx`, alongside `theme.pageComponents`. Datasets / forms / mapeditor are developer-only surfaces and don't need theme-registered types yet. |
| Admin "type" picker | Theme-registered types appear in the picker for all columns, with no tagging or grouping. |
| Naming collisions | If a theme registers a name already in the registry, override silently. Themes are trusted code. |
| Scope of the proof of concept | Final phase ships a `portrait_banner` column type + a DJ portrait card section in the wcdb theme. Validates P2+P3 end-to-end. |

## Current state (2026-05-05)

### Card render path

- `ui/components/Card.jsx` — root `Card` (line 670), `RenderItem` (`memo`, line 519), `CardColumnField` (line 327).
- The `cardSpan` styling lives on `CardColumnField` at lines 394-400:
  ```js
  const span = compactView ? 'span 1' : `span ${attr.cardSpan || 1}`;
  // ...
  const style = {
      gridColumn: span,
      padding: compactView ? undefined : padding,
      paddingBottom: compactView && attr.pb ? +attr.pb : undefined,
      marginTop: `${imageMargin}px`,
      backgroundColor: compactView ? undefined : attr.bgColor
  };
  ```
- `subWrapperStyle` (`Card.jsx:705-711`) only sets `gridTemplateColumns`. It does not declare any `gridAutoRows`; row span there will work but with implicit row heights.
- Field chrome lives on `CardColumnField`'s outer `<div>` (`Card.jsx:418-424`) plus the header block (`Card.jsx:430-442`) and value block (`Card.jsx:443-513`). Each uses theme classes from `theme.headerValueWrapper`, `theme.header`, `theme.value`, etc.

### Column type registry

- `ui/columnTypes/index.jsx:22-57` exports a frozen object literal `columnTypes`. Used by `Card.jsx:246`:
  ```js
  const Comp = ColumnTypes[attribute.type]?.[editMode ? 'EditComp' : 'ViewComp'] || DefaultComp;
  ```
- `UI` re-exports it as `ColumnTypes` at `ui/index.js:41,95`.
- Admin column-type select lives in `patterns/page/components/sections/ColumnManager.jsx:152` (uses `columnTypes`) and is also referenced from `ConditionValueInput.jsx:137-149`, `RenderFilterValueSelector.jsx:64-108`, `ValidateComp.jsx:175-180`, `richtext/index.jsx`, and the datasets `default/overview.jsx`. None of these will be touched in this task — the registry stays a regular object on the public side, just mutable internally.

### Theme-side registration precedent

- `theme.pageComponents` auto-register at `patterns/page/siteConfig.jsx:51-58`.
- `registerWidget(name, def)` (imperative) at `ui/widgets/index.js`.
- This task adds a third theme channel (`theme.columnTypes`), modeled on `pageComponents`.

### Existing Card config

- Card's `inHeader` controls (`patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx:74-215`).
- Copy/paste-format helpers (`Card.config.jsx:31-72`). The `objToCopy` fields list at line 50-59 must be expanded to include `cardRowSpan`.
- Spreadsheet's copy/paste helpers (`spreadsheet/config.jsx:33,38,158,160`). Same expansion needed for symmetry.

### WCDB design reference

- DJ portrait card mock: `src/themes/wcdb/WCDB Design System/design_handoff_wcdb_design_system/scripts/wcdb-patterns.jsx:65-89`.
- WCDB tokens: `src/themes/wcdb/tokens.css`, `src/themes/wcdb/wcdb_theme.js` (textSettings + dataCard blocks).

## Phased plan

### Phase 1 — `cardRowSpan` (P1) — IMPLEMENTED 2026-05-05

**Goal:** A column in cell mode (`compactView=false`) can span N rows of the inner sub-grid. Display-level "Row Height" knob lets users control sub-grid row sizing.

**Implementation notes:**
- `Card.jsx` — `gridRow` is set via spread `...(!compactView && attr.cardRowSpan ? { gridRow: ... } : {})` so the property is *absent* when no row span is requested (preserves byte-identical computed style for legacy cards).
- `Card.jsx` — `subWrapperStyle` adds `gridAutoRows` only when `display.rowHeight` is set OR a column has `cardRowSpan > 1`; computed via a `hasRowSpan` memo over `visibleColumns`.
- `Card.config.jsx` — `cardRowSpan` per-column control sits next to `cardSpan` (cell mode only); `rowHeight` is in the Grid Settings group (cell mode only); copy/paste shape includes `cardRowSpan`.
- `spreadsheet/config.jsx` — copy/paste shape includes `cardRowSpan` for round-trip; spreadsheet `inHeader` does **not** expose the control and the spreadsheet renderer does not consume the field.

**Changes:**

1. `ui/components/Card.jsx`
   - In `CardColumnField`'s `style` object (`:394-400`), add `gridRow` **only when explicitly set** so existing cards (no `cardRowSpan`) produce identical styles:
     ```js
     gridRow: !compactView && attr.cardRowSpan ? `span ${attr.cardRowSpan}` : undefined
     ```
   - In `subWrapperStyle` (`:705-711`, cell-mode branch only), add `gridAutoRows` **only when needed** — either the user set a `rowHeight`, or at least one visible column declares a `cardRowSpan`. Otherwise omit the property entirely so legacy cards keep CSS Grid's default `auto`:
     ```js
     // computed once outside the memo, similar to cardsWithoutSpanLength:
     const hasRowSpan = useMemo(() => visibleColumns.some(c => c.cardRowSpan > 1), [visibleColumns]);
     // inside subWrapperStyle (cell-mode branch only):
     ...(display.rowHeight ? { gridAutoRows: `${display.rowHeight}px` } :
         hasRowSpan ? { gridAutoRows: 'minmax(0, auto)' } : {}),
     ```
   - Capture `display.rowHeight` in the destructure at `:684`.
2. `patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx`
   - Add `cardRowSpan` control next to `cardSpan` at `:167`:
     ```js
     { type: 'input', inputType: 'number', label: 'Row Span', key: 'cardRowSpan',
       displayCdn: ({ display }) => !display.compactView },
     ```
   - Add `cardRowSpan` to the copy/paste-format object literals at `:50-59`, `:63`, `:81-83`.
   - Add a display-level "Row Height" input under the `Grid Settings` group in `more` (around `:288-294`):
     ```js
     { type: 'input', inputType: 'number', label: 'Row Height', key: 'rowHeight',
       displayCdn: ({ display }) => !display.compactView },
     ```
3. `patterns/page/components/sections/components/ComponentRegistry/spreadsheet/config.jsx`
   - Add `cardRowSpan` to copy/paste shape at `:33`, `:38`, `:158`, `:160` (so format round-trips between Card and Spreadsheet).
   - Do **not** add `cardRowSpan` to the spreadsheet `inHeader` (control is hidden in spreadsheet).
   - Spreadsheet's renderer ignores `cardRowSpan` automatically — its layout doesn't read the key.

**Verification:**
- A column with `cardRowSpan: 3` and `cardSpan: 1` in cell mode renders left-most spanning three rows of right-side text columns. Album-cover example matches the design.
- Copy format from a Card column → paste into a Spreadsheet column → `cardRowSpan` is preserved on the spreadsheet column even though it's not displayed there. Re-paste back into a Card column and the row span re-applies.
- Row Height knob: setting `rowHeight: 60` makes every implicit row 60px tall; clearing it falls back to `minmax(0, auto)`.

### Phase 2 — Open the column-type registry (P2) — IMPLEMENTED 2026-05-05

**Goal:** Themes can ship a `theme.columnTypes` map that auto-registers into the column-type registry. Mutations are visible everywhere `columnTypes` is consumed.

**Implementation notes:**
- `ui/columnTypes/index.jsx` — exposed `registerColumnType(name, def)` and `getColumnTypes()` named exports. Default-export `columnTypes` object identity preserved (mutated in place); existing consumers keep working unchanged.
- `patterns/page/siteConfig.jsx` — added `if (theme.columnTypes) Object.entries(...).forEach(registerColumnType)` next to the `theme.pageComponents` block.
- Spot-check confirmed: `ColumnManager.jsx`, `section_components.jsx`, `ConditionValueInput.jsx`, `RenderFilterValueSelector.jsx`, `Permissions.jsx`, `navigableMenu/index.jsx`, `TableHeaderCell.jsx` — all access types via `columnTypes[name]` or `UI.ColumnTypes[name]` without memoizing entries at module-load time.
- Per-planning-decision: dataset metadata column-type dropdown (`RenderField.jsx:25-32`, hardcoded list) is dev-only and intentionally not updated to surface theme types.

**Changes:**

1. `ui/columnTypes/index.jsx`
   - Convert the default-exported object literal into a mutable internal registry object with the same shape and identity:
     ```js
     const columnTypes = { /* current entries */ };
     export function registerColumnType(name, def) {
         if (!name || !def) return;
         columnTypes[name] = def;
     }
     export default columnTypes;
     ```
   - The default export stays the same object reference, so existing consumers (`ColumnTypes[type].EditComp` etc.) are unchanged. We must **mutate** the object in place rather than reassigning, so that already-imported references see the new entries.
   - Export `registerColumnType` from `ui/columnTypes/index.jsx`. Do **not** re-export it from `ui/index.js` or `packages/dms/src/index.js` — the imperative API is internal to this task; themes use the declarative channel.

2. `patterns/page/siteConfig.jsx`
   - Right next to the `theme.pageComponents` block (`:51-58`), add:
     ```js
     if (theme.columnTypes) {
         Object.entries(theme.columnTypes).forEach(([k, v]) => registerColumnType(k, v));
     }
     ```
   - Import `registerColumnType` from `../../ui/columnTypes`.

3. **Admin picker rebuilds.** Verify (do not assume) that `ColumnManager.jsx:152` and other admin selects re-read `columnTypes` on each render. If any pin the entries at module scope, refactor to read on render. Spot-check while implementing — if all sites already re-read, no change required.

**Verification:**
- A theme with `columnTypes: { foo: { EditComp, ViewComp } }` boots cleanly; a column with `type: 'foo'` renders the theme's `ViewComp`.
- The admin "Add column" / "edit column type" picker lists `foo` alongside built-ins.
- Built-in types still work; if a theme registers `text`, the theme's version wins silently.

### Phase 3 — Column-type `cardHints` (P3) — IMPLEMENTED 2026-05-05

**Goal:** A column type can declare layout hints that the Card respects. Specifically, a banner column should be able to opt out of the `headerValueWrapper` chrome, claim full sub-grid width, fix its height, and default `hideHeader` when added.

**Implementation notes:**
- `Card.jsx` `CardColumnField` — looks up `ColumnTypes[attr.type]?.cardHints || {}` once. Hints applied:
  - `fullBleed: true` swaps the wrapper class to `theme.headerValueWrapperFullBleed`, zeroes out `style.padding`/`paddingBottom`, and suppresses the header block entirely (`headerVisible = !fullBleed && (...)`).
  - `spanFullColumns: true` overrides `style.gridColumn` to `'1 / -1'`.
  - `spanFullRows: true` overrides `style.gridRow` to `'1 / -1'` (takes precedence over `cardRowSpan`).
  - `height: number` sets `style.height = '${hints.height}px'`.
- `card.theme.jsx` — added `headerValueWrapperFullBleed: 'w-full relative overflow-hidden'`. `cardSettings()`'s Wrappers section auto-includes any key matching `*Wrapper*`, so the new key is editable in the theme admin without touching the settings function.
- `CardColumnPicker.jsx` — new `applyCardHintDefaults(col)` helper imports `columnTypes` and seeds `hideHeader: true` on freshly added columns whose type declares `cardHints.defaultHideHeader: true`. Only applied to *new* columns from the source list (the `else` branch); duplicates inherit from the base column they copy. Existing columns with `hideHeader` already set are not re-defaulted (gated by `col.hideHeader === undefined`).

**Hint shape:**

```js
{
    EditComp,
    ViewComp,
    cardHints: {
        fullBleed: true,         // skip headerValueWrapper padding/border
        spanFullColumns: true,   // gridColumn: 1 / -1
        spanFullRows: false,     // gridRow: 1 / -1 (rare, but symmetric with above)
        height: 200,             // optional fixed height in px
        defaultHideHeader: true, // when admin adds this column, default hideHeader=true
    },
}
```

**Changes:**

1. `ui/components/Card.jsx`
   - In `CardColumnField`, look up the column type's hints once:
     ```js
     const hints = ColumnTypes[attr.type]?.cardHints || {};
     ```
   - Apply to the wrapper:
     - When `hints.fullBleed`, skip the `headerValueWrapper` padding classes (use a bare wrapper class that has no padding/border).
     - When `hints.spanFullColumns`, override the `gridColumn` style to `1 / -1`.
     - When `hints.spanFullRows`, override `gridRow` to `1 / -1`.
     - When `hints.height` is a number, set `style.height = ${hints.height}px`.
   - For the header block (`:430-442`), suppress entirely when `hints.fullBleed` is true (no header chrome on a banner) — equivalent to `attr.hideHeader` being implicitly on for that column.
2. `ui/components/card.theme.jsx`
   - Add a `headerValueWrapperFullBleed` theme key for the bare wrapper (no padding, no rounded corners — just the full-bleed slot).
   - Update `cardSettings()` so the new key is editable in the theme admin.
3. `patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx`
   - When admin **adds** a column whose type has `cardHints.defaultHideHeader: true`, the default `hideHeader` should be true. The "add column" plumbing lives in `CardColumnPicker.jsx` (the `confirm` function around `:69-103`); when staging columns from the source list, check the looked-up type's `cardHints` and seed defaults.
   - **Note:** static-column flow (`StaticColumnForm`) does not need this — static columns don't have a column type bound at creation time.
4. **Edit-mode behavior.** When `isEdit` is true and the user hovers a banner column, the card-edit menu (`NavigableMenu` at `:405-416`) should still open and allow normal column ops (move/remove/etc.). Verify by hovering during implementation.

**Verification:**
- A column with type `portrait_banner` (defined with `cardHints.fullBleed=true, height=200, defaultHideHeader=true, spanFullColumns=true`) renders edge-to-edge inside the card, no header text, no inner padding, fixed 200px tall, and spans the entire sub-grid width.
- Admin can still hover the banner column and access the column menu.
- Normal columns are unaffected — they pick up the existing chrome.

### Phase 4 — WCDB DJ portrait card (proof of concept) — IMPLEMENTED 2026-05-05

**Goal:** Ship a working DJ portrait card section in the `wcdb` theme that visually matches `design_handoff/scripts/wcdb-patterns.jsx:65-89`.

**Implementation notes:**
- New theme files (per package HMR rules, components and metadata split):
  - `src/themes/wcdb/columnTypes/portraitBanner.jsx` — exports `PortraitBannerView` and `PortraitBannerEdit`. View renders a `linear-gradient(135deg, oklch ramp)` block at the configured height, with overlaid initials when the value is a string (numeric values are interpreted as direct hue 0..1; strings are hashed to a stable hue). Edit comp is the view + a plain text input.
  - `src/themes/wcdb/columnTypes/portraitBanner.config.js` — default-exports the registry entry with `cardHints: { fullBleed: true, spanFullColumns: true, height: 200, defaultHideHeader: true }`.
- `src/themes/wcdb/wcdb_theme.js` — adds `columnTypes: { portrait_banner: portraitBanner }` to the theme.
- `src/dms/packages/dms/src/ui/THEMING_GUIDE.md` — new "Theme-registered column types" section above Troubleshooting, documenting the contract, file conventions, the `cardHints` table, collision behavior, where types appear, and backwards-compat guarantees.

**Design deviations from the WCDB mock noted on the research doc:**
- The design originally has separate `name` and `hue` columns with the gradient computed from the latter and initials from the former. The proof of concept condenses this into a single column (value = name string, hue derived via stable hash) so the column-type comp doesn't need cross-column row data — the existing `CompWrapper` only passes that column's value, not the row. Accepting this as the simpler shape; cross-column compound types remain a P5 follow-up if/when needed.
- The "SINCE 2021" overlay pinned to the corner of the banner is not implemented in this phase. As anticipated in the research doc, that requires a layout/slot mechanism (P4 in the research, deferred). Acceptable for the proof of concept; the gap motivates a future overlay-slot design.

**Changes:**

1. **New WCDB column type.**
   - Path: `src/themes/wcdb/columnTypes/portraitBanner.jsx` and `portraitBanner.config.js` (per the package's HMR conventions in `packages/dms/CLAUDE.md` — components live in `.jsx`, metadata in `.config.js`).
   - `portraitBanner.jsx` exports `PortraitBannerView` and `PortraitBannerEdit`. View takes a `value` (a hue number 0..1, defaulting to 0.5) and renders the diagonal-gradient block; if `attribute.initialsFrom` is set, it pulls that *other* column's value off the row to compute initials. (Mechanism: receive the row through props on the value block — investigate; might need to expose `tmpItem` or row data to the column-type comp. If the existing prop surface doesn't include the row, document that as a follow-up rather than expanding the contract here. Fallback: column type renders only the gradient, and a sibling `text` column renders the initials with a separate column-type style.)
   - `portraitBanner.config.js` exports the default registry shape:
     ```js
     export default {
         EditComp: PortraitBannerEdit, // numeric input for the hue
         ViewComp: PortraitBannerView,
         cardHints: {
             fullBleed: true,
             spanFullColumns: true,
             height: 200,
             defaultHideHeader: true,
         },
     };
     ```
2. **Wire into the theme.**
   - In `src/themes/wcdb/wcdb_theme.js`, add a `columnTypes` block:
     ```js
     import portraitBanner from './columnTypes/portraitBanner.config';
     // ...
     columnTypes: { portrait_banner: portraitBanner },
     ```
3. **Sample DJ card section.** In whichever WCDB-bearing site is the design playground, build a real Card section that exercises this on real data (a `djs` source if one exists, or a stub local source). Cell mode / row mode choice: row mode (`compactView=true`) since the design is a tile grid. Columns:
   - `portrait_banner` (type: `portrait_banner`, value pulled from a `hue` column)
   - `since` (`text`, custom font style for the mono pill — verify if absolute positioning over the banner is achievable in row mode without P4 slots; if not, accept stacked positioning for this proof-of-concept and note the gap as a follow-up)
   - `name` (custom text with `text2XL` `valueFontStyle` for italic display)
   - `handle` (text with `caption` style)
   - `tagline` (text, default style)
4. **Document.** Update `src/dms/packages/dms/src/ui/THEMING_GUIDE.md` with a "Theme-registered column types" section showing the WCDB example.

**Verification:**
- The DJ card section visually matches the WCDB mock (banner + initials + name + handle + tagline) on a representative dataset.
- Disabling the WCDB theme (switching back to `default`) gracefully falls through — `portrait_banner` type is unknown, falls back to `DefaultComp` (`Card.jsx:235`), card still renders without errors.
- Theme switch round-trip: switch wcdb → default → wcdb without reload → portrait_banner re-registers and renders.

## Files requiring changes

### Phase 1 (P1)
- `src/dms/packages/dms/src/ui/components/Card.jsx` — `gridRow` style; `gridAutoRows` on sub-grid.
- `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx` — `cardRowSpan` control; `rowHeight` display control; copy/paste shape expansion.
- `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/spreadsheet/config.jsx` — copy/paste shape expansion (no inHeader control).

### Phase 2 (P2)
- `src/dms/packages/dms/src/ui/columnTypes/index.jsx` — mutable registry; `registerColumnType` export.
- `src/dms/packages/dms/src/patterns/page/siteConfig.jsx` — auto-register `theme.columnTypes`.
- (Spot-check, possibly no change) admin column-type pickers — confirm they re-read on render.

### Phase 3 (P3)
- `src/dms/packages/dms/src/ui/components/Card.jsx` — `cardHints` lookup + chrome adjustments.
- `src/dms/packages/dms/src/ui/components/card.theme.jsx` — `headerValueWrapperFullBleed` key + admin settings.
- `src/dms/packages/dms/src/ui/components/CardColumnPicker.jsx` — apply `defaultHideHeader` when adding a column whose type has that hint.

### Phase 4 (PoC)
- `src/themes/wcdb/columnTypes/portraitBanner.jsx` (new).
- `src/themes/wcdb/columnTypes/portraitBanner.config.js` (new).
- `src/themes/wcdb/wcdb_theme.js` — add `columnTypes` block.
- A new `Card` section in the wcdb design site that uses the new type.
- `src/dms/packages/dms/src/ui/THEMING_GUIDE.md` — add "Theme-registered column types" section.

## Testing checklist

### P1
- [ ] In cell mode, `cardRowSpan: 2` on one column makes it occupy two rows of the sub-grid; siblings flow into remaining cells.
- [ ] In cell mode, `cardRowSpan: 3` + 3 single-row siblings yields the album-cover layout from the research doc.
- [ ] Copy format from a Card column → paste onto a Spreadsheet column → `cardRowSpan` round-trips. Re-paste back to a Card column and row span re-applies.
- [ ] Spreadsheet renders rows identically to before (no visible row-span change).
- [ ] Row mode unaffected: `cardRowSpan` is ignored, no console errors.
- [ ] "Row Height" display knob: set to 60 → all sub-grid rows are 60px; clear → rows fall back to auto.
- [ ] **Backwards compat:** Existing cards (no `cardRowSpan` on any column and no `rowHeight`) produce byte-identical computed styles to the pre-task version. Verify by snapshotting `gridRow` (must be `undefined`/absent), `gridAutoRows` (must be absent), and the rendered `style` attribute on a representative existing card before and after the change.

### P2
- [ ] WCDB theme with `columnTypes: { foo: { EditComp, ViewComp } }` registers on boot.
- [ ] Column with `type: 'foo'` renders the theme component in view mode.
- [ ] Admin "Add column" picker / type select shows `foo` alongside built-ins.
- [ ] Switching back to `default` theme: built-ins still resolve; a column with `type: 'foo'` falls through to `DefaultComp` without crashing.
- [ ] Theme registers `text` (collision) → silently overrides; built-in still works for other themes that do not override.
- [ ] No regression in existing column types (text, multiselect, lexical, dms-format, etc.).
- [ ] **Backwards compat:** A theme without `theme.columnTypes` (e.g. `default`, `catalyst`, `mny`, `avail`) boots with the same registry contents and the same default export object identity as before. The set of pre-existing keys is unchanged.

### P3
- [ ] Column type with `cardHints.fullBleed=true` renders without `headerValueWrapper` padding/border; the value content reaches card edges.
- [ ] `cardHints.height: 200` produces a 200px tall column.
- [ ] `cardHints.spanFullColumns` forces `gridColumn: 1 / -1` regardless of `cardSpan`.
- [ ] `cardHints.defaultHideHeader: true` causes new columns added via the column picker to start with `hideHeader=true`.
- [ ] Hovering the banner column in `isEdit=true` still opens the column menu.
- [ ] Type with no `cardHints` behaves exactly like before.
- [ ] **Backwards compat:** Built-in column types ship without `cardHints`; their rendered DOM and computed styles are byte-identical to pre-task. Verify on text, multiselect, lexical, dms-format, and a column using `isImg`. Existing columns with `hideHeader=false` set explicitly stay `hideHeader=false` even after a hint with `defaultHideHeader=true` is added to the registry — the hint only affects newly added columns.

### P4
- [ ] DJ portrait card matches the WCDB mock on a representative dataset (banner gradient computed from `hue`, initials overlaid, name/handle/tagline below).
- [ ] Theme switch from wcdb → default → wcdb without reload: portrait card recovers.
- [ ] Edit mode: column controls (move/remove/format) work on the banner column.
- [ ] No regressions in other WCDB-themed cards.
- [ ] **Backwards compat:** Other already-configured WCDB cards (anything not using `portrait_banner`) render identically to pre-task. The `portrait_banner` type is purely additive — opting in requires a column to set `type: 'portrait_banner'`.

## Risks / things to watch

1. **Admin column-type pickers caching.** If any admin select memoizes the entries at module import time, theme-registered types won't appear without a refresh. Spot-check the call sites listed under "Current state" during Phase 2 implementation.
2. **Module identity for `columnTypes`.** P2 mutates the default export in place. Anything that destructures at module top level (e.g. `import { text } from '...'` — none today, but worth grepping) would freeze the entry. Keep all access through `ColumnTypes[name]`.
3. **HMR hygiene.** New theme files in `src/themes/wcdb/columnTypes/` must follow the package conventions in `packages/dms/CLAUDE.md` — components in `.jsx` with named exports only; metadata in `.config.js` siblings.
4. **Edit mode for banner columns.** A `portrait_banner` value is a hue (0..1). The `EditComp` should be a numeric input (or a slider, if cheap). Don't try to be clever with a swatch picker in this task.
5. **Row data for compound column types.** The DJ portrait card needs *initials* derived from a different column (the `name` column, not the `hue` column). The current `CompWrapper` (`Card.jsx:237-325`) doesn't pass the whole row to the column-type comp; it only passes that column's value. If we want initials inside the banner, we either: (a) add a sibling column for the initials, with its own font styling, layered absolutely; (b) extend the column-type comp's prop surface to receive the row. Option (a) is the cleaner first step and avoids contract changes; document option (b) as a possible follow-up if (a) feels awkward in practice.
6. **"SINCE 2021" overlay.** The mock pins the badge to the top-right corner of the banner. Without P4's overlay slots, the closest thing in row mode is a stacked column above or below the banner. For the proof-of-concept, accept stacked placement and note the visual gap as a follow-up that motivates P4.
7. **Spreadsheet round-trip robustness.** When a user pastes a Card-shaped format with `cardRowSpan` onto a Spreadsheet column and later copies *that* column back, the field must still round-trip. The fix is purely additive: include the key in both helpers' `objToCopy` and destructure lists.

## Open questions

- Should `gridAutoRows` apply only when at least one column has `cardRowSpan` set, to avoid changing layout for cards that never use row span? Lean toward **always** apply because `minmax(0, auto)` is the implicit CSS Grid behavior anyway, but worth double-checking the visual diff during implementation.
- Where exactly should the example DJ portrait card section live for the proof of concept? Need a WCDB-themed site with real DJ data, or a stub local source. To answer during Phase 4 setup.

## References

- Research: [card-design-controls.md](../../research/card-design-controls.md)
- Theming guide: `src/dms/packages/dms/src/ui/THEMING_GUIDE.md`
- Fast-Refresh / file conventions: `src/dms/packages/dms/CLAUDE.md`
- WCDB design system: `src/themes/wcdb/WCDB Design System/design_handoff_wcdb_design_system/patterns.html` and `scripts/wcdb-patterns.jsx`
