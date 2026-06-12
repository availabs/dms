# Map Theme

## Purpose

This document explains how the DMS map system follows the normal DMS theme flow.

The goal is not only to theme the legend, but to make shared map UI participate in the standard DMS theme model:

- `defaultTheme` provides the base map theme
- site or pattern themes can override it
- map runtime and map editor both consume the same theme contract through `ThemeContext`

## Goal

Make shared map UI themeable across:

- page map runtime
- `map_dama`
- map editor
- shared `ui/components/map`

The current shared map theme covers:

- legend
- popup
- hover
- map icon keys

## Principles

1. Theme shared UI, not one-off layout.
Shared map visuals such as legend panels, rows, labels, hover states, surfaces, and icons should come from theme.
Context-specific sizing or positioning hacks should stay local.

2. Keep the shared menu and shared form systems generic.
Map-specific styling should live in the map system, not in unrelated shared infrastructure unless it is truly reusable.

3. Use the normal DMS theme flow.
Map components should read from `ThemeContext` and resolve theme slices with `getComponentTheme(themeFromContext, "map")`.

4. Theme first, refactor second.
First make the runtime map and editor use the same theme contract. Only then consider reducing duplicated legend markup.

## Current Structure

The shared map theme lives in:

- `src/ui/components/map/map.theme.js`

It is registered in:

- `src/ui/defaultTheme.js`

It is editable through:

- `src/ui/themeSettings.js`

It is consumed through:

- `src/ui/components/map/useMapTheme.js`
- `src/ui/components/map/useMapLegendTheme.js`

## Theme Shape

The map theme now follows the same DMS style-array pattern used by components such as `button`, `modal`, `table`, and `avlGraph`.

The shape is:

```js
map: {
  options: {
    activeStyle: 0
  },
  styles: [
    {
      name: "default",
      legend: { ... },
      popup: { ... },
      hover: { ... },
      zoomInIcon: "Plus",
      ...
    },
    {
      name: "default_2",
      ...
    }
  ]
}
```

## How It Resolves

The resolved map theme follows the normal DMS flow:

1. `defaultTheme.map` provides the base map styles
2. selected site theme can override `map`
3. `pattern.theme.map` can override it again
4. `useMapTheme()` resolves the active map style with `getComponentTheme(themeFromContext, "map")`

This means the final applied map theme is not just `map.theme.js`; that file is the base fallback.

## Shared Theme Buckets

The current shared map theme is organized into:

- icon keys at the top level
- `legend`
- `popup`
- `hover`

### Legend

Main legend keys include:

- `panel`
- `panelInner`
- `section`
- `row`
- `rowHover`
- `rowActive`
- `titleRow`
- `title`
- `label`
- `secondaryLabel`
- `groupLabel`
- `groupMetaLabel`
- `symbolWrapper`
- `symbolFill`
- `symbolCircle`
- `symbolLine`
- `horizontalPanel`
- `horizontalTrack`
- `loading`
- `empty`
- `infoIcon`
- `controlButton`
- `controlButtonActive`
- `controlButtonInactive`
- `controlButtonReveal`
- `selectorBox`

### Popup

Main popup keys include:

- `panel`
- `infoPanel`
- `menuPanel`
- `listPanel`
- `listItem`
- `listItemText`

### Hover

Main hover keys include:

- `panel`
- `title`
- `row`
- `label`
- `value`
- `removeButton`
- `pointer`

## Shared Consumers

The active shared map theme is now used by:

- page map runtime legend
- page map runtime hover popup
- `map_dama` popup and legend surfaces that were wired to the shared map hooks
- map editor legend surfaces
- map editor hover popup
- shared pinned hover wrapper in `ui/components/map/components/HoverComponent.jsx`
- shared map icon lookup in `ui/components/map/avl-map.jsx`

## Built-In Styles

The map theme currently ships with two built-in styles:

- `styles[0]` named `default`
  - this matches the older visual baseline closely
- `styles[1]` named `default_2`
  - this keeps the newer normalized variant

This lets admins or developers switch map appearance by changing:

- `map.options.activeStyle`

## Good Test Keys

Two useful keys for quick visual verification are:

- `map.styles[0].legend.panelInner`
- `map.styles[0].hover.panel`

If those change visually, the shared map theme is being applied.

## Non-Goals

This shared theme is meant for repeated map UI surfaces.

It should not absorb every local layout decision such as:

- exact on-canvas placement
- one-off width hacks
- runtime-only navigation behavior
- editor-only structural layout that is not shared

## Hover Card Plan

This section defines the next map-hover work as a structured plan before implementation expands further.

### Goal

Make map hover configurable like a small field-based card, while staying compatible with the existing DMS map and map editor flows.

For the current phase, only formatter-function support is in scope.

### Scope For This Phase

- add hover-card configuration UI through map settings
- use `UI.NavigableMenu` so the hover settings can grow into nested child screens later
- allow hover fields to store their own `formatFn`
- reuse the existing DMS formatter dropdown pattern already used by Spreadsheet and Card
- apply the selected formatter when rendering hover values
- keep old hover behavior working when no new hover-card config exists

### New Config Direction

The new hover system should use a dedicated key on the layer config:

```js
layer["hover-card"] = {
  fields: [
    {
      field: "wac_total",
      label: "WAC Total",
      formatFn: "comma",
      show: true
    }
  ]
}
```

This keeps the existing `hover` and `hover-columns` behavior backward-compatible.

### Why `UI.NavigableMenu`

The hover-card UI is expected to grow. A navigable menu structure lets us add children later without rebuilding the settings flow.

Examples of likely future children:

- field ordering
- display options
- empty value rules
- conditional formatting
- links and actions
- grouped sections

### Formatter Pattern

Formatter selection should follow the existing DMS `formatFn` select pattern already used in:

- Spreadsheet column settings
- Card field settings

This means:

- use the `formatFn` key
- render it as the normal DMS dropdown/select control
- reuse the existing formatter option list style
- do not create a custom formatter-only UI pattern

### Implementation Steps

1. Add a hover-card settings module under map settings.
2. Register a `Hover Card` entry in map settings using the navigable menu pattern.
3. Store hover-card field rows in a new `layer["hover-card"]` object.
4. Build the first child screen for listing configured hover fields.
5. Build a field editor child screen for:
   - source field
   - display label
   - `formatFn`
   - visibility
6. Reuse the existing DMS formatter options for the `formatFn` control.
7. Update runtime hover rendering to prefer `hover-card.fields` when present.
8. Fall back to legacy hover rendering when `hover-card` is missing.
9. Add safe fallback behavior for missing values and invalid formatter names.

### Backward Compatibility Rules

If a layer does not have `hover-card`, the current hover flow must continue unchanged.

If a hover-card field has no `formatFn`, show the raw value.

If a formatter key is invalid or unavailable, fall back to the raw resolved value instead of failing.

### Out Of Scope For Now

Do not add these in the current phase:

- custom hover layout redesign
- badges
- icons
- prefix or suffix rules
- field-level styling
- conditional formatting rules
- calculated expressions
- link or action behavior

These should be layered into the same navigable hover-card system later.
