# Registering a pattern type from the host app

**Outcome:** a pattern type (routes, admin listing, theme, and optionally section types and plugins)
that lives in your app rather than in the DMS library, and behaves exactly like a built-in.

Reference: [`../documentation/pattern-registry.md`](../documentation/pattern-registry.md). Worked
example: dms-template `src/patterns/mapeditor/` (the map editor, which also ships the page pattern's
Map section).

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

## 6. Verify

- `npx vitest run src/patterns/<name>` — model it on `src/patterns/mapeditor/mapeditor.test.js`:
  registration, routing a row, the components, the theme key.
- The library suite stays green: `npx vitest run src/dms/packages/dms/tests`.
- `npx vite build`, plus `npx vite build --ssr src/entry-ssr.jsx`.
- Live: Admin → Add Pattern shows the card. Create one, open its route, and check its theme overrides
  apply.

## Gotchas

- **The pattern_type string is data.** Existing rows keep whatever `pattern_type` they were created with.
  Register under that exact name.
- **Lazy ids must stay unique and identical in the client and SSR builds** (`lazyComponent(id, …)`).
  Moving a file is fine; changing an id breaks SSR hydration of already-rendered pages.
- **App-wide registration.** Every app built from the same bundle gets the type. Per-app selection isn't
  supported yet.
