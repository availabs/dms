# Rich text in view mode sets its content twice on mount

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** doing · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

Cut the time the browser spends frozen on pages with many rich-text sections, by removing a redundant
second commit in every read-only Lexical editor.

## Background

Measured with `dms perf` on availabs.com's `availabs` pattern (2026-11-20): about 80% of every wait is the
browser running scripts. A CPU profile of `/work` (73 rich-text sections) put 12.5 of 15.7 s in two Lexical
functions:

- 7.3 s in `$internalCreateSelection`, reached from `editor.setEditorState()` called in a microtask by
  `UpdateEditor`'s effect (`ui/components/lexical/editor/index.tsx`). About 100 ms per editor.
- 4.2 s in `$setElementIndent` → `getComputedStyle()`, reached from `setRootElement`. About 58 ms per editor.

In view mode the composer is already created with the value (`initialConfig.editorState`), so the effect's
`setEditorState` on mount sets the same content a second time.

## The change

`UpdateEditor` starts `lastValue` at the value the composer was created with (view mode, Lexical JSON only),
so the effect skips its first run. A later change of `value` still sets the state. Edit mode is untouched.

## Out of scope

The 4.2 s part, and not mounting Lexical in view at all (static HTML with small handlers): see the options in
[perf-measurement-tool.md](./perf-measurement-tool.md) and the rich-text row of
[rsc-view-pages.md](./rsc-view-pages.md).

## Testing checklist

- [ ] `dms perf` on the `availabs` pattern, local production build, before and after (same pages, 3 runs,
      one page at a time)
- [ ] The rendered pages are unchanged: same text on every page before and after
- [ ] A view page whose rich text changes after mount still updates (a filter-driven or param-driven text)
- [ ] Edit mode: open a page in the editor, type, save
- [ ] MitigateNY sample: no regression

## Results

(to fill in)
