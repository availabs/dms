# Lexical Button — replace internal UI + hardcoded styles with theme/UI integration

## Objective

Bring Lexical's inline button feature in line with the DMS theme + UI
system so that:

1. The "Insert Button" dialog renders inside the DMS `UI.Modal` (or
   `UI.Dialog`), not Lexical's internal modal — same chrome as every
   other admin modal.
2. The button-style dropdown is populated from the active theme's
   `button.styles[]` named variants (e.g., for Tessera:
   `default | plain | active | danger`) rather than a hardcoded list
   of `primary | secondary | primarySmall | …`.
3. The rendered button in the editor + on the page uses the themed
   `UI.Button` primitive, so it inherits the brand's button skin
   instead of carrying its own `BUTTON_STYLES` map.
4. All link behavior — text, URL, "keep search params" toggle, click
   target, decorator interactivity, edit-after-insert — stays
   functional and unchanged from the author's perspective.

This is the same pattern the Lexical `StyledParagraphNode` work
established (see `translating-design-system-to-dms-theme.md` §3.1.4
Approach B): expose theme tokens to Lexical authors via the editor's
existing affordances.

## Scope

**In scope**
- `ButtonNode` (decorator node) — drop the embedded `BUTTON_STYLES`
  map, render via `UI.Button` with the `activeStyle` resolved from
  the node's `__style` field against `theme.button.styles[]`.
- `ButtonPlugin` (slash-menu + dialog) — replace the internal
  `Button`/`TextInput`/`Select`/`DialogActions` UI primitives with
  the equivalents from `ThemeContext`'s `UI` object
  (`UI.Button`, `UI.Input`, `UI.MultiSelect`, `UI.Modal`).
- Style dropdown options — auto-generate from
  `theme.button.styles.map(s => s.name)` instead of the hardcoded
  six options.
- Backwards compatibility for existing button nodes that store
  legacy style names (`primary`/`secondary`/…) — map them to the
  closest active-theme style name on read.

**Out of scope**
- The button text-format toolbar (bold/italic) — unrelated.
- The icon picker inside the button — unrelated.
- Adding new button capabilities (e.g., icon-on-left, multi-line).
- Replacing the lexical-internal modal shell (`useModal` hook).
  Just swap what the modal renders inside; the host modal can stay
  for now if `UI.Modal` doesn't cleanly slot in. The first-pass goal
  is "use UI primitives inside the dialog"; the second-pass goal is
  "use UI.Modal as the host."

## Current State

### Files

- `src/dms/packages/dms/src/ui/components/lexical/editor/nodes/ButtonNode.tsx`
  - `DecoratorNode` with `__linkText`, `__keepSearchParams`,
    `__path`, `__style` fields.
  - Embedded `BUTTON_STYLES` constant maps 6 style names
    (`primary | secondary | primarySmall | secondarySmall |
    whiteSmall | greenSmall`) to **hardcoded** className strings
    (Proxima Nova, EAAD43 fill, rounded-full, etc.) — none of
    which are theme-aware.
  - Renders `<span>` (edit mode) or `<Link>` (view mode) wrapped in
    `BUTTON_STYLES[style]`.

- `src/dms/packages/dms/src/ui/components/lexical/editor/plugins/ButtonPlugin/index.tsx`
  - `InsertButtonDialog` renders into a modal shell (provided by the
    consumer via `showModal`).
  - Imports lexical-internal primitives:
    `../../ui/TextInput`, `../../ui/Button`, `../../ui/Select`,
    `../../ui/Dialog`.
  - The style dropdown is a hardcoded `<Select>` with 6 `<option>`
    elements matching the `BUTTON_STYLES` keys.
  - `INSERT_BUTTON_COMMAND` dispatch + node-replace flow is solid;
    keep as-is.

### Consumers / call sites

- `ComponentPickerPlugin/index.tsx` opens `InsertButtonDialog`
  via `showModal('Insert Button', …)` when the user selects the
  "Button" slash option.
- The "edit" path: clicking a button in edit mode opens the same
  dialog with `initialValues` pre-populated; on save it replaces
  the existing node.

### Theme contract today

`theme.button.styles` already follows the `options/styles` pattern
(see `Button.theme.jsx`). Each entry has at minimum a `name` and a
`button` className string. The active style is selected via
`theme.button.options.activeStyle` OR per-call-site override
(`<UI.Button activeStyle="plain">`). The lexical button currently
ignores all of this.

## Proposed Changes

**Status — 2026-05-24:**
- ✅ Phase 1 DONE — ButtonNode dropped BUTTON_STYLES, now renders via
  `UI.Button activeStyle={resolvedStyle}`. Legacy stored style names
  (`primary`/`secondary`/…) fall back to `styles[0].name` with a
  one-time console warning. View-mode click uses `useNavigate()` for
  internal paths and `window.open(..., '_blank', 'noopener,noreferrer')`
  for external URLs (auto-detected by `^(https?:)?//`). exportDOM now
  emits a clean `<a>` with `data-lexical-button-style` instead of
  inlining classes — the live render owns styling.
- ✅ Phase 1 DONE — InsertButtonDialog uses `UI.Input` / `UI.MultiSelect`
  (single-select) / `UI.Switch` / `UI.Button` from `ThemeContext`. Style
  dropdown auto-generated from `theme.button.styles[].name` — every
  theme gets the right list for free.
- ✅ Phase 2 DONE — `useModal` rewritten to render its modal via
  `UI.Modal` from ThemeContext (replaces the hardcoded grey/white
  lexical-internal Modal). Adds a brand-themed header (`modal.header`
  / `modal.title` / `modal.closeButton` theme keys with sensible
  fallbacks) and body wrapper. Affects every plugin dialog (Image,
  Table, Layout, Button) — all inherit the brand's modal chrome now.
  Backwards-compat: same `useModal()` hook signature, same showModal
  callback shape — only the rendered shell changed.
- ✅ Phase 3 DONE — verified lexical-internal `ui/{Button,Select,TextInput,Dialog}.tsx`
  files are still consumed by 4 other plugins (ActionsPlugin,
  LayoutPlugin, InlineImagePlugin, TablePlugin). Scope narrowed
  to: leave them in place, document the migration recipe for those
  plugins (see "Follow-up tasks" below). The button refactor itself
  no longer touches the lexical-internal Button/Select/TextInput —
  only Dialog (for `DialogActions`, which we keep as the action-bar
  wrapper at the bottom of the dialog content).

**Verification (dev-server probe):** page loads at `/marketing-homepage`
with no `Runtime.exceptionThrown` events and no console errors / Lexical
Button warnings. (Live edit-mode interaction needs auth — verify in
your authed browser by clicking an existing button to confirm the
themed dialog appears with the active theme's button-style options.)

**Follow-up tasks** (separate, not part of this scope):
1. Migrate ActionsPlugin / LayoutPlugin / InlineImagePlugin / TablePlugin
   to use `UI.{Button,Input,MultiSelect,Switch}` from ThemeContext —
   same recipe as ButtonPlugin's dialog. Once all four migrate, the
   lexical-internal `ui/{Button,Select,TextInput}.tsx` files have no
   consumers and can be deleted. Filed: `lexical-plugins-ui-migration.md`.
2. Move `DialogActions` (the small action-bar layout wrapper at the
   bottom of dialogs) into the brand UI as `UI.DialogActions`. Filed:
   `ui-dialog-actions-primitive.md`.
3. LayoutPlugin's hardcoded LAYOUTS array → theme-driven column
   templates. Filed: `lexical-layout-templates-theme-driven.md`.

## Open bugs from first-pass user testing (2026-05-24)

User testing surfaced two issues that the code-review verification
didn't catch — both need live browser investigation:

**Bug A — "plain" option not appearing in the style dropdown.**
Theory check: simulated mergeComponentStyles in node with the
tessera/codebase styles arrays — produced `['default', 'plain',
'active', 'danger']` (4 entries, all named). styleOptions in the
dialog correctly maps each name to `{label, value}`. Yet the
user reports "plain" is missing. Possible causes:
  - Stale build / cached page (user hasn't refreshed).
  - `UI.MultiSelect singleSelectOnly` filters or hides options in
    a way I haven't traced. Worth checking `displayDetailedValues`
    default (line 108 of MultiSelect.jsx) and whether value=array
    vs value=string changes the rendered option count.
  - The dropdown is rendering 4 options but the user clicked
    through quickly and only saw 3.

Action: in the next pass, either (a) add a temporary
`console.log(styleOptions)` to confirm the array contains 4 entries
at render time, or (b) verify with the user which options they
actually see.

**Bug B — "primary button text is pretty unreadable."**
Tessera's `default` button class string includes
`bg-[#2A2F36] text-[#FBF9F4]` (slate background, parchment text).
Should be WCAG AA passing. Possible causes:
  - The text color isn't applied (Tailwind 4 arbitrary value not
    compiling at runtime for some reason).
  - The button isn't getting slate background — defaulting to
    something lighter that makes parchment text low-contrast.
  - The class string is being overridden by a parent paragraph's
    `text-slate` rule.
  - The user is on a stale build still seeing the old EAAD43 button.

Action: live inspection — open devtools on the rendered button,
check computed `background-color` and `color`. Confirm both
arbitrary values are resolving. If they're not, the bug is at the
Tailwind-4-runtime layer, not the theme.

Design note: discovered that `useModal` is shared infrastructure used
by every plugin (Image / Table / Layout / Button / etc.), so swapping
its internal `Modal` for `UI.Modal` in Phase 2 changes the modal
chrome for ALL lexical-internal dialogs in one move — the right outcome
for Phase 2's stated goal, but worth flagging that the blast radius is
broader than just the button plugin.

### Phase 1 — Theme contract + ButtonNode refactor — DONE

1. **`ButtonNode.tsx`**
   - Delete the embedded `BUTTON_STYLES` constant.
   - In `decorate()`, render via `UI.Button` from `ThemeContext`:
     ```tsx
     const { UI } = useContext(ThemeContext);
     return <UI.Button activeStyle={this.__style || 'default'} …>{linkText}</UI.Button>;
     ```
   - When the button needs to be a link (view mode), wrap or
     compose with React Router's `<Link>` — preserve the
     existing keep-search-params + path logic.
   - Update `exportDOM()` to emit a clean `<a>` with no inline
     classes (the SSR/HTML-export path); the theme's CSS comes
     from the runtime render, not the DOM-export string.
   - Add a **legacy style mapper**: if `this.__style` is one of
     the historical names (`primary`, `secondary`, etc.) and
     the active theme doesn't have that style name, fall back
     to the first style (`styles[0].name || 'default'`) so old
     stored content keeps rendering.

2. **`ButtonPlugin/index.tsx#InsertButtonDialog`**
   - Replace internal `TextInput` with `UI.Input` (from
     ThemeContext).
   - Replace internal `Button` with `UI.Button`.
   - Replace internal style `<Select>` with `UI.MultiSelect`
     configured for single-select
     (`singleSelectOnly: true, searchable: false`), populated from
     `theme.button.styles.map(s => ({ label: s.name, value: s.name }))`.
   - Replace internal `Select` for keep-search-params with
     `UI.Switch` (boolean toggle is a switch, not a dropdown).
   - Keep the dialog's outer layout / DialogActions structure
     for now; just swap the contents.

### Phase 2 — Modal shell (UI.Modal) — DONE

Implementation deviated from the original spec in a way that's
strictly better:

**Original plan:** add a button-specific `<InsertButtonModal>`
wrapper, and have ComponentPickerPlugin drive its open state.

**What I did instead:** rewrote the *shared* `useModal()` hook so
its internal modal is now `UI.Modal` from ThemeContext. Every
plugin dialog that uses `useModal` — Image / Table / Layout /
Button / Insert Inline Image / etc. — picks up the brand-themed
modal chrome automatically. No per-plugin wrapper needed.

Why: `useModal` already had the right shape (state-driven open,
title prop, content callback) — the only thing forcing the old
plain-grey modal was its `import Modal from '../ui/Modal'`. One
file changed, every plugin benefits. The original per-plugin
wrapper approach would have left 6+ other plugins still showing
the unstyled grey chrome.

`useModal` now also wraps content with a brand-themed header
(reads `theme.modal.header` / `modal.title` / `modal.closeButton`
keys with fallbacks) so even plugins that didn't render their own
title get one.

### Phase 3 — Backwards compat + cleanup — DONE

4. **Legacy style migration** — implemented in `resolveButtonStyleName()`
   in ButtonNode.tsx. Module-level `Set` dedupes the warning so each
   unknown legacy style logs once.

5. **Delete dead code** — narrowed: the four lexical-internal UI
   primitive files still have consumers in ActionsPlugin /
   LayoutPlugin / InlineImagePlugin / TablePlugin. **Deletion deferred
   to a follow-up that migrates those four plugins to the
   UI-from-ThemeContext pattern.** Filed as follow-up #1.

## Files Requiring Changes

| File | Change |
|---|---|
| `src/dms/packages/dms/src/ui/components/lexical/editor/nodes/ButtonNode.tsx` | Drop `BUTTON_STYLES`. `decorate()` renders via `UI.Button` with `activeStyle={this.__style}`. Add legacy-style fallback. |
| `src/dms/packages/dms/src/ui/components/lexical/editor/plugins/ButtonPlugin/index.tsx` | `InsertButtonDialog` uses `UI.Input` / `UI.Button` / `UI.MultiSelect` / `UI.Switch` from `ThemeContext` instead of lexical-internal primitives. Style options auto-generated from `theme.button.styles`. |
| `src/dms/packages/dms/src/ui/components/lexical/editor/plugins/ButtonPlugin/index.tsx` (Phase 2) | New `InsertButtonModal` wraps `InsertButtonDialog` in `UI.Modal`; `ComponentPickerPlugin` opens this modal instead of the lexical-internal one. |
| `src/dms/packages/dms/src/ui/components/lexical/editor/plugins/ComponentPickerPlugin/index.tsx` | Replace `showModal('Insert Button', …)` call with state-driven `<InsertButtonModal open={…} />`. |
| `src/dms/packages/dms/src/ui/components/lexical/editor/ui/{Button,Select,TextInput,Dialog}.tsx` | Phase 3 — delete if no other consumers; otherwise leave. |

## Testing Checklist

**Verified via code review + dev-server probe:**
- [x] Page loads at `/marketing-homepage` without
      `Runtime.exceptionThrown` events or button-related console
      errors (probed in headless Chrome with the new ButtonNode +
      useModal in place).
- [x] `exportDOM()` produces a clean `<a href>` with
      `data-lexical-button-style` attribute, no inlined classes —
      live React render owns styling (code-reviewed).
- [x] Legacy-style fallback logic in `resolveButtonStyleName()`:
      stored style not in `theme.button.styles[].name` → returns
      `styles[0].name`, logs one-time warning, dedupes via
      module-level Set (code-reviewed).
- [x] Style dropdown sourced from `theme.button.styles[].name` via
      `React.useMemo` in `InsertButtonDialog` — no hardcoded
      options (code-reviewed).

**Needs live verification in authed browser:**
- [ ] Slash `/Button` opens a modal that renders inside the
      brand-themed `UI.Modal` chrome (parchment surface, hairline
      border, brand backdrop) with a "Insert Button" header from
      the new ModalShell inside `useModal`.
- [ ] Modal text input uses `UI.Input` (brand focus ring, parchment
      surface, slate border).
- [ ] Style dropdown shows tessera's `default` / `plain` / `active`
      / `danger` — not the old `primary` / `secondary` / etc.
- [ ] Keep-search-params toggle is a `UI.Switch` (not a `<Select>`).
- [ ] Editing an existing button opens the modal pre-populated
      with `initialValues`; saving replaces the node correctly.
- [ ] The inserted button renders in edit mode as a `UI.Button`
      with the brand skin (slate fill / parchment text for tessera's
      `default` style — not the old EAAD43 terracotta-pill).
- [ ] On a published page, the button click navigates: internal
      paths via `useNavigate()`, external (http(s)://) via
      `window.open(_, '_blank', 'noopener,noreferrer')`. Honors
      keep-search-params toggle on internal navigation.
- [ ] Switching the page's theme (tessera → wcdb → avail) re-skins
      all existing button nodes correctly via the live `UI.Button`
      style lookup — no node data migration needed.
- [ ] All other lexical plugin dialogs (Image, Table, Layout) also
      pick up the brand modal chrome via the rewritten `useModal`
      (collateral benefit from Phase 2's scope expansion).

## Notes / Open Questions

- **`UI.Switch` vs. `UI.MultiSelect` for keep-search-params.** A
  toggle is the natural UI for a boolean; using `MultiSelect` for
  it was a workaround in the lexical-internal version. Switch is
  the right call. Verify the switch primitive is exported on `UI`.
- **`activeStyle` per-instance.** `UI.Button` accepts an
  `activeStyle` prop that overrides the theme's default. The
  ButtonNode passes `__style` through this prop directly — no need
  to merge or pre-compute the class string at the node level.
- **Inline vs. block.** ButtonNode is `isInline(): true`; keep
  that. `UI.Button` renders an inline-flex span which composes
  cleanly inside Lexical text runs.
- **Backwards compatibility for the seed script.** The
  `scripts/seed-tessera-pages.mjs` seed currently has no button
  nodes — once this lands, we can add `/Button` examples for the
  marketing hero CTAs to replace the bullet list.

## References

- Lexical `StyledParagraphNode` precedent — `src/dms/packages/dms/src/ui/components/lexical/editor/nodes/StyledParagraphNode.ts`
- UI Button — `src/dms/packages/dms/src/ui/components/Button.{jsx,theme.jsx}`
- UI Modal — `src/dms/packages/dms/src/ui/components/Modal.{jsx,theme.jsx}`
- ThemeContext UI pattern — `src/dms/packages/dms/CLAUDE.md` ("UI Component Access Convention")
- Lexical extension philosophy — `src/dms/skills/translating-design-system-to-dms-theme.md` §3.1.4 Approach B
