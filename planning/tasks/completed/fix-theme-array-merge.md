# Fix theme merge for array fields (replace instead of deep merge)

## Original Request

> In the UI, for the theme, dms uses a form of inheritance to set the theme correctly for any page. This allows users to implement minimal changes and save those diffs to merge back with the larger theme. In this case, lets focus on the pages pattern. In siteConfig we use get pattern theme, which takes all the themes available in the site, and the data available in pattern. First it looks to see if the pattern has chosen a theme, and gets that theme from themes and merges that with the default theme. Then it looks for theme data in the pattern and merges that with the merged default/chosen theme. This allows a theme file to only specify parts of a theme and fall back in defaults if you don't specify. It also allows theme re-use across patterns with each pattern customizing the theme slightly, like whether to use top or side nav or other options. Additionally in the pages view and edit, theme information can be saved to the page, which then gets merged with the pattern theme which allows individual pages to customize their theme. This a very powerful design for allowing customizations on different levels and it works very well. However I am having one problem with it, which is that lodash merge merges objects always to the deepest level. This means that to merge well, all values in the themes must be scalars and not objects. However in some cases for example in layout.options.topNav.rightMenu, i use an array, because it registers an array of widgets into the nav. This causes problems for the merge, I would like to set sensible defaults like a logo and userMenu into the base theme, and then at the pattern or even page level they could be overwritten, but because of the merge if these values are set on both levels, they merge awkwardly. I could just json stringify them when they are saved into the theme, and then parse them, but if I do that, I want to like, have some setting on the path that can always be used, and then implement the logic in getPattern theme for example, or a more generic getThemeMerge function which could be used in pattern theme and then on pages/view edit. Please create a task description that would address this problem and include this prompt in the task for reference.

## Problem

The theme inheritance system (defaultTheme → chosen theme → pattern theme → page theme) uses `lodash.merge()` which does a recursive deep merge. This works well for scalar values — a pattern can override just `sideNav.size` and everything else falls back to defaults.

But for **array fields** like widget menus, deep merge produces wrong results:

```js
// Base theme
{ topNav: { rightMenu: [{ type: "Logo" }, { type: "UserMenu" }] } }

// Pattern override (wants ONLY SearchButton)
{ topNav: { rightMenu: [{ type: "SearchButton" }] } }

// lodash.merge result (WRONG — merges by array index)
{ topNav: { rightMenu: [{ type: "SearchButton" }, { type: "UserMenu" }] } }

// Desired result (replace the whole array)
{ topNav: { rightMenu: [{ type: "SearchButton" }] } }
```

`lodash.merge` treats arrays as objects with numeric keys, so it merges index 0 with index 0, index 1 with index 1, etc. This means you can never reduce the length of an array or fully replace it at a lower level.

## Affected Fields

Array fields in `layout.options` that have this problem:

- `layout.options.topNav.leftMenu` — array of widget objects
- `layout.options.topNav.rightMenu` — array of widget objects
- `layout.options.sideNav.topMenu` — array of widget objects
- `layout.options.sideNav.bottomMenu` — array of widget objects
- `layout.options.widgets` — array of available widget definitions

## Theme Merge Hierarchy

```
defaultTheme (src/ui/defaultTheme.js)
  ↓ merge
+ Custom Theme (src/themes/[name]/theme.js)
  ↓ merge (getPatternTheme)
= baseTheme
  ↓ merge
+ Pattern.theme (from database)
  ↓
= Pattern Theme
  ↓ merge (in view.jsx:32)
+ Page.theme (from database)
  ↓
= Final Page Theme
```

Each merge step uses `lodash.merge()`, and arrays at any level get incorrectly merged instead of replaced.

## Current Merge Code

### `getPatternTheme` — `src/dms/packages/dms/src/ui/useTheme.js:9-35`

```js
export const getPatternTheme = (themes, pattern) => {
  let patternSelection = (
    pattern?.theme?.selectedTheme ||
    pattern?.theme?.settings?.theme?.theme ||
    'default'
  )

  let baseTheme = merge(
    cloneDeep(defaultTheme),
    cloneDeep(themes?.[patternSelection] || {}),
  )

  if (!pattern?.theme?.layout?.options) {
    set(pattern, 'theme.layout.options', cloneDeep(baseTheme?.layout?.options))
  }
  delete baseTheme?.layout?.options

  return merge(
    baseTheme,
    cloneDeep(pattern?.theme) || {}
  );
}
```

### Page-level merge — `src/dms/packages/dms/src/patterns/page/pages/view.jsx:32`

```js
let theme = merge(cloneDeep(fullTheme), item?.theme || {})
```

## Proposed Solution: Theme-Internal `_replace` Convention

Instead of maintaining a central list of paths that should be replaced, the theme itself declares which properties use replace semantics. This is extensible — any developer adding a new array property to a theme can mark it as replace-not-merge without editing any configuration file.

### 1. Convention: `_replace` sibling keys

Any theme object can declare a `_replace` array listing the sibling keys that should be replaced wholesale during merge instead of deep-merged:

```js
// In a theme file
{
  layout: {
    options: {
      topNav: {
        _replace: ['leftMenu', 'rightMenu'],
        leftMenu: [{ type: 'Logo' }],
        rightMenu: [{ type: 'UserMenu' }],
      },
      sideNav: {
        _replace: ['topMenu', 'bottomMenu'],
        topMenu: [],
        bottomMenu: [{ type: 'UserMenu' }],
      },
      _replace: ['widgets'],
      widgets: [
        { label: 'Logo', value: 'Logo' },
        { label: 'UserMenu', value: 'UserMenu' },
      ],
    }
  }
}
```

When `_replace: ['rightMenu']` is set, the merge function knows that if the override provides `rightMenu`, it should replace the base value entirely rather than deep-merging by array index.

This convention works at any depth and for any property — not just the known layout options. If a developer adds a new theme property that's an array (e.g. `footer.links`), they just add `_replace: ['links']` as a sibling and the merge handles it correctly.

### 2. Create a `mergeTheme` function

```js
import { merge, cloneDeep, get, set, has, isPlainObject } from 'lodash';

/**
 * Merge two theme objects, respecting `_replace` declarations.
 *
 * At any level in the theme tree, a `_replace` array can list sibling keys
 * that should be replaced wholesale (not deep-merged) when the override
 * provides a value for them.
 *
 * The `_replace` keys themselves are merged (unioned) so that declarations
 * from multiple levels of the hierarchy accumulate.
 */
export function mergeTheme(base, override) {
  if (!override || !isPlainObject(override)) return cloneDeep(base);
  if (!base || !isPlainObject(base)) return cloneDeep(override);

  // Collect _replace declarations from both base and override
  const replaceKeys = new Set([
    ...(base._replace || []),
    ...(override._replace || []),
  ]);

  // Start with a deep merge
  const result = merge(cloneDeep(base), cloneDeep(override));

  // For any key declared in _replace, if the override has it,
  // use the override value directly instead of the merged result
  for (const key of replaceKeys) {
    if (has(override, key)) {
      result[key] = cloneDeep(override[key]);
    }
  }

  // Recurse into nested objects to handle _replace at deeper levels
  for (const key of Object.keys(result)) {
    if (key === '_replace') continue;
    if (replaceKeys.has(key)) continue; // already handled above
    if (isPlainObject(result[key]) && isPlainObject(base[key]) && isPlainObject(override[key])) {
      result[key] = mergeTheme(base[key], override[key]);
    }
  }

  // Union the _replace arrays
  if (replaceKeys.size > 0) {
    result._replace = [...replaceKeys];
  }

  return result;
}
```

### 3. How it works in practice

```js
// defaultTheme declares _replace on topNav
const defaultTheme = {
  layout: {
    options: {
      topNav: {
        _replace: ['leftMenu', 'rightMenu'],
        leftMenu: [{ type: 'Logo' }],
        rightMenu: [{ type: 'UserMenu' }],
      }
    }
  }
}

// Pattern override wants only SearchButton in rightMenu
const patternTheme = {
  layout: {
    options: {
      topNav: {
        rightMenu: [{ type: 'SearchButton' }],
      }
    }
  }
}

// mergeTheme result — rightMenu is REPLACED, not merged
{
  layout: {
    options: {
      topNav: {
        _replace: ['leftMenu', 'rightMenu'],
        leftMenu: [{ type: 'Logo' }],          // inherited from default
        rightMenu: [{ type: 'SearchButton' }],  // replaced by pattern
      }
    }
  }
}
```

The `_replace` declaration flows down through the merge hierarchy. Once declared in `defaultTheme`, it persists through all merge levels (custom theme → pattern → page) without needing to be redeclared.

### 4. Use `mergeTheme` everywhere themes are merged

Replace all `merge(cloneDeep(base), override)` theme calls with `mergeTheme(base, override)`:

- `getPatternTheme` in `useTheme.js`
- Page-level merge in `view.jsx`
- Theme editor in `themeEditor.jsx`

### 5. Add `_replace` to existing theme files

Add `_replace` declarations to `defaultTheme` (and any custom themes) for the known array fields:

- `layout.options.topNav._replace: ['leftMenu', 'rightMenu']`
- `layout.options.sideNav._replace: ['topMenu', 'bottomMenu']`
- `layout.options._replace: ['widgets']`

## Files to Change

- `src/dms/packages/dms/src/ui/useTheme.js` — Update `getPatternTheme`, add `mergeTheme`
- `src/dms/packages/dms/src/patterns/page/pages/view.jsx` — Use `mergeTheme` at page level
- `src/dms/packages/dms/src/patterns/page/pages/edit.jsx` — Use `mergeTheme` at page level (if applicable)
- `src/dms/packages/dms/src/patterns/admin/pages/patternEditor/default/themeEditor.jsx` — Use `mergeTheme` in admin editor

## Testing

1. Set default theme with `sideNav.topMenu: [{type: "Logo"}]` and `sideNav.bottomMenu: [{type: "UserMenu"}]`
2. At pattern level, override `sideNav.topMenu: []` (empty) — verify it becomes empty, not merged
3. At pattern level, override `topNav.rightMenu: [{type: "SearchButton"}]` — verify it replaces, not merges with default
4. At page level, override `sideNav.bottomMenu: [{type: "Logo"}, {type: "SearchButton"}]` — verify it replaces pattern value
5. Verify scalar fields still inherit correctly (e.g., override only `sideNav.size` and keep defaults for everything else)
