# SSR: rich-text (Lexical) sections render empty in server HTML

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** doing · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

A page served over SSR should arrive with its rich text in the HTML. Today every Lexical section reaches the
browser as an empty `<div contentEditable="false" role="textbox"></div>`, and its text only appears after the JS
loads, hydrates and mounts a live editor. That loses most of SSR's value for LCP and crawlers on content pages.

## Found

2026-11-16, on the hub (`.env-hub`, `localhost:5555`, dev-mode SSR), avail homepage (`hub` / `availabs` pattern
2931003, page 2931016):

- `GET /` returns the nav plus all 43 section wrappers, but the visible text in `#root` is only the nav links.
- The page's 43 published sections are all `lexical`; their content is in the router's hydration data
  (~175 KB), so it reaches the browser as JSON only.
- `preload_data: true` on the pattern is unrelated. It only preloads data-wrapper sections (Spreadsheet, Card,
  Graph), and this page has none.

## Cause

`LexicalView` (`ui/components/lexical/index.jsx`) mounts the real editor read-only. Lexical writes the DOM
from the client (the root element is attached in a ref callback), so `renderToString` emits an empty
content-editable. The HTML view that preceded it (`getHtml` in an effect, then a sync `getHtmlSync` version) was
commented out by `12a214bb` "temp lexical fix" (2026-02-06); the reason isn't recorded. Likely fidelity: the
exported HTML differs from the live editor (decorators such as buttons export as unstyled `<a>`), and buttons
with `setParam` actions / collapsibles need the live editor's handlers.

Feasibility check (scratchpad script, Vite `ssrLoadModule` + linkedom): `getHtmlSync` rendered 36 of the 43
homepage sections to real HTML (headings, styled paragraphs, buttons, layouts, images); the rest are probably
empty spacers.

## Approach: static first, live after hydration

In view mode (not editable, not collab), `Lexicals` (`editor/index.tsx`) renders in two steps:

1. **Static view** — the same wrapper divs and classes the live view renders
   (`editorShell` › `editorViewContainer` (bg) › `viewScroller` › `editor.base` › `contentEditable`), with the
   content as `dangerouslySetInnerHTML`:
   - **server** (`import.meta.env.SSR`): `getHtmlSync(value, …, { nestedTheme, dmsTheme })` with the exact
     nested theme the live editor uses (brand text styles, Icons), so classes match;
   - **client**: `__html: ''` with `suppressHydrationWarning`. React never patches `dangerouslySetInnerHTML` on
     hydration, so the server's HTML stays in place, and the client never pays for generating HTML.
2. **Live editor** — a layout effect flips to the existing editor right after mount/hydration (before paint), so
   button actions, navigation and collapsibles behave as today. On client-side navigation the static step is
   never painted.

**Buttons:** a view-only HTML export override for `ButtonNode` emits a `<button>` with the theme's resolved button
class (same lookup as `ButtonComponent`: `resolveButtonStyleName` + `getComponentTheme`) inside the node's
`createDOM` wrapper, so the swap doesn't shift the layout. The library's default `htmlConfig` (PDF/HTML export,
`lexicalToHtml`) is unchanged.

**Later (not this task):** keep the static HTML for sections with no interactive nodes and skip mounting an
editor at all (TBT/INP win); button icons in the static HTML.

## Files

- `ui/components/lexical/editor/createHeadlessEditor.js` — accept a prebuilt `nestedTheme` and an `html` config
- `ui/components/lexical/ssr.ts` — `getHtmlSync(state, flatTheme, icons, opts)`; `opts.nestedTheme` / `opts.dmsTheme`
- `ui/components/lexical/editor/viewHtmlConfig.js` (new) — `htmlConfig` + themed `ButtonNode` export
- `ui/components/lexical/editor/index.tsx` — static-first view mode
- `render/ssr2/handler.jsx` — DOM globals the HTML export needs, if any are missing at render time

## Testing Checklist

- [ ] hub `/`: server HTML contains the homepage's rich text
- [ ] hub `/`: buttons in server HTML carry the theme's button classes
- [ ] browser: no hydration errors in console; page looks the same before and after JS
- [ ] buttons navigate / set params after hydration; collapsibles toggle
- [ ] client-side navigation between pages renders rich text (no empty flash)
- [ ] edit mode unchanged
- [ ] `npm run build` + SSR build succeed
