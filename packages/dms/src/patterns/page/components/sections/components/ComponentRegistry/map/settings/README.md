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

## Shared UI Components

Map settings use the shared DMS UI components from `ThemeContext`.

- Searchable symbology/layer pickers use the local `MapSettingsSearchSelect` combobox.
- Standard dropdown-style settings such as `height`, `legendPosition`, `pluginControlPosition`, and dynamic-filter `dataType` use `UI.MultiSelect` with `singleSelectOnly={true}`.

This is the current DMS single-select pattern for custom settings controls. 

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

## Symbology Data Structure

The most important saved object for map rendering is the nested symbology record:

```json
{
  "symbologies": {
    "<symbologyId>": {
      "id": "<symbologyId>",
      "name": "<symbologyName>",
      "isVisible": true,
      "symbology": {
        "activeLayer": "<layerId>",
        "layers": {
          "<layerId>": {
            "id": "<layerId>",
            "name": "<layerName>",
            "view_id": 123,
            "source_id": 456,
            "layer-type": "polygons",
            "type": "fill",
            "data-column": "<columnOrJoinOutput>",
            "filter": {
              "<column>": {
                "operator": "==",
                "value": ["<value>"]
              }
            },
            "dynamic-filters": [],
            "click-filter": {
              "enabled": false,
              "mappings": []
            },
            "join": {
              "enabled": true,
              "source": {
                "viewId": 789
              },
              "featureKeyColumn": "<baseViewColumn>",
              "joinColumn": "<joinViewColumn>",
              "query": {
                "columns": [
                  "w_geocode",
                  "sum(s_000)::numeric as sum_s_000"
                ],
                "columnConfigs": [
                  {
                    "name": "s_000",
                    "alias": "Sum of Incoming Traffic",
                    "fn": "sum",
                    "group": false,
                    "includeInTile": true
                  }
                ],
                "filters": [
                  {
                    "column": "file_type",
                    "valuesText": "main,aux"
                  }
                ],
                "groupBy": ["w_geocode"]
              },
              "tileColumns": ["w_geocode", "sum_s_000"]
            }
          }
        }
      }
    }
  }
}
```

### What The Layer Keys Mean

- `view_id`
  The base geometry/data view used to render the layer.
- `source_id`
  The source metadata id used by the map/editor to discover available columns and metadata.
- `layer-type`
  The high-level rendering mode such as polygons, circles, lines, or interactive layers.
- `type`
  The MapLibre layer type used for the concrete paint/layout definition, for example `fill`, `line`, or `circle`.
- `data-column`
  The currently selected column used for styling, legends, filters, and other data-driven behavior. This can be either a base-table column or a join-produced output column.
- `filter`
  Static per-layer filters stored in the MapEditor format and translated into UDA query options at runtime.
- `dynamic-filters`
  Runtime-driven filter entries that can read from page state, search params, and interaction state.
- `click-filter`
  Layer click mapping config used to publish clicked feature values into DMS page filters and optional URL search params.

### Join Structure

`layer.join` is the saved runtime contract for the join feature. The editor writes this structure, and both MapEditor and the DMS map runtime consume it.

- `enabled`
  Turns the tile-time join behavior on for the layer.
- `source.viewId`
  The join-side UDA view id.
- `featureKeyColumn`
  The base-view column used to match the rendered feature to the join side.
- `joinColumn`
  The join-side column matched against `featureKeyColumn`.
- `query.columns`
  The SQL expressions actually selected from the join source. These are the authoritative server-side join outputs.
- `query.columnConfigs`
  The UI-facing authoring records for join columns. These store the selected source column, user label, aggregate function, grouping intent, and tile inclusion flag.
- `query.filters`
  The join-side filter rows authored in the Join panel.
- `query.groupBy`
  The join-side grouping columns used to keep join SQL valid when grouped/aggregated outputs are selected.
- `tileColumns`
  The final output column names expected to appear on the vector tile feature properties. These are the join-backed columns available to style, popup, hover, click-filter, and legend logic.

### Join Naming Rules

Join columns have two different identities:

- Technical key
  Used by the server/runtime, for example `sum_s_000`, `count_h_geocode`, or `w_geocode`.
- Display label
  Used in the UI, for example `Sum of Incoming Traffic`.

The runtime always saves and requests the technical key. The UI may display the friendly label, and MapEditor selectors may mark join-backed options with `(join)`.

### Runtime Expectations

When a layer uses `join`:

- Tile requests append an encoded `join=` payload.
- Joined output columns listed in `tileColumns` are expected on the rendered feature properties.
- If `data-column` points at a joined output, legend/color-domain requests must also include the join payload.
- Hover, popup, click-filter, and other feature resolution logic should prefer joined feature props for joined columns instead of querying the base geometry table for those fields.

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
- The `Layer` select used by Map interaction providers/subscribers is declared in config with `options: { stateKey: 'interactionOptions.mapLayers' }`.
- `MapSection` exposes that `interactionOptions.mapLayers` array through `mapAPI.state`, so the shared section menu can render layer choices without hardcoding map layer logic into the menu itself.
- Shared action values are still written to and read from `pageState.filters` with `type: "action"`.

### Config Shape

Map interaction config uses the standard `display._functions` shape and adds a layer-scoping arg:

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
      "subscribers": [
        {
          "functionId": "hover_highlight",
          "enabled": true,
          "paramKey": "shared_hover_key",
          "args": {
            "layerId": "<layerId>",
            "field": "<featureField>"
          }
        },
        {
          "functionId": "click_highlight",
          "enabled": true,
          "paramKey": "shared_click_key",
          "args": {
            "layerId": "<layerId>",
            "field": "<featureField>"
          }
        }
      ]
    }
  }
}
```

### How Layer Scoping Works

- `layerId` determines which map layer owns the provider/subscriber.
- `field` determines which feature property is published or matched.
- `paramKey` determines which shared page action filter is written or read.

This keeps the interaction system generic:

- no hardcoded layer names
- no hardcoded feature fields
- no direct map-to-component communication
- layer options are data-driven from map state, not hardcoded in the shared menu

If multiple layers intentionally use the same `paramKey`, the latest interaction wins. That is a configuration choice, not a map-specific rule.

If you want hover and click subscriber behavior to stay separate, use different `paramKey` values for hover and click. The current shared action-filter payload only distinguishes action entries by `searchKey` and `type: "action"`, so two different publishers using the same key will intentionally share the same action value.

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

Hover subscriber:

1. The runtime finds the enabled `hover_highlight` config for the current map layer.
2. It reads the current action filter from `pageState.filters` using `paramKey`.
3. It matches the incoming value against the configured layer field.
4. It renders a temporary highlight overlay above the base map layer for matching features.
5. When the hover action filter clears, the highlight overlay is removed.

Click subscriber:

1. The runtime finds the enabled `click_highlight` config for the current map layer.
2. It reads the current action filter from `pageState.filters` using `paramKey`.
3. It matches the incoming value against the configured layer field.
4. It renders a highlight overlay above the base map layer for matching features.
5. The highlight remains until the click action value changes or clears.

### How `SymbologyViewLayer.jsx` Handles Each Action

`SymbologyViewLayer.jsx` is the runtime entry point for both provider and subscriber behavior.

#### Hover Publish

- Collects all map layers that can participate in hover interactions.
- Registers one shared `mousemove` / `mouseleave` handler for the owning map layer instance.
- Queries rendered features under the pointer.
- Finds the configured `hover_publish` entry whose `args.layerId` matches the interacted logical layer.
- Resolves the configured field value from the feature.
- Calls `setActionParam(paramKey, value)`.
- On leave, calls `clearActionParam(paramKey)`.

#### Click Publish

- Collects all map layers that can participate in click publish.
- Registers one shared map click handler.
- Finds the clicked rendered feature for the configured logical layer.
- Resolves the configured field value from the feature.
- Calls `setActionParam(paramKey, value)`.

#### Click Filter Updates

Map still supports the existing click-filter behavior separately from provider/subscriber actions.

- On click, the runtime also evaluates any enabled `click-filter` mappings.
- Matching mapped values are merged into page filters through `updatePageStateFilters(...)`.
- This is separate from the provider/subscriber system, even though both run inside the same click handler.

#### Hover Highlight Subscriber

- Reads the enabled `hover_highlight` entry for the current logical layer from `display._functions.subscribers`.
- Looks up the current shared action value in `pageState.filters` using `paramKey`.
- Queries rendered features from the configured map layer.
- Resolves the configured field on each feature.
- Builds a GeoJSON overlay from matching rendered features.
- Adds a temporary highlight layer above the base layer.
- Removes that overlay when the hover action value clears or the layer refreshes.

How the map layer is affected:

- The original configured map layer is not edited or recolored directly.
- Instead, Map creates a second temporary render layer for the same logical layer.
- That temporary layer sits above the base layer and only contains the matched features.
- When the hover subscriber value changes, the temporary hover highlight layer is rebuilt from the latest matching features.
- When hover clears, only the temporary hover highlight layer is removed; the original layer keeps rendering normally.

#### Click Highlight Subscriber

- Reads the enabled `click_highlight` entry for the current logical layer from `display._functions.subscribers`.
- Looks up the current shared action value in `pageState.filters` using `paramKey`.
- Queries rendered features from the configured map layer.
- Resolves the configured field on each feature.
- Builds a GeoJSON overlay from matching rendered features.
- Adds a highlight layer above the base layer.
- Keeps that overlay until the subscribed action value changes or disappears.

How the map layer is affected:

- The original configured map layer remains the main render layer.
- Map adds a separate temporary click highlight layer above it.
- That temporary layer is built only from the features whose configured field matches the current subscribed value.
- If a new click subscriber value arrives, the old click highlight layer/source is removed and rebuilt for the new match set.
- If the click subscriber value disappears, the temporary click highlight layer is removed and the base layer continues unchanged.

#### Why The Highlight Uses A GeoJSON Overlay

The subscriber highlight does not directly mutate the base vector source or base symbology paint.

Instead it:

- queries the rendered features already on the map
- resolves the configured match field
- creates a temporary GeoJSON source for the matched features
- renders a separate highlight layer from that source

This is safer in the current architecture because it avoids:

- mutating the base layer style
- assuming the subscriber field is always available in the rendered source filter context
- interfering with existing layer/source refresh logic

In practice, each subscriber highlight cycle looks like this:

1. Read the subscriber config for the current logical layer.
2. Read the current shared action value from `pageState.filters`.
3. Query the rendered map features for that base layer.
4. Keep only the features whose configured field matches the subscriber value.
5. Remove any previous temporary highlight layer/source for that same mode (`hover` or `click`).
6. Create a fresh GeoJSON source from the matched features.
7. Add a fresh temporary highlight layer above the base layer.

#### Highlight Style Defaults

Map currently uses a fixed fallback highlight style:

- `fill`: yellow fill with dark outline
- `line`: yellow line
- `circle`: yellow circle with dark outline

Layer types use those values like this:

- `fill`
  - fill color + fill opacity
  - outline color from stroke color/stroke opacity
- `line`
  - line color + line opacity
- `circle`
  - circle fill color + fill opacity
  - circle stroke color + stroke opacity

#### Cleanup Behavior

Subscriber highlight layers are removed:

- when the subscribed value no longer exists
- when the component unmounts
- before layer/source teardown during map refresh

This cleanup is important because MapLibre will throw if a source is removed while a highlight layer is still attached to it.

One important detail:

- During a normal map refresh, `SymbologyViewLayer.jsx` removes old temporary subscriber highlight layers first.
- Then it updates or rebuilds the base layer/source.
- After the base layer is ready again, the subscriber effect can add the temporary hover/click highlight layer back if a subscribed value is still active.

So yes, the highlight layer is intentionally removed and later re-appended as part of the refresh-safe lifecycle.

### Why This Uses `display._functions`

The current implementation keeps Map aligned with standard DMS interaction behavior:

- the shared section menu edits interaction config
- `componentFunctions` remains the static declaration point
- runtime logic in `SymbologyViewLayer.jsx` decides which configured layer should publish or highlight

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

## Tile Joins

Map layers can optionally carry a tile-time join under:

```json
symbologies["<symbologyId>"].symbology.layers["<layerId>"].join
```

The V1 config shape is:

```json
{
  "enabled": true,
  "featureKeyColumn": "geoid",
  "source": {
    "sourceId": 123,
    "viewId": 456,
    "env": "npmrds2"
  },
  "joinColumn": "w_geocode",
  "query": {
    "filters": {
      "filter": {
        "job_type": ["JT00"],
        "file_type": ["main", "aux"]
      }
    },
    "groupBy": ["w_geocode"],
    "columns": [
      "w_geocode",
      "sum(s_000)::numeric as sum_s_000"
    ]
  },
  "tileColumns": ["sum_s_000"]
}
```

### What The Fields Mean

- `featureKeyColumn`
  Geometry-side join key on the rendered layer.
- `source.viewId`
  Joined analytical view queried at tile request time.
- `joinColumn`
  Output column from the join query matched to the geometry key.
- `query.filters`
  UDA-style filter options for the join query.
- `query.groupBy`
  Columns that collapse the join side to one row per join key.
- `query.columns`
  SQL select expressions emitted by the join query builder.
- `tileColumns`
  Join-query outputs exposed as vector-tile feature properties.

### Tile `join` Param

When the join is enabled, tile requests append an encoded `join` param:

```json
{
  "viewId": 456,
  "localKey": "geoid",
  "joinKey": "w_geocode",
  "options": {
    "filter": {
      "job_type": ["JT00"],
      "file_type": ["main", "aux"]
    },
    "groupBy": ["w_geocode"]
  },
  "attributes": [
    "w_geocode",
    "sum(s_000)::numeric as sum_s_000"
  ],
  "tileCols": ["sum_s_000"]
}
```

The tile route reuses the UDA SQL builder and composes:

- `WITH joined_cte AS (<UDA SQL>)`
- `LEFT JOIN joined_cte ON geo."<localKey>" = joined_cte."<joinKey>"`

### V1 Limits

- The join query must return at most one row per join key.
- V1 does not prevent row fan-out or column-name collisions.
- The join view must be in the same Postgres `pgEnv`.
- Joined aliases such as `sum_s_000` are tile-time properties, not physical geometry-table columns.
- An index on the join column is the main performance lever for large joined tables.

### DMS Runtime Behavior

The page-level DMS `map` component consumes `layer.join` as a runtime feature. It does not provide a separate join editor, but it does honor join outputs anywhere the live map needs them.

- Tile URLs append the encoded `join` payload when the layer join is enabled.
- Joined output columns can be used as `data-column` values for choropleth / circle styling.
- Runtime legend refresh sends the same `join` payload into `colorDomain` requests when the styled column comes from the join.
- Hover and popup reads prefer tile feature props first, then resolve missing join-backed fields from the joined view instead of the geometry table.
- Layer click filters can target join outputs. When the clicked field belongs to the join, the map resolves it from the join-side view before updating page filters or search params.

### MapEditor Join UX

MapEditor now treats join outputs as first-class selectable columns across the editor.

- Style selectors, popup selectors, click-filter mappings, normal filters, and dynamic filters can all include join outputs.
- Join-backed options keep their technical saved key, but use the configured display label in the UI when available.
- Selectors mark join-backed options with a lightweight `(join)` suffix so authors can tell them apart from base-table columns.
