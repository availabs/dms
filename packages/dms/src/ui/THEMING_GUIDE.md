# DMS Component Theming Guide

This guide explains how to convert a component to use the DMS theming system. The theming system allows components to be styled consistently across the application while supporting multiple style variants and theme customization.

## Overview

The theming system uses:
- **ThemeContext** - React context that provides theme data to components
- **getComponentTheme** - Helper function to get resolved theme styles for a component
- **Modern theme format** - Uses `options` and `styles` keys for flexibility

## Step-by-Step Process

### Step 1: Extract Tailwind Classes to Theme Object

Create a theme object that extracts all hardcoded Tailwind classes from your component. The modern format uses two top-level keys:

```javascript
// Example: MyComponent.theme.jsx
const myComponentTheme = {
  "options": {
    "activeStyle": 0,
    // Any other options that control component behavior
  },
  "styles": [
    {
      "name": "default",
      // All class strings go here
      "wrapper": "flex flex-col p-4",
      "title": "text-lg font-semibold text-gray-900",
      "content": "mt-2 text-sm text-gray-600",
      "button": "px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600",
      "buttonActive": "px-3 py-2 bg-blue-700 text-white rounded-md",
      // Level-specific styles (for nested menus, etc.)
      "item_level_1": "pl-2",
      "item_level_2": "pl-4",
      "item_level_3": "pl-6",
      // Icons (use icon names, not classes)
      "icon": "Menu",
      "iconOpen": "ChevronDown",
      "iconClosed": "ChevronRight"
    }
  ]
}

export default myComponentTheme
```

**Key points:**
- `options.activeStyle` - Index of the currently active style in the `styles` array
- `styles` - Array of style objects allowing multiple theme variants
- Each style should have a `name` for identification in the admin UI
- Use descriptive key names that map to component elements
- Level-specific keys use the format `keyName_level_N`

### Step 2: Update Component to Use ThemeContext

Import and use the theming utilities in your component:

```javascript
import React from "react";
import { ThemeContext, getComponentTheme } from '../useTheme';
import defaultTheme from './MyComponent.theme'; // Fallback theme

const MyComponent = ({ activeStyle, ...props }) => {
  // Get theme from context
  const { theme: fullTheme = { myComponent: defaultTheme } } = React.useContext(ThemeContext);

  // Get resolved component theme with active style applied
  const theme = getComponentTheme(fullTheme, 'myComponent', activeStyle);

  return (
    <div className={theme?.wrapper}>
      <h2 className={theme?.title}>{props.title}</h2>
      <div className={theme?.content}>{props.children}</div>
    </div>
  );
};

export default MyComponent;
```

**How `getComponentTheme` works:**
```javascript
// From useTheme.js
export const getComponentTheme = (theme, compType, activeStyle) => {
  const componentTheme = get(theme, compType, {})
  const finalActiveStyle = activeStyle || activeStyle === 0
    ? activeStyle
    : componentTheme.options?.activeStyle || 0

  if (!componentTheme?.styles) return componentTheme || {}

  const style = componentTheme.styles[finalActiveStyle]
  if (!style) return componentTheme.styles[0] || {}

  // Non-default styles inherit missing keys from default (styles[0])
  if (finalActiveStyle !== 0) {
    const defaultStyle = componentTheme.styles[0] || {}
    return { ...defaultStyle, ...style }
  }
  return style
}
```

- Takes the full theme object, component type key, and optional activeStyle override
- For the default style (index 0): returns it directly
- For non-default styles (index 1+): spreads `styles[0]` underneath, so sparse styles inherit all missing keys from the default
- Falls back to the component theme directly if no `styles` array exists (backward compatibility)

### Step 3: Register Theme in defaultTheme.js

Add your component theme to `src/dms/src/ui/defaultTheme.js`:

```javascript
// Import your theme
import { myComponentTheme } from "./components/MyComponent";
// Or if in a separate file:
import myComponentTheme from "./components/MyComponent.theme";

const components = {
  // ... existing components
  myComponent: myComponentTheme,  // Key must match what you use in getComponentTheme()
}
```

**Important:** The key you use here (`myComponent`) must exactly match the key you pass to `getComponentTheme(fullTheme, 'myComponent', activeStyle)`.

### Step 4: Update Custom Themes

After registering in defaultTheme, update any custom themes in `src/themes/` to include the new component theme keys. This prevents breaking existing theme configurations.

**Option A: Use defaults (recommended for new components)**
Don't add anything to custom themes - they'll inherit from defaultTheme via the merge in `getPatternTheme()`.

**Option B: Override specific values**
```javascript
// src/themes/catalyst/theme.jsx
const theme = {
  // ... existing theme
  myComponent: {
    "options": {
      "activeStyle": 0
    },
    "styles": [{
      "name": "catalyst",
      "wrapper": "flex flex-col p-6 bg-zinc-50",  // Custom values
      "title": "text-xl font-bold text-zinc-900",
      // ... override only what's needed
    }]
  }
}
```

## Complete Example: NavigableMenu

Here's the navigableMenu component as a reference:

**Theme file (navigableMenu.theme.jsx):**
```javascript
export const navigableMenuTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [{
    "name": "default",
    "button": "px-1 py-0.5",
    "icon": "Menu",
    "iconWrapper": "size-4",
    "menuWrapper": "bg-white border w-64 p-1 min-h-[75px] rounded-md shadow-md",
    "menuCloseIcon": "XMark",
    "menuCloseIconWrapper": "hover:cursor-pointer size-4",
    "menuItem": "group flex items-center justify-between px-2 py-1 rounded-md text-sm text-slate-800",
    "menuItemHover": "hover:bg-blue-300",
    "menuItemIconLabelWrapper": "flex flex-grow items-center gap-1",
    "menuItemIconWrapper": "size-5 stroke-slate-500 group-hover:stroke-slate-800",
    "menuItemLabel": "",
    "subMenuIcon": "ArrowRight",
    "valueSubmenuIconWrapper": "flex gap-0.5",
    "subMenuIconWrapper": "place-self-center",
    "valueWrapper": "p-0.5 rounded-md bg-gray-100 text-gray-900 text-sm",
    "separator": "w-full border-b"
  }]
}
```

**Component usage:**
```javascript
const MenuItem = ({ menuItem, setActiveParent }) => {
  const { theme: fullTheme = {} } = React.useContext(ThemeContext) || {};
  const theme = getComponentTheme(fullTheme, 'navigableMenu');

  return (
    <div className={`${theme?.menuItem} ${theme?.menuItemHover}`}>
      <Icon className={theme?.menuItemIconWrapper} icon={menuItem?.icon} />
      <label className={theme?.menuItemLabel}>{menuItem.name}</label>
    </div>
  );
};
```

## Pattern-Level Themes

Components that belong to a specific pattern (e.g., `page`, `forms`, `admin`) can register their themes in the pattern's `defaultTheme.js` instead of the UI-level `defaultTheme.js`. These themes live under the pattern's namespace (e.g., `pages.searchButton`).

### When to Use Pattern-Level Themes

Use pattern-level themes when:
- The component is specific to one pattern (not shared across patterns)
- The component lives in the pattern's directory (e.g., `patterns/page/components/`)

### Step-by-Step for Pattern Themes

**1. Create theme file in the pattern's component directory:**

```javascript
// patterns/page/components/search/theme.js
export const searchButtonTheme = {
  "options": { "activeStyle": 0 },
  "styles": [{
    "name": "default",
    "button": "bg-white flex items-center ...",
    "buttonText": "uppercase text-gray-700 ...",
    "icon": "Search"
  }]
}

export const searchButtonSettings = (theme) => {
  const activeStyle = theme?.pages?.searchButton?.options?.activeStyle || 0
  return [
    {
      label: "Search Button",
      type: 'inline',
      controls: [
        {
          label: 'button',
          type: 'Textarea',
          path: `pages.searchButton.styles[${activeStyle}].button`  // Note: includes "pages." prefix
        }
      ]
    }
  ]
}
```

**2. Register in pattern's defaultTheme.js:**

```javascript
// patterns/page/defaultTheme.js
import { searchButtonTheme, searchButtonSettings } from './components/search/theme'

export default {
  // ... other pattern themes
  searchButton: searchButtonTheme
}

export const pagesThemeSettings = (theme) => {
  return {
    // ... other settings
    searchButton: searchButtonSettings(theme)
  }
}
```

**3. Use dot notation in getComponentTheme:**

```javascript
// In your component
import { ThemeContext, getComponentTheme } from "../../../../ui/useTheme";
import { searchButtonTheme } from "./theme";

const SearchButton = ({ activeStyle }) => {
  // Fallback uses nested structure to match the full theme shape
  const { theme: fullTheme = { pages: { searchButton: searchButtonTheme } } } = useContext(ThemeContext);

  // Use dot notation to access nested theme
  const theme = getComponentTheme(fullTheme, 'pages.searchButton', activeStyle);

  return <button className={theme?.button}>...</button>;
}
```

**Key differences from UI-level themes:**
- Theme path uses dot notation: `'pages.searchButton'` instead of `'searchButton'`
- Fallback structure must match: `{ pages: { searchButton: theme } }`
- Settings paths include full path: `pages.searchButton.styles[0].button`

### Complete Pattern-Level Example: SearchButton & SearchPallet

| Component | Theme File | Component File |
|-----------|-----------|----------------|
| SearchButton | `page/components/search/theme.js` | `page/components/search/index.jsx` |
| SearchPallet | `page/components/search/theme.js` | `page/components/search/index.jsx` |

## Existing Completed Examples

Reference these fully-themed components for patterns:

**UI-Level Components:**

| Component | Theme File | Component File |
|-----------|-----------|----------------|
| Layout | `Layout.theme.jsx` | `Layout.jsx` |
| SideNav | `SideNav.theme.jsx` | `SideNav.jsx` |
| TopNav | `TopNav.theme.jsx` | `TopNav.jsx` |
| NavigableMenu | `navigableMenu/theme.jsx` | `navigableMenu/index.jsx` |

**Pattern-Level Components (Page pattern):**

| Component | Theme File | Component File |
|-----------|-----------|----------------|
| SearchButton | `page/components/search/theme.js` | `page/components/search/index.jsx` |
| SearchPallet | `page/components/search/theme.js` | `page/components/search/index.jsx` |

## Theme Settings (Admin UI)

To make your theme editable in the admin UI, you need to:
1. Export a settings function from your theme file
2. Register it in `src/dms/src/ui/themeSettings.js`

### Step 5a: Create Settings Function

Export a settings function from your theme file:

```javascript
// MyComponent.theme.jsx
export const myComponentSettings = (theme) => [
  {
    label: "MyComponent Styles",
    type: 'inline',
    controls: [
      {
        label: 'Style',
        type: 'Select',
        options: (theme?.myComponent?.styles || [{}])
          .map((k, i) => ({ label: k?.name || i, value: i })),
        path: `myComponent.options.activeStyle`,
      },
      {
        label: 'Wrapper',
        type: 'Textarea',
        path: `myComponent.styles[${theme?.myComponent?.options?.activeStyle}].wrapper`,
      },
      // Add more controls for each theme key...
    ]
  }
];
```

### Step 5b: Register Settings in themeSettings.js

Import and register your settings function in `src/dms/src/ui/themeSettings.js`:

```javascript
// Import your settings
import { myComponentSettings } from "./components/MyComponent.theme";

export default (theme) => {
  return {
    // ... existing settings
    myComponent: myComponentSettings(theme),
  }
}
```

**Important:** The key in the returned object (`myComponent`) should match your component's theme key for consistency, though it's used as the admin UI section identifier.

## Style Inheritance

### How Styles Inherit from the Default

The `styles` array in a component theme uses **index 0 as the complete default**. All other styles are **sparse overrides** that only need to define the keys they change. `getComponentTheme` automatically fills in missing keys from `styles[0]`.

```javascript
const myComponentTheme = {
  options: { activeStyle: 0 },
  styles: [
    {
      name: "default",
      wrapper: "flex flex-col p-4 bg-white",
      title: "text-lg font-semibold text-gray-900",
      content: "mt-2 text-sm text-gray-600",
      button: "px-3 py-2 bg-blue-500 text-white rounded-md",
    },
    {
      name: "Dark",
      // Only override what changes — wrapper, title, content inherit from default
      wrapper: "flex flex-col p-4 bg-gray-900",
      title: "text-lg font-semibold text-white",
    },
  ]
}
```

When `getComponentTheme(theme, 'myComponent', 1)` is called for the "Dark" style, it returns:
```javascript
{
  name: "Dark",
  wrapper: "flex flex-col p-4 bg-gray-900",   // from Dark
  title: "text-lg font-semibold text-white",   // from Dark
  content: "mt-2 text-sm text-gray-600",       // inherited from default
  button: "px-3 py-2 bg-blue-500 text-white rounded-md",  // inherited from default
}
```

### Convention

- **`styles[0]`** is always the **complete default style** — every CSS class key must be defined here
- **`styles[1..n]`** are **sparse overrides** — only define keys that differ from default
- **`getComponentTheme()`** is the **only way** to read a style for rendering — it handles default fill-in automatically
- **Direct `theme[comp].styles[index]` access** is for **introspection only** (e.g., checking what a style explicitly overrode vs what was inherited)

### Cross-Theme Merging

When two themes both define styles for the same component (e.g., `defaultTheme.lexical` and `mnyTheme.lexical`), `mergeTheme()` handles them specially:

1. **Default styles (index 0)** are deep-merged — the override theme's default inherits from the base theme's default
2. **Non-default styles (index 1+)** come wholesale from the override theme — no index-based cross-contamination

This prevents bugs where base theme's "Dark" style at index 1 would bleed into the override theme's unrelated style at index 1.

```
Base theme:      [default, Dark]
Override theme:  [default, "Inline Guidance", Annotation, ...]
Merged result:   [merged-default, "Inline Guidance", Annotation, ...]
                  ↑ deep merge     ↑ from override only
```

### Raw Style Access

If a component needs to know what a style **explicitly set** (as opposed to what it inherited from default), access the styles array directly:

```javascript
// Expanded style (with defaults filled in) — use for rendering
const theme = getComponentTheme(fullTheme, 'myComponent', activeStyle);

// Raw style (only what was explicitly set) — use for introspection
const rawStyle = fullTheme.myComponent?.styles?.[activeStyle];
const isExplicitlySet = rawStyle?.heading_h1 !== undefined;
```

This is useful for features like textSettings where you want to apply a global override only when a style didn't explicitly define its own value.

## Best Practices

1. **`styles[0]` must be complete:**
   - Define every CSS class key in the default style (index 0)
   - Non-default styles can be sparse — they inherit from the default automatically
   - This is enforced by `getComponentTheme`, not by convention alone

2. **Always use `getComponentTheme` for rendering:**
   - Never read `theme[comp].styles[index]` directly for rendering purposes
   - `getComponentTheme` handles default fill-in, activeStyle resolution, and backward compatibility
   - Direct styles array access is only for introspection (checking what was explicitly set)

3. **Naming conventions:**
   - Use camelCase for theme keys
   - Use descriptive names that match component structure
   - Suffix active states with `Active` (e.g., `navitem`, `navitemActive`)
   - Use `_level_N` suffix for depth-specific styles

4. **Fallback handling:**
   - Always use optional chaining: `theme?.wrapper`
   - Provide inline defaults where critical: `theme?.wrapper || ''`

5. **Keep styles atomic:**
   - Each key should style one element
   - Don't combine unrelated elements in one key

6. **Icons:**
   - Store icon names as strings (e.g., `"Menu"`, `"ChevronDown"`)
   - Use the Icon component to render: `<Icon icon={theme?.icon} />`

7. **Backward compatibility:**
   - The system supports both old flat format and new options/styles format
   - `getComponentTheme` handles both automatically

8. **Co-locate theme files with their components:**
   - Theme files should live in the same directory as the component they theme
   - Example: `pages/DatasetsList/datasetsList.theme.js` next to `pages/DatasetsList/index.jsx`
   - Example: `components/MetadataComp/metadataComp.theme.js` next to `components/MetadataComp/index.jsx`
   - Shared/cross-cutting themes (e.g., a table theme used by many components) can live in a common directory
   - The pattern's `defaultTheme.js` imports from these co-located paths and registers them under the pattern namespace

## Troubleshooting

**Theme not applying:**
- Verify the component key in defaultTheme matches the key in `getComponentTheme()`
- Check that ThemeContext is available (component is inside DmsSite)
- Confirm `activeStyle` index exists in the `styles` array

**Custom theme not overriding:**
- Custom themes are merged with defaultTheme via `mergeTheme()` (not raw lodash merge)
- For component styles arrays: only `styles[0]` is deep-merged across themes; `styles[1+]` come from the override theme wholesale
- Ensure the key structure matches exactly
- Check for typos in key names

**Non-default style missing properties:**
- Ensure `styles[0]` has all keys defined — non-default styles inherit from it
- If you're reading `theme[comp].styles[index]` directly, use `getComponentTheme` instead

**Styles flashing on load:**
- Ensure fallback theme is imported in component
- Use `= {}` default in destructuring: `const { theme = {} } = React.useContext(ThemeContext)`
