import React, {useState, useEffect} from 'react'
import { createBrowserRouter, RouterProvider, useRouteError } from "react-router";
import { falcorGraph, useFalcor } from "@availabs/avl-falcor"
import { cloneDeep } from "lodash-es"

import { dmsDataLoader, dmsPageFactory } from '../../'

import { default as patternTypes } from '../../patterns';

// Start resolving lazy patterns immediately at module load.
// By the time the component renders, this is typically already resolved.
import { updateAttributes, updateRegisteredFormats } from "../../dms-manager/_utils";

import { withAuth, authProvider } from '../../patterns/auth/context';
import { parseIfJSON } from '../../patterns/page/pages/_utils';

function resolveSubdomainFilters(rawFilters, subdomain) {
    const parsed = parseIfJSON(rawFilters, []);
    if (Array.isArray(parsed)) return parsed;               // old format
    return parsed[subdomain] || parsed['*'] || [];          // new format
}

function resolveSubdomainAuthPermissions(rawAuth, subdomain) {
    const parsed = parseIfJSON(rawAuth || '{}', {});
    if (parsed['*'] !== undefined)                          // new format
        return parseIfJSON(parsed[subdomain] || parsed['*'] || {});
    return parseIfJSON(parsed);                                          // old format
}

const getSubdomain = (host) => {
    // ---
    // takes host string and returns subdomain
    // only works with single depth subdomains
    // ---
    // Strip port (e.g., "songs.localhost:3001" → "songs.localhost")
    const hostname = host.split(':')[0]
    // localhost is a single-part TLD, so "sub.localhost" has 2 parts.
    // Real domains like "example.com" have 2 parts, "sub.example.com" has 3.
    const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost')
    const minParts = isLocalhost || process.env.NODE_ENV === "development" ? 2 : 3
    const parts = hostname.split('.')
    return parts.length >= minParts ? parts[0].toLowerCase() : false
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
        pgEnvs = [],
        API_HOST = 'https://graph.availabs.org',
        DAMA_HOST = 'https://graph.availabs.org',
        damaBaseUrl,
        PROJECT_NAME,
        damaDataTypes,
        host = typeof window !== 'undefined' ? window.location.host : 'localhost'
    } = props


    let SUBDOMAIN = getSubdomain(host)
    // for weird double subdomain tld
    SUBDOMAIN = SUBDOMAIN === 'hazardmitigation' ? '' : SUBDOMAIN

    const dbThemes = (siteData?.[0]?.theme_refs || [])
      .reduce((out,theme) => {
          out[theme.name] = parseIfJSON(theme.theme)
          return out
      }, {})
    //console.log('patterns2routes',dbThemes)

    themes = themes?.default ? { ...themes, ...dbThemes } : { ...themes, ...dbThemes, default: {} }
    // console.log('dmsSiteFactory themes', themes)

    let dmsConfigUpdated = cloneDeep(dmsConfig);
    const siteType = dmsConfig?.format?.type || dmsConfig.type;
    dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app, siteType)
    dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app, siteType)

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
  const patterns = [
    AdminPattern,
    ...(siteData
      .reduce((acc, curr) => [...acc, ...(curr?.patterns || [])], [])
      || [])
  ];

    // Build datasetPatterns once (for backwards compatibility with other patterns)
    const datasetPatterns = patterns.filter(p => ['forms', 'datasets', 'mapeditor'].includes(p.pattern_type));

    // Build unified datasources array for page pattern
    const app = dmsConfigUpdated?.format?.app || dmsConfigUpdated.app;
    const datasources = [
      // External sources from pgEnvs (with damaBaseUrl)
      ...(pgEnvs || []).map(env => ({
        type: 'external',
        env,
        baseUrl: damaBaseUrl || '',
        label: 'external',
        srcAttributes: ['name', 'metadata'],
        viewAttributes: ['version', '_modified_timestamp'],
      })),
      // Internal sources from datasetPatterns
      ...datasetPatterns.map(dsPattern => ({
        type: 'internal',
        env: `${app}+${dsPattern.doc_type}`,
        baseUrl: '/forms',
        label: 'managed',
        isDms: true,
        srcAttributes: ['app', 'name', 'doc_type', 'config', 'default_columns'],
        viewAttributes: ['name', 'updated_at'],
        pattern: dsPattern,
      }))
    ];

    // console.log('dmssite factory, datasources', datasources)

    return [
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
                  const authPermissions = resolveSubdomainAuthPermissions(pattern?.authPermissions, SUBDOMAIN || '');
                  if (!authPermissions?.groups?.public) {
                      authPermissions.groups ??= {};
                      authPermissions.groups.public ??= ['view-page'];
                  }
                  const resolvedFilters = resolveSubdomainFilters(pattern?.filters, SUBDOMAIN || '');
                const configObj = config({
                    app: dmsConfigUpdated?.format?.app || dmsConfigUpdated.app,
                    // type: pattern.doc_type,
                    type: pattern.doc_type || pattern?.base_url?.replace(/\//g, ''),
                    siteType: dmsConfigUpdated?.format?.type || dmsConfigUpdated.type,
                    baseUrl: `/${pattern.base_url?.replace(/^\/|\/$/g, '')}`, // only leading slash allowed
                    adminPath,
                    format: pattern?.config,
                    pattern: { ...pattern, filters: resolvedFilters },
                    pattern_type: pattern?.pattern_type,
                    authPermissions,
                    // NEW: Add datasources for page pattern
                    datasources,
                    // KEEP: Old variables for other patterns (admin, auth, forms, datasets)
                    pgEnv: pgEnvs?.[0] || '',
                    damaBaseUrl,
                    datasetPatterns,
                    themes,
                    useFalcor,
                    API_HOST,
                    DAMA_HOST,
                    PROJECT_NAME,
                    damaDataTypes,
                });
                // console.log('dmssitefactory Config obj', configObj)
                return ({
                  ...dmsPageFactory({
                    dmsConfig: configObj,
                    API_HOST,
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
    const siteType = dmsConfig?.format?.type || dmsConfig.type;
    dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app, siteType)
    dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app, siteType)

    falcor = falcor || falcorGraph(API_HOST)
    // Resolve lazy patterns in parallel with data loading
    const data = await dmsDataLoader(falcor, dmsConfigUpdated, `/`);

    return pattern2routes(data, config)
}

export function DmsSite (config) {
    const {
        dmsConfig,
        defaultData,
        hydrationData,
        adminPath = '/list',
        authPath,
        authWrapper = withAuth,
        themes = { default: {} },
        falcor,
        pgEnvs=[],
        API_HOST = 'https://graph.availabs.org',
        AUTH_HOST= 'https://graph.availabs.org',
        DAMA_HOST= 'https://graph.availabs.org',
        damaBaseUrl,
        PROJECT_NAME,
        routes = [],
        damaDataTypes = {},
        host = typeof window !== 'undefined' ? window.location.host : 'localhost'
    } = config
    let CurrentProjectName = PROJECT_NAME ? PROJECT_NAME : dmsConfig.app

    const routeProps = {
        dmsConfig, adminPath, authPath, themes, falcor, API_HOST, DAMA_HOST,
        authWrapper, pgEnvs, damaBaseUrl, PROJECT_NAME: CurrentProjectName,
        damaDataTypes, host
    }

    const AuthedRouteProvider = React.useMemo(
      () => authProvider(RouterProvider, { AUTH_HOST, PROJECT_NAME:CurrentProjectName }),
      [AUTH_HOST, CurrentProjectName]
    );

    const routesWithErrorBoundary = React.useMemo(() => routes.map(c => {
        if (!c.errorElement) {
            c.errorElement = <RootErrorBoundary />
        }
        return c
    }), [routes]);

    const PageNotFoundRoute = React.useMemo(() => ({
        path: "/*",
        Component: () =>
            <div className={'w-screen h-screen mx-auto flex items-center justify-center'}>404</div>
    }), []);

    // routerRef tracks the live router instance and the paths used to build it,
    // so the effect can revalidate in-place when routes haven't structurally changed.
    const routerRef = React.useRef(null);

    const buildRouter = React.useCallback((builtRoutes, opts) => {
        const r = createBrowserRouter(
            [...builtRoutes, ...routesWithErrorBoundary, PageNotFoundRoute],
            opts
        );
        routerRef.current = { router: r, paths: builtRoutes.map(r => r.path).sort().join('|') };
        return r;
    }, [routesWithErrorBoundary, PageNotFoundRoute]);

    const [router, setRouter] = useState(() => {
        if (defaultData) {
            const initialRoutes = pattern2routes(defaultData, routeProps);
            return buildRouter(initialRoutes);
        }
        return null;
    });

    useEffect(() => {
        let isStale = false;
        dmsSiteFactory(routeProps).then(builtRoutes => {
            if (isStale) return;
            const newPaths = builtRoutes.map(r => r.path).sort().join('|');
            if (routerRef.current && routerRef.current.paths === newPaths) {
                // Same route structure — revalidate active loaders in place, no flash
                routerRef.current.router.revalidate();
            } else {
                setRouter(buildRouter(builtRoutes, hydrationData ? { hydrationData } : undefined));
            }
        });
        return () => { isStale = true }
    }, []);

    if (!router) {
        return <div className="w-screen h-screen flex items-center justify-center">Loading...</div>;
    }

    return (
      <AuthedRouteProvider
        router={router}
      />
    )
}
