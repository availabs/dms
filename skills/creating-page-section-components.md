# Creating a page-section component

How to add a new section type to the DMS page pattern's component registry. "Section component" means an entry in `ComponentRegistry/` that page authors can drop onto a page — `Card`, `Spreadsheet`, `Header`, `Graph`, `lexical` rich-text, etc. are all section components.

Before starting, ask yourself: **do I actually need a new component?** Most "I need a card that shows X" cases can be solved by configuring the existing `Card` section with different columns + filters. New component types are the right tool when:

- The component genuinely renders differently from anything in the registry (e.g., a map, a graph, a PDF export).
- Or the configuration surface for the existing component would be unreasonably large to express the new behavior.

If you can configure an existing component instead, do that. See the [now-airing card recipe](./now-airing-card.md) for an example of "configured Card section beats new component."

## File layout

Every section component splits into 2-3 sibling files. This split is required by Vite's React Fast Refresh rules — see `packages/dms/CLAUDE.md` for the full explanation; the short version is "a `.jsx` file may only export React components."

```
ComponentRegistry/
├── Foo.jsx           ← only exports the component(s): FooEdit, FooView
├── Foo.config.jsx    ← imports Foo, exports the registry entry as default (everything else: name, type, controls, defaultState, EditComp, ViewComp)
└── Foo.theme.js      ← optional; exports themeable class strings (no JSX → .js, with JSX → .jsx)
```

Use `.config.jsx` when controls contain inline JSX (very common — `controls.inHeader[i].type` often renders a `<Button>`). Use `.config.js` otherwise. Same for `.theme`.

Look at `Card.jsx` + `Card.config.jsx` for a worked example with controls, defaultState, format columns, etc. `header.jsx` + `header.config.js` is a smaller, simpler example.

## The component contract

The component is a React function that receives the standard section props from the dataWrapper. Two variants:

```jsx
// Foo.jsx
export const FooEdit = ({ state, setState, controls, dwAPI, ... }) => { ... };
export const FooView = ({ state, ... }) => { ... };
```

- **`state`** — the section's persisted state (columns, filters, display config, fetched data).
- **`setState`** — Immer-style mutator. Use this rather than reaching into the parent.
- **`controls`** — the assembled inline controls (rendered into the section header in edit mode).
- **`dwAPI`** — the dataWrapper API (`refetch`, etc.) for components that need to imperatively poke the data layer.

Many components keep `EditComp === ViewComp` if the only differences are conditional on `isEdit` inside the component — that's the Card pattern. Split into two when the divergence is structural (different layout, different state shape).

**Naming.** Use typed names (`FooEdit` / `FooView`), never anonymous defaults. Anonymous defaults break Fast Refresh's tracking.

## The registry entry

Default-export from `Foo.config.{js,jsx}`:

```js
import { FooEdit, FooView } from './Foo';
import { fooTheme } from './Foo.theme';
import ActionControls from './controls/ActionControls'; // optional

export default {
  name: 'Foo',                    // user-facing name; key in ComponentRegistry
  type: 'foo',                    // internal type — for state branching, schema markers
  useDataSource: true,            // component receives data via the dataWrapper
  useDataWrapper: true,           // component is wrapped by the dataWrapper (most are)
  useGetDataOnPageChange: true,   // refetch on page-state changes
  useInfiniteScroll: false,
  showPagination: true,
  themeKey: 'foo',                // points at theme.foo for getComponentTheme lookups

  defaultState: {
    filters: { op: 'AND', groups: [] },
    display: { pageSize: 10 },
    columns: [],
    data: [],
    externalSource: { columns: [] },
  },

  controls: {
    columns: [
      { type: 'toggle', label: 'show', key: 'show' },
      // ... per-column controls rendered in the column-config UI
    ],
    more: [
      // ... controls under the "more" pulldown
    ],
    data: [
      // ... data-tab controls
    ],
    inHeader: [
      // ... per-column controls rendered in the section header
    ],
  },

  EditComp: FooEdit,
  ViewComp: FooView,
};
```

The full set of optional fields is captured by reading `Card.config.jsx` (the most feature-complete example) and `spreadsheet/config.jsx`. Rather than enumerate every option here, treat those two as the reference.

## Register it

Add the import + key in `ComponentRegistry/index.jsx`:

```js
import Foo from './Foo.config';

const ComponentRegistry = {
  lexical,
  Card,
  Spreadsheet,
  // ...
  Foo,                             // ← here
};
```

The key is what page authors see in the section-type picker. Keep it human-readable; fancy keys like `'Header: Default Header'` exist for legacy reasons but new entries should be plain (`Foo`, `MyChart`).

## Theme wiring

If the component has any styling beyond what generic UI primitives provide, theme it. Two flavors per `packages/dms/CLAUDE.md`:

- **UI primitives** (live in `ui/components/`, take all data through props) → use `Foo.theme.{js,jsx}`, register in `ui/defaultTheme.js`, typically with `styles[]` + `options.activeStyle`.
- **Pattern-tied** (your case here, since section components are page-pattern things) → register in `patterns/page/defaultTheme.js` under a namespace key.

Inside the component, always access through `ThemeContext` + `getComponentTheme`:

```jsx
import { ThemeContext, getComponentTheme } from '<...>/ui/useTheme';
import { fooTheme } from './Foo.theme';

const FooEdit = (props) => {
  const { theme: themeFromContext = {}, UI } = React.useContext(ThemeContext) || {};
  const t = { ...fooTheme, ...getComponentTheme(themeFromContext, 'foo') };
  return <div className={t.wrapper}>...</div>;
};
```

Spread the local default first so the component still renders sensibly when mounted outside a context that has the page-pattern theme merged in. Site themes override individual keys via `theme.foo.<key>`.

**Never put inline Tailwind in markup.** All `className="..."` strings live in the `.theme` file; the component reads them by key. `packages/dms/CLAUDE.md` has the full rationale.

For a worked theming refactor, see `ComplexFilters.jsx` + `ComplexFilters.theme.js` + `patterns/page/defaultTheme.js`'s registration of `complexFilters`.

## Section data + filters

Most section components read their data via the **dataWrapper** — the wrapper handles UDA config building, fetching, page-filter resolution, and `useNowTick` boundary refetch. Set `useDataSource: true, useDataWrapper: true` and you get this for free.

Section state shape (canonical / v2):

```js
{
  externalSource: { source_id, view_id, env, isDms, columns, ... },
  columns: [ { name, show, group, fn, sort, ... }, ... ],   // section-level config
  filters: { op: 'AND', groups: [ ... ] },                   // tree-based filter
  display: { pageSize, usePagination, ... },
  data: [],                                                  // populated by the data loader
  join: { sources: { ... } },                                // optional
}
```

Computed columns and time filters are first-class: a column with `display: 'calculated'` and `name: '<sql> as alias'` participates in SQL emission as a calc column; a filter leaf with `op: 'time'` invokes the time-filter primitive (relative ranges, instant + compareEnd, DOW, time-of-day). See [`now-airing-card.md`](./now-airing-card.md) for a worked use of both together.

## Connecting a component to page variables

A **page variable** is a named piece of page state, usually mirrored to a URL search param, that sections
share (`?geoid=36119`, `?layers=…`). The full authoring model — registering variables, adding Filter
controls, cascading — is in [`creating-interactive-pages.md`](./creating-interactive-pages.md). This
section is the **component-code** side: how your component reads and writes those variables.

**The one rule: the page owns the URL. A component must never touch it directly.** No `useSearchParams`,
`setSearchParams`, `navigate`, or `window.location` in a section component. Writing the URL from a section
fights the page's URL ownership and — under the React Compiler (on in prod, and in transportNY dev) —
ping-pongs into an infinite reload loop. Everything below goes through `PageContext` instead.

Everything comes from `PageContext`:

```js
const { pageState, updatePageStateFilters, setActionParam, clearActionParam } = React.useContext(PageContext) || {};
```

**Consume (read a page variable).** Read `pageState.filters` — an array of `{ searchKey, values, useSearchParams, type }`. Match by `searchKey`:

```js
const geoid = (pageState?.filters || []).find(f => f.searchKey === 'geoid')?.values;
```

If you use the **dataWrapper**, you don't even do this by hand: a filter leaf with `usePageFilters: true` +
`searchParamKey: 'geoid'` binds automatically (Card / Spreadsheet / the map's `dynamic-filters` all consume
this way). Filter `type: 'action'` entries are transient hover/click params — exclude them from data/render
sync (`pageFilters.filter(f => f.type !== 'action')`) so interaction churn doesn't retrigger fetches.

**Produce (write a page variable).** Two write paths, both page-owned:

- `updatePageStateFilters(nextFilters)` — **URL-synced.** Pass `[{ searchKey, values }, …]`; the page
  updates its registered filters and navigates (only the keys you pass change; others are preserved). Use
  for state worth sharing/bookmarking. This is what click-filters and the map's `layers`/variant writes use.
- `setActionParam(key, value)` / `clearActionParam(key)` — **in-memory only, never the URL.** Use for
  transient interaction state (hover highlight, click selection) that other sections read but nobody bookmarks.

**Registration (required for URL-synced vars).** `updatePageStateFilters` only writes a `searchKey` that is
a **registered page variable** — otherwise it's ignored. Either the author registers it (Step 0 of
`creating-interactive-pages.md`), or the platform **auto-derives** it. The map does the latter:
`deriveMapShareVariables` (in `pages/_utils`) scans for a `Map` section with `display.shareableState` and
auto-registers `layers` + each interactive layer's `searchParamKey`; `getPageVariableRegistry` folds those
into the registry seeded into `pageState.filters`. Auto-registered vars surface **read-only** in the page
Settings tab so authors can see which URL params the page owns.

**Idempotency (avoid write↔read loops).** When you both read and write a variable, a write round-trips
(write → navigate → `pageState` updates → your read effect re-runs). Guard writes so you never re-emit what
the page already holds, and never write un-reconciled state on mount — see the map's WRITE effect
(`ComponentRegistry/map/index.jsx`) for the pattern (prime-on-first-run + page-idempotency guard + defer
until the first read reconciles).

**Worked example — the map.** Consumes `geoid`/dynamic filters and its interactive-filter variant via
`searchParamKey` leaves; produces visibility (`layers`) and the selected variant via `updatePageStateFilters`;
publishes hover/click via `setActionParam`. It used to write `?layers=` with `useSearchParams` directly —
that was the reload-loop bug; migrating it onto `updatePageStateFilters` is what fixed it.

## Smoke-test checklist

Before merging a new section component:

- [ ] Vite dev server picks up edits to the component without a full page reload (Fast Refresh works → file split is correct).
- [ ] The section appears in the section-type picker on a page.
- [ ] Adding the section to a page persists and reloads cleanly (no shape mismatch on `migrateToV2`).
- [ ] The default state renders without errors when the section is first added.
- [ ] Edit-mode controls populate from `controls.*` config.
- [ ] The component renders correctly in view mode (read-only).
- [ ] Theme keys are looked up via `getComponentTheme`, with no inline Tailwind in the JSX.
- [ ] If the component has filters, `state.filters` round-trips through save/reload (the filter-tree shape is the standard one — leaves don't grow surprise fields).
- [ ] If the component reads/writes page variables, it goes through `PageContext` (`pageState.filters` / `updatePageStateFilters` / `setActionParam`) — **no `useSearchParams`, `setSearchParams`, `navigate`, or `window.location` anywhere in the component.** Toggle it in view mode (compiler on) and confirm no reload loop.

## Common pitfalls

- **Anonymous default exports** kill Fast Refresh. Always `export default function Foo(...)` or `export const Foo = ...`.
- **Mixing component + non-component exports in `.jsx`.** Move themes to `.theme.{js,jsx}`, registry metadata to `.config.{js,jsx}`. The split is mandatory, not stylistic.
- **Hardcoding source-table aliases in calc-column SQL** when joins might apply. `buildUdaConfig` rewrites bare `data->>` to `${alias}.data->>` automatically — don't pre-prefix unless the column is from a joined source.
- **Forgetting to register** in `ComponentRegistry/index.jsx`. The section file can be perfect; without the registry import, page authors won't see it.
- **Touching the URL directly** (`useSearchParams`/`setSearchParams`/`navigate`/`window.location`) to share state. The page owns the URL; go through `updatePageStateFilters`/`setActionParam` (see "Connecting a component to page variables"). Direct URL writes reload-loop under the React Compiler.

## References

- `packages/dms/CLAUDE.md` — Vite Fast Refresh rules, file conventions, theming guidance.
- `patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx` — most feature-complete reference component.
- `patterns/page/components/sections/components/ComponentRegistry/header.config.js` — minimal reference component.
- `patterns/page/components/sections/components/ComponentRegistry/index.jsx` — the registry itself.
- `patterns/page/defaultTheme.js` — where pattern-tied themes get registered.
- `ui/useTheme.js` — `getComponentTheme`, `mergeTheme`, the context surface.
- [`creating-interactive-pages.md`](./creating-interactive-pages.md) — the page/author side of page variables (registering, Filter controls, cascading, gotchas).
- `patterns/page/components/sections/components/ComponentRegistry/map/index.jsx` — worked example of consuming + producing page variables (and the `useSearchParams`→`updatePageStateFilters` migration that fixed the reload loop).
- `patterns/page/pages/_utils/index.js` — `getPageVariableRegistry` / `deriveMapShareVariables` (auto-registering a component's page variables).
