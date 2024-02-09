import React from 'react'
export const CMSContext = React.createContext(undefined);

export default function SiteLayout ({children, theme, baseUrl='', user, ...props}) {
  return (
    <CMSContext.Provider value={{baseUrl, user, theme}}>
      {children}
    </CMSContext.Provider>
  )
}