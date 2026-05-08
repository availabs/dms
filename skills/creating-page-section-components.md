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

## Common pitfalls

- **Anonymous default exports** kill Fast Refresh. Always `export default function Foo(...)` or `export const Foo = ...`.
- **Mixing component + non-component exports in `.jsx`.** Move themes to `.theme.{js,jsx}`, registry metadata to `.config.{js,jsx}`. The split is mandatory, not stylistic.
- **Hardcoding source-table aliases in calc-column SQL** when joins might apply. `buildUdaConfig` rewrites bare `data->>` to `${alias}.data->>` automatically — don't pre-prefix unless the column is from a joined source.
- **Forgetting to register** in `ComponentRegistry/index.jsx`. The section file can be perfect; without the registry import, page authors won't see it.

## References

- `packages/dms/CLAUDE.md` — Vite Fast Refresh rules, file conventions, theming guidance.
- `patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx` — most feature-complete reference component.
- `patterns/page/components/sections/components/ComponentRegistry/header.config.js` — minimal reference component.
- `patterns/page/components/sections/components/ComponentRegistry/index.jsx` — the registry itself.
- `patterns/page/defaultTheme.js` — where pattern-tied themes get registered.
- `ui/useTheme.js` — `getComponentTheme`, `mergeTheme`, the context surface.
