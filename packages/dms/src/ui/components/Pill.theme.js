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
const DOT = "[&::before]:content-[''] [&::before]:size-1.5 [&::before]:rounded-full [&::before]:mr-0.5";

export const pillTheme = {
    options: { activeStyle: 0 },
    styles: [
        { name: 'default', wrapper: `${BASE} text-gray-400` },
        { name: 'gray',    wrapper: `${BASE} text-gray-400` },
        { name: 'orange',  wrapper: `${BASE} bg-orange-500/15 text-orange-700 hover:bg-orange-500/25` },
        { name: 'blue',    wrapper: `${BASE} bg-blue-500/15 text-blue-700 hover:bg-blue-500/25` },
        { name: 'green',   wrapper: `${BASE} bg-green-500/15 text-green-700 hover:bg-green-500/25` },
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
