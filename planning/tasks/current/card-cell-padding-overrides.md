# Card per-column padding overrides

## Status: IN PROGRESS — 2026-05-18

## Objective

Let an author override the cell padding per-column from the column toolbar. Today the Card only has section-level `cellsPadding` (uniform across all cells) and one per-column knob, `cellPaddingBottom`. That's not enough to express "this cell shouldn't have any vertical padding" — which the WCDB now-playing card needs because the album-art cell drives row heights and the three stacked text cells (title/artist/album) carry visible vertical breathing room that doesn't fit the design.

Direct user feedback driving this: "the three columns of text are higher than the size of the image. this is largely because the song title has way too much y padding… in the end we are going to need to be able to override padding at the column level."

## Scope

**In:**

- Add four per-column knobs alongside the existing `cellPaddingBottom`:
  - `cellPadding` — single value applied to all sides
  - `cellPaddingTop`
  - `cellPaddingLeft`
  - `cellPaddingRight`
- Renderer change in `Card.jsx`: each becomes an inline padding override on the cell wrapper. Precedence: side-specific > `cellPadding` > `cellsPadding` (section-level default).
- Toolbar entries in `Card.config.jsx` per-column controls — numeric inputs next to the existing Padding Below.
- Update `src/dms/skills/card-layout.md` quick-reference + per-cell visual overrides table.
- Apply to WCDB section 1963473: drop the text cells' vertical padding so the text stack collapses tighter against the album art.

**Out:**

- Per-axis aliases (`cellPaddingX` / `cellPaddingY`). Side-specific keys are honest about CSS; aliases add a layer of indirection. Add later if multiple authors keep typing X/Y.
- Migrating ambient `cellsPadding` to a different mechanism. The two compose: cells inherit `cellsPadding` and column overrides win locally.

## Current state

`Card.jsx` ~417:

```js
const style = {
    gridColumn: ...,
    gridRow: ...,
    padding: fullBleed ? 0 : cellsPadding,
    paddingBottom: fullBleed ? 0 : (attr.cellPaddingBottom ? +attr.cellPaddingBottom : undefined),
    marginTop: `${imageMargin}px`,
    backgroundColor: attr.cellBgColor,
    ...(hints.height ? { height: `${hints.height}px` } : {}),
}
```

So `cellPaddingBottom` already short-circuits inline. The pattern to add the other three sides is a straight extension. `cellPadding` (all sides) sits BEFORE the side-specific keys in the style object so React's later-key-wins rule lets the side keys override.

`Card.config.jsx` ~182 has the existing `Padding Below` input — the new ones go in the same group.

## Implementation steps

1. **`Card.jsx`** — extend the cell `style` object:

```js
const style = {
    gridColumn: ...,
    gridRow: ...,
    padding: fullBleed ? 0 : (attr.cellPadding !== undefined && attr.cellPadding !== '' ? +attr.cellPadding : cellsPadding),
    paddingTop: fullBleed ? 0 : (attr.cellPaddingTop !== undefined && attr.cellPaddingTop !== '' ? +attr.cellPaddingTop : undefined),
    paddingRight: fullBleed ? 0 : (attr.cellPaddingRight !== undefined && attr.cellPaddingRight !== '' ? +attr.cellPaddingRight : undefined),
    paddingBottom: fullBleed ? 0 : (attr.cellPaddingBottom !== undefined && attr.cellPaddingBottom !== '' ? +attr.cellPaddingBottom : undefined),
    paddingLeft: fullBleed ? 0 : (attr.cellPaddingLeft !== undefined && attr.cellPaddingLeft !== '' ? +attr.cellPaddingLeft : undefined),
    marginTop: `${imageMargin}px`,
    backgroundColor: attr.cellBgColor,
    ...(hints.height ? { height: `${hints.height}px` } : {}),
}
```

The `!== undefined && !== ''` guard distinguishes "author cleared the field" (undefined / empty string → fall through to default) from "author typed 0" (explicit 0 → use 0).

2. **`Card.config.jsx`** — add three numeric inputs in the per-column layout group:

```js
{ type: 'input', inputType: 'number', label: 'Padding', key: 'cellPadding', isBatchUpdatable: true },
{ type: 'input', inputType: 'number', label: 'Padding Top', key: 'cellPaddingTop', isBatchUpdatable: true },
{ type: 'input', inputType: 'number', label: 'Padding Left', key: 'cellPaddingLeft', isBatchUpdatable: true },
{ type: 'input', inputType: 'number', label: 'Padding Right', key: 'cellPaddingRight', isBatchUpdatable: true },
```

Place right after the existing `Padding Below` so the four sides cluster.

3. **`card-layout.md`** — extend the "Per-cell visual overrides" table and the quick-reference.

4. **WCDB section 1963473 v8** — set `cellPaddingTop: 0, cellPaddingBottom: 0` on `title`, `artist_name`, `album` so the text stack collapses against the album art. Keep `cellsPadding: 4` ambient (so other cells stay padded), or drop to 0 if it fits the design better — pick based on the visual.

## Testing checklist

- [ ] BC: a section without any of the new keys renders identical inline `padding`/`paddingTop`/etc. style on the cell wrapper.
- [ ] `cellPadding: 0` on a column zeroes all sides, overriding ambient `cellsPadding`.
- [ ] `cellPaddingTop: 0` on a column zeroes only the top.
- [ ] `cellPadding: 8` + `cellPaddingTop: 0` produces `padding: 8; paddingTop: 0` (side wins).
- [ ] Toolbar inputs appear in the expected order; typing values updates the cell live.
- [ ] WCDB section 1963473: title/artist/album cells lose vertical padding; the text stack visually fits within the 96px album-art height.

## Design notes

- `cellPaddingBottom` was already a one-side override. Extending to the other three sides is consistent with that precedent rather than introducing a parallel mechanism.
- The four per-side keys + `cellPadding` mirror CSS's shorthand + side syntax directly. No mental translation for an author who knows CSS. For authors who don't, "Padding Top / Right / Bottom / Left" labels are self-explanatory.
- `cellPaddingX` and `cellPaddingY` aliases would shave one input for the common "top and bottom together" case, but the cost of adding them (extra precedence rules: do side keys still win over X/Y?) outweighs the keystrokes saved. If three authors in a row reach for X/Y, add them then.
