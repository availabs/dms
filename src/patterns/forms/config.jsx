import React, {useEffect, useState} from "react"
import {dmsDataLoader} from "../../api/index"
import {formsConfigFormat} from "./forms.format";
import {Layout} from "./components/Layout.jsx";
import TableComp from "./components/TableComp";
import {
  falcorGraph,
  FalcorProvider
} from "@availabs/avl-falcor"

const falcor = falcorGraph('https://graph.availabs.org')

const defaultConfig = JSON.stringify({
    app: 'default-app',
    type: 'test-forms',
    attributes: [
        {
            "name": "name",
            "display_name": "Name",
            "type": "text"
        },
    ]
})
const siteConfig = ({
    app, type, title, baseUrl, columns, checkAuth = () => {}
                    }) => ({
    baseUrl,
    formatFn: async () => {
        const formConfigs = await dmsDataLoader(
            falcor,
            {
                format: formsConfigFormat,
                children: [
                    {
                        type: () => {
                        },
                        action: 'list',
                        path: '/',
                    }
                ]
            }, '/');

        const config = formConfigs.find(fc => {
            const config = JSON.parse(fc?.config || '{}');
            return config.app === app && config.type === type;
        });

        return {...JSON.parse(config?.config || defaultConfig), id: config?.id};
    },
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
                        <TableComp.EditComp
                            data={props.dataItems}
                            columns={columns}
                            baseUrl={baseUrl}
                            app={app}
                            type={type}
                            {...props}
                        />,
                    action: "",
                    path: "/list/",
                },
                {
                    type: "dms-form-view",
                    path: '/view/:id?',
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
                    path: '/new',
                    redirect: '/edit/:id?'
                },
                {
                    type: "dms-form-edit",
                    action: 'edit',
                    options: {
                        accessor: 'name'
                    },
                    path: '/edit/:id?'
                }
            ]
        }
    ]
})

export default siteConfig;