# Datasets source rules: table rules an author attaches and the server installs (auto-number, point from lat/lon)

**Initiatives:** [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) (primary), [lb_landbank_site](../../../../../planning/initiatives/lb_landbank_site.md) · **Status:** built · **Release:** deploy — commit the library + dms-server deploy + dms-template deploy (Rules page); owner call on gating setIndex/setPrimaryKey · **Created by:** amuro@albany.edu · **Edited by:** —

**Project:** DMS library · **Topic:** datasets pattern / dms-server (DAMA external sources) · **Started:** 2026-10-16

## Objective

Let an author keep a DAMA source's table correct without a DBA. The author picks a **rule** from a list
on the source's new **Rules** page, maps it to columns and applies it. The server then installs it as a
Postgres trigger or column default on every table behind the source. The first two rules are:

- **Auto-number new rows.** Gives the primary key an identity default, so "add a row" works on
  sources whose PK has none. This fixes G12 (Add parcel fails: no ID default) on Land Bank source 3,
  and every GIS upload has the same defect (see Current state).
- **Point from lat/lon.** Rebuilds the geometry column from two number columns on every insert and
  every latitude/longitude change, so a property added or corrected in a form shows on the maps.

Rule *types* are code: core ships the two above, and apps can register more through the existing
data-type plugin bootstrap (`registerDatatype(name, { rules })`). Authors only **attach** registered
rules; they never write SQL.

**Decision record (owner, 2026-10-16).** Three designs were compared in conversation:
1. **Registered write hooks** (JavaScript run in `createExternalRow`/`updateExternalRow`). Rejected
   as quick and dirty: it covers only writes that go through DMS, and it can't fix G12, because an
   auto-number has to be a column default.
2. **2a. Free-form trigger SQL typed into the source editor.** Rejected: trigger code runs with the
   table owner's rights, and dms-server connects to `landbank_dama` as `postgres`, so anyone with
   source-edit rights could run anything.
3. **2b. A list of rule templates the server installs. Chosen.** It follows the existing
   Primary key / Index settings, which already run DDL from the source editor.

## Scope

**In scope**
- Server: the rule registry, the two core rules, install/uninstall/backfill/status, falcor routes
  gated on `update-source`, protecting `metadata.rules` from generic metadata writes, re-applying
  rules to new versions, and `registerDatatype({ rules })`.
- `gis-publish.js`: create `ogc_fid` as an identity column, so new GIS uploads don't need the rule.
- Datasets UI: a **Rules** page on DAMA sources (attached rules + status, Add rule picker, a parameter
  form built from each rule's param spec, Apply to existing rows, Remove), plus an Auto-number
  shortcut beside the Primary key switch on the Metadata page.
- Docs: the rule contract in `data-types/CLAUDE.md` and `dms-server/src/dama/CLAUDE.md`.
- Land Bank rollout on source 3 (Phase 7). It needs a deploy and owner sign-off.

**Out of scope** (see Related)
- The tile route's one-hour browser cache (`tiles.rest.js:335`), which hides new pins.
- A Map-section `data_refresh` hook.
- Showing save errors in the Card form.
- Internal (DMS split-table) sources. Rules are DAMA/Postgres only, the same as external row writes.
- Polygon geometry, geocoding, and a rule builder that lets authors define new rule types without
  code. Those are later and separate.

## Current state (verified 2026-10-16)

**Live table: Land Bank source 3** (`landbank_dama` · view 3 ·
`gis_datasets.s3_v3_landbank_properties`). Checked with read-only queries.
- `wkb_geometry` is declared **`geometry(MULTIPOINT, 4326)`**, so a plain `ST_MakePoint(...)`
  would be rejected (`Geometry type (Point) does not match column type (MultiPoint)`). The point
  rule must read the declared type and wrap the point in `ST_Multi`.
  - The SQL in `aclb-marketplace-roadmap.html` W2-A (database trigger) is wrong for this column.
- It has 1,314 rows: 1,232 with geometry and 1,233 with lat/lon. On every row that has both,
  geometry matches `latitude`/`longitude` within 5 m. `geocodio_latitude`/`_longitude` differ on
  76 rows, so **`latitude`/`longitude` is the source** the point rule should use.
- The one row with lat/lon but no geometry is `ogc_fid` 1314: no name, address or status,
  lat 127.99 / lon −221.45. It looks like a spreadsheet import leftover, and because its status is
  blank it's probably counted in the "held" figure (199).
- Every other row is inside lat 42.4–42.9 / lon −74.3 to −73.6.
- The table has no triggers. `ogc_fid` is `integer NOT NULL` with **no default and no identity**
  (G12, Add parcel fails: no ID default). Values run 1–1314.
- Indexes: `s3_v3_landbank_properties_pkey` (btree on ogc_fid) and `…_gix` (GiST on wkb_geometry).
- Source metadata keys are just `columns` and `isEditable`. `latitude`/`longitude` are
  `DOUBLE PRECISION` columns in the metadata; `wkb_geometry` and `ogc_fid` aren't listed.
- PostgreSQL 16.2 with PostGIS 3.4.2. The table owner is `postgres`, the role dms-server connects as.

**Code**
- **External row writes:** `dms-server/src/routes/uda/uda.controller.js`.
  - `resolveEditableTable` (:1134) re-checks `metadata.isEditable` and the real PK on every write.
  - `buildRowPayload` (:1195) only writes columns listed in `metadata.columns`, so `wkb_geometry`
    can't be written from the client.
  - `createExternalRow` (:1205) and `updateExternalRow` (:1227) run one plain statement each.
  - Routes `uda.data.create/edit/delete` (`uda.route.js:720+`) check only `this.user`.
- **Precedent for source settings that run DDL:**
  - `setPrimaryKeyColumn` (:1014) checks every table behind the source first, then runs
    `ALTER TABLE … ADD CONSTRAINT … PRIMARY KEY` on each, and records `isPrimaryKey` in the metadata.
  - `setIndexColumn` (:892) does the same with `CREATE INDEX`.
  - UI: `datasets/pages/dataTypes/gis_dataset/pages/metadata.jsx:56-64`. The server validation
    message is shown in `MetadataComp`'s `pkeyError` banner.
- **⚠ `uda.sources.setIndex` (`uda.route.js:549`) and `uda.sources.setPrimaryKey` (:572) have no
  auth check at all**, not even `this.user`, although both run DDL. The gate to copy is
  `uda.sources.setAuthoritativeView` (:596): `this.user` plus
  `isUserAuthedForSource({ reqPermissions: ['update-source'] })`.
- **Server-owned metadata keys:** `updateSource` (:410) keeps `metadata.authority` whenever a
  generic write replaces the metadata blob, using a compare-and-swap through
  `mutateSourceMetadata` (:336). `metadata.rules` needs the same protection, because the Metadata
  page saves the whole blob.
- **Transactions:** `db.withTransaction(fn)` (`db/adapters/postgres.js:185`) runs `fn(tx)` on one
  dedicated connection. It comes from `dms-server-real-transactions.md` (Real DB transactions), which
  is **built and waiting on a dms-server deploy**, so this task ships in that deploy or a later one.
- **G12's root cause:** `dama/upload/workers/gis-publish.js:310` creates
  `ogc_fid INTEGER PRIMARY KEY` with no default, so **every GIS upload marked editable fails on
  Add**. `csv-publish.js:124` uses `BIGSERIAL PRIMARY KEY`, which is fine.
  - The geometry column is created as `geometry(<detected type>, 4326)` (:307).
  - Rows are copied with explicit `ogc_fid` values from the temp table's fid (:374), or with
    `NULL::INTEGER` when there's no fid column.
- **New versions get a new table.** `createDamaView` (`dama/upload/metadata.js:211`) is called by
  `gis-publish.js:141` and `csv-publish.js:29`. Neither re-applies source-level settings: the PK
  flag and indexes aren't re-applied today either.
- **Registration:**
  - `registerDatatype` (`dama/datatypes/index.js`) takes `workers`, `routes` and `schedulables`.
    dms-template loads it from `data-types/register-datatypes.js` through `DMS_EXTRA_DATATYPES`.
  - Schedulables are the closest model: a registered spec with a `params` list, served by
    `GET /dama-admin/:pgEnv/schedulables` (`dama/tasks/schedule-routes.js:37`) and rendered as a
    form by `datasets/pages/dataTypes/schedule/SchedulePage.jsx:50-90`.
- **Datasets pages:**
  - `defaultPages.js` registers shared source pages. The Schedule page is DAMA-only through
    `cdn: ({ isDms }) => !isDms`.
  - `gis_dataset/index.js` lists its pages explicitly (table, metadata, map, sourceCreate).
- **Tests:** `dms-server/tests/` (`test-uda.js`, `test-transactions-pg.js`, …). The Postgres
  harness `tests/postgres-docker.js` uses `postgres:17-alpine`, which has **no PostGIS**.

## Design

### Data model: `data_manager.sources.metadata.rules`

```jsonc
"rules": [
  { "id": "auto_number", "key": "auto_number:ogc_fid",
    "params": { "column": "ogc_fid" },
    "addedBy": "amuro@albany.edu", "addedAt": "2026-10-20T14:02:00Z" },
  { "id": "point_from_lat_lon", "key": "point_from_lat_lon:wkb_geometry",
    "params": { "lat": "latitude", "lon": "longitude", "geom": "wkb_geometry",
                "bounds": [-74.3, 42.4, -73.6, 42.9] },
    "addedBy": "…", "addedAt": "…" }
]
```

- `key` comes from `spec.key(params)`, giving one instance per target column. Adding a rule whose
  key already exists replaces that instance.
- **Only the rule routes write `metadata.rules`.** `updateSource` must keep the stored value and
  ignore any incoming one, the same way it treats `authority` today.

### Rule spec (the registered contract)

```js
// dms-server/src/dama/rules/index.js — registerRule(id, spec), getRules(), getRule(id)
{
  label: 'Point from lat/lon',
  description: 'Builds the geometry from two number columns on every insert and every lat/lon change.',
  // Is the rule offered for this source/table? info = introspection below.
  appliesTo(info) { return info.geometryColumns.length > 0 },
  params: [
    { name: 'lat',    type: 'column', columnTypes: ['number'], label: 'Latitude column' },
    { name: 'lon',    type: 'column', columnTypes: ['number'], label: 'Longitude column' },
    { name: 'geom',   type: 'geometry_column', label: 'Geometry column', default: 'wkb_geometry' },
    { name: 'bounds', type: 'bbox', optional: true, label: 'Reject coordinates outside' },
  ],
  key: (p) => `point_from_lat_lon:${p.geom}`,
  // Throw an Error with a plain-language message. Runs for EVERY table before ANY DDL.
  validate({ info, params }) {},
  // → array of SQL strings. Identifiers are already validated and quoted; numbers checked finite.
  install({ table, info, params, names }) {},
  uninstall({ table, info, params, names }) {},
  // → { sql, values } that brings existing rows into line, or null. Must never raise row-by-row.
  backfill({ table, info, params }) {},
  // → 'installed' | 'missing' | 'present-unmanaged', read from the catalog (pg_trigger,
  //   information_schema), never from metadata.
  status({ tx, table, info, params, names }) {},
}
```

- **`info` comes from one introspection per table:** `information_schema.columns` (name, udt,
  nullability, default, identity) plus `geometry_columns` (column, type, srid) plus the detected PK
  (`detectRealPrimaryKey`).
- **Column param types map to physical types:**
  - `number` = int2/int4/int8/float4/float8/numeric.
  - `integer` = int2/int4/int8.
  - `geometry_column` = a row in `geometry_columns`.
- **`names`:** DB object names are generated, never typed:
  `dms_rule_<table>_<key>`, cut to fit Postgres's 63-character limit with a short hash (`pgIdent`
  in `uda/utils.js`). Rule objects are created in the table's own schema.
- **Safety rule:** a template may only put validated identifiers (checked with `SAFE_IDENTIFIER`,
  then double-quoted) and finite numbers into SQL. Never interpolate a string param. Core
  registration should reject a spec without `validate`.
- **`registerDatatype(name, { rules: { <id>: spec } })`** calls `registerRule`, and warns on an
  overwrite the same way datatypes do.

### Rule 1: `auto_number`

- **Params:** `column` (`integer`; defaults to the detected PK).
- **Validate:** the column exists, is an integer type and `NOT NULL`, and has no default yet.
  - An identity or `nextval` default that's already there reports `present-unmanaged` instead of
    failing, and attaching just records it.
- **Install** (`max+1` so the next value never collides; an empty table starts at 1):
  ```sql
  ALTER TABLE "s"."t" ALTER COLUMN "c" ADD GENERATED BY DEFAULT AS IDENTITY;
  SELECT setval(pg_get_serial_sequence('"s"."t"', 'c'), COALESCE((SELECT max("c") FROM "s"."t"), 0) + 1, false);
  ```
- **Uninstall:** `ALTER TABLE "s"."t" ALTER COLUMN "c" DROP IDENTITY IF EXISTS`.
- **Status:** `information_schema.columns.is_identity = 'YES'`, or `column_default LIKE 'nextval(%'`.

### Rule 2: `point_from_lat_lon`

- **Validate:**
  - `lat` and `lon` are `number` columns.
  - `geom` is in `geometry_columns` with type `POINT`, `MULTIPOINT` or `GEOMETRY`. Anything else is
    refused ("Point from lat/lon needs a point geometry column; wkb_geometry is POLYGON").
  - The SRID is known (≠ 0; see memory `reference_dama_srid0_breaks_tiles`).
  - `bounds`, if given, is 4 finite numbers with min < max.
- **The point expression** (by declared type and SRID):
  - Base: `ST_SetSRID(ST_MakePoint(NEW.lon, NEW.lat), 4326)`.
  - Wrapped in `ST_Transform(…, <srid>)` when the SRID ≠ 4326.
  - Then in `ST_Multi(…)` when the type is `MULTIPOINT`.
- **Install:** a function generated per table, with identifiers and bounds baked in. A generic
  function would have to reach `NEW` fields by name at run time through `to_jsonb(NEW)`, which is
  slower and messier.
  ```sql
  CREATE OR REPLACE FUNCTION "s"."<names.fn>"() RETURNS trigger LANGUAGE plpgsql AS $fn$
  BEGIN
    IF NEW."lat" IS NULL OR NEW."lon" IS NULL THEN
      IF TG_OP = 'UPDATE' THEN NEW."geom" := NULL; END IF;   -- coordinates cleared → no pin
      RETURN NEW;                                            -- insert without coords: leave geom alone
    END IF;
    IF NEW."lat" NOT BETWEEN 42.4 AND 42.9 OR NEW."lon" NOT BETWEEN -74.3 AND -73.6 THEN  -- only when bounds set
      RAISE EXCEPTION 'Coordinates %, % are outside the allowed area (latitude 42.4 to 42.9, longitude -74.3 to -73.6). Are latitude and longitude swapped, or is a minus sign missing?', NEW."lat", NEW."lon"
        USING ERRCODE = 'check_violation';
    END IF;
    NEW."geom" := ST_Multi(ST_SetSRID(ST_MakePoint(NEW."lon", NEW."lat"), 4326));
    RETURN NEW;
  END $fn$;
  DROP TRIGGER IF EXISTS "<names.trg>" ON "s"."t";
  CREATE TRIGGER "<names.trg>" BEFORE INSERT OR UPDATE OF "lat", "lon" ON "s"."t"
    FOR EACH ROW EXECUTE FUNCTION "s"."<names.fn>"();
  ```
  Without `bounds`, it still always rejects impossible values (|lat| > 90, |lon| > 180).
- **Backfill:** sets `geom` from lat/lon on rows that have both coordinates inside the bounds and
  whose geometry is NULL or differs (`NOT ST_Equals`). It returns
  `{ updated, skippedOutOfBounds, skippedMissing }`. It never raises: one bad row (for example
  Land Bank row 1314) must not abort the whole backfill.
- **Uninstall:** `DROP TRIGGER IF EXISTS …; DROP FUNCTION IF EXISTS …`. The geometry values stay.
- **Status:** a `pg_trigger` row with `names.trg` on the table (not `tgisinternal`).

### Server functions (`dms-server/src/dama/rules/`)

- **`listSourceRules(env, sourceId)`** returns
  `{ available: [{ id, label, description, params }], attached: [{ …rule, tables: [{ view_id, table, status }] }] }`.
  - `available` is filtered by `appliesTo`, using the latest view's table.
  - Status is read from the catalog for every table behind the source:
    `data_manager.views WHERE source_id = $1 AND table_name IS NOT NULL`.
- **`setSourceRule(env, sourceId, { id, params }, enable, user)`:**
  1. Load the metadata and the source's tables, then introspect each table.
  2. Run `validate` on every table. Nothing has changed if this throws.
  3. In `db.withTransaction(tx => …)`, run `install` (or `uninstall`) for each table. It's
     all-or-nothing across tables: DDL is transactional in Postgres.
  4. Write `metadata.rules` with a compare-and-swap. Do it in the same transaction if
     `casWriteSourceMetadata` can take `tx`. If it can't, write after commit and, when the write
     fails, run `uninstall` to undo.
  5. Return `listSourceRules` for the updated state.
- **`backfillSourceRule(env, sourceId, key)`** returns counts for each table.
- **`ensureSourceRules(db, viewId)`** installs any attached rule whose status is `missing` on that
  view's table. It's used in two places:
  - **At the end of publish:** `gis-publish.js` before its FINAL event (around :496) and
    `csv-publish.js` (around :156). A failure is logged and reported in the FINAL event; it doesn't
    fail the publish (open question 1).
  - **As a safety net on write:** `resolveEditableTable` calls it when `metadata.rules` isn't
    empty. Results are cached per process, keyed by table plus a hash of the rules, so a normal write
    pays one map lookup (open question 2).

### Routes (`uda.route.js`, beside `setPrimaryKey`)

- **GET** `uda[{keys:envs}].sources.byId[{keys:ids}].rules` returns an `$atom` of `listSourceRules`.
- **CALL** `uda.sources.setRule` `[env, sourceId, { id, params }, enable]`. It invalidates the
  `rules` and `metadata` paths for the source.
- **CALL** `uda.sources.backfillRule` `[env, sourceId, key]`.
- **Every route** requires `this.user` and
  `isUserAuthedForSource({ db, sourceId, reqPermissions: ['update-source'], user })`, copied from
  `setAuthoritativeView`.

### gis-publish: create the identity at birth

- Create the column as `ogc_fid INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY`.
- After the copy (:379), run `setval(pg_get_serial_sequence(…,'ogc_fid'), COALESCE(max,0)+1, false)`.
- When there's no temp fid column, leave `ogc_fid` out of the insert list so the identity fills it.
  Today the code inserts `NULL::INTEGER`, which a `NOT NULL` PK rejects.
- This only changes new tables. Existing tables get the `auto_number` rule.

### Datasets UI

- **The Rules page.** `rules: { name: 'Rules', path: '/rules', cdn: ({ isDms }) => !isDms, component: RulesPage }`
  goes in `defaultPages.js`. Add it to `gis_dataset/index.js` and `csv_dataset/index.js`.
  - The component is `pages/dataTypes/default/rules.jsx`, with its styles in `rules.theme.js`,
    registered under the datasets pattern's theme. All markup goes through the theme, per
    `packages/dms/CLAUDE.md`.
  - Each attached rule shows its label, a summary of its params ("latitude → longitude →
    wkb_geometry (MULTIPOINT, 4326) · bounds 42.4–42.9, −74.3 to −73.6"), and its status
    ("installed on 1/1 tables").
    - **Reinstall** appears when any table shows `missing`.
    - **Apply to existing rows** shows the backfill counts when it finishes.
    - **Edit** re-opens the parameter form. **Remove** asks for confirmation first.
  - **+ Add rule** lists `available` rules. Choosing one opens a form built from its `params`.
    - Input types: `column` is a select over `metadata.columns`, filtered by `columnTypes` against
      each column's physical type (from `info`). `geometry_column` is a select over the
      `geometry_columns` rows. `bbox` is four number inputs. `number`, `string` and `boolean` are
      plain inputs.
    - Follow `SchedulePage.jsx`'s `ParamInput` (:50-90) rather than inventing a new form system.
  - **Errors:** a server error (a `validate` message or a DDL failure) shows inline in a banner,
    like `pkeyError`. Writes aren't optimistic: the page re-reads `rules` after every call.
  - **Read-only** for users without edit rights (`canEdit`, as in `metadata.jsx`).
- **The Metadata-page shortcut.** On the PK row (`RenderPrimaryKeySwitch` in
  `MetadataComp/components/RenderField.jsx`), when the PK column has no default, show
  "Auto-number new rows" with an Enable button. It calls the same `setRule`, then shows the
  `pkeyInfo`-style state.

### Design notes from the build (2026-10-16): where the code differs from the plan above

- **One transaction, no compare-and-swap.** `setSourceRule` locks the source row
  (`SELECT metadata … FOR UPDATE`) inside the same `withTransaction` as the DDL, and writes
  `metadata.rules` there. The DDL and the metadata land together or not at all, with no undo step.
  A concurrent `updateSource` compare-and-swap just retries.
- **The GET path is `rulesInfo`, not `rules`.** That avoids confusion with `metadata.rules`. It
  also returns `latest` (the newest table's columns with `kind`, its geometry columns, and the PK)
  so the Rules page's pickers need no second request, and each available rule's `defaults`
  (`normalize` against that table).
- **Status is `installed` | `missing`** (plus `unknown-rule` / `error` in `rulesInfo`). There is
  no `present-unmanaged`: an existing identity or `nextval` default counts as `installed` for
  Auto-number, and attaching it runs no DDL.
- **Removing Auto-number keeps the identity.** `uninstall` returns no statements: dropping the
  default would break adding rows. Removing Point from lat/lon drops its trigger and function.
- **SRID 0 isn't refused.** A bare `geometry` column (typmod SRID 0) uses its values' SRID, or 4326
  when it has no values yet. Only the value SRID matters for tiles (memory:
  `reference_dama_srid0_breaks_tiles`).
- **PostGIS calls are qualified** with the extension's schema (`"public".ST_MakePoint`), so the
  trigger doesn't depend on the writer's `search_path`.
- **Bounds are `[west, south, east, north]`**, the GeoJSON bbox order. The world-range check
  (|lat| ≤ 90, |lon| ≤ 180) always applies.
- **Editing can change a rule's key** (for example, a different geometry column). Pass
  `replaceKey`, and the old instance is uninstalled in the same transaction.
- **The rule calls return their outcome as a value.** `setRule` / `backfillRule` return
  `sources.byId[id].rulesCall = { ok, error }` instead of throwing. Found live: avl-falcor's HTTP
  datasource builds `new Error(responseData)` from a 500's parsed JSON body, so every thrown
  server message reached the page as `"[object Object]"`. This is platform-wide: the Metadata
  page's PK error banner has the same gap. Precedent: `uda.colorDomain.route.js`.
- **Rules is reached from the Admin page, not the tab bar** (`cdn: () => false`, like Metadata).
  Source tabs aren't permission-gated, and this keeps the public catalog's tabs unchanged.
- **The Auto-number shortcut is a banner** on the Metadata page, not a control on the PK switch.
  It's more visible, and needs no props threaded through `MetadataComp` → `RenderField`.
- **Backfill tolerance.** "Already right" means within ~1 cm (`ST_DWithin` 1e-7 degrees,
  compared in 4326), not `ST_Equals`. The exact comparison rewrote 72 Land Bank pins that were
  under 5 m off (Phase 7).
- **Each rule's `removeNote`** says what Remove leaves behind; the page shows it while confirming.
- **The test harness:** `tests/postgres-docker.js` takes `DMS_TEST_PG_IMAGE`, and `waitReady` now
  also waits for the image's "init process complete" log line. PostGIS's longer first-start setup
  restarts the server after two `pg_isready` passes, which made the first run fail mid-reset.

## Phases

### Phase 1: Rule registry and the two core rules — DONE (2026-10-16)
- [x] `dama/rules/registry.js`: `registerRule`, `getRules`, `getRule`. Refuses a spec without a
      label, a params array, or `key`/`validate`/`install`/`uninstall`/`status`.
      (`index.js` re-exports them and registers the two core rules.)
- [x] `dama/rules/introspect.js`: per-table `info` (columns with a `kind`, `geometry_columns`
      found through the PostGIS extension's schema, PK).
- [x] `dama/rules/auto_number.js` and `dama/rules/point_from_lat_lon.js`. See the design notes
      below for where they differ from the spec.
- [x] Object names: `sql.js` `objectName()` keeps names within 63 characters, with an 8-character
      sha1 suffix on long ones.
- [x] Unit tests for the generated SQL (no DB): `tests/test-source-rules.js` Part 1, 9 tests.
  - POINT, MULTIPOINT and GEOMETRY columns.
  - SRID 3857 gets `ST_Transform`; a bare geometry column with no values uses 4326.
  - Bounds present, absent and blank.
  - A bad identifier, short bounds, inverted bounds and a NaN bound are refused.
  - A POLYGON column and a text column are refused with plain messages.

### Phase 2: Server API and protecting the metadata — DONE (2026-10-16), except the owner call
- [x] `listSourceRules` / `setSourceRule` / `backfillSourceRule` in `dama/rules/index.js`. Every
      table is validated first, then the DDL and the metadata write run in ONE `withTransaction`,
      with the source row locked (see design notes).
- [x] `updateSource` keeps the stored `metadata.rules`: the new `SERVER_OWNED_METADATA_KEYS`
      covers `authority` and `rules`.
- [x] Falcor routes, gated on `update-source`:
  - `sources.byId[id].rulesInfo` (GET; renamed from `rules`, see design notes).
  - `uda.sources.setRule` (CALL). It returns the fresh `rulesInfo`.
  - `uda.sources.backfillRule` (CALL). It returns counts at `rulesBackfill[key]`.
- [x] `registerDatatype` accepts `rules`. Tested in `test-source-rules.js` ("an app can register
      a rule through registerDatatype") rather than `test-datatypes.js`, because the check needs
      `rulesInfo` against a real source.
- [ ] (owner call, open question 3) Gate `uda.sources.setIndex` and `uda.sources.setPrimaryKey`
      with the same check. **Not done**: it's a behaviour change.

### Phase 3: Re-applying rules to new versions — DONE (2026-10-16)
- [x] `ensureSourceRules(db, viewId, known?)`. It uses one transaction per rule, so one rule that
      can't install doesn't stop the others, and caches per adapter, view and rules signature.
- [x] Called at the end of `gis-publish.js` and `csv-publish.js`. The FINAL event's result
      carries `rules: { installed, failed }` when either is non-empty. Never fatal.
- [x] The safety net in `resolveEditableTable`: it runs only when `metadata.rules` is non-empty,
      and its errors are logged, never thrown.

### Phase 4: gis-publish identity PK (the root cause of G12, Add parcel fails) — DONE (2026-10-16)
- [x] `ogc_fid INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY`, plus `setval` to max+1
      after the copy. `ogc_fid` is left out of the insert when the temp table has no fid column.
- [x] Tested in `test-source-rules.js` by running the real `gis-publish` worker (ogr2ogr on a
      2-feature GeoJSON) against the PostGIS container. `ogc_fid` is an identity, an INSERT
      without it gets max+1, and the new version got the source's point rule.
      `test-upload-pipeline.js` doesn't run the worker, so it wasn't extended.

### Phase 5: Datasets UI — DONE (2026-10-16)
- [x] `defaultPages.rules` (`cdn: () => false`), plus entries in `gis_dataset/index.js` and
      `csv_dataset/index.js`; `lazyPages.Rules` (its own chunk, `rules-*.js` in the build).
      Reached from a **Rules** button on the Admin page, next to Advanced Metadata (design note).
- [x] `default/rules.jsx` + `rules.theme.js` (registered as `datasets.rulesPage` in
      `datasets/defaultTheme.js`, read through `getComponentTheme`):
  - the attached list, with a status pill ("installed on 1/1 table") and per-table status when
    there's more than one;
  - Reinstall (shown when any table is `missing`), Apply to existing rows (with its counts),
    Edit, and Remove (two-step, showing the rule's `removeNote`).
- [x] The Add-rule picker and parameter form: column (filtered by `columnKinds` against the
      physical type), geometry_column (filtered by `geometryTypes`), bbox (west/south/east/north),
      number, string and boolean. Modelled on `SchedulePage`'s `ParamInput`.
- [x] Inline error banner; not optimistic (each call returns the fresh `rulesInfo`); read-only
      without `update-source`; `rulesInfo` invalidated and re-read on mount.
- [x] The Metadata-page Auto-number shortcut: a banner above the column list (not on the PK switch,
      see design notes) when the PK is an integer with no default.

**Follow-ups after the 2026-10-20 merge with the UI-controls port (`755567c1`):**
- [ ] Admin-page Rules button: `<Button activeStyle='actionFull'>` with `t.actionIconRules`
      (`'Sliders'` in `admin.theme.js`), matching its restyled siblings.
- [ ] Rules page + Metadata banner onto `UI` components (`FieldLabel`, `Input`, `Select`, the
      checkbox column type, themed buttons), as `fa3d6955` did for the Schedule page this one was
      modelled on.

### Phase 6: Docs — DONE (2026-10-16)
- [x] `data-types/CLAUDE.md`: a "`rules` contract" section with a worked `uppercase_code`
      example, the safety rule, and the note that rule ids are global.
- [x] `dms-server/src/dama/CLAUDE.md`: a "Source rules (`rules/`)" section (stored shape, status
      from the catalog, routes and `rulesCall`, one transaction, versions, writing a rule, tests),
      the directory layout entry, and the gis-publish identity note.
- [x] `dms-server/tests/CLAUDE.md`: the `test-source-rules.js` row, plus `DMS_TEST_PG_IMAGE` and
      the `waitReady` change.
- [x] Authoring note: `skills/uploading-gis-and-tabular-datasets.md` "After publish" (Admin →
      Rules, what each core rule is for, bounds advice).

### Phase 7: Land Bank rollout on source 3 — MOSTLY DONE on `landbank_dama` (2026-10-16; the owner cleared it for testing as a dev environment)
How it was run: the working-tree dms-server on :3011 (the job-disabled harness), a throwaway
Vite on :5288 (`VITE_DMS_APP=landbank`, `VITE_API_HOST=http://localhost:3011`), Playwright,
signed in as the dev login (`availabs@gmail.com`, user 1). Backup first:
`scratchpad/landbank/backups/source3_rules_pre_2026-10-16.json` (source metadata,
`auth_permissions`, the ID column definition, triggers, counts). **Not backed up: the geometry
column** (see the backfill line).
- [x] The stopgap trigger was never run, so there was nothing to drop.
- [x] The server gate held: the first Apply as user 1 was refused ("You don't have permission to
      change this source (update-source on source 3)"), because source 3 grants only user 175.
      The client showed the Add button anyway; its check is looser (a signed-in user is allowed).
      For the browser test, user 1 got `update-source` on source 3 temporarily
      (`backups/source3_test_grant.cjs grant`). **It was restored exactly** afterwards
      (`… restore` → `{"users":{"175":["*"]},"groups":{"public":[]}}`).
- [x] **Auto-number** attached to `ogc_fid` through the UI: "installed on 1/1 table", and
      `ogc_fid` is now an identity. The next value is **1316**, because the test row used 1315.
- [x] **Point from lat/lon** (`latitude`, `longitude` → `wkb_geometry`) attached through the UI,
      with bounds −74.3, 42.4, −73.6, 42.9: installed, trigger `dms_rule_point_from_lat_lon_wkb_geometry`.
- [x] Apply to existing rows: **72 updated** · 1 skipped (row 1314) · 81 without coordinates.
      The plan expected 0. The 72 were pins less than 5 m from their lat/lon (all 1,232 were
      within 5 m in the morning's read-only check) that the exact `ST_Equals` comparison counted
      as different. They now match their lat/lon exactly. The old values weren't backed up.
      The backfill now ignores differences under ~1 cm (design note; test added).
- [x] The add path, via `uda.data.create` through :3011 (the modal Card's write call):
  - a row without `ogc_fid` saved as **1315** with its geometry;
  - a `latitude`-only `uda.data.edit` moved it to `MULTIPOINT((-73.7637 42.6425))`;
  - swapped coordinates were refused: HTTP 500 "…are outside the allowed area… Are latitude and
    longitude swapped…?";
  - the z14 tile from **both :3011 and the deployed dmsserver** carried ogc_fid 1315 (the rules
    live in the database, so the deployed server benefits before any deploy);
  - `/admin/property-view?id=1315` showed the mini-map pin in the South End.
  - Test row deleted; the table is back to 1,314 rows.
- [ ] Add a parcel by clicking through the dashboard modal (1096) itself. The write path is
      verified; the modal UI isn't.
- [ ] Out-of-bounds in the Card UI: refused, but the Card shows no message (Related).
- [ ] Owner: decide what to do with row 1314 (delete it, or fix it), and whether "held" should be
      198.
- [x] Updated `lb_landbank_site`'s G12 decision line and `admin-dashboard-dms-page.md`'s progress
      log.
- ⚠ **Until the dms-server deploy**, a Metadata-page save on the *deployed* site (old
  `updateSource`) drops `metadata.rules`. The triggers and the identity stay in the database and
  keep working, but the Rules page would then show nothing attached. If that happens, re-attach
  both rules: the installs are idempotent.

## Files requiring changes (as built)

| File | Change |
|---|---|
| `packages/dms-server/src/dama/rules/registry.js` | New: `registerRule` / `getRule` / `getRules`, the spec contract in its header |
| `packages/dms-server/src/dama/rules/sql.js` | New: `quoteIdent`, `qualified`, `sqlNumber`, `objectName`, `ruleObjectNames`, `sqlLiteral` |
| `packages/dms-server/src/dama/rules/introspect.js` | New: `introspectTable` (columns + kind, geometry columns, PK), `kindMatches` |
| `packages/dms-server/src/dama/rules/auto_number.js`, `point_from_lat_lon.js` | New: the two core rules |
| `packages/dms-server/src/dama/rules/index.js` | New: registers the core rules; `listSourceRules`, `setSourceRule`, `backfillSourceRule`, `ensureSourceRules`, `forgetEnsured` |
| `packages/dms-server/src/routes/uda/uda.controller.js` | `SERVER_OWNED_METADATA_KEYS` (`authority`, `rules`) in `updateSource`; `ensureSourceRules` in `resolveEditableTable` |
| `packages/dms-server/src/routes/uda/uda.route.js` | `sources.byId[id].rulesInfo` GET; `uda.sources.setRule` / `uda.sources.backfillRule` CALL (`update-source`, outcome at `rulesCall`) |
| `packages/dms-server/src/dama/datatypes/index.js` | `registerDatatype` accepts `rules` |
| `packages/dms-server/src/dama/upload/workers/gis-publish.js` | Identity `ogc_fid` + `setval`, no explicit NULL fid; `ensureSourceRules` before FINAL |
| `packages/dms-server/src/dama/upload/workers/csv-publish.js` | `ensureSourceRules` before FINAL |
| `packages/dms-server/tests/test-source-rules.js` (new), `postgres-docker.js`, `package.json` | 29 tests; `DMS_TEST_PG_IMAGE`; `waitReady` waits for init; `test:pg:source-rules` |
| `packages/dms/src/patterns/datasets/pages/dataTypes/default/rules.jsx` + `rules.theme.js` (new) | The Rules page |
| `packages/dms/src/patterns/datasets/pages/dataTypes/{defaultPages,lazyPages}.js`, `{gis_dataset,csv_dataset}/index.js`, `datasets/defaultTheme.js` | Register the page and its theme |
| `packages/dms/src/patterns/datasets/pages/dataTypes/default/admin.jsx` | Rules button in the Admin sidebar (DAMA sources) |
| `packages/dms/src/patterns/datasets/pages/dataTypes/gis_dataset/pages/metadata.jsx` | Auto-number banner |
| `dms-template/data-types/CLAUDE.md`, `packages/dms-server/src/dama/CLAUDE.md`, `packages/dms-server/tests/CLAUDE.md`, `skills/uploading-gis-and-tabular-datasets.md` | Docs |

## Testing checklist

**Automated (dms-server) — all verified 2026-10-16**
- [x] `npm run test:pg:source-rules`: **29 passed** (9 SQL-generation tests with no DB, plus 20
      against PostGIS 16-3.4 through the Falcor routes):
  - POINT / MULTIPOINT / GEOMETRY; SRID 3857 transform; bounds present / absent / blank.
  - Refusals change nothing: a text latitude, plus an anonymous or unpermitted caller (no DDL, no
    metadata).
  - A second table's install failure rolls back the first.
  - A generic metadata save keeps the rules.
  - Insert builds a MULTIPOINT; a latitude-only edit rebuilds the point; clearing a coordinate
    removes the pin; swapped coordinates are refused with the message.
  - Backfill fills the missing pins, skips the junk row, is idempotent, and ignores sub-cm noise.
  - Auto-number reproduces G12, then gives max+1; an existing serial/identity counts as installed.
  - Edit with `replaceKey`; Remove (trigger and function gone, geometry kept); removing
    Auto-number keeps the identity.
  - A new version via `ensureSourceRules` (then cached); the write-path safety net.
  - `registerDatatype({ rules })`.
  - The real `gis-publish` worker: identity `ogc_fid`, next id max+1, rules re-applied, and the
    FINAL event reports them.
- [x] No regressions: `npm test` (SQLite core), `test-uda`, `test-datatypes`,
      `test-upload-pipeline`, `test-transaction-guard`, `test-schedules` all exit 0;
      `npm run test:pg` (stock postgres:17-alpine) exits 0 — UDA 142/142, auth 104/104,
      transactions 21 + 11, feature-id 7.
- [x] `vite build` of dms-template exits 0, with the Rules page in its own chunk.

**Manual (UI) — verified 2026-10-16 on :5288 against `landbank_dama` source 3**
- [x] The Rules page loads (screenshots `rules_1`, `flow_*`); reached from the Admin page, not the
      tab bar.
- [x] Add rule offers both core rules; the ID-column picker lists only integer columns; the
      latitude/longitude pickers list number columns; the geometry picker shows
      "wkb_geometry (MULTIPOINT, SRID 4326)".
- [x] An error shows inline with the server's text (after the `rulesCall` change, see design
      notes). After a success the list re-reads with its status.
- [x] The Metadata-page banner renders when the PK has no default (checked by rewriting the
      intercepted `rulesInfo` response, since source 3 now has an identity; nothing clicked).
- [ ] Read-only view for a viewer without edit rights: not seen. The dev login passes the client
      check, and the server refusal path was seen instead.
- [ ] Remove from the UI: covered by the automated test, not clicked on Land Bank (both rules are
      meant to stay).

## Open questions (decisions)

Built with the planned default for 1, 2 and 4; change any of them if you disagree.

1. **A rule that fails to install at publish:** *built:* warn in the FINAL event and show
   `missing` on the Rules page (alternative: fail the publish).
2. **The safety net on write:** *built:* `resolveEditableTable` installs a missing rule (a short
   DDL lock) inside the write request (alternative: refuse the write with "Rules aren't installed
   on this version, open Rules and reinstall").
3. **OPEN — gate `setIndex` / `setPrimaryKey`?** Today both run DDL with no auth check, not even
   a signed-in user. Gating them is a behaviour change: unauthenticated calls that work now would
   fail. Added to `dms_datasets_manager`'s Decisions.
4. **Out-of-bounds coordinates:** *built:* reject the save (alternative: save without a pin).
   Rejecting is only friendly once the Card shows save errors (Related).

## Related (not in this task)

- **The tile cache.** `dama/tiles/tiles.rest.js:335` sends `Cache-Control: public, max-age=3600`,
  so a browser that already loaded a tile keeps serving it for up to an hour after a save. New and
  moved pins don't show right away.
  - The proposed fix is `no-cache` (keeping the ETag) for views whose source is `isEditable`.
  - The Map section (dms-template `src/patterns/mapeditor/section/`) has no `data_refresh`
    subscriber; adding one could rebuild the source through the existing path at
    `SymbologyViewLayer.jsx:331`.
  - Needs its own task. Without it, Phase 7's map checks need a hard reload.
- **The Card shows no save errors.** `Card.jsx:206` (`addItemWrapped`) has no error handling, so
  a failed add or save just leaves the modal open. That's why G12 (Add parcel fails) looks like
  "nothing happens", and the point rule's bounds message would be invisible too. It's a library
  primitive change, so it needs its own task and must stay backwards-compatible.
- **Related tasks:**
  - [`set_primary_col_from_meta.md`](./set_primary_col_from_meta.md) (Set primary key from the
    metadata UI): the DDL-from-settings pattern this follows; it lists an auto-generated PK as a
    future idea.
  - [`external-source-editable-crud.md`](./external-source-editable-crud.md) (external source
    editable CRUD): the write path.
  - [`dms-server-real-transactions.md`](./dms-server-real-transactions.md) (Real DB transactions):
    `withTransaction`, which this task depends on.
- **Background for Land Bank:**
  - `planning/landbank/tasks/current/admin-dashboard-dms-page.md` (gaps G10, no geocoding step,
    and G12, Add parcel fails).
  - `src/themes/landbank/design_system/reports/aclb-marketplace-roadmap.html` (W1, add new
    properties with a location; W2, keep geometry correct).

## Progress log

- **2026-10-16 — Scoped; design chosen by the owner.**
  - Compared registered write hooks, free-form trigger SQL (2a) and managed rule templates (2b).
    The owner chose 2b ("I like 2b much better than option 1 which would be quick and dirty here").
  - The Rules page (attach registered rules to one source, with a parameter form) was agreed in the
    same conversation. New rule types stay code-registered.
  - Evidence gathered with read-only queries on `landbank_dama` and a code read (see Current state).
    Found along the way: the MULTIPOINT column type, G12's root cause in `gis-publish.js:310`, the
    unguarded `setIndex`/`setPrimaryKey` routes, the one-hour tile cache, and junk row 1314.
  - The probe scripts are in that session's scratchpad (not kept).
- **2026-10-16 — Built: phases 1–6, plus Phase 7 on `landbank_dama` (owner: dev environment,
  OK to test there).**
  - Server: the rules module, routes, metadata protection, publish re-apply and the write-path
    safety net, the gis-publish identity, and `registerDatatype({ rules })`.
  - Client: the Rules page, the Admin link, the Metadata banner.
  - Tests: 29/29 on PostGIS; existing SQLite and stock-PG suites green; `vite build` green.
  - Live on source 3: both rules attached through the UI and installed; Add without an ID works
    (G12 fixed in the database); a latitude edit moves the pin; swapped coordinates are refused;
    the deployed server's tiles include the new parcel; the view page's mini-map pins it. Test
    row deleted, the temporary grant restored.
  - Findings along the way: the `[object Object]` falcor error gap (worked around with
    `rulesCall`); the exact-equality backfill rewrote 72 near-identical pins (now tolerant); the
    client permission check is looser than the server's.
  - Left: the owner call on gating `setIndex`/`setPrimaryKey`; clicking through the dashboard
    modal; row 1314; commit and deploy.
- **2026-10-20 — Merge with origin/master (the UI-controls/v6 port).** Three add/add conflicts
  (`datasets/defaultTheme.js`, `gis_dataset/index.js`, `csv_dataset/index.js`) resolved by keeping
  both sides: the Rules page next to the incoming Uploads page and Schedule/Runs themes. The merged
  tree builds. Two styling follow-ups listed under Phase 5.
