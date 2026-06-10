# Task: Page hierarchy columns

## Objective

Add 4 new column types that surface page tree information in a pages Spreadsheet:

| Column type | key in format | Shows |
|---|---|---|
| `page_is_root` | `is_root` | "Root" badge when no parent |
| `page_children` | `child_count` | total child-page count |
| `page_children_published` | `children_published` | published child count |
| `page_children_draft` | `children_draft` | draft child count |

Design reference: `src/themes/mny/design/pages/site-management.html` — Pages tab,
columns 4–7 in the pages table.

---

## Architecture

All four types are **client-side only** — zero server / SQL changes.

### `is_root`
`row.parent` is the resolved parent title (non-empty string) after the
`recurse_extract_data` serverFn join. Empty/null → root page.

### child count types
The Spreadsheet's `ComponentContext.state` carries the full loaded row
array in `state.data` (or `state.fullData` for fullDataLoad sections).
Each child row's `parent` field = the resolved title of its parent
(same join, same `keepOriginal: false`).

Matching: `allRows.filter(r => r.parent === row.title)` gives this
page's children. Then split by `published !== 'draft'`.

**Requirement**: the section must load all pages — turn off pagination
OR set `fullDataLoad: true` in the Card/Spreadsheet component config.
For a 40–50 page site this is fine; document it in the section's help text.

Published test matches `page_publish.jsx`:
```
isPublished = published !== 'draft' && published != null
```

---

## Files

### New
- `src/dms/packages/dms/src/ui/columnTypes/page_is_root.jsx`
- `src/dms/packages/dms/src/ui/columnTypes/page_children.jsx`

### Modified
- `src/dms/packages/dms/src/ui/columnTypes/index.jsx`
- `src/dms/packages/dms/src/patterns/page/page.format.js`

---

## Implementation

### 1. `page_is_root.jsx`

```jsx
import React from 'react';

export function PageIsRootView({ row }) {
    const hasParent = row?.parent && row.parent !== '';
    if (hasParent) return null;
    return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-mny-100 text-mny-700">
            Root
        </span>
    );
}

export function PageIsRootEdit(props) {
    return <PageIsRootView {...props} />;
}
```

If the site doesn't use mny Tailwind tokens, replace className with:
```jsx
style={{ display:'inline-flex', alignItems:'center', padding:'2px 9px',
         borderRadius:'9999px', fontSize:'11px', fontWeight:600,
         background:'#E0EBF0', color:'#37576B' }}
```

### 2. `page_children.jsx`

```jsx
import React, { useContext } from 'react';
import { ComponentContext } from '../../patterns/page/context';

// Internal helper — not exported, safe for Fast Refresh
function childrenOf(row, allRows) {
    if (!row?.title) return [];
    return allRows.filter(r => r.parent === row.title && r.id !== row.id);
}

function useChildCounts(row) {
    const { state } = useContext(ComponentContext) || {};
    const all = state?.fullData || state?.data || [];
    const children = childrenOf(row, all);
    const published = children.filter(r => r.published && r.published !== 'draft').length;
    return { total: children.length, published, draft: children.length - published };
}

export function PageChildrenView({ row }) {
    const { total } = useChildCounts(row);
    return total
        ? <span className="text-sm font-semibold text-gray-700">{total}</span>
        : <span className="text-gray-300 text-sm">—</span>;
}

export function PageChildrenPublishedView({ row }) {
    const { published, total } = useChildCounts(row);
    if (!total) return <span className="text-gray-300 text-sm">—</span>;
    return <span className="text-sm font-semibold text-green-600">{published}</span>;
}

export function PageChildrenDraftView({ row }) {
    const { draft, total } = useChildCounts(row);
    if (!total) return <span className="text-gray-300 text-sm">—</span>;
    return draft
        ? <span className="text-sm font-semibold text-amber-600">{draft}</span>
        : <span className="text-sm text-green-500">✓</span>;
}
```

Note: `useChildCounts` is a local function that calls `useContext`. It is
NOT exported — only the three named components are. This keeps the file
Fast-Refresh-clean per CLAUDE.md rules.

### 3. `columnTypes/index.jsx` additions

Import block (add near other page_* imports):
```js
import { PageIsRootEdit, PageIsRootView } from './page_is_root'
import { PageChildrenView, PageChildrenPublishedView, PageChildrenDraftView } from './page_children'
```

Const block:
```js
const page_is_root = { EditComp: PageIsRootEdit, ViewComp: PageIsRootView }
const page_children = { EditComp: PageChildrenView, ViewComp: PageChildrenView }
const page_children_published = { EditComp: PageChildrenPublishedView, ViewComp: PageChildrenPublishedView }
const page_children_draft = { EditComp: PageChildrenDraftView, ViewComp: PageChildrenDraftView }
```

In the `columnTypes` object:
```js
'page_is_root': page_is_root,
'page_children': page_children,
'page_children_published': page_children_published,
'page_children_draft': page_children_draft,
```

### 4. `page.format.js` — `cmsPageFormat.attributes` additions

After the `has_changes` attribute (near the end of the attributes array):

```js
{
    key: 'is_root',
    display_name: 'Root?',
    type: 'page_is_root',
    editable: false,
},
{
    key: 'child_count',
    display_name: 'Children',
    type: 'page_children',
    editable: false,
},
{
    key: 'children_published',
    display_name: 'Pub.',
    type: 'page_children_published',
    editable: false,
},
{
    key: 'children_draft',
    display_name: 'Draft',
    type: 'page_children_draft',
    editable: false,
},
```

**Intended use in pages Spreadsheet**: `is_root` and `child_count` columns.

**Intended use in site tree**: `children_published` and `children_draft` columns show pub/draft
child counts next to each tree node. The pages Spreadsheet does not show these — they live in
the Site Tree tab where the hierarchy context makes them meaningful.

---

## Testing checklist

- [ ] Root pages (no parent) show "Root" badge in `is_root` column
- [ ] Non-root pages show nothing in `is_root` column
- [ ] `child_count` shows correct total for pages with children
- [ ] `child_count` shows "—" for leaf pages
- [ ] `children_published` counts only published (non-draft) children
- [ ] `children_draft` counts only draft children; shows "✓" when 0/N
- [ ] All 4 columns render blank (not error) when section has < full page load
- [ ] In Spreadsheet with pagination off: counts match actual child rows
- [ ] In Spreadsheet with pagination on: counts only reflect loaded rows (expected limitation — note to author in help text)
- [ ] Column picker shows all 4 new types in the column type dropdown

---

## Known limitations / future work

- Child counts are computed from `state.data` (already loaded rows). With
  pagination enabled, counts only reflect the loaded page — authors should
  disable pagination when using these columns. A future improvement could
  use a separate full-data load or server-side aggregate column.
- Matching is by `row.title`. If two pages in the same pattern have
  identical titles, counts will be incorrect. Title uniqueness is not
  currently enforced by DMS.

---

## Status

- [ ] `page_is_root.jsx` created
- [ ] `page_children.jsx` created
- [ ] `columnTypes/index.jsx` updated
- [ ] `page.format.js` updated
- [ ] Tested in browser
