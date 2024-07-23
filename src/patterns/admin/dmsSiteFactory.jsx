import React from 'react'
import {} from '@availabs/avl-falcor'
import {dmsDataLoader, dmsPageFactory,} from '../../index'
import {Link} from 'react-router-dom'
import { falcorGraph, useFalcor } from "@availabs/avl-falcor"


import formsConfig from '../forms'
import pageConfig from '../page/siteConfig'
import {template} from "./admin.format"


import {updateAttributes, updateRegisteredFormats} from "./siteConfig";

const configs = {
    page: pageConfig,
    form: formsConfig
}
export default async function dmsSiteFactory({
    dmsConfig,
    adminPath = '/list',
    authWrapper = Component => Component,
    //dmsTheme = defaultTheme,
    theme,
    API_HOST = 'https://graph.availabs.org'
}) {
    let dmsConfigUpdated = {...dmsConfig};
    dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app)
    dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app)

    const falcor = falcorGraph(API_HOST)
    let data = await dmsDataLoader(falcor, dmsConfigUpdated, `/`);

    const patterns = data.reduce((acc, curr) => [...acc, ...(curr?.patterns || [])], []) || [];

    // call dmsPageFactory here assuming patterns are page type
    // export multiple routes based on patterns.
    return [
        //pattern manager
        dmsPageFactory({
            ...dmsConfigUpdated, 
            baseUrl: adminPath, 
            API_HOST, 
            theme
        }),
        // patterns
        ...patterns.reduce((acc, pattern) => {
            const c = configs[pattern.pattern_type];

            console.log('register pattern', pattern, `/${pattern.base_url?.replace(/\//g, '')}`, pattern.base_url)

            acc.push(
                ...c.map(config => {
                    const configObj = config({
                        app: dmsConfigUpdated?.format?.app || dmsConfigUpdated.app,
                        // type: pattern.doc_type,
                        type: pattern.doc_type || pattern?.base_url?.replace(/\//g, ''),
                        baseUrl: pattern.base_url, // only leading slash allowed
                        adminPath,
                        format: pattern?.config,
                        parent: pattern,
                        authLevel: +pattern.authLevel || -1,
                        theme,
                        useFalcor,
                        API_HOST,
                        //rightMenu: <div>RIGHT</div>,
                    });
                    return ({...dmsPageFactory(configObj, authWrapper)})
            }));

            return acc;
        }, []),
    ]
}

