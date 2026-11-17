# Database configs outside the submodule: `DMS_DB_CONFIG_DIRS`

**Initiatives:** [plat_qa_automation](../../../../../planning/initiatives/plat_qa_automation.md) · **Status:** built · **Release:** commit — library + dms-template changes uncommitted; needs a dms-server redeploy to reach mercury · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

Let an app keep its dms-server database configs in its own repo (dms-template: a root `db-configs/` folder),
instead of only in `src/dms/packages/dms-server/src/db/configs/`, five levels deep inside the submodule. The old
folder must keep working.

## Current state (before)

`src/db/config.js` read one hardcoded folder, `join(__dirname, "./configs")`, in `loadConfig` and
`findConfigsByRole`. Everything else goes through those two, except scripts that built the path by hand. Preview
stacks (`deploy/stacks.mjs`) kept a stack off production by mounting their own configs over that one folder.

## Design (owner, 2026-11-17)

- **`DMS_DB_CONFIG_DIRS`**: colon-separated folders, searched in order; the built-in `src/db/configs` is always
  appended last. Relative entries resolve against cwd (like `DMS_EXTRA_DATATYPES`). The library knows nothing
  about dms-template's layout.
- **A name in two folders throws** (from `loadConfig`, and from `findConfigsByRole` at startup), so a stale copy
  can never decide which database a name opens. A folder in the variable that doesn't exist throws too.
- A relative SQLite `filename` resolves against the folder its config was found in.
- `resolveConfigPath(name)` / `configDirs()` exported, and `loadConfig` / `findConfigsByRole` accept
  `{ dirs }` in place of the variable, so scripts use the lookup instead of building paths.
- The "not found" error says when `DMS_DB_CONFIG_DIRS` is unset (a script run without `.env`).

## Built — 2026-11-17

Library (`src/dms`):
- [x] `packages/dms-server/src/db/config.js`: `configDirs`, `resolveConfigPath`, multi-folder `loadConfig` /
      `findConfigsByRole`, per-folder SQLite paths, duplicate / missing-folder errors, unset-variable hint.
- [x] `packages/dms-server/tests/test-config-dirs.js` (8 cases, no DB), in `npm test` and as `test:config-dirs`.
      Full `npm test` green.
- [x] `src/scripts/migrate-auth-grants.js` reads its config through `loadConfig`.
- [x] Docs: `documentation/dms-server-env.md` row; dms-server `CLAUDE.md` "Database Configs"; `tests/CLAUDE.md`.

dms-template:
- [x] `db-configs/` with a committed `README.md` and `index.cjs` (`loadDbConfig` / `dbConfigPath`: this folder,
      then the built-in one); `.gitignore` ignores everything else in it.
- [x] `.env`, `.env-hub`: `DMS_DB_CONFIG_DIRS=<abs path>/db-configs` (absolute, so tools that load `.env` from
      another cwd still find it); `.env.example` documents it, commented out.
- [x] Moved the gitignored configs `availauth`, `dms-mercury-3`, `hazmit_dama`, `hub-auth`, `hub-dms`, `npmrds2`,
      `nysdos`, `wcdb-dama` from the built-in folder to `db-configs/`. `dms-sqlite` stays (the server's default
      name; its `../data/dms.sqlite` path is relative to the built-in folder). Test and example configs stay.
- [x] `Dockerfile`: `COPY db-configs`, `ENV DMS_DB_CONFIG_DIRS=/app/db-configs`. `Dockerfile.ssr`: same, from the
      builder stage. `deploy.sh`: `copy_local_files "" db-configs`, so gitignored configs reach the image as the
      built-in folder's always have.
- [x] `deploy/stacks.mjs`: a site's DAMA configs are looked up in both folders (`dbConfigPath`); a stack's
      `server.env` sets `DMS_DB_CONFIG_DIRS=` (empty) and an empty folder is mounted over `/app/db-configs`, so the
      stack still can't open production's databases by name.
- [x] Scripts that read config files by path now use `db-configs/index.cjs` or the server's `loadConfig`:
      chat scripts (`lib.mjs` `loadDbConfig`, `migrate-source-per-channel.mjs`, whose split mode now comes from
      `loadConfig` rather than a stale `legacy` fallback), `planning/shared/skills/auth-ui-check/lib/pg.mjs`,
      mny `actions_alignment/*`, wcdb scripts, transportny `dashboard_a_data.js` (also drops a stale
      `/code/avail/dms-template` path), `data-types/work_zone/load-clear-csv.js`,
      `data-types/external-fetchers/nysdot_estip/resolve_ris.js` (`--config-dir` still overrides),
      `data-types/pm3/tests/run-pool.unit.test.mjs`.

Verified: under both `.env` and `.env-hub`, from the server's cwd, every `DMS_DB_ENV` / `DMS_AUTH_DB_ENV` /
pgEnv name resolves to `db-configs/`, and `findConfigsByRole('dama')` lists both folders. No server boot against
the live databases.

## Not done / known

- **Scripts that open databases through the server's `getDb`** (about 20 one-off MNY / NYDOS scripts under
  `src/themes/*/scripts/`) follow `DMS_DB_CONFIG_DIRS`, so they need `node --env-file=.env <script>` now that
  their configs moved. Without it they fail with the new hint. Not edited one by one.
- `data-types/**/tests/*.integration.js` and dms-server's own tests build paths to `DAMA_TEST_DB` test configs,
  which stay in the built-in folder, so they're unaffected.
- `data-types/pm3/tests/run-pool.unit.test.mjs` "never exceeds either connection pool" fails: `npmrds2`'s config
  has no `max`. Unrelated to the move, since the test finds the file. It fails the same way from the old folder.
- `dms-server/_te.cjs`, `_task_err.cjs` (untracked scratch files) still `require` `./src/db/configs/npmrds2…`.
- **Mercury:** its checkout still keeps its configs in the built-in folder. That keeps working. Moving them there
  is optional and must be a move, not a copy, because a name in both folders stops the server.

## Testing checklist

- [x] `npm run test:config-dirs`; full dms-server `npm test`
- [x] Resolution under `.env` and `.env-hub`
- [ ] `npm run server` / `npm run hub` boot locally (owner)
- [ ] Next mercury deploy: image has `/app/db-configs`, server starts, configs still found
- [ ] Next preview stack: `server.env` has the empty `DMS_DB_CONFIG_DIRS`, logs show only stack configs
