# Creating pages from a design pattern via the DMS CLI

How to take a completed design system or design mockups (HTML + Tailwind)
and instantiate the corresponding pages, sections, and components inside
a live DMS pattern using the [`dms` CLI](../packages/dms/cli/). The
output is a working set of draft pages that a human user can review,
edit, and publish.

> **Audience:** an engineer or AI that has a target design (e.g.
> `src/themes/tessera/design_system_v2/pages/*.html`) and a target
> DMS pattern (e.g. `tessera+main|main:pattern`), and needs to seed
> the pattern with the corresponding pages.
>
> **Inputs:** a design system folder (produced by
> [`designing-a-dms-design-system.md`](./designing-a-dms-design-system.md));
> an app + pattern that already exist on the DMS server.
>
> **Outputs:** pages with **draft sections** populated and ready
> for a human to publish. Nothing here ever publishes
> automatically — that decision belongs to the user.
>
> **Worked example:**
> [`scripts/seed-tessera-pages.mjs`](../../../../scripts/seed-tessera-pages.mjs)
> seeds the 12 pages from `src/themes/tessera/design_system_v2/`
> into `app=tessera, pattern=main|main:pattern`.

---

## Outcome

A DMS pattern populated with one DMS page per design mockup, each
containing a series of draft sections that map the mockup's
sub-sections onto the platform's primitives. Default sections
chosen by element type:

| Mockup content | Section element type |
|---|---|
| Headlines + body copy + bullet lists | `lexical` |
| Tables / row collections rendered as cards | `Card` (data-bound when a Source exists, otherwise a Lexical "table-ish" rendering of the same content) |
| Heroes, marketing bands | `lexical` (the Lexical content lives inside the brand's themed Card LayoutGroup) |
| Section toolbars, diagrams, snapshots | `lexical` with an inline screenshot or a structural diagram of how the live equivalent renders |

When you don't have a real data source for a "data section"
mockup, **shipping a Lexical section that depicts the data is
acceptable**: the goal is for the page to read correctly in the
admin UI and serve as a starting point a human author can swap to
a real Card-bound source later.

---

## The six-step workflow

1. **Confirm the pattern exists.** Run `dms site tree` against
   the target app and pattern. If the pattern isn't there, create
   it with `dms raw create` (see [§3.1](#31-create-a-pattern-if-needed)).
2. **Plan the page inventory.** For each HTML mockup, decide on
   the page title, URL slug, and any parent/child hierarchy.
3. **Plan each page's *bands*.** For each visually distinct
   horizontal band in the mockup — a hero on bone, a boxed
   parchment card, a limestone footer — declare a `section_group`
   with the right `position` and `theme` (LayoutGroup style name).
   This is the step a first pass usually skips, producing a
   single-band page where every section gets the same surface
   treatment. **See [§4.2](#42-section-groups--bands-that-drive-layoutgroup-style).**
4. **Plan each band's sections.** For each `<section>` inside a
   band in the mockup, pick an element type (`lexical` / `Card` /
   `Header`/…) and decide what content goes in `element-data`.
5. **Write a seed script.** Encode the inventory as data, then
   loop: `dms page create` → `dms raw update --set draft_section_groups`
   → for each section, `dms section create --data` with the right
   `group` UUID. **Always create sections without publishing** —
   they land in the page's `draft_sections` automatically.
6. **Verify.** Run `dms site tree`, dump a representative page
   (`dms page dump <slug> --sections`), and open the page in the
   admin UI for a human-eyes pass.

[**Draft sections only** — see [§6](#6-draft-only-discipline)] is
non-negotiable for this skill.

---

## 1. The DMS hierarchy this skill creates

Recap of the data model relevant here (full doc:
[`src/dms/CLAUDE.md`](../CLAUDE.md)):

```
app                     ← tessera (the application namespace)
└── site                ← main:site
    └── pattern         ← main|main:pattern (page-pattern, the "/" base)
        └── page        ← main|page (one per mockup HTML file)
            └── component (= section)   ← main|component
                ├── element-type: lexical  → text content
                ├── element-type: Card     → data-bound card grid
                └── element-type: Header   → page header
```

Every page belongs to exactly one pattern; every section belongs
to exactly one page (referenced by the page's `draft_sections` or
`sections` array).

---

## 2. CLI surface (quick reference)

The CLI lives at
`src/dms/packages/dms/cli/bin/dms.js`. Connection config comes
from `.dmsrc` (searched upward from cwd), env vars
(`DMS_HOST` / `DMS_APP` / `DMS_TYPE` / `DMS_AUTH_TOKEN`), or
inline flags (`--host` / `--app` / `--type`), in that override
order.

| Need | Command |
|---|---|
| Tree the site | `dms site tree` |
| List a pattern's pages | `dms page list` |
| Inspect a page | `dms page show <slug-or-id>`, `dms page dump <slug-or-id> --sections` |
| Create a page (lands as `draft`) | `dms page create --title "…" --slug "…" [--parent <id>]` |
| Update a page | `dms page update <id> --set key=val` (read-modify-write) or `--data ./file.json` (full replace) |
| Create a section on a page (lands in **`draft_sections`**) | `dms section create <page-id-or-slug> --element-type lexical --title "…" [--data '<json>']` |
| Update a section | `dms section update <id> --set key=val` or `--data ./file.json` |
| Publish a page (copies `draft_sections` → `sections`) | `dms page publish <id-or-slug>` *(humans only; this skill never calls it)* |
| Low-level rows | `dms raw get <id>`, `dms raw create <app> <type> --data '<json>'`, `dms raw update <id> --set k=v` |

Full surface: `dms --help`,
[`src/dms/packages/dms/cli/docs/README.md`](../packages/dms/cli/docs/README.md),
[`EXAMPLES.md`](../packages/dms/cli/docs/EXAMPLES.md), and
[`TYPES.md`](../packages/dms/cli/docs/TYPES.md).

### Default invocation pattern in this repo

```bash
DMS_HOST=https://dmsserver.availabs.org \
DMS_APP=tessera \
DMS_TYPE=main \
node src/dms/packages/dms/cli/bin/dms.js <command…>
```

If you'll issue many commands from a script, set the env vars
once at the top and re-use them — see §7 for a script template.

---

## 3. Setting up the pattern

### 3.1 Create a pattern if needed

The CLI has no dedicated `pattern create`; patterns are created
via `dms raw create`:

```bash
dms raw create tessera 'main|docs:pattern' --data '{
  "name": "docs",
  "pattern_type": "page",
  "base_url": "/docs",
  "subdomain": "*"
}'
```

If the pattern already exists (verify with `dms site tree`),
**don't recreate it** — `raw create` will produce a duplicate type
collision. Move on to page creation.

### 3.2 Pattern types

`pattern_type` is one of:

| Pattern type | Purpose |
|---|---|
| `page` | The standard CMS page pattern. Pages have a URL slug, sections, draft/publish lifecycle. This is what you almost always want. |
| `datasets` | Dataset browser pattern. Pages are dataset descriptors. |
| `auth` | Login / signup pages. |
| `admin` | The admin UI for editing the site itself. |
| `forms` | Form-driven data entry. |
| `mapeditor` | Map editor. |

For "translate a design system into pages," `pattern_type: page`
is almost always the right answer.

---

## 4. Creating pages

A page lands in `published: "draft"` state by default. It owns:

- A `title` and `url_slug` (URL path).
- An optional `parent` (another page's id) for tree hierarchy.
- Two parallel pairs — a **draft** pair you write and a **published**
  pair you must never write:
  - `draft_sections` + `draft_section_groups` — the editing copy.
    **This is what your CLI commands populate.**
  - `sections` + `section_groups` — the published rendering.
    **Never write either directly from this skill.** `dms page
    publish` is the only thing that updates them (it copies the draft
    pair across). Writing them by hand corrupts the live page — see
    the warning in §4.2.

```bash
# Top-level page
dms page create --title "Marketing — Homepage" --slug marketing-homepage

# Child page under an existing parent
PARENT_ID=$(dms page show marketing-homepage --compact | jq -r '.id')
dms page create --title "Marketing — Theory" --slug marketing-theory --parent "$PARENT_ID"
```

The CLI prints the new page's id; capture it for the next step.

### 4.1 Update a page's metadata after creation

```bash
# Read-modify-write — sibling keys preserved
dms page update marketing-homepage --set title="Marketing — Home"
dms page update 17 --set published=draft
```

### 4.2 Section groups — bands that drive LayoutGroup style

**This is the load-bearing piece most first passes get wrong.** A
page is not a flat list of sections; it's a list of **bands**
(`section_groups`), and each band picks its visual treatment by
naming a `theme.layoutGroup` style. Sections then declare which
band they belong to.

If your mockup mixes boxed and unboxed bands — say a hero on the
bare page background followed by feature cards inside parchment
surfaces followed by a limestone footer — you need a **separate
section_group per visual treatment**. Putting everything under one
group means everything gets that group's LayoutGroup style.

Each section_group on `data.draft_section_groups` has:

| Field | Type | Purpose |
|---|---|---|
| `name` | UUID string | The band's identity. Sections reference it via `data.group`. |
| `index` | integer | Order within `position`. |
| `position` | `'top' \| 'content' \| 'bottom'` | Which Layout slot the band renders in. `top` → above the Layout via `headerChildren`; `content` → inside the Layout's `childWrapper`; `bottom` → below the Layout via `footerChildren`. **With a sidenav, `top`/`bottom` bands render full-viewport-width *outside* the Layout, so their left edge does NOT line up with the sidenav-offset content column. For a topnav/footer that must align with the page content, use `position:'content'` (first/last content band), not `top`/`bottom`.** |
| `theme` | string | The **name** of a `layoutGroup.styles[]` entry (e.g. `'content'`, `'header'`, `'auth'`, `'footer'` in the Tessera theme). The renderer looks up the named style: `theme.layoutGroup.styles.find(s => s.name === group.theme)`. If the name doesn't match, `styles[0]` is used. |
| `displayName` | string | Shown in the page editor's section-groups pane. |

**Why position and theme are different.** `position` is *where* in
the Layout's chrome the band sits (header / content / footer of
the page). `theme` is *what* the band looks like (boxed parchment /
unboxed bone / limestone full-bleed / etc.). A footer-positioned
band can use the boxed `content` style; a content-positioned band
can use the unboxed `header` style for a hero. They're orthogonal
knobs.

**Worked example — translating the Tessera marketing-homepage
mockup into bands:**

| Band | `position` | `theme` | What it shows |
|---|---|---|---|
| Hero | `content` | `header` | Big title, lede, CTAs — sits on bone, unboxed |
| Surfaces | `content` | `content` | 4-up tile grid inside a parchment card |
| Two doors | `content` | `content` | Side-by-side option cards inside parchment |
| In use | `content` | `content` | Pull quotes inside parchment |
| Theory | `content` | `footer` | Limestone full-bleed band with an essay teaser |
| Site footer | `bottom` | `footer` | Limestone full-bleed band with link columns |

That's six section_groups for one page. Three of them reuse the
`content` LayoutGroup style; two reuse the `footer` style (it
gives the brand its full-bleed limestone treatment, useful for any
band that wants to break the boxed-card rhythm). The hero is the
only band that uses the `header` style.

**Creating section groups via the CLI** (no dedicated command —
use `dms raw update --set`):

```bash
# Build the array, then push it onto the page's draft_section_groups ONLY
GROUPS='[
  {"name":"<uuid-1>","index":0,"theme":"header","position":"content","displayName":"Hero"},
  {"name":"<uuid-2>","index":1,"theme":"content","position":"content","displayName":"Surfaces"},
  {"name":"<uuid-3>","index":2,"theme":"footer","position":"bottom","displayName":"Site footer"}
]'

dms raw update <page-id> --set "draft_section_groups=$GROUPS"
```

> ⚠️ **Write `draft_section_groups` ONLY — never `section_groups`.**
> `section_groups` is the *published* band array, the structural twin
> of `sections`; like `sections` it is owned exclusively by `dms page
> publish` (which copies the draft pair across). Writing it by hand —
> especially with freshly-generated `name` UUIDs, as a re-runnable seed
> script does — silently corrupts an already-published page:
>
> Every **published** `sections` row stores a `group` UUID pointing at
> an entry in `section_groups`. Overwrite `section_groups` with new
> UUIDs and all those published sections are orphaned — each section's
> `group` matches no band, so the live page renders blank/ungrouped
> until the next publish. A re-seed must never touch what's live; only
> `dms page publish` reconciles the draft pair into the published pair
> **together**, keeping their UUIDs consistent. This is the single most
> common way re-running a seed script blanks a previously-published page.

Once the groups exist, each section you create must include a
`group` field whose value is the UUID `name` of its band. See §5.2.

### 4.2.5 Per-section `size`, `padding`, and `height` overrides

Three fields on a section's `data.*` give per-section width, gutter,
and height control without touching the theme:

| Field | Type | What it does |
|---|---|---|
| `size` | string | The column span. Tessera's `pages.sectionArray` ships a 12-col grid (`"1"`..`"12"`); the codebase default ships `"1/3" \| "1/2" \| "2/3" \| "1"`. Omit to take the section's full width. |
| `padding` | string | Tailwind class that overrides the sectionArray's `sectionPadding` default (usually `p-4`). Use `'p-0'` to align section content with the **LayoutGroup wrapper's left edge** — the marketing-homepage hero uses this so the eyebrow and h1 don't get the standard gutter. Set to any Tailwind padding class (`'p-2'`, `'px-0 py-6'`, etc.). |
| `height` | string | `'fill'` makes the section's grid cell **and** its chrome box `h-full` so it stretches to the row height. **Set `height: 'fill'` on every card in a multi-card row** (KPI strips, mode/feature/tile grids, a tall card beside a short one) so siblings render **equal height** instead of each shrink-wrapping its own content. Leave it **unset (auto)** for a full-width (`size:'12'`) section or any card that's alone in its row — there's nothing to match, and auto is the right default. (`resolveHeight` in `sectionArray.jsx`; falls back to `h-full flex flex-col` when the theme ships no `heights` map.) |

Seed-script example (`scripts/seed-tessera-pages.mjs`):
```js
{
  title: '',
  size: '8',        // 8 of 12 cols ≈ 67% wide
  padding: 'p-0',   // flush left with the LayoutGroup wrapper
  data: lexical([…])
}
```

The seed-loop reads these and passes them through:
```js
payload.size = s.size || '12';            // default full-width
if (s.padding != null) payload.padding = s.padding;
if (s.height != null) payload.height = s.height;   // 'fill' for equal-height rows
// A clean heuristic that bakes the rule in: any bordered card narrower than
// full-width sits beside siblings, so fill it; full-width singles stay auto.
if (s.border === 'full' && s.size !== '12') payload.height = 'fill';
```

Common patterns:
- **Hero / marketing intro**: `size: '8'`, `padding: 'p-0'` — flush-left
  narrow column, no gutter inside the unboxed `header` LayoutGroup.
- **Two-column data section**: two sections at `size: '6'` each in the
  same band — they sit side-by-side filling the row; add `height: 'fill'`
  to both so they're equal height.
- **Card grid (KPI strip, tile/feature row)**: N cards at the same `size`
  (e.g. four `size: '3'`), each with `border: 'full'` + **`height: 'fill'`** so
  the row reads as a tidy equal-height set, not ragged shrink-wrapped boxes.
- **Sidebar/main split**: `size: '3'` + `size: '9'`.
- **Default for everything else**: omit `size` (defaults to `'12'`,
  full-width) and omit `height` (auto — correct for full-width singles).

### 4.3 If sections look narrow / centred inside the band

If the seeded page renders with content as a thin centred column
inside an oversized parchment box, the problem is the **theme**,
not the seed script. The codebase default
`pages.sectionArray.styles[0].layouts.centered` caps section
content at `max-w-[1020px] mx-auto` — narrower than most brands'
LayoutGroup wrapper. The fix lives in the theme, not in any
section-group setting: see
[`translating-design-system-to-dms-theme.md` §3.1.55](./translating-design-system-to-dms-theme.md#3155-the-make-the-default-look-right-rule).

Don't compensate by flipping `full_width: 'show'` on every group
— that defeats the brand's intended grid constraint and forces
authors to remember the flag every time they add a band.

---

## 4.5 Copy and tokens are part of the design contract

The most common fidelity failure isn't layout — it's **text the design never
shows**. Three rules, learned from the TSMO-home hero (which shipped with ~3×
the design's text before review):

1. **The mockup's copy is the copy.** Transcribe headings, notes, badges, and
   meta lines *verbatim*. Do not invent explanatory text, expand abbreviations,
   add disclaimers, or append "helpful" qualifiers ("· selected year",
   methodology caveats, …). If a clarification feels necessary, it belongs on a
   methodology/about page — flag it in the task doc instead of writing it in.
2. **Strongly prefer existing tokens — match by inspection, not vibes.** For
   every text atom, find the token whose case/size/family matches the mockup
   (e.g. transportny: lowercase mono substat = `metaAccent`/`metaMD`, NOT the
   uppercase `metaSM`; bordered as-of badge = `chip`). Read the brand's
   `textSettings` FIRST and keep the list at hand while transcribing. Only when
   no token matches case+size+family is there a real token gap — add ONE token
   to the theme (with a comment naming the design role) rather than improvising
   with inline styles or the nearest-looking token.
3. **Component chrome must not add text the design doesn't show.** Filter
   attribution (`showAttribution`), column headers (`hideHeader`), section
   `title` labels, pagination info — every component emits optional text;
   default them OFF and enable only what the mockup shows. A data section that
   renders more words than its mockup counterpart is misconfigured, not
   "informative."

Also: **title + description blocks want `size` 6–8, not 12** (the measure
pattern, §5.6.7) — the designs cap ledes at ~640–760px; full-width prose reads
off-brand even with the right tokens.

---

## 5. Creating sections (draft only)

A section is a single editable block; it points at a component
(by `element-type`) and an `element-data` blob the component
renders.

### 5.1 Default invocation

```bash
dms section create marketing-homepage \
  --element-type lexical \
  --title "Hero"
```

This creates a section row of type `main|component` and **adds it
to the target page's `draft_sections`**. It does **not** touch
the page's `sections` array — the human user runs
`dms page publish` to do that.

### 5.2 With initial content via `--data` — the nested `element` wrapper

For non-trivial sections, pass the full payload. **The shape
matters:** production sections store `element-type` and
`element-data` inside a nested `element: { ... }` wrapper, not at
the top level. The live `Section` component reads
`value.element['element-data']` — keys at the top level of `data`
are ignored by the renderer.

The minimum viable shape:

```bash
dms section create marketing-homepage --data '{
  "title": "",
  "type": "main|component",
  "group": "<section-group-uuid>",
  "parent": "{\"id\":\"<page-id>\",\"ref\":\"<app>+<pattern>|page\"}",
  "trackingId": "<uuid>",
  "element": {
    "element-type": "lexical",
    "element-data": "{\"bgColor\":\"rgba(0,0,0,0)\",\"text\":{\"root\":{\"children\":[{\"type\":\"heading\",\"tag\":\"h1\",\"children\":[{\"type\":\"text\",\"text\":\"Welcome\",\"version\":1}],\"version\":1}],\"type\":\"root\",\"version\":1}}}"
  }
}'
```

**The five fields the renderer needs at `data.*`:**

| Field | Type | What it is |
|---|---|---|
| `title` | string | **Leave empty (`""`) by default.** Although described as "section toolbar / page tree" metadata, some themes render the section's `title` as a visible label *above the section content on the live page*. The section's own heading/h1 lives inside `element-data` (e.g. the Lexical state), so a non-empty `title` produces a duplicate label. Set `title: ""` unless the section is genuinely a labelled container the user wants to see chrome for. |
| `type` | string | The component type — usually `{patternInstance}\|component` (e.g. `main\|component`) |
| `group` | string | UUID matching a `name` in the page's `draft_section_groups` |
| `parent` | JSON string | Stringified `{ id, ref }` pointing at the parent page |
| `trackingId` | UUID | Per-section identifier for diffing / cross-references |
| `element` | object | `{ 'element-type': '<lexical\|Card\|…>', 'element-data': '<json-string>' }` |

**Two critical gotchas:**

1. **`element-data` is a JSON *string*, not an object.** The
   server stores it stringified. If you build the payload in a
   script, `JSON.stringify` the inner state before assembling the
   outer payload.
2. **`parent` is also a JSON *string***, not an object — same
   reason.

The CLI flags `--element-type` / `--title` / `--level` write keys
at the *top level* of `data` (the **old** format), which the live
renderer doesn't pick up. **Don't use those flags for production
seeding** — always go through `--data` with the full nested shape.

Before creating any sections, ensure the page has at least one
`draft_section_group`. The script template in §7 does this
automatically. If you skip the group, sections will land in the
page's draft array but have no group to render into.

### 5.2.1 Editing & ordering sections AFTER creation

Three mechanics that aren't obvious and will cost you a round-trip each
if you miss them:

**`--set` cannot reach inside `element-data`.** Because `element-data`
is a stringified JSON blob (gotcha #1 above), a dot-path like
`--set element-data.display.yAxis.format=fnum` does **not** edit the
graph's format — it silently writes a *new* top-level
`data.display.yAxis.format` key that the renderer ignores. To change any
nested setting (a graph's `display.yAxis.format`, a Card column's
`type`, a Spreadsheet's column SQL, …) you must **parse → modify →
re-stringify → write the whole `element`**:

```bash
dms section dump <id> | python3 -c "
import json,sys
d=json.load(sys.stdin); data=d['data']
ed=json.loads(data['element']['element-data'])
ed['display']['yAxis']['format']='fnum'        # the real edit
data['element']['element-data']=json.dumps(ed)
open('/tmp/sec.json','w').write(json.dumps(data))
"
dms section update <id> --data "$(cat /tmp/sec.json)"
```

`--set` is only safe for keys that live at the **top level of `data`**
(`title`, `size`, `group`, `bg`, `border`, `padding`, `height`, …) — those
are real object keys, so the read-modify-write merge reaches them.

**`section create` appends to the end of `draft_sections`.** The render
order *within a band* is the order of ids in the page's `draft_sections`
array — not creation time, not `index`. So to **insert or interleave**
new sections (e.g. drop a header lexical *above* an existing data section
and a footnote *below* it), create them (they land at the end), then
**reorder the array** with a full-replace of that one key:

```bash
# fetch order, splice the new ids into place, write it back
dms page update <page-id> --data '{"draft_sections":[
  {"id":"<id-a>","ref":"<app>+<pattern>|component"}, … ]}'
```

`--data` shallow-merges at the top level, so replacing `draft_sections`
preserves every other page key. (Group/band order is separate — that's
`index`/`position` on `draft_section_groups`, §4.2.)

**Removing a section's rendered title.** A section renders its `title` as
a heading above the component (`section.jsx` `showHeader`). To drop that
heading — e.g. to convert a bare data Spreadsheet into a mockup-faithful
section whose framing comes from sibling lexical header/footnote sections
— clear it: `dms section update <id> --set 'title='` (`title` is
top-level, so `--set` reaches it). Then add the eyebrow/heading/prose as
their own `lexical` sections (§5.6.6) ordered around it via the reorder
above. This "clear title + frame with lexicals" pattern is how the
MAP-21 §04/§05 data tables got their `// 04 · Regional` kicker + question
heading + scoring footnote without baking chrome into the table.

### 5.3 Common element types

| `element-type` | Use for | `element-data` shape (top-level keys) |
|---|---|---|
| `lexical` | Prose, headings, bullet lists, code blocks, images. The workhorse. | `{ bgColor, isCard, showToolbar, text: { root: {…lexical state…} } }` |
| `Card` | Data-bound card grid (the most important DMS section). Reads columns from a source/view; configured per-column in the toolbar. | Source binding, columns, cellsGridSize, etc. See [`card-layout.md`](./card-layout.md). |
| `Header` | Page header band (title + breadcrumb + buttons). | `{ title, subtitle, buttons }` |
| `Spreadsheet` | Tabular view of data rows. | Source binding, columns. |
| `Graph` | Chart over a data view. | Source binding, chart type, axes. |
| `Map` | MapLibre map (DAMA-backed). | Source binding, layers, viewport. |
| `Selector` | Filter / selector chrome on a data view. | Source binding, control list. |

For new section types, see [`creating-page-section-components.md`](./creating-page-section-components.md).
For Card configuration depth, see [`card-layout.md`](./card-layout.md).

### 5.4 Lexical content — the minimum viable JSON

The Lexical editor stores its state as a node tree under
`element-data.text.root`. A simple "heading + paragraph" page
looks like this:

```json
{
  "bgColor": "rgba(0,0,0,0)",
  "isCard": "",
  "showToolbar": false,
  "text": {
    "root": {
      "type": "root",
      "version": 1,
      "direction": null,
      "format": "",
      "indent": 0,
      "children": [
        {
          "type": "heading",
          "tag": "h1",
          "version": 1,
          "direction": null,
          "format": "",
          "indent": 0,
          "children": [
            { "type": "text", "version": 1, "detail": 0, "format": 0, "mode": "normal", "style": "", "text": "Page title" }
          ]
        },
        {
          "type": "paragraph",
          "version": 1,
          "direction": null,
          "format": "",
          "indent": 0,
          "textFormat": 0,
          "textStyle": "",
          "children": [
            { "type": "text", "version": 1, "detail": 0, "format": 0, "mode": "normal", "style": "", "text": "Lead paragraph." }
          ]
        }
      ]
    }
  }
}
```

Node types you'll commonly need: `heading` (with `tag: h1`..`h6`),
`paragraph`, `list` (with `listType: bullet | number`), `listitem`,
`code`, `quote`, `link`, `text` (with optional `format` bits for
bold=1, italic=2, underline=8, etc.). Inspect an existing Lexical
section with `dms section dump <id>` to see a concrete example.

A helper for building these trees is included in the seed script
template (§7).

### 5.5 Card sections — the basic recipe

A Card section needs a Source binding to render anything
meaningful. If your design system pages depict data-card grids
but you don't yet have a Source set up:

1. **Leave a Lexical placeholder** that describes the intended
   Card content. Tag it `[Card placeholder]` so a human can
   easily find it later.
2. **Once the Source exists**, swap the placeholder for a real
   Card section: `dms section create <page> --element-type Card
   --data '<config-pointing-at-source>'`, then delete the
   placeholder.

For Card configuration knobs (columns, spans, fonts, formatFns,
cardsGridSize, cellsGridSize), see [`card-layout.md`](./card-layout.md).
That skill covers everything authors can do without writing code.

### 5.6 Lexical seed helpers — the full set

The seed-script template (§7) defines a small library of
lexical-state builders. These are the canonical helpers; copy
them to any new seed script. The earlier `text()`/`para()`/`head()`/
`list()`/`quote()` cover the basics; these three are the additions
the recent Tessera work shipped.

| Helper | What it emits | Use for |
|---|---|---|
| `text(t, format?)` | `{ type: 'text', text: t, format }` | A single text run. `format` is the Lexical bitmask: `1`=bold, `2`=italic, `4`=strikethrough, `8`=underline, `16`=code. Combine with `\|` for multiple. |
| `para(...kids)` | `{ type: 'paragraph', children }` | Default paragraph. Inherits the brand's body styling. |
| `head(tag, t)` | `{ type: 'heading', tag, children: [text(t)] }` | h1–h6 heading. The brand's lexical theme maps each tag to a display token (Tessera: h1→displayHero 76px, h6→displayXS 18px). |
| `list(ordered, items)` | `{ type: 'list', listType, tag, children: [{type:'listitem',...}] }` | UL (`ordered=false`) or OL (`ordered=true`). |
| `quote(t)` | `{ type: 'quote', children: [text(t)] }` | Block quote. Brand themes typically map this to `displayItalicMD` (large italic display). |
| **`styled(styleKey, ...kids)`** | `{ type: 'styled-paragraph', styleKey, children }` | A paragraph carrying a brand textSettings token key (`'displayHero'`, `'proseLG'`, `'metaSM'`, etc.). The `StyledParagraphNode` resolves the key → className at render via `theme.textSettings.styles[0]`. See [`translating-design-system-to-dms-theme.md` §3.1.4 Approach B](./translating-design-system-to-dms-theme.md#314-exposing-named-text-styles-to-lexical-authors). |
| **`button(linkText, path, styleName, keepSearchParams)`** | `{ type: 'button', linkText, path, style, keepSearchParams }` | Inline `ButtonNode` whose `style` matches one of the brand's `theme.button.styles[].name` entries (Tessera: `'default'` \| `'plain'` \| `'active'` \| `'danger'`). The node renders via `UI.Button` from `ThemeContext` — view-mode click uses `useNavigate()` for internal paths and `window.open(_, '_blank')` for external URLs. |
| **`layout(templateColumns, columns)`** | `{ type: 'layout-container', templateColumns, children: [layout-items] }` | A column layout (Lexical's LayoutContainerNode). `templateColumns` is a Tailwind grid-cols class string (e.g. `'grid-cols-1 md:grid-cols-2'` or the tighter `'grid-cols-1 md:grid-cols-[max-content_max-content_1fr]'` for side-by-side CTAs). `columns` is a 2D array — outer = one entry per column, inner = the lexical nodes in that column. The helper wraps each column array in a LayoutItem. |

### 5.6.5 Side-by-side content: section grid vs. Lexical layout-container

For "two things next to each other," DMS gives you two
mechanisms — pick the right one for the right granularity.

| Mechanism | When to use | What you get |
|---|---|---|
| **Multiple sections at fractional `size`** in the same section_group (band) | Two doors, three quotes, four footer columns, side-by-side cards — each item is its own self-contained, independently-editable thing | Each "column" is a real Section with its own toolbar, drag handle, delete/move affordances. Authors add/remove columns by adding/deleting sections. |
| **Lexical `LayoutContainer` inside one section** | A row of inline elements that belong to one editable block — most commonly a button row at the bottom of a paragraph block | One section, one Lexical state; the columns are nested elements inside the rich-text JSON. |

**Rule of thumb:** if the "columns" are *content-coherent units*
the author would want to move/copy/edit independently, use
multiple sections. If they're *layout-fragments of one block*
(e.g. the buttons under the hero paragraph), use a Lexical layout
container.

#### Section-grid pattern (the recommended default)

Tessera ships a 12-column grid. Any combination of section
`size` values that sums to 12 lays out side-by-side in the same
band:

```js
// Two doors band — intro section spans full, then two columns side-by-side
{
  displayName: 'Two doors',
  theme: 'content',
  position: 'content',
  sections: [
    { title: '', size: '12', data: lexical([
        styled('metaSM', text('Two doors')),
        head('h3', 'Run it yourself, or let us run it.'),
    ])},
    { title: '', size: '6', data: lexical([ /* …Self-host… */ ])},
    { title: '', size: '6', data: lexical([ /* …Hosted…    */ ])},
  ],
},
```

Common splits:
- **6 + 6** → two equal columns (self-host + hosted, image + caption)
- **4 + 4 + 4** → three equal columns (quote grid, KPI strip)
- **3 + 3 + 3 + 3** → four equal columns (footer link lists)
- **8** alone → narrow left-aligned column (theory band where empty
  right space is part of the design — no filler section needed)
- **8 + 4** or **9 + 3** → asymmetric (sidebar + main, lede + meta)

#### Lexical layout-container pattern (inline, within one section)

For inline rows that belong to a single editable block (the
"two CTAs immediately after a paragraph" pattern), use the
seed's `layout()` helper inside a single section's lexical data:

```js
{ title: '', size: '8', data: lexical([
    styled('metaSM', text('Tessera · v0.1 preview')),
    head('h1', 'The shape of your data is the shape of your site.'),
    styled('proseLG', text('One typed row that can be a page…')),
    // CTAs inside the same section as the hero text — they're part
    // of the hero block, not a separate band.
    layout('grid-cols-1 md:grid-cols-[max-content_max-content_1fr]', [
      [para(button('See it run · wcdb.fm →', '#', 'default'))],
      [para(button('Host your own →',          '#', 'plain'))],
      [para(text(''))],
    ]),
])}
```

#### Col offset — use an empty filler section

DMS's section-array doesn't support a `col-start` or `offset`
property today; sections fill the grid in source order, left to
right. To **offset** a narrow section so it sits centered or
right-aligned in its band, prepend an empty filler section with
the appropriate size:

```js
// Theory band — narrow centered column
sections: [
  // Empty (2) + content (8) + remaining 2 implicit on the right
  // = visually centered between cols 3-10.
  { title: '', size: '2', data: lexical([para(text(''))])},
  { title: '', size: '8', data: lexical([ /* …theory content… */ ])},
],
```

Common offset patterns (totals always ≤ 12; remaining cols are
implicit empty space on the right):

| Layout | Filler + content | Visual placement |
|---|---|---|
| Left-aligned narrow | nothing + size 8 | Left of band, 4 cols empty on right |
| Slightly offset | size 2 + size 8 | Cols 3-10, 2 empty on each side |
| Centered narrow | size 3 + size 6 + size 3 | Cols 4-9, balanced empty space |
| Right-aligned | size 4 + size 8 | Right of band, 4 empty on left |

The filler section's content is a single empty paragraph
(`lexical([para(text(''))])`). It takes grid space, renders no
visible content, no border, no padding — just an invisible spacer.

#### Section borders — the brand's hairline divider

For side-by-side sections that should read as *distinct cards*
inside the same LayoutGroup (e.g. self-host vs hosted), set
`border: 'full'` on each:

```js
{ title: '', size: '6', border: 'full', data: lexical([ /* …self-host… */ ])},
{ title: '', size: '6', border: 'full', data: lexical([ /* …hosted…    */ ])},
```

The available border keys (from `theme.pages.sectionArray.styles[0].border`):

| Key | Brand effect |
|---|---|
| `'none'` (default) | No border. |
| `'full'` | Hairline frame on all four sides. The default workhorse for cards. |
| `'openLeft'` | Frame on top/right/bottom, open on left. For cards that share an edge with the band's left wall. |
| `'openRight'` | Frame on top/left/bottom, open on right. |
| `'openTop'` / `'openBottom'` | Frame open on top or bottom. |
| `'borderX'` | Vertical borders only — left and right rule. Useful as a column separator. |

Tessera's color palette uses `groutLight` for these. Themes can
extend the map with brand-specific border keys (e.g. accent-colored,
dashed) — see the `border` object in the brand's
`pages.sectionArray.styles[0]` override.

#### Lexical horizontal rules — content separators inside a section

For visual separation *inside* a single section (between a column
group and a colophon, between a section heading and its body, etc.),
use a Lexical horizontal rule. The seed helper:

```js
const hr = () => ({ type: 'horizontalrule', version: 1 });
```

The rule renders as a styled `<hr>` element. Themes control the
look via `theme.lexical.styles[0].hr_base` and `hr_after` — tessera
uses a 1px groutLight line with `my-6` vertical breathing room.

Example — colophon section with a separator above the copyright:

```js
{ title: '', size: '12', data: lexical([
    hr(),
    styled('metaSM', text('© 2026 Tessera contributors · AGPL-3.0 (engine) · MIT (themes)')),
])},
```

If you find yourself wanting a divider *between* two sections (not
inside one), don't use an HR — use a `border` on one of the
neighboring sections instead (`'openTop'` or `'openBottom'`), or
let the LayoutGroup's natural padding/shadow handle it. HRs are
for in-content separation, not for section boundaries.

#### Don't over-use Lexical layout-container

The Lexical layout-container is *only* the right tool when the
content of all columns must live in one section. Otherwise prefer
the section-grid: it's discoverable in the page-editor UI
(authors see + Add section, drag/drop, etc.), each section has
clean drag-and-drop ordering, and the visual grouping in the
LayoutGroup's parchment surface comes for free.

**Worked example: marketing-homepage's six bands use both
patterns.** Hero uses Lexical layout-container for its two
CTAs (one block). Two doors / In use / Site footer use the
section-grid pattern (one section per item). Theory uses neither —
it's just a single narrow section at `size: '8'`, leaving the
right ~33% of the band visibly empty (no filler needed, the
LayoutGroup wrapper absorbs the empty space).

### 5.6.6 Brand-purpose text tokens (e.g. `eyebrow`)

Some design systems' typography ramps don't cleanly cover every
visual role. A common case is the **eyebrow** — the small mono
kicker that sits above section headings (`SURFACES`, `TWO DOORS`,
`IN USE`, `THEORY` in the Tessera mockup). It differs from a
generic small-mono `metaSM` token in three concrete ways:

1. **Lighter color** (e.g. `fog`, not `graphite`).
2. **Tighter bottom margin** (`mb-2`) so the eyebrow sits close
   above its heading instead of leaving a paragraph-default gap.
3. **A small brand mark via `::before`** — the recurring oxide
   square / dot / hairline that appears before the eyebrow text in
   the design. Implemented as Tailwind utility classes on the
   token itself:

   ```js
   eyebrow: `${FONT_MONO} text-[11px] uppercase text-[${c.fog}] mb-2 flex items-center
             before:content-[''] before:inline-block before:w-2 before:h-2 before:bg-[${c.oxide}] before:mr-2`,
   ```

When the design uses a recurring purpose-built treatment like
this, **add a dedicated token** rather than asking authors to
combine `metaSM` + an inline icon + a CSS override. Register it
in `theme.textSettings.styles[0]` and add the key to
`textSettings.options.slashKeys` so it surfaces as `/Style:
eyebrow` in the Lexical menu. Then call `styled('eyebrow', ...)`
in the seed wherever the design has a section eyebrow.

This is the "enrich the platform" move from
[CLAUDE.md → author empowerment](../../CLAUDE.md#core-principle-author-empowerment):
one new token in the theme, every future page benefits. The
alternative (a custom React component for the eyebrow) would lock
the treatment behind code.

### 5.6.7 Narrower-than-full intro sections (the "measure" pattern)

Body paragraphs at the full 12-col width of a band can read as
too wide — long line-lengths break the design's intended measure.
The design mockup for Tessera's "Surfaces" intro shows the body
text at roughly 9/12 of the band width, leaving ~3 cols of
empty space on the right.

The fix is just a smaller `size` on the intro section:

```js
{
  displayName: 'Surfaces',
  sections: [
    // Intro: narrower than the band (9 of 12) → measure-controlled body.
    // The next section's default size 12 forces a row break, so the tile
    // section below renders full-width on its own row.
    { title: '', size: '9', data: lexical([
        styled('eyebrow', text('Surfaces')),
        head('h3', 'One representation. Many renderings.'),
        para(text('A page is a row. A chart is a row. …')),
    ])},
    // Tiles below — full width via the band's defaultSize ('12').
    { title: '', data: lexical([ /* …tiles… */ ])},
  ],
},
```

Use the same pattern for any "lede + supporting content" rhythm
where the lede should sit in a narrower column than the
supporting block below it. Sizes 7–9 are the typical range for
"reads as narrower without looking under-sized." The empty cols
on the right are intentional — don't fill them with a placeholder
section.

### 5.6.8 Mixed inline italic / roman inside one styled heading

The `styled(...)` helper applies a single token (and thus a
single font-style) to the whole paragraph. For a heading that
mixes italic and roman within one line — like the design's

```html
<h2 class="t-displayItalicLG"><em>On placing</em> — an essay on
why a typed row is the right primitive for a data-driven site.</h2>
```

— use **multiple text runs with per-run `format` bits**. Italic
is `format: 2` in Lexical's bitmask:

```js
styled('displayItalicLG',
  text('On placing', 2),                         // italic run
  text(' — an essay on why a typed row…'),       // default-format run
),
```

The paragraph-level token sets the family / size / leading; the
per-run `format` toggles italic on just the spans you want.
Use the same approach for inline bold (`1`), inline code (`16`),
or any combination via bitwise-or (`text(s, 1|2)` = bold italic).

This is also the right call when the design has a wholly roman
heading that needs *one* italic phrase, or vice-versa. Don't reach
for two stacked `styled(...)` paragraphs — that breaks the line
into two visual lines and loses the design's inline reading.

### 5.6.9 `rowspan` — one tall card beside a stacked column

The `size` splits above all assume each row sums to ≤12 and the next row wraps.
But some mockups put **one tall card next to a column of shorter stacked cards**
(e.g. MAP-21 §03: a `col-span-7` "two-prong test" card beside a `col-span-5`
column holding three small cards). A flat row-wrapping grid can't express that —
the right-hand cards would wrap *under* the tall card, not stack beside it.

Sections carry a **`rowspan`** field alongside `size` (read via
`theme.pages.sectionArray.rowspans["N"].className` → `md:row-span-N`). Give the
tall card a `rowspan` equal to the number of cards stacking beside it, and CSS
grid auto-placement fills the rest of the column:

```js
sections: [
  { title:'', size:'12', data: lexical([ /* kicker + h2 */ ]) },          // full-width heading row
  { title:'', size:'7', rowspan:'3', border:'full', data: lexical([…]) }, // tall left card, spans 3 rows
  { title:'', size:'5', border:'full', data: lexical([…]) },              // right card 1 → col 8–12, row 2
  { title:'', size:'5', border:'full', data: lexical([…]) },              // right card 2 → row 3
  { title:'', size:'5', border:'full', data: lexical([…]) },              // right card 3 → row 4
]
```

The left card occupies cols 1–7 across rows 2–4; the three `size:5` cards
auto-flow into cols 8–12, one per row. (Heights won't be pixel-identical to a
hand-nested flex column, but the structure matches and stays fully author-editable.)

### 5.6.10 Card chrome is a section setting (gap-0 + inner box), not Lexical content

A recurring trap when matching a mockup: a Lexical section renders **flowing rich
text** — it has `heading`/`paragraph`/`list`/`quote`/`code`/`image`/`horizontalrule`/
`icon`/`layout-container` nodes and the block-level `StyledParagraphNode` (the
`styled('key', …)` helper), but it has **no inline styled span** (no lettered-badge
node). So don't try to produce a circular "A"/"B" badge from inside Lexical. Instead:

- **Card chrome (border / radius / background)** is a **per-section layout setting**,
  applied by the section on an **inner box** *inside* the section's gutter padding
  (Settings → Layout → Border / Radius / Background). The grid is `gap-0`; the section
  **padding is the gutter**. So ANY component (lexical, graph, spreadsheet) becomes a card
  by setting its section's border/radius/bg — no lexical "card style" needed. See the
  section layout model in
  [`translating-design-system-to-dms-theme.md` §3.1.58](./translating-design-system-to-dms-theme.md#3158-the-section-layout-model--gap-0-padding-gutters-inner-box-chrome).
- **A lexical card has NO per-cell padding — that's a `Card`-section feature.** Inside a
  lexical card, the *inner* padding is the global `theme.richtext.contentPadding` (default
  `p-4`, not per-section), and the *vertical spacing between text lines* is the global lexical
  `paragraph` margin (transportny: a tight `mb-1`) plus whatever vertical margin the
  `styled('key', …)` token carries. So to space the lines of one lexical card without
  disturbing others, put the margin on a token that's **exclusive to that card** (e.g. a
  `statNum` token used only on stat cards: `… mt-2! mb-2.5!`) — shared tokens (`metaSM`,
  `prose`, …) would shift every other use. When you need true **per-cell** padding
  (`cellPadding`/`cellPaddingTop`/`…`), that only exists on a real **`Card`** section —
  see [`card-layout.md`](./card-layout.md) — which needs a data source (or the blank-row
  fallback for static values); for static marketing stats a lexical card + an exclusive
  token is usually the lighter call.
- **Two sections fused into ONE card (compound visual unit).** Put the sections adjacent
  in the band, then **zero the shared-edge padding** and coordinate the borders/corners:
  upper section = border top+left+right, radius tl+tr, `padding.bottom = 0`; lower section =
  border left+right+bottom, radius bl+br, `padding.top = 0`. Their inner boxes touch → one
  continuous card. (Worked example: MAP-21 §02 — a header/hero lexical **Card** + the
  interstate **Graph**, composed into one card; the header carries the kicker/title/hero,
  the graph is the tinted chart footer.) Set the upper section's `title` to `""` if it would
  render a label band between the two.
- **Colored dots / simple inline marks** → a Lexical text run with an inline `style`
  (`color:#10B981`) on a `●`, or the `icon` node — inline before a label.
- **Icon *chip* (a colored/tinted square holding an SVG, e.g. a product-card icon)** → the
  `icon` node takes an optional **`styleKey`**: `{ type:'icon', iconName:'Activity', styleKey:'productChip' }`.
  It resolves `theme.iconStyles[styleKey] = { box, icon }` and renders the SVG inside the
  `box` span (omit `styleKey` → inline, as before — BC). Define the chip once in the brand
  theme (`iconStyles.productChip: { box:'inline-flex size-12 rounded bg-[…]/10 …', icon:'w-6 h-6' }`);
  `iconName` must be a key in `theme.Icons`. A **text chip** (a brand "NY" box, not an SVG)
  has no node — use an inline-styled text run (`style:'display:inline-flex;width:28px;height:28px;background:#…;border-radius:4px;…'`).
- **Lettered circular badges** → no native inline node; approximate (colored dot + a bold
  `styled` letter), or add a small inline badge node only if pixel parity is required.

The principle: **layout + chrome** are section concerns (`size`/`rowspan`/padding-gutter/
border/radius/bg); **content** is the component's; a component owns its **internal** padding.
Trying to force card chrome into Lexical content is the wrong layer.

### 5.7 Side-by-side CTAs — the column-layout pattern

For two CTAs immediately adjacent (e.g. a marketing hero with
"Get started" + "View docs" sitting flush together), the
50/50 split that the codebase's default `grid-cols-2` template
gives you spreads the buttons apart. The brand's lexical theme
should ship a content-width template (the tessera example uses
`grid-cols-1 md:grid-cols-[max-content_max-content_1fr]` — two
content-width columns then a flexible filler) so the buttons sit
tight together.

Pattern in the seed:
```js
layout('grid-cols-1 md:grid-cols-[max-content_max-content_1fr]', [
  [para(button('See it run · wcdb.fm →', '#', 'default'))],  // primary
  [para(button('Host your own →',          '#', 'plain'))],   // secondary
  [para(text(''))],                                            // filler
]),
```

Three things to know:

1. **Buttons are *inline* lexical nodes.** They must be wrapped in
   a paragraph (`para(button(...))`) inside the layout-item — not
   placed as direct children of a layout-item.
2. **Brand themes should override `theme.lexical.layoutItem`** to
   drop the codebase default's `px-2 py-4` (which adds 32 px of
   vertical empty space inside every column). Tessera ships
   `layoutItem: 'min-w-0 max-w-full'`. Without this, side-by-side
   CTAs sit inside a thick vertical band that breaks the
   visual rhythm with text above.
3. **Brand themes should also declare `theme.lexical.layoutTemplates`**
   so authors using the `/columns` slash command in the editor see
   brand-specific presets in the dropdown (including the
   side-by-side template). The dialog auto-reads from
   `editor._config.theme.layoutTemplates`. See the worked example
   in `src/themes/tessera/tessera-theme.js`.
4. **Full-width row (a `1fr` spacer pushing one column to the far edge —
   e.g. a topnav `brand · links · [1fr] · actions`) needs width to flow from
   TWO places, or the `1fr` collapses and the right column lands mid-row:**
   - **The band wrapper must *stretch* the section, not shrink-wrap it.** A
     `layoutGroup` style whose `wrapper2` is a flex **row** (`flex items-center`)
     sizes its section child to content width. Use `flex flex-col justify-center`
     instead (cross-axis stretch fills the band width; `justify-center` still
     centers vertically in a fixed-height bar) — that's what the normal content
     bands do (`flex flex-col gap-…`). This was the real culprit for a topnav bar
     that rendered half-width.
   - **Then the layout-container needs `w-full`.** `LayoutContainerNode.createDOM`
     appends `templateColumns` verbatim as classes alongside
     `theme.lexical.layoutContainer`, which is often just `grid gap-… mt-…` (no
     width) — so even inside a full-width section the grid shrink-wraps. Pass e.g.
     `layout('w-full !mt-0 items-center grid-cols-[max-content_1fr_max-content]', …)`
     (`!mt-0` cancels the container's default top margin when the row must sit flush).
   Verify by measuring band widths in the DOM — a too-narrow band among otherwise
   equal bands points at (a); a full-width band with a narrow grid points at (b).

### 5.7.1 Inline text links that navigate (nav / footer / "View →")

For *text* links that should navigate **client-side** (topnav items, footer link
columns, a card's "View →"), prefer the **`button()` node with a chrome-less style**
over a Lexical `link` node. Two reasons: the `ButtonNode` navigates via `useNavigate`
(SPA, no full reload — the DMS nav convention) and uses `window.open` for external
`http(s)://`/`//` URLs; and its `style` lets each link match the surrounding type
(a Lexical `link` node renders an `<a>` with a single global blue-underline style and
full-page reloads on internal paths). Add brand button styles with no bg/border (e.g.
`navlink`, `footerlink`, `cardlink`) and call `button('Label', '/path', 'navlink')`.
Unbuilt targets → `'#'` is a safe placeholder (the node `preventDefault`s and
`navigate('#')` stays on the page). In view mode the node renders as a `<span>` with the
style's classes, so it reads as text, not a `<button>`.

---

## 6. Draft-only discipline

**This skill never publishes.** Pages and sections produced by
the seed script must land in draft state and stay there until a
human user runs `dms page publish` themselves. The rationale is
the user's explicit request: a designer / engineer can iterate on
content freely without affecting the live site, and the human
who owns the brand gets the final say on what goes public.

What this means in practice:

- ✅ `dms page create` — fine; pages land as `published: "draft"`
  by default.
- ✅ `dms section create` — fine; sections land in the page's
  `draft_sections` array automatically.
- ✅ `dms section update` — fine; you're editing a draft.
- ❌ `dms page publish` — **never call this from the script**.
  Document the publish step for the human reviewer instead.
- ❌ Direct writes to `data.sections` via `raw update` — **never
  do this**. That bypasses the draft lifecycle.

If you need to give a reviewer a one-liner for publishing, put it
in a README next to the script:

```bash
# After review, to publish all draft pages in tessera/main:
for p in $(dms page list --compact | jq -r '.items[].id'); do
  dms page publish "$p"
done
```

---

## 7. Seed script template

Encoding the page inventory as data and looping over it is more
maintainable than hand-typing dozens of CLI commands. A typical
script:

A complete working example lives at
[`scripts/seed-tessera-pages.mjs`](../../../../scripts/seed-tessera-pages.mjs)
— read that first; it's the canonical template and it handles
every gotcha listed in this skill.

The script's structure, briefly:

1. **Connection setup** — env vars (`DMS_HOST`, `DMS_APP`,
   `DMS_TYPE`) with the run-script defaults baked in.
2. **CLI runner** — `execFileSync` wrapper around
   `node src/dms/packages/dms/cli/bin/dms.js`.
3. **Lexical builders** — small helpers (`text`, `para`, `head`,
   `list`, `quote`, `lexical`) that produce a Lexical state tree
   and `JSON.stringify` it into the `element-data` shape the
   renderer expects.
4. **`ensureSectionGroup(slug, pageId)`** — checks the page's
   `draft_section_groups`; if empty, writes a single default
   group via `dms raw update --set` and returns its UUID.
5. **`wipeDrafts(slug)`** — deletes all existing draft sections on
   a page; gated behind `WIPE=1` env var so re-runs can be either
   appending or idempotent.
6. **Page inventory** — an array of `{ slug, title, sections: [{ title, data }] }`.
7. **Apply loop** — for each page: reuse-or-create the page,
   optionally wipe drafts, ensure a group, then for each section
   build the full payload (`title`, `type`, `group`, `parent`,
   `trackingId`, `element: { element-type, element-data }`) and
   call `dms section create <pageId> --data '<json>'`.

The page-creation step is **idempotent** (reuses by slug);
section creation is **append-only** by default. To do a clean
re-run on a page, set `WIPE=1` so the script first deletes the
prior draft sections. Pages already published are never touched
— `draft_sections` is the only field the script writes to.

Read the worked file for full implementation; copy its scaffold
when seeding a new pattern.

---

## 8. Verification

After running the seed script:

1. **`dms site tree`** — confirms the page hierarchy.
2. **`dms page dump <slug> --sections`** — sanity-check a couple
   of pages' sections.
3. **Open the admin UI** at the configured base URL. Walk the
   draft page in edit mode (`<host>/edit/<slug>`). Confirm Lexical
   renders as expected, Card placeholders are clearly labelled.
   **Draft sections only render in edit mode**, which needs auth —
   point `card-shot.mjs --storage <auth.json>` at the edit URL
   (mint with `scripts/mint-token.mjs`).
4. **Hand off.** Write a short note (or a `scripts/README.md`)
   for the reviewer with: which pages exist as drafts, what
   each represents, and the publish command they should run when
   ready.

### Common failures and how to spot them

| Symptom | Cause | Fix |
|---|---|---|
| `dms page create` errors with "duplicate type" | A page with that slug already exists | Use `dms page show <slug>` to verify and `dms page update` instead, or pick a different slug |
| Lexical section renders blank | `element-data` was passed as an object, not a JSON string | `JSON.stringify` the inner value before assembling the outer payload |
| Section appears in admin but not on the live page | Section is in `draft_sections` only (correct). The reviewer needs to run `dms page publish` | No action needed — that's the design |
| Section type comes through as `(untitled)` lexical | `--title` flag was not passed and `--data` did not include a `title` key | Re-create the section with `--title` |
| Section appears in the admin tree but renders blank on the page | The CLI `--data` payload was flat (`element-type` / `element-data` at top level) instead of wrapped in `element: { … }`. The renderer reads `value.element['element-data']` and ignores top-level keys. | Re-shape the payload per §5.2 and re-create the section. The flag-driven `--element-type` form falls into the same trap; always use `--data` with the full nested shape. |
| `dms section create` fails with "pattern not found" | Wrong `DMS_APP` / `DMS_TYPE`, or the pattern doesn't exist | Run `dms site tree` to verify; check `.dmsrc` or env vars |
| `/edit/<slug>` shows a **different pattern's page** (or your page is unreachable) | **Multiple patterns share `base_url: /`** on the site. A subdomain-specific pattern (e.g. `npmrds_sub` on `npmrds.localhost`) shadows a `subdomain: null` pattern at `/`. | A `subdomain: null` pattern is the **default/fallback** — reach it on the **bare host**: `http://localhost:5173/edit/<slug>` (mint a token for *that* origin: `mint-token.mjs --origin http://localhost:5173`). Confirm ownership with `dms site tree` (lists every pattern's `base_url`). Also pass `--pattern <id>` on `section create` so type resolution doesn't pick a sibling `/` pattern. |

---

## 9. What NOT to do in this skill

- ❌ **Don't publish.** Drafts stay drafts. See §6.
- ❌ **Don't invent a new section element type.** If a mockup
  needs something the existing Component Registry doesn't have,
  raise it as a `creating-page-section-components.md` task —
  don't bend the cli into doing it.
- ❌ **Don't write fake data into a Card section to make it look
  real.** If there's no Source, leave a Lexical placeholder; let
  a human author wire up the source later.
- ❌ **Don't use `raw update` on `data.sections`.** That bypasses
  the publish flow. Always go through `dms section create` /
  `dms section update` (which write to `draft_sections`).
- ❌ **Don't hardcode credentials.** If the server requires auth,
  set `DMS_AUTH_TOKEN` in the env, not in the script source.

---

## 10. When to write a different skill

If the work this skill does is too narrow for your case, consider
spinning off:

- **A skill for a specific component type's `element-data` shape**
  (e.g. "Building a Spreadsheet section's column config"). The
  Lexical helper in §7 is the template; do the same for the
  other element types as their `element-data` shapes become
  load-bearing.
- **A skill for bulk-importing dataset rows** to back Card
  sections. The CLI's `raw create` for split-table data types is
  the surface; a thin skill covering the conversion from CSV /
  XLSX would help.
- **A skill for migrating an existing pattern's sections** to a
  new theme — different from this skill because the input is an
  existing pattern, not a fresh design system.

---

## 11. Reading list

Before authoring pages, read in order:

1. **This skill.**
2. **[`src/dms/CLAUDE.md`](../CLAUDE.md)** — the data model
   (`app` / `type`, the hierarchy, split tables).
3. **[`src/dms/skills/card-layout.md`](./card-layout.md)** —
   everything an author can do with a Card section without code.
4. **[`src/dms/packages/dms/cli/docs/README.md`](../packages/dms/cli/docs/README.md)**
   and **[`EXAMPLES.md`](../packages/dms/cli/docs/EXAMPLES.md)**
   — the CLI reference and recipe cookbook.
5. **[`designing-a-dms-design-system.md`](./designing-a-dms-design-system.md)**
   and **[`translating-design-system-to-dms-theme.md`](./translating-design-system-to-dms-theme.md)**
   — the upstream skills that produce the design system this
   skill consumes.
6. **[`creating-page-section-components.md`](./creating-page-section-components.md)**
   — when a mockup needs a primitive that doesn't exist yet.

---

## Appendix — quick reference cheat sheet

```
Env vars:            DMS_HOST  DMS_APP  DMS_TYPE  [DMS_AUTH_TOKEN]
Hierarchy:           app → site → pattern → page → component (section)
Page lands as:       published="draft"
Section lands in:    page.data.draft_sections (NOT .sections)

Common commands:
  dms site tree
  dms page list
  dms page show <slug-or-id> [--compact]
  dms page dump <slug-or-id> --sections
  dms page create --title "…" --slug "…" [--parent <id>]
  dms page update <id> --set key=val
  dms raw update <page-id> --set draft_section_groups='[…]'      ← write the band list (draft ONLY;
                                                                    never --set section_groups — that's
                                                                    published, owned by `page publish`)
  dms section create <page-id-or-slug> --data '<json-with-nested-element>'
  dms section update <id> --data ./file.json
  dms section delete <id> --page <slug>
  dms raw create <app> <type> --data '<json>'     ← patterns / dmsenvs

PAGES HAVE BANDS, NOT JUST SECTIONS
  draft_section_groups[] entries pick LayoutGroup style by name:
    { name: <uuid>, index: N, position: 'top|content|bottom',
      theme: '<layoutGroup style name>', displayName: '...' }
  Each section's `group` field is the UUID of its band.
  A hero on bone vs cards in a parchment box vs a limestone footer
  ⇒ three section_groups, three theme values, one page.

Lexical element-data is a JSON STRING, not an object.

DRAFT-ONLY DISCIPLINE
  ✅ dms section create     (writes draft_sections)
  ✅ dms section update     (edits a draft)
  ❌ dms page publish       (humans only; never call from a seed script)
  ❌ raw write to .sections (bypasses publish; never)

Worked example:  scripts/seed-tessera-pages.mjs
```
