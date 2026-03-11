import React, {useState, useEffect} from 'react'
import { createBrowserRouter, RouterProvider, useRouteError } from "react-router";
import { falcorGraph } from "@availabs/avl-falcor"
import { cloneDeep } from "lodash-es"
import { dmsDataLoader, withAuth, authProvider, dmsPageFactory } from '../../'
import { parseIfJSON } from '../../patterns/page/pages/_utils';
import { updateAttributes, updateRegisteredFormats } from "../../dms-manager/_utils";
import { pattern2routes } from './utils'
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
        host = typeof window !== 'undefined' ? window.location.host : 'localhost'
    } = config
    let CurrentProjectName = PROJECT_NAME ? PROJECT_NAME : dmsConfig.app
    const [loading, setLoading] = useState(false);

    const routeProps = {
        dmsConfig, adminPath, authPath, themes, falcor, API_HOST, DAMA_HOST,
        authWrapper, pgEnvs, damaBaseUrl, PROJECT_NAME: CurrentProjectName,
        damaDataTypes, host
    }
    const localStorePatterns = parseIfJSON(localStorage.getItem(dmsConfig.app+'-'+dmsConfig.type), null)

    const [dynamicRoutes, setDynamicRoutes] = useState(() => {
        if (localStorePatterns || defaultData) {
            // console.log('has localstore patterns')
            return pattern2routes(localStorePatterns || defaultData, routeProps)
        }
        return []
    });

    useEffect(() => {
        let isStale = false;
        async function load () {

            if (localStorePatterns ||defaultData) setLoading(true)
            // Always do the full API fetch — defaultData may only contain a
            // subset of routes (e.g., SSR pre-rendered one pattern but the
            // site has others). The fetch fills in any missing routes.
            console.time('dmsSite - loading Dynamic Routes', )
            const routes = await dmsSiteFactory(routeProps);
            if (!isStale) {
                setDynamicRoutes(routes);
                setLoading(false);
                console.timeEnd('dmsSite - loading Dynamic Routes')
            }
        }
        load()
        return () => { isStale = true }
    }, []);

    // --- Sync state (effects run after router is defined below) ---
    const [syncActive, setSyncActive] = useState(false);
    const [syncAPI, setSyncAPIState] = useState(null);


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

    const AuthedRouteProvider = React.useMemo(
      () => authProvider(RouterProvider, { AUTH_HOST, PROJECT_NAME:CurrentProjectName }),
      [AUTH_HOST, CurrentProjectName]
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
            console.log(`[sync] module imported (${(tImport - t0).toFixed(0)}ms)`);
            const api = await initSync(app, API_HOST, siteType);
            const { _setSyncAPI } = await import('../../api/index.js');
            _setSyncAPI(api);
            setSyncAPIState(api);
            setSyncActive(true);
            console.log(`[sync] fully wired into DMS (${(performance.now() - t0).toFixed(0)}ms total)`);
        }).catch(err =>
            console.warn('[dms] sync init failed:', err.message)
        );
    }, []);

    // Revalidate routes when sync receives remote changes
    useEffect(() => {
        if (!syncAPI) return;
        return syncAPI.onInvalidate(() => {
            if (router) router.revalidate();
        });
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
    let { dmsConfig, falcor, API_HOST } = config
    let dmsConfigUpdated = cloneDeep(dmsConfig);
    const siteType = dmsConfig?.format?.type || dmsConfig.type;
    dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app, siteType)
    dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app, siteType)

    falcor = falcor || falcorGraph(API_HOST)
    let data = await dmsDataLoader(falcor, dmsConfigUpdated, `/`);
    if (localStorage) {
      //console.log(' setting data',data)
      localStorage.setItem(dmsConfigUpdated.app + '-' + dmsConfigUpdated.type, JSON.stringify(data))
    }
    //console.log('dmsSiteFactory - got data', data, localStorage)


    return pattern2routes(data, config)
}
