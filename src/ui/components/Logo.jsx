import React from 'react'
import { ThemeContext } from '../useTheme.js'
import { Link } from 'react-router'

export const logoTheme = {
  logoWrapper: 'h-12 flex px-4 items-center',
  logoAltImg: 'rounded-full h-8 w-8 bg-blue-500 border-2 border-blue-300 hover:bg-blue-600',
  imgWrapper: '',
  img: '',
  imgClass: 'min-h-12',
  titleWrapper: 'p-2',
  title: 'Admin',
  linkPath: '/'
}

export const logoSettings =  [{
  label: "Logo",
  type: 'inline',
  controls: Object.keys(logoTheme)
      .map(k => {
        return {
          label: k,
          type: 'Textarea',
          path: `logo.${k}`
        }
      })
}]

export const docs = [
  {type: 'default',doc_name: 'Default Logo'},
]

export default function LogoComp (props) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const theme = {...themeFromContext, logo: {...logoTheme, ...(themeFromContext.logo || {})}};

  return (
    <Link to={theme?.logo?.linkPath} className={theme?.logo?.logoWrapper}>
      {theme?.logo?.img ?
        <div className={theme?.logo?.imgWrapper}>
          <img className={theme?.logo?.imgClass} src={theme?.logo?.img} />
        </div> :
        <div className={theme.logo.logoAltImg} />
      }
      {theme?.logo?.title && <div className={theme.logo.titleWrapper}>{theme.logo.title}</div> }
    </Link>
  )
}
