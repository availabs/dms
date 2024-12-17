import React, {useEffect, useState} from "react"
import {Link, useParams, useLocation, matchRoutes} from "react-router-dom";
import { cloneDeep, merge } from "lodash-es"
// import TableComp from "./components/TableComp";
import {template, pattern} from "../admin/admin.format"
import formsFormat from "./forms.format";

import defaultTheme from './theme/theme'
import DefaultMenu from './components/menu'

//--- Tempalte Pages
import TemplateView from './pages/view'
import TemplateEdit from './pages/edit'

//--- Admin Pages
import ManageLayout from './pages/manage/layout'
import Dashboard from './pages/manage'
import ManageMeta from "./pages/manage/metadata";
//import ManageTemplates from "./pages/manage/templates";
import Validate from "./pages/validate";
import Design from "./pages/manage/design";
import Overview from "./pages/overview";
import TableView from "./pages/table";
import UploadPage from "./pages/upload";

// import {updateAttributes, updateRegisteredFormats} from "../admin/siteConfig";



export const FormsContext = React.createContext(undefined);
// for instances without auth turned on can edit
// move this to dmsFactory default authWrapper?
const defaultUser = { email: "user", authLevel: 5, authed: true, fake: true}



const formTemplateConfig = ({
    app, type, siteType, adminPath,
    format, 
    parent, 
    title, 
    Menu=DefaultMenu,
    baseUrl,
    API_HOST='https://graph.availabs.org', 
    columns,
    logo,
    themes = { default: {} },
    checkAuth = () => {}
}) => {
    //console.log('parent', parent)
    let theme = merge(cloneDeep(defaultTheme), cloneDeep(themes[pattern.theme_name] || themes.default), parent?.theme || {})
    //baseUrl = baseUrl[0] === '/' ? baseUrl.slice(1) : baseUrl
    const defaultLogo = <Link to={`${baseUrl}`} className='h-12 flex px-4 items-center'><div className='rounded-full h-8 w-8 bg-blue-500 border-2 border-blue-300 hover:bg-blue-600' /></Link>
  
    if(!theme.navOptions.logo) {
        theme.navOptions.logo = logo ? logo : defaultLogo
    }
    //console.log('formTemplateConfig', app, type)
    const templateFormat = cloneDeep(template);
    const newType = `${parent.doc_type}|template`
    templateFormat.app = app;
    templateFormat.type = newType;
    templateFormat.registerFormats = updateRegisteredFormats(templateFormat.registerFormats, app, newType) // update app for all the children formats. this works, but dms stops providing attributes to patternList
    templateFormat.attributes = updateAttributes(templateFormat.attributes, app, newType) // update app for all the children formats. this works, but dms stops providing attributes to patternList

    return {
        app,
        type: newType,
        siteType,
        format: templateFormat,
        baseUrl,
        API_HOST,
        children: [
            {
                type: (props) => {
                    // use dataItems. use Parent Templates, and manually get the correct template.
                    return (
                        <FormsContext.Provider value={{baseUrl, user: props.user || defaultUser, theme, app, type, parent, API_HOST, Menu}}>
                            <FormTemplateView
                                format={templateFormat}
                                parent={parent}
                                adminPath={adminPath}
                                {...props}
                            />
                        </FormsContext.Provider>
                    )
                },
                action: "list",
                path: "/*",
                children: [
                     {
                        type: () => <ManageLayout>OOOOk<Design {...props} /></ManageLayout>,
                        action: 'edit',
                        path: `test123`
                    },
                ]
            },
            {
                type: (props) => {
                    // use dataItems. use Parent Templates, and manually get the correct template.
                    return (
                        <FormsContext.Provider value={{baseUrl, user: props.user || defaultUser, theme, app, type, parent, API_HOST, Menu}}>
                            <FormTemplateView
                                parent={parent}
                                adminPath={adminPath}
                                edit={true}
                                {...props}
                            />
                        </FormsContext.Provider>
                    )
                },
                action: "list",
                path: "/edit/*",
            }
        ]
    }
}

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
        form: pattern,
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
                      <FormsContext.Provider value={{baseUrl, user: props.user || defaultUser, theme, app, type, parent, Menu, API_HOST}}>
                        <ManageLayout>
                            {props.children}
                        </ManageLayout>
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
                        type: Dashboard,
                        path: "",
                        action: "edit"
                    },
                    {
                        type: props => <Overview.EditComp parent={parent} {...props} adminPath={adminPath}/>,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `overview`
                    },
                    {
                        type: props => <ManageMeta.EditComp parent={parent} {...props} adminPath={adminPath}/>,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `metadata`
                    },
                    {
                        type: props => <TableView parent={parent} {...props} adminPath={adminPath}/>,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `table`
                    },
                    {
                        type: props => <UploadPage parent={parent} {...props} adminPath={adminPath}/>,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `upload`
                    },
                    {
                        type: props => <Validate parent={parent} {...props} adminPath={adminPath}/>,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `validate`
                    },
                    // {
                    //     type: props => <ManageTemplates.EditComp  parent={parent} {...props} adminPath={adminPath}/>,
                    //     filter: {
                    //         stopFullDataLoad: true,
                    //         fromIndex: () => 0,
                    //         toIndex: () => 0,
                    //     },
                    //     action: 'edit',
                    //     path: `templates`
                    // },
                    {
                        type: Design,
                        action: 'edit',
                        path: `design`
                    },
                    // {
                    //     type: props => <ManageForms.ViewComp {...props} />,
                    //     action: 'view',
                    //     path: `view/:id`
                    // }
                ]
            }
        ]
    }
}


export default [
    formTemplateConfig,
    formsAdminConfig
    
];


const FormTemplateView = ({apiLoad, apiUpdate, attributes, parent, params, format, adminPath, dataItems=[],baseUrl,theme,edit=false,...rest}) => {
    // const [items, setItems] = useState([]);
    // const [item, setItem] = useState({});
    const Comp = edit ? TemplateEdit : TemplateView;
    let p = useParams()
    if(edit) {
        p['*'] = p['*'].replace('edit/','');
    }

    //const match = matchRoutes(dataItems.map(d => ({path:d.url_slug, ...d})), {pathname:`/${p["*"]}`})?.[0] || {};
    const relatedTemplateIds = (parent?.templates || []).map(t => t.id);
    const match = matchRoutes(dataItems.filter(dI => relatedTemplateIds.includes(dI.id)).map(d => ({path:d.url_slug, ...d})), {pathname:`/${p["*"]}`})?.[0] || {};

    const itemId = match?.params?.id;
    const parentConfigAttributes = JSON.parse(parent?.config || '{}')?.attributes || [];
    const type = parent.doc_type || parent?.base_url?.replace(/\//g, '') 

    //if(!match.route) return <>No template found.</>
    return (

            <Comp
                item={match.route}
                dataItems={dataItems.filter(dI => relatedTemplateIds.includes(dI.id))}
                apiLoad={apiLoad}
                apiUpdate={apiUpdate}
                format={{...parent, type}}
                adminPath={adminPath}
                attributes={attributes}
            />
    )
}

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