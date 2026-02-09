# Datasets Settings Page

## Objective

Add a settings page to the datasets pattern that lets users configure which categories are shown or hidden on the main DatasetsList view. The list page gets a toggle between the filtered view (default) and an "all sources" view, plus a settings link for authenticated users.

## Reference

The old DataManagerClient (`references/DataManagerClient/Source/settings.jsx`) implemented this as:

- **Settings page**: two-column layout showing "Categories Hidden" and "Categories Shown". Clicking a category moves it between columns. Settings are persisted via Falcor at `["dama-info", pgEnv, "settings"]` as `{filtered_categories: [...]}`.
- **List page filtering**: reads `filtered_categories` from Falcor cache. Sources whose categories are ALL in the filtered list are hidden. An `isListAll` toggle overrides filtering to show everything.
- **Access control**: settings button only visible to users with `authLevel === 10` (SUPER admin).
- **Search override**: when search input has > 2 characters, category filtering is disabled.

## Current State

**DatasetsList** (`pages/DatasetsList/index.jsx`) currently:
- Fetches all sources and builds a category sidebar
- Has no concept of category filtering/visibility
- Has no settings link
- Shows all sources unconditionally (filtered only by sidebar category selection and search)

## Proposed Changes

### New Route

Add a `/settings` child route in `siteConfig.jsx`:

```
datasets/
├── ""                                  (DatasetsList)
├── "create"                            (CreatePage)
├── "settings"                          (NEW — SettingsPage)
├── ...
```

### New Settings Page

`pages/SettingsPage.jsx` — full page for managing category visibility:

1. **Layout + Breadcrumbs** (Datasets → Settings)
2. **Two-column category toggle**:
   - Left: categories currently shown (click to hide)
   - Right: categories currently hidden (click to show)
3. **Persistence**: save `filtered_categories` array via Falcor `.set()` at `["dama-info", pgEnv, "settings"]`
4. **Search**: filter categories by name in the settings UI

### DatasetsList Changes

1. **Read settings**: fetch `filtered_categories` from Falcor at `["dama-info", pgEnv, "settings"]`
2. **Filter sources**: when not in "show all" mode, hide sources whose categories are all in `filtered_categories`
3. **Toggle button**: add a filtered/all toggle (defaults to filtered)
4. **Settings link**: add a gear icon link to `/settings` for authenticated users

## Files

| File | Action |
|------|--------|
| `pages/SettingsPage.jsx` | Create — settings page component |
| `pages/settingsPage.theme.js` | Create — theme keys |
| `siteConfig.jsx` | Add `/settings` route |
| `defaultTheme.js` | Register settingsPage theme |
| `pages/DatasetsList/index.jsx` | Add filtering logic, toggle, settings link |

## Implementation

### Phase 1: Settings page + route — DONE

- [x] Create `pages/SettingsPage.jsx` with Layout, Breadcrumbs, two-column category toggle
- [x] Fetch all sources to build the complete category list
- [x] Read current `filtered_categories` from Falcor cache
- [x] Persist changes via Falcor `.set()` to `["dama-info", pgEnv, "settings"]`
- [x] Create `pages/settingsPage.theme.js` with relevant keys (11 keys)
- [x] Register theme in `defaultTheme.js`
- [x] Add `/settings` route in `siteConfig.jsx`
- [x] `npm run build` passes

### Phase 2: DatasetsList filtering + toggle — DONE

- [x] Fetch `filtered_categories` from Falcor on DatasetsList mount
- [x] Add `isListAll` toggle state (defaults to `false` = filtered view)
- [x] Filter sources: hide sources whose categories are all in `filtered_categories` (unless `isListAll` or searching)
- [x] Filter sidebar categories to match visible sources (unless `isListAll`)
- [x] Add toggle button in toolbar (filtered / all) — only shown when filteredCategories exist
- [x] Add settings gear link for authenticated users
- [x] `npm run build` passes

## Verification

- [ ] `/settings` route renders with Layout + Breadcrumbs
- [ ] Settings page shows all categories split into shown/hidden columns
- [ ] Clicking a category moves it between columns
- [ ] Settings persist across page reloads (Falcor storage)
- [ ] DatasetsList defaults to filtered view (hidden categories not shown)
- [ ] Toggle switches between filtered and all sources
- [ ] Search overrides filtering (shows all matching sources)
- [ ] Settings link appears for authenticated users
- [ ] `npm run build` passes
