const topnav =  ({
    color='white',
    size='compact',
    menu='left',
    subMenuStyle = 'inline',
}) => {

  let colors = {
    white: {
      contentBg: `bg-slate-100`,
      accentColor: `blue-500`,
      accentBg: `hover:bg-white`,
      borderColor: `border-slate-100`,
      textColor: `text-slate-700`,
      highlightColor: `text-blue-500`,
    },
    bright: {
      contentBg: `bg-blue-700`,
      accentColor: `blue-400`,
      accentBg: `hover:bg-blue-400`,
      borderColor: `border-blue-600`,
      textColor: `text-white`,
      highlightColor: `text-white`,
    }
  }
  let sizes = {
    compact: {
      menu: `hidden uppercase md:flex flex-1 ${menu === 'left' ? '' : 'justify-end'} divide-x-2`,
      sideItem: "flex  mx-6 pr-4 py-2 text-sm font-light hover:pl-4",
      topItem: `flex font-medium tracking-widest items-center text-[14px] px-4 h-12 ${colors[color].textColor} ${colors[color].borderColor}
        ${colors[color].accentBg} hover:${colors[color].highlightColor}`,
      activeItem: `flex font-medium  tracking-widest bg-white items-center text-[14px] px-4 h-12 ${colors[color].highlightColor} ${colors[color].borderColor}
        ${colors[color].accentBg} hover:${colors[color].highlightColor}`,
      icon: "mr-3 text-lg",
      responsive: 'md:hidden'
    },
    inline: {
      menu: 'flex flex-1',
      sideItem: "flex mx-4 pr-4 py-4 text-base font-base border-b hover:pl-4",
      topItem: `flex px-4 py-2 mx-2 font-medium text-gray-400 border-b-2 ${colors[color].textColor} ${colors[color].borderColor}
      hover:border-gray-300 hover:text-gray-700 border-gray-100 `,
      activeItem: `flex px-4 py-2 mx-2 font-medium text-blue-600 border-b-2 ${colors[color].textColor} ${colors[color].borderColor} border-blue-600 `,
      icon: "mr-4 text-2xl",
      responsive: 'hidden'
    }

  }

    let subMenuStyles = {
        inline: {
            // indicatorIcon: 'fa fa-angle-right pt-2.5',
            // indicatorIconOpen: 'fal fa-angle-down pt-2.5',
            subMenuWrapperChild: ``,
            subMenuWrapper: `pl-2 w-full `,
            subMenuParentWrapper: `flex flex-col w-full  `
        },
        flyout: {
            indicatorIcon: 'fal fa-angle-down pl-2 pt-1',
            indicatorIconOpen: 'fal fa-angle-down pl-2',
            subMenuWrapper: `absolute ml-${sizes[size].width - 8} `,
            subMenuParentWrapper: `flex flex-row  `,
            subMenuWrapperTop: `absolute top-full  `,
        },
        row: {
            indicatorIcon: 'fal fa-angle-down pl-2 pt-1',
            indicatorIconOpen: 'fal fa-angle-down pl-2 pt-1',
            subMenuWrapper: `absolute bg-white ml-${sizes[size].width - 8}`,
            subMenuParentWrapper: `flex flex-row  `,
            subMenuWrapperChild: `divide-x overflow-x-auto`,
            subMenuWrapperTop: `absolute top-full left-0 border-y border-gray-200 w-full bg-white normal-case`,
            subMenuWrapperInactiveFlyout: `absolute  mt-8 normal-case bg-white shadow-lg z-10 p-2`,
            subMenuWrapperInactiveFlyoutBelow: ` absolute ml-40 normal-case bg-white shadow-lg z-10 p-2`,
            subMenuWrapperInactiveFlyoutDirection: 'flex flex-col divide-y-2'
        },
    }


    return {
    topnavWrapper: `w-full ${colors[color].contentBg} border-b border-gray-200`,
    topnavContent: `flex w-full h-full`,
    topnavMenu: `${sizes[size].menu} h-full overflow-x-auto overflow-y-hidden scrollbar-sm`,
    menuIconTop: `text-${colors[color].accentColor} ${sizes[size].icon} group-hover:${colors[color].highlightColor}`,
    menuIconTopActive : `text-${colors[color].accentColor} ${sizes[size].icon} group-hover:${colors[color].highlightColor}`,
    menuOpenIcon: `fa-light fa-bars fa-fw`,
    menuCloseIcon: `fa-light fa-xmark fa-fw"`,
    navitemTop: `
        w-fit group font-display whitespace-nowrap
        ${sizes[size].topItem}
        focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
        transition cursor-pointer
    `,
    //`px-4 text-sm font-medium tracking-widest uppercase inline-flex items-center  border-transparent  leading-5 text-white hover:bg-white hover:text-darkblue-500 border-gray-200 focus:outline-none focus:text-gray-700 focus:border-gray-300 transition duration-150 ease-in-out h-full`,
    topmenuRightNavContainer: "hidden md:block h-full",
    topnavMobileContainer: "bg-slate-50",
    navitemTopActive:
      ` w-fit group font-display whitespace-nowrap
        ${sizes[size].activeItem}
        focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
        transition cursor-pointer 
      `,
    mobileButton:`${sizes[size].responsive} ${colors[color].contentBg} inline-flex items-center justify-center pt-[12px] px-2 hover:text-blue-400  text-gray-400 hover:bg-gray-100 `,
    ...subMenuStyles[subMenuStyle],
    vars: {
      colors,
      sizes
    }
  }
}

export default topnav