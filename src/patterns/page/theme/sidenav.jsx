const sidenav = (opts={}) =>  {
  let {color = 'white', size = 'compact',  subMenuStyle = 'inline', responsive = 'top'} = opts
      
  let mobile = {
    top : 'hidden md:block',
    side: 'hidden md:block',
    none: ''
  }

  let colors = {
    white: {
      contentBg: `bg-white border-r`,
      sideItemActive:``,
      contentBgAccent: `bg-neutral-100`,
      accentColor: `blue-600`,
      accentBg: ``,
      borderColor: `border-slate-200`,
      textColor: `text-slate-600`,
      textColorAccent: `text-slate-800`,
      highlightColor: `text-blue-800`,
    },
    transparent: {
      contentBg: ``,
      contentBgAccent: `bg-neutral-100`,
      accentColor: `blue-600`,
      accentBg: `hover:bg-blue-400`,
      borderColor: `border-slate-100`,
      textColor: `text-slate-600`,
      textColorAccent: `text-slate-800`,
      highlightColor: `text-slate-800`,
    },
    dark: {
      contentBg: `bg-neutral-800`,
      contentBgAccent: `bg-neutral-900`,
      accentColor: `white`,
      accentBg: ``,
      borderColor: `border-neutral-700`,
      textColor: `text-slate-300`,
      textColorAccent: `text-slate-100`,
      highlightColor: `text-slate-100`,
      sideItem: 'text-slate-300 hover:text-white',
      sideItemActive: 'text-slate-300 hover:text-white'
    },
    bright: {
      contentBg: `bg-blue-700`,
      accentColor: `blue-400`,
      accentBg: `hover:bg-blue-400`,
      borderColor: `border-blue-600`,
      textColor: `text-white`,
      highlightColor: `text-white-500`,
    }
  }

  let sizes = {
    none: {
      wrapper: "w-0 overflow-hidden",
      sideItem: "flex mx-2 pr-4 py-2 text-base ",
      topItem: "flex items-center text-sm px-4 border-r h-12",
      icon: "mr-3 text-lg",
    },
    compact: {
      fixed: 'ml-0 md:ml-44',
      wrapper: "w-44",
      itemWrapper: 'pt-5',
      sideItem: "group flex px-3 py-1.5 text-[14px] font-light hover:bg-blue-50 text-slate-700 mx-2 ",
      sideItemActive: "group flex px-3 py-1.5 text-[14px] font-light hover:bg-blue-50 text-slate-700  mx-2 ", //"border-r-4 border-blue-500 ",
      topItem: "flex items-center text-sm px-4 border-r h-12",
      icon: "group w-6 mr-2 text-blue-500 ",
      iconActive: "group w-6 mr-2 text-blue-500 ",
      sideItemContent: 'group-hover:translate-x-1.5 transition-transform duration-300 ease-in-out',
    },
    full: {
      fixed: '',
      wrapper: "w-full",
      sideItem: "group flex px-3 py-2 text-[14px] font-light hover:bg-blue-50 text-slate-700 mx-2 border-r-4 border-white",
      sideItemActive: "group flex px-3 py-2 text-[14px] font-light hover:bg-blue-50 text-slate-700 mx-2 border-r-4  border-white",
      topItem: "flex pr-4 py-2  font-",
      icon: "group w-6 mr-2 text-blue-500  ",
      iconActive: "group w-6 mr-2 text-blue-500",
      sideItemContent: 'group-hover:translate-x-1.5 transition-transform duration-300 ease-in-out',
    },
    mini: {
      fixed: 'ml-0 md:ml-20',
      wrapper: "w-20 overflow-x-hidden",
      sideItem: "text-white hover:bg-blue-100 hover:text-blue-100",
      sideItemActive: "text-blue-500 bg-blue-500  ",
      topItem: "flex px-4 items-center text-sm font-light ",
      icon: "w-20 h-10 text-xl text-blue-500",
      iconActive: "w-20 h-10 text-xl text-white",
      sideItemContent: 'w-0',
    },
    micro: {
      fixed: 'ml-0 md:ml-14',
      wrapper: "w-14 overflow-x-hidden",
      itemWrapper: 'p-1',
      sideItem: "flex text-base font-base ",
      topItem: "flex mx-6 pr-4 py-2 text-sm font-light",
      icon: "w-12 text-2xl hover:bg-neutral-900 px-1 py-3 my-2 rounded-lg mr-4 hover:text-blue-500",
      sideItemContent: 'hidden',
    },

  }

  if(!sizes[size]) {
    //console.warn('invalid size', size)
    size='none'
  }
      

  let subMenuStyles = {
        inline: {
            indicatorIcon: 'fa fa-angle-right pt-2.5',
            indicatorIconOpen: 'fal fa-angle-down pt-2.5',
            subMenuWrapper: `pl-2 w-full`,
            subMenuParentWrapper: `flex flex-col w-full`
        },
        flyout: {
            indicatorIcon: 'fal fa-angle-down',
            indicatorIconOpen: 'fa fa-angle-right',
            subMenuWrapper: `absolute ml-${sizes[size].width - 8}`,
            subMenuParentWrapper: `flex flex-row`,
            subMenuWrapperTop: `absolute top-full`,
        },
    }

  return {
    fixed: `md:${sizes[size].fixed}`,
    logoWrapper: `${sizes[size].wrapper} ${colors[color].contentBgAccent} ${colors[color].textColorAccent}`,
    sidenavWrapper: `${mobile[responsive]} ${colors[color].contentBg} ${sizes[size].wrapper} h-full z-20`,
    menuIconSide: `${sizes[size].icon} group-hover:${colors[color].highlightColor}`,
    menuIconSideActive: `${sizes[size].iconActive} group-hover:${colors[color].highlightColor}`,
    
    itemsWrapper: `${colors[color].borderColor} ${sizes[size].itemWrapper}  `,
    navItemContent: `${sizes[size].sideItemContent}`,
    navitemSide: `
        group  flex flex-col

        ${sizes[size].sideItem} ${colors[color].sideItem}
        focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
        transition-all cursor-pointer
     `,
    navitemSideActive: `
        group  flex flex-col
         ${sizes[size].sideItemActive} ${colors[color].sideItemActive} 
        
        focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
        transition-all cursor-pointer

      `,
      ...subMenuStyles[subMenuStyle],
      vars: {
        colors,
        sizes,
        mobile
      }
  }
}

export default sidenav