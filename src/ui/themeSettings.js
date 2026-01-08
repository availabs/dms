import {layoutSettings} from './components/Layout.theme'
import { layoutGroupSettings } from './components/LayoutGroup'
import {sideNavsettings} from './components/SideNav.theme'
import {topNavsettings} from './components/TopNav.theme'
import { logoSettings } from './components/Logo'
import { buttonSettings } from './components/Button'
import { cardSettings } from "./components/Card";

// -----------------
// Pattern Settings
// -----------------
import { pagesThemeSettings } from '../patterns/page/defaultTheme'

export default (theme) => {
  const pageSettings = pagesThemeSettings(theme)
  // console.log('hola page settings', pageSettings)
  return {
    layout: layoutSettings(theme),
    layoutGroup: layoutGroupSettings(theme),
    sidenav: sideNavsettings(theme),
    topnav: topNavsettings(theme),
    logo: logoSettings,
    button: buttonSettings(theme),
    card: cardSettings(theme),
    ...pagesThemeSettings(theme),

  }
}
