# UI Component Theming Progress

This document tracks the theming completion status of all UI components registered in `defaultTheme.js`.

## Summary

| Status | Count |
|--------|-------|
| Completed | 8 |
| Partial | 16 |
| **Total** | **24** |

---

## Theming Completion Criteria

A component is considered **COMPLETED** when it meets ALL of these criteria (per `THEMING_GUIDE.md`):

1. Theme uses modern format with `options` and `styles` keys
2. Component uses `getComponentTheme` from `useTheme.js`
3. Theme is registered in `defaultTheme.js`
4. Settings are registered in `themeSettings.js` (if applicable)

A component is **PARTIAL** if it:
- Uses `ThemeContext` but with manual merge pattern
- Has flat theme object (no `options`/`styles`)
- Missing `getComponentTheme` usage

---

## Component Status

### COMPLETED (8 components)

| Component | Theme File | Uses getComponentTheme | Patterns Used | Usage Count |
|-----------|-----------|------------------------|---------------|-------------|
| **Layout** | `Layout.theme.jsx` | Yes | page, forms, datasets, admin | ~40 files |
| **SideNav** | `SideNav.theme.jsx` | Yes | admin, forms, datasets | ~10 files |
| **TopNav** | `TopNav.theme.jsx` | Yes | admin, forms, datasets | ~7 files |
| **NavigableMenu** | `navigableMenu/theme.jsx` | Yes | ui (internal) | 1 file |
| **LayoutGroup** | Inline in component | Yes | page | 1 file |
| **Button** | Inline in component | Yes | page, forms, datasets, lexical | ~35 files |
| **Card (dataCard)** | Inline in component | Yes | page | ~3 files |
| **Table** | Inline in component | Yes | page, forms, datasets | ~30 files |

### PARTIAL - Need Conversion (16 components)

| Component | Theme Format | Has ThemeContext | Uses getComponentTheme | Patterns Used | Usage Count | Priority |
|-----------|--------------|------------------|------------------------|---------------|-------------|----------|
| **Tabs** | Flat | Yes | No | ui (internal) | ~1 file | Medium |
| **Menu** | Flat | Yes | No | page, admin, forms, datasets, auth | ~24 files | High |
| **Input** | Flat | Yes | No | navigableMenu, FieldSet, lexical | ~6 files | High |
| **Icon** | Separate .theme.js | - | No | Throughout codebase | ~20 files | Medium |
| **FieldSet (field)** | Flat | Yes | No | page | ~1 file | Low |
| **Dialog** | Flat | Yes | No | page, datasets, forms, lexical | ~22 files | High |
| **Popover** | Flat | Yes | No | page, datasets, forms | ~5 files | Medium |
| **Label** | Flat | Yes | No | page | ~5 files | Low |
| **Select** | Flat | No | No | page, datasets, forms, lexical | ~7 files | High |
| **Listbox** | Flat | No | No | FieldSet | ~1 file | Low |
| **Nestable** | Flat | Yes | No | page | ~3 files | Medium |
| **Graph** | Function (returns flat) | Yes | No | page | ~6 files | Medium |
| **Logo** | Flat | Yes | No | auth, Layout | ~3 files | Low |
| **Lexical** | Empty `{}` | - | - | page | ~60+ files | Low* |
| **Attribution** | Flat | - | No | page (dataWrapper) | ~1 file | Low |
| **Filters** | Flat | - | No | page, datasets, forms | ~7 files | Medium |

*Lexical is a complex editor with many internal components - may need special handling.

### Non-Component Themes (Not requiring conversion)

These are configuration objects, not components:

| Key | Description |
|-----|-------------|
| `pages` | Pattern-level theme (imported from page pattern) |
| `compatibility` | Legacy CSS class string |
| `heading` | Heading level styles (1-3, base, default) |
| `sectionArray` | Grid/layout configuration for sections |

---

## Usage by Pattern

### Page Pattern
Most heavily used - touches nearly all UI components:
- Layout, LayoutGroup, Button, Card, Table, Menu, Dialog, Icon, Tabs
- Graph, Nestable, Filters, Attribution, Lexical

### Forms Pattern
- Layout, SideNav, TopNav, Button, Table, Menu, Dialog, Input
- Select, Filters

### Datasets Pattern
- Layout, SideNav, TopNav, Button, Table, Menu, Dialog
- Select, Popover, Filters

### Admin Pattern
- Layout, SideNav, TopNav, Button, Menu

### Auth Pattern
- Menu, Logo

---

## Recommended Conversion Order

Based on usage count and pattern coverage:

### Phase 1 - High Priority (Most Used)
1. **Menu** - Used across all patterns (~24 files)
2. **Dialog** - Used in page, datasets, forms, lexical (~22 files)
3. **Input** - Core form component (~6 files)
4. **Select** - Core form component (~7 files)

### Phase 2 - Medium Priority
5. **Icon** - Has theme file, needs component update (~20 files)
6. **Tabs** - UI component
7. **Popover** - Used in multiple patterns
8. **Graph** - Page pattern visualization
9. **Nestable** - Page navigation
10. **Filters** - Data filtering UI

### Phase 3 - Low Priority
11. **FieldSet** - Wrapper component
12. **Label** - Simple component
13. **Listbox** - Used via FieldSet
14. **Logo** - Simple component
15. **Attribution** - Page-specific
16. **Lexical** - Complex, may need different approach

---

## Notes

- **Pagination** uses `getComponentTheme` but relies on Table's theme (no separate theme)
- **Icon** has a separate `.theme.js` file but component doesn't use `getComponentTheme`
- Some components like **Lexical** have extensive internal styling that may not fit the standard theming pattern
- **Graph** theme is defined as a function that returns an object - needs refactoring

---

## How to Convert a Component

See `THEMING_GUIDE.md` for detailed instructions. Quick summary:

1. Create theme with `options` and `styles` keys
2. Update component to use `getComponentTheme`
3. Register theme in `defaultTheme.js`
4. Register settings in `themeSettings.js`
5. Test in existing themes (catalyst, mny)

---

*Last updated: January 2026*
