import React, {useEffect} from 'react'
import { useParams, useLocation, useNavigate } from "react-router";

import {
  dmsDataLoader,
  dmsDataEditor,
} from '../api'

import DmsManager from '../dms-manager/index.jsx'
import { withAuth } from '../patterns/auth/context';
// import defaultTheme from './theme/default-theme'

import {
  falcorGraph,
  FalcorProvider
} from "@availabs/avl-falcor"
//const noAuth = Component => Component


function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function dmsPageFactory (
  {
      dmsConfig,
      API_HOST = 'https://graph.availabs.org',
      authWrapper = withAuth,
      ErrorBoundary,
      isAuth
  }
) {
  let {
    baseUrl = "",
    errorElement
  } = dmsConfig
  const ErrorBoundaryComp = errorElement || ErrorBoundary
  const dmsPath = `${baseUrl}${baseUrl === '/' ? '' : '/'}`
  // console.log('dmspageFactory', API_HOST)
  const falcor = falcorGraph(API_HOST)

  async function loader ({ request, params }) {
    if (isAuth) return { data: [] }
    const path = `/${params['*'] || ''}`
    if (import.meta.env.DEV) console.log(`[dms loader] ${path} — start`)
    const t0 = import.meta.env.DEV ? performance.now() : 0
    let data = await dmsDataLoader(falcor, dmsConfig, `/${params['*'] || ''}`)
    const t1 = import.meta.env.DEV ? performance.now() : 0
    // Pre-load dataWrapper section data if the pattern supports it
    // if (dmsConfig.preload) {
    //   data = await dmsConfig.preload(falcor, data, request, params)
    // }
    if (import.meta.env.DEV) {
      const t2 = performance.now()
      console.log('[dms loader]', data)
      console.log(
        `[dms loader] ${path} — data: ${(t1 - t0).toFixed(0)}ms, preload: ${(t2 - t1).toFixed(0)}ms, total: ${(t2 - t0).toFixed(0)}ms`
      )
    }
    return {
      data
    }
  }

  async function action ({ request, params }) {
      if(isAuth) return;
    const form = await request.formData();
    return dmsDataEditor(falcor,
      dmsConfig,
      JSON.parse(form.get("data")),
      form.get("requestType"),
      params['*']
    )
  };

  function DMS() {
    const params = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const AuthedManager = React.useMemo(() => authWrapper(DmsManager), [])

    return React.useMemo(() => (
      <FalcorProvider falcor={falcor}>
        <AuthedManager
          path={ `/${params['*'] || ''}` }
          baseUrl={baseUrl}
          config={dmsConfig}
          navigate={navigate}
          falcor={falcor}
        />
      </FalcorProvider>
    ),[params['*']])
  }

  return {
    path: `${dmsPath}*`,
    Component: (props) =>  (
      <>
        <ScrollToTop />
        <DMS {...props} />
      </>
    ),
    loader: loader,
    action: action,
    errorElement: <ErrorBoundaryComp />
  }
}
