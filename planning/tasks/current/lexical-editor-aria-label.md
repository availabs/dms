# The Lexical editor's text box has no accessible name

**Initiatives:** [tes_chat_pattern](../../../../../planning/initiatives/tes_chat_pattern.md) · **Status:** built · **Release:** commit — `src/dms` submodule (uncommitted in the working tree) · **Created by:** amuro@albany.edu · **Edited by:** —

**For:** the chat composer's screen-reader pass
([`tessera-v6-chat-pattern.md`](../../../../../planning/tessera/tasks/current/tessera-v6-chat-pattern.md)), and every
other `LexicalEdit` on the platform.

## Objective

A `LexicalEdit` renders a `contenteditable` with no `aria-label`, so the accessibility tree shows
`textbox "(no name)"` (seen on the chat composer 2026-11-09). The placeholder is a sibling element, not
a label, so it does not name the box either.

## Fix

`Editor` takes an `ariaLabel` prop (default empty) and hands it to both of its `ContentEditable`s (rich
and plain); `ui/ContentEditable.tsx` passes it through as `aria-label`. `LexicalEdit` already spreads
unknown props onto `Editor`, so a caller writes `<LexicalEdit ariaLabel="Message #general" … />`. The
chat composer passes its placeholder text. Nothing changes for callers that pass nothing.

## Files requiring changes

| File | Change |
|---|---|
| `packages/dms/src/ui/components/lexical/editor/editor.tsx` | `ariaLabel` prop, passed to both `ContentEditable`s |
| `packages/dms/src/ui/components/lexical/editor/ui/ContentEditable.tsx` | `aria-label={ariaLabel}` |
| (app) `src/patterns/chat/components/Composer.jsx` | `ariaLabel={placeholder}` |

## Testing checklist

- [x] lint clean on the three files (prop-types noise aside)
- [x] a vite build of a site passes (`npx vite build`, exit 0, 2026-11-09)
- [ ] the chat composer reads as `textbox "Message #<channel>"` in the accessibility tree (needs a rebuild of the spike site; the fix is one attribute)
