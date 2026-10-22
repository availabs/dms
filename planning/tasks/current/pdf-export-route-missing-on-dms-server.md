# PDF export: the client calls a route dms-server doesn't have

**Initiatives:** [mny_pdf_exporter_ux](../../../../../planning/initiatives/mny_pdf_exporter_ux.md) · **Status:** todo (owner 2026-10-22: fix it in the PDF export redesign sweep, not on its own) · **Created by:** ssangdod@albany.edu · **Edited by:** —

**Project:** DMS library (`src/dms` submodule): `packages/dms` (client) + `packages/dms-server` · **Topics:** patterns/page, dms-server

## Objective

Make PDF export work on sites whose API host is dms-server. Do it as part of the PDF exporter redesign
sweep (initiative above), not as a standalone port.

## What's wrong (found 2026-10-22, permissions e2e stage 1, row K)

- `packages/dms/src/patterns/page/components/saveAsPDF/PrintWell/selectablePDF.js` (`selectablePDF`, line 34, and
  `selectablePDF2`, line 61) posts to **`${API_HOST}/dama-admin/hazmit_dama/downloadpdf`**. The pgEnv
  `hazmit_dama` is hard-coded.
- dms-server has no such route: `POST /dama-admin/hazmit_dama/downloadpdf` → 404 for anon and admin on a local
  dms-server.
- The route only exists in the old server: `avail-falcor/dama/routes/data_types/pdf-generator/pdf-generator.routes.js`
  (`route: '/:pgEnv/downloadpdf'`, line 469; puppeteer renders the HTML, pdf-lib assembles it, `adm-zip` for
  bundles; `debug.js` beside it). It was never ported.
- So PDF export only works where `API_HOST` is still the old avail-falcor server. Callers: `ExportPdf.jsx`
  (section component) and the PrintWell page.

## For the redesign sweep

- Decide where rendering lives: port the puppeteer route into dms-server (a `dama/` datatype or a plain route; needs
  puppeteer in the server image), or render client-side.
- Drop the hard-coded `hazmit_dama`: the PDF doesn't need a pgEnv at all.
- Keep `authedFetch` (token + pattern): the permissions move requires every REST call to carry them. Decide what a
  PDF export needs (login only, or `view-page` on the page's pattern).
- Test: export as an author and as anon, on SQLite and Postgres dms-server.

## Testing checklist

- [ ] Export from `ExportPdf` and PrintWell against a local dms-server
- [ ] Anon gets a sign-in / permission message, not a silent failure
- [ ] Same on a deployed dms-server site
