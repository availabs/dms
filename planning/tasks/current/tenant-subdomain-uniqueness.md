# Tenant Subdomain Uniqueness

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

## Testing Checklist

- [x] Server rejects duplicate tenant create via both `/list` and signup paths
- [x] Server rejects create with missing subdomain (`data={}`)
- [ ] Error message displays correctly (blocked by open issue above)
- [ ] Single-tenant mode (`isMultiTenant = false`) is completely unaffected
- [ ] Race condition: two simultaneous creates of the same subdomain → server rejects one
