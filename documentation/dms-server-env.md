# dms-server environment variables

Every variable dms-server reads (`process.env.*` under `packages/dms-server/src`), what it does and its
default. `npm start` / `npm run dev` load the project root `.env` (dms-template's), then `packages/dms-server/.env`,
which wins (Node `--env-file-if-exists`); a variable already set in the shell wins over both. Copy-ready examples: dms-template's `.env.example` (the operator-facing ones) and
`packages/dms-server/.env.example` (local overrides). Keep this file in step when a variable is added: grep
`process.env` under `src/` and compare.

⚠ `dms-sqlite` / `auth-sqlite` are fallback config names in several places. Check what those config files
point at before starting a server or a script with defaults; on some machines they are production databases.

## Server and databases

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3001` | HTTP port. |
| `DMS_DB_ENV` | `dms-sqlite` | DMS database config (a file in `src/db/configs/`, without `.config.json`). |
| `DMS_AUTH_DB_ENV` | `auth-sqlite` | Auth database config. |
| `DAMA_DB_ENV` | — | An extra DAMA pgEnv to initialise at boot, besides those the configs declare. |
| `DMS_SPLIT_MODE` | `legacy` | `legacy` or `per-app` table layout, when the config sets no `splitMode` (see `../packages/dms-server/CLAUDE.md`). |
| `DMS_LOG_REQUESTS` | `0` | `1` writes every Falcor request to `logs/requests-<ts>.jsonl` (replay with `tests/replay.js`). |
| `NODE_ENV` | — | `development` lets two-part hosts (`x.localhost`) carry a subdomain. |
| `DMS_EXIT_ON_UNCAUGHT` | unset | `1` exits on an uncaught exception instead of logging and staying up (`utils/process-safety.js`). |
| `DMS_HEAP_SNAPSHOT_MB` | `0` (off) | Write one `.heapsnapshot` when the heap passes this many MB (OOM diagnosis). |
| `DMS_EXTRA_DATATYPES` | — | Path to an app's datatype registration module, `require()`d at boot. |
| `DMS_PAGE_DELETE_HOOK` | — | Path to an app's page-delete hook module. |

## Auth (JWT)

| Variable | Default | What it does |
|---|---|---|
| `JWT_SECRET` | — | Signing secret. Required in production. |
| `JWT_EXPIRY` | `6h` | Token lifetime (`jsonwebtoken` syntax). |
| SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | — | Outgoing mail (signup, invites, password reset). Without them email is a no-op. |

## Permissions rollout

**One flag.** `DMS_AUTH_MODE` is the only auth variable (`routes/auth/settings.js`). Every decision is
made by `routes/auth` `authorize` (pure) and turned into an allow or a refusal by `applyMode`
(`report.js`), the one place a refusal is logged. Two things a call site may say about itself, because
the history is real: DMS reads were enforced before the mode existed and stay so (`mode: 'enforce'`);
vector tiles never enforce (`mode: 'log'`); and the surfaces that enforced a source's own grants before
the mode existed — the external-source UDA writes, the auth-row handlers — are `strict`: under `log`
they refuse everything but what the blank-row rule alone refuses. Background:
`planning/tasks/current/auth-layer-simplification.md`.

| Variable | Default | What it does |
|---|---|---|
| `DMS_AUTH_MODE` | `log` | `log` allows, and records every would-deny in the console and the access log; `enforce` refuses. One mode for EVERY guard — `dms.data.*` writes, dataset source routes, dataset reads, the auth row, uploads and datatype routes. Move to `enforce` only once the access-log page is clean for the site. |
| `DMS_SYNC_AUTH` | unset | `1` requires a signed-in user on the sync endpoints (`/sync/*`). |
| `DMS_CHILD_SWEEP_MODE` | `log` | Deleting child rows a page / pattern no longer lists: `off`, `log` (report only), `delete`. Flip to `delete` only after `migrate-row-auth.js --verify-parents` reports zero shared children. |

### Auth levels

A group's `auth_level` (0–10) decides nothing (owner 2026-11-03; the level rules were deleted on
2026-11-04). Only a grant on the site's auth pattern row (`auth-users`, `auth-groups`, `view-as`, `*`)
or `${app} Admin` membership passes an auth handler. Levels stay in the auth DB and stay settable
(`/group/project/adjust`, `*` on the auth row) because older servers read them;
`src/scripts/audit-auth-levels.js` converts an app's levels to grants.

### Which rules the judge reads

Each row kind's rule is authored in the client's format files (`rules` on a format object),
collected at registration (`patterns/deriveAuthRules.js`) and registered in the site's own
`formats` table (`dms_<app>.formats` under per-app split mode) by `scripts/register-formats.js` (server-side, dry run by default; the only writer —
no client can write the table, see `routes/auth/formats.js`). `routes/auth/owners.js` `ruleFor`
reads the table first, then the stamp on the nearest ancestor that carries one (`data.authRules`,
written at create for one more release), then the built-in copy (`routes/auth/rules.js`). There is
no flag: the rules interpreter (`judge.js`) is the only judge.

## Access log

| Variable | Default | What it does |
|---|---|---|
| `DMS_ACCESS_LOG` | `on` | `off` stops recording refusals (`src/access-log`). |
| `DMS_ACCESS_LOG_DAYS` | `90` | Rows not seen for this many days are deleted (checked at most once a day). |

## Sync

| Variable | Default | What it does |
|---|---|---|
| `DMS_SYNC_MAX_DELTA` | `1000` | Most change_log rows one `/sync/delta` serialises; past it the client re-bootstraps. Raising it re-arms the heap problem in `.env.example`. |
| `DMS_SYNC_COMPACT_DAYS` | `30` | change_log rows older than this are compacted. |
| `DMS_SYNC_COMPACT_INTERVAL_HOURS` | `24` | How often compaction runs. |

## SSR and site config

`DMS_SSR=1` turns on server-side rendering. Each setting below falls back to its `VITE_*` twin, so one root
`.env` serves both Vite and the server.

| Variable | Fallback | What it does |
|---|---|---|
| `DMS_SSR` | — | `1` enables SSR. |
| `DMS_APP` / `DMS_TYPE` | `VITE_DMS_APP` / `VITE_DMS_TYPE` | Site to render. |
| `DMS_BASE_URL` | `VITE_DMS_BASE_URL`, then `/list` | Admin base path. |
| `DMS_AUTH_PATH` | `VITE_DMS_AUTH_PATH`, then `/auth` | Auth base path. |
| `DMS_PG_ENVS` | `VITE_DMS_PG_ENVS` | Comma-separated pgEnvs the site reads. |
| `DMS_MULTI_TENANT` | `VITE_DMS_MULTI_TENANT` | `1` serves tenants on subdomains. |
| `DMS_ROOT_DOMAIN` | `VITE_DMS_ROOT_DOMAIN` | The tenant hub's root domain (e.g. `availabs.com`). Hosts under it read as `<pattern subdomain>.<tenant>.<root>`: SSR resolves the tenant from the second label, and per-subdomain grants use the pattern subdomain (`utils/subdomain.js`). Unset: the old single-label reading. Only with `DMS_MULTI_TENANT`. |

## Datasets (DAMA), uploads and tasks

| Variable | Default | What it does |
|---|---|---|
| `DMS_STORAGE_TYPE` | `local` | File storage: `local` or `s3`. |
| `DAMA_SERVER_FILESTORAGE_PATH` | `var/dama-files` | Root of local file storage. |
| `AWS_ENDPOINT_URL`, `AWS_DEFAULT_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_STORAGE_BUCKET`, `AWS_BUCKET_URL` | — | S3 storage (with `DMS_STORAGE_TYPE=s3`). |
| `DAMA_ETL_DIR` | `var/tmp-etl` | Upload staging directory. |
| `DAMA_CSV_ANALYZER` | — | `ogrinfo` analyses CSV / TSV with ogrinfo instead of the built-in analyser. |
| `DMS_PUBLIC_URL` | `https://dmsserver.availabs.org` | Public base URL for tile links written by GIS publish. `DAMA_SERVER_URL` is the old name, still read with a warning. |
| `DMS_UDA_KEY_CACHE_TTL_MS` | `60000` | How long UDA caches a view's key columns. |
| `DAMA_TASK_POLL_INTERVAL` | `5000` | DAMA task-queue poll, ms. |
| `DMS_TASK_POLL_INTERVAL` | `DAMA_TASK_POLL_INTERVAL`, then `5000` | DMS task-queue poll, ms. |
| `DAMA_SCHEDULE_SWEEP_INTERVAL` | `30000` | Schedule sweep, ms. |

**Set by the server, never by hand:** `DAMA_TASK_ID`, `DAMA_PG_ENV`, `DAMA_WORKER_PATH` (DAMA worker
processes) and `DMS_TASK_ID`, `DMS_WORKER_PATH` (DMS worker processes). The task runner passes them to the
child it forks.

## PDF export

| Variable | Default | What it does |
|---|---|---|
| `DMS_PDF_ALLOW_PRIVATE` | unset | `1` lets the server print pages on localhost / private addresses. Local only, never on a public server. |
| `DMS_PDF_CHROME` | — | Chromium path. Tried first, then `PUPPETEER_EXECUTABLE_PATH`, then the usual install paths. |
| `PUPPETEER_EXECUTABLE_PATH` | — | Chromium path set by the deploy image. |
| `DMS_PDF_CONCURRENCY` | `1` | PDF jobs run at once. |
| `DMS_PDF_TABS` | `3` | Browser tabs per job. |
| `DMS_PDF_PAGE_TIMEOUT_MS` | `120000` | Per-page render timeout. |
