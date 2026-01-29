# Move widgets to top-level theme

## Problem

The `widgets` array (which lists available widget types like Logo, UserMenu, SearchButton) is currently nested inside `layout.options`:

```js
theme.layout.options.widgets = [
  { label: 'Logo', value: 'Logo' },
  { label: 'User Menu', value: 'UserMenu' },
  { label: 'Search Button', value: 'SearchButton' },
]
```

This is a poor fit — widgets are a site-wide registry of available components, not a layout option. They should be a top-level theme property like `Icons`:

```js
theme.widgets = [...]
```

## Current Usage

The `widgets` array is only read in theme editor UI to populate listbox dropdowns (the options you pick from when adding widgets to nav menus). It is **not** used at render time — the actual menu arrays (`topNav.leftMenu`, `sideNav.topMenu`, etc.) contain `{ type }` objects that are resolved against the `LayoutWidgets` registry in `Layout.jsx`.

### Where `layout.options.widgets` is read

**`Layout.theme.jsx`** — 4 references in `layoutSettings()`, all identical pattern:
- Line 29: `options: theme?.layout?.options?.widgets || []` (Top Nav - Left Menu listbox)
- Line 53: `options: theme?.layout?.options?.widgets || []` (Top Nav - Right Menu listbox)
- Line 105: `options: theme?.layout?.options?.widgets || []` (Side Nav - Top Menu listbox)
- Line 129: `options: theme?.layout?.options?.widgets || []` (Side Nav - Bottom Menu listbox)

**`Layout.theme.jsx`** — default export, lines 280–293:
```js
"options": {
  "_replace": ["widgets"],
  ...
  "widgets": [
    { label: 'Logo', value: 'Logo' },
    { label: 'User Menu', value: 'UserMenu' },
    { label: 'Search Button', value: 'SearchButton' },
  ]
}
```

### What does NOT reference widgets

- `Layout.jsx` — renders menus from `topNav.leftMenu` etc., never reads `widgets`
- `useTheme.js` — merges `layout.options` as a block, doesn't reference `widgets` specifically
- `themeEditor.jsx` — copies `layout.options` as a block, doesn't reference `widgets` specifically
- `settingsPane.jsx` — reads `sideNav.size` and `sideNav.activeStyle`, not `widgets`

## Proposed Changes

### 1. Move `widgets` definition to top-level in `Layout.theme.jsx`

Remove `widgets` from the default export's `options` object. Instead, export it separately so `defaultTheme.js` can place it at the top level.

**Before (Layout.theme.jsx default export):**
```js
"options": {
  "_replace": ["widgets"],
  "widgets": [...],
  ...
}
```

**After:**
```js
// export the widgets list separately
export const defaultWidgets = [
  { label: 'Logo', value: 'Logo' },
  { label: 'User Menu', value: 'UserMenu' },
  { label: 'Search Button', value: 'SearchButton' },
]

// default export no longer has widgets
"options": {
  // remove _replace for widgets since widgets is no longer here
  ...
}
```

### 2. Add `widgets` at top level in `defaultTheme.js`

```js
import layoutTheme, { defaultWidgets } from './components/Layout.theme'

const theme = {
  ...components,
  widgets: defaultWidgets,
  // add _replace at top level for widgets
  _replace: ['widgets'],
  ...
}
```

### 3. Update `layoutSettings()` in `Layout.theme.jsx`

Change all 4 references from:
```js
options: theme?.layout?.options?.widgets || []
```
to:
```js
options: theme?.widgets || []
```

### 4. Remove `_replace: ["widgets"]` from `layout.options`

Since `widgets` is no longer in `layout.options`, the `_replace` declaration for it should be removed from there. The top-level theme object gets `_replace: ['widgets']` instead.

## Files to Change

- `src/ui/components/Layout.theme.jsx` — Move widgets out of default export, update 4 `layoutSettings` references
- `src/ui/defaultTheme.js` — Add `widgets` at top level with `_replace`

## Not Changing

- `Layout.jsx` — doesn't reference `widgets`
- `useTheme.js` / `themeEditor.jsx` — handle `layout.options` as a block; removing `widgets` from it is transparent
- Any saved theme data in the database — saved pattern/page themes that override `layout.options.widgets` will just have an inert key that's never read. New overrides will use `theme.widgets`.

## Testing

1. Open the pattern theme editor — verify the Listbox dropdowns for Top Nav and Side Nav menus still show Logo, UserMenu, SearchButton options
2. Verify custom themes can override `widgets` at the top level to add/remove available widget types
3. Verify existing nav menus still render correctly (Logo in topMenu, UserMenu in bottomMenu)
