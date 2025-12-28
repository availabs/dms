import React from 'react'
import { ThemeContext, getComponentTheme } from "../useTheme";


export const layoutGroupTheme = {
  edit: 'default',
  options: {
    activeStyle: 0
  },
  styles: [
     {
      name: "default",
      wrapper1: 'w-full h-full flex-1 flex flex-row p-2', // inside page header, wraps sidebar
      wrapper2: 'flex flex-1 w-full  flex-col  shadow-md bg-white rounded-lg relative text-md font-light leading-7 p-4 h-full min-h-[200px]', // content wrapepr
      sideNavContainer1: 'hidden',
      sideNavContainer2: 'hidden',
    },
    {
      name: "header",
      wrapper1: 'w-full h-full flex-1 flex flex-row', // inside page header, wraps sidebar
      wrapper2: 'flex flex-1 w-full  flex-col  relative min-h-[200px]', // content wrapepr
      wrapepr3: ''
    }
  ]
}

export default function LayoutGroup ({children, outerChildren, activeStyle=0}) {
  const { theme: fullTheme } = React.useContext(ThemeContext);
  const theme = getComponentTheme(fullTheme, 'layoutGroup', activeStyle);

  return (
    <div className={`${theme?.wrapper1}`}>
      {outerChildren}
      <div className={theme?.wrapper2}>
        <div className={theme?.wrapper3}>
          {children}
        </div>
      </div>
    </div>
  )
}
