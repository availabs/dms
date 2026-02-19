# Phase 1: Lexical + textSettings Foundation

## Status

### Completed
- [x] Move theme from `editor/themes/PlaygroundEditorTheme.js` to `lexical/theme.js`
- [x] Convert theme to flat key structure (e.g., `heading_h1` instead of `heading.h1`)
- [x] Convert to options/styles pattern
- [x] Create `useLexicalTheme` hook and `LexicalThemeContext`
- [x] Update all 17 plugin files to use `useLexicalTheme()` instead of static import
- [x] Create `themeContext.js` to break circular import dependency
- [x] Register `lexicalTheme` in `defaultTheme.js`
- [x] Register `lexicalSettings` in `themeSettings.js`
- [x] Create `textSettings` theme structure
- [x] Add SSR support via `ssr.ts` with `getHtml()` function

### Remaining
- [x] Add 'Dark' style to default lexical theme (from richtext cardTypes)
- [x] Create mnyv1 theme lexical style overrides (Inline Guidance, Annotation, Annotation Image Card, Handwritten_2, sitemap)
- [x] Update richtext component to pass `styleName` prop instead of runtime merge
- [x] Update Lexical entry point to accept `styleName` and look up style by name
- [x] Fix HTML view mode issues (ButtonNode, LayoutContainerNode, LayoutItemNode exportDOM methods)
- [x] Fix bgColor passthrough to Lexical view mode (Option A: inline style)
- [x] Fix IconNode crash in edit mode and rendering in HTML view mode
- [x] Fix HTML view to use correct theme style (not just default)
- [x] Fix height/spacing differences between edit and HTML view for card-styled richtext
- [ ] Replace custom UI components with standard DMS UI components (Button, Select, etc.)
- [ ] Complete testing checklist

---

## Objective

Create the `textSettings` theme object structure, update Lexical to consume both `textSettings` and its own `lexical` theme object via ThemeContext, replace Lexical's custom internal UI components with standard DMS UI components, and modernize Lexical's overall visual appearance.

## Background

Currently, PlaygroundEditorTheme is a flat object imported statically in 17 files. No ThemeContext or getComponentTheme usage exists. This phase establishes the foundation for shared typography across the DMS.

---

## 1. Theme Architecture Changes

### Current State
- PlaygroundEditorTheme is a **flat object** (not options/styles pattern)
- Located at: `editor/themes/PlaygroundEditorTheme.js`
- It's imported **statically** in 17 files - no ThemeContext or getComponentTheme usage
- All styling is inline Tailwind classes within the theme object

### Required Changes

#### 1a. Move Theme File
Move theme from nested location to lexical root:

```
BEFORE: ui/components/lexical/editor/themes/PlaygroundEditorTheme.js
AFTER:  ui/components/lexical/theme.js
```

This follows the pattern of other themed components (e.g., `navigableMenu/theme.jsx`).

#### 1b. Flatten Nested Theme Keys

**IMPORTANT:** The lexical theme must use flat keys, not nested objects, to avoid merge ambiguity.

**Problem:** Nested theme structures cause unpredictable merge behavior. When someone wants to override just `heading.h1`, it's unclear whether the whole `heading` object gets replaced or deep-merged. This makes theme customization unreliable.

**Solution:** Convert nested keys to flat underscore-separated keys:

```js
// Before (nested - problematic for merges)
heading: {
  h1: "text-3xl font-bold",
  h2: "text-2xl font-semibold",
  h3: "text-xl font-medium",
}

// After (flat - predictable merges)
heading_h1: "text-3xl font-bold",
heading_h2: "text-2xl font-semibold",
heading_h3: "text-xl font-medium",
```

**Guidelines:**
- Prefer flat keys when nesting would create merge ambiguity
- Keep structure minimal - organize by naming convention and comments, not deep nesting
- Only use nesting if there are no conflicts and it genuinely improves clarity
- Each theme key should be independently overridable
- When in doubt, use flat keys

**Apply this to all nested structures:**
- `heading: { h1, h2, ... }` → `heading_h1`, `heading_h2`, ...
- `text: { bold, italic, ... }` → `text_bold`, `text_italic`, ...
- `list: { listitem, nested, ... }` → `list_listitem`, `list_nested`, ...
- `codeHighlight: { atrule, attr, ... }` → `codeHighlight_atrule`, `codeHighlight_attr`, ...
- etc.

#### 1c. Convert to options/styles Pattern
Convert to options/styles pattern like other DMS components:

```js
// Before (current flat structure)
const theme = {
  paragraph: "...",
  heading_h1: "...",
  heading_h2: "...",
  // ...
}

// After (options/styles pattern)
const lexicalTheme = {
  options: {
    activeStyle: 0
  },
  styles: [{
    name: "default",
    paragraph: "...",
    heading_h1: "...",
    heading_h2: "...",
    // ...
  }]
}
```

---

## 2. Files Using PlaygroundEditorTheme (17 files)

All these files import the theme statically and need to be updated to use ThemeContext:

| File | Current Usage | Change Required |
|------|---------------|-----------------|
| `editor/index.tsx` | Static import, passes to LexicalComposer | Get theme from context, merge with textSettings |
| `editor/plugins/ToolbarPlugin/index.tsx` | Static import for icon/dropdown classes | Get theme from context |
| `editor/plugins/FloatingLinkEditorPlugin/index.tsx` | Static import for linkEditor classes | Get theme from context |
| `editor/plugins/FloatingTextFormatToolbarPlugin/index.tsx` | Static import for floatingTextFormatPopup | Get theme from context |
| `editor/plugins/DraggableBlockPlugin/index.tsx` | Static import for draggableBlockMenu | Get theme from context |
| `editor/plugins/ActionsPlugin/index.tsx` | Static import for actions classes | Get theme from context |
| `editor/plugins/AutoEmbedPlugin/index.tsx` | Static import for autoEmbedMenu | Get theme from context |
| `editor/plugins/TestRecorderPlugin/index.tsx` | Static import for testRecorder classes | Get theme from context |
| `editor/plugins/TreeViewPlugin/index.tsx` | Static import for treeView classes | Get theme from context |
| `editor/plugins/LayoutPlugin/InsertLayoutDialog.tsx` | Static import for layout classes | Get theme from context |
| `editor/plugins/MentionsPlugin/index.tsx` | Static import for mentionsMenu | Get theme from context |
| `editor/plugins/PasteLogPlugin/index.tsx` | Static import for paste log | Get theme from context |
| `editor/ui/DropDown.tsx` | Static import for dropdown classes | Get theme from context |
| `editor/ui/ImageResizer.tsx` | Static import for resizer classes | Get theme from context |
| `editor/ui/Switch.tsx` | Static import for switch classes | Get theme from context |
| `editor/nodes/StickyComponent.tsx` | Static import for stickyNote classes | Get theme from context |
| `editor/themes/PlaygroundEditorTheme.js` | Theme definition itself | **Move to `lexical/theme.js`**, convert to options/styles, add `lexicalSettings` export |

---

## 3. ThemeContext Integration Pattern

Create helper to get both lexical and textSettings themes:

```js
// In editor/index.tsx or new theme utility
import { useContext } from 'react';
import { ThemeContext, getComponentTheme } from '../../../../useTheme';
import defaultLexicalTheme from './themes/PlaygroundEditorTheme';

function useLexicalTheme() {
  const { theme } = useContext(ThemeContext);

  // Get lexical theme with options/styles pattern
  const lexicalStyles = getComponentTheme(theme, 'lexical', defaultLexicalTheme);

  // Get textSettings (for typography)
  const textSettings = theme?.textSettings || defaultTextSettings;

  // Merge heading styles from textSettings into lexical theme (flat keys)
  return {
    ...lexicalStyles,
    heading_h1: textSettings.h1 || lexicalStyles.heading_h1,
    heading_h2: textSettings.h2 || lexicalStyles.heading_h2,
    heading_h3: textSettings.h3 || lexicalStyles.heading_h3,
    heading_h4: textSettings.h4 || lexicalStyles.heading_h4,
    heading_h5: textSettings.h5 || lexicalStyles.heading_h5,
    heading_h6: textSettings.h6 || lexicalStyles.heading_h6,
  };
}
```

---

## 4. PlaygroundEditorTheme Structure Analysis

The theme is 636 lines organized into these sections.

**NOTE:** All nested structures below must be flattened per section 1b (e.g., `heading.h1` → `heading_h1`).

### Core Editor Layout (lines 9-17)
```
editorScroller, viewScroller, editorContainer, editorShell, card, paragraph, contentEditable
```
Used by: `editor/index.tsx`, `editor/ui/ContentEditable.tsx`

### Typography - Headings (lines 21-28)
```
heading: { h1, h2, h3, h4, h5, h6 }
```
Used by: Lexical's HeadingNode rendering
**→ Should pull from textSettings**

### Typography - Text Formatting (lines 31-40)
```
text: { bold, code, italic, strikethrough, subscript, superscript, underline, underlineStrikethrough }
```
Used by: Lexical's text formatting nodes

### Quote Styling (line 19)
```
quote
```
Used by: Lexical's QuoteNode
**→ Consider textSettings.quote**

### Code Blocks & Syntax Highlighting (lines 45-77)
```
code, codeHighlight: { atrule, attr, boolean, builtin, ... (28 syntax tokens) }
```
Used by: Lexical's CodeNode, CodeHighlightNode

### Block Elements (lines 41-44, 78-127)
```
blockCursor, characterLimit, layoutContainer, layoutItem, embedBlock, hashtag, image, indent, inlineImage, link, mark, markOverlap
```

### Lists (lines 89-104)
```
list: { listitem, listitemChecked, listitemUnchecked, nested, olDepth, ul }
```
Used by: Lexical's ListNode, ListItemNode
**→ Consider textSettings.listItem**

### Tables (lines 128-160)
```
table, tableAddColumns, tableAddRows, tableCell, tableCellActionButton, tableCellActionButtonContainer, tableCellEditing, tableCellHeader, tableCellPrimarySelected, tableCellResizer, tableCellSelected, tableCellSortedIndicator, tableResizeRuler, tableSelected
```
Used by: Lexical's TableNode and related nodes
**→ Consider textSettings.tableHeader, textSettings.tableCell**

### Icons (lines 187-250)
```
icon: { plus, caretRight, columns, dropdownMore, fontColor, fontFamily, bgColor, table, paragraph, h1-h6, bulletList, numberedList, quote, code, bold, italic, underline, link, ... (50+ icons) }
```
Used by: ToolbarPlugin, FloatingTextFormatToolbarPlugin

### UI Components (lines 253-347)
```
switch, linkEditor, dropdown, toolbar
```
Used by: Various plugins for UI rendering

### Editor Shell - Images (lines 348-410)
```
editor: { image, inlineImage } with nested resizer objects
```
Used by: ImagePlugin, InlineImagePlugin

### Editor Shell - Block Controls (lines 302-318)
```
blockControls: { base, button, span }
```
Used by: ToolbarPlugin block type selector

### Floating Format Popup (lines 552-575)
```
floatingTextFormatPopup: { base, popupItem, select, text, icon, chevronDown, divider }
```
Used by: FloatingTextFormatToolbarPlugin

### Collapsible Sections (lines 576-588)
```
collapsible: { container, containerOpen, title, titleBefore, content, collapsedContent }
```
Used by: CollapsiblePlugin

### Table of Contents (lines 589-603)
```
tableOfContents: { container, headings, heading1, heading2, heading3, normalHeading, selectedHeading }
```
Used by: TableOfContentsPlugin

### Miscellaneous (various)
```
typeaheadPopover, debugTimetravelPanel, stickyNote, excalidrawButton, hr, spacer, editorEquation, draggableBlockMenu, draggableBlockTargetLine, actions, nestable, keyword, etc.
```

---

## 5. Custom UI Components to Replace (13 files)

Located in `editor/ui/`:

| File | Current | Replace With | Notes |
|------|---------|--------------|-------|
| `Button.tsx` | Hardcoded Tailwind classes | `UI.Button` | 50 lines, no theme |
| `Modal.tsx` | Custom modal implementation | `UI.Modal` or `UI.Dialog` | Check headless-ui compatibility |
| `Dialog.tsx` | Custom dialog buttons | `UI.Button` | Uses custom Button internally |
| `Select.tsx` | Native `<select>` with custom styling | `UI.Select` | Simple wrapper |
| `DropDown.tsx` | Custom dropdown menu | `UI.Dropdown` or `UI.Popover` | Complex, uses PlaygroundEditorTheme |
| `ColorPicker.tsx` | Full color picker implementation | `UI.ColorPicker` | Check for feature parity |
| `DropdownColorPicker.tsx` | ColorPicker in dropdown | `UI.ColorPicker` variant | Wrapper around ColorPicker |
| `Switch.tsx` | Toggle switch | `UI.Toggle` or headless Switch | Uses PlaygroundEditorTheme |
| `TextInput.tsx` | Basic input | `UI.Input` | Simple replacement |
| `FileInput.tsx` | File upload input | Check for `UI.FileInput` | May need custom |
| `Placeholder.tsx` | Placeholder text | May not need replacement | Keep as-is? |
| `ImageResizer.tsx` | Image resize handles | Keep custom | Specialized for Lexical |
| `ContentEditable.tsx` | Lexical content area | Keep custom | Core Lexical integration |

---

## 6. textSettings Theme Structure

**NOTE:** This structure aligns with the existing Card theme (`dataCardTheme`) which uses a size + weight naming convention. Lexical and other components should use these shared text styles for consistency.

### Existing Card Theme Text Styles (reference)

The Card theme already defines these text styles:
```js
// From dataCardTheme in Card.jsx
textXS: 'text-xs font-medium',
textXSReg: 'text-xs font-normal',
textSM: 'text-sm font-medium',
textSMReg: 'text-sm font-normal',
textSMBold: 'text-sm font-normal',      // note: misnamed, should be font-bold
textSMSemiBold: 'text-sm font-semibold',
textMD: 'text-md font-medium',
textMDReg: 'text-md font-normal',
textMDBold: 'text-md font-bold',
textMDSemiBold: 'text-md font-semibold',
textXL: 'text-xl font-medium',
textXLSemiBold: 'text-xl font-semibold',
text2XL: 'text-2xl font-medium',
text2XLReg: 'text-2xl font-regular',
text3XL: 'text-3xl font-medium',
text3XLReg: 'text-3xl font-normal',
text4XL: 'text-4xl font-medium',
text5XL: 'text-5xl font-medium',
text6XL: 'text-6xl font-medium',
text7XL: 'text-7xl font-medium',
text8XL: 'text-8xl font-medium',
```

### Proposed textSettings (shared across components)

Rather than duplicating text styles in each component, create a shared `textSettings` that components can reference:

```js
textSettings: {
  // ========== Size + Weight Scale ==========
  // Pattern: text{Size}{Weight?} where Weight defaults to medium

  textXS: 'text-xs font-medium',
  textXSReg: 'text-xs font-normal',
  textXSSemiBold: 'text-xs font-semibold',
  textXSBold: 'text-xs font-bold',

  textSM: 'text-sm font-medium',
  textSMReg: 'text-sm font-normal',
  textSMSemiBold: 'text-sm font-semibold',
  textSMBold: 'text-sm font-bold',

  textMD: 'text-base font-medium',       // text-md → text-base for Tailwind
  textMDReg: 'text-base font-normal',
  textMDSemiBold: 'text-base font-semibold',
  textMDBold: 'text-base font-bold',

  textLG: 'text-lg font-medium',
  textLGReg: 'text-lg font-normal',
  textLGSemiBold: 'text-lg font-semibold',
  textLGBold: 'text-lg font-bold',

  textXL: 'text-xl font-medium',
  textXLReg: 'text-xl font-normal',
  textXLSemiBold: 'text-xl font-semibold',
  textXLBold: 'text-xl font-bold',

  text2XL: 'text-2xl font-medium',
  text2XLReg: 'text-2xl font-normal',
  text2XLSemiBold: 'text-2xl font-semibold',
  text2XLBold: 'text-2xl font-bold',

  text3XL: 'text-3xl font-medium',
  text3XLReg: 'text-3xl font-normal',
  text3XLSemiBold: 'text-3xl font-semibold',
  text3XLBold: 'text-3xl font-bold',

  text4XL: 'text-4xl font-medium',
  text5XL: 'text-5xl font-medium',
  text6XL: 'text-6xl font-medium',
  text7XL: 'text-7xl font-medium',
  text8XL: 'text-8xl font-medium',

  // ========== Semantic Aliases (optional) ==========
  // Map semantic names to size/weight combinations

  h1: 'text-4xl font-bold',              // → text4XLBold (if added)
  h2: 'text-3xl font-semibold',          // → text3XLSemiBold
  h3: 'text-2xl font-semibold',          // → text2XLSemiBold
  h4: 'text-xl font-semibold',           // → textXLSemiBold
  h5: 'text-lg font-semibold',           // → textLGSemiBold
  h6: 'text-base font-semibold',         // → textMDSemiBold

  body: 'text-base font-normal',         // → textMDReg
  caption: 'text-xs font-normal',        // → textXSReg
  label: 'text-sm font-medium',          // → textSM
}
```

### Integration with Lexical

Lexical headings should reference textSettings:

```js
// In useLexicalTheme hook
heading_h1: textSettings.h1 || 'text-4xl font-bold',
heading_h2: textSettings.h2 || 'text-3xl font-semibold',
// etc.
```

### Integration with Card

Card theme can either:
1. **Reference textSettings directly** (preferred - single source of truth)
2. **Continue with local definitions** but ensure naming matches textSettings

### Migration Notes

- Card theme has `textSMBold: 'text-sm font-normal'` which appears to be a bug (should be `font-bold`)
- Consider adding `textLG*` variants which are missing from Card theme
- Use `text-base` instead of `text-md` for Tailwind compatibility

---

## 7. Implementation Steps

### Step 1: Create textSettings default theme
- Create `ui/themes/textSettings.js` with default values
- Export from main theme exports

### Step 2: Move and Convert PlaygroundEditorTheme

**Move the file:**
```
FROM: ui/components/lexical/editor/themes/PlaygroundEditorTheme.js
TO:   ui/components/lexical/theme.js
```

**Convert to options/styles pattern:**
- Wrap current theme in `styles[0]`
- Add `options: { activeStyle: 0 }`
- Add `name: "default"` to style

### Step 3: Create useLexicalTheme hook
- Import ThemeContext and getComponentTheme
- Merge lexical theme with textSettings for headings
- Export for use by all lexical files

### Step 4: Update all 17 files to use hook
- Replace static imports with useLexicalTheme
- Update import paths from `./themes/PlaygroundEditorTheme` to `../theme` (or similar)
- Pass merged theme to components

### Step 5: Replace custom UI components (priority order)
1. Button.tsx → UI.Button
2. TextInput.tsx → UI.Input
3. Select.tsx → UI.Select
4. Switch.tsx → UI.Toggle
5. Modal.tsx → UI.Modal
6. Dialog.tsx → UI.Dialog (uses UI.Button)
7. DropDown.tsx → UI.Dropdown (complex, do last)
8. ColorPicker.tsx → UI.ColorPicker (verify feature parity first)

### Step 6: Create and Register lexicalSettings

**Create settings export in theme.js:**

Following the pattern in `navigableMenu/theme.jsx`, create a `lexicalSettings` function:

```js
// ui/components/lexical/theme.js

export const lexicalSettings = (theme) => {
  const activeStyle = theme?.lexical?.options?.activeStyle || 0;
  return [
    {
      label: "Lexical Styles",
      type: 'inline',
      controls: [
        {
          label: 'Style',
          type: 'Select',
          options: (theme?.lexical?.styles || [{}])
            .map((k, i) => ({ label: k?.name || i, value: i })),
          path: `lexical.options.activeStyle`,
        },
        {
          label: 'Add Style',
          type: 'Button',
          children: <div>Add Style</div>,
          onClick: (e, setState) => {
            setState(draft => {
              draft.lexical.styles.push({ ...draft.lexical.styles[0], name: 'new style' })
            })
          }
        },
      ]
    },
    {
      label: "Editor Layout",
      type: 'inline',
      controls: [
        { label: 'editorShell', type: 'Textarea', path: `lexical.styles[${activeStyle}].editorShell` },
        { label: 'editorContainer', type: 'Textarea', path: `lexical.styles[${activeStyle}].editorContainer` },
        { label: 'contentEditable', type: 'Textarea', path: `lexical.styles[${activeStyle}].contentEditable` },
      ]
    },
    {
      label: "Typography - Headings",
      type: 'inline',
      controls: [
        { label: 'h1', type: 'Textarea', path: `lexical.styles[${activeStyle}].heading_h1` },
        { label: 'h2', type: 'Textarea', path: `lexical.styles[${activeStyle}].heading_h2` },
        { label: 'h3', type: 'Textarea', path: `lexical.styles[${activeStyle}].heading_h3` },
        { label: 'h4', type: 'Textarea', path: `lexical.styles[${activeStyle}].heading_h4` },
        { label: 'h5', type: 'Textarea', path: `lexical.styles[${activeStyle}].heading_h5` },
        { label: 'h6', type: 'Textarea', path: `lexical.styles[${activeStyle}].heading_h6` },
      ]
    },
    {
      label: "Typography - Text",
      type: 'inline',
      controls: [
        { label: 'bold', type: 'Textarea', path: `lexical.styles[${activeStyle}].text_bold` },
        { label: 'italic', type: 'Textarea', path: `lexical.styles[${activeStyle}].text_italic` },
        { label: 'underline', type: 'Textarea', path: `lexical.styles[${activeStyle}].text_underline` },
        { label: 'code', type: 'Textarea', path: `lexical.styles[${activeStyle}].text_code` },
      ]
    },
    {
      label: "Toolbar",
      type: 'inline',
      controls: [
        { label: 'toolbar base', type: 'Textarea', path: `lexical.styles[${activeStyle}].toolbar_base` },
        { label: 'toolbar item', type: 'Textarea', path: `lexical.styles[${activeStyle}].toolbar_item_base` },
        { label: 'divider', type: 'Textarea', path: `lexical.styles[${activeStyle}].toolbar_divider` },
      ]
    },
    // ... add more sections as needed for dropdown, tables, etc.
  ];
};
```

**Register in themeSettings.js:**

```js
// ui/themeSettings.js

import { lexicalSettings } from "./components/lexical/theme";

export default (theme) => {
  return {
    // ... existing settings
    lexical: lexicalSettings(theme),
  }
}
```

**Register default theme in defaultTheme.js:**

```js
// ui/defaultTheme.js

import lexicalTheme from "./components/lexical/theme";

const components = {
  // ... existing components
  lexical: lexicalTheme,
}
```

---

## 8. Testing Checklist

### Theme Integration
- [ ] Lexical renders correctly with textSettings
- [ ] Heading styles (h1-h6) use textSettings values
- [ ] Theme changes in ThemeContext propagate to Lexical
- [ ] Default theme works when no context theme provided
- [ ] Multiple Lexical instances can have different themes

### UI Component Replacements
- [ ] Button styling matches rest of UI
- [ ] Modal opens/closes correctly
- [ ] Dropdowns position correctly
- [ ] Select maintains keyboard navigation
- [ ] Color picker has same functionality
- [ ] Switch toggle works correctly

### Backward Compatibility
- [ ] Existing Lexical instances continue to work
- [ ] Old theme structures don't break
- [ ] No console errors from missing theme keys

### Typography Consistency
- [ ] h1 in Lexical matches h1 elsewhere
- [ ] Code blocks match code styling in other components
- [ ] Links have consistent appearance
- [ ] Lists have consistent spacing

---

## 9. Richtext Component Style Migration

### Current State

The richtext component (`patterns/page/components/sections/components/ComponentRegistry/richtext/index.jsx`) maintains its own `cardTypes` object with theme overrides that are merged at runtime:

```js
// Current approach - runtime merge
theme={{
    lexical: isCard ?
        merge(cloneDeep(theme.lexical), cloneDeep(cardTypes?.[isCard] || cardTypes?.['Annotation']), {Icons: theme?.Icons || {}}) :
        merge(theme.lexical,  {Icons: theme?.Icons || {}})
}}
```

### Current cardTypes Styles

| Style Name (used as `name` property) | Description | Target Theme |
|--------------------------------------|-------------|--------------|
| `'Inline Guidance'` | Dashed orange border on contentEditable | Default theme |
| `'Dark'` | White text on dark backgrounds, Oswald headings | **Default theme** |
| `'Annotation'` | Card-like with shadows, special padding, Oswald headings | mnyv1 theme |
| `'Annotation Image Card'` | Annotation + image offset positioning | mnyv1 theme |
| `'Handwritten_2'` | Caveat font family | mnyv1 theme |
| `'sitemap'` | Special link/heading styles for sitemap | mnyv1 theme |

**Important:** The `name` property in each style MUST match the existing `isCard` values exactly (e.g., `'Dark'`, `'Annotation'`) to maintain backward compatibility with saved data.

### Target State

Instead of runtime merges, use the `options.activeStyle` pattern:

1. **Default lexical theme** (`ui/components/lexical/theme.js`) should have:
   - Style 0: "default" (current default)
   - Style 1: "Dark" (from cardTypes['Dark'])

2. **mnyv1 theme** should add lexical styles:
   - Style 0: inherits default
   - Style 1: "Inline Guidance" (from cardTypes['Inline Guidance'])
   - Style 2: "Annotation" (from cardTypes['Annotation'])
   - Style 3: "Annotation Image Card" (from cardTypes['Annotation Image Card'])
   - Style 4: "Handwritten_2" (from cardTypes['Handwritten_2'])
   - Style 5: "sitemap" (from cardTypes['sitemap'])

3. **Richtext component** should:
   - Map `isCard` selection to `activeStyle` index
   - Pass `activeStyle` instead of merged theme object
   - Remove the `cardTypes` object and runtime merge logic

### Implementation Steps

#### Step 9a: Add 'Dark' style to default lexical theme

Add as style 1 in `ui/components/lexical/theme.js`. **Note:** The `name` must be `"Dark"` to match the existing `isCard` value:

```js
// Style 1: Dark text (white on dark backgrounds)
{
  name: "Dark",  // MUST match isCard value exactly
  contentEditable: 'border-none relative [tab-size:1] outline-none',
  editorScroller: "min-h-[150px] border-0 flex relative outline-0 z-0 resize-y",
  viewScroller: "border-0 flex relative outline-0 z-0 resize-none",
  editorContainer: "relative block rounded-[10px] min-h-[50px]",
  editorShell: "font-['Proxima_Nova'] font-[400] text-[16px] text-white leading-[22.4px]",
  heading_h1: "pt-[8px] font-[500] text-[64px] text-white leading-[40px] uppercase font-['Oswald'] pb-[12px]",
  heading_h2: "pt-[8px] font-[500] text-[24px] text-white leading-[24px] scroll-mt-36 font-['Oswald']",
  heading_h3: "pt-[8px] font-[500] text-[16px] text-white font-['Oswald']",
  heading_h4: "pt-[8px] font-medium scroll-mt-36 text-white font-display",
  heading_h5: "scroll-mt-36 font-display",
  heading_h6: "scroll-mt-36 font-display",
  // ... inherit other keys from style 0
}
```

#### Step 9b: Create mnyv1 lexical theme overrides

In the mnyv1 theme file, add lexical styles for Inline Guidance, Annotation, Handwritten, Sitemap, etc:

```js
// mnyv1 theme - lexical overrides
lexical: {
  options: { activeStyle: 0 },
  styles: [
    { name: "default" },  // Inherits from default theme
    {
      name: "Inline Guidance",  // MUST match isCard value exactly
      contentEditable: 'border-3 border-dashed border-[#e7ae48] px-6 py-4 rounded-lg relative [tab-size:1] outline-none',
      // ... other keys
    },
    {
      name: "Annotation",
      // ... annotation styles
    },
    {
      name: "Annotation Image Card",
      // ... annotation image card styles
    },
    {
      name: "Handwritten_2",
      // ... handwritten styles with Caveat font
    },
    {
      name: "sitemap",
      // ... sitemap styles
    }
  ]
}
```

#### Step 9d: Update richtext component

Replace runtime merge with style name lookup:

```js
// Before - hardcoded runtime merge
theme={{
    lexical: isCard ?
        merge(cloneDeep(theme.lexical), cloneDeep(cardTypes?.[isCard])) :
        theme.lexical
}}

// After - lookup style by name, theme-agnostic
// The `isCard` value (e.g., 'Dark', 'Annotation') matches the style's `name` property
// If no match found, defaults to style 0

<Lexical.EditComp
    value={text}
    onChange={setText}
    bgColor={bgColor}
    hideControls={!showToolbar}
    styleName={isCard}  // Pass the style name, let Lexical find the index
/>
```

**Key principle:** The component passes a `styleName` string, and the Lexical entry point looks up the matching style by name. This keeps theme-specific information in the theme files, not hardcoded in components.

#### Step 9d-2: Generate styleOptions dynamically from theme

The current richtext component has hardcoded `styleOptions`:

```js
// Before - hardcoded options
const styleOptions = [
    { label: 'Default Text', value: '' },
    { label: 'Inline Guidance', value: 'Inline Guidance' },
    { label: 'Dark Text', value: 'Dark' },
    { label: 'Annotation Card', value: 'Annotation' },
    // ...
];
```

This should be generated dynamically from the theme's available lexical styles:

```js
// After - dynamically generated from theme
const Edit = ({value, onChange}) => {
    const { theme, UI } = useContext(ThemeContext);

    // Generate style options from theme's lexical styles
    const styleOptions = useMemo(() => {
        const styles = theme?.lexical?.styles || [];
        return [
            { label: 'Default', value: '' },  // Always include default (style 0)
            ...styles
                .filter((s, i) => i > 0 && s.name)  // Skip style 0, require name
                .map(s => ({
                    label: s.label || s.name,  // Use label if provided, else name
                    value: s.name
                }))
        ];
    }, [theme?.lexical?.styles]);

    // ... rest of component
}
```

**Update the controls definition** to use dynamic options:

```js
// Before - static controls export
export default {
    controls: {
        default: [
            {
                type: 'select',
                label: 'Style',
                key: 'isCard',
                options: styleOptions,  // Static array
            },
            // ...
        ]
    }
}

// After - controls as function receiving theme
export default {
    controls: (theme) => ({
        default: [
            {
                type: 'select',
                label: 'Style',
                key: 'isCard',
                options: [
                    { label: 'Default', value: '' },
                    ...(theme?.lexical?.styles || [])
                        .filter((s, i) => i > 0 && s.name)
                        .map(s => ({ label: s.label || s.name, value: s.name }))
                ],
            },
            // ...
        ]
    })
}
```

**Benefits:**
- Different themes show different style options
- mnyv1 theme shows Annotation, Handwritten, etc.
- Default theme only shows Dark, Inline Guidance
- New styles added to a theme automatically appear in the dropdown
- Each style can have a `label` property for display (separate from `name` used for lookup)

#### Step 9e: Update Lexical to accept styleName prop

The Lexical entry point should accept `styleName` and look up the matching style by name:

```js
// editor/index.tsx
export default function Lexicals ({
  value,
  hideControls,
  showBorder,
  onChange,
  bgColor,
  editable = false,
  id,
  theme: themeProp,
  styleName  // NEW: style name to look up (e.g., 'Dark', 'Annotation')
}) {
  const { theme: contextTheme } = React.useContext(ThemeContext) || {};
  const theme = themeProp || contextTheme;

  // Look up style index by name, fallback to theme's default activeStyle, then 0
  const styles = theme?.lexical?.styles || defaultLexicalTheme.styles;
  const styleIndex = styleName
    ? styles.findIndex(s => s.name === styleName)
    : theme?.lexical?.options?.activeStyle ?? 0;

  // If styleName provided but not found, use style 0
  const resolvedIndex = styleIndex === -1 ? 0 : styleIndex;
  const flatLexicalTheme = styles[resolvedIndex] || defaultLexicalTheme.styles[0];
  // ...
}
```

**Benefits of this approach:**
- Theme-agnostic: Component code doesn't know about specific themes
- Extensible: New styles can be added to any theme without code changes
- Backward compatible: If `styleName` not provided, uses `options.activeStyle`
- Graceful fallback: Unknown style names default to style 0

### Testing Checklist for Style Migration

- [ ] Default style (0) renders same as before
- [ ] Dark style (1) renders white text correctly
- [ ] Inline Guidance style (2) shows dashed orange border
- [ ] mnyv1 Annotation styles render correctly
- [ ] Style switching works via controls in richtext component
- [ ] No runtime merge overhead - styles are pre-defined
- [ ] Backward compatibility: old saved data with `isCard` values still works

---

## 10. HTML View Mode Issues (SSR)

### Problem

The new HTML view mode (via `getHtml()` in `ssr.ts`) works for most nodes but **buttons and column layouts don't render correctly**. This is because their `exportDOM()` methods have bugs.

### Root Causes

#### 10a. ButtonNode (`editor/nodes/ButtonNode.tsx`)

**Problem:** The `exportDOM()` method (lines 149-156) sets `element.className = this.__style`, but `this.__style` is a **key name** (e.g., `'primary'`, `'secondary'`), not the actual CSS class string.

```js
// Current - BROKEN
exportDOM(): DOMExportOutput {
  const element = document.createElement('a');
  element.setAttribute('href', this.__path);
  element.setAttribute('data-lexical-button', 'true');
  element.className = this.__style;  // ❌ Sets class="primary" instead of actual Tailwind classes
  element.innerText = this.__linkText;
  return {element};
}
```

**Fix:** Look up the actual CSS classes from `BUTTON_STYLES`:

```js
// Fixed
exportDOM(): DOMExportOutput {
  const element = document.createElement('a');
  element.setAttribute('href', this.__path);
  element.setAttribute('data-lexical-button', 'true');
  element.className = BUTTON_STYLES[this.__style] || BUTTON_STYLES['primary'];  // ✅ Use actual classes
  element.innerText = this.__linkText;
  return {element};
}
```

#### 10b. LayoutContainerNode (`editor/nodes/LayoutContainerNode.ts`)

**Problem:** The `exportDOM()` method (lines 71-76) sets `element.style.gridTemplateColumns = this.__templateColumns`, but `__templateColumns` is a **CSS class name** (used with `addClassNamesToElement` in `createDOM`), not a CSS value.

```js
// Current - BROKEN
exportDOM(): DOMExportOutput {
  const element = document.createElement('div');
  element.style.gridTemplateColumns = this.__templateColumns;  // ❌ Invalid: sets style to "grid-cols-2"
  element.setAttribute('data-lexical-layout-container', 'true');
  return {element};
}
```

**Fix:** Set as className instead of inline style:

```js
// Fixed
exportDOM(): DOMExportOutput {
  const element = document.createElement('div');
  element.className = this.__templateColumns;  // ✅ Apply as CSS class
  element.setAttribute('data-lexical-layout-container', 'true');
  return {element};
}
```

#### 10c. LayoutItemNode (`editor/nodes/LayoutItemNode.ts`)

**Problem:** Missing `exportDOM()` method entirely. Falls back to default ElementNode behavior which doesn't preserve theme classes or attributes.

**Fix:** Add `exportDOM()` method:

```js
// Add this method to LayoutItemNode class
exportDOM(): DOMExportOutput {
  const element = document.createElement('div');
  element.setAttribute('data-lexical-layout-item', 'true');
  // Note: Theme classes from createDOM aren't available here without config
  // May need to pass a default class or access theme differently
  return {element};
}
```

### Testing Checklist for HTML View Mode

- [ ] ButtonNode exports with correct Tailwind classes
- [ ] LayoutContainerNode exports with correct grid classes
- [ ] LayoutItemNode exports with correct attributes
- [ ] Column layouts render correctly in view mode
- [ ] Buttons are clickable and styled correctly in view mode
- [ ] Nested layouts within columns render correctly

---

## 11. Richtext Background Color Passthrough

### Problem

Previously, the richtext component passed `bgColor` to Lexical by merging it into the theme object at runtime (via the old `cardTypes` merge approach). Now that themes always come from ThemeContext, the richtext component no longer has a direct way to inject per-section background color into the Lexical theme.

The `bgColor` prop is already threaded through to both `Lexical.EditComp` and `Lexical.ViewComp`, but the approach needs to be formalized.

### Option A: Props-based approach (simpler)

Keep `bgColor` as a direct prop passed from richtext to Lexical. Apply it as an inline `style` on the container element rather than through the theme.

```jsx
// richtext Edit/View already passes bgColor as a prop
<Lexical.EditComp
    value={text}
    onChange={setText}
    bgColor={bgColor}
    styleName={isCard || undefined}
/>

// In Lexical editor/index.tsx and lexical/index.jsx View:
// Apply bgColor as inline style on the wrapper div
<div className={LexicalTheme.editorShell} style={{ backgroundColor: bgColor }}>
    ...
</div>
```

**Pros:**
- Simple, explicit, already partially in place
- No extra context nesting
- bgColor is a visual concern, not really a "theme" value — inline style is appropriate

**Cons:**
- Inline style sits outside the theme system
- If more per-instance overrides are needed in the future, each one requires a new prop

### Option B: Nested ThemeContext wrapper (theme-consistent)

Wrap the Lexical component in a new ThemeContext.Provider inside the richtext component that merges bgColor into the lexical theme.

```jsx
// In richtext Edit component:
const { theme: fullTheme } = useContext(ThemeContext);

const overriddenTheme = useMemo(() => ({
    ...fullTheme,
    lexical: {
        ...fullTheme.lexical,
        styles: fullTheme.lexical.styles.map((s, i) => {
            // Override the active style's editorShell or add bg class
            if (s.name === isCard || (!isCard && i === 0)) {
                return { ...s, editorShell: `${s.editorShell} bg-[${bgColor}]` };
            }
            return s;
        })
    }
}), [fullTheme, bgColor, isCard]);

<ThemeContext.Provider value={{ ...themeContextValue, theme: overriddenTheme }}>
    <Lexical.EditComp ... />
</ThemeContext.Provider>
```

**Pros:**
- Stays within the theme system
- Lexical doesn't need any special bgColor prop handling
- Extensible: any per-instance theme override can be done this way

**Cons:**
- More complex — requires memoized theme merging
- Creates an extra context provider per richtext section
- Tailwind arbitrary value classes (`bg-[rgba(0,0,0,0)]`) may not work in all cases vs inline styles

---

## 12. HTML View Height/Spacing Fix (htmlConfig)

### Problem

Card-styled richtext editors (e.g., Annotation) showed different height and spacing between edit mode (live Lexical) and HTML view mode (`getHtml()` → `dangerouslySetInnerHTML`).

### Root Cause

The `htmlConfig.export` Map in `htmlConfig.js` had overrides for HeadingNode, ParagraphNode, QuoteNode, ListNode, ListItemNode, and LinkNode that replaced their `exportDOM()` with a plain `createDOM()` call. This was based on the **incorrect assumption** that the default `exportDOM()` doesn't apply theme classes.

**Actual behavior in Lexical v0.39.0:**

The default `exportDOM()` inheritance chain for standard nodes is:

1. `LexicalNode.exportDOM(editor)` → calls `this.createDOM(editor._config, editor)` → **applies theme classes**
2. `ElementNode.exportDOM(editor)` → calls super, then adds **indent** (`paddingInlineStart`) and **direction** (`dir` attribute)
3. `ParagraphNode.exportDOM(editor)` → calls super, then adds **text-align** format and **`<br>` for empty paragraphs**
4. `HeadingNode.exportDOM(editor)` → calls super, then adds **text-align**, **direction**, and **empty `<br>`**

The `useCreateDOM` override only called `createDOM()`, which:
- ✅ Applied theme classes (but the default already did this)
- ❌ Lost indent handling (padding)
- ❌ Lost direction handling (dir attribute)
- ❌ Lost text-align format
- ❌ Lost empty paragraph `<br>` handling

### Fix

Removed all standard node entries from `htmlConfig.export`. Only the CodeNode entry remains (which adds the `data-gutter` attribute not present in the default).

**Before:**
```js
export const htmlConfig = {
  export: new Map([
    [CodeNode, ...],         // ✅ Keep - adds data-gutter
    [HeadingNode, useCreateDOM],    // ❌ Remove - default is better
    [QuoteNode, useCreateDOM],      // ❌ Remove
    [ParagraphNode, useCreateDOM],  // ❌ Remove
    [ListNode, useCreateDOM],       // ❌ Remove
    [ListItemNode, useCreateDOM],   // ❌ Remove
    [LinkNode, useCreateDOM],       // ❌ Remove
  ]),
};
```

**After:**
```js
export const htmlConfig = {
  export: new Map([
    [CodeNode, ...],  // Only CodeNode needs override
  ]),
};
```

### Files Changed
- `editor/htmlConfig.js` — Removed useCreateDOM overrides for standard nodes

---

## 13. References

### Documentation
- **THEMING_GUIDE.md** - `ui/THEMING_GUIDE.md` - Complete guide for converting components to use the DMS theming system, including options/styles pattern, ThemeContext usage, and settings registration

### Example Files (use as patterns)

| File | Purpose |
|------|---------|
| `ui/components/navigableMenu/theme.jsx` | Best example of theme with settings export - includes `navigableMenuSettings` function with style selector, add/remove style buttons, and grouped controls |
| `ui/themeSettings.js` | Shows how to import and register component settings - lexicalSettings should be added here |
| `ui/defaultTheme.js` | Shows how to register default component themes |
| `ui/components/Layout.theme.jsx` | Another example of theme with settings export |
| `ui/components/Button.jsx` | Example of simpler component with theme integration |

### Key Patterns from navigableMenuSettings

```js
// From ui/components/navigableMenu/theme.jsx

export const navigableMenuSettings = (theme) => {
  const activeStyle = theme?.navigableMenu?.options?.activeStyle || 0
  return [
    {
      label: "NavigableMenu Styles",
      type: 'inline',
      controls: [
        {
          label: 'Style',
          type: 'Select',
          options: (theme?.navigableMenu?.styles || [{}])
            .map((k, i) => ({ label: k?.name || i, value: i })),
          path: `navigableMenu.options.activeStyle`,
        },
        {
          label: 'Add Style',
          type: 'Button',
          onClick: (e, setState) => {
            setState(draft => {
              draft.navigableMenu.styles.push({ ...draft.navigableMenu.styles[0], name: 'new style' })
            })
          }
        },
        // ... more controls
      ]
    },
    // ... more sections
  ]
}
```

### Key Patterns from themeSettings.js

```js
// From ui/themeSettings.js

import { navigableMenuSettings } from "./components/navigableMenu/theme";

export default (theme) => {
  return {
    // ... other settings
    navigableMenu: navigableMenuSettings(theme),
    // ADD: lexical: lexicalSettings(theme),
  }
}
```
