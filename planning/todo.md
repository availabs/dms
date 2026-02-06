# DMS Todo

## cli

- [x] DMS CLI tool (`packages/dms/cli/`) — terminal access to DMS data via shared API code and Falcor protocol (sites, patterns, pages, sections, datasets)

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

### patterns/forms

### patterns/admin

- [x] Update admin theme merges to use `mergeTheme` (siteConfig.jsx, editTheme.jsx, themeEditor.jsx)

### patterns/auth
