import React from 'react';
// -- Components
import { sideNavTheme } from '../components/sidenav'
import { topNavTheme } from '../components/topnav'
import { tabsTheme } from '../components/tabs'
import { buttonTheme } from '../components/button'
import { iconTheme } from '../components/icon'
import { inputTheme  } from '../components/input'
// import { nestableTheme } from '../../../../ui/components/nestable/draggableNav'
import { dialogTheme } from '../../../../ui/components'
import { popoverTheme } from '../components/popover'
import { selectTheme } from '../components/select'
import { listboxTheme } from '../components/listbox'
import { fieldTheme } from '../components/fieldset'
// --- Data Components
import { sectionArrayTheme } from '../../components/sections/sectionArray'

// -- Component Registery Components
import {dataCardTheme} from "../../components/selector/ComponentRegistry/Card";
import { attributionTheme } from "../../components/selector/ComponentRegistry/shared/Attribution";
import { sectionGroupTheme } from '../../components/sections/sectionGroup'

import { menuTheme } from '../components/menu'
import { labelTheme } from "../components/label";

import Icons from '../icons'
import {filterTheme} from "../../components/selector/dataWrapper/components/filters/RenderFilters";
import {graphTheme} from "../../components/selector/ComponentRegistry/graph";
import {tableTheme} from "../../../../ui/components/table";

const lexicalTheme = {}

const theme = {
  navOptions: {
    logo: '',
    sideNav: {
      size: 'none',
      search: 'none',
      logo: 'none',
      dropdown: 'none',
      fixedMargin: 'lg:ml-44',
      position: 'fixed',
      nav: 'none'
    },
    topNav: {
      size: 'compact',
      dropdown: 'right',
      search: 'right',
      logo: 'left',
      position: 'sticky',
      nav: 'main' 
    }
  },
  // ----------------------------------------------------
  // To move / remove
  // -----------------------------------------------------
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
  navPadding: {
    1: 'pt-0 ',
    2: 'md:pt-12 pt-0',
    3: 'md:pt-32 pt-0'
  },
  navLabel: 'px-6 pb-1 pt-6 uppercase text-xs text-blue-400',
  //----------------------------------------------------------  
  page: {
    container: 'bg-slate-100',
    wrapper1: 'w-full h-full flex-1 flex flex-col', // first div inside Layout
    wrapper2: 'w-full h-full flex-1 flex flex-row px-1 md:px-6 py-6', // inside page header, wraps sidebar
    wrapper3: 'flex flex-1 w-full  flex-col border shadow bg-white relative text-md font-light leading-7 p-4 min-h-[calc(100vh_-_102px)]' , // content wrapepr
    iconWrapper : 'z-5 absolute right-[10px] top-[5px]',
    icon: 'text-slate-400 hover:text-blue-500'
  },
  sectionGroup: sectionGroupTheme,
  sectionArray: sectionArrayTheme,
  layout: {
    wrapper: 'relative isolate flex min-h-svh w-full max-lg:flex-col',
    wrapper2: 'flex-1 flex items-start flex-col items-stretch max-w-full',
    wrapper3: 'flex flex-1',
    childWrapper: 'flex-1 h-full',
    topnavContainer1:`sticky top-0 left-0 right-0 z-20 `,
    topnavContainer2:``,
    sidenavContainer1: 'w-44',
    sidenavContainer2: 'sticky top-12 h-[calc(100vh_-_50px)]',
    navTitle: `flex-1 text-[24px] font-['Oswald'] font-[500] leading-[24px] text-[#2D3E4C] py-3 px-4 uppercase`
  },
  sidenav: sideNavTheme,
  topnav: topNavTheme,
  tabs: tabsTheme,
  button: buttonTheme,
  menu: menuTheme,
  input: inputTheme,
  icon: iconTheme,
  field: fieldTheme,
  // nestable: nestableTheme,
  dialog: dialogTheme,
  popover: popoverTheme,
  label: labelTheme,
  select: selectTheme,
  listbox: listboxTheme,
  // -- 
  
  // --
  table: tableTheme,

  // --- component themes
  lexical : lexicalTheme,
  dataCard: dataCardTheme,
  attribution: attributionTheme,
  filters: filterTheme,
  graph: graphTheme,
  
  // -- Icon Set
  Icons

}

//theme.navOptions.logo = <Link to='/' className='h-12 flex px-4 items-center'><div className='rounded-full h-10 bg-blue-500 border border-slate-50' /></Link>

export default theme

export const themeOptions = {
  "settings": {
    "theme": {
      "label": "Theme",
      "defaultOpen": true,
      "controls": {
        "theme": {
          "label": "Theme",
          "type": "select",
          "options": [
            "default",
            "catalyst",
            "mny",
            "mny_admin"
          ]
        }
      }
    }
  },
  "navOptions": {
    "topNav": {
      "label": "Top Nav",
      "defaultOpen": true,
      "controls": {
        "size": {
          "label": "Size",
          "type": "select",
          "options": [
            "none",
            "compact"
          ]
        },
        "logo": {
          "label": "Logo",
          "type": "select",
          "options": [
            "none",
            "left",
            "right"
          ]
        },
        "search": {
          "label": "Search",
          "type": "select",
          "options": [
            "none",
            "left",
            "right"
          ]
        },
        "dropdown": {
          "label": "Menu",
          "type": "select",
          "options": [
            "none",
            "left",
            "right"
          ]
        },
        "nav": {
          "label": "Navigation",
          "type": "select",
          "options": [
            "none",
            "main",
            "secondary"
          ]
        }
      }
    },
    "sideNav": {
      "label": "Side Nav",
      "defaultOpen": false,
      "controls": {
        "size": {
          "label": "Size",
          "type": "select",
          "options": [
            "none",
            "micro",
            "mini",
            "compact",
            "full"
          ]
        },
        "depth": {
          "label": "Depth",
          "type": "select",
          "options": [
            1,
            2,
            3
          ]
        },
        "logo": {
          "label": "Logo",
          "type": "select",
          "options": [
            "none",
            "top",
            "bottom"
          ]
        },
        "search": {
          "label": "Search",
          "type": "select",
          "options": [
            "none",
            "top",
            "bottom"
          ]
        },
        "dropdown": {
          "label": "Menu",
          "type": "select",
          "options": [
            "none",
            "top",
            "bottom"
          ]
        },
        "nav": {
          "label": "Navigation",
          "type": "select",
          "options": [
            "none",
            "main",
            "secondary"
          ]
        }
      }
    },
    "secondaryNav": {
      "label": "Secondary Nav",
      "defaultOpen": false,
      "controls": {
        "navItems": {
          "label": "Nav Items",
          "type": "menu"
        }
      }
    },
    "authMenu": {
      "label": "Auth Menu",
      "defaultOpen": false,
      "controls": {
        "navItems": {
          "label": "Nav Items",
          "type": "menu"
        }
      }
    }
  }
}