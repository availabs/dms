# Task: Clone dms-mercury-2 to dms-mercury-types

## Status: DONE (2026-03-18)

## Objective

Create a copy of the `dms2` database on mercury as `dms_types` to use as the working database for the type system refactor. This gives us a safe copy to run the migration script against without risking production data.

## Steps

### 1. Create the target database on mercury

```bash
PGPASSWORD=1234 psql -h mercury.availabs.org -p 5435 -U postgres -c "CREATE DATABASE dms_types;"
```

### 2. Dump and restore

```bash
PGPASSWORD=1234 pg_dump -h mercury.availabs.org -p 5435 -U postgres dms2 | \
  PGPASSWORD=1234 psql -h mercury.availabs.org -p 5435 -U postgres dms_types
```

### 3. Verify

```bash
# Check row counts match
PGPASSWORD=1234 psql -h mercury.availabs.org -p 5435 -U postgres dms_types -c "
  SELECT schemaname, tablename, n_live_tup
  FROM pg_stat_user_tables
  WHERE schemaname LIKE 'dms_%'
  ORDER BY n_live_tup DESC
  LIMIT 20;
"
```

### 4. Test with dms-server

```bash
DMS_DB_ENV=dms-mercury-types npm run dev
```

## Config

Database config already created at `src/db/configs/dms-mercury-types.config.json`:

```json
{
  "host": "mercury.availabs.org",
  "port": 5435,
  "user": "postgres",
  "password": "1234",
  "database": "dms_types",
  "type": "postgres",
  "role": "dms",
  "splitMode": "per-app"
}
```

## Context

This database will be the target for the type system migration script (`migrate-type-system.js`). By working on a copy, we can iterate on the migration without affecting `dms2`.
