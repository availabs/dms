# Pattern Creation Flow — Redesigned Add Pattern Modal

## Status: DONE

## Design file
`src/themes/mny/design/pages/pattern-creation-flow.html`

## Objective

Replace the existing "Add Pattern" modal (a vertical form with a `pattern_type` dropdown followed by
name/base_url fields) with a visual card picker. The modal opens directly to a grid of cards — one per
non-page pattern type and one per page template. Page template cards are labeled with a `page` tag so
the user knows which pattern type they're creating. Selecting any card reveals a minimal name + base URL
form at the bottom. For page templates, creating the pattern also creates the first page using that
template.

---

## Redesigned UX (three states — see design file for mocks)

### State 1 — modal open, nothing selected

A grid of cards:
- Row 1: `Datasets`, `Forms` (non-page patterns, no tag)
- Divider: subtle `page templates` label
- Row 2+: one card per page template, each with a `page` tag in the top-right corner
  (`Blank`, `Article`, `Two Column`, `Card Grid`, `Stats + Chart`, `Narrative`, `Overview`, `Profile`,
  `Dashboard`)

Below the grid: greyed-out placeholder text `"Select an option above to continue"`.

### State 2 — page template card selected

The selected card gets a ring + slightly elevated background. Below the grid, the confirmation area
appears with:
- Label: `"[Template Name] — page pattern"` (e.g., `"Article — page pattern"`)
- Name field (pre-filled with a sensible default, e.g., `"Pages"` for Blank, template name otherwise)
- Base URL field (auto-derived from name slug, editable)
- `Add` button

### State 3 — non-page pattern card selected

Same as State 2, but the label reads `"Datasets pattern"` / `"Forms pattern"` and no page is created.

---

## What this replaces

The `attrToAddNew = ['pattern_type', 'name', 'base_url', 'filters', 'authPermissions']` generic form
loop inside the `<Modal open={addingNew}>` block in `patternList.jsx` and `editSite.jsx`. The filters
and authPermissions fields are not shown in the add-new flow — they're advanced settings accessible via
the Edit modal after the pattern is created.

---

## Page creation after pattern creation

When a page template card is selected, after the pattern ID is returned, create the initial page via
direct falcor call (we're outside the page pattern's context, so `newPage()` / `apiUpdate` aren't
available):

```js
const patternSlug = nameToSlug(name);
const pageType = `${patternSlug}|page`;
const tmpl = (theme.page_templates ?? []).find(t => t.id === selectedTemplateId);
const pageData = {
  title: name,  // or tmpl?.name if template name is more descriptive
  index: 0,
  published: 'draft',
  ...(tmpl?.draft_sections    !== undefined ? { draft_sections: tmpl.draft_sections }          : {}),
  ...(tmpl?.draft_section_groups !== undefined ? { draft_section_groups: tmpl.draft_section_groups } : {}),
};
await falcor.call(['dms', 'data', 'create'], [app, pageType, pageData]);
```

Read templates from `theme.page_templates` via `ThemeContext` so theme overrides are respected.

---

## Files to modify

| File | Change |
|---|---|
| `patterns/admin/components/patternList.jsx` | Replace the add-new modal contents with the card picker + confirmation area |
| `patterns/admin/pages/editSite.jsx` | Same replacement in its parallel add-new modal |
| `patterns/admin/components/patternList.theme.js` | Add theme keys for the card picker (`pickerCard`, `pickerCardSelected`, `pageTag`, `confirmArea`, etc.) |

Extracted into a shared `AddPatternPicker` component (new file) rather than keeping inline.

---

## Implementation steps

### Step 1 — Shared `AddPatternPicker` component — DONE

- [x] Created `patterns/admin/components/AddPatternPicker.jsx` — card grid + confirm area
- [x] Created `patterns/admin/components/AddPatternPicker.theme.js` — `patternPickerTheme` default keys
- [x] Registered `patternPicker: patternPickerTheme` in `patterns/admin/defaultTheme.js`
- [x] Name defaults: Datasets→"Data", Forms→"Forms", blank page→"Pages", other templates→template name
- [x] Base URL auto-derives from `nameToSlug(name)` until user manually edits it
- [x] Enter key submits from either input field

### Step 2 — `patternList.jsx` — DONE

- [x] Removed `newItem`/`setNewItem` state (no longer needed)
- [x] Added `templateId = null` param to `addNewValue`; after pattern creation, if `templateId` set,
  creates the initial page via `falcor.call(['dms','data','create'], [app, pageType, pageData])`
- [x] Replaced add-new modal contents with `<AddPatternPicker authExists={authExists} onAdd={...} />`

### Step 3 — `editSite.jsx` — DONE

- [x] Same `addNewValue` update with `templateId` + page creation
- [x] Same `AddPatternPicker` modal replacement
- [x] `newItem`/`setNewItem` in the file belong to `TenantList` (different component) — left alone

---

## Edge cases

- `authExists` guard: if auth pattern already exists, the Auth pattern type should NOT appear (existing
  logic, preserve it — auth was never in the user-facing options anyway since it's excluded if present)
- Name collision: existing check in `addNewValue` still fires before pattern creation
- Duplicate flow: goes through the Edit modal, not the add-new flow — no change needed
- `filters` and `authPermissions` remain editable in the Edit modal only

---

## Testing checklist

- [ ] Modal opens directly to the card grid — no dropdown visible
- [ ] Non-page cards (Datasets, Forms) have no `page` tag
- [ ] Page template cards all show the `page` tag
- [ ] Clicking a page template card → confirmation area shows `"[name] — page pattern"`, name pre-filled
- [ ] Clicking Datasets → confirmation shows `"Datasets pattern"`, name pre-filled to "Data"
- [ ] Name field changes → base URL auto-updates while URL hasn't been manually edited
- [ ] Add with "Article" selected → page pattern + one Article page created; navigating in shows the
  richtext section with placeholder text
- [ ] Add with "Blank" selected → page pattern + one blank page
- [ ] Add with "Datasets" selected → datasets pattern created, no page created
- [ ] Name collision guard still fires
- [ ] Edit modal (existing patterns) still works unchanged
- [ ] Duplicate flow still works unchanged
