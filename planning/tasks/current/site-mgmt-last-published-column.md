# Site Management: Last Published Column

## Objective

A `last_published` column in the pages management Spreadsheet showing when a page was last published and by whom. Gives authors context on how stale a draft is or when a live page was last pushed.

## Scope

- `last_published_at` virtual column on pages: timestamp of the most recent publish action
- `last_published_by` virtual column on pages: username who last published
- Formatted as relative time ("3 days ago") with full date on hover
- Available in any pages-sourced Spreadsheet as regular columns

Out of scope:
- Full publish history timeline (that's a separate history pane)
- Section-level last-published

## Current State

- DMS pages have consolidated history at `data.history.entries[]` (each entry: `{ action, timestamp, user, ... }`)
- Publish action in history entries uses `action = 'publish'` (verify the exact action name in the codebase)
- `updated_at` exists but reflects any change, not just publish events
- No `last_published_at` is surfaced as a queryable column

## Proposed Changes

### Option A — SQL expression column (recommended)

Add to `cmsPage.attributes` as a virtual SQL column:

```js
{
  name: 'last_published_at',
  display_name: 'Last published',
  type: 'timestamp',
  readOnly: true,
  sqlExpression: `(
    SELECT (entry->>'timestamp')::timestamptz
    FROM jsonb_array_elements(data->'history'->'entries') AS entry
    WHERE entry->>'action' = 'publish'
    ORDER BY (entry->>'timestamp')::timestamptz DESC
    LIMIT 1
  )`
},
{
  name: 'last_published_by',
  display_name: 'Published by',
  type: 'text',
  readOnly: true,
  sqlExpression: `(
    SELECT entry->>'user'
    FROM jsonb_array_elements(data->'history'->'entries') AS entry
    WHERE entry->>'action' = 'publish'
    ORDER BY (entry->>'timestamp')::timestamptz DESC
    LIMIT 1
  )`
}
```

This returns `NULL` for pages that have never been published — which is correct and filterable.

**Prerequisite:** Verify the exact JSON path for history entries. Check `page.format.js` or a real page row via `dms raw get <id>` to confirm `data.history.entries[].action` is the correct path.

### Option B — Client-side derived column

If `data.history` is not returned in the standard UDA query (because it's nested JSONB), derive in the column type by reading `row.data?.history?.entries`:

```jsx
// columnTypes/last_published.jsx
const lastPublishEntry = row?.data?.history?.entries
  ?.filter(e => e.action === 'publish')
  ?.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
```

This only works if the full `data` blob is in the row. UDA queries typically select specific columns, not `data.*`, so Option A is preferred.

### `last_published` column type

A small display component:
- If `last_published_at` is null: renders "Never published" in muted text
- If `last_published_at` is set: renders relative time ("3 days ago") with `title` tooltip showing full ISO date and `last_published_by`

```jsx
const RelativeTime = ({ ts, by }) => {
  if (!ts) return <span className="text-mny-400 text-xs italic">Never</span>;
  return (
    <span title={`${new Date(ts).toLocaleString()} by ${by}`} className="text-xs text-mny-700">
      {formatRelative(ts)} <span className="text-mny-400">by {by}</span>
    </span>
  );
};
```

## Files Requiring Changes

- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/data/page.format.js` — add `last_published_at` and `last_published_by` to `cmsPage.attributes`
- New file: `src/dms/packages/dms/src/patterns/page/columnTypes/last_published.jsx`
- `src/dms/packages/dms/src/patterns/page/columnTypes/index.jsx` — register `last_published`

## Testing Checklist

- [ ] `last_published_at` column returns correct timestamp for a page that has been published
- [ ] `last_published_at` returns NULL for a page in draft that was never published
- [ ] `last_published_by` returns the correct username
- [ ] Column sorts correctly by timestamp (not as string)
- [ ] Display shows relative time ("3 days ago") with full date on hover
- [ ] "Never" state renders correctly for unpublished pages
- [ ] Column works in both Card and Spreadsheet sections
