import React from "react"
import {Link} from "react-router";
import { merge } from "lodash-es"
import { cloneDeep } from "lodash-es"
import {DatasetsContext} from "./context";
import datasetsFormat, {source} from "./datasets.format";
import { ThemeContext } from "../../ui/useTheme";
import defaultTheme from "../../ui/defaultTheme";
import UI from "../../ui"
import ErrorPage from "./pages/dataTypes/default/error";
import DefaultMenu from "./components/menu";
import DatasetsListComponent from "./components/DatasetsListComponent"
import SourcePageSelector from "./pages/sourcePageSelector";
import Tasks from "./pages/dataTypes/default/Tasks/";
import TaskPage from "./pages/dataTypes/default/Tasks/TaskPage";
import csv_dataset from "./pages/dataTypes/csv_dataset";
import gis_dataset from "./pages/dataTypes/gis_dataset";
import internal_dataset from "./pages/dataTypes/internal";

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
    DAMA_HOST='https://graph.availabs.org',
    authPermissions,
    logo,
    pattern,
    datasets,
    pgEnv,
    themes={ default: {} },
}) => {

    let theme = merge(cloneDeep(defaultTheme), cloneDeep(themes[pattern?.theme_name] || themes.mny_datasets))
    baseUrl = baseUrl === '/' ? '' : baseUrl


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
                  return (
                      <DatasetsContext.Provider value={{
                          UI,
                          pgEnv,
                          baseUrl: `${baseUrl}`, damaBaseUrl,
                          falcor,
                          user,
                          theme, app, type, siteType,
                          parent: pattern, API_HOST, DAMA_HOST,
                          authPermissions,
                          datasets: {csv_dataset, gis_dataset, internal_dataset, ...datasets},
                          Menu: () => <>{Menu || <DefaultMenu theme={theme} UI={UI}/>}</>,
                          isUserAuthed: (reqPermissions, customAuthPermissions) => isUserAuthed({user, authPermissions: customAuthPermissions || authPermissions, reqPermissions}),
                      }}>
                          <ThemeContext.Provider value={{theme, UI}}>
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
                    },
                    {
                        type: props => <Tasks {...props} />,
                        path: "tasks",
                        action: "edit"
                    },
                    {
                        type: props => <TaskPage {...props} />,
                        path: "task/:etl_context_id",
                        action: "edit"
                    }
                ]
            }
        ]
    }
}


const externalSourceConfig = ({
    app,
    type,
    siteType,
    adminPath,
    title,
    baseUrl,
    damaBaseUrl,
    Menu,
    API_HOST='https://graph.availabs.org',
    DAMA_HOST='https://graph.availabs.org',
    authPermissions,
    columns,
    logo,
    pattern,
    pgEnv,
    themes={ default: {} },
    checkAuth = () => {},
    datasets = {}
}) => {
    let theme = merge(cloneDeep(defaultTheme), cloneDeep(themes[pattern?.theme_name] || themes.mny_datasets));

    baseUrl = baseUrl === '/' ? '' : baseUrl

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
                          Menu: () => <>{Menu || <DefaultMenu theme={theme} UI={UI}/>}</>, API_HOST, DAMA_HOST,
                          falcor,
                          datasets: {csv_dataset, gis_dataset, internal_dataset, ...datasets},
                          authPermissions,
                          isUserAuthed: (reqPermissions, customAuthPermissions) => isUserAuthed({user, authPermissions: customAuthPermissions || authPermissions, reqPermissions}),
                      }}>
                          <ThemeContext.Provider value={{theme, UI}}>
                                      <Layout navItems={[]} Menu={() => <DefaultMenu theme={theme} UI={UI}/>}>
                                          {children}
                                      </Layout>
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
                        type: SourcePageSelector,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:id/:page?/:view_id?` // default pgEnv set in pattern.
                    }
                ]
            }
        ]
    }
}

const internalSourceConfig = ({
    app,
    type,
    siteType,
    adminPath,
    title,
    baseUrl,
    damaBaseUrl,
    Menu,
    API_HOST='https://graph.availabs.org',
    DAMA_HOST='https://graph.availabs.org',
    authPermissions,
    columns,
    logo,
    pattern,
    pgEnv,
    themes={ default: {} },
    checkAuth = () => {},
    datasets
}) => {
    let theme = merge(cloneDeep(defaultTheme), cloneDeep(themes[pattern?.theme_name] || themes.mny_datasets));

    baseUrl = baseUrl === '/' ? '' : baseUrl


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
        baseUrl: `${baseUrl}/internal_source`,
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
                          pageBaseUrl: `${baseUrl}/internal_source`,
                          damaBaseUrl,
                          user,
                          pgEnv,
                          theme, app, type, siteType,
                          parent: pattern,
                          Menu: () => <>{Menu || <DefaultMenu theme={theme} UI={UI}/>}</>, API_HOST, DAMA_HOST,
                          falcor,
                          datasets: {csv_dataset, gis_dataset, internal_dataset, ...datasets},
                          authPermissions,
                          isUserAuthed: (reqPermissions, customAuthPermissions) => isUserAuthed({user, authPermissions: customAuthPermissions || authPermissions, reqPermissions}),
                      }}>
                          <ThemeContext.Provider value={{theme, UI}}>
                                      <Layout navItems={[]} Menu={() => <DefaultMenu theme={theme} UI={UI}/>}>
                                          {children}
                                      </Layout>
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
                        type: props => <SourcePageSelector {...props} isDms={true} />,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:id/:page?/:view_id?`
                    }
                ]
            }
        ]
    }
}


export default [
    adminConfig,
    externalSourceConfig,
    internalSourceConfig

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
