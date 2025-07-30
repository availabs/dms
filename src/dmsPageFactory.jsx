import React, {useEffect} from 'react'
import { useParams, useLocation, useNavigate } from "react-router";

import {
  dmsDataLoader,
  dmsDataEditor,
} from './api'

import DmsManager from './dms-manager/index.jsx'
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
  dmsConfig,
  authWrapper = (Component) => Component,
  user,
  isAuth
) {
  //console.log('hola', dmsConfig, authWrapper)
  //const {falcor, falcorCache} = useFalcor()
  let {
    API_HOST = 'https://graph.availabs.org',
    baseUrl = "",
  } = dmsConfig
  //baseUrl = baseUrl[0] === '/' ? baseUrl.slice(1) : baseUrl
  //console.log('page factory', API_HOST, dmsConfig )
  const dmsPath= `${baseUrl}${baseUrl === '/' ? '' : '/'}`
  const falcor = falcorGraph(API_HOST)

  async function loader ({ request, params }) {
      if(isAuth) return {data: []}
    let data = await dmsDataLoader(falcor, dmsConfig, `/${params['*'] || ''}`)
    // console.log('loader data', data)
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
    const AuthedManager = authWrapper(DmsManager)
    console.log('user in dmsManager', user, params, location)
    return React.useMemo(() => (
      <FalcorProvider falcor={falcor}>
        <DmsManager
          path={ `/${params['*'] || ''}` }
          baseUrl={baseUrl}
          config={dmsConfig}
          navigate={navigate}
          falcor={falcor}
          user={user}
        />
      </FalcorProvider>
    ),[params['*']])
  }

  function ErrorBoundary({ error }) {
    return (
      <div>
        <h1>DMS Error</h1>
        <pre className='p-4 bg-gray-300'>{JSON.stringify(error,null,3)}</pre>
      </div>
    );
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
    action: action
  }
}
