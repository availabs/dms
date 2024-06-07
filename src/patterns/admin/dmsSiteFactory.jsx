import React from 'react'
import {useFalcor} from '@availabs/avl-falcor'
import {dmsDataLoader, dmsPageFactory,} from '../../index'
import pageConfigNew from '../page/siteConfig'
import { Link } from 'react-router-dom'
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
export default async function dmsSiteFactory (
  dmsConfig,
  dmsPath='/',
  adminPath='/list',
  authWrapper = Component => Component,
  //dmsTheme = defaultTheme,
  API_HOST = 'https://graph.availabs.org'
) {
  const falcor = falcorGraph(API_HOST)
  let data = await dmsDataLoader(falcor, dmsConfig, `/`);
  //console.log('test 123', data)

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

        return ({
            ...dmsPageFactory(config({
                app: dmsConfig.app,
                // app: dmsConfig?.format?.app,
                // type: pattern.doc_type,
                type: pattern?.base_url?.replace(/\//g, ''),
                format: pattern?.config,
                theme: {
                    navOptions: {
                      logo: (<Link to='/' className='h-12 flex px-4 items-center'>LOGO</Link>),
                    }
                  },
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

