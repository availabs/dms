import React, { useEffect, useMemo } from 'react'
import { useParams, useLocation, useNavigate, matchRoutes } from 'react-router';
import { cloneDeep } from 'lodash-es';
import { dmsDataLoader, dmsDataEditor } from '../../../api/index.js'
import DmsManager from '../../../dms-manager'

import {
  falcorGraph,
  FalcorProvider,
  useFalcor
} from "@availabs/avl-falcor"

import getDmsConfig, { adminSite , parseJson } from './dms_utils.js'

// ----------------------------------------------------
// -------------- Config Setup-------------------------
// ----------------------------------------------------
const authWrapper = Component => Component

const {
  API_HOST = 'https://graph.availabs.org',
  baseUrl = ""
} = {}
const clientFalcor = falcorGraph(API_HOST)
const env = typeof document === "undefined" ? "server" : "client";



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
  //console.log('dms - loader - adminData', adminData, adminSite)

  const patterns = adminData[0]?.patterns
  const themes = (adminData[0]?.themes || []).reduce((out,curr) => {
     // console.log('theme curr', curr)
      out[curr?.name] = parseJson(curr?.theme || {})
      return out
  },{})
  //console.log('dms - loader - themes',themes)

  const dmsConfig = getDmsConfig(
    request.headers.get('host'),
    new URL(request.url).pathname,
    patterns,
    themes
  )
  if(!dmsConfig)  return {}


  const data =  await dmsDataLoader(falcor, dmsConfig, `/${params['*'] || ''}`)


  return {
    data,
    host: request.headers.get('host'),
    patterns,
    themes
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
  const body = new FormData();
  body.append("path",  `/${params['*'] || ''}`)
  body.append("requestType",  "data")
  //console.log('loader config', dmsConfig)
  console.time('loader data')
  const res =  await fetch(`/dms_api`, { method:"POST", body })
  const data = await res.json()
  console.timeEnd('loader data')

  return data

}



export const clientAction = async ({ request, params }) => {
  const form = await request.formData();
  form.append('path', params['*'])
  //return {}
  console.time('clientAction  data')
  const res =  await fetch(`/dms_api`, {
      method:"POST",
      body: form
  })
  const data = await res.json()
  console.timeEnd('clientAction  data')

  return data
};




export default function DMS({ loaderData }) {
  //console.log('dms render props', props)
  const params = useParams();
  const path = React.useMemo(() => `/${params['*'] || ''}`,[params])
  const { host, data, patterns, themes } = loaderData
  const { user, setUser } = React.useState({})
  const dmsConfig = React.useMemo(() => getDmsConfig(host, path, patterns, themes, user, setUser), [path,host])


  const AuthedManager= authWrapper(DmsManager)
  const content = useMemo(() => {
    console.log('render dms')
    return (
      <AuthedManager
        path={ path.replace( dmsConfig?.baseUrl, '') }
        config={ dmsConfig }
        falcor={ clientFalcor }
        mode={'ssr'}
    />)
  },[dmsConfig])
  return (<>{content}</>)

}
