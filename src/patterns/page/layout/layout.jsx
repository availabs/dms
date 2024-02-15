import React from 'react'
export const CMSContext = React.createContext(undefined);

const defaultUser = { email: "user", authLevel: 5}

export default function SiteLayout ({children, theme, baseUrl='', user=defaultUser, ...props}) {
  console.log('layout', user)
  return (
    <CMSContext.Provider value={{baseUrl, user, theme}}>
      {children}
    </CMSContext.Provider>
  )
}