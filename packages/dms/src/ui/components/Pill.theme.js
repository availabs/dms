// Default pill theme — named styles selected by activeStyle (see Pill.jsx).
// styles[0] is the complete default. Each style's `wrapper`
// holds the full class string — the only source of the look (Pill takes no className). The
// pre-v6 look (orange/blue/green/red/gray tints, emerald/rose dotted statuses) is frozen for
// project themes in src/themes/_legacy/ui.js `pill`; the generic `status_*` variants let the
// built-in `status_pill` column type work out of the box on any theme.
//
// A site theme (e.g. transportny) overrides theme.pill with its own named styles to
// re-skin every pill (bordered tint + uppercase + dotted status pills, etc.).
// v6 (2026-10-13, ui-control-consistency-audit.md): 'blue' / 'orange' / 'green' are the page editor's
// small action pills (Duplicate, Use ID, + Condition / Remove, Reset all / Add, Apply, copied) →
// the small toolbar button and its danger variant; 'green' (save / apply / add / copied) looks the same
// as 'blue' (owner 2026-10-13: a filled confirm was too heavy among these). No blue. Pre-v6 tints frozen
// in src/themes/_legacy/ui.js `pill`.
// The small toolbar buttons the page editor draws with Pill ('blue' / 'green' action, 'orange' danger).
const SMALL = 'inline-flex items-center justify-center gap-1.5 h-6 px-2.5 rounded-md border whitespace-nowrap t-metaXS transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-ink)]';
const SMALL_ACTION = `${SMALL} border-[var(--t-rule)] bg-[var(--t-panel)] text-[var(--t-graphite)] hover:border-[var(--t-rule-strong)] hover:text-[var(--t-ink)]`;
const SMALL_DANGER = `${SMALL} border-[var(--t-brick)] bg-[var(--t-panel)] text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)]`;
// The spec's pill kinds (2026-10-14, ui-control-pills.md; design_system_v6 controls.py STATUS / MARKER / COUNT /
// TAG / TAG_SUB): status = r4 mono with a tone, marker = outlined r4 mono, count = outlined round mono,
// tag = well r4 prose (a removable tag puts its own × button in `text`), tag_sub = outlined tag.
const STATUS = 'inline-flex items-center gap-1.5 h-[18px] px-1.5 rounded t-metaXS';

export const pillTheme = {
    options: { activeStyle: 0 },
    styles: [
        { name: 'default', wrapper: `inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[10px] uppercase tracking-[0.08em] bg-[var(--t-well)] text-[var(--t-graphite)] border border-[var(--t-rule)]` },
        // 'gray' (Expand / Collapse All beside the column-manager toolbar) and 'red' join the toolbar looks
        // (2026-10-14; were hardcoded gray-400 text / red-500 tint — frozen in _legacy/ui.js `pill`)
        { name: 'gray',    wrapper: SMALL_ACTION },
        { name: 'orange',  wrapper: SMALL_DANGER },
        { name: 'blue',    wrapper: SMALL_ACTION },
        { name: 'green',   wrapper: SMALL_ACTION },
        { name: 'red',     wrapper: SMALL_DANGER },
        // the status_pill column type's variants — the boxed status kind (owner 2026-10-14: "the boxed chips in
        // the default theme"; were dotted emerald / amber / rose / slate, frozen in _legacy/ui.js `pill`)
        { name: 'status_good', wrapper: `${STATUS} bg-[var(--t-go-soft)] text-[var(--t-go)]` },
        { name: 'status_warn', wrapper: `${STATUS} bg-[var(--t-amber-soft)] text-[var(--t-amber)]` },
        { name: 'status_bad',  wrapper: `${STATUS} bg-[var(--t-brick-soft)] text-[var(--t-brick)]` },
        { name: 'status_na',   wrapper: `${STATUS} bg-[var(--t-well)] text-[var(--t-graphite)]` },
        // the spec's kinds (appended; stored indices above don't move)
        { name: 'status',        wrapper: `${STATUS} bg-[var(--t-well)] text-[var(--t-graphite)]` },
        { name: 'status_go',     wrapper: `${STATUS} bg-[var(--t-go-soft)] text-[var(--t-go)]` },
        { name: 'status_amber',  wrapper: `${STATUS} bg-[var(--t-amber-soft)] text-[var(--t-amber)]` },
        { name: 'status_brick',  wrapper: `${STATUS} bg-[var(--t-brick-soft)] text-[var(--t-brick)]` },
        { name: 'status_cobalt', wrapper: `${STATUS} bg-[var(--t-cobalt-soft)] text-[var(--t-cobalt)]` },   // running: a status, not a control
        { name: 'marker',        wrapper: 'inline-flex items-center h-[18px] px-1.5 rounded border border-[var(--t-rule)] t-metaXS text-[var(--t-graphite)]' },
        { name: 'count',         wrapper: 'inline-flex items-center h-[18px] px-1.5 rounded-full border border-[var(--t-rule)] t-metaXS text-[var(--t-pencil)]' },
        { name: 'tag',           wrapper: 'inline-flex items-center gap-1 h-6 px-1.5 rounded bg-[var(--t-well)] t-proseXS text-[var(--t-ink)]' },
        { name: 'tag_sub',       wrapper: 'inline-flex items-center gap-1 h-6 px-1.5 rounded border border-[var(--t-rule)] t-proseXS text-[var(--t-graphite)]' },
    ],
};

export const docs = [
    { activeStyle: 'orange', text: 'text' },
    { activeStyle: 'blue', text: 'text' },
    { activeStyle: 'status_go', text: 'done' },
    { activeStyle: 'status_brick', text: 'error' },
    { activeStyle: 'marker', text: 'internal' },
    { activeStyle: 'count', text: '12' },
    { activeStyle: 'tag', text: 'Hazards' },
]
