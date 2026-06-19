# Component Actions: Provider/Subscriber Functions

## Overview

A mechanism for components in the `ComponentRegistry` to declare and expose typed functions —
**providers** (write action params) and **subscribers** (read action params) — that can be
configured via the section menu to wire cross-component interactions at the page level.

**Motivating example:** User hovers a Card item → matched row is highlighted in a Spreadsheet.
Card declares a hover provider; Spreadsheet declares a row-highlight subscriber. An admin
connects them by giving both the same `paramKey`. No custom glue code needed.

---

## Architecture

### 1. Action Params Live in `pageState.filters`

Action params are stored directly in `pageState.filters` using a `type: 'action'` discriminator,
alongside regular filter entries. They travel through the existing shared filter state and
subscribers can read them.

**No URL sync.** All action params have `useSearchParams: false` always. They are transient
in-memory state only.

#### Two classes of action param: inert vs. reload-driving

By default an action param is an **inert passenger**: no column is configured to use its
searchKey for filtering, so it never triggers a data reload. The canonical case is a visual
subscriber (`row_highlight`) reading the value to highlight a matching row. Hover providers
publish into this class.

But an action param becomes **reload-driving** the moment a data-side consumer is configured to
read its searchKey. The concrete case in this codebase is a **dynamic custom bucket**
(`usePageFilterSync` / `resolveAliasGroups`): its `binding.statePath` can point at an action
param's key, so publishing a new value recomputes `customBuckets.config` — a `useDataLoader`
dependency — and reloads data. This is intentional: it is the only in-memory (non-URL) way to
let a row click drive a page-level data filter. The two classes share one namespace
(`pageState.filters`); consumers, not the param itself, decide which class it is.

**Constraint — trigger frequency must match the consumer.** Because a reload-driving param
issues a query on every publish, only **discrete, user-initiated triggers** (`click`) may feed a
reload-driving consumer. **Never wire a `hover` provider's key into a custom bucket** (or any
other reload consumer): hover fires on every `mouseenter` (the map layer publishes on
mouse-move), so it would reload data continuously. Hover providers must stay visual-only.

**Filter entry shape for an action param:**
```js
{
  searchKey: 'card_hover_status',  // the linking key agreed on by provider + subscriber
  values: ['active'],              // the published value, always wrapped in an array
  useSearchParams: false,          // never URL-synced
  type: 'action',                  // discriminator — never present on regular filters
}
```

`values` is always an array. Most providers publish a single value and subscribers read
`values?.[0]`. An **append-mode** provider (e.g. the spreadsheet `click_publish` with
`append_params: true`) instead accumulates multiple values into the array so a downstream
consumer can read the whole list. Append mode is a **click-toggle**: clicking a value that is
already published removes it; clicking a new one adds it. De-duplicate and compare by value with
`isEqual` (not `Set` — values may be objects or stringified JSON). When the last value is toggled
off, **clear the param** (`clearActionParam`) rather than publishing an empty array, so
downstream consumers see "no filter" instead of an empty-array filter.

**Per-row identity (composite payload).** When the published payload isn't unique per row — two
rows share the same `value` but should toggle independently — the provider publishes a composite
`{ id, value }` element instead of a bare value: `id` is the toggle identity (from a configured
row-id column), `value` is the payload the consumer reads. The toggle compares by `id` only; the
payload is opaque to it. Consumers must **unwrap `.value`**: `resolveAliasGroups`
(`usePageFilterSync.js`) reads the route from `entry.value` when the route fields aren't on the
entry itself, falling back to the bare entry for direct-route bindings from other page-filter
sources. The spreadsheet `click_publish` provider exposes this via an optional `id_column` arg —
empty means bare-value toggling (no composite).

Two helper functions are added to `PageContext` so components don't have to write raw Immer
mutations:

```js
// view.jsx + edit/index.jsx
const setActionParam = useCallback((key, value) => {
  setPageState(draft => {
    const existing = draft.filters.find(f => f.searchKey === key && f.type === 'action');
    if (existing) {
      existing.values = [value];
    } else {
      draft.filters.push({ searchKey: key, values: [value], useSearchParams: false, type: 'action' });
    }
  });
}, [setPageState]);

const clearActionParam = useCallback((key) => {
  setPageState(draft => {
    const idx = draft.filters.findIndex(f => f.searchKey === key && f.type === 'action');
    if (idx !== -1) draft.filters.splice(idx, 1);
  });
}, [setPageState]);

// Included in PageContext.Provider value:
{ ...existing, setActionParam, clearActionParam }
```

Subscribers read directly from `pageState.filters`:
```js
const { pageState } = useContext(PageContext);
const value = pageState.filters.find(f => f.searchKey === paramKey && f.type === 'action')?.values?.[0];
```

---

### 2. Function Declarations in Component Config

Each component's `.config.js/jsx` can optionally export a `componentFunctions` object. These
are **static declarations** — they describe what functions exist, what event triggers each one,
and what configuration args the admin must supply. No runtime logic lives here.

`trigger` is **required and meaningful**: it declares which DOM/component event the function is
bound to. The component implementation is responsible for wiring the actual event handler, but
the trigger name in the declaration is the contract that tells both the admin (shown in the menu)
and the developer (guides implementation) what event activates the function.

```js
// Card.config.jsx
export const componentFunctions = {
  providers: [
    {
      id: 'hover_highlight',
      label: 'Hover: Publish Row',
      description: 'On mouseenter, publishes a column value. Clears on mouseleave.',
      trigger: 'hover',   // required — component must bind onMouseEnter/onMouseLeave
      args: [
        {
          key: 'column',
          label: 'Column to publish',
          type: 'column-select',  // resolved from data source columns in the menu
        },
      ],
    },
  ],
  subscribers: [],
};

// spreadsheet/Spreadsheet.config.jsx
export const componentFunctions = {
  providers: [],
  subscribers: [
    {
      id: 'row_highlight',
      label: 'Highlight Matching Row',
      description: 'Highlights rows whose column value matches the incoming action param.',
      trigger: 'action_param',  // triggered by changes to a watched pageState.filters action entry
      args: [
        {
          key: 'column',
          label: 'Column to match',
          type: 'column-select',
        },
        {
          key: 'style',
          label: 'Highlight style',
          type: 'select',
          options: [
            { label: 'Background', value: 'bg' },
            { label: 'Border', value: 'border' },
            { label: 'Bold text', value: 'bold' },
          ],
        },
      ],
    },
  ],
};
```

Subscribers may also drive data-side effects (e.g., filtering the component's local data based
on the action param value). This does not replace the existing filter mechanism but is a valid
use case a component developer may implement inside their subscriber logic.

---

### 3. Instance Config (stored in element-data)

When an admin enables a function from the section menu, the configuration is written into the
section's `element-data` under a `_functions` key:

```json
// Card section element-data
{
  "display": {},
  "_functions": {
    "providers": [
      {
        "functionId": "hover_highlight",
        "enabled": true,
        "paramKey": "card_hover_status",
        "args": { "column": "status" }
      }
    ]
  }
}

// Spreadsheet section element-data
{
  "display": {},
  "_functions": {
    "subscribers": [
      {
        "functionId": "row_highlight",
        "enabled": true,
        "paramKey": "card_hover_status",
        "args": { "column": "status", "style": "bg" }
      }
    ]
  }
}
```

The `paramKey` is the **linking contract**. The admin sets the same string on both sides. There
is no central registry of links — matching is purely by key convention.

---

### 4. Runtime Implementation in Components

**Provider side (Card.jsx):**
```jsx
const { setActionParam, clearActionParam } = useContext(PageContext);
const providerCfg = state._functions?.providers?.find(p => p.functionId === 'hover_highlight' && p.enabled);

// trigger: 'hover' → component binds onMouseEnter / onMouseLeave
const handleMouseEnter = useCallback((item) => {
  if (!providerCfg) return;
  setActionParam(providerCfg.paramKey, item[providerCfg.args.column]);
}, [providerCfg, setActionParam]);

const handleMouseLeave = useCallback(() => {
  if (!providerCfg) return;
  clearActionParam(providerCfg.paramKey);
}, [providerCfg, clearActionParam]);
```

**Subscriber side (Spreadsheet.jsx):**
```jsx
const { pageState } = useContext(PageContext);
const subCfg = state._functions?.subscribers?.find(s => s.functionId === 'row_highlight' && s.enabled);

// trigger: 'action_param' → component reads from pageState.filters on every render
const highlightedValue = subCfg
  ? pageState.filters.find(f => f.searchKey === subCfg.paramKey && f.type === 'action')?.values?.[0]
  : undefined;

// In render: row gets highlight class when row[subCfg.args.column] === highlightedValue
```

Both sides are opt-in and backwards-compatible. If `_functions` is absent or disabled, the
component behaves exactly as it does today.

---

### 5. Section Menu Integration

A new **"Actions"** section is added in `getSectionMenuItems()` in `sectionMenu.jsx`, after
component settings and before Filters. It only renders if the current component declares
`componentFunctions`.

**Duplicate `paramKey` detection:** When the admin configures a provider's `paramKey`, the menu
scans all other sections on the page (available via `pageState` / `dataItems` in context) to
check if any other provider already uses that key. If a conflict is found, a warning is shown
inline (e.g., "This key is already used by another provider — last event wins"). This is a
warning only, not a hard block.

Menu item structure per function:

```js
// In getSectionMenuItems():
const componentFunctions = currentComponent?.componentFunctions;
const allSectionProviderKeys = getAllProviderKeys(dataItems); // helper scanning all sections

const fnMenuItems = [
  ...(componentFunctions?.providers || []).map(fn => ({
    id: `provider_${fn.id}`,
    icon: 'ArrowUpRight',
    name: fn.label,
    type: 'toggle',
    enabled: state._functions?.providers?.find(p => p.functionId === fn.id)?.enabled ?? false,
    setEnabled: (v) => updateAttribute('_functions', toggleFunction(state, 'providers', fn.id, v, fn)),
    items: buildFunctionArgItems(fn, state, 'providers', updateAttribute, dwAPI, allSectionProviderKeys),
  })),
  ...(componentFunctions?.subscribers || []).map(fn => ({
    id: `subscriber_${fn.id}`,
    icon: 'ArrowDownLeft',
    name: fn.label,
    type: 'toggle',
    enabled: state._functions?.subscribers?.find(s => s.functionId === fn.id)?.enabled ?? false,
    setEnabled: (v) => updateAttribute('_functions', toggleFunction(state, 'subscribers', fn.id, v, fn)),
    items: buildFunctionArgItems(fn, state, 'subscribers', updateAttribute, dwAPI, allSectionProviderKeys),
  })),
];
```

`buildFunctionArgItems` renders:
1. A `paramKey` text input (with inline duplicate warning for providers)
2. One control per entry in `fn.args`, using existing `controlItemTransformers` patterns
   - `column-select` args pull exclusively from `state.columns` (the component's active column
     list as stored in its data wrapper state). Only columns already present in the component's
     own state are shown — no free-text fallback, no cross-component column lists. If the
     component has no columns loaded, the arg renders as disabled with a "No columns available"
     message.
   - `select` args render radio submenus exactly like existing select controls

---

### 6. Optional Hooks: `useProviderFunction` / `useSubscriberFunction`

Thin hooks to reduce boilerplate in component implementations. Placed in a `.js` file (no JSX)
to stay Fast-Refresh-clean:

```js
// hooks/useComponentFunctions.js
import { useContext, useCallback } from 'react';
import { PageContext } from '../../../context';

export function useProviderFunction(state, functionId) {
  const { setActionParam, clearActionParam } = useContext(PageContext);
  const cfg = state._functions?.providers?.find(p => p.functionId === functionId && p.enabled);
  if (!cfg) return { publish: null, clear: null, cfg: null };
  return {
    cfg,
    publish: useCallback(
      (item) => setActionParam(cfg.paramKey, cfg.args?.column ? item[cfg.args.column] : item),
      [cfg, setActionParam]
    ),
    clear: useCallback(() => clearActionParam(cfg.paramKey), [cfg, clearActionParam]),
  };
}

export function useSubscriberFunction(state, functionId) {
  const { pageState } = useContext(PageContext);
  const cfg = state._functions?.subscribers?.find(s => s.functionId === functionId && s.enabled);
  if (!cfg) return { value: undefined, cfg: null };
  const value = pageState.filters.find(f => f.searchKey === cfg.paramKey && f.type === 'action')?.values?.[0];
  return { cfg, value };
}
```

---

## Implementation Sequence

1. Add `setActionParam` / `clearActionParam` to `PageContext` in `view.jsx` and `edit/index.jsx`
2. Add `componentFunctions` export to `Card.config.jsx` and `Spreadsheet.config.jsx`
3. Implement provider event binding in `Card.jsx` and subscriber read logic in `Spreadsheet.jsx`
4. Add "Actions" section to `sectionMenu.jsx` with enable/disable, paramKey input (+ duplicate
   warning), and per-arg controls
5. Extract `useProviderFunction` / `useSubscriberFunction` to `hooks/useComponentFunctions.js`
6. Add a note in `ComponentRegistry/index.jsx` documenting the `componentFunctions` export
   convention for future component authors
