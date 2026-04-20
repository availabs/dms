# package.json Cleanup — Consolidate Dependencies for DMS 2.0

## Objective

Consolidate dependencies across the three package.json files (`dms-template` root, `@availabs/dms`, `@availabs/dms-server`) so that:

1. `npm install` in `dms-template` succeeds cleanly with no peer-dep warnings, engine warnings, or version mismatches.
2. `@availabs/dms` can be published as **2.0** with a complete, accurate `dependencies` list — so any project that installs it via npm gets a working package with zero extra deps to add.
3. `@availabs/dms-server` is likewise self-contained, publishable, and installable.
4. The `dms-template` root package.json retains only **site-level** concerns: the Vite/Tailwind build pipeline, ESLint, site tests, entry-point runtime deps (`react`, `react-dom`), and things consumed by the project's themes (`@carbon/icons-react`, `lodash-es`) or local modules (`src/modules/avl-components`, `src/modules/avl-map-2`).
5. The dual consumption pattern — local submodule (this repo) vs. pure npm (downstream projects) — is made explicit and reliable.

## Scope

**In scope:**
- Three package.json files: root, dms, dms-server
- The local-dev resolution story (submodule vs. npm consumer)
- Peer-dep alignment (React 19)
- `@types/react*` version bumps
- Removal of unused deps
- Documentation of the pattern in dms README

**Out of scope:**
- Actual 2.0 feature work (API changes, breaking behavior)
- Changes to ESLint config, Vite config semantics, or themes
- Publishing workflow changes beyond the version bump itself
- Upgrading React or other majors

## Current State

### Three package.json files today

**`dms-template/package.json`** (site, private)
- `@availabs/dms: ^0.1.12` as a regular dep — downloaded from npm, but code imports from the submodule path `./src/dms/packages/dms/src`. Transitive deps of the published 0.1.12 are what make this work; the published package effectively serves as an implicit "lockfile" for the submodule's deps.
- Contains legitimate site-level deps (`react`, `react-dom`, `@carbon/icons-react`, build tooling).
- Contains several unused or misplaced deps (see audit).
- `@types/react` pinned to ^18 while `react` is ^19.
- `gdal-async` listed but never imported by site code; only dms-server uses it (and has it as an optional dep).

**`src/dms/packages/dms/package.json`** (`@availabs/dms`, published)
- Version: `0.1.12`
- Lists most of what it actually needs (lexical, turf, maplibre, yjs, etc.).
- **Missing deps it actually imports:**
  - `react-dom` — imported in `render/ssr2/handler.jsx`, `ui/components/Popup.jsx`, several lexical plugins. Works in practice only because the root pulls it in.
  - `y-protocols` — imported in `ui/components/lexical/editor/collaboration.js`. Works only because root lists it.
- Keeps older peer-problematic deps: `react-table@^7` (peer: react ≤18), `react-popper@^2` (peer: react ≤18).

**`src/dms/packages/dms-server/package.json`** (`@availabs/dms-server`, published)
- Reasonably clean. Already lists `compression`, `express`, `y-protocols`, `yjs`, plus optional native bindings (`pg`, `gdal-async`, `sharp`, `@aws-sdk/client-s3`).
- Depends on `express@^4.21.0`, while root devDeps have `express@^5.2.1`. Divergent majors.

### Root `npm install` symptoms

- ERESOLVE warnings for `react-table` and `react-popper` wanting peer `react@^18` under React 19. Installs succeed via default `overrides` behavior, but the warnings are what the user wants gone.
- EBADENGINE warnings from npm internals under Node 20.15 (cosmetic — fixed by bumping Node ≥ 20.17).
- Deprecation warnings (`inflight`, old `glob`) — transitive, ignorable.

### Dep audit (root → where actually used)

Searched site-level code only: `src/App.jsx`, `src/main.jsx`, `src/entry-ssr.jsx`, `src/modules/**`, `src/themes/**`, root config files.

| Root dep | Used by site? | Used by `@availabs/dms` src? | Used by `@availabs/dms-server`? | Already in dms pkg? | Already in dms-server pkg? | Action |
|---|---|---|---|---|---|---|
| `@availabs/dms` | `src/App.jsx:1` (site entry) | — | No | — | — | **KEEP** but switch to `file:` protocol (see strategy) |
| `@carbon/icons-react` | `src/themes/mny/icons.jsx:1-70` | No | No | No | No | **KEEP** (theme-only) |
| `@hello-pangea/dnd` | No | No | No | No | No | **REMOVE** |
| `@heroicons/react` | No | No | No | No | No | **REMOVE** |
| `gdal-async` | No (Node-only; would break browser) | No | Yes (upload pipeline) | No | optionalDeps | **REMOVE from root** — let dms-server's optionalDeps handle it |
| `react` | `src/main.jsx:1` | Yes | No | Yes ^19 | No | **KEEP** |
| `react-dom` | `src/main.jsx:2` | Yes (missing from dms pkg!) | No | **missing** | No | **KEEP in root, ADD to dms** |
| `react-redux` | No | No | No | No | No | **REMOVE** |
| `vite-plugin-top-level-await` | No (vite.config.js doesn't import it; only `research/toy-sync/` does) | No | No | No | No | **REMOVE** |
| `vite-plugin-wasm` | `vite.config.js:5` | No | No | No | No | **KEEP** (site build) |
| `y-protocols` | No | Yes (`lexical/editor/collaboration.js`) | Yes | **missing** | Yes ^1.0.7 | **MOVE** to dms; REMOVE from root |
| `yjs` | No | Yes | Yes | Yes ^13.6.30 | Yes ^13.6.30 | **REMOVE from root** (kept only for alias safety — see below) |

**devDeps:**

| Root devDep | Used by site build? | Notes | Action |
|---|---|---|---|
| `@babel/core` | Transitive of `@vitejs/plugin-react`; also React Compiler uses it | **KEEP** (explicit pin useful) |
| `@eslint/js` | `eslint.config.js` | **KEEP** |
| `@tailwindcss/vite` | `vite.config.js:4` | **KEEP** |
| `@types/react` | JSX typings — but pinned ^18 under React 19 | **BUMP to ^19** |
| `@types/react-dom` | Same | **BUMP to ^19** |
| `@vitejs/plugin-react` | `vite.config.js:3` | **KEEP** |
| `autoprefixer` | Tailwind pipeline | **KEEP** |
| `babel-plugin-react-compiler` | `vite.config.js:97` | **KEEP** |
| `compression` | Not used by site; only dms-server | **REMOVE** (already in dms-server deps) |
| `eslint` + plugins | `eslint.config.js` | **KEEP all** |
| `express` | Not used by site; dms-server has `express@^4`, root has `^5` (mismatch) | **REMOVE from root** |
| `globals` | `eslint.config.js` | **KEEP** |
| `nodemon` | Only dms/dms-server use it (both declare it) | **REMOVE from root** |
| `tailwindcss` | Site styling | **KEEP** |
| `vite` | Site build | **KEEP** |
| `vite-bundle-analyzer` | `npm run analyze` | **KEEP** |
| `vitest` | Site `npm test` | **KEEP** |

**dms (`@availabs/dms`) package.json — add these missing deps:**
- `react-dom ^19.1.0` (imported but missing)
- `y-protocols ^1.0.7` (imported but missing)

**dms-server package.json — align these:**
- Bump `express ^4.21.0` → evaluate `^5.2.1` (the root already has 5, and it's the modern major). If dms-server's routes aren't v5-compatible yet, keep at 4 and note the incompatibility explicitly. *(Test before bumping — express 5 changes the promise-handling behavior for async route handlers.)*

**dms (`@availabs/dms`) package.json — additional considerations:**
- `react-table ^7.8.0` is abandoned and has peer `react@<=18`. Either:
  - (a) add `peerDependenciesMeta.optional` or `overrides` hack, or
  - (b) migrate to `@tanstack/react-table` (out of scope — leave for a follow-up task), or
  - (c) document the React 19 peer noise as accepted.
- `react-popper ^2.3.0` — same situation.
- For 2.0: add `"peerDependencies": { "react": "^19.0.0", "react-dom": "^19.0.0" }` to make intent explicit. Remove `react`/`react-dom` from `dependencies` if we want npm consumers to bring their own React (standard library pattern). **Decision needed** — see Open Questions.

## Proposed Changes

### Strategy: dual-consumption pattern

The project has two consumer modes; the cleanup must work for both:

**Mode A — `dms-template` using the local submodule (this repo's dev workflow)**
- The site imports from `./src/dms/packages/dms/src` directly (source, not the `dist/`).
- Today, the root's `"@availabs/dms": "^0.1.12"` pulls the published package solely so its transitive deps are hoisted into `node_modules/` for the submodule's source to use. This is an implicit contract that rots whenever the submodule drifts from the published version.
- **Recommended fix:** change the root dep to a `file:` protocol link so npm reads the submodule's own package.json and installs its declared deps:
  ```json
  "@availabs/dms": "file:./src/dms/packages/dms"
  ```
  npm installs the local package (with its `dependencies`), producing a symlink in `node_modules/@availabs/dms`. All deps resolve against the submodule's package.json, which is now the single source of truth. No more "hope the published version matches the submodule."
- Alternative: promote the root to an **npm workspace** (`"workspaces": ["src/dms/packages/*"]`). Cleaner but requires deployment targets (Netlify) to handle workspaces. Decide based on deploy constraints. See Open Questions.

**Mode B — downstream project installing `@availabs/dms` via npm**
- `npm install @availabs/dms` pulls the published 2.0 package with its complete `dependencies` list.
- The downstream project only lists deps it *itself* imports (its themes, entry points, build tooling).
- Works if and only if `@availabs/dms` accurately lists every runtime dep (see missing deps above).

### File-by-file changes

#### 1. `dms-template/package.json`

**Remove** from `dependencies`:
- `@hello-pangea/dnd` — unused
- `@heroicons/react` — unused
- `gdal-async` — only dms-server uses it; let its optionalDep handle it
- `react-redux` — unused
- `vite-plugin-top-level-await` — unused (vite.config.js doesn't import it)
- `y-protocols` — move to dms pkg deps (added there); root no longer needs
- `yjs` — already in dms; vite alias resolves via hoisted `node_modules/yjs` regardless. Test after removal; re-add if the alias breaks.

**Change** in `dependencies`:
- `@availabs/dms: ^0.1.12` → `@availabs/dms: file:./src/dms/packages/dms` (Mode A). At 2.0 publish time, a consumer-facing copy of the template can use `@availabs/dms: ^2.0.0`.
- **Also add** `@availabs/dms-server: file:./src/dms/packages/dms-server`. Without this, dms-server's prod deps (express, bcryptjs, better-sqlite3, ws, etc.) never install at root, and `server:dev` fails with MODULE_NOT_FOUND. At 2.0 publish time, swap to `^2.0.0`.

**Remove** from `devDependencies`:
- `compression` — only dms-server uses it (already in its deps)
- `express` — only dms-server uses it (already in its deps); removes root-vs-server version mismatch
- ~~`nodemon`~~ — **keep in root** after all. See Design note in Phase 3: because dms-server is linked via `file:` (not a real install), its own devDeps don't get installed. The `server:dev` script invokes `nodemon` and relies on the root's `node_modules/.bin/nodemon`.

**Bump** in `devDependencies`:
- `@types/react: ^18.3.12` → `^19.x`
- `@types/react-dom: ^18.3.1` → `^19.x`

**Keep** (site-level, verified in use):
- `@availabs/dms`, `@carbon/icons-react` (mny theme), `react`, `react-dom`, `vite-plugin-wasm`
- All build tooling: `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `tailwindcss`, `autoprefixer`, `@babel/core`, `babel-plugin-react-compiler`
- All lint: `eslint`, `@eslint/js`, `eslint-plugin-react*`, `globals`
- `vitest`, `vite-bundle-analyzer`

**Add** to `dependencies`:
- `lodash-es` — used by `src/themes/avail/components/*.jsx`. Currently resolves transitively; make it explicit so the theme doesn't silently break if dms ever drops lodash-es.

#### 2. `src/dms/packages/dms/package.json`

Bump version to `2.0.0` (pre-publish, at the end of this task).

**Add** to `dependencies`:
- `react-dom: ^19.1.0` — imported by handler.jsx, Popup.jsx, lexical plugins
- `y-protocols: ^1.0.7` — imported by lexical/editor/collaboration.js

**Decide** on React peer-dep pattern (Open Question #1 below):
- Option A (keep current): `react` in `dependencies`. Simple; consumers just install the package. Risk: duplicate React if consumer has a different minor/major.
- Option B (library best-practice): move `react`/`react-dom` to `peerDependencies: { "react": "^19.0.0", "react-dom": "^19.0.0" }` plus `devDependencies` for local builds. Consumer must install React themselves. Prevents duplicates; slightly more friction.

**Consider** for 2.0:
- `react-table@^7.8.0` is archived. If not migrating now, acknowledge the React 19 peer warning in README and leave it. Track migration as a follow-up task under `patterns/` or `ui/`.
- Add `"engines": { "node": ">=20.17" }` to eliminate the EBADENGINE noise.
- Add a short **README** section: "Consuming `@availabs/dms`" — the required peer deps, the expected React version, note that `@availabs/dms-server` is sold separately.

#### 3. `src/dms/packages/dms-server/package.json`

Bump version to `2.0.0` in lockstep with `@availabs/dms` (coordinated release).

**Evaluate**:
- `express ^4.21.0` — is this intentional? Express 5 is stable. If the routes are v5-compatible, bump to ^5. If not, leave at 4 but don't list 5 in the template root.
- Add `"engines": { "node": ">=20.17" }`.

No removals needed — the package is already clean.

#### 4. `src/dms/packages/dms/README.md` (new section)

Add a **Consumers** section:

```
## Installing

```bash
npm install @availabs/dms
```

Peer requirements (if peerDependencies approach is chosen):
- React 19+
- React DOM 19+

The template repo at github.com/availabs/dms-template is the reference
consumer and is kept in lockstep with the current `@availabs/dms` release.
```

### Publish flow (end of task)

1. In the dms monorepo, bump `packages/dms/package.json` to `2.0.0` and `packages/dms-server/package.json` to `2.0.0`.
2. `npm run build:dms` in the monorepo.
3. `npm run publish:dms` and `npm run publish:server` (or equivalent).
4. In `dms-template`, after confirming publication, change `"@availabs/dms": "file:./src/dms/packages/dms"` → `"@availabs/dms": "^2.0.0"` on the branch for downstream consumers. (Local dev can keep the `file:` link; a separate branch or a `package.json` override for contributors is fine. See Open Question #2.)

## Files Requiring Changes

- `dms-template/package.json`
- `dms-template/src/dms/packages/dms/package.json`
- `dms-template/src/dms/packages/dms-server/package.json`
- `dms-template/src/dms/packages/dms/README.md` (new section — if README exists)
- `dms-template/package-lock.json` (regenerated)
- Possibly `dms-template/vite.config.js` — verify the `yjs` alias still resolves after removing root's `yjs` dep (alias uses `node_modules/yjs/dist/yjs.mjs`; should still exist as a hoisted transitive).

## Implementation Phases

### Phase 1: Update `@availabs/dms` package.json — DONE

- [x] Add `react-dom: ^19.1.0` to dependencies
- [x] Add `y-protocols: ^1.0.7` to dependencies
- [x] Add `"engines": { "node": ">=20.17" }`
- [x] Leave `react`/`react-dom` in `dependencies` for now (not `peerDependencies`) — revisit at publish time per Open Question #1
- [x] Leave `react-table` and `react-popper` as-is; peer warnings accepted (3 ERESOLVE lines remain on fresh install, all from these two packages)

### Phase 2: Update `@availabs/dms-server` package.json — DONE

- [x] Add `"engines": { "node": ">=20.17" }`
- [x] Leave `express ^4.21.0` — Express 5 migration tracked separately (Open Question #4)
- [x] No other changes; package was already clean

### Phase 3: Update `dms-template` root package.json — DONE

**Removed from `dependencies`:**
- [x] `@hello-pangea/dnd` — unused
- [x] `@heroicons/react` — unused
- [x] `gdal-async` — dms-server handles as optional
- [x] `react-redux` — unused
- [x] `vite-plugin-top-level-await` — unused
- [x] `y-protocols` — moved to dms deps
- [x] `yjs` — still hoisted via dms transitive (`node_modules/yjs` exists after reinstall); vite alias still resolves

**Removed from `devDependencies`:**
- [x] `compression` — dms-server owns it
- [x] `express` — dms-server owns it (no more v4/v5 mismatch at root)
- [ ] `nodemon` — **reverted**. See Design note below.

**Changed `dependencies`:**
- [x] `@availabs/dms: ^0.1.12` → `file:./src/dms/packages/dms`
- [x] Added `@availabs/dms-server: file:./src/dms/packages/dms-server` (matches the dual-consumption strategy; see Design note)
- [x] Added `lodash-es: ^4.17.21` (avail theme)

**Bumped `devDependencies`:**
- [x] `@types/react: ^18.3.12` → `^19.2.0`
- [x] `@types/react-dom: ^18.3.1` → `^19.2.0`

**Design note — nodemon kept in root devDeps:**
The root script `server:dev` runs `npm run dev --prefix src/dms/packages/dms-server`, which then invokes `nodemon`. Because the dms-server package is a `file:` symlink (not a real install), it has no own `node_modules/.bin`. npm's bin resolution walks up and finds `nodemon` in the root's `node_modules/.bin`. Keeping `nodemon` in root devDeps is the pragmatic fix. (Even though `nodemon` is also declared as a devDep of `@availabs/dms-server`, devDeps of a `file:`-linked dependency are NOT installed by npm — only prod deps are.)

**Design note — adding `@availabs/dms-server` as a root `file:` dep:**
This mirrors the `@availabs/dms` trick. Without it, none of dms-server's prod deps (`express`, `bcryptjs`, `better-sqlite3`, `ws`, etc.) would be installed to root `node_modules`, and the server would fail to boot with MODULE_NOT_FOUND errors. With it, all of them hoist into root, Node's module resolution finds them when the server script runs.

**Design note — workspace conflict with submodule root `package.json`:**
`src/dms/package.json` declares `"workspaces": ["packages/*"]`. npm, when resolving `file:` links that point into the submodule tree, can end up installing deps into `src/dms/node_modules/` instead of the root. Observed: stale `src/dms/node_modules/` from prior installs can cause subsequent `npm install` runs to report only "2 packages added" with most deps missing from root. **Cleanup command for fresh installs:** `rm -rf node_modules package-lock.json src/dms/node_modules src/dms/package-lock.json && npm install`. Consider adding this as a `clean` script or a `preinstall` hook in the root package.json — tracked under Open Questions #3.

### Phase 4: Install & verify — DONE

- [x] `rm -rf node_modules package-lock.json src/dms/node_modules src/dms/package-lock.json && npm install` — 673 packages installed at root, only 1 metadata file in `src/dms/node_modules`
- [x] `node_modules/yjs` exists (hoisted from dms); root dep removal is safe
- [x] `node_modules/react-dom` resolves
- [x] `node_modules/y-protocols` resolves (via dms dep)
- [x] `node_modules/@carbon/icons-react` resolves (root dep)
- [x] `node_modules/lodash-es` resolves (root dep)
- [x] `node_modules/@availabs/dms` is a symlink to `../../src/dms/packages/dms`
- [x] `node_modules/@availabs/dms-server` is a symlink to `../../src/dms/packages/dms-server`
- [x] `node_modules/.bin/nodemon` resolves
- [x] `node_modules/express`, `bcryptjs`, `better-sqlite3`, `react-table`, `react-popper` all present
- [x] Remaining install warnings: only 3 ERESOLVE lines for `react-table`/`react-popper` (known, accepted) + EBADENGINE from Node 20.15 being below engines' `>=20.17` (user can upgrade Node when convenient)

### Phase 5: Smoke-test builds — DONE (with caveats)

- [x] `npm run build` — succeeds, produces dist/ with expected chunks (vendor, maplibre, etc.)
- [x] `npm run dev` — Vite boots to http://localhost:5173, returns 200 HTML on a curl
- [x] `npm run server:dev` — dms-server core modules resolve (verified by running `node src/index.js` directly — fails only at config-file lookup for `dms-sqlite.config.json` which is a site-provided config, not a dep issue)
- [ ] `npm run lint` — pre-existing lint errors (9000+) unchanged by this work; not in scope of this cleanup
- [ ] **Known issue (pre-existing, unrelated to this task):** `npm run server:dev` via `nodemon` emits `node: .env: not found` due to how nodemon forwards `--env-file-if-exists=.env` through the shell. The server is booting; the message comes from a strange interaction between nodemon argument forwarding and Node's env-file flag. Not caused by this task and not blocking; track separately if it's actually breaking anyone.

### Phase 7: Migrate to npm workspaces — DONE

**Motivation:** The `file:` approach works but has a stale-state trap (`src/dms/node_modules` can fill up on fresh installs) and isn't npm's first-class model. Workspaces eliminate both issues.

**Docker safety verified:** `src/dms/packages/dms-server/Dockerfile` copies only `package*.json` from the dms-server package dir and runs `npm install --omit=dev` from there. It never touches the monorepo root `package.json` or the `workspaces` field. Removing workspaces from the submodule does **not** break Docker.

**Changes:**

- [x] Added `"workspaces": ["src/dms/packages/*"]` to root `package.json`
- [x] Changed root deps: `"@availabs/dms": "file:..."` → `"@availabs/dms": "*"` (same for dms-server)
- [x] Simplified root scripts:
  - `"server"`: `--prefix` → `-w @availabs/dms-server`
  - `"server:dev"`: `--prefix` → `-w @availabs/dms-server`
- [x] Removed `"workspaces": ["packages/*"]` from `src/dms/package.json`
- [x] Rewrote `src/dms/package.json` scripts as `cd packages/<pkg> && <cmd>` (standalone-clone publish/build still works)
- [x] Clean install test: 675 pkgs at root, 0 in `src/dms/node_modules` (directory doesn't exist), small per-package nested trees (9 in dms, 2 in dms-server) for version-pinned deps that can't dedupe (eslint@8 vs root eslint@9, older falcor versions)
- [x] `npm run build` — succeeds
- [x] `npm run dev` — Vite serves HTTP 200
- [ ] `npm run server:dev` — modules all resolve (verified direct boot); the pre-existing `node: .env: not found` nodemon-arg-forwarding quirk still fires (unrelated to this task)

**Design note — `.npmrc` with `legacy-peer-deps=true`:**
Workspace mode enforces peer deps stricter than `file:` protocol. Under `file:`, npm emitted 3 ERESOLVE warnings for `react-popper` and `react-table` (peer `react@<=18` under React 19) but continued. Under workspaces, it fails hard: "Fix the upstream dependency conflict." Added `.npmrc` at root with `legacy-peer-deps=true` to restore the overriding behavior. Result: **zero ERESOLVE warnings on fresh install**. This is the pragmatic fix until `react-popper` and `react-table` are migrated off (tracked separately).

**Design note — stale `lodash.throttle` entry in `vite.config.js`:**
`optimizeDeps.include` listed `lodash.throttle` with a comment claiming `falcorGraph.js` imports it as CJS. Grep shows falcorGraph.js actually imports `{throttle}` from `lodash-es`, not `lodash.throttle`. The entry was dead but happened to resolve because `lodash.throttle` was a transitive of something under the old install layout. Under workspaces it doesn't hoist. Removed the dead entry from `vite.config.js`.

**At 2.0 publish time (after Phase 6):** swap the workspace-protocol `"*"` deps back to `"^2.0.0"` on the consumer-facing branch. Contributors who want local dev against the submodule can switch back to workspace mode locally or use `npm link`.

### Phase 8: Remove `react-table`, `react-popper`, and `forms_bak/` — DONE

**Audit results:**
- `react-table` — imported in 2 files, both inside `patterns/forms_bak/` (dead code, not referenced outside itself; `patterns/index.js` has the `forms` import commented out)
- `react-popper` — appears only as a single *commented-out* import in `forms_bak/ui/index.jsx`
- `react-bootstrap-typeahead` — actively used; peer `react>=16.8.0`, React-19-compatible, not a source of ERESOLVE warnings. Keep.

**Changes:**

- [x] Deleted `src/dms/packages/dms/src/patterns/forms_bak/` (entire directory)
- [x] Removed `react-table: ^7.8.0` from `packages/dms/package.json`
- [x] Removed `react-popper: ^2.3.0` from `packages/dms/package.json`
- [x] Deleted `.npmrc` with `legacy-peer-deps=true` — no longer needed now that the peer-problematic deps are gone
- [x] Clean install: zero ERESOLVE warnings, zero peer conflicts, no `.npmrc` hacks
- [x] `npm run build` — succeeds

**FilterableSearch usage (for context — this component depends on `react-bootstrap-typeahead`, which stays):**
- `page/components/sections/components/FilterableSearch.jsx` — used 4× by `componentsIndexTable.jsx` (Component Registry UI)
- `page/components/sections/components/ComponentRegistry/map/tmp-cache-files/FilterableSearch.jsx` — used 2× by `SymbologySelector.jsx` (map pattern symbology chooser)
- `page/components/sections/components/dataWrapper/components/FilterableSearch.jsx` — **not imported anywhere** (dead); potential future cleanup

### Phase 9: Remove `componentsIndexTable` + both dead `FilterableSearch` files — DONE

- [x] Deleted `src/dms/packages/dms/src/patterns/page/components/sections/components/componentsIndexTable.jsx`
- [x] Deleted `src/dms/packages/dms/src/patterns/page/components/sections/components/FilterableSearch.jsx` (the one `componentsIndexTable` used)
- [x] Deleted `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/components/FilterableSearch.jsx` (was already unreferenced dead code)
- [x] Removed import + registry entry for `"Table: Components Index"` from `ComponentRegistry/index.jsx`
- [x] `npm run build` passes
- [ ] **Still alive (deferred):** `SymbologySelector.jsx` imports `./tmp-cache-files/FilterableSearch.jsx`. The `tmp-cache-files/` directory name is misleading — the file is actively used. Leave for a separate cleanup (either migrate SymbologySelector off `react-bootstrap-typeahead` or rename the directory out of "tmp-cache-files" limbo)

### Phase 10: Pin `@carbon/icons-react` to 11.76.0 (tree-shaking regression in 11.78) — DONE

- [x] Observed: `npm run analyze` showed `@carbon/icons-react` taking ~half of the vendor chunk after this work
- [x] Investigation: previous committed `package-lock.json` had `@carbon/icons-react@11.76.0`; lockfile regeneration under `"^11.71.0"` pulled the latest `11.78.0`; that version defeats Rolldown's tree-shaking in Vite 8 (likely due to a change in the `es/index.js` barrel's side-effect shape — bare `import "./iconPropTypes-*.js"` and/or top-level `if (process.env.NODE_ENV !== "production") X.propTypes = ...` assignments that Rolldown keeps alive despite `sideEffects: false`)
- [x] Measured impact (unminified):
  - 11.78.0: 2343 icons (`viewBox` entries) in the bundle
  - 11.76.0: 68 icons (~64 imported + `Icon` internals) — tree-shaking intact
- [x] Measured minified vendor chunk:
  - 11.78.0: 3.0 MB
  - 11.76.0: 1.6 MB (~1.4 MB / ~47% smaller)
- [x] Pinned `@carbon/icons-react: "11.76.0"` (exact) in `dms-template/package.json`

**Follow-up (out of scope):** revisit when Carbon ships a fix post-11.78, or when Rolldown tree-shakes the newer barrel layout. Until then, the exact pin prevents `npm install` from drifting forward again.

### Phase 6: Publish prep (deferred — user handles)

- [ ] Bump `@availabs/dms` to `2.0.0`, `@availabs/dms-server` to `2.0.0` (user does this from the dms monorepo)
- [ ] Publish both packages
- [ ] Update root `@availabs/dms` and `@availabs/dms-server` from `file:` to `^2.0.0` on the consumer-facing branch

## Testing Checklist

- [ ] `rm -rf node_modules package-lock.json && npm install` in `dms-template` → zero ERESOLVE warnings (React 19 peer) or 1–2 acknowledged ones from `react-table`/`react-popper` with documented reason.
- [ ] `npm run dev` starts Vite and renders the site correctly in the browser (click through: admin list, a page with lexical content, a datasets page).
- [ ] `npm run build` completes with no missing-module errors.
- [ ] `npm run server` / `npm run server:dev` start dms-server successfully; hit at least one Falcor route.
- [ ] `npm run build:ssr` and serve — SSR renders without missing `react-dom/server`, `y-protocols`, etc.
- [ ] `npm run lint` — clean.
- [ ] Collaboration / Yjs path (lexical editor) loads `y-protocols` from the dms package's node_modules, not root's.
- [ ] `@carbon/icons-react` resolves for the mny theme.
- [ ] `lodash-es` resolves for avail theme `AudioPlayer.jsx` / `Message.jsx`.
- [ ] From a fresh scratch dir: `npm init -y && npm install @availabs/dms@2.0.0` and import a top-level symbol — works without adding any other deps.
- [ ] Same for `@availabs/dms-server`.
- [ ] Netlify deploy smoke test on a non-prod site (`deploy-b3nson` or similar) if the `file:` protocol is kept in the deployed branch — confirm Netlify's build honors `file:` deps. If not, document the workaround (swap to the published version in a pre-deploy step).

## Open Questions

1. **React as `dependencies` vs `peerDependencies` in `@availabs/dms`?**
   - Deps: zero friction for consumers but risk of duplicate React.
   - Peer: library best-practice; consumer controls React version.
   - Recommendation: peer for 2.0. Update the template to list `react`/`react-dom` in its own deps (it already does).

2. **Keep `file:` protocol in committed root `package.json`, or swap to `^2.0.0` after publish?**
   - `file:` works for contributors with the submodule but may confuse Netlify or npm-only consumers cloning the template.
   - Cleanest: after 2.0 is published, use `^2.0.0` in the committed root; contributors who want to edit dms alongside the site use `npm link` or a local `file:` override (npm supports `overrides` field).

3. **npm workspaces or flat layout?**
   - Workspaces would eliminate the `file:` trick and give proper dedup, but complicate deploy configs.
   - Defer to a follow-up if tested separately.

4. **Bump `express` in dms-server to v5?**
   - Small scope, but async route handler semantics change. If touching, audit all `async` routes for unhandled promise rejection.

5. **Migrate off `react-table`?**
   - Out of scope for this task; track separately. `react-table@7` still works under React 19 at runtime; only the peer declaration is wrong.
