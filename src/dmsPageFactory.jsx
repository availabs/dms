import React, {useEffect} from 'react'
import { useParams } from "react-router-dom";

import { 
  DmsManager, 
  dmsDataLoader,
  dmsDataEditor, 
} from './index'

import defaultTheme from './theme/default-theme'
//const noAuth = Component => Component

export default function dmsPageFactory (
  dmsConfig,
  dmsPath='/',
  authWrapper = Component => Component,
  dmsTheme = defaultTheme
) {

  async function loader ({ request, params }) {
    let data = await dmsDataLoader(dmsConfig, `/${params['*'] || ''}`)
    return { 
      data
    }
  }

  async function action ({ request, params }) {
    const form = await request.formData();
    return dmsDataEditor(dmsConfig, 
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
      <AuthedManager 
        path={ `/${params['*'] || ''}` }
        config={dmsConfig}
        theme={dmsTheme}
      />
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
    component: (props) =>  <DMS {...props} />,
    loader: loader,
    action: action
  }
}

