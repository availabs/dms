import React, {useContext} from "react"
import {Link, useLocation} from 'react-router'
import { AuthContext } from '../context'
import { ThemeContext } from "../../../ui/useTheme";

// import {NavItem, NavMenu, NavMenuItem, NavMenuSeparator, withAuth} from 'components/avl-components/src'
// import user from "@availabs/ams/dist/reducers/user";

// Menu chrome from `theme.auth.userMenu`; fallbacks are the literals this
// component carried before the keys existed (2026-09-12).
const MENU_DEFAULTS = {
    avatar: 'h-[47px] w-[47px] border border-[#E0EBF0] rounded-full flex items-center justify-center',
    avatarIcon: 'size-6 fill-[#37576b]',
    loginLink: 'flex items-center px-8 text-lg font-bold h-12 text-slate-500',
    header: 'py-2',
    headerEmail: 'text-md font-thin tracking-tighter text-left',
    headerGroup: 'text-xs font-medium -mt-1 tracking-widest text-left',
    trigger: 'px-1',
}
const useMenuTheme = (theme) => ({ ...MENU_DEFAULTS, ...(theme?.auth?.userMenu || {}) })

const UserMenu = ({user}) => {
    const { theme, UI } = React.useContext(ThemeContext)
    const { Icon } = UI;
    const m = useMenuTheme(theme)
    return (
        <div className={m.avatar}>
            <Icon icon={'User'} className={m.avatarIcon} />
        </div>
    )
}

export default function AuthMenu ({title, children}) {
    const { user, baseUrl } = React.useContext(AuthContext)
    const { theme, UI } = React.useContext(ThemeContext)
    const { NavigableMenu } = UI;
    const location = useLocation();
    let authMenuItems = theme?.navOptions?.authMenu?.navItems || []
    const m = useMenuTheme(theme)

    return (
        <>
            {!user.authed ?
                <Link className={m.loginLink} to="/auth/login" state={{from: location?.pathname}}>Login</Link> :
                <NavigableMenu
                    showTitle={false}
                    config={[
                        {
                            name: 'user-header',
                            type: () => (
                                <div className={m.header}>
                                    <Link className={m.headerEmail} to={`${baseUrl}/manage/profile`}>{user.email ? user.email : ''}</Link>
                                    <div className={m.headerGroup}>{user?.groups?.[0] ? user.groups[0] : ''}</div>
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
                    <div className={m.trigger}><UserMenu user={user}/></div>
                </NavigableMenu>
            }
        </>
    )
}
