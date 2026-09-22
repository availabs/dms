
const topNavTheme = {
  "options": {
    "activeStyle": 0,
    "maxDepth": 2
  },
  "styles": [{
    "name": "default",
    //layout
    "layoutContainer1": `sticky top-0 z-40 t6-topnav-joints`,
    "layoutContainer2": `w-full bg-[var(--t-paper)] border-b border-[var(--t-rule)] t6-topnav-hatch`,
    //wrappers
    "topnavWrapper": `w-full h-16 flex items-center`,
    "topnavContent": `flex items-center w-full h-full max-w-[1200px] mx-auto px-6 lg:px-8 justify-between gap-4`,
    // menu containers
    "leftMenuContainer": "flex items-center gap-6",
    "centerMenuContainer": `hidden lg:flex items-center flex-1 h-full overflow-visible gap-1`,
    "rightMenuContainer": "hidden md:flex h-full items-center gap-3 min-w-[320px] justify-end shrink-0",
    "mobileNavContainer": "px-6 py-3 bg-[var(--t-paper)] border-b border-[var(--t-rule)]",
    // mobile button
    "mobileButton": 'lg:hidden inline-flex items-center justify-center w-8 h-8 rounded-md border border-[var(--t-rule)] text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer transition-colors duration-150',
    "menuOpenIcon": `Menu`,
    "menuCloseIcon": `XMark`,

    // Menu Item Styles
    "navitemWrapper": 'relative',
    "navitemWrapper_level_2": 'relative',
    "navitemWrapper_level_3": '',
    "navitem": `flex items-center gap-1.5 cursor-pointer font-mono text-[13px] font-medium px-3 py-1.5 text-[var(--t-graphite)] hover:text-[var(--t-ink)] transition-colors duration-150`,
    "navitemActive": `flex items-center gap-1.5 cursor-pointer font-mono text-[13px] font-medium px-3 py-1.5 text-[var(--t-ink)]`,
    "navIcon": "w-4 h-4 text-[var(--t-graphite)]",
    "navIconActive": "w-4 h-4 text-[var(--t-cobalt)]",
    "navitemContent": "flex items-center gap-1.5",
    "navitemName": "",
    "navitemName_level_2": "w-full font-sans text-sm font-medium text-[var(--t-ink)] hover:bg-[var(--t-well)] py-2 px-3 cursor-pointer flex items-center justify-between gap-2 rounded-md transition-colors duration-150",
    "navitemName_level_3": "w-full font-sans text-sm font-normal text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)] py-1.5 px-3 cursor-pointer rounded-md transition-colors duration-150",
    "navitemDescription": "hidden",
    "navitemDescription_level_2": `font-sans text-xs text-[var(--t-graphite)] mt-0.5`,
    "navitemDescription_level_3": `font-sans text-xs text-[var(--t-pencil)] mt-0.5`,

    "indicatorIconWrapper": "w-3.5 h-3.5 text-[var(--t-graphite)]",
    "indicatorIcon": "ChevronDown",
    "indicatorIconOpen": "ChevronDown",
    // Level 1 submenu (dropdown below top nav item)
    "subMenuWrapper": `absolute top-full left-0 mt-1 z-40`,
    "subMenuWrapper2": "bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg py-1 min-w-[14rem] shadow-[var(--t-shadow-drag)]",
    // Level 2 submenu (flyout to the right of level 2 item)
    "subMenuWrapper_level_2": `absolute left-full top-0 ml-1 z-40`,
    "subMenuWrapper2_level_2": "bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg py-1 min-w-[14rem] shadow-[var(--t-shadow-drag)]",
    "subMenuItemsWrapper": "flex flex-col px-1",
    "subMenuItemsWrapperParent": "flex flex-col px-1",
    subMenuParentWrapper: 'hidden',
    subMenuParentContent: 'px-3 py-2 border-b border-[var(--t-rule)] mb-1',
    subMenuParentName: 'font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--t-pencil)]',
    subMenuParentDesc: 'font-sans text-xs text-[var(--t-pencil)] mt-0.5',
    subMenuParentLink: 'font-sans text-xs text-[var(--t-cobalt)] hover:text-[var(--t-cobalt-deep)] underline underline-offset-[2px] mt-1 inline-block',
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
        type: 'MultiSelect',
        singleSelectOnly: true,
        searchable: false,
        options: (theme?.topnav?.styles || [{}])
          .map((k, i) => ({ label: k?.name || i, value: i })),
        path: `topnav.options.activeStyle`,
      },
      {
        label: 'Max Depth',
        type: 'MultiSelect',
        singleSelectOnly: true,
        searchable: false,
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
