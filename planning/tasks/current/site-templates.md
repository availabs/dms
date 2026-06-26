# Site Templates

## Status: DONE

## Objective

When a user creates a new site, show a template picker. The selected template determines which patterns
(and their initial content) get created alongside the required auth pattern.

Prerequisite: **pattern-creation-flow** task should be done first, since site templates reuse the same
"create pattern + initial page" logic.

---

## Templates (stored in `defaultTheme.site_templates`)

Data lives in `src/dms/packages/dms/src/ui/siteTemplates.js`, imported into `defaultTheme.js`.

### 1. Blank
- Auth pattern only. Same as today. No additional patterns.

### 2. Simple Site
- Auth pattern
- Page pattern: name=`"Pages"`, base_url=`"pages"`
  - 1 page using the `blank` page template (title: `"Page 1"`)

### 3. Report
- Auth pattern
- Page pattern: name=`"Report"`, base_url=`"report"`
  - 1 page using the `narrative` page template (title: `"Report"`)

### 4. Dashboard
- Auth pattern
- Datasets pattern: name=`"Data"`, base_url=`"data"`
  - 1 dmsEnv: name=`"default"`
  - 1 source: name=`"dataset"`, source_type=`"internal_table"` under that dmsEnv
- Page pattern: name=`"Dashboard"`, base_url=`"dashboard"`
  - 1 page using the `dashboard` page template (title: `"Dashboard"`)

---

## Template data shape (`siteTemplates.js`)

Already written and imported into `defaultTheme.js`. Each template:

```js
{
  id: string,           // unique slug
  name: string,         // display name
  description: string,  // one-line subtitle shown in picker
  patterns: [           // auth is always added automatically, not listed here
    {
      pattern_type: string,  // 'page' | 'datasets' | ...
      name: string,          // human name
      base_url: string,      // url segment (no leading slash)
      // page patterns only:
      pages: [{ template: string, title: string }],
      // datasets patterns only:
      sources: [{ name: string, source_type: string }]
    }
  ]
}
```

---

## UX flow

Current `createSite.jsx` has: Site Name → Email → Password → Create button.

New flow:
1. User fills in Site Name, Email, Password (unchanged fields)
2. A template picker appears (4 cards: Blank, Simple Site, Report, Dashboard). Blank is pre-selected.
3. User clicks Create. The existing auth setup + site creation runs first, then the template's patterns
   are created sequentially.

The picker can be a simple inline grid of 4 cards matching the existing form's style. No modal needed.

---

## Pattern + page creation sequence

Auth creation is unchanged (steps 1–4 in `createSite.jsx` today). Template patterns are created after
that, using the same falcor primitives:

```js
// For each pattern in the template:
const patternSlug = nameToSlug(patternSpec.name);
const patternType = `${siteInstance}|${patternSlug}:pattern`;
const patternRes = await falcor.call(['dms', 'data', 'create'], [app, patternType, {
  pattern_type: patternSpec.pattern_type,
  name: patternSpec.name,
  base_url: patternSpec.base_url,
  authPermissions: JSON.stringify({ groups: { [`${PROJECT_NAME} Admin`]: ['*'], public: [] }, users: {} }),
}]);
const newPatternId = Object.keys(patternRes?.json?.dms?.data?.byId || {})
  .find(k => k !== '$__path');

// Add pattern ref to site
await falcor.call(['dms', 'data', 'edit'], [app, +siteResult.id, {
  patterns: [...existingPatternRefs, { ref: `${app}+${siteInstance}|pattern`, id: +newPatternId }]
}]);

// If page pattern: create initial page(s)
for (const pageSpec of patternSpec.pages || []) {
  const tmpl = siteTemplates.find(t => t.id === pageSpec.template) // wrong - this is page templates
  // read from theme.page_templates
  const pageType = `${patternSlug}|page`;
  await falcor.call(['dms', 'data', 'create'], [app, pageType, {
    title: pageSpec.title,
    index: 0,
    published: 'draft',
    draft_sections: tmpl?.draft_sections ?? [],
    draft_section_groups: tmpl?.draft_section_groups ?? [],
  }]);
}

// If datasets pattern: create dmsEnv + source(s)
if (patternSpec.pattern_type === 'datasets' && patternSpec.sources?.length) {
  const envType = `${siteInstance}|default:dmsenv`;
  await falcor.call(['dms', 'data', 'create'], [app, envType, { name: 'default' }]);
  for (const sourceSpec of patternSpec.sources) {
    const sourceSlug = nameToSlug(sourceSpec.name);
    const sourceType = `default|${sourceSlug}:source`;
    await falcor.call(['dms', 'data', 'create'], [app, sourceType, {
      name: sourceSpec.name,
      source_type: sourceSpec.source_type,
    }]);
  }
}
```

**Note on dmsEnv**: look at `patterns/datasets/` and `patterns/admin/` for the exact `dmsenv` data
shape before implementing. The above is approximate — verify the required fields match what the datasets
pattern expects.

---

## Files to modify / create

| File | Change |
|---|---|
| `patterns/admin/pages/createSite.jsx` | Add template state + picker UI; loop over template patterns after auth creation |
| `patterns/admin/pages/createSite.theme.js` | Add theme key for the template picker if needed |
| `ui/siteTemplates.js` | Already created — the 4 template definitions |
| `ui/defaultTheme.js` | Already updated — imports + registers `site_templates` |

---

## Implementation steps

### Step 1 — Template picker in `createSite.jsx`

- [ ] Read `theme.site_templates` from `ThemeContext`; fall back to `[]`
- [ ] Add `const [selectedTemplateId, setSelectedTemplateId] = React.useState('blank')` state
- [ ] Render a grid of 4 template cards below the password fields (name + description; selected = ring/highlight)
- [ ] Style through `createSiteTheme` / `theme.admin.createSite` — no inline Tailwind

### Step 2 — Pattern creation loop after auth

- [ ] Read `theme.page_templates` from `ThemeContext` for page template lookup
- [ ] After step 4 in `createSite` (auto-login), loop over the selected site template's `patterns`
- [ ] For each pattern: create pattern row → add ref to site → create pages (if page pattern) → create
  dmsEnv + sources (if datasets pattern)
- [ ] Keep running `existingPatternRefs` so each `edit` call accumulates (don't overwrite previous refs)

### Step 3 — dmsEnv creation detail

- [ ] Check `patterns/datasets/` for the exact dmsEnv + source data shape before implementing
- [ ] Verify a site created with the Dashboard template has a working source visible in the datasets pattern

---

## Testing checklist

- [ ] Blank template: site created with auth only — same behavior as before
- [ ] Simple Site template: auth + Pages pattern + 1 blank page created; navigating to /pages shows the page
- [ ] Report template: auth + Report pattern + 1 Narrative page created; Narrative sections visible
- [ ] Dashboard template: auth + Data pattern + dmsEnv + source + Dashboard pattern + 1 Dashboard page
- [ ] Dashboard: datasets pattern shows the source in its source list
- [ ] Dashboard: Dashboard page has the dashboard page template layout (header + two Card sections)
- [ ] No regression: existing sites unaffected
- [ ] Blank pre-selected on load; can switch templates before clicking Create
- [ ] `authPermissions` on each created pattern matches the auth pattern's permissions format
