# Lexical LayoutPlugin — theme-driven column templates — DONE (2026-05-24)

**Implementation summary:**
- `lexical/editor/index.tsx` mirrors `theme.lexical.layoutTemplates` (when
  declared) onto `nestedLexicalTheme.layoutTemplates`. Falls through if
  undefined.
- `InsertLayoutDialog.tsx` reads templates from
  `editor._config.theme.layoutTemplates` with the hardcoded `LAYOUTS`
  array as fallback. The dialog's dropdown auto-reflects whatever the
  active theme declares.
- Tessera ships 6 templates including a brand-new
  `2 buttons side-by-side` preset
  (`grid-cols-1 md:grid-cols-[max-content_max-content_1fr]`) — used by
  the marketing hero CTAs.
- Tessera also overrides `layoutItem: 'min-w-0 max-w-full'` (drops the
  codebase default's `px-2 py-4`) and
  `layoutContainer: 'grid gap-3 mt-2'` so column rows don't get a
  48-pixel band of empty vertical space.
- Seed helper `layout(templateColumns, columns)` in
  `scripts/seed-tessera-pages.mjs` emits the LayoutContainer + per-column
  LayoutItem wrappers from a 2D content array.

---

## Objective

Lift the hardcoded `LAYOUTS` array out of `InsertLayoutDialog.tsx`
into the brand theme so brands can declare their own column
templates (e.g. tessera's 12-col grid wants `grid-cols-3 + grid-cols-9`
style splits, not the codebase default's `grid-cols-2` /
`grid-cols-[1fr_3fr]` defaults).

## Current State

`src/dms/packages/dms/src/ui/components/lexical/editor/plugins/LayoutPlugin/InsertLayoutDialog.tsx`
lines 20-27:

```ts
export const LAYOUTS = [
  {label: '2 columns (equal width)', value: 'grid-cols-1 md:grid-cols-2', count: 2},
  {label: '2 columns (25% - 75%)',   value: 'grid-cols-1 md:grid-cols-[1fr_3fr]', count: 2},
  {label: '3 columns (equal width)', value: 'grid-cols-1 md:grid-cols-3', count: 3},
  ...
];
```

All six entries hardcoded. The dialog can't surface any
brand-specific column splits, and brands can't remove templates
that don't fit their grid system.

## Proposed Changes

1. **Theme contract.** Add a top-level `layoutTemplates` entry to
   the lexical theme (sibling of `brandTextStyles`):
   ```js
   nestedLexicalTheme.layoutTemplates = theme?.lexical?.layoutTemplates
     || defaultLayoutTemplates;
   ```

2. **Tessera override.** Declare 12-col-grid-friendly splits:
   ```js
   // tessera-theme.js — under the lexical export
   layoutTemplates: [
     {label: '2 columns (equal width)', value: 'grid-cols-1 md:grid-cols-2', count: 2},
     {label: '2 columns (1/3 - 2/3)',   value: 'grid-cols-1 md:grid-cols-[1fr_2fr]', count: 2},
     {label: '2 columns (2/3 - 1/3)',   value: 'grid-cols-1 md:grid-cols-[2fr_1fr]', count: 2},
     {label: '3 columns (equal width)', value: 'grid-cols-1 md:grid-cols-3', count: 3},
     {label: '4 columns (equal width)', value: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4', count: 4},
   ],
   ```

3. **Dialog change.** Read `LAYOUTS` from `editor._config.theme.layoutTemplates`
   (with the hardcoded set as fallback).

## Files Requiring Changes

| File | Change |
|---|---|
| `lexical/editor/index.tsx` | Mirror `theme.lexical.layoutTemplates` onto `nestedLexicalTheme.layoutTemplates`. |
| `lexical/editor/plugins/LayoutPlugin/InsertLayoutDialog.tsx` | Read `LAYOUTS` from `editor._config.theme.layoutTemplates` (fall back to current hardcoded list). |
| `src/themes/tessera/tessera-theme.js` | Declare `lexical.layoutTemplates` matching the brand's 12-col grid. |

## Testing Checklist

- [ ] `/columns` slash command shows brand-specific column splits in the dialog.
- [ ] Tessera's templates dominate when active; switching theme switches the templates.
- [ ] Themes that don't declare `layoutTemplates` still see the codebase default 6-template list.

## Dependencies

Independent of (but complementary to) the
`lexical-plugins-ui-migration.md` task. Either can land first; doing
this one alongside that one means InsertLayoutDialog gets both
brand UI primitives AND brand templates in the same pass.
