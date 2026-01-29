# SQLite Compatibility for dms-server

## Overview

This task adds SQLite support to dms-server, allowing it to work with either PostgreSQL or SQLite as the backing database. This enables simpler local development setups and lightweight deployments where PostgreSQL is not available.

## Current State Analysis

### Files Requiring Changes

#### 1. `src/db/index.js` (Database Connection Layer)
**Current Implementation:**
- Uses `pg` module exclusively (`Pool`, `Client` from "pg")
- PostgreSQL-specific connection pooling
- PostgreSQL-specific SQL for checking table existence (`information_schema.tables`)
- Hardcoded database type assumption

**Compatibility Issues:**
- Line 1: `const { Pool, Client } = require("pg")` - PostgreSQL only
- Line 15-21: `information_schema` query - PostgreSQL specific
- Line 52-62: `information_schema` query - PostgreSQL specific
- Line 103-120: `getPostgresCredentials()` - Named for PostgreSQL
- Line 125-171: `DataBase` class - Uses `pg.Pool` exclusively

#### 2. `src/db/sql/dms/dms.sql` (DMS Schema)
**PostgreSQL-specific syntax:**
- `CREATE SEQUENCE IF NOT EXISTS ... INCREMENT 1 START 1 ...`
- `nextval('dms.data_items_id_seq'::regclass)`
- `COLLATE pg_catalog."default"`
- `TABLESPACE pg_default`
- `ALTER SEQUENCE ... OWNED BY`
- `jsonb` data type
- `timestamp with time zone`
- GIN index with `jsonb_path_ops`
- Expression indexes: `(data ->> 'hide_in_nav'::text)`

#### 3. `src/db/sql/auth/auth_tables.sql` (Auth Schema)
**PostgreSQL-specific syntax:**
- `CREATE SEQUENCE ... START WITH ... INCREMENT BY ...`
- `nextval()` function
- `timestamp with time zone`
- Foreign key constraints with `ON UPDATE CASCADE ON DELETE CASCADE`
- `ALTER TABLE ONLY ... ALTER COLUMN ... SET DEFAULT`
- `ALTER SEQUENCE ... OWNED BY`
- `CREATE TYPE ... AS`

#### 4. `src/routes/dms/dms.controller.js` (Query Layer)
**PostgreSQL-specific patterns:**
- `$1, $2, $3...` parameterized query syntax (SQLite uses `?`)
- `ANY($1)` array comparison (no SQLite equivalent)
- `jsonb_array_elements()` function
- `::TEXT` type casting
- `array_agg()` aggregate function
- `|| '+' ||` string concat (works in both, but `+` doesn't work in SQLite)
- JSON operators: `->>`, `->`, `#>>`

#### 5. `src/routes/dms/utils.js` (Query Utilities)
- Parameterized query index references (`$1`, `$2`, etc.)

---

## Implementation Plan

### Phase 1: Database Abstraction Layer

#### 1.1 Create `src/db/config.js`
New file to handle database configuration for both types.

```javascript
// Structure for config files:
// PostgreSQL: { type: "postgres", host, port, database, user, password }
// SQLite: { type: "sqlite", filename: "./data/dms.db" }
```

**Tasks:**
- [ ] Create config loader that reads `{env}.config.json` files
- [ ] Support both PostgreSQL and SQLite config formats
- [ ] Add `type` field validation ("postgres" | "sqlite")
- [ ] Add SQLite filename path resolution

#### 1.2 Create `src/db/adapters/postgres.js`
Extract PostgreSQL-specific code into adapter.

**Tasks:**
- [ ] Move `pg` Pool/Client logic here
- [ ] Implement standard interface: `query()`, `getConnection()`, `end()`
- [ ] Keep existing PostgreSQL parameterized query format (`$1`, `$2`)

#### 1.3 Create `src/db/adapters/sqlite.js`
New SQLite adapter with same interface.

**Tasks:**
- [ ] Use `better-sqlite3` or `sqlite3` package
- [ ] Implement same interface as PostgreSQL adapter
- [ ] Convert `$1, $2` style params to `?` style internally
- [ ] Handle JSON as TEXT with JSON functions

#### 1.4 Update `src/db/index.js`
Refactor to use adapters based on config.

**Tasks:**
- [ ] Import adapters dynamically based on config type
- [ ] Update `getDb()` to select correct adapter
- [ ] Update `DataBase` class to be adapter-agnostic or remove
- [ ] Update `initAuth()` and `initDama()` to use appropriate SQL files

---

### Phase 2: SQL Compatibility

#### 2.1 Create `src/db/sql/dms/dms.sqlite.sql`
SQLite-compatible version of DMS schema.

**Key differences to handle:**
- [ ] Remove `CREATE SEQUENCE` (use `INTEGER PRIMARY KEY AUTOINCREMENT`)
- [ ] Replace `jsonb` with `TEXT` (store JSON as string)
- [ ] Replace `timestamp with time zone` with `TEXT` or `INTEGER`
- [ ] Remove `COLLATE pg_catalog."default"`
- [ ] Remove `TABLESPACE` directives
- [ ] Replace GIN indexes with standard indexes
- [ ] Remove expression index on JSON fields (not supported)

#### 2.2 Create `src/db/sql/auth/auth_tables.sqlite.sql`
SQLite-compatible version of auth schema.

**Key differences:**
- [ ] Remove sequences, use `INTEGER PRIMARY KEY AUTOINCREMENT`
- [ ] Remove `CREATE TYPE`
- [ ] Replace `timestamp with time zone` with `TEXT`
- [ ] Keep foreign key constraints (SQLite supports them)
- [ ] Remove `ALTER SEQUENCE` statements

#### 2.3 Update `src/db/index.js` init functions

**Tasks:**
- [ ] Check `sqlite_master` for SQLite instead of `information_schema`
- [ ] Select correct SQL file based on adapter type
- [ ] Handle `BEGIN;`/`COMMIT;` transaction differences (same in both)

---

### Phase 3: Query Compatibility

#### 3.1 Create Query Translator Utility
New file `src/db/query-utils.js` to handle query translation.

**Functions needed:**
- [ ] `translateParams(sql, dbType)` - Convert `$1` to `?` for SQLite
- [ ] `translateArrayAny(column, array, dbType)` - Handle `ANY($1)` vs `IN (?,...)`
- [ ] `translateJsonPath(path, dbType)` - Handle `->` / `->>` vs `json_extract()`
- [ ] `translateTypecast(sql, dbType)` - Remove `::TEXT` for SQLite
- [ ] `translateArrayAgg(column, dbType)` - Handle `array_agg()` vs `group_concat()`

#### 3.2 Update `src/routes/dms/dms.controller.js`
Replace PostgreSQL-specific queries with compatible versions.

**Queries to update:**

1. **`getFormat`** (line 47-52)
   - Issue: `|| '+' ||` string concat, `ANY($1)`
   - SQLite: Use `json_each()` or generate IN clause

2. **`dataLength`** (line 57-70)
   - Issue: `|| '+' ||` (works in SQLite)
   - Compatible as-is after param translation

3. **`dataSearch`** (line 72-106)
   - Issue: `ANY($1)` not used, but has dynamic SQL
   - Need to translate params

4. **`dataByIndex`** (line 107-127)
   - Issue: Param syntax
   - Compatible after translation

5. **`filteredDataLength`** (line 128-173)
   - Issue: Params, string concat
   - Mostly compatible after translation

6. **`filteredDataByIndex`** (line 174-229)
   - Issue: `array_agg(id order by id)` - needs `group_concat()`
   - Complex query needs careful translation

7. **`searchByTag`** (line 231-267)
   - Issue: `jsonb_array_elements()` - needs `json_each()`
   - Issue: `id::text` casting - use `CAST(id AS TEXT)`

8. **`getTags`** (line 269-301)
   - Issue: `jsonb_array_elements()`
   - Same as above

9. **`getSections`** (line 303-341)
   - Issue: `jsonb_array_elements()`, `::INTEGER` casting
   - Complex JSON handling

10. **`getDataById`** (line 343-365)
    - Issue: `::TEXT` casting, `ANY($1)`
    - Replace `ANY` with `IN`

11. **`setDataById`** (line 366-378)
    - Issue: `COALESCE(data,'{}') || $1` - JSON merge
    - SQLite: Use `json_patch()` function

12. **`setMassData`** (line 379-414)
    - Issue: JSON operators, dynamic SQL
    - Needs careful translation

13. **`createData`** (line 456-467)
    - Issue: `returning` clause
    - SQLite 3.35+ supports RETURNING

14. **`deleteData`** (line 469-475)
    - Issue: `ANY($1)`
    - Use IN clause

#### 3.3 Update `src/routes/dms/utils.js`
Update query building utilities.

**Tasks:**
- [ ] Update `handleFiltersType` for SQLite param style
- [ ] Update `handleFilters` for SQLite compatibility
- [ ] Keep `handleGroupBy`, `handleOrderBy` (already compatible)

---

### Phase 4: Dependencies & Configuration

#### 4.1 Update `package.json`

**New dependencies:**
```json
{
  "dependencies": {
    "better-sqlite3": "^11.0.0"
  },
  "optionalDependencies": {
    "pg": "^8.17.2"
  }
}
```

**Tasks:**
- [ ] Add `better-sqlite3` dependency
- [ ] Make `pg` optional (for SQLite-only deployments)
- [ ] Add environment variable documentation

#### 4.2 Create sample config files

**Tasks:**
- [ ] Create `src/db/configs/postgres.example.config.json`
- [ ] Create `src/db/configs/sqlite.example.config.json`
- [ ] Update README with configuration instructions

---

### Phase 5: Testing & Validation

#### 5.1 Test SQLite initialization
- [ ] Verify schema creation from `dms.sqlite.sql`
- [ ] Verify schema creation from `auth_tables.sqlite.sql`
- [ ] Test init check queries

#### 5.2 Test CRUD operations
- [ ] Test `createData` / insert
- [ ] Test `getDataById` / select
- [ ] Test `setDataById` / update
- [ ] Test `deleteData` / delete

#### 5.3 Test complex queries
- [ ] Test filtered queries with various operators
- [ ] Test JSON field queries
- [ ] Test pagination (LIMIT/OFFSET)
- [ ] Test ordering

#### 5.4 Test PostgreSQL regression
- [ ] Ensure all existing PostgreSQL functionality still works
- [ ] Run existing tests if available

---

## Key SQLite vs PostgreSQL Differences Reference

| Feature | PostgreSQL | SQLite |
|---------|------------|--------|
| Auto-increment | `SERIAL` / `SEQUENCE` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| Params | `$1, $2, $3` | `?, ?, ?` |
| JSON type | `jsonb` | `TEXT` with `json_*` functions |
| Array ANY | `= ANY($1)` | `IN (?, ?, ?)` |
| Array agg | `array_agg(x)` | `group_concat(x)` or `json_group_array(x)` |
| JSON extract | `data->>'key'` | `json_extract(data, '$.key')` |
| JSON array elements | `jsonb_array_elements(x)` | `json_each(x)` |
| Type cast | `x::TEXT` | `CAST(x AS TEXT)` |
| JSON merge | `a \|\| b` on jsonb | `json_patch(a, b)` |
| Current time | `NOW()` | `datetime('now')` |
| Boolean | `true/false` | `1/0` |

---

## Files to Create

1. `src/db/config.js` - Configuration loader
2. `src/db/adapters/postgres.js` - PostgreSQL adapter
3. `src/db/adapters/sqlite.js` - SQLite adapter
4. `src/db/query-utils.js` - Query translation utilities
5. `src/db/sql/dms/dms.sqlite.sql` - SQLite DMS schema
6. `src/db/sql/auth/auth_tables.sqlite.sql` - SQLite auth schema
7. `src/db/configs/postgres.example.config.json` - Example config
8. `src/db/configs/sqlite.example.config.json` - Example config

## Files to Modify

1. `src/db/index.js` - Refactor to use adapters
2. `src/routes/dms/dms.controller.js` - Update queries for compatibility
3. `src/routes/dms/utils.js` - Update query builders
4. `package.json` - Add SQLite dependency

---

## Estimated Complexity

- **Phase 1 (Abstraction Layer)**: Medium - Structural changes, careful refactoring
- **Phase 2 (SQL Compatibility)**: Low - Mainly schema translation
- **Phase 3 (Query Compatibility)**: High - Many queries to translate, JSON handling complex
- **Phase 4 (Dependencies)**: Low - Configuration work
- **Phase 5 (Testing)**: Medium - Comprehensive testing needed

## Risks & Considerations

1. **JSON functionality**: SQLite's JSON support is less mature. Complex JSON queries may need simplification or multiple queries.

2. **Performance**: SQLite is single-writer. High-concurrency scenarios may need PostgreSQL.

3. **RETURNING clause**: SQLite < 3.35 doesn't support `RETURNING`. May need to do separate SELECT after INSERT.

4. **Array operations**: SQLite doesn't have native array type. Workarounds may affect query structure.

5. **Backward compatibility**: Must ensure PostgreSQL deployments continue working without regression.
