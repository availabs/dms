import React, {useEffect} from 'react'
import { useParams } from "react-router-dom";
import {useFalcor} from '@availabs/avl-falcor'
import {
  DmsManager,
  dmsDataLoader,
  dmsDataEditor, dmsPageFactory, pageConfigNew,
} from './index'

import defaultTheme from './theme/default-theme'

import {
  falcorGraph,
  FalcorProvider
} from "@availabs/avl-falcor"
//const noAuth = Component => Component

export default async function dmsSiteFactory (
  dmsConfig,
  dmsPath='/',
  authWrapper = Component => Component,
  dmsTheme = defaultTheme,
  API_HOST = 'https://graph.availabs.org'
) {
  console.log('dmsconf', dmsConfig)
  //const {falcor, falcorCache} = useFalcor()
  const falcor = falcorGraph(API_HOST)
  let data = await dmsDataLoader(falcor, dmsConfig, `/`);
  const patterns = data.reduce((acc, curr) => [...acc, ...curr.patterns], []) || [];

  // call dmsPageFactory here asuming patterns are page type
  // export multiple routes based on patterns.
  return patterns.map(pattern => ({
    ...dmsPageFactory(pageConfigNew({
      app: dmsConfig.app,
      type: pattern.base_url.replace('/', ''),
      logo: <div>LOGO</div>,
      useFalcor,
      rightMenu: <div>RIGHT</div>,
      baseUrl: pattern.base_url,
    }), authWrapper, dmsTheme, API_HOST),
    path: `${pattern.base_url}/*`,
    // element: (props) =>  <DMS {...props} />
  }))
}

