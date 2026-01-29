import React from 'react';
import {Link} from 'react-router'
import {AdminContext} from "../../context";
import { ThemeContext } from '../../../../ui/useTheme';

import { PatternSettingsEditor } from "./default/settings";
import { PatternThemeEditor } from "./default/themeEditor";
import { PatternFilterEditor } from "./default/filterEditor";
import { PatternPermissionsEditor } from "./default/permissionsEditor";
// probably want to change this to register function for non default pages
import FormatManager from '../../../page/pages/manager/formatManager';

const Alert = () => <div>A</div>

const navPages = [
  {
    name: 'Overview',
    path: 'overview',
    component: PatternSettingsEditor
  },
  {
    name: 'Theme',
    path: `theme`,
    component: PatternThemeEditor
  },
  {
    name: 'Filters',
    path: `filters`,
    component: PatternFilterEditor
  },
  {
    name: 'Permissions',
    path: `permissions`,
    component: PatternPermissionsEditor
  }
]

const PatternEditor = ({params, item, format, attributes, apiUpdate, ...rest}) => {
  const { baseUrl, parentBaseUrl } = React.useContext(AdminContext);
  const [tmpItem, setTmpItem] = React.useState(item);
  const {id, page='overview'} = params;

  const pages = [...navPages, ...(item.pages || []), ...(item.pattern_type === 'page' ? [{path: 'edit_pattern', name: 'Format Manager', component: FormatManager}] : [])];
  const PageComp = pages.find(d => d.path === page)?.component || pages[0].component
    return (
      <div className={`h-full flex flex-col w-full`}>
        <Breadcrumbs baseUrl={baseUrl} parentBaseUrl={parentBaseUrl} pattern={item} page={page}/>
          <div className={'w-full flex justify-between'}>
            <Nav
              navPages={pages}
              page={page}
              baseUrl={baseUrl}
              id={id}
            />
          </div>
          <div className='flex-1 flex flex-col bg-white'>
            <PageComp
                app={item.app}
                type={item.type}
              value={tmpItem}
              onChange={(d) => d}
              attributes={attributes}
                apiUpdate={apiUpdate}
            />
          </div>
      </div>
    )
}

export default PatternEditor

const Nav = ({baseUrl, navPages, page, id}) =>  (
    <nav className={'w-full flex'}>
    {
      navPages
        .map(p => (
          <Link key={p.name} className={
                  `p-2 mx-1 font-display font-medium text-l text-slate-700
                  ${p.path.toLowerCase() === page ?
                      `border-b-2 border-blue-600` :
                      `hover:border-b-2 hover:border-gray-300`}`
              }
                to={`${baseUrl}/${id}/${p?.path}`}
              >
            <div className={'flex items-center'}>
              <span className={'pr-0.5'}>{p.name}</span>
              {/* {page.warn && p.name === page.name ? <Alert /> : ''}*/}
            </div>
          </Link>))
    }
    </nav>
)
const Breadcrumbs = ({baseUrl, parentBaseUrl, pattern, page}) => {
    const {UI} = React.useContext(AdminContext);
    const {Icon} = UI;

  return (
      <nav className="border-b border-gray-200 flex " aria-label="Breadcrumb">
        <ol className={`w-full px-4 flex space-x-4 sm:px-6 lg:px-8`}>
          <li className="flex">
            <div className="flex items-center">
              <Link to={`${parentBaseUrl || '/'}`} className={"hover:text-[#bbd4cb] text-[#679d89]"}>
                  <Icon icon={'Database'} className={"text-slate-400 hover:text-slate-500 size-4"} />
                  <span className="sr-only">Data Sources</span>
            </Link>
          </div>
        </li>
        {[pattern, page].filter(p => p).map((page,i) => (
          <li key={i} className="flex">
            <div className="flex items-center">
              <svg
                className="flex-shrink-0 w-6 h-full text-gray-300"
                viewBox="0 0 30 44"
                preserveAspectRatio="none"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d="M.293 0l22 22-22 22h1.414l22-22-22-22H.293z" />
              </svg>
              {page.path ?
                <Link
                  to={page.path}
                  className="ml-4 text-sm font-medium text-gray-500 hover:text-gray-700"
                  aria-current={page.current ? 'page' : undefined}
                >
                  {page.name}
                </Link> :
                <div
                  className="ml-4 text-sm font-medium text-gray-500 hover:text-gray-700"
                  aria-current={page.current ? 'page' : undefined}
                >
                  {page.name}
                </div>
              }
            </div>
          </li>
        ))}
      </ol>
    </nav>
  )
}
