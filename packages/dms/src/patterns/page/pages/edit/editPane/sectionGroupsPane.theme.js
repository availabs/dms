// Section groups pane (sectionGroupsPane.jsx) — tessera v6, 2026-10-08, from
// design_system_v6/pages/page-edit-panes.html: bands top / content / bottom as quiet well headers,
// group rows on the panel, sections as light rows; no accent colour. The v3 extras (flags, theme
// chip, count, section type icon, hidden marker) are pages.editPanes keys. Pre-v6 values frozen in
// src/themes/_legacy/pages.js `sectionGroupsPane`.
export const sectionGroupControlTheme = {
  options: {
    activeStyle: 0
  },
  styles: [
    {
      name: 'default',
      sectionTargetWrapper: 'flex items-center justify-between gap-2 mt-3 px-3 py-2 rounded-md bg-[var(--t-well)] t-metaXS text-[var(--t-pencil)] cursor-default',
      sectionGroupWrapper: 'group flex items-center justify-between gap-2 pl-1 pr-1 py-1.5 rounded-md transition-colors',
      activePageSectionBorder: `ring-1 ring-[var(--t-amber)]`,
      sectionGroupBorder: ``,
      pageSectionBG: `hover:bg-[var(--t-well)]`,
      expandedGroupBG: `bg-[var(--t-panel)]`,
      unexpandedGroupBG: `hover:bg-[var(--t-panel)]`,
      pageSectionCursor: `cursor-pointer`,
      sectionGroupCursor: `cursor-grab`,
      titleWrapper: 'flex items-center gap-2 min-w-0 flex-1',
      sectionGroupIcon: 'size-3.5 shrink-0 text-[var(--t-pencil)] group-hover:text-[var(--t-graphite)]',
      pageSectionIcon: 'hidden',
      sectionGroupTitle: 't-proseSM font-medium text-[var(--t-ink)] truncate',
      pageSectionTitle: 't-proseXS text-[var(--t-graphite)] truncate',
      controlsWrapper: 'flex gap-1 items-center shrink-0',
      expandGroupIcon: 'size-6 p-1 rounded cursor-pointer text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)]',
    }
  ]
}
