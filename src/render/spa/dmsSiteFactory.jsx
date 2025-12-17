import React, {useState, useEffect} from 'react'
import { createBrowserRouter, RouterProvider, useRouteError } from "react-router";
import { falcorGraph, useFalcor } from "@availabs/avl-falcor"
import { cloneDeep } from "lodash-es"

import { dmsDataLoader, dmsPageFactory } from '../../'

import patternTypes from '../../patterns'
import { updateAttributes, updateRegisteredFormats } from "../../patterns/admin/siteConfig";

import { withAuth, authProvider } from '../../patterns/auth/context';
import { parseIfJSON } from '../../patterns/page/pages/_utils';

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


function pattern2routes (siteData, props) {
    let {
        dmsConfig,
        adminPath = '/list',
        authPath,
        authWrapper = withAuth,
        themes = { default: {} },
        pgEnvs = ['hazmit_dama'],
        API_HOST = 'https://graph.availabs.org',
        DAMA_HOST = 'https://graph.availabs.org',
        damaBaseUrl,
        PROJECT_NAME,
        datasets
    } = props


    let SUBDOMAIN = getSubdomain(window.location.host)
    // for weird double subdomain tld
    SUBDOMAIN = SUBDOMAIN === 'hazardmitigation' ? '' : SUBDOMAIN

    const dbThemes = (siteData?.[0]?.theme_refs || [])
      .reduce((out,theme) => {
          out[theme.name] = parseIfJSON(theme.theme)
          return out
      }, {})
    //console.log('patterns2routes',dbThemes)

    themes = themes?.default ? { ...themes, ...dbThemes } : { ...themes, ...dbThemes, default: {} }
    console.log('themes', themes)

    let dmsConfigUpdated = cloneDeep(dmsConfig);
    dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app)
    dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app)

    // console.log('dmsConfigUpdated', dmsConfigUpdated)
    let AdminPattern = {
      app: dmsConfigUpdated?.format?.app || dmsConfigUpdated.app,
      type: dmsConfigUpdated.type,
      doc_type: dmsConfigUpdated.type,
      siteType: dmsConfigUpdated.type,
      base_url: adminPath,
      //format: pattern?.config,
      pattern: {},
      pattern_type: 'admin',
      subdomain: "*",
      authPermissions: "{}",
      theme: themes['default'],
      themes
    }
    const patterns = [AdminPattern,...(siteData.reduce((acc, curr) => [...acc, ...(curr?.patterns || [])], []) || [])];

    return [
        //--------------------------------
        // Register Admin Pattern -- pattern manager
        // -------------------------------
        // dmsPageFactory({
        //     dmsConfig: {
        //         ...dmsConfigUpdated,
        //         siteType: dmsConfigUpdated.type,
        //         baseUrl: adminPath,
        //         API_HOST,
        //         PROJECT_NAME,
        //         theme: themes['default'],
        //         pgEnvs
        //     },
        //     authWrapper,
        //     ErrorBoundary: RootErrorBoundary
        // }),
        // dmsPageFactory({
        //     dmsConfig: {
        //         ...patternTypes.admin[1]({
        //             ...dmsConfigUpdated,
        //             authPath,
        //             themes
        //         }),
        //         siteType: dmsConfigUpdated.type,
        //         API_HOST,
        //         PROJECT_NAME,
        //         theme: themes['default'],
        //         pgEnvs
        //     },
        //     authWrapper,
        //     ErrorBoundary: RootErrorBoundary
        // }),
        // patterns
        ...patterns
          .filter(pattern => (
              pattern?.pattern_type &&
              ((!SUBDOMAIN && !pattern.subdomain) || pattern.subdomain === SUBDOMAIN || pattern.subdomain === '*')
          ))
          .reduce((acc, pattern) => {

            const c = patternTypes[pattern.pattern_type];
            if(!c) return acc;
            //console.log('register pattern', pattern.id, pattern.subdomain, `/${pattern.base_url?.replace(/^\/|\/$/g, '')}`)
            acc.push(
              ...c.map(config => {
                  const authPermissions = JSON.parse(pattern?.authPermissions || "{}");
                  if(!authPermissions?.groups?.public){
                      // default public permissions. overridden by set permissions
                      authPermissions.groups ??= {};
                      authPermissions.groups.public ??= ['view-page'];
                  }
                const configObj = config({
                    app: dmsConfigUpdated?.format?.app || dmsConfigUpdated.app,
                    // type: pattern.doc_type,
                    type: pattern.doc_type || pattern?.base_url?.replace(/\//g, ''),
                    siteType: dmsConfigUpdated?.format?.type || dmsConfigUpdated.type,
                    baseUrl: `/${pattern.base_url?.replace(/^\/|\/$/g, '')}`, // only leading slash allowed
                    adminPath,
                    format: pattern?.config,
                    pattern: pattern,
                    pattern_type: pattern?.pattern_type,
                    authPermissions,
                    pgEnv:pgEnvs?.[0] || '',
                    themes,
                    useFalcor,
                    API_HOST,
                    DAMA_HOST,
                    PROJECT_NAME,
                    damaBaseUrl,
                    datasets,
                    datasetPatterns: patterns.filter(p => ['forms', 'datasets'].includes(p.pattern_type))
                });
                return ({...dmsPageFactory({
                  dmsConfig: configObj,
                  authWrapper,
                  isAuth: pattern.pattern_type === 'auth',
                  ErrorBoundary: RootErrorBoundary
                })})
            }));

            return acc;
        }, []),
    ]
}

export default async function dmsSiteFactory(config) {
    let { dmsConfig, falcor, API_HOST } = config

    let dmsConfigUpdated = cloneDeep(dmsConfig);
    dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app)
    dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app)

    falcor = falcor || falcorGraph(API_HOST)
    // console.time('load routes')
    let data = await dmsDataLoader(falcor, dmsConfigUpdated, `/`);
    // console.timeEnd('load routes')
    // console.log('data -- get site data here', JSON.stringify(data))

    return pattern2routes(data, config)
}

export function DmsSite (config) {
    const {
        dmsConfig,
        defaultData,
        adminPath = '/list',
        authPath,
        authWrapper = withAuth,
        themes = { default: {} },
        falcor,
        pgEnvs=['hazmit_dama'],
        API_HOST = 'https://graph.availabs.org',
        AUTH_HOST= 'https://graph.availabs.org',
        DAMA_HOST= 'https://graph.availabs.org',
        damaBaseUrl,
        PROJECT_NAME,
        routes = [],
        datasets = {}
    } = config
    //-----------
    // to do:
    // could save sites to localstorage cache clear on load.
    //-----------
    let CurrentProjectName = PROJECT_NAME ? PROJECT_NAME : dmsConfig.app
    console.log('current Project name', CurrentProjectName)
    const [loading, setLoading] = useState(false);

    const [dynamicRoutes, setDynamicRoutes] = useState(
        defaultData ?
            pattern2routes(defaultData, {
                dmsConfig,
                adminPath,
                authPath,
                themes,
                falcor,
                API_HOST,
                DAMA_HOST,
                authWrapper,
                pgEnvs,
                damaBaseUrl,
                PROJECT_NAME: CurrentProjectName,
                datasets
                //theme
            })
            : []
        );

    useEffect(() => {
        let isStale = false;
        async function load () {
            // console.log('loading site data')
            setLoading(true)
            // console.time('dmsSiteFactory')
            const dynamicRoutes = await dmsSiteFactory({
                dmsConfig,//adminConfig
                adminPath,
                authPath,
                themes,
                falcor,
                API_HOST,
                DAMA_HOST,
                authWrapper,
                pgEnvs,
                damaBaseUrl,
                PROJECT_NAME: CurrentProjectName,
                datasets,
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
    }, []);


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

    const AuthedRouteProvider = authProvider(
      RouterProvider,
      { AUTH_HOST, PROJECT_NAME:CurrentProjectName }
    );

    return (
      <AuthedRouteProvider
        router={createBrowserRouter(
          [
            ...dynamicRoutes,
            ...routesWithErrorBoundary,
            PageNotFoundRoute
          ]
        )}
      />
    )
}
