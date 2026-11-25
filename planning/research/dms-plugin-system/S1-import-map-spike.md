# S1 (spike): a separately built plugin on the host's React, through an import map

2026-11-23, overnight, for [dms-plugin-system.md](../../tasks/current/dms-plugin-system.md) P2 (runtime loading). The
question from R1 ("the hard part on the client"): can a plugin built on its own, loaded at run time, share the host's
single React, router and library instances? Files: `dms-template/scratchpad/plugin-spike/` (gitignored: the two
Vite configs, the entries, the plugin, the test page, `check.mjs`).

## What was built

1. **The host's shared modules** (`vite.shared.config.mjs`): one Vite library build with entries for `react`,
   `react-dom`, `react-dom/client`, `react/jsx-runtime`, `react-router` and the DMS library entry, ESM, unhashed
   entry names. Rollup puts code the entries share into common chunks, so every entry reaches the **same** module
   instances (one React, one library registry).
2. **A plugin** (`hello-plugin/plugin.jsx`, `vite.plugin.config.mjs`): a Vite library build with React and the router
   external. It **imports nothing from the library**: it registers a section type through `host`, and its component
   reads the host's `ThemeContext` from `host.contexts`. Output: **728 bytes**.
3. **A page** (`dist/index.html`) with an import map from the bare specifiers to the shared files. It loads the plugin
   with `import()`, registers it with the library's real `registerPlugin`, and renders the registered section inside
   the library's `ThemeContext.Provider` with the library's `UI` set.

## Results

- **It works.** The plugin rendered, read the host's theme through `host.contexts` (`theme spike-theme`), rendered the
  host's `UI.Button`, and its `useState` updated on click (`clicked 0` → `clicked 1`): one React, shared contexts. No
  errors; the plugin's registration took 9 ms.
- **The whole library as a shared module is too big**: 7.8 MB raw, **1.9 MB gzipped** across 86 chunks, because the
  library entry statically imports everything (Lexical included). Inside the app's build Rollup splits it per page;
  a shared copy can't be split per consumer. **So the plugin API must come through `host`, not through importing
  the library**: contexts (added to the host: `host.contexts` = `ThemeContext`, `CMSContext`, `PageContext`,
  `ComponentContext`, `DataSourceContext`), the theme's `UI` set (already in `ThemeContext`), and later hooks and
  helpers (`apiLoad` and friends are already in `CMSContext`). Only React, react-dom and the router go through the
  import map (react-dom's client ~95 KB and the router ~25 KB gzipped, which the app ships today anyway).
- **CommonJS packages need explicit named re-exports.** `export * from 'react-dom/client'` gives no named exports in
  a Rollup library build (the first run failed: "does not provide an export named 'createRoot'"); the entries are
  generated from each package's real export list.

## SSR (checked too)

`ssr-hook.mjs` + `ssr-check.mjs`: a `module.register` resolve hook maps a plugin's bare `react`, `react-dom`,
`react/jsx-runtime` and `react-router` imports to the host's own copies (resolved from dms-template's
`node_modules`), wherever the plugin's files sit. The same 728-byte plugin, copied to a folder outside the app (as
`var/plugins/hello/1.0.0/` will be), was imported, registered through a host, and server-rendered on the host's React
with the host's context: `<div id="hello" data-theme-name="ssr-theme">hello from a plugin · theme ssr-theme ·
<button>clicked 0</button></div>`. So the SSR side needs no build of its own beyond the plugin's ESM `ssr` entry.

## What P2 has to do with this

1. **The app build externalizes React, react-dom, the JSX runtime and the router** to the shared files and writes the
   import map into `index.html` (before any module script). The dev server can keep today's resolution. The app's
   own chunks then import React by bare specifier, so the app and every plugin share it.
2. **SSR**: the same singletons in Node, through a `module.register` resolve hook mapping the bare specifiers to the
   host's copies (checked above).
3. **The plugin API grows on `host`**, versioned with `PLUGIN_API_VERSION`, never by plugins importing library files.
   The registries the host wraps stay app-internal.
4. **Order**: plugins load after the site row (to know the tenant's activations) and before routes are built and
   before `hydrateRoot`, as R1 found; `import()` of each active plugin's `client` entry from
   `/_dms/plugins/<name>/<version>/…`.
