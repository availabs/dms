# Card column-combining formatFn

## Status: DONE — 2026-05-18

Implementation landed:

- `dataWrapper/utils/utils.jsx` — `combine` entry added to `formatFunctions` with signature `(value, row, attr)`. Returns `[value, row[attr.combineWith]].filter(non-empty).join(attr.combineSeparator ?? ' — ')`.
- `ui/components/Card.jsx` — `combine` branch inserted between the `icon`/`color` branch and the generic one. Passes `source` (the row) + `attr`; skips the trailing whitespace-strip.
- `ComponentRegistry/Card.config.jsx` — Format dropdown gains `Combine columns`; `Combine With` + `Separator` text inputs gated on `formatFn === 'combine'`, both `isBatchUpdatable`.
- `src/dms/skills/card-layout.md` — format-functions table includes `combine`; quick-reference includes `combineWith` / `combineSeparator`; "Two fields on one editorial line" recipe added with the WCDB now-playing layout.
- WCDB section 1963473 — title cell rendered as "Eternal Life — Jeff Buckley"; artist_name reduced to hidden full-row loader (cellSpan 9, hideValue) and reordered to sit after album; album/play `cellRowSpan` dropped to 2.



## Objective

Let an author render two row fields inside one Card cell with a separator — `formatFn: 'combine'` + `combineWith: '<other_col>'` + `combineSeparator: ' — '`. Today every cell renders exactly one field; expressing "song — artist" on one editorial line means writing a custom component or stacking two cells (which the WCDB now-playing card was doing).

The themes design rule (`src/themes/CLAUDE.md`) explicitly names this as a legitimate Card enrichment: *"A new `formatFn` (e.g., a column-combining formatter that renders `album · year` from two fields)."* Two designs in the WCDB hi-fi mock already use the pattern — `Stereolab — Lo Boob Oscillator` (artist + track) and `Refried Ectoplasm, Vol. 3 · 1995` (album + year).

Direct user prompt: the WCDB now-playing card has song / artist / album as three separate cells but the design wants song · artist on one line with album below.

## Scope

**In:**

- New `combine` entry in `formatFunctions` (utils.jsx). Signature `combine(value, row, attr)` — different from the standard `(value, isDollar)` because combine needs sibling-field access.
- Card.jsx renderer: special-case `combine` like `icon`/`color` (the format branch already has precedent for non-standard signatures + skipping `.replaceAll(' ', '')`). Pass `source` (row) and `attr` so the formatter can resolve `combineWith` and the optional `combineSeparator`.
- Card.config.jsx: add `'Combine columns'` option to the Format dropdown; add two `combineWith` + `combineSeparator` text inputs that show up only when `formatFn === 'combine'`.
- Document in `src/dms/skills/card-layout.md` (Format-functions table + a recipe showing the title→artist merge).
- Apply on WCDB section 1963473 — collapse title/artist_name into one combined cell, drop the now-redundant text row, tighten image/play `cellRowSpan` from 3 to 2.

**Out:**

- Multi-field combine (>2 fields). One author can express "a · b · c" by chaining: title combines with "artist_name", and artist_name's column has a calc-column that concatenates further. If the multi-field case shows up in two more designs, generalize then.
- Template-string formatFn (`'{title} — {artist_name}'`). More expressive but adds a parser; defer until a need shows up that this can't express.
- `selectOnly: true` per-column flag (mentioned as a future enrichment in `themes/CLAUDE.md`). Without it, the combined-with column must stay `show: true, hideHeader: true, hideValue: true, cellSpan: <full grid>` so it's fetched but renders as an empty row. That's the same loader pattern `timestamp_utc` uses today. Add `selectOnly` later as its own task.

## Current state

`utils.jsx` (`patterns/page/components/sections/components/dataWrapper/utils/utils.jsx`) ~247:

```js
export const formatFunctions = {
  abbreviate: (d, isDollar) => fnumIndex(d, 1, isDollar),
  abbreviate_dollar: (d) => fnumIndex(d, 1, true),
  comma: (d, isDollar) => fnum(d, isDollar),
  comma_dollar: (d) => fnum(d, true),
  zero_to_na: (d) => (!d || (d && +d === 0) || d === "0" ? "N/A" : d),
  date: (d) => formatDate(d),
  time: (d) => formatTime(d),
  datetime: (d) => formatDateTime(d),
  icon: (strValue, props, Icon) => (...),
  color: (strValue, map) => (...),
};
```

`Card.jsx` ~365–379 — the value-resolution ternary already special-cases `icon`/`color` because their signature differs and they need to skip the trailing `.replaceAll(' ', '')` that strips whitespace from numeric formatters. `combine` needs the same exception (separator-spaces would be eaten otherwise).

## Implementation steps

1. **`utils.jsx`** — add the combine entry:

```js
combine: (value, row, attr) => {
    const sep = attr?.combineSeparator ?? ' — ';
    const otherField = attr?.combineWith;
    const other = otherField && row ? (row[otherField]?.value ?? row[otherField]) : undefined;
    const a = value?.value ?? value;
    const parts = [a, other].filter(v => v !== undefined && v !== null && v !== '');
    return parts.join(sep);
},
```

2. **`Card.jsx`** — insert a `combine` branch between the `icon/color` branch and the generic one:

```js
const value =
    isImg ? <img ... /> :
    ['icon', 'color'].includes(attr.formatFn) && formatFunctions[attr.formatFn] ?
        <div className={theme.iconAndColorValues}>
            {formatFunctions[attr.formatFn](rawValue?.value || rawValue, attr.isDollar, Icon)}
        </div> :
    attr.formatFn === 'combine' && formatFunctions.combine ?
        formatFunctions.combine(rawValue?.value ?? rawValue, source, attr) :
    attr.formatFn && formatFunctions[attr.formatFn] ?
        formatFunctions[attr.formatFn](rawValue?.value || rawValue, attr.isDollar).replaceAll(' ', '') :
        rawValue;
```

3. **`Card.config.jsx`** — extend the Format select + add two conditional inputs:

```js
{ type: 'select', label: 'Format', key: 'formatFn', isBatchUpdatable: true,
    options: [
        ...existing options...,
        { label: 'Combine columns', value: 'combine' },
    ],
},
{ type: 'input', inputType: 'text', label: 'Combine With', key: 'combineWith', isBatchUpdatable: true,
    displayCdn: ({ attribute, isEdit }) => isEdit && attribute.formatFn === 'combine' },
{ type: 'input', inputType: 'text', label: 'Separator', key: 'combineSeparator', isBatchUpdatable: true,
    displayCdn: ({ attribute, isEdit }) => isEdit && attribute.formatFn === 'combine' },
```

4. **`card-layout.md`** — add `combine` to the format-functions table and add a "Two fields on one editorial line" recipe under Recipes.

5. **WCDB section 1963473** — via the DMS CLI:
   - `title`: add `formatFn: 'combine', combineWith: 'artist_name', combineSeparator: ' — '`. Keep `valueFontStyle: 'text2XL'` (combined string takes the title's font).
   - `artist_name`: change `hideValue: true`, `cellSpan: 9` so it sits as a hidden loader (same shape as `timestamp_utc`). Reorder it AFTER `album` so it doesn't grab row 2 under sparse auto-flow.
   - `album_cover`: `cellRowSpan: 2` (was 3). Two visible text rows now, not three.
   - `play`: `cellRowSpan: 2` (was 3).

## Testing checklist

- [x] BC: a section without any column using `combine` renders identical inline value (new branch only matches when `attr.formatFn === 'combine'`).
- [x] `formatFn: 'combine'` + `combineWith: 'artist_name'` renders `"<title> — <artist_name>"` (verified against utils.jsx implementation).
- [x] Custom `combineSeparator: ' · '` renders with the chosen separator (combine branch skips `.replaceAll(' ', '')`).
- [x] Missing `combineWith` field on the row → renders just the cell's own value, no trailing separator (filter drops `undefined`).
- [x] Empty `combineWith` value on the row → no trailing separator (filter drops `''`).
- [x] `Combine With` + `Separator` inputs gated on `formatFn === 'combine'` (`displayCdn` in Card.config.jsx).
- [ ] WCDB section 1963473 live visual confirmation on https://www.wcdb.fm: "Eternal Life — Jeff Buckley" on row 1, "Grace" on row 2, 96px album cover + 52px play button bracketing both rows. (Deferred to author's preview pass.)

## Design notes

- Why pass `row` + `attr` instead of doing `combine` as a column type: a custom column type would absorb Card responsibility (read sibling fields, render layout, manage chrome) into a place authors can't reach from the UI. A formatFn is a primitive — every author who already knows the Format dropdown gets this for free.
- Why two new keys (`combineWith` + `combineSeparator`) instead of one structured config: structured config would need an editor UI; flat text inputs reuse what `linkText` / `location` already do.
- Why a fixed " — " default for separator: matches the WCDB editorial convention (em-dash with surrounding spaces). Authors who want " · " or " / " override per-cell. If a future site needs a theme-level default, promote then.
