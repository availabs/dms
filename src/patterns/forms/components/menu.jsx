import React from "react"
import { Dropdown } from '../ui/index'
import {Link, useLocation} from 'react-router-dom'
import { FormsContext } from '../siteConfig'
import { User } from '../ui/icons'

// import {NavItem, NavMenu, NavMenuItem, NavMenuSeparator, withAuth} from 'components/avl-components/src'
// import user from "@availabs/ams/dist/reducers/user";

const UserMenu = ({user}) => {
    // const theme = useTheme()
    return (
        <div className={`flex justify-column align-middle py-1 px-4 w-44 overflow-hidden`}>
            <div className='pt-[4px]'>
                <span className={`rounded-full border-2 border-blue-400
                    inline-flex items-center justify-center 
                    h-6 w-6 sm:h-8 sm:w-8 ring-white text-white 
                    bg-blue-500 overflow-hidden`}>
                    <User className='text-slate-50 ' />
                </span>
            </div>
            
            <span className='pl-2'>
                <div className='text-md font-thin tracking-tighter  text-left text-blue-600 group-hover:text-white '>{user.email ? user.email : ''}</div>
                <div className='text-xs font-medium -mt-1 tracking-widest text-left text-gray-500 group-hover:text-gray-200'>{user?.groups?.[0] ? user.groups[0] : ''}</div>
            </span>
        </div>
    )
}

export const Item = ({to, icon,children}) => (
        (
        <Link to={ to } >
            <div className='px-6 py-1 bg-blue-500 text-white hover:text-blue-100'>
                <div className='hover:translate-x-2 transition duration-100 ease-out hover:ease-in'>
                    <i className={`${icon} `} />
                    <span className='pl-2 text-sm'>
                        {children}
                    </span>
                </div>
            </div>
        </Link>)
   
)


export default ({title, children, adminPath}) => {
    const { user, baseUrl, parent, theme } = React.useContext(FormsContext)
    const location = useLocation();
    let authMenuItems = theme?.navOptions?.authMenu?.navItems || [
            {
                name: 'Patterns',
                icon: 'fad fa-sign-out-alt pb-2 pr-1',
                path: '/list',
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
        <div className="h-full z-40">
            {!user.authed ?            
                <Link className={`flex items-center px-8 text-lg font-bold h-12 dark:text-blue-100 px-4`} to="/auth/login" state={{from: location?.pathname}}>Login</Link> :
                <Dropdown control={<UserMenu user={user}/>} className={` hover:bg-blue-500 group z-40 `} >
                    <div className='p-1 bg-blue-500 z-40'>
                       
                        <div className='py-2'>
                            {authMenuItems.map((item) => {
                                return <>
                                    {user.authLevel >= (+item.authLevel || -1) && (
                                        <Item to={item.path} icon={item.icon}>
                                            {item.name}
                                        </Item>
                                    )}
                                </>
                           
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
        </div>
    )
}


