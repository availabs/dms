import React from 'react'
import { ThemeContext, getComponentTheme } from "../useTheme";

export default function LayoutGroup ({children, outerChildren, activeStyle}) {
  const { theme } = React.useContext(ThemeContext);
 // console.log('LayoutGroup', activeStyle)
  const layoutGrouptheme = getComponentTheme(theme, 'layoutGroup', activeStyle);

  return (
    <div className={`${layoutGrouptheme?.wrapper1}`}>
      {outerChildren}
      <div className={layoutGrouptheme?.wrapper2}>
        <div className={layoutGrouptheme?.wrapper3}>
          {children}
        </div>
      </div>
    </div>
  )
}
