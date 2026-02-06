# Theme-Based Component Registration

## Objective

Create a component registration system that mirrors the widget system, allowing themes to declare a `pageComponents` key containing component definitions that are automatically registered to the page pattern's `ComponentRegistry`. This enables themes to ship with custom components without requiring app-level `registerComponents()` calls.

## Current State

### Component Registration (imperative, app-level)

Components are registered via a mutable object and an imperative `registerComponents()` call:

```js
// patterns/page/components/sections/section.jsx
export let RegisteredComponents = ComponentRegistry;

export const registerComponents = (comps = {}) => {
    RegisteredComponents = {...RegisteredComponents, ...comps}
}
```

```js
// App.jsx or consumer code
import { registerComponents } from '@availabs/dms'
registerComponents({
    "My Custom Component": myComponentDef,
})
```

### Widget System (declarative, theme-level) — the model to follow

Widgets use a registry object + `registerWidget()` function, and themes can provide widgets at the top level:

```js
// ui/widgets/index.jsx
const defaultWidgets = {
  Logo: { label: 'Logo', component: Logo },
  ...
}
export function registerWidget(name, { label, component, internal }) { ... }
```

The widget system has three key properties:
1. **Default registry** — built-in widgets live in `ui/widgets/index.jsx`
2. **Imperative registration** — `registerWidget()` for runtime additions (patterns, app code)
3. **Theme integration** — `theme.widgets` is merged into the defaults, so themes can add/override widgets declaratively

### What's Missing for Components

- No equivalent of `theme.widgets` for components
- No way for a theme to declaratively ship components
- Component registry lives deep in the page pattern (`patterns/page/components/sections/section.jsx`), not in a shared location
- No `widgetOptions()`-style helper for listing available components in the theme editor

## Proposed Design

### 1. New `patterns/page/components/sections/componentRegistry.js`

Extract the component registry into its own module (like `ui/widgets/index.jsx`):

```js
import ComponentRegistry from './components/ComponentRegistry'

// Mutable registry — starts with built-in components
const registeredComponents = { ...ComponentRegistry }

export function registerComponent(name, definition) {
  registeredComponents[name] = definition
}

export function registerComponents(comps = {}) {
  Object.assign(registeredComponents, comps)
}

export function getRegisteredComponents() {
  return registeredComponents
}

// For theme editor: list available components
export function componentOptions() {
  return Object.entries(registeredComponents).map(([key, comp]) => ({
    label: comp?.name || key,
    value: key,
  }))
}
```

### 2. Theme Integration — `pageComponents` key

Themes can declare a `pageComponents` key as either an **object** (recommended) or an **array**:

**Object format** (preferred — matches widget system, supports merge):
```js
// themes/mny/theme.js
export default {
  pageComponents: {
    "My Custom Card": {
      name: 'My Custom Card',
      EditComp: MyCardEdit,
      ViewComp: MyCardView,
      defaultState: { display: {} },
      controls: { ... },
    },
    "MNY Header": MNYHeaderDef,
  },
  // ... rest of theme
}
```

**Array format** (convenience — each item must have a `name` or key):
```js
pageComponents: [
  { key: "My Custom Card", ...componentDef },
  { key: "MNY Header", ...componentDef },
]
```

If array, convert to object using each item's `key` or `name` property.

### 3. Automatic Registration from Theme

During theme resolution (in `useTheme.js` or pattern initialization), merge `theme.pageComponents` into the component registry:

```js
// Option A: In useTheme.js getPatternTheme() or mergeTheme()
// After theme is resolved, register any pageComponents
if (resolvedTheme.pageComponents) {
  const comps = resolvedTheme.pageComponents
  if (Array.isArray(comps)) {
    comps.forEach(c => registerComponent(c.key || c.name, c))
  } else {
    registerComponents(comps)
  }
}
```

```js
// Option B: In page pattern siteConfig.jsx onLoad or component resolution
// Register theme components when the page pattern initializes
```

**Recommended: Option A** — theme-level, runs once when theme is resolved, mirrors how `theme.widgets` is handled.

### 4. Update `section.jsx`

Replace the inline registry with imports from the new module:

```js
// section.jsx — BEFORE
import ComponentRegistry from './components/ComponentRegistry'
export let RegisteredComponents = ComponentRegistry;
export const registerComponents = (comps = {}) => {
    RegisteredComponents = {...RegisteredComponents, ...comps}
}

// section.jsx — AFTER
import { getRegisteredComponents, registerComponents } from './componentRegistry'
// Use getRegisteredComponents() instead of RegisteredComponents
const component = getRegisteredComponents()[elementType]
```

### 5. Backward Compatibility

- `registerComponents()` continues to work exactly as before (imperative, app-level)
- `theme.pageComponents` is additive — it merges on top of the built-in registry and any imperative registrations
- Existing `ComponentRegistry/index.jsx` stays unchanged (built-in defaults)
- `export { registerComponents }` from `index.js` continues to work

### 6. Theme Editor Integration (future)

Add a component selector to the section settings or theme editor, similar to `widgetOptions()`:

```js
// Available component types for element-type dropdown
const options = componentOptions()
// [{ label: 'Rich Text', value: 'lexical' }, { label: 'Card', value: 'Card' }, ...]
```

## Files Requiring Changes

| File | Change |
|------|--------|
| `patterns/page/components/sections/componentRegistry.js` | **NEW** — extracted registry with `registerComponent()`, `registerComponents()`, `getRegisteredComponents()`, `componentOptions()` |
| `patterns/page/components/sections/section.jsx` | Import from `componentRegistry.js` instead of inline mutable registry |
| `ui/useTheme.js` | After theme resolution, check for `pageComponents` and call `registerComponents()` |
| `index.js` | Update `registerComponents` export path (still same public API) |
| Theme files (optional) | Can now add `pageComponents: { ... }` to declaratively provide components |

## Component Definition Shape (reference)

A component definition object for `pageComponents` follows the same shape as existing components:

```js
{
  // Required
  name: 'Component Name',        // Display name
  EditComp: EditComponent,        // React component for editing
  ViewComp: ViewComponent,        // React component for viewing

  // Data source (optional)
  useDataSource: false,           // true for data-driven components
  fullDataLoad: false,
  useGetDataOnPageChange: true,
  useInfiniteScroll: false,
  showPagination: true,

  // State & controls (optional)
  defaultState: { display: {} },
  controls: (theme) => ({
    default: [ /* control definitions */ ]
  }),
}
```

See `component-overview.md` for full documentation.

## Test Component: "Message" in Avail Theme

Create a minimal test component registered via `pageComponents` in the Avail theme to validate the system end-to-end.

### Component: `src/themes/avail/components/Message.jsx`

A simple component with a single `message` string in state, editable via the configuration menu (controls).

```jsx
import React, { useContext } from 'react'
import { ComponentContext } from '@availabs/dms/patterns/page/context'

const Edit = ({ value, onChange }) => {
  const { state } = useContext(ComponentContext)
  const message = state?.display?.message || 'Hello, World!'

  return (
    <div className="p-4 border rounded-lg bg-blue-50 text-blue-900">
      <p className="text-lg">{message}</p>
    </div>
  )
}

const View = ({ value }) => {
  // In view mode, read message from element-data
  const parsed = (() => {
    try { return JSON.parse(value) } catch { return {} }
  })()
  const message = parsed?.message || 'Hello, World!'

  return (
    <div className="p-4 border rounded-lg bg-blue-50 text-blue-900">
      <p className="text-lg">{message}</p>
    </div>
  )
}

export default {
  name: 'Message',
  EditComp: Edit,
  ViewComp: View,
  defaultState: {
    display: {
      message: 'Hello, World!',
    }
  },
  controls: {
    default: [
      {
        type: 'input',
        inputType: 'text',
        label: 'Message',
        key: 'message',
      },
    ]
  },
}
```

### Theme Registration: `src/themes/avail/theme.js`

Add `pageComponents` to the Avail theme:

```js
import MessageComponent from './components/Message'

const availTheme = {
  pageComponents: {
    "Message": MessageComponent,
  },
  // ... existing theme config
}
```

### Validation Steps

1. Start dev server with Avail theme active
2. Create or edit a page in admin mode
3. Add a new section, change element-type to "Message"
4. Verify the message renders with default text "Hello, World!"
5. Open section settings menu, find the "Message" text input control
6. Change the message text, confirm it updates in the editor
7. Save and view the page — confirm the message renders in view mode

### Files

| File | Change |
|------|--------|
| `src/themes/avail/components/Message.jsx` | **NEW** — simple test component |
| `src/themes/avail/theme.js` | Add `pageComponents: { "Message": MessageComponent }` |

## Testing Checklist

- [ ] Existing `registerComponents()` calls continue to work (backward compat)
- [ ] Theme with `pageComponents` object auto-registers components
- [ ] Theme with `pageComponents` array auto-registers components
- [ ] Theme-registered components appear in element-type selector
- [ ] Theme-registered components render in edit mode
- [ ] Theme-registered components render in view mode
- [ ] Theme component overrides a built-in (e.g., custom Card) works
- [ ] Multiple themes with different `pageComponents` don't conflict
- [ ] Avail theme "Message" component renders with default message
- [ ] Avail theme "Message" component message editable via controls
- [ ] Avail theme "Message" component persists and renders in view mode
- [ ] Build passes, no lint errors
