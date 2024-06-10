import React from 'react'
import {pattern} from "./admin.format.js"
import cloneDeep from 'lodash/cloneDeep'
import defaultTheme from '../page/layout/components/theme'
import ManageForms from "../forms/components/ManageForms";

const Layout = ({children, title, baseUrl, format,...rest}) => {
  // const params = useParams();

  return (
      <div className='h-screen w-screen py-6'>
        <div className='bg-white h-fit shadow max-w-6xl mx-auto px-6'>
          <div className='flex items-center'>
            <div className='text-2xl p-3 font-thin flex-1'>Manage</div>
          </div>
          {children}
        </div>
      </div>
  )
}

// config to manage forms.
const adminConfig = ({ 
  app = "dms-site",
  type = "docs-page",
  sideNav = null,
  logo = null,
  rightMenu = <div />,
  baseUrl = '/',
  checkAuth = () => {},
  theme = defaultTheme
}) => {
  theme = theme || defaultTheme
  const format = cloneDeep(pattern)
  format.app = app
  format.type = type
  console.log('pattern config. testing to edit patterns', format)
  return {
    format: format,
    baseUrl,
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
        type: (props) => {
          return (
              <Layout
                  {...props}
                  baseUrl={baseUrl}
                  theme={theme}
              />
          )
        },
        action: "list",
        path: "/*",
        children: [
          {
            type: props => <ManageForms.EditComp {...props} />,
            action: 'edit',
            path: `:id`
          },
          {
            type: props => <ManageForms.ViewComp {...props} />,
            action: 'view',
            path: `view/:id`
          }
        ]
      }
    ]
  }
}

export default adminConfig