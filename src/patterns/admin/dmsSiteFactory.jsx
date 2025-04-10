import React, {useState, useEffect} from 'react'
import {createBrowserRouter, Outlet, RouterProvider} from "react-router-dom";

//import {  adminConfig } from "./modules/dms/src/"
import { dmsDataLoader, dmsPageFactory, registerDataType } from '../../'
import Selector from '../../patterns/page/ui/dataComponents/selector'
import { falcorGraph, useFalcor } from "@availabs/avl-falcor"
import { cloneDeep } from "lodash-es"


import dataManagerConfig from '../forms/siteConfig'; // meta level forms config. this "pattern" serves as parent for all forms.

import pageConfig from '../page/siteConfig'
//import {template} from "./admin.format"


const getSubdomain = (host) => {
    // ---
    // takes window.location.host and returns subdomain
    // only works with single depth subdomains 
    // ---
    //console.log('host', host,  host.split('.'));
    if (process.env.NODE_ENV === "development") {
        return host.split('.').length >= 2 ?
            window.location.host.split('.')[0].toLowerCase() :
                false
    } else {
        return host.split('.').length > 2 ?
            window.location.host.split('.')[0].toLowerCase() :
                false
    }
}

import {updateAttributes, updateRegisteredFormats} from "./siteConfig";
import {useLocation} from "react-router";

// --
// to do:
// Allow users to pass Pattern Configs
// --
const configs = {
    page: pageConfig,
    forms: dataManagerConfig,
}

registerDataType("selector", Selector)


function pattern2routes (siteData, props) {
    let {
        dmsConfig,
        adminPath = '/list',
        authWrapper = Component => Component,
        themes = { default: {} },
        pgEnvs = ['hazmit_dama'],
        falcor,
        API_HOST = 'https://graph.availabs.org'
    } = props

    const patterns = siteData.reduce((acc, curr) => [...acc, ...(curr?.patterns || [])], []) || [];
    let SUBDOMAIN = getSubdomain(window.location.host)
    // for weird double subdomain tld
    SUBDOMAIN = SUBDOMAIN === 'hazardmitigation' ? '' : SUBDOMAIN
    
    themes = themes?.default ? themes : { ...themes, default: {} }
    
    let dmsConfigUpdated = cloneDeep(dmsConfig);
    dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app)
    dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app)


    return [
        //pattern manager
        dmsPageFactory({
            ...dmsConfigUpdated,
            siteType: dmsConfigUpdated.type,
            baseUrl: SUBDOMAIN === 'admin' ?  '/' : adminPath,
            authLevel: 1,
            API_HOST, 
            theme: themes['default']
        },authWrapper),
        // default Data manager
        // ...dataManagerConfig.map(config => {
        //     const configObj = config({
        //         app: dmsConfigUpdated.app,
        //         type:`${dmsConfigUpdated.app}-datasets`,
        //         siteType: dmsConfigUpdated?.format?.type || dmsConfigUpdated.type,
        //         baseUrl: `/datasets`, // only leading slash allowed
        //         adminPath,
        //         authLevel: 1,
        //         pgEnv:pgEnvs?.[0] || '',
        //         themes,
        //         useFalcor,
        //         API_HOST,
        //         //rightMenu: <div>RIGHT</div>,
        //     });
        //     return ({...dmsPageFactory(configObj, authWrapper)})
        // }),

        // default data manager
        // dmsPageFactory({
        //     app: dmsConfigUpdated.app,
        //     type:`${dmsConfigUpdated.app}-${datasets}`,
        //     siteType: dmsConfigUpdated.type,
        //     baseUrl: '/datasets',
        //     authLevel: 1,
        //     API_HOST, 
        //     theme: themes['default']
        // },authWrapper),
        // patterns
        ...patterns.reduce((acc, pattern) => {
            //console.log('Patterns', pattern, SUBDOMAIN)
            if(pattern?.pattern_type && (!SUBDOMAIN || pattern.subdomain === SUBDOMAIN || pattern.subdomain === '*')){
                //console.log('add patterns', pattern, SUBDOMAIN)
                const c = configs[pattern.pattern_type];
                if(!c) return acc;
                //console.log('register pattern', pattern.id, pattern)
                acc.push(
                    ...c.map(config => {
                        const configObj = config({
                            app: dmsConfigUpdated?.format?.app || dmsConfigUpdated.app,
                            // type: pattern.doc_type,
                            type: pattern.doc_type || pattern?.base_url?.replace(/\//g, ''),
                            siteType: dmsConfigUpdated?.format?.type || dmsConfigUpdated.type,
                            baseUrl: `/${pattern.base_url?.replace(/^\/|\/$/g, '')}`, // only leading slash allowed
                            adminPath,
                            format: pattern?.config,
                            pattern: pattern,
                            pattern_type:pattern?.pattern_type,
                            authLevel: +pattern.authLevel || -1,
                            pgEnv:pgEnvs?.[0] || '',
                            themes,
                            useFalcor,
                            API_HOST,
                            //rightMenu: <div>RIGHT</div>,
                        });
                        return ({...dmsPageFactory(configObj, authWrapper)})
                }));
            }
            return acc;
        }, []),
    ]
}

export default async function dmsSiteFactory(props) {
    let {
        dmsConfig,
        falcor,
        API_HOST = 'https://graph.availabs.org'
    } = props

    let dmsConfigUpdated = cloneDeep(dmsConfig);
    dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app)
    dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app)

    falcor = falcor || falcorGraph(API_HOST)
    console.time('load routes')
    let data = await dmsDataLoader(falcor, dmsConfigUpdated, `/`);
    console.timeEnd('load routes')
    //console.log('data -- get site data here', data)

    return pattern2routes(data, props)
}

export function DmsSite ({
    dmsConfig,
    defaultData,
    adminPath = '/list',
    authWrapper = Component => Component,
    themes = { default: {} },
    falcor,
    pgEnvs=['hazmit_dama'],
    API_HOST = 'https://graph.availabs.org',
    routes = []
}) {
    //-----------
    // to do:
    // could save sites to localstorage cache clear on load.
    //-----------
    const [dynamicRoutes, setDynamicRoutes] = useState(
        defaultData ? 
            pattern2routes(defaultData, {
                dmsConfig,
                adminPath,
                themes,
                falcor,
                API_HOST,
                authWrapper,
                pgEnvs
                //theme   
            }) 
            : []
        );
    
    useEffect(() => {
        (async function() {
            console.time('dmsSiteFactory')
            const dynamicRoutes = await dmsSiteFactory({
                dmsConfig,
                adminPath,
                themes,
                falcor,
                API_HOST,
                authWrapper,
                pgEnvs
                //theme   
            });
            console.timeEnd('dmsSiteFactory')
            //console.log('dynamicRoutes ', dynamicRoutes)
            setDynamicRoutes(dynamicRoutes);
        })()
    }, []);


    const PageNotFoundRoute = {
        path: "/*",
        Component: () => (<div className={'w-screen h-screen flex items-center bg-blue-50'}>404</div>)
    }

    //console.log('routes',  dynamicRoutes)

    return (
        <RouterProvider router={createBrowserRouter([
            ...dynamicRoutes,
            ...routes,
            PageNotFoundRoute
          ])}
        />
    )
} 