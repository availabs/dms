# Export the Lexical renderer and editor from the library entry

**Initiatives:** [tes_chat_pattern](../../../../../planning/initiatives/tes_chat_pattern.md) · **Status:** built · **Release:** commit — `src/dms` submodule (uncommitted in the working tree) · **Created by:** amuro@albany.edu · **Edited by:** —

**For:** the chat pattern's message list
([`chat-pattern-implementation.md`](../../../../../planning/tessera/tasks/current/chat-pattern-implementation.md)),
which renders many rich-text values at once.

## What and why

Two lines in `packages/dms/src/index.js`:

```js
export { getHtmlSync as lexicalToHtml } from './ui/components/lexical/ssr'
export { LexicalEdit, LexicalView } from './ui/components/lexical'
```

An app pattern may only import library code through the package entry
(`registering-a-pattern-type.md` §1), and chat needs to render Lexical bodies — the format the Slack
import writes, now that converting at import was chosen over a chat-only mrkdwn renderer
(owner, 2026-10-21).

**Why `getHtmlSync` and not `LexicalView`:** `LexicalView` mounts a real editor per value, which is
right for one section on a page and wrong for a list — a chat window is 50 bodies, none of them
editable in place. `getHtmlSync` builds a headless editor, generates HTML and throws the editor
away; the caller caches the string. It is the same function the SSR path already uses, so the
rendered markup matches what the server produces.

Renamed on the way out because `getHtmlSync` says nothing about Lexical from an importer's side.

`LexicalEdit` is for the chat **composer** (owner, 2026-10-22: rich-text messages, one editing
surface across the platform). **No bundle cost either:** `dmsColumnTypes`, exported from the same
entry, already imports both statically — they are in the main graph whether or not this line exists.

### Known gap this exposed

The editor's defaults are sized for a page section: `editorScroller: min-h-[150px]`, 16px paragraph
spacing, and a block drag handle. A chat composer wants none of them, and today overrides them with
structural CSS in `Composer.theme.js`. The clean fix is a **named `chat` style in the library's
lexical theme** (`ui/components/lexical/theme.js`), selectable via `LexicalEdit`'s existing
`styleName` prop — small, and it would make the editor reusable outside page sections without each
caller re-deriving the same overrides.

## What was NOT exported, deliberately

`getSyncAPI`. The chat pattern's live tail reads `globalThis.__dmsSyncAPI` instead, which looks like
the uglier option until you see why: the sync module is **dynamic-import-only on purpose** — "when
disabled, zero sync code is loaded" (`sync/CLAUDE.md`). A static re-export from the library entry
would pull the whole sync module into every bundle, sync-off builds included, and quietly undo that.
The global is the seam the library itself publishes (`dmsSiteFactory` sets it), so chat uses it and
says why in `useLiveTail.js`.

If a named export is wanted later, it has to be a lazy accessor, not a re-export.

## Testing Checklist

- [x] A message whose body is Lexical state renders with bold, italic, a link, a bullet list and
      inline code — verified live in the chat pattern against hand-built state
- [x] A plain-text body still takes the text path (no parse, no HTML)
- [x] A body that claims `format: 'lexical'` but isn't falls back to text rather than rendering empty
- [x] The composer sends plain text as `format: 'text'` and formatted text as `format: 'lexical'`;
      Enter sends, Shift+Enter is a newline, ⌃B bolds, and the box clears after sending
- [ ] Not checked: an SSR render of the same content (the function is the SSR path's own, so it
      should match, but chat has not been server-rendered yet)
- [ ] Not checked: whether the export widens any bundle — `ssr.ts` pulls `@lexical/headless` and the
      node set, which the editor already pulls on pages that have one, but a page with no Lexical
      section may now carry it. Worth a bundle diff before this ships.

## Log

- **2026-10-22** — Added and used. Status `built`: uncommitted in the `src/dms` submodule, with the
  other two library changes from this work.
