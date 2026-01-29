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
- [ ] Move widgets to top-level theme (out of layout.options)

## patterns

### patterns/page

- [ ] Fix nav2Level baseUrl bug and move to page pattern

### patterns/datasets

### patterns/forms

### patterns/admin

- [x] Update admin theme merges to use `mergeTheme` (siteConfig.jsx, editTheme.jsx, themeEditor.jsx)

### patterns/auth
