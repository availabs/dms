export const sectionGroupControlTheme = {
  options: {
    activeStyle: 0
  },
  styles: [
    {
      sectionTargetWrapper: 'py-2 px-3 text-xs font-semibold uppercase tracking-wide text-[var(--t-graphite)] bg-[var(--t-well)] border-b border-[var(--t-rule)] cursor-default flex justify-between items-center',
      addGroupBtn: 'text-[var(--t-cobalt)] hover:text-[var(--t-cobalt-deep)] hover:bg-[var(--t-cobalt-soft)] rounded px-2 py-1 transition-colors font-medium normal-case',
      sectionGroupWrapper: 'group rounded-sm px-4 py-1 flex justify-between items-center hover:shadow-sm transition-all',
      activePageSectionBorder: `border border-dashed border-orange-200 hover:border-orange-300`,
      sectionGroupBorder: `border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)]`,
      pageSectionBG: `bg-[var(--t-well)] hover:bg-[var(--t-rule)]`,
      expandedGroupBG: `bg-[var(--t-rule)]`,
      unexpandedGroupBG: `bg-[var(--t-panel)]`,
      pageSectionCursor: `cursor-pointer`,
      sectionGroupCursor: `cursor-grab`,
      titleWrapper: 'flex items-center gap-3',
      sectionGroupIcon: 'size-4 text-[var(--t-pencil)] group-hover:text-[var(--t-graphite)]',
      pageSectionIcon: 'hidden',
      sectionGroupTitle: 'text-sm font-medium text-[var(--t-ink)]',
      pageSectionTitle: 'text-sm font-medium text-[var(--t-ink)]',
      controlsWrapper: 'flex gap-1 items-center',
      expandGroupIcon: 'size-6 place-content-center cursor-pointer text-[var(--t-graphite)] hover:text-[var(--t-ink)]',
    }
  ]
}
