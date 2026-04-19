# Vite HMR / Fast Refresh Fixes

## Status: PHASES 1-3 DONE — 2026-04-19

Phase 1 (anonymous exports + non-JSX renames), Phase 2 (UI-component theme splits), and Phase 3 (pattern component splits) are complete on branch `vite-hmr-fixes`. Build passes clean after each phase.

- **Cat 1 (anonymous exports):** 0 remaining in `.jsx`/`.tsx` files. Named 24 components (including DatasetsList + SourcePage which weren't in the original list), deleted dead `patternEditor/index_bak.jsx`.
- **Cat 2 (non-JSX `.jsx`):** 0 remaining. Renamed 9 files to `.js`/`.ts` via `git mv`; deleted fully-commented `printWellPdf.jsx`.
- **Cat 3 (mixed theme/component exports in UI):** 0 remaining in the 19 listed files. Theme/settings/docs extracted to `*.theme.{js,jsx}` siblings (Button, Input, Tabs, Menu, Dialog, Popover, Listbox, Logo, LayoutGroup, FieldSet, Drawer, Switch, Pill, DeleteModal) or made module-private when not externally referenced (Textarea, List, Popup, ButtonSelect). `GraphComponent`'s `getColorRange` moved to `graph/colorRange.js`.
- **Phase 3 (pattern components):** 12 violations addressed; 2 files (`ViewsSelect.jsx`, `patterns/forms/ui/index.jsx`) already deleted in unrelated refactors. `overview.jsx` already clean. Splits created:
  - Theme siblings: `Attribution.theme.js`, `RenderFilters.theme.js`, `Breadcrumbs.theme.js`, `sectionGroup.theme.js`, `sectionGroupsPane.theme.js`
  - Util extractions: `searchUtils.jsx` (`searchTypeMapping`, `getScore`, `boldMatchingText`), `searchConfig.js` (`getConfig`)
  - `section_utils.jsx` split into `section_utils.js` (6 utils) + `section_components.jsx` (4 components); importers updated in `section.jsx`, `sectionMenu.jsx`
  - `section.jsx` dead re-export of `registerComponents`/`getRegisteredComponents` removed (only `src/index.js` consumes them, directly from `componentRegistry`)
  - `togglePageSetting` made private in `settingsPane.jsx`, `sectionGroupsPane.jsx`, `permissionsPane.jsx` (was duplicated, never cross-imported)
  - `auth/context.jsx` split into `context.js` (AuthContext + useAuth + defaultUserState) + `providers.jsx` (withAuth + authProvider); `src/index.js` and `dmsPageFactory.jsx` updated

Phases 4 (lexical editor splits) and 5 (object-wrapped registry exports) are still open.

### Reassessment summary (2026-04-18)

| Category | Originally listed | Fixed | Deleted (unrelated) | Still violating |
|----------|------------------:|------:|--------------------:|---------------:|
| 1. Anonymous default exports | 30 | 1 | 6 | 23 |
| 2. Non-JSX `.jsx`/`.tsx` files | 13 | 0 | 2 | 10 (+ `AutocompleteNode.tsx`) |
| 3. Mixed theme/component exports | 19 | 0 | 0 | 19 |

Category 4 (object-wrapped exports, ~34 files) and Category 5 (re-exports) were not audited — treated as unchanged.

**Deleted (no action needed):**
- `patterns/forms/components/menu.jsx`
- `patterns/forms/components/Table/index.jsx`
- `patterns/forms/pages/manage/formConfigComp/index.jsx`
- `patterns/page/components/sections/components/FilterableSearch.jsx`
- `patterns/page/components/sections/components/dataWrapper/components/FilterableSearch.jsx`
- `patterns/datasets/pages/sourcePageSelector.jsx`
- `patterns/forms/theme/topnav.jsx`
- `patterns/forms/theme/sidenav.jsx`

**Fixed incidentally:**
- `patterns/datasets/pages/DatasetsList/index.jsx` — now `export default function (...)` (named function, Fast-Refresh-trackable)

**Existing `.theme.js` siblings (from other work):** `Icon.theme.js`, `Layout.theme.jsx`, `SideNav.theme.jsx`, `TopNav.theme.jsx`, `card.theme.jsx`. None of the Button/Input/Tabs/Menu/Dialog/etc. violations have been split yet.

---

## Objective

Fix patterns across the DMS codebase that break Vite's React Fast Refresh, causing slow full-page reloads instead of instant component-level HMR during development.

## Background: Vite Fast Refresh Rules

React Fast Refresh (via `@vitejs/plugin-react`) statically analyzes each file to decide if it can be hot-replaced in isolation. A file becomes a "Fast Refresh boundary" only when **all exports are React components** (PascalCase functions returning JSX). When this condition isn't met, edits propagate up the import chain and typically cause a full page reload.

### Rules

1. **Files should only export React components** — mixing component exports with constants, utilities, hooks, or context objects forces full reload
2. **Components must be named** — anonymous `export default function({...})` or `export default (props) => {}` can't be tracked by Fast Refresh
3. **Don't export objects containing components** — `export default { EditComp: Edit, ViewComp: View }` hides components from static analysis
4. **Use `.js`/`.ts` for non-component files** — `.jsx`/`.tsx` files without JSX confuse the Fast Refresh heuristic
5. **Avoid re-exporting non-components from component files** — `export { someUtil } from './utils'` in a `.jsx` file breaks the boundary

### What works

- Multiple component exports from one file (all PascalCase) — works but one-per-file is most reliable
- Non-exported helpers within a component file — private functions/constants are fine
- TypeScript type exports — erased at compile time, no effect on Fast Refresh

## Violations Found

### Violation 1: Mixed component + non-component exports (~45 files) — HIGH

Files that export React components alongside constants, utilities, hooks, or theme objects. Every edit to these files triggers a full page reload.

#### UI Components (most impactful — widely imported)

| File | Mixed Exports | Fix |
|------|--------------|-----|
| `ui/components/Button.jsx` | `buttonTheme`, `buttonSettings`, `docs` + `ButtonComp` | Move theme/settings/docs to `button.theme.js` |
| `ui/components/Input.jsx` | `inputTheme`, `docs` + `Input`, `Textarea`, `ConfirmInput` | Move theme/docs to `input.theme.js` |
| `ui/components/Tabs.jsx` | `tabsTheme`, `docs` + `Tabs` | Move to `tabs.theme.js` |
| `ui/components/Menu.jsx` | `menuTheme`, `docs` + `MenuComp` | Move to `menu.theme.js` |
| `ui/components/Dialog.jsx` | `dialogTheme`, `docs` + `DialogComp` | Move to `dialog.theme.js` |
| `ui/components/Textarea.jsx` | `textAreaTheme`, `docs` + `Textarea` | Move to `textarea.theme.js` |
| `ui/components/Popover.jsx` | `popoverTheme`, `docs` + `PopoverComp` | Move to `popover.theme.js` |
| `ui/components/Listbox.jsx` | `listboxTheme` + `Listbox` | Move to `listbox.theme.js` |
| `ui/components/List.jsx` | `listboxTheme` + `List` | Move to `list.theme.js` |
| `ui/components/Logo.jsx` | `logoTheme`, `logoSettings`, `docs` + `LogoComp` | Move to `logo.theme.js` |
| `ui/components/LayoutGroup.jsx` | `layoutGroupTheme`, `layoutGroupSettings` + `LayoutGroup` | Move to `layoutGroup.theme.js` |
| `ui/components/FieldSet.jsx` | `fieldTheme`, `docs` + `FieldSetComp`, `FieldComp` | Move to `fieldSet.theme.js` |
| `ui/components/Popup.jsx` | `useHandleClickOutside` hook + `Popup` | Move hook to `hooks/useHandleClickOutside.js` |
| `ui/components/Drawer.jsx` | `docs` + `Drawer` | Move docs to separate file |
| `ui/components/ButtonSelect.jsx` | `docs` + `ButtonSelect` | Move docs to separate file |
| `ui/components/Switch.jsx` | `docs` + `RenderSwitch` | Move docs to separate file |
| `ui/components/Pill.jsx` | `docs` + `Pill` | Move docs to separate file |
| `ui/components/DeleteModal.jsx` | `docs` + `DeleteModal` | Move docs to separate file |
| `ui/components/graph/GraphComponent.jsx` | `getColorRange` utility + `GraphComponent` | Move utility to separate file |

#### Pattern Components

| File | Mixed Exports | Fix |
|------|--------------|-----|
| `patterns/page/components/sections/section_utils.jsx` | `handlePaste`, `getHelpTextArray`, `isJson`, `handleCopy`, `initialState` + `ViewSectionHeader`, `HelpTextEditPopups`, `TagComponent`, `DeleteModal` | Split into `section_components.jsx` + `section_utils.js` |
| `patterns/page/components/sections/sectionGroup.jsx` | `sectionGroupTheme`, `updateSections` + `SectionGroup` | Move theme/helper to separate files |
| `patterns/page/components/search/SearchPage.jsx` | `searchTypeMapping`, `getScore`, `boldMatchingText` + components | Move utils to `searchUtils.js` |
| `patterns/page/components/search/index.jsx` | `getConfig` + `SearchButton`, `SearchPallet` | Move `getConfig` to separate file |
| `patterns/page/pages/edit/editPane/settingsPane.jsx` | `togglePageSetting` + `SettingsPane` | Move util to shared file |
| `patterns/page/pages/edit/editPane/sectionGroupsPane.jsx` | `togglePageSetting` + `SectionGroupsPane` | Move util to shared file |
| `patterns/page/pages/manager/template/template_components/ViewsSelect.jsx` | `getAttributes` + `ViewsSelect` | Move util to separate file |
| `patterns/page/components/sections/components/dataWrapper/components/filters/RenderFilters.jsx` | `filterTheme` + `RenderFilters` | Move theme to separate file |
| `patterns/page/components/sections/components/dataWrapper/components/Attribution.jsx` | `attributionTheme` + `Attribution` | Move theme to separate file |
| `patterns/page/components/sections/section.jsx` | re-exports `registerComponents`, `getRegisteredComponents` + `SectionEdit` | Move re-exports to barrel file |
| `patterns/datasets/components/Breadcrumbs.jsx` | `breadcrumbsTheme` + `Breadcrumbs` | Move theme to `breadcrumbs.theme.js` |
| `patterns/datasets/pages/dataTypes/default/overview.jsx` | `tableTheme` + `Overview` | Move theme to separate file |
| `patterns/forms/ui/index.jsx` | `useClickOutside` hook + 8+ components | Move hook to `hooks/` |
| `patterns/auth/context.jsx` | `AuthContext`, `useAuth`, `withAuth`, `authProvider` | Split: `context.js` (context + hook) and `providers.jsx` (HOCs) |

#### Lexical Editor

| File | Mixed Exports | Fix |
|------|--------------|-----|
| `ui/components/lexical/editor/index.tsx` | `createHeadlessEditor` + `Lexicals` | Move `createHeadlessEditor` to separate file |
| `ui/components/lexical/editor/plugins/AutocompletePlugin/index.tsx` | `uuid` constant + component | Move constant to shared file |
| `ui/components/lexical/editor/ui/ColorPicker.tsx` | `toHex` utility + `ColorPicker` | Move utility to utils file |
| `ui/components/lexical/editor/plugins/LinkPlugin/index.tsx` | `TOGGLE_LINK_COMMAND` + `LinkPlugin` | Move command to separate file |
| `ui/components/lexical/editor/context/SharedHistoryContext.tsx` | `useSharedHistoryContext` hook + component | Move hook to separate file |
| `ui/components/lexical/editor/context/SharedAutocompleteContext.tsx` | `useSharedAutocompleteContext` hook + component | Move hook to separate file |

#### avl-map-2

| File | Mixed Exports | Fix |
|------|--------------|-----|
| `patterns/datasets/.../avl-map-2/src/components/StyledComponents/index.jsx` | `useComponentLibrary` hook + component | Move hook out |
| `patterns/datasets/.../avl-map-2/src/uicomponents/Legend.jsx` | `getScale` utility + `Legend` | Move utility out |
| `patterns/datasets/.../avl-map-2/src/uicomponents/theme/index.jsx` | `LightTheme`, `useTheme` + `ThemeProvider`, `ThemeUpdater` | Split theme/hook from providers |
| `patterns/datasets/.../avl-map-2/src/utils/colors.jsx` | `getColorRange` + `ColorBar` | Move utility out |

---

### Violation 2: Anonymous default exports (23 remaining) — MEDIUM

Anonymous functions can't be tracked by Fast Refresh. Fix: add a name.

| File | Fix | Status |
|------|-----|--------|
| `ui/components/Icon.jsx` | `export default function Icon({...})` | [ ] |
| `ui/components/Label.jsx` | `export default function Label({...})` | [ ] |
| `ui/components/table/index.jsx` | `export default function Table({...})` | [ ] |
| `ui/components/Card.jsx` | `export default function Card({...})` | [ ] |
| `ui/components/Pagination.jsx` | `export default function Pagination({...})` | [ ] |
| `ui/components/Modal.jsx` | `export default function Modal({...})` | [ ] |
| `ui/components/SideNavContainer.jsx` | `export default function SideNavContainer({...})` | [ ] |
| `ui/components/Dropdown.jsx` | `export default function Dropdown({...})` | [ ] |
| `ui/components/Permissions.jsx` | `export default function Permissions({...})` | [ ] |
| `ui/components/graph/index.jsx` | `export default function Graph({...})` | [ ] |
| `patterns/admin/pages/patternEditor/index_bak.jsx` | `export default function PatternEditor({...})` | [ ] (consider deleting `_bak`) |
| `patterns/admin/components/menu.jsx` | `export default function AdminMenu({...})` | [ ] |
| `patterns/auth/pages/authForgotPassword.jsx` | `export default function AuthForgotPassword(props)` | [ ] |
| `patterns/auth/pages/authResetPassword.jsx` | `export default function AuthResetPassword(props)` | [ ] |
| `patterns/auth/pages/authGroups.jsx` | `export default function AuthGroups(props)` | [ ] |
| `patterns/auth/pages/profile.jsx` | `export default function Profile(props)` | [ ] |
| `patterns/auth/pages/authLogout.jsx` | `export default function AuthLogout()` | [ ] |
| `patterns/auth/pages/authLogin.jsx` | `export default function AuthLogin(props)` | [ ] |
| `patterns/auth/pages/authSignup.jsx` | `export default function AuthSignup(props)` | [ ] |
| `patterns/auth/components/menu.jsx` | `export default function AuthMenu({...})` | [ ] |
| `patterns/page/components/userMenu.jsx` | `export default function UserMenu({...})` | [ ] |
| `patterns/datasets/components/MetadataComp/index.jsx` | `export default function MetadataComp({...})` | [ ] |
| `patterns/page/components/sections/components/ComponentRegistry/sharedControls/ColorControls.jsx` | `export default function ColorControls({...})` | [ ] |
| `patterns/datasets/pages/DatasetsList/index.jsx` | — | [x] already named (2026-04) |

~~Deleted in unrelated refactors (no action):~~ `forms/components/menu.jsx`, `forms/components/Table/index.jsx`, `forms/pages/manage/formConfigComp/index.jsx`, `page/.../FilterableSearch.jsx` (both), `datasets/pages/sourcePageSelector.jsx`.

---

### Violation 3: Object-wrapped component exports (34 files) — ARCHITECTURAL

Files using `export default { EditComp: Edit, ViewComp: View }`. This is a DMS convention — the component registry consumes these objects. Fast Refresh can't track components inside objects.

**Files:** All `ui/columnTypes/*.jsx` (10 files), `lexical/index.jsx`, all ComponentRegistry components (~15 files), forms components (~8 files).

**Options:**
- (a) Accept full reloads for these files — they're rarely edited during active UI development
- (b) Refactor registry to use named imports: `export { Edit as EditComp, View as ViewComp }` and build the object at the consumption site
- (c) Rename to `.js` to stop Fast Refresh from trying to process them (loses JSX syntax highlighting)

**Recommendation:** Option (a) for now — these files change infrequently. Option (b) is ideal but requires registry refactoring.

---

### Violation 4: Non-component `.jsx` files (10 remaining) — LOW / EASY FIX

Files with `.jsx`/`.tsx` extension that contain no JSX — just utilities, hooks, constants, or configs. Rename to `.js`/`.ts`.

| File | Content | Rename to | Status |
|------|---------|-----------|--------|
| `patterns/datasets/pages/dataTypes/default/utils.jsx` | Pure utility functions | `utils.js` | [ ] |
| `patterns/datasets/.../avl-map-2/src/uicomponents/useClickOutside.jsx` | Custom hook, no JSX | `useClickOutside.js` | [ ] |
| `patterns/page/components/saveAsPDF/PrintWell/printWellPdf.jsx` | Entirely commented out | Delete or rename to `.js` | [ ] |
| `patterns/page/components/sections/convertToSpreadSheet.jsx` | Pure utility | `convertToSpreadSheet.js` | [ ] |
| `patterns/page/components/sections/components/ComponentRegistry/mnyHeader/consts.jsx` | Pure constants | `consts.js` | [ ] |
| `patterns/page/pages/view.doc.jsx` | Documentation data object | `view.doc.js` | [ ] |
| `ui/components/table/utils/keyboard.jsx` | Event handler function | `keyboard.js` | [ ] |
| `ui/components/table/utils/index.jsx` | Pure utilities | `index.js` | [ ] |
| `ui/components/table/utils/hooks.jsx` | Custom hooks, no JSX | `hooks.js` | [ ] |
| `ui/components/table/utils/mouse.jsx` | Event handler functions | `mouse.js` | [ ] |
| `ui/components/lexical/editor/nodes/AutocompleteNode.tsx` | Lexical TextNode subclass | `AutocompleteNode.ts` | [ ] |

~~Deleted (no action):~~ `patterns/forms/theme/topnav.jsx`, `patterns/forms/theme/sidenav.jsx`.

---

## Implementation Plan

### Phase 1: Quick wins — name anonymous exports + rename non-JSX files — DONE 2026-04-18

- [x] Name all anonymous default exports (24 named + dead `index_bak.jsx` deleted)
- [x] Rename non-component `.jsx`/`.tsx` files to `.js`/`.ts` (9 renamed via `git mv` + `printWellPdf.jsx` deleted)
- [x] Build + verify

### Phase 2: Split UI component themes — DONE 2026-04-18

- [x] Split theme/settings/docs exports from 19 UI component files into `*.theme.{js,jsx}` siblings (or made private when not externally used)
- [x] Update imports in `defaultTheme.js`, `themeSettings.js`, `docs.js`
- [x] Build + verify

### Phase 3: Split pattern component mixed exports — DONE 2026-04-19

- [x] Split mixed exports in page pattern files (~12 files; 2 were already deleted)
- [x] Split mixed exports in datasets pattern files (1 — Breadcrumbs; `overview.jsx` already clean; no separate forms pattern files remained)
- [x] Split mixed exports in auth pattern (`context.jsx` → `context.js` + `providers.jsx`)
- [x] Build + verify

### Phase 4: Lexical editor mixed exports

- [ ] Move `createHeadlessEditor` out of `editor/index.tsx`
- [ ] Split other mixed exports in lexical plugins/context (~5 files)
- [ ] Build + verify

### Phase 5 (Optional): Object-wrapped exports

Decide whether to refactor the `{ EditComp, ViewComp }` pattern or accept it.

- [ ] Evaluate registry refactoring feasibility
- [ ] If proceeding, refactor columnTypes + ComponentRegistry to use named exports

## Summary (current counts as of 2026-04-19)

| Violation | Original | Still violating | Severity | Phase |
|-----------|---------:|----------------:|----------|-------|
| Mixed exports (UI cat 3 + patterns) | ~45 | 0 | HIGH | 2-3 DONE |
| Anonymous exports | 30 | 0 | MEDIUM | 1 DONE |
| Object-wrapped components | 34 | 34 (unaudited, assumed unchanged) | ARCHITECTURAL | 5 |
| Non-component .jsx | 13 | 0 | LOW | 1 DONE |
| Lexical editor mixed exports | 6 | 6 | MEDIUM | 4 |
| **Total remaining** | | **~40** | | |
