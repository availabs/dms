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
  const { 
    API_HOST = 'https://graph.availabs.org', 
    baseUrl = "" 
  } = dmsConfig
  const dmsPath= `${baseUrl}/`
  const falcor = falcorGraph(API_HOST)


  async function loader ({ request, params }) {
    let data = await dmsDataLoader(falcor, dmsConfig, `/${params['*'] || ''}`)
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
    
    /*
    React.useEffect(() => {
      console.log('DMS Wrapper load', params)
    },[])

    console.log('DMS Wrapper render', params)
    */

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

