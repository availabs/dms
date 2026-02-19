# Task: Theme Merging Issues — DONE

## Fix Applied

Implemented Option B in `src/dms/packages/dms/src/ui/useTheme.js`:

- Added `isComponentStylesArray()` — detects arrays of objects with `name` properties
- Added `mergeComponentStyles()` — deep-merges only index 0 (default), takes all non-default styles wholesale from override
- Modified `mergeTheme()` recursion loop — detects component styles arrays and applies smart merge instead of lodash index-merge

The fix is generic: it applies to any component theme with a styles array (lexical, textSettings, any future component), not just lexical.

## Problem

When the mnyv1 theme's "Inline Guidance" lexical style is selected, the editor text displays as `text-white` instead of the expected `text-[#37576B]` (dark blue). The white text comes from the default lexical theme's "Dark" style bleeding into "Inline Guidance" during theme merging.

## Root Cause

The issue is **array-index merging of styles arrays** between two themes that both define `lexical.styles`.

### The Merge Chain

```
getPatternTheme() calls:
  1. mergeTheme(defaultTheme, themes['mnyv1'])   -- base + site theme
  2. mergeTheme(result, pattern.theme)            -- + pattern overrides
```

At step 1, `mergeTheme` calls lodash `merge()` which deep-merges arrays **by index position**.

### Default lexical theme (`ui/components/lexical/theme.js`)

```
styles[0] = { name: "default",  editorShell: "...text-slate-700..." }
styles[1] = { name: "Dark",     editorShell: "...text-white..." }
```

### MNY lexical theme (`themes/mny/theme.js`)

```
styles[0] = { name: "default",           editorShell: "...text-[#37576B]..." }
styles[1] = { name: "Inline Guidance",   contentEditable: "..." }  // sparse, no editorShell
styles[2] = { name: "Annotation",        ... }
styles[3] = { name: "Annotation Image Card", ... }
styles[4] = { name: "Dark",              editorShell: "...text-white..." }
styles[5] = { name: "Handwritten_2",     ... }
styles[6] = { name: "sitemap",           ... }
```

### What Happens During `merge(defaultTheme.lexical, mny.lexical)`

lodash `merge` merges arrays by index, so:

| Index | Default Theme Style | MNY Style | Merged Result |
|-------|-------------------|-----------|---------------|
| 0 | `default` (text-slate-700) | `default` (text-[#37576B]) | MNY default wins (correct) |
| 1 | **`Dark` (text-white)** | **`Inline Guidance` (sparse)** | **Dark's properties leak into Inline Guidance** |
| 2 | (none) | `Annotation` | Annotation (no merge, fine) |
| 3 | (none) | `Annotation Image Card` | Fine |
| 4 | (none) | `Dark` | Fine |
| ... | ... | ... | ... |

**At index 1**: lodash does `merge(Dark, InlineGuidance)`. Since Inline Guidance is sparse (only defines `contentEditable` and `name`), all of Dark's properties survive in the merged result: `editorShell: "...text-white..."`, all the white headings, etc.

### The Second Problem: `getLexicalTheme()` Can't Fix It

In `useLexicalTheme.js`, `getLexicalTheme()` attempts a fix by doing:

```js
const baseStyle = getComponentTheme(theme, 'lexical', 0);      // styles[0]
const lexicalStyles = getComponentTheme(theme, 'lexical', styleName); // styles[1] by name
const mergedTheme = { ...baseStyle, ...lexicalStyles };
```

This shallow-merges `styles[0]` (default) with the looked-up style. But by this point, `styles[1]` is **already the contaminated merge of Dark + Inline Guidance**. It has `editorShell: "...text-white..."` from Dark. The spread `{ ...baseStyle, ...lexicalStyles }` applies styles[1]'s contaminated `editorShell` on top of the correct base, producing white text.

## The Broader Design Problem

This isn't just a lexical bug. **Any UI component that uses the options/styles pattern** will have this problem when:

1. Two themes both define styles arrays for the same component
2. The styles arrays have different lengths or different style meanings at the same index position
3. Sparse styles (which only override a few properties) get index-merged with unrelated styles from the other theme

The `_replace` mechanism in `mergeTheme()` exists but isn't being used for styles arrays.

## Proposed Solutions

### Option A: `_replace: ['styles']` on component themes (quick fix)

Add `_replace: ['styles']` to any component theme that has a styles array. This tells `mergeTheme()` to wholesale-replace the array instead of index-merging it.

```js
// In mny/theme.js
lexical: {
  _replace: ['styles'],  // <-- add this
  options: { activeStyle: 0 },
  styles: [ ... ]
}
```

**Pros**: Minimal change, uses existing infrastructure.
**Cons**: Site themes must be fully self-contained for that component — they can't selectively override one style from the default and inherit the rest. Every site theme that defines lexical styles must redefine ALL styles it needs.

### Option B: Default style flag with smart merging

Add a `_default: true` flag to the default style (index 0) in each component. During merge, non-default styles always inherit from the merged default, never from same-index styles in the base theme.

Modified merge logic:
1. Merge defaults normally (index 0 from both themes)
2. For all other indices: take the override theme's styles wholesale (don't merge with base theme styles at the same index)
3. Each non-default style inherits from the merged default at read time (which `getLexicalTheme` already does)

```js
// In mergeTheme, special handling for styles arrays:
if (Array.isArray(base[key]) && Array.isArray(override[key])) {
  // Check if these are "component styles" (objects with name/options)
  const isComponentStyles = override[key].some(s => s && typeof s === 'object' && 'name' in s);
  if (isComponentStyles) {
    // Merge only index 0 (default), take rest from override wholesale
    result[key] = [
      merge(cloneDeep(base[key][0] || {}), cloneDeep(override[key][0] || {})),
      ...override[key].slice(1).map(s => cloneDeep(s))
    ];
    continue;
  }
}
```

**Pros**: Site themes can still be sparse for the default style while fully owning non-default styles. More intuitive behavior.
**Cons**: More complex merge logic. Assumes index 0 is always the default.

### Option C: Name-based style merging

Instead of merging by array index, merge styles by `name` field:

1. Build a map of `name → style` from the base theme
2. Build a map of `name → style` from the override theme
3. For each override style: if a style with the same name exists in base, merge them. Otherwise, add it as new.
4. Styles from base with no matching name in override are kept as-is.

**Pros**: Most flexible. Style position in the array doesn't matter. Themes can selectively override specific named styles.
**Cons**: Most complex implementation. Requires all styles to have unique names. Changes behavior in potentially surprising ways.

### Option D: Hybrid — `_replace` as default for styles, opt-in to merge

Make styles arrays always replace by default (like Option A), but allow opt-in to name-based merge for specific styles:

```js
lexical: {
  options: { activeStyle: 0, stylesMerge: 'replace' },  // or 'byName'
  styles: [ ... ]
}
```

## Recommendation

**Option A is the immediate fix** — add `_replace: ['styles']` to the default lexical theme and to mny's lexical theme. This stops the cross-contamination.

**Option B is the right medium-term solution** — it preserves the ability for site themes to have sparse defaults while owning their non-default styles. This matches the mental model: "I want to tweak the default style but define my own custom styles."

## Files Involved

| File | Role |
|------|------|
| `src/dms/packages/dms/src/ui/useTheme.js:17-47` | `mergeTheme()` — the core merge function |
| `src/dms/packages/dms/src/ui/useTheme.js:49-69` | `getPatternTheme()` — where the merge chain executes |
| `src/dms/packages/dms/src/ui/defaultTheme.js:75` | Default theme imports `lexicalTheme` |
| `src/dms/packages/dms/src/ui/components/lexical/theme.js:14-540` | Default lexical theme (2 styles: default, Dark) |
| `src/dms/packages/dms/src/ui/components/lexical/useLexicalTheme.js:63-92` | `getLexicalTheme()` — reads merged theme |
| `src/themes/mny/theme.js:502-611` | MNY lexical theme (7 styles) |
| `src/dms/packages/dms/src/patterns/page/pages/view.jsx:33` | Page view merge: `mergeTheme(fullTheme, item.theme)` |

## Testing

After fix:
1. Select "Inline Guidance" style for a lexical section in mnyv1
2. Verify text color is `text-[#37576B]` (dark blue), not `text-white`
3. Verify "Dark" style still shows `text-white`
4. Verify default style shows MNY-branded colors (not catalyst defaults)
5. Verify other sparse styles (Annotation, etc.) inherit from default correctly
