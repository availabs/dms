# SSR build folder from the environment: `DMS_DIST_DIR`

**Initiatives:** [plat_tenant_hub](../../../../../planning/initiatives/plat_tenant_hub.md) · **Status:** built · **Release:** commit — library + template; no deploy changes until a container sets it · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

A production SSR server (`NODE_ENV=production`, `DMS_SSR=1`) finds its build where `DMS_DIST_DIR` says,
and the build script writes to the same place. Default `dist`, so nothing changes for mercury's
containers. Locally that lets a production build of the hub live in `dist-ssr/` while `dist/` stays
whatever the Netlify scripts expect.

## Why

Filed 2026-11-10 while setting up `npm run hub` (owner's request: "would be good to be able to configure
build paths in env even if there are hardcoded defaults"). `dms-server/src/index.js` passed
`<root>/dist/client` and `setup.mjs` imported `<root>/dist/server/entry-ssr.js`, both hard-coded.
Seven `deploy-*` scripts in dms-template upload `dist/` to Netlify **without building first**
(`deploy-devmny`, `deploy-devtny`, `deploy-tnyprod`, `deploy-wcdb`, `deploy-landbank`, `deploy-ctp`,
`deploy-dmsdocs`), so a hub SSR build parked in `dist/` would ride along on the next one. `dist-ssr` was
already in `.gitignore`, unused.

## Changes — DONE 2026-11-10

- [x] `packages/dms/src/render/ssr2/express/setup.mjs` — `mountSSR` takes `serverBundle` (default
      `<root>/dist/server/entry-ssr.js`) beside `clientDir` (now defaulting to `<root>/dist/client`); the
      production log line prints both paths.
- [x] `packages/dms-server/src/index.js` — `distDir = resolve(root, DMS_DIST_DIR || 'dist')`; passes
      `clientDir = <distDir>/client` and `serverBundle = <distDir>/server/entry-ssr.js`. Dev mode (not
      production) ignores it: Vite's middleware serves from `src/`.
- [x] `documentation/dms-server-env.md` — `DMS_DIST_DIR` row under SSR.
- [x] dms-template `deploy/build_ssr.mjs` (new) — `--env <file>` loads KEY=VALUE lines with the shell
      winning, like node's `--env-file`; `--dir` overrides; runs `vite build --outDir <dir>/client` then
      `vite build --ssr src/entry-ssr.jsx --outDir <dir>/server`. `npm run build:hub` = `--env .env-hub`.
- [x] dms-template `.env.example` — the setting documented under SSR; `.env-hub` sets
      `DMS_DIST_DIR=dist-ssr`, `VITE_API_HOST=http://api.localhost:5555` (not `localhost`, which
      `App.jsx` swaps for production's API in a production build) and a commented `NODE_ENV=production`.

## Testing checklist — verified 2026-11-10

- [x] `npm run build:hub` writes `dist-ssr/client/index.html` and `dist-ssr/server/entry-ssr.js`;
      `dist/` untouched (same mtime). Client 3m25s, server 11s; `dist/index.html` kept its 2026-10-15 mtime.
- [x] `NODE_ENV=production npm run hub` logs `[SSR] Production mode — client …/dist-ssr/client, server
      …/dist-ssr/server/entry-ssr.js`, no `[vite]` output; `/list` and `mny.localhost:5555/` render; the
      served HTML's script tag points at `/assets/…` from the build. `/list` 200 in 0.9s cold, 7ms warm,
      server-rendered 21 KB; `mny.localhost` 200 with MitigateNY content; `/assets/index-….js` 200.
- [x] `npm run hub` (no NODE_ENV) still logs `[SSR] Dev mode` and serves from `src/`.

## Log

- 2026-11-10 — filed and built in one session with `split-mode-per-app-default.md`'s session. Not committed.
