# LexicalEdit: a `plugins` slot for caller-supplied Lexical plugins

**Initiatives:** [tes_chat_pattern](../../../../../planning/initiatives/tes_chat_pattern.md) · **Status:** built · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

The chat pattern's composer needs an `@` typeahead that runs inside the editor
(`dms-template/planning/tessera/tasks/current/chat-notifications-and-mentions.md`). `LexicalEdit`
gave a caller no way to put a plugin inside its `LexicalComposer`, so nothing could reach the editor
through `useLexicalComposerContext`.

## Change

- `packages/dms/src/ui/components/lexical/editor/index.tsx`: `Lexicals` takes `plugins` (React
  elements) and renders them inside its `LexicalComposer`, after the editor shell. `LexicalEdit`
  passes it through with its other props. The library knows nothing about what is passed; the
  default is `null`, so every existing caller is unchanged.

Chat's first use (`src/patterns/chat/components/MentionsPlugin.jsx`) stores a mention as an ordinary
link to `#mention:<id>`, so no node type was added to the library.

### Follow-up, 2026-11-17 (chat's composer format bar)

- `editor/index.tsx` + `editor.tsx`: `Lexicals` now passes `placeholder`, `ariaLabel` (Editor took
  them all along; the wrapper dropped them) and the new `placeholderClassName` to the editor; new
  `hideFloatingToolbar` and `hideFloatingLinkEditor` (default `false`) leave out the selection format
  popup and the link popup, for a caller with its own format bar. A lexical column whose caller
  passes `placeholder` now shows it.
- `lexical/theme.js`: `linkEditor_base` gets `empty:border-0 empty:shadow-none`. The link editor
  follows the caret on every line and is filled only on a link; the default theme's border (added
  with the v6 restyle) drew it as a 400px line under the line being typed, in every editor.
- `ui/icons`: `Bold`, `Italic`, `Underline`, `Strikethrough`, `ListBullet`, `ListNumbered`, `Quote`,
  `Code`, `CodeBlock`, `TextFormat` (Aa), `At`, in the T6 stroke.
- `Button.theme.jsx`: `iconRowOn`, an icon-row button switched on.
- `SideNav.jsx` / `SideNav.theme.jsx` (same day, chat's site nav): `VerticalMenu` passes a nav
  item's `active`; the caret's wrapper is the theme key `indicatorWrapper` (was a literal `pr-2`,
  which pushed icon-rail glyphs off centre); the icon rail draws 44px tiles with 24px glyphs.
  The logo row is wrapped in the new key `topMenuWrapper` (default `contents`, so no change); the
  icon rail uses it to show the mark alone, centred, with the site title hidden. The rail's
  `logoWrapper` was never read by SideNav.

### Follow-up, 2026-11-18 (the `/` menu in chat's composer)

- `ComponentPickerPlugin`: optional `include` (option titles to offer; the dynamic table sizes are left
  out too) and `placement: 'above'` (theme key `typeaheadPopover_above` → `typeaheadPopover.above`), for
  an editor at the bottom of the screen. The menu carries `data-lexical-typeahead` while open, so a
  caller's own key handling can step aside. `Lexicals` / `editor.tsx` take `componentPicker:
  { hide, include, placement }`. Every existing caller is unchanged (defaults: all options, below).
- Fixed for every editor: the menu's `<ul>` had no class, so `typeaheadPopover_ul_base`
  (`max-h-[200px] overflow-y-scroll`) never applied and a long menu ran off the screen.

## Testing

- [x] On the hub: the chat composer's `@` list opens, picks with the keyboard, and inserts the link;
      editors with no `plugins` behave as before.

## Log

- **2026-11-17** — Built with the chat notifications task.
