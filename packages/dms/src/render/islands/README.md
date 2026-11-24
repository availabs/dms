# render/islands

Static HTML with islands (`planning/tasks/current/static-html-islands.md`): with `DMS_ISLANDS=1`, a view page
whose route opted in (`islandsView` in its `siteConfig`) is served as content HTML that is never hydrated, one
client component for the chrome, and its live sections as islands.

| File | Side | What it does |
|---|---|---|
| `captureContext.js` | server | the context the capture render sets; the page view fills it |
| `servePage.js` | server | decides whether a URL can be served, renders the chrome around the captured HTML |
| `islandData.js` | both | the JSON a served page carries for the browser |
| `entry.browser.jsx` | browser | the entry a served page loads in place of the app's |
| `ClientChrome.jsx` | both | the chrome: the theme's Layout, nav, auth and theme providers |
| `StaticSlot.jsx`, `slotHtmlContext.js` | both | a slot of static HTML, never rewritten by React |
| `IslandHost.jsx`, `islandCode.js`, `SectionIslands.jsx` | browser | mount the live sections; the section code and the page's plugins load when the first one has to mount |
| `clientConfig.js` | both | what the chrome needs from the host app |

## What the host app provides

The browser entry is library code, but it needs four of the app's own modules. The app's build config names
the entry as a second input of its client build, sets `build.manifest`, and defines these aliases
(`dms-template/vite.config.js`):

| Alias | The app's module | Shape |
|---|---|---|
| `@dms-host/themes` | `src/themes/index.js` | default export `(names) => Promise<{ [name]: theme }>` |
| `@dms-host/api-host` | `src/apiHost.js` | `{ API_HOST }` |
| `@dms-host/widgets` | `src/widgets.js` | imported for its side effect: registers every nav widget the server registers |
| `@dms-host/plugins` | `src/plugins/loaders.js` | default export `{ [plugin name]: () => import(its entry) }`; a page loads only the plugins its live sections need |

## Which sections run in the browser

A section's registry entry decides (`patterns/page/components/sections/staticSections.js`):

| Entry key | The section is |
|---|---|
| `serverStatic` | HTML only, never mounted |
| `wakeOnUse` | an island that keeps its server HTML until the reader points at, focuses or touches it, or the page's state changes |
| neither | an island mounted as soon as the page has hydrated |
| `serverIsland: false` | not able to run as an island: its page stays on today's path |

The server names the plugins a page's islands need (`plugins/registries.js` `pluginsOfSections`, from what each
plugin registered), and the browser loads those only. The server preloads a compiled-in plugin's code when the
build names its entry chunk `plugin.<plugin name>-<hash>.js` (`output.chunkFileNames` in the app's build
config); without that the plugin still loads, one step later.

The server finds the built entry in `<clientDir>/.vite/manifest.json` (`render/ssr2/express/setup.mjs`). A build
without it leaves the flag off.
