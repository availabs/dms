import React, {useContext} from "react"
import {Link, useLocation} from 'react-router'
import { CMSContext } from '../context'
import { AuthContext } from "../../auth/context";
import { ThemeContext, getComponentTheme } from "../../../ui/useTheme";
import {userMenuTheme} from './userMenu.theme'
import { isUserAuthed } from "../../../utils/auth";

// import {NavItem, NavMenu, NavMenuItem, NavMenuSeparator, withAuth} from 'components/avl-components/src'
// import user from "@availabs/ams/dist/reducers/user";

const UserMenu = ({activeStyle}) => {
    const { theme, UI } = useContext(ThemeContext)
    const { user } = useContext(AuthContext)
    const { Icon } = UI;
    const menuTheme = getComponentTheme(theme, 'pages.userMenu', activeStyle) || userMenuTheme.styles[0]

    return (
      <div className={menuTheme.userMenuContainer}>
        <div className={menuTheme.avatarWrapper}>
          <div className={menuTheme.avatar}>
              <Icon icon={'User'} className={menuTheme.avatarIcon} />
          </div>
        </div>
        <div className={menuTheme.infoWrapper}>
          <div className={menuTheme.emailText}>{user.email ? user.email : ''}</div>
          <div className={menuTheme.groupText}>{user?.groups?.[0] ? user.groups[0] : ''}</div>
        </div>
      </div>
    )
}

const EditControl = ({activeStyle}) => {
  const { theme, UI } = useContext(ThemeContext)
  const { user } = useContext(AuthContext) || {}
  const { isUserAuthed = () => false,  baseUrl='/'  } = useContext(CMSContext) || {}
  const location = useLocation()
  const { Icon } = UI
  const menuTheme = getComponentTheme(theme, 'pages.userMenu', activeStyle) || userMenuTheme.styles[0]
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
            'edit-page-permissions',
            'publish-page'
        ])
      ) && (
        <div className={menuTheme.editControlWrapper}>
          <Link className={menuTheme.iconWrapper} to={`${baseUrl}${edit ? '' : '/edit'}${urlpath}${location.search}`}>
            {/*have to use rr to get query paramswindow.location.search*/}
            <Icon icon={edit ? menuTheme.viewIcon : menuTheme.editIcon} className={menuTheme.icon} />
          </Link>
        </div>
      )}
    </>
}

export default function UserMenuContainer ({title, children, activeStyle, navigableMenuActiveStyle}) {
  const { user, viewAsUser, setViewAsUser } = React.useContext(AuthContext) || {}
  const { baseUrl = '', app, authPermissions } = React.useContext(CMSContext) || {}
  const { theme, UI } = React.useContext(ThemeContext) || {}
  const { NavigableMenu, Icon } = UI;
  const location = useLocation();
  const menuTheme = getComponentTheme(theme, 'pages.userMenu', activeStyle) || userMenuTheme.styles[0]

  const isAdmin = React.useMemo(
    () => (user?.groups || []).some(g => g === `${app} Admin`)
      || isUserAuthed({ user, authPermissions, reqPermissions: ['view-as'] }),
    [user?.groups, app, authPermissions]
  );

  let authMenuItems = theme?.navOptions?.authMenu?.navItems || [
    {
        name: 'Datasets',
        icon: 'Database',
        path: '/datasets',
        type: 'link'
    },
    {
        name: 'Manager',
        icon: 'Settings',
        path: `${baseUrl}/list`,
        type: 'link'
    }
  ]
  authMenuItems.forEach(item => {
    if(item?.path){
      item.type = 'link'
    }
  })
  // Per-item group gating (additive/BC): an item with `groups: ["AVAIL", …]` renders only
  // for users belonging to at least one of them. Items without `groups` show as always.
  authMenuItems = authMenuItems.filter(item =>
    !item?.groups?.length || (user?.groups || []).some(g => item.groups.includes(g))
  )

  const viewAsMenuItems = viewAsUser
    ? [
        { type: 'separator' },
        {
          type: () => (
            <div className="px-3 py-1 text-xs text-amber-700 font-medium truncate max-w-[200px]">
              Viewing as {viewAsUser.email}
            </div>
          )
        },
        {
          name: 'Exit View As',
          icon: 'X',
          onClick: () => setViewAsUser(null),
        },
      ]
    : isAdmin
      ? [
          { type: 'separator' },
          { name: 'View As User…', icon: 'Users', path: '/auth/manage/users', type: 'link' },
        ]
      : [];

  return (
    <>
      {!user?.authed ?
        <Link
          className={`${menuTheme.loginWrapper} ${menuTheme.loginLink}`}
          to="/auth/login"
          state={{ from: location?.pathname }}>
            <Icon icon={'Login'} className={menuTheme.loginIcon} />
            <span className={menuTheme.loginText || 'hidden'}>Login</span>
        </Link> :
        (
          <div className={menuTheme.authContainer}>
            <div className={menuTheme.authWrapper}>
              <NavigableMenu
                config={[
                  ...authMenuItems.map(menuItem => ({...menuItem, icon: menuItem.icon || 'PageRound'})),
                  { name: 'Profile', path: '/auth/manage/profile', type: 'link', icon: 'User' },
                  ...viewAsMenuItems,
                  { type: 'separator'},
                  { name: 'Logout', path: '/auth/logout', type: 'link', icon: 'Logout' },
                ]}
                showTitle={false}
                activeStyle={navigableMenuActiveStyle}
              >
                <div className={menuTheme.userMenuWrapper}>
                  <UserMenu activeStyle={activeStyle} />
                </div>
              </NavigableMenu>
              <EditControl activeStyle={activeStyle} />
            </div>
          </div>
        )
      }
    </>
  )
}
