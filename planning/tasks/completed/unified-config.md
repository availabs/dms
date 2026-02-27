# Unified Project Configuration

## Objective

Consolidate the scattered configuration (hardcoded arrays in `App.jsx`, dms-server `.env`, SSR CLI env vars) into a single `.env` file at the project root. Both the Vite client and dms-server read from the same file, eliminating the need to keep multiple config sources in sync.

## Current State — Config Is in Three Places

### 1. Hardcoded in `src/App.jsx`

```javascript
const API_HOST = [
  'https://graph.availabs.org',
  'http://localhost:3001',
  'http://localhost:4444'
]
const sites = [
  { app: 'avail', type: 'site' },       // [0]
  { app: 'mitigat-ny-prod', type: 'prod' }, // [1]
  ...
]
// Switching sites = changing array indexes:
adminConfig[0]({ ...sites[4], baseUrl: '/list', authPath: '/auth' })
API_HOST[0]
pgEnvs={ ["npmrds2"] }  // also duplicated pgEnvs prop
```

Problems:
- Switching sites requires editing source code (change `sites[4]` to `sites[0]`)
- `API_HOST` selection by array index is opaque
- `pgEnvs` is duplicated (appears twice with different values)
- None of this is shared with dms-server or SSR

### 2. `src/dms/packages/dms-server/.env`

```
PORT=3001
DMS_DB_ENV=dms-mercury
DMS_AUTH_DB_ENV=availauth
DMS_LOG_REQUESTS=1
JWT_SECRET=yo-la-tengo
```

This is the server's own `.env` — loaded via `--env-file-if-exists=.env` in package.json scripts. Not visible to the Vite client at all.

### 3. SSR CLI env vars (passed on command line)

```bash
DMS_SSR=1 DMS_APP=avail DMS_TYPE=site npm run dev
```

`DMS_APP`, `DMS_TYPE`, `DMS_BASE_URL`, `DMS_AUTH_PATH`, `DMS_PG_ENVS` must be set manually on the command line for SSR. These overlap with what's hardcoded in `App.jsx`.

## Proposed Solution — Single `.env` at Project Root

A `.env` file in the project root with two sections:

1. **Client vars** (`VITE_*`) — Vite automatically exposes these via `import.meta.env.VITE_*`
2. **Server vars** — dms-server loads these too (update its scripts to point at the root `.env`)

### `.env` file (project root)

```env
# ─── Site Configuration ───────────────────────────────
# These configure which DMS site to load (used by both client and server)
VITE_DMS_APP=avail
VITE_DMS_TYPE=site
VITE_DMS_BASE_URL=/list
VITE_DMS_AUTH_PATH=/auth
VITE_DMS_PG_ENVS=npmrds2

# ─── API Hosts ────────────────────────────────────────
VITE_API_HOST=https://graph.availabs.org

# ─── Server ───────────────────────────────────────────
PORT=3001
DMS_DB_ENV=dms-sqlite
DMS_AUTH_DB_ENV=dms-sqlite
DMS_LOG_REQUESTS=0
JWT_SECRET=

# ─── SSR (set DMS_SSR=1 to enable) ───────────────────
# DMS_SSR=1

# ─── SMTP (optional) ─────────────────────────────────
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASS=
# SMTP_FROM=
# SMTP_SECURE=false
```

### How each side reads it

**Vite (client + SSR dev):** Vite loads `.env` from project root automatically. `VITE_*` vars appear as `import.meta.env.VITE_DMS_APP`, etc. Non-`VITE_` vars are ignored by Vite (never leak to client bundle).

**dms-server:** Update its npm scripts from `--env-file-if-exists=.env` to `--env-file-if-exists=../../../../.env --env-file-if-exists=.env`. The root `.env` loads first, the server's own `.env` (if it exists) can override. Alternatively, the server scripts could just point at the root `.env`.

**SSR in dms-server:** SSR config (`DMS_APP`, `DMS_TYPE`, etc.) comes from the same `.env`. No more passing env vars on the command line. The server reads `VITE_DMS_APP` and maps it to its internal config (or we add non-prefixed aliases like `DMS_APP` that default to the `VITE_*` value).

## Implementation Steps

### Step 1: Create root `.env` and `.env.example` — DONE

- [x] Create `.env.example` at project root with all variables documented (12 variables across 5 sections)
- [x] Create `.env` at project root with dev defaults matching previous `App.jsx` hardcoded values (`asm`/`nhomb`)
- [x] Add `.env` to `.gitignore`

### Step 2: Update `src/App.jsx` to read from `import.meta.env` — DONE

- [x] Replace hardcoded `API_HOST` array with `import.meta.env.VITE_API_HOST || 'https://graph.availabs.org'`
- [x] Replace hardcoded `sites` array + index with `{ app: import.meta.env.VITE_DMS_APP, type: import.meta.env.VITE_DMS_TYPE }`
- [x] Replace hardcoded `pgEnvs` with `(import.meta.env.VITE_DMS_PG_ENVS || '').split(',').filter(Boolean)`
- [x] Read `baseUrl` and `authPath` from env with defaults
- [x] Remove the unused duplicate `pgEnvs` prop — was listed twice, now a single `PG_ENVS` const
- [x] Verified: `vite build` bakes `.env` values into the bundle (confirmed `asm`, `nhomb` in output)

### Step 3: Update dms-server to load root `.env` — DONE

- [x] Update `package.json` start/dev scripts: `--env-file-if-exists=../../../../.env --env-file-if-exists=.env`
- [x] In SSR config block (`index.js`): `DMS_APP || VITE_DMS_APP`, `DMS_TYPE || VITE_DMS_TYPE`, etc.
- [x] Server `.env` still works as optional override (loaded second, takes precedence)

### Step 4: Update `src/entry-ssr.jsx` if needed — DONE (no changes needed)

- [x] Verified: `entry-ssr.jsx` receives all config from `dms-server/index.js` via `handlerConfig` — no env reads of its own

### Step 5: Update README and `.env.example` — DONE

- [x] README rewritten with `.env` as the primary config mechanism, `cp .env.example .env` in quick start
- [x] Full variable table with defaults, used-by column, descriptions
- [x] SSR section updated — shows `.env`-based workflow instead of CLI env vars
- [x] dms-server `.env.example` updated to explain it's an override file, points to root `.env`

## Files Summary

| File | Action | What |
|------|--------|------|
| `.env.example` | Create | Documented template with all variables |
| `.env` | Create | Dev defaults (gitignored) |
| `.gitignore` | Modify | Ensure `.env` is listed |
| `src/App.jsx` | Modify | Read config from `import.meta.env` instead of hardcoded arrays |
| `dms-server/package.json` | Modify | Point `--env-file-if-exists` at root `.env` |
| `dms-server/src/index.js` | Modify | SSR config falls back to `VITE_*` vars |
| `README.md` | Modify | Document `.env` setup |

## Key Decisions

1. **`VITE_` prefix for shared vars**: Vite requires the `VITE_` prefix to expose vars to client code. Server code can read them too (they're just env vars). For server-only vars like `JWT_SECRET`, no prefix — Vite ignores them.
2. **Root `.env` + optional server `.env`**: The root file has the shared config. The server can still have its own `.env` for database-specific overrides that don't belong in the root file.
3. **No new dependencies**: Vite loads `.env` natively. Node 20+ has `--env-file-if-exists`. No `dotenv` needed.
4. **Backward compatible**: If `.env` doesn't exist, everything falls back to current defaults. The `sites` array in `App.jsx` can be kept as a comment for reference.

## Testing

- [x] Production build picks up `VITE_*` vars at build time (verified: `asm`, `nhomb` baked into bundle)
- [ ] `npm run dev` works with only `.env` configured (no code changes needed for site selection)
- [ ] Changing `VITE_DMS_APP`/`VITE_DMS_TYPE` in `.env` switches the site on next dev server restart
- [ ] dms-server reads `PORT`, `DMS_DB_ENV`, etc. from root `.env`
- [ ] SSR reads site config from `.env` without CLI env vars
- [ ] Missing `.env` falls back to defaults (no crash)
