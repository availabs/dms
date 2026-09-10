# AVL Graph — graph-chrome theming (legend, card padding, admin surface)

**Status:** PASS 1 DONE + live-verified 2026-09-10 · PASS 2 NOT STARTED · **Started:** 2026-09-09

---

## ▶ START HERE — current state, 2026-09-10

This file is long because it carries the whole design argument and three rounds of corrections. If
you are picking this up cold, you only need this block plus the two sections it points at.

**The goal, in Ryan's words:** "make TransportNY, and the reports pages, look better." Anything
broader defers to a later task. Work is organised as nine visible punch-list items (see the artifact
below and the "Numbering map" section) across three passes.

### DONE — 6 source files, all live-verified

| # | What | Where |
|---|---|---|
| Pass 1, items 01-03 | Gradient legend no longer draws outside its own box; three bands (ramp / 4px mark gutter / labels) so **nothing is drawn on the gradient**; ramp shrinks with a narrow row; inline titles truncate instead of being crushed | `graph_new/components/avl-graph/components/Legend.jsx`, `graph_new/GraphComponent.jsx` |
| Fallback fix | A gradient legend with no usable colour ramp now renders **nothing** instead of a fabricated `0/0.25/0.5/0.75/1` key | `Legend.jsx` (guard in the exported `Legend`) |
| Admin editor | `avlGraphSettings` generates a control per class-string token; the preview pane draws a real graph | `graph_new/theme.js`, **new** `graph_new/Graph.docs.js`, `ui/docs.js` |
| Editor crash fix | The theme editor died for **any** section-component preview (lazy-docs race) | `patterns/admin/pages/themes/editTheme.jsx` |

See **"PASS 1 — IMPLEMENTED"**, **"Fallback fix — DONE"** and **"Admin theme-editor pieces — DONE"**
below for the measurements, the A/B that proves the corpus diffs came from a `git pull` and not from
this work, and a bug I introduced and then caught by measuring (a `max-width`ed flex item freezes and
stops shrinking — use `flex-basis`).

### NEXT — pass 2, item by item, in this order

1. **Legend prop separation + brand wiring** (items 05, 09). Separate the settings bag from the
   computed draw data across the six graph wrappers + `Legend.jsx`'s signature, **keeping the old flat
   shape accepted** (Ryan's MitigateNY insurance call — comment it so nobody deletes it as cruft).
   Add the `classNames` injection in `GraphComponent.jsx` (snippet in correction 2). Then set
   transportny's values — the design system's chip treatment, **not** the older authored
   mono/uppercase values; details in the transportny task file's "Proposed values".
2. **Units on gradient tick labels** (item 07) — derive from `display._measurePick.measure`, which
   every report graph already stores, so **no report needs regenerating**.
3. **Tooltip** (item 06) — Ryan put this in scope. Same shape as the legend but a level deeper: it
   threads through each chart type rather than riding the legend prop bag. `HoverCompContainer`
   already accepts a `theme` prop and never reads it, and nobody passes one.
4. **Padding last** (item 08) — as a **per-section chart setting**, not a change to
   `styles[0].padding`. That is what keeps MAP-21 and tsmo2 on today's 16px.

Then **pass 3** (item 04, the collapsing legend), and **last of all** the `reportInlineTitle`
dead-code removal + the 367-section regen.

### Four constraints that must not be broken

1. **Core `avlGraphTheme` defaults stay byte-identical to today's literals.** This is the only thing
   protecting MitigateNY's **7,415** legend-rendering graphs, which are almost all `CategoricalLegend`.
   Assert it in a test; don't infer it from reading the theme file.
2. **Item 04's `collapse` default is today's behaviour**, with only transportny opting in. It is the
   one remaining item that touches `CategoricalLegend`.
3. **Nothing in this task may require regenerating a report.** If a change would, it is putting a
   decision in the DB that belongs in the theme or in code — rework it. (The inline-title `||`
   back-compat is what buys this; see that section.)
4. **`Legend`'s old flat prop shape keeps working.** Deliberate exception to Ryan's
   no-dead-code-paths preference, for MitigateNY.

### How to verify

```bash
# local API is :3001 (.env), NOT the :4444 in CLAUDE.md's examples
node scripts/npmrds-reports/report_probe.mjs \
  "reports/annual_average_study?routes=2207838&asOf=2026-07-23" --auth --wait 18000 \
  --eval scratchpad/npmrds-sub/tmp/legend_geom.mjs --no-json     # geometry: expect slack_in_box: 0
node scripts/npmrds-reports/probe_corpus.mjs                     # mandatory on every touch
```

- **Data-bearing legend page:** `reports/annual_average_study?routes=2207838&asOf=2026-07-23` (4 real
  gradient ramps + 4 categorical legends). `reports/snapshot` and `reports/seasonality` render
  **blank** for lack of data and are useless as legend fixtures — that's the known data gap.
- **Theme editor:** `http://www.localhost:5173/list/theme/47f862e5-3e7b-4dff-a80a-28e57c127359/graph`
  — pick `avlGraph` in the left dropdown. The `theme_id` is **not** the theme row's id; see
  `skills/using-the-admin-theme-editor.md`, written 2026-09-10 because none of this was documented.
- The `--eval` probes used above live in `scratchpad/npmrds-sub/tmp/` (gitignored, throwaway); each
  one is small enough to rewrite from the measurements quoted in the sections below.

### Read next
Artifact **https://claude.ai/code/artifact/8adeb3e1-a319-4ba2-9f4e-6a4580b72bf8** ("Report Graph
Punch List") is the plain-language version of all nine items — glossary first, then See → Why →
After per item. Ryan's feedback on the first draft was that a ranked-code-findings review read as
vague; the artifact is the corrected form, and the same lesson applies to whatever gets written next.

---

## Objective

`theme.avlGraph.chartDefaults` already carries brand-driven axis fonts/colors/gridlines
(`avlgraph-theme-integration.md`, `graph-axis-font-theming.md`, both DONE 2026-06-03) — merged under a
section's own `display` via `mergeChartDefaults`, threaded into `GraphComponent.jsx` (e.g.
`axisFontProps`). The **legend never got that same treatment**: `Legend.jsx` takes no theme prop at
all, and the graph card's own outer padding is one untouched Tailwind class shared by every site. This
extends the established pattern to both.

**Reframed 2026-09-10, in Ryan's words.** "The impetus behind this research/task, which I should have
stressed, is to **make TransportNY, and the reports pages, look better**. Work that goes beyond that
can be deferred to a separate later task." So:

- The measure of done is **what a report page looks like**, not the breadth of the token surface.
- The scope is **graph chrome** — legend + **tooltip** (Ryan: "it kinda needs to be included, it will
  be very obviously out of place otherwise") + card padding — not just "legend and padding".
- The **admin theme-editor** work is explicitly *secondary* and is included only in its cheapest form,
  justified by **verification speed** (its live preview shows a token change without a report-page
  rebuild), not by the admin story. Anything beyond those two pieces defers.
- Dark mode is out. See "Decided by Ryan" below.

This is Phase 5 ("open-ended graph/section polish") of
`planning/transportny/tasks/current/npmrds-reports-routes-feedback-triage.md`, split out here per the
root `CLAUDE.md` task-routing rule (the target files live in this submodule). See
`planning/transportny/tasks/current/graph-card-padding-and-legend-theming.md` for the transportny-side
tracking (the actual per-site token values, live-verification against real report pages).

## Current-state grounding (2026-09-09, read the real code, not assumed)

**Padding — already themeable, just never tuned.** `GraphComponent.jsx`'s outer wrapper (~line
166-171) applies `theme.padding` as a Tailwind class directly. `theme` =
`getComponentTheme(contextTheme, 'avlGraph', activeStyle)` (`graph_new/index.jsx:102-103`) — a real,
wired lookup. Core (`graph_new/theme.js`) defines **two** styles, `"Light Mode"` (index 0) and
`"Dark Mode"` (index 1), both `padding: "p-4"`. Transportny (`themev2.js:1971-1977`) defines **only
one** style, named `"default"` (index 0, pinned via `options: { activeStyle: 0 }` — transportny's
avlGraph has no dark-mode variant at all), also `padding: "p-4"` — identical to core, never actually
tuned. ~~This sits *inside* the generic per-section grid-cell gutter (`sectionArray`'s
`defaultPaddingStep`, transportny = `"3"` = 12px) — two stacked paddings today.~~ **Wrong, corrected
2026-09-10 (correction 4 below): that gutter is on the OUTER box, outside the card chrome that draws
the border/radius/bg (`sectionArray.jsx:100-106`). `p-4` is the only padding inside a card — nothing
is stacked, so there is no redundancy to reclaim.**

**Legend — zero theme tokens in the render path, but a scaffold for exactly this already exists,
dead.** Legend *position* is already handled UI-side (`composeMeasureConfig.js`'s
`DEFAULT_LEGEND_POSITION_BY_GRAPH_TYPE`, seeded once at section-creation; a QuickControls "Legend"
pill lets an author change it live — that piece is done, out of scope here). The actual legend
**render** (`ui/components/graph_new/components/avl-graph/components/Legend.jsx`) is 100% hardcoded
Tailwind, confirmed via `grep -n "theme\." Legend.jsx` — zero matches: fixed text sizes
(`text-xs`/`text-sm`), fixed swatch sizes (`w-4 h-4`), fixed `SizeMap` pixel dimensions, hardcoded
tick-mark styling (`border-current`). `chartDefaults.legend` today only carries `{ show }`
(`graph_new/theme.js:35`).

**Real find, not in the original grounding pass**: transportny's `graph.styles[0]` (`themev2.js`)
already defines `legend: "flex items-center gap-4 font-mono text-[10.5px] uppercase tracking-wider
text-slate-500"` and `legendSwatch: "h-0.5 w-4"` — flat Tailwind-class theme keys, sitting right next
to `axis`/`grid`/`tooltip`/`title`/`subtitle`/`text`. Confirmed via a repo-wide grep
(`theme\.legend\b|\.legendSwatch\b`, `src/`) that **none of these five are ever read** by
`GraphComponent.jsx`, `Legend.jsx`, or any axis renderer — only `title`/`subtitle`/`text`/`textColor`/
`padding` are actually consumed (`GraphComponent.jsx:32,38,46,168`). This reads as an earlier,
abandoned attempt at exactly this theming pass — `axis` was superseded when the axis-font work added
the more granular `chartDefaults.xAxis`/`yAxis` keys instead, but `legend`/`legendSwatch`/`tooltip`
were never picked back up. ~~**Open decision for Ryan**: repurpose/wire these existing flat keys …, or
delete them as dead weight and theme purely through `chartDefaults`.~~ **Decided 2026-09-10 — it's a
false choice: wire them AND add flat `chartDefaults` keys, split by the test "would a section author
ever want to override this on one graph?" See "The corrected token contract" below. Note the
transportny values themselves should be *replaced*, not revived verbatim — the design system's report
mockup later converged on `Legend.jsx`'s own render (16px rounded swatch, sentence-case 12px Proxima
label, `npmrds-report.js:361`), so the authored mono/uppercase/`h-0.5` treatment is the older look.**

**A real, reproducible bug this gap causes** (confirmed live on `reports/snapshot`,
`getBoundingClientRect()` measurement on 3 of the affected graphs, not eyeballed — see the
transportny-side file for exactly which): the gradient/scale legend's outermost tick sits flush
against the graph card's own right edge — `card.right - svg.right` showed a ~17px margin for the
chart's own axes, but the legend overlay ignores that margin entirely and its last tick label clips
against the card boundary. Zero unit suffix is ever appended (a bare `44` reads as nothing without the
y-axis label alongside it). GridGraph specifically (`GridGraph.jsx` ~line 199-213) builds its `legend`
object (categorical swatch-list, or `VerticalLinearLegend`/`HorizontalLinearLegend` for a d3
`scaleLinear` gradient) and renders through this same untheme'd component — the graph type most likely
behind the "legend quality pass, especially GridGraph" ask.

**Confirmed NOT in scope of this fix**: the Route Map's own legend (the "Legend / 1 LAYER" overlay with
a `VALUE` label + info icon seen live on `reports/snapshot`) is a **completely separate code path** —
`gis_dataset/pages/Map/Layer2.jsx`'s `LegendContainer`/`LegendCmp`, themed via `mapTheme.legend.*`
(`MapEditor/components/LayerEditor/PopoverEditor/PopoverControls.jsx`), nothing to do with
`graph_new/Legend.jsx`. An earlier draft of this doc listed "Route Map" among the affected graphs by
visual similarity alone, without checking the render code — corrected here. If the Map's own legend
needs the same clipping/unit treatment, that's a separate, unscoped task against
`gis_dataset/pages/Map/`.

## Design artifact

**https://claude.ai/code/artifact/8adeb3e1-a319-4ba2-9f4e-6a4580b72bf8** ("Report Graph Punch List",
rewritten 2026-09-10) — the current one, and the right entry point. **Rewritten after Ryan's feedback
that the first version was too vague and jargon-heavy** ("You say a ton of stuff but its kinda vague
and uses a lot of pronouns and IDK what it means"): it now leads with a glossary of the five terms
that caused it (categorical legend / gradient legend / ramp / tick / squeeze guard), then nine
punch-list items each written as **See → Why → After** in plain language, ordered by visibility on a
report page. The code contract is demoted to a short "how it's built" section. Contains the horizontal
linear legend rebuilt at true pixel geometry (same absolute offsets as the real component) for items
01-03, before/after tooltips for 06, and the three collapse tiers for 04.

Superseded, do not send anyone to these:
- The 2026-09-10 first version of the same URL, titled "Graph Chrome Tokens" — organized as
  corrections-to-a-plan rather than around what a report page looks like. Same content, wrong frame.
- `https://claude.ai/code/artifact/9ffcc86a-768e-4fef-9f14-f9abeb76d545` ("AVL Graph Skins",
  2026-09-09) — the 3-skin NPMRDS/Ledger/Console framing; its token shape is the one corrected below.

**Lesson worth keeping:** a design artifact for this project should lead with what changes on screen
and define its terms. Ranked code findings read as vague to someone who isn't holding the code.

## Numbering map (this file ↔ the artifact)

This file numbers **corrections 1-4** and **defects 5-6** — those are review findings. The artifact
numbers **punch-list items 01-09** — those are things a reader sees on a report page. They map:

| Artifact item | Here |
|---|---|
| 01 last gradient number cut off | correction 3 (anchoring, not `endCapMargin`) |
| 02 color bar is 250px regardless of card | defect 5 |
| 03 title and legend fight over one row | defect 6 + the `reportInlineTitle` section |
| 04 legend wraps to 3 lines on a small card | pass 3 / decision 4 |
| 05 legend has no brand styling | the original ask; correction 1 (key names) + 2 (plumbing) |
| 06 tooltip has no brand styling | decision 1 — Ryan put it in scope |
| 07 gradient numbers carry no unit | correction 3's tail (drop the `unit` token, use `valueFormat`) |
| 08 card padding uniform and untuned | correction 4 |
| 09 numbers jitter | new, trivial (`tabular-nums` in the Layer A keys) |

## The four corrections (2026-09-10, each checked against the code)

**1. `legend.scale` is a name collision that fails in exactly the case it targets.** Every graph
wrapper spreads `props.legend` and then *overwrites* `scale` with its own d3 color scale —
`components/GridGraph.jsx:206-212` unconditionally, `components/BarGraph.jsx:262-273` whenever
`colors.byValue`. A nested `chartDefaults.legend.scale` object is destroyed one hop before
`Legend.jsx` reads it. It would appear to work on a *categorical* legend (nothing overwrites `scale`
there) and silently vanish on the linear one. **Wrapper-owned keys any new token must avoid:**
`type`, `orientation`, `scale`, `colors`, `colorsByKey`, `categories`, `format`, `actions`,
`onEnter`, `onLeave`. Author-owned: `show`, `position`, `size`, `label`. Everything else is free.
Flat is also what the merge already supports — `mergeChartDefaults` (`index.jsx:21-29`) deep-merges
`legend` exactly one level, so a section writing `display.legend = {show, position}` keeps every
theme key beside it; a nested object would need that merge deepened too.

**2. The threading step is already built, and not in the file the old scope named.**
`GraphComponent.jsx:277` already passes `legend={get(graphFormat, "legend", {})}`, and
`GraphComponent` never renders `Legend` at all — the six graph wrappers do, each already spreading
`{...legend}` into it. **Any flat key added to `chartDefaults.legend` reaches `Legend.jsx` as a prop
today with zero plumbing.** The only real plumbing question is the class-string layer, which
`Legend.jsx` can't resolve itself (the style is picked per-section by `activeStyle`, which the legend
never sees) — one injection at `GraphComponent.jsx` covers all six wrappers without touching them:

```js
legend={ {
  ...get(graphFormat, "legend", {}),
  // Theme-sourced chrome. Injected here, not read in Legend.jsx: the legend can't resolve the
  // section's own activeStyle. `classNames` collides with none of the wrapper-owned keys above.
  classNames: { row: theme.legend, swatch: theme.legendSwatch, label: theme.legendLabel,
                tick: theme.legendTick, ramp: theme.legendRamp },
} }
```

**3. `endCapMargin` asks the theme to pay for a layout bug, and can't cover it.**
`HorizontalLinearLegend` declares a box of exactly `SizeMap.medium` = 250×30, then positions the
terminal tick's label at `translate(scale(max) + 4px)` (`Legend.jsx:191-197`) — the label *starts 4px
outside its own container* and runs its full text width further. The two interior "above" ticks escape
the top the same way (`-200%`), and `VerticalLinearLegend` renders four cells of `height/4` **plus** a
fifth tick, so it overflows its declared height by one tick. Every report card is rounded, and a
rounded section chrome box gets `overflow-hidden` (`sectionArray.jsx:126`) — so this is a hard clip,
not a tight margin. A fixed margin can't size it: `formatMinutesAuto` (`components/utils.js:37-42`),
which is GridGraph's *own default* formatter, emits `"14.06 min"` ≈ 54px, so the overflow is ~42px and
`endCapMargin: 14` covers a third of it. **Fix by anchoring, not reserving:** interior ticks center on
their value, the first tick left-aligns at `x=0`, the terminal tick right-aligns to the ramp end, and
the above-row gets a reserved band. Rendered box == declared box for any label length, on every site,
themed or not — which matters because no other site will ever set `endCapMargin`.

**4. The padding half depends on the legend half, and there's no double padding to remove.** The
section's gutter is on the *outer* box; the card chrome (border/radius/bg) is an *inner* box inside
it, and content padding inside the card is explicitly the component's job
(`sectionArray.jsx:100-106`). Nothing is stacked — the earlier "two stacked paddings today" reading
was wrong. `p-4` is the only padding inside a card, and because the card clips, it is currently the
accidental cover the overflowing legend depends on: cutting it to `p-3` before correction 3 lands
makes the clip 4px worse. The design system already has the answer nobody cited — graph-card contract
clause 4 (`pages/npmrds-report.html:50`, "Plot padding is the card's, not the section's. Section
padding is the grid gutter") is what's implemented, and the mockup spends it *asymmetrically*
(`px-4 pt-4` plot, `px-4 pb-3` under the legend). `theme.padding` is a free-form class string, so the
asymmetry needs **no code at all**.

## Two defects the old scope didn't cover

**5. The gradient ramp is a hardcoded absolute width that ignores the card.** `SizeMap` is
`{medium: [250,30], large: [400,40]}` (`Legend.jsx:7-10`) — pixels, not proportions. On a size-4 card
(~268px of content width) a top-positioned 250px ramp consumes the whole row. The squeeze guard is
deliberately scoped to categorical legends only (`enabled: legend.type === "categorical"`,
`components/BarGraph.jsx:390-393`) on the reasoning that a linear legend "is a fixed pixel width by
design", and GridGraph — the type most likely to carry one — has no guard at all. So `rampLength`
should resolve as `min(value, 100%)`, not be another absolute number.

**6. With the inline title, title and legend are both unshrinkable.** They share one
`justify-between` row (`components/GridGraph.jsx:424-432`); transportny's `title` token ends in
`shrink-0` (`themev2.js:1982`) by design, and the legend can't shrink either because its ramp child
has an explicit `width:250px`, which floors the flex item's `min-width:auto`. Two unshrinkable items
in a narrower row overflow, and the rounded card clips whichever loses. Defect 5 fixes half; the rest
is the clause-5 decision below.

## The corrected token contract — two layers, one test

The old "open decision" between flat class-string keys and nested `chartDefaults` is a false choice:
both idioms are already here and both are right. The test that assigns a token to a layer is
**"would a section author ever want to override this on one graph?"**

**Layer A — class strings on the `avlGraph` style** (brand chrome, never per-section), authored next
to `title`/`subtitle`/`text`/`padding`, delivered via the `classNames` injection above:
`legend` *(exists, dead)*, `legendSwatch` *(exists, dead)*, `legendLabel`, `legendTick` (the place
`tabular-nums` belongs), `legendRamp` (radius / hairline ring), `legendDot` (only if clause 5 gets
built), `tooltip` *(exists, dead — `HoverCompContainer` takes a `theme` prop, never reads it, and
nobody passes one)*, `padding` *(exists, live)*.

**Layer B — flat keys under `chartDefaults.legend`** (author-overridable by construction, CSS/numeric
valued, exactly the axis-font precedent; unset ⇒ today's literal so a site that sets nothing renders
identically): `show`/`position`/`size` *(exist)*, `rampLength`, `rampThickness`, `tickCount` (the
hardcoded 5 quartile ticks; 3 on a narrow card), and optionally `collapse: 'cap' | 'dots'`.

**Dropped from the old shape:** `scale` (collision), `endCapMargin` (the anchoring fix replaces it),
`unit` (`format` already does this — GridGraph already passes one, so the unit belongs in that
measure's `valueFormat`), and `swatchSize`/`gap`/`fontSize`/`fontWeight`/`textColor` (these are look,
so Layer A, where Tailwind arbitrary values already cover them).

The three dead keys aren't abandoned scaffolding to delete — `legend`, `legendSwatch` and `tooltip`
are authored in transportny's theme *and* in the design system's own `theme.js`, two independent
statements of intent. They were never wired, which is a different problem from being wrong.

## The admin theme editor — secondary, included only for verification speed

**Scope note, Ryan 2026-09-10:** "The admin side of this is really secondary… But I guess if the admin
stuff is easy and/or makes it easier for us to verify, I am ok doing it now/soon/earlier." So this is
in, at its cheapest, for one stated reason: **the editor has a live preview, so a legend/tooltip value
can be changed and seen immediately instead of rebuilding a report page and reloading.** That's the
justification to hold it to — not the admin-empowerment story. Everything past the two pieces below
defers to its own task.

`patterns/admin/pages/themes/editTheme.jsx` is a live in-product theme editor: per-component controls
generated from `theme.settings(theme)` beside an iframe live preview. Two gaps stop it covering graphs:

- **`avlGraphSettings` exposes one control** — a style picker, nothing else (`graph_new/theme.js:62-76`).
  Not one token is editable, including the ones this task adds.
- **The preview pane has no graph** — `compOptions` lists `Graph`, but `ui/docs.js` has no `Graph`
  entry, so the pane falls back to `UI['Graph']` with no props. **This is the piece that makes the
  other one useful for verification** — without it there's nothing to preview against.

The first is nearly free: `SideNav.theme.jsx:126-133` already generates one `Textarea` per key of the
active style (`path: \`sidenav.styles[${activeStyle}].${k}\``). Copied to `avlGraph`, every Layer A
class string becomes editable the moment it's wired, with no per-key work. Layer B's nested
`chartDefaults` keys aren't covered by that flat generator — leave them out unless a pass-2 value
actually needs live tuning.

## `reportInlineTitle` — first proposal WITHDRAWN, revised below

**~~Drop the `theme.titleInlineWithLegend` term so `legend.show && position.startsWith("top")` is the
rule on its own, then delete `styles[1]` and both stamps.~~ WRONG — Ryan caught it 2026-09-10:**

> "I am pretty sure this will cause a regression for all graphs that have a legend at the top. The old
> styling, before `reportInlineTitle`, had the title on its own line no matter where the legend was.
> The theme boolean check, I believe, is so that ALL OTHER projects don't automatically have their
> legends/titles rearranged… Theres a bunch of sites OUTSIDE of transportNY that also use `avl-graph`
> and are built with the assumption that the graph title and legend will get their own row."

He's right, and `GraphComponent.jsx:146-152`'s own comment says exactly this ("NOT the site-wide
default, so most NPMRDS graphs are untouched") — I read it and reasoned past it. Dropping the flag
switches the inline row on for every site with a top legend. **Do not do this.**

### Revised twice. FINAL (Ryan's call, 2026-09-10): drop the theme token, defer the removal to last

> "your new fix, I think you can drop the theme token for it. Because the graph setting for inline
> title is new, all existing stuff wont have it set, so it wont cause any regressions. We are still in
> the testing/validation phase, so we can regenerate / recreate reports if we need to. Id rather keep
> the code clean / concise than keep in this (or almost any) dead code path that we no longer need.
> BUT, since I'd need to regen to test the inline titles, I want you defer the 'remove dead code'
> portion of this to the end, after we have validated pretty much all other pieces."

**His no-regression reasoning is right, with one distinction worth stating so nobody misreads it
later:** it holds for **other sites** — none of them set `display.title.inline`, so dropping the theme
token leaves them exactly as they are (title on its own line). It does **not** hold for **existing
NPMRDS report sections**: **367** of them carry `activeStyle: 'reportInlineTitle'` (measured above),
and those render a *stacked* title until regenerated. That's the regen he's accepting, and it's why the
removal goes last.

**Sequence, in this order:**
1. Add the `display.title.inline` path; both builders set it on new sections. Keep
   `theme.titleInlineWithLegend` working (the `||`) so the 367 existing sections are untouched while
   items 01-09 are validated.
2. Validate everything else (passes 1-3).
3. **Last:** delete the `||` back-compat term, delete `styles[1]` (`reportInlineTitle`) from
   `themev2.js:2028-2044`, delete both `activeStyle` stamps — then regenerate the 367 report sections
   and verify inline titles came back.

Shape of step 1 (the flag survives, default off, so no site is affected):

```js
// 1 · core ChartDefaults — every site keeps today's behaviour
title: { inline: false }

// 2 · transportny brand chartDefaults — ALSO false, preserving Ryan's 2026-09-04 call that this is
//     deliberately not site-wide (Macro View / MAP-21 / hand-authored stay stacked)

// 3 · the report builders set it per section, next to where they already set legend.position
state.display.title = { ...state.display.title, inline: true };

// 4 · GraphComponent — the OR is what avoids a migration for existing sections
const titleInline = (Boolean(theme.titleInlineWithLegend) || Boolean(get(graphFormat, ["title", "inline"])))
  && Boolean(get(graphFormat, ["legend", "show"]))
  && String(legendPosition || "").startsWith("top");
```

What it buys:
- No named variant to stamp; `useAddGraphSection.js:112` and `report_build.mjs:1609` get simpler.
- Kills the "which variant did this section pick" problem behind correction 2 for the legend path.
- The setting lands with every other graph setting, so it's reachable per-section from the CLI or a
  build script today (Ryan 2026-09-10: a setting is useful even with the UI deferred), and a Settings
  drawer control can follow later. Today an author can't toggle it at all.
- A future report tweak doesn't need a second named variant.
- After step 3 there's no dead path left — which is the point, per Ryan's preference.

Item 03 (letting the title truncate in that row) is independent of where the flag lives and should
happen in pass 1 regardless.

## PASS 1 — IMPLEMENTED 2026-09-10 (items 01-03)

**Files changed (2, both core — no theme values, no site values, nothing stored):**
- `ui/components/graph_new/components/avl-graph/components/Legend.jsx` — both linear legends
  rewritten as three bands (ramp / 4px mark gutter / label band) with **percentage** tick positions;
  terminal and first labels anchored inward; `VerticalLinearLegendTick` and
  `HorizontalLinearLegendTick` removed (neither was exported); `CategoricalLegend` **untouched**.
  New tick-count fallback `5 → 3 → 2` via `fitRampTicks`. `SizeMap` values unchanged.
- `ui/components/graph_new/GraphComponent.jsx` — `GraphTitle` takes an `inline` prop; when sharing a
  row with a top legend it gets `min-w-0 overflow-hidden` on the wrapper and `truncate` + a native
  `title` tooltip on the text, with `flexShrink:1; minWidth:0` as an **inline style** (a theme's
  `shrink-0` can't be beaten by class order — stylesheet order decides).

**Verified live** (`reports/annual_average_study?routes=2207838&asOf=2026-07-23`, a data-bearing
corpus page; API on `:3001`; probe `scratchpad/npmrds-sub/tmp/legend_geom.mjs` via
`report_probe.mjs --eval`):
- ✅ Real gradient, real domain (28.9 → 33.4 mph), 5 ticks, declared box **250×35**.
- ✅ **`slack_in_box: 0` on every gradient legend** — the last label's right edge now lands exactly on
  the box's right edge. Pre-fix it *started* 4px outside the box, so this was ≈ −28px for a "33.4"
  label and ≈ −42px for `formatMinutesAuto`'s "14.06 min". **This is the pass-1 gate, met.**
- ✅ Nothing drawn on the gradient: DOM shows ramp `height:15px` at the top, mark gutter
  `top:15px; height:4px`, labels at `top:19px`.
- ✅ Title truncation live (`truncate`, `title` attr, `flex-shrink:1`), and it measurably freed width:
  clipped titles went 2-of-3 → 0-of-3 at a wide viewport, 3-of-3 → 1-of-3 at 640px.
- ✅ **Golden corpus: no regression from this change.** The run reports 5 "was blank → has content"
  Blockers and a set of "query no longer fires" Majors — **all of them reproduce with both files
  reverted to HEAD**, so they come from the pulled changes, not from pass 1. One apparent difference
  in the first A/B pair turned out to be the known cold-load LineGraph flake: it reproduced in the
  reverted arm on both re-runs. 0 console errors, 0 page errors, 0 SQL errors throughout.

**A bug I introduced and then fixed, worth keeping in the file:** the first implementation sized the
legend `width:100% + max-width:250px`. Per the flexbox algorithm an item clamped by `max-width` is
**frozen** at that cap and stops shrinking — measured live at a 640px viewport (row ≈286px): the
legend held its full 250px and the graph *title* collapsed to 24px instead, i.e. exactly the bug item
03 exists to fix. Replaced with `flex: 0 1 <natural>px` on the `Legend` wrapper (grow 0 so it never
exceeds natural size, shrink 1 so a tight row takes it below), verified applied live as
`flex: 0 1 250px`.

**Shrink path — VERIFIED 2026-09-10** (`scratchpad/npmrds-sub/tmp/shrink.mjs`, which constrains the
real header row in-browser; the flex negotiation under test *is* the row's, so narrowing the row is the
mechanism, not a proxy — what it does not prove is that a size-4 card produces such a row, which the
design system already asserts at ~244px):

| row width | legend | title | tick overlaps | slack in box |
|---|---|---|---|---|
| 1414px (natural) | 250 | 63 | 0 | 0 |
| 300px | **230** | 58 | 0 | 0 |
| 200px | **150** | 38 | 0 | 0 |

The legend absorbs most of the squeeze (250 → 150) while the title gives up far less (63 → 38) — the
intended priority, and the inverse of the `max-width` freeze it replaced.

**One residual gap, precisely bounded:** `fitRampTicks` estimates against the NATURAL width, so its
tick-count choice is optimistic once the ramp has shrunk. Measured above: harmless for short numeric
labels (5 ticks at a 150px ramp still had 0 overlaps). The failing corner is **long labels AND a
narrow ramp** — e.g. `formatMinutesAuto`'s "14.06 min" (~54px): at 250px the estimate correctly drops
to 3 ticks, but if the ramp then shrinks to 150px those 3 would crowd. Labels stay inside the box
either way (anchoring guarantees that); they'd overlap each other. Fixing it exactly needs a measured
width — a `ResizeObserver`/`useLayoutEffect` like `useLegendSqueezeGuard` already runs. Left out
deliberately; revisit if a real report shows it.

### Fallback fix — DONE 2026-09-10 (Ryan: "sure, do that fallback fix fast")

The no-usable-ramp case (pre-existing bug 1 below) now **renders nothing** instead of a fabricated
key. Guard in `Legend.jsx`'s exported wrapper, after the hooks: a linear legend must have a `scale`
whose `range()` is a non-empty array of **strings** (a real ramp's range is CSS colours; d3's default
`scaleLinear()` range is the numbers `[0,1]`, which is exactly what was leaking through). Categorical
short-circuits on `type === "categorical"` and is untouched — that's the MitigateNY path.

No message is rendered in the failure case on purpose: the chart's own empty state already reports the
missing data, and there's no honest label for the other way this fails (real data, empty palette).

Verified live:
| page | legend boxes | real ramps | fabricated `0…1` keys |
|---|---|---|---|
| `reports/snapshot` (blank, was showing the fake key) | 0 | 0 | **0** (was 6) |
| `reports/seasonality` (8 blank GridGraphs) | 0 | 0 | **0** (was 8) |
| `reports/annual_average_study` (real data) | — | **4** | 0 |

And the guard is provably linear-only: the same data-bearing page still renders **4 categorical
legend items with real labels** ("35E QUEENS MIDTOWN EXPY …") alongside its 4 gradient ramps.

**Two pre-existing bugs found while verifying (NOT caused by this pass; #1 now fixed above):**
1. **A gradient legend with no scale renders as `0 / 0.25 / 0.5 / 0.75 / 1` with no colours at all.**
   Confirmed on `reports/snapshot` (BarGraph, `colors.byValue`) and `reports/seasonality` (8
   GridGraphs), and confirmed identical with `Legend.jsx` reverted to HEAD, so it long predates this
   work. Mechanism: `buildValueColorScale` returns `undefined` when min/max aren't finite or the
   palette is empty (`components/utils.js:95-106`), the legend then falls back to its
   `scale = scaleLinear()` default parameter (domain **and** range `[0,1]`), and
   `background: linear-gradient(to right, 0,1)` is invalid CSS so the browser drops it. Arguably worse
   than the clipping this pass fixes — a legend that silently lies about the domain.
2. **Both those pages render blank** — `paths=0 rects=1` per GridGraph, i.e. no data, which is *why*
   min/max aren't finite. That's the known data-coverage gap, out of scope
   (`project_data_gaps_out_of_scope`), but it means neither page is usable as a legend fixture.
   `reports/annual_average_study` is the one that has real data.

## Admin theme-editor pieces — DONE 2026-09-10 (both, plus a crash fix)

Justification remains verification speed, not the admin story (Ryan 2026-09-10).

**How to actually reach it** — undocumented until now, and it cost 3 wrong URL guesses:
`http://www.localhost:5173/list/theme/<theme_id>/<component>`, where
- `/list` is `VITE_DMS_BASE_URL` (`.env:10`), passed to `DmsSite` as `adminPath`;
- **`<theme_id>` is the UUID from the SITE ROW's `theme_refs`, NOT the theme row's id.** For
  npmrdsv5/dev2 that's `47f862e5-3e7b-4dff-a80a-28e57c127359` (the theme row itself is `1677773`,
  which does *not* work). Get it from `/list/themes` — the list links to the right URL;
- `<component>` is a lowercased `compOptions` value from `editTheme.jsx` (`graph`, `button`, …).

**1. `graph_new/theme.js` — `avlGraphSettings` now exposes tokens.** Was a style picker and nothing
else. Adds a generated "Graph Tokens" group: one `Textarea` per **class-string** key of the ACTIVE
style, same shape as `SideNav.theme.jsx:126-133`, so a token added to any brand's graph theme appears
with no per-key work. Filtered to strings deliberately (`chartDefaults` is a nested object — a
Textarea bound to it renders `[object Object]` and writes that back on save); `name` excluded too,
since styles are selected BY NAME in places (`activeStyle: 'reportInlineTitle'`) and renaming one
would silently detach every section pointing at it.

**2. `ui/docs.js` + new `graph_new/Graph.docs.js` — the preview pane draws a real graph.**
`compOptions` had always offered `Graph`, but there was no docs entry, so the pane fell back to a
propless `UI.Graph`. Two fixtures, chosen to cover the two legend KINDS the tokens differ on: a
2-series BarGraph (swatch legend) and a single-series `colors.byValue` BarGraph (colour ramp). Static
data — the graph section reads `state.data` and fetches nothing, so no source/dmsEnv/network needed.

**3. Crash fix in `admin/pages/themes/editTheme.jsx`** — found by doing the above.
`componentDocs` is lazy-loaded, so the preview frame's FIRST render resolved every `props` lookup to
`undefined`. Most previews tolerate that; a **section** component doesn't — `Graph` threw
`TypeError: Cannot destructure property 'pageState' of 'pageContext' as it is undefined`
(`graph_new/index.jsx` reads `pageContext` unconditionally) and, with no error boundary in that frame,
**took the whole theme editor down**. Now gated on the docs being loaded, not on `props`, so a
component with no docs entry keeps rendering propless exactly as before, one tick later.

**Verified live** at the URL above: no crash (0 page errors), 5 controls rendered, `avlGraph` present
in the settings dropdown, and inside the `about:srcdoc` preview frame — **1 `svg.avl-graph`, 2 legend
swatches ("Before"/"After")**, title, subtitle and both axes all rendering from the fixture.

**Left alone:** a pre-existing React `key` warning from `ControlRenderer`'s `.map` in the same file
(`editTheme.jsx:186`) — unrelated to this work, one line, not widened into scope.

**Not documented anywhere** — see the "next" note at the bottom of this file: the theme editor has no
how-to. `skills/translating-design-system-to-dms-theme.md` mentions it in passing three times (the
style `name` shows in its dropdown; the `options`/`styles` shape is "the format the theme editor
knows") but nothing states where it lives, the `theme_refs`-UUID gotcha, that the left pane is
generated from each component's `*Settings` export, or that the preview comes from `ui/docs.js`.

## Passes (each gate can actually fail)

Reframed 2026-09-10 to match the artifact's punch-list numbering. The impetus is **making TransportNY
report pages look better**; each pass ends with something visible on a real report page.

**Pass 1 — make the legend stop spilling out of its own box** (punch-list items 01, 02, 03). Anchor the
terminal/first ticks and reserve the above-row band; fix `VerticalLinearLegend`'s off-by-one-tick
height; make `rampLength` resolve as `min(value, 100%)` so the bar shrinks with the card, dropping to
3 ticks below a floor; let the inline title truncate (`min-w-0 truncate` + `title` attr). Pure layout —
no tokens, no theme values, every DMS site benefits without configuring anything.
*Gate:* on a real GridGraph using `formatMinutesAuto`, the last tick label's measured rect clears the
card's inner edge. Measured in the browser, not eyeballed.

**Pass 2 — put the brand on the legend and the tooltip** (items 05, 06, 07, 09, then 08 last). The
`classNames` injection + `Legend.jsx` reading each key with today's literal as the per-key fallback;
the flat `chartDefaults.legend` keys defaulting to `SizeMap`; **tooltip wired the same way but threaded
through each chart type** (it doesn't ride the legend prop bag); `tabular-nums` on both; units via the
measure's `valueFormat`; transportny's padding **last**.
*Gate:* a site setting none of the new keys renders byte-identically. Grep every `Legend` consumer,
not just the report path — the six wrappers, plus `columnTypes/stacked_bar.jsx`,
`themes/wcdb/ScheduleGrid.jsx` and `macroview.theme.js` hold same-named keys in **different** theme
scopes and must be shown untouched. Plus every NPMRDS graph type at the new padding, and the
golden-corpus `probe_corpus.mjs` pass at 0 console errors.

**Alongside pass 2 — the two cheap admin-editor pieces.** `avlGraphSettings` gains the generated
`Textarea` list (copy `SideNav.theme.jsx:126-133`); `ui/docs.js` gains a `Graph` entry with real props
so the editor's preview pane draws a graph. Justification is **verification speed**, not the admin
story: the editor has a live preview, so a legend value can be changed and seen without rebuilding a
report page. Anything beyond these two pieces defers to its own task.
*Gate:* edit a legend value in the theme editor, watch the preview change, reload, confirm persisted.

**Pass 3 — small-card behaviour** (item 04, the collapsing legend). The only item that adds new
behaviour rather than fixing or restyling existing behaviour, so it's separated and goes last. Three
tiers chosen by measuring (reusing `useLegendSqueezeGuard`'s existing measurement, which already
detects the squeeze and answers with a width cap — a worse answer than collapsing): full chips → one
truncating line → dots + count with a click/tap reveal.
*Gate:* a size-4 card with 2 routes shows one legend line; with 5 routes it shows the openable dot row.

## Round-2 corrections from Ryan, 2026-09-10 (things I had wrong)

**R1. Text/marks over the gradient are unreadable — and my proposed fix still had it.** Ryan: "your
proposed fix for this, fixes the cutoff issue. But the (Default?) font color is practically unreadable
when shown directly ontop of the colored gradient." Today the tick marks are `border-current` drawn
*across* the 15px bar (slate on amber/pale-yellow); my first anchored sketch still had the below-labels
overlapping the bar's lower half. Contrast against a gradient can't be solved by picking a color — the
background is five colors. **Revised: three explicit bands** — ramp (12px) / 4px tick-mark gutter /
label band — all labels on ONE side instead of alternating above-below, and **nothing drawn on the
gradient at all**. Combined with correction 3's anchoring and defect 5's tick reduction, the declared
box is `rampThickness + gutter + labelHeight` and holds for any label length.

**R2. Fix landmine 1, don't dodge it.** Ryan: "Are you dodging the mine, or fixing/removing it? It
doesnt really make sense to me for those graphs to blindly overwrite the theme?" Two things: (a) my
framing was misleading — the wrappers aren't overwriting *theme* values, they're filling in *computed
draw data* (colors, categories, the d3 scale, the format fn) into the **same object** that carries
settings, so it's one bag doing two jobs; (b) he's right that avoiding seven reserved names leaves the
trap armed. **Revised: separate the two** — settings stay in `legend`, computed data becomes its own
prop. Six wrappers + `Legend.jsx`'s signature; mechanical, nothing stored changes, no authoring
impact, safe inside pass 1. This supersedes the "avoid these seven keys" advice in correction 1 (keep
that list only as the reason the separation is needed).

**R3. Landmine 2 was badly worded — the legend CAN see the theme.** Ryan: "the legend doesnt get access
to the classNames / theme being used for the section?" It does, via React context. The narrow problem
is *which named style* applies, since that's stored per-section (`activeStyle`) and resolved at the top
of the graph where it's known; `Legend.jsx` never receives it, so self-resolving would guess wrong for
any non-default style. Passing resolved values down is one line where the lookup already happened, and
it's how axis fonts already reach the axis renderers. Note this disappears for the legend if the
`reportInlineTitle` variant goes away (see above).

**R4. Any collapsed legend must be openable; truncation is out.** Ryan: "if you are collapsing the
legend at all (i.e. not full chips), then the user needs to be able to see the full/expanded legend by
either hovering or clicking. Tier 2, I am not confident we will be able to truncate the route names in
such a way that a user could still easily identify which one is which." Both taken. Truncation fails
for a specific reason: comparison-series labels share a **prefix** and differ at the **tail** ("Route 5
Part NB 2019" vs "…2023"), so end-truncation destroys the distinguishing part. **Revised tier 2:
shared-prefix elision** — compute the common prefix, print it once as a label, chip only the differing
tails (`NY-9D NB · [■] before [■] after`). No prefix in common ⇒ nothing elided ⇒ identical to tier 1,
so it can never make things worse. **Tiers 2 and 3 both carry the reveal** (click and hover); only
full chips has no control, since nothing is hidden.

**R5. The API server was never down — I checked the wrong port.** Ryan: "The API server was never down?
I see both the client and dev server running locally, and I verified via browser." Correct. It's on
**:3001** per this checkout's `.env:31` (`VITE_API_HOST=http://localhost:3001`); I probed 4444 because
that's the example in the root `CLAUDE.md` instead of reading the config. Verified: `:3001` responds.
**Live verification is available** — pass 1's gate is a real browser measurement, and the one number
still marked illustrative (a size-4 card's inner width) can be measured rather than estimated.

**R6. Rule 1's scoping consequence, per Ryan's own answer.** Ryan: "For NPMRDS Reports, the author will
never want to override on a single one. In other projects, and perhaps maybe non-reports in TransportNY,
I guess it is possible. IDK how this will affect scoping." The two layers differ only in *where a value
is written* and therefore *who can change it*: a brand value lives in the theme and applies to every
graph on that site (another project setting a different value is the normal case, not an override); a
chart setting also has a theme default but any single graph can override it.

**Amended 2026-09-10 after Ryan's follow-up:** "For chart settings — its ok if the UI is deferred, it
could still be useful even if, right now, its only able to be utilized via CLI or code changes." So
the extra cost I attached to a chart setting (needing a Settings-drawer control to be worth anything)
was wrong — a setting reachable from `report_build.mjs` or the CLI is already useful, and the drawer
control is a follow-up. That removes the pressure to force values into the site-wide theme, which
matters because the site-wide theme is exactly what reaches MAP-21 and tsmo2 (see the blast-radius
section). Net:
- Visual *look* values (fonts, colors, swatch, ramp/tick styling, tooltip) → **brand values**. These
  land in *transportny's* theme, so they can't reach MitigateNY (own theme, sets none of these keys) —
  **conditional on core `avlGraphTheme` defaults keeping today's literals**, which is what protects
  MNY's 7,415 legend-rendering graphs. The tooltip additionally needs a MAP-21/tsmo2 browser check
  since it isn't gated on legend visibility.
- **`padding` → a chart setting**, specifically to keep MAP-21 and tsmo2 on today's value.
- Layer B otherwise keeps `show`/`position`/`size` (already there) plus `rampLength` and `tickCount`.
- Promoting another value to a setting later stays a small change; no need to design for it now.

## ⚠ Blast radius — CORRECTED 2026-09-10 (the first measurement was wrong; MitigateNY is the biggest consumer)

**My first pass at this queried `element-type = 'AVL Graph'` only, and concluded "legend work can't
reach any real non-report page." That is WRONG.** Ryan pushed on MitigateNY specifically ("`mitigateNY`
is the project that concerns me most") and he was right to.

`ComponentRegistry/index.jsx:54` maps **`Graph: GraphNew`** — the legacy `Graph` element-type resolves
to the *same* `graph_new` component as `AVL Graph` (the comment there says legacy sections upgrade
automatically). **MitigateNY uses the legacy type almost exclusively: 7,554 `Graph` sections vs 4
`AVL Graph`.** Filtering on `AVL Graph` hid essentially all of MNY.

Corrected sweep — **both element types**, all 101 schemas carrying a `data_items` table, legend
scoped to the `"legend":{…}` fragment (a bare `"show":true` match is useless: column definitions carry
their own `show` key, which is what made an earlier run report "hidden: 0" everywhere):

| Schema (app) | legend ON | legend off | **gradient legend** | categorical legend | `byValue` (any) |
|---|---|---|---|---|---|
| `dms_mitigat_ny_prod` (**MitigateNY**) | **7,415** | 90 | **0** | **7,520** | 4 |
| `dms_npmrdsv5` (TransportNY) | 4,226 | 1,025 | **1,220** | 3,006 | 1,220 |
| `dms_shaun_test_app` | 104 | 20 | 0 | 104 | 0 |
| `dms_dms_site` | 71 | 0 | 0 | 71 | 0 |
| `dms_landbank` | 3 | 35 | 0 | 3 | 0 |

**Second correction, 2026-09-10 (my error, caught by Ryan asking for links to MNY's 4):** an earlier
version of this table had a single "gradient (`colors.byValue`)" column showing 4 for MNY, and I read
that as "4 MNY graphs render a gradient legend." **It isn't the same thing** — that column counted
graphs that *colour by value* regardless of whether their legend is visible. Re-counted with both
conditions (`legend.show=true` AND `colors.byValue=true`): **MitigateNY renders ZERO gradient
legends**, and all 1,220 gradient legends in the entire database are TransportNY's. MNY's 4 `byValue`
graphs break down as: 2 with `legend.show=false` (ids 2413616 published / 2061332 draft — the same
BarGraph on the `mitigateny_2025` **Home** page, `/home`), and **2 orphans** (2389142, 2389145 —
referenced by no page or pattern at all, verified by a `data::text LIKE` scan over every page and
pattern row, 0 rows).

**MitigateNY renders more graph legends than TransportNY does.** Reproduce with
`$CLAUDE_JOB_DIR/tmp/sweep3.py`'s query shape; MNY config per `planning/mitigateny/skills/README.md:122`
(`DMS_APP=mitigat-ny-prod DMS_TYPE=prod` → schema `dms_mitigat_ny_prod`).

### What this changes, per item

- **Items 01-02 (gradient-legend geometry) — touch ZERO MitigateNY graphs.** A gradient legend needs
  `legend.show=true` AND `colors.byValue=true`; MNY has no graph meeting both. All 1,220 gradient
  legends in the DB are TransportNY's. So these two items are TransportNY-only in practice and need no
  MNY gate. (The intermediate claim that they reach "4 real MNY production graphs" was my
  miscount — see the second correction above.)
- **Item 04 (collapsing legend)** — touches `CategoricalLegend`, i.e. **7,520 MNY graphs**. This is
  where *all* of the MitigateNY exposure now sits. Its `collapse: 'cap'` default (today's squeeze-guard
  behaviour) is the **single most load-bearing default in the plan**, not a nicety. Only transportny
  opts into `'dots'`.
- **Items 05, 06, 09 (legend + tooltip brand values, `tabular-nums`)** — safe for MNY, and here is the
  proof rather than an assumption: MNY has its own theme (`src/themes/mny/theme.js`, registered as
  `mnyv1`), its `mny_avlGraph` block (lines 143-176) sets **no** `legend`/`legendSwatch`/`tooltip`
  class keys, and the `legend:` string at line 952 is under **`theme.stackedBar`** — the `stacked_bar`
  *column type* (read by `columnTypes/stacked_bar.jsx:74`), an unrelated scope. So MNY is a no-op
  **provided core `avlGraphTheme` defaults keep today's literals** — Rule 2 now protects 7,415 graphs.
- **Item 03 (title/legend row)** — gated on `titleInlineWithLegend`, transportny-only. MNY unaffected.
- **Item 08 (padding)** — per-section setting now; MNY sets none, so it falls through to MNY's own
  theme value. Unaffected.
- **Landmine-1 separation** — Ryan: "I am OK keeping the 'insurance' (dead/old code) to make sure
  MitigateNY still looks correct." **Keep the back-compat prop shape on `Legend`.** With 7,415 MNY
  graphs through this component, that's clearly the right trade even though it leaves one compat path.

### Original (npmrdsv5-only) measurement — still valid for what it covered

Ryan's original concern was "Theres other pages, like Map-21, that already use graphs and look good."
Within `npmrds_sub`/`tsmo2`/etc., **`AVL Graph`** sections:

Ryan's concern: "Theres other pages, like Map-21, that already use graphs and look good, so I don't
want to make them look worse or have a regression." Queried every `AVL Graph` component row in
`dms_npmrdsv5` (local API is `:3001`, see R5). Reproduce with `scripts/npmrds-reports/dbq.py new` and
a `substring(... from '"legend"[^}]{0,60}')` regex — a full `::jsonb` cast over all rows times out.

~~Legend work cannot touch any real non-report page.~~ **Retracted — see the correction above; this
table covers `AVL Graph` only and therefore excludes MitigateNY's 7,505 legacy-`Graph` sections.**
It is still accurate for the TransportNY pages Ryan named:

| Pattern | AVL Graphs | `legend.show` |
|---|---|---|
| `tsmo2` | 368 | **false on all 368** |
| MAP-21 `/map_21` (page 2173915 — a page *inside* `npmrds_sub`, not its own pattern) | 4 | **false on all 4** |
| `sitemgmt` | 6 | false on all 6 |
| `freightatlas2` | 1 | false |
| `landing` | 1 | **true** — the only real non-report graph a legend change touches |
| `page_test` / `sandbox2` / `graph_test` / `freightatlas2_copy` | 235 / 334 / 14 / 14 | mostly true — **all scratch patterns** |

**Tooltip and padding are a different story — they're not gated on legend visibility, and every
non-report graph is on `styles[0]`:**

| Pattern | `activeStyle` |
|---|---|
| `npmrds_sub` | `reportInlineTitle` on **367**, none on 2,959 |
| `tsmo2` | none on all 368 |
| `page_test` / `sandbox2` / `sitemgmt` / `landing` | none on any (235 / 334 / 6 / 1) |

So a `styles[0].padding` or `styles[0].tooltip` change reaches ~380 real graphs including MAP-21's.
Consequences, both taken:

- **Padding becomes a per-section chart setting, not a site-wide theme change.** Enabled by Ryan's
  2026-09-10 note that "its ok if the UI is deferred, it could still be useful even if, right now, its
  only able to be utilized via CLI or code changes" — so a setting with no drawer control is fine, and
  that removes the MAP-21 padding risk entirely. `GraphComponent` reads `graphFormat.padding ||
  theme.padding`, so unset ⇒ today's theme value ⇒ unchanged everywhere. Report sections set it; nobody
  else does. **This supersedes correction 4's "set `styles[0].padding`" and R6's "everything visual
  becomes a brand value" for padding specifically.**
- **Tooltip stays site-wide.** It replaces a generic white box with a heavy black drop shadow that
  every site currently gets, so branding it is an improvement rather than a regression — but that's a
  judgement call, so **verify `tsmo2` and MAP-21 `/map_21` in the browser during pass 2** before
  calling it done. Do not assume.

## Landmine-1 back-compat — grep evidence (Ryan: "thats still backwards compat? a LOT of sites and projects use these")

`Legend` is **not** public API: it isn't exported from `packages/dms/src/index.js`, and `ui/index.js`
exports `Graph` (the section, whose props don't change), not `Legend`. Repo-wide, the only `Legend`
imports outside `graph_new/` are the **map** legends — different components entirely
(`mapeditor/MapEditor/MapViewer.jsx`'s `MapViewerLegend`,
`gis_dataset/pages/Map/Layer2.jsx`'s `./legend-components`). Nothing imports the avl-graph `Legend`,
and the only other `avl-graph` mentions in the repo are comments (`themes/mny/theme.js:71`,
`themev2.js:2293`, `MeasurePicker/index.js:250`, `report_probe.mjs:200`).

Nothing stored in the DB changes, no theme key changes, no authoring behaviour changes.

**DECIDED (Ryan, 2026-09-10): keep the insurance.** "In this case, I am OK keeping the 'insurance'
(dead/old code) to make sure MitigateNY still looks correct." So `Legend` accepts the old flat prop
shape alongside the separated one. Justified by the corrected blast radius: 7,415 MitigateNY graphs
render through this component, and MNY is a different app/config out of this same repo — the one place
where a signature change could bite without showing up in a transportny regression pass. This is the
deliberate exception to his general "don't keep dead code paths" preference; note it in the code
comment so nobody deletes it as cruft later.

## Regeneration impact (Ryan asked 2026-09-10)

"Which (if any) of these changes will require us to regenerate a report to pick them up? I am assuming
any that utilize new or different theme tokens / classnames?" — **The opposite: theme values are the
safe ones, and nothing in this task needs a regeneration.** The line is *stored on the section* vs
*resolved at render*:

| Change | Needs regeneration? | Why |
|---|---|---|
| Items 01-03 (geometry) | No | code only, nothing stored |
| Items 05, 06, 08, 09 (legend + tooltip brand, padding, `tabular-nums`) | No | theme, read at render |
| Item 04 (collapsing legend) | No | measured at render |
| Inline-title flag | No | **only because of the `||` back-compat** above; without it, yes |
| Item 07 (units) | **Depends on the approach** | see below |

Item 07 is the only real decision. A section stores a format **name** (e.g. `'duration_mmss'`, or
`null`) in `display.tooltip.valueFormat`; `getFormatFunc` maps name → function at render via
`ValueFormatsFuncMap` (`graph_new/utils.js:465-474`). So:
- Mint **new format names** per measure ⇒ existing sections still hold the old names ⇒ every report
  needs regenerating.
- Derive the unit from **the measure the section already stores** — `display._measurePick.measure`
  (`MeasurePicker/index.js:241`) ⇒ existing reports pick units up with no rebuild.

**Take the second.** Note this also rules out the tempting shortcut of editing an existing shared
format's implementation to append a unit — that would change it for every other site and every other
use (axis ticks, tooltips) too.

**Constraint to hold for the rest of this task:** nothing may require regenerating a report. If a
proposed change would, that's a signal it's putting a decision in the DB that belongs in the theme or
in code, and it should be reworked rather than scheduled as a migration.

## Decided by Ryan, 2026-09-10

1. **Tooltip is IN.** "It kinda needs to be included. It will be very obviously out of place
   otherwise." → pass 2, item 06. This is why the task is "graph chrome", not "legend and padding".
2. **Dark mode is OUT**, for now at least. No dark variant for transportny's avlGraph this pass.
   Recorded here so the next pass doesn't re-ask.
3. **Graph-card contract clause 2 gets ANNOTATED**, not revisited. Add a dated note to
   `pages/npmrds-report.html:46-47` recording the 2026-09-04 bottom → top/top-right reversal
   (`composeMeasureConfig.js:93-99`) so the next reader doesn't build the superseded clause.
4. **The collapsed legend KEEPS its labels, and every collapsed tier is openable.** Bare dots convey
   identity by colour alone. Three tiers per pass 3. Ryan's follow-up — "would a user be able to
   toggle between expanded and collapsed?" — answered: not a saved preference, an on-demand reveal
   (click *and* hover), available from **both** collapsed tiers per R4, not just the last one. Only
   full chips has no control, since nothing is hidden there.
5. **Admin editor: the two cheap pieces now, the rest deferred.** Justified by verification speed
   (live preview), not by the admin story. "The admin side of this is really secondary… But I guess if
   the admin stuff is easy and/or makes it easier for us to verify, I am ok doing it now/soon/earlier."
6. **`reportInlineTitle` — drop the theme token, but the removal goes LAST.** Ryan's first offer, then
   my regression (withdrawn), then his final call: add the new `display.title.inline` path now, keep
   the old token alive through validation, and delete the token + named style + both stamps as the
   final step, regenerating the 367 affected report sections to test it. He'd rather not keep a dead
   path; deferring the deletion is only because testing inline titles requires that regen.
7. **A chart setting is useful even with no UI** — reachable from the CLI or a build script is enough;
   the Settings-drawer control is a follow-up, not a prerequisite. This is what lets `padding` become
   a per-section setting instead of a site-wide theme change, which is what keeps MAP-21 and tsmo2 off
   the blast radius.
8. **Do not regress MAP-21 / tsmo2.** Measured: legend work can't reach them (no legend rendered), but
   tooltip and padding can. See the blast-radius section for the numbers and what each implies.

## Explicitly not in scope this pass

- Legend *position* theming (`DEFAULT_LEGEND_POSITION_BY_GRAPH_TYPE` + the QuickControls pill) — already
  done, unrelated task.
- Building "Ledger"/"Console" as real, shippable themes — they were illustrative in the superseded
  artifact and are dropped from the current one.
- The backlog title-migration item (graph-native → section-level titles) — explicitly deferred by
  Ryan 2026-09-04, not touched here.

## Testing checklist

Pass 1 — geometry:
- [ ] Last tick label's `getBoundingClientRect()` clears the card's inner edge on a GridGraph using
  `formatMinutesAuto` (the ~54px label, not an integer one) — measured, not eyeballed.
- [ ] Vertical legend's rendered height == its declared height (the off-by-one-tick fix).
- [ ] Ramp shrinks with a size-4 card and drops to 3 ticks rather than colliding.
- [ ] Inline title truncates instead of overflowing; full text available on hover.

Pass 2 — brand:
- [ ] Byte-identical render for any site/theme that sets none of the new keys.
- [ ] Repo-wide grep of every `Legend`/`legend`/`legendSwatch` consumer cited, showing the
  other-scope consumers (`stacked_bar`, `ScheduleGrid`, `macroview`) untouched.
- [ ] Tooltip themed on **every** chart type, not just the one checked first (it threads per type).
- [ ] Units appear on gradient tick labels for speed and delay measures.
- [ ] No clipping of chart content/legend/title across every NPMRDS graph type
  (Line/Bar/GridGraph/Map/RouteCompare/InfoBox) at the new padding.
- [ ] `probe_corpus.mjs` / `report_probe.mjs --auth` golden-corpus pass, 0 console errors.
- [ ] Theme editor: a legend value edited there changes the preview and survives a reload.

MitigateNY gates (the biggest legend consumer — 7,415 graphs; see the corrected blast radius):
- [ ] **Core `avlGraphTheme` defaults are byte-identical to today's literals.** This one assertion is
  what keeps 7,415 MNY graphs unchanged through items 05/06/09. Diff the rendered class strings, don't
  eyeball the theme file.
- [ ] ~~The 4 MNY gradient graphs rendered before/after items 01-02.~~ **Not needed — MNY renders zero
  gradient legends** (2 have `legend.show=false`, 2 are orphans). Items 01-02 are TransportNY-only in
  practice. Live pages for the record, if anyone wants to eyeball them anyway:
  `https://mitigateny.org/home` (published section 2413616 — its legend is off) and
  `https://devmny.org/home`.
- [ ] A sample of MNY **categorical** legend graphs unchanged after item 04 lands with
  `collapse: 'cap'` — the default that protects them. Assert the default explicitly.
- [ ] `Legend`'s back-compat prop shape kept, with a comment saying it exists for MitigateNY so it
  isn't deleted as cruft later.

Don't-regress-MAP-21 gates (pass 2):
- [ ] MAP-21 `/map_21` (page 2173915) and a `tsmo2` page rendered before/after the **tooltip** change,
  in the browser. Legend changes can't reach *these two* (measured, `legend.show=false` on all of
  their graphs), so this gate is specifically about the tooltip. Site-wide legend safety is a separate
  question — see the MitigateNY gates above.
- [ ] **`padding` unset on `styles[0]`** — the per-section setting is what changes, so MAP-21 and
  tsmo2 keep 16px. Confirm by rendering them, not by reading the theme.
- [ ] `landing`'s single legend-showing graph checked — the one real non-report graph legend work reaches.

Inline-title flag, step 1 (during validation):
- [ ] **Default is off everywhere** — core `ChartDefaults.title.inline === false` AND transportny's
  brand `chartDefaults` leaves it false. Assert it explicitly, don't infer it.
- [ ] Existing report sections (the 367 carrying `activeStyle: 'reportInlineTitle'`) still render
  inline via the `||` back-compat — no report regenerated yet.
- [ ] New sections from `report_build.mjs` + `useAddGraphSection.js` set `display.title.inline`, and
  `convert_old_reports_lib/` checked for the same stamp (keep the converter in sync).

Inline-title flag, step 3 (LAST, after everything else is validated):
- [ ] `||` back-compat term, `styles[1]`, and both `activeStyle` stamps all deleted — no dead path left.
- [ ] The 367 report sections regenerated, and inline titles verified back on a real report page.
- [ ] A non-transportny site with a top-positioned legend still renders its title on its own line.

Pass 3 — small cards:
- [ ] Size-4 card with 2 routes shows one legend line; with 5 routes shows the openable dot row.
- [ ] The reveal works by click/tap, not hover only, and is keyboard-reachable.

Always:
- [ ] `traversing-report-pages.md` updated in the same session as any live-verification pass.
- [ ] Design-system clause 2 annotated with the 2026-09-04 reversal (decision 3).

## Cross-references

- `src/dms/planning/tasks/completed/avlgraph-theme-integration.md`,
  `src/dms/planning/tasks/completed/graph-axis-font-theming.md` — the established pattern this extends.
- `planning/transportny/tasks/current/graph-card-padding-and-legend-theming.md` — transportny-side
  tracking (per-site values, live-verification).
- `planning/transportny/tasks/current/npmrds-reports-routes-feedback-triage.md` — Phase 5, parent item.
