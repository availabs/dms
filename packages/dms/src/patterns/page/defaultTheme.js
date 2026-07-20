import { sectionGroupTheme } from './components/sections/sectionGroup.theme'
import { sectionArrayTheme, sectionArraySettings } from './components/sections/sectionArray.theme'
import { sectionTheme, sectionSettings } from './components/sections/section.theme'
import { userMenuTheme, userMenuSettings } from './components/userMenu.theme'
import { searchButtonTheme, searchPalletTheme, searchButtonSettings, searchPalletSettings } from './components/search/theme'
import { sectionGroupControlTheme } from "./pages/edit/editPane/sectionGroupsPane.theme";
import { complexFiltersTheme } from './components/sections/ComplexFilters.theme'
import { templateManagerTheme } from './components/sections/TemplateManager.theme'
import { timePickerTheme } from './components/sections/components/dataWrapper/components/filters/TimePicker/timePicker.theme'
import { pageTemplatePickerTheme } from './components/PageTemplatePicker.theme'
import { damaMapTheme } from './components/sections/components/ComponentRegistry/map/map.theme'

export default {
    sectionGroup: sectionGroupTheme,
    sectionArray: sectionArrayTheme,
    section: sectionTheme,
    userMenu: userMenuTheme,
    searchButton: searchButtonTheme,
    searchPallet: searchPalletTheme,
    sectionGroupsPane: sectionGroupControlTheme,
    complexFilters: complexFiltersTheme,
    templateManager: templateManagerTheme,
    timePicker: timePickerTheme,
    pageTemplatePicker: pageTemplatePickerTheme,
    damaMap: damaMapTheme,
}

export const pagesThemeSettings = (theme) => {
  return {
    sectionArray: sectionArraySettings(theme),
    section: sectionSettings(theme),
    userMenu: userMenuSettings(theme),
    searchButton: searchButtonSettings(theme),
    searchPallet: searchPalletSettings(theme)
  }
}
