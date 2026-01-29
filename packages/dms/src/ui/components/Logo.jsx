import React from 'react'
import { ThemeContext, getComponentTheme} from '../useTheme.js'
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
