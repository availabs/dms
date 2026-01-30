# Redesign Widget System

## Objective

Redesign the widget system so that:
1. Widget definitions use **key/value pairs** (not arrays) for precise theme merging
2. Each widget definition combines its **label, settings, and component** in one place
3. Default widgets live in a new `ui/widgets/index.jsx` (not `Layout.theme.jsx`)
4. Widgets at the top-level theme use **additive merging** (not `_replace`) so themes can add new widgets or override existing ones
5. `Layout.jsx` reads widget components from the theme instead of a separate mutable `LayoutWidgets` object

## Current State

### Widget definitions (array format, label + value only)
```js
// Layout.theme.jsx
export const defaultWidgets = [
  { label: 'Logo', value: 'Logo' },
  { label: 'User Menu', value: 'UserMenu' },
  { label: 'Search Button', value: 'SearchButton' },
]
```

### Widget components (separate mutable object)
```js
// Layout.jsx
const LayoutWidgets = {
  NoComp,
  HorizontalMenu,
  VerticalMenu,
  Logo,
}
export const registerLayoutWidget = (name, widget) => {
  LayoutWidgets[name] = widget
}
```

### Runtime registration (side-effect imports)
```js
// page/siteConfig.jsx
RegisterLayoutWidget('UserMenu', DefaultMenu)
RegisterLayoutWidget('Search', SearchButton)
```

### Theme usage (widgets at top-level, _replace)
```js
// defaultTheme.js
const theme = {
  _replace: ['widgets'],
  widgets: defaultWidgets,
  ...
}
```

### Layout settings (listbox options from theme.widgets)
```js
// Layout.theme.jsx - layoutSettings()
// 4 Listbox controls reference theme?.widgets || [] for options
```

### Existing site themes (old location: layout.options.widgets)
Several themes in `src/themes/` still define widgets inside `layout.options.widgets` as arrays. These will need migration.

## Proposed Design

### 1. New `ui/widgets/index.jsx`

Create a unified widget registry combining definition + component:

```jsx
import Logo from '../components/Logo'
import NoComp from ... // inline or import

// Key/value object: key is the widget identifier
const defaultWidgets = {
  Logo: {
    label: 'Logo',
    component: Logo,
  },
  UserMenu: {
    label: 'User Menu',
    component: null,  // registered by page pattern at runtime
  },
  SearchButton: {
    label: 'Search Button',
    component: null,  // registered by page pattern at runtime
  },
  // internal widgets used by Layout (not shown in theme editor listbox)
  HorizontalMenu: {
    label: 'Horizontal Menu',
    component: HorizontalMenu,
    internal: true,
  },
  VerticalMenu: {
    label: 'Vertical Menu',
    component: VerticalMenu,
    internal: true,
  },
}

export default defaultWidgets
```

### 2. Update `defaultTheme.js`

```js
import widgets from './widgets'

const theme = {
  // NO _replace for widgets — additive merge
  widgets,
  ...
}
```

### 3. Update `Layout.jsx`

- Remove `LayoutWidgets` object
- Remove `registerLayoutWidget` export
- Read widget components from `theme.widgets` via `ThemeContext`
- `getWidget({ type })` looks up `theme.widgets[type]?.component`

```jsx
const getWidget = (theme) => ({ type, options = {} }, index) => {
  const Comp = theme?.widgets?.[type]?.component || NoComp
  return <Comp key={index} {...options} />
}
```

### 4. Update `Layout.theme.jsx`

- Remove `defaultWidgets` export
- Update `layoutSettings` listbox options to derive from key/value object:
```js
options: Object.entries(theme?.widgets || {})
  .filter(([_, w]) => !w.internal)
  .map(([key, w]) => ({ label: w.label, value: key }))
```

### 5. Update widget registration

Instead of `registerLayoutWidget` / `RegisterLayoutWidget`, patterns register widgets by merging into theme:

```jsx
// page/siteConfig.jsx — instead of RegisterLayoutWidget calls
// Option A: merge widget components into theme at pattern config level
// Option B: keep registerLayoutWidget but have it update theme.widgets

// Simplest approach: keep registerLayoutWidget for now but change it
// to update theme.widgets entries that have component: null
```

**Decision needed**: The current `RegisterLayoutWidget` is called at module-level as a side effect. This works because `LayoutWidgets` is a mutable object. With the new system, widgets are in the theme (React context), so module-level side effects can't update them. Options:

- **Option A**: Keep `registerLayoutWidget` as a bridge — it updates a separate lookup that `Layout.jsx` falls back to when `theme.widgets[type].component` is null. This is the least disruptive change.
- **Option B**: Move component registration into pattern siteConfig so widgets are provided as part of the pattern's theme override. More correct but requires patterns to define their theme contributions differently.

**Recommended**: Option A for now — keeps backward compatibility, minimal disruption. The fallback lookup means existing `RegisterLayoutWidget` calls continue to work, and the widget object in the theme just needs label/settings for the theme editor.

### 6. Migrate existing site themes

Themes in `src/themes/` that still have `layout.options.widgets` as arrays need to be migrated to `theme.widgets` as key/value objects. Files:
- `src/themes/transportny/theme.js` (line 301)
- `src/themes/mny/admin.theme.js` (line 190)
- `src/themes/mny/admin.theme_cl.js` (line 235)
- `src/themes/wcdb/wcdb_theme.js` (line 35)

## Files Requiring Changes

| File | Change |
|------|--------|
| `ui/widgets/index.jsx` | **NEW** — default widget definitions (key/value, with components) |
| `ui/defaultTheme.js` | Import from `widgets/index.jsx`, remove `_replace: ['widgets']`, remove `defaultWidgets` import from Layout.theme |
| `ui/components/Layout.jsx` | Read widget components from theme context, remove `LayoutWidgets` object, keep `registerLayoutWidget` as fallback bridge |
| `ui/components/Layout.theme.jsx` | Remove `defaultWidgets` export, update listbox options derivation |
| `ui/useTheme.js` | Update `RegisterLayoutWidget` export (may keep as-is for bridge) |
| `src/themes/transportny/theme.js` | Migrate widgets from layout.options array to top-level key/value |
| `src/themes/mny/admin.theme.js` | Migrate widgets |
| `src/themes/mny/admin.theme_cl.js` | Migrate widgets |
| `src/themes/wcdb/wcdb_theme.js` | Migrate widgets |

## Testing Checklist

- [ ] Default widgets (Logo, UserMenu, SearchButton) render in layout
- [ ] Theme editor listbox shows available widgets (excluding internal ones)
- [ ] Adding/removing widgets from sideNav/topNav menus works in theme editor
- [ ] Custom themes can add new widgets via key/value merge
- [ ] Custom themes can override existing widgets (e.g., replace Logo component)
- [ ] `RegisterLayoutWidget` still works for pattern-level component registration
- [ ] Site themes with migrated widgets render correctly
- [ ] Build passes
