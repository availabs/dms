# Phase 3: Documentation and Migration

## Objective

Document the textSettings system, provide migration guides for existing themes, and update the theme editor to include textSettings configuration.

## Prerequisites

- Phase 1 complete: textSettings working in Lexical
- Phase 2 complete: textSettings propagated to core components

---

## 1. Documentation Updates

### Update component-overview.md

Add new section for textSettings:

```markdown
## textSettings Theme

The `textSettings` theme object provides a centralized typography system used across all DMS components.

### Usage

textSettings is automatically available in the theme context:

\`\`\`jsx
const { theme } = useContext(ThemeContext);
const textSettings = theme?.textSettings || defaultTextSettings;

return <h1 className={textSettings.h1}>Heading</h1>;
\`\`\`

### Available Keys

#### Headings
- `h1` - Primary heading (e.g., page titles)
- `h2` - Secondary heading (e.g., section titles)
- `h3` - Tertiary heading (e.g., card titles)
- `h4`, `h5`, `h6` - Additional heading levels

#### Body Text
- `body` - Standard body text
- `bodyLarge` - Larger body text for emphasis
- `bodySmall` - Smaller body text for secondary content
- `bodyXSmall` - Extra small text

... (continue for all keys)

### Component Integration

Components that use textSettings:
- **Lexical** - h1-h6, body, code, link, listItem
- **Table** - tableHeader, tableCell
- **Card** - cardTitle, cardSubtitle, cardDescription, cardValue
- **Input** - inputText, placeholder, label
- **Button** - buttonText variants
- **NavigableMenu** - menuItem, menuHeader
- **Tabs** - navItem, navItemActive

### Customization

Override textSettings in your theme:

\`\`\`jsx
const myTheme = {
  textSettings: {
    h1: "text-5xl font-black tracking-tight",
    cardTitle: "text-xl font-bold text-blue-900",
    // ... other overrides
  }
};
\`\`\`
```

### Create textSettings Reference Page

New file: `docs/text-settings-reference.md`

- Complete list of all textSettings keys
- Default values for each key
- Visual examples of each style
- Usage examples for common scenarios
- Best practices for customization

---

## 2. Migration Guide

### For Existing Themes

Create `docs/migration-to-textsettings.md`:

```markdown
# Migrating to textSettings

## Overview

textSettings centralizes typography that was previously scattered across component themes.

## Breaking Changes

None - textSettings is additive. Existing themes continue to work.

## Recommended Migration

### Step 1: Add textSettings to your theme

\`\`\`jsx
import { defaultTextSettings } from '@availabs/dms';

const myTheme = {
  // ... existing theme
  textSettings: {
    ...defaultTextSettings,
    // your overrides
  }
};
\`\`\`

### Step 2: Remove duplicate typography from component themes

If you have custom typography in component-specific themes, consider moving them to textSettings:

**Before:**
\`\`\`jsx
const myTheme = {
  card: {
    styles: [{
      title: "text-xl font-bold", // typography here
      wrapper: "p-4 rounded-lg",
    }]
  }
};
\`\`\`

**After:**
\`\`\`jsx
const myTheme = {
  textSettings: {
    cardTitle: "text-xl font-bold", // typography centralized
  },
  card: {
    styles: [{
      wrapper: "p-4 rounded-lg", // only layout/structure
    }]
  }
};
\`\`\`

### Step 3: Verify consistency

Check that text styles are consistent:
- Headings in Lexical should match headings in Cards
- Menu items should look the same across NavigableMenu and Select
- Labels should be consistent across all form components

## Gradual Migration

You don't need to migrate everything at once:

1. Start by adding textSettings with defaults
2. Components will use textSettings automatically
3. Gradually move custom typography to textSettings
4. Remove redundant styles from component themes
```

---

## 3. Theme Editor Updates

### Add textSettings Section

Update theme editor to include textSettings configuration:

```jsx
// In theme editor config
{
  label: "Text Settings",
  type: 'section',
  controls: [
    {
      label: "Headings",
      type: 'inline',
      controls: [
        { label: 'h1', type: 'Textarea', path: 'textSettings.h1' },
        { label: 'h2', type: 'Textarea', path: 'textSettings.h2' },
        { label: 'h3', type: 'Textarea', path: 'textSettings.h3' },
        { label: 'h4', type: 'Textarea', path: 'textSettings.h4' },
        { label: 'h5', type: 'Textarea', path: 'textSettings.h5' },
        { label: 'h6', type: 'Textarea', path: 'textSettings.h6' },
      ]
    },
    {
      label: "Body Text",
      type: 'inline',
      controls: [
        { label: 'body', type: 'Textarea', path: 'textSettings.body' },
        { label: 'bodyLarge', type: 'Textarea', path: 'textSettings.bodyLarge' },
        { label: 'bodySmall', type: 'Textarea', path: 'textSettings.bodySmall' },
      ]
    },
    // ... more sections for UI text, interactive, code, etc.
  ]
}
```

### Create textSettingsSettings Export

Similar to `navigableMenuSettings`:

```jsx
// ui/themes/textSettings.js

export const textSettingsSettings = (theme) => {
  return [
    {
      label: "Headings",
      type: 'inline',
      controls: [
        { label: 'H1', type: 'Textarea', path: 'textSettings.h1' },
        { label: 'H2', type: 'Textarea', path: 'textSettings.h2' },
        // ...
      ]
    },
    {
      label: "Body Text",
      type: 'inline',
      controls: [
        { label: 'Body', type: 'Textarea', path: 'textSettings.body' },
        { label: 'Body Large', type: 'Textarea', path: 'textSettings.bodyLarge' },
        { label: 'Body Small', type: 'Textarea', path: 'textSettings.bodySmall' },
      ]
    },
    {
      label: "UI Text",
      type: 'inline',
      controls: [
        { label: 'Label', type: 'Textarea', path: 'textSettings.label' },
        { label: 'Caption', type: 'Textarea', path: 'textSettings.caption' },
        { label: 'Helper', type: 'Textarea', path: 'textSettings.helper' },
      ]
    },
    {
      label: "Interactive",
      type: 'inline',
      controls: [
        { label: 'Link', type: 'Textarea', path: 'textSettings.link' },
        { label: 'Link Subtle', type: 'Textarea', path: 'textSettings.linkSubtle' },
      ]
    },
    {
      label: "Code",
      type: 'inline',
      controls: [
        { label: 'Inline Code', type: 'Textarea', path: 'textSettings.code' },
        { label: 'Code Block', type: 'Textarea', path: 'textSettings.codeBlock' },
      ]
    },
    {
      label: "Tables",
      type: 'inline',
      controls: [
        { label: 'Table Header', type: 'Textarea', path: 'textSettings.tableHeader' },
        { label: 'Table Cell', type: 'Textarea', path: 'textSettings.tableCell' },
      ]
    },
    {
      label: "Forms",
      type: 'inline',
      controls: [
        { label: 'Input Text', type: 'Textarea', path: 'textSettings.inputText' },
        { label: 'Placeholder', type: 'Textarea', path: 'textSettings.placeholder' },
        { label: 'Error Text', type: 'Textarea', path: 'textSettings.errorText' },
      ]
    },
    {
      label: "Menus",
      type: 'inline',
      controls: [
        { label: 'Menu Item', type: 'Textarea', path: 'textSettings.menuItem' },
        { label: 'Menu Header', type: 'Textarea', path: 'textSettings.menuHeader' },
      ]
    },
    {
      label: "Cards",
      type: 'inline',
      controls: [
        { label: 'Card Title', type: 'Textarea', path: 'textSettings.cardTitle' },
        { label: 'Card Subtitle', type: 'Textarea', path: 'textSettings.cardSubtitle' },
        { label: 'Card Value', type: 'Textarea', path: 'textSettings.cardValue' },
      ]
    },
    {
      label: "Buttons",
      type: 'inline',
      controls: [
        { label: 'Button Text', type: 'Textarea', path: 'textSettings.buttonText' },
        { label: 'Button Small', type: 'Textarea', path: 'textSettings.buttonTextSmall' },
        { label: 'Button Large', type: 'Textarea', path: 'textSettings.buttonTextLarge' },
      ]
    },
  ];
};
```

### Add Live Preview

Add a preview panel in theme editor showing textSettings in action:

```jsx
function TextSettingsPreview({ textSettings }) {
  return (
    <div className="p-4 space-y-4">
      <h1 className={textSettings.h1}>Heading 1</h1>
      <h2 className={textSettings.h2}>Heading 2</h2>
      <h3 className={textSettings.h3}>Heading 3</h3>
      <p className={textSettings.body}>Body text example</p>
      <p className={textSettings.bodySmall}>Small body text</p>
      <a className={textSettings.link}>Link example</a>
      <code className={textSettings.code}>inline code</code>
      <label className={textSettings.label}>Label text</label>
    </div>
  );
}
```

---

## 4. Testing Checklist

### Documentation
- [ ] component-overview.md updated with textSettings section
- [ ] All textSettings keys documented with descriptions
- [ ] Usage examples provided for each component
- [ ] Visual examples show each text style

### Migration Guide
- [ ] Step-by-step migration instructions clear
- [ ] Before/after code examples provided
- [ ] No breaking changes documented
- [ ] Gradual migration path explained

### Theme Editor
- [ ] textSettings section appears in editor
- [ ] All textSettings keys editable
- [ ] Changes apply in real-time
- [ ] Preview shows text styles correctly
- [ ] Settings persist when theme saved

### Integration
- [ ] textSettingsSettings exported correctly
- [ ] Works with existing theme editor infrastructure
- [ ] Default values show when textSettings not customized
