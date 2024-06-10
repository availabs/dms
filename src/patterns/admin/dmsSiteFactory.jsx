import React from 'react'
import {useFalcor} from '@availabs/avl-falcor'
import {dmsDataLoader, dmsPageFactory,} from '../../index'
import pageConfigNew from '../page/siteConfig'
import { Link } from 'react-router-dom'
import defaultTheme from '../page/theme/theme'

import {
  falcorGraph,
  FalcorProvider
} from "@availabs/avl-falcor"

export default async function dmsSiteFactory({
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
    ...patterns.map(pattern => {
      return ({
        ...dmsPageFactory(pageConfigNew({
          app: dmsConfig.app,
          type: pattern.doc_type,
          theme,
          useFalcor,
          API_HOST,
          //rightMenu: <div>RIGHT</div>,
          baseUrl: pattern.base_url,
        }), authWrapper),
        //path: `${pattern.base_url}/*`,
      })
    })
  ]
}

