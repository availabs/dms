import React, { useEffect, useMemo } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router';

import {
  dmsDataLoader,
  dmsDataEditor
} from '../../../api/index.js'

import DmsManager from '../../../dms-manager'

import pageConfig from '../../../patterns/page/siteConfig.jsx'

import {
  falcorGraph,
  FalcorProvider,
  useFalcor
} from "@availabs/avl-falcor"

import { falcor } from './falcor.ts'
import getDmsConfig, { adminSite } from './dms_utils'

// ----------------------------------------------------
// -------------- Config Setup-------------------------
// ----------------------------------------------------
const authWrapper = Component => Component

let {
  API_HOST = 'https://graph.availabs.org',
  baseUrl = ""
} = {}

//const dmsPath= `${baseUrl}${baseUrl === '/' ? '' : '/'}`
const clientFalcor = falcorGraph(API_HOST)
// let dmsConfig = pageConfig?.[0]({
//     // app: "mitigat-ny-prod",
//     // type: "redesign",
//     app: "dms-site",
//     type: "docs-npmrds",
//     // app: "dms-docs",
//     // type: "test",
//     useFalcor: useFalcor,
//     baseUrl: "",
//     //checkAuth
//   })
// -------------- Config Setup--------------------------
  

export const loader = async({ request, params }) => {
  console.log('dms_api - loader', request.url, )
  const adminData =  await dmsDataLoader(falcor, adminSite, `/`)
  const patterns = adminData[0]?.patterns
  const dmsConfig = getDmsConfig(
    request.headers.get('host'), 
    request.body.path,
    patterns
  )
  console.log('dms_api - loader - dmsConfig', dmsConfig)
  let data =  await dmsDataLoader(falcor, dmsConfig, `/${params['*'] || ''}`)
  console.timeEnd('loader data')

  return {
    host: request.headers.get('host'),
    data,
    patterns
  }
}

export const action = async ({ request, params }) => {
  console.time(`dms-api action ${request.url}`)  
  const form = await request.formData();
  const adminData =  await dmsDataLoader(falcor, adminSite, `/`)
  const patterns = adminData[0]?.patterns
  const dmsConfig = getDmsConfig(
    request.headers.get('host'), 
    form.get("path"),
    patterns
  )
  
  console.log('dms_api - action - request', form.get("path"))
  let requestType = form.get("requestType")
  let customConfig = form.get('dmsConfig')
  
  if(requestType === 'data') {
    console.log('dms api - data request- config',customConfig ? JSON.parse(customConfig) : dmsConfig)
    const data = await dmsDataLoader(falcor, 
      customConfig ? JSON.parse(customConfig) : dmsConfig, 
      form.get("path")
    )
    console.log('dms api - data request- data', data)
    console.timeEnd(`dms-api action ${request.url}`)
    return {
      host: request.headers.get('host'),
      data,
      patterns
    }
  }
  //return {}
  return await dmsDataEditor(falcor,
    customConfig ? JSON.parse(customConfig) : dmsConfig,
    JSON.parse(form.get("data")),
    requestType,
    form.get("path")
  )
  console.log('dms-api - action - return', host, data.length, patterns.length)
  
};




