import React from 'react'
import {Link} from 'react-router'


const theme = {
    logo: {
        logoWrapper: "",
        logoAltImg: "",
        imgWrapper: "h-12 pl-3 pr-2 flex items-center",
        img: "",
        titleWrapper: "uppercase font-bold text-3xl text-blue-900 text-shadow-md",
        title: "DMS",
        linkPath: "/",
    },
    layout: {
        options: {
            activeStyle: 0,
            sideNav: {
                size: 'none',
                search: 'none',
                logo: 'top',
                dropdown: 'top',
                nav: 'none'
            },
            topNav: {
                size: 'compact',
                dropdown: 'right',
                search: 'none',
                position: 'fixed',
                nav: 'main',
                "leftMenu": [{type: "Logo"}],
            }
        },
        styles: [
            {
                outerWrapper: "w-screen h-screen bg-[linear-gradient(0deg,rgba(219,234,254,0.96),rgba(239,246,255,0.96))]",
                wrapper: "w-screen h-screen",
                wrapper2: "w-screen h-screen flex items-start flex-col items-stretch max-w-full",
                wrapper3: "mt-[15vh] md:mt-0 w-screen h-screen overflow-y-auto",
                childWrapper: 'w-screen h-screen',
                topnavContainer1: 'print:hidden',
                topnavContainer2: `fixed top-0 z-20 max-w-[1440px] left-50% -translate-50% w-full md:px-4 md:pt-[32px] xl:px-[64px] pointer-events-none`,
                sidenavContainer1: 'pr-2  hidden lg:block min-w-[222px] max-w-[222px]',
                sidenavContainer2: 'hidden lg:block fixed min-w-[222px] max-w-[222px] top-[0px] h-[calc(100vh_-_1px)] w-full overflow-y-auto overflow-x-hidden'
            }
        ]
    },
    pages: {
        container: `bg-[linear-gradient(0deg,rgba(244,244,244,0.96),rgba(244,244,244,0.96))]  bg-[size:500px] pb-[4px]`,//`bg-gradient-to-b from-[#F4F4F4] to-[#F4F4F4] bg-[url('/themes/mny/topolines.png')] `,
        wrapper1: 'w-full h-full flex-1 flex flex-col ', // first div inside Layout
        wrapper2: 'w-full h-full flex-1 flex flex-row p-4 min-h-screen', // inside page header, wraps sidebar
        wrapper3: 'flex flex-1 w-full border-2 flex-col border shadow-md rounded-lg relative text-md font-light leading-7 p-4',
        iconWrapper: 'z-5 absolute right-[10px] top-[5px]',
        icon: 'text-slate-400 hover:text-blue-500',
        sectionGroup: {
            default: {
                wrapper1: "w-screen h-screen flex flex-row", // inside page header, wraps sidebar
                wrapper2: "flex w-screen h-screen justify-center",
                wrapper3: "w-full place-content-start md:place-content-center",
                iconWrapper: "z-5 absolute right-[10px] top-[5px] print:hidden",
                icon: "text-slate-400 hover:text-blue-500",
                sideNavContainer1: "hidden xl:block",
                sideNavContainer2:
                    "min-w-[302px] max-w-[302px] sticky top-20 hidden xl:block h-[100vh_-_102px] pr-2",
                pageWrapper: "max-w-lg mx-auto my-auto flex flex-col gap-[2vh] p-12 border border-blue-100 shadow-lg shadow-blue-150 rounded-lg",
                pageTitle: "font-medium text-blue-900 text-2xl leading-none tracking-normal uppercase",
                forgotPasswordText: "font-normal text-blue-500 text-sm leading-none tracking-normal underline decoration-solid",
                actionButton: "w-fit opacity-100 gap-2 rounded-full pt-4 pr-6 pb-4 pl-6 bg-blue-100 hover:bg-blue-200 cursor-pointer",
                actionText: "font-bold text-blue-900 text-xs leading-none tracking-normal text-center uppercase",
                prompt: "font-normal text-blue-500 text-sm leading-none tracking-normal flex gap-1",
            },
        },
    },
    field: {
        fieldWrapper: "flex flex-col gap-[2vh]",
        field: "flex flex-col gap-[1vh]",
        label: "font-semibold text-blue-800 text-sm leading-none tracking-normal"
    },
    sidenav: {
        fixed: ``,
        "logoWrapper": "full p-2 bg-neutral-100 text-slate-800",
        "topNavWrapper": "flex flex-row md:flex-col p-2", //used in layout
        "sidenavWrapper": "hidden md:block border-r w-full h-full z-20",
        "menuItemWrapper": "flex flex-col hover:bg-blue-50",
        "menuIconSide": "group px-2 mr-2 text-blue-500  group-hover:text-blue-800",
        "menuIconSideActive": "group px-2 w-6 mr-2 text-blue-500  group-hover:text-blue-800",
        "itemsWrapper": "border-slate-200 pt-5  ",
        "navItemContent": "transition-transform duration-300 ease-in-out flex-1",
        "navItemContents": ['text-[14px] font-light text-slate-700 px-4 py-2'],
        "navitemSide": `
    group  flex flex-col
    group flex
    focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
    transition-all cursor-pointer border-l-2 border-white`,
        "navitemSideActive": `
    group  flex flex-col
      focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
    transition-all cursor-pointer border-l-2 border-blue-500`,
        "indicatorIcon": "ArrowRight",
        "indicatorIconOpen": "ArrowDown",
        "indicatorIconWrapper": "size-4 text-blue-500",
        "subMenuWrappers": ['w-full bg-[#F3F8F9] rounded-[12px]', 'w-full bg-[#E0EBF0]'],
        "subMenuOuterWrappers": ['pl-4'],
        "subMenuWrapper": "pl-2 w-full",
        "subMenuParentWrapper": "flex flex-col w-full",
        "bottomMenuWrapper": ""
    },
    topnav: {
        options: {
            activeStyle: 0
        },
        styles: [
            {
                fixed: 'mt-8',
                topnavWrapper: `px-[2vw] py-[2vh] w-full bg-transparent h-[15vh] md:h-40 flex items-center rounded-lg pointer-events-auto`,
                topnavContent: `flex flex-1 justify-between`,
                layoutContainer1: 'absolute w-full',
                topnavMenu: `hidden  md:flex items-center flex-1  h-full overflow-x-auto overflow-y-hidden scrollbar-sm`,
                menuItemWrapper: 'flex text-blue-500',
                menuIconTop: `text-blue-400 mr-3 text-lg group-hover:text-blue-500`,
                menuIconTopActive: `text-blue-500 mr-3 text-lg group-hover:text-blue-500`,
                menuOpenIcon: `fa-light fa-bars fa-fw`,
                menuCloseIcon: `fa-light fa-xmark fa-fw"`,
                navitemTop: `
          w-fit group font-display whitespace-nowrap
          flex tracking-widest items-center font-[Oswald] font-medium text-slate-700 text-[11px] px-2 h-12
          focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
          transition cursor-pointer
      `,
                navitemTopActive:
                    ` w-fit group font-display whitespace-nowrap
          flex tracking-widest items-center font-[Oswald] font-medium text-slate-700 text-[11px] px-2 h-12 text-blue
          focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
          transition cursor-pointer
        `,
                //`px-4 text-sm font-medium tracking-widest uppercase inline-flex items-center  border-transparent  leading-5 text-white hover:bg-white hover:text-darkblue-500 border-gray-200 focus:outline-none focus:text-gray-700 focus:border-gray-300 transition duration-150 ease-in-out h-full`,
                topmenuRightNavContainer: "hidden md:flex h-full items-center",
                topnavMobileContainer: "bg-slate-50",

                mobileButton: `hidden`,
                indicatorIcon: 'fal fa-angle-down pl-2 pt-1',
                indicatorIconOpen: 'fal fa-angle-down pl-2 pt-1',
                subMenuWrapper: `hidden`,
                subMenuParentWrapper: 'hidden',
                subMenuWrapperChild: `divide-x overflow-x-auto max-w-[1400px] mx-auto`,
                subMenuWrapperTop: 'hidden',
                subMenuWrapperInactiveFlyout: `absolute left-0 right-0  mt-8 normal-case bg-white shadow-lg z-10 p-2`,
                subMenuWrapperInactiveFlyoutBelow: ` absolute ml-40 normal-case bg-white shadow-lg z-10 p-2`,
                subMenuWrapperInactiveFlyoutDirection: 'grid grid-cols-4'
            }
        ]
    }
}

export default theme