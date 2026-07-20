import React, {useContext} from 'react'
import {Link} from 'react-router'
import {DatasetsContext} from '../context'
import {ThemeContext, getComponentTheme} from '../../../ui/useTheme'
import {breadcrumbsTheme} from './Breadcrumbs.theme'

/**
 * Unified breadcrumb bar for the datasets pattern.
 *
 * @param {Array} items - [{name, href?, icon?}]
 *   First item typically carries icon='Database' + href=baseUrl and renders the
 *   "Data Sources" root (icon + label). The last item (no href) is the current page.
 *
 * Themed via `datasets.breadcrumbs` (getComponentTheme); a `/` separator sits
 * between crumbs, and the current (last) crumb uses `t.current`.
 */
export default function Breadcrumbs({items = []}) {
    const {UI} = useContext(DatasetsContext)
    const {theme} = useContext(ThemeContext) || {}
    const {Icon} = UI
    const t = {...breadcrumbsTheme, ...getComponentTheme(theme, 'datasets.breadcrumbs')}

    return (
        <nav className={t.nav} aria-label="Breadcrumb">
            <ol className={t.ol}>
                {items.map((item, i) => {
                    const isLast = i === items.length - 1
                    return (
                        <li key={i} className={t.li}>
                            {i > 0 && <span className={t.separator} aria-hidden="true">/</span>}
                            {item.icon ? (
                                <Link to={item.href || '/'} className={t.homeLink}>
                                    <Icon icon={item.icon} className={t.homeIcon}/>
                                    <span className={t.homeLabel}>{item.name || 'Data Sources'}</span>
                                </Link>
                            ) : item.href && !isLast ? (
                                <Link to={item.href} className={t.link}>{item.name}</Link>
                            ) : (
                                <div className={t.current} aria-current="page">{item.name}</div>
                            )}
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}
