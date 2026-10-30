# Sites middleware: serve a preview slot's build at the slot's hosts

**Initiatives:** [plat_qa_automation](../../../../../planning/initiatives/plat_qa_automation.md) · **Status:** next · **Created by:** rdubowsky@albany.edu · **Edited by:** —

Library half of dms-template's
[preview-slots.md](../../../../../planning/shared/tasks/current/preview-slots.md), which holds the design, the scope
and why. Builds on [serve-sites-by-host.md](./serve-sites-by-host.md).

## Objective

`dms-server/src/sites/index.js` serves a build that isn't live at a preview slot's hosts. The slots come from
`<sitesDir>/<site>/previews.json`, which dms-template's deploy tool writes. The server reads only what that file
says; it knows no site, naming rule or slot holder.

## Current State

- `site.json` gives a site its `hosts` and its `live` build. Only live builds are served, and the build cache keeps
  only live builds (`src/sites/index.js:158-163`).
- Wildcard hosts match by suffix, longest first (`:155-156`, `:207-210`). So today `www.preview1.devtny.org` matches
  `*.devtny.org` and gets devtny's **live** build.

## Proposed Changes

- Read `<sitesDir>/<site>/previews.json` beside `site.json`, on the same change check. Shape:
  `{ "<slot>": { "hosts": [...], "build": "<id>" | null, "expiresAt": "<ISO>" | null, …fields the server ignores } }`.
  A missing file means no slots. An unreadable one keeps the previous version and warns, as `site.json` does.
- Add every slot's hosts to the host index, **including empty slots**, so they win over the site's own wildcard. A
  host claimed twice is served by none and logged, as for site hosts.
- A slot with a build that hasn't expired is served exactly like a live build: files, `index.html` fallback,
  `_redirects`, `X-Site-Build`. Its build stays in the cache.
- An empty or expired slot answers `404` with one plain line: "This preview slot is empty", or "This preview expired
  on <date>". Expiry is checked per request, so it takes effect without a file change.
- Build ids and slot names follow the existing `NAME_RE` rule (no slashes, no leading dot).

## Files Requiring Changes

- `packages/dms-server/src/sites/index.js`
- `packages/dms-server/tests/test-sites.js`

## Testing Checklist

- [ ] A slot host serves the slot's build, with `X-Site-Build` naming it; the site's own hosts still serve live.
- [ ] `www.preview1.<domain>` with no slot entry, an empty slot and an expired slot: none serves the live build.
- [ ] A host in two slots, or in a slot and a site: served by neither, with a warning.
- [ ] Editing `previews.json` takes effect within the reload interval, with no restart.
- [ ] `npm run test:sites` passes.
