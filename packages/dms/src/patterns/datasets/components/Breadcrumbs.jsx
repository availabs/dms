import React, {useContext} from 'react'
import {Link} from 'react-router'
import {DatasetsContext} from '../context'
import {ThemeContext} from '../../../ui/useTheme'
import {breadcrumbsTheme} from './Breadcrumbs.theme'

const Separator = ({className}) => (
    <svg
        className={className}
        viewBox="0 0 30 44"
        preserveAspectRatio="none"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
    >
        <path d="M.293 0l22 22-22 22h1.414l22-22-22-22H.293z"/>
    </svg>
)

/**
 * Unified breadcrumb component for datasets pattern.
 *
 * @param {Array} items - [{name, href?, icon?}]
 *   First item typically has icon='Database' and href=baseUrl.
 *   Last item typically has no href (current page).
 */
export default function Breadcrumbs({items}) {
    const {UI} = useContext(DatasetsContext)
    const {theme} = useContext(ThemeContext)
    const {Icon} = UI
    const t = theme?.datasets?.breadcrumbs || breadcrumbsTheme

    return (
        <nav className={t.nav} aria-label="Breadcrumb">
            <ol className={t.ol}>
                {items.map((item, i) => (
                    <li key={i} className={t.li}>
                        <div className="flex items-center">
                            {i > 0 && <Separator className={t.separator}/>}
                            {item.icon ? (
                                <Link to={item.href || '/'} className={t.homeLink}>
                                    <Icon icon={item.icon} className={t.homeIcon}/>
                                    <span className="sr-only">Data Sources</span>
                                </Link>
                            ) : item.href ? (
                                <Link to={item.href} className={t.link}>
                                    {item.name}
                                </Link>
                            ) : (
                                <div className={t.link}>
                                    {item.name}
                                </div>
                            )}
                        </div>
                    </li>
                ))}
            </ol>
        </nav>
    )
}
