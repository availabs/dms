import React from 'react'
// import {} from '@availabs/avl-falcor'
import {dmsDataLoader, dmsPageFactory,} from '../../index'
import {Link} from 'react-router-dom'
import { falcorGraph, useFalcor } from "@availabs/avl-falcor"


import formsConfig from '../forms'
import pageConfig from '../page/siteConfig'
//import {template} from "./admin.format"


const getSubdomain = (host) => {
    // ---
    // takes window.location.host and returns subdomain
    // only works with single depth subdomains 
    // ---
    // console.log('host', host);
    return host.split('.').length > 2 ?
    window.location.host.split('.')[0].toLowerCase() : 
    // host.split('.').length > 1 ?  
    //     window.location.host.split('.')[0].toLowerCase() :  
        false
}

import {updateAttributes, updateRegisteredFormats} from "./siteConfig";

const configs = {
    page: pageConfig,
    form: formsConfig
}
export default async function dmsSiteFactory({
    dmsConfig,
    adminPath = '/list',
    authWrapper = Component => Component,
    themes = { default: {} },
    API_HOST = 'https://graph.availabs.org'
}) {
    let dmsConfigUpdated = {...dmsConfig};
    themes = themes?.default ? themes : { ...themes, default: {} }
    dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app)
    dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app)

    const falcor = falcorGraph(API_HOST)
    let data = await dmsDataLoader(falcor, dmsConfigUpdated, `/`);

    const patterns = data.reduce((acc, curr) => [...acc, ...(curr?.patterns || [])], []) || [];
    const SUBDOMAIN = getSubdomain(window.location.host)
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
                            parent: pattern,
                            authLevel: +pattern.authLevel || -1,
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

