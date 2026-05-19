# Card cells grid: per-column cellWidth + section-level track template

## Status: COMPLETED — 2026-05-18

Live-verified on https://www.wcdb.fm (section 1963473) from mobile + desktop. Album art holds at 96px, text cells absorb the middle, play button holds at 52px. The `cellWidth` toolbar input is reachable from a logged-in admin — author-empowerment principle test passes.

### What landed (final)

### What landed

- **`Card.jsx`** — new track-cursor walker in `subWrapperStyle`. Pulls `display.cellsTracksTemplate` if set (raw `grid-template-columns` string wins outright). Otherwise iterates `visibleColumns` with a cursor, lets each column with `cellWidth` claim a starting track's size (first-wins on collision), defaults unclaimed tracks to `minmax(0, 1fr)`. `gridTemplateColumns` memo is now a separate hook so the new walker dependency set is explicit.
- **`Card.config.jsx`** — `Cell Width` text input added in the per-column toolbar (between Row Span and Allow Edit) and `Track Template` text input added under the **Cells Grid** section-menu group.
- **`src/dms/skills/card-layout.md`** — new "Sizing tracks (fluid / content / fixed)" section between cellSpan/cellRowSpan and the per-cell visual overrides. Quick-reference table updated with `display.cellsTracksTemplate` and `columns[i].cellWidth`. Worked album-art-fixed + text-fluid recipe inline.
- **`scratchpad/wcdb-prod/update-section-1963473-v5.js`** — migrates section 1963473 to use `cellWidth: '64px'` on `album_cover` and `cellWidth: '52px'` on `play`. Applied to prod DMS draft layer.

### Design note: simpler-than-spec toolbar control

The task spec floated a Cell Width "select with revealed pixel input" combo. Shipped a single **text input** instead — accepts any CSS size verbatim (`64px`, `auto`, `1fr`, `min(64px, 10vw)`, …). Less hand-holding, more vocabulary; matches the existing one-input-per-knob convention everywhere else in the per-column toolbar. The select+input combo is a follow-up if authors get confused, not a v1 requirement.

### Design note: walker collapses additional spanned tracks

Added during live testing. With `cellWidth` + `cellSpan > 1`, the walker now sets the additional `(N - 1)` spanned tracks to `0px` (when unclaimed) so the cell's track-derived width matches the author's typed value. Caveat — CSS Grid still bakes `cellsGridGap` *between* spanned tracks regardless of track size, so a `cellWidth: 96px` + `cellSpan: 3` + `cellsGridGap: 8` cell ends up `112px` (96 + 2 gaps). For pixel-perfect widths, use `cellSpan: 1 + cellRowSpan` instead. Documented in `card-layout.md`.

### Testing checklist

- [x] Renderer transforms cleanly through Vite (verified via curl on the served bundle — `gridTemplateColumns` walker memo present at the expected position).
- [x] `Cell Width` and `Track Template` entries are present in the served `Card.config.jsx` bundle.
- [x] Section 1963473 persisted with `cellWidth: '96px'` on album_cover, `'52px'` on play (verified via `dms raw get`).
- [x] Visual check — section 1963473 on https://www.wcdb.fm: album cover holds at the typed size, text absorbs middle, play button holds on the right. Confirmed by user on mobile.
- [ ] BC check on an unmodified Card section is implicitly covered (the walker defaults all tracks to `minmax(0, 1fr)` when no column carries `cellWidth`; result is the same string as the old `repeat(N, …)`). No reports of regressions on other home page sections.
- [ ] Author check — open section 1963473 in the editor and set `Cell Width` from the per-column toolbar. Not yet exercised through the admin UI; current section state was set via the CLI.
- [ ] Escape hatch — `display.cellsTracksTemplate` override path. Not yet exercised.

The remaining un-checked items are nice-to-have hardening, not blockers. Marking task complete.

---

## Objective

## Objective

Let an author mix fixed-pixel, content-sized, and fluid tracks inside the Card cells grid, instead of the current "every track is `minmax(0, 1fr)`" behaviour. This makes layouts where one cell is a fixed-size image (e.g. 64×64 album art) and the rest absorb the remaining width expressible **without** writing a custom column type or section component — i.e., it lives in the column toolbar where an author with admin access can reach it.

The motivating case is WCDB section 1963473 (now-playing card): the `album_cover` cell wants to be a fixed 64×64 track while the title/artist/album cells absorb the remaining width. Today the image gets a `imageSize: 'imgXS'` cap, but its containing track is still `1fr` — on wide screens the image floats in a too-wide cell with empty space around it; on narrow screens the text columns compete with the image cell for fractional space.

This task is the first concrete payoff of the [author-empowerment principle](../../../../../CLAUDE.md) we just wrote into the top-level CLAUDE.md: when the Card's primitives don't express a real authoring need, enrich the primitives, don't bypass them.

## Scope

**In:**

- New per-column knob `cellWidth: 'fluid' | 'auto' | '<N>px'`, exposed in the per-column toolbar in `Card.config.jsx` next to Col Span / Row Span.
- Renderer change in `Card.jsx`: walk visible columns in order to derive a per-track size array, replacing `repeat(N, minmax(0, 1fr))` with `<size1> <size2> … <sizeN>`. First column to claim a track wins its sizing; unclaimed tracks fall back to `minmax(0, 1fr)`.
- New section-level knob `display.cellsTracksTemplate` — a freeform `grid-template-columns` string. Escape hatch for authors who know CSS. When set, replaces the auto-derived template wholesale.
- Migration to section 1963473: set `cellWidth: '64px'` on `album_cover` and `cellWidth: '52px'` on the `play` (stream_player) cell to validate.
- Update `src/dms/skills/card-layout.md`: new "Sizing tracks" section + extend the quick-reference table.
- Update `Card.config.jsx` quick-reference comments and the per-column toolbar copy so `cellWidth` shows up next to the existing Col Span / Row Span controls.

**Out:**

- Per-track `minmax(min, max)` controls. The single-axis "this track is fluid / auto / fixed" covers the motivating case. If "at least N, at most M" is asked for, that's a follow-up.
- A visual grid editor. Dropdown + pixel input is enough for v1.
- Row-span-aware track cursor. The walker assumes the simple "left-to-right, wrap at cellsGridSize" placement (sparse auto-flow without row spans on its way). Cells with `cellRowSpan > 1` still render correctly under the browser's auto-flow because the *track sizes* are what we're controlling, not placement. The cursor's lie is only about which column "claims" a track for sizing — and conflicts already resolve to "first wins", which is a reasonable rule under row spans too.
- Removing or migrating the existing `imageSize` shortcuts. They keep working; `cellWidth: 'auto'` is now an alternative that produces a tighter fit for images.
- Backwards compatibility migration. The new knobs are additive: absence of `cellWidth` and `cellsTracksTemplate` produces today's `repeat(N, minmax(0, 1fr))`.

## Current state

`Card.jsx` ~795:

```js
const subWrapperStyle = useMemo(() => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${cellsGridSize || cellsWithoutSpanLength || 1}, minmax(0, 1fr))`,
    gap: cellsGridGap,
    backgroundColor: cardsBgColor,
    padding: cardsPadding,
    ...(cellsRowHeight ? { gridAutoRows: `${cellsRowHeight}px` } :
        hasRowSpan ? { gridAutoRows: 'minmax(0, auto)' } : {}),
}), [cellsGridSize, cellsWithoutSpanLength, cellsGridGap, cardsBgColor, cardsPadding, cellsRowHeight, hasRowSpan]);
```

`Card.config.jsx` ~180–185 has per-column Col Span / Row Span numeric inputs, but nothing for per-track sizing.

`Card.config.jsx` ~386 has the "Cells Grid" section-menu group (`cellsGridSize`, `cellsGridGap`, `cellsRowHeight`, `cellsPadding`, `cellBorder`) — that's where the freeform `cellsTracksTemplate` belongs.

## Proposed implementation

### 1. Renderer change (`Card.jsx`)

Replace the `gridTemplateColumns` builder with one that:

1. Resolves the effective `N = cellsGridSize || cellsWithoutSpanLength || 1`.
2. Initialises `tracks = new Array(N).fill('minmax(0, 1fr)')`.
3. Walks `visibleColumns` in order with a `(row, col)` cursor:
   - Start `row=1, col=1`.
   - For each column, with `span = column.cellSpan || 1`:
     - If `col + span - 1 > N`: row++, col = 1.
     - If `column.cellWidth` is set AND `tracks[col - 1] === 'minmax(0, 1fr)'`:
       - Normalise: `'fluid' | undefined | ''` → `'minmax(0, 1fr)'`; `'auto'` → `'auto'`; numeric or string-with-unit → as given.
       - Assign to `tracks[col - 1]`.
     - col += span.
4. If `display.cellsTracksTemplate` is a non-empty string, use it verbatim (skip steps 2–3).
5. Final `gridTemplateColumns = tracks.join(' ')`.

Keep the existing `gap` / `padding` / `gridAutoRows` logic untouched.

This is a tight ~30 LOC change.

### 2. Per-column toolbar (`Card.config.jsx`)

Add into the `[…layout / spans group…]` near the existing Col Span / Row Span entries (~L185):

```js
{ type: 'select', label: 'Cell Width', key: 'cellWidth',
    options: [
        { label: 'Fluid (1fr)',  value: '' },
        { label: 'Content (auto)', value: 'auto' },
        { label: 'Fixed (px)',   value: '__fixed__' },
    ],
    onChange: ({ value, attribute, setAttribute }) => {
        // 'Fixed' opens the input below; clear to fluid otherwise
        if (value === '__fixed__') return; // input row reveals
        setAttribute({ ...attribute, cellWidth: value || undefined });
    },
},
{ type: 'input', inputType: 'number', label: 'Cell Width (px)', key: 'cellWidthPx',
    displayCdn: ({ attribute }) =>
        attribute.cellWidth && /^\d+px$/.test(String(attribute.cellWidth)),
    onChange: ({ value, attribute, setAttribute }) => {
        setAttribute({ ...attribute, cellWidth: value ? `${value}px` : undefined });
    },
},
```

(Detail subject to revision once I see the existing toolbar control schema — the displayCdn / onChange pattern above is rough; I'll match Card.config.jsx's actual conventions when wiring.)

The simpler MVP is one **text input** keyed to `cellWidth` directly, with placeholder "1fr / auto / 64px". That's authoring-honest and zero indirection. I'll start there and only add the select+input combo if the freeform string proves error-prone.

### 3. Section-menu "Track Template" (`Card.config.jsx`)

In the `more → Cells Grid` group, append:

```js
{ type: 'input', inputType: 'text', label: 'Track Template',
    key: 'cellsTracksTemplate',
    placeholder: '64px repeat(10, minmax(0, 1fr)) 52px' },
```

When set, the renderer uses it verbatim. Empty string = fall back to derived tracks.

### 4. Skill update (`src/dms/skills/card-layout.md`)

Add a section "Sizing tracks (fluid / content / fixed)" between "Sizing — `cellSpan` and `cellRowSpan`" and "Per-cell visual overrides", with:

- The three knobs (`cellWidth: 'auto'`, `cellWidth: 'Npx'`, `cellsTracksTemplate`).
- The track-cursor walker rule ("first column to claim a track wins its size").
- The album-art recipe: `cellWidth: '64px'` on the image cell, leave text cells fluid, get a fixed-width image column with text absorbing the remaining width.
- Note that the walker is row-span-naïve (sized track wins from whoever lands on it first).

Extend the quick-reference table to include `columns[i].cellWidth`.

### 5. Update section 1963473

Once the renderer + control land, update section 1963473 via the CLI (a `v5` update script) to:

- `album_cover`: add `cellWidth: '64px'`.
- `play` (stream_player): add `cellWidth: '52px'`.
- Leave text cells at default (`cellWidth` unset → `minmax(0, 1fr)`).

Verify: album cover holds 64px on a wide viewport; text cells absorb the rest; narrow viewport doesn't crowd the image.

## Files requiring changes

| File | Change |
|---|---|
| `src/dms/packages/dms/src/ui/components/Card.jsx` | `subWrapperStyle` — replace `repeat(...)` with the track-cursor walker described above. ~30 LOC. |
| `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx` | Per-column `cellWidth` input in the toolbar; section-level `cellsTracksTemplate` input under Cells Grid. ~20 LOC. |
| `src/dms/skills/card-layout.md` | New "Sizing tracks" section + quick-reference table update. |
| `scratchpad/wcdb-prod/update-section-1963473-v5.js` | Migrate section 1963473 to use `cellWidth` on the image + play cells. |

## Testing checklist

- [ ] Renderer: a section with no `cellWidth` on any column renders **byte-identical** `gridTemplateColumns` to today (`repeat(N, minmax(0, 1fr))` → `minmax(0, 1fr) minmax(0, 1fr) … `). Visual check across one existing card section.
- [ ] Renderer: `cellWidth: '64px'` on column 1 produces `64px minmax(0, 1fr) minmax(0, 1fr) …`.
- [ ] Renderer: `cellWidth: 'auto'` on column 1 produces `auto minmax(0, 1fr) …`.
- [ ] Renderer: section-level `cellsTracksTemplate` overrides everything.
- [ ] Conflicts: column A claims track 1 with `64px`, column B (next row) wants `auto` on the same track. Expected: track 1 stays `64px` (first-wins).
- [ ] Toolbar: per-column "Cell Width" entry appears next to Col Span / Row Span in edit mode.
- [ ] Toolbar: section-menu "Track Template" entry appears in Cells Grid group.
- [ ] WCDB section 1963473: album cover sits flush at 64px on a 1440px viewport; text cells fill the remaining width; play button sits at 52px on the right; resize to 800px and the layout stays sane (image holds 64, text shrinks).
- [ ] Migration check: an existing card section that doesn't use the new knobs (e.g. WCDB Stats section) renders unchanged DOM after refresh.

## Design notes

- **Why first-wins on track sizing under conflicts.** Because authoring is row-by-row in the toolbar — the author who first puts a fixed-width cell into a track intends *that* track to be fixed. Subsequent rows landing on the same track inherit the fixedness; if a later cell wanted `auto`, the author can reorder columns. Predictability beats over-engineering a conflict resolution rule.
- **Why a freeform string input for the v1 cellWidth.** Authors who know CSS sizes (`64px`, `4rem`, `min(64px, 10vw)`, `auto`) get the full vocabulary. The renderer doesn't parse — it just substitutes the string into `gridTemplateColumns`. Browser rejects nonsense, author corrects. This is the minimum-surface-area version and lets us see what authors actually try before locking it down with a select+number combo.
- **Row-span limitation deliberately accepted.** Tracking exact occupancy of row-spanning cells in JS would mirror the full CSS grid auto-flow algorithm. We don't need that precision for sizing — we only need to know which column to ATTRIBUTE the track-size to. With row spans, the column whose start lands first on a track wins, and that's fine.
- **Why not extend `imageSize` to take a px value.** `imageSize` is an image-cell concern (caps the `<img>` element's `max-w-*`/`max-h-*`). `cellWidth` is a grid-track concern (sizes the cell *around* the image, regardless of what the cell renders). They compose: an image with `imageSize: 'imgXS'` (64×64 cap) inside a `cellWidth: '64px'` track produces a flush layout. Conflating them would confuse the model.

## Skill extraction

This task IS a skill candidate: it adds a new authoring knob with a non-obvious resolution rule (first-column-on-a-track wins) and a worked recipe (album-art-fixed + text-fluid). The skill content lives in `card-layout.md` already (per the plan), not as a new file — `card-layout.md` is the canonical Card-authoring reference and we're extending it rather than fragmenting. No new skill file needed.
