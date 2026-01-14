const sideNavTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [
    {
      name: 'catalyst',
      // Layout containers
      layoutContainer1: 'lg:pl-64',
      layoutContainer2: 'fixed inset-y-0 left-0 w-64 max-lg:hidden',
      // Logo area
      logoWrapper: "flex items-center h-14 px-4 border-b border-zinc-200 dark:border-zinc-800",
      // Main sidebar wrapper
      sidenavWrapper: "flex flex-col w-64 h-full bg-zinc-100 dark:bg-zinc-900",
      // Menu structure
      menuItemWrapper: "flex flex-col gap-0.5",
      menuItemWrapper_level_1: '',
      menuItemWrapper_level_2: 'ml-4 border-l border-zinc-200 dark:border-zinc-800',
      menuItemWrapper_level_3: 'ml-4 border-l border-zinc-200 dark:border-zinc-800',
      menuItemWrapper_level_4: 'ml-4',
      // Nav items
      navitemSide: `
        group w-full flex items-center gap-3 px-3 py-2 mx-2 rounded-lg
        text-sm font-medium text-zinc-600 dark:text-zinc-400
        hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white
        transition-colors cursor-pointer`,
      navitemSideActive: `
        group w-full flex items-center gap-3 px-3 py-2 mx-2 rounded-lg
        text-sm font-medium text-zinc-900 dark:text-white
        bg-zinc-200 dark:bg-zinc-800
        cursor-pointer`,
      // Icons
      menuIconSide: "size-5 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors",
      menuIconSideActive: "size-5 text-zinc-900 dark:text-white",
      // Items container
      itemsWrapper: "flex-1 overflow-y-auto px-2 py-4",
      // Nav item content
      navItemContent: "flex items-center gap-3 flex-1",
      navItemContent_level_1: '',
      navItemContent_level_2: 'text-sm',
      navItemContent_level_3: 'text-sm',
      navItemContent_level_4: 'text-sm',
      // Indicator icons for expandable items
      indicatorIcon: "ArrowRight",
      indicatorIconOpen: "ArrowDown",
      indicatorIconWrapper: "size-4 text-zinc-400 transition-transform duration-200",
      // Submenu wrappers
      subMenuWrapper_1: "mt-1 space-y-0.5",
      subMenuWrapper_2: "mt-1 space-y-0.5",
      subMenuWrapper_3: "mt-1 space-y-0.5",
      subMenuOuterWrapper: '',
      subMenuParentWrapper: "flex flex-col",
      // Bottom section (user menu, etc.)
      bottomMenuWrapper: 'mt-auto border-t border-zinc-200 dark:border-zinc-800 p-4',
      // Section divider
      sectionDivider: 'my-4 border-t border-zinc-200 dark:border-zinc-800',
      // Section heading
      sectionHeading: 'px-3 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider',
      // Topnav styles (for mobile toggle)
      topnavWrapper: `w-full h-14 flex items-center px-4`,
      topnavContent: `flex items-center w-full h-full bg-zinc-100 dark:bg-zinc-900 justify-between`,
      topnavMenu: `hidden lg:flex items-center flex-1 h-full overflow-visible`,
      topmenuRightNavContainer: "flex items-center gap-2",
      topnavMobileContainer: "bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800"
    }
  ]
}

export default sideNavTheme

export const sideNavsettings =  (theme) => [
  {
    label: "Sidenav Styles",
    type: 'inline',
    controls: [
      {
        label: 'Style',
        type: 'Select',
        options: (theme?.sidenav?.styles || [{}])
          .map((k, i) => ({ label: k?.name || i, value: i })),
        path: `sidenav.options.activeStyle`,
      },
      {
        label: 'Add Style',
        type: 'Button',
        children: <div>Add Style</div>,
        onClick: (e, setState) => {
          setState(draft => {
            draft.sidenav.styles.push({ ...draft.sidenav.styles[0], name: 'new style', })
            //draft.sidenav.options.activeStyle = draft.sidenav.styles.length
          })
          console.log('add style', e)
        }
        //path: `sidenav.styles[${activeStyle}].outerWrapper`,
      },
      {
        label: 'Remove Style',
        type: 'Button',
        children: <div>Remove Style</div>,
        //disabled:
        onClick: (e, setState) => {
          setState(draft => {
            if (draft.sidenav.styles.length > 1) {
              draft.sidenav.styles.splice(theme.sidenav.options.activeStyle, 1)
              draft.sidenav.options.activeStyle = 0
            }
          })
        }
        //path: `sidenav.styles[${activeStyle}].outerWrapper`,
      },
    ]
  },
  {
    label: "Side Nav",
    type: 'inline',
    controls: [
      ...Object.keys(theme?.sidenav?.styles?.[theme?.sidenav?.options?.activeStyle || 0] )
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `sidenav.styles[${theme?.sidenav?.options?.activeStyle}].${k}`
          }
        })
    ]
  }
]
// const sideNavTheme = {
//   fixed: "lg:ml-42",
//   logoWrapper: "w-42 bg-neutral-100 text-slate-800",
//   sidenavWrapper: "flex flex-col w-42 h-full z-20",
//   menuItemWrapper: "flex flex-col ",
//   menuIconSide: "group w-6 mr-2 text-blue-500  group-hover:text-blue-800",
//   menuIconSideActive: "group w-6 mr-2 text-blue-500  group-hover:text-blue-800",
//   itemsWrapper: "pt-12 flex-1 ",
//   navItemContent: "transition-transform duration-300 ease-in-out",
//   navitemSide: `
//    group  flex flex-col
//    group flex px-3 py-1.5 text-[14px] font-light hover:bg-blue-50 text-slate-700 mx-2  undefined
//    focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
//    transition-all cursor-pointer`,
//   navitemSideActive: `
//    group  flex flex-col
//    px-3 py-1.5 text-[14px] font-light hover:bg-blue-50 text-slate-700  mx-2
//      focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
//    transition-all cursor-pointer`,
//   indicatorIcon: "ArrowRight",
//   indicatorIconOpen: "ArrowDown",
//   subMenuWrapper: "pl-2 w-full",
//   subMenuParentWrapper: "flex flex-col w-full",
//   bottomMenuWrapper: 'border-t'
// }
