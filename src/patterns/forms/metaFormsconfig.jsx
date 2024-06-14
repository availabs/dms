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

const falcor = falcorGraph('https://graph.availabs.org')

const Layout = ({children, parentId, title, baseUrl, format,...rest}) => {
    // const params = useParams();
    const linkClass = 'inline-flex w-36 justify-center rounded-lg cursor-pointer text-sm font-semibold py-1 px-4 bg-blue-600 text-white hover:bg-blue-500 shadow-lg border border-b-4 border-blue-800 hover:border-blue-700 active:border-b-2 active:mb-[2px] active:shadow-none';
    const linkClassDisabled = 'pointer-events-none inline-flex w-36 justify-center rounded-lg cursor-pointer text-sm font-semibold py-1 px-4 bg-gray-600 text-white shadow-lg border border-b-4 border-gray-800'

    return (
        <div className='h-screen w-screen py-6'>
            <div className='bg-white h-fit shadow max-w-6xl mx-auto px-6'>
                <div className='flex items-center'>
                    <div className='text-2xl p-3 font-thin flex-1'>{title}</div>
                    <div className='px-1'>
                        <Link to={`${baseUrl}/item/new`} className={format.isBlank ? linkClassDisabled : linkClass}>
                            Create New
                        </Link>
                    </div>
                    <div className='px-1'>
                        <Link to={`${baseUrl}`} className={linkClass}>
                            Forms Home
                        </Link>
                    </div>
                    <div className='px-1'>
                        <Link to={`/manage_pattern/${parentId}`} className={linkClass}>
                            Manage Form
                        </Link>
                    </div>
                    <div className='px-1'>
                        <Link to={`/manage_pattern/${parentId}/templates`} className={linkClass}>
                            Manage Templates
                        </Link>
                    </div>
                </div>
                {children}
            </div>
        </div>
    )
}

const siteConfig = ({
    app, type, format, parent, title, baseUrl, columns, checkAuth = () => {}
                    }) => {
    console.log('is parent here?', parent)
    const newformat = JSON.parse(format || '{}')
    newformat.app = app;
    newformat.type = type;
    newformat.isBlank = !newformat?.attributes?.length;
    newformat.attributes = newformat.attributes || [{'name': 'name'}]

    return {
        app,
        type,
        baseUrl,
        format: newformat,
        // check: ({user}, activeConfig, navigate) => {
        //
        //     const getReqAuth = (configs) => {
        //         return configs.reduce((out, config) => {
        //             let authLevel = config.authLevel || -1
        //             if (config.children) {
        //                 authLevel = Math.max(authLevel, getReqAuth(config.children))
        //             }
        //             return Math.max(out, authLevel)
        //         }, -1)
        //     }
        //
        //     let requiredAuth = getReqAuth(activeConfig)
        //     checkAuth({user, authLevel: requiredAuth}, navigate)
        //
        // },
        children: [
            {
                type: (props) => <Layout parentId={parent?.id} {...props} title={title} baseUrl={baseUrl}/>,
                path: '/*',
                action: 'list',
                filter: {
                    fromIndex: path => path.split('/')[2],
                    toIndex: path => path.split('/')[3],
                    stopFullDataLoad: true
                },
                children: [
                    // {
                    //     type: ({dataItems, ...props}) => {
                    //         // use dataItems. use Parent Templates, and manually get the correct template.
                    //         console.log('props from list page of templates', dataItems, props, parent)
                    //         return <div>
                    //             {
                    //                 parent?.templates ? 'This form has templates. Create a list component.' :
                    //                     'No templates found. Please click on Manage Templates to begin.'
                    //             }
                    //         </div>
                    //     },
                    //     action: "list",
                    //     path: "/",
                    // },
                    {
                        type: props =>
                            <TableComp.ViewComp
                                data={props.dataItems}
                                columns={columns}
                                baseUrl={baseUrl}
                                app={app}
                                type={type}
                                {...props}
                            />,
                        action: "list",
                        path: "/",
                    },
                    {
                        type: props =>
                            <TableComp.EditComp
                                data={props.dataItems}
                                columns={columns}
                                baseUrl={baseUrl}
                                app={app}
                                type={type}
                                {...props}
                            />,
                        action: "list",
                        path: "/edit",
                    },
                    // {
                    //     type: "dms-form-view",
                    //     path: '/item/view/:id?',
                    //     action: 'view',
                    //     options: {
                    //         accessor: 'name'
                    //     }
                    //
                    // },
                    {
                        type: "dms-form-edit",
                        action: 'edit',
                        options: {
                            accessor: 'name'
                        },
                        filter: {type: 'new'},
                        path: '/item/new',
                        redirect: '/item/edit/:id?'
                    },
                    {
                        type: "dms-form-edit",
                        action: 'edit',
                        options: {
                            accessor: 'name'
                        },
                        path: '/item/edit/:id?'
                    }
                ]
            }
        ]
    }
}

const FormTemplateView = ({apiLoad, apiUpdate, parent, params, format, dataItems=[], ...rest}) => {
    const [items, setItems] = useState([]);
    const [item, setItem] = useState({});
    const p = useParams()
    const match = matchRoutes(dataItems.map(d => ({path:d.url_slug, ...d})), {pathname:`/${p["*"]}`})?.[0] || {};
    const itemId = match?.params?.id;
    const parentConfigAttributes = JSON.parse(parent?.config || '{}')?.attributes || [];
    const type = parent.doc_type || parent?.base_url?.replace(/\//g, '')

    console.log('params', match?.params?.id, match)
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
        console.log('items', itemId, matchedItem, items)
        setItem(matchedItem)
    }, [itemId, items])
    // fetch form items using parent.
    // load items using matched template.

    if(!match) return <>No template found.</>
    if(!itemId) return <>No Id found.</>

    return (<div>
        Form Template view. {item ? '1' : '0'} form item matches id {itemId}.
        there is {match ? 'a' : 'no'} template for this url.
    </div>)
}
const formTemplateConfig = ({
                                app, type, format, parent, title, baseUrl, columns, checkAuth = () => {}
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
        baseUrl: `${baseUrl}/templates`,
        children: [{
            type: (props) => (
                <FormTemplateView
                    parent={parent}
                    {...props}
                />
            ),
            path: `/*`,
            action: "list"
        }]
    })
}

export default [
    siteConfig,
    formTemplateConfig,
];