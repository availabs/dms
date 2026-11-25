# Rich text in view mode: mount the live editor off the page, keep the look

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

## What was tried (2026-11-20)

1. **Mark empty text nodes `token` in view mode** so Lexical's tidy-up leaves them. Fixed the six availabs
   pages; MitigateNY still differed: with the second content set gone, node transforms take effect in view
   mode (tables get column widths and a paragraph in each empty cell, a collapsible gets a toggle button, a
   typed email becomes a link).
2. **No node transforms in read-only editors.** Broke tables the other way (no scroll wrapper).

The look on screen today is the saved state applied *after* the plugins' transforms have run once. Only the
original sequence produces it, so both of those were dropped and the double set
([lexical-view-double-set-state.md](./lexical-view-double-set-state.md)) was put back.

## The change (in `ui/components/lexical/editor/index.tsx`, view mode only)

The content handling is the original. What changed is where the editor mounts:

- A read-only editor is rendered through a portal into a `div` that is **not in the document**. Lexical's
  style and layout reads while it mounts (`getComputedStyle` on the root, the DOM selection on each commit)
  then find a clean page and cost nothing.
- When `UpdateEditor` has set the content it calls `onContentSet`; `showTogether` collects those calls and,
  in one microtask with `flushSync`, shows them all: the server's static HTML is dropped and the detached
  `div` is appended into a placeholder. One layout for the page, before the browser paints.
- The placeholder and the detached `div` are `display: contents`.

A timer-based batch was tried first and flashed: sections remount several times during a load, a remount has
no server HTML to show, and each one painted blank (layout shift 4.5 against 0.004). The microtask flush
fixed it.

## Results (availabs pattern, local production builds from the same code, 6 pages × 3, one at a time)

Runs in `scratchpad/hub-test/perf/`: `2026-11-20-1430-availabs-local-base`, `…-1423-availabs-local-fix1`
(double set removed), `2026-11-20-1633-availabs-local-fix3` (this change).

| Median page, Complete | Original | Double set removed | This change |
|---|---|---|---|
| First load | 4.75 s | 3.19 s | 2.61 s |
| Returning load | 4.12 s | 2.45 s | 2.16 s |
| Click | 1.50 s | 0.70 s | 0.35 s |
| Journey (landing + 2 clicks) | 9.56 s | 5.24 s | 4.08 s |

`/work`: first load 11.9 → 4.6 s, returning 11.1 → 2.8 s, click 2.2 → 0.5 s. CPU profile of `/work`: the two
Lexical hot functions 12.5 s → ~0.1 s. Layout shift and main-content paint as in the original.

**Look.** All 165 pages (6 availabs, 159 MitigateNY) compared with the build from before any change: rich-text
HTML identical on every page once attribute order is ignored (images come out with `src` and `style` in the
other order), page heights identical, except data-driven pages that also differ between two loads of the old
build. Three pages differed in text outside rich text on one comparison and not between two old loads
(`extreme_cold/mitigation_strategy`, `drought/risk_profile`, `population_and_demographics`, the last also
18 px taller): not explained; they are data sections, not rich text.

## Found on the way

- On `/lab` the page's sections are torn down and rebuilt about four times during one load, each time
  remounting all 60 editors. Predates this change; not investigated.
- The earlier variants (double set removed; `token` text nodes; AutoLink and Keywords off in view) were swept
  into "changes" commits on `dms` master on 2026-11-20. The working tree supersedes them.

## Testing checklist

- [x] 165 pages: rich-text HTML and height against the pre-change build
- [x] `dms perf` on the `availabs` pattern against the original and against the double set removed
- [x] Layout shift and main-content paint unchanged
- [ ] View mode by hand: collapsibles open and close, a button that sets a page parameter, links
- [ ] Edit mode: open a page in the editor, edit a rich-text section, save
- [ ] A tab opened in the background
- [ ] MitigateNY perf run (the hazard pages have 20–40 editors each)
