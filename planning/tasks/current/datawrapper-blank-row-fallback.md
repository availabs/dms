# dataWrapper blank-row fallback for empty results

## Status: IMPLEMENTED — 2026-05-08 (pending live test)

Phases 1-3 shipped. Decisions locked:

- **Field name:** `display.useBlankRowFallback` (matches existing `display.use*` shape).
- **Toggle location:** `controls.data` group (data-loading behaviour, not section chrome). Sits right below `Always Fetch Data`.
- **Per-column control:** `inHeader` "Empty Default" entry, gated on `isEdit && display.useBlankRowFallback === true`. Mounts `columnTypes[attribute.type].EditComp` so every column type — text, textarea, portrait_banner, image, calc-text, etc. — gets a type-appropriate authoring widget for free.
- **Synthesis:** `getData.js` tail, before the final return. Keys the synthetic row by `column.normalName || column.name` to match the real-row shape; tags with `_isBlankFallback: true`; sets `length: 1`. Calc columns' `name` is the full SQL string and the lookup chain (`Card.jsx:357`) handles it transparently.
- **BC:** `display.useBlankRowFallback` defaults to absent/false → synthesis branch never fires → `getData.js` returns `{ length: 0, data: [] }` exactly as before.

### Open questions left for live testing

- `hideIfNull` precedence when both flags are on — likely "fallback wins" (synthesized row counts as data from `hideIfNull`'s perspective). Verify on the WCDB now-airing card by toggling both.
- Pagination + fallback on page 2+. Current implementation always fires when `length === 0`, regardless of page. May want to gate to page 1 only — note actual behaviour in testing.
- Total-row suppression in fallback mode. Implementation does NOT specifically suppress; the totals query runs separately and would also return all-null totals. Verify visually in testing if a section has both `showTotal` and `useBlankRowFallback`.

### Files touched

- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/getData.js` — synthesis branch (~25 lines including comment).
- `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx` — `controls.data` toggle (1 line + comment), `inHeader` "Empty Default" entry (~25 lines including comment).
- No changes to `Card.jsx`, column-type renderers, `useDataLoader`, the loader's caching layer, or filter / pagination / sort code paths.

### First consumer (smoke test, not yet done)

WCDB now-airing card: toggle `useBlankRowFallback: true` on the section, set `blankDefault` on the columns (e.g. caption → `"OFF AIR"`, description → `"WCDB 90.9 FM"`, portrait_banner → some string for hashed hue). Wait for an off-air slot or temporarily edit the schedule to remove the active row. Verify the card renders with placeholder values.

---

## Objective

When a data-driven section's query returns 0 rows AND the section has opted in, `getData.js` synthesizes a single "blank" row from per-column `blankDefault` values, sets `length: 1`, and tags the row with `_isBlankFallback: true` so the section renders its normal card chrome with placeholder values instead of collapsing to an empty state.

The driving use case is the WCDB now-airing card during off-air hours: the time-filter returns 0 rows when no show is scheduled, and rather than rendering nothing (or rendering a generic empty-state component), the author wants the same card chrome with values like `show_name: 'Off Air'` / `description: 'WCDB 90.9 FM'` / banner hue still hashed for visual continuity.

This is broadly useful — any "currently active" card (event calendars, "now serving" indicators, status displays) wants a graceful empty rendering that uses the same column types and styling, not a parallel empty-state UI to maintain.

## Backwards compatibility — non-negotiable

**Opt-in. Defaults to false. No synthesis runs unless explicitly enabled.** Existing sections render byte-identical to today:

- `display.useBlankRowFallback` (or chosen name — see Open Questions) defaults to `false` / absent. Without it, `getData.js` returns `{ length: 0, data: [] }` exactly as it does today.
- Per-column `blankDefault` is also opt-in; columns without it produce `null`/`undefined` in the synthetic row (and the column's renderer handles missing values per its existing semantics, which it already does for nullable real data).
- The `_isBlankFallback` marker is namespaced (leading underscore) so it can't collide with a column whose `name` happens to be `isBlankFallback`. Renderers ignore it unless they specifically opt in to differentiated styling.
- No changes to filter / pagination / sort / total-row machinery for sections that haven't opted in. For sections that have, those concepts are noop'd in fallback mode (one synthetic row, no paging, no totals).

## Scope

**In:**

- New section-level display flag (e.g. `display.useBlankRowFallback: boolean`) controlling whether the empty-result fallback fires.
- New per-column field `blankDefault` — an arbitrary scalar matching the column type's value shape (string for text / textarea / calc-text, hue number or string for portrait_banner, URL for image, etc.).
- `getData.js` synthesis: when `length === 0` and the section opted in, build one row keyed by `column.normalName || column.name` (matching the real-row key shape) with each column's `blankDefault` (or `null` if absent), set `_isBlankFallback: true` on the row, return `{ length: 1, data: [row] }`.
- Authoring UI:
  - Section "more" menu gets a toggle: "Render Blank Row When Empty" (or similar — match the toggle naming style of neighbouring controls like "Allow Edit" / "Hide if No Data").
  - Per-column toolbar gets an "Empty Default" entry that mounts the column type's existing `EditComp` bound to `attribute.blankDefault`. Gated on `display.useBlankRowFallback === true` (no point editing per-column defaults if the section hasn't opted in).
- Calc columns get the same per-column UI as bare data columns. The user types the literal final value they want shown; **no SQL re-evaluation in fallback mode**. The calc expression is irrelevant to the rendered fallback.

**Out:**

- Network-error / source-failure fallback. That's a separate signal ("the query never completed") from "the query returned 0 rows," and conflating them hides real failures behind the placeholder. If wanted, file a sibling task that adds an `errorFallback` opt-in to the loader; this task only covers the success-but-empty case.
- "Hide if No Data" interactions. The existing `hideIfNull` / `hideSection` flags short-circuit before render; if a section sets both `hideIfNull: true` AND `useBlankRowFallback: true` we have a conflict. Pick one or the other in the editor (toggling on the new flag turns off the old one, or document the precedence). Decision in implementation.
- Custom blank-row-only styling beyond what column renderers already give for empty values. The marker `_isBlankFallback: true` is exposed for renderers that *want* to differentiate (greyed-out, italic, "off air" pill, etc.), but the default behaviour is the same as a real row with empty cells.
- Multi-row blank states ("show 3 placeholder rows in a list"). Single-row fallback is the v1 deliverable; multi-row is a separate feature if it ever comes up.
- Server-side filtering against the synthetic row. The fallback fires entirely client-side after the empty response — server filters / pagination / sort never see it.
- A separate "blank-row template" registry. Defaults are flat per-column; if a site needs to share defaults across many sections that's a content-management problem solved by copy/paste of column metadata, not a new abstraction.

## Current State

### Empty-result render path today

Card section with empty filter returns:

```
getData → { length: 0, data: [] }
    ↓
useDataLoader → state.data = []
    ↓
Card.jsx → visibleColumns rendered, but data.map(item => …) iterates 0 times
    ↓
The cards-grid div has no children → 0 height. The section above it
collapses unless something has imposed a min/explicit height.
```

The collapse is what motivated the recent `editMinHeight: 40px` token in `section.theme.jsx` — the settings handle becomes unreachable in edit mode otherwise. View mode just shows nothing.

### Per-column key shape (the load-bearing piece)

`getData.js:288-302` post-processes server rows by writing values under `column.normalName || column.name`. For calc columns, `name` is the full SQL string (`'(UPPER(...) || ...) as alias'`). The synthetic row MUST use the same keying or downstream lookups (`Card.jsx:357 source[attr.normalName] || source[attr.name]`) won't find the values.

### Per-column attribute editing

Existing per-column controls live in `Card.config.jsx`'s `inHeader` array. They're flat entries with `key`, `type` (`'select' | 'toggle' | 'input' | …` or a render function), and an optional `displayCdn`. The recently-shipped column-type-driven `cardControls` registry (see `Card.config.jsx:299-320`) flattens column-type-declared controls into the same array, auto-scoped by `attribute.type`.

### Column types' EditComp pattern

Every column type ships an `EditComp` (e.g. `TextEdit`, `PortraitBannerEdit`, `ImageEdit`) that knows how to render an editable form for its value shape. Signature is `({ value, onChange, placeholder, className, ...rest }) => JSX`. We can reuse it directly for the `blankDefault` editor, mounting it bound to `attribute.blankDefault` instead of a row value.

## Approach

### Phase 1 — `getData.js` synthesis

```js
// Drop in just before the final return:
//
// Empty-result fallback. Opt-in via display.useBlankRowFallback. Synthesizes
// a single row keyed by the same `normalName || name` shape getData uses for
// real rows, populated from each column's `blankDefault` (or null when
// absent). Tagged with `_isBlankFallback: true` so renderers can style
// differently if they care; default renderers see it like any other row
// with possibly-empty cells.
if (length === 0 && state.display?.useBlankRowFallback) {
    const blankRow = { _isBlankFallback: true };
    for (const column of state.columns || []) {
        if (column.show === false) continue;          // hidden cols don't need defaults
        const key = column.normalName || column.name;
        blankRow[key] = column.blankDefault ?? null;
    }
    return { length: 1, data: [blankRow], outputSourceInfo };
}
```

The synthesis runs *after* the real fetch + post-process, so calculated columns that have a SQL expression don't get re-evaluated — we just write the user's literal default into the row. If the real fetch errored, this branch doesn't fire (the error path returns earlier).

### Phase 2 — Section-level toggle

Add to `Card.config.jsx` `controls.data` — the toggle controls a **data-loading behaviour** (synthesis happens in `getData.js`), so it belongs alongside the other data-behaviour toggles (`allowEditInView`, `liveEdit`, `allowAdddNew`, `preventDuplicateFetch`, `readyToLoad`) rather than under the section-rendering `more` group. From the user's mental model: this is "what the dataset does when empty," not "how the section chrome behaves."

```js
{ type: 'toggle', label: 'Render Blank Row When Empty', key: 'useBlankRowFallback' },
```

Other section types that use `useDataWrapper` (Spreadsheet, Graph, Map) can wire the same toggle in their own `controls.data` arrays — out of scope for this task; the dataWrapper synthesis works for any of them once the flag is set, so they can adopt incrementally.

### Phase 3 — Per-column "Empty Default" control

Add to `Card.config.jsx` `inHeader`:

```js
// Mount the column type's existing EditComp as the blankDefault editor.
// Gated on the section toggle so authors don't see a control they can't
// use without enabling fallback first.
{ type: ({ attribute, setAttribute }) => {
        const ColType = columnTypes[attribute.type] || columnTypes.default;
        const Edit = ColType.EditComp || (() => null);
        return (
            <Edit
                value={attribute.blankDefault}
                onChange={v => setAttribute({ ...attribute, blankDefault: v })}
                placeholder="Empty-state default"
                className="w-full"
            />
        );
    },
    label: 'Empty Default', key: 'blankDefault',
    displayCdn: ({ display, isEdit }) => isEdit && display?.useBlankRowFallback === true,
},
```

The `display` object needs to be reachable from the displayCdn ctx. Check existing `displayCdn` usage in `Card.config.jsx` — `display` is already in the context for entries like `displayCdn: ({ display }) => display.usePagination === true`, so this works without plumbing changes.

### Phase 4 — Renderer marker (optional)

Renderers can opt into differentiated styling by checking `item._isBlankFallback`. Out of scope for this task to actually wire any renderer to use it — the marker is exposed for future consumers (a site might want to grey out the card body or add an "off air" pill). Card.jsx and column-type renderers stay unchanged.

## Files Requiring Changes

- [ ] `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/getData.js` — add the synthesis branch right before the final return. ~10-line change.
- [ ] `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx` — add the section-level toggle to `controls.data`, add the per-column "Empty Default" entry to `inHeader`. The per-column entry uses `attribute.type` to look up `columnTypes[type].EditComp`.
- [ ] No changes to `Card.jsx`, column-type renderers, `useDataLoader`, the loader's caching layer, or filter / pagination / sort code paths. Synthesis lives entirely in `getData.js`'s tail.

## Testing Checklist

### Backwards compatibility (must pass before functional tests)

- [ ] Existing sections without `display.useBlankRowFallback` set render byte-identical to today across all sites (WCDB, dmsdocs, b3nson, mitigat-ny). Diff DOM on a representative page that has at least one empty-result section in production.
- [ ] Existing sections that DO have empty results without the toggle continue to collapse exactly as today (or hide via `hideIfNull`, whichever they used).
- [ ] No new console warnings, no React key warnings.
- [ ] The new "Empty Default" per-column control is hidden when the section toggle is off — even on column types that don't support `blankDefault`. This keeps the toolbar uncluttered for non-fallback sections.

### Functional

- [ ] Enable the section toggle on the WCDB now-airing card. Set `blankDefault` on `description` to "WCDB 90.9 FM" and on the caption calc column to "OFF AIR". Wait for an off-air slot (or temporarily edit the schedule to remove the active row). Verify the card renders with the placeholder values — full chrome, banner still draws (with hashed default hue if banner has a `blankDefault`), description shows "WCDB 90.9 FM", caption shows "OFF AIR".
- [ ] Restore a scheduled show. Verify the card switches back to real data on the next minute boundary (`useNowTick` refetch), no flash of blank-state in between.
- [ ] Section with toggle on and zero `blankDefault` values set: verify the synthetic row renders with empty cells (not literally empty — the column renderers' "empty value" appearance — like an empty `<TextView>` with whitespace).
- [ ] Section with toggle on and `blankDefault` only on some columns: verify the row mixes real defaults with empty cells correctly.

### Calc-column specific

- [ ] Calc text column with `blankDefault: "OFF AIR"`: verify the rendered value is exactly "OFF AIR" — no SQL re-evaluation, no mangled key. The full SQL string is the row key (matches `column.name`); the renderer reads it via `Card.jsx:357`.
- [ ] Calc column with no `blankDefault`: verify the cell renders empty (not `[object Object]` or stringified SQL).

### Authoring UX

- [ ] Open the column toolbar on a non-fallback section. Verify "Empty Default" is hidden.
- [ ] Toggle the section flag on. Verify "Empty Default" appears for every column. The control mounts the column type's `EditComp` (text input for text columns, the portrait_banner editor for banners, etc.).
- [ ] Edit a `blankDefault`. Verify it persists to section state and round-trips through save/reload.
- [ ] Toggle the section flag off again. Verify the per-column `blankDefault` values are kept in state (not auto-cleared) — turning the flag back on should re-surface them.

### Edge cases

- [ ] Section with `hideIfNull: true` AND `useBlankRowFallback: true`: clarify which wins. Recommended: fallback wins (synthesized row is "data" from `hideIfNull`'s perspective, so the section renders). Document the precedence in `Card.config.jsx` and possibly disable one toggle when the other is on.
- [ ] Pagination + fallback: section with `usePagination: true` and an empty page-2 result. Should fallback fire? Probably yes for page 1; for page 2+ it's surprising. Recommend: fallback fires only when `length === 0` AND we're on page 1 (or no page is set). Document the call.
- [ ] Total row + fallback: the `display.showTotal` path adds a totals row. With 0 real rows, the totals are all-zero / null. Suppress the total row in fallback mode (no real rows to aggregate). Verify in implementation.
- [ ] Form-edit mode + fallback: an `allowEditInView` section with empty results — should the synthetic row be editable, or read-only? Recommend: read-only (treat `_isBlankFallback: true` as a non-editable sentinel; the actual data row id doesn't exist). The `id` field on the synthetic row is undefined, so the existing form-save path (which keys off `item.id`) noops naturally.

## Open Questions

- **Storage path / field name.** `display.useBlankRowFallback` matches the existing `display.usePagination` / `display.allowEditInView` shape. Alternatives: `display.emptyFallback` (shorter), `display.useEmptyDefaults` (descriptive). Pick on bikeshed in PR.
- **`hideIfNull` precedence.** Document or disable. Decision pending implementation; the conservative call is to disable `hideIfNull` when `useBlankRowFallback` is on (the toggle UI grays it out and explains why).
- **Column-type opt-out.** Some column types might not have a meaningful `blankDefault` (e.g. system columns, audit cols). Worth letting a column type declare `cardHints.noBlankDefault: true` to hide the per-column control? Probably overkill for v1 — every column shipped today has *some* sensible empty value (empty string, null, etc.). Add the opt-out only if a real column type asks for it.
- **Save vs. live-render of `blankDefault`.** When the author types a value in the empty-default editor and the filter currently has 0 real rows, should the card immediately re-render with the new default (so they can preview it)? `useDataLoader` returns the synthesized row, so yes — once the column attribute change triggers a `getData` re-run. Confirm the editor's `onChange` flushes through to a re-fetch.
- **Image / banner blankDefaults.** The portrait_banner takes either a number (hue) or a string (hashed). Default editor is `PortraitBannerEdit` which handles both. Image takes a URL. Confirm both render correctly with `blankDefault` values during testing — this is the main "non-text column type" case for v1.

## References

- Driver use case: `tasks/completed/wcdb-schedule-now-playing-card.md` (off-air state).
- Section-level render-config precedent: `display.allowEditInView` / `display.usePagination` in `Card.config.jsx`.
- Per-column-type controls registry (precedent for the `attribute.type`-keyed dispatch): `Card.config.jsx:299-320` (`deriveColumnTypeInHeaderEntries`).
- Column-type EditComp shape: `src/dms/packages/dms/src/ui/columnTypes/text.jsx`, `src/themes/wcdb/columnTypes/portraitBanner.jsx`.
- Empty-state collapse motivation: `tasks/current/section-height-setting.md` (`editMinHeight` token).
- getData synthesis insertion point: `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/getData.js` (final return at ~line 319).
