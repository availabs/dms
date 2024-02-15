// mitigate NY tLight heme
const primary =  'nuetral'
const highlight =  'white'
const accent =  'blue'


const theme = {
  page: {
    container: 'flex-1 w-full h-full ',
    content: '',
    content:'flex-1 flex border shadow bg-white px-4'
  },
  layout: {
    page: 'h-full w-full bg-slate-100 flex flex-col',
    container: 'w-full flex-1 flex flex-col',
  },
  navPadding: {
    1: 'pt-0 ',
    2: 'md:pt-12 pt-0',
    3: 'md:pt-24 pt-0'
  },
  sidenav: (opts={}) =>  {
        let {color = 'white', size = 'compact',  subMenuStyle = 'inline', responsive = 'top'} = opts
          
          let mobile = {
            top : 'hidden md:block',
            side: 'hidden md:block',
            none: ''
          }
          let colors = {
            white: {
              contentBg: `bg-${highlight} border-r`,
              sideItemActive:``,
              contentBgAccent: `bg-neutral-100`,
              accentColor: `${accent}-600`,
              accentBg: ``,
              borderColor: `border-slate-200`,
              textColor: `text-${primary}-600`,
              textColorAccent: `text-slate-800`,
              highlightColor: `text-blue-800`,
            },
            transparent: {
              contentBg: ``,
              contentBgAccent: `bg-neutral-100`,
              accentColor: `${accent}-600`,
              accentBg: `hover:bg-${accent}-400`,
              borderColor: `border-${primary}-100`,
              textColor: `text-${primary}-600`,
              textColorAccent: `text-slate-800`,
              highlightColor: `text-${primary}-800`,
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
              contentBg: `bg-${accent}-700`,
              accentColor: `${accent}-400`,
              accentBg: `hover:bg-${accent}-400`,
              borderColor: `border-${accent}-600`,
              textColor: `text-${highlight}`,
              highlightColor: `text-${highlight}-500`,
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

    },


    /* -----
         Top Nav Theme Components Minimal
    ------*/
    topnav: ({
        color='white',
        size='compact',
        menu='left',
        subMenuStyle = 'inline',
    }) => {

      let colors = {
        white: {
          contentBg: `bg-slate-100`,
          accentColor: `${accent}-500`,
          accentBg: `hover:bg-white`,
          borderColor: `border-${primary}-100`,
          textColor: `text-slate-700`,
          highlightColor: `text-blue-500`,
        },
        bright: {
          contentBg: `bg-${accent}-700`,
          accentColor: `${accent}-400`,
          accentBg: `hover:bg-${accent}-400`,
          borderColor: `border-${accent}-600`,
          textColor: `text-${highlight}`,
          highlightColor: `text-${highlight}`,
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

    },
}

export default theme