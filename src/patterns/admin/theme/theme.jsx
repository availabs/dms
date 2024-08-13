import React from 'react'
import sidenav from './sidenav'
import topnav from './topnav'
import { Link } from 'react-router-dom'


const theme = {
  navOptions: {
    logo: '',//<Link to='/' className='h-12 flex px-4 items-center'><div className='rounded-full h-8 w-8 bg-blue-500 border-2 border-blue-300 hover:bg-blue-600' /></Link>, //<Link to='/' className='h-12 flex px-4 items-center'>LOGO</Link>,
    sideNav: {
      size: 'compact',
      search: 'none',
      logo: 'top',
      dropdown: 'none',
      nav: 'main'
    },
    topNav: {
      size: 'compact',
      dropdown: 'right',
      search: 'right',
      logo: 'none',
      nav: 'none' 
    }
  },
  heading: {
    "base": "p-2 w-full font-sans font-medium text-md bg-transparent",
    "1": `text-blue-500 font-bold text-xl tracking-wider py-1 pl-1`,
    "2": `text-lg tracking-wider`,
    "3": `text-md tracking-wide`,
    "default": ''                                                                        
  },
  levelClasses: {
    '1': ' pt-2 pb-1 uppercase text-sm text-blue-400 hover:underline cursor-pointer border-r-2 mr-4',
    '2': 'pl-2 pt-2 pb-1 uppercase text-sm text-slate-400 hover:underline cursor-pointer border-r-2 mr-4',
    '3': 'pl-4 pt-2 pb-1 text-sm text-slate-400 hover:underline cursor-pointer border-r-2 mr-4',
    '4': 'pl-6 pt-2 pb-1 text-sm text-slate-400 hover:underline cursor-pointer border-r-2 mr-4',
  },
  page: {
    wrapper1: 'w-full h-full flex-1 flex flex-col bg-slate-100', // first div inside Layout
    wrapper2: 'w-full h-full flex-1 flex flex-row px-1 md:px-6 py-6', // inside page header, wraps sidebar
    wrapper3: 'flex flex-1 w-full  flex-col border shadow bg-white relative text-md font-light leading-7 p-4 min-h-[calc(100vh_-_102px)]' , // content wrapepr
    iconWrapper : 'z-5 absolute right-[10px] top-[5px]',
    icon: 'text-slate-400 hover:text-blue-500'
  },
  pageControls: {
    controlItem: 'pl-6 py-0.5 text-md cursor-pointer hover:text-blue-500 text-slate-400 flex items-center',
    select: 'bg-transparent border-none rounded-sm focus:ring-0 focus:border-0 pl-1',
    selectOption: 'p-4 text-md cursor-pointer hover:text-blue-500 text-slate-400 hover:bg-blue-600',
  },
  navPadding: {
    1: 'pt-0 ',
    2: 'md:pt-12 pt-0',
    3: 'md:pt-24 pt-0'
  },
  sidenav,
  topnav
}

//theme.navOptions.logo = <Link to='/' className='h-12 flex px-4 items-center'><div className='rounded-full h-10 bg-blue-500 border border-slate-50' /></Link>

export default theme