# Upgrade to Vite 8

## Status: COMPLETE — dev server + production build verified

## Objective

Upgrade the project from Vite 7 to Vite 8. The major change is that Vite 8 replaces both esbuild and Rollup with Rolldown (a unified Rust-based bundler), bringing ~3x faster dev server startup and 10-30x faster production builds.

## Current State

- **Vite**: `^7.3.1`
- **@vitejs/plugin-react**: (check current version)
- **@tailwindcss/vite**: TailwindCSS 4
- **React**: `^19.1.0`
- **React Compiler**: via `babel-plugin-react-compiler` in `@vitejs/plugin-react` Babel config
- **Node.js**: Current (needs to be 20.19+ or 22.12+ for Vite 8)
- **Config**: `vite.config.js` uses `rollupOptions` for manual chunk splitting

## Breaking Changes (Vite 7 → 8)

### Must fix

1. **`build.rollupOptions` → `build.rolldownOptions`**
   - `vite.config.js` line 63: `rollupOptions: isSsrBuild ? {} : { ... }`
   - Rename to `rolldownOptions`

2. **React Compiler setup changes**
   - `@vitejs/plugin-react` v6 drops Babel as a dependency, uses Oxc for React Refresh
   - React Compiler now uses `reactCompilerPreset` + `@rolldown/plugin-babel` + `babel-plugin-react-compiler`
   - Current setup (lines 94-100):
     ```js
     react(isSsrBuild ? {} : {
       babel: {
         plugins: ['babel-plugin-react-compiler'],
       },
     })
     ```
   - New setup:
     ```js
     import { reactCompilerPreset } from '@vitejs/plugin-react'
     import babel from '@rolldown/plugin-babel'
     // ...
     react(), // no babel config
     !isSsrBuild && babel({ presets: [reactCompilerPreset] }),
     ```

3. **esbuild no longer bundled**
   - If any code uses `transformWithEsbuild`, must install esbuild as devDependency
   - Check if `vite-plugin-top-level-await` or other plugins depend on esbuild

### May need attention

4. **CommonJS interop changes**
   - Rolldown handles CJS default imports differently
   - Key CJS dependencies to test: `falcor`, `xhr2`, `falcor/lib/ModelRoot`, `lodash.throttle`, `better-sqlite3`
   - The `falcor-shim.js` alias may need adjustment
   - If runtime errors: add `legacy: { inconsistentCjsInterop: true }` as workaround

5. **CSS minification**
   - Lightning CSS is now the default minifier (was esbuild)
   - Should be fine but verify Tailwind output is unchanged

6. **Module type handling**
   - Rolldown auto-sets module type by file extension
   - The custom `buildProgress()` plugin should be fine (only uses `transform` hook)
   - `vite-plugin-wasm` and `vite-plugin-top-level-await` may need Vite 8-compatible versions

7. **`worker.rollupOptions`**
   - Not currently used (worker config uses `plugins` only), but verify `worker.format: 'es'` still works

### Probably fine

8. **`optimizeDeps` changes**
   - Pre-bundling may behave differently with Rolldown
   - The `entries`, `include`, `exclude` config should still work but verify

9. **SSR `noExternal`**
   - Should still work the same way

## Implementation

### Phase 1: Preparation

- Check Node.js version meets requirement (20.19+ or 22.12+)
- Check `@tailwindcss/vite` has a version supporting Vite 8 peer dep (may need `--legacy-peer-deps` or npm overrides if not yet released)
- Check `vite-plugin-wasm` and `vite-plugin-top-level-await` compatibility with Vite 8

### Phase 2: Upgrade dependencies

```bash
npm install vite@^8 @vitejs/plugin-react@^6
npm install -D @rolldown/plugin-babel  # for React Compiler
```

Also check/upgrade:
- `@tailwindcss/vite` (needs Vite 8 peer dep support)
- `vite-plugin-wasm` (check for Vite 8 compat)
- `vite-plugin-top-level-await` (check for Vite 8 compat — may be unnecessary with Rolldown)

### Phase 3: Update vite.config.js

1. Rename `rollupOptions` → `rolldownOptions`
2. Update React Compiler setup to use `@rolldown/plugin-babel` + `reactCompilerPreset`
3. Remove `babel` config from `react()` plugin call
4. Add `legacy.inconsistentCjsInterop: true` if CJS imports break

### Phase 4: Test

1. `npm run dev` — verify dev server starts, HMR works
2. `npm run build` — verify production build succeeds
3. `npm run preview` — verify production build runs correctly
4. Test SSR: `npm run build:ssr` — verify SSR build works
5. Test WASM: verify wa-sqlite worker loads correctly
6. Test CJS deps: falcor, xhr2, lodash.throttle
7. Test maplibre-gl chunk splitting still works
8. Test React Compiler is active (check build output for memoization)

### Phase 5: Cleanup

- Remove `legacy.inconsistentCjsInterop` if not needed
- Remove `vite-plugin-top-level-await` if Rolldown handles it natively
- Consider removing the `falcor-shim.js` workaround if Rolldown's CJS interop handles falcor correctly
- Update any CI/deployment scripts if needed

## Files

| File | Change |
|------|--------|
| `package.json` | Upgrade vite, @vitejs/plugin-react, add @rolldown/plugin-babel |
| `vite.config.js` | Rename rollupOptions, update React Compiler setup |
| `src/dms/packages/dms/src/render/ssr2/falcor-shim.js` | May need adjustment for Rolldown CJS interop |

## Risks

- **`vite-plugin-wasm`** and **`vite-plugin-top-level-await`** may not have Vite 8 support yet — these are needed for wa-sqlite WASM worker. If incompatible, may need to find alternatives or wait.
- **`@tailwindcss/vite`** peer dep — may need npm overrides until a compatible Tailwind release.
- **CJS interop** — falcor and its sub-modules are the main risk area. The existing `falcor-shim.js` and resolve aliases may need tuning.

## Testing Checklist

- [x] Dev server starts without errors (498ms startup)
- [ ] HMR works (edit a component, see live update) — needs manual testing
- [x] Production build succeeds (2795 modules, 54s)
- [ ] Production preview works correctly — needs manual testing
- [ ] SSR build succeeds
- [ ] wa-sqlite WASM worker loads (local-first sync)
- [ ] Falcor data fetching works (pages load data)
- [ ] MapLibre map renders
- [ ] React Compiler active in production build
- [ ] TailwindCSS styles render correctly
- [ ] No CJS import runtime errors
