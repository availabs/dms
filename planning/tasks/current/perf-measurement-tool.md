# A performance test for DMS sites: every page of a pattern, in every mode that matters

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** phase 1 built, uncommitted · **Created by:** amuro@albany.edu · **Edited by:** —

Research and design, 2026-11-18; decisions from the owner's review the same day are folded in ("Decided"). To be built **before** [rsc-view-pages.md](../completed/rsc-view-pages.md), so that task
starts from a baseline and its spike is judged with this tool.

## Objective

One command that loads every page of a pattern the way visitors do, in each mode we run sites in, and reports
how long a visitor waits. A second command compares two runs and says whether a change moved the numbers by
more than the noise. Lighthouse scores are in the report, as one column among several.

## Why the measurements so far aren't enough

- **Single runs.** perf-auth-revalidate-duplicate-fetch.md compared one or two Lighthouse runs per state and
  twice found "no measurable change" within noise (score 61 → 60, LCP 2068 → 2096 ms).
- **One page.** Those runs used one page (`/playground/blank_page`). page-hydration-payload.md swept all 159
  pages, but measured bytes, not time.
- **One mode.** Each investigation used whichever mode was at hand: production SPA on Netlify, dev-mode SSR on
  the hub, signed out. The signed-in regression (LCP 2.1 s → 4.8 s) was found by accident.
- **Lighthouse measures a cold mobile load.** It doesn't measure a second visit, a click between pages, or
  when a data section's rows arrive, and those are most of what a DMS user does.
- **No "done" in the metrics.** LCP fires for a heading or hero image while tables and maps are still
  loading. Nothing recorded when the page was complete.
- The code has no timing marks at all: no `performance.mark`, no `Server-Timing`, no web-vitals
  (grep, 2026-11-18).

## The modes, and what each is for

Read from the code and docs (`documentation/sync.md`, `dms-server-env.md`, `render/spa/dmsSiteFactory.jsx`,
`api/index.js`, `patterns/page/siteConfig.jsx`, `deploy/targets.json`).

| Variable | Values | How it is switched | What it is meant to buy |
|---|---|---|---|
| **Render** | SPA shell / SSR | Server, at run time: `DMS_SSR=1` on dms-server. A Netlify site is always SPA | SSR: content in the first response, for first paint and crawlers. SPA: an empty shell, then JS, site data, page data |
| **Sync** | off / on | **Client, at build time**: `VITE_DMS_SYNC=1` | Local-first: page data is read from the browser's IndexedDB, so a return visit and a click read no network. The first visit pays for a bootstrap |
| **Preload** | off / on | Per pattern, in data: `preload_data` | The loader fetches each data section's rows before the first render (5 s budget per section), so sections arrive filled |
| **Visit** | cold / warm / in-app click | The visitor | Cold: empty browser. Warm: HTTP cache, the cached pattern list in `localStorage` (`<app>-<type>`), IndexedDB when sync is on. Click: the router loads the next page without a document load |
| **User** | signed out / signed in | Token in `localStorage` (`userToken`) | Signed in adds an auth check and, today, a second data fetch; SSR renders signed out either way (open task) |
| (later) **RSC** | off / on | `DMS_RSC` per site, per route opt-in | rsc-view-pages.md |

What each mode should show if it works as intended, which is what the report has to make visible:

| | cold load | warm load | in-app click |
|---|---|---|---|
| SPA, no sync | slowest first paint; data after JS | faster (cached JS, cached pattern list); data still fetched | data fetched per page |
| SPA, sync | first paint as above, plus bootstrap | **near-instant data** | **near-instant** |
| SSR, no sync | **fast first paint**; hydration cost | same, cached JS | as SPA, no sync |
| SSR, sync | fast first paint, plus bootstrap | fast paint and local data | near-instant |

Where things run today: the hub (`availabs.com`, own server, SSR, sync on); devtny / tnyprod (mercury, served
by dms-server); devmny / mnyprod / landbank / wcdb (Netlify, SPA). Dev mode (Vite, unbundled modules, no
React Compiler) is not a mode visitors see, and is **not measured**.

Two facts that shape the tool:

- **Sync is a build-time switch**, so comparing sync on and off means two builds, each measured by its own
  run.
- **The client already has a loading contract.** A data section's wrapper carries `data-dms-loading` while a
  request is out (`dataWrapper/index.jsx`); the PDF renderer waits until nothing carries it and the network
  is quiet (`dms-server/src/pdf/render.js` `waitForReady`). That is the "page is complete" signal, already
  type-agnostic. Whether Map, Graph and the rich-text swap set it has to be checked.

## What good practice says (sources at the end)

- **Measure what the user waits for.** Core Web Vitals are LCP (good ≤ 2.5 s), INP (≤ 200 ms) and CLS
  (≤ 0.1), judged at the 75th percentile of real visits. TTFB and FCP explain a slow LCP.
- **Lab and field answer different questions.** A lab run is repeatable and can test a change before it
  ships; it can't measure INP (no user), and it is one machine on one network. Field data is the truth about
  users and can't test an unshipped change. A lab tool comes first; field data confirms.
- **One run is noise.** Lighthouse's own guidance: the median of 5 runs is twice as stable as one run; use a
  dedicated machine, don't run in parallel, and compare medians.
- **Lighthouse's score is a cold, simulated-mobile page load.** Its user flows add "timespan" mode for
  interactions, which gives layout shift and blocking time but no score and no LCP, and they need Puppeteer.
- **Client-side navigations now have real metrics.** Chrome 151 turned on soft-navigation detection by default
  (a user action, a URL change and a paint); `soft-navigation` entries give FCP and LCP per in-app click, and
  web-vitals v6 reports them.
- **App-specific milestones belong in the app**, as User Timing marks (`performance.mark`), and server phases
  in a `Server-Timing` header, so every tool (this one, DevTools, Lighthouse) reads the same numbers.
- **Throttling:** real users are on slower devices than a dev machine. Run one unthrottled profile (least
  noise, best for A/B) and one throttled (4× CPU, slow 4G) to see what a phone sees.

## Design

### What one measurement is

A **visit**: one page, one mode, one visit type, one run. The tool records, for each visit:

**Milestones, in the order a visitor experiences them** (ms from the start of the navigation or the click):

| Milestone | Meaning | From |
|---|---|---|
| Server responded (TTFB) | first byte of the document | Navigation Timing |
| First paint (FCP) | something is on screen | paint entries |
| Main content (LCP) | the largest element is painted | LCP entries; soft-navigation entries for a click |
| **Readable** | the page's own text and layout are there: route resolved, page row rendered | a `dms:page-rendered` mark (new) |
| **Complete** | the page the visitor sees has stopped arriving: the last time a section carried `data-dms-loading`, nodes were added or removed, or an image / script / stylesheet finished loading | the loading contract, the DOM, resource entries |
| **Idle** | the browser has nothing left to do: Complete, plus background requests (sync's bootstrap) and long tasks | fetch / XHR in flight |
| Usable | hydrated, and the main thread is free | a `dms:hydrated` mark (new); long tasks |

"Complete" is the headline number. For a data page it is what the visitor waits for, and it is the one
neither Lighthouse nor LCP gives.

Complete and Idle are separate because of what the first smoke run showed (2026-11-18, the hub, sync on): the
browser kept fetching for ~20 s on every page, long after the page looked finished (~7–11 s). One number for
both would have hidden the page behind sync's background bootstrap, or the other way round. The runner waits
for Idle, then reads Complete as the time of the last visible change.

**Stability and responsiveness:** layout shift (CLS) up to Complete; total blocking time and the longest
task between First paint and Complete. INP can't be measured without a user, so it is left to field data.

**Cost, which explains the milestones:**

- bytes: document, hydration data inside it, JS, data responses (transferred and decoded);
- requests: count, and **duplicates** (the same data request sent twice in one visit; three earlier
  investigations each found some by hand);
- server time by phase, from `Server-Timing` (new): routes, page loader, section preload, render;
- section data: per section, when its request started and ended;
- errors: hydration mismatches, console errors, failed requests, sections over the preload budget.

### The matrix, and the default set

The full cross product is too many runs to be useful. A **profile** names one combination; a run uses a set
of profiles. Defaults:

| Profile | Render | Sync | User | Device |
|---|---|---|---|---|
| `public` | as the target serves | as built | signed out | desktop, unthrottled |
| `public-phone` | 〃 | 〃 | signed out | 4× CPU, slow 4G |
| `editor` | 〃 | 〃 | signed in | desktop, unthrottled |

Each profile makes four kinds of visit:

1. **cold**: a new browser profile, straight to the URL;
2. **warm**: the same profile, the same URL again;
3. **click**: from the pattern's previous page, by clicking the real link in the nav (found by its `href`),
   falling back to "not reachable by a link" when there is none.

4. **journey**: one visitor's session. A cold landing on the pattern's home page, then K in-app clicks
   (default 8, a fixed list of pages spread across the pattern, the same list for every run of that
   pattern). Recorded per step and cumulatively.

Render and sync are properties of the **target** (a build plus a server). A run measures the target as it is
and records which it found, so comparing modes is comparing two saved runs with the same pages and profiles:
`spa`, `ssr`, `ssr+sync`, later `ssr+rsc`.

### Showing what sync is for

Sync is a trade: the first load pays for a bootstrap so that every later page reads from the browser. Per-page
medians hide that trade, because they average the one expensive load in with nothing to set against it. The
journey shows it:

- **First-load cost**: Complete on the cold landing, sync on vs off, and the bootstrap itself (requests,
  bytes, time from `/sync/bootstrap` and the pattern bootstrap).
- **Per-click gain**: Complete for each later step, sync on vs off, and how many of those steps read no
  network at all.
- **Break-even**: the cumulative wait across the journey, as two lines. The step where the sync line drops
  below the other is the number of pages a visitor must view before sync has paid for itself. If it never
  crosses, sync is costing more than it gives on that pattern.
- **Return visit**: the same journey again in the same browser profile (warm), where sync should be at its
  best and non-sync pays for its data again.
- Also recorded when sync is on: IndexedDB size after the journey, and time until the WebSocket is connected.

A run on one target reports its own journey. The break-even view needs two saved runs, one from a sync build
and one without, compared.



### A run is a config, and a saved result

Everything about a run is a setting, given in a config file or as flags (flags win):

```json
{
  "label": "hub-ssr-sync-baseline",
  "target": "https://mny.localhost:5555",
  "app": "mitigat-ny-prod", "type": "MitigateNY_2025",
  "pattern": "<the pattern to walk>",
  "profiles": ["public", "editor"],
  "visits": ["cold", "warm", "click", "journey"],
  "runs": 5,
  "sample": null,
  "lighthouse": { "pages": "auto", "runs": 5 }
}
```

- **The target is whatever the config points at**: a local production build, mercury, a Netlify site. The
  tool doesn't switch a site's mode. It **detects and records** it: SSR (the document arrives with page
  content in `#root` and `window.__dmsSSRData`), sync (`globalThis.__dmsSyncAPI` is present), the pattern's
  `preload_data`, signed in or out.
- **Default size is the whole pattern.** `--sample N` takes N pages spread across the list (always including
  the pattern's home page), and `--pages a,b,c` names them; the sample is recorded so a later run can reuse
  exactly the same pages (`--pages-from <run>`).
- **Each run is saved as JSON on disk**: `scratchpad/<site>/perf/<date>-<label>/run.json` (config, detected
  mode, commit SHAs, build id, Chrome version, machine, the page list) and `visits.jsonl` (one line per
  visit, every repetition, raw). Nothing is thrown away, so a report or a comparison can be made later from
  any saved runs.
- Signed-in profiles log in with the QA tools' `DMS_EMAIL` / `DMS_PASSWORD` from the root `.env`.

### Repetitions, and noise

- Each visit is repeated `runs` times (default 5). The report gives **min, max, average and median** for
  every number; comparisons use the median, because one slow outlier moves an average and not a median. The
  spread (min–max) is shown wherever a number is.
- Sequential, one browser, fixed viewport, no extensions, system Chrome through Playwright (already a
  dependency; Playwright's own browsers aren't installed here).
- The server's first request after a restart is slow for reasons that aren't the page (route build, cold
  caches). One discarded warm-up request per host; a separate `server-cold` number if wanted.
- When two targets are compared live, visits **interleave** them so drift on the machine or database hits
  both.

### Comparing two runs

`compare <baseline> <candidate>`:

- per page and visit type, the change in each median;
- a change counts only when it is larger than both a floor (default 5 % and 50 ms) and the two runs'
  combined spread; everything else is "no change";
- the summary: how many pages got faster, slower, stayed; the median and 75th-percentile page before and
  after; the ten largest moves each way; new errors.

That is the "did it move the needle" answer: one line per mode, then the detail behind it.

### The report

A static HTML file per run (and per comparison), in the Tessera report style:

1. **Overview**: per target and profile, the median and 75th-percentile page for First paint, Main content,
   Complete, and total bytes; cold, warm and click side by side.
2. **Mode grid**: the "what each mode should show" table above, filled with measured numbers, so a mode that
   isn't delivering what it is for is visible at a glance (sync whose warm visits still fetch; SSR whose
   Complete is no earlier than SPA's).
3. **Sync's trade** (when the compared runs differ in sync): first-load cost, per-click gain, the break-even
   chart.
4. **Pages**: a sortable table, one row per page, a milestone bar per visit type, sizes, request counts,
   errors.
5. **One page**: its request timeline, sections by load time, the Lighthouse report when there is one.
6. **Worst pages, and why**: slowest section, largest payload, duplicate requests.
7. **Lighthouse**: performance score and its metrics for a sample (below).

Raw results are JSON on disk beside the report (one file per run), so a run can be re-reported or compared
later.

### Lighthouse

Lighthouse takes about 30 s a run and measures one visit type, so it runs on a **sample**: the pattern's home
page plus the slowest and median pages from the main run (or a named list), 5 runs, median, its default
mobile simulation and a desktop preset. The report shows the score next to the tool's own numbers for the
same pages. It runs against the same Chrome over its debugging port (navigation mode needs no Puppeteer).

### Where the code goes

- **`src/dms/perf/`**, at the top of the library repo beside `skills/` and `documentation/` (owner agreed,
  2026-11-18). It is a tool for working on DMS, not something a site ships, so it stays out of `packages/`
  (the published client and server) and out of the client bundle. It has its own `package.json` naming
  Playwright, so it runs in a bare clone of the library as well as inside dms-template (where Node finds the
  root's Playwright).

  ```
  src/dms/perf/
    README.md         how to run, what each number means
    package.json
    cli.js            the `dms perf` commands (run / compare / report)
    config.js         run config: file + flags, defaults, profiles
    pages.js          page list for a pattern, --sample / --pages / --pages-from
    runner.mjs        browser, visits, repetitions, saving
    collect.js        in-page collector, injected before any page script
    detect.js         SSR / sync / preload / signed-in detection
    stats.js          min, max, average, median; the noise rule
    aggregate.mjs     raw visits to per-page and per-visit-type numbers
    compare.mjs       two saved runs
    report/           the HTML report (index.mjs, style.css)
    perf.test.mjs     node --test
    lighthouse.mjs    the sample (phase 5, not built)
  ```

  Results go under the repo's git-ignored `scratchpad/<site>/perf/`.
- Exposed through the CLI's command hook (`.dmsrc` `commands`, as `dms qa` is): `dms perf run`,
  `dms perf compare`, `dms perf report`. The connection comes from the usual `DMS_*` variables.
- **The page list comes from the CLI's own page listing** for the pattern it is pointed at. The tool knows
  no pattern type and no section type: "complete" is the loading contract, which any section type sets.
- The two scratch scripts from this week (`measure.mjs`: sizes and markup hash per page; `net.mjs`: requests
  after load and hydration errors) are the starting point.

### Changes in DMS (small, and useful beyond this tool)

- [ ] **Marks** (`performance.mark`): `dms:routes-ready`, `dms:page-data`, `dms:page-rendered`,
      `dms:hydrated`, and a measure per section's data request. Visible in DevTools and Lighthouse too.
- [ ] **`Server-Timing`** from the SSR middleware: routes, loader, preload (and per section over a
      threshold), render.
- [ ] **Loading contract coverage**: check Map, Graph (its code-split chunk) and the rich-text swap; anything
      that loads after first render sets `data-dms-loading`. Documented as an extension point.

### Later: field data

The site tracker (`public/analytics.js`, collector moving into dms-server: site-web-analytics.md) can carry
web-vitals v6 with soft navigations: LCP, CLS and INP per real page view and per in-app click, at the 75th
percentile, by site and page. That is the check that a lab win reached users, and the only source of INP.

## Phases

1. **Runner and report. BUILT 2026-11-18** (`src/dms/perf/`, hooked into the CLI by dms-template's `.dmsrc`).
   - [x] Run config (file, then flags), `--sample`, `--pages`, `--pages-from`
   - [x] Page list from the CLI's data helpers; home page alias (a link to the pattern's base URL)
   - [x] Mode detection: server-rendered or SPA, sync, the pattern's preload, signed in, dev or production build
   - [x] Cold, warm, click and journey (first visit and return visit) visits; repetitions
   - [x] Complete and Idle, standard paint entries, soft-navigation paints for clicks, layout shift, blocking time
   - [x] Bytes by kind, hydration data size, data requests, duplicate requests, console / hydration errors
   - [x] Click checks: stale content (URL changed, page didn't), a full document load, no link, scripted click
   - [x] A hard time limit on every browser step (a run stalled for 20 min without one)
   - [x] Saved `run.json` + `visits.jsonl`; `aggregate`; `compare` with the noise rule and the journey crossing
   - [x] HTML report for a run and for a comparison; `dms perf run / report / compare`
   - [x] Unit tests (`node --test src/dms/perf/perf.test.mjs`, 6 pass); eslint clean
   - [x] **A run against a production build** (2026-11-18, see "Production baseline" below)
   - [x] A run stops when its target goes down (6 page loads failing in a row), after another session's
         restart of the measured server spoiled a run
   - [ ] A full-pattern run (all 159 pages × 5): not run yet; on the dev server it would take many hours
2. **Marks, `Server-Timing`, contract coverage** in DMS; the report gains Readable, Usable and server phases.
3. **Profiles and compare.** Signed in, phone; `compare` over any saved runs with the noise rule; the sync
   break-even view; A/B interleaving.
4. **Targets.** A script that builds and serves `spa`, `ssr` and `ssr+sync` locally, so the mode runs are
   easy to take; live sites as targets.
5. **Lighthouse sample.**
6. **Results as a DMS dataset with a report page**, so trends over time are a page an author can read and
   change, not a file.
7. **Field vitals** through the tracker.

Phase 1 is enough to baseline before the RSC work; phases 2–3 are what its spike needs.

## First runs (2026-11-18, the hub's DEV server: tool check only, not a baseline)

Two runs of the same 3 pages (`--sample 3 --runs 2 --journey-steps 4`), 42 visits each, no failed visits,
~14 min each. Runs: `scratchpad/mny-test/perf/2026-11-18-1508-hub-dev-a` and `…-1523-hub-dev-b`.

- Median page: Complete 14.0 s cold, 16.5 s warm, 5.5 s after a click; Idle 21.7 s cold.
- A warm load transfers 5.4 MB against 12.6 MB cold but fetches nearly all the data again (4.35 of 4.40 MB).
- Journey: landing Complete 5.9 s, Idle 19.1 s; clicks ~0.4–1.1 s with 2–3 data requests; the return visit's
  landing has no background tail (Idle = Complete 5.3 s) and three of four clicks send no data request.
  ~32 MB kept in the browser.
- Duplicate data requests on every load (11 on Home, 28 on Ice Storm).
- Buildings never went idle inside 60 s on a cold load.
- **Comparing the two runs of unchanged code:** 8 of 9 page-visits "no change"; one warm load read as slower
  (5.28 → 5.72 s) because with 2 repetitions a page's spread is almost nothing. The journey's landing differed
  by 1.56 s between the runs (one outlier) and is correctly shown as within the noise. Two repetitions are too
  few; the default stays 5.

Known limits found: the soft-navigation "main content" time is only there for a real click (not one made
from script on a hidden menu link); a dev server's hot reload reloads measured pages if the repo is edited
during a run.

## Production baseline (2026-11-18, hub production build, server-rendered, sync on, preload on, signed out)

`scratchpad/mny-test/perf/2026-11-18-1634-hub-prod-baseline`: 12 pages (`--sample 12`), 5 repetitions, 272
visits, none failed or timed out, 64 min. Measured on its own server (port 5556, a build with
`VITE_API_HOST=http://api.localhost:5556` in `scratchpad/perf-build-5556/`) so another session's restarts of
5555 could not spoil it. "After" runs use `--pages-from` this folder.

| Median page (75th percentile) | Cold load | Warm load | In-app click |
|---|---|---|---|
| Server responded | 0.14 s (0.61) | 0.11 s (0.57) | |
| First paint | 0.37 s (1.00) | 0.33 s (0.74) | 0.33 s (0.49) |
| Complete | 4.6 s (9.7) | 6.3 s (11.5) | 0.7 s (2.8) |
| Idle | 16.5 s (18.3) | 16.8 s (18.5) | 0.9 s (3.5) |
| Blocking time | 510 ms (2657) | 501 ms (2629) | 127 ms (640) |
| Transferred | 9.9 MB | 6.7 MB | 0.9 MB |
| Data requests (duplicates) | 38 (8) | 38 (8) | 15 (2) |

- **Every full load is busy until ~16 s**, cold or warm, whatever the page: sync's bootstrap. A warm load
  right after a cold one runs it again (Idle 16.8 s, data 4.2 MB again).
- **A warm load is not faster than a cold one** (Complete 6.3 s against 4.6 s).
- **Complete is unstable on several pages**: Home cold 4.6–17.6 s, warm 6.4–24.8 s; the journey's landing
  7.3–22.4 s. The page sometimes changes again when the background work ends. Text-only pages are steady
  (1.4–1.6 s).
- **The three hazard risk profiles are the slow class**: server 1.7–2.3 s, Complete 13–15 s, Idle 21–23 s,
  blocking time ~3 s, 147–195 data requests of which 55–90 are duplicates, up to 42 MB. A click to one still
  takes 3.5–11 s.
- **Clicks to text pages are 0.1–0.9 s** with 2 data requests.
- **Journey** (landing + 8 clicks): first visit 26.9 s to Complete in total, 17.2 s of it the landing; the
  return visit 11.5 s, landing 3.2 s with no background tail, and 4 of 8 clicks with no data request. Two
  steps cost the same both times (`/plan_to_act/local_planning` 40 requests, `/explore_progress/action_tracking`
  54 requests, 5.5 s). 32 MB kept in the browser.
- 2 of 12 pages have no link from their parent, the home page or the page before them (no click measurement).

Open question: the journey's return landing has no bootstrap tail (Idle 3.2 s), a warm load does (16.8 s).
Both are full loads in a profile that already loaded the site; why they differ is not explained yet.

## Faster runs and the full pattern (2026-11-19)

The owner asked for faster runs, cares less about cold loads, and wants every page measured.

Changes to the runner:
- `cold` is opt-in (`--visits cold,…`); the default is `warm,click,journey`. The journey keeps one cold landing.
- `warm` is now **a returning visitor**: one browser visits the site once (not recorded), then opens every
  page's URL directly.
- `click` is one session that walks the pattern, clicking from each page to the next; a page with no link
  from where the session is gets reached from its parent, else the home page.
- The collector counts a request as over when its body has arrived, and counts IndexedDB writes as activity.
  `--quiet-ms` default is 1000. **Yesterday's warm numbers were wrong**: ~0.8 s passes between sync's download
  ending and its save starting; the runner closed the page in that gap, so sync never saved and every warm
  load downloaded the site again.
- Each visit records its 3 slowest data requests; the report's page table gained server time, blocking time,
  click data requests and the slowest request.

Full run: `scratchpad/mny-test/perf/2026-11-19-1546-hub-prod-all`, 159 pages × 3, 1014 visits, no failures,
115 min (one pass: 22 min of returning loads + 15 min of clicks).

| Median page (75th percentile, worst) | Returning load | In-app click (104 pages) |
|---|---|---|
| Server responded | 0.15 s (1.6, 5.4) | |
| Complete | 3.8 s (9.0, 37.0) | 1.0 s (2.8, 11.2) |
| Blocking time | 482 ms (661, 18 661) | 93 ms (368, 7342) |
| Data requests (duplicates) | 37 (4); worst 404 (258) | 9 (0) |

- Returning load, Complete: under 2 s on 24 pages, 2–5 s on 69, 5–10 s on 35, 10–20 s on 29, over 20 s on 2.
- **The slow pages are one area**: `assess_risk/natural_hazards` (52 pages) has a median of 10.5 s; every other
  area is 2–5 s, except `explore_progress/action_tracking` (8.9 s) and `/county_risk_profiles` (31 s).
- Across pages, Complete goes with server time (correlation 0.91), data requests (0.88) and duplicate
  requests (0.86); less with bytes (0.51).
- Worst: `/assess_risk/natural_hazards/flooding/risk_profile` (server 5.4 s, Complete 37 s, Idle 55 s, 18.7 s
  blocking, 404 data requests of which 258 duplicates, one request 28 s); `/county_risk_profiles` (31 s, 319
  requests, 43 MB); `…/built_environment/buildings` (Complete 15 s, Idle 47 s, one request 32 s).
- A section still showed its loading state on 21 pages although preload is on (the hazard
  `mitigation_strategy` pages, `actions_dashboard`, `/county_risk_profiles`).
- Journey: first visit 36.0 s in total, 26.3 s of it the landing; return visit 12.2 s, landing 4.0 s.

Open:
- **55 of 159 pages got no click measurement**: no link to them from the page the session was on, their
  parent, or the home page. All 16 hazard `mitigation_strategy` pages are among them. How visitors reach
  those pages (tabs, a menu not in the DOM) is not looked at yet.
- The click to Home was flagged "stale" (URL changed, page text did not) in all 3 passes: not checked whether
  that is the site or the tool.

### Sync on against sync off (same site, same 159 pages, same journey, signed out)

Sync-off run: `scratchpad/mny-test/perf/2026-11-19-1744-hub-prod-all-nosync` (build
`scratchpad/perf-build-5557-nosync`, `VITE_DMS_SYNC=0`), 1014 visits, no failures. Comparison report:
`…-1546-hub-prod-all/compare-hub-prod-all-nosync.html`. (The run's wall time spans a night the machine was
asleep; per-visit times are unaffected as far as the spreads show.)

| | Sync off | Sync on |
|---|---|---|
| Returning load, Complete, median page | 2.25 s | 3.79 s (135 of 159 pages slower, 2 faster) |
| Returning load, all 159 pages added up | 629 s | 933 s |
| Returning load, data requests, median page | 29 | 37 |
| Click, Complete, median page (104 pages) | 0.97 s | 0.98 s (33 faster, 2 slower, 69 no change) |
| Click on a light page (53 pages under 1 s) | 0.43 s | 0.37 s |
| Journey, first visit (landing + 8 clicks) | 13.2 s, landing 3.0 s | 36.0 s, landing 26.3 s |
| Journey, return visit | 11.6 s, landing 3.1 s | 12.2 s, landing 4.0 s |

For a signed-out visitor sync costs on every measure but the click, where it gains about 50 ms on the median
page. The two cumulative journey lines never cross. A text page that completes at 0.6–0.8 s without sync
completes at 1.6–1.9 s with it: each load also asks `/sync/bootstrap?skeleton` and `/sync/delta`, writes to
IndexedDB, and re-renders. Not measured: signed-in editing, offline, or live updates, which are what sync is
for.

## Report redesign, parallel runs, and the availabs.com script time (2026-11-20)

- **Report** now leads with a scorecard (first load / returning load / navigate × see it / use it / all there,
  0–100 = % of pages fast + half the % ok; limits in `score.mjs`) and "Where the time goes": the wait until
  Complete split into Server, Scripts, Component data, Page data, Files, Other (`collect.js` `phases`), as
  share bars and one stacked column per page. New numbers per visit: `usable`, `phases`, `dataKinds`
  (component / content / sync / tracking), `loadingSections`.
- **Runner**: `--parallel` (default 3; 1 is the careful number). Loads record which pages each page links to
  (`run.links`); the click pass uses that to pick a page that links to the target, skips pages nothing links
  to (`orphan`), and flags a link that is there on a direct load but missing after an in-app navigation
  (`navStale`). NOT YET RUN: written while a MitigateNY run was using the machine.
- **Finding, MitigateNY**: after the session clicks to a hazard page (e.g. `/assess_risk/natural_hazards/drought`),
  the link to its `mitigation_strategy` child is not in the DOM, though it is on a direct load of the same page.
  That is why those pages had no click measurement. To confirm with the new `navStale` flag.
- **availabs.com vs the local production build**: no difference beyond noise
  (`scratchpad/hub-test/perf/2026-11-20-1312-availabs-local/compare-availabs-live.html`).
- **availabs.com script time** (CPU profile of `/work`, local production build; 12.5 of 15.7 s sampled in two
  Lexical functions). Each rich-text section in view mode swaps its server HTML for a live read-only Lexical
  editor in a layout effect (`ui/components/lexical/editor/index.tsx`, `staticFirst`). `/work` has 73 of them,
  `/lab` 60, `/home` 40, `/platform` 37.
  - 7.3 s: `UpdateEditor`'s effect calls `editor.setEditorState()` in a microtask on mount, although
    `initialConfig.editorState` already holds the same value. The commit runs Lexical's
    `$internalCreateSelection`, which reads the DOM selection (~100 ms per editor).
  - 4.2 s: `setRootElement` → reconcile → `$setElementIndent` → `getComputedStyle()` on each editor's root: a
    forced style recalculation per editor (~58 ms each), against ~10,700 CSS rules.
  - Options, not built: (1) skip the redundant `setEditorState` on first mount in view mode; (2) keep the
    static HTML and go live only when a section nears the viewport, on idle or on first interaction; (3) never
    mount Lexical in view: static HTML (also generated in the browser for in-app navigation) with delegated
    handlers for collapsibles and buttons; (4) fewer CSS rules in the bundle (all themes ship together).
  - Tracking: each measured page view posts `/track/visit`; a live run adds its visits to the site's data.

## Decided (owner, 2026-11-18)

1. **The target is a setting of each run.** Runs are saved as JSON on disk, and the report compares saved
   runs. Each visit is repeated; min, max, average and median are reported.
2. **Sync is detected and recorded, not switched by the tool.** A run measures the settings it is pointed at.
   The report must show sync's trade: a slower first load for faster later ones (the journey and break-even
   above). No run-time override is added to DMS; a sync comparison is two builds, two runs.
3. **Signed-in runs use `DMS_EMAIL` / `DMS_PASSWORD`** from the root `.env`.
4. **Default size is the whole pattern**, with `--sample` (and `--pages`, `--pages-from`).

5. **Preload is part of the mode** (owner, 2026-11-18). The run records the pattern's `preload_data`, the
   report states it, pages are flagged when a section still loaded in the browser, and `compare` reports two
   runs that differ in it as different modes. `preload_data` was added off by default
   (pattern-preload-setting.md, 2026-05-06); the owner wants to start turning it on by default. That is a
   DMS change of its own, to be judged with this tool: a run with it off and a run with it on, same pages.

## Testing checklist

- [ ] Two runs of unchanged code compare as "no change" on every page (the noise rule holds). Tried with 2
      repetitions on the dev server: 8 of 9; to repeat with 5 on a production build
- [ ] A known change shows up: the BILD index on the lightning risk profile; hydration payload on / off
- [ ] "Complete" agrees with the eye on a text page, a table page, a map page and a risk profile
- [ ] Click navigation measured on Chrome 151+; the fallback (URL change → Complete) on older
- [x] Warm visit really is warm: JS 7.3 MB → 0.3 MB on the second load; IndexedDB kept (the return journey)
- [ ] Mode detection is right on an SPA build, an SSR build and a sync build (right on the hub: SSR, sync on,
      preload on, dev build; SPA and non-sync builds not tried)
- [ ] The journey on a sync build and a non-sync build of the same site: first-load cost, per-click gain and
      break-even are all reported
- [ ] `--sample` picks the same pages for the same pattern and N; `--pages-from` reuses a run's list
- [ ] The tool itself doesn't slow the page: collector overhead under 1 % on a risk profile

## Sources

- Web Vitals: https://web.dev/articles/vitals
- Soft navigations (Chrome 151, web-vitals v6): https://developer.chrome.com/docs/web-platform/soft-navigations-experiment
- Lighthouse variability: https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md
- Lighthouse user flows: https://github.com/GoogleChrome/lighthouse/blob/main/docs/user-flows.md
- Ours: `documentation/sync.md`, `documentation/dms-server-env.md`, `render/spa/dmsSiteFactory.jsx`,
  `api/index.js`, `patterns/page/siteConfig.jsx`, `dataWrapper/index.jsx` (`data-dms-loading`),
  `dms-server/src/pdf/render.js` (`waitForReady`), `deploy/targets.json`,
  perf-auth-revalidate-duplicate-fetch.md, page-hydration-payload.md, site-web-analytics.md
