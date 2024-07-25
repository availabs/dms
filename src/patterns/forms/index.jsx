import React, {useEffect, useState} from "react"
import {Link, useParams, useLocation, matchRoutes} from "react-router-dom";
import merge from 'lodash/merge'
import cloneDeep from 'lodash/cloneDeep'
// import TableComp from "./components/TableComp";
import {template, pattern} from "../admin/admin.format"


import defaultTheme from './theme/theme'

//--- Tempalte Pages
import TemplateView from './pages/view'
import TemplateEdit from './pages/edit'

//--- Admin Pages
import ManageForms from "./pages/ManageForms";
import ManageTemplates from "./pages/ManageTemplates";

import {updateAttributes, updateRegisteredFormats} from "../admin/siteConfig";


export const FormsContext = React.createContext(undefined);
// for instances without auth turned on can edit
// move this to dmsFactory default authWrapper?
const defaultUser = { email: "user", authLevel: 5, authed: true, fake: true}



const formTemplateConfig = ({
    app, type, adminPath,
    format, 
    parent, 
    title, 
    baseUrl, 
    API_HOST='https://graph.availabs.org', 
    columns,
    logo,
    theme=defaultTheme, 
    checkAuth = () => {}
}) => {
    theme = merge(defaultTheme, theme)
    //baseUrl = baseUrl[0] === '/' ? baseUrl.slice(1) : baseUrl
    const defaultLogo = <Link to={`${baseUrl}`} className='h-12 flex px-4 items-center'><div className='rounded-full h-8 w-8 bg-blue-500 border-2 border-blue-300 hover:bg-blue-600' /></Link>
  
    if(!theme.navOptions.logo) {
        theme.navOptions.logo = logo ? logo : defaultLogo
    }
    //console.log('formTemplateConfig', app, type)
    const templateFormat = {...template}
    templateFormat.app = app;
    templateFormat.type = `template`;
    //console.log('adminpath index', adminPath)
    return {
        app,
        type: `template`,
        format: templateFormat,
        baseUrl,
        API_HOST,
        children: [
            {
                type: (props) => {
                    // use dataItems. use Parent Templates, and manually get the correct template.
                    return (
                        <FormsContext.Provider value={{baseUrl, user: props.user || defaultUser, theme, app, type, parent}}>
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
            },
            {
                type: (props) => {
                    // use dataItems. use Parent Templates, and manually get the correct template.
                    return (
                        <FormsContext.Provider value={{baseUrl, user: props.user || defaultUser, theme, app, type, parent}}>
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
    parent, 
    title, 
    baseUrl, 
    API_HOST='https://graph.availabs.org', 
    columns,
    logo,
    theme=defaultTheme, 
    checkAuth = () => {}
}) => {
    theme = merge(defaultTheme, theme)
    //baseUrl = baseUrl[0] === '/' ? baseUrl.slice(1) : baseUrl
    const defaultLogo = <Link to={`${baseUrl}`} className='h-12 flex px-4 items-center'><div className='rounded-full h-8 w-8 bg-blue-500 border-2 border-blue-300 hover:bg-blue-600' /></Link>

    if(!theme.navOptions.logo) {
        theme.navOptions.logo = logo ? logo : defaultLogo
    }
    const patternFormat = cloneDeep(pattern)
    patternFormat.app = app
    patternFormat.type = type
    patternFormat.registerFormats = updateRegisteredFormats(patternFormat.registerFormats, app) // update app for all the children formats. this works, but dms stops providing attributes to patternList
    patternFormat.attributes = updateAttributes(patternFormat.attributes, app) // update app for all the children formats. this works, but dms stops providing attributes to patternList
    console.log('formsAdminConfig', parent)
    return {
        format: patternFormat,
        baseUrl: `${baseUrl}/manage`,
        API_HOST,
        children: [
            {
                type: (props) => {
                  return (
                      <FormsContext.Provider value={{baseUrl, user: props.user || defaultUser, theme, app, type, parent}}>
                        {props.children}
                      </FormsContext.Provider>
                  )
                },
                action: "list",
                path: "/*",
                children: [
                    {
                        type: props => <ManageForms.EditComp parent={parent} {...props} />,
                        action: 'edit',
                        path: `attributes`
                    },
                    {
                        type: props => <ManageTemplates.EditComp  parent={parent} {...props} />,
                        action: 'edit',
                        path: `templates`
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
    // siteConfig,
    formsAdminConfig,
    formTemplateConfig,
    
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
                dataItems={dataItems}
                apiLoad={apiLoad}
                apiUpdate={apiUpdate}
                format={{...parent, type}}
                adminPath={adminPath}
                attributes={attributes}
            />
    )
}