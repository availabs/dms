import Logo from '../components/Logo'
import { HorizontalMenu } from '../components/TopNav'
import { VerticalMenu } from '../components/SideNav'
import ThemeToggle from '../components/ThemeToggle'

const NoComp = () => <div className='h-12'/>

const defaultWidgets = {
  Logo: {
    label: 'Logo',
    component: Logo,
  },
  ThemeToggle: {
    label: 'Theme Toggle',
    component: ThemeToggle,
  },
  // internal widgets — not shown in theme editor listbox
  NoComp: {
    label: 'No Component',
    component: NoComp,
    internal: true,
  },
  HorizontalMenu: {
    label: 'Horizontal Menu',
    component: HorizontalMenu,
    internal: true,
  },
  VerticalMenu: {
    label: 'Vertical Menu',
    component: VerticalMenu,
    internal: true,
  },
}

// A widget renders in a nav slot (ui/components/Layout.jsx getMenu) with its slot entry's `options` as
// props. Read the signed-in user from AuthContext, as UserMenu does: CMSContext's `user` can stay the
// boot-time placeholder (isAuthenticating) for a whole first page load.
export function registerWidget(name, { label, component, internal } = {}) {
  defaultWidgets[name] = {
    label: label || name,
    component: component || null,
    ...(internal ? { internal: true } : {}),
  }
}

export default defaultWidgets
