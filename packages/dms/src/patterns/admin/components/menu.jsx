import React, {useContext} from "react"
import {Link, useLocation} from 'react-router'
import { AdminContext } from '../context'
import { ThemeContext } from "../../../ui/useTheme";

// import {NavItem, NavMenu, NavMenuItem, NavMenuSeparator, withAuth} from 'components/avl-components/src'
// import user from "@availabs/ams/dist/reducers/user";

const UserMenu = ({user}) => {
    const {UI} = useContext(AdminContext)
    const {Icon} = UI;
    return (
        <div className={`h-[47px] w-[47px] border border-[#E0EBF0] rounded-full flex items-center justify-center`}>
            <Icon icon={'User'} className='size-6 fill-[#37576b]' />
        </div>
    )
}

export default function AdminMenu ({title, children}) {
    const { user, baseUrl, UI } = React.useContext(AdminContext)
    const { theme } = React.useContext(ThemeContext)
    const { NavigableMenu } = UI;
    const location = useLocation();
    let authMenuItems = theme?.navOptions?.authMenu?.navItems || []

    return (
        <>
            {!user?.authed ?
                <Link className={`flex items-center px-8 text-lg font-bold h-12 text-slate-500`} to="/auth/login" state={{from: location?.pathname}}>Login</Link> :
                <NavigableMenu
                    showTitle={false}
                    config={[
                        {
                            name: 'user-header',
                            type: () => (
                                <div className='py-2'>
                                    <div className='text-md font-thin tracking-tighter text-left'>{user.email ? user.email : ''}</div>
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
