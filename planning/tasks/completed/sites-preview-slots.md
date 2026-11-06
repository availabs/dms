# Sites middleware: serve a preview slot's build at the slot's hosts

**Initiatives:** [plat_qa_automation](../../../../../planning/initiatives/plat_qa_automation.md) · **Status:** dropped · **Created by:** rdubowsky@albany.edu · **Edited by:** rdubowsky@albany.edu

> **Removed 2026-11-06.** This was built 2026-10-30 and reached mercury with the 2026-11-02 server deploy. dms-template
> then replaced preview slots with preview stacks: each preview is its own dms-server, serving its own `site.json`. So
> the sites middleware's `previews.json` support, and its 11 tests, were taken out again: `src/sites/index.js` is
> back to sites only, and `npm run test:sites` passes 30/30.
> - It takes effect on mercury with the next server deploy. After that, delete mercury's `devtny/previews.json`.
> - The record is in [preview-stacks.md](../../../../../planning/shared/tasks/current/preview-stacks.md), step 7.

Library half of dms-template's
[preview-slots.md](../../../../../planning/shared/tasks/completed/preview-slots.md), which holds the design, the scope
and why. Builds on [serve-sites-by-host.md](../completed/serve-sites-by-host.md).

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
  `{ "<slot>": { "hosts": [...], "build": "<id>" | null, "expiresAt": "<ISO>" | null, "redirects": [...], …fields the server ignores } }`.
  A missing file means no slots. An unreadable one keeps the previous version and warns, as `site.json` does.
- Add every slot's hosts to the host index, **including empty slots**, so they win over the site's own wildcard. A
  host claimed twice is served by none and logged, as for site hosts.
- A slot with a build that hasn't expired is served exactly like a live build: files, `index.html` fallback,
  `_redirects`, `X-Site-Build`. Its build stays in the cache.
- An empty or expired slot answers `404` with one plain line: "This preview slot is empty", or "This preview expired
  on <date>". Expiry is checked per request, so it takes effect without a file change.
- Build ids and slot names follow the existing `NAME_RE` rule (no slashes, no leading dot).

## Status (2026-10-30): built, committed locally

All in `packages/dms-server/src/sites/index.js`, with 11 new tests in `tests/test-sites.js` (41/41 pass). Against
the old middleware, the 11 new tests fail and the 30 old ones pass.

- [x] `previews.json` is read beside `site.json`, on the same once-a-second check. Each file has its own
      stamp (inode, size, mtime, now in `fileStamp`), so a change to one doesn't re-read the other.
- [x] Slot hosts go into the same host index as site hosts. Index entries are now targets (`{ id, name, slot? }`)
      instead of site names. A slot's wildcard is a longer suffix than the site's own, so the existing longest-first
      order makes it win.
- [x] Serving: a slot with a live, unexpired build is served by the same code as a live build, with `X-Site-Build`
      naming the slot's build. Slot builds stay in the build cache.
- [x] Expiry is checked per request against `expiresAt`, parsed once when the file is read. Messages: "This preview
      slot is empty.", "This preview expired on 2026-10-29 12:00 UTC.", and "This preview's build is no longer on
      the server." for a pruned build. All are 404s; a missing live build stays a 503.
- [x] One log line per slot when the files change: `[sites] devtny/preview2: *.preview2.devtny.org -> build <id>
      until <date>`, or `(empty)`.
- **Design notes:**
  - **A slot's `redirects`** (added 2026-10-30) are lines in `_redirects` syntax, applied before the slot's build,
    even when it's empty. They exist for the bare `previewN.devtny.org`. That name doesn't match
    `*.previewN.devtny.org`, so it would fall to the site's `*.devtny.org` and show the live build under a subdomain
    called `previewN`. The deploy tool lists the bare name in the slot's hosts and gives it a 301 to `www.`. The
    redirect lives in the lease file, not the build's `_redirects`, so a slot build stays identical to the build
    that would go live.
  - **A host claimed twice, at least once by a slot,** answers 404 "This preview address is claimed twice". It no
    longer just drops out of the index: the next-shorter wildcard would then serve a live build. A host claimed
    only by sites still drops out, as before.
  - **An unreadable `expiresAt`** serves the slot as empty, never indefinitely. A build that isn't a plain folder
    name does the same.
  - **A slot missing from the file** falls through to the site's wildcard and its live build. The server knows no
    naming rule, so this can't be caught here. The deploy tool writes every slot, empty ones included, every time
    (dms-template's `preview-slots.md`, "Every slot is always in the file").

## Files Requiring Changes

- `packages/dms-server/src/sites/index.js`
- `packages/dms-server/tests/test-sites.js`

## Testing Checklist

- [x] A slot host serves the slot's build, with `X-Site-Build` naming it; the site's own hosts still serve live.
- [x] An empty slot and an expired slot (including one that expires with no change to the file): neither serves the
      live build or the old one. A slot with no entry does fall through, by design; see the design notes.
- [x] A host in a slot and a site: served by neither, with a warning, and not by a shorter wildcard.
- [x] Editing `previews.json` takes effect within the reload interval, with no restart; an unreadable file keeps
      the previous slots.
- [x] `npm run test:sites` passes: 41/41.
- [x] The owner's local dms-server, with a hand-written `previews.json` in `~/code/dms-template-sites/devtny/`
      (2026-10-30): `www.devtny.org` kept its live build, `www.`/`npmrds.preview1.devtny.org` served the older
      build, the bare `preview1` gave a 301 to `www.`, the empty `preview2` gave its 404, and preview1 switched to
      "This preview expired on…" at its expiry with no change to the file. The owner checked this in a browser. The
      test file was then removed.
- [ ] Live on mercury, after a server deploy: dms-template's `preview-slots.md` step 5.
