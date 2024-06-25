import React from 'react'
import {useFalcor} from '@availabs/avl-falcor'
import {dmsDataLoader, dmsPageFactory,} from '../../index'
import pageConfigNew from '../page/siteConfig'
import {Link} from 'react-router-dom'
import formsConfig from '../forms/metaFormsconfig'
import patternConfig from "../forms/ManageFormsConfig";
import {template} from "./admin.format"
import {
    falcorGraph,
    FalcorProvider
} from "@availabs/avl-falcor"
import PageEdit from "../page/pages/edit";
import {updateAttributes, updateRegisteredFormats} from "./siteConfig";

const configs = {
    page: pageConfigNew,
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
        dmsPageFactory({...dmsConfigUpdated, baseUrl: adminPath, API_HOST}),

        dmsPageFactory({
            ...patternConfig({
                app: dmsConfigUpdated.app,
                type: 'pattern',
                baseUrl: '/manage_pattern/',
                API_HOST   
            }),
            // baseUrl: '/manage_pattern'
        }),

        ...patterns.reduce((acc, pattern) => {
            const c = configs[pattern.pattern_type];

            acc.push(
                ...c.map(config => {
                    const configObj = config({
                        app: dmsConfigUpdated?.format?.app || dmsConfigUpdated.app,
                        // type: pattern.doc_type,
                        type: pattern.doc_type || pattern?.base_url?.replace(/\//g, ''),
                        baseUrl: pattern.base_url,
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

