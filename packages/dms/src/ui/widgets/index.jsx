import Logo from '../components/Logo'
import { HorizontalMenu } from '../components/TopNav'
import { VerticalMenu } from '../components/SideNav'

const NoComp = () => <div className='h-12'/>

const defaultWidgets = {
  Logo: {
    label: 'Logo',
    component: Logo,
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

export function registerWidget(name, { label, component, internal } = {}) {
  defaultWidgets[name] = {
    label: label || name,
    component: component || null,
    ...(internal ? { internal: true } : {}),
  }
}

export default defaultWidgets
