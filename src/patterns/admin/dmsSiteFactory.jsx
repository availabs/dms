import React from 'react'
import {useFalcor} from '@availabs/avl-falcor'
import {dmsDataLoader, dmsPageFactory,} from '../../index'
import pageConfigNew from '../page/siteConfig'
import { Link } from 'react-router-dom'
import defaultTheme from '../page/theme/theme'
import formsConfig from '../forms/metaFormsconfig'
import patternConfig from "./patternConfig";

import {
  falcorGraph,
  FalcorProvider
} from "@availabs/avl-falcor"

const configs = {
  page: pageConfigNew,
  form: formsConfig
}
export default async function dmsSiteFactory ({
  dmsConfig,
  adminPath='/list',
  authWrapper = Component => Component,
  theme = defaultTheme,
  API_HOST = 'https://graph.availabs.org'
}) {
  const falcor = falcorGraph(API_HOST)
  let data = await dmsDataLoader(falcor, dmsConfig, `/`);
  console.log('test 123', dmsConfig, theme)

  const patterns = data.reduce((acc, curr) => [...acc, ...curr.patterns], []) || [];

  // call dmsPageFactory here assuming patterns are page type
  // export multiple routes based on patterns.

  return [
    dmsPageFactory({...dmsConfig, baseUrl: adminPath}),

      dmsPageFactory({
          ...patternConfig({
              app: 'dms-site',
              type: 'pattern',
              baseUrl: '/manage_pattern/'
          }),
          baseUrl: '/manage_pattern'
      }),

    ...patterns.map(pattern => {

        console.log('dmsSiteFactory', pattern, dmsConfig, "app: ",  dmsConfig?.format?.app || dmsConfig.app, "type:",pattern.doc_type || pattern?.base_url?.replace(/\//g, ''),)
        const config = configs[pattern.pattern_type];

        return ({
            ...dmsPageFactory(
              config({
                app: dmsConfig?.format?.app || dmsConfig.app,
                // type: pattern.doc_type,
                type: pattern.doc_type || pattern?.base_url?.replace(/\//g, ''),
                format: pattern?.config,
                theme,
                useFalcor,
                API_HOST,
                baseUrl: pattern.base_url
              }), 
              authWrapper
            )
        //path: `${pattern.base_url}/*`,
      })
    })

  ]
}

