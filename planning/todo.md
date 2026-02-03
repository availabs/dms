# DMS Todo

## api

## dms-manager

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

### ui/lexical-textsettings

- [x] Phase 0: Lexical analysis and cleanup (dead code removal, upstream comparison, table plugin updates)
- [ ] Phase 1: Lexical + textSettings foundation (convert theme to options/styles, create useLexicalTheme hook, replace custom UI components)
- [ ] Phase 2: Propagate textSettings to core components (Table, Card, Input, Select, Button, NavigableMenu, etc.)
- [ ] Phase 3: Documentation and migration (update docs, create migration guide, add textSettings to theme editor)

## patterns

### patterns/page

- [x] Fix nav2Level baseUrl bug and move to page pattern
- [x] Move lexical component inline controls (style, bgColor, showToolbar) to control config

### patterns/mapeditor

- [ ] Convert MapEditor from datamanagerclient into standalone DMS pattern (symbology CRUD via DMS instead of DAMA)

### patterns/datasets

### patterns/forms

### patterns/admin

- [x] Update admin theme merges to use `mergeTheme` (siteConfig.jsx, editTheme.jsx, themeEditor.jsx)

### patterns/auth
