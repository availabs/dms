// Default pill theme — named styles selected by activeStyle (or the legacy `color`
// prop; see Pill.jsx). styles[0] is the complete default. Each style's `wrapper`
// holds the full class string. This default reproduces the historical inline look
// (orange/blue/green/red/gray tints) so any site without a `theme.pill` override
// renders as before — backward-compatible — and adds generic `status_*` variants so
// the built-in `status_pill` column type works out of the box on any theme.
//
// A site theme (e.g. transportny) overrides theme.pill with its own named styles to
// re-skin every pill (bordered tint + uppercase + dotted status pills, etc.).
const BASE = 'inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 font-regular sm:text-xs/5 forced-colors:outline';
// v6 (2026-10-13, ui-control-consistency-audit.md): 'blue' / 'orange' / 'green' are the page editor's
// small action pills (Duplicate, Use ID, + Condition / Remove, Reset all / Add, Apply, copied) →
// the small toolbar button and its danger variant; 'green' (save / apply / add / copied) looks the same
// as 'blue' (owner 2026-10-13: a filled confirm was too heavy among these). No blue. Pre-v6 tints frozen
// in src/themes/_legacy/ui.js `pill`.
const DOT = "[&::before]:content-[''] [&::before]:size-1.5 [&::before]:rounded-full [&::before]:mr-0.5";

export const pillTheme = {
    options: { activeStyle: 0 },
    styles: [
        { name: 'default', wrapper: `inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[10px] uppercase tracking-[0.08em] bg-[var(--t-well)] text-[var(--t-graphite)] border border-[var(--t-rule)]` },
        { name: 'gray',    wrapper: `${BASE} text-gray-400` },
        { name: 'orange',  wrapper: `inline-flex items-center justify-center gap-1.5 h-6 px-2.5 rounded-md border whitespace-nowrap t-metaXS transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-ink)] border-[var(--t-brick)] bg-[var(--t-panel)] text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)]` },
        { name: 'blue',    wrapper: `inline-flex items-center justify-center gap-1.5 h-6 px-2.5 rounded-md border whitespace-nowrap t-metaXS transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-ink)] border-[var(--t-rule)] bg-[var(--t-panel)] text-[var(--t-graphite)] hover:border-[var(--t-rule-strong)] hover:text-[var(--t-ink)]` },
        { name: 'green',   wrapper: `inline-flex items-center justify-center gap-1.5 h-6 px-2.5 rounded-md border whitespace-nowrap t-metaXS transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-ink)] border-[var(--t-rule)] bg-[var(--t-panel)] text-[var(--t-graphite)] hover:border-[var(--t-rule-strong)] hover:text-[var(--t-ink)]` },
        { name: 'red',     wrapper: `${BASE} bg-red-500/15 text-red-700 hover:bg-red-500/25` },
        // generic dotted status variants (the status_pill column type selects these)
        { name: 'status_good', wrapper: `inline-flex items-center gap-1.5 text-sm text-emerald-700 ${DOT} [&::before]:bg-emerald-500` },
        { name: 'status_warn', wrapper: `inline-flex items-center gap-1.5 text-sm text-amber-700 ${DOT} [&::before]:bg-amber-400` },
        { name: 'status_bad',  wrapper: `inline-flex items-center gap-1.5 text-sm text-rose-700 ${DOT} [&::before]:bg-rose-500` },
        { name: 'status_na',   wrapper: `inline-flex items-center gap-1.5 text-sm text-slate-500 ${DOT} [&::before]:bg-slate-400` },
    ],
};

export const docs = [{
    color: 'orange',
    text: 'text'
}, {
    color: 'blue',
    text: 'text'
}]
