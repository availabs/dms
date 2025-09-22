const topNavTheme = {
      fixed: 'mt-12',
      topnavWrapper: `w-full h-[50px] flex items-center pr-1`,
      topnavContent: `flex items-center w-full h-full bg-white lg:bg-zinc-100 dark:bg-zinc-900 dark:lg:bg-zinc-950`,
      topnavMenu: `hidden  lg:flex items-center flex-1  h-full overflow-x-auto overflow-y-hidden scrollbar-sm`,
      menuItemWrapper: 'flex',
      menuIconTop: `text-blue-400 mr-3 text-lg group-hover:text-blue-500`,
      menuIconTopActive : `text-blue-500 mr-3 text-lg group-hover:text-blue-500`,
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
      topmenuRightNavContainer: "hidden md:flex h-full items-center",
      topnavMobileContainer: "bg-slate-50",

      mobileButton:`md:hidden bg-slate-100 inline-flex items-center justify-center pt-[12px] px-2 hover:text-blue-400  text-gray-400 hover:bg-gray-100 `,
      indicatorIcon: 'fal fa-angle-down pl-2 pt-1',
      indicatorIconOpen: 'fal fa-angle-down pl-2 pt-1',

      subMenuWrapper: `hidden`, //`absolute bg-white `,
      subMenuParentWrapper: 'hidden', //,`flex flex-row  max-w-[1400px] mx-auto`,
      subMenuWrapperChild: `divide-x overflow-x-auto max-w-[1400px] mx-auto`,
      subMenuWrapperTop: 'hidden',//`absolute top-full left-0 border-y border-gray-200 w-full bg-white normal-case`,
      subMenuWrapperInactiveFlyout: `absolute left-0 right-0  mt-8 normal-case bg-white shadow-lg z-10 p-2`,
      subMenuWrapperInactiveFlyoutBelow: ` absolute ml-40 normal-case bg-white shadow-lg z-10 p-2`,
      subMenuWrapperInactiveFlyoutDirection: 'grid grid-cols-4',

  }

export default topNavTheme

export const topNavsettings =  [{
    label: "Top Nav",
    type: 'inline',
    controls: Object.keys(topNavTheme)
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `sidenav.${k}`
          }
        })
}]

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
