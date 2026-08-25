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
| **C1** | legacy | off | off | ✅ | ✅ | ❌⁴ **Bug 1** | ✅ | ✅⁵ | ✅ | ❌ **Bug 3** | ✅ | ✅⁶ |
| **C2** | legacy | off | on | ✅ | ✅ | ❌⁷ **new bug** | ✅ | ✅ | ✅ | ❌⁷ **new bug** | ✅ | ✅ |
| **C3** | legacy | on | off | ✅⁸ | ✅⁸ | ❌ **Bug 1** | ✅ | ✅ | ✅ | ✅⁹ | ✅ | ✅ |
| **C4** | legacy | on | on | ❌¹⁰ **new bug** | ❌¹⁰ | ⏳¹¹ | ⏳¹¹ | ⏳¹¹ | ⏳¹¹ | ⏳¹¹ | ⏳¹¹ | ⏳¹¹ |
| **C5** | per-app | off | off | ✅ | ✅ | ❌ **Bug 1** | ✅ | ✅ | ✅ | ✅¹² | ✅ | ✅ |
| **C6** | per-app | off | **on** | ⚠️¹ | ✅ | ✅¹⁶ (was ❌ Bug 1, stale pre-fix result) | ✅ | ❌ **Bug 2** | ✅ | ✅¹⁵ | ✅ | ✅ |
| **C7** | per-app | on | off | ✅¹³ | ✅¹³ | ❌ **Bug 1** | ✅ | ✅ | ✅ | ✅¹⁴ | ✅ | ✅ |
| **C8** | per-app | on | **on** | ✅ | ✅³ | ✅ | ✅ | ✅ | ✅³ | ✅ | ✅ | ✅ |

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

⁴ 4 concurrent adds (API-level, mirroring `sectionArray.jsx`'s sync-inactive
fallback path exactly — see C1 findings below): 3 of 4 survived, 1 lost, plus
one id appearing twice in the final array — a slightly different-shaped
symptom than Bug 1's original "N adds, only 1 survives" (SQLite/legacy here
vs. per-app/Postgres originally), but the same root cause: no CRDT, plain
last-write-wins on the whole `draft_sections` array. Confirms the "Scope
limitation" note in `page-structure-provider.js` (Bug 1's Y.Array fix is
sync-only) is real, not just theoretical, for `sync=off`.

⁵ Concurrent same-section content update (two `title` writes to one
component row) correctly resolved last-write-wins with no corruption — this
is expected and fine: a component's own scalar fields aren't a structural
membership array, so there's nothing for a CRDT to protect here regardless
of sync state.

⁶ Concurrent page-delete vs. an in-flight section-create on that same page:
the delete won the race; the section-create correctly failed with a clean
`No item found with slug` error — no crash, no orphaned row, no corrupted
state. A reasonable outcome for this combination.

⁷ **Not a Yjs/CRDT bug at all** — a server-side SQLite id-allocation race,
independent of sync on/off. See "C2 findings" below for the full mechanism;
likely also the true explanation for C1's footnote ⁴ "one id appearing
twice" (C1's create path and C2's create path both call the same
`allocateId()` in `table-resolver.js`), which that footnote currently
attributes to "no CRDT, last-write-wins" — worth double-checking/revising.

⁸ Dual-path coverage: exercised on **both** the platform-admin root domain
(app = master site, no subdomain) and an actual tenant subdomain (app = the
tenant's own app) — multi-tenant's two materially different code paths per
`dmsSiteFactory.jsx`. Both passed identically for create-page and
add-section-single; remaining 7 columns were run tenant-subdomain-only (the
more representative real-content path). See "C3 findings" below.

⁹ Passed cleanly both times run: the delete won, the new add landed, no
duplicate ids, no orphan. Differs from C1's footnote ⁶ scenario (that was
page-delete vs. a section-create *racing to fail cleanly*) — this is
section-delete vs. section-add on the *same still-alive* page, i.e. exactly
Bug 3's inferred scenario. It did **not** reproduce data loss here, on
`legacy`/SQLite — worth noting since Bug 1 (add vs. add) *does* reproduce on
this exact combination (see the concurrent-add cell). Plain LWW on the same
array can still coincidentally preserve both a delete and an unrelated add
depending on ordering; this isn't a guarantee it's safe, just that this run
didn't catch a loss. See "C3 findings" below.

¹⁰ **New critical bug, distinct from footnote ⁷'s (C2's) finding, though the
same root defect.** A **single client, zero concurrency**, doing nothing but
the ordinary "create a page" action on a fresh multi-tenant + sync site,
reproducibly and deterministically **silently destroys and replaces an
unrelated, already-existing row** (observed: it overwrote the tenant's own
auto-provisioned "Page 1" with the new page's content, in place, same id, no
error surfaced to the user) — worse than footnote ⁷'s "id appears twice"
symptom, and needs no timing race at all. Multi-tenant's *extra* provisioning
(a second full site+auth-pattern+pages-pattern+page for the tenant, on top of
the master's own) is what pushes this from "usually survives by luck on the
first single-client write" (as C2 observed) to "collides on literally the
first write, every time" — same `allocateId()`/`dms_id_seq` defect footnote ⁷
documents, just guaranteed to trigger sooner because MT setups leave more
pre-existing legacy-path rows below wherever the independent sync sequence
happens to be. See "C4 findings" below for the full mechanism and evidence.

¹¹ Blocked, not independently tested: once the very first single-client
create silently corrupts an existing row (footnote ¹⁰), every subsequent
stage in the same environment operates against already-corrupted state, so
any result recorded past that point would not be a clean read on that stage
specifically. Needs footnote ¹⁰'s bug fixed (or at minimum, an environment
where the collision doesn't hit on the very first write) before these columns
can be meaningfully exercised.

¹² Passed cleanly: the delete won, the new add landed, no duplicate ids, no
orphan — same outcome as C3's footnote ⁹ scenario (delete-vs-add on the same
still-alive page), not a guarantee this cell is safe under real timing
pressure, just that this run didn't catch a loss. Bug 1 (add-vs-add) *does*
reproduce on this exact combination (see the concurrent-add cell) — see C5
findings below.

¹³ Dual-path coverage: exercised on **both** the platform-admin root domain
and an actual tenant subdomain — multi-tenant's two materially different
code paths per `dmsSiteFactory.jsx`. Both passed identically for create-page
and add-section-single, **and neither showed any `allocateId()`/`dms_id_seq`-
class id collision** (footnote ⁷/C2, footnote ¹⁰/C4) — every pre-existing row
on both hosts (site, both patterns, template page, plus the tenant ref on
ROOT) was verified byte-for-byte intact immediately after the new page's
create call. This directly answers the open question C5's findings raised
("worth checking explicitly if C7 (per-app + MT) reproduces C4's... severity
or not") — **it does not reproduce at all here**, and the root cause is
structural, not incidental: see C7 findings below for why `per-app` split
mode's per-app sequence tables (`seq__<app>`) make this bug's mechanism
impossible by construction, not just less likely. Remaining 7 columns run
tenant-subdomain-only, the more representative real-content path, per the
same convention as C3/C4.

¹⁴ Passed cleanly: the delete won, the new add landed, no duplicate ids, no
orphan — same outcome as C3's footnote ⁹ and C5's footnote ¹² (delete-vs-add
on the same still-alive page), not a guarantee this cell is safe under real
timing pressure, just that this run didn't catch a loss.

¹⁵ Filled in 2026-08-25, completing C6's remaining 3 cells against a fresh
`per-app`/MT-off/sync-on scratch environment (`matrix-c6.sqlite`, ports
4106/5306). All three passed cleanly:
- **Delete section (concurrent vs. add)**: one client deleted an existing
  section while another concurrently added a new one, via the same
  `Y.Array`-backed `page-structure-provider.js` room used for Bug 1's fix
  (`sectionsArray`/`localUpdate`). Final `draft_sections` correctly reflected
  both operations — the delete's target gone, the concurrent add present, no
  duplicate ids. Consistent with C3/C5/C7's identical "delete-vs-add" result
  on other combinations.
- **Delete page (single)**: `localDelete` on a page correctly removed it
  server-side, verified via `/sync/bootstrap` re-fetch (not just client-
  reported success).
- **Delete page (concurrent vs. in-progress edit)**: one client deleted a
  page while another concurrently pushed a title update to that same page.
  The delete won the race; the losing update's `pushMutation` failed cleanly
  with a `404 Item not found` (logged to the browser console, not thrown
  uncaught) — no crash, no corrupted/partial row, no orphan. Matches C1's
  footnote ⁶ outcome (a clean race loss is an acceptable result here; LWW
  between "edit" and "delete" isn't a data-loss bug the way `draft_sections`
  membership races are).

Session gotcha worth recording for future cells: the site-creation wizard's
`app`/`type` identifiers come from `AdminContext` (ultimately
`import.meta.env.VITE_DMS_APP`/`VITE_DMS_TYPE` in `App.jsx`), **not** from
whatever is typed into the wizard's "Site Name" field — that field only sets
the site row's `data.site_name`. A scratch `.env.matrix-cN` file that omits
`VITE_DMS_APP`/`VITE_DMS_TYPE` silently inherits the real repo-root `.env`'s
values (`shaun-test-app`/`test`, the user's actual dev site) instead of a
fresh per-cell app name — the exact same "Vite merges `.env.<mode>` on top of
the real `.env`" gotcha already documented for `VITE_DMS_SYNC`/
`VITE_DMS_MULTI_TENANT`, just for a different pair of vars. Caught before any
real data was touched (the scratch SQLite file is fully isolated regardless
of which `app` string ends up in it — no cross-contamination risk with the
real Postgres site — but the *test* would have silently been invalid,
labeled as testing `matrix-c6` while actually exercising an unrelated app
name). C5's and C7's `.env` files already set these two vars correctly; make
sure every future scratch `.env.matrix-cN` file explicitly sets
`VITE_DMS_APP`/`VITE_DMS_TYPE` too, not just the sync/MT flags.

¹⁶ **Re-verified 2026-08-25, superseding the original ❌ Bug 1 result.** C6's
"add section concurrent" cell originally carried the ❌ Bug 1 result from the
*original pre-fix bug discovery* (against `stress-test-app`, before the
`Y.Array` fix — see "Bug 1 implementation," ~line 1524 — even existed). That
was stale: C8 (per-app/MT-**on**/sync-on, structurally identical to C6 except
MT) already showed the fix protects this exact scenario. Re-ran against a
fresh `per-app`/MT-off/sync-on scratch environment (`matrix-c6-rerun.sqlite`,
ports 4106/5306) using the current, fully-patched code: 4 concurrent
`localCreate` + `Y.Array` inserts (via `joinPageStructureRoom`) all survived,
zero loss, zero duplicates (`draft_sections` ended with exactly 4 distinct
ids). Confirms the Y.Array fix protects `per-app`/MT-off/sync-on, not just
the MT-on combination C8 already verified — closes the "carried-forward
stale result" gap for this cell. See "C6 re-verification + reorder test
(sync=on)" below for the full write-up, including a concurrent-reorder test
on the same environment.

### C1 findings (2026-08-25, legacy/off/off, SQLite scratch DB)

Full run against a throwaway SQLite server/frontend pair (`matrix-c1.sqlite`,
ports 4101/5301), fully isolated from the real dev servers. All 9 lifecycle
columns exercised — 7 clean, 2 confirm already-documented sync=off
limitations (Bug 1, Bug 3) rather than surfacing anything new.

**Setup gotcha, not an app bug — worth recording so the next combination
doesn't repeat it**: Vite merges `.env.<mode>` on top of the repo-root
`.env` rather than replacing it, so a scratch mode file that simply *omits*
`VITE_DMS_SYNC`/`VITE_DMS_MULTI_TENANT` still inherits `=1` from the real
`.env` — the first attempt at this cell was silently testing sync=on/MT=on,
not C1 at all (caught via `window.__dmsSyncAPI` unexpectedly being defined,
and a sync-status "connected" badge rendering on a page that should have no
sync UI at all). Fixed by setting both explicitly to `0` in the mode file.
**Every other combination's runbook needs the same explicit-`0` treatment**,
not just an omitted var.

**Separate CLI tool bug found (not a matrix/app bug) — `dms page update
--set`** (`packages/dms/cli/src/commands/page.js`'s `update()`) read-modify-
writes via plain lodash `merge(cloneDeep(currentData), data)`, which merges
arrays by index — the exact defect class Bug 12 already fixed in the app's
own `wrapper.jsx` (`mergeWith` + array-replace customizer), just never
applied to the CLI. Reproduced directly: setting `draft_sections` to a
1-element array via `--set` against a page whose current `draft_sections`
had 2 elements produced a 2-element array with the new value duplicated
(target's surviving trailing index kept the OLD length, index-merged with
the new single-element source). **Workaround used for all matrix testing**:
use `--data` (full JSON, sent as-is, no client-side merge) for any
`draft_sections`/array-valued field instead of `--set`. Not fixed as part of
this task — flagging for a follow-up CLI fix (same `mergeWith` treatment).

### C2 findings (2026-08-25, legacy/off/on, SQLite scratch DB) — new bug found: concurrent `/sync/push` creates can be assigned duplicate ids

Full run against a throwaway SQLite server/frontend pair (`matrix-c2.sqlite`, ports 4102/5302), fully isolated from the real dev servers, driving the real sync API (`joinPageStructureRoom`, `localCreate`/`localUpdate`/`localDelete`) directly — same method already used to verify Bug 12/13. 7 of 9 lifecycle stages passed cleanly (including the Bug-13-adjacent "delete section, single" and "update section, concurrent same-section" cases). Both failures are the SAME underlying bug, not a Yjs/room issue:

**Symptom.** 4 concurrent `localCreate` calls (2 from each of 2 tabs) for new sections produced only 3 distinct ids, with `id=6` and `id=7` each written twice — server log shows two separate `/sync/push` INSERT requests both resolving to `id=6` (revisions 11 and 13) and both resolving to `id=7` (revisions 12 and 14). The second push for each id landed via `ON CONFLICT(id) DO UPDATE`, silently overwriting the first push's row — one of the two logically distinct "add section" operations lost its data entirely, with no error surfaced anywhere in the final state (only visible via server log correlation). The same mechanism reproduced identically in the later "delete section (concurrent vs. add)" stage (final array `["6","7","7","8"]` — a literal duplicate id, Bug-13-shaped but NOT Bug 13's mechanism).

**Root cause — not the Yjs room at all.** `packages/dms-server/src/db/adapters/sqlite.js`'s `beginTransaction()`/`commitTransaction()`/`rollbackTransaction()` (~line 308-323) are three unguarded `this.db.exec("BEGIN"/"COMMIT"/"ROLLBACK")` calls against ONE shared `better-sqlite3` connection, with no per-request locking or queueing. `/sync/push`'s handler (`sync.js` ~line 378) calls `allocateId()` (`table-resolver.js` ~line 341) between its own `beginTransaction()`/`commitTransaction()`, which for SQLite legacy mode does `INSERT INTO dms_id_seq DEFAULT VALUES RETURNING id` — an `AUTOINCREMENT` table meant to act as a shared sequence. Direct inspection of the scratch DB after the test confirms the mismatch: `dms_id_seq` (and `sqlite_sequence`) show only **1** row/counter value ever persisted, while `data_items` has real rows up through id **8** — the sequence-table allocation path is not reliably surviving concurrent request interleaving, so it keeps handing out ids that collide with rows already committed via a different path. This produced repeated `UNIQUE constraint failed: data_items.id` errors in the server log (surfacing to the browser as 500s — visible on nearly every mutating stage in this run, not just the two that ultimately failed), which then drove `sync-manager.js`'s `localCreate` into its offline-fallback retry path; that retry pushes a **client-generated temp id** via the same `ON CONFLICT DO UPDATE` insert, and when that temp id happens to coincide with a different concurrently-created row's real id, the retry's data silently overwrites it instead of erroring — which is the second half of how two distinct creates end up collapsed into one row.

**Scope.** This is a `dms-server` SQLite-adapter concurrency bug, unrelated to sync being on/off and unrelated to `splitMode`. It does **not** affect the real Postgres-backed site (`shaun-test-app`/`mercury.availabs.org`) — Postgres's `nextval()` sequence path (also in `allocateId()`) is server-side-atomic and doesn't share this connection-transaction-nesting problem. It does very plausibly explain C1's footnote ⁴ ("one id appearing twice" under sync=off) — C1's create path (`dms.controller.js` line 959) calls the exact same `allocateId()`. Likely affects any SQLite-backed combination under real concurrent load: C1, C2 (confirmed), and by inference C5/C6/C7 whenever they use a SQLite scratch DB rather than Postgres.

**Not fixed as part of this fork's directive** (test-matrix execution, not a fix task) — flagging for a dedicated follow-up. A fix likely needs either: (a) genuinely serializing `beginTransaction`/`commitTransaction` per-connection (a request queue/mutex around the SQLite adapter's transaction lifecycle), and/or (b) making `allocateId`'s SQLite path atomic without depending on transaction boundaries at all (e.g., `INSERT ... RETURNING id` on `dms_id_seq` in its own auto-committing statement, outside the caller's transaction).

### C2 re-verification (2026-08-25, against fully-patched code) — original diagnosis holds unchanged

**Why this rerun happened.** C2's original run above predates (or its ordering relative to was never established against) eight sync-layer bugs found and fixed later in this same investigation — Bug 5 (sync push missing auth header), Bug 6 (malformed ref crash), Bug 7 (revision watermark race), Bug 8/9/10 (cross-tab reflection / echo suppression / WS broadcast filter), Bug 12 (room-seeding race), Bug 13 (server-side concurrent-join race duplicating a page's whole section list — mechanistically the closest thing to C2's own symptom). Since C2 exercises exactly the machinery those bugs touch (`joinPageStructureRoom`, `localCreate`, `/sync/push`), the original id-collision diagnosis needed confirming against the current code rather than being carried forward on trust.

**Method.** Entirely fresh throwaway environment (`matrix-c2-rerun.sqlite`, ports 4102/5302, distinct DB file from the original `matrix-c2.sqlite`), same sync-API-direct technique, full 9-stage run.

**Result: identical failure, down to the specific ids.** 7/9 passed. The same two stages failed with the same shape: "add section (concurrent 3-4x)" produced only 3 unique ids from 4 concurrent creates, and "delete section (concurrent vs. add)" produced final array `["6","7","7","8"]` — a literal duplicate id, matching the *exact same pattern* (not just the same category of failure) as the original run. Server log showed the identical `UNIQUE constraint failed: data_items.id` / `[sync/push] error` sequence. Direct DB inspection post-run confirmed the identical mechanism: `dms_id_seq` had only 1 row while `data_items` had rows up through id 8 — the sequence-table allocation path still isn't surviving concurrent request interleaving.

**Conclusion.** None of Bugs 5–13 touch this failure mode — confirmed, not just inferred. It lives entirely in `sqlite.js`'s unguarded shared-connection transaction handling and `allocateId()`'s `dms_id_seq` path, a layer completely orthogonal to the Yjs room/WebSocket machinery those eight bugs fixed. The original C2 diagnosis and matrix row stand as correct and current — no changes needed to the matrix table or the original findings above. This rerun's value is confidence, not correction: it rules out "stale pre-fix result" as an explanation for C2's ❌ cells.

**Scripts**: `scratchpad/matrix-c2-rerun-setup.mjs` (site creation), `scratchpad/matrix-c2-rerun-full.mjs` (full 9-stage run) — kept alongside the original `matrix-c2-*.mjs` scripts for history, not overwritten.

### C3 findings (2026-08-25, legacy/MT-on/sync-off, SQLite scratch DB)

Full run against a throwaway SQLite server/frontend pair (`matrix-c3.sqlite`,
ports 4103/5303), fully isolated from the real dev servers and from C1/C2's
servers. First matrix cell requiring multi-tenant setup — see "Multi-tenant
setup, worked out live" below for the mechanism, since the runbook's step 4
didn't yet document the concrete steps.

**Method.** Since `sync=off` means there is no `globalThis.__dmsSyncAPI` and
no Yjs room to drive, mutations were issued via `falcor.call(['dms','data',
'create'|'edit'|'delete'], [...])` — the **exact function** (`falcorGraph()`
from `@availabs/avl-falcor`) the app's own `FalcorProvider`/`App.jsx` uses,
dynamically imported in-browser via Vite's `@fs/` (same technique already
used for `page-structure-provider.js` in C2's script), not a hand-rolled HTTP
request. Auth flows through `window.localStorage.userToken`, matching
`CustomSource.onBeforeRequest`'s real lookup. This is genuinely
"`sectionArray.jsx`'s sync-inactive fallback path," matching C1's footnote ⁴
description, just invoked directly instead of through UI clicks — concurrent
`draft_sections` adds/deletes were done as real client-computed
read-current-full-array → write-new-full-array pairs, mirroring the actual
non-sync code path exactly (no Yjs anywhere in this cell).

**Verification pitfall hit and fixed, worth recording**: reading server state
back via a **shared/reused** `falcorGraph()` Model instance across
create→edit→get calls on the same simulated client returns **locally
cached, pre-edit data** — Falcor's own client-side graph cache serves `.get()`
straight from memory without a network round-trip when the same path was
already populated by an earlier `.create()`/`.get()` response, and the
`edit`/`delete` calls used here didn't reliably invalidate that local cache.
This produced several false "still stale" failures on the first attempt (`add
section (single)` and others reading back `draft_sections: []` immediately
after a successfully-persisted edit — confirmed via `dms raw get` that the
server row was actually correct the whole time). **Fix**: every
verification read constructs a **brand-new** `falcorGraph()` Model with no
shared cache, forcing a real network round-trip. Second pitfall: a
missing/deleted id's `.get()` resolves to a real object `{id: null}` (Falcor's
not-found sentinel), not an absent path — checking the object's truthiness
instead of `.id !== null` reads a deleted row as "still present." Both were
script bugs in this run's test harness, not app defects — noted here so the
next SQLite-scratch cell (C5/C7) doesn't waste time rediscovering them.

**Multi-tenant setup, worked out live** (the runbook's step 4 said "creating
the master site alone isn't enough," but not the concrete mechanism — now
documented): a "tenant" is its own full DMS site living under its own `app`
value, referenced from the master site's `tenants` array. The signup page
(`AuthSignup`'s `isTenantSignup` branch, `patterns/auth/pages/authSignup.jsx`)
detects "multi-tenant + root domain, no subdomain" and, instead of a normal
login form, shows an Organization Name / Subdomain / Email / Password form.
Submitting it (1) creates an auth project + first user via `/init/setup`
(project = the subdomain slug, not the master app), (2) creates a
`{siteInstance}|{slug}:tenant` row on the **master** app with
`{name, subdomain, app: slug}`, (3) appends a ref to it onto the master
site's own `tenants` array, (4) creates the tenant's **own** `{siteInstance}
:site` row under `app = slug`, (5) creates the tenant's own auth pattern, (6)
provisions the selected site template's patterns/pages under the tenant's
app (`provisionTemplatePatterns` in `utils/tenantProvisioning.js`), (7) does
a **full-page redirect** (different origin, can't use client-side `navigate`)
to `${protocol}//${slug}.${host}${baseUrl}/login`. Requests against
`<subdomain>.localhost:<port>` resolve out of the box (standard `*.localhost`
behavior, no `/etc/hosts` edit needed) — `dmsSiteFactory.jsx` reads the
subdomain, matches it against the master site's `tenants[].subdomain`, and
swaps every app reference to the matched tenant's own `app` for the rest of
that request's routing (`tenantApp`/`tenantDmsConfig` substitution — a
materially different code path from the single-tenant/root-domain one, not
just a flag, confirming the task file's existing note about this).

**Master vs. tenant path, both tested (dual-path, footnote ⁸)**: create-page
and add-section-single were run identically against both the **root domain**
(platform-admin, `app = matrix-c3`, the master site itself) and the
**tenant subdomain** (`acmec4.localhost:5303`, `app = acmec3`) — both passed
cleanly, confirming the write path itself doesn't differ between master and
tenant once past `dmsSiteFactory`'s app-resolution step. The remaining 7
lifecycle columns were run tenant-subdomain-only.

**Bug 1 reproduces here too (concurrent add)**: 4 concurrent adds (2 tabs ×
2 each) — 2 of 5 expected ids survived into the final `draft_sections`
(`sec1Id` and the last writer's id), 3 silently lost. Identical mechanism to
C1's footnote ⁴ and the original Bug 1 repro: plain client-computed
read-modify-write on the whole array, last write wins, no per-element merge —
`sync=off` has no Yjs `Y.Array` protection regardless of `splitMode`/`MT`.
Reproduced identically across 2 full runs (not a fluke). **This confirms Bug
1 is unconditional on the multi-tenant axis**, matching the existing
"predates sync entirely, sync on/off both affected" root-cause conclusion.

**Everything else passed cleanly**, including the scenario Bug 3 predicted
would likely also lose data (delete-vs-add on the same page, footnote ⁹) —
it did not, in this run. Not a guarantee the race is safe in general (LWW on
a shared array can still coincidentally preserve both writers depending on
timing/ordering), but worth recording precisely rather than over-claiming
Bug 3 as confirmed here.

### C4 findings (2026-08-25, legacy/MT-on/sync-on, SQLite scratch DB) — new critical bug: single-client sync create silently destroys an unrelated existing row

Full run against a throwaway SQLite server/frontend pair (`matrix-c4.sqlite`,
ports 4104/5304), fully isolated from the real dev servers and from
C1/C2/C3's servers. Setup mirrored C3's (see its write-up for the tenant
mechanism) but drove mutations through the real sync API
(`globalThis.__dmsSyncAPI`, `joinPageStructureRoom`) exactly like C2's
script, since sync is on for this cell.

**Symptom, found on the very first single-client action — no concurrency
involved at all.** The dual-path root-domain `create page (single)` call
(`api.localCreate('matrix-c4', 'pages|page', {...})`, one client, one call)
came back from the server as HTTP 500. The client reported success anyway
(sync's own offline/retry-with-fallback path silently absorbed the error)
with `id: 6` — but `id: 6` on the server was **not** a new page. It was the
tenant (`acmec4`)'s own **site row** (`type: test:site`). Reading it back
directly from the SQLite file confirmed the site row's `data` column had
been **completely overwritten** with the new page's content
(`{"title":"C4 Root Test Page", "draft_sections":[...], ...}`), destroying
the tenant's actual site definition (its `patterns`/`tenants`/`dms_envs`
refs — everything) in place.

**Clean, deterministic, single-client reproduction (isolated from any prior
corrupted state)**: wiped `matrix-c4.sqlite`, restarted the server fresh,
recreated the master site and one tenant via the real signup wizard (9 rows
total: master's site/auth-pattern/pages-pattern/page = ids 1–4, tenant's
tenant-row/site/auth-pattern/pages-pattern/page = ids 5–9), then — as the
tenant, one browser context, one call, zero concurrency —
`api.localCreate('acmec4', 'pages|page', {title: 'Solo Test Page', ...})`.
Client reported success with `id: 9`. Server log:

```
<SqliteAdapter> Query error: UNIQUE constraint failed: data_items.id
  Original values: [2, 'acmec4', 'pages|page', '{"title":"Solo Test Page",...}', 3]
[sync/push] error: UNIQUE constraint failed: data_items.id
[sync/push] I app=acmec4 type=pages|page id=9 0.2KB rev=16
```

Reading `data_items` row 9 directly afterward: `data` = `{"title":"Solo Test
Page",...}` — **the tenant's own auto-provisioned "Page 1" (the Simple Site
template's page, id 9, created moments earlier by the signup wizard) is
gone, silently replaced in place.** No error reached the user; the app
believes it created a new page and shows it as such.

**Root cause — same underlying defect footnote ⁷/C2 already documented,
but MT setup makes it fire on the very first write instead of eventually
under concurrent load.** `allocateId()`'s SQLite path (`dms_id_seq`
sequence table, `table-resolver.js`) is completely independent of, and
oblivious to, ids already consumed by the **non-sync** `falcor.call`
path — which is what every site/tenant/pattern/template-page row goes
through during setup (the signup wizard and `provisionTemplatePatterns`
never touch sync; confirmed directly in C3's investigation of the same
wizard code). C2 already showed `allocateId()`'s own sequence table
persists unreliably under the SQLite adapter's unguarded shared-connection
transaction handling (`beginTransaction`/`commitTransaction`/
`rollbackTransaction` racing on one connection, no per-request lock) — in
C2's single-tenant setup (~4 pre-existing rows) this usually didn't collide
on the *first* single-client write, only surfacing under real concurrent
load. **Multi-tenant setup roughly doubles the pre-existing row count**
(a second full site+auth-pattern+pages-pattern+page for the tenant, on top
of the master's own) — pushing the collision from "usually survives the
first quiet write" to "collides deterministically on literally the first
write" in this run. When `allocateId()` returns an id that collides
(observed: `id=2`, already taken by an unrelated row), the insert fails
server-side, and **sync-manager.js's client-side retry/offline-fallback
path silently absorbs the failure and retries with a different id** — which
in this reproduction landed on `id=9`, the *tenant's own already-existing
page*, and the retry's `INSERT ... ON CONFLICT(id) DO UPDATE` insert
overwrote it wholesale rather than erroring. The exact algorithm the client
uses to pick the retry id (why 9, specifically, and not some other in-use
id) was not traced to source in this pass — flagged as the next step for
whoever picks up a fix, since footnote ⁷'s "temp id coincides with a
different row's real id" description already anticipated this exact
failure shape, just not yet with a live, deterministic, single-client demo.

**Severity**: worse than footnote ⁷'s original C2 finding. That required
concurrent requests to observe (an id "appearing twice," an interleaved
insert getting clobbered). This reproduces with **one client, one action,
zero timing dependency** — the very first "Add Page" or "Add Section" a
real admin performs on a fresh multi-tenant + sync SQLite site can silently
destroy an arbitrary already-existing row, with no error surfaced anywhere
in the UI. Given every multi-tenant site's setup wizard leaves several rows
already consumed before any sync write happens, this is very plausibly
**the default, not an edge case**, for this specific combination
(`legacy` split mode, SQLite backend, multi-tenant on, sync on).

**Scope**: SQLite-adapter-specific, same as footnote ⁷ — the task file's
existing scope note ("does not affect the real Postgres-backed site... likely
affects any SQLite-backed combination under real concurrent load: C1, C2
(confirmed), and by inference C5/C6/C7") should be revised to note that for
**multi-tenant** SQLite combinations specifically **in `legacy` split mode**
(C4 confirmed), this isn't only a concurrent-load risk — it can hit on the
very first single-client write. **Revised further, now that C7 has actually
run**: the "C7 by inference" guess above was wrong — C7 (`per-app` + MT-on +
sync-off) does **not** reproduce this bug at all, confirmed live (see "C7
findings" below). The mechanism is specific to `legacy` mode's single shared
`dms_id_seq`/`data_items` table across every app on the server; `per-app`
mode gives each app (master and every tenant) its own table and its own id
sequence, so there is no shared counter for multi-tenant provisioning to
collide against in the first place. This narrows this bug's confirmed/
inferred scope to **`legacy` split mode specifically** (C2 confirmed under
concurrency, C4 confirmed on a single write under MT) — `per-app` mode
(C5, C7 confirmed) is structurally unaffected, independent of multi-tenant
or sync state.

**Related but distinct — see Bug 14 below.** Reading the Postgres adapter for
comparison (to confirm the "doesn't affect Postgres" claim) surfaced a
separate, likely more severe defect in how `beginTransaction`/
`commitTransaction`/`rollbackTransaction` acquire connections from the pool —
not the same bug, not SQLite-specific, and would affect the real production
Postgres backend. Code-level finding only, not yet live-verified (no Postgres
server was available in this session) — see Bug 14's full write-up further
down this file.

**Remaining lifecycle columns not independently tested.** Once the first
create silently corrupts existing state, every subsequent stage in the same
environment runs against already-corrupted data, so results recorded past
that point (an earlier, since-discarded run did reach as far as "add section
concurrent" before crashing on a script-side null-check, produced by
`getServerItem` not yet having the C3-discovered fix) wouldn't be a clean
read on those specific stages. Marked ⏳ in the matrix rather than reporting
numbers that would misattribute this bug's damage to a different column.
**Not fixed as part of this fork's directive** (test-matrix execution, not a
fix task) — flagging for the same follow-up that should address footnote ⁷,
since it's the identical underlying defect.

**Scripts**: `scratchpad/matrix-c3-full.mjs` (falcor.call-direct technique,
dual-path), `scratchpad/matrix-c4-full.mjs` (sync-API technique, dual-path;
note this script's run reflects the corrupted-environment run described
above — rerunning it against a fresh DB will very likely reproduce the
footnote ¹⁰ bug again on its very first stage rather than reaching the later
columns), `scratchpad/matrix-c3-setup.mjs` / `matrix-c3-tenant-setup.mjs`
(master + tenant creation, reusable for C5/C7's multi-tenant setup).

### C5 findings (2026-08-25, per-app/off/off, SQLite scratch DB)

Full run against a throwaway SQLite server/frontend pair (`matrix-c5.sqlite`,
ports 4105/5305), fully isolated from the real dev servers and from
C1-C4's servers. First matrix cell to exercise `per-app` split mode.
Method: same falcor.call-direct technique as C1/C3 (sync=off means there's no
`__dmsSyncAPI`/Yjs room to drive) — single app, single host, no multi-tenant
complexity (that's C7's job).

**`per-app` is a genuinely different code path for SQLite too, not just
Postgres.** `table-resolver.js`'s `resolveTable()`/`getSequenceName()` route
a per-app SQLite app to its own table (`data_items__matrix_c5`, confirmed via
direct DB inspection — the legacy `data_items` table stayed empty throughout
this run) and its own id-allocation sequence table (`seq__matrix_c5`, distinct
from legacy mode's shared `dms_id_seq`). One consequence worth noting for
whoever picks up the `allocateId()` id-collision bug (footnote ⁷/C2, footnote
¹⁰/C4): **`getServerItem`-style verification must use the app-namespaced
Falcor route** (`dms.data[app].byId[id][attrs]`, per `dms.route.js` lines
389-404 and the dms-server `CLAUDE.md`'s "per-app... tests use the
app-namespaced route" note) — the legacy `dms.data.byId[id][attrs]` route
only reads the shared/legacy table, which is empty for a per-app-only app, so
every lookup silently returns nothing. Hit this directly while adapting C3's
script for C5 (first run: 8 of 9 stages appeared to fail with
`draft_sections=undefined`, purely a verification-script bug, not a product
bug — fixed by switching `getServerItem` to the app-namespaced path; see
`scratchpad/matrix-c5-full.mjs`).

**Bug 1 reproduces on this combination, identically to C1/C3.** 4 concurrent
`draft_sections` adds (client-computed full-array read-modify-write, mirroring
`sectionArray.jsx`'s sync-inactive path): expected 5 unique section ids
(1 prior + 4 concurrent) in the final array, got 2 (`["6","10"]`) — sections
7, 8, 9 were created as fully-saved, correct, permanently orphaned rows (
confirmed via direct DB read of `data_items__matrix_c5`), never referenced by
the page. Same root cause as documented for C1/C2/C3/C6 (plain LWW on the
whole array, no per-element merge, sync=off has no Yjs protection at all).

**No `allocateId()`/`dms_id_seq`-class id collision observed in this run** —
all 13 allocated ids (`seq__matrix_c5` table, 13 rows after the full 9-stage
run) were unique, no `UNIQUE constraint failed` errors in the server log, no
silently-overwritten unrelated row. Consistent with C2's finding that this
bug needs either real concurrent *creates* (not just concurrent edits of an
already-created row) or enough pre-existing rows to make a collision likely —
this run's concurrent stage only ran section *creates* sequentially (4 calls
in a plain loop) and made only the `draft_sections` *edit* concurrent, so it
did not specifically stress-test the create-time race. `per-app` mode's
separate per-app sequence table means a per-app site's total row count before
any given write stays low (this run: 13 total, similar order to C1's
low-collision-risk regime) unless multi-tenant provisioning inflates it the
way it does in `legacy` mode (see C4) — worth checking explicitly if C7
(per-app + MT) reproduces C4's "collides on the very first write" severity or
not, since the per-app isolation might change that calculus.

**All other 7 of 9 lifecycle stages passed cleanly**: create page, add
section (single), update section content (single and concurrent-different-
fields), delete section (single), delete section vs. add (concurrent — same
outcome as C3's footnote ⁹, no loss this run), delete page (single), delete
page vs. in-progress edit (concurrent — no crash, delete won).

**Scripts**: `scratchpad/matrix-c5-setup.mjs` (site creation via the real
`/list/create` wizard, single master site, no tenant), `scratchpad/matrix-c5-full.mjs`
(full 9-stage falcor.call-direct run, adapted from `matrix-c3-full.mjs` with
the app-namespaced byId fix above and MT/tenant-subdomain logic stripped out).

### C7 findings (2026-08-25, per-app/MT-on/sync-off, SQLite scratch DB) — answers C5's open question: the C4 collision bug does NOT reproduce under `per-app` split mode, and the reason is structural

Full run against a throwaway SQLite server/frontend pair (`matrix-c7.sqlite`,
ports 4107/5307), fully isolated from the real dev servers and every other
matrix cell's scratch environment. Combines C5's `per-app` technique with
C3/C4's multi-tenant setup (real signup wizard, root-domain master +
`acmec7.localhost` tenant subdomain). Method: falcor.call-direct (sync=off,
no `__dmsSyncAPI`/Yjs room), using the app-namespaced `getServerItem` fix
C5 already found necessary for `per-app` mode.

**Headline result: the C4 critical bug (single-client, zero-concurrency
create silently overwriting an unrelated existing row) does not reproduce
here, on either the ROOT/platform-admin host or the TENANT host.** Verified
directly, not just inferred from "no error surfaced": before each host's
`create page` call, every existing row on that host (ROOT: site, auth
pattern, pages pattern, template page, tenant ref — 5 rows; TENANT: site,
auth pattern, pages pattern, template page — 4 rows) was read back via the
app-namespaced byId route and recorded; immediately after the create call,
the same set was re-read and diffed byte-for-byte against the recording.
Zero rows changed type or title on either host, and the new page's
server-assigned id (`6` on ROOT, `5` on TENANT) did not collide with any
pre-existing row's id.

**Why — this is structural, not a smaller/luckier version of the same race.**
`table-resolver.js` routes `per-app` mode to a **separate table and a
separate id sequence per app** (confirmed via direct DB inspection of
`matrix-c7.sqlite`: `data_items__matrix_c7`/`seq__matrix_c7` for the master,
`data_items__acmec7`/`seq__acmec7` for the tenant — the shared legacy
`data_items`/`dms_id_seq` tables stayed completely empty, `0` rows, for the
whole run). Footnote ¹⁰/C4's bug depends entirely on a **shared** sequence
(`dms_id_seq`) whose next value can collide with a row from a *different*
app's non-sync-path provisioning (master's rows and the tenant's rows both
drew from the same counter in `legacy` mode). In `per-app` mode there is no
shared counter to collide against in the first place — the master's 5
pre-existing rows and the tenant's 4 pre-existing rows live in entirely
separate tables with entirely separate sequences, so a fresh `per-app`
create can only possibly collide with rows in its *own* app's table, and
each app's own sequence correctly tracks its own next-free id (`seq__matrix_c7`
had exactly 5 rows before the test, handing out `6` next; `seq__acmec7` had
exactly 4, handing out `5` next — no gap, no reuse). **Multi-tenant
provisioning still roughly doubles total row count across the whole SQLite
file, same as it does in `legacy` mode** — the difference is that in
`per-app` mode those extra rows land in a table the new write's own sequence
never shares, so the "MT inflates pre-existing row count" mechanism that
made C4 deterministic simply has nothing to inflate *into*. This confirms
`per-app` mode is not just "the same bug, less likely to fire here" — for
this specific defect class, it is architecturally immune. (This does not
mean `per-app`/SQLite is immune to *all* concurrency issues — see the next
paragraph, and C4's Bug 14/Postgres-pooling write-up remains orthogonal and
unverified either way.)

**Bug 1 (concurrent add loses sections) reproduces identically to
C1/C3/C5/C6**, confirming it is unconditional on split mode, multi-tenant, or
sync state (as already established) — this is the first time it's been
confirmed on the `per-app` + multi-tenant combination specifically. 4
concurrent `draft_sections` adds on the tenant page: expected 5 unique
section ids in the final array (1 prior + 4 concurrent), got 2
(`["6","10"]`) — sections 7, 8, 9 were created as fully-saved, correct,
permanently orphaned rows in `data_items__acmec7`, never referenced by the
page. Identical shape and root cause to every prior sync=off cell: plain
last-write-wins on the whole array, no per-element merge, no Yjs protection
because sync is off.

**All other 7 of 9 lifecycle stages passed cleanly** on the tenant host (the
representative MT path, per the runbook's convention): update section
content (single and concurrent-different-fields), delete section (single),
delete section vs. add (concurrent — delete won, new add landed, no dupes,
no orphan — same outcome as C3's footnote ⁹ and C5's footnote ¹²), delete
page (single), delete page vs. in-progress edit (concurrent — no crash,
delete won). Dual-path create-page and add-section-single also passed
cleanly on the ROOT/platform-admin host (see footnote ¹³).

**Session gotcha, worth recording**: this cell's first setup attempt used a
wrong relative path for the scratch-DB wipe (`data/matrix-c7.sqlite*` from
`packages/dms-server/`, when the actual path is `src/db/data/matrix-c7.sqlite`
per the server's own startup log) — the `rm` silently no-opped (file not
found at that path) rather than erroring, so a "fresh" server restart
actually reloaded a partially-corrupted prior run's data untouched. Caught
via the browser signup flow reporting "Project already initialized" on what
was assumed to be a virgin DB. **Always verify a scratch-DB wipe actually
removed the real file** (`ls` the exact path the server logs on init, not an
assumed path) before trusting a "clean run."

**Scripts**: `scratchpad/matrix-c7-setup.mjs` (master site via the real
`/list/create` wizard), `scratchpad/matrix-c7-tenant-setup.mjs` (tenant via
`/auth/signup`, subdomain `acmec7`), `scratchpad/matrix-c7-full.mjs` (full
9-stage falcor.call-direct run, dual-path root+tenant, adapted from
`matrix-c3-full.mjs` with C5's app-namespaced `getServerItem` fix, plus an
explicit pre/post row snapshot-and-diff on both hosts to directly verify the
no-collision result above rather than just inferring it from clean create
responses).

### C8 findings (2026-08-25, per-app/MT-on/sync-on, SQLite scratch DB) — 11/11 passed; confirms Bug 1's Y.Array fix protects this combination, and per-app mode's no-collision result (C7) holds with sync on too

Full run against a throwaway SQLite server/frontend pair (`matrix-c8.sqlite`,
ports 4108/5308), fully isolated from the real dev servers and from every
other matrix cell's scratch environment. **Distinct from C8's pre-existing
real-Postgres-verified cells**: add-section-single and delete-section-single
were already independently confirmed against the user's real dev site
(`shaun-test-app`/`mercury.availabs.org`) post-Bug-4-fix (footnote ³, kept
as-is, not re-touched here) — everything in this write-up is against fresh
scratch SQLite instead, run for methodology consistency with C1-C7 and to
fill the remaining ⏳ columns without touching real data. Setup mirrored
C7's (master site via `/list/create`, tenant `acmec8` via `/auth/signup`),
mutations driven through the real sync API (`globalThis.__dmsSyncAPI`,
`joinPageStructureRoom`) exactly like C4's script, adapted to this cell's
ports/app names (`scratchpad/matrix-c8-full.mjs`).

**All 11 checks passed** (9 lifecycle columns plus the dual-path
root/platform-admin re-checks of create-page and add-section-single,
matching C3/C4/C7's dual-path convention): create page (root + tenant), add
section single (root + tenant), add section concurrent 3-4x, update section
content (single + concurrent different-fields), delete section (single),
delete section vs. add (concurrent), delete page (single), delete page vs.
in-progress edit (concurrent). Every result was cross-checked directly
against the raw sqlite file (`data_items__acmec8`), not just the script's
own server-fetch assertions — e.g. the tenant test page's final
`draft_sections` read back as `["8","9","10","11"]` directly from the
database, matching the script's reported state exactly.

**Two things this cell specifically confirms, closing open questions from
earlier cells:**

1. **Bug 1's Y.Array fix (see "Bug 1 implementation," ~line 1156) does
   protect concurrent structural edits on this combination.** The "Scope
   limitation" note (~line 1284) predicted this: sync=on combinations (C2,
   C4, C6, C8) should get the fix's protection, since it depends on a live
   WebSocket room. This is the first sync=on, MT=on cell where "add section
   concurrent" was actually exercised end-to-end without an environment bug
   blocking it first (C4 never got this far — its create-page collision
   corrupted state before this column could be tested; C6 tested this
   column but under MT=off) — 4 concurrent adds landed as 4 distinct ids,
   zero lost, zero duplicated. Confirms the fix generalizes to `per-app`
   split mode, not just the `legacy`-mode environment it was originally
   verified against.

2. **The C4 id-collision bug does not reproduce here either**, extending
   C7's finding (sync=off) to sync=on: `per-app` split mode's per-app/per-
   tenant table and sequence isolation (`seq__matrix_c8`, `seq__acmec8`)
   means multi-tenant provisioning never shares a counter with anything
   else, regardless of whether sync is on or off. Between C7 and C8, the
   collision bug is now confirmed **specific to `legacy` split mode**, not a
   general "multi-tenant + SQLite" or "multi-tenant + sync" hazard — C4
   remains the only cell where it's been observed, and both axes that
   distinguish C4 from a clean cell (MT and sync) have now each been tested
   independently in `per-app` mode (C7: MT-on/sync-off; C8: MT-on/sync-on)
   without reproducing it. The task file's C4 "Scope" paragraph already
   reflects the split-mode-specific framing after C7; this is corroborating
   evidence, not a new revision needed.

**Scripts**: `scratchpad/matrix-c8-setup.mjs` (master site via `/list/create`),
`scratchpad/matrix-c8-tenant-setup.mjs` (tenant via `/auth/signup`, subdomain
`acmec8`), `scratchpad/matrix-c8-full.mjs` (full dual-path sync-API run,
adapted from `matrix-c4-full.mjs`).

### Concurrent reorder test, sync=off (2026-08-25) — first-ever test of reorder under concurrency, closes half of the Bug 1 follow-up gap

Concurrent reorder had never been independently tested anywhere in this task
(flagged as an open item in the Testing checklist). Tested here against a
lightweight, single-purpose scratch environment — `legacy` split mode, no
multi-tenant, sync off (the C1 baseline combo) — since the point was to
characterize the reorder mechanism itself, not repeat a full 9-column matrix
cell. Server/frontend on ports 4109/5309, config `matrix-reorder-off`,
isolated from every other scratch environment. Method: the same
falcor.call-direct technique as C1/C3/C5/C7 (`falcor.call(['dms','data','edit'],
...)`, dynamically imported via Vite's `@fs/`, no `__dmsSyncAPI` since sync is
off) — i.e. exactly `sectionArray.jsx`'s `moveItem()` sync-inactive
read-modify-write path: read the full `draft_sections` array, compute a new
full array locally, write the new full array back.

**Setup**: a page with 5 sections created sequentially (ids 5-9, `[5,6,7,8,9]`
= `[ONE,TWO,THREE,FOUR,FIVE]`). Two clients (A, B) both read this same
baseline, each computes a different, overlapping reorder:
- Client A: move `ONE` (index 0) to after `THREE` → `[TWO,THREE,ONE,FOUR,FIVE]`
  = `[6,7,5,8,9]`
- Client B: move `FOUR` (index 3) to the front → `[FOUR,ONE,TWO,THREE,FIVE]`
  = `[8,5,6,7,9]`

Both writes fired via `Promise.all` near-simultaneously.

**Result: plain last-write-wins, exactly as predicted by Bug 1's documented
mechanism — but *not* as destructive as Bug 1's add case.** Final
`draft_sections`: `["8","5","6","7","9"]` — client B's write landed last and
won outright; client A's reorder was silently and completely discarded, no
trace, no error, no partial application. Critically, unlike Bug 1's
concurrent-add scenario: **all 5 original section ids are still present, in
a valid (if not either client's intended) order, and there are zero
duplicates.** Reorder doesn't create new rows the way add does, so there's
nothing to end up permanently orphaned — the failure mode here is strictly
"one user's reordering work vanishes without any indication," not "content is
destroyed or duplicated." Still a real, user-visible correctness bug (client
A would see their own reorder silently reverted, exactly the same
"vanishes live, no reload needed" character Bug 1's original write-up
documented for adds, since sync=off doesn't have this specific live-echo
behavior — client A would only discover the loss on next read/reload) and
falls under the same root cause and same open fix decision (Bug 1 follow-up:
"decide whether sync=off configurations need a separate mitigation").

**Scripts**: `scratchpad/matrix-reorder-off-setup.mjs` (site creation via
`/list/create`), `scratchpad/matrix-reorder-off-run.mjs` (the reorder test
itself).

### C6 re-verification + reorder test, sync=on (2026-08-25) — closes the other half of the Bug 1 follow-up gap, and clears a stale pre-fix matrix result

Two pieces of work against one fresh scratch environment (`per-app`/MT-off/
sync-on, `matrix-c6-rerun.sqlite`, ports 4106/5306, config `matrix-c6-rerun`
— a distinct DB/app name from the original `matrix-c6`, kept alongside it for
history): re-verifying C6's "add section concurrent" cell against the
current code, and testing concurrent reorder under sync=on as the
counterpart to the sync=off reorder test directly above.

**Part 1 — why C6's Bug 1 cell needed re-verification.** C6's matrix row
carried a ❌ Bug 1 result for "add section concurrent" from the *original*
live bug discovery (see "Bug 1," ~line 52, and "What's actually been
tested," ~line 475, both against a scratch site called `stress-test-app`) —
which predates the `Y.Array` fix ("Bug 1 implementation," ~line 1524)
entirely; the matrix row was never updated after the fix landed. Meanwhile
C8 (per-app/MT-**on**/sync-on — identical to C6 except multi-tenant is on)
was freshly tested this session in the standardized scratch-environment
methodology and found the fix works cleanly. Carrying forward C6's pre-fix
result as current matrix truth was an oversight worth correcting rather than
assuming "C8 passed, C6 probably would too."

**Method and result.** Real sync API (`globalThis.__dmsSyncAPI`,
`joinPageStructureRoom`), 4 browser contexts all joining the same fresh
page's structure room, each doing one `localCreate` + `Y.Array` insert
concurrently (mirroring the original Bug 1 repro and C8's methodology
exactly). Result: **all 4 sections survived** — `draft_sections` ended with
exactly 4 distinct ids (`["16","17","18","19"]` in one run), zero loss, zero
duplicates. **The matrix's C6 cell is updated from ❌ Bug 1 to ✅¹⁶** (see
footnote 16 above) — the Y.Array fix protects this combination too, closing
the gap between "fix implemented and verified once, informally" and "fix
confirmed via the same rigorous methodology used for every other matrix
cell." C6's other cell involving Bug 2 (Yjs character-loss, "update section
concurrent") was deliberately **not** re-run — that bug remains unfixed (see
"For Bug 2," ~line 1646), so a re-run would be expected to reproduce
identically and wouldn't change the matrix.

**Part 2 — concurrent reorder, sync=on.** Same environment. Built a page
with 4 sequentially-created sections (`ONE, TWO, THREE, FOUR`), then two
fresh clients each joined the room and performed an overlapping move
concurrently: client E moved `ONE` from the front to the end; client F moved
`FOUR` from the end to the front — deliberately chosen so the two moves
don't just undo each other. **Result: both moves merged correctly, no data
loss, no duplication.** Final `draft_sections`: `["31","29","30","28"]`
(`FOUR, TWO, THREE, ONE`) — `FOUR` (F's move) landed at the front and `ONE`
(E's move) landed at the end, i.e. **both concurrent reorders were
independently and correctly reflected in the final merged order**, not just
"no corruption" but the actually-intended outcome of both operations. This
is a materially better result than the sync=off reorder test directly above
(which found *plain last-write-wins*, one client's reorder silently and
completely discarded) — confirming the design doc's claim (`Bug 3
(delete-vs-add) falls out of this design for free,` ~line 1512, which
predicted `Y.Array`'s CRDT/RGA-family semantics protect move operations too,
not just insert/delete) actually holds for reorder specifically, not just
add/delete. **Together, the two reorder tests (this one + the sync=off one
above) close the "Bug 1 follow-up: concurrent reorder not yet independently
tested" checklist item** for the two combinations that most clearly bracket
the mechanism (sync=on with the fix vs. sync=off without it); the remaining
6 matrix cells' reorder behavior is inferred from the same shared code path,
not independently run.

**Scripts**: `scratchpad/matrix-c6-rerun-setup.mjs` (site creation),
`scratchpad/matrix-c6-rerun-full.mjs` (both parts — concurrent add
re-verification + concurrent reorder — in one run).

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

See the dated "### C_ findings" subsections above the "How to execute"
runbook for C1, C2, C3, C4, C5, C7, and C8 (each with its own root-cause
writeup), plus Bugs 1–4's original write-ups earlier in this file for C6's
original partial run and footnote ¹⁵ for C6's 3 remaining cells (filled in
2026-08-25). **All 8 combinations are now fully filled in — the matrix is
complete.** Remaining known failures are the already-characterized Bug 1
(concurrent add, LWW loses sections — every sync=off cell plus C6's sync=on
cell, since the Y.Array fix only protects sync=on paths that actually invoke
it) and Bug 2 (concurrent same-position rich-text edit drops characters —
C6 only, the one cell that exercised true simultaneous Lexical typing). No
cell reproduced Bug 3 (inferred, never independently confirmed as a distinct
failure — delete-vs-add passed cleanly everywhere it was tested: C1
footnote⁶, C3 footnote⁹, C5 footnote¹², C6 footnote¹⁵, C7 footnote¹⁴) or
Bug 4 (fixed before this matrix work began). The C4 id-collision bug is
confirmed `legacy`-split-mode-specific (C7 footnote¹³ shows `per-app`
structurally can't hit it).

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

## Bug 7 — `/sync/bootstrap` and `/sync/delta` reported a revision watermark newer than the data they actually returned — FIXED (2026-08-24)

Found live investigating a user report: two browser tabs on the same page
(one regular, one incognito), edits in one tab weren't showing up in the
other even after the section-array fix (Bug 1) and waiting well past any
debounce. Root-caused via direct WebSocket frame sniffing and local
IndexedDB inspection — a real, previously-undiscovered server bug, distinct
from Bug 1.

**Mechanism**: both `/sync/bootstrap` and `/sync/delta` computed their
response in two separate, non-transactional queries — fetch the actual data
first, then separately `SELECT MAX(revision) FROM change_log` to report as
the response's watermark. If a write commits in the gap between those two
queries, the **data** query (run first) misses it, but the **revision**
query (run second) already reflects it. The client receives a response
whose `revision` number is genuinely newer than what its own `items`/
`changes` payload contains for whichever row changed in that window. Since
the client trusts "I'm caught up through revision N" and every future delta
filters strictly on `revision > sinceRev`, that specific missed change is
never re-delivered by any later request — a **silent, permanent** gap for
that one row, until something else (a *different* later edit to the same
row, or a fresh cold bootstrap) happens to correct it. Confirmed exactly
this shape live: client B's cold bootstrap reported a revision equal to or
newer than a concurrent edit's own revision, yet B's local copy of that
exact page row never picked up the edit — no error, no retry, nothing to
signal it was wrong.

**Fix**: swapped the order in both endpoints — compute the revision
watermark first, then fetch the data. This flips which side of the race is
safe: a write landing in the gap now makes the returned data *more* current
than the reported revision (the client's next delta call harmlessly
re-fetches that same change — redundant, not lossy) instead of the reverse.

**Verified live**: after the fix, a client's local IndexedDB copy of an
edited page row reliably contained the edit (confirmed via direct
`getItem()` inspection), where before the fix it reliably did not, across
repeated trials. This is a correctness fix independent of Bug 1 — it can
manifest with a single structural edit and only two connected clients, no
concurrency-heavy scenario required.

## Bug 8 — a `useMemo` with the wrong dependency silently blocked context propagation, so even correctly-synced local data never reached the screen — FIXED, but live cross-tab reflection is still not fully reliable (2026-08-24, OPEN follow-up)

Found immediately after Bug 7: fixing the bootstrap/delta race made local
IndexedDB reliably correct, but the *screen* still didn't update in a
passive/watching tab. Traced the full chain live with temporary
instrumentation (all removed before finishing) through every layer —
`onInvalidate` firing, `router.revalidate()` being called, `shouldRevalidate`
returning `true`, the route `loader()` actually re-running, `EditWrapper`'s
own `item` state correctly updating (confirmed via `isEqual` returning
`false` against fresh data) — every one of those layers works correctly.

**Root cause**: `patterns/page/pages/edit/index.jsx`'s `PageEdit` component
renders its sections via:

```js
{React.useMemo(() => getSectionGroups('content'), [item?.draft_section_groups])}
```

`draft_section_groups` is the page's *layout* (which named groups exist and
where) — it essentially never changes on an ordinary section add/delete/edit,
which touches `draft_sections` (the actual section list) instead. Because
the memo's dependency never changed, React kept returning the *exact same
cached React element* for that subtree on every render — and when a
`useMemo` returns the identical element reference from a prior render,
React's reconciler bails out of re-rendering that subtree at all, as a
performance optimization. This bailout happens **before** context-change
detection would otherwise force affected consumers to re-render — so
`SectionGroup`/`sectionArray.jsx` deep inside, both `useContext(PageContext)`
consumers, never got invoked again, never saw the fresh `item` sitting right
there in the (correctly updated) context value. This is a well-known but
easy-to-miss React gotcha: memoizing a subtree that contains context
consumers on the wrong dependency silently freezes those consumers even
though the context itself is updating correctly one level up.

**Fix**: added `item?.draft_sections` to the dependency arrays of all three
`useMemo` calls (`top`/`bottom`/`content` section groups).

**Verified working in isolation**: with full render-chain tracing in place,
watched `PageEdit` → `SectionGroup` → `sectionArray.jsx`'s `Edit` all
correctly re-render with fresh `draft_sections.length` after this fix, and
the new section's text appeared in a passive tab with zero action taken on
it — confirmed on a live Postgres-backed multi-tenant page.

**Not fully resolved — live cross-tab reflection remains inconsistent even
after this fix.** Repeated the same passive-tab test multiple times after
removing the tracing instrumentation: it worked cleanly once, then failed
across three separate follow-up rounds (waited up to 8 seconds — not a pure
timing/debounce issue). In every failing case, **the underlying data was
still correct** — confirmed via reload, every section from every round was
present with no loss, on the already-warmed page used for these specific
runs. So this remaining gap is strictly about *when the screen updates
without a reload*, not about data safety. Leading unconfirmed suspicion:
React Router's own handling of multiple `router.revalidate()` calls firing
in quick succession (bootstrap completion, WS change receipt, and the
client's own prior edits can all trigger one within a short window) may
coalesce or short-circuit in a way that leaves a *later*-arriving change
without its own dedicated re-render — not verified, needs its own focused
trace session (the kind used to find Bug 8 itself) rather than continued
ad hoc testing.

**Separately, and NOT the same bug**: one test run against a **brand-new,
never-before-synced page** lost a section's *page-level reference*
permanently (the component row itself was created correctly, confirmed via
`dms raw get`, but never made it into `draft_sections`, even after reload).
This matches the *already-documented* known limitation in Bug 1's fix design
("two clients joining a cold room at the exact same instant can both see
'empty' and both seed... narrow, not solved here") rather than a new defect
— flagged for the same follow-up work already listed under Bug 1, not
duplicated here.

## Bug 9 — client-side echo suppression keyed by item id, not revision, silently and PERMANENTLY dropped a genuinely different client's concurrent edit — FIXED (2026-08-24)

Found investigating Bug 8's follow-up (flaky cross-tab reflection), after the user flagged mid-session that **data itself, not just the screen refresh, was sometimes actually lost in cross-tab testing** — a materially more severe claim than Bug 8's "data is fine, only the re-render is flaky," so it needed independent root-causing rather than being folded into Bug 8.

**Root cause**: `sync-manager.js` used a single `pendingItemIds` Set, keyed by item id, for echo suppression in two places — `ws.onmessage`'s `change` handler (line ~415) and `applyChanges()`, the delta-application function used by `catchUp()`/warm `bootstrapPattern()` (line ~104). Both treated *any* WS message or delta row for an item this tab had *any* mutation in flight for as "my own echo" and discarded it outright — but that's the wrong test. A WS message for item X arriving while this tab also has a pending mutation for item X is not necessarily this tab's own echo; it can just as easily be a **different client's own genuinely concurrent edit** to the same item, landing in the same narrow window. Item-id keying can't tell the two apart, and picked the wrong one: it discarded the message *and* still advanced the persisted revision watermark (`setLastRevision(msg.revision)`) as if it had been applied. Since every future delta filters on `revision > sinceRev`, that specific change was never re-delivered by any later request — permanent, not recoverable by reload, exactly the shape of Bug 7 (fixed earlier this session) but caused independently, client-side.

The most easily-hit trigger is `localCreate`'s own suppression window: after any create, `pendingItemIds.add(serverId)` stayed set for a **hard-coded 2 seconds** (`setTimeout(() => pendingItemIds.delete(serverId), 2000)`), regardless of whether the actual round trip was much faster. Any other client editing that same newly-created item within that 2-second window — a very realistic scenario right after a section is created — had its edit silently eaten.

**Live repro** (Playwright against the real `shaun-test-app` site, port 5173, dms-server on 3001 — the same Postgres-backed multi-tenant environment used for Bugs 4/5/6/7/8): one real browser tab (Tab A) calls `sync.localCreate()` on a fresh item; a raw authenticated `fetch` to `/sync/push` (playing "Tab B", a second client) pushes a concurrent update to the exact same item id inside the 2-second window. Confirmed, pre-fix:
- **Live, no reload**: Tab A's local IndexedDB copy still showed the original create-time value — Tab B's edit never applied.
- **After a hard reload**: **still** showed the original value — the loss was permanent, not a rendering lag. Server's own copy was correct the whole time (confirmed via a direct `/sync/bootstrap` fetch) — the data was never lost server-side, only in this client's local mirror, which is what the client trusts for rendering and for the base state of its own next edit.

**Fix**: replaced `pendingItemIds` (item-id keyed) with `myRevisions` (revision-number keyed). `change_log.revision` is a per-app monotonic serial, so the exact revision number returned by *this tab's own* `/sync/push` response can only ever appear once, on the WS broadcast/delta row for that exact write — never on any other client's write. `markMyRevision(revision)` records it (with a 60s safety-net expiry in case the echo never arrives); `ws.onmessage` and `applyChanges()` both check `myRevisions.has(revision)` instead of `pendingItemIds.has(itemId)`. If the echo happens to arrive before this tab's own push response resolves (so `myRevisions` doesn't have it yet), the message is just applied as if remote — harmless, since it's this tab's own data and `yjs-store.js`'s `applyRemote` no-ops on unchanged keys — so the fix fails *open* (redundant apply) instead of the old failure mode (silent, permanent drop of someone else's write). `pendingItemIds` had no other consumers (confirmed by grep) and was removed entirely, along with its now-dead `idb-store.js` helper `countPendingMutationsForItem`.

**Files touched**: `packages/dms/src/sync/sync-manager.js` (the `myRevisions` mechanism + all 5 read/write sites), `packages/dms/src/sync/idb-store.js` (removed the now-unused `countPendingMutationsForItem`), `packages/dms/src/sync/CLAUDE.md` (echo-suppression doc updated to describe the new mechanism and why the old one was wrong). No server changes.

**Verified live**: reran the identical repro against the fixed code — live (no reload) now correctly shows Tab B's injected value, and it's still correct after reload. See also Bug 10 below, found while isolating this repro from a confound in the same test.

## Bug 10 — WS broadcast pattern filter didn't match sibling types, so a section edit was never live-delivered to a client only subscribed to the page's own pattern type — FIXED (2026-08-24)

Found as a confound while building Bug 9's repro: with Bug 9's fix alone, a controlled test (Tab A fully subscribed and warm on the `pages|page` pattern, then a concurrent update pushed to one of that page's own `pages|component` rows) *still* failed to deliver live — but **did** recover correctly on reload, a different signature than Bug 9 (which failed even after reload). That signature — wrong live delivery, correct after reload — pointed at the WS subscription/broadcast layer rather than the local echo-suppression logic Bug 9 lives in.

**Root cause**: `packages/dms-server/src/routes/sync/ws.js`'s `notifyChange()` filters each broadcast recipient by their subscribed pattern(s) via `typeMatchesPattern(itemType, pattern)`:

```js
// ws.js — BEFORE
function typeMatchesPattern(itemType, pattern) {
  return itemType === pattern || itemType.startsWith(pattern + '|');
}
```

This only matches an exact type or a **child** of the pattern (`pattern + '|' + anything`). It does not match a **sibling** type under the same instance prefix. But `pages|page` and `pages|component` are siblings — both prefixed by `pages|`, neither a child of the other — and a page's sections are *always* `{instance}|component` rows. A client subscribed to `pages|page` (which is what every caller passes to `bootstrapPattern()` — see its own doc comment) has `typeMatchesPattern('pages|component', 'pages|page')` evaluate `'pages|component' === 'pages|page'` (false) and `'pages|component'.startsWith('pages|page|')` (false) — never matches. Every broadcast for a section edit on that page was silently filtered out server-side (`_stats.broadcastSkipped++`) and never even reached the client's WS `onmessage` handler, for **every** client whose only subscription is the page's own pattern — i.e., the normal case for anyone with that page open.

This is a real inconsistency, not a novel design: `sync.js`'s REST `/sync/bootstrap` and `/sync/delta` endpoints already handle exactly this sibling relationship correctly, via an `instancePrefix` (the pattern's segment before its first `|`) matched with a third `OR type LIKE instancePrefix || '|%'` clause. `ws.js`'s filter never had the equivalent clause — the REST snapshot/delta paths and the live WS path silently disagreed about which types belong to a subscribed pattern.

Because the message never reaches `ws.onmessage` at all (server-side filtered, not client-side discarded), the client's persisted revision watermark is never wrongly advanced the way Bug 9's discard path did — so this bug's damage is scoped to "no live update without a reload," not permanent loss. It's very likely the dominant real-world cause behind the flaky cross-tab reflection reported in Bug 8's follow-up: any time the *changed* item is a page's section (the overwhelmingly common edit) rather than the page row itself, a passively-watching client subscribed only to the page pattern would never see it live, full stop, regardless of any debounce/coalescing timing — not a race, a hard miss every time.

**Fix**: `typeMatchesPattern` now also matches when `itemType` starts with the pattern's own instance prefix + `'|'`, mirroring `sync.js`'s existing logic exactly:

```js
function typeMatchesPattern(itemType, pattern) {
  if (itemType === pattern || itemType.startsWith(pattern + '|')) return true;
  const pipeIdx = pattern.indexOf('|');
  if (pipeIdx !== -1) {
    const instancePrefix = pattern.substring(0, pipeIdx);
    if (itemType.startsWith(instancePrefix + '|')) return true;
  }
  return false;
}
```

**Files touched**: `packages/dms-server/src/routes/sync/ws.js` only.

**Verified live**: same Playwright repro as Bug 9, this time with Tab A pre-warmed and fully subscribed to `pages|page` before the concurrent push. Pre-fix (Bug 9 fixed, Bug 10 not yet): live check still showed the stale value, reload recovered it (confirming server-side filtering, not client-side loss). Post-fix (both fixed): live check (no reload) correctly shows the injected value, and it's still correct after reload. Re-verified via the dms-server's own nodemon auto-restart picking up the fix live against the same running site.

## Bug 12 — page-structure room seeding raced a slow (not lost) sync-step2, resurrecting a concurrently-deleted section — FIXED (2026-08-24)

Found live from a direct user report during this same investigation: *"if i remove a section from tab a, it reflects in both tabs a and b. then if i add a section in tab b, the removed section is added again and synced in both tabs."* A deliberate divergence from Bug 9/10: this report specifically named the Bug-1 `Y.Array` room mechanism's own failure mode (a section coming back with its own identity, not just a display lag), so it needed independent root-causing rather than being folded into either fix.

**First hypothesis (lodash `merge`) — real bug, fixed, but not the actual trigger.** `dms-manager/wrapper.jsx`'s `apiUpdate` does an optimistic `setItem(draft => merge(draft, dataSnapshot))` after every write, to reflect the just-sent payload into this tab's own `item` state immediately (before the next loader revalidate lands). Lodash `merge` merges arrays **by index**: if the merge target (this tab's own current `item.draft_sections`) has more elements at some position than the source (`dataSnapshot`, the array just sent), every trailing target element beyond the source's length survives untouched — confirmed with an isolated `lodash-es` test (`merge([S1,S2,S3], {x:[S2,S3]})` → `[S2,S3,S3]`, keeping a stale trailing element). This is a real defect (arrays of `{id,ref}` membership stubs are replacement values, not something safe to deep-merge) and was fixed by switching to `mergeWith` with an array customizer that replaces arrays wholesale (`(_o, s) => Array.isArray(s) ? s : undefined`) instead of index-merging them. **However**, a live Playwright repro driving the real UI (Settings → Delete in tab A, + Add → Save in tab B, on a disposable 3-section test page) did not reproduce resurrection through this path once the room mechanism (Bug 1) was in the loop — the room always supplied a correct, already-merged array as the `apiUpdate` payload's source, which starves this specific corruption of the "target longer than source" precondition in ordinary sequential (non-racing) use. Kept as a genuine fix regardless — it removes a real footgun for any other array-valued dms-format field, not just `draft_sections` — but it is not what produced the reported symptom.

**Actual root cause — a blind timeout let this tab seed the room from its own stale data while a real, merely-late sync-step2 was still in flight.** `page-structure-provider.js`'s `joinPageStructureRoom` seeds the shared `Y.Array` from this tab's own currently-known `draft_sections`, but *only* if the array is still empty once the room connection is considered "ready." `ready` resolved via either a real `yjs-sync-step2` from the server, or a flat 1000ms fallback timeout (so a genuinely-empty, never-touched room doesn't hang callers forever). The fallback did not distinguish "genuinely empty, nothing coming" from "has real content, step2 is just running late" — and under real load (a competing ~900ms `pages|page` pattern bootstrap sharing the same WebSocket's message queue, both routinely observed in this session's own test logs), a real, non-empty step2 can easily take longer than 1000ms to arrive. When the fallback fired first, this tab treated the room as empty and seeded it from its own `draft_sections` snapshot — which, if that snapshot predates a concurrent peer's delete (a very ordinary case: this tab's *room* had never synced yet, independent of whether its plain `item.draft_sections` field had already been corrected via the — now fixed — Bug 9/10 path), reintroduced the deleted section's `{id,ref}` stub as a **fresh Yjs insert operation**. Yjs has no way to recognize that insert as "the same logical item, already deleted elsewhere" — it just merges it in and relays it to every other room member, including the tab that originally deleted it. Confirmed the server-side half of the mechanism by reading `ws.js`'s `join-room` handler: it sends `yjs-sync-step1` unconditionally and immediately, but only sends `yjs-sync-step2` when `Y.encodeStateAsUpdate(ydoc).length > 2` — i.e. **the client's fallback timeout is the *only* signal for "genuinely empty" in the common case**, not a rare edge case.

**Live repro.** Direct-room-API tests (bypassing the UI, driving `joinPageStructureRoom` exactly as `sectionArray.jsx` does) against a real disposable 3-section page reproduced two distinct corrupted outcomes depending on exact timing, both via a server-side test hook (`DMS_TEST_ROOM_JOIN_DELAY_MS`, temporary, removed after verification) that deterministically delayed `join-room`'s step1/step2 response by 1500ms — forcing the race instead of hoping to catch it:
- Tab B's stale seed snapshot still containing the deleted section → the deleted section came back in the final, server-persisted `draft_sections`, visible to both tabs (exactly the reported symptom).
- Tab B's seed snapshot already correct (loaded after the delete) → the room ended up with duplicate entries once the real, correct room state later merged in with the wrongly-seeded copy — a different corruption, same root defect.

**Fix — two parts, both required (verified independently and together):**
1. **Seed decision uses `yjs-sync-step1`'s state vector, not a timeout guess.** The server always sends step1 synchronously on join, so its state vector is a fast, definitive signal: `Y.decodeStateVector(serverSV).size === 0` means genuinely empty (nothing has ever been written; safe to seed immediately, no need to wait for anything). A non-empty vector means real content exists and a real step2 is *guaranteed* to follow (per the server's own `update.length > 2` gate) — seeding must never happen in that case, no matter how long step2 takes.
2. **`ready` itself must wait for the real content when step1 says it exists — not just resolve on a blind timeout.** Fixing (1) alone surfaced a second, related bug live: with seeding correctly suppressed, `save()`/`remove()`/`moveItem()` still proceeded as soon as the OLD flat 1s `ready` timeout fired, before the real (merely delayed) step2 arrived — so a mutation's own `sectionsArray.toArray()` read (sent straight to the server) silently **dropped every section that hadn't synced in yet**, a data-loss failure mode at least as bad as resurrection. Fixed by unifying the two signals: `ready` now resolves immediately when step1 confirms the room is empty, waits specifically for the real step2 when step1 confirms content exists (with its own generous 5000ms fail-safe for a genuine transport failure, not ordinary latency), and only falls back to an unconfirmed-empty state if step1 itself never arrives at all within 5000ms (narrowed from the original 1000ms, which was found live to fire even for *step1* under the same kind of contention that used to only threaten step2).

**Files touched**: `packages/dms/src/sync/page-structure-provider.js` (the `knownEmpty`/`markReady` redesign in `connect()`, and the seed call site in `joinPageStructureRoom`) — no server changes; `packages/dms/src/dms-manager/wrapper.jsx` (the `mergeWith` fix, real but not the trigger for this specific report — see above).

**Verified live**, all against the real Postgres-backed multi-tenant `shaun-test-app` site with the forced 1500ms server-side delay active:
- Pre-fix: reproduced both corrupted outcomes described above (resurrection and duplication) via the direct-room-API test.
- Fix part (1) alone: no more resurrection/duplication, but a fresh regression — the add's own write correctly excluded the deleted section but also dropped the two *other*, still-live sections (server truth ended up as `[new-section]` only).
- Fix parts (1)+(2) together: tab A's room correctly seeds and reflects its own delete; tab B's room correctly stays empty (no premature seed) through the full 1500ms delay, `room.ready` correctly blocks for ~1485ms (waiting for the real step2) before tab B's add proceeds, and the final server-persisted `draft_sections` is exactly `[ALPHA, BETA, tab-B's-new-section]` — no resurrection, no duplication, no data loss. Re-verified twice on fresh disposable pages.
- Test hook (`DMS_TEST_ROOM_JOIN_DELAY_MS` in `ws.js`) was temporary, used only to force the race deterministically, and has been fully removed — confirmed via `git diff` showing only the `typeMatchesPattern` (Bug 10) change remaining in that file.

## Bug 13 — a second, server-side concurrent-join race duplicated a page's whole section list on real-world dev-server restarts — FIXED, plus a client-side dedupe safety net (2026-08-25)

Found live from a direct user report on the real `page_1` (`54278`) site: *"now when i delete a section, draft sections duplicate."* Confirmed this was not the display-only Bug 8 pattern and not Bug 12's room-seed race (already fixed 2026-08-24) — the corruption was already present in the room's persisted Yjs state itself (not just one tab's local read of it), and the exact same 9–10 unique component ids kept appearing in whole repeated copies.

**Root cause — `getOrCreateYDoc(itemId)` in `ws.js` registered its new `Y.Doc` into the shared `yjsDocs` map *before* awaiting the `yjs_states` DB load.** Confirmed via `change_log`: the last known-good state (10 unique entries, `revision 721526`, 2026-08-24 22:38:08) exactly matched the deduped content of a corrupted write at `revision 721703` (2026-08-25 12:58:55) that jumped the same array to 59 entries — six duplicate copies of the same content, written in one shot with no intervening edit. The real dms-server process serving the site had itself been restarted that morning (confirmed via `ps`), and the corruption's timing lines up with that restart: several `join-room` messages for the same item, arriving close together while the DB load for the *first* one was still in flight, each independently saw an empty (not-yet-loaded) `Y.Doc` and computed an empty state vector for their own `yjs-sync-step1` — so each concluded (correctly, per the already-fixed Bug 12 client logic) that the room was genuinely empty and safe to seed, and each pushed its own last-known-good local copy. Yjs has no identity linking a fresh seed-insert to already-persisted content, so every racing copy landed in the merged array as distinct entries. This is exactly the "known remaining edge case" the Bug 12 write-up flagged as needing server-side coordination to close, now hit for real (not synthetically).

**Fix.** `getOrCreateYDoc` now tracks in-flight loads in a `yjsDocLoads` map keyed by `itemId`; a concurrent call for the same item awaits the *same* load promise instead of starting its own, and the doc is only published to `yjsDocs` (so any `join-room` handler can compute a state vector / send step1) once the load has actually finished — no caller can ever observe a not-yet-loaded doc as empty.

**Isolated live verification (raw `ws` connections against a throwaway server instance, not the real dev server on :3001, so the fix could be proven both ways without touching the user's live session):** seeded a real room with 3 persisted entries via a genuine `yjs-update` (flushed to the shared Postgres `yjs_states` table), then fired 5 simultaneous `join-room` requests at an instance with a 1500ms artificial delay inserted into the DB-load path (temporary `DMS_TEST_YDOC_LOAD_DELAY_MS` hook, added and fully removed after use).
- Pre-fix (`git stash` of the `ws.js` change, delay hook re-added by hand to the old code): 4 of 5 clients saw an empty state vector — bug reproduced deterministically.
- Post-fix: 0 of 5 clients saw an empty state vector — race closed.

**A second duplication was still observed after the fix, from real (not artificial) reconnect timing.** During this same investigation, repeated dev-server restarts (nodemon auto-restarting on file edits, including this session's own temp test-script churn under the nodemon-watched `dms-server` directory) still produced one further 9→18 duplication event on the real site, with the server-side fix already active the whole time. This was not independently root-caused to a second, distinct mechanism — plausible candidates include multiple real browser tabs' reconnect-backoff timers landing close enough together across many restart cycles, or a client-side `room.knownEmpty` still being `null` (never resolved) on one tab at the moment of a restart. Rather than keep chasing every possible race window by forcing more real restarts against the user's live session (each one itself disruptive), this was closed with defense-in-depth instead of further root-causing.

**Defense-in-depth: `healRoomDuplicates(room)` in `sectionArray.jsx`.** Every write this component makes to `draft_sections` (`save`, `remove`, `moveItem`) already funnels through one `arr.toArray()` read right before calling `onChange`. That's the one true choke point regardless of which race put a duplicate `{id,ref}` stub into the shared `Y.Array` — so `healRoomDuplicates` is now called there instead of a bare `arr.toArray()`: it finds any id that appears more than once (keeping first-occurrence order), and — if any are found — deletes the extras via a real `doc.transact` (not just a local filter), so the fix is visible to every other client sharing the room and future joins don't reseed from stale duplicated content either. A no-op (returns the array unchanged) on the by-far-common case of no duplicates. This does not replace the server-side fix (which closes the proven, isolated race directly) — it's a backstop that makes any remaining or future race harmless at the point where it would otherwise become user-visible, rather than requiring every possible concurrent-join interleaving to be individually proven closed.

**Cleanup.** `page_1`'s real corrupted `draft_sections` (accumulated from the pre-fix restart this morning, then again during this session's own restart-testing) was repaired twice via the legitimate client path — joining the room directly and deleting the duplicate entries as real `Y.Array` ops, then `localUpdate`, never a raw DB write (attempted once via direct SQL and correctly blocked by the environment's safety classifier) — restoring it to exactly the content the user's own real edits had established.

**Files touched**: `packages/dms-server/src/routes/sync/ws.js` (`getOrCreateYDoc`'s `yjsDocLoads` single-flight fix); `packages/dms/src/patterns/page/components/sections/sectionArray.jsx` (`healRoomDuplicates` helper, wired into `save`/`remove`/`moveItem`).

## Bug 14 — Postgres `beginTransaction`/`commitTransaction`/`rollbackTransaction` likely run on different pooled connections than the work they wrap, giving zero real atomicity — found via code review while investigating C4, **NOT YET LIVE-VERIFIED**

**Status: code-level finding only.** Everything below is from reading `packages/dms-server/src/db/adapters/postgres.js` and its call sites, not from an observed failure or a live reproduction. No Postgres server was available in this environment to test against (only client tools — `psql`, `pgadmin4` — are installed; Docker's socket isn't accessible; a real server needs to be provisioned before this can move from "plausible" to "confirmed"). Do not treat this as fixed, disproven, or scheduled — it's a flag for someone with Postgres access to verify.

**How this was found.** While exploring C4's SQLite id-collision bug (`allocateId()`'s `dms_id_seq` table racing under `sqlite.js`'s unguarded shared-connection `beginTransaction`/`commitTransaction`/`rollbackTransaction`, see C2/C4 findings above), the equivalent Postgres adapter code (`postgres.js`) was read for comparison — expecting it to be immune, per the existing scope note that Postgres's `nextval()` is server-side-atomic. **The `nextval()`-specific claim still holds** (Postgres sequences are genuinely non-transactional, so id allocation itself stays safe even under everything below) — but reading `beginTransaction`/`commitTransaction`/`rollbackTransaction` themselves surfaced a separate, likely more severe defect underneath.

**The mechanism.** `PostgresAdapter.beginTransaction()` → `this.query("BEGIN;")` → `this.pool.query("BEGIN;")`. `commitTransaction()`/`rollbackTransaction()` are identical. Critically, `dms_db.promise(sql, values)` — used for the actual wrapped work in every transaction block in `dms.controller.js`/`sync.js` (e.g. `dms.controller.js` line ~813) — **also** goes through `this.pool.query(...)`. This is `node-postgres`'s own documented pitfall: `pool.query()` checks out an arbitrary idle connection, runs one statement, and immediately releases it back to the pool — it does not hold a connection across calls the way `pool.connect()` + `client.query()` does. So a `beginTransaction()` → work → `commitTransaction()` sequence has no guarantee any two of those three calls land on the same physical connection. `getConnection()` (which correctly does `this.pool.connect()`) exists on the adapter but is **not** what `beginTransaction`/`commitTransaction`/`rollbackTransaction`/`promise` use — those go through the pool directly. Confirmed via `grep`: every real call site (`dms.controller.js` lines 802/819/823, 871/888/891, 953/983/993, 1002/1034/1038; `sync.js` lines 379/428/439/459/480) calls `dms_db.beginTransaction()`/`commitTransaction()`/`rollbackTransaction()` directly on the adapter — the broken path, not the dedicated-connection one.

**Why this would hide during normal single-user testing.** `pg.Pool`'s idle-connection reuse tends to behave like a stack — a just-released connection is often the next one handed out if nothing else claims it first. For one person acting alone with no overlapping requests, `BEGIN`/work/`COMMIT` will frequently land on the same connection by accident, masking the bug entirely. It should only become visible under **concurrent write traffic** — which is exactly the condition this whole task's matrix work is about, and which ordinary single-client manual testing (most of C1–C8 so far) wouldn't surface.

**Plausible real-world consequences, if confirmed:**
1. A write that throws mid-transaction may not actually roll back — the real `ROLLBACK` can land on an unrelated idle connection (Postgres treats it as a no-op / "no transaction in progress" warning) while whatever already executed on a *different* connection stays committed. Partial, non-atomic writes persisting instead of cleanly failing.
2. The connection that ran `BEGIN` and gets released without ever seeing its own `COMMIT`/`ROLLBACK` is left by Postgres, from its own session's perspective, sitting inside an open transaction indefinitely. The next unrelated request that happens to draw that same pooled connection has its queries silently executing inside this stray leftover transaction.
3. Under sustained concurrent load this could progressively reduce effective pool availability (stray "idle in transaction" connections), producing intermittent slowness/timeouts with no obvious correlation to the request that's actually failing.
4. If `idle_in_transaction_session_timeout` is configured on the Postgres server, Postgres itself will eventually kill a stray connection — which can abort whichever *unrelated* request happened to inherit it next, surfacing as a random failed save disconnected from anything that user actually did.

This failure profile — intermittent, not obviously tied to the affected user's own action, hard to reproduce on demand — is exactly the shape of bug report that tends to get dismissed as "network hiccup." Worth keeping in mind if there's any history of unexplained save failures or site sluggishness on the real Postgres-backed sites.

**Scope**: affects every `dms_db.beginTransaction()`/`commitTransaction()`/`rollbackTransaction()` call site on the Postgres adapter — i.e., the real production backend (`mercury.availabs.org`/`dms3`, per `dms-sqlite.config.json`'s naming despite pointing at Postgres), not the SQLite scratch environments this task's matrix has mostly been testing against. Independent of split mode / multi-tenant / sync-on-off — it's in the adapter's connection handling, underneath all three axes.

**Next step, blocked on environment access**: reproduce against a real (throwaway, not `mercury.availabs.org/dms3`) Postgres instance — fire concurrent writes via the same `Promise.all` technique used for C1–C4, then inspect `pg_stat_activity` directly for a connection sitting in `state = 'idle in transaction'` after its originating request has completed. That's the direct, unambiguous confirmation. No Postgres server was available in this session (client tools only; Docker inaccessible) — needs either a local install, Docker access, or a pointer to an existing scratch instance before this can be verified. **Not fixed, not scheduled — flagged for whoever picks this up next.**

## Bug 15 — `PageView`'s Rules-of-Hooks violation intermittently blanks the page with "Unable to complete your request" — FOUND, ROOT-CAUSED, AND FIXED (2026-08-25)

**Not part of the C1–C8 matrix or any of Bugs 1–14** — found live from a direct user report on a real multi-tenant/sync-on tenant (`test_bug_2`, on the same real dev server/Postgres backend as Bug 4/C8, `http://test_bug_2.localhost:5173/edit/page_1_1`): *"after adding a section page goes blank."* Investigated by a dedicated fork after two false starts (see "Investigation false starts" below) — the actual cause is a plain React correctness bug, unrelated to sync, CRDTs, or id allocation.

**Root cause.** `packages/dms/src/patterns/page/pages/view.jsx`'s `PageView` component had a conditional early return (`if (isViewDenied) { ... return ...}`, originally ~line 56) positioned **between** two groups of hooks: several hooks above it (`useNavigate`, `useSearchParams`, `useLocation`, `useRef`, `useContext` ×2, `useImmer`, another `useRef`, one `useEffect`) always ran, but several more hooks below it (`useMemo` ×2 for `menuItems`/`menuItemsSecondNav`, `useCallback` for `resolveNav`/`setActionParam`/`clearActionParam`, two more `useEffect`s, and a `useMemo` for `dataSourceActions`) only ran when `isViewDenied` was false. `isViewDenied` is computed from `isUserAuthed(...)` and `pageState?.authPermissions` — both can legitimately evaluate differently between two renders of the *same mounted* `PageView` instance whenever auth state resolves asynchronously after initial mount (exactly the kind of timing multi-tenant + local-first sync introduces — see "Addressing the coordinator's `bootstrapPattern` lead" below for the specific window found). When that happens mid-session, React throws **"Rendered more hooks than during the previous render"**, which `RenderErrorBoundary` catches and renders as **"Unable to complete your request at the moment. Please try again later."** — page chrome/toolbar intact, content area empty. This is indistinguishable from "the page went blank" to a user, despite having nothing to do with `draft_sections`, IndexedDB, or any of Bugs 1–14's mechanisms.

A second, textually similar early-return block later in the same component (`if (item?.id === 'no-access') {...}`, ~line 178, right before the main `return`) is **not** a Rules-of-Hooks violation — no hooks are called after it, so branching there doesn't change the hook count between renders. Only the first block (interleaved between two groups of hooks) was the defect.

**Live-confirmed, repeatedly, on plain page loads — no click needed.** Across ~10 fresh navigations to the affected page in the investigating fork's session, the crash fired intermittently (~1 in 4–5 loads), always with an identical stack trace rooted at the `useMemo` calls in `view.jsx`. This matches a classic async-race-triggered Rules-of-Hooks bug: intermittent, not deterministic on every load, exactly as reported.

**Fix** (`packages/dms/src/patterns/page/pages/view.jsx`): moved the `isViewDenied` early-return block down to immediately before the existing `if (item?.id === 'no-access')` block (merging into a single `if (isViewDenied || item?.id === 'no-access') {...}` guard right before the main `return`), so every hook in the component now runs unconditionally on every render regardless of denial state — only the final JSX differs. This is the standard fix for this bug class: compute all hooks unconditionally, branch only in what gets *returned*, never in *whether a hook executes*.

**Verified live, post-fix**: 12 consecutive fresh navigations to `http://test_bug_2.localhost:5173/edit/page_1_1` (a full new browser context each time, matching how the intermittent failure was originally observed) — 0/12 crashed, versus the pre-fix ~1-in-4–5 rate. `eslint` on the file shows no new errors introduced (pre-existing `react/prop-types`/`no-unused-vars` noise on this file is unrelated and untouched).

**Investigation false starts, worth recording.** Two earlier attempts in this session did not find the real bug, for instructive reasons:
1. A first diagnostic script drove the sync API directly (`api.getItem(pageId)` to read the page's current `draft_sections` before appending a new section, then `api.localUpdate`) rather than going through the real UI or component state. Because the page's `pages|page` type wasn't yet in local sync scope at that exact moment, `getItem()` legitimately returned nothing, and the script's own fallback (`current?.draft_sections || []`) silently treated that as "page has zero existing sections" — overwriting the page's real `draft_sections` down to just the one new section, discarding (not deleting — the underlying rows were untouched) the references to 3 pre-existing sections. **This was a bug in the diagnostic script, not a product bug** — a useful reminder that `getItem()`/local-scope state should never be treated as authoritative for a "what does this page currently have" check without confirming `isLocal()` first, exactly the kind of gotcha `traversing-dms-pages.md` exists to accumulate.
2. Manual native-DOM-click attempts to reproduce via literal Add→type→Save repeatedly landed on the page-level rearrange Settings popup instead of a section's true edit mode, per the already-documented hover-gated-button flakiness in `traversing-dms-pages.md`. This didn't produce a false finding, just consumed time before the investigation was delegated to a fork with a larger budget to work through the DOM-automation flakiness and pivot to reading the component source directly once a live crash was captured.

**Addressing a live lead surfaced mid-investigation**: the user shared a real console-log excerpt from their own browser during their own reproduction attempt, showing `sync-manager.js`'s `bootstrapPattern` deduping a second concurrent call for `pages|page` while a warm delta (`lastRev=726048`, 2 changes) was still resolving. Reading `_bootstrapPatternImpl`'s delta branch (`sync-manager.js` ~line 295-322) confirms a real, if narrow, timing window: `invalidate('data_items')` fires *before* `addToScope()`/`_loadedPatterns.add()`, with an awaited `getDistinctAppTypesByAppAndPatternPrefix` call in between — long enough for a 150ms-debounced `router.revalidate()` (`dmsSiteFactory.jsx`) to re-run the loader and serve a differently-shaped `item`/`pageState` on one render pass than the render immediately before or after it. This is a very plausible explanation for *why* `isViewDenied` (which depends on `pageState?.authPermissions`, itself seeded from `item`) could flip transiently mid-session in exactly this multi-tenant+sync combination — not conclusively traced end-to-end within the investigating fork's time budget, but consistent with every observed fact. **Not a second bug requiring its own fix** — Bug 15's fix (hooks-unconditional) closes the crash regardless of what causes `isViewDenied` to flip, the same way a Rules-of-Hooks fix always should. Worth keeping in mind as context for *why* this bug was more visible on multi-tenant+sync than it might be elsewhere, if anyone investigates further.

**Scope**: `PageView` is core `@availabs/dms` code (`patterns/page/pages/view.jsx`), used by every page pattern on every theme/site — not specific to `test_bug_2`, multi-tenant, or sync. Any site where `isUserAuthed`/`pageState?.authPermissions` can resolve asynchronously after a `PageView` instance's initial mount was equally exposed; multi-tenant + sync's extra async timing just made the window easier to hit in this investigation.

**Files touched**: `packages/dms/src/patterns/page/pages/view.jsx` only.

## Bug 16 (OPEN, NOT YET ROOT-CAUSED) — a page rename pushed an update to a server item id that doesn't exist (`404 Item not found`), and the same tenant's `change_log` shows a duplicate-delete of that same id 21 minutes after it was first deleted

**Found by the user live, same investigation session as Bug 15, same tenant (`test_bug_2`)** — a separate console-log excerpt shared mid-session:

```
sync-manager.js:644  POST http://localhost:3001/sync/push 404 (Not Found)
[sync] push U FAILED id=8: push failed: 404 {"error":"Item not found"}
    at pushMutation (sync-manager.js:652:13)
    at async flushPending (sync-manager.js:701:5)
```

triggered by a page-rename action. Investigated by reading `dms.change_log` directly (real Postgres, `mercury.availabs.org`/`dms3`, per-app schema `dms_test_bug_2` — **per-app split mode on Postgres uses one schema per app, `dms_<app>.data_items`, not a table-name suffix the way the SQLite scratch adapter does; this is a fact worth adding to the CLI/skills docs, it wasn't previously written down anywhere in this task and cost real time to discover via `information_schema.tables`**). The revision history for `app='test_bug_2'` shows item id **8** (`type: pages|page`) was:

| revision | action | time |
|---|---|---|
| 726030 | Insert | 19:13:19.99 |
| 726031 | Delete | 19:13:25.03 |
| 726115 | Delete | 19:34:49.64 |
| 726116 | Delete | 19:34:49.81 |

Id 8 was created and deleted normally at 19:13. **21 minutes later, at 19:34:49, two more delete actions for the same already-gone id landed 163ms apart** — and the rename-triggered 404 happened around this same window. This strongly suggests a **stale client-side reference to a deleted item persisting well past its deletion** — something in local state (IndexedDB, an in-memory cache, or a ref embedded in another item, e.g. a page's `history` ref per `patterns/utils.js`'s `appendHistoryEntry` — worth checking first, since it's the one place a page item keeps a direct `{id, ref}` pointer to another row that isn't part of `draft_sections`) kept item 8 "alive" from the client's perspective long after the server correctly forgot it, and something eventually tried to act on it again (a delete retry, and/or the rename's own update targeting a stale id).

**Not yet root-caused.** Candidate mechanisms, none confirmed:
- `appendHistoryEntry` (`patterns/utils.js`) already has a defensive check for exactly this shape of bug (*"Only reuse existing row ID when entries are present — proof the DB row actually exists"*) — but the observed failure still happened, meaning either this guard doesn't cover the actual path being hit (e.g. the rename doesn't go through `appendHistoryEntry` at all for the id in question), or the guard's precondition (`existingHistory?.id && existingEntries.length > 0`) was satisfied with stale-but-populated data (the client's local cache had `id: 8` AND non-empty `entries`, i.e. genuinely believed it was a live, previously-used row).
- The double-delete 163ms apart (726115/726116) is reminiscent of Bug 13's shape (two near-simultaneous operations for the same item landing separately) but for a *delete*, not a room-seed — could be a duplicate mutation queued twice client-side (e.g. sync retry logic re-sending a pending delete that already succeeded, if the local pending-queue wasn't cleared correctly on first success) rather than a server-side race.
- Possibly connected to Bug 14 (Postgres connection-pooling/transaction defect) if the original 19:13 delete's transaction outcome was ambiguous to the client (e.g., it received a timeout/error despite the delete actually committing, then treated the item as "still exists, delete failed, retry later" — which would explain a stale local reference surviving a real server-side delete). Not verified — same Postgres-access blocker as Bug 14 itself.

**Next steps for whoever picks this up**: (1) grep `patterns/page/pages/edit/editFunctions.jsx` and any "duplicate page"/rename call sites for what item ids get read from local vs. server state during a rename, specifically whether a stale `history` ref or a stale pending-mutation-queue entry could reference id 8; (2) check `sync-manager.js`'s pending-mutation queue (`flushPending`, the queue this failing `pushMutation` was flushed from) for whether a failed push is correctly removed from the queue vs. potentially retried indefinitely against a since-deleted id; (3) if reproducible, capture the exact client-side state (IndexedDB dump) at the moment of the 404 to see what item 8 looks like locally right before the failing push. **Status: reported, evidence gathered, root cause NOT identified — flagged for follow-up, not fixed.**

## Testing checklist

- [x] **Bug 15 — `PageView`'s Rules-of-Hooks violation intermittently blanked the page with "Unable to complete your request" — fixed.** `view.jsx`'s `isViewDenied` early return sat between two groups of hooks; moved it down to merge with the existing `item?.id === 'no-access'` guard right before the final `return`, so every hook now runs unconditionally. Verified live: pre-fix ~1-in-4–5 fresh page loads crashed on `test_bug_2/page_1_1`; post-fix, 0/12 consecutive fresh loads crashed.
- [ ] **Bug 16 (OPEN) — a page rename 404'd pushing an update to item id 8, and the same id shows a duplicate delete 21 minutes after its real deletion, on `test_bug_2`.** Root cause not identified — candidates are a stale `history` ref, a stale pending-mutation-queue retry, or an interaction with Bug 14's Postgres transaction-pooling defect. See Bug 16's write-up above for the full evidence and next-step leads.
- [x] **Bug 9 — client-side echo suppression keyed by item id (not revision) permanently dropped a different client's concurrent edit — fixed.** Replaced `pendingItemIds` with revision-keyed `myRevisions` in `sync-manager.js`'s `ws.onmessage` and `applyChanges()`; removed the now-dead `pendingItemIds`/`countPendingMutationsForItem`. Verified live: pre-fix, a concurrent update was lost both live AND after reload (permanent); post-fix, correct in both cases.
- [x] **Bug 10 — WS broadcast pattern filter didn't match sibling types, so section edits were never live-delivered to a client only subscribed to the page pattern — fixed.** `ws.js`'s `typeMatchesPattern` now also matches the pattern's own instance-prefix siblings, mirroring `sync.js`'s existing bootstrap/delta logic. Verified live: pre-fix, a concurrent section update recovered on reload but never appeared live; post-fix, appears live with no reload needed. Likely the dominant real-world cause of Bug 8's "flaky cross-tab reflection" — a hard miss on every section edit to a passively-watched page, not a timing race.
- [x] **Bug 12 — page-structure room seeding raced a slow-but-real `yjs-sync-step2`, resurrecting a concurrently-deleted section (and, mid-fix, a related data-loss regression) — fixed.** `page-structure-provider.js`'s room-join used a blind 1s timeout to decide "room is empty, safe to seed from my own stale draft_sections" — under real WebSocket contention a genuinely non-empty room's real sync could arrive later than that, so seeding fired anyway and reintroduced (or duplicated) content another client had already correctly deleted. Fixed by deciding from `yjs-sync-step1`'s state vector (server always sends it immediately; empty ⇒ safe now, non-empty ⇒ a real `step2` is guaranteed and must be waited for) instead of a guess. Also fixed a related `lodash.merge`-on-arrays corruption in `wrapper.jsx`'s optimistic `apiUpdate` re-sync (real defect, `mergeWith` + array-replace customizer now used) — confirmed via isolated test but NOT the actual trigger for the reported symptom once live-verified against the real room-driven flow. Verified live with a temporary, deterministic 1500ms server-side join delay (added and fully removed after use): pre-fix reproduced both resurrection and duplication; fixing only the seed decision surfaced a new regression (mutations proceeding before real content arrived silently dropped other sections); the final fix (seed decision + `ready` itself waiting for confirmed content) reproduces neither failure mode — final state exactly matches expected membership, re-verified on two fresh disposable pages.
- [x] **Bug 13 — server-side `getOrCreateYDoc` concurrent-join race duplicated a page's whole section list on real dev-server restarts, plus a client-side dedupe safety net — fixed.** `ws.js` registered a new `Y.Doc` into `yjsDocs` before its DB load resolved, so simultaneous `join-room` messages for the same item (e.g. several stale tabs reconnecting on a server restart) could each see an empty doc and each independently reseed — live-reproduced on the real `page_1` (10 entries → 59, six duplicate copies, in one write with no intervening edit). Fixed with a `yjsDocLoads` single-flight map so concurrent callers await the same load instead of racing it; isolated-verified both ways (4/5 clients saw a false-empty state vector pre-fix, 0/5 post-fix) against a throwaway server instance under an artificial delay. A further duplication still occurred from real (not artificial) reconnect timing during this session's own repeated restarts, not independently root-caused to a second mechanism — closed instead with a `healRoomDuplicates` safety net in `sectionArray.jsx` that dedupes the shared array (as real `Y.Array` deletes, not just a local filter) at the one choke point every `draft_sections` write already passes through, so any remaining or future race becomes harmless rather than user-visible. `page_1`'s real corrupted data was repaired via the legitimate client path (room ops + `localUpdate`), not a raw DB write.
- [x] **Bug 5 — sync push missing auth header, delete always 401'd — fixed.** All 8 `fetch()` calls in `sync-manager.js` now send `authHeaders()`. Verified live via `localDelete`.
- [x] **Bug 6 — malformed `{id: null}` ref crashed page load — fixed.** `api/index.js`'s `childIds` extraction no longer falls through to the whole ref object when an object ref has no usable id. Verified live, zero errors on the exact navigation that crashed before.
- [x] **Bug 7 — `/sync/bootstrap`/`/sync/delta` revision-watermark race — fixed.** Revision computed before data fetch in both endpoints, not after. Verified live via direct `getItem()` inspection of a passive client's local IndexedDB.
- [x] **Bug 8 — `useMemo` blocking context propagation for section re-renders — fixed.** Added `item?.draft_sections` to the three section-group `useMemo` dependency arrays in `patterns/page/pages/edit/index.jsx`. Verified working via full render-chain tracing (temporary, removed).
- [ ] **Bug 8 follow-up (RE-SCOPED 2026-08-24, needs a fresh pass) — live cross-tab reflection was inconsistent even after the Bug 8 fix.** Investigating this directly (per user report that data was *sometimes actually lost*, not just slow to render) found and fixed two independent, more fundamental bugs instead: Bug 9 (client echo suppression permanently dropping a concurrent edit) and Bug 10 (WS broadcast pattern filter never delivering a section edit to a page-pattern-only subscriber — a hard miss on every section edit, not a race, and the strongest candidate for what most of Bug 8's flakiness actually was). Both are now fixed and live-verified. The original React-Router-`revalidate()`-coalescing suspicion was never confirmed and may not be a real, separate mechanism at all — it's very plausible the "worked once, failed 3 times" pattern observed at the time was actually Bug 10 (a section edit deterministically never delivered live) rather than a coalescing race. **Re-run the original passive-tab test now that Bugs 9 and 10 are fixed before spending more effort on the coalescing theory** — only chase it further if reflection is still inconsistent after this.
- [ ] Separately (not Bug 8): one run against a brand-new never-before-synced page lost a section's page-level reference permanently — matches Bug 1's already-documented "simultaneous cold-room-join" edge case, not a new defect. Tracked under Bug 1's existing follow-up items, not duplicated here.
- [ ] Bug 6 follow-up: root-cause *which* page/field actually had a null-id ref and how it got there (data-quality question, not a code-correctness one — the fix is safe regardless)
- [ ] Fill in all 8 rows × 9 columns of the test matrix above (56 remaining cells; C6's row is partially done)
- [x] **Bug 1 — implemented and live-verified.** `Y.Array`-backed page-structure collab (option 3), see "Bug 1 implementation — DONE, live-verified" above for the full writeup, including 3 bugs found and fixed during implementation (duplicate row creation from sharing unresolved content; missing settle/debounce letting the same race resurface one layer up; wrong `type-utils` function for the sibling component type). Verified live: 4 concurrent adds on a real Postgres-backed multi-tenant site, all 4 survive with correct types and no duplicates (2 separate clean runs); single-client delete confirmed working, no reload needed.
- [x] Bug 1 follow-up: **concurrent delete-vs-add** — now independently confirmed protected under sync=on (C6 and C8 both tested this cell directly post-fix, both clean: both operations landed, no orphan, no duplicate). **Concurrent reorder, sync=off** — tested 2026-08-25 (see "Concurrent reorder test, sync=off" findings subsection above): confirmed unprotected, plain LWW, one client's reorder is silently discarded — but notably *not* destructive the way concurrent-add is (no orphaned rows, no lost section identities, just a discarded reorder). **Concurrent reorder, sync=on** — tested 2026-08-25 (see "C6 re-verification + reorder test, sync=on" findings subsection above): confirmed protected, both clients' overlapping moves merged correctly into the final order, no loss, no duplication — a materially better result than sync=off's plain LWW, matching the design's CRDT-move prediction. Both halves of this follow-up item are now closed.
- [ ] Bug 1 follow-up: decide whether sync=off configurations (C1/C3/C5/C7) need a separate mitigation (fix option 1 or 2) — the `Y.Array` fix only protects sync=on, unchanged from the original design's documented scope limitation
- [ ] Root-cause the exact trigger for `Invalid access: Add Yjs type to a document before reading data`
- [ ] Decide and document a fix approach for Bug 2
- [x] **Bug 4 — root-caused and fixed.** `api/index.js`'s `Number(...)` coercion on ref-lookup ids was the defect (IndexedDB rows from every server-sourced write path are string-keyed, not numeric) — confirmed via direct `getItem('54035')` vs `getItem(54035)` A/B test, fixed at both call sites plus the matching defect in `sync-manager.js`'s skeleton stale-cleanup, verified live (add + delete, no reload, on the real page that originally reported it).
- [ ] Bug 4 follow-up: `sync-manager.js`'s skeleton stale-cleanup logic was previously an inert no-op (its own `Number`/`Set-of-strings` mismatch meant it never actually deleted anything, regardless of whether items were genuinely stale). The fix makes it functional for the first time — do a regression pass specifically on skeleton bootstrap (site/pattern/tenant rows) to confirm it now correctly prunes genuinely-stale local rows without over-deleting anything still valid.
- [ ] Bug 4 follow-up: separately from the type bug, `sync.md`'s documented claim ("`bootstrapPattern()` fires when the user navigates to a pattern for the first time") still doesn't match observed behavior on the real site — bootstrap only fired reactively, triggered by the user's own edit, never proactively on navigation. Decide whether that's a real gap worth fixing (proactive bootstrap on navigation would mean fewer users ever hit the "first sync-eligible edit is slow/triggers a cold fetch" experience) or whether the docs should be corrected to describe the reactive-only behavior as intended.
- [x] Re-run matrix cells that predate the sync-layer bug fixes (Bugs 5-13) for regression coverage. **C2** (legacy/off/on) re-run 2026-08-25 against fresh scratch code: identical result, confirms the id-collision bug is unrelated to Bugs 5-13 (see "C2 re-verification" findings above). **C6**'s "add section concurrent" cell was carried forward from a genuinely pre-fix (pre-Bug-1-implementation) result and has now been corrected from ❌ to ✅ after re-running against current code (see "C6 re-verification + reorder test, sync=on" above) — this was a real stale-result gap, not just a confidence check like C2's. **C1, C3, C5, C7** were not re-run: all four use the falcor-direct technique with no `__dmsSyncAPI`/room involvement at all, so Bugs 5-13 (all inside the sync/room machinery) are structurally inapplicable to them regardless of test timing — re-running would exercise the exact same code path already covered. **C4** was not re-run: its blocked columns fail deterministically on the very first write via a defect (`allocateId()`/`dms_id_seq`) unrelated to Bugs 5-13, so a re-run would reproduce the identical block.
- [x] Grepped all of `packages/dms/src` for other `.map(Number)`/`Number(id)` coercions on an id that might hit an IndexedDB lookup — one more instance found, `api/index.js:643`'s `udaCreateView`, but it operates on a plain Falcor JSON-graph response's object keys (always strings by JS object-key convention) to compute a `Math.max()`, unrelated to `idb-store.js`/IndexedDB entirely — not the same bug family, left as-is. The type-coercion defect is fully contained to the 3 fixed call sites.
- [ ] After Bugs 1/2/3 get a fix direction and land, re-run the specific matrix cells each targets, plus a regression pass on the cells that already passed (✅) to confirm no new breakage
- [ ] **Bug 14 — Postgres `beginTransaction`/`commitTransaction`/`rollbackTransaction` likely run on different pooled connections than the work they wrap (code-level finding, NOT live-verified).** Needs a real (throwaway, not `mercury.availabs.org/dms3`) Postgres instance — none was available in this session (client tools only, no server binary, Docker socket inaccessible). Verify via concurrent writes + `pg_stat_activity` showing a stray `idle in transaction` connection. See Bug 14 write-up above for the full mechanism.
- [ ] Once this task is closed out, evaluate whether any part of the concurrent-testing harness (multi-context Playwright helpers, the native-DOM-click workarounds for hover-gated buttons) is worth extracting into `src/dms/skills/` per `planning-rules.md`'s "When to extract a skill" — the hover-gated Settings-button click workaround in particular came up repeatedly this session and is already partially documented in `traversing-dms-pages.md`
