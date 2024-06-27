import React, {useEffect, useState} from "react"
import {Link, useParams, useLocation, matchRoutes} from "react-router-dom";

// import TableComp from "./components/TableComp";
import {template} from "../admin/admin.format"

import PageEdit from "../page/pages/edit";
import {data} from "autoprefixer";
import defaultTheme from './theme/theme'

import TemplateView from './pages/view'
import TemplateEdit from './pages/edit'
import {updateAttributes, updateRegisteredFormats} from "../admin/siteConfig";
import {isJson} from "./components/selector";


export const FormsContext = React.createContext(undefined);
const defaultUser = { email: "user", authLevel: 5, authed: true, fake: true}

// for instances without auth turned on can edit
// should move this to dmsFactory default authWrapper


const FormTemplateView = ({apiLoad, apiUpdate, attributes, parent, params, format, dataItems=[],baseUrl,theme,edit=false,...rest}) => {
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

    // const children = [{
    //     type: () => {
    //     },
    //     action: 'list',
    //     path: '/',
    // }]

    // useEffect(() => {
    //     (async function (){
    //         const d = await apiLoad({
    //             app: parent.app,
    //             type,
    //             format: {...parent, type},
    //             attributes: parentConfigAttributes,
    //             children
    //         });
    //         setItems(d)
    //     })()
    // }, [])
    //
    // useEffect(() => {
    //     const matchedItem = itemId ? items.find(item => item.id == itemId) : items
    //     console.log('FormTemplateView items', itemId, matchedItem, items)
    //     setItem(matchedItem)
    // }, [itemId, items])
    

    if(!match.route) return <>No template found.</>
    

    return (

            <Comp
                item={match.route}
                dataItems={[]}
                apiLoad={apiLoad}
                apiUpdate={apiUpdate}
                format={{...parent, type}}
                attributes={attributes}
            />
    )
}



const formTemplateConfig = ({
    app, type, format, parent, title, baseUrl, API_HOST='https://graph.availabs.org', columns, theme=defaultTheme, checkAuth = () => {}
}) => {
    console.log('formTemplateConfig', app, type)
    const newformat = {...template}
    newformat.app = app;
    newformat.type = `template`;
   return ({
        app,
        type: `template`,
        // type: `${type}-template`,
        format: newformat,
        baseUrl,
        API_HOST,
        children: [
            {
                type: (props) => {
                    // use dataItems. use Parent Templates, and manually get the correct template.
                    // console.log('template format  !!!!', props.dataItems, props, parent)
                    return (
                        <FormsContext.Provider value={{baseUrl, user: props.user || defaultUser, theme, app, type, parent}}>
                            <FormTemplateView
                                format={newformat}
                                parent={parent}
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
                    // console.log('template format  !!!!', props.dataItems, props, parent)
                    return (
                        <FormsContext.Provider value={{baseUrl, user: props.user || defaultUser, theme, app, type, parent}}>
                            <FormTemplateView
                                parent={parent}
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
    })
}

export default [
    // siteConfig,
    formTemplateConfig,
];

