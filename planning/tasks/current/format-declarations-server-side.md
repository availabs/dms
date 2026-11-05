# Format declarations server-side: the `formats` table, filled at pattern registration

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

dms-server reads a row kind's auth rules, permission vocabulary and `childRefs` from the row that was
stamped with them at create time (`stampPatternRow` / `stampSiteRow` in `patterns/registry.js`), because
it cannot import the client package. A later change to a format never reaches an existing row, which is why
`emit-auth-vocabulary.mjs` + `stamp-auth-rules.js` exist ([auth-rules-stamp-backfill.md](./auth-rules-stamp-backfill.md)).

**Owner, 2026-11-05:** the declarations move to the server. Registering a pattern type puts the type's
declarations in the `formats` table (`dms.formats`, exists in both schemas, holds no rows today), and the
auth layer reads them from there. Rows stop carrying a copy; the manifest and the stamp script are deleted.

## What crosses, and what does not

A format object is not plain data: `page.format.js` imports React and a section component and carries
functions (`defaultSort`). What the server needs is the serializable subset the registry already derives at
`registerPatternTypes`:

| Key | Derived by | Read on the server by |
|---|---|---|
| `authVocabulary` (`self` / `descendants` lists with `fields`, `when`, `publicRead`) | `deriveAuthVocabulary.js` | `routes/auth/vocabulary.js`, `owners.js mapsFor` |
| `authRules` (per row kind) | `deriveAuthRules.js` | `owners.js ruleFor`, `judge.js` |
| `childRefs` | the type definition | `routes/dms/dms.controller.js childRefsForType`, `parentId.js` |
| `attributes` (key, type, `format`, `isArray`) | the format | nothing yet; stored so `dms.format` can serve it |

One row per **type**, not per app: `formats(app, type)` holds `app = <pattern type name>`, `type = <row kind>`
(`datasets+source`, `page+page`, `admin+site`). The same keys the client's `format: 'datasets+view'` attribute
references already.

## Design

### The route

`POST /dms/formats` (REST, beside the Falcor `dms.format` route) with `{ app, type, attributes, authVocabulary,
authRules, childRefs }[]`. Upsert on `(app, type)`. Gated: the caller holds site `*` on the app named by
`X-DMS-App`, or `${app} Admin`. An ordinary visitor's boot never writes. Idempotent: a payload equal to the stored
row is a no-op, so the client can send on every admin session without churn.

### The client

`registerPatternTypes` keeps deriving. A new `publishDeclarations(falcor | fetch)` sends every registered type's
subset. Called from the admin pattern's site config when an admin user loads the site (the same trust the
Pattern Editor's permissions tab already has), and from the dms CLI (`dms formats push`) for deploys without an
admin visit. `stampPatternRow` / `stampSiteRow` stop stamping `authRules`, `authVocabulary` and `childRefs`
once every server reads the table (keep them one release for old servers).

### The server

- `owners.js ruleFor(snap, row)`: the type of the nearest pattern ancestor (or `admin` for site-level kinds)
  → `formats` row → `authRules[row.kind]`. `mapsFor` likewise. Rows that still carry a stamp are read only when
  the table has no row for the type (one release), then ignored.
- `dms.controller.js childRefsForType`: same lookup.
- Cache per process with the same 30s TTL as the snapshot; the route clears it on write.
- `settings`-style read: `GET /dms/formats?app=` for the client's own use later (a build could skip bundling
  the derivation; not this task).

### Deletions when done

- `packages/dms/scripts/emit-auth-vocabulary.mjs`, `dms-server/src/scripts/stamp-auth-rules.js`.
- `routes/auth/rules.js` (the built-in copy), the `read` fill in `ruleFor`, `owners.js undeclaredPublicRead`
  — the three transitional pieces [auth-layer-simplification.md](./auth-layer-simplification.md) left.
- The fingerprint half of `authRules.sync.test.js` (a change to the rules no longer needs a backfill; the
  copy-sync half with `rules.js` goes with `rules.js`).
- `stampPatternRow` / `stampSiteRow` once no supported server reads the stamp.

## Phases

### Phase 1 — table and route — NOT STARTED
- [ ] Migration: `formats` gains `auth_vocabulary jsonb`, `auth_rules jsonb`, `child_refs jsonb` (both dialects,
      `migrate_dms_core`; drift fixture updated in the same commit).
- [ ] `POST /dms/formats` upsert, gated, idempotent; `GET /dms/formats`. Tests on the SQLite harness.

### Phase 2 — client publishes — NOT STARTED
- [ ] `patterns/registry.js publishDeclarations()`; called by the admin site config for admin users; `dms formats
      push` in the CLI. App-registered types (dms-template `src/patterns/`) included, since they register through
      the same function.

### Phase 3 — server reads the table — NOT STARTED
- [ ] `ruleFor` / `mapsFor` / `childRefsForType` read the table, stamp as fallback for one release.
- [ ] Run on every site (one admin visit or one CLI push each); verify with a dry-run diff script that every
      type's stored row equals the registry's derivation.

### Phase 4 — delete — NOT STARTED
- [ ] The deletions above; `auth-rules-stamp-backfill.md` closed as superseded.

## Open decisions

- **Who may push.** Site `*` or `${app} Admin` is the proposal. The alternative, a deploy-time secret, keeps
  rule changes out of any browser session but adds a credential to every deploy target.
- **Per-app override.** The table is keyed `(app, type)` with `app` = type name. A site that wants its own
  rules for a built-in type has no slot. Not needed today; if it ever is, a `site` column and a lookup order
  (site row → type row) is the extension.

## Progress

- 2026-11-05 (later): auth-grants-on-the-owner-row.md changed the rules (owners are ancestors only; the site
  domain holds the auth verbs; no type carries `publicRead`), so the fingerprint moved to `bce6ede7c2b64026`
  and the stamp backfill is triggered again. Nothing here changes: the route stores whatever the registry
  derives, and `siteCan(app, user, ['*'])` reads the site row directly now, which is the gate proposed below.
- 2026-11-05: filed after the owner chose this over re-stamping rows
  ([pgenv-mirror-into-dms.md](./pgenv-mirror-into-dms.md) is the companion task).
