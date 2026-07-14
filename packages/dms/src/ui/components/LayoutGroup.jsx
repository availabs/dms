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

  // Background: optional component on the style, rendered inside wrapper1 before
  // the content wrappers — a live backdrop (canvas, texture) behind the whole
  // group. The component owns its own positioning (absolute inset-0, aria-hidden);
  // the style's wrapper1 supplies relative/overflow-hidden.
  const Background = layoutGrouptheme?.Background

  return (
    <div className={`${layoutGrouptheme?.wrapper1}`}>
      {outerChildren}
      {Background ? <Background /> : null}
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
