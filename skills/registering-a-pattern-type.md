# Registering a pattern type from the host app

**Outcome:** a pattern type (routes, admin listing, theme, and optionally section types and plugins)
that lives in your app rather than in the DMS library, and behaves exactly like a built-in.

Reference: [`../documentation/pattern-registry.md`](../documentation/pattern-registry.md). Worked
examples:
- dms-template `src/patterns/mapeditor/`: the map editor, which also ships the page pattern's Map
  section.
- `src/patterns/qa/`: the Tickets pattern, which uses the admin, publish, CLI and server hooks below.

## 1. Put the pattern in the app

```
src/patterns/
├── index.js            ← registers every app pattern type (imported by App.jsx AND entry-ssr.jsx)
└── <name>/
    ├── index.js        ← the definition (default export) + any registration API you expose
    ├── siteConfig.jsx  ← export default [configFn, …], the same contract as the library's built-ins
    ├── defaultTheme.js ← { <themeObject>: …, … }, every theme object the pattern's components read
    └── …
```

- Import library code **only** from `~/dms/packages/dms/src` (or `~/dms/packages/dms/src/map` for the
  map runtime). Never use deep `src/...` paths.
- If something you need isn't exported, add it to the library entry: that file *is* the interface.
- Gate: no relative import in `src/patterns/<name>/` leaves the folder.

## 2. Write the definition

```js
// src/patterns/<name>/index.js
import siteConfig from './siteConfig'
import defaultTheme from './defaultTheme'

export default {
  siteConfig,
  label: 'My Pattern',
  description: 'One line for the Add Pattern card',
  admin: { addable: true, order: 70, defaultName: 'My Pattern', usesDmsEnv: false },
  defaultTheme,                       // → theme.<name>; site themes override under <name>
  // pageComponents: { 'My Section': MySectionConfig },   // optional: new page section types
  // registerFromTheme: theme => …,                       // optional: code a site theme ships under <name>
}
```

## 3. Register it, for both entries

```js
// src/patterns/index.js
import { registerPatternTypes } from '~/dms/packages/dms/src'
import myPattern from './<name>'
registerPatternTypes({ <name>: myPattern })
```

`src/App.jsx` and `src/entry-ssr.jsx` both `import './patterns'` (dms-template already does). If only
the client registers a type, SSR silently skips its rows.

## 4. Theme it

- Read your theme through `getComponentTheme(themeFromContext, '<name>.<themeObject>')`, spreading your
  local default first. This is the same idiom as every library component.
- Site themes override under the same key:
  `{ <name>: { <themeObject>: { wrapper: '…' } } }`.

## 5. Shipping page section types (optional)

`pageComponents` entries are ordinary section registry entries
([`creating-page-section-components.md`](./creating-page-section-components.md)). Two generic hooks
exist for sections that don't use the dataWrapper:

- `managesOwnState: true`: your element-data is passed through unconverted, and the section menu uses the
  `settingsAPI` your component emits through `onHandle({ settingsAPI: { state, setState, … } })`.
- `derivePageVariables(elementData) → vars[]`: page variables your section owns get auto-registered
  (e.g. the Map's `layers` share state).

Keep the element-type keys stable: stored sections reference them. To rename one, register the old key
as a hidden alias: `{ ...Entry, hideInSelector: true }`.

## 5b. Admin, publish, CLI and server hooks (optional)

For a type that has more to do than route and render. All of these are optional, and QA uses each one.

| Need | Hook |
|---|---|
| Refuse a new pattern, or give it initial settings | `admin.beforeCreate` → `{ problem }` / `{ row }` |
| Set things up once it exists (datasets, environments) | `admin.afterCreate` (runs after the site row is saved) |
| Never offer Duplicate | `admin.duplicable: false` |
| Its own Pattern Editor tab | `admin.editorTabs: [{ name, path, icon, component }]`; make the component lazy |
| React to a page being published (editor Publish) | `onPagePublish({ page, pattern, sitePatterns, type, app, baseUrl, apiLoad, apiUpdate })` |
| The same for `dms page publish` | a plain-ESM module named by `DMS_PAGE_PUBLISH_HOOK` / `.dmsrc` `pagePublishHook` |
| Show part of its settings to users not granted on the row | write it to the row's `public` key; dms-server's no-access stub carries `public` |
| A nav widget a theme can place | `registerWidget(name, { label, component })` from the library entry |

- **Admin panels are styled under `admin.*`.** Admin pages get only a site theme's `admin` key
  (`getAdminTheme`). So a tab's theme override key is `admin.<key>`, spread over a local default. It
  isn't under the type's own key.
- **`public` is readable by everyone, signed out included.** Write only what must be public. Rebuild
  it on every write of the settings it copies (QA: `intake.js` `publicSettings`).
- **The CLI hook runs in plain Node.** It can't import the library entry or anything that does. Keep it
  to plain-ESM files of your own (with `.js` extensions on imports), and take the rest from `helpers`.

## 6. Verify

- `npx vitest run src/patterns/<name>` — model it on `src/patterns/mapeditor/mapeditor.test.js`:
  registration, routing a row, the components, the theme key.
- The library suite stays green: `npx vitest run src/dms/packages/dms/tests`.
- `npx vite build`, plus `npx vite build --ssr src/entry-ssr.jsx`.
- Live: Admin → Add Pattern shows the card. Create one, open its route, and check its theme overrides
  apply. If it has `afterCreate` or `editorTabs`, check what they set up and that the tab opens.

## Gotchas

- **The pattern_type string is data.** Existing rows keep whatever `pattern_type` they were created with.
  Register under that exact name.
- **Lazy ids must stay unique and identical in the client and SSR builds** (`lazyComponent(id, …)`).
  Moving a file is fine; changing an id breaks SSR hydration of already-rendered pages.
- **App-wide registration.** Every app built from the same bundle gets the type. Per-app selection isn't
  supported yet.
