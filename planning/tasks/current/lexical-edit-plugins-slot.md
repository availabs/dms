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

## Testing

- [x] On the hub: the chat composer's `@` list opens, picks with the keyboard, and inserts the link;
      editors with no `plugins` behave as before.

## Log

- **2026-11-17** — Built with the chat notifications task.
