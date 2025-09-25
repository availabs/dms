import {layoutSettings} from './components/Layout.theme'
import {sideNavsettings} from './components/SideNav.theme'
import {topNavsettings} from './components/TopNav.theme'
import { logoSettings } from './components/Logo'

// -----------------
// Pattern Settings
// -----------------
import { pagesThemeSettings } from '../patterns/page/defaultTheme'

export default (theme) => {
  const pageSettings = pagesThemeSettings(theme)
  console.log('hola page settings', pageSettings)
  return {
    navOptions: [
      {
        label: "Top Nav",
        type: 'inline',
        controls: [
          {
            label: 'Size',
            type: 'Select',

            options: [
              { label: 'None', value: 'none' },
              { label: 'Compact', value: 'compact' }
            ],

            path: `navOptions.topNav.size`,
          },
          {
            label: 'Search',
            type: 'Select',

            options: [
              { label: 'None', value: 'none' },
              { label: 'Left', value: 'left' },
              { label: 'Right', value: 'right' }
            ],

            path: `navOptions.topNav.search`,
          },
          {
            label: 'Logo',
            type: 'Select',

            options: [
              { label: 'None', value: 'none' },
              { label: 'Left', value: 'left' },
              { label: 'Right', value: 'right' }
            ],

            path: `navOptions.topNav.logo`,
          },
          {
            label: 'User Menu',
            type: 'Select',

            options: [
              { label: 'None', value: 'none' },
              { label: 'Left', value: 'left' },
              { label: 'Right', value: 'right' }
            ],

            path: `navOptions.topNav.dropdown`,
          },
          {
            label: 'Navigation',
            type: 'Select',

            options: [
              { label: 'None', value: 'none' },
              { label: 'Main', value: 'main' },
              { label: 'Secondary', value: 'secondary' }
            ],

            path: `navOptions.topNav.nav`,
          },

        ]
      },
      {
        label: "Side Nav",
        type: 'inline',
        controls: [
          {
            label: 'Size',
            type: 'Select',

            options: [
              { label: 'None', value: 'none' },
              { label: 'Compact', value: 'compact' }
            ],

            path: `navOptions.sideNav.size`,
          },
          {
            label: 'Search',
            type: 'Select',

            options: [
              { label: 'None', value: 'none' },
              { label: 'Top', value: 'top' },
              { label: 'Bottom', value: 'bottom' }
            ],

            path: `navOptions.sideNav.search`,
          },
          {
            label: 'Logo',
            type: 'Select',

            options: [
              { label: 'None', value: 'none' },
              { label: 'Top', value: 'top' },
              { label: 'Bottom', value: 'bottom' }
            ],

            path: `navOptions.sideNav.logo`,
          },
          {
            label: 'User Menu',
            type: 'Select',

            options: [
              { label: 'None', value: 'none' },
              { label: 'Top', value: 'top' },
              { label: 'Bottom', value: 'bottom' }
            ],

            path: `navOptions.sideNav.dropdown`,
          },
          {
            label: 'Navigation',
            type: 'Select',

            options: [
              { label: 'None', value: 'none' },
              { label: 'Main', value: 'main' },
              { label: 'Secondary', value: 'secondary' }
            ],

            path: `navOptions.sideNav.nav`,
          },
        ]
      }
    ],
    layout: layoutSettings,
    sidenav: sideNavsettings,
    topnav: topNavsettings,
    logo: logoSettings,
    ...pagesThemeSettings(theme)
  }
}
