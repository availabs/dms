import React, {useEffect, useState} from "react"
import {Link, useParams, useLocation, matchRoutes} from "react-router-dom";
import merge from 'lodash/merge'
import cloneDeep from 'lodash/cloneDeep'
// import TableComp from "./components/TableComp";
import {template, pattern} from "../admin/admin.format"
import formsFormat, {source} from "./forms.format";

import defaultTheme from './theme/theme'
import DefaultMenu from './components/menu'


//--- Admin Pages
import ManageLayout from './pages/manage/layout'
import Dashboard from './pages/manage'
import Design from "./pages/manage/design";


import ManageMeta from "./pages/manage/metadata";
import ManageTemplates from "./pages/manage/templates";
import Validate from "./pages/validate";
import Overview from "./pages/overview";
import TableView from "./pages/table";
import UploadPage from "./pages/upload";
import PatternListComponent from "./components/selector/ComponentRegistry/patternListComponent";
import AvailLayout from "./ui/avail-layout";

// import {updateAttributes, updateRegisteredFormats} from "../admin/siteConfig";



export const FormsContext = React.createContext(undefined);
// for instances without auth turned on can edit
// move this to dmsFactory default authWrapper?
const defaultUser = { email: "user", authLevel: 5, authed: true, fake: true}





const formsAdminConfig = ({ 
    app, 
    type,
    siteType,
    parent,
    adminPath,
    title, 
    baseUrl,
    Menu=DefaultMenu,
    API_HOST='https://graph.availabs.org', 
    columns,
    logo,
    themes={ default: {} },
    pattern_type,
    checkAuth = () => {}
}) => {
    let theme = merge(cloneDeep(defaultTheme), cloneDeep(themes[pattern.theme_name] || themes.default), parent?.theme || {})
    baseUrl = baseUrl === '/' ? '' : baseUrl
    const defaultLogo = (
        <Link to={baseUrl || '/'} className='h-12 flex px-4 items-center'>
            <div className='rounded-full h-8 w-8 bg-blue-500 border-2 border-blue-300 hover:bg-blue-600' />
        </Link>
    )

    if(!theme.navOptions.logo) {
        theme.navOptions.logo = logo ? logo : defaultLogo
    }
    // for future use
    const patternFormatMapping = {
        // form: pattern,
        forms: formsFormat
    }
    const patternFormat = cloneDeep(patternFormatMapping[pattern_type]);
    patternFormat.app = app
    patternFormat.type = type
    patternFormat.registerFormats = updateRegisteredFormats(patternFormat.registerFormats, app, type) // update app for all the children formats. this works, but dms stops providing attributes to patternList
    patternFormat.attributes = updateAttributes(patternFormat.attributes, app, type) // update app for all the children formats. this works, but dms stops providing attributes to patternList

    // console.log('formsAdminConfig', patternFormat)
    return {
        siteType,
        format: patternFormat,
        baseUrl: `${baseUrl}/manage`,
        API_HOST,
        children: [
            {
                type: (props) => {
                  return (
                      <FormsContext.Provider value={{baseUrl: `${baseUrl}/manage`, user: props.user || defaultUser, theme, app, type, parent, Menu, API_HOST}}>
                        <AvailLayout secondNav={theme?.navOptions?.secondaryNav?.navItems || []}>
                            {props.children}
                        </AvailLayout>
                      </FormsContext.Provider>
                  )
                },
                action: "list",
                filter: {
                    stopFullDataLoad: true,
                    fromIndex: () => 0,
                    toIndex: () => 0,
                },
                path: "/*",
                children: [
                    { 
                        // sources list component on blank 
                         
                        // sources list component on blank 
                        type: props => <PatternListComponent.EditComp parent={parent} {...props} adminPath={adminPath}/>,
                        path: "",
                        action: "edit"
                    },

                    // {
                    //     type: props => <Overview.EditComp parent={parent} {...props} adminPath={adminPath}/>,
                    //     filter: {
                    //         stopFullDataLoad: true,
                    //         fromIndex: () => 0,
                    //         toIndex: () => 0,
                    //     },
                    //     action: 'edit',
                    //     path: `source/:id/overview`
                    // },
                    // {
                    //     type: props => <ManageMeta.EditComp parent={parent} {...props} adminPath={adminPath}/>,
                    //     filter: {
                    //         stopFullDataLoad: true,
                    //         fromIndex: () => 0,
                    //         toIndex: () => 0,
                    //     },
                    //     action: 'edit',
                    //     path: `source/:id/metadata`
                    // },
                    // {
                    //     type: props => <TableView parent={parent} {...props} adminPath={adminPath}/>,
                    //     filter: {
                    //         stopFullDataLoad: true,
                    //         fromIndex: () => 0,
                    //         toIndex: () => 0,
                    //     },
                    //     action: 'emetadatadit',
                    //     path: `source/:id/table`
                    // },
                    // {
                    //     type: props => <UploadPage parent={parent} {...props} adminPath={adminPath}/>,
                    //     filter: {
                    //         stopFullDataLoad: true,
                    //         fromIndex: () => 0,
                    //         toIndex: () => 0,
                    //     },
                    //     action: 'edit',
                    //     path: `source/:id/upload`
                    // },
                    // {
                    //     type: props => <Validate parent={parent} {...props} adminPath={adminPath}/>,
                    //     filter: {
                    //         stopFullDataLoad: true,
                    //         fromIndex: () => 0,
                    //         toIndex: () => 0,
                    //     },
                    //     action: 'edit',
                    //     path: `source/:id/validate`
                    // },
                    //
                    // {
                    //     // sources list component on blank
                    //     type: Dashboard,
                    //     path: "manage/",
                    //     action: "edit"
                    // },
                    // {
                    //     type: Design,
                    //     action: 'edit',
                    //     path: `manage/design`
                    // },
                    // // {
                    // //     type: props => <ManageForms.ViewComp {...props} />,
                    // //     action: 'view',
                    // //     path: `view/:id`
                    // // }
                ]
            }
        ]
    }
}


const formsSourceConfig = ({
    app,
    type,
    siteType,
    parent,
    adminPath,
    title,
    baseUrl,
    Menu=DefaultMenu,
    API_HOST='https://graph.availabs.org',
    columns,
    logo,
    themes={ default: {} },
    pattern_type,
    checkAuth = () => {}
}) => {
    let theme = merge(cloneDeep(defaultTheme), cloneDeep(themes[pattern.theme_name] || themes.default), parent?.theme || {})
    baseUrl = baseUrl === '/' ? '' : baseUrl
    const defaultLogo = (
        <Link to={baseUrl || '/'} className='h-12 flex px-4 items-center'>
            <div className='rounded-full h-8 w-8 bg-blue-500 border-2 border-blue-300 hover:bg-blue-600' />
        </Link>
    )

    if(!theme.navOptions.logo) {
        theme.navOptions.logo = logo ? logo : defaultLogo
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
        baseUrl: `${baseUrl}/manage/source`,
        API_HOST,
        children: [
            {
                type: (props) => {
                  return (
                      <FormsContext.Provider value={{baseUrl: `${baseUrl}/manage`, pageBaseUrl: `${baseUrl}/manage/source`, user: props.user || defaultUser, theme, app, type, parent, Menu, API_HOST}}>
                        <AvailLayout>
                            {props.children}
                        </AvailLayout>
                      </FormsContext.Provider>
                  )
                },
                action: "list",
                filter: {
                    stopFullDataLoad: true,
                    fromIndex: () => 0,
                    toIndex: () => 0,
                },
                path: "/*",
                children: [
                    {
                        type: props => <Overview.EditComp parent={parent} {...props} adminPath={adminPath}/>,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:id`
                    },
                    {
                        type: props => <ManageMeta.EditComp parent={parent} {...props} adminPath={adminPath}/>,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:id/metadata`
                    },
                    {
                        type: props => <TableView parent={parent} {...props} adminPath={adminPath}/>,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:id/table`
                    },
                    {
                        type: props => <UploadPage parent={parent} {...props} adminPath={adminPath}/>,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:id/upload`
                    },
                    {
                        type: props => <Validate parent={parent} {...props} adminPath={adminPath}/>,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:id/validate`
                    },

                    {
                        // sources list component on blank
                        type: Dashboard,
                        path: "manage/",
                        action: "edit"
                    },
                    {
                        type: Design,
                        action: 'edit',
                        path: `manage/design`
                    },
                ]
            }
        ]
    }
}


export default [
    formsAdminConfig,
    formsSourceConfig
    
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