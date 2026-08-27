# Spreadsheet: external download trigger (`display.downloadOnParam`)

## Status: DONE 2026-08-27 (dataWrapper watcher + config control, BC)

## Objective
The in-section download icon (`allowDownload`) renders above the table and
can't sit on a TITLE row that lives in a different section (sections don't
overlap). Designs put the CSV control next to the table's heading. Owner idea:
an external button using the interaction system to trigger the download.

## Change (BC)
`display.downloadOnParam: '<key>'` on a Spreadsheet section: the dataWrapper
View watches that page param; when it becomes truthy it CLEARS the param
(so the URL stays clean and the click can repeat) and fires the exact same
`triggerDownload` the in-section icon uses (visible columns). Both param styles
work:
- **action param** (preferred): a lexical button with `actionType: 'setParam'`,
  `paramKey`, `paramValue` — `setActionParam` bus, no navigation, no URL, no
  history entry, active filters untouched. Cleared via `clearActionParam`.
- **URL variable**: any link setting a REGISTERED page var — cleared via
  `updatePageStateFilters(remaining, {key: true})`.

Surfaced as "Download Trigger Param" in the Spreadsheet's more-controls.

## Gotcha recorded
A lexical button with `keepSearchParams` and a QUERY-ONLY path (`?x=1`)
produces a malformed double-`?` URL (`linkPath = path + location.search`) and
drops the existing params — use the `setParam` action button for param-writing
buttons, not navigation.

## Motivating use
MNY Actions Dashboard: `allowDownload` off; the table-title lexical's right
column carries a "Download CSV" `setParam` button (`download_csv` → '1') and
the table sets `downloadOnParam: 'download_csv'`. Verified: fires with active
filters in the export, URL untouched, repeatable.
