import React, {useState, useEffect} from 'react'
import {createBrowserRouter, RouterProvider, useRouteError} from "react-router";

//import {  adminConfig } from "./modules/dms/src/"
import { dmsDataLoader, dmsPageFactory } from '../../'
import { falcorGraph, useFalcor } from "@availabs/avl-falcor"
import { cloneDeep } from "lodash-es"

import pageConfig from '../page/siteConfig'
import dataManagerConfig from '../forms/siteConfig'; // meta level forms config. this "pattern" serves as parent for all forms.
import {updateAttributes, updateRegisteredFormats} from "./siteConfig";
import authConfig from "../auth/siteConfig"
import {useLocation} from "react-router";
import {getUser} from "./utils";

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

function RootErrorBoundary() {
    const error = useRouteError();
    console.error(error);

    return (
        <div>
            <h1>Oops! Something went wrong.</h1>
            <p>{error.statusText || error.message}</p>
        </div>
    );
}

// --
// to do:
// Allow users to pass Pattern Configs
// --
//console.log('hola', pageConfig)
const configs = {
    page: pageConfig ,
    forms: dataManagerConfig,
    auth: authConfig
}

function pattern2routes (siteData, props) {
    let {
        dmsConfig,
        adminPath = '/list',
        authWrapper = Component => Component,
        themes = { default: {} },
        pgEnvs = ['hazmit_dama'],
        falcor,
        API_HOST = 'https://graph.availabs.org',
        AUTH_HOST,
        PROJECT_NAME,
        user, setUser,
        damaBaseUrl
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
            dmsConfig: {
                ...dmsConfigUpdated,
                siteType: dmsConfigUpdated.type,
                baseUrl: SUBDOMAIN === 'admin' ?  '/' : adminPath,
                API_HOST,
                PROJECT_NAME,
                user,
                theme: themes['default'],
                pgEnvs
            },
            authWrapper,
            user,
            ErrorBoundary: RootErrorBoundary
        }),
        // patterns
        ...patterns.reduce((acc, pattern) => {
            // console.log('Patterns', pattern.doc_type, pattern.name, pattern.base_url, pattern.subdomain, SUBDOMAIN, (!SUBDOMAIN && !pattern.subdomain)  || pattern.subdomain === SUBDOMAIN || pattern.subdomain === '*')
            if(pattern?.pattern_type && ((!SUBDOMAIN && !pattern.subdomain) || pattern.subdomain === SUBDOMAIN || pattern.subdomain === '*')){
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
                            authPermissions: JSON.parse(pattern?.authPermissions || "{}"),
                            pgEnv:pgEnvs?.[0] || '',
                            themes,
                            useFalcor,
                            API_HOST,
                            AUTH_HOST,
                            PROJECT_NAME,
                            user,
                            setUser,
                            damaBaseUrl
                        });
                        return ({...dmsPageFactory({
                                dmsConfig: configObj,
                                authWrapper,
                                user,
                                isAuth: pattern.pattern_type === 'auth',
                                ErrorBoundary: RootErrorBoundary
                            })})
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
        API_HOST = 'https://graph.availabs.org',
    } = props

    let dmsConfigUpdated = cloneDeep(dmsConfig);
    dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app)
    dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app)

    falcor = falcor || falcorGraph(API_HOST)
    // console.time('load routes')
    let data = await dmsDataLoader(falcor, dmsConfigUpdated, `/`);
    // console.timeEnd('load routes')
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
    AUTH_HOST= 'https://graph.availabs.org',
    PROJECT_NAME,
    damaBaseUrl,
    routes = []
}) {
    //-----------
    // to do:
    // could save sites to localstorage cache clear on load.
    //-----------
    const [user, setUser] = useState({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        async function load (){
            const user = await getUser(AUTH_HOST, PROJECT_NAME);
            setUser(user || {});
        }
        load();
    }, []);

    const [dynamicRoutes, setDynamicRoutes] = useState(
        defaultData ?
            pattern2routes(defaultData, {
                dmsConfig,
                adminPath,
                themes,
                falcor,
                API_HOST,
                AUTH_HOST,
                PROJECT_NAME,
                user,
                setUser,
                authWrapper,
                pgEnvs,
                damaBaseUrl
                //theme
            })
            : []
        );
    
    useEffect(() => {
        let isStale = false;
        async function load () {
            setLoading(true)
            // console.time('dmsSiteFactory')
            const dynamicRoutes = await dmsSiteFactory({
                dmsConfig,//adminConfig
                adminPath,
                themes,
                falcor,
                API_HOST,
                AUTH_HOST,
                PROJECT_NAME,
                user,
                setUser,
                authWrapper,
                pgEnvs,
                damaBaseUrl
                //theme
            });
            // console.timeEnd('dmsSiteFactory')
            //console.log('dynamicRoutes ', dynamicRoutes)
            if(!isStale) {
                setDynamicRoutes(dynamicRoutes);
                setLoading(false);
            }
        }

        load()

        return () => {
            isStale = true
        }
    }, [user]);


    const PageNotFoundRoute = {
        path: "/*",
        Component: () => loading ?
            <div className={'w-screen h-screen mx-auto flex items-center justify-center'}>loading...</div>
        : <div className={'w-screen h-screen mx-auto flex items-center justify-center'}>404</div>
    }

    const routesWithErrorBoundary = routes.map(c => {
        if (!c.errorElement) {
            c.errorElement = <RootErrorBoundary />
        }
        return c
    });

    return (
        <RouterProvider router={
            createBrowserRouter(
                [
                    ...dynamicRoutes,
                    ...routesWithErrorBoundary,
                    PageNotFoundRoute
                ]
            )}
        />
    )
} 