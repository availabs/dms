// pages/settingsPages.jsx: an app's Settings sub pages (header keys come from editSite.theme.js, as the two pages
// it replaced used). Registered as `admin.settingsPages` in ../defaultTheme.js.
export const settingsPagesTheme = {
    // the sub page strip on the hub's tenant page (an app's own Settings lists its sub pages in the sidenav)
    tabs: 'flex flex-wrap gap-1 mb-4 border-b border-[var(--t-rule)]',
    tab: 'px-3 py-2 -mb-px t-metaSM text-[var(--t-pencil)] border-b-2 border-transparent hover:text-[var(--t-ink)]',
    tabActive: 'px-3 py-2 -mb-px t-metaSM text-[var(--t-ink)] border-b-2 border-[var(--t-ink)]',
    noAccess: 'flex items-center justify-center h-48 text-sm text-[var(--t-pencil)]',
}
