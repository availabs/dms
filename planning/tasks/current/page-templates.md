# Page Templates

## Status: IN PROGRESS — Phases 1–5 coded

## Objective

When a user creates a new page, they choose from a template picker instead of always starting blank. Templates come from two sources:

1. **Theme templates** — static, shipped in `defaultTheme.js` under `page_templates`; available to all themes immediately
2. **User templates** — dynamic, saved by authors to the DB under `{pattern}|page_template`; scoped per-pattern

The research doc is at `planning/research/templates.md`.

---

## User answers (design decisions locked in)

- **Add Page UX**: always open the template picker; Blank is the first option
- **User templates**: both "Save current page as template" (in settings pane) AND a dedicated template manager page in the pattern editor
- **Template content**: theme templates include Lexical placeholder text (heading + body paragraph); Cards/Spreadsheet/Graph templates use a random dataset from the pattern (if the site has datasets). If no datasets are available, fall back to static columns. Dataset binding will be standardized further when site-level templates are built.
- **pageTemplateManagerPane**: its own dedicated tab in the pattern editor (not nested under an existing tab)
- **Design-first workflow**: any new UI (picker, manager tab) must have an HTML design in `src/themes/mny/design/pages/` reviewed and approved before implementation begins

---

## Scope (Phase 1: Page templates only)

Site templates (create a whole site with multiple patterns pre-populated) are explicitly deferred. Start with page templates and verify the UX before expanding.

---

## Current state

- `newPage()` in `editFunctions.jsx` creates a bare page immediately on button click
- `AddPageButton` in `pagesPane.jsx` calls `newPage()` directly with no template
- No `page_templates` key exists in any theme file
- Component-level templates (`TemplateManager.jsx`) already exist and model the DB-row approach

---

## Template data shape

A template is a plain object that can be spread directly onto the new page item. Fields:

```js
{
  id: string,          // unique slug, used to match DB rows for user templates
  name: string,        // display name in picker (e.g. "Article")
  description: string, // one-line shown below name
  // thumbnail: string // optional URL to a preview image — deferred

  // page attributes merged into the new page item at creation time:
  draft_sections: Section[],           // pre-built sections (see shape below)
  draft_section_groups: SectionGroup[] // pre-built section groups
}
```

### Section shape (inside `draft_sections`)

```js
{
  // section format attrs:
  title: '',          // empty title unless template needs a heading
  level: '0',         // '0' = hidden title (clean look)
  size: '',           // omit to inherit grid default; '1/2' for two-col
  group: 'content',   // the group name from draft_section_groups
  element: {
    'element-type': 'lexical',  // or 'Card', 'Spreadsheet', etc.
    'element-data': '...'       // JSON.stringify(Lexical state | Card config)
  }
}
```

### SectionGroup shape (inside `draft_section_groups`)

```js
{
  name: 'default',        // referenced by section.group — MUST NOT be "top", "content", or "bottom"
  position: 'content',    // 'top' | 'content' | 'bottom' | 'sidebar'
  index: 0,
  theme: 'content'        // layoutGroup style name (not the same as position)
}
```

**Important**: `name` must not be `"top"`, `"content"`, or `"bottom"` — those strings are reserved as
`SECTION_TARGETS` in `sectionGroupsPane.jsx` and would overwrite the tree's section-header nodes,
breaking the groups panel. Use `"default"` for a generic content group, or a UUID for additional groups.

### element-type keys (ComponentRegistry keys)

| Display name | element-type key |
|---|---|
| Rich Text | `'lexical'` |
| Card | `'Card'` |
| Spreadsheet | `'Spreadsheet'` |
| Graph | `'Graph'` |
| AVL Graph | `'AVL Graph'` |
| Header | `'Header: Default Header'` |

---

## Built-in theme templates (5 templates)

All go into `src/dms/packages/dms/src/ui/pageTemplates.js` and are imported into `defaultTheme.js`.

### 1. Blank

```js
{
  id: 'blank',
  name: 'Blank',
  description: 'Start with an empty page',
  draft_sections: [],
  draft_section_groups: [
    { name: 'default', position: 'content', index: 0, theme: 'content' }
  ]
}
```

### 2. Article

One richtext section. Lexical state has a heading + a body paragraph with placeholder text.

```js
{
  id: 'article',
  name: 'Article',
  description: 'Long-form text page — great for docs, reports, or blog posts',
  draft_sections: [
    {
      title: '', level: '0', group: 'default',
      element: {
        'element-type': 'lexical',
        'element-data': JSON.stringify(articleLexicalState) // see helpers section
      }
    }
  ],
  draft_section_groups: [
    { name: 'default', position: 'content', index: 0, theme: 'content' }
  ]
}
```

`articleLexicalState` is a Lexical JSON object with:
- One `heading` node (tag `h1`), text: `"Page Title"`
- One `paragraph` node, text: `"Start writing your content here."`

### 3. Two Column

Two half-width richtext sections side by side.

```js
{
  id: 'two_column',
  name: 'Two Column',
  description: 'Two equal-width content areas side by side',
  draft_sections: [
    {
      title: '', level: '0', size: '1/2', group: 'default',
      element: { 'element-type': 'lexical', 'element-data': JSON.stringify(placeholderLexicalState('Left column')) }
    },
    {
      title: '', level: '0', size: '1/2', group: 'default',
      element: { 'element-type': 'lexical', 'element-data': JSON.stringify(placeholderLexicalState('Right column')) }
    }
  ],
  draft_section_groups: [
    { name: 'default', position: 'content', index: 0, theme: 'content' }
  ]
}
```

### 4. Data View

One Card section with no data source configured. Author wires up a source after creation.

```js
{
  id: 'data_view',
  name: 'Data View',
  description: 'A single data table or card grid — connect a data source to populate it',
  draft_sections: [
    {
      title: '', level: '0', group: 'default',
      element: { 'element-type': 'Card', 'element-data': '{}' }
    }
  ],
  draft_section_groups: [
    { name: 'default', position: 'content', index: 0, theme: 'content' }
  ]
}
```

### 5. Dashboard

Header section (richtext, full width) in a top group + two Card sections in a content group.

```js
{
  id: 'dashboard',
  name: 'Dashboard',
  description: 'Overview page with a header band and two data sections below',
  draft_sections: [
    {
      title: '', level: '0', group: 'header',
      element: { 'element-type': 'lexical', 'element-data': JSON.stringify(placeholderLexicalState('Dashboard Title')) }
    },
    {
      title: '', level: '0', size: '1/2', group: 'default',
      element: { 'element-type': 'Card', 'element-data': '{}' }
    },
    {
      title: '', level: '0', size: '1/2', group: 'default',
      element: { 'element-type': 'Card', 'element-data': '{}' }
    }
  ],
  draft_section_groups: [
    { name: 'header', position: 'top', index: 0, theme: 'header' },
    { name: 'default', position: 'content', index: 1, theme: 'content' }
  ]
}
```

### Lexical placeholder state helper

```js
// Minimal Lexical serialized state with a paragraph of placeholder text.
function placeholderLexicalState(text) {
  return {
    root: {
      children: [
        {
          children: [
            { detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }
          ],
          direction: 'ltr', format: '', indent: 0,
          type: 'paragraph', version: 1
        }
      ],
      direction: 'ltr', format: '', indent: 0,
      type: 'root', version: 1
    }
  };
}
```

---

## User-created templates (DB)

### Storage

Same pattern as component templates (`TemplateManager.jsx`):

```
app  = <site app>
type = `${pattern}|page_template`
```

The name is stored inside `data`; listing templates = one exact-type query.

### Data fields saved per template

```js
{
  name: string,          // display name
  slug: string,          // nameToSlug(name), used for overwrite matching
  description: string,   // optional short description
  draft_sections: [...], // JSON.stringify'd
  draft_section_groups: [...],  // JSON.stringify'd
  createdAt: ISO string,
  createdBy: user email,
  updatedAt: ISO string,
  updatedBy: user email
}
```

### Save-as-template flow

1. Author is on a page, opens "Settings" pane in the edit panel
2. A "Save as Page Template" section at the bottom: an input for the template name + a "Save" button
3. On save: read `item.draft_sections` + `item.draft_section_groups`, strip section IDs and refs (so they don't conflict on apply), `apiUpdate` to create/overwrite a `{pattern}|page_template` row

### Dedicated template manager (in pattern editor)

In the pattern editor (FormatManager), add a "Page Templates" tab alongside existing tabs. This tab:
- Lists all user-saved templates (fetch `{pattern}|page_template` rows)
- Shows name, description, created by/at
- Actions: Apply (creates new page from template), Delete (two-step confirm)
- **Stretch (Phase 2)**: Preview (renders a static mock or thumbnail)

---

## Files to create / modify

### New files

| File | Purpose |
|---|---|
| `src/dms/packages/dms/src/ui/pageTemplates.js` | The 5 default templates + Lexical helper functions |
| `src/dms/packages/dms/src/patterns/page/components/PageTemplatePicker.jsx` | Modal that shows theme + DB templates; user selects one |
| `src/dms/packages/dms/src/patterns/page/components/PageTemplatePicker.theme.js` | Theme keys for the picker UI |
| `src/dms/packages/dms/src/patterns/page/components/pageTemplate_utils.js` | Type building (`buildPageTemplateType`), payload building (`buildPageTemplatePayload`), section sanitization (`sanitizeSectionsForTemplate`) |
| `src/dms/packages/dms/src/patterns/page/pages/edit/editPane/pageTemplateManagerPane.jsx` | Pattern-editor pane: lists/deletes user templates |

### Modified files

| File | Change |
|---|---|
| `src/dms/packages/dms/src/ui/defaultTheme.js` | Add `page_templates: defaultPageTemplates` |
| `src/dms/packages/dms/src/patterns/page/pages/edit/editPane/pagesPane.jsx` | `AddPageButton` opens `PageTemplatePicker` instead of calling `newPage` directly |
| `src/dms/packages/dms/src/patterns/page/pages/edit/editFunctions.jsx` | `newPage(item, dataItems, user, apiUpdate, template?)` — spread template fields when provided |
| `src/dms/packages/dms/src/patterns/page/pages/edit/editPane/settingsPane.jsx` | Add "Save as Page Template" section at the bottom |
| `src/dms/packages/dms/src/patterns/page/pages/edit/editPane/index.jsx` | Add a "Page Templates" tab entry pointing to `pageTemplateManagerPane` |
| `src/dms/packages/dms/src/patterns/page/defaultTheme.js` | Add `pageTemplatePicker` and `pageTemplateManager` keys to the themes |
| `src/dms/packages/dms/src/patterns/page/pages/formatManager.jsx` | Wire in the pageTemplateManagerPane as an accessible panel |

---

## Implementation phases

### Phase 1 — Theme templates + modified `newPage()` — DONE

- [x] Create `ui/pageTemplates.js` with the 5 templates and Lexical helpers
- [x] Add `page_templates` to `defaultTheme.js`
- [x] Modify `newPage()` in `editFunctions.jsx` to accept an optional `template` param and spread template fields
- [ ] Verify: calling `newPage(item, dataItems, user, apiUpdate, blankTemplate)` produces a page identical to today's behavior

### Phase 2 — Template picker UI — DONE

- [x] Create `PageTemplatePicker.jsx` — modal with a grid of template cards, tabs for theme vs user templates
- [x] Create `PageTemplatePicker.theme.js` — all theme keys
- [x] Register `pageTemplatePicker` key in `patterns/page/defaultTheme.js`
- [x] Modify `AddPageButton` in `pagesPane.jsx`: opens picker; on select calls `newPage(item, dataItems, user, apiUpdate, template)`
- [ ] Verify: picker opens, Blank + 4 theme templates shown, selecting one creates the right page

### Phase 3 — User template DB loading in picker — DONE

- [x] Create `pageTemplate_utils.js` with `buildPageTemplateType`, `sanitizeSectionsForTemplate`, `buildPageTemplatePayload`
- [x] `PageTemplatePicker.jsx` loads DB templates via `apiLoad` in "Your Templates" tab
- [ ] Verify: user templates appear in the picker after being saved

### Phase 4 — Save as template (in settings pane) — DONE

- [x] Add `SaveAsTemplateSection` component to `settingsPane.jsx` — name + description inputs, overwrite guard, success/error feedback
- [ ] Verify: saving creates a DB row; it appears in the picker's "Your Templates" tab

### Phase 5 — Template manager in pattern editor — DONE

- [x] Create `pageTemplateManagerPane.jsx` — lists/deletes `{pattern}|page_template` rows with two-step confirm
- [x] Create `pageTemplateManagerPane.theme.js` — theme keys
- [x] Wired into `patternEditor/index.jsx` as "Page Templates" tab (page-pattern only)
- [ ] Verify: templates appear in manager, delete works

---

## API / data notes

- No new Falcor routes needed — user templates use the existing generic create/list/delete paths (same as component templates)
- `apiLoad` with `action: 'list'` and `format: { app, type: '${pattern}|page_template', attributes: [...] }` lists all user templates
- `apiUpdate` with `data: payload` and `config: { format: { app, type: '${pattern}|page_template' } }` creates/updates
- `apiUpdate` with `requestType: 'delete'` and `data: { id }` deletes

---

## Testing checklist

- [ ] "Blank" template produces a page identical to the old "Add Page" behavior (no regressions)
- [ ] "Article" template: page created with one richtext section containing placeholder text
- [ ] "Two Column" template: page created with two half-width richtext sections
- [ ] "Data View" template: page created with one empty Card section
- [ ] "Dashboard" template: page created with top-band header + two half-width Card sections in content band
- [ ] Picker opens immediately on "Add Page" click
- [ ] Keyboard accessibility: can Tab through template cards, Enter to confirm
- [ ] User saves current page as a template → it appears in the picker
- [ ] Template manager in pattern editor: lists, deletes user templates correctly
- [ ] Theme overrides work: a theme can add a `page_templates` array to override the defaults
- [ ] Submodule: all existing tests still pass (`npm run lint` clean, no Fast Refresh regressions)
