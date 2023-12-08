import React from 'react'

export const CMSContext = React.createContext(undefined);

// const theme = {
//   layout: {
//     page: 'h-full w-full bg-slate-100 flex flex-col',
//     container: 'w-full flex-1 flex flex-col',
//   },
//   navPadding: {
//     1: 'pt-0 ',
//     2: 'md:pt-12 pt-0',
//     3: 'md:pt-24 pt-0'
//   }
// }

export default function SiteLayout ({children, baseUrl='', ...props}) {
  const [open, setOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  // console.log('layout',props.user)
  
  return (
    <CMSContext.Provider value={{baseUrl, open, setOpen, historyOpen, setHistoryOpen}}>
      {children}
    </CMSContext.Provider>
  )
}