# Lexical links: force `rel="noopener noreferrer"` on `target="_blank"` (reverse-tabnabbing fix)

## Origin

Client security scan (Qualys WAS) of **MitigateNY** (`hazardmitigation.ny.gov`, app `mitigat-ny-prod`,
served from `dms-template` on Netlify) returned two findings:

- **150124 — Clickjacking / Frameable Page (Medium).** Pages can be loaded in an `<iframe>`.
  *Fixed outside this task* — anti-framing response headers added to
  `dms-template/netlify.toml` (`X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'`,
  plus `Cross-Origin-Opener-Policy`, `X-Content-Type-Options`, `Referrer-Policy`). Deploy-config
  only, no submodule change. Re-deploy required for it to take effect.
- **150222 — Reverse Tabnabbing (Minimal).** This task. Body links that open in a new tab render
  as `<a target="_blank">` with **no `rel`**, leaving `window.opener` reachable by the opened page.

## Objective

Every link Lexical renders with `target="_blank"` must carry `rel="noopener noreferrer"` — for
**existing already-authored content** (the scanner crawls live pages) as well as new links — without
a per-page data migration. Backward-compatible (purely additive hardening).

## Root cause

`packages/dms/src/ui/components/lexical/editor/plugins/LinkPlugin/index.tsx` creates links with:

```ts
const linkNode = $createLinkNode(url, { target });   // sets target, never rel
```

`@lexical/link@0.39.0` `LinkNode` only emits a `rel` attribute when `__rel` is truthy
(`updateLinkDOM` loops `['target','rel','title']` and `removeAttribute` when falsy). Created with
`rel` unset (defaults `null`), so the rendered anchor has `target="_blank"` and no `rel`.

The published view (`editor.tsx`, `editable=false`) renders through the **same** `RichTextPlugin` /
`LinkNode.createDOM`, so this is the live HTML the scanner sees. A read-only composer bootstrapped
from stored state does **not** reliably fire node *transforms*, so the fix must live in the node's
`createDOM`/`exportDOM`, not in a transform.

Key lever: `$createLinkNode` → `$applyNodeReplacement(new LinkNode(...))`, and `LinkNode.importJSON`
routes through `$createLinkNode`. So a **registered node replacement** for `LinkNode` is applied to
both freshly-created links *and* existing stored links on deserialize — exactly what we need.

`AutoLinkNode` (auto-detected URLs) is a separate registered type and its autolinks render with no
`target`, so they are not in scope.

## Implemented fix

### 1. `SafeLinkNode` (node replacement) — covers existing + new content — DONE

New file `packages/dms/src/ui/components/lexical/editor/nodes/SafeLinkNode.ts`:

- `class SafeLinkNode extends LinkNode` with `static getType() === 'safe-link'`, `static clone()`,
  and a constructor delegating to `super`.
- Override `createDOM` / `updateDOM`: call `super`, then if `getTarget() === '_blank'` set the
  anchor's `rel` to a token set that always includes `noopener` + `noreferrer` (merging, not
  clobbering, any author-set tokens like `nofollow`; guarded by `tagName === 'A'`).
- Override `exportJSON()` to persist the safe `rel` for `_blank` links (type is `'safe-link'`,
  inherited from `getType()`).
- Registered in `editor/nodes/PlaygroundNodes.ts`: the plain `SafeLinkNode` klass **plus**
  `{ replace: LinkNode, with: (n) => new SafeLinkNode(n.getURL(), { rel: n.getRel(), target: n.getTarget(), title: n.getTitle() }), withKlass: SafeLinkNode }`.
- Both render paths register `[...PlaygroundNodes]` — the live composer (`editor/index.tsx`) and
  the SSR headless editor (`editor/createHeadlessEditor` → `$generateHtmlFromNodes` → `exportDOM`
  → `createDOM`) — so `rel` is injected in both browser render and SSR HTML.

**Why `'safe-link'` and not `'link'` (design constraint discovered during impl):** Lexical 0.39
enforces two invariants that *prevent* a replacement node from reusing the base `'link'` type —
`errorOnTypeKlassMismatch` at construction (registry klass for a type must equal the node's
constructor) and `exportJSON().type === constructor.getType()` at serialize. A subclass therefore
must carry its own type. Consequence: **newly authored / re-saved** links serialize as `'safe-link'`;
existing stored `'link'` content is untouched on disk and still renders correctly (it deserializes
through the replacement and gets `rel` at `createDOM` — no migration). Blast-radius check: nothing in
the dms package keys Lexical link nodes by the literal `'link'` (the `type:'link'` hits are unrelated
nav/menu item types), so the new serialized type has no in-repo consumers.

### 2. `LinkPlugin` — set `rel` at creation (clean stored data) — DONE

`LinkPlugin/index.tsx` now sets `rel = target === '_blank' ? 'noopener noreferrer' : null` on
`$createLinkNode(url, { target, rel })` and via `setRel(rel)` on the existing-node update branches.

## Files to change

- `packages/dms/src/ui/components/lexical/editor/nodes/SafeLinkNode.ts` *(new)*
- `packages/dms/src/ui/components/lexical/editor/nodes/PlaygroundNodes.ts` *(register replacement)*
- `packages/dms/src/ui/components/lexical/editor/plugins/LinkPlugin/index.tsx` *(rel on create/update)*

## Content cleanup (separate, via DMS CLI — not a code change) — DONE 2026-06-17

The clickjacking finding list surfaced a **malformed author link** on the "Key Plans and Programs"
page (id `1130761`, slug `plan_to_act/evaluate_capacity_discover_resources/key_plans_and_programs`).
It was **not a `LinkNode`** — it was a Lexical **`ButtonNode`** ("Learn More", style `primary`)
whose `path` had been overwritten with a pasted paragraph
(`#concert with the State and Local HMPs and the MitigateNY2.0 project … here: link`), which the
crawler rendered as the giant URL.

Fixed via the DMS CLI against `dmsserver.availabs.org` (app `mitigat-ny-prod`):

- [x] Located the section. Draft and published are **separate rows**: the button lives in draft
      component `1429430` (in `draft_sections`) **and** published component `1506581` (in `sections`,
      what the live site serves). Page `has_changes: false`, so they were in sync.
- [x] Neutralized the button (user chose `#` over a real URL, which was unknown): set `path` →
      `"#"` in **both** rows via read-modify-write of `data.element['element-data']` (the Lexical
      JSON string), preserving `linkText`/`style` and all body paragraphs. Backups in
      `scratchpad/mitigat-ny-prod-prod/security-fix-backup/`.
- [x] Confirmed: re-fetch shows `path: "#"` in both rows; Playwright render of the live page on
      `localhost:5173` shows the "Learn More" `<button>` with no malformed URL and no
      `concert with the State` / `MitigateNY2.0` markers in the DOM.

If the real "NYS Adaptation & Resilience Plan" URL surfaces, drop it into the button's link in the
editor (or `--set element…` the same way).

## Testing checklist

- [x] `npm run build` in `dms-template` succeeds.
- [x] Headless round-trip test (`@lexical/headless`, transpiled node via esbuild) — all pass:
  - [x] `$createLinkNode` returns a `SafeLinkNode` instance (replacement wired).
  - [x] New `_blank` link → serialized `rel: "noopener noreferrer"`.
  - [x] **Existing stored `_blank` link with `rel: null`** → deserialize+reserialize injects
        `rel: "noopener noreferrer"` (proves existing content is fixed without migration).
  - [x] Author `rel: "nofollow"` on a `_blank` link → `"nofollow noopener noreferrer"` (merged).
  - [x] `_self` link → `rel` stays `null` (untouched).
- [x] Browser check via Playwright against `localhost:5173` (dev server on this branch): every
      `<a target="_blank">` across `key_plans_and_programs`, `harmful_algal_blooms`, and
      `dr_4615_…` (existing published content, **not re-saved**) renders `rel` with both `noopener`
      and `noreferrer` — 0 missing. Confirms the fix works on existing content end-to-end.
- [ ] Deploy `dms-template` to Netlify (`npm run deploy`) so the SafeLinkNode bundle + the
      `netlify.toml` headers go live, then client re-scan: 150222 + 150124 clear.

## Backward-compatibility notes

- Behaviorally additive: only *adds* `rel` to `_blank` links; same-tab links untouched; existing
  stored content needs no migration and renders correctly immediately on deploy.
- **One serialization caveat:** newly authored / re-saved links serialize as `type: "safe-link"`
  instead of `"link"` (forced by Lexical's node-replacement invariants — see "Implemented fix").
  Within the DMS ecosystem this is safe (every deploy of this lib registers `SafeLinkNode`, which
  reads both types; nothing in-repo keys link nodes by the literal `"link"`). The only theoretical
  risk is a *different, older* build (without `SafeLinkNode`) reading content authored by this
  build — not a concern for MitigateNY (single app/deploy).
- Per the project rule, this is a shared UI/primitive change → tracked here.
