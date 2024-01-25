import PageView from "./layout/view"
import PageEdit from "./layout/edit"

import Layout from "./layout/layout"
import cmsFormat from "./page.format.js"
import cloneDeep from 'lodash/cloneDeep'
import {Search} from "./search";

// sideNav = {size: 'miniPad'}

const siteConfig = ({ 
  app = "dms-site",
  type = "docs-page",
  sideNav = null,
  logo = null,
  rightMenu = <div />,
  baseUrl = '/',
  checkAuth = () => {}
}) => {
  // console.log('run config')
  const format = cloneDeep(cmsFormat)
  format.app = app
  format.type = type

  const rightMenuWithSearch = (
      <div className={'flex flex-col md:flex-row'}>
        {/*<Search app={app} type={type}/>*/}
        {rightMenu}
      </div>
  )

  // const rightMenuWithSearch = rightMenu; // for live site
  return {
    format: format,
    check: ({user}, activeConfig, navigate) =>  {
      const getReqAuth = (configs) => {
        return configs.reduce((out,config) => {
          let authLevel = config.authLevel || -1
          if(config.children) {
            authLevel = Math.max(authLevel, getReqAuth(config.children))
          }
          return Math.max(out, authLevel)
        },-1)
      } 
      let requiredAuth = getReqAuth(activeConfig)
      checkAuth({user, authLevel:requiredAuth}, navigate)
    },
    children: [
      { 
        type: (props) => (
          <Layout 
            {...props}
            baseUrl={baseUrl}
          />
        ),
        action: "list",
        path: "/*",
        filter: {
          mainNav: true, 
          attributes:['title', 'index', 'url_slug', 'parent','published', 'hide_in_nav']
        },
        children: [
          { 
            type: (props) => <PageView 
              {...props} 
              logo={logo} 
              rightMenu={rightMenuWithSearch}
            />,
            filter: {
              attributes:['title', 'index', 'url_slug', 'parent', 'published', 'hide_in_nav' ,'sections','sidebar','header','footer', 'full_width']
            },
            path: "/*",
            action: "view"
          },
        ]
      },
      { 
        type: (props) => (
          <Layout 
            {...props} 
            edit={true} 
            baseUrl={baseUrl}
          />
        ),
        action: "list",
        path: "/edit/*",
        authLevel: 5,
        filter: {
          mainNav: true, 
          attributes:['title', 'index', 'url_slug', 'parent', 'published', 'hide_in_nav' ]
        },
        children: [
          { 
            type: (props) => <PageEdit 
              {...props}
              logo={logo}
              rightMenu={rightMenuWithSearch}
            />,
            action: "edit",
            path: "/edit/*"
          },
        ]
      }
    ]
  }
}

export default siteConfig