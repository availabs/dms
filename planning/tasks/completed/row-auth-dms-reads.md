# Row auth 4: DMS reads onto the resolver — and the nine kinds nothing guards

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** built · **Release:** commit — on `permissions_move`, uncommitted · **Created by:** amuro@albany.edu · **Edited by:** —

Part of [server-side-auth-general.md](../current/server-side-auth-general.md) (hub). Depends on tasks 1–3.

## Objective

Move the DMS read gate onto the resolver, closing the gap that `permissions_move` did not touch:
**`judge()` is write-only**, and the read path still knows only two kinds.

## What is open today

`dataByIdResponse` (`dms.route.js:43`) branches on `kind === 'pattern'` and `kind === 'page'`.
Everything else is readable by anyone: **site, theme, tenant, dmsenv, source, view, component,
page-edit, and split `:data`** — several of which the write path guards. Four Falcor read routes have
no check at all: `dms.data[app].searchOne`, both `dms.search` routes, and (by omission)
`dms.sourceIdBySlug`.

## What changes

- Every read resolves the row and asks `can(read)`; refused rows keep today's shapes — the
  `no-access` stub for pattern rows (routing and branding only), the bare string for page rows.
- ~~The four unguarded search routes gain the same gate.~~ **Dropped by decision, 2026-10-28** —
  see "The id/tag enumeration decision" below.
- Under `DMS_READ_AUTH_MODE` (`legacy | log | enforce`, default `log`), matching the branch's
  existing rollout rather than inventing one.

## Watch for

A refused read must **answer**, not error — `readAuth.js` already establishes this for datasets ("a
refused read answers `null`, never an error, so a page degrades instead of breaking"). Follow it.

## Done when

All eleven kinds resolve through one path and `log` mode on a production copy produces an
explainable would-deny list. ~~the four search routes are gated~~ — struck 2026-10-28, see the
decision below.


## Progress (2026-10-27)

### Built

- **`src/routes/dms/rowAuthGate.js`** — `createGate({ controller, app, user, subdomain })` giving
  `judge(rows, verb)`, `judgeOne`, `judgeCreate`. The only place that knows what an *unstated* chain
  means, because that is policy rather than mechanism.
- **`DMS_ROW_AUTH_MODE`** = `legacy | log | enforce`, default **`log`**. Its own flag rather than
  reusing `DMS_READ_AUTH_MODE` (datasets reads) or `DMS_DATA_AUTH_MODE` (dms writes) — those gate
  separately-owned checks and flipping one must not silently flip this.
- **`src/routes/dms/legacyVerbs.js`** — the transitional vocabulary shim (see below).
- **Controller loaders** `authRowsByIds` / `authContainers`, selecting the resolver's projection via
  a memoised capability probe.
- **`tests/test-row-auth-gate.js` — 17 cases, all passing.** Full suite green (74 across three
  files); `npm test` unchanged.

### The finding that forced `legacyVerbs.js`

Judging a **migrated clone of `mitigat-ny-prod`** with no vocabulary mapping, 40 sampled pattern
rows, anonymous visitor:

| | reads allowed |
|---|---|
| no mapping | **28 / 40** — exactly the rows carrying *no grants at all* |
| with the legacy shim | **34 / 40** |

Without a mapping, reads were refused precisely where someone had **bothered to configure access** —
because real grants say `view-page`, `edit-page`, `view-pattern-list`, and none of those is a
structural verb. It fails closed, which is the safe direction, but it is not a usable state. This is
the hub's "`IMPLIES`, demoted to a compatibility shim" requirement, now measured rather than
predicted.

`legacyVerbs.js` is the only place in the server that names a pattern's verbs. It is data, in one
file, and is meant to be **deleted** once patterns declare `authVocabulary`
([row-auth-vocabulary.md](../current/row-auth-vocabulary.md)). It deliberately omits
`download-source`, `view-source-api`, `manage-downloads`, `view-as`, `auth-users`, `auth-groups` —
UI capabilities with no row behind them.

The 6 rows still refused are correct: two **admin** patterns, one **auth** pattern, and three content
patterns whose `public` grant is `[]`.

### ⚠ The one behaviour difference, before wiring

`dms.route.js` deliberately exempts **auth and admin pattern rows** from the read gate so a
logged-out visitor can load the login page and the client can build its routes. The resolver has no
such exemption and refuses them — correctly by the data, wrongly for the product.

**The wiring must preserve that exemption.** It is not a flaw in the resolver: it is a product rule
that belongs where the other product rules are, and under the hub's principle it should eventually be
a declared capability on those patterns rather than a name check.

### Wired (2026-10-27)

`dataByIdResponse` gained **one added branch** for every kind the existing gate does not handle.
`pattern` and `page` keep their exact existing logic — which is also how the **auth/admin exemption
is preserved for free**: those rows are `kind === 'pattern'`, so the new branch never sees them.

Guarded against its own failure: the branch runs only when `DMS_ROW_AUTH_MODE !== 'legacy'`, and any
error inside it is caught and falls back to today's behaviour. A resolver fault must not take the
read path down — and in `log`, the default, the verdict was never going to be used anyway.

A gate is cached per `(app, user, subdomain)` for the life of one response, so the resolver's
container map is loaded once rather than per row.

**`tests/test-row-auth-reads.js` — 7 cases, all passing**, end to end through the Falcor harness:

| | |
|---|---|
| a theme **with grants** under `enforce` | refused — `data: "no-access"` |
| …the same row for `${app} Admin` | the real row |
| an **unconfigured** theme under `enforce` | readable — rule 5 holds end to end |
| `legacy` | open, and silent |
| `log` | open, **and writes a `would-deny read` line** |
| an **auth** pattern under `enforce` | still public — the login page depends on it |
| an **admin** pattern under `enforce` | still public |

Full `npm test` green, and the other developer's `test-data-auth` still **49 passed**. The three pure
suites were added to `npm test`; the DB-backed one has its own `npm run test:row-auth-reads`, matching
how `test-data-auth` is handled.

### Correction: the "four unguarded search routes" are less exposed than this task claimed

Read properly, they do not return row content:

- **`dms.data[app].searchOne[key]`** returns a **`$ref`** to `["dms","data",app,"byId",id]`. Falcor
  then follows that ref — through `dataByIdResponse`, which is now gated.
- **`dms.search[app][types]`** and **`[types][tags]`** return **tags**, from `controller.getTags` —
  an aggregate, not rows.

So the residual exposure is **id and tag enumeration**, not content. That is real but much smaller
than "unguarded reads", and fixing it properly means deciding what a tag aggregated from rows the
caller cannot read should do — filter the contributing rows, or leave aggregates ungated. **Left as
its own decision** rather than guessed at. The same `$ref` reasoning applies to the `byIndex` and
`opts.byIndex` routes, which return refs and already filter pages.

### Correction to that correction (2026-10-28)

The note above is right about **two** of the routes and wrong about the third. Re-read against the
controller:

| route | controller | what crosses the wire |
|---|---|---|
| `dms.data[app+type].searchOne[key]` | `dataSearch` — `SELECT id … LIMIT 1` | a `$ref` into the now-gated `byId`; residual is **existence + id** |
| `dms.sourceIdBySlug[app][slug]` | `lookupSourceIdBySlug` | an integer id, or `null` |
| `dms.search[app][type]` | `getTags` | `tags`: DISTINCT tag strings over every component. Otherwise DISTINCT page **titles** |
| `dms.search[app][type][tag]` | `searchByTag` (`dms.controller.js:888`) | **`page_id`, `url_slug`, `page_title`, `section_id`, `section_title`, `tags`** |

The three-key `dms.search` route runs a *different query* from the two-key one — it joins pages to
their sections and returns **row ids plus title and slug text**. That is content, not an aggregate,
so "leave aggregates ungated" never disposed of it. A logged-out visitor can `LIKE`-search section
titles and tags across a pattern they cannot read and get back page ids, URLs and titles.

### The id/tag enumeration decision — **leave it open** (owner, 2026-10-28)

All four routes are keyed by an `app+type` the **caller names**, so the pattern is known before any
row loads and a pattern-level check would cost one memoised `getPatternAuthPermissions` — exactly
what `byIndex` already does at `dms.route.js:306`. Three options were put to the owner:

| | |
|---|---|
| **1. Leave open, documented** | **chosen** |
| 2. Pattern-level gate on all four, matching `byIndex` | closes the content-bearing route for one cached lookup |
| 3. Per-row filtering | the only one that closes *within* a readable pattern; thousands of rows per `searchByTag`, and meaningless for a DISTINCT tag list |

**Rationale (owner): this search is to be deprecated and redesigned, so it is not worth gating.**
Tracked as [deprecate-dms-search-routes.md](../current/deprecate-dms-search-routes.md), which carries the
exposure so it is not archived along with this task.

**What that means in the meantime, stated plainly:** with `DMS_ROW_AUTH_MODE=enforce`, page and
component *content* is gated, but **page ids, URL slugs, page titles, section titles and the tag
vocabulary of a non-public pattern remain readable by anyone**, through
`dms.search[app][type][tag]`. Anyone turning on `enforce` and expecting a pattern to be invisible
should know this is the hole.

Two notes for whoever does gate or replace these:

- The tags cache (`_tagsCache`) is keyed `${key}:${searchType}` with **no user in the key**. A gate
  must sit in the route, before the cache is consulted — never inside `getTags`, or one authorised
  caller warms a cache an unauthorised one reads.
- `getTags`' non-`tags` branch returns page **titles**, so it is mildly content-bearing too and is
  not the pure aggregate the earlier note called it.

Also noted, because option 2 would not have fixed it either: a pattern readable overall still
exposes the ids and titles of pages inside it whose own grants are narrower. `byIndex` has that same
gap today. Only option 3 closes it.

### Remaining

- `enforce` is not safe for any app until [row-auth-vocabulary.md](../current/row-auth-vocabulary.md) lands —
  `legacyVerbs.js` covers today's vocabulary, but a pattern with verbs outside it confers nothing.
  That is task 3's gate, not this task's; it is why this closes as **built** rather than **done**.
