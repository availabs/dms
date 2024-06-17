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

const configs = {
    page: pageConfigNew,
    form: formsConfig
}
export default async function dmsSiteFactory({
    dmsConfig,
    dmsPath = '/',
    adminPath = '/list',
    authWrapper = Component => Component,
    //dmsTheme = defaultTheme,
    theme,
    API_HOST = 'https://graph.availabs.org'
}) {
    const falcor = falcorGraph(API_HOST)
    console.log('1 - ', dmsConfig)
    let data = await dmsDataLoader(falcor, dmsConfig, `/`);
    

    const patterns = data.reduce((acc, curr) => [...acc, ...curr.patterns], []) || [];

    // call dmsPageFactory here assuming patterns are page type
    // export multiple routes based on patterns.
    return [
        dmsPageFactory({...dmsConfig, baseUrl: adminPath}),

        dmsPageFactory({
            ...patternConfig({
                app: dmsConfig.app,
                type: 'pattern',
                baseUrl: '/manage_pattern/'
            }),
            // baseUrl: '/manage_pattern'
        }),

        ...patterns.reduce((acc, pattern) => {
            const c = configs[pattern.pattern_type];

            acc.push(
                ...c.map(config => {
                    const configObj = config({
                        app: dmsConfig?.format?.app || dmsConfig.app,
                        // type: pattern.doc_type,
                        type: pattern.doc_type || pattern?.base_url?.replace(/\//g, ''),
                        baseUrl: pattern.base_url,
                        format: pattern?.config,
                        parent: pattern,
                        theme,
                        useFalcor,
                        API_HOST,
                        //rightMenu: <div>RIGHT</div>,
                    });
                    console.log('hosting', pattern.base_url, configObj)
                    return ({...dmsPageFactory(configObj, authWrapper)})
            }));

            return acc;
        }, []),



        // ...patterns
        //     .filter(pattern => pattern.pattern_type === 'form' && pattern.templates?.length)
        //     .reduce((acc, pattern) => {
        //         const config = configs[pattern.pattern_type];
        //         templateConfig.baseUrl = pattern.base_url
        //         const templates = pattern.templates.map(t => {
        //             console.log('template', t, pattern)
        //             templateConf.children.push({
        //                     type: (props) => (
        //                         <FormTemplateView
        //                             {...props}
        //                         />
        //                     ),
        //                     path: t.path,
        //                     action: "view"
        //                 })
        //             // host templates on url_slug
        //             // return ({
        //             //     ...dmsPageFactory(config({
        //             //         app: 'dms-site', //dmsConfig?.format?.app || dmsConfig.app,
        //             //         type: 'template', //pattern.doc_type || pattern?.base_url?.replace(/\//g, ''),
        //             //         format: JSON.stringify(template),
        //             //         // parent: pattern,
        //             //         theme: {
        //             //             navOptions: {
        //             //                 logo: (<Link to='/' className='h-12 flex px-4 items-center'>LOGO</Link>),
        //             //             }
        //             //         },
        //             //         useFalcor,
        //             //         API_HOST,
        //             //         //rightMenu: <div>RIGHT</div>,
        //             //         baseUrl: t.url_slug === '/' ? '' : t.url_slug,
        //             //     }), authWrapper),
        //             //     //path: `${pattern.base_url}/*`,
        //             // })
        //         })
        //
        //         acc.push(...templates)
        //         return acc
        //     }, [])

    ]
}

