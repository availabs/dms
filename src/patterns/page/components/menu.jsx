import React, {useContext} from "react"
import {Link, useLocation} from 'react-router'
import { CMSContext } from '../context'
import { AuthContext } from "../../auth/context";
import { ThemeContext } from "../../../ui/useTheme";
import NavigableMenu from "../../../ui/components/navigableMenu";

// import {NavItem, NavMenu, NavMenuItem, NavMenuSeparator, withAuth} from 'components/avl-components/src'
// import user from "@availabs/ams/dist/reducers/user";

const userMenuTheme = {
  userMenuContainer: 'flex w-full items-center justify-center rounded-xl @container',
  iconWrapper: 'size-9 flex items-center justify-center',
  icon: 'text-slate-400 hover:text-blue-500 size-7',
  viewIcon: 'ViewPage',
  editIcon: 'EditPage',
}

const UserMenu = ({}) => {
    const { UI } = useContext(ThemeContext)
    const { user} = useContext(AuthContext)
    const {Icon} = UI;
    return (
      <div className="flex w-full items-center justify-center rounded-xl min-w-[60px] @container">
        <div className="flex p-2  justify-center items-center">
          <div className={`size-8 border-2 border-[#E0EBF0] rounded-full place-items-center content-center `}>
              <Icon icon={'User'} className='size-6 fill-[#37576b]' />
          </div>
        </div>
        <div className="flex-1 p-2  @max-[150px]:hidden">
          <div className='text-xs font-thin tracking-tighter text-left'>{user.email ? user.email : ''}</div>
          <div className='text-xs font-medium -mt-1 tracking-widest text-left'>{user?.groups?.[0] ? user.groups[0] : ''}</div>
        </div>
      </div>
    )
}

const EditControl = () => {
  const { theme, UI } = useContext(ThemeContext)
  const { user } = useContext(AuthContext) || {}
  const { isUserAuthed = () => false,  baseUrl='/'  } = useContext(CMSContext) || {}
  const location = useLocation()
  const { Icon } = UI
  const menuTheme = theme?.page?.menu ||  userMenuTheme
  const edit = React.useMemo(() => {
    return location.pathname.replace(`${baseUrl}`,'').split('/')?.[1] === 'edit'
  },[location])

  const urlpath = edit ? location?.pathname.replace(`${baseUrl}/edit`,'') : location?.pathname.replace(`${baseUrl}`,'')
  //console.log('test', edit,urlpath,location?.pathname, baseUrl)
    return <>
      {(
        user?.authed &&
        isUserAuthed([
            'create-page',
            'edit-page',
            'edit-page-layout',
            'edit-page-params',
            'edit-page-permissions',
            'publish-page'
        ])
      ) && (
        <div className="flex justify-center items-center order-first p-2">
          <Link className={`${menuTheme?.iconWrapper}`} to={`${baseUrl}${edit ? '' : '/edit'}${urlpath}${location.search}`}>
            {/*have to use rr to get query paramswindow.location.search*/}
            <Icon icon={edit ? menuTheme?.viewIcon : menuTheme?.editIcon} className={menuTheme?.icon} />
          </Link>
        </div>
      )}
    </>
}

export default ({title, children}) => {
  const { user } = React.useContext(AuthContext) || {}
  const { baseUrl = ''} = React.useContext(CMSContext) || {}
  // console.log('Menu CMS Context', user)
  const { theme, UI } = React.useContext(ThemeContext) || {}
  const {  NavigableMenu, Icon } = UI;
  const location = useLocation();
  let authMenuItems = theme?.navOptions?.authMenu?.navItems || [
    {
        name: 'Datasets',
        icon: 'fad fa-sign-out-alt pb-2 pr-1',
        path: '/datasets',
        type: 'link'
    },
    {
        name: 'Manager',
        icon: 'fad fa-sign-out-alt pb-2 pr-1',
        path: `${baseUrl}/list`,
        type: 'link'
    }
  ]
  authMenuItems.forEach(item => {
    if(item?.path){
      item.type = 'link'
    }
  })

  //console.log('authMenuItems', authMenuItems)
  return (
    <>
      {!user?.authed ?
        <div className="flex items-center justify-center py-2">
          <Link
            className={`flex items-center `}
            to="/auth/login"
            state={{ from: location?.pathname }}>
              <div className={`size-8 rounded-lg place-items-center content-center `}>
                <Icon icon={'Login'} className='size-6 fill-[#37576b] hover:fill-slate-500' />
              </div>
          </Link>
        </div> :
        (
          <div className="@container w-full">
            <div className="flex p-1  items-center">
              <NavigableMenu
                config={[
                  { type: () =>  <UserMenu /> },
                  ...authMenuItems,
                  { type: 'separator'},
                  { name: 'Logout', path: '/auth/logout', type: 'link' },
                ]}
                showTitle={false}
              >
                <div className='flex items-center flex-1 w-full'>
                  <UserMenu />
                </div>
              </NavigableMenu>
              <EditControl />
            </div>
          </div>
        )
      }
    </>
  )
}
