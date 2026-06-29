// Default (un-branded) breadcrumb bar. A theme can override via `datasets.breadcrumbs`
// (see src/themes/transportny for the branded treatment). Keys:
//   nav        — the full-width bar
//   ol         — the inner row (height, padding, text)
//   li         — one crumb (flex row so the separator + label align)
//   separator  — the `/` between crumbs
//   homeLink / homeIcon / homeLabel — the icon root ("Data Sources")
//   link       — an intermediate, linked crumb
//   current    — the last crumb (current page)
export const breadcrumbsTheme = {
    nav:       'w-full bg-white border-b border-gray-200',
    ol:        'w-full px-6 h-11 flex items-center text-sm',
    li:        'flex items-center',
    separator: 'px-2 text-gray-300',
    homeLink:  'inline-flex items-center gap-1.5 font-medium text-gray-500 hover:text-gray-900',
    homeIcon:  'size-4 text-gray-500 relative -top-[1px]',
    homeLabel: 'font-medium',
    link:      'font-medium text-gray-500 hover:text-gray-900',
    current:   'font-medium text-gray-900',
}
