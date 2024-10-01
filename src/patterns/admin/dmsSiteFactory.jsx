import React, {useState, useEffect} from 'react'
import { createBrowserRouter, RouterProvider } from "react-router-dom";

//import {  adminConfig } from "./modules/dms/src/"
import { dmsDataLoader, dmsPageFactory, registerDataType, Selector } from '../../'
import { falcorGraph, useFalcor } from "@availabs/avl-falcor"



import formsConfig from '../forms'
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

// --
// to do:
// Allow users to pass Pattern Configs
// --
const configs = {
    page: pageConfig,
    form: formsConfig,
    forms: formsConfig, // for future use.
}

registerDataType("selector", Selector)

export default async function dmsSiteFactory({
    dmsConfig,
    adminPath = '/list',
    authWrapper = Component => Component,
    themes = { default: {} },
    falcor,
    API_HOST = 'https://graph.availabs.org'
}) {
    let dmsConfigUpdated = {...dmsConfig};
    themes = themes?.default ? themes : { ...themes, default: {} }
    dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app)
    dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app)

    falcor = falcor || falcorGraph(API_HOST)
    let data = await dmsDataLoader(falcor, dmsConfigUpdated, `/`);

    const patterns = data.reduce((acc, curr) => [...acc, ...(curr?.patterns || [])], []) || [];
    let SUBDOMAIN = getSubdomain(window.location.host)
    SUBDOMAIN = SUBDOMAIN === 'hazardmitigation' ? '' : SUBDOMAIN
    //console.log('subdomain')

    // call dmsPageFactory here assuming patterns are page type
    // export multiple routes based on patterns.
    return [
        //pattern manager
        dmsPageFactory({
            ...dmsConfigUpdated, 
            baseUrl: adminPath, 
            API_HOST, 
            theme: themes['default']
        }),
        // patterns
        ...patterns.reduce((acc, pattern) => {
            //console.log('Patterns', pattern, SUBDOMAIN)
            if(pattern?.pattern_type && (!SUBDOMAIN || pattern.subdomain === SUBDOMAIN)){
                //console.log('add patterns', pattern, SUBDOMAIN)
                const c = configs[pattern.pattern_type];
                if(!c) return acc;
                //console.log('register pattern', pattern, theme)
                acc.push(
                    ...c.map(config => {
                        const configObj = config({
                            app: dmsConfigUpdated?.format?.app || dmsConfigUpdated.app,
                            // type: pattern.doc_type,
                            type: pattern.doc_type || pattern?.base_url?.replace(/\//g, ''),
                            baseUrl: `/${pattern.base_url?.replace(/^\/|\/$/g, '')}`, // only leading slash allowed
                            adminPath,
                            format: pattern?.config,
                            pattern: pattern,
                            pattern_type:pattern?.pattern_type,
                            parent: pattern,
                            authLevel: +pattern.authLevel || -1,
                            pgEnv:'hazmit_dama',
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

export function DmsSite ({
    dmsConfig,
    adminPath = '/list',
    authWrapper = Component => Component,
    themes = { default: {} },
    falcor,
    API_HOST = 'https://graph.availabs.org',
    routes = []
}) {
    //-----------
    // to do:
    // could save sites to localstorage cache clear on load.
    //-----------
    const [dynamicRoutes, setDynamicRoutes] = useState([]);
    useEffect(() => {
        (async function() {
            const dynamicRoutes = await dmsSiteFactory({
                dmsConfig,
                adminPath,
                themes,
                falcor,
                API_HOST,
                authWrapper
                //theme   
            });
            setDynamicRoutes(dynamicRoutes);
        })()
    }, []);


    const PageNotFoundRoute = {
        path: "/*",
        Component: () => (<div className={'w-screen h-screen flex items-center bg-blue-50'}>404</div>)
    }

    console.log('routes', routes, dynamicRoutes)

    return (
        <RouterProvider router={createBrowserRouter([
            ...dynamicRoutes,
            ...routes,
            PageNotFoundRoute
          ])} 
        />
    )
} 