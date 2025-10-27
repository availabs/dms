import React, {useContext} from "react"
import {Link, useLocation} from 'react-router'
import { DatasetsContext} from "../context";

// import {NavItem, NavMenu, NavMenuItem, NavMenuSeparator, withAuth} from 'components/avl-components/src'
// import user from "@availabs/ams/dist/reducers/user";

const UserMenu = ({user, UI}) => {
    const {Icon} = UI;
    return (
        <div className={`h-[47px] w-[47px] border border-[#E0EBF0] rounded-full place-items-center content-center`}>
            <Icon icon={'User'} className='size-6 fill-[#37576b]' />
        </div>
    )
}

export const Item = ({to, icon,children}) => (
    (
        <Link to={ to } >
            <div className='px-6 py-1 hover:bg-slate-100'>
                <div className='hover:translate-x-2 transition duration-100 ease-out hover:ease-in'>
                    <i className={`${icon} `} />
                    <span className='pl-2'>
                        {children}
                    </span>
                </div>
            </div>
        </Link>
    )
)


export default ({theme={}, UI={}}) => {
    const { user, baseUrl } = React.useContext(DatasetsContext)
    const { Dropdown } = UI;
    const location = useLocation();
    let authMenuItems = theme?.navOptions?.authMenu?.navItems || [
            {
                name: 'Datasets',
                icon: 'fad fa-sign-out-alt pb-2 pr-1',
                path: '/datasets'
            },
            {
                name: 'Manager',
                icon: 'fad fa-sign-out-alt pb-2 pr-1',
                path: `${baseUrl}/manage`
            },
        ]

    return (
        <>

            {!user?.authed ?
                <Link className={`flex items-center px-8 text-lg font-bold h-12 text-slate-500`} to="/auth/login" state={{from: location?.pathname}}>Login</Link> :
                <Dropdown control={<div className={'px-1'}><UserMenu user={user} UI={UI}/></div>} className={``} >
                    <div className='p-1 bg-white rounded-md z-30 shadow-md'>

                        <div className='py-2'>
                            <div className='text-md font-thin tracking-tighter text-left'>{user.email ? user.email : ''}</div>
                            <div className='text-xs font-medium -mt-1 tracking-widest text-left'>{user?.groups?.[0] ? user.groups[0] : ''}</div>
                            {authMenuItems
                                .map((item,i) => {
                                return <div key={i}>
                                    {(
                                        <Item to={item.path} icon={item.icon}>
                                            {item.name}
                                        </Item>
                                    )}
                                </div>

                            })}

                        </div>
                        {!user.fake && (
                            <div className='py-1 border-t border-slate-200'>

                                <Item to='/auth/logout' icon={'fad fa-sign-out-alt pb-2 pr-1'}>
                                    Logout
                                </Item>
                            </div>
                        )}

                    </div>
                </Dropdown>
            }
        </>
    )
}
