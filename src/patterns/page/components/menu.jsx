import React from "react"
import { Dropdown } from '../ui/index'
import {Link, useLocation} from 'react-router-dom'
import { CMSContext } from '../siteConfig'
import Icons, {Search, User, UserCircle} from '../ui/icons'

// import {NavItem, NavMenu, NavMenuItem, NavMenuSeparator, withAuth} from 'components/avl-components/src'
// import user from "@availabs/ams/dist/reducers/user";

const UserMenu = ({user}) => {
    return (
        <div className={`h-[47px] w-[47px] border border-[#E0EBF0] rounded-full place-items-center content-center`}>
            <User height={24} width={24} />
        </div>
    )
}

export const Item = ({to, icon,children}) => (
    (
        <Link to={ to } >
            <div className='px-6 py-1 bg-blue-500 text-white hover:text-blue-100'>
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


export default ({title, children}) => {
    const { user, baseUrl, theme } = React.useContext(CMSContext)
    const location = useLocation();
    let authMenuItems = theme?.navOptions?.authMenu?.navItems || [
            {
                name: 'Datasets',
                icon: 'fad fa-sign-out-alt pb-2 pr-1',
                path: '/datasets',
                authLevel: 5
            },
            {
                name: 'Manager',
                icon: 'fad fa-sign-out-alt pb-2 pr-1',
                path: `${baseUrl}/manage`,
                authLevel: 5
            },
        ]
    
    return (
        <>
            {!user.authed ?            
                <Link className={`flex items-center px-8 text-lg font-bold h-12 text-slate-500 px-4`} to="/auth/login" state={{from: location?.pathname}}>Login</Link> :
                <Dropdown control={<UserMenu user={user}/>} className={``} >
                    <div className='p-1 bg-blue-500 z-30'>
                       
                        <div className='text-white py-2'>
                            <div className='text-md font-thin tracking-tighter text-left'>{user.email ? user.email : ''}</div>
                            <div className='text-xs font-medium -mt-1 tracking-widest text-left'>{user?.groups?.[0] ? user.groups[0] : ''}</div>
                            {authMenuItems.map((item,i) => {
                                return <div key={i}>
                                    {user.authLevel >= (+item.authLevel || -1) && (
                                        <Item to={item.path} icon={item.icon}>
                                            {item.name}
                                        </Item>
                                    )}
                                </div>
                           
                            })}
                                         
                        </div>
                        {!user.fake && (
                            <div className='py-1 border-t border-blue-400'> 
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


