import React from 'react'
import { ThemeContext, getComponentTheme } from '../../../../ui/useTheme'
import { sectionGroupTheme } from './sectionGroup.theme'
import { useScrollSpy } from '../../../../ui/components/useScrollSpy'

/**
 * InPageNav — the "on this page" rail nav, rendered entirely from the
 * `pages.sectionGroup` pattern theme (no UI.SideNav). Each menu item carries an
 * `anchorId` + an `onClick` that scrolls to it (built by `getInPageNav`); the
 * scroll-spy hook highlights the section currently in view.
 */
export default function InPageNav({ menuItems = [] }) {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {}
    const t = { ...sectionGroupTheme, ...getComponentTheme(themeFromContext, 'pages.sectionGroup') }

    const anchorIds = menuItems.map(m => m.anchorId).filter(Boolean)
    const activeId = useScrollSpy(anchorIds)

    if (!menuItems.length) return null

    return (
        <nav className={t.navWrapper}>
            {t.navLabelText ? <div className={t.navLabel}>{t.navLabelText}</div> : null}
            <ul className={t.navList}>
                {menuItems.map((item, i) => {
                    const isActive = item.anchorId && item.anchorId === activeId
                    return (
                        <li key={i}>
                            <button
                                type="button"
                                className={isActive ? t.navItemActive : t.navItem}
                                onClick={item.onClick}
                            >
                                {item.name}
                            </button>
                        </li>
                    )
                })}
            </ul>
        </nav>
    )
}
