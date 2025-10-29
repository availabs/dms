import React from "react"
import {Link} from "react-router";
import { merge } from "lodash-es"
import { cloneDeep } from "lodash-es"
import {DatasetsContext} from "./context";
import datasetsFormat, {source} from "./datasets.format";
import { ThemeContext } from "../../ui/useTheme";
import defaultTheme from "../../ui/defaultTheme";
import UI from "../../ui"
import ErrorPage from "./pages/error";
import DefaultMenu from "./components/menu";
import DatasetsListComponent from "./components/DatasetsListComponent"
import Overview from "./pages/overview"
import Table from "./pages/table"
import Admin from "./pages/admin"
import Upload from "./pages/upload"
import Metadata from "./pages/metadata"
import Validate from "./pages/validate"
import Version from "./pages/version"

// for instances without auth turned on can edit

const isUserAuthed = ({user={}, reqPermissions=[], authPermissions=[]}) => {
    if(!user?.authed) return false;
    if(!Object.keys(authPermissions).length) return true;

    const userAuthPermissions =
        (user.groups || [])
            .filter(group => authPermissions[group])
            .reduce((acc, group) => {
                const groupPermissions = Array.isArray(authPermissions[group]) ? authPermissions[group] : [authPermissions[group]];
                if(groupPermissions?.length){
                    acc.push(...groupPermissions)
                }
                return acc;
            }, [])
    return !reqPermissions?.length || userAuthPermissions.some(permission => permission === '*' || reqPermissions.includes(permission))
}

const adminConfig = ({
    app,
    type,
    siteType,
    baseUrl,
    damaBaseUrl,
    Menu,
    API_HOST='https://graph.availabs.org',
    authPermissions,
    logo,
    pattern,
    themes={ default: {} },
}) => {

    let theme = merge(cloneDeep(defaultTheme), cloneDeep(themes[pattern?.theme_name] || themes.mny_datasets))
    baseUrl = baseUrl === '/' ? '' : baseUrl
    const defaultLogo = (
        <Link to={baseUrl || '/'} className='h-12 flex px-4 items-center'>
            <div className='rounded-full h-8 w-8 bg-blue-500 border-2 border-blue-300 hover:bg-blue-600' />
        </Link>
    )

    if(!theme.navOptions.logo) {
        theme.navOptions.logo = logo ? logo : defaultLogo
    }
    theme.navOptions.sideNav = {
        "size": "compact",
        "search": "none",
        "logo": "top", "menu": "top",
        "nav": "main",
        "dropdown": "top"
    }

    theme.navOptions.topNav = {
        "size": "none",
        "dropdown": "right",
        "search": "right",
        "logo": "left",
        "position": "fixed",
        "nav": "main"
    }

    const patternFormat = cloneDeep(datasetsFormat);
    patternFormat.app = app
    patternFormat.type = type
    patternFormat.registerFormats = updateRegisteredFormats(patternFormat.registerFormats, app, type) // update app for all the children formats. this works, but dms stops providing attributes to patternList
    patternFormat.attributes = updateAttributes(patternFormat.attributes, app, type) // update app for all the children formats. this works, but dms stops providing attributes to patternList
    // console.log('formsAdminConfig', patternFormat)
    return {
        siteType,
        format: patternFormat,
        baseUrl: `${baseUrl}`,
        API_HOST,
        errorElement: () => {
            return (
                <DatasetsContext.Provider value={{
                    UI,
                    baseUrl: `${baseUrl}`, damaBaseUrl,
                    theme, app, type,
                    parent: pattern, Menu, API_HOST
                }}>
                    <ErrorPage />
                </DatasetsContext.Provider>
            )
        },
        children: [
            {
                type: (props) => {
                  const { user, falcor, ...rest} = props
                  const {Layout} = UI;
                  console.log('rest', siteType)
                  return (
                      <DatasetsContext.Provider value={{
                          UI,
                          baseUrl: `${baseUrl}`, damaBaseUrl,
                          falcor,
                          user,
                          theme, app, type, siteType,
                          parent: pattern, API_HOST,
                          authPermissions,
                          Menu: () => <>{Menu || <DefaultMenu theme={theme} UI={UI}/>}</>,
                          isUserAuthed: (reqPermissions, customAuthPermissions) => isUserAuthed({user, authPermissions: customAuthPermissions || authPermissions, reqPermissions}),
                      }}>
                          <ThemeContext.Provider value={{theme}}>
                                      <Layout navItems={[]} Menu={() => <DefaultMenu theme={theme} UI={UI}/>}>
                                          {props.children}
                                      </Layout>
                          </ThemeContext.Provider>
                      </DatasetsContext.Provider>
                  )
                },
                authPermissions,
                reqPermissions: ['view-sources'],
                action: "list",
                filter: {
                    stopFullDataLoad: true,
                    fromIndex: () => 0,
                    toIndex: () => 0,
                },
                path: "/*",
                children: [
                    {
                        type: props => <DatasetsListComponent {...props} />,
                        path: "",
                        action: "edit"
                    }
                ]
            }
        ]
    }
}


const sourceConfig = ({
    app,
    type,
    siteType,
    adminPath,
    title,
    baseUrl,
    damaBaseUrl,
    Menu,
    API_HOST='https://graph.availabs.org',
    authPermissions,
    columns,
    logo,
    pattern,
    pgEnv,
    themes={ default: {} },
    checkAuth = () => {}
}) => {
    let theme = merge(cloneDeep(defaultTheme), cloneDeep(themes[pattern?.theme_name] || themes.mny_datasets));

    baseUrl = baseUrl === '/' ? '' : baseUrl
    const defaultLogo = (
        <Link to={baseUrl || '/'} className='h-12 flex px-4 items-center'>
            <div className='rounded-full h-8 w-8 bg-blue-500 border-2 border-blue-300 hover:bg-blue-600' />
        </Link>
    )

    if(!theme.navOptions.logo) {
        theme.navOptions.logo = logo ? logo : defaultLogo
    }
    theme.navOptions.sideNav = {
        "size": "compact",
        "search": "none",
        "logo": "top", "menu": "top",
        "nav": "main",
        "dropdown": "top"
    }

    theme.navOptions.topNav = {
        "size": "none",
        "dropdown": "right",
        "search": "right",
        "logo": "left",
        "position": "fixed",
        "nav": "main"
    }

    const patternFormat = cloneDeep(source);
    const newType = `${type}|source`;
    patternFormat.app = app
    patternFormat.type = newType
    patternFormat.registerFormats = updateRegisteredFormats(patternFormat.registerFormats, app, newType) // update app for all the children formats. this works, but dms stops providing attributes to patternList
    patternFormat.attributes = updateAttributes(patternFormat.attributes, app, newType) // update app for all the children formats. this works, but dms stops providing attributes to patternList

    // console.log('formsAdminConfig', patternFormat)
    return {
        siteType,
        format: patternFormat,
        baseUrl: `${baseUrl}/source`,
        API_HOST,
        errorElement: () => {
            return (
                <DatasetsContext.Provider value={{
                    UI,
                    baseUrl: `${baseUrl}`, damaBaseUrl,
                    theme, app, type,
                    parent: pattern, Menu, API_HOST
                }}>
                    <ErrorPage />
                </DatasetsContext.Provider>
            )
        },
        children: [
            {
                type: ({user, falcor, children}) => {
                  const {Layout} = UI;
                  return (
                      <DatasetsContext.Provider value={{
                          UI,
                          baseUrl: `${baseUrl}`,
                          pageBaseUrl: `${baseUrl}/source`,
                          damaBaseUrl,
                          user,
                          pgEnv,
                          theme, app, type, siteType,
                          parent: pattern,
                          Menu: () => <>{Menu || <DefaultMenu theme={theme} UI={UI}/>}</>, API_HOST,
                          falcor,
                          authPermissions,
                          isUserAuthed: (reqPermissions, customAuthPermissions) => isUserAuthed({user, authPermissions: customAuthPermissions || authPermissions, reqPermissions}),
                      }}>
                          <ThemeContext.Provider value={{theme, UI}}>
                                      {children}
                          </ThemeContext.Provider>
                      </DatasetsContext.Provider>
                  )
                },
                authPermissions,
                action: "list",
                filter: {
                    stopFullDataLoad: true,
                    fromIndex: () => 0,
                    toIndex: () => 0,
                },
                path: "/*",
                authLevel: 5,
                children: [
                    {
                        type: Overview,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:pgEnv/:id`
                    },
                    {
                        type: Metadata,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:pgEnv/:id/metadata`
                    },
                    {
                        type: Admin,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        reqPermissions: ['source-admin'],
                        action: 'edit',
                        path: `:pgEnv/:id/admin`
                    },
                    // ============================= version dependent pages begin =====================================
                    {
                        type: Table,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:pgEnv/:id/table/:view_id?`
                    },
                    {
                        type: () => <> Map Page </>,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:pgEnv/:id/map/:view_id?`
                    },
                    {
                        type: Upload,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:pgEnv/:id/upload/:view_id?`
                    },
                    {
                        type: Validate,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:pgEnv/:id/validate/:view_id?`
                    },
                    {
                        type: Version,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:pgEnv/:id/version/:view_id?`
                    }
                    // ============================== version dependent pages end ======================================
                ]
            }
        ]
    }
}


export default [
    adminConfig,
    sourceConfig

];

const updateRegisteredFormats = (registerFormats, app, type) => {
    if(Array.isArray(registerFormats)){
        registerFormats = registerFormats.map(rFormat => {
            const newType = `${type}|${rFormat.type}`
            rFormat.app = app;
            rFormat.type = newType
            rFormat.registerFormats = updateRegisteredFormats(rFormat.registerFormats, app, newType); // provide updated type here
            rFormat.attributes = updateAttributes(rFormat.attributes, app, newType); // provide updated type here
            return rFormat;
        })
    }
    return registerFormats;
}

const updateAttributes = (attributes, app, type) => {
    if(Array.isArray(attributes)){
        attributes = attributes.map(attr => {
            attr.format = attr.format ? `${app}+${type}|${attr.format.split('+')[1]}`: undefined;
            return updateRegisteredFormats(attr, app, type);
        })
        //console.log('attr', attributes)
    }
    return attributes;
}
