import React from 'react'
import { ThemeContext, getComponentTheme } from "../useTheme";

export default function LayoutGroup ({children, outerChildren, activeStyle}) {
  const { theme } = React.useContext(ThemeContext);
 // console.log('LayoutGroup', activeStyle)
  const layoutGrouptheme = getComponentTheme(theme, 'layoutGroup', activeStyle);

  // decorations: optional array of class strings rendered as empty spans inside
  // wrapper1 — purely decorative chrome (corner tiles, rails) a theme needs as
  // real elements once wrapper1's ::before/::after are already in use.
  const decorations = Array.isArray(layoutGrouptheme?.decorations) ? layoutGrouptheme.decorations : []

  return (
    <div className={`${layoutGrouptheme?.wrapper1}`}>
      {outerChildren}
      {decorations.map((cls, i) => (
        <span key={i} aria-hidden="true" className={cls} />
      ))}
      <div className={layoutGrouptheme?.wrapper2}>
        <div className={layoutGrouptheme?.wrapper3}>
          {children}
        </div>
      </div>
    </div>
  )
}
