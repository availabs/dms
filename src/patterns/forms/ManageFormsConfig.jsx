import React from 'react'
import {Link, useParams} from "react-router-dom"
import {pattern} from "../admin/admin.format.js"
import cloneDeep from 'lodash/cloneDeep'
import defaultTheme from '../page/layout/components/theme'
import ManageForms from "./components/ManageForms";
import ManageTemplates from "./components/ManageTemplates";

const Layout = ({children, title, baseUrl, format,...rest}) => {
  const params = useParams();
  const isTemplatePage = params['*']?.includes('templates');
  const link = isTemplatePage ? `${baseUrl}${params['*'].split('/templates')[0]}` :
      `${baseUrl}${params['*']}/templates`;
  const text = isTemplatePage ? 'Manage Form' : 'Manage Templates';

  return (
      <div className='h-screen w-screen py-6'>
        <div className='bg-white h-fit shadow max-w-6xl mx-auto px-6'>
          <div className='flex items-center'>
            <div className='w-full text-2xl p-3 font-thin flex-1 flex justify-between items-center'>
              <label>Manage</label>
              <Link className={'text-sm'} to={link}>{text}</Link>
            </div>
          </div>
          {children}
        </div>
      </div>
  )
}

// config to manage forms.
const adminConfig = ({ 
  app = "default-app",
  type = "default-type",
  sideNav = null,
  logo = null,
  rightMenu = <div />,
  baseUrl = '/',
  checkAuth = () => {},
  theme = defaultTheme,
  API_HOST = 'https://graph.availabs.org'
}) => {
  theme = theme || defaultTheme
  const format = cloneDeep(pattern)
  format.app = app
  format.type = type
 //console.log('pattern config. testing to edit patterns', format, app ,type)
  return {
    format: format,
    baseUrl,
    API_HOST,
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
            type: props => <ManageForms.EditComp {...props} manageTemplates />,
            action: 'edit',
            path: `:id/templates`
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