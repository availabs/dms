export default {
      fixed: 'mt-8',
      topnavWrapper: `px-[24px] bg-slate-100  w-full h-full flex items-center md:rounded-lg shadow pointer-events-auto`,
      topnavContent: `flex items-center w-full h-full  `,
      topnavMenu: `hidden py-2  md:flex items-center flex-1  h-full overflow-x-auto overflow-y-hidden scrollbar-sm`,
      mobileButton:`md:hidden bg-slate-100 inline-flex items-center justify-center pt-[12px] px-2 hover:text-blue-400  text-gray-400 hover:bg-gray-100 `,
      indicatorIcon: 'ArrowDown',
      indicatorIconOpen: 'ArrowDown',
      indicatorIconWrapper: 'size-3',
      menuItemWrapper1: [
        ' ',
        ''
      ],
      menuItemWrapper1Parent: [
        ' ',
        'bg-[#F3F8F9] p-4 rounded-lg'
      ],
      menuItemWrapper2: [
        'flex text-[#37576B] ',
        ' '
      ],
      menuIconTop: `text-blue-400 mr-3 text-lg group-hover:text-blue-500`,
      menuIconTopActive : `text-blue-500 mr-3 text-lg group-hover:text-blue-500`,
      menuOpenIcon: `Menu`,
      menuCloseIcon: `XMark`,
      navitemTop: `
          w-fit group  whitespace-nowrap
          flex items-center 
          text-[16px] font-['Proxima_Nova'] font-[500] 
          px-2 uppercase
          focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
          transition cursor-pointer
      `,
      navitemTopActive:
        ` w-fit group  whitespace-nowrap
          flex  items-center 
          text-[16px] font-['Proxima_Nova'] font-[500] 
          px-2 text-blue uppercase
          focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
          transition cursor-pointer 
        `,
      navItemDescription: ['hidden',`text-[16px] font-['Proxima_Nova'] font-[400] text-[#37576B] text-wrap`],
      //`px-4 text-sm font-medium tracking-widest uppercase inline-flex items-center  border-transparent  leading-5 text-white hover:bg-white hover:text-darkblue-500 border-gray-200 focus:outline-none focus:text-gray-700 focus:border-gray-300 transition duration-150 ease-in-out h-full`,
      topmenuRightNavContainer: "hidden md:flex h-full items-center",
      topnavMobileContainer: "bg-slate-50 pointer-events-auto",
     
      
      subMenuWrapper1: [
        'absolute left-0 right-0 normal-case mt-4 z-10 px-4 pt-[42px] px-[62px] cursor-default'
      ],
      subMenuWrapper2: `bg-white flex items-stretch rounded-lg p-4 shadow`,
      subMenuParentContent: 'basis-1/3  text-wrap pr-[64px]',
      subMenuParentName: `text-[36px] font-['Oswald'] font-500 text-[#2D3E4C] uppercase pb-2`,
      subMenuParentDesc: `text-[16px] font-['Proxima_Nova'] font-[400] text-[#37576B]`,
      subMenuParentLink: `w-fit h-fit cursor-pointer uppercase border boder-[#E0EBF0] bg-white hover:bg-[#E0EBF0] text-[#37576B] font-[700] leading-[14.62px] rounded-full text-[12px] text-center py-[16px] px-[24px]`,
      subMenuItemsWrapperParent: 'grid grid-cols-2 gap-1 flex-1',
      subMenuItemsWrapper: 'grid grid-cols-4 flex-1' 
}