import docs from './docs';
import settings from './themeSettings'
import sideNavTheme from "./components/SideNav.theme";
import topNavTheme from "./components/TopNav.theme";
import layoutTheme  from './components/Layout.theme'
import defaultWidgets from './widgets'
import { layoutGroupTheme } from './components/LayoutGroup';
import {tabsTheme} from "./components/Tabs";
import {buttonTheme} from "./components/Button";
import {menuTheme} from "./components/Menu";
import {inputTheme} from "./components/Input";
import iconTheme from "./components/Icon.theme";
import {fieldTheme} from "./components/FieldSet";
import {dialogTheme} from "./components/Dialog";
import {popoverTheme} from "./components/Popover";
import {labelTheme} from "./components/Label";
import {selectTheme} from "./components/Select";
import {listboxTheme} from "./components/Listbox";
import {tableTheme} from "./components/table";
import {nestableTheme} from "./components/draggableNav"
import {dataCardTheme} from "./components/Card";
import {graphTheme} from "./components/graph";
import {logoTheme} from "./components/Logo";
import navigableMenuTheme from "./components/navigableMenu/theme";
import icons from './icons'
// =========================================
// Pattern Themes, maybe move registration of these to DMS Site ??
// =========================================
import pagesTheme from "../patterns/page/defaultTheme"


// =====================================================================================================
// ======================================== todo: move these to UI
// =====================================================================================================
import {
    attributionTheme
} from "../patterns/page/components/sections/components/dataWrapper/components/Attribution";
import {
    filterTheme
} from "../patterns/page/components/sections/components/dataWrapper/components/filters/RenderFilters";
// ======================================================================================================


const components = {
    pages: pagesTheme,
    "compatibility": "border-[#191919] pt-[41px]",

    "heading": {
        "1": "text-blue-500 font-bold text-xl tracking-wider py-1 pl-1",
        "2": "text-lg tracking-wider",
        "3": "text-md tracking-wide",
        "base": "p-2 w-full font-sans font-medium text-md bg-transparent",
        "default": ""
    },
    "sectionArray": {
        "container": "w-full grid grid-cols-6 ",
        "gridSize": 6,
        "layouts": {
            "centered": "max-w-[1020px] mx-auto",
            "fullwidth": ""
        },
        "sectionEditWrapper": "relative group",
        "sectionEditHover": "absolute inset-0 group-hover:border border-blue-300 border-dashed pointer-events-none z-10",
        "sectionViewWrapper": "relative group",
        "sectionPadding": "p-4",
        "gridviewGrid": "z-0 bg-slate-50 h-full",
        "gridviewItem": "border-x bg-white border-slate-100/75 border-dashed h-full p-[6px]",
        "defaultOffset": 16,
        "sizes": {
            "1": {
                "className": "col-span-6 md:col-span-6",
                "iconSize": 100
            },
            "1/3": {
                "className": "col-span-6 md:col-span-2",
                "iconSize": 33
            },
            "1/2": {
                "className": "col-span-6 md:col-span-3",
                "iconSize": 50
            },
            "2/3": {
                "className": "col-span-6 md:col-span-4",
                "iconSize": 66
            }
        },
        "rowspans": {
            "1": {
                "className": ""
            },
            "2": {
                "className": "md:row-span-2"
            },
            "3": {
                "className": "md:row-span-3"
            },
            "4": {
                "className": "md:row-span-4"
            },
            "5": {
                "className": "md:row-span-5"
            },
            "6": {
                "className": "md:row-span-6"
            },
            "7": {
                "className": "md:row-span-7"
            },
            "8": {
                "className": "md:row-span-8"
            }
        },
        "border": {
            "none": "",
            "full": "border border-[#E0EBF0] rounded-lg",
            "openLeft": "border border-[#E0EBF0] border-l-transparent rounded-r-lg",
            "openRight": "border border-[#E0EBF0] border-r-transparent rounded-l-lg",
            "openTop": "border border-[#E0EBF0] border-t-transparent rounded-b-lg",
            "openBottom": "border border-[#E0EBF0] border-b-transparent rounded-t-lg",
            "borderX": "border border-[#E0EBF0] border-y-transparent"
        }
    },
    layout: layoutTheme,
    layoutGroup: layoutGroupTheme,
    nestable: nestableTheme,
    sidenav: sideNavTheme,
    topnav: topNavTheme,
    logo: logoTheme,
    tabs: tabsTheme,
    button: buttonTheme,
    menu: menuTheme,
    input: inputTheme,
    icon: iconTheme,
    field: fieldTheme,
    dialog: dialogTheme,
    popover: popoverTheme,
    label: labelTheme,
    select: selectTheme,
    listbox: listboxTheme,
    table: tableTheme,

    // --- component themes
    lexical : {},
    dataCard: dataCardTheme,
    attribution: attributionTheme,
    filters: filterTheme,
    graph: graphTheme,
    navigableMenu: navigableMenuTheme,
}
const theme = {
    widgets: defaultWidgets,
    admin: {
        navOptions: {
            "logo": "",
            "sideNav": {
                "size": "compact",
                "logo": "top",
                "dropdown": "none",
                "position": "fixed",
                "nav": "main"
            },
            "topNav": {
                "size": "none",
                "dropdown": "right",
                "logo": "left",
                "position": "sticky",
                "nav": "none"
            }
        },
        page: {
            pageWrapper: 'w-full h-full flex-1 flex flex-row p-2',
            pageWrapper2: 'grow p-6 lg:rounded-lg lg:bg-white lg:p-10 lg:shadow-xs lg:ring-1 lg:ring-zinc-950/5 dark:lg:bg-zinc-900 dark:lg:ring-white/10'
        }
    },
    //navOptions,
    ...components,
    "Icons":icons,
    docs,
    settings
}

export default theme
