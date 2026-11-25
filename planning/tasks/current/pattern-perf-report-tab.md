# A Performance tab on each pattern: run a perf test on the server and read its reports

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

**Project:** DMS library + dms-server · **Topic:** patterns/admin · **Created:** 2026-11-25

## Objective

An admin opens a pattern, goes to its **Performance** tab, presses **Run**, and later reads the report: how
long visitors wait on that pattern's pages, the scorecard and where the time goes, as the `dms perf` report
already shows. Past runs stay listed so two can be compared. This is phase 6 of
[perf-measurement-tool.md](./perf-measurement-tool.md) ("results … with a report page"), with a Run button.

## Decided (owner, 2026-11-25)

1. **A Pattern Editor tab.** A run walks one pattern's pages, so it belongs to the pattern.
2. **Runs execute on dms-server**, as a background job like the PDF export (`dms-server/src/pdf/`), using the
   image's own Chromium. The CLI (`dms perf run`) stays for careful runs from a developer's machine.

## Design

### The job (dms-server, `src/perf/`)

- `POST /_dms/perf/run { app, pattern, origin, pages: [path], profile: 'public', visits, runs, sample }` → `{ id }`
- `GET  /_dms/perf/run/:id` → `{ state, done, total, current, error }` (progress while it runs)
- `DELETE /_dms/perf/run/:id` → cancels
- `GET  /_dms/perf/runs?app=&pattern=` → the saved runs, newest first: id, when, who, label, mode, page count,
  scorecard
- `GET  /_dms/perf/runs/:id/report.html` (and `run.json`): the saved report

A job, not one request, for the PDF export's reason: nginx cuts proxied requests at 120 s. **One run at a time
per server**; a second gets 409 with who is running what.

**Who may run:** a signed-in user holding `edit-pattern` on that pattern, judged on the server through the auth
layer's pattern check. Reading reports: the same.

**The code:** the runner, aggregation, scoring and report move from `src/dms/perf/` into
`packages/dms-server/src/perf/`. The server image copies only that package, and `src/dms/perf/` stays as the
CLI front (`dms perf run / report / compare`) importing from there. Playwright is replaced by `playwright-core`
(no browser download) pointed at the image's Chromium (`PUPPETEER_EXECUTABLE_PATH`, `/usr/bin/chromium`), which
the runner already supports (`executablePath`).

**What it visits:** the pattern's pages on the site's public address (`origin`, the address the admin page is
open on), as an anonymous visitor (the `public` profile) in v1. The page list comes from the client (it already
has the pattern's pages, as the PDF export's does), so the server needs no page-listing code. **The origin is
checked** so the server can't be pointed at its own network: `https:` (or `http://localhost` in development),
the request's `Origin` header, and a host that doesn't resolve to a private or loopback address.

**Defaults sized for a shared server:** a sample of 10 pages (always the home page), cold + warm + click, 3
repetitions, one page at a time (`parallel: 1`). The report says it was measured **from the server**, whose
CPU the browser shares with the site it measures, so its numbers are for trends on that server, not
comparable with a laptop run.

**Where results go:** `var/perf/<app>/<pattern id>/<run id>/` (`run.json`, `visits.jsonl`, `report.html`), on
the server's lasting `var` volume. Kept: the newest 30 runs per pattern. (A DMS dataset for trends is later.)

### The tab (library, `patterns/admin/pages/patternEditor/pages/perfTab.jsx`)

- Registered like Pages and Data Sources for page patterns, with the `edit-pattern` gate.
- **Run** card: sample size (10 / 25 / all), visits, repetitions, a label; Run; a progress bar while it runs
  (poll `GET /run/:id`), Cancel.
- **Runs** table: when, by whom, label, pages, the scorecard numbers (first load / returning / navigate), mode
  pills (SSR, sync, preload); opening one shows its report in a frame; two ticked → **Compare** (the existing
  `compare` report, made on the server).
- An older server (no `/_dms/perf` routes, 404) shows "This server can't run performance tests yet".

## Phases

1. **Move the engine** into `dms-server/src/perf/` (ESM, dynamic `import()` from the CJS server), CLI front kept;
   `playwright-core` + system Chromium; the CLI's unit tests pass from the new place.
2. **The job and routes**, the origin check, one-at-a-time, cancel, retention; tests over HTTP against a tiny
   local site (a run of 2 pages × 1 repetition; refusal of a private origin; 409 for a second run; 403
   without `edit-pattern`).
3. **The tab**: run, progress, runs list, report, compare. Checked in a browser against a local production build.
4. **Docs**: perf README (running from the admin), `dms-server-env.md` (`DMS_PERF_DIR`, `DMS_PERF_KEEP`,
   the Chromium path), extension-points if a new seam appears.

## Open questions

- Signed-in runs from the server (the `editor` profile) would need a credential on the server. v1 runs public
  only; the caller's own token, as the PDF export's `mode: 'self'`, is the likely way later.
- Lighthouse in server runs (phase 5 of the tool) is left out of v1.

## Testing checklist

- [ ] A run from the tab finishes and its report matches a CLI run's shape on the same pages
- [ ] A private, loopback or non-https origin is refused
- [ ] A second run while one is going gets 409; Cancel stops the browser
- [ ] A user without `edit-pattern` gets no tab and a 403 from the routes
- [ ] Results survive a server deploy (the `var` volume); the newest 30 are kept
- [ ] The CLI still works: `dms perf run / report / compare`

## Progress log

- 2026-11-25 — created at the owner's request, with [app-settings-pages.md](./app-settings-pages.md), to close out
  the page-load performance initiative. Decisions 1–2 above taken. Not started.
