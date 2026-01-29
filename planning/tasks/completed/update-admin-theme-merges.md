# Update admin theme merges to use `mergeTheme`

## Context

The `mergeTheme` function (in `src/ui/useTheme.js`) was introduced to handle `_replace` declarations in themes, so array fields like widget menus get replaced wholesale instead of deep-merged by index. The page pattern merges (`view.jsx`, `edit/index.jsx`) and the pattern theme editor (`themeEditor.jsx`) have already been updated. The admin pattern still uses raw `lodash.merge` in two files.

## Files to Update

### 1. `src/patterns/admin/siteConfig.jsx` — Straightforward

Two identical merge blocks (lines 48–62 and 152–166) that merge `defaultTheme` with a hardcoded admin layout override:

```js
let theme = merge(
    cloneDeep(defaultTheme),
    {
      "layout": {
        "options": {
          "sideNav": {
            "size": "compact",
            "nav": "main",
            "topMenu": [{"type": "Logo"}],
            "bottomMenu": [{"type": "UserMenu" }]
          }
        }
      }
    }
);
```

**Change:** Replace `merge(cloneDeep(...), ...)` with `mergeTheme(defaultTheme, ...)`. Import `mergeTheme` from `../../ui/useTheme`.

These are simple — the override object is a static literal, and `mergeTheme` handles cloning internally. The `_replace` declarations in `defaultTheme`'s layout options will ensure the `topMenu`/`bottomMenu` arrays in the override replace the defaults rather than merging by index.

### 2. `src/patterns/admin/pages/themes/editTheme.jsx` — DB Theme Editor

This is the editor for database-stored themes (not pattern themes). It has three merge points:

**Line 92 — initial state:**
```js
const [currentTheme, setCurrentTheme] = useImmer(
  merge(cloneDeep(defaultTheme), parseIfJSON(themeObj?.theme))
);
```

**Line 105 — effect when themeObj changes:**
```js
const newTheme = merge(cloneDeep(theme), parseIfJSON(themeObj?.theme))
setCurrentTheme(newTheme)
```

**Line 168 — reset button:**
```js
<Button onClick={() => setCurrentTheme(
  merge(cloneDeep(theme), parseIfJSON(themeObj?.theme))
)}>Reset</Button>
```

**Change:** Replace all three with `mergeTheme(defaultTheme, parseIfJSON(themeObj?.theme))` (or `mergeTheme(theme, ...)` where `theme` is used). Import `mergeTheme` from `../../../../ui/useTheme`.

These merges are straightforward — they combine the base `defaultTheme` with a saved theme object from the database. The saved theme is a diff/override, so `mergeTheme` handles it correctly. The `_replace` declarations flow from `defaultTheme` and ensure any array fields in the saved theme replace rather than merge.

**Note:** The saved theme data in the database won't contain `_replace` keys (they weren't there before). That's fine — `mergeTheme` unions `_replace` from both base and override, so the declarations from `defaultTheme` are sufficient. If a developer creates a new theme with custom array fields, they can add `_replace` declarations in their theme file.

### 3. `src/patterns/admin/pages/patternEditor/default/themeEditor.jsx` — Pattern Theme Editor

**Already partially updated** — the three theme-level merges (lines 111, 139, 158) were converted to `mergeTheme` in the previous task. However, two issues remain:

**Cleanup: unused `merge` import (line 5):**
```js
import {merge, cloneDeep, get, set} from "lodash-es";
```
`merge` is no longer used in this file and should be removed from the import.

**Consideration: pattern theme "minimal diff" saving.**
The pattern theme editor is designed so that only the minimal diff gets saved to the pattern — not the full merged theme. The editor state (`patternTheme` via `useImmer`) holds just the overrides, and the preview (`currentTheme`) is computed by merging `baseTheme` with `patternTheme`. When saved, only `patternTheme` (the diff) goes to the database.

This means the `_replace` declarations from `defaultTheme` flow into `baseTheme` and then into `currentTheme` via `mergeTheme`, but the saved `patternTheme` diff won't contain `_replace` keys unless a developer explicitly adds them. This is correct — when the saved pattern theme is later merged back (in `getPatternTheme`), the `_replace` declarations from `defaultTheme` are already present in the base, so the override arrays get replaced properly.

**One edge case to verify:** When the theme editor's Listbox controls modify array fields (e.g. adding/removing widgets from `topMenu`), they mutate the immer draft directly:
```js
setState(draft => {
  set(draft, 'layout.options.sideNav.topMenu', draft?.layout?.options?.sideNav.topMenu || [])
  draft.layout.options.sideNav.topMenu.push({ type: e })
})
```
These mutations go into `patternTheme` (the diff state), which is correct — the full array value in the diff will replace the base value during `mergeTheme`. No changes needed here.

## Not Changing

- `design.jsx` — already updated in previous task
- The control-level merges in `design.jsx` (lines 21, 121, 147, 171) that merge individual scalar control values into immer state — these are fine with raw `merge` since they're merging single scalar values, not theme trees with arrays

## Implementation

1. Update `siteConfig.jsx`: import `mergeTheme`, replace both merge blocks
2. Update `editTheme.jsx`: import `mergeTheme`, replace all three merge calls
3. Clean up `themeEditor.jsx`: remove unused `merge` from lodash import
4. Build and verify
