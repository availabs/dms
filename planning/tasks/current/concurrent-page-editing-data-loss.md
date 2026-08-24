# Page-editing data loss and blanking under sync (concurrent races + single-user re-bootstrap bug)

## Objective

Determine whether DMS page editing (create page → add/update/delete sections →
delete page) is safe and reliable under real use — both single-user and
concurrent multi-user — across every environment configuration DMS actually
ships in. Live stress-testing found **four** confirmed, reproducible bugs
(below): three under concurrency (lost section-creates, lost characters in
collaborative rich-text edits, and an inferred delete race), and — found
independently, on a real dev site, needing no concurrency at all — a page
that goes permanently blank after the *first* add/delete of a session and
never recovers without a hard reload. This task tracks: (1) the full
evidence for all four bugs, (2) the historical question of whether they were
introduced by the recent sync work or predate it, and (3) an exhaustive test
matrix — every combination of **split mode** (`legacy` / `per-app`) ×
**multi-tenant** (`off` / `on`) × **local-first sync** (`off` / `on`) ×
**page lifecycle stage** (create page / add section / update section /
delete section / delete page), each under both single-client and
concurrent-client conditions — so "does page editing actually work" has a
real, checked answer instead of an assumption.

This directly follows [`sync-bring-up-to-date.md`](../completed/sync-bring-up-to-date.md)
and [`sync-replace-sqlite-with-indexeddb.md`](../completed/sync-replace-sqlite-with-indexeddb.md).
Those tasks verified sync's own mechanics (bootstrap/delta/push/WS, local
IndexedDB CRUD) worked correctly for a single client. This task is about what
happens when the thing being edited — a page's section list — is touched by
more than one client at once, which those tasks never exercised.

## Scope

**In scope**: page pattern CRUD (create/update/delete page; add/update/delete
section) under concurrency, across the 8 environment combinations below.
Root-causing the two confirmed bugs. Proposing (not yet implementing, pending
a decision) fix approaches.

**Out of scope**: dataset/UDA row editing concurrency, forms pattern,
mapeditor, dama task queue concurrency — these have their own write paths and
aren't covered by this investigation.

## Confirmed findings (live-tested)

Both bugs below were reproduced with a real browser (Playwright), a real
local dms-server, and verified by reading the actual database rows after
each run — not inferred from logs or single-client screenshots. Full setup:
fresh scratch site (`stress-test-app`), `splitMode: "per-app"`,
`VITE_DMS_MULTI_TENANT` unset (**multi-tenant OFF**), `VITE_DMS_SYNC=1`
(**sync ON**). This is environment combination **C6** in the matrix below —
see "What's actually been tested" for why the other 7 combinations are
still open.

### Bug 1 — Concurrent section creation silently loses sections — FIXED (see below for the fix and its own live-testing writeup, after the original repro)

**Reproduction**: 4 independent browser contexts (same user, simulating 4
tabs/devices), all with the same page open in edit mode. All 4 click
"Add Rich Text Section", type distinct text, click Save — fired via
`Promise.all` so the saves land within the same ~1.5s window.

**Result**: all 4 `pages|component` rows were created correctly and intact
in the database (confirmed by `dms raw get` on each row — full correct
Lexical content, no corruption). But the page's `draft_sections` array (the
list that says "these are this page's sections") ended up referencing only
**1 of the 4** new rows:

```
Before: draft_sections: [{id: 5}]
4 clients each add one section concurrently, all Save.
After:  draft_sections: [{id: 5}, {id: 10}]   ← only client B's id=10 survived
Orphaned, fully-saved, permanently unreferenced: id=7 (client A), id=8 (client C), id=9 (client D)
```

The page's own edit-history log (`pages|page-edit` row id=6) confirms only
one write actually landed: a single `"added section 2"` entry, not four.

Reran with 3 concurrent clients (E, F, G) on top of the existing page —
identical pattern: 3 new rows created, only 1 (`id=13`, client G) survived
into `draft_sections`; `id=11` (client F) and `id=12` (client E) orphaned.

**The loss is not just "on next reload."** Immediately after E and F's own
Save clicks — no reload, same tab — both clients' own live DOM already
showed neither of their own sections, only G's. The moment the winning
client's WebSocket broadcast for the page row arrived, it fully overwrote
the losing clients' local optimistic state, evicting their own unsaved-to-
canon work from their own screen in real time.

**Root cause**: `draft_sections` is a plain array field. Every mutation
(add/delete/reorder) is computed **client-side** as "read the current full
array, compute a new full array, send the new full array" — see
`sectionArray.jsx`'s add/delete handlers and `editFunctions.jsx`. The server
write path (`dms.controller.js`'s `setDataById`) does:

```sql
UPDATE {table}
SET data = {jsonMerge('data', '$1', dbType)}, updated_at = ..., updated_by = ...
WHERE id = $3
```

`jsonMerge` is a **shallow, top-level** merge (Postgres `data || $1` /
equivalent) — it only protects *other* top-level keys from being clobbered by
an edit that doesn't touch them. For a key both writers *are* editing
(`draft_sections`), it's plain last-write-wins: whichever `UPDATE` commits
last replaces the entire array, discarding the other writer's version
wholesale. There is no read-before-write concurrency check (no
`WHERE updated_at = $expected`), and no element-wise/array merge at any
layer, client or server.

**Correction (2026-08-24, prompted by a follow-up question)**: the write-up
above understates the client side by omitting a mechanism that *is* already
in play but doesn't help. `localUpdate()` in `sync-manager.js` does not send
`data` straight through — it routes every write through `yjs-store.js`'s
`applyLocal(id, data)` first, which is a **per-item field-level `Y.Map`**:

```js
// yjs-store.js
export function applyLocal(id, newData) {
  const ydoc = getDoc(id);
  const ymap = ydoc.getMap('data');
  ydoc.transact(() => {
    for (const [key, value] of Object.entries(newData)) {
      ymap.set(key, value);   // ← draft_sections goes in as ONE opaque value
    }
  });
  return materialize(ymap);
}
```

So the write *is* technically "Yjs-merged" client-side. The reason this
doesn't fix Bug 1: `Y.Map.set(key, value)` treats `value` as a single opaque
unit — Yjs's own conflict rule for two concurrent `set()` calls on the same
key is last-write-wins (by Yjs's internal clock/client-id tiebreak), exactly
mirroring the server's `jsonMerge` behavor for that key. Because
`draft_sections`'s *value* is a plain JS array (not itself decomposed into a
Yjs collection type), nothing about it merges element-wise. This `Y.Map`
layer genuinely does something useful — it's why editing `title` on one
client and `header` on another, concurrently, merges cleanly without either
being lost (see Design Decision #7 in
[`dms-local-first-sync.md`](../completed/dms-local-first-sync.md): *"Yjs for
content items only... structural items use simple LWW"*) — but it operates
at **field granularity**, not **list-element granularity**, and
`draft_sections` needs the latter. This client-side `Y.Map` and the
server-side `jsonMerge` are two independently-implemented mechanisms that
happen to produce the identical LWW-per-key outcome for this specific field
— worth knowing precisely because a fix that only touches one of them (e.g.
only the server SQL, or only client-side `applyLocal`) would leave the other
still capable of clobbering a concurrent write on its own. See "Fix design"
below for what actually closes this gap.

### Bug 2 — Concurrent rich-text editing of the same section drops characters

**Reproduction**: 2 clients, both enter true edit mode on the *same* existing
Rich Text section, both click into the editor and press End (same cursor
position), then type different text **simultaneously**:
- Client H types `" [added by H]"` (14 chars, 70ms/key)
- Client I types `" [added by I]"` (14 chars, 90ms/key)

**Result**: both clients converged to an identical final string (the Yjs
CRDT sync mechanism itself is consistent — good sign) —
`"Round2 section by G  [[aadddedde dby by I]"` — and this exact string is
what got persisted to the database on Save. But an exact character-multiset
diff against "everything either client typed, in any order" shows **real
data loss, not just reordering**:

```
expected "H":1 actual "H":0   ← the letter H is completely gone
expected " ":9 actual " ":8   ← one space silently dropped
expected "]":2 actual "]":1   ← one closing bracket silently dropped
```

This correlates with a real thrown error, logged twice by client H's
console during the concurrent typing:

```
Invalid access: Add Yjs type to a document before reading data.
```

This is a genuine Yjs/Lexical binding bug under truly-simultaneous
same-position inserts — not merely "garbled but complete" interleaving
(which would be an expected, if ugly, CRDT property). Characters are
actually lost.

### Bug 3 (inferred, not yet independently reproduced) — same race likely applies to delete

Section delete goes through the exact same `draft_sections` read-modify-write
path as create (same `sectionArray.jsx`/`editFunctions.jsx` client code, same
`setDataById` server route). A plain single-client delete was verified
working correctly in isolation (deleted id removed from `draft_sections`,
persisted). A concurrent delete-vs-add repro was attempted but not
successfully automated (Playwright selector flakiness locating the delete
confirm modal reliably across concurrent contexts — a test-harness problem,
not a product signal either way). Given the shared code path, Bug 1's race
almost certainly also applies to delete-vs-add and delete-vs-delete, but this
is an inference from shared code, not an independent live repro — listed as
a required item in the test matrix below, not a confirmed finding.

### Bug 4 — Adding/removing a section blanks the entire page, permanently, until a hard reload (SINGLE USER, no concurrency needed) — ROOT-CAUSED AND FIXED

**This is the most severe bug found in this task, and the easiest to hit** —
found live on the user's own real dev site (`shaun-test-app`, real data,
multi-tenant ON, `VITE_DMS_SYNC=1`), reported independently of the
concurrency testing above, then fully root-caused and confirmed by
instrumenting the live page directly (`globalThis.__dmsSyncAPI`). No second
client, no timing race — one person, one browser tab, one Add click.

**Reproduction**: navigate to a page already in edit mode
(`http://localhost:5173/edit/blank`, a real page with 5 existing sections
rendering correctly). Click Add, type text, click Save. **No reload.**

**Result**: the page's content area goes from ~300+ characters of rendered
section content to **96 characters — every section gone**, immediately:

```
Before: Discard Publish Admin Two Column * blank ... section 2 | section 1 | section 3 | adding section | editing section | connected
After:  Discard Publish Admin blank Two Column * shaunaksangdod@gmail.com shaun-test-app Admin connected
```

Waited **8.6 seconds** (far longer than the bootstrap that follows takes to
complete) — the page never recovered. Tried an SPA-internal
`pushState`/`popstate` re-navigation (no hard reload) — still blank. Only an
actual hard page reload brings the correct sections back, exactly as
reported.

**Root cause, confirmed by direct instrumentation** (`globalThis.__dmsSyncAPI.isLocal(app, type)`,
exposed for exactly this kind of live debugging per `sync.md`'s troubleshooting section):

| Moment | `isLocal('pages\|page')` | `isLocal('pages\|component')` | Page content |
|---|---|---|---|
| Before any edit (5 sections rendering fine) | **false** | **false** | correct (5 sections) |
| 200ms after clicking Save | **false** | **false** | — |
| ~2.5s later (after a full pattern re-bootstrap fires) | **true** | **true** | **blank** |
| 8.6s later | **true** | **true** | **still blank** |

The scope registry (`sync-scope.js`'s `syncedTypes`) is seeded only from
whatever a bootstrap response actually contains. Before any edit, the only
entries in scope are skeleton-level types — site, patterns, tenants:

```
shaun-test-app+test:site, shaun-test-app+test|auth:pattern, shaun-test-app+test|data:pattern,
shaun-test-app+test|sd1:tenant, shaun-test-app+test|sd3:tenant, shaun-test-app+test|test_shaun_group:tenant,
shaun-test-app+test|pages:pattern, shaun-test-app+test|pages_copy:pattern
```

`pages|page` and `pages|component` are **not in this list** even though the
page's 5 sections are rendering correctly on screen — meaning the *entire
initial view of this page is served over plain Falcor passthrough*, not
local-first sync at all, despite sync being fully connected. This
contradicts `sync.md`'s documented behavior ("`bootstrapPattern()` fires when
the user navigates to a pattern for the first time") — on this real site,
navigating to and viewing a page does **not** proactively bootstrap that
pattern's content types into scope. The only thing that does is the reactive
check in `api/index.js`:

```js
// api/index.js line ~194
if (!sync.isLocal(app, type) && sync.bootstrapPattern && type) {
  sync.bootstrapPattern(type); // fire and forget
}
```

Clicking Add is sync-eligible for the *create* regardless of `isLocal`
(`api/index.js` line 449's `isSyncEligible` check treats any new item — no
`id` yet — as eligible unconditionally), so the new section gets created via
`sync.localCreate` even though the page's own type was never in scope. That
write triggers `router.revalidate()` (via `sync-manager.js`'s
`onInvalidate` → `dmsSiteFactory.jsx`'s 150ms-debounced `router.revalidate()`),
which re-runs the loader, re-checks `isLocal('pages|page')` — **still
false** — and *this* is the first time in the whole session anything calls
`bootstrapPattern('pages|page')`. That's a real, full, cold
(`lastRev=null`) pattern bootstrap, refetching ~26 items, firing for the
first time in reaction to a user's own edit rather than proactively on
navigation.

The reactive bootstrap is what *exposes* the bug (it's the first thing that
switches this page's reads from Falcor over to the local-first `loadFromLocalDB`
path), but it is not itself the defect. The actual defect, found by direct
live instrumentation after the write-up below was originally more
speculative:

**ROOT CAUSE — CONFIRMED AND FIXED.** `loadFromLocalDB()` in `api/index.js`
resolves `draft_sections`/`sections`/`history` refs by looking their target
rows up in local IndexedDB by id. Two call sites forced those lookup ids
through `Number(...)` before querying:

```js
// api/index.js — BEFORE (both wrong)
const childRows = await sync.getItemsByIds(childIds.map(Number));   // array refs (draft_sections)
const child = await sync.getItem(Number(item[key].id));             // single refs (history)
```

The comment justifying this claimed *"IndexedDB keys are strictly typed —
data_items ids are always numeric."* That's false for the vast majority of
rows. Confirmed with a clean, isolated, single-purpose test against the
live site (`globalThis.__dmsSyncAPI.getItem(...)`, no page in between to
confuse the result):

```
getItem('54035')  → row found        (string key)
getItem(54035)    → NOT found        (number key)
```

Every row written by a server-sourced path — `bootstrapPattern`'s
`applyItems`/`upsertItemsFromServer`, `catchUp`'s `applyChanges`, the WS
`onmessage` handler's `upsertItemNow`, even `localCreate`'s own
server-assigned-id write — stores `id` as whatever type the server's JSON
response gave it, which is a **string** (matches literally every raw
`dms raw get`/CLI dump taken all session: `"id":"52658"`, `"id":"54035"`,
etc.). None of `idb-store.js`'s upsert functions coerce that type — IndexedDB
`keyPath: 'id'` uses the value as-is, so these rows end up **string-keyed**.
Only the rare offline-create fallback (`createItemOffline`'s
`autoIncrement`) produces a genuinely numeric key. So `getItemsByIds(ids.map(Number))`
queries with the wrong type against essentially every row that matters, the
lookup silently returns nothing (`Promise.all(ids.map(id => s.get(id)))` —
a miss on a `.get()` isn't an error, just `undefined`, filtered out), every
ref in `draft_sections` stays an unresolved `{id, ref}` stub with no
`element`/content, and the section components render nothing for each —
the entire content area, blank, no thrown error anywhere to signal why.

**A live-instrumented delete also ruled out the alternative "stale/corrupted
local cache" theory this write-up originally suspected**: the local
IndexedDB copy of the page's `draft_sections` was checked byte-for-byte
against the server's own copy after a real delete, and they matched exactly
— the data was never actually wrong or diverged, it just couldn't be
*looked up*. And a real SPA-internal route remount (navigate away to `/list`,
back to `/edit/blank`, no hard reload) with `isLocal` already `true` (fully
"warm", no bootstrap in progress) **still rendered blank** — ruling out
"the bootstrap transition itself loses a render" as the mechanism. Both
findings pointed at the same place: the lookup, not the write or the
timing.

**Fix applied** (`api/index.js` lines ~96 and ~123, plus the same defect
found and fixed in `sync-manager.js`'s `bootstrapSkeleton()` stale-cleanup
logic at line ~161, which compared a `Number`-coerced ref id against a
`Set` of string server ids and could therefore never match — making that
cleanup an inert no-op rather than the destructive-sounding "deletes
everything" its logic implied, but still wrong): removed every `Number(...)`
coercion, left ids as their natural (string) type. **Verified live,
post-fix**: fresh reload of the same real page, Add → renders correctly, no
reload; Delete → renders correctly, no reload. Repeated the exact sequence
that reproduced the bug moments earlier — no blank page either time.

**Severity note (historical, now fixed)**: unlike Bugs 1-3, this needed no
concurrency, no second client, and no unusual timing — it triggered on the
*first* structural edit (add or delete) that ever caused a page pattern's
reads to switch from Falcor to local-first sync in a given browser session.
That made it substantially higher-priority than the concurrency bugs above
while it was open. It wasn't hit in this task's earlier scratch-environment
testing (Bugs 1-3) for an incidental reason, not an environmental one: those
tests' `isLocal` never flipped to `true` mid-session in a way that triggered
resolving a multi-entry `draft_sections` through this exact code path before
the bug was found — the underlying defect (wrong ID type on lookup) was
present in every environment, sync=on, the whole time. **This is not
multi-tenant-specific or split-mode-specific — it's a plain client-side type
bug, unconditional on any of the matrix's three axes.** The matrix cells
below should be updated once each is (re-)run against the fixed code.

## Root cause analysis — was this introduced by the recent sync work?

**No — for Bug 1, this predates local-first sync by roughly 6 weeks and is
completely independent of whether sync is on or off. For Bug 2, the buggy
code is part of the local-first sync project, but it was NOT touched by
either of the two sync tasks completed this session (`sync-bring-up-to-date`,
`sync-replace-sqlite-with-indexeddb`) — it's unrelated pre-existing code
within that broader project.**

### Bug 1 timeline (git evidence)

| Commit | Date | What |
|---|---|---|
| `df407e55` | 2026-01-29 | `editFunctions.jsx` and `sectionArray.jsx` **first added** — the add/delete-section business logic (client-computes-full-array pattern) |
| `d62b4f36` | 2026-03-09 | **`local first sync first pass`** — the *first* local-first sync commit, ~6 weeks later |

`git log --diff-filter=A` confirms both files' add/delete-section logic has
existed, structurally unchanged in this respect, since before sync existed
in any form. The server-side write path is the same story: `setDataById`'s
shallow `jsonMerge`-based `UPDATE` (no optimistic concurrency check, no
per-array-element merge) is the *only* write path for page edits — the sync
intercept in `api/index.js` (`sync.localUpdate` → eventually `pushMutation`)
and the plain non-sync Falcor fallback (`falcor.call(["dms","data","edit"])`)
both terminate at this identical controller function. Confirmed by reading
`api/index.js` lines ~446–498: when `sync` is falsy or the item isn't
sync-eligible, the code falls straight through to the same `falcor.call`
used pre-sync. **Sync doesn't create this race or make the underlying
mechanism any different — it was already there.**

What sync *does* change is the failure's visibility: pre-sync, a losing
write is invisible until the next page load/Falcor refetch. With sync's
WebSocket broadcast, the losing client's own screen updates in real time,
so the author watches their own unsaved section vanish without ever
reloading. That's a real behavioral difference worth fixing regardless of
root cause, but it's an amplification of a pre-existing bug, not a new one.

**One documented design tension worth flagging**: the original local-first
sync design doc
([`dms-local-first-sync.md`](../completed/dms-local-first-sync.md), design
decision #7) states *"Yjs merge applies to **pages and sections**
(frequently edited content). Structural items (sites, patterns, sources,
views) use simple LWW."* — implying pages/sections were intended to get
real CRDT-level merge protection, not plain last-write-wins. Design decision
#4 clarifies the server stores plain JSON snapshots and *"clients do Yjs
YMap merging locally."* In the current implementation, Yjs is wired up for
section **content** (the Lexical rich-text doc inside a section — that's Bug
2's territory) but `draft_sections` **membership** (which sections exist,
in what order) goes through plain LWW exactly like a "structural item,"
despite the design doc listing "sections" as a Yjs-covered content type.
Whether that's a deliberate later descoping (list membership is inherently a
different kind of merge problem than scalar/text content and may never have
been a realistic Yjs target) or an implementation gap against the original
design is unresolved — worth deciding explicitly as part of any fix, rather
than silently accepting the current LWW behavior as "working as designed."

### Bug 2 timeline (git evidence)

| Commit | Date | Author | What |
|---|---|---|---|
| `df407e55` | 2026-01-29 | — | `collaboration.js` first added, but as **fully commented-out, non-functional stub code** (a dead `WebsocketProvider` sketch) |
| `d62b4f36` | 2026-03-09 | — | local-first sync first pass (didn't touch collaboration.js) |
| **`e5b73950`** | **2026-03-17** | Alex Muro | **`local first sync and data management`** — the real `DmsCollabProvider` class was written here for the first time, replacing the stub. This is the actual Yjs↔Lexical↔WebSocket bridge that Bug 2 lives in. |

`collaboration.js` has not been modified since `e5b73950` (2026-03-17) —
confirmed via `git log` on the file showing no commits after that one. This
session's two sync tasks (commits `96c2da40`, `88570351`, `bd364358` and
others from today) never touched `collaboration.js`, `sync-manager.js`'s
`registerCollabRoom`/collab-room functions, or anything in the Yjs binding
path. **Bug 2 is a pre-existing bug in the collaborative-editing feature as
it has existed since mid-March — not something this session's IndexedDB
migration or sync-bring-up-to-date work introduced or touched.**

### Bug 4 timeline (git evidence)

The actual defect — the `Number(...)` coercions in `api/index.js`'s ref
resolution (both the array-ref and single-ref call sites) — was introduced
in the *very first* local-first sync commit and was never touched again
before this fix:

```
$ git log --oneline -L 93,96:packages/dms/src/api/index.js
$ git log --oneline -L 121,123:packages/dms/src/api/index.js
d62b4f36 local first sync first pass   ← introduced here, 2026-03-09 (both sites)
685f3b51 test 123
ea645595 dms a npm package
141324e8 update api to load data based on filters in dms config
```

(The reactive `bootstrapPattern`-on-cache-miss block, which merely *exposes*
the defect by being the first thing to switch a page's reads over to the
buggy local lookup path, traces to the same commit — see the original
analysis above.) None of today's session commits appear in this blame
before the fix. **Bug 4 has existed, unmodified, since local-first sync's
very first implementation — not a regression from this session's work
either.** Unlike Bug 1 (predates sync entirely) but like Bug 2 (lives inside
sync, pre-dates this session), Bug 4 was a day-one defect: a wrong
assumption about IndexedDB key types, baked into both a comment and the code
itself, that went uncaught because most testing of local-first sync
apparently exercised it before `isLocal` ever flipped `true` mid-session for
a pattern with multi-entry ref arrays to resolve.

### Bottom line

None of the four bugs are a regression from this session's work. Bug 1 predates local-
first sync entirely (it's a latent bug in ordinary page-editing business
logic + the server's shallow-merge write path, both authored ~6 weeks before
sync existed) and reproduces identically whether sync is on or off — verified
by tracing that both the sync-intercept and non-sync Falcor paths call the
exact same server controller function, `setDataById`. Bug 2 and Bug 4 both
live inside the local-first sync project itself, but in code untouched by
this session before today's fix: Bug 2's `collaboration.js` last changed
2026-03-17, and Bug 4's `Number(...)`-coercion defect in `api/index.js`
hadn't changed since sync's very first commit, 2026-03-09 — neither was
something today's earlier IndexedDB migration or sync-bring-up-to-date work
introduced. **Bug 4 is now fixed** (see its write-up above) — the fix
removes the wrong type coercion at both ref-resolution call sites in
`api/index.js`, plus the same defect found in `sync-manager.js`'s skeleton
stale-cleanup logic, and was verified live against the real site that
reported it.

## What's actually been tested (honest accounting)

Two of the 8 environment combinations have been live-tested, neither against
every lifecycle stage, and they were tested for different things:

| Axis | Combination A = **C6** (Bugs 1-3) | Combination B = **C8** (Bug 4) |
|---|---|---|
| Split mode | `per-app` (scratch SQLite) | `per-app` (real Postgres, `dms-sqlite.config.json` → `mercury.availabs.org`/`dms3`) |
| Multi-tenant | `off` | **`on`** (`VITE_DMS_MULTI_TENANT=1`, root-domain path, no subdomain) |
| Local-first sync | `on` | `on` |
| Environment | fresh scratch site, created moments before testing | real dev site (`shaun-test-app`), existing page created 2026-06-29 |

Lifecycle stages exercised in Combination A: create page (via site
template wizard, not independently stress-tested), add section (single +
concurrent), update section content (single, slow-typed + concurrent
same-position), delete section (single only). Combination B: add section AND
delete section (single client, no concurrency) both triggered Bug 4 before
the fix; both were re-verified live, post-fix, on the same real page — no
blank page either time. **Because Bug 4's fix is a plain client-side type
bug unconditional on split mode/multi-tenant/sync-on-off (see its write-up),
Combination A's results don't need to be re-checked against it — Bugs 1-3
were never affected by Bug 4's defect in the first place** (they never
exercised multi-entry ref resolution through the buggy path in a way that
would have surfaced it). Still worth a real C6 delete/re-add pass at some
point for general regression coverage, just not urgently.

**Delete page was never tested at all, in any configuration.** Bug 1's mechanism (shared server code
path) strongly implies sync=off reproduces identically, and that inference
is documented above with source-level evidence (both code paths call the
same `setDataById`) — but it has not been independently *run*. Multi-tenant
and `splitMode: legacy` are completely untested for this task; nothing
here says whether tenant-subdomain resolution or the legacy single-table
schema changes any of this.

## Test matrix — 8 environment combinations × 5 lifecycle stages

Combination key: **SM** = split mode (`legacy` / `per-app`), **MT** =
multi-tenant (`off` / `on`), **Sync** = local-first sync (`off` / `on`).

| # | SM | MT | Sync | Create page | Add section (single) | Add section (concurrent 3-4x) | Update section content (single) | Update section content (concurrent, same section) | Delete section (single) | Delete section (concurrent vs. add) | Delete page (single) | Delete page (concurrent, e.g. vs. edit-in-progress) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **C1** | legacy | off | off | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| **C2** | legacy | off | on | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| **C3** | legacy | on | off | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| **C4** | legacy | on | on | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| **C5** | per-app | off | off | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| **C6** | per-app | off | **on** | ⚠️¹ | ✅ | ❌ **Bug 1** | ✅ | ❌ **Bug 2** | ✅ | ⏳ | ⏳ | ⏳ |
| **C7** | per-app | on | off | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| **C8** | per-app | on | **on** | ⏳ | ✅³ | ⏳ | ⏳ | ⏳ | ✅³ | ⏳ | ⏳ | ⏳ |

³ Was ❌ **Bug 4** (page blanks permanently, needs hard reload) before the
fix — both add and delete were re-verified live, post-fix, on this exact
combination/page and now pass cleanly with no reload needed. Concurrent
cells and create/delete-page remain untested here. Config confirmed via
`dms-sqlite.config.json`: `splitMode: "per-app"`, backend `postgres` (the
real prod-pointed config, `mercury.availabs.org`/`dms3`) — this is also the
**first Postgres-backed** evidence in this task; C1-C6 above were all tested
against SQLite scratch databases.

Legend: ✅ tested, passed · ❌ tested, failed (bug found — see write-up above)
· ⚠️ tested but not stress-tested (worked once, not adversarially) · ⏳ not
yet tested.

¹ Site/page creation via the wizard worked and went through
`sync.localCreate` correctly (confirmed in prior session), but was never
tested under concurrency (e.g., two admins both running first-time setup)
or as a repeated single-client regression check in this task.

### How to execute an untested cell

Each cell needs a fresh scratch environment. Reuse the pattern from this
session (documented informally in the conversation, formalize here for
whoever runs the remaining cells):

1. **Server config** (`packages/dms-server/src/db/configs/<name>.config.json`):
   ```json
   { "type": "sqlite", "role": ["dms", "auth"], "filename": "../data/<name>.sqlite", "splitMode": "legacy" }
   ```
   Set `"splitMode"` to `"legacy"` or `"per-app"` per the matrix row. Omitting
   the field entirely also tests `legacy` (it's the documented default) —
   prefer setting it explicitly so the test is unambiguous about what it
   covers.
2. **Start server**: `env PORT=<port> DMS_DB_ENV=<name> DMS_AUTH_DB_ENV=<name> JWT_SECRET=<anything> node src/index.js` from `packages/dms-server/` — bypass `npm run dev`'s `--env-file-if-exists` flags so the real repo-root `.env` is never loaded into a scratch run.
3. **Start frontend**: a scratch `.env.<mode>` file with `VITE_API_HOST=http://localhost:<port>`, `VITE_DMS_SYNC=1` or unset per the matrix row, `VITE_DMS_MULTI_TENANT=1` or unset per the matrix row; `npx vite --port <port> --mode <mode>`.
4. **Multi-tenant rows specifically**: creating the *master* site alone isn't enough — need at least one tenant row with a real `subdomain`, and requests need to actually resolve that subdomain (`<subdomain>.localhost:<port>` in the browser, or a `Host` header override) per `traversing-dms-pages.md`'s "Subdomain routing, not path routing" note. Test both the platform-admin (root domain) path and an actual tenant-subdomain path — `dmsSiteFactory.jsx`'s multi-tenant branch is a materially different code path (`tenantDmsConfig`/`tenantApp` substitution) from the single-tenant one, not just a flag.
5. **Create the site** via the real `/list/create` wizard (email/password/site name/template — "Simple Site" is fine, it gives one blank page with a `draft_sections: []` group to work from). Log in, navigate to `/pages/edit` (or whatever the pattern's `base_url` resolves to).
6. **Single-client checks**: do the operation once, verify via `dms page dump`/`dms raw get` (CLI, see root `CLAUDE.md`) that the database state matches what the UI shows.
7. **Concurrent checks**: N Playwright browser *contexts* (not just tabs — need separate storage/IndexedDB per "client") with the same login (`storageState` reuse is fine — same user across simulated devices is realistic and was used throughout this task), fire the mutating action via `Promise.all`, then verify server state via CLI (`dms page dump`) AND each surviving client's own DOM (both immediately post-save, and after a fresh reload) — Bug 1's "vanishes live, before reload" behavior only showed up because both checks were done.
8. **Record the result in the matrix above**, replacing ⏳ with ✅/❌/⚠️, and add a dated note in a "Findings by combination" subsection below if anything differs from Bug 1/2/3 as already characterized (a new failure mode, a combination where it *doesn't* reproduce, etc.).

### Findings by combination (append here as cells are filled in)

*(none yet beyond C6, documented above)*

## Proposed fix approaches

### For Bug 1 (structural array race) — option 3 chosen and implemented

See "Bug 1 implementation — DONE, live-verified" below the fix design for
the actual implementation and its live-testing results. Options 1/2 below
are kept for reference in case sync=off protection is ever wanted (option
3's `Y.Array` fix only covers sync=on — see its own scope note).

Options, roughly in order of how much they change:

1. **Atomic server-side array append/remove**, bypassing the shallow
   `jsonMerge` for `draft_sections` specifically — e.g. a dedicated
   `addSectionRef`/`removeSectionRef` server operation that does
   `data = jsonb_set(data, '{draft_sections}', data->'draft_sections' || $1::jsonb)`
   (Postgres) / equivalent SQLite JSON function, inside a transaction, rather
   than sending the whole precomputed array from the client. This fixes the
   race for adds losslessly (both concurrent appends survive, in whatever
   order they commit) but doesn't fully solve delete (removing a specific
   element still needs a targeted `jsonb_set` with array filtering, or a
   read-then-conditional-write retry loop) or reordering (which is
   inherently a whole-array operation).
2. **Optimistic concurrency check**: `UPDATE ... WHERE id = $x AND updated_at = $expected`, client resends on conflict (re-read, reapply its own delta, retry). Simpler to reason about than JSON-path surgery, but requires every structural mutation site to handle the retry, and doesn't eliminate the underlying "whose delta wins" UX question — just makes losses loud (an error/retry) instead of silent.
3. **Move `draft_sections` into the Yjs-managed surface**, matching the original design doc's stated intent (see Root Cause Analysis) — a `Y.Array` of section refs instead of a plain array field, giving the same automatic, lossless concurrent-insert semantics section *content* already has. Biggest lift (touches the client data model, the server's `yjs_states` persistence, and every place that reads `draft_sections`/`sections`), but the most correct fix and the one the original design doc arguably already promised. **Fleshed out in full below — "Fix design: `Y.Array`-backed page-structure collab."**

**Decided and implemented: option 3.** (1)/(2) remain available as a future
sync=off mitigation if that's ever prioritized — not started.

## Fix design: `Y.Array`-backed page-structure collab (Bug 1 option 3, fleshed out)

This is a concrete design for option 3 above, grounded in reading the actual
current code (`sectionArray.jsx`, `sync-manager.js`, `collaboration.js`, and
the server's `packages/dms-server/src/routes/sync/ws.js`) rather than a
sketch. **Not yet implemented** — this section is the plan, to be executed
(or revised) once someone picks it as the direction.

### The key realization: the server-side collab room infrastructure is already 100% generic

Section rich-text content collab (Bug 2's territory) works by giving each
**section row** its own server-persisted `Y.Doc`, keyed by that row's own
`item_id`, relayed over WebSocket "rooms." Reading
`packages/dms-server/src/routes/sync/ws.js` confirms this machinery has **no
idea what's inside the doc** — it's pure binary-blob relay:

```js
// ws.js — completely content-agnostic
async function getOrCreateYDoc(itemId) {
  if (yjsDocs.has(itemId)) return yjsDocs.get(itemId);
  const ydoc = new Y.Doc();
  yjsDocs.set(itemId, ydoc);
  // ...loads persisted state from yjs_states table if present...
  return ydoc;
}
```

The wire protocol (`join-room`, `yjs-sync-step1`/`yjs-sync-step2` for
bootstrap, `yjs-update` for live deltas, `room-peers` for the peer-count
indicator — all in `collaboration.js`'s `DmsCollabProvider` and mirrored
server-side in `ws.js`) only ever moves `Y.encodeStateAsUpdate`/
`Y.applyUpdate` binary payloads and a `yjs_states` row keyed by `item_id`
(`INTEGER PRIMARY KEY` — one row per collaborated item, SQLite schema in
`change_log.sqlite.sql`). None of this cares whether the doc holds a
`Y.XmlText` (what Lexical's `CollaborationPlugin` binds to today) or a
`Y.Array`. **This means the fix needs zero server changes** — the existing
room/broadcast/persistence path can carry a page's section-list CRDT exactly
as it already carries a section's rich-text CRDT, just keyed by the *page's*
`item_id` instead of a section's.

### What's new (client-side only)

**1. A new, lightweight provider — not `DmsCollabProvider`.** `DmsCollabProvider`
exists specifically to satisfy Lexical's `Provider` interface for
`CollaborationPlugin` (it manages `awareness` for cursor/presence, which a
section list doesn't need). Add a sibling, e.g.
`packages/dms/src/sync/page-structure-provider.js`, exporting something like:

```js
export function joinPageStructureRoom(pageItemId) {
  const doc = new Y.Doc();
  const sectionsArray = doc.getArray('draft_sections');
  // same join-room / yjs-sync-step1&2 / yjs-update wiring as
  // DmsCollabProvider.connect(), minus the awareness half — reuse the
  // exact message shapes so ws.js needs no changes.
  return { doc, sectionsArray, disconnect() { /* leave-room, doc.destroy() */ } };
}
```

No Lexical involvement at all — this is a direct Yjs binding, consumed
straight by `sectionArray.jsx`.

**2. Room lifecycle scoped to the page's edit view, not a section's pencil-click.**
Content collab (`DmsCollabProvider`) joins/leaves on a *specific section's*
`SectionEdit` mount/unmount — i.e. only while someone has clicked the pencil
into true edit mode on that one section (see `traversing-dms-pages.md` §2's
"two different edit states"). Section *add/delete* is different: per this
session's live testing, clicking "Add" and Delete-confirm both work from the
**reduced** `editPageMode` state, with no pencil click needed on any
individual section. So the page-structure room must join as soon as the
page's `/edit/...` view mounts (wherever `sectionArray.jsx` — or its parent,
the page-level edit container — currently mounts), and leave on unmount of
that whole view. Every client with the page open in edit mode is a
participant in this room, not just the one person actively typing.

**3. Seed the `Y.Array` from the plain field on first connect, mirroring the existing `Y.Map` seeding pattern.**
`yjs-store.js`'s `initFromData()` already has the right shape for this
("if the doc is empty, seed it from the current plain-JSON value") — reuse
the same idea for the array: if `sectionsArray.length === 0` on connect *and*
the page's already-loaded `draft_sections` is non-empty, push those refs in
as the seed. This only matters for the very first client to open the room
after a cold start or a `yjs_states` eviction — after that, the room's `Y.Doc`
already has the merged state and later joiners bootstrap from it via the
existing `yjs-sync-step1`/`step2` protocol.

**4. Rewire `sectionArray.jsx`'s three structural mutators to operate on the shared `Y.Array` instead of the `value` prop.**
This is the actual fix — reading the current code precisely:

```js
// sectionArray.jsx today — save(), add path (line ~210-238)
const save = () => {
  let cloneValue = cloneDeep(value || [])       // ← value is a REACT PROP,
                                                  //   a snapshot from whenever
                                                  //   this component last
                                                  //   re-rendered — can be
                                                  //   stale relative to what
                                                  //   another client just
                                                  //   committed
  cloneValue.splice(edit.index, 0, { ...edit.value, trackingId, group: group?.name, is_draft: true, parent: {...} })
  onChange(cloneValue, action)                    // ← sends the WHOLE
                                                  //   (possibly stale) array
}

// sectionArray.jsx today — remove() (line ~240-253), moveItem() (line ~259-271)
// same pattern: cloneDeep(value), splice, onChange(wholeArray)
```

All three (`save`, `remove`, `moveItem`) become "apply a real Yjs op to the
shared array, then materialize the array's *current, already-merged* state
for `onChange`":

```js
const save = () => {
  const ref = { ...edit.value, trackingId, group: group?.name, is_draft: true, parent: {...} }
  sectionsArray.insert(edit.index, [ref])         // ← a Yjs Y.Array insert:
                                                    //   merges losslessly with
                                                    //   any concurrent peer
                                                    //   insert/delete, by
                                                    //   construction — this
                                                    //   is what Bug 1's repro
                                                    //   showed NOT happening
                                                    //   with plain splice+send
  onChange(sectionsArray.toArray(), action)         // ← the array sent is the
                                                    //   CURRENT merged state,
                                                    //   not a stale snapshot —
                                                    //   includes every peer's
                                                    //   still-live insert
}

const remove = (i) => {
  sectionsArray.delete(edit.type === 'update' ? edit.index : i, 1)
  onChange(sectionsArray.toArray(), action)
}
```

Because `onChange` still ultimately calls the existing `apiUpdate` →
`sync.localUpdate` → server `setDataById` path unchanged, **this fix needs
no change to the server's SQL merge logic at all**. The trick is entirely
that the array handed to that unchanged write path is now guaranteed
already-correct (every concurrently-online peer's ops folded in via the
`Y.Array` CRDT) instead of being each client's own possibly-stale local
snapshot. A losing write in the old sense can't happen because there's
nothing left to "lose" — everyone's ops are already merged before anyone's
`apiUpdate` call goes out.

**5. `moveItem` (reorder) is the one operation without a clean CRDT primitive.**
`Y.Array` has no native "move" — the standard technique is
delete-then-insert, which is what `moveItem` already conceptually does
(`splice` out, `splice` back in at a new index). Applied as two independent
`Y.Array` ops (`sectionsArray.delete(from, 1)` then
`sectionsArray.insert(to, [item])`) this is safe for a *single* mover, but
**two clients concurrently moving the same or overlapping items can still
produce a surprising result** (a well-known hard case in CRDT literature —
not unique to this codebase). This is a real, known limitation of the
design, not something this plan claims to solve. If concurrent reordering
specifically matters, it needs its own follow-up design (e.g. a
fractional-index/LSEQ-style position field per section instead of raw array
position, which sidesteps the "move" problem entirely by making reorder a
single per-item field write — compatible with the existing `Y.Map`
field-level merge that already works correctly for scalar fields). Flagged
here, not solved here.

### Scope limitation: this only protects sync=ON configurations

The entire mechanism above depends on a live WebSocket connection —
`ws.js`'s rooms, and `collaboration.js`/the new provider's `join-room`
message, only exist when `VITE_DMS_SYNC=1`. **When sync is off, there is no
room to join and no CRDT merge happens at all** — the plain Falcor write path
(`falcor.call(["dms","data","edit"])` → `setDataById`) is completely
unaffected by anything in this design, and Bug 1 reproduces exactly as
today. This means:

- Test matrix rows **C2, C4, C6, C8** (sync=on) — this design is the fix.
- Test matrix rows **C1, C3, C5, C7** (sync=off) — still need fix option
  (1) or (2) above (an atomic server-side array op, or optimistic
  concurrency + retry) if protection is required there too, since a `Y.Array`
  with no live transport to merge over is just an inert local object. **This
  is a real decision point**: is concurrent structural editing under sync=off
  considered in-scope at all (arguably a lower-availability mode where
  single-writer-at-a-time is an acceptable assumption), or does it need its
  own independent mitigation? Not resolved here — record the decision in this
  file once made, and update the "Proposed fix approaches" section above
  accordingly.

### Materialization / persistence semantics — mirrors the existing content model exactly

Content sections already have a two-layer persistence model (see
`sync.md`'s "Collaborative Editing" section): the live `Y.Doc` auto-flushes
to the server's `yjs_states` table on every change (crash/reconnect safety,
via `ws.js`'s `scheduleFlush`/`flushYjsState`, debounced by `FLUSH_DELAY`)
completely independently of when a user clicks the section's own "Save"
pill, which is the *only* moment the Yjs content gets materialized into the
durable `data_items.data.element['element-data']` column. The page-structure
`Y.Array` should follow the identical two-layer split:

- **Layer 1 (free, unchanged)**: `ws.js`'s existing generic auto-flush
  persists the page's structure `Y.Doc` to `yjs_states` continuously — no
  new server code, this already happens for any `Y.Doc` a room is
  maintaining.
- **Layer 2 (the actual `draft_sections` column)**: materializes on the same
  triggers that already call `apiUpdate` with the array today — a section's
  Save-pill click, or a Delete-confirm click — just reading from
  `sectionsArray.toArray()` instead of `cloneDeep(value)` at that moment (per
  point 4 above). No new save affordance needed; the existing UX is
  unchanged, only what data backs it changes.

One inherited (not new) rough edge: **Discard** (`editFunctions.jsx`'s
`discardChanges()`) already resets the page's `draft_sections` to a clone of
the published `sections`, unconditionally, regardless of what any other
client might be mid-edit on. That behavior is unchanged by this design — if
client X clicks Discard while client Y has an uncommitted section pending in
the shared `Y.Array`, Y's pending insert gets wiped exactly like it would
today. Worth a decision at some point (should Discard reset the shared room
state too, or leave in-flight peer edits alone?) but out of scope for this
specific bug fix — it's pre-existing Discard semantics, not something this
design makes worse.

### Bug 3 (delete-vs-add) falls out of this design for free

`Y.Array`'s CRDT semantics (Yjs uses an RGA-family algorithm) guarantee
concurrent insert and delete operations — even overlapping ones — merge
deterministically and losslessly: a delete of an already-concurrently-deleted
element is a no-op, and a delete doesn't silently swallow a concurrent insert
near the same position. This isn't something extra to build — it's a
property of using `Y.Array` at all, so once point 4 above is implemented,
Bug 3 no longer needs an independent repro or fix; the mechanism that fixes
Bug 1 fixes Bug 3 by construction (for sync=on configurations — same
scope limitation as above applies).

## Bug 1 implementation — DONE, live-verified (2026-08-24)

Implemented and tested against the real `shaun-test-app` site (the same
Postgres-backed, multi-tenant deployment Bug 4 was found and fixed on).
Confirms the "Files this design would touch" list above was close but not
exact, and surfaced two additional bugs the design didn't anticipate — both
fixed as part of this same pass. Final diff: 1 new file
(`page-structure-provider.js`, ~210 lines including comments) + 1 file
meaningfully touched (`sectionArray.jsx`, ~180 lines changed/added across
`save()`/`remove()`/`moveItem()` plus the room-join effect). No server
changes, no `sync-manager.js` changes — `item.id` was already available via
`PageContext`, so the file didn't need touching after all.

### Bug found during implementation #1 — sharing unresolved content caused duplicate row creation

The first working version put the "new section" placeholder — the same
id-less object the old code always built (title/element/group/etc., no `id`
yet) — directly into the shared `Y.Array`. This is wrong: once relayed to
peers, **every peer's own `onChange` call (which sends the full merged array
through the existing `apiUpdate`/`dmsAttrsData` "no id → create a row" path)
independently tried to create a row for that same still-unresolved
placeholder.** Live-tested with 4 concurrent adds: instead of losing 3 of 4
sections (the original bug), it now *duplicated* every section — up to 2
rows per client's single add (8 rows for 4 adds in one run, 11 in another,
each pair carrying identical content/`trackingId`), because each peer's
`arr.toArray()` read (after `settle()`, see below) included every other
peer's not-yet-resolved placeholder and dutifully asked the server to create
a row for it too.

**Fix**: the shared array must only ever hold *resolved* `{id, ref}` stubs —
the same shape every other `draft_sections` entry already has, never raw
content. `save()`'s add-branch now calls `globalThis.__dmsSyncAPI.localCreate(app, componentType, data)`
directly to mint the real row and get a real id **before** touching the
array, then inserts only `{id, ref}`. The update-branch similarly calls
`localUpdate(targetId, strippedData)` directly rather than putting a
`_dirty: true` full-content object in the array. The room's *seed* step
(seeding a still-empty array from the page's already-known `draft_sections`)
had the identical latent bug — `value` as received by `sectionArray.jsx` is
the *enriched* form (ref + the child's own content merged in for display, by
`api/index.js`'s `loadFromLocalDB`) — fixed by stripping each seed entry
down to `{id, ref}` before pushing.

### Bug found during implementation #2 — even resolved-content ops needed a settle delay

With the duplication bug fixed but *before* adding any delay, a 4-concurrent-add
test still lost data — only 1 of 4 survived, same symptom as the original
bug. Cause: `save()` was reading `arr.toArray()` and sending immediately
after applying its own local insert, with no time for the WS relay to
deliver the other 3 clients' near-simultaneous inserts first — each client's
snapshot only reflected its own op, and last-write-wins at the server
reproduced the exact original race one layer up. **Fix**: added
`waitForQuiet()`/`room.settle()` — resolves once no remote update has
arrived for 300ms (capped at 1500ms total), so near-simultaneous peer ops
get a real chance to relay in before the array is read and sent. No-ops
(near-instant) when nobody else is concurrently editing. `save()`,
`remove()`, and `moveItem()` all `await room.settle()` after their own op
and before reading the array back.

### Bug found during implementation #3 — wrong type-utils function for the sibling component type

`localCreate` needs the section's *type* string (`"{patternInstance}|component"`,
sibling to the page's own `"{patternInstance}|page"`). First attempt used
`getInstance(item.type)` — wrong: a page has no *instance* name (`getInstance`
returns `null` for `"pages|page"`; instance is for named things like
patterns, e.g. `instance="my_docs"` in `"prod|my_docs:pattern"`). The
correct call is `getParent(item.type)`, since `"pages"` in `"pages|page"` is
the *parent* segment per `type-utils.js`'s `{parent}|{kind}` scheme. Caught
by checking the created rows' own `type` column, which read `"null|component"`
literally — the page's ref inside `draft_sections` looked fine only because
the *downstream* `dmsAttrsData` loop reconstructs that ref string from its
own (correct) format config, ignoring whatever ref string this code
supplied — masking the bug there while leaving the actual created row
mistyped.

### Live verification

All three bugs above were caught and fixed through this same live-testing
loop, each confirmed via a real 4-concurrent-client Playwright test against
the real site, reading actual server state after each run (never trusted
"no thrown error" alone):

- **4 concurrent adds, final corrected code, on a dedicated fresh test page**
  (to guarantee a clean Yjs room — see the operational note below for why
  that matters): all 4 sections survived, `draft_sections` has exactly 4
  entries, each row's `type` is correctly `pages|component`, each has its
  own distinct content, zero duplicates. Repeated on a second fresh page
  after the `getParent` fix specifically, with the same clean result.
- **Single-client delete, same page, no concurrency**: removed the correct
  section, three others untouched, no reload needed, server state matches.
- Not yet independently tested: concurrent delete-vs-add, concurrent
  reorder, and the documented reorder-under-concurrency limitation. These
  remain open items (see Testing checklist).

**Operational lesson, worth recording**: the Yjs room's server-side state
(`yjs_states` table, keyed by item id) is **entirely separate from
`data_items.draft_sections`** and does not get touched by CLI-level data
cleanup (`dms section delete`, `dms page update`). Testing against the same
real page across multiple runs let stale room state accumulate independently
of the (separately-cleaned) `draft_sections` field — confirmed concretely
when a later test on the same page rendered a mix of very old and very new
content that didn't match the (already-clean) server data at all. Clearing
a polluted room mid-session by deleting its `yjs_states` row is also not
fully safe on its own: any other client that happens to join the
now-empty room at close to the same moment will *also* try to seed it from
whatever `draft_sections` snapshot *that* client's own tab currently has
cached, and two different-vintage snapshots seeding concurrently produces
exactly the kind of duplicate-mixed-content mess this fix exists to
prevent — the known "two clients joining a cold room simultaneously" edge
case in `page-structure-provider.js`'s own doc comment, just triggered
deliberately by a mid-session reset rather than a true cold start. Safe
recovery sequence used here: fix `data_items.draft_sections` back to correct
first (via CLI, bypassing the room entirely), *then* clear the room's
`yjs_states` row, and avoid further automated joins against that same page
immediately afterward. For real testing going forward, prefer a dedicated
disposable page over reusing one across many runs.

### Files actually touched

- **New**: `packages/dms/src/sync/page-structure-provider.js` — the `Y.Array` room-joining provider, ref-counted per page id, exposes `{ sectionsArray, doc, ready, settle(), disconnect() }`
- `packages/dms/src/patterns/page/components/sections/sectionArray.jsx` — imports `joinPageStructureRoom` and `getParent`; new `roomRef`/join-effect; `save()`, `remove()`, `moveItem()` each gained a `room`-active branch (CRDT path) alongside the original unchanged plain-array branch (sync-inactive fallback)
- **Not touched, contrary to the original design's guess**: `sync/sync-manager.js` (item id was already available via `PageContext`) and the server (`ws.js`/`yjs_states` schema reused exactly as-is, zero changes)

### For Bug 2 (Yjs character loss)

Root-cause the `Invalid access: Add Yjs type to a document before reading
data` error first — it's a real thrown exception, not a red herring, and
very likely explains the dropped characters directly (an operation applied
against a not-yet-integrated Yjs type would plausibly be silently lost or
malformed). Candidate cause: a race between `DmsCollabProvider`'s doc
setup/sync-step and Lexical's `CollaborationPlugin` first read — check
`collaboration.js`'s `connect()`/sync-protocol handling for a case where a
local edit's Yjs transaction can fire before `Y.transact`'s target type has
been added to the doc (classic Yjs footgun: reading/writing a shared type
before `ydoc.get(name, Y.XmlText)` — or equivalent — has run at least once
on that client). Needs a focused single-purpose repro (isolate the collab
provider from the rest of this task's multi-client harness) before
attempting a fix, since the current repro conflates "two people typing at
the identical cursor position" (which will always look messy) with the
actual bug (real character loss, confirmed via multiset diff, distinct from
messy-but-lossless interleaving).

## Files likely requiring changes (once a fix direction is picked)

General list across all Bug 1 options (1)/(2)/(3) — see "Fix design:
`Y.Array`-backed page-structure collab" above for option (3)'s precise,
narrower file list if that's the direction chosen:

- `packages/dms/src/patterns/page/components/sections/sectionArray.jsx` — add/delete/reorder handlers, currently compute-full-array-client-side
- `packages/dms/src/patterns/page/pages/edit/editFunctions.jsx` — `publish()`/`discardChanges()`/related structural mutators
- `packages/dms-server/src/routes/dms/dms.controller.js` — `setDataById` (shallow `jsonMerge`), candidate site for an atomic array-op variant (options 1/2 only — option 3 needs no server change)
- `packages/dms/src/sync/sync-manager.js` — `localUpdate`/`pushMutation`, if the fix needs sync-aware retry/merge logic (options 1/2) — also `yjs-store.js`'s `applyLocal` is worth revisiting once a decision is made, since it currently performs the same ineffective key-level LWW as the server for this field (see the root-cause correction above)
- `packages/dms/src/ui/components/lexical/editor/collaboration.js` — `DmsCollabProvider`, Bug 2's root cause lives here
- `packages/dms-server/src/routes/sync/` — if Bug 1's fix needs a new atomic-op sync endpoint alongside the existing bootstrap/delta/push (options 1/2 only)

## Bug 5 — sync push requests never sent an auth header, so delete always 401'd for every logged-in user — FIXED (2026-08-24)

Found live: deleting a page produced `[sync] push D FAILED id=X: push failed: 401
{"error":"Authentication required to delete items"}` despite the user being
genuinely logged in in the browser. Traced to `sync-manager.js`'s `pushMutation`
and `localCreate` — their `fetch()` calls to `/sync/push` sent
`headers: { 'Content-Type': 'application/json' }` only, no `Authorization`
header at all, ever. Server-side (`routes/sync/sync.js`), general
create/update requests are only auth-gated when `DMS_SYNC_AUTH=1` (off by
default, so the missing header was invisible there), but delete has its own
unconditional check —
`if (action === 'D' && !req.availAuthContext?.user) return res.status(401)`
— regardless of `DMS_SYNC_AUTH`. Since no sync request ever carried a token,
`req.availAuthContext.user` was always `null`, and every delete through the
sync path 401'd for every user, logged in or not.

**Fix**: added an `authHeaders()` helper to `sync-manager.js`, reading
`localStorage.getItem('userToken')` and sending it as a bare `Authorization`
header — matching the exact convention already used elsewhere in this
client (`patterns/page/pages/edit/index.jsx`'s `Authorization: user?.token`;
the server's `jwtAuth` middleware explicitly accepts both a bare token and
`"Bearer <token>"`). Applied to **all 8** `fetch()` calls in the file
(bootstrap ×3, delta ×3, push ×2) — not just delete's — since bootstrap/delta
have the identical `requireAuth`-gated check that's silent today only
because `DMS_SYNC_AUTH` is off; leaving those unfixed would have been a
latent identical bug waiting for someone to turn that flag on.

**Verified live**: `globalThis.__dmsSyncAPI.localDelete(id)` against a real
test page — console showed `[sync] push D id=X → server id=X rev=N`
(success), no 401, on code that would have failed before the fix.

### Bug 6 — found while verifying Bug 5: a malformed ref (`{id: null, ...}`) crashed the whole page load — FIXED (2026-08-24)

Surfaced as a repeated `DataError: Failed to execute 'get' on
'IDBObjectStore': The parameter is not a valid key` from `idb-store.js`'s
`getItemsByIds`, thrown during ordinary page load (not an edit action) —
severe enough to be Bug-4-shaped (silently breaks page rendering) if left
alone, just via a different trigger. Root cause: `api/index.js`'s
array-ref resolution —

```js
const childIds = Array.from(item[key]).map(ref => ref.id || ref).filter(Boolean);
```

— extracts `ref.id`, falling back to `ref` itself for legacy data (bare id
primitives instead of `{id, ref}` objects). But if `ref` is an *object*
whose `id` is explicitly `null`/missing (a malformed or incomplete ref,
distinct from legacy-format data), `ref.id || ref` evaluates to the **whole
ref object**, which isn't filtered out by `.filter(Boolean)` (a non-null
object is truthy) — so a full object, not a primitive id, ends up in
`childIds` and gets handed to `s.get()`, which IndexedDB rejects outright
rather than just failing to find a row.

**Fix**: only fall back to treating `ref` as a bare legacy id when it's
actually a primitive (`typeof ref !== 'object'`); an object with no usable
`id` has nothing to resolve and is correctly filtered out instead of passed
through malformed. **Verified live**: recreated the exact navigation that
crashed, zero errors after the fix, page renders cleanly.

Not fully root-caused *which* specific ref/page had the `{id: null}` shape
in the first place (the fix is correct and defensive regardless, but the
data-quality question — how did a null-id ref get into the dataset — is
still open; worth a quick audit if it recurs).

## Testing checklist

- [x] **Bug 5 — sync push missing auth header, delete always 401'd — fixed.** All 8 `fetch()` calls in `sync-manager.js` now send `authHeaders()`. Verified live via `localDelete`.
- [x] **Bug 6 — malformed `{id: null}` ref crashed page load — fixed.** `api/index.js`'s `childIds` extraction no longer falls through to the whole ref object when an object ref has no usable id. Verified live, zero errors on the exact navigation that crashed before.
- [ ] Bug 6 follow-up: root-cause *which* page/field actually had a null-id ref and how it got there (data-quality question, not a code-correctness one — the fix is safe regardless)
- [ ] Fill in all 8 rows × 9 columns of the test matrix above (56 remaining cells; C6's row is partially done)
- [x] **Bug 1 — implemented and live-verified.** `Y.Array`-backed page-structure collab (option 3), see "Bug 1 implementation — DONE, live-verified" above for the full writeup, including 3 bugs found and fixed during implementation (duplicate row creation from sharing unresolved content; missing settle/debounce letting the same race resurface one layer up; wrong `type-utils` function for the sibling component type). Verified live: 4 concurrent adds on a real Postgres-backed multi-tenant site, all 4 survive with correct types and no duplicates (2 separate clean runs); single-client delete confirmed working, no reload needed.
- [ ] Bug 1 follow-up: concurrent delete-vs-add and concurrent reorder not yet independently tested against the new code (the design predicts both are protected the same way as add — reorder with the documented CRDT-move caveat — but neither has been run)
- [ ] Bug 1 follow-up: decide whether sync=off configurations (C1/C3/C5/C7) need a separate mitigation (fix option 1 or 2) — the `Y.Array` fix only protects sync=on, unchanged from the original design's documented scope limitation
- [ ] Root-cause the exact trigger for `Invalid access: Add Yjs type to a document before reading data`
- [ ] Decide and document a fix approach for Bug 2
- [x] **Bug 4 — root-caused and fixed.** `api/index.js`'s `Number(...)` coercion on ref-lookup ids was the defect (IndexedDB rows from every server-sourced write path are string-keyed, not numeric) — confirmed via direct `getItem('54035')` vs `getItem(54035)` A/B test, fixed at both call sites plus the matching defect in `sync-manager.js`'s skeleton stale-cleanup, verified live (add + delete, no reload, on the real page that originally reported it).
- [ ] Bug 4 follow-up: `sync-manager.js`'s skeleton stale-cleanup logic was previously an inert no-op (its own `Number`/`Set-of-strings` mismatch meant it never actually deleted anything, regardless of whether items were genuinely stale). The fix makes it functional for the first time — do a regression pass specifically on skeleton bootstrap (site/pattern/tenant rows) to confirm it now correctly prunes genuinely-stale local rows without over-deleting anything still valid.
- [ ] Bug 4 follow-up: separately from the type bug, `sync.md`'s documented claim ("`bootstrapPattern()` fires when the user navigates to a pattern for the first time") still doesn't match observed behavior on the real site — bootstrap only fired reactively, triggered by the user's own edit, never proactively on navigation. Decide whether that's a real gap worth fixing (proactive bootstrap on navigation would mean fewer users ever hit the "first sync-eligible edit is slow/triggers a cold fetch" experience) or whether the docs should be corrected to describe the reactive-only behavior as intended.
- [ ] Re-run the C1-C7 matrix cells with the fixed code for general regression coverage — none are expected to change (Bug 4's defect was independent of split mode/multi-tenant/sync-on-off), but this hasn't been explicitly re-verified outside of C6 and C8
- [x] Grepped all of `packages/dms/src` for other `.map(Number)`/`Number(id)` coercions on an id that might hit an IndexedDB lookup — one more instance found, `api/index.js:643`'s `udaCreateView`, but it operates on a plain Falcor JSON-graph response's object keys (always strings by JS object-key convention) to compute a `Math.max()`, unrelated to `idb-store.js`/IndexedDB entirely — not the same bug family, left as-is. The type-coercion defect is fully contained to the 3 fixed call sites.
- [ ] After Bugs 1/2/3 get a fix direction and land, re-run the specific matrix cells each targets, plus a regression pass on the cells that already passed (✅) to confirm no new breakage
- [ ] Once this task is closed out, evaluate whether any part of the concurrent-testing harness (multi-context Playwright helpers, the native-DOM-click workarounds for hover-gated buttons) is worth extracting into `src/dms/skills/` per `planning-rules.md`'s "When to extract a skill" — the hover-gated Settings-button click workaround in particular came up repeatedly this session and is already partially documented in `traversing-dms-pages.md`
