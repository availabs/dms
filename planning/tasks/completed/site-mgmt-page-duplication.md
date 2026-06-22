# Site Management: Page Duplication

## Objective

A "Duplicate" button per row in the pages management view that clones a page (its metadata + all its sections) and opens the clone for editing. The most common CMS authoring shortcut — use an existing page as a template for a new one.

## Scope

- `duplicate_page` column type that renders a "Duplicate" button
- Server-side: clone the page row + all section rows (new IDs, title suffixed with " (copy)")
- After duplication: navigate to the new page in edit mode
- The clone is always a draft; published status is not copied

Out of scope:
- Recursive duplication (duplicating child pages too) — v1 duplicates one page only
- Cross-pattern duplication

## Current State

- `addItem` creates a blank new page; no clone-from-existing exists
- `apiUpdate` handles mutations via `dmsDataEditor`
- The server has a `createData` endpoint that accepts a full row payload
- Sections are separate rows in `data_items` with `type = '{pattern}|component'` and `data.parent` pointing to the page title

## Proposed Changes

### 1. Server route: `POST /dms-admin/:app/pages/:id/duplicate`

Or via Falcor `call`:

```js
// falcor call path
['dms', app, 'pages', id, 'duplicate']
// returns { id: newPageId }
```

Server logic:
1. Fetch the source page row by ID
2. Create a new page row: copy `data`, set `title = original + " (copy)"`, reset `published = false`, `has_changes = false`, generate new `url_slug`
3. Fetch all section rows where `data.parent === sourcePageTitle` (or page ID)
4. Create new section rows: copy each, update `data.parent` to the new page title
5. Return the new page's ID + url_slug

### 2. `duplicate_page` column type

```jsx
// columnTypes/duplicate_page.jsx
export const ViewComp = ({ row, apiUpdate, navigate }) => {
  const handleDuplicate = async () => {
    const result = await apiDuplicatePage(row.id); // new API call
    navigate(`/edit/${result.url_slug}`);
  };
  return <button onClick={handleDuplicate}>Duplicate</button>;
};
```

Renders a "Duplicate" button. On click:
1. Shows loading state
2. Calls the duplicate API
3. On success: navigates to the new page in edit mode
4. On error: shows inline error message

### 3. Register in pages management Spreadsheet

Add `duplicate_page` to `cmsPage.attributes` as a readOnly virtual column, so it appears in the column picker for any pages-sourced Spreadsheet.

```js
{ name: 'duplicate_page', display_name: 'Duplicate', type: 'text', readOnly: true }
```

The column renders the button; the value is unused.

### 4. UI placement

In the pages table, add to the row actions column alongside the edit pencil icon. Shows on hover.

## Files Requiring Changes

- `src/dms/packages/dms-server/src/routes/` — new `duplicatePage` route handler (or Falcor call path)
- `src/dms/packages/dms/src/api/` — new `apiDuplicatePage()` function
- New file: `src/dms/packages/dms/src/patterns/page/columnTypes/duplicate_page.jsx`
- `src/dms/packages/dms/src/patterns/page/columnTypes/index.jsx` — register
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/data/page.format.js` — add `duplicate_page` to `cmsPage.attributes`

## Testing Checklist

- [ ] "Duplicate" button appears in the pages management Spreadsheet
- [ ] Clicking "Duplicate" creates a new page row with title + " (copy)"
- [ ] New page has `published: false`, `has_changes: false`
- [ ] New page has a unique `url_slug` (no collision)
- [ ] All sections from the original are cloned under the new page
- [ ] After duplication, browser navigates to the new page in edit mode
- [ ] Original page is unchanged
- [ ] Duplicate of a page with no sections creates an empty page
