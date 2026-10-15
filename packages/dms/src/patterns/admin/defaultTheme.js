import { pagesEditorTheme } from './pages/patternEditor/pages/pagesEditor.theme'
import { menuTheme } from './components/menu.theme'
import { errorPageTheme } from './components/errorPage.theme'
import { patternListTheme } from './components/patternList.theme'
import { patternPickerTheme } from './components/AddPatternPicker.theme'
import { createSiteTheme } from './pages/createSite.theme'
import { editSiteTheme } from './pages/editSite.theme'
import { patternEditorTheme } from './pages/patternEditor/patternEditor.theme'
import { settingsEditorTheme } from './pages/patternEditor/default/settings.theme'
import { filterEditorTheme } from './pages/patternEditor/default/filterEditor.theme'
import { permissionsEditorTheme } from './pages/patternEditor/default/permissionsEditor.theme'
import { themeEditorTheme } from './pages/patternEditor/default/themeEditor.theme'
import { themeListTheme } from './pages/themes/list.theme'
import { editThemeTheme } from './pages/themes/editTheme.theme'
import { adminLayoutTheme } from './ui/avail-layout.theme'
import { adminUiTheme } from './ui/index.theme'
import { sectionGroupTheme } from './siteConfig.theme'

export default {
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
    },
    menu: menuTheme,
    errorPage: errorPageTheme,
    patternList: patternListTheme,
    patternPicker: patternPickerTheme,
    createSite: createSiteTheme,
    editSite: editSiteTheme,
    patternEditor: patternEditorTheme,
    settingsEditor: settingsEditorTheme,
    filterEditor: filterEditorTheme,
    permissionsEditor: permissionsEditorTheme,
    themeEditor: themeEditorTheme,
    themeList: themeListTheme,
    editTheme: editThemeTheme,
    adminLayout: adminLayoutTheme,
    adminUi: adminUiTheme,
    sectionGroup: sectionGroupTheme,
    pagesEditor: pagesEditorTheme,
}
