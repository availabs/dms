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

## Theming — no Tailwind in markup

**All markup must be styled through the theme.** Inline `className="..."` strings with Tailwind utilities don't belong in components — they live in `.theme.{js,jsx}` siblings and are pulled into the component via `ThemeContext`. This is what lets downstream sites re-skin the entire app without forking components.

If you find yourself writing `className="flex items-center gap-2 ..."` in a component body, stop and move the string into the matching theme file as a named key.

### Two flavors of themed component

The right place for the theme depends on where the component lives and how it gets its data:

#### 1. Reusable UI primitives — `ui/components/Foo.{jsx,theme.{js,jsx}}`

Components that take **all data through props** and don't know about patterns, page state, or routes (Button, Input, Select, Pill, Switch, Card, Tabs, etc.). These are the project-wide reusables.

- Implementation in `ui/components/Foo.jsx`, theme in sibling `Foo.theme.{js,jsx}`.
- Theme is registered in `ui/defaultTheme.js`.
- Themes typically expose multiple **named styles** under a `styles[]` array with an `options.activeStyle` selector — site authors can swap the entire visual treatment without touching code.

```js
// ui/components/Button.theme.jsx
export const buttonTheme = {
  options: { activeStyle: 0 },
  styles: [
    { name: 'default Buttons', button: 'inline-flex items-center …' },
    { name: 'plain',            button: 'cursor-pointer relative …' },
    { name: 'active',           button: 'cursor-pointer px-4 …' },
  ],
};
```

#### 2. Pattern-tied components — `patterns/<pattern>/.../Foo.{jsx,theme.{js,jsx}}`

Components that consume context, page state, joins, filter trees, etc. — they're meaningful only inside a pattern (page, datasets, auth, …). The current filter-editor (`ComplexFilters`), section components (`section`, `sectionArray`, `sectionGroup`), `userMenu`, search, dataset pages, etc.

- Implementation lives under the pattern (`patterns/page/components/sections/ComplexFilters.jsx`), theme in sibling (`ComplexFilters.theme.js`).
- Theme is registered in **`patterns/<pattern>/defaultTheme.js`** under a namespace key (e.g., `complexFilters`, `sectionGroupsPane`). The pattern's `defaultTheme` is merged into the global theme by `getPatternTheme()` at site load.
- Themes are usually a flat `{ key: classString }` map — the multi-`styles[]` shape is overkill for tightly-scoped pattern UIs. Use it only if the component genuinely has multiple visual variants the user can switch.

### Loading the theme inside a component

Always go through `ThemeContext` and `getComponentTheme` from `ui/useTheme.js` — don't `import buttonTheme` directly into a component body, because that bypasses the merged + overridden theme that the site has configured.

```jsx
import { ThemeContext, getComponentTheme } from "<path-to>/ui/useTheme";
import { complexFiltersTheme } from "./ComplexFilters.theme";

const Foo = () => {
  const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = {
    ...complexFiltersTheme,                                  // local default fallback
    ...getComponentTheme(themeFromContext, 'complexFilters') // merged + overridden
  };
  return <div className={t.groupWrapper}>…</div>;
};
```

#### What `getComponentTheme(theme, compType, activeStyle?)` does

`compType` is a lodash-`get` path (`'button'`, `'pages.sectionGroupsPane'`, `'complexFilters'`).

- **Flat shape** — if `theme[compType]` has no `styles` array, returns the object as-is. This is the typical pattern-tied case (`{ groupWrapper: '...', leafWrapper: '...' }`).
- **Styles shape** — if `theme[compType].styles` is an array:
  - Resolves the style by passed-in `activeStyle`, then by `theme[compType].options.activeStyle`, then `0`.
  - Accepts a numeric index *or* a style `name`.
  - Non-default styles inherit missing keys from `styles[0]` (so style authors only need to override what differs).
- Always returns `{}` instead of `undefined` if the key is missing — safe to destructure.

#### When you need a specific style

Pass the third argument explicitly:

```jsx
const theme = getComponentTheme(themeFromContext, 'button', 'plain');
// or by index:
const theme = getComponentTheme(themeFromContext, 'button', 2);
```

Otherwise omit it and let `options.activeStyle` (configured per-site) drive selection.

#### The local-default spread

Spreading `complexFiltersTheme` (or `buttonTheme`, etc.) before `getComponentTheme(...)` is defensive — it covers the case where the component is rendered outside a pattern's theme tree (e.g., a settings dialog mounting a filter editor without the page-pattern theme merged in). The override from context wins on any key it provides; missing keys fall through to the local default.

### Theme settings authoring (advanced)

UI primitives also export a `*Settings` function that produces editable controls for the theme manager (see `Button.theme.jsx`'s `buttonSettings(theme)`). This is what lets site authors edit theme values from the admin UI. Pattern-tied themes don't need this unless the theme is large enough to warrant in-product editing.

### Quick checklist for new themed work

- Writing a UI primitive (props in, JSX out, no context)? → `ui/components/Foo.{jsx,theme.{js,jsx}}`, register in `ui/defaultTheme.js`, prefer `styles[]` + `options.activeStyle`.
- Writing a pattern-tied component? → next to the component, register in `patterns/<pattern>/defaultTheme.js`, flat key map is fine.
- Reading the theme in JSX? → `getComponentTheme(themeFromContext, '<key>')`, spread your local default first as a fallback.
- Tempted to write `className="flex …"` directly? → name a key in the theme, use it instead.
