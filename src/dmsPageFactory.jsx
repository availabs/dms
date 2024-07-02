import React, {useEffect} from 'react'
import { useParams } from "react-router-dom";

import {
  DmsManager,
  dmsDataLoader,
  dmsDataEditor,
} from './index'

import defaultTheme from './theme/default-theme'

import {
  falcorGraph,
  FalcorProvider
} from "@availabs/avl-falcor"
//const noAuth = Component => Component

export default function dmsPageFactory (
  dmsConfig,
  authWrapper = Component => Component,
  dmsTheme = defaultTheme
) {
  //console.log('hola', dmsConfig, authWrapper)
  //const {falcor, falcorCache} = useFalcor()
  let {
    API_HOST = 'https://graph.availabs.org',
    baseUrl = ""
  } = dmsConfig
  //baseUrl = baseUrl[0] === '/' ? baseUrl.slice(1) : baseUrl
  //console.log('page factory', API_HOST, dmsConfig )
  const dmsPath= `${baseUrl}/`
  const falcor = falcorGraph(API_HOST)
<<<<<<< HEAD
  console.log('test 123', falcor, API_HOST)
=======
>>>>>>> 73c486829f706580a20d6fc62b1ca2268eec6132

  async function loader ({ request, params }) {
    let data = await dmsDataLoader(falcor, dmsConfig, `/${params['*'] || ''}`)
    // console.log('loader data', data)
    return {
      data
    }
  }

  async function action ({ request, params }) {
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
    const AuthedManager = authWrapper(DmsManager)

    return React.useMemo(() => (
      <FalcorProvider falcor={falcor}>
        <AuthedManager
          path={ `/${params['*'] || ''}` }
          config={dmsConfig}
          theme={dmsTheme}
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
    Component: (props) =>  <DMS {...props} />,
    loader: loader,
    action: action
  }
}
