# Marking a source's authoritative view

**When to use:** a source has several views (versions, vintages, rebuilds) and pages should bind a
specific one, but the data can't say which. Newest isn't always right: a newer view can be a
subset, a test build, or a method change that hasn't been checked. Record the human choice on the
source, with the reason, so pickers, pages and scripts can read it.

Task: [`planning/tasks/current/datasets-authoritative-views.md`](../planning/tasks/current/datasets-authoritative-views.md).

## The record

Stored on the source at `metadata.authority` (DMS internal sources: `data.metadata.authority`).

```jsonc
// most sources: ONE authoritative view, no key
{ "views": [ { "view_id": 1646, "note": "v2 is a 63% subset; keep this", "set_by": "a@b.org", "set_at": "2026-10-02T14:03:00Z" } ] }

// parallel products: one authoritative view per key value
{ "views": [ { "key": { "year": "2024" }, "view_id": 2268, "note": "…", "set_by": "…", "set_at": "…" },
             { "key": { "year": "2023" }, "view_id": 1958, "note": "…", "set_by": "…", "set_at": "…" } ] }
```

Rules (enforced by the server):
- **Unmarked means undecided.** A source with no record never falls back to "newest".
- A source has either **one unkeyed entry**, or **keyed entries that all share the same key
  names**. The two never mix.
- **At most one entry per key value.** Marking a view for a key that already has one replaces it.
- **Key names are snake_case and free-form.** Suggestions: `year`, `region`, `level`, `vintage`,
  `variant`, `return_period`.
- **The view must belong to the source.** For DaMa it must also name a table that exists.
- **A note is required.** `set_by` and `set_at` are stamped by the server.
- **Choices between sources are out of scope.** "Use IHP v2 instead of IHP v1" is recorded by which
  source a project tags as used, not here.

## As an author

- **To mark a view:** open the source in the datasets pattern and go to the Overview's
  **Versions** card. Choose **Mark authoritative…** on the view, write why, and save. For
  parallel products, tick "one authoritative view per key" and fill in the key (e.g.
  `year` = `2024`).
- **How it shows:**
  - The row gets an **authoritative** badge.
  - A source with nothing marked shows an **undecided** chip.
  - The source's pages open on the authoritative view by default.
- **Section and map pickers:** authoritative views sort first with a `★` (or `★ year 2024`).
  Choosing a source that has exactly one authoritative view preselects it.
- **Who can mark:** requires `update-source` on the source.

## From code

- **Read:**
  - Falcor: `uda[env].sources.byId[id].authority`, a derived, read-only attribute.
  - Client helpers: `patterns/datasets/utils/authority.js` (`readAuthority`, `isAuthoritative`,
    `authorityState`, `singleAuthoritativeViewId`, `sortAuthoritativeFirst`, `keyLabel`).
- **Write:** only through the calls, never by editing `metadata`:
  - `falcor.call(['uda','sources','setAuthoritativeView'], [env, sourceId, {view_id, key?, note}])`
  - `falcor.call(['uda','sources','clearAuthoritativeView'], [env, sourceId, {key?}])`
  - In the client, use `api/index.js` `udaSetAuthoritativeView` / `udaClearAuthoritativeView`.
- **Scripts reading the DB directly:**
  - DaMa: `SELECT source_id, metadata->'authority' FROM data_manager.sources`.
  - DMS: read `data->'metadata'`. It may be an object or JSON text, so parse it (see
    `parseJsonish` in either `authority.js`).

## Gotchas

- **Fetch `authority` in its own request,** not in a shared attribute list. A dms-server that
  predates it treats `authority` as a DaMa column, the SQL fails, and Falcor caches the error for
  the whole request. `getSourceAuthority` and `getSourceAuthorities` do this and resolve null on
  failure.
- **Don't put `authority` on the dataWrapper's source objects.** Those get merged into the
  section's persisted `externalSource`, and the record would be saved into every section config
  and go stale. `useDataSource` keeps it in a separate map.
- **A source object also has a `views` array** (its list of versions). Code that accepts "a source
  or an authority record" must tell them apart by the source's other fields (`readAuthority`
  does), or every version reads as authoritative.
- **Generic metadata saves preserve the record.** The datasets metadata editor saves the whole
  `metadata` blob; the server keeps the stored `authority` and ignores any incoming one.
