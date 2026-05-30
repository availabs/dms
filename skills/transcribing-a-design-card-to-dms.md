# Transcribing a design card into a DMS card

How to take a **single card mockup** (one element from a design-system HTML page)
and reproduce it as a real DMS `Card` section — faithfully, and without quietly
bailing out to a custom component when a Card knob would do. This is a
**transcription** discipline: decompose the mockup into atoms, map each atom to a
Card primitive, build, then verify the live render against the mockup with a
screenshot loop.

> **Audience:** an engineer or AI matching a live DMS card to a design mockup.
> Read [`card-layout.md`](./card-layout.md) (every Card knob), then
> [`using-a-datawrapper-card.md`](./using-a-datawrapper-card.md) (data binding),
> and keep [`creating-page-section-components.md`](./creating-page-section-components.md)
> handy for when you must build a new column type.
>
> **The governing rule** (from [`/src/themes/CLAUDE.md`](../../../themes/CLAUDE.md)):
> build with Card cells; when the grid can't express something, add the *smallest*
> reusable primitive (formatFn / cardHints / theme token / a small column type) —
> not a one-off component. This skill is the procedure that makes that rule
> operational.

---

## The loop

```
   ┌──────────────┐     ┌─────────────────┐     ┌──────────────┐     ┌───────────────┐
   │ 1. INVENTORY │ ──▶ │ 2. MAP each atom │ ──▶ │ 3. BUILD     │ ──▶ │ 4. VERIFY     │
   │ decompose    │     │ to a primitive   │     │ config +/-   │     │ Playwright    │
   │ the mockup   │     │ (decision ladder)│     │ new primitive│     │ side-by-side  │
   └──────────────┘     └─────────────────┘     └──────────────┘     └───────┬───────┘
          ▲                                                                   │
          └───────────────────── repeat until aligned ◀──────────────────────┘
```

Steps 1–2 are the real work; the table they produce *is* the plan. Step 4 just
tells you how close you are.

---

## Step 1 — inventory: decompose the mockup into atoms

Open the mockup HTML and break the card into the smallest independent visual
pieces. For the MAP-21 interstate card the atoms are: status badge, title, big
value (+ unit), target label, target bar, delta, margin caption, and the
card-level layout (alignment/spacing/surface).

Write them into a table — this is the transcription artifact you carry through the
rest of the loop:

| # | Atom | Mockup treatment | Candidate primitive | Authorable now? |
|---|------|------------------|---------------------|-----------------|
| 1 | Status badge | green pill, dot, tone from value | `status_pill` column type | **no — new primitive** |
| 2 | Title | sentence-case bold dark | `customName` + `valueFontStyle` token | yes |
| 3 | Big value | heavy navy, `%` smaller | `valueFontStyle` + `percent` formatFn | partly |
| 4 | Target text | inline `≥ 75%` | formula column / `customName` | yes |
| 5 | Target bar | progress + marker | `target_bar` column type | **no — new primitive** |
| 6 | Delta | `↑ +1.3` signed, colored | `delta` formatFn/column type | **no — new primitive** |
| 7 | Margin | `4.8 pts above target` | formula column | yes |
| 8 | Layout | left, compact, surface | Card `display` knobs | yes |

Fill the **last column honestly** — that split (config vs. new primitive) is the
whole decision, and Step 2 is how you make it.

---

## Step 2 — map: the decision ladder

For each atom, walk this ladder top-to-bottom and stop at the first match. The
pivotal rung is #3.

1. **Reshaping static text** (case, weight, color, font) → a `valueFontStyle`
   token + `customName`. No code. (e.g. the title, the big value's weight/color.)
2. **Reformatting a number** the same way for every row → a **`formatFn`**
   (`comma`, `abbreviate`, `combine`, …; add a new one if missing). No row context.
3. **The look depends on the value (or a sibling field)** — color that flips on
   meets/below, an arrow that flips on sign, a bar whose fill is a ratio, a badge
   whose tone is the status → **a small column type.** This is the line a
   `formatFn` or theme token *cannot* cross: a formatFn gets `(value)`, a theme
   token is fixed per column; only a **column type's `ViewComp` receives the whole
   row**, so only it can render conditionally. (Atoms 1, 5, 6.)
4. **Arrangement** — where cells sit, spans, alignment, gaps, surface → Card
   `display` + per-column `cellSpan`/`justify`/`cellWidth`. No code. (Atom 8.)
5. **The grid genuinely can't arrange it** (a map, a chart, a PDF export, a layout
   no cell composition can express) → and *only* then → a new **section
   component** (`creating-page-section-components.md`). The KPI card never reaches
   here — it is a grid of cells once atoms 1/5/6 have column types.

### Column type vs. extend-the-component — the crisp test

- **Column type** when the new thing renders **one focused visual element that has
  (or derives from) a value**: a pill, a bar, a sparkline, an arrow-delta. It
  slots into a normal Card cell; the section author still lays it out. Precedents:
  `src/themes/wcdb/columnTypes/streamPlayer.{jsx,config.js}` and `portraitBanner.*`
  — each renders exactly one element and declares `cardHints`. This is almost
  always the right answer.
- **New section component** only when the component must own the **entire
  composite layout** because no arrangement of cells can produce it. Building a
  big column type that renders the *whole* card (badge + value + bar + delta in one
  cell) is the **anti-pattern** — it recreates the Card grid badly, in a place the
  author can't reach. Split it into atoms; give each its own column type.

> Rule of thumb: if you can describe the new thing as "a cell that shows X," it's a
> column type. If it's "a region containing several things arranged," it's cells —
> possibly several small column types — not one component.

### Logging gaps

When Step 2 lands on "new primitive," add it to the **primitive-gap ledger** in the
build task before you build, then: implement under
`src/dms/packages/dms/src/...` (or a theme `columnTypes/` folder for theme-local
types), surface any new knob in `Card.config.jsx`'s controls so it shows in the
toolbar, and document it in `card-layout.md`. Every future card then gets it for
free — that's the payoff for not writing a one-off.

---

## Step 3 — build

Do the **authorable atoms first** (title, value style, target/margin formula
columns, alignment). They're free and usually close 50–60% of the visual gap, which
makes the remaining primitive work easy to see. Then build the column types from
the ledger. Keep edits draft-only; never publish.

---

## Step 4 — verify with Playwright (the screenshot loop)

### What Playwright is, from zero

Playwright is a library that **drives a real browser from a script**. You tell it
"open this URL, wait for this element, take a picture of it," and it runs an actual
headless (invisible) Chromium to do exactly that. We use one slice of it: **render
a page and screenshot one element.** We are *not* automating clicks or writing
tests — just capturing pixels so we can compare mockup vs. live.

The mental model is six calls, all `await`ed (every call is a round-trip to the
browser process):

```js
import { chromium } from "playwright";
const browser  = await chromium.launch();              // 1. start a headless browser
const context  = await browser.newContext({            // 2. an isolated profile…
  viewport: { width: 1480, height: 1200 },
  deviceScaleFactor: 2,                                 //    …2× = retina-crisp text
});
const page     = await context.newPage();              // 3. a tab
await page.goto(url, { waitUntil: "networkidle" });     // 4. navigate (file:// or http://)
await page.locator(sel).screenshot({ path: out });      // 5. crop a screenshot to one element
await browser.close();                                  // 6. tear down
```

- **`url`** is either the mockup (`file:///…/map-21-system-performance.html`) or the
  live dev server (`http://localhost:5173/list/<slug>?year_record=2025`).
- **`locator(sel)`** is a CSS selector. The mockup already exposes clean hooks —
  `[data-dms-section="kpi-interstate"]`. For the live card, target the section's
  rendered id/attribute (e.g. `#section-<id>`); inspect the DOM once to confirm.
- **`.screenshot()` on a locator** crops to that element's bounding box — you get
  just the card, not the whole page.
- **fonts**: web fonts load late; the helper `await`s `document.fonts.ready` so text
  isn't captured in a fallback face. (Mockup uses Tailwind CDN + brand fonts; live
  uses the theme's — small font differences between them are expected.)

### One-time install

Playwright isn't in this repo yet. Installing it adds the npm package **and
downloads a Chromium binary** (~120 MB) into a local cache:

```bash
npm i -D playwright          # the library
npx playwright install chromium   # the browser it drives (one download)
```

(Both are local/dev-only and reversible — `npm rm playwright` + delete the cache.)

### Run the loop

A ready-made helper lives at **`scripts/card-shot.mjs`** (config-driven; its header
comments re-explain the API). It shoots the mockup atom and the live atom, then
stitches a labeled side-by-side:

```bash
node scripts/card-shot.mjs \
  --name interstate \
  --mockup "src/themes/transportny/TransportNY Design System/dms_design_system_v2/pages/map-21-system-performance.html" \
  --mockup-sel '[data-dms-section="kpi-interstate"]' \
  --live "http://localhost:5173/list/map_21_system_performance?year_record=2025" \
  --live-sel '#section-2173919' \
  --out scratchpad/npmrdsv5-dev2/transcribe
```

Output: `interstate.mockup.png`, `interstate.live.png`, and `interstate.compare.png`
(side-by-side). Eyeball the compare, adjust the card config/primitive, re-run. The
URL pins `?year_record=2025` so the data is deterministic between runs.

### ⚠️ Back up the draft page before automating edit-mode loads

A **draft** page is only visible at `/edit/<slug>`, and **edit mode mounts the
section manager, which can auto-persist `draft_sections` / `draft_section_groups`.**
Hammering the edit URL with a screenshot bot (or a load that races page hydration)
can save a *degraded* layout — in the worst case wiping the page's section list to 0
while leaving the component rows orphaned (the page renders blank though the cards
still exist). This happened during development.

**Rules:**
1. **Snapshot the page row before any edit-mode screenshot session**, and keep it off
   volatile `/tmp`:
   ```bash
   dms raw get <pageId> > scratchpad/<env>/backups/page_<pageId>.good.json
   ```
2. **Restore instantly if a shot comes back blank / the section count drops:**
   ```bash
   # confirm the loss first
   dms raw get <pageId> | node -e 'let s="";process.stdin.on("d",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.draft_sections?.length))'
   # restore the data object
   dms raw update <pageId> --data "$(node -e 'console.log(JSON.stringify(require("./scratchpad/<env>/backups/page_<pageId>.good.json").data))')"
   ```
3. **Take few, settled shots** (`--wait` generous, `networkidle`), not rapid-fire
   loops. Component-row edits (`raw update <sectionId>`) and card config are safe; it's
   the *page row* in edit mode that's fragile.
4. Component edits live in their own rows, so restoring the page never undoes card
   work — the page just re-points its layout at the (intact) components.

### Theme edits need a dev-server restart (the loop's other foot-gun)

`Card.jsx`/component edits and card-config (data) edits hot-reload, so the loop shows
them immediately. **Code-theme edits (`themes/<brand>/theme*.js`) are assembled at app
boot and do NOT reliably hot-rebuild** — the dev server *serves* the new module (you
can `curl` it to confirm) while the running app keeps the old theme object. If a theme
change isn't showing, restart `npm run dev` before concluding the edit is wrong. (Cost
real debugging: a header-casing theme fix looked broken for several shots purely
because the live theme was stale.)

### Caveats (each one will bite once)

- **Dev server must be up** (`npm run dev`) and the **DMS server** running
  (`:3001`), with the **draft page** saved. The screenshot reflects current draft
  state.
- **Auth (you WILL hit this on a draft page).** Playwright's context starts with no
  cookies, so an auth-gated DMS site redirects to `/auth/login` and the card never
  renders. Worse: a **draft** page can only be seen at `/edit/<slug>` (view mode
  shows only *published* sections — 0 on a draft), and edit is auth-gated. So you
  need a saved session. Capture one once with the headed helper, then pass it with
  `--storage`:
  ```bash
  node scripts/save-auth.mjs \
    --url "http://npmrds.localhost:5173/edit/<slug>?year_record=2025" \
    --out scratchpad/<env>/auth.json
  # a real browser window opens — log in by hand; it saves & closes itself
  node scripts/card-shot.mjs … --storage scratchpad/<env>/auth.json
  ```
  The session lasts until the token expires; re-run `save-auth.mjs` when shots start
  landing on the login screen again. On an open localhost, omit `--storage`.
- **Draft pages need `/edit/`, and the host is subdomain-based.** The live URL is
  `http://<pattern-subdomain>.localhost:5173/edit/<slug>` (e.g.
  `npmrds.localhost`), not the `/list` admin base. Sections render as
  `<div id="<sectionId>">`, so the live selector is `[id="<sectionId>"]` (CSS ids
  can't start with a digit, so use the attribute form, not `#2173919`).
- **Selector stability.** Prefer an id/`data-` attribute over deep class chains; the
  live DOM's classes are theme-driven and churn.
- **It's a ruler, not a generator.** Playwright tells you *how far off* you are; it
  never writes card config. The inventory table (Step 1) is still where the mapping
  happens.
- **Don't commit screenshots.** `scratchpad/` is gitignored — keep them there.

---

## Worked target — the MAP-21 interstate KPI card

| Atom | Decision | Status |
|------|----------|--------|
| Title, big-value style, target text, margin caption, alignment | authorable (Step 2 rungs 1/2/4) | do first |
| `status_pill` | column type (rung 3) | ledger |
| `target_bar` | column type (rung 3) | ledger |
| `delta` (sign+arrow+color) | formatFn or column type (rung 3) | ledger |

Live card: section **2173919** on page **2173915**; mockup atom
`[data-dms-section="kpi-interstate"]`. The three column types are the
[primitive-gap ledger](../planning/tasks/current/map21-single-page-dms-build.md)
items; once built and registered, the card is pure cell composition.

## Source-of-truth files

- `scripts/card-shot.mjs` — the Playwright screenshot/compare helper.
- `card-layout.md` — every Card display/column knob, the `formatFn` table, `cardHints`.
- `creating-page-section-components.md` — how to build a column type / section.
- `src/themes/wcdb/columnTypes/` — `streamPlayer`, `portraitBanner`, `nowIndicator`:
  worked single-element column types (the pattern atoms 1/5/6 should follow).
- `src/themes/CLAUDE.md` — the configure-the-Card-don't-write-a-component principle.
