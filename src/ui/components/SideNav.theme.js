export default {
  fixed: "lg:ml-64",
  logoWrapper: "w-64 bg-neutral-100 text-slate-800",
  sidenavWrapper: "flex flex-col w-64 h-full z-20",
  menuItemWrapper: "flex flex-col ",
  menuIconSide: "group w-6 mr-2 text-blue-500  group-hover:text-blue-800",
  menuIconSideActive: "group w-6 mr-2 text-blue-500  group-hover:text-blue-800",
  itemsWrapper: "pt-12 flex-1 ",
  navItemContent: "transition-transform duration-300 ease-in-out",
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
  indicatorIcon: "fa fa-angle-right pt-2.5",
  indicatorIconOpen: "fal fa-angle-down pt-2.5",
  subMenuWrapper: "pl-2 w-full",
  subMenuParentWrapper: "flex flex-col w-full",
  bottomMenuWrapper: 'border-t'
}
// export default {
//    "fixed": "",
//    "logoWrapper": "w-44 bg-neutral-100 text-slate-800",
//    "topNavWrapper": "flex flex-row md:flex-col", //used in layout
//    "sidenavWrapper": "hidden md:block bg-white border-r w-44 h-full z-20",
//    "menuItemWrapper": "flex flex-col",
//    "menuIconSide": "group w-6 mr-2 text-blue-500  group-hover:text-blue-800",
//    "menuIconSideActive": "group w-6 mr-2 text-blue-500  group-hover:text-blue-800",
//    "itemsWrapper": "border-slate-200 pt-5  ",
//    "navItemContent": "transition-transform duration-300 ease-in-out flex-1",
//    "navItemContents": ['text-[14px] font-light hover:bg-blue-50 text-slate-700 px-4 py-2'],
//    "navitemSide": `
//    	group  flex flex-col
//    	group flex 
//    	focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
//    	transition-all cursor-pointer border-l-2 border-white`,
//    "navitemSideActive": `
//    	group  flex flex-col   
//     	focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
//    	transition-all cursor-pointer border-l-2 border-blue-500`,
//    "indicatorIcon": "ArrowRight",
//    "indicatorIconOpen": "ArrowDown",
//    "subMenuWrappers": ['w-full bg-[#F3F8F9] rounded-[12px]','w-full bg-[#E0EBF0]'],
//    "subMenuOuterWrappers": ['pl-4'],
//    "subMenuWrapper": "pl-2 w-full",
//    "subMenuParentWrapper": "flex flex-col w-full",
//    "bottomMenuWrapper": ""
// }