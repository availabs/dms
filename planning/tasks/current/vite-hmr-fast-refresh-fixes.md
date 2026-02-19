# Vite HMR / Fast Refresh Fixes

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

### Violation 2: Anonymous default exports (30 files) — MEDIUM

Anonymous functions can't be tracked by Fast Refresh. Fix: add a name.

| File | Fix |
|------|-----|
| `ui/components/Icon.jsx` | `export default function Icon({...})` |
| `ui/components/Label.jsx` | `export default function Label({...})` |
| `ui/components/table/index.jsx` | `export default function Table({...})` |
| `ui/components/Card.jsx` | `export default function Card({...})` |
| `ui/components/Pagination.jsx` | `export default function Pagination({...})` |
| `ui/components/Modal.jsx` | `export default function Modal({...})` |
| `ui/components/SideNavContainer.jsx` | `export default function SideNavContainer({...})` |
| `ui/components/Dropdown.jsx` | `export default function Dropdown({...})` |
| `ui/components/Permissions.jsx` | `export default function Permissions({...})` |
| `ui/components/graph/index.jsx` | `export default function Graph({...})` |
| `patterns/admin/pages/patternEditor/index_bak.jsx` | `export default function PatternEditor({...})` |
| `patterns/admin/components/menu.jsx` | `export default function AdminMenu({...})` |
| `patterns/auth/pages/authForgotPassword.jsx` | `export default function AuthForgotPassword(props)` |
| `patterns/auth/pages/authResetPassword.jsx` | `export default function AuthResetPassword(props)` |
| `patterns/auth/pages/authGroups.jsx` | `export default function AuthGroups(props)` |
| `patterns/auth/pages/profile.jsx` | `export default function Profile(props)` |
| `patterns/auth/pages/authLogout.jsx` | `export default function AuthLogout()` |
| `patterns/auth/pages/authLogin.jsx` | `export default function AuthLogin(props)` |
| `patterns/auth/pages/authSignup.jsx` | `export default function AuthSignup(props)` |
| `patterns/auth/components/menu.jsx` | `export default function AuthMenu({...})` |
| `patterns/forms/components/menu.jsx` | `export default function FormsMenu({...})` |
| `patterns/forms/components/Table/index.jsx` | `export default function FormsTable({...})` |
| `patterns/forms/pages/manage/formConfigComp/index.jsx` | `export default function FormConfigComp({...})` |
| `patterns/page/components/userMenu.jsx` | `export default function UserMenu({...})` |
| `patterns/page/components/sections/components/FilterableSearch.jsx` | `export default function FilterableSearch({...})` |
| `patterns/page/components/sections/components/dataWrapper/components/FilterableSearch.jsx` | `export default function FilterableSearch({...})` |
| `patterns/datasets/pages/sourcePageSelector.jsx` | `export default function SourcePageSelector({...})` |
| `patterns/datasets/pages/DatasetsList/index.jsx` | `export default function DatasetsList({...})` |
| `patterns/datasets/components/MetadataComp/index.jsx` | `export default function MetadataComp({...})` |
| `patterns/page/components/sections/components/ComponentRegistry/sharedControls/ColorControls.jsx` | `export default function ColorControls({...})` |

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

### Violation 4: Non-component `.jsx` files (13 files) — LOW / EASY FIX

Files with `.jsx`/`.tsx` extension that contain no JSX — just utilities, hooks, constants, or configs. Rename to `.js`/`.ts`.

| File | Content | Rename to |
|------|---------|-----------|
| `patterns/datasets/pages/dataTypes/default/utils.jsx` | Pure utility functions | `utils.js` |
| `patterns/datasets/.../avl-map-2/src/uicomponents/useClickOutside.jsx` | Custom hook, no JSX | `useClickOutside.js` |
| `patterns/forms/theme/topnav.jsx` | CSS class objects | `topnav.js` |
| `patterns/forms/theme/sidenav.jsx` | CSS class objects | `sidenav.js` |
| `patterns/page/components/saveAsPDF/PrintWell/printWellPdf.jsx` | Entirely commented out | Delete or rename to `.js` |
| `patterns/page/components/sections/convertToSpreadSheet.jsx` | Pure utility | `convertToSpreadSheet.js` |
| `patterns/page/components/sections/components/ComponentRegistry/mnyHeader/consts.jsx` | Pure constants | `consts.js` |
| `patterns/page/pages/view.doc.jsx` | Documentation data object | `view.doc.js` |
| `ui/components/table/utils/keyboard.jsx` | Event handler function | `keyboard.js` |
| `ui/components/table/utils/index.jsx` | Pure utilities | `index.js` |
| `ui/components/table/utils/hooks.jsx` | Custom hooks, no JSX | `hooks.js` |
| `ui/components/table/utils/mouse.jsx` | Event handler functions | `mouse.js` |
| `ui/components/lexical/editor/nodes/AutocompleteNode.tsx` | Lexical TextNode subclass | `AutocompleteNode.ts` |

---

## Implementation Plan

### Phase 1: Quick wins — name anonymous exports + rename non-JSX files

Zero behavioral risk. ~43 files.

- [ ] Name all 30 anonymous default exports (Violation 2)
- [ ] Rename 13 non-component `.jsx`/`.tsx` files to `.js`/`.ts` (Violation 4), update imports
- [ ] Build + verify

### Phase 2: Split UI component themes — highest HMR impact

The `ui/components/` files are the most widely imported. Splitting themes follows the established `*.theme.js` pattern from datasets.

- [ ] Split theme/settings/docs exports from ~19 UI component files into `*.theme.js` siblings
- [ ] Update imports in `defaultTheme.js` and any other consumers
- [ ] Build + verify

### Phase 3: Split pattern component mixed exports

- [ ] Split mixed exports in page pattern files (~12 files)
- [ ] Split mixed exports in datasets pattern files (~3 files)
- [ ] Split mixed exports in forms pattern files (~2 files)
- [ ] Split mixed exports in auth pattern (~1 file)
- [ ] Build + verify

### Phase 4: Lexical editor mixed exports

- [ ] Move `createHeadlessEditor` out of `editor/index.tsx`
- [ ] Split other mixed exports in lexical plugins/context (~5 files)
- [ ] Build + verify

### Phase 5 (Optional): Object-wrapped exports

Decide whether to refactor the `{ EditComp, ViewComp }` pattern or accept it.

- [ ] Evaluate registry refactoring feasibility
- [ ] If proceeding, refactor columnTypes + ComponentRegistry to use named exports

## Summary

| Violation | Files | Severity | Phase |
|-----------|-------|----------|-------|
| Mixed exports | ~45 | HIGH | 2-4 |
| Anonymous exports | 30 | MEDIUM | 1 |
| Object-wrapped components | 34 | ARCHITECTURAL | 5 |
| Non-component .jsx | 13 | LOW | 1 |
| Re-exported non-components | 5 | LOW | 3 |
| **Total** | **~127** | | |
