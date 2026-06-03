import React, {useState, useEffect} from 'react'
import { createBrowserRouter, RouterProvider, useRouteError } from "react-router";
import { falcorGraph } from "@availabs/avl-falcor"
import { cloneDeep } from "lodash-es"
import { dmsDataLoader, withAuth, authProvider, dmsPageFactory, _setSyncAPI } from '../../'
import { parseIfJSON } from '../../patterns/page/pages/_utils';
import { getInstance } from '../../utils/type-utils';
import { updateAttributes, updateRegisteredFormats } from "../../dms-manager/_utils";
import { pattern2routes, getSubdomain } from './utils'
import RootErrorBoundary from './utils/RootErrorBoundary.jsx';

const DMS_SYNC_ENABLED = typeof import.meta !== 'undefined'
  && import.meta.env?.VITE_DMS_SYNC === '1';

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
        damaMapPlugins = {},
        isMultiTenant = false,
        host = typeof window !== 'undefined' ? window.location.host : 'localhost'
    } = config
    // On a tenant subdomain the auth project is the subdomain (= tenant.app by convention).
    // Without this, authProvider would use the master app as PROJECT_NAME and all
    // login/token-check calls on tenant subdomains would hit the wrong auth project.
    const tenantSubdomain = isMultiTenant ? getSubdomain(host) : false;
    let CurrentProjectName = tenantSubdomain || (PROJECT_NAME ? PROJECT_NAME : dmsConfig.app)

    const routeProps = {
        dmsConfig, adminPath, authPath, themes, falcor, API_HOST, DAMA_HOST,
        authWrapper, pgEnvs, damaBaseUrl, PROJECT_NAME: CurrentProjectName,
        damaDataTypes, damaMapPlugins, host, isMultiTenant
    }
    // In multi-tenant+subdomain mode the master-app cache belongs to a different
    // site; skip it to avoid briefly rendering the platform admin routes.
    const isTenantSubdomain = isMultiTenant && Boolean(getSubdomain(host));
    const localStorePatterns = isTenantSubdomain
        ? null
        : parseIfJSON(localStorage.getItem(dmsConfig.app+'-'+dmsConfig.type), null)
    const [loading, setLoading] = useState(() => !localStorePatterns?.length && !defaultData?.length);
    const [dynamicRoutes, setDynamicRoutes] = useState(() => {
        if (localStorePatterns?.length || defaultData?.length) {
            // console.log('has localstore patterns')
            return pattern2routes(localStorePatterns?.length ? localStorePatterns : defaultData, routeProps)
        }
        return []
    });

    const routePropsRef = React.useRef(routeProps);
    useEffect(() => { routePropsRef.current = routeProps; });

    useEffect(() => {
        let isStale = false;
        async function load () {

            if (localStorePatterns ||defaultData) setLoading(true)
            // Always do the full API fetch — defaultData may only contain a
            // subset of routes (e.g., SSR pre-rendered one pattern but the
            // site has others). The fetch fills in any missing routes.
            // console.time('dmsSite - loading Dynamic Routes', )
            const routes = await dmsSiteFactory(routeProps);
            if (!isStale) {
                setDynamicRoutes(routes);
                setLoading(false);
                // console.timeEnd('dmsSite - loading Dynamic Routes')
            }
        }
        load()
        return () => { isStale = true }
    }, []);

    // When the user logs in, authed patterns that were blocked by server-side auth
    // on initial load need to be fetched now so their routes exist for navigation.
    useEffect(() => {
        const handleLogin = async () => {
            const routes = await dmsSiteFactory(routePropsRef.current);
            setDynamicRoutes(routes);
        };
        window.addEventListener('dms-user-login', handleLogin);
        return () => window.removeEventListener('dms-user-login', handleLogin);
    }, []);

    // --- Sync state (effects run after router is defined below) ---
    const [syncActive, setSyncActive] = useState(false);
    const [syncAPI, setSyncAPIState] = useState(null);


    const routesWithErrorBoundary = React.useMemo(() => routes.filter(c => !c.isLink).map(c => {
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

    const AuthedRouteProvider = React.useMemo(
      () => authProvider(RouterProvider, {
          AUTH_HOST,
          PROJECT_NAME: CurrentProjectName,
          isMultiTenant,
          siteType: dmsConfig.type,
      }),
      [AUTH_HOST, CurrentProjectName, isMultiTenant, dmsConfig.type]
    );

    const router = React.useMemo(
      () => createBrowserRouter(
          [
              ...dynamicRoutes,
              ...routesWithErrorBoundary,
              PageNotFoundRoute
          ],
          hydrationData ? { hydrationData } : undefined
      ),
      [dynamicRoutes, routesWithErrorBoundary, PageNotFoundRoute, hydrationData]
    );

    // --- Sync initialization (after router is defined) ---
    useEffect(() => {
        if (!DMS_SYNC_ENABLED) return;
        const app = dmsConfig?.format?.app || dmsConfig?.app;
        if (!app) return;

        const siteType = dmsConfig?.format?.type || dmsConfig?.type;
        const t0 = performance.now();
        import('../../sync/index.js').then(async ({ initSync }) => {
            const tImport = performance.now();
            // console.log(`[sync] module imported (${(tImport - t0).toFixed(0)}ms)`);
            const api = await initSync(app, API_HOST, siteType);
            _setSyncAPI(api);
            setSyncAPIState(api);
            setSyncActive(true);
            // console.log(`[sync] fully wired into DMS (${(performance.now() - t0).toFixed(0)}ms total)`);
        }).catch(err =>
            console.warn('[dms] sync init failed:', err.message)
        );
    }, []);

    // Revalidate routes when sync receives remote changes (debounced to avoid storm)
    useEffect(() => {
        if (!syncAPI) return;
        let timer = null;
        const unsub = syncAPI.onInvalidate(() => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                if (router) router.revalidate();
            }, 150);
        });
        return () => { unsub(); if (timer) clearTimeout(timer); };
    }, [syncAPI, router]);
    // --- End sync ---

    const SyncStatusLazy = React.useMemo(
      () => syncActive ? React.lazy(() => import('../../sync/SyncStatus.jsx')) : null,
      [syncActive]
    );

    if (loading && !dynamicRoutes.length) {
        return <div className="w-screen h-screen flex items-center justify-center">Loading...</div>;
    }

    return (
      <>
        <AuthedRouteProvider
          router={router}
        />
        {SyncStatusLazy && (
          <React.Suspense fallback={null}>
            <SyncStatusLazy />
          </React.Suspense>
        )}
      </>
    )
}

export default async function dmsSiteFactory(config) {
    let { dmsConfig, falcor, API_HOST, isMultiTenant, host } = config

    // Step 1 — always load the master site
    let dmsConfigUpdated = cloneDeep(dmsConfig);
    const siteType = dmsConfig?.format?.type || dmsConfig.type;
    const siteInstance = getInstance(siteType) || siteType;
    dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app, siteInstance)
    dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app, siteInstance)

    falcor = falcor || falcorGraph(API_HOST)
    let data = await dmsDataLoader(falcor, dmsConfigUpdated, `/`);
    if (localStorage) {
      localStorage.setItem(dmsConfigUpdated.app + '-' + dmsConfigUpdated.type, JSON.stringify(data))
    }

    if (!isMultiTenant) {
        return pattern2routes(data, config)
    }

    // Step 2 — multi-tenant: detect subdomain and route accordingly
    const currentHost = host || (typeof window !== 'undefined' ? window.location.host : '');
    const subdomain = getSubdomain(currentHost);

    if (!subdomain) {
        // Platform admin (root domain) — serve master site routes.
        // Phase 3 will render TenantList inside editSite when !subdomain && isMultiTenant.
        return pattern2routes(data, config)
    }

    // Find the tenant row whose subdomain matches
    const tenants = data[0]?.tenants || [];
    const matchedTenant = tenants.find(t => t.subdomain === subdomain);

    if (!matchedTenant) {
        return [{
            path: '/*',
            Component: () => React.createElement(
                'div',
                { className: 'w-screen h-screen flex items-center justify-center' },
                `Tenant "${subdomain}" not found`
            )
        }];
    }

    // Step 3 — build a tenant-scoped config: swap every app reference to tenant.app
    const tenantApp = matchedTenant.app;
    const tenantDmsConfig = cloneDeep(dmsConfig);
    tenantDmsConfig.app = tenantApp;
    tenantDmsConfig.format = { ...tenantDmsConfig.format, app: tenantApp };
    if (Array.isArray(tenantDmsConfig.format.registerFormats)) {
        tenantDmsConfig.format.registerFormats.forEach(rf => { rf.app = tenantApp; });
    }
    if (Array.isArray(tenantDmsConfig.format.attributes)) {
        tenantDmsConfig.format.attributes.forEach(attr => {
            if (attr.format) attr.format = `${tenantApp}+${attr.format.split('+')[1]}`;
        });
    }

    let tenantDmsConfigUpdated = cloneDeep(tenantDmsConfig);
    tenantDmsConfigUpdated.registerFormats = updateRegisteredFormats(tenantDmsConfigUpdated.registerFormats, tenantApp, siteInstance)
    tenantDmsConfigUpdated.attributes = updateAttributes(tenantDmsConfigUpdated.attributes, tenantApp, siteInstance)

    // Step 4 — load the tenant's own site (lives in dms_<tenantApp> schema)
    const tenantData = await dmsDataLoader(falcor, tenantDmsConfigUpdated, '/');
    if (localStorage) {
        localStorage.setItem(tenantDmsConfigUpdated.app + '-' + tenantDmsConfigUpdated.type, JSON.stringify(tenantData))
    }

    // Step 5 — build routes scoped to the tenant
    return pattern2routes(tenantData, { ...config, dmsConfig: tenantDmsConfig })
}
