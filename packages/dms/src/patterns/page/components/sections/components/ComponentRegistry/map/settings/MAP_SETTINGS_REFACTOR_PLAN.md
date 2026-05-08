# Map Settings Refactor Plan

## Goal
Move the map toolbar settings into the Settings panel while keeping the old map behavior unchanged.

## Reused Existing Behavior
The refactored UI still uses the same underlying map config and handlers:
- Symbology selector loading and selection
- Layer selector loading and selection
- Filter updates on the active layer
- "More" display settings like height and legend position
- URL/search param and interactive filter updates

## Current UI Flow
- Map Settings main screen
  - Symbology
  - Layer
  - Filters
  - Height
  - Legend Position
  - Zoom/pan
  - Set initial viewport
  - Use blank basemap
  - Zoom to Fit
- Filters screen
  - Use Page Filters
  - Key Search Param
  - Interactive Filter
  - Dynamic Filter
  - Layer Click Filter
- Filter detail screens
  - Interactive Filter
  - Dynamic Filter
  - Layer Click Filter

## File Responsibilities
- `controls.jsx`
  - Renders the Map Settings screens and navigation rows.
- `state.jsx`
  - Combines the screen-specific settings helpers into one panel API.
- `symbologySelector.jsx`
  - Loads available symbologies and derives selected symbology/layer state.
- `symbology.jsx`
  - Exposes symbology picker values for the panel.
- `layers.jsx`
  - Exposes layer picker values for the panel.
- `filters.jsx`
  - Exposes active-layer filter values and update handlers.
- `more.jsx`
  - Exposes display-style settings shown inline on the main screen.

## Developer Rules
- Do not change the saved config shape.
- Do not create separate local state that bypasses the map config.
- Do not hardcode symbology names or layer names.
- Keep functionality aligned with the old toolbar controls.
- Keep the Settings UI flow consistent with Spreadsheet Settings.
- Keep `Filters` as a drill-in screen and keep `More` inline on the main screen.
