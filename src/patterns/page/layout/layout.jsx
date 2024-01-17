import React from 'react'
export const CMSContext = React.createContext(undefined);

export default function SiteLayout ({children, baseUrl='',user, ...props}) {
  return (
    <CMSContext.Provider value={{baseUrl, user}}>
      {children}
    </CMSContext.Provider>
  )
}