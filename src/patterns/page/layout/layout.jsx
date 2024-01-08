import React from 'react'
export const CMSContext = React.createContext(undefined);

export default function SiteLayout ({children, baseUrl='', ...props}) {
  const [open, setOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  
  return (
    <CMSContext.Provider value={{baseUrl, open, setOpen, historyOpen, setHistoryOpen}}>
      {children}
    </CMSContext.Provider>
  )
}