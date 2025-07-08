import docs from './docs';
import sideNavTheme from "./components/SideNav.theme";
import topNavTheme from "./components/TopNav.theme";
import layoutTheme  from './components/Layout.theme'
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
import {nestableTheme} from "./components/nestable/draggableNav"
import {dataCardTheme} from "./components/Card";
import {graphTheme} from "./components/graph";
import {logoTheme} from "./components/Logo";
// =====================================================================================================
// ======================================== todo: move these to UI
// =====================================================================================================
import {
    attributionTheme
} from "../patterns/page/components/selector/ComponentRegistry/shared/Attribution";
import {
    filterTheme
} from "../patterns/page/components/selector/dataWrapper/components/filters/RenderFilters";
// ======================================================================================================

const navOptions = {
    "logo": "",
    "sideNav": {
        "size": "none",
        "search": "none",
        "logo": "none",
        "dropdown": "none",
        "fixedMargin": "lg:ml-44",
        "position": "fixed",
        "nav": "none"
    },
    "topNav": {
        "size": "compact",
        "dropdown": "right",
        "search": "right",
        "logo": "left",
        "position": "sticky",
        "nav": "main"
    }
}

const components = {
    "heading": {
        "1": "text-blue-500 font-bold text-xl tracking-wider py-1 pl-1",
        "2": "text-lg tracking-wider",
        "3": "text-md tracking-wide",
        "base": "p-2 w-full font-sans font-medium text-md bg-transparent",
        "default": ""
    },
    "levelClasses": {
        "1": " pt-2 pb-1 uppercase text-sm text-blue-400 hover:underline cursor-pointer border-r-2 mr-4",
        "2": "pl-2 pt-2 pb-1 uppercase text-sm text-slate-400 hover:underline cursor-pointer border-r-2 mr-4",
        "3": "pl-4 pt-2 pb-1 text-sm text-slate-400 hover:underline cursor-pointer border-r-2 mr-4",
        "4": "pl-6 pt-2 pb-1 text-sm text-slate-400 hover:underline cursor-pointer border-r-2 mr-4"
    },
    "navPadding": {
        "1": "pt-0 ",
        "2": "md:pt-12 pt-0",
        "3": "md:pt-32 pt-0"
    },
    "navLabel": "px-6 pb-1 pt-6 uppercase text-xs text-blue-400",
    "page": {
        "container": "bg-slate-100",
        "wrapper1": "w-full h-full flex-1 flex flex-col",
        "wrapper2": "w-full h-full flex-1 flex flex-row px-1 md:px-6 py-6",
        "wrapper3": "flex flex-1 w-full  flex-col border shadow bg-white relative text-md font-light leading-7 p-4 min-h-[calc(100vh_-_102px)]",
        "iconWrapper": "z-5 absolute right-[10px] top-[5px]",
        "icon": "text-slate-400 hover:text-blue-500"
    },
    "sectionGroup": {
        "sideNavContainer1": "w-[302px] hidden xl:block",
        "sideNavContainer2": "w-[302px] sticky top-[120px] hidden xl:block h-[calc(100vh_-_128px)] pr-2",
        "sideNavContainer3": "shadow-md rounded-lg overflow-hidden h-full",
        "default": {
            "wrapper1": "w-full h-full flex-1 flex flex-row pt-2",
            "wrapper2": "flex flex-1 w-full  flex-col  shadow-md bg-white rounded-lg relative text-md font-light leading-7 p-4 h-full min-h-[200px]",
            "iconWrapper": "z-5 absolute right-[10px] top-[5px]",
            "icon": "text-slate-400 hover:text-blue-500"
        },
        "content": {
            "wrapper1": "w-full h-full flex-1 flex flex-row p-2",
            "wrapper2": "flex flex-1 w-full  flex-col  shadow-md bg-white rounded-lg relative text-md font-light leading-7 p-4 h-full min-h-[calc(100vh_-_102px)]",
            "iconWrapper": "z-5 absolute right-[10px] top-[5px]",
            "icon": "text-slate-400 hover:text-blue-500",
            "viewIcon": "ViewPage",
            "editIcon": "EditPage"
        },
        "header": {
            "wrapper1": "w-full h-full flex-1 flex flex-row",
            "wrapper2": "flex flex-1 w-full  flex-col  relative min-h-[200px]",
            "iconWrapper": "z-5 absolute right-[10px] top-[5px]",
            "icon": "text-slate-400 hover:text-blue-500",
            "sideNavContainer1": "hidden",
            "sideNavContainer2": "hidden"
        }
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
}
const theme = {
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
    navOptions,
    ...components,
    "Icons": {},
    docs
}

export default theme