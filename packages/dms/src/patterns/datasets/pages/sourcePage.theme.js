// Default SourcePage (source shell) theme — tessera v6, ported 2026-10-06 from
// src/themes/tessera/design_system_v6/pages/datasets-source.html. A site theme overrides via
// `datasets.sourcePage`; project themes keep their pre-v6 look through
// src/themes/_legacy/datasets.js. The shell is: breadcrumb bar (datasets.breadcrumbs) → header
// band (title + subtitle + headerRight, tab bar at its base) → page body.
export const sourcePageTheme = {
    // flex column so the content band can flex-1 fill to the page bottom.
    // min-w-0 (here AND on body) keeps a wide child (Table) from propagating its width up the flex
    // chain and scrolling the whole page — the table scrolls inside its own overflow-auto container.
    pageWrapper: 'w-full min-w-0 flex flex-col flex-1',

    // content band — fills remaining height (flex-1); flex-col so a fill-height page (Table) can
    // flex-1 to the remaining height while Overview/Admin keep their natural size.
    body: 'w-full min-w-0 flex-1 flex flex-col',

    // header band — title row + tab bar share one band; its bottom border is the tab track.
    header: 'w-full border-b border-[var(--t-rule)] pl-6 lg:pl-12 pr-6 lg:pr-8 pt-5',
    headerInner: 'flex flex-wrap items-center gap-x-4 gap-y-2',
    titleWrap: 'min-w-0',
    title: 'min-w-0 t-displayMD text-[var(--t-ink)] truncate',
    // type · rows · versions line under the title ('' → not rendered)
    subtitle: 't-metaSM text-[var(--t-pencil)] mt-1',
    // while the source loads: placeholder bars in place of the title '…' ('' → '…', pre-v6)
    titleSkeleton: 'h-7 w-64 max-w-full rounded bg-[var(--t-well)] animate-pulse',
    subtitleSkeleton: 'h-3 w-48 max-w-full rounded bg-[var(--t-well)] animate-pulse mt-2',
    headerRight: 'ml-auto flex items-center gap-2 shrink-0',
    // page-injected header actions (e.g. Table's "Set Default Columns"), next to the version select
    versionLabel: 't-metaXS text-[var(--t-pencil)]',
    versionSelectWrap: 'w-48',   // UI.Select (fills its container)

    // tabs
    tabBarWrap: 'mt-3 -mb-px',
    // wraps on narrow screens; no overflow scroll (the tabs' -mb-px always overflowed → stray scrollbar)
    tabNav: 'flex flex-wrap items-end gap-x-5',
    tab: 'h-10 inline-flex items-center gap-1.5 px-1 t-proseSM font-medium lowercase border-b-2 -mb-px transition-colors whitespace-nowrap',
    tabActive: 'border-[var(--t-ink)] text-[var(--t-ink)]',   // ink (owner 2026-10-13: tabs ink in the default theme)
    tabInactive: 'border-transparent text-[var(--t-graphite)] hover:text-[var(--t-ink)]',
    tabIcon: 'size-3.5',
    adminTabIcon: 'Lock',

    loading: 'pl-6 lg:pl-12 pr-6 py-8 t-proseSM text-[var(--t-pencil)]',
    versionStates: 'yes',   // '' → no 'No versions yet' / 'No version #N' cards on version tabs (pre-v6)
    // source id that loads nothing — a StatePanel card (datasets.errorPage); '' → blank body (pre-v6)
    notFound: 'w-full max-w-[1200px] pl-6 lg:pl-12 pr-6 lg:pr-8 py-6',
    notFoundCard: 'rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)]',
    notFoundBtn: 'h-8 inline-flex items-center justify-center gap-1.5 px-3 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer',
}
