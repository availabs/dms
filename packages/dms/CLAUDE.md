# @availabs/dms — Frontend Package

This package is the React UI for DMS. It ships the column types, UI primitives, patterns (page/datasets/auth/admin/forms/mapeditor), and component registry consumed by downstream sites.

## Vite React Fast Refresh — MUST observe

The frontend is developed against Vite + `@vitejs/plugin-react`. Fast Refresh (component-level HMR) only kicks in when the plugin can statically prove a file is a component-only module. **Violating these rules forces a full page reload on every save** — slow, loses state, and silently regresses as the project grows.

### The rules

1. **A `.jsx`/`.tsx` file may only export React components.** Any non-component export (constant, object literal, utility function, hook starting with `use`, context object, re-export of non-components) makes the whole file non-refreshable.
2. **Components must be named.** `export default function ({...})` and `export default ({...}) => {}` are anonymous and not trackable. Use `export default function Name({...})` or `export const Name = ({...}) => {}`.
3. **No object-wrapped component exports.** `export default { EditComp, ViewComp }` hides components inside an object literal — the plugin can't see them. Use named exports and let the consumer assemble the object.
4. **Non-component files use `.js`/`.ts`.** If a file has no JSX and exports utilities/constants/hooks/configs, name it `.js`/`.ts`, not `.jsx`/`.tsx`.
5. **TypeScript types are free.** `export interface Foo` / `export type Foo` are erased at compile time and don't affect Fast Refresh.

### Why this matters here

This package was audited top-to-bottom for these violations — see `/planning/tasks/completed/vite-hmr-fast-refresh-fixes.md` in the submodule root. The current tree is clean. When adding new code, keep it clean — don't reintroduce old patterns.

### Established conventions

When you need to ship a component alongside non-component data (themes, metadata, utils), use one of these patterns:

#### Theme siblings — `Foo.theme.{js,jsx}`

UI components with an exported theme/settings/docs object split theme data into a `.theme` sibling.

```
ui/components/Button.jsx         ← only exports: default ButtonComp
ui/components/Button.theme.jsx   ← exports: buttonTheme, buttonSettings, docs
```

`defaultTheme.js`, `themeSettings.js`, and `docs.js` import from the `.theme` siblings. Same pattern for all themed UI primitives and for pattern-level themes (`Attribution.theme.js`, `RenderFilters.theme.js`, `Breadcrumbs.theme.js`, etc.).

Use `.theme.jsx` (not `.theme.js`) if the theme contains JSX (e.g., a `children: <div>...</div>` in settings).

#### Config siblings — `Foo.config.{js,jsx}`

ComponentRegistry entries (page section types) have a rich metadata shape:

```js
{
  name, type,
  useDataSource, useDataWrapper, defaultState,
  controls: { columns, more, data, inHeader, ... },
  EditComp, ViewComp
}
```

Split the `.jsx` file so it exports only named components, and put everything else (metadata, controls, default export) in a sibling `.config.{js,jsx}`.

```
ComponentRegistry/Card.jsx          ← exports: CardSection (component only)
ComponentRegistry/Card.config.jsx   ← imports CardSection, default-exports the registry entry
ComponentRegistry/index.jsx         ← import Card from './Card.config'
```

Use `.config.jsx` if controls contain inline JSX (common — `controls.inHeader[i].type` often returns `<Button>` etc.). Use `.config.js` otherwise.

#### Hook-from-context — `useXContext.ts` + `XContext.tsx`

React's standard "Provider + hook" split:

```
context/SharedHistoryContext.tsx       ← exports: SharedHistoryContext (Provider component)
context/useSharedHistoryContext.ts     ← exports: SharedHistoryContextInternal (private), useSharedHistoryContext (hook)
```

The `.tsx` keeps only the Provider. The `.ts` holds the createContext + hook. Other consumers import the hook from the `.ts`.

#### Naming components per column type / section

Inside the file, prefer typed names over generic `Edit`/`View`:

```jsx
// columnTypes/text.jsx
export const TextEdit = ({...}) => <input ... />
export const TextView = ({...}) => <div ... />
```

This keeps React DevTools / error stacks readable when multiple `Edit`s would otherwise collide. Same pattern in ComponentRegistry: `CardSection`, `HeaderEdit`, `HeaderView`, `FilterEdit`, `FilterView`, `MapSection`, `MapDamaEdit`, `MapDamaView`.

### Public API contract preserved

Downstream consumers (`registerComponents()`, `theme.pageComponents`, `columnTypes.text.EditComp`, etc.) see the same `{ EditComp, ViewComp, ...metadata }` shape as before — the split is an internal organization change. External themes in `src/themes/avail`, `src/themes/transportny` continue to work unchanged.

If a downstream consumer wants their own custom component to be Fast-Refresh-clean, they can apply the same split pattern on their side. A `defineComponent()` helper may be exposed in the future; for now the component object shape is stable.

### Quick checklist when adding a new file

- Editing a component body? Put the file in `.jsx`/`.tsx` with **only** `export const FooEdit = ...` / `export const FooView = ...`.
- Need a theme object? Write `Foo.theme.js` alongside.
- Need registry metadata (controls, defaultState, name, type)? Write `Foo.config.{js,jsx}` alongside.
- Need a utility function or constant? Put it in `.js`/`.ts`, not `.jsx`/`.tsx`.
- Need a React hook? Put it in a `.js`/`.ts` file separate from the components.
- Default export? Name it: `export default function Foo(...)`, never `export default (...)=>` or `export default function (...)`.

### When in doubt

Run the dev server and edit the component — if the page keeps state across the edit, the file is a Fast-Refresh boundary. If it full-reloads, something in the module is breaking the boundary; look for object-literal exports, non-component named exports, or an anonymous default.
