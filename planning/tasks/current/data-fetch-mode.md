# Task: Data Fetch Mode — 3-behavior selector

## Objective

Replace the two confusing/broken data-fetch toggles in the section menu (Card, Spreadsheet, Graph) with a single 3-option select that cleanly expresses the three supported behaviors.

## Scope

- UI: replace 2 toggles → 1 select in 4 config files
- Logic: add `bypassDedup` param to `useDataLoader.js`
- Wiring: compute `fetchMode` from state in `dataWrapper/index.jsx` View
- Backward compat: existing sections with `readyToLoad` bool continue to work

## Current State

Two toggles exist in `controls.data` for Card, Spreadsheet, Graph (both):
- **"Always Fetch Data"** (`key: readyToLoad`) — stored in `display.readyToLoad`, wired in `index.jsx` View's `useDataLoader` call
- **"Prevent Duplicate Fetch"** (`key: preventDuplicateFetch`) — **dead code**. Stored in display state but never read by `useDataLoader.js`. The old dedup logic it connected to was replaced by `computeFetchKey`/`lastFetchKeyRef` (always-active dedup).

Current `useDataLoader.js` main effect:
1. Gate: `if (!readyToLoad) return;` — prevents all fetching (Behavior 1: cache)
2. Dedup: `if (fetchKey === lastFetchKeyRef.current) return;` — always active, no way to bypass (missing Behavior 3)
3. Fetch — (Behavior 2: smart)

In View, `readyToLoad` = `isValidState && (display.readyToLoad || display.allowEditInView)`.

## 3 Behaviors

| # | Name | `fetchMode` value | `readyToLoad` passed | Dedup bypassed |
|---|------|-------------------|---------------------|----------------|
| 1 | Always Use Cache | `'cache'` | `false` | n/a |
| 2 | Smart Fetch (default) | `'smart'` | `true` | no |
| 3 | Force Fetch | `'force'` | `true` | yes |

## Backward Compatibility

Old sections have `display.readyToLoad: bool` and no `fetchMode`. Helper in `index.jsx`:
- `display.fetchMode` present → use directly
- `display.readyToLoad === true` → treat as `'smart'`
- otherwise → treat as `'cache'`

Graph defaults `readyToLoad: false` in its `defaultState.display` → maps to `'cache'` (no behavior change).

## Files Requiring Changes

- [x] `ComponentRegistry/Card.config.jsx` — remove 2 toggles, add fetchMode select in `controls.data`
- [x] `ComponentRegistry/spreadsheet/config.jsx` — same
- [x] `ComponentRegistry/graph_new/config.jsx` — same
- [x] `ComponentRegistry/graph/config.jsx` — same
- [x] `dataWrapper/useDataLoader.js` — add `bypassDedup = false` param, use it in dedup check, add to effect deps; also removed `!isDms` exception from dedup condition
- [x] `dataWrapper/index.jsx` — add `getFetchMode` helper, update View's `useDataLoader` call

## Proposed Changes

### Config files (4 files, identical pattern)

Remove from `controls.data`:
```javascript
{ type: 'toggle', label: 'Prevent Duplicate Fetch', key: 'preventDuplicateFetch' },
{ type: 'toggle', label: 'Always Fetch Data',       key: 'readyToLoad' },
```

Add to `controls.data`:
```javascript
{ type: 'select', label: 'Data Fetch Mode', key: 'fetchMode',
  options: [
    { label: 'Cache (use preloaded data)', value: 'cache' },
    { label: 'Smart (fetch on change)',    value: 'smart' },
    { label: 'Force (always re-fetch)',    value: 'force' },
  ]
},
```

### `useDataLoader.js`

```javascript
// Param:
export function useDataLoader({ state, setState, apiLoad, component, readyToLoad, bypassDedup = false }) {

// In main load effect — change dedup line (also remove the isDms special-case;
// DMS sources should follow fetchMode the same as any other source):
// Before:
if (fetchKey === lastFetchKeyRef.current && !state.externalSource?.isDms) return;
// After:
if (!bypassDedup && fetchKey === lastFetchKeyRef.current) return;

// Effect dep array: add bypassDedup
}, [fetchKey, readyToLoad, bypassDedup, isValidState, hasLocalFilters, localFilters]);
```

### `dataWrapper/index.jsx`

Add helper before View component:
```javascript
const getFetchMode = (display) => {
    if (display?.fetchMode) return display.fetchMode;
    return display?.readyToLoad === true ? 'smart' : 'cache';
};
```

Update View's `useDataLoader` call:
```javascript
const fetchMode = getFetchMode(state?.display);
const { loading, currentPage, onPageChange, outputSourceInfo } = useDataLoader({
    state, setState, apiLoad, component,
    readyToLoad: isValidState && (fetchMode !== 'cache' || state?.display?.allowEditInView),
    bypassDedup: fetchMode === 'force',
});
```

`setReadyToLoad` (Pagination's infinite scroll trigger) still sets `display.readyToLoad = true` at runtime — `getFetchMode` sees this and treats it as 'smart', enabling the page-change fetch. No change needed to Pagination or `usePageFilterSync`.

Edit mode is unchanged (always `readyToLoad: isValidState`, dedup active).

## Testing Checklist

- [ ] New section (Card/Spreadsheet): set mode → Smart → data loads, filter changes re-fetch, same-config repeat skips fetch
- [ ] Set mode → Cache → no API calls in network tab, preloaded/blank data shown
- [ ] Set mode → Force → repeated filter open/close triggers fetch each time (network tab shows repeated requests)
- [ ] Existing section with `readyToLoad: true` (no fetchMode) → still fetches (compat)
- [ ] Existing section with `readyToLoad: false` → still cached (compat)
- [ ] Graph defaults: still cache mode (no behavior change)
- [ ] Pagination / infinite scroll still works (setReadyToLoad transient flag functional)
- [ ] Edit mode unchanged (data loads on valid state)
