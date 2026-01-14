
const topNavTheme = {
  "options": {
    "activeStyle": 0,
    "maxDepth": 2
  },
  "styles": [{
    "name": "catalyst",
    //layout
    "layoutContainer1": `sticky top-0 z-50`,
    "layoutContainer2": `w-full`,
    //wrappers
    "topnavWrapper": `w-full h-14 flex items-center px-4 lg:px-6`,
    "topnavContent": `flex items-center w-full h-full bg-zinc-100 dark:bg-zinc-900 justify-between rounded-lg`,
    // menu containers
    "leftMenuContainer": "flex items-center",
    "centerMenuContainer": `hidden lg:flex items-center flex-1 h-full overflow-visible gap-1 px-4`,
    "rightMenuContainer": "hidden md:flex h-full items-center gap-2",
    "mobileNavContainer": "px-4 py-2 bg-zinc-100 dark:bg-zinc-900",
    // mobile button
    "mobileButton": 'lg:hidden inline-flex items-center justify-center p-2 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors',
    "menuOpenIcon": `Menu`,
    "menuCloseIcon": `XMark`,

    // Menu Item Styles
    "navitemWrapper": 'relative',
    "navitemWrapper_level_2": 'relative',
    "navitemWrapper_level_3": '',
    "navitem": `
        px-3 py-2 rounded-lg
        text-sm font-medium text-zinc-600 dark:text-zinc-400
        hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white
        transition-colors cursor-pointer
        flex items-center gap-1.5
    `,
    "navitemActive": `
        px-3 py-2 rounded-lg
        text-sm font-medium text-zinc-900 dark:text-white
        bg-zinc-200 dark:bg-zinc-800
        cursor-pointer
        flex items-center gap-1.5
    `,
    "navIcon": "size-4 text-zinc-500 dark:text-zinc-400",
    "navIconActive": "size-4 text-zinc-900 dark:text-white",
    "navitemContent": "flex items-center gap-1.5",
    "navitemName": "",
    "navitemName_level_2": "w-full text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white py-2 px-3 rounded-md transition-colors flex items-center justify-between gap-2",
    "navitemName_level_3": "w-full text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white py-2 px-3 rounded-md transition-colors",
    "navitemDescription": "hidden",
    "navitemDescription_level_2": `text-xs text-zinc-500 dark:text-zinc-400 mt-0.5`,
    "navitemDescription_level_3": `text-xs text-zinc-500 dark:text-zinc-400 mt-0.5`,

    "indicatorIconWrapper": "size-4 text-zinc-400",
    "indicatorIcon": "ChevronDown",
    "indicatorIconOpen": "ChevronDown",
    // Level 1 submenu (dropdown below top nav item)
    "subMenuWrapper": `absolute top-full left-0 mt-2 z-50`,
    "subMenuWrapper2": "bg-white dark:bg-zinc-900 rounded-xl shadow-lg ring-1 ring-zinc-950/5 dark:ring-white/10 py-1 min-w-[200px]",
    // Level 2 submenu (flyout to the right of level 2 item)
    "subMenuWrapper_level_2": `absolute left-full top-0 ml-2 z-50`,
    "subMenuWrapper2_level_2": "bg-white dark:bg-zinc-900 rounded-xl shadow-lg ring-1 ring-zinc-950/5 dark:ring-white/10 py-1 min-w-[200px]",
    "subMenuItemsWrapper": "flex flex-col",
    "subMenuItemsWrapperParent": "flex flex-col",
    subMenuParentWrapper: 'hidden',
    subMenuParentContent: 'px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 mb-1',
    subMenuParentName: 'text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide',
    subMenuParentDesc: 'text-xs text-zinc-400 dark:text-zinc-500 mt-0.5',
    subMenuParentLink: 'text-xs text-zinc-900 dark:text-white hover:underline mt-1 inline-block',
  }]
}

export default topNavTheme


const themeClasses = {
  "layout" : [
    "layoutContainer1",
    "layoutContainer2",
    // wrappers
    "topnavWrapper",
    "topnavContent",
    // menu containers
    "leftMenuContainer",
    "centerMenuContainer",
    "rightMenuContainer",
    "mobileNavContainer",
    //
    "mobileButton",
    "menuOpenIcon",
    "menuCloseIcon",
  ],
  "navItem" : [
    "navitemWrapper",
    "navitem",
    "navitemActive",
    "navIcon",
    "navIconActive",
    "navitemContent",
    "navitemDescription",
    "navitemName",

    "navitemWrapper_level_1",
    "navitemDescription_level_1",
    "navitemName_level_1",

    "navitemWrapper_level_2",
    "navitemDescription_level_2",
    "navitemName_level_2",

    "navitemWrapper_level_3",
    "navitemDescription_level_3",
    "navitemName_level_3",
  ],
  "subMenu" : [
    "indicatorIconWrapper",
    "indicatorIcon",
    "indicatorIconOpen",
    "subMenuWrapper",
    "subMenuWrapper2",
    "subMenuItemsWrapper"

  ]
}

export const topNavsettings =  (theme) => [
  {
    label: "Topnav Styles",
    type: 'inline',
    controls: [
      {
        label: 'Style',
        type: 'Select',
        options: (theme?.topnav?.styles || [{}])
          .map((k, i) => ({ label: k?.name || i, value: i })),
        path: `topnav.options.activeStyle`,
      },
      {
        label: 'Max Depth',
        type: 'Select',
        options: [
          { label: '1 (No submenus)', value: 0 },
          { label: '2 (One level)', value: 1 },
          { label: '3 (Two levels)', value: 2 },
          { label: '4 (Three levels)', value: 3 },
        ],
        path: `topnav.options.maxDepth`,
      },
      {
        label: 'Add Style',
        type: 'Button',
        children: <div>Add Style</div>,
        onClick: (e, setState) => {
          setState(draft => {
            draft.topnav.styles.push({ ...draft.topnav.styles[0], name: 'new style', })
            //draft.sidenav.options.activeStyle = draft.sidenav.styles.length
          })
          //console.log('add style', e)
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
            if (draft.topnav.styles.length > 1) {
              draft.topnav.styles.splice(theme.topnav.options.activeStyle, 1)
              draft.topnav.options.activeStyle = 0
            }
          })
        }
        //path: `sidenav.styles[${activeStyle}].outerWrapper`,
      },
    ]
  },
  {
    label: "Side Nav Layout",
    type: 'inline',
    controls: themeClasses.layout
      .map(k => {
        return {
          label: k,
          type: 'Textarea',
          path: `topnav.styles[${theme?.topnav?.options?.activeStyle}].${k}`
        }
      })

  },
  {
    label: "Side Nav NavItem",
    type: 'inline',
    controls: themeClasses.navItem
      .map(k => {
        return {
          label: k,
          type: 'Textarea',
          path: `topnav.styles[${theme?.topnav?.options?.activeStyle}].${k}`
        }
      })

  },
  {
    label: "Side Nav SubMenu",
    type: 'inline',
    controls: themeClasses.subMenu
      .map(k => {
        return {
          label: k,
          type: 'Textarea',
          path: `topnav.styles[${theme?.topnav?.options?.activeStyle}].${k}`
        }
      })

  }
]

// export const topNavsettings =  [{
//     label: "Top Nav",
//     type: 'inline',
//     controls: Object.keys(topNavTheme)
//         .map(k => {
//           return {
//             label: k,
//             type: 'Textarea',
//             path: `sidenav.${k}`
//           }
//         })
// }]

// export default {
//       fixed: 'mt-8',
//       topnavWrapper: `px-[24px] bg-slate-100  w-full h-full flex items-center md:rounded-lg shadow pointer-events-auto`,
//       topnavContent: `flex items-center w-full h-full  `,
//       topnavMenu: `hidden py-2  md:flex items-center flex-1  h-full overflow-x-auto overflow-y-hidden scrollbar-sm`,
//       mobileButton:`md:hidden bg-slate-100 inline-flex items-center justify-center pt-[12px] px-2 hover:text-blue-400  text-gray-400 hover:bg-gray-100 `,
//       indicatorIcon: 'ArrowDown',
//       indicatorIconOpen: 'ArrowDown',
//       indicatorIconWrapper: 'size-3',
//       menuItemWrapper1: [
//         ' ',
//         ''
//       ],
//       menuItemWrapper1Parent: [
//         ' ',
//         'bg-[#F3F8F9] p-4 rounded-lg'
//       ],
//       menuItemWrapper2: [
//         'flex text-[#37576B] ',
//         ' '
//       ],
//       menuIconTop: `text-blue-400 mr-3 text-lg group-hover:text-blue-500`,
//       menuIconTopActive : `text-blue-500 mr-3 text-lg group-hover:text-blue-500`,
//       menuOpenIcon: `Menu`,
//       menuCloseIcon: `XMark`,
//       navitemTop: `
//           w-fit group  whitespace-nowrap
//           flex items-center
//           text-[16px] font-['Proxima_Nova'] font-[500]
//           px-2 uppercase
//           focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
//           transition cursor-pointer
//       `,
//       navitemTopActive:
//         ` w-fit group  whitespace-nowrap
//           flex  items-center
//           text-[16px] font-['Proxima_Nova'] font-[500]
//           px-2 text-blue uppercase
//           focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
//           transition cursor-pointer
//         `,
//       navItemDescription: ['hidden',`text-[16px] font-['Proxima_Nova'] font-[400] text-[#37576B] text-wrap`],
//       //`px-4 text-sm font-medium tracking-widest uppercase inline-flex items-center  border-transparent  leading-5 text-white hover:bg-white hover:text-darkblue-500 border-gray-200 focus:outline-none focus:text-gray-700 focus:border-gray-300 transition duration-150 ease-in-out h-full`,
//       topmenuRightNavContainer: "hidden md:flex h-full items-center",
//       topnavMobileContainer: "bg-slate-50 pointer-events-auto",


//       subMenuWrapper1: [
//         'absolute left-0 right-0 normal-case mt-4 z-10 px-4 pt-[42px] px-[62px] cursor-default'
//       ],
//       subMenuWrapper2: `bg-white flex items-stretch rounded-lg p-4 shadow`,
//       subMenuParentContent: 'basis-1/3  text-wrap pr-[64px]',
//       subMenuParentName: `text-[36px] font-['Oswald'] font-500 text-[#2D3E4C] uppercase pb-2`,
//       subMenuParentDesc: `text-[16px] font-['Proxima_Nova'] font-[400] text-[#37576B]`,
//       subMenuParentLink: `w-fit h-fit cursor-pointer uppercase border boder-[#E0EBF0] bg-white hover:bg-[#E0EBF0] text-[#37576B] font-[700] leading-[14.62px] rounded-full text-[12px] text-center py-[16px] px-[24px]`,
//       subMenuItemsWrapperParent: 'grid grid-cols-2 gap-1 flex-1',
//       subMenuItemsWrapper: 'grid grid-cols-4 flex-1'
// }
