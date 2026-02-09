# DMS Todo

## cli

- [x] DMS CLI tool (`packages/dms/cli/`) — terminal access to DMS data via shared API code and Falcor protocol (sites, patterns, pages, sections, datasets)
- [ ] DMS MCP Server — Claude tool for reading, creating, and editing DMS pages/sections via structured MCP tools (Lexical builder, .dmsrc-aware config)

## api

## dms-manager

- [x] Centralize format initialization (`updateAttributes`/`updateRegisteredFormats`) — remove duplicated definitions from patterns, add `initializePatternFormat` helper

## dms-server

- [x] Add SQLite compatibility
- [x] Fix createData dropping data argument (draft_sections bug)
- [x] Fix SQLite searchOne returning null for root page (falsy `||` + `->>` type mismatch)
- [ ] Implement `uda` routes in dms-server
- [ ] Implement auth in dms-server

## ui

- [x] Lexical plaintext normalization — move plaintext-to-Lexical-JSON conversion to shared `parseValue()` so HTML view path handles plaintext
- [x] Lexical sync HTML render — eliminate View jitter by using synchronous `editorState.read()` + `useMemo` instead of async `useEffect`
- [x] Fix theme merge for array fields (replace instead of deep merge)
- [x] Move widgets to top-level theme (out of layout.options)
- [x] Redesign widget system (key/value format, combine definitions + components, additive merge)
- [x] Theme merging issues — styles arrays merge by index causing cross-contamination (e.g., Dark style bleeds into Inline Guidance in mnyv1 lexical)
- [x] Standardize component theme default fill-in — move sparse style expansion to `getComponentTheme()` (see `ui/UI_PROGRESS.md`)

### ui/lexical-textsettings

- [x] Phase 0: Lexical analysis and cleanup (dead code removal, upstream comparison, table plugin updates)
- [ ] Phase 1: Lexical + textSettings foundation (convert theme to options/styles, create useLexicalTheme hook, replace custom UI components)
- [ ] Phase 2: Propagate textSettings to core components (Table, Card, Input, Select, Button, NavigableMenu, etc.)
- [ ] Phase 3: Documentation and migration (update docs, create migration guide, add textSettings to theme editor)

## patterns

### patterns/page

- [x] Fix nav2Level baseUrl bug and move to page pattern
- [x] Move lexical component inline controls (style, bgColor, showToolbar) to control config
- [x] Theme-based component registration (allow themes to declare `pageComponents` that auto-register to page pattern)

### patterns/mapeditor

- [ ] Convert MapEditor from datamanagerclient into standalone DMS pattern (symbology CRUD via DMS instead of DAMA)

### patterns/datasets

- [x] Modernize datasets pattern — own defaultTheme, context-only siteConfig wrapper, per-page Layout, UI components throughout
- [x] DatasetsList style cleanup — transparent container, card/sidebar backgrounds, spacing, full-height, design pass, performance
- [x] Fix internal_source blank page — `getSourceData` doesn't include source's own ID in result, causes blank page when UDA `source_id` attribute is unset
- [ ] Source overview cleanup — theme-driven styling, width constraint, show both display_name + column name, remove table height cap, tighten metadata layout

### patterns/forms

### patterns/admin

- [x] Update admin theme merges to use `mergeTheme` (siteConfig.jsx, editTheme.jsx, themeEditor.jsx)

### patterns/auth

## project maintenance

- [ ] Vite HMR / Fast Refresh fixes — fix ~127 files with patterns that break hot module reload (mixed exports, anonymous components, object-wrapped exports, wrong file extensions)
