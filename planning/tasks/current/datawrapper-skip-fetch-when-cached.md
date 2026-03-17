# DataWrapper: Skip API Fetch When "Always Fetch Data" Is Off

## Objective

When a dataWrapper component has "Always Fetch Data" toggled OFF, its data should be served from its saved `element-data` state — no API call should happen. Currently, Graph components (and others) always get preloaded and fetched because `readyToLoad` gets permanently set to `true` via Pagination's auto-set mechanism and then saved into `element-data`.

## Root Cause

Graph components don't initialize `readyToLoad` in their default state (`graphOptions` in `ComponentRegistry/graph/index.jsx`). The chain:

1. Graph created → `display.readyToLoad` is `undefined`
2. `Pagination.jsx` mounts → sees `!usePagination && !readyToLoad` → calls `setReadyToLoad(true)`
3. Data fetches → `onChange(JSON.stringify({...state, ...}))` saves state with `readyToLoad: true`
4. Every subsequent load: saved `element-data` has `readyToLoad: true` → preload always runs

Once `readyToLoad` is baked into saved state as `true`, Graph components always preload and always fetch — even if the user later toggles "Always Fetch Data" OFF (because Pagination re-sets it on mount).

## Key Files

### Where readyToLoad gets auto-set (the bypass)
- **`dataWrapper/components/Pagination.jsx:11-15`** — auto-sets `readyToLoad = true` for non-paginated views

### Where the preload gate checks readyToLoad
- **`api/preloadSectionData.js:205-210`** — skips preload when `!readyToLoad && !allowEditInView` (correct logic, but readyToLoad is already true from Pagination)

### Where the component-level fetch gate checks readyToLoad
- **`dataWrapper/index.jsx:676`** — data request building gate
- **`dataWrapper/index.jsx:719`** — data fetch gate

### Where readyToLoad gets persisted
- **`dataWrapper/index.jsx:735`** — `onChange(JSON.stringify({...state, ...}))` saves state with readyToLoad=true baked in

### Graph default state (missing readyToLoad)
- **`ComponentRegistry/graph/index.jsx:63-69`** — `graphOptions` doesn't include `readyToLoad`

### Toggle UI (exists but is already true by mount time)
- **`graph/AppearanceControls.jsx`** — has "Always Fetch Data" toggle, but readyToLoad is already true

## Proposed Fix

### Pagination.jsx — Don't override user intent

The Pagination auto-set should only trigger when the component has never had its readyToLoad explicitly configured. The simplest guard: don't auto-set if the component already has cached data (indicating it's been loaded and saved before).

```js
useEffect(() => {
    // Only auto-set for fresh components with no cached data.
    // Components with saved data already have readyToLoad set intentionally.
    if (!state.display.usePagination && !state.display.readyToLoad
        && setReadyToLoad && !state.data?.length) {
        setReadyToLoad(true);
    }
}, [state.display.usePagination, state.display.readyToLoad, setReadyToLoad]);
```

### Graph default state — Default readyToLoad to false

In `ComponentRegistry/graph/index.jsx`, add `readyToLoad: false` to `graphOptions` so new graphs start with fetch OFF:

```js
const graphOptions = {
    readyToLoad: false,
    // ...existing options
}
```

### Preload gate — No change needed

The check in `preloadSectionData.js` is correct as-is. Once `readyToLoad` is properly managed (not auto-set by Pagination), the preload will correctly skip components where it's false/undefined.

## Implementation — DONE

### Changes made

1. **`dataWrapper/components/Pagination.jsx:11-15`** — Added `!state.data?.length` guard to the auto-set. Now only sets `readyToLoad = true` for fresh components with no cached data. Components with saved data keep their user-configured `readyToLoad` value.

2. **`ComponentRegistry/graph/index.jsx:17`** — Added `readyToLoad: false` to `graphOptions` default state so new graphs start with fetch OFF.

**Note:** Spreadsheet and Card also lack `readyToLoad` in their defaults, but they have `usePagination: true` by default, so the Pagination auto-set condition (`!usePagination`) is false and they don't get auto-triggered. The Pagination guard fix protects all components regardless.

## Testing Checklist

- [ ] Existing graph with "Always Fetch Data" OFF: no API call on page load, uses cached data
- [ ] Existing graph with "Always Fetch Data" ON: fetches on page load (preload or component-level)
- [ ] New graph (first time): readyToLoad defaults to false, no fetch until user interaction or toggle
- [ ] Spreadsheet with "Always Fetch Data" OFF: same skip behavior
- [ ] Filter interaction still triggers fetch regardless of toggle
- [ ] `allowEditInView` ON still triggers fetch regardless of toggle
- [ ] Paginated views unaffected (Pagination only auto-sets for non-paginated)
- [ ] Saved state round-trips correctly after fix
