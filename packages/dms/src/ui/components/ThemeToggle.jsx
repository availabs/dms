import React from 'react'
import { ThemeContext, getComponentTheme } from '../useTheme.js'
import Icon from './Icon'
import { themeToggleTheme } from './ThemeToggle.theme'

const STORAGE_KEY = 'dms-color-scheme'

// Turns dark mode on when the viewer saved "dark" (or saved nothing and the OS
// prefers dark). Returns whether it did. dmsSiteFactory.jsx calls this once
// before the first render; the toggle's mount effect calls it too.
export function applySavedColorScheme () {
  if (typeof document === 'undefined') return false
  let stored
  try { stored = window.localStorage.getItem(STORAGE_KEY) } catch (e) { /* noop */ }
  const prefersDark = stored ? stored === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
  if (prefersDark) document.documentElement.setAttribute('data-theme', 'dark')
  return !!prefersDark
}

export default function ThemeToggleComp(props) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {}
  const theme = { ...themeToggleTheme, ...getComponentTheme(themeFromContext, 'themeToggle', props.activeStyle) }
  const [isDark, setIsDark] = React.useState(
    () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
  )

  React.useEffect(() => {
    if (applySavedColorScheme()) setIsDark(true)
  }, [])

  const toggle = () => {
    const next = !isDark
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    try { window.localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light') } catch (e) { /* noop */ }
    setIsDark(next)
  }

  return (
    <button type="button" onClick={toggle} aria-label="Toggle dark mode" className={theme.button}>
      <Icon icon={isDark ? 'Sun' : 'Moon'} className={theme.icon} />
    </button>
  )
}
