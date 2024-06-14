import React, {useEffect, useState} from "react"
import {Link, useParams, useLocation, matchRoutes} from "react-router-dom";

import TableComp from "./components/TableComp";
import {template} from "../admin/admin.format"
import {
  falcorGraph,
  FalcorProvider
} from "@availabs/avl-falcor"
import PageEdit from "../page/pages/edit";
import {data} from "autoprefixer";
import defaultTheme from './theme/theme'

import TemplateView from './pages/view'

const falcor = falcorGraph('https://graph.availabs.org')
export const FormsContext = React.createContext(undefined);
const defaultUser = { email: "user", authLevel: 5, authed: true, fake: true}

// for instances without auth turned on can edit
// should move this to dmsFactory default authWrapper


const FormTemplateView = ({apiLoad, apiUpdate, parent, params, format, dataItems=[],baseUrl,theme,edit=false,...rest}) => {
    const [items, setItems] = useState([]);
    const [item, setItem] = useState({});
    let p = useParams()
    if(edit) {p['*'] = p['*'].replace('edit/','')}

    console.log('params', p)
    const match = matchRoutes(dataItems.map(d => ({path:d.url_slug, ...d})), {pathname:`/${p["*"]}`})?.[0] || {};
    const itemId = match?.params?.id;
    const parentConfigAttributes = JSON.parse(parent?.config || '{}')?.attributes || [];
    const type = parent.doc_type || parent?.base_url?.replace(/\//g, '')

    console.log('params---------------------', match?.params?.id, match)
    console.log('dataItems', dataItems, 'urls', dataItems.map(d=> d.url_slug))
    

    const children = [{
        type: () => {
        },
        action: 'list',
        path: '/',
    }]

    useEffect(() => {
        (async function (){
            const d = await apiLoad({
                app: parent.app,
                type,
                format: {...parent, type},
                attributes: parentConfigAttributes,
                children
            });
            console.log('d?', d)
            setItems(d)
        })()
    }, [])

    useEffect(() => {
        const matchedItem = itemId ? items.find(item => item.id == itemId) : items
        //console.log('items', itemId, matchedItem, items)
        setItem(matchedItem)
    }, [itemId, items])
    // fetch form items using parent.
    // load items using matched template.

    if(!match) return <>No template found.</>
    // if(!itemId) return <>No Id found.</>

    return (
       
            <TemplateView
                item={match.route}
            />  
    )
}



const formTemplateConfig = ({
    app, type, format, parent, title, baseUrl, columns, theme=defaultTheme, checkAuth = () => {}
}) => {
    const newformat = {...template}
    newformat.app = app;
    newformat.type = `template`;
    // newformat.type = `${type}-template`;
    console.log('parent', parent)
   return ({
        app,
        type: `template`,
        // type: `${type}-template`,
        format: newformat,
        baseUrl,
        children: [
            {
                type: (props) => {
                    // use dataItems. use Parent Templates, and manually get the correct template.
                    console.log('template format  !!!!', props.dataItems, props, parent)
                    return (
                        <FormsContext.Provider value={{baseUrl, user: props.user || defaultUser, theme, app, type, theme, parent}}>
                                
                            <FormTemplateView
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
                    console.log('template format  !!!!', props.dataItems, props, parent)
                    return (
                        <FormsContext.Provider value={{baseUrl, user: props.user || defaultUser, theme, app, type, theme, parent}}>
                                
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
            },


        ]
    })
}

export default [
    // siteConfig,
    formTemplateConfig,
];

// const siteConfig = ({
//     app, type, format, parent, title, baseUrl, columns, checkAuth = () => {}
//                     }) => {
//     console.log('is parent here?', parent)
//     const newformat = JSON.parse(format || '{}')
//     newformat.app = app;
//     newformat.type = type;
//     newformat.isBlank = !newformat?.attributes?.length;
//     newformat.attributes = newformat.attributes || [{'name': 'name'}]

//     return {
//         app,
//         type,
//         baseUrl: `${baseUrl}/edit`,
//         format: newformat,
//         // check: ({user}, activeConfig, navigate) => {
//         //
//         //     const getReqAuth = (configs) => {
//         //         return configs.reduce((out, config) => {
//         //             let authLevel = config.authLevel || -1
//         //             if (config.children) {
//         //                 authLevel = Math.max(authLevel, getReqAuth(config.children))
//         //             }
//         //             return Math.max(out, authLevel)
//         //         }, -1)
//         //     }
//         //
//         //     let requiredAuth = getReqAuth(activeConfig)
//         //     checkAuth({user, authLevel: requiredAuth}, navigate)
//         //
//         // },
//         children: [
//             {
//                 type: (props) => <Layout parentId={parent?.id} {...props} title={title} baseUrl={baseUrl}/>,
//                 path: '/*',
//                 action: 'list',
//                 filter: {
//                     fromIndex: path => path.split('/')[2],
//                     toIndex: path => path.split('/')[3],
//                     stopFullDataLoad: true
//                 },
//                 children: [
//                     {
//                         type: ({dataItems, ...props}) => {
//                             // use dataItems. use Parent Templates, and manually get the correct template.
//                             console.log('props from list page of templates', dataItems, props, parent)
//                             return <div>
//                                 {
//                                     parent?.templates ? `This form has ${parent?.templates?.length || 0} templates. Create a list component.` :
//                                         'No templates found. Please click on Manage Templates to begin.'
//                                 }
//                             </div>
//                         },
//                         action: "list",
//                         path: "/edit",
//                     },
//                     // {
//                     //     type: props =>
//                     //         <TableComp.ViewComp
//                     //             data={props.dataItems}
//                     //             columns={columns}
//                     //             baseUrl={baseUrl}
//                     //             app={app}
//                     //             type={type}
//                     //             {...props}
//                     //         />,
//                     //     action: "list",
//                     //     path: "/",
//                     // },
//                     {
//                         type: props =>
//                             <TableComp.EditComp
//                                 data={props.dataItems}
//                                 columns={columns}
//                                 baseUrl={baseUrl}
//                                 app={app}
//                                 type={type}
//                                 {...props}
//                             />,
//                         action: "list",
//                         path: "/edit",
//                     },
//                     // {
//                     //     type: "dms-form-view",
//                     //     path: '/item/view/:id?',
//                     //     action: 'view',
//                     //     options: {
//                     //         accessor: 'name'
//                     //     }
//                     //
//                     // },
//                     {
//                         type: "dms-form-edit",
//                         action: 'edit',
//                         options: {
//                             accessor: 'name'
//                         },
//                         filter: {type: 'new'},
//                         path: '/item/new',
//                         redirect: '/item/edit/:id?'
//                     },
//                     {
//                         type: "dms-form-edit",
//                         action: 'edit',
//                         options: {
//                             accessor: 'name'
//                         },
//                         path: '/item/edit/:id?'
//                     }
//                 ]
//             }
//         ]
//     }
// }