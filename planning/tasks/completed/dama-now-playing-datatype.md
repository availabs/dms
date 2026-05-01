# dama: now_playing dataType plugin

## Objective

Port the standalone ACRCloud webhook receiver (`research/now-playing/`) into a real DMS dataType plugin (`data-types/now_playing/`) that:

1. Exposes a per-stream public webhook URL (no JWT) where ACRCloud POSTs detection JSON.
2. Persists each detection into a DMS split table (`data_items__*`) keyed off a per-stream view.
3. Ships an admin UI in the source's edit view that displays the webhook URL + secret and lets the user regenerate the secret.
4. Re-uses the existing **`Card`** page-section component (in `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx`) bound to the stream's view to render the latest matched track on any DMS page. The Card already supports image columns (`isImg`/`imageSrc`/`imageLocation`), pagination (`pageSize: 1`), sort, and filters — no custom component is built.

The standalone receiver in `research/now-playing/` stays in place during the build as a reference implementation; it gets retired once the plugin is verified end-to-end.

**Naming:** new identifiers use underscores per `CLAUDE.md` "Naming Conventions" — directory is `data-types/now_playing/`, source type is `now_playing_stream`, public route prefix is `/public/dama/:env/now_playing/...`. The user-facing string "now-playing" stays as-is in research notes and existing files (the standalone receiver dir doesn't get renamed).

## Scope

**Included:**
- New plugin under `data-types/now_playing/` (route handlers, normalizer, schema metadata). The webhook receiver is just one of the plugin's routes — no platform changes needed (see "Auth model" below).
- Admin-side helpers to provision a "stream" (creates source + view + per-stream secret) and to display/regenerate that secret.
- A short usage doc showing how to drop the existing **Card** section onto a DMS page, bind it to a stream's view, and configure columns (album cover as image, title/artist/album as text, page size 1, sort by `created_at DESC`, filter `data->>'kind' = 'matched'`).

**Excluded (deferred):**
- Custom page-section component. Use the existing `Card` per the user's preference recorded in `feedback_prefer_existing_components.md`. Revisit only if Card configuration genuinely cannot satisfy the visual requirement.
- Multi-stream UI for managing many ACR projects. Single-stream-per-source is enough for v1.
- Polling fallback (`poll.js` from research/) — keep as a separate research utility; not ported.
- ICY metadata enrichment / cross-check. Mentioned in research.md as future work; not in this task.
- Migration from `research/now-playing/results.jsonl` into the split table (the user will let new detections populate the table going forward; old JSONL is reference-only).

## Current State

### Standalone research receiver (working, in `research/now-playing/`)
- Express server at `webhook.js` with `POST /acrcloud`, `GET /current`, `GET /last`, `GET /health`.
- Shared parser in `normalize.js` — handles both the monitoring webhook envelope (`{ stream_id, stream_url, data: { metadata: { music: [...] } } }`) and the bare ID-API shape.
- Confirmed end-to-end: ACR test payload received 17:45 UTC, first real callback (Bon Iver — *For Emma*) at 17:58 UTC on 2026-04-27 with full ISRC, UPC, Spotify/Deezer/YouTube IDs, and album metadata.
- Callback config in ACR console (project 16608, stream `s-Z0XwkcHp`) currently points at `https://accompanied-adoption-talked-excess.trycloudflare.com/acrcloud?api_key=…`. After this task ships, that URL gets repointed at the dms-server endpoint and the cloudflared tunnel can shift to fronting dms-server (or a real public DNS name).

### dms-server today
- DataType plugin contract (per `_example-hello-world/index.js` and `dama/datatypes/index.js`): each plugin exports `{ workers, routes }`.
- `routes` mount at `/dama-admin/:pgEnv/<name>/` via `mountDatatypeRoutes(app, helpers)` inside `setupAndListen()` (`packages/dms-server/src/index.js:175`).
- JWT middleware (`createJwtMiddleware`, `packages/dms-server/src/auth/jwt.js:77-103`) is **decorative, not enforcing**: missing/bad token → `req.availAuthContext = { user: null }` and `next()`. Never returns 401. Enforcement is per-route — handlers that need auth check `req.availAuthContext.user` and reject themselves. This means **the existing `routes(router, helpers)` mount can already host unauthenticated webhook endpoints** — they just don't reference `req.availAuthContext.user`. No platform changes are required to support webhooks.
- `helpers.createDamaSource()` and `helpers.createDamaView()` provision metadata rows; split tables are auto-created on first write via `ensureForWrite()` (`packages/dms-server/src/db/table-resolver.js`).
- `data_manager.sources.statistics` (JSON column on the source row) is the standard place for per-source config — used here for the webhook secret.

### Frontend component registry
- `registerComponents(compsObj)` lives in `packages/dms/src/patterns/page/components/sections/componentRegistry.js`, re-exported from `@availabs/dms`.
- App registers components in `src/App.jsx` at boot time. Each component config exposes `EditComp`, `ViewComp`, `defaultState`, `controls`. Data flows in via `item`/`dataItems` props from the route configuration — components do **not** call `falcor.get` directly (per `src/dms/CLAUDE.md` "Data Fetching Rules").

## Proposed Changes

### Phase 1 — DROPPED

Originally proposed adding a `publicRoutes` export to the dataType plugin contract, mounted before JWT middleware, on the assumption that JWT middleware blocks unauthenticated requests. **It does not** — `auth/jwt.js:77-103` is decorative-only. Enforcement is per-route. The existing `routes(router, helpers)` mount can host the webhook endpoint directly.

**Auth model (unchanged from original Phase 1):** the now_playing webhook handler validates `?key=<secret>` against `data_manager.sources.statistics.webhook_secret` for the path's `:sourceId`. It never reads `req.availAuthContext.user`. Admin routes in the same plugin (create stream, rotate secret) explicitly check `req.availAuthContext.user` and 401 if `null`, matching the existing convention.

**Cosmetic note:** the webhook URL ends up looking like `/dama-admin/:env/now_playing/streams/:sid/webhook`. The `/dama-admin/` prefix is misleading for a public endpoint but doesn't affect behavior. If desired later, rename the mount prefix from `/dama-admin` to `/dama` as a separate task — out of scope here.

### Phase 2 — `data-types/now_playing/` plugin

```
data-types/now_playing/
├── index.js                  # exports { workers: {}, routes }
├── normalize.js              # copied verbatim from research/now-playing/normalize.js
├── routes.js                 # all routes — admin (auth-checking) + webhook (unauthenticated, validates ?key=)
└── README.md                 # what this is, how to provision a stream + how to wire the Card section
```

All routes mount under `/dama-admin/:pgEnv/now_playing/`. Each route handler decides whether to enforce auth.

**Admin routes (check `req.availAuthContext.user`, 401 if null):**
- `POST /streams` — body `{ name, station_name? }`. Creates `data_manager.sources` row (type: `now_playing_stream`), creates one view, generates `webhook_secret = crypto.randomBytes(16).toString('hex')`, stores it in `sources.statistics.webhook_secret`. Returns `{ source_id, view_id, webhook_url }`.
- `POST /streams/:sourceId/regenerate-secret` — rotates the secret.
- `GET /streams/:sourceId` — returns `{ name, station_name, webhook_url, last_event_at, last_match: {...} }` for the admin edit view. `webhook_url` built from `process.env.DMS_PUBLIC_URL` (fallback to `http://localhost:${PORT}`). `last_match` is a single SELECT against the split table ordered by `created_at DESC LIMIT 1`.

**Webhook routes (unauthenticated — validate `?key=` against the source's stored secret):**
- `POST /streams/:sourceId/webhook?key=<secret>` — single endpoint:
  1. Look up `sources.statistics.webhook_secret` for `:sourceId`. If `key` doesn't match, return 401. (Constant-time compare.)
  2. Run `normalize(req.body)` → array of events.
  3. For each event, INSERT one row into the split table `data_items__s{source_id}_v{view_id}_now_playing`:
     - `app` = the site's app
     - `type` = `now_playing|<view_id>:data` (per the type convention)
     - `data` = the normalized event JSON (kind, title, artist, album, album_cover, ISRC, external IDs, score, raw)
     - `created_by` = `'webhook:now_playing'` (sentinel for non-user writes)
  4. Update `sources.statistics.last_event_at` (in-memory throttled to once/min to avoid write storms).
  5. Return `{ ok: true, events: <count> }`.
- `GET /streams/:sourceId/health?key=<secret>` — sanity ping that proves the URL is wired (returns `{ ok, last_event_at, source_id }`).

**Workers:** none in v1. ACR's webhook rate is ~1 event per ~30s when `send_noresult` is on, far below anything that warrants async batching. Synchronous INSERT in the route handler is correct.

### Phase 3 — Storage & schema

- One **DMS source** per stream: `data_manager.sources` row with `type='now_playing_stream'`, `name=<user-provided>`, `statistics={ webhook_secret, station_name, acr_project_id?, acr_stream_id? }`.
- One **DMS view** per source. Created at the same time as the source. View's `metadata` carries display config (e.g., `{ schema: 'now_playing_detection_v1' }`).
- **Split table** auto-created on first INSERT: `data_items__s{source_id}_v{view_id}_now_playing`. Schema is the standard split-table shape (`id, app, type, data JSON, created_at, created_by, updated_at, updated_by`). All detection-specific fields live in `data` — no custom columns. Querying by recency uses `ORDER BY created_at DESC`; querying for matches uses `WHERE data->>'kind' = 'matched'`.

### Phase 4 — Page wiring (no custom component)

**Decision:** use the existing `Card` page-section component (`src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx`, registered as `name: 'Card', type: 'card'`). It already supports everything we need:

- `useDataSource: true` — bind to the now_playing stream's view via the standard data-source picker in admin
- Per-column `isImg` / `imageSrc` / `imageLocation` controls — render `data.album_cover` as the cover image
- `display.usePagination: true` + `display.pageSize: 1` — show only the latest row
- `controls.columns` lets the user toggle which fields show + their format (`title` / `artist` / `album` rendered as text)
- Filter on `data->>'kind' = 'matched'` via the standard filter UI to skip no-match rows
- Sort by `created_at DESC` via the column sort control

**Recipe (documented in plugin README, no code needed):**
1. Provision a stream via `POST /dama-admin/:env/now_playing/streams` — get back the `view_id`.
2. In the DMS admin, edit a page → add a section → choose **Card**.
3. In the card's data picker, bind to the now_playing stream's view.
4. Configure columns: `title` (text), `artist` (text), `album` (text, italic), `album_cover` (image, set `imageSrc` to that column).
5. Set page size = 1, sort = `created_at desc`, add filter `kind = matched`.
6. Save.

If, after building this, the Card configuration genuinely doesn't satisfy a needed visual treatment (e.g., specific album-art-dominant layout), we revisit and propose a custom component then — not before. (See `feedback_prefer_existing_components.md`.)

### Phase 5 — Wire-up

- `server/register-datatypes.js`: add `registerDatatype('now_playing', require('../data-types/now_playing'));`
- `.env` (or shell): set `DMS_PUBLIC_URL=https://<your-public-host>` so the admin route returns a usable webhook URL. Doc this in `data-types/now_playing/README.md`.
- Admin edit form for `now_playing_stream` sources: re-use the generic source edit form + a simple "Webhook URL" panel that calls `GET /dama-admin/:pgEnv/now_playing/streams/:sourceId`. No custom edit-view template needed for v1.

### Phase 6 — Cutover & retirement of research receiver

1. Deploy dms-server with the new plugin.
2. Use the admin route to provision a stream → get the new webhook URL.
3. Update ACR console (project 16608, stream `s-Z0XwkcHp`) — replace the `trycloudflare.com/acrcloud` URL with the new dms-server URL.
4. Verify a real detection lands in the split table (one row per ACR POST). Cross-check against the standalone receiver (which can run in parallel for a few hours).
5. Stop the standalone webhook + cloudflared tunnel.
6. `research/now-playing/` stays in the repo as a reference; mark its README as "superseded by `data-types/now-playing/`" with a pointer.

## Files Requiring Changes

### dms-server (submodule `src/dms/`)
- **None.** Phase 1 was dropped after confirming `auth/jwt.js:77-103` is decorative-only. The existing dataType `routes` mount is sufficient for unauthenticated webhooks.

### App-owned (outside the submodule)
- `data-types/now_playing/` — new directory (all files listed above).
- `data-types/now_playing/normalize.js` — copy from `research/now-playing/normalize.js` (verified parser, no changes needed).
- `server/register-datatypes.js` — one-line addition (`registerDatatype('now_playing', require('../data-types/now_playing'))`).
- `src/App.jsx` — **no change** (no custom component to register; Card is already in the registry).
- `research/now-playing/README.md` — add "superseded by `data-types/now_playing/`" note (last step, after cutover).

### Planning
- `src/dms/planning/todo.md` — add an entry under `## dama` linking to this file.
- This file (`src/dms/planning/tasks/current/dama-now-playing-datatype.md`) — keep updated as phases complete per planning-rules.md.

## Testing Checklist

### Phase 1 — DROPPED, no testing needed.

### Phase 2 (now_playing plugin)
- [ ] `POST /dama-admin/:env/now_playing/streams` without auth → 401 (handler enforces).
- [ ] `POST /dama-admin/:env/now_playing/streams` with auth → creates source + view + secret, returns valid `webhook_url`.
- [ ] `POST /dama-admin/:env/now_playing/streams/:sid/webhook?key=<wrong>` → 401 (no auth header required; handler validates key only).
- [ ] Same with no `key` at all → 401.
- [ ] Same with correct key + the captured Bon Iver payload from `research/now-playing/raw.jsonl` → 200, one row inserted into the split table with the expected `data` fields.
- [ ] Same with the ACR test payload (`stream_id: "test_stream_id"`) → 200, normalized as `kind: "matched"` (matches research-stage behavior post-fix).
- [ ] Same with the no-result envelope from line #3 of `raw.jsonl` (the real one with `s-Z0XwkcHp`) → 200, normalized as `kind: "no-match"`.
- [ ] Regenerate-secret invalidates the old secret (POST with old key → 401, with new key → 200).

### Phase 4 (page wiring with Card)
- [ ] Configure a Card section per the README recipe → renders the most recent matched track (cover, title, artist, album).
- [ ] Toggling the `kind = matched` filter off shows no-match rows correctly (as expected sanity check, not the default state).
- [ ] After a new detection POSTs to the webhook, refreshing the page shows the new row at the top (live-refresh deferred).

### End-to-end
- [ ] Real ACR webhook (re-pointed at dms-server) writes a row visible in the admin view and on the page component within seconds of the next track change.

## Open Decisions

These are the things I'd like a second look on before implementing:

1. ~~`publicRoutes` path prefix~~ ✓ Resolved: no platform change needed; webhook is a regular route on the existing mount.
2. **Source `type` value** — `now_playing_stream` per the underscore convention. ✓ Resolved.
3. **Secret rotation UX** — auto-regenerate on every save of the source, or require an explicit "rotate" button? Proposing explicit button — accidental rotation breaks the ACR config.
4. **`DMS_PUBLIC_URL` fallback behavior** — if unset, return a `localhost` URL (clearly broken-looking) or refuse to expose the admin route (force config)? Proposing the former + a console warning.
5. **Custom component vs Card** — ✓ Resolved: use the existing Card.
6. **Webhook URL prefix cosmetics** — webhook lives at `/dama-admin/:env/now_playing/streams/:sid/webhook`. The `/dama-admin/` segment is misleading for an unauthenticated public endpoint. Live with it for v1, or split out a separate task to rename the mount prefix to `/dama` (affects all dataTypes; bigger blast radius)?

## Live Test Prerequisites (env state at pause point, 2026-04-28)

The plugin is registered in `server/register-datatypes.js` but the local dms-server (defined by this repo's `.env`) **does not currently load it** because:

1. **`DMS_EXTRA_DATATYPES` is unset** in `/home/alex/code/avail/dms-template/.env`. The `.env.example` line is commented out (`# DMS_EXTRA_DATATYPES=…`). To activate, add:
   ```
   DMS_EXTRA_DATATYPES=/home/alex/code/avail/dms-template/server/register-datatypes.js
   ```
2. **`DMS_PUBLIC_URL` is unset.** The webhook URL returned by `POST /streams` will fall back to `http://localhost:${PORT}` (and log a warning). Set it to whatever public host fronts dms-server (cloudflared tunnel URL, real DNS, etc.):
   ```
   DMS_PUBLIC_URL=https://<your-tunnel-or-host>
   ```
3. **`VITE_API_HOST` points at production** (`https://dmsserver.availabs.org`). Local dev needs `VITE_API_HOST=http://localhost:3001` (or the SPA will hit prod and never see the local plugin). For server-side test only (curl-driven), this doesn't matter.
4. **Active DAMA pgEnv** is `hazmit_dama` (`VITE_DMS_PG_ENVS=hazmit_dama`). Routes mount at `/dama-admin/hazmit_dama/now_playing/...`.

## Standalone Research Receiver — Still Running

At pause time the standalone webhook from `research/now-playing/` is alive in the user's terminals:

- `node webhook.js` (PID 322290 at last check)
- `cloudflared tunnel --url http://localhost:4747` (PID 321088 at last check)
- Cloudflared URL: `https://accompanied-adoption-talked-excess.trycloudflare.com` (rotates on restart)
- ACR console (project 16608, stream `s-Z0XwkcHp`) currently posts to:
  `https://accompanied-adoption-talked-excess.trycloudflare.com/acrcloud?api_key=26510ecf71c419156c3f12dcafb23682`
- 8 real payloads captured in `research/now-playing/raw.jsonl` as of pause (Bon Iver — *For Emma*; Suicide Silence — *No Time to Bleed*; Carnifex — *Innocence Died Screaming*; plus 4 no-match ticks and 1 ACR test payload). Use these for offline parser testing without re-tunneling.

Cutover at Phase 6: re-point ACR's callback URL → kill `webhook.js` + `cloudflared` → mark `research/now-playing/README.md` superseded.

## Live Test Recipe (Phase 6 detail)

Once the env vars above are set and dms-server is restarted:

```bash
# 1. Provision a stream (need an admin JWT in $JWT)
curl -X POST -H "Authorization: $JWT" -H 'Content-Type: application/json' \
  -d '{"name":"WCDB FM","station_name":"WCDB FM","acr_project_id":16608,"acr_stream_id":"s-Z0XwkcHp"}' \
  http://localhost:3001/dama-admin/hazmit_dama/now_playing/streams

# Returns: { source_id, view_id, data_table, webhook_url }

# 2. Sanity-check the webhook URL with the captured Bon Iver payload
curl -X POST -H 'Content-Type: application/json' \
  --data @<(node -e 'const fs=require("fs"); const r=fs.readFileSync("research/now-playing/raw.jsonl","utf8").trim().split("\n").map(JSON.parse); console.log(JSON.stringify(r[3].body))') \
  "<webhook_url from step 1>"
# → {"ok":true,"events":1}

# 3. Verify the row landed
psql <hazmit_dama_conn> -c 'SELECT id, kind, title, artist_name, album FROM gis_datasets.s<source_id>_v<view_id> ORDER BY id DESC LIMIT 5;'

# 4. Update ACR console (project 16608) to use the new webhook_url, kill standalone receiver.
```

## Smoke Test Script

The Phase 2 verification used this one-liner against the captured payloads:

```bash
cd /home/alex/code/avail/dms-template && node -e '
const { normalize } = require("./data-types/now_playing/normalize");
const { eventToInsertParams, INSERT_COLUMNS, buildCreateTableSQL } = require("./data-types/now_playing/schema");
const fs = require("fs");
const raws = fs.readFileSync("research/now-playing/raw.jsonl","utf8").trim().split("\n").map(JSON.parse);
raws.forEach((entry, i) => {
  const events = normalize(entry.body);
  events.forEach(e => console.log(`#${i+1}  kind=${e.kind}  ${e.artist_name||"-"} — ${e.title||"-"}`));
});
const samp = normalize(raws.find(r => r.body?.data?.metadata?.music?.[0]).body)[0];
console.log(`columns=${INSERT_COLUMNS.length}  params=${eventToInsertParams(samp).length}`);
'
```

Useful for regression-checking the parser if ACR's payload shape ever drifts.

## Reference Notes (codebase facts surfaced during this work)

- **JWT middleware** (`packages/dms-server/src/auth/jwt.js:77-103`) is decorative — sets `req.availAuthContext = { user: <user>|null }` and always calls `next()`. No 401 emitted. Per-route enforcement.
- **User object shape**: `{ id, email, authLevel, token, project, groups, meta, authed }`. Use `req.availAuthContext.user.id` as `user_id` when calling `createDamaSource` / `createDamaView`.
- **Body parser**: `express.json({ limit: '500mb' })` mounted globally at `packages/dms-server/src/index.js:36`. No per-route parser needed.
- **DataType mount**: `mountDatatypeRoutes(app, helpers)` mounts each plugin's `routes(router, helpers)` at `/dama-admin/:pgEnv/<name>/` with `mergeParams: true` so `req.params.pgEnv` is available.
- **`createDamaView` table naming**: writes `table_schema = 'gis_datasets'`, `table_name = 's{source_id}_v{view_id}'`, `data_table = 'gis_datasets.s{src}_v{view}'`. Plugin is responsible for the actual `CREATE TABLE` (the helper only sets metadata pointers). For now_playing this is `buildCreateTableSQL(view.data_table)` in `schema.js`.
- **`createDamaSource` JSON serialization**: pass `statistics`/`metadata`/`categories` as JS objects; the helper handles `JSON.stringify` (node-postgres' array literal serialization would otherwise break the JSONB cast).
- **UDA reads both DAMA and DMS tables.** The `dataWrapper → getData → buildUdaConfig` chain that the Card section uses is not DAMA-specific — the unified UDA layer means a future variant of the now_playing dataType could write to a DMS split table instead and the Card binding would still work without changes. DAMA-style was chosen for v1 because the metadata helpers (`createDamaSource`/`createDamaView`) are already there; the route shape isn't coupled to the storage choice.
- **ACR console gotchas surfaced during research-phase wiring** (worth keeping in mind when ACR adds more streams):
  - Result Callback URL is configured at the **project** level, not the stream level. Look for "Settings" / gear icon on the project itself.
  - Callback URL must include the full path (`.../webhook?key=...`) — bare host returns 404.
  - When the URL is saved, ACR fires a **synthetic test payload** (`stream_id: "test_stream_id"`, `acrid: "test_acrid"`, timestamp `2100-01-01`). Treat any single-event burst right after a save as a verification ping, not a real detection.
  - `result_callback_send_noresult` may revert when the URL is re-saved — re-check after each callback config change.
  - Real callbacks resume 1–5 minutes after a config save.

## Status

- [x] Phase 1 — dms-server publicRoutes capability — **DROPPED** (JWT middleware is decorative-only; no platform change needed)
- [x] Phase 2 — now_playing plugin (admin + webhook routes on the existing mount) — **CODE LANDED**, smoke tests against captured real-world payloads pass; live end-to-end test still pending (requires the user to enable `DMS_EXTRA_DATATYPES`, restart dms-server, provision a stream, and re-point ACR).
  - Files: `data-types/now_playing/{index.js,routes.js,schema.js,normalize.js,README.md}` + `server/register-datatypes.js` line.
  - Schema widened from initial proposal at user request (preserve maximal info from each ACR call): structured `artists`/`genres`/`external_metadata`/`external_ids`/`contributors`/`mood`/`lyrics` as JSONB; queryable scalars (title, artist_name, album, IDs, scoring, timing offsets) as their own columns; `raw` JSONB still stores the full untouched payload as catchall.
  - Postgres-only for v1 (501 on sqlite). Documented in README.
- [x] Phase 3 — storage/schema — folded into Phase 2 (one schema.js helper, postgres-first).
- [ ] Phase 4 — page wiring with the existing Card section (docs only, no component code) — NOT STARTED
- [ ] Phase 5 — wire-up (register-datatypes, env) — NOT STARTED
- [ ] Phase 6 — cutover + retire research receiver — NOT STARTED
