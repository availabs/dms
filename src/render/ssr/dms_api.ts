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
import getDmsConfig, { adminSite, parseJson } from './dms_utils.js'

// ----------------------------------------------------
// -------------- Config Setup-------------------------
// ----------------------------------------------------
const authWrapper = Component => Component

const {
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
  const themes = (adminData[0]?.themes || []).reduce((out,curr) => {
     // console.log('theme curr', curr)
      out[curr?.name] = parseJson(curr?.theme || {})
      return out
  },{})
  const dmsConfig = getDmsConfig(
    request.headers.get('host'),
    request.body.path,
    patterns,
    themes
  )

  const data =  await dmsDataLoader(falcor, dmsConfig, `/${params['*'] || ''}`)
  console.log('dms_api - loader - data', data)
  console.timeEnd('loader data')

  return {
    host: request.headers.get('host'),
    data,
    patterns,
    themes
  }
}

export const action = async ({ request, params }) => {
  console.time(`dms-api action ${request.url}`)
  const form = await request.formData();
  const adminData =  await dmsDataLoader(falcor, adminSite, `/`)
  const patterns = adminData[0]?.patterns
  const themes = (adminData[0]?.themes || []).reduce((out,curr) => {
     // console.log('theme curr', curr)
      out[curr?.name] = parseJson(curr?.theme || {})
      return out
  },{})
  const dmsConfig = getDmsConfig(
    request.headers.get('host'),
    form.get("path"),
    patterns,
    themes
  )


  const requestType = form.get("requestType")
  const customConfig = form.get('dmsConfig')
  console.log('dms_api - action - request', form.get("path"), 'type', requestType, JSON.parse(customConfig))
  if(requestType === 'data') {
    const config = customConfig ? JSON.parse(customConfig) : dmsConfig
    console.log('dms api - data request- config', JSON.stringify(config, null,3),  JSON.parse(customConfig) ? 'custom' : 'default')

    const data = await dmsDataLoader(falcor,
      config,
      form.get("path")
    )
    console.log('dms api - data request- data', data.length)
    console.timeEnd(`dms-api action ${request.url}`)
    return {
      host: request.headers.get('host'),
      data,
      patterns,
      themes
    }
  }
  //return {}
  return await dmsDataEditor(falcor,
    customConfig ? JSON.parse(customConfig) : dmsConfig,
    JSON.parse(form.get("data")),
    requestType,
    form.get("path")
  )
  //console.log('dms-api - action - return', host, data.length, patterns.length)

};
