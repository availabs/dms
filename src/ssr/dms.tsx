import React, { useEffect, useMemo } from 'react'
import { useParams, useLocation, useNavigate, matchRoutes } from 'react-router';
import { cloneDeep } from 'lodash-es';
import { dmsDataLoader, dmsDataEditor } from '../api/index.js'
import pageConfig from '../patterns/page/siteConfig.jsx'
import DmsManager from '../dms-manager'

import {
  falcorGraph,
  FalcorProvider,
  useFalcor
} from "@availabs/avl-falcor"

import getDmsConfig, { adminSite } from './dms_utils.ts'

// ----------------------------------------------------
// -------------- Config Setup-------------------------
// ----------------------------------------------------
const authWrapper = Component => Component

let {
  API_HOST = 'https://graph.availabs.org',
  baseUrl = ""
} = {}
const clientFalcor = falcorGraph(API_HOST)
let env = typeof document === "undefined" ? "server" : "client";



//console.log('admin data',JSON.stringify(adminSite),patterns)
// let dmsConfig = pageConfig?.[0]({
//     // app: "mitigat-ny-prod",
//     // type: "redesign",
//     app: "dms-site",
//     type: "docs-npmrds",
//     // app: "dms-docs",
//     // type: "test",
//     // useFalcor: useFalcor,
//     baseUrl: "",
//     //checkAuth
// })

// -------------- Config Setup--------------------------
  

export const loader = async({ request, params }) => {
  //console.log('index - loader - request', request.url)
  const { falcor } = await import('./falcor.ts')
  const adminData =  await dmsDataLoader(falcor, adminSite, `/`) 
  console.log('dms - loader - adminData', adminData, adminSite)  
  const patterns = adminData[0]?.patterns
  
  const dmsConfig = getDmsConfig(
    request.headers.get('host'), 
    new URL(request.url).pathname,
    patterns
  )
  if(!dmsConfig)  return {} 
  // console.log('index - loader - dmsConfig', dmsConfig)
  // console.log('dms - loader - dmsConfig', dmsConfig)
  
  let data =  await dmsDataLoader(falcor, dmsConfig, `/${params['*'] || ''}`)
  
  // console.log('index - loader - data', data.length )
  // const functionTest = (a,b) => a + b 
  return {
    data,
    host: request.headers.get('host'),
    patterns
  }
}

export const action = async ({ request, params }) => {
  const { falcor } = await import('./falcor.ts')
  const adminData =  await dmsDataLoader(falcor, adminSite, `/`)

  const patterns = adminData[0]?.patterns
  const form = await request.formData();
  //return {}
  const dmsConfig = await getDmsConfig(
    request.headers.get('host'), 
    new URL(request.url).pathname,
    patterns
  )
  return dmsDataEditor(falcor,
    dmsConfig,
    JSON.parse(form.get("data")),
    form.get("requestType"),
    params['*']
  )
};

export function HydrateFallback() {
  return <div>Loading Screen</div>;
}

export const clientLoader = async({ request, params }) => {
  console.log('I am the client loader')
  var body = new FormData();
  body.append("path",  `/${params['*'] || ''}`)
  body.append("requestType",  "data")
  //console.log('loader config', dmsConfig)
  console.time('loader data')
  let res =  await fetch(`/dms_api`, { method:"POST", body })
  let data = await res.json()
  console.log('client loader data', data)
  console.timeEnd('loader data')

  return data

}



export const clientAction = async ({ request, params }) => {
  const form = await request.formData();
  form.append('path', params['*'])
  //return {}
  console.time('clientAction  data')
  let res =  await fetch(`/dms_api`, {
      method:"POST", 
      body: form
  })
  let data = await res.json()
  console.timeEnd('clientAction  data')
  
  return data
};




export default function DMS({ loaderData }) {
  //console.log('dms render props', props)
  const params = useParams();
  let path = React.useMemo(() => `/${params['*'] || ''}`,[params])
  const { host, data, patterns } = loaderData
  //console.log('index - dmsComp - loaderData', host, data?.length, patterns?.length)
  const dmsConfig = React.useMemo(() => getDmsConfig(host, path,patterns), [path,host])
  //console.log('index - DMS Comp - data ', data?.length, path,host)
  //console.log('index - DMS Comp - dmsConfig', dmsConfig)
  // console.log('DMS Comp - dms config', 
  //   dmsConfig.baseUrl,
  //   `/${dmsConfig.baseUrl?.replace(/^\/|\/$/g, '')}`, 
  //   path, 
  //   path.replace( dmsConfig.baseUrl, '')
  // )
  if(!dmsConfig) {
    <div> Invalid config {process.env.DMS_APP} {process.env.DMS_TYPE}</div>
  }

  const AuthedManager= authWrapper(DmsManager)
  const content = (
      <AuthedManager
        path={ path.replace( dmsConfig.baseUrl, '') }
        config={ dmsConfig }
        falcor={ clientFalcor }
        mode={'ssr'}
    />
  )
  return (<>{content}</>)
  
}

