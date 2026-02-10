import React, {useContext} from 'react'
import {Link} from 'react-router'
import {DatasetsContext} from '../context'
import {ThemeContext} from '../../../ui/useTheme'

export const breadcrumbsTheme = {
    nav: 'border-b border-gray-200 flex h-10',
    ol: 'w-full px-4 flex items-center space-x-4 sm:px-6 lg:px-8',
    li: 'flex',
    link: 'ml-4 text-sm font-medium text-gray-500 hover:text-gray-700',
    homeIcon: 'text-slate-400 hover:text-slate-500 size-4',
    homeLink: 'hover:text-[#bbd4cb] text-[#679d89]',
    separator: 'flex-shrink-0 w-6 h-full text-gray-300',
}

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
