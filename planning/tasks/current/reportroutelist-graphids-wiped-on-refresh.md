# ReportRouteList: route→graph `graphIds` assignment doesn't survive refresh/publish

## Status: FIXED AND LIVE-VERIFIED 2026-07-20. Split out 2026-07-20 from
`report-graph-vocabulary-picker.md`'s Round 3 notes, at user request, so it survives a context
clear as its own trackable item — this is a pre-existing `ReportRouteList` bug, unrelated to that
task's own scope (the Measure picker). A second symptom (brand-new route adds also not persisting)
was reported later the same day and confirmed to share this exact root cause.

## Root cause (confirmed 2026-07-20, via live browser + direct DB verification, not code reading alone)

**`loadReportRow` could never recover a row's own database `id` from a read, on any mount, ever —
independent of duplicate rows, races, or anything session-specific.** Every dataset-row editor in
this codebase (Card, Spreadsheet) fetches through the generic `getData.js` pipeline, which does three
things `ReportRouteList`'s hand-rolled `loadReportRow` skipped, each individually necessary:

1. **`id` must be requested as an explicit column.** It isn't one of `externalSource.columns` (those
   are just the dataset's own `data` JSONB keys) — `getData.js:410-429` pushes a literal
   `{name:"id", reqName:"id"}` column and sorts by it for exactly this reason. Without it, `id` is
   simply never in the SELECT list.
2. **The attribute list must be passed as `filter.attributes`, not embedded in `options`.**
   `createRequest.js`'s `case 'uda'` (`createRequest.js:57-67`) builds the actual Falcor path's
   trailing SELECT-list from `wrapperConfig.filter.attributes` — a field completely separate from
   `udaConfig.options` (which only carries filter/groupBy/orderBy). `loadReportRow` built a correct
   `udaConfig` but never forwarded `udaConfig.attributes` into the request, so the request always
   fell back to `createRequest.js`'s bare `['data']` default — fetching the whole JSONB blob under a
   `"data"` key, which is coincidentally why `row.routes` "worked" (that key naturally exists inside
   the parsed blob) while `row.id` (which was never fetched at all) could never exist.
3. **Once `attributes` is real, each value comes back keyed by its own full SQL expression string**
   (e.g. `"id as id"`, `"data->>'routes' as routes"`), not a clean alias, and the top-level response
   shape is the row object directly (`data[0]`), not `data[0].data.value` (that nesting was itself an
   artifact of the single bare `'data'`-key fallback in the old, broken request). `getData.js:557-559`
   remaps `row[column.reqName] → row[column.name]` after every fetch for exactly this reason —
   `loadReportRow` must do the same remap (plus unwrap the `{$type:'atom', value:null}` shape a null
   comes back as, matching `getData.js`'s own `cleanValue`).

Missing any one of the three means `row.id` is `undefined` forever, on every single mount, regardless
of how many rows exist for the `report_id`. `reportRowIdRef.current` therefore starts every session
as `null`, so `persistRoutes`'s very first mutation of that session omits `payload.id` and takes the
"create new row" branch — inserting a fresh, permanently-orphaned row instead of updating the one
that's already there. This is a stronger, more fundamental bug than "which row does a query with no
`ORDER BY` happen to return" — it's "the row's own id was never fetchable at all," on both cold loads
*and* warm same-session remounts.

**Confirmed empirically, not just by re-reading the code**: `dms_npmrdsv5.data_items__s2177438_v2177440_reports_snap_2`
had **25+ distinct rows all sharing `report_id = '2195012'`** (page 13) by the time this was fully
diagnosed, spanning the entire day's testing session, each with a different `graphIds`/route-count
snapshot — i.e. every single edit across the whole day minted a new row. `scratchpad/npmrds-sub/dms-server.log`
showed only `["dms","data","create"]` CALLs for this dataset all day, zero `["dms","data","edit"]`
calls, confirming `persistRoutes` never once successfully targeted an existing row before this fix.

**A second, smaller, independently-real bug was found and fixed along the way** (not the primary
cause, but was actively contributing extra duplicate rows on top of the above): `dmsDataEditor`'s
"Create New" branch (`src/dms/packages/dms/src/api/index.js`, now fixed) extracted a freshly-created
row's own id via `Object.keys(res?.json?.dms?.data?.byId || {})[0]` **without filtering out
`'$__path'`**, a Falcor client artifact key that can win `Object.keys(...)[0]` ahead of the real id.
Every other call site in the codebase that reads this same response shape already guards against it
(`.filter(d => d !== '$__path')`): `updateDMSAttrs.js:46`, `tenantProvisioning.js:141,168,183,194`,
`authSignup.jsx:89,112,129`, `patternList.jsx:251`, `editSite.jsx:249,553,566,583`,
`createSite.jsx:80`, `CreatePage.jsx:99`, `sourceCreate.jsx:12`, `admin.jsx:108`. `api/index.js` was
the one remaining call site missing the guard — fixed to match. This matters for the very first row
a brand-new report ever creates: without it, even a perfect `loadReportRow` would sometimes fail to
learn the id of the row it just created within the same session.

## Fixes applied (both live-verified 2026-07-20)

**1. `src/themes/transportny/components/ReportRouteList/ReportRouteList.jsx` — `loadReportRow`** (the
primary fix): push an explicit `{name:'id', systemCol:true, show:true, sort:'desc'}` column into the
`buildUdaConfig` call, forward `udaConfig.attributes` as `config.children[0].filter.attributes`, and
remap the response via `udaConfig.columnsToFetch` (raw `reqName` key → clean `name` key, unwrapping
Falcor atom nulls) before reading `row.id`/`row.routes`. Full reasoning is inline in the code comment
above `loadReportRow`.

**2. `src/dms/packages/dms/src/api/index.js`** — filter `$__path` out of the create-response id
extraction, matching the established pattern used everywhere else. Rebuilt dist via
`npx babel src -d dist` per [[reference_dms_package_dist_rebuild]] (no watcher runs on this package).

## Live verification (2026-07-20, on the real page_13/report_id 2195012, per user's explicit go-ahead
to test on this specific already-broken page rather than a scratch page)

- [x] Toggled a route→graph chip (`Tappan Zee South5 (comp-1)` onto Graph 2) — DB confirmed the
  existing row (id `2195223`) was **updated in place** (`updated_at` changed, same `id`), not
  duplicated.
- [x] Hard-reloaded the page (`Ctrl+Shift+R`, bypassing any client cache) — the assignment **survived**:
  Graph 2 rendered both route series correctly, matching the persisted state exactly. This is the
  user's exact original repro (toggle → refresh → check), now passing.
- [x] Added a brand-new route from the catalog (`RT-914V 36091 E`) — DB confirmed this **also updated
  the same row in place** (`route_count` 2→3, same `id` 2195223, new `updated_at`), fixing the second
  reported symptom via the identical mechanism.
- [x] Confirmed via direct DB inspection at every step (`scripts/dbq.py new`), not just visual/UI
  re-checks — per [[feedback_verify_the_actual_mechanism]].

**Ruled out during investigation** (see full trace in conversation history / two background-agent
reports if this file's summary isn't enough for a future session):
- Type-string mismatch between `loadReportRow`'s read format and `persistRoutes`'s
  `storageDataFormat` override — both independently resolve to the identical physical split table
  (`data_items__s{sourceId}_v{view}_{source}`) via each path's own `sourceId` lookup
  (`dms.controller.js`'s `lookupSourceId` for writes, `uda/utils.js`'s `getEssentials` for reads) —
  confirmed by direct DB inspection, not just code reading.
- Hydration-timing race in the orphan-cleanup effect (ruled out in an earlier round, see below).
- dataWrapper's `toSave` effect clobbering routes — structurally can't fire during normal
  chip-toggle/add-route use (gated to a different section-settings-editor mode), and no longer
  touches `routes` even when it does fire.
- `apiUpdate`/`dmsDataEditor` Falcor cache invalidation reaching the page item's own cache — scoped
  precisely to the written row's own id and its own split type, confirmed by reading
  `dms-manager/wrapper.jsx` and `api/index.js`'s invalidate calls.
- A suspected component-remount-after-every-mutation theory (based on the route panel visually
  collapsing right after a click) — real observation, but it turned out to be a symptom of the
  `row.id`-never-fetched bug repeatedly forcing fresh creates/reloads, not an independent cause. No
  actual extra remount mechanism was found or needed once the real fix landed.

**Unrelated things found along the way (not part of this bug, flagging for separate follow-up)**:
- **dms-server crash bug**: the local dev server crashed *repeatedly* (at least twice) during this
  investigation on an unrelated `TypeError: Cannot read properties of undefined (reading 'length')` in
  `src/dms/packages/dms-server/src/routes/uda/utils.js:600`'s `buildJoin`, called from
  `buildSimpleFilterSqlCH` → `getJoinedTileData` (`dama/tiles/tiles.rest.js:215`) while serving a map
  tile join (view 1027 ⋈ 982). Nodemon caught it and paused each time ("waiting for file changes");
  restarted by touching `src/index.js`. The recurrence suggests something (another open tab/session?)
  keeps hitting this same broken tile endpoint. Not investigated further — flagging since it fully
  kills the dev server for anyone else using it at the time, and it recurred fast enough to disrupt
  live verification mid-session.
- **~25+ stray duplicate `reports_snap_2` rows** on page 13 (report_id `2195012`) are cleanup debt
  from this exact bug being live all day — same class of issue as the round-53 "stray duplicate rows"
  finding in `old-reports-conversion-archive.md` (different report, same underlying
  create-instead-of-update failure mode, now root-caused). **Not deleted** — needs the user's
  go-ahead per the standing destructive-action policy. Only the single latest row per report_id is
  ever read now (thanks to `sort:'desc'`), so these are inert garbage, not an active bug, but they're
  worth clearing out eventually. This is likely NOT unique to page 13 — any report page edited before
  today's fix could have the same accumulation; a corpus-wide check would need a new pass.

## Next steps (not yet done)

- [ ] Clean up the stray duplicate rows (page 13 confirmed; likely other report pages too) — needs
  user authorization before any deletes.
- [ ] Investigate/flag the dms-server tile-join crash separately if it recurs.
- [ ] The "ghost routes from another report" symptom (see below) is still unvalidated/unfixed — this
  task only closed out the graphIds-wipe and new-route-not-persisting symptoms.

## Objective

Find and fix why a route's `graphIds` assignment (which graph(s) on a report page a route feeds,
toggled via the chip UI in `ReportRouteList`) does not survive a page refresh or a publish, even
though the write-path itself appears to succeed in the moment.

## Symptom (user-reported, 2026-07-20)

On a real report page (`converted_reports/page_13`, page id `2195012`):

- Clicking a route onto a graph's chip in `ReportRouteList` appears to work in the live session.
- Refreshing the page (still on `/edit/...`) — the association is gone (`graphIds` back to `[]`).
- Publishing the page — the association is still gone afterward.
- User's own hypothesis: "there is some disconnect between the dataset that is powering RRL, and
  the RRL interface."

A second, related-but-distinct symptom also reported: **a brand-new report created from the
"Report Page" template, while the browser had a different existing report open, showed that other
report's routes already present in `ReportRouteList`** ("ghost routes"). Not yet investigated at
all — flagged here so it isn't lost, but treat as a separate root cause from the graphIds-wipe
issue until proven otherwise (creation-time cross-contamination vs. an edit-time persistence bug
are different failure classes).

## Investigation so far (2026-07-20)

### Ruled out: hydration-timing race in the orphan-cleanup effect

`ReportRouteList.jsx:541-556` has an "orphan cleanup" effect: if a route's `graphIds` reference a
section id not present in `knownSectionIds` (derived from `item[isEdit ? 'draft_sections' :
'sections']`), it strips those ids and persists the "cleaned" result. The code already documents
one historical cause of exactly this class of bug (comparing draft-captured ids against the
*published* section-id set while merely viewing — fixed via the `isEdit` gate on `persistRoutes`).

Hypothesized a *different* variant: maybe `item.draft_sections` could arrive non-empty (passing
the `sectionList.length` guard) before every section's own `.element`/`element-data` is actually
resolved, letting the effect see an incomplete `knownSectionIds` set and wrongly strip a
just-assigned, legitimately-present graph id.

**Ruled out by direct trace** (dispatched sub-agent, full report in this task's own history):
`item` (including every section's fully-resolved `element`/`element-data`) is fetched atomically
in one batched Falcor round trip inside the React Router loader
(`dmsPageFactory.jsx` → `dmsDataLoader` → `processNewData` → `loadDmsFormats`), fully resolved
*before* `PageEdit`/`ReportRouteList` ever mount. There is no partial-list window. This theory is
wrong; do not re-investigate it without new evidence.

### Confirmed: the persist write itself succeeds, at least in the moment

Live network capture during an actual chip-toggle click showed the `apiUpdate` payload to
`reports_snap_2` correctly writing a non-empty `graphIds` array for the clicked route (matching
the trackingId of the graph section it was toggled onto). So *that specific write* is not silently
reverting itself synchronously — whatever causes the eventual disappearance happens later (on
reload) or via some other code path, not inside `toggleRouteGraph`/`persistRoutes` themselves at
call time.

### Not yet checked / candidate hypotheses for next session

None of these are confirmed — they're the next things to check, roughly in order of how cheap they
are to rule in/out:

1. **Does `loadReportRow()` (fired on mount via the `[item?.id, externalSource?.source_id,
   externalSource?.view_id]` effect, `ReportRouteList.jsx:358-360`) actually read back the same row
   `persistRoutes` just wrote?** Read the row directly via the CLI/dbq right after a live
   chip-toggle (before any refresh) to see whether the *persisted* row (not just the optimistic
   local `setReportRow` state) has the graphIds — i.e., is this a write bug (the `apiUpdate` call
   the network tab shows succeeds at the network level but the server-side handler doesn't persist
   it correctly) or a read-back bug (the write is fine, but a subsequent read undoes it)?
2. **Stale-closure race in rapid sequential mutations.** `toggleRouteGraph`/`persistRoutes` both
   close over `routes` (from `reportRow` state) at call time. If any other mutation fires in close
   succession (e.g. the orphan-cleanup effect, or the "publish routes to graphs" effect at
   `ReportRouteList.jsx:510-534`, which itself doesn't call `persistRoutes` but does update
   `pageState` — check nothing downstream loops back into another `persistRoutes` call with a stale
   `routes` snapshot that overwrites the just-written graphIds).
3. **Does a REFRESH re-run `loadReportRow` with different filter/view resolution than the original
   mount** (e.g. `externalSource.view_id` resolving differently on a cold load vs. a warm
   client-side navigation), landing on a *different* `id`/row than the one just written? Compare
   `reportRowIdRef.current` across a live-session write vs. what a fresh page load resolves.
4. **Does `apiUpdate`'s optimistic merge (or Falcor cache) mask a server-side failure?** — if the
   server 400s/500s on the write but the client already applied the optimistic `setReportRow`
   update, the UI would look like it worked in-session while nothing actually landed in the DB.
   Check server logs (`scratchpad/npmrds-sub/dms-server.log` or wherever this deployment logs) for
   the specific `apiUpdate` request around the time of a chip-toggle test.

### On the "ghost routes from another report" symptom

Not investigated. First step next time: reproduce deliberately (open report A, use "+ Add Page →
Report Page" template to create report B, immediately check report B's `ReportRouteList` before
touching anything) and capture whether `item.id` inside `ReportRouteList` at the moment
`loadReportRow` first fires is actually report B's id or still report A's (a stale-props/no-remount
navigation artifact would be the natural suspect — client-side route transitions to a
same-component-type page don't always remount).

## Relevant files

- `src/themes/transportny/components/ReportRouteList/ReportRouteList.jsx` — `loadReportRow`
  (~324-356), `persistRoutes` (~368-387), `toggleRouteGraph` (~485-501), publish effect (~510-534),
  orphan-cleanup effect (~541-556).
- `src/themes/transportny/components/ReportRouteList/README.md` — storage model, gotchas section
  (already documents the *published-vs-draft id set* variant of this bug class).
- `src/dms/packages/dms/src/patterns/page/pages/edit/index.jsx` / `pages/view.jsx` —
  `PageContext.Provider` value, `editPageMode`.
- `src/dms/packages/dms/src/api/proecessNewData.js` — `loadDmsFormats`, where `item`'s sections
  get atomically hydrated (relevant if pursuing hypothesis 3 above).

## How to reproduce (pre-fix behavior; fixed 2026-07-20 — kept for regression reference)

1. On any report page's `/edit/...` route, ensure at least one route exists in `ReportRouteList`
   and at least one AVL Graph section has an enabled `$self`-bound `comparison_series` subscriber
   (any report-page graph qualifies).
2. Click the route onto the graph's chip. Confirm (network tab) the `reports_snap_2` `apiUpdate`
   payload shows the graph's trackingId added to that route's `graphIds`.
3. Refresh the page. Re-open `ReportRouteList` and check the route's graph-chip state — pre-fix this
   read back empty even though step 2 showed a correct write; post-fix it correctly survives.

## Testing checklist

- [x] Root cause identified — `loadReportRow` could never fetch a row's own `id` (three compounding
  gaps in the request/response handling, see "Root cause" above), so `persistRoutes` never found an
  existing row to update.
- [x] Fix implemented — `ReportRouteList.jsx`'s `loadReportRow` (primary) + `api/index.js`'s
  `$__path` guard (secondary, session-scoped correctness).
- [x] Live-verified: click chip → refresh → association survives (see "Live verification" above).
- [x] Live-verified: add new route → refresh-equivalent (same-row update confirmed via DB) →
  association survives.
- [ ] Live-verified specifically via *publish* (not just refresh) — not separately tested this round;
  the mechanism is identical (same read path), so expected to work, but not explicitly re-checked
  against a published (not just draft) page.
- [ ] "Ghost routes from another report" symptom investigated — still not investigated, separate
  root cause until proven otherwise.
