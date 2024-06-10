import React from "react"
import {Link, useParams} from "react-router-dom";
import TableComp from "./components/TableComp";
import {
  falcorGraph,
  FalcorProvider
} from "@availabs/avl-falcor"

const falcor = falcorGraph('https://graph.availabs.org')

const Layout = ({children, title, baseUrl, format,...rest}) => {
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
                </div>
                {children}
            </div>
        </div>
    )
}

const siteConfig = ({
    app, type, format, title, baseUrl, columns, checkAuth = () => {}
                    }) => {
    console.log('format', format)
    const newformat = JSON.parse(format || '{}')
    newformat.app = app;
    newformat.type = type;
    newformat.isBlank = !newformat?.attributes?.length;
    newformat.attributes = newformat.attributes || [{'name': 'name'}]

    return {
        baseUrl,
        format: newformat,
        check: ({user}, activeConfig, navigate) => {

            const getReqAuth = (configs) => {
                return configs.reduce((out, config) => {
                    let authLevel = config.authLevel || -1
                    if (config.children) {
                        authLevel = Math.max(authLevel, getReqAuth(config.children))
                    }
                    return Math.max(out, authLevel)
                }, -1)
            }

            let requiredAuth = getReqAuth(activeConfig)
            checkAuth({user, authLevel: requiredAuth}, navigate)

        },
        children: [
            {
                type: (props) => <Layout {...props} title={title} baseUrl={baseUrl}/>,
                path: '/*',
                action: 'list',
                filter: {
                    fromIndex: path => path.split('/')[2],
                    toIndex: path => path.split('/')[3],
                    stopFullDataLoad: true
                },
                children: [
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
                    {
                        type: "dms-form-view",
                        path: '/item/view/:id?',
                        action: 'view',
                        options: {
                            accessor: 'name'
                        }

                    },
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

export default siteConfig;