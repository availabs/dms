// The qa pattern's look: its tokens and its QA-only named styles, the source of the pattern's default
// theme (defaultTheme.js), which the library default theme carries under `qa` like `pages` and
// `datasets`. A site restyles QA through its own theme's `qa` key, naming only what differs.
// The named styles reach the shared components (Card, bands, pills, tables) only on QA pages:
// withQaTheme.js adds them to those components' style lists where the pages render (pages/view.jsx),
// so no other page's style pickers list them.
//
// Token rule (planning/tasks/current/qa-pattern-type-archive.md, part 2, "Rules carried in"):
//   - QA-only (`--qa-*`, `qa_*` styles) for what only means something in QA: severity, status kind,
//     priority, page stage, story status, the tickets bars.
//   - The theme's shared tokens (`--t-*`, the `.t-*` type classes) wherever a QA element should look
//     like the rest of its site: surfaces, text, rules, shadows, type. A theme edit to those then
//     moves QA with it; a site's `qa.vars` sets them for QA pages only.
//   - No copied literals: every `--qa-*` is defined from a `--t-*`.
// Every class below is written out in full: Tailwind only generates classes it finds literally in
// the source, so a marker colour can't be built by string interpolation.

import { dataBarTheme } from "../../ui/columnTypes/dataBar.theme"
import { stackedBarTheme } from "../../ui/columnTypes/stacked_bar.theme"
import { flowStepTheme } from "../../ui/columnTypes/flow_step.theme"
import { sectionArrayTheme } from "../page/components/sections/sectionArray.theme"
import { tableTheme } from "../../ui/components/table/table.theme"
import { inputTheme } from "../../ui/components/Input.theme"

// The library defaults of the flat themes QA extends, so a QA map (fills, dots) adds to them.
export const LIBRARY_FLAT = { dataBar: dataBarTheme, stackedBar: stackedBarTheme, flowStep: flowStepTheme }

// ── tokens: their own style block, after the base tokens (`dms-default-tokens`). A host theme
// re-skins QA by changing its base tokens, or overrides any `--qa-*` in its own block. Dark mode needs
// no second copy: `data-theme` sits on <html>, so these resolve against the dark base values.
// Declared on the QA page wrapper too (`.dms-qa-page`, pages/view.jsx): a site's `qa.vars` set the
// `--t-*` there, and a custom property's var() resolves where it's declared, so a `--qa-*` declared
// only on :root would keep the root's colours. ──
export const qaTokensCss = `
  :root, .dms-qa-page {
    /* severity: a square tile, the louder the tile the worse */
    --qa-sev-blocker:      var(--t-brick);
    --qa-sev-blocker-soft: var(--t-brick-soft);
    --qa-sev-major:        var(--t-amber);
    --qa-sev-major-soft:   var(--t-amber-soft);
    --qa-sev-minor:        var(--t-cobalt);
    --qa-sev-minor-soft:   var(--t-cobalt-soft);
    --qa-sev-polish:       var(--t-pencil);
    --qa-sev-feature:      var(--t-go);
    --qa-sev-feature-soft: var(--t-go-soft);

    /* status kind (ticketRecord.js DEFAULT_STATUSES): a round marker that fills as work moves */
    --qa-kind-triage:   var(--t-pencil);
    --qa-kind-active:   var(--t-cobalt);
    --qa-kind-waiting:  var(--t-amber);
    --qa-kind-done:     var(--t-go);
    --qa-kind-canceled: var(--t-pencil);

    /* priority */
    --qa-prio-now:   var(--t-brick);
    --qa-prio-next:  var(--t-amber);
    --qa-prio-later: var(--t-pencil);

    /* page stages are ordered: one ramp of the accent, ending in success at the client's sign-off */
    --qa-stage-proposed:    var(--t-rule-strong);
    --qa-stage-design:      color-mix(in srgb, var(--t-cobalt) 28%, var(--t-panel));
    --qa-stage-implemented: color-mix(in srgb, var(--t-cobalt) 52%, var(--t-panel));
    --qa-stage-qa:          color-mix(in srgb, var(--t-cobalt) 76%, var(--t-panel));
    --qa-stage-dev:         var(--t-cobalt);
    --qa-stage-client:      var(--t-go);

    /* story status (proposed → accepted → verified) and the tickets bars */
    --qa-story-proposed: var(--t-pencil);
    --qa-story-accepted: var(--t-cobalt);
    --qa-story-verified: var(--t-go);
    --qa-tix-done: var(--t-go);
    --qa-tix-open: var(--t-amber);
  }
`

// ── pill (status_pill cells via `pillColors`, and their edit menus) ──
// Severity: a square-cornered chip with a square tile; Major and Blocker get louder fills. Colours
// are per style (not a base to override): two conflicting utilities resolve by CSS order, not class order.
const SEV = "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 t-proseXS !font-medium before:content-[''] before:size-2 before:flex-none before:rounded-[2px]"
const SEV_QUIET = "border-[var(--t-rule)] bg-[var(--t-panel)] text-[var(--t-ink)]"
// Status, story: a round chip with a round marker.
const ROUND = "inline-flex items-center gap-1.5 rounded-full border border-[var(--t-rule)] bg-[var(--t-panel)] px-2 py-0.5 t-proseXS text-[var(--t-ink)] before:content-[''] before:size-2 before:flex-none before:rounded-full"
// Priority: a small mono tag in the priority's colour.
const PRIO = "inline-flex items-center rounded-md border border-[var(--t-rule)] px-1.5 py-0.5 t-metaXS"

export const qaPillStyles = [
  { name: 'qa_sev_blocker', wrapper: `${SEV} border-transparent bg-[var(--qa-sev-blocker-soft)] text-[var(--qa-sev-blocker)] before:bg-[var(--qa-sev-blocker)]` },
  { name: 'qa_sev_major',   wrapper: `${SEV} border-[var(--t-rule)] bg-[var(--qa-sev-major-soft)] text-[var(--t-ink)] before:bg-[var(--qa-sev-major)]` },
  { name: 'qa_sev_minor',   wrapper: `${SEV} ${SEV_QUIET} before:bg-[var(--qa-sev-minor)]` },
  { name: 'qa_sev_polish',  wrapper: `${SEV} ${SEV_QUIET} before:border before:border-[var(--qa-sev-polish)]` },
  { name: 'qa_sev_feature', wrapper: `${SEV} ${SEV_QUIET} before:bg-[var(--qa-sev-feature)]` },

  // by kind; "review" is the active kind's second step (fix landed), drawn half filled
  { name: 'qa_status_triage',   wrapper: `${ROUND} before:border-[1.5px] before:border-[var(--qa-kind-triage)]` },
  { name: 'qa_status_active',   wrapper: `${ROUND} before:bg-[var(--qa-kind-active)]` },
  { name: 'qa_status_review',   wrapper: `${ROUND} before:border before:border-[var(--qa-kind-active)] before:bg-[linear-gradient(90deg,var(--qa-kind-active)_50%,transparent_50%)]` },
  { name: 'qa_status_waiting',  wrapper: `${ROUND} before:border-[1.5px] before:border-[var(--qa-kind-waiting)]` },
  { name: 'qa_status_done',     wrapper: `${ROUND} before:bg-[var(--qa-kind-done)]` },
  { name: 'qa_status_canceled', wrapper: `${ROUND} before:bg-[var(--qa-kind-canceled)]` },

  { name: 'qa_prio_now',   wrapper: `${PRIO} text-[var(--qa-prio-now)]` },
  { name: 'qa_prio_next',  wrapper: `${PRIO} text-[var(--qa-prio-next)]` },
  { name: 'qa_prio_later', wrapper: `${PRIO} text-[var(--qa-prio-later)]` },

  { name: 'qa_story_proposed', wrapper: `${ROUND} before:border-[1.5px] before:border-[var(--qa-story-proposed)]` },
  { name: 'qa_story_accepted', wrapper: `${ROUND} before:border before:border-[var(--qa-story-accepted)] before:bg-[linear-gradient(90deg,var(--qa-story-accepted)_50%,transparent_50%)]` },
  { name: 'qa_story_verified', wrapper: `${ROUND} before:bg-[var(--qa-story-verified)]` },
]

// The token block as a theme `fonts` entry, for loadThemeFonts (deduped by id).
export const QA_TOKENS_FONT = { type: 'style', id: 'dms-qa-tokens', content: qaTokensCss }

// A QA pill style's classes by name, for React code that renders outside the QA pages (the admin's
// Configure tab), where the theme carries no `qa_*` named styles.
export const qaPillClass = (name) => qaPillStyles.find((st) => st.name === name)?.wrapper || ''

// Pill-shaped legend keys: a marker and a label, no chip (the summary's "open by severity" and
// "found by" rows). Source colours reuse the base palette: the same three the stacked bar uses.
const KEY = "inline-flex items-center gap-1.5 t-proseXS text-[var(--t-ink)] before:content-[''] before:size-2 before:flex-none before:rounded-[2px]"
qaPillStyles.push(
  { name: 'qa_key_sev_blocker', wrapper: `${KEY} before:bg-[var(--qa-sev-blocker)]` },
  { name: 'qa_key_sev_major',   wrapper: `${KEY} before:bg-[var(--qa-sev-major)]` },
  { name: 'qa_key_sev_minor',   wrapper: `${KEY} before:bg-[var(--qa-sev-minor)]` },
  { name: 'qa_key_sev_polish',  wrapper: `${KEY} before:border before:border-[var(--qa-sev-polish)]` },
  { name: 'qa_key_sev_feature', wrapper: `${KEY} before:bg-[var(--qa-sev-feature)]` },
  { name: 'qa_key_source_ai',     wrapper: `${KEY} before:bg-[var(--t-cobalt)]` },
  { name: 'qa_key_source_dev',    wrapper: `${KEY} before:bg-[var(--t-graphite)]` },
  { name: 'qa_key_source_client', wrapper: `${KEY} before:bg-[var(--t-amber)]` },
  // a page's build and data state (Page QA's facts)
  { name: 'qa_build_none',      wrapper: `${ROUND} before:border-[1.5px] before:border-[var(--t-pencil)]` },
  { name: 'qa_build_progress',  wrapper: `${ROUND} before:border before:border-[var(--t-amber)] before:bg-[linear-gradient(90deg,var(--t-amber)_50%,transparent_50%)]` },
  { name: 'qa_build_draft',     wrapper: `${ROUND} before:bg-[var(--t-cobalt)]` },
  { name: 'qa_build_published', wrapper: `${ROUND} before:bg-[var(--t-go)]` },
  { name: 'qa_data_real',    wrapper: `${ROUND} before:bg-[var(--t-go)]` },
  { name: 'qa_data_partial', wrapper: `${ROUND} before:border before:border-[var(--t-amber)] before:bg-[linear-gradient(90deg,var(--t-amber)_50%,transparent_50%)]` },
  { name: 'qa_data_mock',    wrapper: `${ROUND} before:border-[1.5px] before:border-[var(--t-pencil)]` },
  // a quiet tag (a ticket's category)
  { name: 'qa_tag', wrapper: 'inline-flex items-center rounded-md border border-[var(--t-rule)] bg-[var(--t-well)] px-2 py-0.5 t-proseXS text-[var(--t-graphite)]' },
  // a free-text value where pills would sit (an assignee in Recent activity): plain text, cut to its box
  // (a pill's height: its padding plus border, so rows of pills and plain values line up)
  { name: 'qa_plain', wrapper: 'inline-block max-w-full truncate py-[3px] t-proseXS text-[var(--t-ink)]' },
  // marks a placeholder for a feature not built yet
  { name: 'qa_planned', wrapper: 'inline-flex items-center rounded-full border border-dashed border-[var(--t-rule-strong)] px-2 t-metaXS text-[var(--t-pencil)]' },
)

// ── text styles: keys added to textSettings, so a QA Card's valueFontStyle / headerFontStyle can
// name them. Built from the shared type scale (.t-*) and colours (--t-*). Every .t-* class sets its
// own font-weight and is unlayered, so a weight utility beside one needs `!` (`!font-medium`) or it
// never applies; the same holds for case and tracking (qaMono). ──
export const qaTextStyles = {
  // page and card titles: the library's h4 / h5 (the shared display sizes) as QA's own keys, so a
  // site restyles QA's titles without changing its site-wide h4 / h5
  qaPageTitle: 't-displayMD text-[var(--t-ink)]',
  qaCardTitle: 't-displaySM text-[var(--t-ink)]',
  qaCrumb: 't-metaMD text-[var(--t-pencil)]',
  qaEyebrow: 't-metaXS text-[var(--t-pencil)]',
  qaBody: 't-proseSM text-[var(--t-graphite)]',
  qaBodyStrong: 't-proseSM !font-medium text-[var(--t-ink)]',
  // bold body text: what a row is about (Recent activity's ticket number and title). The .t-* type
  // classes set their own weight and are unlayered, so the weight needs `!` (as qaMono's overrides)
  qaBodyBold: 't-proseSM !font-semibold text-[var(--t-ink)]',
  qaSmall: 't-proseXS text-[var(--t-graphite)]',
  qaSmallMuted: 't-proseXS text-[var(--t-pencil)]',
  qaFigure: 't-displayLG tabular-nums text-[var(--t-ink)]',
  // the .t-* classes are unlayered, so they beat a plain Tailwind utility: the case and tracking
  // overrides need `!`
  qaMono: 't-metaSM !normal-case !tracking-normal tabular-nums text-[var(--t-pencil)]',
  // an outlined action link ("add ticket")
  qaButton: 'inline-flex items-center gap-1.5 t-proseSM !font-medium border border-[var(--t-rule-strong)] bg-[var(--t-panel)] text-[var(--t-ink)] rounded-md px-3 py-1.5 hover:border-[var(--t-ink)]',
  // the page's main action ("add ticket"), filled with the accent
  qaButtonPrimary: 'inline-flex items-center gap-1.5 t-proseSM !font-medium bg-[var(--t-cobalt)] text-[var(--t-accent-ink)] rounded-md px-3.5 py-1.5 hover:bg-[var(--t-cobalt-deep)] cursor-pointer',
  // a smaller outlined action ("open page", "all tickets")
  qaButtonSM: 'inline-flex items-center gap-1 t-metaXS text-[var(--t-graphite)] border border-[var(--t-rule-strong)] rounded-md px-2.5 py-1 hover:border-[var(--t-ink)] hover:text-[var(--t-ink)]',
  // reading text (a ticket's description) and a field label in a rail
  qaProse: 't-prose text-[var(--t-ink)]',
  qaLabel: 't-proseXS text-[var(--t-graphite)]',
  // an in-text link
  qaLink: 't-proseSM !font-medium text-[var(--t-cobalt)] hover:underline',
  // one option of a segmented control (All / Open / Closed); the active one is the card's cellActive
  qaSegment: 'inline-flex items-center h-7 px-2.5 t-proseSM text-[var(--t-graphite)] hover:text-[var(--t-ink)] whitespace-nowrap',
}

// ── layout groups: the page bands ──
const BAND_INNER = 'flex flex-1 w-full flex-col relative max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-10 font-sans text-[var(--t-ink)]'
export const qaLayoutGroupStyles = [
  // the header band: panel surface, a rule below
  { name: 'qa_header', wrapper1: 'w-full flex flex-row border-b border-[var(--t-rule)] bg-[var(--t-panel)]', wrapper2: `${BAND_INNER} py-5`, wrapper3: '' },
  // a content band on the paper; the last one on a page closes it off with more room below
  { name: 'qa_content', wrapper1: 'w-full flex flex-row', wrapper2: `${BAND_INNER} pt-6`, wrapper3: '' },
  { name: 'qa_content_end', wrapper1: 'w-full flex flex-row', wrapper2: `${BAND_INNER} pt-6 pb-12`, wrapper3: '' },
  // a covered site's card on the Overview: the band draws the card (panel, rule, corners), so the
  // card holds whatever shows while the band is collapsed; `relative` puts the collapse toggle in
  // the card's corner. Its width lines it up with the other bands' section boxes: the default
  // section grid (1020px, centred) less its 16px section gutters; the card's sections set no gutter.
  { name: 'qa_site', wrapper1: 'w-full flex flex-row', wrapper2: `${BAND_INNER} pt-6`, wrapper3: 'relative mx-auto w-[calc(100%-2rem)] max-w-[988px] rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)]' },
]

// ── section grid (pages.sectionArray, picked by the band's name like its layoutGroup style): every
// QA band uses the library's own grid, so QA's section sizes ('1/3', '2/3', '1': fractions of a
// 6-column grid) mean the same on every site, whatever the site's own size map. ──
export const qaSectionArrayStyles = ['qa_header', 'qa_content', 'qa_content_end', 'qa_site']
  .map((name) => ({ ...sectionArrayTheme.styles[0], name }))

// ── Card styles: the predictable (v2) box model, layout-only structural keys (type comes from each
// cell's valueFontStyle), no ambient gutter; spacing is each section's own display knobs. ──
const QA_CARD = {
  layoutModel: 'v2', cellGutter: 0,
  // no type on the header wrapper: every QA cell names its headerFontStyle, and an inherited
  // uppercase here would leak into it
  header: '',
  value: '', valueWrapper: '',
  headerValueWrapper: 'w-full flex',
  subWrapper: 'w-full', subWrapperCompactView: 'flex flex-col',
  cardBorder: '', itemBorder: '',
  itemEditOutline: 'outline outline-[var(--t-cobalt-line)] -outline-offset-1',
  linkColValue: 'text-[var(--t-cobalt)] hover:underline',
  cellBorderSides: {
    top: 'border-t border-t-[var(--t-rule)]', right: 'border-r border-r-[var(--t-rule)]',
    bottom: 'border-b border-b-[var(--t-rule)]', left: 'border-l border-l-[var(--t-rule)]',
  },
}
// The edit-in-place field (Card's editField key): text until hovered, a ring when focused; a
// textarea grows with its text (field-sizing). Negative margin keeps the text aligned with labels.
const EDIT_FIELD = 'resize-none [field-sizing:content] -mx-2 w-[calc(100%+1rem)] bg-transparent border border-transparent rounded-md px-2 py-1 text-[var(--t-ink)] placeholder:text-[var(--t-pencil)] hover:bg-[var(--t-well)] focus:bg-[var(--t-panel)] focus:border-[var(--t-cobalt)] focus:outline-none focus:ring-2 focus:ring-[var(--t-cobalt-soft)] transition-colors'
// A form field: a box at rest (a create form reads as a form, unlike an edit-in-place record).
const FORM_FIELD = 'w-full t-proseSM bg-[var(--t-panel)] border border-[var(--t-rule-strong)] rounded-md px-3 py-1.5 text-[var(--t-ink)] placeholder:text-[var(--t-pencil)] focus:outline-none focus:border-[var(--t-cobalt)] focus:ring-2 focus:ring-[var(--t-cobalt-soft)]'
export const qaCardStyles = [
  // a page's header: crumb, title, figures, actions
  { name: 'qa_header', ...QA_CARD },
  // a summary card's bands (title + flow strip, figures)
  { name: 'qa_summary', ...QA_CARD },
  // a filter bar: segmented shortcuts + filter controls; the active shortcut lifts onto the panel
  { name: 'qa_filters', ...QA_CARD, cellActive: '!bg-[var(--t-panel)] shadow-[var(--t-shadow-lift)] [&_a]:!text-[var(--t-ink)]' },
  // a record edited in place (a ticket's body, its details rail): fields sit as text until hovered
  { name: 'qa_body', ...QA_CARD, editField: EDIT_FIELD },
  // label | value rows: a fixed label column, label and value centred on one line
  { name: 'qa_rail', ...QA_CARD, editField: EDIT_FIELD, headerValueWrapper: 'w-full flex items-center gap-2', header: 'w-[88px] shrink-0' },
  // a create form (the New ticket modal): boxed fields, the accent Add button
  {
    name: 'qa_form', ...QA_CARD, editField: FORM_FIELD, headerValueWrapper: 'w-full flex gap-1.5',
    formAddNewItemWrapper: 'col-span-full w-fit justify-self-end self-end pt-2',
    formAddButton: 'inline-flex items-center gap-1.5 t-proseSM !font-medium bg-[var(--t-cobalt)] text-[var(--t-accent-ink)] rounded-md px-3.5 py-1.5 hover:bg-[var(--t-cobalt-deep)] cursor-pointer',
  },
  // a placeholder for a feature not built yet: dashed frame (display.cardBorder on)
  { name: 'qa_planned', ...QA_CARD, cardBorder: 'border border-dashed border-[var(--t-rule-strong)] rounded-lg' },
  // a list of records as rows (the Overview's Recent activity): a rule under each row, the well on
  // hover (display.cardBorder on)
  { name: 'qa_feed', ...QA_CARD, subWrapper: 'w-full transition-colors hover:bg-[var(--t-well)]', cardBorder: 'border-b border-b-[var(--t-rule)]' },
]

// ── table: a list, not a grid. Rules between rows only, the well as the header strip. Built on the
// library's default table style, so a site's own default table (its borders, its container) doesn't
// fill in the keys qa_list leaves unset. ──
export const qaTableStyles = [
  {
    ...tableTheme.styles[0],
    name: 'qa_list',
    headerCellContainer: 'w-full px-3 py-2 content-center t-metaXS text-[var(--t-pencil)]',
    headerCellContainerBg: 'bg-[var(--t-well)] text-[var(--t-pencil)]',
    cell: 'relative flex items-center min-h-[47px] border-0 border-b border-[var(--t-rule)]',
    cellInner: 'w-full min-h-full flex flex-wrap items-center truncate px-3 py-2.5 t-proseSM text-[var(--t-graphite)]',
    cellBg: 'bg-[var(--t-panel)] hover:bg-[var(--t-well)]',
    cellBgOdd: 'bg-[var(--t-panel)] hover:bg-[var(--t-well)]',
    cellBgEven: 'bg-[var(--t-panel)] hover:bg-[var(--t-well)]',
    paginationContainer: 'w-full px-3 py-2 flex items-center justify-between border-t border-[var(--t-rule)]',
    paginationPagesInfo: 't-proseXS text-[var(--t-graphite)]',
    paginationRowsInfo: 't-proseXS text-[var(--t-pencil)]',
    emptyRow: 'px-3 py-12 text-center t-proseSM !font-medium text-[var(--t-ink)] border-b border-[var(--t-rule)]',
  },
]

// ── avlGraph: a QA chart card (picked by the section's activeStyle). Title row = title + caption
// (the graph's description) on one line; panel surface so dark mode follows the theme. ──
export const qaGraphStyles = [
  {
    name: 'qa_chart',
    bgColor: 'bg-[var(--t-panel)]',
    textColor: 'text-[var(--t-pencil)]',
    padding: 'px-5 pt-4 pb-3',
    headerWrapper: 'w-full flex items-baseline justify-between gap-2',
    title: 't-proseSM !font-medium text-[var(--t-ink)]',
    subtitle: 't-metaXS text-[var(--t-pencil)]',
  },
]

// ── stage meter (stage_progress): a page's stage as the accent ramp, with its name ──
export const qaStageProgressStyles = [
  {
    name: 'qa_ramp',
    variant: 'meter',
    meter: 'inline-flex items-center gap-2',
    segments: 'inline-flex gap-[2px]',
    segment: 'block w-2.5 h-1.5 rounded-[1px]',
    segmentUpcoming: 'bg-[var(--t-rule)]',
    segmentDone: 'bg-[var(--t-cobalt)]',
    segmentColors: {
      Proposed: 'bg-[var(--qa-stage-proposed)]', Design: 'bg-[var(--qa-stage-design)]', Implemented: 'bg-[var(--qa-stage-implemented)]',
      QA: 'bg-[var(--qa-stage-qa)]', 'Dev Acceptance': 'bg-[var(--qa-stage-dev)]', 'Client Acceptance': 'bg-[var(--qa-stage-client)]',
    },
    label: 't-proseSM text-[var(--t-graphite)]',
  },
]

// ── radio: a page's stage as a clickable list, and a form's choice chips ──
// (also the Configure tab's stage list)
export const STAGE_MARKERS = {
  Proposed: 'bg-[var(--qa-stage-proposed)]', Design: 'bg-[var(--qa-stage-design)]', Implemented: 'bg-[var(--qa-stage-implemented)]',
  QA: 'bg-[var(--qa-stage-qa)]', 'Dev Acceptance': 'bg-[var(--qa-stage-dev)]', 'Client Acceptance': 'bg-[var(--qa-stage-client)]',
}
export const qaRadioStyles = [
  {
    // ordered: stages before the current one are done (filled, ticked), after it upcoming (hollow)
    name: 'qa_steps',
    ordered: true,
    viewAsList: true,
    listCol: 'flex flex-col',
    wrapper: 'flex items-center gap-3 rounded-md px-2 py-1.5 -mx-2 cursor-pointer hover:bg-[var(--t-well)]',
    wrapperChecked: 'bg-[var(--t-cobalt-soft)]',
    input: 'sr-only',
    marker: 'w-4 h-4 rounded-full flex-none flex items-center justify-center text-[var(--t-accent-ink)]',
    markers: STAGE_MARKERS,
    markerChecked: 'ring-4 ring-[var(--t-cobalt-soft)]',
    markerUpcoming: 'border-[1.5px] border-[var(--t-rule-strong)]',
    doneTick: 'w-2.5 h-2.5',
    label: 't-proseSM text-[var(--t-graphite)]',
    labelChecked: 'text-[var(--t-ink)] font-medium',
    labelUpcoming: 'text-[var(--t-pencil)]',
    tag: 'ml-auto t-metaXS text-[var(--t-cobalt)]',
  },
  {
    // a row of chips, the picked one highlighted (has-[:checked] outranks the resting border)
    name: 'qa_choice',
    listRow: 'flex flex-wrap gap-1.5',
    wrapper: 'inline-flex items-center gap-1.5 rounded-md border border-[var(--t-rule)] px-2.5 py-1 cursor-pointer hover:border-[var(--t-rule-strong)] has-[:checked]:border-[var(--t-cobalt)] has-[:checked]:bg-[var(--t-cobalt-soft)]',
    input: 'sr-only',
    marker: 'w-2 h-2 rounded-[2px] flex-none',
    markers: {
      Blocker: 'bg-[var(--qa-sev-blocker)]', Major: 'bg-[var(--qa-sev-major)]', Minor: 'bg-[var(--qa-sev-minor)]',
      Polish: 'border border-[var(--qa-sev-polish)]', Feature: 'bg-[var(--qa-sev-feature)]',
    },
    label: 't-proseSM text-[var(--t-ink)]',
  },
]

// ── multiselect: the control inside a filter chip. The chip (the cell) draws the border, so the
// trigger is bare. ──
export const qaMultiselectStyles = [
  {
    name: 'qa_chip',
    inputWrapper: 'relative flex flex-wrap items-center gap-1 w-full min-h-0 cursor-pointer pl-0 pr-6 py-0.5 bg-transparent t-proseSM text-[var(--t-graphite)]',
    caretWrapper: 'pointer-events-none absolute inset-y-0 right-0 flex items-center pr-0.5',
    caretIcon: 'w-3.5 h-3.5 stroke-[var(--t-graphite)]',
    singlePlaceholder: 'truncate t-proseSM text-[var(--t-graphite)]',
    singleValue: 'truncate t-proseSM text-[var(--t-cobalt)]',
    tokenWrapper: 'inline-flex items-center gap-x-1 rounded px-1.5 py-0 t-proseXS bg-[var(--t-cobalt-soft)] text-[var(--t-cobalt)] whitespace-nowrap',
  },
  // a pill edited in place: the trigger is just the pill, the caret shows on hover. A named group:
  // the section wrapper is a `group` too, and a bare group-hover would show every caret at once.
  {
    name: 'qa_inline',
    mainWrapper: 'group/pill relative block w-fit',
    inputWrapper: 'relative flex flex-wrap items-center gap-1 w-fit min-h-0 cursor-pointer pl-0 pr-5 py-0.5 bg-transparent',
    caretWrapper: 'pointer-events-none absolute inset-y-0 right-0 flex items-center',
    caretIcon: 'w-3 h-3 stroke-[var(--t-pencil)] opacity-0 group-hover/pill:opacity-100 transition-opacity',
  },
]

// ── flat component themes: the QA look on QA pages, over the site's own (withQaTheme.js); map keys
// (fills, dots) add to the library's and the site's. ──
export const qaFlatThemes = {
  // the shared Input's wrapper (a filter chip's search box, an edit-in-place field): the library's
  // bare one, as QA's fields and chips draw their own box
  input: { inputContainer: inputTheme.inputContainer },
  // a filter control cell = one chip
  filterControlCell: {
    // the search chip's own input sits bare inside the chip (direct child only, so a picker's
    // in-menu search box keeps its look)
    wrapper: 'w-full inline-flex items-center gap-1.5 h-8 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] pl-2.5 pr-2 hover:border-[var(--t-rule-strong)] [&>span>input]:border-0 [&>span>input]:bg-transparent [&>span>input]:p-0 [&>span>input]:ring-0 [&>span>input]:focus:ring-0 [&>span>input]:t-proseSM [&>span>input]:placeholder:text-[var(--t-pencil)]',
    label: 't-proseSM text-[var(--t-graphite)] whitespace-nowrap',
    icon: 'size-3.5 text-[var(--t-pencil)] shrink-0',
  },
  // the status flow strip
  flowStep: {
    box: 'flex-1 min-w-0 h-full rounded-md border border-[var(--t-rule)] px-3 py-2.5 flex items-center gap-2',
    boxTint: 'flex-1 min-w-0 h-full rounded-md border border-transparent bg-[var(--t-go-soft)] px-3 py-2.5 flex items-center gap-2',
    boxDashed: 'flex-1 min-w-0 h-full rounded-md border border-dashed border-[var(--t-rule-strong)] px-3 py-2.5 flex items-center gap-2',
    // the shape is each dot's own: round for a status, square for a stage
    dot: 'size-2 shrink-0',
    // label and note wrap rather than truncate: a step's text is short, and its box is narrow
    label: 't-proseSM text-[var(--t-graphite)] min-w-0',
    note: 't-proseXS text-[var(--t-pencil)] min-w-0',
    count: 'ml-auto pl-2 t-displaySM tabular-nums text-[var(--t-ink)]',
    connector: 'shrink-0 pl-2 -mr-1 t-proseSM text-[var(--t-pencil)] select-none',
    dots: {
      qa_triage: 'rounded-full border-[1.5px] border-[var(--qa-kind-triage)]',
      qa_active: 'rounded-full bg-[var(--qa-kind-active)]',
      qa_review: 'rounded-full border border-[var(--qa-kind-active)] bg-[linear-gradient(90deg,var(--qa-kind-active)_50%,transparent_50%)]',
      qa_waiting: 'rounded-full border-[1.5px] border-[var(--qa-kind-waiting)]',
      qa_done: 'rounded-full bg-[var(--qa-kind-done)]',
      qa_stage_proposed: 'rounded-[2px] bg-[var(--qa-stage-proposed)]', qa_stage_design: 'rounded-[2px] bg-[var(--qa-stage-design)]',
      qa_stage_implemented: 'rounded-[2px] bg-[var(--qa-stage-implemented)]', qa_stage_qa: 'rounded-[2px] bg-[var(--qa-stage-qa)]',
      qa_stage_dev: 'rounded-[2px] bg-[var(--qa-stage-dev)]', qa_stage_client: 'rounded-[2px] bg-[var(--qa-stage-client)]',
    },
  },
  dataBar: {
    track: 'relative flex-1 min-w-0 h-1.5 rounded-full bg-[var(--t-well)] overflow-hidden',
    fill: 'absolute inset-y-0 left-0 rounded-full transition-[width] duration-300',
    fills: {
      qa_accent: 'bg-[var(--t-cobalt)]',
      qa_sev_blocker: 'bg-[var(--qa-sev-blocker)]', qa_sev_major: 'bg-[var(--qa-sev-major)]', qa_sev_minor: 'bg-[var(--qa-sev-minor)]',
      qa_sev_polish: 'bg-[var(--qa-sev-polish)]', qa_sev_feature: 'bg-[var(--qa-sev-feature)]',
    },
  },
  stackedBar: {
    track: 'w-full flex h-2 rounded-full overflow-hidden gap-[2px]',
    legend: 'pt-1.5 t-proseSM text-[var(--t-graphite)] tabular-nums',
    empty: 'pt-1.5 t-proseSM text-[var(--t-pencil)]',
    fills: {
      qa_source_ai: 'bg-[var(--t-cobalt)]', qa_source_dev: 'bg-[var(--t-graphite)]', qa_source_client: 'bg-[var(--t-amber)]',
      qa_stage_proposed: 'bg-[var(--qa-stage-proposed)]', qa_stage_design: 'bg-[var(--qa-stage-design)]',
      qa_stage_implemented: 'bg-[var(--qa-stage-implemented)]', qa_stage_qa: 'bg-[var(--qa-stage-qa)]',
      qa_stage_dev: 'bg-[var(--qa-stage-dev)]', qa_stage_client: 'bg-[var(--qa-stage-client)]',
      qa_tix_done: 'bg-[var(--qa-tix-done)]', qa_tix_open: 'bg-[var(--qa-tix-open)]',
      qa_story_verified: 'bg-[var(--qa-story-verified)]', qa_story_accepted: 'bg-[var(--qa-story-accepted)]', qa_story_proposed: 'bg-[var(--t-rule-strong)]',
    },
  },
}

// The QA-only named styles, by the theme key (a lodash path) their component reads.
export const QA_STYLES = {
  'pages.sectionArray': qaSectionArrayStyles,
  pill: qaPillStyles,
  layoutGroup: qaLayoutGroupStyles,
  dataCard: qaCardStyles,
  table: qaTableStyles,
  multiselect: qaMultiselectStyles,
  avlGraph: qaGraphStyles,
  stageProgress: qaStageProgressStyles,
  radio: qaRadioStyles,
}
