# Page edit sidebar is unreadable in dark mode

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** done · **Created by:** rdubowsky@albany.edu · **Edited by:** —

## Objective

In dark mode, the right-hand edit sidebar on a page's `/edit` view (Settings, Data Sources, Section Groups,
Pages, History, Permissions) shows a white panel with white text: the "Pages" title and the "+ Add Page" button
can't be seen, though they still work when clicked. Make the sidebar and what's inside it follow dark mode.
Second, smaller: every page load shows a short light-mode flash before dark mode turns on.

## Cause (measured live on `qa_test`, 2026-09-30)

- **White text.** Nothing in the default theme sets a text color on `html`/`body`. The dark tokens block
  (`ui/defaultTheme.js`, `[data-theme="dark"]`) sets `color-scheme: dark`, so the browser's default text color
  becomes pure white (`rgb(255,255,255)` on `<html>`; forcing `color-scheme: light` gives black). Anything
  without its own text color inherits that white.
- **White panel.** `ui/components/Drawer.jsx` hard-codes `bg-white`. The "Pages" tab title and the Add Page
  button set no color, so they're white on white. "Page 1" is visible only because the `nestable` theme gives
  it `text-slate-600`.
- **Why it showed up now.** `src/index.css`'s `@custom-variant dark` was widened to match `[data-theme="dark"]`
  on 2026-09-22 (commit `ed83e6e`, recorded in `tessera-component-theme-port.md` "Table dark-mode fix"). That
  was a correct fix: before it, every `dark:` class was inert. It makes components with only partial dark
  styling half-flip. Not reverting it.
- **Setting a body text color alone would not fix it:** the dark `--t-ink` is `#EDEDE7`, also light. The
  panel background has to follow dark mode too, and then every hard-coded dark gray inside the panes
  (`text-gray-900`, `text-slate-700`, …) would go dark-on-dark. So the panes' colors move to the `--t-*`
  tokens as well.
- **Light flash.** `ThemeToggle.jsx` reads the saved scheme (`localStorage['dms-color-scheme']`) in a mount
  effect, so dark mode turns on only once a toggle has rendered. Owner reports the flash is under a second.

## Relation to other work

- `tessera-component-theme-port.md` lists `draggableNav.jsx`'s `nestableTheme` as NOT ported and
  `sectionGroupsPane.theme` in its Phase B checklist (not started). This task ports just those two, plus the
  hard-coded classes in the edit-pane JSX, to the same `--t-*` tokens. Nothing else in that task is touched.
- Named themes that override `nestable` / `pages.sectionGroupsPane` (mny, transportny, tessera) keep their own
  values; only the library defaults change.
- The admin pages' toggle placement (breadcrumb bar, not next to the user menu) is deliberate (2026-09-22,
  `patterns/admin/siteConfig.jsx:114`). Left as is.
- The add user / group dropdowns on a pattern's Access page (`/list/manage_pattern/5/permissions`) render
  readable in dark mode now (`Permissions.theme.js` / `MultiSelect.theme.js` were ported 2026-09-20..22).

## Plan

- [x] `Drawer.jsx`: panel + close button read a new `drawer` theme key (`Drawer.theme.jsx`, flat map:
      `panel`, `closeButton`), token colors; registered as `drawer` in `ui/defaultTheme.js`. No site theme
      had a `drawer` key (grepped `src/themes`).
- [x] `draggableNav.jsx` `nestableTheme` → tokens.
- [x] `sectionGroupsPane.theme.js` → tokens.
- [x] Hard-coded classes in `pagesPane.jsx`, `settingsPane.jsx`, `historyPane.jsx`, `dataSourcesPane.jsx`,
      `index.jsx` (`LoadingDisplay` only) → tokens, one fixed mapping (gray-900/slate-700 → ink; gray-500/600,
      slate-500/600 → graphite; gray-400, slate-300/400 → pencil; bg-white → panel; slate-50/gray-100 → well;
      gray/slate-200 → rule; blue → cobalt; red → brick; green-600 → go). Bare `border` classes got
      `border-[var(--t-rule)]` (Tailwind 4's bare border is `currentColor`, near-white in dark mode). Left:
      the bottom toolbar (dark in both modes by design), the blue comment-send button, orange section borders,
      commented-out code.
- [x] Light flash: `applySavedColorScheme()` exported from `ThemeToggle.jsx` (same code the toggle's mount
      effect ran), called once at module load in `render/spa/dmsSiteFactory.jsx`. Skipped when
      `window.__dmsSSRData` is set (hydrating server HTML), so the toggle's first client render still
      matches the server's.
- [x] Live check on `qa_test` `/edit` (below).

## Follow-ups (not done here)

- **Colored `Pill` variants** (`Pill.theme.js` gray/orange/blue/green/red/status_*) have no dark colors
  (`text-blue-700` etc.). In the sidebar: Data Sources "Add" (2.06:1 in dark) and Permissions "Disable"
  (2.78:1). Pills are used in 15 files site-wide, and the theme port left those variants untouched, so
  this belongs with that task rather than a sidebar fix.
- **`index.html`'s runtime Tailwind** (`@tailwindcss/browser` + `<style type="text/tailwindcss">`) still
  defines `@custom-variant dark (&:where(.dark, .dark *))`, without the `[data-theme="dark"]` match that
  `src/index.css` got on 2026-09-22. Any `dark:` class only that runtime copy generates won't follow the
  toggle.
- `pagesPane.jsx` reads `theme?.nestable?.collapsIcon` (typo for `collapseIcon`), so the expand arrows get
  no class. Pre-existing; fixing it would start applying named themes' `collapseIcon` values, so left.

## Progress log

- 2026-09-30: cause measured live (above). Task created.
- 2026-09-30: built. Live check on `qa_test` `/edit`, all six panes, text-vs-background contrast measured per
  element (colors resolved through a canvas, alpha blended):
  - Dark: every pane's panel is `rgb(27,29,35)` (`--t-panel`). "Pages" 14.3:1, "Page 1" 7.3:1,
    "+ Add Page" light on dark with a `--t-rule` border. Settings labels/inputs/switches readable (zoomed
    screenshot). Lowest non-pill value 3.35:1 (`--t-pencil` muted text). Only the two colored pills fall
    below 3:1 (follow-up above).
  - Light: panel still `rgb(255,255,255)`; lowest value 3.11:1 (muted text), everything else at or above
    the old look.
  - Light flash: page loaded in a hidden same-origin iframe with a MutationObserver: `data-theme="dark"` set
    at 1210 ms, first `#root` content at 1270 ms. Dark is on before anything paints.
- 2026-09-30: owner reviewed and committed (dms `17a6f7f9`). Done; follow-ups above carried to `todo.md`.
