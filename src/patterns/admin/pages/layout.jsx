import React from 'react';
import {Link} from 'react-router'
import {AdminContext} from "../context";

const Alert = () => <div>A</div>

const navPages = [
  {name: 'Overview', href: ``},
  {name: 'Filters', href: `filters`},
  {name: 'Permissions', href: `permissions`},
]

const AdminLayout = ({children, hideBreadcrumbs, hideNav, pattern={}, page={}, id, additionalNavItems=[]}) => {
    const {baseUrl, parentBaseUrl, ...rest} = React.useContext(AdminContext);
    console.log('admin context', baseUrl, parentBaseUrl, rest)
    return (
    <div className={`h-full flex flex-col max-w-7xl mx-auto`}>
        {hideBreadcrumbs ? '' :  <div className=''>
            <Breadcrumbs baseUrl={baseUrl} parentBaseUrl={parentBaseUrl} pattern={pattern} page={page}/>
        </div> }

        <div className={'w-full flex justify-between'}>
            <Nav navPages={navPages} page={page} hideNav={hideNav} baseUrl={baseUrl} id={id} additionalNavItems={additionalNavItems}/>
        </div>

        <div className='flex-1 flex flex-col bg-white'>
            {children}
        </div>
    </div>
  )
}

export default AdminLayout

const Nav = ({baseUrl, navPages, page, hideNav, id, additionalNavItems}) => hideNav ? null : (
    <nav className={'w-full flex'}>
        {
            [...navPages, ...additionalNavItems]
                .map(p => (
                    <Link className={
                        `p-2 mx-1 font-display font-medium text-l text-slate-700
                        ${p.name.toLowerCase() === page.name ? 
                            `border-b-2 border-blue-600` : 
                            `hover:border-b-2 hover:border-gray-300`}`
                    }
                      to={`${baseUrl}/${id}/${p.href}`}
                    >
                  <div className={'flex items-center'}><span className={'pr-0.5'}>{p.name}</span> {page.warn && p.name === page.name ? <Alert /> : ''}</div>
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
              {page.href ? 
                <Link
                  to={page.href}
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



