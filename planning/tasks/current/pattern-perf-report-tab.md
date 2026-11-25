# A Performance tab on each pattern: run a perf test on the server and read its reports

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** built · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

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

- [x] A run from the tab finishes and its report matches a CLI run's shape on the same pages (the same engine and
      run folder; the CLI's `report` and `compare` read the server's runs)
- [x] A private, loopback or non-https origin is refused (route test)
- [x] A second run while one is going gets 409; Cancel stops the browser (route test)
- [x] A user without `edit-pattern` gets no tab and a 403 from the routes (403: route test; the tab is gated by
      tabPermission like the others, not checked in a browser with such a user)
- [~] The newest `DMS_PERF_KEEP` are kept (route test). Surviving a deploy: the folder is on the `var` volume, not
      checked in the image
- [~] The CLI: `dms perf report` and `compare` checked on server-saved runs; `dms perf run` only loads (it needs
      a target and a site connection)

## Progress log

- 2026-11-25 — created at the owner's request, with [app-settings-pages.md](./app-settings-pages.md), to close out
  the page-load performance initiative. Decisions 1–2 above taken. Not started.
- 2026-11-25 — **Phases 1–4 built** (not committed). Owner: "lets implement the performance page now".
  - **Phase 1, the engine moved** to `packages/dms-server/src/perf/`: `runner.mjs`, `collect.mjs`, `detect.mjs`,
    `stats.mjs`, `config.mjs`, `aggregate.mjs`, `score.mjs`, `compare.mjs`, `report/` (the `.js` ES modules renamed
    `.mjs`: dms-server is CommonJS), and `pages.mjs` (choosing the pages: `homePage`, `choosePages`). `src/dms/perf/`
    keeps the CLI front: `cli.js` imports the engine from there, `pages.js` still reads the page list through the dms
    CLI and re-exports the chooser. `playwright` → `playwright-core`, added to dms-server's dependencies (its lock
    updated with `--package-lock-only`; the image installs from package.json). The runner finds Chrome as
    DMS_PERF_CHROME, PUPPETEER_EXECUTABLE_PATH, /usr/bin/chromium, the system's Chrome, then Playwright's own, and
    adds `--no-sandbox --disable-dev-shm-usage` when it runs as root. `runPerf` takes `signal` (cancel: closes the
    browser), `onRecord` (progress) and `meta` (kept on run.json). The report: `renderReport` returns the HTML
    (`writeReport` writes it), and a server run's header says it was measured from the server, and by whom.
    The engine's 6 tests moved to `tests/test-perf.mjs` (`npm run test:perf`, in `npm test`): pass.
  - **Phase 2, the job and routes** `src/perf/index.js`, mounted beside the PDF export: as designed, plus
    `GET /_dms/perf/runs/:id/run.json` and `GET /_dms/perf/compare?a=&b=`. Every route needs `edit-pattern` on the
    pattern through `requireCan`, with `mode: 'enforce'` (a run costs minutes of server CPU, so not under `log`);
    the progress route needs a signed-in user and the run's id. The origin check reuses the PDF export's
    `checkHost` (now exported, with the variable named per caller): https, the request's own Origin, not a private
    address; `DMS_PERF_ALLOW_PRIVATE=1` for development. Runs: `runs` 1–5, `parallel` 1, profile `public`,
    sample 10 by default. A cancelled or stopped run still gets a report of what was measured.
    `tests/test-perf-routes.js` (`npm run test:perf-routes`, needs a Chrome; not in `npm test`): 8/8 against a tiny
    local site: the refusals, 401/403, a 2-page run with report and run.json, 409, compare, cancel, keep.
  - **Phase 3, the tab** `patternEditor/pages/perfTab.jsx` (+ `.theme.js`, `admin.perfTab`): page patterns only,
    after Activity, in the editor and the sidenav (tabPermission: edit-pattern). Run card (pages 10/25/all,
    repetitions 1/3/5, visits, a label), progress with Cancel (polls every 2 s), the runs table (when, who, pages ×
    repetitions; first load / returning / navigate: median complete time and the "all there" score; mode pills),
    a report or a comparison of two ticked runs in a sandboxed frame. The page list is loaded with `apiLoad` as the
    Activity tab does; the origin is the address the admin is open on. A server without the routes: "This server
    can't run performance tests yet".
  - **Phase 4, docs:** `src/dms/perf/README.md` (where the code is; running from the admin),
    `documentation/dms-server-env.md` (Performance runs: `DMS_PERF_DIR`, `DMS_PERF_KEEP`, `DMS_PERF_ALLOW_PRIVATE`,
    `DMS_PERF_CHROME`), dms-server `tests/CLAUDE.md`. No new extension point.
  - **Browser check** `scratchpad/perf-e2e/check.mjs`: 8/8 in Chromium against a production SSR build and a local
    server (`DMS_PERF_ALLOW_PRIVATE=1`) with a 3-page pattern: Performance in the pattern's sidenav; the tab with no
    runs; Run → progress → the run in the table with its times and scores; POST 202 and polling; Report in a frame
    ("measured from the server"); a second run and Compare; no page errors. (The report's commits first showed
    dms-server's folder as the app's: the job now passes the app checkout's root.)
  - **Not done:** a check in the deploy image (its Chromium, as root, the `var` volume): after a server deploy, one
    run from the tab on a real site.

