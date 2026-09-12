# Editing an existing Lexical link's URL splits it into multiple link nodes

## Origin

User-reported (MitigateNY authoring): select text, click the link icon — link is created
correctly with the right URL. To *edit* that URL later, you must click into the link text first
(to place the cursor inside it) before the floating link editor's edit pencil appears, then type
the new URL and save. On save, the link text visibly splits into two (or more) separate `safe-link`
nodes, with **different URLs** on each fragment — e.g. "Navigating and organizing the workspace"
split into "Navi" (plain text) + "gatin" (`safe-link` → `https://devmny.org`, correct) +
"g and organizing " (`safe-link` → `https://`, stale placeholder) + "the workspace" (plain text).

## Root cause

`packages/dms/src/ui/components/lexical/editor/plugins/LinkPlugin/index.tsx`'s
`TOGGLE_LINK_COMMAND` handler unconditionally ran, for any non-empty `url` payload:

```ts
const linkNode = $createLinkNode(url, { target, rel });
linkNode.append($createTextNode(selectedText));
selection.insertNodes([linkNode]);          // always runs first

for (const node of nodes) {                  // then, redundantly, tries to patch the
  const parent = node.getParent();           // pre-insertion selection's original link
  if ($isLinkNode(parent)) { parent.setURL(url); ... return; }
  if ($isLinkNode(node))   { node.setURL(url); ... return; }
}
```

This conflated two different situations that the floating link editor actually produces:

1. **Wrapping newly-selected plain text in a link** (first-time "Insert link") — selection is a
   real range over plain text, `insertNodes` is the right tool.
2. **Editing an existing link's URL** — to reach the edit pencil you click *into* the link's text,
   which leaves the selection as a **collapsed caret** inside the existing `LinkNode`/`SafeLinkNode`,
   not a range over the text to relink. `selection.getTextContent()` on a collapsed caret is `''`,
   so `insertNodes([linkNode])` inserted an *empty* new link node at the caret point — which forces
   Lexical to split the surrounding text/link node in two around the insertion point. Only **after**
   that split did the loop run against the `nodes` array captured *before* the split, patching
   `setURL` on whichever now-stale node reference it still matched — leaving one fragment with the
   new URL and the sibling fragment(s) with the link's previous URL.

## Fix

Reordered the branch so the "already inside an existing link" case is checked **first** and, when
it matches, only mutates the existing node's fields (`setURL`/`setTarget`/`setRel`) — no node
creation, no `insertNodes`, so nothing gets split. The `$createLinkNode` + `insertNodes` path now
only runs as a fallback, for the genuine "wrap freshly-selected plain text" case where the loop
finds no enclosing link node.

File: `packages/dms/src/ui/components/lexical/editor/plugins/LinkPlugin/index.tsx`.

## Testing checklist

- [x] Read code path end-to-end (`FloatingTextFormatToolbarPlugin` → `TOGGLE_LINK_COMMAND` →
      `LinkPlugin`'s handler) to confirm the caret-vs-range distinction.
- [x] Headless (`@lexical/headless`) repro: built a `LinkNode` containing
      "Navigating and organizing the workspace", placed a **collapsed** selection at offset 4
      (mirrors clicking into the link to reopen the editor), then ran the command handler.
      - Old logic (create+insert first, patch second): reproduced the reported bug exactly —
        2 `LinkNode`s, `"Navi"` → `https://devmny.org` (new url) / `"gating and organizing the
        workspace"` → `https://` (stale url).
      - Fixed logic (patch-in-place-first): 1 `LinkNode`, full text intact, url
        `https://devmny.org`. Scratch script discarded after running (not committed —
        one-off repro, not a regression test harness).
- [ ] Live-verify in the browser: select plain text → insert link → confirm single `safe-link`
      node, correct URL.
- [ ] Live-verify: click into that link's text → edit pencil → change URL → save → confirm the
      link text stays as **one** node with the new URL (no split).
- [ ] Live-verify: click the link, use the trash/remove button → confirm it unwraps back to plain
      text (untouched code path, but worth re-confirming after the reorder).
