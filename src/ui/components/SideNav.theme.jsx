const sideNavTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [
    {
      layoutContainer1: 'border-r lg:mr-42',
      layoutContainer2: 'fixed inset-y-0 left-0 w-42 max-lg:hidden',
      logoWrapper: "w-42 bg-neutral-100 text-slate-800",
      sidenavWrapper: "flex flex-col w-42 h-full z-20",
      menuItemWrapper: "flex flex-col",
      menuItemWrapper_level_1: '',
      menuItemWrapper_level_2: '',
      menuItemWrapper_level_3: '',
      menuItemWrapper_level_4: '',
      menuIconSide: "group w-6 mr-2 text-blue-500  group-hover:text-blue-800",
      menuIconSideActive: "group w-6 mr-2 text-blue-500  group-hover:text-blue-800",
      itemsWrapper: "pt-12 flex-1 ",
      navItemContent: "transition-transform duration-300 ease-in-out",
      navItemContent_level_1:'',
      navItemContent_level_2:'',
      navItemContent_level_3:'',
      navItemContent_level_4:'',
      navitemSide: `
      group  flex flex-col
      group flex px-3 py-1.5 text-[14px] font-light hover:bg-blue-50 text-slate-700 mx-2  undefined
      focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
      transition-all cursor-pointer`,
      navitemSideActive: `
      group  flex flex-col
      px-3 py-1.5 text-[14px] font-light hover:bg-blue-50 text-slate-700  mx-2
        focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
      transition-all cursor-pointer`,
      indicatorIcon: "ArrowRight",
      indicatorIconOpen: "ArrowDown",
      subMenuWrapper_1: "pl-2 w-full",
      subMenuWrapper_2: "",
      subMenuWrapper_3: "",
      subMenuOuterWrapper: '',
      subMenuParentWrapper: "flex flex-col w-full",
      bottomMenuWrapper: 'border-t',
      topnavWrapper: `w-full h-[50px] flex items-center pr-1`,
      topnavContent: `flex items-center w-full h-full bg-white lg:bg-zinc-100 dark:bg-zinc-900 dark:lg:bg-zinc-950 justify-between`,
      topnavMenu: `hidden  lg:flex items-center flex-1  h-full overflow-x-auto overflow-y-hidden scrollbar-sm`,
      topmenuRightNavContainer: "hidden md:flex h-full items-center",
      topnavMobileContainer: "bg-slate-50"
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
