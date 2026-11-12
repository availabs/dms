# `PLAYGROUND_TRANSFORMERS` throws on import: `TWEET` is listed but not defined

**Initiatives:** [tes_chat_pattern](../../../../../planning/initiatives/tes_chat_pattern.md) · **Status:** built · **Release:** commit — `src/dms` submodule (uncommitted in the working tree) · **Created by:** amuro@albany.edu · **Edited by:** —

**For:** the chat pattern's Slack importer
([`chat-slack-import.md`](../../../../../planning/tessera/tasks/current/chat-slack-import.md)), the first
consumer of the library's Markdown transformers outside the editor.

## Objective

`ui/components/lexical/editor/plugins/MarkdownTransformers/index.ts` exports `PLAYGROUND_TRANSFORMERS`,
the project's own transformer list (tables, rules, images, check lists, then `@lexical/markdown`'s). The
list names `TWEET`, whose definition is commented out a hundred lines above. Evaluating the module throws
`ReferenceError: TWEET is not defined`.

## Root cause

Nothing live imports the module — `ActionsPlugin` has its import and its two uses commented out — so the
error never reached a browser. The Slack importer's headless entry (`src/patterns/chat/cli/slack/
headless_entry.js`) was the first importer, found it on 2026-11-09, and fell back to `@lexical/markdown`'s
`TRANSFORMERS`.

## Fix

Comment out the `TWEET,` entry beside the commented-out `EMOJI,`, with a note. One line. The importer
stays on `@lexical/markdown`'s list, which covers Slack's text (bold, italic, strike, code, fences,
quotes, links); the project list adds tables, rules, images and check lists, which no Slack message has.

## Files requiring changes

| File | Change |
|---|---|
| `packages/dms/src/ui/components/lexical/editor/plugins/MarkdownTransformers/index.ts` | `TWEET,` → commented, with the reason |

## Testing checklist

- [x] `node -e "import('./…/MarkdownTransformers/index.ts')"` is not runnable in plain Node (TS); the
      check is the importer's bundle — `src/patterns/chat/cli/slack/headless_entry.js` bundled by esbuild
      imports `createHeadlessEditor` from the same tree and runs; switching it to `PLAYGROUND_TRANSFORMERS`
      is a follow-up for whoever first needs a table or a check list in chat
- [ ] vite build of the site passes (the module is still unreferenced, so the build cannot fail on it)
