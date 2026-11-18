# dms perf

Loads every page of a pattern the way visitors do, records how long each took, and compares saved runs.
Design and status: `planning/tasks/current/perf-measurement-tool.md`.

## Run it

The commands are added to the `dms` CLI through a `.dmsrc` (`"commands": ["src/dms/perf/cli.js"]`; dms-template's
root `.dmsrc` already has it). Two addresses are involved:

- the **site** (`--host`, `--app`, `--type`, or the `DMS_*` variables): where the page list is read from;
- the **target** (`--target`): the address a visitor loads pages from.

```bash
# every published page of the pattern, 5 runs, all four visit types
dms --host http://localhost:5555 --app mny --type test \
  perf run --pattern MitigateNY_2025 --target http://mny.localhost:5555 --label baseline

# a quick check: 10 pages, 3 runs
dms … perf run --pattern MitigateNY_2025 --target http://mny.localhost:5555 --label try --sample 10 --runs 3

# after a change: the same pages and the same journey as the baseline, then compare
dms … perf run --pattern MitigateNY_2025 --target http://mny.localhost:5555 --label after --pages-from <baseline dir>
dms perf compare <baseline dir> <after dir>

# write a run's report again
dms perf report <run dir>
```

| Flag | Default | |
|---|---|---|
| `--pattern` | (required) | the pattern to walk, by name or id |
| `--target` | (required) | origin pages are loaded from |
| `--config <file>` | | a JSON file with any of these settings; flags win |
| `--label` | `run` | part of the run's folder name |
| `--runs` | 5 | repetitions of every visit |
| `--sample <n>` | all pages | n pages spread evenly across the pattern, always with its home page |
| `--pages a,b` | | these pages only (slugs) |
| `--pages-from <dir>` | | the pages and journey of a saved run |
| `--visits` | `cold,warm,click,journey` | |
| `--journey-steps` | 8 | in-app clicks in the journey |
| `--quiet-ms` | 500 | how long a page must be quiet to count as idle |
| `--timeout` | 60 | seconds before giving up on one page |
| `--out` | `scratchpad/<app>-<type>/perf/<date>-<label>` | |

It uses the system's Chrome through Playwright (`DMS_PERF_CHROME=/path/to/chrome` to name another).

**Measure a production build.** A dev server (Vite) serves unbundled, uncompiled modules; the report marks such
a run "Dev build". It is fine for trying the tool and useless for judging a change.

## What a run is

A folder with:

- `run.json`: the settings, the pages, the journey's route, the **mode the target was found in** (server-rendered
  or SPA shell, sync on or off, the pattern's preload setting, signed in or out, dev or production build), Chrome
  and machine, both repos' commits.
- `visits.jsonl`: one line per visit, every repetition, raw.
- `report.html`.

**Preload** is a pattern setting (`preload_data`, in the pattern editor; off unless a pattern turned it on). With
it on, the page loader fetches each data section's rows before the first render. The run records the pattern's
setting, the report says which it was, and each page is flagged when a section still showed its loading state
(its data came from the browser, not the preload). Two runs that differ in it are reported as different modes.

The tool never switches a site's mode. It measures the target as it is and records what it found, so comparing
modes means comparing two saved runs.

## Visit types

| | |
|---|---|
| **cold** | a new browser profile, straight to the URL |
| **warm** | the same profile, the same URL again: HTTP cache, `localStorage`, IndexedDB kept |
| **click** | the real link to the page, clicked on another page of the pattern (its parent, else the home page, else the page before it). Times run from the click. A link hidden in a collapsed menu is clicked from script |
| **journey** | one session: a cold landing on the pattern's home page, then N clicks along a fixed route; then the same route again in the same profile (the return visit). Recorded per step and added up |

The journey is what shows a trade like sync's: a costlier first load for cheaper later ones. Comparing a sync run
with a non-sync run gives the landing's extra cost, the gain per click, and the click where the two cumulative
lines cross.

## The numbers

| | |
|---|---|
| Server responded | first byte of the document (TTFB) |
| First paint | FCP |
| Main content | LCP; for a click, from Chrome's soft-navigation entries (Chrome 151+, or the flag the runner sets) |
| **Complete** | the last time the visible page changed: a section carried `data-dms-loading`, nodes were added or removed, an image / script / stylesheet / font finished loading |
| **Idle** | the last time anything happened: Complete, plus background requests (sync's bootstrap) and long tasks |
| Blocking time | the part of each main-thread task past 50 ms, after First paint |
| Layout shift | CLS up to idle |
| Transferred, data, hydration data | bytes over the wire; bytes of fetch/XHR responses; size of the router's hydration data in the document |
| Data requests, duplicates | fetch/XHR requests; the same method, URL and body sent again in one visit |

The runner waits until the page has been idle for `--quiet-ms`, then reads Complete and Idle as the times of the
last activity of each kind (`collect.js`).

**`data-dms-loading` is the page's loading contract.** A section that loads after first render sets it while its
request is out. A section that paints to a canvas without touching the DOM (a map) is invisible to Complete
unless it sets it.

## Comparing

`dms perf compare <baseline> <candidate>` joins the two runs page by page and visit type. A change counts only
when it is larger than a floor (50 ms and 5 % for times) **and** larger than half the wider of the two runs' own
spreads (max − min). Everything else is "no change". It prints a summary and writes
`<candidate>/compare-<baseline label>.html`.

Two runs of unchanged code should compare as "no change" everywhere. If they don't, raise `--runs`.

## Files

| | |
|---|---|
| `cli.js` | the `dms perf` commands |
| `config.js` | run settings and profiles |
| `pages.js` | the pattern's page list, `--sample` |
| `collect.js` | the in-page collector, injected before any page script |
| `detect.js` | which mode the target is in |
| `runner.mjs` | the browser, the visits, saving |
| `stats.js` | min / max / average / median, the noise rule |
| `aggregate.mjs` | raw visits to per-page and per-visit-type numbers |
| `compare.mjs` | two runs |
| `report/` | the HTML report |
| `perf.test.mjs` | `node --test src/dms/perf/perf.test.mjs` |

## Not built yet

Signed-in and phone profiles, timing marks and `Server-Timing` from DMS, a Lighthouse sample, results as a DMS
dataset, field data from real visitors. See the task file's phases.
