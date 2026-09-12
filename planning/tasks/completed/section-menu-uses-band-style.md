# Section menu resolves Width/Row span/Border/Padding/Shadow from the BAND's sectionArray style

**Topic:** page pattern · sections · **Status:** DONE · **Date:** 2026-09-12

## Objective

An author setting a section's **Width** (or row span, border, padding, shadow) in the section
menu must see the options the band actually renders with, and the choice must take effect.

## Problem

`sectionArray.jsx` resolves the band's grid theme with the band's style name:
`getComponentTheme(fullTheme, 'pages.sectionArray', group?.theme)`. The menu
(`sectionMenu.jsx`) resolved the same theme **without** the style name — seven times (sizes,
rowspans, borderSides, radiusCorners, paddings, shadows) — so it always offered the
**default** style's maps.

On a theme whose named styles ship their own maps this breaks silently. WCDB's `content`,
`header` and `admin` styles use a 12-column grid keyed `"1"…"12"` (`GRID_12`, with
`_replace: ["sizes"]`), while the library default is six columns keyed by fraction
(`"1/3"`, `"1/2"`, `"2/3"`, `"1"`). The menu offered the fractions; `theme.sizes["1/3"]` was
undefined at render, and `sectionArray.jsx` fell back to `defaultSize` (`"12"`) — every
author-set width rendered full row. Reported on the WCDB admin playlist (page 1964337): two
half-width sections set to `1/3` both rendered at 1200px.

## Fix

- `sectionArray.jsx`: pass `group` to `SectionEdit` / `SectionView` (edit + view branches).
- `section.jsx`: accept `group` and hand `sectionArrayStyle: group?.theme` to the menu via `ui`.
- `sectionMenu.jsx`: one `sa = getComponentTheme(theme, 'pages.sectionArray', sectionArrayStyle)`
  used by all seven lookups; the Width control's displayed default is `sa.defaultSize`.

Behaviour is unchanged for bands with no style name (resolves to styles[0] as before).

## Verification

- WCDB admin playlist (band style `admin`): Width menu lists `1…12`; setting `6` renders
  `md:col-span-6` (600px of a 1200px column). Before: listed `1/3 · 1/2 · 2/3 · 1`, all full row.
- Default theme band: Width menu unchanged (`1/3 · 1/2 · 2/3 · 1`).

## Files

- `packages/dms/src/patterns/page/components/sections/sectionArray.jsx`
- `packages/dms/src/patterns/page/components/sections/section.jsx`
- `packages/dms/src/patterns/page/components/sections/sectionMenu.jsx`
