# Page pattern: bare-URL root page resolves inconsistently when top-level indexes tie

**Initiatives:** [dms_page_editor_admin](../../../../../planning/initiatives/dms_page_editor_admin.md) · **Status:** next (was: "FILED 2026-09-24, not started (owner: no core change for now, fix the data instead)") · **Created by:** rdubowsky@albany.edu · **Edited by:** —

> **Status:** FILED 2026-09-24, **not started** (owner: no core change for now, fix the data instead).
> Data workaround in place: tsmo2 re-indexed 2026-09-24, sitemgmt 2026-09-23, and `cr_sync.mjs` now
> warns `⚠ INDEX TIE <pattern>` for tracked TransportNY patterns. Sibling task, which removes the most
> common SOURCE of ties: [`cli-page-create-default-index.md`](./cli-page-create-default-index.md).

## Objective

A bare pattern URL (`/<pattern>`, `/<pattern>/edit`) should render ONE page consistently, with its
full attribute set, even if several top-level pages share `index '0'`. Today the page is picked twice,
by two different rules, and the rendered page can be missing every attribute only the view fetch carries.

## Current state (traced 2026-09-24)

The page pattern route (`patterns/page/siteConfig.jsx`) is a parent `list` config (all pages, slim
attributes: title, index, url_slug, parent, sections, section_groups… — **no `filters`, `theme`,
`sidebar`**) with `view`/`edit` children that fetch ONE page with the full attribute set.

1. **Server** — the child's fetch resolves the page with `searchOne`
   (`dms-server/src/routes/dms/dms.controller.js`): `url_slug = $3` UNION ALL the format's
   `defaultSearch` (`patterns/page/page.format.js`: `index = '0'` AND no parent AND no template_id),
   `LIMIT 1`, **no `ORDER BY`** — so with a tie Postgres returns whichever tied row comes first
   physically.
2. **Client** — `dms-manager/wrapper.jsx:34` independently picks
   `defaultSort(data).filter(filterParams)[0]`; for an empty slug `filterParams`
   (`dms-manager/_utils.jsx`) matches every `!parent && index == 0` row, and `defaultSort` has no
   tiebreak past `index`. (Its `useEffect` re-pick uses `data.filter(...)[0]` with NO sort — a third
   possible answer.)

When the two disagree, the client renders its pick from the list route's slim row: sections render (it
looks right), but view-only attributes are absent.

Observed:
- **tsmo2 `/tsmo`, 2026-09-24** — all 10 top-level pages at `index '0'`. `searchOne` returned Incident
  View (2182470); the client rendered Home (1431215, per the view's `/track/visit` POST). Home's
  `filters` (`[{searchKey:"year", useSearchParams:true}]`) never loaded, so the year chip changed
  nothing, while `/tsmo/home` worked.
- **sitemgmt `/sitemgmt/edit`, 2026-09-23** — overview content, but the Publish button read "No Changes":
  the full row fetched was the ticket page.

Write-up: `skills/traversing-dms-pages.md` (bare pattern URL bullet).

## Proposed change (BC)

- [ ] Make both sides pick the same row deterministically, e.g.:
  - server: `ORDER BY` in the `defaultSearch` arm (after the slug arm, so an exact slug still wins) —
    lowest `id`, or the same tiebreak the client uses;
  - client: give `defaultSort` the same tiebreak, and use the same sorted pick in the wrapper's
    `useEffect` as in its initial state;
  - or have the wrapper prefer the row the view/edit fetch returned for an empty slug.
- [ ] No change in behavior when exactly one top-level page has `index '0'` (the normal case).

## Files requiring changes

- `packages/dms-server/src/routes/dms/dms.controller.js` — `searchOne`
- `packages/dms/src/dms-manager/wrapper.jsx` — initial pick vs `useEffect` pick
- `packages/dms/src/patterns/page/page.format.js` — `defaultSort` tiebreak
- (check) `packages/dms/src/api/preloadSectionData.js:220` and `api/index.js` `needsRefResolution` —
  both also take "first `index == 0`" and should agree with whatever rule is chosen

## Testing checklist

- [ ] Pattern with two top-level pages at `index '0'`: bare URL renders the same page on the server
      pick and the client pick; that page's `filters` register (URL gains its `?param=`).
- [ ] Bare `/edit` on the same pattern: Publish state matches the rendered page.
- [ ] Single index-0 page: unchanged.
- [ ] A page whose `url_slug` is literally `''` still wins over `defaultSearch` (the slug arm stays first).
