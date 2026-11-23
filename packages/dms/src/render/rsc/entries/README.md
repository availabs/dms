# RSC build entries

The three entries of the RSC build (`@vitejs/plugin-rsc`: `rsc`, `ssr`, `client`). A host app names them in
its RSC build config and writes no entry code of its own. What the library can't import itself, it imports
through five aliases the host's config must define:

| Alias | The host module | Used by |
|---|---|---|
| `@dms-host/ssr-handler` | default export `createHandler(config)`: the app's SSR handler factory, with its themes, plugins and widgets loaded | `ssr.js` |
| `@dms-host/themes` | default export `loadThemes(names) => Promise<{ [name]: theme }>` | `ssr.js`, `browser.js` |
| `@dms-host/api-host` | named export `API_HOST` | `ssr.js`, `browser.js` |
| `@dms-host/widgets` | side effect: registers every nav widget the server registers, without loading the plugins | `browser.js` |
| `@dms-host/plugins` | side effect: registers the app's plugins. Loaded lazily, by pages with section islands | `browser.js` |

Example: `dms-template/vite.rsc.config.js`.
