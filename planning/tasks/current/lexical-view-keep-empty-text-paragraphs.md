# Rich text in view mode: keep paragraphs with an empty text node at no height

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** doing · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

Keep the speed gain of [lexical-view-double-set-state.md](./lexical-view-double-set-state.md) without its
side effect: pages growing by a blank line for every paragraph saved with an empty text node.

## Background

Saved rich text has paragraphs that hold one empty text node. Rendered as saved they are
`<p><span></span></p>`: no height. Lexical's transforms delete an empty "normal" text node whenever something
marks it dirty, and the paragraph then renders as `<p><br></p>`: a blank line. Until 2026-11-20 a redundant
second `setEditorState` on mount put the saved state back after those transforms; removing it (the speed
fix) left the tidied state on screen. Counted: 26 such paragraphs on availabs.com `/work`, 22 on `/home`, 13
on `/platform`; `/work` grew 121 px, and `/work/transportny`'s main-content paint moved from ~0.3 s to ~1.7 s
because its largest card grew a line when its editor mounted.

## The change

`ui/components/lexical/editor/index.tsx`: in view mode the value given to the composer has its empty text
nodes switched from mode `normal` to `token` (`keepEmptyText`). Lexical never removes or merges a token text
node, and it renders the same `<span>`. Display only; edit mode and saved content are untouched.

## Testing checklist

- [ ] Ten pages (six availabs, four MitigateNY): same text, same rich-text HTML, same page height as the
      build from before the speed fix
- [ ] `dms perf` on the `availabs` pattern against that build and against the speed fix alone
- [ ] `/work/transportny` main-content paint back under 0.5 s
- [ ] Edit mode: a page with such paragraphs opens, edits and saves as before

## Results

(to fill in)
