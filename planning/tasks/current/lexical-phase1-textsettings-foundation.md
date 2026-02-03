# Phase 1: Lexical + textSettings Foundation

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

#### 1b. Convert to options/styles Pattern
Convert to options/styles pattern like other DMS components:

```js
// Before (current flat structure)
const theme = {
  paragraph: "...",
  heading: { h1: "...", h2: "..." },
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
    heading: { h1: "...", h2: "..." },
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

  // Merge heading styles from textSettings into lexical theme
  return {
    ...lexicalStyles,
    heading: {
      h1: textSettings.h1 || lexicalStyles.heading?.h1,
      h2: textSettings.h2 || lexicalStyles.heading?.h2,
      h3: textSettings.h3 || lexicalStyles.heading?.h3,
      h4: textSettings.h4 || lexicalStyles.heading?.h4,
      h5: textSettings.h5 || lexicalStyles.heading?.h5,
      h6: textSettings.h6 || lexicalStyles.heading?.h6,
    },
    text: {
      ...lexicalStyles.text,
    }
  };
}
```

---

## 4. PlaygroundEditorTheme Structure Analysis

The theme is 636 lines organized into these sections:

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

```js
textSettings: {
  // ========== Headings ==========
  h1: "text-4xl font-bold leading-tight",
  h2: "text-3xl font-semibold leading-snug",
  h3: "text-2xl font-semibold leading-snug",
  h4: "text-xl font-medium leading-normal",
  h5: "text-lg font-medium leading-normal",
  h6: "text-base font-medium leading-normal",

  // ========== Body Text ==========
  body: "text-base leading-relaxed",
  bodyLarge: "text-lg leading-relaxed",
  bodySmall: "text-sm leading-normal",
  bodyXSmall: "text-xs leading-normal",

  // ========== Prose / Rich Text ==========
  prose: "text-base leading-relaxed text-slate-700",
  proseStrong: "font-bold",
  proseEmphasis: "italic",

  // ========== UI Text ==========
  label: "text-sm font-medium",
  labelLarge: "text-base font-medium",
  caption: "text-xs text-gray-500",
  helper: "text-xs text-gray-400",
  hint: "text-sm text-gray-400 italic",

  // ========== Interactive ==========
  link: "text-blue-600 hover:text-blue-800 underline",
  linkSubtle: "text-blue-600 hover:underline",

  // ========== Code ==========
  code: "font-mono text-sm bg-gray-100 px-1 rounded",
  codeBlock: "font-mono text-sm bg-gray-100 p-3 rounded",

  // ========== Lists ==========
  listItem: "text-base leading-relaxed",
  listItemSmall: "text-sm leading-normal",

  // ========== Table Text ==========
  tableHeader: "text-sm font-semibold uppercase tracking-wide",
  tableHeaderSmall: "text-xs font-semibold uppercase tracking-wide",
  tableCell: "text-sm",
  tableCellSmall: "text-xs",

  // ========== Form Text ==========
  inputText: "text-base",
  inputTextSmall: "text-sm",
  placeholder: "text-gray-400",
  errorText: "text-sm text-red-600",
  successText: "text-sm text-green-600",

  // ========== Menu Text ==========
  menuItem: "text-sm",
  menuItemSmall: "text-xs",
  menuHeader: "text-sm font-semibold",

  // ========== Navigation ==========
  navItem: "text-sm font-medium",
  navItemActive: "text-sm font-semibold",
  breadcrumb: "text-sm",

  // ========== Cards ==========
  cardTitle: "text-lg font-semibold",
  cardSubtitle: "text-sm text-gray-500",
  cardDescription: "text-sm text-gray-600",
  cardValue: "text-2xl font-bold",
  cardValueSmall: "text-lg font-semibold",

  // ========== Buttons ==========
  buttonText: "text-sm font-medium",
  buttonTextSmall: "text-xs font-medium",
  buttonTextLarge: "text-base font-medium",

  // ========== Badges / Tags ==========
  badge: "text-xs font-medium",
  tag: "text-xs",

  // ========== Tooltips ==========
  tooltip: "text-xs",

  // ========== Empty States ==========
  emptyTitle: "text-lg font-medium text-gray-900",
  emptyDescription: "text-sm text-gray-500",
}
```

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
        { label: 'h1', type: 'Textarea', path: `lexical.styles[${activeStyle}].heading.h1` },
        { label: 'h2', type: 'Textarea', path: `lexical.styles[${activeStyle}].heading.h2` },
        { label: 'h3', type: 'Textarea', path: `lexical.styles[${activeStyle}].heading.h3` },
        { label: 'h4', type: 'Textarea', path: `lexical.styles[${activeStyle}].heading.h4` },
        { label: 'h5', type: 'Textarea', path: `lexical.styles[${activeStyle}].heading.h5` },
        { label: 'h6', type: 'Textarea', path: `lexical.styles[${activeStyle}].heading.h6` },
      ]
    },
    {
      label: "Typography - Text",
      type: 'inline',
      controls: [
        { label: 'bold', type: 'Textarea', path: `lexical.styles[${activeStyle}].text.bold` },
        { label: 'italic', type: 'Textarea', path: `lexical.styles[${activeStyle}].text.italic` },
        { label: 'underline', type: 'Textarea', path: `lexical.styles[${activeStyle}].text.underline` },
        { label: 'code', type: 'Textarea', path: `lexical.styles[${activeStyle}].text.code` },
      ]
    },
    {
      label: "Toolbar",
      type: 'inline',
      controls: [
        { label: 'toolbar base', type: 'Textarea', path: `lexical.styles[${activeStyle}].toolbar.base` },
        { label: 'toolbar item', type: 'Textarea', path: `lexical.styles[${activeStyle}].toolbar.toolbarItem.base` },
        { label: 'divider', type: 'Textarea', path: `lexical.styles[${activeStyle}].toolbar.divider` },
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

## 9. References

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
