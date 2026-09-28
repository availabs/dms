# CLI: `dms page create` defaults every page to `index '0'`

**Initiatives:** [dms_cli_agent_tooling](../../../../../planning/initiatives/dms_cli_agent_tooling.md) · **Status:** next (was: "FILED 2026-09-23, not started. Workaround in place for the TransportNY QA builders") · **Created by:** rdubowsky@albany.edu · **Edited by:** —

> **Status:** FILED 2026-09-23, **not started.** Workaround in place for the TransportNY QA builders
> (`src/themes/transportny/qa_skills/tools/lib/page_index.mjs`, passed as `--data {"index": …}`), which
> is why this is a library task and not an urgent one.
> **2026-09-24:** a second pattern hit it — all 10 tsmo2 pages were `index '0'` (created before the
> builder workaround); re-indexed by hand. The router inconsistency that turns a tie into a broken page
> is now its own task: [`page-root-resolution-index-tie.md`](./page-root-resolution-index-tie.md).

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
  tie is its own inconsistency in the page router. Worth a separate look if ties remain
  possible after this fix (e.g. pages created before it). **Traced 2026-09-24** (second occurrence,
  tsmo2 `/tsmo`: all 10 top-level pages were `index '0'`, year selector dead at the bare URL only): the
  server's `searchOne` (`dms-server/src/routes/dms/dms.controller.js`, `url_slug=''` UNION ALL
  `defaultSearch`, `LIMIT 1`, no `ORDER BY`) returned Incident View 2182470 for the view route's
  full-attribute fetch, while `dms-manager/wrapper.jsx:34` picked Home 1431215 via `defaultSort` and
  rendered it from the list route's slim attributes (sections, no `filters`). Candidate BC fix: make
  both sides deterministic and identical (e.g. `ORDER BY id` in the defaultSearch arm, and the same
  tiebreak in `defaultSort`), or have the wrapper prefer the row the view fetch returned. Full write-up:
  `skills/traversing-dms-pages.md` (bare pattern URL bullet).
- `page list`'s default `limit 50` also affects scripts that find-or-create a page by slug from a
  bare `page list`: on a pattern with more than 50 pages the lookup can miss an existing page and
  create a duplicate.

## Testing checklist

- [ ] `page create` with no index on an empty pattern → `'0'`.
- [ ] Second top-level create → `'1'`; a child create under a parent → highest child index + 1.
- [ ] `page create --data '{"index":"7"}'` → `'7'`.
- [ ] Pattern with more than 50 pages → the index accounts for all of them.
