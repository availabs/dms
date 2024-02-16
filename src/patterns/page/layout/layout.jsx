import React from 'react'
export const CMSContext = React.createContext(undefined);

// for instances without auth turned on can edit
// should move this to dmsFactory default authWrapper
const defaultUser = { email: "user", authLevel: 5}

export default function SiteLayout ({children, theme, baseUrl='', user=defaultUser, ...props}) {
  return (
    <CMSContext.Provider value={{baseUrl, user, theme}}>
      {children}
    </CMSContext.Provider>
  )
}