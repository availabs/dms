// Default (un-branded) SourcePage theme. A site theme overrides via
// `datasets.sourcePage` (see src/themes/transportny for the branded version).
// The shell is: full-bleed breadcrumb bar (datasets.breadcrumbs) → header band
// (title + version selector) → tab bar (active underline) → page body.
export const sourcePageTheme = {
    // flex column so the content band can flex-1 fill to the page bottom.
    // min-w-0 (here AND on body) keeps a wide child (Table) from propagating its width up the flex
    // chain and scrolling the whole page — the table scrolls inside its own overflow-auto container.
    pageWrapper: 'w-full min-w-0 flex flex-col flex-1',

    // full-bleed content band — gray field that fills remaining height (flex-1) so the
    // background reaches the page bottom no matter how short the page content is.
    // min-w-0 so a wide child (e.g. the Table) scrolls within itself instead of widening the page.
    // flex-col so a fill-height page (Table) can flex-1 to the remaining height; content-height pages
    // (Overview/Admin) keep their natural size with the gray band filling below them.
    body: 'w-full min-w-0 bg-gray-50 flex-1 flex flex-col',

    // header band — title row + tab bar share the same full-width white band;
    // the band's bottom border doubles as the tab-underline track.
    header: 'w-full bg-white border-b border-gray-200 px-6 pt-4',
    headerInner: 'flex items-center justify-between gap-4',
    title: 'min-w-0 text-2xl font-semibold tracking-tight text-gray-900 truncate',
    headerRight: 'flex items-center gap-2 shrink-0',
    // page-injected header actions (e.g. Table's "Set Default Columns"), shown next to the version selector
    headerActionBtn: 'h-8 inline-flex items-center gap-1.5 px-3 rounded-md border border-gray-300 bg-white text-gray-600 text-xs uppercase tracking-wide hover:bg-gray-50 cursor-pointer',
    versionLabel: 'text-xs uppercase tracking-wide text-gray-400',
    versionSelect: 'text-sm rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50',

    // tabs
    tabBarWrap: 'mt-3 -mb-px',
    tabNav: 'flex items-end gap-1',
    tab: 'px-4 h-10 inline-flex items-center text-sm font-medium border-b-2 -mb-px transition-colors',
    tabActive: 'border-blue-600 text-blue-700',
    tabInactive: 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',

    loading: 'p-4 text-gray-400',
}
