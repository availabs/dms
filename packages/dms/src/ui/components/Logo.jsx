import React from 'react'
import { ThemeContext, getComponentTheme} from '../useTheme.js'
import { Link } from 'react-router'
import { logoTheme } from './Logo.theme'

export default function LogoComp (props) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};

  const theme = getComponentTheme(themeFromContext, 'logo', props.activeStyle)//{...themeFromContext, logo: {...logoTheme, ...(themeFromContext.logo || {})}};

  return (
    <Link to={theme?.linkPath} className={theme?.logoWrapper}>
      {theme?.img ?
        <div className={theme?.imgWrapper}>
          <img className={theme?.imgClass} src={theme?.img} />
        </div> :
        <div className={theme?.logoAltImg} />
      }
      {theme?.title && <div className={theme?.titleWrapper}>{theme?.title}</div> }
    </Link>
  )
}
