# Deprecate and redesign the `dms.search` routes

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

Carries the exposure left open by
[row-auth-dms-reads.md](../completed/row-auth-dms-reads.md) (task 4 of
[server-side-auth-general.md](./server-side-auth-general.md)), so that closing task 4 does not
archive it.

## Objective

Replace the `dms.search` / `searchOne` family with a search the server can actually authorize, and
delete the current routes. The owner's decision on 2026-10-28 was that gating them in place is not
worth the effort because they are to be redesigned — this task is the other half of that decision.

## The exposure being accepted in the meantime

Four read routes have no authorization at all. With `DMS_ROW_AUTH_MODE=enforce`, page and component
*content* is gated, but these are not:

| route | controller | what crosses the wire |
|---|---|---|
| `dms.data[app+type].searchOne[key]` | `dataSearch` | `$ref` into the gated `byId`; residual is **existence + id** |
| `dms.sourceIdBySlug[app][slug]` | `lookupSourceIdBySlug` | an integer id, or `null` |
| `dms.search[app][type]` | `getTags` | DISTINCT tag strings over all components, or DISTINCT page **titles** |
| `dms.search[app][type][tag]` | `searchByTag` (`dms.controller.js:888`) | **`page_id`, `url_slug`, `page_title`, `section_id`, `section_title`, `tags`** |

So: **page ids, URL slugs, page titles, section titles and a pattern's tag vocabulary are readable
by anyone, for any pattern, regardless of its grants.** Only the body content is protected. The
three-key route is the real one — it runs a `LIKE` over section titles and tags and hands back ids
and slugs.

Anyone flipping an app to `enforce` and expecting a non-public pattern to be invisible needs to know
this first.

## What a redesign has to get right

1. **Authorization at the row, not the pattern.** The current shape can only ever be gated per
   pattern (the route is keyed by `app+type` the caller names). A pattern readable overall still
   exposes pages inside it with narrower grants — `byIndex` (`dms.route.js:306`) has that same gap
   today. A redesign should resolve contributing rows through the task-1/2 resolver and filter,
   which is the only thing that closes it.
2. **The tags cache must not become a leak.** `_tagsCache` is keyed `${key}:${searchType}` with **no
   user in the key**. Any gate belongs in the route, before the cache is consulted — never inside
   `getTags`, or one authorised caller warms a cache an unauthorised one reads. A per-user cache key
   is the alternative, at a cache-hit cost.
3. **A refused result answers, not errors** — `$atom([])` / `null`, per `readAuth.js` and the rest
   of the row-auth work.
4. **`getTags`' non-`tags` branch returns page titles**, so it is not the pure aggregate it looks
   like. Whatever replaces it should separate "vocabulary" from "row listing" rather than
   overloading one route with both.
5. **Two routes share one path shape.** `dms.search[app][type]` and `dms.search[app][type][tag]`
   run entirely different queries; splitting them is probably step one of any redesign.

## Call sites to find before deleting

Not yet surveyed. The client search UI and anything consuming `dms.search` / `searchOne` /
`sourceIdBySlug` must be enumerated before the routes go — `sourceIdBySlug` in particular looks like
routing infrastructure rather than search, and may need to stay (gated) rather than be replaced.

## Done when

The current routes are gone, their replacements resolve contributing rows through the row-auth
resolver, and a non-public pattern leaks neither ids nor titles to an anonymous caller.
