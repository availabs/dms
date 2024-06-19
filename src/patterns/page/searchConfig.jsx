import React from 'react'
import cloneDeep from 'lodash/cloneDeep'
import defaultTheme from './theme/theme'
import merge from 'lodash/merge'
import {SearchPage} from "./components/search/SearchPage";
export const SearchContext = React.createContext(undefined);

const siteConfig = ({
  app = "dms-site",
  type = "docs-page",
  useFalcor,
  rightMenu = <div />,
  baseUrl = '',
  checkAuth = () => {},
  authLevel = -1,
  theme = defaultTheme,
  pgEnv,
    API_HOST
}) => {
  theme = merge(defaultTheme, theme)
  baseUrl = baseUrl[0] === '/' ? baseUrl.slice(1) : baseUrl

  const format = {
    app,
    type,
    attributes: [{ key: "title",
      type: "text",
      required: true,
      default: "New Page"
    }]
  }

  const defaultUser = { email: "user", authLevel: 5, authed: true}

  // const rightMenuWithSearch = rightMenu; // for live site

  return {
    format: format,
    baseUrl,
    API_HOST,
    children: [
      {
        type: ({children, user=defaultUser, pgEnv, ...props}) => {
          const { falcor, falcorCache } = useFalcor();
          // console.log('hola', theme, props)
          return (
            <SearchContext.Provider value={{baseUrl, user, theme, falcor, falcorCache, pgEnv, app, type}}>
              {children}
            </SearchContext.Provider>
          )
        },
        authLevel,
        action: "list",
        path: "/*",
        children: [
          {
            type: (props) => <SearchPage {...props} />,
            path: "/*",
            action: "view"
          }
        ]
      },

    ]
  }
}

export default siteConfig