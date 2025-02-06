import React from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom'
import {Alert} from "../../ui/icons";

const navPages = [
  {name: 'Overview', href: ``, viewDependentPage: false},
  {name: 'Table', href: `table`, viewDependentPage: true},
  {name: 'Validate', href: `validate`, viewDependentPage: true},
  {name: 'Metadata', href: `metadata`, viewDependentPage: false},
  {name: 'Upload', href: `upload`, viewDependentPage: true},
  {name: 'Admin', href: `admin`, viewDependentPage: false},
]

const SourcesLayout = ({children, fullWidth, hideBreadcrumbs, hideNav, form, page, baseUrl, pageBaseUrl, id, views=[], view_id, showVersionSelector = false }) => {
    const navigate = useNavigate();
  return (
    <div className={`${fullWidth ? '' : 'max-w-6xl mx-72'} h-full flex flex-col`}>
      {hideBreadcrumbs ? '' :  <div className=''>
        <Breadcrumbs fullWidth={fullWidth} baseUrl={baseUrl} form={form} page={page} />
      </div> }

        <div className={'w-full flex justify-between'}>
            <Nav navPages={navPages} page={page} hideNav={hideNav} baseUrl={pageBaseUrl} id={id} view_id={view_id}/>
            {
                showVersionSelector ?
                    <select id={'version-selector'}
                            onChange={e => {
                                const pageUrl = page.href.replace(`/${view_id}`, '')
                                navigate(`${pageUrl}/${e.target.value}`)
                            }}
                            className={'w-fit p-1 rounded hover:bg-gray-100 bg-transparent'}
                            value={view_id}
                    >
                        <option key={'default'} value={undefined}>No version selected</option>
                        {views.map(view => <option key={view.id} value={view.id}>{view.name || view.id}</option>)}
                    </select> : null
            }
        </div>

        <div className='flex-1 flex flex-col'>
            {children}
        </div>
    </div>
  )
}

export default SourcesLayout

const Nav = ({baseUrl, navPages, page, hideNav, id, view_id}) => hideNav ? null : (
    <nav className={'w-full flex'}>
        {
            navPages.map(p => (
                <Link className={
                    `p-2 mx-1 font-display font-medium text-l text-slate-700
                    ${p.name === page.name ? 
                        `border-b-2 border-blue-600` : 
                        `hover:border-b-2 hover:border-gray-300`}`
                }
                  to={`${baseUrl}/${id}/${p.viewDependentPage ? `${p.href}/${view_id || ''}` : p.href}`}
                >
              <div className={'flex items-center'}><span className={'pr-0.5'}>{p.name}</span> {page.warn && p.name === page.name ? <Alert /> : ''}</div>
            </Link>))
      }
    </nav>
)
const Breadcrumbs = ({fullWidth, baseUrl, form, page}) => {
  const isListAll = false;

  return (
      <nav className="border-b border-gray-200 flex " aria-label="Breadcrumb">
        <ol className={`${fullWidth ? `w-full` : `max-w-screen-xl w-full mx-auto`}  px-4 flex space-x-4 sm:px-6 lg:px-8`}>
          <li className="flex">
            <div className="flex items-center">
              <Link to={`${baseUrl || '/'}${isListAll ? `/listall` : ``}`} className={"hover:text-[#bbd4cb] text-[#679d89]"}>
              <i className="fad fa-database flex-shrink-0 h-5 w-5" aria-hidden="true" />
              <span className="sr-only">Data Sources</span>
            </Link>
          </div>
        </li>
        {[form, page].filter(p => p).map((page,i) => (
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



