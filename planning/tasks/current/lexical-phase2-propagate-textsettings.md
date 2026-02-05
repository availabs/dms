# Phase 2: Propagate textSettings to Core Components

## Objective

After establishing textSettings in Phase 1 with Lexical, propagate the shared typography system to all core DMS UI components for consistent text styling across the entire application.

## Prerequisites

- Phase 1 complete: textSettings theme structure created and working in Lexical
- useLexicalTheme pattern established as reference for other components

---

## Components to Update

### High Priority (Frequently Used)

| Component | File | textSettings Keys to Use |
|-----------|------|--------------------------|
| **Table** | `ui/components/table/index.jsx` | `tableHeader`, `tableHeaderSmall`, `tableCell`, `tableCellSmall` |
| **Card** | `ui/components/Card.jsx` | `cardTitle`, `cardSubtitle`, `cardDescription`, `cardValue`, `cardValueSmall` |
| **Input** | `ui/components/Input.jsx` | `inputText`, `inputTextSmall`, `placeholder`, `label` |
| **Textarea** | `ui/components/Textarea.jsx` | `inputText`, `placeholder` |
| **Select** | `ui/components/Select.jsx` | `inputText`, `menuItem`, `placeholder` |
| **Button** | `ui/components/Button.jsx` | `buttonText`, `buttonTextSmall`, `buttonTextLarge` |

### Medium Priority (Common UI)

| Component | File | textSettings Keys to Use |
|-----------|------|--------------------------|
| **NavigableMenu** | `ui/components/navigableMenu/index.jsx` | `menuItem`, `menuItemSmall`, `menuHeader` |
| **FieldSet** | `ui/components/FieldSet.jsx` | `label`, `labelLarge`, `helper` |
| **Tabs** | `ui/components/Tabs.jsx` | `navItem`, `navItemActive` |
| **Label** | `ui/components/Label.jsx` | `label`, `labelLarge`, `caption` |
| **Dialog** | `ui/components/Dialog.jsx` | `cardTitle`, `body`, `buttonText` |

### Lower Priority (Specialized)

| Component | File | textSettings Keys to Use |
|-----------|------|--------------------------|
| **TopNav** | `ui/components/TopNav.jsx` | `navItem`, `navItemActive` |
| **SideNav** | `ui/components/SideNav.jsx` | `navItem`, `navItemActive`, `menuHeader` |
| **Pagination** | `ui/components/Pagination.jsx` | `bodySmall`, `buttonText` |
| **Menu** | `ui/components/Menu.jsx` | `menuItem`, `menuHeader` |
| **Popover** | `ui/components/Popover.jsx` | `body`, `caption` |
| **ButtonSelect** | `ui/components/ButtonSelect.jsx` | `buttonText`, `menuItem` |

---

## Implementation Pattern

Each component should follow this pattern:

```jsx
import { useContext } from 'react';
import { ThemeContext, getComponentTheme } from '../useTheme';
import defaultComponentTheme from './theme'; // if exists

function Component({ ... }) {
  const { theme } = useContext(ThemeContext);

  // Get component-specific theme
  const componentStyles = getComponentTheme(theme, 'componentName', defaultComponentTheme);

  // Get textSettings for typography
  const textSettings = theme?.textSettings || defaultTextSettings;

  // Use textSettings for text styling
  return (
    <div className={componentStyles.wrapper}>
      <h3 className={textSettings.cardTitle}>{title}</h3>
      <p className={textSettings.body}>{description}</p>
    </div>
  );
}
```

---

## Detailed Component Updates

### Table Component

**Current:** Has its own hardcoded text styles for headers and cells

**Update:**
```jsx
// Header cells
<th className={`${componentStyles.headerCell} ${textSettings.tableHeader}`}>

// Body cells
<td className={`${componentStyles.cell} ${textSettings.tableCell}`}>
```

### Card Component

**Current:** Likely has inline text sizing

**Update:**
```jsx
<div className={componentStyles.card}>
  <h3 className={textSettings.cardTitle}>{title}</h3>
  {subtitle && <p className={textSettings.cardSubtitle}>{subtitle}</p>}
  <p className={textSettings.cardDescription}>{description}</p>
  {value && <span className={textSettings.cardValue}>{value}</span>}
</div>
```

### Input Component

**Current:** Uses `inputTheme` with hardcoded text styles

**Update:**
```jsx
<input
  className={`${componentStyles.input} ${textSettings.inputText}`}
  placeholder={placeholder}
/>
// placeholder styling handled by CSS or textSettings.placeholder
```

### NavigableMenu Component

**Current:** Has `menuTitle`, `menuItemLabel` in theme

**Update:**
- `menuTitle` should incorporate `textSettings.menuHeader`
- `menuItemLabel` should incorporate `textSettings.menuItem`

### Button Component

**Current:** Likely has size variants with hardcoded text

**Update:**
```jsx
<button className={`${componentStyles.button} ${
  size === 'small' ? textSettings.buttonTextSmall :
  size === 'large' ? textSettings.buttonTextLarge :
  textSettings.buttonText
}`}>
```

---

## Fallback Strategy

Components must gracefully handle missing textSettings:

```jsx
const textSettings = theme?.textSettings || {};

// Use with fallback
<h3 className={textSettings.cardTitle || 'text-lg font-semibold'}>
```

Or create a helper:

```jsx
function getTextStyle(textSettings, key, fallback) {
  return textSettings?.[key] || fallback;
}

// Usage
<h3 className={getTextStyle(textSettings, 'cardTitle', 'text-lg font-semibold')}>
```

---

## Testing Checklist

### Per-Component Testing
- [ ] Table headers use textSettings.tableHeader
- [ ] Table cells use textSettings.tableCell
- [ ] Card titles use textSettings.cardTitle
- [ ] Card descriptions use textSettings.cardDescription
- [ ] Input text uses textSettings.inputText
- [ ] Select options use textSettings.menuItem
- [ ] Button text uses textSettings.buttonText
- [ ] Menu items use textSettings.menuItem
- [ ] Tab labels use textSettings.navItem
- [ ] Labels use textSettings.label
- [ ] FieldSet legends use textSettings.label

### Cross-Component Consistency
- [ ] Same text style key produces identical appearance across components
- [ ] Headings in Lexical match headings in Cards
- [ ] Menu items in NavigableMenu match menu items in Select dropdowns
- [ ] Labels are consistent between Input, Select, and FieldSet

### Fallback Testing
- [ ] Components work without textSettings in theme
- [ ] No visual regression when textSettings not provided
- [ ] Console has no errors for missing theme keys

### Theme Override Testing
- [ ] Custom textSettings values override defaults
- [ ] Per-component theme can still override textSettings
- [ ] Theme editor changes propagate to all components
