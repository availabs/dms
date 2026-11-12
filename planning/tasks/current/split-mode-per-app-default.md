# Split mode: per-app is the default, legacy must be configured

**Initiatives:** [plat_tenant_hub](../../../../../planning/initiatives/plat_tenant_hub.md) · **Status:** built · **Release:** commit — library change; the deploy that carries it needs the config audit below · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

A dms-server database config that says nothing about `splitMode` runs in **per-app** mode (each app in
its own `dms_<app>` schema on Postgres, `data_items__<app>` prefix on SQLite). A database that still
keeps every app in the shared `data_items` table has to say so: `"splitMode": "legacy"` in its config,
or `DMS_SPLIT_MODE=legacy` for a config that is silent. The mode is resolved in ONE place and an
invalid value fails at config load, like a missing `type` or `role` does.

## Why now

Filed 2026-11-10 after `npm run hub` (the local tenant-hub server, `.env-hub`) came up against the hub
database with a `hub-dms.config.json` that omitted `splitMode`. The server silently read the empty
legacy `dms.data_items`, found no `hub+test:site` row, and the admin redirected `/list` to
`/list/create` as if the site did not exist. The row was in `dms_hub.data_items` all along. Every new
database since the per-app layout landed is per-app (every example and test config, mercury's
`dms-mercury-3`, the hub), so the legacy default is the wrong guess for every database made today, and
it fails quietly: an empty site instead of an error.

## Scope

- In: the default and its single resolution point; validation; the fourteen call sites that each
  re-derived the mode; the startup log line; docs (`dms-server/CLAUDE.md`, `documentation/dms-server-env.md`,
  dms-template `.env.example`); the one test config that relies on legacy; a test for the rule.
- Out: migrating any legacy database to per-app (`scripts/migrate-site.js` already does that per site);
  the client, which never sees the mode; removing legacy mode.

## Current state (before)

The chain `options.splitMode > config.splitMode > process.env.DMS_SPLIT_MODE > 'legacy'` is spelled out
by hand at each of these points, with three variants (some skip the env var, two pass a bare
`config.splitMode` and lean on the resolver's own `= 'legacy'` parameter default):

| File | Line | Form |
|---|---|---|
| `src/routes/dms/dms.controller.js` | 89 | full chain (`options` override for tests) |
| `src/routes/auth/formats.js` | 60 | config → env → legacy |
| `src/routes/auth/owners.js` | 44–46 | config → env → legacy, with a catch |
| `src/routes/uda/uda.tasks.controller.js` | 268 | config → env → legacy |
| `src/routes/uda/utils.js` (`dmsMainTable`) | 13 | arg → env → legacy |
| `src/dama/mirror.js` (`splitModeOf`) | 54 | config → env → legacy, with a catch |
| `src/db/table-resolver.js` | 165, 294, 356 | parameter default `'legacy'` |
| `src/scripts/delete-source.js` | 52 | config → env → legacy |
| `src/scripts/backfill-view-pattern.js` | 92 | config → env → legacy |
| `src/scripts/prune-unreachable-tables.js` | 51 | config → env → legacy |
| `src/scripts/reconcile-pgenv-mirror.js` | 48 | config → env → legacy |
| `src/scripts/deprecate-internal-dataset.js` | 130 | config → legacy (no env) |
| `src/scripts/migrate-site.js` | 115, 519 | config → legacy (no env) |
| `src/scripts/sweep-site-grants.js` | 74 | bare `config.splitMode` |
| `src/scripts/convert-grant-vocabulary.js` | 182, 208 | bare `config.splitMode` |
| `src/index.js` | 397 | startup log prints the env var or "legacy (default)" |

`loadConfig` (`src/db/config.js`) validates `type`, `role`, `readOnly` and never looks at `splitMode`.

Configs in this checkout with role `dms`: `dms-mercury-3`, `dms-sqlite`, `hub-dms` (fixed by hand on
2026-11-10), every `*-test*` and `*.example` config are all `per-app`. Only `migrate-test-src` omits
it, and it means legacy: `tests/test-migrate-site.js` builds a legacy-layout source and migrates it
into the per-app `migrate-test-tgt`.

## Proposed change

1. **`src/db/table-resolver.js`** owns the vocabulary: `SPLIT_MODES = ['legacy', 'per-app']`,
   `DEFAULT_SPLIT_MODE = 'per-app'`, and `resolveSplitMode(config, name)` =
   `config.splitMode || process.env.DMS_SPLIT_MODE || DEFAULT_SPLIT_MODE`, throwing on any other value.
   The three parameter defaults become `DEFAULT_SPLIT_MODE`.
2. **`src/db/config.js` `loadConfig`** stamps `config.splitMode = resolveSplitMode(config, envName)`,
   so every config object a caller holds carries a valid, resolved mode. An invalid `splitMode` (or
   `DMS_SPLIT_MODE`) throws at load, next to the `type` / `role` checks.
3. **Every call site** reads `config.splitMode` and drops its own chain. The two fallbacks that catch a
   failing `loadConfig` (`owners.js`, `mirror.js`) fall back to `resolveSplitMode()` (env or default),
   never to a literal. `dmsMainTable`'s missing-argument fallback does the same.
4. **`src/index.js`** logs the resolved mode of `DMS_DB_ENV`'s config instead of the env var.
5. **`migrate-test-src.config.json`** says `"splitMode": "legacy"` explicitly.
6. **Docs:** the Split Mode section and the `splitMode` field row in `dms-server/CLAUDE.md`, the
   `DMS_SPLIT_MODE` row in `documentation/dms-server-env.md`, the comment in dms-template `.env.example`.
7. **Test** `tests/test-split-mode.js` (in `npm test`): default is per-app; config `legacy` honoured;
   env honoured when the config is silent and beaten by the config; invalid value throws from
   `resolveSplitMode` and from `loadConfig`; a config file with no `splitMode` loads as per-app;
   `resolveTable` with no mode argument lands in `dms_<app>`.

### Design note: why stamp in `loadConfig` rather than a helper at each site

Fourteen sites each remembering the chain is how three variants appeared. A config object that always
carries the answer leaves nothing to remember, and the scripts that already used bare `config.splitMode`
(`sweep-site-grants`, `convert-grant-vocabulary`) become correct without an edit.

## Rollout risk — read before deploying

The default flips for any **deployed** config with role `dms` that omits `splitMode` AND whose database
is in the legacy layout. Such a server would, after deploy, read empty `dms_<app>` schemas: every site
looks brand new (the `/list` → `/list/create` redirect from the hub incident, for every tenant). Before
the server deploy that carries this:

- [ ] Check the config files mounted into each live container (mercury `dms-server`'s configs dir, the
      hub's `$H/configs`, any preview stack) for a `"role": "dms"` config with no `splitMode`. Add
      `"splitMode": "legacy"` where the database is legacy, `"per-app"` where it is per-app (the
      runbook says both `hub-dms` and `dms-mercury-3` are per-app already).
- [ ] The startup log line now prints the resolved mode for `DMS_DB_ENV`'s config: confirm it after the
      deploy's first boot.

## Files requiring changes — DONE 2026-11-10

- [x] `src/db/table-resolver.js` — vocabulary, `resolveSplitMode`, parameter defaults, exports
- [x] `src/db/config.js` — stamp + validate in `loadConfig`, export passthrough
- [x] `src/routes/dms/dms.controller.js`, `src/routes/auth/formats.js`, `src/routes/auth/owners.js`,
      `src/routes/uda/uda.tasks.controller.js`, `src/routes/uda/utils.js`, `src/dama/mirror.js`
- [x] `src/scripts/delete-source.js`, `backfill-view-pattern.js`, `prune-unreachable-tables.js`,
      `reconcile-pgenv-mirror.js`, `deprecate-internal-dataset.js`, `migrate-site.js`
- [x] `src/index.js` — startup log
- [x] `src/db/configs/migrate-test-src.config.json` — explicit legacy
- [x] `tests/test-split-mode.js` (new) + `package.json` test chain
- [x] `CLAUDE.md` (dms-server), `../../documentation/dms-server-env.md`, dms-template `.env.example`

## Testing checklist

- [x] `node tests/test-split-mode.js` passes — 14/14
- [x] `npm test` (dms-server): every suite passes except one pre-existing `test-formats` case, "the script without --file runs the client emitter": `packages/dms/scripts/emit-formats.mjs` fails to build because `admin.format.js` imports `TenantList` from a component module the emitter stubs (not a split-mode path). `test-migrate-site` and `test-table-splitting` are NOT in `npm test` and were already failing before this change (both last touched 2026-03-21): the migrate test reads the shared `data_items` from a target that has been per-app since then (its rows land in `data_items__migrate_test`), and the splitting test expects `data_items__adamtest1_v1` where the resolver now names `data_items__adamtest1_vv1`, with `legacy` passed explicitly. Both need their own fix; filed here so nobody blames this task.
- [x] `npm run hub` with `splitMode` removed from `hub-dms.config.json` finds `hub+test:site` (the
      incident that filed this) — `length: 1`; the key is left out of the local config on purpose
- [x] Startup log prints `Split mode: per-app (hub-dms; per-app unless the config or DMS_SPLIT_MODE says legacy)`

## Log

- 2026-11-10 — filed and built in one session: resolver vocabulary + `resolveSplitMode`, `loadConfig` stamps and validates, 14 call sites read `config.splitMode`, startup log, explicit legacy on `migrate-test-src`, docs, `tests/test-split-mode.js` in `npm test`. Not committed; the server deploy that carries it must do the config audit under "Rollout risk" first.
