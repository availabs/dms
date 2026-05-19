import React, {useContext} from "react"
import {Link, useLocation} from 'react-router'
import { AuthContext } from '../context'
import { ThemeContext } from "../../../ui/useTheme";

// import {NavItem, NavMenu, NavMenuItem, NavMenuSeparator, withAuth} from 'components/avl-components/src'
// import user from "@availabs/ams/dist/reducers/user";

const UserMenu = ({user}) => {
    const { UI } = React.useContext(ThemeContext)
    const { Icon } = UI;
    return (
        <div className={`h-[47px] w-[47px] border border-[#E0EBF0] rounded-full flex items-center justify-center`}>
            <Icon icon={'User'} className='size-6 fill-[#37576b]' />
        </div>
    )
}

export default function AuthMenu ({title, children}) {
    const { user, baseUrl } = React.useContext(AuthContext)
    const { theme, UI } = React.useContext(ThemeContext)
    const { NavigableMenu } = UI;
    const location = useLocation();
    let authMenuItems = theme?.navOptions?.authMenu?.navItems || []

    return (
        <>
            {!user.authed ?
                <Link className={`flex items-center px-8 text-lg font-bold h-12 text-slate-500`} to="/auth/login" state={{from: location?.pathname}}>Login</Link> :
                <NavigableMenu
                    showTitle={false}
                    config={[
                        {
                            name: 'user-header',
                            type: () => (
                                <div className='py-2'>
                                    <Link className='text-md font-thin tracking-tighter text-left' to={`${baseUrl}/manage/profile`}>{user.email ? user.email : ''}</Link>
                                    <div className='text-xs font-medium -mt-1 tracking-widest text-left'>{user?.groups?.[0] ? user.groups[0] : ''}</div>
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
                    <div className={'px-1'}><UserMenu user={user}/></div>
                </NavigableMenu>
            }
        </>
    )
}
