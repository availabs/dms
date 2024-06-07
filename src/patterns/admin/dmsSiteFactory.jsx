import React from 'react'
import {useFalcor} from '@availabs/avl-falcor'
import {dmsDataLoader, dmsPageFactory,} from '../../index'
import pageConfigNew from '../page/siteConfigSimple'
import formsConfig from '../forms/metaFormsconfig'
import defaultTheme from '../../theme/default-theme'

import {
  falcorGraph,
  FalcorProvider
} from "@availabs/avl-falcor"
import patternConfig from "./patternConfig";

const configs = {
  page: pageConfigNew,
  form: formsConfig
}
export default async function dmsSiteFactory (
  dmsConfig,
  dmsPath='/',
  adminPath='/list',
  authWrapper = Component => Component,
  dmsTheme = defaultTheme,
  API_HOST = 'https://graph.availabs.org'
) {
  const falcor = falcorGraph(API_HOST)
  let data = await dmsDataLoader(falcor, dmsConfig, `/`);
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
      const config = configs[pattern.pattern_type];
      return {
        ...dmsPageFactory(config({
          app: dmsConfig?.format?.app,
          type: pattern?.base_url?.replace(/\//g, ''),
          format: pattern?.config,
          logo: <div>LOGO</div>,
          useFalcor,
          rightMenu: <div>RIGHT</div>,
          baseUrl: pattern.base_url,
        }), authWrapper, dmsTheme, API_HOST),
        path: `${pattern.base_url}/*`,
      }
    }),
    ]
}

