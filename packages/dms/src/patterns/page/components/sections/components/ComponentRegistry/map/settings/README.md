# Map Settings

## Purpose

The `map/settings` package provides the Settings-panel UI for configuring a page-level map section.

This refactor moves map controls out of the old toolbar/dropdown UI and into the shared Settings panel without changing the underlying saved map config or the runtime map behavior. The settings layer is intentionally thin:

- It reads from the same `state` object used by `MapSection`.
- It writes through the same `setState` updater used by the map itself.
- It reuses the same symbology, layer, filter, and display configuration keys that already power rendering.

The main goal is UI relocation and organization, not a new schema.

## What Changed In The Refactor

Before this refactor, map configuration was edited from toolbar-style controls rendered alongside the map.

After this refactor:

- Symbology, layer, and filter controls live in the Settings panel.
- "More" display settings are shown inline on the main settings screen.
- Filter settings are grouped into a drill-in flow instead of a single dropdown.
- The map still saves and consumes the same config keys as before.

What did **not** change:

- The saved config shape is still owned by `MapSection`.
- The active layer still drives filter editing.
- Symbology loading still comes from `doApiLoad()`.
- Existing runtime behavior for interactive filters, dynamic filters, legend placement, blank basemap, zoom/pan, and viewport capture is preserved.

## File Responsibilities

- `controls.jsx`
  Renders the Settings-panel screens and input controls.
- `state.jsx`
  Combines the screen-specific settings hooks into one panel API.
- `symbologySelector.jsx`
  Loads available symbologies and derives the selected symbology/layer state.
- `symbology.jsx`
  Exposes symbology picker values and handlers.
- `layers.jsx`
  Exposes layer picker values and handlers.
- `filters.jsx`
  Exposes active-layer filter data and update handlers.
- `more.jsx`
  Exposes display and map-behavior settings shown on the main settings screen.

## Saved Config Shape

The saved config remains the map section state owned by [`map/index.jsx`](/home/sarang/Documents/avail/transportNY/src/modules/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/index.jsx).

At a high level, the shape looks like this:

```json
{
  "tabs": [
    {
      "name": "Layers",
      "rows": []
    }
  ],
  "symbologies": {
    "<symbologyId>": {
      "id": "<symbologyId>",
      "name": "<symbologyName>",
      "isVisible": true,
      "symbology": {
        "id": "<symbologyId>",
        "activeLayer": "<layerId>",
        "layers": {
          "<layerId>": {
            "id": "<layerId>",
            "name": "<layerName>",
            "usePageFilters": true,
            "searchParamKey": "<paramKey>",
            "selectedInteractiveFilterIndex": 0,
            "interactive-filters": [
              {
                "label": "<label>",
                "searchParamValue": "<value>"
              }
            ],
            "dynamic-filters": [
              {
                "column_name": "<column>",
                "display_name": "<label>",
                "searchParamKey": "<paramKey>",
                "defaultValue": "<default>",
                "values": ["<default>"],
                "dataType": "numeric"
              }
            ],
            "click-filter": {
              "enabled": true,
              "mappings": [
                {
                  "variable": "<variableName>",
                  "field": "<layerField>",
                  "useSearchParams": false
                }
              ]
            }
          }
        },
        "plugins": {},
        "pageFilters": [],
        "zoomToFilterBounds": []
      }
    }
  },
  "setInitialBounds": false,
  "initialBounds": null,
  "hideControls": false,
  "height": "full",
  "zoomPan": true,
  "zoomToFitBounds": false,
  "legendPosition": "top-right",
  "pluginControlPosition": "top-left",
  "blankBaseMap": false,
  "basemapStyle": "Default"
}
```

### Notes On The Shape

- Top-level keys such as `height`, `zoomPan`, `legendPosition`, `pluginControlPosition`, `setInitialBounds`, `initialBounds`, `zoomToFitBounds`, `blankBaseMap`, and `basemapStyle` are page-level map settings.
- Layer-specific settings live under `symbologies[<symbologyId>].symbology.layers[<layerId>]`.
- Filter editing always targets the currently active layer.
- Only one symbology is actively selected for editing in the current settings flow. The selected symbology is the visible one in `state.symbologies`.
- Some runtime-only values, such as `pageFilters` and `zoomToFilterBounds`, may be populated while the map is running.

## How Settings Are Read

### Source Of Truth

The Settings panel does not maintain a separate map-settings store.

- `MapSection` initializes map state from the saved `value` prop.
- `MapSection` exposes `state`, `setState`, and `doApiLoad` through `mapAPI`.
- `map/settings/state.jsx` builds a settings API by composing focused hooks around that shared `mapAPI`.

### Selection Model

The current selection is derived as follows:

- The selected symbology is the first entry in `state.symbologies`, or more specifically the visible symbology used by the map flow.
- The selected layer is `state.symbologies[activeSymbology].symbology.activeLayer`.
- Filter controls read from that active layer.

### Filter Reads

`filters.jsx` derives:

- `activeLayer`
- `interactiveFilterOptions`
- `dynamicFilterOptions`
- click-filter mappings via `normalizeLayerClickFilterConfig(...)`
- the currently active interactive filter via `selectedInteractiveFilterIndex`

That means the Settings panel always reflects the same layer/filter configuration the map renderer is already using.

## How Settings Are Written

All writes go through `setState(draft => { ... })`. The Settings panel updates the same nested config paths that the previous toolbar controls used.

### Top-Level Map Settings

Examples of page-level writes:

- `draft.height = value`
- `draft.legendPosition = value`
- `draft.pluginControlPosition = value`
- `draft.zoomPan = value`
- `draft.zoomToFitBounds = value`
- `draft.blankBaseMap = value`
- `draft.setInitialBounds = value`

When `setInitialBounds` is turned off, `initialBounds` is cleared:

```js
draft.setInitialBounds = false;
draft.initialBounds = undefined;
```

### Symbology And Layer Selection

Changing symbology replaces the selected entry in `draft.symbologies` with the loaded symbology record and marks it visible:

```js
draft.symbologies = {
  [nextSymbologyId]: {
    ...loadedSymbology,
    isVisible: true
  }
};
```

Changing layer updates:

```js
draft.symbologies[activeSymbologyId].symbology.activeLayer = nextLayerId;
```

### Layer Filter Writes

Examples of active-layer writes:

- `usePageFilters`
- `searchParamKey`
- `interactive-filters[n].searchParamValue`
- `selectedInteractiveFilterIndex`
- `dynamic-filters[n].searchParamKey`
- `dynamic-filters[n].defaultValue`
- `dynamic-filters[n].values`
- `dynamic-filters[n].dataType`
- `click-filter.mappings[n].useSearchParams`

One important detail: when a dynamic filter default changes, the settings flow updates both `defaultValue` and `values` so runtime filtering stays in sync.

## Save Flow

`MapSection` remains responsible for persistence.

The flow is:

1. The section loads the saved config from `value` into local Immer state.
2. Settings-panel controls update that shared state through `setState`.
3. A `useEffect` in `MapSection` calls `onChange(state)` when the editable map state changes.
4. The section owner persists that updated object.

This means the Settings refactor changed where edits happen in the UI, but not how the section ultimately saves.

## Map Interactions

Map interactions now follow the same DMS provider/subscriber pattern used by other interactive components.

### Source Of Truth

- Static interaction capabilities are declared in [`map/config.jsx`](/home/sarang/Documents/avail/transportNY/src/modules/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/config.jsx) through `componentFunctions`.
- Instance-level interaction config is stored on the map section state under `display._functions`.
- The `Layer` select used by Map interaction providers is declared in config with `options: { stateKey: 'interactionOptions.mapLayers' }`.
- `MapSection` exposes that `interactionOptions.mapLayers` array through `mapAPI.state`, so the shared section menu can render layer choices without hardcoding map layer logic into the menu itself.
- Shared action values are still written to and read from `pageState.filters` with `type: "action"`.

### Config Shape

Map provider config uses the standard `display._functions` shape and adds a layer-scoping arg:

```json
{
  "display": {
    "_functions": {
      "providers": [
        {
          "functionId": "hover_publish",
          "enabled": true,
          "paramKey": "shared_hover_key",
          "args": {
            "layerId": "<layerId>",
            "field": "<featureField>"
          }
        },
        {
          "functionId": "click_publish",
          "enabled": true,
          "paramKey": "shared_click_key",
          "args": {
            "layerId": "<layerId>",
            "field": "<featureField>"
          }
        }
      ],
      "subscribers": []
    }
  }
}
```

### How Layer Scoping Works

- `layerId` determines which map layer owns the provider.
- `field` determines which feature property is published.
- `paramKey` determines which shared page action filter is written.

This keeps the interaction system generic:

- no hardcoded layer names
- no hardcoded feature fields
- no direct map-to-component communication
- layer options are data-driven from map state, not hardcoded in the shared menu

If multiple layers intentionally use the same `paramKey`, the latest interaction wins. That is a configuration choice, not a map-specific rule.

### Runtime Flow

Hover provider:

1. A feature is hovered.
2. The runtime finds the enabled `hover_publish` config whose `args.layerId` matches the interacted layer.
3. The runtime reads `feature.properties[args.field]`.
4. It publishes that value with `setActionParam(paramKey, value)`.
5. On hover end, it clears that same action key with `clearActionParam(paramKey)`.

Click provider:

1. A feature is clicked.
2. The runtime finds the enabled `click_publish` config whose `args.layerId` matches the interacted layer.
3. The runtime reads `feature.properties[args.field]`.
4. It publishes that value with `setActionParam(paramKey, value)`.

### Why This Uses `display._functions`

The current implementation keeps Map aligned with standard DMS interaction behavior:

- the shared section menu edits interaction config
- `componentFunctions` remains the static declaration point
- runtime logic in `SymbologyViewLayer.jsx` decides which configured layer should publish

This means Map stays inside the same provider/subscriber ecosystem as Card and Spreadsheet, while still allowing provider behavior to be layer-specific.

## Previous Behavior vs New Behavior

### Previous

- Editing happened in map-local toolbar dropdowns such as `FilterControls` and `MoreControls`.
- The controls were visually tied to the map canvas.

### New

- Editing happens in the shared Settings panel.
- Filters are organized as a drill-in screen.
- Main display settings remain on the top-level map settings screen for quicker access.

### Same Under The Hood

- Same `state` object
- Same nested config keys
- Same `setState` update pattern
- Same `doApiLoad()` symbology loading
- Same layer/filter behavior at render time

## Adding A New Map Setting

When adding a setting, treat the map state in `MapSection` as the source of truth.

### Recommended Process

1. Decide whether the setting is page-level or active-layer-level.
2. Confirm the saved key already exists, or add it deliberately in `map/index.jsx` state initialization if this is a real schema addition.
3. Expose a read value and write handler from the appropriate settings hook:
   - `more.jsx` for page-level display/behavior settings
   - `filters.jsx` for active-layer filter settings
   - `symbology.jsx` or `layers.jsx` for selection behavior
4. Re-export that handler through `state.jsx`.
5. Render the control in `controls.jsx`.
6. Verify the change updates the live map and persists through `onChange(state)`.

### Rules To Follow

- Do not introduce separate local state that can drift from `MapSection`.
- Do not invent a parallel saved shape just for the Settings panel.
- Do not hardcode symbology IDs, layer IDs, filter names, or plugin names.
- Prefer deriving the active target from the visible symbology and its `activeLayer`.
- Keep behavior aligned with the map’s existing runtime expectations.

## Migration Notes And Compatibility Concerns

### No Intended Schema Migration

This refactor is intended to be schema-compatible. Existing map configs should continue to load because the settings UI writes the same keys the previous toolbar controls wrote.

### Click-Filter Compatibility

`click-filter` reads are normalized through `normalizeLayerClickFilterConfig(...)`.

That helper supports a legacy single-mapping shape:

```json
{
  "enabled": true,
  "variable": "<variableName>",
  "field": "<layerField>"
}
```

and exposes it as:

```json
{
  "enabled": true,
  "mappings": [
    {
      "variable": "<variableName>",
      "field": "<layerField>",
      "useSearchParams": false
    }
  ]
}
```

Future writes should treat `mappings` as the canonical editable structure.

### Runtime-Derived Fields

Some fields are updated by runtime behavior rather than by direct author input:

- `initialBounds` is captured after `setInitialBounds` is enabled and the map reports bounds.
- `pageFilters` is copied onto the active symbology during page-filter synchronization.
- `zoomToFilterBounds` is computed from active dynamic filters.

These should not be treated as independent Settings-panel state.

### Default Values

If a saved config omits some top-level keys, `MapSection` still applies defaults during initialization, including:

- `height: "full"`
- `zoomPan: true`
- `zoomToFitBounds: false`
- `legendPosition: "top-right"`
- `pluginControlPosition: "top-left"`
- `basemapStyle: "Default"`

## Practical Checklist For Future Changes

- Read from `mapAPI.state`.
- Write through `mapAPI.setState`.
- Keep examples and logic generic across symbologies and layers.
- Update the setting where the runtime map already expects it.
- Preserve compatibility unless a deliberate schema migration is planned.
