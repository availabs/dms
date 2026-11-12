# Tenant Subdomain Uniqueness

**Initiatives:** [tes_self_service_signup](../../../../../planning/initiatives/tes_self_service_signup.md) · **Status:** built (tenant delete, 2026-11-11, branch `tenant-domains`, uncommitted); Error Display issue still open · **Created by:** ssangdod@albany.edu · **Edited by:** amuro@albany.edu, ssangdod@albany.edu

## Objective

Prevent duplicate subdomains when tenants are created via either entry point: the platform admin `/list` page (`TenantList`) or the self-serve signup page (`AuthSignup`). Currently neither enforces uniqueness reliably, which leads to two tenants silently sharing the same `app` namespace.

---

## Root Cause Analysis

### Two creation paths, two gaps

**Path 1 — `TenantList.addTenant()` (`editSite.jsx:520-524`)**
```js
const existingSlugs = value.map(v => v.subdomain).filter(Boolean);
if (existingSlugs.includes(slug)) { setError(...); return; }
```
- Checks only the `value` prop loaded at page mount — stale if another tenant was added since then.
- No server-side enforcement; two admins in different browsers both pass this simultaneously.

**Path 2 — `AuthSignup.handleTenantSignup()` (`authSignup.jsx:57-59`)**
```js
const subdomainError = validateSubdomain(slug);
if (subdomainError) { setStatus(subdomainError); return; }
```
- Validates format and reserved words only — **no existence check at all**.
- The auth setup error `"duplicate key value violates unique constraint"` is explicitly swallowed at line 75:
  ```js
  if (setupRes.error && setupRes.error !== 'duplicate key value violates unique constraint "groups_pkey"') { throw ... }
  ```
  So even if the auth project already exists (identical subdomain), provisioning continues and creates a duplicate tenant row + tenant site.

### Downstream impact of duplicates

- `dmsSiteFactory` uses `siteData[0].tenants.find(t => t.subdomain === currentSubdomain)` — `Array.find` returns the first match; the second tenant is silently unreachable.
- In `per-app` split mode: both tenants write to the same `dms_<slug>` schema — data overwrites and corruption.
- In legacy mode: same `app` column value — all data shared indiscriminately across "isolated" tenants.

---

## Files Changed

| File | Change |
|---|---|
| `packages/dms-server/src/routes/dms/dms.controller.js` | Server-side guard in `createData` when kind is `tenant` |
| `packages/dms/src/patterns/auth/pages/authSignup.jsx` | `siteKey` declaration restored in step 3 |
| `packages/dms/src/patterns/admin/pages/editSite.jsx` | Kept simple in-memory check; client-side re-fetch removed |

---

## Phases

### Phase 1 — Server-side guard (validation + uniqueness) — COMPLETE

**File:** `packages/dms-server/src/routes/dms/dms.controller.js`, inside `createData` (around line 836)

After `const [app, type, data = {}] = args;`, before the `beginTransaction`:

```js
if (getKind(type) === 'tenant') {
  const slug = data?.subdomain || getInstance(type);

  if (!slug) {
    throw new Error('Tenant subdomain is required');
  }
  if (!/^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$/.test(slug)) {
    throw new Error(`Invalid subdomain format: "${slug}"`);
  }
  const existing = await dms_db.promise(
    `SELECT COUNT(*) AS cnt FROM ${resolved.fullName}
     WHERE app = $1 AND type LIKE $2 AND ${jsonField('data', 'subdomain')} = $3`,
    [app, '%:tenant', slug]
  );
  if (Number(existing[0]?.cnt) > 0) {
    throw new Error(`Subdomain "${slug}" is already in use by another tenant`);
  }
}
```

Notes:
- `resolved` comes from `ensureForWrite` which already runs above.
- `jsonField` is a scoped helper already used in `dms.controller.js`.
- `getInstance` and `getKind` are from `db/type-utils.js`, already imported.
- The `!slug` guard catches unauthenticated calls with `data={}` (the route has no auth check).
- This is the only reliable gate — catches both creation paths and race conditions.

**Testing:**
- [x] Call with kind=tenant and `data={}` → "Tenant subdomain is required"
- [x] Call with a slug that already exists → uniqueness error
- [x] Call with a valid new slug → row created normally
- [ ] Call with `data={subdomain:"UPPERCASE"}` → format error (not explicitly tested)
- [ ] Non-tenant row creation is unaffected (not explicitly tested)

---

### Phase 2 — Signup pre-flight check — REMOVED

A pre-flight check was implemented that used `falcor.get` to read master site tenants before the `/init/setup` call, then compared subdomains. This was then removed because:

- `falcor.get()` returns cached data without hitting the server if the path is already populated.
- There is no cache invalidation after tenant creation, so the pre-flight always checks a potentially stale list.
- No cache invalidation strategy was added, making the check unreliable for preventing race conditions.

**The server guard (Phase 1) is the authoritative gate.** The signup path surfaces the server error through the outer `catch` block → `setStatus(err.message)`.

**Known issue:** When the server guard rejects a duplicate, the error reaches the client as `new Error({ error: "..." })` (via avl-falcor's XHR error handler), which sets `err.message = "[object Object]"` instead of the actual error string. Fixing this requires either changing `avl-falcor/src/falcor-http-datasource/src/request.js` (node_modules — not acceptable) or changing `falcor-express/src/index.js` to send a plain string instead of `{ error: "..." }` (reverted — too broad an impact on existing code). This remains an open issue.

---

### Phase 3 — TenantList: re-fetch before create — REMOVED

A re-fetch block was implemented that fetched current tenant data from the server before the in-memory uniqueness check. This was then removed for the same reason as Phase 2:

- `falcor.get()` returns cached data; no cache invalidation was added.
- The re-fetch would return the same stale list as the in-memory prop.

The existing in-memory check against `value` (the list loaded at page mount) was restored:

```js
const existingSlugs = value.map(v => v.subdomain).filter(Boolean);
if (existingSlugs.includes(slug)) {
    setError(`A tenant with subdomain "${slug}" already exists`);
    return;
}
```

This catches the trivial same-session duplicate case. The server guard catches everything else.

---

### `siteKey` fix — COMPLETE

When the Phase 2 pre-flight block was removed from `authSignup.jsx`, the `const siteKey = ...` declaration that had been moved into that block was also removed. But `siteKey` is still used in step 3 of the provisioning chain. It has been restored at the top of step 3:

```js
// 3. Append tenant ref to master site's tenants array
const siteKey = `${masterApp}+${siteInstance}:site`;
await falcor.get(['dms', 'data', siteKey, 'byIndex', [0], ['id', 'data']]);
```

---

## Open Issue: Error Display

When the server guard rejects with a duplicate subdomain error, the client shows `[object Object]` instead of the actual message.

**Root cause chain:**
1. `dms.controller.js` throws `new Error('Subdomain "x" is already in use by another tenant')`
2. `falcor-express` catches it, sends `res.status(500).json({ error: message })` — a JSON object
3. `avl-falcor/src/falcor-http-datasource/src/request.js` receives the 500 response with `responseData = { error: "..." }` and calls `new Error({ error: "..." })`
4. JavaScript's `new Error(object)` calls `String(object)` → `"[object Object]"`. The original message is lost.
5. The catch block reads `err.message` → `"[object Object]"`

**Resolution options:**
- Change `falcor-express` to send a plain string: `res.status(500).send(message)` — reverted; too broad an impact
- Change `avl-falcor/request.js` to attach `.error` on the Error object — node_modules, not acceptable
- Change server to return a Falcor error atom (200 response with `$type: 'error'`) — requires route + client changes

This remains unresolved.

---

## Open Issue: Removed tenants permanently burn their subdomain (flagged 2026-09-23, not fixed)

`/list` "Remove tenant" (`editSite.jsx` TenantList delete modal) only drops the ref from the master
site's `tenants` array. Left behind: the `main|<slug>:tenant` row in the master app, the tenant app's
site/patterns/pages (and `dms_<slug>` schema in per-app mode), and the auth project + `<slug> Admin/Public`
groups + memberships.

Consequences:
- Old subdomain shows `Tenant "<slug>" not found` (`dmsSiteFactory.jsx` only searches the `tenants` refs).
- Re-creating the same subdomain (signup or `/list`) passes the client check, then fails at
  `POST /init/setup` with `Project "<slug>" is already initialized.` (`auth.js` initSetup). If that were
  bypassed, the Phase 1 server guard would still reject it, because it counts the orphaned `:tenant` row.
- No UI to restore or purge; the name is gone for good.

Decision needed: "remove" = **suspend** (relabel + add restore) vs **delete** (new server endpoint to drop
tenant row + auth project/group links, optional tenant-data purge). Traced from code, not live-reproduced.

### Decision (owner, 2026-11-11): DELETE, data erased, backup first — BUILT

- **Server** `dms-server/src/routes/tenants/` (mounted in multi-tenant mode, `index.js`):
  - `POST /tenants/:tenant/delete/plan` — read-only: what goes (schema + table count, tenant rows, linked or
    not, the groups deleted / kept, membership count).
  - `POST /tenants/:tenant/delete { confirm }` — `confirm` must be the subdomain; no preview flag (the
    package rule for destructive routes). Hub staff only: `manage-tenants` on the hub site row, judged in the
    route whatever DMS_AUTH_MODE says. One delete at a time.
  - `delete.js`, in order, each step idempotent (a failed run is repeated and finishes):
    1. **backup** to `DMS_TENANT_BACKUP_DIR` (default `dms-server/var/tenant-backups`) `/<app>-<ts>/`: every
       table of `dms_<app>` and the app's rows in `dms.change_log`, `dms.page_visits`, `dms.formats`,
       `dms.data_items`, as gzipped `COPY` text (pg-copy-streams; no pg_dump in the image), plus `manifest.json`
       (columns, row counts, the hub rows, all auth rows). Nothing is deleted if it fails.
    2. **auth db** (one transaction): `user_preferences`, `messages_new` (plain FKs to `projects`, they block
       its delete), `signup_requests`, `groups_in_projects` of the project; every group linked to the project
       and to NO other project, plus `<app> Admin` / `<app> Public` by name (initSetup re-uses an existing
       group, so a stale one would hand the old members to a new tenant), with their memberships; the
       project. Kept: user accounts, `logins`, groups shared with other projects (mny: AVAIL, the county
       groups).
    3. **dms db** (one `withTransaction`): the shared rows above, then `DROP SCHEMA dms_<app> CASCADE`.
    4. **hub** (last, so the tenant stays listed and deletable until the rest is gone): the ref leaves the site's
       `tenants` and the `:tenant` row(s) are deleted, through the controller (change_log + broadcast).
    Then: table-resolver, owners-snapshot and formats caches cleared; the domains store reloads (and with it the
    SSR route cache).
  - Refuses: not per-app Postgres; a subdomain that is no slug; no tenant row (linked OR unlinked: a tenant
    removed the old way can be deleted); rows naming several apps; the hub's own app/schema; another tenant
    on the same schema.
  - **Not touched: `dms.yjs_states`.** It is keyed by item id alone and per-app sequences give every app the
    same small ids, so a tenant's ids also name other apps' items. The first rig run deleted 2 such rows
    (items 4 and 5, last written 11-08, before the test tenant existed); restored from that run's backup, and
    the delete no longer touches the table. **Open bug, separate:** the same collision makes two apps with
    the same item id share a sync room and its stored Yjs state (`routes/sync/ws.js` rooms / `yjs_states` by
    `itemId`). Filed: [sync-rooms-cross-app-item-id-collision.md](./sync-rooms-cross-app-item-id-collision.md); its
    last step puts this delete's `yjs_states` cleanup back, keyed by `(app, item_id)`.
- **Backup folder always set:** the default is `dms-server/var/tenant-backups` (on the live hub that is the
  `dms-hub-var` volume); the hub runbook (`planning/shared/tasks/completed/tenant-hub-server.md` steps 8 and 10)
  now sets `DMS_TENANT_BACKUP_DIR=/tenant-backups` with `-v $H/tenant-backups:/tenant-backups`. The server logs
  the folder at start (`[tenants] delete backups → …`) and warns when it can't write there; a delete then
  refuses, since the backup step fails first.
- **Client** `patterns/admin/components/tenantList.jsx`: the row's trash button opens `DeleteTenantModal`
  (the plan as a list, "Type <sub> to confirm", Delete disabled until it matches, the server's error shown);
  on success the page's list drops the tenant (the server already saved the site row). Note under the table
  reworded. Theme keys `deletePlanList` / `deletePlanItem` (`editSite.theme.js`). The overview's "danger zone"
  (mockup) is not built; the delete lives on the Tenants table.
- **Env:** `DMS_TENANT_BACKUP_DIR` in `documentation/dms-server-env.md` and `.env.example`.
- **Rig check (2026-11-11, `scratchpad/tenant-hub/tenant-delete.mjs`, `dbcheck.sh`):**
  - Added `acmedel` by clicking; deleted by clicking: plan listed (schema `dms_acmedel`, 2 tables; groups
    `acmedel Admin`, `acmedel Public`, 1 membership); Delete disabled on wrong text, enabled on `acmedel`;
    plan 200, delete 200; gone after reload. After: no schema, 0 change_log rows, no tenant row or ref, no
    project / links / groups / members. mny and tny: unchanged (only the site's ref list lost acmedel).
  - Backup folder: 6 `.copy.gz` files + manifest (5 data_items rows, 7 change_log rows, the auth rows).
  - **The subdomain is reusable:** `acmedel` added again by clicking, clean (7 change_log rows, its own).
  - Refusals: member 403, the mny domain admin 403, anonymous 401, no / wrong confirm 400, unknown 404,
    bad subdomain 400; plan for mny read-only (would keep AVAIL and the county groups).
  - An unlinked tenant (the old Remove, simulated) deleted through the API: same result.
  - `test-transaction-guard.js` clean. No automated test: the delete needs per-app Postgres, and the
    package's tests run on SQLite (where it refuses); a Postgres test belongs with the docker harness.
- **Seen on the way (not changed):** the add-tenant save rewrote every ref in the hub's `tenants` list to the
  generic `hub+tenant` (mny's and tny's were `hub+test|<sub>:tenant`). Everything reads the ids, so nothing
  broke; worth a look in `saveSiteRefList` / the tenant format.

## Testing Checklist

- [x] Server rejects duplicate tenant create via both `/list` and signup paths
- [x] Server rejects create with missing subdomain (`data={}`)
- [ ] Error message displays correctly (blocked by open issue above)
- [ ] Single-tenant mode (`isMultiTenant = false`) is completely unaffected
- [ ] Race condition: two simultaneous creates of the same subdomain → server rejects one

> **Re-linked 2026-10-13** from `dms_multitenant_ssr` (closed at the initiative review) to `tes_self_service_signup`.
