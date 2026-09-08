# Regression-testing NPMRDS report/graph changes

A living document — update it whenever a probe run turns up something new, the same discipline as
`traversing-report-pages.md`. Read this **before and after** touching anything that shapes how a
report page renders: `report_build.mjs`, `convert_old_reports_lib/*` (especially
`section_builders.py`), `ReportRouteList/useGraphPublish.js` or its siblings, the Report Page
template, any `avlGraph`/`graph_new` rendering code, or a Card/Map/Info-Box section type a report
uses. This is the check that catches "I fixed the bug I was looking at and silently broke three
pages nobody was watching."

## 1. The 3-layer framework

| Layer | What it checks | Tool | Status |
|---|---|---|---|
| 1. Pure-function unit tests | Date-range math, SQL-expression builders, color/quantile logic — no DB/browser | `pytest` under `convert_old_reports_lib/tests/` | **Not built yet** — see `planning/transportny/tasks/current/converter-vocabulary-unit-tests.md` |
| 2. Structural page-render regression | Does a real page still render the same sections/errors/query shapes it did last time | `node scripts/npmrds-reports/probe_corpus.mjs` | **Built, live** |
| 3. Known-good-value spot check | Does a specific measure's *number* still match an independently-computed ground truth | Layer 2's `expectedValue` field, one PoC entry so far | **Built, live** (1 entry: `golden_corpus_bargraph`) |

This doc covers layers 2 and 3. Design history and the bugs found building them are in
`planning/transportny/tasks/current/report-probe-expect-and-golden-corpus.md` — read that if you
want the "why," not just the "how."

## 2. Run it (the thing to do before/after a change)

```bash
node scripts/npmrds-reports/probe_corpus.mjs
```

Exit 0 = every corpus entry matches its baseline. Exit 1 = something changed — read the printed
findings, ranked Blocker → Major → Minor → Info:

- **Blocker**: a section flipped rendering state (had content → blank, or vice versa), a new
  console/page/SQL error, a request now hangs at close, or a Layer-3 expected value moved outside
  tolerance.
- **Major**: a section's returned series/route count changed, or a query that used to fire no
  longer does.
- **Info**: something that used to be broken (a console error, say) is now gone — probably a fix,
  confirm before re-baselining.

`--list` prints the manifest (which entries exist, when each was last captured/verified, what each
covers) without probing anything — the fast "what does this even cover" check.

## 3. Is a finding real, or noise?

Three known noise sources are already filtered out (don't re-litigate these if you see them
mentioned in the task file's history):
- Generic Falcor/UDA plumbing (site-wide catalog reads, source-picker listings) — excluded from the
  diff entirely, since it drifts from unrelated activity on a shared dev DB.
- A network blip that made the page fail to load outright — detected and refused (`PROBE FAILED TO
  LOAD THE PAGE`), never captured or diffed as if it were a real state.
- **A stale manifest URL silently renders the site's marketing homepage instead of 404ing** (found
  round 85, old-reports-conversion.md, 2026-08-31, **ROOT-CAUSE FIXED same day** — see below): if a
  page's `url_slug` changed since the manifest entry was written (a title save recomputes it — see
  `reference_dms_section_create_cli_gaps`/round 63's archive note — or someone renamed/recreated the
  page under a new slug), the route falls through to the homepage rather than erroring. This shows
  up as an oddly **uniform** "section count changed: 2 → N" Blocker across every corpus entry at
  once (the same generic homepage, N ≈ its own nav/hero section count, on every failing URL) plus
  every previously-captured `/graph` query "no longer firing" (the real page's data queries never
  ran). That signature — identical section count on multiple unrelated entries, not just one — is
  the tell that it's a routing/slug problem, not a rendering regression in whatever you just
  changed. Confirm with a direct query (`dms_npmrdsv5.data_items` `url_slug`/`updated_at` for the
  `npmrds_sub|page` type) before assuming your change broke every entry at once. **Root cause fixed
  2026-08-31**: `report_build.mjs`'s `computeTargetSlug()` used to trust an explicit `spec.slug`
  field verbatim (via a fallback algorithm that didn't even match the admin UI's own slug algorithm
  either) — these 4 golden-corpus specs' hand-picked slugs never matched what their own `title`
  would produce, so this recurred 3 times (2026-08-24/25/31) as titled pages kept getting resaved.
  Fixed at the root: `computeTargetSlug()` now always derives the slug from `spec.title` via an
  exact port of the admin UI's `toSnakeCase()`/`getUrlSlug()` — the same thing a title save
  recomputes to — so a save is a no-op on the slug from now on; the dead `spec.slug` field was
  removed from all spec files. This should no longer recur for ANY spec-driven page (verified every
  real production spec's slug already matched its own title). If it somehow does anyway, the fix
  above is `report_build.mjs`'s `computeTargetSlug()`/`toSnakeCase()`, not a manifest-only patch.

If you see a finding that looks like neither of these, it's real — go look at the actual page
(`node scripts/npmrds-reports/report_probe.mjs <url> --bodies` for full detail) before assuming the
tool is wrong.

## 4. Keeping it in sync when a schema/shape change ships (the actual ask this doc exists to answer)

Every manifest entry (`scripts/npmrds-reports/report_probe_fixtures/golden-corpus.json`) has a
`covers` array tagging the real field/function names it exercises — not prose, the literal
identifier (`display._measurePick.routeIds`, `sidebarHideInView`, `measure.speed`). **When you
change one of those fields, `grep` the manifest for its name:**

```bash
grep -n "_measurePick" scripts/npmrds-reports/report_probe_fixtures/golden-corpus.json
```

That tells you exactly which corpus entries are at risk. Run just those before your change
(confirm they pass on the old code), make the change, run them again:

```bash
node scripts/npmrds-reports/probe_corpus.mjs --only golden_corpus_linegraph,dynamic_report_one_week_study
```

If it now fails, that's expected — read the finding, confirm it's the change you intended, then
re-baseline **only those entries**, never a blanket `--capture`:

```bash
node scripts/npmrds-reports/probe_corpus.mjs --capture --only golden_corpus_linegraph
```

This is a deliberate, visible action — the tool never re-baselines silently on its own, whether the
run passed or failed.

**The reverse direction matters too.** If you find a real bug in live-page rendering that no corpus
entry caught, that's a signal the manifest has a gap — add a `covers` tag to whatever entry should
have caught it, or add a new entry if none did. The manifest stays accurate by being corrected from
real misses, not by being written once and trusted forever.

Several load-bearing files carry a pointer comment right at the spot that writes/reads a covered
field (e.g. `report_build.mjs`'s `_measurePick.routeIds` wiring, `section_builders.py`'s
`build_graph_section_data`, `useGraphPublish.js`'s own read) — if you're editing one of those and
see the pointer, it's not decorative, actually go run the check.

## 5. Adding a new corpus entry

Manifest entry shape (see the existing 5 entries for real examples):

```json
{
  "key": "unique_snake_case_key",
  "url": "converted_reports/<slug>[?routes=<id> if Dynamic Report]",
  "source": "spec:path/to/spec.json  OR  existing-page:<id> (note why, e.g. old-tool-only feature)",
  "rebuild": "the exact report_build.mjs command to reproduce this page, or null if hand-built",
  "authRequired": true/false,
  "covers": ["real.field.names", "not.prose.descriptions"],
  "notes": "why this entry exists, what it's representative of",
  "baselineCapturedAt": null,
  "lastVerifiedAt": null,
  "expectedValue": null
}
```

Add the entry, then:

```bash
node scripts/npmrds-reports/probe_corpus.mjs --capture --only <new_key>
```

Read the captured baseline once by hand (`report_probe_fixtures/baselines/<key>.json`) to confirm
it actually looks like a working page (real content, no errors) before trusting it as ground truth
— a baseline captured from a broken page silently locks the breakage in as "normal."

**Dynamic Report pages need `?routes=<id>` in the URL, never the bare slug** — the bare slug shows
only the entry-gate placeholder state, testing nothing about the actual report. See the task file's
2026-08-07 finding for how to find a working route id for a given template.

## 6. Adding a Layer-3 known-good-value check

Only worth it for a measure you're confident is correct (per Ryan's framing: "something EASY, like
speed — we're almost certainly right, and if not it's rounding") — this is a spot-check trip-wire,
not a push toward full measure-formula test coverage (that's `converter-vocabulary-unit-tests.md`'s
job, and deliberately out of scope here).

1. Find the section's own calculated-column SQL expression (`dms raw get <section-id>`, parse
   `element['element-data']`, look at `columns[].name`).
2. Compute the same result **independently** — direct `dbq.py ch`/`dbq.py dama` SQL, never derived
   from the page's own rendered output (that's circular). Reference-data lookups (e.g. per-TMC
   miles from a static geometry table) are fine to reuse via the UDA endpoint directly — that's a
   static lookup, not the thing being verified.
3. Set `expectedValue: {description, matchRoute, value, toleranceAbs, groundTruthQuery,
   groundTruthComputedAt}` on the manifest entry.
4. **Sanity-check the assertion mechanism itself before trusting it** — temporarily set a wrong
   `value`, confirm the diff fails with the real returned values printed, then restore the correct
   value and confirm it passes. Skipping this step means you don't actually know whether the check
   would ever fire.

## 7. Gotchas found building this (read before extending the tool itself)

- **Map/canvas sections don't show up as SVG.** `report_probe.mjs`'s census checks
  `svg-ink OR real-sized canvas` — if you're writing a new probe check, don't assume SVG content is
  the only signal a section rendered.
- **Match on the full decoded query string, never a truncated prefix.** Several distinct queries
  (e.g. Bar Graph Summary's per-weekday fan-out) share an identical preamble and only diverge later.
- **A paginated UDA fetch sends a `length`-only preflight before the real `dataByIndex` call**, on
  the same view/options shape — matching on "looks like a report-content query" alone isn't
  specific enough to find the response that actually carries computed values.
- **Screenshots are never part of the automated diff** — pixel-diffing is fragile (fonts, timing).
  They're per-run artifacts for a human to look at, nothing more.
