# Authenticating the DMS CLI (and Playwright) — minting a session token

How to get a session token so the [`dms` CLI](../packages/dms/cli/) (and the
Playwright screenshot/diag scripts) can read and write a DMS server. On a local
dev server, **reads of a known row id work without a token**, but `site tree`,
`page list`, and all **writes** (`page create`, `section create/update`,
`raw update`) return `no-access` until you authenticate.

> **TL;DR** — the app stores a JWT it gets from `POST {API_HOST}/login`. Mint one
> with the dev credentials and export it as `DMS_AUTH_TOKEN` for the CLI, or write
> it into a Playwright `storageState` for screenshot scripts. Tokens expire ~6h.

## The login endpoint

Authentication is a plain POST on the **API host** (not the Vite frontend):

```
POST {API_HOST}/login
Content-Type: application/json
{ "email": "...", "password": "...", "project": "<app>" }
→ 200 { "user": { "token": "<JWT>", ... } }
```

- `API_HOST` is the dms-server, e.g. `http://localhost:3001` locally, or
  `https://dmsserver.availabs.org` for the hosted server.
- `project` is the DMS **app** name (e.g. `npmrdsv5`).
- The JWT's `exp` claim is ~6 hours out. Re-mint when commands start returning
  `no-access` / scripts land on `/auth/login`.
- **Dev credentials** (dev servers only): `availabs@gmail.com` / `test123`.
  Never hardcode these in committed scripts — pass via flags or env.

## A. Token for the CLI (`DMS_AUTH_TOKEN`)

The CLI reads its token from the `DMS_AUTH_TOKEN` env var. Mint one inline and
export it alongside the other connection vars:

```bash
export DMS_HOST=http://localhost:3001 DMS_APP=npmrdsv5 DMS_TYPE=dev2
export DMS_AUTH_TOKEN=$(node -e '
  fetch(process.env.DMS_HOST + "/login", {
    method: "POST",
    headers: { "Content-type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: "availabs@gmail.com", password: "test123", project: process.env.DMS_APP }),
  }).then(r => r.json()).then(d => process.stdout.write(d?.user?.token || ""))
')
[ -n "$DMS_AUTH_TOKEN" ] && echo "token ok (${#DMS_AUTH_TOKEN} chars)" || echo "MINT FAILED"

# now reads + writes both work:
node src/dms/packages/dms/cli/bin/dms.js page list --pattern <pattern>
```

In a seed script (`execFileSync` runner), the child inherits `process.env`, so
exporting `DMS_AUTH_TOKEN` once in the shell before running the script is enough —
the scripts in `scratchpad/*/` rely on exactly this (they set `DMS_HOST/APP/TYPE`
explicitly and inherit the token). **Don't bake the token or the credentials into
the script source.**

## B. Token for Playwright (`scripts/mint-token.mjs`)

The screenshot/diag scripts (`card-shot.mjs`, the `diag_*.mjs` scratchpad scripts)
read auth from a Playwright `storageState` JSON that seeds the app's
`userToken` localStorage key. [`scripts/mint-token.mjs`](../../../../scripts/mint-token.mjs)
does the same `/login` call and writes that file — no browser, no manual login:

```bash
node scripts/mint-token.mjs \
  --host http://localhost:3001 \
  --email availabs@gmail.com --password test123 \
  --project npmrdsv5 \
  --origin http://npmrds.localhost:5173 \
  --out scratchpad/npmrdsv5-dev2/auth.json
```

Then point the screenshot script at it: `card-shot.mjs --storage scratchpad/npmrdsv5-dev2/auth.json …`.

**The `--origin` must match the URL you'll screenshot.** Draft sections only render
in edit mode (`/edit/<slug>`), which needs the token seeded for *that* origin. With
multiple `/`-based patterns on one site, a subdomain pattern (`npmrds.localhost:5173`)
shadows a bare-host one — mint for the origin you actually load (see
`creating-pages-from-a-design-pattern.md` §8 "Common failures").

## Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `Error: Unexpected token 'o', "no-access" is not valid JSON` on `site tree` / `page list` | No (or expired) `DMS_AUTH_TOKEN` | Mint a token (§A). Note bare `raw get <id>` of a known id may still work tokenless — but listing/tree/writes don't. |
| Writes silently rejected / `no-access` | Same — token missing or expired (~6h) | Re-mint. |
| Playwright shot lands on `/auth/login` | `storageState` token expired, or wrong `--origin` | Re-run `mint-token.mjs` with the correct `--origin`. |
| `login failed: HTTP 4xx` | Wrong `project` (app), wrong creds, or hitting the Vite host instead of the API host | Use the API host (`:3001` locally), the app name as `project`, dev creds. |

## Connection vars recap

| Var | What | Example |
|---|---|---|
| `DMS_HOST` | API host the CLI talks to | `http://localhost:3001` |
| `DMS_APP` | App namespace | `npmrdsv5` |
| `DMS_TYPE` | Site/type | `dev2` |
| `DMS_AUTH_TOKEN` | Session JWT from `/login` (§A) | `<JWT>` |

These can also live in a `.dmsrc` (searched upward from cwd) or be passed as
`--host`/`--app`/`--type` flags. See
[`creating-pages-from-a-design-pattern.md` §2](./creating-pages-from-a-design-pattern.md#2-cli-surface-quick-reference).
