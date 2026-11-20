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

## Results (2026-11-20, `availabs` pattern, local production build, 6 pages × 3 runs, one page at a time)

Both builds from the same day's code, differing only in this change: `perf-build-5556-base` (run
`scratchpad/hub-test/perf/2026-11-20-1430-availabs-local-base`) against `perf-build-5556-fix1` (run
`…-1423-availabs-local-fix1`, report `compare-availabs-local-base.html`).

| Median page, Complete | Before | After | Pages faster |
|---|---|---|---|
| First load | 4.75 s | 3.19 s | 6 of 6 |
| Returning load | 4.12 s | 2.45 s | 6 of 6 |
| Click | 1.50 s | 0.70 s | 3 of 3 |
| Journey (landing + 2 clicks) | 9.56 s | 5.24 s | |

`/work`: first load 11.9 → 6.6 s, returning 11.1 → 5.0 s, click 2.2 → 1.1 s. Scripts are still about 70% of
what is left.

Scores (see it / use it / all there): first load 100/0/25 → 83/17/58; returning 100/17/50 → 83/33/83;
navigate –/17/67 → –/50/83.

**It changes how pages look.** Saved content has paragraphs that hold one empty text node. With the second
`setEditorState` they render as `<p><span></span></p>`, which has no height. Without it, Lexical's own
transforms run on the initial state, drop the empty text node, and the paragraph renders as `<p><br></p>`:
one blank line. Counted: 22 on `/home`, 13 on `/platform`, 26 on `/work`; pages grow by 27 px (`/platform`)
to 121 px (`/work`). Three MitigateNY pages checked had none and render identically.

So the old second set was also, by accident, what kept un-normalised content on screen. Open: accept the
blank lines, clean the content, or keep the old look another way (render empty-text paragraphs without
height in view mode).

**"See it" fell from 100 to 83** for the same reason. On `/work/transportny` the "Program facts" card is
the largest element. It paints at ~0.3 s from the server's HTML in both builds. With the change, when its
live editor mounts the card gains one blank line (342 → 369 px tall), so Chrome counts the taller card as a
new, larger main-content paint at ~1.7 s. The content was visible at 0.3 s either way; what the number shows
is a late layout jump. Keeping the old look for empty-text paragraphs removes it.

- [x] `dms perf` before and after
- [ ] Rendered pages unchanged: **no**, see above
