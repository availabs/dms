// Note: component docs (ui/docs.js) are NOT imported here to avoid circular import:
// defaultTheme -> docs -> view.doc -> view -> useTheme -> defaultTheme
// Consumers that need docs should import ui/docs.js directly (see themeEditor.jsx).
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
import {tableTheme} from "./components/table/table.theme";
import {nestableTheme} from "./components/draggableNav"
import {dataCardTheme} from "./components/card.theme";
import {graphTheme} from "./components/graph/theme";
import {logoTheme} from "./components/Logo";
import navigableMenuTheme from "./components/navigableMenu/theme";
import icons from './icons'
import { textSettingsTheme } from "./themes/textSettings";
import { lexicalTheme } from './components/lexical/theme'
// =========================================
// Pattern Themes, maybe move registration of these to DMS Site ??
// =========================================
import pagesTheme from "../patterns/page/defaultTheme"
import datasetsTheme from "../patterns/datasets/defaultTheme"


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
    datasets: datasetsTheme,
    "compatibility": "border-[#191919] pt-[41px]",

    "heading": {
        "1": "text-blue-500 font-bold text-xl tracking-wider py-1 pl-1",
        "2": "text-lg tracking-wider",
        "3": "text-md tracking-wide",
        "base": "p-2 w-full font-sans font-medium text-md bg-transparent",
        "default": ""
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
    lexical:lexicalTheme,
    textSettings: textSettingsTheme,
    dataCard: dataCardTheme,
    attribution: attributionTheme,
    filters: filterTheme,
    graph: graphTheme,
    navigableMenu: navigableMenuTheme,
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
    //navOptions,
    ...components,

    "Icons":icons,
    settings,
    widgets: defaultWidgets
}

export default theme
