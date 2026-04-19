import { sectionGroupTheme } from './components/sections/sectionGroup.theme'
import { sectionArrayTheme, sectionArraySettings } from './components/sections/sectionArray.theme'
import { sectionTheme, sectionSettings } from './components/sections/section.theme'
import { userMenuTheme, userMenuSettings } from './components/userMenu.theme'
import { searchButtonTheme, searchPalletTheme, searchButtonSettings, searchPalletSettings } from './components/search/theme'
import { sectionGroupControlTheme } from "./pages/edit/editPane/sectionGroupsPane.theme";

export default {
    sectionGroup: sectionGroupTheme,
    sectionArray: sectionArrayTheme,
    section: sectionTheme,
    userMenu: userMenuTheme,
    searchButton: searchButtonTheme,
    searchPallet: searchPalletTheme,
    sectionGroupsPane: sectionGroupControlTheme,
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
