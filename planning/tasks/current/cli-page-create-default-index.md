# CLI: `dms page create` defaults every page to `index '0'`

> **Status:** FILED 2026-09-23, **not started.** Workaround in place for the TransportNY QA builders
> (`src/themes/transportny/qa_skills/tools/lib/page_index.mjs`, passed as `--data {"index": …}`), which
> is why this is a library task and not an urgent one.

## Objective

A page created with `dms page create` and no explicit `index` should get the next free index among
its siblings, the same as a page created in the UI, instead of a hardcoded `'0'`.

## Current state

- `packages/dms/cli/src/commands/page.js:197` — `if (!data.index) data.index = '0';`
- The UI never produces a collision: `patterns/page/pages/edit/editFunctions.jsx` sets the index to
  the highest sibling index + 1 in `insertSubPage` (children of the parent), `duplicateItem`
  (top level) and `newPage`.
- So every script-built top-level page in a pattern lands on `'0'`. Measured 2026-09-23: all five
  `sitemgmt` pages (npmrdsv5) were `index '0'` with no parent.

## Why it matters (observed)

A bare pattern URL (`/sitemgmt/edit`) resolves "the root page" by `index`, so with five pages tied at
`'0'` it had no single answer. The owner saw the overview's draft content there, but the Publish
button read "No Changes" on a page whose row had `has_changes: true`. The only full page row the
browser fetched was a different page (the ticket page, clean), so the content and the edit pane came
from different pages (inferred from a network capture, not traced through the router).
`/sitemgmt/edit/overview` behaved correctly. Written up in `skills/traversing-dms-pages.md` §4.
The sitemgmt rows were re-indexed by hand the same day (0-4).

## Proposed change

- [ ] In `create`: when `data.index` is unset, list the pattern's pages (all of them — `page list`
      defaults to `limit 50`), take the siblings (same `parent`, or no parent), and use
      highest numeric index + 1; `0` when there are none. Keep the string form existing rows use.
- [ ] An explicit `index` (via `--data`) still wins, unchanged.
- [ ] BC: existing rows are untouched; only new creates without an index change.

## Related, not in scope

- The root-page resolution picking content and edit-pane item from different pages when indexes
  tie looks like its own inconsistency in the page router. Worth a separate look if ties remain
  possible after this fix (e.g. pages created before it).
- `page list`'s default `limit 50` also affects scripts that find-or-create a page by slug from a
  bare `page list`: on a pattern with more than 50 pages the lookup can miss an existing page and
  create a duplicate.

## Testing checklist

- [ ] `page create` with no index on an empty pattern → `'0'`.
- [ ] Second top-level create → `'1'`; a child create under a parent → highest child index + 1.
- [ ] `page create --data '{"index":"7"}'` → `'7'`.
- [ ] Pattern with more than 50 pages → the index accounts for all of them.
