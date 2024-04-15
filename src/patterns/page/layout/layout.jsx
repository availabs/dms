import React from 'react'
import {CMSContext} from '../siteConfig'

// for instances without auth turned on can edit
// should move this to dmsFactory default authWrapper
const defaultUser = { email: "user", authLevel: 5}

export default function SiteLayout ({children, theme, baseUrl='', useFalcor, user=defaultUser, pgEnv, ...props}) {
  const { falcor, falcorCache } = useFalcor();
  return (
    <CMSContext.Provider value={{baseUrl, user, theme, falcor, falcorCache, pgEnv}}>
      {children}
    </CMSContext.Provider>
  )
}