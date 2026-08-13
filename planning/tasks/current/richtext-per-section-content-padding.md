# Rich Text — per-section inner padding (`display.contentPadding`)

**Objective:** let an author set ONE rich-text section's inner padding without changing the site's
prose padding. Today `theme.richtext.contentPadding` (default `p-4`) is a single site-wide value read
directly in `richtext/index.jsx`, so a page title block is inset 16px from the cards under it and
there is no way to opt out short of flattening every prose section on the site.

**Requested for:** the landbank admin dashboard's header band. Measured against the mockup
(`admin-dashboard.html`), the live `<h1>` sat at **x=302** while every card below it started at
**x=286** — the 16px was the lexical block's own `p-4`, on top of the section's 12px gutter (the
mockup's title is flush: 284 / 284). The vertical half of the same padding was part of the "much more
padding than the design" complaint.

## Change (additive / BC)
- **`richtext/index.jsx`**: new `resolveContentPadding(theme, key)` —
  `theme.richtext.paddings[key] ?? theme.richtext.contentPadding ?? 'p-4'`. `key` comes from
  `display.contentPadding` (Edit) / the element-data (View), so **unset resolves to exactly today's
  value**. Both `RichtextEdit` and `RichtextView` use it. `contentPadding` joins
  `bgColor`/`isCard`/`showToolbar` in the element-data mirror + the display-init effect, following
  the component's existing settings convention.
  - No spurious writes for existing sections: old and new both normalize to `''`, so the
    `isEqual(newData, oldData)` guard still short-circuits on first load.
- **`richtext/config.js`**: a "Padding" select whose options come from `theme.richtext.paddings`
  (so the BRAND owns the values); the control hides itself entirely when a theme ships no map, so
  no site gains a dropdown it can't honour.
- **`src/themes/landbank/theme.js`**: new top-level `richtext` key —
  `contentPadding: 'p-4'` (unchanged site default) + `paddings: {none, tight, default, roomy}`.

## Files
- `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/richtext/index.jsx`
- `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/richtext/config.js`
- (consumer) `src/themes/landbank/theme.js`

## Acceptance
- [x] Landbank header block with `contentPadding: 'none'` renders `flex p-0`; the `<h1>` left edge is
      **286px** = the scope/KPI cards' left edge (was 302).
- [x] Every other rich-text section unchanged (no `contentPadding` → `p-4`; mny's site-wide `p-0` and
      transportny's `p-4` still resolve as before).
- [x] `vitest run src/dms/packages/dms/tests/` — 213/213.
- [ ] The "Padding" dropdown itself not yet clicked through in the admin UI (set via the data layer).
