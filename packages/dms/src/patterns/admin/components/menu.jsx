import React, {useContext} from "react"
import {Link, useLocation} from 'react-router'
import { AdminContext } from '../context'
import { ThemeContext } from "../../../ui/useTheme";
import { menuTheme } from './menu.theme'

// import {NavItem, NavMenu, NavMenuItem, NavMenuSeparator, withAuth} from 'components/avl-components/src'
// import user from "@availabs/ams/dist/reducers/user";

const UserMenu = ({user}) => {
    const {UI} = useContext(AdminContext)
    const { theme } = useContext(ThemeContext)
    const {Icon} = UI;
    const t = { ...menuTheme, ...(theme?.admin?.menu || {}) }
    return (
        <div className={t.userButton}>
            <Icon icon={'User'} className={t.userIcon} />
        </div>
    )
}

export default function AdminMenu ({title, children}) {
    const { user, baseUrl, UI } = React.useContext(AdminContext)
    const { theme } = React.useContext(ThemeContext)
    const { NavigableMenu } = UI;
    const location = useLocation();
    const t = { ...menuTheme, ...(theme?.admin?.menu || {}) }
    let authMenuItems = theme?.navOptions?.authMenu?.navItems || []

    return (
        <>
            {!user?.authed ?
                <Link className={t.loginLink} to="/auth/login" state={{from: location?.pathname}}>Login</Link> :
                <NavigableMenu
                    showTitle={false}
                    config={[
                        {
                            name: 'user-header',
                            type: () => (
                                <div className={t.userHeaderWrapper}>
                                    <div className={t.userEmail}>{user.email ? user.email : ''}</div>
                                    <div className={t.userGroup}>{user?.groups?.[0] ? user.groups[0] : ''}</div>
                                </div>
                            ),
                        },
                        ...authMenuItems.map(item => ({
                            type: 'link',
                            name: item.name,
                            path: item.path,
                            icon: item.icon,
                        })),
                        ...(!user.fake ? [{
                            type: 'link',
                            name: 'Logout',
                            path: '/auth/logout',
                        }] : []),
                    ]}
                >
                    <div className={t.menuTrigger}><UserMenu user={user}/></div>
                </NavigableMenu>
            }
        </>
    )
}
