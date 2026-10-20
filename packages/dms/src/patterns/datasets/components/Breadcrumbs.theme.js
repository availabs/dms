// Default breadcrumb bar — tessera v6, ported 2026-10-06 from
// src/themes/tessera/design_system_v6/pages/datasets-*.html. In v6 the datasets breadcrumb IS
// the page's top row (h-14, mono crumbs). A theme overrides via `datasets.breadcrumbs`; project
// themes keep their pre-v6 look through src/themes/_legacy/datasets.js. Keys:
//   nav        — the full-width bar
//   ol         — the inner row (height, padding, text)
//   li         — one crumb (flex row so the separator + label align)
//   separator  — the `/` between crumbs
//   homeLink / homeIcon / homeLabel — the icon root ("Data Sources")
//   link       — an intermediate, linked crumb
//   current    — the last crumb (current page)
export const breadcrumbsTheme = {
    nav:       'w-full flex-none border-b border-[var(--t-rule)]',
    ol:        'w-full h-14 px-5 lg:px-8 flex items-center gap-2 min-w-0',
    li:        'flex items-center gap-2 min-w-0 first:shrink-0',
    separator: 't-metaMD text-[var(--t-pencil)]',
    homeLink:  'inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap t-metaMD text-[var(--t-graphite)] hover:text-[var(--t-ink)]',
    homeIcon:  'size-4 text-[var(--t-ink)]',
    homeLabel: 'lowercase',
    link:      't-metaMD text-[var(--t-graphite)] hover:text-[var(--t-ink)] truncate',
    current:   't-metaMD text-[var(--t-ink)] truncate',
}
