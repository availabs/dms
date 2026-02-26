# UI Component Theming Progress

This document tracks the theming completion status of all UI components registered in `defaultTheme.js`.

## Summary

| Status | Count |
|--------|-------|
| Completed (options/styles + getComponentTheme) | 8 |
| Partial (flat theme or manual merge) | 16 |
| **Total** | **24** |

---

## Theme Infrastructure Status

| Feature | Status | Notes |
|---------|--------|-------|
| `mergeTheme()` — `_replace` declarations | Done | Wholesale key replacement at any level |
| `mergeTheme()` — component styles array detection | Done | Prevents index-merge cross-contamination |
| `mergeComponentStyles()` — merge only defaults across themes | Done | Non-default styles taken wholesale from override |
| `getComponentTheme()` — default fill-in for non-default styles | Done | `{ ...styles[0], ...styles[activeStyle] }` |
| Theme convention documented in THEMING_GUIDE.md | Done | Style inheritance section, conventions, troubleshooting |

---

## Component Theme Handling Patterns

Components fall into two main patterns for consuming theme values. The goal is to migrate all components to Pattern 2 (options/styles), which now has automatic default fill-in via `getComponentTheme`.

### Pattern 1: Direct Context Merge (6 components — need conversion)

**Mechanism:** Component imports its own `localTheme` object with all keys defined, then shallow-merges the context theme on top: `{...localTheme, ...(contextTheme.comp || {})}`.

**Behavior:** Always safe. Every CSS class key has a default. But no style switching (single flat object, no `options/styles` array).

| Component | Theme Key | Default Source | Notes |
|-----------|-----------|----------------|-------|
| Tabs | `tabs` | `tabsTheme` (inline) | 4 flat keys |
| Input | `input` | `inputTheme` (inline) | flat keys |
| Select | `select` | `selectTheme` (inline) | 2 flat keys |
| Dialog | `dialog` | `dialogTheme` (inline) | flat keys + nested `sizes` |
| Icon | `icon` | `iconTheme` (import) | flat keys |
| Menu | `menu` | `menuTheme` (inline) | flat keys |

### Pattern 2: getComponentTheme with options/styles (8 completed + 3 partial)

**Mechanism:** Component calls `getComponentTheme(contextTheme, 'comp', activeStyle)` which returns the resolved style with defaults filled in from `styles[0]`.

**Behavior:** Safe. Non-default styles automatically inherit missing keys from the default style. Supports style switching via `activeStyle`.

**Completed:**

| Component | Theme File | Styles Array | Usage Count |
|-----------|-----------|--------------|-------------|
| Layout | `Layout.theme.jsx` | yes | ~40 files |
| SideNav | `SideNav.theme.jsx` | yes | ~10 files |
| TopNav | `TopNav.theme.jsx` | yes | ~7 files |
| NavigableMenu | `navigableMenu/theme.jsx` | yes | 1 file |
| LayoutGroup | Inline in component | 2 styles (content, header) | 1 file |
| Button | Inline in component | 3 styles (default, plain, active) | ~35 files |
| Card (dataCard) | Inline in component | yes | ~3 files |
| Table | Inline in component | yes | ~30 files |

**Partial (use getComponentTheme but need verification with sparse styles):**

| Component | Theme Key | Notes |
|-----------|-----------|-------|
| Lexical | `lexical` | Has own `getLexicalTheme()` with manual default merge |
| TextSettings | `textSettings` | Future integration point |
| Pagination | (uses `table`) | Shares Table's theme key |

### Special Cases

| Component | Mechanism | Notes |
|-----------|-----------|-------|
| Layout | Manual `merge(cloneDeep(styles[activeStyle]))` + reads `options` separately | Works but could use getComponentTheme |
| Logo | Uses getComponentTheme but flat theme (no styles array) | Falls through to `componentTheme \|\| {}` |
| Listbox | No theming | All styles hardcoded inline |

---

## Theming Completion Criteria

A component is considered **COMPLETED** when it meets ALL of these criteria (per `THEMING_GUIDE.md`):

1. Theme uses modern format with `options` and `styles` keys
2. `styles[0]` is a complete default style (all CSS class keys defined)
3. Component uses `getComponentTheme` from `useTheme.js`
4. Theme is registered in `defaultTheme.js`
5. Settings are registered in `themeSettings.js` (if applicable)

A component is **PARTIAL** if it:
- Uses `ThemeContext` but with manual merge pattern (Pattern 1)
- Has flat theme object (no `options`/`styles`)
- Missing `getComponentTheme` usage

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
16. **Lexical** - Complex, handled via lexical-textsettings Phase 1

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

## Future Work

### lexical-textsettings Phase 1
- [ ] Update `getLexicalTheme()` textSettings heading checks for expanded styles
- [ ] Convert lexical theme to textSettings-based options/styles format

### Component Conversions
- [ ] Convert Pattern 1 components to options/styles format (see conversion order above)
- [ ] Layout — consider migrating from manual merge to getComponentTheme
- [ ] Listbox — consider adding theme support

---

## Notes

- **Pagination** uses `getComponentTheme` but relies on Table's theme (no separate theme)
- **Icon** has a separate `.theme.js` file but component doesn't use `getComponentTheme`
- **Graph** theme is defined as a function that returns an object - needs refactoring
- **Lexical** has extensive internal styling handled by `getLexicalTheme()` — may need textSettings heading check updated when styles are pre-expanded (see THEMING_GUIDE.md)

---

## How to Convert a Component

See `THEMING_GUIDE.md` for detailed instructions. Quick summary:

1. Create theme with `options` and `styles` keys (`styles[0]` must be complete)
2. Update component to use `getComponentTheme`
3. Register theme in `defaultTheme.js`
4. Register settings in `themeSettings.js`
5. Test in existing themes (catalyst, mny)

---

*Last updated: February 2026*
