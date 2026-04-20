export const sectionGroupControlTheme = {
  options: {
    activeStyle: 0
  },
  styles: [
    {
      sectionTargetWrapper: 'py-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200 cursor-default flex justify-between items-center',
      addGroupBtn: 'text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded px-2 py-1 transition-colors font-medium normal-case',
      sectionGroupWrapper: 'group rounded-sm px-4 py-1 flex justify-between items-center hover:shadow-sm transition-all',
      activePageSectionBorder: `border border-dashed border-orange-200 hover:border-orange-300`,
      sectionGroupBorder: `border border-slate-200 hover:border-slate-300`,
      pageSectionBG: `bg-slate-50 hover:bg-slate-100`,
      expandedGroupBG: `bg-slate-200`,
      unexpandedGroupBG: `bg-white`,
      pageSectionCursor: `cursor-pointer`,
      sectionGroupCursor: `cursor-grab`,
      titleWrapper: 'flex items-center gap-3',
      sectionGroupIcon: 'size-4 text-slate-300 group-hover:text-slate-400',
      pageSectionIcon: 'hidden',
      sectionGroupTitle: 'text-sm font-medium text-slate-700',
      pageSectionTitle: 'text-sm font-medium text-slate-700',
      controlsWrapper: 'flex gap-1 items-center',
      expandGroupIcon: 'size-6 place-content-center cursor-pointer text-slate-500 hover:text-slate-700',
    }
  ]
}
